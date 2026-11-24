export type Staff = {
  id: string;
  staff_code: string;
  full_name: string;
  phone: string;
  department: string;
  role: 'admin' | 'staff';
  active: boolean;
  version: number;
};
export type Settings = {
  id: number;
  shop_name: string;
  latitude: number | null;
  longitude: number | null;
  break_mode: 'pending' | 'fixed' | 'tracked';
  fixed_break_minutes: number;
  break_after_minutes: number;
  version: number;
};
export type Break = { start: string; end: string };
export type Day = {
  id: string;
  staff_id: string;
  work_date: string;
  check_in: string;
  check_out: string | null;
  breaks: Break[];
  break_started_at: string | null;
  break_override_minutes: number | null;
  break_mode: 'pending' | 'fixed' | 'tracked';
  fixed_break_minutes: number;
  break_after_minutes: number;
  source: 'gps' | 'admin';
  version: number;
  worked_seconds?: number | null;
};
export type Audit = {
  id: string;
  actor_id: string;
  entity: string;
  entity_id: string;
  reason: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown>;
  created_at: string;
};
export type Snapshot = { staff: Staff[]; days: Day[]; settings: Settings; audits: Audit[] };
export type Fix = { latitude: number; longitude: number; accuracy: number; captured_at: string };
export type Punch = 'check_in' | 'check_out' | 'break_start' | 'break_end';
export type Correction = {
  staff_id: string;
  work_date: string;
  check_in: string;
  check_out: string | null;
  break_override_minutes: number | null;
  expected_version: number;
  reason: string;
};
export const TIME_ZONE = 'Asia/Kolkata';
export const RADIUS_METRES = 25;
export const initialSettings: Settings = {
  id: 1,
  shop_name: 'Prakash Bhandar',
  latitude: 23.38102667646155,
  longitude: 85.30280104820979,
  break_mode: 'pending',
  fixed_break_minutes: 0,
  break_after_minutes: 360,
  version: 1,
};
export function dateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function timeLabel(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat('en-IN', {
        timeZone: TIME_ZONE,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(value))
    : '—';
}
export function dateLabel(value: string, long = false): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: TIME_ZONE,
    weekday: long ? 'long' : 'short',
    day: 'numeric',
    month: long ? 'long' : 'short',
    ...(long ? { year: 'numeric' } : {}),
  }).format(new Date(`${value}T12:00:00+05:30`));
}
export function hoursLabel(seconds: number): string {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}
export function duration(day: Day, now = new Date()) {
  const end = new Date(day.check_out ?? now).getTime();
  const gross = Math.max(0, (end - new Date(day.check_in).getTime()) / 1000);
  const tracked =
    day.breaks.reduce(
      (sum, b) => sum + (new Date(b.end).getTime() - new Date(b.start).getTime()) / 1000,
      0,
    ) +
    (day.break_started_at
      ? Math.max(0, (end - new Date(day.break_started_at).getTime()) / 1000)
      : 0);
  const fixed =
    day.break_mode === 'fixed' && gross >= day.break_after_minutes * 60
      ? day.fixed_break_minutes * 60
      : 0;
  const unpaid = Math.min(
    gross,
    day.break_override_minutes !== null
      ? day.break_override_minutes * 60 + tracked
      : Math.max(tracked, fixed),
  );
  const reviewed = day.break_mode !== 'pending' || day.break_override_minutes !== null;
  return {
    gross,
    unpaid,
    reviewed,
    worked: !reviewed
      ? 0
      : day.check_out && day.worked_seconds != null
        ? Number(day.worked_seconds)
        : Math.max(0, gross - unpaid),
  };
}
export function distanceMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const radians = (n: number) => (n * Math.PI) / 180;
  const a =
    Math.sin(radians(lat2 - lat1) / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(radians(lng2 - lng1) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}
export function validateFix(fix: Fix, settings: Settings, now = Date.now()): number {
  if (settings.latitude === null || settings.longitude === null)
    throw Error('The shop location has not been set. Please ask an admin.');
  if (
    ![fix.latitude, fix.longitude, fix.accuracy].every(Number.isFinite) ||
    Math.abs(fix.latitude) > 90 ||
    Math.abs(fix.longitude) > 180 ||
    fix.accuracy < 0
  )
    throw Error('Invalid GPS reading. Please try again.');
  const age = now - Date.parse(fix.captured_at);
  if (!Number.isFinite(age) || age > 60000 || age < -5000)
    throw Error('GPS reading expired. Please try again.');
  const distance = distanceMetres(
    fix.latitude,
    fix.longitude,
    settings.latitude,
    settings.longitude,
  );
  if (fix.accuracy > RADIUS_METRES)
    throw Error(
      `GPS accuracy is ±${Math.round(fix.accuracy)} m. Move near the entrance and try again.`,
    );
  if (distance + fix.accuracy > RADIUS_METRES)
    throw Error(
      `Your position is about ${Math.round(distance)} m away (±${Math.round(fix.accuracy)} m). Move closer to the shop and try again.`,
    );
  return distance;
}
export function getFix(): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation)
      return reject(Error('This browser does not support GPS. Ask your admin for a correction.'));
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracy: p.coords.accuracy,
          captured_at: new Date(p.timestamp).toISOString(),
        }),
      (e) =>
        reject(
          Error(
            e.code === 1
              ? 'Location permission is blocked. Allow location in your browser settings and try again.'
              : e.code === 3
                ? 'GPS timed out. Move near the entrance and try again.'
                : 'Location is unavailable. Turn on precise location and try again.',
          ),
        ),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  });
}
export function istInput(iso: string | null): string {
  return iso
    ? `${dateKey(new Date(iso))}T${timeLabel(iso)}:${String(new Date(iso).getUTCSeconds()).padStart(2, '0')}`
    : '';
}
export function fromIstInput(value: string): string {
  const date = new Date(`${value.length === 16 ? value + ':00' : value}+05:30`);
  if (!Number.isFinite(date.getTime())) throw Error('Enter a valid date and time.');
  return date.toISOString();
}
export function csv(rows: (string | number)[][]): string {
  return (
    '\uFEFF' +
    rows
      .map((row) =>
        row
          .map((v) => {
            let s = String(v);
            if (/^\s*[=+\-@]|^[\t\r]/.test(s)) s = "'" + s;
            return `"${s.replaceAll('"', '""')}"`;
          })
          .join(','),
      )
      .join('\r\n')
  );
}
