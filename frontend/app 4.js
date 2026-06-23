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

let locked = false, tournamentStarted = false;
let user = null, entries = [], teams = DEMO.slice();
let adminPass = sessionStorage.getItem('adminPass') || null;
let M = {}, results = {};

/* ── Session helpers ── */
function getSessionUser() {
  try { return JSON.parse(sessionStorage.getItem('wcUser')); } catch { return null; }
}
function logout() {
  sessionStorage.removeItem('wcUser');
  window.location.href = '/login';
}

/* ════════ MATCH MAP ════════ */
function newM(id, t1, t2, src1, src2) {
  return { id, t1: t1||null, t2: t2||null, w: null, src1: src1||null, src2: src2||null };
}

function initMatches() {
  M = {};
  const T = teams;
  for (let i = 0; i < 8; i++) M['l_r16_'+i] = newM('l_r16_'+i, T[i*2], T[i*2+1]);
  for (let i = 0; i < 4; i++) M['l_qf_'+i]  = newM('l_qf_'+i,  null, null, 'l_r16_'+(i*2), 'l_r16_'+(i*2+1));
  for (let i = 0; i < 2; i++) M['l_sf_'+i]  = newM('l_sf_'+i,  null, null, 'l_qf_'+(i*2),  'l_qf_'+(i*2+1));
  M['l_sff'] = newM('l_sff', null, null, 'l_sf_0', 'l_sf_1');
  for (let i = 0; i < 8; i++) M['r_r16_'+i] = newM('r_r16_'+i, T[16+i*2], T[16+i*2+1]);
  for (let i = 0; i < 4; i++) M['r_qf_'+i]  = newM('r_qf_'+i,  null, null, 'r_r16_'+(i*2), 'r_r16_'+(i*2+1));
  for (let i = 0; i < 2; i++) M['r_sf_'+i]  = newM('r_sf_'+i,  null, null, 'r_qf_'+(i*2),  'r_qf_'+(i*2+1));
  M['r_sff'] = newM('r_sff', null, null, 'r_sf_0', 'r_sf_1');
  M['final'] = newM('final', null, null, 'l_sff', 'r_sff');

  // 3rd place: losers of each side's SF Final
  M['third'] = newM('third', null, null, 'l_sff', 'r_sff');
}

const PROP_ORDER = ['l_qf_0','l_qf_1','l_qf_2','l_qf_3','l_sf_0','l_sf_1','l_sff',
                    'r_qf_0','r_qf_1','r_qf_2','r_qf_3','r_sf_0','r_sf_1','r_sff','final'];

function propagate() {
  for (const id of PROP_ORDER) {
    const m = M[id]; if (!m.src1) continue;
    m.t1 = M[m.src1]?.w || null;
    m.t2 = M[m.src2]?.w || null;
    if (m.w && m.t1 && m.t2 && m.w.n !== m.t1.n && m.w.n !== m.t2.n) m.w = null;
    else if (m.w && (!m.t1 || !m.t2)) m.w = null;
  }

  // Third place: losers of l_sff and r_sff (the two SF Finals)
  const lSFF = M['l_sff'], rSFF = M['r_sff'], tp = M['third'];
  // loser of l_sff = whoever DIDN'T win
  tp.t1 = lSFF.w ? (lSFF.w.n === lSFF.t1?.n ? lSFF.t2 : lSFF.t1) : null;
  tp.t2 = rSFF.w ? (rSFF.w.n === rSFF.t1?.n ? rSFF.t2 : rSFF.t1) : null;
  // clear third place pick if teams changed
  if (tp.w && tp.t1 && tp.t2 && tp.w.n !== tp.t1.n && tp.w.n !== tp.t2.n) tp.w = null;
  else if (tp.w && (!tp.t1 || !tp.t2)) tp.w = null;
}

/* ════════ API ════════ */
async function api(path, opts = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (adminPass) h['x-admin-pass'] = adminPass;
  try { const r = await fetch(API+path, {headers:h, ...opts}); if (!r.ok) throw r.status; return r.json(); }
  catch { return null; }
}

/* ════════ REFRESH USER STATE FROM SERVER ════════ */
async function refreshUser() {
  if (!user) return;
  // re-POST with same details to get fresh state from server
  const d = await fetch(API + '/entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: user.name, email: user.email })
  }).then(r => r.json()).catch(() => null);
  if (d) {
    user = d;
    // restore picks into match map
    initMatches();
    if (d.picks) {
      for (const [id, team] of Object.entries(d.picks)) if (M[id]) M[id].w = team;
      propagate();
    }
    showWelcome();
    render();
  }
}

/* ════════ PICKS ════════ */
async function pick(matchId, team) {
  if (locked || tournamentStarted || !user || user.locked) return;
  const m = M[matchId]; if (!m) return;
  m.w = team; propagate(); render(); await savePicks();
}

async function savePicks() {
  if (!user || user.locked) return;
  const picks = {}; for (const [id, m] of Object.entries(M)) if (m.w) picks[id] = m.w;
  const champion = M['final'].w || null;
  const r = await api(`/entries/${encodeURIComponent(user.email)}/picks`, {
    method: 'PUT', body: JSON.stringify({ picks, champion })
  });
  if (r?.ok) { const i = entries.findIndex(e => e.email === user.email); if (i >= 0) { entries[i].picks = picks; entries[i].champion = champion; } }
}

async function lockMyPicks() {
  if (!user || user.locked) return;
  const confirmed = confirm('Lock your picks permanently? You won\'t be able to change them after this.');
  if (!confirmed) return;
  const r = await api(`/entries/${encodeURIComponent(user.email)}/lock`, { method: 'PUT' });
  if (r?.ok) { user.locked = true; showWelcome(); render(); }
}

/* ════════ MATCH CARD ════════ */
function makeCard(matchId) {
  const m = M[matchId];
  const canPick = !locked && !tournamentStarted && !!user && !user.locked;
  const { t1, t2, w } = m;
  const wrap = document.createElement('div'); wrap.className = 'mu';

  if (!t1 && !t2) {
    const tbd = document.createElement('div'); tbd.className = 'tbd-card'; tbd.textContent = 'TBD';
    wrap.appendChild(tbd); return wrap;
  }

  const card = document.createElement('div');
  card.className = 'mcard' + (canPick && t1 && t2 ? '' : ' mlocked');

  const w1 = w && t1 && w.n === t1.n, l1 = w && t1 && !w1;
  const w2 = w && t2 && w.n === t2.n, l2 = w && t2 && !w2;

  function fc(team, win, lose) {
    const el = document.createElement('div');
    el.className = 'flag-circle' + (win ? ' fc-win' : lose ? ' fc-lose' : !team ? ' fc-tbd' : '');
    el.textContent = team ? team.f : '?'; return el;
  }
  const f1 = fc(t1, w1, l1), f2 = fc(t2, w2, l2);

  // check if result is known
  const realWinner = results[matchId] || null;
  const userCorrect = w && realWinner && w.n === realWinner.n;
  const userWrong   = w && realWinner && w.n !== realWinner.n;

  const mid = document.createElement('div'); mid.className = 'vs-mid';
  mid.innerHTML = `<div class="vs-text">VS</div>
    <div class="vs-names">
      <div class="vname${w1?' vwin':l1?' vlose':''}">${t1?t1.n:'—'}</div>
      <div class="vname${w2?' vwin':l2?' vlose':''}">${t2?t2.n:'—'}</div>
    </div>`;

  const row = document.createElement('div'); row.className = 'mcard-teams';
  row.append(f1, mid, f2); card.appendChild(row);

  if (w) {
    const wr = document.createElement('div');
    wr.className = 'winner-row' + (userCorrect ? ' correct' : userWrong ? ' wrong' : '');
    wr.innerHTML = `<span class="wflag">${w.f}</span> ${w.n}${userCorrect ? ' ✓' : userWrong ? ' ✗' : ''}`;
    card.appendChild(wr);
  }

  if (canPick && t1 && t2) {
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

function makeFinalCol() {
  const canPick = !locked && !tournamentStarted && !!user && !user.locked;
  const col = document.createElement('div'); col.className = 'ccol';

  /* ── FINAL ── */
  const f = M['final']; const { t1, t2, w } = f;
  const card = document.createElement('div');
  card.className = 'fin-card' + (canPick && t1 && t2 ? '' : ' mlocked');

  function ff(team, win, lose) {
    const el = document.createElement('div');
    el.className = 'fin-flag' + (win ? ' fw' : lose ? ' fl' : !team ? ' ft' : '');
    el.textContent = team ? team.f : '?'; return el;
  }
  const w1 = w && t1 && w.n === t1.n, l1 = w && t1 && !w1;
  const w2 = w && t2 && w.n === t2.n, l2 = w && t2 && !w2;
  const ff1 = ff(t1, w1, l1), fvs = document.createElement('div'), ff2 = ff(t2, w2, l2);
  fvs.className = 'fin-vs'; fvs.textContent = 'VS';

  const row = document.createElement('div'); row.className = 'fin-teams';
  row.append(ff1, fvs, ff2);
  const trophy = document.createElement('div'); trophy.className = 'trophy-ring'; trophy.textContent = '🏆';
  const cl = document.createElement('div'); cl.className = 'champ-lbl'; cl.textContent = 'World Champion';
  const cv = document.createElement('div'); cv.className = 'champ-val'; cv.textContent = w ? w.f+' '+w.n : '—';
  const lbl = document.createElement('div'); lbl.className = 'finlbl'; lbl.textContent = 'Final';
  card.append(lbl, row, trophy, cl, cv);

  if (canPick && t1 && t2) {
    [ff1, ff2].forEach((el, i) => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => pick('final', i === 0 ? t1 : t2));
    });
  }
  col.appendChild(card);

  /* ── THIRD PLACE ── */
  const tp = M['third'];
  const { t1: tp1, t2: tp2, w: tw } = tp;

  const tpCard = document.createElement('div');
  tpCard.className = 'tp-card' + (canPick && tp1 && tp2 ? '' : ' mlocked');

  const tpLbl = document.createElement('div'); tpLbl.className = 'tp-lbl'; tpLbl.textContent = '🥉 3rd Place';
  const tpRow = document.createElement('div'); tpRow.className = 'fin-teams';

  function tff(team, win, lose) {
    const el = document.createElement('div');
    el.className = 'fin-flag tp-flag' + (win ? ' fw' : lose ? ' fl' : !team ? ' ft' : '');
    el.textContent = team ? team.f : '?'; return el;
  }
  const tw1 = tw && tp1 && tw.n === tp1.n, tl1 = tw && tp1 && !tw1;
  const tw2 = tw && tp2 && tw.n === tp2.n, tl2 = tw && tp2 && !tw2;
  const tff1 = tff(tp1, tw1, tl1);
  const tpvs = document.createElement('div'); tpvs.className = 'fin-vs'; tpvs.textContent = 'VS';
  const tff2 = tff(tp2, tw2, tl2);
  tpRow.append(tff1, tpvs, tff2);

  const tpResult = document.createElement('div'); tpResult.className = 'champ-val';
  tpResult.style.cssText = 'font-size:11px;margin-top:4px;';
  tpResult.textContent = tw ? tw.f+' '+tw.n : (tp1 && tp2 ? '' : 'TBD');

  tpCard.append(tpLbl, tpRow, tpResult);

  if (canPick && tp1 && tp2) {
    [tff1, tff2].forEach((el, i) => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => pick('third', i === 0 ? tp1 : tp2));
    });
  }
  col.appendChild(tpCard);

  return col;
}

/* ════════ RENDER ════════ */
function render() {
  const outer = document.getElementById('bouter'); if (!outer) return;
  outer.innerHTML = '';
  const left = document.createElement('div'); left.className = 'half hleft';
  left.appendChild(makeCol(['l_r16_0','l_r16_1','l_r16_2','l_r16_3','l_r16_4','l_r16_5','l_r16_6','l_r16_7'], 'Round of 16'));
  left.appendChild(makeCol(['l_qf_0','l_qf_1','l_qf_2','l_qf_3'], 'Quarter-finals'));
  left.appendChild(makeCol(['l_sf_0','l_sf_1'], 'Semi-finals'));
  left.appendChild(makeCol(['l_sff'], 'SF Final'));
  outer.appendChild(left);
  outer.appendChild(makeFinalCol());
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
  const lockedBadge = user.locked
    ? '<span style="background:rgba(201,168,76,.12);color:var(--gold);padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600;">🔒 Picks locked</span>'
    : (!tournamentStarted ? `<button class="btn btn-p" onclick="lockMyPicks()" style="font-size:11px;padding:5px 12px;">🔒 Lock my picks</button>` : '');
  s.innerHTML = `
    <div class="pi"><div class="plbl">Picks made</div><div class="pval">${made}/31</div></div>
    <div class="pi"><div class="plbl">Remaining</div><div class="pval">${31-made}</div></div>
    <div class="pi"><div class="plbl">My champion</div><div class="pval" style="font-size:14px;">${champ ? champ.f+' '+champ.n : '—'}</div></div>
    <div class="pi" style="justify-content:center;">${lockedBadge}</div>`;
}

/* ════════ PERFECT BRACKET TRACKER ════════ */
function renderTracker() {
  const el = document.getElementById('tracker-content'); if (!el) return;
  if (!Object.keys(results).length) {
    el.innerHTML = '<div class="empty">No results yet — check back once matches start.</div>'; return;
  }

  const rounds = [
    { label: 'Round of 16', ids: ['l_r16_0','l_r16_1','l_r16_2','l_r16_3','l_r16_4','l_r16_5','l_r16_6','l_r16_7','r_r16_0','r_r16_1','r_r16_2','r_r16_3','r_r16_4','r_r16_5','r_r16_6','r_r16_7'] },
    { label: 'Quarter-finals', ids: ['l_qf_0','l_qf_1','l_qf_2','l_qf_3','r_qf_0','r_qf_1','r_qf_2','r_qf_3'] },
    { label: 'Semi-finals', ids: ['l_sf_0','l_sf_1','r_sf_0','r_sf_1'] },
    { label: 'SF Final', ids: ['l_sff','r_sff'] },
    { label: 'Final', ids: ['final'] },
  ];

  // figure out which rounds have completed results
  const completedRounds = rounds.filter(r => r.ids.some(id => results[id]));

  let html = '';

  for (const round of completedRounds) {
    const played = round.ids.filter(id => results[id]);
    if (!played.length) continue;

    // for each entry, check if they got ALL played matches in this round correct
    const surviving = entries.map(e => {
      const correct = played.every(id => {
        const pick = e.picks?.[id];
        const result = results[id];
        return pick && result && pick.n === result.n;
      });
      return { ...e, correct };
    });

    const alive = surviving.filter(e => e.correct);
    const total = surviving.length;

    html += `
      <div class="tracker-round">
        <div class="tracker-round-header">
          <div class="tracker-round-label">${round.label}</div>
          <div class="tracker-round-count">${alive.length}/${total} perfect</div>
        </div>
        <div class="tracker-players">
          ${surviving.map(e => {
            const init = e.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
            return `<div class="tracker-player ${e.correct ? 'tp-alive' : 'tp-out'}">
              <div class="av" style="width:28px;height:28px;font-size:10px;background:${e.correct?'var(--gold)':'var(--s3)'};color:${e.correct?'#1a0e00':'var(--t3)'};">${init}</div>
              <div class="tp-name">${e.name}</div>
              <div class="tp-status">${e.correct ? '✓ Perfect' : '✗ Out'}</div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  el.innerHTML = html || '<div class="empty">No completed rounds yet.</div>';
}

/* ════════ TABS ════════ */
function showTab(name, el) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.ntab').forEach(t => t.classList.remove('active'));
  document.getElementById('panel-'+name).classList.add('active');
  el.classList.add('active');
  if (name === 'entries') renderEntries();
  if (name === 'tracker') renderTracker();
}

/* ════════ ENTRY FORM ════════ */
async function registerEntry() {
  const name  = document.getElementById('iname').value.trim();
  const email = document.getElementById('iemail').value.trim();
  const msg   = document.getElementById('fmsg');
  if (!name)  return setMsg(msg, 'Please enter your name.', 'err');
  if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) return setMsg(msg, 'Please enter a valid email.', 'err');
  const d = await api('/entries', { method: 'POST', body: JSON.stringify({ name, email }) });
  if (!d) return setMsg(msg, 'Could not save — try again.', 'err');
  if (d.error) return setMsg(msg, d.error, 'err');
  user = d; setMsg(msg, d.created ? 'Details saved!' : 'Welcome back!', 'ok');
  if (d.picks && Object.keys(d.picks).length) {
    initMatches();
    for (const [id, team] of Object.entries(d.picks)) if (M[id]) M[id].w = team;
    propagate();
  }
  await loadEntries(); showWelcome(); render();
}

async function loadEntries() { const d = await api('/entries'); if (d && Array.isArray(d)) entries = d; }

function showWelcome() {
  const wb = document.getElementById('wbar');
  const es = document.getElementById('entrySection');
  if (!user) { if(wb) wb.style.display='none'; if(es) es.style.display='none'; return; }
  if(es) es.style.display='none';
  if(!wb) return;
  wb.style.display='block';
  const init = user.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
  const lockStatus = user.locked
    ? '<span style="font-size:11px;color:var(--gold);">🔒 Picks locked</span>'
    : '<span style="font-size:11px;color:var(--t2);">Picks open</span>';
  wb.innerHTML = `<div class="wbar">
    <div class="av" style="width:32px;height:32px;font-size:11px;">${init}</div>
    <div style="flex:1"><div class="wname">${user.name}</div><div class="wsub">${user.email} · ${lockStatus}</div></div>
  </div>`;
}

/* ════════ ENTRIES TABLE (admin) ════════ */
function renderEntries() {
  const list = document.getElementById('elist'); if (!list) return;
  if (adminPass) { showEntriesTable(); return; }
  list.innerHTML = `
    <div style="max-width:320px;margin:0 auto;padding:1.5rem 0;">
      <p style="font-size:13px;color:var(--t2);margin-bottom:1rem;">Admin access only.</p>
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
  const d = await api('/admin/verify', { method:'POST', body:JSON.stringify({pass}) });
  if (d?.ok) {
    adminPass = pass; sessionStorage.setItem('adminPass', pass);
    document.getElementById('abar').classList.add('on');
    await loadEntries(); showEntriesTable();
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

async function adminResetPicks(email) {
  if (!confirm(`Reset all picks for ${email}? This also unlocks their entry so they can pick again.`)) return;
  const r = await api(`/admin/entries/${encodeURIComponent(email)}/reset`, { method: 'PUT' });
  if (r?.ok) {
    if (user && user.email === email.toLowerCase()) await refreshUser();
    await loadEntries(); showEntriesTable();
  } else alert('Could not reset picks. Try again.');
}

async function adminUnlockEntry(email) {
  if (!confirm(`Unlock picks for ${email} so they can make changes?`)) return;
  const r = await api(`/admin/entries/${encodeURIComponent(email)}/unlock`, { method: 'PUT' });
  if (r?.ok) { await loadEntries(); showEntriesTable(); }
  else alert('Could not unlock. Try again.');
}

function showEntriesTable() {
  const list = document.getElementById('elist'); if (!list) return;
  if (!entries.length) { list.innerHTML = '<div class="empty">No entries yet.</div>'; return; }
  const rows = entries.map(e => {
    const p = Object.keys(e.picks||{}).length, pct = Math.round((p/32)*100);
    const init = e.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
    const saved = e.lastSaved ? new Date(e.lastSaved).toLocaleDateString() : '—';
    const escapedEmail = e.email.replace(/'/g, "\'");
    const lockBadge = e.locked
      ? `<span class="bdg bg">🔒 Locked</span>`
      : `<span class="bdg bd">Open</span>`;
    const actions = `
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="btn btn-d" style="font-size:10px;padding:4px 8px;" onclick="adminResetPicks('${escapedEmail}')">Reset picks</button>
        ${e.locked ? `<button class="btn" style="font-size:10px;padding:4px 8px;" onclick="adminUnlockEntry('${escapedEmail}')">Unlock</button>` : ''}
      </div>`;
    return `<tr>
      <td><div style="display:flex;align-items:center;gap:9px;">
        <div class="av" style="width:28px;height:28px;font-size:10px;">${init}</div>
        <div><div style="font-weight:600;color:var(--text);">${e.name}</div>
             <div style="font-size:10px;color:var(--t3);">${e.email}</div></div>
      </div></td>
      <td>${e.champion ? e.champion.f+' '+e.champion.n : '<span style="color:var(--t3)">Not picked</span>'}</td>
      <td>${lockBadge}</td>
      <td><div style="display:flex;align-items:center;gap:8px;">
        <div style="flex:1;height:3px;background:var(--b2);border-radius:2px;min-width:50px;">
          <div style="height:3px;background:var(--gold);border-radius:2px;width:${pct}%;"></div>
        </div>
        <span class="bdg ${p===32?'bg':p>0?'bgg':'bd'}">${p}/32</span>
      </div></td>
      <td style="color:var(--t3);font-size:11px;">${saved}</td>
      <td>${actions}</td>
    </tr>`;
  }).join('');
  list.innerHTML = `<table class="etbl">
    <thead><tr><th>Player</th><th>Champion</th><th>Status</th><th>Progress</th><th>Saved</th><th>Actions</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/* ════════ ADMIN CONTROLS ════════ */
async function startTournament() {
  if (!confirm('Start the tournament? No new entries or picks will be allowed after this.')) return;
  tournamentStarted = true;
  await api('/bracket-state', { method:'PUT', body:JSON.stringify({tournamentStarted:true}) });
  setStatus(); render(); await loadEntries(); showEntriesTable();
}
async function stopTournament() {
  tournamentStarted = false;
  await api('/bracket-state', { method:'PUT', body:JSON.stringify({tournamentStarted:false}) });
  setStatus(); render();
}
async function lockBracket() {
  locked = true;
  await api('/bracket-state', { method:'PUT', body:JSON.stringify({locked:true}) });
  setStatus(); render();
}
async function unlockBracket() {
  locked = false;
  await api('/bracket-state', { method:'PUT', body:JSON.stringify({locked:false}) });
  setStatus(); render();
}
async function resetPicks() {
  if (!user) return;
  const r = await api(`/admin/entries/${encodeURIComponent(user.email)}/reset`, { method: 'PUT' });
  if (r?.ok) await refreshUser();
}
async function manualSync() {
  const btn    = document.getElementById('sync-btn');
  const status = document.getElementById('sync-status');
  if (btn) { btn.disabled = true; btn.textContent = '↻ Syncing…'; }
  const r = await api('/admin/sync-results', { method: 'POST' });
  if (btn) { btn.disabled = false; btn.textContent = '↻ Sync results now'; }
  if (r?.ok) {
    const syncTime = r.lastSync ? new Date(r.lastSync).toLocaleTimeString() : 'just now';
    if (status) status.textContent = `Last sync: ${syncTime}`;
    // reload results
    const res = await api('/results');
    if (res && typeof res === 'object') { results = res; render(); renderTracker(); }
  } else {
    if (status) status.textContent = 'Sync failed';
  }
}

async function loadSyncStatus() {
  const r = await api('/admin/sync-status');
  const status = document.getElementById('sync-status');
  if (r && status) {
    const syncTime = r.lastSync ? new Date(r.lastSync).toLocaleTimeString() : 'never';
    status.textContent = `Last sync: ${syncTime} · ${r.resultCount} results`;
  }
}

/* ════════ HELPERS ════════ */
function setStatus() {
  const b = document.getElementById('sbadge'); if (!b) return;
  const label = tournamentStarted ? 'Tournament live' : locked ? 'Bracket locked' : 'Picks open';
  const cls   = tournamentStarted ? 'live' : locked ? 'locked' : 'open';
  b.className = 'sbadge ' + cls;
  document.getElementById('slabel').textContent = label;
}
function setMsg(el, t, type) { el.textContent = t; el.className = 'fmsg ' + type; }

/* ════════ BOOT ════════ */
(async function init() {
  // check login — redirect if not logged in
  const sessionUser = getSessionUser();
  if (!sessionUser) { window.location.href = '/login'; return; }

  // populate user from session
  user = sessionUser;

  // show admin tabs and bar only for admin accounts
  if (user.isAdmin) {
    if (adminPass) {
      document.getElementById('abar').classList.add('on');
      loadSyncStatus();
    }
    const tt = document.getElementById('tab-tracker');
    const te = document.getElementById('tab-entries');
    if (tt) tt.style.display = '';
    if (te) te.style.display = '';
  }

  // add logout button to header
  const hdr = document.querySelector('.hdr');
  if (hdr) {
    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'btn';
    logoutBtn.style.cssText = 'font-size:11px;padding:6px 12px;';
    logoutBtn.textContent = 'Log out';
    logoutBtn.onclick = logout;
    hdr.appendChild(logoutBtn);
  }

  teams = DEMO.slice(); locked = false; tournamentStarted = false;
  initMatches(); setStatus();
  showWelcome(); // show user info immediately
  render();

  const [st, res] = await Promise.all([api('/bracket-state'), api('/results')]);

  if (st) {
    locked = !!st.locked;
    tournamentStarted = !!st.tournamentStarted;
    if (st.teams && st.teams.length === 32)
      teams = st.teams.map(t => ({ n: t.name||t.n, f: t.flag||t.f }));
  }
  if (res && typeof res === 'object') results = res;

  // refresh user picks from server
  const fresh = await fetch(API + `/entries/${encodeURIComponent(user.email)}`)
    .then(r => r.ok ? r.json() : null).catch(() => null);
  if (fresh) {
    user = { ...user, ...fresh };
    sessionStorage.setItem('wcUser', JSON.stringify(user));
    if (fresh.picks && Object.keys(fresh.picks).length) {
      initMatches();
      for (const [id, team] of Object.entries(fresh.picks)) if (M[id]) M[id].w = team;
      propagate();
    }
  }

  initMatches();
  if (user.picks) {
    for (const [id, team] of Object.entries(user.picks)) if (M[id]) M[id].w = team;
    propagate();
  }
  setStatus(); showWelcome(); render();
  await loadEntries();
})();
