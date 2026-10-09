#!/usr/bin/env python3
"""
split.py — carve the single-file one-app.html into the source tree.

Run once. Kept afterwards only as provenance: it records exactly which
lines of the original became which file, so the carve can be audited or
redone from a fresh export.

    python3 tools/split.py one-app.orig.html one-app/
"""
import json, os, sys, pathlib

SRC = sys.argv[1] if len(sys.argv) > 1 else 'one-app.orig.html'
OUT = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else 'one-app')

L = open(SRC, encoding='utf-8').read().split('\n')
def seg(a, b):                      # 1-indexed, inclusive
    return L[a-1:b]

# ── the seams, measured from the original ──────────────────────────────
HEAD_TOP    = (1, 14)          # doctype, meta, fonts, supabase
SHELL_CSS   = (16, 671)        # style block one
ROOM_CSS    = {'ledger':(674,3487), 'semaphore':(3488,4653),
               'callboard':(4654,5003), 'atlas':(5004,5303)}
BODY_TOP    = (5306, 5314)     # <body> … <main id="stage">
PANE_OPEN   = {'ledger':5315, 'semaphore':5571, 'callboard':5663, 'atlas':5726}
PANE_BODY   = {'ledger':(5316,5569), 'semaphore':(5572,5661),
               'callboard':(5664,5724), 'atlas':(5728,5754)}   # atlas skips 5727 (the G blob)
BODY_TAIL   = (5756, 5762)     # </main>, sweep, toasts
HUB         = (5765, 6090)
ROOM_JS     = {'ledger':(6094,15191), 'semaphore':(15192,18149),
               'callboard':(18150,18951), 'atlas':(18952,20575)}
BRIDGE      = (20579, 21243)
G_LINE      = 5727             # <script type="application/json" id="G">…</script>
DATA_LINE   = 18153            # const DATA = {…};
DESC_LINE   = 18473            # const DESC = {…};

ROOMS = ['ledger', 'semaphore', 'callboard', 'atlas']
TITLE = {'ledger':'Proposal Ledger', 'semaphore':'Brokerage Semaphore',
         'callboard':'Call Board', 'atlas':'Researcher Atlas'}

def write(rel, text):
    p = OUT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding='utf-8')
    return p

def strip(line, pre, suf):
    assert line.startswith(pre), (pre, line[:80])
    assert line.endswith(suf),  (suf, line[-80:])
    return line[len(pre):len(line)-len(suf)]

# ── 1. the three data blobs, lifted out whole ──────────────────────────
# Each becomes a thunk rather than a bare literal, so the JSON is only
# built when the room asks for it — which is what the original did by
# keeping the literal inside the mount function. The Call Board is
# lazy-mounted and 3.6MB of prose must stay lazy with it.
BLOBS = [
  ('data/atlas-graph.js',            '__ATLAS_G',
   strip(L[G_LINE-1], '<script type="application/json" id="G">', '</script>'),
   'The Atlas graph: researchers, publications, terms, concepts, edges.'),
  ('data/callboard-topics.js',       '__CB_DATA',
   strip(L[DATA_LINE-1], 'const DATA = ', ';'),
   'The Call Board itself: clusters, destinations, topics, calls.'),
  ('data/callboard-descriptions.js', '__CB_DESC',
   strip(L[DESC_LINE-1], 'const DESC = ', ';'),
   'Full Commission prose for every topic, keyed by topic id.'),
]
for rel, name, raw, why in BLOBS:
    write(rel, ('/* %s\n   Generated data. Do not hand-edit: replace the file.\n'
                '   Held behind a thunk so the JSON is built on first use, not at load. */\n'
                'window.%s = function(){ return %s; };\n') % (why, name, raw))

# ── 2. the shell ───────────────────────────────────────────────────────
write('shell/shell.css', '\n'.join(seg(*SHELL_CSS)) + '\n')
write('shell/hub.js',    '\n'.join(seg(*HUB)) + '\n')
write('shell/bridge.js', '\n'.join(seg(*BRIDGE)) + '\n')

# ── 3. one folder per room: paint, furniture, behaviour ────────────────
for r in ROOMS:
    write('rooms/%s/%s.css' % (r, r), '\n'.join(seg(*ROOM_CSS[r])) + '\n')

    body = '\n'.join(seg(*PANE_BODY[r]))
    assert '`' not in body and '${' not in body and '\\' not in body, \
           'markup for %s contains a character the template literal would eat' % r
    write('rooms/%s/%s.view.js' % (r, r),
          "/* %s — the room's own furniture. Plain HTML; Hub puts it in the\n"
          "   pane before the room is mounted. Two characters must not appear\n"
          "   here, because the markup travels as a template literal: a\n"
          "   backtick, and a dollar immediately followed by a brace. */\n"
          "Hub.markup('%s', `\n%s\n`);\n" % (TITLE[r], r, body))

    js = '\n'.join(seg(*ROOM_JS[r]))
    # the three edits: a room reads its data from the thunk, not from a literal
    if r == 'callboard':
        js = js.replace('const DATA = ' + BLOBS[1][2] + ';',
                        'const DATA = window.__CB_DATA();   /* data/callboard-topics.js */', 1)
        js = js.replace('const DESC = ' + BLOBS[2][2] + ';',
                        'const DESC = window.__CB_DESC();   /* data/callboard-descriptions.js */', 1)
    if r == 'atlas':
        js = js.replace('const G = JSON.parse(document.getElementById("G").textContent);',
                        'const G = window.__ATLAS_G();      /* data/atlas-graph.js */', 1)
    write('rooms/%s/%s.js' % (r, r), js + '\n')

# ── 4. the page that names the parts ───────────────────────────────────
css_links = '\n'.join(
    ['<link rel="stylesheet" href="shell/shell.css">'] +
    ['<link rel="stylesheet" href="rooms/%s/%s.css">' % (r, r) for r in ROOMS])
panes = '\n'.join('%s</section>' % L[PANE_OPEN[r]-1] for r in ROOMS)
scripts = '\n'.join(
    ['<script src="shell/hub.js"></script>', ''] +
    ['<script src="%s"></script>' % b[0] for b in BLOBS] + [''] +
    sum([['<script src="rooms/%s/%s.view.js"></script>' % (r, r),
          '<script src="rooms/%s/%s.js"></script>' % (r, r)] for r in ROOMS], []) +
    ['', '<script src="shell/bridge.js"></script>',
     '<script src="shell/boot.js"></script>'])

write('index.html', '\n'.join(seg(*HEAD_TOP)) + '\n\n' + css_links + '\n</head>\n' +
      '\n'.join(seg(*BODY_TOP)) + '\n' + panes + '\n' +
      '\n'.join(seg(*BODY_TAIL)) + '\n\n' + scripts + '\n\n</body>\n</html>\n')

print('carved %s -> %s' % (SRC, OUT))
