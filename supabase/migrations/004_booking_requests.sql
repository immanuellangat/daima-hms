-- =====================================================================
-- DAIMA Health Managing System - online booking requests
-- Run this whole file once in the Supabase SQL editor, after 001-003.
--
-- Anyone (even without an account) can ask for an appointment from /book.
-- The request only holds a preferred time; reception confirms it, which
-- registers the patient if needed and books a normal appointment.
-- =====================================================================

create type booking_request_status as enum ('pending','booked','declined');
create sequence booking_request_seq start 1;

create table booking_requests (
  id uuid primary key default gen_random_uuid(),
  ref text unique not null default ('REQ-' || lpad(nextval('booking_request_seq')::text, 5, '0')),
  full_name text not null check (char_length(full_name) between 3 and 120),
  phone text not null check (phone ~ '^[+\d][\d\s-]{6,18}$'),
  email text check (email is null or (char_length(email) <= 200 and email like '%_@_%')),
  doctor_id uuid references profiles(id),          -- null = any doctor
  preferred_start timestamptz not null,
  preferred_end timestamptz not null,
  reason text check (reason is null or char_length(reason) <= 300),
  status booking_request_status not null default 'pending',
  patient_id uuid references patients(id),         -- set when booked
  appointment_id uuid references appointments(id), -- set when booked
  decline_reason text,
  handled_by uuid references profiles(id),
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  check (preferred_end > preferred_start)
);
create index booking_requests_status_idx on booking_requests(status, created_at);
create index booking_requests_phone_idx on booking_requests(right(regexp_replace(phone, '\D', '', 'g'), 9));

create trigger audit_booking_requests after insert or update or delete on booking_requests
  for each row execute function log_audit();

alter table booking_requests enable row level security;

-- Reception and admins work the list. There is deliberately no insert policy:
-- the public can only add rows through request_appointment() below.
create policy bookreq_staff_read on booking_requests for select to authenticated
  using (has_role('receptionist','hospital_admin','system_admin'));
create policy bookreq_staff_update on booking_requests for update to authenticated
  using (has_role('receptionist','hospital_admin','system_admin'))
  with check (has_role('receptionist','hospital_admin','system_admin'));

-- ---------- public helpers ----------

-- Working hours for the public booking page (schedules are otherwise only readable when signed in).
create function doctor_schedule(p_doctor uuid)
returns table (weekday int, start_time time, end_time time, slot_minutes int)
language sql stable security definer set search_path = public as $$
  select s.weekday, s.start_time, s.end_time, s.slot_minutes
    from doctor_schedules s join profiles p on p.id = s.doctor_id
   where s.doctor_id = p_doctor and p.role = 'doctor' and p.active
$$;

-- The only way to create a booking request. Validates input and limits abuse:
-- at most 3 open requests per phone number, and a flood guard across everyone.
create function request_appointment(
  p_full_name text, p_phone text, p_email text, p_doctor uuid,
  p_start timestamptz, p_end timestamptz, p_reason text
) returns text
language plpgsql security definer set search_path = public as $$
declare v_ref text; v_phone9 text;
begin
  p_full_name := trim(p_full_name);
  p_phone := trim(p_phone);
  p_email := nullif(lower(trim(p_email)), '');
  p_reason := nullif(trim(p_reason), '');

  if char_length(coalesce(p_full_name, '')) < 3 then raise exception 'Enter your full name'; end if;
  if coalesce(p_phone, '') !~ '^[+\d][\d\s-]{6,18}$' then raise exception 'Enter a valid phone number'; end if;
  if p_start is null or p_end is null or p_end <= p_start or p_end - p_start > interval '2 hours' then
    raise exception 'Choose a time';
  end if;
  if p_start <= now() then raise exception 'That time has already passed. Choose another'; end if;
  if p_start > now() + interval '90 days' then raise exception 'Appointments can be requested up to 90 days ahead'; end if;
  if p_doctor is not null and not exists (select 1 from profiles where id = p_doctor and role = 'doctor' and active) then
    raise exception 'That doctor is not available. Choose another';
  end if;

  v_phone9 := right(regexp_replace(p_phone, '\D', '', 'g'), 9);
  if (select count(*) from booking_requests
       where status = 'pending' and right(regexp_replace(phone, '\D', '', 'g'), 9) = v_phone9) >= 3 then
    raise exception 'You already have 3 requests waiting. Reception will call you about them';
  end if;
  if (select count(*) from booking_requests where created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'We are receiving a lot of requests right now. Please try again in a few minutes or call us';
  end if;

  insert into booking_requests (full_name, phone, email, doctor_id, preferred_start, preferred_end, reason)
  values (p_full_name, p_phone, p_email, p_doctor, p_start, p_end, left(p_reason, 300))
  returning ref into v_ref;
  return v_ref;
end $$;

-- Reception: turn a request into a real appointment in one step. Uses an existing patient
-- (by Patient ID) or registers a new one from the request's name and phone.
-- Runs with the caller's permissions, so the usual row-level security applies.
create function confirm_booking_request(
  p_request uuid, p_patient_no text, p_age int, p_gender text,
  p_doctor uuid, p_start timestamptz, p_end timestamptz
) returns text
language plpgsql set search_path = public as $$
declare r booking_requests; v_pid uuid; v_no text; v_appt uuid;
begin
  if not has_role('receptionist','hospital_admin','system_admin') then
    raise exception 'Only reception can confirm booking requests';
  end if;
  select * into r from booking_requests where id = p_request for update;
  if not found then raise exception 'Booking request not found'; end if;
  if r.status <> 'pending' then raise exception 'This request has already been handled'; end if;
  if p_start is null or p_end is null or p_end <= p_start then raise exception 'Choose a valid time'; end if;
  if p_start <= now() then raise exception 'That time has already passed. Choose another'; end if;

  if nullif(trim(p_patient_no), '') is not null then
    select id, patient_no into v_pid, v_no from patients where patient_no = upper(trim(p_patient_no));
    if v_pid is null then raise exception 'No patient found with ID %', upper(trim(p_patient_no)); end if;
  else
    if p_age is null or p_age < 0 or p_age > 149 then raise exception 'Enter the patient''s age to register them'; end if;
    if coalesce(p_gender, '') not in ('male','female','other') then raise exception 'Choose the patient''s gender to register them'; end if;
    insert into patients (full_name, age, gender, phone, created_by)
    values (r.full_name, p_age, p_gender, r.phone, auth.uid())
    returning id, patient_no into v_pid, v_no;
  end if;

  insert into appointments (patient_id, doctor_id, starts_at, ends_at, reason, created_by)
  values (v_pid, p_doctor, p_start, p_end, r.reason, auth.uid())
  returning id into v_appt;

  update booking_requests
     set status = 'booked', patient_id = v_pid, appointment_id = v_appt, handled_by = auth.uid(), handled_at = now()
   where id = p_request;
  return v_no;
end $$;

-- Reception: existing patients with the same phone number (ignores spaces, 0 vs +254 prefixes).
-- Runs with the caller's permissions, so only staff who can read patients get rows.
create function match_patients_by_phone(p_phone text)
returns table (id uuid, patient_no text, full_name text, phone text, age int)
language sql stable set search_path = public as $$
  select p.id, p.patient_no, p.full_name, p.phone, p.age from patients p
   where right(regexp_replace(p.phone, '\D', '', 'g'), 9) = right(regexp_replace(p_phone, '\D', '', 'g'), 9)
   order by p.registered_at desc limit 5
$$;

revoke all on function request_appointment(text, text, text, uuid, timestamptz, timestamptz, text) from public;
grant execute on function request_appointment(text, text, text, uuid, timestamptz, timestamptz, text) to anon, authenticated;
revoke all on function confirm_booking_request(uuid, text, int, text, uuid, timestamptz, timestamptz) from public, anon;
grant execute on function confirm_booking_request(uuid, text, int, text, uuid, timestamptz, timestamptz) to authenticated;
grant execute on function doctor_schedule(uuid) to anon, authenticated;
grant execute on function list_doctors() to anon;
grant execute on function booked_slots(uuid, timestamptz, timestamptz) to anon;
