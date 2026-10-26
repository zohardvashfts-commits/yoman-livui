'use strict';
// ניתוב בין מסכים, כניסה והפעלה ראשונית.
(function (App) {
  const { h } = App;
  const V = App.views;
  const routes = [
    [/^\/?$/, V.home, 'home'],
    [/^\/welcome$/, V.welcome, null],
    [/^\/overview$/, V.overview, 'overview'],
    [/^\/schools$/, V.schools, 'schools'],
    [/^\/school\/new$/, () => V.schoolForm([]), 'schools'],
    [/^\/school\/([^/]+)\/edit$/, V.schoolForm, 'schools'],
    [/^\/school\/([^/]+)$/, V.school, 'schools'],
    [/^\/teacher\/new$/, (_, q) => V.teacherForm([], q), 'home'],
    [/^\/t\/([^/]+)\/edit$/, V.teacherForm, 'home'],
    [/^\/t\/([^/]+)\/intake$/, V.intake, 'home'],
    [/^\/t\/([^/]+)$/, V.teacher, 'home'],
    [/^\/contact\/new$/, (_, q) => V.contactForm([], q), 'home'],
    [/^\/c\/([^/]+)\/edit$/, V.contactForm, 'home'],
    [/^\/c\/([^/]+)$/, V.contact, 'home'],
    [/^\/new\/(\w+)$/, V.newRecord, 'home'],
    [/^\/r\/([^/]+)\/edit$/, V.recordEdit, 'editor'],
    [/^\/r\/([^/]+)$/, V.recordView, 'home'],
    [/^\/explore$/, V.explore, 'explore'],
    [/^\/settings$/, V.settings, 'settings'],
  ];

  const app = document.getElementById('app');
  const tabbar = document.getElementById('tabbar');
  let token = 0;

  function show(node, tab) {
    app.replaceChildren(node);
    node.querySelectorAll('textarea').forEach((ta) => ta._fit && ta._fit());
    window.scrollTo(0, 0);
    tabbar.hidden = tab === 'editor' || tab == null;
    document.body.classList.toggle('has-tabbar', !tabbar.hidden);
    tabbar.querySelectorAll('a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
    const h1 = node.querySelector('h1');
    document.title = h1 && h1.textContent !== 'יומן ליווי' ? h1.textContent + ' · יומן ליווי' : 'יומן ליווי';
  }

  async function route() {
    if (!App.state.mentorId) return; // לא מחוברת — מסך הכניסה מוצג
    const raw = decodeURI(location.hash.slice(1)) || '/';
    const [path, qs] = raw.split('?');
    const query = new URLSearchParams(qs || '');
    const my = ++token;
    await App.runCleanups();
    for (const [re, view, tab] of routes) {
      const m = path.match(re);
      if (!m) continue;
      let node;
      try { node = await view(m.slice(1), query); }
      catch (e) { console.error(e); node = errorPage(e); }
      if (my !== token || !node) return;
      show(node, tab);
      return;
    }
    show(App.notFound(), 'home');
  }

  function errorPage(e) {
    const p = App.page({ title: 'משהו השתבש', back: '#/' });
    p.body.append(App.empty('לא הצלחנו להציג את המסך. המידע השמור לא נפגע.', h('a', { class: 'btn primary', href: '#/' }, 'חזרה למסך הבית')),
      h('p', { class: 'muted small center' }, String(e && e.message || e)));
    return p.root;
  }

  const fatal = (msg) => show(h('div', { class: 'page' }, h('div', { class: 'page-body' }, App.empty(msg))), null);

  // שמירת שינויים פתוחים כשהדף עובר לרקע או נסגר
  const flushAll = () => App.flushers.forEach((f) => f());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll(); });
  window.addEventListener('pagehide', flushAll);

  async function onSignedIn(user) {
    App.cloud.uid = user.uid;
    let allowed;
    try { allowed = await App.cloud.checkAccess(); }
    catch (e) { console.error(e); allowed = true; } // בלי חיבור — ממשיכים עם המידע השמור במכשיר
    if (!allowed) { App.cloud.uid = null; show(V.denied(user), null); return; }

    App.state.user = user;
    App.state.mentorId = user.uid;
    App.db.put('mentors', { id: user.uid, name: user.displayName || user.email, email: user.email, updatedAt: new Date().toISOString() });
    if (!(await App.settings.get('onboarded', false)) && !(await App.store.schools()).length) App.replace('/welcome');
    else if (['', '#', '#/'].includes(location.hash)) App.replace('/overview'); // פתיחה במסך הסקירה
    route();
  }

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('אין עבודה בלי חיבור:', e));
  }

  (async function init() {
    try { await App.db.open(); } catch (e) { console.warn('אין אחסון מקומי לקבצים:', e); }
    if (!App.cloud.available()) { show(V.login(), null); return; }
    try { await App.cloud.init(); }
    catch (e) { console.error(e); fatal('לא הצלחנו להתחבר לשירות. בדקי את החיבור לאינטרנט ונסי שוב.'); return; }
    window.addEventListener('hashchange', route);
    App.cloud.onAuth((user) => {
      if (user) onSignedIn(user);
      else { App.state.mentorId = null; App.state.user = null; App.cloud.uid = null; show(V.login(), null); }
    });
  })();
})(window.App);
