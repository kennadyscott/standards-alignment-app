/* Standards Alignment — multi-state concept spine.

   Standards from every state attach to shared, state-neutral CONCEPTS. Two standards
   are aligned when both hold an approved membership in the same concept — alignment is
   derived, never stored pairwise. That keeps the reviewer's work linear in the number of
   states (each new state maps its standards onto the existing concept library) instead
   of quadratic in the number of state pairs. */

const GRADES = ['K','1','2','3','4','5','6','7','8'];
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
  concepts: [],             // the concept library
  conceptById: new Map(),
  memberships: [],          // { id, conceptId, key, confidence, rationale, source }
  byConcept: new Map(),     // conceptId -> memberships[]
  byStandard: new Map(),    // standard key -> memberships[]
  decisions: {},            // membership id (m-…) OR concept id (c-…) -> 'approved' | 'rejected'
  conceptEdits: {},         // conceptId -> { title, description } (reviewer's wording wins)
  merged: {},               // conceptId -> conceptId it was merged into
  noAlign: {},              // `${state}:${subject}:${code}` -> true (reviewed: belongs to no concept)
  cms: {},                  // `${state}:${subject}:${code}` -> true (standard is loaded in the CMS)
  severed: {},              // `${keyA}||${keyB}` -> true (override: not aligned despite a shared concept)
  sets: [],                 // passage sets
  ui: {
    view: 'explorer',
    expState: 'OH', expSubject: 'social_studies', expGrade: '4',
    selectedKey: null, search: '',
    revSubject: 'social_studies', revGrade: '4', revStatus: 'pending', revState: 'ALL',
    conSubject: 'social_studies', conStatus: 'pending', conSearch: '',
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
const LS_CEDITS = 'sa_concept_edits_v1';
const LS_MERGED = 'sa_merged_v1';

function loadLocal() {
  try { state.decisions = JSON.parse(localStorage.getItem(LS_DECISIONS)) || {}; } catch { state.decisions = {}; }
  try { state.manual = JSON.parse(localStorage.getItem(LS_MANUAL)) || []; } catch { state.manual = []; }
  try { state.noAlign = JSON.parse(localStorage.getItem(LS_NOALIGN)) || {}; } catch { state.noAlign = {}; }
  try { state.cms = JSON.parse(localStorage.getItem(LS_CMS)) || {}; } catch { state.cms = {}; }
  try { state.severed = JSON.parse(localStorage.getItem(LS_SEVERED)) || {}; } catch { state.severed = {}; }
  try { state.conceptEdits = JSON.parse(localStorage.getItem(LS_CEDITS)) || {}; } catch { state.conceptEdits = {}; }
  try { state.merged = JSON.parse(localStorage.getItem(LS_MERGED)) || {}; } catch { state.merged = {}; }
}
function mirrorLocal() {
  localStorage.setItem(LS_DECISIONS, JSON.stringify(state.decisions));
  localStorage.setItem(LS_MANUAL, JSON.stringify(state.manual));
  localStorage.setItem(LS_NOALIGN, JSON.stringify(state.noAlign));
  localStorage.setItem(LS_CMS, JSON.stringify(state.cms));
  localStorage.setItem(LS_SEVERED, JSON.stringify(state.severed));
  localStorage.setItem(LS_CEDITS, JSON.stringify(state.conceptEdits));
  localStorage.setItem(LS_MERGED, JSON.stringify(state.merged));
  localStorage.setItem(LS_SETS, JSON.stringify(state.sets));
}

function stateBody() {
  return JSON.stringify({
    // `decisions` holds membership ids now. The old pairwise ids (ss4-01…) are left in
    // place untouched: they are the provenance for the seeded concepts and the only way
    // back if the concept spine ever needs to be rebuilt. Never prune them.
    decisions: state.decisions,
    manual: state.manual,
    noAlign: state.noAlign,
    cms: state.cms,
    severed: state.severed,
    conceptEdits: state.conceptEdits,
    merged: state.merged,
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
      conceptEdits: { ...state.conceptEdits, ...(s.conceptEdits || {}) },
      mergedMap: { ...state.merged, ...(s.merged || {}) },
      sets: dedupeById([...(s.sets || []), ...state.sets]),
    };
    state.decisions = merged.decisions;
    state.manual = merged.manual;
    state.noAlign = merged.noAlign;
    state.cms = merged.cms;
    state.severed = merged.severed;
    state.conceptEdits = merged.conceptEdits;
    state.merged = merged.mergedMap;
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
async function fetchJson(path) {
  try {
    const r = await fetch(path);
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

  const [concepts, memberships] = await Promise.all([
    fetchJson('data/concepts.json'), fetchJson('data/memberships.json'),
  ]);
  state.concepts = concepts || [];
  state.memberships = (memberships || []).filter(m => state.byKey.has(m.key));
  indexConcepts();
}

// Follow a merge chain to the concept that actually holds the members now.
function mergeTarget(id) {
  const seen = new Set();
  while (state.merged[id] && !seen.has(id)) { seen.add(id); id = state.merged[id]; }
  return id;
}
function isMergedAway(id) { return !!state.merged[id]; }

function indexConcepts() {
  // The reviewer's wording wins over the drafted wording.
  state.conceptById = new Map(state.concepts.map(c => {
    const e = state.conceptEdits[c.id] || {};
    return [c.id, { ...c, title: e.title ?? c.title, description: e.description ?? c.description }];
  }));
  state.byConcept = new Map();
  state.byStandard = new Map();
  state.memberships.forEach(m => {
    const cid = mergeTarget(m.conceptId);
    if (!state.byConcept.has(cid)) state.byConcept.set(cid, []);
    state.byConcept.get(cid).push(m);
    if (!state.byStandard.has(m.key)) state.byStandard.set(m.key, []);
    state.byStandard.get(m.key).push(m);
  });
}

/* A concept is approved only if the reviewer approved it. Seeded concepts came from pairs
   they had already approved, so those start approved; every drafted concept starts pending.
   Nothing the reviewer has not approved may derive an alignment — that is the contract. */
function conceptStatus(c) {
  if (!c) return 'pending';
  return state.decisions[c.id] || (c.source === 'seed' ? 'approved' : 'pending');
}
function effectiveConcept(id) { return state.conceptById.get(mergeTarget(id)); }
function liveConcepts() { return state.concepts.filter(c => !isMergedAway(c.id)); }

/* ---------- membership + derived-alignment helpers ----------
   A membership says "this standard belongs to this concept". Seed memberships came from
   pairs the reviewer already approved, so they start approved; everything else is pending
   until reviewed. Alignment between two standards is DERIVED: both hold an approved
   membership in a common concept, and the pair has not been explicitly severed. */
function statusOf(m) {
  return state.decisions[m.id] || (m.source === 'seed' ? 'approved' : 'pending');
}
function membershipsFor(std) { return state.byStandard.get(keyOf(std)) || []; }
// Only APPROVED memberships in APPROVED concepts count. A pending concept derives nothing.
function conceptsFor(std) {
  const out = new Map();
  membershipsFor(std).forEach(m => {
    if (statusOf(m) !== 'approved') return;
    const c = effectiveConcept(m.conceptId);
    if (c && conceptStatus(c) === 'approved') out.set(c.id, c);
  });
  return [...out.values()];
}
function severKey(a, b) { return [a, b].sort().join('||'); }
function isSevered(a, b) { return !!state.severed[severKey(a, b)]; }

// Every standard in other states that shares an approved concept with `std`.
// Returns [{ std, concept, membership }], deduped, minus severed pairs.
function alignedTo(std) {
  const selfKey = keyOf(std);
  const out = new Map();
  conceptsFor(std).forEach(concept => {
    (state.byConcept.get(concept.id) || []).forEach(m => {
      if (m.key === selfKey || statusOf(m) !== 'approved') return;
      const other = state.byKey.get(m.key);
      if (!other || other.state === std.state) return;
      if (isSevered(selfKey, m.key)) return;
      if (!out.has(m.key)) out.set(m.key, { std: other, concept, membership: m });
    });
  });
  return [...out.values()];
}

function isNoAlign(std) { return !!state.noAlign[keyOf(std)]; }

// status dot for a standard in the list: approved (sits in ≥1 concept), noalign (reviewed:
// belongs to no concept), pending (has ≥1 unreviewed membership), none (not yet reviewed)
function standardStatus(std) {
  const list = membershipsFor(std);
  if (list.some(m => statusOf(m) === 'approved')) return 'approved';
  if (isNoAlign(std)) return 'noalign';
  if (list.some(m => statusOf(m) === 'pending')) return 'pending';
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

// Amber chip when a standard sits at a different grade than the concept's band, or than
// the standard it's aligned to — the states sequence the same content differently.
function crossGradeChip(a, b) {
  if (!a || !b || String(a.grade) === String(b.grade)) return '';
  return `<span class="chip chip-cross" title="These standards sit at different grade levels — the states sequence this content differently.">⇄ Cross-grade · ${esc(a.state)} G${esc(a.grade)} / ${esc(b.state)} G${esc(b.grade)}</span>`;
}

function conceptChip(c) {
  if (!c) return '';
  return `<span class="chip chip-concept" title="${esc(c.description || '')}">◈ ${esc(c.title)}</span>`;
}

/* One aligned standard, shown against the standard currently selected. The concept that
   links them is named on the card — a derived alignment must always show its reason. */
function alignedCard(sel, hit) {
  const { std, concept, membership } = hit;
  const st = statusOf(membership);
  return `
    <div class="review-card">
      <div class="review-pair">
        ${pairSide(sel, sel.state)}
        <div class="pair-mid">⇄</div>
        ${pairSide(std, std.state)}
      </div>
      <div class="review-foot">
        ${conceptChip(concept)}
        <span class="conf-chip">confidence: ${esc(membership.confidence || '—')}</span>
        ${crossGradeChip(sel, std)}
        ${membership.rationale ? `<div class="rationale"><b>Why:</b> ${esc(membership.rationale)}</div>` : ''}
        <button class="act-btn reject" data-act="sever" data-id="${esc(severKey(keyOf(sel), keyOf(std)))}"
          title="These share a concept but are not actually aligned">✂ Not aligned</button>
      </div>
    </div>`;
}

/* A membership under review: does this standard belong to this concept? */
function membershipCard(m) {
  const std = state.byKey.get(m.key);
  const concept = state.conceptById.get(m.conceptId);
  if (!std || !concept) return '';
  const st = statusOf(m);
  // What this membership would newly align to, if approved — the real consequence.
  const peers = (state.byConcept.get(m.conceptId) || [])
    .filter(x => x.key !== m.key && statusOf(x) === 'approved')
    .map(x => state.byKey.get(x.key)).filter(Boolean)
    .filter(x => x.state !== std.state);
  const actions = st === 'pending'
    ? `<button class="act-btn approve" data-act="approved" data-id="${m.id}">✓ Approve</button>
       <button class="act-btn reject" data-act="rejected" data-id="${m.id}">✕ Reject</button>`
    : `<span class="status-chip ${st}">${st}</span>
       <button class="act-btn reset" data-act="pending" data-id="${m.id}">Undo</button>`;
  return `
    <div class="review-card ${st !== 'pending' ? 'decided-' + st : ''}">
      <div class="concept-head">
        <div class="concept-title">◈ ${esc(concept.title)}</div>
        <div class="concept-desc">${esc(concept.description || '')}</div>
        <div class="concept-meta">
          <span class="chip">${SUBJECT_NAMES[concept.subject] || concept.subject}</span>
          ${concept.gradeBand ? `<span class="chip">${esc(concept.gradeBand)}</span>` : ''}
          ${m.source === 'seed' ? '<span class="chip">seeded from your approved pairs</span>' : ''}
        </div>
      </div>
      <div class="member-q">Does this standard belong to the concept?</div>
      ${pairSide(std, std.state)}
      ${peers.length ? `<div class="member-peers"><b>Approving aligns it to:</b> ${peers.map(p =>
        `<span class="chip">${STATE_NAMES[p.state]} ${esc(p.code)} · G${esc(p.grade)}</span>`).join(' ')}</div>`
        : `<div class="member-peers member-peers-empty">No other state has an approved standard in this concept yet.</div>`}
      <div class="review-foot">
        <span class="conf-chip">confidence: ${esc(m.confidence || '—')}</span>
        ${m.rationale ? `<div class="rationale"><b>Why:</b> ${esc(m.rationale)}</div>` : ''}
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
  const pending = membershipsFor(std).filter(m => statusOf(m) === 'pending');
  const concepts = conceptsFor(std);
  const naKey = keyOf(std);

  let html = stdCard(std, `Selected standard — ${STATE_NAMES[std.state]} · ${SUBJECT_NAMES[std.subject]} · Grade ${std.grade}`);

  // The concepts this standard belongs to — the reason any alignment below exists.
  if (concepts.length) {
    html += `<div class="align-section-title">Concepts this standard belongs to (${concepts.length})<span class="rule"></span></div>
      <div class="concept-list">${concepts.map(c => `
        <div class="concept-row">
          <div class="concept-title">◈ ${esc(c.title)}</div>
          <div class="concept-desc">${esc(c.description || '')}</div>
        </div>`).join('')}</div>`;
  }

  // One section per other state — this is what "all states at once" looks like.
  otherStates(std.state).forEach(os => {
    const inState = hits.filter(h => h.std.state === os);
    html += `<div class="align-section-title">Aligned standards in ${STATE_NAMES[os]} (${inState.length})<span class="rule"></span></div>`;
    if (inState.length) {
      html += inState.map(h => alignedCard(std, h)).join('');
    } else if (isNoAlign(std)) {
      html += `<div class="no-align">Reviewed — belongs to no concept, so no ${STATE_NAMES[os]} equivalent.</div>`;
    } else {
      html += `<div class="no-align">No ${STATE_NAMES[os]} standard shares an approved concept with this one yet.</div>`;
    }
  });

  if (isNoAlign(std)) {
    html += `
      <div class="noalign-box">
        <div class="noalign-title">🚫 No Alignment Possible</div>
        <div class="noalign-sub">Reviewed — this standard belongs to no concept, in any state.</div>
        <button class="act-btn reset" data-act="unmark-noalign" data-id="${esc(naKey)}">Undo</button>
      </div>`;
  } else if (!concepts.length) {
    html += `
      <div class="no-align">
        Not in any concept yet${pending.length ? ' — review the pending memberships below' : ''}.<br>
        <button class="act-btn reject" data-act="mark-noalign" data-id="${esc(naKey)}" style="margin-top:10px">🚫 Mark as No Alignment Possible</button>
      </div>`;
  }

  if (pending.length) {
    html += `<div class="align-section-title">Pending concept memberships (${pending.length})<span class="rule"></span></div>`;
    html += pending.map(m => membershipCard(m)).join('');
  }

  html += renderManualAdd(std);
  content.innerHTML = html;

  content.querySelectorAll('[data-act]').forEach(btn => {
    btn.addEventListener('click', () => handleAction(btn.dataset.act, btn.dataset.id));
  });
  wireManualAdd(content, std);
}

// Manual attach: put this standard into an existing concept. Aligning it to every other
// state's standards in that concept follows automatically — that is the whole point.
function renderManualAdd(std) {
  return `
    <div class="align-section-title">Attach to a concept<span class="rule"></span></div>
    <div class="source-card" style="margin-bottom:0">
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
        <select id="manualPick" style="font:inherit; padding:8px 10px; border:1px solid var(--line); border-radius:8px; flex:1; min-width:260px"></select>
        <button class="act-btn approve" id="manualAddBtn">+ Attach as approved</button>
      </div>
      <div style="font-size:12px; color:var(--ink-faint); margin-top:8px">
        Pick a ${SUBJECT_NAMES[std.subject]} concept this standard belongs to. It becomes aligned to every
        other state's approved standards in that concept.
      </div>
    </div>`;
}

function wireManualAdd(content, std) {
  const sel = content.querySelector('#manualPick');
  const btn = content.querySelector('#manualAddBtn');
  if (!sel) return;
  const already = new Set(membershipsFor(std).map(m => m.conceptId));
  const options = state.concepts
    .filter(c => c.subject === std.subject && !already.has(c.id))
    .sort((a, b) => a.title.localeCompare(b.title));
  sel.innerHTML = '<option value="">Choose a concept…</option>' + options.map(c =>
    `<option value="${esc(c.id)}">${esc(c.title)}${c.gradeBand ? ` · ${esc(c.gradeBand)}` : ''}</option>`
  ).join('');
  btn.addEventListener('click', () => {
    if (!sel.value) return;
    const m = {
      id: `m-manual-${Date.now()}`,
      conceptId: sel.value,
      key: keyOf(std),
      confidence: 'manual',
      rationale: 'Attached manually by reviewer.',
      source: 'manual',
    };
    state.memberships.push(m);
    state.decisions[m.id] = 'approved';
    indexConcepts();
    pushState();
    toast(`Attached to ${state.conceptById.get(sel.value).title}`);
    renderAll();
  });
}

function handleAction(act, id) {
  if (act === 'mark-noalign') {
    state.noAlign[id] = true;
    // belongs to no concept ⇒ reject its still-pending memberships
    (state.byStandard.get(id) || []).filter(m => statusOf(m) === 'pending')
      .forEach(m => { state.decisions[m.id] = 'rejected'; });
    saveNoAlign();
    toast('Marked: No Alignment Possible');
  } else if (act === 'unmark-noalign') {
    delete state.noAlign[id];
    saveNoAlign();
    toast('No-alignment mark removed');
  } else if (act === 'sever') {
    // Escape hatch: these two share a concept but are not actually aligned. Overrides the
    // derivation for this pair only, without disturbing either membership.
    state.severed[id] = true;
    pushState();
    toast('Marked as not aligned');
  } else if (act === 'unsever') {
    delete state.severed[id];
    pushState();
    toast('Alignment restored');
  } else if (act === 'pending') {
    delete state.decisions[id];
    saveDecisions();
    toast('Reset to pending');
  } else {
    state.decisions[id] = act;
    saveDecisions();
    toast(act === 'approved' ? 'Membership approved ✓' : 'Membership rejected');
  }
  renderAll();
}

/* ---------- review queue ----------
   The reviewable unit is a MEMBERSHIP — "does this standard belong to this concept?" —
   not a state pair. That is what keeps the work linear: a new state costs one pass over
   its own standards, no matter how many states are already in the library. */
function reviewScope() {
  const { revSubject, revGrade, revState } = state.ui;
  return state.memberships.filter(m => {
    const std = state.byKey.get(m.key);
    if (!std || std.subject !== revSubject) return false;
    if (String(std.grade) !== String(revGrade) && std.grade !== 'All') return false;
    return revState === 'ALL' || std.state === revState;
  });
}

function renderReview() {
  const { revSubject, revGrade, revStatus, revState } = state.ui;
  const inScope = reviewScope();
  const shown = inScope.filter(m => revStatus === 'all' || statusOf(m) === revStatus);
  const done = inScope.filter(m => statusOf(m) !== 'pending').length;

  const stateLabel = revState === 'ALL' ? 'all states' : STATE_NAMES[revState];
  document.getElementById('reviewProgress').textContent = inScope.length
    ? `${done} of ${inScope.length} memberships reviewed · Grade ${revGrade} ${SUBJECT_NAMES[revSubject]} · ${stateLabel}`
    : '';

  const box = document.getElementById('reviewList');
  box.innerHTML = '';
  if (!shown.length) {
    box.appendChild(el(`<div class="review-empty">${
      inScope.length
        ? (revStatus === 'pending' ? '🎉 All memberships for this grade are reviewed.' : `No ${revStatus === 'all' ? '' : revStatus + ' '}memberships here.`)
        : 'No concept memberships drafted for this grade/subject yet.'
    }</div>`));
    return;
  }

  // Group by concept so the reviewer sees a concept once with its candidates together,
  // rather than the same concept restated on every card.
  const groups = new Map();
  shown.forEach(m => {
    if (!groups.has(m.conceptId)) groups.set(m.conceptId, []);
    groups.get(m.conceptId).push(m);
  });

  [...groups.entries()].forEach(([cid, ms]) => {
    const c = state.conceptById.get(cid);
    box.appendChild(el(`<div class="align-section-title">◈ ${esc(c ? c.title : cid)} <span class="rule"></span></div>`));
    ms.forEach(m => {
      const card = el(membershipCard(m) || '<div></div>');
      card.querySelectorAll('[data-act]').forEach(btn => {
        btn.addEventListener('click', () => handleAction(btn.dataset.act, btn.dataset.id));
      });
      box.appendChild(card);
    });
  });
}

function renderBadge() {
  const pending = state.memberships.filter(m => statusOf(m) === 'pending').length;
  document.getElementById('pendingBadge').textContent = pending;
  const conPending = liveConcepts().filter(c => conceptStatus(state.conceptById.get(c.id)) === 'pending').length;
  document.getElementById('conceptBadge').textContent = conPending;
}

/* ---------- concepts ----------
   The concept library is the spine: every state that ever joins maps onto it, so a wrong
   concept is wrong everywhere at once. This is where the reviewer curates it — approve,
   reword, merge duplicates, or reject. Nothing derives an alignment until approved. */
function conceptScope() {
  const { conSubject, conStatus, conSearch } = state.ui;
  const q = conSearch.toLowerCase().trim();
  return liveConcepts()
    .map(c => state.conceptById.get(c.id))
    .filter(c => c.subject === conSubject)
    .filter(c => {
      const st = conceptStatus(c);
      if (conStatus === 'all') return true;
      if (conStatus === 'flagged') return !!c.needsReview;
      if (conStatus === 'merge') return !!(c.mergeCandidates && c.mergeCandidates.some(id => !isMergedAway(id)));
      return st === conStatus;
    })
    .filter(c => !q || `${c.title} ${c.description}`.toLowerCase().includes(q));
}

function conceptCard(c) {
  const st = conceptStatus(c);
  // Show EVERY candidate member, not just approved ones — a concept can't be judged
  // without seeing the standards it would gather, and drafted members are still pending.
  const all = state.byConcept.get(c.id) || [];
  const rejected = new Set(all.filter(m => statusOf(m) === 'rejected').map(m => m.id));
  const byState = {};
  all.forEach(m => {
    if (rejected.has(m.id)) return;
    const s = state.byKey.get(m.key);
    if (!s) return;
    (byState[s.state] = byState[s.state] || []).push({ std: s, pending: statusOf(m) !== 'approved' });
  });
  // Alignments live today (approved concept + approved memberships on both sides).
  const approvedByState = {};
  all.filter(m => statusOf(m) === 'approved').forEach(m => {
    const s = state.byKey.get(m.key);
    if (s) (approvedByState[s.state] = approvedByState[s.state] || []).push(s);
  });
  const countPairs = map => {
    const ks = Object.keys(map);
    let n = 0;
    for (let i = 0; i < ks.length; i++)
      for (let j = i + 1; j < ks.length; j++) n += map[ks[i]].length * map[ks[j]].length;
    return n;
  };
  const stateList = Object.keys(byState);
  const pairs = countPairs(approvedByState);
  const potential = countPairs(Object.fromEntries(stateList.map(s => [s, byState[s]])));

  const mergeInto = (c.mergeCandidates || []).filter(id => !isMergedAway(id) && id !== c.id);
  const actions = st === 'pending'
    ? `<button class="act-btn approve" data-cact="approved" data-id="${c.id}">✓ Approve concept</button>
       <button class="act-btn reject" data-cact="rejected" data-id="${c.id}">✕ Reject</button>`
    : `<span class="status-chip ${st}">${st}</span>
       <button class="act-btn reset" data-cact="pending" data-id="${c.id}">Undo</button>`;

  return `
    <div class="review-card ${st !== 'pending' ? 'decided-' + st : ''}">
      <div class="concept-head">
        <div class="concept-meta" style="margin:0 0 8px">
          <span class="chip">${SUBJECT_NAMES[c.subject] || c.subject}</span>
          ${c.gradeBand ? `<span class="chip">${esc(c.gradeBand)}</span>` : ''}
          <span class="chip">${c.source === 'seed' ? 'seeded from your approved pairs' : 'drafted — needs your approval'}</span>
          ${c.needsReview ? '<span class="chip chip-warn">⚠ needs review</span>' : ''}
          ${mergeInto.length ? '<span class="chip chip-warn">⧉ duplicate</span>' : ''}
        </div>
        <label class="c-lbl">Title</label>
        <input type="text" class="ps-input c-title" data-ctitle="${c.id}" value="${esc(c.title)}">
        <label class="c-lbl" style="margin-top:8px">Membership test — a standard belongs here if…</label>
        <textarea class="ps-textarea c-desc" data-cdesc="${c.id}" rows="2">${esc(c.description || '')}</textarea>
      </div>
      ${c.note ? `<div class="concept-note"><b>Flagged:</b> ${esc(c.note)}</div>` : ''}
      <div class="member-peers">
        <b>Members:</b>
        ${stateList.length
          ? stateList.map(s => byState[s].map(x =>
              `<span class="chip ${x.pending ? 'chip-pend' : ''}" title="${x.pending ? 'Membership still pending in the Review Queue' : 'Approved membership'}">${STATE_NAMES[s]} ${esc(x.std.code)} · G${esc(x.std.grade)}${x.pending ? ' ·' : ' ✓'}</span>`).join(' ')).join(' ')
          : '<span class="member-peers-empty">none yet</span>'}
      </div>
      <div class="member-peers">
        <b>Derives now:</b> ${pairs} cross-state alignment${pairs === 1 ? '' : 's'}
        ${potential > pairs
          ? `<span class="chip chip-warn">${potential} once its pending memberships are approved too</span>` : ''}
        ${st !== 'approved' && potential ? '<span class="chip chip-warn">nothing active until this concept is approved</span>' : ''}
        ${stateList.length === 1
          ? `<span class="chip chip-warn">only ${STATE_NAMES[stateList[0]]} standards so far — derives nothing until another state is mapped into it</span>`
          : ''}
      </div>
      <div class="review-foot">
        ${mergeInto.length ? `<span class="conf-chip">merge into:</span>
          <select class="c-merge" data-cmerge="${c.id}" style="font:inherit; padding:6px 8px; border:1px solid var(--line); border-radius:8px">
            <option value="">choose…</option>
            ${mergeInto.map(id => { const t = state.conceptById.get(id); return t ? `<option value="${id}">${esc(t.title)}</option>` : ''; }).join('')}
          </select>` : ''}
        ${actions}
      </div>
    </div>`;
}

function renderConcepts() {
  const shown = conceptScope();
  const all = liveConcepts().map(c => state.conceptById.get(c.id)).filter(c => c.subject === state.ui.conSubject);
  const done = all.filter(c => conceptStatus(c) !== 'pending').length;
  document.getElementById('conceptProgress').textContent = all.length
    ? `${done} of ${all.length} concepts reviewed · ${SUBJECT_NAMES[state.ui.conSubject]}`
    : `No concepts for ${SUBJECT_NAMES[state.ui.conSubject]} yet.`;

  const box = document.getElementById('conceptList');
  box.innerHTML = '';
  if (!shown.length) {
    box.appendChild(el(`<div class="review-empty">${all.length
      ? 'Nothing matches this filter.'
      : `No ${SUBJECT_NAMES[state.ui.conSubject]} concepts exist yet — the library is seeded from approved alignments, and none have been drafted for this subject.`}</div>`));
    return;
  }
  shown.forEach(c => {
    const card = el(conceptCard(c));
    card.querySelectorAll('[data-cact]').forEach(b =>
      b.addEventListener('click', () => handleConceptAction(b.dataset.cact, b.dataset.id)));
    const t = card.querySelector('[data-ctitle]');
    if (t) t.addEventListener('input', e => editConcept(e.target.dataset.ctitle, { title: e.target.value }));
    const d = card.querySelector('[data-cdesc]');
    if (d) d.addEventListener('input', e => editConcept(e.target.dataset.cdesc, { description: e.target.value }));
    const m = card.querySelector('[data-cmerge]');
    if (m) m.addEventListener('change', e => {
      if (!e.target.value) return;
      mergeConcepts(e.target.dataset.cmerge, e.target.value);
    });
    box.appendChild(card);
  });
}

function editConcept(id, patch) {
  const base = state.concepts.find(c => c.id === id);
  if (!base) return;
  const cur = state.conceptEdits[id] || {};
  const next = { ...cur, ...patch };
  // Drop the override once it matches the drafted wording again — keeps the diff honest.
  if ((next.title ?? base.title) === base.title && (next.description ?? base.description) === base.description) {
    delete state.conceptEdits[id];
  } else {
    state.conceptEdits[id] = next;
  }
  indexConcepts();
  pushState();
  renderBadgeSoon();
}

// Merging moves `fromId`'s members onto `intoId`; the source concept stops existing for
// every purpose but provenance, so the merge stays reversible from the state file.
function mergeConcepts(fromId, intoId) {
  if (fromId === intoId) return;
  if (mergeTarget(intoId) === fromId) { toast('⚠ That would make a merge loop'); return; }
  state.merged[fromId] = intoId;
  indexConcepts();
  pushState();
  const t = state.conceptById.get(intoId);
  toast(`Merged into "${t ? t.title : intoId}"`);
  renderAll();
}

function handleConceptAction(act, id) {
  if (act === 'pending') { delete state.decisions[id]; toast('Concept reset to pending'); }
  else {
    state.decisions[id] = act;
    toast(act === 'approved' ? 'Concept approved ✓ — its alignments are now live' : 'Concept rejected — its alignments are off');
  }
  pushState();
  renderAll();
}

let badgeTimer;
function renderBadgeSoon() { clearTimeout(badgeTimer); badgeTimer = setTimeout(renderBadge, 400); }

/* ---------- export ----------
   Exports the concept library, its approved memberships, and the cross-state alignments
   they derive — so a consumer can use the alignments directly or re-derive them. */
function exportData() {
  const approvedMembers = state.memberships.filter(m => statusOf(m) === 'approved');
  const derived = [];
  const seen = new Set();
  approvedMembers.forEach(m => {
    const std = state.byKey.get(m.key);
    if (!std) return;
    alignedTo(std).forEach(h => {
      const pair = severKey(keyOf(std), keyOf(h.std));
      if (seen.has(pair)) return;
      seen.add(pair);
      derived.push({
        a: keyOf(std), b: keyOf(h.std), concept: h.concept.id,
        cross_grade: String(std.grade) !== String(h.std.grade),
      });
    });
  });
  const out = {
    exported_at: new Date().toISOString(),
    model: 'concept-spine',
    states: STATES,
    concepts: state.concepts,
    memberships: approvedMembers.map(m => ({
      concept: m.conceptId, standard: m.key,
      confidence: m.confidence, rationale: m.rationale, source: m.source || 'ai_draft',
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

/* Passages were plain strings before each one carried its own title. Sets saved then are
   still on the server, so widen them on the way in rather than migrating the state file. */
function normalizeSets() {
  state.sets.forEach(s => {
    if (!Array.isArray(s.passages)) return;
    s.passages = s.passages.map(p =>
      typeof p === 'string' ? { title: '', text: p } : { title: p.title || '', text: p.text || '' });
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
      { text: '', standard: null },
      { text: '', standard: null },
      { text: '', standard: null },
    ],
    peerRevision: [{ text: '', standard: null }],
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
  const pending = membershipsFor(std).filter(m => statusOf(m) === 'pending').length;
  if (!hits.length) {
    if (isNoAlign(std)) {
      return `<div class="align-mini noalign"><div class="align-mini-title">Aligned standards — other states</div>
        <div class="align-mini-item"><b>🚫 No Alignment Possible</b><span class="align-mini-desc">Reviewed — belongs to no concept.</span></div></div>`;
    }
    return `<div class="align-mini"><div class="align-mini-title">Approved aligned standards — other states</div>
      <div class="align-mini-empty">No approved alignment yet${pending ? ` — ${pending} membership${pending > 1 ? 's' : ''} pending in the Review Queue` : ''}.</div></div>`;
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
  on('#addQuestion', 'click', () => { s.questions.push({ text: '', standard: null }); saveSets(); renderPassages(); });
  on('#addPeer', 'click', () => { s.peerRevision.push({ text: '', standard: null }); saveSets(); renderPassages(); });

  on('[data-remove-p]', 'click', e => {
    s.passages.splice(+e.currentTarget.dataset.removeP, 1);
    if (!s.passages.length) s.passages.push({ title: '', text: '' });
    saveSets(); renderPassages();
  });
  on('[data-remove-q]', 'click', e => {
    const [section, i] = e.currentTarget.dataset.removeQ.split(':');
    const arr = section === 'peer' ? s.peerRevision : s.questions;
    arr.splice(+i, 1);
    if (!arr.length) arr.push({ text: '', standard: null });
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

  const concepts = conceptsFor(std);
  if (concepts.length) {
    html += `<div class="side-block"><div class="align-mini-title">Concepts</div>
      ${concepts.map(c => `<div class="align-mini-item"><span class="chip chip-concept" title="${esc(c.description || '')}">◈ ${esc(c.title)}</span></div>`).join('')}
    </div>`;
  }

  const hits = alignedTo(std);
  const pending = membershipsFor(std).filter(m => statusOf(m) === 'pending').length;

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
      html += `<div class="noalign-inline">🚫 No Alignment Possible — reviewed, belongs to no concept.</div>`;
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

/* ---------- view switching + init ---------- */
function renderAll() {
  renderStdList();
  renderDetail();
  renderConcepts();
  renderReview();
  renderBadge();
  renderPassages();
}

function init() {
  document.getElementById('navTabs').addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    state.ui.view = tab.dataset.view;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
    document.getElementById('explorerView').classList.toggle('hidden', state.ui.view !== 'explorer');
    document.getElementById('conceptsView').classList.toggle('hidden', state.ui.view !== 'concepts');
    document.getElementById('reviewView').classList.toggle('hidden', state.ui.view !== 'review');
    document.getElementById('passagesView').classList.toggle('hidden', state.ui.view !== 'passages');
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
  bindSeg('conSubjectSeg', 'conSubject', v => { state.ui.conSubject = v; renderConcepts(); });
  bindSeg('conStatusSeg', 'conStatus', v => { state.ui.conStatus = v; renderConcepts(); });
  document.getElementById('conSearch').addEventListener('input', e => {
    state.ui.conSearch = e.target.value; renderConcepts();
  });

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
