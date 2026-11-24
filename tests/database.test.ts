import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { beforeAll, beforeEach, afterAll, it, expect } from 'vitest';

const admin = '11111111-1111-4111-8111-111111111111',
  staff = '22222222-2222-4222-8222-222222222222',
  other = '33333333-3333-4333-8333-333333333333';
let db: PGlite;
async function actor(id: string) {
  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
async function punch(
  action = 'check_in',
  lat = 23.38102667646155,
  lng = 85.30280104820979,
  accuracy = 5,
  captured = new Date().toISOString(),
) {
  return db.query('select public.pb_punch($1,$2,$3,$4,$5)', [action, lat, lng, accuracy, captured]);
}
async function correct(
  version = 0,
  reason = 'Forgot to mark attendance',
  minutes: number | null = 60,
) {
  return db.query('select public.pb_correct_attendance($1,$2,$3,$4,$5,$6,$7)', [
    staff,
    '2026-11-20',
    '2026-11-20T09:00:00+05:30',
    '2026-11-20T18:00:31+05:30',
    minutes,
    version,
    reason,
  ]);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  await db.exec(await readFile('supabase/migrations/001_attendance.sql', 'utf8'));
  for (const id of [admin, staff, other]) await db.query('insert into auth.users values($1)', [id]);
}, 30000);
beforeEach(async () => {
  await db.exec('reset role;truncate public.pb_audit,public.pb_attendance,public.pb_staff');
  for (const [id, code, role] of [
    [admin, 'PB001', 'admin'],
    [staff, 'PB002', 'staff'],
    [other, 'PB003', 'staff'],
  ])
    await db.query(
      'insert into public.pb_staff(id,staff_code,full_name,role) values($1,$2,$2,$3)',
      [id, code, role],
    );
  await actor(staff);
});
afterAll(async () => {
  await db.close();
});
it('creates attendance using server time and never invents payable hours for an undecided lunch', async () => {
  const before = Date.now();
  await punch();
  const r = await db.query<{ check_in: Date; worked_seconds: number | null }>(
    'select check_in,worked_seconds from public.pb_attendance_summary',
  );
  expect(new Date(r.rows[0].check_in).getTime()).toBeGreaterThanOrEqual(before - 100);
  expect(r.rows[0].worked_seconds).toBeNull();
  await expect(punch()).rejects.toThrow('already checked in');
});
it('rejects remote, stale, imprecise and null GPS readings on the server', async () => {
  await expect(punch('check_in', 23.39)).rejects.toThrow('closer');
  await expect(punch('check_in', 23.38102667646155, 85.30280104820979, 40)).rejects.toThrow(
    'accuracy',
  );
  await expect(
    punch('check_in', 23.38102667646155, 85.30280104820979, 5, '2000-01-01T00:00:00Z'),
  ).rejects.toThrow('expired');
  await expect(
    db.query('select public.pb_punch($1,null,null,null,null)', ['check_in']),
  ).rejects.toThrow('accuracy');
  await expect(db.query('select public.pb_punch(null,23.38,85.30,5,now())')).rejects.toThrow(
    'Invalid',
  );
});
it('enforces break ordering and one completed shift per IST day', async () => {
  await expect(punch('check_out')).rejects.toThrow('Check in');
  await punch();
  await punch('break_start');
  await expect(punch('check_out')).rejects.toThrow('End your break');
  await expect(punch('break_start')).rejects.toThrow('already running');
  await punch('break_end');
  await punch('check_out');
  await expect(punch()).rejects.toThrow('already completed');
});
it('only lets admins backdate attendance and requires a reason and current version', async () => {
  await expect(correct()).rejects.toThrow('Admin');
  await actor(admin);
  await expect(correct(0, '')).rejects.toThrow('reason');
  await correct();
  await expect(correct(0)).rejects.toThrow('changed');
  const summary = await db.query<{ worked_seconds: number }>(
    'select worked_seconds from public.pb_attendance_summary',
  );
  expect(summary.rows[0].worked_seconds).toBe(28831);
  await correct(1, 'Confirmed two hour lunch', 120);
  expect(
    (
      await db.query<{ worked_seconds: number }>(
        'select worked_seconds from public.pb_attendance_summary',
      )
    ).rows[0].worked_seconds,
  ).toBe(25231);
  const audit = await db.query<{
    before_data: { version: number };
    after_data: { version: number };
  }>('select before_data,after_data from public.pb_audit order by created_at desc limit 1');
  expect(audit.rows[0].before_data.version).toBe(1);
  expect(audit.rows[0].after_data.version).toBe(2);
});
it('rejects future, mismatched, excessive breaks and backwards corrections', async () => {
  await actor(admin);
  await expect(correct(0, 'Reviewed lunch', 900)).rejects.toThrow('exceed');
  await expect(
    db.query(
      "select public.pb_correct_attendance($1,'2099-01-01','2099-01-01T09:00:00+05:30',null,0,0,'Future correction')",
      [staff],
    ),
  ).rejects.toThrow('future');
  await expect(
    db.query(
      "select public.pb_correct_attendance($1,'2026-11-19','2026-11-20T09:00:00+05:30',null,0,0,'Wrong date correction')",
      [staff],
    ),
  ).rejects.toThrow('match');
  await expect(
    db.query(
      "select public.pb_correct_attendance($1,'2026-11-20','2026-11-20T09:00:00+05:30','2026-11-20T08:00:00+05:30',0,0,'Wrong time correction')",
      [staff],
    ),
  ).rejects.toThrow('follow');
});
it('uses RLS on the summary view and forbids direct edits to records and audits', async () => {
  await actor(admin);
  await correct();
  await actor(other);
  expect((await db.query('select * from public.pb_attendance_summary')).rows).toHaveLength(0);
  expect((await db.query('select * from public.pb_audit')).rows).toHaveLength(0);
  expect((await db.query('select * from public.pb_staff')).rows).toHaveLength(1);
  await actor(staff);
  expect((await db.query('select * from public.pb_attendance_summary')).rows).toHaveLength(1);
  await expect(db.exec('update public.pb_attendance set check_out=now()')).rejects.toThrow(
    'permission denied',
  );
  await actor(admin);
  await expect(db.exec('delete from public.pb_audit')).rejects.toThrow('permission denied');
});
it('prevents self-promotion and disabling your own admin; deactivated staff cannot punch or read', async () => {
  const change = (id: string, role: string, active: boolean, version = 1) =>
    db.query(
      "select public.pb_save_staff($1,'PB002','Test','123','Shop',$2,$3,$4,'Account update')",
      [id, role, active, version],
    );
  await expect(change(staff, 'admin', true)).rejects.toThrow('Admin');
  await actor(admin);
  await expect(change(admin, 'staff', true)).rejects.toThrow('own admin');
  await change(staff, 'staff', false);
  await actor(staff);
  await expect(punch()).rejects.toThrow('inactive');
  expect((await db.query('select * from public.pb_settings')).rows).toHaveLength(0);
});
it('retains each shift policy when shop settings change', async () => {
  await punch();
  await actor(admin);
  await expect(
    db.query(
      "select public.pb_save_settings('PB',23.38102667646155,85.30280104820979,'fixed',0,360,1,'No agreed allowance yet')",
    ),
  ).rejects.toThrow('agreed unpaid lunch');
  await db.query(
    "select public.pb_save_settings('PB',23.38102667646155,85.30280104820979,'fixed',90,360,1,'Agreed lunch allowance')",
  );
  await actor(other);
  await punch();
  await actor(admin);
  const rows = await db.query<{
    staff_id: string;
    break_mode: string;
    fixed_break_minutes: number;
  }>('select staff_id,break_mode,fixed_break_minutes from public.pb_attendance_summary');
  expect(rows.rows.find((r) => r.staff_id === staff)?.break_mode).toBe('pending');
  expect(rows.rows.find((r) => r.staff_id === other)?.fixed_break_minutes).toBe(90);
});
