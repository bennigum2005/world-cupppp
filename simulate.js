#!/usr/bin/env node
/*
  simulate.js — seed 10 fake users with random picks, then simulate results
  Run from repo root: node simulate.js [command]

  Commands:
    node simulate.js seed       — add 10 fake users with random picks
    node simulate.js results    — set random results for round of 32
    node simulate.js scores     — print current leaderboard
    node simulate.js clean      — remove all fake users (keeps real ones)
    node simulate.js reset      — wipe results only
    node simulate.js full       — seed + results in one go
*/

const fs   = require('fs');
const path = require('path');
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

// R32 match IDs and which teams play each other
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

const FAKE_NAMES = [
  'Jón Jónsson','Sigríður Björk','Guðmundur Eiríksson','Anna Kristín',
  'Bjarni Sigurðsson','Helga Magnúsdóttir','Ólafur Kristjánsson',
  'María Sigríðardóttir','Einar Gunnarsson','Kristín Ólafsdóttir',
];

function readDB() {
  if (!fs.existsSync(DB)) return { bracketState:{locked:false,tournamentStarted:false,teams:TEAMS,activeRound:'r32'}, entries:[], results:{} };
  return JSON.parse(fs.readFileSync(DB,'utf8'));
}
function writeDB(data) { fs.writeFileSync(DB, JSON.stringify(data,null,2)); }
function pick(arr) { return arr[Math.floor(Math.random()*arr.length)]; }

async function seed() {
  const db = readDB();
  const hash = await bcrypt.hash('test1234', 8);
  let added = 0;
  for (let i = 0; i < FAKE_NAMES.length; i++) {
    const name  = FAKE_NAMES[i];
    const email = `fake${i+1}@test.is`;
    if (db.entries.find(e => e.email === email)) { console.log(`skip ${email} (exists)`); continue; }

    // Random picks for r32
    const picks = {};
    for (const m of R32) picks[m.id] = pick([m.t1, m.t2]);

    db.entries.push({
      name, email,
      phone: `77${String(i).padStart(6,'0')}`,
      passwordHash: hash,
      picks,
      locked: false,
      joined: new Date().toISOString(),
    });
    console.log(`✓ Added ${name} (${email}) with ${Object.keys(picks).length} picks`);
    added++;
  }
  writeDB(db);
  console.log(`\nDone — added ${added} fake users. Password for all: test1234`);
}

function results() {
  const db = readDB();
  db.results = db.results || {};
  // Random winner for each r32 match
  for (const m of R32) {
    db.results[m.id] = pick([m.t1, m.t2]);
    console.log(`${m.id}: ${db.results[m.id].n} wins`);
  }
  writeDB(db);
  console.log('\nResults set for Round of 32');
}

function scores() {
  const db = readDB();
  const res = db.results || {};
  const scored = db.entries.map(e => {
    const score = Object.entries(res).filter(([id,r]) => e.picks?.[id]?.n === r.n).length;
    return { name: e.name, email: e.email, score };
  }).sort((a,b) => b.score - a.score);

  console.log('\n🏆 LEADERBOARD\n' + '─'.repeat(40));
  scored.forEach((e,i) => console.log(`${i+1}. ${e.name.padEnd(28)} ${e.score} pts`));
  console.log('─'.repeat(40));
  console.log(`Total results confirmed: ${Object.keys(res).length}`);
}

function clean() {
  const db = readDB();
  const before = db.entries.length;
  db.entries = db.entries.filter(e => !e.email.startsWith('fake') || !e.email.endsWith('@test.is'));
  writeDB(db);
  console.log(`Removed ${before - db.entries.length} fake users. ${db.entries.length} real users remain.`);
}

function reset() {
  const db = readDB();
  db.results = {};
  writeDB(db);
  console.log('Results cleared.');
}

const cmd = process.argv[2] || 'help';
(async () => {
  switch(cmd) {
    case 'seed':    await seed();   break;
    case 'results': results();      break;
    case 'scores':  scores();       break;
    case 'clean':   clean();        break;
    case 'reset':   reset();        break;
    case 'full':    await seed(); results(); scores(); break;
    default:
      console.log(`Usage: node simulate.js <command>
  seed     — add 10 fake Icelandic users with random picks
  results  — set random results for Round of 32
  scores   — print leaderboard to terminal
  clean    — remove all fake users
  reset    — clear all results
  full     — seed + results + scores in one go`);
  }
})();
