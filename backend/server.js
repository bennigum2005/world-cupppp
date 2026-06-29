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
/* DATA_DIR lets db.json live on a persistent volume (e.g. a Railway volume
   mounted at /data) so user data survives redeploys/restarts. Falls back to
   the project folder for local dev. */
const DATA_DIR = process.env.DATA_DIR || ROOT;
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
const DB       = path.join(DATA_DIR, 'db.json');
const ADMIN_PASS     = process.env.ADMIN_PASS     || 'worldcup2026';
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL     || '';
const BDL_KEY        = process.env.BALLDONTLIE_KEY || '7613b730-f1ee-480b-8584-063f8ad5fc57';
const BDL_BASE       = 'https://api.balldontlie.io/fifa/worldcup/v1';

app.use(cors());
app.use(express.json());

/* ══════════════════════════════════════
   LAUNCH GATE
   Everyone sees a countdown until 05:00 GMT, Sun Jun 28 2026.
   Admin bypass: visit  /__enter?key=YOUR_KEY  once to set a 30-day cookie.
   Set BYPASS_KEY as an env var in production to keep it secret.
══════════════════════════════════════ */
const LAUNCH_TS  = Date.parse('2026-06-28T05:00:00Z');
const BYPASS_KEY = process.env.BYPASS_KEY || 'joiutherji-2026';

/* Never let HTML pages be cached (CDN/browser) — otherwise a stale homepage
   keeps showing instead of the countdown / live site. */
app.use((req, res, next) => {
  const p = req.path;
  if (p === '/' || p === '/login' || p === '/bracket' || p.endsWith('.html')) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  }
  next();
});

function hasBypass(req) {
  const cookie = req.headers.cookie || '';
  return cookie.split(';').some(c => c.trim() === 'wc_access=' + BYPASS_KEY);
}

/* Secret entrance — sets the bypass cookie, then sends you to the real site */
app.get('/__enter', (req, res) => {
  if (req.query.key === BYPASS_KEY) {
    res.setHeader('Set-Cookie', `wc_access=${BYPASS_KEY}; Path=/; Max-Age=2592000; SameSite=Lax`);
    return res.redirect('/');
  }
  res.status(404).send('Not found');
});

/* Clear the bypass cookie (so you can preview the countdown yourself) */
app.get('/__leave', (req, res) => {
  res.setHeader('Set-Cookie', 'wc_access=; Path=/; Max-Age=0; SameSite=Lax');
  res.send('Bypass cleared.');
});

/* ══════════════════════════════════════
   VISITOR COUNTER (unique browsers in last 24h)
   Stored in its own file so it never touches user data.
══════════════════════════════════════ */
const VISITS_FILE = path.join(DATA_DIR, 'visits.json');
let visitBuffer = [];
function readVisits(){ try { return JSON.parse(fs.readFileSync(VISITS_FILE, 'utf8')); } catch { return []; } }
function flushVisits(){
  if (!visitBuffer.length) return;
  const cutoff = Date.now() - 48 * 3600 * 1000;
  const all = readVisits().concat(visitBuffer).filter(v => v.ts >= cutoff);
  try { fs.writeFileSync(VISITS_FILE, JSON.stringify(all)); visitBuffer = []; } catch (e) {}
}
setInterval(flushVisits, 60 * 1000);

/* Count a "site open": an HTML page load (not assets or API calls) */
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api') &&
      (req.headers.accept || '').includes('text/html')) {
    const m = (req.headers.cookie || '').match(/wc_vid=([^;]+)/);
    let vid = m && m[1];
    if (!vid) {
      vid = Math.random().toString(36).slice(2) + Date.now().toString(36);
      res.setHeader('Set-Cookie', `wc_vid=${vid}; Path=/; Max-Age=31536000; SameSite=Lax`);
    }
    visitBuffer.push({ id: vid, ts: Date.now() });
  }
  next();
});

/* The gate: until launch, everyone without the cookie gets the countdown.
   Static assets (images/css/js/fonts) must pass through so the countdown
   page can actually load its own background image. */
const ASSET_RE = /\.(jpg|jpeg|png|webp|gif|svg|ico|css|js|mjs|woff2?|ttf|map)$/i;
app.use((req, res, next) => {
  if (Date.now() >= LAUNCH_TS) return next();   // launched — open to all
  if (hasBypass(req)) return next();            // admin bypass cookie present
  if (ASSET_RE.test(req.path)) return next();   // let assets (e.g. countdown_bg.jpg) load
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(FRONTEND, 'countdown.html'));
  }
  return res.status(503).json({ error: 'Leikurinn opnar 28. júní.' });
});

app.use(express.static(FRONTEND, { index: false }));

/* ══════════════════════════════════════
   TEAM NAME MAP
   Maps balldontlie team names → our bracket team names
   Add more as teams qualify
══════════════════════════════════════ */
const TEAM_MAP = {
  'Germany':       'Germany',    'Scotland':      'Scotland',
  'France':        'France',     'Egypt':         'Egypt',
  'Netherlands':   'Netherlands','Morocco':       'Morocco',
  'Spain':         'Spain',      'Austria':       'Austria',
  'United States': 'USA',        'USA':           'USA',
  'Bosnia and Herzegovina': 'Bosnia', 'Bosnia':  'Bosnia',
  'Belgium':       'Belgium',    'South Korea':   'S. Korea',
  'Korea Republic':'S. Korea',   'Colombia':      'Colombia',
  'Croatia':       'Croatia',    'Canada':        'Canada',
  "Côte d'Ivoire": 'Ivory Coast','Ivory Coast':  'Ivory Coast',
  'Brazil':        'Brazil',     'Japan':         'Japan',
  'England':       'England',    'Senegal':       'Senegal',
  'Argentina':     'Argentina',  'Ecuador':       'Ecuador',
  'Portugal':      'Portugal',   'Turkey':        'Turkey',
  'Türkiye':       'Turkey',     'Mexico':        'Mexico',
  'Sweden':        'Sweden',     'Australia':     'Australia',
  'Norway':        'Norway',     'Switzerland':   'Switzerland',
  'Algeria':       'Algeria',    'Uruguay':       'Uruguay',
  'Iran':          'Iran',
};

/* Match-type → our bracket round IDs */
const ROUND_MAP = {
  'Round of 32':    'r32',
  'Round of 16':    'r16',
  'Quarter-finals': 'qf',
  'Semi-finals':    'sf',
  'Third-place':    'tp',
  'Final':          'final',
};

/* Real 2026 World Cup Round of 32 bracket (correct slot order) */
const DEMO_TEAMS = [
  {name:'Germany',flag:'de'},      {name:'Paraguay',flag:'py'},
  {name:'France',flag:'fr'},       {name:'Sweden',flag:'se'},
  {name:'Canada',flag:'ca'},       {name:'South Africa',flag:'za'},
  {name:'Netherlands',flag:'nl'},  {name:'Morocco',flag:'ma'},
  {name:'Portugal',flag:'pt'},     {name:'Croatia',flag:'hr'},
  {name:'Spain',flag:'es'},        {name:'Austria',flag:'at'},
  {name:'USA',flag:'us'},          {name:'Bosnia',flag:'ba'},
  {name:'Belgium',flag:'be'},      {name:'Senegal',flag:'sn'},
  {name:'Brazil',flag:'br'},       {name:'Japan',flag:'jp'},
  {name:'Ivory Coast',flag:'ci'},  {name:'Norway',flag:'no'},
  {name:'Mexico',flag:'mx'},       {name:'Ecuador',flag:'ec'},
  {name:'England',flag:'gb-eng'},  {name:'DR Congo',flag:'cd'},
  {name:'Argentina',flag:'ar'},    {name:'Cape Verde',flag:'cv'},
  {name:'Egypt',flag:'eg'},        {name:'Australia',flag:'au'},
  {name:'Switzerland',flag:'ch'},  {name:'Algeria',flag:'dz'},
  {name:'Colombia',flag:'co'},     {name:'Ghana',flag:'gh'},
];

/* Flag lookup by name */
const FLAG_MAP = {};
DEMO_TEAMS.forEach(t => FLAG_MAP[t.name] = t.flag);

function readDB() {
  if (!fs.existsSync(DB))
    fs.writeFileSync(DB, JSON.stringify({
      bracketState: { locked: false, tournamentStarted: false, teams: DEMO_TEAMS },
      entries: [], results: {}, lastSync: null
    }, null, 2));
  const data = JSON.parse(fs.readFileSync(DB, 'utf8'));
  if (!data.bracketState.teams || data.bracketState.teams.length < 32) data.bracketState.teams = DEMO_TEAMS;
  if (!data.results)  data.results = {};
  if (data.bracketState.tournamentStarted === undefined) data.bracketState.tournamentStarted = false;
  /* back-fill: entries locked before lockedRound existed are treated as locked for round 1 */
  (data.entries || []).forEach(e => { if (e.locked && !e.lockedRound) e.lockedRound = 'r32'; });
  return data;
}
function writeDB(data) { fs.writeFileSync(DB, JSON.stringify(data, null, 2)); }

/* Force the stored bracket to the official R32 teams once, on deploy.
   Bump TEAMS_VERSION to push a new lineup. Accounts & picks are untouched. */
const TEAMS_VERSION = 4;
(function ensureOfficialTeams(){
  try {
    const db = readDB();
    if (db.bracketState.teamsVersion !== TEAMS_VERSION) {
      db.bracketState.teams = DEMO_TEAMS;
      db.bracketState.teamsVersion = TEAMS_VERSION;
      writeDB(db);
      console.log('⚽ Bracket set to official 2026 R32 (teams v' + TEAMS_VERSION + ')');
    }
  } catch (e) { console.error('Team migration failed:', e.message); }
})();

/* One-time: Ghana and Croatia were swapped — flip them in everyone's picks. */
const PICKS_FIX_VERSION = 1;
(function swapGhanaCroatiaInPicks(){
  try {
    const db = readDB();
    if (db.picksFixVersion === PICKS_FIX_VERSION) return;
    const swap = (t) => {
      if (!t || !t.n) return t;
      if (t.n === 'Ghana')   return { n: 'Croatia', f: 'hr' };
      if (t.n === 'Croatia') return { n: 'Ghana',   f: 'gh' };
      return t;
    };
    (db.entries || []).forEach(e => {
      if (e.picks) for (const k in e.picks) e.picks[k] = swap(e.picks[k]);
      if (e.champion) e.champion = swap(e.champion);
    });
    db.picksFixVersion = PICKS_FIX_VERSION;
    writeDB(db);
    console.log('✓ Swapped Ghana<->Croatia in all picks');
  } catch (e) { console.error('Picks fix failed:', e.message); }
})();

/* One-time: bracket corrected (Belgium–Senegal, England–DR Congo, Switzerland–Algeria).
   Remove picks for teams no longer in those matches, and any pick for eliminated
   teams (S. Korea, Iran), so players re-pick the correct matchups. */
const PICKS_FIX2 = 1;
(function clearInvalidPicks(){
  try {
    const db = readDB();
    if (db.picksFix2 === PICKS_FIX2) return;
    const removed = ['S. Korea', 'Iran'];
    const validInMatch = {
      'l_r16_7': ['Belgium', 'Senegal'],
      'r_r16_3': ['England', 'DR Congo'],
      'r_r16_6': ['Switzerland', 'Algeria'],
    };
    (db.entries || []).forEach(e => {
      if (e.picks) {
        for (const mid in e.picks) {
          const p = e.picks[mid];
          if (!p || !p.n) continue;
          if (removed.includes(p.n)) { delete e.picks[mid]; continue; }
          if (validInMatch[mid] && !validInMatch[mid].includes(p.n)) delete e.picks[mid];
        }
      }
      if (e.champion && removed.includes(e.champion.n)) e.champion = null;
    });
    db.picksFix2 = PICKS_FIX2;
    writeDB(db);
    console.log('✓ Cleared invalid picks after bracket correction');
  } catch (e) { console.error('Picks fix2 failed:', e.message); }
})();

/* One-time: close all brackets now — nobody can change picks.
   Runs once; admin can still "Reopen picks" later if needed. */
const LOCK_NOW_VERSION = 1;
(function lockAllPicksNow(){
  try {
    const db = readDB();
    if (db.lockNowVersion === LOCK_NOW_VERSION) return;
    db.bracketState.tournamentStarted = true;
    db.lockNowVersion = LOCK_NOW_VERSION;
    writeDB(db);
    console.log('🔒 All picks locked (closed for everyone)');
  } catch (e) { console.error('Lock-now failed:', e.message); }
})();

function isAdmin(req)  { return req.headers['x-admin-pass'] === ADMIN_PASS; }
function isAdminAccount(email) { return ADMIN_EMAIL && ADMIN_EMAIL.toLowerCase() === email.toLowerCase(); }
function safeUser(e)   { const { passwordHash, ...rest } = e; return rest; }

/* ══════════════════════════════════════
   BALLDONTLIE AUTO-SYNC
══════════════════════════════════════ */
function bdlFetch(path) {
  return new Promise((resolve, reject) => {
    const url = `${BDL_BASE}${path}`;
    const opts = { headers: { 'Authorization': BDL_KEY } };
    https.get(url, opts, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function normTeam(name) {
  if (!name) return null;
  return TEAM_MAP[name] || name;
}

function getFlag(name) {
  return FLAG_MAP[name] || '🏳';
}

/* Determine winner from scores (including penalties) */
function getWinner(match) {
  if (match.status !== 'completed') return null;
  const home = match.home_team?.name;
  const away = match.away_team?.name;
  if (!home || !away) return null;

  let hs = match.home_score ?? 0;
  let as = match.away_score ?? 0;

  /* extra time */
  if (match.extra_time_home_score != null) {
    hs = match.extra_time_home_score;
    as = match.extra_time_away_score;
  }
  /* penalties */
  if (match.home_score_penalties != null) {
    hs = match.home_score_penalties;
    as = match.away_score_penalties;
  }

  const winnerName = hs > as ? normTeam(home) : normTeam(away);
  if (!winnerName) return null;
  return { n: winnerName, f: getFlag(winnerName) };
}

/* Map BDL stage name to our round keys */
function stageToRound(stageName) {
  if (!stageName) return null;
  const s = stageName.toLowerCase();
  if (s.includes('32'))         return 'r32';
  if (s.includes('16'))         return 'r16';
  if (s.includes('quarter'))    return 'qf';
  if (s.includes('semi'))       return 'sf';
  if (s.includes('third') || s.includes('place')) return 'tp';
  if (s.includes('final'))      return 'final';
  return null;
}

async function syncResults() {
  try {
    console.log('⚽ Syncing results from balldontlie...');
    const data = await bdlFetch('/matches?per_page=100');
    const matches = data.data || [];

    const completed = matches.filter(m => m.status === 'completed');
    if (!completed.length) { console.log('No completed matches yet.'); return; }

    const db = readDB();
    const teams = db.bracketState.teams;

    /* Build a lookup: "TeamA vs TeamB" → bracket match ID */
    function buildMatchLookup() {
      const lookup = {};

      /* Our bracket match IDs and their teams */
      const bracketMatches = [
        /* Left R16 */
        { id:'l_r16_0', t1:teams[0],  t2:teams[1]  },
        { id:'l_r16_1', t1:teams[2],  t2:teams[3]  },
        { id:'l_r16_2', t1:teams[4],  t2:teams[5]  },
        { id:'l_r16_3', t1:teams[6],  t2:teams[7]  },
        { id:'l_r16_4', t1:teams[8],  t2:teams[9]  },
        { id:'l_r16_5', t1:teams[10], t2:teams[11] },
        { id:'l_r16_6', t1:teams[12], t2:teams[13] },
        { id:'l_r16_7', t1:teams[14], t2:teams[15] },
        /* Right R16 */
        { id:'r_r16_0', t1:teams[16], t2:teams[17] },
        { id:'r_r16_1', t1:teams[18], t2:teams[19] },
        { id:'r_r16_2', t1:teams[20], t2:teams[21] },
        { id:'r_r16_3', t1:teams[22], t2:teams[23] },
        { id:'r_r16_4', t1:teams[24], t2:teams[25] },
        { id:'r_r16_5', t1:teams[26], t2:teams[27] },
        { id:'r_r16_6', t1:teams[28], t2:teams[29] },
        { id:'r_r16_7', t1:teams[30], t2:teams[31] },
      ];

      bracketMatches.forEach(bm => {
        if (!bm.t1 || !bm.t2) return;
        const key1 = `${bm.t1.name}|${bm.t2.name}`;
        const key2 = `${bm.t2.name}|${bm.t1.name}`;
        lookup[key1] = bm.id;
        lookup[key2] = bm.id;
      });

      /* Also add results-based matches (QF, SF, Final) using stored results */
      return lookup;
    }

    const lookup = buildMatchLookup();
    const newResults = { ...db.results };
    let updated = 0;

    for (const match of completed) {
      const winner = getWinner(match);
      if (!winner) continue;

      const homeName = normTeam(match.home_team?.name);
      const awayName = normTeam(match.away_team?.name);
      if (!homeName || !awayName) continue;

      /* Try to find this match in our bracket by team names */
      const key = `${homeName}|${awayName}`;
      let matchId = lookup[key];

      /* If not in R16 lookup, scan results to find QF/SF/Final matches */
      if (!matchId) {
        /* Build a bracket state in memory to find later round match IDs */
        const round = stageToRound(match.stage?.name || '');

        /* For later rounds, find the match ID where both teams exist */
        /* We do this by checking all possible match IDs for that round */
        const roundPrefixes = {
          'qf':    ['l_qf_', 'r_qf_'],
          'sf':    ['l_sf_', 'r_sf_'],
          'sff':   ['l_sff', 'r_sff'],
          'final': ['final'],
          'tp':    ['third'],
        };

        /* Check if already stored */
        for (const [id, res] of Object.entries(newResults)) {
          /* Skip — we'll match by winner name instead */
        }

        /* Store by a composite key until we can match to bracket ID */
        /* Use stage+teams as key for later rounds */
        if (round) {
          const compositeKey = `${round}:${homeName}:${awayName}`;
          newResults[compositeKey] = { n: winner.n, f: winner.f };
          updated++;
        }
        continue;
      }

      if (!newResults[matchId] || newResults[matchId].n !== winner.n) {
        newResults[matchId] = { n: winner.n, f: winner.f };
        console.log(`✓ ${matchId}: ${winner.n} wins`);
        updated++;
      }
    }

    if (updated > 0) {
      db.results = newResults;
      db.lastSync = new Date().toISOString();
      writeDB(db);
      console.log(`✓ Synced ${updated} result(s)`);
    } else {
      console.log('No new results to update.');
    }
  } catch(e) {
    console.error('Sync error:', e.message);
  }
}

/* Run sync every 5 minutes */
setInterval(syncResults, 5 * 60 * 1000);
/* Also run once at startup after 10 seconds */
setTimeout(syncResults, 10000);

/* ══════════════════════════════════════
   AUTH ROUTES
══════════════════════════════════════ */
app.post('/api/auth/register', async (req, res) => {
  const { name, phone, password, newsletter } = req.body;
  const email = (req.body.email || '').trim().toLowerCase();
  if (!name || !email || !phone || !password)
    return res.status(400).json({ error: 'All fields are required.' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const db = readDB();
  const emailTaken = db.entries.find(e => (e.email || '').trim().toLowerCase() === email);
  if (emailTaken) return res.status(409).json({ error: 'An account with this email already exists.' });

  const normalisePhone = p => p.replace(/[\s\-()+.]/g, '');
  const phoneTaken = db.entries.find(e => normalisePhone(e.phone || '') === normalisePhone(phone));
  if (phoneTaken) return res.status(409).json({ error: 'An account with this phone number already exists.' });

  const passwordHash = await bcrypt.hash(password, 10);
  const entry = { name, email, phone, passwordHash,
                  picks: {}, champion: null, locked: false, joined: new Date().toISOString(),
                  newsletter: !!newsletter, newsletterAt: newsletter ? new Date().toISOString() : null };
  db.entries.push(entry);
  writeDB(db);
  const safe = safeUser(entry);
  safe.isAdmin = isAdminAccount(entry.email);
  res.json({ user: safe });
});

app.post('/api/auth/login', async (req, res) => {
  const { password } = req.body;
  const email = (req.body.email || '').trim().toLowerCase();
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  const db    = readDB();
  const entry = db.entries.find(e => (e.email || '').trim().toLowerCase() === email);
  if (!entry) return res.status(401).json({ error: 'No account found with that email.' });
  if (!entry.passwordHash) return res.status(401).json({ error: 'Please contact admin to reset your account.' });
  const match = await bcrypt.compare(password, entry.passwordHash);
  if (!match) return res.status(401).json({ error: 'Incorrect password.' });
  const safe = safeUser(entry);
  safe.isAdmin = isAdminAccount(entry.email);
  res.json({ user: safe });
});

/* ══════════════════════════════════════
   BRACKET STATE
══════════════════════════════════════ */
app.get('/api/bracket-state', (req, res) => res.json(readDB().bracketState));
app.put('/api/bracket-state', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  const db = readDB();
  const { locked, tournamentStarted, teams } = req.body;
  if (locked !== undefined) db.bracketState.locked = !!locked;
  if (tournamentStarted !== undefined) db.bracketState.tournamentStarted = !!tournamentStarted;
  if (teams && teams.length === 32) db.bracketState.teams = teams;
  writeDB(db); res.json(db.bracketState);
});

/* ══════════════════════════════════════
   ENTRIES
══════════════════════════════════════ */
app.get('/api/entries', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  res.json(readDB().entries.map(safeUser));
});

/* Public leaderboard — names, points, lock status only (no emails/phones) */
app.get('/api/leaderboard', (req, res) => {
  const db = readDB();
  const results = db.results || {};
  const board = (db.entries || []).map(e => {
    const picks = e.picks || {};
    let score = 0;
    if (e.locked) {                              // only locked brackets earn points
      for (const id in results) {
        if (picks[id] && results[id] && picks[id].n === results[id].n) score++;
      }
    }
    return { name: e.name, score, locked: !!e.locked };
  }).sort((a, b) => {
    if (a.locked !== b.locked) return a.locked ? -1 : 1;  // locked players ranked first
    return b.score - a.score;                              // then by points
  });
  res.json(board);
});

app.get('/api/entries/:email', (req, res) => {
  const db    = readDB();
  const entry = db.entries.find(e => e.email === decodeURIComponent(req.params.email).toLowerCase());
  if (!entry) return res.status(404).json({ error: 'Not found.' });
  res.json(safeUser(entry));
});

app.put('/api/entries/:email/picks', (req, res) => {
  const { picks, champion } = req.body;
  const db  = readDB();
  const idx = db.entries.findIndex(e => e.email === decodeURIComponent(req.params.email).toLowerCase());
  if (idx < 0) return res.status(404).json({ error: 'Entry not found.' });
  if (db.entries[idx].locked) return res.status(403).json({ error: 'Your picks are locked.' });
  if (db.bracketState.tournamentStarted) return res.status(403).json({ error: 'Tournament has started.' });
  db.entries[idx].picks     = picks    || {};
  db.entries[idx].champion  = champion || null;
  db.entries[idx].lastSaved = new Date().toISOString();
  writeDB(db); res.json({ ok: true });
});

app.put('/api/entries/:email/lock', (req, res) => {
  const db  = readDB();
  const idx = db.entries.findIndex(e => e.email === decodeURIComponent(req.params.email).toLowerCase());
  if (idx < 0) return res.status(404).json({ error: 'Entry not found.' });
  if (db.bracketState.tournamentStarted) return res.status(403).json({ error: 'Tournament already started.' });
  db.entries[idx].locked      = true;
  db.entries[idx].lockedRound = req.body.round || db.entries[idx].lockedRound || 'r32';
  db.entries[idx].lockedAt    = new Date().toISOString();
  writeDB(db); res.json({ ok: true });
});

/* ══════════════════════════════════════
   RESULTS
══════════════════════════════════════ */
app.get('/api/results', (req, res) => res.json(readDB().results));

app.put('/api/results', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  const db = readDB();
  db.results = req.body.results || {};
  writeDB(db); res.json({ ok: true });
});

/* Admin: set or clear the winner of a single match (manual override) */
app.post('/api/admin/set-result', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  const { matchId, team } = req.body;
  if (!matchId) return res.status(400).json({ error: 'matchId required' });
  const db = readDB();
  if (team && team.n) db.results[matchId] = { n: team.n, f: team.f };
  else delete db.results[matchId];
  writeDB(db); res.json({ ok: true, results: db.results });
});

/* Manual trigger for admin */
app.post('/api/admin/sync-results', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  await syncResults();
  res.json({ ok: true, lastSync: readDB().lastSync });
});

app.get('/api/admin/sync-status', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  const db = readDB();
  res.json({ lastSync: db.lastSync, resultCount: Object.keys(db.results).length });
});

/* ══════════════════════════════════════
   ADMIN ROUTES
══════════════════════════════════════ */
app.post('/api/admin/verify', (req, res) => {
  if (req.body.pass === ADMIN_PASS) res.json({ ok: true });
  else res.status(401).json({ error: 'Wrong password' });
});

/* Storage diagnostic — open in your (bypassed) browser:
   /api/__diag?key=YOUR_ADMIN_PASS   → shows if persistence is actually on */
app.get('/api/__diag', (req, res) => {
  if (req.query.key !== ADMIN_PASS) return res.status(404).send('Not found');
  let dbExists = false, entryCount = 0, writable = false;
  try { dbExists = fs.existsSync(DB); } catch (e) {}
  try { entryCount = (readDB().entries || []).length; } catch (e) {}
  try { fs.accessSync(DATA_DIR, fs.constants.W_OK); writable = true; } catch (e) {}
  res.json({
    persistenceConfigured: !!process.env.DATA_DIR,   // true ONLY if DATA_DIR variable is set
    DATA_DIR_value: DATA_DIR,
    dbPath: DB,
    dbFileExists: dbExists,
    dataDirWritable: writable,
    entryCount: entryCount
  });
});

/* Visitor stats: unique browsers that opened the site in the last 24h */
app.get('/api/admin/stats', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const recent = readVisits().concat(visitBuffer).filter(v => v.ts >= dayAgo);
  res.json({
    uniqueVisitors24h: new Set(recent.map(v => v.id)).size,
    totalOpens24h: recent.length
  });
});

/* Download a full backup of the database (users, picks, results) as a file */
app.get('/api/admin/backup', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  const db = readDB();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  res.setHeader('Content-Disposition', `attachment; filename="worldcup-backup-${stamp}.json"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(db, null, 2));
});

/* Restore the database from an uploaded backup file (replaces everything) */
app.post('/api/admin/restore', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  const data = req.body;
  if (!data || !Array.isArray(data.entries) || !data.bracketState) {
    return res.status(400).json({ error: 'That does not look like a valid backup file.' });
  }
  /* keep a safety copy of what we are about to overwrite */
  try { fs.copyFileSync(DB, DB + '.prev'); } catch (e) {}
  writeDB(data);
  res.json({ ok: true, entries: data.entries.length });
});

app.put('/api/admin/entries/:email/reset', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  const db  = readDB();
  const idx = db.entries.findIndex(e => e.email === decodeURIComponent(req.params.email).toLowerCase());
  if (idx < 0) return res.status(404).json({ error: 'Entry not found.' });
  db.entries[idx].picks     = {};
  db.entries[idx].champion  = null;
  db.entries[idx].locked    = false;
  db.entries[idx].lockedAt  = null;
  db.entries[idx].lastSaved = new Date().toISOString();
  writeDB(db); res.json({ ok: true });
});

app.put('/api/admin/entries/:email/unlock', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  const db  = readDB();
  const idx = db.entries.findIndex(e => e.email === decodeURIComponent(req.params.email).toLowerCase());
  if (idx < 0) return res.status(404).json({ error: 'Entry not found.' });
  db.entries[idx].locked   = false;
  db.entries[idx].lockedAt = null;
  writeDB(db); res.json({ ok: true });
});

app.get('/api/reset-bracket', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  const db = readDB();
  db.bracketState = { locked: false, tournamentStarted: false, teams: DEMO_TEAMS };
  writeDB(db); res.json({ ok: true });
});

/* ── serve pages ── */
app.get('/login',   (req, res) => res.sendFile(path.join(FRONTEND, 'login.html')));
app.get('/skilmalar',(req, res) => res.sendFile(path.join(FRONTEND, 'skilmalar.html')));
app.get('/bracket', (req, res) => res.sendFile(path.join(FRONTEND, 'index.html')));
app.get('/',        (req, res) => res.sendFile(path.join(FRONTEND, 'landing.html')));
app.get('*',        (req, res) => res.sendFile(path.join(FRONTEND, 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`⚽ Running on port ${PORT}`);
  console.log(`🔄 Auto-syncing results every 5 minutes`);
});
