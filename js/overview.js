'use strict';
// מסך "סקירה": משימות, יום ליווי, נקודות לזכור ותמונת נתונים — נאסף מכל היומן, בלי בינה מלאכותית.
// הנתונים מתארים את עבודת הליווי, לא מדרגים מחנכות.
(function (App) {
  const { h } = App;
  const V = (App.views = App.views || {});

  // שדות שכל שורה בהם היא משימה
  const TASK_FIELDS = { personal: ['nextSteps'], group: ['nextSteps'], meeting: ['nextSteps'], update: ['followUp'] };
  const lines = (txt) => (txt || '').split('\n').map((l) => l.replace(/^\s*(?:[-–•*]|\d+[.)])\s*/, '').trim()).filter(Boolean);
  const daysAgo = (n) => App.todayISO(-n);

  V.overview = async () => {
    const [records, teachers, contacts, schools, themes] = await Promise.all([
      App.store.records(), App.store.teachers(), App.store.contacts(), App.store.schools(), App.getThemes()]);
    let manual = await App.settings.get('tasks', []);
    const tMap = Object.fromEntries(teachers.map((t) => [t.id, t]));
    const cMap = Object.fromEntries(contacts.map((c) => [c.id, c]));
    const sMap = Object.fromEntries(schools.map((s) => [s.id, s]));
    const fileCounts = await App.fileCounts();
    const today = App.todayISO();
    const whoOf = (r) => [...r.teacherIds.map((id) => tMap[id]), ...(r.contactIds || []).map((id) => cMap[id])]
      .filter(Boolean).map((x) => x.name).join(', ') || (sMap[r.schoolId] || {}).name || '';
    const item = (r) => App.recordItem(r, { tMap, cMap, fileCounts, showTeacher: true });

    // ---- משימות ----
    const recordTasks = () => {
      const out = [];
      for (const r of records) for (const f of TASK_FIELDS[r.type] || []) for (const text of lines((r.data || {})[f])) {
        const key = f + ':' + text;
        out.push({ text, done: (r.doneTasks || []).includes(key), rec: r, key, date: App.recDate(r) });
      }
      return out.sort((a, b) => b.date.localeCompare(a.date));
    };
    const toggleRecTask = async (t, done) => {
      const s = new Set(t.rec.doneTasks || []);
      done ? s.add(t.key) : s.delete(t.key);
      t.rec.doneTasks = [...s];
      await App.store.save('records', t.rec);
    };
    const saveManual = () => App.settings.set('tasks', manual);

    const userName = (App.state.user && App.state.user.displayName) || '';
    const p = App.page({ title: 'סקירה', sub: userName ? 'שלום, ' + userName.split(' ')[0] : null });
    const pane = h('div', { class: 'ov-pane' });
    let tab = App.state.ovTab || 'tasks';

    // ספירות לכפתורים
    const counts = () => {
      const openTasks = recordTasks().filter((t) => !t.done).length + manual.filter((t) => !t.done).length;
      return { tasks: openTasks, day: records.filter((r) => App.recDate(r) === today).length, remember: rememberData().total };
    };
    const tabs = h('div', { class: 'ov-tabs', role: 'tablist' });
    const drawTabs = () => {
      const c = counts();
      App.fill(tabs, [
        ['tasks', '✅', 'משימות לביצוע', c.tasks ? c.tasks + ' פתוחות' : 'אין משימות פתוחות'],
        ['remember', '📌', 'לזכור', c.remember ? c.remember + ' נקודות' : 'הכול מעודכן'],
        ['day', '📅', 'יום ליווי', c.day ? c.day + ' תיעודים היום' : 'סיכום לפי תאריך'],
        ['data', '📊', 'תמונת נתונים', 'מה קרה בתקופה'],
      ].map(([k, icon, label, sub]) => h('button', {
        type: 'button', role: 'tab', class: 'ov-tab' + (tab === k ? ' on' : ''), 'aria-selected': String(tab === k),
        onclick: () => { tab = App.state.ovTab = k; drawTabs(); drawPane(); },
      }, h('span', { class: 'ov-icon' }, icon), h('span', { class: 'ov-label' }, label), h('span', { class: 'ov-sub' }, sub))));
    };

    // ---------- משימות ----------
    function drawTasks() {
      const all = recordTasks();
      const input = h('input', { type: 'text', placeholder: 'משימה חדשה…', 'aria-label': 'משימה חדשה' });
      const add = async () => {
        const text = input.value.trim(); if (!text) return;
        manual.unshift({ id: App.uid(), text, done: false, createdAt: new Date().toISOString() });
        await saveManual(); drawTasks(); drawTabs();
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
      const row = (text, done, onToggle, meta) => {
        const cb = h('input', { type: 'checkbox', checked: done, 'aria-label': 'בוצע' });
        cb.addEventListener('change', async () => { await onToggle(cb.checked); drawTasks(); drawTabs(); });
        return h('div', { class: 'task' + (done ? ' done' : '') }, cb, h('div', { class: 'task-body' }, h('div', { class: 'task-text' }, text), meta));
      };
      const recRow = (t) => row(t.text, t.done, (v) => toggleRecTask(t, v),
        h('a', { class: 'task-src', href: '#/r/' + t.rec.id }, App.RECORD_TYPES[t.rec.type].icon + ' ' + whoOf(t.rec) + ' · ' + App.fmtDate(t.date)));
      const manRow = (m) => row(m.text, m.done, async (v) => { m.done = v; m.doneAt = v ? new Date().toISOString() : null; await saveManual(); },
        h('span', { class: 'task-src' }, 'משימה אישית · ', h('button', { type: 'button', class: 'linklike', onclick: async () => {
          if (!(await App.confirm('למחוק את המשימה?', { ok: 'מחיקה', danger: true }))) return;
          manual = manual.filter((x) => x.id !== m.id); await saveManual(); drawTasks(); drawTabs();
        } }, 'מחיקה')));
      const open = [...manual.filter((m) => !m.done).map(manRow), ...all.filter((t) => !t.done).map(recRow)];
      const done = [...manual.filter((m) => m.done).map(manRow), ...all.filter((t) => t.done).map(recRow)];
      App.fill(pane,
        h('p', { class: 'hint' }, 'המשימות נאספות מ"צעדים להמשך" ומ"לבירור" בכל התיעודים. כל שורה היא משימה.'),
        h('div', { class: 'row gap' }, input, h('button', { type: 'button', class: 'btn', onclick: add }, 'הוספה')),
        open.length ? h('div', { class: 'tasks' }, open) : App.empty('אין משימות פתוחות. 🌿'),
        done.length ? h('details', { class: 'done-list' }, h('summary', null, `בוצעו (${done.length})`), h('div', { class: 'tasks' }, done)) : null);
    }

    // ---------- לזכור ----------
    function rememberData() {
      const goals = records.filter((r) => r.type === 'goal' && r.data.reviewDate && !['הושג', 'הוקפא'].includes(r.data.status) && r.data.reviewDate <= App.todayISO(14))
        .sort((a, b) => a.data.reviewDate.localeCompare(b.data.reviewDate));
      const drafts = records.filter((r) => r.status === 'draft').sort((a, b) => App.recDate(b).localeCompare(App.recDate(a)));
      const questions = [];
      for (const r of records) if (r.type === 'observation' && App.recDate(r) >= daysAgo(60))
        for (const e of r.entries || []) if (e.kind === 'question') questions.push({ e, r });
      questions.sort((a, b) => b.e.ts.localeCompare(a.e.ts));
      const last = {};
      for (const r of records) for (const tid of r.teacherIds) { const d = App.recDate(r); if (!last[tid] || d > last[tid]) last[tid] = d; }
      const quiet = teachers.filter((t) => !last[t.id] || last[t.id] < daysAgo(21)).sort((a, b) => (last[a.id] || '').localeCompare(last[b.id] || ''));
      return { goals, drafts, questions, quiet, last, total: goals.length + drafts.length + Math.min(questions.length, 10) };
    }
    function drawRemember() {
      const d = rememberData();
      const block = (title, hint, content, emptyText) => App.section(title, hint ? h('p', { class: 'hint' }, hint) : null, content || h('p', { class: 'muted small' }, emptyText));
      App.fill(pane,
        block('🎯 יעדים לבחינה מחדש', 'יעדים שמועד הבחינה שלהם עבר או מגיע בשבועיים הקרובים.',
          d.goals.length ? h('div', { class: 'timeline' }, d.goals.map((r) => h('div', null,
            h('div', { class: 'small ' + (r.data.reviewDate < today ? 'warn-text' : 'muted') }, (r.data.reviewDate < today ? '⚠ עבר המועד: ' : 'מועד: ') + App.fmtDate(r.data.reviewDate)),
            item(r)))) : null, 'אין יעדים שמחכים לבחינה.'),
        block('📝 טיוטות פתוחות', null, d.drafts.length ? h('div', { class: 'timeline' }, d.drafts.map(item)) : null, 'אין טיוטות פתוחות.'),
        block('❓ שאלות שנרשמו בתצפיות', 'מחודשיים האחרונים — שווה לחזור אליהן.',
          d.questions.length ? h('div', { class: 'entries' }, d.questions.slice(0, 10).map(({ e, r }) => h('a', { class: 'entry k-question q-link', href: '#/r/' + r.id },
            h('div', { class: 'entry-top' }, h('span', { class: 'entry-time' }, App.fmtDate(App.recDate(r))), h('span', { class: 'muted small' }, whoOf(r))),
            h('div', { class: 'entry-text' }, e.text)))) : null, 'אין שאלות פתוחות מהתקופה האחרונה.'),
        block('🕰 מחנכות שלא תועד איתן מפגש ב־3 השבועות האחרונים', null,
          d.quiet.length ? h('div', { class: 'chips wrap' }, d.quiet.map((t) => h('a', { class: 'chip', href: '#/t/' + t.id },
            t.name + (d.last[t.id] ? ' · ' + App.fmtDate(d.last[t.id]) : ' · עוד אין תיעוד')))) : null, 'עם כל המחנכות היה מפגש לאחרונה.'));
    }

    // ---------- יום ליווי ----------
    const dates = [...new Set(records.map(App.recDate))].sort();
    let day = App.state.ovDay || [...dates].reverse().find((x) => x <= today) || today;
    function drawDay() {
      const list = records.filter((r) => App.recDate(r) === day).sort((a, b) => ((a.data || {}).time || '').localeCompare((b.data || {}).time || ''));
      const prev = [...dates].reverse().find((x) => x < day), next = dates.find((x) => x > day);
      const go = (x) => { day = App.state.ovDay = x; drawDay(); };
      const input = h('input', { type: 'date', value: day, 'aria-label': 'תאריך' });
      input.addEventListener('change', () => input.value && go(input.value));
      const bySchool = {};
      for (const r of list) (bySchool[r.schoolId || ''] = bySchool[r.schoolId || ''] || []).push(r);
      App.fill(pane,
        h('div', { class: 'day-nav' },
          h('button', { type: 'button', class: 'btn small', disabled: !prev, onclick: () => go(prev), 'aria-label': 'יום ליווי קודם' }, '→ הקודם'),
          input,
          h('button', { type: 'button', class: 'btn small', disabled: !next, onclick: () => go(next), 'aria-label': 'יום ליווי הבא' }, 'הבא ←')),
        h('h2', { class: 'section-title mt' }, App.fmtDate(day)),
        list.length ? h('p', { class: 'muted small' }, `${list.length} תיעודים · ${Object.keys(bySchool).length} בתי ספר`) : null,
        list.length ? Object.entries(bySchool).map(([sid, rs]) => [h('h3', { class: 'tl-month' }, (sMap[sid] || {}).name || 'ללא בית ספר'), h('div', { class: 'timeline' }, rs.map(item))])
          : App.empty('אין תיעודים בתאריך הזה. אפשר לעבור ליום ליווי קודם.'),
        h('p', { class: 'note mt' }, 'בהמשך: כפתור "סיכום במילים" שיכתוב סיכום של יום הליווי (דורש חיבור לבינה מלאכותית).'));
    }

    // ---------- תמונת נתונים ----------
    let range = App.state.ovRange || '30';
    function bars(rows) {
      const max = Math.max(1, ...rows.map((r) => r[1]));
      return h('div', { class: 'bars' }, rows.map(([label, n]) => h('div', { class: 'bar-row', title: `${label}: ${n}` },
        h('span', { class: 'bar-label' }, label),
        h('span', { class: 'bar-track' }, n ? h('span', { class: 'bar-fill', style: { width: (n / max) * 100 + '%' } }) : null),
        h('span', { class: 'bar-val' }, n))));
    }
    function drawData() {
      const from = range === 'all' ? '' : daysAgo(Number(range));
      const rs = records.filter((r) => App.recDate(r) >= from && r.status !== 'draft');
      const cnt = (pred) => rs.filter(pred).length;
      const met = new Set(rs.flatMap((r) => r.teacherIds));
      const rangeChips = h('div', { class: 'chips scroll' }, [['30', '30 הימים האחרונים'], ['90', '3 חודשים'], ['all', 'הכול']].map(([k, l]) =>
        h('button', { type: 'button', class: 'chip' + (range === k ? ' on' : ''), onclick: () => { range = App.state.ovRange = k; drawData(); } }, l)));
      const stat = (n, label) => h('div', { class: 'stat' }, h('div', { class: 'stat-n' }, n), h('div', { class: 'stat-l' }, label));
      const themeRows = themes.filter((t) => t.active !== false).map((t) => [t.title, cnt((r) => App.recThemes(r).includes(t.id))]).sort((a, b) => b[1] - a[1]);
      App.fill(pane,
        rangeChips,
        h('div', { class: 'stats' },
          stat(rs.length, 'תיעודים'),
          stat(cnt((r) => r.type === 'observation' || r.type === 'event'), 'תצפיות'),
          stat(cnt((r) => ['personal', 'group', 'meeting'].includes(r.type)), 'פגישות'),
          stat(`${met.size}/${teachers.length}`, 'מחנכות שהיה איתן מפגש')),
        rs.length ? [
          App.section('לפי סוג תיעוד', bars(Object.entries(App.RECORD_TYPES).map(([k, v]) => [v.label, cnt((r) => r.type === k)]).filter(([, n]) => n))),
          App.section('לפי בית ספר', bars(schools.map((s) => [s.name.replace(/^בית הספר /, ''), cnt((r) => r.schoolId === s.id)]).sort((a, b) => b[1] - a[1]))),
          App.section('עוגני פעולה', h('p', { class: 'hint' }, 'כמה תיעודים קשורים לכל עוגן (תיעוד יכול להיות קשור לכמה).'),
            bars(App.ANCHORS.map((a) => [a.label, cnt((r) => (r.anchors || []).includes(a.id))]))),
          App.section('תמות התבוננות', h('p', { class: 'hint' }, 'גם תמות שכמעט לא מופיעות הן מידע — אולי שווה להתבונן בהן.'), bars(themeRows)),
        ] : App.empty('אין תיעודים גמורים בתקופה הזו.'),
        h('p', { class: 'note mt' }, 'הנתונים מתארים את עבודת הליווי — לא מדד להערכת מחנכות. טיוטות לא נספרות.'));
    }

    const drawPane = () => ({ tasks: drawTasks, remember: drawRemember, day: drawDay, data: drawData })[tab]();
    drawTabs(); drawPane();
    p.body.append(App.localBanner(), tabs, pane);
    return p.root;
  };
})(window.App);
