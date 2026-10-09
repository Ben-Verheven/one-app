---
name: one-app-project-card
description: Decisions behind the project card — the head band and its three links, the project's own groups and their PIs, the position tree, the dates box, where the person-months live, the three-section edit pane, how a jump says which card it landed on, and the rewrite Mark reverted.
---

Mechanics are commented in `ledger.js` → THE PROJECT CARD and painted in
`ledger.css` → 15. This holds the decisions and the traps.

## The shape it settled into, 2026-09-03

**One head band, carrying the title and the controls.** Left: the name,
its topic, then `Tracker`, `+ Todo` and the project's links. Right: the
person-month total, `Edit`, and the dossier's chevron. Below the band, the
columns — who is on it, what is due, who it is with. **There is no foot
row**: it read well and cost every card forty points of height while the
band beside the title stood empty.

**A control is outlined; a link is a link.** Mark asked whether Tracker
and the links should be the same kind of thing, and offered the honest
version of "same" — put a departure arrow on Tracker too. I argued they
should NOT be the same and **he overruled it**: Tracker now wears the same
form as the links, arrow and all, and only the dossier's chevron is still
a boxed control. Edit is bare text. The pile before that was the mistake:
a filled button, two bordered ones and a boxed chevron beside two
underlined links, five weights inside four centimetres. Mark: **"This is
complete clutter."** Whatever else changes up there, keep it to two faces
and keep nothing louder than the project's own name.

**`+ Todo ↗` is back on the band, 2026-09-04, and it is not the button
that was removed.** The old `Add todo ↗` came off on 2026-09-02 for
wearing a departure arrow and going nowhere, and because the bar's own
`+ Todo` opened the same pane anyway. Mark asked for one on the card
again; what earns it the space this time is `PL.projectTodo(pid)` →
`QuickTodo.openFor`, which NAMES the project. `QuickTodo.here()` reads the
card that is folded OUT, so from a shut card the bar's button files to the
call with the project still to pick — the mistake that picker deliberately
refuses to guess at. It sits between Tracker and the links, in their own
face, and is dropped on an archived card, whose project is out of
`activeProjects()` and so would not be listed in the pane's own picker.

**The card is reached by its name, wherever the name is written.** The one
exception was the board: a project's name on its horizon lane
(`.hz-proj-name` / `.hz-tag`, carrying `hz-proj-open`) opened the
contribution tracker, which made it the odd one out — everywhere else a
name goes to the card and the tracker is reached from the card's own band.
Mark asked for the two to agree on 2026-09-03; it calls `PL.openProject`
now. **Keep the `hz-proj-open` class on that button whatever it does**:
`projRowClick` reads it to tell a press on the name from a press on empty
lane space, and the search palette's `wp` result anchors the tracker's
opening animation on it.

**Whether the dossier comes out with the card is the caller's business,
2026-09-04.** `Nav.openProject(id, drawer)` — the board's lane passes
`false` and lands on the card with the drawer shut, because crossing the
board to a project is a step out of one room's worth of work into another
and a drawer of rows and notes is an answer to a question nobody asked
there. The search palette still opens it, which is a fair reading of "take
me to this project". **When the drawer is being left shut it has to be
shut FIRST**: `Dossier.openCard` outlives leaving a call, so a card opened
earlier in the same call renders open again the moment `CallCard` redraws
— and the caller who asked for no drawer would get somebody else's.

## Saying which card a jump landed on, 2026-09-11

A jump anchors the whole CALL, so the card asked for comes up in a list of
its siblings wearing exactly their face, and scrolling it to the middle of
the screen was the only thing that ever said which one it was. Mark's
report: *"make the project more highlighted or present, so it becomes
clear it is THAT project jumped to, and not others of those call."*

`Nav.land(el)` does it, and **it is two marks because one of them cannot
last and the other cannot shout**:

- **`.pj-land` on the `.pi-fold`** — `pj-hit`'s ring, held for 55% of 2.2s
  and then decayed to a quiet gold edge that STAYS, rather than fading to
  nothing the way `pj-hit` does. Arriving is a moment; "this is the one you
  asked for" has to survive the moment. The resting edge is a shade under
  the card's own hover, so it reads as a mark and not as a pointer.
- **`.pj-landing` on the `.call-projects`** — for the length of the flash
  the other cards in the call drop to 0.4 opacity. This is the half a lit
  ring cannot do on its own: a card is already a bordered slab on a dark
  ground, so one more edge on one of them reads as a state rather than as
  a choice between them. Opacity is the right lever here and not a
  contradiction of the palette rule — see the corollary in
  [one-app-notes](pitfalls.md): the ban is on quieting an already-quiet colour, not
  on taking a whole slab back at once.

**The resting edge is cleared by navigation and by nothing else** —
`clearLanding()` runs at the top of `Nav.home()` and `Nav.activate()`, so
going home, anchoring another call or landing somewhere else takes it off.
A re-render of the card drops it too, which is the right moment for it to
go: it has been read by then. Both entrances to the card get it, because
both go through `openProject` — the board's lane and the search palette.
The ring wraps the `.pi-fold` rather than the `.proj-row`, so when the
palette brings the drawer out with it the ring goes round card and dossier
together, which is the honest boundary of "that project".

## The three columns under the band

**The people lead, on every card.** The order is people, dates, partners —
`.proj-col-people`, `.proj-col-dates`, `.proj-col-prt`, three siblings
inside `.proj-row-top`. Mark asked twice for the position trees aligned
left, the second time with the reason: *there is no data to be shown on
that section for those cards*. Putting the people first answers it for the
Horizon card too, which always has a key date and so could never get the
trees to the left edge by dropping an empty column. A column with nothing
in it is still not drawn at all.

**Both of the first two columns are a fixed width, 2026-09-03.**
`--pos-col-w` (two group headers and the gap — the widest the people
column ever draws) and `--pc-dates-w`. The complaint that fixed the people
column was *"it hugs the position box and moves when it moves"*: it took
the width of its content, so the dates began at one place after two
side-by-side groups, another after one, and a third after a plain run of
pills. Fixed, every card's dates begin on the same line.

## The dates box, and the one line inside it

**It has been narrowed and moved right three times for the same
complaint.** Mark's own phrases, worth keeping: *"that the text itself
becomes a nice reading sentence"* (2026-09-03) and, on 2026-09-09, *"not
this stretched out thing"*.

- The box stopped taking every point the card had spare and became
  `--pc-dates-w`, at 320px. A label had been sitting at one end of 460px
  with its date at the other.
- Then the LABEL was still stretching inside that box —
  `.mi-label-wide` was `flex:1 1 auto` up to 65%, which is what lined
  every date up in a column down the card. It is `flex:0 1 auto` now: it
  takes the width of its words and gives way only when the pair will not
  fit. `--pc-dates-w` came down to 288px with it, and the step clear of
  the people column went from 56px to 84px.
- Then, on a Horizon card only, the step became `margin-left:auto`
  (`.pc-dates-far`, set from `byDeadline` in `html()`): the box takes
  whatever the row has left, so its divider stands as far right as it
  goes and the sentence ends about where `Edit` and the chevron do. Mark:
  *"more to the right to open up space on the left"*. **This is safe on
  the programme and nowhere else** — a fixed left edge is what keeps a
  call's cards agreeing with each other down the page, and this survives
  only because every programme card is the same shape (none of them
  carries partners). Put it on a call whose cards differ and their dates
  stop lining up, which is the complaint the fixed column answered.
- And the pair needed air again once the label stopped growing: hard
  against each other at the shared 6px, `.pc-deadlines .mi-row` now takes
  **14px** — *"not so much as before, but a bit more than now"*. It reads
  as a space in a sentence rather than as a gap between two columns.

**What was traded, and what to do if it grates.** The dates no longer line
up in a column — a long todo name ellipsises and its date sits about ten
points right of a short one's. That column was a real thing and Mark asked
for the sentence instead. If it ever has to come back, the answer is a
FIXED label width, never a growing one.

On a card that has partners as well, `.proj-col-dates:has(+ .proj-col-prt)`
puts the step back to 20px, because three columns cannot spare it. At
288px those three now fit a 979px card outright, where at 320 the dates
were being squeezed. `.pc-deadlines .mi-val` is `nowrap` so a date and its
"· in 6d" never break apart; the label gives way and already ellipsises.
Under 1040px the groups stack, so the people column comes down to one
header there.

## The people column

**The groups are the project's own.** `p.piGroups` is `[{id, short}]`, and
the PI is the position in that group carrying `pi` — always tenured,
always exactly one, drawn on the group's header rather than in the tree
because the header IS its branch. Header reads `AC · Thomas C. van Dijk ·
438 PM` on the room's soft band with a gold left edge for the PI, no badge
(the word would come out of the name). The label is a fixed 30px so names
under each other start level. `adoptTrackerGroups` gave every existing
project a copy of its M&CS columns with the SAME ids, so no position had
to be re-filed.

**The PI's name is in the room's own face, not the body serif.** It spent
one build at 12.5px `var(--body)` in full white and Mark did not like it:
it is now Cinzel `--gold2` at 600, with the group label stepped back to
`--gold` so the name leads. It is the largest thing on the band, 11px
since Mark asked for it a shade smaller on 2026-09-03. **The header does
not narrow with it** — its width is `--pos-hd-w`, not the name's, which is
what he was asking to be sure of.

**The drawn tree stays.** Trunk fading out of the header's glow, an elbow
per branch. It was taken out once as "clutter" and Mark's answer was
immediate: **"Where did my trees go? I like the way the visuals were for
the positions."** Do not take them out again.

**Nothing on the card reads the contribution tracker.** Its PM columns and
its table are untouched. **Two person-month sums now exist and answer
different questions** — the tracker's is per work package × group, the
card's is per position. Mark was told; it is by design. If they are ever
to agree, one has to become the truth and the other read it, and that is
its own piece of work.

**Where the PM lives, after asking twice.** Per position in the pane; per
group on the group's own header; the project total on the head band with
the by-group split on its hover, and again on the pane's Positions
heading. The band does NOT repeat the group numbers.

**Groups stack; two stand side by side only when their names fit.**
`SIDE_BY_SIDE_CHARS = 14`: half of the 380px people column is 190, a
header spends about 80 of that on label, gaps and PM, and 110px of the
body face is fourteen characters. At eighteen "Thomas C. van Dijk" came
out as "Thomas C. van D…". Three or more groups always stack.

**Partners: the coordinator and three, then a plain `+N`.** Never an
arbitrary three — the sort puts the Dutch lead first, then alphabetically.
`+N` is a focusable span, not a button: `:hover` AND `:focus` open the
rest in a panel, so a tap answers on an iPad. The panel is absolutely
positioned so the card does not grow, and `.pi-fold:has(.prt-more:hover)`
lifts the showing card out of the paint order or the panel goes under the
card below it. **No rule between the coordinator and the list** — its own
gold does the work, on a column that already has a rule down its side.
The column is drawn only on a project flagged `industrial` that has a
coordinator or partners; a test that forgets the flag sees no column at
all and it is not a bug.

**FTE is gone** — field, pill suffix, all of it. A non-PI tenured pill is
the name alone. **The Researchers line is off the card front**; `p.desc`
is still written, but from the pane's researcher list (`Editors.resNames`),
and it feeds the name suggestions.

## The pane, overhauled 2026-09-03

Mark's brief: *"let me add researchers under the title, one by one with +.
Let me select if this researcher is a PI, if so let me enter a group name.
Then below, display these groups+PI and let me add positions under each
with PMs. No need then to choose the group again."* A mock-up sheet went
to him first and came back **"That's good"** with five changes, all built.

**Three sections, each announcing itself.** `THE PROJECT` (name,
researchers, project links) · `POSITIONS AND PERSON-MONTHS` · `THE GRANT`.
Section one had no heading and read as loose material above the form —
Mark asked for the grand distinctions to be more distinct, and the heading
`nameHTML` now emits is the missing third of them. `.fsec` carries far
more air above than below, so its rule belongs to what follows.

**One researcher, one row**: name, a PI tick, where they sit, remove.
Ticking PI turns the row's right-hand slot into a group-label field; not
ticking it turns it into a picker, or into a plain "in AC" when there is
only one group. `.res-where` is a fixed 148px so the removes line up and
the rows do not shuffle sideways as ticks go on and off.

**The links sit under the researchers, inside section one**, under a
hairline rather than a heading of their own — they are the other half of
"what this project keeps elsewhere".

**One block per group below**, its head mirroring the card's own band —
label, PI, running total. Under it: the PI's row, then the tenured staff
filed in that group, then the posts still to hire, then
`+ PhD / + EngD / + Postdoc`. **A post is added from inside its block, so
the group is answered by where you pressed** — there is no picker to read
and none to get wrong. A researcher who is not a PI appears here as a
tenured row in their group, name stated not offered. Anything pointing at
no group is drawn in a "Not in a group" block at the end.

**No steppers on the number fields.** Two more things to look at on every
row, they shift the text off centre, and nobody nudges a person-month one
at a time.

Redraw discipline: typing a person-month redraws only the totals
(`drawTotals`, rewriting the `[data-pm-group]` spans and the heading's
grand total in place), never the rows, or the field loses its caret.
`drawTeam` = `drawRes` + `drawBlocks` + `drawTotals`; leaving `drawTotals`
off it left the grand total blank until the first keystroke on a pane that
had opened with the figures already in it.

## Traps

- **A ticked PI does not always have a group behind them, and the label
  box has to make one.** `posInit` ticks the first tenured person in any
  group with no flag yet, so the pane opens agreeing with the card — and
  on a project whose `piGroups` is empty that leader's `groupId` names
  nothing. `resGroup` looked the group up and silently did nothing when it
  found none, so ticking PI, typing a group and saving lost the group
  every time; Mark reported it on 2026-09-03 as "the save doesn't hold".
  `resGroup` now creates the group at the first keystroke and takes
  everything sharing the leader's old id along with it. Anything that
  writes into `piGroups` by looking a group up must handle the miss the
  same way — and note `piCollect` drops a group whose label is blank, so
  an unlabelled group is deliberately not written and the miss recurs by
  design.
- **A position's kind is `type`, not `kind`**, and a test that writes the
  wrong field gets a tree of pills all reading "Tenured".
- **An archived card must keep Tracker and Edit on the band.** Restore
  lives inside the edit form, so a card without them is a card there is no
  way back out of the archive from. The grip goes, and so does `+ Todo`.
- **The PI's pill is not in the tree**, so the name on the header carries
  `pos-pill-drag` and the position's id — without it a PI would be the one
  position that could not be dragged to another group. `movePosition`
  clears the destination group's other PIs.
- **`bindPositionDrag` binds by container class** — `.pos-groups[data-pos-proj]`.
  Renaming that wrapper kills position dragging silently; it happened on
  2026-09-03 and only a test asserting the totals changed caught it.
- **The PI name is written as plain text, never as a link.** The bridge
  linkifies any researcher's name written anywhere, so it becomes an Atlas
  link by itself; an anchor would give the bridge a link inside a link.
- **Deleting a CSS or JS block by its neighbours' names.** Cutting from one
  section comment to another removed `partnersHTML` and, separately, the
  `.pc-topic` and `.project-turn-title` rules — the second showed up only
  as a grey browser-default button. Check what sits between the anchors.
- **Renaming a card class leaves the print sheet behind.** `.proj-row-title`
  sat on in the `@media print` block long after the head band replaced it
  with `.pc-name`; `tools/names.py` is what finds these.

## The grip, 2026-09-02 — unchanged since

The card's whole leading edge: 7px, call-coloured through `--grip`, 11px
with a pale bar under the pointer, 12px with the bar at rest where there
is no hover. It keeps the old rail's class names (`.proj-row-handle`,
`.proj-row-handle-fixed`) so `bindDrag`'s delegated pointerdown and the
programme's fixed case needed no edit. The rail it replaced — three
unlabelled marks in a 32px column — should not come back, nor should the
project name as a secret button into the tracker.
`.project-turn-title` survives only on the tracker's own head.

## The compacting rewrite, reverted 2026-09-02

Everything asked for was built — PM off the card, groups on the pane,
positions and partners reflowed as wrapping runs, columns sized to
content, the floor down to 56px. Verdict: **"no, that's not at all good.
Totally lost oversight now."** Reverted whole.

**The reading that has held up:** the compacting was not the objection. A
tree with one person per line, and one name per line under a coordinator,
are scannable in a way that wrapping runs are not — a run has to be READ,
a column can be counted at a glance. Every change accepted since took
height out by removing LINES while leaving the vertical structure
standing: the PI's pill off the tree, the Researchers line off the card,
the foot row folded into the band, the dates column dropped when empty.
**Take height out by removing lines, never by reflowing a column into a
run — and never by taking the tree's own drawing away.**

## Things settled earlier and still true

**The programme tab is ordered by deadline and nowhere else is.** First
still ahead at the top, then the ones already passed, most recent first,
then anything with no topic. The grip on a programme card is a mark not a
handle, `reorderWithinCall` refuses the programme outright, and the sort
is done in `CallCard` and **not** in `callGroups` — deliberately, because
`callGroups` also feeds the board's lane order.

**One key date on a card, and openings are not on it.** The opening asks
nothing of anybody and by the time work is in the ledger the call has
opened. Of a stage 1 and a stage 2, only the nearer is being worked
towards. **Every date is coloured by how near it is** — amber inside six
weeks, red inside a fortnight, red and bolder once passed — using the call
card's own `.cp-next` bands. The neutral end is `#bca070`, not `--text3`:
see the contrast note in [one-app-notes](pitfalls.md). The BOARD draws openings, and
that is not an inconsistency — see the programme-dates note in
[one-app-backbones](spines.md).

**The card names a topic by its FULL id.** The short form drops the
programme and the cluster, which reads as half an answer on a card. It
stays only in the topic picker, which is a search box and accepts either.

**The Call Board's reader keeps the name first.** Rebuilt on 2026-08-28 to
lead with the id and Mark had it put back. That panel is shared: the
Ledger borrows it, so a change to it is a change to the Board too.

See also [one-app-todo-card](todo-card.md), [one-app-animation](animation.md), [one-app-backbones](spines.md)
and [one-app-notes](pitfalls.md).
