// semaphore-agent — the gatekeeper between the scheduled agent and Supabase.
//
// The agent holds one password (AGENT_TOKEN) and nothing else. With it, it can
// do three things and only these three:
//   watchlist  read a trimmed copy of the Semaphore board (no leads), with
//              each arena's `asked` flag: Mark pressed "ask the agent" on it,
//              or its wait wakes tomorrow (see wakeAsk), and the agent has
//              not looked at it since. Each arena's two
//              texts, About and Brokerage, are in it since 2026-10-10, so the
//              nightly agent can offer a short rewrite of either that keeps
//              what is still true in them
//   suggest    add rows to semaphore_inbox
//   checked    record which arenas it has looked at
// It never sees the app's key, so it cannot change the board even by mistake.

import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const S = (v: unknown, max = 500) =>
  v == null || v === "" ? null : String(v).slice(0, max);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const D = (v: unknown) => (typeof v === "string" && ISO.test(v) ? v : null);
const oneOf = (v: unknown, list: string[]) =>
  typeof v === "string" && list.includes(v) ? v : null;
const http = (v: unknown) => {
  const s = S(v, 1000);
  return s && /^https?:\/\//i.test(s) ? s : null;
};

async function watchlist() {
  const { data: row, error } = await db
    .from("app_state").select("data,updated_at").eq("id", "semaphore").single();
  if (error) return json({ error: error.message }, 500);
  const s = (row?.data ?? {}) as any;
  const types = Object.fromEntries(
    (s.types ?? []).map((t: any) => [t.id, t.name]),
  );
  const link = (l: any) => ({ label: l?.label ?? "", url: l?.url ?? "" });
  const arenas = (s.arenas ?? []).map((a: any) => ({
    id: a.id,
    name: a.name,
    type: types[a.typeId] ?? "Untyped",
    tags: a.tags ?? [],
    weight: a.weight ?? "ordinary",
    frozen: !!a.frozenAt,
    links: (a.links ?? []).map(link),
    brokerage_links: (a.brokerage?.links ?? []).map(link),
    arena_info: a.notes ?? "",
    brokerage_info: a.brokerage?.notes ?? "",
    dates: (a.dates ?? []).map((d: any) => ({
      id: d.id, kind: d.kind, label: d.label ?? "", call: d.call ?? "",
      role: d.role ?? "", gran: d.gran, start: d.start, end: d.end,
      grade: d.grade,
      // a brokerage event's own website, once it has one (2026-10-08) — the
      // website catch-up reads this to know which events still need one
      url: d.url ?? "",
    })),
  }));

  const { data: log } = await db
    .from("semaphore_agent_log").select("arena_id,run,checked_at")
    .order("checked_at", { ascending: false }).limit(2000);
  const last: Record<string, string> = {};
  for (const r of log ?? []) last[r.arena_id] ??= r.checked_at;

  const { data: recent } = await db
    .from("semaphore_inbox")
    .select("created_at,kind,arena_id,arena_name,date_kind,label,call,role,gran,start_date,end_date,grade,replaces_date_id,url,note,status")
    .order("created_at", { ascending: false }).limit(300);

  // An ask is a moment on the arena (askAt, written by the app). It stands
  // until the log shows a visit after it — the app reads the same log to put
  // the ring on the card out.
  const askAt: Record<string, string | null> = Object.fromEntries(
    (s.arenas ?? []).map((a: any) => [a.id, a.askAt ?? null]),
  );
  const asked = (id: string) => {
    const at = askAt[id];
    if (!at) return false;
    const seen = last[id];
    return !seen || Date.parse(seen) < Date.parse(at);
  };

  // A card put to sleep until one of its dates (the app's `hold`, which
  // names the date by id) wakes three weeks before that date. Mark wants
  // it to come back with what has changed while it slept, so the day
  // before it wakes counts as an ask made by the wait itself: from the
  // start of that day, in UTC, until the log shows a visit after it, so
  // the first nightly run to see it is the night going into the wake day,
  // Dutch time. Nothing is written for it, which is why the app's ring does
  // not light for it. A frozen arena is left out, since its wait resumes
  // only when it is thawed, and a date already over ends the wait, as in
  // the app.
  const NEAR = 21, DAY = 86400000;
  const today = new Date().toISOString().slice(0, 10);
  const wakeAsk: Record<string, { wakes_on: string; since: string } | null> =
    Object.fromEntries((s.arenas ?? []).map((a: any) => {
      const d = a.hold?.dateId && !a.frozenAt
        ? (a.dates ?? []).find((x: any) => x.id === a.hold.dateId && D(x.start))
        : null;
      if (!d || (D(d.end) ?? d.start) < today) return [a.id, null];
      const wake = Date.parse(d.start + "T00:00:00Z") - NEAR * DAY;
      const since = new Date(wake - DAY).toISOString();
      if (Date.now() < Date.parse(since)) return [a.id, null];
      const seen = last[a.id];
      if (seen && Date.parse(seen) >= Date.parse(since)) return [a.id, null];
      return [a.id, { wakes_on: new Date(wake).toISOString().slice(0, 10), since }];
    }));

  return json({
    board_updated_at: row?.updated_at,
    types: Object.values(types),
    arenas: arenas.map((a: any) => ({
      ...a,
      agent_checked_at: last[a.id] ?? null,
      asked_at: askAt[a.id] ?? null,
      asked: asked(a.id) || !!wakeAsk[a.id],
      // set when the ask is the wait's: the day the card comes back
      wait_wakes_on: wakeAsk[a.id]?.wakes_on ?? null,
    })),
    recent_suggestions: recent ?? [],
  });
}

async function suggest(items: any[], run: string) {
  if (!Array.isArray(items)) return json({ error: "items must be a list" }, 400);
  if (items.length > 40) return json({ error: "at most 40 per call" }, 400);
  const rows: any[] = [];
  const rejected: any[] = [];
  for (const it of items) {
    const kind = oneOf(it.kind, ["date", "link", "arena", "info"]);
    const source_url = http(it.source_url);
    const arena_name = S(it.arena_name, 200);
    const arena_id = kind === "arena" ? null : S(it.arena_id, 100);
    if (!kind || !source_url || !arena_name || (kind !== "arena" && !arena_id)) {
      rejected.push({ item: it, why: "kind, arena_name, source_url and (except for a new arena) arena_id are required" });
      continue;
    }
    const r: any = {
      run, kind, arena_id, arena_name, source_url,
      date_kind: oneOf(it.date_kind, ["brokerage", "call"]),
      label: S(it.label, 200),
      call: S(it.call, 200),
      role: oneOf(it.role, ["announcement", "publication", "deadline"]),
      gran: oneOf(it.gran, ["day", "month", "quarter", "half", "year", "range", "none"]),
      start_date: D(it.start_date),
      end_date: D(it.end_date) ?? D(it.start_date),
      grade: oneOf(it.grade, ["fixed", "uncertain"]),
      replaces_date_id: S(it.replaces_date_id, 100),
      url: http(it.url),
      evidence: S(it.evidence, 600),
      note: S(it.note, 600),
    };
    if (kind === "date") {
      if (!r.date_kind || !r.gran) {
        rejected.push({ item: it, why: "a date needs date_kind and gran" });
        continue;
      }
      // only an exact day or an exact span can ever be called fixed
      if (!(r.gran === "day" || r.gran === "range")) r.grade = "uncertain";
      r.grade ??= "uncertain";
    }
    if (kind === "link" && !r.url) {
      rejected.push({ item: it, why: "a link needs url" });
      continue;
    }
    // An info finding is a whole new text for one of the arena's two texts,
    // which Accept puts in place of the old one: date_kind "call" is its
    // About text, "brokerage" its Brokerage text. The text rides in note. It
    // is refused rather than cut when it is too long, because a rewrite cut
    // off mid-sentence would replace a whole text with half of one.
    if (kind === "info") {
      const text = S(it.note, 5000);
      if (!r.date_kind || !text) {
        rejected.push({ item: it, why: "an info finding needs date_kind (call or brokerage) and note (the new text)" });
        continue;
      }
      if (text.length > 800) {
        rejected.push({ item: it, why: "keep it short: an info text may be at most 800 characters" });
        continue;
      }
      r.note = text;
    }
    const parts = [
      r.kind, r.arena_id ?? r.arena_name.toLowerCase(), r.date_kind, r.label, r.call,
      r.role, r.gran, r.start_date, r.end_date, r.grade, r.url,
    ];
    // Only an info finding adds its text to the fingerprint: two of them for
    // the same arena differ in nothing else, and adding a field to every kind
    // would change the old rows' fingerprints and let them be offered again.
    if (kind === "info") parts.push(r.note);
    r.fingerprint = parts
      .map((x) => (x ?? "").toString().trim().toLowerCase()).join("|");
    rows.push(r);
  }
  let added = 0;
  if (rows.length) {
    const { data, error } = await db
      .from("semaphore_inbox")
      .upsert(rows, { onConflict: "fingerprint", ignoreDuplicates: true })
      .select("id");
    if (error) return json({ error: error.message }, 500);
    added = data?.length ?? 0;
  }
  return json({ added, duplicates: rows.length - added, rejected });
}

async function checked(items: any[], run: string) {
  if (!Array.isArray(items) || items.length > 100) {
    return json({ error: "items must be a list of at most 100" }, 400);
  }
  const rows = items
    .filter((i) => S(i.arena_id, 100))
    .map((i) => ({
      arena_id: S(i.arena_id, 100), run,
      found: Number.isFinite(i.found) ? Math.max(0, Math.floor(i.found)) : 0,
      note: S(i.note, 600),
    }));
  if (!rows.length) return json({ logged: 0 });
  const { error } = await db.from("semaphore_agent_log").insert(rows);
  if (error) return json({ error: error.message }, 500);
  return json({ logged: rows.length });
}

Deno.serve(async (req) => {
  const token = Deno.env.get("AGENT_TOKEN");
  if (!token || req.headers.get("x-agent-token") !== token) {
    return json({ error: "not allowed" }, 401);
  }
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad JSON" }, 400); }
  const run = oneOf(body?.run, ["daily", "weekly"]) ?? "daily";
  switch (body?.action) {
    case "watchlist": return await watchlist();
    case "suggest":   return await suggest(body.items, run);
    case "checked":   return await checked(body.items, run);
    default:          return json({ error: "action must be watchlist, suggest or checked" }, 400);
  }
});
