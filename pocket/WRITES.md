# What Pocket writes

Checked against contract hash **`eb1cfc2ab9dc`** (export 2026-10-07). If `pocket_contract.py`
gives another hash, re-check this table before any change.

Since 2026-09-15 Pocket is **Semaphore-only**. It no longer reads or writes the Ledger
(`main` row): no project todos, no `projects{}`.

## Rows
| Pocket name | `app_state.id` | Pocket reads |
|---|---|---|
| `data.semaphore` | `semaphore` | `arenas[]` (name, typeId, weight, askAt, hold, frozenAt, sweptAt, seenAt, dates, leads, links, notes, brokerage, color), `types[]` |

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
| lead done | `doneAt`, `outcome` | `doneAt` `YYYY-MM-DD` / `null`; since 2026-10-11 `outcome` beside it, how the lead ended: `project`, `nowhere` or `declined` (the desk's `OUTCOMES`), the key deleted when it is reopened. A contract made from an export before then has no sample of `outcome` | ✓ asked when Complete is pressed; undo puts both back |
| lead edit | `project`, `match` | string | ✓ |
| lead date | `due` | `YYYY-MM-DD` / `null` | ✓ (clearing writes `null`) |
| lead path | `stage`, `toResearchers`, `toLead` | `leadPath(l, 'spotted│researchers│lead│talking')`; stage `spotted│contacted│talking` | ✓ the desk's own `leadPath`, copied into script 1 |
| lead update | `updates[]` | `{at:'YYYY-MM-DD', text}` (older: `{stamp,text}`) | ✓ `{at, text}`; both shapes are read |
| lead link | `links[]` | `{id, label, url}`; an address with @ → `mailto:`, no scheme → `https://` | ✓ add; remove by id |
| lead new | `{id,project,match,links[],stage,toResearchers,toLead,due,doneAt,updates}` | uuid id, `stage:'spotted'`, paths `false`, `updates:[]` | ✓ (Pocket's default `due` is today) |
| arena stamp | `sweptAt`, `sweptPrev`, `seenAt`, `seenPrev` | day; the moment (ISO) for seen; same-day stamp takes itself back | ✓ |
| arena ask | `askAt` | ISO moment / `null` | ✓ |
| arena wait | `hold`, `holdPrev` | `{dateId}`, one of the arena's own dates / `null` to stop waiting; a stamp on a card back from waiting moves `hold` to `holdPrev` for the day (the desk's own sweep), and the same-day undo moves it back | ✓ |
| arena edit | `name`, `notes`, `brokerage.notes` | the name trimmed, `'Unnamed arena'` for none; notes trimmed | ✓ only the fields changed; `brokerage` made `{notes:'',links:[]}` when absent |
| arena links | `links[]`, `brokerage.links[]` | `{id, label, url}`; a changed address without a scheme gets `https://` | ✓ add, change label/url, remove — each by id on the cloud's copy, so a link's `pin`, `stampedAt` and `foundAt` stay; an address with @ → `mailto:` (the desk's brokerage form) |
| lead score | `score` | `1`…`5`; the key deleted for no score | ✓ |
| brokerage link pin | `brokerage.links[].pin` | ISO moment when pinned; key deleted when unpinned | ✓ |
| brokerage link stamp | `stampedAt`, `stampPrev` | day; same-day stamp → `stampPrev`, which is then deleted. One stamp to a site: the press writes every date and link (brokerage or the arena's own) of the same site (`siteKey`), on any arena | ✓ since 2026-10-11 the same for every row of the site |
| event stamp | `dates[].stampedAt`, `stampPrev` | as the link stamp, and with it, through the event's `url`; an event without one stands alone | ✓ (Coming up) |
| event note | `dates[].memo` | Mark's own note on a brokerage event, trailing space trimmed; the key deleted when emptied. Not the date's `note` | ✓ (Coming up); undo puts it back. Since 2026-10-12, after the contract's export |
| event website | `dates[].url` | an address with @ → `mailto:`, no scheme → `https://` | ✓ only where it had none |
| event new | `dates[]` + `{id,kind:'brokerage',label,call:'',role:'',note:'',url,gran,grade,start,end}` | uuid id; `label` `'(untitled)'` for none; `start`/`end` the stretch `gran` names (`day`/`range`/`month`/`quarter`/`half`/`year`); `grade` `fixed` only for a day or a span | ✓ |
| event remove | `dates[]`, `hold`, `brokerage.links[]` on every arena | the date taken out; `reconcile` ends a wait for it; the cards' unpinned links to the event's site (`siteKey`) taken out with it | ✓ undo puts it back in its place, and the wait, and each link in its place |

A pin on one of the arena's *own* links (`links[].pin`) is not in the contract: Pocket shows such a
link on Pinned but leaves its pin and its own stamp button to the desk; its `stampedAt` is written only
when a stamp on an event or brokerage link of the same address carries it, as the desk does. The
contract's export predates the dates' `url` (2026-10-08) and `stampedAt` (2026-10-09); both are
written in the desk's shape above.

## Never written by Pocket
The whole `main` row (Ledger, `calls`, `projects`, `notes`, `atlas`), `semaphore.ui`,
arena `dates` (but for the brokerage-event rows above; a call's date never)/`look`/`weight`/`frozenAt`/`typeId`/`tags`, `types` (their order and their `color`, since 2026-10-11 the colour leads wear;
the arena's own `color` before it is no longer written either), and the agent's inbox tables.

## Stored only on the phone
`pocket.cfg` (URL + key + the email last used, written at the first login; until then
Pocket uses `BUILT_IN`), `pocket.auth` (the login session, since
2026-10-09), `pocket.cache` (last Semaphore copy), `pocket.datesAll` (Coming up filter), `pocket.pinsBy` (Pinned's order).
Nothing of these goes to the cloud. Log out removes `pocket.auth` and `pocket.cache`.
