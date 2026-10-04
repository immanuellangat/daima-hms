-- =====================================================================
-- DAIMA Health Managing System - analytics functions (run after 001 and 002)
-- All are restricted to hospital_admin / system_admin and aggregate inside Postgres,
-- so the dashboards stay fast as history grows.
-- =====================================================================

create function analytics_guard() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_role('hospital_admin','system_admin') then raise exception 'Not allowed'; end if;
end $$;

-- diagnoses are free text, optionally several separated by ';'
create function analytics_top_diagnoses(p_from timestamptz, p_to timestamptz, p_limit int default 10)
returns table (diagnosis text, cases bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform analytics_guard();
  return query
    select d.dx, count(*)::bigint
      from (select initcap(trim(x)) as dx
              from consultations c, unnest(string_to_array(c.diagnosis, ';')) as x
             where c.diagnosis is not null and c.created_at >= p_from and c.created_at < p_to and trim(x) <> '') d
     group by d.dx order by 2 desc, 1 limit p_limit;
end $$;

create function analytics_diagnosis_age(p_from timestamptz, p_to timestamptz)
returns table (diagnosis text, age_band text, cases bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform analytics_guard();
  return query
    select initcap(trim(x)),
           case when pt.age <= 4 then '0-4' when pt.age <= 14 then '5-14' when pt.age <= 24 then '15-24'
                when pt.age <= 44 then '25-44' when pt.age <= 64 then '45-64' else '65+' end,
           count(*)::bigint
      from consultations c
      join patients pt on pt.id = c.patient_id,
           unnest(string_to_array(c.diagnosis, ';')) as x
     where c.diagnosis is not null and c.created_at >= p_from and c.created_at < p_to and trim(x) <> ''
     group by 1, 2;
end $$;

-- weekly counts per diagnosis for the last N weeks (feeds the trend / projection)
create function analytics_diagnosis_weekly(p_weeks int default 12)
returns table (week date, diagnosis text, cases bigint)
language plpgsql stable security definer set search_path = public as $$
declare v_tz text;
begin
  perform analytics_guard();
  select timezone into v_tz from hospital_settings where id = 1;
  return query
    select date_trunc('week', c.created_at at time zone v_tz)::date, initcap(trim(x)), count(*)::bigint
      from consultations c, unnest(string_to_array(c.diagnosis, ';')) as x
     where c.diagnosis is not null and trim(x) <> ''
       and c.created_at >= date_trunc('week', now()) - make_interval(weeks => p_weeks)
     group by 1, 2;
end $$;

-- one row per day: new patients, visits, consultations, revenue collected
create function analytics_daily(p_from timestamptz, p_to timestamptz)
returns table (day date, new_patients bigint, visits bigint, consultations bigint, revenue numeric)
language plpgsql stable security definer set search_path = public as $$
declare v_tz text;
begin
  perform analytics_guard();
  select timezone into v_tz from hospital_settings where id = 1;
  return query
    select s.d::date,
           coalesce((select count(*) from patients p where (p.registered_at at time zone v_tz)::date = s.d::date), 0)::bigint,
           coalesce((select count(*) from visits v where (v.started_at at time zone v_tz)::date = s.d::date), 0)::bigint,
           coalesce((select count(*) from consultations c where (c.created_at at time zone v_tz)::date = s.d::date), 0)::bigint,
           coalesce((select sum(pay.amount) from payments pay where (pay.paid_at at time zone v_tz)::date = s.d::date), 0)
      from generate_series((p_from at time zone v_tz)::date, ((p_to - interval '1 second') at time zone v_tz)::date, interval '1 day') as s(d)
     order by 1;
end $$;

create function analytics_revenue_breakdown(p_from timestamptz, p_to timestamptz)
returns table (kind text, label text, amount numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform analytics_guard();
  return query
    select 'method'::text, pay.method::text, sum(pay.amount)
      from payments pay where pay.paid_at >= p_from and pay.paid_at < p_to group by pay.method
    union all
    select 'category'::text, ii.category, sum(ii.amount)
      from invoice_items ii join invoices i on i.id = ii.invoice_id
     where i.created_at >= p_from and i.created_at < p_to group by ii.category;
end $$;

-- consumption per medicine per week (from dispensing movements)
create function analytics_medicine_usage_weekly(p_from timestamptz, p_to timestamptz)
returns table (week date, medicine text, quantity bigint)
language plpgsql stable security definer set search_path = public as $$
declare v_tz text;
begin
  perform analytics_guard();
  select timezone into v_tz from hospital_settings where id = 1;
  return query
    select date_trunc('week', m.created_at at time zone v_tz)::date, md.name, sum(m.quantity)::bigint
      from stock_movements m join medicines md on md.id = m.medicine_id
     where m.movement = 'out' and m.created_at >= p_from and m.created_at < p_to
     group by 1, 2;
end $$;

-- 30/60/90-day dispensing totals + current stock, for demand forecasting and restock advice
create function analytics_medicine_demand()
returns table (medicine_id uuid, name text, category text, unit text, stock int, max_stock int, stock_level text,
               out30 bigint, out60 bigint, out90 bigint, reorder_level int, next_expiry date)
language plpgsql stable security definer set search_path = public as $$
begin
  perform analytics_guard();
  return query
    select s.id, s.name, s.category, s.unit, s.quantity, s.max_stock, s.stock_level::text,
           coalesce(sum(m.quantity) filter (where m.created_at >= now() - interval '30 days'), 0)::bigint,
           coalesce(sum(m.quantity) filter (where m.created_at >= now() - interval '60 days'), 0)::bigint,
           coalesce(sum(m.quantity) filter (where m.created_at >= now() - interval '90 days'), 0)::bigint,
           s.reorder_level, s.next_expiry
      from medicine_stock s
      left join stock_movements m on m.medicine_id = s.id and m.movement = 'out'
     where s.active
     group by s.id, s.name, s.category, s.unit, s.quantity, s.max_stock, s.stock_level, s.reorder_level, s.next_expiry;
end $$;

create function analytics_lab(p_from timestamptz, p_to timestamptz)
returns table (test text, category text, requests bigint, abnormal bigint, avg_turnaround_min numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform analytics_guard();
  return query
    select coalesce(t.name, r.custom_name), coalesce(t.category, 'Custom'), count(*)::bigint,
           count(*) filter (where r.abnormal)::bigint,
           round(avg(extract(epoch from (r.completed_at - r.requested_at)) / 60) filter (where r.completed_at is not null)::numeric, 1)
      from lab_requests r left join lab_tests t on t.id = r.test_id
     where r.requested_at >= p_from and r.requested_at < p_to and r.status <> 'cancelled'
     group by 1, 2 order by 3 desc;
end $$;

create function analytics_imaging(p_from timestamptz, p_to timestamptz)
returns table (modality text, requests bigint, avg_turnaround_min numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform analytics_guard();
  return query
    select coalesce(p.modality, 'Other'), count(*)::bigint,
           round(avg(extract(epoch from (r.completed_at - r.requested_at)) / 60) filter (where r.completed_at is not null)::numeric, 1)
      from imaging_requests r left join imaging_procedures p on p.id = r.procedure_id
     where r.requested_at >= p_from and r.requested_at < p_to and r.status <> 'cancelled'
     group by 1 order by 2 desc;
end $$;

create function analytics_doctors(p_from timestamptz, p_to timestamptz)
returns table (doctor text, consultations bigint, labs_requested bigint, prescriptions bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform analytics_guard();
  return query
    select p.full_name,
           (select count(*) from consultations c where c.doctor_id = p.id and c.created_at >= p_from and c.created_at < p_to)::bigint,
           (select count(*) from lab_requests l where l.requested_by = p.id and l.requested_at >= p_from and l.requested_at < p_to)::bigint,
           (select count(*) from prescriptions r where r.doctor_id = p.id and r.created_at >= p_from and r.created_at < p_to)::bigint
      from profiles p where p.role = 'doctor' order by 2 desc;
end $$;

-- departmental performance indicators (minutes unless stated)
create function analytics_departments(p_from timestamptz, p_to timestamptz)
returns table (department text, metric text, value numeric, unit text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform analytics_guard();
  return query
    select 'Reception'::text, 'Visits registered'::text, count(*)::numeric, 'visits'::text
      from visits where started_at >= p_from and started_at < p_to
    union all
    select 'Triage', 'Average wait for triage',
           coalesce(round(avg(extract(epoch from (t.recorded_at - v.started_at)) / 60)::numeric, 1), 0), 'min'
      from triage_records t join visits v on v.id = t.visit_id where v.started_at >= p_from and v.started_at < p_to
    union all
    select 'Consultation', 'Average wait from triage to doctor',
           coalesce(round(avg(extract(epoch from (c.created_at - t.recorded_at)) / 60)::numeric, 1), 0), 'min'
      from consultations c join triage_records t on t.visit_id = c.visit_id where c.created_at >= p_from and c.created_at < p_to
    union all
    select 'Laboratory', 'Average result turnaround',
           coalesce(round(avg(extract(epoch from (completed_at - requested_at)) / 60)::numeric, 1), 0), 'min'
      from lab_requests where completed_at is not null and requested_at >= p_from and requested_at < p_to
    union all
    select 'Imaging', 'Average report turnaround',
           coalesce(round(avg(extract(epoch from (completed_at - requested_at)) / 60)::numeric, 1), 0), 'min'
      from imaging_requests where status = 'reported' and requested_at >= p_from and requested_at < p_to
    union all
    select 'Pharmacy', 'Average time to dispense',
           coalesce(round(avg(extract(epoch from (dispensed_at - created_at)) / 60)::numeric, 1), 0), 'min'
      from prescriptions where dispensed_at is not null and created_at >= p_from and created_at < p_to
    union all
    select 'Billing', 'Collection rate',
           coalesce(round(sum(paid) * 100.0 / nullif(sum(total), 0), 1), 0), '%'
      from invoices where created_at >= p_from and created_at < p_to and status <> 'cancelled';
end $$;

create function analytics_appointments(p_from timestamptz, p_to timestamptz)
returns table (status text, total bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform analytics_guard();
  return query select a.status::text, count(*)::bigint from appointments a
    where a.starts_at >= p_from and a.starts_at < p_to group by a.status;
end $$;

-- the age/sex mix of patients seen in the period
create function analytics_patient_mix(p_from timestamptz, p_to timestamptz)
returns table (gender text, age_band text, patients bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform analytics_guard();
  return query
    select pt.gender,
           case when pt.age <= 4 then '0-4' when pt.age <= 14 then '5-14' when pt.age <= 24 then '15-24'
                when pt.age <= 44 then '25-44' when pt.age <= 64 then '45-64' else '65+' end,
           count(distinct pt.id)::bigint
      from visits v join patients pt on pt.id = v.patient_id
     where v.started_at >= p_from and v.started_at < p_to group by 1, 2;
end $$;

-- =====================================================================
-- Automatic low-stock / expiry notifications (called daily by the cron worker, service role only)
-- One in-app notification per pharmacist and hospital admin per day.
-- =====================================================================
create function queue_stock_alerts() returns int
language plpgsql security definer set search_path = public as $$
declare v_red int; v_exp int; v_n int := 0; u record; v_body text;
begin
  select count(*) into v_red from medicine_stock where active and stock_level = 'red';
  select count(*) into v_exp from medicine_batches where quantity > 0 and expiry_date <= current_date + 30;
  if v_red = 0 and v_exp = 0 then return 0; end if;
  v_body := v_red || ' item(s) critically low (below 10% of maximum stock); '
         || v_exp || ' batch(es) expired or expiring within 30 days. Open Stock Management for restocking recommendations.';
  for u in select id from profiles where active and role in ('pharmacist','hospital_admin') loop
    if not exists (select 1 from notifications n where n.user_id = u.id and n.title = 'Stock alert' and n.created_at::date = current_date) then
      insert into notifications (user_id, channel, title, body, status, sent_at)
      values (u.id, 'in_app', 'Stock alert', v_body, 'sent', now());
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;
revoke all on function queue_stock_alerts() from public, anon, authenticated;
