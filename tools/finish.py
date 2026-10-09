#!/usr/bin/env python3
"""
finish.py — the last act of any change, in one command.

Closing a change here is five steps in a fixed order, and four of them
are easy to skip without noticing. The map goes stale the moment a line
moves. The lint catches the rules nobody can hold in mind. The build is
what Mark actually opens, and it lands as `one-app-latest.html`, which is
where his bookmark points, beside the day's copy and the previous
bookmark (see build.py). Writing back only the day's copy leaves the
bookmark on yesterday's app, which is the commonest way to get this wrong
and the reason this script exists.

    python3 tools/finish.py

In order: regenerate MAP.md, regenerate NAMES.md, lint the tree, fold it
into builds/, then open the build in a headless browser and ask every
room whether it started. It stops at the first step that fails, so a
change that breaks a rule never becomes a build.

In the GitHub repository (a folder holding `.git`) there is no build and
no bookmark to rewrite: GitHub Pages serves the tree itself, and git is
the undo. There it regenerates the indexes, lints, opens the TREE in the
headless browser instead, and ends by saying to commit and push. The
OneDrive folder has no `.git`, so the same command still builds there —
which is what keeps the way back open. `--build` builds in the repository
as well, for a single file to carry somewhere.

    --skip-smoke   file the build without opening it (no node, or no time)
    --anyway       build even though the lint found errors
    --against DIR  the folder as it was staged; the list at the end then
                   names exactly the files this change edited, instead of
                   leaving them to memory

Mark does not run this. It runs in the assistant's workspace, and the
list it prints at the end is what has to be written back to his folder.
"""
import subprocess, sys, pathlib, json, time

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
TREE = ROOT / 'one-app'
OUTD = ROOT / 'builds'

web        = (ROOT / '.git').exists() and '--build' not in sys.argv
skip_smoke = '--skip-smoke' in sys.argv
anyway     = '--anyway' in sys.argv
against    = (pathlib.Path(sys.argv[sys.argv.index('--against') + 1])
              if '--against' in sys.argv else None)

def run(what, cmd, fatal=True):
    """Run one step, print what it said, and stop the line if it failed."""
    print('\n\033[1m· %s\033[0m' % what)
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    out = (r.stdout + r.stderr).strip()
    if out:
        print('\n'.join('    ' + l for l in out.split('\n')))
    if r.returncode and fatal:
        print('\n%s failed. Nothing further was done.' % what)
        sys.exit(1)
    return r

t0 = time.time()

run('MAP.md',   [sys.executable, str(HERE / 'outline.py'), str(TREE), str(ROOT / 'MAP.md')])
run('NAMES.md', [sys.executable, str(HERE / 'names.py'),   str(TREE), str(ROOT / 'NAMES.md')])

lint = run('lint', [sys.executable, str(HERE / 'lint.py'), str(TREE)], fatal=not anyway)
if lint.returncode and anyway:
    print('\n    …building anyway, because --anyway was given.')

if not web:
    run('build', [sys.executable, str(HERE / 'build.py'), str(TREE), str(OUTD)])

latest = TREE / 'index.html' if web else OUTD / 'one-app-latest.html'
previous = OUTD / 'one-app-previous.html'
dated  = max((p for p in OUTD.glob('one-app-2*.html')),
             key=lambda p: p.stat().st_mtime, default=None)

# Whether it boots is the only question a build has to answer here, and
# it is the one question that cannot be answered by reading. The tunnel
# error is expected: this sandbox has no route to the Supabase CDN or to
# Google Fonts, and the app is built to come up without either.
if skip_smoke:
    print('\n\033[1m· smoke\033[0m\n    skipped.')
else:
    r = run('smoke', ['node', str(HERE / 'smoke.js'), str(latest)], fatal=False)
    try:
        report = json.loads(r.stdout)
        cold = [k for k, v in report['rooms'].items() if not v.get('started')]
        noise = [e for e in report.get('errors', [])
                 if 'ERR_TUNNEL_CONNECTION_FAILED' not in e
                 and 'ERR_NAME_NOT_RESOLVED' not in e
                 and 'net::ERR' not in e]
        if cold:
            print('\n%s did not start. The build is on disk but do not send '
                  'it.' % ', '.join(cold))
            sys.exit(1)
        print('\n    all %d rooms started.' % len(report['rooms']))
        if noise:
            print('    console errors worth a look:')
            for e in noise:
                print('      %s' % e)
    except (ValueError, KeyError):
        print('\n    smoke said nothing readable — check node and playwright.')
        if r.returncode:
            sys.exit(1)

# The repository's own history replaces the list below: git knows exactly
# which files this change touched, and a push that meets newer work is
# refused rather than written over it.
if web:
    print('\n\033[1m· commit and push\033[0m')
    print('    git status shows what this change touched; the site follows')
    print('    about a minute after the push.')
    print('\ndone in %.0fs.' % (time.time() - t0))
    sys.exit(0)

print('\n\033[1m· write these back to the folder\033[0m')
print('    MAP.md')
print('    NAMES.md')
if dated:
    print('    builds/%s' % dated.name)
print('    builds/one-app-latest.html      <- the bookmark. Always, with the day\'s copy.')
if previous.exists():
    print('    builds/one-app-previous.html    <- the undo')
# Writing back a file this change did not touch reverts whoever changed it
# since it was staged (2026-09-02: a whole cloud-sync change lost that
# way), so the list is worked out by comparison rather than recalled.
if against:
    edited = []
    for p in sorted(list(TREE.rglob('*')) + list((ROOT / 'tools').rglob('*'))
                    + [ROOT / 'PROJECT.md', ROOT / 'README.md']):
        if not p.is_file() or '__pycache__' in p.parts:
            continue
        rel = p.relative_to(ROOT)
        old = against / rel
        if not old.exists() or old.read_bytes() != p.read_bytes():
            edited.append(rel)
    for rel in edited:
        print('    %s' % rel.as_posix())
    if not edited:
        print('    (nothing under one-app/ or tools/ differs from %s)' % against)
else:
    print('    …and every file under one-app/ or tools/ this change edited.')
print('\ndone in %.0fs.' % (time.time() - t0))
