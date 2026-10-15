**Every pane carries a transform, so `position:fixed` inside a room is not
fixed.** `shell.css` → "stage & panes" gives `.pane` a `translateZ(0)
scale()` deliberately, so a room's fixed modals stay inside the room. The
price is that a fixed element inside a scrolled pane is positioned against
the pane's *content* and scrolls with it. Every number from
`getBoundingClientRect` is in window coordinates, so writing one straight
into `top` is right at the top of a room and wrong by exactly the scroll
offset anywhere else.
**Five places in the Ledger had this bug and all five shipped with it.**
`Menu.open`, `DatePicker.open` (found by Mark: the calendar drew four
hundred pixels above the window and looked like a dead control), the
hover label, and — found only on 2026-09-15 — the timeline's deadline
line and the position-drag ghost.
How to apply: park the box at 0,0, read where that lands with
`getBoundingClientRect`, subtract it as the origin. It is zero when
nothing up the tree is transformed. **A box that is itself transformed
(rotated, scaled, centred with translate) cannot park itself** — its own
transform reads as part of the origin — so it asks `fixedOrigin()`, an
untransformed probe, instead. **When one instance of a trap like this
turns up, grep the room for the others the same day** — search for every
`position:fixed` whose `left`/`top` is written from a rect; three times
now the others sat there for days or weeks. A full-screen `inset:0` overlay is the easy case
and needs none — `#pj-dialog`, `#pj-palette` and `#qt` all just cover the
pane.
Second half of the same lesson: **clamping to the window is not clamping
to what you can see.** The room's `.oa-bar` is sticky inside the pane and
the shell's title sits in a stacking context a room's own overlay cannot
reach, so an overlay that only flipped at the window edge was drawn under
both. Ask `.oa-bar` where it ends rather than writing the 60 out again.

**An animation with `both` keeps its last keyframe for good, so anything
the keyframes leave out of `transform` is silently thrown away.** The
deadline mark is `translate(-50%,-50%) rotate(45deg)` and shared the dot's
`hzPop` keyframes, which carry no rotation — so every deadline on the
board drew as a square, under a comment promising a diamond, for as long
as the pop had existed. Found 2026-08-21 only because a 3× zoom was taken
of something else; fixed with a `hzPopDl` of its own.
How to apply: a keyframe that touches `transform` must restate every part
of the transform the rule sets.

**A second `transition` at equal specificity REPLACES the first — it does
not add to it.** Found 2026-08-28, in the hour it was written: a new
`#pane-ledger .todo-card-later{transition:opacity 0.16s ease}` further down
the stylesheet, added so a card could fade, silently took the lift, the
border and the shadow off the hover of every todo card in the room. Nothing
errors, nothing looks broken in a screenshot, and the only symptom is that
a thing which used to move stopped moving.
How to apply: a property that needs a transition goes **onto the existing
`transition` list on the element's own rule**, not into a rule of its own.
Same family as the keyframe trap above — `transition` and `transform` are
both single properties that read as if they were lists.

**The room's shared focus ring is `!important`, and the rule that tries to
spare the fields is not.** Near the top of `ledger.css` a `:focus-visible`
rule puts a 2px gold outline and a 5px glow on every focusable thing with
`!important` on both, and the very next rule — `input, textarea, select,
[contenteditable]` — says `outline:none` plainly and loses. So it had never
once applied. **A contenteditable counts as keyboard focus the moment it is
CLICKED**, not only when it is tabbed to, so every note in the room opened
wearing two gold rings and a glow around four words; Mark reported it on
2026-09-11 as a strong highlight on selecting a note, and it had been there
as long as the ring had. How to apply: anything that wants out of that ring
needs `!important` on `outline`, `outline-offset` AND `box-shadow`, or it
does nothing at all — and check the real thing in a browser rather than
reading the two rules, because the stylesheet reads as if the exemption
works. The fields' own `:focus` styling that the exemption was written for
is still there under it, unused, on inputs across the room.
Second half, and it is a design rule rather than a CSS one: **a ring around
a writing surface that already sits inside a framed panel is a box drawn
inside a box.** The dossier's note panel answers the caret on its own frame
now (`.pi-row .note-panel:focus-within`, one step brighter, the row's
colour kept on the left edge); the body gets nothing. Which note is open is
already said twice over by the lit tab and by the panel being drawn at all.

**A class name is a room-wide namespace, and a second one quietly wins
half an argument.** Found 2026-09-03: the Notes drawer's tab was written
`.nt-more`, which the shelf's fold had been called since the room was
built. The fold's `display:block; width:100%` came first, the new rule's
`display:inline-flex` came later and won — but nothing in the new rule
mentioned `width`, so the tab inherited `width:100%` and drew across the
whole panel. Half the rule applied and half did not, which is the failure
mode to expect: not a wrong element, a *mixed* one.
How to apply: **grep NAMES.md for a class name before writing it**, always
— that is the question the index exists to answer. And read its two orphan
lists at the end of every change; see [tools](tools.md).

**Contrast, measured.** The rule itself is in CLAUDE.md;
these are the numbers that bought it. `--text3` at 9px is 3.5:1, and a
past day dimmed to 40% opacity fell to **1.7:1**, which Mark reported as
unreadable. Fixed 2026-08-21: 11px/600 in `--text2` (6.7:1), past
`#bca070` (4.9:1), today `--gold2`, over-committed `--warn`, no opacity
anywhere. `.lbl-hint` is the same trap in form labels — `--text3` at
0.92em lands at 3.6:1. `#bca070` is the one to reach for when something
genuinely wants to be the quiet half of a pair and still be read.
Corollary, learnt on the todo card's action row and applied there as
`todo-btn-quiet`: **when a control has to be made quieter, take its chrome
and leave its ink.** Dropping the border and ground makes a button recede
without making a word harder to read, and it is reversible on hover.
Greying the label instead is the mistake — 10px letterspaced type on this
ground has no contrast to spare.
The one place opacity is still the right lever is a WHOLE card taken back
at once — a `.pi-fold` receding while its sibling is being pointed at, say.
A card dimmed as one piece keeps every contrast inside it intact; the ban
is on quieting a colour that was already quiet, not on moving a slab.

**The board's day column is never narrower than 27px and never wider than
about 72px.** `WEEK_OPTS` is 2 | 3 | 4 | 6 weeks; the board is 1144px wide
and surrenders the 118px name gutter past 28 days. So 6 weeks is
(1144−6)/42 ≈ 27px and 2 weeks is (1144−118−5)/14 ≈ 72px. 27 is the number
anything drawn inside one day has to fit.

**Same-day todos make a shape, not a stack** (`clusterAt` in Board →
Lanes). Two lie flat, three a triangle, up to six a hexagon, past six one
in the middle and the rest ringing it. The old 7px-per-todo nudge left the
44px lane at four todos and landed in the row below at five. The dots
shrink as the ring grows so the span stays ≤27px, and a clustered mark
carries `.hz-clus`, which cuts its 25px hit halo to the dot plus 2px —
five 25px halos nine pixels apart would leave only the last one pressable.
A near miss falls through to the lane, which opens the project's list, so
nothing in a shape is unreachable.
It is also why the hover label describes a **cell** — one project's row
where it crosses one day's column, and every todo in it — rather than a
dot. Being told about whichever of five circles the pointer landed on was
the one thing it could not usefully say. That is bound to `mousemove` on
`.hz-proj-track` and not to `mouseover` on a mark: a cell is a region, so
crossing from one day into the next inside a lane fires no mouseover at
all, and the day is read off the track's own `data-days`/`data-start`
rather than any shared state, so it stays right when the window changes.
The label lists one line per todo in three columns, and its first column
is **the board's own marks shrunk** — a circle for work planned into the
day, a diamond for a deadline landing on it, in the category's colour. A
label that repeats the shapes it is describing needs no key and no word
for them; that is what let the category name come off it entirely when
Mark asked for the thing to be sleeker.

**One colour means one thing, and no palette moves any more.** Where three
rounds of the colour question landed, 2026-08-28; every earlier version is
wrong:

- **A todo is its category, everywhere.** Every dot, diamond and runway on
  the board, and the left edge of every todo card in every slice, is the
  todo's own category colour, written when the thing is drawn. A category
  nobody has set keeps the quiet grey, which is the honest answer rather
  than a borrowed one.
- **The calls keep the structure.** The rails down the left of each block,
  the walls across their own rows and the chips in the beam are the call
  colours, and that is how the board still says which call a row is in.
- **Nothing swaps.** There was a mode — call colours until a day was
  opened, categories while it stayed open. Mark asked for categories
  permanently and the mode is gone with `applyPalette` and the `data-cat`
  it read; `data-col` now holds the category colour, which also fixed the
  drag ghost quietly disagreeing with the board underneath it.

What that cost to learn, and it is still worth knowing: **a rule down the
left margin is read as structure whatever it is coloured**, so two of them
side by side, one a rainbow, is two structures disagreeing — which is what
a day cut by project looked like, and Mark called it cluttered. And the
earlier refusals — no half-tint for a part-done checklist, no star for a
focused item — still stand: a 13px mark over a hatched column carries one
signal and no more.
How to apply: **anything new wanting a colour has to say which of the two
it is.** The project name on a card goes plain `--text2` and never carries
its call colour. The card's own `border-left` is the same rule at card
scale — anything that sets `border-color` on a todo card has to put
`border-left-color` back, or it has taken the category edge for something
else.
The Notes room is the one place a colour is Mark's rather than the app's:
since 2026-09-03 a row or page there takes a colour he picks, kept against
the tag — see [notes-room](notes-room.md). That is a choice about his own filing, not a
second meaning for a hue on the board.

**Every mark on the board draws itself from one custom property, `--c`**,
written once at build and never repainted — but the property is still the
lever for anything that ever wants to quiet or recolour the board. Do not
reach for opacity or a filter; both were considered and both are worse.
And never re-render the board for a state like that — walk the marks and
set the property, the way `active` already toggles a class. The cards use
`--edge` the same way at their own scale, and the category dot on a card's
row uses `--c` at its own.

**Categories** live in the `CATS` array in `ledger.js`, the only place
they are written down: label, key and colour together. A todo stores the
key, so renaming a label never touches a journal, and a key left behind by
a dropped category reads as unsaid rather than throwing its todo away —
`Formal` was dropped on 2026-08-27 and any todo still carrying it falls
into "Not said". Mark does not edit that array himself, so adding,
renaming or dropping one is a thing to do for him on request. The array's
order is the palette's order, not a sort order: the picker reads down it,
so neighbours in the menu are neighbours in hue. Label length costs
nothing any more — the card carries a dot and the brace carries the word,
so a new one may be as long as it needs to be.

**Every slice is braced runs, not a list** (Board → Slices). Sixteen todos
on one Friday drew as one wall of identical cards; rebuilt over
2026-08-26/27 into runs of cards, each braced on the LEFT by whatever they
have in common, with an effort beam leading every row. How the braces
group and order is [todo-card](todo-card.md)'s; the decisions about the day
itself are here:

- **Nothing stands over a day's work except one control row.** It carried
  a head (date, count, total planned) and a summary of every category's
  share of the hours; Mark had both taken out on 2026-08-27 because they
  spent vertical space re-answering what the board directly above already
  shows on its axis and its effort strip. Do not put a heading back.
- **A heading never needs its own row.** The group name flanks its run as
  a rounded rule in the group's colour, label at the top — which is what
  made room for the rest. Any future "these belong together" goes in the
  flank, not above the cards.
- **The full date on every card stays.** It was shortened to `Fri 28` on
  the reasoning that it only repeated the day above; Mark asked for it
  back the next day. Do not tidy it away again.
- A day also collects todos whose *deadline* lands on it while their work
  sits earlier. Those must not count towards any subtotal, or the numbers
  contradict the effort strip's own column above them.
- Mark chose plainly against the app judging a day: no "beyond a working
  day", no cut line, no dimming of what will not fit.
- **There is no cut any more: a day is always cut by category.** The
  project half answered a question the board already answers, since a
  project IS a row up there. Whose work it is comes back on demand
  instead — pressing a project's name on any card gathers that project's
  todos to the top and sends the rest of the day off the screen, and the
  chip in the bar gives the day back. A mode you had to be in became a
  question you ask from the card that raised it.
- **A gather narrows the list and nothing else.** The name column used to
  come off every gathered card and the braces used to come off when it
  narrowed to one, both on the reasoning that the chip above already said
  which project — true, and beside the point, because the gather is a
  movement Mark follows with his eye. Both were put back on 2026-08-28.
  See [animation](animation.md) for why a card must not change shape in the
  frame it sets off in, and for how the rest of the day leaves.
- **The lens is gone too** (2026-08-28), on Mark's word. Pressing a
  category to dim the others was a third way of asking what the board's
  own colours already answer. The flank is a label now, not a handle. The
  blocker light added later the same day is not a return of it: it fades
  the list to answer "where is that ONE todo", not to filter it, and it
  lives on a hover rather than a press.
- **Every slice keeps its head except a day.** "Overdue" and "No planned
  date" have no lit label on the board to fall back on, so the heading is
  the only thing saying what you are looking at; a day's own label is lit
  on the axis directly above.

**Effort is drawn, not written** — four segments on every todo card, one
hour each, with the exact figure only on the tooltip. Two numbers there
are not free. **92px**, because the smallest pair the beam must tell apart
is ten minutes against twenty — a sixth of a segment against a third — and
at a 21px segment those are 3.5px against 7px; narrower and both collapse
onto the 3px minimum, which is where the first version at 52px landed.
And **the fourth hour is the end of the beam**, so anything longer lights
all four in `--gold2` instead of `--gold`: without that a half day and a
whole one were the same picture on the day you most need them apart.
Mark asked for a cap of an hour and a half first, then for hours; both
times the ceiling was the wrong lever and the unit was the right one.
**`.hz-eff-unplanned` is the only way into the unplanned slice**, so do
not drop it when touching the effort strip. The strip replaced the old
`.hz-legend`; todos carry `effort` in minutes with 0 meaning not said.

**A todo can wait on another** (`blockedBy`, THE CONDITION in `ledger.js`).
One field, the blocker's id, resolved across the whole CALL and not the
project — a proposal's real dependencies cross the lane constantly, and
`uid()` ids are unique journal-wide so the id alone finds it. No state of
its own: whether the wait is over is a question the blocker already
answers, and a blocker that has been deleted means the wait is over rather
than a todo blocked forever by a ghost. Rings are refused twice — the
picker leaves out anything that already waits on this one, and `setWait`
checks again, because a second card open in another slice can have moved
a wait under this one since the list was built.
The chip on the card wears the **blocker's category colour and that
category's word**, which was the whole point: off a glance you want to
know what KIND of thing is in the way — a budget question, a consortium
answer — not which todo it is. Cleared, it stays and goes grey, because
"you can go now" is the one thing a stack of todos never tells you. How it
is labelled and where it sits is [todo-card](todo-card.md)'s.

**The wait carries the date, one way only** (`moveWaiters`, 2026-08-28).
Move a todo and everything waiting on it moves to the same day, and so on
down the chain. Mark corrected the direction mid-turn and it is the half
worth remembering: **the conditional one follows, never the other way
round.** Move the thing that has to happen first and everything queued
behind it has moved whether the app admits it or not; drag the blocked one
instead and you are only saying "I will do this later than I said". Three
rules bought with it: only the PLANNED date carries (a deadline is
somebody else's date), only a todo that already HAS a planned date follows
(giving one to an undated todo is making a plan, not carrying one — though
it still passes the move on to whatever waits on IT), and the toast says
how many went, because a press that moves one dot and three dots has to
explain itself.

**The wait picker opens on the todo's own project**, with a two-half
switch to the whole call — Mark's own estimate is that the cross-project
wait is real but rare, and thirty rows to read for the four that were ever
likely is the wrong default. The switch is sticky for the session, and the
menu opens wide by itself when the current blocker is in another project,
because a picker that cannot show what is chosen is lying about the state.

**A `var` used before the line that assigns it is `undefined`, hoisting or
not — and in a function built entirely out of string concatenation there
is no error to catch it, only a control that quietly shows the wrong
state.** `TodoCard.html` built `waitPick` (which reads `blk`, the todo's
blocker) a hundred lines above the `var blk=blockerOf(p,e)` that set it,
so every blocked todo's action row showed "Not waiting" — hollow dot,
wrong words — right next to a header chip, built later in the same
function, correctly showing who it was waiting on. It shipped and stood
unnoticed since `blockedBy` was added, because nothing throws: `blk` was
`undefined` where it was read, which is falsy, which is a legitimate value
for an unblocked todo too. Found 2026-08-28 by a screenshot that had both
controls in frame at once and disagreeing — not by testing either in
isolation. How to apply: when a render function reads the same fact twice,
build that fact once, near the top, before anything that reads it —
hoisting saves the declaration, not the value.

**`Dossier.openCard()` outlives the card it names.** `Nav.home()` rebuilds
the page without calling `Dossier.close()`, so the module still names a
project whose fold is long gone — and anything that asks it "which project
is open" answers with a project in a call you have walked away from. Found
2026-08-21 while making "+ Todo" follow where you are standing: it filed a
Chips JU todo into an ITEA project. `QuickTodo.openProject()` reads
`.pi-fold.pi-open` off the page instead. Not fixed at the source, so
assume `openCard()` is stale.

**`Dossier.onOutside` folds the card away on any press outside it**, and
things parked outside the card so nothing can clip them are still its
business. `.colmenu`, `.pj-toast`, `.dp-popup` and `#qt` are exempt —
without the calendar exemption, picking a date from inside the new-todo
pane closed the card behind it.

**A control that is also a label cannot simply be deleted.** The 140px
category word on the todo card was the only way to SET a category as well
as the only place it was written, so cutting it needed a dot put back
first. How to apply: before removing a control, ask what it was the only
way to do — and grep `shell/bridge.js`, the other rooms and every `.view.js`
before deleting its `PL.` entry, because the namespace is a cross-room
surface and not the card's private list. The reverse also bites: a
handler kept "because another room uses it" can outlive the use —
`PL.openProjectFromTodo` sat unused for weeks under a comment saying the
Notes room needed it. Grep; do not trust the comment.

**A panel lent to another room hears nothing a room hangs on its
`document` for the guarded events** — keys, pointer moves and releases,
paste, `selectionchange` (`DOC_GUARDED` in `hub.js`): those are gated on
the room being the one showing, and while its drawer, dossier or reader
is lent over another room it is not. Found 2026-10-15 in the
Marketplace's drawer over the Ledger: dragging a venue's window end moved
nothing and the release landed at the next press in the Marketplace,
writing a wrong date; ⌘↩ in a lead form did nothing. How to apply:
anything a lent panel does is heard on the element (with pointer capture
for a drag) or on `document.body`, which is the pane and is not gated;
`selectionchange` comes only to the document, so the Atlas also listens
for the mouse or key release that ends a selection.

**A CSS mask takes the clicks of what it hides.** The fade at a venue
window's open end is a `mask-image` on the band, and the grip at that end,
a child of the band, could be neither seen nor pressed (2026-10-15). How
to apply: nothing pressable goes inside a masked element's faded part, or
the press finds it by position, as `vhAt` in the Marketplace does.

**`scrollWidth > clientWidth` on a pane is NOT a horizontal overflow bug.**
Three rooms park a drawer at `translateX(100%)` and `overflow-x:clip`
refuses the scroll. Judge overflow by looking, not by that number.

See also [animation](animation.md), [todo-card](todo-card.md), [tools](tools.md),
[working-here](working-here.md), [notes-room](notes-room.md) and [testing](testing.md).
