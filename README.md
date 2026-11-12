# تطبيق الغياب (آيفون + أندرويد)

- `web/` : التطبيق نفسه (index.html). عدّل هنا فقط.
- `server/Code.gs` : سكربت Google Apps Script (لا يُرفع للاستضافة).
- `.github/workflows/` : بناء التطبيقين تلقائيًا على GitHub.

## البناء
تبويب **Actions** ← اختر **Build Android APK** أو **Build iOS** ← **Run workflow**.
بعد انتهائه (5–10 دقائق) انزل إلى **Artifacts** وحمّل الملف.

- أندرويد: `app-debug.apk` ثبّته مباشرة على الجوال (اسمح بالتثبيت من مصدر غير معروف).
- آيفون: `absence-unsigned.ipa` غير موقّع. التثبيت يحتاج توقيعًا:
  حساب Apple مجاني عبر Sideloadly أو AltStore (ينتهي كل 7 أيام)،
  أو حساب Apple Developer (99$ سنويًا) للتوقيع و TestFlight.

## بعد تعديل web/index.html
غيّر `APP_V` ثم ارفع التعديل، وأعد تشغيل البناء.
