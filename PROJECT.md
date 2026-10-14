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

Pocket keeps its own pair beside it, for the same two jobs at its own
scale: `pocket/POCKET.md` (how Pocket is built and changed) and
`pocket/WRITES.md` (what it writes to the cloud).

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
There were phone layouts once; they are gone, and the phone has **Pocket**
instead — one file, `pocket/index.html`, Marketplace only, that shares
nothing with the tree except the cloud and a copy of the rotation maths
(`pocket/POCKET.md` says how that copy is taken). Do not add a breakpoint
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
first opened, because it builds several megabytes of Commission prose.
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
                               setTopics, setLeads, leadsChanged(),
                               snapshot(why), signedIn(), token() }
Hub.api('callboard')       → { topics(), openReader(), closeReader() }
Hub.api('semaphore')       → { state(), save(), renderAll(),
                               applyState(obj), leads(),
                               leadVerb(aid, lid, op, val), arenas(),
                               leadAdd(aid, v), allLeads(),
                               openArena(aid), escape() }
Hub.api('atlas')           → { openDossier(), G, state(), applyState(obj) }
Hub.api('notes')           → { state(), applyState(obj) }
Hub.api('semaphore-inbox') → { ready(), list(cb), decide(id, status, cb) }
Hub.api('atlas-inbox')     → the same three verbs over the Atlas's inbox
```

A room offers what another room or a tool actually asks for, and nothing
it might one day be asked for: an unused entry here is dead code no
scanner can see, because the name is spelled in the room that offers it.

One event, per room that holds a store of its own: **`semaphore:saved`**,
**`notes:saved`** and **`atlas:saved`**, emitted after every save so the
bridge can push that room to the cloud. And one from the Ledger,
**`cloud:session`** (`true` or `false`), when a login starts or ends. And
**`semaphore:project`**, with a name and links, when a lead is completed as
having become a project, in the Marketplace or on the Ledger's lead card.
And **`leads:excel`**, from the Excel button on the Marketplace's Leads, which
the bridge answers by writing every lead (`allLeads()`), open and closed,
into one .xlsx file — the same file again each time where the browser can
keep hold of one; the bridge's own comment says how.

What the bridge actually does: turns any researcher's name, written
anywhere in any room, into a link that opens the Atlas dossier over the
top of the room you are in; lends the Call Board's reader the same way, so
a project written for a Horizon topic reads that topic without leaving the
Ledger, and fills the socket the Ledger picks a topic from; fills a second
socket with the Marketplace's open leads, so the Ledger's board draws them as a
line of their own, every change made on a lead card there is made on
the Marketplace's own record, a lead can be started there, a lead's arena
opens in the Marketplace's drawer lent over the Ledger as the dossier is, and a
lead that became a project opens the Ledger's new project with its name and
links filled in; draws
the ring of rooms and the title; runs the page-change animation; and syncs
the Marketplace's board, the Notes room and the Atlas's edits through the
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
the site it is `https://ben-verheven.github.io`, which Pocket shares (no
key of Pocket's, all `pocket.*`, is one of these). So the site, a copy on
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
| `semaphore.v1` (+`-ts`, `-seen`, `-dirty`, `-sum`, `-base`) | the Marketplace's board: arenas, types and venues |
| `notes.v1` (+`-ts`, `-seen`, `-dirty`, `-sum`) | the Notes room: notes, book order, which of the two ways in, the tag ties, the colours chosen for tags, and what is pinned in which book |
| `hub.room` | which room to open on |
| `leads-excel-v1` | fingerprints of what the last weekly Excel held, so the next one can mark what is new; the file it wrote is kept as a handle in IndexedDB, `one-app-excel` |
| `hub.storage.*` | the Atlas's own edits, and their `-ts`, `-seen`, `-dirty`, `-sum` |

**A room joins the two doors out — cloud and Export — the same way:** it
answers `state()` and `applyState()`, emits `<room>:saved`, is handed to
`roomCloud()` in `bridge.js`, and is named in `ROOM_STORES` (`ledger.js`).
Cloud is one Supabase table, **`app_state`**, one row per store: `main` is
the Ledger, then `semaphore`, `notes` and `atlas`. The Ledger's **Export**
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
Ledger and in Pocket — and why the repository can be public. **Undoing the
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

**The Marketplace's two copies are put together instead** (since 2026-10-11),
because Pocket writes the same board from the phone: a card stamped there
while the desk held an unsent change used to set that change aside. The
room keeps a fourth key, `-base`, a fingerprint of what the cloud said at
the last exchange — a hash of every piece, not a third copy of the board —
and when both copies have moved, each piece (every field of every arena and
type, and each lead, link and date whole) comes from the side that changed
it. Only where both changed the very same piece does the cloud's win, and
then the restore point and the note are as before. A fingerprint that is
not of the exchange `-sum` names decides nothing: the room takes the cloud's
copy as the others do.

**A venue has the same id on every device that makes it**, because the
Marketplace makes them itself (since 2026-10-14). Its board keeps
`venues` beside `arenas` and `types`: the events and partner-search tools
Mark visits, each serving one arena or several. Pocket, an older copy of
the desk and an agent's finding can all still put a brokerage date or
link on an arena, so every read of the board turns those into venues
(`absorbVenues`), and two devices doing it apart would have put two
copies of every venue on the board once their copies were put together.
So an event's venue takes the date's own id, a tool's is made from its
site's address, and a visit's id is its day, one visit a day.

**The Atlas's scheduled agents read the web at night and write only to an
inbox of their own**, `atlas_inbox` (researchers' TU/e, Pure and own
pages: left, arrived, new position, new self-description, newcomers in a
group). The Marketplace's agent has one too, `semaphore_inbox`, where only
a new arena it suggests waits now (see the next paragraph); until
2026-10-14 its nightly rounds left everything there. Neither holds the
app's key. Each reaches Supabase through a gatekeeper edge function with a
password of its own (`semaphore-agent`, `atlas-agent`); the Atlas's copy of
its people is the `atlas_roster` table, seeded from the data file and
pasted again if the file is ever rebuilt. The app reads a finding when its
view opens — the Marketplace's **Dispatches**, the Atlas's **News** — and
answers it in the cloud first, then makes it an ordinary edit, so two
machines cannot accept the same finding twice. In the Marketplace,
whatever an accepted finding puts on an arena carries `foundAt` and is
marked new in the arena's panel until the panel is next shut; a brokerage
event or a tool it brings becomes a venue, as on every read. Where each
agent is told what to do is its scheduled task; the SQL and the functions
are in `supabase/`.

**The Marketplace's agent is no longer a nightly round** (since 2026-10-14):
its three scheduled tasks are deleted, and one task, **Semaphore agent
(on demand)**, has no schedule and runs when Mark fires it — from a Claude
session told what to check, which passes the request as the firing's text,
or with Run now, which does a round of its own. It no longer only suggests: the gatekeeper's `board` gives it the
whole board but the leads, and `edit` lets it add, change and delete dates,
an event's website, a card's links and brokerage links, the general tool and
the two texts straight on the board, which the room then takes in as it
takes Pocket's. What `edit` has no op for it cannot do: delete an arena,
change an arena's name, type, tags, weight or freezer, the types, the leads,
Mark's `memo` or his stamps. A new arena is still a Dispatches finding.
What it changed is told only in its own report, and every write leaves a
copy in `app_state_history`.

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

1. **Order in `index.html` is load order.** Hub, then data, then each
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
   returns its JSON through a function so the Call Board's prose is still
   only built on first entry.

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
| the leads line, last on the board: the Marketplace's open leads, the box of undated ones beside its name, a lead's card | `.hz-call-leads`, `.hz-lead-mark`, `.hz-leads-undated`; `.lead-card` |
| the effort strip under the grid | `.hz-effort`; one day is `.hz-eff`, and `.hz-eff-unplanned` closes the row |
| the list that opens under the board | `#hz-detail`, holding `.todo-card-later` cards |
| every deadline in date order | `#hz-agenda` |
| the timeline face | `.tl2-wrap` |
| the contribution tracker, over the board | `.ct-sheet` |
| any box that opens over the room | the `pf-` family — `pf-host`, `pf-box`, `pf-head`, `pf-body`, `pf-foot` |

**The Marketplace** — the Semaphore until 2026-10-14, and still
`semaphore` in the code: its pane, its files, its store and its cloud row
kept the name, so nothing stored had to move.

| on screen | in the code |
|---|---|
| the room's scroller — the page itself does not scroll | `#semscroll` |
| the header: the view switcher (Now · Board), Leads beside it, Search, Types, + Venue, + Arena, Dispatches and the cloud chip | `header.top`; `#viewseg`, `#leadsBtn`, `#searchBtn` and its box `#search`, `#dispatchBtn`, `#semcloud` |
| Now, the Board, Leads (on the wall), Dispatches, the freezer | `#now`, `#board`, `#wall`, `#dispatch`, `#freezer` |
| Now: the axis over it, sticky; one venue's row, its name and the arenas it serves, its strip, its stamp and Go | `.vaxis`; `.vrow` = `.vname` (`.vnm`, `.vchips`) + `.vtrack` + `.vend` (`.vstamp`, `.vgo`) |
| on a venue's strip: the open stretch, the meeting days, a tool's line, the visits, today, due | `.vbar`, `.vmeet` and `.vdia`, `.vbar.tool`, `.vtick`, `.vnow`, `.vpulse` |
| Later, folded; Limbo — its fog, its ghost — and the venues in it when open | `.vlater`; `.culimbo` › `.culb` (`.culfog`, `.culgh`, `.culc`) |
| the visit question, under a stamp and at the foot of the room | `.vask.pop`; `#vbar` › `.vask.bar` |
| the month axis over the board, sticky, and the heading that names and chooses the order (My order / By date) | `.axisrow` = `.corner.sorter` (`.whsort`, its menu `.whmenu`) + `.axis`; a month is `.mcell` |
| one arena type's group on the board, its heading | `.grp`, its heading `.ghead` |
| the types, managed — opened by Types: a type's line and its grip, its arenas one per row, its colour dot, the copy that follows a drag | `#typesModal` › `#tylist` › `.tyblock` (`.tyline` › `.tygrip`, `.tyarenas` › `.tyrow`); `.lcolwrap.tycol`; `.tyghost` |
| one arena's row, and its tools' diamond against the names' edge | `.row` = `.cell.name` + `.lane`; `.toolmk` |
| a date on a lane | `.mk` — `.bk` a venue (`.bk-fixed`, `.bk-unc`, `.bk-band`, its open stretch `.bk-win`), `.cl.rb` a call's bar, `.now` today |
| the drawer, holding an arena or a venue; an arena's venues in it; a link's cross, and the press that makes a brokerage link a venue | `#card` and its `.scrim`; `.avlist` › `.avrow`; `.ldel`, `.lmake` |

**The Call Board** — the cluster row is the bar, `#hdr` › `.tabs`; the
controls under it are `.hd-controls` and `#ovbar`; the chronological chart
on the right is `#tl` inside `.tl-sticky`; a topic opens in `#reader`.

**The Atlas** — `#app` › `header` carries `#tab-search`, `#tab-browse`,
`#tab-walk` and `#tab-news`; the two columns are `#rail` and `#main`; `#dossier` is the
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
    callboard-descriptions.js   the Commission's prose
pocket/               Pocket — see pocket/POCKET.md
supabase/             the database's SQL and the two agents' gatekeepers
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
node     tools/pocket.js                      # Pocket's check — see pocket/POCKET.md
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
maths — `vWin()`, `vState()`, `vEvery()` and what they lean on — sits in
the venues section beside the rendering, and the call runs the board
draws (`callRuns()`) elsewhere again. Pocket carries a copy
of it, taken by hand (`pocket/POCKET.md`). If Pocket ever wants to read
the same code rather than a copy of it, splitting that room into a
pure-logic core and a DOM half is the thing to do, and it is an
afternoon.

**Two things in the tree are not original code**: `Hub.markup()` in
`hub.js`, and `shell/boot.js`, which announces a room that failed to
load — the price of twenty files instead of one.
