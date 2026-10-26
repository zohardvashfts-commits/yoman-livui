'use strict';
// תיעודים: יצירה, עריכה (עם שמירה אוטומטית) וצפייה.
(function (App) {
  const { h } = App;
  const V = (App.views = App.views || {});

  // ---------- יצירת תיעוד חדש ----------
  V.newRecord = async ([type], q) => {
    if (!App.RECORD_TYPES[type]) return App.notFound('סוג תיעוד לא מוכר');
    const tid = q.get('t'), cid = q.get('c');
    const t = tid ? await App.db.get('teachers', tid) : null;
    const c = cid ? await App.db.get('contacts', cid) : null;
    const schoolId = t ? t.schoolId : c ? c.schoolId || '' : q.get('s');
    const contactType = !!App.RECORD_TYPES[type].contact;
    if (contactType ? !c : !t && !(type === 'group' && schoolId)) return App.notFound('יש לפתוח תיעוד מתוך תיק');
    const rec = {
      id: App.uid(), type, mentorId: App.state.mentorId, createdBy: App.state.mentorId,
      teacherIds: t ? [t.id] : [], contactIds: c ? [c.id] : [], schoolId, status: 'draft',
      data: { date: App.todayISO() }, tags: [], anchors: [], themes: [], links: [],
    };
    if (type === 'observation' || type === 'event') rec.data.time = App.nowTime();
    if (type === 'observation') { rec.entries = []; rec.themeNotes = {}; }
    if (type === 'update') rec.data.channel = App.UPDATE_CHANNELS[0];
    if (type === 'goal') { delete rec.data.date; rec.data.periodFrom = App.todayISO(); rec.data.status = 'בתהליך'; rec.progress = []; }
    App.pending[rec.id] = rec; // יישמר בשינוי הראשון
    App.replace('/r/' + rec.id + '/edit');
    return null;
  };

  const backFor = (rec, tMap) => {
    const t = tMap[rec.teacherIds[0]];
    const cid = (rec.contactIds || [])[0];
    return t ? '#/t/' + t.id : cid ? '#/c/' + cid : rec.schoolId ? '#/school/' + rec.schoolId : '#/';
  };

  // ---------- עריכה ----------
  V.recordEdit = async ([id]) => {
    const isNew = !!App.pending[id];
    const rec = App.pending[id] || (await App.db.get('records', id));
    if (!rec) return App.notFound('התיעוד לא נמצא');
    const type = App.RECORD_TYPES[rec.type];
    const [teachers, schools, themes, contacts] = await Promise.all([App.store.teachers(), App.store.schools(), App.getThemes(), App.store.contacts()]);
    const tMap = Object.fromEntries(teachers.map((t) => [t.id, t]));
    const back = backFor(rec, tMap);
    const fromTeacher = tMap[rec.teacherIds[0]];
    const fromContact = contacts.find((c) => c.id === (rec.contactIds || [])[0]);

    const ind = App.saveIndicator(isNew ? 'new' : 'saved', rec.updatedAt);
    const saver = App.makeSaver(async () => { await App.store.save('records', rec); delete App.pending[id]; }, ind);
    App.onCleanup(() => saver.flush());
    const touch = () => saver.touch();

    const p = App.page({
      title: type.label,
      sub: fromTeacher ? fromTeacher.name + (fromTeacher.className ? ' · ' + fromTeacher.className : '')
        : fromContact ? fromContact.name + ' · ' + App.contactRole(fromContact) : (schools.find((s) => s.id === rec.schoolId) || {}).name,
      back, right: ind.el, cls: 'editor',
    });

    if (rec.type === 'group') p.body.append(participantsSection(rec, teachers, schools, touch));
    if (rec.type === 'meeting') p.body.append(contactsSection(rec, contacts, touch));
    const fields = App.TYPE_FIELDS[rec.type];
    p.body.append(App.section(rec.type === 'observation' ? 'פרטי השיעור' : null, App.fieldGrid(fields, rec.data, touch),
      rec.type === 'event' ? h('p', { class: 'note' }, 'מבנה ראשוני — כל השדות רשות.') : null));

    if (rec.type === 'observation') {
      p.body.append(entriesSection(rec, themes, touch), themesSection(rec, themes, touch));
    }
    if (rec.type === 'goal') p.body.append(App.section('עדכוני התקדמות', progressSection(rec, touch)));
    if (['goal', 'reflection', 'meeting', 'update'].includes(rec.type)) p.body.append(App.section('קישור לתיעודים רלוונטיים', App.linksPanel(rec, touch)));

    p.body.append(
      App.section('הקלטות, תמונות וקבצים', App.attachments({ ownerId: rec.id, beforeAdd: () => saver.saveNow() })),
      await App.tagPanel(rec, touch),
      h('div', { class: 'danger-zone' }, h('button', { type: 'button', class: 'btn danger-text', onclick: async () => {
        const many = rec.type === 'group' && rec.teacherIds.length > 1;
        const msg = many ? 'הפגישה המשותפת תימחק מהתיקים של כל המשתתפות, יחד עם הקבצים שלה. לא ניתן לשחזר.' : 'התיעוד והקבצים המצורפים יימחקו. לא ניתן לשחזר.';
        if (!(await App.confirm(msg, { title: 'מחיקת תיעוד', ok: 'מחיקה', danger: true }))) return;
        saver.cancel();
        if (App.pending[id]) delete App.pending[id];
        await App.store.deleteRecord(rec);
        App.toast('התיעוד נמחק');
        App.replace(back.slice(1));
      } }, 'מחיקת התיעוד')));

    // סרגל פעולות תחתון
    const finish = async () => {
      if (rec.type === 'group' && !rec.teacherIds.length) { App.toast('נא לבחור לפחות משתתפת אחת', 'error'); return; }
      if (rec.type === 'meeting' && !rec.contactIds.length) { App.toast('נא לבחור לפחות משתתף/ת אחד/ת', 'error'); return; }
      if (rec.type === 'goal' && !(rec.data.title || '').trim()) { App.toast('נא לתת ליעד שם', 'error'); return; }
      rec.status = 'final';
      await saver.saveNow();
      App.toast('נשמר');
      App.replace('/r/' + rec.id);
    };
    const asDraft = async () => { await saver.saveNow(); App.toast(rec.status === 'draft' ? 'נשמר כטיוטה' : 'נשמר'); App.go(back.slice(1)); };
    p.root.append(h('div', { class: 'actionbar' },
      h('button', { type: 'button', class: 'btn', onclick: asDraft }, rec.status === 'draft' ? 'שמירה כטיוטה' : 'שמירה וחזרה'),
      h('button', { type: 'button', class: 'btn primary', onclick: finish }, rec.status === 'draft' ? '✓ סיום ושמירה' : '✓ שמירה וצפייה')));

    if (isNew && rec.type === 'reflection') setTimeout(() => { const ta = p.body.querySelector('textarea'); ta && ta.focus(); }, 80);
    return p.root;
  };

  // ---- משתתפות בפגישה משותפת ----
  function participantsSection(rec, teachers, schools, touch) {
    let showAll = false;
    const wrap = h('div');
    const draw = () => {
      const pool = teachers.filter((t) => showAll || t.schoolId === rec.schoolId || rec.teacherIds.includes(t.id));
      const sName = (sid) => ((schools.find((s) => s.id === sid) || {}).name || '').replace(/^בית הספר /, '');
      App.fill(wrap, 
        h('div', { class: 'chips wrap' }, pool.map((t) => App.chipToggle(t.name + (showAll && t.schoolId !== rec.schoolId ? ` (${sName(t.schoolId)})` : ''),
          rec.teacherIds.includes(t.id), (v) => {
            rec.teacherIds = v ? [...new Set([...rec.teacherIds, t.id])] : rec.teacherIds.filter((x) => x !== t.id);
            touch();
          }))),
        h('button', { type: 'button', class: 'btn small ghost mt', onclick: () => { showAll = !showAll; draw(); } },
          showAll ? 'רק מבית הספר הזה' : 'הצגת מחנכות מבתי ספר נוספים'));
    };
    draw();
    return App.section('משתתפות', h('p', { class: 'hint' }, 'הפגישה נשמרת פעם אחת ומופיעה בתיק של כל משתתפת.'), wrap);
  }

  // ---- משתתפים בפגישה עם גורמים נוספים ----
  function contactsSection(rec, contacts, touch) {
    const pool = contacts.filter((c) => !rec.schoolId || c.schoolId === rec.schoolId || !c.schoolId || rec.contactIds.includes(c.id));
    return App.section('משתתפים',
      h('p', { class: 'hint' }, 'אפשר לבחור כמה גורמים. הפגישה תופיע בתיק של כל אחד מהם.'),
      h('div', { class: 'chips wrap' }, pool.map((c) => App.chipToggle(c.name + ' · ' + App.contactRole(c), rec.contactIds.includes(c.id), (v) => {
        rec.contactIds = v ? [...new Set([...rec.contactIds, c.id])] : rec.contactIds.filter((x) => x !== c.id);
        touch();
      }))));
  }

  // ---- רשומות מהשיעור (חותמת זמן, סוג, תמה, תגיות) ----
  function entriesSection(rec, themes, touch) {
    rec.entries = rec.entries || [];
    let kind = 'seen', themeId = '', tags = [];
    const activeThemes = themes.filter((t) => t.active !== false);
    const ta = App.autogrow(h('textarea', { rows: 3, placeholder: 'מה קורה עכשיו?', 'aria-label': 'רשומה חדשה' }));
    const kindRow = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'סוג הרשומה' });
    const drawKinds = () => App.fill(kindRow, ...Object.entries(App.ENTRY_KINDS).map(([k, v]) => h('button', {
      type: 'button', role: 'radio', class: 'seg-btn k-' + k + (kind === k ? ' on' : ''), 'aria-checked': String(kind === k), title: v.hint,
      onclick: () => { kind = k; drawKinds(); },
    }, v.label)));
    drawKinds();
    const themeSel = h('select', { 'aria-label': 'תמה' }, h('option', { value: '' }, 'ללא תמה'), activeThemes.map((t) => h('option', { value: t.id }, t.title)));
    themeSel.addEventListener('change', () => { themeId = themeSel.value; });
    const tagBtn = h('button', { type: 'button', class: 'btn small ghost' }, '# תגיות');
    tagBtn.addEventListener('click', async () => { const r = await App.pickTags(tags); if (r) { tags = r; tagBtn.textContent = tags.length ? '# ' + tags.join(', ') : '# תגיות'; } });
    const list = h('div', { class: 'entries' });

    const add = () => {
      const text = ta.value.trim();
      if (!text) { ta.focus(); ta.classList.add('shake'); setTimeout(() => ta.classList.remove('shake'), 400); return; }
      rec.entries.push({ id: App.uid(), ts: new Date().toISOString(), kind, themeId: themeId || null, tags: [...tags], text });
      ta.value = ''; ta.style.height = ''; tags = []; tagBtn.textContent = '# תגיות';
      touch(); drawList();
      ta.focus();
    };
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); add(); } });

    const themeTitle = (tid) => (themes.find((t) => t.id === tid) || {}).title;
    function drawList() {
      const items = [...rec.entries].reverse();
      App.fill(list, ...items.map((e) => {
        const textEl = h('div', { class: 'entry-text pre' }, e.text);
        const box = h('div', { class: 'entry k-' + e.kind },
          h('div', { class: 'entry-top' },
            h('span', { class: 'entry-time' }, App.fmtTime(e.ts)),
            h('span', { class: 'kind-badge k-' + e.kind }, App.ENTRY_KINDS[e.kind].label),
            e.themeId && themeTitle(e.themeId) ? h('span', { class: 'muted small' }, '◇ ' + themeTitle(e.themeId)) : null,
            h('span', { class: 'entry-actions' },
            h('button', { type: 'button', class: 'icon-btn small', 'aria-label': 'עריכת רשומה', onclick: () => editEntry(e, box, textEl) }, '✎'),
            h('button', { type: 'button', class: 'icon-btn small', 'aria-label': 'תגיות לרשומה', onclick: async () => { const r = await App.pickTags(e.tags); if (r) { e.tags = r; touch(); drawList(); } } }, '#'),
            h('button', { type: 'button', class: 'icon-btn small', 'aria-label': 'מחיקת רשומה', onclick: async () => {
              if (!(await App.confirm('למחוק את הרשומה?', { ok: 'מחיקה', danger: true }))) return;
              rec.entries = rec.entries.filter((x) => x.id !== e.id); touch(); drawList();
            } }, '🗑'))),
          textEl,
          (e.tags || []).length ? h('div', { class: 'chips wrap' }, e.tags.map((t) => h('span', { class: 'chip static small on' }, '#' + t))) : null);
        return box;
      }));
      if (!items.length) list.append(h('p', { class: 'muted small' }, 'עוד אין רשומות. כל רשומה מקבלת חותמת זמן.'));
    }
    function editEntry(e, box, textEl) {
      const ed = App.autogrow(h('textarea', { rows: 3, value: e.text }));
      const kindSel = h('select', null, Object.entries(App.ENTRY_KINDS).map(([k, v]) => h('option', { value: k }, v.label)));
      kindSel.value = e.kind;
      const tSel = h('select', null, h('option', { value: '' }, 'ללא תמה'), themes.map((t) => h('option', { value: t.id }, t.title)));
      tSel.value = e.themeId || '';
      textEl.replaceWith(h('div', { class: 'entry-edit' }, ed, h('div', { class: 'row gap wrap' }, kindSel, tSel,
        h('button', { type: 'button', class: 'btn small primary', onclick: () => {
          if (!ed.value.trim()) { ed.focus(); return; }
          e.text = ed.value.trim(); e.kind = kindSel.value; e.themeId = tSel.value || null; touch(); drawList();
        } }, 'עדכון'),
        h('button', { type: 'button', class: 'btn small ghost', onclick: drawList }, 'ביטול'))));
      ed.focus();
    }
    drawList();
    return App.section('רשומות מהשיעור',
      h('p', { class: 'hint' }, 'כתיבה חופשית בזמן אמת. כדאי להבחין בין מה שנצפה לבין פרשנות או שאלה.'),
      h('div', { class: 'composer' }, kindRow, ta,
        h('div', { class: 'row gap wrap' }, themeSel, tagBtn, h('span', { class: 'spacer' }),
          h('button', { type: 'button', class: 'btn primary', onclick: add }, '+ הוספת רשומה'))),
      list);
  }

  // ---- תמות מנחות (אקורדיון) ----
  function themesSection(rec, themes, touch) {
    rec.themeNotes = rec.themeNotes || {};
    const shown = themes.filter((t) => t.active !== false || (rec.themeNotes[t.id] || '').trim());
    return App.section('תמות מנחות',
      h('p', { class: 'hint' }, 'אפשר לפתוח רק את מה שרלוונטי. אין חובה למלא.'),
      h('div', { class: 'accordion' }, shown.map((t) => {
        const dot = h('span', { class: 'fill-dot' + ((rec.themeNotes[t.id] || '').trim() ? ' on' : ''), 'aria-hidden': 'true' });
        const ta = App.autogrow(h('textarea', { rows: 3, value: rec.themeNotes[t.id] || '', 'aria-label': t.title }));
        ta.addEventListener('input', () => { rec.themeNotes[t.id] = ta.value; dot.classList.toggle('on', !!ta.value.trim()); touch(); });
        const d = h('details', { class: 'acc' },
          h('summary', null, dot, t.title),
          (t.prompts || []).length ? h('ul', { class: 'prompts' }, t.prompts.map((q) => h('li', null, q))) : null,
          t.id === 'talk' ? talkTimer(rec, touch) : null,
          ta);
        d.addEventListener('toggle', () => { if (d.open) requestAnimationFrame(ta._fit); });
        return d;
      })));
  }

  // מדידה פשוטה של זמן דיבור המורה לעומת זמן פעילות הילדים
  function talkTimer(rec, touch) {
    rec.talkTimer = rec.talkTimer || { teacher: 0, kids: 0 };
    let active = null, iv = null, ticks = 0;
    const out = h('div', { class: 'timer-out' });
    const bar = h('div', { class: 'ratio' });
    const btns = h('div', { class: 'row gap wrap' });
    const draw = () => {
      const { teacher, kids } = rec.talkTimer; const total = teacher + kids;
      App.fill(out, 
        h('span', null, 'המורה מדברת: ', h('strong', null, App.fmtDuration(teacher))),
        h('span', null, 'הילדים פעילים: ', h('strong', null, App.fmtDuration(kids))));
      App.fill(bar, h('span', { class: 'r-t', style: { width: total ? (teacher / total) * 100 + '%' : '50%' } }), h('span', { class: 'r-k' }));
      App.fill(btns, 
        h('button', { type: 'button', class: 'btn small' + (active === 'teacher' ? ' primary' : ''), onclick: () => run('teacher') }, '🗣 המורה מדברת'),
        h('button', { type: 'button', class: 'btn small' + (active === 'kids' ? ' primary' : ''), onclick: () => run('kids') }, '🧒 הילדים פעילים'),
        active ? h('button', { type: 'button', class: 'btn small ghost', onclick: stop }, '⏸ עצירה') : null,
        !active && total ? h('button', { type: 'button', class: 'btn small ghost', onclick: async () => {
          if (await App.confirm('לאפס את המדידה?', { ok: 'איפוס' })) { rec.talkTimer = { teacher: 0, kids: 0 }; touch(); draw(); }
        } }, 'איפוס') : null);
    };
    const run = (who) => {
      active = who;
      if (!iv) iv = setInterval(() => { rec.talkTimer[active] += 1; if (++ticks % 10 === 0) touch(); draw(); }, 1000);
      touch(); draw();
    };
    const stop = () => { clearInterval(iv); iv = null; active = null; touch(); draw(); };
    App.onCleanup(() => clearInterval(iv));
    draw();
    return h('div', { class: 'timer' }, btns, out, bar, h('div', { class: 'hint' }, 'מדידה גסה, ככלי להתבוננות ולשיחה — לא מדד להערכה.'));
  }

  // ---- עדכוני התקדמות ביעד ----
  function progressSection(rec, onChange) {
    rec.progress = rec.progress || [];
    const list = h('div', { class: 'progress-list' });
    const date = h('input', { type: 'date', value: App.todayISO(), 'aria-label': 'תאריך העדכון' });
    const ta = App.autogrow(h('textarea', { rows: 2, placeholder: 'מה התקדם? מה השתנה?', 'aria-label': 'עדכון התקדמות' }));
    const draw = () => {
      const items = [...rec.progress].sort((a, b) => b.date.localeCompare(a.date));
      App.fill(list, ...items.map((p) => h('div', { class: 'prog' },
        h('div', { class: 'prog-date' }, App.fmtDate(p.date)),
        h('div', { class: 'pre' }, p.text),
        h('button', { type: 'button', class: 'icon-btn small', 'aria-label': 'מחיקת עדכון', onclick: async () => {
          if (!(await App.confirm('למחוק את העדכון?', { ok: 'מחיקה', danger: true }))) return;
          rec.progress = rec.progress.filter((x) => x.id !== p.id); onChange(); draw();
        } }, '🗑'))));
      if (!items.length) list.append(h('p', { class: 'muted small' }, 'עוד אין עדכונים.'));
    };
    draw();
    return h('div', null, list, h('div', { class: 'composer' }, ta, h('div', { class: 'row gap' }, date,
      h('button', { type: 'button', class: 'btn primary small', onclick: () => {
        if (!ta.value.trim()) { ta.focus(); return; }
        rec.progress.push({ id: App.uid(), date: date.value || App.todayISO(), text: ta.value.trim() });
        ta.value = ''; onChange(); draw();
      } }, '+ הוספת עדכון'))));
  }

  // ---------- צפייה ----------
  V.recordView = async ([id]) => {
    if (App.pending[id]) { App.replace('/r/' + id + '/edit'); return null; }
    const rec = await App.db.get('records', id);
    if (!rec) return App.notFound('התיעוד לא נמצא — ייתכן שנמחק.');
    const type = App.RECORD_TYPES[rec.type];
    const [teachers, themes, all, contacts] = await Promise.all([App.store.teachers(), App.getThemes(), App.store.records(), App.store.contacts()]);
    const tMap = Object.fromEntries(teachers.map((t) => [t.id, t]));
    const cMap = Object.fromEntries(contacts.map((c) => [c.id, c]));
    const themeTitle = (tid) => (themes.find((t) => t.id === tid) || {}).title || tid;
    const back = backFor(rec, tMap);
    const d = rec.data || {};

    const p = App.page({ title: type.label, sub: App.fmtDate(App.recDate(rec)) + (d.time ? ' · ' + d.time : ''), back,
      right: h('a', { class: 'icon-btn', href: '#/r/' + id + '/edit', 'aria-label': 'עריכה' }, '✎') });

    if (rec.status === 'draft') p.body.append(h('div', { class: 'banner draft' }, 'זו טיוטה — עוד לא סומנה כגמורה. ', h('a', { href: '#/r/' + id + '/edit' }, 'המשך עריכה')));

    p.body.append(h('div', { class: 'who' },
      rec.teacherIds.map((tid) => tMap[tid] ? h('a', { class: 'who-chip', href: '#/t/' + tid }, App.avatar(tMap[tid], 'xs'), tMap[tid].name) : null),
      (rec.contactIds || []).map((cid) => cMap[cid] ? h('a', { class: 'who-chip', href: '#/c/' + cid }, App.avatar(cMap[cid], 'xs'), cMap[cid].name + ' · ' + App.contactRole(cMap[cid])) : null)));

    // שדות
    const fieldDefs = App.TYPE_FIELDS[rec.type].filter((f) => !['date', 'time'].includes(f.key));
    const shown = fieldDefs.filter((f) => (d[f.key] || '').toString().trim());
    if (shown.length) {
      p.body.append(App.section(null, h('dl', { class: 'facts' }, shown.map((f) => [
        h('dt', null, f.label),
        h('dd', { class: 'pre' }, f.type === 'date' ? App.fmtDate(d[f.key]) : d[f.key])]))));
    }

    if (rec.type === 'observation') {
      const entries = [...(rec.entries || [])].sort((a, b) => a.ts.localeCompare(b.ts));
      if (entries.length) {
        p.body.append(App.section('רשומות מהשיעור', h('div', { class: 'entries' }, entries.map((e) => h('div', { class: 'entry k-' + e.kind },
          h('div', { class: 'entry-top' }, h('span', { class: 'entry-time' }, App.fmtTime(e.ts)),
            h('span', { class: 'kind-badge k-' + e.kind }, App.ENTRY_KINDS[e.kind].label),
            e.themeId ? h('span', { class: 'muted small' }, '◇ ' + themeTitle(e.themeId)) : null),
          h('div', { class: 'entry-text pre' }, e.text),
          (e.tags || []).length ? h('div', { class: 'chips wrap' }, e.tags.map((t) => h('span', { class: 'chip static small on' }, '#' + t))) : null)))));
      }
      const notes = Object.entries(rec.themeNotes || {}).filter(([, v]) => (v || '').trim());
      const tt = rec.talkTimer || {};
      if (notes.length || tt.teacher || tt.kids) {
        const total = (tt.teacher || 0) + (tt.kids || 0);
        p.body.append(App.section('לפי תמות',
          h('dl', { class: 'facts' }, notes.map(([k, v]) => [h('dt', null, themeTitle(k)), h('dd', { class: 'pre' }, v)])),
          total ? h('div', { class: 'timer' }, h('div', { class: 'small strong' }, themeTitle('talk')),
            h('div', { class: 'timer-out' }, h('span', null, 'המורה מדברת: ', h('strong', null, App.fmtDuration(tt.teacher || 0))), h('span', null, 'הילדים פעילים: ', h('strong', null, App.fmtDuration(tt.kids || 0)))),
            h('div', { class: 'ratio' }, h('span', { class: 'r-t', style: { width: (tt.teacher / total) * 100 + '%' } }), h('span', { class: 'r-k' }))) : null));
      }
      if (!entries.length && !notes.length && !shown.length) p.body.append(App.empty('התצפית עוד ריקה.', h('a', { class: 'btn primary', href: '#/r/' + id + '/edit' }, 'המשך תיעוד')));
    }

    if (rec.type === 'goal') {
      // אפשר להוסיף עדכון התקדמות ישירות מתצוגת היעד
      p.body.append(App.section('עדכוני התקדמות', progressSection(rec, async () => { await App.store.save('records', rec); App.toast('העדכון נשמר'); })));
    }

    // קשורים: קישורים יוצאים + תיעודים שמקשרים לכאן
    const outgoing = (rec.links || []).map((lid) => all.find((r) => r.id === lid)).filter(Boolean);
    const incoming = all.filter((r) => (r.links || []).includes(id) && !outgoing.includes(r));
    if (outgoing.length || incoming.length) {
      p.body.append(App.section('תיעודים קשורים', h('div', { class: 'links' }, [...outgoing, ...incoming].map((r) => h('div', { class: 'link-row' },
        h('a', { href: '#/r/' + r.id }, h('span', { class: 'badge t-' + App.RECORD_TYPES[r.type].color }, App.RECORD_TYPES[r.type].short), ' ', App.recordSummary(r).title,
          h('span', { class: 'muted small' }, ' · ' + App.fmtDate(App.recDate(r)))))))));
    }

    p.body.append(App.section('הקלטות, תמונות וקבצים', App.attachments({ ownerId: id, readOnly: true })));
    const chips = await App.tagChips(rec);
    if (chips) p.body.append(App.section('תיוג ועוגנים', chips));

    p.body.append(h('div', { class: 'row center gap mt' }, h('a', { class: 'btn primary', href: '#/r/' + id + '/edit' }, '✎ עריכה')),
      h('p', { class: 'muted small center' }, 'נוצר ' + App.fmtDate(rec.createdAt) + ' · עודכן ' + App.fmtDate(rec.updatedAt) + ' ' + App.fmtTime(rec.updatedAt)));
    return p.root;
  };
})(window.App);
