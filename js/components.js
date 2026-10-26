'use strict';
// רכיבים משותפים: כותרת מסך, שדות, חיווי שמירה, קבצים מצורפים, תיוג, קישורים.
(function (App) {
  const { h } = App;

  // ---- מבנה מסך ----
  App.page = ({ title, sub, back, right, cls = '' }) => {
    const body = h('div', { class: 'page-body' });
    // כמו append רגיל, אבל מדלג על null/false (אחרת הם מוצגים כטקסט "null")
    body.append = (...c) => Element.prototype.append.apply(body, c.flat(Infinity).filter((x) => x != null && x !== false));
    const root = h('div', { class: 'page ' + cls },
      h('header', { class: 'topbar' },
        back ? h('a', { class: 'icon-btn back', href: back, 'aria-label': 'חזרה' }, '→') : h('span', { class: 'icon-btn ghost' }),
        h('div', { class: 'topbar-title' }, h('h1', null, title), sub ? h('div', { class: 'topbar-sub' }, sub) : null),
        right || h('span', { class: 'icon-btn ghost' })),
      body);
    return { root, body };
  };

  App.section = (title, ...children) => h('section', { class: 'card section' }, title ? h('h2', { class: 'section-title' }, title) : null, ...children);

  App.empty = (text, action) => h('div', { class: 'empty' }, h('p', null, text), action || null);

  App.notFound = (msg = 'הדף לא נמצא') => {
    const p = App.page({ title: 'לא נמצא', back: '#/' });
    p.body.append(App.empty(msg, h('a', { class: 'btn primary', href: '#/' }, 'חזרה למסך הבית')));
    return p.root;
  };

  App.localBanner = () => {
    const el = h('div', { class: 'banner', hidden: true });
    const draw = () => {
      el.hidden = App.sync.online && !App.sync.pending;
      el.textContent = !App.sync.online ? '⚠ אין חיבור לאינטרנט. אפשר להמשיך לעבוד — הכול נשמר במכשיר ויסונכרן כשהחיבור יחזור.' : 'מסנכרן שינויים לענן…';
    };
    draw(); App.onCleanup(App.sync.onChange(draw));
    return el;
  };

  // ---- תמונת מחנכת ----
  App.avatar = (t, size = 'md') => {
    const el = h('div', { class: 'avatar ' + size, style: { background: App.colorFor(t.id) }, 'aria-hidden': 'true' }, App.initials(t.name));
    if (t.photoData) el.replaceChildren(h('img', { src: t.photoData, alt: '' }));
    else if (t.photoFileId) { // תמונות ישנות שנשמרו במכשיר
      App.files.blob(t.photoFileId).then((b) => {
        if (b) App.fill(el, h('img', { src: App.objectURL(b), alt: '' }));
      });
    }
    return el;
  };

  // ---- שדה טופס ----
  App.field = (def, value, onInput) => {
    const id = 'f-' + def.key + '-' + Math.random().toString(36).slice(2, 6);
    let input;
    if (def.type === 'textarea') {
      input = App.autogrow(h('textarea', { id, rows: def.rows || 3, placeholder: def.placeholder || '', value: value || '' }));
    } else if (def.type === 'select') {
      input = h('select', { id }, def.options.map((o) => h('option', { value: o.value ?? o }, o.label ?? o)));
      input.value = value ?? (def.options[0].value ?? def.options[0]);
    } else {
      input = h('input', {
        id, type: def.type === 'number' ? 'text' : (def.type || 'text'),
        inputmode: def.type === 'number' ? 'numeric' : null,
        placeholder: def.placeholder || '', value: value || '',
      });
    }
    input.addEventListener(def.type === 'select' ? 'change' : 'input', () => onInput(input.value));
    return h('div', { class: 'field' + (def.half ? ' half' : '') },
      h('label', { for: id }, def.label),
      def.hint ? h('div', { class: 'hint' }, def.hint) : null,
      input);
  };

  App.fieldGrid = (defs, obj, onChange) => h('div', { class: 'fields' },
    defs.map((def) => App.field(def, obj[def.key], (v) => { obj[def.key] = v; onChange(); })));

  // ---- חיווי שמירה ----
  App.saveIndicator = (initial, at) => {
    const el = h('div', { class: 'save-ind', role: 'status', 'aria-live': 'polite' });
    let cur = initial, curAt = at;
    const set = (state, when) => {
      cur = state; curAt = when;
      if (state === 'saved' && !App.sync.online) state = 'offline';
      else if (state === 'saved' && App.sync.pending) state = 'syncing';
      el.className = 'save-ind ' + state;
      el.textContent = {
        new: 'חדש · יישמר עם ההקלדה',
        saving: 'שומר…',
        saved: '✓ נשמר בענן' + (when ? ' · ' + App.fmtTime(when) : ''),
        syncing: '✓ נשמר · מסנכרן…',
        offline: '✓ נשמר במכשיר · יסונכרן',
        error: '⚠ השמירה נכשלה',
      }[state];
    };
    set(initial, at);
    App.onCleanup(App.sync.onChange(() => set(cur, curAt)));
    return { el, set };
  };

  // שמירה אוטומטית עם השהייה קצרה
  App.makeSaver = (saveFn, indicator, delay = 700) => {
    let dirty = false, running = Promise.resolve();
    const doSave = () => {
      if (!dirty) return running;
      dirty = false;
      running = running.then(async () => {
        try { await saveFn(); indicator.set('saved', new Date().toISOString()); }
        catch (e) { console.error(e); dirty = true; indicator.set('error'); App.toast('השמירה נכשלה. נסי שוב.', 'error'); }
      });
      return running;
    };
    const deb = App.debounce(doSave, delay);
    const api = {
      touch() { dirty = true; indicator.set('saving'); deb(); },
      flush() { deb.cancel(); return doSave(); },
      saveNow() { dirty = true; deb.cancel(); return doSave(); },
      cancel() { dirty = false; deb.cancel(); }, // למשל אחרי מחיקה
    };
    App.flushers.add(api.flush);
    return api;
  };

  // ---- כפתורי בחירה (צ'יפים) ----
  App.chipToggle = (label, on, onToggle, cls = '') => {
    const b = h('button', { type: 'button', class: 'chip ' + cls + (on ? ' on' : ''), 'aria-pressed': String(on) }, label);
    b.addEventListener('click', () => {
      const v = !b.classList.contains('on');
      b.classList.toggle('on', v); b.setAttribute('aria-pressed', String(v));
      onToggle(v);
    });
    return b;
  };

  // ---- בחירת תגיות (חלון) ----
  App.pickTags = async (selected) => {
    const vocab = await App.getTags();
    const sel = new Set(selected || []);
    const wrap = h('div', { class: 'chips wrap' });
    const draw = () => {
      const all = [...new Set([...vocab, ...sel])];
      App.fill(wrap, ...all.map((t) => App.chipToggle(t, sel.has(t), (v) => (v ? sel.add(t) : sel.delete(t)))));
    };
    draw();
    const input = h('input', { type: 'text', placeholder: 'תגית חדשה…' });
    const add = async () => {
      const t = input.value.trim();
      if (!t) return;
      if (!vocab.includes(t)) { vocab.push(t); await App.settings.set('tags', vocab); }
      sel.add(t); input.value = ''; draw();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    const res = await App.modal({
      title: 'תגיות',
      body: h('div', null, wrap, h('div', { class: 'row gap mt' }, input, h('button', { type: 'button', class: 'btn', onclick: add }, 'הוספה'))),
      actions: [{ label: 'ביטול', value: null }, { label: 'אישור', kind: 'primary', onClick: () => [...sel] }],
    });
    return res == null ? null : res;
  };

  // ---- פאנל תיוג: עוגנים, תמות, תגיות ----
  App.tagPanel = async (rec, onChange) => {
    const themes = await App.getThemes();
    rec.anchors = rec.anchors || []; rec.themes = rec.themes || []; rec.tags = rec.tags || [];
    const count = h('span', { class: 'muted small' });
    const updCount = () => {
      const n = rec.anchors.length + rec.tags.length + rec.themes.length;
      count.textContent = n ? `· ${n} נבחרו` : '· לא חובה';
    };
    const toggleIn = (arr, id) => (v) => {
      const i = arr.indexOf(id);
      if (v && i < 0) arr.push(id); if (!v && i >= 0) arr.splice(i, 1);
      updCount(); onChange();
    };
    const tagWrap = h('div', { class: 'chips wrap' });
    const drawTags = () => App.fill(tagWrap, 
      ...rec.tags.map((t) => h('span', { class: 'chip on static' }, '#' + t)),
      h('button', { type: 'button', class: 'chip add', onclick: async () => {
        const r = await App.pickTags(rec.tags);
        if (r) { rec.tags = r; drawTags(); updCount(); onChange(); }
      } }, rec.tags.length ? 'עריכת תגיות' : '+ תגית'));
    drawTags(); updCount();
    const autoThemes = rec.type === 'observation' ? h('div', { class: 'hint' }, 'בתצפית, תמה שנכתב בה תוכן מתויגת אוטומטית.') : null;
    return h('details', { class: 'card section tagpanel' },
      h('summary', null, h('span', { class: 'section-title inline' }, 'תיוג ועוגנים '), count),
      h('div', { class: 'tp-group' }, h('h3', null, 'עוגני פעולה'),
        h('div', { class: 'chips wrap' }, App.ANCHORS.map((a) => App.chipToggle(a.label, rec.anchors.includes(a.id), toggleIn(rec.anchors, a.id), 'anchor')))),
      h('div', { class: 'tp-group' }, h('h3', null, 'תמות התבוננות'), autoThemes,
        h('div', { class: 'chips wrap' }, themes.filter((t) => t.active || rec.themes.includes(t.id))
          .map((t) => App.chipToggle(t.title, rec.themes.includes(t.id), toggleIn(rec.themes, t.id), 'theme')))),
      h('div', { class: 'tp-group' }, h('h3', null, 'תגיות'), tagWrap));
  };

  // הצגת תגים לקריאה בלבד
  App.tagChips = async (rec) => {
    const themes = await App.getThemes();
    const tMap = Object.fromEntries(themes.map((t) => [t.id, t.title]));
    const items = [
      ...(rec.anchors || []).map((id) => h('span', { class: 'chip static anchor on' }, (App.ANCHORS.find((a) => a.id === id) || {}).label || id)),
      ...App.recThemes(rec).map((id) => h('span', { class: 'chip static theme on' }, tMap[id] || id)),
      ...App.recTags(rec).map((t) => h('span', { class: 'chip static on' }, '#' + t)),
    ];
    return items.length ? h('div', { class: 'chips wrap' }, items) : null;
  };

  // ---- פריט בציר הזמן ----
  App.recordItem = (r, { tMap = {}, cMap = {}, fileCounts = {}, showTeacher = false } = {}) => {
    const type = App.RECORD_TYPES[r.type];
    const { title, snippet } = App.recordSummary(r);
    const counts = fileCounts[r.id] || {};
    const others = [...r.teacherIds.map((id) => tMap[id]), ...(r.contactIds || []).map((id) => cMap[id])].filter(Boolean).map((t) => t.name);
    return h('a', { class: 'ritem', href: '#/r/' + r.id + (r.status === 'draft' ? '/edit' : '') },
      h('div', { class: 'ritem-top' },
        h('span', { class: 'badge t-' + type.color }, type.icon + ' ' + type.short),
        h('span', { class: 'muted small' }, App.fmtDate(App.recDate(r))),
        r.status === 'draft' ? h('span', { class: 'badge draft' }, 'טיוטה') : null,
        r.type === 'goal' && r.data.status ? h('span', { class: 'badge soft' }, r.data.status) : null),
      h('div', { class: 'ritem-title' }, title),
      snippet ? h('div', { class: 'ritem-snip' }, App.truncate(snippet, 140)) : null,
      h('div', { class: 'ritem-meta muted small' },
        (showTeacher || r.type === 'group' || (r.contactIds || []).length > 1) && others.length ? h('span', null, (r.type === 'group' || r.type === 'meeting' ? 'משתתפים: ' : '') + others.join(', ')) : null,
        counts.audio ? h('span', null, '🎙 ' + counts.audio) : null,
        counts.image ? h('span', null, '📷 ' + counts.image) : null,
        counts.file ? h('span', null, '📎 ' + counts.file) : null,
        (r.links || []).length ? h('span', null, '🔗 ' + r.links.length) : null));
  };

  App.fileCounts = async () => {
    const out = {};
    for (const f of await App.db.all('files')) {
      out[f.ownerId] = out[f.ownerId] || {};
      out[f.ownerId][f.kind] = (out[f.ownerId][f.kind] || 0) + 1;
    }
    return out;
  };

  // ---- קישורים בין תיעודים ----
  App.linksPanel = (rec, onChange) => {
    rec.links = rec.links || [];
    const list = h('div', { class: 'links' });
    const draw = async () => {
      const items = await Promise.all(rec.links.map((id) => App.db.get('records', id)));
      App.fill(list, 
        ...items.filter(Boolean).map((r) => h('div', { class: 'link-row' },
          h('a', { href: '#/r/' + r.id }, App.RECORD_TYPES[r.type].icon + ' ' + App.recordSummary(r).title, h('span', { class: 'muted small' }, ' · ' + App.fmtDate(App.recDate(r)))),
          h('button', { type: 'button', class: 'icon-btn small', 'aria-label': 'הסרת קישור', onclick: () => {
            rec.links = rec.links.filter((x) => x !== r.id); onChange(); draw();
          } }, '✕'))),
        rec.links.length ? null : h('div', { class: 'muted small' }, 'אין עדיין קישורים'),
        h('button', { type: 'button', class: 'btn small', onclick: pick }, '🔗 קישור לתיעוד, לפגישה או ליעד'));
    };
    const pick = async () => {
      const pool = new Map();
      const add = (list) => list.forEach((r) => { if (r.id !== rec.id) pool.set(r.id, r); });
      for (const tid of rec.teacherIds) add(await App.store.teacherRecords(tid));
      for (const cid of rec.contactIds || []) add(await App.store.contactRecords(cid));
      if (rec.schoolId) add(await App.db.byIndex('records', 'schoolId', rec.schoolId)); // כל מה שקשור לבית הספר
      const cands = [...pool.values()].sort((a, b) => App.recDate(b).localeCompare(App.recDate(a)));
      if (!cands.length) { App.toast('אין עדיין תיעודים אחרים בתיק הזה'); return; }
      const sel = new Set(rec.links);
      const body = h('div', { class: 'pick-list' }, cands.map((r) => {
        const cb = h('input', { type: 'checkbox', checked: sel.has(r.id) });
        cb.addEventListener('change', () => (cb.checked ? sel.add(r.id) : sel.delete(r.id)));
        return h('label', { class: 'pick-row' }, cb,
          h('span', null, h('span', { class: 'badge t-' + App.RECORD_TYPES[r.type].color }, App.RECORD_TYPES[r.type].short), ' ',
            App.recordSummary(r).title, h('span', { class: 'muted small' }, ' · ' + App.fmtDate(App.recDate(r)))));
      }));
      const ok = await App.modal({ title: 'קישור לתיעודים', body, actions: [{ label: 'ביטול', value: false }, { label: 'שמירה', kind: 'primary', value: true }] });
      if (ok) { rec.links = [...sel]; onChange(); draw(); }
    };
    draw();
    return list;
  };

  // ---- קבצים מצורפים: הקלטה, צילום, העלאה ----
  async function downscale(file, max = 1600, quality = 0.85, force = false) {
    try {
      if (!file.type.startsWith('image/') || file.type === 'image/gif' || !window.createImageBitmap) return file;
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
      if (scale === 1 && file.size < 1.5e6 && !force) return file;
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
      return blob ? new File([blob], (file.name || 'תמונה').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
    } catch (e) { return file; }
  }
  App.downscale = downscale;

  App.attachments = ({ ownerId, beforeAdd, readOnly = false, noAudio = false, onChange }) => {
    const list = h('div', { class: 'attach-list' });
    const recBar = h('div', { class: 'rec-bar', hidden: true });
    let recorder = null;

    async function refresh() {
      const files = await App.files.list(ownerId);
      App.fill(list);
      if (!files.length) {
        list.append(h('div', { class: 'muted small' }, readOnly ? 'אין קבצים מצורפים' : 'אפשר להקליט, לצלם או לצרף קבצים. שימי לב: קבצים נשמרים כרגע רק במכשיר הזה.'));
        return;
      }
      const imgs = files.filter((f) => f.kind === 'image');
      if (imgs.length) {
        const grid = h('div', { class: 'thumbs' });
        for (const f of imgs) {
          const b = await App.files.blob(f.id); if (!b) continue;
          const url = App.objectURL(b);
          grid.append(h('button', { type: 'button', class: 'thumb', 'aria-label': 'הצגת תמונה', onclick: () => showImage(f, url) }, h('img', { src: url, alt: f.name })));
        }
        list.append(grid);
      }
      for (const f of files.filter((x) => x.kind === 'audio')) {
        const b = await App.files.blob(f.id); if (!b) continue;
        list.append(h('div', { class: 'file-row audio' },
          h('div', { class: 'file-name' }, '🎙 ' + f.name, f.duration ? h('span', { class: 'muted small' }, ' · ' + App.fmtDuration(f.duration)) : null),
          h('audio', { controls: true, preload: 'metadata', src: App.objectURL(b) }),
          readOnly ? null : delBtn(f)));
      }
      for (const f of files.filter((x) => x.kind === 'file')) {
        const b = await App.files.blob(f.id); if (!b) continue;
        list.append(h('div', { class: 'file-row' },
          h('a', { href: App.objectURL(b), download: f.name, target: '_blank', rel: 'noopener' }, '📎 ' + f.name),
          h('span', { class: 'muted small' }, App.fileSize(f.size)),
          readOnly ? null : delBtn(f)));
      }
    }
    const delBtn = (f) => h('button', { type: 'button', class: 'icon-btn small', 'aria-label': 'מחיקת קובץ', onclick: async () => {
      if (!(await App.confirm(`למחוק את "${f.name}"? לא ניתן לשחזר.`, { ok: 'מחיקה', danger: true }))) return;
      await App.files.remove(f.id); await refresh(); onChange && onChange();
    } }, '🗑');

    async function showImage(f, url) {
      const del = !readOnly;
      const r = await App.modal({
        title: f.name, body: h('img', { class: 'full-img', src: url, alt: f.name }),
        actions: del ? [{ label: 'מחיקת התמונה', kind: 'danger', value: 'del' }, { label: 'סגירה', value: null }] : [],
      });
      if (r === 'del' && (await App.confirm('למחוק את התמונה?', { ok: 'מחיקה', danger: true }))) {
        await App.files.remove(f.id); await refresh(); onChange && onChange();
      }
    }

    async function addFiles(fileList, kind) {
      if (!fileList || !fileList.length) return;
      try {
        if (beforeAdd) await beforeAdd();
        for (const file of fileList) {
          const isImg = file.type.startsWith('image/');
          const f = isImg ? await downscale(file) : file;
          await App.files.add(ownerId, f, { kind: kind || (isImg ? 'image' : 'file'), name: file.name || (isImg ? 'תמונה' : 'קובץ') });
        }
        await refresh(); onChange && onChange();
        App.toast(fileList.length > 1 ? `${fileList.length} קבצים נשמרו במכשיר` : 'נשמר במכשיר');
      } catch (e) {
        console.error(e);
        App.toast(e && e.name === 'QuotaExceededError' ? 'אין מספיק מקום אחסון בדפדפן' : 'לא הצלחנו לשמור את הקובץ', 'error');
      }
    }

    const fileInput = (label, attrs, kind) => {
      const inp = h('input', { type: 'file', class: 'visually-hidden', ...attrs });
      inp.addEventListener('change', () => { addFiles([...inp.files], kind); inp.value = ''; });
      return h('label', { class: 'btn small tool' }, inp, label);
    };

    // הקלטת קול
    async function startRec() {
      if (!navigator.mediaDevices || !window.MediaRecorder) {
        App.toast('הדפדפן הזה לא תומך בהקלטה. אפשר לצרף קובץ שמע במקום.', 'error'); return;
      }
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch (e) {
        App.toast(e.name === 'NotAllowedError' ? 'לא ניתנה הרשאה למיקרופון' : 'לא ניתן להפעיל את המיקרופון', 'error'); return;
      }
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m));
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks = []; const started = Date.now();
      const label = h('span', { class: 'rec-time' }, '00:00');
      const iv = setInterval(() => { label.textContent = App.fmtDuration((Date.now() - started) / 1000); }, 500);
      let stopResolve;
      const stopped = new Promise((r) => (stopResolve = r));
      mr.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
      mr.onstop = async () => {
        clearInterval(iv); stream.getTracks().forEach((t) => t.stop());
        recBar.hidden = true; recorder = null;
        const type = mr.mimeType || mime || 'audio/webm';
        const blob = new Blob(chunks, { type });
        const dur = Math.round((Date.now() - started) / 1000);
        if (blob.size) {
          try {
            if (beforeAdd) await beforeAdd();
            await App.files.add(ownerId, blob, { kind: 'audio', name: 'הקלטה ' + App.nowTime(), duration: dur });
            await refresh(); onChange && onChange(); App.toast('ההקלטה נשמרה במכשיר');
          } catch (e) { console.error(e); App.toast('שמירת ההקלטה נכשלה', 'error'); }
        }
        stopResolve();
      };
      mr.start(1000);
      recorder = { stop: () => { if (mr.state !== 'inactive') mr.stop(); return stopped; } };
      App.fill(recBar, h('span', { class: 'rec-dot' }), h('span', null, 'מקליט'), label,
        h('button', { type: 'button', class: 'btn primary small', onclick: () => recorder && recorder.stop() }, '⏹ עצירה ושמירה'));
      recBar.hidden = false;
    }
    // אם עוזבים את המסך באמצע הקלטה — שומרים אותה
    App.onCleanup(() => recorder && recorder.stop());

    const tools = readOnly ? null : h('div', { class: 'tools' },
      noAudio ? null : h('button', { type: 'button', class: 'btn small tool', onclick: () => (recorder ? null : startRec()) }, '🎙 הקלטה'),
      fileInput('📷 צילום', { accept: 'image/*', capture: 'environment' }, 'image'),
      fileInput('🖼 תמונה', { accept: 'image/*', multiple: true }, 'image'),
      fileInput('📎 קובץ', { multiple: true }));

    refresh();
    return h('div', { class: 'attach' }, tools, recBar, list);
  };
})(window.App);
