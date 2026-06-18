const API = '/api';

const DEMO = [
  {n:'Germany',    f:'🇩🇪'}, {n:'Scotland',   f:'🏴󠁧󠁢󠁳󠁣󠁴󠁿'},
  {n:'France',     f:'🇫🇷'}, {n:'Egypt',      f:'🇪🇬'},
  {n:'Netherlands',f:'🇳🇱'}, {n:'Morocco',    f:'🇲🇦'},
  {n:'Spain',      f:'🇪🇸'}, {n:'Austria',    f:'🇦🇹'},
  {n:'USA',        f:'🇺🇸'}, {n:'Bosnia',     f:'🇧🇦'},
  {n:'Belgium',    f:'🇧🇪'}, {n:'S. Korea',   f:'🇰🇷'},
  {n:'Colombia',   f:'🇨🇴'}, {n:'Croatia',    f:'🇭🇷'},
  {n:'Canada',     f:'🇨🇦'}, {n:'Ivory Coast',f:'🇨🇮'},
  {n:'Brazil',     f:'🇧🇷'}, {n:'Japan',      f:'🇯🇵'},
  {n:'England',    f:'🏴󠁧󠁢󠁥󠁮󠁧󠁿'}, {n:'Senegal',    f:'🇸🇳'},
  {n:'Argentina',  f:'🇦🇷'}, {n:'Ecuador',    f:'🇪🇨'},
  {n:'Portugal',   f:'🇵🇹'}, {n:'Turkey',     f:'🇹🇷'},
  {n:'Mexico',     f:'🇲🇽'}, {n:'Sweden',     f:'🇸🇪'},
  {n:'Australia',  f:'🇦🇺'}, {n:'Norway',     f:'🇳🇴'},
  {n:'Switzerland',f:'🇨🇭'}, {n:'Algeria',    f:'🇩🇿'},
  {n:'Uruguay',    f:'🇺🇾'}, {n:'Iran',       f:'🇮🇷'},
];

/* ── state ── */
let locked   = false;
let user     = null;
let entries  = [];
let teams    = DEMO.slice();
let adminPass = sessionStorage.getItem('adminPass') || null;

/* ── bracket data ──
   We store matches in a flat object keyed by id.
   Structure (per side, left as example):
     l_r16_0 … l_r16_7   (8 matches, teams from DEMO[0..15])
     l_qf_0  … l_qf_3    (4 matches, fed by r16)
     l_sf_0  … l_sf_1    (2 matches, fed by qf)
     l_sf_final           (1 match,  fed by sf — winner = left finalist)
   Same for right side (r_*), teams from DEMO[16..31]
   final                  (1 match,  fed by l_sf_final + r_sf_final)
*/
let M = {}; // match map

function newM(id, t1, t2, src1, src2) {
  return { id, t1: t1||null, t2: t2||null, w: null, src1: src1||null, src2: src2||null };
}

function initMatches() {
  M = {};
  const T = teams;

  // left R16
  for (let i = 0; i < 8; i++) {
    const m = newM('l_r16_'+i, T[i*2], T[i*2+1]);
    M[m.id] = m;
  }
  // left QF
  for (let i = 0; i < 4; i++) {
    const m = newM('l_qf_'+i, null, null, 'l_r16_'+(i*2), 'l_r16_'+(i*2+1));
    M[m.id] = m;
  }
  // left SF
  for (let i = 0; i < 2; i++) {
    const m = newM('l_sf_'+i, null, null, 'l_qf_'+(i*2), 'l_qf_'+(i*2+1));
    M[m.id] = m;
  }
  // left SF final (2 SF winners → 1 left finalist)
  M['l_sff'] = newM('l_sff', null, null, 'l_sf_0', 'l_sf_1');

  // right R16
  for (let i = 0; i < 8; i++) {
    const m = newM('r_r16_'+i, T[16+i*2], T[16+i*2+1]);
    M[m.id] = m;
  }
  // right QF
  for (let i = 0; i < 4; i++) {
    const m = newM('r_qf_'+i, null, null, 'r_r16_'+(i*2), 'r_r16_'+(i*2+1));
    M[m.id] = m;
  }
  // right SF
  for (let i = 0; i < 2; i++) {
    const m = newM('r_sf_'+i, null, null, 'r_qf_'+(i*2), 'r_qf_'+(i*2+1));
    M[m.id] = m;
  }
  // right SF final
  M['r_sff'] = newM('r_sff', null, null, 'r_sf_0', 'r_sf_1');

  // THE FINAL
  M['final'] = newM('final', null, null, 'l_sff', 'r_sff');
}

function propagate() {
  const order = [
    'l_qf_0','l_qf_1','l_qf_2','l_qf_3',
    'l_sf_0','l_sf_1',
    'l_sff',
    'r_qf_0','r_qf_1','r_qf_2','r_qf_3',
    'r_sf_0','r_sf_1',
    'r_sff',
    'final'
  ];
  for (const id of order) {
    const m = M[id];
    if (!m.src1) continue;
    m.t1 = M[m.src1]?.w || null;
    m.t2 = M[m.src2]?.w || null;
    // clear winner if teams changed
    if (m.w && m.t1 && m.t2) {
      if (m.w.n !== m.t1.n && m.w.n !== m.t2.n) m.w = null;
    } else if (m.w && (!m.t1 || !m.t2)) {
      m.w = null;
    }
  }
}

/* ── API ── */
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (adminPass) headers['x-admin-pass'] = adminPass;
  try {
    const r = await fetch(API + path, { headers, ...opts });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  } catch(e) {
    return null;
  }
}

/* ── PICK ── */
async function pick(matchId, team) {
  if (locked || !user || !team) return;
  const m = M[matchId];
  if (!m) return;
  m.w = team;
  propagate();
  render();
  await savepicks();
}

/* ── BUILD A MATCH CARD ── */
function makeCard(matchId) {
  const m = M[matchId];
  const can = !locked && !!user;
  const { t1, t2, w } = m;

  const wrap = document.createElement('div');
  wrap.className = 'mu';

  if (!t1 && !t2) {
    const tbd = document.createElement('div');
    tbd.className = 'tbd-card';
    tbd.textContent = 'TBD';
    wrap.appendChild(tbd);
    return wrap;
  }

  const card = document.createElement('div');
  card.className = 'mcard' + (can && t1 && t2 ? '' : ' mlocked');

  // flag circles row
  const row = document.createElement('div');
  row.className = 'mcard-teams';

  function fc(team, win, lose) {
    const el = document.createElement('div');
    el.className = 'flag-circle' + (win ? ' fc-win' : lose ? ' fc-lose' : !team ? ' fc-tbd' : '');
    el.textContent = team ? team.f : '?';
    return el;
  }

  const w1 = w && t1 && w.n === t1.n;
  const l1 = w && t1 && w.n !== t1.n;
  const w2 = w && t2 && w.n === t2.n;
  const l2 = w && t2 && w.n !== t2.n;

  const f1 = fc(t1, w1, l1);
  const f2 = fc(t2, w2, l2);

  const mid = document.createElement('div');
  mid.className = 'vs-mid';
  mid.innerHTML = `<div class="vs-text">VS</div>
    <div class="vs-names">
      <div class="vname${w1?' vwin':l1?' vlose':''}">${t1 ? t1.n : '—'}</div>
      <div class="vname${w2?' vwin':l2?' vlose':''}">${t2 ? t2.n : '—'}</div>
    </div>`;

  row.append(f1, mid, f2);
  card.appendChild(row);

  if (w) {
    const wr = document.createElement('div');
    wr.className = 'winner-row';
    wr.innerHTML = `<span class="wflag">${w.f}</span> ${w.n} advances`;
    card.appendChild(wr);
  }

  if (can && t1 && t2) {
    [f1, f2].forEach((fc, i) => {
      const team = i === 0 ? t1 : t2;
      fc.style.cursor = 'pointer';
      fc.addEventListener('click', e => { e.stopPropagation(); pick(matchId, team); });
      fc.addEventListener('mouseenter', () => fc.style.borderColor = 'var(--gold)');
      fc.addEventListener('mouseleave',  () => fc.style.borderColor = '');
    });
  }

  wrap.appendChild(card);
  return wrap;
}

function makeCol(ids, label) {
  const col = document.createElement('div');
  col.className = 'rcol';
  col.innerHTML = `<div class="rlbl">${label}</div>`;
  const ms = document.createElement('div');
  ms.className = 'rmatches';
  for (const id of ids) ms.appendChild(makeCard(id));
  col.appendChild(ms);
  return col;
}

function makeFinalCol() {
  const can = !locked && !!user;
  const f = M['final'];
  const { t1, t2, w } = f;

  const col = document.createElement('div');
  col.className = 'ccol';

  const card = document.createElement('div');
  card.className = 'fin-card' + (can && t1 && t2 ? '' : ' mlocked');

  const lbl = document.createElement('div');
  lbl.className = 'finlbl';
  lbl.textContent = 'Final';

  const row = document.createElement('div');
  row.className = 'fin-teams';

  function ff(team, win, lose) {
    const el = document.createElement('div');
    el.className = 'fin-flag' + (win ? ' fw' : lose ? ' fl' : !team ? ' ft' : '');
    el.textContent = team ? team.f : '?';
    return el;
  }

  const w1 = w && t1 && w.n === t1.n, l1 = w && t1 && !w1;
  const w2 = w && t2 && w.n === t2.n, l2 = w && t2 && !w2;
  const ff1 = ff(t1, w1, l1);
  const fvs = document.createElement('div'); fvs.className = 'fin-vs'; fvs.textContent = 'VS';
  const ff2 = ff(t2, w2, l2);
  row.append(ff1, fvs, ff2);

  const trophy = document.createElement('div'); trophy.className = 'trophy-ring'; trophy.textContent = '🏆';
  const cl = document.createElement('div'); cl.className = 'champ-lbl'; cl.textContent = 'World Champion';
  const cv = document.createElement('div'); cv.className = 'champ-val';
  cv.textContent = w ? w.f + ' ' + w.n : '—';

  card.append(lbl, row, trophy, cl, cv);

  if (can && t1 && t2) {
    [ff1, ff2].forEach((el, i) => {
      const team = i === 0 ? t1 : t2;
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => pick('final', team));
    });
  }

  col.appendChild(card);
  return col;
}

/* ── RENDER ── */
function render() {
  const outer = document.getElementById('bouter');
  if (!outer) return;
  outer.innerHTML = '';

  // LEFT half — R16 → QF → SF → SF-Final (flows right toward centre)
  const left = document.createElement('div');
  left.className = 'half hleft';
  left.appendChild(makeCol(['l_r16_0','l_r16_1','l_r16_2','l_r16_3','l_r16_4','l_r16_5','l_r16_6','l_r16_7'], 'Round of 16'));
  left.appendChild(makeCol(['l_qf_0','l_qf_1','l_qf_2','l_qf_3'], 'Quarter-finals'));
  left.appendChild(makeCol(['l_sf_0','l_sf_1'], 'Semi-finals'));
  left.appendChild(makeCol(['l_sff'], 'SF Final'));
  outer.appendChild(left);

  // CENTRE — The Final
  outer.appendChild(makeFinalCol());

  // RIGHT half — SF-Final → SF → QF → R16 (flows left toward centre)
  const right = document.createElement('div');
  right.className = 'half hright';
  right.appendChild(makeCol(['r_sff'], 'SF Final'));
  right.appendChild(makeCol(['r_sf_0','r_sf_1'], 'Semi-finals'));
  right.appendChild(makeCol(['r_qf_0','r_qf_1','r_qf_2','r_qf_3'], 'Quarter-finals'));
  right.appendChild(makeCol(['r_r16_0','r_r16_1','r_r16_2','r_r16_3','r_r16_4','r_r16_5','r_r16_6','r_r16_7'], 'Round of 16'));
  outer.appendChild(right);

  renderProg();
}

function renderProg() {
  const s = document.getElementById('pstrip');
  if (!s) return;
  if (!user || locked) { s.style.display = 'none'; return; }
  s.style.display = 'flex';
  const made = Object.values(M).filter(m => m.w).length;
  const champ = M['final'].w;
  s.innerHTML = `
    <div class="pi"><div class="plbl">Picks made</div><div class="pval">${made}/31</div></div>
    <div class="pi"><div class="plbl">Remaining</div><div class="pval">${31-made}</div></div>
    <div class="pi"><div class="plbl">My champion</div><div class="pval" style="font-size:14px;">${champ ? champ.f+' '+champ.n : '—'}</div></div>`;
}

/* ── TABS ── */
function showTab(name, el) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.ntab').forEach(t => t.classList.remove('active'));
  document.getElementById('panel-' + name).classList.add('active');
  el.classList.add('active');
  if (name === 'entries') renderEntries();
}

/* ── ENTRY FORM ── */
async function registerEntry() {
  const name  = document.getElementById('iname').value.trim();
  const email = document.getElementById('iemail').value.trim();
  const msg   = document.getElementById('fmsg');
  if (!name)  return setMsg(msg, 'Please enter your name.', 'err');
  if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) return setMsg(msg, 'Please enter a valid email.', 'err');

  const d = await api('/entries', { method: 'POST', body: JSON.stringify({ name, email }) });
  if (!d) return setMsg(msg, 'Could not save — try again.', 'err');

  user = d;
  setMsg(msg, d.created ? 'Details saved!' : 'Welcome back!', 'ok');

  if (d.picks && Object.keys(d.picks).length) {
    initMatches();
    for (const [id, team] of Object.entries(d.picks)) {
      if (M[id]) M[id].w = team;
    }
    propagate();
  }

  await loadEntries();
  showWelcome();
  render();
}

async function loadEntries() {
  const d = await api('/entries');
  if (d) entries = d;
}

async function savepicks() {
  if (!user) return;
  const picks = {};
  for (const [id, m] of Object.entries(M)) if (m.w) picks[id] = m.w;
  const champion = M['final'].w || null;
  await api(`/entries/${encodeURIComponent(user.email)}/picks`, {
    method: 'PUT', body: JSON.stringify({ picks, champion })
  });
  const i = entries.findIndex(e => e.email === user.email);
  if (i >= 0) { entries[i].picks = picks; entries[i].champion = champion; }
}

function showWelcome() {
  const wb = document.getElementById('wbar');
  const es = document.getElementById('entrySection');
  if (!user) { wb.style.display = 'none'; es.style.display = 'block'; return; }
  es.style.display = 'none'; wb.style.display = 'block';
  const init = user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  wb.innerHTML = `<div class="wbar">
    <div class="av" style="width:32px;height:32px;font-size:11px;">${init}</div>
    <div style="flex:1"><div class="wname">${user.name}</div><div class="wsub">${user.email}</div></div>
    <button class="btn" onclick="switchUser()" style="font-size:11px;">Not you?</button>
  </div>`;
}

function switchUser() {
  user = null; initMatches();
  document.getElementById('iname').value = '';
  document.getElementById('iemail').value = '';
  document.getElementById('fmsg').textContent = '';
  showWelcome(); render();
}

/* ── ENTRIES (admin only) ── */
function renderEntries() {
  const list = document.getElementById('elist');
  if (!list) return;
  if (adminPass) { showEntriesTable(); return; }
  list.innerHTML = `
    <div style="max-width:320px;margin:0 auto;padding:1.5rem 0;">
      <p style="font-size:13px;color:var(--t2);margin-bottom:1rem;">Admin access only. Enter your password to view all entries.</p>
      <div class="field" style="margin-bottom:10px;">
        <label for="apass">Admin password</label>
        <input type="password" id="apass" placeholder="Password" onkeydown="if(event.key==='Enter')adminLogin()"/>
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:10px;">
        <button class="btn btn-p" onclick="adminLogin()">Login →</button>
        <span class="fmsg err" id="loginErr" style="display:none;">Wrong password</span>
      </div>
    </div>`;
}

async function adminLogin() {
  const pass = document.getElementById('apass')?.value || '';
  const d = await api('/admin/verify', { method: 'POST', body: JSON.stringify({ pass }) });
  if (d?.ok) {
    adminPass = pass;
    sessionStorage.setItem('adminPass', pass);
    document.getElementById('abar').classList.add('on');
    await loadEntries();
    showEntriesTable();
  } else {
    const err = document.getElementById('loginErr');
    if (err) { err.style.display = 'inline'; setTimeout(() => err.style.display = 'none', 3000); }
  }
}

function adminLogout() {
  adminPass = null;
  sessionStorage.removeItem('adminPass');
  document.getElementById('abar').classList.remove('on');
  renderEntries();
}

function showEntriesTable() {
  const list = document.getElementById('elist');
  if (!list) return;
  if (!entries.length) { list.innerHTML = '<div class="empty">No entries yet.</div>'; return; }
  const rows = entries.map(e => {
    const p   = Object.keys(e.picks || {}).length;
    const pct = Math.round((p / 31) * 100);
    const init = e.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const saved = e.lastSaved ? new Date(e.lastSaved).toLocaleDateString() : '—';
    return `<tr>
      <td><div style="display:flex;align-items:center;gap:9px;">
        <div class="av" style="width:28px;height:28px;font-size:10px;">${init}</div>
        <div><div style="font-weight:600;color:var(--text);">${e.name}</div>
             <div style="font-size:10px;color:var(--t3);">${e.email}</div></div>
      </div></td>
      <td>${e.champion ? e.champion.f+' '+e.champion.n : '<span style="color:var(--t3)">Not picked</span>'}</td>
      <td><div style="display:flex;align-items:center;gap:8px;">
        <div style="flex:1;height:3px;background:var(--b2);border-radius:2px;min-width:60px;">
          <div style="height:3px;background:var(--gold);border-radius:2px;width:${pct}%;"></div>
        </div>
        <span class="bdg ${p===31?'bg':p>0?'bgg':'bd'}">${p}/31</span>
      </div></td>
      <td style="color:var(--t3);font-size:11px;">${saved}</td>
    </tr>`;
  }).join('');
  list.innerHTML = `<table class="etbl">
    <thead><tr><th>Player</th><th>Champion pick</th><th>Progress</th><th>Last saved</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/* ── ADMIN BRACKET CONTROLS ── */
async function unlockBracket() {
  locked = false;
  await api('/bracket-state', { method: 'PUT', body: JSON.stringify({ locked: false, teams: teams.map(t=>({name:t.n,flag:t.f})) }) });
  setStatus(false); render();
}
async function lockBracket() {
  locked = true;
  await api('/bracket-state', { method: 'PUT', body: JSON.stringify({ locked: true, teams: [] }) });
  setStatus(true); render();
}
async function resetPicks() {
  if (!user) return;
  await api(`/entries/${encodeURIComponent(user.email)}/picks`, { method: 'PUT', body: JSON.stringify({ picks: {}, champion: null }) });
  initMatches(); render();
}

/* ── HELPERS ── */
function setStatus(l) {
  const b = document.getElementById('sbadge');
  if (!b) return;
  b.className = 'sbadge ' + (l ? 'locked' : 'open');
  document.getElementById('slabel').textContent = l ? 'Bracket locked' : 'Picks open';
}
function setMsg(el, t, type) { el.textContent = t; el.className = 'fmsg ' + type; }

/* ── BOOT ── */
(async function init() {
  if (adminPass) document.getElementById('abar').classList.add('on');

  // default: show demo teams unlocked so bracket is visible immediately
  teams  = DEMO.slice();
  locked = false;
  initMatches();
  setStatus(false);
  render(); // render immediately with demo teams

  // sync with server — always use server teams if available, ignore locked state
  const st = await api('/bracket-state');
  if (st) {
    // use server teams if we have 32 of them
    if (st.teams && st.teams.length === 32) {
      teams = st.teams.map(t => ({ n: t.name || t.n, f: t.flag || t.f }));
    }
    // only lock if admin explicitly locked it
    locked = !!st.locked;
    initMatches();
    setStatus(locked);
    render();
  }

  await loadEntries();
})();
