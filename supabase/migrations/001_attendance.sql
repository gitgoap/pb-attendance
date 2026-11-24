-- Standalone PB Attendance schema. Run once in a dedicated Supabase project.
begin;

create table public.pb_staff (
  id uuid primary key references auth.users(id),
  staff_code text not null unique check (length(trim(staff_code)) between 1 and 30),
  full_name text not null check (length(trim(full_name)) between 1 and 100),
  phone text not null default '' check (length(phone) <= 30),
  department text not null default 'Shop' check (length(department) <= 100),
  role text not null default 'staff' check (role in ('admin','staff')),
  active boolean not null default true,
  version integer not null default 1
);
create table public.pb_settings (
  id integer primary key default 1 check (id = 1),
  shop_name text not null default 'Prakash Bhandar' check (length(trim(shop_name)) between 1 and 100),
  latitude double precision default 23.38102667646155 check (latitude between -90 and 90),
  longitude double precision default 85.30280104820979 check (longitude between -180 and 180),
  break_mode text not null default 'pending' check (break_mode in ('pending','fixed','tracked')),
  fixed_break_minutes integer not null default 0 check (fixed_break_minutes between 0 and 240),
  break_after_minutes integer not null default 360 check (break_after_minutes between 0 and 1440),
  version integer not null default 1,
  check ((latitude is null) = (longitude is null))
);
insert into public.pb_settings(id) values(1);
create table public.pb_attendance (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.pb_staff(id),
  work_date date not null,
  check_in timestamptz not null,
  check_out timestamptz,
  breaks jsonb not null default '[]' check (jsonb_typeof(breaks) = 'array'),
  break_started_at timestamptz,
  break_override_minutes integer check (break_override_minutes between 0 and 1440),
  break_mode text not null check (break_mode in ('pending','fixed','tracked')),
  fixed_break_minutes integer not null,
  break_after_minutes integer not null,
  source text not null default 'gps' check (source in ('gps','admin')),
  version integer not null default 1,
  unique(staff_id,work_date),
  check (check_out is null or (check_out >= check_in and check_out <= check_in + interval '24 hours')),
  check (work_date = (check_in at time zone 'Asia/Kolkata')::date),
  check (check_out is null or break_started_at is null)
);
create unique index pb_one_open_shift on public.pb_attendance(staff_id) where check_out is null;
create index pb_attendance_date on public.pb_attendance(work_date);
create table public.pb_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.pb_staff(id),
  entity text not null,
  entity_id text not null,
  reason text not null,
  before_data jsonb,
  after_data jsonb not null,
  created_at timestamptz not null default now()
);
create index pb_audit_created on public.pb_audit(created_at desc);

create function public.pb_is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.pb_staff where id = auth.uid() and role = 'admin' and active)
$$;
create function public.pb_is_active() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.pb_staff where id = auth.uid() and active)
$$;
alter table public.pb_staff enable row level security;
alter table public.pb_settings enable row level security;
alter table public.pb_attendance enable row level security;
alter table public.pb_audit enable row level security;
create policy pb_staff_read on public.pb_staff for select to authenticated using ((id = auth.uid() and active) or public.pb_is_admin());
create policy pb_settings_read on public.pb_settings for select to authenticated using (public.pb_is_active());
create policy pb_attendance_read on public.pb_attendance for select to authenticated using (public.pb_is_active() and (staff_id = auth.uid() or public.pb_is_admin()));
create policy pb_audit_read on public.pb_audit for select to authenticated using (public.pb_is_admin());
revoke all on public.pb_staff, public.pb_settings, public.pb_attendance, public.pb_audit from anon, authenticated;
grant select on public.pb_staff, public.pb_settings, public.pb_attendance, public.pb_audit to authenticated;

create function public.pb_work_seconds(d public.pb_attendance, as_of timestamptz) returns double precision language plpgsql immutable set search_path = '' as $$
declare gross double precision; tracked double precision; unpaid double precision; ending timestamptz;
begin
  if d.break_mode = 'pending' and d.break_override_minutes is null then return null; end if;
  ending := coalesce(d.check_out, as_of);
  gross := greatest(0, extract(epoch from ending - d.check_in));
  select coalesce(sum(extract(epoch from (b->>'end')::timestamptz - (b->>'start')::timestamptz)),0) into tracked from jsonb_array_elements(d.breaks) b;
  if d.break_started_at is not null then tracked := tracked + greatest(0, extract(epoch from ending - d.break_started_at)); end if;
  unpaid := case when d.break_override_minutes is not null then d.break_override_minutes * 60 + tracked
    else greatest(tracked, case when d.break_mode = 'fixed' and gross >= d.break_after_minutes * 60 then d.fixed_break_minutes * 60 else 0 end) end;
  return greatest(0, gross - unpaid);
end $$;
create view public.pb_attendance_summary with (security_invoker = true) as
  select d.*, public.pb_work_seconds(d, now()) as worked_seconds from public.pb_attendance d;
revoke all on public.pb_attendance_summary from anon,authenticated;
grant select on public.pb_attendance_summary to authenticated;

create function public.pb_punch(p_action text, p_lat double precision, p_lng double precision, p_accuracy double precision, p_captured_at timestamptz)
returns public.pb_attendance language plpgsql security definer set search_path = '' as $$
declare s public.pb_settings; d public.pb_attendance; previous jsonb; distance double precision; t timestamptz := clock_timestamp(); uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in to mark attendance.'; end if;
  perform 1 from public.pb_staff where id = uid and active for update;
  if not found then raise exception 'Your staff account is inactive or has not been provisioned.'; end if;
  select * into s from public.pb_settings where id = 1;
  if s.latitude is null then raise exception 'The shop location has not been set. Please ask an admin.'; end if;
  if p_action is null or p_action not in ('check_in','check_out','break_start','break_end') then raise exception 'Invalid attendance action.'; end if;
  if p_lat is null or p_lng is null or p_accuracy is null or not (p_lat between -90 and 90 and p_lng between -180 and 180 and p_accuracy between 0 and 25) then raise exception 'GPS accuracy must be within 25 m. Move near the entrance and try again.'; end if;
  if p_captured_at is null or not (p_captured_at between t - interval '60 seconds' and t + interval '5 seconds') then raise exception 'GPS reading expired. Please try again.'; end if;
  distance := 6371000 * 2 * asin(sqrt(least(1.0, power(sin(radians(p_lat-s.latitude)/2),2) + cos(radians(s.latitude))*cos(radians(p_lat))*power(sin(radians(p_lng-s.longitude)/2),2))));
  if distance + p_accuracy > 25 then raise exception 'Move closer to the shop. Your GPS position and accuracy must fit within the 25 m attendance area.'; end if;
  select * into d from public.pb_attendance where staff_id = uid and check_out is null for update;
  previous := case when d.id is not null then to_jsonb(d) else null end;
  if p_action = 'check_in' then
    if d.id is not null then raise exception 'You are already checked in. Refresh attendance.'; end if;
    if exists(select 1 from public.pb_attendance where staff_id=uid and work_date=(t at time zone 'Asia/Kolkata')::date) then raise exception 'Attendance for today is already completed. Ask an admin for a correction.'; end if;
    insert into public.pb_attendance(staff_id,work_date,check_in,break_mode,fixed_break_minutes,break_after_minutes)
    values(uid,(t at time zone 'Asia/Kolkata')::date,t,s.break_mode,s.fixed_break_minutes,s.break_after_minutes) returning * into d;
  else
    if d.id is null then raise exception 'Check in before marking this action.'; end if;
    if t > d.check_in + interval '24 hours' then raise exception 'This shift needs an admin correction before you can continue.'; end if;
    if p_action = 'break_start' then
      if d.break_started_at is not null then raise exception 'Your break is already running.'; end if;
      update public.pb_attendance set break_started_at=t, version=version+1 where id=d.id returning * into d;
    elsif p_action = 'break_end' then
      if d.break_started_at is null then raise exception 'There is no running break.'; end if;
      update public.pb_attendance set breaks=breaks || jsonb_build_array(jsonb_build_object('start',break_started_at,'end',t)),break_started_at=null,version=version+1 where id=d.id returning * into d;
    else
      if d.break_started_at is not null then raise exception 'End your break before checking out.'; end if;
      update public.pb_attendance set check_out=t,version=version+1 where id=d.id returning * into d;
    end if;
  end if;
  insert into public.pb_audit(actor_id,entity,entity_id,reason,before_data,after_data)
  values(uid,'attendance',d.id::text,p_action,previous,to_jsonb(d) || jsonb_build_object('gps',jsonb_build_object('latitude',p_lat,'longitude',p_lng,'accuracy',p_accuracy,'distance',distance,'captured_at',p_captured_at)));
  return d;
end $$;

create function public.pb_correct_attendance(p_staff_id uuid, p_work_date date, p_check_in timestamptz, p_check_out timestamptz, p_break_minutes integer, p_expected_version integer, p_reason text)
returns public.pb_attendance language plpgsql security definer set search_path = '' as $$
declare d public.pb_attendance; previous jsonb; s public.pb_settings; t timestamptz := clock_timestamp();
begin
  if not public.pb_is_admin() then raise exception 'Admin access required.'; end if;
  if p_reason is null or length(trim(p_reason)) < 5 then raise exception 'Give a correction reason of at least 5 characters.'; end if;
  perform 1 from public.pb_staff where id=p_staff_id for update;
  if not found then raise exception 'Staff member not found.'; end if;
  if p_check_in is null or p_work_date is null or not isfinite(p_check_in) or p_check_in > t or (p_check_in at time zone 'Asia/Kolkata')::date <> p_work_date then raise exception 'Check-in must match the attendance date and cannot be in the future.'; end if;
  if p_check_out is not null and (not isfinite(p_check_out) or p_check_out < p_check_in or p_check_out > t or p_check_out > p_check_in + interval '24 hours') then raise exception 'Check-out must follow check-in, be within 24 hours, and cannot be in the future.'; end if;
  if p_break_minutes is not null and (p_break_minutes < 0 or p_break_minutes > 1440 or (p_check_out is not null and p_break_minutes*60 > extract(epoch from p_check_out-p_check_in))) then raise exception 'Unpaid break cannot exceed the completed shift.'; end if;
  select * into d from public.pb_attendance where staff_id=p_staff_id and work_date=p_work_date for update;
  if p_expected_version is null or coalesce(d.version,0) <> p_expected_version then raise exception 'This record changed. Refresh and try again.'; end if;
  previous := case when d.id is not null then to_jsonb(d) else null end;
  if d.id is null then
    select * into s from public.pb_settings where id=1;
    insert into public.pb_attendance(staff_id,work_date,check_in,check_out,break_override_minutes,break_mode,fixed_break_minutes,break_after_minutes,source)
    values(p_staff_id,p_work_date,p_check_in,p_check_out,p_break_minutes,s.break_mode,s.fixed_break_minutes,s.break_after_minutes,'admin') returning * into d;
  else
    -- A manual correction replaces the shift's break intervals with a reviewed total.
    if p_break_minutes is null then raise exception 'Enter the reviewed total unpaid break when correcting an existing shift.'; end if;
    update public.pb_attendance set check_in=p_check_in,check_out=p_check_out,break_override_minutes=p_break_minutes,break_started_at=null,breaks='[]',source='admin',version=version+1 where id=d.id returning * into d;
  end if;
  insert into public.pb_audit(actor_id,entity,entity_id,reason,before_data,after_data) values(auth.uid(),'attendance',d.id::text,trim(p_reason),previous,to_jsonb(d));
  return d;
end $$;

create function public.pb_save_staff(p_id uuid,p_staff_code text,p_full_name text,p_phone text,p_department text,p_role text,p_active boolean,p_expected_version integer,p_reason text)
returns public.pb_staff language plpgsql security definer set search_path = '' as $$
declare d public.pb_staff; previous jsonb;
begin
  if not public.pb_is_admin() then raise exception 'Admin access required.'; end if;
  -- Serialize administrative changes, including protections for the last admin.
  perform 1 from public.pb_settings where id=1 for update;
  if p_reason is null or length(trim(p_reason)) < 5 then raise exception 'Give a change reason of at least 5 characters.'; end if;
  select * into d from public.pb_staff where id=p_id for update;
  if p_expected_version is null or coalesce(d.version,0) <> p_expected_version then raise exception 'This staff profile changed. Refresh and try again.'; end if;
  if p_id=auth.uid() and (p_role <> 'admin' or not p_active) then raise exception 'You cannot deactivate or demote your own admin account.'; end if;
  previous := case when d.id is not null then to_jsonb(d) else null end;
  insert into public.pb_staff(id,staff_code,full_name,phone,department,role,active)
  values(p_id,trim(p_staff_code),trim(p_full_name),trim(p_phone),trim(p_department),p_role,p_active)
  on conflict(id) do update set staff_code=excluded.staff_code,full_name=excluded.full_name,phone=excluded.phone,department=excluded.department,role=excluded.role,active=excluded.active,version=pb_staff.version+1 returning * into d;
  insert into public.pb_audit(actor_id,entity,entity_id,reason,before_data,after_data) values(auth.uid(),'staff',d.id::text,trim(p_reason),previous,to_jsonb(d));
  return d;
end $$;

create function public.pb_save_settings(p_shop_name text,p_lat double precision,p_lng double precision,p_break_mode text,p_fixed_break_minutes integer,p_break_after_minutes integer,p_expected_version integer,p_reason text)
returns public.pb_settings language plpgsql security definer set search_path = '' as $$
declare d public.pb_settings; previous jsonb;
begin
  if not public.pb_is_admin() then raise exception 'Admin access required.'; end if;
  if p_reason is null or length(trim(p_reason)) < 5 then raise exception 'Give a change reason of at least 5 characters.'; end if;
  if p_break_mode = 'fixed' and p_fixed_break_minutes <= 0 then raise exception 'Enter the agreed unpaid lunch duration before enabling automatic deductions.'; end if;
  select * into d from public.pb_settings where id=1 for update;
  if p_expected_version is null or d.version <> p_expected_version then raise exception 'Settings changed. Refresh and try again.'; end if;
  previous := to_jsonb(d);
  update public.pb_settings set shop_name=trim(p_shop_name),latitude=p_lat,longitude=p_lng,break_mode=p_break_mode,fixed_break_minutes=p_fixed_break_minutes,break_after_minutes=p_break_after_minutes,version=version+1 where id=1 returning * into d;
  insert into public.pb_audit(actor_id,entity,entity_id,reason,before_data,after_data) values(auth.uid(),'settings','1',trim(p_reason),previous,to_jsonb(d));
  return d;
end $$;

-- Explicit function grants: no anonymous mutations, no direct client writes.
revoke all on function public.pb_is_admin(),public.pb_is_active(),public.pb_work_seconds(public.pb_attendance,timestamptz),public.pb_punch(text,double precision,double precision,double precision,timestamptz),public.pb_correct_attendance(uuid,date,timestamptz,timestamptz,integer,integer,text),public.pb_save_staff(uuid,text,text,text,text,text,boolean,integer,text),public.pb_save_settings(text,double precision,double precision,text,integer,integer,integer,text) from public,anon,authenticated;
grant execute on function public.pb_is_admin(),public.pb_is_active(),public.pb_work_seconds(public.pb_attendance,timestamptz),public.pb_punch(text,double precision,double precision,double precision,timestamptz),public.pb_correct_attendance(uuid,date,timestamptz,timestamptz,integer,integer,text),public.pb_save_staff(uuid,text,text,text,text,text,boolean,integer,text),public.pb_save_settings(text,double precision,double precision,text,integer,integer,integer,text) to authenticated;
commit;
