const API_BASE = '/api';

const DEMO_TEAMS = [
  {name:'Brazil',flag:'🇧🇷'},{name:'Argentina',flag:'🇦🇷'},
  {name:'France',flag:'🇫🇷'},{name:'England',flag:'🏴󠁧󠁢󠁥󠁮󠁧󠁿'},
  {name:'Germany',flag:'🇩🇪'},{name:'Spain',flag:'🇪🇸'},
  {name:'Portugal',flag:'🇵🇹'},{name:'Netherlands',flag:'🇳🇱'},
  {name:'Belgium',flag:'🇧🇪'},{name:'Uruguay',flag:'🇺🇾'},
  {name:'USA',flag:'🇺🇸'},{name:'Mexico',flag:'🇲🇽'},
  {name:'Japan',flag:'🇯🇵'},{name:'Morocco',flag:'🇲🇦'},
  {name:'Croatia',flag:'🇭🇷'},{name:'Senegal',flag:'🇸🇳'},
];

const PLACEHOLDER_TEAMS = Array.from({length:16},(_,i)=>({
  name:`Team ${String.fromCharCode(65+i)}`, flag:'🏳'
}));

let isLocked = true;
let currentUser = null;
let allEntries = [];
let teams = PLACEHOLDER_TEAMS.map(t=>({...t}));
let rounds = [];

function showTab(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('panel-' + name).classList.add('active');
  event.target.classList.add('active');
  if (name === 'entries') renderEntryList();
}

async function apiFetch(path, options={}) {
  try {
    const res = await fetch(API_BASE + path, {
      headers: {'Content-Type':'application/json'}, ...options
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  } catch(e) {
    console.error('API error:', e);
    return null;
  }
}

function initRounds() {
  rounds = [];
  const r0 = [];
  for (let i = 0; i < 16; i += 2)
    r0.push({id:`r0m${i/2}`, team1:teams[i], team2:teams[i+1], winner:null});
  rounds.push(r0);
  for (let r = 1; r < 4; r++) {
    const prev = rounds[r-1], rd = [];
    for (let i = 0; i < prev.length; i += 2)
      rd.push({id:`r${r}m${i/2}`, team1:null, team2:null, winner:null,
               src1:prev[i].id, src2:prev[i+1].id});
    rounds.push(rd);
  }
}

function getMatch(id) {
  for (const r of rounds) for (const m of r) if (m.id === id) return m;
  return null;
}

function propagate() {
  for (let r = 1; r < rounds.length; r++) {
    for (const m of rounds[r]) {
      m.team1 = getMatch(m.src1)?.winner || null;
      m.team2 = getMatch(m.src2)?.winner || null;
      if (m.winner &&
          (!m.team1 || m.winner.name !== m.team1.name) &&
          (!m.team2 || m.winner.name !== m.team2.name))
        m.winner = null;
    }
  }
}

async function pickWinner(matchId, team) {
  if (isLocked || !team || !currentUser) return;
  const m = getMatch(matchId);
  if (!m) return;
  m.winner = team;
  propagate();
  render();
  await savePicks();
}

async function registerEntry() {
  const name  = document.getElementById('inp-name').value.trim();
  const email = document.getElementById('inp-email').value.trim();
  const msg   = document.getElementById('entryMsg');
  if (!name)  { setMsg(msg,'Please enter your name.','err'); return; }
  if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email))
    { setMsg(msg,'Please enter a valid email.','err'); return; }

  const data = await apiFetch('/entries', {
    method:'POST', body:JSON.stringify({name, email})
  });
  if (!data) { setMsg(msg,'Could not save — please try again.','err'); return; }

  currentUser = data;
  setMsg(msg, data.created ? 'Details saved!' : 'Welcome back!', 'ok');

  if (data.picks) {
    initRounds();
    for (const [mid, team] of Object.entries(data.picks)) {
      const m = getMatch(mid);
      if (m) m.winner = team;
    }
    propagate();
  }

  await loadEntries();
  showWelcomeBack();
  render();
}

async function loadEntries() {
  const data = await apiFetch('/entries');
  if (data) allEntries = data;
}

async function savePicks() {
  if (!currentUser) return;
  const picks = {};
  for (const r of rounds) for (const m of r) if (m.winner) picks[m.id] = m.winner;
  const champion = rounds[3][0].winner || null;
  await apiFetch(`/entries/${encodeURIComponent(currentUser.email)}/picks`, {
    method:'PUT', body:JSON.stringify({picks, champion})
  });
  const idx = allEntries.findIndex(e => e.email === currentUser.email);
  if (idx >= 0) { allEntries[idx].picks = picks; allEntries[idx].champion = champion; }
}

function render() {
  const b = document.getElementById('bracket');
  b.innerHTML = '';
  let madeCount = 0;

  for (let ri = 0; ri < rounds.length; ri++) {
    const col = document.createElement('div'); col.className = 'round';
    col.innerHTML = `<div class="r-label">${
      ['Round of 16','Quarters','Semis','Final'][ri]
    }</div>`;
    const ms = document.createElement('div'); ms.className = 'matches';

    for (const m of rounds[ri]) {
      const {team1:t1, team2:t2, winner:w} = m;
      if (w) madeCount++;
      const canPick = !isLocked && !!currentUser;
      const mg = document.createElement('div'); mg.className = 'mg';
      const matchDiv = document.createElement('div'); matchDiv.className = 'match';

      [t1,t2].forEach((t,idx) => {
        const isWin  = w && t && w.name === t.name;
        const isLose = w && t && w.name !== t.name;
        const isTbd  = !t;
        let cls = 'slot';
        if (isTbd)         cls += ' slot-tbd';
        else if (!canPick) cls += ' slot-dis';
        if (isWin)  cls += ' slot-win';
        if (isLose) cls += ' slot-lose';

        const el = document.createElement('div'); el.className = cls;
        el.innerHTML = `<span class="slot-flag">${t?t.flag:'🏳'}</span>
          <span class="slot-name">${t?t.name:'TBD'}</span>
          ${isWin?'<span class="slot-check">✓</span>':''}`;
        if (canPick && t) el.addEventListener('click', () => pickWinner(m.id, t));

        if (idx === 0) {
          matchDiv.appendChild(el);
          const vs = document.createElement('div'); vs.className='vs'; vs.textContent='vs';
          matchDiv.appendChild(vs);
        } else { matchDiv.appendChild(el); }
      });

      mg.appendChild(matchDiv); ms.appendChild(mg);
    }
    col.appendChild(ms); b.appendChild(col);
  }

  const champ = rounds[3][0].winner;
  const cc = document.createElement('div'); cc.className = 'round'; cc.style.maxWidth = '130px';
  cc.innerHTML = `<div class="r-label">Champion</div>
    <div class="champ-col">
      <div class="trophy-wrap">🏆</div>
      <div class="champ-label">World Champion</div>
      <div class="champ-name">${champ ? champ.flag+' '+champ.name : '—'}</div>
    </div>`;
  b.appendChild(cc);

  renderProgress(madeCount);
}

function renderProgress(made) {
  const bar = document.getElementById('progressBar');
  if (!currentUser || isLocked) { bar.style.display='none'; return; }
  bar.style.display = 'flex';
  const champ = rounds[3][0].winner;
  bar.innerHTML = `
    <div class="prog-item"><div class="prog-label">Picks made</div><div class="prog-val">${made}/15</div></div>
    <div class="prog-div"></div>
    <div class="prog-item"><div class="prog-label">Remaining</div><div class="prog-val">${15-made}</div></div>
    <div class="prog-div"></div>
    <div class="prog-item"><div class="prog-label">My champion</div><div class="prog-val" style="font-size:15px;">${champ?champ.flag+' '+champ.name:'Not picked yet'}</div></div>`;
}

function renderEntryList() {
  const list = document.getElementById('entryList');
  const isAdmin = new URLSearchParams(location.search).get('admin') === '1';

  if (!isAdmin) {
    list.innerHTML = `<div class="empty-state"><p>Entry list is private.</p></div>`;
    return;
  }

  if (allEntries.length === 0) {
    list.innerHTML = `<div class="empty-state"><p>No entries yet — share the link with your friends!</p></div>`;
    return;
  }

  const rows = allEntries.map(e => {
    const picks = Object.keys(e.picks||{}).length;
    const champ = e.champion;
    const pct   = Math.round((picks/15)*100);
    const initials = e.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="avatar" style="width:30px;height:30px;font-size:11px;">${initials}</div>
          <div>
            <div style="font-weight:600;">${e.name}</div>
            <div style="font-size:11px;color:var(--text-muted);">${e.email}</div>
          </div>
        </div>
      </td>
      <td>${champ ? champ.flag+' '+champ.name : '<span style="color:var(--text-hint)">Not picked</span>'}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="flex:1;height:5px;background:var(--border);border-radius:3px;min-width:60px;">
            <div style="height:5px;background:var(--green);border-radius:3px;width:${pct}%;"></div>
          </div>
          <span class="badge ${picks===15?'badge-gold':picks>0?'badge-green':'badge-gray'}">${picks}/15</span>
        </div>
      </td>
    </tr>`;
  }).join('');

  list.innerHTML = `<table class="entries-table">
    <thead><tr><th>Player</th><th>Champion pick</th><th>Progress</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function showWelcomeBack() {
  const wb = document.getElementById('welcomeBack');
  const es = document.getElementById('entrySection');
  if (!currentUser) { wb.style.display='none'; es.style.display='block'; return; }
  es.style.display='none'; wb.style.display='block';
  const initials = currentUser.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
  wb.innerHTML = `<div class="welcome-bar">
    <div class="avatar">${initials}</div>
    <div style="flex:1">
      <div class="wb-name">${currentUser.name}</div>
      <div class="wb-email">${currentUser.email}</div>
    </div>
    <button class="btn" onclick="switchUser()" style="font-size:12px;">Not you?</button>
  </div>`;
}

function switchUser() {
  currentUser = null; initRounds();
  document.getElementById('inp-name').value = '';
  document.getElementById('inp-email').value = '';
  document.getElementById('entryMsg').textContent = '';
  showWelcomeBack(); render();
}

function setStatus(locked) {
  const pill = document.getElementById('statusPill');
  const label = document.getElementById('statusLabel');
  pill.className = 'status-pill ' + (locked ? 'locked' : 'open');
  label.textContent = locked ? 'Bracket locked' : 'Picks open';
}

function setMsg(el, text, type) {
  el.textContent = text; el.className = 'form-msg ' + type;
}

async function unlockBracket() {
  teams = DEMO_TEAMS.map(t=>({...t}));
  isLocked = false;
  await apiFetch('/bracket-state', {method:'PUT', body:JSON.stringify({locked:false, teams})});
  initRounds(); setStatus(false); render();
}

async function lockBracket() {
  isLocked = true; teams = PLACEHOLDER_TEAMS.map(t=>({...t}));
  await apiFetch('/bracket-state', {method:'PUT', body:JSON.stringify({locked:true, teams:[]})});
  initRounds(); setStatus(true); render();
}

async function resetCurrentPicks() {
  if (!currentUser) return;
  await apiFetch(`/entries/${encodeURIComponent(currentUser.email)}/picks`, {
    method:'PUT', body:JSON.stringify({picks:{}, champion:null})
  });
  initRounds(); render();
}

(async function init() {
  const isAdmin = new URLSearchParams(location.search).get('admin') === '1';
  if (isAdmin) document.getElementById('adminBar').classList.add('visible');

  const state = await apiFetch('/bracket-state');
  if (state) {
    isLocked = state.locked;
    if (!isLocked && state.teams?.length) teams = state.teams;
  }
  setStatus(isLocked);
  await loadEntries();
  initRounds();
  render();
})();
