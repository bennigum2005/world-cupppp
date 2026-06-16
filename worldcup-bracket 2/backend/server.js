const express  = require('express');
const cors     = require('cors');
const fs       = require('fs');
const path     = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;
const DB   = path.join(__dirname, 'db.json');

/* ── Middleware ── */
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

/* ── Simple JSON database ── */
function readDB() {
  if (!fs.existsSync(DB))
    fs.writeFileSync(DB, JSON.stringify({ bracketState: { locked: true, teams: [] }, entries: [] }, null, 2));
  return JSON.parse(fs.readFileSync(DB, 'utf8'));
}

function writeDB(data) {
  fs.writeFileSync(DB, JSON.stringify(data, null, 2));
}

/* ════════════════════════════════
   ROUTES
════════════════════════════════ */

/* GET /api/bracket-state — returns lock status and teams */
app.get('/api/bracket-state', (req, res) => {
  const db = readDB();
  res.json(db.bracketState);
});

/* PUT /api/bracket-state — admin: lock/unlock bracket, set teams */
app.put('/api/bracket-state', (req, res) => {
  const { locked, teams } = req.body;
  const db = readDB();
  db.bracketState = { locked: !!locked, teams: teams || db.bracketState.teams };
  writeDB(db);
  res.json(db.bracketState);
});

/* GET /api/entries — returns all entries (admin view) */
app.get('/api/entries', (req, res) => {
  const db = readDB();
  res.json(db.entries);
});

/* POST /api/entries — register or retrieve an entry by email */
app.post('/api/entries', (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required.' });

  const db  = readDB();
  const idx = db.entries.findIndex(e => e.email.toLowerCase() === email.toLowerCase());

  if (idx >= 0) {
    /* returning user — send back their existing entry */
    return res.json({ ...db.entries[idx], created: false });
  }

  const entry = {
    name,
    email: email.toLowerCase(),
    picks: {},
    champion: null,
    joined: new Date().toISOString(),
  };
  db.entries.push(entry);
  writeDB(db);
  res.json({ ...entry, created: true });
});

/* PUT /api/entries/:email/picks — save picks for an entry */
app.put('/api/entries/:email/picks', (req, res) => {
  const { picks, champion } = req.body;
  const db  = readDB();
  const idx = db.entries.findIndex(e => e.email === decodeURIComponent(req.params.email).toLowerCase());
  if (idx < 0) return res.status(404).json({ error: 'Entry not found.' });

  db.entries[idx].picks    = picks    || {};
  db.entries[idx].champion = champion || null;
  writeDB(db);
  res.json(db.entries[idx]);
});

/* ── Catch-all: serve frontend ── */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, '0.0.0.0', () => console.log(`⚽ Server running on port ${PORT}`));
