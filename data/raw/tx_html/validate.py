#!/usr/bin/env python3
"""Validate texas_ela.json against spec + verbatim re-check vs Cornell LII mirror."""
import re, json, html, os, collections

HERE = os.path.dirname(os.path.abspath(__file__))
P = '/Users/kennadyscott/Documents/Claude/standards-alignment/data/work/texas_ela.json'
SECMAP = {"K":"110.2","1":"110.3","2":"110.4","3":"110.5","4":"110.6","5":"110.7",
          "6":"110.22","7":"110.23","8":"110.24"}

recs = json.load(open(P, encoding='utf-8'))
fails = []

def chk(cond, msg):
    if not cond: fails.append(msg)

# 1. schema
chk(isinstance(recs, list), 'not a list')
for r in recs:
    chk(set(r) <= {"state","subject","grade","code","strand","description","elements"}, 'extra keys %s' % r.get('code'))
    for k in ("state","subject","grade","code","strand","description"):
        chk(k in r and isinstance(r[k], str) and r[k].strip(), 'missing/empty %s in %s' % (k, r.get('code')))
    chk(r["state"]=="TX", 'bad state %s' % r.get('code'))
    chk(r["subject"]=="ela", 'bad subject %s' % r.get('code'))
    chk(re.fullmatch(r'(K|[1-8])\.\d+', r["code"]), 'bad code %r' % r.get('code'))
    chk(r["code"].split('.')[0] == r["grade"], 'code/grade mismatch %s' % r.get('code'))
    for e in r.get("elements", []):
        chk(bool(re.match(r'^[A-Z]\. ', e)), 'bad element shape in %s: %r' % (r['code'], e[:40]))
        chk(len(e) > 3, 'empty element in %s' % r['code'])
    # elements must be sequential A,B,C...
    if r.get("elements"):
        letters = [e[0] for e in r["elements"]]
        exp = [chr(ord('A')+i) for i in range(len(letters))]
        chk(letters == exp, 'non-sequential letters in %s: %s' % (r['code'], ''.join(letters)))

# 2. grades present
grades = collections.Counter(r["grade"] for r in recs)
for g in ["K","1","2","3","4","5","6","7","8"]:
    chk(grades.get(g,0) > 0, 'grade %s missing' % g)

# 3. unique codes
codes = [r["code"] for r in recs]
dupes = [c for c,n in collections.Counter(codes).items() if n>1]
chk(not dupes, 'duplicate codes: %s' % dupes)

# 4. VERBATIM re-check: every full string must appear in the Cornell mirror
def norm(t):
    t = re.sub(r'<[^>]+>', ' ', t)
    t = html.unescape(t).replace(' ', ' ')
    t = t.replace('’',"'").replace('‘',"'").replace('“','"').replace('”','"')
    t = re.sub(r'\s+([.;,])', r'\1', t)
    t = re.sub(r'\bcontrastingideas\b', 'contrasting ideas', t)
    t = re.sub(r'\btextevidence\b', 'text evidence', t)
    return re.sub(r'\s+', ' ', t).strip()

probed = miss = 0
for r in recs:
    p = os.path.join(HERE, 'cornell_%s.html' % SECMAP[r["grade"]])
    if not os.path.exists(p):
        continue
    c = norm(open(p, encoding='utf-8', errors='replace').read())
    for s in [r["description"]] + r.get("elements", []):
        probed += 1
        probe = norm(re.sub(r'^[A-Z]\. ', '', s))
        # roman clauses are inlined by us; compare the lead segment before any "(i)"
        lead = re.split(r'\(i\)', probe)[0].strip()
        if lead and lead not in c:
            miss += 1
            print('  VERBATIM MISS %s: %r' % (r["code"], lead[:100]))

print('Verbatim re-check: %d strings, %d misses (vs independent Cornell LII mirror)' % (probed, miss))
print('\nRecords: %d | codes unique: %s' % (len(recs), not dupes))
print('Per grade:', {g: grades[g] for g in ["K","1","2","3","4","5","6","7","8"]})
print('Elements total:', sum(len(r.get("elements",[])) for r in recs))
print('Strands:', sorted({r["strand"] for r in recs}))
print('\nVALIDATION: %s' % ('PASS' if not fails and miss==0 else 'FAIL'))
for f in fails[:20]: print('  !', f)
