/* The Topic Atlas's engine, the half that ranks topics for keywords
   (Scorer). It stood inside index.html until
   2026-10-29, when the Call Board's Atlas switch came to rank with it too:
   one copy, read by both pages, so the Board ranks exactly as the Topic
   Atlas does, as library.js keeps their libraries one (see
   notes/topic-atlas.md). A rebuilt Topic Atlas loads textutil.js and
   scorer.js rather than writing them back into its page. */

/* Ranking topics for a researcher's keywords — the Atlas's search, turned
   around. Shared by the build (examples, checks) and the app.

   One keyword (a "chip") enters the concept graph exactly as a keyword
   enters the Atlas: by matching concept names, each match labelled with how
   it matched (= ≡ ⊇ ⊆ ∋ ≈). From each entry the search may travel along typed
   relations on the keyword's own axis (⊂ narrower, ~ related, ⊃ broader) up
   to `maxHops`, each step costing what its relation costs (`step`). Wherever
   it lands on a concept, every topic that names that concept collects, per
   section:

     W[section] × A[axis] × idf(concept) × hop × quality(match) × min(mentions, cap)

   where hop is the product of the step costs, each times the hop decay, 1 where the keyword names the
   concept, and a phrase counts once per keyword, for the nearest concept that
   reached it. A keyword's score for a topic is the sum of its rows; a topic's
   score is the geometric mean of its keywords' scores when every keyword is
   required (the default), their sum when any will do. Every term in that
   product is kept on the row it produced, so the explanation is the
   arithmetic itself. A keyword that is in neither library falls back to the
   words themselves in the topic text (¶), so nothing typed is lost, and it
   says so.

   With two keywords or more, where they meet in the topic's text counts
   too. For each pair of keywords the closest meeting of a phrase counted
   for one with a phrase counted for the other, in the same section, is
   joined (one sentence, at most `window` words between, not two items of a
   list) 1, in the same sentence `same`, in the next sentence `next`, and
   further apart 0; both in the title is joined, and the intro is left out.
   Each meeting is discounted by how surely its phrases are the keywords —
   the hop and match-quality factors of their own lines, times `hop` for a
   phrase reached by a hop — and a phrase never meets itself. The topic's
   score is then multiplied by

     1 + strength × closeness,   closeness = the mean over the pairs

   so the geometric mean and the sum are both multiplied alike. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Scorer = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MTQ = { exact: 1, alias: 1, contains: 0.75, within: 0.7, words: 0.6, fuzzy: 0.5, text: 0.5 };
  const MTG = { exact: "=", alias: "≡", contains: "⊇", within: "⊆", words: "∋", fuzzy: "≈", text: "¶" };
  const MTT = { exact: "a phrase found in topics", alias: "one of the concept's names",
                contains: "keyword contained in a name", within: "name contained in keyword",
                words: "all keyword words in a name", fuzzy: "fuzzy match",
                text: "in neither library — the words themselves, in the topic text" };
  const RELG = { broader: "⊃", narrower: "⊂", related: "~" };
  const SECTIONS = ["title", "outcome", "scope", "intro"];
  const DEFAULTS = {
    maxHops: 1, strict: 1, requireAll: true, cap: 2,
    /* what one step along a relation costs: a narrower concept is still
       inside the keyword (a cancer topic is a health topic), a related one is
       beside it, a broader one only partly about it (an AI topic is not
       necessarily a machine-learning topic) */
    step: { narrower: 0.8, related: 0.6, broader: 0.4 },
    /* what every hop costs on top of its relation's step: 1 leaves the step
       costs as they are, lower makes each further hop count for less */
    decay: 1,
    weights: { title: 3, outcome: 2, scope: 1.5, intro: 0.5 },
    axis: { method: 1, domain: 1 },
    /* where keywords meet: what a joined meeting adds (× 1 + strength), how
       many words may stand between two joined phrases, what a meeting in
       the same sentence and in the next one counts against a joined one,
       and what a phrase reached by a hop brings on top of its hop's cost
       (0: only phrases the keywords name count) */
    near: { strength: 0.5, window: 8, same: 0.5, next: 0.25, hop: 1 },
  };
  /* how two keywords met, closest first */
  const NEAR_RANK = { title: 0, joined: 1, same: 2, next: 3 };

  /* words that say nothing on their own: a keyword made only of these is
     not looked for inside longer names, nor in the text */
  const STOPW = new Set(["a", "an", "the", "of", "and", "or", "in", "on", "for", "to", "with", "by", "at", "from", "as",
    "is", "are", "be", "this", "that", "its", "into", "via", "per", "not", "no", "de", "la", "le", "et", "und", "der"]);
  const meaningful = nm => nm.split(" ").some(w => w.length >= 2 && !STOPW.has(w));

  function editDistLe(a, b, maxd) {          // banded Damerau-Levenshtein, as in the Atlas
    if (Math.abs(a.length - b.length) > maxd) return maxd + 1;
    const la = a.length, lb = b.length;
    let prev2 = null, prev = [...Array(lb + 1).keys()];
    for (let i = 1; i <= la; i++) {
      const cur = [i]; let rowMin = i;
      for (let j = 1; j <= lb; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + cost);
        cur.push(v); if (v < rowMin) rowMin = v;
      }
      if (rowMin > maxd) return maxd + 1;
      prev2 = prev; prev = cur;
    }
    return prev[lb];
  }

  function create(data, TU) {
    const { libraries, stats, records } = data;
    const N = stats.N;
    const C = new Map();
    for (const lib of [libraries.methods, libraries.domains]) for (const c of lib.concepts) C.set(c.id, c);
    /* 1 for a concept in a single topic, falling towards ln 2 / ln(N+1) for
       one in every topic; a concept no topic names counts as the rarest */
    const idf = (c) => stats.df[c] ? Math.log(1 + N / stats.df[c]) / Math.log(1 + N) : 1;

    /* every name a keyword can meet, normalised; a concept's own phrases
       found in topics are "exact" (=), its other names "alias" (≡) */
    const found = new Set();
    for (const r of records) for (const o of r.concepts) for (const h of o.hits) found.add(o.c + "|" + TU.norm(h.ph));
    const NAMES = new Map();                 // norm -> [{c, label?}]
    const addName = (nm, c, label) => {
      if (!nm) return;
      const list = NAMES.get(nm) || NAMES.set(nm, []).get(nm);
      if (!list.some(x => x.c === c)) list.push({ c, label });
    };
    for (const c of C.values()) {
      for (const a of [...(c.aliases || []), ...(c.extract || []), ...(c.added || [])]) addName(TU.norm(a.replace(/^=/, "")), c.id, false);
    }
    for (const c of C.values()) {          // a label is a name only where no other concept of its axis claims it
      const nm = TU.norm(c.label);
      const there = (NAMES.get(nm) || []).filter(x => C.get(x.c).axis === c.axis && x.c !== c.id);
      if (!there.length) addName(nm, c.id, true);
    }
    const nameList = [...NAMES.keys()];

    /* the graph: broader / narrower from the hierarchy, related both ways */
    const ADJ = new Map();
    /* Scoring stays on one axis: a method keyword travels among methods, a
       domain keyword among domains. Links across the axes ("process mining
       ~ healthcare") are kept for reading, not for adding up — a mention of
       imaging says nothing about whether a topic is about cancer. */
    const XLINKS = new Map();
    const link = (a, b, rel, note) => {
      if (!C.has(a) || !C.has(b) || a === b) return;
      if (C.get(a).axis !== C.get(b).axis) {
        (XLINKS.get(a) || XLINKS.set(a, []).get(a)).push({ o: b, rel, note });
        return;
      }
      (ADJ.get(a) || ADJ.set(a, []).get(a)).push({ o: b, rel, note });
    };
    for (const c of C.values()) {
      if (c.broader) { link(c.id, c.broader, "broader", null); link(c.broader, c.id, "narrower", null); }
      for (const r of c.related || []) { link(c.id, r.c, "related", r.note); link(r.c, c.id, "related", r.note); }
    }
    for (const [k, list] of ADJ) {           // the same pair can be linked twice; keep one
      const seen = new Set();
      ADJ.set(k, list.filter(e => { const s = e.o + e.rel; if (seen.has(s)) return false; seen.add(s); return true; }));
    }

    /* who mentions what */
    const OCC = new Map();                   // concept -> [{ti, o}]
    records.forEach((r, ti) => { for (const o of r.concepts) (OCC.get(o.c) || OCC.set(o.c, []).get(o.c)).push({ ti, o }); });

    function matchChip(q, strict) {
      const nm = TU.norm(q);
      const out = new Map();
      const push = (c, mt, via) => {
        const cur = out.get(c);
        if (!cur || MTQ[mt] > MTQ[cur.mt]) out.set(c, { c, mt, via });
      };
      if (!nm) return { nm, entries: [] };
      for (const x of NAMES.get(nm) || []) push(x.c, found.has(x.c + "|" + nm) ? "exact" : "alias", nm);
      /* Partial matching is a fallback, as fuzzy matching is in the Atlas:
         a keyword that IS a name is taken at its word, and only a keyword
         no concept is called gets matched inside longer names. */
      if (strict >= 1 && !out.size && meaningful(nm)) {
        const pnm = " " + nm + " ", qw = nm.split(" ").filter(w => w.length >= 3);
        const conts = [], withins = [], words = [];
        for (const n of nameList) {
          if (n === nm) continue;
          const pn = " " + n + " ";
          if (pn.includes(pnm)) conts.push(n);
          else if (nm.length > n.length + 2 && pnm.includes(pn)) withins.push(n);
          else if (qw.length > 1 && qw.every(w => pn.includes(" " + w + " "))) words.push(n);
        }
        conts.sort((a, b) => a.length - b.length).slice(0, 40).forEach(n => NAMES.get(n).forEach(x => push(x.c, "contains", n)));
        withins.sort((a, b) => b.length - a.length).slice(0, 12).forEach(n => NAMES.get(n).forEach(x => push(x.c, "within", n)));
        words.sort((a, b) => a.length - b.length).slice(0, 25).forEach(n => NAMES.get(n).forEach(x => push(x.c, "words", n)));
      }
      if (strict >= 2 && !out.size && nm.length >= 5 && meaningful(nm)) {
        const maxd = nm.length >= 9 ? 2 : 1, hits = [];
        for (const n of nameList) { const d = editDistLe(nm, n, maxd); if (d <= maxd) hits.push([d, n]); }
        hits.sort((a, b) => a[0] - b[0] || a[1].length - b[1].length).slice(0, 10)
          .forEach(([, n]) => NAMES.get(n).forEach(x => push(x.c, "fuzzy", n)));
      }
      return { nm, entries: [...out.values()] };
    }

    /* the words themselves, for a keyword no concept answers to; the
       paragraphs are tokenised once and each keyword's hits are kept */
    const TOKS = new Map(), TEXT_CACHE = new Map();
    function textHits(nm) {
      if (TEXT_CACHE.has(nm)) return TEXT_CACHE.get(nm);
      const want = nm.split(" ");
      const res = [];
      records.forEach((r, ti) => {
        const bySec = {};
        for (const sec of SECTIONS) (r.sections[sec] || []).forEach((para, p) => {
          const key = ti + "|" + sec + "|" + p;
          const text = para.text, toks = TOKS.get(key) || TOKS.set(key, TU.tokens(text)).get(key);
          for (let i = 0; i + want.length <= toks.length; i++) {
            let ok = true;
            for (let k = 0; k < want.length; k++) if (toks[i + k].n !== want[k]) { ok = false; break; }
            if (!ok) continue;
            const s = toks[i].s, e = toks[i + want.length - 1].e;
            if ((para.boiler || []).some(([a, b]) => s < b && e > a)) continue;
            const o = bySec[sec] || (bySec[sec] = { c: null, axis: "text", sec, n: 0, hits: [] });
            o.n++; o.hits.push({ p, s, e, ph: text.slice(s, e) });
          }
        });
        const os = Object.values(bySec);
        if (os.length) res.push({ ti, os });
      });
      TEXT_CACHE.set(nm, res);
      return res;
    }

    /* Sentences are numbered through each section in the work programme's
       order, so a meeting can run from one paragraph into the next: a list
       item is a sentence of its own, and two consecutive items are next to
       each other. Numbered once per section, when first needed. */
    const SENT = new Map();                  // "ti|sec" -> per paragraph {first, starts}
    function sentenceNo(ti, sec, h) {
      const key = ti + "|" + sec;
      let per = SENT.get(key);
      if (!per) {
        per = []; let first = 0;
        for (const para of records[ti].sections[sec] || []) {
          const starts = TU.sentences(para.text).map(([a]) => a);
          per.push({ first, starts }); first += starts.length;
        }
        SENT.set(key, per);
      }
      const { first, starts } = per[h.p];
      let k = 0;
      while (k + 1 < starts.length && starts[k + 1] <= h.s) k++;
      return first + k;
    }
    /* the words between two places of a paragraph, counted on the
       paragraph's own words (tokenised once, as for the text fallback) */
    function wordsBetween(ti, sec, p, from, to) {
      const key = ti + "|" + sec + "|" + p;
      const toks = TOKS.get(key) || TOKS.set(key, TU.tokens(records[ti].sections[sec][p].text)).get(key);
      let lo = 0, hi = toks.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (toks[mid].s < from) lo = mid + 1; else hi = mid; }
      let n = 0;
      for (let i = lo; i < toks.length && toks[i].e <= to; i++) n++;
      return n;
    }
    /* Two phrases of one section, one per keyword: how they meet, or null
       when they are further apart than the next sentence. Two items of a
       list — a comma or semicolon right after the first phrase or right
       before the second — are in the same sentence, never joined. */
    const LIST_AFTER = /^[^\p{L}\p{N}]*[,;]/u, LIST_BEFORE = /[,;][^\p{L}\p{N}]*$/u;
    function meet(ti, sec, a, na, b, nb, nr) {
      if (a.p === b.p && a.s < b.e && b.s < a.e) return null;        // the same words: a phrase never meets itself
      if (sec === "title") return { lvl: "title", k: 1 };
      const d = Math.abs(na - nb);
      if (d > 1) return null;
      if (d === 1) return { lvl: "next", k: nr.next };
      const [x, y] = a.s < b.s ? [a, b] : [b, a];
      const gap = records[ti].sections[sec][x.p].text.slice(x.e, y.s);
      const words = wordsBetween(ti, sec, x.p, x.e, y.s), list = LIST_AFTER.test(gap) || LIST_BEFORE.test(gap);
      return !list && words <= nr.window ? { lvl: "joined", k: 1, words, list }
                                         : { lvl: "same", k: nr.same, words, list };
    }
    /* how surely a line's phrases are its keyword: its hop and its match
       quality, and for a phrase reached by a hop the `hop` setting on top */
    const sureOf = (rw, nr) => rw.hopF * rw.q * (rw.d > 0 ? nr.hop : 1);
    /* one keyword's phrases in one topic, filed by section and sentence
       (the title is one sentence), with how surely each is the keyword */
    function phrasesOf(e, ci, nr) {
      const by = new Map(), all = [];
      for (const rw of e.chips[ci] || []) {
        if (rw.sec === "intro") continue;
        const s = sureOf(rw, nr);
        for (const h of rw.hits) {
          const x = { rw, h, s, n: rw.sec === "title" ? 0 : sentenceNo(e.ti, rw.sec, h) };
          const key = rw.sec + "|" + x.n;
          (by.get(key) || by.set(key, []).get(key)).push(x);
          all.push(x);
        }
      }
      return { by, all };
    }
    /* the closest meeting of two keywords in one topic: the highest value
       k × sure(a) × sure(b), the closer kind of meeting on a tie; a meeting
       that counts 0 (a level or a factor set to 0) is still reported */
    function meeting(e, A, B, nr) {
      let best = null;
      const kmax = Math.max(1, nr.same, nr.next);
      for (const a of A.all) for (const dn of [0, -1, 1]) {
        if (a.rw.sec === "title" && dn) continue;
        for (const b of B.by.get(a.rw.sec + "|" + (a.n + dn)) || []) {
          if (best && best.v > 0 && a.s * b.s * kmax < best.v) continue;   // cannot come closer
          const m = meet(e.ti, a.rw.sec, a.h, a.n, b.h, b.n, nr);
          if (!m) continue;
          const v = m.k * a.s * b.s;
          if (!best || v > best.v || (v === best.v && NEAR_RANK[m.lvl] < NEAR_RANK[best.lvl]))
            best = Object.assign(m, { v, sec: a.rw.sec, ra: a.rw, rb: b.rw, ha: a.h, hb: b.h, sa: a.s, sb: b.s });
        }
      }
      return best;
    }

    function traverse(entries, maxHops) {
      const reached = new Map(), queue = [];
      for (const e of entries) {
        if (reached.has(e.c)) continue;
        const r = { c: e.c, d: 0, mt: e.mt, via: e.via, start: e.c, path: [] };
        reached.set(e.c, r); queue.push(r);
      }
      for (let qi = 0; qi < queue.length; qi++) {
        const cur = queue[qi];
        if (cur.d >= maxHops) continue;
        for (const e of ADJ.get(cur.c) || []) {
          if (reached.has(e.o)) continue;
          const r = { c: e.o, d: cur.d + 1, mt: cur.mt, via: cur.via, start: cur.start,
                      path: cur.path.concat([{ rel: e.rel, c: e.o, note: e.note }]) };
          reached.set(e.o, r); queue.push(r);
        }
      }
      return [...reached.values()];
    }

    function search(chips, o) {
      const opt = Object.assign({}, DEFAULTS, o || {});
      opt.weights = Object.assign({}, DEFAULTS.weights, (o || {}).weights);
      opt.step = Object.assign({}, DEFAULTS.step, (o || {}).step);
      opt.axis = Object.assign({}, DEFAULTS.axis, (o || {}).axis);
      opt.near = Object.assign({}, DEFAULTS.near, (o || {}).near);
      const perChip = [];
      const byT = new Map();
      const entry = (ti) => byT.get(ti) || byT.set(ti, {
        ti, id: records[ti].id, score: 0, bySec: { title: 0, outcome: 0, scope: 0, intro: 0 },
        byAxis: { method: 0, domain: 0, text: 0 }, chips: {}, codeHit: false }).get(ti);

      chips.forEach((q, ci) => {
        const { nm, entries: all } = matchChip(q, opt.strict);
        /* a mapping the user has switched off is still reported, struck
           through, but nothing travels from it */
        const off = new Set(((opt.off || {})[q]) || []);
        const entries = all.filter(e => !off.has(e.c));
        all.forEach(e => { e.off = off.has(e.c); });
        const reached = entries.length ? traverse(entries, opt.maxHops) : [];
        const codes = [];
        const qc = String(q).trim().toUpperCase();
        if (qc.length >= 6 && /[-\d]/.test(qc)) records.forEach((r, ti) => { if (r.id.toUpperCase().includes(qc)) codes.push(ti); });
        let text = null;
        if (!all.length && !codes.length && opt.strict >= 1 && nm && meaningful(nm)) {
          const hits = textHits(nm);
          if (hits.length) text = { nm, df: hits.length, idf: Math.log(1 + N / hits.length) / Math.log(1 + N), hits };
        }
        perChip.push({ q, nm, entries: all, reached: reached.length, reachedList: reached, codes, text });

        const row = (ti, base) => {
          const e = entry(ti), cap = Math.min(base.n, opt.cap);
          const W = opt.weights[base.sec], A = base.axis === "text" ? 1 : opt.axis[base.axis];
          const H = base.path.reduce((f, st) => f * opt.decay * opt.step[st.rel], 1);
          const contrib = W * A * base.idf * H * MTQ[base.mt] * cap;
          if (!(contrib > 0)) return;
          const rw = Object.assign({}, base, { W, A, hopF: H, q: MTQ[base.mt], capN: cap, contrib });
          (e.chips[ci] = e.chips[ci] || []).push(rw);
          e.score += contrib; e.bySec[base.sec] += contrib; e.byAxis[base.axis] += contrib;
        };
        /* One phrase counts once per keyword. A phrase that names two
           concepts (a "virtual human twin" is a digital twin and digital
           health) is credited to whichever of them this keyword reached
           first — the nearer one, then the better-matched one. */
        const credited = new Map();            // ti -> Set of "sec|p|s"
        const hopOf = (r) => r.path.reduce((f, st) => f * opt.decay * opt.step[st.rel], 1);
        const order = reached.slice().sort((a, b) => hopOf(b) - hopOf(a) || MTQ[b.mt] - MTQ[a.mt]);
        for (const r of order) {
          for (const { ti, o } of OCC.get(r.c) || []) {
            const done = credited.get(ti) || credited.set(ti, new Set()).get(ti);
            const fresh = o.hits.filter(h => !done.has(o.sec + "|" + h.p + "|" + h.s));
            if (!fresh.length) continue;
            fresh.forEach(h => done.add(o.sec + "|" + h.p + "|" + h.s));
            row(ti, { c: r.c, axis: C.get(r.c).axis, sec: o.sec, n: fresh.length, hits: fresh, d: r.d, mt: r.mt,
                      via: r.via, start: r.start, path: r.path, idf: Math.min(idf(r.c), idf(r.start)) });
          }
        }
        if (text) for (const { ti, os } of text.hits)
          for (const o of os) row(ti, { c: null, axis: "text", sec: o.sec, n: o.n, hits: o.hits, d: 0, mt: "text",
                                        via: nm, start: null, path: [], idf: text.idf });
        for (const ti of codes) entry(ti).codeHit = true;
      });

      let list = [...byT.values()];
      if (opt.requireAll && chips.length > 1)
        list = list.filter(e => perChip.every((pc, ci) => (e.chips[ci] && e.chips[ci].length) || pc.codes.includes(e.ti)));
      /* Each keyword's own total, and how they combine: added up when any
         keyword will do (the Atlas's way), multiplied and rooted when all are
         required — so a topic has to answer every keyword, not one of them
         loudly. */
      for (const e of list) {
        e.perChip = chips.map((_, ci) => (e.chips[ci] || []).reduce((a, r) => a + r.contrib, 0));
        e.sum = e.score;
        if (opt.requireAll && chips.length > 1)
          e.score = Math.pow(e.perChip.reduce((a, b) => a * Math.max(b, 1e-9), 1), 1 / chips.length);
      }
      for (const e of list) for (const ci in e.chips)
        e.chips[ci].sort((a, b) => b.contrib - a.contrib || a.d - b.d || SECTIONS.indexOf(a.sec) - SECTIONS.indexOf(b.sec));
      /* Where the keywords meet: every pair of keywords that are read as
         concepts or words (a topic code is not), its closest meeting, and
         the topic's score times 1 + strength × the pairs' mean. `base` is
         the score before it. */
      const nr = opt.near;
      const live = perChip.map(pc => pc.entries.some(x => !x.off) || !!pc.text);
      const pairs = [];
      for (let a = 0; a < chips.length; a++) for (let b = a + 1; b < chips.length; b++) if (live[a] && live[b]) pairs.push([a, b]);
      for (const e of list) {
        e.base = e.score; e.near = null;
        if (!pairs.length || !(nr.strength > 0)) continue;
        const ph = new Map(), phOf = (ci) => ph.get(ci) || ph.set(ci, phrasesOf(e, ci, nr)).get(ci);
        const ps = pairs.map(([a, b]) => ({ a, b, m: meeting(e, phOf(a), phOf(b), nr) }));
        const C = ps.reduce((s, p) => s + (p.m ? p.m.v : 0), 0) / ps.length;
        e.near = { pairs: ps, C, F: 1 + nr.strength * C };
        e.score = e.base * e.near.F;
      }
      list.sort((a, b) => (b.codeHit - a.codeHit) || (b.score - a.score));
      return { perChip, list, opts: opt };
    }

    /* tokenise the text ahead of need, a slice at a time, so the first
       keyword that falls back to the text does not wait for it */
    let warmAt = 0;
    function warm(budgetMs) {
      const t0 = Date.now();
      for (; warmAt < records.length; warmAt++) {
        const r = records[warmAt];
        for (const sec of SECTIONS) (r.sections[sec] || []).forEach((para, p) => {
          const key = warmAt + "|" + sec + "|" + p;
          if (!TOKS.has(key)) TOKS.set(key, TU.tokens(para.text));
        });
        if (Date.now() - t0 > budgetMs) { warmAt++; return false; }
      }
      return true;
    }

    return { search, matchChip, idf, warm, concept: (id) => C.get(id), neighbours: (id) => ADJ.get(id) || [],
             crossLinks: (id) => XLINKS.get(id) || [] };
  }

  return { create, DEFAULTS, MTQ, MTG, MTT, RELG, SECTIONS };
});
