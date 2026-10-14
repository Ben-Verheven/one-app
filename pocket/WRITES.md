# What Pocket writes

Checked against contract hash **`eb1cfc2ab9dc`** (export 2026-10-07). If `pocket_contract.py`
gives another hash, re-check this table before any change.

Since 2026-09-15 Pocket is **Semaphore-only** (the Marketplace since 2026-10-14). It no longer reads or writes the Ledger
(`main` row): no project todos, no `projects{}`.

## Rows
| Pocket name | `app_state.id` | Pocket reads |
|---|---|---|
| `data.semaphore` | `semaphore` | `arenas[]` (name, typeId, weight, frozenAt, seenAt, dates, leads, links, notes, brokerage, toolId), `types[]`, `venues[]` |

Pocket fetches only `app_state?id=eq.semaphore`. If that row is missing it says
"no Marketplace row in the cloud" and writes nothing.

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
| arena edit | `name`, `notes`, `brokerage.notes` | the name trimmed, `'Unnamed arena'` for none; notes trimmed | ✓ only the fields changed; `brokerage` made `{notes:'',links:[]}` when absent |
| arena links | `links[]`, `brokerage.links[]` | `{id, label, url}`; a changed address without a scheme gets `https://` | ✓ add, change label/url, remove — each by id on the cloud's copy, so a link's `stampedAt` and `foundAt` stay; an address with @ → `mailto:` (the desk's brokerage form) |
| lead score | `score` | `1`…`5`; the key deleted for no score | ✓ |
| venue visit | `venues[].visits[]` | `{id, at}`, both today's day, kept in order of `at`; a second press the same day takes it out | ✓ the stamp (`visitVenue`); undo puts the list back |
| venue answer | `visits[].got`, `text`, `leadId` | `got` `nothing`│`something`│`lead` (the desk's `VGOT`); `text` only with `something`, a line, the key deleted otherwise; `leadId` the lead made from it | ✓ (`answerVenue`, the visit made first if there is none); `leadId` written by `addLead` |
| venue note | `venues[].memo` | Mark's own note, trailing space trimmed; the key deleted when emptied. Not the venue's `note` | ✓ (`setVenueMemo`) |
| lead from a venue | lead `venueId` | the venue's id, beside the lead's other fields | ✓ |

**Every write absorbs first.** Before a change is applied, to the phone's copy and to the cloud's,
the desk's own `absorbVenues` (script 1) turns what an older desk left on the arenas — brokerage
dates, the general tool `toolId`, stamped brokerage links — into venues, under the ids the desk
gives them, so the blob Pocket writes is in the venue shape whatever wrote the row last. Venues
themselves (making, changing, removing one, its arenas and pages) are written only at the desk and
by the agent. The contract's export predates venues (2026-10-14); they are written in the desk's
shape above.

## Never written by Pocket
The whole `main` row (Ledger, `calls`, `projects`, `notes`, `atlas`), `semaphore.ui`,
arena `dates`/`look`/`weight`/`frozenAt`/`typeId`/`tags`, `types` (their order and their `color`, since 2026-10-11 the colour leads wear;
the arena's own `color` before it is no longer written either), and the agent's inbox tables.

## Stored only on the phone
`pocket.cfg` (URL + key + the email last used, written at the first login; until then
Pocket uses `BUILT_IN`), `pocket.auth` (the login session, since
2026-10-09), `pocket.cache` (last Marketplace copy), nothing else (`pocket.datesAll` and `pocket.pinsBy`, left behind by the Coming up filter and Pinned, both gone 2026-10-12, are read by nothing).
Nothing of these goes to the cloud. Log out removes `pocket.auth` and `pocket.cache`.
