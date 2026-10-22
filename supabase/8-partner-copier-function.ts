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
// For the b2match events that show their entries only to participants, add
// two secrets under Edge Functions → Secrets: B2MATCH_EMAIL and
// B2MATCH_PASSWORD, his b2match login. They live there and nowhere else:
// this repository is public.

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
const MAX_AGE_MONTHS = 2;    // an entry this old is put away and never copied; see `tooOld`
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
// b2match (www.b2match.com/e/<event>) is a different kind of site: its
// pages are drawn in the browser, and a list page carries only its first
// twenty entries, so the list and each entry are asked of the site's own
// data service instead, the list fifty at a time, which is what its page
// does when scrolled. Most events show their marketplace to anyone (DUT
// Call 2026's 390 entries, 2026-10-17). Some show it only to registered
// participants (EP PerMed's): there the service answers "not
// authenticated" (or "not found"), and the copier then logs in as Mark, once a run, with the address and
// password kept in the function's secrets B2MATCH_EMAIL and
// B2MATCH_PASSWORD, and asks again. So a new b2match site, open or not, is
// only a new row in partner_sites, as long as Mark is registered for it.
// Tested on both events on 2026-10-17.
const B2M_API = "https://www.b2match.com/b2md-api/v4/query";
const B2M_ENTRY = `id title type createdAt updatedAt shortDescription description
  author{... on Participant{organisationName location{city country{name}} user{firstName lastName jobPosition}}}
  elements{widget{subtype} value{... on MarketplaceClassifierConnection{nodes{name}}}}`;
const B2M_LIST = `query($e:String!,$p:URI!,$a:String,$f:Int!,$o:OpportunityOrderBy){eventByEuidV2(euid:$e){... on Event{routeByPath(path:$p){__typename
  ... on OpportunitiesRoute{opportunitiesV2(filters:{orderBy:$o},page:{first:$f,after:$a}){pageInfo{hasNextPage endCursor} nodes{${B2M_ENTRY}}}}}}}}`;
const B2M_ONE = `query($e:String!,$p:URI!){eventByEuidV2(euid:$e){... on Event{routeByPath(path:$p){__typename
  ... on OpportunityRoute{opportunity{${B2M_ENTRY}}}}}}}`;
const B2M_LOGIN = `mutation($i:ID!,$m:String!,$w:String!){login(input:{eventId:$i,email:$m,password:$w}){__typename
  ... on LoginSuccessPayload{payload{token}} ... on LoginFailurePayload{reason{... on Reason{message}}}}}`;
// The descriptions are written in Markdown, which the site turns into bold
// and lists on screen; the marks themselves are taken out here, so the text
// reads as the site shows it, and a link keeps its address beside its words.
const unmark = (t) => {
  let s = String(t ?? "").replace(/\r/g, "")
    .replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (m, w, u) => (!w || u.replace(/^(https?:\/\/|mailto:)/, "").replace(/\/$/, "") === w.replace(/^(https?:\/\/)/, "").replace(/\/$/, "") ? u.replace(/^mailto:/, "") : `${w} (${u.replace(/^mailto:/, "")})`))
    .replace(/\*\*([\s\S]*?)\*\*/g, "$1").replace(/__([^_\n]+)__/g, "$1")
    .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=$|[\s).,;:!?])/gm, "$1$2")
    .replace(/^[ \t]*[*+-][ \t]+/gm, "• ").replace(/^#{1,6}[ \t]+/gm, "")
    .replace(/\\([\\`*_{}\[\]()#+\-.!>])/g, "$1")
    .split("\n").map((l) => l.replace(/[ \t ]+/g, " ").trim()).join("\n");
  // The site's editor leaves an empty line between the points of a list.
  for (let p; p !== s;) { p = s; s = s.replace(/^(• .*)\n\n(?=• )/gm, "$1\n"); }
  return s.replace(/\n{3,}/g, "\n\n").trim();
};
// The number inside the site's id ("ParticipationOpportunity:244594"),
// which counts upwards as entries are made, like the other platforms'.
const b2mNumber = (id) => (atob(id).match(/(\d+)$/) || [])[1];
// A date as the site gives it, in UTC, as 'YYYY-MM-DD HH:MM'.
const b2mWhen = (t) => t ? String(t).replace("T", " ").slice(0, 16) : null;
// Seeks or offers, from the event's own words for it, which differ per
// event and sit under Kind (DUT), Stage (EP PerMed) or Need (the Cluster 2
// community platform: "Partners for an existing consortium" and "A
// consortium to join as partner"); one that says both
// counts as seeking. The Horizon Europe brokerages say "Consortium seeks
// Partners" (CL4 Digital "partner(s)") and "Partner seeks Consortium"
// (Nature "Coordinator looking for partners" and "Partner looking for
// consortium"), and give an offer of expertise the type Expertize, spelt so.
const b2mKind = (g, type) => {
  const said = `${g.Kind ?? ""} ${g.Stage ?? ""} ${g.Need ?? ""}`;
  return /looking for (an? )?(additional )?partners?|seeking partners|seeks partner|partners for an existing/i.test(said) || /request/i.test(type) ? "seeks"
    : /looking to join|contribute .*with my expertise|offer|seeks consortium|looking for (an? )?consortium|consortium to join/i.test(said) || /experti[sz]e|service|product/i.test(type) ? "offers" : null;
};
const b2mGroups = (elements) => {
  const out = {};
  for (const el of elements ?? []) {
    const sub = String(el?.widget?.subtype ?? "").split("::").pop();
    if (/^(Kind|Need|Topic|Stage|Call)$/.test(sub)) out[sub] = (el.value?.nodes ?? []).map((c) => c?.name).filter(Boolean).join("; ");
  }
  return out;
};
async function b2mPost(query, variables, token, api = B2M_API) {
  const r = await fetch(api, {
    method: "POST",
    headers: { "user-agent": UA, "content-type": "application/json", accept: "application/json",
               ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} from ${api}`);
  const d = await r.json();
  if (d.errors?.length) throw Object.assign(new Error(d.errors[0].message), { fromSite: true });
  return d.data;
}
// The login of this run, per event: null for an event that showed its
// marketplace without one.
const b2mTokens = new Map();
async function b2mLogin(euid) {
  const email = Deno.env.get("B2MATCH_EMAIL"), password = Deno.env.get("B2MATCH_PASSWORD");
  if (!email || !password)
    throw new Error("this marketplace is shown only to registered participants, and the copier has no b2match login (the secrets B2MATCH_EMAIL and B2MATCH_PASSWORD)");
  const id = (await b2mPost(`query($e:String!){eventByEuidV2(euid:$e){... on Event{id}}}`, { e: euid }))?.eventByEuidV2?.id;
  if (!id) throw new Error(`no b2match event called ${euid}`);
  const r = (await b2mPost(B2M_LOGIN, { i: String(id), m: email, w: password }))?.login;
  if (!r?.payload?.token) throw new Error(`the b2match login was refused: ${r?.reason?.message ?? "no reason given"}`);
  b2mTokens.set(euid, r.payload.token);
}
// One route of an event, asked first as a visitor and, when the event hides
// it from visitors, again logged in.
async function b2mRoute(euid, query, variables) {
  for (;;) {
    const known = b2mTokens.has(euid), token = b2mTokens.get(euid);
    const route = (await b2mPost(query, variables, token))?.eventByEuidV2?.routeByPath;
    if (!/^(NotAuthenticated|NotFound)Route$/.test(route?.__typename)) return route;
    if (token) throw new Error("not shown on b2match even logged in; is Mark registered for this event, and is the link right?");
    if (known) throw new Error("not shown on b2match to visitors any more; it may need a login");
    await b2mLogin(euid);
  }
}
const b2mWhere = (url) => { const [, euid, ...rest] = new URL(url).pathname.split("/").filter(Boolean); return { euid, path: rest.join("/") }; };
// The list's pages, from whichever data service asks them: `ask` gives the
// page after a cursor, `link` an entry's address on the site.
//
// One broken entry stops the site's own list at the page it is on: CL4
// Digital's 659 (2026-10-17) answered "finding participation opportunity …
// failed: key not found" past the 450th, newest first, an entry the site
// still counts but can no longer find. So a page that fails is asked again
// one entry at a time up to the broken one, and the list is then read
// again from the other end, oldest first, up to it from that side: every
// entry but the broken one comes in. The broken one is simply missing, as
// it is on the site.
async function b2mPages(ask, link) {
  const out = [], ids = new Set();
  let broken = null;
  for (const order of ["NEWEST", "OLDEST"]) {
    broken = null;
    for (let after = null, first = 50, n = 0; ; n++) {
      if (n > 300) throw new Error("the list did not end after 5,000 entries");
      let o;
      try {
        o = await ask(after, first, order);
      } catch (err) {
        if (!err.fromSite) throw err;
        if (first > 1) { first = 1; continue; }
        broken = err;
        break;
      }
      for (const x of o.nodes) {
        const ext = b2mNumber(x.id);
        if (!ext || ids.has(ext)) continue;
        ids.add(ext);
        const g = b2mGroups(x.elements);
        const who = `${x.author?.user?.firstName ?? ""} ${x.author?.user?.lastName ?? ""}`.trim();
        out.push({
          ext_id: ext, url: link(x.id), contact: who || null,
          kind: b2mKind(g, x.type), looking_raw: g.Kind ?? g.Need ?? "",
          country: x.author?.location?.country?.name ?? null, org: x.author?.organisationName || null,
          topic: g.Topic || null, keywords: null, posted: b2mWhen(x.createdAt),
          list_text: [x.title, x.shortDescription].map(flat).filter(Boolean).join("\n"),
        });
      }
      if (!o.pageInfo?.hasNextPage || !o.pageInfo.endCursor) break;
      after = o.pageInfo.endCursor;
      if (first > 1) await sleep(GAP_MS);
    }
    if (!broken) return out;
  }
  if (!out.length) throw broken;
  return out;
}
async function fetchB2mList(site) {
  const { euid, path } = b2mWhere(site.list_url), origin = new URL(site.list_url).origin;
  return b2mPages(async (a, f, o) => {
    const route = await b2mRoute(euid, B2M_LIST, { e: euid, p: path, a, f, o });
    // An open event is remembered as open, so its entries are never asked
    // logged in.
    if (!b2mTokens.has(euid)) b2mTokens.set(euid, null);
    if (!route?.opportunitiesV2) throw new Error("list not found");
    return route.opportunitiesV2;
  }, (id) => `${origin}/e/${euid}/opportunities/${id}`);
}
async function fetchB2mEntry(url) {
  const { euid, path } = b2mWhere(url);
  return b2mEntry((await b2mRoute(euid, B2M_ONE, { e: euid, p: path }))?.opportunity);
}
function b2mEntry(o) {
  if (!o || o.description == null) throw new Error("entry content not found");
  const who = o.author ?? {}, user = who.user ?? {}, loc = who.location ?? {}, g = b2mGroups(o.elements);
  const fields = [
    ["Title", flat(o.title)],
    ["Looking for", g.Kind ?? g.Need ?? ""],
    ["Short description", flat(o.shortDescription)],
    ["Description", unmark(o.description)],
    ["Topic", g.Topic ?? ""],
    ["Call", g.Call ?? ""],
    ["Stage", g.Stage ?? ""],
    ["Contact name", `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()],
    ["Job position", flat(user.jobPosition)],
    ["Organisation name", flat(who.organisationName)],
    ["City", flat(loc.city)],
    ["Country", flat(loc.country?.name)],
    ["Last updated on the site", b2mWhen(o.updatedAt) ?? ""],
  ];
  return { fields, text: fields.filter(([, v]) => v).map(([l, v]) => `${l}\n${v}`).join("\n\n") };
}
// An event b2match calls "v6" runs its newer marketplace on an address of
// its own (<event>.b2match.io/components/<n>), and the data service at
// www.b2match.com refuses it ("a v6 event, served on its own website").
// The same service answers on the event's own address, at /api/v4/query,
// asked by the event's number and the page's instead of their names: the
// GREENET Partner Search Tool's Projects were the first (2026-10-17, 576
// entries, shown to anyone; Mark knew them as Projects, which is the page's
// name there). An entry's page is /marketplace/opportunities/<id>.
const V6_LIST = `query($i:ID!,$r:ID!,$a:String,$f:Int!,$o:OpportunityOrderBy){event(id:$i){route(id:$r){__typename
  ... on OpportunitiesRoute{opportunitiesV2(filters:{orderBy:$o},page:{first:$f,after:$a}){pageInfo{hasNextPage endCursor} nodes{${B2M_ENTRY}}}}}}}`;
const V6_ONE = `query($i:ID!,$id:CompositeID!){event(id:$i){opportunity(id:$id){${B2M_ENTRY}}}}`;
const isV6 = (url) => new URL(url).hostname.endsWith(".b2match.io") && /^\/(components\/\d+|marketplace\/opportunities\/)/.test(new URL(url).pathname);
const v6Events = new Map();
async function v6Event(origin) {
  if (!v6Events.has(origin)) {
    const id = ((await get(origin + "/marketplace")).match(/EventID\s*=\s*(\d+)/) || [])[1];
    if (!id) throw new Error("the event's number was not found on its marketplace page");
    v6Events.set(origin, id);
  }
  return v6Events.get(origin);
}
async function fetchV6List(site) {
  const u = new URL(site.list_url), r = u.pathname.match(/components\/(\d+)/)[1], i = await v6Event(u.origin);
  return b2mPages(async (a, f, o) => {
    const route = (await b2mPost(V6_LIST, { i, r, a, f, o }, null, u.origin + "/api/v4/query"))?.event?.route;
    if (!route?.opportunitiesV2)
      throw new Error(`list not found (the page is ${route?.__typename ?? "missing"}); it may be shown only to registered participants`);
    return route.opportunitiesV2;
  }, (id) => `${u.origin}/marketplace/opportunities/${id}`);
}
async function fetchV6Entry(url) {
  const u = new URL(url), id = decodeURIComponent(u.pathname.split("/").pop());
  return b2mEntry((await b2mPost(V6_ONE, { i: await v6Event(u.origin), id }, null, u.origin + "/api/v4/query"))?.event?.opportunity);
}
// Some b2match events still run on its older platform, at an address of
// their own (<event>.b2match.io), which knows nothing of the data service
// above: GREENET's 2027 calls were the first (2026-10-17, 139 entries, shown
// to anyone). There the list comes from the event's own /api/v2, twenty-five
// at a time, and carries each entry whole, description and all; the site
// has no address that gives one entry by itself (it answers 405), so an
// entry is copied from the list, read once a run, and its link is the
// author's profile, where the site shows it. The event's number, which the
// service wants, is read from its marketplace page. Such an event is still
// platform 'b2match' in partner_sites: the address says which reader fits.
const isB2o = (url) => new URL(url).hostname.endsWith(".b2match.io");
const b2oLists = new Map();
async function b2oGet(url) {
  const r = await fetch(url, {
    headers: { "user-agent": UA, accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (r.status === 401 || r.status === 403)
    throw new Error("this older b2match event shows its marketplace only to registered participants; the copier cannot log in there yet");
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} from ${url}`);
  return await r.json();
}
async function b2oAll(origin) {
  if (b2oLists.has(origin)) return b2oLists.get(origin);
  const id = ((await get(origin + "/marketplace")).match(/EventID\s*=\s*(\d+)/) || [])[1];
  if (!id) throw new Error("the event's number was not found on its marketplace page");
  const api = `${origin}/api/v2/events/${id}/marketplace`;
  const names = {};
  for (const s of (await b2oGet(api + "/schemas")).schemas ?? [])
    for (const w of s.widgets ?? [])
      for (const c of w.options ?? []) names[c.id] = [String(w.subtype ?? "").split("::").pop(), c.name];
  const out = [];
  for (let token = "", n = 0; ; n++) {
    if (n > 200) throw new Error("the list did not end after 5,000 entries");
    const d = await b2oGet(`${api}/opportunities:search?query=&page_size=25&order_by=created_at${token ? "&page_token=" + encodeURIComponent(token) : ""}`);
    for (const o of d.opportunities ?? []) {
      const g = {};
      for (const c of o.classifier_ids ?? []) {
        const [sub, name] = names[c] ?? [];
        if (/^(Kind|Topic|Stage|Call)$/.test(sub)) g[sub] = g[sub] ? `${g[sub]}; ${flat(name)}` : flat(name);
      }
      out.push({ o, g });
    }
    if (!d.next_page_token || !d.opportunities?.length) break;
    token = d.next_page_token;
    await sleep(GAP_MS);
  }
  b2oLists.set(origin, out);
  return out;
}
async function fetchB2oList(site) {
  const origin = new URL(site.list_url).origin;
  return (await b2oAll(origin)).map(({ o, g }) => {
    const p = o.participant ?? {}, u = p.user ?? {};
    return {
      ext_id: String(o.id), url: origin + (p.profile_url ?? "/marketplace"),
      contact: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || null,
      kind: b2mKind(g, o.type), looking_raw: g.Kind ?? "",
      country: p.country?.name ?? null, org: p.organisation_name || null,
      topic: g.Topic || null, keywords: null, posted: null,
      list_text: flat(o.title),
    };
  });
}
async function fetchB2oEntry(e) {
  const found = (await b2oAll(new URL(e.url).origin)).find(({ o }) => String(o.id) === e.ext_id);
  if (!found) throw new Error("entry content not found");
  const { o, g } = found, p = o.participant ?? {}, u = p.user ?? {};
  const text = (t) => String(t ?? "").replace(/\r/g, "").split("\n").map((l) => l.replace(/[ \t ]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const fields = [
    ["Title", flat(o.title)],
    ["Looking for", g.Kind ?? ""],
    ["Description", text(o.description)],
    ["Topic", g.Topic ?? ""],
    ["Call", g.Call ?? ""],
    ["Stage", g.Stage ?? ""],
    ["Contact name", `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim()],
    ["Job position", flat(p.job_description || u.job_description)],
    ["Organisation name", flat(p.organisation_name)],
    ["Organisation type", flat(p.organisation_type?.name)],
    ["About the organisation", text(p.organisation_description)],
    ["Website", flat(p.website)],
    ["City", flat(p.city)],
    ["Country", flat(p.country?.name)],
    ["Last updated on the site", String(o.updated_at ?? "").replace("T", " ").slice(0, 16)],
  ];
  return { fields, text: fields.filter(([, v]) => v).map(([l, v]) => `${l}\n${v}`).join("\n\n") };
}
const PARSERS = {
  epss: { list: parseEpssList, detail: parseEpssDetail },
  ptj: { list: parsePtjList, detail: parsePtjDetail },
  b2match: {
    fetchList: (s) => isV6(s.list_url) ? fetchV6List(s) : isB2o(s.list_url) ? fetchB2oList(s) : fetchB2mList(s),
    fetchEntry: (e) => isV6(e.url) ? fetchV6Entry(e.url) : isB2o(e.url) ? fetchB2oEntry(e) : fetchB2mEntry(e.url),
  },
};

// ── the run ───────────────────────────────────────────────────────────

// A site that turns the connection away (2026-10-22: the three
// proposals.etag.ee venues all at once, "Connection refused", while Check
// now went on by itself for NEB4All's 379 pages) is asked once more after
// a pause, then left alone for the rest of the run: every further asking
// of the same host only adds to what made it refuse.
const refused = new Set();
const refusal = (err) => /connection refused|tcp connect|os error 111|connection reset/i.test(String(err?.message ?? err));
async function get(url) {
  const host = new URL(url).host;
  if (refused.has(host)) throw new Error(`skipped: ${host} refused the connection earlier in this check`);
  for (let tries = 1; ; tries++) {
    try {
      const r = await fetch(url, {
        headers: { "user-agent": UA, accept: "text/html" },
        redirect: "follow",
        signal: AbortSignal.timeout(30_000),
      });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText} from ${url}`);
      return await r.text();
    } catch (err) {
      if (!refusal(err)) throw err;
      if (tries < 2) { await sleep(8_000); continue; }
      refused.add(host);
      throw err;
    }
  }
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

// Mark, 2026-10-22: "Remove automatically all entries that are 2 months or
// older. Except the marked ones. And never download these." An entry's age
// is the day its site says it was posted; a site that gives no date (the
// proposals.etag.ee sites, b2match's older platform) is aged from the day
// the copier first saw the entry, the only date there is. The day is a
// string compared with a string: `posted` is 'YYYY-MM-DD HH:MM'.
function oldDay() {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - MAX_AGE_MONTHS);
  return d.toISOString().slice(0, 10);
}
const tooOld = (posted) => !!(posted && posted.slice(0, 10) <= oldDay());

// Putting an entry away keeps only its row, hidden as `before_watch` hides
// one, so the next reading of its list knows it and does not bring it back
// as new. Everything else goes, its copied text, its list line, contact and
// the rest, and its older copies (Mark, 2026-10-22: "make it even
// shorter"). Marked entries are never put away.
const BARE = { kind: null, contact: null, org: null, country: null, topic: null, keywords: null, list_text: null };
async function putAwayOld() {
  const day = oldDay();
  const notMarked = "verdict.is.null,verdict.neq.interesting";
  const ids = (await all(() => db.from("partner_entries").select("id")
    .eq("before_watch", false).or(notMarked).not("posted", "is", null).lte("posted", day + " 99").order("id")))
    .concat(await all(() => db.from("partner_entries").select("id")
    .eq("before_watch", false).or(notMarked).is("posted", null).lt("first_seen", day + "T23:59:59Z").order("id")))
    .map((e) => e.id);
  for (const c of chunks(ids, 150)) {
    const { error: v } = await db.from("partner_entry_versions").delete().in("entry_id", c);
    if (v) throw v;
    const { error } = await db.from("partner_entries").update({
      ...BARE, before_watch: true, needs_fetch: false, fields: null, page_text: null, page_hash: null, fetched_at: null,
    }).in("id", c);
    if (error) throw error;
  }
  return ids.length;
}

async function readList(site, now) {
  const origin = new URL(site.list_url).origin, P = PARSERS[site.platform];
  const rows = P.fetchList ? await P.fetchList(site) : P.list(await get(site.list_url), origin);
  // An empty list is far more likely a page the reader no longer
  // understands than a site that emptied overnight. Taken at its word it
  // would mark every entry removed, so it stops here and says so instead.
  if (!rows.length) throw new Error("the list came back empty; the site may have changed its page");

  const have = new Map((await all(() =>
    db.from("partner_entries").select("id, list_text, removed_at, before_watch").eq("site", site.id).order("id")
  )).map((e) => [e.id, e]));
  // A venue Mark wants only the news of (`new_only`) takes the entries
  // already on its site at the first reading as seen before he watched:
  // kept, so they never come back as new, but never copied whole and never
  // shown (Mark, 2026-10-17, for CL4 Digital's 658 and the GREENET
  // tool's 576: "don't add the entries, only update them with new ones").
  const baseline = site.new_only && !site.listed_at;
  // A venue with a first day (`shown_from`) takes an entry the site says
  // was posted before it the same way, at any reading (Mark, 2026-10-17,
  // for the Cluster 2 platform's 1,159 entries going back to 2022: "from
  // September 1, not before"). An entry whose site gives no date is shown.
  // An entry two months old or older (`tooOld`) is taken the same way.
  const early = (r) => !!(site.shown_from && r.posted && r.posted.slice(0, 10) < site.shown_from) || tooOld(r.posted);

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
    if (!old) {
      const before = baseline || early(r);
      added.push(before
        ? { id, site: site.id, ext_id: r.ext_id, url: r.url, posted: r.posted ?? null, ...BARE, first_seen: now, last_seen: now, needs_fetch: false, before_watch: true }
        : { id, ...base, first_seen: now, last_seen: now, needs_fetch: true, before_watch: false });
    }
    // A hidden entry is only noted as still there: its list line was
    // emptied on purpose, so comparing it with the site's would refill it.
    else if (old.before_watch) {
      if (old.removed_at) changed.push({ id, last_seen: now, removed_at: null });
      else seen.push(id);
    }
    else if ((old.list_text ?? "") !== (r.list_text ?? "") || old.removed_at)
      changed.push({ id, ...base, last_seen: now, removed_at: null, needs_fetch: !old.before_watch });
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
  return { listed: ids.size, added: added.filter((e) => !e.before_watch).length, removed: gone.length };
}

async function copyEntry(e, platform, now) {
  const P = PARSERS[platform];
  const p = P.fetchEntry ? await P.fetchEntry(e) : P.detail(await get(e.url));
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

async function run(byMark, lists) {
  const t0 = Date.now(), now = new Date().toISOString();
  const tally = { listed: 0, added: 0, fetched: 0, changed: 0, removed: 0, waiting: 0 };
  b2mTokens.clear();
  b2oLists.clear();
  refused.clear();
  const errors = [];

  const { data: sites, error } = await db.from("partner_sites").select("*").eq("active", true).order("sort");
  if (error) throw error;
  const platformOf = Object.fromEntries(sites.map((s) => [s.id, s.platform]));
  // Mark's press reads every list again; the runs the page then starts by
  // itself to copy what is waiting (`lists: false`) leave the lists alone,
  // or a long copy re-read each site every few minutes for as long as it went.
  const dueAfter = Date.now() - (byMark && lists !== false ? 5 * 60_000 : LIST_EVERY_H * 3_600_000);

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

  try { tally.aged = await putAwayOld(); }
  catch (err) { errors.push(`putting away old entries: ${err.message ?? err}`); }

  const cols = "id, site, ext_id, url, page_hash, fields, page_text, fetched_at, fetch_errors";
  const active = Object.keys(platformOf);
  const { data: due } = await db.from("partner_entries").select(cols)
    .eq("needs_fetch", true).is("removed_at", null).in("site", active)
    .order("first_seen").order("id").limit(PER_RUN);
  let queue = due ?? [];
  if (queue.length < PER_RUN) {
    const { data: stale } = await db.from("partner_entries").select(cols)
      .eq("needs_fetch", false).eq("before_watch", false).is("removed_at", null).in("site", active)
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
      // A host that refused is the site's doing, not the entry's: the entry
      // keeps its place and is not counted a failure.
      if (refusal(err) || /^skipped:/.test(String(err?.message))) continue;
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
  const { aged, ...logged } = tally;
  await db.from("partner_watch_log").insert({ ...logged, errors: errors.length ? errors.join("\n") : null });
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
    const body = await req.json().catch(() => ({}));
    return json(await run(byMark, body?.lists));
  } catch (err) {
    return json({ error: String(err?.message ?? err) }, 500);
  }
});
