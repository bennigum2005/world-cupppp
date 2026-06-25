#!/usr/bin/env node
/*
  simulate.js
  node simulate.js seed      — add 10 fake users with r32 picks (locked)
  node simulate.js r32       — confirm r32 results, open r16
  node simulate.js r16       — confirm r16 results, open qf
  node simulate.js qf        — confirm qf results, open sf
  node simulate.js sf        — confirm sf results, open third+final
  node simulate.js third     — confirm 3rd place result
  node simulate.js final     — confirm final result
  node simulate.js lock      — lock all users for current round
  node simulate.js scores    — print leaderboard
  node simulate.js clean     — remove fake users
  node simulate.js reset     — wipe all results, back to r32
  node simulate.js full      — run everything start to finish
*/

const fs     = require('fs');
const path   = require('path');
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

const ROUND_MATCHES = {
  r32:   ['l_r16_0','l_r16_1','l_r16_2','l_r16_3','l_r16_4','l_r16_5','l_r16_6','l_r16_7',
           'r_r16_0','r_r16_1','r_r16_2','r_r16_3','r_r16_4','r_r16_5','r_r16_6','r_r16_7'],
  r16:   ['l_qf_0','l_qf_1','l_qf_2','l_qf_3','r_qf_0','r_qf_1','r_qf_2','r_qf_3'],
  qf:    ['l_sf_0','l_sf_1','r_sf_0','r_sf_1'],
  sf:    ['l_sff','r_sff'],
  third: ['third'],
  final: ['final'],
};

// Which matches feed into which (source1, source2)
const MATCH_SOURCES = {
  l_qf_0: ['l_r16_0','l_r16_1'], l_qf_1: ['l_r16_2','l_r16_3'],
  l_qf_2: ['l_r16_4','l_r16_5'], l_qf_3: ['l_r16_6','l_r16_7'],
  r_qf_0: ['r_r16_0','r_r16_1'], r_qf_1: ['r_r16_2','r_r16_3'],
  r_qf_2: ['r_r16_4','r_r16_5'], r_qf_3: ['r_r16_6','r_r16_7'],
  l_sf_0: ['l_qf_0','l_qf_1'],   l_sf_1: ['l_qf_2','l_qf_3'],
  r_sf_0: ['r_qf_0','r_qf_1'],   r_sf_1: ['r_qf_2','r_qf_3'],
  l_sff:  ['l_sf_0','l_sf_1'],   r_sff:  ['r_sf_0','r_sf_1'],
  final:  ['l_sff','r_sff'],
};

const ROUND_LABELS = {
  r32:'Leikir 32', r16:'16-liða úrslit', qf:'Fjórðungsúrslit',
  sf:'Undanúrslit', third:'3. sæti', final:'Úrslit',
};

const NEXT_ROUND = { r32:'r16', r16:'qf', qf:'sf', sf:'third', third:'final' };

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

// Get teams for a match from already-confirmed results
function getMatchTeams(matchId, results) {
  // r32 matches have fixed teams
  const r32map = {};
  for (let i=0;i<8;i++) { r32map[`l_r16_${i}`] = [TEAMS[i*2], TEAMS[i*2+1]]; }
  for (let i=0;i<8;i++) { r32map[`r_r16_${i}`] = [TEAMS[16+i*2], TEAMS[16+i*2+1]]; }
  if (r32map[matchId]) return r32map[matchId];

  // Later rounds: winners of source matches
  const [s1, s2] = MATCH_SOURCES[matchId] || [];
  const t1 = s1 ? results[s1] : null;
  const t2 = s2 ? results[s2] : null;
  return [t1, t2];
}

// Get third place teams: losers of semi-finals
function getThirdTeams(results) {
  const lsff = results['l_sff'], rsff = results['r_sff'];
  const lsfTeams = getMatchTeams('l_sff', results);
  const rsfTeams = getMatchTeams('r_sff', results);
  const t1 = lsff ? (lsff.n === lsfTeams[0]?.n ? lsfTeams[1] : lsfTeams[0]) : null;
  const t2 = rsff ? (rsff.n === rsfTeams[0]?.n ? rsfTeams[1] : rsfTeams[0]) : null;
  return [t1, t2];
}

/* ── seed ── */
async function seed() {
  const db = readDB();
  const hash = await bcrypt.hash('test1234', 8);
  let added = 0;
  for (let i = 0; i < FAKE_NAMES.length; i++) {
    const name  = FAKE_NAMES[i];
    const email = `fake${i+1}@test.is`;
    if (db.entries.find(e => e.email === email)) { console.log(`skip ${email}`); continue; }
    // Give random r32 picks
    const picks = {};
    for (const id of ROUND_MATCHES.r32) {
      const [t1, t2] = getMatchTeams(id, {});
      picks[id] = rnd([t1, t2]);
    }
    db.entries.push({
      name, email, phone:`77${String(i).padStart(6,'0')}`,
      passwordHash: hash, picks,
      locked: true, lockedRound: 'r32', lockedAt: new Date().toISOString(),
      joined: new Date().toISOString()
    });
    console.log(`✓ ${name}`);
    added++;
  }
  if (!db.bracketState) db.bracketState = {};
  db.bracketState.activeRound = 'r32';
  writeDB(db);
  console.log(`\nAdded ${added} fake users (locked for r32). Password: test1234`);
}

/* ── simulate a round ── */
function simulateRound(roundId) {
  const db = readDB();
  if (!db.results) db.results = {};
  if (!db.bracketState) db.bracketState = {};

  const matchIds = ROUND_MATCHES[roundId];
  if (!matchIds) { console.log('Unknown round:', roundId); return; }

  console.log(`\n── ${ROUND_LABELS[roundId]} Results ──`);

  for (const id of matchIds) {
    let t1, t2;
    if (id === 'third') {
      [t1, t2] = getThirdTeams(db.results);
    } else {
      [t1, t2] = getMatchTeams(id, db.results);
    }
    if (!t1 || !t2) { console.log(`  ${id}: teams not yet determined (run previous round first)`); continue; }
    const winner = rnd([t1, t2]);
    db.results[id] = winner;
    console.log(`  ${id}: ${t1.n} vs ${t2.n}  →  ${winner.n} wins`);
  }

  // Open next round
  const next = NEXT_ROUND[roundId];
  if (next) {
    db.bracketState.activeRound = next;
    console.log(`\n✓ activeRound → ${next} (${ROUND_LABELS[next]})`);
  } else {
    console.log(`\n✓ Tournament complete!`);
  }

  writeDB(db);
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
  console.log(`\n✓ Locked ${count} users for round: ${round} (${ROUND_LABELS[round]})`);
}

/* ── add picks for new round for fake users ── */
async function addRoundPicks(roundId) {
  const db = readDB();
  if (!db.results) db.results = {};
  const matchIds = ROUND_MATCHES[roundId];

  for (const e of db.entries) {
    if (!e.email.startsWith('fake')) continue;
    if (!e.picks) e.picks = {};
    for (const id of matchIds) {
      let t1, t2;
      if (id === 'third') [t1, t2] = getThirdTeams(db.results);
      else [t1, t2] = getMatchTeams(id, db.results);
      if (t1 && t2) e.picks[id] = rnd([t1, t2]);
    }
    e.locked = true;
    // third and final are locked together — store as 'third'
    e.lockedRound = (roundId === 'final') ? 'third' : roundId;
    e.lockedAt = new Date().toISOString();
  }
  writeDB(db);
  console.log(`✓ Added & locked ${roundId} picks for fake users`);
}

/* ── leaderboard ── */
function scores() {
  const db = readDB();
  const res = db.results || {};
  const scored = db.entries
    .filter(e => e.locked)
    .map(e => {
      const score = Object.entries(res).filter(([id,r]) => e.picks?.[id]?.n === r.n).length;
      return { name: e.name, score };
    }).sort((a,b) => b.score - a.score);

  console.log('\n🏆 STIGATAFLA\n' + '─'.repeat(40));
  scored.forEach((e,i) => {
    const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}.`;
    console.log(`${medal} ${e.name.padEnd(28)} ${e.score} stig`);
  });
  console.log('─'.repeat(40));
  console.log(`Staðfestir leikir: ${Object.keys(res).length}`);
  console.log(`Virkur leikur: ${db.bracketState?.activeRound || 'r32'} (${ROUND_LABELS[db.bracketState?.activeRound] || ''})`);
}

/* ── clean ── */
function clean() {
  const db = readDB();
  const before = db.entries.length;
  db.entries = db.entries.filter(e => !(e.email.startsWith('fake') && e.email.endsWith('@test.is')));
  writeDB(db);
  console.log(`Removed ${before - db.entries.length} fake users. ${db.entries.length} remain.`);
}

/* ── reset ── */
function reset() {
  const db = readDB();
  db.results = {};
  if (!db.bracketState) db.bracketState = {};
  db.bracketState.activeRound = 'r32';
  writeDB(db);
  console.log('Results cleared. Active round → r32.');
}

/* ── full simulation all rounds ── */
async function full() {
  console.log('=== FULL SIMULATION ===\n');
  await seed();
  for (const round of ['r32','r16','qf','sf']) {
    simulateRound(round);
    await addRoundPicks(NEXT_ROUND[round]);
  }
  simulateRound('sf');
  await addRoundPicks('third');
  await addRoundPicks('final');
  simulateRound('third');
  simulateRound('final');
  scores();
}

const cmd = process.argv[2] || 'help';
(async () => {
  switch (cmd) {
    case 'seed':   await seed();              break;
    case 'r32':    simulateRound('r32');      break;
    case 'r16':    simulateRound('r16'); await addRoundPicks('qf');    break;
    case 'qf':     simulateRound('qf');  await addRoundPicks('sf');    break;
    case 'sf':     simulateRound('sf');  await addRoundPicks('third'); await addRoundPicks('final'); break;
    case 'third':  simulateRound('third'); simulateRound('final'); break;
    case 'final':  simulateRound('final');    break;
    case 'lock':   lockAll();                 break;
    case 'scores': scores();                  break;
    case 'clean':  clean();                   break;
    case 'reset':  reset();                   break;
    case 'full':   await full();              break;
    default:
      console.log(`
Usage: node simulate.js <command>

  seed    — add 10 fake users with r32 picks (auto-locked)
  r32     — confirm r32 results, open r16
  r16     — confirm r16 results, open qf  (+ fake users pick qf)
  qf      — confirm qf results, open sf   (+ fake users pick sf)
  sf      — confirm sf results, open 3rd+final (+ fake users pick both)
  third   — confirm 3rd place + final results together
  lock    — lock all users for current round
  scores  — print leaderboard
  clean   — remove all fake users
  reset   — clear all results, back to r32
  full    — run entire tournament start to finish
`);
  }
})();
