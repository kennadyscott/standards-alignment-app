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
  setPush: {},              // `${setId}||${alignedKey}` -> 'pushed' | 'dismissed' (per-alignment: send this passage to that state/grade's input, or keep it out)
  setStateStd: {},          // `${setId}|${state}:${grade}` -> code (the standard this passage is assigned to in that state — overrides the auto-aligned one)
  setCms: {},               // `${setId}|${state}:${grade}` -> true (developed in the CMS for that grade)
  setDismiss: {},           // `${setId}|${state}:${grade}` -> true (this passage doesn't belong in that grade)
  sets: [],                 // passage sets
  ui: {
    view: 'explorer',
    expState: 'OH', expSubject: 'social_studies', expGrade: '4',
    selectedKey: null, search: '',
    revSubject: 'social_studies', revGrade: '4', revStatus: 'pending', revState: 'ALL',
    inState: 'OH', inGrade: '4', overrideKey: null,
    inStage: 'all', inSelected: null,                  // State Lists: stage filter + selected set
    dashOpen: {}, dashState: 'OH',                     // Dashboard: expanded grades + which state's lists
    setFilterStatus: 'all', setFilterGrade: 'all',     // Master list filters
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
const LS_SETPUSH = 'sa_setpush_v1';
const LS_SETSTATESTD = 'sa_setstatestd_v1';
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
  state.setPush = readLS(LS_SETPUSH, {});
  state.setStateStd = readLS(LS_SETSTATESTD, {});
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
  localStorage.setItem(LS_SETPUSH, JSON.stringify(state.setPush));
  localStorage.setItem(LS_SETSTATESTD, JSON.stringify(state.setStateStd));
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
    setPush: state.setPush,
    setStateStd: state.setStateStd,
    setCms: state.setCms,
    setDismiss: state.setDismiss,
    sets: state.sets,
    savedAt: new Date().toISOString(),
  });
}

/* GitHub-direct persistence (used on static hosting like GitHub Pages):
   the state file lives in the PRIVATE data repo; every save is a commit. */
const GH_DATA_REPO = 'kennadyscott/standards-alignment';
// appstate2: the state moved paths on 2026-07-17 so browsers running OLD app code
// (which clobbered teammates' work) keep writing to the abandoned appstate.json and
// can never touch the live team state again.
const GH_STATE_URL = `https://api.github.com/repos/${GH_DATA_REPO}/contents/state/appstate2.json`;
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
  let text = b64decode(j.content || '');
  if (!text && j.size > 0) {
    // GitHub's contents API stops inlining content above 1MB (encoding:"none") —
    // without this fallback every browser silently loads an EMPTY shared state.
    const rr = await fetch(GH_STATE_URL, {
      headers: { ...ghApiHeaders(), Accept: 'application/vnd.github.raw' },
    });
    if (!rr.ok) throw new Error(`github raw read ${rr.status}`);
    text = await rr.text();
  }
  return JSON.parse(text || '{}');
}
/* Multi-user safety: a save must never wipe work made in another browser. Before every
   write, pull the latest server state and fold it in — LOCAL wins on direct conflicts
   (we are writing this browser's truth), but everything that exists only server-side is
   carried along, and reviewer progress made elsewhere (approvals, passage IDs, peer
   tasks, per-state question tags) is grafted onto our copies. Mutations are in-place so
   open editors keep their object references — no re-render, no lost keystrokes. */
function mergeForSave(server) {
  if (!server || typeof server !== 'object') return;
  const S = k => server[k] || {};
  state.decisions = { ...S('decisions'), ...state.decisions };
  state.noAlign = { ...S('noAlign'), ...state.noAlign };
  state.cms = { ...S('cms'), ...state.cms };
  state.severed = { ...S('severed'), ...state.severed };
  state.crossOk = { ...S('crossOk'), ...state.crossOk };
  state.setPush = { ...S('setPush'), ...state.setPush };
  state.setStateStd = { ...S('setStateStd'), ...state.setStateStd };
  state.setCms = { ...S('setCms'), ...state.setCms };
  state.setDismiss = { ...S('setDismiss'), ...state.setDismiss };
  state.manual = dedupeById([...state.manual, ...(server.manual || [])]);

  const byId = new Map(state.sets.map(x => [x.id, x]));
  (server.sets || []).forEach(sv => {
    const loc = byId.get(sv.id);
    if (!loc) { state.sets.push(sv); return; }   // exists only server-side — keep it
    // Reviewer progress is monotonic in this workflow — adopt it from the server copy.
    if (loc.status === 'draft' && sv.status !== 'draft') delete loc.status;
    if (!loc.passageId && sv.passageId) loc.passageId = sv.passageId;
    if (sv.peerDraft && !loc.peerDraft) loc.peerDraft = sv.peerDraft;
    const locPeerEmpty = !(loc.peerRevision || []).some(t => (t.text || '').trim() || t.standard);
    const svPeerHas = (sv.peerRevision || []).some(t => (t.text || '').trim() || t.standard);
    if (locPeerEmpty && svPeerHas) loc.peerRevision = sv.peerRevision;
    (sv.questions || []).forEach((q, i) => {
      const lq = (loc.questions || [])[i];
      if (lq && q.stateStandards) lq.stateStandards = { ...q.stateStandards, ...(lq.stateStandards || {}) };
    });
  });
  normalizeSets();
}

async function ghSave(attempt = 0) {
  // If we can't READ the shared state we must not WRITE it — an unmerged overwrite is
  // exactly the clobber this path exists to prevent. (A missing file is not an error:
  // ghLoad returns {} on 404, so the very first write still goes through.)
  mergeForSave(await ghLoad());   // also refreshes ghSha; throws on read failure → save aborts
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
    return ghSave(attempt + 1);     // recursion re-pulls and re-merges before retrying
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

// Saves are now multi-megabyte round-trips (pull + merge + push) — serialize them so a
// second save can't start while one is in flight. A save requested mid-flight coalesces
// into one follow-up pass that re-reads the latest state.
let ghBusy = null, ghAgain = false;
function ghSaveSerialized() {
  if (ghBusy) { ghAgain = true; return ghBusy; }
  ghBusy = (async () => {
    try {
      do { ghAgain = false; await ghSave(); } while (ghAgain);
    } finally { ghBusy = null; }
  })();
  return ghBusy;
}

/* Live team sync: pull teammates' work every minute and on tab focus. Cheap check
   first (1KB metadata request) — the full multi-MB download only happens when the
   server file actually changed. Uses the local-wins fold-in merge, so it can never
   revert this browser's own work, and skips entirely while the user is typing or a
   save is in flight. */
function userIsTyping() {
  const e = document.activeElement;
  return !!e && (e.tagName === 'TEXTAREA' || e.tagName === 'INPUT' || e.tagName === 'SELECT');
}
let syncPulling = false;
async function syncFromServer() {
  if (!ghMode || !ghToken || !serverAvailable || ghBusy || syncPulling || userIsTyping()) return;
  syncPulling = true;
  try {
    const r = await fetch(GH_STATE_URL, { headers: ghApiHeaders() });
    if (r.ok) {
      const j = await r.json();
      if (j.sha !== ghSha) {          // someone else saved since we last read/wrote
        const server = await ghLoad();
        mergeForSave(server);
        renderAll();
      }
    }
  } catch { /* transient network — next tick will retry */ }
  syncPulling = false;
}
setInterval(syncFromServer, 60000);
window.addEventListener('focus', syncFromServer);

let syncTimer;
let serverAvailable = false;
function postState(onDone) {
  if (ghMode) {
    if (!ghToken) { if (onDone) onDone(false); return; }
    ghSaveSerialized()
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
      setPush: { ...state.setPush, ...(s.setPush || {}) },
      setStateStd: { ...state.setStateStd, ...(s.setStateStd || {}) },
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
    state.setPush = merged.setPush;
    state.setStateStd = merged.setStateStd;
    state.setCms = merged.setCms;
    state.setDismiss = merged.setDismiss;
    state.sets = merged.sets;
    normalizeSets();
    mergeImportedDrafts();   // re-add any imported draft the server copy doesn't have
    mirrorLocal();
    if (localHadData) pushState(); // persist anything local-only up to the server
  } catch { /* server without /api/state — localStorage only */ }
}

/* Drop decisions whose link no longer exists — a standard or a whole grade left the system.
   They're inert, but the localStorage mirror merges local-only keys back up on every save,
   so without this they resurrect forever and the state file never stops growing. Only runs
   once the link set is known-good: if links.json failed to load we'd otherwise wipe
   everything. */
function pruneOrphanDecisions() {
  if (!state.links.length) return 0;
  const ids = new Set(state.links.map(l => l.id));
  const dead = Object.keys(state.decisions).filter(k => !ids.has(k));
  dead.forEach(k => delete state.decisions[k]);
  if (dead.length) { mirrorLocal(); pushState(); }
  return dead.length;
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

  // Imported ECR drafts live in a read-only data file, not the mutable state file, so a
  // browser save can't wipe them. They're merged into state.sets only if the reviewer
  // hasn't already got that set (by id) — once approved/edited it lives in the state file
  // and that copy wins.
  state.importedDrafts = (await fetchJson('data/imported_sets.json')) || [];
}

function mergeImportedDrafts() {
  const have = new Map(state.sets.map(s => [s.id, s]));
  (state.importedDrafts || []).forEach(d => {
    const e = have.get(d.id);
    // Deep-copy on first merge: a shallow copy would alias passages/questions/prompt
    // between the live set and the read-only importedDrafts source.
    if (!e) { state.sets.push(JSON.parse(JSON.stringify(d))); return; }
    // A still-draft import's DECK CONTENT (title, passages, question text) is owned by the
    // data file — refreshing it here lets parser fixes reach copies already absorbed into
    // appstate by an earlier save. Reviewer-owned fields always survive: passageId, status,
    // classification (type/genre/grade/subtopic/standard), peer tasks, per-state question tags.
    if (isDraft(e)) {
      e.title = d.title;
      e.passages = d.passages.map(p => ({ ...p }));
      e.questions = d.questions.map((q, i) => {
        const prev = e.questions && e.questions[i];
        return prev && prev.stateStandards ? { ...q, stateStandards: prev.stateStandards } : { ...q };
      });
    }
    // Filling a BLANK prompt is safe at any status — emptiness was a parser bug, not a choice.
    if (e.writingPrompt && !(e.writingPrompt.text || '').trim() && d.writingPrompt && d.writingPrompt.text) {
      e.writingPrompt.text = d.writingPrompt.text;
    }
  });
  normalizeSets();
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
   Only the reviewer's approvals count; every link starts pending.

   Two standing rules cull drafts that aren't worth a look, so the queue is candidates the
   reviewer would plausibly say yes to rather than a pile to say no to:
     1. `partial` is the lowest confidence the drafters emit — never show it.
     2. A cross-grade match has to be `strong`. Same-grade moderates are worth a look;
        a moderate guess that ALSO jumps a grade is not.
   These are auto-rejections, not deletions: they surface under the Rejected filter with
   the reason on the card, and an explicit decision always overrides them. */
function autoRejectReason(l) {
  if (state.decisions[l.id]) return null;      // the reviewer's own call always wins
  if (l.confidence === 'partial') return 'partial confidence';
  const oh = state.byKey.get(anchorKeyOf(l));
  const other = state.byKey.get(linkedKeyOf(l));
  if (isCrossGrade(oh, other)) {
    if (l.subject === 'ela') return 'ELAR can’t align across grades';
    if (l.confidence !== 'strong') return `cross-grade but only ${l.confidence || 'unrated'} confidence`;
  }
  return null;
}
function statusOf(l) {
  return state.decisions[l.id] || (autoRejectReason(l) ? 'rejected' : 'pending');
}
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
    // ELAR never aligns across grades — including sibling alignments through a shared anchor.
    if (std.subject === 'ela' && o.subject === 'ela' && String(std.grade) !== String(o.grade)) return;
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

/* A toast that offers to undo the action for 15 seconds. */
let undoTimer;
function toastUndo(msg, undoFn) {
  const t = document.getElementById('toast');
  clearTimeout(toastTimer);
  clearTimeout(undoTimer);
  t.innerHTML = '';
  t.append(document.createTextNode(msg + '  '));
  const btn = document.createElement('button');
  btn.className = 'toast-undo';
  btn.textContent = 'Undo';
  btn.addEventListener('click', () => {
    clearTimeout(undoTimer);
    t.classList.remove('show');
    undoFn();
  });
  t.append(btn);
  t.classList.add('show');
  undoTimer = setTimeout(() => t.classList.remove('show'), 15000);
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

/* How far apart two standards' grades may be and still align.
   - Social studies / science: ±1. States sequence content a year apart; beyond that the
     match isn't worth a reviewer's time.
   - ELAR: 0 — same grade only. Reading word-choice and text-complexity expectations are
     grade-specific, so a cross-grade ELAR alignment is never valid, not merely low-value.
   Drafts outside the span are held back from the queue rather than rejected: the rule is
   about what's worth showing, so if it ever loosens they come back untouched. */
const MAX_GRADE_SPAN = 1;
function maxSpanFor(subject) { return subject === 'ela' ? 0 : MAX_GRADE_SPAN; }
function gradeNum(g) { return g === 'K' ? 0 : parseInt(g, 10); }
function gradeSpan(a, b) {
  if (!a || !b || a.grade === 'All' || b.grade === 'All') return 0;
  return Math.abs(gradeNum(a.grade) - gradeNum(b.grade));
}
function withinGradeSpan(a, b, subject) {
  return gradeSpan(a, b) <= maxSpanFor(subject || (a && a.subject));
}
function linkWithinSpan(l) {
  return withinGradeSpan(state.byKey.get(anchorKeyOf(l)), state.byKey.get(linkedKeyOf(l)), l.subject);
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
        <button class="act-btn reject" data-act="sever" data-id="${esc(severKey(keyOf(sel), keyOf(std)))}"
          title="These run through the same Ohio standard but are not actually aligned">✂ Not aligned</button>
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
  const auto = autoRejectReason(l);
  const actions = st === 'pending'
    ? `<button class="act-btn approve" data-act="approved" data-id="${l.id}">✓ Approve</button>
       <button class="act-btn reject" data-act="rejected" data-id="${l.id}">✕ Reject</button>`
    : auto
      ? `<span class="status-chip rejected">auto-rejected · ${esc(auto)}</span>
         <button class="act-btn reset" data-act="unauto" data-id="${l.id}" title="Review it anyway">Review anyway</button>`
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
  } else if (act === 'unauto') {
    // Override a standing rule for this one link — an explicit 'pending' beats the rule.
    state.decisions[id] = 'pending';
    saveDecisions();
    toast('Back in the queue');
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
      </div>`;
    // Cross-state alignments are intentionally NOT shown here — the Master Passage List
    // stays clean; the aligned state standard is shown (and assigned) in State Lists.
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
  // setId disambiguates pickers when many sets render at once (State Lists cards);
  // the master editor never sets it, so null === null keeps its behavior unchanged.
  const open = state.ui.openPicker && state.ui.openPicker.section === section && state.ui.openPicker.index === i
    && (state.ui.openPicker.setId || null) === (ctx.setId || null);
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
  // Filters: work the drafts grade by grade (add IDs, approve) without wading through 300 sets.
  const fs = state.ui.setFilterStatus, fg = state.ui.setFilterGrade;
  const list = state.sets.filter(s =>
    (fs === 'all' || (fs === 'draft') === isDraft(s)) &&
    (fg === 'all' || String(s.gaGrade) === fg));
  const countEl = document.getElementById('setFilterCount');
  if (countEl) countEl.textContent = list.length === state.sets.length
    ? `${state.sets.length} sets`
    : `${list.length} of ${state.sets.length} sets`;
  if (!list.length) {
    box.appendChild(el(`<div class="review-empty">No sets match these filters.</div>`));
    return;
  }
  // Drafts first — they're the review queue — then by grade, then title.
  const sorted = [...list].sort((a, b) =>
    ((isDraft(b) ? 1 : 0) - (isDraft(a) ? 1 : 0))
    || ((+a.gaGrade || 99) - (+b.gaGrade || 99))
    || (a.title || '').localeCompare(b.title || ''));
  sorted.forEach(s => {
    const tags = [...s.questions, ...s.peerRevision].filter(q => q.standard).length;
    const item = el(`
      <div class="std-item ${state.ui.currentSetId === s.id ? 'active' : ''} ${isDraft(s) ? 'is-draft' : ''}">
        <div class="std-item-top">
          <span class="std-code">${isDraft(s) ? '<span class="draft-tag">DRAFT</span> ' : ''}${esc(s.title || 'Untitled set')}</span>
          <button class="q-remove" data-del-set="${s.id}" title="Delete set">✕</button>
        </div>
        <div class="std-desc">${s.gaGrade ? `G${esc(s.gaGrade)} · ` : ''}${esc(s.passageId ? 'ID: ' + s.passageId : 'No passage ID')} · ${s.passages.length} passage${s.passages.length !== 1 ? 's' : ''} · ${tags} tagged</div>
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
      <div class="ps-section-title">Writing Prompt</div>
      <div class="seg" id="promptTypeSeg" style="max-width:420px">
        ${PROMPT_TYPES.map(t => `<button class="seg-btn ${s.writingPrompt.type === t ? 'active' : ''}" data-pt="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}
      </div>
      <textarea class="ps-textarea" id="promptText" rows="4" style="margin-top:10px"
        placeholder="Paste the writing prompt here.">${esc(s.writingPrompt.text)}</textarea>
    </div>

    <div class="editor-savebar">
      ${isDraft(s)
        ? `<span class="ps-hint">${s.passageId ? '' : 'Add a passage ID, then '}approve this set to move it into the passage library.</span>
           <button class="btn btn-approve" id="approveSetBtn">✓ Approve set</button>`
        : `<span class="ps-hint">Changes save automatically — Save confirms immediately.</span>`}
      <button class="btn btn-primary" id="saveSetBtn">Save</button>
    </div>`;

  wireSetEditor(panel, s);
}

// Imported sets land as drafts: they show a DRAFT tag, stay OUT of Passage Input, and need
// an explicit Approve (after the reviewer adds the passage ID and gives them a once-over).
function isDraft(s) { return s.status === 'draft'; }

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
  on('#approveSetBtn', 'click', () => {
    if (!s.passageId && !confirm('This set has no passage ID yet. Approve it anyway?')) return;
    delete s.status;                 // no longer a draft — enters the passage library
    saveSets();
    toast(`Approved "${s.title || 'set'}" — now in the passage library`);
    renderPassages();
  });

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

  // The Master Passage List stays clean: which state lists this passage reaches, at what
  // grade — plus the In CMS mark, unlockable here once the set has a passage ID. The
  // aligned state standard (assign/override) still lives in State Lists.
  // One row per (state, grade) — a set can reach the same grade via several alignments;
  // aligned beats needs-approval when both exist.
  const byList = new Map();
  setServes(s, true).forEach(v => {
    const kk = `${v.state}:${v.grade}`;
    const prev = byList.get(kk);
    if (!prev || (prev.cat !== 'aligned' && v.cat === 'aligned')) byList.set(kk, v);
  });
  const serves = [...byList.values()];
  if (serves.length) {
    html += `<div class="side-block">
      <div class="align-mini-title">Populates these state lists</div>
      ${s.passageId ? '' : `<div class="align-mini-desc" style="margin-bottom:6px">Add a passage ID above to mark these In CMS.</div>`}
      ${serves.map(v => {
        const k = inputKey(s.id, v.state, v.grade);
        const inCms = !!state.setCms[k];
        const toggle = v.cat !== 'aligned'
          ? '<span class="chip chip-warn">needs approval in State Lists</span>'
          : s.passageId
            ? `<button class="cms-chip ${inCms ? 'loaded' : ''}" data-setcms="${esc(k)}" title="Click to toggle">${inCms ? '✓ In CMS' : 'Not in CMS'}</button>`
            : `<span class="cms-chip disabled" title="Add a passage ID first">Not in CMS</span>`;
        return `<div class="align-mini-item">
          <span class="chip">${STATE_NAMES[v.state]}</span><span class="chip">G${esc(v.grade)}</span>
          ${v.universal ? '<span class="chip chip-concept">◆ Universal</span>' : ''}
          ${toggle}</div>`;
      }).join('')}
      <div class="align-mini-desc" style="margin-top:8px">Open <b>State Lists</b> to assign or override the aligned standard for each.</div>
    </div>`;
  }
  if (tag.state !== 'ALL' && isNoAlign(std)) {
    html += `<div class="side-block"><div class="noalign-inline">🚫 No Alignment Possible — this passage stays in ${STATE_NAMES[std.state]} only.</div></div>`;
  } else if (tag.state !== 'ALL' && serves.every(v => v.own)) {
    html += `<div class="side-block"><div class="align-mini-empty">No approved alignment within one grade yet — this passage is in ${STATE_NAMES[std.state]} only until its primary standard is aligned.</div></div>`;
  }

  panel.innerHTML = html;
  wireCmsChips(panel);
  panel.querySelectorAll('[data-setcms]').forEach(btn => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.setcms;
      if (state.setCms[k]) delete state.setCms[k]; else state.setCms[k] = true;
      pushState();
      renderSetSide();
    });
  });
}

// A push decision is per (passage set, aligned standard). The standard key carries its
// state, grade and code, which is exactly what Passage Input needs.
function pushKey(setId, otherStd) { return `${setId}||${keyOf(otherStd)}`; }

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
   keep building. Passages auto-populate the states they align to; Passage Input sorts them
   into three buckets so nothing lands as "done" without a human eye:

   ENTERED IN CMS — someone marked "Entered in CMS" for this passage in this state's list.
   ALIGNED        — confirmed for this grade: the set's own home grade, a universal passage,
                    or an aligned one the reviewer approved (pushed).
   NEEDS APPROVAL — auto-populated from an approved ±1-grade alignment, not yet reviewed. */
function setNativeGrade(s) {
  if (s.gaGrade) return String(s.gaGrade);
  const std = tagStd(s.standard);
  return std ? String(std.grade) : null;
}

// Every (state, grade) this passage set serves, and its category there.
// includeDraft: the master side panel previews (and pre-marks CMS for) drafts too.
function setServes(s, includeDraft) {
  if (isDraft(s) && !includeDraft) return [];   // drafts don't populate the passage library until approved
  const std = tagStd(s.standard);
  if (!std) return [];
  const native = setNativeGrade(s);

  // Universal standard (Literary / Literary Non-Fiction): serves ALL states at its
  // hierarchy grade, active now and any state added later. Aligned, not needs-approval.
  if (std.state === 'ALL') {
    if (!native) return [];   // needs a hierarchy grade to know where it lands
    return STATES.map(st => ({ state: st, grade: native, universal: true, std, cat: 'aligned' }));
  }

  const out = [];
  // The passage's own tagged state + grade — always aligned; it was built for this.
  out.push({ state: std.state, grade: String(std.grade), std, own: true, cat: 'aligned' });
  // Approved, within-±1 alignments auto-populate. Pushed → aligned; dismissed → gone;
  // otherwise → needs approval.
  alignedTo(std).forEach(h => {
    if (!withinGradeSpan(std, h.std, std.subject)) return;
    const p = state.setPush[pushKey(s.id, h.std)];
    if (p === 'dismissed') return;
    out.push({
      state: h.std.state, grade: String(h.std.grade), via: h.via || std,
      unlisted: String(h.std.grade) !== String(native),
      std: h.std, pk: pushKey(s.id, h.std),
      cat: p === 'pushed' ? 'aligned' : 'needs',
    });
  });
  return out;
}

function inputKey(setId, st, grade) { return `${setId}|${st}:${grade}`; }

// The push keys for every alignment carrying a set into one state+grade — approve/dismiss
// in Passage Input is a per-(set, state, grade) call, so it acts on all of them at once.
function pushKeysFor(setId, st, grade) {
  const s = state.sets.find(x => x.id === setId);
  const std = s && tagStd(s.standard);
  if (!std || std.state === 'ALL') return [];
  return alignedTo(std)
    .filter(h => h.std.state === st && String(h.std.grade) === String(grade) && withinGradeSpan(std, h.std, std.subject))
    .map(h => pushKey(setId, h.std));
}

// One row per set per state+grade. A set can reach a grade via several alignments; the
// row's category is the best across them (CMS-developed > aligned > needs).
function setsForGrade(st, grade) {
  const rows = [];
  state.sets.forEach(s => {
    const hits = setServes(s).filter(x => x.state === st && x.grade === String(grade));
    if (!hits.length || state.setDismiss[inputKey(s.id, st, grade)]) return;
    let category, hit;
    if (state.setCms[inputKey(s.id, st, grade)]) { category = 'cms'; hit = hits[0]; }
    else if (hits.some(h => h.cat === 'aligned')) { category = 'aligned'; hit = hits.find(h => h.cat === 'aligned'); }
    else { category = 'needs'; hit = hits[0]; }
    rows.push({ set: s, hit, category });
  });
  return rows;
}

// The standard this passage is assigned to in a given state — the reviewer's override if
// they set one, otherwise the auto-aligned standard the row came in on.
function assignedStateStd(s, hit, st, grade) {
  const code = state.setStateStd[inputKey(s.id, st, grade)];
  if (code && !hit.own && !hit.universal) {
    return state.byKey.get(stdKey(st, hit.std.subject, code)) || hit.std;
  }
  return hit.std;
}

// Compact left-panel row: title + ID + grade + status, click to open the full set.
function inputListItem(row, selected) {
  const { set: s, stage } = row;
  const catChip = {
    entered: '<span class="chip chip-entered">✓ Entered in CMS</span>',
    approval: '<span class="chip chip-warn">Needs approval</span>',
    standards: '<span class="chip chip-stage">Needs standards</span>',
    peer: '<span class="chip chip-stage">Needs peer task</span>',
    enter: '<span class="chip">To be entered</span>',
  }[stage] || '<span class="chip">Aligned</span>';
  return `
    <div class="std-item ${selected ? 'active' : ''}" data-insel="${esc(s.id)}">
      <div class="std-item-top">
        <span class="std-code">${isDraft(s) ? '<span class="draft-tag">DRAFT</span> ' : ''}${esc(s.title || 'Untitled set')}</span>
      </div>
      <div class="std-desc">${s.gaGrade ? `G${esc(s.gaGrade)} · ` : ''}${s.passageId ? 'ID ' + esc(s.passageId) : 'No ID'}</div>
      <div class="concept-meta" style="margin-top:4px">${catChip}</div>
    </div>`;
}

// Per-question row in the detail panel: read-only text plus a tag area for THIS state's
// standard — where question-level state standards get identified when a set crosses over.
function detailQuestionHtml(q, i, s, st, grade) {
  const typeLabel = (QUESTION_TYPES.find(t => t.key === q.type) || {}).label;
  const native = q.standard;
  const isNativeState = native && native.state === st;
  const nstd = native && tagStd(native);
  // Full standard text everywhere — same side-by-side layout as the Review Queue,
  // native (Ohio) standard on the left, this state's standard on the right.
  const nativeSide = nstd
    ? pairSide(nstd, native.state)
    : native
      ? `<div class="pair-side"><div class="side-label">${STATE_NAMES[native.state] || native.state}</div><div class="pair-code">${esc(native.code)}</div><div class="pair-desc">(standard not loaded)</div></div>`
      : `<div class="pair-side"><div class="side-label">No standard tagged</div></div>`;
  let tagArea = '';
  if (isNativeState) {
    tagArea = `<div class="q-tag-area"><div class="review-pair q-pair">${nativeSide}</div></div>`;
  } else {
    const tag = (q.stateStandards || {})[st];
    const open = state.ui.openPicker && state.ui.openPicker.section === 'qstate'
      && state.ui.openPicker.index === i && state.ui.openPicker.setId === s.id;
    let inner;
    if (tag) {
      inner = `<div class="review-pair q-pair">
          ${nativeSide}<div class="pair-mid">⇄</div>${pairSide(tagStd(tag) || { code: tag.code, grade, description: '' }, st)}
        </div>
        <button class="act-btn reject" data-qsuntag="${i}">✕ Remove ${STATE_NAMES[st]} tag</button>`;
    } else if (open) {
      inner = `<div class="review-pair q-pair">${nativeSide}</div>
        ${pickerHtml('qstate', i, st, qstateScope(grade), `Showing ${STATE_NAMES[st]} ELAR standards for Grade ${grade}.`)}`;
    } else {
      // Recommend from the alignment work already done: the question's native standard's
      // approved alignments into this state at this grade. Accept in one click, or pick another.
      const recs = nstd
        ? alignedTo(nstd).filter(h => h.std.state === st && String(h.std.grade) === String(grade)).slice(0, 3)
        : [];
      inner = recs.length
        ? `<div class="q-recs">
            <div class="align-mini-title">Recommended from approved alignments</div>
            ${recs.map(h => `<div class="q-rec-pair">
              <div class="review-pair q-pair">
                ${nativeSide}<div class="pair-mid">⇄</div>${pairSide(h.std, st)}
              </div>
              <button class="act-btn approve" data-qsrec="${i}|${esc(h.std.subject)}|${esc(h.std.code)}">✓ Accept ${esc(h.std.code)}</button>
            </div>`).join('')}
            <button class="act-btn tag-open" data-qspick="${i}">Choose a different standard…</button>
          </div>`
        : `<div class="review-pair q-pair">${nativeSide}</div>
           <button class="act-btn tag-open" data-qspick="${i}">＋ Tag ${STATE_NAMES[st]} standard</button>`;
    }
    tagArea = `<div class="q-tag-area q-tag-stack">${inner}</div>`;
  }
  return `
    <div class="q-card">
      <div class="q-head"><span class="q-label">Question ${i + 1}</span>
        ${typeLabel ? `<span class="chip">${esc(typeLabel)}</span>` : ''}</div>
      <div class="detail-text q-detail-text">${esc(q.text)}</div>
      ${tagArea}
    </div>`;
}

function qstateScope(grade) {
  return std => std.subject === 'ela' &&
    (std.grade === 'All' || String(std.grade) === String(grade));
}

/* ---------- AI builder: Georgia Peer Revision Task ----------
   Calls the Anthropic API directly from the browser (same pattern as cloud saving:
   the user pastes their API key once; it lives only in this browser's localStorage).
   Claude drafts a flawed student response + 4-5 revision questions, each tagged to a
   Georgia standard — everything lands in the editor as a draft for human review. */
const LS_AI_KEY = 'sa_anthropic_key';
let aiKey = localStorage.getItem(LS_AI_KEY) || '';

function ensureAiKey() {
  if (aiKey) return true;
  const t = prompt('Paste your Anthropic API key to enable the AI builder (stored only in this browser):', '');
  if (t === null) return false;
  aiKey = t.trim();
  if (aiKey) localStorage.setItem(LS_AI_KEY, aiKey);
  return !!aiKey;
}

// ⚙ TUNE ME: these generation instructions are a Georgia-Milestones-style default.
// When the user shares an example Peer Revision Task, match its exact structure here.
const PEER_SYSTEM = `You write peer-revision assessment tasks for Georgia elementary and middle school ELA, in the style of Georgia Milestones constructed-response supports.

Given a passage set, its writing prompt, and the grade level, produce:
1. A STUDENT DRAFT: a plausible response to the writing prompt, written the way a student at this grade would write it, containing specific findable weaknesses appropriate for peer revision (organization, evidence use, word choice, transitions, sentence structure, conventions). It should be genuinely revisable — flawed but not a caricature.
2. FOUR TO FIVE revision questions about that draft. Each question must:
   - target exactly ONE of the provided Georgia standards (prefer Constructing (C) elements of the Texts domain and Language standards — these are writing/revision standards)
   - use one of these item types: multiple_choice, cloze, multi_select, text_entry
   - be fully written out: stem, then answer choices each on their own line labeled A. B. C. D. (for cloze, give the drop-down options in [brackets / separated by slashes]), and the correct answer marked at the end as "Answer: X"
   - be answerable using only the student draft (and the passage where relevant)
Vary the item types across the set. Write at a grade-appropriate reading level.`;

const PEER_SCHEMA = {
  type: 'object',
  properties: {
    studentDraft: { type: 'string', description: 'The flawed student response to the writing prompt' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Complete question: stem, choices, and "Answer: X" line' },
          type: { type: 'string', enum: ['multiple_choice', 'cloze', 'multi_select', 'text_entry'] },
          gaCode: { type: 'string', description: 'The single Georgia standard code this question assesses, exactly as given in the list' },
          rationale: { type: 'string', description: 'One sentence: why this question fits that standard' },
        },
        required: ['text', 'type', 'gaCode', 'rationale'],
        additionalProperties: false,
      },
    },
  },
  required: ['studentDraft', 'questions'],
  additionalProperties: false,
};

async function buildPeerTask(s, grade) {
  const pool = state.standards
    .filter(x => x.state === 'GA' && x.subject === 'ela' && (x.grade === 'All' || String(x.grade) === String(grade)))
    .map(x => `${x.code} — ${x.description}`);
  const passages = s.passages.map((p, i) =>
    `PASSAGE ${i + 1}${p.title ? ` — ${p.title}` : ''}\n${p.text}`).join('\n\n');
  const existing = s.questions.map((q, i) => `${i + 1}. ${(q.text || '').split('\n')[0]}`).join('\n');

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': aiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-8',
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: PEER_SYSTEM,
      output_config: { format: { type: 'json_schema', schema: PEER_SCHEMA } },
      messages: [{
        role: 'user',
        content: `Grade: ${grade}
Genre: ${s.genre || ''} · Sub-domain: ${s.gaSubtopic || ''}
Set title: ${s.title}

${passages}

WRITING PROMPT (the student draft must respond to this):
${s.writingPrompt.text}

EXISTING READING QUESTIONS (do not duplicate these):
${existing}

GEORGIA STANDARDS — choose each question's gaCode from this list ONLY:
${pool.join('\n')}

Create the peer revision task now.`,
      }],
    }),
  });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const e = await r.json(); msg += ' — ' + ((e.error || {}).message || '').slice(0, 140); } catch { /* keep bare status */ }
    throw new Error(msg);
  }
  const data = await r.json();
  if (data.stop_reason === 'refusal') throw new Error('the model declined this request');
  const txt = (data.content || []).find(b => b.type === 'text');
  if (!txt) throw new Error('no output returned');
  return JSON.parse(txt.text);
}

async function handleBuildPeer(s, grade) {
  if (!ensureAiKey()) return;
  state.ui.peerBuilding = s.id;
  renderInput();
  try {
    const out = await buildPeerTask(s, grade);
    const valid = new Set(state.standards.filter(x => x.state === 'GA' && x.subject === 'ela').map(x => x.code));
    s.peerDraft = out.studentDraft || '';
    s.peerRevision = (out.questions || []).map(q => ({
      text: q.text || '',
      type: QUESTION_TYPES.some(t => t.key === q.type) ? q.type : null,
      standard: valid.has(q.gaCode) ? { state: 'GA', subject: 'ela', code: q.gaCode } : null,
    }));
    if (!s.peerRevision.length) s.peerRevision = [{ text: '', standard: null, type: null }];
    saveSets();
    toast(`✓ Built ${s.peerRevision.length} peer revision questions — review below`);
  } catch (e) {
    if (String(e.message).includes('401')) {
      aiKey = '';
      localStorage.removeItem(LS_AI_KEY);
      toast('⚠ API key rejected — click Build again to re-enter it');
    } else {
      toast('⚠ AI build failed: ' + String(e.message).slice(0, 90));
    }
  }
  state.ui.peerBuilding = null;
  renderInput();
}

function renderInputDetail(row, st, grade) {
  const box = document.getElementById('inputDetail');
  if (!box) return;
  if (!row) {
    box.innerHTML = `<div class="empty-state">
      <div class="empty-icon">☰</div><h2>Select a passage</h2>
      <p>Pick a title on the left to see the full set — passages, questions, and the ${STATE_NAMES[st]} standards to assign.</p></div>`;
    return;
  }
  const { set: s, hit, category } = row;
  const k = inputKey(s.id, st, grade);
  const nativeRow = hit.own || hit.universal;
  const assigned = assignedStateStd(s, hit, st, grade);
  const dismissAct = nativeRow ? `dismiss|${esc(k)}` : `pushdismiss|${esc(k)}`;
  const overriding = state.ui.overrideKey === k;

  // Just the aligned state standard for THIS state — the thing being assigned.
  const stdLine = nativeRow
    ? `<div class="concept-meta">${hit.universal
        ? '<span class="chip chip-concept">◆ Universal — all states</span>'
        : '<span class="chip">tagged directly</span>'}
        <span class="chip">${esc(assigned.code)}</span></div>`
    : `<div class="align-mini-item"><span class="align-mini-code">${esc(assigned.code)}</span>
         <span class="chip">${STATE_NAMES[st]}</span><span class="chip">G${esc(assigned.grade)}</span>
         ${state.setStateStd[k] ? '<span class="chip chip-warn">overridden</span>' : ''}</div>
       <div class="align-mini-desc" style="margin:4px 0 8px">${esc(assigned.description)}</div>`;

  let actions;
  if (overriding) {
    // Inline picker: any standard in this state at this grade (same subject as the alignment).
    const opts = state.standards
      .filter(x => x.state === st && x.subject === assigned.subject && String(x.grade) === String(grade))
      .sort((a, b) => a.code.localeCompare(b.code));
    actions = `<select class="ps-input" data-override="${esc(k)}" style="max-width:100%">
        <option value="">Choose the ${STATE_NAMES[st]} Grade ${grade} standard…</option>
        ${opts.map(x => `<option value="${esc(x.code)}" ${assigned.code === x.code ? 'selected' : ''}>${esc(x.code)} — ${esc(x.description.slice(0, 70))}${x.description.length > 70 ? '…' : ''}</option>`).join('')}
      </select>
      <button class="act-btn reset" data-iact="canceloverride|${esc(k)}">Cancel</button>`;
  } else if (category === 'cms') {
    actions = `<span class="status-chip approved">✓ Entered in CMS</span>
       <button class="act-btn reset" data-iact="uncms|${esc(k)}">Undo</button>`;
  } else if (category === 'needs') {
    actions = `<button class="act-btn approve" data-iact="approve|${esc(k)}">✓ Assign</button>
       ${nativeRow ? '' : `<button class="act-btn" data-iact="override|${esc(k)}">Override standard</button>`}
       <button class="act-btn reject" data-iact="${dismissAct}">✕ Dismiss</button>`;
  } else {
    // In CMS unlocks only at the To Be Entered stage, and only with a passage ID —
    // earlier stages say what still blocks it.
    const stage = row.stage || rowStage(row, st, grade);
    const cmsPart = stage === 'standards'
      ? `<span class="cms-chip disabled">Not in CMS — tag the ${STATE_NAMES[st]} standards below first</span>`
      : stage === 'peer'
        ? `<span class="cms-chip disabled">Not in CMS — create the peer revision task below</span>`
        : s.passageId
          ? `<button class="act-btn approve" data-iact="cms|${esc(k)}">✓ Entered in CMS</button>`
          : `<span class="cms-chip disabled" title="Add a passage ID on the Master Passage List first">Not in CMS — needs a passage ID</span>`;
    actions = `${cmsPart}
       ${nativeRow ? '' : `<button class="act-btn" data-iact="override|${esc(k)}">Override</button>`}
       <button class="act-btn reject" data-iact="${dismissAct}" title="Remove from this grade">Dismiss</button>`;
  }

  // Peer revision is a Georgia deliverable — authored here on the Georgia list,
  // not on the master list (which stays a clean cross-state source of truth).
  const building = state.ui.peerBuilding === s.id;
  const hasPeerContent = s.peerRevision.some(t => (t.text || '').trim());
  const peerHtml = st !== 'GA' ? '' : `
    <div class="ps-section">
      <div class="ps-section-title">Peer Revision Task <span class="chip ga-chip">Georgia only</span>
        <button class="act-btn approve" data-buildpeer="1" ${building ? 'disabled' : ''}>
          ${building ? '⏳ Generating…' : hasPeerContent ? '⚡ Rebuild with AI' : '⚡ Build with AI'}</button>
      </div>
      ${s.peerDraft ? `
        <div class="ps-field" style="margin-bottom:12px">
          <label>Student draft — the flawed response students revise</label>
          <textarea class="ps-textarea" data-peerdraft="1" rows="8">${esc(s.peerDraft)}</textarea>
        </div>` : ''}
      <div class="peer-editor">
        ${s.peerRevision.map((q, i) => questionBlockHtml(q, 'peer', i, `Task ${i + 1}`, { restrictState: 'GA', setId: s.id })).join('')}
        ${s.peerRevision.length < MAX_QUESTIONS ? `<button class="act-btn" data-add-peer="1">＋ Add task</button>` : ''}
      </div>
    </div>`;

  const genreLabel = (GENRES.find(g => g.key === s.genre) || {}).label;
  const istLabel = (ITEM_SET_TYPES.find(t => t.key === s.itemSetType) || {}).label;

  box.innerHTML = `
    <div class="detail-head ${category === 'cms' ? 'decided-approved' : ''}">
      <div class="concept-title" style="font-size:18px">${isDraft(s) ? '<span class="draft-tag">DRAFT</span> ' : ''}${esc(s.title || 'Untitled set')}</div>
      <div class="concept-meta" style="margin-top:6px">
        ${s.passageId ? `<span class="chip">ID ${esc(s.passageId)}</span>` : '<span class="chip chip-warn">No passage ID</span>'}
        ${s.gaGrade ? `<span class="chip">Grade ${esc(s.gaGrade)}</span>` : ''}
        ${istLabel ? `<span class="chip">${esc(istLabel)}</span>` : ''}
        ${genreLabel ? `<span class="chip">${esc(genreLabel)}</span>` : ''}
        ${s.gaSubtopic ? `<span class="chip">${esc(s.gaSubtopic)}</span>` : ''}
      </div>
      <div style="margin-top:10px">${stdLine}</div>
      <div class="detail-actions">${actions}
        <button class="act-btn" id="editOnMaster" title="Passage text, questions and prompt live on the master set — editing there updates every state">✎ Edit set</button>
      </div>
    </div>

    <div class="ps-section">
      <div class="ps-section-title">Passages</div>
      ${s.passages.map(p => `
        <div class="detail-passage">
          ${p.title ? `<div class="detail-ptitle">${esc(p.title)}</div>` : ''}
          <div class="detail-text">${esc(p.text)}</div>
        </div>`).join('')}
    </div>

    <div class="ps-section">
      <div class="ps-section-title">Question Set
        <span class="ps-hint">tag each question with its ${STATE_NAMES[st]} standard</span></div>
      ${s.questions.map((q, i) => detailQuestionHtml(q, i, s, st, grade)).join('')}
    </div>

    ${peerHtml}

    <div class="ps-section">
      <div class="ps-section-title">Writing Prompt</div>
      <div class="detail-text">${esc(s.writingPrompt.text || '')}</div>
    </div>`;

  // actions (Assign / Override / Dismiss / Entered in CMS)
  box.querySelectorAll('[data-iact]').forEach(b =>
    b.addEventListener('click', () => handleInputAction(b.dataset.iact)));
  const sel = box.querySelector('[data-override]');
  if (sel) sel.addEventListener('change', e => {
    if (!e.target.value) return;
    const key = e.target.dataset.override;
    state.setStateStd[key] = e.target.value;
    state.ui.overrideKey = null;
    const [setId, sg] = [key.slice(0, key.indexOf('|')), key.slice(key.indexOf('|') + 1)];
    const [stt, grd] = sg.split(':');
    pushKeysFor(setId, stt, grd).forEach(pk => { state.setPush[pk] = 'pushed'; });
    pushState(); renderInput();
    toast(`Assigned to ${e.target.value}`);
  });

  // Edit jumps to the Master editor — the set is one source of truth; passage text,
  // questions and prompt edited there update every state's view.
  const editBtn = box.querySelector('#editOnMaster');
  if (editBtn) editBtn.addEventListener('click', () => {
    state.ui.currentSetId = s.id;
    state.ui.openPicker = null;
    document.querySelector('#navTabs .tab[data-view="passages"]').click();
    renderPassages();
  });

  // one-click accept of a recommended standard (from approved alignments)
  box.querySelectorAll('[data-qsrec]').forEach(b => b.addEventListener('click', () => {
    const [i, subject, code] = b.dataset.qsrec.split('|');
    const q = s.questions[+i];
    q.stateStandards = q.stateStandards || {};
    q.stateStandards[st] = { state: st, subject, code };
    saveSets();
    toast(`Tagged ${code} for ${STATE_NAMES[st]}`);
    renderInput();
  }));

  // question-level state tagging
  box.querySelectorAll('[data-qspick]').forEach(b => b.addEventListener('click', () => {
    state.ui.openPicker = { section: 'qstate', index: +b.dataset.qspick, setId: s.id };
    renderInput();
    const inp = document.querySelector('#inputDetail .tag-picker[data-picker^="qstate:"] .picker-search');
    if (inp) inp.focus();
  }));
  box.querySelectorAll('[data-qsuntag]').forEach(b => b.addEventListener('click', () => {
    const q = s.questions[+b.dataset.qsuntag];
    if (q.stateStandards) delete q.stateStandards[st];
    saveSets(); renderInput();
  }));
  const qp = box.querySelector('.tag-picker[data-picker^="qstate:"]');
  if (qp) {
    const iStr = qp.dataset.picker.split(':')[1];
    const results = qp.querySelector('.picker-results');
    qp.querySelector('.picker-search').addEventListener('input', e => {
      results.innerHTML = pickerResultsHtml(e.target.value, st, qstateScope(grade));
    });
    qp.querySelector('.picker-cancel').addEventListener('click', () => {
      state.ui.openPicker = null; renderInput();
    });
    results.addEventListener('click', e => {
      const item = e.target.closest('.picker-item');
      if (!item) return;
      const [tst, subject, code] = item.dataset.tag.split('|');
      const q = s.questions[+iStr];
      q.stateStandards = q.stateStandards || {};
      q.stateStandards[st] = { state: tst, subject, code };
      state.ui.openPicker = null;
      saveSets();
      toast(`Tagged ${code} for ${STATE_NAMES[st]}`);
      renderInput();
    });
  }

  if (st === 'GA') wirePeerInline(box, s);
}

/* Inline editor wiring for the Georgia peer-revision block on a State Lists card.
   Mirrors the master editor's question handlers, but re-renders the input view. */
function wirePeerInline(card, s) {
  const on = (sel, ev, fn) => card.querySelectorAll(sel).forEach(n => n.addEventListener(ev, fn));
  on('[data-q]', 'input', e => {
    s.peerRevision[+e.target.dataset.q.split(':')[1]].text = e.target.value;
    saveSets();
  });
  on('[data-qtype]', 'click', e => {
    const [, i, type] = e.currentTarget.dataset.qtype.split(':');
    const q = s.peerRevision[+i];
    q.type = q.type === type ? null : type;
    saveSets(); renderInput();
  });
  on('[data-remove-q]', 'click', e => {
    s.peerRevision.splice(+e.currentTarget.dataset.removeQ.split(':')[1], 1);
    if (!s.peerRevision.length) s.peerRevision.push({ text: '', standard: null, type: null });
    saveSets(); renderInput();
  });
  on('[data-add-peer]', 'click', () => {
    s.peerRevision.push({ text: '', standard: null, type: null });
    saveSets(); renderInput();
  });
  on('[data-pick]', 'click', e => {
    const [, i] = e.currentTarget.dataset.pick.split(':');
    state.ui.openPicker = { section: 'peer', index: +i, setId: s.id };
    renderInput();
    const inp = document.querySelector('#inputList .picker-search');
    if (inp) inp.focus();
  });
  on('[data-untag]', 'click', e => {
    s.peerRevision[+e.currentTarget.dataset.untag.split(':')[1]].standard = null;
    saveSets(); renderInput();
  });
  const picker = card.querySelector('.tag-picker[data-picker^="peer:"]');
  if (picker) {
    const iStr = picker.dataset.picker.split(':')[1];
    const results = picker.querySelector('.picker-results');
    picker.querySelector('.picker-search').addEventListener('input', e => {
      results.innerHTML = pickerResultsHtml(e.target.value, 'GA', null);
    });
    picker.querySelector('.picker-cancel').addEventListener('click', () => {
      state.ui.openPicker = null;
      renderInput();
    });
    results.addEventListener('click', e => {
      const item = e.target.closest('.picker-item');
      if (!item) return;
      const [tst, subject, code] = item.dataset.tag.split('|');
      s.peerRevision[+iStr].standard = { state: tst, subject, code };
      state.ui.openPicker = null;
      saveSets();
      toast(`Tagged ${code}`);
      renderInput();
    });
  }
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
  rows.forEach(r => { r.stage = rowStage(r, st, grade); });
  const byStage = k => rows.filter(r => r.stage === k);
  const dismissed = state.sets.filter(s => state.setDismiss[inputKey(s.id, st, grade)]).length;

  const stages = inputStages(st);
  const counts = Object.fromEntries(stages.map(x => [x.key, byStage(x.key).length]));

  document.getElementById('inputProgress').textContent =
    `${rows.length} passage${rows.length === 1 ? '' : 's'} for ${STATE_NAMES[st]} Grade ${grade} · `
    + stages.map(x => `${counts[x.key]} ${x.short}`).join(', ')
    + (dismissed ? ` · ${dismissed} dismissed` : '');

  // Stage filter seg (dynamic: Georgia carries the extra Peer Task stage).
  const seg = document.getElementById('inStageSeg');
  if (state.ui.inStage !== 'all' && !stages.some(x => x.key === state.ui.inStage)) state.ui.inStage = 'all';
  seg.innerHTML = `<button class="seg-btn ${state.ui.inStage === 'all' ? 'active' : ''}" data-val="all">All to-dos</button>`
    + stages.map(x => `<button class="seg-btn ${state.ui.inStage === x.key ? 'active' : ''}" data-val="${x.key}">${x.label}</button>`).join('');

  // "All" is the working queue — Entered in CMS lives only under its own filter.
  const f = state.ui.inStage;
  const visible = f === 'all' ? rows.filter(r => r.stage !== 'entered') : byStage(f);

  const box = document.getElementById('inputList');
  box.innerHTML = '';
  if (!rows.length) {
    box.appendChild(el(`<div class="review-empty">
      No passages serve ${STATE_NAMES[st]} Grade ${grade} yet.<br>
      <span style="font-size:12.5px; color:var(--ink-faint)">A passage lands here when its primary standard is a ${STATE_NAMES[st]} Grade ${grade} standard,
      is aligned to one within a grade, or is tagged to a universal (all-state) standard at this grade.
      Build sets in Passage Sets, and approve alignments in the Review Queue to make them cross over.</span>
    </div>`));
    renderInputDetail(null, st, grade);
    return;
  }
  if (!visible.length) {
    box.appendChild(el(`<div class="review-empty">${f === 'all'
      ? `All ${rows.length} passage${rows.length === 1 ? '' : 's'} for ${STATE_NAMES[st]} Grade ${grade} are entered in CMS. 🎉`
      : `Nothing in this stage for ${STATE_NAMES[st]} Grade ${grade}.`}</div>`));
    renderInputDetail(null, st, grade);
    return;
  }

  // keep the selection if it's still visible; otherwise select the first row as displayed
  const order = Object.fromEntries(stages.map((x, ix) => [x.key, ix]));
  visible.sort((a, b) => order[a.stage] - order[b.stage]);
  if (!visible.some(r => r.set.id === state.ui.inSelected)) state.ui.inSelected = visible[0].set.id;
  const selId = state.ui.inSelected;

  const group = (label, list, hint) => {
    if (!list.length) return;
    box.appendChild(el(`<div class="align-section-title">${label} (${list.length})${hint ? ` <span class="section-hint">${hint}</span>` : ''}<span class="rule"></span></div>`));
    list.forEach(r => {
      const item = el(inputListItem(r, r.set.id === selId));
      item.addEventListener('click', () => {
        state.ui.inSelected = r.set.id;
        state.ui.openPicker = null;
        state.ui.overrideKey = null;
        renderInput();
      });
      box.appendChild(item);
    });
  };
  // Pipeline order — each group is one team's queue.
  stages.forEach(x => {
    if (f === 'all' && x.key === 'entered') return;
    group(x.label, visible.filter(r => r.stage === x.key), x.hint);
  });

  renderInputDetail(visible.find(r => r.set.id === selId), st, grade);
}

/* ---------- the State Lists pipeline ----------
   A passage set walks four stages into a state's CMS (five in Georgia):
     1. Needs Approval        — confirm the set really aligns into this state (Kennady)
     2. Needs Standards       — tag each question with this state's standard (Kennady · Erin)
     2b. Needs Peer Task      — Georgia only: author the peer revision task (Kennady · Erin)
     3. To Be Entered         — tag the ECR set in CMS (Kayli · Han · Sophie)
     4. Entered in CMS        — done; leaves the working queue, lives under its own filter. */
function inputStages(st) {
  const stages = [
    { key: 'approval', label: 'Needs Approval', short: 'need approval', hint: 'confirm the alignment — Kennady' },
    { key: 'standards', label: 'Needs Standards', short: 'need standards', hint: `tag each question's standard — Kennady · Erin` },
  ];
  if (st === 'GA') stages.push({ key: 'peer', label: 'Needs Peer Task', short: 'need peer task', hint: 'create the peer revision task — Kennady · Erin' });
  stages.push(
    { key: 'enter', label: 'To Be Entered', short: 'to be entered', hint: 'tag the ECR set in CMS — Kayli · Han · Sophie' },
    { key: 'entered', label: 'Entered in CMS', short: 'entered', hint: 'done' });
  return stages;
}

// Every question must carry a standard usable in this state: its native tag if it's
// this state's, otherwise a per-state tag made in the detail panel.
function questionsTagged(s, st) {
  return s.questions.every(q =>
    (q.standard && q.standard.state === st) || (q.stateStandards || {})[st]);
}

function rowStage(row, st, grade) {
  const { set: s, category } = row;
  if (category === 'cms') return 'entered';
  if (category === 'needs') return 'approval';
  if (!questionsTagged(s, st)) return 'standards';
  if (st === 'GA' && !s.peerRevision.some(t => (t.text || '').trim())) return 'peer';
  return 'enter';
}

// action is "verb|inputKey" (setId|state:grade). approve/dismiss act on every alignment
// that carries the set into that grade, and carry a 15-second undo.
function handleInputAction(spec) {
  // key is an inputKey `${setId}|${state}:${grade}`, which itself contains a '|' — split
  // only on the first separator so the key stays intact.
  const cut = spec.indexOf('|');
  const act = spec.slice(0, cut);
  const key = spec.slice(cut + 1);
  const [setId, sg] = [key.slice(0, key.indexOf('|')), key.slice(key.indexOf('|') + 1)];
  const [stt, grd] = sg.split(':');
  if (act === 'override') { state.ui.overrideKey = key; renderInput(); return; }
  if (act === 'canceloverride') { state.ui.overrideKey = null; renderInput(); return; }
  if (act === 'cms') { state.setCms[key] = true; pushState(); renderInput(); toast('Marked entered in CMS'); }
  else if (act === 'uncms') { delete state.setCms[key]; pushState(); renderInput(); toast('CMS mark removed'); }
  else if (act === 'dismiss') {
    state.setDismiss[key] = true; pushState(); renderInput();
    toastUndo('Dismissed from this grade', () => { delete state.setDismiss[key]; pushState(); renderInput(); });
  } else if (act === 'approve' || act === 'pushdismiss') {
    const pks = pushKeysFor(setId, stt, grd);
    const snap = pks.map(pk => [pk, state.setPush[pk]]);
    const val = act === 'approve' ? 'pushed' : 'dismissed';
    pks.forEach(pk => { state.setPush[pk] = val; });
    pushState(); renderInput();
    toastUndo(act === 'approve' ? 'Approved — moved to Aligned Passages' : 'Dismissed — removed from the list',
      () => { snap.forEach(([pk, prev]) => { if (prev) state.setPush[pk] = prev; else delete state.setPush[pk]; });
              pushState(); renderInput(); });
  }
}

/* ---------- view switching + init ---------- */
function renderAll() {
  renderStdList();
  renderDetail();
  renderReview();
  renderBadge();
  renderPassages();
  renderInput();
  renderDash();
}

/* ---------- dashboard ----------
   Per-grade inventory: how many passage sets each sub-domain holds, split
   single-passage vs multi-passage — the coverage view for planning what to build next. */

// Finest sub-domain we can name for a set: literary genres use the hierarchy subtopic;
// content-area sets use their tagged standard's strand (Earth/Life/Physical Science,
// History, Geography, …), falling back to the subtopic when no standard is tagged.
function setSubdomain(s) {
  if (s.genre === 'literary' || s.genre === 'literary_nonfiction') return s.gaSubtopic || 'Untagged';
  const std = tagStd(s.standard);
  const strand = std && std.strand;
  if (strand === 'Earth and Space Science') return 'Earth Science';
  if (strand) return strand;
  return s.gaSubtopic || 'Untagged';
}

// The sub-domains a grade is EXPECTED to cover (the hierarchy), grouped by genre —
// missing ones must show, in red. G2's informational level is coarser.
const DASH_LITERARY = ['Poetry', 'Narrative Fiction', 'Traditional Literature', 'Short Literary Forms'];
const DASH_LITNF = ['Biographies', 'True Narratives'];
const DASH_GROUPS = {
  '2': [
    ['Informational', ['Science', 'Social Studies']],
    ['Literary', DASH_LITERARY],
    ['Literary Non-Fiction', DASH_LITNF],
  ],
  '3-8': [
    ['Informational', ['Earth Science', 'Life Science', 'Physical Science',
                       'History', 'Geography', 'Government', 'Economics']],
    ['Literary', DASH_LITERARY],
    ['Literary Non-Fiction', DASH_LITNF],
  ],
};
const DASH_GOAL = 4;   // sets per sub-domain per item-set type

function dashSubdomain(s, grade) {
  let dom = setSubdomain(s);
  if (grade === '2') {   // fold fine strands back to G2's coarse hierarchy
    if (['Earth Science', 'Life Science', 'Physical Science'].includes(dom)) dom = 'Science';
    if (['History', 'Geography', 'Government', 'Economics'].includes(dom)) dom = 'Social Studies';
  }
  return dom;
}

function dashCell(n) {
  const cls = n >= DASH_GOAL ? 'goal-met' : n > 0 ? 'goal-partial' : 'goal-missing';
  return `<td class="dash-cell ${cls}">${n}</td>`;
}

function renderDash() {
  const wrap = document.getElementById('dashWrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  if (!state.sets.length) {
    wrap.appendChild(el(`<div class="review-empty">No passage sets yet.</div>`));
    return;
  }
  const dst = state.ui.dashState;
  // Coverage per STATE list: a set counts toward a grade when it serves (or, still a
  // draft, WILL serve) that state's list at that grade — own tag, universal, or an
  // approved ±1 alignment. Dismissed-from-that-grade sets don't count.
  const servingSets = g => state.sets.filter(s =>
    !state.setDismiss[inputKey(s.id, dst, g)] &&
    setServes(s, true).some(v => v.state === dst && v.grade === String(g)));
  const totalServing = GRADES.reduce((a, g) => a + servingSets(g).length, 0);
  const prog = document.getElementById('dashProgress');
  if (prog) prog.textContent = `${totalServing} passage placements across ${STATE_NAMES[dst]} grade lists · drafts included · goal ${DASH_GOAL} per sub-domain per type`;

  GRADES.forEach(g => {
    const sets = servingSets(g);
    const groups = DASH_GROUPS[g === '2' ? '2' : '3-8'];
    const expect = groups.flatMap(([, doms]) => doms);

    // sub-domain -> {informative, opinion}
    const tally = new Map(expect.map(d => [d, { informative: 0, opinion: 0 }]));
    sets.forEach(s => {
      const dom = dashSubdomain(s, g);
      const t = tally.get(dom) || { informative: 0, opinion: 0 };
      t[s.itemSetType === 'informative' ? 'informative' : 'opinion']++;
      tally.set(dom, t);
    });

    // summary: how many (sub-domain × type) cells hit the goal / are partial / missing
    let met = 0, partial = 0, missing = 0;
    expect.forEach(d => {
      const t = tally.get(d);
      [t.informative, t.opinion].forEach(n => { n >= DASH_GOAL ? met++ : n > 0 ? partial++ : missing++; });
    });

    wrap.appendChild(el(`
      <div class="dash-card open">
        <div class="dash-head">
          <span class="dash-grade">Grade ${esc(g)}</span>
          <span class="dash-summary">
            <span class="dash-dot goal-met">${met}</span>
            <span class="dash-dot goal-partial">${partial}</span>
            <span class="dash-dot goal-missing">${missing}</span>
            <span class="ps-hint">${sets.length} set${sets.length !== 1 ? 's' : ''}</span>
          </span>
        </div>
        <table class="dash-table">
          <thead><tr><th>Sub-domain</th><th>Informational</th><th>Opinion</th></tr></thead>
          <tbody>
            ${groups.map(([label, doms]) => `
              <tr class="dash-group-row"><td colspan="3">${esc(label)}</td></tr>
              ${doms.map(d => {
                const t = tally.get(d);
                return `<tr><td>${esc(d)}</td>${dashCell(t.informative)}${dashCell(t.opinion)}</tr>`;
              }).join('')}`).join('')}
          </tbody>
          <tfoot><tr><td>Goal: ${DASH_GOAL} per type</td>
            <td>${expect.reduce((a, d) => a + tally.get(d).informative, 0)}</td>
            <td>${expect.reduce((a, d) => a + tally.get(d).opinion, 0)}</td></tr></tfoot>
        </table>
      </div>`));
  });
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
    document.getElementById('dashView').classList.toggle('hidden', state.ui.view !== 'dash');
    if (state.ui.view === 'dash') renderDash();
  });

  document.getElementById('inState').addEventListener('change', e => {
    state.ui.inState = e.target.value; state.ui.inSelected = null; state.ui.openPicker = null; renderInput();
  });
  document.getElementById('inGrade').addEventListener('change', e => {
    state.ui.inGrade = e.target.value; state.ui.inSelected = null; state.ui.openPicker = null; renderInput();
  });
  bindSeg('inStageSeg', 'inStage', v => { state.ui.inStage = v; state.ui.openPicker = null; renderInput(); });
  bindSeg('dashStateSeg', 'dashState', v => { state.ui.dashState = v; renderDash(); });

  document.getElementById('newSetBtn').addEventListener('click', newPassageSet);

  // Master list filters: status + grade (grade options come from GRADES)
  const fgSel = document.getElementById('setFilterGrade');
  fgSel.innerHTML = `<option value="all">All grades</option>` + GRADES.map(g => `<option value="${g}">Grade ${g}</option>`).join('');
  fgSel.addEventListener('change', e => { state.ui.setFilterGrade = e.target.value; renderSetList(); });
  document.getElementById('setFilterStatus').addEventListener('change', e => {
    state.ui.setFilterStatus = e.target.value; renderSetList();
  });

  document.getElementById('saveBadge').addEventListener('click', async () => {
    const t = prompt('Paste your GitHub access token to connect to the SHARED team dashboard.\n\nYour work (approvals, IDs, tags) saves to the team’s central GitHub file that everyone shares. Only the token itself stays private in this browser — it’s your key, not your data.', ghToken || '');
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

  // Prune before the first render: both the links and the reviewer's decisions must be in
  // hand to tell an orphan from a not-yet-loaded link.
  Promise.all([loadData(), loadPersisted()]).then(() => {
    pruneOrphanDecisions();
    mergeImportedDrafts();
    renderAll();
  });
}

init();
