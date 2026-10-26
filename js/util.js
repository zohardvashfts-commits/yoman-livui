'use strict';
// כלים כלליים: יצירת אלמנטים, תאריכים, הודעות, חלונות אישור.
window.App = window.App || {};
(function (App) {
  App.state = { mentorId: null, homeSchool: 'all', homeSearch: '' };
  App.pending = {}; // רשומות חדשות שעדיין לא נשמרו (נשמרות בשינוי הראשון)

  App.uid = () =>
    (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
      : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

  // יצירת אלמנט: h('div', {class:'x', onclick: fn}, 'טקסט', child)
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    let value;
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'value') value = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    if (value !== undefined) el.value = value;
    return el;
  }
  App.h = h;
  // החלפת תוכן אלמנט, תוך דילוג על null/false (בניגוד ל-replaceChildren שהופך אותם לטקסט)
  App.fill = (el, ...children) => el.replaceChildren(...children.flat(Infinity).filter((c) => c != null && c !== false));

  const pad = (n) => String(n).padStart(2, '0');
  App.todayISO = (offsetDays = 0) => {
    const d = new Date(); d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  App.nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  const dateFmt = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
  const monthFmt = new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' });
  const parseISO = (iso) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
  App.fmtDate = (iso) => (iso ? dateFmt.format(parseISO(iso)) : '');
  App.fmtMonth = (iso) => (iso ? monthFmt.format(parseISO(iso)) : '');
  App.fmtTime = (ts) => (ts ? new Date(ts).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '');
  App.fmtDuration = (sec) => `${pad(Math.floor(sec / 60))}:${pad(Math.floor(sec % 60))}`;
  App.fileSize = (b) => (b < 1024 ? b + ' B' : b < 1048576 ? Math.round(b / 1024) + ' KB' : (b / 1048576).toFixed(1) + ' MB');

  App.debounce = (fn, ms) => {
    let t;
    const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    d.cancel = () => clearTimeout(t);
    return d;
  };

  App.truncate = (s, n) => { s = (s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  App.firstLine = (s) => (s || '').split('\n').map((x) => x.trim()).find(Boolean) || '';
  App.initials = (name) => (name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('');
  App.colorFor = (str) => {
    let x = 0; for (const ch of str || '') x = (x * 31 + ch.charCodeAt(0)) >>> 0;
    const hues = [18, 32, 95, 140, 175, 200, 280, 340];
    return `hsl(${hues[x % hues.length]} 38% 46%)`;
  };

  // ---- ניקוי בעת מעבר מסך ----
  let cleanups = [], urls = [];
  App.flushers = new Set(); // נקראים גם כשהדף עובר לרקע
  App.onCleanup = (fn) => cleanups.push(fn);
  App.objectURL = (blob) => { const u = URL.createObjectURL(blob); urls.push(u); return u; };
  App.runCleanups = async () => {
    const list = cleanups; cleanups = [];
    for (const fn of list) { try { await fn(); } catch (e) { console.error(e); } }
    urls.forEach((u) => URL.revokeObjectURL(u)); urls = [];
    App.flushers.clear();
  };

  App.go = (path) => { location.hash = path; };
  App.replace = (path) => { location.replace('#' + path); };

  // ---- הודעה קצרה ----
  let toastT;
  App.toast = (msg, kind = '') => {
    const el = document.getElementById('toast');
    el.textContent = msg; el.className = 'show ' + kind;
    clearTimeout(toastT); toastT = setTimeout(() => { el.className = ''; }, 2600);
  };

  // ---- חלון קופץ ----
  App.modal = ({ title, body, actions = [] }) => new Promise((resolve) => {
    const dlg = h('dialog', { class: 'modal' });
    const close = (val) => { if (dlg.open) dlg.close(); dlg.remove(); resolve(val); };
    const foot = h('div', { class: 'modal-foot' }, actions.map((a) =>
      h('button', {
        type: 'button', class: 'btn ' + (a.kind || ''),
        onclick: async () => { const r = a.onClick ? await a.onClick() : undefined; if (r !== false) close(r === undefined ? a.value : r); },
      }, a.label)));
    App.fill(dlg,
      h('div', { class: 'modal-head' }, h('h2', null, title),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'סגירה', onclick: () => close(undefined) }, '✕')),
      h('div', { class: 'modal-body' }, body),
      actions.length ? foot : null);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(undefined); });
    document.body.append(dlg);
    dlg.showModal();
  });

  App.confirm = async (message, { title = 'רגע לפני…', ok = 'אישור', danger = false } = {}) =>
    !!(await App.modal({
      title, body: h('p', null, message),
      actions: [{ label: 'ביטול', value: false }, { label: ok, kind: danger ? 'danger' : 'primary', value: true }],
    }));

  App.toDataURL = (blob) => new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob);
  });

  App.autogrow = (ta) => {
    const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 2, 640) + 'px'; };
    ta.addEventListener('input', fit);
    ta._fit = fit; // נקרא שוב אחרי שהמסך מוצג (לפני כן אין גובה למדוד)
    requestAnimationFrame(fit);
    return ta;
  };
})(window.App);
