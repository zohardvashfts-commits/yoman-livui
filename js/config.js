'use strict';
// הגדרות תוכן: סוגי תיעוד, שדות, תמות, עוגנים ותגיות.
// התמות והתגיות הן ברירת מחדל ראשונית — ניתנות לעריכה במסך ההגדרות.
(function (App) {
  App.RECORD_TYPES = {
    observation: { label: 'תצפית בשיעור', short: 'תצפית', icon: '👁️', color: 'sage' },
    event: { label: 'תצפית באירוע', short: 'אירוע', icon: '✳️', color: 'amber' },
    personal: { label: 'פגישה אישית', short: 'פגישה אישית', icon: '💬', color: 'blue' },
    group: { label: 'פגישה משותפת', short: 'פגישה משותפת', icon: '👥', color: 'plum' },
    reflection: { label: 'רשמים ומחשבות', short: 'רשם', icon: '✍️', color: 'sand' },
    goal: { label: 'יעד לתקופת הליווי', short: 'יעד', icon: '🎯', color: 'terra' },
    // תיעודים עם גורמים נוספים (לא המחנכות): מנהלת, יועצת, המלווה של ההנהלה וכו'
    meeting: { label: 'פגישה', short: 'פגישה', icon: '🤝', color: 'teal', contact: true },
    update: { label: 'עדכון שהתקבל', short: 'עדכון', icon: '📨', color: 'slate', contact: true },
  };

  // תפקידים מוצעים לגורמים נוספים (אפשר גם לכתוב תפקיד אחר)
  App.CONTACT_ROLES = ['מנהל/ת בית הספר', 'סגנ/ית', 'יועצ/ת', 'רכז/ת', 'מלווה של ההנהלה', 'מפקח/ת', 'פסיכולוג/ית', 'צוות נוסף'];
  App.UPDATE_CHANNELS = ['פגישה', 'שיחת טלפון', 'מייל', 'הודעה', 'אחר'];
  App.contactRole = (c) => (c.role === 'אחר' ? c.roleOther : c.role) || 'ללא תפקיד';

  // שלושת עוגני הפעולה
  App.ANCHORS = [
    { id: 'entry-doors', label: 'דלתות כניסה מרובות' },
    { id: 'third-teacher', label: 'הכיתה כמרחב / המורה השלישי' },
    { id: 'sel', label: 'למידה רגשית־חברתית' },
  ];

  App.ENTRY_KINDS = {
    seen: { label: 'מה נצפה', hint: 'תיאור של מה שראיתי ושמעתי' },
    thought: { label: 'פרשנות / מחשבה', hint: 'מה אני חושבת על זה' },
    question: { label: 'שאלה', hint: 'מה אני רוצה לברר' },
  };

  App.GOAL_STATUSES = ['טרם התחיל', 'בתהליך', 'לבחינה מחדש', 'הושג', 'הוקפא'];

  // תמות התבוננות ראשוניות. השאלות המנחות הן הצעה בלבד.
  App.DEFAULT_THEMES = [
    { id: 'ethno', title: 'כתיבה אתנוגרפית פתוחה', active: true,
      prompts: ['מה מתרחש בכיתה?', 'מה אני רואה ושומעת עכשיו — בלי לפרש?'] },
    { id: 'space', title: 'מרחב ובחירה', active: true,
      prompts: ['איך מאורגן המרחב? מה זמין לילדים?', 'במה הילדים יכולים לבחור, ומתי?'] },
    { id: 'language', title: 'שפה ויחסים', active: true,
      prompts: ['איך המורה פונה לילדים, ואיך הם פונים אליה?', 'אילו מילים חוזרות על עצמן?'] },
    { id: 'peers', title: 'תקשורת בין הילדים', active: true,
      prompts: ['מתי ואיך הילדים מדברים זה עם זה?', 'מי פונה למי לעזרה?'] },
    { id: 'talk', title: 'זמן פעילות הילדים לעומת זמן דיבור המורה', active: true,
      prompts: ['כמה זמן המורה מדברת, וכמה זמן הילדים פעילים?'] },
    { id: 'tasks', title: 'אופי המשימות', active: true,
      prompts: ['מה הילדים מתבקשים לעשות?', 'האם יש יותר מדרך אחת להיכנס למשימה?'] },
    { id: 'habits', title: 'הרגלים ועצמאות', active: true,
      prompts: ['אילו שגרות קיימות?', 'מה הילדים עושים בלי הכוונה?'] },
    { id: 'behavior', title: 'פרקטיקות התנהגותיות', active: true,
      prompts: ['איך מתנהלים רגעים של קושי או הפרעה?', 'מה קורה מיד אחרי?'] },
  ];

  App.DEFAULT_TAGS = ['עבודה בקבוצות', 'שיח כיתתי', 'פינות למידה', 'ויסות רגשי', 'שגרות פתיחה', 'הפסקה', 'שיתוף צוות', 'מעברים'];

  const date = { key: 'date', label: 'תאריך', type: 'date', half: true };
  const time = { key: 'time', label: 'שעה', type: 'time', half: true };
  const ta = (key, label, extra = {}) => ({ key, label, type: 'textarea', ...extra });

  // שדות לכל סוג תיעוד (התצפית בשיעור מקבלת בנוסף רשומות ותמות)
  App.TYPE_FIELDS = {
    observation: [date, time,
      { key: 'subject', label: 'מקצוע / נושא השיעור', type: 'text' },
      ta('context', 'הקשר', { rows: 2, placeholder: 'איזה שיעור, מה קדם לו, כמה ילדים, איפה אני יושבת…' })],
    event: [date, time,
      ta('context', 'הקשר', { rows: 2, placeholder: 'איפה ומתי זה קרה?' }),
      ta('description', 'תיאור האירוע', { rows: 4 }),
      ta('involved', 'מי היו מעורבים', { hint: 'אין צורך בשמות ילדים — אפשר לתאר תפקידים או קבוצות' }),
      ta('before', 'מה התרחש לפני'),
      ta('during', 'מה התרחש במהלך'),
      ta('after', 'מה התרחש אחרי'),
      ta('thoughts', 'מחשבות ושאלות להמשך בירור')],
    personal: [date,
      ta('topics', 'נושאים שעלו', { rows: 2 }),
      ta('notes', 'תיעוד חופשי', { rows: 5 }),
      ta('insights', 'תובנות'),
      ta('agreements', 'הסכמות'),
      ta('nextSteps', 'צעדים להמשך')],
    group: [date,
      ta('topics', 'נושאים', { rows: 2 }),
      ta('notes', 'תיעוד', { rows: 5 }),
      ta('agreements', 'הסכמות'),
      ta('nextSteps', 'צעדים להמשך')],
    reflection: [date,
      ta('text', 'מה עולה לי?', { rows: 6, placeholder: 'מחשבה, שאלה, חיבור שעלה…' })],
    meeting: [date,
      ta('topics', 'נושאים שעלו', { rows: 2 }),
      ta('notes', 'תיעוד', { rows: 5 }),
      ta('insights', 'תובנות'),
      ta('agreements', 'הסכמות'),
      ta('nextSteps', 'צעדים להמשך')],
    update: [date,
      { key: 'channel', label: 'איך הגיע העדכון', type: 'select', options: App.UPDATE_CHANNELS, half: true },
      ta('content', 'מה עודכן', { rows: 5, placeholder: 'למשל: סיכום מידע חשוב על בית הספר, שינויים בצוות, אירועים…' }),
      ta('relevance', 'מה רלוונטי לליווי המחנכות'),
      ta('followUp', 'לבירור / להמשך')],
    goal: [
      { key: 'title', label: 'היעד', type: 'text', placeholder: 'במשפט אחד' },
      ta('current', 'תיאור המצב הקיים'),
      ta('desired', 'השינוי הרצוי'),
      ta('steps', 'צעדים מוסכמים'),
      { key: 'periodFrom', label: 'תחילת תקופת העבודה', type: 'date', half: true },
      { key: 'periodTo', label: 'סוף התקופה', type: 'date', half: true },
      { key: 'reviewDate', label: 'מועד לבחינה מחדש', type: 'date', half: true },
      { key: 'status', label: 'סטטוס', type: 'select', options: App.GOAL_STATUSES, half: true }],
  };

  // אינטייק — שם, בית ספר וכיתה נשמרים על המחנכת עצמה. השדות מחולקים לקבוצות (group) לפי הסדר.
  App.INTAKE_GROUPS = {
    teacher: { title: 'המחנכת' },
    composition: { title: 'הכיתה', hint: 'תיאור כללי בלבד — בלי שמות ילדים ובלי פירוט אבחנות.' },
    hours: { title: 'שעות ומערכת' },
    routines: { title: 'סדירויות' },
    more: { title: 'עוד' },
  };
  App.INTAKE_FIELDS = [
    { key: 'subjects', label: 'מקצועות שהיא מלמדת', type: 'text', group: 'teacher' },
    { key: 'seniorityTeaching', label: 'ותק בהוראה (שנים)', type: 'number', half: true, group: 'teacher' },
    { key: 'seniorityHomeroom', label: 'ותק בחינוך כיתה (שנים)', type: 'number', half: true, group: 'teacher' },
    { key: 'studentsCount', label: 'מספר הילדים בכיתה', type: 'number', half: true, group: 'composition' },
    ta('compositionNotes', 'הרכב כיתתי', { rows: 4, group: 'composition', placeholder: 'כתיבה חופשית, למשל: כמה ילדים עם סל דיפרנציאלי, ילדי שילוב, קבוצות שפה, כיתה שהתאחדה השנה…' }),
    { key: 'homeroomHours', label: 'שעות עבודה שבועיות עם כיתת החינוך', type: 'number', group: 'hours' },
    ta('hoursDistribution', 'פיזור השעות במהלך השבוע', { rows: 2, group: 'hours', placeholder: 'למשל: א׳ 2 ש׳, ג׳ שעה אחת…' }),
    { key: 'consecutiveHours', label: 'כמה מהשעות ברצף', type: 'text', group: 'hours' },
    { key: '__schedule', group: 'hours' }, // מקום להעלאת מערכת שעות
    ta('routinesKids', 'סדירויות קיימות עם הילדים', { group: 'routines' }),
    ta('routinesStaff', 'סדירויות קיימות עם הצוות', { group: 'routines' }),
    ta('routinesManagement', 'סדירויות עם הנהלה ובעלי תפקידים נוספים', { group: 'routines' }),
    ta('more', 'מידע נוסף', { rows: 3, group: 'more' }),
  ];

  App.getThemes = async () => App.settings.get('themes', App.DEFAULT_THEMES);
  App.getTags = async () => App.settings.get('tags', App.DEFAULT_TAGS);

  // תאריך התיעוד לצורך מיון וציר זמן
  App.recDate = (r) => (r.data && (r.data.date || r.data.periodFrom)) || (r.createdAt || '').slice(0, 10);

  // תמות של רשומה: מה שסומן ידנית + תמות שנכתב בהן תוכן
  App.recThemes = (r) => {
    const s = new Set(r.themes || []);
    Object.entries(r.themeNotes || {}).forEach(([k, v]) => { if ((v || '').trim()) s.add(k); });
    (r.entries || []).forEach((e) => e.themeId && s.add(e.themeId));
    return [...s];
  };
  App.recTags = (r) => {
    const s = new Set(r.tags || []);
    (r.entries || []).forEach((e) => (e.tags || []).forEach((t) => s.add(t)));
    return [...s];
  };

  App.recordSummary = (r) => {
    const d = r.data || {};
    const rest = (s) => (s || '').split('\n').slice(1).join(' ');
    switch (r.type) {
      case 'observation': return { title: d.subject || 'תצפית בשיעור', snippet: d.context || (r.entries && r.entries[0] && r.entries[0].text) || '' };
      case 'event': return { title: App.firstLine(d.description) || 'אירוע', snippet: d.context || d.thoughts || '' };
      case 'personal':
      case 'group': return { title: App.firstLine(d.topics) || App.RECORD_TYPES[r.type].label, snippet: d.agreements || d.notes || '' };
      case 'reflection': return { title: App.firstLine(d.text) || 'רשם', snippet: rest(d.text) };
      case 'goal': return { title: d.title || 'יעד ללא שם', snippet: d.desired || d.current || '' };
      case 'meeting': return { title: App.firstLine(d.topics) || 'פגישה', snippet: d.agreements || d.notes || '' };
      case 'update': return { title: App.firstLine(d.content) || 'עדכון', snippet: d.relevance || rest(d.content) };
      default: return { title: '', snippet: '' };
    }
  };
})(window.App);
