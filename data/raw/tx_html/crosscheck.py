#!/usr/bin/env python3
"""Cross-validate txrules.elaws.us parse against the independent Cornell LII mirror."""
import re, json, html, os, sys, urllib.request, difflib

HERE = os.path.dirname(os.path.abspath(__file__))
SECTIONS = [("110.2","K"),("110.3","1"),("110.4","2"),("110.5","3"),("110.6","4"),
            ("110.7","5"),("110.22","6"),("110.23","7"),("110.24","8")]

def norm(t):
    t = re.sub(r'<[^>]+>', ' ', t)
    t = html.unescape(t).replace(' ', ' ')
    t = t.replace('’', "'").replace('‘', "'")
    t = t.replace('“', '"').replace('”', '"')
    t = t.replace('–', '-').replace('—', '--')
    return re.sub(r'\s+', ' ', t).strip()

def fetch(url, cache):
    p = os.path.join(HERE, cache)
    if not os.path.exists(p):
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        d = urllib.request.urlopen(req, timeout=60).read().decode('utf-8', 'replace')
        open(p, 'w', encoding='utf-8').write(d)
    return open(p, encoding='utf-8', errors='replace').read()

recs = json.load(open(os.path.join(HERE, 'tx_all_strands.json')))
by_grade = {}
for r in recs:
    by_grade.setdefault(r['grade'], []).append(r)

total = mism = 0
for sec, grade in SECTIONS:
    url = 'https://www.law.cornell.edu/regulations/texas/19-Tex-Admin-Code-SS-%s' % sec.replace('.', '-')
    try:
        c = norm(fetch(url, 'cornell_%s.html' % sec))
    except Exception as e:
        print('grade %s: FETCH FAIL %s' % (grade, e)); continue

    for r in by_grade[grade]:
        # every element + description must appear verbatim in the Cornell text
        checks = [r['description']] + r.get('elements', [])
        for ch in checks:
            total += 1
            # strip our "A. " prefix back to raw text for comparison
            probe = re.sub(r'^[A-Z]\. ', '', ch)
            # compare on a distinctive slice (avoid roman-clause join differences)
            slice_ = norm(probe)[:90]
            if slice_ not in c:
                mism += 1
                if mism <= 8:
                    print('MISMATCH g%s %s: %r' % (grade, r['code'], slice_[:90]))

print('\nCross-check: %d strings probed against Cornell LII, %d mismatches' % (total, mism))

# --- space-join typo detector: find tokens absent from system dictionary ---
words = set()
for wp in ('/usr/share/dict/words',):
    if os.path.exists(wp):
        words = {w.strip().lower() for w in open(wp, errors='ignore')}
print('dictionary loaded: %d words' % len(words))
if words:
    sus = {}
    for r in recs:
        for t in [r['description']] + r.get('elements', []):
            for tok in re.findall(r'[A-Za-z]{12,}', t):
                lt = tok.lower()
                if lt not in words:
                    sus[tok] = sus.get(tok, 0) + 1
    print('\n=== long tokens not in dictionary (possible space-join typos) ===')
    for t, n in sorted(sus.items(), key=lambda x: -x[1]):
        print('  %-40s x%d' % (t, n))
