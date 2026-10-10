CLAUDE.md owns the steps; PROJECT.md owns why there is no build. This is
what happens on this side of the wire.

**Since 2026-10-10 the repository `Ben-Verheven/one-app` is the app.**
GitHub Pages serves `main` as it stands; the OneDrive folders are frozen as
the way back.

- **A Claude Code session starts with the clone in place.** A session
  started from the claude.ai project instead has to attach it: `add_repo`
  (owner Ben-Verheven, repo one-app, access push), then the shallow clone it
  prints with a ~10-minute timeout, then `register_repo_root` so CLAUDE.md
  loads next turn. The session's git
  proxy allows two git operations at a time; a parallel second clone 429s
  both.
- **`.claude/settings.json` is the session's own setup, which Mark added
  on 2026-10-10; JSON cannot say why, so it is said here.** At start it
  writes the identity CLAUDE.md names into the clone's git config, because
  a fresh clone commits as the container (`Claude <noreply@anthropic.com>`).
  It lets the routine commands run without asking: the tools, read-only
  git, the commit and the push to `main`, and the shell's looking commands
  (`cat`, `ls`, `head`, `tail`, `grep`, `wc`). A chained command asks unless
  every link is on that list, which is why the opening `git checkout main
  && git pull … ; cat notes/INDEX.md` asked each session until those were
  added. And it refuses the Read tool
  `one-app/data/`, which is now a spare guard: here a stray read of those
  files cannot end the session as it does the OneDrive way, because the
  tools cut long output off (tried 2026-10-10). A shell command shows its
  first 2 KB and parks the rest in a file, and Grep leaves out overlong
  lines; `head -c 300` still gives the shape. The session refuses to let the assistant
  write its contents (as self-modification), so a change to what it says
  is Mark's, made on GitHub's website.
- **Everything the tools need is already in the container:** node,
  Playwright and its Chromium. `finish.py` and `tools/pocket.js` run as
  they stand, about ten seconds each; installing anything is wasted time.
  The proxy refuses the jsdelivr CDN and Google Fonts, which is why the
  smoke reports a `net::ERR` it then ignores: the app comes up without
  either.
- **A push may print `fatal: expected 'acknowledgments', received
  'packfile'` / "push negotiation failed; proceeding anyway" and still land**
  (first push, 2026-10-10). Check with `git ls-remote origin main` against
  `git rev-parse HEAD` before believing either way; it goes through the
  same proxy as the push, where `gh` is not in every session.
- **GitHub's API answers repo-scoped requests only, and not all of those:**
  users are refused, and so are the Pages settings — they cannot be read
  or changed from here. Mark does those, or his Chrome does.
- **Test as the site, not only from disk:** `python3 -m http.server` at the
  repo root plus Playwright, the jsdelivr URL routed to an npm-packed
  supabase-js UMD and the project's host to a fake (see [cloud-sync](cloud-sync.md)
  for the fake). That is what catches a missing icon or a wrong relative path,
  which `file://` never does.
- **A fresh device takes a full cloud silently** (`projectCount` 0 here, >0
  there); the programme call the app makes for itself does not count. A test
  against an EMPTY fake cloud shows "Two copies have changed" on the second
  device instead — that is the test's empty cloud, not a bug.

**The way back — the OneDrive routine, as it ran until 2026-10-09.** Only
for when Mark asks to go back; CLAUDE.md says where his old project
instructions are. No shell on his PC: files cross by `device_stage_files` /
`device_commit_files` only, and commit takes files from
`/mnt/user-data/outputs/` only.

- Stage the whole tree (the three data files too), `tools/` and
  `builds/one-app-latest.html` (it becomes the undo), never
  `one-app-previous.html`. A second change in one session needs the
  workspace's `one-app-previous.html` removed before its build, or its undo
  skips the first change.
- **Write back only the files this change touched** — `finish.py --against
  <staged originals>` lists them. On 2026-09-02 a session wrote back files
  it had not changed, from a stale copy, and a whole cloud-sync change was
  gone within the hour.
- Re-list with `device_list_dir` right before committing and pass each
  listed `mtimeMs` as `expectedMtimeMs`; never carry an mtime forward.
  **OneDrive re-stamps files it has not changed**, so a refusal is not proof
  of an edit: diff the device copy first. Never force.
- Trust the workspace clock (UTC) for the build date, not the mtime of
  Mark's last-saved file (2026-08-26: three misdated builds).

See also [tools](tools.md), [pitfalls](pitfalls.md) and [cloud-sync](cloud-sync.md).
