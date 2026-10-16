// @ts-nocheck
// partner-copier — copies the brokerage sites' partner-search entries into
// Supabase, word for word, for Partner Watch (partner-watch/index.html).
//
// A plain program, not an agent. Claude's web reader was tried first
// (2026-10-16) and cut each list page off a little past 100,000 characters,
// so a third of Water4All's entries never reached it; it also summarises,
// and a summary is where an entry's details get lost. This reads the sites'
// own HTML and keeps every label and value exactly as the site shows them.
//
// Two callers, nobody else:
//   the nightly schedule (7-partner-watch.sql), carrying the password from
//     partner_watch_secret in the header x-copier-token;
//   Mark's own login, from the page's "Check now" button.
// Each run reads the lists that are due (once a night; on "Check now",
// any not read in the last five minutes), then copies up to PER_RUN entry
// pages: new and changed entries first, then the oldest copies again, so a
// change made on a site without touching its list line is still caught
// within REFRESH_DAYS.
//
// Paste all of this into Supabase → Edge Functions → partner-copier → Code →
// Deploy. Leave "Verify JWT" on: the schedule sends the public key, the page
// sends Mark's session, and the password or the owner check does the rest.

import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const PER_RUN = 40;          // entry pages per run: ~1 s each, inside the 150 s a function may run
const GAP_MS = 400;          // a pause between pages, so a site never sees a burst
const REFRESH_DAYS = 14;     // an entry page is copied again at least this often
const LIST_EVERY_H = 20;     // the nightly runs read each list once
const BUDGET_MS = 110_000;   // stop taking new pages after this, well before the limit
const UA = "Mozilla/5.0 (compatible; PartnerWatch/1.0; nightly copy of public partner-search pages for TU/e research support)";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-copier-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── reading the sites ─────────────────────────────────────────────────
// Tested on all four sites on 2026-10-16 against their live pages: every
// entry of every list, and on three entries per site the label-value pairs
// held all of the page's text. The pages are plain HTML; the "requires
// JavaScript" notice they carry only hides them in a browser.
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", hellip: "…", bull: "•", euro: "€", copy: "©", reg: "®", deg: "°", middot: "·", laquo: "«", raquo: "»", shy: "", szlig: "ß", ordf: "ª", ordm: "º", iexcl: "¡", iquest: "¿", times: "×" };
"Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml Oslash Ugrave Uacute Ucirc Uuml Yacute THORN".split(" ").forEach((n, i) => {
  const c = [192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,216,217,218,219,220,221,222][i];
  ENT[n] = String.fromCharCode(c);
  ENT[n[0].toLowerCase() + n.slice(1)] = String.fromCharCode(c + 32);
});
ENT.yuml = "ÿ"; ENT.aelig = "æ"; ENT.eth = "ð"; ENT.thorn = "þ";
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
  e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1))
  : (ENT[e] ?? ENT[e.toLowerCase()] ?? m));
// A line break the writer typed (<br>) is kept apart from the end of a block
// of the page's own layout: the first copier treated both alike and dropped
// every empty line, which ran a long description's paragraphs together
// (2026-10-16). Now a blank line the writer left stays one blank line, and
// the line breaks of the page's source code count for nothing, as in a browser.
const BR = "\u0001";
const clean = (h) => decode(String(h)
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "")
  .replace(/\s+/g, " ")
  .replace(/<br\s*\/?>/gi, BR)
  .replace(/<\/(p|div|tr|li|h\d|label)>/gi, "\n")
  .replace(/<[^>]+>/g, " "))
  .split("\n")
  .map((block) => block.split(BR).map((l) => l.replace(/[ \t\u00a0]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim())
  .filter(Boolean).join("\n");
// Two copies that differ only in spacing are the same entry: the change of
// the cleaning above alone would otherwise have marked all of them changed.
const flat = (t) => String(t ?? "").replace(/\s+/g, " ").trim();
const one = (h) => clean(h).replace(/\n/g, " ");
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };

function parseEpssList(html, origin) {
  const first = html.indexOf("partner-search-entry/");
  if (first < 0) {
    if (/<table[^>]*>[\s\S]*?<th[^>]*>\s*Contact/i.test(html)) return [];
    throw new Error("list table not found");
  }
  const t = html.lastIndexOf("<table", first);
  const table = html.slice(t, html.indexOf("</table>", t));
  const head = [...table.slice(0, table.indexOf("</thead>")).matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => one(m[1]).toLowerCase());
  const col = (name) => head.findIndex((h) => h.startsWith(name));
  const ci = { contact: col("contact"), looking: col("looking"), country: col("country"), desc: col("description") };
  const out = [];
  for (const r of table.slice(table.indexOf("<tbody")).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    const a = (cells[ci.contact] || "").match(/href="([^"]*partner-search-entry\/(\d+))/);
    if (!a) continue;
    const looking = one(cells[ci.looking] || "").toLowerCase();
    out.push({
      ext_id: a[2], url: origin + decode(a[1]).split("?")[0], contact: one(cells[ci.contact]),
      kind: looking.startsWith("partner") ? "seeks" : looking.startsWith("project") ? "offers" : null,
      looking_raw: looking, country: one(cells[ci.country] || ""), list_text: clean(cells[ci.desc] || ""),
      org: null, topic: null, posted: null, keywords: null,
    });
  }
  return out;
}
function parseEpssDetail(html) {
  const a = html.indexOf('class="epss-content"'), b = html.indexOf('class="do-not-print"', a);
  if (a < 0) throw new Error("entry content not found");
  const region = html.slice(a, b > a ? html.lastIndexOf("<", b) : undefined);
  const fields = [];
  for (const m of region.matchAll(/<td class="text-end[^"]*">([\s\S]*?)<\/td>\s*<td>[\s\S]*?<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi))
    fields.push([one(m[1]).replace(/\s*:$/, ""), clean(m[2])]);
  for (const m of region.matchAll(/<label for=""[^>]*>([\s\S]*?)<\/label>\s*<div[^>]*>([\s\S]*?)<\/div>/gi))
    fields.push([one(m[1]), clean(m[2])]);
  return { fields, text: clean(region.slice(region.indexOf(">") + 1)) };
}
function parsePtjList(html, origin) {
  const out = [];
  const parts = html.split(/<div class="lwps_entry">/i).slice(1);
  if (!parts.length && !/lwps_searchresult/.test(html)) throw new Error("list not found");
  for (const p of parts) {
    const a = p.match(/href="([^"]*lwse_pt_cmd=view&(?:amp;)?id=(\d+))"[^>]*>([\s\S]*?)<\/a>/i);
    if (!a) continue;
    const g = (cls) => { const m = p.match(new RegExp('class="' + cls + '"[^>]*>([\\s\\S]*?)</(?:div|p|span)>', "i")); return m ? clean(m[1]) : null; };
    const type = (g("lwps_searchoroffer") || "").toLowerCase();
    const posted = (g("lwps_date") || "").match(/(\d\d)\.(\d\d)\.(\d{4})\s+(\d\d:\d\d)/);
    out.push({
      ext_id: a[2], url: origin + "/partnering/list?lwse_pt_cmd=view&id=" + a[2], contact: g("lwps_contact"),
      kind: /request/.test(type) ? "seeks" : /offer/.test(type) ? "offers" : null, looking_raw: type,
      country: null, list_text: g("lwps_description"), org: one(a[3]), topic: g("lwps_topic"),
      posted: posted ? `${posted[3]}-${posted[2]}-${posted[1]} ${posted[4]}` : null, keywords: g("lwps_keywords"),
    });
  }
  return out;
}
function parsePtjDetail(html) {
  const a = html.indexOf('class="lwps_headline"'), b = html.indexOf('id="root_footer"', a);
  if (a < 0) throw new Error("entry content not found");
  const region = html.slice(a, b > a ? html.lastIndexOf("<", b) : undefined);
  const fields = [];
  for (const m of region.matchAll(/<label class="lwps_label">([\s\S]*?)<\/label>\s*<div class="(?:lwps_value|view_description)">([\s\S]*?)<\/div>/gi))
    fields.push([one(m[1]).replace(/\s*:$/, ""), clean(m[2])]);
  return { fields, text: clean(region.slice(region.indexOf(">") + 1)).replace(/^Requests and Offers\nBack to list\n/, "") };
}
const PARSERS = { epss: { list: parseEpssList, detail: parseEpssDetail }, ptj: { list: parsePtjList, detail: parsePtjDetail } };

// ── the run ───────────────────────────────────────────────────────────

async function get(url) {
  const r = await fetch(url, {
    headers: { "user-agent": UA, accept: "text/html" },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} from ${url}`);
  return await r.text();
}

// Everything of one kind, a thousand rows at a time: the database hands out
// no more than that per request, and Water4All alone is close to 300.
async function all(q) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q().range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}
const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

// The few columns the page lists by, taken from the entry page's own labels.
// The labels differ per site (Water4All has "Topics", Biodiversa+
// "Disciplines", PtJ "Name of Organisation/Institution/Company"), so each
// column takes the first label it recognises; nothing is lost when none
// fits, because `fields` keeps every pair.
const PICK = {
  org: ["organisation name", "name of organisation/institution/company"],
  country: ["country"],
  topic: ["topic", "topics", "priority areas", "disciplines"],
  keywords: ["keywords"],
  contact: ["contact name"],
};
function picked(fields) {
  const out = {};
  for (const [col, names] of Object.entries(PICK)) {
    const f = fields.find(([l]) => names.includes(l.toLowerCase()));
    if (f && f[1]) out[col] = f[1].replace(/\n/g, " ").slice(0, 2000);
  }
  return out;
}

async function readList(site, now) {
  const origin = new URL(site.list_url).origin;
  const rows = PARSERS[site.platform].list(await get(site.list_url), origin);
  // An empty list is far more likely a page the reader no longer
  // understands than a site that emptied overnight. Taken at its word it
  // would mark every entry removed, so it stops here and says so instead.
  if (!rows.length) throw new Error("the list came back empty; the site may have changed its page");

  const have = new Map((await all(() =>
    db.from("partner_entries").select("id, list_text, removed_at").eq("site", site.id).order("id")
  )).map((e) => [e.id, e]));

  const added = [], changed = [], seen = [], ids = new Set();
  for (const r of rows) {
    const id = `${site.id}:${r.ext_id}`;
    if (ids.has(id)) continue;
    ids.add(id);
    // Only what the list actually says: a null here would wipe the
    // organisation or country the entry page already gave.
    const base = { site: site.id, ext_id: r.ext_id, url: r.url };
    for (const k of ["kind", "contact", "org", "country", "topic", "keywords", "posted", "list_text"])
      if (r[k] != null && r[k] !== "") base[k] = r[k];
    const old = have.get(id);
    if (!old) added.push({ id, ...base, first_seen: now, last_seen: now, needs_fetch: true });
    else if ((old.list_text ?? "") !== (r.list_text ?? "") || old.removed_at)
      changed.push({ id, ...base, last_seen: now, removed_at: null, needs_fetch: true });
    else seen.push(id);
  }
  const gone = [...have.values()].filter((e) => !ids.has(e.id) && !e.removed_at).map((e) => e.id);

  for (const c of chunks(added, 200)) {
    const { error } = await db.from("partner_entries").insert(c);
    if (error) throw error;
  }
  for (const e of changed) {
    const { id, ...rest } = e;
    const { error } = await db.from("partner_entries").update(rest).eq("id", id);
    if (error) throw error;
  }
  for (const c of chunks(seen, 150)) {
    const { error } = await db.from("partner_entries").update({ last_seen: now }).in("id", c);
    if (error) throw error;
  }
  for (const c of chunks(gone, 150)) {
    const { error } = await db.from("partner_entries").update({ removed_at: now }).in("id", c);
    if (error) throw error;
  }
  await db.from("partner_sites").update({
    listed_at: now, list_count: ids.size, last_error: null, last_error_at: null,
  }).eq("id", site.id);
  return { listed: ids.size, added: added.length, removed: gone.length };
}

async function copyEntry(e, platform, now) {
  const p = PARSERS[platform].detail(await get(e.url));
  if (!p.text) throw new Error("the entry page had no text");
  const h = hash(flat(p.text));
  const upd = {
    ...picked(p.fields), fields: p.fields, page_text: p.text, page_hash: h,
    fetched_at: now, needs_fetch: false, fetch_errors: 0,
  };
  let changed = false;
  if (e.page_text != null && flat(e.page_text) !== flat(p.text)) {
    // The copy it had goes into the history before the new one replaces it.
    const { error } = await db.from("partner_entry_versions").insert({
      entry_id: e.id, fields: e.fields, page_text: e.page_text, copied_at: e.fetched_at,
    });
    if (error) throw error;
    upd.changed_at = now;
    changed = true;
  }
  const { error } = await db.from("partner_entries").update(upd).eq("id", e.id);
  if (error) throw error;
  return changed;
}

async function run(byMark) {
  const t0 = Date.now(), now = new Date().toISOString();
  const tally = { listed: 0, added: 0, fetched: 0, changed: 0, removed: 0, waiting: 0 };
  const errors = [];

  const { data: sites, error } = await db.from("partner_sites").select("*").eq("active", true).order("sort");
  if (error) throw error;
  const platformOf = Object.fromEntries(sites.map((s) => [s.id, s.platform]));
  const dueAfter = Date.now() - (byMark ? 5 * 60_000 : LIST_EVERY_H * 3_600_000);

  for (const s of sites) {
    if (s.listed_at && Date.parse(s.listed_at) > dueAfter) continue;
    try {
      const r = await readList(s, now);
      tally.listed += r.listed; tally.added += r.added; tally.removed += r.removed;
    } catch (err) {
      errors.push(`${s.name}: ${err.message ?? err}`);
      await db.from("partner_sites").update({ last_error: String(err.message ?? err).slice(0, 500), last_error_at: now }).eq("id", s.id);
    }
  }

  const cols = "id, site, url, page_hash, fields, page_text, fetched_at, fetch_errors";
  const active = Object.keys(platformOf);
  const { data: due } = await db.from("partner_entries").select(cols)
    .eq("needs_fetch", true).is("removed_at", null).in("site", active)
    .order("first_seen").order("id").limit(PER_RUN);
  let queue = due ?? [];
  if (queue.length < PER_RUN) {
    const { data: stale } = await db.from("partner_entries").select(cols)
      .eq("needs_fetch", false).is("removed_at", null).in("site", active)
      .lt("fetched_at", new Date(Date.now() - REFRESH_DAYS * 86_400_000).toISOString())
      .order("fetched_at").limit(PER_RUN - queue.length);
    queue = queue.concat(stale ?? []);
  }

  for (const e of queue) {
    if (Date.now() - t0 > BUDGET_MS) break;
    try {
      if (await copyEntry(e, platformOf[e.site], now)) tally.changed++;
      tally.fetched++;
    } catch (err) {
      // Three failures in a row and the entry waits for its fortnightly
      // turn instead of blocking the front of the queue every night.
      const n = (e.fetch_errors ?? 0) + 1;
      await db.from("partner_entries").update({ fetch_errors: n, needs_fetch: n < 3 }).eq("id", e.id);
      if (errors.length < 10) errors.push(`${e.id}: ${err.message ?? err}`);
    }
    await sleep(GAP_MS);
  }

  const { count } = await db.from("partner_entries").select("id", { count: "exact", head: true })
    .eq("needs_fetch", true).is("removed_at", null);
  tally.waiting = count ?? 0;
  await db.from("partner_watch_log").insert({ ...tally, errors: errors.length ? errors.join("\n") : null });
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
    const { data: sec } = await db.from("partner_watch_secret").select("token").eq("id", 1).single();
    const given = req.headers.get("x-copier-token");
    const byCron = !!(sec?.token && given && given === sec.token);
    const byMark = !byCron && await isMark(req);
    if (!byCron && !byMark) return json({ error: "not allowed" }, 401);
    return json(await run(byMark));
  } catch (err) {
    return json({ error: String(err?.message ?? err) }, 500);
  }
});
