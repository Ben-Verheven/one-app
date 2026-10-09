-- One App — the lock. After this, the cloud answers only Mark's own login.
--
-- Until 2026-10-09 the project URL and the anon key were the whole of the
-- protection: anyone holding the two could read and rewrite the journal,
-- the boards, the notes and both inboxes. After this script the key alone
-- reads nothing and writes nothing; a request has to carry the session of
-- the one user this project has.
--
-- Run it once, in Supabase → SQL Editor, and only when all three are true:
--   1. Authentication → Sign In / Providers: "Allow new users to sign up" is OFF;
--   2. Authentication → Users holds exactly one user — yours;
--   3. every device you use runs the build with the login, and is logged in.
-- A device still on an older build is refused from that moment on. Nothing
-- on it is lost: its unsent work waits, marked unsent, until it is updated.
--
-- The night agents are not touched by any of this. Their gatekeepers
-- (semaphore-agent, atlas-agent) use the server's own key, which these rules
-- do not apply to.
--
-- To take the lock off again, run 6-unlock.sql.

-- ── 1. who the owner is ───────────────────────────────────────────────
-- Taken from the project itself rather than typed in, so no address is
-- written in this file: it refuses unless there is exactly one user.
create table if not exists app_owner (user_id uuid primary key);
alter table app_owner enable row level security;
revoke all on app_owner from anon, authenticated;

do $$
declare n int;
begin
  select count(*) into n from auth.users;
  if n <> 1 then
    raise exception 'Expected exactly one user under Authentication → Users, found %. Nothing was changed.', n;
  end if;
  delete from app_owner;
  insert into app_owner (user_id) select id from auth.users;
end $$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from app_owner where user_id = auth.uid()) $$;
revoke all on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;

-- ── 2. the history table, in case it was never made ───────────────────
create table if not exists app_state_history (
  id       bigserial primary key,
  row_id   text not null,
  data     jsonb not null,
  n        integer,
  saved_at timestamptz not null default now()
);
create index if not exists app_state_history_row_idx
  on app_state_history (row_id, saved_at desc);

-- The trim keeps the newest twenty of each row. It runs as the table's
-- owner: as the logged-in user it would need permission to delete, which
-- nothing in the browser is given — and before this it ran as the anon
-- role, which had none either, so it may never have trimmed at all.
create or replace function trim_app_state_history() returns trigger as $$
begin
  delete from app_state_history
   where id in (select id from app_state_history
                 where row_id = new.row_id
                 order by saved_at desc
                offset 20);
  return null;
end;
$$ language plpgsql security definer set search_path = public;
drop trigger if exists trim_history on app_state_history;
create trigger trim_history after insert on app_state_history
  for each row execute function trim_app_state_history();

-- ── 3. every table: rules on, old rules out, nothing for the bare key ──
-- Whatever rules these tables had are dropped by what they are, not by
-- name, because the ones on app_state were made by hand and their names
-- were never written down. A table that does not exist is skipped.
do $$
declare t text; p record;
begin
  foreach t in array array['app_state','app_state_history','semaphore_inbox',
                           'semaphore_agent_log','atlas_inbox','atlas_agent_log',
                           'atlas_roster'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table public.%I enable row level security', t);
    for p in select policyname from pg_policies
              where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ── 4. what the owner may do, table by table ──────────────────────────
-- Exactly what the app does and no more: the four stores are read and
-- written whole; history is added to and read; an inbox finding is read
-- and answered; the Semaphore reads its agent's log. Nothing is deleted
-- from the browser anywhere.
grant select, insert, update on app_state to authenticated;
create policy "owner reads state"   on app_state for select to authenticated using (public.is_owner());
create policy "owner adds state"    on app_state for insert to authenticated with check (public.is_owner());
create policy "owner changes state" on app_state for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

grant select, insert on app_state_history to authenticated;
grant usage on sequence app_state_history_id_seq to authenticated;
create policy "owner reads history" on app_state_history for select to authenticated using (public.is_owner());
create policy "owner adds history"  on app_state_history for insert to authenticated with check (public.is_owner());

do $$
begin
  if to_regclass('public.semaphore_inbox') is not null then
    grant select on semaphore_inbox to authenticated;
    grant update (status, decided_at) on semaphore_inbox to authenticated;
    create policy "owner reads inbox"   on semaphore_inbox for select to authenticated using (public.is_owner());
    create policy "owner answers inbox" on semaphore_inbox for update to authenticated
      using (public.is_owner()) with check (public.is_owner());
  end if;
  if to_regclass('public.atlas_inbox') is not null then
    grant select on atlas_inbox to authenticated;
    grant update (status, decided_at) on atlas_inbox to authenticated;
    create policy "owner reads atlas inbox"   on atlas_inbox for select to authenticated using (public.is_owner());
    create policy "owner answers atlas inbox" on atlas_inbox for update to authenticated
      using (public.is_owner()) with check (public.is_owner());
  end if;
  if to_regclass('public.semaphore_agent_log') is not null then
    grant select on semaphore_agent_log to authenticated;
    create policy "owner reads log" on semaphore_agent_log for select to authenticated using (public.is_owner());
  end if;
end $$;

-- ── 5. the check ──────────────────────────────────────────────────────
-- One line per table in the project. After this script every one of them
-- should say rules_on = true and key_alone_can_read = false. A table not
-- named above (one made for another app) is listed but left as it was.
select c.relname                                      as table_name,
       c.relrowsecurity                               as rules_on,
       has_table_privilege('anon', c.oid, 'select')   as key_alone_can_read
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
 order by 1;
