# Working on One App

One App: one HTML page, five independent vanilla-JS rooms: Ledger, Brokerage Semaphore, Call Board, Atlas and Notes. Mark’s Place, the brokerage sites' partner-search entries, is a page of its own in `partner-watch/`, with its phone version in `partner-watch/pocket/`. No framework, no bundler, no build step. GitHub Pages serves this repository as it stands on `main`, so a push is live about a minute later. The tree must still run from file://, because the OneDrive folder is the way back.

Read PROJECT.md first. It is the only description of how the app works and why every rule below exists. This file says how to behave; those say how the apps behave.

## Who you are talking to

I am not a programmer. Call me a vibe-coding enthusiast: eager to learn, but not knowledgeable at all in programming language or jargon. Keep things plain for me.

Do the work yourself. Never hand me a task that needs a programmer. Explain what you did in plain words.

Answer as clearly and simply as this, which worked (2026-10-29): a few short headings; under each, what a thing is and does in a line or two; then what you recommend and one plain question. No code words, and file names only where they help me. Go deeper only when a choice needs it.

## Working in the repository

This clone is the only copy worked on. Pages serves only main, so work pushed anywhere else never reaches me. The session's start hook already puts the clone on main and pulls (notes/working-here.md); don't run it again. My computer is not needed, and the OneDrive folders are not touched.

Commit as `Ben-Verheven <299968296+Ben-Verheven@users.noreply.github.com>`. The account refuses pushes that carry a private email.

Don't read the two files in one-app/data/, or the Topic Atlas's topics.js and library.js: each is one line of raw data, megabytes long, with nothing in it to learn. First 300 characters if you need the shape. The OneDrive way, a whole read ends the session. Here the tools cut it off first (notes/working-here.md), so a slip wastes a little room and nothing more.

Before touching a part, read its note: notes/INDEX.md lists them, one line each. They hold the bugs already paid for and the design choices I made, which nothing else records.

Find before you read. NAMES.md gives every class and id and where it lives: grep it, never read it. MAP.md gives every section with its line number; read that range. Opening a whole room file should be a decision you can defend.

Start visual questions with a picture: node tools/seed.js one-app/index.html photographs every room in a throwaway browser.

Edit in place. Never rewrite wholesale, reformat, rename, or modernise anything you were not asked to touch. The diff holds the change and nothing else. No scratch files in the repository.

Git is the undo. "Undo" means `git revert` of that change, pushed. Never rewrite history, never force-push.

The repository is public. Nothing made from my own data goes in: no exports, builds or screenshots (.gitignore holds them out). Check every change for passwords and keys before committing. The anon key in `BUILT_IN` is public by design; nothing else is.

## Rules that must not be broken

PROJECT.md says why each exists. tools/lint.py checks the first three and the 768px floor; the rest rely on you.

Order in index.html is load order: Hub, data, each room's view before its script, bridge, boot. Never type="module", never fetch() a local file. Plain <script src> only. A .view.js holds exactly two backticks, the pair around its markup, and no ${. Cross-room work goes in shell/bridge.js via Hub.expose / Hub.api / Hub.emit. A room never reaches into another room. Desk and iPad only. No breakpoint below 768px, ever, and a narrow desktop window is not a case to serve. (hover:none) and (pointer:coarse) are a different question and still matter. Contrast is set as colour, never as opacity on an already-quiet colour. Check small grey text against the ground it actually sits on. House style: full prose comments saying why, present tense, naming the bug that forced the decision. Write them that way or write none.

## Don't write the same thing twice

PROJECT.md opens with the documents and what each one owns. Put a fact where it belongs and link from the others. Never restate it, never summarise it somewhere handier, never add another document. Numbers the tools can count, like lines and sections and sizes, go only in the generated indexes.

## Closing a change

Run `python3 tools/finish.py`: indexes, lint, and every room asked whether it starts. Then commit with a plain message saying what changed and why, `git pull --rebase`, and `git push origin main`. A refused push means newer work is there: rebase onto it, never force. Tell me it is live in about a minute.

## Going back to OneDrive (only when I ask)

Copy the repository's one-app/, topic-atlas/, tools/ and documents into my folder one-app-source-cowork. Then close it there the OneDrive way: finish.py builds in a folder without .git. The project instructions for that way are in one-app-source-cowork/Claude outputs/project-instructions-onedrive.txt.

## Notes, not memory

What is learnt about this project goes into notes/, in the note for that part, committed with the change. No assistant memory, which other sessions cannot see. Don't write one-time things there. Correct any line a change makes untrue. A fact occurs once: in this file, PROJECT.md, a note or a code comment, never two of them.
