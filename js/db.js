'use strict';
// שכבת אחסון. כל הגישה לנתונים עוברת דרך App.db / App.files / App.store / App.settings.
// מידע טקסטואלי נשמר בענן (cloud.js), וקבצים נשמרים בינתיים ב-IndexedDB במכשיר.
(function (App) {
  const NAME = 'mentoring-journal';
  const VERSION = 1;
  const STORES = ['mentors', 'schools', 'teachers', 'contacts', 'records', 'files', 'blobs', 'settings'];
  let dbp;

  const req2p = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('IndexedDB לא זמין'));
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        const mk = (name, indexes = [], keyPath = 'id') => {
          const st = db.createObjectStore(name, { keyPath });
          indexes.forEach(([n, k, o]) => st.createIndex(n, k, o || {}));
        };
        mk('mentors');
        mk('schools', [['mentorId', 'mentorId']]);
        mk('teachers', [['mentorId', 'mentorId'], ['schoolId', 'schoolId']]);
        mk('records', [['mentorId', 'mentorId'], ['teacherIds', 'teacherIds', { multiEntry: true }], ['schoolId', 'schoolId']]);
        mk('files', [['ownerId', 'ownerId']]); // מטא־דאטה של קבצים
        mk('blobs'); // תוכן הקבצים עצמו
        mk('settings', [], 'key');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('מסד הנתונים חסום על ידי לשונית אחרת'));
    });
    return dbp;
  }

  async function store(name, mode = 'readonly') {
    const db = await open();
    return db.transaction(name, mode).objectStore(name);
  }

  // אחסון מקומי בדפדפן (IndexedDB)
  const local = {
    get: async (s, id) => req2p((await store(s)).get(id)),
    all: async (s) => req2p((await store(s)).getAll()),
    put: async (s, obj) => req2p((await store(s, 'readwrite')).put(obj)),
    del: async (s, id) => req2p((await store(s, 'readwrite')).delete(id)),
    clear: async (s) => req2p((await store(s, 'readwrite')).clear()),
    byIndex: async (s, idx, val) => req2p((await store(s)).index(idx).getAll(val)),
  };

  // קבצים (הקלטות, תמונות, מסמכים) נשארים בינתיים במכשיר — שמירת קבצים בענן דורשת את תוכנית Blaze.
  // כל השאר נשמר בענן כשיש משתמשת מחוברת.
  const LOCAL_ONLY = ['files', 'blobs'];
  const backend = (s) => (App.cloud && App.cloud.uid && !LOCAL_ONLY.includes(s) ? App.cloud : local);

  App.db = {
    open,
    STORES,
    get: (s, id) => backend(s).get(s, id),
    all: (s) => backend(s).all(s),
    put: (s, obj) => backend(s).put(s, obj),
    del: (s, id) => backend(s).del(s, id),
    clear: (s) => backend(s).clear(s),
    byIndex: (s, idx, val) => backend(s).byIndex(s, idx, val),
  };

  App.settings = {
    get: async (key, def) => { const r = await App.db.get('settings', key); return r ? r.value : def; },
    set: (key, value) => App.db.put('settings', { key, value }),
  };

  // קבצים: נשמרים כ-ArrayBuffer (עמיד יותר בין דפדפנים מאשר Blob)
  App.files = {
    async add(ownerId, blob, meta = {}) {
      const id = App.uid();
      const data = await blob.arrayBuffer();
      const rec = {
        id, ownerId,
        kind: meta.kind || (blob.type.startsWith('image/') ? 'image' : blob.type.startsWith('audio/') ? 'audio' : 'file'),
        name: meta.name || blob.name || 'קובץ',
        mime: blob.type || 'application/octet-stream',
        size: blob.size,
        duration: meta.duration || null,
        mentorId: App.state.mentorId,
        createdAt: new Date().toISOString(),
      };
      await App.db.put('blobs', { id, data });
      await App.db.put('files', rec);
      return rec;
    },
    list: async (ownerId) => (await App.db.byIndex('files', 'ownerId', ownerId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    async blob(id) {
      const [meta, b] = await Promise.all([App.db.get('files', id), App.db.get('blobs', id)]);
      return b ? new Blob([b.data], { type: meta ? meta.mime : '' }) : null;
    },
    async remove(id) { await App.db.del('blobs', id); await App.db.del('files', id); },
    async removeOwner(ownerId) { for (const f of await App.files.list(ownerId)) await App.files.remove(f.id); },
  };

  const byName = (a, b) => (a.name || '').localeCompare(b.name || '', 'he');

  App.store = {
    async save(s, obj) {
      const now = new Date().toISOString();
      obj.createdAt = obj.createdAt || now;
      obj.updatedAt = now;
      if (!obj.mentorId && s !== 'mentors') obj.mentorId = App.state.mentorId;
      if (!obj.createdBy && s !== 'mentors') obj.createdBy = App.state.mentorId;
      await App.db.put(s, obj);
      return obj;
    },
    schools: async () => (await App.db.byIndex('schools', 'mentorId', App.state.mentorId)).sort(byName),
    teachers: async () => (await App.db.byIndex('teachers', 'mentorId', App.state.mentorId)).sort(byName),
    records: async () => App.db.byIndex('records', 'mentorId', App.state.mentorId),
    teacherRecords: async (tid) => App.db.byIndex('records', 'teacherIds', tid),
    contacts: async () => (await App.db.byIndex('contacts', 'mentorId', App.state.mentorId)).sort(byName),
    contactRecords: async (cid) => App.db.byIndex('records', 'contactIds', cid),

    async deleteRecord(rec) {
      await App.files.removeOwner(rec.id);
      await App.db.del('records', rec.id);
      for (const r of await App.store.records()) {
        if ((r.links || []).includes(rec.id)) { r.links = r.links.filter((x) => x !== rec.id); await App.store.save('records', r); }
      }
    },
    async deleteContact(c) {
      for (const r of await App.store.contactRecords(c.id)) {
        if (r.contactIds.length > 1) { r.contactIds = r.contactIds.filter((x) => x !== c.id); await App.store.save('records', r); }
        else await App.store.deleteRecord(r);
      }
      await App.db.del('contacts', c.id);
    },
    async deleteTeacher(t) {
      for (const r of await App.store.teacherRecords(t.id)) {
        if (r.teacherIds.length > 1) { r.teacherIds = r.teacherIds.filter((x) => x !== t.id); await App.store.save('records', r); }
        else await App.store.deleteRecord(r);
      }
      await App.files.removeOwner('photo:' + t.id);
      await App.files.removeOwner('intake:' + t.id);
      await App.files.removeOwner('intake-meeting:' + t.id);
      await App.db.del('teachers', t.id);
    },
  };
})(window.App);
