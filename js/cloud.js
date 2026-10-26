'use strict';
// חיבור לענן: כניסה עם Google ושמירה ב-Firestore.
// המידע של כל מנחה נשמר תחת users/<uid>/... ורק היא יכולה לגשת אליו (ראו firestore.rules).
// Firestore שומר עותק מקומי, כך שאפשר לעבוד גם בלי חיבור — השינויים מסתנכרנים כשהחיבור חוזר.
(function (App) {
  let fs, auth;
  let pending = 0;
  const listeners = new Set();
  const notify = () => listeners.forEach((fn) => fn());

  // מעקב אחרי כתיבות שעוד לא אושרו על ידי השרת
  function track(p) {
    pending++; notify();
    p.then(() => { pending--; notify(); }, (e) => {
      pending--; notify();
      console.error(e);
      App.toast(e && e.code === 'permission-denied' ? 'אין הרשאה לשמור — פני למנהלת המערכת' : 'שגיאה בסנכרון לענן', 'error');
    });
  }

  App.sync = {
    get pending() { return pending; },
    get online() { return navigator.onLine; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    // מחכה שכל השינויים יגיעו לשרת (לפני רענון או יציאה). בלי חיבור — לא מחכה לנצח.
    waitIdle(ms = 8000) {
      return new Promise((resolve) => {
        if (!pending || !navigator.onLine) return resolve();
        const t = setTimeout(done, ms);
        const off = App.sync.onChange(() => { if (!pending) done(); });
        function done() { clearTimeout(t); off(); resolve(); }
      });
    },
  };
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);

  App.cloud = {
    uid: null,
    available: () => !!window.firebase && location.protocol !== 'file:',

    async init() {
      firebase.initializeApp(App.FIREBASE_CONFIG);
      auth = firebase.auth();
      fs = firebase.firestore();
      fs.settings({ ignoreUndefinedProperties: true, merge: true });
      try { await fs.enablePersistence({ synchronizeTabs: true }); }
      catch (e) { console.warn('אין עותק מקומי (לא תהיה עבודה בלי חיבור):', e.code); }
      return auth;
    },

    onAuth: (fn) => auth.onAuthStateChanged(fn),

    async signIn() {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try { await auth.signInWithPopup(provider); }
      catch (e) {
        if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
          await auth.signInWithRedirect(provider);
        } else if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') throw e;
      }
    },

    // ביציאה מוחקים גם את העותק המקומי, כדי שמי שתשתמש במכשיר אחר כך לא תראה את המידע
    async signOut() {
      await auth.signOut();
      try { await fs.terminate(); await fs.clearPersistence(); } catch (e) { console.warn(e); }
    },

    // בדיקה שהחשבון מורשה (כללי האבטחה דוחים חשבון שלא נמצא ברשימה)
    async checkAccess() {
      try { await App.cloud.col('settings').doc('profile').get(); return true; }
      catch (e) { if (e.code === 'permission-denied') return false; throw e; }
    },

    col: (s) => fs.collection('users').doc(App.cloud.uid).collection(s),

    async get(s, id) { const d = await App.cloud.col(s).doc(id).get(); return d.exists ? d.data() : undefined; },
    async all(s) { return (await App.cloud.col(s).get()).docs.map((d) => d.data()); },
    // לא מחכים לאישור השרת: השינוי נשמר מיד בעותק המקומי ומסתנכרן ברקע
    put(s, obj) { track(App.cloud.col(s).doc(obj.id || obj.key).set(obj)); return Promise.resolve(); },
    del(s, id) { track(App.cloud.col(s).doc(id).delete()); return Promise.resolve(); },
    async clear(s) { (await App.cloud.col(s).get()).docs.forEach((d) => track(d.ref.delete())); },
    async byIndex(s, idx, val) {
      if (idx === 'mentorId') return App.cloud.all(s); // כל המידע תחת המשתמשת שייך לה
      const q = App.cloud.col(s).where(idx, (idx === 'teacherIds' || idx === 'contactIds') ? 'array-contains' : '==', val);
      return (await q.get()).docs.map((d) => d.data());
    },
  };
})(window.App);
