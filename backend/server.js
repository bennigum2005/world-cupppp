const express  = require('express');
const cors     = require('cors');
const fs       = require('fs');
const path     = require('path');
const bcrypt   = require('bcryptjs');

const app      = express();
const PORT     = process.env.PORT || 3000;
const ROOT     = path.resolve(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend');
const DB       = path.join(ROOT, 'db.json');
const ADMIN_PASS = process.env.ADMIN_PASS || 'worldcup2026';

app.use(cors());
app.use(express.json());
app.use(express.static(FRONTEND));

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

function readDB() {
  if (!fs.existsSync(DB))
    fs.writeFileSync(DB, JSON.stringify({
      bracketState: { locked: false, tournamentStarted: false, teams: DEMO_TEAMS },
      entries: [], results: {}
    }, null, 2));
  const data = JSON.parse(fs.readFileSync(DB, 'utf8'));
  if (!data.bracketState.teams || data.bracketState.teams.length < 32) data.bracketState.teams = DEMO_TEAMS;
  if (!data.results) data.results = {};
  if (data.bracketState.tournamentStarted === undefined) data.bracketState.tournamentStarted = false;
  return data;
}
function writeDB(data) { fs.writeFileSync(DB, JSON.stringify(data, null, 2)); }
function isAdmin(req) { return req.headers['x-admin-pass'] === ADMIN_PASS; }

/* safe user object — never send password hash to client */
function safeUser(e) {
  const { passwordHash, ...rest } = e;
  return rest;
}

/* ══════════════════════════════════════
   AUTH ROUTES
══════════════════════════════════════ */

/* POST /api/auth/register */
app.post('/api/auth/register', async (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !phone || !password)
    return res.status(400).json({ error: 'All fields are required.' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const db  = readDB();

  const emailTaken = db.entries.find(e => e.email.toLowerCase() === email.toLowerCase());
  if (emailTaken)
    return res.status(409).json({ error: 'An account with this email already exists.' });

  const normalisePhone = p => p.replace(/[\s\-().+]/g, '');
  const phoneTaken = db.entries.find(e => normalisePhone(e.phone || '') === normalisePhone(phone));
  if (phoneTaken)
    return res.status(409).json({ error: 'An account with this phone number already exists.' });

  const passwordHash = await bcrypt.hash(password, 10);
  const entry = {
    name, email: email.toLowerCase(), phone,
    passwordHash,
    picks: {}, champion: null,
    locked: false, joined: new Date().toISOString()
  };
  db.entries.push(entry);
  writeDB(db);
  res.json({ user: safeUser(entry) });
});

/* POST /api/auth/login */
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required.' });

  const db  = readDB();
  const entry = db.entries.find(e => e.email === email.toLowerCase());
  if (!entry)
    return res.status(401).json({ error: 'No account found with that email.' });
  if (!entry.passwordHash)
    return res.status(401).json({ error: 'This account was created before passwords were added. Please contact admin.' });

  const match = await bcrypt.compare(password, entry.passwordHash);
  if (!match)
    return res.status(401).json({ error: 'Incorrect password.' });

  res.json({ user: safeUser(entry) });
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

/* GET own entry by email (authenticated) */
app.get('/api/entries/:email', (req, res) => {
  const db  = readDB();
  const entry = db.entries.find(e => e.email === decodeURIComponent(req.params.email).toLowerCase());
  if (!entry) return res.status(404).json({ error: 'Not found.' });
  res.json(safeUser(entry));
});

/* Save picks */
app.put('/api/entries/:email/picks', (req, res) => {
  const { picks, champion } = req.body;
  const db  = readDB();
  const idx = db.entries.findIndex(e => e.email === decodeURIComponent(req.params.email).toLowerCase());
  if (idx < 0) return res.status(404).json({ error: 'Entry not found.' });
  if (db.entries[idx].locked) return res.status(403).json({ error: 'Your picks are locked.' });
  if (db.bracketState.tournamentStarted) return res.status(403).json({ error: 'Tournament has started.' });
  db.entries[idx].picks    = picks    || {};
  db.entries[idx].champion = champion || null;
  db.entries[idx].lastSaved = new Date().toISOString();
  writeDB(db); res.json({ ok: true });
});

/* Lock own picks */
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

/* ── serve login page ── */
app.get('/login', (req, res) => res.sendFile(path.join(FRONTEND, 'login.html')));

app.get('*', (req, res) => res.sendFile(path.join(FRONTEND, 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`⚽ Running on port ${PORT}`));
