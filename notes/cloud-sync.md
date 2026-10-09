---
name: one-app-cloud-sync
description: How the app's Supabase sync (the Ledger's and the three rooms' in bridge.js) went wrong and what it does instead — read before touching sync, restore points or the history table.
---

PROJECT.md owns the keys and the rule. This is the post-mortem.

**The bug that started it, 2026-09-02.** Mark's second PC held a
fortnight-old journal and would not take an update: "it says it's newer".
The download compared `pj-journal-v3-ts` — the moment that BROWSER last
wrote to disk, stamped by every `save()` — against the cloud row's
`updated_at` — the moment the CLOUD was last written. Different
quantities. A device opening an old copy migrates it on the way in and
saves, stamping today; the cloud's answer lands a moment later and loses
to it, and loses again at every open after. **The older the copy, the more
certainly it migrates at startup and locks itself out.** A comment in the
old code had seen half of this and patched only the case where the local
copy was empty.
How to apply: never decide "which copy is newer" from a clock this machine
wrote. The two facts are kept explicitly now and the four cases need no
comparison at all.

**Three ways an upload was lost, all silent, all fixed the same day.** The
push is debounced 1.2s after the last change and nothing flushed it, so
the last edit of a session routinely never left the machine — and the
local save had happened, so that machine looked perfectly right. A failed
first read blocks uploads on purpose (never write over a cloud you were
not allowed to read) but nothing retried it and nothing said so, which
cost a morning's work. A failed push said "will retry on the next change",
and the change that matters is usually the last one of the day.
How to apply: the flush on `pagehide`/`visibilitychange` is a courtesy;
**`pj-cloud-dirty` on disk is the actual safety net**, because it survives
the page. Anything new that can lose a write should ask what outlives the
page, not what runs before it closes.

**`bootDone` in ledger.js is what tells housekeeping from Mark.** Reading
the journal, upgrading it and running the within-schema migrations all go
through `save()` exactly as an edit does. Rather than mark every call
site, the room says when it has finished starting; before that a save is
the app tidying up after itself, after it a save is Mark and sets the
dirty flag. Anything new that saves at boot inherits this for free — and
anything that ought to count as a change must happen after boot.

**`roomCloud()` in bridge.js was believed to be the better version, and was
not** (found 2026-09-15): it stamped `-ts` from this machine's clock on
every save, never retried a failed read, and pushed without looking. It now
keeps the Ledger's two keys per room plus `-sum` (PROJECT.md owns the
rule). Lesson: a comment or note saying code already does X is a claim to
check against the code, not a fact.

**A stale tab is the multi-device killer, not a stale device.** Seen/dirty
alone does not stop a tab open since yesterday from uploading over the
other machine's morning: nothing re-reads the cloud mid-session. Every
upload now asks for the cloud's `updated_at` first, and so does coming back
to the page. `updated_at` comes back as `+00:00` while this app writes `Z`:
compare stamps as instants, never as strings.

**Views are not work.** Semaphore's `ui` and Notes' `view` ride the same
save as real edits; sending them filled the twenty-deep history with tab
clicks. A room names its view keys (`ui` in the spec) and they are left out
of the comparison.

**The history table is optional and must stay optional.** Every insert is
silent on failure and gives up asking after the first refusal: the upload
itself succeeded, and a missing `app_state_history` must never read as a
broken sync.

**Restore points are capped at three, and the cap is not timidity.** A
journal of Mark's is ~400 KB and `localStorage` is five megabytes for the
whole of `file://`, shared with the live journal and three room stores. A
ring that grew until it fell over would take the app's own save down with
it, so `write()` drops its oldest — and in the end itself — rather than be
the reason a real change could not be written. Depth belongs in the cloud
history. A snapshot taken from the cloud carries the row's `updated_at` as
its key, so reopening the app cannot spend all three slots on one version
— a note said so for weeks before the code did (fixed 2026-09-15).

**Testing sync without an account:** a fake `window.supabase` injected with
`page.addInitScript` before the page loads walks every branch
deterministically. Two browser contexts are two computers: back the fake
with one object on the Node side through `context.exposeFunction`, so both
see the same cloud, and have it hand `updated_at` back in the `+00:00`
spelling. Worth covering: old copy vs newer cloud, both changed, cloud
unchanged and dirty, empty device, a refused read and its retry, a stale
tab, a view-only change, both ways a page goes away — and one context
running the OLD build from the staged originals, to prove the upgrade
path. Note that a synthetic
`visibilitychange` proves nothing unless `document.visibilityState` is
also overridden to `'hidden'` — the handler reads it.

See also [one-app-notes](pitfalls.md) and [testing-this-app](testing.md).

**The login (2026-10-09) — traps found while building it.** PROJECT.md owns
the design; these are the parts only testing showed.
- supabase-js with no session silently sends the bare anon key, and the
  locked rules answer that with an EMPTY result, which every sync here reads
  as "no copy yet" (PGRST116) and then tries to push. So nothing may ask the
  cloud without a session: the Ledger checks `getSession()` before each read
  and look (`live()`), the bridge's clients use `accessToken` that REJECTS
  when logged out.
- One session-holding client per page. A second client renewing the same
  refresh token makes Supabase treat it as reuse and end the session for
  every device. Tested with a fake server that counts reuse: must stay 0.
- After a refused or unreachable renewal the library keeps the old session
  until its access token expires, and refuses every `getSession()` for 60 s
  (REFRESH_FAILURE_COOLDOWN). Quick retries all land in that minute — retry
  spacing now reaches past it, and TOKEN_REFRESHED pushes what is owed.
  A network failure (no 4xx) must NOT log Mark out; a 4xx answer does.
- Supabase's built-in mail: 2 messages/hour, team addresses only — why the
  login is a password, not an emailed code.
- Testing: real supabase-js (npm pack → dist/umd, routed in place of the CDN
  URL) against a page.route fake of /auth/v1 and /rest/v1 beats a fake
  `window.supabase`. The lock SQL was tested in a local Postgres 16
  (/usr/lib/postgresql/16/bin, run as user postgres in its own home dir) with
  mock anon/authenticated/service_role roles and an `auth.uid()` reading
  `request.jwt.claims`.
- Headless Chromium on file:// occasionally lost ALL localStorage on a
  reload right after writes (Pocket test, ~1 in 4); not reproducible with
  plain keys — treat as harness noise, not a code bug.
