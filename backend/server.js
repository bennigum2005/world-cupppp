const express  = require('express');
const cors     = require('cors');
const fs       = require('fs');
const path     = require('path');
const bcrypt   = require('bcryptjs');
const https    = require('https');

const app      = express();
const PORT     = process.env.PORT || 3000;
const ROOT     = path.resolve(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend');
const DB       = path.join(ROOT, 'db.json');
const ADMIN_PASS  = process.env.ADMIN_PASS  || 'worldcup2026';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const BDL_KEY     = process.env.BALLDONTLIE_KEY || '7613b730-f1ee-480b-8584-063f8ad5fc57';
const BDL_BASE    = 'https://api.balldontlie.io/fifa/worldcup/v1';

/* ── Middleware ── */
app.use(cors());
app.use(express.json());

/* ── Landing page at / (must be before static middleware) ── */
app.get('/', (req, res) => res.sendFile(path.join(FRONTEND, 'landing.html')));

/* ── Static files (css, js, images — but not auto-index.html) ── */
app.use(express.static(FRONTEND, { index: false }));

/* ══════════════════════════════════════
   DATA
══════════════════════════════════════ */
const DEMO_TEAMS = [
  {name:'Germany',flag:'de'},{name:'Scotland',flag:'gb-sct'},
  {name:'France',flag:'fr'},{name:'Egypt',flag:'eg'},
  {name:'Netherlands',flag:'nl'},{name:'Morocco',flag:'ma'},
  {name:'Spain',flag:'es'},{name:'Austria',flag:'at'},
  {name:'USA',flag:'us'},{name:'Bosnia',flag:'ba'},
  {name:'Belgium',flag:'be'},{name:'S. Korea',flag:'kr'},
  {name:'Colombia',flag:'co'},{name:'Croatia',flag:'hr'},
  {name:'Canada',flag:'ca'},{name:'Ivory Coast',flag:'ci'},
  {name:'Brazil',flag:'br'},{name:'Japan',flag:'jp'},
  {name:'England',flag:'gb-eng'},{name:'Senegal',flag:'sn'},
  {name:'Argentina',flag:'ar'},{name:'Ecuador',flag:'ec'},
  {name:'Portugal',flag:'pt'},{name:'Turkey',flag:'tr'},
  {name:'Mexico',flag:'mx'},{name:'Sweden',flag:'se'},
  {name:'Australia',flag:'au'},{name:'Norway',flag:'no'},
  {name:'Switzerland',flag:'ch'},{name:'Algeria',flag:'dz'},
  {name:'Uruguay',flag:'uy'},{name:'Iran',flag:'ir'},
];

const FLAG_MAP = {};
DEMO_TEAMS.forEach(t => FLAG_MAP[t.name] = t.flag);

const TEAM_MAP = {
  'Germany':'Germany','Scotland':'Scotland','France':'France','Egypt':'Egypt',
  'Netherlands':'Netherlands','Morocco':'Morocco','Spain':'Spain','Austria':'Austria',
  'United States':'USA','USA':'USA','Bosnia and Herzegovina':'Bosnia','Bosnia':'Bosnia',
  'Belgium':'Belgium','South Korea':'S. Korea','Korea Republic':'S. Korea',
  'Colombia':'Colombia','Croatia':'Croatia','Canada':'Canada',
  "Côte d'Ivoire":'Ivory Coast','Ivory Coast':'Ivory Coast',
  'Brazil':'Brazil','Japan':'Japan','England':'England','Senegal':'Senegal',
  'Argentina':'Argentina','Ecuador':'Ecuador','Portugal':'Portugal',
  'Turkey':'Turkey','Türkiye':'Turkey','Mexico':'Mexico','Sweden':'Sweden',
  'Australia':'Australia','Norway':'Norway','Switzerland':'Switzerland',
  'Algeria':'Algeria','Uruguay':'Uruguay','Iran':'Iran',
};

function readDB() {
  try {
    if (!fs.existsSync(DB)) {
      const init = { bracketState:{locked:false,tournamentStarted:false,teams:DEMO_TEAMS}, entries:[], results:{}, lastSync:null };
      fs.writeFileSync(DB, JSON.stringify(init, null, 2));
      return init;
    }
    const data = JSON.parse(fs.readFileSync(DB, 'utf8'));
    if (!data.bracketState) data.bracketState = { locked:false, tournamentStarted:false, teams:DEMO_TEAMS, activeRound:'r32' };
    if (!data.bracketState.teams || data.bracketState.teams.length < 32) data.bracketState.teams = DEMO_TEAMS;
    if (!data.bracketState.activeRound) data.bracketState.activeRound = 'r32';
    if (!data.results) data.results = {};
    if (!data.entries) data.entries = [];
    if (data.bracketState.tournamentStarted === undefined) data.bracketState.tournamentStarted = false;
    return data;
  } catch(e) {
    console.error('readDB error:', e.message);
    return { bracketState:{locked:false,tournamentStarted:false,teams:DEMO_TEAMS}, entries:[], results:{}, lastSync:null };
  }
}

function writeDB(data) {
  try { fs.writeFileSync(DB, JSON.stringify(data, null, 2)); }
  catch(e) { console.error('writeDB error:', e.message); }
}

function isAdmin(req)  { return req.headers['x-admin-pass'] === ADMIN_PASS; }
function isAdminAccount(email) { return ADMIN_EMAIL && ADMIN_EMAIL.toLowerCase() === email.toLowerCase(); }
function safeUser(e)   { const { passwordHash, ...rest } = e; return rest; }

/* ══════════════════════════════════════
   BALLDONTLIE SYNC
══════════════════════════════════════ */
function bdlFetch(p) {
  return new Promise((resolve, reject) => {
    https.get(`${BDL_BASE}${p}`, { headers:{ Authorization: BDL_KEY } }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { reject(e); } });
    }).on('error', reject);
  });
}

function normTeam(name) { return name ? (TEAM_MAP[name] || name) : null; }
function getFlag(name)  { return FLAG_MAP[name] || 'xx'; }

function getWinner(match) {
  if (match.status !== 'completed') return null;
  const home = match.home_team?.name, away = match.away_team?.name;
  if (!home || !away) return null;
  let hs = match.home_score ?? 0, as = match.away_score ?? 0;
  if (match.extra_time_home_score != null) { hs = match.extra_time_home_score; as = match.extra_time_away_score; }
  if (match.home_score_penalties != null)  { hs = match.home_score_penalties;  as = match.away_score_penalties; }
  const wn = hs > as ? normTeam(home) : normTeam(away);
  return wn ? { n: wn, f: getFlag(wn) } : null;
}

function stageToRound(s) {
  if (!s) return null; s = s.toLowerCase();
  if (s.includes('32'))    return 'r32';
  if (s.includes('16'))    return 'r16';
  if (s.includes('quarter')) return 'qf';
  if (s.includes('semi'))  return 'sf';
  if (s.includes('third') || s.includes('place')) return 'tp';
  if (s.includes('final')) return 'final';
  return null;
}

async function syncResults() {
  try {
    console.log('⚽ Syncing results...');
    const data = await bdlFetch('/matches?per_page=100');
    const completed = (data.data || []).filter(m => m.status === 'completed');
    if (!completed.length) { console.log('No completed matches yet.'); return; }

    const db = readDB();
    const teams = db.bracketState.teams;
    const lookup = {};
    const bracketMatches = [
      { id:'l_r16_0',t1:teams[0],t2:teams[1] },{ id:'l_r16_1',t1:teams[2],t2:teams[3] },
      { id:'l_r16_2',t1:teams[4],t2:teams[5] },{ id:'l_r16_3',t1:teams[6],t2:teams[7] },
      { id:'l_r16_4',t1:teams[8],t2:teams[9] },{ id:'l_r16_5',t1:teams[10],t2:teams[11] },
      { id:'l_r16_6',t1:teams[12],t2:teams[13] },{ id:'l_r16_7',t1:teams[14],t2:teams[15] },
      { id:'r_r16_0',t1:teams[16],t2:teams[17] },{ id:'r_r16_1',t1:teams[18],t2:teams[19] },
      { id:'r_r16_2',t1:teams[20],t2:teams[21] },{ id:'r_r16_3',t1:teams[22],t2:teams[23] },
      { id:'r_r16_4',t1:teams[24],t2:teams[25] },{ id:'r_r16_5',t1:teams[26],t2:teams[27] },
      { id:'r_r16_6',t1:teams[28],t2:teams[29] },{ id:'r_r16_7',t1:teams[30],t2:teams[31] },
    ];
    bracketMatches.forEach(bm => {
      if (!bm.t1 || !bm.t2) return;
      const k1 = `${bm.t1.name}|${bm.t2.name}`, k2 = `${bm.t2.name}|${bm.t1.name}`;
      lookup[k1] = bm.id; lookup[k2] = bm.id;
    });

    const newResults = { ...db.results };
    let updated = 0;
    for (const match of completed) {
      const winner = getWinner(match); if (!winner) continue;
      const hn = normTeam(match.home_team?.name), an = normTeam(match.away_team?.name);
      if (!hn || !an) continue;
      const matchId = lookup[`${hn}|${an}`];
      if (matchId) {
        if (!newResults[matchId] || newResults[matchId].n !== winner.n) {
          newResults[matchId] = { n: winner.n, f: winner.f };
          console.log(`✓ ${matchId}: ${winner.n}`);
          updated++;
        }
      } else {
        const round = stageToRound(match.stage?.name || '');
        if (round) { newResults[`${round}:${hn}:${an}`] = { n: winner.n, f: winner.f }; updated++; }
      }
    }
    if (updated > 0) { db.results = newResults; db.lastSync = new Date().toISOString(); writeDB(db); console.log(`✓ Synced ${updated} result(s)`); }
    else { console.log('No new results.'); }
  } catch(e) { console.error('Sync error:', e.message); }
}

setInterval(() => syncResults().catch(e => console.error('Sync interval error:', e)), 5 * 60 * 1000);
setTimeout(() => syncResults().catch(e => console.error('Sync startup error:', e)), 60000);

/* ══════════════════════════════════════
   AUTH
══════════════════════════════════════ */
app.post('/api/auth/register', async (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !phone || !password) return res.status(400).json({ error: 'All fields are required.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  const db = readDB();
  if (db.entries.find(e => e.email.toLowerCase() === email.toLowerCase()))
    return res.status(409).json({ error: 'An account with this email already exists.' });
  const norm = p => p.replace(/[\s\-()+.]/g, '');
  if (db.entries.find(e => norm(e.phone||'') === norm(phone)))
    return res.status(409).json({ error: 'An account with this phone number already exists.' });
  const passwordHash = await bcrypt.hash(password, 10);
  const entry = { name, email: email.toLowerCase(), phone, passwordHash, picks:{}, champion:null, locked:false, joined: new Date().toISOString() };
  db.entries.push(entry); writeDB(db);
  const safe = safeUser(entry); safe.isAdmin = isAdminAccount(entry.email);
  res.json({ user: safe });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  const db = readDB();
  const entry = db.entries.find(e => e.email === email.toLowerCase());
  if (!entry) return res.status(401).json({ error: 'No account found with that email.' });
  if (!entry.passwordHash) return res.status(401).json({ error: 'Please contact admin to reset your account.' });
  const match = await bcrypt.compare(password, entry.passwordHash);
  if (!match) return res.status(401).json({ error: 'Incorrect password.' });
  const safe = safeUser(entry); safe.isAdmin = isAdminAccount(entry.email);
  res.json({ user: safe });
});

/* ══════════════════════════════════════
   BRACKET STATE
══════════════════════════════════════ */
app.get('/api/bracket-state', (req, res) => res.json(readDB().bracketState));
app.put('/api/bracket-state', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  const db = readDB();
  const { locked, tournamentStarted, teams, activeRound } = req.body;
  if (locked !== undefined) db.bracketState.locked = !!locked;
  if (tournamentStarted !== undefined) db.bracketState.tournamentStarted = !!tournamentStarted;
  if (teams && teams.length === 32) db.bracketState.teams = teams;
  if (activeRound) db.bracketState.activeRound = activeRound;
  writeDB(db); res.json(db.bracketState);
});

/* ══════════════════════════════════════
   ENTRIES
══════════════════════════════════════ */
app.get('/api/entries', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  res.json(readDB().entries.map(safeUser));
});
app.get('/api/entries/:email', (req, res) => {
  const entry = readDB().entries.find(e => e.email === decodeURIComponent(req.params.email).toLowerCase());
  if (!entry) return res.status(404).json({ error: 'Not found.' });
  res.json(safeUser(entry));
});
app.put('/api/entries/:email/picks', (req, res) => {
  const { picks, champion } = req.body;
  const db = readDB();
  const idx = db.entries.findIndex(e => e.email === decodeURIComponent(req.params.email).toLowerCase());
  if (idx < 0) return res.status(404).json({ error: 'Entry not found.' });
  if (db.entries[idx].locked) return res.status(403).json({ error: 'Your picks are locked.' });
  if (db.bracketState.tournamentStarted) return res.status(403).json({ error: 'Tournament has started.' });
  db.entries[idx].picks = picks || {}; db.entries[idx].champion = champion || null;
  db.entries[idx].lastSaved = new Date().toISOString();
  writeDB(db); res.json({ ok: true });
});
app.put('/api/entries/:email/lock', (req, res) => {
  const db = readDB();
  const idx = db.entries.findIndex(e => e.email === decodeURIComponent(req.params.email).toLowerCase());
  if (idx < 0) return res.status(404).json({ error: 'Entry not found.' });
  if (db.bracketState.tournamentStarted) return res.status(403).json({ error: 'Tournament already started.' });
  db.entries[idx].locked = true; db.entries[idx].lockedAt = new Date().toISOString();
  writeDB(db); res.json({ ok: true });
});

/* ══════════════════════════════════════
   RESULTS
══════════════════════════════════════ */
app.get('/api/results', (req, res) => res.json(readDB().results));
app.put('/api/results', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  const db = readDB(); db.results = req.body.results || {}; writeDB(db); res.json({ ok: true });
});

/* ══════════════════════════════════════
   ADMIN
══════════════════════════════════════ */
app.post('/api/admin/verify', (req, res) => {
  if (req.body.pass === ADMIN_PASS) res.json({ ok: true });
  else res.status(401).json({ error: 'Wrong password' });
});
app.post('/api/admin/sync-results', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  await syncResults(); res.json({ ok: true, lastSync: readDB().lastSync });
});
app.get('/api/admin/sync-status', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  const db = readDB(); res.json({ lastSync: db.lastSync, resultCount: Object.keys(db.results).length });
});
app.put('/api/admin/entries/:email/reset', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  const db = readDB();
  const idx = db.entries.findIndex(e => e.email === decodeURIComponent(req.params.email).toLowerCase());
  if (idx < 0) return res.status(404).json({ error: 'Entry not found.' });
  db.entries[idx].picks = {}; db.entries[idx].champion = null;
  db.entries[idx].locked = false; db.entries[idx].lockedAt = null;
  db.entries[idx].lastSaved = new Date().toISOString();
  writeDB(db); res.json({ ok: true });
});
app.put('/api/admin/entries/:email/unlock', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  const db = readDB();
  const idx = db.entries.findIndex(e => e.email === decodeURIComponent(req.params.email).toLowerCase());
  if (idx < 0) return res.status(404).json({ error: 'Entry not found.' });
  db.entries[idx].locked = false; db.entries[idx].lockedAt = null;
  writeDB(db); res.json({ ok: true });
});
app.get('/api/reset-bracket', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  const db = readDB(); db.bracketState = { locked:false, tournamentStarted:false, teams:DEMO_TEAMS };
  writeDB(db); res.json({ ok: true });
});

/* ══════════════════════════════════════
   PUBLIC LEADERBOARD
   Returns name + score only (no picks detail)
══════════════════════════════════════ */
app.get('/api/leaderboard', (req, res) => {
  const db = readDB();
  const results = db.results || {};
  const scored = db.entries.map(e => {
    let score = 0;
    const picks = e.picks || {};
    for (const roundId of Object.keys(picks)) {
      const rPicks = picks[roundId] || {};
      const rResults = results[roundId] || {};
      for (const matchKey of Object.keys(rPicks)) {
        if (rPicks[matchKey] && rResults[matchKey] && rPicks[matchKey].n === rResults[matchKey].n) score++;
      }
    }
    return { name: e.name, email: e.email, score, locked: e.locked };
  }).sort((a,b) => b.score - a.score);
  res.json(scored);
});

/* ══════════════════════════════════════
   PAGE ROUTES
══════════════════════════════════════ */
app.get('/login',   (req, res) => res.sendFile(path.join(FRONTEND, 'login.html')));
app.get('/bracket', (req, res) => res.sendFile(path.join(FRONTEND, 'index.html')));
app.get('*',        (req, res) => res.sendFile(path.join(FRONTEND, 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`⚽ Running on port ${PORT}`);
  console.log(`🔄 Auto-syncing results every 5 minutes`);
});
