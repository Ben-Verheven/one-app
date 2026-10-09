#!/usr/bin/env python3
"""
bundle.py — fold the tree back into one self-contained file.

You do not need this to run the app: open one-app/index.html and the
browser assembles it for you. Use it when the app has to travel as a
single file — a copy for someone else, a snapshot before a large change.

    python3 tools/bundle.py one-app/ one-app.html

It follows index.html rather than a list of its own, so a file you add
there is picked up here with no further edit.
"""
import re, sys, pathlib, base64

T   = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'one-app')
OUT = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else 'one-app.html')

html = (T / 'index.html').read_text(encoding='utf-8')

def load(rel):
    p = T / rel
    if not p.exists():
        sys.exit('bundle: index.html points at %s, which is not there' % rel)
    return p.read_text(encoding='utf-8').rstrip('\n')

def css(m):
    return '<style>\n/* %s */\n%s\n</style>' % (m.group(1), load(m.group(1)))

def js(m):
    # a script that prints a closing script tag would end the one it is in
    return '<script>\n/* %s */\n%s\n</script>' % (
        m.group(1), load(m.group(1)).replace('</script', r'<\/script'))

def icon(m):
    # the build is opened from builds/, where no icon.png sits beside it
    data = base64.b64encode((T / m.group(2)).read_bytes()).decode('ascii')
    return m.group(1) + 'data:image/png;base64,' + data + '"'

LOCAL = r'(?!https?:)(?!//)([^"]+)'      # leave the CDN and the fonts alone
html = re.sub(r'<link rel="stylesheet" href="%s">' % LOCAL, css, html)
html = re.sub(r'<script src="%s"></script>' % LOCAL, js, html)
html = re.sub(r'(<link rel="(?:icon|apple-touch-icon)"[^>]*? href=")'
              r'(?!https?:)(?!//)([^"]+\.png)"', icon, html)

OUT.write_text(html, encoding='utf-8')
print('%s  (%.1f MB)' % (OUT, OUT.stat().st_size / 1048576))
