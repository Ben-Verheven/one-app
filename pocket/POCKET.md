# Pocket — how to change it

`pocket/index.html` is the phone companion of One App's **Semaphore room only** — made to open in an
idle minute instead of the news. Since 2026-10-07 it is dressed and laid out like the desk's
Semaphore (the Cards view of 2026-10-06). Four tabs:

- **Rotation** — the desk's rotation, in the desk's three bands: top cards with up to four calls on
  their strip, middle cards with two, the long tail as one-line rows. Walked one card at a time with
  *Look around* → Next / Stamp & next; a card stamped today drops to a "Stamped today" group at the
  foot. Arenas with no brokerage material are listed as ghosts at the bottom.
- **Pinned** — pinned links first (oldest pin first), each with its own stamp ✓, the days since,
  and its pin to put it back; then pinned cards.
- **Leads** — every open lead in Spotted / Contacted / Talking, as the desk's Leads arrangement;
  Contacted split by its two paths; each lead shows the desk's diamond ("ruit"). In a lead's sheet
  the diamond is pressed to move it (the desk's own `leadPath`), and links/emails are added there.

Every card carries the desk's three small controls: the ring (ask the nightly agent, `askAt`),
the pin (diamond) and the stamp (✓, which also marks the agent's findings seen). A brokerage link
on a card or in an arena's sheet has its own pin. What stays on the desk: making and editing
arenas, dates, types, weights, waits, the freezer, and the agent's Dispatches.
- **Coming up** — every arena's dates on one line, brokerage by default.
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
  (`standing()`, `rotationSplit`, `tierQuota`/`bandOf`, `callRuns`, `isFresh`, `STAGES`, `leadKind`,
  `migrate`, `let S`…). Do not edit; re-extract (see below).
- Script 2 — Pocket itself (`var`, ES5 style): `BUILT_IN`, the project's url and anon key, taken
  when the phone holds no `pocket.cfg` (since 2026-10-10, so a new phone asks only for the email
  and password; the url and key fields under `#s-conn` show only for another project) → the login (`logIn`, `token`, `renew`, `askLogin`;
  since 2026-10-09 the cloud answers only a logged-in Mark, so every request carries the session's
  token, renewed one at a time — Supabase ends a session whose renewal is used twice) → `rest()` → `pull()` (row `semaphore` only) →
  `commit()` → lead mutations (`setDone`, `setDate`, `setPath`, `addUpdate`, `editItem`, `addLead`,
  `addLeadLink`, `dropLeadLink`) and arena/link mutations (`stampArena`, `pinArena`, `askAgent`,
  `pinLink`, `stampLink`); every undo puts back a snapshot (`keep`/`putBack`) → board (`liveList`, `scoreOf`, `wall`) → views (`drawRot` + `wallCard` +
  `cardLine`, `drawPins`/`pinnedOf`, `drawLeads`/`leadItems` + `leadRow` + `ruit`,
  `drawDates`/`comingUp`) → sheets (`openArena` with the round, `openLead`, `openPerson`).
- Both scripts share one global scope: a new top-level name must not collide with script 1
  (`shortDate` exists → Pocket uses `briefDate`; `openLeads` exists → `leadItems`).

## Re-extracting the desk code (script 1)
Done with a small Node script using the TypeScript parser (`npm root -g`/typescript): parse
`semaphore.js`, take the body of `Hub.mount('semaphore', function(…){…})`, and copy each top-level
declaration named below **plus every top-level declaration it refers to**, in source order:

`uid todayISO STAGES STAGE_NAME stageOf WEIGHTS weightOf ROLES reconcile S dispDate arena linkName
SWEEP_CYCLE SWEEP_SHORT eventNote openLeads standing linkHost callRuns isFresh shortDate shortDay
daysBetween leadKind KIND_NAME KIND_RANK RUNG tierQuota bandOf leadName dtLabel esc rotationSplit
hasBrokerage bkPos leadPath`

Then check: no `document`/`$(`/`Hub.` in the result, no name clashes with script 2, `node --check`.
Last done 2026-10-07 from the 2026-10-06 desk (591 lines).

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
1. `git pull`. Everything Pocket needs is in `pocket/`, except the contract and the export.
2. Only if the data model may have changed: stage the newest export and the last
   `pocket-contract.md` from `Pocket-app-source-cowork` on Mark's PC (or ask him to attach the
   export), run `python3 pocket/pocket_contract.py <export> --out <scratchpad>/pocket-contract.md`
   and compare the hash with the one in WRITES.md. Changed → diff the old and new contract, update
   reads/writes and WRITES.md first, and write the new contract back to that folder, never here.
3. Make the edit with a script that asserts its anchor exists once.
4. Verify: `node --check` on both script blocks; load the page headless (Playwright, 390×844) with a
   stubbed `fetch` returning the export's `semaphore` blob as row `semaphore`, and stubbed
   `/auth/v1/token` (password and refresh) with the tables refusing any request without a token — no console errors,
   all four tabs and the People view render, Stamp & next moves on, one write per touched mutation
   produces the WRITES.md shape (diff the blob before/after each POST); test the empty case (no
   rows) and the no-settings case.
5. Commit and push as CLAUDE.md says. The phone has it a minute later; Pocket reloads on open.
