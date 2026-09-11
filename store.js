/* Live persistence.

   Replaces the shared-file model, where every browser held all ~1,670 sets and wrote
   the WHOLE document back on every save. That is why a tab left open since morning
   could revert a colleague's day of work: its save carried a full stale copy of
   everything. Here a save carries only the rows that actually changed.

   How we know which rows changed without touching hundreds of mutation sites: keep a
   snapshot of what the server holds and diff against it. No editor code has to
   announce what it touched, so nothing is missed by forgetting to instrument a path. */

const STORE_BUILD = '202609112014';

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
const KV_MAPS = ['decisions', 'decisionsAt', 'decisionsBy', 'noAlign', 'cms', 'severed', 'crossOk',
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
  // Author/time live on the row, not in SET_COLS — they must not dirty a save.
  s.updatedBy = r.updated_by || '';
  s.updatedAt = r.updated_at || '';
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
/* Which content columns a pending row would empty out, judged against the last copy the
   server is known to hold. SB.snapSets stores that copy as its stringified row, so the
   previous content is already here -- no extra bookkeeping to drift out of sync. */
function contentLost(prevSig, row) {
  if (!prevSig) return [];                      // never seen: nothing to lose
  let prev;
  try { prev = JSON.parse(prevSig); } catch { return []; }
  return LIST_COLS.filter(col =>
    Array.isArray(prev[col]) && prev[col].length && !((row[col] || []).length));
}

// The one case where emptying is real: a person cleared the set they have open. Any
// second set in the same save is a background write, and those are never deliberate.
function soleDeliberateEdit(state, id, alreadyBlanked) {
  return alreadyBlanked === 0 && !!state.ui && state.ui.currentSetId === id;
}

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
  const blanked = [];
  (state.sets || []).forEach(s => {
    if (!s || !s.id) return;
    const row = rowFromSet(s);
    const sig = stableStringify(rowCompare(row));
    const prev = SB.snapSets.get(s.id);
    if (prev === sig) return;
    const lost = contentLost(prev, row);
    // A save that would wipe passages/questions off a set the server has content for is
    // refused. On 2026-09-09 an out-of-band status change made the app write its own
    // copies of 134 sets back in one upsert, and rowFromSet turns a missing field into an
    // empty list -- so every one of them lost its passage text in a single statement.
    // Emptying a set by hand still works: that is one set, and it is the open one.
    if (lost.length && !soleDeliberateEdit(state, s.id, blanked.length)) {
      blanked.push({ id: s.id, title: s.title || '', lost: lost });
      return;                                   // stays dirty, so nothing is silently lost
    }
    setRows.push({ row: row, sig: sig });
  });
  if (blanked.length) {
    console.warn('[save] refused to blank content on ' + blanked.length + ' set(s):', blanked);
  }

  const kvRows = [];
  KV_MAPS.forEach(ns => {
    const m = state[ns] || {};
    Object.keys(m).forEach(k => {
      const v = stableStringify(m[k] === undefined ? null : m[k]);
      if (SB.snapKv.get(kvKey(ns, k)) !== v) kvRows.push({ ns: ns, key: k, value: m[k], _v: v });
    });
  });

  let saved = 0, error = null;
  const blockedCount = blanked.length;
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
  return { saved: saved, error: error, blocked: blockedCount, blockedSets: blanked };
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
    .on('presence', { event: 'sync' }, () => {
      if (typeof SB.onPresence === 'function') SB.onPresence();
    })
    .subscribe(status => {
      if (status === 'SUBSCRIBED' && SB.user) {
        SB.channel.track({
          setId: SB.viewingSetId || null,
          email: SB.user.email,
        });
      }
    });
}

function sbTrackView(setId) {
  SB.viewingSetId = setId || null;
  if (!SB.channel || !SB.user) return;
  SB.channel.track({ setId: SB.viewingSetId, email: SB.user.email });
}

function sbViewers(setId) {
  if (!SB.channel || !setId) return [];
  const me = (SB.user && SB.user.email) || '';
  const seen = new Set();
  const st = SB.channel.presenceState ? SB.channel.presenceState() : {};
  Object.keys(st).forEach(k => {
    (st[k] || []).forEach(p => {
      if (p && p.setId === setId && p.email && p.email !== me) seen.add(p.email);
    });
  });
  return [...seen];
}

/* ---------- Grokbot registry, run log and queue snapshot (supabase/bots.sql) ----------
   Kept apart from the sets/state_kv machinery on purpose. Run reports are append-only
   and never pass through sbSaveDirty, so nothing here can collide with -- or be blocked
   by -- the passage-set save path and its content guard. If the tables are missing
   (migration not run), BOTSB.available goes false and the Board falls back to the
   old checkbox behaviour instead of breaking. */
const BOT_COLS = 'bot_key,name,job,grok_agent_id,work_type,queue_source,surfaces,active_days,'
  + 'active_start,active_end,sort,token_issued_at,archived_at,updated_at,updated_by,category';
const RUN_COLS = 'id,bot_key,run_date,status,started_at,finished_at,done_today,counts,'
  + 'highlights,blockers,outputs,source,submitted_by,received_at,message,reported_at,kind,attention,notes';
const QUEUE_COLS = 'bot_key,remaining,places,rows,brief,computed_at,computed_by';
const BOTSB = {
  available: null,          // null = not loaded yet; false = unavailable, use the old Board
  bots: [],
  runs: [],
  queue: new Map(),         // bot_key -> snapshot row
  queueSig: new Map(),      // bot_key -> stable JSON last known on the server
  channel: null,
  onChange: null,
  error: '',
};

function sbTableMissing(err) {
  const m = String((err && err.code) || '') + ' ' + String((err && err.message) || '');
  return /PGRST205|PGRST202|42P01|42883|does not exist|schema cache/i.test(m);
}
// jsonb reorders object keys, so compare snapshots with stableStringify, never JSON.stringify.
function botQueueSig(x) {
  return stableStringify([x.remaining, x.places, x.rows || [], x.brief || '']);
}

async function sbLoadBots(sinceDate) {
  const c = sbInit();
  if (!c || !SB.user) { BOTSB.available = false; return false; }
  const fail = err => {
    BOTSB.available = false;
    BOTSB.error = sbTableMissing(err) ? 'run-log tables are not installed' : String(err.message || err);
    return false;
  };
  const b = await c.from('bots').select(BOT_COLS).order('sort').order('bot_key');
  if (b.error) return fail(b.error);
  const runs = [];
  // PostgREST caps a page at 1,000 rows without saying so -- page until a short one.
  for (let from = 0; ; from += 1000) {
    const r = await c.from('bot_runs').select(RUN_COLS).gte('run_date', sinceDate)
      .order('id').range(from, from + 999);
    if (r.error) return fail(r.error);
    runs.push.apply(runs, r.data);
    if (r.data.length < 1000) break;
  }
  const q = await c.from('bot_queue').select(QUEUE_COLS);
  if (q.error) return fail(q.error);
  BOTSB.bots = b.data;
  BOTSB.runs = runs;
  BOTSB.queue = new Map(q.data.map(x => [x.bot_key, x]));
  BOTSB.queueSig = new Map(q.data.map(x => [x.bot_key, botQueueSig(x)]));
  BOTSB.available = true;
  BOTSB.error = '';
  return true;
}

let botNotifyTimer = null;
function sbNotifyBots() {
  clearTimeout(botNotifyTimer);
  botNotifyTimer = setTimeout(() => { if (typeof BOTSB.onChange === 'function') BOTSB.onChange(); }, 150);
}

function sbSubscribeBots(onChange) {
  const c = sbInit();
  if (!c || !BOTSB.available) return;
  BOTSB.onChange = onChange;
  if (BOTSB.channel) c.removeChannel(BOTSB.channel);
  BOTSB.channel = c.channel('bots-board')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bots' }, p => {
      const r = p.new;
      if (!r || !r.bot_key) return;
      if (p.old && p.old.bot_key && p.old.bot_key !== r.bot_key) botRekeyLocal(p.old.bot_key, r.bot_key);
      const i = BOTSB.bots.findIndex(x => x.bot_key === r.bot_key);
      if (i >= 0) BOTSB.bots[i] = Object.assign({}, BOTSB.bots[i], r); else BOTSB.bots.push(r);
      sbNotifyBots();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bot_runs' }, p => {
      const r = p.new;
      if (!r || !r.id || BOTSB.runs.some(x => x.id === r.id)) return;   // our own insert, already in
      BOTSB.runs.push(r);
      sbNotifyBots();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bot_queue' }, p => {
      const r = p.new;
      if (!r || !r.bot_key) return;
      BOTSB.queue.set(r.bot_key, r);
      BOTSB.queueSig.set(r.bot_key, botQueueSig(r));
      sbNotifyBots();
    })
    .subscribe();
}

// A Board tick is a run report like any other, source 'board'. The server stamps who
// and when; the client's claim of either is ignored.
async function sbTickBot(botKey, runDate, done) {
  const c = sbInit();
  if (!c || !SB.user) return { error: 'not signed in' };
  const { data, error } = await c.from('bot_runs').insert({
    bot_key: botKey, run_date: runDate, status: done ? 'done' : 'working', done_today: !!done,
    source: 'board', submitted_by: SB.user.email,
    highlights: [done ? 'Marked done on the Board' : 'Done tick removed on the Board'],
  }).select(RUN_COLS).single();
  if (error) return { error: error.message };
  if (!BOTSB.runs.some(x => x.id === data.id)) BOTSB.runs.push(data);
  return { run: data };
}

async function sbSaveBot(row, isNew) {
  const c = sbInit();
  if (!c || !SB.user) return { error: 'not signed in' };
  const payload = Object.assign({}, row, { updated_by: sbActor() });
  // The key is how an update finds its row, never a field it changes.
  if (!isNew) delete payload.bot_key;
  const q = isNew ? c.from('bots').insert(payload)
                  : c.from('bots').update(payload).eq('bot_key', row.bot_key);
  const { data, error } = await q.select(BOT_COLS).single();
  if (error) return { error: error.message };
  const i = BOTSB.bots.findIndex(x => x.bot_key === data.bot_key);
  if (i >= 0) BOTSB.bots[i] = data; else BOTSB.bots.push(data);
  return { bot: data };
}

async function sbIssueBotToken(botKey) {
  const c = sbInit();
  if (!c || !SB.user) return { error: 'not signed in' };
  const { data, error } = await c.rpc('bot_issue_token', { p_bot_key: botKey });
  if (error) return { error: error.message };
  const b = BOTSB.bots.find(x => x.bot_key === botKey);
  if (b) b.token_issued_at = new Date().toISOString();
  return { token: data };
}

async function sbRevokeBotToken(botKey) {
  const c = sbInit();
  if (!c || !SB.user) return { error: 'not signed in' };
  const { error } = await c.rpc('bot_revoke_token', { p_bot_key: botKey });
  if (error) return { error: error.message };
  const b = BOTSB.bots.find(x => x.bot_key === botKey);
  if (b) b.token_issued_at = null;
  return { ok: true };
}

// Publish the app's live queue counts so bots can read them. Only rows whose content
// changed are written, so an open Board does not churn the table.
async function sbWriteBotQueues(list) {
  const c = sbInit();
  if (!c || !SB.user || !BOTSB.available) return { written: 0 };
  const changed = list.filter(x => BOTSB.queueSig.get(x.bot_key) !== botQueueSig(x));
  if (!changed.length) return { written: 0 };
  const { data, error } = await c.from('bot_queue').upsert(changed, { onConflict: 'bot_key' })
    .select(QUEUE_COLS);
  if (error) return { error: error.message, written: 0 };
  (data || []).forEach(r => {
    BOTSB.queue.set(r.bot_key, r);
    BOTSB.queueSig.set(r.bot_key, botQueueSig(r));
  });
  return { written: changed.length };
}

// A key rename, mirrored locally. The server moves runs, token and queue by cascade;
// this keeps an open Board from showing the old key until the next reload.
function botRekeyLocal(oldKey, newKey) {
  BOTSB.bots = BOTSB.bots.filter(x => !(x.bot_key === oldKey && BOTSB.bots.some(y => y.bot_key === newKey)));
  BOTSB.bots.forEach(x => { if (x.bot_key === oldKey) x.bot_key = newKey; });
  BOTSB.runs.forEach(x => { if (x.bot_key === oldKey) x.bot_key = newKey; });
  if (BOTSB.queue.has(oldKey)) {
    const q = BOTSB.queue.get(oldKey);
    q.bot_key = newKey;
    BOTSB.queue.delete(oldKey);
    BOTSB.queue.set(newKey, q);
    BOTSB.queueSig.set(newKey, BOTSB.queueSig.get(oldKey));
    BOTSB.queueSig.delete(oldKey);
  }
}

async function sbRenameBot(oldKey, newKey) {
  const c = sbInit();
  if (!c || !SB.user) return { error: 'not signed in' };
  const { error } = await c.rpc('bot_rename', { p_old: oldKey, p_new: newKey });
  if (error) return { error: error.message };
  botRekeyLocal(oldKey, newKey);
  return { ok: true };
}

// A report posted by a signed-in teammate -- the paste box and "Post sample report".
// Same intake as a bot's token path, so it accepts exactly the same shape.
async function sbPostReport(report) {
  const c = sbInit();
  if (!c || !SB.user) return { error: 'not signed in' };
  const { data, error } = await c.rpc('bot_post_report', { p_report: report });
  if (error) return { error: error.message };
  // Fetch the stored row so it shows at once, whatever realtime is doing.
  const r = await c.from('bot_runs').select(RUN_COLS).eq('id', data.id).single();
  if (!r.error && r.data && !BOTSB.runs.some(x => x.id === r.data.id)) BOTSB.runs.push(r.data);
  return { result: data };
}
