Split out of [pitfalls](pitfalls.md) on 2026-08-28, because it had grown past
being one bullet in it. Two things fly in the Ledger: **the day's cards**, when a project is gathered out of a day, and
**the hover label's dots**, which fly out of the board marks they stand
for. Both are first-last-invert-play, both are skipped whole under
`prefers-reduced-motion`, and every line below cost a round trip with
Mark, who reports all of it the same way — "flickering", "not smooth",
"dragged". The section after them is about the drawers and panels that slide,
which are a different mechanism with one trap of their own, and the last
about a lead card opening, in both rooms.

**A rAF callback lands BEFORE the frame's own style pass, so a FLIP that
writes the inverted transform and clears it one frame later animates
nothing at all.** The browser never computed the start state, so it
compares the resting position with itself and the element simply appears
where it belongs. Both movements shipped like this and both were what
Mark meant by "does not work fine and smooth" — not a slow animation, no
animation. **How to apply: force one style pass between the write and the
clear** — `void el.offsetWidth` on the container, once for the whole
flight, never once per element, or the two-pass rule below is undone at
the same stroke. This is the first thing to check whenever a transition
here does nothing.

**`#pane-ledger` is `scroll-behavior:smooth`, so a hand-written scroll
tween does not work until it is held at `auto`.** Under smooth, every
`room.scrollTop=` is a REQUEST, not a position: the browser starts its own
easing towards it and reports where that easing currently is. Writing a
new one every frame restarted the browser's animation every frame, so the
view sat almost still for the whole flight and then slid the entire
distance once the writes stopped — which is exactly what Mark reported as
the screen movement being "dragged". **How to apply: save
`room.style.scrollBehavior`, set `auto` for the tween, restore it on the
last frame.** Restore rather than clear — smooth is the room's own choice
for every other scroll in it. The same trap is waiting for anything else
that ever drives this pane's scroll by hand.

**Taking off a class that carries `animation:none` starts the animation it
was suppressing.** Found twice. First on the hover label, whose pop-in
stood down for the flight and then played half a second late when the
class came off. Then, the same day, on the cards: `#hz-detail`'s list
gives every card a five-pixel entrance, `todo-moving` and `todo-arrive`
were suppressing it, and removing them at the end of the flight made the
whole settled list fade and slide again. **How to apply: leave the
suppression on.** Where the class carries things that must not persist —
a long transition, `pointer-events:none`, `will-change`, a raised
`z-index` — split it: add an inert `todo-settled` that carries only
`animation:none`, add it FIRST, then drop the flight class in the same
statement so no style pass ever sees the animation live. The same class
has to come OFF anything being faded out, or it swallows the fade.

**Every part of one change has to move, or the ones that do not are all
you see.** The gather has three populations and each needed its own
answer: the project's cards **fly** (FLIP), the cards arriving on the way
back **fade in** (`todo-arrive` — new nodes with nowhere to travel from),
and the rest of the day **fades out** (`hz-leaving`, the exact mirror:
same 560ms, same curve, the same six pixels the other way). Mark asked for
that last one by name — "make that fade-in also a fade-out" — and he was
right that it is one event seen from two sides.
The half that is easy to miss: **a braced run whose every card is leaving
must leave as a run.** Ghosting only the cards left the flank and its
label blinking out in the frame the press landed while the cards they
belonged to were still fading, so the day came apart in two pieces. Ghost
the whole `.hz-day-grp` when nothing in it survives, individual cards when
the run lives on. Groups precede their own cards in document order, which
is what lets one walk decide both.

**Fade the real node, not a copy.** Replacing the pane's `innerHTML`
detaches the old nodes, but references taken a moment earlier stay live —
so they can be appended straight back over the new list, parked
absolutely at the corner they were measured at, and faded there. Measure
them BEFORE the render (stash the rect on the node; a run has no id to
key a map by), append them AFTER `playMove` has taken its list of cards,
or a ghost is measured and flown to a place it is not going. `position` is
written inline, because a card carries `position:relative` from its own
rule and a run carries nothing. Nothing has to remove them on time: the
next render replaces the pane's children and takes them with it.

**Never `visibility:hidden` on something you can grab.** The board marks
were hidden that way while their dots flew, and for the third of a second
the flight lasted they could not be dragged to another day — hidden
elements take no hit test. `opacity:0` looks identical and still takes the
press. (Not a breach of the room's "contrast is colour, never opacity"
rule: that is about making a thing quieter to READ. Taking something off
the screen for 300ms is not that.)

**Read everything, then write everything.** Measuring one card and
immediately transforming it, card by card, makes the browser settle the
layout again between every pair — sixteen times inside the one frame that
has to be smooth. Two passes, one layout.

**A FLIP inside a scrolling pane must be measured against the PANE.**
Gathering takes six hundred pixels out of the day, and a room scrolled
near the bottom has its scroll clamped to the shorter page in the same
frame, which moves every card in the window. Window coordinates then
invert by a distance that includes a scroll jump the animation knows
nothing about. Subtract the pane's own rect and the numbers are
scroll-proof. Then hold the pane at its old height with `min-height` for
the whole flight and tween the scroll to where it will legally be able to
sit, on the same curve — the view and the cards move as one thing — and
release the pin at the end, when the slack it gives back is below the
fold.

**A cell-anchored label must do nothing at all on a repeat mousemove.**
Placing it means parking it at 0,0 to find where `fixed` starts from, so
falling through on every pointer event made a label you were reading
flinch once per event and re-measured any flight still in the air.

**A movement of many things needs one thing to follow, and nothing may
change shape while it moves.** Sixteen cards leaving in the same frame is
a block of text jumping to a new position — Mark's words were that he had
to "re-perspective" and work the new list out from scratch. So the card
the press came from leads: read off the event (the project name is a
button inside the card), first to go, riding over the others on a
`z-index`, with the rest a beat behind it, capped at five. Past that a
stagger stops saying "these are following" and starts saying "this list
is slow".
The other half of the same lesson, and it cost its own round trip: **a
card that changes shape in the frame it sets off in is not the card you
were watching.** Gathering used to drop the 170px project-name column and,
when it narrowed to a single todo, drop the braces too — so the thing that
landed looked nothing like the thing that left. Both are gone; the gather
narrows the list and never the way a card is drawn. Anything that wants
to tidy a card up in the same breath as moving it is the same mistake
again.

**Nothing is said on the way out — of the hover label.** The dots used to
fly home when the pointer left the cell, with the panel dissolving around
them. Mark had it taken out whole: it read as a second event rather than a
dismissal, it made a label you had finished with something to wait out,
and every fresh label had to overtake a farewell still in the air. Do not
put one back. (The cards' fade-out is not the same thing and he asked for
it: a label is dismissed, a day is replaced.)

**Timing, and where the numbers live.** The cards travel **560ms**
(`MOVE_MS`, and `0.56s` written again in `.todo-moving`, `.todo-arrive`
and `.hz-leaving` — one number in two files, change either and change
all), with a **42ms** stagger capped at five cards. 340 was the first try
and Mark asked for slower: it was enough to see that something had
happened and not enough to watch it happen. The scroll tween runs the 560
alone with no stagger, because what it has to keep step with is the lead
card, which has no delay either.
Curves: an ease-out that spends two thirds of itself in the first fifth of
the distance is a jump with a settle on the end, which is what both of
these read as at first. Cards and the scroll share
`cubic-bezier(0.65,0,0.35,1)` — easeInOutCubic, so the JS tween and the
CSS transition are the same curve. The dots cross barely a hundred pixels
and stay quick on purpose: 280ms, with a 28ms stagger doing the talking.

## The panels that slide

**A transition cannot start until the layout it shares a tick with is
finished, and the frames it loses are what gets reported as a stutter.**
Found 2026-08-28, on the Call Board's reader: Mark pressed a topic on a
project card and the drawer hitched on its way in. Nothing was wrong with
the 200ms slide. `openReader` wrote a whole topic's prose into a scroller,
`lendReader` had just switched the Board's own body off with
`display:none` on a very large tree, and the `open` class landed in the
same tick as both — so the browser had to finish two expensive layouts
before it could paint frame one. The panel sat still, then jumped.
How to apply: when the class that starts a transition follows a large DOM
write, hand that class to a **double `requestAnimationFrame`** — the same
thing `Dossier.open` already does for the card fold, for the same reason.
Two frames of nothing is invisible; a slide missing its first four frames
is not. Guard the deferred call against having been closed inside those
two frames, or an Escape pressed at once re-opens the thing. And
`focus()` on a control inside a panel still parked off the right edge
wants `preventScroll:true`, because of the pane transform in
[pitfalls](pitfalls.md): a fixed panel inside a transformed pane can be scrolled
to rather than left where it is.

**How to check any of this without an afternoon.** Two passes, and both
are needed — one tells you the numbers, the other tells you what it looks
like. Drive a throwaway browser (see [testing](testing.md)) and seed it,
then: (1) sample the moving element's computed `transform` and the room's
`scrollTop` in the same row, every frame through the flight, printing
every fourth — a working flight is a decaying matrix with the scroll
decaying beside it on the same curve; a broken one is `none` from the
first sample, or a scroll that holds still and then jumps. Sample past
the landing, which is the only way the entrance-restart above shows up.
And (2) **screenshot mid-flight** at four or five points and look at them.
Every mistake in this file that the numbers could not have found — the
braces blinking out, the card changing shape as it left — was found by
looking at a frame two hundred milliseconds in.

**A full board redraw is not an arrival** (2026-10-06). `Board.render`
rebuilds `#horizon-container` from nothing, which collapsed the page for an
instant and clamped the room's scroll to the top on every press; and every
lane, mark and list card replayed its entrance each time. `renderHorizon`
now pins the old height, restores the scroll at `auto`, and stands the
entrances down (`hz-drawn`, `hz-same`) after the first draw / for the same
slice. Anything new that redraws the board must go through it, not around it.

**A lead card opens in place, growing with the scroll** (2026-10-16). Mark
saw opening a lead as "blinking" in both rooms, for two different reasons.
The Semaphore redrew the whole board to open one card, so every card was
new and the one under the pointer lost its hover for a frame and faded it
back in; the Ledger showed the card's new half at a stroke and then slid
the room after it. Both now write the card's height and the scroller's
`scrollTop` together, frame by frame, on easeInOutCubic over 320ms
(`UNFOLD_MS`, once in each room), scrolling only as far as shows the whole
card. Anything that opens a card in either room should go the same way
rather than through a redraw. In the Ledger, `byId` searches inside the
room and so cannot find `#pane-ledger` itself; reach it from the card with
`closest`.

**A lead that moves slides, and the view goes with it** (2026-10-21). In
the Brokerage Semaphore a lead's ruit, day, score, update or Complete
redraws the list in its new order, and a lead used to vanish from under the
pointer and appear somewhere else, often below the fold, with everything
between jumping a card's height; Mark "lost track". `leadMove` measures
every lead and heading against its scroller, draws, puts each back where it
was with a transform, and lets them all slide home on the 560ms curve while
the scroll follows the lead that moved, only as far as keeps it in view; it
rides above the others and glows where it lands, and a lead new to the list
fades in. Changes that only alter what is inside one card — a composer
opened or put away, a line taken out — go through `leadRedo`, which redraws
that card alone with the opening's height tween, so nothing else is touched.
A new control on a lead goes through one of the two, never a bare redraw.

**The top of the view is under the room's bar, not at the scroller's
edge** (2026-10-22). The Brokerage Semaphore's bar is sticky inside
`#semscroll` and covers its first 60px. Both movements took the
scroller's top edge for the top of what can be seen, so a lead from the
bottom of Leads sent up to Talking was scrolled to 24px from it — under
the bar, landing and glow unseen — which Mark reported as the animation
not working for the leads at the bottom. `scCover` gives the bar's height
to both. The glow also waited for a journey, so a change that left a lead
where it stood showed nothing; it now plays on every lead `leadMove` is
given.

See also [pitfalls](pitfalls.md), [project-card](project-card.md) and
[testing](testing.md).
