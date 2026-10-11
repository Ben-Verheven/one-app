# What Pocket writes

Checked against contract hash **`eb1cfc2ab9dc`** (export 2026-10-07). If `pocket_contract.py`
gives another hash, re-check this table before any change.

Since 2026-09-15 Pocket is **Semaphore-only**. It no longer reads or writes the Ledger
(`main` row): no project todos, no `projects{}`.

## Rows
| Pocket name | `app_state.id` | Pocket reads |
|---|---|---|
| `data.semaphore` | `semaphore` | `arenas[]` (name, typeId, weight, pin, askAt, hold, frozenAt, sweptAt, seenAt, dates, leads, links, notes, brokerage, color), `types[]` |

Pocket fetches only `app_state?id=eq.semaphore`. If that row is missing it says
"no Semaphore row in the cloud" and writes nothing.

The row is right: One App's PROJECT.md (2026-10-06) says the cloud keeps one row per store —
`main` for the Ledger, then `semaphore`, `notes`, `atlas` — and the desk's Semaphore room syncs to
row `semaphore`. (The export file nests a copy under `main.semaphore`; that is the Export format,
not the cloud — which is why the contract says "no sample for: semaphore".)

## Field formats (desk format = the rule)
Every change is undoable from the toast; undo puts back exactly the fields it touched, as they were
(a field that was absent is removed again).

| Action | Field | Desk writes | Pocket writes |
|---|---|---|---|
| lead done | `doneAt` | `YYYY-MM-DD` / `null` | ✓ |
| lead edit | `project`, `match` | string | ✓ |
| lead date | `due` | `YYYY-MM-DD` / `null` | ✓ (clearing writes `null`) |
| lead path | `stage`, `toResearchers`, `toLead` | `leadPath(l, 'spotted│researchers│lead│talking')`; stage `spotted│contacted│talking` | ✓ the desk's own `leadPath`, copied into script 1 |
| lead update | `updates[]` | `{at:'YYYY-MM-DD', text}` (older: `{stamp,text}`) | ✓ `{at, text}`; both shapes are read |
| lead link | `links[]` | `{id, label, url}`; an address with @ → `mailto:`, no scheme → `https://` | ✓ add; remove by id |
| lead new | `{id,project,match,links[],stage,toResearchers,toLead,due,doneAt,updates}` | uuid id, `stage:'spotted'`, paths `false`, `updates:[]` | ✓ (Pocket's default `due` is today) |
| arena stamp | `sweptAt`, `sweptPrev`, `seenAt`, `seenPrev` | day; the moment (ISO) for seen; same-day stamp takes itself back | ✓ |
| arena pin | `pin` | `true`/`false` | ✓ |
| arena ask | `askAt` | ISO moment / `null` | ✓ |
| arena wait | `hold` | `{dateId}`, one of the arena's own dates / `null` to stop waiting | ✓ |
| lead score | `score` | `1`…`5`; the key deleted for no score | ✓ |
| brokerage link pin | `brokerage.links[].pin` | ISO moment when pinned; key deleted when unpinned | ✓ |
| brokerage link stamp | `stampedAt`, `stampPrev` | day; same-day stamp → `stampPrev`, which is then deleted | ✓ |

A pin on one of the arena's *own* links (`links[].pin`) is not in the contract: Pocket shows such a
link on Pinned but leaves its pin and stamp to the desk.

## Never written by Pocket
The whole `main` row (Ledger, `calls`, `projects`, `notes`, `atlas`), `semaphore.ui`,
arena `name`/`dates`/`look`/`weight`/`frozenAt`/`notes`/`typeId`/`tags`/`links`,
`brokerage.notes`, `types` (their order and their `color`, since 2026-10-11 the colour leads wear;
the arena's own `color` before it is no longer written either), and the agent's inbox tables.

## Stored only on the phone
`pocket.cfg` (URL + key + the email last used, written at the first login; until then
Pocket uses `BUILT_IN`), `pocket.auth` (the login session, since
2026-10-09), `pocket.cache` (last Semaphore copy), `pocket.datesAll` (Coming up filter).
Nothing of these goes to the cloud. Log out removes `pocket.auth` and `pocket.cache`.
