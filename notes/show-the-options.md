When Mark asks for a redesign and says "can you visually present it before
implementing", the deliverable is a comparison sheet, not a description.
It worked on 2026-09-02 for the project card: four versions — the card as
it stands plus three arrangements — each drawn at the card's real measured
width, in the room's own tokens and fonts, with what each one costs
underneath it. He picked in one reply and answered the one open question
with it.

Why: he is not a programmer and will not read a description of a layout
into a picture. He also cannot judge a mock-up drawn in some other palette
— the whole question is whether it looks right in that room.

**Show it even when he did not ask.** Later the same evening he sent a
plain list of changes to the same card — drop the person-months, move the
groups onto the project pane, lay the positions out better, cap the
partners — with no request for a mock-up. It was built straight through,
and his verdict was "no, that's not at all good. Totally lost oversight
now." A whole evening's work was reverted. A list of asks is a brief, not
a licence to restructure a layout, and the cost of one more sheet is
minutes against a revert.

Where the line falls: a change that is only what he named — a control
removed, a field moved to another pane, a cap on a list — can be built. A
change to the SHAPE of information he reads every day — a column becoming
a run, a tree becoming a line, densities and floors — goes on a sheet
first, even when it is the obvious way to satisfy his ask. When in doubt,
build the small half and draw the shape half.

How to apply, in order:

1. Photograph the real thing first, seeded ([check-the-app-first](check-the-app-first.md),
   [testing](testing.md)). Enrich the seeded journal in `localStorage` and
   reload to reach a rich case the canned seed does not build — positions
   with M&CS groups, partners, a programme project with a topic.
2. Measure the real element with `getBoundingClientRect` and draw the
   mock-ups at that exact width, on a frame the colour of what they
   actually sit on.
3. Copy the room's `:root` token block and its Google fonts into the
   mock-up rather than approximating them, and lift the component's own
   CSS rules so the copy measures the same as the original.
4. Include the current version as the first panel, named "Now", with what
   is wrong with it stated plainly. The comparison is the argument.
5. Give each option a one-line cost in the same three terms — height,
   what it gains, what it costs — so they can be read against each other.
6. Publish it as an artifact and then ask the choice with
   AskUserQuestion; put anything you genuinely cannot decide for him (which
   of two controls he presses more often) in both the page and the question.

Also worth doing while there: name the things you noticed and are NOT
touching, so the sheet is a complete reading of the component rather than
only the part he asked about.
