#!/usr/bin/env python3
"""
build.py — cut the app as one file, and keep the ones to fall back to.

bundle.py is the machine that folds the tree into a single file. This is
the drawer the results are filed in. It runs bundle.py, stamps the result
with the date and time, and saves it:

    builds/one-app-latest.html         the bookmark, overwritten each time
    builds/one-app-<YYYY-MM-DD>.html   that day's last build
    builds/one-app-previous.html       the bookmark as it stood before

The bookmark must never move, or it has to be re-made after every build.
The day's copy is what a later day falls back to. It used to be a new
file per build — `-2`, `-3`, six of them on a busy day at over seven
megabytes each, most never opened again — so a second build on the same
day now replaces the first. What
that gives up, the undo of one change made earlier the same day, is what
`one-app-previous.html` is for: before the new bookmark is written, the
old one is kept under that name. Any single change can be undone by
opening it.

The old bookmark has to be HERE for that — the workspace's builds/ starts
empty — so stage `builds/one-app-latest.html` from the folder along with
the tree, and never `one-app-previous.html`: the previous copy is made
once per workspace, by the first build, and a second build must not turn
its own first attempt into the undo.

    python3 tools/build.py                    # one-app/ -> builds/
    python3 tools/build.py one-app/ builds/

Mark does not run this. It runs at the end of a change, in the
assistant's own workspace, and only the finished file is written back
into his folder. That is the whole reason it exists: the app is edited
as twenty files and used as one, and the step between the two has to
happen without him having to install anything.
"""
import re, sys, subprocess, tempfile, pathlib, datetime

HERE = pathlib.Path(__file__).resolve().parent
TREE = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else HERE.parent / 'one-app')
OUTD = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else HERE.parent / 'builds')

if not (TREE / 'index.html').exists():
    sys.exit('build: %s holds no index.html' % TREE)
OUTD.mkdir(parents=True, exist_ok=True)

# The day is the whole name. The stamp inside carries the time as well,
# because the same name now holds whichever build came last that day.
now  = datetime.datetime.now(datetime.timezone.utc)
day  = now.date().isoformat()
out  = OUTD / ('one-app-%s.html' % day)
mark = now.strftime('%Y-%m-%d %H:%M UTC')

with tempfile.TemporaryDirectory() as tmp:
    raw = pathlib.Path(tmp) / 'raw.html'
    r = subprocess.run([sys.executable, str(HERE / 'bundle.py'), str(TREE), str(raw)],
                       capture_output=True, text=True)
    if r.returncode:
        sys.exit('build: bundle.py refused —\n' + (r.stderr or r.stdout).strip())
    html = raw.read_text(encoding='utf-8')

# The stamp goes after the charset declaration, not above the doctype: a
# comment before the doctype puts old browsers into quirks mode, and the
# charset has to stay inside the first kilobyte to be honoured.
stamp = (
    '<meta charset="utf-8">\n'
    '<!-- one-app, built %s from the source tree.\n'
    '     A snapshot. The twenty files in one-app/ are the app; this is what\n'
    '     they came to on that date, folded into one piece for the bookmark.\n'
    '     Editing this file changes the snapshot and nothing upstream.\n'
    '     This line is also how you tell which build one-app-latest.html is. -->'
    % mark)
html, hit = re.subn(r'<meta charset="utf-8">', stamp, html, count=1)
if not hit:
    sys.exit('build: no charset meta to hang the stamp on — has index.html changed?')

out.write_text(html, encoding='utf-8')

# A real copy rather than a stub that forwards to the dated file: a stub
# would mean one file:// page navigating to another, which is exactly the
# move browsers have spent years narrowing, and it would cost a flash of
# blank page on every open. Seven megabytes is cheaper than that.
latest = OUTD / 'one-app-latest.html'
previous = OUTD / 'one-app-previous.html'
kept = False
if latest.exists() and not previous.exists():
    latest.replace(previous)
    kept = True
latest.write_text(html, encoding='utf-8')

print('%s  (%.1f MB)' % (out, out.stat().st_size / 1048576))
print('%s  (what the bookmark points at)' % latest)
if kept:
    print('%s  (the bookmark before this build — the undo)' % previous)
elif not previous.exists():
    print('no one-app-latest.html was here to keep as the undo — stage it from '
          'the folder before building, or one-app-previous.html is not refreshed')
