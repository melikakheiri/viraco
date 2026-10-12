# برد وظایف فارسی

## معرفی پروژه

برد وظایف یک برنامهٔ ساده برای مدیریت کارهای تیم است. کاربران می‌توانند وظیفه بسازند، مسئول آن را مشخص کنند و وضعیت انجامش را دنبال کنند. رابط برنامه فارسی و راست‌به‌چپ است و دسترسی هر کاربر به نقش او بستگی دارد.

## امکانات

- ورود و خروج با احراز هویت مبتنی بر کوکی‌های HttpOnly.
- سه نقش کاربری: `OWNER` برای مدیریت کاربران و همهٔ وظایف، `MANAGER` برای مدیریت همهٔ وظایف و `MEMBER` برای کار روی وظایف ساخته‌شده توسط خودش یا واگذارشده به او. عضو فقط وظایفی را که خودش ساخته حذف می‌کند.
- ساخت، مشاهده، ویرایش و حذف وظایف متناسب با سطح دسترسی.
- تعیین مسئول، اولویت، موعد و وضعیت «انجام‌نشده»، «در حال انجام» یا «انجام‌شده».
- فیلتر بر اساس وضعیت و مسئول، همراه با صفحه‌بندی فهرست وظایف.
- نوشتن توضیحات با ویرایشگر TipTap، شامل قالب‌بندی متن، فهرست و لینک.
- رابط فارسی و RTL. ورودی تاریخ از کنترل بومی مرورگر استفاده می‌کند و تقویم شمسی نیست.

## تکنولوژی‌ها

| بخش | ابزارها |
| --- | --- |
| رابط کاربری | Next.js 15، React 19، TypeScript |
| ظاهر و کنترل‌ها | Tailwind CSS، Headless UI |
| ویرایشگر متن | TipTap 3 |
| سرور | NestJS 11، TypeScript |
| پایگاه داده | PostgreSQL 16، TypeORM و migration |
| احراز هویت | JWT، کوکی HttpOnly و bcryptjs |
| تست | Node.js Test Runner، Playwright و axe |
| محیط توسعه | npm workspaces، Docker Compose |

نسخه‌های دقیق وابستگی‌ها در [package-lock.json](package-lock.json) ثبت شده‌اند.

## راه‌اندازی پروژه

### پیش‌نیازها

- Node.js نسخهٔ ۲۰ یا بالاتر و npm؛ برای این بازبینی از Node.js 22 استفاده شده است.
- Docker همراه با Docker Compose؛ موتور Docker باید در حال اجرا باشد.
- Microsoft Edge برای اجرای تست‌های مرورگر.

دستورهای زیر برای PowerShell هستند و از ریشهٔ پروژه اجرا می‌شوند.

### ۱. نصب وابستگی‌ها

```powershell
Set-Location H:\projects\viraco
npm ci
```

### ۲. تنظیم فایل‌های محیط

فایل‌های نمونه را کپی کنید. این دستورها فایل‌های موجود را بازنویسی نمی‌کنند:

```powershell
if (!(Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
if (!(Test-Path frontend/.env.local)) { Copy-Item frontend/.env.example frontend/.env.local }
if (!(Test-Path .env)) { New-Item -ItemType File -Path .env | Out-Null }
```

در `.env` ریشه، متغیر `POSTGRES_PASSWORD` را با یک رمز محلی دلخواه تنظیم کنید. قالب `.env.example` برای ریشه وجود ندارد.

در `backend/.env` همهٔ مقادیر `REPLACE_WITH_...` را جایگزین کنید:

| متغیر | مقدار موردنیاز |
| --- | --- |
| `DATABASE_PASSWORD` | همان رمز `POSTGRES_PASSWORD` در فایل ریشه |
| `JWT_ACCESS_SECRET` | یک مقدار تصادفی و خصوصی با حداقل ۳۲ بایت |
| `SEED_OWNER_PASSWORD` | رمز حساب مالک |
| `SEED_MANAGER_PASSWORD` | رمز حساب مدیر |
| `SEED_MEMBER_PASSWORD` | رمز حساب عضو |

برای تولید secret می‌توانید دستور زیر را در محیط محلی اجرا و خروجی را در `JWT_ACCESS_SECRET` قرار دهید. خروجی را منتشر نکنید:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

هر رمز seed باید حداقل ۱۲ کاراکتر و حداکثر ۷۲ بایت UTF-8 باشد. ایمیل‌ها و دیگر تنظیمات [قالب backend](backend/.env.example) را برای اجرای محلی بدون تغییر نگه دارید:

```dotenv
DATABASE_HOST=localhost
DATABASE_PORT=5433
DATABASE_NAME=taskboard
DATABASE_USER=taskboard
PORT=3001
APP_ORIGIN=http://localhost:3000
COOKIE_SECURE=false
COOKIE_SAME_SITE=lax
```

قالب شامل تنظیمات لازم JWT، مدت نشست و نام کوکی‌ها هم هست؛ فایل را کامل کپی کنید. در `frontend/.env.local` مقدار زیر کافی است:

```dotenv
BACKEND_URL=http://127.0.0.1:3001
```

فایل‌های محیط و رمزها را در Git ثبت نکنید. این تنظیمات برای توسعهٔ محلی هستند؛ احراز هویت در حالت production به HTTPS و کوکی Secure نیاز دارد و seed در آن حالت اجرا نمی‌شود.

### ۳. اجرای پایگاه داده

```powershell
npm run db:up
docker compose ps
```

منتظر بمانید وضعیت PostgreSQL برابر `healthy` شود. Compose فقط دیتابیس را اجرا می‌کند و آن را روی `127.0.0.1:5433` در دسترس قرار می‌دهد.

اگر قبلاً دیتابیس را ساخته‌اید، تغییر `POSTGRES_PASSWORD` در فایل محیط رمز ذخیره‌شدهٔ PostgreSQL را عوض نمی‌کند؛ تنظیمات باید با رمز همان دیتابیس مطابقت داشته باشند.

### ۴. ساخت جدول‌ها و کاربران نمونه

```powershell
npm run migration:run
npm run seed
```

migration جدول‌ها را می‌سازد و seed سه حساب نمونه را اضافه می‌کند. برای دیدن وضعیت migrationها:

```powershell
npm run migration:show
```

ساختار دیتابیس با migration مدیریت می‌شود و `synchronize` غیرفعال است. ابزارهای migration و seed برای مقصد توسعهٔ محلی `taskboard` روی پورت `5433` یا محیط آزمون مستقل تنظیم شده‌اند.

### ۵. اجرای backend و frontend

در یک ترمینال از ریشهٔ پروژه:

```powershell
npm run start:dev --workspace backend
```

در ترمینال دوم، باز هم از ریشه:

```powershell
npm run dev --workspace frontend
```

یا برای اجرای هم‌زمان هر دو، به‌جای دو دستور بالا از این دستور استفاده کنید:

```powershell
npm run dev
```

برنامه را در [http://localhost:3000](http://localhost:3000) باز کنید. backend روی `http://127.0.0.1:3001` اجرا می‌شود. پورت‌های ۳۰۰۰ و ۳۰۰۱ باید آزاد باشند؛ آدرس مرورگر باید با `APP_ORIGIN` یکسان باشد.

نام اسکریپت‌های دیتابیس و migration در این مخزن `db:up` و `migration:run` است؛ دستورهای `npm run db` و `npm run migration` تعریف نشده‌اند.

## کاربران نمونه

با حفظ ایمیل‌های پیش‌فرض در `backend/.env`، seed این حساب‌ها را می‌سازد:

| نقش | ایمیل | متغیر رمز عبور |
| --- | --- | --- |
| `OWNER` | [owner@taskboard.local](mailto:owner@taskboard.local) | `SEED_OWNER_PASSWORD` |
| `MANAGER` | [manager@taskboard.local](mailto:manager@taskboard.local) | `SEED_MANAGER_PASSWORD` |
| `MEMBER` | [member@taskboard.local](mailto:member@taskboard.local) | `SEED_MEMBER_PASSWORD` |

پیش از اجرای `npm run seed`، برای هر سه متغیر رمز معتبر تعیین کنید. برای ورود از همان رمز انتخابی استفاده کنید؛ رمز مشترک یا ثابت در مخزن وجود ندارد. ایمیل‌ها نیز با `SEED_OWNER_EMAIL`، `SEED_MANAGER_EMAIL` و `SEED_MEMBER_EMAIL` قابل تنظیم‌اند.

seed حسابی را که ایمیلش از قبل وجود دارد تغییر نمی‌دهد؛ رمز، نقش و وضعیت آن حفظ می‌شود. بنابراین تغییر رمز در فایل محیط و اجرای دوبارهٔ seed، رمز حساب موجود را عوض نمی‌کند. seed فقط کاربران را می‌سازد، نه وظایف نمونه.

## ساختار پروژه

| مسیر | محتوا |
| --- | --- |
| [frontend/](frontend/) | صفحات Next.js، اجزای رابط فارسی و پراکسی API |
| [backend/](backend/) | احراز هویت، مجوزها، مدیریت کاربران و وظایف، migration و seed |
| [docs/](docs/) | مستندات معماری، API و گزارش‌های فنی |
| [tests/](tests/) | تست‌های پیکربندی پروژه |
| [scripts/verify-isolated.cjs](scripts/verify-isolated.cjs) | آماده‌سازی و اجرای بررسی‌ها در محیط آزمون مستقل |

مرورگر درخواست‌ها را به مسیرهای نسبی `/api/v1/*` در Next.js می‌فرستد. پراکسی آن‌ها را به NestJS منتقل می‌کند؛ منطق برنامه و کنترل دسترسی در backend اجرا می‌شود و داده‌ها در PostgreSQL ذخیره می‌شوند. توضیحات TipTap به‌صورت JSONB نگهداری می‌شوند.

برای بررسی بیشتر، [معماری](docs/architecture.md) و [مستندات API](docs/api.md) را ببینید. محدودیت‌های اجرا و یافته‌های ثبت‌شدهٔ امنیتی وابستگی‌ها در [محدودیت‌های شناخته‌شده](docs/known-limitations.md) آمده‌اند. استقرار واقعی HTTPS هنوز آزموده نشده است.

## اجرای تست‌ها

دستورهای زیر از ریشه اجرا می‌شوند:

| بررسی | دستور |
| --- | --- |
| تست‌های backend | `npm test --workspace backend` |
| تست‌های frontend | `npm test --workspace frontend` |
| تست‌های پیکربندی | `npm run test:configuration` |
| Typecheck سرور | `npm run typecheck --workspace backend` |
| Typecheck رابط | `npm run typecheck --workspace frontend` |
| Lint هر دو بخش | `npm run lint` |
| Build هر دو بخش | `npm run build` |

تست‌های backend به دیتابیس آزمون مستقل نیاز دارند: `TEST_DATABASE=true`، میزبان محلی، نام مطابق `taskboard_test_[a-z0-9_]+` و پورتی غیر از `5433`. آن‌ها را روی دیتابیس توسعه اجرا نکنید.

برای آماده‌سازی خودکار محیط مستقل و اجرای مجموعهٔ بررسی‌ها، از جمله تست‌های Edge:

```powershell
npm run verify:isolated
```

این دستور به Docker و Edge نیاز دارد. دیتابیس موقت می‌سازد، migration و seed را اجرا می‌کند، تست‌ها و بررسی‌های کد را انجام می‌دهد و هر دو سرویس را برای تست مرورگر بالا می‌آورد. پورت‌های `15434`، `3400` و `3401` باید آزاد باشند. در پایان، کانتینر موقت و فرایندهای اجراشده را پاک می‌کند.

اگر build آماده است و فقط تست‌های مرورگر را می‌خواهید:

```powershell
npm run verify:isolated -- --e2e-only
```

برای اجرای مستقیم Playwright در محیط آزمونی که از قبل دیتابیس، حساب‌ها و هر دو سرویس آن آماده‌اند:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:e2e --workspace frontend
```

در اجرای مستقیم، `PLAYWRIGHT_BASE_URL` باید با `APP_ORIGIN` یکسان باشد و متغیرهای دیتابیس آزمون و حساب‌های seed نیز تنظیم باشند. Playwright خودش سرویس‌ها را اجرا نمی‌کند.

## استفاده از هوش مصنوعی

در توسعهٔ این پروژه از Codex به‌عنوان دستیار برای پیاده‌سازی بخش‌هایی از کد، بازبینی و بهبود نگهداشت‌پذیری، بررسی سازگاری معماری، پیدا کردن آسیب‌پذیری‌های احتمالی و کمک به رفع اشکال و تست استفاده شده است. این کمک جای بازبینی تغییرات و ارزیابی نتایج را نمی‌گیرد؛ جزئیات بیشتر در [مستند فرایند توسعه](docs/ai-workflow.md) آمده است.
