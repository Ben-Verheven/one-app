# PROJECT — what One App is, for anyone picking it up cold

One HTML page holding five separate vanilla-JS applications, called
**rooms**. Four were written independently, they all name things `.card`,
and none of them knows the others exist; the fifth, Notes, was written
later against the arrangement the other four had to be fitted into. A
shell called the **Hub** is what lets them share a page.

There is no framework, no bundler, no package manager, no build step.
Since 2026-10-10 the app lives in the public GitHub repository
`Ben-Verheven/one-app`, and GitHub Pages serves that repository as it
stands — the tree itself, file for file, so a push is the release. **It
must still run from `file://`** — opened from disk, not served — because
the OneDrive folder it came from is the way back, and a copy on disk is
what that way opens. That one fact still decides most of the
architecture.

**This file is the only description of how the app works.** Five things
are written down about this project and each has exactly one job:

| | |
|---|---|
| `CLAUDE.md` | how to behave here — the working method, and the rules as a checklist. The claude.ai project instructions only say how to reach it |
| **`PROJECT.md`** (this) | how the app works, and *why* each rule exists |
| `README.md` | how Mark opens it, on which device, and how he goes back. Nothing else |
| `MAP.md`, `NAMES.md` | generated indexes. Never hand-written |
| `notes/` | what no code file records: bugs already paid for, and Mark's design choices, one note per part. `notes/INDEX.md` lists them |

A fact belongs in one of them. When two of them say the same thing they
will eventually say it differently, and then neither can be trusted —
which is how the four rules came to be written out in three places and the
room line-counts in the old README went stale. Add to the one that owns
the fact and link from the others. Numbers a tool can count — lines,
sections, sizes — are only ever in the generated indexes.

**A desk and an iPad, and nothing narrower.** Every room is a wide table
of one kind or another, and the narrowest of them wants about 760 points
before it can say anything true. The stylesheets stop at 820px, because an
iPad held upright is 768 and there is nothing under it to design for.
There were phone layouts once; they are gone, and the phone has only
Mark’s Place's own page (`partner-watch/pocket/`). Do not add a breakpoint
below 768px, and do not treat a narrow desktop window as a case to serve. `(hover:none)` and
`(pointer:coarse)` are a different question and still matter — an iPad has
no hover.

---

## The Hub, and why the rooms don't collide

`shell/hub.js`. Every room is mounted inside a function that is handed
its **own** `window`, `document` and `localStorage`:

```js
Hub.mount('ledger', function (window, document, localStorage) { … });
```

Those are Proxies, not the real objects.

**The scoped document** resolves `getElementById` inside the room's own
pane first, then the shell's furniture, and *never* another room — that
is what stops a room writing its text into a stranger's element when two
rooms happen to share an id (`count` did). `querySelector`,
`getElementsByClassName` and friends are pane-only. `document.body` is
the pane.

**The scoped window** reports the pane's size as `innerWidth` /
`innerHeight` and the pane's scroll as `scrollY`, because the page itself
no longer scrolls — the room does. It also carries a `window.storage`
shim the Atlas uses, backed by `localStorage` under `hub.storage.*`.

**Events are routed, not scoped.** Keys arrive wherever focus is and a
drag that leaves the pane still has to hear the `mouseup`, so those go on
the real document and are *gated* on the room being the visible one.
Lifecycle events (`load`, `visibilitychange`, `resize`, …) pass through
ungated.

**Writes to `window` land on the real window.** This is deliberate: the
markup is full of inline `onclick="PL.showNewForm()"`, and those resolve
against the real global.

### The rest of the Hub surface

| | |
|---|---|
| `Hub.markup(pid, html)` | put a room's furniture in its pane; must run before its mount |
| `Hub.mount(pid, fn)` | register a room; run it now, or on first entry if it is lazy |
| `Hub.go(pid)` / `Hub.active()` | show a room / which one is showing |
| `Hub.ensure(pid)` / `Hub.pane(pid)` | build a lazy room without showing it / a room's pane, if it exists |
| `Hub.onRoom(fn)` | called on every room change, `fn(now, before)` |
| `Hub.expose(id, obj)` / `Hub.api(id)` | a room's public surface, for the other rooms |
| `Hub.on(name, fn)` / `Hub.emit(name, …)` | the two-line event bus |
| `Hub.veil(on)` | stand the shell's own ring and title aside for a full-screen pane |
| `Hub.note(text, ms)` | a toast in the shell's rail |
| `Hub.started(id)` / `Hub.failure(id)` | did the room boot, and if not, why |

**The Call Board is lazy** (`LAZY = { callboard: 1 }` in `hub.js`). Its
pane registers at load but its function is not run until the room is
first opened, because it builds the whole Work Programme, and fetches
the topics' texts (the Topic Atlas's, `topic-atlas/topics.js`) only then.
The other four are built at load because other rooms reach into them
then. The Board is reached into as well — the Ledger's programme projects
are each written for one of its topics — but never at load: the bridge
calls `Hub.ensure('callboard')` at the moment somebody asks, which builds
the room in place without showing it.

---

## What the rooms say to each other

Everything cross-room lives in `shell/bridge.js`. Nowhere else.

```
Hub.api('ledger')          → { PL, projects(), calls(), save,
                               setTopics, boardChanged(), setLeads,
                               leadsChanged(), snapshot(why), signedIn(),
                               token() }
Hub.api('callboard')       → { topics(), calls(), openReader(),
                               openText(arenaId, names), closeReader(),
                               setArenas(o), arenasChanged(), judge(),
                               textsChanged(), cloudBack() }
Hub.api('semaphore')       → { state(), save(), renderAll(),
                               applyState(obj), leads(),
                               leadVerb(aid, lid, op, val), arenas(), calls(),
                               finds(), refreshFinds(cb),
                               judge(key, verb, type, cb), seen(aid),
                               frozen(), thaw(aid), leadAdd(aid, v), allLeads(),
                               openArena(aid), gpt(kind), escape() }
Hub.api('atlas')           → { openDossier(), G, state(), applyState(obj) }
Hub.api('notes')           → { state(), applyState(obj) }
Hub.api('semaphore-inbox') → { ready(), list(cb), decide(id, status, cb),
                               visits(since, cb) }
Hub.api('atlas-inbox')     → the same first three verbs over the Atlas's inbox
Hub.api('partner-sites')   → { ready(), list(cb) }, the addresses Mark's Place copies
Hub.api('horizon')         → { ready(), changes(cb), notices(id, cb), seen(ids, cb) }
Hub.api('call-texts')      → { ready(), list(), refresh(cb), fits(t, arenaId, names),
                               decide(id, status, cb), add(rows, cb) }
```

A room offers what another room or a tool actually asks for, and nothing
it might one day be asked for: an unused entry here is dead code no
scanner can see, because the name is spelled in the room that offers it.

One event, per room that holds a store of its own: **`semaphore:saved`**,
**`notes:saved`** and **`atlas:saved`**, emitted after every save so the
bridge can push that room to the cloud. And one from the Ledger,
**`cloud:session`** (`true` or `false`), when a login starts or ends. And
**`semaphore:project`**, with a name and links, when a lead is completed as
having become a project, in the Semaphore or on the Ledger's lead card.
And **`leads:excel`**, from the Excel button on the Semaphore's Leads, which
the bridge answers by writing every lead (`allLeads()`), open and closed,
into one .xlsx file — the same file again each time where the browser can
keep hold of one; the bridge's own comment says how. And **`lead:sheet`**,
from PDF and Copy for email on a lead Mark's Place made, which the bridge
answers by reading that entry from Mark's Place's table and laying it out
as Mark's Place does. And
**`semaphore:keep`**, with a reason, just before ChatGPT's answer is put on
the board, which the bridge answers with a Ledger restore point. And
**`callboard:ready`**, once, when the lazy Call Board has been built, which
is when the bridge hands it the Semaphore's board. And **`semaphore:judge`**,
with a sentence saying what landed, once the answer to ChatGPT's search for
calls is on the board or its texts are in the cloud, which the bridge answers by going to the Call Board
and starting to judge what it found.

What the bridge actually does: turns any researcher's name, written
anywhere in any room, into a link that opens the Atlas dossier over the
top of the room you are in; lends the Call Board's reader the same way, so
a project written for a Horizon topic reads that topic, and a call tied to
an arena's call reads its kept text, without leaving the Ledger; fills the
socket the Ledger picks a topic or an arena's call from, with the dates the
Semaphore and the Horizon check have for them now, and tells the Ledger
when they may have changed, so it can offer the change; fills a second
socket with the Semaphore's open leads, those in Limbo left out, so the Ledger's board draws them as a
line of their own, every change made on a lead card there is made on
the Semaphore's own record, a lead can be started there, a lead's arena
opens in the Semaphore's drawer lent over the Ledger as the dossier is, and a
lead that became a project opens the Ledger's new project with its name and
links filled in; hands the Call Board the Semaphore's board as it works it
out — every arena's calls and the new arenas waiting to be judged, with
the verbs that judge them and mark an arena's new dates seen — and again
on every save there, with the drawer lent over the Board for an arena and
ChatGPT's box for the searches for calls and for call texts; reads the
Horizon check's two tables, below, for the Call Board, and the one rule
that ties a call text to its call; draws the ring of rooms and the title,
with the finds waiting to be judged counted beside the Call Board's mark; runs the page-change animation; and syncs
the Semaphore's board, the Notes room and the Atlas's edits through the
Supabase credentials the Ledger already holds.

**The Notes room asks the others for nothing and is asked for nothing.**
It is the one room with no cross-room surface at all; a note there is
general memory rather than a record hung on one proposal.

**A new cross-room feature belongs in `bridge.js`.** A room reaching
directly into another room's internals is the thing this design exists
to prevent.

---

## Where the state lives

`localStorage`, which a browser keeps per origin: on disk that is
`file://` as a whole — so a copy finds its data at any local path — and on
the site it is `https://ben-verheven.github.io`. So the site, a copy on
disk and an iPad's home-screen app each keep a store of their own, and
only the cloud joins them.

| key | what |
|---|---|
| `pj-journal-v3` (+`-ts`) | the Ledger: projects, calls, todos |
| `pj-cloud-config` | Supabase url + key, shared by every sync, and the email last logged in with. A device with none takes the app's own (`BUILT_IN` in `ledger.js`); after Disconnect it holds `{off:true}` |
| `pj-cloud-auth` | the login session — the only one in the page; see below |
| `pj-cloud-seen` | the cloud row's own `updated_at` at this device's last exchange with it |
| `pj-cloud-dirty` | this device holds a change the cloud has not been told about |
| `pj-restore-v1` | the last three restore points, each a whole Export blob |
| `pj-projects-v1`, `pj-callinfo-v1` | legacy, read once and migrated |
| `semaphore.v1` (+`-ts`, `-seen`, `-dirty`, `-sum`, `-base`) | the Semaphore's board: arenas, types and venues, and the new arenas ChatGPT suggested that wait to be judged (`suggested`) |
| `notes.v1` (+`-ts`, `-seen`, `-dirty`, `-sum`) | the Notes room: notes, book order, which of the two ways in, the tag ties, the colours chosen for tags, and what is pinned in which book |
| `hub.room` | which room to open on |
| `leads-excel-v1` | fingerprints of what the last weekly Excel held, so the next one can mark what is new; the file it wrote is kept as a handle in IndexedDB, `one-app-excel` |
| `hub.storage.*` | the Atlas's own edits, and their `-ts`, `-seen`, `-dirty`, `-sum` |

**A room joins the two doors out — cloud and Export — the same way:** it
answers `state()` and `applyState()`, emits `<room>:saved`, is handed to
`roomCloud()` in `bridge.js`, and is named in `ROOM_STORES` (`ledger.js`).
Cloud is one Supabase table, **`app_state`**, one row per store: `main` is
the Ledger, then `semaphore`, `notes` and `atlas`. (Mark’s Place keeps
its scroll links, call notes and corrected readings of sentences in a row of its own, `partnerwatch`, which
Export leaves out, and reads `semaphore` for the order and arenas of its
venues; it writes there only the leads made from its entries.) The
Ledger's **Export**
writes the journal and, beside it, every store in `ROOM_STORES` under its
own name; Import merges the journal and replaces a room's store, and a
file written before a room joined has no key for it and leaves it alone.
All four stores ride in both doors.

**The cloud answers only a logged-in Mark** (since 2026-10-09). Until then
the url and the anon key were the whole protection, typed into every
device; now the database's rules (`supabase/5-lock-to-owner.sql`,
undone by `6-unlock.sql`) let the key alone read and write nothing, and a
request has to carry the session of the project's one user. That is also
why the url and the key can be written into the page — they are, in the
Ledger and in Mark’s Place — and why the repository can be public. **Undoing the
lock and keeping the key in a public page do not go together**: run
`6-unlock.sql` and the key is the password again, to everyone. The login is
an email and a password in the Ledger's cloud panel, once per device — not
a code by mail, because Supabase's own mail service sends two messages an
hour and only to the project's team. **The Ledger's client is the only one
that signs in.** The bridge's three room syncs and the two inboxes are
built with `accessToken` and send the Ledger's token through `token()`:
two clients holding one session would each renew it, and Supabase ends a
session whose renewal is used twice. Nothing asks the cloud anything
without a session — the library would quietly send the bare key, and the
rules answer that with an empty table, which every sync here reads as "no
copy yet". So without one the chips say **log in**, changes stay marked
unsent, and logging in sends them. A renewal that cannot reach the server
(a laptop waking before its network) is not a logout; one the server
refuses is.

**Which copy wins is decided by two keys and never by a clock.**
`pj-cloud-seen` is only ever copied *from* the cloud, and `pj-cloud-dirty`
is set by a change made here and cleared when a push lands, so the four
cases are: the cloud has not moved since we last saw it (push if dirty);
it has moved and nothing here is unsent (take it); both have moved (ask —
the box names both, and Cancel means keep this device's); this device has
never synced (ask as well, unless there is nothing here to lose). The
dirty flag is on disk rather than in a variable because the case it exists
for is the page going away between a change and its push: an upload lost
that way is sent at the next open instead of being forgotten. Every upload
first asks whether the cloud has moved, and so does coming back to the
page; a moved cloud is read and the four cases decide before anything is
written over it.

The other three rooms keep the same two keys each, beside their store
(`<key>-seen`, `<key>-dirty`), in `roomCloud()`, and a third, `<key>-sum`,
a fingerprint of what the cloud said at that exchange — a cloud that has
moved but says the same thing has not moved. Two differences: a room has
no box to ask with, so when both copies have moved, what is here becomes a
Ledger restore point and the cloud's is taken, with a note saying so; and a
change to where the room was looking only — its `ui` keys — is not sent on
its own. A device that has never synced under the two keys decides once by
the old `-ts` stamp.

**The Semaphore's two copies are put together instead** (since 2026-10-11),
because another page writes the same board, Pocket from the phone then and
Mark’s Place's Make lead now, and a change written there while the desk
held an unsent one used to set the desk's aside. The
room keeps a fourth key, `-base`, a fingerprint of what the cloud said at
the last exchange — a hash of every piece, not a third copy of the board —
and when both copies have moved, each piece (every field of every arena and
type, and each lead, link and date whole) comes from the side that changed
it. Only where both changed the very same piece does the cloud's win, and
then the restore point and the note are as before. A fingerprint that is
not of the exchange `-sum` names decides nothing: the room takes the cloud's
copy as the others do.

**A venue has the same id on every device that makes it**, because the
Semaphore makes them itself (since 2026-10-14). Its board keeps
`venues` beside `arenas` and `types`: the places where projects in the
making can be found — a brokerage event's marketplace, a partner search —
each serving one arena or several. Since 2026-10-15 a venue has no kind:
each is a window of activity (`opens`, `closes`) with event days inside it
or none, and a `place`: `new` on the board, kept on the `board`, in
`venues`, or `gone`, a stub the agent reads so it does not bring back
the occasion Mark removed (the same site for a later call or edition it
may, with days of its own after the stub's). `kind` stays on every venue, always `event`, only
because an older gatekeeper wipes a tool's window. An older copy of
the desk and an agent's finding can still put a brokerage date or
link on an arena, so every read of the board turns those into venues
(`absorbVenues`), and two devices doing it apart would have put two
copies of every venue on the board once their copies were put together.
So an event's venue takes the date's own id, a tool's is made from its
site's address, and a visit's id is its day, one visit a day.

**The Atlas's scheduled agents read the web at night and write only to an
inbox of their own**, `atlas_inbox` (researchers' TU/e, Pure and own
pages: left, arrived, new position, new self-description, newcomers in a
group). The Semaphore's agent has one too, `semaphore_inbox`, where only
a new arena it suggests waits (see the next paragraph). Neither holds the
app's key. Each reaches Supabase through a gatekeeper edge function with a
password of its own (`semaphore-agent`, `atlas-agent`); the Atlas's copy of
its people is the `atlas_roster` table, seeded from the data file and
pasted again if the file is ever rebuilt. The app reads a finding when its
view opens — the Atlas's **News**, and for the Semaphore's the Call Board,
where every new arena is judged one at a time (until 2026-10-24 the
Semaphore's **Dispatches**) — and answers it in the cloud first, then makes
it an ordinary edit, so two machines cannot accept the same finding twice.
In the Semaphore, whatever a search puts on an arena carries `foundAt`
and is marked new until Mark presses Seen on it. Where each
agent is told what to do is its scheduled task; the SQL and the functions
are in `supabase/`. The gatekeepers there are pasted into Supabase by
hand, so the copy in the repository can be ahead of the one running; the
Semaphore's is written so that the older one still does no harm.

**The Horizon check is a plain program, not an agent**, like Mark's
Place's copier: an edge function, `horizon-check`, run by the database's
own schedule every night (`supabase/9-horizon-check.sql` and
`10-horizon-check-function.ts`). It reads the EU Funding & Tenders
portal for every topic of the Work Programme file, as the site serves
it, and keeps what the portal says in `horizon_topics`: its dates,
status and notices, and how they differ from the file (other dates, gone,
moved). The Call Board lays that over the Work Programme, which is never
changed. It also copies, word for word, the portal's text of every call
on the Semaphore's board whose name carries a portal id, into
`call_texts`, where ChatGPT's search for call texts adds the rest from the
app; each text waits there to be judged on the Call Board. Mark's login
may only mark a topic seen, judge a text and add ChatGPT's; the program
writes with the server's key, and its password is made in the database.

**The Semaphore has one agent**, the task **Marketplace agent**, and it
is turned off: since 2026-10-23 ChatGPT's search does its work, since
2026-10-25 as separate searches, each behind a ChatGPT button where what it
finds lands: the Call Board's for calls and for call texts, the
Semaphore's for brokerage. The task is kept, and so is its gatekeeper, so that
a session can still read the board through it. Turned on, it runs by
itself every night at about 01:00 his time, a scan that reaches every
active arena once a week and every frozen one about once a month, and when
Mark asks a Claude session for something. That session starts a session of its own with the
task's instruction and his request at its end: a firing with the request
as its text runs the instruction alone first, and twice the request that
came after was refused as untrusted. Fired by hand with nothing to do, the
agent waits. **Its job is to put things on the board** (since 2026-10-15):
call dates as published, which simply stand there, and venues — brokerage
events and partner searches where projects in the making and their
leaders can be found — which land as `new` and wait in the Semaphore's
Venues, in the section its dates give and marked new, until Mark, in each
one's card, puts it in a section or removes it. It keeps what
is on the board correct, but where a venue stands is his: it deletes only
a venue still new, its own find gone wrong, and never one he removed
(the gatekeeper refuses both). Since Mark judges everything it brings, it
leans to completeness: anything with matchmaking goes on the board, a
month-only date as a dashed guess, a few misfires accepted. Its rules are
in the task's instruction, and
[semaphore-decisions](notes/semaphore-decisions.md) says why. Ask agent
on a venue's panel, or at the head of an arena's (since 2026-10-15, for its
call dates above all), puts a moment on it (`askAt`) that the scan takes
first, and the app takes the ask off once the agent's log shows a look at
that venue or arena after it. The gatekeeper's `board` gives it the whole board but
the leads, venues and all, and `edit` lets it add and correct venues, add
an arena or a page to one, add, change and delete call dates, and change
the arenas' links and two texts, straight on the board, which the room
then takes in as it takes Mark’s Place's leads. The gatekeeper reads the board through
a copy of the room's own `absorbVenues`, so what it writes is in the
venues' shape with the venues' own ids. What `edit` has no op for it
cannot do: delete an arena, change an arena's name, type, tags, weight or
freezer, the types, the leads, or a venue's `place`, `memo` or visits. A new arena still waits in its inbox, and is judged on the Call Board. What it changed is told
in its own report, and every write leaves a copy in `app_state_history`.

A second table, **`app_state_history`**, keeps a copy of every upload —
`row_id`, the blob, a count and `saved_at` — the newest twenty of each
row, trimmed by a trigger so nothing in the browser needs permission to
delete. It is optional: until it exists every insert fails, silently, and
everything else works. The SQL that makes it is in the Ledger's cloud
panel, which also lists what is in it and restores from it. Restore points
are the same idea in `localStorage`, three deep, for the times the cloud
is what you cannot reach.

---

## The four rules

1. **Order in `index.html` is load order.** Hub, then the venue maths
   (`shell/venues.js`) and a lead's sheet (`shell/leadsheet.js`), each
   shared with Mark's Place, then data, then each
   room's view before its script, then the bridge, then boot.

2. **Never `type="module"`.** Modules are fetched and a browser will not
   fetch across `file://`. Plain `<script src>` is not a fetch and works
   from disk. Same for `fetch()` on any local file: it will not work. The
   site would allow both; a copy on disk would not, and a copy on disk is
   the way back.

3. **A `.view.js` holds exactly two backticks — the pair around its
   markup — and no `${`.** The markup travels as one template literal; a
   third backtick ends it early and the room loses everything after it,
   usually without a parse error.

4. **`data/*.js` are generated and enormous** — most of the app's weight.
   Never open them, never edit them, never paste them anywhere. Each
   returns its JSON through a function so the Call Board's topics are
   still only built on first entry.

---

## What the things on screen are called

Naming the thing is the fastest way to ask for a change to it. Everything
below is what the code calls what you are looking at; a screenshot does
the same job, and does it better when the thing has no name yet.

**In every room** — the line of room glyphs at the top left is `#oa-ring`
and the name beside it is `#oa-title`. Each room's own controls sit in
`.oa-bar`, which is one height everywhere, `--oa-bar-h`, 60px; a room that
sticks anything to the top of its own scroller has to clear that bar. The
rooms are `#pane-ledger`, `#pane-semaphore`, `#pane-callboard`,
`#pane-atlas` and `#pane-notes`, the wipe between them is `#oa-sweep`, and
a researcher's name written anywhere is `.atlas-ref`.

**The Ledger**

| on screen | in the code |
|---|---|
| the beam: chips, overdue, next deadline | `#hz-beam` › `.hz-bar`; `.call-chip`, `.beam-overdue`, `.beam-dl` |
| the programme: the last chip, and the white one | the call `__horizon__` — an ordinary chip whose call colour is white |
| a project's topic, beside its acronym | `.pc-topic` — opens the Board's `#reader` over this room |
| a Horizon project's own key dates | `p.markers`, imported from its topic; `.mi-row-key` on its card, a lane apiece on the timeline |
| the board, and the timeline it turns over to | `#horizon-container` › `.hz-flip`; `.hz-face-front` / `.hz-face-back` |
| the horizon grid as a whole | `.hz-scroll` › `.hz-wrap` |
| the months and day letters above it | `.hz-head`; `.hz-months`, `.hz-axis`, `.hz-day-lbl` |
| one call's block of lanes | `.hz-call`, its coloured edge `.hz-rail` |
| one project's lane | `.hz-proj` = `.hz-proj-name` + `.hz-proj-track` |
| a todo, its deadline, the line joining them | `.hz-mark`, `.hz-dl`, `.hz-runway` |
| the leads line, last on the board: the Semaphore's open leads, the box of undated ones beside its name, a lead's card | `.hz-call-leads`, `.hz-lead-mark`, `.hz-leads-undated`; `.lead-card` |
| the effort strip under the grid | `.hz-effort`; one day is `.hz-eff`, and `.hz-eff-unplanned` closes the row |
| the list that opens under the board | `#hz-detail`, holding `.todo-card-later` cards |
| every deadline in date order | `#hz-agenda` |
| the timeline face | `.tl2-wrap` |
| the contribution tracker, over the board | `.ct-sheet` |
| any box that opens over the room | the `pf-` family — `pf-host`, `pf-box`, `pf-head`, `pf-body`, `pf-foot` |

**The Brokerage Semaphore** — the Marketplace from 2026-10-14 to 10-17,
when Mark named it back so that it is not taken for Mark’s Place, and
always `semaphore` in the code: its pane, its files, its store and its
cloud row kept the name, so nothing stored had to move. Older code comments
and the agent's task still say the Marketplace; it is the same room.

| on screen | in the code |
|---|---|
| the room's scroller — the page itself does not scroll | `#semscroll` |
| the header: Venues and Leads, a pair in the middle; the cloud chip, and the menu under three dots holding + Venue, + Arena, Types and ChatGPT | `header.top`; `.pair` › `#venuesBtn`, `#leadsBtn`; `#semcloud`; `#semMoreBtn` and its `#semMenu` |
| ChatGPT's search, opened by ChatGPT here for brokerage and lent over the Call Board for calls and call texts, the two chosen at its head: the file out, the answer pasted or chosen, what it would change, Put on the board | `#gptModal` › `.gptpick`, `#gptText`, `#gptFile`, `#gptSaid`, `#gptPut` |
| Venues (the Now page until 2026-10-15), Leads (on the wall) | `#now`, `#wall` |
| Venues: its three tabs, Arising · Active · Dying, and Limbo's apart, for what is over or put there; Mark's Place last and quiet, after the key; a venue new or changed, and the press that goes through them one card at a time; the axis over them, sticky; the heading of each group, Shared then each type; one venue's row, its mark the grip it is dragged by into his own order, its name and the arenas it serves, its strip, and Go, which is the visit (Visited once pressed today) | `.vtabs` › `.vtab`, `.culimbo.vlimbotab`, `.vplacetab`; `.vfnd`, `.vchk`; `.vaxis`; `.vgrp`; `.vgl`, `.vrow.vdragging`; `.vrow` = `.vname` (`.vnmrow` › `.vnm`, `.vchips`) + `.vtrack` + `.vend` (`.vgo`, `.vgo.done`) |
| a venue's window, on Venues and in its panel: the band, its two ends to drag, the event days, the visits, today | `.vband` (`.st-new`, `.st-board`, `.st-venues`), `.vh`, `.vmeet` and `.vdia`, `.vtick`, `.vnow` |
| the visit question, at the foot of the room after Go | `#vbar` › `.vask.bar` |
| Leads: the table, its heading of columns that sort, a step's coloured band and Limbo's at the foot, one lead's line, and open, its Who, Links and Updates boxes | `.ltable` › `.lthead` (`.ltc`), `.lgrp` › `.lgh`, `.lgrp.k-limbo`, `article.lead.wide`; `.lpane`, `.lupdpane` |
| the types, managed — opened by Types: a type's line and its grip, its arenas one per row, its colour dot, the copy that follows a drag | `#typesModal` › `#tylist` › `.tyblock` (`.tyline` › `.tygrip`, `.tyarenas` › `.tyrow`); `.lcolwrap.tycol`; `.tyghost` |
| a venue's panel, wider (`#card.vwide`): what a search found or changed and what to do with it, the Call Board's view of it under that, its facts two to a row, the rest folded; going through what was found, the band over it all | `.vfound` (`.vfch`), `.vsnip` (its lane `.sr.lane`, a call `.sr`), `.vfacts` › `.vf`, `.vfolds` › `.vfold` › `.vfh`; `.vwalk` |
| the drawer, holding an arena or a venue; an arena's venues in it; a link's cross, and the press that makes a brokerage link a venue; where a venue stands, the four sections tied together with Remove beside them (`.vphseg`); a venue's ask to the agent | `#card` and its `.scrim`; `.avlist` › `.avrow`; `.ldel`, `.lmake`; `.vplace`; `.vagent` |

**The Call Board** — the tabs are the bar, `#hdr` › `.tabs` › `.tsel`:
the triangle `.tri`, its three points `.pt` (Horizon, Partnerships, All &
Freezer) turning in `.spin`, the group's name `.glab`, and the three rows
of tabs, `.trow`, the chosen one `.cur`: Horizon's clusters, the arenas'
tabs (JU, CoFund, CoProg and OTHER), and All with the Freezer; the controls under it are `.hd-controls`
and `#ovbar`, ChatGPT's search for calls `#gptb` among them; the chronological chart is `#tl` inside `.tl-sticky`, on the
right of the topic list on a Horizon tab and alone on an arena's tab, with
what a search finds elsewhere under it in `#tlaway`; a topic opens in
`#reader`, the portal's notices on it in `#rdnotes`. A topic the portal no
longer has, or has moved, is `.topic.gone` with its `.hztag`; a change the
portal brought glows (`.fresh`) until its `.seen`. On an arena's tab a call is a row, `.arow`, whose chip,
`.achip.stag`, names the arena, the first of each arena's rows `.afirst`, and
one with a new date glows (`.fresh`) until its `.seen` is pressed; an arena
opened there is `.aopen`, a call's kept text opening from its `.tbtn`, and where a tab holds several types each is named
over its arenas by a `.tyh`. The Freezer tab draws every arena put away
the same way, its tag `.frz`, with a `.thaw` on each. What waits to be judged is counted on `#jpill` and dotted on
its tab (`.fd`) and on the triangle's point (`.pt.fd`); while judging, the new arena stands dashed in its tab, a
row `.ghost`, a call whose text is judged carries a dashed `.tghost`, and the find itself opens in the Semaphore's drawer, lent over the Board. The count beside the Call Board's mark in the ring is `.oa-n`. On CoProg a row is a partnership's Horizon topic, its cluster call's chip `.hcc` before its title. The Atlas switch is `#taseg` beside the box; switched on, `#hdr.atlas`, the keywords stand in `#tabox` (`#tachips`, `#taq`), Filters is `#tafbtn` over `#tafilt`, and the results replace `.wrap` in `#taview`, everything in it under `.ta`: how each keyword was read `.tamap`, the strip of when `.tawhen` with a dot `.tdotn` per result, and the Topic Atlas's cards `.taresults` › `.card`; its reader body is wrapped in `.ta` too. The decisions behind them are in
[call-board](notes/call-board.md).

**The Atlas** — `#app` › `header` carries `#tab-search`, `#tab-browse`,
`#tab-walk` and `#tab-news`, and `#editsBtn`, which opens the list of edits; the
settings are `#rail`, folded to the strip `#railOpen` and sliding out over
`#main` from it unless pinned beside it; `#dossier` is the
researcher panel, which the bridge also lends to the other four rooms.

The graph is a generated file and is never written to. What the room has
of its own is a list of **edits** laid over it — cuts, weights, merges,
added links, and keywords assigned by hand — rebuilt from that list on
every change, which is why any one of them undoes by being dropped.
A finding accepted from **News** is an edit too: a `fact` hangs off a
researcher by name and shows under **Since the database** on the dossier
(and, when it says they left, as a label on their name in Browse); a
`newcomer` is someone the build never saw, listed under their group with
no dossier until the data file is rebuilt. Neither touches the graph. A
passage reaches the description only by **add to description**, which
opens the editor with it appended for Mark to reword.

A researcher's **rank** — full, associate, assistant professor — is an edit
of the same kind, one per person, and it is the only field of theirs the
source data has none of: the spreadsheet the graph was built from carries
no rank column and only 35 of the 152 descriptions happen to say one, so
every rank in the Atlas was either accepted from a Position finding whose
summary opens with the rank or pressed in by hand on the dossier, where it
stands at the front of the affiliation line and says on hover which of the
two put it there. A new rank replaces the old rather than stacking on it.

Two more records hang off a researcher by name, one each, the newer
replacing the older, and touch nothing in the graph: their **email
address** (`email`), behind ✉ Email on the dossier, and Mark's **notes** on
them (`note`), the box at the top of the dossier, kept a moment after he
stops typing. The data file has no addresses; they come from a To line
copied out of Outlook and pasted on any dossier or under Edits, matched to
researchers by name and shown before anything is kept. Being edits, they
ride where his other edits ride — this browser and the `atlas` cloud row
behind the login — and never in the repository. The Edits box leaves both
out, and its Clear all keeps them.

A keyword is assigned on a researcher's dossier, behind the small **edit**
on its own keyword heading rather than the graph-wide **Edit graph** — that
toggle guards cuts and merges, which are careful acts, and writing down
what a colleague works on should not cost arming the whole graph. The word
is written onto the end of that researcher's declared-keyword line, so its
provenance reads like any other declared keyword. Selecting a few words
of the description offers them as a keyword through the same box, which is
how words Mark wrote into a description reach the graph.

**Where a hand-assigned keyword is filed** is decided by the two rules
that made every term-to-concept edge in the file: the word *is* one of the
names a concept answers to, or one of those names sits inside it as a whole
run of words. Run forwards those rules are looser than whatever the build
did, so the file's own placements are read exactly as they always were and
never recomputed, and the rules decide nothing except where Mark's own
words go. The box says where a word will land while it is still being typed.

**Notes** — the bar is `.nt-bar`; the left column is `#nt-shelf`, headed
by `#nt-new`, the hazelnut that writes a note, whose spines are `.nt-b` and
whose `#nt-make` builds a book from a tag typed into it; the open book is
`#nt-book`, its page tabs `.nt-ptab` over one `.nt-sheet` of
`.nt-rowline`s with `.nt-leaves` showing under it, and a note is a
`.nt-pill` that opens a `.nt-panel` under its row. `.nt-arrange` at the foot of the sheet puts the
book's `.nt-pin`s and colour swatches on screen. `.nt-nut` is the room's
hazelnut, worn by `#nt-new` and by four places you only meet in passing.
`#nt-pop` is the one box the tag autocomplete, the make-a-book suggestions
and those swatches are drawn in. A table pasted into a note grows by
`#nt-tbar`, two buttons that stand beside whichever table the caret is in
— outside `.nt-body`, because everything inside that element is the note.
`.nt-copy`, beside `edit` in the panel's head, puts the whole note on the
clipboard; ctrl on a `.nt-pill` does the same without opening it.

One collision worth knowing, because it is the thing the scoped document
exists to survive: **the Call Board's topic list is `#ledger`**, and has
nothing to do with the Ledger room. Say "the Call Board's topic list"
rather than "the ledger" when that is what you mean.

---

## Working on it

```
index.html            the site's front door: sends the bare address on to one-app/
.nojekyll             tells Pages to serve the files as they are, untouched
one-app/
  index.html          the page, and the list of parts — order here is load order
  icon.png            the home-screen icon; bundle.py folds it into a build

  shell/
    shell.css         the chrome: ribbon, panes, each room's tuning
    hub.js            the scoped document and window; mounting; the bus
    venues.js         the venue maths: a venue's window, a site, a call's runs —
                      read by the Semaphore and Mark's Place
    leadsheet.js      a brokerage entry laid out to send, as a PDF or for an
                      email — read by the bridge and Mark's Place
    bridge.js         everything the rooms say to each other
    boot.js           says out loud when a room fails to load

  rooms/
    ledger/     ledger.css     ledger.view.js     ledger.js
    semaphore/  semaphore.css  semaphore.view.js  semaphore.js
    callboard/  callboard.css  callboard.view.js  callboard.js
    atlas/      atlas.css      atlas.view.js      atlas.js
    notes/      notes.css      notes.view.js      notes.js

  data/
    atlas-graph.js              the graph
    callboard-topics.js         clusters, destinations, topics, calls
partner-watch/        Mark’s Place, a page of its own, and in pocket/ its phone version — see notes/partner-watch.md
topic-atlas/          the Topic Atlas, its page retired into the Call Board's Atlas switch (its address opens it): its topics with their texts (topics.js, the only copy, which the Call Board's reader shows), its two concept libraries (library.js, which Mark’s Place reads too) and its engine (textutil.js, scorer.js), which the Call Board's Atlas switch reads — see notes/topic-atlas.md
supabase/             the database's SQL, the two agents' gatekeepers, Partner Watch's copier and the Horizon check
tools/                the scripts below
```

Three files per room, always the same three: **paint** (`.css`),
**furniture** (`.view.js`, the room's markup), **behaviour** (`.js`). A
change to one room touches one folder. Line counts are deliberately not
written here — `MAP.md` carries them and is regenerated, so it cannot go
stale.

**What a change touches**

| | |
|---|---|
| a new function in a room | that room's `.js`, plus its `.view.js` if it needs a button |
| restyling a room | that room's `.css`, alone |
| something across all of them | `shell/shell.css` — and nothing in a room |
| one room reaching another | `shell/bridge.js`, always, and nowhere else |
| another room | `rooms/newroom/` with the three files; a `<section class="pane" id="pane-newroom" data-pane="newroom">` and three tags in `index.html`; its name in `boot.js`'s `EXPECT`, in `bridge.js`'s `ROOMS`, `TITLES` and `ROOM`, and in `lint.py` and `smoke.js`; a glyph and the two numbers at `#oa-ring` in `shell.css`. The Hub needs nothing |
| new data | replace the file in `data/`. Never hand-edit one — each is a single generated line |

Two generated indexes answer the two questions that come before any
change. **`MAP.md`** lists every section of every file with its line
number — reach for it before asking to see a file, since a room's every
division is named there. **`NAMES.md`** answers the question that comes
first: *where is the thing I am looking at?* Every class and every id,
where it is painted and where it is written, plus two orphan lists.
Both take their file list from `index.html`, as `bundle.py` does, so a
room added to the page is indexed with no further edit — the Notes room
shipped missing from both because they each carried a list of their own.

```
python3 tools/finish.py                       # closes every change — see below
python3 tools/lint.py    one-app/             # the four rules, checked
python3 tools/outline.py one-app/ MAP.md      # after adding a section
python3 tools/names.py   one-app/ NAMES.md    # after adding a class
python3 tools/bundle.py  one-app/ one-app.html # a single file to send
python3 tools/build.py                        # the same fold, filed in builds/
node     tools/smoke.js  one-app/index.html   # does every room boot?
node     tools/seed.js   one-app/index.html   # something to look at
```

Each tool's own docstring says how it works; what follows is only what
each is for. `finish.py` is the one to run, and it runs the rest in order,
stopping at the first failure so a change that breaks a rule never
becomes a release. It knows where it is: in the repository it ends with
the tree opened in a browser and every room asked whether it started, and
in a folder without `.git` — the OneDrive way — it ends with a build.

`lint.py` is the first three rules above made mechanical, plus the 768px
floor, a check that everything `index.html` names exists and that
`boot.js` expects every room, and a warning when either index is older
than the code. Every one of those fails silently at the next reload, in
one room only, which is why they are worth a second reader that never
gets tired. The rest — rule 4, the bridge rule, contrast — have no check
and rely on whoever is doing the work.

`build.py` is the OneDrive way's last step, kept so that way stays open.
There the tree was edited and a single file was used — **an edit reached
the bookmark only through a build** — so every change ended folded into
`builds/`: `one-app-latest.html`, the bookmark, beside that day's copy and
`one-app-previous.html`, the undo. In the repository none of that exists:
Pages serves the tree, and git is the undo and the history. `builds/` is
kept out of the repository, like everything else made from Mark's data.

`seed.js` is the one to reach for first when the question is "does this
look right". The app keeps everything in the browser and nothing on disk,
so a fresh browser opens an empty ledger and an empty board — nothing to
photograph. It drives its own throwaway browser, writes a plausible few
weeks of work into it, and leaves screenshots of every room in a temporary
folder — outside this tree, so nothing it makes is ever committed — whose
path it prints. Name a folder as a second argument to override it. It
refuses to write into any browser that already holds real work, and it
must never be pointed at yours: `localStorage` is keyed by `file://` as a
whole, so there is only ever one journal per machine.

---

## Known limits — read before proposing a fix

**A room is still one file.** `ledger.js` cannot be split further without
either a build step or a rewrite into namespaces, because the whole room
is one closure sharing its variables. Its named sections make a
build-step split mechanical if it is ever wanted; it is not wanted yet,
and the indexes have taken most of the reason for wanting it away.

**`semaphore.js` is still one file, logic and DOM together.** The venue
maths it shares with Mark's Place — `vWin()`, `vState()`, `vHeat()`, the
site's reading and `callRuns()` — went to `shell/venues.js` on 2026-10-24,
when Mark's Place stopped keeping a copy. What the room alone uses stays beside its rendering: `vPhase()`,
which knows Mark's Place's sites, and reading the
board itself (`tidyVenue`, `absorbVenues`). The gatekeeper keeps its own
copy of those last two and of the site's reading, since it runs in the
cloud.

**Two things in the tree are not original code**: `Hub.markup()` in
`hub.js`, and `shell/boot.js`, which announces a room that failed to
load — the price of twenty files instead of one.
