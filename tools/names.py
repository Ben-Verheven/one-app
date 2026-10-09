#!/usr/bin/env python3
"""
names.py — regenerate NAMES.md, the index of what everything on screen is
called and where that name lives.

MAP.md answers "which part of the file is this". This answers the
question that comes before it: "the effort strip looks wrong — where is
the effort strip?". There are about eleven hundred class names in these
stylesheets and PROJECT.md names forty of them, the forty worth naming in
prose. The other thousand were findable only by grepping four files and
guessing, which is how a five-minute change turns into twenty.

So for every class and id the stylesheets paint, this writes down where
it is painted and where it is written:

    .hz-eff-unplanned    ledger.css:721 x3    ledger.js:3655 x4

The line number is the first one; the count says how many more there are.
A dash in a column means nothing was found — a class with no paint, or
paint with nothing writing it, and both of those are worth a second look.

    python3 tools/names.py one-app/ NAMES.md

**The output is meant to be grepped, not read.** It runs to some thirteen
hundred lines, and reading it whole costs more than the hunt it replaces.

A name assembled at runtime — `'hz-eff-' + kind` — is not a name in the
source, so it cannot be looked up here; that is the one case where grep
is still the tool. What this file can do is say so. The two orphan lists
at its foot are the report rather than the index, and the second of them
holds every painted name that some fragment in the code would build,
with the fragment beside it — so the first list is short enough to act
on, which for years it was not.

A word that is both a class and an ordinary English string will
over-count, because the scan reads every string literal in the room
rather than trying to decide which ones are markup. Over-counting costs
a wrong number in the last column and nothing else, so it is the safe
way to be wrong.
"""
import re, sys, pathlib, datetime, collections

T   = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'one-app')
OUT = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else 'NAMES.md')

# The rooms are read out of index.html, the way bundle.py reads its file
# list, rather than being named here. A list of its own is how the Notes
# room stayed out of this index from the day it shipped: every `.nt-` name
# in the app was missing from the one document that answers "where is the
# thing I am looking at".
ROOMS = re.findall(r'data-pane="([A-Za-z0-9_-]+)"',
                   (T / 'index.html').read_text(encoding='utf-8'))

# Where each stylesheet's names belong in the finished page. The shell's
# sheet is listed first because a name it paints is one every room
# agreed on, and that is worth seeing before the room-specific ones.
SHEETS = [('The shell', 'shell/shell.css')] + [
    (r.capitalize(), 'rooms/%s/%s.css' % (r, r)) for r in ROOMS]

SCRIPTS = ['shell/hub.js', 'shell/bridge.js', 'shell/boot.js'] + [
    f % (r, r) for r in ROOMS
    for f in ('rooms/%s/%s.view.js', 'rooms/%s/%s.js')]


# ── the stylesheets: what is painted, and where ────────────────────────

def decomment(text):
    """Strip /* */ comments, keeping the newlines so line numbers hold."""
    def blank(m):
        return '\n' * m.group(0).count('\n')
    return re.sub(r'/\*.*?\*/', blank, text, flags=re.S)


def selectors(text):
    """Walk the sheet and hand back (selector text, line) for every rule.

    A scanner rather than a regex because the rules that matter most sit
    inside `@media` blocks, and "everything before the first brace on the
    line" loses those. Quotes are tracked because a `content:"{"` or a
    brace inside an inline SVG data URI would otherwise close a block
    early and throw every line number after it out.
    """
    out, buf, start, line, depth, quote = [], [], None, 1, 0, None
    for ch in text:
        if quote:
            if ch == quote:
                quote = None
            elif ch == '\\':
                pass
            if ch == '\n':
                line += 1
            continue
        if ch in '"\'':
            quote = ch
        elif ch == '{':
            sel = ''.join(buf).strip()
            if sel and not sel.startswith('@'):
                out.append((sel, start))
            buf, start, depth = [], None, depth + 1
            continue
        elif ch == '}':
            buf, start, depth = [], None, max(0, depth - 1)
            continue
        if ch == '\n':
            line += 1
        elif not ch.isspace() and start is None:
            start = line
        buf.append(ch)
    return out


NAME = re.compile(r'([.#])(-?[_A-Za-z][-\w]*)')

def painted():
    """name -> (sheet, first line, how many rules mention it)."""
    where = {}
    for _, rel in SHEETS:
        p = T / rel
        if not p.exists():
            continue
        for sel, line in selectors(decomment(p.read_text(encoding='utf-8'))):
            for sigil, word in set(NAME.findall(sel)):
                key = sigil + word
                got = where.get(key)
                if got and got[0] == rel:
                    where[key] = (rel, min(got[1], line), got[2] + 1)
                elif not got:
                    where[key] = (rel, line, 1)
                else:
                    # Painted in two sheets. The shell settling something
                    # across every room is the usual reason, and the
                    # shell is the answer worth printing.
                    where[key] = got if got[0].startswith('shell/') else (rel, line, got[2] + 1)
    return where


# ── the scripts: where a name is written ───────────────────────────────

WORD = re.compile(r'-?[_A-Za-z][-\w]*')

# Where a `/` may begin a regular expression rather than divide. Anything
# that cannot end an expression can only be followed by one.
BEFORE_REGEX = set('(,=:[!&|?{};+-*%^~<>') | {'', 'return', 'typeof', 'case',
                                              'in', 'of', 'new', 'do', 'else'}


def end_of_regex(text, i):
    """The index just past a regular expression starting at `text[i]`.

    None when what starts there is not one. A `[` opens a character class,
    inside which a `/` is an ordinary character — which is the whole point
    of doing this at all: `atlas.js` normalises quotes with a backtick
    inside such a class on its twenty-seventh line.
    """
    j, n, klass = i + 1, len(text), False
    while j < n and text[j] != '\n':
        c = text[j]
        if c == '\\':
            j += 2
        elif c == '[':
            klass = True; j += 1
        elif c == ']':
            klass = False; j += 1
        elif c == '/' and not klass:
            return j + 1
        else:
            j += 1
    return None


def end_of_literal(text, i):
    """The index just past the string or template literal starting at `i`.

    A template's `${}` holes are program and may hold literals of their
    own — `` `a ${x ? `b` : `c`} d` `` is one template, not three — so the
    hole is walked by `end_of_hole` and the template resumes after it.
    Pairing the quotes without that reads the inner opening backtick as
    the outer one's close, and every literal in the rest of the file comes
    out inside-out.
    """
    q, j, n = text[i], i + 1, len(text)
    while j < n:
        c = text[j]
        if c == '\\':
            j += 2
        elif c == q:
            return j + 1
        elif c == '\n' and q != '`':
            return j                      # an unterminated quote ends at the line
        elif c == '$' and q == '`' and text.startswith('${', j):
            j = end_of_hole(text, j + 2)
        else:
            j += 1
    return n


def end_of_hole(text, j):
    """The index just past the `}` closing a `${` hole opened before `j`."""
    depth, n = 1, len(text)
    while j < n and depth:
        c = text[j]
        if c in '\'"`':
            j = end_of_literal(text, j)
        elif text.startswith('//', j):
            k = text.find('\n', j); j = n if k < 0 else k
        elif text.startswith('/*', j):
            k = text.find('*/', j + 2); j = n if k < 0 else k + 2
        else:
            depth += (c == '{') - (c == '}')
            j += 1
    return j


WORDISH = re.compile(r'[\w$]+')

def literals(text):
    """Every string and template literal in a script, as (line, text).

    A scanner rather than one regex, because the three things that hold a
    quote character without opening a string — a line comment, a block
    comment and a regular expression — each swallow the rest of a file
    when a regex alone tries to pair the quotes. That is not theoretical:
    the backtick in `atlas.js`'s quote-normalising regex used to take the
    room's whole right-hand column with it, and eighteen hundred lines of
    class names went to the orphan list instead of the index.
    """
    i, n, line, prev = 0, len(text), 1, ''
    while i < n:
        ch = text[i]
        if ch == '\n':
            line += 1; i += 1
        elif text.startswith('//', i):
            k = text.find('\n', i); i = n if k < 0 else k
        elif text.startswith('/*', i):
            k = text.find('*/', i + 2); k = n if k < 0 else k + 2
            line += text.count('\n', i, k); i = k
        elif ch == '/' and prev in BEFORE_REGEX and end_of_regex(text, i):
            i = end_of_regex(text, i); prev = 'x'
        elif ch in '\'"`':
            j = end_of_literal(text, i)
            yield line, text[i:j]
            line += text.count('\n', i, j); i = j; prev = 'x'
        elif ch.isspace():
            i += 1
        else:
            m = WORDISH.match(text, i)
            prev = m.group(0) if m else ch
            i = m.end() if m else i + 1


def written():
    """word -> {script: (first line, count)}, from every string literal.

    Reading only the insides of string literals is what keeps a variable
    called `row` from being mistaken for the class `.row`. It is not
    perfect — an English word in a toast is still a match — but a name
    that is not in a string is not a name the browser will ever see.
    """
    seen = collections.defaultdict(dict)
    for rel in SCRIPTS:
        p = T / rel
        if not p.exists():
            continue
        for line, lit in literals(p.read_text(encoding='utf-8')):
            for w in WORD.findall(lit):
                got = seen[w].get(rel)
                seen[w][rel] = (min(got[0], line), got[1] + 1) if got else (line, 1)
    return seen


ATTR     = re.compile(r'class\s*=\s*"([^"]*)"' r"|class\s*=\s*'([^']*)'")
CLASSLIST = re.compile(r'classList\.(add|remove|toggle|replace)\(([^)]*)\)')
QUOTED   = re.compile(r"'([^'\n]*)'|\"([^\"\n]*)\"")

# A quoted fragment handed straight to `+` is half of a name being built:
# `'k-' + stage`, `'nt-in' + lvl`. Neither half is a name in the source, so
# neither can be looked up — but a fragment IS the explanation for a rule
# that looks unwritten, which is what the two patterns below are collected
# for. Before they existed, "painted, never written" listed forty-five
# names of which eleven were dead and thirty-four were live families, and a
# list that wrong is a list nobody dares act on.
GLUE_HEAD = re.compile(r"""(['"])\s*([A-Za-z][\w-]*)\1\s*\+""")
GLUE_TAIL = re.compile(r"""\+\s*(['"])(-?[\w-]+)\1""")

# A class list is names and spaces and nothing else.
CLASSY = re.compile(r'[\sA-Za-z0-9_-]*\Z')


def class_runs(body):
    """The runs of a class attribute that are markup, and what abuts them.

    A room builds its markup by concatenation or interpolation, so what
    sits in the file is `class="hz-eff ' + kind + '"`, or `class="s${L}"`.
    Everything between a pair of quotes, and everything inside a `${}`, is
    program; the rest is the class list the browser will actually see.

    Each run says whether program stands immediately against it on either
    side, because a run touching program with no space in between has half
    a name at that end rather than a whole one — and half a name is a
    fragment to be remembered, not a class to be reported missing.

    Runs holding anything but names and spaces are dropped. Those are the
    ones where the quote pairing went astray, an attribute built in three
    pieces swallowing the `data-kind="` after it; their words are program,
    not names, and they are where this list used to collect its noise.
    """
    runs, buf, before, quote, i, n = [], [], False, None, 0, len(body)
    while i < n:
        ch = body[i]
        if quote:
            if ch == quote:
                quote = None
            i += 1
            continue
        if ch in '\'"`':
            runs.append((''.join(buf), before, True))
            buf, before, quote, i = [], True, ch, i + 1
            continue
        if body.startswith('${', i):
            j = body.find('}', i)
            runs.append((''.join(buf), before, '${'))
            buf, before, i = [], True, (n if j < 0 else j + 1)
            continue
        buf.append(ch)
        i += 1
    runs.append((''.join(buf), before, False))
    return [r for r in runs if CLASSY.match(r[0])]


def written_as_names():
    """Where a class name is written, and where only half of one is.

    Classes only, deliberately. An id is just as often a handle the script
    holds on to as it is something the stylesheet paints, so a list of ids
    with no rule behind them runs to a couple of hundred entries and says
    nothing. A class with no rule behind it is nearly always a typo or a
    change made only halfway, which is a list worth reading.

    Three things come back: the whole names; the heads a name is built on
    to (`k-`); and the tails built on to one (`-row-main`, from the row
    builder both editors share). The last two are what let the orphan list
    below separate a rule that is dead from a rule whose name the code
    only ever spells in two pieces.
    """
    out, heads, tails = collections.defaultdict(dict), {}, {}
    for rel in SCRIPTS:
        p = T / rel
        if not p.exists():
            continue
        text = p.read_text(encoding='utf-8')

        def at(pos):
            return text.count('\n', 0, pos) + 1

        def keep(store, word, pos):
            if word:
                store.setdefault(word, (rel, at(pos)))

        def scan(body, pos):
            for run, before, after in class_runs(body):
                words = list(WORD.finditer(run))
                for k, m in enumerate(words):
                    w = m.group(0)
                    head = k == len(words) - 1 and after and m.end() == len(run)
                    tail = k == 0 and before and m.start() == 0
                    if head:
                        keep(heads, w, pos)
                    # A word glued to a `${}` hole is half a name and nothing
                    # more: `class="s${L}"` put `.s` in the orphan list as a
                    # whole class. One that only runs into a closing quote is
                    # still counted whole, because `'hz-mark hz-lead-mark' +
                    # (late ? ' overdue-mark' : '')` is how a whole name
                    # usually ends.
                    if tail:
                        keep(tails, w, pos)
                    elif not ((head and after == '${') or
                              w.startswith('-') or w.endswith('-')):
                        out['.' + w].setdefault(rel, at(pos))

        for m in ATTR.finditer(text):
            scan(next(g for g in m.groups() if g is not None), m.start())
        for m in CLASSLIST.finditer(text):
            # Only an argument that is a quoted string and nothing else: the
            # rest of the call is a condition or a variable, and neither is
            # a class name. `toggle` takes one class and a condition, and the
            # condition's own strings — `want === 'timeline'`, or the
            # `'data-i'` of a getAttribute — were read as classes once.
            args = m.group(2).split(',')
            if m.group(1) == 'toggle':
                args = args[:1]
            for arg in args:
                q = QUOTED.fullmatch(arg.strip())
                if q:
                    scan(next(g for g in q.groups() if g is not None), m.start())
        for m in GLUE_HEAD.finditer(text):
            keep(heads, m.group(2), m.start())
        for m in GLUE_TAIL.finditer(text):
            keep(tails, m.group(2), m.start())
    return out, heads, tails


# ── the page itself ────────────────────────────────────────────────────

def render():
    paint, write = painted(), written()
    positions, heads, tails = written_as_names()

    def uses(name):
        """The scripts that write this name, first line and count each."""
        hits = write.get(name[1:], {})
        return [(rel, line, n) for rel, (line, n) in hits.items()]

    def assembled(name):
        """The fragment that would build this name, if there is one.

        Longest match wins, so `.pi-row-name` is explained by the row
        builder's own `-row-name` rather than by some short head that
        happens to start it. A one-letter head counts only when what
        follows is a number — `class="s${L}"` really does build `.s1`,
        and one letter would otherwise explain half the sheet.
        """
        best = None
        w = name[1:]
        for store, shape in ((heads, "'%s' + …"), (tails, "… + '%s'")):
            for frag, (rel, line) in store.items():
                fits = w.startswith(frag) if store is heads else w.endswith(frag)
                if frag == w or not fits:
                    continue
                if len(frag) < 2 and not w[len(frag):].isdigit():
                    continue
                if store is tails and (len(frag) < 4 or frag[0] != '-'):
                    continue
                if best is None or len(frag) > len(best[0]):
                    best = (frag, shape % frag, rel.split('/')[-1], line)
        return best

    lines = [
        '# NAMES — what it is called, and where that name lives',
        '',
        'Generated by `tools/names.py` on %s.' % datetime.date.today().isoformat(),
        '',
        '**Grep this file. Do not read it.** It is an index of every class '
        'and id in the app,',
        'and reading it whole costs more than the hunt it exists to replace.',
        '',
        '```',
        'grep -n "hz-eff" NAMES.md          # where does the effort strip live?',
        '```',
        '',
        'Each row is the name, then the stylesheet rule that paints it, then '
        'the scripts that',
        'write it — `file:line` of the first one, `x N` for how many there '
        'are in all. A dash',
        'means nothing was found, and both kinds of dash are worth a second '
        'look: paint with',
        'nothing writing it is usually dead, and a name written with no paint '
        'is usually a typo.',
        '',
        'A name the code assembles at runtime — `\'hz-eff-\' + kind` — is not '
        'a name in the',
        'source and will not be here. That is the case grep is still for, '
        'and the second of',
        'the two lists at the foot of this file is where those names '
        'gather.',
        '',
    ]

    listed = set()
    for label, rel in SHEETS:
        mine = sorted(n for n, v in paint.items() if v[0] == rel)
        if not mine:
            continue
        listed |= set(mine)
        sheet = rel.split('/')[-1]
        lines += ['', '## %s — `%s`' % (label, rel), '',
                  '%d names.' % len(mine), '', '```']
        w = max(len(n) for n in mine)
        for n in mine:
            _, line, count = paint[n]
            left = '%-*s  %s:%d%s' % (w, n, sheet, line,
                                      (' x%d' % count) if count > 1 else '')
            u = uses(n)
            u.sort(key=lambda t: -t[2])
            right = '   '.join('%s:%d%s' % (r.split('/')[-1], l,
                                            (' x%d' % c) if c > 1 else '')
                               for r, l, c in u[:3]) or '—'
            lines.append('%-*s   %s' % (w + 34, left, right))
        lines.append('```')

    # The two lists that are really a report rather than an index.
    orphans = sorted(n for n in positions if n not in paint)
    lines += ['', '', '## Written, never painted', '',
              'A class the scripts put on an element that no rule in any '
              'stylesheet mentions.',
              'Classes only: an id is as often a handle a script holds as it '
              'is something the',
              'sheet paints, so listing unpainted ids fills a page and says '
              'nothing. Some of',
              'these are hooks the code only reads back, which is fine, and '
              'some are halves of',
              'names the code assembles — `k-`, `sw-`, `t-`. The rest are '
              'typos, or the second',
              'half of a change that was only half made.', '']
    if orphans:
        lines.append('```')
        w = max(len(n) for n in orphans)
        for n in orphans:
            first = sorted(positions[n].items())[0]
            lines.append('%-*s   %s:%d' % (w, n, first[0].split('/')[-1], first[1]))
        lines.append('```')
    else:
        lines.append('_None._')

    dead  = sorted(n for n in paint if not uses(n) and n not in positions)
    built = dict((n, assembled(n)) for n in dead)
    gone  = [n for n in dead if not built[n]]
    made  = [n for n in dead if built[n]]

    lines += ['', '', '## Painted, never written', '',
              'A rule whose name appears nowhere in any script or view. '
              'This first list is the',
              'one to act on: nothing in the app spells these names, whole '
              'or in pieces, so the',
              'markup that wore them is gone and the paint outlived it. '
              'Grep the name before',
              'deleting it all the same — this reads the tree, not the '
              'running page.', '']
    if gone:
        lines.append('```')
        w = max(len(n) for n in gone)
        for n in gone:
            rel, line, _ = paint[n]
            lines.append('%-*s   %s:%d' % (w, n, rel.split('/')[-1], line))
        lines.append('```')
    else:
        lines.append('_None._')

    lines += ['',
              'The second list is not a finding. Each of these names is '
              'built at runtime from a',
              'fragment the code does hold, so no scan can see the whole of '
              'it; the fragment and',
              'where it is glued together stand beside each one. These are '
              'live families — the',
              'row builders, the stage classes, the band widths — and '
              'deleting one on the',
              'strength of this list is how a working room loses its paint.',
              '']
    if made:
        lines.append('```')
        w = max(len(n) for n in made)
        f = max(len(built[n][1]) for n in made)
        at = max(len('%s:%d' % (paint[n][0].split('/')[-1], paint[n][1]))
                 for n in made)
        for n in made:
            rel, line, _ = paint[n]
            _, shape, frel, fline = built[n]
            lines.append('%-*s   %-*s  %-*s  %s:%d'
                         % (w, n, at, '%s:%d' % (rel.split('/')[-1], line),
                            f, shape, frel, fline))
        lines.append('```')
    else:
        lines.append('_None._')

    lines += ['', '---', '',
              '**%d names** across %d stylesheets. %d are written somewhere '
              'the scan can see;'
              % (len(paint), len(SHEETS), sum(1 for n in paint if uses(n))),
              '%d are written but never painted, %d painted but never '
              'written — %d of' % (len(orphans), len(dead), len(made)),
              'those assembled at runtime from a fragment, and %d with no '
              'explanation at all.' % len(gone)]
    return lines


page = render()
OUT.write_text('\n'.join(page) + '\n', encoding='utf-8')
print('%s — %d lines' % (OUT, len(page)))
