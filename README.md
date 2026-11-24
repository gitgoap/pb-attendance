# PB Attendance

Mobile-first staff attendance for **Prakash Bhandar**, with a separate admin panel. This standalone Vite / React / TypeScript application lives in [gitgoap/pb-attendance](https://github.com/gitgoap/pb-attendance). Deploy the **repository root** as its own Vercel project. PB's inventory application is maintained separately.

## Current lunch decision

**Automatic lunch deductions are OFF. No 60-minute allowance is assumed.**

PB confirmed unpaid lunch is part of its staff contracts, but has not chosen a tracking policy or deduction duration. The default is `pending`: check-ins and check-outs are recorded, while payable hours show **Needs lunch review**. Admins confirm the total unpaid minutes using an attendance correction. Unreviewed shifts are excluded from confirmed totals and the payable-hours column in exports stays blank.

Available settings for future shifts:

| Policy                             | Operation                                                                                                                                               | Limitation                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Undecided / admin review (default) | Admin confirms each shift's actual unpaid break.                                                                                                        | Requires daily review.                                |
| Automatic agreed deduction         | Deduct the configured allowance after a configured amount of time on site. If recorded breaks exceed that allowance, deduct the recorded total instead. | Unrecorded extra time away needs an admin correction. |
| Recorded breaks                    | Staff tap Start unpaid break and End break; actual break intervals are deducted.                                                                        | Depends on compliance or supervisor verification.     |

Recommended order for least daily hassle: (1) agreed allowance with admin exceptions, (2) supervisor records/reviews actual lunch, (3) common scheduled lunch window if operationally feasible, (4) shared-device lunch taps, (5) doorway hardware. Common lunch windows, supervisor-specific live lunch controls, shared-device identity verification, and hardware integrations are **future options**, not implemented features. The current admin correction form supports supervisor review of actual lunch totals.

Time is computed in seconds from recorded events, not rounded decimal hours. On-site time is not proof of time actually working. Browser GPS cannot detect every departure, guarantee background tracking, prevent mocked coordinates, or establish exact productive hours. If exact variable lunch duration matters, use supervisor verification or consistently used entry/exit hardware.

## Local setup

Node.js **22.14+ or 24+**, npm:

```powershell
npm ci
npm run dev
```

Run these commands at the attendance repository root. If using the original development copy inside the inventory workspace, enter its `attendance` directory first. Open the printed localhost URL. Choose **Staff demo** or **Admin demo** to try the complete interface without a backend. Demo records persist in this browser under a separate `pb-attendance-demo-v1` key. Demo GPS actions are explicitly simulated and never write to Supabase. Live connection errors never fall back to demo data.

For a fresh demo, remove only the `pb-attendance-demo-v1` localStorage key and the `pb-attendance-demo-actor` sessionStorage key on the attendance origin. Do not clear the inventory application's storage.

## Supabase setup

1. Create a **dedicated Supabase project** for attendance. This application does not read the inventory project's `.env` file.
2. Run [001_attendance.sql](supabase/migrations/001_attendance.sql) once using the project's SQL editor. Do not run the inventory migrations in this project. The migration creates `pb_` tables/functions and an RLS-protected summary view.
3. In **Authentication → Users**, create and confirm the first administrator's email/password account. Copy its Auth user UUID.
4. Provision the first admin in the SQL editor, replacing the example UUID and name:

```sql
insert into public.pb_staff(id, staff_code, full_name, department, role)
values ('REPLACE-WITH-AUTH-USER-UUID', 'PB001', 'Your full name', 'Management', 'admin');
```

5. Disable public self-signup in the project's Auth configuration. Accounts are provisioned by PB. Configure the Vercel URL as the Auth Site URL. Configure email delivery if using Supabase recovery emails.
6. Copy `.env.example` to **.env** at the attendance project root and fill in this project's URL and publishable/anon key:

```dotenv
VITE_SUPABASE_URL=https://your-attendance-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
```

7. Restart the development server. Sign in with the admin account.
8. In Shop settings, verify the provided GPS centre: **23.38102667646155, 85.30280104820979**. Leave lunch **Undecided** until PB chooses its policy and duration.
9. For each employee, create and confirm their Auth account in Supabase, then use **Staff members → Add staff** with its UUID. Admins can edit name, staff code, phone, department, role and active status. Auth login email, password resets and account invitations are managed in Supabase; editing a profile does not change Auth credentials.

Only the public publishable/anon key belongs in the frontend. Never add a service-role key or database password to a `VITE_` variable. The migration, RLS policies and role-checked database functions enforce permissions independently of the UI.

## Vercel deployment

1. Import this Git repository as a **new Vercel project**.
2. Keep **Root Directory** at the repository root (`.`) and framework preset at **Vite**.
3. Use install command `npm ci`, build command `npm run build`, and output directory `dist`.
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Vercel project environments you use. Redeploy after changing them; Vite reads them at build time.
5. Deploy. Vercel HTTPS allows the browser to request precise location. The included `vercel.json` configures the build and location permissions.
6. Test on real iPhone/Android devices at PB before staff rely on it. This repository has not been deployed or connected to a hosted attendance database in this session.

Do not change the existing inventory Vercel project's root directory. No Vercel account, Supabase admin credentials, employee passwords or live database access are required for the local demo.

## Staff workflow

- Sign in with a provisioned email/password.
- At the shop, allow **precise location**, then tap Check in.
- Use Start unpaid break and End break at the shop if recording actual breaks.
- Tap Check out before leaving. A running break must be ended first.
- See this month's attendance and confirmed hours; use Attendance to select earlier months and export your own CSV.
- Ask an admin to fix missed punches, GPS failures or lunch exceptions.

There is one shift per staff member per IST date, with multiple break intervals. An overnight shift belongs to its arrival date and can span up to 24 hours. Split shifts after a completed checkout need an admin correction in this version. An unclosed shift older than 24 hours requires admin review. Incomplete shifts are excluded from confirmed monthly totals.

## Admin corrections and audit

Admins can add missed attendance for any past date, backdate the actual arrival, correct departure and enter the reviewed unpaid break total. Times cannot be in the future; checkout must follow arrival within 24 hours, and breaks cannot exceed a completed shift.

Corrections require a reason and record the actor, server timestamp, before and after values. Staff and settings changes are also audited. Direct client edits to attendance, audit records, staff profiles and settings are denied, including for admins. Version checks reject stale saves. Staff can only read their own attendance; active admins can read all staff records. Deactivated accounts cannot read attendance or punch, even if an Auth session remains valid. Admins cannot deactivate or demote their own account.

Each shift saves the lunch policy active at check-in. Future policy changes do not recalculate historical shifts. A correction replaces the existing break intervals with the reviewed total; the original intervals remain in the audit record. Any new recorded breaks after a correction are added to that reviewed total.

If correcting a record from another month, open that month in the Attendance register first. The client will not silently overwrite a hidden existing record.

## GPS rules and limits

Every live staff action checks fresh location **on the server**:

- Database server time determines punch time. The phone cannot submit its preferred check-in time.
- The reported position must be at most 60 seconds old and at most 5 seconds ahead of server time.
- Coordinates must be valid, reported accuracy at most 25 m, and **distance from the saved centre + reported accuracy ≤ 25 m**.
- This conservative test can reject someone physically inside the shop if their GPS is poor. Try near the entrance; an admin can record a verified exception without enlarging the radius.
- Browser GPS is an estimate, not guaranteed exact positioning or spoof protection. No continuous tracking, location-based automatic clockout or offline punch queue is implemented.
- Location is saved with audit evidence for each punch; admin corrections use a reason instead of manufactured GPS evidence.

Review coordinates on actual devices. A Vercel preview, browser GPS simulation or desktop test does not establish that GPS will meet a 25 m limit inside PB.

## Validation

```powershell
npm test
npm run build
# Use an installed Chrome, or install Playwright Chromium for your environment.
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run test:e2e
```

Domain tests cover exact durations, lunch policies, overnight calculations, IST boundaries, GPS rejection and safe CSV formatting. Database tests execute the migration in a disposable PostgreSQL engine and exercise authorization, RLS on the summary view, server GPS validation, break transitions, corrections, audit preservation and policy snapshots. Browser tests exercise demo workflows at phone and desktop widths. These checks do not validate hosted Supabase Auth, production RLS configuration, real phone GPS or a deployed Vercel instance.

Implementation references: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [database functions](https://supabase.com/docs/guides/database/functions), [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite), [browser GPS accuracy](https://developer.mozilla.org/en-US/docs/Web/API/GeolocationCoordinates/accuracy).
