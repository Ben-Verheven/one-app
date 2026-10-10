-- Semaphore inbox: where the scheduled agent leaves what it found.
-- Paste all of this into Supabase → SQL Editor → New query → Run.
-- Safe to run twice.

-- One suggestion per row. The agent never writes here itself: the
-- gatekeeper function does, with the server's own key. The app may only
-- read the rows and say "accepted" or "dismissed".
create table if not exists semaphore_inbox (
  id               bigserial primary key,
  created_at       timestamptz not null default now(),
  run              text not null check (run in ('daily','weekly')),
  kind             text not null check (kind in ('date','link','arena','info')),
  arena_id         text,              -- null when kind = 'arena' (a new arena)
  arena_name       text not null,
  date_kind        text check (date_kind in ('brokerage','call')),
  label            text,              -- a brokerage event's name
  call             text,              -- a call's name
  role             text check (role in ('announcement','publication','deadline')),
  gran             text check (gran in ('day','month','quarter','half','year','range','none')),
  start_date       date,
  end_date         date,
  grade            text check (grade in ('fixed','uncertain')),
  replaces_date_id text,              -- set when it corrects a date already on the board
  url              text,              -- the tool or page itself, for kind = 'link' / 'arena'
  source_url       text not null,     -- the page the finding was read from
  evidence         text,              -- the sentence on that page that says so
  note             text,
  fingerprint      text not null unique,  -- the same finding is never suggested twice
  status           text not null default 'new'
                   check (status in ('new','accepted','dismissed')),
  decided_at       timestamptz
);

-- An "info" finding (2026-10-10) is a few sentences for an arena's About
-- text (date_kind 'call') or its Brokerage text (date_kind 'brokerage'),
-- carried in note. A table made before then still holds the three-kind
-- check, so it is swapped here; these two lines alone are what an existing
-- database needs.
alter table semaphore_inbox drop constraint if exists semaphore_inbox_kind_check;
alter table semaphore_inbox add constraint semaphore_inbox_kind_check
  check (kind in ('date','link','arena','info'));

create index if not exists semaphore_inbox_status_idx
  on semaphore_inbox (status, created_at desc);

alter table semaphore_inbox enable row level security;

drop policy if exists "app reads inbox" on semaphore_inbox;
create policy "app reads inbox" on semaphore_inbox
  for select using (true);
drop policy if exists "app decides inbox" on semaphore_inbox;
create policy "app decides inbox" on semaphore_inbox
  for update using (true) with check (true);

-- The app's key may change only the two "decided" columns, and may not
-- add or delete rows.
revoke insert, update, delete on semaphore_inbox from anon, authenticated;
grant select on semaphore_inbox to anon, authenticated;
grant update (status, decided_at) on semaphore_inbox to anon, authenticated;

-- Which arena the agent looked at, and when. This is the agent's own
-- rotation clock, kept apart from the board's sweep, which is Mark's.
-- Only the gatekeeper function writes it; the app may read it (see the
-- policy at the foot of this file).
create table if not exists semaphore_agent_log (
  id         bigserial primary key,
  arena_id   text not null,
  run        text not null check (run in ('daily','weekly')),
  checked_at timestamptz not null default now(),
  found      integer not null default 0,
  note       text
);
create index if not exists semaphore_agent_log_arena_idx
  on semaphore_agent_log (arena_id, checked_at desc);
alter table semaphore_agent_log enable row level security;
revoke all on semaphore_agent_log from anon, authenticated;

-- The app may READ the log (not write it), so the "ask the agent" ring on a
-- card can go out once the agent has looked at that arena. Added 2026-10-06.
drop policy if exists "app reads log" on semaphore_agent_log;
create policy "app reads log" on semaphore_agent_log
  for select using (true);
grant select on semaphore_agent_log to anon, authenticated;
