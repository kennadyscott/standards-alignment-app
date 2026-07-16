/* Standards Alignment — Ohio-anchored.

   Every alignment runs through an Ohio standard. You align each new state to Ohio, one
   pass, answering the only question that needs a human: "does this standard align to that
   Ohio one?" Two other states are aligned when both link to the same Ohio standard, so
   Georgia↔Texas costs nothing to review — it falls out.

   Ohio's standards are the hubs. There is no invented layer above them: nothing to name,
   nothing to curate. Adding state N costs ONE pass against Ohio, not one against every
   state already here — which is what keeps this viable at fifty.

   The tradeoff, stated plainly: Ohio is the ceiling. Content Ohio doesn't teach cannot be
   aligned. For a passage library meant to serve several states, content only one state
   teaches isn't much use anyway — but it is a real limit, not a free lunch. */

// Kindergarten and Grade 1 are out of scope for this team — removed from the data files,
// the links, and the decisions (tools/drop_grades.py). Recoverable from git and the raw
// PDFs in data/raw/ if that ever changes.
const GRADES = ['2','3','4','5','6','7','8'];
const ANCHOR = 'OH';
// Adding a state = adding an entry here plus its data files in DATA_FILES. Nothing else.
const STATES = ['OH', 'GA', 'TX'];
const STATE_NAMES = { OH: 'Ohio', GA: 'Georgia', TX: 'Texas', ALL: 'All States' };
const SUBJECT_NAMES = { social_studies: 'Social Studies', science: 'Science', ela: 'ELAR' };
function otherStates(st) { return STATES.filter(s => s !== st); }

/* Standards are keyed state:subject:code. The subject is load-bearing, not decorative:
   Texas numbers items per TAC chapter, so TX:1.10A is both a science standard and an
   ELAR standard — 320 TEKS codes collide across subjects. Ohio and Georgia embed the
   subject in the code (4.SS.1, RL.4.1, SKE1) and never collide. */
function stdKey(state, subject, code) { return `${state}:${subject}:${code}`; }
function keyOf(s) { return stdKey(s.state, s.subject, s.code); }

/* Passage-set genres and Georgia's grade→genre→subtopic tagging hierarchy */
const GENRES = [
  { key: 'informational', label: 'Informational' },
  { key: 'literary', label: 'Literary' },
  { key: 'literary_nonfiction', label: 'Literary Non-Fiction' },
];
const GA_GRADES = ['2','3','4','5','6','7','8'];
const ITEM_SET_TYPES = [
  { key: 'informative', label: 'Informative' },
  { key: 'opinion', label: 'Opinion' },
];
const QUESTION_TYPES = [
  { key: 'multiple_choice', label: 'Multiple Choice' },
  { key: 'cloze', label: 'CLOZE (Drop-Down)' },
  { key: 'multi_select', label: 'Multi-Select' },
  { key: 'text_entry', label: 'Text Entry' },
];
const GA_SUBTOPICS = {
  '2': {
    literary: ['Poetry', 'Narrative Fiction', 'Traditional Literature', 'Short Literary Forms'],
    literary_nonfiction: ['Biographies', 'True Narratives'],
    informational: ['Science', 'Social Studies'],
  },
  '3-8': {
    literary: ['Poetry', 'Narrative Fiction', 'Traditional Literature', 'Short Literary Forms'],
    literary_nonfiction: ['Biographies', 'True Narratives'],
    informational: ['Science', 'History', 'Geography', 'Government', 'Economics'],
  },
};
function gaSubtopicsFor(grade, genre) {
  if (!grade || !genre) return [];
  const band = grade === '2' ? '2' : '3-8';
  return GA_SUBTOPICS[band][genre] || [];
}
function gradeLabel(g) { return g === 'All' ? 'All grades' : `G${g}`; }
// Universal (all-state) standards whose domain matches a hierarchy subtopic
function universalForDomain(domain) {
  if (!domain) return [];
  return state.standards.filter(s => s.state === 'ALL' && (s.strand || '') === domain);
}

/* A hierarchy subtopic names a content domain; each state expresses that domain
   under its own strand names (Ohio "History" ↔ Georgia "Historical Understandings").
   Content-area subtopics resolve to a subject or a strand list; literary and
   literary-nonfiction subtopics resolve to ELAR reading standards, excluding the
   opposite reading strand rather than naming strands we may not have loaded yet. */
const SUBTOPIC_RULES = {
  'Science': { subjects: ['science'] },
  'Social Studies': { subjects: ['social_studies'] },
  'History': { strands: ['History', 'Historical Understandings'] },
  'Geography': { strands: ['Geography', 'Geographic Understandings'] },
  'Government': { strands: ['Government', 'Government/Civic Understandings'] },
  'Economics': { strands: ['Economics', 'Economic Understandings'] },
  'Poetry': { subjects: ['ela'], excludeStrand: /informational/i },
  'Narrative Fiction': { subjects: ['ela'], excludeStrand: /informational/i },
  'Traditional Literature': { subjects: ['ela'], excludeStrand: /informational/i },
  'Short Literary Forms': { subjects: ['ela'], excludeStrand: /informational/i },
  'Biographies': { subjects: ['ela'], excludeStrand: /literature/i },
  'True Narratives': { subjects: ['ela'], excludeStrand: /literature/i },
};

function matchesSubtopic(std, subtopic) {
  // Universal standards belong to the domain named by their strand.
  if (std.state === 'ALL') return (std.strand || '') === subtopic;
  const rule = SUBTOPIC_RULES[subtopic];
  if (!rule) return true;
  if (rule.strands) return rule.strands.includes(std.strand || '');
  if (rule.subjects && !rule.subjects.includes(std.subject)) return false;
  if (rule.excludeStrand && rule.excludeStrand.test(std.strand || '')) return false;
  return true;
}

// Grade + subtopic scope for the set-level primary standard picker.
function primaryScope(s) {
  const grade = s.gaGrade, subtopic = s.gaSubtopic;
  if (!grade || !subtopic) return null;
  return std =>
    (std.state === 'ALL' || std.grade === 'All' || String(std.grade) === String(grade)) &&
    matchesSubtopic(std, subtopic);
}

// Questions always tag to ELAR standards at the set's hierarchy grade.
function questionScope(s) {
  if (!s.gaGrade) return null;
  return std => std.subject === 'ela' &&
    (std.state === 'ALL' || std.grade === 'All' || String(std.grade) === String(s.gaGrade));
}

const state = {
  standards: [],            // all standards, every state
  byKey: new Map(),         // `${state}:${subject}:${code}` -> standard
  links: [],                // { id, subject, oh, state, code, confidence, rationale }
  byAnchor: new Map(),      // Ohio standard key -> links[]
  byLinked: new Map(),      // other-state standard key -> links[]
  decisions: {},            // link id -> 'approved' | 'rejected'
  noAlign: {},              // `${state}:${subject}:${code}` -> true (reviewed: nothing aligns)
  cms: {},                  // `${state}:${subject}:${code}` -> true (standard is loaded in the CMS)
  severed: {},              // `${keyA}||${keyB}` -> true (override: not aligned despite a shared anchor)
  crossOk: {},              // `${keyA}||${keyB}` -> true (cross-grade accepted: passages may cross it)
  setCms: {},               // `${setId}|${state}:${grade}` -> true (developed in the CMS for that grade)
  setDismiss: {},           // `${setId}|${state}:${grade}` -> true (this passage doesn't belong in that grade)
  sets: [],                 // passage sets
  ui: {
    view: 'explorer',
    expState: 'OH', expSubject: 'social_studies', expGrade: '4',
    selectedKey: null, search: '',
    revSubject: 'social_studies', revGrade: '4', revStatus: 'pending', revState: 'ALL',
    inState: 'OH', inGrade: '4',
    currentSetId: null, openPicker: null,
  },
};

/* ---------- persistence ----------
   Source of truth is the server file (/api/state → /Users/Shared/standards-alignment/appstate.json),
   which survives browser-data clears and works across browsers. localStorage is kept
   as a mirror/fallback so nothing is lost if the server is briefly unreachable. */
const LS_DECISIONS = 'sa_decisions_v1';
const LS_MANUAL = 'sa_manual_v1';
const LS_NOALIGN = 'sa_noalign_v1';
const LS_CMS = 'sa_cms_v1';
const LS_SEVERED = 'sa_severed_v1';
const LS_CROSSOK = 'sa_crossok_v1';
const LS_SETCMS = 'sa_setcms_v1';
const LS_SETDISMISS = 'sa_setdismiss_v1';

const readLS = (k, fallback) => {
  try { return JSON.parse(localStorage.getItem(k)) || fallback; } catch { return fallback; }
};

function loadLocal() {
  state.decisions = readLS(LS_DECISIONS, {});
  state.manual = readLS(LS_MANUAL, []);
  state.noAlign = readLS(LS_NOALIGN, {});
  state.cms = readLS(LS_CMS, {});
  state.severed = readLS(LS_SEVERED, {});
  state.crossOk = readLS(LS_CROSSOK, {});
  state.setCms = readLS(LS_SETCMS, {});
  state.setDismiss = readLS(LS_SETDISMISS, {});
}
function mirrorLocal() {
  localStorage.setItem(LS_DECISIONS, JSON.stringify(state.decisions));
  localStorage.setItem(LS_MANUAL, JSON.stringify(state.manual));
  localStorage.setItem(LS_NOALIGN, JSON.stringify(state.noAlign));
  localStorage.setItem(LS_CMS, JSON.stringify(state.cms));
  localStorage.setItem(LS_SEVERED, JSON.stringify(state.severed));
  localStorage.setItem(LS_CROSSOK, JSON.stringify(state.crossOk));
  localStorage.setItem(LS_SETCMS, JSON.stringify(state.setCms));
  localStorage.setItem(LS_SETDISMISS, JSON.stringify(state.setDismiss));
  localStorage.setItem(LS_SETS, JSON.stringify(state.sets));
}

function stateBody() {
  return JSON.stringify({
    // Link ids reuse the original pair ids (ss4-01…), so these ARE the reviewer's
    // decisions going back to the very first pass. Never prune them.
    decisions: state.decisions,
    manual: state.manual,
    noAlign: state.noAlign,
    cms: state.cms,
    severed: state.severed,
    crossOk: state.crossOk,
    setCms: state.setCms,
    setDismiss: state.setDismiss,
    sets: state.sets,
    savedAt: new Date().toISOString(),
  });
}

/* GitHub-direct persistence (used on static hosting like GitHub Pages):
   the state file lives in the PRIVATE data repo; every save is a commit. */
const GH_DATA_REPO = 'kennadyscott/standards-alignment';
const GH_STATE_URL = `https://api.github.com/repos/${GH_DATA_REPO}/contents/state/appstate.json`;
const LS_GH_TOKEN = 'sa_gh_token';
let ghMode = false;
let ghToken = localStorage.getItem(LS_GH_TOKEN) || '';
let ghSha = null;

function b64decode(s) {
  const bin = atob(s.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}
function b64encode(s) {
  let bin = '';
  new TextEncoder().encode(s).forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin);
}
function ghApiHeaders() {
  return { Authorization: `Bearer ${ghToken}`, Accept: 'application/vnd.github+json' };
}
async function ghLoad() {
  const r = await fetch(GH_STATE_URL, { headers: ghApiHeaders() });
  if (r.status === 404) { ghSha = null; return {}; }
  if (!r.ok) throw new Error(`github read ${r.status}`);
  const j = await r.json();
  ghSha = j.sha;
  return JSON.parse(b64decode(j.content) || '{}');
}
async function ghSave(attempt = 0) {
  const r = await fetch(GH_STATE_URL, {
    method: 'PUT',
    headers: ghApiHeaders(),
    body: JSON.stringify({
      message: `save decisions ${new Date().toISOString()}`,
      content: b64encode(stateBody()),
      ...(ghSha ? { sha: ghSha } : {}),
    }),
  });
  if ((r.status === 409 || r.status === 422) && attempt < 2) {
    await ghLoad();               // refresh sha after a concurrent write
    return ghSave(attempt + 1);
  }
  if (!r.ok) throw new Error(`github write ${r.status}`);
  ghSha = (await r.json()).content.sha;
}

function updateSaveBadge() {
  const b = document.getElementById('saveBadge');
  if (!b) return;
  if (!ghMode) { b.classList.add('hidden'); return; }
  b.classList.remove('hidden');
  b.textContent = ghToken ? '● Cloud saving on' : '○ Connect cloud saving';
  b.classList.toggle('badge-ok', !!ghToken);
}

let syncTimer;
let serverAvailable = false;
function postState(onDone) {
  if (ghMode) {
    if (!ghToken) { if (onDone) onDone(false); return; }
    ghSave()
      .then(() => { if (onDone) onDone(true); })
      .catch(() => { toast('⚠ GitHub save failed — kept in this browser only'); if (onDone) onDone(false); });
    return;
  }
  fetch('/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: stateBody(),
  }).then(r => { if (!r.ok) throw new Error(); if (onDone) onDone(true); })
    .catch(() => { toast('⚠ Server save failed — kept in this browser only'); if (onDone) onDone(false); });
}
function pushState() {
  mirrorLocal();
  if (!serverAvailable) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(postState, 1200); // batched; every save is a versioned commit on the live server
}
// Explicit save: skip the debounce and confirm.
function flushState() {
  mirrorLocal();
  clearTimeout(syncTimer);
  if (!serverAvailable) { toast('Saved in this browser'); return; }
  postState(ok => { if (ok) toast('✓ Saved'); });
}

function dedupeById(list) {
  const seen = new Set();
  return list.filter(x => x && x.id && !seen.has(x.id) && seen.add(x.id));
}

async function loadPersisted() {
  loadLocal();
  loadSets();
  let s = null;
  try {
    const r = await fetch('/api/state');
    if (r.ok && (r.headers.get('content-type') || '').includes('json')) {
      serverAvailable = true;
      s = (await r.json()) || {};
    }
  } catch { /* no same-origin API — static hosting */ }
  if (s === null) {
    // Static hosting (GitHub Pages): talk to GitHub directly.
    ghMode = true;
    updateSaveBadge();
    if (!ghToken) return; // browser-only until the user connects cloud saving
    try {
      s = await ghLoad();
      serverAvailable = true;
    } catch {
      toast('⚠ Could not reach GitHub — check your saving token');
      return;
    }
  }
  mergeServerState(s);
}

function mergeServerState(s) {
  try {
    // MERGE server and local (server wins on conflicts) — never let one side
    // silently clobber decisions made on the other.
    const localHadData = Object.keys(state.decisions).length || state.sets.length ||
      state.manual.length || Object.keys(state.noAlign).length || Object.keys(state.cms).length;
    const merged = {
      decisions: { ...state.decisions, ...(s.decisions || {}) },
      manual: dedupeById([...(s.manual || []), ...state.manual]),
      noAlign: { ...state.noAlign, ...(s.noAlign || {}) },
      cms: { ...state.cms, ...(s.cms || {}) },
      severed: { ...state.severed, ...(s.severed || {}) },
      crossOk: { ...state.crossOk, ...(s.crossOk || {}) },
      setCms: { ...state.setCms, ...(s.setCms || {}) },
      setDismiss: { ...state.setDismiss, ...(s.setDismiss || {}) },
      sets: dedupeById([...(s.sets || []), ...state.sets]),
    };
    state.decisions = merged.decisions;
    state.manual = merged.manual;
    state.noAlign = merged.noAlign;
    state.cms = merged.cms;
    state.severed = merged.severed;
    state.crossOk = merged.crossOk;
    state.setCms = merged.setCms;
    state.setDismiss = merged.setDismiss;
    state.sets = merged.sets;
    normalizeSets();
    mirrorLocal();
    if (localHadData) pushState(); // persist anything local-only up to the server
  } catch { /* server without /api/state — localStorage only */ }
}

function saveDecisions() { pushState(); }
function saveManual() { pushState(); }
function saveNoAlign() { pushState(); }

/* ---------- data load ---------- */
/* `cache: 'no-cache'` forces a revalidation against the server on every load. GitHub Pages
   serves these with max-age=600, so without it a browser happily shows ten-minute-old
   links — which reads as "my review queue is empty" when it isn't.
   Revalidation is cheap: unchanged files come back 304 with no body. */
async function fetchJson(path) {
  try {
    const r = await fetch(path, { cache: 'no-cache' });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// A standard with lettered elements becomes one entry per element:
// code = parent code + letter, description = element text, stem = parent statement.
// Letter case follows each state's own convention (Georgia S4E1a, Texas 5.7A).
function expandElements(list) {
  const out = [];
  list.forEach(s => {
    if (s.elements && s.elements.length) {
      s.elements.forEach(e2 => {
        const m = e2.match(/^([A-Za-z])\.\s*([\s\S]*)$/);
        out.push({
          ...s,
          code: s.code + (m ? m[1] : ''),
          description: m ? m[2] : e2,
          stem: s.description,
          parent: s.code,
          elements: undefined,
        });
      });
    } else {
      out.push(s);
    }
  });
  return out;
}

// Adding a state means adding its files here and its code to STATES — nothing else.
const DATA_FILES = [
  'data/ohio_science.json', 'data/ohio_social_studies.json', 'data/ohio_ela.json',
  'data/georgia_science.json', 'data/georgia_social_studies.json', 'data/georgia_ela.json',
  'data/texas_science.json', 'data/texas_social_studies.json', 'data/texas_ela.json',
  'data/universal_ela.json', // state:"ALL" — domains that apply everywhere, shown for every state
];

async function loadData() {
  const results = await Promise.all(DATA_FILES.map(fetchJson));
  state.standards = expandElements(results.filter(Boolean).flat());
  state.standards.forEach(s => state.byKey.set(keyOf(s), s));

  const doc = await fetchJson('data/links.json');
  state.links = ((doc && doc.links) || []).filter(l =>
    state.byKey.has(anchorKeyOf(l)) && state.byKey.has(linkedKeyOf(l)));
  indexLinks();
}

function anchorKeyOf(l) { return stdKey(ANCHOR, l.subject, l.oh); }
function linkedKeyOf(l) { return stdKey(l.state, l.subject, l.code); }

function indexLinks() {
  state.byAnchor = new Map();
  state.byLinked = new Map();
  state.links.forEach(l => {
    const a = anchorKeyOf(l), o = linkedKeyOf(l);
    if (!state.byAnchor.has(a)) state.byAnchor.set(a, []);
    state.byAnchor.get(a).push(l);
    if (!state.byLinked.has(o)) state.byLinked.set(o, []);
    state.byLinked.get(o).push(l);
  });
}

/* ---------- alignment ----------
   Only the reviewer's approvals count; every link starts pending. */
function statusOf(l) { return state.decisions[l.id] || 'pending'; }
function linksFor(std) {
  return std.state === ANCHOR
    ? (state.byAnchor.get(keyOf(std)) || [])
    : (state.byLinked.get(keyOf(std)) || []);
}
function severKey(a, b) { return [a, b].sort().join('||'); }
function isSevered(a, b) { return !!state.severed[severKey(a, b)]; }

/* Everything aligned to `std`, in every other state.
   From an Ohio standard: the states linked to it — one hop.
   From any other state: the Ohio standards it links to, plus the OTHER states linked to
   those same Ohio standards — the sibling alignments the reviewer never has to review.
   `via` names the Ohio standard a sibling alignment runs through, so a derived alignment
   always shows its reason. */
function alignedTo(std) {
  const selfKey = keyOf(std);
  const out = new Map();
  const add = (key, via, link) => {
    if (key === selfKey || out.has(key)) return;
    const o = state.byKey.get(key);
    if (!o || o.state === std.state || isSevered(selfKey, key)) return;
    out.set(key, { std: o, via, link });
  };

  if (std.state === ANCHOR) {
    linksFor(std).filter(l => statusOf(l) === 'approved')
      .forEach(l => add(linkedKeyOf(l), null, l));
    return [...out.values()];
  }

  linksFor(std).filter(l => statusOf(l) === 'approved').forEach(l => {
    const anchorKey = anchorKeyOf(l);
    add(anchorKey, null, l);
    const anchor = state.byKey.get(anchorKey);
    (state.byAnchor.get(anchorKey) || [])
      .filter(x => statusOf(x) === 'approved')
      .forEach(x => add(linkedKeyOf(x), anchor, x));
  });
  return [...out.values()];
}

function isNoAlign(std) { return !!state.noAlign[keyOf(std)]; }

// status dot: approved (has an approved alignment), noalign (reviewed: nothing aligns),
// pending (has an unreviewed draft), none (not looked at yet)
function standardStatus(std) {
  const list = linksFor(std);
  if (list.some(l => statusOf(l) === 'approved')) return 'approved';
  if (isNoAlign(std)) return 'noalign';
  if (list.some(l => statusOf(l) === 'pending')) return 'pending';
  return 'none';
}

/* ---------- generic UI helpers ---------- */
function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstChild;
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}
let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

function bindSeg(id, key, onChange) {
  const seg = document.getElementById(id);
  seg.addEventListener('click', e => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    seg.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b === btn));
    onChange(btn.dataset.val);
  });
}

function renderGradeRow(containerId, activeGrade, onPick) {
  const row = document.getElementById(containerId);
  row.innerHTML = '';
  GRADES.forEach(g => {
    const b = el(`<button class="grade-btn ${g === activeGrade ? 'active' : ''}">${g}</button>`);
    b.addEventListener('click', () => onPick(g));
    row.appendChild(b);
  });
}

/* ---------- explorer ---------- */
function currentStandards() {
  const { expState, expSubject, expGrade, search } = state.ui;
  let list = state.standards.filter(s => s.state === expState && s.subject === expSubject && s.grade === expGrade);
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(s => s.code.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || (s.strand || '').toLowerCase().includes(q));
  }
  return list;
}

function renderStdList() {
  const list = currentStandards();
  const box = document.getElementById('stdList');
  document.getElementById('stdCount').textContent = list.length;
  box.innerHTML = '';
  if (!state.standards.length) {
    box.appendChild(el(`<div class="review-empty">Standards data hasn't been loaded yet.<br>Waiting on data/*.json files.</div>`));
    return;
  }
  if (!list.length) {
    box.appendChild(el(`<div class="review-empty">No standards match.</div>`));
    return;
  }
  let lastStrand = null;
  list.forEach(s => {
    const strand = s.strand || 'General';
    if (strand !== lastStrand) {
      box.appendChild(el(`<div class="std-group-head">${esc(strand)}</div>`));
      lastStrand = strand;
    }
    const key = `${s.state}:${s.code}`;
    const st = standardStatus(s);
    const item = el(`
      <div class="std-item ${state.ui.selectedKey === key ? 'active' : ''}">
        <div class="std-item-top">
          <span class="std-code">${esc(s.code)}</span>
          <span class="std-strand">${esc(s.topic || '')}</span>
          <span class="dot ${st}" title="${st === 'approved' ? 'Has approved alignment' : st === 'noalign' ? 'No Alignment Possible (reviewed)' : st === 'pending' ? 'Has pending drafts' : 'No alignments yet'}"></span>
        </div>
        <div class="std-desc">${esc(s.description)}</div>
      </div>`);
    item.addEventListener('click', () => { state.ui.selectedKey = key; renderStdList(); renderDetail(); });
    box.appendChild(item);
  });
}

function stdCard(std, label) {
  return `
    <div class="source-card">
      <div class="card-label">${esc(label)}</div>
      <div class="card-code-row">
        <span class="card-code">${esc(std.code)}</span>
        <span class="chip">${STATE_NAMES[std.state]}</span>
        <span class="chip">Grade ${esc(std.grade)}</span>
        <span class="chip">${esc(std.strand || '')}</span>
        ${std.topic ? `<span class="chip">${esc(std.topic)}</span>` : ''}
      </div>
      ${std.stem ? `<div class="stem-note">${esc(std.parent)}: ${esc(std.stem)}</div>` : ''}
      <div class="card-desc">${esc(std.description)}</div>
    </div>`;
}

function pairSide(std, stateCode) {
  const cls = String(stateCode).toLowerCase(); // .oh/.ga/.tx accent styles; a new state just gets the default
  if (!std) return `<div class="pair-side ${cls}"><div class="side-label">${STATE_NAMES[stateCode]}</div><div class="pair-desc">(standard not found)</div></div>`;
  return `
    <div class="pair-side ${cls}">
      <div class="side-label">${STATE_NAMES[stateCode]} · G${esc(std.grade)}${std.strand ? ' · ' + esc(std.strand) : ''}</div>
      <div class="pair-code">${esc(std.code)}</div>
      ${std.stem ? `<div class="stem-note">${esc(std.parent)}: ${esc(std.stem)}</div>` : ''}
      <div class="pair-desc">${esc(std.description)}</div>
    </div>`;
}

/* How far apart two standards' grades are. Beyond one grade the alignment isn't worth a
   reviewer's time — word choice and expectation shift too far for a Grade 3 standard and
   a Grade 6 one to be usefully "the same content". Drafts outside the span are held back
   from the queue rather than rejected: the rule is about what's worth showing, so if it
   ever loosens they come back untouched. Decisions already made are never revoked. */
const MAX_GRADE_SPAN = 1;
function gradeNum(g) { return g === 'K' ? 0 : parseInt(g, 10); }
function gradeSpan(a, b) {
  if (!a || !b || a.grade === 'All' || b.grade === 'All') return 0;
  return Math.abs(gradeNum(a.grade) - gradeNum(b.grade));
}
function withinGradeSpan(a, b) { return gradeSpan(a, b) <= MAX_GRADE_SPAN; }
function linkWithinSpan(l) {
  return withinGradeSpan(state.byKey.get(anchorKeyOf(l)), state.byKey.get(linkedKeyOf(l)));
}

function isCrossGrade(a, b) { return a && b && String(a.grade) !== String(b.grade); }

// Amber chip when the two aligned standards sit at different grades — the states sequence
// the same content differently. Expected, not an error.
function crossGradeChip(a, b) {
  if (!isCrossGrade(a, b)) return '';
  return `<span class="chip chip-cross" title="These standards sit at different grade levels — the states sequence this content differently.">⇄ Cross-grade · ${esc(a.state)} G${esc(a.grade)} / ${esc(b.state)} G${esc(b.grade)}</span>`;
}

/* A cross-grade alignment is true but consequential: a passage built for one grade would
   flow into another. Assigning accepts that flow (the passage lands in the target grade's
   Unlisted bucket); dismissing keeps it out. Until decided, passages don't cross. */
function crossOkKey(a, b) { return severKey(a, b); }
function isCrossAssigned(a, b) { return !!state.crossOk[crossOkKey(a, b)]; }

function crossGradeControls(sel, other) {
  if (!isCrossGrade(sel, other)) return '';
  const k = crossOkKey(keyOf(sel), keyOf(other));
  if (state.severed[k]) {
    return `<span class="status-chip rejected">dismissed from G${esc(other.grade)}</span>
      <button class="act-btn reset" data-act="unsever" data-id="${esc(k)}">Undo</button>`;
  }
  if (state.crossOk[k]) {
    return `<span class="status-chip approved">assigned to G${esc(other.grade)} · Unlisted</span>
      <button class="act-btn reset" data-act="cross-undo" data-id="${esc(k)}">Undo</button>`;
  }
  return `<button class="act-btn approve" data-act="cross-assign" data-id="${esc(k)}"
      title="Let passages for this standard populate ${STATE_NAMES[other.state]} Grade ${esc(other.grade)}, marked Unlisted">
      ⇄ Assign to G${esc(other.grade)}</button>
    <button class="act-btn reject" data-act="sever" data-id="${esc(k)}"
      title="Keep passages for this standard out of Grade ${esc(other.grade)}">Dismiss</button>`;
}

/* One aligned standard, shown against the standard currently selected. If the alignment is
   a sibling one (Georgia↔Texas), it names the Ohio standard it runs through — a derived
   alignment must always show its reason. */
function alignedCard(sel, hit) {
  const { std, via, link } = hit;
  return `
    <div class="review-card">
      <div class="review-pair">
        ${pairSide(sel, sel.state)}
        <div class="pair-mid">⇄</div>
        ${pairSide(std, std.state)}
      </div>
      <div class="review-foot">
        ${via ? `<span class="chip chip-concept" title="${esc(via.description || '')}">via Ohio ${esc(via.code)}</span>`
              : '<span class="chip">direct link</span>'}
        <span class="conf-chip">confidence: ${esc(link.confidence || '—')}</span>
        ${crossGradeChip(sel, std)}
        ${link.rationale ? `<div class="rationale"><b>Why:</b> ${esc(link.rationale)}</div>` : ''}
        ${isCrossGrade(sel, std)
          ? crossGradeControls(sel, std)
          : `<button class="act-btn reject" data-act="sever" data-id="${esc(severKey(keyOf(sel), keyOf(std)))}"
              title="These run through the same Ohio standard but are not actually aligned">✂ Not aligned</button>`}
      </div>
    </div>`;
}

/* A link under review — the only question that needs a human:
   does this state's standard align to that Ohio one? */
function linkCard(l) {
  const oh = state.byKey.get(anchorKeyOf(l));
  const other = state.byKey.get(linkedKeyOf(l));
  if (!oh || !other) return '';
  const st = statusOf(l);
  // Approving also aligns it to every other state already on this Ohio standard — the
  // sibling alignments you get without reviewing them. Show them; that's the payoff.
  const siblings = (state.byAnchor.get(anchorKeyOf(l)) || [])
    .filter(x => x.id !== l.id && statusOf(x) === 'approved')
    .map(x => state.byKey.get(linkedKeyOf(x))).filter(Boolean)
    .filter(x => x.state !== other.state);
  const actions = st === 'pending'
    ? `<button class="act-btn approve" data-act="approved" data-id="${l.id}">✓ Approve</button>
       <button class="act-btn reject" data-act="rejected" data-id="${l.id}">✕ Reject</button>`
    : `<span class="status-chip ${st}">${st}</span>
       <button class="act-btn reset" data-act="pending" data-id="${l.id}">Undo</button>`;
  return `
    <div class="review-card ${st !== 'pending' ? 'decided-' + st : ''}">
      <div class="review-pair">
        ${pairSide(oh, ANCHOR)}
        <div class="pair-mid">⇄</div>
        ${pairSide(other, other.state)}
      </div>
      ${siblings.length ? `<div class="member-peers"><b>Approving also aligns it to:</b> ${siblings.map(p =>
        `<span class="chip">${STATE_NAMES[p.state]} ${esc(p.code)} · G${esc(p.grade)}</span>`).join(' ')}
        <span class="chip chip-concept">no extra review — they share this Ohio standard</span></div>` : ''}
      ${st === 'approved' && isCrossGrade(oh, other)
        ? `<div class="member-peers"><b>Grade placement:</b> ${crossGradeControls(oh, other)}</div>` : ''}
      <div class="review-foot">
        <span class="conf-chip">confidence: ${esc(l.confidence || '—')}</span>
        ${crossGradeChip(oh, other)}
        ${l.rationale ? `<div class="rationale"><b>Why:</b> ${esc(l.rationale)}</div>` : ''}
        ${actions}
      </div>
    </div>`;
}

function renderDetail() {
  const empty = document.getElementById('emptyDetail');
  const content = document.getElementById('detailContent');
  const std = state.ui.selectedKey ? state.byKey.get(state.ui.selectedKey) : null;
  if (!std) { empty.classList.remove('hidden'); content.classList.add('hidden'); return; }
  empty.classList.add('hidden');
  content.classList.remove('hidden');

  const hits = alignedTo(std);
  const pending = linksFor(std).filter(l => statusOf(l) === 'pending' && linkWithinSpan(l));
  const approved = linksFor(std).filter(l => statusOf(l) === 'approved');
  const naKey = keyOf(std);

  let html = stdCard(std, `Selected standard — ${STATE_NAMES[std.state]} · ${SUBJECT_NAMES[std.subject]} · Grade ${std.grade}`);

  // One section per other state.
  otherStates(std.state).forEach(os => {
    const inState = hits.filter(h => h.std.state === os);
    html += `<div class="align-section-title">Aligned standards in ${STATE_NAMES[os]} (${inState.length})<span class="rule"></span></div>`;
    if (inState.length) {
      html += inState.map(h => alignedCard(std, h)).join('');
    } else if (isNoAlign(std)) {
      html += `<div class="no-align">Reviewed — no ${STATE_NAMES[os]} equivalent.</div>`;
    } else {
      html += `<div class="no-align">Nothing in ${STATE_NAMES[os]} is aligned to this yet.</div>`;
    }
  });

  if (isNoAlign(std)) {
    html += `
      <div class="noalign-box">
        <div class="noalign-title">🚫 No Alignment Possible</div>
        <div class="noalign-sub">Reviewed — nothing aligns to this standard, in any state.</div>
        <button class="act-btn reset" data-act="unmark-noalign" data-id="${esc(naKey)}">Undo</button>
      </div>`;
  } else if (!approved.length) {
    html += `
      <div class="no-align">
        Nothing aligned yet${pending.length ? ' — review the drafts below' : ''}.<br>
        <button class="act-btn reject" data-act="mark-noalign" data-id="${esc(naKey)}" style="margin-top:10px">🚫 Mark as No Alignment Possible</button>
      </div>`;
  }

  if (pending.length) {
    html += `<div class="align-section-title">Pending drafts (${pending.length})<span class="rule"></span></div>`;
    html += pending.map(l => linkCard(l)).join('');
  }

  html += renderManualAdd(std);
  content.innerHTML = html;

  content.querySelectorAll('[data-act]').forEach(btn => {
    btn.addEventListener('click', () => handleAction(btn.dataset.act, btn.dataset.id));
  });
  wireManualAdd(content, std);
}

/* Manual add. From an Ohio standard you pick the other state's match; from any other state
   you pick its Ohio anchor. Either way the record is the same link. */
function renderManualAdd(std) {
  const isAnchor = std.state === ANCHOR;
  return `
    <div class="align-section-title">Add an alignment<span class="rule"></span></div>
    <div class="source-card" style="margin-bottom:0">
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
        ${isAnchor ? `<select id="manualState" style="font:inherit; padding:8px 10px; border:1px solid var(--line); border-radius:8px">
          ${otherStates(ANCHOR).map(s => `<option value="${s}">${STATE_NAMES[s]}</option>`).join('')}
        </select>` : ''}
        <select id="manualPick" style="font:inherit; padding:8px 10px; border:1px solid var(--line); border-radius:8px; flex:1; min-width:260px"></select>
        <button class="act-btn approve" id="manualAddBtn">+ Add as approved</button>
      </div>
      <div style="font-size:12px; color:var(--ink-faint); margin-top:8px">
        ${isAnchor
          ? `Pick the ${SUBJECT_NAMES[std.subject]} standard in another state (any grade) that matches this one.`
          : `Pick the Ohio ${SUBJECT_NAMES[std.subject]} standard (any grade) this one matches. It then aligns to every other state on that Ohio standard.`}
      </div>
    </div>`;
}

function wireManualAdd(content, std) {
  const sel = content.querySelector('#manualPick');
  const btn = content.querySelector('#manualAddBtn');
  if (!sel) return;
  const stateSel = content.querySelector('#manualState');
  const isAnchor = std.state === ANCHOR;

  const fill = () => {
    const target = isAnchor ? (stateSel ? stateSel.value : otherStates(ANCHOR)[0]) : ANCHOR;
    const existing = new Set(linksFor(std).map(l => isAnchor ? linkedKeyOf(l) : anchorKeyOf(l)));
    const options = state.standards
      .filter(s => s.state === target && s.subject === std.subject && !existing.has(keyOf(s)))
      .sort((a, b) => GRADES.indexOf(a.grade) - GRADES.indexOf(b.grade));
    sel.innerHTML = '<option value="">Choose a standard…</option>' + options.map(s =>
      `<option value="${esc(keyOf(s))}">G${esc(s.grade)} · ${esc(s.code)} — ${esc(s.description.slice(0, 90))}${s.description.length > 90 ? '…' : ''}</option>`
    ).join('');
  };
  fill();
  if (stateSel) stateSel.addEventListener('change', fill);

  btn.addEventListener('click', () => {
    if (!sel.value) return;
    const picked = state.byKey.get(sel.value);
    if (!picked) return;
    const oh = isAnchor ? std : picked;
    const other = isAnchor ? picked : std;
    const l = {
      id: `lnk-manual-${Date.now()}`,
      subject: std.subject,
      oh: oh.code, state: other.state, code: other.code,
      confidence: 'manual',
      rationale: 'Aligned manually by reviewer.',
      source: 'manual',
    };
    state.links.push(l);
    state.decisions[l.id] = 'approved';
    indexLinks();
    pushState();
    toast(`Aligned ${oh.code} ↔ ${other.code}`);
    renderAll();
  });
}

function handleAction(act, id) {
  if (act === 'mark-noalign') {
    state.noAlign[id] = true;
    const std = state.byKey.get(id);
    if (std) linksFor(std).filter(l => statusOf(l) === 'pending')
      .forEach(l => { state.decisions[l.id] = 'rejected'; });
    saveNoAlign();
    toast('Marked: No Alignment Possible');
  } else if (act === 'unmark-noalign') {
    delete state.noAlign[id];
    saveNoAlign();
    toast('No-alignment mark removed');
  } else if (act === 'sever') {
    // Escape hatch: these two run through the same Ohio standard but are not actually
    // aligned. Overrides this pair only, without disturbing either link.
    state.severed[id] = true;
    pushState();
    toast('Marked as not aligned');
  } else if (act === 'unsever') {
    delete state.severed[id];
    pushState();
    toast('Alignment restored');
  } else if (act === 'cross-assign') {
    state.crossOk[id] = true;
    delete state.severed[id];
    pushState();
    toast('Assigned — its passages now populate that grade as Unlisted');
  } else if (act === 'cross-undo') {
    delete state.crossOk[id];
    pushState();
    toast('Grade assignment removed');
  } else if (act === 'pending') {
    delete state.decisions[id];
    saveDecisions();
    toast('Reset to pending');
  } else {
    state.decisions[id] = act;
    saveDecisions();
    toast(act === 'approved' ? 'Alignment approved ✓' : 'Alignment rejected');
  }
  renderAll();
}

/* ---------- review queue ----------
   One question per card: does this state's standard align to that Ohio one? Grade filters
   on the OHIO side, because Ohio is the spine — you walk Ohio grade by grade and confirm
   what each state maps onto it. The other side is often a different grade, by design. */
function reviewScope() {
  const { revSubject, revGrade, revState } = state.ui;
  return state.links.filter(l => {
    if (l.subject !== revSubject) return false;
    const oh = state.byKey.get(anchorKeyOf(l));
    if (!oh || String(oh.grade) !== String(revGrade)) return false;
    if (revState !== 'ALL' && l.state !== revState) return false;
    // More than one grade apart isn't worth reviewing — unless it's already decided, in
    // which case it stays visible so the decision can be found and undone.
    return linkWithinSpan(l) || !!state.decisions[l.id];
  });
}

function renderReview() {
  const { revSubject, revGrade, revStatus, revState } = state.ui;
  const inScope = reviewScope();
  const shown = inScope.filter(l => revStatus === 'all' || statusOf(l) === revStatus);
  const done = inScope.filter(l => statusOf(l) !== 'pending').length;

  const stateLabel = revState === 'ALL' ? 'all states' : STATE_NAMES[revState];
  document.getElementById('reviewProgress').textContent = inScope.length
    ? `${done} of ${inScope.length} reviewed · Ohio Grade ${revGrade} ${SUBJECT_NAMES[revSubject]} · ${stateLabel}`
    : '';

  const box = document.getElementById('reviewList');
  box.innerHTML = '';
  if (!shown.length) {
    box.appendChild(el(`<div class="review-empty">${
      inScope.length
        ? (revStatus === 'pending' ? '🎉 Everything for this Ohio grade is reviewed.' : `No ${revStatus === 'all' ? '' : revStatus + ' '}drafts here.`)
        : 'No drafts for this Ohio grade/subject yet.'
    }</div>`));
    return;
  }

  // Group by the Ohio standard, so you see one Ohio standard with every state's candidate
  // beneath it rather than the same Ohio text restated on each card.
  const groups = new Map();
  shown.forEach(l => {
    const k = anchorKeyOf(l);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(l);
  });

  [...groups.entries()].forEach(([k, ls]) => {
    const oh = state.byKey.get(k);
    box.appendChild(el(`<div class="align-section-title">Ohio ${esc(oh ? oh.code : k)} <span class="rule"></span></div>`));
    ls.forEach(l => {
      const card = el(linkCard(l) || '<div></div>');
      card.querySelectorAll('[data-act]').forEach(btn => {
        btn.addEventListener('click', () => handleAction(btn.dataset.act, btn.dataset.id));
      });
      box.appendChild(card);
    });
  });
}

function renderBadge() {
  // Count only drafts the reviewer will actually be shown — out-of-span ones are held back.
  const pending = state.links.filter(l => statusOf(l) === 'pending' && linkWithinSpan(l)).length;
  document.getElementById('pendingBadge').textContent = pending;
}

/* ---------- export ----------
   Exports the approved Ohio-anchored links plus every alignment they derive (including the
   sibling ones between other states), so a consumer can use them directly or re-derive. */
function exportData() {
  const approvedLinks = state.links.filter(l => statusOf(l) === 'approved');
  const derived = [];
  const seen = new Set();
  state.standards.forEach(std => {
    alignedTo(std).forEach(h => {
      const pair = severKey(keyOf(std), keyOf(h.std));
      if (seen.has(pair)) return;
      seen.add(pair);
      derived.push({
        a: keyOf(std), b: keyOf(h.std),
        via: h.via ? keyOf(h.via) : null,
        cross_grade: String(std.grade) !== String(h.std.grade),
      });
    });
  });
  const out = {
    exported_at: new Date().toISOString(),
    model: 'anchor-ohio',
    states: STATES,
    links: approvedLinks.map(l => ({
      ohio: anchorKeyOf(l), standard: linkedKeyOf(l),
      confidence: l.confidence, rationale: l.rationale, source: l.source || 'ai_draft',
    })),
    derived_alignments: derived,
    severed: Object.keys(state.severed),
    no_alignment_possible: Object.keys(state.noAlign),
  };
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'standards-alignments.json';
  link.click();
  URL.revokeObjectURL(url);
  toast(`Exported ${derived.length} alignments across ${STATES.length} states`);
}

/* ---------- passage sets ---------- */
const LS_SETS = 'sa_passage_sets_v1';
const PROMPT_TYPES = ['informational', 'opinion', 'argumentative'];
const MAX_QUESTIONS = 4;

function loadSets() {
  try { state.sets = JSON.parse(localStorage.getItem(LS_SETS)) || []; } catch { state.sets = []; }
  normalizeSets();
}
function saveSets() { pushState(); }
function currentSet() { return state.sets.find(s => s.id === state.ui.currentSetId) || null; }

/* Sets saved before passages carried titles, or before questions carried a type, are still
   on the server. Widen them on the way in rather than migrating the state file. */
function normalizeSets() {
  state.sets.forEach(s => {
    if (Array.isArray(s.passages)) {
      s.passages = s.passages.map(p =>
        typeof p === 'string' ? { title: '', text: p } : { title: p.title || '', text: p.text || '' });
    }
    ['questions', 'peerRevision'].forEach(k => {
      if (!Array.isArray(s[k])) return;
      s[k] = s[k].map(q => ({ ...q, type: q.type ?? null }));
    });
  });
}

function newPassageSet() {
  const s = {
    id: 'ps-' + Date.now(),
    title: '', passageId: '',
    itemSetType: null,                 // informative | opinion
    genre: null,                       // informational | literary | literary_nonfiction
    gaGrade: null, gaSubtopic: null,   // tagging hierarchy
    primaryState: null,                // OH | GA — feeds the set + question pickers
    standard: null,                    // set-level primary standard tag
    passages: [{ title: '', text: '' }],
    questions: [
      { text: '', standard: null, type: null },
      { text: '', standard: null, type: null },
      { text: '', standard: null, type: null },
    ],
    peerRevision: [{ text: '', standard: null, type: null }],
    writingPrompt: { type: 'informational', text: '' },
  };
  state.sets.unshift(s);
  saveSets();
  state.ui.currentSetId = s.id;
  state.ui.openPicker = null;
  renderPassages();
}

/* Passage-set tags are {state, subject, code}. Sets saved before Texas forced the
   subject into the key hold {state, code}; resolve those by falling back to a search. */
function tagStd(tag) {
  if (!tag) return null;
  if (tag.subject) return state.byKey.get(stdKey(tag.state, tag.subject, tag.code)) || null;
  return state.standards.find(s => s.state === tag.state && s.code === tag.code) || null;
}

// Approved alignments in every other state for a tagged standard, grouped by state.
function tagAlignHtml(tag) {
  if (!tag) return '';
  const std = tagStd(tag);
  if (!std) return '';
  const hits = alignedTo(std);
  const pending = linksFor(std).filter(l => statusOf(l) === 'pending' && linkWithinSpan(l)).length;
  if (!hits.length) {
    if (isNoAlign(std)) {
      return `<div class="align-mini noalign"><div class="align-mini-title">Aligned standards — other states</div>
        <div class="align-mini-item"><b>🚫 No Alignment Possible</b><span class="align-mini-desc">Reviewed — nothing aligns to this.</span></div></div>`;
    }
    return `<div class="align-mini"><div class="align-mini-title">Approved aligned standards — other states</div>
      <div class="align-mini-empty">No approved alignment yet${pending ? ` — ${pending} draft${pending > 1 ? 's' : ''} pending in the Review Queue` : ''}.</div></div>`;
  }
  const inner = otherStates(std.state).map(os => {
    const inState = hits.filter(h => h.std.state === os);
    if (!inState.length) return '';
    return inState.map(h => `<div class="align-mini-item">
        <span class="align-mini-code">${esc(h.std.code)}</span>
        <span class="chip">${STATE_NAMES[os]}</span>
        <span class="chip">Grade ${esc(h.std.grade)}</span>
        ${crossGradeChip(std, h.std)}
        <span class="align-mini-desc">${esc(h.std.description)}</span>
      </div>`).join('');
  }).join('');
  return `<div class="align-mini"><div class="align-mini-title">Approved aligned standards — other states</div>${inner}</div>`;
}

function tagChipHtml(tag, section, index, showAlign = true) {
  if (tag) {
    const std = tagStd(tag);
    return `
      <div class="tag-row">
        <span class="tag-chip">
          <b>${esc(tag.code)}</b> · ${STATE_NAMES[tag.state]}${std && std.grade ? ` · ${esc(gradeLabel(std.grade))}` : ''}
          <button class="tag-x" data-untag="${section}:${index}" title="Remove tag">✕</button>
        </span>
        ${std ? `<span class="tag-desc">${esc(std.description.slice(0, 110))}${std.description.length > 110 ? '…' : ''}</span>` : ''}
      </div>
      ${showAlign ? tagAlignHtml(tag) : ''}`;
  }
  return `<button class="act-btn tag-open" data-pick="${section}:${index}">＋ Tag standard</button>`;
}

function pickerCandidates(query, restrictState, scope) {
  const q = query.toLowerCase().trim();
  // Universal (state:"ALL") standards always show, even in state-restricted pickers.
  let list = state.standards;
  if (restrictState) list = list.filter(s => s.state === restrictState || s.state === 'ALL');
  if (scope) list = list.filter(scope);
  if (q) {
    list = list.filter(s =>
      `${s.code} ${s.description} ${s.strand || ''} ${SUBJECT_NAMES[s.subject] || s.subject} grade ${s.grade}`.toLowerCase().includes(q));
  }
  return list.slice(0, 60);
}

function pickerResultsHtml(query, restrictState, scope) {
  const list = pickerCandidates(query, restrictState, scope);
  if (!list.length) return `<div class="align-mini-empty">No standards match.</div>`;
  let html = '', lastGroup = null;
  list.forEach(s => {
    const group = `${STATE_NAMES[s.state]} · ${SUBJECT_NAMES[s.subject] || s.subject} · ${s.strand || 'General'}`;
    if (group !== lastGroup) {
      html += `<div class="std-group-head">${esc(group)}</div>`;
      lastGroup = group;
    }
    html += `
    <div class="picker-item" data-tag="${esc(s.state)}|${esc(s.subject)}|${esc(s.code)}">
      <span class="align-mini-code">${esc(s.code)}</span>
      <span class="chip">${esc(gradeLabel(s.grade))}</span>
      <span class="align-mini-desc">${esc(s.description.slice(0, 100))}${s.description.length > 100 ? '…' : ''}</span>
    </div>`;
  });
  return html;
}

function pickerHtml(section, index, restrictState, scope, scopeNote) {
  return `
    <div class="tag-picker" data-picker="${section}:${index}">
      <input type="search" class="picker-search" placeholder="Search ${restrictState ? STATE_NAMES[restrictState] + ' ' : ''}standards by code or text…">
      ${scopeNote ? `<div class="ps-hint" style="margin:2px 0 6px">${esc(scopeNote)}</div>` : ''}
      <div class="picker-results">${pickerResultsHtml('', restrictState, scope)}</div>
      <button class="act-btn picker-cancel">Cancel</button>
    </div>`;
}

function questionBlockHtml(q, section, i, label, ctx) {
  const open = state.ui.openPicker && state.ui.openPicker.section === section && state.ui.openPicker.index === i;
  // A tag already made stays visible even when the scope isn't resolvable, so it can be reviewed or removed.
  const area = q.standard
    ? tagChipHtml(q.standard, section, i)
    : ctx.gate
      ? `<div class="ps-hint">${esc(ctx.gate)}</div>`
      : open
        ? pickerHtml(section, i, ctx.restrictState, ctx.scope, ctx.scopeNote)
        : tagChipHtml(null, section, i);
  return `
    <div class="q-card">
      <div class="q-head">
        <span class="q-label">${esc(label)}</span>
        <button class="q-remove" data-remove-q="${section}:${i}" title="Remove">✕</button>
      </div>
      <div class="ps-field" style="margin-bottom:10px"><label>Question type</label>
        <div class="chips-row">
          ${QUESTION_TYPES.map(t => `<button class="pill-btn ${q.type === t.key ? 'active' : ''}"
            data-qtype="${section}:${i}:${t.key}">${t.label}</button>`).join('')}
        </div>
      </div>
      <textarea class="ps-textarea q-text" data-q="${section}:${i}" rows="5"
        placeholder="Paste the entire question here, including all answer choices.">${esc(q.text)}</textarea>
      <div class="q-tag-area">${area}</div>
    </div>`;
}

function renderSetList() {
  const box = document.getElementById('setList');
  box.innerHTML = '';
  if (!state.sets.length) {
    box.appendChild(el(`<div class="review-empty">No passage sets yet.<br>Create one to get started.</div>`));
    return;
  }
  state.sets.forEach(s => {
    const tags = [...s.questions, ...s.peerRevision].filter(q => q.standard).length;
    const item = el(`
      <div class="std-item ${state.ui.currentSetId === s.id ? 'active' : ''}">
        <div class="std-item-top">
          <span class="std-code">${esc(s.title || 'Untitled set')}</span>
          <button class="q-remove" data-del-set="${s.id}" title="Delete set">✕</button>
        </div>
        <div class="std-desc">${esc(s.passageId ? 'ID: ' + s.passageId : 'No passage ID')} · ${s.passages.length} passage${s.passages.length !== 1 ? 's' : ''} · ${tags} tagged</div>
        ${s.passages.some(p => p.title)
          ? `<div class="std-desc set-passage-titles">${s.passages.filter(p => p.title).map(p => esc(p.title)).join(' · ')}</div>`
          : ''}
      </div>`);
    item.addEventListener('click', e => {
      if (e.target.dataset.delSet) {
        if (confirm(`Delete "${s.title || 'Untitled set'}"? This cannot be undone.`)) {
          state.sets = state.sets.filter(x => x.id !== s.id);
          if (state.ui.currentSetId === s.id) state.ui.currentSetId = null;
          saveSets();
          renderPassages();
        }
        return;
      }
      state.ui.currentSetId = s.id;
      state.ui.openPicker = null;
      renderPassages();
    });
    box.appendChild(item);
  });
}

function renderSetEditor() {
  const panel = document.getElementById('setEditor');
  const s = currentSet();
  if (!s) {
    panel.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📄</div>
        <h2>No passage set selected</h2>
        <p>Create a new passage set or pick one from the list. Tag its questions to standards and the approved alignments for other states appear automatically.</p>
      </div>`;
    return;
  }

  const setPickerOpen = state.ui.openPicker && state.ui.openPicker.section === 'set';
  const subtopics = gaSubtopicsFor(s.gaGrade, s.genre);
  const primaryState = primaryStateOf(s);
  const qCtx = {
    restrictState: primaryState,
    scope: questionScope(s),
    scopeNote: primaryState && s.gaGrade ? `Showing ${STATE_NAMES[primaryState]} ELAR standards for Grade ${s.gaGrade}.` : '',
    gate: !primaryState
      ? "Select a primary standard state first — question tagging pulls that state's ELAR standards."
      : !s.gaGrade
        ? 'Pick a hierarchy grade first — question tagging shows ELAR standards for that grade.'
        : null,
  };

  panel.innerHTML = `
    <div class="ps-section">
      <div class="ps-section-title">Passage Set</div>
      <div class="ps-meta-row">
        <div class="ps-field" style="flex:2"><label>Title</label>
          <input type="text" class="ps-input" id="psTitle" value="${esc(s.title)}" placeholder="e.g., The Wright Brothers Take Flight"></div>
        <div class="ps-field" style="flex:1"><label>Passage ID</label>
          <input type="text" class="ps-input" id="psId" value="${esc(s.passageId)}" placeholder="e.g., G4-INFO-0217"></div>
      </div>
    </div>

    <div class="ps-section">
      <div class="ps-section-title">Item Set Type</div>
      <div class="chips-row">
        ${ITEM_SET_TYPES.map(t => `<button class="pill-btn ${s.itemSetType === t.key ? 'active' : ''}" data-itemset="${t.key}">${t.label}</button>`).join('')}
      </div>
    </div>

    <div class="ps-section">
      <div class="ps-section-title">Classification</div>
      <div class="ps-field"><label>Genre</label>
        <div class="chips-row">
          ${GENRES.map(g => `<button class="pill-btn ${s.genre === g.key ? 'active' : ''}" data-genre="${g.key}">${g.label}</button>`).join('')}
        </div>
      </div>
      <div class="ps-field" style="margin-top:12px"><label>Hierarchy — grade</label>
        <div class="chips-row">
          ${GA_GRADES.map(g => `<button class="pill-btn ${s.gaGrade === g ? 'active' : ''}" data-gagrade="${g}">Grade ${g}</button>`).join('')}
        </div>
      </div>
      <div class="ps-field" style="margin-top:12px"><label>Hierarchy — subtopic</label>
        ${s.genre && s.gaGrade
          ? `<div class="chips-row">${subtopics.map(t => `<button class="pill-btn ${s.gaSubtopic === t ? 'active' : ''}" data-subtopic="${esc(t)}">${esc(t)}</button>`).join('')}</div>`
          : `<div class="ps-hint">Pick a genre and grade first — subtopics depend on both.</div>`}
      </div>
      ${(() => {
        const uni = universalForDomain(s.gaSubtopic);
        if (!uni.length) return '';
        return `<div class="ps-field" style="margin-top:12px"><label>${esc(s.gaSubtopic)} standards — all states, all grades</label>
          <div class="chips-row">${uni.map(u => `
            <button class="pill-btn ${s.standard && s.standard.code === u.code ? 'active' : ''}" data-unistd="${esc(u.code)}" title="${esc(u.description)}">
              ${esc(u.code)}: ${esc(u.description.slice(0, 60))}${u.description.length > 60 ? '…' : ''}</button>`).join('')}
          </div></div>`;
      })()}
      <div class="ps-field" style="margin-top:14px"><label>Primary standard — state</label>
        <select id="psPrimaryState" class="ps-input" style="max-width:240px">
          <option value="">Select a state…</option>
          ${STATES.map(st => `<option value="${st}" ${primaryState === st ? 'selected' : ''}>${STATE_NAMES[st]}</option>`).join('')}
        </select>
      </div>
      <div class="ps-field" style="margin-top:12px"><label>Primary standard</label>
        <div class="q-tag-area">${!primaryState
          ? `<div class="ps-hint">Select a state first — the standard picker pulls from that state's loaded standards.</div>`
          : !primaryScope(s)
            ? `<div class="ps-hint">Pick a hierarchy grade and subtopic first — the picker shows only standards for that grade and subtopic.</div>`
            : setPickerOpen
              ? pickerHtml('set', 0, primaryState, primaryScope(s), `Showing ${STATE_NAMES[primaryState]} standards for Grade ${s.gaGrade} · ${s.gaSubtopic}.`)
              : tagChipHtml(s.standard, 'set', 0, false)}</div>
        <div class="ps-hint" style="margin-top:6px">Cross-state alignments for this standard appear in the panel on the right.</div>
      </div>
    </div>

    <div class="ps-section">
      <div class="ps-section-title">Passages <span class="ps-hint">single or multiple</span></div>
      ${s.passages.map((p, i) => `
        <div class="q-card">
          <div class="q-head"><span class="q-label">Passage ${i + 1}</span>
            <button class="q-remove" data-remove-p="${i}" title="Remove">✕</button></div>
          <div class="ps-field" style="margin-bottom:10px"><label>Passage title</label>
            <input type="text" class="ps-input" data-ptitle="${i}" value="${esc(p.title)}"
              placeholder="e.g., The Wright Brothers Take Flight"></div>
          <textarea class="ps-textarea" data-p="${i}" rows="7" placeholder="Paste the passage text here.">${esc(p.text)}</textarea>
        </div>`).join('')}
      <button class="act-btn" id="addPassage">＋ Add passage</button>
    </div>

    <div class="ps-section">
      <div class="ps-section-title">Question Set <span class="ps-hint">3–4 questions, each tagged to a standard</span></div>
      ${s.questions.map((q, i) => questionBlockHtml(q, 'questions', i, `Question ${i + 1}`, qCtx)).join('')}
      ${s.questions.length < MAX_QUESTIONS ? `<button class="act-btn" id="addQuestion">＋ Add question</button>` : ''}
    </div>

    <div class="ps-section">
      <div class="ps-section-title">Peer Revision Task <span class="chip ga-chip">Georgia only</span></div>
      ${s.peerRevision.map((q, i) => questionBlockHtml(q, 'peer', i, `Task ${i + 1}`, { restrictState: 'GA' })).join('')}
      ${s.peerRevision.length < MAX_QUESTIONS ? `<button class="act-btn" id="addPeer">＋ Add task</button>` : ''}
    </div>

    <div class="ps-section">
      <div class="ps-section-title">Writing Prompt</div>
      <div class="seg" id="promptTypeSeg" style="max-width:420px">
        ${PROMPT_TYPES.map(t => `<button class="seg-btn ${s.writingPrompt.type === t ? 'active' : ''}" data-pt="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}
      </div>
      <textarea class="ps-textarea" id="promptText" rows="4" style="margin-top:10px"
        placeholder="Paste the writing prompt here.">${esc(s.writingPrompt.text)}</textarea>
    </div>

    <div class="editor-savebar">
      <span class="ps-hint">Changes save automatically — Save confirms immediately.</span>
      <button class="btn btn-primary" id="saveSetBtn">Save</button>
    </div>`;

  wireSetEditor(panel, s);
}

function tagTarget(s, section, i) {
  return section === 'set' ? s : section === 'peer' ? s.peerRevision[i] : s.questions[i];
}

// Changing the hierarchy can move the tagged primary standard out of scope; drop it
// rather than leave a tag the picker would no longer offer.
function dropOutOfScopePrimary(s) {
  const scope = primaryScope(s);
  if (!s.standard || !scope) return;
  const std = state.byKey.get(`${s.standard.state}:${s.standard.code}`);
  if (!std || !scope(std)) s.standard = null;
}

// The state whose standards feed the set's pickers: explicit dropdown choice,
// falling back to the tagged primary standard's state on older sets.
function primaryStateOf(s) {
  if (s.primaryState) return s.primaryState;
  if (s.standard && s.standard.state !== 'ALL') return s.standard.state;
  return null;
}

function wireSetEditor(panel, s) {
  const on = (sel, ev, fn) => panel.querySelectorAll(sel).forEach(n => n.addEventListener(ev, fn));

  on('#saveSetBtn', 'click', () => flushState());

  on('[data-itemset]', 'click', e => {
    s.itemSetType = e.currentTarget.dataset.itemset;
    saveSets(); renderPassages();
  });
  on('#psPrimaryState', 'change', e => {
    s.primaryState = e.target.value || null;
    // a tagged standard from a different state no longer fits (universal ALL tags stay)
    if (s.standard && s.standard.state !== 'ALL' && s.standard.state !== s.primaryState) s.standard = null;
    state.ui.openPicker = null;
    saveSets(); renderPassages();
  });
  on('[data-unistd]', 'click', e => {
    s.standard = { state: 'ALL', subject: 'ela', code: e.currentTarget.dataset.unistd };
    saveSets();
    toast(`Tagged ${s.standard.code}`);
    renderPassages();
  });
  on('[data-genre]', 'click', e => {
    s.genre = e.currentTarget.dataset.genre;
    if (!gaSubtopicsFor(s.gaGrade, s.genre).includes(s.gaSubtopic)) s.gaSubtopic = null;
    dropOutOfScopePrimary(s);
    saveSets(); renderPassages();
  });
  on('[data-gagrade]', 'click', e => {
    s.gaGrade = e.currentTarget.dataset.gagrade;
    if (!gaSubtopicsFor(s.gaGrade, s.genre).includes(s.gaSubtopic)) s.gaSubtopic = null;
    dropOutOfScopePrimary(s);
    saveSets(); renderPassages();
  });
  on('[data-subtopic]', 'click', e => {
    s.gaSubtopic = e.currentTarget.dataset.subtopic;
    dropOutOfScopePrimary(s);
    saveSets(); renderPassages();
  });

  on('#psTitle', 'input', e => { s.title = e.target.value; saveSets(); renderSetListSoon(); });
  on('#psId', 'input', e => { s.passageId = e.target.value; saveSets(); renderSetListSoon(); });
  on('[data-p]', 'input', e => { s.passages[+e.target.dataset.p].text = e.target.value; saveSets(); });
  on('[data-ptitle]', 'input', e => { s.passages[+e.target.dataset.ptitle].title = e.target.value; saveSets(); renderSetListSoon(); });
  on('[data-q]', 'input', e => {
    const [section, i] = e.target.dataset.q.split(':');
    (section === 'peer' ? s.peerRevision : s.questions)[+i].text = e.target.value;
    saveSets();
  });
  on('#promptText', 'input', e => { s.writingPrompt.text = e.target.value; saveSets(); });

  on('#promptTypeSeg .seg-btn', 'click', e => {
    s.writingPrompt.type = e.currentTarget.dataset.pt;
    saveSets();
    panel.querySelectorAll('#promptTypeSeg .seg-btn').forEach(b => b.classList.toggle('active', b === e.currentTarget));
  });

  on('#addPassage', 'click', () => { s.passages.push({ title: '', text: '' }); saveSets(); renderPassages(); });
  on('#addQuestion', 'click', () => { s.questions.push({ text: '', standard: null, type: null }); saveSets(); renderPassages(); });
  on('#addPeer', 'click', () => { s.peerRevision.push({ text: '', standard: null, type: null }); saveSets(); renderPassages(); });
  on('[data-qtype]', 'click', e => {
    const [section, i, type] = e.currentTarget.dataset.qtype.split(':');
    const q = tagTarget(s, section, +i);
    q.type = q.type === type ? null : type;   // click the active one to clear it
    saveSets(); renderPassages();
  });

  on('[data-remove-p]', 'click', e => {
    s.passages.splice(+e.currentTarget.dataset.removeP, 1);
    if (!s.passages.length) s.passages.push({ title: '', text: '' });
    saveSets(); renderPassages();
  });
  on('[data-remove-q]', 'click', e => {
    const [section, i] = e.currentTarget.dataset.removeQ.split(':');
    const arr = section === 'peer' ? s.peerRevision : s.questions;
    arr.splice(+i, 1);
    if (!arr.length) arr.push({ text: '', standard: null, type: null });
    saveSets(); renderPassages();
  });

  on('[data-pick]', 'click', e => {
    const [section, i] = e.currentTarget.dataset.pick.split(':');
    state.ui.openPicker = { section, index: +i };
    renderPassages();
    const inp = document.querySelector('.picker-search');
    if (inp) inp.focus();
  });
  on('[data-untag]', 'click', e => {
    const [section, i] = e.currentTarget.dataset.untag.split(':');
    tagTarget(s, section, +i).standard = null;
    saveSets(); renderPassages();
  });

  // picker wiring (only present when open)
  const picker = panel.querySelector('.tag-picker');
  if (picker) {
    const [section, iStr] = picker.dataset.picker.split(':');
    const restrictState = section === 'peer' ? 'GA' : primaryStateOf(s);
    const scope = section === 'set' ? primaryScope(s) : section === 'questions' ? questionScope(s) : null;
    const results = picker.querySelector('.picker-results');
    picker.querySelector('.picker-search').addEventListener('input', e => {
      results.innerHTML = pickerResultsHtml(e.target.value, restrictState, scope);
    });
    picker.querySelector('.picker-cancel').addEventListener('click', () => {
      state.ui.openPicker = null;
      renderPassages();
    });
    results.addEventListener('click', e => {
      const item = e.target.closest('.picker-item');
      if (!item) return;
      const [st, subject, code] = item.dataset.tag.split('|');
      tagTarget(s, section, +iStr).standard = { state: st, subject, code };
      state.ui.openPicker = null;
      saveSets();
      toast(`Tagged ${code}`);
      renderPassages();
    });
  }
}

let setListTimer;
function renderSetListSoon() {
  clearTimeout(setListTimer);
  setListTimer = setTimeout(renderSetList, 400);
}

/* Side panel: cross-state alignment status for the set's primary standard,
   including whether each aligned standard is loaded in the CMS. */
function renderSetSide() {
  const panel = document.getElementById('setSidePanel');
  const s = currentSet();
  if (!s) { panel.innerHTML = ''; return; }

  const genreLabel = (GENRES.find(g => g.key === s.genre) || {}).label;
  const istLabel = (ITEM_SET_TYPES.find(t => t.key === s.itemSetType) || {}).label;
  let html = `<div class="side-title">Cross-State Alignment</div>
    <div class="side-summary">
      ${istLabel ? `<span class="chip">${esc(istLabel)}</span>` : '<span class="chip chip-warn">No item set type</span>'}
      ${genreLabel ? `<span class="chip">${esc(genreLabel)}</span>` : '<span class="chip chip-warn">No genre</span>'}
      ${s.gaGrade ? `<span class="chip">GA Grade ${esc(s.gaGrade)}</span>` : ''}
      ${s.gaSubtopic ? `<span class="chip">${esc(s.gaSubtopic)}</span>` : ''}
    </div>`;

  if (!s.standard) {
    html += `<div class="align-mini-empty" style="margin-top:14px">Tag a primary standard to see its approved alignments across states.</div>`;
    panel.innerHTML = html;
    return;
  }

  const tag = s.standard;
  const std = tagStd(tag);
  html += `
    <div class="side-block">
      <div class="align-mini-title">Tagged standard</div>
      <div class="align-mini-item">
        <span class="align-mini-code">${esc(tag.code)}</span>
        <span class="chip">${STATE_NAMES[tag.state]}</span>
        ${std && std.grade ? `<span class="chip">${esc(gradeLabel(std.grade))}</span>` : ''}
        ${std ? cmsChip(std) : ''}
      </div>
      ${std ? `<div class="align-mini-desc" style="margin-top:4px">${esc(std.description)}</div>` : ''}
    </div>`;

  if (!std) {
    html += `<div class="side-block"><div class="align-mini-empty">This tagged standard is no longer in the loaded data.</div></div>`;
    panel.innerHTML = html;
    return;
  }

  if (tag.state === 'ALL') {
    html += `<div class="side-block"><div class="align-mini-empty">Universal standard — applies to all states; no cross-state alignment needed.</div></div>`;
    panel.innerHTML = html;
    wireCmsChips(panel);
    return;
  }

  const hits = alignedTo(std);
  const pending = linksFor(std).filter(l => statusOf(l) === 'pending' && linkWithinSpan(l)).length;

  // One block per other state — scales to however many states are loaded.
  otherStates(std.state).forEach(os => {
    const inState = hits.filter(h => h.std.state === os);
    html += `<div class="side-block"><div class="align-mini-title">${STATE_NAMES[os]} — approved</div>`;
    if (inState.length) {
      html += inState.map(h => `<div class="side-align-item">
        <div class="align-mini-item">
          <span class="align-mini-code">${esc(h.std.code)}</span>
          <span class="chip">G${esc(h.std.grade)}</span>
          ${crossGradeChip(std, h.std)}
          ${cmsChip(h.std)}
        </div>
        <div class="align-mini-desc">${esc(h.std.description)}</div>
      </div>`).join('');
    } else if (isNoAlign(std)) {
      html += `<div class="noalign-inline">🚫 No Alignment Possible — reviewed, no ${STATE_NAMES[os]} equivalent.</div>`;
    } else {
      html += `<div class="align-mini-empty">Nothing approved yet${pending ? ` — ${pending} membership${pending > 1 ? 's' : ''} pending in the Review Queue` : ''}.</div>`;
    }
    html += `</div>`;
  });

  panel.innerHTML = html;
  wireCmsChips(panel);
}

function cmsChip(std) {
  const key = keyOf(std);
  const loaded = !!state.cms[key];
  return `<button class="cms-chip ${loaded ? 'loaded' : ''}" data-cms="${esc(key)}" title="Click to toggle CMS status">
    ${loaded ? '✓ In CMS' : 'Not in CMS'}</button>`;
}
function wireCmsChips(panel) {
  panel.querySelectorAll('[data-cms]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.cms;
      if (state.cms[key]) delete state.cms[key]; else state.cms[key] = true;
      pushState();
      renderSetSide();
    });
  });
}

function renderPassages() {
  renderSetList();
  renderSetEditor();
  renderSetSide();
}

/* ---------- passage input ----------
   The point of the whole alignment exercise: a per-grade passage library you don't have to
   keep building. A set tagged to one state's standard automatically serves every state
   aligned to it, so Georgia Grade 4 fills up with passages written for Ohio Grade 4.

   LISTED   — the set was built for this grade.
   UNLISTED — it arrived over a cross-grade alignment you assigned (Ohio G4 → Texas G5).
              Cross-grade alignments only carry passages once assigned; until then the
              content stays where it was written. */
function setNativeGrade(s) {
  if (s.gaGrade) return String(s.gaGrade);
  const std = tagStd(s.standard);
  return std ? String(std.grade) : null;
}

// Every (state, grade) this passage set serves, and how it got there.
function setServes(s) {
  const std = tagStd(s.standard);
  if (!std || std.state === 'ALL') return [];
  const native = setNativeGrade(s);
  const out = [];
  out.push({ state: std.state, grade: String(std.grade), via: null, unlisted: false, std });
  alignedTo(std).forEach(h => {
    const cross = isCrossGrade(std, h.std);
    // A cross-grade alignment carries passages only once it's been assigned.
    if (cross && !isCrossAssigned(keyOf(std), keyOf(h.std))) return;
    out.push({
      state: h.std.state, grade: String(h.std.grade), via: h.via || std,
      unlisted: String(h.std.grade) !== String(native),
      std: h.std,
    });
  });
  return out;
}

function inputKey(setId, st, grade) { return `${setId}|${st}:${grade}`; }

function setsForGrade(st, grade) {
  const rows = [];
  state.sets.forEach(s => {
    const hit = setServes(s).find(x => x.state === st && x.grade === String(grade));
    if (!hit) return;
    if (state.setDismiss[inputKey(s.id, st, grade)]) return;
    rows.push({ set: s, hit });
  });
  return rows;
}

function inputCard(row, st, grade) {
  const { set: s, hit } = row;
  const k = inputKey(s.id, st, grade);
  const inCms = !!state.setCms[k];
  const titles = s.passages.filter(p => p.title).map(p => p.title);
  const tagged = [...s.questions, ...s.peerRevision].filter(q => q.standard).length;
  return `
    <div class="review-card ${inCms ? 'decided-approved' : ''}">
      <div class="concept-head">
        <div class="concept-title">${esc(s.title || 'Untitled set')}</div>
        <div class="concept-desc">${titles.length ? esc(titles.join(' · ')) : `${s.passages.length} passage${s.passages.length !== 1 ? 's' : ''}, untitled`}</div>
        <div class="concept-meta">
          ${s.passageId ? `<span class="chip">ID ${esc(s.passageId)}</span>` : ''}
          <span class="chip ${hit.unlisted ? 'chip-cross' : ''}">${hit.unlisted ? '⇄ Unlisted — written for G' + esc(setNativeGrade(s)) : 'Listed'}</span>
          <span class="chip">${esc(hit.std.code)}</span>
          ${hit.via ? `<span class="chip chip-concept">arrived via ${STATE_NAMES[hit.via.state]} ${esc(hit.via.code)}</span>` : '<span class="chip">tagged directly</span>'}
          <span class="chip">${tagged} question${tagged === 1 ? '' : 's'} tagged</span>
        </div>
      </div>
      <div class="review-foot">
        ${inCms
          ? `<span class="status-chip approved">✓ Developed in CMS</span>
             <button class="act-btn reset" data-iact="uncms" data-id="${esc(k)}">Undo</button>`
          : `<button class="act-btn approve" data-iact="cms" data-id="${esc(k)}">✓ Developed in CMS</button>`}
        <button class="act-btn reject" data-iact="dismiss" data-id="${esc(k)}"
          title="This passage doesn't belong in this grade">Dismiss from Grade</button>
      </div>
    </div>`;
}

function renderInput() {
  const stSel = document.getElementById('inState');
  const gSel = document.getElementById('inGrade');
  if (!stSel) return;
  if (!stSel.options.length) {
    stSel.innerHTML = STATES.map(s => `<option value="${s}">${STATE_NAMES[s]}</option>`).join('');
    gSel.innerHTML = GRADES.map(g => `<option value="${g}">Grade ${g}</option>`).join('');
  }
  stSel.value = state.ui.inState;
  gSel.value = state.ui.inGrade;

  const st = state.ui.inState, grade = state.ui.inGrade;
  const rows = setsForGrade(st, grade);
  const listed = rows.filter(r => !r.hit.unlisted);
  const unlisted = rows.filter(r => r.hit.unlisted);
  const done = rows.filter(r => state.setCms[inputKey(r.set.id, st, grade)]).length;
  const dismissed = state.sets.filter(s => state.setDismiss[inputKey(s.id, st, grade)]).length;

  document.getElementById('inputProgress').textContent =
    `${rows.length} passage${rows.length === 1 ? '' : 's'} for ${STATE_NAMES[st]} Grade ${grade} · `
    + `${listed.length} listed, ${unlisted.length} unlisted · ${done} in CMS`
    + (dismissed ? ` · ${dismissed} dismissed` : '');

  const box = document.getElementById('inputList');
  box.innerHTML = '';
  if (!rows.length) {
    box.appendChild(el(`<div class="review-empty">
      No passages serve ${STATE_NAMES[st]} Grade ${grade} yet.<br>
      <span style="font-size:12.5px; color:var(--ink-faint)">A passage lands here when its primary standard is a ${STATE_NAMES[st]} Grade ${grade} standard,
      or is aligned to one. Build sets in Passage Sets, and approve alignments in the Review Queue to make them cross over.</span>
    </div>`));
    return;
  }
  const section = (label, list) => {
    if (!list.length) return;
    box.appendChild(el(`<div class="align-section-title">${label} (${list.length})<span class="rule"></span></div>`));
    list.forEach(r => {
      const card = el(inputCard(r, st, grade));
      card.querySelectorAll('[data-iact]').forEach(b =>
        b.addEventListener('click', () => handleInputAction(b.dataset.iact, b.dataset.id)));
      box.appendChild(card);
    });
  };
  section('Listed — written for this grade', listed);
  section('Unlisted — arrived from another grade', unlisted);
}

function handleInputAction(act, key) {
  if (act === 'cms') { state.setCms[key] = true; toast('Marked developed in CMS'); }
  else if (act === 'uncms') { delete state.setCms[key]; toast('CMS mark removed'); }
  else if (act === 'dismiss') { state.setDismiss[key] = true; toast('Dismissed from this grade'); }
  pushState();
  renderInput();
}

/* ---------- view switching + init ---------- */
function renderAll() {
  renderStdList();
  renderDetail();
  renderReview();
  renderBadge();
  renderPassages();
  renderInput();
}

function init() {
  document.getElementById('navTabs').addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    state.ui.view = tab.dataset.view;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
    document.getElementById('explorerView').classList.toggle('hidden', state.ui.view !== 'explorer');
    document.getElementById('reviewView').classList.toggle('hidden', state.ui.view !== 'review');
    document.getElementById('passagesView').classList.toggle('hidden', state.ui.view !== 'passages');
    document.getElementById('inputView').classList.toggle('hidden', state.ui.view !== 'input');
  });

  document.getElementById('inState').addEventListener('change', e => {
    state.ui.inState = e.target.value; renderInput();
  });
  document.getElementById('inGrade').addEventListener('change', e => {
    state.ui.inGrade = e.target.value; renderInput();
  });

  document.getElementById('newSetBtn').addEventListener('click', newPassageSet);

  document.getElementById('saveBadge').addEventListener('click', async () => {
    const t = prompt('Paste your GitHub access token to enable cloud saving (stored only in this browser):', ghToken || '');
    if (t === null) return;
    ghToken = t.trim();
    localStorage.setItem(LS_GH_TOKEN, ghToken);
    updateSaveBadge();
    if (ghToken) {
      try {
        const s = await ghLoad();
        serverAvailable = true;
        mergeServerState(s);
        renderAll();
        toast('✓ Cloud saving connected');
      } catch {
        toast('⚠ Token didn’t work — check it and try again');
      }
    }
  });

  bindSeg('stateSeg', 'expState', v => { state.ui.expState = v; state.ui.selectedKey = null; renderAll(); });
  bindSeg('subjectSeg', 'expSubject', v => { state.ui.expSubject = v; state.ui.selectedKey = null; renderAll(); });
  bindSeg('revSubjectSeg', 'revSubject', v => { state.ui.revSubject = v; renderReview(); });
  bindSeg('revStateSeg', 'revState', v => { state.ui.revState = v; renderReview(); });
  bindSeg('revStatusSeg', 'revStatus', v => { state.ui.revStatus = v; renderReview(); });

  renderGradeRow('gradeRow', state.ui.expGrade, g => {
    state.ui.expGrade = g; state.ui.selectedKey = null;
    document.querySelectorAll('#gradeRow .grade-btn').forEach(b => b.classList.toggle('active', b.textContent === g));
    renderAll();
  });
  renderGradeRow('revGradeRow', state.ui.revGrade, g => {
    state.ui.revGrade = g;
    document.querySelectorAll('#revGradeRow .grade-btn').forEach(b => b.classList.toggle('active', b.textContent === g));
    renderReview();
  });

  document.getElementById('stdSearch').addEventListener('input', e => {
    state.ui.search = e.target.value;
    renderStdList();
  });
  document.getElementById('exportBtn').addEventListener('click', exportData);

  Promise.all([loadData(), loadPersisted()]).then(renderAll);
}

init();
