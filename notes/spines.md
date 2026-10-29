The walls and the tie shipped 2026-08-27; the backbone itself was rebuilt
2026-08-28 into the shape described below. The code comments carry the
mechanics; this holds the decisions and the direction, which they cannot.

## The walls

Every hard key date on a call with an active project draws as a vertical
line **inside that call's own block of rows**, with a flag at the top of
the block carrying the date's name and the open work still standing in the
call. A key date that is a *window* (an endDate) draws as a band.

**The first version put them above the table, full height, in a row of
their own — and Mark rejected it.** He was right twice over. A key date
belongs to one call, and drawn full height it crossed three others it has
nothing to do with. And with every call's dates sharing one row, two dates
a few days apart from two different calls fought for the same pixels —
which is the overlapping he reported. Inside the call's own block neither
can happen: the only flags that can crowd are two of the same call's, and
those are days or weeks apart by their nature.

- The layer is inset by `--hz-gutter` inside `.hz-call-body`, which works
  because every row's name column is one fixed width. `fitRails` adjusts
  the horizontal *rail* per row, not the track, so one layer serves them
  all. Compact surrenders the gutter and the inset goes with it.
- **A call with a wall in the window gets a reserved 19px strip** at the
  top of its block so a flag never sits over a dot. A call with none keeps
  the rhythm it always had.
- Under ~6% of the window a flag drops its text and keeps its diamond; the
  name stays on the title.
- Flag `max-width` is the room to the next FLAGGED wall of the same set, as
  a per-cent. It only turns round past 82% of the window — a *position*,
  not a comparison of the gaps. Comparing gaps was the first bug: a gap in
  per-cent is a different number of pixels at three weeks and at six.
- **A wall takes the CALL's colour, never the marker's.** `m.color` in
  this app is a semantic key — `'deadline'`, `'custom'` — which the
  timeline maps to a look of its own, and `'deadline'` passes `safeColor`
  as a bare CSS word, so a wall that trusted it drew transparent and
  looked like a broken layer.
- Walls go neutral under the category cut, per the palette rule in
  [pitfalls](pitfalls.md).
- The board only draws two to six weeks, so the beam's next-deadline block
  carries the same open-hours figure.

## The programme's dates, one row down (2026-09-09)

The same argument, one level in. The programme keeps no calendar — each of
its projects is written for a different topic closing on a different day —
so a wall drawn for `__horizon__` out of `wallsInWindow` would read as the
whole block's date and cross proposals it says nothing about. **A
programme project's own hard markers are therefore drawn inside its own
`.hz-proj` row**, in the wall's own vocabulary and through the same
renderer (`wallsLayerHTML`, which both collectors feed).

- **And the row appears without a todo.** Mark asked for it: `collectRaw`
  is built from open todos, so a proposal with a date and nothing planned
  yet had no lane, and its deadline went with the lane. `withProgrammeDates`
  adds those rows in `renderHorizon`, where the window is known, onto a
  **copy** of the cached lanes — `collect()` is what the beam and the
  effort strip count, and a row with no todos in it must not enter those
  sums. It re-sorts by `sortLikeBoard` so a row that arrived by its date is
  not stacked after the ones that arrived by their work, and a programme
  lane that did not exist a moment ago is inserted before General, never
  after it.
- **One flag to a pole.** Horizon projects share deadlines constantly —
  every topic in a destination tends to close on the same day — and four
  stacked rows each drew their own line and their own identical flag,
  reading as one pole wearing the same three words four times. Mark asked
  for one. `programmeWalls` collects the whole programme's walls in drawn
  order and clears `flag` on any repeat of the **same day AND the same
  name**; `wallsLayerHTML` then draws every line but only the flagged tags,
  and spaces those tags against each other rather than against the lines.
  The name is half the key deliberately: two dates on one day saying
  different things are not a repetition, and silencing the second would
  leave a row labelled with somebody else's date. The line always stays —
  it is what says the date crosses this project too.
- **No reserved strip, and this was asked for explicitly.** It shipped
  once with the call block's own 19px, standing a flagged row at 63px, and
  shown the picture Mark's answer was **"same as the others"**. So the row
  is 44px like every other lane and the flag sits at its top edge. The
  reasoning holds: a call's flag stands over a whole block and could meet
  any of four rows' dots, where a row's flag can only ever meet its own
  project's, and only where the key date and a planned day share a column
  — a pixel or two of overlap at worst. **Every lane on this board is one
  height. Do not buy an exception to that again without asking.**
- **Openings are drawn here, unlike on the project card.** The card asks
  what is being worked towards; the board is the window you plan in, and a
  topic opening inside it is a fact about that window — which is also why
  a call's own "Call opens" has always been a wall.
- `.hz-wall-tag` had to join `projRowClick`'s ignore list: the row is a
  button and the flag sits inside it.

## The turn-over button, and compact (fixed 2026-09-09)

The one control that turns the board over to the timeline lives in the
corner above the name gutter. **Compact — six weeks, and anything past
about four — surrenders that gutter**, so its box is 6px wide and the 33px
button hangs out of it over the month band. It always looked right, because
that corner of the band is empty ground and the month label is centred
further along. It did not WORK: `.hz-head-track` is the next sibling and
paints over the overflow, so the press landed on `.hz-months-labels` and
the sheet never turned. Mark reported it as "the flip switch does not work
at 6 weeks". The fix is one line — `.hz-compact .hz-head-gutter` takes
`position:relative;z-index:7` — and only compact needs it.
**Worth generalising: anything that overflows the head gutter is under the
track unless it is lifted.**

## The tie

A todo stores `anchorId` (one of its call's marker ids) and `anchorDays`.
**The distance is the fact worth keeping; the day it lands on is only ever
the answer to it.** EU dates move late and often, and a todo that only knew
its day was true the afternoon it was written and quietly wrong from the
next amendment on.

- **The marker's id, not its name.** The todo lives in the same call as the
  marker, and marker ids are deliberately preserved across saves (see the
  comment in `CallCard.saveEdit`), so a rename cannot cut the string.
- **Moving a todo by hand re-measures the tie, never cuts it** — you have
  said "two weeks before, not three", and that is what should follow next
  time. `retieTodo` is called from every hand move: `updateDue`, the board
  drag, and the edit bar's date (missing there until 2026-09-15, so a todo
  re-dated in the edit bar jumped back at the next key-date move). Anything
  new that sets `dueDate` by hand must call it too. Cutting instead would
  make every hand-placed day the last thing that day ever did.
- **It follows without asking.** `syncAnchored(callId, before)` runs after
  any write to a call's markers and returns what it moved; `offerUndoMoves`
  puts that on a toast with Undo. This is the app's own rule — an act you
  can take back is done and offered back, not put to a question — and it is
  written down in `Dialog`'s own comment. A date the Call Board changes is
  the one exception: Mark asked that it be offered first (see
  [call-board](call-board.md)), and once taken it follows the same way.
  A programme project's own key dates follow through
  `syncProjectAnchored`.
- The hooks that must stay hooked are where a call's existing markers are
  rewritten: `CallCard.saveEdit`, the project editor's Call Board box, and
  the answers to what the Call Board changed. The new-project form used to be a
  second one; it no longer writes a joined call's markers at all (see
  [panes](panes.md)). Anything that ever writes `c.markers` again needs
  the hook.

**The tie has no control of its own any more, and is not to get one back
without asking (2026-08-28).** Mark asked for "tied to" to be removed
entirely; told what the following actually buys him, he chose to keep the
following and drop the button. So a tie is now WRITTEN in exactly two
places — a backbone laying out a new call, and `retieTodo` re-measuring one
when he moves the todo by hand — and READ in one, `syncAnchored`. It is
re-pointed, never started, when a Call Board date takes the place of a
call's own and when a project follows its topic to another call. Nothing
draws it and nothing says it out loud. `anchorPhrase`, which read a tie
aloud, and `hardMarkersFor`, which filled the picker, went with the small
diamond button (`tieBtn`, next to the date) and its menu, because both
existed only to serve it. The consequence worth stating: **a tie can no
longer be started by hand at all**, so ties in his journal come from
backbones and from nowhere else. If a tie surface turns up on a card again,
that is a regression unless he has asked for it — he has taken it off once.

## The backbone

A saved shape of call — its key dates and the work hanging off them.
Journal-level (`backbones`), joined at schema 3 with no bump.

**Two designs came before this one, and both were scrapped by Mark for
the same reason: whichever half of the thing was tied to a real call could
only exist after that call did.** The first was a project-level "spine"
applied to a call's existing markers, guessing which date each item meant.
The second dropped the guess by making a backbone something you could only
*save FROM a call that already ran* — no editor, on the reasoning that the
call sitting in front of you is a better editor than any form. That reasoning
held for a day. On 2026-08-28 Mark asked for the form anyway: the shape of
a round is known before the first call of it exists — "Opening, PO
deadline, FPP deadline, Submission" is memory, not something that needs a
finished call to transcribe from — and running a whole call just to have
something to save a backbone from was backwards.

**So a backbone is authored directly now**, from `PL.backboneOpen()` —
reached off the header's overflow menu (the three-dot `#hd-more-btn`, not
any one call's card) — never from a call. `Backbone`'s editor state holds
its own `events` and `todos` arrays; key events are named and given an
offset in weeks or months from whichever one is marked the **anchor** —
the date you're actually handed once the real call is announced — and
todos the same way off whichever event they belong to. `PL.backboneEdit(id)`
reloads a saved one into the same form for changing; deleting offers Undo
like everything else destructive in this room.

- **Offsets are still stored in days** (`markers[].days`, `todos[].days`)
  because that is what `markersAt`/`todosFor` have always taken and
  nothing downstream changed. The typed amount/unit/direction ride along
  as extra fields purely so re-opening the editor shows back what was
  actually typed rather than a number reverse-engineered from it — nothing
  outside the editor reads them. A backbone saved before this rebuild has
  none of those fields; `unitsFor()` reconstructs a plausible amount/unit
  from the day count alone the first time it is opened in the new editor.
- **Chosen while the call is being created**, in the new-project form —
  this half did not change: a picker plus one date, filling the form's
  existing key-date editor with real, editable rows. Nothing here was
  touched by the rebuild.
- **The todos are still built from the marker rows the form is ACTUALLY
  carrying at Create**, not from what the backbone proposed. Mark sets the
  key dates himself; the proposal is only a starting point. Made twice
  already across two designs — do not undo it a third time.
- Each created todo comes out **tied**, by the new call's own marker id,
  exactly as before — and this is now the only way a tie is ever written
  from scratch, so this line is load-bearing.
- **The call-card footer lost its two buttons** ("Save as backbone" /
  "Backbones…", `cc-bb-btn`) in the same change — there was no longer
  anything for them to do, since a backbone no longer comes from a call.
  If a "backbone" surface ever turns up on a card again, that is a
  regression, not a feature: the whole point of this rebuild was to get
  it off cards and into one place.

## Still unbuilt

**A real rules engine** — "todos that come in under certain conditions".
Worth knowing before designing one: the app opens from a `file://`
bookmark and nothing runs while it is closed, so anything "automatic" must
be computed **on open** and offered, never fired on a schedule.

## A process note, paid for twice

Two edits in this stretch were lost because a Python edit script asserted
and died **after** mutating its in-memory copy but **before** writing —
so an earlier, successful-looking replacement in the same script silently
never landed. The `anchorId`/`anchorDays` fields on `newTodo` went missing
that way and were only found because a test showed dates landing right
with no tie on them.
How to apply: when one assertion in a multi-edit script fails, re-check
**every** edit in that script, not only the one that threw. Better still,
assert the result with a grep afterwards rather than trusting the run.

See also [pitfalls](pitfalls.md), [todo-card](todo-card.md), [project-card](project-card.md),
[working-here](working-here.md) and [testing](testing.md).
