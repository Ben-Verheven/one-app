# One App — for the person who uses it

This repository is the app, and GitHub Pages turns it into a website.
One App and Mark’s Place are both in it. About a minute after a change is
saved here, every device has it.

**You do not run anything.** No install, no build, no command. That is the
whole point of the design, and it is the only promise this file makes.

---

## Where to open it

| | address | how |
|---|---|---|
| desk | `https://ben-verheven.github.io/one-app/` | bookmark it |
| iPad | the same address, in Safari | Share → **Add to Home Screen** |
| iPhone, Mark’s Place | `https://ben-verheven.github.io/one-app/partner-watch/pocket/` | Share → **Add to Home Screen** |
| desk, Topic Atlas | `https://ben-verheven.github.io/one-app/topic-atlas/` | bookmark it |

From the home screen, One App and Mark’s Place open full screen, with their own
icons and without Safari's bars.

**Log in once in each place.** The first time, the app asks for your email
and password: press the cloud chip in the Ledger, or Pocket asks by
itself. After that it stays logged in until you press Log out. A
home-screen app counts as a place of its own, separate from Safari, so it
asks once more.

**Your data is not in the website.** It lives in the cloud, behind that
login, and a copy is kept on each device. A stranger who opens the address
sees an empty app asking for a password. The website needs the internet;
the old bookmark in OneDrive still opens without it.

---

## Undoing a change

Say "undo the last change", or name the change. Every version ever saved is
kept, so going back further is the same request.

---

## Going back to the OneDrive way

Nothing in the OneDrive folders was changed by the move, and
`builds/one-app-latest.html` there still works, against the same cloud. If
you want to go back for good, say so. One session copies the latest app
back into the folder and builds it, and you paste the old project
instructions back in. They are kept in that folder, in `Claude outputs/`.

---

## When something looks wrong

Say what you are looking at and what it is doing. A screenshot is worth
more than a description, and it is worth more than a guess at which file
is at fault. Finding that is the assistant's job, and the repository
carries two indexes built for exactly that.

If a room is missing entirely, the app will say so itself: a message in
the top-right rail names the room that failed to load.

---

## What is in the repository

| | |
|---|---|
| `one-app/` | the app: the page, the shell, the rooms, the data |
| `supabase/` | the database's scripts and the two night agents' gatekeepers |
| `tools/` | scripts the assistant runs in its own workspace, never you |
| `CLAUDE.md` | how the assistant works here |
| `PROJECT.md` | how the app works, and every rule about changing it |
| `MAP.md`, `NAMES.md` | generated indexes: where everything is |
| `notes/` | what the assistant has learnt here, and the choices you made |

Your exports, the builds and the screenshots stay in OneDrive. Anyone can
read this repository, so nothing made from your data goes into it.

**`PROJECT.md` is the one that matters.** It is written to be read by
whoever is doing the work, human or otherwise. This file repeats none of
it, so that the two can never disagree.
