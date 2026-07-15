/* Standards Alignment — Ohio ↔ Georgia practice tool */

const GRADES = ['K','1','2','3','4','5','6','7','8'];
const STATE_NAMES = { OH: 'Ohio', GA: 'Georgia', ALL: 'All States' };
const SUBJECT_NAMES = { social_studies: 'Social Studies', science: 'Science', ela: 'ELA' };
const OTHER = { OH: 'GA', GA: 'OH' };

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

const state = {
  standards: [],            // all standards, both states
  byKey: new Map(),         // `${state}:${code}` -> standard
  alignments: [],           // draft alignment records
  decisions: {},            // id -> 'approved' | 'rejected'
  manual: [],               // user-added alignment records
  noAlign: {},              // `${state}:${code}` -> true (reviewed: no alignment possible)
  cms: {},                  // `${state}:${code}` -> true (standard is loaded in the CMS)
  sets: [],                 // passage sets
  ui: {
    view: 'explorer',
    expState: 'OH', expSubject: 'social_studies', expGrade: '4',
    selectedKey: null, search: '',
    revSubject: 'social_studies', revGrade: '4', revStatus: 'pending',
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

function loadLocal() {
  try { state.decisions = JSON.parse(localStorage.getItem(LS_DECISIONS)) || {}; } catch { state.decisions = {}; }
  try { state.manual = JSON.parse(localStorage.getItem(LS_MANUAL)) || []; } catch { state.manual = []; }
  try { state.noAlign = JSON.parse(localStorage.getItem(LS_NOALIGN)) || {}; } catch { state.noAlign = {}; }
  try { state.cms = JSON.parse(localStorage.getItem(LS_CMS)) || {}; } catch { state.cms = {}; }
}
function mirrorLocal() {
  localStorage.setItem(LS_DECISIONS, JSON.stringify(state.decisions));
  localStorage.setItem(LS_MANUAL, JSON.stringify(state.manual));
  localStorage.setItem(LS_NOALIGN, JSON.stringify(state.noAlign));
  localStorage.setItem(LS_CMS, JSON.stringify(state.cms));
  localStorage.setItem(LS_SETS, JSON.stringify(state.sets));
}

function stateBody() {
  return JSON.stringify({
    decisions: state.decisions,
    manual: state.manual,
    noAlign: state.noAlign,
    cms: state.cms,
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
      sets: dedupeById([...(s.sets || []), ...state.sets]),
    };
    state.decisions = merged.decisions;
    state.manual = merged.manual;
    state.noAlign = merged.noAlign;
    state.cms = merged.cms;
    state.sets = merged.sets;
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

// A standard with lettered elements (a, b, c…) becomes one entry per element:
// code = parent code + letter, description = element text, stem = parent statement.
function expandElements(list) {
  const out = [];
  list.forEach(s => {
    if (s.elements && s.elements.length) {
      s.elements.forEach(e2 => {
        const m = e2.match(/^([a-z])\.\s*([\s\S]*)$/);
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

async function loadData() {
  const files = [
    'data/ohio_science.json',
    'data/ohio_social_studies.json',
    'data/georgia_science.json',
    'data/georgia_social_studies.json',
    'data/universal_ela.json', // state:"ALL" — Literary / Literary Non-Fiction domains+standards, shown for every state
  ];
  const results = await Promise.all(files.map(fetchJson));
  state.standards = expandElements(results.filter(Boolean).flat());
  state.standards.forEach(s => state.byKey.set(`${s.state}:${s.code}`, s));

  const aligns = await fetchJson('data/alignments.json');
  state.alignments = (aligns && aligns.alignments) || [];
}

/* ---------- alignment status helpers ---------- */
function statusOf(a) {
  if (a.manual) return 'approved';
  return state.decisions[a.id] || 'pending';
}
function allAlignments() { return state.alignments.concat(state.manual); }

function alignmentsFor(std) {
  const side = std.state === 'OH' ? 'oh' : 'ga';
  return allAlignments().filter(a => a[side] === std.code && a.subject === std.subject);
}

function isNoAlign(std) { return !!state.noAlign[`${std.state}:${std.code}`]; }

// status dot for a standard in the list: approved (has ≥1 approved), noalign (reviewed:
// no alignment possible), pending (has ≥1 pending draft), none (not yet reviewed)
function standardStatus(std) {
  const list = alignmentsFor(std);
  if (list.some(a => statusOf(a) === 'approved')) return 'approved';
  if (isNoAlign(std)) return 'noalign';
  if (list.some(a => statusOf(a) === 'pending')) return 'pending';
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
  const cls = stateCode === 'OH' ? 'oh' : 'ga';
  if (!std) return `<div class="pair-side ${cls}"><div class="side-label">${STATE_NAMES[stateCode]}</div><div class="pair-desc">(standard not found)</div></div>`;
  return `
    <div class="pair-side ${cls}">
      <div class="side-label">${STATE_NAMES[stateCode]} · G${esc(std.grade)}${std.strand ? ' · ' + esc(std.strand) : ''}</div>
      <div class="pair-code">${esc(std.code)}</div>
      ${std.stem ? `<div class="stem-note">${esc(std.parent)}: ${esc(std.stem)}</div>` : ''}
      <div class="pair-desc">${esc(std.description)}</div>
    </div>`;
}

function alignCard(a) {
  const oh = state.byKey.get(`OH:${a.oh}`);
  const ga = state.byKey.get(`GA:${a.ga}`);
  const st = statusOf(a);
  const actions = a.manual
    ? `<span class="status-chip approved">manual · approved</span>
       <button class="act-btn reject" data-act="remove-manual" data-id="${a.id}">Remove</button>`
    : st === 'pending'
      ? `<button class="act-btn approve" data-act="approved" data-id="${a.id}">✓ Approve</button>
         <button class="act-btn reject" data-act="rejected" data-id="${a.id}">✕ Reject</button>`
      : `<span class="status-chip ${st}">${st}</span>
         <button class="act-btn reset" data-act="pending" data-id="${a.id}">Undo</button>`;
  return `
    <div class="review-card ${st !== 'pending' && !a.manual ? 'decided-' + st : a.manual ? 'decided-approved' : ''}">
      <div class="review-pair">
        ${pairSide(oh, 'OH')}
        <div class="pair-mid">⇄</div>
        ${pairSide(ga, 'GA')}
      </div>
      <div class="review-foot">
        <span class="conf-chip">confidence: ${esc(a.confidence || '—')}</span>
        ${a.rationale ? `<div class="rationale"><b>Why:</b> ${esc(a.rationale)}</div>` : ''}
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

  const aligns = alignmentsFor(std);
  const approved = aligns.filter(a => statusOf(a) === 'approved');
  const pending = aligns.filter(a => statusOf(a) === 'pending');
  const rejected = aligns.filter(a => statusOf(a) === 'rejected');
  const otherStateName = STATE_NAMES[OTHER[std.state]];

  let html = stdCard(std, `Selected standard — ${STATE_NAMES[std.state]} · ${SUBJECT_NAMES[std.subject]} · Grade ${std.grade}`);

  const naKey = `${std.state}:${std.code}`;
  html += `<div class="align-section-title">Aligned standards in ${otherStateName}<span class="rule"></span></div>`;
  if (approved.length) {
    html += approved.map(a => alignCard(a)).join('');
  } else if (isNoAlign(std)) {
    html += `
      <div class="noalign-box">
        <div class="noalign-title">🚫 No Alignment Possible</div>
        <div class="noalign-sub">Reviewed — no ${otherStateName} equivalent exists for this standard.</div>
        <button class="act-btn reset" data-act="unmark-noalign" data-id="${esc(naKey)}">Undo</button>
      </div>`;
  } else {
    html += `
      <div class="no-align">
        No approved alignments yet${pending.length ? ' — review the pending drafts below' : ''}.<br>
        <button class="act-btn reject" data-act="mark-noalign" data-id="${esc(naKey)}" style="margin-top:10px">🚫 Mark as No Alignment Possible</button>
      </div>`;
  }

  if (pending.length) {
    html += `<div class="align-section-title">Pending drafts (${pending.length})<span class="rule"></span></div>`;
    html += pending.map(a => alignCard(a)).join('');
  }
  if (rejected.length) {
    html += `<div class="align-section-title">Rejected (${rejected.length})<span class="rule"></span></div>`;
    html += rejected.map(a => alignCard(a)).join('');
  }

  html += renderManualAdd(std);
  content.innerHTML = html;

  content.querySelectorAll('[data-act]').forEach(btn => {
    btn.addEventListener('click', () => handleAction(btn.dataset.act, btn.dataset.id));
  });
  wireManualAdd(content, std);
}

function renderManualAdd(std) {
  return `
    <div class="align-section-title">Add manual alignment<span class="rule"></span></div>
    <div class="source-card" style="margin-bottom:0">
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
        <select id="manualPick" style="font:inherit; padding:8px 10px; border:1px solid var(--line); border-radius:8px; flex:1; min-width:260px"></select>
        <button class="act-btn approve" id="manualAddBtn">+ Add as approved</button>
      </div>
      <div style="font-size:12px; color:var(--ink-faint); margin-top:8px">Pick any ${STATE_NAMES[OTHER[std.state]]} ${SUBJECT_NAMES[std.subject]} standard (any grade) that you judge to be aligned.</div>
    </div>`;
}

function wireManualAdd(content, std) {
  const sel = content.querySelector('#manualPick');
  const btn = content.querySelector('#manualAddBtn');
  if (!sel) return;
  const otherState = OTHER[std.state];
  const existing = new Set(alignmentsFor(std).map(a => otherState === 'OH' ? a.oh : a.ga));
  const options = state.standards
    .filter(s => s.state === otherState && s.subject === std.subject && !existing.has(s.code))
    .sort((a, b) => GRADES.indexOf(a.grade) - GRADES.indexOf(b.grade));
  sel.innerHTML = '<option value="">Choose a standard…</option>' + options.map(s =>
    `<option value="${esc(s.code)}">G${esc(s.grade)} · ${esc(s.code)} — ${esc(s.description.slice(0, 90))}${s.description.length > 90 ? '…' : ''}</option>`
  ).join('');
  btn.addEventListener('click', () => {
    if (!sel.value) return;
    const rec = {
      id: `manual-${Date.now()}`,
      manual: true,
      subject: std.subject,
      oh: std.state === 'OH' ? std.code : sel.value,
      ga: std.state === 'GA' ? std.code : sel.value,
      confidence: 'manual',
      rationale: 'Manually aligned by reviewer.',
    };
    state.manual.push(rec);
    saveManual();
    toast(`Added ${rec.oh} ↔ ${rec.ga}`);
    renderAll();
  });
}

function handleAction(act, id) {
  if (act === 'mark-noalign') {
    state.noAlign[id] = true;
    // marking as unalignable rejects any still-pending drafts for this standard
    const [st, code] = id.split(':');
    const side = st === 'OH' ? 'oh' : 'ga';
    state.alignments.filter(a => a[side] === code && statusOf(a) === 'pending')
      .forEach(a => { state.decisions[a.id] = 'rejected'; });
    saveNoAlign();
    toast('Marked: No Alignment Possible');
  } else if (act === 'unmark-noalign') {
    delete state.noAlign[id];
    saveNoAlign();
    toast('No-alignment mark removed');
  } else if (act === 'remove-manual') {
    state.manual = state.manual.filter(m => m.id !== id);
    saveManual();
    toast('Manual alignment removed');
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

/* ---------- review queue ---------- */
function renderReview() {
  const { revSubject, revGrade, revStatus } = state.ui;
  const inScope = state.alignments.filter(a => a.subject === revSubject && a.grade === revGrade);
  const shown = inScope.filter(a => revStatus === 'all' || statusOf(a) === revStatus);
  const done = inScope.filter(a => statusOf(a) !== 'pending').length;

  document.getElementById('reviewProgress').textContent =
    inScope.length ? `${done} of ${inScope.length} drafts reviewed · Grade ${revGrade} ${SUBJECT_NAMES[revSubject]}` : '';

  const box = document.getElementById('reviewList');
  box.innerHTML = '';
  if (!shown.length) {
    box.appendChild(el(`<div class="review-empty">${
      inScope.length
        ? (revStatus === 'pending' ? '🎉 All drafts for this grade are reviewed.' : `No ${revStatus === 'all' ? '' : revStatus + ' '}drafts here.`)
        : 'No draft alignments generated for this grade/subject yet.'
    }</div>`));
    return;
  }

  shown.forEach(a => {
    const oh = state.byKey.get(`OH:${a.oh}`);
    const ga = state.byKey.get(`GA:${a.ga}`);
    const st = statusOf(a);
    const card = el(`
      <div class="review-card ${st !== 'pending' ? 'decided-' + st : ''}">
        <div class="review-pair">
          ${pairSide(oh, 'OH')}
          <div class="pair-mid">⇄</div>
          ${pairSide(ga, 'GA')}
        </div>
        <div class="review-foot">
          <span class="conf-chip">confidence: ${esc(a.confidence || '—')}</span>
          <div class="rationale"><b>Why:</b> ${esc(a.rationale || '')}</div>
          ${st === 'pending'
            ? `<button class="act-btn approve" data-act="approved" data-id="${a.id}">✓ Approve</button>
               <button class="act-btn reject" data-act="rejected" data-id="${a.id}">✕ Reject</button>`
            : `<span class="status-chip ${st}">${st}</span>
               <button class="act-btn reset" data-act="pending" data-id="${a.id}">Undo</button>`}
        </div>
      </div>`);
    card.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', () => handleAction(btn.dataset.act, btn.dataset.id));
    });
    box.appendChild(card);
  });
}

function renderBadge() {
  const pending = state.alignments.filter(a => statusOf(a) === 'pending').length;
  document.getElementById('pendingBadge').textContent = pending;
}

/* ---------- export ---------- */
function exportData() {
  const out = {
    exported_at: new Date().toISOString(),
    states: ['OH', 'GA'],
    alignments: allAlignments().map(a => ({
      subject: a.subject, oh: a.oh, ga: a.ga,
      confidence: a.confidence, rationale: a.rationale,
      status: statusOf(a), source: a.manual ? 'manual' : 'ai_draft',
    })),
    no_alignment_possible: Object.keys(state.noAlign),
  };
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'oh-ga-alignments.json';
  link.click();
  URL.revokeObjectURL(url);
  toast('Exported alignment decisions');
}

/* ---------- passage sets ---------- */
const LS_SETS = 'sa_passage_sets_v1';
const PROMPT_TYPES = ['informational', 'opinion', 'argumentative'];
const MAX_QUESTIONS = 4;

function loadSets() {
  try { state.sets = JSON.parse(localStorage.getItem(LS_SETS)) || []; } catch { state.sets = []; }
}
function saveSets() { pushState(); }
function currentSet() { return state.sets.find(s => s.id === state.ui.currentSetId) || null; }

function newPassageSet() {
  const s = {
    id: 'ps-' + Date.now(),
    title: '', passageId: '',
    itemSetType: null,                 // informative | opinion
    genre: null,                       // informational | literary | literary_nonfiction
    gaGrade: null, gaSubtopic: null,   // Georgia tagging hierarchy
    standard: null,                    // set-level primary standard tag
    passages: [''],
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

// Approved alignments in every other state for a tagged standard (currently OH↔GA).
function tagAlignHtml(tag) {
  if (!tag) return '';
  const side = tag.state === 'OH' ? 'oh' : 'ga';
  const otherSide = side === 'oh' ? 'ga' : 'oh';
  const otherState = OTHER[tag.state];
  const rel = allAlignments().filter(a => a[side] === tag.code);
  const approved = rel.filter(a => statusOf(a) === 'approved');
  const pending = rel.filter(a => statusOf(a) === 'pending').length;
  let inner;
  if (approved.length) {
    inner = approved.map(a => {
      const o = state.byKey.get(`${otherState}:${a[otherSide]}`);
      return `<div class="align-mini-item">
        <span class="align-mini-code">${esc(a[otherSide])}</span>
        <span class="chip">${STATE_NAMES[otherState]}</span>
        ${o ? `<span class="chip">Grade ${esc(o.grade)}</span><span class="align-mini-desc">${esc(o.description)}</span>` : ''}
      </div>`;
    }).join('');
  } else if (state.noAlign[`${tag.state}:${tag.code}`]) {
    return `<div class="align-mini noalign"><div class="align-mini-title">Aligned standards — other states</div>
      <div class="align-mini-item"><b>🚫 No Alignment Possible</b><span class="align-mini-desc">Reviewed — no ${STATE_NAMES[otherState]} equivalent exists.</span></div></div>`;
  } else {
    inner = `<div class="align-mini-empty">No approved ${STATE_NAMES[otherState]} alignment yet${pending ? ` — ${pending} draft${pending > 1 ? 's' : ''} pending in the Review Queue` : ''}.</div>`;
  }
  return `<div class="align-mini"><div class="align-mini-title">Approved aligned standards — other states</div>${inner}</div>`;
}

function tagChipHtml(tag, section, index, showAlign = true) {
  if (tag) {
    const std = state.byKey.get(`${tag.state}:${tag.code}`);
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

function pickerCandidates(query, restrictState) {
  const q = query.toLowerCase().trim();
  // Universal (state:"ALL") standards always show, even in state-restricted pickers.
  let list = state.standards;
  if (restrictState) list = list.filter(s => s.state === restrictState || s.state === 'ALL');
  if (q) {
    list = list.filter(s =>
      `${s.code} ${s.description} ${s.strand || ''} ${SUBJECT_NAMES[s.subject] || s.subject} grade ${s.grade}`.toLowerCase().includes(q));
  }
  return list.slice(0, 60);
}

function pickerResultsHtml(query, restrictState) {
  const list = pickerCandidates(query, restrictState);
  if (!list.length) return `<div class="align-mini-empty">No standards match.</div>`;
  let html = '', lastGroup = null;
  list.forEach(s => {
    const group = `${STATE_NAMES[s.state]} · ${SUBJECT_NAMES[s.subject] || s.subject} · ${s.strand || 'General'}`;
    if (group !== lastGroup) {
      html += `<div class="std-group-head">${esc(group)}</div>`;
      lastGroup = group;
    }
    html += `
    <div class="picker-item" data-tag="${esc(s.state)}|${esc(s.code)}">
      <span class="align-mini-code">${esc(s.code)}</span>
      <span class="chip">${esc(gradeLabel(s.grade))}</span>
      <span class="align-mini-desc">${esc(s.description.slice(0, 100))}${s.description.length > 100 ? '…' : ''}</span>
    </div>`;
  });
  return html;
}

function pickerHtml(section, index, restrictState) {
  return `
    <div class="tag-picker" data-picker="${section}:${index}">
      <input type="search" class="picker-search" placeholder="Search ${restrictState ? STATE_NAMES[restrictState] + ' ' : ''}standards by code or text…">
      <div class="picker-results">${pickerResultsHtml('', restrictState)}</div>
      <button class="act-btn picker-cancel">Cancel</button>
    </div>`;
}

function questionBlockHtml(q, section, i, label, restrictState) {
  const open = state.ui.openPicker && state.ui.openPicker.section === section && state.ui.openPicker.index === i;
  return `
    <div class="q-card">
      <div class="q-head">
        <span class="q-label">${esc(label)}</span>
        <button class="q-remove" data-remove-q="${section}:${i}" title="Remove">✕</button>
      </div>
      <textarea class="ps-textarea q-text" data-q="${section}:${i}" rows="5"
        placeholder="Paste the entire question here, including all answer choices.">${esc(q.text)}</textarea>
      <div class="q-tag-area">
        ${open ? pickerHtml(section, i, restrictState) : tagChipHtml(q.standard, section, i)}
      </div>
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

  panel.innerHTML = `
    <div class="editor-topbar">
      <span class="ps-hint">Changes save automatically — Save confirms immediately.</span>
      <button class="btn btn-primary" id="saveSetBtn">Save</button>
    </div>

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
      <div class="ps-section-title">Classification</div>
      <div class="ps-field"><label>Item Set Type</label>
        <div class="chips-row">
          ${ITEM_SET_TYPES.map(t => `<button class="pill-btn ${s.itemSetType === t.key ? 'active' : ''}" data-itemset="${t.key}">${t.label}</button>`).join('')}
        </div>
      </div>
      <div class="ps-field" style="margin-top:12px"><label>Genre</label>
        <div class="chips-row">
          ${GENRES.map(g => `<button class="pill-btn ${s.genre === g.key ? 'active' : ''}" data-genre="${g.key}">${g.label}</button>`).join('')}
        </div>
      </div>
      <div class="ps-field" style="margin-top:12px"><label>Georgia hierarchy — grade</label>
        <div class="chips-row">
          ${GA_GRADES.map(g => `<button class="pill-btn ${s.gaGrade === g ? 'active' : ''}" data-gagrade="${g}">Grade ${g}</button>`).join('')}
        </div>
      </div>
      <div class="ps-field" style="margin-top:12px"><label>Georgia hierarchy — subtopic</label>
        ${s.genre && s.gaGrade
          ? `<div class="chips-row">${subtopics.map(t => `<button class="pill-btn ${s.gaSubtopic === t ? 'active' : ''}" data-subtopic="${esc(t)}">${esc(t)}</button>`).join('')}</div>`
          : `<div class="ps-hint">Pick a genre and Georgia grade first — subtopics depend on both.</div>`}
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
      <div class="ps-field" style="margin-top:14px"><label>Primary standard</label>
        <div class="q-tag-area">${setPickerOpen ? pickerHtml('set', 0, null) : tagChipHtml(s.standard, 'set', 0, false)}</div>
        <div class="ps-hint" style="margin-top:6px">Cross-state alignments for this standard appear in the panel on the right.</div>
      </div>
    </div>

    <div class="ps-section">
      <div class="ps-section-title">Passages <span class="ps-hint">single or multiple</span></div>
      ${s.passages.map((p, i) => `
        <div class="q-card">
          <div class="q-head"><span class="q-label">Passage ${i + 1}</span>
            <button class="q-remove" data-remove-p="${i}" title="Remove">✕</button></div>
          <textarea class="ps-textarea" data-p="${i}" rows="7" placeholder="Paste the passage text here.">${esc(p)}</textarea>
        </div>`).join('')}
      <button class="act-btn" id="addPassage">＋ Add passage</button>
    </div>

    <div class="ps-section">
      <div class="ps-section-title">Question Set <span class="ps-hint">3–4 questions, each tagged to a standard</span></div>
      ${s.questions.map((q, i) => questionBlockHtml(q, 'questions', i, `Question ${i + 1}`, null)).join('')}
      ${s.questions.length < MAX_QUESTIONS ? `<button class="act-btn" id="addQuestion">＋ Add question</button>` : ''}
    </div>

    <div class="ps-section">
      <div class="ps-section-title">Peer Revision Task <span class="chip ga-chip">Georgia only</span></div>
      ${s.peerRevision.map((q, i) => questionBlockHtml(q, 'peer', i, `Task ${i + 1}`, 'GA')).join('')}
      ${s.peerRevision.length < MAX_QUESTIONS ? `<button class="act-btn" id="addPeer">＋ Add task</button>` : ''}
    </div>

    <div class="ps-section">
      <div class="ps-section-title">Writing Prompt</div>
      <div class="seg" id="promptTypeSeg" style="max-width:420px">
        ${PROMPT_TYPES.map(t => `<button class="seg-btn ${s.writingPrompt.type === t ? 'active' : ''}" data-pt="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}
      </div>
      <textarea class="ps-textarea" id="promptText" rows="4" style="margin-top:10px"
        placeholder="Paste the writing prompt here.">${esc(s.writingPrompt.text)}</textarea>
    </div>`;

  wireSetEditor(panel, s);
}

function tagTarget(s, section, i) {
  return section === 'set' ? s : section === 'peer' ? s.peerRevision[i] : s.questions[i];
}

function wireSetEditor(panel, s) {
  const on = (sel, ev, fn) => panel.querySelectorAll(sel).forEach(n => n.addEventListener(ev, fn));

  on('#saveSetBtn', 'click', () => flushState());

  on('[data-itemset]', 'click', e => {
    s.itemSetType = e.currentTarget.dataset.itemset;
    saveSets(); renderPassages();
  });
  on('[data-unistd]', 'click', e => {
    s.standard = { state: 'ALL', code: e.currentTarget.dataset.unistd };
    saveSets();
    toast(`Tagged ${s.standard.code}`);
    renderPassages();
  });
  on('[data-genre]', 'click', e => {
    s.genre = e.currentTarget.dataset.genre;
    if (!gaSubtopicsFor(s.gaGrade, s.genre).includes(s.gaSubtopic)) s.gaSubtopic = null;
    saveSets(); renderPassages();
  });
  on('[data-gagrade]', 'click', e => {
    s.gaGrade = e.currentTarget.dataset.gagrade;
    if (!gaSubtopicsFor(s.gaGrade, s.genre).includes(s.gaSubtopic)) s.gaSubtopic = null;
    saveSets(); renderPassages();
  });
  on('[data-subtopic]', 'click', e => {
    s.gaSubtopic = e.currentTarget.dataset.subtopic;
    saveSets(); renderPassages();
  });

  on('#psTitle', 'input', e => { s.title = e.target.value; saveSets(); renderSetListSoon(); });
  on('#psId', 'input', e => { s.passageId = e.target.value; saveSets(); renderSetListSoon(); });
  on('[data-p]', 'input', e => { s.passages[+e.target.dataset.p] = e.target.value; saveSets(); });
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

  on('#addPassage', 'click', () => { s.passages.push(''); saveSets(); renderPassages(); });
  on('#addQuestion', 'click', () => { s.questions.push({ text: '', standard: null }); saveSets(); renderPassages(); });
  on('#addPeer', 'click', () => { s.peerRevision.push({ text: '', standard: null }); saveSets(); renderPassages(); });

  on('[data-remove-p]', 'click', e => {
    s.passages.splice(+e.currentTarget.dataset.removeP, 1);
    if (!s.passages.length) s.passages.push('');
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
    const restrictState = section === 'peer' ? 'GA' : null;
    const results = picker.querySelector('.picker-results');
    picker.querySelector('.picker-search').addEventListener('input', e => {
      results.innerHTML = pickerResultsHtml(e.target.value, restrictState);
    });
    picker.querySelector('.picker-cancel').addEventListener('click', () => {
      state.ui.openPicker = null;
      renderPassages();
    });
    results.addEventListener('click', e => {
      const item = e.target.closest('.picker-item');
      if (!item) return;
      const [st, code] = item.dataset.tag.split('|');
      tagTarget(s, section, +iStr).standard = { state: st, code };
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
  const std = state.byKey.get(`${tag.state}:${tag.code}`);
  html += `
    <div class="side-block">
      <div class="align-mini-title">Tagged standard</div>
      <div class="align-mini-item">
        <span class="align-mini-code">${esc(tag.code)}</span>
        <span class="chip">${STATE_NAMES[tag.state]}</span>
        ${std && std.grade ? `<span class="chip">${esc(gradeLabel(std.grade))}</span>` : ''}
        ${cmsChip(tag.state, tag.code)}
      </div>
      ${std ? `<div class="align-mini-desc" style="margin-top:4px">${esc(std.description)}</div>` : ''}
    </div>`;

  if (tag.state === 'ALL') {
    html += `<div class="side-block"><div class="align-mini-empty">Universal standard — applies to all states; no cross-state alignment needed.</div></div>`;
    panel.innerHTML = html;
    wireCmsChips(panel);
    return;
  }

  const side = tag.state === 'OH' ? 'oh' : 'ga';
  const otherSide = side === 'oh' ? 'ga' : 'oh';
  const otherState = OTHER[tag.state];
  const rel = allAlignments().filter(a => a[side] === tag.code);
  const approved = rel.filter(a => statusOf(a) === 'approved');
  const pending = rel.filter(a => statusOf(a) === 'pending').length;

  html += `<div class="side-block"><div class="align-mini-title">${STATE_NAMES[otherState]} — approved</div>`;
  if (approved.length) {
    html += approved.map(a => {
      const code = a[otherSide];
      const o = state.byKey.get(`${otherState}:${code}`);
      return `<div class="side-align-item">
        <div class="align-mini-item">
          <span class="align-mini-code">${esc(code)}</span>
          ${o && o.grade ? `<span class="chip">G${esc(o.grade)}</span>` : ''}
          ${cmsChip(otherState, code)}
        </div>
        ${o ? `<div class="align-mini-desc">${esc(o.description)}</div>` : ''}
      </div>`;
    }).join('');
  } else if (state.noAlign[`${tag.state}:${tag.code}`]) {
    html += `<div class="noalign-inline">🚫 No Alignment Possible — reviewed, no ${STATE_NAMES[otherState]} equivalent.</div>`;
  } else {
    html += `<div class="align-mini-empty">Nothing approved yet${pending ? ` — ${pending} draft${pending > 1 ? 's' : ''} pending in the Review Queue` : ''}.</div>`;
  }
  html += `</div>`;

  panel.innerHTML = html;
  wireCmsChips(panel);
}

function cmsChip(st, code) {
  const key = `${st}:${code}`;
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
