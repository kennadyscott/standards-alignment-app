#!/usr/bin/env python3
"""Parse Texas ELAR TEKS (19 TAC Ch.110, adopted 2017) from TAC HTML into records."""
import re, json, html, sys, os

SECTIONS = [("110.2","K"),("110.3","1"),("110.4","2"),("110.5","3"),("110.6","4"),
            ("110.7","5"),("110.22","6"),("110.23","7"),("110.24","8")]

HERE = os.path.dirname(os.path.abspath(__file__))

# Reading-focused strands to keep (canonical strand name = text before first colon)
KEEP = {"Comprehension skills", "Response skills", "Multiple genres", "Author's purpose and craft"}


def clean(t):
    t = re.sub(r'<[^>]+>', ' ', t)
    t = html.unescape(t)
    t = t.replace(' ', ' ')
    t = re.sub(r'\s+', ' ', t)
    return t.strip()


def first_no(block):
    """Text of the first <no>...</p> in this block (its own label text)."""
    m = re.search(r'<no>(.*?)</p>', block, re.S)
    return clean(m.group(1)) if m else ''


def split_blocks(s, tag):
    """Return list of top-level <tag>...</tag> inner strings (non-nested for our tags)."""
    out = []
    for m in re.finditer(r'<%s>(.*?)</%s>' % (tag, tag), s, re.S):
        out.append(m.group(1))
    return out


def parse_section(path, grade):
    raw = open(path, encoding='utf-8', errors='replace').read()

    # Isolate subsection (b) Knowledge and skills: from its <ss> to end of that <ss>
    start = raw.find('<ss><no>(b) Knowledge and skills.')
    if start < 0:
        raise SystemExit('FATAL: no (b) Knowledge and skills in %s' % path)
    end = raw.find('</ss>', start)
    if end < 0:
        end = len(raw)
    body = raw[start:end]

    recs = []
    # Each numbered item is a <pp> block. They are closed by </pp>.
    for pp in split_blocks(body, 'pp'):
        stmt = first_no(pp)
        m = re.match(r'\((\d+)\)\s+(.*)$', stmt, re.S)
        if not m:
            continue
        num, text = m.group(1), m.group(2).strip()

        # strand = label before first colon
        cm = re.match(r'([^:]+):', text)
        strand = cm.group(1).strip() if cm else ''

        elements = []
        for sp in split_blocks(pp, 'sp'):
            lt = first_no(sp)
            lm = re.match(r'\(([A-Z])\)\s+(.*)$', lt, re.S)
            if not lm:
                continue
            letter, ltext = lm.group(1), lm.group(2).strip()
            # append roman clauses verbatim, inline
            romans = []
            for cc in split_blocks(sp, 'cc'):
                ct = first_no(cc)
                if ct:
                    romans.append(ct)
            if romans:
                ltext = ltext + ' ' + ' '.join(romans)
            ltext = re.sub(r'\s+', ' ', ltext).strip()
            elements.append('%s. %s' % (letter, ltext))

        rec = {
            "state": "TX",
            "subject": "ela",
            "grade": grade,
            "code": "%s.%s" % (grade, num),
            "strand": strand,
            "description": text,
        }
        if elements:
            rec["elements"] = elements
        recs.append(rec)
    return recs


all_recs = []
audit = {}
for sec, grade in SECTIONS:
    rs = parse_section(os.path.join(HERE, 'tx_%s.html' % sec), grade)
    audit[grade] = [(r["code"], r["strand"], len(r.get("elements", []))) for r in rs]
    all_recs.extend(rs)

json.dump(all_recs, open(os.path.join(HERE, 'tx_all_strands.json'), 'w'), indent=1, ensure_ascii=False)

# Report every strand seen, per grade
print("=== ALL numbered items parsed (code | strand | #elements) ===")
for g, rows in audit.items():
    print("\n-- Grade %s (%d items)" % (g, len(rows)))
    for c, s, n in rows:
        mark = "KEEP" if s in KEEP else "skip"
        print("  [%s] %-6s %-55s %d" % (mark, c, s, n))

strands = sorted({r["strand"] for r in all_recs})
print("\n=== DISTINCT STRAND LABELS (%d) ===" % len(strands))
for s in strands:
    print(" -", s)
