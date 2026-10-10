Test a feature from empty and from three items, not only from a full
dataset. The Notes room was verified on 220 seeded notes and looked
finished; from three notes it showed nothing at all, because a rule about
tags-on-nearly-everything is nonsense when there are only three of
everything. Mark found it in his first two minutes of real use.

Why: seeded data is chosen to exercise a design, so it hides every bug
that only exists below the size the seed was written at — and the empty
and near-empty states are what anyone starting for real sees first.

How to apply: add one-to-five-item cases alongside the full one.
`seed.js` is a module as well as a script — `require('tools/seed.js')`
gives `all(page)`, so a throwaway Playwright script in `/tmp` can seed a
browser and then photograph any state the canned shots do not cover: a
form open, a menu down, a picker up, a marker mid-drag. Two tricks worth
keeping: `deviceScaleFactor:3` with a `clip` box computed from
`getBoundingClientRect` gives a readable close-up of a 9px mark, and a
`page.evaluate` that measures geometry proves a layout claim far better
than looking does.

Five Playwright traps in this repo, each of which cost real time:
asserting the instant `page.reload()` resolves races the room's first
paint, so wait for something the room writes; `locator.textContent()` on a
legitimately absent element blocks the full 30-second timeout before any
`.catch` fires, so call `count()` first; a fresh browser context per
case costs ~30s each, so reuse one page and rewrite localStorage between
cases; a row-editor that redraws its own container's innerHTML on
every field's `change` (the pattern behind key dates, links, positions,
and the backbone editor) throws `NotFoundError: node to be removed is
no longer a child` if the test drives that change with a synthetic
`el.dispatchEvent(new Event('change'))` instead of a real interaction —
found while testing the backbone editor (2026-08-28), it never fired on a
real `.click()` + `.type()` + `Tab`, only on the synthetic dispatch, so it
reads as an app bug and is actually a test-technique one, drive these rows
with real clicks and keystrokes, not synthetic events; and `Board.openDetail`
(reached by clicking a board mark) opens its card **already expanded** —
a follow-up `.todo-later-row.click()` written on the old assumption that
the row still needs opening lands wherever the bounding-box centre happens
to fall instead, which on a todo card is one of the header's own buttons
(`catBtn`, a blocker chip, the tie diamond…) and fires THAT control —
found 2026-08-28 chasing a rendering bug that turned out to be the test
re-clicking `openBlocker` and navigating the detail panel to a different
todo entirely mid-script. When a card is reached through a detail-opening
path, check its class list for `open` before clicking the row at all, and
prefer reading or acting on specific buttons by selector over a click
aimed at the row's centre.

See also [check-the-app-first](check-the-app-first.md).
