/* ══════════════════════════════════════
   2026 WORLD CUP PREDICTOR — app.js
   Round-based: picks per round, points per correct pick, public leaderboard
══════════════════════════════════════ */

const API = '/api';

/* Rounds in order */
const ROUNDS = [
  { id: 'r32',   label: 'Round of 32',    matchCount: 16 },
  { id: 'r16',   label: 'Round of 16',    matchCount: 8  },
  { id: 'qf',    label: 'Quarter-finals', matchCount: 4  },
  { id: 'sf',    label: 'Semi-finals',    matchCount: 2  },
  { id: 'third', label: '3rd Place',      matchCount: 1  },
  { id: 'final', label: 'Final',          matchCount: 1  },
];

const DEMO_TEAMS = [
  {n:'Germany',f:'🇩🇪'},{n:'Scotland',f:'🏴󠁧󠁢󠁳󠁣󠁴󠁿'},
  {n:'France',f:'🇫🇷'},{n:'Egypt',f:'🇪🇬'},
  {n:'Netherlands',f:'🇳🇱'},{n:'Morocco',f:'🇲🇦'},
  {n:'Spain',f:'🇪🇸'},{n:'Austria',f:'🇦🇹'},
  {n:'USA',f:'🇺🇸'},{n:'Bosnia',f:'🇧🇦'},
  {n:'Belgium',f:'🇧🇪'},{n:'S. Korea',f:'🇰🇷'},
  {n:'Colombia',f:'🇨🇴'},{n:'Croatia',f:'🇭🇷'},
  {n:'Canada',f:'🇨🇦'},{n:'Ivory Coast',f:'🇨🇮'},
  {n:'Brazil',f:'🇧🇷'},{n:'Japan',f:'🇯🇵'},
  {n:'England',f:'🏴󠁧󠁢󠁥󠁮󠁧󠁿'},{n:'Senegal',f:'🇸🇳'},
  {n:'Argentina',f:'🇦🇷'},{n:'Ecuador',f:'🇪🇨'},
  {n:'Portugal',f:'🇵🇹'},{n:'Turkey',f:'🇹🇷'},
  {n:'Mexico',f:'🇲🇽'},{n:'Sweden',f:'🇸🇪'},
  {n:'Australia',f:'🇦🇺'},{n:'Norway',f:'🇳🇴'},
  {n:'Switzerland',f:'🇨🇭'},{n:'Algeria',f:'🇩🇿'},
  {n:'Uruguay',f:'🇺🇾'},{n:'Iran',f:'🇮🇷'},
];

/* ── State ── */
let user = null;
let adminPass = sessionStorage.getItem('adminPass') || null;
let bracketState = { locked: false, tournamentStarted: false, teams: DEMO_TEAMS.slice(), activeRound: 'r32' };
let roundPicks = {};   // { r32: { m0: {n,f}, m1: ... }, r16: {...}, ... }
let roundResults = {}; // { r32: { m0: {n,f}, ... }, ... } — confirmed winners from admin/API
let entries = [];
let currentTab = 'bracket';

/* ══════════════════════════════════════
   API HELPERS
══════════════════════════════════════ */
async function api(path, opts = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (adminPass) h['x-admin-pass'] = adminPass;
  try {
    const r = await fetch(API + path, { headers: h, ...opts });
    return r.json();
  } catch(e) { return null; }
}

/* ══════════════════════════════════════
   ROUND LOGIC
   Each round's teams come from the RESULTS of the previous round.
   If results aren't confirmed yet, teams show as TBD.
══════════════════════════════════════ */
function getTeamsForRound(roundId) {
  const teams = bracketState.teams || DEMO_TEAMS.slice();

  if (roundId === 'r32') {
    // Pairs: [0v1, 2v3, 4v5, ...]
    const matches = [];
    for (let i = 0; i < 16; i++) {
      matches.push({ t1: teams[i*2] || null, t2: teams[i*2+1] || null });
    }
    return matches;
  }

  // For subsequent rounds, use confirmed results of previous round
  const prevRound = getPrevRound(roundId);
  if (!prevRound) return [];
  const prevResults = roundResults[prevRound.id] || {};
  const prevMatches = getTeamsForRound(prevRound.id);
  const winners = prevMatches.map((_, i) => prevResults[`m${i}`] || null);

  if (roundId === 'r16') {
    const matches = [];
    for (let i = 0; i < 8; i++) {
      matches.push({ t1: winners[i*2] || null, t2: winners[i*2+1] || null });
    }
    return matches;
  }
  if (roundId === 'qf') {
    const matches = [];
    for (let i = 0; i < 4; i++) {
      matches.push({ t1: winners[i*2] || null, t2: winners[i*2+1] || null });
    }
    return matches;
  }
  if (roundId === 'sf') {
    return [
      { t1: winners[0] || null, t2: winners[1] || null },
      { t1: winners[2] || null, t2: winners[3] || null },
    ];
  }
  if (roundId === 'third') {
    // Losers of SF
    const sfResults = roundResults['sf'] || {};
    const sfMatches = getTeamsForRound('sf');
    function loser(m, res) {
      if (!res || !m.t1 || !m.t2) return null;
      return res.n === m.t1.n ? m.t2 : m.t1;
    }
    return [{ t1: loser(sfMatches[0], sfResults['m0']), t2: loser(sfMatches[1], sfResults['m1']) }];
  }
  if (roundId === 'final') {
    return [{ t1: winners[0] || null, t2: winners[1] || null }];
  }
  return [];
}

function getPrevRound(roundId) {
  const idx = ROUNDS.findIndex(r => r.id === roundId);
  return idx > 0 ? ROUNDS[idx - 1] : null;
}

function getRound(roundId) { return ROUNDS.find(r => r.id === roundId); }

/* Is this round open for picking? Active round must be set by admin */
function canPickRound(roundId) {
  if (!user || user.locked || bracketState.tournamentStarted) return false;
  return bracketState.activeRound === roundId;
}

/* ══════════════════════════════════════
   SCORE CALCULATION
══════════════════════════════════════ */
function calcScore(picks, results) {
  let score = 0;
  for (const roundId of Object.keys(picks || {})) {
    const rPicks = picks[roundId] || {};
    const rResults = results[roundId] || {};
    for (const matchKey of Object.keys(rPicks)) {
      const pick = rPicks[matchKey];
      const result = rResults[matchKey];
      if (pick && result && pick.n === result.n) score++;
    }
  }
  return score;
}

/* ══════════════════════════════════════
   SAVE PICKS
══════════════════════════════════════ */
async function savePicks() {
  if (!user || user.locked) return;
  await api(`/entries/${encodeURIComponent(user.email)}/picks`, {
    method: 'PUT',
    body: JSON.stringify({ picks: roundPicks })
  });
}

/* ══════════════════════════════════════
   RENDER BRACKET TAB
══════════════════════════════════════ */
function renderBracket() {
  const el = document.getElementById('panel-bracket');
  if (!el) return;

  const score = calcScore(roundPicks, roundResults);
  const totalResults = Object.values(roundResults).reduce((s, r) => s + Object.keys(r).length, 0);

  let html = `
    <div class="wbar" id="wbar-content">
      <div class="av" style="width:34px;height:34px;font-size:12px;">${user ? user.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2) : '?'}</div>
      <div style="flex:1">
        <div class="wname">${user ? user.name : ''}</div>
        <div class="wsub">${user ? user.email : ''} · ${user?.locked ? '🔒 Picks locked' : 'Picks open'}</div>
      </div>
      ${totalResults > 0 ? `<div style="text-align:right"><div style="font-size:20px;font-weight:700;color:var(--gold)">${score}</div><div style="font-size:10px;color:var(--t2);text-transform:uppercase;letter-spacing:.06em">Points</div></div>` : ''}
    </div>`;

  // Round tabs
  html += `<div class="round-tabs">`;
  for (const r of ROUNDS) {
    const isActive = bracketState.activeRound === r.id;
    const isDone = isRoundDone(r.id);
    const hasResults = Object.keys(roundResults[r.id] || {}).length > 0;
    html += `<div class="round-tab${isActive ? ' rt-active' : isDone ? ' rt-done' : ''}" onclick="switchRound('${r.id}')">
      <div class="rt-label">${r.label}</div>
      ${hasResults ? '<div class="rt-dot rt-confirmed"></div>' : isActive ? '<div class="rt-dot rt-open"></div>' : '<div class="rt-dot rt-pending"></div>'}
    </div>`;
  }
  html += `</div>`;

  // Render each round section
  for (const round of ROUNDS) {
    html += renderRoundSection(round);
  }

  el.innerHTML = html;
}

function isRoundDone(roundId) {
  const idx = ROUNDS.findIndex(r => r.id === roundId);
  const activeIdx = ROUNDS.findIndex(r => r.id === bracketState.activeRound);
  return idx < activeIdx;
}

function switchRound(roundId) {
  // scroll to that round section
  const el = document.getElementById(`round-${roundId}`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderRoundSection(round) {
  const matches = getTeamsForRound(round.id);
  const picks = roundPicks[round.id] || {};
  const results = roundResults[round.id] || {};
  const canPick = canPickRound(round.id);
  const isActive = bracketState.activeRound === round.id;
  const prevRound = getPrevRound(round.id);
  const prevDone = !prevRound || Object.keys(roundResults[prevRound.id] || {}).length >= getRound(prevRound.id).matchCount;

  let html = `<div class="round-section${isActive ? ' rs-active' : ''}" id="round-${round.id}">
    <div class="round-header">
      <div class="round-title">${round.label}</div>
      <div class="round-status">`;

  if (Object.keys(results).length > 0) {
    // Count correct picks in this round
    let correct = 0;
    for (const k of Object.keys(results)) {
      if (picks[k] && picks[k].n === results[k].n) correct++;
    }
    html += `<span class="rs-badge rs-confirmed">✓ ${correct}/${Object.keys(results).length} correct</span>`;
  } else if (isActive) {
    const made = Object.keys(picks).length;
    html += `<span class="rs-badge rs-open">Picking · ${made}/${matches.length} made</span>`;
  } else if (!prevDone) {
    html += `<span class="rs-badge rs-pending">Waiting for previous round</span>`;
  } else {
    html += `<span class="rs-badge rs-pending">Not yet open</span>`;
  }

  html += `</div></div><div class="round-matches">`;

  for (let i = 0; i < matches.length; i++) {
    const { t1, t2 } = matches[i];
    const key = `m${i}`;
    const pick = picks[key] || null;
    const result = results[key] || null;

    const w1 = !!(result && t1 && result.n === t1.n);
    const l1 = !!(result && t1 && !w1);
    const w2 = !!(result && t2 && result.n === t2.n);
    const l2 = !!(result && t2 && !w2);

    const p1 = !!(pick && t1 && pick.n === t1.n);
    const p2 = !!(pick && t2 && pick.n === t2.n);
    const correct = !!(pick && result && pick.n === result.n);
    const wrong = !!(pick && result && pick.n !== result.n);

    html += `<div class="match-card${canPick && t1 && t2 ? ' mc-pickable' : ''}${result ? ' mc-done' : ''}">`;

    // Team 1
    html += `<div class="mc-team${w1?' mc-win':l1?' mc-lose':''}" 
      ${canPick && t1 && t2 ? `onclick="pickMatch('${round.id}','${key}',${JSON.stringify(t1).replace(/"/g,'&quot;')})"` : ''}>
      <div class="mc-flag${p1?' mc-picked':''}" style="${canPick&&t1&&t2?'cursor:pointer':''}">${t1 ? t1.f : '?'}</div>
      <div class="mc-name${w1?' mc-win-name':l1?' mc-lose-name':''}">${t1 ? t1.n : 'TBD'}</div>
    </div>`;

    // VS / result
    html += `<div class="mc-vs">`;
    if (result) {
      html += `<div class="mc-result-flag">${result.f}</div><div style="font-size:9px;color:var(--t3);margin-top:2px">${result.n}</div>`;
    } else if (pick) {
      html += `<div style="font-size:9px;font-weight:600;color:${correct?'var(--green)':wrong?'var(--red)':'var(--gold)'}">${correct?'✓':wrong?'✗':'→'} ${pick.n}</div>`;
    } else {
      html += `<div class="vs-txt">VS</div>`;
    }
    html += `</div>`;

    // Team 2
    html += `<div class="mc-team${w2?' mc-win':l2?' mc-lose':''}" 
      ${canPick && t1 && t2 ? `onclick="pickMatch('${round.id}','${key}',${JSON.stringify(t2).replace(/"/g,'&quot;')})"` : ''}>
      <div class="mc-flag${p2?' mc-picked':''}" style="${canPick&&t1&&t2?'cursor:pointer':''}">${t2 ? t2.f : '?'}</div>
      <div class="mc-name${w2?' mc-win-name':l2?' mc-lose-name':''}">${t2 ? t2.n : 'TBD'}</div>
    </div>`;

    html += `</div>`; // match-card
  }

  html += `</div></div>`; // round-matches, round-section
  return html;
}

function pickMatch(roundId, matchKey, team) {
  if (!canPickRound(roundId)) return;
  if (!roundPicks[roundId]) roundPicks[roundId] = {};
  roundPicks[roundId][matchKey] = team;
  renderBracket();
  savePicks();
}

/* ══════════════════════════════════════
   LEADERBOARD TAB (public)
══════════════════════════════════════ */
function renderLeaderboard() {
  const el = document.getElementById('panel-leaderboard');
  if (!el) return;

  if (!entries.length) {
    el.innerHTML = '<div class="card"><div class="empty">No entries yet.</div></div>';
    return;
  }

  // Score everyone
  const scored = entries.map(e => ({
    name: e.name,
    email: e.email,
    score: calcScore(e.picks || {}, roundResults),
    locked: e.locked,
    isMe: user && e.email === user.email,
  })).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  let html = `<div class="card">
    <div class="clabel">Leaderboard</div>
    <table class="lb-table">
      <thead><tr><th>#</th><th>Player</th><th>Points</th><th>Status</th></tr></thead>
      <tbody>`;

  let rank = 1;
  for (let i = 0; i < scored.length; i++) {
    const e = scored[i];
    if (i > 0 && scored[i].score < scored[i-1].score) rank = i + 1;
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`;
    const init = e.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
    html += `<tr class="${e.isMe ? 'lb-me' : ''}">
      <td class="lb-rank">${medal}</td>
      <td><div style="display:flex;align-items:center;gap:9px;">
        <div class="av" style="width:28px;height:28px;font-size:10px;background:${e.isMe?'var(--gold)':'var(--s3)'};color:${e.isMe?'#1a0e00':'var(--t2)'};">${init}</div>
        <div style="font-weight:${e.isMe?'700':'500'};color:${e.isMe?'var(--gold)':'var(--text)'};">${e.name}${e.isMe?' (you)':''}</div>
      </div></td>
      <td class="lb-score">${e.score}</td>
      <td><span class="bdg ${e.locked?'bg':'bd'}">${e.locked?'🔒':'Open'}</span></td>
    </tr>`;
  }

  html += `</tbody></table></div>`;
  el.innerHTML = html;
}

/* ══════════════════════════════════════
   ENTRIES TABLE (admin only)
══════════════════════════════════════ */
function renderEntries() {
  const el = document.getElementById('panel-entries');
  if (!el) return;

  if (!adminPass) {
    el.innerHTML = `<div class="card">
      <div class="clabel">Admin access only</div>
      <div style="display:flex;flex-direction:column;gap:10px;max-width:300px;">
        <input type="password" id="apass" placeholder="Admin password" style="font-family:inherit;font-size:13px;padding:9px 12px;border:1px solid var(--b2);border-radius:6px;background:var(--s2);color:var(--text);outline:none;width:100%;" onkeydown="if(event.key==='Enter')adminLogin()"/>
        <div style="display:flex;align-items:center;gap:10px;">
          <button class="btn btn-p" onclick="adminLogin()">Login →</button>
          <span style="font-size:12px;color:var(--red);display:none;" id="loginErr">Wrong password</span>
        </div>
      </div></div>`;
    return;
  }

  if (!entries.length) { el.innerHTML = '<div class="card"><div class="empty">No entries yet.</div></div>'; return; }

  const scored = entries.map(e => ({ ...e, score: calcScore(e.picks||{}, roundResults) }))
    .sort((a,b) => b.score - a.score);

  let html = `<div class="card"><div class="clabel">All entries (${entries.length})</div>
    <table class="etbl">
      <thead><tr><th>Player</th><th>Score</th><th>Status</th><th>Actions</th></tr></thead><tbody>`;

  for (const e of scored) {
    const init = e.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
    const esc = e.email.replace(/'/g,"\\'");
    html += `<tr>
      <td><div style="display:flex;align-items:center;gap:9px;">
        <div class="av" style="width:28px;height:28px;font-size:10px;">${init}</div>
        <div><div style="font-weight:600;color:var(--text);">${e.name}</div><div style="font-size:10px;color:var(--t3);">${e.email}</div></div>
      </div></td>
      <td style="font-weight:700;color:var(--gold);font-size:16px;">${e.score}</td>
      <td><span class="bdg ${e.locked?'bg':'bd'}">${e.locked?'🔒 Locked':'Open'}</span></td>
      <td><div style="display:flex;gap:6px;">
        <button class="btn btn-d" style="font-size:10px;padding:3px 8px;" onclick="adminResetEntry('${esc}')">Reset</button>
        ${e.locked?`<button class="btn" style="font-size:10px;padding:3px 8px;" onclick="adminUnlockEntry('${esc}')">Unlock</button>`:''}
      </div></td>
    </tr>`;
  }
  html += `</tbody></table></div>`;
  el.innerHTML = html;
}

/* ══════════════════════════════════════
   TABS
══════════════════════════════════════ */
function showTab(name, el) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.ntab').forEach(t => t.classList.remove('active'));
  const panel = document.getElementById('panel-' + name);
  if (panel) panel.classList.add('active');
  if (el) el.classList.add('active');
  currentTab = name;
  if (name === 'leaderboard') renderLeaderboard();
  if (name === 'entries') renderEntries();
}

/* ══════════════════════════════════════
   ADMIN CONTROLS
══════════════════════════════════════ */
async function adminLogin() {
  const pass = document.getElementById('apass')?.value || '';
  const r = await api('/admin/verify', { method:'POST', body: JSON.stringify({ pass }) });
  if (r?.ok) {
    adminPass = pass; sessionStorage.setItem('adminPass', pass);
    document.getElementById('abar').classList.add('on');
    renderEntries();
  } else {
    const err = document.getElementById('loginErr');
    if (err) { err.style.display='inline'; setTimeout(()=>err.style.display='none',3000); }
  }
}

function adminLogout() {
  adminPass = null; sessionStorage.removeItem('adminPass');
  document.getElementById('abar').classList.remove('on');
  renderEntries();
}

async function setActiveRound(roundId) {
  bracketState.activeRound = roundId;
  await api('/bracket-state', { method:'PUT', body: JSON.stringify({ activeRound: roundId }) });
  renderBracket();
}

async function startTournament() {
  if (!confirm('Lock all picks? No changes after this.')) return;
  bracketState.tournamentStarted = true;
  await api('/bracket-state', { method:'PUT', body: JSON.stringify({ tournamentStarted: true }) });
  renderBracket();
}

async function stopTournament() {
  bracketState.tournamentStarted = false;
  await api('/bracket-state', { method:'PUT', body: JSON.stringify({ tournamentStarted: false }) });
  renderBracket();
}

async function manualSync() {
  const btn = document.getElementById('sync-btn');
  const st  = document.getElementById('sync-status');
  if (btn) { btn.disabled=true; btn.textContent='↻ Syncing…'; }
  const r = await api('/admin/sync-results', { method:'POST' });
  if (btn) { btn.disabled=false; btn.textContent='↻ Sync results'; }
  if (r?.ok) {
    if (st) st.textContent = `Synced · ${r.lastSync ? new Date(r.lastSync).toLocaleTimeString() : 'now'}`;
    await loadAll();
  }
}

async function adminResetEntry(email) {
  if (!confirm(`Reset picks for ${email}?`)) return;
  const r = await api(`/admin/entries/${encodeURIComponent(email)}/reset`, { method:'PUT' });
  if (r?.ok) { await loadAll(); renderEntries(); }
}

async function adminUnlockEntry(email) {
  if (!confirm(`Unlock picks for ${email}?`)) return;
  const r = await api(`/admin/entries/${encodeURIComponent(email)}/unlock`, { method:'PUT' });
  if (r?.ok) { await loadAll(); renderEntries(); }
}

async function adminResetMyPicks() {
  if (!user) return;
  await adminResetEntry(user.email);
  await refreshUser();
  renderBracket();
}

async function lockMyPicks() {
  if (!user || user.locked) return;
  if (!confirm('Lock your picks? You cannot change them after this.')) return;
  const r = await api(`/entries/${encodeURIComponent(user.email)}/lock`, { method:'PUT' });
  if (r?.ok) { user.locked = true; sessionStorage.setItem('wcUser', JSON.stringify(user)); renderBracket(); }
}

/* ══════════════════════════════════════
   HELPERS
══════════════════════════════════════ */
function logout() {
  sessionStorage.removeItem('wcUser');
  window.location.href = '/';
}

async function refreshUser() {
  if (!user) return;
  const fresh = await fetch(`${API}/entries/${encodeURIComponent(user.email)}`).then(r=>r.ok?r.json():null).catch(()=>null);
  if (fresh && !fresh.error) {
    user = { ...user, ...fresh };
    sessionStorage.setItem('wcUser', JSON.stringify(user));
    roundPicks = fresh.picks || {};
  }
}

async function loadAll() {
  const [st, res, ents] = await Promise.all([
    api('/bracket-state'),
    api('/results'),
    adminPass ? api('/entries') : fetch(`${API}/leaderboard`).then(r=>r.ok?r.json():[]).catch(()=>[]),
  ]);

  if (st && !st.error) bracketState = { ...bracketState, ...st };
  if (res && !res.error) roundResults = res;
  if (Array.isArray(ents)) entries = ents;

  updateAdminRoundSelector();
}

function updateAdminRoundSelector() {
  const sel = document.getElementById('round-selector');
  if (!sel) return;
  sel.value = bracketState.activeRound || 'r32';
}

/* ══════════════════════════════════════
   BOOT
══════════════════════════════════════ */
(async function init() {
  let sessionUser = null;
  try { sessionUser = JSON.parse(sessionStorage.getItem('wcUser')); } catch {}
  if (!sessionUser) { window.location.href = '/login'; return; }
  user = sessionUser;

  document.getElementById('logout-btn').style.display = 'block';

  if (user.isAdmin) {
    if (adminPass) { document.getElementById('abar').classList.add('on'); }
    document.getElementById('tab-entries').style.display = '';
  }

  await loadAll();
  await refreshUser();

  renderBracket();

  // Auto-refresh leaderboard every 60s
  setInterval(async () => {
    await loadAll();
    if (currentTab === 'leaderboard') renderLeaderboard();
    if (currentTab === 'bracket') renderBracket();
  }, 60000);
})();
