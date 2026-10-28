/* ══════════ Researcher Atlas ══════════ */
Hub.mount('atlas', function(window, document, localStorage){

"use strict";
const G = window.__ATLAS_G();      /* data/atlas-graph.js */
/* ======================================================================
   CORE — pure graph logic. No DOM access. `G` is the built structure.
   The graph is fixed; queries only traverse it. All AI work happened at
   build time; everything below is mechanical lookup and breadth-first
   traversal, so every result can be explained by the path it rode in on.
   ====================================================================== */

const Core = (() => {

  // ---------- normalization (exact mirror of build/textutil.norm_term) ----
  const IRR = G.meta.irregular;
  function singular(w) {
    if (IRR[w] !== undefined) return IRR[w];
    if (w.length > 3 && w.endsWith("ies") && !"aeiou".includes(w[w.length - 4]))
      return w.slice(0, -3) + "y";
    if (w.length > 2 && w.endsWith("s") && !/(ss|us|is|'s)$/.test(w))
      return w.slice(0, -1);
    return w;
  }
  function norm(s) {
    s = String(s || "").normalize("NFKC").toLowerCase()
      .replace(/[\u2010-\u2015\u2212]/g, "-")
      .replace(/[\u2018\u2019\u201c\u201d´`]/g, "'")
      .replace(/\//g, " ")
      .replace(/[^a-z0-9\- ]+/g, " ")
      .replace(/-/g, " ");
    return s.split(/\s+/).filter(Boolean).map(singular).join(" ");
  }

  // ---------- node keys ---------------------------------------------------
  // 't123' term · 'c45' concept · researchers are endpoints, not graph nodes
  /* Copies, not the base arrays. A hand-added keyword mints a word and an
     attachment, and joins the researcher's declared-keyword line so its
     provenance reads like every other declared keyword — all three of
     those are rebuilt from the edit list on every change, so each copy is
     truncated back to its built length first. `G` itself is still never
     written to, which is what lets any edit be undone by dropping it. */
  const T = G.terms.slice(), C = G.concepts, P = G.publications;
  const R = G.researchers.map(r => Object.assign({}, r));
  const att = G.att.slice();
  const T_BASE = T.length, ATT_BASE = att.length;
  const KW_BASE = G.researchers.map(r => r.kwRaw);
  /* The description Mark can rewrite is a fourth copy kept the same way,
     and the only one whose ORIGINAL has to stay reachable after it is
     overwritten: every `desc` attachment carries character offsets into
     the text the build measured, and the search snippets slice by them.
     So `r.desc` is what the dossier shows and `r.descBase` is what those
     offsets belong to, and they are the same string until he writes. */
  const DESC_BASE = G.researchers.map(r => r.desc);
  const key = (ty, i) => ty + i;
  const parseKey = k => [k[0], +k.slice(1)];
  const label = k => {
    const [ty, i] = parseKey(k);
    return ty === "t" ? T[i].label : conceptLabel(i);
  };

  // ---------- edit overlay ------------------------------------------------
  // Edits are data layered over the base structure; the base never mutates.
  let edits = [];                       // [{id,ts,type,...}]
  let mergedInto = {};                  // conceptIdx -> conceptIdx (resolved)
  let cutSemSet = new Set();            // "a|b" undirected, canonical order
  let cutAttSet = new Set();            // att signature
  let wSem = new Map();                 // "a|b" -> multiplier
  let wAtt = new Map();                 // att signature -> multiplier
  let addedLinks = [];                  // {a,b,rel,note}
  let addedKw = [];                     // {id,tL,rL} hand-assigned keywords
  let saidDesc = [];                    // {id,rL,text} descriptions rewritten by hand

  /* Hand-assigned keywords name their researcher rather than pointing at a
     row number, so they still mean the same person if the graph is ever
     rebuilt from a newer source and everything shifts by one. */
  const rByName = {};

  const attSig = a => [T[a[0]].norm, R[a[1]].name, a[2], a[3], a[4]].join("§");
  const semSigOf = (ka, kb) => (ka < kb ? ka + "|" + kb : kb + "|" + ka);

  function resolveC(i) {                // follow merge chain
    let seen = 0;
    while (mergedInto[i] !== undefined && seen++ < 20) i = mergedInto[i];
    return i;
  }
  function conceptLabel(i) { return C[resolveC(i)].label; }

  const slug2c = {};
  C.forEach((c, i) => { slug2c[c.id] = i; });
  R.forEach((r, i) => { const n = norm(r.name); if (n) rByName[n] = i; });

  function setEdits(list) {
    edits = list;
    mergedInto = {}; cutSemSet = new Set(); cutAttSet = new Set();
    wSem = new Map(); wAtt = new Map(); addedLinks = []; addedKw = []; saidDesc = [];
    for (const e of edits) {
      if (e.type === "merge" && slug2c[e.from] !== undefined && slug2c[e.into] !== undefined)
        mergedInto[slug2c[e.from]] = slug2c[e.into];
      else if (e.type === "cutSem") cutSemSet.add(semSigOf(e.a, e.b));
      else if (e.type === "cutAtt") cutAttSet.add(e.sig);
      else if (e.type === "wSem") wSem.set(semSigOf(e.a, e.b), e.w);
      else if (e.type === "wAtt") wAtt.set(e.sig, e.w);
      else if (e.type === "link" && nodeExists(e.a) && nodeExists(e.b))
        addedLinks.push(e);
      else if (e.type === "att" && String(e.tL || "").trim()
               && rByName[norm(e.rL)] !== undefined)
        addedKw.push(e);
      else if (e.type === "desc" && String(e.text || "").trim()
               && rByName[norm(e.rL)] !== undefined)
        saidDesc.push(e);
    }
    buildIndexes();
  }
  function nodeExists(k) {
    const [ty, i] = parseKey(k);
    return ty === "t" ? !!T[i] : !!C[i];
  }
  const getEdits = () => edits;

  // ---------- indexes (rebuilt whenever edits change) ---------------------
  let norm2term = {}, alias2c = {}, adj = {}, attByTerm = {}, attByR = {},
      termConcepts = {}, conceptTerms = {}, aliasList = [];

  function addAdj(ka, kb, rel, note, sig) {
    const inv = { broader: "narrower", narrower: "broader" }[rel] || rel;
    (adj[ka] = adj[ka] || []).push({ o: kb, rel, note, sig });
    (adj[kb] = adj[kb] || []).push({ o: ka, rel: inv, note, sig });
  }

  function buildIndexes() {
    norm2term = {}; alias2c = {}; adj = {}; attByTerm = {}; attByR = {};
    termConcepts = {}; conceptTerms = {}; aliasList = [];

    /* Back to what the file said, then forward through the edits again.
       Rebuilding rather than patching is what makes undo a matter of
       dropping one record from a list. */
    T.length = T_BASE;
    att.length = ATT_BASE;
    R.forEach((r, i) => {
      r.kwRaw = KW_BASE[i];
      r.desc = r.descBase = DESC_BASE[i];
      r.descEdit = null;
    });
    /* A rewritten description replaces the text and nothing else. It mints
       no term, cuts no attachment and moves no weight: what the Atlas KNOWS
       about this researcher was measured by the build out of the original
       words, and it goes on saying exactly what it said. Last edit wins, so
       a rewrite of a rewrite reads as one act rather than a pile. The id is
       kept on the researcher so the dossier can offer the undo and mark the
       text as his rather than the database's. */
    for (const e of saidDesc) {
      const ri = rByName[norm(e.rL)];
      if (ri === undefined) continue;
      R[ri].desc = String(e.text);
      R[ri].descEdit = e.id;
    }

    T.forEach((t, i) => { if (norm2term[t.norm] === undefined) norm2term[t.norm] = i; });

    /* A hand-assigned keyword is a declared keyword and nothing less: it is
       written onto the end of the researcher's own keyword line, so the
       snippet that explains a hit quotes it in place exactly as it quotes
       one that came out of the source database. A word already in the
       vocabulary is reused rather than minted twice — the same word said
       by two people is one word. The last slot remembers which edit put it
       there, so the dossier knows to offer undo rather than a cut. */
    for (const e of addedKw) {
      const lbl = String(e.tL).trim(), nm = norm(lbl);
      if (!nm) continue;
      const ri = rByName[norm(e.rL)];
      let ti = norm2term[nm];
      if (ti === undefined) { ti = T.length; T.push({ label: lbl, norm: nm }); norm2term[nm] = ti; }
      if (cutAttSet.has([nm, R[ri].name, 1, "kw", -1].join("\u00a7"))) continue;
      const had = R[ri].kwRaw || "";
      const sep = (had && !/[;,]\s*$/.test(had)) ? "; " : "";
      const st = had.length + sep.length, en = st + lbl.length;
      R[ri].kwRaw = had + sep + lbl;
      att.push([ti, ri, 1, "kw", -1, st, en, st, en, 1, e.id]);
    }

    C.forEach((c, i) => {
      const ri = resolveC(i);
      for (const a of [c.label, ...c.aliases]) {
        const nm = norm(a);
        if (nm && alias2c[nm] === undefined) alias2c[nm] = ri;
      }
    });
    for (const nm in alias2c) aliasList.push(nm);

    for (const e of G.sem) {
      let ka = key(e[0], e[0] === "c" ? resolveC(e[1]) : e[1]);
      let kb = key(e[2], e[2] === "c" ? resolveC(e[3]) : e[3]);
      if (ka === kb) continue;
      const sig = semSigOf(ka, kb);
      if (cutSemSet.has(sig)) continue;
      addAdj(ka, kb, e[4], e[5], sig);
    }
    placeAdded();
    for (const e of addedLinks) {
      const ka = e.a[0] === "c" ? key("c", resolveC(parseKey(e.a)[1])) : e.a;
      const kb = e.b[0] === "c" ? key("c", resolveC(parseKey(e.b)[1])) : e.b;
      if (ka === kb) continue;
      const sig = semSigOf(ka, kb);
      if (cutSemSet.has(sig)) continue;
      addAdj(ka, kb, e.rel, e.note || "hand-added link", sig);
    }
    // dedupe adjacency (merges can duplicate edges)
    for (const k in adj) {
      const seen = new Set(), out = [];
      for (const e of adj[k]) {
        const s = e.o + "·" + e.rel;
        if (!seen.has(s)) { seen.add(s); out.push(e); }
      }
      adj[k] = out;
    }

    att.forEach((a, ai) => {
      if (cutAttSet.has(attSig(a))) return;
      (attByTerm[a[0]] = attByTerm[a[0]] || []).push(ai);
      (attByR[a[1]] = attByR[a[1]] || []).push(ai);
    });

    for (const k in adj) {
      if (k[0] !== "t") continue;
      for (const e of adj[k]) {
        if (e.o[0] === "c" && (e.rel === "equivalent" || e.rel === "lexical")) {
          (termConcepts[k] = termConcepts[k] || []).push({ c: e.o, rel: e.rel });
          (conceptTerms[e.o] = conceptTerms[e.o] || []).push({ t: k, rel: e.rel });
        }
      }
    }
  }

  /* ---------- filing a hand-assigned keyword ----------------------------
     Where a word belongs is decided by the two rules the build used: the
     word IS one of the names a concept answers to (`equivalent`), or one
     of those names appears inside it as a whole run of words (`lexical`).
     Every one of the 1,538 term-to-concept edges in the file is one or the
     other, with no third kind.

     Run forwards, though, the rules are looser than whatever the build
     actually did: they propose 594 edges the file does not have and would
     file 274 words it deliberately left alone, so the build applied some
     further restriction that is not recoverable from the output. Two
     consequences, and both are deliberate.

     One: the file's own placements are read as they always were and are
     never recomputed. The graph behaves exactly as it did before this
     existed.

     Two: only a word carrying one of Mark's own keyword edits is filed
     here, and only if the file left it with no concept at all. So the
     rules decide nothing except where his own words go.

     `best` is the longest matching name measured in characters, earliest
     start breaking a tie, and one concept per word — which is the shape
     the file has, every one of its 1,538 words having exactly one. Checked
     against the file it agrees on 1,516 of the 1,534 it can see, and never
     disagrees about `equivalent` versus `lexical`. */
  function candidates(nm) {
    const w = String(nm || "").split(" ");
    if (!w[0]) return [];
    const out = [];
    for (let a = 0; a < w.length; a++) {
      for (let b = w.length; b > a; b--) {
        const run = w.slice(a, b).join(" "), ci = alias2c[run];
        if (ci === undefined) continue;
        out.push({ c: ci, run, start: a,
                   rel: (a === 0 && b === w.length) ? "equivalent" : "lexical" });
      }
    }
    return out;
  }
  function best(nm) {
    const list = candidates(nm);
    if (!list.length) return null;
    list.sort((x, y) => y.run.length - x.run.length || x.start - y.start);
    return list[0];
  }
  function hasConcept(tk) {
    return (adj[tk] || []).some(e => e.o[0] === "c"
      && (e.rel === "equivalent" || e.rel === "lexical"));
  }
  function placeAdded() {
    const done = new Set();
    for (const e of addedKw) {
      const ti = norm2term[norm(String(e.tL || ""))];
      if (ti === undefined || done.has(ti)) continue;
      done.add(ti);
      const tk = key("t", ti);
      if (hasConcept(tk)) continue;
      const b = best(T[ti].norm);
      if (!b) continue;
      const ck = key("c", b.c), sig = semSigOf(tk, ck);
      if (cutSemSet.has(sig)) continue;
      addAdj(tk, ck, b.rel, null, sig);
    }
  }

  /* What would happen to a word if it were assigned now — the answer the
     add-a-keyword box shows while it is being typed, so nothing about the
     filing is a surprise after the fact. */
  function previewPlacement(label) {
    const nm = norm(label || "");
    if (!nm) return null;
    const ti = norm2term[nm];
    if (ti !== undefined) {
      const cs = termConcepts[key("t", ti)] || [];
      if (cs.length) return { known: true, filed: true,
        concept: conceptLabel(parseKey(cs[0].c)[1]), rel: cs[0].rel, via: null };
      const b0 = best(nm);
      return b0 ? { known: true, filed: false, concept: conceptLabel(b0.c), rel: b0.rel, via: b0.run }
                : { known: true, filed: false, concept: null };
    }
    const b = best(nm);
    return b ? { known: false, filed: false, concept: conceptLabel(b.c), rel: b.rel, via: b.run }
             : { known: false, filed: false, concept: null };
  }

  // ---------- matching ----------------------------------------------------
  // Mechanical string matching only — every match is labelled with how it
  // matched, so nothing silent gets into a path.
  const MTQ = { exact: 1, alias: 1, contains: 0.75, within: 0.7, words: 0.6, fuzzy: 0.5 };

  function editDistLe(a, b, maxd) {     // banded Damerau-Levenshtein
    if (Math.abs(a.length - b.length) > maxd) return maxd + 1;
    const la = a.length, lb = b.length;
    let prev2 = null, prev = [...Array(lb + 1).keys()];
    for (let i = 1; i <= la; i++) {
      const cur = [i];
      let rowMin = i;
      for (let j = 1; j <= lb; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
          v = Math.min(v, prev2[j - 2] + cost);
        cur.push(v); if (v < rowMin) rowMin = v;
      }
      if (rowMin > maxd) return maxd + 1;
      prev2 = prev; prev = cur;
    }
    return prev[lb];
  }

  function matchQuery(q, strict) {
    // strict: 0 exact/alias only · 1 + containment/words · 2 + fuzzy
    const nm = norm(q);
    if (!nm) return { nm, matches: [] };
    const out = [], seen = new Set();
    const push = (k, mt, via) => {
      if (!seen.has(k)) { seen.add(k); out.push({ k, mt, via }); }
    };
    if (norm2term[nm] !== undefined) push(key("t", norm2term[nm]), "exact");
    if (alias2c[nm] !== undefined) push(key("c", alias2c[nm]), "alias", nm);

    if (strict >= 1) {
      const pnm = " " + nm + " ";
      const conts = [], withins = [], words = [];
      const qwords = nm.split(" ").filter(w => w.length >= 3);
      T.forEach((t, i) => {
        if (t.norm === nm) return;
        const pt = " " + t.norm + " ";
        if (pt.includes(pnm)) conts.push([t.norm.length, i]);
        else if (nm.length > t.norm.length + 2 && pnm.includes(pt))
          withins.push([-t.norm.length, i]);
        else if (qwords.length > 1 && qwords.every(w => pt.includes(" " + w + " ") || pt.includes(" " + w)))
          words.push([t.norm.length, i]);
      });
      conts.sort((a, b) => a[0] - b[0]).slice(0, 40)
        .forEach(([, i]) => push(key("t", i), "contains"));
      for (const anm of aliasList) {
        if (anm !== nm && (" " + anm + " ").includes(pnm))
          push(key("c", alias2c[anm]), "contains", anm);
      }
      withins.sort((a, b) => a[0] - b[0]).slice(0, 12)
        .forEach(([, i]) => push(key("t", i), "within"));
      words.sort((a, b) => a[0] - b[0]).slice(0, 25)
        .forEach(([, i]) => push(key("t", i), "words"));
    }

    if (strict >= 2 && out.length === 0 && nm.length >= 5) {
      const maxd = nm.length >= 9 ? 2 : 1;
      const hits = [];
      T.forEach((t, i) => {
        const d = editDistLe(nm, t.norm, maxd);
        if (d <= maxd) hits.push([d, t.norm.length, key("t", i)]);
      });
      for (const anm of aliasList) {
        const d = editDistLe(nm, anm, maxd);
        if (d <= maxd) hits.push([d, anm.length, key("c", alias2c[anm]), anm]);
      }
      hits.sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, 10)
        .forEach(h => push(h[2], "fuzzy", h[3]));
    }
    return { nm, matches: out };
  }

  // researcher-name match (independent of the graph)
  function matchNames(q) {
    const nm = norm(q);
    if (nm.length < 3) return [];
    const out = [];
    R.forEach((r, i) => {
      const rn = norm(r.name);
      if (rn.includes(nm)) out.push(i);
    });
    return out;
  }

  /* A rewritten description is searched as plain text, beside the graph and
     never through it. The rewrite mints no term (see the edit overlay), so
     without this a word Mark wrote about a colleague could not find them —
     he would type it and get nothing. It reads only descriptions he has
     rewritten: the source's own were already searched by the build, and
     everything they hold is in the graph. A hit here is a flag on the
     researcher, like a name hit, with no path, no weight and no score. */
  function matchSaid(q) {
    const nm = norm(q);
    if (nm.length < 3) return [];
    const out = [];
    R.forEach((r, i) => {
      if (r.descEdit && (" " + norm(r.desc) + " ").includes(" " + nm + " ")) out.push(i);
    });
    return out;
  }

  // when nothing matches: nearest labels, ranked by shared words then distance
  function suggestions(q, cap = 9) {
    const nm = norm(q);
    if (!nm) return [];
    const qw = new Set(nm.split(" "));
    const cand = [];
    const consider = (lbl, k) => {
      const ln = norm(lbl); if (!ln || ln === nm) return;
      let shared = 0, pref = 0;
      const lw = ln.split(" ");
      for (const w of lw) if (qw.has(w)) shared++;
      if (!shared)                       // last resort: shared 5-char stems
        outer: for (const a of qw) for (const w of lw)
          if (a.length >= 5 && w.length >= 5 && a.slice(0, 5) === w.slice(0, 5)) { pref = 1; break outer; }
      const d = editDistLe(nm, ln, 3);
      const score = shared * 10 + pref * 4 - (d > 3 ? 3.5 : d) - Math.abs(ln.length - nm.length) * 0.1;
      if (shared > 0 || pref > 0 || d <= 3) cand.push({ score, lbl, k });
    };
    T.forEach((t, i) => consider(t.label, key("t", i)));
    C.forEach((c, i) => { if (resolveC(i) === i) consider(c.label, key("c", i)); });
    cand.sort((a, b) => b.score - a.score);
    const seen = new Set(), out = [];
    for (const c of cand) {
      const ln = norm(c.lbl);
      if (seen.has(ln)) continue;
      seen.add(ln); out.push(c);
      if (out.length >= cap) break;
    }
    return out;
  }

  // ---------- traversal ---------------------------------------------------
  // BFS from every match, over semantic edges, up to maxHops. Reaching a
  // term node collects its attachments. A hit = one full path:
  //   query —match→ node —rel→ … —rel→ term ⇒ attachment(layer, source)
  function traverse(matches, maxHops) {
    const hits = [];                      // {rid, ai, d, path, mt, weight}
    const bestDepth = new Map();
    const queue = [];
    for (const m of matches) {
      queue.push({ k: m.k, d: 0, path: [], mt: m.mt, via: m.via, w: 1 });
      bestDepth.set(m.k, 0);
    }
    let qi = 0;
    while (qi < queue.length) {
      const cur = queue[qi++];
      const [ty, idx] = parseKey(cur.k);
      if (ty === "t") {
        const atts = attByTerm[idx] || [];
        for (const ai of atts) {
          const a = att[ai];
          const aw = wAtt.get(attSig(a));
          hits.push({ rid: a[1], ai, d: cur.d, path: cur.path, mt: cur.mt,
                      via: cur.via, w: cur.w * (aw === undefined ? 1 : aw),
                      landing: cur.k });
        }
      }
      if (cur.d >= maxHops) continue;
      for (const e of adj[cur.k] || []) {
        const nd = cur.d + 1;
        const prev = bestDepth.get(e.o);
        if (prev !== undefined && prev <= nd) continue;
        bestDepth.set(e.o, nd);
        const ew = wSem.get(e.sig);
        queue.push({ k: e.o, d: nd, mt: cur.mt, via: cur.via,
                     w: cur.w * (ew === undefined ? 1 : ew),
                     path: [...cur.path, { rel: e.rel, k: e.o, sig: e.sig, note: e.note }] });
      }
    }
    return hits;
  }

  // ---------- search: group hits per researcher, score for ordering -------
  function search(chips, opts) {
    const { maxHops, strict, weights, decay, requireAll } = opts;
    const perChip = [];
    let anyMatch = false;
    for (const q of chips) {
      const { nm, matches } = matchQuery(q, strict);
      const names = matchNames(q), said = matchSaid(q);
      if (matches.length || names.length || said.length) anyMatch = true;
      const hits = matches.length ? traverse(matches, maxHops) : [];
      perChip.push({ q, nm, matches, hits, names, said });
    }
    const byR = new Map();
    perChip.forEach((pc, ci) => {
      for (const h of pc.hits) {
        let e = byR.get(h.rid);
        if (!e) { e = { rid: h.rid, score: 0, sl: [0, 0, 0, 0], chips: {}, nameHit: false, saidHit: false }; byR.set(h.rid, e); }
        const a = att[h.ai];
        const contrib = weights[a[2]] * Math.pow(decay, h.d) * MTQ[h.mt] * h.w
                        * Math.min(a[9], 2);
        e.score += contrib;
        e.sl[a[2]] += contrib;
        (e.chips[ci] = e.chips[ci] || []).push(h);
      }
      for (const rid of pc.names) {
        let e = byR.get(rid);
        if (!e) { e = { rid, score: 0, sl: [0, 0, 0, 0], chips: {}, nameHit: false, saidHit: false }; byR.set(rid, e); }
        e.nameHit = true;
      }
      for (const rid of pc.said) {
        let e = byR.get(rid);
        if (!e) { e = { rid, score: 0, sl: [0, 0, 0, 0], chips: {}, nameHit: false, saidHit: false }; byR.set(rid, e); }
        e.saidHit = true;
      }
    });
    let list = [...byR.values()];
    if (requireAll && chips.length > 1) {
      list = list.filter(e =>
        perChip.every((pc, ci) =>
          (e.chips[ci] && e.chips[ci].length) || pc.names.includes(e.rid)
          || pc.said.includes(e.rid)));
    }
    // order hits inside each chip group: layer asc? No — by contribution desc,
    // then depth asc; the display keeps both dimensions visible regardless.
    for (const e of list) {
      for (const ci in e.chips) {
        e.chips[ci].sort((x, y) => {
          const ax = att[x.ai], ay = att[y.ai];
          const cx = weights[ax[2]] * Math.pow(decay, x.d) * MTQ[x.mt] * x.w;
          const cy = weights[ay[2]] * Math.pow(decay, y.d) * MTQ[y.mt] * y.w;
          return cy - cx || x.d - y.d || ax[2] - ay[2];
        });
        // collapse duplicate (landing term, layer, source) rows
        const seen = new Set(), ded = [];
        for (const h of e.chips[ci]) {
          const a = att[h.ai];
          const s = h.landing + "·" + a[2] + "·" + a[3] + "·" + a[4] + "·" + a[5];
          if (!seen.has(s)) { seen.add(s); ded.push(h); }
        }
        e.chips[ci] = ded;
      }
    }
    /* A hit in his own words ranks just under a name hit. It has no score,
       and at the foot of the list it fell past the 40 cards shown whenever
       the word was a common one — the one place he looked for it. */
    list.sort((a, b) => (b.nameHit - a.nameHit) || (b.saidHit - a.saidHit) || (b.score - a.score));
    return { perChip, list, anyMatch };
  }

  // ---------- neighborhood (walk mode) ------------------------------------
  function neighborhood(k) {
    return adj[k] || [];
  }
  function attachmentsOfTerm(ti) { return (attByTerm[ti] || []).map(ai => [ai, att[ai]]); }
  function attachmentsOfR(ri) { return (attByR[ri] || []).map(ai => [ai, att[ai]]); }
  function conceptsOfTerm(tk) { return termConcepts[tk] || []; }
  function termsOfConcept(ck) { return conceptTerms[ck] || []; }

  buildIndexes();

  return { norm, parseKey, label, resolveC,
           setEdits, getEdits, attSig, semSigOf,
           suggestions, search,
           neighborhood, attachmentsOfTerm, attachmentsOfR,
           conceptsOfTerm, termsOfConcept, previewPlacement,
           T, C, R, P, att: att };
})();

/* ======================================================================
   UI — three interconnected ways in: Search, Browse, Map & walk.
   A shared dossier panel and a shared edit overlay sit under all three.
   ====================================================================== */

// ---------- tiny helpers ---------------------------------------------------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g,
  c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const T = Core.T, C = Core.C, R = Core.R, P = Core.P;
const LNAME = { 1: "declared keyword", 2: "description", 3: "abstract" };
const DOMC = { "Mathematics": "var(--dm)", "Computer Science": "var(--dc)", "Data Science": "var(--dd)" };
const MTG = { exact: "=", alias: "≡", contains: "⊇", within: "⊆", words: "∋", fuzzy: "≈" };
const MTT = { exact: "exact term", alias: "vocabulary alias", contains: "query contained in label",
              within: "label contained in query", words: "all query words in label", fuzzy: "fuzzy match" };
const RELG = { equivalent: "≡", broader: "⊃", narrower: "⊂", related: "~", lexical: "⌐" };

function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._h); toast._h = setTimeout(() => t.classList.remove("show"), 2200);
}

// ---------- persistence ----------------------------------------------------
const Store = {
  KEY: "atlas-edits-v1",
  TS: "atlas-edits-v1-ts",
  /* Edits stored but unreadable start the room empty and are never
     written over: the first edit made afterwards used to replace every
     one of them with itself. Only a whole set handed over (applyState —
     the cloud, an import, a restore point) lifts the refusal, as it does
     for the Marketplace's board and the notes. */
  async load() {
    let r = null;
    try { r = await window.storage.get(Store.KEY); }
    catch (e) { return []; }   /* storage unavailable: nothing to protect */
    if (!r || !r.value) return [];
    try {
      const d = JSON.parse(r.value);
      if (d && Array.isArray(d.edits)) return d.edits;
    } catch (e) { console.error("atlas: unreadable edits", e); }
    Store.unread = true;
    Hub.note("The Atlas could not read its saved edits — starting without them, and saving nothing. " +
      "They are untouched until the cloud or an import brings them back.", 10000);
    return [];
  },
  async save(edits) {
    if (Store.unread) return;
    try { await window.storage.set(Store.KEY, JSON.stringify({ v: 1, edits })); }
    catch (e) { Store.volatile = true; }
  },
  volatile: false,
  unread: false,
};

// ---------- state ----------------------------------------------------------
const State = {
  mode: "search",
  editing: false,
  /* Assigning keywords is Mark's everyday act and is deliberately NOT
     behind the graph-wide Edit toggle: that one guards cuts and merges,
     which are careful things, and having to arm the whole graph to write
     down what a colleague works on was a toll on the wrong side of the
     door. It is one flag rather than one per researcher, so a pass down
     the department stays open as you go from dossier to dossier. */
  kwEdit: false,
  /* Which researcher's description is open in its editor, or null. Unlike
     `kwEdit` this is not a pass down the department: a description is
     written once, thought about, and left. */
  descEdit: null,
  /* Text the description editor opens with instead of the description, once:
     "add to description" on an accepted finding puts the passage there for
     Mark to reword, rather than writing it into the Atlas unread. */
  descSeed: null,
  newsKind: "all",
  chips: [],
  opts: { maxHops: 2, strict: 1, weights: [0, 3, 2, 1], decay: 0.6, requireAll: false },
  lastResult: null,
  expanded: new Set(),        // "rid:ci" path groups fully shown
  openSnips: new Set(),       // hit ids with open snippet
  treeOpen: new Set(),        // browse tree expansion
  treeFilter: "",
  browseSel: null,
  walk: { focus: { kind: "map" }, trail: [], caps: {}, sel: null, hl: null },
  view: { k: 1, tx: 0, ty: 0 },
};

// The one place edits reach disk, so it is also the one place the cloud
// hears that there is something to send. The room knows of no cloud —
// bridge.js listens for this, exactly as it does for Semaphore and Notes.
// The stamp is an ISO date because that is what the sync weighs against
// the cloud row's own updated_at.
async function saveEdits() {
  if (Store.unread) return;
  await Store.save(Core.getEdits());
  try { await window.storage.set(Store.TS, new Date().toISOString()); } catch (e) {}
  try { Hub.emit("atlas:saved"); } catch (e) {}
}

function addEdit(e) {
  e.id = Math.random().toString(36).slice(2, 9); e.ts = Date.now();
  Core.setEdits([...Core.getEdits(), e]);
  saveEdits(); refresh();
}
function removeEdit(id) {
  Core.setEdits(Core.getEdits().filter(e => e.id !== id));
  saveEdits(); refresh();
}

function refresh() {
  renderRail();
  if (State.mode === "search") renderSearch();
  else if (State.mode === "browse") renderBrowse();
  else if (State.mode === "news") renderNews();
  else renderWalk();
}

// ---------- modal ----------------------------------------------------------
function openModal(html) { $("#modalbox").innerHTML = html; $("#modal").classList.add("open"); }
function closeModal() { $("#modal").classList.remove("open"); }
$("#modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });

// node picker: search across concepts + terms, callback with key
function pickNode(title, kinds, cb) {
  openModal(`<div class="mh">${esc(title)}</div><div class="mb">
    <input type="text" id="pickq" placeholder="Type to search ${kinds.includes("t") ? "terms & concepts" : "concepts"}…">
    <div id="pickr"></div></div>`);
  const inp = $("#pickq"), out = $("#pickr");
  const run = () => {
    const q = Core.norm(inp.value);
    const rows = [];
    if (q.length >= 2) {
      if (kinds.includes("c")) C.forEach((c, i) => {
        if (Core.resolveC(i) !== i) return;
        const hay = Core.norm(c.label + " " + c.aliases.join(" "));
        if (hay.includes(q)) rows.push({ k: "c" + i, l: c.label, s: "concept · " + (c.msc[0] || c.id) });
      });
      if (kinds.includes("t")) T.forEach((t, i) => {
        if (t.norm.includes(q)) rows.push({ k: "t" + i, l: t.label, s: "term" });
      });
    }
    out.innerHTML = rows.slice(0, 30).map(r =>
      `<div class="pickrow" data-k="${r.k}"><span>${esc(r.l)}</span><span class="sub">${esc(r.s)}</span></div>`
    ).join("") || `<div class="hint">${q.length >= 2 ? "Nothing with that in its label." : "Keep typing…"}</div>`;
    out.querySelectorAll(".pickrow").forEach(el =>
      el.onclick = () => { closeModal(); cb(el.dataset.k); });
  };
  inp.oninput = run; inp.focus(); run();
}

function pickWeight(title, cur, cb) {
  openModal(`<div class="mh">${esc(title)}</div><div class="mb">
    <div class="wrow"><label for="wslide">weight</label>
      <input type="range" id="wslide" min="0" max="3" step="0.1" value="${cur}">
      <span class="val" id="wval">×${cur}</span></div>
    <div class="hint">Multiplies every path through this link. 0 silences it without cutting.</div></div>
    <div class="mfoot"><button class="sbtn" id="wcancel">Cancel</button>
    <button class="sbtn" id="wok">Set weight</button></div>`);
  $("#wslide").oninput = () => $("#wval").textContent = "×" + $("#wslide").value;
  $("#wcancel").onclick = closeModal;
  $("#wok").onclick = () => { const v = +$("#wslide").value; closeModal(); cb(v); };
}

// ---------- edit actions ----------------------------------------------------
function cutSemEdge(sig, aLbl, bLbl) {
  const [a, b] = sig.split("|");
  addEdit({ type: "cutSem", a, b, aL: aLbl, bL: bLbl });
  toast("Link cut — undo in the edits panel");
}
function weighSemEdge(sig, aLbl, bLbl) {
  const [a, b] = sig.split("|");
  const cur = Core.getEdits().find(e => e.type === "wSem" && Core.semSigOf(e.a, e.b) === sig);
  pickWeight(`Weight link: ${aLbl} — ${bLbl}`, cur ? cur.w : 1, w => {
    Core.setEdits(Core.getEdits().filter(e => !(e.type === "wSem" && Core.semSigOf(e.a, e.b) === sig)));
    addEdit({ type: "wSem", a, b, w, aL: aLbl, bL: bLbl });
  });
}
function cutAttachment(ai) {
  const a = Core.att[ai];
  addEdit({ type: "cutAtt", sig: Core.attSig(a),
            tL: T[a[0]].label, rL: R[a[1]].name, layer: a[2] });
  toast("Attachment cut");
}
function weighAttachment(ai) {
  const a = Core.att[ai]; const sig = Core.attSig(a);
  const cur = Core.getEdits().find(e => e.type === "wAtt" && e.sig === sig);
  pickWeight(`Weight: “${T[a[0]].label}” → ${R[a[1]].name} (${LNAME[a[2]]})`,
    cur ? cur.w : 1, w => {
      Core.setEdits(Core.getEdits().filter(e => !(e.type === "wAtt" && e.sig === sig)));
      addEdit({ type: "wAtt", sig, w, tL: T[a[0]].label, rL: R[a[1]].name, layer: a[2] });
    });
}
/* Assigning a keyword. The box says where the word will be filed while it
   is still being typed, so the filing is never something you find out
   about afterwards — which is the whole bargain: the app does it, and it
   says what it did, and one press undoes it. */
function addKeyword(rid, seed) {
  const who = R[rid].name;
  const IDLE = "Type a keyword. Where it files itself is shown here before you commit it.";
  openModal(`<div class="mh">Assign a keyword to ${esc(who)}</div><div class="mb">
    <input type="text" id="kwq" autocomplete="off"
      placeholder="A word or short phrase — e.g. geometric deep learning">
    <div class="hint" id="kwsay" style="margin-top:11px">${IDLE}</div></div>
    <div class="mfoot"><button class="sbtn" id="kwcancel">Cancel</button>
    <button class="sbtn" id="kwok">Assign</button></div>`);
  const inp = $("#kwq"), say = $("#kwsay");
  function look() {
    const v = inp.value.trim();
    if (!v) { say.textContent = IDLE; return; }
    const p = Core.previewPlacement(v);
    if (!p) { say.textContent = IDLE; return; }
    if (p.filed)
      say.innerHTML = `Already in the vocabulary, filed under <b>${esc(p.concept)}</b>.`;
    else if (p.concept)
      say.innerHTML = `Files under <b>${esc(p.concept)}</b> — ` + (p.rel === "equivalent"
        ? "the word is one of that concept's own names."
        : `it contains “${esc(p.via)}”.`);
    else
      say.innerHTML = `No concept answers to this yet. It will still be found by `
        + `searching for it, and you can place it by hand from <b>Map &amp; walk</b>.`;
  }
  function go() {
    const v = inp.value.trim();
    if (!v) return;
    const p = Core.previewPlacement(v);
    closeModal();
    addEdit({ type: "att", tL: v, rL: who });
    openDossier(rid);
    toast(p && p.concept ? `“${v}” assigned — filed under ${p.concept}`
                         : `“${v}” assigned — no concept answers to it yet`);
  }
  inp.oninput = look;
  inp.onkeydown = ev => { if (ev.key === "Enter") go(); };
  $("#kwcancel").onclick = closeModal;
  $("#kwok").onclick = go;
  if (seed) { inp.value = seed; look(); }
  inp.focus();
}

/* Setting a rank by hand, from the head band. Four presses for the four
   ranks the department actually uses, and a line to type anything else a
   page calls somebody, so an emeritus or a guest professor is not forced
   into one of the four. The rank the agent proposes arrives the other way,
   through News; this is the same field written directly, and the dossier
   says which of the two put the rank there. */
function setRank(rid) {
  const who = R[rid].name, cur = rankOf(who);
  openModal(`<div class="mh">Rank of ${esc(who)}</div><div class="mb">
    <div class="rowbtns" style="margin-bottom:10px">${RANKS.map(x =>
      `<button class="sbtn${cur && cur.rank === x ? " on" : ""}" data-rk="${esc(x)}">${esc(x)}</button>`).join("")}</div>
    <input type="text" id="rkother" autocomplete="off"
      placeholder="Or as a page words it \u2014 e.g. Emeritus professor">
    <div class="hint" id="rksay">${cur
      ? `Now <b>${esc(cur.rank)}</b>, ${cur.fid ? "accepted from News" : "set by hand"}`
        + `${cur.asOf ? `, happened ${esc(asOfText(cur.asOf, cur.gran))}` : ""}`
        + `${cur.url ? ` \u00b7 <a href="${esc(cur.url)}" target="_blank" rel="noopener">${esc(hostOf(cur.url))} \u2197</a>` : ""}.`
      : `The source data says nothing about rank, so this is yours to write down \u2014 or wait for the nightly agent to read it off their Pure page.`}</div></div>
    <div class="mfoot">${cur ? `<button class="sbtn danger" id="rkclear">Remove</button>` : ""}
      <button class="sbtn" id="rkcancel">Cancel</button>
      <button class="sbtn" id="rkok">Set</button></div>`);
  /* One rank per researcher: a new one replaces the old rather than landing
     on top of it, so the edits panel does not fill with a row for every
     promotion the agent ever read. */
  function put(v) {
    if (cur) Core.setEdits(Core.getEdits().filter(e => e.id !== cur.id));
    closeModal();
    addEdit({ type: "rank", rL: who, rank: v });
    openDossier(rid);
    toast(who + " \u2014 " + v.toLowerCase());
  }
  const box = $("#modalbox");
  box.querySelectorAll("[data-rk]").forEach(b => b.onclick = () => put(b.dataset.rk));
  const other = $("#rkother");
  other.onkeydown = ev => { if (ev.key === "Enter" && other.value.trim()) put(other.value.trim()); };
  $("#rkcancel").onclick = closeModal;
  $("#rkok").onclick = () => { const v = other.value.trim(); if (v) put(v); };
  const cl = $("#rkclear");
  if (cl) cl.onclick = () => { closeModal(); removeEdit(cur.id); openDossier(rid); toast("Rank removed from " + who); };
}

/* Writing a description. One record per researcher rather than a pile of
   them — a rewrite of a rewrite replaces the one before it, the way a
   weight does — so the edits panel says "this is what it says now" and one
   undo puts the database's own words back. Saving the source text
   unchanged, or saving an empty box over a description there was none of,
   files nothing: an edit that changes nothing is only something to undo
   later. Clearing a description that HAS text is a real act and is kept. */
function saveDescription(rid, text) {
  const r = R[rid], who = r.name, next = String(text || "").trim();
  const base = (r.descBase && r.descBase !== "nan") ? r.descBase.trim() : "";
  State.descEdit = null;
  const prior = Core.getEdits().filter(e => e.type === "desc" && e.rL === who);
  if (next === base) {
    if (prior.length) {
      Core.setEdits(Core.getEdits().filter(e => !(e.type === "desc" && e.rL === who)));
      saveEdits(); refresh();
      toast("Back to the source database's own description");
    }
    openDossier(rid);
    return;
  }
  if (prior.length)
    Core.setEdits(Core.getEdits().filter(e => !(e.type === "desc" && e.rL === who)));
  addEdit({ type: "desc", rL: who, text: next });
  openDossier(rid);
  toast(`Description written for ${who}`);
}

/* Taking one off. A keyword this room assigned is undone by dropping the
   edit that made it; one that came out of the source database has no edit
   to drop, so it is cut the way every other attachment is. Either way it
   is one press, and either way it shows in the edits panel with an undo. */
function dropKeyword(ai, rid) {
  const a = Core.att[ai];
  if (!a) return;
  const lbl = T[a[0]].label, byEdit = a[10];
  if (byEdit) {
    removeEdit(byEdit);
    openDossier(rid);
    toast(`“${lbl}” taken off ${R[rid].name}`);
    return;
  }
  cutAttachment(ai);
  openDossier(rid);
}

function mergeConcept(fromIdx) {
  pickNode(`Merge “${C[fromIdx].label}” into…`, ["c"], k => {
    const into = Core.parseKey(k)[1];
    if (into === fromIdx) return toast("That is the same concept");
    addEdit({ type: "merge", from: C[fromIdx].id, into: C[into].id,
              fromL: C[fromIdx].label, intoL: C[into].label });
    if (State.walk.focus.kind === "c" && State.walk.focus.i === fromIdx)
      State.walk.focus = { kind: "c", i: into };
    toast(`Merged into ${C[into].label}`);
  });
}
function addLink(fromKey) {
  pickNode(`Link “${esc(Core.label(fromKey))}” to…`, ["c", "t"], k => {
    if (k === fromKey) return;
    openModal(`<div class="mh">Relation type</div><div class="mb">
      <div class="seg" id="relseg">
        ${["related", "equivalent", "broader", "narrower", "lexical"].map((r, i) =>
          `<button data-r="${r}" class="${i === 0 ? "on" : ""}">${r}</button>`).join("")}
      </div>
      <input type="text" id="relnote" placeholder="Why does this link exist? (note, optional)" style="margin-top:12px">
      <div class="hint">“broader” reads: ${esc(Core.label(fromKey))} ⊃ target.</div></div>
      <div class="mfoot"><button class="sbtn" id="lcancel">Cancel</button>
      <button class="sbtn" id="lok">Add link</button></div>`);
    let rel = "related";
    $("#relseg").querySelectorAll("button").forEach(b => b.onclick = () => {
      $("#relseg").querySelectorAll("button").forEach(x => x.classList.remove("on"));
      b.classList.add("on"); rel = b.dataset.r;
    });
    $("#lcancel").onclick = closeModal;
    $("#lok").onclick = () => {
      const note = $("#relnote").value.trim();
      closeModal();
      addEdit({ type: "link", a: fromKey, b: k, rel, note,
                aL: Core.label(fromKey), bL: Core.label(k) });
      toast("Link added");
    };
  });
}

// ---------- rail -----------------------------------------------------------
/* The fold is this device's own choice, not the graph's, so it lives in the
   browser rather than in the edits the cloud carries. */
const RAILFOLD = "atlas-railfold";
let railFolded = matchMedia("(pointer:coarse)").matches;
try { const f = localStorage.getItem(RAILFOLD); if (f !== null) railFolded = f === "1"; } catch (e) {}
const CHEV = d => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
function setRailFold(f) {
  railFolded = f;
  try { localStorage.setItem(RAILFOLD, f ? "1" : "0"); } catch (e) {}
  $("#body").classList.toggle("folded", f);
  /* The map's canvas is sized from its column once, when drawn. */
  if (State.mode === "walk") renderWalk();
}
$("#railOpen").innerHTML = CHEV("M9 6l6 6-6 6") + "<span>Settings</span>";
$("#railOpen").onclick = () => setRailFold(false);
$("#body").classList.toggle("folded", railFolded);

function renderRail() {
  const rail = $("#rail");
  let html = `<button class="railfold" id="railFold" type="button" title="Fold the settings away" aria-label="Fold the settings away">${CHEV("M15 6l-6 6 6 6")}</button>`;
  if (State.mode === "search") {
    const o = State.opts;
    html += `<div class="sect"><h3>Layer weights</h3>
      ${[[1, "declared"], [2, "description"], [3, "abstracts"]].map(([L, n]) => `
      <div class="wrow"><label><span class="dot l${L}"></span>${n}</label>
        <input type="range" data-w="${L}" min="0" max="3" step="0.1" value="${o.weights[L]}"
               aria-label="Weight for terms found in the ${n} layer">
        <span class="val">${o.weights[L].toFixed(1)}</span></div>`).join("")}
    </div>
    <div class="sect"><h3>Traversal</h3>
      <div class="wrow"><label>max hops</label>
        <input type="range" data-o="maxHops" min="0" max="3" step="1" value="${o.maxHops}"
               aria-label="How many vocabulary relations a match may travel through">
        <span class="val">${o.maxHops}</span></div>
      <div class="wrow"><label>hop decay</label>
        <input type="range" data-o="decay" min="0.2" max="1" step="0.05" value="${o.decay}"
               aria-label="How much each further hop costs a match">
        <span class="val">${o.decay.toFixed(2)}</span></div>
      <div class="wrow" style="margin-top:2px"><label>matching</label>
        <div class="seg" style="flex:1" id="strictseg">
          <button data-s="0" class="${o.strict === 0 ? "on" : ""}" title="exact terms and vocabulary aliases only">exact</button>
          <button data-s="1" class="${o.strict === 1 ? "on" : ""}" title="+ label containment and all-words">+contain</button>
          <button data-s="2" class="${o.strict === 2 ? "on" : ""}" title="+ fuzzy (edit distance) when nothing else matches">+fuzzy</button>
        </div></div>
      <div class="wrow"><label>terms</label>
        <div class="seg" style="flex:1" id="allseg">
          <button data-a="0" class="${!o.requireAll ? "on" : ""}">any</button>
          <button data-a="1" class="${o.requireAll ? "on" : ""}">all required</button>
        </div></div>
    </div>`;
  }
  if (State.mode === "browse") {
    html += `<div class="sect"><h3>Filter the tree</h3>
      <input class="treefilter" id="treeFilter" placeholder="Name, keyword, group…"
        value="${esc(State.treeFilter)}">
      <div class="hint">Domain → cluster → group → researcher. Declared keywords shown at a glance; click a row for the dossier.</div></div>
    <div class="sect"><h3>Departments</h3>${G.hierarchy.map(d => {
      const n = d.clusters.reduce((s, c) => s + c.groups.reduce((t, g) => t + g.members.length, 0), 0);
      return `<div class="wrow" style="margin-bottom:4px"><label style="width:auto;flex:1">
        <span class="dot" style="background:${DOMC[d.name]}"></span>${esc(d.name)}</label>
        <span class="val">${n}</span></div>`;
    }).join("")}</div>`;
  }
  if (State.mode === "walk") html += walkRailHTML();
  if (State.mode === "news") html += newsRailHTML();

  // edits panel — always present
  const eds = Core.getEdits();
  /* Said in the words the room uses on screen rather than the words the
     records are keyed by: nobody outside this file calls one an "att". */
  const ETYPE = { att: "keyword", cutAtt: "cut kw", cutSem: "cut link",
                  wAtt: "wt kw", wSem: "wt link", merge: "merge", link: "link",
                  desc: "description", fact: "news", newcomer: "newcomer",
                  rank: "position" };
  html += `<hr class="hair"><div class="sect"><h3>Graph edits (${eds.length})</h3>`;
  html += eds.slice().reverse().map(e => {
    const what = {
      cutSem: () => `<b>${esc(e.aL)}</b> — <b>${esc(e.bL)}</b>`,
      cutAtt: () => `“${esc(e.tL)}” \u2192 ${esc(e.rL)} <span class="badge l${e.layer}">${["", "K", "D", "A"][e.layer]}</span>`,
      wSem: () => `×${e.w} on <b>${esc(e.aL)}</b> — <b>${esc(e.bL)}</b>`,
      wAtt: () => `×${e.w} on “${esc(e.tL)}” → ${esc(e.rL)}`,
      merge: () => `<b>${esc(e.fromL)}</b> ⇒ <b>${esc(e.intoL)}</b>`,
      link: () => `<b>${esc(e.aL)}</b> ${RELG[e.rel] || "~"} <b>${esc(e.bL)}</b>${e.note ? " · " + esc(e.note) : ""}`,
      att: () => `“${esc(e.tL)}” \u2192 ${esc(e.rL)} <span class="badge l1" title="declared keyword">K</span>`,
      desc: () => `${esc(e.rL)} <span class="badge l2" title="description">D</span> <span class="hint">${esc(String(e.text).replace(/\s+/g, " ").slice(0, 46))}${String(e.text).length > 46 ? "\u2026" : ""}</span>`,
      fact: () => `${esc(e.rL)} <span class="hint">${e.kind === "left" ? "left TU/e" : esc(String(e.text).slice(0, 46)) + (String(e.text).length > 46 ? "\u2026" : "")}</span>`,
      newcomer: () => `${esc(e.name)} <span class="hint">${esc(e.grp || "")}</span>`,
      rank: () => `${esc(e.rL)} <span class="hint">${esc(e.rank)}</span>`,
    }[e.type];
    return `<div class="editrow"><span class="etype">${ETYPE[e.type] || e.type}</span>
      <span class="what">${what ? what() : ""}</span>
      <button class="undo" data-undo="${e.id}">undo</button></div>`;
  }).join("");
  if (eds.length || Store.volatile) {
    html += `<div class="rowbtns" style="margin-top:10px">
      <button class="sbtn" id="expEdits">Export</button>
      <button class="sbtn" id="impEdits">Import</button>
      ${eds.length ? `<button class="sbtn danger" id="clrEdits">Clear all</button>` : ""}</div>`;
    if (Store.volatile) html += `<div class="hint" style="margin-top:8px;color:var(--danger)">Persistent storage is unavailable here — edits live only in this session. Export to keep them.</div>`;
  } else {
    html += `<div class="rowbtns" style="margin-top:10px"><button class="sbtn" id="impEdits">Import edits</button></div>`;
  }
  html += `</div>`;
  rail.innerHTML = html;
  $("#railFold").onclick = () => setRailFold(true);

  rail.querySelectorAll("input[data-w]").forEach(inp => inp.oninput = () => {
    State.opts.weights[+inp.dataset.w] = +inp.value;
    inp.nextElementSibling.textContent = (+inp.value).toFixed(1);
    renderSearchResultsOnly();
  });
  rail.querySelectorAll("input[data-o]").forEach(inp => inp.oninput = () => {
    State.opts[inp.dataset.o] = +inp.value;
    inp.nextElementSibling.textContent = inp.dataset.o === "decay" ? (+inp.value).toFixed(2) : inp.value;
    renderSearchResultsOnly();
  });
  const ss = $("#strictseg");
  if (ss) ss.querySelectorAll("button").forEach(b => b.onclick = () => {
    State.opts.strict = +b.dataset.s; refresh();
  });
  const as = $("#allseg");
  if (as) as.querySelectorAll("button").forEach(b => b.onclick = () => {
    State.opts.requireAll = b.dataset.a === "1"; refresh();
  });
  const tf = $("#treeFilter");
  if (tf) {
    tf.oninput = () => { State.treeFilter = tf.value; renderBrowse(); };
    if (State.mode === "browse") tf.focus();
  }
  rail.querySelectorAll("[data-undo]").forEach(b => b.onclick = () => removeEdit(b.dataset.undo));
  const ex = $("#expEdits");
  if (ex) ex.onclick = () => {
    const blob = new Blob([JSON.stringify({ v: 1, edits: Core.getEdits() }, null, 2)],
      { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "atlas-edits.json"; a.click();
    URL.revokeObjectURL(a.href);
  };
  const im = $("#impEdits");
  if (im) im.onclick = () => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "application/json";
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      f.text().then(txt => {
        try {
          const data = JSON.parse(txt);
          Core.setEdits(data.edits || []);
          saveEdits(); refresh(); toast(`Imported ${(data.edits || []).length} edits`);
        } catch (e) { toast("That file is not an Atlas edits export"); }
      });
    };
    inp.click();
  };
  const cl = $("#clrEdits");
  if (cl) cl.onclick = () => { Core.setEdits([]); saveEdits(); refresh(); toast("All edits cleared"); };
  rail.querySelectorAll("[data-walkact]").forEach(b => wireWalkRail(b));
  rail.querySelectorAll("[data-nkind]").forEach(b => b.onclick = () => {
    State.newsKind = b.dataset.nkind; renderRail(); renderNews();
  });
}

// ---------- search mode ----------------------------------------------------
function renderSearch() {
  const main = $("#main");
  main.classList.remove("nopad");
  main.innerHTML = `
    <div id="qbar"><div id="qbox">
      ${State.chips.map((c, i) => `<span class="chip">${esc(c)}
        <button class="x" data-rm="${i}" title="Remove">×</button></span>`).join("")}
      <input id="qinput" placeholder="${State.chips.length ? "Add another term…" : "Type a term from the project — e.g. model checking, uncertainty quantification…"}">
    </div></div>
    <div id="results"></div>`;
  const inp = $("#qinput");
  inp.onkeydown = e => {
    if (e.key === "Enter" && inp.value.trim()) {
      inp.value.split(/[,;]+/).map(s => s.trim()).filter(Boolean)
        .forEach(s => { if (!State.chips.includes(s)) State.chips.push(s); });
      inp.value = ""; renderSearch();
    } else if (e.key === "Backspace" && !inp.value && State.chips.length) {
      State.chips.pop(); renderSearch();
    }
  };
  main.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => {
    State.chips.splice(+b.dataset.rm, 1); renderSearch();
  });
  inp.focus();
  renderSearchResultsOnly();
}

function renderSearchResultsOnly() {
  const out = $("#results");
  if (!out) return;
  if (!State.chips.length) {
    out.innerHTML = `<div class="empty">
      <p>Separate terms with <b>Enter</b> or commas. Try:</p>
      <div class="sugg">${["model checking", "uncertainty quantification", "graph algorithms",
        "intrusion detection", "optimal transport", "process mining"].map(s =>
        `<button class="chip clickable" data-try="${esc(s)}">${esc(s)}</button>`).join("")}</div></div>`;
    out.querySelectorAll("[data-try]").forEach(b => b.onclick = () => {
      State.chips.push(b.dataset.try); renderSearch();
    });
    State.lastResult = null;
    return;
  }
  const res = Core.search(State.chips, State.opts);
  State.lastResult = res;
  annotateStarts(res);
  let html = "";

  // per-chip entry report
  const entry = res.perChip.map((pc, ci) => {
    const n = pc.matches.length + pc.names.length + pc.said.length;
    return `<span class="chip ${n ? "" : ""}" style="${n ? "" : "border-color:var(--danger);color:var(--danger)"}">
      ${esc(pc.q)} · ${n ? `${pc.matches.length} entr${pc.matches.length === 1 ? "y" : "ies"}${pc.names.length ? " + name" : ""}${pc.said.length ? " + your description" : ""}` : "no entry point"}</span>`;
  }).join(" ");
  const shown = res.list.length;
  html += `<div class="rescount">${entry} &nbsp;→&nbsp; ${shown} researcher${shown === 1 ? "" : "s"} reached
    ${State.opts.requireAll && State.chips.length > 1 ? " (all terms required)" : ""}</div>`;

  if (!shown) {
    html += `<div class="empty"><h2>No researcher reached.</h2>`;
    const bad = res.perChip.filter(pc => !pc.matches.length && !pc.names.length && !pc.said.length);
    for (const pc of bad) {
      const sug = Core.suggestions(pc.q);
      html += `<p>“${esc(pc.q)}” has no entry point in the graph${State.opts.strict < 2 ? " (fuzzy matching is off)" : ""}.</p>`;
      if (sug.length) html += `<div class="sugg">${sug.map(s =>
        `<button class="chip clickable" data-swap="${esc(pc.q)}" data-to="${esc(s.lbl)}">${esc(s.lbl)}</button>`).join("")}</div>`;
    }
    if (!bad.length) html += `<p>Every term entered the graph, but no path reached a researcher within ${State.opts.maxHops} hop${State.opts.maxHops === 1 ? "" : "s"}. Raise <b>max hops</b>, or loosen matching.</p>`;
    html += `</div>`;
    out.innerHTML = html;
    out.querySelectorAll("[data-swap]").forEach(b => b.onclick = () => {
      const i = State.chips.indexOf(b.dataset.swap);
      if (i >= 0) State.chips[i] = b.dataset.to;
      renderSearch();
    });
    return;
  }

  const maxScore = Math.max(...res.list.map(e => e.score), 0.001);
  html += res.list.slice(0, 40).map(e => cardHTML(e, res, maxScore)).join("");
  if (res.list.length > 40) html += `<div class="hint" style="margin:6px 4px">…and ${res.list.length - 40} more, further out.</div>`;
  out.innerHTML = html;
  wireResults(out, res);
}

function cardHTML(e, res, maxScore) {
  const r = R[e.rid];
  const segs = [1, 2, 3].map(L =>
    `<i class="s${L}" style="width:${(e.sl[L] / maxScore * 100).toFixed(1)}%"></i>`).join("");
  let paths = "";
  res.perChip.forEach((pc, ci) => {
    const hits = e.chips[ci] || [];
    const nameHit = pc.names.includes(e.rid), saidHit = pc.said.includes(e.rid);
    if (!hits.length && !nameHit && !saidHit) return;
    paths += `<div class="qgroup"><b>${esc(pc.q)}</b> — ${hits.length} path${hits.length === 1 ? "" : "s"}${nameHit ? " · matches the researcher's name" : ""}${saidHit ? " · in the description you wrote" : ""}</div>`;
    if (saidHit) paths += saidSnippetHTML(r, pc.nm);
    const expanded = State.expanded.has(e.rid + ":" + ci);
    const show = expanded ? hits : hits.slice(0, 3);
    paths += show.map(h => pathHTML(pc, h)).join("");
    if (hits.length > 3 && !expanded)
      paths += `<button class="showmore" data-more="${e.rid}:${ci}">show all ${hits.length} paths ↓</button>`;
  });
  return `<div class="card" data-rid="${e.rid}">
    <div class="top">
      <span class="rname" data-doss="${e.rid}">${esc(r.name)}</span>
      <span class="raffil">${esc(r.group || r.cluster)} · ${esc(r.cluster !== (r.group || "") ? r.cluster + " · " : "")}${esc(r.domain)}${r.leader ? " · group leader" : ""}</span>
      <span class="scorewrap"><span class="sbar">${segs}</span>
        <span class="snum">${e.score.toFixed(1)}</span>
        <button class="sbtn" data-map="${e.rid}" title="Locate on the similarity map">map</button>
        <button class="sbtn" data-walkr="${e.rid}" title="Walk the graph from this researcher">walk</button></span>
    </div>
    <div class="paths">${paths}</div></div>`;
}

function pathHTML(pc, h) {
  const a = Core.att[h.ai];
  const hid = "h" + h.ai + "d" + h.d + (h.path.length ? Core.norm(h.path.map(s => s.k).join("")) : "") + h.mt;
  let s = `<div class="path" data-hid="${esc(hid)}">`;
  s += `<span class="pmt" title="${MTT[h.mt]}">${MTG[h.mt]}</span>`;
  // entry node (only if the path has hops or entry ≠ landing term)
  if (h.path.length) {
    const firstK = pathStartKey(h);
    s += nodeSpan(firstK, false, a);
    for (const st of h.path) {
      s += relSpan(st);
      s += st.k === h.landing && st === h.path[h.path.length - 1]
        ? nodeSpan(st.k, true, a) : nodeSpan(st.k, false, a);
    }
    if (h.path[h.path.length - 1].k !== h.landing) s += relSpan({ rel: "…" }) + nodeSpan(h.landing, true, a);
  } else {
    s += nodeSpan(h.landing, true, a);
  }
  s += `<span class="prel">⇒</span>`;
  s += srcSpan(a, h.ai);
  s += `<span class="pedit">
    <button class="ebtn" data-cutatt="${h.ai}" title="Cut this attachment">✕</button>
    <button class="ebtn w" data-watt="${h.ai}" title="Weight this attachment">×w</button></span>`;
  s += `</div>`;
  if (State.openSnips.has(hid)) s += snippetHTML(a);
  return s;
}

function pathStartKey(h) {
  // the BFS starts at the matched node; reconstruct it: first step's origin
  // is the match itself, which we stored implicitly — recover via reverse:
  // path[0].k is the node after the first hop, so the start is not in path.
  // We re-derive it from the match list of this chip: use h._start if set.
  return h._start;
}

function nodeSpan(k, landing, a) {
  const [ty] = Core.parseKey(k);
  const cls = landing ? `pnode landing l${a[2]}` : `pnode ${ty === "c" ? "concept" : "term"}`;
  const ttl = ty === "c" ? conceptTitle(Core.parseKey(k)[1]) : "extracted term";
  return `<span class="${cls}" data-node="${k}" title="${esc(ttl)}" style="cursor:pointer">${esc(Core.label(k))}</span>`;
}
function conceptTitle(ci) {
  const c = C[Core.resolveC(ci)];
  const anch = [...c.msc, ...c.ccs, ...c.arxiv].slice(0, 4).join(" · ");
  return `concept — ${anch}${c.note ? " — " + c.note : ""}`;
}
function relSpan(st) {
  const note = st.note ? ` — ${st.note}` : "";
  return `<span class="prel" title="${esc((st.rel || "") + note)}">—${RELG[st.rel] || st.rel}→</span>` +
    (st.sig ? `<span class="pedit"><button class="ebtn" data-cutsem="${esc(st.sig)}" title="Cut this link">✕</button><button class="ebtn w" data-wsem="${esc(st.sig)}" title="Weight this link">×w</button></span>` : "");
}
function srcSpan(a, ai) {
  const kind = a[3];
  let lbl;
  if (kind === "kw") lbl = "declared keywords";
  else if (kind === "desc") lbl = "description";
  else {
    const p = P[a[4]];
    lbl = `abstract ’${String(p.year).slice(2)} · ${shortVenue(p.venue)}`;
  }
  const times = a[9] > 1 ? ` ×${a[9]}` : "";
  return `<span class="badge l${a[2]}" title="${LNAME[a[2]]}">${["", "K", "D", "A"][a[2]]}</span>
    <span class="psrc" data-snip="${ai}">${esc(lbl)}${times}</span>`;
}
function shortVenue(v) {
  v = v || "—";
  return v.length > 34 ? v.slice(0, 32) + "…" : v;
}

function snippetHTML(a) {
  const r = R[a[1]];
  let text, from;
  if (a[3] === "kw") { text = r.kwRaw; from = `${r.name} — declared keywords`; }
  /* The ORIGINAL description, never the rewritten one: `ss`/`se`/`ps`/`pe`
     are character offsets the build measured in the source text, and
     slicing a rewrite by them quotes nonsense. */
  else if (a[3] === "desc") { text = r.descBase; from = `${r.name} — self-description`; }
  else {
    const p = P[a[4]];
    text = p.abstract;
    from = `${p.title} — ${p.venue || "venue unknown"}, ${p.year}${p.cites != null ? ` · ${p.cites} citations` : ""}`;
  }
  const ss = a[7], se = a[8], ps = a[5], pe = a[6];
  const sent = text.slice(ss, se);
  const hi = esc(sent.slice(0, ps - ss)) + "<mark>" + esc(sent.slice(ps - ss, pe - ss)) +
             "</mark>" + esc(sent.slice(pe - ss));
  return `<div class="snippet">“…${hi}…”<span class="from">${esc(from)}</span></div>`;
}

/* The sentence of his rewritten description that holds the word, with the
   word marked. The match was made on normalised text, so the mark is found
   again by walking the raw words and normalising runs of them until one
   equals the query. Punctuation riding on a word is marked with it, the
   way the dossier inks it. */
function saidSnippetHTML(r, nm) {
  const sents = String(r.desc).split(/(?<=[.!?])\s+/);
  const sent = sents.find(t => (" " + Core.norm(t) + " ").includes(" " + nm + " ")) || "";
  const ws = [...sent.matchAll(/\S+/g)];
  let hi = esc(sent);
  outer: for (let i = 0; i < ws.length; i++) {
    for (let j = i; j < ws.length; j++) {
      const run = Core.norm(ws.slice(i, j + 1).map(m => m[0]).join(" "));
      if (run === nm) {
        const st = ws[i].index, en = ws[j].index + ws[j][0].length;
        hi = esc(sent.slice(0, st)) + "<mark>" + esc(sent.slice(st, en)) + "</mark>" + esc(sent.slice(en));
        break outer;
      }
      if (run.length > nm.length) break;
    }
  }
  return `<div class="snippet">“${hi}”<span class="from">${esc(r.name)} — the description you wrote</span></div>`;
}

function annotateStarts(res) {
  // every hopped path needs its entry node before any HTML is built
  res.perChip.forEach(pc => {
    const single = pc.matches.length === 1 ? pc.matches[0].k : null;
    pc.hits.forEach(h => {
      if (h.path.length === 0) h._start = h.landing;
      else if (single) h._start = single;
      else h._start = findStart(pc, h);
    });
  });
}

function wireResults(out, res) {
  out.querySelectorAll("[data-doss]").forEach(b => b.onclick = () => openDossier(+b.dataset.doss));
  out.querySelectorAll("[data-map]").forEach(b => b.onclick = () => locateOnMap(+b.dataset.map));
  out.querySelectorAll("[data-walkr]").forEach(b => b.onclick = () => goWalk({ kind: "r", i: +b.dataset.walkr }));
  out.querySelectorAll("[data-more]").forEach(b => b.onclick = () => {
    State.expanded.add(b.dataset.more); renderSearchResultsOnly();
  });
  out.querySelectorAll("[data-snip]").forEach(b => b.onclick = () => {
    const hid = b.closest(".path").dataset.hid;
    State.openSnips.has(hid) ? State.openSnips.delete(hid) : State.openSnips.add(hid);
    renderSearchResultsOnly();
  });
  out.querySelectorAll("[data-node]").forEach(b => b.onclick = e => {
    if (e.target.closest(".ebtn")) return;
    goWalk({ kind: "node", k: b.dataset.node });
  });
  out.querySelectorAll("[data-cutsem]").forEach(b => b.onclick = () => {
    const [x, y] = b.dataset.cutsem.split("|");
    cutSemEdge(b.dataset.cutsem, Core.label(x), Core.label(y));
  });
  out.querySelectorAll("[data-wsem]").forEach(b => b.onclick = () => {
    const [x, y] = b.dataset.wsem.split("|");
    weighSemEdge(b.dataset.wsem, Core.label(x), Core.label(y));
  });
  out.querySelectorAll("[data-cutatt]").forEach(b => b.onclick = () => cutAttachment(+b.dataset.cutatt));
  out.querySelectorAll("[data-watt]").forEach(b => b.onclick = () => weighAttachment(+b.dataset.watt));
}

function findStart(pc, h) {
  // The first hop went from some match node to h.path[0].k; find a match
  // adjacent to it with the same match type.
  const first = h.path[0];
  for (const m of pc.matches) {
    if (m.mt !== h.mt) continue;
    for (const e of Core.neighborhood(m.k)) if (e.o === first.k) return m.k;
  }
  return pc.matches[0] ? pc.matches[0].k : h.landing;
}

// ===========================================================================
// BROWSE — the department as it organizes itself: domain → cluster → group.
// Declared keywords at a glance; a click opens the dossier.
// ===========================================================================
const val = s => (s && s !== "nan" ? s : null);
const trim = (s, n) => (s = String(s || ""), s.length > n ? s.slice(0, n - 1) + "…" : s);

/* Browse is drawn as nested blocks — a row, then its children in a `.tkids`
   of their own — so that opening a row can slide its block open and the
   rows under it travel down with it. It used to be one flat list redrawn
   whole on every press, and everything under the row jumped to its new
   place in a single frame; Mark asked for moving around the Atlas to feel
   smoother (#20). The department's colour runs down the side of its block
   and washes its open groups, so which department you are in reads at a
   glance rather than only from the dot on its own heading. */
const DOMW = { "Mathematics": "var(--dmw)", "Computer Science": "var(--dcw)", "Data Science": "var(--ddw)" };
const SLIDE_MS = 320;
let browseBusy = false;

function renderBrowse(opened) {
  const main = $("#main");
  main.classList.remove("nopad");
  const f = State.treeFilter.trim().toLowerCase();
  const hit = ri => {
    if (!f) return true;
    const r = R[ri];
    return r.name.toLowerCase().includes(f) ||
           (val(r.kwRaw) || "").toLowerCase().includes(f) ||
           (r.group || "").toLowerCase().includes(f);
  };
  const open = k => (f ? true : State.treeOpen.has(k));
  const kids = (k, inner, style) => `<div class="tkids${style ? " tdom" : ""}" data-kids="${esc(k)}"${style ? ` style="${style}"` : ""}>${inner}</div>`;

  /* A newcomer sits under the group the agent read them in; one whose group
     the tree does not have is listed above it rather than lost. */
  const gnames = new Set(G.hierarchy.flatMap(d => d.clusters.flatMap(c => c.groups.map(g => Core.norm(g.name)))));
  const ncHit = e => !f || e.name.toLowerCase().includes(f) || (e.grp || "").toLowerCase().includes(f);
  const ncIn = gn => newcomers().filter(e => Core.norm(e.grp || "") === Core.norm(gn) && ncHit(e));
  const loose = newcomers().filter(e => !gnames.has(Core.norm(e.grp || "")) && ncHit(e));
  let html = `<div class="tcrumbs" id="tcrumbs"></div><div id="tree">`;
  if (loose.length) html += `<div class="trow grp" style="margin-left:0">Not in the Atlas yet, group not in the tree</div>`
    + loose.map(newcomerRow).join("");
  for (const d of G.hierarchy) {
    const dk = "d:" + d.name;
    const members = d.clusters.flatMap(c => c.groups.flatMap(g => g.members));
    const nHit = members.filter(hit).length;
    const nNew = d.clusters.reduce((t, c) => t + c.groups.reduce((u, g) => u + ncIn(g.name).length, 0), 0);
    if (f && !nHit && !nNew) continue;
    html += `<div class="trow dom${open(dk) ? " open" : ""}" data-tk="${esc(dk)}">
      <span class="tw">${open(dk) ? "▾" : "▸"}</span>
      <span class="dot" style="background:${DOMC[d.name]}"></span>${esc(d.name)}
      <span class="cnt">${f ? nHit + " of " : ""}${members.length}</span></div>`;
    if (!open(dk)) continue;
    let dIn = "";
    for (const c of d.clusters) {
      const ck = "c:" + d.name + "|" + c.name;
      const cm = c.groups.flatMap(g => g.members);
      const cHit = cm.filter(hit).length;
      if (f && !cHit && !c.groups.some(g => ncIn(g.name).length)) continue;
      dIn += `<div class="trow clu${open(ck) ? " open" : ""}" data-tk="${esc(ck)}">
        <span class="tw">${open(ck) ? "▾" : "▸"}</span>${esc(c.name)}
        <span class="cnt">${cm.length}</span></div>`;
      if (!open(ck)) continue;
      let cIn = "";
      for (const g of c.groups) {
        const gk = "g:" + d.name + "|" + c.name + "|" + g.name;
        const gHit = g.members.filter(hit);
        if (f && !gHit.length && !ncIn(g.name).length) continue;
        cIn += `<div class="trow grp${open(gk) ? " open" : ""}" data-tk="${esc(gk)}">
          <span class="tw">${open(gk) ? "▾" : "▸"}</span>${esc(g.name)}
          <span class="cnt">${g.members.length}</span></div>`;
        if (!open(gk)) continue;
        cIn += kids(gk, (f ? gHit : g.members).map(researcherRow).join("") + ncIn(g.name).map(newcomerRow).join(""));
      }
      dIn += kids(ck, cIn);
    }
    html += kids(dk, dIn, `--dcol:${DOMC[d.name]};--dwash:${DOMW[d.name]}`);
  }
  html += `</div>`;
  main.innerHTML = html;
  crumbs();
  main.onscroll = () => {
    if (State.mode !== "browse" || crumbs._raf) return;
    crumbs._raf = requestAnimationFrame(() => { crumbs._raf = 0; crumbs(); });
  };
  if (opened) slideKids([...main.querySelectorAll("[data-kids]")].find(el => el.dataset.kids === opened), true);

  main.querySelectorAll("[data-tk]").forEach(row => row.onclick = () => {
    if (State.treeFilter.trim() || browseBusy) return;  // filter forces open
    const k = row.dataset.tk;
    if (!State.treeOpen.has(k)) { State.treeOpen.add(k); renderBrowse(k); return; }
    browseBusy = true;
    row.querySelector(".tw").textContent = "▸";
    slideKids([...main.querySelectorAll("[data-kids]")].find(el => el.dataset.kids === k), false, () => {
      browseBusy = false; State.treeOpen.delete(k); renderBrowse();
    });
  });
  main.querySelectorAll("[data-ncundo]").forEach(b => b.onclick = ev => {
    ev.stopPropagation(); removeEdit(b.dataset.ncundo); toast("Taken off the list");
  });
  main.querySelectorAll("[data-rid]").forEach(row => row.onclick = () => {
    main.querySelectorAll(".rrow.sel").forEach(x => x.classList.remove("sel"));
    row.classList.add("sel");
    State.browseSel = +row.dataset.rid;
    openDossier(+row.dataset.rid);
  });
}

/* One researcher's line: every declared keyword whole, in the chips the
   dossier draws, where it used to be the raw spreadsheet cell cut off with
   an ellipsis at the column's edge — "all keywords from a researcher
   should be visible instead of the dots" (#20). */
function researcherRow(ri) {
  const r = R[ri], rk = rankOf(r.name);
  return `<div class="rrow ${State.browseSel === ri ? "sel" : ""}" data-rid="${ri}">
    <span class="nm">${esc(r.name)}${r.leader ? `<span class="lead">leader</span>` : ""}${leftOf(r.name) ? `<span class="an-left">left TU/e · ${yearOf(leftOf(r.name))}</span>` : ""}${rk ? `<span class="rk">${esc(rk.rank)}</span>` : ""}</span>
    ${kwChips(ri)}</div>`;
}
/* The keywords as the researcher declared them — their spreadsheet cell
   cut at its commas, a comma inside brackets kept — and then the ones Mark
   assigned himself, in his colour. Not the declared layer's attachments:
   those also hold every shorter term the build found inside a keyword, so
   "numerical linear algebra" came with "numerical linear", "linear algebra"
   and "algebra", three chips that say nothing new. */
function kwChips(ri) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of val(R[ri].kwRaw) || "") {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && !depth) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  const said = out.map(k => k.trim().replace(/\.$/, "")).filter(Boolean);
  const mine = Core.attachmentsOfR(ri).filter(([, a]) => a[3] === "kw" && a[10]).map(([, a]) => T[a[0]].label);
  return said.length || mine.length
    ? `<span class="kwline">${said.map(k => `<span class="chip l1">${esc(k)}</span>`).join("")}${mine.map(k => `<span class="chip l1 mine" title="assigned by you">${esc(k)}</span>`).join("")}</span>`
    : `<span class="kw">— no declared keywords —</span>`;
}

/* Slides a block open from nothing or shut to nothing. The start height is
   written, then a style pass forced, then the end height: written in the
   same tick as the start, the browser never computes the start state and
   the block simply appears — the trap in notes/animation.md. The end is a
   timer rather than transitionend, which never fires when reduced motion
   has taken the transition away. */
function slideKids(el, opening, done) {
  if (!el || matchMedia("(prefers-reduced-motion:reduce)").matches) { if (done) done(); return; }
  const h = el.scrollHeight;
  el.style.overflow = "hidden";
  el.style.height = (opening ? 0 : h) + "px";
  void el.offsetHeight;
  el.style.transition = `height ${SLIDE_MS}ms cubic-bezier(0.65,0,0.35,1)`;
  el.style.height = (opening ? h : 0) + "px";
  setTimeout(() => {
    if (opening) el.style.height = el.style.overflow = el.style.transition = "";
    if (done) done();
  }, SLIDE_MS);
}

/* The line held at the top of Browse saying where you are: the path of the
   last heading scrolled past. Pressing a step brings its heading back up to
   the top. With nothing open it says how the tree is ordered instead. */
function crumbs() {
  const bar = $("#tcrumbs"), main = $("#main");
  if (!bar) return;
  const edge = bar.getBoundingClientRect().bottom + 2;
  let at = null;
  for (const row of main.querySelectorAll(".trow[data-tk]")) {
    if (row.getBoundingClientRect().top > edge) break;
    at = row.dataset.tk;
  }
  if (!at) { const first = main.querySelector(".trow.open[data-tk]"); at = first ? first.dataset.tk : null; }
  if (crumbs._at === at && bar.firstChild) return;
  crumbs._at = at;
  if (!at) { bar.innerHTML = `<span class="hint">Department → cluster → group → researcher. Press a row to open it, a researcher for the dossier.</span>`; return; }
  const parts = at.slice(2).split("|");
  const keys = parts.map((_, i) => "dcg"[i] + ":" + parts.slice(0, i + 1).join("|"));
  bar.innerHTML = parts.map((p, i) => `<button class="tcrumb${i ? "" : " d"}" type="button" data-crumb="${esc(keys[i])}"${i ? "" : ` style="--dwash:${DOMW[p] || "var(--wash)"}"`}>${esc(p)}</button>`).join(`<span class="tsep">›</span>`);
  bar.querySelectorAll("[data-crumb]").forEach(b => b.onclick = () => {
    const row = [...main.querySelectorAll(".trow[data-tk]")].find(x => x.dataset.tk === b.dataset.crumb);
    if (!row) return;
    const top = row.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop - bar.offsetHeight - 4;
    main.scrollTo({ top: Math.max(0, top), behavior: matchMedia("(prefers-reduced-motion:reduce)").matches ? "auto" : "smooth" });
  });
}

/* Someone the agent found in a group whom the build never saw. No dossier —
   the Atlas cannot give them keywords or publications without a rebuild of
   the data file — so a name, what was found, and their own page. */
function newcomerRow(e) {
  return `<div class="an-new"><span class="nm">${esc(e.name)}<span class="tag">not in the Atlas yet</span></span>
    <span class="an-nwhat">${esc(e.text || "")} · <a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(hostOf(e.url))} ↗</a>
    <button class="undo" data-ncundo="${e.id}" title="Take them off this list">remove</button></span></div>`;
}

// ===========================================================================
// NEWS — what the scheduled people-agent found on the web. Every weeknight it
// reads two researchers' TU/e and Pure pages and their own sites; every
// Tuesday night it goes through six groups for colleagues the Atlas does not
// have. It leaves findings in a table of its own in the cloud and never
// touches the edit list: nothing it read becomes part of the Atlas until it
// is accepted here, and what accepting makes is an ordinary edit — listed in
// the rail, synced, undone like any other. The same arrangement as
// Semaphore's Dispatches, for the same reason: a page read too generously
// costs a line dismissed, not a colleague wrongly marked as gone.
// ===========================================================================
const news = { rows: [], state: "cold", error: null, busy: null };
const NEWSKIND = { employment: "Employment", position: "Position", info: "New info", newcomer: "Newcomer" };

/* Accepted findings, read back out of the edit list. `fact` hangs off a
   researcher by name, the way a hand-assigned keyword does, so it still
   means the same person if the graph is ever rebuilt; `newcomer` is someone
   the build never saw, and has only a name, a group and a page. */
const factsOf = name => Core.getEdits().filter(e => e.type === "fact" && e.rL === name);
const leftOf = name => factsOf(name).find(e => e.kind === "left") || null;
const newcomers = () => Core.getEdits().filter(e => e.type === "newcomer");
/* A rank — full, associate, assistant professor — is a field of the person
   the way their group is, so it is one edit per researcher rather than one
   more line under "Since the database": the dossier's head band reads it,
   and a promotion supersedes the rank that was there instead of piling up
   beside it. The last one written wins. It is keyed by name, like a
   hand-assigned keyword, so it still means the same person if the graph is
   rebuilt from a newer source. The source data carries no rank at all —
   only 35 of the 152 descriptions happen to mention one — which is why
   this layer exists rather than a column in the data file. */
const RANKS = ["Full professor", "Associate professor", "Assistant professor", "Lecturer"];
const rankOf = name => Core.getEdits().filter(e => e.type === "rank" && e.rL === name).slice(-1)[0] || null;
/* The rank a Position finding is offering, read out of its own words. The
   agent is told to put it at the front of the summary; a finding worded
   any other way simply offers no rank button and is still there to keep
   as a note. */
function rankIn(text) {
  const m = String(text || "").match(/\b(full|associate|assistant|adjunct|emeritus|honorary|guest)\s+professor\b|\b(lecturer|hoogleraar|universitair\s+(?:hoofd)?docent)\b/i);
  if (!m) return null;
  const w = m[0].replace(/\s+/g, " ").toLowerCase();
  return w.charAt(0).toUpperCase() + w.slice(1);
}
/* Where a rank came from, said in full on hover: the head band has room
   for the rank itself and nothing else, and a rank with no provenance is
   the one thing this room does not do anywhere else. */
function rankTitle(e) {
  return e.rank + " \u2014 " + (e.fid ? "accepted from News" : "set by hand")
    + (e.asOf ? ", happened " + asOfText(e.asOf, e.gran) : "")
    + (e.url ? ", from " + hostOf(e.url) : "")
    + ". Click to change it.";
}
const ridOf = name => { const n = Core.norm(name); return R.findIndex(r => Core.norm(r.name) === n); };
const hostOf = u => { try { return new URL(u).host.replace(/^www\./, ""); } catch (e) { return ""; } };
const srcText = u => { try { const x = new URL(u); return x.host.replace(/^www\./, "") + x.pathname.replace(/\/$/, ""); } catch (e) { return u; } };
const yearOf = e => String(e.asOf || new Date(e.ts || Date.now()).toISOString()).slice(0, 4);
/* A date said only as precisely as the page said it. */
function asOfText(d, g) {
  if (!d) return "";
  const dt = new Date(d + "T12:00:00");
  if (g === "year") return d.slice(0, 4);
  if (g === "month") return dt.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function newsBadge() {
  const b = $("#newsBadge");
  if (!b) return;
  const n = news.state === "ready" ? news.rows.length : 0;
  b.textContent = n; b.hidden = !n;
}

function loadNews() {
  const api = (typeof Hub !== "undefined" && Hub.api) ? Hub.api("atlas-inbox") : null;
  if (!api || !api.ready()) {
    news.state = "nocloud"; news.rows = []; newsBadge();
    if (State.mode === "news") renderNews();
    return;
  }
  news.state = "reading"; news.error = null;
  if (State.mode === "news") renderNews();
  api.list((rows, err) => {
    if (err) { news.state = "error"; news.error = err; news.rows = []; }
    else { news.state = "ready"; news.rows = rows; }
    newsBadge();
    if (State.mode === "news") { renderNews(); renderRail(); }
  });
}

/* The answer is written to the cloud first and the edit made only once the
   cloud has taken it, so two machines cannot both accept the same finding —
   the second one's update matches no row and says so. */
function answerNews(id, how) {
  const r = news.rows.find(x => String(x.id) === String(id));
  const api = Hub.api("atlas-inbox");
  if (!r || !api || news.busy) return;
  news.busy = r.id; renderNews();
  api.decide(r.id, how === "dismiss" ? "dismissed" : "accepted", err => {
    news.busy = null;
    if (err) { toast("Not answered — " + err); renderNews(); return; }
    news.rows = news.rows.filter(x => x.id !== r.id);
    newsBadge();
    if (how === "newcomer") {
      addEdit({ type: "newcomer", name: r.person, grp: r.grp || "", text: r.summary,
                url: r.url || r.source_url, src: r.source_url, quote: r.evidence || "",
                asOf: r.as_of || null, gran: r.as_of_gran || null, fid: r.id });
      toast(r.person + " is listed under " + (r.grp || "their group") + " in Browse");
    } else if (how === "rank") {
      addEdit({ type: "rank", rL: r.person, rank: rankIn(r.summary), text: r.summary,
                quote: r.evidence || "", url: r.source_url,
                asOf: r.as_of || null, gran: r.as_of_gran || null, fid: r.id });
      toast(r.person + " is now on the dossier as " + rankIn(r.summary).toLowerCase());
    } else if (how !== "dismiss") {
      addEdit({ type: "fact", rL: r.person, kind: how, text: r.summary,
                detail: r.detail || "", quote: r.evidence || "", url: r.source_url,
                asOf: r.as_of || null, gran: r.as_of_gran || null, fid: r.id });
      toast(how === "left" ? r.person + " is marked as having left TU/e"
                           : "Kept on " + r.person + "'s dossier");
    } else { renderNews(); renderRail(); }
  });
}

function renderNews() {
  const main = $("#main");
  main.classList.remove("nopad");
  const k = State.newsKind;
  const rows = news.rows.filter(r => k === "all" || r.kind === k);
  const n = news.rows.length;
  const said = {
    cold: "Reading the inbox…", reading: "Reading the inbox…",
    nocloud: "No cloud connection — the findings live in the cloud, so connect it first (the chip at the top right).",
    error: "The inbox could not be read: " + esc(news.error || ""),
  }[news.state];
  let h = `<div class="an-head"><span class="t">${said || (n
      ? `${n} waiting — nothing changes in the Atlas until you accept it.`
      : "Nothing waiting. The agent reads two people every weeknight and six groups every Tuesday night.")}</span>
    <button class="sbtn" id="newsAgain">Check again</button></div><div class="an-list">`;
  if (news.state === "ready" && n && !rows.length)
    h += `<div class="hint">None of that kind waiting.</div>`;
  /* Grouped by person, in the order they were found: a night's findings
     about one colleague read together. */
  const order = [], by = {};
  for (const r of rows) { if (!by[r.person]) { by[r.person] = []; order.push(r.person); } by[r.person].push(r); }
  for (const p of order) {
    const rid = ridOf(p), list = by[p];
    const grp = rid >= 0 ? (R[rid].group || R[rid].cluster) : (list[0].grp || "");
    h += `<div class="an-person"><div class="an-pband">`
      + (rid >= 0 ? `<button class="nm" data-nrid="${rid}" title="Open the dossier">${esc(p)}</button>`
                  : `<span class="nm plain">${esc(p)}</span>`)
      + `<span class="gp">${esc(grp)}${rid < 0 ? " · not in the Atlas" : ""}</span>
        <span class="ct">${list.length} waiting</span></div>`;
    for (const r of list) {
      const busy = news.busy === r.id ? " disabled" : "";
      const btn = (how, label, title) =>
        `<button class="sbtn" data-nans="${r.id}" data-how="${how}" title="${esc(title)}"${busy}>${label}</button>`;
      /* A Position finding whose first words name a rank is offered as a
         rank as well as as a note: that is the one finding that fills a
         field of its own rather than adding a line to the dossier. */
      const rk = r.kind === "position" ? rankIn(r.summary) : null;
      const btns = r.kind === "employment"
          ? btn("left", "Mark as left", "Mark this person as having left TU/e, on their dossier and in Browse")
            + btn("employment", "Keep as a note", "Keep it on the dossier without marking them as gone")
        : r.kind === "newcomer"
          ? btn("newcomer", "Add to their group", "List them under their group in Browse")
        : rk
          ? btn("rank", "Set rank", "Write \u201c" + rk + "\u201d on their dossier as their rank, in place of any rank already there")
            + btn(r.kind, "Keep as a note", "Keep it on the dossier without touching their rank")
          : btn(r.kind, "Accept", "Keep it on the dossier");
      const when = asOfText(r.as_of, r.as_of_gran);
      h += `<div class="an-find"><span class="an-kind ${r.kind === "employment" ? "emp" : ""}">${NEWSKIND[r.kind] || esc(r.kind)}</span>
        <span class="an-sum">${esc(r.summary)}${when ? ` <span class="an-when">· ${esc(when)}</span>` : ""}</span>
        <span class="an-btns">${btns}${btn("dismiss", "Dismiss", "Throw it away; the agent will not bring it again")}</span>
        ${r.detail ? `<span class="an-q">“${esc(r.detail)}”</span>`
          : r.evidence ? `<span class="an-q">“${esc(r.evidence)}”</span>` : ""}
        <a class="an-src" href="${esc(r.source_url)}" target="_blank" rel="noopener">${esc(srcText(r.source_url))} ↗</a>
        </div>`;
    }
    h += `</div>`;
  }
  main.innerHTML = h + `</div>`;
  main.querySelector("#newsAgain").onclick = loadNews;
  main.querySelectorAll("[data-nans]").forEach(b => b.onclick = () => answerNews(b.dataset.nans, b.dataset.how));
  main.querySelectorAll("[data-nrid]").forEach(b => b.onclick = () => openDossier(+b.dataset.nrid));
}

function newsRailHTML() {
  const cnt = k => news.rows.filter(r => k === "all" || r.kind === k).length;
  return `<div class="sect"><h3>News</h3>
      <div class="hint">Every weeknight the agent reads two researchers' TU/e and Pure pages and their own sites; every Tuesday night it goes through six groups looking for colleagues the Atlas does not have. Nothing it finds changes the Atlas until you accept it here.</div></div>
    <div class="sect"><h3>Show</h3><div class="an-kinds">${["all", "employment", "position", "info", "newcomer"].map(k =>
      `<button data-nkind="${k}" class="${State.newsKind === k ? "on" : ""}">${k === "all" ? "All" : NEWSKIND[k]}<span class="cnt">${cnt(k)}</span></button>`).join("")}</div></div>`;
}

// ===========================================================================
// DOSSIER — one researcher, every layer laid out with its provenance intact:
// declared keywords, the description with extracted terms underlined in
// place, abstracts with their terms highlighted, and nearest colleagues.
// ===========================================================================
/* One run of the text, split again wherever it crosses from the source's
   words into Mark's own — see `addedMask`. `mask` is absent everywhere but
   a description he has written, and then this is `esc` and nothing else. */
function inkRun(text, s, e, mask) {
  if (!mask) return esc(text.slice(s, e));
  let out = "";
  for (let i = s; i < e; ) {
    const v = mask[i];
    let j = i; while (j < e && mask[j] === v) j++;
    const run = esc(text.slice(i, j));
    out += v ? `<span class="mine">${run}</span>` : run;
    i = j;
  }
  return out;
}

function highlightSpans(text, spans, cls, mask) {
  spans = spans.slice().sort((a, b) => a.s - b.s || b.e - a.e);
  let out = "", pos = 0;
  for (const sp of spans) {
    if (sp.s < pos || sp.e > text.length) continue;
    out += inkRun(text, pos, sp.s, mask);
    out += `<span class="xterm ${cls}" data-node="t${sp.ti}" title="extracted term “${esc(T[sp.ti].label)}” — click to walk from it">${inkRun(text, sp.s, sp.e, mask)}</span>`;
    pos = sp.e;
  }
  return out + inkRun(text, pos, text.length, mask);
}

/* Which characters of a rewritten description Mark put there himself.
   Word by word rather than paragraph by paragraph: he keeps most of a
   description and changes a clause, and colouring the whole of it says
   nothing about which clause. A word counts as the source's if it is still
   in the source's own order — a longest common subsequence over the words,
   with the matching head and tail taken off first, which is the whole of
   the work in the ordinary case of one sentence edited in the middle.

   Whitespace is a token like any other, so a word inserted between two
   kept words takes its space with it and the runs do not fragment. Nothing
   marks what was DELETED: this says which words are his, not what the
   paragraph used to be — the source text is one press of revert away and
   is the honest place to read that. */
function tokenise(s) { return String(s || "").split(/(\s+)/).filter(x => x !== ""); }

function addedMask(base, next) {
  const mask = new Uint8Array(next.length);
  if (!next) return mask;
  const A = tokenise(base), B = tokenise(next);
  let h = 0;
  while (h < A.length && h < B.length && A[h] === B[h]) h++;
  let t = 0;
  while (t < A.length - h && t < B.length - h
         && A[A.length - 1 - t] === B[B.length - 1 - t]) t++;
  const a = A.slice(h, A.length - t), b = B.slice(h, B.length - t);
  const kept = new Uint8Array(b.length);
  /* The table is words wide and words tall; a description is a paragraph,
     so this is small. The ceiling is there because nothing stops somebody
     pasting a thesis into the box, and a wall of violet is a better answer
     than a frozen room. */
  if (a.length && b.length && a.length * b.length <= 1000000) {
    const L = [];
    for (let i = 0; i <= a.length; i++) L.push(new Uint16Array(b.length + 1));
    for (let i = a.length - 1; i >= 0; i--)
      for (let j = b.length - 1; j >= 0; j--)
        L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1
                                : Math.max(L[i + 1][j], L[i][j + 1]);
    let i = 0, j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { kept[j] = 1; i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) i++;
      else j++;
    }
  }
  let at = 0;
  B.forEach((tok, k) => {
    const inMiddle = k >= h && k < B.length - t;
    if (inMiddle && !kept[k - h]) mask.fill(1, at, at + tok.length);
    at += tok.length;
  });
  return mask;
}

/* Where the terms sit in a description Mark has rewritten. The build's
   offsets were measured in the old words and mean nothing in the new ones,
   so the underlines have to be found again — and they are found ONLY for
   terms this researcher's description already carried. Nothing new is
   extracted here on purpose: the extractor that made these lives in the
   build, and the rules recoverable from its output are looser than
   whatever it actually did (see `filing a hand-assigned keyword` in Core).
   So a rewrite can lose an underline and can move one, and can never
   invent one — which is the same promise the graph itself makes about a
   rewrite, said in the one place you can see it. */
function relocateSpans(text, tis) {
  const low = text.toLowerCase(), out = [];
  const edge = c => !/[a-z0-9]/.test(c);
  for (const ti of new Set(tis)) {
    const lbl = String(T[ti].label || "").toLowerCase();
    if (lbl.length < 3) continue;
    for (let at = low.indexOf(lbl); at !== -1; at = low.indexOf(lbl, at + lbl.length)) {
      if (out.length >= 300) break;
      if (edge(at === 0 ? " " : low[at - 1])
          && edge(at + lbl.length >= low.length ? " " : low[at + lbl.length]))
        out.push({ s: at, e: at + lbl.length, ti });
    }
  }
  return out;
}

function openDossier(rid) {
  /* The editor belongs to one researcher. Walking to a colleague from the
     similarity list redraws this panel with somebody else in it, and a
     half-written paragraph must not follow them there. */
  if (State.descEdit !== rid) State.descEdit = null;
  const r = R[rid];
  const atts = Core.attachmentsOfR(rid);
  const byKind = k => atts.filter(([, a]) => a[3] === k);

  /* The rank stands at the front of the affiliation line: it is the first
     thing Mark wants to know about a colleague and it belongs to the same
     sentence as their group rather than to a row of its own. Where nothing
     is recorded a quiet "+ rank" stands at the end of that line instead,
     because a rank the Atlas has never been told is the ordinary case. */
  const rk = rankOf(r.name);
  $("#dhead").innerHTML = `
    <span class="rname">${esc(r.name)}</span>
    <div class="raffil" style="margin-top:3px">${rk ? `<button class="rrank" data-drank="${rid}" title="${esc(rankTitle(rk))}">${esc(rk.rank)}</button> · ` : ""}${esc(r.group || "(group unlisted)")} · ${esc(r.cluster)} · ${esc(r.domain)}${r.leader ? " · group leader" : ""}${rk ? "" : ` <button class="ebtn w" data-drank="${rid}" title="Write down whether they are a full, associate or assistant professor">+ rank</button>`}${leftOf(r.name) ? `<span class="an-left">left TU/e · ${yearOf(leftOf(r.name))}</span>` : ""}</div>
    ${val(r.note) ? `<div class="hint" style="color:var(--danger);margin-top:4px">Note in source data: ${esc(r.note)}</div>` : ""}
    <div class="rowbtns" style="margin-top:10px">
      <button class="sbtn" data-dmap="${rid}">Show on map</button>
      <button class="sbtn" data-dwalk="${rid}">Walk from here</button>
    </div>`;

  let b = "";

  /* What the web said since the build, as Mark accepted it from News. Kept
     apart from the description on purpose: the description is the
     database's words or his, and this is neither — so it says where each
     line came from and when he took it, and "add to description" is the
     only road from here into his own text. */
  const facts = factsOf(r.name);
  if (facts.length) {
    b += `<div class="sect an-since"><h3>Since the database</h3>` + facts.slice().reverse().map(e => {
      const said = e.detail || e.quote;
      return `<div class="an-fact"><div class="w">${e.kind === "left" ? "<b>Left TU/e.</b> " : ""}${esc(e.text)}</div>
        <div class="m">accepted ${esc(new Date(e.ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }))}${e.asOf ? ` · happened ${esc(asOfText(e.asOf, e.gran))}` : ""}
          · <a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(hostOf(e.url))} ↗</a>
          ${said ? `· <button class="ebtn" data-fquote="${e.id}">quote</button>` : ""}
          ${e.kind === "info" && e.detail ? `· <button class="ebtn" data-fdesc="${e.id}" title="Open the description editor with this passage added, for you to reword">add to description</button>` : ""}
          · <button class="ebtn" data-fundo="${e.id}">undo</button></div>
        ${said ? `<div class="an-q an-fq" id="fq-${e.id}" hidden>“${esc(said)}”</div>` : ""}</div>`;
    }).join("") + `</div>`;
  }

  // declared keywords — layer 1, and the one place they are assigned
  const kws = byKind("kw"), kwEd = State.kwEdit;
  b += `<div class="sect"><h3><span class="dot l1"></span> Declared keywords`
    + `<span class="kwtools">` + (kwEd
        ? `<button class="ebtn w" data-addkw="1" title="Assign a keyword to this researcher">+ add</button>`
          + `<button class="ebtn" data-kwedit="0" title="Finished with the keywords">done</button>`
        : `<button class="ebtn" data-kwedit="1" title="Add or remove this researcher's keywords">edit</button>`)
    + `</span></h3>`;
  /* A chip carrying an edit id is one Mark assigned himself. It keeps the
     keyword layer's shape and takes the hand's colour, so the line still
     reads as one line of declared keywords while saying which of them the
     database declared and which he did. */
  b += kws.length
    ? `<div class="kwline">${kws.map(([ai, a]) =>
        `<span class="chip l1 clickable${a[10] ? " mine" : ""}" data-node="t${a[0]}" title="${a[10] ? "assigned by you \u2014 click to walk from this term" : "click to walk from this term"}">${esc(T[a[0]].label)}`
        + (kwEd ? `<span class="kwtools"><button class="ebtn" data-dropkw="${ai}"`
                  + ` title="Take this keyword off this researcher">\u2715</button></span>` : ``)
        + `</span>`).join("")}</div>`
    : `<div class="hint">None declared.</div>`;
  b += `</div>`;

  /* description — layer 2, terms underlined where they were found, and the
     one layer Mark may write himself. The database's own text is often a
     paragraph a colleague wrote for a website years ago; being able to say
     what somebody actually works on, in his own words, is the same act as
     assigning a keyword and sits behind no more of a door than that one.
     What is written by hand is marked as his, here and on the chips above,
     so the dossier never quietly passes his sentence off as the source's —
     the whole section exists to keep provenance intact. */
  const desc = val(r.desc), mine = !!r.descEdit, dEd = State.descEdit === rid;
  b += `<div class="sect"><h3><span class="dot l2"></span> Description`
    + (mine && !dEd ? `<span class="badge mine" title="You wrote this. The source database's own text is kept underneath — press revert to read it again.">yours</span>` : ``)
    + `<span class="kwtools">` + (dEd
        ? `<button class="ebtn w" data-dsave="${rid}" title="Keep this wording">save</button>`
          + `<button class="ebtn" data-dcancel="1" title="Leave it as it was">cancel</button>`
        : `<button class="ebtn w" data-dedit="${rid}" title="${mine ? "Write it again" : "Say what this researcher works on, in your own words"}">${desc ? "edit" : "write"}</button>`
          + (mine ? `<button class="ebtn" data-drevert="${r.descEdit}" title="Put the source database's own description back">revert</button>` : ``))
    + `</span></h3>`;
  if (dEd) {
    b += `<textarea class="dedit" id="dtext" rows="7"
      placeholder="What does this researcher work on?">${esc(State.descSeed != null ? State.descSeed : (desc || ""))}</textarea>`
      + `<div class="hint" style="margin-top:7px">Rewriting this changes what you read here, and Search finds your words in it, but nothing the graph knows:`
      + ` the terms it drew out of the original description, and every path that runs through them, stay exactly as the build measured them.</div>`;
  } else if (desc) {
    /* Unedited, the spans are the build's own and land on the character.
       Edited, they are found again in the new text — see relocateSpans. */
    const dAtts = byKind("desc");
    const spans = mine
      ? relocateSpans(desc, dAtts.map(([, a]) => a[0]))
      : dAtts.map(([, a]) => ({ s: a[5], e: a[6], ti: a[0] }));
    /* Only the words he put there are his colour. A paragraph he has kept
       and edited one clause of reads as the database's paragraph with his
       clause in it, which is what it is — Mark asked for exactly that on
       2026-09-11, having first been given the whole of it tinted and ruled
       down the side, which said only "somebody has been here". */
    const dBase = (r.descBase && r.descBase !== "nan") ? r.descBase : "";
    b += `<div class="prose" data-dsel="1">${highlightSpans(desc, spans, "l2",
      mine ? addedMask(dBase, desc) : null)}</div>`
      + `<div id="dselkw" style="margin-top:7px" hidden><button class="ebtn w" data-selkw="1"`
      + ` title="Assign the words you selected as a keyword — the box says where it will be filed first"></button></div>`;
  } else b += `<div class="hint">No description in the source database.</div>`;
  b += `</div>`;

  // abstract-term overview — layer 3 at a glance
  const absAtts = byKind("abs");
  if (absAtts.length) {
    const cnt = new Map();
    for (const [, a] of absAtts) cnt.set(a[0], (cnt.get(a[0]) || 0) + a[9]);
    const top = [...cnt.entries()].sort((x, y) => y[1] - x[1]).slice(0, 14);
    b += `<div class="sect"><h3><span class="dot l3"></span> Terms extracted from abstracts</h3>
      <div class="kwline">${top.map(([ti, n]) =>
        `<span class="chip l3 clickable" data-node="t${ti}" title="appears ${n}× across selected abstracts">${esc(T[ti].label)}${n > 1 ? ` <span style="opacity:.55">×${n}</span>` : ""}</span>`).join("")}</div>
      ${cnt.size > 14 ? `<div class="hint" style="margin-top:6px">…and ${cnt.size - 14} more inside the abstracts below.</div>` : ""}
    </div>`;
  }

  // publications — abstracts expandable, extracted terms highlighted in place
  b += `<div class="sect"><h3>Selected publications · ${esc(r.coverage)}</h3>`;
  if (!r.pubs.length) b += `<div class="hint">None in the database.</div>`;
  for (const pi of r.pubs) {
    const p = P[pi];
    const spans = absAtts.filter(([, a]) => a[4] === pi).map(([, a]) => ({ s: a[5], e: a[6], ti: a[0] }));
    b += `<div class="pub" data-pub="${pi}">
      <div class="t">${esc(p.title)}</div>
      <div class="m">${esc(p.venue || "venue unknown")} · ${esc(p.year)}${p.cites != null ? ` · ${p.cites} citations` : ""}${val(p.cat) ? ` · <span style="opacity:.75">${esc(p.cat.toLowerCase())}</span>` : ""}</div>
      <div class="abs"><div class="prose">${p.abstract ? highlightSpans(p.abstract, spans, "l3") : "<span class='hint'>No abstract.</span>"}</div>
        ${p.url ? `<div style="margin-top:7px"><a href="${esc(p.url)}" target="_blank" rel="noopener" style="font-size:12px;color:var(--k1)">open publication ↗</a>${p.doi ? ` <span class="hint" style="font-family:var(--mono);font-size:10.5px"> doi:${esc(p.doi)}</span>` : ""}</div>` : ""}
      </div></div>`;
  }
  b += `</div>`;

  // nearest colleagues by vector similarity
  b += `<div class="sect"><h3>Nearest by profile similarity</h3>`;
  if (r.similar.length) {
    const mx = r.similar[0][1] || 1;
    b += r.similar.map(([si, sv]) => `<div class="simrow" data-sim="${si}">
      <span class="dot" style="background:${DOMC[R[si].domain]}"></span>
      <span style="flex:none;min-width:170px">${esc(R[si].name)}</span>
      <span class="simbar" style="width:${Math.max(6, sv / mx * 120).toFixed(0)}px"></span>
      <span class="simval">${sv.toFixed(2)}</span></div>`).join("");
    b += `<div class="hint" style="margin-top:6px">Cosine similarity of layer-weighted concept vectors — the same quantity that lays out the map.</div>`;
  } else b += `<div class="hint">No profile overlap with anyone — likely an empty profile.</div>`;
  b += `</div>`;

  State.descSeed = null;
  $("#dbody").innerHTML = b;
  $("#dossier").classList.add("open");
  $("#dbody").scrollTop = 0;

  const db = $("#dossier");
  db.querySelectorAll("[data-node]").forEach(el => el.onclick = () => {
    closeDossier(); goWalk({ kind: "node", k: el.dataset.node });
  });
  db.querySelectorAll(".pub .t").forEach(t => t.onclick = () =>
    t.closest(".pub").classList.toggle("open"));
  db.querySelectorAll("[data-kwedit]").forEach(bn => bn.onclick = ev => {
    ev.stopPropagation();
    State.kwEdit = bn.dataset.kwedit === "1";
    openDossier(rid);
  });
  db.querySelectorAll("[data-addkw]").forEach(bn => bn.onclick = ev => {
    ev.stopPropagation(); addKeyword(rid);
  });
  /* Words selected in the description become a keyword through the same
     box as + add, already filled in. A rewritten description mints no term
     (see the edit overlay), so this is the way his own words reach the
     graph: one at a time, each one he chose, each filed by the rules that
     never move the file's own words. The press is caught on mousedown so
     the selection it reads is still there. */
  const selBtn = db.querySelector("[data-selkw]");
  if (selBtn) {
    selBtn.onmousedown = ev => ev.preventDefault();
    selBtn.onclick = ev => {
      ev.stopPropagation();
      const v = selBtn.dataset.v;
      if (v) { window.getSelection().removeAllRanges(); addKeyword(rid, v); }
    };
  }
  db.querySelectorAll("[data-dedit]").forEach(bn => bn.onclick = ev => {
    ev.stopPropagation();
    State.descEdit = rid; openDossier(rid);
    const ta = $("#dtext");
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  });
  db.querySelectorAll("[data-dcancel]").forEach(bn => bn.onclick = ev => {
    ev.stopPropagation(); State.descEdit = null; openDossier(rid);
  });
  db.querySelectorAll("[data-dsave]").forEach(bn => bn.onclick = ev => {
    ev.stopPropagation(); saveDescription(rid, $("#dtext") ? $("#dtext").value : "");
  });
  db.querySelectorAll("[data-drevert]").forEach(bn => bn.onclick = ev => {
    ev.stopPropagation();
    State.descEdit = null;
    removeEdit(bn.dataset.drevert);
    openDossier(rid);
    toast("Back to the source database's own description");
  });
  /* Inside the chip, which is itself a link into the walk — so the press
     has to be stopped here or taking a keyword off would also navigate. */
  db.querySelectorAll("[data-dropkw]").forEach(bn => bn.onclick = ev => {
    ev.stopPropagation(); dropKeyword(+bn.dataset.dropkw, rid);
  });
  db.querySelectorAll("[data-fquote]").forEach(bn => bn.onclick = ev => {
    ev.stopPropagation(); const q = $("#fq-" + bn.dataset.fquote); if (q) q.hidden = !q.hidden;
  });
  db.querySelectorAll("[data-fundo]").forEach(bn => bn.onclick = ev => {
    ev.stopPropagation(); removeEdit(bn.dataset.fundo); openDossier(rid);
  });
  db.querySelectorAll("[data-fdesc]").forEach(bn => bn.onclick = ev => {
    ev.stopPropagation();
    const e = Core.getEdits().find(x => x.id === bn.dataset.fdesc);
    if (!e) return;
    State.descSeed = [val(R[rid].desc) || "", e.detail].filter(Boolean).join("\n\n");
    State.descEdit = rid; openDossier(rid);
    const ta = $("#dtext");
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); ta.scrollIntoView({ block: "center" }); }
  });
  db.querySelectorAll("[data-sim]").forEach(row => row.onclick = () => openDossier(+row.dataset.sim));
  db.querySelectorAll("[data-drank]").forEach(bn => bn.onclick = () => setRank(rid));
  db.querySelectorAll("[data-dmap]").forEach(bn => bn.onclick = () => { closeDossier(); locateOnMap(rid); });
  db.querySelectorAll("[data-dwalk]").forEach(bn => bn.onclick = () => { closeDossier(); goWalk({ kind: "r", i: rid }); });
}
function closeDossier() { State.descEdit = null; $("#dossier").classList.remove("open"); }

/* One listener for the page, because a selection belongs to the document
   and not to any element: it shows the description's keyword button while
   a few words of it are selected, and hides it otherwise. Edge punctuation
   is trimmed off, so dragging over "learning." offers "learning"; more
   than six words is a sentence rather than a keyword and offers nothing.
   The release of the mouse or of a key that ends a selection is heard on
   the room as well: selectionchange comes only to the document, whose
   events are gated on this room showing (hub.js), and the dossier is also
   lent over the other rooms. */
function selKeyword() {
  const box = document.getElementById("dselkw");
  if (!box) return;
  const sel = window.getSelection(), prose = box.previousElementSibling;
  const v = sel && sel.rangeCount && prose && prose.contains(sel.anchorNode) && prose.contains(sel.focusNode)
    ? sel.toString().replace(/\s+/g, " ").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "") : "";
  const ok = !!v && v.split(" ").length <= 6;
  box.hidden = !ok;
  if (ok) { const bn = box.firstElementChild; bn.dataset.v = v; bn.textContent = `+ keyword “${v}”`; }
}
document.addEventListener("selectionchange", selKeyword);
document.body.addEventListener("mouseup", selKeyword);
document.body.addEventListener("keyup", selKeyword);

// ===========================================================================
// MAP & WALK — one canvas, two readings.  The map is the whole department on
// the similarity plane; the walk re-centres the graph on whatever you click
// and lays its neighbourhood out in provenance rings.
// ===========================================================================
const RINGCAP = 20;

function goWalk(focus) {
  if (focus.kind === "node") {
    const [ty, i] = Core.parseKey(focus.k);
    focus = { kind: ty, i };
  }
  if (focus.kind === "c") focus = { kind: "c", i: Core.resolveC(focus.i) };
  if (focus.kind === "map") State.walk.trail = [];
  else {
    const t = State.walk.trail, last = t[t.length - 1];
    if (!(last && last.kind === focus.kind && last.i === focus.i)) t.push(focus);
    if (t.length > 24) t.shift();
  }
  State.walk.focus = focus;
  State.walk.caps = {};
  State.walk.sel = null; State.walk.hl = null;
  State.view = { k: 1, tx: 0, ty: 0 };
  State.mode = "walk";
  setTabs(); refresh();
}

function locateOnMap(rid) {
  State.walk.trail = [];
  State.walk.focus = { kind: "map" };
  State.walk.sel = rid; State.walk.hl = rid;
  State.view = { k: 2.6, tx: 0, ty: 0, center: rid };
  State.mode = "walk";
  setTabs(); refresh();
}

function renderWalk() {
  const main = $("#main");
  main.classList.add("nopad");
  main.innerHTML = `<div id="canvasWrap"></div>${trailHTML()}${State.walk.focus.kind === "map" ? legendHTML() + `<div class="mapcard" id="mapcard" hidden></div>` : ""}`;
  drawCanvas();
  main.querySelectorAll("[data-crumb]").forEach(ch => ch.onclick = () => {
    const i = +ch.dataset.crumb;
    if (i < 0) { goWalk({ kind: "map" }); return; }
    State.walk.trail = State.walk.trail.slice(0, i + 1);
    State.walk.focus = State.walk.trail[i];
    State.walk.caps = {}; State.walk.sel = null; State.walk.hl = null;
    State.view = { k: 1, tx: 0, ty: 0 };
    refresh();
  });
}

function trailHTML() {
  const sep = `<span style="color:var(--ghost);align-self:center">›</span>`;
  const chips = [`<span class="chip clickable" data-crumb="-1" title="the whole department on the similarity plane">⌂ map</span>`];
  State.walk.trail.forEach((f, i) => {
    const lbl = f.kind === "r" ? R[f.i].name : Core.label(f.kind + f.i);
    const dot = f.kind === "r" ? "" : `<span class="dot ${f.kind === "c" ? "lc" : "l3"}"></span>`;
    chips.push(`<span class="chip clickable" data-crumb="${i}" ${i === State.walk.trail.length - 1 ? 'style="border-color:var(--ink)"' : ""}>${dot}${esc(trim(lbl, 28))}</span>`);
  });
  return `<div class="trail">${chips.join(sep)}</div>`;
}

function legendHTML() {
  const n = { "Mathematics": 0, "Computer Science": 0, "Data Science": 0 };
  R.forEach(r => n[r.domain] !== undefined && n[r.domain]++);
  return `<div class="maplegend">
    <span class="dm">● Mathematics ${n["Mathematics"]}</span>
    <span class="dc">● Computer Science ${n["Computer Science"]}</span>
    <span class="dd">● Data Science ${n["Data Science"]}</span>
    <span style="color:var(--ghost)">closeness = profile similarity · zoom to read names</span></div>`;
}

// ---------- canvas ---------------------------------------------------------
let _rafPending = false;

function drawCanvas() {
  const wrap = $("#canvasWrap");
  if (!wrap) return;
  const W = wrap.clientWidth || 960, H = wrap.clientHeight || 620;
  const f = State.walk.focus, v = State.view;

  if (f.kind === "map" && v.center != null) {          // centre a located dot
    const m = 60, r = R[v.center];
    v.tx = W / 2 - v.k * (m + r.x * (W - 2 * m));
    v.ty = H / 2 - v.k * (m + r.y * (H - 2 * m));
    delete v.center;
  }

  const inner = f.kind === "map" ? mapSVG(W, H) : ringSVG(W, H, f);
  wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}">
    <g id="world" transform="translate(${v.tx},${v.ty}) scale(${v.k})">${inner}</g></svg>`;
  wireCanvas(wrap);
  if (f.kind === "map") mapCard(State.walk.sel);
}

/* The card a dot answers with: the name and every declared keyword, beside
   the dot, so reading what someone works on no longer needs a zoom and a
   trip to the rail (#20). It follows the pointer at the desk; the dot
   chosen with a press keeps it, which is the iPad's way to it. Pass null to
   put it away, unless a dot is chosen. */
function mapCard(ri) {
  const c = $("#mapcard"), wrap = $("#canvasWrap");
  if (!c || !wrap) return;
  const g = ri == null ? null : [...wrap.querySelectorAll(".mapdot")].find(x => +x.dataset.r === ri);
  if (!g) { c.hidden = true; return; }
  const r = R[ri];
  c.innerHTML = `<div class="nm">${esc(r.name)}</div>
    <div class="sub">${esc(r.group || "(group unlisted)")} · ${esc(r.domain)}</div>${kwChips(ri)}`;
  c.hidden = false;
  const box = wrap.getBoundingClientRect(), d = g.querySelector("circle").getBoundingClientRect();
  let x = d.right - box.left + 12;
  if (x + c.offsetWidth > box.width - 12) x = d.left - box.left - 12 - c.offsetWidth;
  const y = Math.max(10, Math.min(d.top - box.top - 12, box.height - c.offsetHeight - 10));
  c.style.left = Math.max(10, x) + "px"; c.style.top = y + "px";
}

function mapSVG(W, H) {
  const v = State.view, m = 60;
  const fs = 10.5 / v.k, rr = 5.5 / Math.sqrt(v.k), lab = v.k >= 1.9;
  /* Each department's territory, washed in its colour under the dots and
     sized in the plane's own units, so it widens as you zoom in on it.
     Where two departments meet, both washes show. */
  const washes = R.map(r => `<circle class="mwash" cx="${(m + r.x * (W - 2 * m)).toFixed(1)}" cy="${(m + r.y * (H - 2 * m)).toFixed(1)}" r="24" fill="${DOMW[r.domain] || "var(--wash)"}"></circle>`).join("");
  return washes + R.map((r, i) => {
    const x = m + r.x * (W - 2 * m), y = m + r.y * (H - 2 * m);
    const sel = State.walk.sel === i, hl = State.walk.hl === i || sel;
    return `<g class="mapdot${lab || hl ? " lab" : ""}${hl ? " hl" : ""}" data-r="${i}"
      transform="translate(${x.toFixed(1)},${y.toFixed(1)})">
      <circle class="core" r="${(sel ? rr * 1.6 : rr).toFixed(2)}" fill="${DOMC[r.domain] || "var(--ghost)"}" fill-opacity=".85"></circle>
      <text x="${(rr + 4).toFixed(1)}" y="3.5" font-size="${fs.toFixed(2)}">${esc(r.name)}</text></g>`;
  }).join("");
}

// ---------- concentric walk ------------------------------------------------
function ringItemsFor(f) {
  // Every ring is honest about what it is: which layer put a term there,
  // which relation binds a concept, which attachment reaches a researcher.
  if (f.kind === "r") {
    const atts = Core.attachmentsOfR(f.i);
    const layer = L => {
      const cnt = new Map();
      for (const [, a] of atts) if (a[2] === L) cnt.set(a[0], (cnt.get(a[0]) || 0) + a[9]);
      return [...cnt.entries()].sort((x, y) => y[1] - x[1])
        .map(([ti, n]) => ({ k: "t" + ti, lbl: T[ti].label, sub: n > 1 ? "×" + n : "" }));
    };
    const seen = new Set(), cons = [];
    for (const [, a] of atts) for (const e of Core.conceptsOfTerm("t" + a[0])) {
      if (seen.has(e.c)) continue; seen.add(e.c);
      cons.push({ k: e.c, lbl: Core.label(e.c), sub: RELG[e.rel] || "" });
    }
    return [
      { id: "K", name: "DECLARED", color: "var(--k1)", items: layer(1) },
      { id: "D", name: "DESCRIPTION", color: "var(--k2)", items: layer(2) },
      { id: "A", name: "ABSTRACTS", color: "var(--k3)", items: layer(3) },
      { id: "C", name: "CONCEPTS", color: "var(--con)", items: cons },
    ].filter(rg => rg.items.length);
  }

  if (f.kind === "t") {
    const tk = "t" + f.i;
    const cons = Core.conceptsOfTerm(tk).map(e =>
      ({ k: e.c, lbl: Core.label(e.c), sub: RELG[e.rel] || "" }));
    const rmap = new Map();
    for (const [, a] of Core.attachmentsOfTerm(f.i)) {
      const cur = rmap.get(a[1]);
      if (!cur || a[2] < cur) rmap.set(a[1], a[2]);
    }
    const rs = [...rmap.entries()].sort((x, y) => x[1] - y[1]).map(([ri, L]) =>
      ({ k: "r" + ri, lbl: R[ri].name, sub: ["", "K", "D", "A"][L], rcolor: DOMC[R[ri].domain] }));
    const sib = new Map();
    for (const e of Core.conceptsOfTerm(tk))
      for (const s of Core.termsOfConcept(e.c))
        if (s.t !== tk && !sib.has(s.t)) sib.set(s.t, { k: s.t, lbl: Core.label(s.t), sub: RELG[s.rel] || "" });
    return [
      { id: "C", name: "CONCEPTS", color: "var(--con)", items: cons },
      { id: "R", name: "RESEARCHERS", color: "var(--ink)", items: rs },
      { id: "S", name: "SIBLING TERMS", color: "var(--k3)", items: [...sib.values()] },
    ].filter(rg => rg.items.length);
  }

  // concept focus
  const ck = "c" + f.i;
  const nbc = [], nbSeen = new Set();
  for (const e of Core.neighborhood(ck)) {
    if (e.o[0] !== "c" || nbSeen.has(e.o)) continue; nbSeen.add(e.o);
    nbc.push({ k: e.o, lbl: Core.label(e.o), sub: RELG[e.rel] || "~" });
  }
  const terms = Core.termsOfConcept(ck).map(e =>
    ({ k: e.t, lbl: Core.label(e.t), sub: RELG[e.rel] || "" }));
  const rmap = new Map();
  for (const e of Core.termsOfConcept(ck))
    for (const [, a] of Core.attachmentsOfTerm(Core.parseKey(e.t)[1])) {
      const cur = rmap.get(a[1]);
      if (!cur || a[2] < cur) rmap.set(a[1], a[2]);
    }
  const rs = [...rmap.entries()].sort((x, y) => x[1] - y[1]).map(([ri, L]) =>
    ({ k: "r" + ri, lbl: R[ri].name, sub: ["", "K", "D", "A"][L], rcolor: DOMC[R[ri].domain] }));
  return [
    { id: "N", name: "NEIGHBOUR CONCEPTS", color: "var(--con)", items: nbc },
    { id: "T", name: "BOUND TERMS", color: "var(--k3)", items: terms },
    { id: "R", name: "RESEARCHERS REACHED", color: "var(--ink)", items: rs },
  ].filter(rg => rg.items.length);
}

function ringSVG(W, H, f) {
  const cx = W / 2, cy = H / 2;
  const rings = ringItemsFor(f);
  const rmax = Math.min(W, H) / 2 - 46;
  const rmin = Math.min(150, rmax * 0.42);
  const rad = j => rings.length === 1 ? rmax * 0.7
    : rmin + (rmax - rmin) * (j / (rings.length - 1));

  let s = "";
  rings.forEach((rg, j) => {                       // guides first, underneath
    const rr = rad(j);
    s += `<circle cx="${cx}" cy="${cy}" r="${rr.toFixed(1)}" fill="none" stroke="var(--line)" stroke-dasharray="2 6"></circle>
      <text class="ringlab" x="${cx}" y="${(cy - rr - 7).toFixed(1)}" text-anchor="middle">${rg.name}</text>`;
  });

  rings.forEach((rg, j) => {
    const rr = rad(j);
    const cap = State.walk.caps[rg.id] || RINGCAP;
    const items = rg.items.slice(0, cap);
    const more = rg.items.length - items.length;
    const n = items.length + (more > 0 ? 1 : 0);
    const a0 = -Math.PI / 2 + j * 0.31;
    items.forEach((it, ix) => {
      const a = a0 + ix * 2 * Math.PI / n;
      const x = cx + rr * Math.cos(a), y = cy + rr * Math.sin(a);
      s += `<line class="wedge" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${rg.color}"></line>`;
      s += walkNode(x, y, a, it, rg.color);
    });
    if (more > 0) {
      const a = a0 + items.length * 2 * Math.PI / n;
      const x = cx + rr * Math.cos(a), y = cy + rr * Math.sin(a);
      s += `<g class="wnode" data-morering="${rg.id}" transform="translate(${x.toFixed(1)},${y.toFixed(1)})">
        <circle r="9" fill="var(--wash)" stroke="var(--line)"></circle>
        <text text-anchor="middle" y="3.5" style="font:600 9px var(--mono)">+${more > 99 ? "99" : more}</text></g>`;
    }
  });

  // centre
  const flbl = f.kind === "r" ? R[f.i].name : Core.label(f.kind + f.i);
  const fcol = f.kind === "r" ? (DOMC[R[f.i].domain] || "var(--ink)") : f.kind === "c" ? "var(--con)" : "var(--k3)";
  s += `<g class="wcenter" ${f.kind === "r" ? `data-r="${f.i}" style="cursor:pointer"` : ""}>
    <circle cx="${cx}" cy="${cy}" r="7" fill="${fcol}"></circle>
    <text x="${cx}" y="${cy - 15}" text-anchor="middle">${esc(trim(flbl, 42))}</text>
    ${f.kind === "r" ? `<text x="${cx}" y="${cy + 26}" text-anchor="middle" style="font:10.5px var(--sans);fill:var(--faint)">click for dossier</text>` : ""}</g>`;
  return s;
}

function walkNode(x, y, a, it, color) {
  const right = Math.cos(a) >= 0;
  const fill = it.rcolor || color;
  const dk = it.k[0] === "r" ? `data-r="${it.k.slice(1)}"` : `data-node="${it.k}"`;
  const sub = it.sub ? `<tspan style="fill:var(--ghost);font-size:9px"> ${esc(it.sub)}</tspan>` : "";
  return `<g class="wnode" ${dk} transform="translate(${x.toFixed(1)},${y.toFixed(1)})">
    <circle class="halo" r="11"></circle>
    <circle r="4" fill="${fill}" fill-opacity=".9"></circle>
    <text x="${right ? 9 : -9}" y="3.5" text-anchor="${right ? "start" : "end"}">${esc(trim(it.lbl, 30))}${sub}</text></g>`;
}

// ---------- canvas interaction --------------------------------------------
let _drag = null, _moved = false;

function wireCanvas(wrap) {
  const world = wrap.querySelector("#world");
  const isMap = State.walk.focus.kind === "map";

  wrap.onwheel = e => {
    e.preventDefault();
    const v = State.view;
    const rect = wrap.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const nk = Math.min(9, Math.max(0.4, v.k * (e.deltaY < 0 ? 1.16 : 1 / 1.16)));
    v.tx = mx - (mx - v.tx) * nk / v.k;
    v.ty = my - (my - v.ty) * nk / v.k;
    v.k = nk;
    if (isMap) {                                    // re-render: keeps labels readable
      if (!_rafPending) {
        _rafPending = true;
        requestAnimationFrame(() => { _rafPending = false; drawCanvas(); });
      }
    } else world.setAttribute("transform", `translate(${v.tx},${v.ty}) scale(${v.k})`);
  };

  wrap.onpointerdown = e => {
    if (isMap) mapCard(null);
    _drag = { x: e.clientX, y: e.clientY, tx: State.view.tx, ty: State.view.ty };
    _moved = false;
    wrap.classList.add("dragging");
    wrap.setPointerCapture(e.pointerId);
  };
  wrap.onpointermove = e => {
    if (!_drag) return;
    const dx = e.clientX - _drag.x, dy = e.clientY - _drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) _moved = true;
    State.view.tx = _drag.tx + dx; State.view.ty = _drag.ty + dy;
    world.setAttribute("transform", `translate(${State.view.tx},${State.view.ty}) scale(${State.view.k})`);
  };
  wrap.onpointerup = wrap.onpointercancel = () => {
    _drag = null;
    wrap.classList.remove("dragging");
    if (isMap) mapCard(State.walk.sel);
  };
  if (isMap) wrap.querySelectorAll(".mapdot").forEach(g => {
    g.onpointerenter = e => { if (e.pointerType === "mouse" && !_drag) mapCard(+g.dataset.r); };
    g.onpointerleave = () => { if (!_drag) mapCard(State.walk.sel); };
  });

  const click = (el, fn) => el.onclick = e => { if (_moved) return; e.stopPropagation(); fn(); };

  wrap.querySelectorAll("[data-r]").forEach(g => click(g, () => {
    const ri = +g.dataset.r;
    if (isMap) {
      State.walk.sel = ri; State.walk.hl = ri;
      renderRail(); drawCanvas();
    } else if (State.walk.focus.kind === "r" && State.walk.focus.i === ri) openDossier(ri);
    else goWalk({ kind: "r", i: ri });
  }));
  wrap.querySelectorAll("[data-node]").forEach(g => click(g, () =>
    goWalk({ kind: "node", k: g.dataset.node })));
  wrap.querySelectorAll("[data-morering]").forEach(g => click(g, () => {
    const id = g.dataset.morering;
    State.walk.caps[id] = (State.walk.caps[id] || RINGCAP) + 24;
    drawCanvas();
  }));
}

// ---------- walk rail ------------------------------------------------------
function walkRailHTML() {
  const f = State.walk.focus;
  let h = "";

  if (f.kind === "map") {
    h += `<div class="sect"><h3>The similarity plane</h3>
      <div class="hint">Scroll to zoom, drag to pan, click a dot.</div></div>`;
    if (State.walk.sel != null) {
      const r = R[State.walk.sel];
      h += `<div class="sect"><h3>Selected</h3>
        <div style="font:600 15px var(--serif)">${esc(r.name)}</div>
        <div class="hint" style="margin:3px 0 8px">${esc(r.group || "(group unlisted)")} · ${esc(r.domain)}${r.leader ? " · group leader" : ""}</div>
        <div class="selkw">${kwChips(State.walk.sel)}</div>
        <div class="rowbtns" style="margin-top:10px">
          <button class="sbtn" data-walkact="doss" data-rid="${State.walk.sel}">Dossier</button>
          <button class="sbtn" data-walkact="walkr" data-rid="${State.walk.sel}">Walk from here</button>
        </div></div>`;
    }
  }

  if (f.kind === "r") {
    const r = R[f.i];
    h += `<div class="sect"><h3>Walking from</h3>
      <div style="font:600 15px var(--serif)">${esc(r.name)}</div>
      <div class="hint" style="margin:3px 0 8px">${esc(r.group || "(group unlisted)")} · ${esc(r.cluster)} · ${esc(r.domain)}</div>
      <div class="rowbtns"><button class="sbtn" data-walkact="doss" data-rid="${f.i}">Dossier</button>
        <button class="sbtn" data-walkact="map" data-rid="${f.i}">Show on map</button></div></div>
      <div class="sect"><h3>Reading the rings</h3>
      <div class="hint">Inner rings are this researcher's own words by provenance —
      <span class="dot l1"></span> declared, <span class="dot l2"></span> description,
      <span class="dot l3"></span> abstracts — the outer ring the
      <span class="dot lc"></span> concepts those terms bind to. Click anything to re-centre.</div></div>`;
  }

  if (f.kind === "t") {
    const t = T[f.i];
    h += `<div class="sect"><h3>Term</h3>
      <div style="font:600 15px var(--serif)">${esc(t.label)}</div>
      <div class="hint" style="font-family:var(--mono);font-size:10.5px;margin-top:3px">norm: ${esc(t.norm)}</div>
      <div class="hint" style="margin-top:8px">A term is a piece of source text, kept verbatim. Its rings: the concepts it binds to, every researcher whose material contains it (badged by layer), and sibling terms bound to the same concepts.</div></div>`;
    const cons = Core.conceptsOfTerm("t" + f.i);
    if (cons.length) h += `<div class="sect"><h3>Bound concepts</h3><div class="kwline">${
      cons.map(e => `<span class="chip lc clickable" data-walkact="node" data-key="${e.c}" title="${e.rel}">${RELG[e.rel] || ""} ${esc(Core.label(e.c))}</span>`).join("")}</div></div>`;
  }

  if (f.kind === "c") {
    const c = C[f.i];
    h += `<div class="sect"><h3>Concept</h3>
      <div style="font:600 15px var(--serif)">${esc(c.label)}</div>`;
    if (c.note) h += `<div class="hint" style="margin-top:5px">${esc(c.note)}</div>`;
    const anch = [
      ...c.msc.map(a => ["MSC", a]), ...c.ccs.map(a => ["CCS", a]),
      ...c.arxiv.map(a => ["arXiv", a]), ...c.oa.map(a => ["OA", a]),
    ];
    if (anch.length) h += `<div class="kwline" style="margin-top:9px">${anch.map(([w, a]) =>
      `<span class="vchip" title="${w === "MSC" ? "Mathematics Subject Classification 2020" : w === "CCS" ? "ACM Computing Classification System" : w === "arXiv" ? "arXiv category" : "OpenAlex topic"}">${esc(w)} · ${esc(trim(a, 34))}</span>`).join("")}</div>`;
    if (c.aliases.length) h += `<div class="hint" style="margin-top:9px">Aliases: ${esc(c.aliases.slice(0, 8).join(", "))}${c.aliases.length > 8 ? ` +${c.aliases.length - 8}` : ""}</div>`;
    h += `</div>`;
    if (State.editing) h += `<div class="sect"><h3>Edit this concept</h3>
      <div class="rowbtns">
        <button class="sbtn" data-walkact="merge" data-ci="${f.i}">Merge into…</button>
        <button class="sbtn" data-walkact="addlink" data-key="c${f.i}">Add link…</button></div>
      <div class="hint" style="margin-top:7px">Merging reroutes every edge and alias; both are recorded below and reversible.</div></div>`;
  }
  return h;
}

function wireWalkRail(b) {
  const act = b.dataset.walkact;
  if (act === "doss") b.onclick = () => openDossier(+b.dataset.rid);
  if (act === "walkr") b.onclick = () => goWalk({ kind: "r", i: +b.dataset.rid });
  if (act === "map") b.onclick = () => locateOnMap(+b.dataset.rid);
  if (act === "merge") b.onclick = () => mergeConcept(+b.dataset.ci);
  if (act === "addlink") b.onclick = () => addLink(b.dataset.key);
  if (act === "node") b.onclick = () => goWalk({ kind: "node", k: b.dataset.key });
}

// ===========================================================================
// SHELL — tabs, edit toggle, about, init.
// ===========================================================================
function setTabs() {
  ["search", "browse", "walk", "news"].forEach(m =>
    $("#tab-" + m).classList.toggle("on", State.mode === m));
}
function setMode(m) { State.mode = m; setTabs(); refresh(); }

$("#tab-search").onclick = () => setMode("search");
$("#tab-browse").onclick = () => setMode("browse");
$("#tab-walk").onclick = () => setMode("walk");
$("#tab-news").onclick = () => { setMode("news"); loadNews(); };

$("#editToggle").onclick = () => {
  State.editing = !State.editing;
  document.body.classList.toggle("editing", State.editing);
  $("#editToggle").classList.toggle("on", State.editing);
  toast(State.editing
    ? "Edit mode — ✕ cuts, ×w reweights; every change is listed in the rail and reversible"
    : "Edit mode off — your edits stay applied");
};

$("#aboutBtn").onclick = () => openModal(`
  <div class="mh">What Atlas is</div>
  <div class="mb" style="font-size:13.2px;line-height:1.55;color:#33383F">
    <p>Atlas is a fixed semantic structure built <b>once</b> from the department's
    expertise database, then only ever <i>traversed</i>. Nothing interprets your
    query at run time — you choose the words, the graph answers with paths.</p>
    <p style="margin-top:9px"><b>Provenance is never averaged away.</b> Every term a researcher
    carries knows where it came from —
    <span class="dot l1"></span> declared keywords,
    <span class="dot l2"></span> self-description,
    <span class="dot l3"></span> publication abstracts — and every result shows
    its layer, its hop count, and the exact source sentence, separately.</p>
    <p style="margin-top:9px"><b>Concepts</b> <span class="dot lc"></span> form the outer
    vocabulary: ${C.length} curated entries anchored to MSC&nbsp;2020, ACM&nbsp;CCS, arXiv
    and OpenAlex, connected by typed relations
    (<span style="font-family:var(--mono)">≡</span> equivalent,
    <span style="font-family:var(--mono)">⊃⊂</span> broader/narrower,
    <span style="font-family:var(--mono)">~</span> related — each with a written
    justification, <span style="font-family:var(--mono)">⌐</span> lexical containment).</p>
    <p style="margin-top:9px"><b>The graph is yours to correct.</b> Turn on <i>Edit graph</i> to cut
    links or attachments, reweight them, merge concepts, or add justified links.
    Edits persist, are listed in the rail, and can be exported, imported, or undone
    one by one. The underlying build is never touched.</p>
    <p style="margin-top:9px" class="hint">Built ${esc(G.meta.built)} from ${esc(G.meta.source)} ·
    ${R.length} researchers · ${P.length} publications · ${G.terms.length} terms ·
    ${G.sem.length} typed edges.</p>
  </div>
  <div class="mfoot"><button class="sbtn" onclick="closeModal()">Close</button></div>`);

$("#dclose").onclick = closeDossier;
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { closeModal(); closeDossier(); }
});

let _rsz = null;
window.addEventListener("resize", () => {
  clearTimeout(_rsz);
  _rsz = setTimeout(() => { if (State.mode === "walk") renderWalk(); }, 160);
});

/* Reading the store is asynchronous, and the room announces itself to the
   Hub synchronously at the bottom of this file — so the cloud can download
   and apply a copy while this await is still outstanding. Without the
   flag, the local read would then land on top of it and quietly undo the
   download, on a slow disk only. Whoever gets there first wins, and the
   cloud getting there first is the case that matters. */
let adopted = false;
(async function init() {
  const stored = await Store.load();
  if (adopted) return;
  Core.setEdits(stored);
  refresh();
})();
/* Once, a moment after start, so the tab can say how many are waiting: the
   bridge that holds the cloud connection loads after this file. */
setTimeout(loadNews, 1500);



/* --- exposed to the hub --- */
try{ if(typeof closeModal==='function') window.closeModal=closeModal; }catch(e){}
/* The Atlas opens on any-term matching and two hops. One hop and all
   terms required is the setting that actually gets used, so that is what
   it opens on — set here rather than in the app, which stays a file you
   can open on its own. */
try{
  if(typeof State!=='undefined' && State.opts){
    State.opts.maxHops = 1;
    State.opts.requireAll = true;
    if(typeof refresh==='function') refresh();
  }
}catch(e){}
/* state and applyState are this room's half of the app's one Export /
   Import door, and of the cloud sync — named exactly as Semaphore and
   Notes name them so both can ask every room the same question. Until
   they existed the Atlas was the only room whose work rode in nothing:
   its edits sat in one browser's storage and left it only if you
   remembered to press Export in the rail. Everything below the graph is
   the base file, which never changes; the edits are the whole of what
   this room has to say about itself. */
try{ Hub.expose('atlas',{
  openDossier: (typeof openDossier==='function')?openDossier:null,
  G:           (typeof G!=='undefined')?G:null,
  state:       function(){ return { v:1, edits: Core.getEdits() }; },
  /* Replaced rather than merged, as the other rooms are: two edit lists
     both say what the graph should look like, and a half-merge would mean
     a cut on one machine silently outliving its undo on the other. A file
     or a cloud row written before this simply has no edits key, and
     leaves what is here alone. */
  applyState:  function(s){
    if(!s || !(s.edits instanceof Array)) return false;
    adopted = true;
    Store.unread = false;
    Core.setEdits(s.edits);
    Store.save(s.edits);
    refresh();
    return true;
  }
}); }catch(e){}
});
