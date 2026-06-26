/* ══════════════════════════════════════
   2026 WORLD CUP PREDICTOR — app.js
══════════════════════════════════════ */
const API = '/api';
const TOTAL_PICKS = 32; // 31 bracket matches + 1 third place

const DEMO = [
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
let locked = false, tournamentStarted = false;
let user = null, entries = [], teams = DEMO.slice(), results = {};
let adminPass = sessionStorage.getItem('adminPass') || null;
let M = {}; // match map

/* ══════════════════════════════════════
   MATCH MAP
   Bracket structure:
   Left:  l_r16_0..7 → l_qf_0..3 → l_sf_0..1 → l_sff (left finalist)
   Right: r_r16_0..7 → r_qf_0..3 → r_sf_0..1 → r_sff (right finalist)
   Final: l_sff winner vs r_sff winner
   Third: l_sff loser  vs r_sff loser
══════════════════════════════════════ */
function newM(id, t1, t2, s1, s2) {
  return { id, t1: t1||null, t2: t2||null, w: null, s1: s1||null, s2: s2||null };
}

function initMatches() {
  M = {};
  const T = teams;
  // left R16
  for (let i = 0; i < 8; i++) M[`l_r16_${i}`] = newM(`l_r16_${i}`, T[i*2], T[i*2+1]);
  // left QF
  for (let i = 0; i < 4; i++) M[`l_qf_${i}`] = newM(`l_qf_${i}`, null, null, `l_r16_${i*2}`, `l_r16_${i*2+1}`);
  // left SF
  for (let i = 0; i < 2; i++) M[`l_sf_${i}`] = newM(`l_sf_${i}`, null, null, `l_qf_${i*2}`, `l_qf_${i*2+1}`);
  // left SF Final (2 SF winners → 1 left finalist)
  M['l_sff'] = newM('l_sff', null, null, 'l_sf_0', 'l_sf_1');
  // right R16
  for (let i = 0; i < 8; i++) M[`r_r16_${i}`] = newM(`r_r16_${i}`, T[16+i*2], T[16+i*2+1]);
  // right QF
  for (let i = 0; i < 4; i++) M[`r_qf_${i}`] = newM(`r_qf_${i}`, null, null, `r_r16_${i*2}`, `r_r16_${i*2+1}`);
  // right SF
  for (let i = 0; i < 2; i++) M[`r_sf_${i}`] = newM(`r_sf_${i}`, null, null, `r_qf_${i*2}`, `r_qf_${i*2+1}`);
  // right SF Final
  M['r_sff'] = newM('r_sff', null, null, 'r_sf_0', 'r_sf_1');
  // The Final
  M['final'] = newM('final', null, null, 'l_sff', 'r_sff');
  // Third place (losers of l_sff and r_sff — set in propagate)
  M['third'] = newM('third', null, null, null, null);
}

const PROP_ORDER = [
  'l_qf_0','l_qf_1','l_qf_2','l_qf_3',
  'l_sf_0','l_sf_1','l_sff',
  'r_qf_0','r_qf_1','r_qf_2','r_qf_3',
  'r_sf_0','r_sf_1','r_sff',
  'final'
];

function propagate() {
  for (const id of PROP_ORDER) {
    const m = M[id];
    m.t1 = M[m.s1]?.w || null;
    m.t2 = M[m.s2]?.w || null;
    if (m.w && m.t1 && m.t2 && m.w.n !== m.t1.n && m.w.n !== m.t2.n) m.w = null;
    else if (m.w && (!m.t1 || !m.t2)) m.w = null;
  }
  // Third place: losers of l_sff and r_sff
  const ls = M['l_sff'], rs = M['r_sff'], tp = M['third'];
  tp.t1 = ls.w ? (ls.w.n === ls.t1?.n ? ls.t2 : ls.t1) : null;
  tp.t2 = rs.w ? (rs.w.n === rs.t1?.n ? rs.t2 : rs.t1) : null;
  if (tp.w && tp.t1 && tp.t2 && tp.w.n !== tp.t1.n && tp.w.n !== tp.t2.n) tp.w = null;
  else if (tp.w && (!tp.t1 || !tp.t2)) tp.w = null;
}

/* ══════════════════════════════════════
   API
══════════════════════════════════════ */
async function api(path, opts = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (adminPass) h['x-admin-pass'] = adminPass;
  try {
    const r = await fetch(API + path, { headers: h, ...opts });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw e; }
    return r.json();
  } catch(e) { return e || null; }
}

/* ══════════════════════════════════════
   PICKS
══════════════════════════════════════ */
function canPick() { return !locked && !tournamentStarted && !!user && !user.locked; }

async function pick(matchId, team) {
  if (!canPick() || !team) return;
  const m = M[matchId]; if (!m) return;
  m.w = team; propagate(); render(); await savePicks();
}

async function savePicks() {
  if (!user || user.locked) return;
  const picks = {};
  for (const [id, m] of Object.entries(M)) if (m.w) picks[id] = m.w;
  const champion = M['final'].w || null;
  await api(`/entries/${encodeURIComponent(user.email)}/picks`, {
    method: 'PUT', body: JSON.stringify({ picks, champion })
  });
  const i = entries.findIndex(e => e.email === user.email);
  if (i >= 0) { entries[i].picks = picks; entries[i].champion = champion; }
}

async function lockMyPicks() {
  if (!user || user.locked) return;
  if (!confirm('Lock your picks permanently? You won\'t be able to change them after this.')) return;
  const r = await api(`/entries/${encodeURIComponent(user.email)}/lock`, { method: 'PUT' });
  if (r?.ok) { user.locked = true; showWelcome(); render(); }
}

async function refreshUser() {
  if (!user) return;
  const fresh = await fetch(`${API}/entries/${encodeURIComponent(user.email)}`).then(r => r.ok ? r.json() : null).catch(() => null);
  if (!fresh || fresh.error) return;
  user = { ...user, ...fresh };
  sessionStorage.setItem('wcUser', JSON.stringify(user));
  initMatches();
  if (fresh.picks) { for (const [id, t] of Object.entries(fresh.picks)) if (M[id]) M[id].w = t; }
  propagate(); showWelcome(); render();
}

/* ══════════════════════════════════════
   BUILD MATCH CARD
══════════════════════════════════════ */
function makeCard(matchId) {
  const m = M[matchId];
  const can = canPick();
  const { t1, t2, w } = m;
  const wrap = document.createElement('div'); wrap.className = 'mu';

  if (!t1 && !t2) {
    const d = document.createElement('div'); d.className = 'tbd-card'; d.textContent = 'TBD';
    wrap.appendChild(d); return wrap;
  }

  const card = document.createElement('div');
  card.className = 'mcard' + (can && t1 && t2 ? '' : ' mlocked');

  const w1 = !!(w && t1 && w.n === t1.n), l1 = !!(w && t1 && !w1);
  const w2 = !!(w && t2 && w.n === t2.n), l2 = !!(w && t2 && !w2);
  const real = results[matchId] || null;
  const correct = !!(w && real && w.n === real.n);
  const wrong   = !!(w && real && w.n !== real.n);

  function mkFC(team, win, lose) {
    const el = document.createElement('div');
    el.className = 'flag-circle' + (win ? ' fc-win' : lose ? ' fc-lose' : '');
    el.textContent = team ? team.f : '?'; return el;
  }
  const f1 = mkFC(t1, w1, l1), f2 = mkFC(t2, w2, l2);

  const mid = document.createElement('div'); mid.className = 'vs-mid';
  mid.innerHTML = `<div class="vs-text">VS</div>
    <div class="vs-names">
      <div class="vname${w1?' vwin':l1?' vlose':''}">${t1 ? t1.n : '—'}</div>
      <div class="vname${w2?' vwin':l2?' vlose':''}">${t2 ? t2.n : '—'}</div>
    </div>`;

  const row = document.createElement('div'); row.className = 'mcard-teams';
  row.append(f1, mid, f2); card.appendChild(row);

  if (w) {
    const wr = document.createElement('div');
    wr.className = 'winner-row' + (correct ? ' correct' : wrong ? ' wrong' : '');
    wr.innerHTML = `<span>${w.f}</span> ${w.n}${correct ? ' ✓' : wrong ? ' ✗' : ''}`;
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
  wrap.appendChild(card); return wrap;
}

function makeCol(ids, label) {
  const col = document.createElement('div'); col.className = 'rcol';
  col.innerHTML = `<div class="rlbl">${label}</div>`;
  const ms = document.createElement('div'); ms.className = 'rmatches';
  for (const id of ids) ms.appendChild(makeCard(id));
  col.appendChild(ms); return col;
}

function makeCentreCol() {
  const can = canPick();
  const col = document.createElement('div'); col.className = 'ccol';

  /* — FINAL — */
  const f = M['final']; const { t1, t2, w } = f;
  const card = document.createElement('div');
  card.className = 'fin-card' + (can && t1 && t2 ? '' : ' mlocked');
  const lbl = document.createElement('div'); lbl.className = 'finlbl'; lbl.textContent = 'Final';

  function mkFF(team, win, lose) {
    const el = document.createElement('div');
    el.className = 'fin-flag' + (win ? ' fw' : lose ? ' fl' : !team ? ' ft' : '');
    el.textContent = team ? team.f : '?'; return el;
  }
  const w1 = !!(w && t1 && w.n === t1.n), l1 = !!(w && t1 && !w1);
  const w2 = !!(w && t2 && w.n === t2.n), l2 = !!(w && t2 && !w2);
  const ff1 = mkFF(t1, w1, l1), ff2 = mkFF(t2, w2, l2);
  const fvs = document.createElement('div'); fvs.className = 'fin-vs'; fvs.textContent = 'VS';
  const frow = document.createElement('div'); frow.className = 'fin-teams'; frow.append(ff1, fvs, ff2);
  const trophy = document.createElement('div'); trophy.className = 'trophy-ring'; trophy.textContent = '🏆';
  const cl = document.createElement('div'); cl.className = 'champ-lbl'; cl.textContent = 'World Champion';
  const cv = document.createElement('div'); cv.className = 'champ-val'; cv.textContent = w ? `${w.f} ${w.n}` : '—';
  card.append(lbl, frow, trophy, cl, cv);
  if (can && t1 && t2) {
    [ff1, ff2].forEach((el, i) => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => pick('final', i === 0 ? t1 : t2));
      el.addEventListener('mouseenter', () => el.style.boxShadow = '0 0 0 2px var(--gold)');
      el.addEventListener('mouseleave',  () => el.style.boxShadow = '');
    });
  }
  col.appendChild(card);

  /* — THIRD PLACE — */
  const tp = M['third']; const { t1: tp1, t2: tp2, w: tw } = tp;
  const tpCard = document.createElement('div');
  tpCard.className = 'tp-card' + (can && tp1 && tp2 ? '' : ' mlocked');
  const tpLbl = document.createElement('div'); tpLbl.className = 'tp-lbl'; tpLbl.textContent = '🥉 3rd Place';

  function mkTF(team, win, lose) {
    const el = document.createElement('div');
    el.className = 'flag-circle tp-flag' + (win ? ' fc-win' : lose ? ' fc-lose' : !team ? '' : '');
    el.textContent = team ? team.f : '?'; return el;
  }
  const tw1 = !!(tw && tp1 && tw.n === tp1.n), tl1 = !!(tw && tp1 && !tw1);
  const tw2 = !!(tw && tp2 && tw.n === tp2.n), tl2 = !!(tw && tp2 && !tw2);
  const tf1 = mkTF(tp1, tw1, tl1), tf2 = mkTF(tp2, tw2, tl2);
  const tvs = document.createElement('div'); tvs.className = 'fin-vs'; tvs.textContent = 'VS';
  const trow = document.createElement('div'); trow.className = 'fin-teams'; trow.append(tf1, tvs, tf2);
  const tcv = document.createElement('div'); tcv.className = 'champ-val';
  tcv.style.fontSize = '11px';
  tcv.textContent = tw ? `${tw.f} ${tw.n}` : (tp1 && tp2 ? '' : 'TBD');
  tpCard.append(tpLbl, trow, tcv);

  if (can && tp1 && tp2) {
    [tf1, tf2].forEach((el, i) => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => pick('third', i === 0 ? tp1 : tp2));
      el.addEventListener('mouseenter', () => el.style.borderColor = 'var(--gold)');
      el.addEventListener('mouseleave',  () => el.style.borderColor = '');
    });
  }
  col.appendChild(tpCard);
  return col;
}

/* ══════════════════════════════════════
   RENDER
══════════════════════════════════════ */
function render() {
  const outer = document.getElementById('bouter'); if (!outer) return;
  outer.innerHTML = '';

  const left = document.createElement('div'); left.className = 'half hleft';
  left.appendChild(makeCol(['l_r16_0','l_r16_1','l_r16_2','l_r16_3','l_r16_4','l_r16_5','l_r16_6','l_r16_7'], 'Round of 16'));
  left.appendChild(makeCol(['l_qf_0','l_qf_1','l_qf_2','l_qf_3'], 'Quarter-finals'));
  left.appendChild(makeCol(['l_sf_0','l_sf_1'], 'Semi-finals'));
  left.appendChild(makeCol(['l_sff'], 'SF Final'));
  outer.appendChild(left);

  outer.appendChild(makeCentreCol());

  const right = document.createElement('div'); right.className = 'half hright';
  right.appendChild(makeCol(['r_sff'], 'SF Final'));
  right.appendChild(makeCol(['r_sf_0','r_sf_1'], 'Semi-finals'));
  right.appendChild(makeCol(['r_qf_0','r_qf_1','r_qf_2','r_qf_3'], 'Quarter-finals'));
  right.appendChild(makeCol(['r_r16_0','r_r16_1','r_r16_2','r_r16_3','r_r16_4','r_r16_5','r_r16_6','r_r16_7'], 'Round of 16'));
  outer.appendChild(right);

  renderProg();
}

function renderProg() {
  const s = document.getElementById('pstrip'); if (!s) return;
  if (!user) { s.style.display = 'none'; return; }
  s.style.display = 'flex';
  const made = Object.values(M).filter(m => m.w).length;
  const champ = M['final'].w;
  const lockBtn = user.locked
    ? '<span style="background:rgba(201,168,76,.12);color:var(--gold);padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;">🔒 Picks locked</span>'
    : (!tournamentStarted ? '<button class="btn btn-p" onclick="lockMyPicks()" style="font-size:11px;padding:5px 12px;">🔒 Lock my picks</button>' : '');
  s.innerHTML = `
    <div class="pi"><div class="plbl">Picks made</div><div class="pval">${made}/${TOTAL_PICKS}</div></div>
    <div class="pi"><div class="plbl">Remaining</div><div class="pval">${TOTAL_PICKS - made}</div></div>
    <div class="pi"><div class="plbl">My champion</div><div class="pval" style="font-size:14px;">${champ ? `${champ.f} ${champ.n}` : '—'}</div></div>
    <div class="pi" style="justify-content:center;display:flex;align-items:center;">${lockBtn}</div>`;
}

/* ══════════════════════════════════════
   WELCOME BAR
══════════════════════════════════════ */
function showWelcome() {
  const wb = document.getElementById('wbar'); if (!wb) return;
  if (!user) { wb.style.display = 'none'; return; }
  wb.style.display = 'block';
  const init = user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const lockStatus = user.locked
    ? '<span style="font-size:11px;color:var(--gold);">🔒 Picks locked</span>'
    : '<span style="font-size:11px;color:var(--t2);">Picks open — click flags to pick</span>';
  wb.innerHTML = `<div class="wbar">
    <div class="av" style="width:32px;height:32px;font-size:11px;">${init}</div>
    <div style="flex:1"><div class="wname">${user.name}</div><div class="wsub">${user.email} · ${lockStatus}</div></div>
  </div>`;
}

/* ══════════════════════════════════════
   TABS
══════════════════════════════════════ */
function showTab(name, el) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.ntab').forEach(t => t.classList.remove('active'));
  document.getElementById('panel-' + name).classList.add('active');
  el.classList.add('active');
  if (name === 'entries') renderEntries();
  if (name === 'tracker') renderTracker();
}

/* ══════════════════════════════════════
   TRACKER
══════════════════════════════════════ */
function renderTracker() {
  const el = document.getElementById('tracker-content'); if (!el) return;
  const rounds = [
    { label: 'Round of 16', ids: ['l_r16_0','l_r16_1','l_r16_2','l_r16_3','l_r16_4','l_r16_5','l_r16_6','l_r16_7','r_r16_0','r_r16_1','r_r16_2','r_r16_3','r_r16_4','r_r16_5','r_r16_6','r_r16_7'] },
    { label: 'Quarter-finals', ids: ['l_qf_0','l_qf_1','l_qf_2','l_qf_3','r_qf_0','r_qf_1','r_qf_2','r_qf_3'] },
    { label: 'Semi-finals', ids: ['l_sf_0','l_sf_1','r_sf_0','r_sf_1'] },
    { label: 'SF Final', ids: ['l_sff','r_sff'] },
    { label: 'Final', ids: ['final'] },
  ];
  const completedRounds = rounds.filter(r => r.ids.some(id => results[id]));
  if (!completedRounds.length) { el.innerHTML = '<div class="empty">No results yet — check back once matches start.</div>'; return; }
  el.innerHTML = completedRounds.map(round => {
    const played = round.ids.filter(id => results[id]);
    const players = entries.map(e => {
      const ok = played.every(id => e.picks?.[id] && results[id] && e.picks[id].n === results[id].n);
      const init = e.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      return { ...e, ok, init };
    });
    const alive = players.filter(p => p.ok).length;
    return `<div class="tracker-round">
      <div class="tracker-round-header">
        <div class="tracker-round-label">${round.label}</div>
        <div class="tracker-round-count">${alive}/${players.length} perfect</div>
      </div>
      <div class="tracker-players">
        ${players.map(p => `<div class="tracker-player ${p.ok ? 'tp-alive' : 'tp-out'}">
          <div class="av" style="width:28px;height:28px;font-size:10px;background:${p.ok ? 'var(--gold)' : 'var(--s3)'};color:${p.ok ? '#1a0e00' : 'var(--t3)'};">${p.init}</div>
          <div class="tp-name">${p.name}</div>
          <div class="tp-status">${p.ok ? '✓ Perfect' : '✗ Out'}</div>
        </div>`).join('')}
      </div>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════
   ENTRIES TABLE (admin only)
══════════════════════════════════════ */
function renderEntries() {
  const list = document.getElementById('elist'); if (!list) return;
  if (adminPass) { showEntriesTable(); return; }
  list.innerHTML = `
    <div style="max-width:320px;margin:0 auto;padding:1.5rem 0;">
      <p style="font-size:13px;color:var(--t2);margin-bottom:1rem;">Admin access only.</p>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div><label style="font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--t2);display:block;margin-bottom:4px;">Admin password</label>
        <input type="password" id="apass" placeholder="Password" style="font-family:inherit;font-size:13px;padding:9px 12px;border:1px solid var(--b2);border-radius:6px;background:var(--s2);color:var(--text);outline:none;width:100%;" onkeydown="if(event.key==='Enter')adminLogin()"/></div>
        <div style="display:flex;align-items:center;gap:10px;">
          <button class="btn btn-p" onclick="adminLogin()">Login →</button>
          <span style="font-size:12px;color:var(--red);display:none;" id="loginErr">Wrong password</span>
        </div>
      </div>
    </div>`;
}

async function adminLogin() {
  const pass = document.getElementById('apass')?.value || '';
  const r = await api('/admin/verify', { method: 'POST', body: JSON.stringify({ pass }) });
  if (r?.ok) {
    adminPass = pass; sessionStorage.setItem('adminPass', pass);
    document.getElementById('abar').classList.add('on');
    loadSyncStatus();
    await loadEntries(); showEntriesTable();
  } else {
    const err = document.getElementById('loginErr');
    if (err) { err.style.display = 'inline'; setTimeout(() => err.style.display = 'none', 3000); }
  }
}

function adminLogout() {
  adminPass = null; sessionStorage.removeItem('adminPass');
  document.getElementById('abar').classList.remove('on');
  renderEntries();
}

function showEntriesTable() {
  const list = document.getElementById('elist'); if (!list) return;
  if (!entries.length) { list.innerHTML = '<div class="empty">No entries yet.</div>'; return; }
  const rows = entries.map(e => {
    const p   = Object.keys(e.picks || {}).length;
    const pct = Math.round((p / TOTAL_PICKS) * 100);
    const init = e.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const saved = e.lastSaved ? new Date(e.lastSaved).toLocaleDateString() : '—';
    const esc = e.email.replace(/'/g, "\\'");
    return `<tr>
      <td><div style="display:flex;align-items:center;gap:9px;">
        <div class="av" style="width:28px;height:28px;font-size:10px;">${init}</div>
        <div><div style="font-weight:600;color:var(--text);">${e.name}</div><div style="font-size:10px;color:var(--t3);">${e.email}</div></div>
      </div></td>
      <td>${e.champion ? `${e.champion.f} ${e.champion.n}` : '<span style="color:var(--t3)">—</span>'}</td>
      <td><span class="bdg ${e.locked ? 'bg' : 'bd'}">${e.locked ? '🔒 Locked' : 'Open'}</span></td>
      <td><div style="display:flex;align-items:center;gap:8px;">
        <div style="flex:1;height:3px;background:var(--b2);border-radius:2px;min-width:50px;">
          <div style="height:3px;background:var(--gold);border-radius:2px;width:${pct}%;"></div>
        </div>
        <span class="bdg ${p===TOTAL_PICKS?'bg':p>0?'bgg':'bd'}">${p}/${TOTAL_PICKS}</span>
      </div></td>
      <td style="color:var(--t3);font-size:11px;">${saved}</td>
      <td>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-d" style="font-size:10px;padding:3px 8px;" onclick="adminResetEntry('${esc}')">Reset</button>
          ${e.locked ? `<button class="btn" style="font-size:10px;padding:3px 8px;" onclick="adminUnlockEntry('${esc}')">Unlock</button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
  list.innerHTML = `<table class="etbl">
    <thead><tr><th>Player</th><th>Champion</th><th>Status</th><th>Progress</th><th>Saved</th><th>Actions</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

async function adminResetEntry(email) {
  if (!confirm(`Reset all picks for ${email}? This also unlocks them.`)) return;
  const r = await api(`/admin/entries/${encodeURIComponent(email)}/reset`, { method: 'PUT' });
  if (r?.ok) {
    if (user && user.email === email.toLowerCase()) await refreshUser();
    await loadEntries(); showEntriesTable();
  } else alert('Could not reset.');
}

async function adminUnlockEntry(email) {
  if (!confirm(`Unlock picks for ${email}?`)) return;
  const r = await api(`/admin/entries/${encodeURIComponent(email)}/unlock`, { method: 'PUT' });
  if (r?.ok) {
    if (user && user.email === email.toLowerCase()) await refreshUser();
    await loadEntries(); showEntriesTable();
  } else alert('Could not unlock.');
}

async function adminResetMyPicks() {
  if (!user) return;
  await adminResetEntry(user.email);
}

async function loadEntries() {
  const d = await api('/entries');
  if (d && Array.isArray(d)) entries = d;
}

/* ══════════════════════════════════════
   ADMIN BRACKET CONTROLS
══════════════════════════════════════ */
async function startTournament() {
  if (!confirm('Start the tournament? No new entries or pick changes after this.')) return;
  tournamentStarted = true;
  await api('/bracket-state', { method: 'PUT', body: JSON.stringify({ tournamentStarted: true }) });
  setStatus(); render();
}
async function stopTournament() {
  tournamentStarted = false;
  await api('/bracket-state', { method: 'PUT', body: JSON.stringify({ tournamentStarted: false }) });
  setStatus(); render();
}
async function lockBracket() {
  locked = true;
  await api('/bracket-state', { method: 'PUT', body: JSON.stringify({ locked: true }) });
  setStatus(); render();
}
async function unlockBracket() {
  locked = false;
  await api('/bracket-state', { method: 'PUT', body: JSON.stringify({ locked: false }) });
  setStatus(); render();
}

async function manualSync() {
  const btn = document.getElementById('sync-btn');
  const st  = document.getElementById('sync-status');
  if (btn) { btn.disabled = true; btn.textContent = '↻ Syncing…'; }
  const r = await api('/admin/sync-results', { method: 'POST' });
  if (btn) { btn.disabled = false; btn.textContent = '↻ Sync results'; }
  if (r?.ok) {
    if (st) st.textContent = `Synced · ${r.lastSync ? new Date(r.lastSync).toLocaleTimeString() : 'just now'}`;
    const res = await api('/results');
    if (res && typeof res === 'object' && !res.error) { results = res; render(); renderTracker(); }
  } else {
    if (st) st.textContent = 'Sync failed';
  }
}

async function loadSyncStatus() {
  const r  = await api('/admin/sync-status');
  const st = document.getElementById('sync-status');
  if (r && st) st.textContent = `Last sync: ${r.lastSync ? new Date(r.lastSync).toLocaleTimeString() : 'never'}`;
}

/* ══════════════════════════════════════
   HELPERS
══════════════════════════════════════ */
function setStatus() {
  const b = document.getElementById('sbadge'); if (!b) return;
  const cls   = tournamentStarted ? 'live'   : locked ? 'locked' : 'open';
  const label = tournamentStarted ? 'Tournament live' : locked ? 'Bracket locked' : 'Picks open';
  b.className = `sbadge ${cls}`;
  document.getElementById('slabel').textContent = label;
}

function logout() {
  sessionStorage.removeItem('wcUser');
  window.location.href = '/';
}

/* ══════════════════════════════════════
   BOOT
══════════════════════════════════════ */
(async function init() {
  // check session
  let sessionUser = null;
  try { sessionUser = JSON.parse(sessionStorage.getItem('wcUser')); } catch {}
  if (!sessionUser) { window.location.href = '/login'; return; }
  user = sessionUser;

  // show logout button
  const lb = document.getElementById('logout-btn');
  if (lb) lb.style.display = 'block';

  // show admin tabs + bar if admin
  if (user.isAdmin) {
    if (adminPass) { document.getElementById('abar').classList.add('on'); loadSyncStatus(); }
    const tt = document.getElementById('tab-tracker'), te = document.getElementById('tab-entries');
    if (tt) tt.style.display = ''; if (te) te.style.display = '';
  }

  // render immediately with demo teams
  teams = DEMO.slice(); locked = false; tournamentStarted = false;
  initMatches(); setStatus(); showWelcome(); render();

  // fetch server state
  const [st, res] = await Promise.all([api('/bracket-state'), api('/results')]);

  if (st && !st.error) {
    locked = !!st.locked;
    tournamentStarted = !!st.tournamentStarted;
    if (st.teams && st.teams.length === 32)
      teams = st.teams.map(t => ({ n: t.name || t.n, f: t.flag || t.f }));
  }
  if (res && typeof res === 'object' && !res.error) results = res;

  // fetch fresh user picks from server
  const fresh = await fetch(`${API}/entries/${encodeURIComponent(user.email)}`).then(r => r.ok ? r.json() : null).catch(() => null);
  if (fresh && !fresh.error) {
    user = { ...user, ...fresh };
    sessionStorage.setItem('wcUser', JSON.stringify(user));
  }

  initMatches();
  if (user.picks) {
    for (const [id, t] of Object.entries(user.picks)) if (M[id]) M[id].w = t;
    propagate();
  }
  setStatus(); showWelcome(); render();
  await loadEntries();
})();
