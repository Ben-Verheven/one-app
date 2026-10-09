// atlas-agent — the gatekeeper between the scheduled people-agent and Supabase.
//
// Same arrangement as semaphore-agent, and the same password (AGENT_TOKEN).
// With it the agent can do four things and only these four:
//   roster   who the Atlas knows, their rank, when each was last looked at, where
//   person   what the Atlas already says about one of them
//   suggest  add rows to atlas_inbox
//   checked  record whom it looked at, and the pages it found them on
// It never sees the app's key, so nothing it reads on a website can change
// the Atlas: every finding waits in the inbox for Mark.

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
// The Atlas matches people by a loose form of their name; so does this.
const key = (n: unknown) =>
  String(n ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const KINDS = ["employment", "position", "info", "link", "newcomer"];

// Mark's own edits to the Atlas, from the row the app syncs through: a
// description he rewrote replaces the built one, and a finding he accepted
// is something the Atlas now knows, so the agent must not bring it again.
async function atlasEdits(): Promise<any[]> {
  const { data } = await db.from("app_state").select("data").eq("id", "atlas").maybeSingle();
  const d = (data?.data ?? {}) as any;
  return Array.isArray(d.edits) ? d.edits : [];
}

async function lastChecks() {
  const { data } = await db
    .from("atlas_agent_log")
    .select("subject,checked_at,tue_url,pure_url,site_url")
    .order("checked_at", { ascending: false }).limit(5000);
  const last: Record<string, any> = {};
  const links: Record<string, any> = {};
  for (const r of data ?? []) {
    const k = r.subject.startsWith("group:") ? r.subject : key(r.subject);
    last[k] ??= r.checked_at;
    const l = (links[k] ??= {});
    l.tue ??= r.tue_url ?? undefined;
    l.pure ??= r.pure_url ?? undefined;
    l.site ??= r.site_url ?? undefined;
  }
  return { last, links };
}

async function roster() {
  const { data: rows, error } = await db
    .from("atlas_roster").select("name,domain,cluster,grp,leader").order("name");
  if (error) return json({ error: error.message }, 500);
  const edits = await atlasEdits();
  const { last, links } = await lastChecks();

  // The rank Mark keeps by hand on the dossier — full, associate, assistant
  // professor — which the source data has no column for. It travels with the
  // roster so the agent can tell a rank the Atlas is missing from one that
  // has changed, and stay quiet about one it already holds.
  const rankBy: Record<string, string> = {};
  for (const e of edits) {
    if (e?.type === "rank" && e.rL && e.rank) rankBy[key(e.rL)] = String(e.rank);
  }

  const people = (rows ?? []).map((r: any) => ({
    name: r.name, domain: r.domain, cluster: r.cluster, group: r.grp,
    leader: r.leader, rank: rankBy[key(r.name)] ?? null, in_atlas: true,
  }));
  // A newcomer Mark accepted is somebody to keep an eye on from then on.
  const known = new Set(people.map((p: any) => key(p.name)));
  for (const e of edits) {
    if (e?.type === "newcomer" && e.name && !known.has(key(e.name))) {
      known.add(key(e.name));
      people.push({ name: e.name, domain: null, cluster: null, group: e.grp ?? null,
                    leader: false, rank: rankBy[key(e.name)] ?? null, in_atlas: false });
    }
  }

  const groups: any[] = [];
  const seenG = new Set<string>();
  for (const r of rows ?? []) {
    const g = r.grp || r.cluster;
    if (!g || seenG.has(g)) continue;
    seenG.add(g);
    groups.push({ group: g, cluster: r.cluster, domain: r.domain,
                  agent_checked_at: last["group:" + g] ?? null });
  }

  const { data: recent } = await db
    .from("atlas_inbox")
    .select("created_at,kind,person,summary,url,status")
    .order("created_at", { ascending: false }).limit(300);

  return json({
    people: people.map((p: any) => ({
      ...p,
      agent_checked_at: last[key(p.name)] ?? null,
      known_pages: links[key(p.name)] ?? {},
    })),
    groups,
    recent_suggestions: recent ?? [],
  });
}

async function person(name: unknown) {
  const k = key(name);
  if (!k) return json({ error: "name is required" }, 400);
  const { data: rows } = await db.from("atlas_roster").select("*");
  const r = (rows ?? []).find((x: any) => key(x.name) === k);
  const edits = await atlasEdits();
  const mine = edits.filter((e: any) => key(e?.rL ?? e?.name) === k);
  const desc = [...mine].reverse().find((e: any) => e.type === "desc");
  const rank = [...mine].reverse().find((e: any) => e.type === "rank");
  const nc = mine.find((e: any) => e.type === "newcomer");
  if (!r && !nc) return json({ error: "not in the Atlas: " + String(name) }, 404);
  const { links } = await lastChecks();
  const { data: past } = await db
    .from("atlas_inbox")
    .select("created_at,kind,summary,detail,url,status")
    .eq("person", r?.name ?? nc.name)
    .order("created_at", { ascending: false }).limit(100);
  return json({
    name: r?.name ?? nc.name,
    in_atlas: !!r,
    domain: r?.domain ?? null, cluster: r?.cluster ?? null,
    group: r?.grp ?? nc?.grp ?? null, leader: r?.leader ?? false,
    rank: rank?.rank ?? null,
    rank_set: rank ? (rank.fid ? "accepted from a finding" : "set by hand") : null,
    keywords: r?.keywords ?? null,
    description: desc?.text ?? r?.descr ?? null,
    description_rewritten_by_mark: !!desc,
    // what he already accepted from earlier findings
    known_facts: mine.filter((e: any) => e.type === "fact")
      .map((e: any) => ({ kind: e.kind, text: e.text, as_of: e.asOf ?? null, url: e.url ?? null })),
    known_pages: links[k] ?? {},
    past_suggestions: past ?? [],
  });
}

async function suggest(items: any[], run: string) {
  if (!Array.isArray(items)) return json({ error: "items must be a list" }, 400);
  if (items.length > 40) return json({ error: "at most 40 per call" }, 400);
  const rows: any[] = [];
  const rejected: any[] = [];
  for (const it of items) {
    const kind = oneOf(it.kind, KINDS);
    const r: any = {
      run, kind,
      person: S(it.person, 200),
      grp: S(it.group, 200),
      summary: S(it.summary, 300),
      detail: S(it.detail, 2000),
      as_of: D(it.as_of),
      as_of_gran: oneOf(it.as_of_gran, ["day", "month", "year"]),
      url: http(it.url),
      source_url: http(it.source_url),
      evidence: S(it.evidence, 600),
    };
    if (!kind || !r.person || !r.summary || !r.source_url) {
      rejected.push({ item: it, why: "kind, person, summary and source_url are required" });
      continue;
    }
    if ((kind === "link" || kind === "newcomer") && !r.url) {
      rejected.push({ item: it, why: "a link or a newcomer needs url" });
      continue;
    }
    if (kind === "info" && !r.detail) {
      rejected.push({ item: it, why: "info needs detail: the passage itself" });
      continue;
    }
    if (r.as_of && !r.as_of_gran) r.as_of_gran = "day";
    if (!r.as_of) r.as_of_gran = null;
    r.fingerprint = [
      kind, key(r.person), kind === "link" || kind === "newcomer" ? r.url : r.summary,
    ].map((x) => (x ?? "").toString().trim().toLowerCase()).join("|");
    rows.push(r);
  }
  let added = 0;
  if (rows.length) {
    const { data, error } = await db
      .from("atlas_inbox")
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
    .filter((i) => S(i.subject, 200))
    .map((i) => ({
      subject: S(i.subject, 200), run,
      found: Number.isFinite(i.found) ? Math.max(0, Math.floor(i.found)) : 0,
      tue_url: http(i.tue_url), pure_url: http(i.pure_url), site_url: http(i.site_url),
      note: S(i.note, 600),
    }));
  if (!rows.length) return json({ logged: 0 });
  const { error } = await db.from("atlas_agent_log").insert(rows);
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
    case "roster":  return await roster();
    case "person":  return await person(body.name);
    case "suggest": return await suggest(body.items, run);
    case "checked": return await checked(body.items, run);
    default:        return json({ error: "action must be roster, person, suggest or checked" }, 400);
  }
});
