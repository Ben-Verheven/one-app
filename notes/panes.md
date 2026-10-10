`ledger.css` → "The pane shell" and `ledger.js` → THE FORMS carry the
mechanics. This holds the decisions and the traps.

**Four boxes, one vocabulary.** The new-todo pane, the backbone editor,
the new-project pane and the project editor all wear `pf-host / pf-scrim
/ pf-box / pf-head / pf-body / pf-foot`, with `pf-row`/`pf-fld` for
fields side by side and `pf-name` for the one field that IS the thing
being made. The family was renamed out of `qt-` (quick todo) on
2026-09-02 when the third and fourth boxes arrived — the backbone editor
had already been borrowing the todo pane's classes, which is how you get
four boxes that look alike and drift apart at the first change to any of
them. A new box over the room wears this and adds nothing of its own;
what is genuinely its own keeps its own prefix as a modifier, the way
`.pf-box bbe-box` and `.pf-row qt-row-when` do.

**A pane cannot cover the shell's own marks, so it asks them to stand
aside.** `#oa-ring` and `#oa-title` are fixed at z-index 250 in the
page's stacking context and every pane is a stacking context of its own,
so nothing inside a room is ever drawn above them however high it goes.
Mark reported the name and the glyphs sitting on top of the new-project
form, worst on an iPad where the pane's head lands right where they are.
`Hub.veil(on)` toggles `oa-veiled` on the html element and `shell.css`
fades them to .14 and makes them unpressable — a form waiting to be
answered is not the moment to change rooms, and Alt + digit refuses to
while the veil is up. In the Ledger one function, `refreshVeil()`, asks
the page (any open `.pf-host`, `#pj-dialog` or `#pj-palette`) rather than
each pane remembering to answer twice; every open and close calls it.
**The veil belongs to the page, not the room**, so it is raised only while
the Ledger is the room showing and re-asked on every room change — before
2026-09-15 a pane left open behind Alt + digit left the ring dead in the
next room. **Any new full-screen overlay in any room should call
`Hub.veil` the same way**; the Atlas, Semaphore and Notes boxes do not yet
(Mark has not decided whether they should).

**A wide pane has to fit on a laptop, and the thing that falls off the
bottom is always the last control.** On the project editor that is
Delete, and Mark reported having to scroll for it. What was done about it
on 2026-09-02, in the order the pixels came back:

- **`pf-box-wide` takes 4vh above and 90vh tall.** It is a box over a
  room, not a page; the earlier 6vh/84vh was politeness costing 80px.
- **The pane has its own spacing, scoped to `.pf-body` and nowhere
  else** — every `.fg`, `.fsec`, list editor and `check-row` inside a
  pane is three or four pixels tighter than the room's own. The room's
  forms sit on a page and can breathe; a form in a box cannot.
- **An empty list editor now draws nothing.** "No links yet." above a
  button reading "+ Add link" is a sentence explaining the button under
  it, and the new-call state carries three such lists. That was 96px.
- **A hint is worth its line only if it says something the label does
  not.** Most were cut or dropped; the paragraph over Archive and Delete
  moved onto the buttons' `title`, where a hesitating hand finds it and a
  fitting form does not carry it.
- **A break can cost less than a heading.** `pf-apart` — twenty pixels
  of gap with a hairline through the middle — separates two halves of a
  form for half what a `.fsec` band costs. Reach for it first.
- **A line you cannot act on is a line you stop reading.** The editor
  used to state the project's call, read-only. Mark had it taken out on
  the reasoning that it is not editable there: what stays on the editor
  is what can be changed. The head still carries the call's own colour.
- The result, in a 1440×800 window: the editor fits whole with four
  positions on it, and the new pane fits in every state except
  describing a brand-new call.

**`.fg` is the room's field look, and it is more specific than the small
rules inside it.** `#pane-ledger .fg input` sets width:100% and a 39px
height, which beats `.pie-input`'s 70px and turns a checkbox into a text
box. So a group holding CONTROLS rather than one field is a `.pf-block`
with a `.pf-sub` caption, never a `.fg` with a `<label>`. The caption is
also not a label for a second reason: a `<label>` around a `<label>` is
closed by the parser at the inner one, and the row it was captioning
becomes a sibling — which is how the Industrial-grant tick came to sit
above its own words.

**The two project panes share their middle.** Name, researchers, links,
positions and kind-of-project are built by ONE function for both, keyed
by three prefixes that were already the form editors' contexts (`np`/`em`
for fields, `npp`/`emp` for links, `new`/`edit` for positions and
partners) — which is why Editors and Backbone needed no change at all.
They had already drifted while they were two hand-written forms: different
orders, different labels, and only one of them offered the Call Board
topic. Anything added to a project goes in that builder, never in one pane.

**`desc` is the researchers, and no longer typed.** What Mark wrote in
the old description field was who is on the project, so it became a
Researchers line, and since 2026-09-03 a list of researchers, one row
each, in the pane's first section; `desc` is rewritten from that list and
is still what the search palette reads. The three sections are in
[project-card](project-card.md).

**The editor asks only what it can change:** the name and the three
sections, with the Call Board topic — for a programme project and nowhere
else — set apart by `pf-apart` under the name, then Archive or delete.

**The head carries the call's colour and no words.** Both project panes
had a `pf-where` caption like the todo pane's; Mark asked what the text
next to the × was doing, which is the answer — tucked against the close
button it reads as a label ON it, and it repeated what the form below
already said. Only the new-todo pane keeps its caption.

**What is not shared is the call.** Starting a project is the one moment
a call can be described; editing one never is. So the new pane asks
about the call and the editor does not mention it at all. `pf-ro` is the
new pane's read-only statement of a call being joined, and the only
place that class is still used.

**Joining a call no longer rewrites it.** The new-project form used to
show a joined call's links and key dates pre-filled and write them back
on Create — so adding a project could silently move dates that other
people's todos were anchored to, from a form that never said it might.
Those fields are simply not there when a call is being joined. If that
ever comes back, it needs to say so before Create is pressed.

**Three blocks, never two on screen at once**, under the new pane's call
picker: the Call Board topic field for the programme, the read-only
statement for a call being joined, the describe-a-call fields for a new
one. And inside that last one, the call's links, backbone and key dates
wait until a short call name has been typed that is not already in use —
a project standing on its own has no call to hang them on.

**The foot of the new pane says what Create will do** before it is
pressed: stands on its own, joins X, starts a new call X. The one thing
that form can do by surprise is join a call you meant to start, when the
short name you typed is already in use, so it is said while it is typed.

**Escape order matters.** The panes sit above everything, so they come
before `QuickTodo` in the keydown ladder, and `Dossier.onOutside` exempts
`.pf-host` — the edit pane is opened FROM a card and a press inside it is
not a press outside that card.

See also [project-card](project-card.md) and [pitfalls](pitfalls.md).
