# Pocket — how to change it

`pocket/index.html` is the phone companion of One App's **Semaphore room only** — made to open in an
idle minute instead of the news. Since 2026-10-07 it is dressed and laid out like the desk's
Semaphore (the Cards view of 2026-10-06). Four tabs:

- **Rotation** — the desk's rotation since 2026-10-11 (`typeRows`): a row for every arena type, in
  the desk's order of types, each headed by a band in the type's colour, and every card's head filled with it too; in each row the cards, all one size, in
  standing order, swiped sideways, with a card stamped today towards the far end and, past those, a
  card asleep until a date of its own, whose foot says so in short ("Waiting for … · 1 Jan"). A card
  whose date has come within reach stands in a row of its own over all the types, *Back from waiting*
  (`wokeRow`), which opens the walk; stamping it ends the wait and sends it back to its row. Walked one card at a
  time with *Look around* → Next / Stamp & next, which takes the types in turn: every type's first
  card, then every type's second. Arenas with no brokerage material are ghosts under their row.
- **Pinned** — the pinned links, A–Z or by days since the stamp (longest first), switched above them and remembered on the phone: the link's name on a line of its own, in its arena type's colour, tapped
  to go there (its host not shown), and under it the stamp ✓ carrying the days since, the arena and
  the pin to put it back (since 2026-10-11). Whole cards are not pinned since 2026-10-11, here or on the desk.
- **Leads** — every open lead in Spotted / Contacted / Talking, as the desk's Leads arrangement;
  Contacted split by its two paths; each lead shows the desk's diamond ("ruit"). In a lead's sheet
  the diamond is pressed to move it (the desk's own `leadPath`), and links/emails are added there,
  as is the desk's score, 1 to 5, which each row shows as the desk's numbered dot after its day.
  A lead wears its arena type's colour (`leadTone`, from the desk's `arenaTone`).
  *+ New lead* at the top adds one, asking first which arena it belongs to (frozen arenas left
  out); an arena's sheet has its own *+ Lead*. Both ask the same questions (`leadForm`).

Every card carries the desk's two small controls: the ring (ask the nightly agent, `askAt`)
and the stamp (✓, which also marks the agent's findings seen). An arena's sheet
spells out the ring and adds the desk's *Wait for…* (`hold`), which lists the arena's coming
dates to sleep until (since 2026-10-10). A brokerage link
on a card or in an arena's sheet has its own pin. The sheet's pencil ✎ edits the arena's name, its
About and Brokerage notes and both lists of links, saved together (since 2026-10-11). What stays on
the desk: making and deleting arenas, an arena's type, tags and weight, dates, types (their order and
colour too), the freezer, and the agent's Dispatches.
- **Coming up** — every arena's dates on one line, brokerage by default; a brokerage event
  leaves once it is over, a call two weeks after.
  A brokerage event opens its website (↗) when one of its arena's brokerage links fits it
  (`eventLink`: shared title words + year; a lone link counts); › opens the arena. The tab
  carries no number (removed 2026-10-08 at Mark's request).

People (the Atlas list) has no tab: it opens from the ⌕ button and from a lead's match.
The Ledger and its todos are not in Pocket. Single file, no build. Pages serves it at
`https://ben-verheven.github.io/one-app/pocket/`; added to the iPhone's home screen it opens full
screen with `icon.png`. It shares that site's `localStorage` with One App, under `pocket.*` only.

## Files
| File | Role | Edit? |
|---|---|---|
| `pocket/index.html` | the app | yes — the only thing you change |
| `pocket/icon.png` | the home-screen icon | only when asked |
| `pocket/pocket_contract.py` | makes the contract from an export | no |
| `pocket/POCKET.md`, `pocket/WRITES.md` | this guide; what Pocket writes | keep current |
| `pocket-contract.md` | data shape, derived from a One App export | never by hand; re-run the script |
| `exports/one_app_*.json` | Mark's latest One App export — input only | no |

**The last two never enter the repository** (`.gitignore` holds them out): an export is Mark's
data, and the contract shows short values from it, partner and project names among them. Both
stay on his PC, in the OneDrive folder `Pocket-app-source-cowork`.

`one-app/` is **read-only to Pocket work, always**. It may be read (to copy the look or
re-extract the maths) but a Pocket change never touches it.

## Anatomy of pocket/index.html
- `<style>` — the desk's Semaphore tokens on `:root` (`--paper`, `--ink`, `--key2`, the meaning
  hues `--brok`, `--r-ann/pub/dl`, `--today`, the lead colours `--lead/--lquiet/--ltrack`). The
  sheet (`#sheet .panel`) restates them for light bone, as the desk's drawer does.
  Class names follow the desk where the thing is the same: `.wcard .wch .wname`, `.wline .wph .wpw`,
  `.wstrip .wsb .wsd .wsnow .wsx`, `.wlk .wlink`, `.wprow`, `.lrun .lflank .lead .lruit`.
- `<script id="atlas-index">` — People data (one huge JSON line, ~320 KB). Never print it; `grep -v` / `cut` it away.
- Script 1 — **desk code, copied verbatim** out of `one-app/rooms/semaphore/semaphore.js`
  (`standing()`, `rotationSplit`, `callRuns`, `isFresh`, `STAGES`, `leadKind`, the types' tones
  `TONES`/`settleTones`/`arenaTone`, `migrate`, `let S`…). Do not edit; re-extract (see below).
- Script 2 — Pocket itself (`var`, ES5 style): `BUILT_IN`, the project's url and anon key, taken
  when the phone holds no `pocket.cfg` (since 2026-10-10, so a new phone asks only for the email
  and password; the url and key fields under `#s-conn` show only for another project) → the login (`logIn`, `token`, `renew`, `askLogin`;
  since 2026-10-09 the cloud answers only a logged-in Mark, so every request carries the session's
  token, renewed one at a time — Supabase ends a session whose renewal is used twice) → `rest()` → `pull()` (row `semaphore` only) →
  `commit()` → lead mutations (`setDone`, `setDate`, `setPath`, `addUpdate`, `editItem`, `addLead`,
  `addLeadLink`, `dropLeadLink`, `setScore`) and arena/link mutations (`stampArena`, `askAgent`, `holdArena`,
  `editArena` + `linkOps`, `pinLink`, `stampLink`); every undo puts back a snapshot (`keep`/`putBack`) → board (`liveList`, which settles the types' tones as the desk does, `scoreOf`, `typeRows`) → views (`drawRot` + `wallCard` +
  `cardLine`, `drawPins`/`pinnedOf`, `drawLeads`/`leadItems` + `leadRow` + `ruit`,
  `drawDates`/`comingUp`) → sheets (`openArena` with the round, `openLead`, `newLead`, `openPerson`).
  `fitScreen` gives the home screen the room the insets no longer say (why: the viewport meta); ⚙ shows what it measured.
- Both scripts share one global scope: a new top-level name must not collide with script 1
  (`shortDate` exists → Pocket uses `briefDate`; `openLeads` exists → `leadItems`).

## Re-extracting the desk code (script 1)
Done with a small Node script using the TypeScript parser (`npm root -g`/typescript): parse
`semaphore.js`, take the body of `Hub.mount('semaphore', function(…){…})`, and copy each top-level
declaration named below **plus every top-level declaration it refers to**, in source order:

`uid todayISO STAGES STAGE_NAME stageOf WEIGHTS weightOf ROLES reconcile S dispDate arena linkName
SWEEP_CYCLE SWEEP_SHORT eventNote openLeads standing linkHost callRuns isFresh shortDate shortDay
daysBetween leadKind KIND_NAME KIND_RANK RUNG leadName dtLabel esc rotationSplit
hasBrokerage leadPath TONES toneHex settleTones typeOf arenaTone`

Then check: no `document`/`$(`/`Hub.` in the result, no name clashes with script 2, `node --check`.
Last done 2026-10-11 from that day's desk (641 lines).

## Rules
1. Display-layer changes by default. Data structures, script 1, scoring and the write path change only when asked.
2. Every write goes through `commit(row, apply, said, undo)` — re-fetch, apply, upsert the whole blob. No sub-path patches, no new endpoints.
3. Write only fields the contract has, in the **desk's** format (see WRITES.md). Never invent fields.
4. Read defensively: every `[in n/m]` key may be missing; dates may be `''`, `null`, date or datetime.
5. Minimal footprint: touch only what the request needs; keep layout and wording otherwise.
6. Phone-native, in the desk's dress: Optima for small capitals, Iowan Old Style to read (both on
   iPhone; Palatino/Georgia elsewhere), mono for counts and hosts; no web fonts; 44 px touch
   targets; safe-area insets.

## Update routine
1. `git pull`. Everything Pocket needs is in `pocket/`, except the contract and the export, and its check,
   `tools/pocket.js`.
2. Only if the data model may have changed: stage the newest export and the last
   `pocket-contract.md` from `Pocket-app-source-cowork` on Mark's PC (or ask him to attach the
   export), run `python3 pocket/pocket_contract.py <export> --out <scratchpad>/pocket-contract.md`
   and compare the hash with the one in WRITES.md. Changed → diff the old and new contract, update
   reads/writes and WRITES.md first, and write the new contract back to that folder, never here.
3. Make the edit with a script that asserts its anchor exists once.
4. Verify: `node tools/pocket.js [folder]` logs in against a fake cloud holding the desk's own
   example board, and fails unless all four tabs and People draw with no console error, the empty
   cloud says so, and a phone that never logged in is asked to; with a folder it leaves a
   screenshot of each tab there. A change to a write needs one more step it does not take: one
   write per touched mutation produces the WRITES.md shape (diff the blob before/after each POST),
   and Stamp & next moves on. A change to the data model is checked against the export (step 2).
5. Commit and push as CLAUDE.md says. Pages has it a minute later, but the home-screen app can keep
   its old copy for up to ten minutes (2026-10-10); then closing and reopening Pocket fetches it.
   The status-bar meta is read only when the icon is added, so a change to it means deleting the
   icon and adding it again from Safari.
