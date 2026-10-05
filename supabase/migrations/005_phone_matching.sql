-- =====================================================================
-- DAIMA Health Managing System - forgiving phone match when patients sign up
-- Run this whole file once in the Supabase SQL editor, after 001-004.
--
-- Linking a portal account used to need the phone number typed exactly as
-- reception saved it. Now only the digits count, and 0712 345 678,
-- 0712345678 and +254 712 345 678 all match (last 9 digits compared).
-- The Patient ID must still match exactly.
-- =====================================================================

create or replace function claim_patient_account(p_patient_no text, p_phone text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_pid uuid; v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if char_length(v_digits) < 7 then raise exception 'Enter the phone number you gave at reception'; end if;
  select id into v_pid from patients
   where patient_no = upper(trim(p_patient_no))
     and right(regexp_replace(phone, '\D', '', 'g'), 9) = right(v_digits, 9);
  if v_pid is null then raise exception 'No patient matches that Patient ID and phone number'; end if;
  if exists (select 1 from profiles where patient_id = v_pid and id <> auth.uid()) then
    raise exception 'This patient record is already linked to another account';
  end if;
  perform set_config('app.claiming', '1', true);
  update profiles set patient_id = v_pid where id = auth.uid() and role = 'patient';
  perform set_config('app.claiming', '0', true);
  return v_pid;
end $$;
