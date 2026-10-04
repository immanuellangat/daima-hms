-- =====================================================================
-- DAIMA Health Managing System - core schema
-- Run this whole file in the Supabase SQL editor (once), then 002_seed.sql
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- enums ----------
create type user_role as enum (
  'receptionist','nurse','doctor','lab_technician','pharmacist',
  'accountant','hospital_admin','system_admin','patient'
);
create type visit_status as enum (
  'registered','triage','consultation','lab','radiology','pharmacy','billing','completed','cancelled'
);
create type request_status as enum ('pending','in_progress','completed','cancelled');
create type imaging_status as enum ('requested','scheduled','completed','reported','cancelled');
create type rx_status as enum ('pending','approved','partial','dispensed','cancelled');
create type invoice_status as enum ('unpaid','partial','paid','cancelled');
create type pay_method as enum ('cash','mobile_money','bank_transfer','insurance','debit_card','credit_card');
create type appt_status as enum ('scheduled','confirmed','completed','cancelled','no_show');
create type notif_channel as enum ('sms','email','push','in_app');

-- ---------- sequences ----------
create sequence invoice_seq start 1;
create sequence receipt_seq start 1;

-- ---------- hospital settings (single row) ----------
create table hospital_settings (
  id int primary key default 1 check (id = 1),
  name text not null default 'DAIMA Health Managing System',
  initials text not null default 'DHMS',
  patient_seq bigint not null default 0,
  consultation_fee numeric(12,2) not null default 1000,
  currency text not null default 'KES',
  timezone text not null default 'Africa/Nairobi',
  phone text,
  address text,
  reminder_hours_before int not null default 24,
  backup_enabled boolean not null default true,
  backup_target text not null default 'cloud' check (backup_target in ('cloud','local','both'))
);
insert into hospital_settings (id) values (1);

-- ---------- profiles ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  phone text,
  role user_role not null default 'patient',
  department text,
  active boolean not null default true,
  patient_id uuid,                       -- set for patient-portal accounts
  created_at timestamptz not null default now()
);

-- ---------- patients ----------
create table patients (
  id uuid primary key default gen_random_uuid(),
  patient_no text unique not null default '',
  full_name text not null,
  age int not null check (age >= 0 and age < 150),
  date_of_birth date,
  gender text not null check (gender in ('male','female','other')),
  phone text not null,
  residence text,
  emergency_contact_name text,
  emergency_contact_phone text,
  allergies text[] not null default '{}',
  chronic_conditions text[] not null default '{}',
  blood_group text,
  registered_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);
create index patients_phone_idx on patients(phone);
create index patients_name_idx on patients using gin (to_tsvector('simple', full_name));
alter table profiles add constraint profiles_patient_fk foreign key (patient_id) references patients(id);

create function set_patient_no() returns trigger language plpgsql security definer set search_path = public as $$
declare v_init text; v_seq bigint;
begin
  -- service role (restore/import) may supply an existing Patient ID; clients never can
  if auth.uid() is null and coalesce(new.patient_no, '') <> '' then return new; end if;
  update hospital_settings set patient_seq = patient_seq + 1 where id = 1
    returning initials, patient_seq into v_init, v_seq;
  new.patient_no := v_init || '-' || lpad(v_seq::text, 6, '0');
  return new;
end $$;
create trigger patients_set_no before insert on patients
  for each row execute function set_patient_no();

-- ---------- visits ----------
create table visits (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  status visit_status not null default 'registered',
  doctor_id uuid references profiles(id),
  consultation_fee numeric(12,2) not null default 0,
  consultation_paid boolean not null default false,
  consultation_pay_method pay_method,
  started_at timestamptz not null default now(),
  closed_at timestamptz,
  created_by uuid references profiles(id)
);
create index visits_patient_idx on visits(patient_id, started_at desc);
create index visits_status_idx on visits(status);

-- ---------- triage ----------
create table triage_records (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references visits(id) on delete cascade,
  patient_id uuid not null references patients(id),
  bp_systolic int check (bp_systolic between 40 and 300),
  bp_diastolic int check (bp_diastolic between 20 and 200),
  weight_kg numeric(5,1),
  height_cm numeric(5,1),
  temperature_c numeric(4,1),
  pulse_rate int,
  oxygen_saturation int check (oxygen_saturation between 0 and 100),
  medical_history text,
  notes text,
  nurse_id uuid references profiles(id),
  recorded_at timestamptz not null default now(),
  unique (visit_id)
);

-- ---------- symptom checklist (rule-based) ----------
create table symptoms (
  id serial primary key,
  name text unique not null,
  category text not null
);
create table conditions (
  id serial primary key,
  name text unique not null,
  icd_code text
);
create table symptom_conditions (
  symptom_id int references symptoms(id) on delete cascade,
  condition_id int references conditions(id) on delete cascade,
  weight int not null default 1,
  primary key (symptom_id, condition_id)
);

-- ---------- consultation ----------
create table consultations (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references visits(id) on delete cascade,
  patient_id uuid not null references patients(id),
  doctor_id uuid references profiles(id),
  symptoms text[] not null default '{}',
  other_symptoms text,
  observations text,
  diagnosis text,
  treatment_plan text,
  notes text,
  follow_up_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (visit_id)
);

create table referrals (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references visits(id) on delete cascade,
  patient_id uuid not null references patients(id),
  referred_to text not null,
  reason text not null,
  urgency text not null default 'routine' check (urgency in ('routine','urgent','emergency')),
  referred_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ---------- laboratory ----------
create table lab_tests (
  id serial primary key,
  name text unique not null,
  category text not null,
  price numeric(12,2) not null default 0,
  unit text,
  reference_range text
);
create table lab_requests (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references visits(id) on delete cascade,
  patient_id uuid not null references patients(id),
  test_id int references lab_tests(id),
  custom_name text,
  price numeric(12,2) not null default 0,
  clinical_notes text,
  status request_status not null default 'pending',
  result text,
  result_value text,
  unit text,
  reference_range text,
  abnormal boolean not null default false,
  requested_by uuid references profiles(id),
  performed_by uuid references profiles(id),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  check (test_id is not null or custom_name is not null)
);
create index lab_requests_status_idx on lab_requests(status);
create index lab_requests_patient_idx on lab_requests(patient_id);

-- ---------- radiology ----------
create table imaging_procedures (
  id serial primary key,
  modality text not null,
  name text unique not null,
  price numeric(12,2) not null default 0
);
create table imaging_requests (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references visits(id) on delete cascade,
  patient_id uuid not null references patients(id),
  procedure_id int references imaging_procedures(id),
  custom_name text,
  price numeric(12,2) not null default 0,
  clinical_notes text,
  status imaging_status not null default 'requested',
  scheduled_at timestamptz,
  report text,
  file_paths text[] not null default '{}',   -- Supabase Storage paths (bucket: imaging)
  requested_by uuid references profiles(id),
  performed_by uuid references profiles(id),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  check (procedure_id is not null or custom_name is not null)
);
create index imaging_requests_status_idx on imaging_requests(status);

-- ---------- pharmacy ----------
create table medicines (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  generic_name text,
  category text not null,
  unit text not null default 'tablet',
  selling_price numeric(12,2) not null default 0,
  reorder_level int not null default 0,
  max_stock int not null default 100 check (max_stock > 0),   -- 100% reference for stock colours
  is_supply boolean not null default false,                  -- true = medical supply, not a drug
  active boolean not null default true
);
create table medicine_batches (
  id uuid primary key default gen_random_uuid(),
  medicine_id uuid not null references medicines(id) on delete cascade,
  batch_no text not null,
  supplier text,
  quantity int not null default 0 check (quantity >= 0),
  expiry_date date not null,
  purchase_price numeric(12,2) not null default 0,
  received_at timestamptz not null default now(),
  unique (medicine_id, batch_no)
);
create index batches_medicine_idx on medicine_batches(medicine_id, expiry_date);

create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  medicine_id uuid not null references medicines(id),
  batch_id uuid references medicine_batches(id),
  movement text not null check (movement in ('in','out','adjustment','expired')),
  quantity int not null,
  reference text,
  user_id uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index stock_movements_med_idx on stock_movements(medicine_id, created_at desc);

create table prescriptions (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references visits(id) on delete cascade,
  patient_id uuid not null references patients(id),
  doctor_id uuid references profiles(id),
  status rx_status not null default 'pending',
  notes text,
  created_at timestamptz not null default now(),
  dispensed_by uuid references profiles(id),
  dispensed_at timestamptz
);
create table prescription_items (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references prescriptions(id) on delete cascade,
  medicine_id uuid not null references medicines(id),
  dosage text not null,
  frequency text not null,
  duration text not null,
  quantity int not null check (quantity > 0),
  unit_price numeric(12,2) not null default 0,
  dispensed_qty int not null default 0
);
create index rx_status_idx on prescriptions(status);

-- ---------- billing ----------
create table invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text unique not null default ('INV-' || lpad(nextval('invoice_seq')::text, 6, '0')),
  visit_id uuid not null references visits(id),
  patient_id uuid not null references patients(id),
  status invoice_status not null default 'unpaid',
  total numeric(12,2) not null default 0,
  paid numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (visit_id)
);
create table invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  category text not null check (category in ('consultation','laboratory','imaging','pharmacy','other')),
  description text not null,
  quantity numeric(10,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  amount numeric(12,2) generated always as (quantity * unit_price) stored,
  source_id uuid                               -- originating lab/imaging/rx item (null for manual charges)
);
create table payments (
  id uuid primary key default gen_random_uuid(),
  receipt_no text unique not null default ('RCP-' || lpad(nextval('receipt_seq')::text, 6, '0')),
  invoice_id uuid not null references invoices(id),
  patient_id uuid not null references patients(id),
  amount numeric(12,2) not null check (amount > 0),
  method pay_method not null,
  reference text,
  received_by uuid references profiles(id),
  paid_at timestamptz not null default now()
);

-- ---------- appointments ----------
create table doctor_schedules (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references profiles(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),   -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  slot_minutes int not null default 20,
  check (end_time > start_time)
);
create table appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  doctor_id uuid references profiles(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  status appt_status not null default 'scheduled',
  reminder_sent_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index appt_time_idx on appointments(starts_at);
create index appt_doctor_idx on appointments(doctor_id, starts_at);

-- ---------- notifications ----------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id),
  user_id uuid references profiles(id),
  channel notif_channel not null default 'in_app',
  title text not null,
  body text not null,
  status text not null default 'queued' check (status in ('queued','sent','failed','read')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index notif_patient_idx on notifications(patient_id, created_at desc);

-- ---------- audit trail ----------
create table audit_logs (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id uuid,
  user_name text,
  user_role text,
  action text not null,                 -- INSERT / UPDATE / DELETE / VIEW / LOGIN ...
  table_name text,
  record_id text,
  patient_id uuid,
  changes jsonb
);
create index audit_patient_idx on audit_logs(patient_id, at desc);
create index audit_user_idx on audit_logs(user_id, at desc);
create index audit_at_idx on audit_logs(at desc);

create table backups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('automatic','manual')),
  target text not null check (target in ('cloud','local')),
  status text not null default 'completed' check (status in ('running','completed','failed')),
  storage_path text,
  size_bytes bigint,
  tables_included int,
  created_by uuid references profiles(id)
);

-- =====================================================================
-- Helper functions
-- =====================================================================
create function app_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and active
$$;

create function has_role(variadic roles user_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app_role() = any(roles), false)
$$;

create function my_patient_id() returns uuid
language sql stable security definer set search_path = public as $$
  select patient_id from profiles where id = auth.uid() and role = 'patient'
$$;

-- new auth user => profile, always as 'patient' (roles are only granted by admins)
create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, email, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), new.email, 'patient');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- users may edit their own contact info, but never role / active / patient link
create function protect_profile_columns() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or has_role('system_admin','hospital_admin')
     or current_setting('app.claiming', true) = '1' then
    return new;   -- service role / admins / claim_patient_account()
  end if;
  if new.role is distinct from old.role
     or new.active is distinct from old.active
     or new.patient_id is distinct from old.patient_id then
    raise exception 'Not allowed to change role, status or patient link';
  end if;
  return new;
end $$;
create trigger profiles_protect before update on profiles
  for each row execute function protect_profile_columns();

-- Patient portal: a logged-in patient links their account using Patient ID + phone.
create function claim_patient_account(p_patient_no text, p_phone text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_pid uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select id into v_pid from patients
   where patient_no = upper(trim(p_patient_no)) and phone = trim(p_phone);
  if v_pid is null then raise exception 'No patient matches that Patient ID and phone number'; end if;
  if exists (select 1 from profiles where patient_id = v_pid and id <> auth.uid()) then
    raise exception 'This patient record is already linked to another account';
  end if;
  perform set_config('app.claiming', '1', true);
  update profiles set patient_id = v_pid where id = auth.uid() and role = 'patient';
  perform set_config('app.claiming', '0', true);
  return v_pid;
end $$;

-- =====================================================================
-- Audit trigger (who changed what, when)
-- =====================================================================
create function log_audit() returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb; v_old jsonb; v_diff jsonb; v_pid uuid; v_name text; v_role text; v_rec text;
begin
  if tg_op = 'DELETE' then v_row := to_jsonb(old); else v_row := to_jsonb(new); end if;
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    select jsonb_object_agg(n.key, jsonb_build_object('old', v_old->n.key, 'new', n.value))
      into v_diff from jsonb_each(v_row) n where v_old->n.key is distinct from n.value;
    if v_diff is null then return new; end if;   -- nothing changed
  elsif tg_op = 'INSERT' then v_diff := v_row;
  else v_diff := v_row;
  end if;
  v_rec := v_row->>'id';
  if tg_table_name = 'patients' then v_pid := (v_row->>'id')::uuid;
  elsif v_row ? 'patient_id' then v_pid := nullif(v_row->>'patient_id','')::uuid;
  end if;
  select full_name, role::text into v_name, v_role from profiles where id = auth.uid();
  insert into audit_logs (user_id, user_name, user_role, action, table_name, record_id, patient_id, changes)
  values (auth.uid(), v_name, v_role, tg_op, tg_table_name, v_rec, v_pid, v_diff);
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'patients','visits','triage_records','consultations','referrals','lab_requests',
    'imaging_requests','prescriptions','prescription_items','medicines','medicine_batches',
    'invoices','invoice_items','payments','appointments','profiles'
  ] loop
    execute format('create trigger audit_%1$s after insert or update or delete on %1$s
                    for each row execute function log_audit()', t);
  end loop;
end $$;

-- Explicit "viewed patient file" logging, called by the app
create function log_patient_view(p_patient_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_name text; v_role text;
begin
  if auth.uid() is null then return; end if;
  select full_name, role::text into v_name, v_role from profiles where id = auth.uid();
  insert into audit_logs (user_id, user_name, user_role, action, table_name, record_id, patient_id)
  values (auth.uid(), v_name, v_role, 'VIEW', 'patients', p_patient_id::text, p_patient_id);
end $$;

-- Generic event logging (LOGIN, LOGOUT, EXPORT, BACKUP ...), called by the app
create function log_event(p_action text, p_table text default null, p_record text default null, p_patient uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text; v_role text;
begin
  if auth.uid() is null then return; end if;
  select full_name, role::text into v_name, v_role from profiles where id = auth.uid();
  insert into audit_logs (user_id, user_name, user_role, action, table_name, record_id, patient_id)
  values (auth.uid(), v_name, v_role, upper(p_action), p_table, p_record, p_patient);
end $$;

-- keep consultations.updated_at fresh
create function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger consultations_touch before update on consultations
  for each row execute function touch_updated_at();

-- =====================================================================
-- Business logic
-- =====================================================================

-- Consultation fee always comes from hospital settings, never from the client.
create function visit_set_fee() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null and new.consultation_fee > 0 then return new; end if;   -- restore
  select consultation_fee into new.consultation_fee from hospital_settings where id = 1;
  return new;
end $$;
create trigger visits_fee before insert on visits
  for each row execute function visit_set_fee();

-- Prices are snapshotted server-side so clients cannot set their own.
create function lab_request_price() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;   -- restore
  if new.test_id is not null then
    select price into new.price from lab_tests where id = new.test_id;
  end if;
  return new;
end $$;
create trigger lab_requests_price before insert on lab_requests
  for each row execute function lab_request_price();

create function imaging_request_price() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;   -- restore
  if new.procedure_id is not null then
    select price into new.price from imaging_procedures where id = new.procedure_id;
  end if;
  return new;
end $$;
create trigger imaging_requests_price before insert on imaging_requests
  for each row execute function imaging_request_price();

create function rx_item_price() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;   -- restore
  select selling_price into new.unit_price from medicines where id = new.medicine_id;
  return new;
end $$;
create trigger rx_items_price before insert on prescription_items
  for each row execute function rx_item_price();

-- RLS cannot restrict columns, so lock billing-relevant fields on requests after creation.
-- (Lab technicians must not be able to alter prices; doctors only cancel / read.)
create function lock_lab_request() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;   -- service role
  if new.price is distinct from old.price
     or new.visit_id is distinct from old.visit_id
     or new.patient_id is distinct from old.patient_id
     or new.requested_by is distinct from old.requested_by
     or new.test_id is distinct from old.test_id then
    raise exception 'Test, price, patient and requester cannot be changed on a request';
  end if;
  if has_role('doctor')
     and (new.result is distinct from old.result or new.result_value is distinct from old.result_value
          or new.abnormal is distinct from old.abnormal) then
    raise exception 'Doctors cannot edit laboratory results';
  end if;
  return new;
end $$;
create trigger lab_requests_lock before update on lab_requests
  for each row execute function lock_lab_request();

create function lock_imaging_request() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.price is distinct from old.price
     or new.visit_id is distinct from old.visit_id
     or new.patient_id is distinct from old.patient_id
     or new.requested_by is distinct from old.requested_by
     or new.procedure_id is distinct from old.procedure_id then
    raise exception 'Procedure, price, patient and requester cannot be changed on a request';
  end if;
  if has_role('doctor') and new.report is distinct from old.report then
    raise exception 'Doctors cannot edit imaging reports';
  end if;
  return new;
end $$;
create trigger imaging_requests_lock before update on imaging_requests
  for each row execute function lock_imaging_request();

-- Same idea for prescriptions: the pharmacist changes status/dispensing, never the clinical content.
create function lock_rx_items() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.medicine_id is distinct from old.medicine_id or new.quantity is distinct from old.quantity
     or new.unit_price is distinct from old.unit_price or new.dosage is distinct from old.dosage then
    raise exception 'Prescription items cannot be edited; remove and re-add them';
  end if;
  return new;
end $$;
create trigger rx_items_lock before update on prescription_items
  for each row execute function lock_rx_items();

-- Move a visit along when work completes
create function advance_visit(p_visit uuid, p_status visit_status) returns void
language sql security definer set search_path = public as $$
  update visits set status = p_status where id = p_visit and status <> 'completed' and status <> 'cancelled';
$$;

-- Build / refresh the visit invoice from consultation fee + lab + imaging + drugs.
create function generate_invoice(p_visit uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_inv uuid; v_patient uuid; v_fee numeric; v_total numeric; v_paid numeric;
begin
  if not has_role('accountant','receptionist','doctor','pharmacist','lab_technician','hospital_admin','system_admin') then
    raise exception 'Not allowed';
  end if;
  select patient_id, consultation_fee into v_patient, v_fee from visits where id = p_visit;
  if v_patient is null then raise exception 'Visit not found'; end if;

  select id into v_inv from invoices where visit_id = p_visit;
  if v_inv is null then
    insert into invoices (visit_id, patient_id) values (p_visit, v_patient) returning id into v_inv;
  end if;

  -- rebuild automatic lines, keep manual 'other' lines (source_id is null)
  delete from invoice_items where invoice_id = v_inv and source_id is not null;
  delete from invoice_items where invoice_id = v_inv and category = 'consultation';

  if v_fee > 0 then
    insert into invoice_items (invoice_id, category, description, quantity, unit_price)
    values (v_inv, 'consultation', 'Consultation fee', 1, v_fee);
  end if;

  insert into invoice_items (invoice_id, category, description, quantity, unit_price, source_id)
  select v_inv, 'laboratory', coalesce(t.name, r.custom_name), 1, r.price, r.id
    from lab_requests r left join lab_tests t on t.id = r.test_id
   where r.visit_id = p_visit and r.status <> 'cancelled';

  insert into invoice_items (invoice_id, category, description, quantity, unit_price, source_id)
  select v_inv, 'imaging', coalesce(p.name, r.custom_name), 1, r.price, r.id
    from imaging_requests r left join imaging_procedures p on p.id = r.procedure_id
   where r.visit_id = p_visit and r.status <> 'cancelled';

  insert into invoice_items (invoice_id, category, description, quantity, unit_price, source_id)
  select v_inv, 'pharmacy', m.name || ' (' || i.dosage || ')', i.quantity, i.unit_price, i.id
    from prescription_items i
    join prescriptions p on p.id = i.prescription_id and p.status <> 'cancelled'
    join medicines m on m.id = i.medicine_id
   where p.visit_id = p_visit;

  select coalesce(sum(amount),0) into v_total from invoice_items where invoice_id = v_inv;
  select coalesce(sum(amount),0) into v_paid from payments where invoice_id = v_inv;
  update invoices set total = v_total, paid = v_paid,
    status = case when v_total > 0 and v_paid >= v_total then 'paid'
                  when v_paid > 0 then 'partial' else 'unpaid' end::invoice_status
   where id = v_inv;
  return v_inv;
end $$;

-- Record a payment; updates invoice status and closes the visit when fully paid.
create function record_payment(p_invoice uuid, p_amount numeric, p_method pay_method, p_reference text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_pay uuid; v_total numeric; v_paid numeric; v_patient uuid; v_visit uuid;
begin
  if not has_role('accountant','receptionist','hospital_admin','system_admin') then
    raise exception 'Not allowed';
  end if;
  select total, patient_id, visit_id into v_total, v_patient, v_visit from invoices where id = p_invoice for update;
  if v_patient is null then raise exception 'Invoice not found'; end if;
  select coalesce(sum(amount),0) into v_paid from payments where invoice_id = p_invoice;
  if p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if v_paid + p_amount > v_total then raise exception 'Payment exceeds balance of %', (v_total - v_paid); end if;

  insert into payments (invoice_id, patient_id, amount, method, reference, received_by)
  values (p_invoice, v_patient, p_amount, p_method, p_reference, auth.uid()) returning id into v_pay;

  update invoices set paid = v_paid + p_amount,
    status = (case when v_paid + p_amount >= v_total then 'paid' else 'partial' end)::invoice_status
   where id = p_invoice;
  if v_paid + p_amount >= v_total then
    -- only close the visit once it has actually reached billing (not on the reception fee alone)
    update visits set status = 'completed', closed_at = now() where id = v_visit and status = 'billing';
  end if;
  return v_pay;
end $$;

-- Dispense a prescription using first-expiry-first-out across non-expired batches.
create function dispense_prescription(p_rx uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  it record; b record; v_need int; v_take int; v_all_done boolean := true; v_visit uuid; v_inv uuid;
begin
  if not has_role('pharmacist','hospital_admin','system_admin') then raise exception 'Not allowed'; end if;
  select visit_id into v_visit from prescriptions where id = p_rx and status in ('approved','partial') for update;
  if v_visit is null then raise exception 'Prescription not found or already closed'; end if;

  for it in select * from prescription_items where prescription_id = p_rx and dispensed_qty < quantity loop
    v_need := it.quantity - it.dispensed_qty;
    for b in select * from medicine_batches
              where medicine_id = it.medicine_id and quantity > 0 and expiry_date > current_date
              order by expiry_date for update loop
      exit when v_need <= 0;
      v_take := least(v_need, b.quantity);
      update medicine_batches set quantity = quantity - v_take where id = b.id;
      insert into stock_movements (medicine_id, batch_id, movement, quantity, reference, user_id)
      values (it.medicine_id, b.id, 'out', v_take, 'RX ' || p_rx::text, auth.uid());
      v_need := v_need - v_take;
    end loop;
    update prescription_items set dispensed_qty = quantity - v_need where id = it.id;
    if v_need > 0 then v_all_done := false; end if;
  end loop;

  update prescriptions set status = (case when v_all_done then 'dispensed' else 'partial' end)::rx_status,
    dispensed_by = auth.uid(), dispensed_at = now() where id = p_rx;
  if v_all_done then
    update visits set status = 'billing' where id = v_visit and status = 'pharmacy';
  end if;
  v_inv := generate_invoice(v_visit);
  update visits set status = 'completed', closed_at = now()
   where id = v_visit and status = 'billing'
     and exists (select 1 from invoices where id = v_inv and total - paid <= 0);
end $$;

-- Doctor finishes (or re-finishes) a consultation: send the patient to the next pending stage.
create function route_visit(p_visit uuid) returns visit_status
language plpgsql security definer set search_path = public as $$
declare v_status visit_status; v_inv uuid; v_bal numeric;
begin
  if not has_role('doctor','hospital_admin','system_admin') then raise exception 'Not allowed'; end if;
  if exists (select 1 from lab_requests where visit_id = p_visit and status in ('pending','in_progress')) then
    v_status := 'lab';
  elsif exists (select 1 from imaging_requests where visit_id = p_visit and status in ('requested','scheduled','completed')) then
    v_status := 'radiology';
  elsif exists (select 1 from prescriptions where visit_id = p_visit and status in ('pending','approved','partial')) then
    v_status := 'pharmacy';
  else
    v_status := 'billing';
  end if;
  update visits set status = v_status where id = p_visit and status not in ('completed','cancelled');
  v_inv := generate_invoice(p_visit);
  if v_status = 'billing' then
    select total - paid into v_bal from invoices where id = v_inv;
    if v_bal <= 0 then
      update visits set status = 'completed', closed_at = now() where id = p_visit;
      v_status := 'completed';
    end if;
  end if;
  return v_status;
end $$;

-- Lab / imaging staff finished something: if all diagnostics are done the patient returns to the doctor.
create function after_diagnostics(p_visit uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_lab boolean; v_img boolean;
begin
  if not has_role('lab_technician','doctor','hospital_admin','system_admin') then raise exception 'Not allowed'; end if;
  select exists (select 1 from lab_requests where visit_id = p_visit and status in ('pending','in_progress')) into v_lab;
  select exists (select 1 from imaging_requests where visit_id = p_visit and status in ('requested','scheduled','completed')) into v_img;
  if not v_lab and not v_img then
    update visits set status = 'consultation' where id = p_visit and status in ('lab','radiology');
  elsif not v_lab and v_img then
    update visits set status = 'radiology' where id = p_visit and status = 'lab';
  end if;
  perform generate_invoice(p_visit);
end $$;

-- Receive new stock (creates the batch and logs the movement).
create function receive_stock(
  p_medicine uuid, p_batch text, p_supplier text, p_qty int, p_expiry date, p_purchase numeric
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not has_role('pharmacist','hospital_admin','system_admin') then raise exception 'Not allowed'; end if;
  if p_qty <= 0 then raise exception 'Quantity must be positive'; end if;
  insert into medicine_batches (medicine_id, batch_no, supplier, quantity, expiry_date, purchase_price)
  values (p_medicine, p_batch, p_supplier, p_qty, p_expiry, p_purchase)
  on conflict (medicine_id, batch_no) do update
    set quantity = medicine_batches.quantity + excluded.quantity,
        supplier = excluded.supplier, purchase_price = excluded.purchase_price
  returning id into v_id;
  insert into stock_movements (medicine_id, batch_id, movement, quantity, reference, user_id)
  values (p_medicine, v_id, 'in', p_qty, 'Batch ' || p_batch, auth.uid());
  return v_id;
end $$;

-- ---------- appointments helpers ----------

-- Doctors list for booking screens (patients cannot read profiles directly).
create function list_doctors() returns table (id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select id, full_name from profiles where role = 'doctor' and active order by full_name
$$;

-- Taken slots for a doctor on a day, without exposing who booked them.
create function booked_slots(p_doctor uuid, p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.starts_at, a.ends_at from appointments a
   where a.doctor_id = p_doctor and a.status not in ('cancelled','no_show')
     and a.starts_at < p_to and a.ends_at > p_from
$$;

-- No double booking for the same doctor, enforced in the database.
create function appt_no_overlap() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('cancelled','no_show','completed') or new.doctor_id is null then return new; end if;
  if exists (
    select 1 from appointments a
     where a.doctor_id = new.doctor_id and a.id <> new.id and a.status not in ('cancelled','no_show')
       and a.starts_at < new.ends_at and a.ends_at > new.starts_at
  ) then
    raise exception 'That time slot is already booked for this doctor';
  end if;
  return new;
end $$;
create trigger appointments_overlap before insert or update on appointments
  for each row execute function appt_no_overlap();

-- Patient notifications: one in-app row (always) plus an SMS row (sent by the cron worker when a provider is configured).
create function notify_patient(p_patient uuid, p_title text, p_body text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (patient_id, channel, title, body, status, sent_at)
  values (p_patient, 'in_app', p_title, p_body, 'sent', now());
  insert into notifications (patient_id, channel, title, body, status)
  values (p_patient, 'sms', p_title, p_body, 'queued');
  insert into notifications (patient_id, channel, title, body, status)
  select p_patient, 'email', p_title, p_body, 'queued'
    where exists (select 1 from profiles where patient_id = p_patient and email is not null);
end $$;

create function appt_notify() returns trigger language plpgsql security definer set search_path = public as $$
declare v_tz text; v_when text; v_doc text;
begin
  select timezone into v_tz from hospital_settings where id = 1;
  v_when := to_char(new.starts_at at time zone v_tz, 'Dy DD Mon YYYY "at" HH24:MI');
  select 'Dr. ' || regexp_replace(full_name, '^Dr\.?\s*', '', 'i') into v_doc from profiles where id = new.doctor_id;
  if tg_op = 'INSERT' then
    perform notify_patient(new.patient_id, 'Appointment booked',
      'Your appointment' || coalesce(' with ' || v_doc, '') || ' is booked for ' || v_when || '.');
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    perform notify_patient(new.patient_id, 'Appointment cancelled', 'Your appointment on ' || v_when || ' was cancelled.');
  elsif new.starts_at is distinct from old.starts_at and new.status <> 'cancelled' then
    new.reminder_sent_at := null;
    perform notify_patient(new.patient_id, 'Appointment rescheduled',
      'Your appointment' || coalesce(' with ' || v_doc, '') || ' has moved to ' || v_when || '.');
  end if;
  return new;
end $$;
create trigger appointments_notify_ins after insert on appointments
  for each row execute function appt_notify();
create trigger appointments_notify_upd before update on appointments
  for each row execute function appt_notify();

-- Called by the scheduled worker (service role): queue reminders for upcoming appointments.
create function queue_appointment_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare a record; v_hours int; v_tz text; v_n int := 0;
begin
  select reminder_hours_before, timezone into v_hours, v_tz from hospital_settings where id = 1;
  for a in select id, patient_id, starts_at from appointments
            where status in ('scheduled','confirmed') and reminder_sent_at is null
              and starts_at > now() and starts_at <= now() + make_interval(hours => v_hours) loop
    perform notify_patient(a.patient_id, 'Appointment reminder',
      'Reminder: you have an appointment on ' || to_char(a.starts_at at time zone v_tz, 'Dy DD Mon "at" HH24:MI') || '. Reply or call us to reschedule.');
    update appointments set reminder_sent_at = now() where id = a.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function queue_appointment_reminders() from public, anon, authenticated;

-- =====================================================================
-- Views
-- =====================================================================

-- Stock per medicine. Colour rule: < 10% red, > 20% green, in between amber.
create view medicine_stock with (security_invoker = true) as
select
  m.id, m.name, m.generic_name, m.category, m.unit, m.selling_price,
  m.reorder_level, m.max_stock, m.is_supply, m.active,
  coalesce(sum(b.quantity) filter (where b.expiry_date > current_date), 0)::int as quantity,
  coalesce(sum(b.quantity) filter (where b.expiry_date <= current_date), 0)::int as expired_quantity,
  min(b.expiry_date) filter (where b.expiry_date > current_date and b.quantity > 0) as next_expiry,
  round(coalesce(sum(b.quantity) filter (where b.expiry_date > current_date), 0) * 100.0 / m.max_stock, 1) as stock_pct,
  case
    when coalesce(sum(b.quantity) filter (where b.expiry_date > current_date), 0) * 100.0 / m.max_stock < 10 then 'red'
    when coalesce(sum(b.quantity) filter (where b.expiry_date > current_date), 0) * 100.0 / m.max_stock > 20 then 'green'
    else 'amber'
  end as stock_level
from medicines m
left join medicine_batches b on b.medicine_id = m.id
group by m.id;

-- Patient chart summary used by the EMR header
create view patient_visit_summary with (security_invoker = true) as
select v.id as visit_id, v.patient_id, v.status, v.started_at, v.closed_at,
       c.diagnosis, c.doctor_id
from visits v left join consultations c on c.visit_id = v.id;

-- =====================================================================
-- Row Level Security
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'hospital_settings','profiles','patients','visits','triage_records','symptoms','conditions',
    'symptom_conditions','consultations','referrals','lab_tests','lab_requests','imaging_procedures',
    'imaging_requests','medicines','medicine_batches','stock_movements','prescriptions',
    'prescription_items','invoices','invoice_items','payments','doctor_schedules','appointments',
    'notifications','audit_logs','backups'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- convenience role lists
-- clinical staff: nurse, doctor | admins: hospital_admin, system_admin

-- settings: everyone signed in can read (hospital name), admins update
create policy settings_read on hospital_settings for select to authenticated using (true);
create policy settings_write on hospital_settings for update to authenticated
  using (has_role('hospital_admin','system_admin')) with check (has_role('hospital_admin','system_admin'));

-- profiles
create policy profiles_self on profiles for select to authenticated using (id = auth.uid());
create policy profiles_staff_read on profiles for select to authenticated
  using (has_role('receptionist','nurse','doctor','lab_technician','pharmacist','accountant','hospital_admin','system_admin'));
create policy profiles_self_update on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin_all on profiles for all to authenticated
  using (has_role('hospital_admin','system_admin')) with check (has_role('hospital_admin','system_admin'));

-- patients
create policy patients_staff_read on patients for select to authenticated
  using (has_role('receptionist','nurse','doctor','lab_technician','pharmacist','accountant','hospital_admin','system_admin'));
create policy patients_self_read on patients for select to authenticated using (id = my_patient_id());
create policy patients_insert on patients for insert to authenticated
  with check (has_role('receptionist','hospital_admin','system_admin'));
create policy patients_update on patients for update to authenticated
  using (has_role('receptionist','doctor','nurse','hospital_admin','system_admin'))
  with check (has_role('receptionist','doctor','nurse','hospital_admin','system_admin'));

-- visits
create policy visits_read on visits for select to authenticated
  using (has_role('receptionist','nurse','doctor','lab_technician','pharmacist','accountant','hospital_admin','system_admin'));
create policy visits_self_read on visits for select to authenticated using (patient_id = my_patient_id());
create policy visits_insert on visits for insert to authenticated
  with check (has_role('receptionist','hospital_admin','system_admin'));
create policy visits_update on visits for update to authenticated
  using (has_role('receptionist','nurse','doctor','hospital_admin','system_admin'))
  with check (has_role('receptionist','nurse','doctor','hospital_admin','system_admin'));

-- triage: nurses write; doctors/admin read (receptionists never see vitals)
create policy triage_read on triage_records for select to authenticated
  using (has_role('nurse','doctor','hospital_admin','system_admin'));
create policy triage_insert on triage_records for insert to authenticated with check (has_role('nurse'));
create policy triage_update on triage_records for update to authenticated
  using (has_role('nurse')) with check (has_role('nurse'));

-- symptom reference data
create policy symptoms_read on symptoms for select to authenticated using (true);
create policy conditions_read on conditions for select to authenticated using (true);
create policy sc_read on symptom_conditions for select to authenticated using (true);
create policy symptoms_admin on symptoms for all to authenticated
  using (has_role('hospital_admin','system_admin')) with check (has_role('hospital_admin','system_admin'));
create policy conditions_admin on conditions for all to authenticated
  using (has_role('hospital_admin','system_admin')) with check (has_role('hospital_admin','system_admin'));
create policy sc_admin on symptom_conditions for all to authenticated
  using (has_role('hospital_admin','system_admin')) with check (has_role('hospital_admin','system_admin'));

-- consultations: ONLY doctors write (nurses cannot edit diagnoses)
create policy consult_read on consultations for select to authenticated
  using (has_role('doctor','nurse','hospital_admin','system_admin'));
create policy consult_insert on consultations for insert to authenticated with check (has_role('doctor'));
create policy consult_update on consultations for update to authenticated
  using (has_role('doctor')) with check (has_role('doctor'));

-- patients can read (never write) their own clinical summary in the portal
create policy consult_self on consultations for select to authenticated using (patient_id = my_patient_id());
create policy triage_self on triage_records for select to authenticated using (patient_id = my_patient_id());
create policy referrals_self on referrals for select to authenticated using (patient_id = my_patient_id());

create policy referrals_read on referrals for select to authenticated
  using (has_role('doctor','nurse','hospital_admin','system_admin'));
create policy referrals_insert on referrals for insert to authenticated with check (has_role('doctor'));

-- lab
create policy labtests_read on lab_tests for select to authenticated using (true);
create policy labtests_admin on lab_tests for all to authenticated
  using (has_role('hospital_admin','system_admin','lab_technician'))
  with check (has_role('hospital_admin','system_admin','lab_technician'));
create policy labreq_read on lab_requests for select to authenticated
  using (has_role('doctor','nurse','lab_technician','hospital_admin','system_admin'));
create policy labreq_self on lab_requests for select to authenticated
  using (patient_id = my_patient_id() and status = 'completed');
create policy labreq_insert on lab_requests for insert to authenticated with check (has_role('doctor'));
create policy labreq_update on lab_requests for update to authenticated
  using (has_role('lab_technician','doctor')) with check (has_role('lab_technician','doctor'));

-- imaging (handled by lab_technician role = lab & imaging technician)
create policy imgproc_read on imaging_procedures for select to authenticated using (true);
create policy imgproc_admin on imaging_procedures for all to authenticated
  using (has_role('hospital_admin','system_admin')) with check (has_role('hospital_admin','system_admin'));
create policy imgreq_read on imaging_requests for select to authenticated
  using (has_role('doctor','nurse','lab_technician','hospital_admin','system_admin'));
create policy imgreq_self on imaging_requests for select to authenticated
  using (patient_id = my_patient_id() and status = 'reported');
create policy imgreq_insert on imaging_requests for insert to authenticated with check (has_role('doctor'));
create policy imgreq_update on imaging_requests for update to authenticated
  using (has_role('lab_technician','doctor')) with check (has_role('lab_technician','doctor'));

-- pharmacy
-- the medicine catalogue is not sensitive (patients see names on their own prescriptions)
create policy meds_read on medicines for select to authenticated using (true);
create policy meds_write on medicines for all to authenticated
  using (has_role('pharmacist','hospital_admin','system_admin'))
  with check (has_role('pharmacist','hospital_admin','system_admin'));
create policy batches_read on medicine_batches for select to authenticated
  using (has_role('pharmacist','doctor','nurse','hospital_admin','system_admin'));
create policy batches_write on medicine_batches for all to authenticated
  using (has_role('pharmacist','hospital_admin','system_admin'))
  with check (has_role('pharmacist','hospital_admin','system_admin'));
create policy stockmv_read on stock_movements for select to authenticated
  using (has_role('pharmacist','hospital_admin','system_admin'));

create policy rx_read on prescriptions for select to authenticated
  using (has_role('doctor','nurse','pharmacist','hospital_admin','system_admin'));
create policy rx_self on prescriptions for select to authenticated
  using (patient_id = my_patient_id() and status <> 'pending');
create policy rx_insert on prescriptions for insert to authenticated with check (has_role('doctor'));
create policy rx_update on prescriptions for update to authenticated
  using (has_role('doctor','pharmacist')) with check (has_role('doctor','pharmacist'));
create policy rxi_read on prescription_items for select to authenticated
  using (has_role('doctor','nurse','pharmacist','hospital_admin','system_admin')
         or exists (select 1 from prescriptions p where p.id = prescription_id and p.patient_id = my_patient_id()));
create policy rxi_insert on prescription_items for insert to authenticated with check (has_role('doctor'));
create policy rxi_delete on prescription_items for delete to authenticated using (has_role('doctor'));

-- billing: lab technicians / nurses / doctors cannot alter. Doctors cannot even read invoices.
create policy inv_read on invoices for select to authenticated
  using (has_role('accountant','receptionist','hospital_admin','system_admin'));
create policy inv_self on invoices for select to authenticated using (patient_id = my_patient_id());
create policy invi_read on invoice_items for select to authenticated
  using (has_role('accountant','receptionist','hospital_admin','system_admin')
         or exists (select 1 from invoices i where i.id = invoice_id and i.patient_id = my_patient_id()));
create policy invi_write on invoice_items for all to authenticated
  using (has_role('accountant','hospital_admin','system_admin'))
  with check (has_role('accountant','hospital_admin','system_admin'));
create policy pay_read on payments for select to authenticated
  using (has_role('accountant','receptionist','hospital_admin','system_admin'));
create policy pay_self on payments for select to authenticated using (patient_id = my_patient_id());
-- invoices & payments are written only through the SECURITY DEFINER functions above

-- appointments
create policy sched_read on doctor_schedules for select to authenticated using (true);
create policy sched_write on doctor_schedules for all to authenticated
  using (has_role('receptionist','hospital_admin','system_admin') or (has_role('doctor') and doctor_id = auth.uid()))
  with check (has_role('receptionist','hospital_admin','system_admin') or (has_role('doctor') and doctor_id = auth.uid()));
create policy appt_staff on appointments for all to authenticated
  using (has_role('receptionist','doctor','nurse','hospital_admin','system_admin'))
  with check (has_role('receptionist','doctor','nurse','hospital_admin','system_admin'));
create policy appt_self_read on appointments for select to authenticated using (patient_id = my_patient_id());
create policy appt_self_insert on appointments for insert to authenticated
  with check (patient_id = my_patient_id() and status = 'scheduled');
create policy appt_self_cancel on appointments for update to authenticated
  using (patient_id = my_patient_id()) with check (patient_id = my_patient_id() and status = 'cancelled');

-- notifications
create policy notif_self on notifications for select to authenticated using (patient_id = my_patient_id() or user_id = auth.uid());
create policy notif_staff on notifications for all to authenticated
  using (has_role('receptionist','hospital_admin','system_admin'))
  with check (has_role('receptionist','hospital_admin','system_admin'));

-- audit + backups: admins only (audit rows are inserted by SECURITY DEFINER triggers)
create policy audit_read on audit_logs for select to authenticated
  using (has_role('hospital_admin','system_admin'));
create policy backups_all on backups for all to authenticated
  using (has_role('system_admin','hospital_admin')) with check (has_role('system_admin','hospital_admin'));

-- =====================================================================
-- Storage buckets (private) + policies
-- =====================================================================
insert into storage.buckets (id, name, public) values
  ('imaging','imaging',false), ('backups','backups',false), ('lab-attachments','lab-attachments',false)
on conflict (id) do nothing;

create policy imaging_staff_rw on storage.objects for all to authenticated
  using (bucket_id = 'imaging' and has_role('doctor','nurse','lab_technician','hospital_admin','system_admin'))
  with check (bucket_id = 'imaging' and has_role('lab_technician','hospital_admin','system_admin'));
create policy labfiles_staff_rw on storage.objects for all to authenticated
  using (bucket_id = 'lab-attachments' and has_role('doctor','lab_technician','hospital_admin','system_admin'))
  with check (bucket_id = 'lab-attachments' and has_role('lab_technician','hospital_admin','system_admin'));
create policy backups_admin_rw on storage.objects for all to authenticated
  using (bucket_id = 'backups' and has_role('hospital_admin','system_admin'))
  with check (bucket_id = 'backups' and has_role('hospital_admin','system_admin'));

-- =====================================================================
-- Lock down internal helpers: Postgres lets everyone call functions by default.
-- These are only meant to be called by triggers / other SECURITY DEFINER functions.
-- =====================================================================
revoke all on function notify_patient(uuid, text, text) from public, anon, authenticated;
revoke all on function advance_visit(uuid, visit_status) from public, anon, authenticated;

-- After a restore: move every counter past the highest restored value so new numbers never collide.
create function sync_sequences() returns void
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  perform setval('invoice_seq', coalesce((select max(substring(invoice_no from '\d+$')::bigint) from invoices), 0) + 1, false);
  perform setval('receipt_seq', coalesce((select max(substring(receipt_no from '\d+$')::bigint) from payments), 0) + 1, false);
  update hospital_settings set patient_seq = greatest(patient_seq,
    coalesce((select max(substring(patient_no from '\d+$')::bigint) from patients), 0)) where id = 1;
  foreach t in array array['symptoms','conditions','lab_tests','imaging_procedures','audit_logs'] loop
    execute format('select setval(pg_get_serial_sequence(%L, ''id''), coalesce((select max(id) from %I), 0) + 1, false)', t, t);
  end loop;
end $$;
revoke all on function sync_sequences() from public, anon, authenticated;

-- Accounts created in Supabase Auth BEFORE this script ran have no profile yet: create them now.
insert into profiles (id, email, full_name, role)
select u.id, u.email, coalesce(u.raw_user_meta_data->>'full_name', ''), 'patient'
  from auth.users u
 where not exists (select 1 from profiles p where p.id = u.id);
