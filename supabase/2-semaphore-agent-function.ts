// semaphore-agent — the gatekeeper between the Marketplace agent and Supabase.
//
// The agent holds one password (AGENT_TOKEN) and nothing else. With it, it can
// do only these:
//   board      read the whole Marketplace board but the leads, which stay
//              Mark's: the arenas (their calls, links, About and Brokerage
//              texts) and the venues (the events and partner-search tools he
//              visits, each serving one or more arenas)
//   watchlist  the same, trimmed, with when the agent last looked at each
//              arena and venue, and the suggestions it made lately
//   edit       change the board itself: add, correct and delete call dates;
//              put new venues on the board, marked new until Mark deals
//              with them, and correct and re-date venues, the arenas they
//              serve and their other pages; the arenas' links and their two
//              texts. Where a venue stands (`place`) is Mark's: the agent
//              can delete only a venue still new, its own find, and cannot
//              touch one he removed. It cannot delete an arena, touch an
//              arena's name, type, tags or weight, the types, the leads,
//              Mark's own notes (`memo`) or his visits and rhythm: an op
//              for any of those does not exist.
//   suggest    add rows to semaphore_inbox: a new arena waits there for Mark
//   checked    record which arenas and venues it has looked at
// The board is the Semaphore's until 2026-10-14, when it became the
// Marketplace and was kept around venues (see PROJECT.md). The stored board
// may still carry a brokerage event as a date on an arena, or a tool as a
// link; every read turns those into venues with the very ids the app gives
// them (absorbVenues, a copy of the app's own), so the agent and the app
// never make two copies of one venue.
// Since 2026-10-15 a venue has no kind: every one is a window of activity
// (`opens`, `closes`) with event days inside it or none, and `kind` stays
// "event" on all of them only so that an older copy of this function, which
// wiped a tool's window, wipes nothing.
// It never sees the app's key; what it may change is what `edit` spells out.

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

// ── venues, as the app reads them (semaphore.js, "venues"): kept the same ──
const linkKey0 = (u: unknown) =>
  String(u ?? "").trim().toLowerCase().replace(/^https?:\/\//, "")
    .replace(/^www\./, "").replace(/[#?].*$/, "").replace(/\/+$/, "");
const SHARED_HOSTS = /^(?:b2match\.(?:io|com|eu)|(?:.+\.)?(?:europa\.eu|google\.com|linkedin\.com|youtube\.com|github\.com|eventbrite\.[a-z.]+|meetup\.com|lu\.ma|zoom\.us|microsoft\.com|sharepoint\.com|gov\.pl|horizoneuropencpportal\.eu|eurekanetwork\.org)|proposals\.etag\.ee)$/;
function siteKey(u: unknown): string {
  const k = linkKey0(u), i = k.indexOf("/");
  const host = (i < 0 ? k : k.slice(0, i)).replace(/:\d+$/, "");
  if (!SHARED_HOSTS.test(host)) return host;
  const segs = (i < 0 ? "" : k.slice(i + 1)).split("/").filter((x) => x && !/^[a-z]{2}(?:[-_][a-z]{2})?$/.test(x));
  const e = segs.findIndex((x) => /^(?:e|event|events)$/.test(x));
  return [host].concat(e >= 0 && segs[e + 1] ? segs.slice(0, e + 2) : segs).join("/");
}
function hashKey(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const GOT = ["nothing", "something", "lead"];
const PLACES = ["new", "board", "venues", "gone"];
const PLACES_SINCE = "2026-10-15T19:00:00Z";
const GONE_KEEP = 400;
const todayISO = () => new Date().toISOString().slice(0, 10);
const fixedOk = (g: string) => g === "day" || g === "range";
function tidyVenue(v: any): any {
  if (!v.id) v.id = crypto.randomUUID();
  if (v.kind === "tool") {
    const first = (Array.isArray(v.visits) ? v.visits : []).map((x: any) => x && (x.at || x.id)).filter((x: any) => ISO_DAY.test(x || "")).sort()[0];
    const found = typeof v.foundAt === "string" ? v.foundAt.slice(0, 10) : "";
    if (!ISO_DAY.test(v.opens || "")) v.opens = first || (ISO_DAY.test(found) ? found : todayISO());
    v.gran = "none";
  }
  v.kind = "event";
  if (!PLACES.includes(v.place)) v.place = typeof v.foundAt === "string" && v.foundAt >= PLACES_SINCE ? "new" : "venues";
  if (v.place === "gone") { if (!ISO_DAY.test(v.goneAt || "")) v.goneAt = todayISO(); } else delete v.goneAt;
  v.name = String(v.name ?? "").trim() || "Unnamed venue";
  v.url = typeof v.url === "string" ? v.url.trim() : "";
  v.arenas = [...new Set((Array.isArray(v.arenas) ? v.arenas : []).filter((x: any) => typeof x === "string" && x))];
  if (!Array.isArray(v.pages)) v.pages = [];
  v.pages = v.pages.filter((p: any) => p && typeof p === "object" && p.url);
  v.pages.forEach((p: any) => { if (!p.id) p.id = crypto.randomUUID(); if (typeof p.label !== "string") p.label = ""; });
  const seen = new Set();
  v.visits = (Array.isArray(v.visits) ? v.visits : []).filter((x: any) => x && ISO_DAY.test(x.at || x.id || "")).map((x: any) => {
    const at = x.at || x.id; const o: any = { id: at, at };
    if (GOT.includes(x.got)) o.got = x.got;
    if (typeof x.text === "string" && x.text.trim()) o.text = x.text.trim();
    if (typeof x.leadId === "string" && x.leadId) o.leadId = x.leadId;
    return o;
  }).filter((x: any) => !seen.has(x.at) && seen.add(x.at)).sort((x: any, y: any) => x.at.localeCompare(y.at));
  if (!GRANS.includes(v.gran)) v.gran = v.start ? ((v.end && v.start !== v.end) ? "range" : "day") : "none";
  if (!v.start || v.gran === "none") { v.start = null; v.end = null; if (v.gran !== "none") v.gran = "none"; }
  if (v.start && !v.end) v.end = v.start;
  if (v.start && v.end < v.start) { const e = v.end; v.end = v.start; v.start = e; }
  v.grade = v.grade === "fixed" && fixedOk(v.gran) ? "fixed" : "uncertain";
  for (const k of ["opens", "closes"]) if (!ISO_DAY.test(v[k] || "")) v[k] = null;
  if (v.opens && v.closes && v.closes < v.opens) { const c = v.closes; v.closes = v.opens; v.opens = c; }
  if (!(v.every >= 1 && v.every <= 365)) delete v.every; else v.every = Math.round(v.every);
  if (typeof v.note !== "string") v.note = "";
  if (typeof v.memo === "string" && !v.memo.trim()) delete v.memo;
  if (typeof v.doubt !== "string" || !v.doubt.trim()) delete v.doubt;
  return v;
}
function takeStamps(v: any, x: any) {
  for (const at of [x.stampPrev, x.stampedAt]) {
    if (at && ISO_DAY.test(at) && !v.visits.some((y: any) => y.at === at)) v.visits.push({ id: at, at });
  }
  v.visits.sort((p: any, q: any) => p.at.localeCompare(q.at));
}
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
function absorbVenues(s: any): any {
  if (!Array.isArray(s.venues)) s.venues = [];
  s.venues = s.venues.filter((v: any) => v && typeof v === "object").map(tidyVenue);
  const byId = new Map(s.venues.map((v: any) => [v.id, v])), bySite = new Map();
  for (const v of s.venues) { const k = v.url && siteKey(v.url); if (k && !bySite.has(k)) bySite.set(k, v); }
  const add = (v: any) => { s.venues.push(v); byId.set(v.id, v); const k = v.url && siteKey(v.url); if (k && !bySite.has(k)) bySite.set(k, v); };
  for (const a of s.arenas ?? []) {
    const keep: any[] = [];
    for (const d of a.dates ?? []) {
      if (d.kind === "call") { keep.push(d); continue; }
      const k = d.url && siteKey(d.url);
      let v: any = byId.get(d.id) ?? null;
      if (!v && k) { const w: any = bySite.get(k); if (w && w.kind === "event" && w.start === d.start) v = w; }
      if (v) { if (!v.arenas.includes(a.id)) v.arenas.push(a.id); takeStamps(v, d); if (!v.memo && d.memo) v.memo = d.memo; continue; }
      v = tidyVenue({ id: d.id, kind: "event", name: d.label || "", url: d.url || "", arenas: [a.id],
        gran: d.gran, start: d.start, end: d.end, grade: d.grade, opens: null, closes: null,
        note: d.note || "", memo: d.memo, visits: [], pages: [] });
      if (d.foundAt) v.foundAt = d.foundAt;
      takeStamps(v, d); add(v);
    }
    a.dates = keep;
  }
  for (const a of s.arenas ?? []) {
    const bk = a.brokerage; if (!bk || !Array.isArray(bk.links)) continue;
    const keep: any[] = [];
    for (const l of bk.links) {
      const k = l.url && !/^mailto:/i.test(l.url) && siteKey(l.url);
      let v: any = k ? bySite.get(k) : null;
      if (!v && k && (a.toolId === l.id || l.stampedAt)) {
        const id = "vt" + hashKey(k);
        v = byId.get(id) ?? null;
        if (!v) { v = tidyVenue({ id, kind: "tool", name: l.label || hostOf(l.url) || k, url: l.url, arenas: [], note: "", visits: [], pages: [] });
          if (l.foundAt) v.foundAt = l.foundAt; add(v); }
      }
      if (!v) { keep.push(l); continue; }
      if (!v.arenas.includes(a.id)) v.arenas.push(a.id);
      takeStamps(v, l);
      if (!v.url) v.url = l.url;
      else if (linkKey0(l.url) !== linkKey0(v.url) && !v.pages.some((p: any) => linkKey0(p.url) === linkKey0(l.url))) {
        v.pages.push({ id: l.id, label: l.label || "", url: l.url });
      }
    }
    bk.links = keep;
    delete a.toolId;
  }
  const now = Date.parse(todayISO());
  s.venues = s.venues.filter((v: any) => v.place !== "gone" || now - Date.parse(v.goneAt) <= GONE_KEEP * 86400000);
  return s;
}

async function watchlist() {
  const { data: row, error } = await db
    .from("app_state").select("data,updated_at").eq("id", "semaphore").single();
  if (error) return json({ error: error.message }, 500);
  const s = absorbVenues(structuredClone(row?.data ?? {}));
  const types = Object.fromEntries(
    (s.types ?? []).map((t: any) => [t.id, t.name]),
  );
  const link = (l: any) => ({ label: l?.label ?? "", url: l?.url ?? "" });

  const { data: log } = await db
    .from("semaphore_agent_log").select("arena_id,run,checked_at")
    .order("checked_at", { ascending: false }).limit(3000);
  const last: Record<string, string> = {};
  for (const r of log ?? []) last[r.arena_id] ??= r.checked_at;

  const name: Record<string, string> = Object.fromEntries((s.arenas ?? []).map((a: any) => [a.id, a.name]));
  const arenas = (s.arenas ?? []).map((a: any) => ({
    id: a.id,
    name: a.name,
    type: types[a.typeId] ?? "Untyped",
    tags: a.tags ?? [],
    weight: a.weight ?? "ordinary",
    frozen: !!a.frozenAt,
    links: (a.links ?? []).map(link),
    // what is left on the arena of its brokerage links once the venues are
    // taken out: info pages, last year's pages, and places not yet made venues
    brokerage_links: (a.brokerage?.links ?? []).map(link),
    arena_info: a.notes ?? "",
    brokerage_info: a.brokerage?.notes ?? "",
    calls: (a.dates ?? []).map((d: any) => ({
      id: d.id, call: d.call ?? "", role: d.role ?? "", gran: d.gran,
      start: d.start, end: d.end, grade: d.grade, note: d.note ?? "",
    })),
    agent_checked_at: last[a.id] ?? null,
  }));
  // A venue's visits are Mark's: only the day of the last one is passed on,
  // so the agent can tell a venue he goes to from one he never opens.
  const venues = (s.venues ?? []).map((v: any) => ({
    id: v.id, place: v.place, name: v.name, url: v.url,
    arenas: v.arenas, arena_names: v.arenas.map((id: string) => name[id]).filter(Boolean),
    gran: v.gran ?? null, start: v.start ?? null, end: v.end ?? null, grade: v.grade ?? null,
    opens: v.opens ?? null, closes: v.closes ?? null, note: v.note ?? "", doubt: v.doubt ?? "",
    pages: (v.pages ?? []).map(link),
    last_visit: v.visits.length ? v.visits[v.visits.length - 1].at : null,
    agent_checked_at: last["venue:" + v.id] ?? null,
  }));

  const { data: recent } = await db
    .from("semaphore_inbox")
    .select("created_at,kind,arena_id,arena_name,date_kind,label,call,role,gran,start_date,end_date,grade,replaces_date_id,url,note,status")
    .order("created_at", { ascending: false }).limit(300);

  return json({
    board_updated_at: row?.updated_at,
    types: Object.values(types),
    arenas,
    venues,
    recent_suggestions: recent ?? [],
  });
}

async function suggest(items: any[], run: string) {
  if (!Array.isArray(items)) return json({ error: "items must be a list" }, 400);
  if (items.length > 40) return json({ error: "at most 40 per call" }, 400);
  const rows: any[] = [];
  const rejected: any[] = [];
  for (const it of items) {
    const kind = oneOf(it.kind, ["date", "link", "arena", "info", "tool", "remove"]);
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
    // A tool finding (2026-10-14) names the arena's general tool: for an
    // arena without one, the tool to mark; for one with a tool, its new
    // address, which Accept puts on the same link.
    if ((kind === "link" || kind === "tool") && !r.url) {
      rejected.push({ item: it, why: "a link or a tool needs url" });
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
    // A remove finding (2026-10-14) asks for a date on the board to go, with
    // nothing in its place: replaces_date_id names it, note says why.
    if (kind === "remove" && (!r.replaces_date_id || !r.note)) {
      rejected.push({ item: it, why: "a remove needs replaces_date_id (the date to remove) and note (why)" });
      continue;
    }
    const parts = [
      r.kind, r.arena_id ?? r.arena_name.toLowerCase(), r.date_kind, r.label, r.call,
      r.role, r.gran, r.start_date, r.end_date, r.grade, r.url,
    ];
    // Only an info finding adds its text to the fingerprint, and a remove the
    // date it names: two of them for the same arena differ in nothing else,
    // and adding a field to every kind
    // would change the old rows' fingerprints and let them be offered again.
    if (kind === "info") parts.push(r.note);
    if (kind === "remove") parts.push(r.replaces_date_id);
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
  // a venue is logged as "venue:<its id>", beside the arenas
  const rows = items
    .filter((i) => S(i.arena_id, 100) || S(i.venue_id, 100))
    .map((i) => ({
      arena_id: S(i.arena_id, 100) ?? "venue:" + S(i.venue_id, 100), run,
      found: Number.isFinite(i.found) ? Math.max(0, Math.floor(i.found)) : 0,
      note: S(i.note, 600),
    }));
  if (!rows.length) return json({ logged: 0 });
  const { error } = await db.from("semaphore_agent_log").insert(rows);
  if (error) return json({ error: error.message }, 500);
  return json({ logged: rows.length });
}

// The whole board as the app keeps it, less what is Mark's alone: the leads
// and where the room was looking (`ui`). The venues come whole, his visits
// and note with them, to be read; no op writes either.
async function board() {
  const { data: row, error } = await db
    .from("app_state").select("data,updated_at").eq("id", "semaphore").single();
  if (error) return json({ error: error.message }, 500);
  const s = absorbVenues(structuredClone(row?.data ?? {}));
  return json({
    board_updated_at: row?.updated_at,
    types: s.types ?? [],
    arenas: (s.arenas ?? []).map(({ leads: _l, ...a }: any) => a),
    venues: s.venues,
  });
}

// The same spelling of an address the app compares by (linkKey in
// semaphore.js), so a link already on a card is not added a second time.
const linkKey = (u: unknown) =>
  String(u ?? "").trim().toLowerCase().replace(/^https?:\/\//, "")
    .replace(/^www\./, "").replace(/[#?].*$/, "").replace(/\/+$/, "");
const GRANS = ["day", "month", "quarter", "half", "year", "range", "none"];
const ROLES = ["announcement", "publication", "deadline"];

// A date as the app's own editor would leave it (migrate in semaphore.js):
// both ends set, in order; fixed only for an exact day or span; a call named
// and given a role. `memo`, Mark's own note on an event, and the stamps are
// never written here, so a changed date keeps them.
function shapeDate(d: any, f: any): string | null {
  if ("kind" in f) d.kind = f.kind === "call" ? "call" : "brokerage";
  for (const k of ["label", "call", "note"]) if (k in f) d[k] = S(f[k], 600) ?? "";
  if ("role" in f) d.role = oneOf(f.role, ROLES) ?? "";
  if ("gran" in f) d.gran = oneOf(f.gran, GRANS);
  if ("start" in f) d.start = D(f.start);
  if ("end" in f) d.end = D(f.end);
  if ("grade" in f) d.grade = f.grade === "fixed" ? "fixed" : "uncertain";
  if ("url" in f) {
    if (f.url && !http(f.url)) return "url must start with http:// or https://";
    d.url = http(f.url) ?? "";
  }
  if (!d.gran) return "gran must be one of " + GRANS.join(", ");
  if (d.gran !== "none" && !d.start) return "start must be YYYY-MM-DD";
  if (d.gran === "none") { d.start = null; d.end = null; }
  if (d.start && !d.end) d.end = d.start;
  if (d.start && d.end < d.start) [d.start, d.end] = [d.end, d.start];
  if (!(d.gran === "day" || d.gran === "range")) d.grade = "uncertain";
  d.grade ??= "uncertain";
  if (d.kind === "call") {
    if (!d.call) return "a call date needs call (the call's name)";
    if (!ROLES.includes(d.role)) return "a call date needs role: " + ROLES.join(", ");
  } else d.role = "";
  return null;
}

// A venue's facts as the app's own form would leave them: a name, a site,
// its event days read as a date is read, and its window of activity, the
// stretch its marketplace or tool is open. Mark's note, his visits, his
// rhythm and where the venue stands are never written here, so a changed
// venue keeps them.
function shapeVenue(v: any, f: any): string | null {
  if ("name" in f) v.name = S(f.name, 300) ?? "";
  if ("url" in f) {
    if (f.url && !http(f.url)) return "url must start with http:// or https://";
    v.url = http(f.url) ?? "";
  }
  if ("note" in f) v.note = S(f.note, 600) ?? "";
  // The agent's doubt (Mark, 2026-10-15): when it cannot tell whether a
  // venue still bears on a coming call, it keeps the venue and says why in a
  // few words; the app marks the venue with it until Mark answers. An empty
  // doubt takes the mark off.
  if ("doubt" in f) {
    const d = S(f.doubt, 200);
    if (d) v.doubt = d; else delete v.doubt;
  }
  if ("gran" in f) v.gran = oneOf(f.gran, GRANS);
  if ("start" in f) v.start = D(f.start);
  if ("end" in f) v.end = D(f.end);
  if ("grade" in f) v.grade = f.grade === "fixed" ? "fixed" : "uncertain";
  for (const k of ["opens", "closes"]) {
    if (!(k in f)) continue;
    if (f[k] != null && f[k] !== "" && !D(f[k])) return k + " must be YYYY-MM-DD or null";
    v[k] = D(f[k]);
  }
  v.gran ??= v.start ? "day" : "none";
  if (!GRANS.includes(v.gran)) return "gran must be one of " + GRANS.join(", ");
  if (v.gran !== "none" && !v.start) return "start must be YYYY-MM-DD";
  if (v.opens && v.closes && v.closes < v.opens) return "closes is before opens";
  if (!v.name && !v.url) return "a venue needs a name or a url";
  if (!v.name) v.name = hostOf(v.url);
  return null;
}
function siteTaken(s: any, url: string, but?: string): any {
  const k = url && siteKey(url);
  return k ? (s.venues ?? []).find((v: any) => v.id !== but && v.url && siteKey(v.url) === k) ?? null : null;
}
// One op on a venue of a board read a moment ago, as applyOp below is for
// an arena.
function venueOp(s: any, op: any): any {
  const now = new Date().toISOString();
  const arenaOk = (id: unknown) => (s.arenas ?? []).some((a: any) => a.id === id);
  if (op.op === "add_venue") {
    const f = op.venue ?? {};
    const arenas = (Array.isArray(f.arenas) ? f.arenas : []).filter(arenaOk);
    if (!arenas.length) return { error: "venue.arenas must name at least one arena_id on the board" };
    // Everything the agent finds lands on the board as new (Mark,
    // 2026-10-15); a venue with no event days and no window opens today.
    const v: any = { kind: "event", name: "", url: "", arenas,
      visits: [], pages: [], note: "", foundAt: now, place: "new" };
    const why = shapeVenue(v, f);
    if (why) return { error: why };
    if (!v.start && !v.opens && !v.closes) v.opens = todayISO();
    const dup = siteTaken(s, v.url);
    if (dup?.place === "gone") return { error: "Mark removed that site (" + dup.name + ") on " + dup.goneAt + "; do not bring it back" };
    if (dup) return { error: "that site is already a venue: " + dup.id + " (" + dup.name + "); use add_venue_arena or update_venue" };
    v.id = crypto.randomUUID();
    s.venues.push(tidyVenue(v));
    return { ok: true, venue_id: v.id };
  }
  const v = (s.venues ?? []).find((x: any) => x.id === op.venue_id);
  if (!v) return { error: "venue_id is not on the board" };
  if (v.place === "gone") return { error: "Mark removed that venue; leave it as it is" };
  switch (op.op) {
    case "update_venue": {
      const copy = structuredClone(v);
      const why = shapeVenue(copy, op.set ?? {});
      if (why) return { error: why };
      const dup = copy.url && copy.url !== v.url ? siteTaken(s, copy.url, v.id) : null;
      if (dup) return { error: "that site is already a venue: " + dup.id + " (" + dup.name + ")" };
      Object.assign(v, tidyVenue(copy));
      // Object.assign only adds: a doubt taken off the copy must go here too
      if (!("doubt" in copy)) delete v.doubt;
      return { ok: true };
    }
    // Only a venue still new, the agent's own find that turned out wrong,
    // goes; what Mark has kept or moved to Venues is his to remove.
    case "delete_venue": {
      if (v.place !== "new") return { error: "only a venue still new on the board can be deleted; set its doubt instead and Mark decides" };
      s.venues = s.venues.filter((x: any) => x !== v);
      for (const a of s.arenas ?? []) for (const l of a.leads ?? []) if (l.venueId === v.id) delete l.venueId;
      return { ok: true };
    }
    case "add_venue_arena": {
      if (!arenaOk(op.arena_id)) return { error: "arena_id is not on the board" };
      if (!v.arenas.includes(op.arena_id)) v.arenas.push(op.arena_id);
      return { ok: true };
    }
    case "remove_venue_arena": {
      v.arenas = v.arenas.filter((x: string) => x !== op.arena_id);
      return { ok: true };
    }
    case "add_venue_page": {
      const url = http(op.url);
      if (!url) return { error: "url must start with http:// or https://" };
      if (linkKey(url) === linkKey(v.url) || v.pages.some((p: any) => linkKey(p.url) === linkKey(url))) {
        return { error: "that page is already on the venue" };
      }
      const p = { id: crypto.randomUUID(), label: S(op.label, 200) ?? "", url };
      v.pages.push(p);
      return { ok: true, page_id: p.id };
    }
    case "delete_venue_page": {
      if (!v.pages.some((p: any) => p.id === op.page_id)) return { error: "page_id is not on that venue" };
      v.pages = v.pages.filter((p: any) => p.id !== op.page_id);
      return { ok: true };
    }
    default:
      return { error: "a venue op must be add_venue, update_venue, delete_venue, add_venue_arena, remove_venue_arena, add_venue_page or delete_venue_page" };
  }
}

// One op on one arena of a board read a moment ago. Returns what it did, or
// why not; the board is changed in place only when it succeeds.
function applyOp(s: any, op: any): any {
  if (typeof op?.op === "string" && op.op.includes("venue")) return venueOp(s, op);
  const a = (s.arenas ?? []).find((x: any) => x.id === op?.arena_id);
  if (!a) return { error: "arena_id is not on the board" };
  a.dates ??= [];
  a.links ??= [];
  a.brokerage ??= { notes: "", links: [] };
  a.brokerage.links ??= [];
  const list = op.list === "brokerage" ? a.brokerage.links : a.links;
  const anyLink = (id: unknown) =>
    a.links.find((l: any) => l.id === id) ?? a.brokerage.links.find((l: any) => l.id === id);
  switch (op.op) {
    // An arena's dates are its calls since the Marketplace (2026-10-14): a
    // brokerage event is a venue.
    case "add_date": {
      if ((op.date ?? {}).kind !== "call") return { error: "an arena's dates are calls (kind \"call\"); a brokerage event is a venue: use add_venue" };
      const d: any = { id: crypto.randomUUID(), kind: "call", label: "", call: "", role: "", note: "", url: "" };
      const why = shapeDate(d, op.date ?? {});
      if (why) return { error: why };
      a.dates.push(d);
      return { ok: true, date_id: d.id };
    }
    case "update_date": {
      const d = a.dates.find((x: any) => x.id === op.date_id);
      if (!d) return { error: "date_id is not on that arena" };
      if ((op.set ?? {}).kind && op.set.kind !== "call") return { error: "a brokerage event is a venue: use update_venue" };
      const copy = { ...d };
      const why = shapeDate(copy, op.set ?? {});
      if (why) return { error: why };
      Object.assign(d, copy);
      return { ok: true };
    }
    case "delete_date": {
      if (!a.dates.some((x: any) => x.id === op.date_id)) return { error: "date_id is not on that arena" };
      a.dates = a.dates.filter((x: any) => x.id !== op.date_id);
      // a card waiting for this date waits for nothing now (reconcile in the app)
      if (a.hold?.dateId === op.date_id) a.hold = null;
      return { ok: true };
    }
    case "add_link": {
      const url = http(op.url);
      if (!url) return { error: "url must start with http:// or https://" };
      const k = linkKey(url);
      if (a.links.concat(a.brokerage.links).some((l: any) => linkKey(l.url) === k)) {
        return { error: "that address is already on the arena" };
      }
      const l = { id: crypto.randomUUID(), label: S(op.label, 200) ?? "", url };
      list.push(l);
      return { ok: true, link_id: l.id };
    }
    case "update_link": {
      const l = anyLink(op.link_id);
      if (!l) return { error: "link_id is not on that arena" };
      if ("url" in op) {
        const url = http(op.url);
        if (!url) return { error: "url must start with http:// or https://" };
        l.url = url;
      }
      if ("label" in op) l.label = S(op.label, 200) ?? "";
      return { ok: true };
    }
    case "delete_link": {
      if (!anyLink(op.link_id)) return { error: "link_id is not on that arena" };
      a.links = a.links.filter((l: any) => l.id !== op.link_id);
      a.brokerage.links = a.brokerage.links.filter((l: any) => l.id !== op.link_id);
      if (a.toolId === op.link_id) a.toolId = null;
      return { ok: true };
    }
    // The general tool became a tool venue (2026-10-14).
    case "set_tool":
      return { error: "an arena's tools are venues now: add_venue with its window (opens, closes) and no event days, or add_venue_arena to one already on the board" };
    case "set_text": {
      const v = op.value == null ? "" : String(op.value).trim();
      if (v.length > 2000) return { error: "a text may be at most 2000 characters" };
      if (op.text === "about") a.notes = v;
      else if (op.text === "brokerage") a.brokerage.notes = v;
      else return { error: "text must be about or brokerage" };
      return { ok: true };
    }
    default:
      return { error: "op must be add_date, update_date, delete_date, add_link, update_link, delete_link or set_text, or one of the venue ops" };
  }
}

// The ops are applied to a fresh read of the board, its venues made as the
// app makes them, and written back only if nobody wrote it in between (the
// desk, Pocket); otherwise they are applied again to the newer board. The app then takes the change as it takes
// Pocket's, piece by piece. Every write leaves a copy in app_state_history,
// as the app's own uploads do, so a bad run can be undone from the Ledger's
// cloud panel.
async function edit(ops: any[]) {
  if (!Array.isArray(ops) || !ops.length) return json({ error: "items must be a non-empty list" }, 400);
  if (ops.length > 40) return json({ error: "at most 40 per call" }, 400);
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: row, error } = await db
      .from("app_state").select("data,updated_at").eq("id", "semaphore").single();
    if (error) return json({ error: error.message }, 500);
    const s = absorbVenues(structuredClone(row.data ?? {}));
    const results = ops.map((op) => ({ op: op?.op, arena_id: op?.arena_id, venue_id: op?.venue_id, ...applyOp(s, op) }));
    if (!results.some((r: any) => r.ok)) return json({ results });
    const now = new Date().toISOString();
    const { data: done, error: werr } = await db
      .from("app_state").update({ data: s, updated_at: now })
      .eq("id", "semaphore").eq("updated_at", row.updated_at).select("id");
    if (werr) return json({ error: werr.message }, 500);
    if (!done?.length) continue;
    await db.from("app_state_history")
      .insert({ row_id: "semaphore", data: s, n: (s.arenas ?? []).length, saved_at: now });
    return json({ results, board_updated_at: now });
  }
  return json({ error: "the board kept changing under the edit; try again" }, 409);
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
    case "board":     return await board();
    case "edit":      return await edit(body.items);
    default:          return json({ error: "action must be watchlist, board, suggest, checked or edit" }, 400);
  }
});
