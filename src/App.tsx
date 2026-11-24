import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Coffee,
  Download,
  Fingerprint,
  FlaskConical,
  History,
  LayoutDashboard,
  LocateFixed,
  LogIn,
  LogOut,
  MapPin,
  Menu,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import * as api from './api';
import {
  csv,
  dateKey,
  dateLabel,
  duration,
  fromIstInput,
  getFix,
  hoursLabel,
  istInput,
  timeLabel,
  type Audit,
  type Day,
  type Settings,
  type Snapshot,
  type Staff,
  type Punch,
} from './domain';

type Identity = { mode: api.Mode; id: string; adminSessionId?: string };
type Page = 'today' | 'history' | 'team' | 'settings' | 'audit';
type Editor =
  | { type: 'attendance'; day?: Day; staffId?: string }
  | { type: 'staff'; staff?: Staff }
  | { type: 'audit'; audit: Audit };
const nav = [
  { id: 'today', label: 'Overview', icon: LayoutDashboard },
  { id: 'history', label: 'Attendance', icon: CalendarDays },
  { id: 'team', label: 'Staff members', icon: Users, admin: true },
  { id: 'audit', label: 'Change history', icon: History, admin: true },
  { id: 'settings', label: 'Shop settings', icon: Settings2, admin: true },
] as const;

function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark">
        PB
        <span />
      </div>
      <div>
        <strong>Prakash Bhandar</strong>
        <span>STAFF ATTENDANCE</span>
      </div>
    </div>
  );
}
function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
function Status({ day }: { day?: Day }) {
  return (
    <Badge
      tone={!day ? 'neutral' : day.break_started_at ? 'amber' : day.check_out ? 'neutral' : 'green'}
    >
      {!day
        ? 'Not marked'
        : day.break_started_at
          ? 'On break'
          : day.check_out
            ? 'Completed'
            : 'Checked in'}
    </Badge>
  );
}
function PolicyText({
  s,
}: {
  s: Pick<Settings, 'break_mode' | 'fixed_break_minutes' | 'break_after_minutes'>;
}) {
  return (
    <>
      {s.break_mode === 'pending'
        ? 'Automatic lunch deductions are off. An admin must review unpaid lunch before payable hours are confirmed.'
        : s.break_mode === 'fixed'
          ? `${s.fixed_break_minutes} minutes unpaid lunch after ${hoursLabel(s.break_after_minutes * 60)} on site. Longer recorded breaks are deducted instead.`
          : 'Recorded lunch and break time is unpaid. Start a break when leaving and end it when you return.'}
    </>
  );
}
function Dialog({
  title,
  children,
  onClose,
  busy,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="dialog-heading">
        <h2 id="dialog-title">{title}</h2>
        <button className="icon-button" aria-label="Close dialog" disabled={busy} onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Login({ onEnter, onDemo }: { onEnter: (id: string) => void; onDemo: () => void }) {
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (!api.cloud)
        throw Error('Live sign-in needs Supabase configuration. You can explore the demo below.');
      const { data, error } = await api.cloud.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      onEnter(data.user!.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <header>
        <Brand />
        <span className="login-header-note">
          <ShieldCheck size={17} /> Your workday, accounted for
        </span>
      </header>
      <main className="login-layout">
        <section className="login-intro">
          <div className="eyebrow">THE PB TEAM</div>
          <h1>
            A good day
            <br />
            starts here<span>.</span>
          </h1>
          <p>
            One place to mark your attendance,
            <br className="desktop-only" /> keep track of your time, and stay in sync.
          </p>
          <div className="login-features">
            <span>
              <MapPin size={19} /> Check in at the shop
            </span>
            <span>
              <Clock3 size={19} /> Clear, transparent hours
            </span>
            <span>
              <ShieldCheck size={19} /> Corrections with a record
            </span>
          </div>
          <div className="login-illustration" aria-hidden="true">
            <div className="illustration-orbit" />
            <div className="illustration-card">
              <div className="illustration-icon">
                <Check size={24} />
              </div>
              <div>
                <strong>You’re all set.</strong>
                <span>Another day. A shared effort.</span>
              </div>
              <div className="mini-bars">
                {[36, 52, 44, 62, 52, 70, 56].map((h, i) => (
                  <i key={i} style={{ height: h }} />
                ))}
              </div>
            </div>
          </div>
        </section>
        <section className="login-card">
          <div className="login-symbol">
            <Fingerprint size={30} />
          </div>
          <h2>Welcome to PB</h2>
          <p>Sign in to your staff account.</p>
          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}
          <form onSubmit={submit}>
            <label>
              Email address
              <input
                type="email"
                autoComplete="username"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <button className="button primary wide" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
              <LogIn size={18} />
            </button>
          </form>
          <p className="login-help">
            Need an account or a password reset?
            <br />
            Please contact your PB administrator.
          </p>
          <div className="demo-divider">
            <span>Take a look around</span>
          </div>
          <div className="demo-options">
            <button className="button secondary wide" onClick={onDemo}>
              Staff demo
            </button>
          </div>
          <small className="demo-disclaimer">
            Sample data only. Demo actions stay on this device.
          </small>
        </section>
      </main>
      <footer>
        © {new Date().getFullYear()} Prakash Bhandar <span>Made for the people who make PB.</span>
      </footer>
    </div>
  );
}

export default function App() {
  const [identity, setIdentity] = useState<Identity | null>(null),
    [booting, setBooting] = useState(true);
  const [data, setData] = useState<Snapshot | null>(null),
    [page, setPage] = useState<Page>('today');
  const [month, setMonth] = useState(dateKey().slice(0, 7)),
    [staffFilter, setStaffFilter] = useState('all');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null),
    [menu, setMenu] = useState(false);
  const [now, setNow] = useState(new Date()),
    [online, setOnline] = useState(navigator.onLine);
  const generation = useRef(0);
  useEffect(() => {
    let cancelled = false;
    async function restore() {
      try {
        const demo = sessionStorage.getItem('pb-attendance-demo-actor');
        if (demo === api.demoStaffId) {
          if (!cancelled) setIdentity({ mode: 'demo', id: api.demoStaffId });
          return;
        }
        if (demo === api.demoAdminId) {
          try {
            const adminSessionId = await api.requireLiveAdmin();
            if (!cancelled) setIdentity({ mode: 'demo', id: api.demoAdminId, adminSessionId });
            return;
          } catch {
            sessionStorage.removeItem('pb-attendance-demo-actor');
          }
        }
        if (api.cloud) {
          const { data, error } = await api.cloud.auth.getSession();
          if (error) throw error;
          if (!cancelled && data.session) setIdentity({ mode: 'live', id: data.session.user.id });
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setBooting(false);
      }
    }
    restore();
    const timer = setInterval(() => setNow(new Date()), 1000);
    const onOnline = () => setOnline(navigator.onLine);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOnline);
    const subscription = api.cloud?.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        if (sessionStorage.getItem('pb-attendance-demo-actor') === api.demoAdminId)
          sessionStorage.removeItem('pb-attendance-demo-actor');
        generation.current++;
        setIdentity((current) =>
          current?.mode === 'live' || current?.adminSessionId ? null : current,
        );
      }
    });
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOnline);
      subscription?.data.subscription.unsubscribe();
    };
  }, []);
  async function refresh() {
    if (!identity) return;
    const request = ++generation.current;
    try {
      const result = await api.load(identity.mode, identity.id, month);
      if (generation.current === request) setData(result);
    } catch (e) {
      if (
        generation.current === request &&
        identity.mode === 'demo' &&
        identity.id === api.demoAdminId
      ) {
        sessionStorage.removeItem('pb-attendance-demo-actor');
        setData(null);
        setEditor(null);
        setIdentity(null);
      }
      throw e;
    }
  }
  useEffect(() => {
    setData(null);
    setError('');
    refresh().catch((e) => setError(e.message));
    return () => {
      generation.current++;
    };
  }, [identity, month]);
  useEffect(() => {
    if (identity?.mode !== 'live' && !identity?.adminSessionId) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine)
        refresh().catch((e) => setError(e.message));
    }, 60000);
    return () => clearInterval(timer);
  }, [identity, month]);
  async function act(work: () => Promise<unknown>, success: string): Promise<boolean> {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
      setNotice(success);
      try {
        await refresh();
      } catch (e) {
        setError(`Saved successfully, but refreshing failed: ${(e as Error).message}`);
      }
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function enter(id: string, mode: api.Mode, adminSessionId?: string) {
    generation.current++;
    setData(null);
    setPage('today');
    setMonth(dateKey().slice(0, 7));
    setStaffFilter('all');
    setError('');
    setNotice('');
    setIdentity({ id, mode, adminSessionId });
  }
  async function openAdminDemo() {
    if (identity?.mode !== 'live') return;
    setBusy(true);
    setError('');
    try {
      const adminSessionId = await api.requireLiveAdmin();
      sessionStorage.setItem('pb-attendance-demo-actor', api.demoAdminId);
      setMenu(false);
      enter(api.demoAdminId, 'demo', adminSessionId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function leaveAdminDemo() {
    if (!identity?.adminSessionId) return;
    sessionStorage.removeItem('pb-attendance-demo-actor');
    setMenu(false);
    setEditor(null);
    enter(identity.adminSessionId, 'live');
  }
  async function signOut() {
    setBusy(true);
    try {
      if (identity?.mode === 'live' || identity?.adminSessionId) {
        const result = await api.cloud!.auth.signOut();
        if (result.error) throw result.error;
      }
      sessionStorage.removeItem('pb-attendance-demo-actor');
      generation.current++;
      setIdentity(null);
      setData(null);
      setEditor(null);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (booting)
    return (
      <div className="loading">
        <Brand />
        <p>Opening your attendance portal…</p>
      </div>
    );
  if (!identity)
    return (
      <Login
        onEnter={(id) => enter(id, 'live')}
        onDemo={() => {
          const id = api.demoStaffId;
          sessionStorage.setItem('pb-attendance-demo-actor', id);
          enter(id, 'demo');
        }}
      />
    );
  const me = data?.staff.find((p) => p.id === identity.id),
    isAdmin = me?.role === 'admin';
  const own = data?.days.filter((d) => d.staff_id === identity.id) ?? [];
  const active = own.find((d) => !d.check_out),
    today = active ?? own.find((d) => d.work_date === dateKey(now));
  const monthly = own.filter((d) => d.work_date.startsWith(month));
  const confirmed = monthly.filter((d) => duration(d, now).reviewed && d.check_out);
  const pending = monthly.filter((d) => !duration(d, now).reviewed).length;
  const total = confirmed.reduce((sum, d) => sum + duration(d, now).worked, 0);
  const shownDays = (data?.days ?? [])
    .filter(
      (d) =>
        d.work_date.startsWith(month) &&
        (isAdmin
          ? staffFilter === 'all' || d.staff_id === staffFilter
          : d.staff_id === identity.id),
    )
    .sort((a, b) => b.work_date.localeCompare(a.work_date) || a.check_in.localeCompare(b.check_in));
  async function mark(action: Punch) {
    await act(
      async () => {
        if (identity!.mode === 'demo') return api.punch('demo', identity!.id, action);
        if (!navigator.onLine) throw Error('Connect to the internet to mark attendance.');
        const fix = await getFix();
        return api.punch('live', identity!.id, action, fix);
      },
      action === 'check_in'
        ? 'Check-in recorded. Have a good day!'
        : action === 'check_out'
          ? 'Check-out recorded. See you next time.'
          : action === 'break_start'
            ? 'Break started. This time will be recorded as unpaid.'
            : 'Welcome back. Your break has ended.',
    );
  }
  function exportCsv() {
    const rows: (string | number)[][] = [
      [
        'Staff code',
        'Staff name',
        'Date (IST)',
        'Check-in (IST)',
        'Check-out (IST)',
        'On-site seconds',
        'Unpaid break seconds',
        'Confirmed worked seconds',
        'Review status',
        'Source',
      ],
    ];
    for (const d of shownDays) {
      const p = data!.staff.find((p) => p.id === d.staff_id),
        h = duration(d, now);
      rows.push([
        p?.staff_code ?? '',
        p?.full_name ?? '',
        d.work_date,
        istInput(d.check_in),
        istInput(d.check_out),
        Math.floor(h.gross),
        h.reviewed ? Math.floor(h.unpaid) : '',
        h.reviewed && d.check_out ? Math.floor(h.worked) : '',
        !h.reviewed ? 'Needs lunch review' : !d.check_out ? 'Open shift' : 'Confirmed',
        d.source,
      ]);
    }
    const url = URL.createObjectURL(new Blob([csv(rows)], { type: 'text/csv;charset=utf-8' })),
      a = document.createElement('a');
    a.href = url;
    a.download = `PB-attendance-${month}${identity!.mode === 'demo' ? '-DEMO' : ''}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function go(id: Page) {
    setPage(id);
    setMenu(false);
    setError('');
    setNotice('');
  }
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? 'open' : ''}`}>
        <Brand />
        <div className="sidebar-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {nav
            .filter((n) => !('admin' in n) || isAdmin)
            .map((n) => (
              <button
                key={n.id}
                className={page === n.id ? 'selected' : ''}
                aria-current={page === n.id ? 'page' : undefined}
                onClick={() => go(n.id)}
              >
                <n.icon size={20} />
                {n.label}
                {page === n.id && <span className="nav-dot" />}
              </button>
            ))}
          {isAdmin && identity.mode === 'live' && (
            <button disabled={busy} onClick={openAdminDemo}>
              <FlaskConical size={20} />
              Admin demo
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-location">
            <MapPin size={18} />
            <div>
              <strong>PB shop</strong>
              <span>25 m attendance area</span>
            </div>
          </div>
          <div className="account">
            <div className="avatar">
              {me?.full_name
                .split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('') ?? 'PB'}
            </div>
            <div>
              <strong>{me?.full_name ?? 'Your account'}</strong>
              <span>
                {isAdmin ? 'Administrator' : 'Staff member'} · {me?.staff_code}
              </span>
            </div>
            <button
              className="icon-button"
              aria-label="Sign out"
              title="Sign out"
              disabled={busy}
              onClick={signOut}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
      {menu && (
        <button className="menu-backdrop" aria-label="Close menu" onClick={() => setMenu(false)} />
      )}
      <div className="main-wrap">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Open menu"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            <Menu size={23} />
          </button>
          <span className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <strong>{nav.find((n) => n.id === page)?.label}</strong>
          </span>
          <div className="topbar-right">
            <span className="timezone">India Standard Time</span>
            <span className="clock">{timeLabel(now.toISOString())}</span>
            <span className="mini-avatar">{me?.full_name[0] ?? 'P'}</span>
          </div>
        </header>
        <main className="main-content">
          {identity.mode === 'demo' && (
            <div className="demo-banner">
              <span>
                <span className="demo-tag">DEMO</span> You’re exploring the{' '}
                {isAdmin ? 'admin' : 'staff'} workspace. All data and GPS actions are simulated.
              </span>
              {identity.adminSessionId && (
                <button disabled={busy} onClick={leaveAdminDemo}>
                  Return to admin
                </button>
              )}
            </div>
          )}
          {!online && (
            <div className="notice error" role="status">
              You’re offline. Attendance needs a fresh GPS reading and a server connection.
            </div>
          )}
          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="notice success" role="status">
              <Check size={18} />
              {notice}
              <button aria-label="Dismiss notification" onClick={() => setNotice('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {!data ? (
            <section className="card empty">
              <RefreshCw size={25} />
              <h2>{error ? 'Could not open attendance' : 'Getting things ready…'}</h2>
              {error && (
                <div className="button-row">
                  <button
                    className="button secondary"
                    onClick={() => act(refresh, 'Attendance refreshed.')}
                  >
                    Try again
                  </button>
                  <button className="button secondary" onClick={signOut}>
                    Sign out
                  </button>
                </div>
              )}
            </section>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {page === 'today'
                      ? 'YOUR WORKDAY'
                      : page === 'history'
                        ? 'THE ATTENDANCE REGISTER'
                        : isAdmin
                          ? 'ADMINISTRATION'
                          : 'WORKSPACE'}
                  </div>
                  <h1>
                    {page === 'today'
                      ? `Hello, ${me?.full_name.split(' ')[0] ?? 'there'}`
                      : page === 'history'
                        ? 'Attendance'
                        : page === 'team'
                          ? 'Your PB team'
                          : page === 'settings'
                            ? 'Shop settings'
                            : 'Every change, recorded'}
                    {page === 'today' && <span className="greeting-dot">.</span>}
                  </h1>
                  <p>
                    {page === 'today'
                      ? dateLabel(dateKey(now), true)
                      : page === 'history'
                        ? 'A clear record of time, breaks, and corrections.'
                        : page === 'team'
                          ? 'Manage staff details and access to the shop.'
                          : page === 'settings'
                            ? 'Set the location and choose how unpaid lunch is recorded.'
                            : 'Attendance corrections and account changes, with the full context.'}
                  </p>
                </div>
                <button
                  className="button secondary refresh-button"
                  disabled={busy}
                  onClick={() => act(refresh, 'Attendance refreshed.')}
                >
                  <RefreshCw size={16} className={busy ? 'spin' : ''} />
                  Refresh
                </button>
              </div>
              {page === 'today' && (
                <>
                  <div className="dashboard-grid">
                    <section className="card attendance-card">
                      <div className="card-heading">
                        <h2>
                          <Fingerprint size={21} />
                          Your attendance
                        </h2>
                        <Status day={today} />
                      </div>
                      <div className="punch-times">
                        <div>
                          <span>CHECK-IN</span>
                          <strong>{timeLabel(today?.check_in ?? null)}</strong>
                          <small>
                            {today && today.work_date !== dateKey(now)
                              ? dateLabel(today.work_date)
                              : 'Start of your day'}
                          </small>
                        </div>
                        <div>
                          <span>CHECK-OUT</span>
                          <strong>{timeLabel(today?.check_out ?? null)}</strong>
                          <small>End of your day</small>
                        </div>
                      </div>
                      <div className="punch-actions">
                        <button
                          className="button primary"
                          disabled={busy || (!online && identity.mode === 'live') || Boolean(today)}
                          onClick={() => mark('check_in')}
                        >
                          <LogIn size={19} />
                          {busy ? 'Please wait…' : 'Check in'}
                        </button>
                        <button
                          className="button secondary"
                          disabled={
                            busy ||
                            (!online && identity.mode === 'live') ||
                            !active ||
                            Boolean(active?.break_started_at)
                          }
                          onClick={() => mark('check_out')}
                        >
                          <LogOut size={19} />
                          Check out
                        </button>
                      </div>
                      {active && (
                        <button
                          className="button break-button wide"
                          disabled={busy || (!online && identity.mode === 'live')}
                          onClick={() =>
                            mark(active.break_started_at ? 'break_end' : 'break_start')
                          }
                        >
                          <Coffee size={18} />
                          {active.break_started_at ? 'End break · I’m back' : 'Start unpaid break'}
                        </button>
                      )}
                      <div className="gps-note">
                        <div className="gps-icon">
                          <LocateFixed size={18} />
                        </div>
                        <p>
                          Be within <strong>25 metres</strong> of the PB shop.
                          <br />
                          <span>Precise location is checked each time you tap.</span>
                        </p>
                        <ShieldCheck size={18} />
                      </div>
                    </section>
                    <section className="card day-card">
                      <div className="card-heading">
                        <h2>Time at a glance</h2>
                        <Clock3 size={19} />
                      </div>
                      <div className="hours-value">
                        {today ? hoursLabel(duration(today, now).gross) : '0h 00m'}
                      </div>
                      <p className="hours-caption">
                        {today?.check_out
                          ? 'Total time on site'
                          : 'Time on site · running estimate'}
                      </p>
                      <div className="time-summary">
                        <div>
                          <span>Unpaid break</span>
                          <strong>
                            {today && duration(today, now).reviewed
                              ? hoursLabel(duration(today, now).unpaid)
                              : 'Awaiting review'}
                          </strong>
                        </div>
                        <div>
                          <span>Payable work time</span>
                          <strong className="indigo">
                            {today && duration(today, now).reviewed
                              ? hoursLabel(duration(today, now).worked)
                              : 'Needs lunch review'}
                          </strong>
                        </div>
                      </div>
                      <div className="policy-note">
                        <Coffee size={18} />
                        <p>
                          <strong>Lunch policy</strong>
                          <PolicyText s={today ?? data.settings} />
                        </p>
                      </div>
                    </section>
                  </div>
                  <div className="section-heading">
                    <h2>Your month</h2>
                    <Month value={month} onChange={setMonth} />
                  </div>
                  <div className="stats-grid">
                    <Stat
                      icon={<CalendarDays size={20} />}
                      label="Days attended"
                      value={String(monthly.length)}
                      foot="Attendance marked this month"
                    />
                    <Stat
                      icon={<Clock3 size={20} />}
                      label="Confirmed hours"
                      value={hoursLabel(total)}
                      foot="Completed shifts with lunch reviewed"
                    />
                    <Stat
                      icon={<Coffee size={20} />}
                      label="Lunch reviews"
                      value={String(pending)}
                      foot={
                        pending
                          ? 'Waiting for an admin review'
                          : 'Your lunch records are up to date'
                      }
                    />
                  </div>
                  {isAdmin && (
                    <section className="card team-today">
                      <div className="card-heading">
                        <h2>
                          <Users size={20} />
                          Team today
                        </h2>
                        <button className="text-button" onClick={() => go('team')}>
                          Manage staff <ChevronRight size={16} />
                        </button>
                      </div>
                      <div className="team-status-list">
                        {data.staff
                          .filter((p) => p.active)
                          .map((p) => {
                            const d = data.days.find(
                              (d) =>
                                d.staff_id === p.id &&
                                (!d.check_out || d.work_date === dateKey(now)),
                            );
                            return (
                              <div key={p.id}>
                                <div className="avatar small">{p.full_name[0]}</div>
                                <div className="team-person">
                                  <strong>{p.full_name}</strong>
                                  <span>
                                    {p.department} · {p.staff_code}
                                  </span>
                                </div>
                                <Status day={d} />
                                <button
                                  className="icon-button"
                                  aria-label={`Edit attendance for ${p.full_name}`}
                                  onClick={() =>
                                    setEditor({ type: 'attendance', day: d, staffId: p.id })
                                  }
                                >
                                  <Pencil size={16} />
                                </button>
                              </div>
                            );
                          })}
                      </div>
                    </section>
                  )}
                  <section className="card">
                    <div className="card-heading">
                      <h2>Recent attendance</h2>
                      <button className="text-button" onClick={() => go('history')}>
                        View register <ChevronRight size={16} />
                      </button>
                    </div>
                    <AttendanceTable
                      days={monthly
                        .sort((a, b) => b.work_date.localeCompare(a.work_date))
                        .slice(0, 5)}
                      staff={data.staff}
                      admin={false}
                      now={now}
                      onEdit={() => {}}
                    />
                  </section>
                </>
              )}
              {page === 'history' && (
                <section className="card">
                  <div className="register-toolbar">
                    <div className="filter-row">
                      <Month value={month} onChange={setMonth} />
                      {isAdmin && (
                        <label className="inline-label">
                          Staff
                          <select
                            value={staffFilter}
                            onChange={(e) => setStaffFilter(e.target.value)}
                          >
                            <option value="all">All staff</option>
                            {data.staff.map((p) => (
                              <option value={p.id} key={p.id}>
                                {p.full_name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                    <div className="button-row">
                      <button
                        className="button secondary"
                        disabled={!shownDays.length}
                        onClick={exportCsv}
                      >
                        <Download size={16} />
                        Export CSV
                      </button>
                      {isAdmin && (
                        <button
                          className="button primary"
                          onClick={() => setEditor({ type: 'attendance' })}
                        >
                          <Plus size={17} />
                          Add attendance
                        </button>
                      )}
                    </div>
                  </div>
                  <AttendanceTable
                    days={shownDays}
                    staff={data.staff}
                    admin={Boolean(isAdmin)}
                    now={now}
                    onEdit={(d) => setEditor({ type: 'attendance', day: d })}
                  />
                  <p className="table-note">
                    {shownDays.length} records · All times in IST. Open shifts and lunch reviews are
                    excluded from confirmed totals.
                  </p>
                </section>
              )}
              {page === 'team' && isAdmin && (
                <section className="card">
                  <div className="card-heading">
                    <h2>{data.staff.length} staff members</h2>
                    <button className="button primary" onClick={() => setEditor({ type: 'staff' })}>
                      <Plus size={17} />
                      Add staff
                    </button>
                  </div>
                  <div className="staff-grid">
                    {data.staff.map((p) => (
                      <article className="staff-card" key={p.id}>
                        <div className="staff-card-top">
                          <div className="avatar">
                            {p.full_name
                              .split(' ')
                              .map((n) => n[0])
                              .slice(0, 2)
                              .join('')}
                          </div>
                          <Badge tone={p.active ? 'green' : 'neutral'}>
                            {p.active ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                        <h3>{p.full_name}</h3>
                        <p>
                          {p.staff_code} · {p.department}
                        </p>
                        <div className="staff-details">
                          <span>{p.phone || 'No phone added'}</span>
                          <span>{p.role === 'admin' ? 'Administrator' : 'Staff member'}</span>
                        </div>
                        <div className="button-row">
                          <button
                            className="button secondary"
                            onClick={() => setEditor({ type: 'staff', staff: p })}
                          >
                            <Pencil size={15} />
                            Edit details
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`Add attendance for ${p.full_name}`}
                            onClick={() => setEditor({ type: 'attendance', staffId: p.id })}
                          >
                            <CalendarDays size={19} />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )}
              {page === 'settings' && isAdmin && (
                <SettingsForm
                  key={data.settings.version}
                  settings={data.settings}
                  busy={busy}
                  onSave={async (s, reason) => {
                    await act(
                      () => api.saveSettings(identity.mode, identity.id, s, reason),
                      'Shop settings saved. New shifts will use this policy.',
                    );
                  }}
                />
              )}
              {page === 'audit' && isAdmin && (
                <section className="card">
                  <div className="card-heading">
                    <h2>
                      <ShieldCheck size={20} />
                      Change history
                    </h2>
                    <span className="muted">Latest 100 changes</span>
                  </div>
                  {!data.audits.length ? (
                    <Empty text="Changes will appear here when attendance or staff details are updated." />
                  ) : (
                    <div className="audit-list">
                      {data.audits.map((a) => (
                        <button key={a.id} onClick={() => setEditor({ type: 'audit', audit: a })}>
                          <div className="audit-icon">
                            {a.entity === 'attendance' ? (
                              <Clock3 size={19} />
                            ) : a.entity === 'staff' ? (
                              <Users size={19} />
                            ) : (
                              <Settings2 size={19} />
                            )}
                          </div>
                          <div>
                            <strong>
                              {a.entity === 'attendance'
                                ? 'Attendance'
                                : a.entity === 'staff'
                                  ? 'Staff profile'
                                  : 'Shop settings'}
                            </strong>
                            <p>{a.reason.replaceAll('_', ' ')}</p>
                            <small>
                              {data.staff.find((p) => p.id === a.actor_id)?.full_name ?? a.actor_id}{' '}
                              · {dateLabel(dateKey(new Date(a.created_at)))} at{' '}
                              {timeLabel(a.created_at)}
                            </small>
                          </div>
                          <ChevronRight size={18} />
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              )}
              <footer className="app-footer">
                <span>Prakash Bhandar · Staff attendance</span>
                <span>
                  <ShieldCheck size={14} />{' '}
                  {identity.mode === 'demo' ? 'Local demonstration' : 'Server verified records'}
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
      {editor && data && (
        <Dialog
          title={
            editor.type === 'attendance'
              ? 'Correct attendance'
              : editor.type === 'staff'
                ? editor.staff
                  ? 'Edit staff details'
                  : 'Add staff member'
                : 'Change details'
          }
          onClose={() => {
            setEditor(null);
            setError('');
          }}
          busy={busy}
        >
          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}
          {editor.type === 'attendance' ? (
            <AttendanceForm
              staff={data.staff}
              days={data.days}
              selected={editor.day}
              staffId={editor.staffId}
              busy={busy}
              onSave={async (c) => {
                if (
                  await act(
                    () => api.correct(identity.mode, identity.id, c),
                    'Attendance saved with an audit record.',
                  )
                )
                  setEditor(null);
              }}
            />
          ) : editor.type === 'staff' ? (
            <StaffForm
              staff={editor.staff}
              busy={busy}
              onSave={async (s, reason) => {
                if (
                  await act(
                    () => api.saveStaff(identity.mode, identity.id, s, reason),
                    'Staff details saved.',
                  )
                )
                  setEditor(null);
              }}
            />
          ) : (
            <AuditDetail audit={editor.audit} />
          )}
        </Dialog>
      )}
    </div>
  );
}

function Month({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="inline-label">
      Month
      <input
        type="month"
        value={value}
        max={dateKey().slice(0, 7)}
        required
        onChange={(e) => {
          if (/^\d{4}-\d{2}$/.test(e.target.value)) onChange(e.target.value);
        }}
      />
    </label>
  );
}
function Stat({
  icon,
  label,
  value,
  foot,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  foot: string;
}) {
  return (
    <section className="stat-card">
      <div>
        <span>{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      <p>{foot}</p>
    </section>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <CalendarDays size={28} />
      <p>{text}</p>
    </div>
  );
}
function AttendanceTable({
  days,
  staff,
  admin,
  now,
  onEdit,
}: {
  days: Day[];
  staff: Staff[];
  admin: boolean;
  now: Date;
  onEdit: (d: Day) => void;
}) {
  if (!days.length) return <Empty text="No attendance recorded for this month yet." />;
  return (
    <div className="table-scroll">
      <table className="attendance-table">
        <thead>
          <tr>
            <th>Date</th>
            {admin && <th>Staff member</th>}
            <th>Check-in</th>
            <th>Check-out</th>
            <th>Unpaid break</th>
            <th>Work time</th>
            <th>Status</th>
            {admin && (
              <th>
                <span className="sr-only">Edit</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {days.map((d) => {
            const h = duration(d, now);
            return (
              <tr key={d.id}>
                <td className="date-cell" data-label="Date">
                  <strong>{dateLabel(d.work_date)}</strong>
                  {d.source === 'admin' && <small className="edited-label">Admin corrected</small>}
                </td>
                {admin && (
                  <td className="person-cell" data-label="Staff member">
                    {staff.find((p) => p.id === d.staff_id)?.full_name ?? 'Staff'}
                  </td>
                )}
                <td data-label="Check-in">{timeLabel(d.check_in)}</td>
                <td data-label="Check-out">{timeLabel(d.check_out)}</td>
                <td className="unpaid-cell" data-label="Unpaid break">
                  {h.reviewed ? hoursLabel(h.unpaid) : 'To review'}
                </td>
                <td className="work-time" data-label="Work time">
                  {h.reviewed ? (
                    hoursLabel(h.worked)
                  ) : (
                    <span className="review-label">Needs lunch review</span>
                  )}
                </td>
                <td className="status-cell" data-label="Status">
                  <Status day={d} />
                </td>
                {admin && (
                  <td className="edit-cell">
                    <button
                      className="icon-button"
                      aria-label={`Correct ${staff.find((p) => p.id === d.staff_id)?.full_name} on ${d.work_date}`}
                      onClick={() => onEdit(d)}
                    >
                      <Pencil size={16} />
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
function AttendanceForm({
  staff,
  days,
  selected,
  staffId,
  busy,
  onSave,
}: {
  staff: Staff[];
  days: Day[];
  selected?: Day;
  staffId?: string;
  busy: boolean;
  onSave: (c: import('./domain').Correction) => Promise<void>;
}) {
  const [person, setPerson] = useState(selected?.staff_id ?? staffId ?? staff[0]?.id ?? ''),
    [date, setDate] = useState(selected?.work_date ?? dateKey());
  const record = days.find((d) => d.staff_id === person && d.work_date === date);
  const [checkIn, setCheckIn] = useState(istInput(selected?.check_in ?? null)),
    [checkOut, setCheckOut] = useState(istInput(selected?.check_out ?? null));
  const [unpaid, setUnpaid] = useState(
      selected && duration(selected).reviewed
        ? String(Math.floor(duration(selected).unpaid / 60))
        : '',
    ),
    [reason, setReason] = useState(''),
    [localError, setLocalError] = useState('');
  const [expectedVersion, setExpectedVersion] = useState(record?.version ?? 0);
  useEffect(() => {
    setCheckIn(istInput(record?.check_in ?? null));
    setCheckOut(istInput(record?.check_out ?? null));
    setUnpaid(
      record && duration(record).reviewed ? String(Math.floor(duration(record).unpaid / 60)) : '',
    );
    setExpectedVersion(record?.version ?? 0);
  }, [person, date]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setLocalError('');
    try {
      await onSave({
        staff_id: person,
        work_date: date,
        check_in: fromIstInput(checkIn),
        check_out: checkOut ? fromIstInput(checkOut) : null,
        break_override_minutes: Number(unpaid),
        expected_version: expectedVersion,
        reason,
      });
    } catch (e) {
      setLocalError((e as Error).message);
    }
  }
  return (
    <form className="editor-form" onSubmit={submit}>
      <p className="form-intro">
        Add a missed check-in or correct the actual arrival, departure and unpaid lunch. Every edit
        keeps the original record in change history.
      </p>
      {localError && <div className="notice error">{localError}</div>}
      <label>
        Staff member
        <select
          value={person}
          onChange={(e) => setPerson(e.target.value)}
          disabled={Boolean(selected)}
        >
          {staff.map((p) => (
            <option value={p.id} key={p.id}>
              {p.full_name} · {p.staff_code}
            </option>
          ))}
        </select>
      </label>
      <label>
        Attendance date
        <input
          type="date"
          value={date}
          max={dateKey()}
          required
          disabled={Boolean(selected)}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      {!selected && !days.some((d) => d.staff_id === person && d.work_date === date) && (
        <p className="field-note">
          To edit an existing record from another month, open that month in the Attendance register
          first.
        </p>
      )}
      <div className="form-grid">
        <label>
          Check-in · IST
          <input
            type="datetime-local"
            step="1"
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
            required
          />
        </label>
        <label>
          Check-out · IST
          <input
            type="datetime-local"
            step="1"
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
          />
        </label>
      </div>
      <p className="field-note">
        Leave check-out empty only if the person is still working. Overnight shifts can end on the
        following date, within 24 hours.
      </p>
      <label>
        Total unpaid break · minutes
        <input
          type="number"
          min="0"
          max="1440"
          step="1"
          value={unpaid}
          placeholder="Enter the reviewed lunch and break total"
          required
          onChange={(e) => setUnpaid(e.target.value)}
        />
      </label>
      <label>
        Reason for this correction
        <textarea
          minLength={5}
          maxLength={1000}
          required
          placeholder="For example: staff arrived at 09:00 but forgot to check in."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <div className="form-note">
        <ShieldCheck size={18} />
        Your name, correction time, reason and previous values will be recorded.
      </div>
      <button className="button primary wide" disabled={busy}>
        {busy ? 'Saving…' : 'Save attendance correction'}
      </button>
    </form>
  );
}
function StaffForm({
  staff,
  busy,
  onSave,
}: {
  staff?: Staff;
  busy: boolean;
  onSave: (s: Staff, reason: string) => Promise<void>;
}) {
  const [s, setS] = useState<Staff>(
      staff ?? {
        id: '',
        staff_code: '',
        full_name: '',
        phone: '',
        department: 'Shop',
        role: 'staff',
        active: true,
        version: 0,
      },
    ),
    [reason, setReason] = useState('');
  const field = (key: keyof Staff, value: unknown) => setS({ ...s, [key]: value });
  return (
    <form
      className="editor-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(s, reason);
      }}
    >
      {!staff && (
        <>
          <div className="notice info">
            First create the staff login in Supabase → Authentication → Users. Paste that user’s ID
            here to grant access. Login email and password resets are managed in Supabase.
          </div>
          <label>
            Supabase Auth user ID
            <input
              required
              pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={s.id}
              onChange={(e) => field('id', e.target.value)}
            />
          </label>
        </>
      )}
      <label>
        Full name
        <input
          value={s.full_name}
          required
          maxLength={100}
          onChange={(e) => field('full_name', e.target.value)}
        />
      </label>
      <div className="form-grid">
        <label>
          Staff code
          <input
            value={s.staff_code}
            required
            maxLength={30}
            onChange={(e) => field('staff_code', e.target.value)}
          />
        </label>
        <label>
          Phone number
          <input
            type="tel"
            maxLength={30}
            value={s.phone}
            onChange={(e) => field('phone', e.target.value)}
          />
        </label>
      </div>
      <label>
        Department
        <input
          maxLength={100}
          value={s.department}
          onChange={(e) => field('department', e.target.value)}
        />
      </label>
      <label>
        Access role
        <select value={s.role} onChange={(e) => field('role', e.target.value)}>
          <option value="staff">Staff member</option>
          <option value="admin">Administrator</option>
        </select>
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          checked={s.active}
          onChange={(e) => field('active', e.target.checked)}
        />
        Active account · can access attendance
      </label>
      <label>
        Reason for change
        <textarea
          minLength={5}
          maxLength={1000}
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why are you adding or changing this account?"
        />
      </label>
      <button className="button primary wide" disabled={busy}>
        {busy ? 'Saving…' : 'Save staff details'}
      </button>
    </form>
  );
}
function SettingsForm({
  settings,
  busy,
  onSave,
}: {
  settings: Settings;
  busy: boolean;
  onSave: (s: Settings, reason: string) => Promise<void>;
}) {
  const [s, setS] = useState(settings),
    [reason, setReason] = useState(''),
    [gpsBusy, setGpsBusy] = useState(false),
    [gpsError, setGpsError] = useState('');
  async function useLocation() {
    setGpsBusy(true);
    setGpsError('');
    try {
      const f = await getFix();
      if (f.accuracy > 25)
        throw Error(
          `Accuracy is ±${Math.round(f.accuracy)} m. Use a more precise position or enter the shop coordinates manually.`,
        );
      setS({ ...s, latitude: f.latitude, longitude: f.longitude });
    } catch (e) {
      setGpsError((e as Error).message);
    } finally {
      setGpsBusy(false);
    }
  }
  return (
    <form
      className="settings-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(s, reason);
      }}
    >
      <section className="card">
        <div className="card-heading">
          <h2>
            <MapPin size={20} />
            Shop location
          </h2>
          <Badge tone="indigo">25 m radius</Badge>
        </div>
        <p className="muted">
          The saved point is the centre of the attendance area. Check it near the shop entrance on a
          real phone before launch.
        </p>
        <label>
          Shop name
          <input
            required
            maxLength={100}
            value={s.shop_name}
            onChange={(e) => setS({ ...s, shop_name: e.target.value })}
          />
        </label>
        <div className="form-grid">
          <label>
            Latitude
            <input
              type="number"
              step="any"
              min="-90"
              max="90"
              required
              value={s.latitude ?? ''}
              onChange={(e) =>
                setS({ ...s, latitude: e.target.value === '' ? null : Number(e.target.value) })
              }
            />
          </label>
          <label>
            Longitude
            <input
              type="number"
              step="any"
              min="-180"
              max="180"
              required
              value={s.longitude ?? ''}
              onChange={(e) =>
                setS({ ...s, longitude: e.target.value === '' ? null : Number(e.target.value) })
              }
            />
          </label>
        </div>
        <button
          type="button"
          className="button secondary"
          disabled={busy || gpsBusy}
          onClick={useLocation}
        >
          <LocateFixed size={17} />
          {gpsBusy ? 'Finding location…' : 'Use my current location'}
        </button>
        {gpsError && <p className="notice error">{gpsError}</p>}
        <p className="field-note">
          A punch is accepted only when distance + reported GPS accuracy is within 25 m. Location is
          requested on a tap; there is no background tracking.
        </p>
      </section>
      <section className="card">
        <div className="card-heading">
          <h2>
            <Coffee size={20} />
            Unpaid lunch
          </h2>
          <Badge tone={s.break_mode === 'pending' ? 'amber' : 'indigo'}>
            {s.break_mode === 'pending' ? 'Not decided' : 'Configured'}
          </Badge>
        </div>
        <label>
          How should lunch be handled?
          <select
            value={s.break_mode}
            onChange={(e) => setS({ ...s, break_mode: e.target.value as Settings['break_mode'] })}
          >
            <option value="pending">Undecided · admin reviews each shift</option>
            <option value="fixed">Automatic agreed deduction + admin exceptions</option>
            <option value="tracked">Record actual break departure and return</option>
          </select>
        </label>
        <div className="notice info">
          <PolicyText s={s} />
        </div>
        {s.break_mode === 'fixed' && (
          <div className="form-grid">
            <label>
              Agreed unpaid lunch · minutes
              <input
                type="number"
                required
                min="0"
                max="240"
                step="1"
                value={s.fixed_break_minutes || ''}
                onChange={(e) => setS({ ...s, fixed_break_minutes: Number(e.target.value) })}
              />
            </label>
            <label>
              Apply after time on site · minutes
              <input
                type="number"
                required
                min="0"
                max="1440"
                step="1"
                value={s.break_after_minutes}
                onChange={(e) => setS({ ...s, break_after_minutes: Number(e.target.value) })}
              />
            </label>
          </div>
        )}
        {s.break_mode === 'tracked' && (
          <p className="field-note">
            Staff use “Start unpaid break” and “End break” at the shop. A supervisor can correct
            missing or inaccurate breaks. This mode still depends on taps being recorded.
          </p>
        )}
        <p className="field-note">
          Changes apply to new shifts. Existing shifts keep their original policy; use an attendance
          correction to review their lunch. No 60-minute deduction is enabled by default.
        </p>
      </section>
      <section className="card">
        <label>
          Reason for these settings
          <textarea
            required
            minLength={5}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="For example: confirmed shop GPS point, lunch policy still under review."
          />
        </label>
        <button className="button primary" disabled={busy || gpsBusy}>
          {busy ? 'Saving…' : 'Save shop settings'}
        </button>
      </section>
    </form>
  );
}
function AuditDetail({ audit }: { audit: Audit }) {
  const labels: Record<string, string> = {
    full_name: 'Full name',
    staff_code: 'Staff code',
    phone: 'Phone',
    department: 'Department',
    role: 'Access role',
    active: 'Active account',
    work_date: 'Attendance date',
    check_in: 'Check-in',
    check_out: 'Check-out',
    break_override_minutes: 'Reviewed unpaid break (minutes)',
    break_started_at: 'Break started',
    breaks: 'Recorded breaks',
    break_mode: 'Lunch policy',
    fixed_break_minutes: 'Agreed lunch (minutes)',
    break_after_minutes: 'Deduct after (minutes on site)',
    source: 'Recorded by',
    shop_name: 'Shop name',
    latitude: 'Shop latitude',
    longitude: 'Shop longitude',
  };
  function display(key: string, value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    if (key === 'break_mode')
      return value === 'pending'
        ? 'Needs admin review'
        : value === 'fixed'
          ? 'Agreed deduction'
          : 'Recorded breaks';
    if (key === 'source') return value === 'admin' ? 'Admin correction' : 'Staff GPS punch';
    if (['check_in', 'check_out', 'break_started_at'].includes(key))
      return `${dateLabel(dateKey(new Date(String(value))))}, ${timeLabel(String(value))} IST`;
    if (key === 'breaks')
      return (
        (value as { start: string; end: string }[])
          .map((b) => `${timeLabel(b.start)} – ${timeLabel(b.end)}`)
          .join(', ') || 'No recorded intervals'
      );
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
  }
  const fields = Object.keys(labels).filter(
    (key) =>
      key in audit.after_data &&
      JSON.stringify(audit.before_data?.[key]) !== JSON.stringify(audit.after_data[key]),
  );
  const gps = audit.after_data.gps as { accuracy: number; distance: number } | undefined;
  return (
    <div className="audit-detail">
      <p>
        <strong>Reason</strong>
        <br />
        {audit.reason.replaceAll('_', ' ')}
      </p>
      <p className="muted">
        {new Date(audit.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
      </p>
      {!audit.before_data && <div className="notice info">This action created a new record.</div>}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Detail</th>
              <th>Before</th>
              <th>After</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((key) => (
              <tr key={key}>
                <td>{labels[key]}</td>
                <td>{display(key, audit.before_data?.[key])}</td>
                <td>{display(key, audit.after_data[key])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {gps && (
        <p className="field-note">
          GPS evidence: {Math.round(gps.distance)} m from shop centre, with reported accuracy ±
          {Math.round(gps.accuracy)} m.
        </p>
      )}
    </div>
  );
}
