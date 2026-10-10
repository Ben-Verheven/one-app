The measurement behind PROJECT.md's rule on where a hand-assigned keyword
gets filed, and what the 2.1 MB data file does not say about itself. Never
read that file whole; decode it with a script and print only counts.

**Every word-to-concept link in the file is one of two mechanical rules —
but the rules do not run backwards.** Measured 2026-08-22 over all 1,538:
797 `equivalent` are the term's normalised form *being* a concept's label
or alias, 741 `lexical` are an alias appearing as a whole word-run inside a
longer term, and none were left unexplained. Run *forwards*, though, the
same rules propose 594 edges the file does not have and would file 274
words it left alone — the build applied a further restriction that is not
recoverable from the output. Every linked term has exactly one concept.
Best tie-break found: longest matching alias by characters, earliest start
— it agrees with the file on 1,516 of 1,534.
How to apply: never recompute the file's own placements, or the graph
silently rearranges by ~800 links. The rules are only safe for words that
have no placement yet. That is why the room files only Mark's own
keywords. Any future "re-file everything" feature has to show which words
would move before moving them.

**An edit changes what the dossier SAYS; only a keyword edit changes what
the graph KNOWS.** Mark can rewrite a researcher's description as of
2026-09-11 (`{type:"desc", rL, text}`, one record per researcher — a
rewrite replaces the one before it, the way a weight does). It mints no
term, cuts no attachment and moves no weight, for the reason directly
above: the terms in a description were drawn out of it by the build's
extractor, and nothing this room can write is that extractor. The dossier
says so under the box rather than leaving him to find out.
Two consequences that will break if anybody forgets them:

- **`r.descBase` is the text the offsets belong to.** Every `desc`
  attachment carries character offsets — `a[5..8]` — measured in the
  source description, and the search snippets slice by them. `r.desc` is
  what the dossier shows and may be his; `r.descBase` is what the build
  measured. A snippet that reads `r.desc` quotes nonsense the moment he
  rewrites one, and it looks like corrupted data rather than a bug.
- **The underlines in a rewritten description are found again, not
  extracted again** (`relocateSpans` in the UI half). It searches the new
  text for the labels of the terms this researcher's description ALREADY
  carried, on word boundaries. So a rewrite can lose an underline and move
  one, and can never invent one — the same promise the graph makes, said
  where you can see it. Do not "improve" this into a general extractor.

**One colour for the hand, and it is not a layer.** `--mine` / `--minew` /
`--minei`, cool violet in `atlas.css` and warmed onto the vellum in
`shell.css` beside every other Atlas token. Every other hue in that room
answers *which layer did this come from* — k1 declared, k2 description, k3
abstract, con concept; this one answers a different question, *did the
database say this or did you*, so it had to be a hue none of the layers had
taken. It overrides a chip's wash and never its shape: a keyword Mark
assigned is a declared keyword and belongs on the same line as the rest.
Keep it clear of `--con`, the room's only other violet — they are not drawn
together today (the hand's colour lives on the dossier, `--con` on the walk
rail) and that is the only reason the pair is safe.
An attachment carries its edit id in the last slot, `a[10]`, which is how
the dossier tells a keyword he assigned from one the database declared —
it was already there so that the chip could offer undo rather than a cut.

**The colour goes on the WORDS he added, never on the paragraph.** Built
first as a violet rule down the side of the whole description plus a tint
on all of its ink; Mark's answer the same day: *"can you simply make the
text itself that gets added a different color, text that is not altered
just stays the same."* It is a word-level longest common subsequence of
the source against his version (`addedMask`), matching head and tail taken
off first so the ordinary case — one clause changed in the middle — barely
computes anything. What is left unmatched is his, and only that is inked;
what he kept stays in the ink it was always in. Nothing marks what he
DELETED: the section says which words are his, not what the paragraph used
to be, and revert is one press away for that.
Two things worth knowing before touching it: punctuation rides with its
word, so changing "learning." to "learning" marks the word as added and
that is correct rather than noisy; and the ink composes INSIDE the term
spans (`inkRun` splits each run of `highlightSpans`), so a term he wrote
himself comes out underlined as a term and inked as his at the same time.
A description written where the database had none is violet throughout,
which is honest — all of it is his.

**The stored norms and the JS normaliser disagree on a few words.** The
file keeps `chaos` and `qos`; `norm()` in `atlas.js` strips the trailing s
to `chao` and `qo`, so those terms cannot be matched exactly by typing
them. Four links are affected. Pre-existing, small, and not worth
"fixing" by changing `norm()` — that would shift matching everywhere.

**The reach of the graph is the alias lists, not the edge count.** A
one-word alias is blunt: "model" as a name would sweep 239 existing terms
under one concept, "system" 229, "network" 130, while a specific phrase
catches 0–2. Any UI that edits aliases must show the count and a sample
before it commits.

**219 of Mark's 657 declared keywords reach no concept, and most are not
keywords.** They are whole sentences typed into one spreadsheet cell —
"(ML 4 Visual Anlytics) 4 knowelege generation from data", "abstract",
"architecture". The genuine vocabulary gaps among them are a few dozen.
Size the re-keywording job by that smaller number.

**A room that loads its store asynchronously can lose a race with the
cloud.** The Atlas announces itself to the Hub synchronously at the bottom
of `atlas.js` while `init()` is still awaiting storage — so the sync could
download, apply a copy, and have the local read land on top and silently
undo it. On a slow disk only. Fixed 2026-08-22 with an `adopted` flag that
`applyState` sets and `init()` checks.
How to apply: any future room joining `roomCloud()` whose store is read
asynchronously needs the same flag. Semaphore and Notes read theirs
synchronously and do not.

See also [pitfalls](pitfalls.md) and [tools](tools.md).
