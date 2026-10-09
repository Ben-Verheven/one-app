#!/usr/bin/env python3
"""
outline.py — regenerate MAP.md, the index of where everything is.

The point of the map is that Claude (or you, six months from now) can say
"the drag engine is ledger.js:460" without holding 9,000 lines in mind.
Run it after any change that adds or moves a section:

    python3 tools/outline.py one-app/ MAP.md
"""
import os, re, sys, pathlib, datetime

T   = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'one-app')
OUT = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else 'MAP.md')

RULE = '═=─-'
BANNER = re.compile(r'^\s*(?:/\*+|\*|//)\s*(?P<t>.*?)\s*(?:\*/)?\s*$')

def title(line):
    """A banner is a comment whose text is a short phrase inside rules.

    The rules are what tell a banner from an ordinary comment, so the test
    is that stripping them takes something away: two or more rule
    characters at one end of the text or the other. Two rather than three,
    because the stylesheets write their headings as `══ 12. THE TODO CARD ══`
    and a three-character floor left all twenty-two of ledger.css's
    sections out of the map — 197 KB of the app's biggest room showing up
    here as a single entry. Asking for the run at an *end* of the text,
    rather than anywhere on the line, is what stops an ordinary comment
    about `a === b` from being read as a section heading.
    """
    m = BANNER.match(line)
    if not m:
        return None
    t = m.group('t').strip()
    bare = t.strip(RULE + ' ').strip()
    if len(t) - len(bare) < 2:
        return None
    if not bare or len(bare) > 160 or bare.startswith('/*'):
        return None
    if not re.search(r'[A-Za-z]', bare):
        return None
    # Cut a long heading rather than dropping it. ledger.css opens each
    # part of the board with `/* ── Markers. Filled dot = planned date;
    # hollow diamond = hard deadline;` — a heading and its first sentence
    # on one line — and a flat 58-character limit threw away seven of the
    # board's eight subdivisions for being too well explained.
    return shorten(bare)

# Three files write their headings as a block instead of a line — a rule,
# the heading, sometimes a sentence or two of why, then a rule to close.
# atlas.js does it for every one of its four big divisions, and reading
# only single-line banners left CORE, UI, BROWSE and DOSSIER out of the
# map entirely.

def bare_rule(line):
    """A line holding nothing but rule characters: the lid of a block.

    Deliberately looser than BANNER about comment markers. A block in this
    tree opens with `/* ══════` and closes with `   ══════ */`, and the
    closing line carries no marker at all — it is already inside the
    comment. Insisting on one meant every block heading in atlas.js was
    read as an unterminated block and dropped.
    """
    t = uncomment(line)
    return len(t) >= 3 and all(c in RULE for c in t)


def uncomment(line):
    """The prose out of a comment line, whatever marker it carries.

    Block comments in this tree are as often indented with no leading `*`
    as they are with one, so this has to cope with both.
    """
    t = re.sub(r'^\s*(?:/\*+|\*|//)?\s*', '', line)
    return t.strip().rstrip('*/').strip()


def shorten(t):
    """A block heading, cut to something a column can hold.

    These headings are written as a sentence rather than a label — `CORE —
    pure graph logic. No DOM access.` — so a hard truncation lands
    mid-word. Cutting at the last punctuation that fits keeps the part
    that names the thing and drops the part that explains it, which is
    what the file itself is for. The cut is allowed to fall very early,
    because a heading is sometimes one word before its full stop:
    ledger.css's `── Lanes. Every lane is the same fixed height…` wants
    to arrive here as `Lanes`.
    """
    if len(t) <= 58:
        return t
    cuts = [t.rfind(mark, 0, 59) for mark in ('. ', ': ', ', ', ' — ')]
    at = max(cuts)
    return t[:at].strip() if at >= 3 else t[:57].rstrip() + '\u2026'


def sections(src):
    """Every heading in a file, as (line, title), blocks and lines alike."""
    out, i, n = [], 0, len(src)
    while i < n:
        if bare_rule(src[i]):
            j, head = i + 1, None
            while j < n and j - i <= 12 and not bare_rule(src[j]):
                t = uncomment(src[j])
                if t and head is None and re.search(r'[A-Za-z]', t):
                    head = t
                j += 1
            if head and j < n and j > i + 1 and bare_rule(src[j]):
                out.append((i + 1, shorten(head)))
                i = j + 1
                continue
        t = title(src[i])
        if t:
            out.append((i + 1, t))
        i += 1
    return out


# The rooms are read out of index.html, the way bundle.py reads its file
# list, rather than being named here. A list of its own is how the Notes
# room stayed out of this map from the day it shipped: it was in the page,
# in the build and on screen, and the one index that says where anything
# lives had never heard of it. The pane order in the page is the order the
# map wants anyway.
ROOMS = re.findall(r'data-pane="([A-Za-z0-9_-]+)"',
                   (T / 'index.html').read_text(encoding='utf-8'))

ORDER = ['index.html', 'shell/hub.js', 'shell/bridge.js', 'shell/boot.js',
         'shell/shell.css']
for r in ROOMS:
    ORDER += ['rooms/%s/%s.view.js' % (r, r), 'rooms/%s/%s.js' % (r, r),
              'rooms/%s/%s.css' % (r, r)]
ORDER += ['data/atlas-graph.js', 'data/callboard-topics.js',
          'data/callboard-descriptions.js']

lines = ['# MAP — where everything is',
         '',
         'Generated by `tools/outline.py` on %s. Line numbers are of the'
         % datetime.date.today().isoformat(),
         'file named above them, not of anything else.',
         '']

total = 0
for rel in ORDER:
    p = T / rel
    if not p.exists():
        lines.append('- **%s** — missing' % rel)
        continue
    src = p.read_text(encoding='utf-8').split('\n')
    n = len(src) - (1 if src and src[-1] == '' else 0)
    total += n
    kb = p.stat().st_size / 1024
    lines += ['', '## `%s`' % rel, '', '%d lines · %.0f KB' % (n, kb), '']
    if rel.startswith('data/'):
        lines.append('Generated data. Never open, never edit, never upload.')
        continue
    secs = sections(src)
    if not secs:
        lines.append('_No section banners._')
        continue
    w = max(len(t) for _, t in secs)
    lines.append('```')
    for i, t in secs:
        lines.append('%-*s  %s:%d' % (w, t, rel.split('/')[-1], i))
    lines.append('```')

lines += ['', '---', '',
          '**%d lines of code** across %d files, plus three generated data '
          'files that are not counted here and must never be uploaded '
          'anywhere.' % (total, len([r for r in ORDER if not r.startswith('data/')]))]

OUT.write_text('\n'.join(lines) + '\n', encoding='utf-8')
print('%s — %d lines' % (OUT, len(lines)))
