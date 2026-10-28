-- The Horizon check — what the EU Funding & Tenders portal says today about
-- the topics of Mark's Horizon Work Programme, and the official texts of
-- the calls on his board, each kept in a table of its own beside the Work
-- Programme file, which is never changed. The Call Board lays them over it.
--
-- Paste all of this into Supabase → SQL Editor → New query → Run, AFTER the
-- function (10-horizon-check-function.ts) has been made under Edge
-- Functions with the name horizon-check. Safe to run twice.
--
-- Nothing here is read by an agent. The check is a plain program, as Mark's
-- Place's copier is: it reads the portal's own pages and stores what they
-- say. It writes with the server's own key; Mark's login reads, marks a
-- change seen, judges a text, and adds the texts ChatGPT's search found.

-- ── 1. the Work Programme's topics, as the portal has them ────────────
-- One row per topic of the Work Programme file. `diff` says how the portal
-- differs from the file: '' not at all, 'dates', 'gone' or 'moved' (to
-- `moved_to`). `changed_at` is when that difference last changed, and a
-- topic glows on the Call Board until `seen_at` is later.
create table if not exists horizon_topics (
  id           text primary key,
  call         text,
  title        text,
  status       text,                  -- forthcoming, open or closed, as the portal says
  opening      date,
  deadlines    jsonb not null default '[]',   -- the portal's, one per stage, as 'YYYY-MM-DD'
  notices      jsonb not null default '[]',   -- the portal's "latest information", newest first: {at, text}
  wp_call      text,
  wp_opening   date,
  wp_deadlines jsonb not null default '[]',
  diff         text not null default '',
  moved_to     text,
  checked_at   timestamptz,
  changed_at   timestamptz,
  seen_at      timestamptz             -- Mark's own column: Seen on the Call Board
);

-- ── 2. the official texts of the calls on the board ───────────────────
-- One row per text, judged on the Call Board like any find: 'new' waits,
-- 'kept' is read beside its call, 'no' was turned down and never comes back.
-- The check adds those it reads on the portal (`source` 'portal'); Mark's
-- login adds those ChatGPT's search for call texts found ('chatgpt').
-- A text belongs to an arena and to one of its calls: by the portal id
-- written in the call's name (`ident`), or by the call's name (`call`).
create table if not exists call_texts (
  id           text primary key,
  arena_id     text not null,
  ident        text,
  call         text not null,
  title        text,
  sections     jsonb not null default '[]',   -- [{h: heading, p: [paragraph, …]}], word for word
  source       text not null check (source in ('portal','chatgpt')),
  source_url   text,
  source_title text,
  read_at      timestamptz,
  status       text not null default 'new' check (status in ('new','kept','no')),
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists call_texts_status_idx on call_texts (status, created_at);

-- One line per run, for finding out why a night went wrong.
create table if not exists horizon_check_log (
  id      bigserial primary key,
  ran_at  timestamptz not null default now(),
  topics  integer not null default 0,
  changed integer not null default 0,
  gone    integer not null default 0,
  moved   integer not null default 0,
  texts   integer not null default 0,
  errors  text
);

-- The check's password, made here so nobody has to type one: the nightly
-- schedule below reads it from this table, and so does the check. No
-- login can read it.
create table if not exists horizon_check_secret (
  id    integer primary key default 1 check (id = 1),
  token text not null default md5(random()::text || clock_timestamp()::text) || md5(random()::text)
);
insert into horizon_check_secret (id) values (1) on conflict (id) do nothing;

-- ── 3. who may do what ────────────────────────────────────────────────
-- Mark's login reads everything but the password, marks a topic seen,
-- judges a text and adds ChatGPT's. The bare key, which is public, gets
-- nothing. is_owner() comes from 5-lock-to-owner.sql, which has to have
-- run first.
do $$
declare t text; p record;
begin
  if to_regprocedure('public.is_owner()') is null then
    raise exception 'Run 5-lock-to-owner.sql first: is_owner() is missing. Nothing was changed by this part.';
  end if;
  foreach t in array array['horizon_topics','call_texts','horizon_check_log','horizon_check_secret'] loop
    execute format('alter table public.%I enable row level security', t);
    for p in select policyname from pg_policies
              where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

grant select on horizon_topics, call_texts, horizon_check_log to authenticated;
grant update (seen_at) on horizon_topics to authenticated;
grant insert on call_texts to authenticated;
grant update (status, decided_at) on call_texts to authenticated;
create policy "owner reads topics"  on horizon_topics    for select to authenticated using (public.is_owner());
create policy "owner sees topics"   on horizon_topics    for update to authenticated
  using (public.is_owner()) with check (public.is_owner());
create policy "owner reads texts"   on call_texts        for select to authenticated using (public.is_owner());
create policy "owner adds texts"    on call_texts        for insert to authenticated
  with check (public.is_owner() and source = 'chatgpt' and status = 'new');
create policy "owner judges texts"  on call_texts        for update to authenticated
  using (public.is_owner()) with check (public.is_owner());
create policy "owner reads checks"  on horizon_check_log for select to authenticated using (public.is_owner());

-- ── 4. the night ──────────────────────────────────────────────────────
-- Once a night at 03:23 UTC (04:23 in winter, 05:23 in summer in the
-- Netherlands), after Mark's Place's copier has begun and well before his
-- morning. One run reads every topic and the new texts in about two
-- minutes the first night, and well under one after. It costs no Claude
-- usage: this is the database calling the check.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'horizon-check';
select cron.schedule('horizon-check', '23 3 * * *', $job$
  select net.http_post(
    url     := 'https://eaaggqydnjkufzajgpzh.supabase.co/functions/v1/horizon-check',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhYWdncXlkbmprdWZ6YWpncHpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2NzEwMjMsImV4cCI6MjA5OTI0NzAyM30.pRQPc-qZWV0wwPPnfQU0I_HzmZZ36xZYIXJQYfQG96g',
      'x-check-token', (select token from public.horizon_check_secret where id = 1)),
    body    := '{}'::jsonb,
    timeout_milliseconds := 150000);
$job$);

-- ── 5. the first run, now ─────────────────────────────────────────────
-- So the Call Board has something to lay over the Work Programme today
-- rather than tomorrow. It runs in the background; its line appears in
-- horizon_check_log after a couple of minutes.
select net.http_post(
  url     := 'https://eaaggqydnjkufzajgpzh.supabase.co/functions/v1/horizon-check',
  headers := jsonb_build_object(
    'Content-Type',  'application/json',
    'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhYWdncXlkbmprdWZ6YWpncHpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2NzEwMjMsImV4cCI6MjA5OTI0NzAyM30.pRQPc-qZWV0wwPPnfQU0I_HzmZZ36xZYIXJQYfQG96g',
    'x-check-token', (select token from public.horizon_check_secret where id = 1)),
  body    := '{}'::jsonb,
  timeout_milliseconds := 150000);

-- ── 6. the check ──────────────────────────────────────────────────────
-- The schedule, and rules on every table.
select (select count(*) from cron.job where jobname = 'horizon-check') as scheduled,
       (select bool_and(c.relrowsecurity) from pg_class c
         where c.relname in ('horizon_topics','call_texts','horizon_check_log','horizon_check_secret')) as rules_on;
