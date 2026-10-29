// @ts-nocheck
// horizon-check — what the EU Funding & Tenders portal says today about the
// topics of Mark's Horizon Work Programme, kept beside the Work Programme
// file for the Call Board to lay over it, and the portal's own texts of the
// calls on his board that the portal carries.
//
// A plain program, not an agent, for the reason the partner copier is one
// (notes/partner-watch.md): the portal answers a program exactly and in
// full, at no Claude usage, where a reader that summarises would lose the
// very dates it was sent for. It reads the portal's own search service and
// topic pages, and nothing else but two files of Mark's own: the Work
// Programme file the site serves, and the Semaphore's board in this
// database.
//
// What it writes:
//   horizon_topics — one row per Work Programme topic: the portal's dates,
//     status and notices, and how they differ from the Work Programme's
//     (`diff`): '' none, 'dates', 'gone' (the portal no longer has it), or
//     'moved' (gone, and a topic of the same title new to the portal stands
//     in another call, `moved_to`). `changed_at` moves whenever that
//     difference does, which is what makes it glow until Mark's Seen
//     (`seen_at`, the one column his login may change).
//   call_texts — the portal's text of each call on the board whose name
//     carries a portal id, open now or opening within six months, as a find
//     to be judged (`status` 'new'). One already there is left alone, so a
//     text he turned down never comes back.
// The Work Programme file itself is never changed.
//
// Two callers, nobody else: the nightly schedule (9-horizon-check.sql),
// carrying the password from horizon_check_secret in x-check-token; and
// Mark's own login.
//
// Paste all of this into Supabase → Edge Functions → horizon-check → Code →
// Deploy. Leave "Verify JWT" on: the schedule sends the public key, a press
// from the app Mark's session, and the password or the owner check does the
// rest.

import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

// The Work Programme as the site serves it, the file the Call Board reads.
const WP_URL = "https://ben-verheven.github.io/one-app/one-app/data/callboard-topics.js";
const SEARCH = "https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA";
const TOPIC_JSON = "https://ec.europa.eu/info/funding-tenders/opportunities/data/topicDetails/";
const TOPIC_PAGE = "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/";
const TEXT_AHEAD_DAYS = 183;   // a call opening further off than this gets its text later
const PARALLEL = 3;            // questions to the portal at once
const BUDGET_MS = 120_000;     // stop asking for texts after this, well inside the 150 s a function may run
const UA = "Mozilla/5.0 (compatible; OneAppHorizonCheck/1.0; nightly check of Horizon Europe topics for TU/e research support)";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-check-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

// ── the Work Programme ────────────────────────────────────────────────
// The file is `window.__CB_DATA = function(){ return {…}; }`, the object a
// plain JSON one, so it is read as JSON and never run.
export function wpTopics(text) {
  const m = String(text).match(/return\s*(\{[\s\S]*\})\s*;?\s*\}\s*;?\s*$/);
  if (!m) throw new Error("the Work Programme file is not in the shape this reads");
  const data = JSON.parse(m[1]);
  const out = [];
  for (const p of data.pages ?? []) {
    const calls = Object.fromEntries((p.calls ?? []).map((c) => [c.id, c]));
    for (const d of p.destinations ?? []) for (const th of d.themes ?? []) for (const t of th.topics ?? []) {
      const c = calls[p.meta?.[t.id]?.call];
      if (!c) continue;
      out.push({ id: t.id, title: t.title, call: c.id, opening: c.opening ?? null,
                 deadlines: [c.d1, c.twoStage ? c.d2 : null].filter(Boolean) });
    }
  }
  return out;
}

// ── the portal ────────────────────────────────────────────────────────
// Its answers come gzipped and with no length given, and Supabase's
// runtime lost every one of them on the first night (2026-10-29: "error
// reading a body from connection", on all 85 calls and every text), where
// the same questions asked from elsewhere were answered. So every question
// asks for the answer unpacked, which the portal honours, and one that
// still fails is asked twice more after a pause.
async function ask(url, init = {}) {
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { ...init, headers: { "user-agent": UA, "accept-encoding": "identity", ...(init.headers ?? {}) } });
      const text = await r.text();
      return { ok: r.ok, status: r.status, text };
    } catch (e) { last = e; await new Promise((ok) => setTimeout(ok, 1500 * (i + 1))); }
  }
  throw last;
}
// Its search service takes the question as a form. Asked for many calls at
// once it pages unreliably, leaving out about a sixth of the topics while
// repeating others (tried 2026-10-28: 90 of 509 missing, every one of them
// there when asked for by its own id), so it is asked one call at a time,
// and a topic is called gone only once asking for it by its id finds
// nothing too.
async function search(query, text = "*", size = 100, page = 1) {
  const f = new FormData();
  f.append("query", new Blob([JSON.stringify(query)], { type: "application/json" }));
  f.append("languages", new Blob(['["en"]'], { type: "application/json" }));
  const r = await ask(`${SEARCH}&text=${encodeURIComponent(text)}&pageSize=${size}&pageNumber=${page}`,
    { method: "POST", body: f });
  if (!r.ok) throw new Error(`the portal answered ${r.status}`);
  return JSON.parse(r.text).results ?? [];
}
const TOPIC_TYPES = { terms: { type: ["1", "2", "8"] } };
// A deadline is stored by the portal as a moment in UTC: a deadline at
// 17:00 in Brussels on 4 February is "2025-02-03T23:00Z" in winter. The day
// it falls on is Brussels's.
const BXL = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit" });
const day = (s) => (s ? BXL.format(new Date(s)) : null);
function topicOf(r) {
  const m = r.metadata ?? {};
  let notices = [];
  try { notices = JSON.parse(m.latestInfos?.[0] || "[]"); } catch (_) { notices = []; }
  return {
    id: m.identifier?.[0], call: m.callIdentifier?.[0] ?? null, title: (m.title?.[0] ?? "").trim(),
    status: { "31094501": "forthcoming", "31094502": "open", "31094503": "closed" }[m.status?.[0]] ?? (m.status?.[0] ?? null),
    opening: day(m.startDate?.[0]), deadlines: (m.deadlineDate ?? []).map(day),
    notices: notices.map((n) => ({ at: String(n.lastChangeDate ?? "").slice(0, 10), text: plain(n.content ?? "") }))
      .filter((n) => n.text).sort((a, b) => b.at.localeCompare(a.at)),
  };
}
async function pool(items, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}
async function byCall(call) {
  return (await search({ bool: { must: [TOPIC_TYPES, { terms: { callIdentifier: [call] } }] } })).map(topicOf);
}
async function byId(id) {
  const rs = await search({ bool: { must: [TOPIC_TYPES] } }, `"${id}"`, 10);
  return rs.map(topicOf).find((t) => t.id === id) ?? null;
}
async function byTitle(title) {
  return (await search({ bool: { must: [TOPIC_TYPES] } }, `"${title}"`, 20)).map(topicOf);
}

// ── text, as the portal writes it ─────────────────────────────────────
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", hellip: "…", euro: "€", bull: "•" };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
  e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e.toLowerCase()] ?? m));
// Paragraphs as the page breaks them: each block and each list item one
// paragraph, a list item keeping its bullet, the words exactly as written.
export function paragraphs(html) {
  return decode(String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d|tr|ul|ol)>/gi, "\n")
    .replace(/<[^>]+>/g, ""))
    .split("\n").map((l) => l.replace(/[ \t ]+/g, " ").trim()).filter((l) => l && l !== "•");
}
const plain = (html) => paragraphs(html).join(" ");
// The portal's own headings ("Expected Outcome:", "Scope:") head the
// paragraphs after them, as on its page. Only those: any short line ending
// in a colon was taken for one at first, and "Proposals are expected to:"
// stood as a heading over its own list.
const HEADING = /^(expected outcomes?|scope|objectives?|expected impacts?|background|challenge|specific (?:topic )?conditions|eligibility(?: conditions)?|budget|indicative budget|type of action|legal and financial set-up of the grants?)\s*:$/i;
export function sections(html, lead) {
  const out = [];
  let cur = { h: lead ?? "", p: [] };
  for (const l of paragraphs(html)) {
    if (HEADING.test(l)) { if (cur.p.length || cur.h) out.push(cur); cur = { h: l.replace(/:$/, ""), p: [] }; }
    else cur.p.push(l);
  }
  if (cur.p.length) out.push(cur);
  return out.filter((s) => s.p.length);
}

// ── the comparison ────────────────────────────────────────────────────
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
export function differ(wp, portal) {
  if (!portal) return "gone";
  if ((portal.opening && portal.opening !== wp.opening) || (portal.deadlines.length && !same(portal.deadlines, wp.deadlines))) return "dates";
  return "";
}

async function checkTopics(errors) {
  const wpText = await (await fetch(WP_URL, { headers: { "user-agent": UA } })).text();
  const wp = wpTopics(wpText);
  const wpIds = new Set(wp.map((t) => t.id));
  const calls = [...new Set(wp.map((t) => t.call))];
  const found = new Map(), mute = new Set();
  const lists = await pool(calls, (c) => byCall(c).catch((e) => { errors.push(`${c}: ${e.message}`); mute.add(c); return null; }));
  for (const list of lists) for (const t of list ?? []) if (t.id && !found.has(t.id)) found.set(t.id, t);
  // A topic the portal would not answer about stays as it stood: one bad
  // night is not a cancellation. The topics of a call that got no answer
  // are not asked about one by one either, which on a night the portal
  // answers nothing would outlast the time a run is given.
  const failed = new Set(wp.filter((t) => mute.has(t.call)).map((t) => t.id));
  const missing = wp.filter((t) => !found.has(t.id) && !failed.has(t.id));
  for (const [i, t] of (await pool(missing, (t) => byId(t.id).catch(() => undefined))).entries()) {
    if (t) found.set(missing[i].id, t);
    else if (t === undefined) failed.add(missing[i].id);
  }
  const { data: rows } = await db.from("horizon_topics").select("id,diff,opening,deadlines,moved_to,changed_at");
  const before = new Map((rows ?? []).map((r) => [r.id, r]));
  const now = new Date().toISOString();
  const out = [];
  for (const t of wp) {
    if (failed.has(t.id)) continue;
    const p = found.get(t.id) ?? null;
    let diff = differ(t, p), moved = null;
    if (diff === "gone") {
      // moved only when a topic of the same title is new to the portal,
      // not one the Work Programme already lists: a title reused for the
      // next year's call is not a move (three such, 2026-10-28)
      const kin = (await byTitle(t.title).catch(() => []))
        .find((k) => k.id && !wpIds.has(k.id) && k.title.toLowerCase() === t.title.toLowerCase());
      if (kin) { diff = "moved"; moved = kin.id; }
    }
    const was = before.get(t.id);
    const sign = (r) => JSON.stringify([r?.diff ?? "", r?.opening ?? null, r?.deadlines ?? [], r?.moved_to ?? null]);
    const row = {
      id: t.id, call: p?.call ?? t.call, title: p?.title || t.title, status: p?.status ?? null,
      opening: p?.opening ?? null, deadlines: p?.deadlines ?? [], notices: p?.notices ?? [],
      wp_call: t.call, wp_opening: t.opening, wp_deadlines: t.deadlines,
      diff, moved_to: moved, checked_at: now,
    };
    row.changed_at = sign(row) === sign(was) ? (was?.changed_at ?? null) : (diff ? now : null);
    out.push(row);
  }
  for (let i = 0; i < out.length; i += 200) {
    const { error } = await db.from("horizon_topics").upsert(out.slice(i, i + 200));
    if (error) errors.push(error.message);
  }
  const ids = new Set(wp.flatMap((t) => [t.id.toUpperCase(), t.call.toUpperCase()]));
  return { ids, topics: wp.length, changed: out.filter((r) => r.diff === "dates").length,
           gone: out.filter((r) => r.diff === "gone").length, moved: out.filter((r) => r.diff === "moved").length };
}

// ── the texts of the board's calls the portal carries ─────────────────
// A call on the board is matched only by an id of the portal's written in
// its name (a topic's, or a whole call's), never by its words: a wrong
// text is worse than none, and ChatGPT's search for call texts does the
// rest. The clusters' and missions' own calls and topics are left out,
// arena or not, their texts being in the Work Programme already: a
// co-programmed partnership's call on the board is often a cluster's whole
// call (BATT4EU's is HORIZON-CL5-2027-02), and its eleven topics came in as
// one text the reader already holds, topic by topic (2026-10-28).
const ID = /\b(?:HORIZON|DIGITAL|EURATOM)-[A-Z0-9]+(?:-[A-Z0-9]+)*-20\d\d(?:-[A-Z0-9]+)*\b/gi;
const HORIZON_TYPE = /pillar\s*(2|ii)\b|\bclusters?\b|\bmissions?\b/i;
// A Work Programme call named short, without its stage ("HORIZON-CL5-2027-04"
// for HORIZON-CL5-2027-04-Two-Stage), is caught by its shape, as the
// Semaphore's search for call texts catches it (WP_CALL_ID there).
const WP_CALL_ID = /\bHORIZON-(?:CL\d|MISS|HLTH|CID|BRIDGING|NATURE|RAISE)-20\d\d-/i;
export function boardCalls(s, today, wpIds) {
  const types = Object.fromEntries((s.types ?? []).map((t) => [t.id, t.name]));
  const ahead = new Date(Date.parse(today) + TEXT_AHEAD_DAYS * 864e5).toISOString().slice(0, 10);
  const out = new Map();
  for (const a of s.arenas ?? []) {
    if (a.frozenAt || HORIZON_TYPE.test(types[a.typeId] ?? "")) continue;
    const by = new Map();
    for (const d of a.dates ?? []) {
      if (d.kind !== "call" || !d.call) continue;
      for (const id of String(d.call).match(ID) ?? []) {
        const k = id.toUpperCase();
        if (wpIds?.has(k) || WP_CALL_ID.test(k)) continue;
        const g = by.get(k) ?? { call: d.call, ds: [] };
        g.ds.push(d); by.set(k, g);
      }
    }
    for (const [id, g] of by) {
      const ends = g.ds.map((d) => d.end || d.start).filter(Boolean), starts = g.ds.map((d) => d.start).filter(Boolean);
      if (!ends.length || ends.sort().at(-1) < today) continue;
      if (starts.length && starts.sort()[0] > ahead) continue;
      out.set(a.id + "|" + id, { arena_id: a.id, arena: a.name, ident: id, call: g.call });
    }
  }
  return [...out.values()];
}
async function topicText(id) {
  const r = await ask(TOPIC_JSON + id.toLowerCase() + ".json");
  if (!r.ok) return null;
  const t = JSON.parse(r.text).TopicDetails ?? {};
  return { id: t.identifier ?? id, title: (t.title ?? "").trim(), sections: sections(t.description) };
}
async function callTexts(errors, started, wpIds) {
  const { data: row, error } = await db.from("app_state").select("data").eq("id", "semaphore").single();
  if (error) { errors.push("the board: " + error.message); return { texts: 0 }; }
  const today = new Date().toISOString().slice(0, 10);
  const want = boardCalls(row?.data ?? {}, today, wpIds);
  const { data: had } = await db.from("call_texts").select("id");
  const have = new Set((had ?? []).map((r) => r.id));
  let n = 0;
  for (const w of want) {
    if (Date.now() - started > BUDGET_MS) break;
    const id = `portal:${w.arena_id}:${w.ident}`;
    if (have.has(id)) continue;
    try {
      // an id naming one topic is that topic's text; one naming a whole
      // call is every topic in it, each under its own title
      let title = "", secs = [], src = TOPIC_PAGE + w.ident;
      const one = await topicText(w.ident);
      if (one && one.sections.length) { title = one.title; secs = one.sections; }
      else {
        const ts = (await byCall(w.ident)).filter((t) => t.id).sort((a, b) => a.id.localeCompare(b.id));
        if (!ts.length) continue;
        title = w.call;
        for (const t of ts) {
          const x = await topicText(t.id);
          if (!x) continue;
          secs.push({ h: `${x.title} (${x.id})`, p: x.sections.flatMap((s) => (s.h ? [s.h + ":"] : []).concat(s.p)) });
        }
        src = "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-search?callIdentifier=" + w.ident;
      }
      if (!secs.length) continue;
      const { error: e } = await db.from("call_texts").insert({
        id, arena_id: w.arena_id, ident: w.ident, call: w.call, title, sections: secs,
        source: "portal", source_url: src, source_title: "Funding & Tenders portal", read_at: new Date().toISOString(),
      });
      if (e) errors.push(e.message); else n++;
    } catch (e) { errors.push(`${w.ident}: ${e.message}`); }
  }
  return { texts: n };
}

async function run() {
  const started = Date.now(), errors = [];
  const { ids, ...topics } = await checkTopics(errors);
  const texts = await callTexts(errors, started, ids);
  const tally = { ...topics, ...texts };
  // the same failure on many calls is one line, saying on how many
  const same = new Map();
  for (const e of errors) { const why = e.replace(/^[^:]*:\s*/, ""); same.set(why, (same.get(why) ?? []).concat(e)); }
  const said = [...same].map(([why, es]) => es.length > 3 ? `${es.length} questions: ${why}` : es.join("\n")).join("\n");
  await db.from("horizon_check_log").insert({ ...tally, errors: said || null });
  return { ...tally, errors };
}

async function isMark(req) {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return false;
  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data?.user) return false;
  const { data: o } = await db.from("app_owner").select("user_id").eq("user_id", data.user.id).maybeSingle();
  return !!o;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { data: sec } = await db.from("horizon_check_secret").select("token").eq("id", 1).single();
    const given = req.headers.get("x-check-token");
    const byCron = !!(sec?.token && given && given === sec.token);
    if (!byCron && !(await isMark(req))) return json({ error: "not allowed" }, 401);
    return json(await run());
  } catch (err) {
    return json({ error: String(err?.message ?? err) }, 500);
  }
});
