import { createClient } from '@supabase/supabase-js';
import {
  dateKey,
  initialSettings,
  validateFix,
  type Audit,
  type Correction,
  type Day,
  type Fix,
  type Punch,
  type Settings,
  type Snapshot,
  type Staff,
} from './domain';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const cloud =
  url && key ? createClient(url, key, { auth: { storageKey: 'pb-attendance-auth' } }) : null;
export type Mode = 'live' | 'demo';
const DEMO_KEY = 'pb-attendance-demo-v1';
export const demoAdminId = '11111111-1111-4111-8111-111111111111';
export const demoStaffId = '22222222-2222-4222-8222-222222222222';

export async function requireLiveAdmin(): Promise<string> {
  if (!cloud) throw Error('Sign in to an administrator account to open the admin demo.');
  const { data: auth, error: authError } = await cloud.auth.getUser();
  if (authError || !auth.user)
    throw Error('Sign in to an administrator account to open the admin demo.');
  const { data: staff, error } = await cloud
    .from('pb_staff')
    .select('role,active')
    .eq('id', auth.user.id)
    .single();
  if (error || !staff?.active || staff.role !== 'admin')
    throw Error('Only active administrators can open the admin demo.');
  return auth.user.id;
}

function sample(): Snapshot {
  const staff: Staff[] = [
    {
      id: demoAdminId,
      staff_code: 'PB001',
      full_name: 'Aman Prakash',
      phone: '',
      department: 'Management',
      role: 'admin',
      active: true,
      version: 1,
    },
    {
      id: demoStaffId,
      staff_code: 'PB002',
      full_name: 'Rahul Kumar',
      phone: '98765 43210',
      department: 'Shop floor',
      role: 'staff',
      active: true,
      version: 1,
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      staff_code: 'PB003',
      full_name: 'Suresh Singh',
      phone: '98765 43211',
      department: 'Godown',
      role: 'staff',
      active: true,
      version: 1,
    },
    {
      id: '44444444-4444-4444-8444-444444444444',
      staff_code: 'PB004',
      full_name: 'Priya Sharma',
      phone: '98765 43212',
      department: 'Billing',
      role: 'staff',
      active: true,
      version: 1,
    },
  ];
  const settings: Settings = { ...initialSettings };
  const days: Day[] = [];
  for (let i = 1; i <= 24; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = dateKey(date);
    if (new Date(`${key}T12:00:00+05:30`).getUTCDay() === 0) continue;
    for (const [j, p] of staff.entries()) {
      if (i === 3 && j === 2) continue;
      days.push({
        id: crypto.randomUUID(),
        staff_id: p.id,
        work_date: key,
        check_in: new Date(
          `${key}T09:${String((i * 3 + j * 4) % 20).padStart(2, '0')}:00+05:30`,
        ).toISOString(),
        check_out: new Date(
          `${key}T18:${String((i * 7) % 30).padStart(2, '0')}:00+05:30`,
        ).toISOString(),
        breaks: [],
        break_started_at: null,
        break_override_minutes: null,
        break_mode: 'pending',
        fixed_break_minutes: 0,
        break_after_minutes: 360,
        source: 'gps',
        version: 1,
      });
    }
  }
  return { staff, settings, days, audits: [] };
}
function readDemo(): Snapshot {
  const saved = localStorage.getItem(DEMO_KEY);
  if (saved) return JSON.parse(saved);
  const state = sample();
  localStorage.setItem(DEMO_KEY, JSON.stringify(state));
  return state;
}
function demoChange(
  actor: string,
  entity: string,
  id: string,
  reason: string,
  previous: unknown,
  next: unknown,
  state: Snapshot,
) {
  state.audits.unshift({
    id: crypto.randomUUID(),
    actor_id: actor,
    entity,
    entity_id: id,
    reason,
    before_data: previous ? JSON.parse(JSON.stringify(previous)) : null,
    after_data: JSON.parse(JSON.stringify(next)),
    created_at: new Date().toISOString(),
  });
  localStorage.setItem(DEMO_KEY, JSON.stringify(state));
}
async function pages(table: string, configure: (q: any) => any) {
  const rows: any[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await configure(cloud!.from(table).select('*')).range(
      start,
      start + 999,
    );
    if (error) throw Error(error.message);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}
async function rpc(name: string, args: Record<string, unknown>) {
  if (!cloud) throw Error('Supabase has not been configured.');
  const { data, error } = await cloud.rpc(name, args);
  if (error) throw Error(error.message);
  return data;
}
async function requireDemoAdmin(actor: string, state: Snapshot) {
  if (!state.staff.some((p) => p.id === actor && p.active && p.role === 'admin'))
    throw Error('Admin access required.');
  await requireLiveAdmin();
}
export async function load(mode: Mode, actor: string, month: string): Promise<Snapshot> {
  if (mode === 'demo') {
    if (actor === demoAdminId) await requireLiveAdmin();
    return readDemo();
  }
  const [year, monthNumber] = month.split('-').map(Number);
  const upper = dateKey(new Date(Date.UTC(year, monthNumber, 1, 6, 30)));
  const [staff, days, settingsResult, auditResult] = await Promise.all([
    pages('pb_staff', (q) => q.order('staff_code')),
    pages('pb_attendance_summary', (q) =>
      q
        .or(
          `and(work_date.gte.${month}-01,work_date.lt.${upper}),work_date.eq.${dateKey()},check_out.is.null`,
        )
        .order('work_date', { ascending: false })
        .order('id'),
    ),
    cloud!.from('pb_settings').select('*').eq('id', 1).single(),
    cloud!
      .from('pb_audit')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id')
      .limit(100),
  ]);
  if (settingsResult.error) throw Error(settingsResult.error.message);
  if (auditResult.error) throw Error(auditResult.error.message);
  if (!staff.some((p) => p.id === actor && p.active))
    throw Error('Your account has no active staff profile. Ask your admin to provision it.');
  return {
    staff,
    days,
    settings: settingsResult.data as Settings,
    audits: auditResult.data as Audit[],
  };
}
export async function punch(mode: Mode, actor: string, action: Punch, fix?: Fix) {
  if (mode === 'live')
    return rpc('pb_punch', {
      p_action: action,
      p_lat: fix!.latitude,
      p_lng: fix!.longitude,
      p_accuracy: fix!.accuracy,
      p_captured_at: fix!.captured_at,
    });
  const state = readDemo();
  if (actor === demoAdminId) await requireLiveAdmin();
  const staff = state.staff.find((p) => p.id === actor && p.active);
  if (!staff) throw Error('Staff account inactive.');
  if (fix) validateFix(fix, state.settings);
  const now = new Date().toISOString();
  let d = state.days.find((d) => d.staff_id === actor && !d.check_out);
  const previous = d ? structuredClone(d) : null;
  if (action === 'check_in') {
    if (d || state.days.some((d) => d.staff_id === actor && d.work_date === dateKey()))
      throw Error('You have already marked attendance today.');
    d = {
      id: crypto.randomUUID(),
      staff_id: actor,
      work_date: dateKey(),
      check_in: now,
      check_out: null,
      breaks: [],
      break_started_at: null,
      break_override_minutes: null,
      break_mode: state.settings.break_mode,
      fixed_break_minutes: state.settings.fixed_break_minutes,
      break_after_minutes: state.settings.break_after_minutes,
      source: 'gps',
      version: 1,
    };
    state.days.unshift(d);
  } else {
    if (!d) throw Error('Check in first.');
    if (action === 'break_start') {
      if (d.break_started_at) throw Error('Break already running.');
      d.break_started_at = now;
    } else if (action === 'break_end') {
      if (!d.break_started_at) throw Error('No break is running.');
      d.breaks.push({ start: d.break_started_at, end: now });
      d.break_started_at = null;
    } else {
      if (d.break_started_at) throw Error('End your break first.');
      d.check_out = now;
    }
    d.version++;
  }
  demoChange(actor, 'attendance', d.id, action, previous, d, state);
}
export async function correct(mode: Mode, actor: string, c: Correction) {
  if (mode === 'live')
    return rpc('pb_correct_attendance', {
      p_staff_id: c.staff_id,
      p_work_date: c.work_date,
      p_check_in: c.check_in,
      p_check_out: c.check_out,
      p_break_minutes: c.break_override_minutes,
      p_expected_version: c.expected_version,
      p_reason: c.reason,
    });
  const state = readDemo();
  await requireDemoAdmin(actor, state);
  if (c.reason.trim().length < 5) throw Error('Give a correction reason of at least 5 characters.');
  const start = Date.parse(c.check_in),
    end = c.check_out ? Date.parse(c.check_out) : null;
  if (
    !Number.isFinite(start) ||
    start > Date.now() ||
    dateKey(new Date(start)) !== c.work_date ||
    (end !== null &&
      (!Number.isFinite(end) || end < start || end > Date.now() || end - start > 86400000))
  )
    throw Error('Check the shift date and times. Future attendance is not allowed.');
  if (
    c.break_override_minutes !== null &&
    (c.break_override_minutes < 0 ||
      (end !== null && c.break_override_minutes * 60000 > end - start))
  )
    throw Error('Unpaid break cannot exceed the completed shift.');
  let d = state.days.find((d) => d.staff_id === c.staff_id && d.work_date === c.work_date);
  if ((d?.version ?? 0) !== c.expected_version)
    throw Error('This record changed. Refresh and try again.');
  if (
    !c.check_out &&
    state.days.some((d) => d.staff_id === c.staff_id && !d.check_out && d.work_date !== c.work_date)
  )
    throw Error('Close the existing open shift first.');
  const previous = d ? structuredClone(d) : null;
  if (!d) {
    d = {
      id: crypto.randomUUID(),
      staff_id: c.staff_id,
      work_date: c.work_date,
      check_in: c.check_in,
      check_out: c.check_out,
      breaks: [],
      break_started_at: null,
      break_override_minutes: c.break_override_minutes,
      break_mode: state.settings.break_mode,
      fixed_break_minutes: state.settings.fixed_break_minutes,
      break_after_minutes: state.settings.break_after_minutes,
      source: 'admin',
      version: 1,
    };
    state.days.unshift(d);
  } else
    Object.assign(d, {
      check_in: c.check_in,
      check_out: c.check_out,
      break_override_minutes: c.break_override_minutes,
      breaks: [],
      break_started_at: null,
      source: 'admin',
      version: d.version + 1,
    });
  demoChange(actor, 'attendance', d.id, c.reason, previous, d, state);
}
export async function saveStaff(mode: Mode, actor: string, staff: Staff, reason: string) {
  if (mode === 'live')
    return rpc('pb_save_staff', {
      p_id: staff.id,
      p_staff_code: staff.staff_code,
      p_full_name: staff.full_name,
      p_phone: staff.phone,
      p_department: staff.department,
      p_role: staff.role,
      p_active: staff.active,
      p_expected_version: staff.version,
      p_reason: reason,
    });
  const state = readDemo();
  await requireDemoAdmin(actor, state);
  if (staff.id === actor && (!staff.active || staff.role !== 'admin'))
    throw Error('You cannot deactivate or demote your own admin account.');
  const previous = state.staff.find((p) => p.id === staff.id);
  if ((previous?.version ?? 0) !== staff.version)
    throw Error('This profile changed. Refresh and try again.');
  if (state.staff.some((p) => p.id !== staff.id && p.staff_code === staff.staff_code))
    throw Error('This staff code is already in use.');
  const next = { ...staff, version: staff.version + 1 };
  state.staff = [...state.staff.filter((p) => p.id !== staff.id), next];
  demoChange(actor, 'staff', staff.id, reason, previous, next, state);
}
export async function saveSettings(mode: Mode, actor: string, settings: Settings, reason: string) {
  if (settings.break_mode === 'fixed' && settings.fixed_break_minutes <= 0)
    throw Error('Enter the agreed unpaid lunch duration before enabling automatic deductions.');
  if (mode === 'live')
    return rpc('pb_save_settings', {
      p_shop_name: settings.shop_name,
      p_lat: settings.latitude,
      p_lng: settings.longitude,
      p_break_mode: settings.break_mode,
      p_fixed_break_minutes: settings.fixed_break_minutes,
      p_break_after_minutes: settings.break_after_minutes,
      p_expected_version: settings.version,
      p_reason: reason,
    });
  const state = readDemo();
  await requireDemoAdmin(actor, state);
  if (state.settings.version !== settings.version)
    throw Error('Settings changed. Refresh and try again.');
  const previous = state.settings;
  state.settings = { ...settings, version: settings.version + 1 };
  demoChange(actor, 'settings', '1', reason, previous, state.settings, state);
}
