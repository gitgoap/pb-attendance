# Attendance validation · 24 November 2026

The standalone attendance production build passed TypeScript and Vite checks.
**18 domain/database tests and 9 Chrome browser workflows passed.**

Database tests run the actual migration in a disposable PostgreSQL engine. They verify server timestamps, precise GPS rejection, staff/admin permissions, summary-view RLS, disabled staff, break ordering, backdated corrections, version conflicts, audit preservation and per-shift lunch policy snapshots. Domain tests cover second-level calculations, subsequent breaks after an admin correction, CSV formula escaping and IST boundaries.

Browser workflows use explicit local demo data, simulated punch locations, and mocked Supabase authentication responses:

- Staff check-in, break start/end, checkout and persistence after reopening.
- Admin backdating a missed arrival, reviewing a 90-minute lunch, editing a staff name and inspecting the audit record.
- PB coordinates and undecided lunch by default; an allowance is enabled only by an explicit settings change.
- Login and attendance at 320 px, staff/admin screens at 390 px, and the admin overview at 1440 px. Mobile attendance rows expose work time without horizontal scrolling.
- Admin demo is absent from public sign-in, staff previews and signed-in staff navigation. Saved demo markers cannot bypass sign-in or an active administrator role. Administrators can return from the demo, restore it after reloading, and sign out safely. Losing the active administrator role closes the preview. Demo mutations do not write live attendance data.

Browser tests generate phone login, staff phone and admin desktop screenshots in the ignored `test-results` directory. These contain fictional demonstration records.

Automatic lunch deductions remain **off**. Historical sample shifts show Needs lunch review until a demo admin reviews them. No actual staff contract duration has been assumed.

Not yet verified: hosted Supabase Auth and configuration, real employee accounts, physical phone GPS at PB, Vercel deployment and production network behavior. The setup and migration are ready in [README](../README.md); no live database, employee information or existing inventory installation was modified.
