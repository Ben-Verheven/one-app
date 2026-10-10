One renderer, `TodoCard.html`, drawn inside a braced run in every slice
the board opens and expanded in place. The code comments carry the
mechanics; this holds the decisions. Split out of [pitfalls](pitfalls.md) on
2026-08-28.

## Where a fact about a todo lives

**Everything settable is on the card, and the edit form holds only what
genuinely needs typing.** Category and Waiting-on moved out of foot-of-form
`<select>`s on 2026-08-28 — Mark said they looked "a bit off", which was
the wrong depth and the wrong clothes, since changing one word meant
opening a form and pressing Save. Effort followed the same day.

The split is by how often the fact is checked:

- **Category and effort lead the always-visible row** (`catBtn`,
  `effortMark`), because they are read on every card, open or shut.
- **The conditional is one click in**, on the action row (`waitPick`) —
  it has no seat on the shut row, since it only grows a chip once a todo
  is actually blocked and an unblocked todo still needs somewhere to say so.
- **The edit form is left with exactly two dates.**

**If a future field grows the same "room's own menu, current value as the
label" picker, it belongs beside these, not in the form.** That is the
rule, not an exception made field by field.

## One card shape, and the category beside it

**Every slice draws through `dayGroupsHTML`** — day, single todo, overdue,
unplanned, call and project alike. Before 2026-08-28 only a day of more
than one todo was braced; everything else was a bare card at full width
carrying its category as a 140px word inside the row. Mark clicked a single
todo, got a wider box with the word in it rather than beside it, and asked
for one shape everywhere. Two things fall out of that and both matter:

- **The word came off the card entirely.** The brace to the left of the run
  writes it for every card there is, so a card that wrote it too was saying
  one thing twice on one row, 140px apart. That 140px is back in every line.
- **The category is set from a dot** (`.todo-cat` + `.todo-cat-dot`), in the
  slot the word had, immediately before the title — because it says what the
  todo IS and belongs against the sentence it qualifies, where the date is
  somebody else's fact at the other end of the row. Filled disc when set,
  empty ring when not, same as the conditional's dot; the word is on the
  hover. **Cutting the word without this would have made the category
  unsettable** — it had been the control as well as the label.

**A day of one todo is braced too, now.** The old rule said flat, because a
brace over a single card would say its category twice — true only while the
card also carried the word, and false since it stopped.

**The braces never re-sort a list.** `dayGroupsHTML(items,{weigh})` — a day
passes `weigh:true` and keeps its own arithmetic, runs ordered by hours and
cards biggest-first inside, because what a day asks of you is a quantity.
Every other slice arrives sorted by something it means (longest overdue
first, chronological down a call or a project) and is handed back
untouched: there the runs **break where the category changes** rather than
collecting every card of a kind together, so a category appearing twice
down a chronological list is braced twice and the order still reads. Do not
"tidy" that into one bucket per category — it costs the thing those lists
are sorted by.

## The action row, rebuilt 2026-08-28

Left to right it is a sentence: what the card is FOR, then what changes it,
then what ends it.

```
[+ Add update] [☑ Checklist item] │ Edit  ·  Make conditional     [☑ Done] │ ✕ Delete
```

- **The two things it is for lead**, because the left edge is the only
  prominence nothing has to be given. Mark asked for this explicitly and
  then corrected me when I put them on the RIGHT — his words: the left is
  "where action should take place in a sense". Add update is the loudest
  control on the card and Checklist item is plain-bordered beside it.
- **Three weights, not one** (`todo-btn-primary` / plain `todo-btn` /
  `todo-btn-quiet`), which is what makes six controls sortable at a glance
  where nine identical pills were not. `todo-btn-quiet` drops the border,
  ground and shadow and touches no colour — the chrome-not-ink rule in
  [pitfalls](pitfalls.md); it also lets `todo-btn-danger` keep its red straight
  through the class.
- **Edit is quiet and stays quiet.** Mark uses it as often as either of the
  two leading buttons; it is subordinate because it changes what is there
  rather than adding to it, not because it is rare.
- **Done ends the row and Delete goes past the rule beyond it.**
  `todo-actions-end` pushes Done right: finishing a card is always a reach
  right, and the irreversible way of finishing it is the longest reach.
  Done wears the checklist's own tick box at the checklist's own size, and
  fills only on hover — there is no filled resting state to draw, because a
  ticked todo leaves the board for its project's Completed row and is never
  rendered as a card again. Do not add a Reopen state here; it is
  unreachable.
- **Open project is gone** (`→ Open project`, removed 2026-08-28). The
  project's name is on the card's own row two lines above, and a verb whose
  whole result is a noun already on screen says nothing. Its handler went
  too, on 2026-09-15, once a grep proved nothing else reached it.

## The conditional

**Mark's word for this is "conditional", not "waiting on".** The old label
said "Not waiting", which had both faults a label can have at once: it
named a state nobody looks for — most todos are not waiting on anything, so
the row opened by answering an unasked question — and it named it in the
negative, which reads as a report rather than as something you may press.
Unset it says **Make conditional**; set, **Conditional on \<blocker\>**.

**Its weight follows its state.** Mark's own count is that he needs it
occasionally, so unset it is a ghost; the moment something is set it becomes
a bordered chip carrying the blocker's colour, because a todo that cannot be
started yet is the most important thing its card has to say. The chip's own
rules are in [pitfalls](pitfalls.md) and were not touched.

**Hovering either control that names the blocker lights it where it
stands** (`litBlocker` / `unlitBlocker`, 2026-08-28, asked for by Mark).
The blocker takes a gold ring, every other card and any brace with nothing
left in it fall to 0.3 opacity, and everything is back the moment the
pointer leaves.

- **It does nothing at all when the blocker is not drawn on this screen**,
  which is the common case — the blocker is usually on another day. A list
  that fades with nothing lit is a promise the page cannot keep. The chip's
  click, which opens the blocker as its own slice, is still the answer then.
- **The ring restates `border-left-color`.** That edge is the todo's
  category and may never be borrowed; a bare `border-color` here took it.
- The opacity is the one place in this room where a contrast is set that
  way rather than as a colour. The rule it bends exists so quiet text stays
  readable, and the intent here is the opposite — for one second those
  cards are ground, not text.
- An iPad has no hover and loses nothing: there the click always was the
  whole control.

## The rhythm of the open card

An open card is four stacked things — controls, checklist, the box a new
update is written in, the updates themselves — each of which arrived at its
own time with its own spacing and its own hairline. **One gap and one
hairline now: 11px and `rgba(180,155,90,0.16)`**, matched across
`.todo-actions`, `.chk-wrap`, `.substamps` and `.todo-edit-bar`. Four
almost-identical spacings read as an accident rather than a structure, which
is what Mark meant asking for "a place of rest and peace and grip" — nothing
was wrong on any one line and the whole would not settle.

- **The update box** was inheriting the form family's 82px `min-height` and
  `resize:none`, so eighty pixels of empty ground sat in the middle of the
  card. Two lines now, with a resize handle, and the Add button aligned to
  its bottom edge rather than stretching to its height.
- **The edit bar's two dates** were inheriting `width:100%` and each took a
  line, standing the bar five rows deep. 126px each; the whole bar is one
  line at 820px.

See also [pitfalls](pitfalls.md), [animation](animation.md) and [spines](spines.md).
