const express  = require('express');
const cors     = require('cors');
const fs       = require('fs');
const path     = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

/* Use absolute path from repo root, works anywhere */
const ROOT     = path.resolve(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend');
const DB       = path.join(ROOT, 'db.json');

console.log('ROOT:', ROOT);
console.log('FRONTEND:', FRONTEND);
console.log('DB:', DB);

app.use(cors());
app.use(express.json());
app.use(express.static(FRONTEND));

function readDB() {
  if (!fs.existsSync(DB))
    fs.writeFileSync(DB, JSON.stringify({ bracketState: { locked: true, teams: [] }, entries: [] }, null, 2));
  return JSON.parse(fs.readFileSync(DB, 'utf8'));
}

function writeDB(data) {
  fs.writeFileSync(DB, JSON.stringify(data, null, 2));
}

app.get('/api/bracket-state', (req, res) => {
  res.json(readDB().bracketState);
});

app.put('/api/bracket-state', (req, res) => {
  const { locked, teams } = req.body;
  const db = readDB();
  db.bracketState = { locked: !!locked, teams: teams || db.bracketState.teams };
  writeDB(db);
  res.json(db.bracketState);
});

app.get('/api/entries', (req, res) => {
  res.json(readDB().entries);
});

app.post('/api/entries', (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and email required.' });
  const db  = readDB();
  const idx = db.entries.findIndex(e => e.email.toLowerCase() === email.toLowerCase());
  if (idx >= 0) return res.json({ ...db.entries[idx], created: false });
  const entry = { name, email: email.toLowerCase(), picks: {}, champion: null, joined: new Date().toISOString() };
  db.entries.push(entry);
  writeDB(db);
  res.json({ ...entry, created: true });
});

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

app.get('*', (req, res) => {
  res.sendFile(path.join(FRONTEND, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => console.log(`⚽ Server running on port ${PORT}`));
