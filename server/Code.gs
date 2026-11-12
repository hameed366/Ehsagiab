/**
 * خادم إحصائية الغياب اليومي — Google Apps Script
 * الخطوات في الأسفل. غيّر القيمتين التاليتين قبل النشر.
 */
const TEACHER_PASS    = 'change-teacher';     // المعلم: رصد الغياب فقط
const SUPERVISOR_PASS = 'change-supervisor';  // المشرف: الرصد + الإحصائيات
const ADMIN_PASS      = 'change-admin';       // المدير: صلاحيات كاملة
// اجعل الكلمات الثلاث مختلفة عن بعضها

// كلمات المرور المغيَّرة من الإعدادات تُحفظ في Script Properties وتتقدم على القيم أعلاه
function pass_(role) {
  const v = PropertiesService.getScriptProperties().getProperty('pw_' + role);
  if (v) return v;
  return { teacher: TEACHER_PASS, sup: SUPERVISOR_PASS, admin: ADMIN_PASS }[role];
}
// يرجع {role, grade} أو null. مشرف الصف له كلمة مرور خاصة تحصره في صفه
function who_(pw) {
  if (!pw) return null;
  if (pw === pass_('admin')) return { role: 'admin', grade: '' };
  if (pw === pass_('sup')) return { role: 'sup', grade: '' };
  if (pw === pass_('teacher')) return { role: 'teacher', grade: '' };
  const gs = (config_() || {}).grades || [], props = PropertiesService.getScriptProperties();
  for (let i = 0; i < gs.length; i++) {
    if (pw === props.getProperty('pw_sup_' + gs[i].id)) return { role: 'sup', grade: gs[i].id };
  }
  return null;
}
function allPw_() {
  const m = { teacher: pass_('teacher'), sup: pass_('sup'), admin: pass_('admin') };
  const props = PropertiesService.getScriptProperties();
  ((config_() || {}).grades || []).forEach(x => { const v = props.getProperty('pw_sup_' + x.id); if (v) m['sup:' + x.id] = v; });
  return m;
}
function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function sheet_(name, head, hideCol) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(name);
  if (!s) {
    s = ss.insertSheet(name);
    s.appendRow(head);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, head.length).setFontWeight('bold');
    if (hideCol) s.hideColumns(hideCol);
  }
  return s;
}
const data_ = () => sheet_('_data', ['key', 'value']);
const abs_  = () => sheet_('_absence', ['date', 'class', 'ids', 'key'], 4);
const log_  = () => {
  const s = sheet_('سجل الحصص', ['التاريخ', 'الصف', 'الفصل', 'الحصة', 'عدد الطلاب', 'الغائبون', 'الحاضرون', 'أسماء الغائبين', 'key'], 9);
  s.setRightToLeft(true);
  return s;
};

function upsert_(s, keyCol, key, vals) {
  const last = s.getLastRow();
  let row = 0;
  if (last > 1) {
    const ks = s.getRange(2, keyCol, last - 1, 1).getValues();
    for (let i = 0; i < ks.length; i++) if (String(ks[i][0]) === key) { row = i + 2; break; }
  }
  if (!row) row = last + 1;
  s.getRange(row, 1).setNumberFormat('@');           // يبقي التاريخ نصًا
  s.getRange(row, 1, 1, vals.length).setValues([vals]);
}

function load_(date) {
  const r = { config: null, students: {}, absence: {} };
  const d = data_(), n = d.getLastRow();
  if (n > 1) d.getRange(2, 1, n - 1, 2).getValues().forEach(x => {
    const k = String(x[0]);
    try {
      const v = JSON.parse(x[1]);
      if (k === 'config') r.config = v;
      else if (k.indexOf('students_') === 0) r.students[k.slice(9)] = v.list || [];
    } catch (e) {}
  });
  r.absence = absDay_(date);
  return r;
}

// ===== ذاكرة مؤقتة لغياب اليوم: تمنع قراءة ورقة _absence كاملة مع كل تحديث من كل جهاز =====
const CACHE_SEC = 21600;                                  // 6 ساعات (الحد الأقصى في Apps Script)
function absDay_(date) {
  const c = CacheService.getScriptCache(), ck = 'abs_' + date, hit = c.get(ck);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  const r = {}, a = abs_(), m = a.getLastRow();
  if (m > 1) a.getRange(2, 1, m - 1, 3).getValues().forEach(x => {
    if (String(x[0]) === date) { try { r[String(x[1])] = JSON.parse(x[2]); } catch (e) {} }
  });
  putDay_(date, r);
  return r;
}
function putDay_(date, r) {
  const s = JSON.stringify(r);
  try { if (s.length < 95000) CacheService.getScriptCache().put('abs_' + date, s, CACHE_SEC); } catch (e) {}
}
// شغّلها يدويًا من المحرر إذا عدّلت ورقة _absence بيدك
function clearCache() {
  const c = CacheService.getScriptCache(), keys = [], d = new Date();
  for (let i = -70; i <= 7; i++) { const x = new Date(d.getTime() + i * 864e5); keys.push('abs_' + Utilities.formatDate(x, 'Asia/Kuwait', 'yyyy-MM-dd')); }
  c.removeAll(keys);
}

// هل الرصد ممنوع على المعلم؟ (جمعة/سبت أو دوام مقفل)
function config_() {
  const d = data_(), n = d.getLastRow();
  if (n < 2) return null;
  const rows = d.getRange(2, 1, n - 1, 2).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === 'config') { try { return JSON.parse(rows[i][1]); } catch (e) {} }
  }
  return null;
}
function blocked_(date, key) {
  const w = new Date(date + 'T12:00:00Z').getUTCDay();   // 5=الجمعة، 6=السبت
  if (w === 5 || w === 6) return 'weekend';
  const cfg = config_() || {};
  const g = (cfg.grades || []).find(x => x.id === String(key).split('_')[0]);
  const shift = g && g.shift === 'e' ? 'e' : 'm';          // m=صباحي، e=مسائي
  if ((cfg.att || {})[shift] === 0) return 'shift';
  // الرصد لتاريخ اليوم فقط وضمن وقت الدوام (بتوقيت الكويت)
  const now = Utilities.formatDate(new Date(), 'Asia/Kuwait', 'yyyy-MM-dd HH:mm');
  if (date !== now.slice(0, 10)) return 'date';
  const def = { m: ['07:00', '12:30'], e: ['12:30', '18:00'] };
  const t = (cfg.times || {})[shift];
  const win = t && t[0] && t[1] ? t : def[shift];
  const hm = now.slice(11);
  if (hm < win[0] || hm >= win[1]) return 'time';
  return '';
}

function doGet() { return ContentService.createTextOutput('OK — خادم إحصائية الغياب يعمل'); }

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return out_({ error: 'bad' }); }
  const who = who_(String(b.token || ''));
  if (!who) return out_({ error: 'auth' });
  const role = who.role, isAdm = role === 'admin';
  if (b.action === 'chk')  return out_({ ok: 1, role: role, grade: who.grade });
  if (b.action === 'load') { const r = load_(String(b.date)); r.role = role; r.grade = who.grade; return out_(r); }
  if (b.action === 'range') {                       // كشف الصف حسب الأيام: للمشرف والمدير فقط
    if (role === 'teacher') return out_({ error: 'admin' });
    const from = String(b.from), to = String(b.to), a = abs_(), m = a.getLastRow(), rows = [];
    if (m > 1) a.getRange(2, 1, m - 1, 3).getValues().forEach(x => {
      const d = String(x[0]), key = String(x[1]);
      if (d < from || d > to) return;
      if (role === 'sup' && who.grade && key.split('_')[0] !== who.grade) return;
      try { rows.push({ d: d, k: key, ids: JSON.parse(x[2]) }); } catch (e) {}
    });
    return out_({ rows: rows });
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return out_({ error: 'busy' });   // بدل خطأ غير مفهوم عند الضغط الشديد
  try {
    if (b.action === 'set') {
      if (!isAdm) return out_({ error: 'admin' });
      upsert_(data_(), 1, String(b.key), [String(b.key), JSON.stringify(b.value)]);
      return out_({ ok: 1 });
    }
    if (b.action === 'setpw') {
      if (!isAdm) return out_({ error: 'admin' });
      const t = String(b.target), v = String(b.value || '').trim(), all = allPw_();
      const okT = ['teacher', 'sup', 'admin'].indexOf(t) >= 0 ||
        (t.indexOf('sup:') === 0 && ((config_() || {}).grades || []).some(x => x.id === t.slice(4)));
      if (!okT || v.length < 4) return out_({ error: 'bad' });
      if (Object.keys(all).some(r => r !== t && all[r] === v)) return out_({ error: 'dup' });
      PropertiesService.getScriptProperties().setProperty('pw_' + t.replace(':', '_'), v);
      return out_({ ok: 1 });
    }
    if (b.action === 'abs') {
      const date = String(b.date), key = String(b.key), k = date + '|' + key;
      if (role === 'sup' && who.grade && key.split('_')[0] !== who.grade) return out_({ error: 'grade' });
      if (!isAdm) {
        const why = blocked_(date, key);
        if (why) return out_({ error: 'locked', why: why });
      }
      const day = absDay_(date);                          // يُقرأ قبل الكتابة حتى تبقى الذاكرة مطابقة للورقة
      upsert_(abs_(), 4, k, [date, key, JSON.stringify(b.ids || []), k]);
      day[key] = b.ids || [];
      putDay_(date, day);
      const n = (b.names || []).length, total = Number(b.total) || 0;
      upsert_(log_(), 9, k, [date, b.grade || '', b.cls || '', b.period || '', total, n, Math.max(0, total - n), (b.names || []).join('، '), k]);
      return out_({ ok: 1 });
    }
    return out_({ error: 'bad' });
  } finally {
    lock.releaseLock();
  }
}
