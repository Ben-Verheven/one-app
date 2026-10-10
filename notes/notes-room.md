How the room works is written where every other room's is. Only the
decisions are here.

**Rows come before pages.** A set of 3+ notes divides into rows; a book
needs 12+ before it may also have page tabs, each page must hold at least
15% of the book (never fewer than 3 notes), and one qualifying page is
treated as no division at all. The first build had this inverted — pages
at 6, rows at 4 — so pages appeared at once and rows never formed. When
pages do appear they must be the largest splits, not merely the best
available.

**Tags can be tied to each other** on the "How tags relate" page: *the
same kind as* (siblings never subdivide one another) and *a kind of* (the
narrow tag divides the broad book; the broad one never divides the narrow;
and a note tagged with the narrow tag counts under the broad one
everywhere the shelf counts).

**A declared kind is owed its place, past every bar.** Added 2026-08-22 at
Mark's instruction. If ITEA is a kind of industrial grants, the industrial
grants book has an ITEA page or row in it whatever the counting says — the
0.8 ceiling, the tab and row caps, the two-note minimum and the
identical-set pruning are all overruled for it, and declared kinds are
placed before the earned ones so a cap can never be spent first. His own
room is the case: ITEA stood on all seven notes of that book and so
appeared nowhere inside it. The one bar a tie does not buy past is UNI,
the room-wide near-universal tags — being tied buys a place in one book,
not in every book.

**Full overlap, no switch.** A note stands in every book its tags earn.
The bar once offered an "everywhere / once" choice; once-mode was removed
on 2026-08-22 because Mark only ever used everywhere and says that is how
the room is meant to work. Do not reintroduce it. That switch is now
**shelf / tags** — two ways to a note: the computed shelf, or picking one
tag then another by hand with no arithmetic in the way.

**Months divide a pile, not a pick.** The tags view groups into months
only while nothing is picked; once a tag is chosen the notes stand in one
row, newest first. His instruction, 2026-09-09: the pile is already
divided by the tag, and four month headings between him and six notes
answer a question nobody asked. Every note, search and Untagged keep their
months.

## The clipboard, both ways

How the paste sieve and the copy path work — Word lists, Excel's
stylesheet, table widths in shares and points, rules, the tofu
characters, blank lines, plain text — is commented in `notes.js` beside
each step. Only his choices and the lessons are here.

**When a paste sieve is asked for, the copy path is half the job — check
it in the same pass.** Chromium copies the computed style, so a note
copied into Word arrived cream-on-white and very nearly invisible.

**A whole note copies in one press, and only its words go** — `.nt-copy`,
or ctrl on a pill. **Not the name and not the tags**: he asked for the
title to be left off within the hour of it being added.

**Rows only, and that is his choice.** Offered three scopes for editing a
pasted table, he took add and remove rows. `#nt-tbar` carries two buttons
and no more. **Do not add column controls without asking him again.**

**A tofu box in a screenshot names its own bug**: crop the box and scale
it up, and the character's number is printed inside it.

**Test it as a round trip, and keep a sample of every source.** Dispatch a
real `ClipboardEvent` carrying the source's own `text/html` into
`#nt-body` in a throwaway browser, copy the result back out through
`navigator.clipboard.read()` (needs an http origin and granted clipboard
permissions — `file://` cannot be granted), paste that back in, and
compare. Five samples are worth rebuilding if they are lost: plain Word
prose with lists and an indent; an Outlook mail of stacked tables; a Word
table with cells merged down the rows; the same table copied straight out
of Excel; and **a faithful Excel sheet** — its `<style>` block with the
bare `td` rule and numbered `xl6x` classes, bold and italic and alignment
declared only there, unruled heading rows above a bordered block, and the
hidden `display:none` row at the foot. That last one is the only sample
that exercises `inlineSheet` at all. **Source → note → source → note is
lossless when it is right**, and that comparison is what caught the width
reader not understanding its own percentages, the percentage rounding
drift, and the point rounding drift after it.

## The 2026-09-03/04 pass — his own brief, and what was decided with him

Two comparison sheets were drawn before anything was built, and he picked
from both; the choices below are his, not the room's.

**The sheet is three columns and the name column is measured.** Rows were
a flex run, so each row's notes started wherever that row's name ended;
he called the sheet cluttered. 150px for the name (118 under 1100px), the
notes taking what is left, the tally at the right edge — and the
alternatives he turned down were the name set over its notes (+22px a row)
and the names ranged right (which only moves the ragged edge). A month row
is the same row: do not give it a shape of its own again.

**Pinning is a stack, never a numbering.** Pin a page tab, a row or a note
and it takes the first free place; pin a second and it takes the second.
There is no way to type a position and no way to leave a gap, which is
exactly what he asked for ("I only need to be able to say: the first row
should stay. And only then the second"). Pins hang off the book they were
made in and are never pruned.

**Pins and colours live behind one "arrange" press at the foot of the
sheet.** Reading a book and rearranging it are different jobs; the sheet
at rest carries no pins and no swatches at all.

**A chosen colour beats the hash, per tag, everywhere that tag is drawn.**
The hash palette is the default only. The leftovers row has no tag, so it
gets a pin but no swatch.

## The note panel — settled over four corrections in one evening

**Always on screen: the title, the day it was written, the words, and the
tags.** The dates moved up out of a strip of controls at the bottom where
they read as one more control. The tags were put in the drawer for half a
day and Mark had them straight back out — *"that's also always needed"*: a
note's tags are what files it, and a note whose filing you cannot see is a
note you cannot trust the shelf about.

**A note being written has the sheet to itself.** `writing` holds its id;
while it is set the sheet is that one note in a `.nt-row-solo` row — no
pill, no tally, head "A new note", and the colophon nut for a foot. It
used to be dropped into Every note with its panel open, so writing
happened against a wall of every note of this month and the last. Nothing
about where you were changes: `cur` and the search box are left alone, so
closing the note puts the book you were reading back, by which time the
new note's tags have filed it. The fresh sheet lasts exactly as long as
its own note is the open one (`panel.id===writing`), so every way out of a
panel ends it without saying so — except pressing a tag chip inside the
note, which clears `writing` by hand because it is a move to that tag's
book with the note carried along.

**Opening the formatting rail must not re-render.** It did, and Mark
called the result "jumpy and not peaceful", correctly: writing it into the
panel on demand repainted the whole sheet, which replayed the panel's own
balloon and moved the rows under it in the same frame as the rail appeared
— three movements at once. It is always in the DOM, opening is class names
plus a max-height, and two rules came out of it:

- **The balloon plays on the render that first draws a note and no other**
  (`.nt-panel-new`, set by `panelFresh`). On `.nt-panel` itself it
  replayed on every repaint of the sheet, so adding a tag bounced the
  whole capsule under the caret.
- **The height an opening animates to is measured, not a CSS ceiling.**
  `scrollHeight` reports the content height even while `max-height` is
  clamping it to nothing. A ceiling has to be generous enough for a
  fallback font that measures taller, and every pixel of that generosity
  is time in which the thing is already fully open and still animating —
  which is precisely what makes one of these feel like it stalls. The
  ceiling in the stylesheet is only for a rail that was already open when
  the sheet repainted, where nothing is moving anyway.

**Nothing in the panel may take a line of its own from the note.** The
same reasoning settled the table bar on 2026-09-09: it is positioned out
of the flow, because a control that occupied a line would shove every
table below it the moment a caret landed in one.

**A control in the head must not pull the caret.** `onmousedown="return
false"` on copy, as on every button in the formatting rail: a press that
blurs the body loses the selection the act was about, and blurs a note
that was being written.

**"Points at" is gone, and so is the socket.** A note could list projects,
calls and researchers elsewhere in the app; he had it, never used it, and
had it removed entirely on 2026-09-03 — chips, picker, `setRefSource` /
`setRefOpen` and the thirty lines of bridge that filled them. Old notes
may still carry a `refs` array and nothing reads it. Do not offer it
again: a note here is general memory, not a record hung on one proposal.

## Reading and writing became two states — 2026-09-09, his own brief

**A note opens as a page, not as a box.** The title and the body take no
caret until the **edit** button beside the stamp is pressed; a stray click
in a note he was only reading used to change it. `editing` is the flag,
it is a fact about the room rather than about the note, and it resets with
every note opened. Links in the body are clickable while reading, which is
easier than it was.

**A new note opens the other way round** — already editing, rail out,
caret in the title — because it exists in order to be written in.

**The rail is a strip under the head, and the foot drawer is gone.** Two
placements were drawn for him at the panel's real width and he chose the
strip over folding the eight buttons into the head row beside the stamp;
Delete came with it to the strip's far end, and the hairline drawer tab
was deleted outright. The old reasoning for the drawer — nothing may come
between the title and the first line — was answered rather than broken:
what is between them now is only ever on screen while he is writing, and a
note being read still shows no machinery at all. **This does not license
putting a permanent toolbar back there.**

**A body that can be typed in says so** — the faintest wash and an inset
hairline (`.nt-body.on`), padding stolen back from a negative margin so
the words do not shift as it comes on. The lit gold **edit** button says
the same thing a second time on purpose; a pressed state drawn as a border
alone is invisible in a panel whose every edge is already a hairline of
the same brass. Copy stands beside it in the same shape and has no lit
state at all — it is an act, not a mode.

**The stamp is one date.** "made 6 Sep · edited 8 Sep" became "6 Sep" at
his instruction — no "made", no "edited", no prose. The edited time is
still kept and still written, because the shelf sorts on it; it is simply
not shown. Do not put it back on screen.

**Editing puts the caret at the END of the body**, not at the start where
a bare `focus()` leaves it: a note reopened to be added to is the ordinary
case.

## The nuts — read this before drawing anything nut-shaped

**It is a hazelnut** — a rounded shell under a dark toothed cap, with a
stem and one crease — and it is one drawing: `.g-notes` in `shell.css` is
two of them, `.nt-nut` in `notes.css` is one, both inline SVG carried as
data URIs. The first attempt was pseudo-elements with `border-radius` and
a gradient and Mark's verdict was **"two eggs"** — correctly: a smooth
oval with a highlight has no shell, no seam, no cap, and the eye files it
under egg. **Features are what make a nut a nut, and border-radius cannot
draw them.** The cap is the feature that carries the hazelnut at 20px;
everything else disappears at that size. The pair needs the back nut in a
darker gradient and set apart, or two identical shells overlap into one
blob — the egg failure again at a smaller scale.

*(Worth knowing when a choice is put to him: the answer recorded for that
question came back "walnut" and he had meant hazelnut, so a walnut was
built and had to be redrawn. When a pick is purely visual and cheap to
show, put the built thing in front of him early rather than trusting the
recorded answer alone.)*

**A nut is never on every note.** It was, for one day — a nut before every
pill — and he had it taken off: *"preceding all notes with a nut…nah"*. A
mark on everything is a bullet point in a costume. What he asked for
instead was nuts **"in unexpected funny places"**, and he chose four, all
met in passing: the running foot of every sheet (a printer's device
closing the tally), the empty room, a search that finds nothing ("Nothing.
Not a nut."), and the Untagged book — whose heading reads "buried, and not
yet dug up" and whose foot nut is half-faded with a tooltip saying a
squirrel forgets about a quarter of them. He turned down the chapter-head
flourishes, the shelf fold and the shelf split. **A fifth place is one too
many.** If a nut is ever added somewhere, another comes off. (The new-note
sheet's foot carries the colophon nut, which is the same first place.)

**Writing a note is the nut itself.** No border, no fill, no word — the
hazelnut at 34px at the head of the shelf, tilting on hover. It has been
three things in two days: a small slab in the bar (invisible), a
full-width gold slab at the head of the shelf (*"a but too much in your
fase"*), and now this. The label lives only in `title` and `aria-label`;
that cost was named to him and he took the option anyway, so **do not put
a word back beside it without asking.**

**A book is a stack of paper**: laid texture on the sheet, a rule under
the chapter head, the tally set as a running foot, and `.nt-leaves` — two
page edges showing below. He was offered a sewn spine as well and turned
it down; it would have fought the coloured row edges for the left margin.

See also [marks-notes](marks-notes.md) for the tag vocabulary the shelf is
computed from, and [pitfalls](pitfalls.md) for the class-name clash this room
paid for.
