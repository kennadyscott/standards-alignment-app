/* Live persistence.

   Replaces the shared-file model, where every browser held all ~1,670 sets and wrote
   the WHOLE document back on every save. That is why a tab left open since morning
   could revert a colleague's day of work: its save carried a full stale copy of
   everything. Here a save carries only the rows that actually changed.

   How we know which rows changed without touching hundreds of mutation sites: keep a
   snapshot of what the server holds and diff against it. No editor code has to
   announce what it touched, so nothing is missed by forgetting to instrument a path. */

const STORE_BUILD = '202608271417';

const SB = {
  client: null,
  user: null,
  ready: false,
  snapSets: new Map(),      // id -> JSON of the row we believe the server holds
  snapKv: new Map(),        // "ns key" -> JSON of value
  via: null,                // set to a Grokbot name while an AI action is running
  onChange: null,           // app supplies a re-render callback
  channel: null,
  lastError: '',
};

/* Which maps in `state` are key/value rows. Mirrors KV_MAPS in the migration. */
const KV_MAPS = ['decisions', 'decisionsAt', 'noAlign', 'cms', 'severed', 'crossOk',
                 'setPush', 'setStateStd', 'setCms', 'setDismiss', 'setFlag', 'setFlagAt',
                 'setStateId', 'setExported', 'setContentAt', 'botDone', 'cmsCounts'];

const SET_COLS = {
  id: 'id', title: 'title', passageId: 'passage_id', status: 'status',
  itemSetType: 'item_set_type', genre: 'genre', gaGrade: 'ga_grade',
  gaSubtopic: 'ga_subtopic', primaryState: 'primary_state', standard: 'standard',
  passages: 'passages', questions: 'questions', peerRevision: 'peer_revision',
  peerDraft: 'peer_draft', writingPrompt: 'writing_prompt',
};
const COL_SETS = Object.fromEntries(Object.entries(SET_COLS).map(([a, b]) => [b, a]));
const LIST_COLS = ['passages', 'questions', 'peer_revision'];

function sbInit() {
  if (SB.client) return SB.client;
  if (typeof supabase === 'undefined') { SB.lastError = 'supabase library failed to load'; return null; }
  SB.client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return SB.client;
}

/* ---------- who is writing ---------- */
// Records the person AND whether a Grokbot did it, so history tells them apart.
function sbActor() {
  const who = (SB.user && SB.user.email) || 'unknown';
  return SB.via ? who + ' via Grokbot ' + SB.via : who;
}
// Wrap an AI action so everything it writes is attributed to that bot.
async function sbAsBot(name, fn) {
  const prev = SB.via;
  SB.via = name;
  try { return await fn(); } finally { SB.via = prev; }
}

/* ---------- auth ---------- */
/* Email + password rather than a magic link. Supabase's built-in mail sender is capped
   at roughly two messages an hour, which throttles SIGN-IN links as well as invites --
   with a team of six that means people queueing to log in. Passwords need no mail at
   all. Kennady creates each account in the Supabase dashboard; there is no self-signup
   and no reset-by-email flow here, because that would depend on the same capped sender. */
async function sbSignIn(email, password) {
  const c = sbInit();
  if (!c) return { error: SB.lastError };
  const { data, error } = await c.auth.signInWithPassword({
    email: String(email || '').trim(),
    password: String(password || ''),
  });
  if (!error && data && data.user) SB.user = data.user;
  return { error: error ? error.message : null };
}
async function sbSignOut() {
  if (SB.client) await SB.client.auth.signOut();
  SB.user = null;
}
async function sbCurrentUser() {
  const c = sbInit();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  SB.user = (data && data.session && data.session.user) || null;
  return SB.user;
}

/* ---------- row shape ---------- */
function rowFromSet(s) {
  const row = {};
  Object.entries(SET_COLS).forEach(([k, col]) => {
    let v = s[k];
    if (v === undefined) v = LIST_COLS.indexOf(col) >= 0 ? [] : null;
    row[col] = v;
  });
  row.title = row.title || '';
  row.passage_id = row.passage_id || '';
  // status stays null when approved: the absence IS the approval.
  row.updated_by = sbActor();
  return row;
}
function setFromRow(r) {
  const s = {};
  Object.entries(COL_SETS).forEach(([col, k]) => {
    if (r[col] !== null && r[col] !== undefined) s[k] = r[col];
  });
  ['passages', 'questions', 'peerRevision'].forEach(k => { if (!s[k]) s[k] = []; });
  if (!s.title) s.title = '';
  if (!s.passageId) s.passageId = '';
  return s;
}
const kvKey = (ns, key) => ns + ' ' + key;

/* Signatures must not depend on key ORDER. Postgres jsonb stores object keys in its own
   order and hands them back that way: the app sends {text, standard, type} and the
   database returns {text, type, standard}. Plain JSON.stringify therefore made every
   save look like a foreign change coming back, which triggered a full re-render -- the
   reported "page refreshes every ten seconds, collapses the questions I just expanded
   and throws me down the page" while someone was mid-edit. Sort keys and the two agree. */
function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
}

// Compare only the columns we own; server-managed ones (updated_at) always differ.
function rowCompare(r) {
  const o = {};
  Object.values(SET_COLS).forEach(col => { o[col] = r[col] === undefined ? null : r[col]; });
  return o;
}

/* ---------- load ---------- */
async function sbLoadAll() {
  const c = sbInit();
  if (!c) throw new Error(SB.lastError);
  const sets = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await c.from('sets').select('*').is('deleted_at', null)
      .range(from, from + 499);
    if (error) throw new Error(error.message);
    sets.push.apply(sets, data);
    if (data.length < 500) break;
  }
  const kv = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await c.from('state_kv').select('ns,key,value').range(from, from + 999);
    if (error) throw new Error(error.message);
    kv.push.apply(kv, data);
    if (data.length < 1000) break;
  }
  SB.snapSets = new Map(sets.map(r => [r.id, stableStringify(rowCompare(r))]));
  SB.snapKv = new Map(kv.map(r => [kvKey(r.ns, r.key), stableStringify(r.value)]));
  const maps = {};
  KV_MAPS.forEach(ns => { maps[ns] = {}; });
  kv.forEach(r => { (maps[r.ns] = maps[r.ns] || {})[r.key] = r.value; });
  SB.ready = true;
  return { sets: sets.map(setFromRow), maps };
}

/* ---------- save: only what changed ---------- */
async function sbSaveDirty(state) {
  const c = sbInit();
  if (!c || !SB.ready) return { saved: 0, error: SB.lastError || 'not loaded' };
  if (!SB.user) return { saved: 0, error: 'not signed in' };

  const setRows = [];
  (state.sets || []).forEach(s => {
    if (!s || !s.id) return;
    const row = rowFromSet(s);
    const sig = stableStringify(rowCompare(row));
    if (SB.snapSets.get(s.id) !== sig) setRows.push({ row: row, sig: sig });
  });

  const kvRows = [];
  KV_MAPS.forEach(ns => {
    const m = state[ns] || {};
    Object.keys(m).forEach(k => {
      const v = stableStringify(m[k] === undefined ? null : m[k]);
      if (SB.snapKv.get(kvKey(ns, k)) !== v) kvRows.push({ ns: ns, key: k, value: m[k], _v: v });
    });
  });

  let saved = 0, error = null;
  for (let i = 0; i < setRows.length && !error; i += 200) {
    const chunk = setRows.slice(i, i + 200);
    const res = await c.from('sets').upsert(chunk.map(x => x.row), { onConflict: 'id' });
    if (res.error) { error = res.error.message; break; }
    chunk.forEach(x => SB.snapSets.set(x.row.id, x.sig));
    saved += chunk.length;
  }
  for (let i = 0; i < kvRows.length && !error; i += 400) {
    const chunk = kvRows.slice(i, i + 400);
    const res = await c.from('state_kv').upsert(
      chunk.map(x => ({ ns: x.ns, key: x.key, value: x.value, updated_by: sbActor() })),
      { onConflict: 'ns,key' });
    if (res.error) { error = res.error.message; break; }
    chunk.forEach(x => SB.snapKv.set(kvKey(x.ns, x.key), x._v));
    saved += chunk.length;
  }

  // Deletion is a soft delete on the row, not a tombstone map the whole team carries.
  const deleted = Object.keys(state.setDeleted || {});
  if (!error && deleted.length) {
    const live = deleted.filter(id => SB.snapSets.has(id));
    if (live.length) {
      const res = await c.from('sets')
        .update({ deleted_at: new Date().toISOString(), updated_by: sbActor() })
        .in('id', live);
      if (res.error) error = res.error.message;
      else live.forEach(id => SB.snapSets.delete(id));
    }
  }
  SB.lastError = error || '';
  return { saved: saved, error: error };
}

/* ---------- live updates ---------- */
/* Re-rendering once per changed row is what made the app crawl: saving a batch of 20
   sets produced 20 realtime events and 20 full re-renders, and most of them were the
   echo of this browser's own write. Two guards below:
     1. a row identical to our snapshot is OUR echo -- ignore it entirely;
     2. anything left is coalesced, so a burst of rows costs one render. */
let sbRenderTimer = null;
function sbNotify(kind, id) {
  if (!SB.onChange) return;
  clearTimeout(sbRenderTimer);
  sbRenderTimer = setTimeout(() => SB.onChange(kind, id), 120);
}

function sbSubscribe(state, onChange) {
  const c = sbInit();
  if (!c) return;
  SB.onChange = onChange;
  if (SB.channel) c.removeChannel(SB.channel);
  SB.channel = c.channel('standards-alignment')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sets' }, p => {
      const r = p.new;
      if (!r || !r.id) return;
      const sig = stableStringify(rowCompare(r));
      // Our own write coming back. Nothing changed for us; re-rendering would be pure cost.
      if (!r.deleted_at && SB.snapSets.get(r.id) === sig) return;
      const i = (state.sets || []).findIndex(x => x.id === r.id);
      if (r.deleted_at) {
        if (i < 0) return;
        state.sets.splice(i, 1);
        SB.snapSets.delete(r.id);
      } else {
        const s = setFromRow(r);
        if (i >= 0) state.sets[i] = s; else state.sets.push(s);
        // Record what the server holds, so this arrival is not echoed straight back.
        SB.snapSets.set(r.id, sig);
      }
      sbNotify('sets', r.id);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'state_kv' }, p => {
      const r = p.new;
      if (!r || !r.ns) return;
      const v = stableStringify(r.value);
      if (SB.snapKv.get(kvKey(r.ns, r.key)) === v) return;   // our own echo
      state[r.ns] = state[r.ns] || {};
      state[r.ns][r.key] = r.value;
      SB.snapKv.set(kvKey(r.ns, r.key), v);
      sbNotify('kv', r.ns);
    })
    .subscribe();
}
