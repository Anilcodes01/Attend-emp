begin;
create table public.employees (
 id uuid primary key default gen_random_uuid(), employee_code text not null unique,
 full_name text not null, email text, department text not null, role text not null,
 pin_hash text not null, active boolean not null default true, created_at timestamptz not null default now(),
 constraint employee_code_format check (employee_code ~ '^[A-Z0-9_-]{1,40}$')
);
create table public.attendance (
 id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employees(id),
 work_date date not null, checked_in_at timestamptz not null, checked_out_at timestamptz,
 late boolean not null default false, unique(employee_id, work_date),
 check (checked_out_at is null or checked_out_at >= checked_in_at)
);
create index attendance_work_date_idx on public.attendance(work_date, id);
create table public.attend_limits (key text primary key, attempts integer not null, expires_at timestamptz not null);
create table public.attend_settings (id integer primary key check(id = 1), topic text not null);
insert into public.attend_settings values (1, 'attend-' || gen_random_uuid()::text || gen_random_uuid()::text);
alter table public.employees enable row level security;
alter table public.attendance enable row level security;
alter table public.attend_limits enable row level security;
alter table public.attend_settings enable row level security;
revoke all on public.employees, public.attendance, public.attend_limits, public.attend_settings from anon, authenticated;
grant all on public.employees, public.attendance, public.attend_limits, public.attend_settings to service_role;
create function public.attend_rate_limit(p_key text, p_max integer, p_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
 delete from public.attend_limits where expires_at < clock_timestamp();
 insert into public.attend_limits as limits(key, attempts, expires_at)
 values(p_key, 1, clock_timestamp() + make_interval(secs => p_seconds))
 on conflict(key) do update set attempts = limits.attempts + 1 returning attempts into n;
 return n <= p_max;
end; $$;
create function public.attend_punch(p_employee_id uuid, p_pin_hash text, p_action text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.employees; a public.attendance; recorded timestamptz; local_time timestamp; day date;
begin
 select * into e from public.employees where id = p_employee_id for update;
 if not found or e.pin_hash <> p_pin_hash then return jsonb_build_object('error', 'Credentials changed. Please try again.'); end if;
 if not e.active then return jsonb_build_object('error', 'Your employee profile is inactive. Contact your administrator.'); end if;
 recorded := clock_timestamp(); local_time := recorded at time zone 'Asia/Kolkata'; day := local_time::date;
 select * into a from public.attendance where employee_id = e.id and work_date = day;
 if p_action = 'check_in' then
  if a.checked_out_at is not null then return jsonb_build_object('error', 'Attendance is already completed for today.'); end if;
  if a.id is null then
   insert into public.attendance(employee_id, work_date, checked_in_at, late)
   values(e.id, day, recorded, local_time::time > time '09:45') returning * into a;
  end if;
 elsif p_action = 'check_out' then
  if a.id is null then return jsonb_build_object('error', 'Check in before checking out.'); end if;
  if a.checked_out_at is null then update public.attendance set checked_out_at = recorded where id = a.id returning * into a; end if;
 elsif p_action <> 'status' then return jsonb_build_object('error', 'Invalid action.');
 end if;
 return jsonb_build_object('name', e.full_name, 'attendance', case when a.id is null then null else to_jsonb(a) end, 'recorded_at', recorded, 'action', p_action);
end; $$;
create function public.attend_notify() returns trigger language plpgsql security definer set search_path = '' as $$
declare channel text;
begin
 select topic into channel from public.attend_settings where id = 1;
 perform realtime.send('{}'::jsonb, 'changed', channel, false);
 return null;
end; $$;
create trigger attendance_changed after insert or update or delete on public.attendance for each statement execute function public.attend_notify();
create trigger employees_changed after insert or update or delete on public.employees for each statement execute function public.attend_notify();
revoke all on function public.attend_rate_limit(text, integer, integer), public.attend_punch(uuid, text, text), public.attend_notify() from public, anon, authenticated;
grant execute on function public.attend_rate_limit(text, integer, integer), public.attend_punch(uuid, text, text), public.attend_notify() to service_role;
commit;
