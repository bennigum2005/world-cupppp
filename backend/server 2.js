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
const ADMIN_PASS     = process.env.ADMIN_PASS     || 'worldcup2026';
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL     || '';
const BDL_KEY        = process.env.BALLDONTLIE_KEY || '7613b730-f1ee-480b-8584-063f8ad5fc57';
const BDL_BASE       = 'https://api.balldontlie.io/fifa/worldcup/v1';

app.use(cors());
app.use(express.json());

/* Root route must come BEFORE static middleware so landing.html wins at / */
app.get('/', (req, res) => res.sendFile(path.join(FRONTEND, 'landing.html')));

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

const DEMO_TEAMS = [
  {name:'Germany',flag:'🇩🇪'},{name:'Scotland',flag:'🏴󠁧󠁢󠁳󠁣󠁴󠁿'},
  {name:'France',flag:'🇫🇷'},{name:'Egypt',flag:'🇪🇬'},
  {name:'Netherlands',flag:'🇳🇱'},{name:'Morocco',flag:'🇲🇦'},
  {name:'Spain',flag:'🇪🇸'},{name:'Austria',flag:'🇦🇹'},
  {name:'USA',flag:'🇺🇸'},{name:'Bosnia',flag:'🇧🇦'},
  {name:'Belgium',flag:'🇧🇪'},{name:'S. Korea',flag:'🇰🇷'},
  {name:'Colombia',flag:'🇨🇴'},{name:'Croatia',flag:'🇭🇷'},
  {name:'Canada',flag:'🇨🇦'},{name:'Ivory Coast',flag:'🇨🇮'},
  {name:'Brazil',flag:'🇧🇷'},{name:'Japan',flag:'🇯🇵'},
  {name:'England',flag:'🏴󠁧󠁢󠁥󠁮󠁧󠁿'},{name:'Senegal',flag:'🇸🇳'},
  {name:'Argentina',flag:'🇦🇷'},{name:'Ecuador',flag:'🇪🇨'},
  {name:'Portugal',flag:'🇵🇹'},{name:'Turkey',flag:'🇹🇷'},
  {name:'Mexico',flag:'🇲🇽'},{name:'Sweden',flag:'🇸🇪'},
  {name:'Australia',flag:'🇦🇺'},{name:'Norway',flag:'🇳🇴'},
  {name:'Switzerland',flag:'🇨🇭'},{name:'Algeria',flag:'🇩🇿'},
  {name:'Uruguay',flag:'🇺🇾'},{name:'Iran',flag:'🇮🇷'},
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
  return data;
}
function writeDB(data) { fs.writeFileSync(DB, JSON.stringify(data, null, 2)); }
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
  const { name, email, phone, password } = req.body;
  if (!name || !email || !phone || !password)
    return res.status(400).json({ error: 'All fields are required.' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const db = readDB();
  const emailTaken = db.entries.find(e => e.email.toLowerCase() === email.toLowerCase());
  if (emailTaken) return res.status(409).json({ error: 'An account with this email already exists.' });

  const normalisePhone = p => p.replace(/[\s\-()+.]/g, '');
  const phoneTaken = db.entries.find(e => normalisePhone(e.phone || '') === normalisePhone(phone));
  if (phoneTaken) return res.status(409).json({ error: 'An account with this phone number already exists.' });

  const passwordHash = await bcrypt.hash(password, 10);
  const entry = { name, email: email.toLowerCase(), phone, passwordHash,
                  picks: {}, champion: null, locked: false, joined: new Date().toISOString() };
  db.entries.push(entry);
  writeDB(db);
  const safe = safeUser(entry);
  safe.isAdmin = isAdminAccount(entry.email);
  res.json({ user: safe });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  const db    = readDB();
  const entry = db.entries.find(e => e.email === email.toLowerCase());
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
  db.entries[idx].locked   = true;
  db.entries[idx].lockedAt = new Date().toISOString();
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
app.get('/bracket', (req, res) => res.sendFile(path.join(FRONTEND, 'index.html')));
app.get('*',        (req, res) => res.sendFile(path.join(FRONTEND, 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`⚽ Running on port ${PORT}`);
  console.log(`🔄 Auto-syncing results every 5 minutes`);
});
