'use strict';
// מסכים: בחירת מנחה, בית, בתי ספר, מחנכת, אינטייק, תיעודים, הגדרות.
(function (App) {
  const { h } = App;
  const V = (App.views = App.views || {});

  // ---------- כניסה ----------
  const welcomeShell = (...children) => h('div', { class: 'page' }, h('div', { class: 'page-body login' },
    h('img', { class: 'login-logo', src: 'icons/mark.svg', alt: '' }),
    h('h1', { class: 'login-title' }, 'יומן ליווי'),
    h('p', { class: 'muted center' }, 'ליווי פדגוגי של מחנכות · מהלך ההכלה הירושלמי'),
    ...children));

  V.login = (errorText) => {
    if (location.protocol === 'file:') {
      return welcomeShell(h('div', { class: 'card section' },
        h('p', null, 'כדי להתחבר, צריך לפתוח את האפליקציה דרך כתובת אינטרנט ולא מהקובץ עצמו.'),
        h('p', { class: 'small muted' }, 'במחשב: מריצים בתיקיית האפליקציה ', h('code', null, 'node serve.js'), ' ופותחים את http://localhost:8765')));
    }
    const err = h('div', { class: 'error center', role: 'alert' }, errorText || '');
    const btn = h('button', { type: 'button', class: 'btn primary big block google-btn' }, h('span', { class: 'g-mark' }, 'G'), 'כניסה עם Google');
    btn.addEventListener('click', async () => {
      btn.disabled = true; err.textContent = '';
      try { await App.cloud.signIn(); }
      catch (e) { console.error(e); err.textContent = 'הכניסה לא הצליחה. נסי שוב.' + (e.code ? ` (${e.code})` : ''); }
      finally { btn.disabled = false; }
    });
    return welcomeShell(h('div', { class: 'login-box' }, btn, err),
      h('p', { class: 'note' }, 'כל מנחה רואה רק את המידע שלה. המידע נשמר בענן ומסונכרן בין הטלפון למחשב.'));
  };

  V.denied = (user) => welcomeShell(h('div', { class: 'card section center' },
    h('p', null, 'החשבון ', h('strong', null, user.email), ' עוד לא אושר לשימוש ביומן הליווי.'),
    h('p', { class: 'muted small' }, 'כדאי לפנות למנהלת המערכת ולבקש שתוסיף את הכתובת הזו.'),
    h('button', { type: 'button', class: 'btn mt', onclick: async () => { await App.cloud.signOut(); location.reload(); } }, 'כניסה עם חשבון אחר')));

  // ---------- ברוכה הבאה (כניסה ראשונה) ----------
  V.welcome = async () => {
    const name = (App.state.user && App.state.user.displayName) || '';
    const start = async (withDemo, btn) => {
      btn.disabled = true; btn.textContent = 'רגע…';
      if (withDemo) await App.seed();
      await App.settings.set('themes', App.DEFAULT_THEMES);
      await App.settings.set('tags', App.DEFAULT_TAGS);
      await App.settings.set('onboarded', true);
      App.replace('/overview');
    };
    const demoBtn = h('button', { type: 'button', class: 'btn primary block', onclick: () => start(true, demoBtn) }, 'להתחיל עם נתוני דוגמה');
    const emptyBtn = h('button', { type: 'button', class: 'btn block', onclick: () => start(false, emptyBtn) }, 'להתחיל עם יומן ריק');
    return welcomeShell(h('div', { class: 'card section' },
      h('p', { class: 'lead' }, `ברוכה הבאה${name ? ', ' + name.split(' ')[0] : ''}!`),
      h('p', null, 'אפשר להתחיל עם נתוני דוגמה (בתי ספר ומחנכות מומצאים) כדי להכיר את האפליקציה, ואפשר להתחיל ריק.'),
      h('div', { class: 'stack mt' }, demoBtn, emptyBtn),
      h('p', { class: 'muted small mt' }, 'את נתוני הדוגמה אפשר למחוק בכל רגע במסך ההגדרות.')));
  };

  // ---------- מסך הבית: כרטיסי מחנכות ----------
  V.home = async () => {
    const [schools, teachers, records, contacts] = await Promise.all([App.store.schools(), App.store.teachers(), App.store.records(), App.store.contacts()]);
    const mode = () => App.state.homeMode || 'teachers';
    const userName = (App.state.user && (App.state.user.displayName || App.state.user.email)) || '';
    const sMap = Object.fromEntries(schools.map((s) => [s.id, s]));
    if (App.state.homeSchool !== 'all' && !sMap[App.state.homeSchool]) App.state.homeSchool = 'all';

    const lastBy = {}, draftsBy = {};
    for (const r of records) for (const pid of [...r.teacherIds, ...(r.contactIds || [])]) {
      const d = App.recDate(r);
      if (!lastBy[pid] || d > lastBy[pid]) lastBy[pid] = d;
      if (r.status === 'draft') draftsBy[pid] = (draftsBy[pid] || 0) + 1;
    }

    const p = App.page({
      title: 'יומן ליווי',
      sub: h('a', { href: '#/settings', class: 'mentor-chip' }, userName),
      cls: 'home',
    });

    const search = h('input', { type: 'search', value: App.state.homeSearch, 'aria-label': 'חיפוש' });
    const modeRow = h('div', { class: 'seg mode-seg', role: 'tablist', 'aria-label': 'תצוגה' });
    const actions = h('div', { class: 'row gap center mt' });
    const drawMode = () => {
      App.fill(modeRow, [['teachers', '👩‍🏫 המחנכות שלי'], ['contacts', '🤝 גורמים נוספים']].map(([k, l]) => h('button', {
        type: 'button', role: 'tab', class: 'seg-btn' + (mode() === k ? ' on' : ''), 'aria-selected': String(mode() === k),
        onclick: () => { App.state.homeMode = k; drawMode(); drawGrid(); },
      }, l)));
      search.placeholder = mode() === 'contacts' ? 'חיפוש לפי שם או תפקיד…' : 'חיפוש לפי שם…';
      const sq = App.state.homeSchool !== 'all' ? '?school=' + App.state.homeSchool : '';
      App.fill(actions, mode() === 'contacts'
        ? h('a', { class: 'btn primary', href: '#/contact/new' + sq }, '+ גורם חדש')
        : h('a', { class: 'btn primary', href: '#/teacher/new' + sq }, '+ מחנכת חדשה'),
      h('a', { class: 'btn', href: '#/school/new' }, '+ בית ספר חדש'));
    };
    const chipsRow = h('div', { class: 'chips scroll', role: 'tablist', 'aria-label': 'סינון לפי בית ספר' });
    const grid = h('div', { class: 'tgrid' });

    const drawChips = () => App.fill(chipsRow, 
      ...[{ id: 'all', name: 'כל בתי הספר' }, ...schools].map((s) => h('button', {
        type: 'button', role: 'tab', class: 'chip' + (App.state.homeSchool === s.id ? ' on' : ''), 'aria-selected': String(App.state.homeSchool === s.id),
        onclick: () => { App.state.homeSchool = s.id; drawChips(); drawGrid(); drawMode(); },
      }, s.id === 'all' ? s.name : s.name.replace(/^בית הספר /, ''))));

    const lastLine = (id) => [lastBy[id] ? 'תיעוד אחרון: ' + App.fmtDate(lastBy[id]) : 'אין עדיין תיעודים',
      draftsBy[id] ? h('span', { class: 'badge draft' }, draftsBy[id] === 1 ? 'טיוטה פתוחה' : draftsBy[id] + ' טיוטות') : null];
    const drawContacts = () => {
      const q = App.state.homeSearch.trim();
      const list = contacts.filter((c) => (App.state.homeSchool === 'all' || c.schoolId === App.state.homeSchool)
        && (!q || c.name.includes(q) || App.contactRole(c).includes(q)))
        .sort((a, b) => (lastBy[b.id] || '').localeCompare(lastBy[a.id] || ''));
      if (!list.length) {
        App.fill(grid, App.empty(q ? 'לא נמצאו גורמים מתאימים.' : 'כאן מתעדים פגישות ועדכונים עם מי שאינן המחנכות: מנהלת, יועצת, המלווה של ההנהלה ועוד.',
          h('a', { class: 'btn primary', href: '#/contact/new' + (App.state.homeSchool !== 'all' ? '?school=' + App.state.homeSchool : '') }, '+ גורם חדש')));
        return;
      }
      App.fill(grid, ...list.map((c) => h('a', { class: 'tcard', href: '#/c/' + c.id },
        App.avatar(c, 'lg'),
        h('div', { class: 'tcard-name' }, c.name),
        h('div', { class: 'tcard-sub strong' }, App.contactRole(c)),
        h('div', { class: 'tcard-sub' }, (sMap[c.schoolId] || {}).name || 'ללא בית ספר'),
        h('div', { class: 'tcard-meta' }, lastLine(c.id)))));
    };

    const drawGrid = () => {
      if (mode() === 'contacts') return drawContacts();
      const q = App.state.homeSearch.trim();
      // מחנכות עם תיעוד אחרון מופיעות ראשונות
      const list = teachers.filter((t) => (App.state.homeSchool === 'all' || t.schoolId === App.state.homeSchool) && (!q || t.name.includes(q)))
        .sort((a, b) => (lastBy[b.id] || '').localeCompare(lastBy[a.id] || ''));
      if (!schools.length) {
        App.fill(grid, App.empty('עוד אין בתי ספר. מתחילים ביצירת בית ספר, ואז מוסיפים אליו מחנכות.',
          h('a', { class: 'btn primary', href: '#/school/new' }, '+ בית ספר חדש')));
        return;
      }
      if (!list.length) {
        App.fill(grid, App.empty(q ? `לא נמצאה מחנכת בשם "${q}".` : 'אין עדיין מחנכות בבית הספר הזה.',
          h('a', { class: 'btn primary', href: '#/teacher/new' + (App.state.homeSchool !== 'all' ? '?school=' + App.state.homeSchool : '') }, '+ מחנכת חדשה')));
        return;
      }
      App.fill(grid, ...list.map((t) => h('a', { class: 'tcard', href: '#/t/' + t.id },
        App.avatar(t, 'lg'),
        h('div', { class: 'tcard-name' }, t.name),
        h('div', { class: 'tcard-sub' }, (sMap[t.schoolId] || {}).name || '—'),
        h('div', { class: 'tcard-sub' }, t.className ? 'כיתה ' + t.className : ''),
        h('div', { class: 'tcard-meta' }, lastLine(t.id)))));
    };
    search.addEventListener('input', () => { App.state.homeSearch = search.value; drawGrid(); });
    drawMode(); drawChips(); drawGrid();

    p.body.append(App.localBanner(), modeRow, h('div', { class: 'searchbar' }, search), chipsRow, grid, actions);
    return p.root;
  };

  // ---------- בתי ספר ----------
  V.schools = async () => {
    const [schools, teachers] = await Promise.all([App.store.schools(), App.store.teachers()]);
    const p = App.page({ title: 'בתי הספר שלי', right: h('a', { class: 'icon-btn', href: '#/school/new', 'aria-label': 'בית ספר חדש' }, '+') });
    if (!schools.length) p.body.append(App.empty('עוד אין בתי ספר.', h('a', { class: 'btn primary', href: '#/school/new' }, '+ בית ספר חדש')));
    p.body.append(h('div', { class: 'list' }, schools.map((s) => {
      const ts = teachers.filter((t) => t.schoolId === s.id);
      return h('a', { class: 'list-row', href: '#/school/' + s.id },
        h('div', null, h('div', { class: 'strong' }, s.name), h('div', { class: 'muted small' }, [s.city, `${ts.length} מחנכות`].filter(Boolean).join(' · '))),
        h('span', { class: 'chev' }, '‹'));
    })));
    if (schools.length) p.body.append(h('div', { class: 'row center mt' }, h('a', { class: 'btn primary', href: '#/school/new' }, '+ בית ספר חדש')));
    return p.root;
  };

  V.school = async ([id]) => {
    const s = await App.db.get('schools', id);
    if (!s) return App.notFound('בית הספר לא נמצא');
    const teachers = (await App.store.teachers()).filter((t) => t.schoolId === id);
    const tMap = Object.fromEntries(teachers.map((t) => [t.id, t]));
    const meetings = (await App.db.byIndex('records', 'schoolId', id)).filter((r) => r.type === 'group')
      .sort((a, b) => App.recDate(b).localeCompare(App.recDate(a)));
    const fileCounts = await App.fileCounts();
    const contacts = (await App.store.contacts()).filter((c) => c.schoolId === id);
    const ind = App.saveIndicator('saved', s.updatedAt);
    const saver = App.makeSaver(() => App.store.save('schools', s), ind);
    App.onCleanup(() => saver.flush());
    const snapshot = App.autogrow(h('textarea', { rows: 4, value: s.summary || '', 'aria-label': 'תמונת מצב של בית הספר',
      placeholder: 'מה חשוב לדעת על בית הספר עכשיו? מבנה, צוות, אתגרים, אירועים, מה שעלה מהמלווה של ההנהלה…' }));
    snapshot.addEventListener('input', () => { s.summary = snapshot.value; saver.touch(); });
    const p = App.page({ title: s.name, sub: s.city, back: '#/schools',
      right: h('a', { class: 'icon-btn', href: '#/school/' + id + '/edit', 'aria-label': 'עריכת בית הספר' }, '✎') });
    p.body.append(
      s.notes ? App.section(null, h('p', { class: 'pre' }, s.notes)) : null,
      App.section(null, h('div', { class: 'row between' }, h('h2', { class: 'section-title' }, 'תמונת מצב של בית הספר'), ind.el),
        h('p', { class: 'hint' }, 'סיכום שמתעדכן לאורך הזמן. נשמר אוטומטית.'), snapshot),
      App.section('גורמים נוספים',
        contacts.length ? h('div', { class: 'list' }, contacts.map((c) => h('a', { class: 'list-row', href: '#/c/' + c.id },
          h('div', { class: 'row gap' }, App.avatar(c, 'sm'), h('div', null, h('div', { class: 'strong' }, c.name), h('div', { class: 'muted small' }, App.contactRole(c)))),
          h('span', { class: 'chev' }, '‹')))) : h('p', { class: 'muted' }, 'עוד לא נוספו גורמים (מנהלת, יועצת, המלווה של ההנהלה…).'),
        h('a', { class: 'btn mt', href: '#/contact/new?school=' + id }, '+ גורם בבית הספר')),
      App.section('מחנכות',
        teachers.length ? h('div', { class: 'list' }, teachers.map((t) => h('a', { class: 'list-row', href: '#/t/' + t.id },
          h('div', { class: 'row gap' }, App.avatar(t, 'sm'), h('div', null, h('div', { class: 'strong' }, t.name), h('div', { class: 'muted small' }, t.className ? 'כיתה ' + t.className : ''))),
          h('span', { class: 'chev' }, '‹')))) : h('p', { class: 'muted' }, 'עוד אין מחנכות בבית הספר.'),
        h('a', { class: 'btn primary mt', href: '#/teacher/new?school=' + id }, '+ מחנכת לבית הספר')),
      App.section('פגישות משותפות',
        meetings.length ? h('div', { class: 'timeline' }, meetings.map((r) => App.recordItem(r, { tMap, fileCounts }))) : h('p', { class: 'muted' }, 'עוד אין פגישות משותפות.'),
        teachers.length ? h('a', { class: 'btn mt', href: '#/new/group?s=' + id }, '👥 פגישה משותפת חדשה') : null));
    return p.root;
  };

  V.schoolForm = async ([id]) => {
    const existing = id ? await App.db.get('schools', id) : null;
    if (id && !existing) return App.notFound('בית הספר לא נמצא');
    const s = existing || { id: App.uid(), name: '', city: '', notes: '' };
    const p = App.page({ title: existing ? 'עריכת בית ספר' : 'בית ספר חדש', back: existing ? '#/school/' + s.id : '#/schools' });
    const err = h('div', { class: 'error', role: 'alert' });
    const form = h('form', { class: 'card section', novalidate: true },
      App.fieldGrid([
        { key: 'name', label: 'שם בית הספר *', type: 'text', placeholder: 'למשל: בית הספר הגפן' },
        { key: 'city', label: 'יישוב / שכונה', type: 'text' },
        { key: 'notes', label: 'הערות', type: 'textarea', rows: 3 }], s, () => { err.textContent = ''; }),
      err,
      h('div', { class: 'row gap mt' }, h('button', { type: 'submit', class: 'btn primary' }, 'שמירה'),
        h('a', { class: 'btn ghost', href: existing ? '#/school/' + s.id : '#/schools' }, 'ביטול')));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!s.name.trim()) { err.textContent = 'נא לכתוב את שם בית הספר.'; return; }
      s.name = s.name.trim();
      await App.store.save('schools', s);
      App.toast('בית הספר נשמר');
      App.replace('/school/' + s.id);
    });
    p.body.append(form);
    if (existing) {
      p.body.append(h('div', { class: 'danger-zone' }, h('button', { type: 'button', class: 'btn danger-text', onclick: async () => {
        const ts = (await App.store.teachers()).filter((t) => t.schoolId === s.id);
        if (ts.length) { App.toast('יש בבית הספר מחנכות. יש להעביר או למחוק אותן קודם.', 'error'); return; }
        if (!(await App.confirm(`למחוק את ${s.name}?`, { ok: 'מחיקה', danger: true }))) return;
        await App.db.del('schools', s.id); App.toast('בית הספר נמחק'); App.replace('/schools');
      } }, 'מחיקת בית הספר')));
    }
    return p.root;
  };

  // יצירת בית ספר מהירה מתוך טופס (חלון)
  App.quickSchool = async () => {
    const s = { id: App.uid(), name: '', city: '', notes: '' };
    const inp = h('input', { type: 'text', placeholder: 'שם בית הספר' });
    const err = h('div', { class: 'error' });
    setTimeout(() => inp.focus(), 50);
    const ok = await App.modal({
      title: 'בית ספר חדש', body: h('div', { class: 'field' }, inp, err),
      actions: [{ label: 'ביטול', value: false }, { label: 'יצירה', kind: 'primary', onClick: () => {
        if (!inp.value.trim()) { err.textContent = 'נא לכתוב שם.'; return false; } return true;
      } }],
    });
    if (!ok) return null;
    s.name = inp.value.trim();
    return App.store.save('schools', s);
  };

  // ---------- גורם נוסף: תיק ----------
  V.contact = async ([id]) => {
    const c = await App.db.get('contacts', id);
    if (!c) return App.notFound('הגורם לא נמצא');
    const [school, records, contacts, fileCounts] = await Promise.all([
      c.schoolId ? App.db.get('schools', c.schoolId) : null, App.store.contactRecords(id), App.store.contacts(), App.fileCounts()]);
    const cMap = Object.fromEntries(contacts.map((x) => [x.id, x]));
    records.sort((a, b) => App.recDate(b).localeCompare(App.recDate(a)) || (b.createdAt || '').localeCompare(a.createdAt || ''));
    const p = App.page({ title: 'גורם נוסף', back: '#/', right: h('a', { class: 'icon-btn', href: '#/c/' + id + '/edit', 'aria-label': 'עריכת פרטים' }, '✎') });
    let fType = 'all';
    const list = h('div');
    const draw = () => {
      const shown = records.filter((r) => fType === 'all' || r.type === fType);
      App.fill(list,
        records.length ? h('div', { class: 'chips scroll' }, [['all', 'הכול'], ['meeting', 'פגישות'], ['update', 'עדכונים']].map(([k, l]) =>
          h('button', { type: 'button', class: 'chip' + (fType === k ? ' on' : ''), onclick: () => { fType = k; draw(); } }, l))) : null,
        shown.length ? h('div', { class: 'timeline' }, shown.map((r) => App.recordItem(r, { cMap, fileCounts })))
          : App.empty(records.length ? 'אין תיעודים מהסוג הזה.' : 'עוד אין פגישות או עדכונים.'));
    };
    draw();
    const sub = [App.contactRole(c)];
    if (school) sub.push(' · ', h('a', { href: '#/school/' + school.id }, school.name));
    p.body.append(
      h('div', { class: 'thead' }, App.avatar(c, 'xl'),
        h('div', null, h('h2', { class: 'thead-name' }, c.name), h('div', { class: 'muted' }, sub))),
      c.notes ? App.section(null, h('p', { class: 'pre' }, c.notes)) : null,
      h('div', { class: 'quick two' },
        h('a', { class: 'btn primary big', href: '#/new/meeting?c=' + id }, '🤝 פגישה חדשה'),
        h('a', { class: 'btn big', href: '#/new/update?c=' + id }, '📨 עדכון שהתקבל')),
      h('h2', { class: 'section-title mt' }, 'רצף תיעודים'),
      list);
    return p.root;
  };

  V.contactForm = async ([id], q) => {
    const existing = id ? await App.db.get('contacts', id) : null;
    if (id && !existing) return App.notFound('הגורם לא נמצא');
    const c = existing || { id: App.uid(), name: '', role: App.CONTACT_ROLES[0], roleOther: '', schoolId: q.get('school') || '', notes: '' };
    const schools = await App.store.schools();
    const back = existing ? '#/c/' + c.id : '#/';
    const p = App.page({ title: existing ? 'עריכת פרטים' : 'גורם חדש', back });
    const err = h('div', { class: 'error', role: 'alert' });
    const other = App.field({ key: 'roleOther', label: 'תפקיד', type: 'text', placeholder: 'למשל: רכזת שילוב' }, c.roleOther, (v) => { c.roleOther = v; });
    other.hidden = c.role !== 'אחר';
    const form = h('form', { class: 'card section', novalidate: true },
      h('div', { class: 'fields' },
        App.field({ key: 'name', label: 'שם *', type: 'text' }, c.name, (v) => { c.name = v; err.textContent = ''; }),
        App.field({ key: 'role', label: 'תפקיד', type: 'select', half: true, options: [...App.CONTACT_ROLES, 'אחר'] }, c.role, (v) => { c.role = v; other.hidden = v !== 'אחר'; }),
        App.field({ key: 'schoolId', label: 'בית ספר', type: 'select', half: true,
          options: [{ value: '', label: 'ללא בית ספר (למשל מפקחת)' }, ...schools.map((s) => ({ value: s.id, label: s.name }))] }, c.schoolId, (v) => { c.schoolId = v; }),
        other,
        App.field({ key: 'notes', label: 'הערות', type: 'textarea', rows: 2 }, c.notes, (v) => { c.notes = v; })),
      err,
      h('div', { class: 'row gap mt' }, h('button', { type: 'submit', class: 'btn primary' }, existing ? 'שמירה' : 'יצירה'), h('a', { class: 'btn ghost', href: back }, 'ביטול')));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!c.name.trim()) { err.textContent = 'נא לכתוב שם.'; return; }
      c.name = c.name.trim();
      await App.store.save('contacts', c);
      App.toast('נשמר'); App.replace('/c/' + c.id);
    });
    p.body.append(form);
    if (existing) {
      p.body.append(h('div', { class: 'danger-zone' }, h('button', { type: 'button', class: 'btn danger-text', onclick: async () => {
        if (!(await App.confirm('למחוק את ' + c.name + '? פגישות ועדכונים שתועדו רק איתו/ה יימחקו. לא ניתן לשחזר.', { ok: 'מחיקה', danger: true }))) return;
        await App.store.deleteContact(c); App.toast('נמחק'); App.replace('/');
      } }, 'מחיקה')));
    }
    return p.root;
  };

  // ---------- טופס מחנכת ----------
  V.teacherForm = async ([id], q) => {
    const existing = id ? await App.db.get('teachers', id) : null;
    if (id && !existing) return App.notFound('המחנכת לא נמצאה');
    const t = existing || { id: App.uid(), name: '', schoolId: q.get('school') || App.state.homeSchool !== 'all' && App.state.homeSchool || '', className: '', photoData: null, intake: {} };
    let schools = await App.store.schools();
    let newPhoto = null, removePhoto = false;
    const back = existing ? '#/t/' + t.id : '#/';
    const p = App.page({ title: existing ? 'עריכת פרטי מחנכת' : 'מחנכת חדשה', back });
    const err = h('div', { class: 'error', role: 'alert' });

    // תמונה
    const preview = h('div', { class: 'photo-preview' });
    const drawPhoto = () => {
      if (newPhoto) App.fill(preview, h('img', { src: App.objectURL(newPhoto), alt: '' }));
      else if (!removePhoto && (t.photoData || t.photoFileId)) App.fill(preview, App.avatar(t, 'xl'));
      else App.fill(preview, h('div', { class: 'avatar xl', style: { background: App.colorFor(t.id) } }, App.initials(t.name || '?')));
    };
    const photoInput = (label, attrs) => {
      const inp = h('input', { type: 'file', accept: 'image/*', class: 'visually-hidden', ...attrs });
      inp.addEventListener('change', async () => { if (inp.files[0]) { newPhoto = await App.downscale(inp.files[0], 320, 0.8, true); removePhoto = false; drawPhoto(); } inp.value = ''; });
      return h('label', { class: 'btn small' }, inp, label);
    };
    drawPhoto();

    // בית ספר
    const schoolSel = h('select', { id: 'tf-school' });
    const drawSchools = () => {
      App.fill(schoolSel, h('option', { value: '' }, 'בחירת בית ספר…'), ...schools.map((s) => h('option', { value: s.id }, s.name)), h('option', { value: '__new' }, '+ בית ספר חדש…'));
      schoolSel.value = t.schoolId || '';
    };
    drawSchools();
    schoolSel.addEventListener('change', async () => {
      err.textContent = '';
      if (schoolSel.value === '__new') {
        const s = await App.quickSchool();
        if (s) { schools = await App.store.schools(); t.schoolId = s.id; }
        drawSchools(); return;
      }
      t.schoolId = schoolSel.value;
    });

    const form = h('form', { class: 'card section', novalidate: true },
      h('div', { class: 'photo-edit' }, preview, h('div', { class: 'row gap wrap' },
        photoInput('📷 צילום', { capture: 'environment' }), photoInput('🖼 העלאה', {}),
        h('button', { type: 'button', class: 'btn small ghost', onclick: () => { newPhoto = null; removePhoto = true; drawPhoto(); } }, 'הסרה'))),
      h('div', { class: 'fields' },
        App.field({ key: 'name', label: 'שם המחנכת *', type: 'text' }, t.name, (v) => { t.name = v; err.textContent = ''; if (!t.photoData && !t.photoFileId && !newPhoto) drawPhoto(); }),
        h('div', { class: 'field' }, h('label', { for: 'tf-school' }, 'בית ספר *'), schoolSel),
        App.field({ key: 'className', label: 'כיתה', type: 'text', placeholder: 'למשל: ג׳2' }, t.className, (v) => { t.className = v; })),
      err,
      h('div', { class: 'row gap mt' }, h('button', { type: 'submit', class: 'btn primary' }, existing ? 'שמירה' : 'יצירת תיק מחנכת'), h('a', { class: 'btn ghost', href: back }, 'ביטול')));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!t.name.trim()) { err.textContent = 'נא לכתוב את שם המחנכת.'; return; }
      if (!t.schoolId) { err.textContent = 'נא לבחור בית ספר (או ליצור חדש).'; return; }
      try {
        t.name = t.name.trim();
        if (newPhoto || removePhoto) {
          // תמונה קטנה נשמרת בתוך פרטי המחנכת, כדי שתופיע בכל המכשירים
          t.photoData = newPhoto ? await App.toDataURL(newPhoto) : null;
          if (t.photoFileId) { await App.files.removeOwner('photo:' + t.id); t.photoFileId = null; }
        }
        await App.store.save('teachers', t);
        App.toast(existing ? 'הפרטים נשמרו' : 'תיק המחנכת נוצר');
        App.replace('/t/' + t.id);
      } catch (ex) { console.error(ex); err.textContent = 'השמירה נכשלה. נסי שוב.'; }
    });
    p.body.append(form);

    if (existing) {
      p.body.append(h('div', { class: 'danger-zone' }, h('button', { type: 'button', class: 'btn danger-text', onclick: async () => {
        if (!(await App.confirm(`למחוק את התיק של ${t.name}? כל התיעודים שלה יימחקו (מפגישות משותפות היא רק תוסר). לא ניתן לשחזר.`, { ok: 'מחיקת התיק', danger: true }))) return;
        await App.store.deleteTeacher(t); App.toast('התיק נמחק'); App.replace('/');
      } }, 'מחיקת תיק המחנכת')));
    }
    return p.root;
  };

  // ---------- תיק המחנכת ----------
  V.teacher = async ([id], q) => {
    const t = await App.db.get('teachers', id);
    if (!t) return App.notFound('המחנכת לא נמצאה');
    const [school, records, teachers, fileCounts, themes] = await Promise.all([
      App.db.get('schools', t.schoolId), App.store.teacherRecords(id), App.store.teachers(), App.fileCounts(), App.getThemes()]);
    const tMap = Object.fromEntries(teachers.map((x) => [x.id, x]));
    records.sort((a, b) => App.recDate(b).localeCompare(App.recDate(a)) || (b.createdAt || '').localeCompare(a.createdAt || ''));

    const p = App.page({ title: 'תיק מחנכת', back: '#/', right: h('a', { class: 'icon-btn', href: '#/t/' + id + '/edit', 'aria-label': 'עריכת פרטים ותמונה' }, '✎'), cls: 'teacher' });
    const intakeFilled = App.INTAKE_FIELDS.filter((f) => f.label && (t.intake || {})[f.key]).length;

    const newHref = (type) => `#/new/${type}?t=${id}`;
    p.body.append(
      h('div', { class: 'thead' }, App.avatar(t, 'xl'),
        h('div', null, h('h2', { class: 'thead-name' }, t.name),
          h('div', { class: 'muted' }, [school && school.name, t.className && 'כיתה ' + t.className].filter(Boolean).join(' · ')))),
      h('a', { class: 'btn primary big block', href: newHref('observation') }, '👁️  תצפית חדשה בשיעור'),
      h('div', { class: 'quick' },
        ['event', 'personal', 'group', 'reflection', 'goal'].map((type) => h('a', { class: 'quick-btn', href: newHref(type) },
          h('span', { class: 'qi' }, App.RECORD_TYPES[type].icon), App.RECORD_TYPES[type].label))));

    // לשוניות
    const tabs = [['timeline', 'רצף תיעודים'], ['intake', 'רקע וכיתה'], ['goals', 'יעדים']];
    let tab = q.get('tab') || 'timeline';
    const tabBar = h('div', { class: 'tabs', role: 'tablist' });
    const pane = h('div', { class: 'tab-pane' });
    const drawTabs = () => App.fill(tabBar, ...tabs.map(([k, l]) => h('button', {
      type: 'button', role: 'tab', class: 'tab' + (tab === k ? ' on' : ''), 'aria-selected': String(tab === k),
      onclick: () => { tab = k; history.replaceState(null, '', `#/t/${id}${k === 'timeline' ? '' : '?tab=' + k}`); drawTabs(); drawPane(); },
    }, l, k === 'goals' ? ` (${records.filter((r) => r.type === 'goal').length})` : '')));

    // סינון ציר זמן
    let fType = 'all', fTag = '';
    const allTags = [...new Set(records.flatMap((r) => [...App.recTags(r).map((x) => 'tag:' + x), ...(r.anchors || []).map((x) => 'anchor:' + x), ...App.recThemes(r).map((x) => 'theme:' + x)]))];
    const themeTitle = (tid) => (themes.find((x) => x.id === tid) || {}).title || tid;
    const tagLabel = (k) => { const [kind, v] = k.split(/:(.*)/); return kind === 'anchor' ? '⚓ ' + ((App.ANCHORS.find((a) => a.id === v) || {}).label || v) : kind === 'theme' ? '◇ ' + themeTitle(v) : '#' + v; };
    const matches = (r) => (fType === 'all' || r.type === fType) && (!fTag || (() => {
      const [kind, v] = fTag.split(/:(.*)/);
      return kind === 'tag' ? App.recTags(r).includes(v) : kind === 'anchor' ? (r.anchors || []).includes(v) : App.recThemes(r).includes(v);
    })());

    function drawTimeline() {
      if (!records.length) {
        App.fill(pane, App.empty('עוד אין תיעודים בתיק. אפשר להתחיל בתצפית או במילוי הרקע.',
          h('a', { class: 'btn primary', href: newHref('observation') }, '+ תצפית חדשה')));
        return;
      }
      const typeChips = h('div', { class: 'chips scroll' }, [['all', 'הכול'], ...Object.entries(App.RECORD_TYPES).map(([k, v]) => [k, v.short])]
        .filter(([k]) => k === 'all' || records.some((r) => r.type === k))
        .map(([k, l]) => h('button', { type: 'button', class: 'chip' + (fType === k ? ' on' : ''), onclick: () => { fType = k; drawTimeline(); } }, l)));
      const tagSel = h('select', { 'aria-label': 'סינון לפי תגית, תמה או עוגן' },
        h('option', { value: '' }, 'כל התגיות, התמות והעוגנים'), allTags.sort().map((k) => h('option', { value: k }, tagLabel(k))));
      tagSel.value = fTag;
      tagSel.addEventListener('change', () => { fTag = tagSel.value; drawTimeline(); });
      const list = records.filter(matches);
      const groups = [];
      for (const r of list) {
        const m = App.fmtMonth(App.recDate(r));
        if (!groups.length || groups[groups.length - 1][0] !== m) groups.push([m, []]);
        groups[groups.length - 1][1].push(r);
      }
      App.fill(pane, typeChips, allTags.length ? h('div', { class: 'filter-row' }, tagSel) : null,
        list.length ? h('div', { class: 'timeline' }, groups.map(([m, rs]) => [h('div', { class: 'tl-month' }, m), ...rs.map((r) => App.recordItem(r, { tMap, fileCounts }))]))
          : App.empty('אין תיעודים שמתאימים לסינון.'));
    }

    function drawIntake() {
      const filled = App.INTAKE_FIELDS.filter((f) => f.label && (t.intake || {})[f.key]);
      const schedCount = (fileCounts['intake:' + id] || {});
      App.fill(pane, App.section(null,
        h('div', { class: 'row between' }, h('div', { class: 'muted small' }, `מולאו ${intakeFilled} מתוך ${App.INTAKE_FIELDS.filter((f) => f.label).length} שדות · אפשר להשלים בהדרגה`),
          h('a', { class: 'btn primary small', href: '#/t/' + id + '/intake' }, filled.length ? '✎ עדכון' : '+ מילוי רקע')),
        filled.length ? Object.entries(App.INTAKE_GROUPS).map(([g, info]) => {
          const fs = filled.filter((f) => f.group === g);
          return fs.length ? [h('h3', { class: 'facts-group' }, info.title), h('dl', { class: 'facts' }, fs.map((f) => [h('dt', null, f.label), h('dd', { class: 'pre' }, t.intake[f.key])]))] : null;
        }) : h('p', { class: 'muted' }, 'עוד לא מולא רקע לכיתה.'),
        (t.intake || {}).meetingNotes ? [h('h3', { class: 'facts-group' }, 'תיעוד מפגש ההיכרות'), h('p', { class: 'pre' }, t.intake.meetingNotes)] : null,
        (fileCounts['intake-meeting:' + id] || {}).audio ? h('p', { class: 'small' }, '🎙 הקלטות מהפגישה: ' + fileCounts['intake-meeting:' + id].audio + ' — ', h('a', { href: '#/t/' + id + '/intake' }, 'האזנה')) : null,
        (schedCount.image || schedCount.file) ? h('p', { class: 'small' }, '🗓 מערכת שעות מצורפת (' + ((schedCount.image || 0) + (schedCount.file || 0)) + ' קבצים) — ', h('a', { href: '#/t/' + id + '/intake' }, 'הצגה')) : null));
    }

    function drawGoals() {
      const goals = records.filter((r) => r.type === 'goal');
      App.fill(pane, 
        goals.length ? h('div', { class: 'timeline' }, goals.map((r) => App.recordItem(r, { tMap, fileCounts }))) : App.empty('עוד לא הוגדרו יעדים לתקופת הליווי.'),
        h('a', { class: 'btn primary mt', href: newHref('goal') }, '+ יעד חדש'));
    }
    const drawPane = () => (tab === 'intake' ? drawIntake() : tab === 'goals' ? drawGoals() : drawTimeline());
    drawTabs(); drawPane();
    p.body.append(tabBar, pane);
    return p.root;
  };

  // ---------- אינטייק ----------
  V.intake = async ([id]) => {
    const t = await App.db.get('teachers', id);
    if (!t) return App.notFound('המחנכת לא נמצאה');
    t.intake = t.intake || {};
    const schools = await App.store.schools();
    const ind = App.saveIndicator('saved', t.updatedAt);
    const saver = App.makeSaver(() => App.store.save('teachers', t), ind);
    App.onCleanup(() => saver.flush());
    const touch = () => saver.touch();
    const p = App.page({ title: 'רקע וכיתה', sub: t.name, back: '#/t/' + id + '?tab=intake', right: ind.el, cls: 'editor' });

    const nameErr = h('div', { class: 'error' });
    const basics = App.section('פרטים בסיסיים', h('div', { class: 'fields' },
      App.field({ key: 'name', label: 'שם המחנכת', type: 'text', half: true }, t.name, (v) => {
        if (!v.trim()) { nameErr.textContent = 'השם לא יכול להיות ריק — הוא לא נשמר.'; return; }
        nameErr.textContent = ''; t.name = v.trim(); touch();
      }),
      App.field({ key: 'schoolId', label: 'בית הספר', type: 'select', half: true, options: schools.map((s) => ({ value: s.id, label: s.name })) }, t.schoolId, (v) => { t.schoolId = v; touch(); }),
      App.field({ key: 'className', label: 'הכיתה שהיא מחנכת', type: 'text', half: true }, t.className, (v) => { t.className = v; touch(); })), nameErr);

    // תיעוד חופשי והקלטה בזמן פגישת ההיכרות — ממלאים את השדות אחר כך, בקצב שלך
    const notes = App.autogrow(h('textarea', { rows: 5, value: t.intake.meetingNotes || '', 'aria-label': 'תיעוד חופשי מהפגישה',
      placeholder: 'מה עולה בשיחה עם המחנכת… אפשר לכתוב כאן חופשי ולהעביר לשדות אחר כך.' }));
    notes.addEventListener('input', () => { t.intake.meetingNotes = notes.value; touch(); });
    const meeting = App.section('תיעוד מפגש ההיכרות',
      h('p', { class: 'hint' }, 'אפשר לכתוב חופשי או להקליט בזמן הפגישה, ולמלא את השדות למטה אחר כך.'),
      notes,
      h('div', { class: 'mt' }, App.attachments({ ownerId: 'intake-meeting:' + id })),
      h('p', { class: 'note mt' }, 'בהמשך: כפתור שיציע ערכים לשדות שעוד לא מולאו, מתוך הטקסט וההקלטה — לאישור שלך לפני שנשמרים (דורש חיבור לבינה מלאכותית).'));

    const groups = Object.entries(App.INTAKE_GROUPS).map(([g, info]) => {
      const box = h('div', { class: 'fields' });
      for (const f of App.INTAKE_FIELDS.filter((x) => x.group === g)) {
        if (f.key === '__schedule') {
          box.append(h('div', { class: 'field full' }, h('label', null, 'מערכת שעות'), h('div', { class: 'hint' }, 'צילום או העלאה של מערכת השעות'),
            App.attachments({ ownerId: 'intake:' + id, noAudio: true })));
        } else box.append(App.field(f, t.intake[f.key], (v) => { t.intake[f.key] = v; touch(); }));
      }
      return App.section(info.title, info.hint ? h('p', { class: 'hint' }, info.hint) : null, box);
    });
    p.body.append(h('p', { class: 'muted small' }, 'אפשר למלא בהדרגה. כל שינוי נשמר אוטומטית.'), meeting, basics, groups,
      h('div', { class: 'row center mt' }, h('a', { class: 'btn primary', href: '#/t/' + id + '?tab=intake' }, 'סיום')));
    return p.root;
  };

  // ---------- תיעודים: חיפוש וסינון חוצה תיקים ----------
  V.explore = async () => {
    const [records, teachers, themes, fileCounts, contacts] = await Promise.all([App.store.records(), App.store.teachers(), App.getThemes(), App.fileCounts(), App.store.contacts()]);
    const tMap = Object.fromEntries(teachers.map((t) => [t.id, t]));
    const cMap = Object.fromEntries(contacts.map((c) => [c.id, c]));
    records.sort((a, b) => App.recDate(b).localeCompare(App.recDate(a)));
    const f = { text: '', type: 'all', anchor: '', theme: '', tag: '' };
    const p = App.page({ title: 'כל התיעודים', sub: 'סינון לפי סוג, תמה, עוגן ותגית' });
    const out = h('div');
    const text = h('input', { type: 'search', placeholder: 'חיפוש חופשי בתוכן…', 'aria-label': 'חיפוש בתוכן' });
    text.addEventListener('input', () => { f.text = text.value.trim(); draw(); });
    const sel = (label, key, opts) => {
      const s = h('select', { 'aria-label': label }, h('option', { value: '' }, label), opts.map(([v, l]) => h('option', { value: v }, l)));
      s.addEventListener('change', () => { f[key] = s.value; draw(); });
      return s;
    };
    const allTags = [...new Set(records.flatMap(App.recTags))].sort();
    const typeRow = h('div', { class: 'chips scroll' });
    const drawTypes = () => App.fill(typeRow, ...[['all', 'הכול'], ...Object.entries(App.RECORD_TYPES).map(([k, v]) => [k, v.short])]
      .map(([k, l]) => h('button', { type: 'button', class: 'chip' + (f.type === k ? ' on' : ''), onclick: () => { f.type = k; drawTypes(); draw(); } }, l)));
    drawTypes();
    const textOf = (r) => [JSON.stringify(r.data || {}), ...(r.entries || []).map((e) => e.text), ...Object.values(r.themeNotes || {}), ...(r.progress || []).map((x) => x.text)].join(' ');
    const draw = () => {
      const list = records.filter((r) => (f.type === 'all' || r.type === f.type)
        && (!f.anchor || (r.anchors || []).includes(f.anchor))
        && (!f.theme || App.recThemes(r).includes(f.theme))
        && (!f.tag || App.recTags(r).includes(f.tag))
        && (!f.text || textOf(r).includes(f.text)));
      App.fill(out, h('div', { class: 'muted small mt' }, `${list.length} תיעודים`),
        list.length ? h('div', { class: 'timeline' }, list.map((r) => App.recordItem(r, { tMap, cMap, fileCounts, showTeacher: true }))) : App.empty('לא נמצאו תיעודים.'));
    };
    p.body.append(h('div', { class: 'searchbar' }, text), typeRow,
      h('div', { class: 'filter-grid' },
        sel('כל העוגנים', 'anchor', App.ANCHORS.map((a) => [a.id, a.label])),
        sel('כל התמות', 'theme', themes.map((t) => [t.id, t.title])),
        sel('כל התגיות', 'tag', allTags.map((t) => [t, '#' + t]))),
      out);
    draw();
    return p.root;
  };

  // ---------- הגדרות ----------
  V.settings = async () => {
    const user = App.state.user || {};
    const p = App.page({ title: 'הגדרות' });

    const syncInfo = h('div', { class: 'small' });
    const drawSync = () => {
      syncInfo.textContent = !App.sync.online ? '⚠ אין חיבור כרגע. מה שנכתב נשמר במכשיר ויסונכרן כשהחיבור יחזור.'
        : App.sync.pending ? 'מסנכרן שינויים…' : '✓ הכול מסונכרן בענן';
    };
    drawSync(); App.onCleanup(App.sync.onChange(drawSync));

    const importInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'visually-hidden' });
    importInput.addEventListener('change', async () => {
      const file = importInput.files[0]; importInput.value = '';
      if (!file) return;
      if (!(await App.confirm('הייבוא יחליף את כל המידע שלך במידע מהקובץ. להמשיך?', { ok: 'ייבוא', danger: true }))) return;
      try { await App.importAll(JSON.parse(await file.text())); await App.sync.waitIdle(); App.toast('הגיבוי נטען'); setTimeout(() => location.reload(), 600); }
      catch (e) { console.error(e); App.toast('הקובץ לא תקין', 'error'); }
    });

    p.body.append(
      App.section('החשבון שלי', h('div', { class: 'row between' },
        h('div', { class: 'row gap' },
          user.photoURL ? h('img', { class: 'avatar md', src: user.photoURL, alt: '', referrerpolicy: 'no-referrer' }) : null,
          h('div', null, h('div', { class: 'strong' }, user.displayName || ''), h('div', { class: 'muted small' }, user.email || ''))),
        h('button', { type: 'button', class: 'btn small', onclick: async () => {
          if (App.sync.pending && !(await App.confirm('יש שינויים שעוד לא סונכרנו לענן. אם תצאי עכשיו הם יאבדו. לצאת בכל זאת?', { ok: 'יציאה', danger: true }))) return;
          await App.runCleanups(); await App.cloud.signOut(); location.replace(location.pathname);
        } }, 'יציאה'))),
      App.section('איפה נשמר המידע',
        h('p', null, 'התיעודים, התיקים, היעדים ותמונות המחנכות נשמרים ', h('strong', null, 'בענן'), ', ומסונכרנים בין כל המכשירים שבהם את מחוברת. רק את רואה אותם.'),
        h('p', null, h('strong', null, 'הקלטות, תמונות וקבצים מצורפים'), ' נשמרים כרגע ', h('strong', null, 'רק במכשיר שבו צורפו'), '.'),
        syncInfo,
        h('div', { class: 'row gap wrap mt' },
          h('button', { type: 'button', class: 'btn small', onclick: () => App.exportAll() }, '⬇ יצוא גיבוי לקובץ'),
          h('label', { class: 'btn small' }, importInput, '⬆ ייבוא גיבוי'))),
      await themesEditor(),
      await tagsEditor(),
      App.section('מחיקת המידע',
        h('p', { class: 'muted small' }, 'מוחק את כל המידע שלך — בענן ובמכשיר הזה. אחרי המחיקה אפשר לבחור להתחיל ריק או עם נתוני דוגמה.'),
        h('button', { type: 'button', class: 'btn danger-text', onclick: async () => {
          if (!(await App.confirm('כל המידע שלך יימחק — כל המחנכות, התיעודים והקבצים. לא ניתן לשחזר. להמשיך?', { title: 'מחיקת כל המידע', ok: 'מחיקה', danger: true }))) return;
          for (const s of App.db.STORES) await App.db.clear(s);
          await App.sync.waitIdle();
          App.toast('המידע נמחק'); setTimeout(() => location.reload(), 500);
        } }, 'מחיקת כל המידע שלי')));
    return p.root;
  };

  async function themesEditor() {
    const themes = await App.getThemes();
    const ind = App.saveIndicator('saved');
    const saver = App.makeSaver(() => App.settings.set('themes', themes), ind, 500);
    App.onCleanup(() => saver.flush());
    const list = h('div', { class: 'theme-list' });
    const draw = () => App.fill(list, ...themes.map((t) => {
      const active = h('input', { type: 'checkbox', checked: t.active !== false });
      active.addEventListener('change', () => { t.active = active.checked; saver.touch(); });
      return h('details', { class: 'theme-edit' + (t.active === false ? ' off' : '') },
        h('summary', null, t.title, t.active === false ? h('span', { class: 'muted small' }, ' · מוסתרת') : null),
        App.field({ key: 'title', label: 'שם התמה', type: 'text' }, t.title, (v) => { if (v.trim()) { t.title = v.trim(); saver.touch(); } }),
        App.field({ key: 'prompts', label: 'שאלות מנחות (שאלה בכל שורה)', type: 'textarea', rows: 3 }, (t.prompts || []).join('\n'),
          (v) => { t.prompts = v.split('\n').map((x) => x.trim()).filter(Boolean); saver.touch(); }),
        h('label', { class: 'row gap small' }, active, 'מוצגת בתצפיות חדשות'));
    }));
    draw();
    return App.section('תמות התבוננות ושאלות מנחות',
      h('div', { class: 'row between' }, h('p', { class: 'muted small' }, 'התמות הן הצעה ראשונית. אפשר לערוך, להוסיף ולהסתיר. תמה מוסתרת נשארת בתיעודים קיימים.'), ind.el),
      list,
      h('button', { type: 'button', class: 'btn small mt', onclick: () => {
        themes.push({ id: 'th-' + App.uid().slice(0, 8), title: 'תמה חדשה', prompts: [], active: true });
        saver.touch(); draw(); list.lastChild.open = true;
      } }, '+ תמה חדשה'));
  }

  async function tagsEditor() {
    const tags = await App.getTags();
    const wrap = h('div', { class: 'chips wrap' });
    const draw = () => App.fill(wrap, ...tags.map((t) => h('span', { class: 'chip static on' }, '#' + t,
      h('button', { type: 'button', class: 'chip-x', 'aria-label': 'הסרת ' + t, onclick: async () => {
        tags.splice(tags.indexOf(t), 1); await App.settings.set('tags', tags); draw();
      } }, '✕'))));
    draw();
    const inp = h('input', { type: 'text', placeholder: 'תגית חדשה…' });
    const add = async () => { const v = inp.value.trim(); if (v && !tags.includes(v)) { tags.push(v); await App.settings.set('tags', tags); draw(); } inp.value = ''; };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    return App.section('תגיות משותפות',
      h('p', { class: 'muted small' }, 'רשימת התגיות המוצעות. הסרת תגית מהרשימה לא מסירה אותה מתיעודים קיימים.'),
      wrap, h('div', { class: 'row gap mt' }, inp, h('button', { type: 'button', class: 'btn', onclick: add }, 'הוספה')));
  }

  // ---------- גיבוי ----------
  const toB64 = (buf) => { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
  const fromB64 = (s) => { const bin = atob(s); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b.buffer; };

  App.exportAll = async () => {
    const out = { app: 'mentoring-journal', version: 1, exportedAt: new Date().toISOString(), stores: {} };
    for (const s of App.db.STORES) {
      const rows = await App.db.all(s);
      out.stores[s] = s === 'blobs' ? rows.map((r) => ({ id: r.id, b64: toB64(r.data) })) : rows;
    }
    const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `יומן-ליווי-גיבוי-${App.todayISO()}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  App.importAll = async (data) => {
    if (!data || data.app !== 'mentoring-journal' || !data.stores) throw new Error('bad file');
    for (const s of App.db.STORES) await App.db.clear(s);
    for (const s of App.db.STORES) {
      for (const r of data.stores[s] || []) await App.db.put(s, s === 'blobs' ? { id: r.id, data: fromB64(r.b64) } : r);
    }
  };
})(window.App);
