-- =====================================================================
-- DAIMA Health Managing System - stock adjustments and write-offs
-- Run this whole file once in the Supabase SQL editor, after 001-005.
--
-- adjust_stock: correct a batch quantity up or down with a reason
--   (entry error, count correction, damaged...). Logged as an 'adjustment'
--   stock movement whose quantity is the signed change, e.g. -900.
-- write_off_batch: zero an expired batch and log it. Replaces the app doing
--   this in two steps, where the movement row was silently refused because
--   stock_movements has no insert policy for signed-in users.
-- =====================================================================

create function adjust_stock(p_batch uuid, p_new_qty int, p_reason text) returns int
language plpgsql security definer set search_path = public as $$
declare b medicine_batches; v_delta int;
begin
  if not has_role('pharmacist','hospital_admin','system_admin') then raise exception 'Not allowed'; end if;
  p_reason := trim(p_reason);
  if char_length(coalesce(p_reason, '')) < 3 then raise exception 'Give a reason for the adjustment'; end if;
  if p_new_qty is null or p_new_qty < 0 then raise exception 'The new quantity cannot be negative'; end if;

  select * into b from medicine_batches where id = p_batch for update;
  if not found then raise exception 'Batch not found'; end if;
  v_delta := p_new_qty - b.quantity;
  if v_delta = 0 then raise exception 'The quantity is unchanged'; end if;

  update medicine_batches set quantity = p_new_qty where id = p_batch;
  insert into stock_movements (medicine_id, batch_id, movement, quantity, reference, user_id)
  values (b.medicine_id, b.id, 'adjustment', v_delta,
          left('Batch ' || b.batch_no || ': ' || b.quantity || ' → ' || p_new_qty || ' · ' || p_reason, 300), auth.uid());
  return v_delta;
end $$;

create function write_off_batch(p_batch uuid) returns int
language plpgsql security definer set search_path = public as $$
declare b medicine_batches;
begin
  if not has_role('pharmacist','hospital_admin','system_admin') then raise exception 'Not allowed'; end if;
  select * into b from medicine_batches where id = p_batch for update;
  if not found then raise exception 'Batch not found'; end if;
  if b.expiry_date > current_date then raise exception 'Only expired batches can be written off'; end if;
  if b.quantity = 0 then return 0; end if;

  update medicine_batches set quantity = 0 where id = p_batch;
  insert into stock_movements (medicine_id, batch_id, movement, quantity, reference, user_id)
  values (b.medicine_id, b.id, 'expired', b.quantity, 'Write-off batch ' || b.batch_no, auth.uid());
  return b.quantity;
end $$;

revoke all on function adjust_stock(uuid, int, text) from public, anon;
grant execute on function adjust_stock(uuid, int, text) to authenticated;
revoke all on function write_off_batch(uuid) from public, anon;
grant execute on function write_off_batch(uuid) to authenticated;
