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
  kind             text not null check (kind in ('date','link','arena','info','tool','remove')),
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

-- An "info" finding (2026-10-10) is a short new text to replace an arena's
-- About text (date_kind 'call') or its Brokerage text (date_kind
-- 'brokerage'), carried in note. A "tool" finding (2026-10-14) is an arena's
-- general tool, its address in url. A "remove" finding (2026-10-14 too) asks
-- for the date in replaces_date_id to go, why in note. A table made before either still holds
-- an older check, so it is swapped here; these two lines alone are what an
-- existing database needs.
alter table semaphore_inbox drop constraint if exists semaphore_inbox_kind_check;
alter table semaphore_inbox add constraint semaphore_inbox_kind_check
  check (kind in ('date','link','arena','info','tool','remove'));

create index if not exists semaphore_inbox_status_idx
  on semaphore_inbox (status, created_at desc);

alter table semaphore_inbox enable row level security;

-- Who may read and answer it is not said here but in 5-lock-to-owner.sql:
-- Mark's login reads the rows and changes only the two "decided" columns.
-- This file once granted both to the bare key, and pasting it again for a
-- new kind of finding after the lock (2026-10-09) would have opened the
-- inbox to anyone holding the key, which is public. On a new project, run
-- 5-lock-to-owner.sql after this; it is safe to repeat.

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

-- The app may READ the log (not write it), so an "Ask agent" on a venue or
-- an arena goes out once the agent has looked at it. Added 2026-10-06; the
-- read is granted to Mark's login by 5-lock-to-owner.sql, for the reason
-- given over the inbox.
