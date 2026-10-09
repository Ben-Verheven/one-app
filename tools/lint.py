#!/usr/bin/env python3
"""
lint.py — check the rules that are otherwise only written down.

PROJECT.md states the rules, and every one of them fails the same way:
silently, at the next reload, in one room only. A `type="module"` that a browser will not fetch across `file://`,
a backtick that ends a view's template literal a thousand lines early, a
script listed before the view it needs — none of these announce
themselves at the moment they are written. This is the second reader that
never gets tired.

    python3 tools/lint.py one-app/

It prints one line per finding and exits non-zero if any of them is an
ERROR. WARN is for things worth knowing that are not wrong: a map that
has fallen behind the code, a breakpoint that is legal but odd.

It reads; it never writes. Nothing here changes a file.
"""
import re, sys, pathlib

T = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'one-app')
ROOMS = ['ledger', 'semaphore', 'callboard', 'atlas', 'notes']

found = []
def err(where, msg):  found.append(('ERROR', where, msg))
def warn(where, msg): found.append(('WARN ', where, msg))

if not (T / 'index.html').exists():
    sys.exit('lint: %s holds no index.html' % T)
index = (T / 'index.html').read_text(encoding='utf-8')


# ── rule 1: order in index.html is load order ──────────────────────────
#
# The Hub has to exist before a room registers, a room's view has to be
# in the pane before its script mounts, and the bridge has to come after
# every room it reaches into. The page is the only place this order is
# recorded, so it is the only place it can be checked.

SRC = re.compile(r'<script src="(?!https?:)(?!//)([^"]+)"></script>')
CSS = re.compile(r'<link rel="stylesheet" href="(?!https?:)(?!//)([^"]+)">')

scripts = SRC.findall(index)
sheets  = CSS.findall(index)
order   = {rel: i for i, rel in enumerate(scripts)}

def at(rel):
    return order.get(rel, -1)

if not scripts or scripts[0] != 'shell/hub.js':
    err('index.html', 'shell/hub.js must be the first script; found %r'
        % (scripts[0] if scripts else 'nothing'))
if scripts and scripts[-1] != 'shell/boot.js':
    err('index.html', 'shell/boot.js must be the last script; found %r'
        % scripts[-1])

for r in ROOMS:
    view, js = 'rooms/%s/%s.view.js' % (r, r), 'rooms/%s/%s.js' % (r, r)
    for rel in (view, js):
        if at(rel) < 0:
            err('index.html', '%s is not listed' % rel)
    if at(view) >= 0 and at(js) >= 0 and at(view) > at(js):
        err('index.html', '%s loads after %s — the pane would be empty when '
                          'the room mounts' % (view, js))
    if at('shell/bridge.js') >= 0 and at(js) > at('shell/bridge.js'):
        err('index.html', 'shell/bridge.js loads before %s, so the room it '
                          'reaches into is not there yet' % js)

for rel in scripts:
    if rel.startswith('data/') and at(rel) < at('rooms/ledger/ledger.js'):
        continue
    if rel.startswith('data/'):
        err('index.html', '%s loads after the rooms; a room reads its data at '
                          'mount' % rel)

for r in ROOMS:
    if 'id="pane-%s"' % r not in index:
        err('index.html', 'no <section class="pane" id="pane-%s">' % r)


# ── rule 2: never a module, never a fetch of a local file ──────────────
#
# Both are the same fact wearing two hats: a browser will not fetch
# across file://, and this app is opened from disk. A module is fetched.
# So is anything fetch() is handed. Either one takes the room down with a
# CORS error that names no cause.

if 'type="module"' in index or "type='module'" in index:
    err('index.html', 'type="module" — a module is fetched, and file:// '
                      'refuses the fetch')

for p in sorted(T.rglob('*.js')):
    rel = p.relative_to(T).as_posix()
    if rel.startswith('data/'):
        continue                       # generated, one line, never our code
    text = p.read_text(encoding='utf-8')
    for m in re.finditer(r'\bfetch\s*\(\s*([\'"`])(?!https?:)', text):
        err('%s:%d' % (rel, text.count('\n', 0, m.start()) + 1),
            'fetch() of what looks like a local path — file:// refuses it')


# ── rule 3: a .view.js carries its markup as a template literal ────────
#
# Which means exactly two backticks in the file, the pair that wraps the
# markup, and no `${` anywhere. A third backtick ends the literal early
# and the room loses everything after it — usually without a parse error,
# because what follows is often still valid JavaScript.

for r in ROOMS:
    rel = 'rooms/%s/%s.view.js' % (r, r)
    p = T / rel
    if not p.exists():
        err(rel, 'missing — the room has no furniture')
        continue
    text = p.read_text(encoding='utf-8')
    ticks = text.count('`')
    if ticks != 2:
        err(rel, '%d backticks; there must be exactly two, the pair around '
                 'the markup' % ticks)
    for m in re.finditer(r'\$\{', text):
        err('%s:%d' % (rel, text.count('\n', 0, m.start()) + 1),
            '${ inside the markup would be read as a substitution')
    m = re.search(r"Hub\.markup\(\s*'([^']+)'", text)
    if not m:
        err(rel, "no Hub.markup('%s', …) — nothing puts this in the pane" % r)
    elif m.group(1) != r:
        err(rel, "Hub.markup('%s') in the %s room's view file" % (m.group(1), r))


# ── the desk and the iPad, and nothing narrower ────────────────────────
#
# 768 is the narrowest iPad held upright and there is nothing under it to
# design for. A rule that fires below 768 can only be serving a narrow
# desktop window, which is not a case this app serves.

FLOOR = 768
for p in sorted(T.rglob('*.css')):
    rel = p.relative_to(T).as_posix()
    text = p.read_text(encoding='utf-8')
    for m in re.finditer(r'@media[^{]*', text):
        line = text.count('\n', 0, m.start()) + 1
        for kind, px in re.findall(r'(max|min)-width\s*:\s*(\d+)px', m.group(0)):
            if int(px) < FLOOR:
                (err if kind == 'max' else warn)(
                    '%s:%d' % (rel, line),
                    '%s-width:%spx is below the %dpx floor — an iPad upright '
                    'is the narrowest thing this app serves' % (kind, px, FLOOR))


# ── everything the page points at is really there ──────────────────────

for rel in scripts + sheets:
    if not (T / rel).exists():
        err('index.html', 'points at %s, which is not in the tree' % rel)

boot = (T / 'shell' / 'boot.js')
if boot.exists():
    m = re.search(r'var EXPECT\s*=\s*\[([^\]]*)\]', boot.read_text(encoding='utf-8'))
    if m:
        expect = re.findall(r"'([^']+)'", m.group(1))
        for r in ROOMS:
            if r not in expect:
                err('shell/boot.js', '%s is not in EXPECT, so a failure to '
                                     'load would pass unnoticed' % r)
        for r in expect:
            if r not in ROOMS:
                warn('shell/boot.js', 'EXPECT names %r, which is not a room '
                                      'in the tree' % r)


# ── the two indexes, and whether they still describe the code ──────────
#
# A map that is one edit behind is worse than no map, because it is
# believed. Any source file newer than the index that describes it is
# the whole test.

newest = max((p.stat().st_mtime, p.relative_to(T).as_posix())
             for p in sorted(T.rglob('*'))
             if p.is_file() and p.suffix in ('.js', '.css', '.html')
             and not p.as_posix().startswith(str(T / 'data')))
for name in ('MAP.md', 'NAMES.md'):
    doc = T.parent / name
    if not doc.exists():
        warn(name, 'not generated yet')
    elif doc.stat().st_mtime < newest[0]:
        warn(name, 'older than %s — regenerate it' % newest[1])


# ── the report ─────────────────────────────────────────────────────────

errors = sum(1 for k, _, _ in found if k == 'ERROR')
if not found:
    print('lint: clean — %d scripts, %d stylesheets, %d rooms.'
          % (len(scripts), len(sheets), len(ROOMS)))
else:
    width = max(len(w) for _, w, _ in found)
    for kind, where, msg in found:
        print('%s  %-*s  %s' % (kind, width, where, msg))
    print('\n%d error(s), %d warning(s).' % (errors, len(found) - errors))

print('Orphan classes and dead rules are in NAMES.md, not here — '
      'tools/names.py finds those.')
sys.exit(1 if errors else 0)
