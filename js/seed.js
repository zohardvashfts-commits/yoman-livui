'use strict';
// נתוני דוגמה פיקטיביים בלבד. כל השמות ובתי הספר מומצאים.
(function (App) {
  // טוען נתוני דוגמה לחשבון של המנחה המחוברת (mentorId = המשתמשת)
  App.seed = async function (M = App.state.mentorId) {
    const now = new Date().toISOString();
    const d = (n) => App.todayISO(-n);
    const ts = (n, hh, mm) => { const x = new Date(); x.setDate(x.getDate() - n); x.setHours(hh, mm, 0, 0); return x.toISOString(); };
    const base = () => ({ mentorId: M, createdBy: M, createdAt: now, updatedAt: now });

    const schoolNames = ['הגפן', 'נופים', 'התמר', 'אלון', 'הדקל'];
    const first = ['אורית', 'הדס', 'מורן', 'ליאת', 'סיגל', 'רינת', 'טל', 'עדי', 'גלית', 'קרן', 'נעמה', 'אפרת'];
    const last = ['אלמוג', 'בן־דוד', 'גבאי', 'דהן', 'הראל', 'וקנין', 'זילברמן', 'חורי', 'טל', 'יוסף', 'כספי'];
    const classes = ['א׳1', 'א׳2', 'ב׳1', 'ב׳3', 'ג׳3', 'ד׳2', 'ה׳1', 'ה׳2', 'ו׳1', 'ו׳3'];

    let n = 0;
    for (const [i, name] of schoolNames.entries()) {
      const school = { id: `demo-s${i + 1}`, name: `בית הספר ${name}`, city: 'ירושלים (דוגמה)', notes: '', ...base() };
      await App.db.put('schools', school);
      if (i === 0) continue; // לבית הספר הראשון מוגדרות מחנכות ידנית למטה
      for (let k = 0; k < 2 + (i % 2); k++, n++) {
        await App.db.put('teachers', {
          id: `${school.id}-t${k + 1}`, schoolId: school.id,
          name: `${first[n % first.length]} ${last[(n * 7) % last.length]}`,
          className: classes[(n * 3) % classes.length], intake: {}, ...base(),
        });
      }
    }

    // ---- סיפור דוגמה מלא בבית הספר הגפן ----
    const S = 'demo-s1';
    const yael = { id: 'demo-yael', schoolId: S, name: 'יעל כהן', className: 'ג׳1', ...base(),
      intake: {
        studentsCount: '27', compositionNotes: 'ארבעה ילדים עם סל דיפרנציאלי ושני ילדי שילוב. ילד אחד עלה לארץ בקיץ.', subjects: 'שפה, חשבון, מולדת', seniorityTeaching: '9', seniorityHomeroom: '4', homeroomHours: '14',
        hoursDistribution: 'א׳–ה׳, 2–3 שעות בכל יום, בעיקר בשעות הבוקר.', consecutiveHours: 'בשלושה ימים יש רצף של שעתיים',
        routinesKids: 'מעגל שישי בבוקר. תורנויות שבועיות.', routinesStaff: 'ישיבת שכבה פעם בשבועיים.',
        routinesManagement: 'שיחה עם היועצת לפי צורך.', more: '',
      } };
    const shira = { id: 'demo-shira', schoolId: S, name: 'שירה מזרחי', className: 'ג׳2', intake: { studentsCount: '29' }, ...base() };
    const inbal = { id: 'demo-inbal', schoolId: S, name: 'ענבל דוד', className: 'ד׳1', intake: {}, ...base() };
    for (const t of [yael, shira, inbal]) await App.db.put('teachers', t);

    const rec = (o) => ({ tags: [], anchors: [], themes: [], links: [], status: 'final', schoolId: S, ...base(), ...o });

    const obs = rec({
      id: 'demo-obs1', type: 'observation', teacherIds: [yael.id],
      data: { date: d(14), time: '09:15', subject: 'שפה — קריאה בקבוצות קטנות',
        context: 'שיעור שני ביום. 27 ילדים. המורה עם קבוצה של שישה ילדים ליד השולחן העגול, השאר בעבודה עצמית. ישבתי בפינה ליד החלון.' },
      entries: [
        { id: 'e1', ts: ts(14, 9, 18), kind: 'seen', themeId: 'space', tags: [], text: 'הילדים בעבודה העצמית יושבים בשורות. על הלוח רשימת משימות זהה לכולם. שלושה ילדים מסיימים מהר ומחכים.' },
        { id: 'e2', ts: ts(14, 9, 24), kind: 'thought', themeId: 'tasks', tags: ['עבודה בקבוצות'], text: 'בקבוצה הקטנה הילדים קוראים בקול זה לזה ונראים מעורבים. אולי המבנה הזה יכול להתרחב לתחנות?' },
        { id: 'e3', ts: ts(14, 9, 31), kind: 'seen', themeId: 'language', tags: [], text: 'המורה פונה לילד שמסתובב בכיתה: "אתה צריך עזרה להתחיל?" — הוא חוזר למקום ומתחיל לעבוד.' },
        { id: 'e4', ts: ts(14, 9, 40), kind: 'question', themeId: 'space', tags: ['פינות למידה'], text: 'מה הילדים שסיימו מהר יודעים שהם יכולים לעשות? האם יש להם מקום לבחור?' },
      ],
      themeNotes: {
        space: 'שולחן עגול אחד לעבודה בקבוצה. אין פינות בחירה. ספריית הכיתה בפינה, סגורה בזמן השיעור.',
        talk: 'בפתיחה המורה דיברה כשמונה דקות. בקבוצה הקטנה רוב הזמן הילדים קוראים.',
      },
      talkTimer: { teacher: 610, kids: 1530 },
      tags: ['עבודה בקבוצות'], anchors: ['third-teacher', 'entry-doors'],
    });

    const event = rec({
      id: 'demo-event1', type: 'event', teacherIds: [yael.id],
      data: { date: d(10), time: '10:30',
        context: 'חזרה מההפסקה הגדולה, תחילת שיעור חשבון.',
        description: 'ויכוח על כדור שהתחיל בחצר נמשך בכניסה לכיתה.\nהמורה עצרה את פתיחת השיעור.',
        involved: 'ארבעה ילדים משתי קבוצות משחק. שאר הכיתה ישבה והקשיבה.',
        before: 'סוף ההפסקה. לפי הילדים, לא היה ברור של מי התור בכדור.',
        during: 'המורה הזמינה את הארבעה לשבת איתה ליד הדלת, ושאלה כל אחד מה קרה לדעתו. שאר הכיתה התחילה דף פתיחה.',
        after: 'הילדים חזרו למקומות אחרי כחמש דקות. אחד מהם ביקש לדבר שוב בסוף היום.',
        thoughts: 'האם יש בכיתה שגרה מוכרת לחזרה מהפסקה? מה עזר לילדים להירגע — השיחה עצמה, או הישיבה ליד המורה?' },
      tags: ['הפסקה', 'ויסות רגשי', 'מעברים'], anchors: ['sel'],
    });

    const group = rec({
      id: 'demo-group1', type: 'group', teacherIds: [yael.id, shira.id, inbal.id],
      data: { date: d(7),
        topics: 'פתיחת הבוקר בכיתות — מה כבר קיים, ומה רוצות לנסות',
        notes: 'כל אחת תיארה את עשר הדקות הראשונות של היום בכיתה שלה. עלה שבשתי כיתות הבוקר מתחיל ישר במשימה, ובכיתה אחת יש מעגל קצר.\nשירה סיפרה שהילדים שואלים "מה עושים היום?" כבר בכניסה.',
        agreements: 'כל אחת תנסה במשך שבועיים מעגל בוקר קצר עם שאלת פתיחה.',
        nextSteps: 'תצפית הדדית בשבוע הבא. כל אחת תביא דוגמה אחת לפגישה הבאה.' },
      tags: ['שגרות פתיחה', 'שיתוף צוות'], anchors: ['sel'],
    });

    const goal = rec({
      id: 'demo-goal1', type: 'goal', teacherIds: [yael.id],
      data: { title: 'הרחבת הבחירה של הילדים בזמן העבודה העצמית',
        current: 'כל הילדים מקבלים אותה משימה ויושבים במקומם. ילדים שמסיימים מהר מחכים.',
        desired: 'לפחות פעמיים בשבוע יהיו לילדים שתיים־שלוש אפשרויות פעולה ובחירה של מקום העבודה.',
        steps: '1. מיפוי משותף של המרחב בכיתה.\n2. הכנת שתי תחנות עבודה.\n3. תצפית חוזרת בעוד שלושה שבועות.',
        periodFrom: d(12), periodTo: App.todayISO(40), reviewDate: App.todayISO(9), status: 'בתהליך' },
      progress: [{ id: 'p1', date: d(6), text: 'יעל ארגנה מחדש את פינת הספרייה כתחנת קריאה חופשית.' }],
      links: [obs.id], anchors: ['entry-doors', 'third-teacher'], tags: ['פינות למידה'],
    });

    const reflection = rec({
      id: 'demo-refl1', type: 'reflection', teacherIds: [yael.id],
      data: { date: d(5), text: 'אחרי הפגישה המשותפת אני חושבת על הקשר בין מעגל הבוקר לבין הבחירה בעבודה העצמית.\nאולי שאלת הפתיחה יכולה להיות גם הזמנה לבחור במה מתחילים?' },
      links: [goal.id, group.id], anchors: ['entry-doors'],
    });

    const personal = rec({
      id: 'demo-personal1', type: 'personal', teacherIds: [yael.id],
      data: { date: d(3),
        topics: 'מה עלה מהניסיון הראשון בתחנות',
        notes: 'יעל סיפרה שבפעם הראשונה הרבה ילדים בחרו בתחנת הקריאה, והיה צפוף. בפעם השנייה הכינה כרטיסי בחירה.',
        insights: 'כרטיסי הבחירה עזרו לילדים לראות מה האפשרויות לפני שקמים.',
        agreements: 'להמשיך שבועיים עם שתי תחנות.',
        nextSteps: 'תצפית חוזרת בשבוע הבא, עם התמקדות במרחב ובחירה.' },
      links: [goal.id], tags: ['פינות למידה'], anchors: ['third-teacher'],
    });

    const draft = rec({
      id: 'demo-obs2', type: 'observation', teacherIds: [shira.id], status: 'draft',
      data: { date: d(1), time: '11:00', subject: 'חשבון — שברים', context: 'שיעור שלישי. עבודה בזוגות עם רצועות נייר.' },
      entries: [{ id: 'e5', ts: ts(1, 11, 6), kind: 'seen', themeId: 'peers', tags: [], text: 'זוגות מקפלים רצועות ומשווים. בזוג אחד ילד מסביר לחברה בעזרת ציור.' }],
      themeNotes: {},
    });

    // ---- גורמים נוספים בבית הספר ----
    const contact = (id, name, role, extra = {}) => ({ id, name, role, roleOther: '', schoolId: S, notes: '', ...base(), ...extra });
    const principal = contact('demo-principal', 'אילנה רוזן', 'מנהל/ת בית הספר');
    const counselor = contact('demo-counselor', 'מירב צור', 'יועצ/ת');
    const leadMentor = contact('demo-leadmentor', 'נורית קדם', 'מלווה של ההנהלה', { notes: 'נפגשת עם המנהלת פעם בשבוע.' });
    for (const c of [principal, counselor, leadMentor]) await App.db.put('contacts', c);
    await App.db.put('schools', { id: S, name: 'בית הספר הגפן', city: 'ירושלים (דוגמה)', notes: '', ...base(),
      summary: 'בית ספר יסודי, 14 כיתות. השנה נכנסה סגנית חדשה.\nההנהלה מבקשת להתמקד בשגרות מעבר ובשיח כיתתי.' });

    const meeting = rec({
      id: 'demo-meeting1', type: 'meeting', teacherIds: [], contactIds: [principal.id, counselor.id],
      data: { date: d(9), topics: 'תיאום ציפיות לליווי השנה',
        notes: 'הצגתי את מהלך הליווי ואת שלושת עוגני הפעולה. המנהלת שיתפה שהצוות עובר שנה עמוסה.',
        insights: 'ההנהלה רואה בשגרות פתיחת הבוקר נקודת כניסה טובה.',
        agreements: 'פגישה משותפת עם המחנכות פעם בשלושה שבועות.', nextSteps: 'לשלוח למנהלת לוח פגישות.' },
      links: [group.id], anchors: ['sel'],
    });
    const update = rec({
      id: 'demo-update1', type: 'update', teacherIds: [], contactIds: [leadMentor.id],
      data: { date: d(2), channel: 'שיחת טלפון',
        content: 'בפגישה השבועית עם המנהלת עלה שבשכבת ג׳ יש תחלופה של מורות מקצועיות.\nהמנהלת שוקלת לחזק את שעות החינוך בשכבה.',
        relevance: 'משפיע על יעל ושירה — ייתכן שיהיו להן יותר שעות עם הכיתה.', followUp: 'לברר בפגישה הבאה עם המנהלת מתי תתקבל החלטה.' },
    });

    for (const r of [obs, event, group, goal, reflection, personal, draft, meeting, update]) await App.db.put('records', r);

    await App.settings.set('themes', App.DEFAULT_THEMES);
    await App.settings.set('tags', App.DEFAULT_TAGS);
  };
})(window.App);
