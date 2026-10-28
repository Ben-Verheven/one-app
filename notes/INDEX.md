# Notes — what no code file records

Bugs already paid for, constraints found the hard way, how work reaches the
app, and the design choices Mark made that a later session must not quietly
undo. They moved here from the claude.ai project's memory on 2026-10-10, so
that every session reads them, whichever way it was started.

**Read the note for the part you are about to touch, before touching it.**
Not all of them, and not every session: this list says which is which.

What goes here is what is generally true of the project and would still be
worth reading in six months. A decision of one conversation is either
already in the code or PROJECT.md, or about to change. A fact that
PROJECT.md, CLAUDE.md or a code comment already carries does not go here,
not even summarised. When a change makes a line here untrue, fix the line
in the same commit: a note that names removed code is trusted anyway.

Like the whole repository these are public. Nothing from Mark's own data
goes in.

| note | what it covers |
|---|---|
| [animation.md](animation.md) | Every way the app's movements — the day's cards, the hover label's dots, and the panels that slide in — have gone wrong, and the rules that came out of it. |
| [atlas-agent.md](atlas-agent.md) | The Atlas people-watch agents — Mark's decisions on rhythm, scope and where findings land; the Semaphore's agent, stopped since 2026-10-23, is in [semaphore-decisions](semaphore-decisions.md) |
| [atlas-room.md](atlas-room.md) | Mark's decisions on how the Atlas room reads and moves — Browse's keyword chips and department colours, the sliding tree, the map's card |
| [atlas-graph.md](atlas-graph.md) | What was measured about the Atlas's generated graph — how words reach concepts, what the rules cannot recover, what a hand-written description may and may not touch, how his own words are marked, and the boot race a room with an async store can lose. |
| [call-board.md](call-board.md) | Mark's decisions for the Call Board as the map of every call — Horizon tabs as their own arenas, the arenas' tabs and their rows, the brokerage lanes that went back to the Semaphore, the freezer, judging new arenas one at a time, ChatGPT's search for calls, and the phases agreed and not yet built (the rest of the three ChatGPT searches, the Ledger, the Topic Atlas) |
| [check-the-app-first.md](check-the-app-first.md) | when a brief says "the same shape as X", open X in the running app before designing anything |
| [cloud-sync.md](cloud-sync.md) | How the app's Supabase sync (the Ledger's and the three rooms' in bridge.js) went wrong and what it does instead — read before touching sync, restore points or the history table. |
| [github-move.md](github-move.md) | Why One App moved to GitHub, and the conditions Mark set for it: free plan, data behind a login, as efficient as before, and a way back |
| [marks-notes.md](marks-notes.md) | what Mark's notes actually are — general memory in short names — and the tag vocabulary they are filed under |
| [notes-room.md](notes-room.md) | the decisions behind the Notes shelf, its note panel, its pasted tables and its nuts that Mark made himself, so a later session does not quietly undo them |
| [partner-watch.md](partner-watch.md) | Mark’s Place, the brokerage sites' partner-search entries copied nightly and browsed on a page of their own and on the phone — what Mark asked for, what he chose and dropped, how the copier reads each platform, and what is left for later |
| [panes.md](panes.md) | The `pf-` pane shell every box in the Ledger that opens over the room wears, the veil the shell needs, why a pane must fit on a laptop, and the decisions inside the two project panes. |
| [pitfalls.md](pitfalls.md) | Bugs already paid for in the One App tree — post-mortems and constraints found the hard way, which no file in the folder records. |
| [project-card.md](project-card.md) | Decisions behind the project card — the head band and its three links, the project's own groups and their PIs, the position tree, the dates box, where the person-months live, the three-section edit pane, how a jump says which card it landed on, and the rewrite Mark reverted. |
| [semaphore-decisions.md](semaphore-decisions.md) | Mark's decisions for the Brokerage Semaphore — the way in, venues and their windows, Venues' sections, visits, one category of sections, new and changed venues checked in their card, ChatGPT's search for brokerage and the agent before it, types, leads and the weekly Excel; and, in a paragraph each, the Board that went to the Call Board and the arena cards and Pocket that venues replaced |
| [show-the-options.md](show-the-options.md) | draw the alternatives before building — and show them for a plain list of changes too, not only when Mark asks for a mock-up |
| [spines.md](spines.md) | Call deadlines drawn on the board's own rows, the programme's per-project dates beside them, the tie that binds a todo to a key date, and the call backbone that lays out a new call — including the project-level design that was scrapped, and the from-a-call design that replaced it in turn. |
| [testing.md](testing.md) | test the empty and nearly-empty case, and how to drive a throwaway browser here without wasting an afternoon |
| [todo-card.md](todo-card.md) | The design of the todo card — what sits on its always-visible row, what the action row says and in what order, and every rearrangement Mark has already rejected. Read before moving anything on it. |
| [topic-atlas.md](topic-atlas.md) | Mark's Topic Atlas, brought into the repository so Mark's Place shares its concept libraries, and why it stays a plain program |
| [tools.md](tools.md) | What the One App indexers can and cannot be trusted to say, and the standing practice around them — the part their own docstrings and generated prose do not carry. |
| [working-here.md](working-here.md) | How work reaches Mark's app since the move to GitHub (2026-10-10) — attaching the repo, pushing, what the proxy refuses — and the hard-won rules of the old OneDrive way, kept for going back. |
