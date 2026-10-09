#!/usr/bin/env python3
"""
pocket_contract.py — derive Pocket's contract from One App's own data.

Lives in pocket/ of the repository, but its input and output never do: the
export is Mark's data and the contract quotes short values from it, so both
stay in his OneDrive Pocket folder (pocket/POCKET.md). Reads (never writes)
the JSON it is given, walks it, and writes a single small Markdown file
describing the shape of the two Supabase rows Pocket depends on:
`app_state.id='main'` (the Ledger) and `app_state.id='semaphore'`.

Nothing of One App's source is copied out — only the skeleton: keys, types,
how often each key is actually present, and a scrubbed example value per
leaf. Free text is redacted; anything that looks like a credential is
dropped outright.

Usage
    python3 pocket_contract.py                  # auto-find input and output
    python3 pocket_contract.py --out ../pocket/pocket-contract.md
    python3 pocket_contract.py --print          # stdout, write nothing
    python3 pocket_contract.py main.json semaphore.json --out ...

Stdlib only. Python 3.8+.
"""

import argparse
import datetime
import hashlib
import json
import os
import re
import sys

MAX_ARRAY_SAMPLE = 500          # elements walked per array
MAX_MAP_SAMPLE = 500            # entries walked per id-keyed map
EXAMPLES_PER_LEAF = 2
SAFE_STRING = re.compile(r"^[A-Za-z0-9 _\-./:+#]{0,32}$")
ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ISO_DATETIME = re.compile(r"^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}")
ID_KEY = re.compile(r"^(?=.*[0-9A-Z_-])[A-Za-z0-9_-]{6,}$")
SECRET_KEY = re.compile(r"(key|token|secret|password|passwd|apikey|auth)", re.I)
SECRET_VALUE = re.compile(r"^(eyJ[\w-]{10,}|sb[ps]_[\w-]{10,}|[A-Za-z0-9+/]{40,}={0,2})$")

# The half of the contract that is not derivable from data: how Pocket talks
# to the rows. Taken from Pocket's own access layer, kept here so the emitted
# file is self-contained.
REST_CONTRACT = """\
Pocket reaches Supabase through PostgREST directly, no client library:

    GET  /rest/v1/app_state?id=in.(main,semaphore)&select=id,data
    GET  /rest/v1/app_state?id=eq.<row>&select=data
    POST /rest/v1/app_state
         Prefer: resolution=merge-duplicates,return=minimal
         body:   [{ id, data, updated_at }]

Headers on every call: `apikey` and `Authorization: Bearer <key>`.

Writes are read-modify-write: re-fetch the row, apply the mutation to the
fresh copy, upsert the whole blob back. Pocket never patches a sub-path, so
it cannot clobber a field it does not know about — but it also cannot merge
with a concurrent desk edit beyond last-write-wins on the whole row.

A successful upsert with `return=minimal` answers 201 with an empty body,
not 204. Parse the response text only when there is some.
"""


# ── reading the input ───────────────────────────────────────────────────

def looks_like_main(obj):
    return isinstance(obj, dict) and "projects" in obj


def looks_like_semaphore(obj):
    return isinstance(obj, dict) and "arenas" in obj


def harvest(obj, found, depth=0, seen_keys=None):
    """Pull main/semaphore blobs out of whatever wrapper they arrived in.

    Searches nested structures too, so an export wrapped in one or more
    envelopes still gives up its two rows."""
    if seen_keys is not None and isinstance(obj, dict):
        seen_keys.update(list(obj.keys())[:12])
    if depth > 6:
        return
    if isinstance(obj, list):
        for v in obj[:50]:
            harvest(v, found, depth + 1, seen_keys)
        return
    if not isinstance(obj, dict):
        return

    if isinstance(obj.get("data"), (dict, str)) and "id" in obj:
        data = obj["data"]
        if isinstance(data, str):
            try:
                data = json.loads(data)
            except Exception:
                data = None
        if isinstance(data, dict):
            row = "semaphore" if str(obj["id"]).lower().startswith("sem") else "main"
            if looks_like_main(data) or looks_like_semaphore(data):
                found.setdefault(row, []).append(data)
                return

    hit = False
    if looks_like_main(obj):
        found.setdefault("main", []).append(obj)
        hit = True
    if looks_like_semaphore(obj):
        found.setdefault("semaphore", []).append(obj)
        hit = True
    if hit:
        return

    for k, v in list(obj.items())[:50]:
        if isinstance(v, (dict, list)):
            harvest(v, found, depth + 1, seen_keys)


def load_file(path, found, seen_keys=None):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            obj = json.load(fh)
    except Exception:
        return False
    harvest(obj, found, 0, seen_keys)
    return True


def discover_inputs(folder, depth_limit=3):
    """Every .json in the folder and its subfolders, newest first."""
    hits = []
    for root, dirs, files in os.walk(folder):
        depth = root[len(folder):].count(os.sep)
        if depth >= depth_limit:
            dirs[:] = []
        dirs[:] = [d for d in dirs if not d.startswith(".") and d != "node_modules"]
        for f in files:
            if f.lower().endswith(".json") and f not in ("package.json", "package-lock.json"):
                p = os.path.join(root, f)
                try:
                    hits.append((os.path.getmtime(p), p))
                except OSError:
                    pass
    hits.sort(reverse=True)
    return [p for _, p in hits]


# ── scrubbing ───────────────────────────────────────────────────────────

def scrub(value, key_name=""):
    if isinstance(value, str):
        if SECRET_KEY.search(key_name or "") or SECRET_VALUE.match(value.strip()):
            return "<redacted>"
        if ISO_DATE.match(value):
            return value
        if ISO_DATETIME.match(value):
            return value[:16] + "…"
        if SAFE_STRING.match(value):
            return value
        return "<text, ~%d chars>" % len(value)
    return value


def type_of(value, key_name=""):
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, str):
        if SECRET_KEY.search(key_name or ""):
            return "string"
        if ISO_DATE.match(value):
            return "date"
        if ISO_DATETIME.match(value):
            return "datetime"
        return "string"
    return "unknown"


# ── inferring the skeleton ──────────────────────────────────────────────

def new_node(kind):
    return {"kind": kind, "count": 0, "fields": {}, "item": None, "value": None,
            "types": set(), "examples": [], "lens": [], "keys": 0}


def is_id_map(obj):
    """An object used as a lookup table, not a record."""
    if len(obj) < 3:
        return False
    values = list(obj.values())
    if not all(isinstance(v, dict) for v in values):
        return False
    idish = sum(1 for k in obj if ID_KEY.match(str(k)))
    if idish < len(obj) * 0.8:
        return False
    sets = [frozenset(v.keys()) for v in values[:50] if v]
    if not sets:
        return False
    common = set.intersection(*[set(s) for s in sets])
    widest = max(len(s) for s in sets) or 1
    return len(common) / widest >= 0.5


def absorb(node, value, key_name=""):
    """Fold one observed value into a (possibly empty) node."""
    if isinstance(value, dict):
        if node is None or node["kind"] not in ("object", "map"):
            node = new_node("map" if is_id_map(value) else "object")
        elif node["kind"] == "object" and is_id_map(value):
            node["kind"] = "map"
        node["count"] += 1
        if node["kind"] == "map":
            node["keys"] += len(value)
            for k, v in list(value.items())[:MAX_MAP_SAMPLE]:
                node["value"] = absorb(node["value"], v, k)
        else:
            for k, v in value.items():
                node["fields"][k] = absorb(node["fields"].get(k), v, k)
        return node

    if isinstance(value, list):
        if node is None or node["kind"] != "array":
            node = new_node("array")
        node["count"] += 1
        node["lens"].append(len(value))
        for v in value[:MAX_ARRAY_SAMPLE]:
            node["item"] = absorb(node["item"], v, key_name)
        return node

    if node is None or node["kind"] != "scalar":
        node = new_node("scalar")
    node["count"] += 1
    node["types"].add(type_of(value, key_name))
    ex = scrub(value, key_name)
    if ex is not None and ex != "" and len(node["examples"]) < EXAMPLES_PER_LEAF:
        if ex not in node["examples"] and not isinstance(ex, bool):
            node["examples"].append(ex)
    return node


# ── rendering ───────────────────────────────────────────────────────────

def scalar_label(node):
    types = sorted(t for t in node["types"] if t != "null")
    label = "|".join(types) if types else "null"
    if "null" in node["types"] and types:
        label += "?"
    return label


def render(node, name, parent_count, lines, prefix="", last=True, path="", struct=None):
    branch = "└─ " if last else "├─ "
    kid_prefix = prefix + ("   " if last else "│  ")
    seen = ""
    if parent_count and node["count"] < parent_count:
        seen = "  [in %d/%d]" % (node["count"], parent_count)

    if node["kind"] == "scalar":
        ex = ""
        if node["examples"]:
            ex = "   e.g. " + ", ".join(json.dumps(e, ensure_ascii=False) for e in node["examples"])
        lines.append("%s%s%s: %s%s%s" % (prefix, branch, name, scalar_label(node), seen, ex))
        struct.append("%s:%s" % (path, scalar_label(node)))
        return

    if node["kind"] == "array":
        lens = node["lens"] or [0]
        span = "%d" % lens[0] if min(lens) == max(lens) else "%d–%d" % (min(lens), max(lens))
        unit = "item" if max(lens) == 1 and min(lens) == 1 else "items"
        lines.append("%s%s%s: array (%s %s)%s" % (prefix, branch, name, span, unit, seen))
        struct.append("%s:array" % path)
        if node["item"]:
            render(node["item"], "item", node["item"]["count"], lines, kid_prefix, True,
                   path + "[]", struct)
        return

    if node["kind"] == "map":
        avg = node["keys"] / max(node["count"], 1)
        lines.append("%s%s%s: map, keyed by id (%d entries)%s"
                     % (prefix, branch, name, round(avg), seen))
        struct.append("%s:map" % path)
        if node["value"]:
            render(node["value"], "<id>", node["value"]["count"], lines, kid_prefix, True,
                   path + "{}", struct)
        return

    lines.append("%s%s%s: object%s" % (prefix, branch, name, seen))
    struct.append("%s:object" % path)
    keys = list(node["fields"].keys())
    for i, k in enumerate(keys):
        render(node["fields"][k], k, node["count"], lines, kid_prefix,
               i == len(keys) - 1, path + "." + k, struct)


def render_root(node, row, lines, struct):
    lines.append("%s   (app_state.id = '%s')" % (row, row))
    keys = list(node["fields"].keys()) if node["kind"] == "object" else []
    if node["kind"] != "object":
        render(node, row, 0, lines, "", True, row, struct)
        return
    struct.append("%s:object" % row)
    for i, k in enumerate(keys):
        render(node["fields"][k], k, node["count"], lines, "", i == len(keys) - 1,
               row + "." + k, struct)


# ── colour tokens ───────────────────────────────────────────────────────

def colour_tokens(folder):
    """The :root custom properties of the largest HTML file in the folder."""
    best, size = None, 0
    for f in os.listdir(folder):
        if f.lower().startswith("pocket"):
            continue          # Pocket's own file is not the source of truth
        if f.lower().endswith(".html"):
            p = os.path.join(folder, f)
            try:
                s = os.path.getsize(p)
            except OSError:
                continue
            if s > size:
                best, size = p, s
    if not best:
        return None, []
    try:
        with open(best, "r", encoding="utf-8", errors="replace") as fh:
            head = fh.read(400_000)
    except OSError:
        return None, []
    m = re.search(r":root\s*\{(.*?)\}", head, re.S)
    if not m:
        return os.path.basename(best), []
    pairs = re.findall(r"(--[A-Za-z0-9_-]+)\s*:\s*([^;}]+)", m.group(1))
    return os.path.basename(best), [(k, " ".join(v.split())) for k, v in pairs]


# ── output ──────────────────────────────────────────────────────────────

def build(found, folder, sources):
    lines, struct = [], []
    skeleton = []
    for row in ("main", "semaphore"):
        blobs = found.get(row) or []
        if not blobs:
            skeleton.append("%s   (app_state.id = '%s')\n   — no sample found —" % (row, row))
            continue
        node = None
        for b in blobs:
            node = absorb(node, b)
        block = []
        render_root(node, row, block, struct)
        skeleton.append("\n".join(block))
    lines = skeleton

    digest = hashlib.sha256("\n".join(sorted(struct)).encode()).hexdigest()[:12]
    stamp = datetime.date.today().isoformat()
    html_name, tokens = colour_tokens(folder)

    out = []
    out.append("# Pocket contract")
    out.append("")
    out.append("Derived from One App's own data on %s. Structure hash `%s`." % (stamp, digest))
    out.append("")
    out.append("The hash covers key paths and types only, not values — it changes when the")
    out.append("schema changes and stays put when the data does. Compare it against the hash")
    out.append("Pocket was last built against before trusting anything below.")
    out.append("")
    out.append("Generated by `pocket_contract.py` in the One App folder. Do not edit by hand;")
    out.append("re-run the script instead. One App itself is never modified by it.")
    out.append("")
    out.append("## The rows")
    out.append("")
    out.append(REST_CONTRACT)
    out.append("## Shape")
    out.append("")
    out.append("`[in n/m]` marks a key that is absent from some records — guard for it.")
    out.append("Free text is redacted; short tokens, ids, codes and dates are shown as-is")
    out.append("because Pocket's logic keys off their exact values.")
    out.append("")
    for block in lines:
        out.append("```")
        out.append(block)
        out.append("```")
        out.append("")
    if tokens:
        out.append("## Shared tokens")
        out.append("")
        out.append("From `:root` in `%s`, so Pocket's hues keep meaning the same thing." % html_name)
        out.append("")
        out.append("```")
        for k, v in tokens:
            out.append("%-14s %s" % (k + ":", v))
        out.append("```")
        out.append("")
    out.append("## Provenance")
    out.append("")
    for s in sources:
        out.append("- `%s`" % os.path.basename(s))
    out.append("")
    return "\n".join(out), digest


def find_out_path(folder):
    """A folder called pocket-something: this one, beside it, or inside it."""
    folder = os.path.abspath(folder)
    if os.path.basename(folder).lower().startswith("pocket"):
        return os.path.join(folder, "pocket-contract.md")
    for where in (os.path.dirname(folder), folder):
        try:
            names = sorted(os.listdir(where))
        except OSError:
            continue
        for name in names:
            if name.lower().startswith("pocket") and os.path.isdir(os.path.join(where, name)):
                return os.path.join(where, name, "pocket-contract.md")
    return None


def main():
    ap = argparse.ArgumentParser(description="Derive Pocket's contract from One App's data.")
    ap.add_argument("inputs", nargs="*", help="JSON exports; omit to auto-discover")
    ap.add_argument("--folder", default=None,
                    help="One App folder (default: wherever this script sits)")
    ap.add_argument("--out", help="where to write the contract")
    ap.add_argument("--depth", type=int, default=3, help="subfolder levels to search (default 3)")
    ap.add_argument("--print", dest="to_stdout", action="store_true", help="print, write nothing")
    args = ap.parse_args()

    here = os.path.dirname(os.path.abspath(__file__))
    folder = os.path.abspath(args.folder) if args.folder else here
    found, used, seen_keys = {}, [], set()

    candidates = args.inputs or discover_inputs(folder, args.depth)
    parsed = 0
    for path in candidates:
        before = {k: len(v) for k, v in found.items()}
        if load_file(path, found, seen_keys):
            parsed += 1
            if {k: len(v) for k, v in found.items()} != before:
                used.append(path)
        if "main" in found and "semaphore" in found and not args.inputs:
            break

    if not found:
        w = sys.stderr.write
        w("No Ledger or Semaphore data found.\n\n")
        w("  searched folder : %s\n" % folder)
        w("  shell was in    : %s\n" % os.getcwd())
        w("  .json files seen: %d (parsed: %d)\n" % (len(candidates), parsed))
        for c in candidates[:12]:
            w("      %s\n" % os.path.relpath(c, folder))
        if len(candidates) > 12:
            w("      ... and %d more\n" % (len(candidates) - 12))
        if seen_keys:
            w("  top-level keys in those files: %s\n"
              % ", ".join(sorted(seen_keys)[:25]))
        w("\nIt looks for an object containing 'projects' (Ledger) or 'arenas'\n"
          "(Semaphore). If the keys above use other names, tell Claude what they\n"
          "are. Or point at the file directly:\n"
          "    python3 pocket_contract.py <export.json>\n")
        return 2

    text, digest = build(found, folder, used)

    if args.to_stdout:
        sys.stdout.write(text)
        return 0

    out = args.out or find_out_path(folder)
    if not out:
        w = sys.stderr.write
        w("Read the data fine, but found no folder named 'pocket...' to write to.\n\n")
        w("  looked beside : %s\n" % os.path.dirname(folder))
        w("  and inside    : %s\n\n" % folder)
        for where in (os.path.dirname(folder), folder):
            try:
                subs = [d for d in sorted(os.listdir(where))
                        if os.path.isdir(os.path.join(where, d)) and not d.startswith(".")]
            except OSError:
                continue
            if subs:
                w("  folders in %s:\n" % where)
                for d in subs[:15]:
                    w("      %s\n" % d)
        w("\nRe-run naming the file you want:\n"
          "    python3 pocket_contract.py --out <that folder>/pocket-contract.md\n")
        return 2
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(text)
    missing = [r for r in ("main", "semaphore") if r not in found]
    note = "  (no sample for: %s)" % ", ".join(missing) if missing else ""
    sys.stdout.write("Wrote %s — hash %s%s\n" % (out, digest, note))
    return 0


if __name__ == "__main__":
    sys.exit(main())
