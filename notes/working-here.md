---
name: one-app-build-routine
description: How work reaches Mark's app since the move to GitHub (2026-10-10) — attaching the repo, pushing, what the proxy refuses — and the hard-won rules of the old OneDrive way, kept for going back.
---

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
- **A push may print `fatal: expected 'acknowledgments', received
  'packfile'` / "push negotiation failed; proceeding anyway" and still land**
  (first push, 2026-10-10). Check with `gh api
  repos/Ben-Verheven/one-app/commits/main` before believing either way.
- **`gh api` answers repo-scoped endpoints only, and not all of those:**
  `users/…` is refused, and so is `repos/…/pages` — Pages settings cannot be
  read or changed from here. Mark does those, or his Chrome does.
- **Test as the site, not only from disk:** `python3 -m http.server` at the
  repo root plus Playwright, the jsdelivr URL routed to an npm-packed
  supabase-js UMD and the project's host to a fake (see [one-app-cloud-sync](cloud-sync.md)
  for the fake). That is what catches a missing icon or a wrong relative path,
  which `file://` never does.
- **A fresh device takes a full cloud silently** (`projectCount` 0 here, >0
  there); the programme call the app makes for itself does not count. A test
  against an EMPTY fake cloud shows "Two copies have changed" on the second
  device instead — that is the test's empty cloud, not a bug.

**The way back — the OneDrive routine, as it ran until 2026-10-09.** Only
for when Mark asks to go back; his old project instructions are in
`one-app-source-cowork/supabase/project-instructions-onedrive.txt`.
No shell on his PC: files cross by `device_stage_files` /
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

See also [one-app-tools](tools.md), [one-app-notes](pitfalls.md) and [one-app-cloud-sync](cloud-sync.md).
