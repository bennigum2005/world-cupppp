const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');

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
      entries: [],
      results: {}
    }, null, 2));
  const data = JSON.parse(fs.readFileSync(DB, 'utf8'));
  if (!data.bracketState.teams || data.bracketState.teams.length < 32)
    data.bracketState.teams = DEMO_TEAMS;
  if (!data.results) data.results = {};
  if (data.bracketState.tournamentStarted === undefined) data.bracketState.tournamentStarted = false;
  return data;
}
function writeDB(data) { fs.writeFileSync(DB, JSON.stringify(data, null, 2)); }
function isAdmin(req) { return req.headers['x-admin-pass'] === ADMIN_PASS; }

/* ── Bracket state ── */
app.get('/api/bracket-state', (req, res) => res.json(readDB().bracketState));

app.put('/api/bracket-state', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  const db = readDB();
  const { locked, tournamentStarted, teams } = req.body;
  if (locked !== undefined) db.bracketState.locked = !!locked;
  if (tournamentStarted !== undefined) db.bracketState.tournamentStarted = !!tournamentStarted;
  if (teams && teams.length === 32) db.bracketState.teams = teams;
  writeDB(db);
  res.json(db.bracketState);
});

/* ── Entries ── */
app.get('/api/entries', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  res.json(readDB().entries);
});

app.post('/api/entries', (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and email required.' });
  const db = readDB();
  if (db.bracketState.tournamentStarted)
    return res.status(403).json({ error: 'Tournament has started. No new entries.' });
  const idx = db.entries.findIndex(e => e.email.toLowerCase() === email.toLowerCase());
  if (idx >= 0) return res.json({ ...db.entries[idx], created: false });
  const entry = { name, email: email.toLowerCase(), picks: {}, champion: null,
                  locked: false, joined: new Date().toISOString() };
  db.entries.push(entry);
  writeDB(db);
  res.json({ ...entry, created: true });
});

/* ── Save picks (only if not locked and tournament not started) ── */
app.put('/api/entries/:email/picks', (req, res) => {
  const { picks, champion } = req.body;
  const db = readDB();
  const idx = db.entries.findIndex(e => e.email === decodeURIComponent(req.params.email).toLowerCase());
  if (idx < 0) return res.status(404).json({ error: 'Entry not found.' });
  if (db.entries[idx].locked) return res.status(403).json({ error: 'Your picks are locked.' });
  if (db.bracketState.tournamentStarted) return res.status(403).json({ error: 'Tournament has started.' });
  db.entries[idx].picks = picks || {};
  db.entries[idx].champion = champion || null;
  db.entries[idx].lastSaved = new Date().toISOString();
  writeDB(db);
  res.json({ ok: true });
});

/* ── Lock own picks ── */
app.put('/api/entries/:email/lock', (req, res) => {
  const db = readDB();
  const idx = db.entries.findIndex(e => e.email === decodeURIComponent(req.params.email).toLowerCase());
  if (idx < 0) return res.status(404).json({ error: 'Entry not found.' });
  if (db.bracketState.tournamentStarted) return res.status(403).json({ error: 'Tournament already started.' });
  db.entries[idx].locked = true;
  db.entries[idx].lockedAt = new Date().toISOString();
  writeDB(db);
  res.json({ ok: true });
});

/* ── Real results (from API or manual fallback) ── */
app.get('/api/results', (req, res) => res.json(readDB().results));

app.put('/api/results', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  const db = readDB();
  db.results = req.body.results || {};
  writeDB(db);
  res.json({ ok: true });
});

/* ── Admin: reset a specific entry's picks ── */
app.put('/api/admin/entries/:email/reset', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  const db = readDB();
  const idx = db.entries.findIndex(e => e.email === decodeURIComponent(req.params.email).toLowerCase());
  if (idx < 0) return res.status(404).json({ error: 'Entry not found.' });
  db.entries[idx].picks = {};
  db.entries[idx].champion = null;
  db.entries[idx].lastSaved = new Date().toISOString();
  writeDB(db);
  res.json({ ok: true });
});

/* ── Admin: unlock a specific entry so they can re-pick ── */
app.put('/api/admin/entries/:email/unlock', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  const db = readDB();
  const idx = db.entries.findIndex(e => e.email === decodeURIComponent(req.params.email).toLowerCase());
  if (idx < 0) return res.status(404).json({ error: 'Entry not found.' });
  db.entries[idx].locked = false;
  db.entries[idx].lockedAt = null;
  writeDB(db);
  res.json({ ok: true });
});

/* ── Admin: verify password ── */
app.post('/api/admin/verify', (req, res) => {
  if (req.body.pass === ADMIN_PASS) res.json({ ok: true });
  else res.status(401).json({ error: 'Wrong password' });
});

/* ── Reset bracket (one-time fix) ── */
app.get('/api/reset-bracket', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  const db = readDB();
  db.bracketState = { locked: false, tournamentStarted: false, teams: DEMO_TEAMS };
  writeDB(db);
  res.json({ ok: true });
});

app.get('*', (req, res) => res.sendFile(path.join(FRONTEND, 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`⚽ Running on port ${PORT}`));
