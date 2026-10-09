-- One App — taking the lock off again: the undo of 5-lock-to-owner.sql.
--
-- Puts the project back as it was before 2026-10-09: the anon key alone
-- reads and writes the four stores, the history and the two inboxes. Only
-- for an emergency, such as a device that cannot be updated and must sync
-- today. Run 5-lock-to-owner.sql again afterwards; it is safe to repeat.

do $$
declare t text; p record;
begin
  foreach t in array array['app_state','app_state_history','semaphore_inbox',
                           'semaphore_agent_log','atlas_inbox'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    for p in select policyname from pg_policies
              where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
  end loop;
end $$;

grant select, insert, update on app_state to anon, authenticated;
create policy "key reads and writes state" on app_state for all to anon, authenticated
  using (true) with check (true);

grant select, insert on app_state_history to anon, authenticated;
grant usage on sequence app_state_history_id_seq to anon, authenticated;
create policy "key reads history" on app_state_history for select to anon, authenticated using (true);
create policy "key adds history"  on app_state_history for insert to anon, authenticated with check (true);

do $$
begin
  if to_regclass('public.semaphore_inbox') is not null then
    grant select on semaphore_inbox to anon, authenticated;
    grant update (status, decided_at) on semaphore_inbox to anon, authenticated;
    create policy "app reads inbox"   on semaphore_inbox for select using (true);
    create policy "app decides inbox" on semaphore_inbox for update using (true) with check (true);
  end if;
  if to_regclass('public.atlas_inbox') is not null then
    grant select on atlas_inbox to anon, authenticated;
    grant update (status, decided_at) on atlas_inbox to anon, authenticated;
    create policy "app reads atlas inbox"   on atlas_inbox for select using (true);
    create policy "app decides atlas inbox" on atlas_inbox for update using (true) with check (true);
  end if;
  if to_regclass('public.semaphore_agent_log') is not null then
    grant select on semaphore_agent_log to anon, authenticated;
    create policy "app reads log" on semaphore_agent_log for select using (true);
  end if;
end $$;
