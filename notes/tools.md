Every tool explains itself in its docstring, PROJECT.md says what each is
for, and NAMES.md's own text now explains its two orphan lists. Only these
live here.

**NAMES.md's first orphan list is short enough to trust; treat a new entry
in it as a finding.** It was rebuilt on 2026-09-03, when "painted, never
written" held forty-five names of which only eleven were dead — the other
thirty-four were live families whose names the code assembles (`'k-' +
stage`, `ns + '-row-main'`). Two blind spots remain and neither is fixed:
**ids are not covered**, so pass an id whole — `pane: 'pane-semaphore'` —
even where it could be built, and say in a comment that the index is why;
and a class assembled somewhere that is neither a `class=` attribute, a
`classList` call, nor a quoted fragment beside a `+` is still invisible.
*The habit that catches this:* diff the orphan lists between the old and
new NAMES.md after a change. It costs one small script and catches real
regressions.

**A stray quote character used to eat a whole file, silently.** Reading
string literals with one regex meant the backtick inside `atlas.js`'s
quote-normalising regex (`.replace(/[…´\`]/g, "'")`, line 27) paired with
the next one in the file, and every name written in the eighteen hundred
lines below it read as a dash in the index. `names.py` now walks the file
properly — line comments, block comments, regex literals, and templates
nested inside `${}` holes.
How to apply: any new scan over these scripts should use `literals()` from
`names.py` rather than a fresh regex; the same trap is waiting.

**Watch the worst unmapped stretch in MAP.md.** A run of much more than
about 400 lines with no section banner in it means a section wants
splitting. No tool prints this number; it is read off the map.

**`lint.py` was verified by breaking things, not by reading it.** On
2026-08-21 all six checks were confirmed against a throwaway copy with
each rule deliberately violated. If a check is added, add the
corresponding break-it test — a lint nobody has seen fail is a lint that
passes everything. A throw put at the top of `notes.js` was seen to fail
`finish.py`'s smoke with the report printed whole.

**`seed.js` refuses to run in a browser that holds anything, so a record
the app makes for ITSELF stops the seed dead.** The Horizon programme call
is written by `ensureProgramme()` on the very first load, so from
2026-08-28 an untouched browser held one call and `assertBlank` counted it
as Mark's work — `seed.all()` threw and every screenshot script with it.
Fixed by excluding `__horizon__` from that count.
How to apply: anything else ever added that the app creates unasked — a
second permanent bucket, a default board, a starter note — has to be
excluded from `assertBlank` in the same breath, or the seed stops working
and the failure reads as if the browser were dirty.

*Its other use is proof that a change is invisible.* Run `seed.js` into
one folder before a refactor and another after, and compare the eight PNGs
pixel for pixel; identical images are the only honest evidence that a
cleanup changed nothing on screen. The seeded data is the same on both runs,
but the clock is not: `semaphore-board` and `callboard` draw a today line
placed by the time of day, so shots taken an hour apart differ by a few
pixels there with no change at all. Before calling a diff real, shoot the
untouched app again straight away and compare that as well.

**A static pass worth repeating on a big cleanup** (2026-09-15): the
TypeScript compiler's `noUnusedLocals` over the room scripts, and a
transitive "defined but never called" walk that counts inline `onclick`
strings as calls, found every piece of dead code that was safe to remove;
the rest of its output was noise. Neither is a tool in the folder: both
were short throwaway scripts over the TypeScript compiler's API.
Two more that neither of those can see (2026-10-07): **every `Hub.expose`
member checked against its callers** in `bridge.js`, `ledger.js`'s
`ROOM_STORES` loop and `tools/` — nine were offered and never asked for —
and **every `--custom-property` and `@keyframes` checked for a use**.
And one that does both of the first two at once (2026-10-24): **ESLint**,
which is in the container, with `no-undef` and `no-unused-vars` over every
script, the browser's globals read from Playwright's own `window` and the
app's few added (`Hub`, `supabase`, the data files' functions). Mark's
Place's two pages are not in `index.html` and so in no index or lint here:
cut their inline scripts and styles out and give them the same pass. It
found the Semaphore's link form two days after its last button had gone.

See also [working-here](working-here.md) and [pitfalls](pitfalls.md).
