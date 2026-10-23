-- Partner Watch — the partner-search entries of the brokerage sites, copied
-- every night word for word, and what Mark decides about each.
--
-- Paste all of this into Supabase → SQL Editor → New query → Run, AFTER the
-- copier function (8-partner-copier-function.ts) has been made under Edge
-- Functions with the name partner-copier. Safe to run twice.
--
-- Nothing here is read by an agent. The copier is a plain program: it fetches
-- the sites' own pages and stores what they say, so no summary ever stands in
-- for the text. It writes with the server's own key; Mark's login only reads,
-- and answers an entry (opened, interesting / later / bin, why).

-- ── 1. the sites ──────────────────────────────────────────────────────
-- One row per partner-search page. `platform` says which of the copier's
-- three readers fits the page: 'epss' for the proposals.etag.ee sites,
-- 'ptj' for the PtJ "partnering" pages, 'b2match' for a b2match event's
-- marketplace page (its link is the page itself, /e/<event>/components/<n>,
-- as the event's menu gives it, logged in if the event hides it from
-- visitors; for an event still on b2match's older platform, its own
-- address, <event>.b2match.io, and /components/<n> after it where that
-- event runs the newer marketplace). A new site on any of them is
-- a new row here, and its scroll's link is set with the pencil above the
-- arenas on the page; a site on a fourth platform needs a reader of its own in the copier
-- first.
create table if not exists partner_sites (
  id            text primary key,
  name          text not null,
  call          text,
  list_url      text not null,
  platform      text not null check (platform in ('epss','ptj','b2match')),
  active        boolean not null default true,
  sort          integer not null default 0,
  listed_at     timestamptz,          -- when the copier last read the list
  list_count    integer,              -- how many entries that list held
  last_error    text,
  last_error_at timestamptz
);
-- The table was first made allowing only the first two readers, and the
-- `create` above does not change a table that is already there; this does.
-- A venue Mark wants only the news of (2026-10-17): the entries already
-- on its site at the copier's first reading are kept as seen before he
-- watched (`before_watch` on the entry), never copied whole and never shown.
alter table partner_sites add column if not exists new_only boolean not null default false;
-- A venue Mark wants from a first day on (2026-10-17): an entry its site
-- says was posted before `shown_from` is kept the same way, unshown.
alter table partner_sites add column if not exists shown_from date;
alter table partner_sites drop constraint if exists partner_sites_platform_check;
alter table partner_sites add constraint partner_sites_platform_check
  check (platform in ('epss','ptj','b2match'));

insert into partner_sites (id, name, call, list_url, platform, sort) values
  ('sbep',       'Sustainable Blue Economy', 'Sustainable Blue Call 2026',
   'https://proposals.etag.ee/sustainable-blue/2026/partner-search', 'epss', 1),
  ('water4all',  'Water4All',                'Joint call 2026',
   'https://proposals.etag.ee/water4all/2026/partner-search', 'epss', 2),
  ('biodiversa', 'Biodiversa+',              'BiodivFuture call 2026',
   'https://proposals.etag.ee/biodiversa/2026/partner-search', 'epss', 3),
  ('forest',     'Forest Pathways',          'FOREST joint call 2026',
   'https://submission-forest.ptj.de/partnering/list', 'ptj', 4),
  ('dut',        'Driving Urban Transitions', 'DUT Call 2026',
   'https://www.b2match.com/e/dut-call-2026/components/69838', 'b2match', 5),
  ('eppermed',   'EP PerMed',                'JTC 2027, cell and gene therapy',
   'https://www.b2match.com/e/eppermed-partnering/components/49386', 'b2match', 6),
  ('hedigital',  'HE Advanced Digital Tech', 'Horizon Europe 2027, Cluster 4 digital',
   'https://www.b2match.com/e/horizon-europe-advanced-digital-tech/components/71671', 'b2match', 7),
  ('heindustry', 'HE Industry',              'Horizon Europe 2027, Cluster 4 industry',
   'https://www.b2match.com/e/horizon-europe-industry-2027/components/75001', 'b2match', 8),
  ('hehealth',   'Cluster Health',           'Horizon Europe 2027, Cluster 1',
   'https://www.b2match.com/e/cluster-health-horizon-europe-brokerage-2027/components/75073', 'b2match', 9),
  ('greenet',    'GREENET',                  'Horizon Europe 2027, Cluster 5',
   'https://greenet-brokerage-event-2026-calls.b2match.io/', 'b2match', 10),
  ('henature',   'HE Nature',                'Horizon Europe 2027, Nature',
   'https://www.b2match.com/e/horizon-europe-online-matchmaking-nature/components/74659', 'b2match', 11)
on conflict (id) do nothing;
insert into partner_sites (id, name, call, list_url, platform, sort, new_only) values
  ('cl4digital', 'CL4 Digital 2026',         'Horizon Europe, Cluster 4 digital',
   'https://www.b2match.com/e/cl4-digital2026-matchmaking/components/70739', 'b2match', 12, true),
  ('greenettool','GREENET tool',             'Standing partner search',
   'https://greenet-partner-search-tool.b2match.io/components/27120', 'b2match', 13, true)
on conflict (id) do nothing;
insert into partner_sites (id, name, call, list_url, platform, sort, shown_from) values
  ('cluster2',   'Cluster 2 community',      'Standing partner search, entries from 1 September 2026',
   'https://cluster2-community-platform.b2match.io/components/26012', 'b2match', 14, '2026-09-01')
on conflict (id) do nothing;
-- NEB4All's matchmaking platform for the NEB Facility calls (2026-10-22;
-- 50 entries that day, open to anyone). Its Kind says "Consortium seeking
-- partners" and "Partner looking for consortium", which `b2mKind` reads.
insert into partner_sites (id, name, call, list_url, platform, sort) values
  ('neb4all',    'NEB4All',                  'NEB Facility 2026 calls',
   'https://www.b2match.com/e/neb-facility-matchmaking-2026/components/64789', 'b2match', 15)
on conflict (id) do nothing;
-- Two venues Mark had in Active on the Semaphore (2026-10-23), both open to
-- anyone: RADIANCE's MSCA platform (822 entries that day, back to May 2025,
-- so the two-month rule keeps most of them out) and the Bilbao matchmaking
-- for the 2027 battery calls (43). RADIANCE's "Looking for Partner/s" reads
-- as seeking; the battery calls leave Kind empty on nearly every entry, so
-- most come in as neither.
insert into partner_sites (id, name, call, list_url, platform, sort) values
  ('radiance',   'RADIANCE MSCA',            'MSCA 2027, doctoral networks, fellowships, staff exchanges, COFUND',
   'https://www.b2match.com/e/radiance-msca/components/56332', 'b2match', 16),
  ('battery',    'HE Battery Calls',         'Horizon Europe 2027, Cluster 5 batteries',
   'https://www.b2match.com/e/he-2027-battery-calls-matchmaking/components/75308', 'b2match', 17)
on conflict (id) do nothing;
-- Advanced Digital Tech was first given its participant list, component
-- 70907, read off the event while logged out, where its menu is hidden; the
-- copier then answered "list not found" (2026-10-17). The `insert` above
-- leaves a row that is already there alone, so this puts it right.
update partner_sites set list_url = 'https://www.b2match.com/e/horizon-europe-advanced-digital-tech/components/71671'
 where id = 'hedigital' and list_url like '%/components/70907';

-- ── 2. the entries ────────────────────────────────────────────────────
-- One row per entry, its id the site's id and the site's own number. An
-- entry's row is never deleted: one that leaves the site gets `removed_at`,
-- so a binned entry cannot come back as new, and a withdrawn one keeps its
-- text. One two months old and not Marked is put away by the copier: its
-- text goes, its row stays hidden (`before_watch`); see `putAwayOld` there.
create table if not exists partner_entries (
  id          text primary key,             -- '<site>:<number on the site>'
  site        text not null references partner_sites (id),
  ext_id      text not null,
  url         text not null,
  kind        text check (kind in ('seeks','offers')),  -- seeks partners / offers expertise
  contact     text,
  org         text,
  country     text,
  topic       text,
  keywords    text,
  posted      text,                         -- 'YYYY-MM-DD HH:MM': German time on the PtJ sites, UTC on b2match; the others do not say
  list_text   text,                         -- the line the list shows
  fields      jsonb,                        -- the entry page's own [label, value] pairs, in order
  page_text   text,                         -- the entry page's whole text, as copied
  page_hash   text,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  fetched_at  timestamptz,                  -- when the entry page was last copied
  changed_at  timestamptz,                  -- when a copy last differed from the one before
  removed_at  timestamptz,
  needs_fetch boolean not null default true,
  fetch_errors integer not null default 0,
  before_watch boolean not null default false,  -- kept unshown: on its site before Mark watched it (new_only), before shown_from, or two months old
  -- Mark's own columns: the only ones his login may change.
  opened_at   timestamptz,
  verdict     text check (verdict in ('interesting','later','bin')),
  why         text,
  decided_at  timestamptz
);
alter table partner_entries add column if not exists before_watch boolean not null default false;
create index if not exists partner_entries_site_idx  on partner_entries (site, first_seen desc);
create index if not exists partner_entries_fetch_idx on partner_entries (needs_fetch, first_seen);

-- The copy an entry had before it changed. The newest copy is on the entry
-- itself; every older one is kept here, so a change shows what was there.
create table if not exists partner_entry_versions (
  id        bigserial primary key,
  entry_id  text not null references partner_entries (id),
  fields    jsonb,
  page_text text,
  copied_at timestamptz,                    -- when that older copy was taken
  saved_at  timestamptz not null default now()
);
create index if not exists partner_entry_versions_idx on partner_entry_versions (entry_id, saved_at desc);

-- One line per run of the copier, for the page's "last checked" and for
-- finding out why a night went wrong.
create table if not exists partner_watch_log (
  id      bigserial primary key,
  ran_at  timestamptz not null default now(),
  listed  integer not null default 0,
  added   integer not null default 0,
  fetched integer not null default 0,
  changed integer not null default 0,
  removed integer not null default 0,
  waiting integer not null default 0,       -- entry pages still to copy after this run
  errors  text
);

-- The copier's password, made here so nobody has to type one: the nightly
-- schedule below reads it from this table, and so does the copier. No
-- login can read it; only the server's own key and the database itself.
create table if not exists partner_watch_secret (
  id    integer primary key default 1 check (id = 1),
  token text not null default md5(random()::text || clock_timestamp()::text) || md5(random()::text)
);
insert into partner_watch_secret (id) values (1) on conflict (id) do nothing;

-- ── 3. who may do what ────────────────────────────────────────────────
-- Mark's login reads everything but the password and changes only his own
-- four columns on an entry. The bare key, which is public, gets nothing.
-- is_owner() comes from 5-lock-to-owner.sql, which has to have run first.
do $$
declare t text; p record;
begin
  if to_regprocedure('public.is_owner()') is null then
    raise exception 'Run 5-lock-to-owner.sql first: is_owner() is missing. Nothing was changed by this part.';
  end if;
  foreach t in array array['partner_sites','partner_entries','partner_entry_versions',
                           'partner_watch_log','partner_watch_secret'] loop
    execute format('alter table public.%I enable row level security', t);
    for p in select policyname from pg_policies
              where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

grant select on partner_sites, partner_entries, partner_entry_versions, partner_watch_log to authenticated;
grant update (opened_at, verdict, why, decided_at) on partner_entries to authenticated;
create policy "owner reads sites"    on partner_sites          for select to authenticated using (public.is_owner());
create policy "owner reads entries"  on partner_entries        for select to authenticated using (public.is_owner());
create policy "owner answers entry"  on partner_entries        for update to authenticated
  using (public.is_owner()) with check (public.is_owner());
create policy "owner reads versions" on partner_entry_versions for select to authenticated using (public.is_owner());
create policy "owner reads runs"     on partner_watch_log      for select to authenticated using (public.is_owner());

-- ── 4. the night ──────────────────────────────────────────────────────
-- Every ten minutes from 00:00 to 04:50 UTC (01:00–05:50 in winter, 02:00–
-- 06:50 in summer in the Netherlands). The first run of a night reads the
-- lists; every run then copies up to 40 entry pages, so the 800-odd of
-- the first night are all in by morning and later nights finish in a run
-- or two. It costs no Claude usage: this is the database calling the copier.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'partner-watch-copier';
select cron.schedule('partner-watch-copier', '*/10 0-4 * * *', $job$
  select net.http_post(
    url     := 'https://eaaggqydnjkufzajgpzh.supabase.co/functions/v1/partner-copier',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'Authorization',  'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhYWdncXlkbmprdWZ6YWpncHpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2NzEwMjMsImV4cCI6MjA5OTI0NzAyM30.pRQPc-qZWV0wwPPnfQU0I_HzmZZ36xZYIXJQYfQG96g',
      'x-copier-token', (select token from public.partner_watch_secret where id = 1)),
    body    := '{}'::jsonb,
    timeout_milliseconds := 150000);
$job$);

-- ── 5. the check ──────────────────────────────────────────────────────
-- Fourteen sites, the schedule, and rules on every table.
select (select count(*) from partner_sites)                              as sites,
       (select count(*) from cron.job where jobname = 'partner-watch-copier') as scheduled,
       (select bool_and(c.relrowsecurity) from pg_class c
         where c.relname in ('partner_sites','partner_entries','partner_entry_versions',
                             'partner_watch_log','partner_watch_secret'))  as rules_on;
