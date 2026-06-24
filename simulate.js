#!/usr/bin/env node
/*
  simulate.js
  node simulate.js seed        — add 10 fake users with r32 picks
  node simulate.js r32         — set r32 results + open r16 for picking
  node simulate.js scores      — print leaderboard
  node simulate.js clean       — remove fake users
  node simulate.js reset       — wipe results + set activeRound back to r32
  node simulate.js full        — seed + r32 results in one go
  node simulate.js fulllock    — seed + r32 results + lock all + scores
*/

const fs    = require('fs');
const path  = require('path');
const bcrypt = require('bcryptjs');

const DB = path.join(__dirname, 'db.json');

const TEAMS = [
  {n:'Germany',f:'de'},{n:'Scotland',f:'gb-sct'},
  {n:'France',f:'fr'},{n:'Egypt',f:'eg'},
  {n:'Netherlands',f:'nl'},{n:'Morocco',f:'ma'},
  {n:'Spain',f:'es'},{n:'Austria',f:'at'},
  {n:'USA',f:'us'},{n:'Bosnia',f:'ba'},
  {n:'Belgium',f:'be'},{n:'S. Korea',f:'kr'},
  {n:'Colombia',f:'co'},{n:'Croatia',f:'hr'},
  {n:'Canada',f:'ca'},{n:'Ivory Coast',f:'ci'},
  {n:'Brazil',f:'br'},{n:'Japan',f:'jp'},
  {n:'England',f:'gb-eng'},{n:'Senegal',f:'sn'},
  {n:'Argentina',f:'ar'},{n:'Ecuador',f:'ec'},
  {n:'Portugal',f:'pt'},{n:'Turkey',f:'tr'},
  {n:'Mexico',f:'mx'},{n:'Sweden',f:'se'},
  {n:'Australia',f:'au'},{n:'Norway',f:'no'},
  {n:'Switzerland',f:'ch'},{n:'Algeria',f:'dz'},
  {n:'Uruguay',f:'uy'},{n:'Iran',f:'ir'},
];

// R32: each match ID + the two teams
const R32 = [
  {id:'l_r16_0', t1:TEAMS[0],  t2:TEAMS[1]},
  {id:'l_r16_1', t1:TEAMS[2],  t2:TEAMS[3]},
  {id:'l_r16_2', t1:TEAMS[4],  t2:TEAMS[5]},
  {id:'l_r16_3', t1:TEAMS[6],  t2:TEAMS[7]},
  {id:'l_r16_4', t1:TEAMS[8],  t2:TEAMS[9]},
  {id:'l_r16_5', t1:TEAMS[10], t2:TEAMS[11]},
  {id:'l_r16_6', t1:TEAMS[12], t2:TEAMS[13]},
  {id:'l_r16_7', t1:TEAMS[14], t2:TEAMS[15]},
  {id:'r_r16_0', t1:TEAMS[16], t2:TEAMS[17]},
  {id:'r_r16_1', t1:TEAMS[18], t2:TEAMS[19]},
  {id:'r_r16_2', t1:TEAMS[20], t2:TEAMS[21]},
  {id:'r_r16_3', t1:TEAMS[22], t2:TEAMS[23]},
  {id:'r_r16_4', t1:TEAMS[24], t2:TEAMS[25]},
  {id:'r_r16_5', t1:TEAMS[26], t2:TEAMS[27]},
  {id:'r_r16_6', t1:TEAMS[28], t2:TEAMS[29]},
  {id:'r_r16_7', t1:TEAMS[30], t2:TEAMS[31]},
];

// R16: winners of R32 pairs play each other
// l_qf_0 = winner(l_r16_0) vs winner(l_r16_1), etc.
const R16_SLOTS = [
  {id:'l_qf_0', s1:'l_r16_0', s2:'l_r16_1'},
  {id:'l_qf_1', s1:'l_r16_2', s2:'l_r16_3'},
  {id:'l_qf_2', s1:'l_r16_4', s2:'l_r16_5'},
  {id:'l_qf_3', s1:'l_r16_6', s2:'l_r16_7'},
  {id:'r_qf_0', s1:'r_r16_0', s2:'r_r16_1'},
  {id:'r_qf_1', s1:'r_r16_2', s2:'r_r16_3'},
  {id:'r_qf_2', s1:'r_r16_4', s2:'r_r16_5'},
  {id:'r_qf_3', s1:'r_r16_6', s2:'r_r16_7'},
];

const FAKE_NAMES = [
  'Jón Jónsson','Sigríður Björk','Guðmundur Eiríksson','Anna Kristín',
  'Bjarni Sigurðsson','Helga Magnúsdóttir','Ólafur Kristjánsson',
  'María Sigríðardóttir','Einar Gunnarsson','Kristín Ólafsdóttir',
];

function readDB() {
  if (!fs.existsSync(DB)) return {
    bracketState: { locked:false, tournamentStarted:false, teams:TEAMS, activeRound:'r32' },
    entries: [], results: {}
  };
  return JSON.parse(fs.readFileSync(DB,'utf8'));
}
function writeDB(data) { fs.writeFileSync(DB, JSON.stringify(data, null, 2)); }
function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/* ── seed ── */
async function seed() {
  const db = readDB();
  const hash = await bcrypt.hash('test1234', 8);
  let added = 0;
  for (let i = 0; i < FAKE_NAMES.length; i++) {
    const name  = FAKE_NAMES[i];
    const email = `fake${i+1}@test.is`;
    if (db.entries.find(e => e.email === email)) { console.log(`skip ${email}`); continue; }
    // Give each fake user random r32 picks
    const picks = {};
    for (const m of R32) picks[m.id] = rnd([m.t1, m.t2]);
    db.entries.push({ name, email, phone:`77${String(i).padStart(6,'0')}`,
      passwordHash: hash, picks, locked: true, lockedRound: 'r32', lockedAt: new Date().toISOString(), joined: new Date().toISOString() });
    console.log(`✓ ${name} — picks: ${Object.values(picks).map(p=>p.n).join(', ')}`);
    added++;
  }
  if (!db.bracketState) db.bracketState = {};
  db.bracketState.activeRound = 'r32';
  writeDB(db);
  console.log(`\nAdded ${added} fake users. Password: test1234`);
}

/* ── r32 results: set winners, open r16 ── */
function r32results() {
  const db = readDB();
  if (!db.results) db.results = {};
  if (!db.bracketState) db.bracketState = {};

  console.log('\n── Round of 32 Results ──');
  for (const m of R32) {
    const winner = rnd([m.t1, m.t2]);
    db.results[m.id] = winner;
    console.log(`  ${m.id}: ${m.t1.n} vs ${m.t2.n}  →  ${winner.n} wins`);
  }

  // Derive r16 matchups from r32 winners and print them
  console.log('\n── Round of 16 Matchups (now open) ──');
  for (const slot of R16_SLOTS) {
    const t1 = db.results[slot.s1];
    const t2 = db.results[slot.s2];
    console.log(`  ${slot.id}: ${t1.n} vs ${t2.n}`);
  }

  // Set activeRound to r16 so players can now pick
  db.bracketState.activeRound = 'r16';
  db.bracketState.tournamentStarted = false; // keep picks open

  writeDB(db);
  console.log('\n✓ activeRound set to r16 — players can now pick Round of 16');
}

/* ── lock all users for current round ── */
function lockAll() {
  const db = readDB();
  const round = db.bracketState?.activeRound || 'r32';
  let count = 0;
  for (const e of db.entries) {
    if (!e.locked || e.lockedRound !== round) {
      e.locked = true;
      e.lockedRound = round;
      e.lockedAt = new Date().toISOString();
      count++;
    }
  }
  writeDB(db);
  console.log(`\n✓ Locked ${count} users for round: ${round}`);
}

/* ── leaderboard ── */
function scores() {
  const db = readDB();
  const res = db.results || {};
  const scored = db.entries.map(e => {
    const score = Object.entries(res).filter(([id, r]) => e.picks?.[id]?.n === r.n).length;
    return { name: e.name, email: e.email, score };
  }).sort((a, b) => b.score - a.score);

  console.log('\n🏆 LEADERBOARD\n' + '─'.repeat(44));
  scored.forEach((e, i) => {
    const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}.`;
    console.log(`${medal} ${e.name.padEnd(28)} ${e.score} pts`);
  });
  console.log('─'.repeat(44));
  console.log(`Results confirmed: ${Object.keys(res).length} matches`);
  console.log(`Active round: ${db.bracketState?.activeRound || 'r32'}`);
}

/* ── clean fake users ── */
function clean() {
  const db = readDB();
  const before = db.entries.length;
  db.entries = db.entries.filter(e => !(e.email.startsWith('fake') && e.email.endsWith('@test.is')));
  writeDB(db);
  console.log(`Removed ${before - db.entries.length} fake users. ${db.entries.length} real users remain.`);
}

/* ── reset results + back to r32 ── */
function reset() {
  const db = readDB();
  db.results = {};
  if (!db.bracketState) db.bracketState = {};
  db.bracketState.activeRound = 'r32';
  writeDB(db);
  console.log('Results cleared. Active round reset to r32.');
}

const cmd = process.argv[2] || 'help';
(async () => {
  switch (cmd) {
    case 'seed':    await seed();            break;
    case 'r32':     r32results();            break;
    case 'scores':  scores();               break;
    case 'clean':   clean();                break;
    case 'reset':   reset();                break;
    case 'full':    await seed(); r32results(); scores(); break;
    case 'fulllock': await seed(); r32results(); lockAll(); scores(); break;
    default:
      console.log(`
Usage: node simulate.js <command>

  seed    — add 10 fake users with random r32 picks (auto-locked)
  r32     — confirm r32 results + open r16 for picking
  lock    — lock all users for the current active round
  scores  — print leaderboard
  clean   — remove all fake users (keeps real accounts)
  reset   — clear results, set active round back to r32
  full    — seed + r32 results + scores in one go
  fulllock — seed + r32 results + lock all users + scores
`);
  }
})();
