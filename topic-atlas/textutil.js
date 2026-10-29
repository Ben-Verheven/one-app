/* The Topic Atlas's engine, the half that reads a text into words
   (TextUtil). It stood inside the
   Topic Atlas's page until 2026-10-29, when the Call Board's Atlas switch
   took over its search and the page was retired (see
   notes/topic-atlas.md). */

/* Text handling shared by the build and the app.

   norm() and singular() are an exact copy of the Atlas's own
   (one-app/rooms/atlas/atlas.js, Core › normalization), so a word typed
   into this app is turned into the same string the Atlas would turn it
   into. The irregular-plural table is the Atlas's too; the build copies it
   out of the Atlas graph into libraries/methods.json, so the app never
   reads One App at runtime.

   tokens() is the one addition: the same normalisation, but done word by
   word over a paragraph so every word keeps its character offsets in the
   original text. That is what lets a concept found in a topic point at the
   exact phrase it came from. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TextUtil = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function make(IRR) {
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
        .replace(/[‐-―−]/g, "-")
        .replace(/[‘’“”´`]/g, "'")
        .replace(/\//g, " ")
        .replace(/[^a-z0-9\- ]+/g, " ")
        .replace(/-/g, " ");
      return s.split(/\s+/).filter(Boolean).map(singular).join(" ");
    }

    /* Words with their offsets. A word is a run of characters that norm()
       would keep (a-z, 0-9 after NFKC and lower-casing); anything else ends
       it, exactly as norm() turns it into a space. Each word carries three
       spellings: n — normalised and singular, as norm() gives it;
       l — lower-case only; c — case kept (for acronyms such as AI or PV).
       One departure from norm(): a footnote number glued to the end of a
       word ("disabilities73", "Leadership35") is split off, because the
       Commission's PDFs glue them on and the word would otherwise be lost.
       Acronyms written in capitals (IRIS2, NIS2, CO2) are left whole. */
    function tokens(text) {
      const out = [];
      let cur = "", curC = "", start = -1;
      const flush = (end) => {
        if (start < 0) return;
        const m = /^([a-z]{4,})(\d{1,3})$/.exec(cur);
        const lettersC = curC.slice(0, m ? m[1].length : 0);
        if (m && lettersC !== lettersC.toUpperCase()) {
          const cut = start + rawLen(text, start, m[1].length);
          out.push(word(m[1], lettersC, start, cut));
          out.push(word(m[2], m[2], cut, end));
        } else out.push(word(cur, curC, start, end));
        cur = ""; curC = ""; start = -1;
      };
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const nk = ch.normalize("NFKC");
        const low = nk.toLowerCase();
        if (/^[a-z0-9]+$/.test(low)) {
          if (start < 0) start = i;
          cur += low; curC += nk;
        } else flush(i);
      }
      flush(text.length);
      return out;
    }
    /* how many original characters produce the first k normalised ones */
    function rawLen(text, from, k) {
      let got = 0, i = from;
      while (i < text.length && got < k) {
        got += text[i].normalize("NFKC").toLowerCase().length; i++;
      }
      return i - from;
    }
    function word(l, c, s, e) { return { n: singular(l), l, c, s, e }; }

    /* Sentence spans inside one paragraph, for the snippet under a hit.
       A sentence ends at . ! ? or ; followed by space and a capital,
       a bullet, an opening quote or a digit. */
    function sentences(text) {
      const out = []; let s = 0;
      const re = /[.!?;](?=\s+[A-Z•“"(0-9])/g;
      let m;
      while ((m = re.exec(text))) {
        const e = m.index + 1;
        if (e - s > 1) out.push([s, e]);
        s = e; while (s < text.length && /\s/.test(text[s])) s++;
      }
      if (s < text.length) out.push([s, text.length]);
      return out.length ? out : [[0, text.length]];
    }

    return { singular, norm, tokens, sentences };
  }

  return { make };
});
