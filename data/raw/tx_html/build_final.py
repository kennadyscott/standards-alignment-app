#!/usr/bin/env python3
"""Build texas_ela.json: reading-focused ELAR TEKS strands, K-8, 19 TAC Ch.110 (adopted 2017)."""
import re, json, html, os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = '/Users/kennadyscott/Documents/Claude/standards-alignment/data/work/texas_ela.json'

KEEP = ["Comprehension skills", "Response skills", "Multiple genres", "Author's purpose and craft"]

# Line-wrap artifacts in the SOS TAC rendering. Each verified against the independent
# Cornell LII mirror and/or TEA's Texas Gateway (texasgateway.org/teks/ela47b).
FIXES = [
    (r'\s+([.;,])', r'\1'),                      # wrap fell before punctuation: "anecdote ." -> "anecdote."
    (r'\bcontrastingideas\b', 'contrasting ideas'),  # SOS join typo; TEA renders "contrasting ideas"
]

def fix(t):
    for pat, rep in FIXES:
        t = re.sub(pat, rep, t)
    return re.sub(r'\s+', ' ', t).strip()

recs = json.load(open(os.path.join(HERE, 'tx_all_strands.json')))

out = []
for r in recs:
    if r['strand'] not in KEEP:
        continue
    rec = {
        "state": r['state'],
        "subject": r['subject'],
        "grade": r['grade'],
        "code": r['code'],
        "strand": r['strand'],
        "description": fix(r['description']),
    }
    if r.get('elements'):
        rec["elements"] = [fix(e) for e in r['elements']]
    out.append(rec)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(out, open(OUT, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
print('wrote %s: %d records' % (OUT, len(out)))
