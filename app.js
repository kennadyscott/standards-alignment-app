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
const APP_BUILD = '202608211634';   // replaced with the deploy stamp
const GRADES = ['2','3','4','5','6','7','8'];
const ANCHOR = 'OH';
// Adding a state = adding an entry here plus its data files in DATA_FILES. Nothing else.
const STATES = ['OH', 'GA', 'TX', 'FL', 'NC', 'SC'];
const STATE_NAMES = { OH: 'Ohio', GA: 'Georgia', TX: 'Texas', FL: 'Florida', NC: 'North Carolina', SC: 'South Carolina', ALL: 'All States' };
const SUBJECT_NAMES = { social_studies: 'Social Studies', science: 'Science', ela: 'ELAR' };
function otherStates(st) { return STATES.filter(s => s !== st); }
// The subtitle derives from STATES so the roster can grow without HTML edits.
{
  const sub = document.querySelector('.brand-sub');
  if (sub) sub.textContent = `${STATES.length} states, Ohio-anchored — ELAR, Science & Social Studies`;
}

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
// Florida codes some benchmarks to a grade BAND (e.g. SS.68.AA.* -> grade "6-8").
// Every single-grade comparison goes through here so banded standards surface at
// each grade the band covers.
function gradeMatches(stdGrade, grade) {
  const g = String(stdGrade);
  if (g === 'All') return true;
  const m = g.match(/^(\d+)-(\d+)$/);
  if (m) return +grade >= +m[1] && +grade <= +m[2];
  return g === String(grade);
}
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
    (std.state === 'ALL' || gradeMatches(std.grade, grade)) &&
    matchesSubtopic(std, subtopic);
}

// Questions always tag to ELAR standards at the set's hierarchy grade.
function questionScope(s) {
  if (!s.gaGrade) return null;
  return std => std.subject === 'ela' &&
    (std.state === 'ALL' || gradeMatches(std.grade, s.gaGrade));
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
  sets: [],
  setDeleted: {},                 // passage sets
  setExported: {},                // setId -> when it was last sent to the CMS
  ui: {
    view: 'explorer',
    expState: 'OH', expSubject: 'social_studies', expGrade: '4',
    selectedKey: null, search: '',
    revSubject: 'social_studies', revGrade: '4', revStatus: 'pending', revState: 'ALL',
    inState: 'OH', inGrade: '4', overrideKey: null,
    inStage: 'all', inSelected: null,                  // State Lists: stage filter + selected set
    dashOpen: {}, dashState: 'OH',                     // Dashboard: expanded grades + which state's lists
    setFilterStatus: 'all', setFilterGrade: 'all', setFilterState: 'all', setSearch: '',   // Master list filters
    currentSetId: null, openPicker: null,
    genOpen: false, genBusy: false, genModal: null,
    gen: { state: 'OH', subject: 'ela', grade: '4', code: '', genre: 'informational',
           subtopic: 'Science', itemSetType: 'informative', passageCount: 1,
           questionCount: 4, words: 225, topic: '', setCount: 1 },
    genResults: [],   // persistent per-batch outcome, shown in the builder itself
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

const LS_DECISIONSAT = 'sa_decisionsat_v1';
const LS_SETFLAG = 'sa_setflag_v1';
const LS_SETFLAGAT = 'sa_setflagat_v1';
const LS_SETSTATEID = 'sa_setstateid_v1';
const LS_SETDELETED = 'sa_setdeleted_v1';
const LS_SETEXPORTED = 'sa_setexported_v1';

const readLS = (k, fallback) => {
  try { return JSON.parse(localStorage.getItem(k)) || fallback; } catch { return fallback; }
};

function loadLocal() {
  state.decisions = readLS(LS_DECISIONS, {});
  state.decisionsAt = readLS(LS_DECISIONSAT, {});
  state.manual = readLS(LS_MANUAL, []);
  state.noAlign = readLS(LS_NOALIGN, {});
  state.cms = readLS(LS_CMS, {});
  state.severed = readLS(LS_SEVERED, {});
  state.crossOk = readLS(LS_CROSSOK, {});
  state.setPush = readLS(LS_SETPUSH, {});
  state.setStateStd = readLS(LS_SETSTATESTD, {});
  state.setCms = readLS(LS_SETCMS, {});
  state.setDismiss = readLS(LS_SETDISMISS, {});
  state.setFlag = readLS(LS_SETFLAG, {});
  state.setFlagAt = readLS(LS_SETFLAGAT, {});
  state.setStateId = readLS(LS_SETSTATEID, {});
  state.setDeleted = readLS(LS_SETDELETED, {});
  state.setExported = readLS(LS_SETEXPORTED, {});
}
function mirrorLocal() {
  // localStorage is only a FALLBACK mirror — the cloud file is the source of truth.
  // The full team state has outgrown Chrome's ~5MB per-origin quota, so a setItem
  // here can throw QuotaExceededError; that must never break the real save path.
  // Small maps mirror first; the giant sets blob goes last, and when it no longer
  // fits it is dropped entirely (a stale sets mirror is worse than none — the app
  // re-derives sets from imported data + the cloud state on every load).
  const put = (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };
  put(LS_DECISIONS, JSON.stringify(state.decisions));
  put(LS_DECISIONSAT, JSON.stringify(state.decisionsAt || {}));
  put(LS_MANUAL, JSON.stringify(state.manual));
  put(LS_NOALIGN, JSON.stringify(state.noAlign));
  put(LS_CMS, JSON.stringify(state.cms));
  put(LS_SEVERED, JSON.stringify(state.severed));
  put(LS_CROSSOK, JSON.stringify(state.crossOk));
  put(LS_SETPUSH, JSON.stringify(state.setPush));
  put(LS_SETSTATESTD, JSON.stringify(state.setStateStd));
  put(LS_SETCMS, JSON.stringify(state.setCms));
  put(LS_SETDISMISS, JSON.stringify(state.setDismiss));
  put(LS_SETFLAG, JSON.stringify(state.setFlag || {}));
  put(LS_SETFLAGAT, JSON.stringify(state.setFlagAt || {}));
  put(LS_SETSTATEID, JSON.stringify(state.setStateId || {}));
  put(LS_SETDELETED, JSON.stringify(state.setDeleted || {}));
  put(LS_SETEXPORTED, JSON.stringify(state.setExported || {}));
  if (!put(LS_SETS, JSON.stringify(state.sets))) {
    try { localStorage.removeItem(LS_SETS); } catch { /* nothing left to free */ }
  }
}


/* ---------- state file slimming ----------
   The shared state file crossed 8 MB and every save is a full pull+merge+push, so a
   save became a ~22 MB round trip — 10+ seconds each, colliding constantly across five
   people. 74% of that file was the CONTENT of the 669 imported sets, which is already
   served read-only from data/imported_sets.json and re-merged on every load.

   So: slim on WRITE, hydrate on READ. An imported set whose content still matches the
   data file is persisted as reviewer-owned fields only; anything edited away from the
   source is stored in full, so a hand-edited set can never be silently reverted. */
const IMPORT_OWNED = ['title', 'passages', 'questions', 'writingPrompt'];
const REVIEWER_OWNED = ['id', 'passageId', 'status', 'itemSetType', 'genre', 'gaGrade',
                        'gaSubtopic', 'primaryState', 'standard', 'peerRevision', 'peerDraft'];

function contentSig(s) {
  return JSON.stringify([
    s.title || '',
    s.passages || [],
    (s.questions || []).map(q => [q.text || '', q.type || null, q.standard || null]),
    (s.writingPrompt || {}).text || '',
  ]);
}

function slimSetForSave(s, sourceById) {
  const src = sourceById.get(s.id);
  if (!src || contentSig(s) !== contentSig(src)) return s;   // not imported, or edited — keep everything
  const out = {};
  REVIEWER_OWNED.forEach(k => { if (s[k] !== undefined) out[k] = s[k]; });
  // per-state question tags are the reviewer's, and they ride on the question objects
  const tags = (s.questions || []).map(q => (q && q.stateStandards) ? { stateStandards: q.stateStandards } : null);
  if (tags.some(Boolean)) out.qTags = tags;
  out.fromImport = true;                                     // marks it for hydration on read
  return out;
}

// Put the deck content back on any set that was persisted slim. Runs after every path
// that can bring server sets into memory, so the rest of the app never sees a slim set.
function hydrateImportedSets() {
  const byId = new Map((state.importedDrafts || []).map(d => [d.id, d]));
  if (!byId.size) return 0;
  let n = 0;
  state.sets.forEach((s, i) => {
    if (!s || !s.fromImport) return;
    const src = byId.get(s.id);
    if (!src) return;                                        // data file missing it — leave as-is
    // Build from the CONTENT fields only. Copying the whole source record would drag
    // its reviewer fields along — and since approval is stored as the ABSENCE of
    // `status`, that silently re-flagged every approved set as a draft.
    const full = {};
    IMPORT_OWNED.forEach(k => { if (src[k] !== undefined) full[k] = JSON.parse(JSON.stringify(src[k])); });
    REVIEWER_OWNED.forEach(k => { if (s[k] !== undefined) full[k] = s[k]; });
    full.id = s.id;
    (s.qTags || []).forEach((t, qi) => {
      if (t && t.stateStandards && full.questions && full.questions[qi]) {
        full.questions[qi].stateStandards = t.stateStandards;
      }
    });
    delete full.fromImport; delete full.qTags;
    state.sets[i] = full;
    n++;
  });
  return n;
}

function stateBody() {
  return JSON.stringify({
    // Link ids reuse the original pair ids (ss4-01…), so these ARE the reviewer's
    // decisions going back to the very first pass. Never prune them.
    decisions: state.decisions,
    decisionsAt: state.decisionsAt || {},
    manual: state.manual,
    noAlign: state.noAlign,
    cms: state.cms,
    severed: state.severed,
    crossOk: state.crossOk,
    setPush: state.setPush,
    setStateStd: state.setStateStd,
    setCms: state.setCms,
    setDismiss: state.setDismiss,
    setFlag: state.setFlag || {},
    setFlagAt: state.setFlagAt || {},
    setStateId: state.setStateId || {},
    setDeleted: state.setDeleted || {},
    setExported: state.setExported || {},
    sets: (() => {
      const byId = new Map((state.importedDrafts || []).map(d => [d.id, d]));
      return byId.size ? state.sets.map(s => slimSetForSave(s, byId)) : state.sets;
    })(),
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
  if (r.status === 404) {
    // GitHub 404s private repos the token can't see — disambiguate "no state file yet"
    // from "this token has no access" (unaccepted invite, fine-grained github_pat_
    // token, or missing repo scope: the top onboarding traps).
    const repo = await fetch(`https://api.github.com/repos/${GH_DATA_REPO}`, { headers: ghApiHeaders() });
    if (!repo.ok) {
      toast('⚠ This token can\'t open the team repo. It must be a CLASSIC token (starts ghp_, not github_pat_) with the "repo" box checked, on an account that accepted the repo invite. Shift-click the badge to re-enter it.');
      throw new Error('no repo access');
    }
    ghSha = null; return {};
  }
  if (!r.ok) throw new Error(`github read ${r.status}`);
  const j = await r.json();
  ghSha = j.sha;
  let text = b64decode(j.content || '');
  if (!text && j.size > 0) {
    // GitHub's contents API stops inlining content above 1MB (encoding:"none").
    // Primary fallback: the git blobs API — plain JSON+base64 from api.github.com,
    // no redirects, browser-safe. (The raw media type redirects large private files
    // cross-origin, which fails inside browsers while working fine from curl.)
    try {
      const br = await fetch(`https://api.github.com/repos/${GH_DATA_REPO}/git/blobs/${j.sha}`,
        { headers: ghApiHeaders() });
      if (!br.ok) throw new Error(`blob ${br.status}`);
      text = b64decode(((await br.json()).content) || '');
    } catch {
      const rr = await fetch(GH_STATE_URL, {
        headers: { ...ghApiHeaders(), Accept: 'application/vnd.github.raw' },
      });
      if (!rr.ok) throw new Error(`github raw read ${rr.status}`);
      text = await rr.text();
    }
  }
  // A transiently empty/truncated body must NEVER be mistaken for an empty state —
  // treating it as {} once let a merge-before-save write an unmerged overwrite.
  if (j.size > 0 && (!text || text.length < j.size * 0.5)) {
    throw new Error('state body incomplete');
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
  {
    const m = mergeDecisions(S('decisions'), S('decisionsAt'), state.decisions, state.decisionsAt || {}, 'local');
    state.decisions = m.decisions; state.decisionsAt = m.decisionsAt;
  }
  state.noAlign = { ...S('noAlign'), ...state.noAlign };
  state.cms = { ...S('cms'), ...state.cms };
  state.severed = { ...S('severed'), ...state.severed };
  state.crossOk = { ...S('crossOk'), ...state.crossOk };
  state.setPush = { ...S('setPush'), ...state.setPush };
  state.setStateStd = { ...S('setStateStd'), ...state.setStateStd };
  state.setCms = { ...S('setCms'), ...state.setCms };
  state.setDismiss = { ...S('setDismiss'), ...state.setDismiss };
  state.setStateId = { ...S('setStateId'), ...(state.setStateId || {}) };
  state.setDeleted = { ...S('setDeleted'), ...(state.setDeleted || {}) };
  state.setExported = { ...S('setExported'), ...(state.setExported || {}) };
  {
    // Flags are raised AND resolved — same both-directions story as decisions,
    // so they get the same newest-wins timestamped merge.
    const m = mergeDecisions(S('setFlag'), S('setFlagAt'), state.setFlag || {}, state.setFlagAt || {}, 'local');
    state.setFlag = m.decisions; state.setFlagAt = m.decisionsAt;
  }
  state.manual = dedupeById([...state.manual, ...(server.manual || [])]);

  const byId = new Map(state.sets.map(x => [x.id, x]));
  (server.sets || []).forEach(sv => {
    if ((state.setDeleted || {})[sv.id]) return;  // deleted here — a tombstone outranks it
    const loc = byId.get(sv.id);
    if (!loc) { state.sets.push(sv); return; }   // exists only server-side — keep it
    // Reviewer progress is monotonic in this workflow — adopt it from the server copy.
    graftProgress(loc, sv);
  });
  hydrateImportedSets();
  normalizeSets();
}

// Copy monotonic reviewer progress from `source` onto `target` (approval, passage ID,
// peer draft/tasks, per-state question tags). There is no un-approve UI, so adopting
// progress from either side is always safe — content fields are never touched here.
function graftProgress(target, source) {
  if (target.status === 'draft' && source.status !== 'draft') delete target.status;
  if (!target.passageId && source.passageId) target.passageId = source.passageId;
  if (source.peerDraft && !target.peerDraft) target.peerDraft = source.peerDraft;
  const tPeerEmpty = !(target.peerRevision || []).some(t => (t.text || '').trim() || t.standard);
  const sPeerHas = (source.peerRevision || []).some(t => (t.text || '').trim() || t.standard);
  if (tPeerEmpty && sPeerHas) target.peerRevision = source.peerRevision;
  (source.questions || []).forEach((q, i) => {
    const tq = (target.questions || [])[i];
    if (tq && q.stateStandards) tq.stateStandards = { ...q.stateStandards, ...(tq.stateStandards || {}) };
  });
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
  if ((r.status === 409 || r.status === 422) && attempt < 5) {
    // The whole team writes this one file, so commits land mid-flight constantly.
    // Back off with jitter so colliding browsers interleave instead of re-racing
    // in lockstep; the recursion re-pulls and re-merges before retrying.
    await new Promise(res => setTimeout(res, 400 + Math.random() * 1500 * (attempt + 1)));
    return ghSave(attempt + 1);
  }
  if (!r.ok) throw new Error(`github write ${r.status}`);
  ghSha = (await r.json()).content.sha;
  dirtyLocal = false;
  lastSyncAt = new Date();
  syncTrouble = false;
  updateSaveBadge();
}

// A refused token is the one failure the user can actually fix, so the badge stops
// offering "retry" (which can only fail again) and offers to replace the token instead.
function tokenRefused() {
  return syncTrouble && /\b40[13]\b|no repo access|Bad credentials/i.test(syncError || '');
}

function updateSaveBadge() {
  const b = document.getElementById('saveBadge');
  if (!b) return;
  if (!ghMode) { b.classList.add('hidden'); return; }
  b.classList.remove('hidden');
  // Honest status: green only when a pull has actually SUCCEEDED — a token alone
  // once showed green while the browser was silently siloed.
  const t = ghToken
    ? (tokenRefused()
        ? '⚠ Sign in again — click to paste a new token'
        : syncTrouble
          ? '⚠ Sync issue — click to retry'
          : lastSyncAt
            ? `● Synced ${lastSyncAt.toTimeString().slice(0, 5)}`
            : '◌ Connecting…')
    : '○ Connect cloud saving';
  b.textContent = t;
  b.title = (syncTrouble && syncError ? `Last error: ${syncError}\n` : '')
    + `Click to sync now · Shift-click to change the access token · build ${typeof APP_BUILD !== 'undefined' ? APP_BUILD : '?'}`
    + ` · ${state.sets.length} sets loaded`;
  b.classList.toggle('badge-ok', !!ghToken && !syncTrouble && !!lastSyncAt);
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
let lastSyncAt = null;   // Date of last successful pull/save
let syncTrouble = false; // last attempt failed — badge shows it
let syncError = '';      // why it failed, surfaced in the badge tooltip and retry toast
let dirtyLocal = false;  // local work not yet committed to the server — sync retries it
async function syncFromServer() {
  // Note: runs even when serverAvailable is false — a failed INITIAL load must not
  // silo this browser forever; the next tick establishes the connection.
  if (!ghMode || !ghToken || ghBusy || syncPulling || userIsTyping()) return false;
  syncPulling = true;
  let ok = false;
  try {
    const r = await fetch(GH_STATE_URL, { headers: ghApiHeaders() });
    if (!r.ok && r.status !== 404) throw new Error(`github read ${r.status}`);
    const j = r.ok ? await r.json() : { sha: null };
    if (j.sha !== ghSha || !serverAvailable) {   // changed, or connection not yet established
      const server = await ghLoad();
      mergeForSave(server);
      renderAll();
    }
    serverAvailable = true;
    ok = true;
    lastSyncAt = new Date();
    syncTrouble = false;
    syncError = '';
  } catch (e) {
    syncTrouble = true;
    // The reason used to be swallowed, which made "Sync issue" undiagnosable from the
    // outside — the app knew what went wrong and threw it away.
    syncError = String((e && e.message) || e || 'unknown error');
  }
  syncPulling = false;
  // A save that was skipped (no connection yet) or failed leaves local-only work behind.
  // Every successful sync tick re-pushes it, so nothing can sit stranded in one browser
  // behind a green badge.
  if (ok && dirtyLocal && ghToken && !ghBusy) postState();
  updateSaveBadge();
  return ok;
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
      .catch(() => { toast('⏳ Cloud is busy (teammates saving) — your work is safe here and retries automatically'); if (onDone) onDone(false); });
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
  dirtyLocal = true;   // before the mirror: even a mirror failure must not skip the cloud save
  mirrorLocal();
  // GitHub saves merge-before-write, so they're safe even before the first pull lands.
  // Only the raw /api/state path (dev server) must wait for the connection — it would
  // otherwise overwrite the server with a not-yet-merged local state.
  if (ghMode ? !ghToken : !serverAvailable) return;
  clearTimeout(syncTimer);
  // Batched (every save is a versioned commit on the live server). The jitter spreads
  // teammates' save moments apart — five browsers on a fixed delay collide far more.
  syncTimer = setTimeout(postState, 2000 + Math.random() * 2000);
}
// Explicit save: skip the debounce and confirm.
function flushState() {
  dirtyLocal = true;
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
      lastSyncAt = new Date();
      syncTrouble = false;
    } catch (e) {
      syncTrouble = true;
      updateSaveBadge();
      syncError = String((e && e.message) || e || 'unknown error');
      toast(`⚠ Could not load the team state (${syncError}) — click the badge to retry`);
      return;   // syncFromServer's interval keeps retrying and will connect
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
    const dm = mergeDecisions(s.decisions || {}, s.decisionsAt || {}, state.decisions, state.decisionsAt || {}, 'server');
    const merged = {
      decisions: dm.decisions,
      manual: dedupeById([...(s.manual || []), ...state.manual]),
      noAlign: { ...state.noAlign, ...(s.noAlign || {}) },
      cms: { ...state.cms, ...(s.cms || {}) },
      severed: { ...state.severed, ...(s.severed || {}) },
      crossOk: { ...state.crossOk, ...(s.crossOk || {}) },
      setPush: { ...state.setPush, ...(s.setPush || {}) },
      setStateStd: { ...state.setStateStd, ...(s.setStateStd || {}) },
      setCms: { ...state.setCms, ...(s.setCms || {}) },
      setDismiss: { ...state.setDismiss, ...(s.setDismiss || {}) },
      setStateId: { ...(state.setStateId || {}), ...(s.setStateId || {}) },
      setDeleted: { ...(state.setDeleted || {}), ...(s.setDeleted || {}) },
      setExported: { ...(state.setExported || {}), ...(s.setExported || {}) },
      setFlagM: mergeDecisions(s.setFlag || {}, s.setFlagAt || {}, state.setFlag || {}, state.setFlagAt || {}, 'server'),
      // Server copies win on CONTENT (freshest deck text), but LOCAL reviewer progress
      // is grafted on so a clobbered/older server copy can never revert this browser's
      // own approvals at load time (that's how a stale server state once "infected"
      // healthy browsers on reload).
      sets: dedupeById((() => {
        const localById = new Map(state.sets.map(x => [x.id, x]));
        const out = (s.sets || []).map(sv => {
          const loc = localById.get(sv.id);
          if (loc) { graftProgress(sv, loc); localById.delete(sv.id); }
          return sv;
        });
        localById.forEach(loc => out.push(loc));
        return out;
      })()),
    };
    state.decisions = merged.decisions;
    state.decisionsAt = dm.decisionsAt;
    state.manual = merged.manual;
    state.noAlign = merged.noAlign;
    state.cms = merged.cms;
    state.severed = merged.severed;
    state.crossOk = merged.crossOk;
    state.setPush = merged.setPush;
    state.setStateStd = merged.setStateStd;
    state.setCms = merged.setCms;
    state.setDismiss = merged.setDismiss;
    state.setStateId = merged.setStateId;
    state.setDeleted = merged.setDeleted;
    state.setExported = merged.setExported;
    state.setFlag = merged.setFlagM.decisions;
    state.setFlagAt = merged.setFlagM.decisionsAt;
    state.sets = merged.sets.filter(x => !state.setDeleted[x.id]);
    hydrateImportedSets();   // put deck content back on sets persisted in slim form
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
  dead.forEach(k => { delete state.decisions[k]; if (state.decisionsAt) delete state.decisionsAt[k]; });
  if (dead.length) { mirrorLocal(); pushState(); }
  return dead.length;
}

/* Reviewer decisions can be CHANGED (reject → reconsider → approve), and every browser
   holds its own copy — a plain local-wins merge lets any teammate's stale copy re-assert
   an old decision forever. Each write is therefore timestamped, and merges pick the
   NEWEST call per link. Legacy entries (made before timestamps) rank as 0, so any
   re-decision beats every stale copy still cached in other browsers. */
// Review flags use the same timestamped write so resolving one sticks (see setDecision).
function setFlagValue(key, val) {
  state.setFlag = state.setFlag || {};
  if (val === undefined) delete state.setFlag[key];
  else state.setFlag[key] = val;
  (state.setFlagAt = state.setFlagAt || {})[key] = Date.now();
}
function setDecision(id, val) {
  if (val === undefined) delete state.decisions[id];
  else state.decisions[id] = val;
  (state.decisionsAt = state.decisionsAt || {})[id] = Date.now();
}
function mergeDecisions(server, serverAt, local, localAt, tieWins) {
  const out = {}, outAt = {};
  new Set([...Object.keys(server), ...Object.keys(local),
           ...Object.keys(serverAt), ...Object.keys(localAt)]).forEach(k => {
    const ts = serverAt[k] || 0, tl = localAt[k] || 0;
    let side;
    if (tl > ts) side = 'local';
    else if (ts > tl) side = 'server';
    else side = tieWins === 'local'
      ? (k in local ? 'local' : 'server')
      : (k in server ? 'server' : 'local');
    const src = side === 'local' ? local : server;
    if (k in src) out[k] = src[k];
    const t = Math.max(ts, tl);
    if (t) outAt[k] = t;
  });
  return { decisions: out, decisionsAt: outAt };
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
        // North Carolina prints each objective's FULL code inline ("PS.2.1.1 Carry out…") —
        // adopt it as the element code so numbered objectives don't collapse onto the parent.
        const f = !m && e2.match(/^(\S+)\s+([\s\S]*)$/);
        const full = f && f[1].startsWith(s.code + '.') ? f : null;
        out.push({
          ...s,
          code: m ? s.code + m[1] : full ? full[1] : s.code,
          description: m ? m[2] : full ? full[2] : e2,
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
  'data/florida_science.json', 'data/florida_social_studies.json', 'data/florida_ela.json',
  'data/north_carolina_science.json', 'data/north_carolina_social_studies.json', 'data/north_carolina_ela.json',
  'data/south_carolina_science.json', 'data/south_carolina_social_studies.json', 'data/south_carolina_ela.json',
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
  hydrateImportedSets();
  const have = new Map(state.sets.map(s => [s.id, s]));
  (state.importedDrafts || []).forEach(d => {
    if ((state.setDeleted || {})[d.id]) return;   // deleted by a reviewer — stay deleted
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

/* State pickers are DROPDOWNS, alphabetical by state name — the roster keeps growing,
   and buttons stopped scaling at five. Populated from STATES: adding a state is now a
   data-only change (no index.html edits). */
function stateOptionsHtml(includeAll) {
  const sorted = [...STATES].sort((a, b) => STATE_NAMES[a].localeCompare(STATE_NAMES[b]));
  return (includeAll ? `<option value="ALL">All states</option>` : '')
    + sorted.map(s => `<option value="${s}">${STATE_NAMES[s]}</option>`).join('');
}
function bindStateSelect(id, includeAll, initial, onChange) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = stateOptionsHtml(includeAll);
  sel.value = initial;
  sel.addEventListener('change', e => onChange(e.target.value));
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
  let list = state.standards.filter(s => s.state === expState && s.subject === expSubject && gradeMatches(s.grade, expGrade));
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
  if (!a || !b || a.grade === 'All' || b.grade === 'All'
      || String(a.grade).includes('-') || String(b.grade).includes('-')) return 0;  // banded = no span penalty
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
    setDecision(l.id, 'approved');
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
      .forEach(l => { setDecision(l.id, 'rejected'); });
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
    setDecision(id, 'pending');
    saveDecisions();
    toast('Back in the queue');
  } else if (act === 'pending') {
    setDecision(id, undefined);
    saveDecisions();
    toast('Reset to pending');
  } else {
    setDecision(id, act);
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
/* ---------- CMS export ----------
   The dashboard stores a question as ONE blob — stem, lettered options and the answer
   key all in the same field, exactly as the source decks wrote them. A CMS needs those
   as separate fields, so the export parses the blob apart rather than asking anyone to
   re-key 3,000 questions.

   Field NAMES here are ours, not the CMS's. Every name the export emits is declared in
   CMS_FIELDS below, so remapping to the real CMS schema is a one-place edit — no digging
   through the builder. */
/* Shaped to the ECR "Static Q Item Set" builder, which is four tabs over one item set:

     sidebar   Grade · Item Set Type · Topic · Title · Approved
     Passage   Passage Type (Single/Multiple) · Title · Passage (rich text) · Writing Prompt
     SubTopic  State + SubTopic, REPEATABLE (+ Add) — one row per state the set serves
     Question  State → State Standard · Question Type · Question tab + ANSWER tab
     Peer Revision Task

   The Question and Answer tabs being separate is the whole reason this export exists:
   our questions arrive as one blob with the answer key inside them, so the answer has
   to be lifted out before anything can be imported.

   Passage/Question fields are rich-text editors, so text is emitted as simple HTML
   paragraphs as well as plain text — the importer can take whichever it wants. */
const CMS_ITEM_TYPES = {
  multiple_choice: 'Multiple Choice',
  multi_select: 'Multi-Select',
  cloze: 'Cloze',
  text_entry: 'Text Entry',
};

/* Cloze is shaped differently from every other type in the CMS. The Question tab is
   fixed boilerplate; the SENTENCE lives in the Answer tab with a "Dropdown Response"
   placeholder where the menu goes; the choices become a Response group with the correct
   one selected. Our items carry the sentence and its "[a / b / c]" menu inline, so the
   export has to take them apart into those three pieces. */
const CLOZE_QUESTION_TEXT = 'Use the drop-down menu to complete the statement.';
const CLOZE_PLACEHOLDER = 'Dropdown Response';

// The imported decks write cloze a second way: a "[ ▾ ]" placeholder in the sentence
// with the choices listed on the lines beneath it and the correct one carrying a check
// mark. That is already the CMS's own shape, so it maps across almost untouched.
const CLOZE_MENU_GLYPH = /\[\s*[▾▼]\s*\]/g;
const CLOZE_CHECK = /\s*[✓✔√]\s*$/;

function buildClozeFromCheckedList(rawText) {
  const lines = String(rawText || '').split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  // Options are the trailing short lines; the sentence is everything before them.
  let firstOpt = -1;
  for (let i = lines.length - 1; i >= 1; i--) {
    const isOpt = CLOZE_CHECK.test(lines[i]) || (lines[i].split(/\s+/).length <= 8 && !/[.?!]$/.test(lines[i]));
    if (isOpt) firstOpt = i; else break;
  }
  if (firstOpt < 1) return null;
  const optionLines = lines.slice(firstOpt);
  if (optionLines.length < 2) return null;
  const sentence = lines.slice(0, firstOpt).join('\n').replace(CLOZE_MENU_GLYPH, CLOZE_PLACEHOLDER);
  const options = optionLines.map(l => ({
    text: l.replace(CLOZE_CHECK, '').trim(),
    correct: CLOZE_CHECK.test(l),
  }));
  if (!options.some(o => o.correct)) return null;   // no key marked — let the caller report it
  return { sentence, responses: [{ response: 1, options }], answer_matched: true };
}

function buildClozeItem(parsed, rawText) {
  const checked = buildClozeFromCheckedList(rawText);
  if (checked) return checked;
  // The sentence is everything except the answer key line, with each inline menu
  // swapped for the placeholder the CMS shows.
  let sentence = String(rawText || '').split('\n')
    .filter(l => !/^\s*Answers?\s*:/i.test(l)).join('\n').trim();
  sentence = sentence.replace(/\[([^\]]*?\/[^\]]*?)\]/g, CLOZE_PLACEHOLDER)
                     .replace(CLOZE_MENU_GLYPH, CLOZE_PLACEHOLDER);

  const key = (parsed.answerRaw || '').trim().toLowerCase().replace(/\.$/, '');
  const responses = parsed.blanks.map(b => {
    // One blank is the norm (678 of 686); with several, the key can only be matched to
    // the blank that actually offers it.
    const options = b.options.map(o => {
      const marked = CLOZE_CHECK.test(o);
      const t = o.replace(CLOZE_CHECK, '').trim();
      const lo = t.toLowerCase().replace(/\.$/, '');
      return { text: t, correct: marked || (!!key && (lo === key || lo.includes(key) || key.includes(lo))) };
    });
    return { response: b.blank, options };
  });
  const matched = responses.some(r => r.options.some(o => o.correct));
  return { sentence, responses, answer_matched: matched };
}

/* Two option conventions live in the library:
     generated -> "a. text"           with a trailing "Answer: b" line
     imported  -> "A  text ✓"         letter, two spaces, and a check mark for the key
   The two-space requirement matters: a single space would swallow ordinary sentences
   that happen to begin "A busy bee…". */
const Q_OPT = /^\s*([a-hA-H])(?:[.)]\s+|\s{2,})(.*\S)\s*$/;
const Q_CHECK = /\s*[✓✔√]\s*$/;
const Q_ANS = /^\s*Answers?\s*:\s*(.*)$/i;
const Q_DROP = /\[([^\]]*?\/[^\]]*?)\]/g;

/* Split one combined question into stem / options / answer key / inline choices.
   Measured against the live library: 100% of multiple_choice and multi_select parse,
   and the cloze items that do not are the ones with no "Answer:" line at all — those
   are reported rather than guessed at. */
function parseQuestion(q) {
  const text = String(q.text || '').replace(/\r/g, '');
  const lines = text.split('\n');
  const stemLines = [], options = [];
  let answerRaw = null;
  lines.forEach(ln => {
    const a = ln.match(Q_ANS);
    if (a) { answerRaw = a[1].trim(); return; }
    const m = ln.match(Q_OPT);
    if (m && (options.length || stemLines.length)) {
      const checked = Q_CHECK.test(m[2]);
      options.push({ label: m[1].toLowerCase(), text: m[2].replace(Q_CHECK, '').trim(), checked });
      return;
    }
    if (options.length) { if (ln.trim()) options[options.length - 1].text += ' ' + ln.trim(); }
    else stemLines.push(ln);
  });
  const stem = stemLines.join('\n').trim();

  const blanks = [];
  if (q.type === 'cloze') {
    let mm, i = 0;
    Q_DROP.lastIndex = 0;
    while ((mm = Q_DROP.exec(text)) !== null) {
      blanks.push({ blank: ++i, options: mm[1].split('/').map(s => s.trim()).filter(Boolean) });
    }
  }

  let correct = [];
  // A checked option IS the answer key — the imported decks mark it that way and carry
  // no "Answer:" line at all.
  const checkedLabels = options.filter(o => o.checked).map(o => o.label);
  if (checkedLabels.length) {
    correct = checkedLabels.sort();
    if (!answerRaw) answerRaw = correct.join(', ');
  } else if (answerRaw) {
    const letters = (answerRaw.toLowerCase().match(/\b([a-h])\b(?=[.)\s,;]|$)/g) || [])
      .map(s => s.trim());
    correct = (options.length && letters.length) ? [...new Set(letters)].sort() : [answerRaw];
  }
  const complete = !!stem && !!answerRaw &&
    ((q.type === 'multiple_choice' || q.type === 'multi_select') ? options.length >= 2 && correct.length
      : q.type === 'cloze' ? (blanks.length || correct.length) : correct.length);
  return { stem, options, blanks, answerRaw, correct, complete };
}

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(rows, columns) {
  return [columns.join(','), ...rows.map(r => columns.map(c => csvCell(r[c])).join(','))].join('\n');
}
function downloadFile(name, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const htmlEscape = t => String(t || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Rich-text fields want markup; keep paragraph breaks, keep our 1./2./3. numbering.
const toHtml = t => String(t || '').split(/\n\s*\n|\n/).map(p => p.trim()).filter(Boolean)
  .map(p => `<p>${htmlEscape(p)}</p>`).join('');

/* Which states does this set actually serve, and under which sub-topic in each?
   Feeds the repeatable SubTopic rows. */
function cmsSubTopics(s) {
  const rows = [];
  (setServes(s, true) || []).forEach(v => {
    if (rows.some(r => r.state === v.state && r.grade === String(v.grade))) return;
    rows.push({
      state: v.state, state_name: STATE_NAMES[v.state] || v.state,
      grade: String(v.grade),
      sub_topic: dashSubdomain(s, String(v.grade), v.state),
    });
  });
  return rows;
}

/* One item set, shaped like the builder's tabs. */
function cmsItemSet(s, problems) {
  const subTopics = cmsSubTopics(s);
  const primary = primaryStateOf(s) || (s.standard || {}).state || '';
  const grade = String(s.gaGrade || '');
  const stateId = (state.setStateId || {})[inputKey(s.id, primary, grade)];
  const externalId = stateId || s.passageId || '';
  if (!externalId) problems.push({ set: s.title, issue: 'no CMS passage ID recorded — importer will need to create one' });

  const passages = (s.passages || []).map(p => ({
    title: p.title || '', text: p.text || '', html: toHtml(p.text), word_count: wordCount(p.text),
  }));

  const questions = (s.questions || []).map((q, i) => {
    if (!(q.text || '').trim()) return null;
    const p = parseQuestion(q);
    // The CMS keeps the stem+choices in the Question tab and the key in the Answer tab,
    // so that is the primary split; the parsed choices are supplied too in case the
    // importer wants them individually.
    const isCloze = q.type === 'cloze';
    const cloze = isCloze ? buildClozeItem(p, q.text) : null;
    // Cloze: the Question tab is boilerplate and the sentence belongs in the Answer tab.
    // Everything else: stem + lettered choices in the Question tab, key in the Answer tab.
    const questionBody = isCloze
      ? CLOZE_QUESTION_TEXT
      : [p.stem, ...p.options.map(o => `${o.label}. ${o.text}`)].filter(Boolean).join('\n');
    const answerBody = isCloze ? cloze.sentence : (p.answerRaw || '');
    const perState = {};
    subTopics.forEach(r => {
      const tag = (q.stateStandards || {})[r.state]
        || (q.standard && q.standard.state === r.state ? q.standard : null);
      if (tag) perState[r.state] = tag.code;
    });
    if (!Object.keys(perState).length) problems.push({ set: s.title, item: i + 1, issue: 'no state standard tagged — the Question tab requires one' });
    if (isCloze && !cloze.answer_matched) {
      problems.push({ set: s.title, item: i + 1,
        issue: 'cloze answer does not match any drop-down choice — no Response can be marked correct' });
    } else if (!isCloze && !p.complete) {
      problems.push({ set: s.title, item: i + 1, issue: 'no answer key found in the question text — Answer tab would be blank' });
    }
    return {
      number: i + 1,
      question_type: CMS_ITEM_TYPES[q.type] || q.type || '',
      question_text: questionBody,
      question_html: toHtml(questionBody),
      answer_text: answerBody,
      answer_html: toHtml(answerBody),
      correct_choices: isCloze ? [] : p.correct,
      choices: isCloze ? [] : p.options,
      cloze_responses: isCloze ? cloze.responses : [],
      state_standards: perState,
      needs_review: (isCloze ? !cloze.answer_matched : !p.complete) || !Object.keys(perState).length,
    };
  }).filter(Boolean);

  const peer = (s.peerRevision || []).filter(t => (t.text || '').trim()).map((t, i) => ({
    number: i + 1, task_text: t.text, task_html: toHtml(t.text),
    question_type: CMS_ITEM_TYPES[t.type] || t.type || '',
    standard: t.standard ? t.standard.code : '',
  }));

  return {
    external_id: externalId, source_id: s.id,
    grade, item_set_type: s.itemSetType || '', topic: s.genre || '',
    title: s.title || '', approved: !isDraft(s),
    passage: {
      passage_type: passages.length > 1 ? 'Multiple' : 'Single',
      passages,
      writing_prompt: (s.writingPrompt || {}).text || '',
      writing_prompt_type: (s.writingPrompt || {}).type || '',
    },
    sub_topics: subTopics,
    questions,
    peer_revision_tasks: peer,
  };
}

function buildCmsExport(sets) {
  const problems = [];
  const itemSets = sets.map(s => cmsItemSet(s, problems));
  return { itemSets, problems };
}

/* The recommended batch is ONE STATE x ONE GRADE — 60-85 item sets, ~1-1.7 MB. That is
   small enough to review before importing and to re-run cleanly if the importer stops
   half way, and it matches how the work is actually organised (the State Lists pipeline
   and the CMS's own Grade + per-state SubTopic). Exporting the whole library is 1,450
   sets / 5,555 questions / ~20 MB in one file, which is a bad unit of recovery, so a
   broad scope has to be confirmed rather than happening by accident. */
const CMS_BATCH_ADVICE = 'Recommended batch: one state × one grade (about 60–85 sets).';

/* Export readiness is NOT approval. Approval happens after the CMS hands back a set ID,
   so the export gate has to sit earlier: a set is ready when it is complete enough to
   send, and it stops being "to send" once its CMS ID has been recorded.

   Lifecycle:  not ready  ->  ready to export  ->  awaiting CMS ID  ->  has ID  ->  approved
   Readiness reuses the export's own parser, so the filter can never disagree with what
   the export would actually produce. */
function cmsPassageIdFor(s) {
  const st = primaryStateOf(s) || (s.standard || {}).state || '';
  return (state.setStateId || {})[inputKey(s.id, st, String(s.gaGrade))] || s.passageId || '';
}

function exportReadiness(s) {
  const reasons = [];
  const passages = (s.passages || []).filter(p => (p.text || '').trim());
  if (!passages.length) reasons.push('no passage text');
  if (!(s.title || '').trim()) reasons.push('no title');
  if (!s.gaGrade) reasons.push('no grade');
  if (!s.itemSetType) reasons.push('no item set type');
  if (!s.standard) reasons.push('no primary standard');
  if (!((s.writingPrompt || {}).text || '').trim()) reasons.push('no writing prompt');

  const qs = (s.questions || []).filter(q => (q.text || '').trim());
  if (!qs.length) reasons.push('no questions');
  let noKey = 0, noStd = 0;
  qs.forEach(q => {
    const p = parseQuestion(q);
    const ok = q.type === 'cloze' ? buildClozeItem(p, q.text).answer_matched : p.complete;
    if (!ok) noKey++;
    const tagged = (q.standard && q.standard.state) || Object.keys(q.stateStandards || {}).length;
    if (!tagged) noStd++;
  });
  if (noKey) reasons.push(`${noKey} question${noKey > 1 ? 's' : ''} with no answer key`);
  if (noStd) reasons.push(`${noStd} question${noStd > 1 ? 's' : ''} with no standard`);

  const hasId = !!cmsPassageIdFor(s);
  const exportedAt = (state.setExported || {})[s.id] || null;
  return {
    ready: !reasons.length, reasons, hasId, exportedAt,
    stage: reasons.length ? 'not-ready' : hasId ? 'has-id' : exportedAt ? 'awaiting-id' : 'ready',
  };
}

function exportForCms() {
  const sets = visibleMasterSets();
  if (!sets.length) { toast('Nothing to export — widen the filters first'); return; }
  const st = state.ui.setFilterState, gr = state.ui.setFilterGrade;
  const scopeText = [
    st === 'all' ? 'ALL states' : (STATE_NAMES[st] || st),
    gr === 'all' ? 'ALL grades' : `Grade ${gr}`,
    state.ui.setFilterStatus === 'all' ? 'all statuses' : state.ui.setFilterStatus,
  ].join(' · ');
  const broad = st === 'all' || gr === 'all';
  const qCount = sets.reduce((a, s) => a + (s.questions || []).filter(q => (q.text || '').trim()).length, 0);
  if (broad && !confirm(
      `Export ${sets.length} item sets (${qCount} questions)?\n\nScope: ${scopeText}\n\n`
      + `${CMS_BATCH_ADVICE}\nNarrow the State and Grade filters first if you want a smaller batch.`)) {
    return;
  }
  const { itemSets, problems } = buildCmsExport(sets);
  const stamp = new Date().toISOString().slice(0, 10);
  const scopeState = st !== 'all' ? st : 'all';
  const tag = `-${scopeState}${gr === 'all' ? '' : `-g${gr}`}`;

  downloadFile(`cms-import${tag}-${stamp}.json`, JSON.stringify({
    generated_at: new Date().toISOString(),
    target: 'ECR / Item Sets / Static Q Item Set',
    scope: { primary_state: scopeState, grade: gr, status: state.ui.setFilterStatus,
             search: state.ui.setSearch || null, label: scopeText },
    batch_advice: CMS_BATCH_ADVICE,
    counts: { item_sets: itemSets.length,
              questions: itemSets.reduce((a, x) => a + x.questions.length, 0),
              peer_tasks: itemSets.reduce((a, x) => a + x.peer_revision_tasks.length, 0) },
    item_types: CMS_ITEM_TYPES,
    item_sets: itemSets,
    needs_attention: problems,
  }, null, 2), 'application/json');

  // Flat views for eyeballing in a spreadsheet before the importer runs.
  const qRows = [], stRows = [];
  itemSets.forEach(is => {
    is.questions.forEach(q => qRows.push({
      external_id: is.external_id, title: is.title, grade: is.grade,
      item_number: q.number, question_type: q.question_type,
      question_text: q.question_text, answer_text: q.answer_text,
      correct: q.correct_choices.join('|'),
      standards: Object.entries(q.state_standards).map(([k, v]) => `${k}:${v}`).join(' | '),
      needs_review: q.needs_review ? 'yes' : '',
    }));
    is.sub_topics.forEach(r => stRows.push({
      external_id: is.external_id, title: is.title,
      state: r.state_name, grade: r.grade, sub_topic: r.sub_topic,
    }));
  });
  downloadFile(`cms-questions${tag}-${stamp}.csv`, toCsv(qRows,
    ['external_id','title','grade','item_number','question_type','question_text','answer_text','correct','standards','needs_review']), 'text/csv');
  downloadFile(`cms-subtopics${tag}-${stamp}.csv`, toCsv(stRows,
    ['external_id','title','state','grade','sub_topic']), 'text/csv');

  // Remember what has been sent, so the next batch can exclude it and the list can show
  // which sets are waiting on a CMS ID.
  const now = Date.now();
  state.setExported = state.setExported || {};
  sets.forEach(s => { state.setExported[s.id] = now; });
  pushState(); renderSetList();

  toast(problems.length
    ? `Exported ${itemSets.length} item sets · ${qRows.length} questions — ${problems.length} need attention (see the JSON)`
    : `✓ Exported ${itemSets.length} item sets · ${qRows.length} questions, all complete`);
}

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
      <span class="align-mini-desc">${esc(s.description)}</span>
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

/* The set-level chip says "3 questions with no answer key"; this says WHICH one, right
   above the box you would type it into, and states the two accepted formats so nobody
   has to guess at the syntax the exporter reads. */
function answerKeyWarningHtml(q, section) {
  if (section === 'peer') return '';                 // peer tasks carry their own answer inline
  if (!(q.text || '').trim()) return '';
  const p = parseQuestion(q);
  const ok = q.type === 'cloze' ? buildClozeItem(p, q.text).answer_matched : p.complete;
  if (ok) return '';
  return `<div class="key-warn">
      <b>⚠ No answer key</b> — this question can't be exported to the CMS yet.
      Mark the answer either way:
      <span class="key-eg">Answer: b</span> on its own line, or a
      <span class="key-eg">✓</span> at the end of the correct choice.
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
      ${answerKeyWarningHtml(q, section)}
      <textarea class="ps-textarea q-text" data-q="${section}:${i}" rows="5"
        placeholder="Paste the entire question here, including all answer choices.">${esc(q.text)}</textarea>
      <div class="q-tag-area">${area}</div>
    </div>`;
}

/* Options carry live counts, so this is rebuilt on every render — building it once in
   init() left every count at zero, because the cloud state had not arrived yet. */
/* The Master Passage List's filter, as a function — the export uses the SAME one, so
   "what you are looking at" and "what you export" can never drift apart. */
function visibleMasterSets() {
  const fs = state.ui.setFilterStatus, fg = state.ui.setFilterGrade, fst = state.ui.setFilterState;
  // Primary state: the explicit dropdown choice, else the tagged standard's state.
  // Literary/Literary Non-Fiction anchor to a universal sub-genre (state "ALL") and so
  // serve every state — they match any specific state as well as their own option.
  const matchesState = s => {
    if (fst === 'all') return true;
    const ps = primaryStateOf(s) || ((s.standard || {}).state) || null;
    if (fst === 'ALL') return ps === 'ALL';
    if (fst === 'none') return !ps;
    return ps === fst || ps === 'ALL';
  };
  const q = (state.ui.setSearch || '').toLowerCase().trim();
  const matchesSearch = s => {
    if (!q) return true;
    return (s.title || '').toLowerCase().includes(q)
      || (s.passageId || '').toLowerCase().includes(q)
      || ((s.standard || {}).code || '').toLowerCase().includes(q)
      || (s.passages || []).some(p => (p.title || '').toLowerCase().includes(q)
                                   || (p.text || '').toLowerCase().includes(q));
  };
  // Status now spans the export lifecycle as well as draft/approved, because approval
  // happens AFTER the CMS returns a set ID — it cannot be the gate for sending.
  const matchesStatus = s => {
    switch (fs) {
      case 'all':       return true;
      case 'draft':     return isDraft(s);
      case 'approved':  return !isDraft(s);
      case 'ready':     return exportReadiness(s).stage === 'ready';
      case 'not-ready': return exportReadiness(s).stage === 'not-ready';
      case 'no-key':    return exportReadiness(s).reasons.some(r => r.includes('answer key'));
      case 'awaiting':  return exportReadiness(s).stage === 'awaiting-id';
      case 'has-id':    return exportReadiness(s).stage === 'has-id';
      default:          return true;
    }
  };
  return state.sets.filter(s =>
    matchesStatus(s) &&
    (fg === 'all' || String(s.gaGrade) === fg) &&
    matchesState(s) && matchesSearch(s));
}

function buildPrimaryStateFilter() {
  const sel = document.getElementById('setFilterState');
  if (!sel) return;
  const counts = {};
  state.sets.forEach(s => {
    const ps = primaryStateOf(s) || ((s.standard || {}).state) || 'none';
    counts[ps] = (counts[ps] || 0) + 1;
  });
  const sorted = [...STATES].sort((a, b) => STATE_NAMES[a].localeCompare(STATE_NAMES[b]));
  const html = `<option value="all">All primary states</option>`
    + sorted.map(s => `<option value="${s}">${STATE_NAMES[s]}${counts[s] ? ` (${counts[s]})` : ''}</option>`).join('')
    + (counts.ALL ? `<option value="ALL">Universal — all states (${counts.ALL})</option>` : '')
    + (counts.none ? `<option value="none">No primary state (${counts.none})</option>` : '');
  if (sel.innerHTML !== html) sel.innerHTML = html;   // don't stomp an open dropdown needlessly
  if (state.ui.setFilterState && [...sel.options].some(o => o.value === state.ui.setFilterState)) {
    sel.value = state.ui.setFilterState;
  } else {
    state.ui.setFilterState = 'all'; sel.value = 'all';
  }
}

/* A row has to say why a set cannot be sent — "not ready" alone sends someone hunting.
   The missing answer key is called out by name because it is the single biggest blocker
   in the library. */
function readinessChipHtml(s) {
  const r = exportReadiness(s);
  if (r.stage === 'has-id') {
    return `<div class="ready-chip in-cms">✓ In CMS · ${esc(cmsPassageIdFor(s))}</div>`;
  }
  if (r.stage === 'awaiting-id') {
    return `<div class="ready-chip awaiting">↑ Exported — awaiting CMS ID</div>`;
  }
  if (r.stage === 'ready') {
    return `<div class="ready-chip ready">● Ready for export</div>`;
  }
  const keyReason = r.reasons.find(x => x.includes('answer key'));
  const label = keyReason ? `⚠ ${keyReason}` : `⚠ ${r.reasons[0]}${r.reasons.length > 1 ? ` +${r.reasons.length - 1}` : ''}`;
  return `<div class="ready-chip blocked" title="${esc(r.reasons.join(' · '))}">${esc(label)}</div>`;
}

function renderSetList() {
  const box = document.getElementById('setList');
  box.innerHTML = '';
  if (!state.sets.length) {
    box.appendChild(el(`<div class="review-empty">No passage sets yet.<br>Create one to get started.</div>`));
    return;
  }
  buildPrimaryStateFilter();
  const list = visibleMasterSets();
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
  let selectedNode = null;
  sorted.forEach(s => {
    const tags = [...s.questions, ...s.peerRevision].filter(q => q.standard).length;
    const item = el(`
      <div class="std-item ${state.ui.currentSetId === s.id ? 'active' : ''} ${isDraft(s) ? 'is-draft' : ''}">
        <div class="std-item-top">
          <span class="std-code">${isDraft(s) ? '<span class="draft-tag">DRAFT</span> ' : ''}${esc(s.title || 'Untitled set')}</span>
          <button class="q-remove" data-del-set="${s.id}" title="Delete set">✕</button>
        </div>
        <div class="std-desc">${s.gaGrade ? `G${esc(s.gaGrade)} · ` : ''}${esc(s.passageId ? 'ID: ' + s.passageId : 'No passage ID')} · ${s.passages.length} passage${s.passages.length !== 1 ? 's' : ''} · ${tags} tagged</div>
        ${readinessChipHtml(s)}
        ${s.passages.some(p => p.title)
          ? `<div class="std-desc set-passage-titles">${s.passages.filter(p => p.title).map(p => esc(p.title)).join(' · ')}</div>`
          : ''}
      </div>`);
    item.addEventListener('click', e => {
      if (e.target.dataset.delSet) {
        if (confirm(`Delete "${s.title || 'Untitled set'}"? This cannot be undone.`)) {
          // Tombstone FIRST: without it the pre-save pull re-adds this set from the
          // server (server-only sets are carried along by design) and the delete undoes
          // itself on the next save.
          (state.setDeleted = state.setDeleted || {})[s.id] = Date.now();
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
    if (s.id === state.ui.currentSetId) selectedNode = item;
    box.appendChild(item);
  });
  // A freshly generated set IS selected, but selection is invisible when it sits 900
  // rows down an alphabetical list — bring it on screen.
  if (selectedNode) {
    requestAnimationFrame(() => {
      try { selectedNode.scrollIntoView({ block: 'nearest' }); } catch { /* older browsers */ }
    });
  }
}

function renderSetEditor() {
  const panel = document.getElementById('setEditor');
  const s = currentSet();
  if (state.ui.genOpen) {
    panel.innerHTML = generatorFormHtml();
    wireGeneratorForm(panel);
    return;
  }
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
  // tagStd() builds the real state:subject:code key. This used to look up
  // `state:code`, which never matches, so EVERY hierarchy change silently wiped the
  // primary standard — the "clicking a subtopic removes the standard" bug.
  const std = tagStd(s.standard);
  if (!std) return;                    // can't resolve it — leave the tag alone
  if (!scope(std)) s.standard = null;  // genuinely out of scope now
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
    .filter(h => h.std.state === st && gradeMatches(h.std.grade, grade) && withinGradeSpan(std, h.std, std.subject))
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
    flagged: '<span class="chip chip-warn">⚑ Flagged</span>',
  }[stage] || '<span class="chip">Aligned</span>';
  const k = inputKey(s.id, state.ui.inState, state.ui.inGrade);
  const stId = (state.setStateId || {})[k];
  const idPart = stId
    ? `${esc(state.ui.inState)} ID ${esc(stId)}`
    : (s.passageId ? 'ID ' + esc(s.passageId) : 'No ID');
  return `
    <div class="std-item ${selected ? 'active' : ''}" data-insel="${esc(s.id)}">
      <div class="std-item-top">
        <span class="std-code">${isDraft(s) ? '<span class="draft-tag">DRAFT</span> ' : ''}${esc(s.title || 'Untitled set')}</span>
      </div>
      <div class="std-desc">${s.gaGrade ? `G${esc(s.gaGrade)} · ` : ''}${idPart}</div>
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
      // The picker can pull ANY grade's standards — sets sometimes align across a
      // grade boundary, so the tagger must be able to reach the neighboring grade.
      const pg = String(state.ui.openPicker.grade || grade);
      inner = `<div class="review-pair q-pair">${nativeSide}</div>
        <div class="ps-hint" style="margin:2px 0 6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          Showing ${STATE_NAMES[st]} ELAR standards for
          <select data-qsgrade style="padding:4px 10px;border:1px solid var(--line,#ccd6df);border-radius:8px;font:inherit;font-weight:700">
            ${GRADES.map(g => `<option value="${g}" ${String(g) === pg ? 'selected' : ''}>Grade ${g}</option>`).join('')}
          </select>
          ${pg !== String(grade) ? `<span class="chip" style="background:#fdf1d2;color:#8a6400">⇄ cross-grade — this set is Grade ${grade}</span>` : ''}
        </div>
        ${pickerHtml('qstate', i, st, qstateScope(pg), '')}`;
    } else {
      // Recommend from the alignment work already done: the question's native standard's
      // approved alignments into this state at this grade. Accept in one click, or pick another.
      const recs = nstd
        ? alignedTo(nstd).filter(h => h.std.state === st && gradeMatches(h.std.grade, grade)).slice(0, 3)
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
    gradeMatches(std.grade, grade);
}

/* ---------- AI builder: whole passage set ----------
   Generate a complete, standard-anchored passage set (passage(s) + questions +
   writing prompt) from the Master Passage List. Same browser-direct Anthropic call
   and stored key as the peer-revision builder. Everything lands as a DRAFT for human
   review — nothing skips the normal approval path. */

// Backend rule: per-grade passage length. These are the p25–p75 bands measured from
// the 670 imported ECR sets (data/imported_sets.json), i.e. this library's own house
// norms rather than invented targets. Applied PER PASSAGE — the measurement was too.
const PASSAGE_WORDS = {
  // p25 / median / p75 of TOTAL words per set in the 670 imported sets, measured
  // SEPARATELY for single- and two-passage sets. Measuring them together (the first
  // cut of this table) averaged a ~260-word single G2 passage with the ~152-word halves
  // of a paired set and produced a band that made every single-passage set far too short.
  '2': { single: { min: 226, target: 260, max: 297 }, paired: { min: 276, target: 306, max: 337 } },
  '3': { single: { min: 298, target: 336, max: 365 }, paired: { min: 323, target: 355, max: 376 } },
  '4': { single: { min: 376, target: 411, max: 490 }, paired: { min: 360, target: 407, max: 447 } },
  '5': { single: { min: 378, target: 445, max: 514 }, paired: { min: 429, target: 470, max: 521 } },
  '6': { single: { min: 583, target: 642, max: 672 }, paired: { min: 652, target: 728, max: 778 } },
  '7': { single: { min: 534, target: 682, max: 746 }, paired: { min: 684, target: 822, max: 855 } },
  '8': { single: { min: 537, target: 656, max: 747 }, paired: { min: 689, target: 794, max: 869 } },
};
/* Assessment passages number their paragraphs so items can say "in paragraph 3". The
   imported decks do it (in two styles, "1." and "(1)"), so generated passages match the
   dominant one. Applied in code rather than trusted to the prompt: numbering must be
   exact and gap-free for a question that references a paragraph to be answerable. */
const PARA_MARKER = /^\s*(?:\(\d+\)|\d+[.)])\s+/;
function numberParagraphs(text) {
  const paras = String(text || '')
    .split(/\n\s*\n|\n/)                       // blank-line OR single-newline separated
    .map(p => p.replace(PARA_MARKER, '').trim())  // drop any numbering already present
    .filter(Boolean);
  return paras.map((p, i) => `${i + 1}. ${p}`).join('\n\n');
}
// Paragraph markers are formatting, not prose — they must not inflate the word budget.
function wordCount(t) {
  const body = String(t || '').split(/\n/).map(l => l.replace(PARA_MARKER, '')).join('\n');
  return (body.trim().match(/\S+/g) || []).length;
}
// The band is on the SET TOTAL, not per passage — a paired set must not be two
// full-length passages. Pass the passage count to get the right shape's band.
function wordBand(grade, passageCount) {
  const row = PASSAGE_WORDS[String(grade)];
  if (!row) return { min: 150, target: 250, max: 900 };
  return (+passageCount === 2) ? row.paired : row.single;
}
function totalWords(passages) { return (passages || []).reduce((a, p) => a + wordCount(p && p.text), 0); }

// The library never uses text_entry in the reading question set — match it.
const GEN_QTYPES = ['multiple_choice', 'cloze', 'multi_select'];

const SET_SYSTEM = `You write reading passage sets for state assessment practice (grades 2–8), in the style of released state test items.

You are given ONE anchor standard. The passage must be written so that the anchor standard can genuinely be assessed from it, and every question must be answerable from the passage alone.

Hard requirements:
- PASSAGE LENGTH IS A HARD RULE. Each passage must fall inside the word range you are given. Count words as whitespace-separated tokens. Being outside the range makes the set unusable.
- Write ORIGINAL content. Never reproduce or closely paraphrase an existing published text, and do not use real copyrighted characters or story text.
- Break each passage into clear, self-contained paragraphs — the app numbers them 1., 2., 3. so questions can reference a paragraph by number. Do not number them yourself.
- Content must be factually accurate (for informational/science/social-studies passages) and age-appropriate in topic and vocabulary for the target grade.
- Questions: write exactly the number requested. Use only these types: multiple_choice, cloze (inline drop-down written as [option1 / option2 / option3]), multi_select ("Select TWO…"). Never text_entry.
- Each question's full text must include its answer options, each on its own line, lettered a. b. c. d. for multiple_choice/multi_select, and end with a final line "Answer: …".
- Each question must be tagged to ONE standard code from the provided list, chosen because the question actually assesses it.
- The writing prompt is an extended-response prompt that responds to the passage(s) in the requested mode, phrased the way state prompts are ("Write a multi-paragraph response in which you…").
- When two passages are requested, they must be genuinely different texts on a related topic so students can compare them, each independently inside the word range.

Style: grade-appropriate sentence length and vocabulary; passages read like real published student-facing text with a natural title, not like a worksheet.`;

const SET_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Title of the passage SET' },
    passages: {
      type: 'array',   // NOTE: minItems/maxItems are rejected by the structured-output
      items: {         // API (HTTP 400) — passage count is enforced by tidyPassages().

        type: 'object',
        properties: {
          title: { type: 'string' },
          text: { type: 'string', description: 'The full passage text, inside the required word range' },
        },
        required: ['title', 'text'],
        additionalProperties: false,
      },
    },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Complete question: stem, lettered options on their own lines, final "Answer: ..." line' },
          type: { type: 'string', enum: GEN_QTYPES },
          code: { type: 'string', description: 'One standard code from the provided list, exactly as given' },
          rationale: { type: 'string', description: 'One sentence: why this question assesses that standard' },
        },
        required: ['text', 'type', 'code', 'rationale'],
        additionalProperties: false,
      },
    },
    writingPrompt: { type: 'string' },
  },
  required: ['title', 'passages', 'questions', 'writingPrompt'],
  additionalProperties: false,
};

async function callSetBuilder(userText) {
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
      system: SET_SYSTEM,
      output_config: { format: { type: 'json_schema', schema: SET_SCHEMA } },
      messages: [{ role: 'user', content: userText }],
    }),
  });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const e = await r.json(); msg += ' — ' + ((e.error || {}).message || '').slice(0, 140); } catch { /* bare status */ }
    throw new Error(msg);
  }
  const data = await r.json();
  if (data.stop_reason === 'refusal') throw new Error('the model declined this request');
  const txt = (data.content || []).find(b => b.type === 'text');
  if (!txt) throw new Error('no output returned');
  return JSON.parse(txt.text);
}

// Generate, then enforce the length rule: one corrective retry naming the actual counts
// before accepting. A set that is still out of band is kept but flagged, never discarded.
// The model sometimes pads the passages array with an empty object; an empty passage
// would fail the length rule and ship a blank editor block. Drop blanks and keep only
// as many as were asked for.
function tidyPassages(out, want) {
  const kept = (out.passages || []).filter(p => wordCount(p && p.text) > 0);
  out.passages = kept.slice(0, Math.max(1, want || 1));
}

async function generatePassageSet(cfg) {
  const band = wordBand(cfg.grade, cfg.passageCount);
  // The QUESTIONS are always reading-comprehension items, so they tag to this state's
  // ELA standards even when the passage anchors to a science/social-studies standard —
  // that is how every one of the 670 imported sets is built.
  const pool = state.standards
    .filter(x => (x.state === cfg.state || x.state === 'ALL') && x.subject === 'ela' && gradeMatches(x.grade, cfg.grade))
    .map(x => `${x.code} — ${x.description}`);
  const uni = isUniversalGenre(cfg.genre);
  const anchor = state.byKey.get(uni ? `ALL:ela:${cfg.code}` : `${cfg.state}:${cfg.subject}:${cfg.code}`);
  const base = `State: ${STATE_NAMES[cfg.state]} · Subject: ${SUBJECT_NAMES[cfg.subject]} · Grade: ${cfg.grade}

${uni ? `SUB-GENRE THE PASSAGE MUST BE WRITTEN IN:
${anchor.code} — ${anchor.description}
Write a passage that is unmistakably this sub-genre; its conventions ARE the requirement.`
      : `ANCHOR STANDARD (the passage must make this assessable):
${anchor.code} — ${anchor.description}${anchor.stem ? `\n(part of ${anchor.parent}: ${anchor.stem})` : ''}`}

Genre: ${cfg.genre} · Sub-domain: ${cfg.subtopic || '(none)'} · Item set type: ${cfg.itemSetType}
Passages to write: ${cfg.passageCount}
WORD BUDGET FOR THE WHOLE SET: ${band.min}–${band.max} words TOTAL (aim for about ${cfg.words}).${cfg.passageCount === 2 ? `
Because there are two passages, that budget is SHARED — each passage should be roughly ${Math.round(cfg.words / 2)} words so the pair together lands inside the total. Two full-length passages would be twice as much reading as this grade should get.` : ''}
Questions to write: ${cfg.questionCount}
Writing prompt mode: ${cfg.itemSetType === 'opinion' ? (String(cfg.grade) >= '6' ? 'argumentative' : 'opinion') : 'informational/explanatory'}
${cfg.topic ? `Topic the passage should cover: ${cfg.topic}` : 'Choose an appropriate topic yourself.'}
${(cfg.avoid && cfg.avoid.length) ? `
THESE SETS ALREADY EXIST FOR THIS SAME STANDARD — yours must be a genuinely DIFFERENT text, not a re-telling:
${cfg.avoid.map(t => `- ${t}`).join('\n')}
Pick a different angle, subject matter and set of details. A reader should not be able to mistake yours for any of the above.` : ''}

TAG EACH QUESTION with a ${STATE_NAMES[cfg.state]} ELA comprehension code from this list ONLY (the questions assess reading comprehension of the passage, not the anchor subject):
${pool.join('\n')}

Write the passage set now.`;
  let out = await callSetBuilder(base);
  tidyPassages(out, cfg.passageCount);
  const total = totalWords(out.passages);
  if (total < band.min || total > band.max) {
    const parts = (out.passages || []).map(p => wordCount(p.text));
    const detail = `the set totalled ${total} words (${parts.join(' + ')})`;
    out = await callSetBuilder(`${base}

YOUR PREVIOUS ATTEMPT BROKE THE LENGTH RULE: ${detail}, but the whole set must total between ${band.min} and ${band.max} words${cfg.passageCount === 2 ? ' ACROSS BOTH PASSAGES COMBINED' : ''}. Return exactly ${cfg.passageCount} passage(s) — no empty ones. Rewrite the set, keeping the same topic and question structure, so the combined total lands inside that range.`);
    tidyPassages(out, cfg.passageCount);
  }
  return out;
}

async function handleGenerateSet(cfg, opts) {
  if (!ensureAiKey()) return false;
  // Also steer away from sets already in the library for this same anchor standard.
  const existing = state.sets
    .filter(s => s.standard && s.standard.code === cfg.code && String(s.gaGrade) === String(cfg.grade))
    .concat([])
    .map(s => s.title).filter(Boolean);
  cfg = { ...cfg, avoid: [...new Set([...(cfg.avoid || []), ...existing])].slice(0, 8) };
  state.ui.genBusy = true;
  if (state.ui.genModal) renderGenModal(); else renderSetEditor();
  try {
    const out = await generatePassageSet(cfg);
    const band = wordBand(cfg.grade, cfg.passageCount);
    // Questions validate against ELA; the set-level anchor keeps cfg.subject.
    const validQ = new Map(state.standards
      .filter(x => (x.state === cfg.state || x.state === 'ALL') && x.subject === 'ela')
      .map(x => [x.code, x.state]));
    const s = {
      id: 'ps-gen-' + Date.now(),
      title: out.title || 'Untitled set',
      passageId: '',
      status: 'draft',
      itemSetType: cfg.itemSetType,
      genre: cfg.genre,
      gaGrade: String(cfg.grade),
      gaSubtopic: cfg.subtopic || null,
      primaryState: cfg.state,
      standard: anchorTag(cfg),
      passages: (out.passages || []).map(p => ({ title: p.title || '', text: numberParagraphs(p.text) })),
      questions: (out.questions || []).map(q => ({
        text: q.text || '',
        type: GEN_QTYPES.includes(q.type) ? q.type : null,
        standard: validQ.has(q.code) ? { state: validQ.get(q.code), subject: 'ela', code: q.code } : null,
      })),
      peerRevision: [{ text: '', standard: null, type: null }],
      writingPrompt: {
        type: cfg.itemSetType === 'opinion' ? (String(cfg.grade) >= '6' ? 'argumentative' : 'opinion') : 'informational',
        text: out.writingPrompt || '',
      },
    };
    if (!s.passages.length) s.passages = [{ title: '', text: '' }];
    if (!s.questions.length) s.questions = [{ text: '', standard: null, type: null }];
    state.sets.unshift(s);
    state.ui.currentSetId = s.id;
    if (!(opts && opts.keepModal) && !state.ui.genModal) state.ui.genOpen = false;
    saveSets();
    renderPassages();
    renderDash();   // the gap that launched this just got smaller
    // Report what the rules caught rather than hiding it — the reviewer decides.
    const counts = s.passages.map(p => wordCount(p.text));
    const total = counts.reduce((a, n) => a + n, 0);
    const untagged = s.questions.filter(q => !q.standard).length;
    const notes = [];
    if (total < band.min || total > band.max) {
      notes.push(`⚠ set totals ${total} words, outside ${band.min}–${band.max}${counts.length > 1 ? ` (${counts.join(' + ')})` : ''}`);
    }
    if (untagged) notes.push(`⚠ ${untagged} question(s) need a standard`);
    (state.ui.genResults = state.ui.genResults || []).push({
      ok: true, id: s.id, title: s.title,
      words: counts.length > 1 ? `${counts.join(' + ')} = ${total}` : String(total),
      questions: s.questions.length, notes,
    });
    state.ui.genOk = true;
  } catch (e) {
    state.ui.genOk = false;
    (state.ui.genResults = state.ui.genResults || []).push({
      ok: false, error: String(e.message).slice(0, 110),
    });
    if (String(e.message).includes('401')) {
      const why = aiKeyDiagnosis(aiKey);
      aiKey = '';
      localStorage.removeItem(LS_AI_KEY);
      toast(`⚠ API key rejected — ${why}. Click Generate to paste a new one.`);
      state.ui.genResults = state.ui.genResults || [];
      state.ui.genResults.push({ ok: false, error: `Anthropic rejected the key — ${why}` });
    } else {
      toast('⚠ Generation failed: ' + String(e.message).slice(0, 90));
    }
  }
  state.ui.genBusy = false;
  state.ui.genProgress = '';
  if (state.ui.genModal) renderGenModal(); else renderSetEditor();
  return state.ui.genOk;
}

// The generator form lives in the editor panel (no set selected), so it needs no modal.
function generatorFormHtml(opts) {
  const modal = !!(opts && opts.modal);
  const g = state.ui.gen;
  const band = wordBand(g.grade, g.passageCount);
  const stds = anchorPool(g);
  const uni = isUniversalGenre(g.genre);
  const subs = gaSubtopicsFor(String(g.grade), g.genre);
  const busy = state.ui.genBusy;
  return `
    <div class="ps-section">
      ${modal ? '' : `<div class="ps-section-title">⚡ Generate a passage set with AI
        <span class="ps-hint">the passage is written to make the chosen standard assessable</span></div>`}

      ${modal ? '' : `<div class="ps-field"><label>State</label>
        <select class="ps-input" data-gen="state">${stateOptionsHtml(false)}</select></div>`}

      ${modal ? `<div class="ps-hint" style="margin-bottom:10px">${uni
            ? `Literary sets anchor to a <b>sub-genre</b>, not a state standard (the same options apply in every state)`
            : `Anchor standard comes from <b>${esc(SUBJECT_NAMES[g.subject])}</b>`}; questions are tagged to ${esc(STATE_NAMES[g.state])} ELA comprehension standards.</div>`
        : `<div class="ps-field"><label>Subject</label>
        <select class="ps-input" data-gen="subject">
          ${Object.entries(SUBJECT_NAMES).map(([k, v]) =>
            `<option value="${k}" ${g.subject === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select></div>`}

      ${modal ? '' : `<div class="ps-field"><label>Grade</label>
        <select class="ps-input" data-gen="grade">
          ${GRADES.map(x => `<option value="${x}" ${String(g.grade) === x ? 'selected' : ''}>Grade ${x}</option>`).join('')}
        </select></div>`}

      <div class="ps-field"><label>${uni ? 'Sub-genre' : 'Anchor standard'}
          <span class="ps-hint">${uni ? `${stds.length} ${esc(g.subtopic)} options — the same in every state`
                                     : `${stds.length} in ${STATE_NAMES[g.state]} ${SUBJECT_NAMES[g.subject]} G${g.grade}`}</span></label>
        <select class="ps-input" data-gen="code">
          <option value="">${uni ? 'Choose the sub-genre this passage must be…' : 'Choose the standard this passage must assess…'}</option>
          ${stds.map(x => `<option value="${esc(x.code)}" ${g.code === x.code ? 'selected' : ''}>${esc(x.code)} — ${esc(x.description.slice(0, 110))}${x.description.length > 110 ? '…' : ''}</option>`).join('')}
        </select></div>

      ${modal ? '' : `<div class="ps-field"><label>Genre</label>
        <select class="ps-input" data-gen="genre">
          ${GENRES.map(x => `<option value="${x.key}" ${g.genre === x.key ? 'selected' : ''}>${x.label}</option>`).join('')}
        </select></div>

      <div class="ps-field"><label>Sub-domain (hierarchy)</label>
        <select class="ps-input" data-gen="subtopic">
          <option value="">—</option>
          ${subs.map(x => `<option value="${esc(x)}" ${g.subtopic === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}
        </select></div>

      <div class="ps-field"><label>Item set type</label>
        <select class="ps-input" data-gen="itemSetType">
          ${ITEM_SET_TYPES.map(x => `<option value="${x.key}" ${g.itemSetType === x.key ? 'selected' : ''}>${x.label}</option>`).join('')}
        </select></div>`}

      <div class="ps-field"><label>Passages per set</label>
        <select class="ps-input" data-gen="passageCount">
          <option value="1" ${+g.passageCount === 1 ? 'selected' : ''}>Single passage</option>
          <option value="2" ${+g.passageCount === 2 ? 'selected' : ''}>Multiple (paired texts)</option>
        </select></div>

      ${modal ? `<div class="ps-field"><label>How many sets to build
          <span class="ps-hint">goal is ${DASH_GOAL} per type</span></label>
        <select class="ps-input" data-gen="setCount">
          ${[1, 2, 3, 4].map(n => `<option value="${n}" ${+g.setCount === n ? 'selected' : ''}>${n} set${n > 1 ? 's' : ''}</option>`).join('')}
        </select></div>` : ''}

      <div class="ps-field"><label>Questions</label>
        <select class="ps-input" data-gen="questionCount">
          ${[3, 4].map(n => `<option value="${n}" ${+g.questionCount === n ? 'selected' : ''}>${n} questions</option>`).join('')}
        </select></div>

      <div class="ps-field"><label>Total words for the set
          <span class="ps-hint">grade ${g.grade} ${+g.passageCount === 2 ? 'paired' : 'single'} range ${band.min}–${band.max}${+g.passageCount === 2 ? ` · about ${Math.round(g.words / 2)} each` : ''}</span></label>
        <input class="ps-input" type="number" data-gen="words" value="${g.words}" min="${band.min}" max="${band.max}"></div>

      <div class="ps-field"><label>Topic <span class="ps-hint">optional — leave blank to let the model choose</span></label>
        <input class="ps-input" data-gen="topic" value="${esc(g.topic || '')}" placeholder="e.g. how bees pollinate crops"></div>

      <div class="detail-actions" style="margin-top:12px">
        <button class="act-btn approve" id="genRun" ${busy || !g.code ? 'disabled' : ''}>
          ${busy ? (state.ui.genProgress || '⏳ Generating…') : `⚡ Generate ${modal && +g.setCount > 1 ? g.setCount + ' draft sets' : 'draft set'}`}</button>
        <button class="act-btn reset" id="genCancel" ${busy ? 'disabled' : ''}>${modal ? 'Close' : 'Cancel'}</button>
      </div>
      ${!g.code ? '<div class="ps-hint" style="margin-top:6px">Choose an anchor standard to enable generation.</div>' : ''}
      ${genStatusHtml()}
    </div>`;
}

/* The build takes about a minute per set, so "did it finish?" has to be answerable at a
   glance long after a toast would have slid away. This panel stays put: a loud in-progress
   banner while running, and a persistent green (or red) summary of exactly what was built. */
function genStatusHtml() {
  const res = state.ui.genResults || [];
  const busy = state.ui.genBusy;
  const target = state.ui.genTarget || 1;
  if (!busy && !res.length) return '';
  const done = res.filter(r => r.ok).length;
  const rows = res.map((r, i) => r.ok
    ? `<div class="gen-row">
         <span class="gen-row-n">${i + 1}</span>
         <span class="gen-row-title">${esc(r.title)}</span>
         <span class="gen-row-meta">${esc(r.words)} words · ${r.questions} questions</span>
         ${r.notes && r.notes.length ? `<div class="gen-row-warn">${r.notes.map(esc).join(' · ')}</div>` : ''}
       </div>`
    : `<div class="gen-row gen-row-bad">
         <span class="gen-row-n">${i + 1}</span>
         <span class="gen-row-title">Failed</span>
         <span class="gen-row-meta">${esc(r.error || '')}</span>
       </div>`).join('');
  if (busy) {
    return `<div class="gen-status gen-status-busy">
        <div class="gen-status-head">⏳ Building set ${done + 1} of ${target}…</div>
        <div class="ps-hint">About a minute each. Leave this open — the list below fills in as each one lands.</div>
        ${rows}
      </div>`;
  }
  const allOk = res.every(r => r.ok);
  return `<div class="gen-status ${allOk ? 'gen-status-done' : 'gen-status-warn'}">
      <div class="gen-status-head">${allOk ? '✓' : '⚠'} Done — ${done} of ${target} set${target > 1 ? 's' : ''} built${allOk ? '' : ' (see below)'}</div>
      <div class="ps-hint">Saved as drafts in the Master Passage List${state.ui.genModal ? ', and this Dashboard cell is updated' : ''}.</div>
      ${rows}
      <div class="detail-actions" style="margin-top:10px">
        <button class="act-btn" id="genOpenList">Open in Master Passage List</button>
      </div>
    </div>`;
}

function wireGeneratorForm(panel) {
  // stateOptionsHtml() emits no selected attribute — set the value directly.
  const stSel = panel.querySelector('[data-gen="state"]');
  if (stSel) stSel.value = state.ui.gen.state;
  panel.querySelectorAll('[data-gen]').forEach(el => {
    const key = el.dataset.gen;
    const ev = (el.tagName === 'INPUT' && el.type !== 'number') ? 'change' : 'change';
    el.addEventListener(ev, e => {
      state.ui.gen[key] = e.target.value;
      // Changing what the standard list depends on invalidates the chosen standard.
      if (key === 'state' || key === 'subject' || key === 'grade') state.ui.gen.code = '';
      // grade OR passage count changes which band applies — re-target the budget.
      if (key === 'grade' || key === 'passageCount') {
        state.ui.gen.words = wordBand(state.ui.gen.grade, state.ui.gen.passageCount).target;
      }
      if (key === 'genre' || key === 'grade') {
        const subs = gaSubtopicsFor(String(state.ui.gen.grade), state.ui.gen.genre);
        if (!subs.includes(state.ui.gen.subtopic)) state.ui.gen.subtopic = subs[0] || '';
      }
      if (state.ui.genModal) renderGenModal(); else renderSetEditor();
    });
  });
  const run = panel.querySelector('#genRun');
  if (run) run.addEventListener('click', async () => {
    const g = state.ui.gen;
    const cfg = { ...g, grade: String(g.grade), words: +g.words || wordBand(g.grade, g.passageCount).target,
                  passageCount: +g.passageCount, questionCount: +g.questionCount };
    // A dashboard gap usually needs several sets; build them one at a time so a failure
    // costs one set, not the batch, and so each is saved as soon as it lands.
    const n = state.ui.genModal ? Math.max(1, +g.setCount || 1) : 1;
    state.ui.genResults = [];
    state.ui.genTarget = n;
    for (let i = 0; i < n; i++) {
      state.ui.genProgress = n > 1 ? `⏳ Generating ${i + 1} of ${n}…` : '⏳ Generating…';
      // Same anchor + same prompt twice running produced two near-identical passages,
      // so each build is told what the batch has already written.
      const avoid = (state.ui.genResults || []).filter(r => r.ok).map(r => r.title);
      const ok = await handleGenerateSet({ ...cfg, avoid }, { keepModal: n > 1 && i < n - 1 });
      if (!ok) break;   // stop the batch on a failure rather than burning more calls
    }
  });
  const open = panel.querySelector('#genOpenList');
  if (open) open.addEventListener('click', () => {
    const first = (state.ui.genResults || []).find(r => r.ok);
    if (first) state.ui.currentSetId = first.id;
    closeGenModal();
    state.ui.genOpen = false;
    document.querySelector('#navTabs .tab[data-view="passages"]').click();
    renderPassages();
  });
  const cancel = panel.querySelector('#genCancel');
  if (cancel) cancel.addEventListener('click', () => {
    if (state.ui.genModal) { closeGenModal(); return; }
    state.ui.genOpen = false; renderSetEditor();
  });
}

/* ---------- Dashboard → generator popup ----------
   A gap on the Dashboard IS the work order: click the count and the builder opens
   already knowing the state, grade, sub-domain and item-set type that cell stands for.
   Same generator, same rules — only the launch point differs. */

// The sub-domain a Dashboard row represents tells us which subject the ANCHOR standard
// comes from. Questions are always ELA (see generatePassageSet).
const SUBDOMAIN_SUBJECT = {
  'Science': 'science', 'Earth Science': 'science', 'Life Science': 'science',
  'Physical Science': 'science',
  'Social Studies': 'social_studies', 'History': 'social_studies',
  'Geography': 'social_studies', 'Government': 'social_studies',
  'Economics': 'social_studies',
  // Texas's own subtopic names, so a click on a Texas cell scopes correctly
  'Matter': 'science', 'Force, Motion, and Energy': 'science',
  'Earth and Space': 'science', 'Organisms and Environment': 'science',
  'Citizenship': 'social_studies', 'Culture': 'social_studies',
  'Science Technology and Society': 'social_studies',
};
function subdomainSubject(sub) { return SUBDOMAIN_SUBJECT[sub] || 'ela'; }
// Literary and Literary Non-Fiction do not anchor to a state standard — the SUB-GENRE
// is the anchor, and those live in data/universal_ela.json as state:"ALL" with
// strand === the sub-domain. Same options in every state, by design.
function isUniversalGenre(genre) { return genre === 'literary' || genre === 'literary_nonfiction'; }
function anchorPool(g) {
  if (isUniversalGenre(g.genre)) {
    return state.standards
      .filter(x => x.state === 'ALL' && x.subject === 'ela' && x.strand === g.subtopic)
      .sort((a, b) => a.code.localeCompare(b.code));
  }
  return state.standards
    .filter(x => x.state === g.state && x.subject === g.subject && gradeMatches(x.grade, g.grade))
    .sort((a, b) => a.code.localeCompare(b.code));
}
function anchorTag(g) {
  return isUniversalGenre(g.genre)
    ? { state: 'ALL', subject: 'ela', code: g.code }
    : { state: g.state, subject: g.subject, code: g.code };
}
// The Dashboard splits science into Earth/Life/Physical (it derives those from the
// tagged standard's strand), but the Classification hierarchy only has "Science".
// Store the hierarchy value on the set; the Dashboard still files it under the finer
// row because setSubdomain() re-derives that from the standard.
function hierarchySubtopic(sub, grade) {
  // Texas rows are its own; the SET still stores a value the Classification UI offers.
  const TX_TO_HIERARCHY = {
    'Matter': 'Science', 'Force, Motion, and Energy': 'Science',
    'Earth and Space': 'Science', 'Organisms and Environment': 'Science',
    'Citizenship': 'Government', 'Culture': 'History',
    'Science Technology and Society': 'Science',
  };
  if (TX_TO_HIERARCHY[sub]) sub = TX_TO_HIERARCHY[sub];
  if (/(Earth|Life|Physical) Science/.test(sub)) return 'Science';
  if (String(grade) === '2' && ['History', 'Geography', 'Government', 'Economics'].includes(sub)) {
    return 'Social Studies';           // grade 2's hierarchy is the coarse pair
  }
  return sub;
}
function subdomainGenre(sub) {
  if (SUBDOMAIN_SUBJECT[sub]) return 'informational';
  return ['Biographies', 'True Narratives'].includes(sub) ? 'literary_nonfiction' : 'literary';
}

function openGenModal(cfg) {
  const grade = String(cfg.grade);
  Object.assign(state.ui.gen, {
    state: cfg.state,
    subject: subdomainSubject(cfg.subtopic),
    grade,
    code: '',
    genre: subdomainGenre(cfg.subtopic),
    subtopic: hierarchySubtopic(cfg.subtopic, grade),
    itemSetType: cfg.itemSetType,
    words: wordBand(grade, state.ui.gen.passageCount).target,
    setCount: Math.max(1, Math.min(DASH_GOAL - (cfg.have || 0), DASH_GOAL)),
  });
  state.ui.genResults = [];
  state.ui.genModal = { have: cfg.have || 0 };
  renderGenModal();
}
function closeGenModal() {
  state.ui.genModal = null;
  const n = document.getElementById('genModal');
  if (n) n.remove();
}
function renderGenModal() {
  const m = state.ui.genModal;
  document.getElementById('genModal')?.remove();
  if (!m) return;
  const g = state.ui.gen;
  const node = el(`
    <div class="modal-backdrop" id="genModal">
      <div class="modal-card">
        <div class="modal-head">
          <div>
            <div class="modal-title">Build for ${esc(STATE_NAMES[g.state])} · Grade ${esc(g.grade)}</div>
            <div class="ps-hint">${esc(g.subtopic)} · ${esc((ITEM_SET_TYPES.find(t => t.key === g.itemSetType) || {}).label || '')}
              — ${m.have} of ${DASH_GOAL} built</div>
          </div>
          <button class="q-remove" id="genModalX" title="Close">✕</button>
        </div>
        <div id="genModalBody"></div>
      </div>
    </div>`);
  document.body.appendChild(node);
  const body = node.querySelector('#genModalBody');
  body.innerHTML = generatorFormHtml({ modal: true });
  wireGeneratorForm(body);
  node.querySelector('#genModalX').addEventListener('click', closeGenModal);
  node.addEventListener('click', e => { if (e.target === node && !state.ui.genBusy) closeGenModal(); });
}

/* ---------- AI builder: Georgia Peer Revision Task ----------
   Calls the Anthropic API directly from the browser (same pattern as cloud saving:
   the user pastes their API key once; it lives only in this browser's localStorage).
   Claude drafts a flawed student response + 4-5 revision questions, each tagged to a
   Georgia standard — everything lands in the editor as a draft for human review. */
const LS_AI_KEY = 'sa_anthropic_key';
let aiKey = localStorage.getItem(LS_AI_KEY) || '';

/* A 401 from Anthropic is nearly always one of three things, and the key's own prefix
   says which — pasting a key from a different provider looks identical to an expired one
   unless we check. */
function aiKeyDiagnosis(k) {
  const key = (k || '').trim();
  if (!key) return 'no key is stored in this browser';
  if (key.startsWith('xai-'))        return 'that is an xAI / Grok key. This builder calls Anthropic, so it needs a key beginning sk-ant-';
  if (key.startsWith('gsk_'))        return 'that is a Groq key. This builder calls Anthropic, so it needs a key beginning sk-ant-';
  if (key.startsWith('sk-proj-'))    return 'that is an OpenAI key. This builder calls Anthropic, so it needs a key beginning sk-ant-';
  if (!key.startsWith('sk-ant-'))    return `that key starts "${key.slice(0, 7)}…". This builder calls Anthropic, so it needs a key beginning sk-ant-`;
  return 'the key is the right type but Anthropic refused it — it may have been revoked, or copied incompletely';
}

function ensureAiKey() {
  if (aiKey) return true;
  const t = prompt('Paste your ANTHROPIC API key to enable the AI builder.\n\n'
    + 'It starts with "sk-ant-" and comes from console.anthropic.com → API Keys. '
    + 'Keys from other providers (xAI/Grok, OpenAI, Groq) will not work here.\n\n'
    + 'It is stored only in this browser.', '');
  if (t === null) return false;
  aiKey = t.trim();
  if (aiKey) localStorage.setItem(LS_AI_KEY, aiKey);
  return !!aiKey;
}

// Generation instructions tuned to the user's model examples ("4th Grade Georgia.pptx",
// 2026-07-20): Georgia CMS Peer Revision Tasks for GRADES 2-5. Each task is
// SELF-CONTAINED (scenario + embedded draft excerpt + question), not one big flawed essay.
const PEER_SYSTEM = `You write Peer Revision Tasks for Georgia ELA (grades 2–8), matching the state's CMS item style exactly.

A Peer Revision Task is a SELF-CONTAINED item built around a short draft excerpt (one paragraph, an opinion statement, or a concluding paragraph) from an imagined GROUP DRAFT that students wrote in response to the writing prompt provided below. Each task presents that excerpt and asks the student to help revise it.

Every task's text must contain, in this order:
1. A second-person collaborative scenario (1–2 sentences). Use frames like:
   - "While revising a paragraph of your group's draft [research/opinion] text, you notice that …"
   - "Your group wants to … Which … should be added to the draft to BEST …?"
   - "You are revising the concluding paragraph of your group's draft text. Read the draft of the concluding paragraph."
   - "Read the opinion statement from your group's draft text. Your group has asked you to help find evidence to support this opinion."
2. The draft excerpt on its own lines (when the task needs one), written like real grade-level student writing.
3. The question/instruction, with emphasis capitalized exactly like the examples: "the TWO sentences that BEST connect the ideas".
4. The response options, each on its own line lettered a. b. c. d. (or drop-down menus written inline as [option1 / option2 / option3]), and finally the correct answer on its own line: "Answer: …".

Task archetypes — vary them across the set:
A. ADD SENTENCES (multi_select): a draft paragraph with blank lines; "move the TWO sentences that BEST … onto the blank lines"; then a "Sentence Options" list of 4–5 sentences (2 correct, the rest plausible but off-purpose).
B. ADD A DESCRIPTION (multiple_choice): "Which description should be added to the draft to BEST build on the idea that …?" — options a/b/c are full short paragraphs.
C. DROP-DOWN CONVENTIONS (cloze): "Complete each drop-down menu by choosing the correct [conjunction / linking word / verb form]." Write the draft sentences with each menu inline as [option1 / option2 / option3].
D. EVIDENCE FROM SOURCES (multi_select): "Which TWO paragraphs from Source #N contain evidence that should be added to the draft to BEST support the opinion?" — options like "paragraph 2" … "paragraph 8". Source #N means this set's passage(s); the paragraph numbers you key as correct must actually contain that evidence.
E. STRENGTHEN THE CONCLUSION (multiple_choice): show the draft concluding paragraph, then "Which sentence should be added to the end of the paragraph to make the conclusion stronger?" with sentence options a–d.
F. GRAMMAR TARGET (cloze): "Complete the sentence by choosing the [collective noun] in the first drop-down menu and the [abstract noun] in the second drop-down menu." on a single topic-related sentence.

Requirements:
- Produce 4–5 tasks. Vary the archetypes and item types (multiple_choice, multi_select, cloze — do NOT use text_entry).
- Every draft excerpt is about THIS set's topic, reads like grade-level student writing responding to the writing prompt, and never contradicts the actual passages. Where sources are cited, be consistent with the passages provided.
- Each task assesses exactly ONE of the provided Georgia standards — prefer Texts Constructing (C) elements for revision tasks and Language standards for conventions/grammar tasks.
- Grade-appropriate vocabulary and sentence length throughout. Scale rigor to the grade:
  grades 2–3 use short sentences and everyday words; grades 4–5 moderate complexity;
  grades 6–8 use longer, multi-sentence draft excerpts, more sophisticated vocabulary and
  transitions, and revision targets middle-schoolers actually face (varied sentence
  structure, precise word choice, integrating evidence smoothly, active/passive voice).
  The draft excerpts must read like authentic writing FROM A STUDENT AT THAT GRADE —
  an 8th grader's draft is competent but improvable, not babyish.`;

const PEER_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The complete self-contained task: scenario, draft excerpt, question, options, and final "Answer: ..." line' },
          type: { type: 'string', enum: ['multiple_choice', 'cloze', 'multi_select', 'text_entry'] },
          gaCode: { type: 'string', description: 'The single Georgia standard code this question assesses, exactly as given in the list' },
          rationale: { type: 'string', description: 'One sentence: why this question fits that standard' },
        },
        required: ['text', 'type', 'gaCode', 'rationale'],
        additionalProperties: false,
      },
    },
  },
  required: ['questions'],
  additionalProperties: false,
};

async function buildPeerTask(s, grade) {
  const pool = state.standards
    .filter(x => x.state === 'GA' && x.subject === 'ela' && gradeMatches(x.grade, grade))
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
    s.peerRevision = (out.questions || []).map(q => ({
      text: q.text || '',
      type: QUESTION_TYPES.some(t => t.key === q.type) ? q.type : null,
      standard: valid.has(q.gaCode) ? { state: 'GA', subject: 'ela', code: q.gaCode } : null,
    }));
    if (!s.peerRevision.length) s.peerRevision = [{ text: '', standard: null, type: null }];
    saveSets();
    // Building the task graduates the set out of the Needs Peer Task stage, which
    // would filter it (and the fresh questions) straight off the screen. Follow it:
    // keep it selected and move the stage filter with it.
    state.ui.inSelected = s.id;
    if (state.ui.inStage === 'peer') state.ui.inStage = 'enter';
    toast(`✓ Built ${s.peerRevision.length} peer revision tasks — set moved to To Be Entered, questions below`);
  } catch (e) {
    if (String(e.message).includes('401')) {
      const why = aiKeyDiagnosis(aiKey);
      aiKey = '';
      localStorage.removeItem(LS_AI_KEY);
      toast(`⚠ API key rejected — ${why}. Click Build to paste a new one.`);
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
      .filter(x => x.state === st && x.subject === assigned.subject && gradeMatches(x.grade, grade))
      .sort((a, b) => a.code.localeCompare(b.code));
    actions = `<select class="ps-input" data-override="${esc(k)}" style="max-width:100%">
        <option value="">Choose the ${STATE_NAMES[st]} Grade ${grade} standard…</option>
        ${opts.map(x => `<option value="${esc(x.code)}" ${assigned.code === x.code ? 'selected' : ''}>${esc(x.code)} — ${esc(x.description.slice(0, 180))}${x.description.length > 180 ? '…' : ''}</option>`).join('')}
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
    const cmsId = (state.setStateId || {})[k] || s.passageId;   // a state-specific ID satisfies the gate
    const cmsPart = stage === 'standards'
      ? `<span class="cms-chip disabled">Not in CMS — tag the ${STATE_NAMES[st]} standards below first</span>`
      : stage === 'peer'
        ? `<span class="cms-chip disabled">Not in CMS — create the peer revision task below</span>`
        : cmsId
          ? `<button class="act-btn approve" data-iact="cms|${esc(k)}">✓ Entered in CMS</button>`
          : `<span class="cms-chip disabled" title="Add a passage ID on the Master Passage List, or a ${STATE_NAMES[st]} ID here">Not in CMS — needs a passage ID</span>`;
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

  // Review flag + per-state ID (cross-grade pushes get their own CMS ID in each state).
  const flagNote = (state.setFlag || {})[k];
  const isFlagged = flagNote !== undefined;
  const stId = (state.setStateId || {})[k];
  const flagBtn = isFlagged
    ? `<button class="act-btn reject" data-iact="unflag|${esc(k)}">⚑ Resolve flag</button>`
    : `<button class="act-btn" data-iact="flag|${esc(k)}" title="Pull this set out of the queue for review">⚑ Flag for review</button>`;
  const stIdBtn = `<button class="act-btn" data-iact="stateid|${esc(k)}" title="ID used when this set enters the ${STATE_NAMES[st]} CMS at this grade (cross-grade pushes get their own ID)">${stId ? `✎ ${st} ID` : `＋ ${st} ID`}</button>`;
  const flagBanner = isFlagged
    ? `<div class="align-mini" style="border-left-color:var(--red, #c0392b); margin:10px 0 0">
         <div class="align-mini-title">⚑ Flagged for review</div>
         <div style="font-size:13px">${flagNote ? esc(flagNote) : 'No note left — ask whoever flagged it.'}</div>
       </div>`
    : '';

  box.innerHTML = `
    <div class="detail-head ${category === 'cms' ? 'decided-approved' : ''}">
      <div class="concept-title" style="font-size:18px">${isDraft(s) ? '<span class="draft-tag">DRAFT</span> ' : ''}${esc(s.title || 'Untitled set')}</div>
      <div class="concept-meta" style="margin-top:6px">
        ${s.passageId ? `<span class="chip">ID ${esc(s.passageId)}</span>` : '<span class="chip chip-warn">No passage ID</span>'}
        ${stId ? `<span class="chip chip-concept">${esc(st)} ID ${esc(stId)}</span>` : ''}
        ${s.gaGrade ? `<span class="chip">Grade ${esc(s.gaGrade)}</span>` : ''}
        ${istLabel ? `<span class="chip">${esc(istLabel)}</span>` : ''}
        ${genreLabel ? `<span class="chip">${esc(genreLabel)}</span>` : ''}
        ${s.gaSubtopic ? `<span class="chip">${esc(s.gaSubtopic)}</span>` : ''}
      </div>
      <div style="margin-top:10px">${stdLine}</div>
      ${flagBanner}
      <div class="detail-actions">${actions}
        ${stIdBtn}
        ${flagBtn}
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

  // AI builder: generate the Georgia peer revision task (draft + questions) for review.
  const buildBtn = box.querySelector('[data-buildpeer]');
  if (buildBtn) buildBtn.addEventListener('click', () => {
    const hasContent = s.peerRevision.some(t => (t.text || '').trim());
    if (hasContent && !confirm('Rebuild will replace the current peer revision tasks (and student draft). Continue?')) return;
    handleBuildPeer(s, grade);
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
  // grade selector inside the open picker — re-scope the list to any grade
  const qg = box.querySelector('[data-qsgrade]');
  if (qg) qg.addEventListener('change', e => {
    state.ui.openPicker.grade = e.target.value;
    renderInput();
    const inp = document.querySelector('#inputDetail .tag-picker[data-picker^="qstate:"] .picker-search');
    if (inp) inp.focus();
  });
  const qp = box.querySelector('.tag-picker[data-picker^="qstate:"]');
  if (qp) {
    const iStr = qp.dataset.picker.split(':')[1];
    const results = qp.querySelector('.picker-results');
    const pickGrade = () => String((state.ui.openPicker && state.ui.openPicker.grade) || grade);
    qp.querySelector('.picker-search').addEventListener('input', e => {
      results.innerHTML = pickerResultsHtml(e.target.value, st, qstateScope(pickGrade()));
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
  on('[data-peerdraft]', 'input', e => { s.peerDraft = e.target.value; saveSets(); });
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
    stSel.innerHTML = stateOptionsHtml(false);
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
     1. Needs Approval        — confirm the set really aligns into this state
     2. Needs Standards       — tag each question with this state's standard
     2b. Needs Peer Task      — Georgia only: author the peer revision task
     3. To Be Entered         — tag the ECR set in CMS
     4. Entered in CMS        — done; leaves the working queue, lives under its own filter. */
function inputStages(st) {
  const stages = [
    { key: 'approval', label: 'Needs Approval', short: 'need approval', hint: 'confirm the alignment' },
    { key: 'standards', label: 'Needs Standards', short: 'need standards', hint: `tag each question's standard` },
  ];
  if (st === 'GA') stages.push({ key: 'peer', label: 'Needs Peer Task', short: 'need peer task', hint: 'create the peer revision task' });
  stages.push(
    { key: 'enter', label: 'To Be Entered', short: 'to be entered', hint: 'tag the ECR set in CMS' },
    { key: 'entered', label: 'Entered in CMS', short: 'entered', hint: 'done' },
    { key: 'flagged', label: '⚑ Flagged', short: 'flagged', hint: 'pulled out of the queue for review' });
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
  // A raised flag beats every other stage — the set leaves its queue until resolved.
  if ((state.setFlag || {})[inputKey(s.id, st, grade)] !== undefined) return 'flagged';
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
  if (act === 'flag') {
    const note = prompt('Flag this set for review.\nWhat looks wrong? (optional note)', '');
    if (note === null) return;
    setFlagValue(key, note.trim());
    pushState(); renderInput(); toast('⚑ Flagged — moved to the Flagged list');
    return;
  }
  if (act === 'unflag') {
    setFlagValue(key, undefined);
    pushState(); renderInput(); toast('Flag resolved — back in its queue');
    return;
  }
  if (act === 'stateid') {
    const cur = (state.setStateId || {})[key] || '';
    const v = prompt(`${STATE_NAMES[stt]} passage ID for Grade ${grd} (leave blank to remove):`, cur);
    if (v === null) return;
    state.setStateId = state.setStateId || {};
    if (v.trim()) state.setStateId[key] = v.trim(); else delete state.setStateId[key];
    pushState(); renderInput(); toast(v.trim() ? `${STATE_NAMES[stt]} ID saved` : `${STATE_NAMES[stt]} ID removed`);
    return;
  }
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
/* Every state names its strands differently — Ohio says "History" and "Government",
   Florida "American History" and "Civics and Government", Georgia "Historical
   Understandings", Texas "Citizenship", South Carolina uses era and continent names.
   The Dashboard rows are Ohio's vocabulary, so a strand has to be normalised before it
   can be filed, or the set lands in a row that is never rendered and the count silently
   never moves. */
function canonSubdomain(strand, subject, st, gradeHint) {
  const s = (strand || '').toLowerCase().trim();
  if (!s) return null;
  // A state with its own published taxonomy wins — its strand names ARE its subtopics.
  // Both the row list AND the target wording vary by grade, so the caller's grade
  // decides which map applies.
  const own = stateSubdomains(st, gradeHint);
  if (own && Object.prototype.hasOwnProperty.call(own.strandMap, s)) return own.strandMap[s];
  if (subject === 'science') {
    if (/earth|space|universe/.test(s)) return 'Earth Science';
    if (/life|organism|molecul|ecosystem|hered|evolution|biolog/.test(s)) return 'Life Science';
    if (/physical|matter|energy|motion|force|wave/.test(s)) return 'Physical Science';
    return null;                       // practice/inquiry strands have no content row
  }
  if (subject === 'social_studies') {
    if (/econom|financial literacy/.test(s)) return 'Economics';
    if (/civic|government|citizenship/.test(s)) return 'Government';
    // whole-strand continent names (SC's regional geography) — anchored so that
    // "African American History" is NOT read as "Africa".
    if (/^(africa|asia|europe|north america|south america|australia[\w, ]*)$/.test(s)) return 'Geography';
    if (/geograph|map skills|environment and people/.test(s)) return 'Geography';
    if (/histor|coloniz|revolution|nation|civiliz|holocaust|communism|expansion|rebuilding|settlement|crossroad|progress|global|atlantic|migration|modern america|social changes|compromis|world leader|divided|interdepend/.test(s)) return 'History';
    return null;
  }
  return null;
}

// The two COARSE hierarchy tags. Everything else is already a Dashboard row.
const COARSE_SUBTOPICS = ['Science', 'Social Studies'];

function setSubdomain(s, st) {
  if (s.genre === 'literary' || s.genre === 'literary_nonfiction') return s.gaSubtopic || 'Untagged';
  const sub = s.gaSubtopic;
  // Under a state with its own taxonomy, only ITS row names count as already-filed.
  const own = stateSubdomains(st, s.gaGrade);
  if (own && sub && !own.informational.includes(sub)) {
    const std0 = tagStd(s.standard);
    const mapped = canonSubdomain(std0 && std0.strand, std0 && std0.subject, st, s.gaGrade);
    if (mapped) return mapped;
  }
  /* The reviewer's own classification WINS. Deriving the row from the anchor standard's
     strand was overriding it, and South Carolina makes that plainly wrong: its grade-4
     strands are era names ("Colonization", "A New Nation"), so a set deliberately built
     as Economics filed itself under History and the Economics cell never moved. It cut
     both ways — an SC grade-3 set tagged History filed under Economics because its
     strand reads "Culture and Economy".

     Strand derivation exists for one job only: splitting the coarse "Science" tag into
     Earth/Life/Physical, which the hierarchy itself cannot express. */
  if (sub && !COARSE_SUBTOPICS.includes(sub)) return sub;
  const std = tagStd(s.standard);
  return canonSubdomain(std && std.strand, std && std.subject, st, s.gaGrade) || sub || 'Untagged';
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

/* Not every state teaches all three sciences every year — Georgia's middle school runs
   one discipline per grade (6 Earth, 7 Life, 8 Physical), so showing empty Life and
   Physical rows there reads as a coverage gap when it is simply not part of that grade.
   Rows are therefore derived from the state's own standards.

   Science only, deliberately: discipline names are unambiguous in every state's science
   file, whereas South Carolina's social studies strands are era and continent names
   ("Colonization", "Africa") that hide the economics and civics genuinely taught inside
   them — absence there cannot be proven from a strand name, so those rows always stay. */
const DASH_SCIENCE_ROWS = ['Earth Science', 'Life Science', 'Physical Science'];

/* Texas names its own topics and subtopics in the CMS, and they are not the generic
   ones — its TEKS strands ARE the subtopic list. Mirroring them means the Texas board
   reads the same as the screen someone will be filling in.

   Only Science and Social Studies appear here. The CMS also lists Health, Personal
   Financial Literacy, Physical Education and Technology Applications for Texas, but no
   standards for those subjects are loaded, so those rows could only ever show zero —
   the same phantom-gap problem as Georgia's middle-school science. They are left out
   until their standards exist. */
const STATE_SUBDOMAINS = {
  TX: {
    /* PER GRADE, because the CMS publishes Topics/Subtopics per grade and the wording
       genuinely shifts between them — grade 2 says "Matter" and "Organisms and
       Environment", grade 3 says "Matter and Energy" and "Organisms and Environments",
       and grade 3 punctuates "Science, Technology, and Society" where grade 2 does not.
       These strings are copied from the CMS verbatim so the export can use them as-is.
       A grade with no entry here keeps the generic rows rather than inheriting a guess.

       Health, Personal Financial Literacy, Physical Education, Fine Arts and Technology
       Applications appear in the CMS for both grades but have no standards loaded, so
       their rows would read zero forever; they are left out until those standards exist. */
    byGrade: {
      '2': {
        rows: [
          'Matter', 'Force, Motion, and Energy', 'Earth and Space', 'Organisms and Environment',
          'History', 'Geography', 'Government', 'Economics', 'Citizenship', 'Culture',
          'Science Technology and Society',
        ],
        strandMap: {
          'matter and its properties': 'Matter',
          'matter and energy': 'Matter',
          'force, motion, and energy': 'Force, Motion, and Energy',
          'earth and space': 'Earth and Space',
          'organisms and environments': 'Organisms and Environment',
          'science, technology, and society': 'Science Technology and Society',
        },
      },
      // Grades 3, 4 and 6 were each checked against the CMS separately and their Science
      // and Social Studies lists are identical, so they share one definition rather than
      // copies that could drift. Grade 5 sits between them and is NOT the same, which is
      // why every grade is verified before being added rather than inferred from its
      // neighbours.
      '3': 'TX_SHARED_A',
      '4': 'TX_SHARED_A',
      '6': 'TX_SHARED_A',   // verified separately; identical to 3-4, including the commas
      '5': {
        // Grade 5 is its own shape twice over: Science gains a fifth subtopic, and
        // "Science Technology and Society" drops the commas that grades 3-4 use — back
        // to grade 2's spelling. Copied verbatim; do not tidy the punctuation.
        rows: [
          'Scientific Investigation and Reasoning', 'Matter and Energy', 'Force, Motion, and Energy',
          'Earth and Space', 'Organisms and Environments',
          'History', 'Geography', 'Government', 'Economics', 'Citizenship', 'Culture',
          'Science Technology and Society',
        ],
        strandMap: {
          // the 2021 TEKS renamed this strand; grade 5's CMS still uses the older wording
          'scientific and engineering practices': 'Scientific Investigation and Reasoning',
          'matter and energy': 'Matter and Energy',
          'matter and its properties': 'Matter and Energy',
          'force, motion, and energy': 'Force, Motion, and Energy',
          'earth and space': 'Earth and Space',
          'organisms and environments': 'Organisms and Environments',
          'science, technology, and society': 'Science Technology and Society',
        },
      },
    },
    named: {
      TX_SHARED_A: {
        rows: [
          'Matter and Energy', 'Force, Motion, and Energy', 'Earth and Space', 'Organisms and Environments',
          'History', 'Geography', 'Government', 'Economics', 'Citizenship', 'Culture',
          'Science, Technology, and Society',
        ],
        strandMap: {
          'matter and energy': 'Matter and Energy',
          'matter and its properties': 'Matter and Energy',
          'force, motion, and energy': 'Force, Motion, and Energy',
          'earth and space': 'Earth and Space',
          'organisms and environments': 'Organisms and Environments',
          'science, technology, and society': 'Science, Technology, and Society',
        },
      },
    },
    // True at every grade: these strand names match their subtopic 1:1, and the
    // skills/practice strands carry no content subtopic at all.
    common: {
      'history': 'History', 'geography': 'Geography', 'government': 'Government',
      'economics': 'Economics', 'citizenship': 'Citizenship', 'culture': 'Culture',
      'scientific and engineering practices': null,
      'recurring themes and concepts': null,
      'social studies skills': null,
    },
  },
};

function stateSubdomains(st, grade) {
  const entry = STATE_SUBDOMAINS[st];
  let g = entry && entry.byGrade && entry.byGrade[String(grade)];
  if (typeof g === 'string') g = entry.named[g];   // grades that share one published list
  if (!g) return null;                             // no list for this grade — generic rows
  return { informational: g.rows, strandMap: { ...entry.common, ...g.strandMap } };
}
function stateTeachesSubdomain(st, grade, sub) {
  return state.standards.some(x =>
    x.state === st && x.subject === 'science' && gradeMatches(x.grade, grade) &&
    canonSubdomain(x.strand, 'science', st, grade) === sub);
}

function dashSubdomain(s, grade, st) {
  let dom = setSubdomain(s, st);
  if (stateSubdomains(st, grade)) return dom;   // state's own taxonomy — no coarse folding
  if (grade === '2') {   // fold fine strands back to G2's coarse hierarchy
    if (['Earth Science', 'Life Science', 'Physical Science', 'Science'].includes(dom)) dom = 'Science';
    if (['History', 'Geography', 'Government', 'Economics', 'Social Studies'].includes(dom)) dom = 'Social Studies';
  } else if (dom === 'Science' || dom === 'Social Studies') {
    // A grade 3-8 set classified only at G2's coarse level still has to land somewhere
    // the board renders; use the anchor's strand, else the first row of that group.
    const std = tagStd(s.standard);
    dom = canonSubdomain(std && std.strand, std && std.subject, st, grade)
      || (dom === 'Science' ? 'Earth Science' : 'History');
  }
  return dom;
}

function dashCell(n, ctx) {
  const cls = n >= DASH_GOAL ? 'goal-met' : n > 0 ? 'goal-partial' : 'goal-missing';
  // Every cell is a work order: clicking opens the builder already scoped to it.
  const d = ctx ? ` data-gencell="${esc(ctx.state)}|${esc(ctx.grade)}|${esc(ctx.subtopic)}|${esc(ctx.itemSetType)}|${n}"` : '';
  const title = ctx ? ` title="Build ${esc(ctx.subtopic)} · ${ctx.itemSetType === 'informative' ? 'Informational' : 'Opinion'} for Grade ${esc(ctx.grade)} — ${n} of ${DASH_GOAL}"` : '';
  return `<td class="dash-cell ${cls}${ctx ? ' dash-cell-click' : ''}"${d}${title}>${n}</td>`;
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
    const own = stateSubdomains(dst, g);
    const baseGroups = DASH_GROUPS[g === '2' ? '2' : '3-8'];
    // A state with its own published taxonomy replaces the Informational rows with its
    // own; Literary and Literary Non-Fiction are universal and stay as they are.
    const allGroups = own
      ? baseGroups.map(([label, doms]) => label === 'Informational' ? [label, own.informational] : [label, doms])
      : baseGroups;
    const allExpect = allGroups.flatMap(([, doms]) => doms);

    // sub-domain -> {informative, opinion}. Tally across EVERY possible row first, so a
    // row that holds work is never hidden underneath us.
    const tally = new Map(allExpect.map(d => [d, { informative: 0, opinion: 0 }]));
    sets.forEach(s => {
      const dom = dashSubdomain(s, g, dst);
      const t = tally.get(dom) || { informative: 0, opinion: 0 };
      t[s.itemSetType === 'informative' ? 'informative' : 'opinion']++;
      tally.set(dom, t);
    });

    // Drop a science row only when this state has no standards for it at this grade AND
    // nothing is filed there.
    const keep = d => {
      if (own) return true;                       // the state published this list; show it all
      if (!DASH_SCIENCE_ROWS.includes(d)) return true;
      const t = tally.get(d) || { informative: 0, opinion: 0 };
      if (t.informative || t.opinion) return true;
      return stateTeachesSubdomain(dst, g, d);
    };
    const groups = allGroups.map(([label, doms]) => [label, doms.filter(keep)])
                            .filter(([, doms]) => doms.length);
    const expect = groups.flatMap(([, doms]) => doms);

    // summary: how many (sub-domain x type) cells hit the goal / are partial / missing
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
                const cx = { state: dst, grade: g, subtopic: d };
                return `<tr><td>${esc(d)}</td>${dashCell(t.informative, { ...cx, itemSetType: 'informative' })}${dashCell(t.opinion, { ...cx, itemSetType: 'opinion' })}</tr>`;
              }).join('')}`).join('')}
          </tbody>
          <tfoot><tr><td>Goal: ${DASH_GOAL} per type</td>
            <td>${expect.reduce((a, d) => a + tally.get(d).informative, 0)}</td>
            <td>${expect.reduce((a, d) => a + tally.get(d).opinion, 0)}</td></tr></tfoot>
        </table>
      </div>`));
  });

  wrap.addEventListener('click', e => {
    const cell = e.target.closest('[data-gencell]');
    if (!cell) return;
    const [st, grade, subtopic, itemSetType, have] = cell.dataset.gencell.split('|');
    openGenModal({ state: st, grade, subtopic, itemSetType, have: +have });
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
  bindStateSelect('dashStateSeg', false, state.ui.dashState, v => { state.ui.dashState = v; renderDash(); });

  document.getElementById('newSetBtn').addEventListener('click', newPassageSet);
  document.getElementById('genSetBtn').addEventListener('click', () => {
    state.ui.currentSetId = null;
    state.ui.genOpen = true;
    state.ui.genResults = [];
    state.ui.gen.words = wordBand(state.ui.gen.grade, state.ui.gen.passageCount).target;
    renderPassages();
  });

  // Master list filters: status + grade (grade options come from GRADES)
  const fstSel = document.getElementById('setFilterState');
  if (fstSel) fstSel.addEventListener('change', e => { state.ui.setFilterState = e.target.value; renderSetList(); });

  const searchEl = document.getElementById('setSearch');
  if (searchEl) searchEl.addEventListener('input', e => { state.ui.setSearch = e.target.value; renderSetList(); });

  const fgSel = document.getElementById('setFilterGrade');
  fgSel.innerHTML = `<option value="all">All grades</option>` + GRADES.map(g => `<option value="${g}">Grade ${g}</option>`).join('');
  fgSel.addEventListener('change', e => { state.ui.setFilterGrade = e.target.value; renderSetList(); });
  document.getElementById('setFilterStatus').addEventListener('change', e => {
    state.ui.setFilterStatus = e.target.value; renderSetList();
  });

  document.getElementById('saveBadge').addEventListener('click', async (ev) => {
    if (ghToken && !ev.shiftKey && !tokenRefused()) {
      toast('↻ Syncing…');
      const ok = await syncFromServer();
      if (ok) { toast('✓ Up to date'); return; }
      const hint = /40[13]/.test(syncError)
        ? 'your access token is being refused — shift-click this badge to paste a fresh one'
        : /rate limit|403/i.test(syncError)
          ? 'GitHub is rate-limiting this token — it clears within the hour'
          : /incomplete|truncat/i.test(syncError)
            ? 'the download was cut short — usually a slow or dropping connection'
            : /Failed to fetch|NetworkError|load failed/i.test(syncError)
              ? 'the browser could not reach GitHub — check the network or a VPN/firewall'
              : 'see the details below';
      toast(`⚠ Sync failed: ${syncError || 'unknown'} — ${hint}`);
      return;
    }
    const why = tokenRefused()
      ? `GitHub refused this browser's access token (${syncError}).\n\nTokens expire — GitHub's default is 30 days. Make a new CLASSIC token at github.com/settings/tokens/new with the "repo" box checked, then paste it below.\n\nNothing you have done is lost; it uploads as soon as the new token is accepted.\n\n`
      : '';
    const t = prompt(why + 'Paste your GitHub access token to connect to the SHARED team dashboard.\n\nYour work (approvals, IDs, tags) saves to the team’s central GitHub file that everyone shares. Only the token itself stays private in this browser — it’s your key, not your data.', ghToken || '');
    if (t === null) return;
    ghToken = t.trim();
    localStorage.setItem(LS_GH_TOKEN, ghToken);
    syncTrouble = false; syncError = '';   // give the new token a clean slate
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

  bindStateSelect('stateSeg', false, state.ui.expState, v => { state.ui.expState = v; state.ui.selectedKey = null; renderAll(); });
  bindSeg('subjectSeg', 'expSubject', v => { state.ui.expSubject = v; state.ui.selectedKey = null; renderAll(); });
  bindSeg('revSubjectSeg', 'revSubject', v => { state.ui.revSubject = v; renderReview(); });
  bindStateSelect('revStateSeg', true, state.ui.revState, v => { state.ui.revState = v; renderReview(); });
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
  const cmsBtn = document.getElementById('cmsExportBtn');
  if (cmsBtn) cmsBtn.addEventListener('click', exportForCms);

  // Prune before the first render: both the links and the reviewer's decisions must be in
  // hand to tell an orphan from a not-yet-loaded link.
  Promise.all([loadData(), loadPersisted()]).then(() => {
    pruneOrphanDecisions();
    mergeImportedDrafts();
    renderAll();
  });
}

init();
