
/* ── Constants ── */
const ROUND_ORDER = ['r32','r16','qf','sf','third','final'];
const ROUND_LABELS = { r32:'Leikir 32', r16:'16-liða úrslit', qf:'Fjórðungsúrslit', sf:'Undanúrslit', third:'3. sæti', final:'Úrslit' };
const ROUND_MATCHES = {
  r32:   ['l_r16_0','l_r16_1','l_r16_2','l_r16_3','l_r16_4','l_r16_5','l_r16_6','l_r16_7',
           'r_r16_0','r_r16_1','r_r16_2','r_r16_3','r_r16_4','r_r16_5','r_r16_6','r_r16_7'],
  r16:   ['l_qf_0','l_qf_1','l_qf_2','l_qf_3','r_qf_0','r_qf_1','r_qf_2','r_qf_3'],
  qf:    ['l_sf_0','l_sf_1','r_sf_0','r_sf_1'],
  sf:    ['l_sff','r_sff'],
  third: ['third'],
  final: ['final'],
};
const DEMO = [
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
const API = '/api';

/* ── State ── */
let user = null;
let adminPass = sessionStorage.getItem('adminPass') || null;
let locked = false, tournamentStarted = false;
let activeRound = 'r32';
let teams = DEMO.slice();
let picks = {};
let results = {};
let M = {};
let entries = [];
let currentTab = 'bracket';

/* ══ API ══ */
async function api(path, opts = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (adminPass) h['x-admin-pass'] = adminPass;
  try { const r = await fetch(API + path, { headers: h, ...opts }); return r.json(); }
  catch(e) { return null; }
}

/* ══ MATCH MAP ══ */
function newM(id, t1, t2, s1, s2) {
  return { id, t1:t1||null, t2:t2||null, w:null, s1:s1||null, s2:s2||null };
}
function initMatches() {
  M = {};
  const T = teams;
  for (let i=0;i<8;i++) M[`l_r16_${i}`] = newM(`l_r16_${i}`, T[i*2], T[i*2+1]);
  for (let i=0;i<4;i++) M[`l_qf_${i}`]  = newM(`l_qf_${i}`,  null, null, `l_r16_${i*2}`, `l_r16_${i*2+1}`);
  for (let i=0;i<2;i++) M[`l_sf_${i}`]  = newM(`l_sf_${i}`,  null, null, `l_qf_${i*2}`,  `l_qf_${i*2+1}`);
  M['l_sff']  = newM('l_sff',  null, null, 'l_sf_0', 'l_sf_1');
  for (let i=0;i<8;i++) M[`r_r16_${i}`] = newM(`r_r16_${i}`, T[16+i*2], T[16+i*2+1]);
  for (let i=0;i<4;i++) M[`r_qf_${i}`]  = newM(`r_qf_${i}`,  null, null, `r_r16_${i*2}`, `r_r16_${i*2+1}`);
  for (let i=0;i<2;i++) M[`r_sf_${i}`]  = newM(`r_sf_${i}`,  null, null, `r_qf_${i*2}`,  `r_qf_${i*2+1}`);
  M['r_sff']  = newM('r_sff',  null, null, 'r_sf_0', 'r_sf_1');
  M['final']  = newM('final',  null, null, 'l_sff', 'r_sff');
  M['third']  = newM('third',  null, null, null, null);
}
const PROP_ORDER = [
  'l_qf_0','l_qf_1','l_qf_2','l_qf_3','l_sf_0','l_sf_1','l_sff',
  'r_qf_0','r_qf_1','r_qf_2','r_qf_3','r_sf_0','r_sf_1','r_sff','final'
];
function propagateResults() {
  for (const id of ROUND_MATCHES.r32) { if (results[id]) M[id].w = results[id]; }
  for (const id of PROP_ORDER) {
    const m = M[id];
    if (m.s1) m.t1 = M[m.s1]?.w || null;
    if (m.s2) m.t2 = M[m.s2]?.w || null;
    if (results[id]) m.w = results[id]; else m.w = null;
  }
  const ls=M['l_sff'], rs=M['r_sff'], tp=M['third'];
  tp.t1 = ls.w ? (ls.w.n===ls.t1?.n ? ls.t2 : ls.t1) : null;
  tp.t2 = rs.w ? (rs.w.n===rs.t1?.n ? rs.t2 : rs.t1) : null;
  if (results['third']) tp.w = results['third'];
}

/* ══ ROUND LOGIC ══ */
function isPickable(matchId) {
  if (!user || tournamentStarted) return false;
  if (user.locked && user.lockedRound && user.lockedRound === activeRound) return false;
  return (ROUND_MATCHES[activeRound] || []).includes(matchId);
}

/* ══ PICKS ══ */
async function pick(matchId, team) {
  if (!isPickable(matchId) || !team) return;
  picks[matchId] = team;
  render();
  await api(`/entries/${encodeURIComponent(user.email)}/picks`, {
    method: 'PUT', body: JSON.stringify({ picks })
  });
  // Check if user just completed all picks for the active round
  const activeIds = (activeRound === 'third' || activeRound === 'final')
    ? [...(ROUND_MATCHES['third']||[]), ...(ROUND_MATCHES['final']||[])]
    : (ROUND_MATCHES[activeRound] || []);
  const madePicks = activeIds.filter(id => picks[id]).length;
  const _lr = (user.lockedRound === 'final') ? 'third' : user.lockedRound;
  const _ar = (activeRound === 'final') ? 'third' : activeRound;
  const isLockedThisRound = user.locked && _lr === _ar;
  if (madePicks === activeIds.length && !isLockedThisRound) {
    showLockPrompt();
  }
}

function showLockPrompt() {
  const existing = document.getElementById('lock-prompt');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'lock-prompt';
  overlay.style.cssText = `
    position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    background:var(--s2);border:1px solid var(--gold);border-radius:14px;
    padding:18px 24px;display:flex;flex-direction:column;align-items:center;gap:12px;
    box-shadow:0 0 30px rgba(245,197,24,.25);z-index:9999;
    animation:slideUp .3s ease;max-width:320px;width:90%;text-align:center;
  `;
  overlay.innerHTML = `
    <div style="font-size:22px;">🔒</div>
    <div style="font-weight:700;color:var(--gold);font-size:14px;">Allt val gert!</div>
    <div style="font-size:12px;color:var(--t2);">Mundu að læsa vali þínu — það verður ekki hægt að breyta eftir þetta.</div>
    <div style="display:flex;gap:10px;width:100%;">
      <button onclick="document.getElementById('lock-prompt').remove()" 
        style="flex:1;font-family:inherit;font-size:12px;padding:9px;border-radius:8px;
        border:1px solid var(--b2);background:var(--s3);color:var(--t2);cursor:pointer;">
        Síðar
      </button>
      <button onclick="lockMyPicks();document.getElementById('lock-prompt').remove()"
        style="flex:1;font-family:inherit;font-size:12px;padding:9px;border-radius:8px;
        border:none;background:var(--gold);color:#111;font-weight:700;cursor:pointer;">
        🔒 Læsa núna
      </button>
    </div>
  `;
  document.body.appendChild(overlay);

  // Auto-dismiss after 10 seconds
  setTimeout(() => { if (document.getElementById('lock-prompt')) document.getElementById('lock-prompt').remove(); }, 10000);
}
async function lockMyPicks() {
  if (!user) return;
  if (user.locked && user.lockedRound === activeRound) return;
  if (!confirm('Það verður ekki hægt að breyta eftir þetta')) return;
  const r = await api(`/entries/${encodeURIComponent(user.email)}/lock`, {
    method: 'PUT', body: JSON.stringify({ round: activeRound })
  });
  if (r?.ok) { user.locked=true; user.lockedRound=activeRound; sessionStorage.setItem('wcUser',JSON.stringify(user)); render(); }
}

/* ══ MATCH CARD ══ */
function makeCard(matchId) {
  const m = M[matchId];
  if (!m) {
    const wrap = document.createElement('div'); wrap.className = 'mu';
    const d = document.createElement('div'); d.className = 'tbd-card'; d.textContent = 'Óþekkt';
    wrap.appendChild(d); return wrap;
  }
  const pickable = isPickable(matchId);
  const { t1, t2 } = m;
  const myPick = picks[matchId] || null;
  const result = results[matchId] || null;
  const inActiveRound = (ROUND_MATCHES[activeRound]||[]).includes(matchId);
  const wrap = document.createElement('div'); wrap.className = 'mu';

  if (!t1 && !t2) {
    const d = document.createElement('div'); d.className = 'tbd-card'; d.textContent = 'Óþekkt';
    wrap.appendChild(d); return wrap;
  }
  const card = document.createElement('div');
  card.className = 'mcard' + (pickable ? '' : ' mlocked');

  const rw1=!!(result&&t1&&result.n===t1.n), rl1=!!(result&&t1&&!rw1);
  const rw2=!!(result&&t2&&result.n===t2.n), rl2=!!(result&&t2&&!rw2);
  const isPast = ROUND_ORDER.indexOf(activeRound) > ROUND_ORDER.indexOf(getRoundForMatch(matchId));
  if (!result && !inActiveRound && !isPast) card.style.opacity = '0.45';

  // Normalise: compare by name only (team objects may differ between picks/results)
  const p1=!!(myPick&&t1&&myPick.n===t1.n);
  const p2=!!(myPick&&t2&&myPick.n===t2.n);
  const correct=!!(myPick&&result&&myPick.n===result.n);
  const wrong  =!!(myPick&&result&&myPick.n!==result.n);
  if (myPick && result && !['r32'].includes(getRoundForMatch(matchId))) {
    console.log(`[${matchId}] pick:${myPick.n} t1:${t1?.n} t2:${t2?.n} result:${result?.n} p1:${p1} p2:${p2} correct:${correct}`);
  }

  function mkFC(team, iWon, iLost, isPicked) {
    const el = document.createElement('div');
    if (result && isPicked && iLost) el.className = 'flag-circle fc-wrong';
    else if (result && isPicked && iWon) el.className = 'flag-circle fc-correct';
    else if (result) el.className = 'flag-circle' + (iLost?' fc-lose':'');
    else el.className = 'flag-circle' + (isPicked?' fc-picked':'');
    el.innerHTML = flagImg(team ? team.f : null);
    return el;
  }
  const f1 = mkFC(t1,rw1,rl1,p1), f2 = mkFC(t2,rw2,rl2,p2);

  const mid = document.createElement('div'); mid.className = 'vs-mid';
  mid.innerHTML = `<div class="vs-text">VS</div>
    <div class="vs-names">
      <div class="vname${rw1?' vwin':rl1?' vlose':p1?' vpick':''}">${t1?t1.n:'—'}</div>
      <div class="vname${rw2?' vwin':rl2?' vlose':p2?' vpick':''}">${t2?t2.n:'—'}</div>
    </div>`;

  const row = document.createElement('div'); row.className = 'mcard-teams';
  row.append(f1, mid, f2); card.appendChild(row);

  if (result) {
    const wr = document.createElement('div');
    wr.className = 'winner-row'+(correct?' correct':wrong?' wrong':'');
    wr.innerHTML = `<span style='display:inline-flex;align-items:center;gap:4px;'>${flagImg(result.f,16)} ${result.n}${correct?' ✓':wrong?' ✗':''}</span>`;
    card.appendChild(wr);
  } else if (myPick) {
    const pr = document.createElement('div');
    pr.className = 'winner-row'; pr.style.color = 'var(--gold)';
    pr.innerHTML = `<span style='display:inline-flex;align-items:center;gap:4px;'>→ ${flagImg(myPick.f,16)} ${myPick.n}</span>`;
    card.appendChild(pr);
  }

  if (pickable && t1 && t2) {
    [f1,f2].forEach((fc,i) => {
      const team = i===0?t1:t2;
      fc.style.cursor = 'pointer';
      fc.addEventListener('click', e => { e.stopPropagation(); pick(matchId,team); });
      fc.addEventListener('mouseenter', () => fc.style.borderColor = 'var(--gold)');
      fc.addEventListener('mouseleave',  () => { if(!(i===0?p1:p2)||result) fc.style.borderColor=''; });
    });
  }
  wrap.appendChild(card); return wrap;
}

function getRoundForMatch(matchId) {
  for (const [r, ids] of Object.entries(ROUND_MATCHES)) { if (ids.includes(matchId)) return r; }
  return 'r32';
}

function makeCol(ids, label) {
  const col = document.createElement('div'); col.className = 'rcol';
  col.innerHTML = `<div class="rlbl">${label}</div>`;
  const ms = document.createElement('div'); ms.className = 'rmatches';
  for (const id of ids) ms.appendChild(makeCard(id));
  col.appendChild(ms); return col;
}

function makeCentreCol() {
  const col = document.createElement('div'); col.className = 'ccol';
  const f=M['final']; const {t1,t2}=f;
  const pickable=isPickable('final');
  const myPick=picks['final']||null;
  const result=results['final']||null;
  const correct=!!(myPick&&result&&myPick.n===result.n);
  const wrong  =!!(myPick&&result&&myPick.n!==result.n);

  const card=document.createElement('div');
  card.className='fin-card'+(pickable&&t1&&t2?'':' mlocked');
  const activeIdx=ROUND_ORDER.indexOf(activeRound), finalIdx=ROUND_ORDER.indexOf('final');
  if(!result&&!isPickable('final')&&activeIdx<finalIdx) card.style.opacity='0.45';

  const rw1=!!(result&&t1&&result.n===t1.n),rl1=!!(result&&t1&&!rw1);
  const rw2=!!(result&&t2&&result.n===t2.n),rl2=!!(result&&t2&&!rw2);
  const p1=!!(myPick&&t1&&myPick.n===t1.n),p2=!!(myPick&&t2&&myPick.n===t2.n);

  function mkFF(team,win,lose,isPicked) {
    const el=document.createElement('div');
    if(result&&isPicked&&lose) el.className='fin-flag ff-wrong';
    else if(result) el.className='fin-flag'+(win?' fw':lose?' fl':!team?' ft':'');
    else el.className='fin-flag'+(!team?' ft':isPicked?' ff-picked':'');
    el.innerHTML=flagImg(team?team.f:null); return el;
  }
  const ff1=mkFF(t1,rw1,rl1,p1),ff2=mkFF(t2,rw2,rl2,p2);
  if(p1&&!result) ff1.style.boxShadow='0 0 0 2px var(--gold)';
  if(p2&&!result) ff2.style.boxShadow='0 0 0 2px var(--gold)';

  const fvs=document.createElement('div'); fvs.className='fin-vs'; fvs.textContent='VS';
  const frow=document.createElement('div'); frow.className='fin-teams'; frow.append(ff1,fvs,ff2);
  const lbl=document.createElement('div'); lbl.className='finlbl'; lbl.textContent='Úrslit';
  const trophy=document.createElement('div'); trophy.className='trophy-ring'; trophy.textContent='🏆';
  const cl=document.createElement('div'); cl.className='champ-lbl'; cl.textContent='Heimsmeistari';
  const cv=document.createElement('div'); cv.className='champ-val';
  cv.style.color=result?(correct?'var(--green)':wrong?'var(--red)':'var(--gold2)'):'var(--t2)';
  cv.innerHTML=result?`<span style='display:inline-flex;align-items:center;gap:5px;'>${flagImg(result.f,20)} ${result.n}${correct?' ✓':wrong?' ✗':''}</span>`:myPick?`<span style='display:inline-flex;align-items:center;gap:5px;'>→ ${flagImg(myPick.f,20)} ${myPick.n}</span>`:'—';
  card.append(lbl,frow,trophy,cl,cv);

  if(pickable&&t1&&t2) {
    [ff1,ff2].forEach((el,i)=>{
      el.style.cursor='pointer';
      el.addEventListener('click',()=>pick('final',i===0?t1:t2));
      el.addEventListener('mouseenter',()=>el.style.boxShadow='0 0 0 2px var(--gold)');
      el.addEventListener('mouseleave',()=>{ if(!((i===0?p1:p2)&&!result)) el.style.boxShadow=''; });
    });
  }
  col.appendChild(card);

  /* THIRD PLACE */
  const tp=M['third']; const {t1:tp1,t2:tp2}=tp;
  const tpPickable=isPickable('third');
  const tpPick=picks['third']||null,tpResult=results['third']||null;
  const tpCard=document.createElement('div');
  tpCard.className='tp-card'+(tpPickable&&tp1&&tp2?'':' mlocked');
  const thirdIdx=ROUND_ORDER.indexOf('third');
  if(!tpResult&&!tpPickable&&activeIdx<thirdIdx) tpCard.style.opacity='0.45';

  const trw1=!!(tpResult&&tp1&&tpResult.n===tp1.n),trl1=!!(tpResult&&tp1&&!trw1);
  const trw2=!!(tpResult&&tp2&&tpResult.n===tp2.n),trl2=!!(tpResult&&tp2&&!trw2);
  const tp1p=!!(tpPick&&tp1&&tpPick.n===tp1.n),tp2p=!!(tpPick&&tp2&&tpPick.n===tp2.n);
  const tpCorrect=!!(tpPick&&tpResult&&tpPick.n===tpResult.n),tpWrong=!!(tpPick&&tpResult&&tpPick.n!==tpResult.n);

  function mkTF(team,win,lose,isPicked) {
    const el=document.createElement('div');
    if(tpResult&&isPicked&&lose) el.className='flag-circle tp-flag fc-wrong';
    else if(tpResult) el.className='flag-circle tp-flag'+(win?' fc-win':lose?' fc-lose':'');
    else el.className='flag-circle tp-flag'+(isPicked?' fc-picked':'');
    el.innerHTML=flagImg(team?team.f:null); return el;
  }
  const tf1=mkTF(tp1,trw1,trl1,tp1p),tpvs=document.createElement('div');
  tpvs.className='fin-vs'; tpvs.textContent='VS';
  const tf2=mkTF(tp2,trw2,trl2,tp2p);
  const trow=document.createElement('div'); trow.className='fin-teams'; trow.append(tf1,tpvs,tf2);
  const tpLbl=document.createElement('div'); tpLbl.className='tp-lbl'; tpLbl.textContent='🥉 3rd Place';
  const tcv=document.createElement('div'); tcv.className='champ-val'; tcv.style.fontSize='11px';
  tcv.style.color=tpResult?(tpCorrect?'var(--green)':tpWrong?'var(--red)':'var(--gold2)'):'var(--t2)';
  tcv.innerHTML=tpResult?`<span style='display:inline-flex;align-items:center;gap:4px;'>${flagImg(tpResult.f,16)} ${tpResult.n}${tpCorrect?' ✓':tpWrong?' ✗':''}</span>`:tpPick?`<span style='display:inline-flex;align-items:center;gap:4px;'>→ ${flagImg(tpPick.f,16)} ${tpPick.n}</span>`:(tp1&&tp2?'Veldu sigurvegara':'Óþekkt');
  tpCard.append(tpLbl,trow,tcv);
  if(tpPickable&&tp1&&tp2) {
    [tf1,tf2].forEach((el,i)=>{ el.style.cursor='pointer'; el.addEventListener('click',()=>pick('third',i===0?tp1:tp2)); el.addEventListener('mouseenter',()=>el.style.borderColor='var(--gold)'); el.addEventListener('mouseleave',()=>el.style.borderColor=''); });
  }
  col.appendChild(tpCard);
  return col;
}

/* ══ RENDER ══ */
function render() {
  const outer = document.getElementById('bouter');
  console.log('[render] bouter found:', !!outer, '| M keys:', Object.keys(M).length, '| teams:', teams.length, '| user:', !!user);
  if (!outer) return;
  outer.innerHTML = '';
  const left = document.createElement('div'); left.className = 'half hleft';
  left.appendChild(makeCol(['l_r16_0','l_r16_1','l_r16_2','l_r16_3','l_r16_4','l_r16_5','l_r16_6','l_r16_7'],'16-liða úrslit'));
  left.appendChild(makeCol(['l_qf_0','l_qf_1','l_qf_2','l_qf_3'],'Fjórðungsúrslit'));
  left.appendChild(makeCol(['l_sf_0','l_sf_1'],'Undanúrslit'));
  left.appendChild(makeCol(['l_sff'],'Undanúrslit lokaleikur'));
  outer.appendChild(left);
  outer.appendChild(makeCentreCol());
  const right = document.createElement('div'); right.className = 'half hright';
  right.appendChild(makeCol(['r_sff'],'Undanúrslit lokaleikur'));
  right.appendChild(makeCol(['r_sf_0','r_sf_1'],'Undanúrslit'));
  right.appendChild(makeCol(['r_qf_0','r_qf_1','r_qf_2','r_qf_3'],'Fjórðungsúrslit'));
  right.appendChild(makeCol(['r_r16_0','r_r16_1','r_r16_2','r_r16_3','r_r16_4','r_r16_5','r_r16_6','r_r16_7'],'16-liða úrslit'));
  outer.appendChild(right);
  renderProg();
  setStatus();
}

function renderProg() {
  const s = document.getElementById('pstrip'); if (!s) return;
  if (!user) { s.style.display='none'; return; }
  s.style.display = 'flex';
  const score = Object.entries(results).filter(([id,r])=>picks[id]?.n===r.n).length;
  const totalResults = Object.keys(results).length;
  const activeIds = (activeRound === 'third' || activeRound === 'final')
    ? [...(ROUND_MATCHES['third']||[]), ...(ROUND_MATCHES['final']||[])]
    : (ROUND_MATCHES[activeRound] || []);
  const madePicks = activeIds.filter(id => picks[id]).length;
  const roundLabel = ROUND_LABELS[activeRound] || activeRound;
  const _lr = (user.lockedRound === 'final') ? 'third' : user.lockedRound;
  const _ar = (activeRound === 'final') ? 'third' : activeRound;
  const isLockedThisRound = user.locked && _lr === _ar;
  const lockBtn = isLockedThisRound
    ? '<span style="background:rgba(232,232,232,.12);color:var(--gold);padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;">🔒 Picks locked</span>'
    : (!tournamentStarted ? `<button class="btn btn-p" onclick="lockMyPicks()" style="font-size:11px;padding:5px 12px;">🔒 Lock my picks</button>` : '');
  s.innerHTML = `
    <div class="pi"><div class="plbl">Active round</div><div class="pval" style="font-size:14px;">${roundLabel}</div></div>
    <div class="pi"><div class="plbl">Picks made</div><div class="pval">${madePicks}/${activeIds.length}</div></div>
    <div class="pi"><div class="plbl">My score</div><div class="pval">${score}${totalResults>0?`<span style="font-size:12px;color:var(--t2)"> / ${totalResults}</span>`:''}</div></div>
    <div class="pi" style="display:flex;align-items:center;">${lockBtn}</div>`;
}

function setStatus() {
  const b = document.getElementById('sbadge'); if (!b) return;
  const roundLabel = ROUND_LABELS[activeRound] || '';
  const cls   = tournamentStarted ? 'live' : locked ? 'locked' : 'open';
  const label = tournamentStarted ? 'Mót í gangi' : locked ? 'Læst' : `Opið · ${roundLabel}`;
  b.className = `sbadge ${cls}`;
  const sl = document.getElementById('slabel'); if (sl) sl.textContent = label;
}

/* ══ LEADERBOARD ══ */
async function renderLeaderboard() {
  const el = document.getElementById('panel-leaderboard'); if (!el) return;
  const data = await fetch('/api/leaderboard').then(r=>r.ok?r.json():[]).catch(()=>[]);
  if (!data.length) { el.innerHTML='<div class="card"><div class="empty">No entries yet.</div></div>'; return; }
  let html = `<div class="card"><div class="clabel">🏆 Leaderboard</div>
    <table class="lb-table"><thead><tr><th style="width:44px;">#</th><th>Player</th><th style="width:70px;">Points</th><th style="width:80px;">Status</th></tr></thead><tbody>`;
  let rank = 1;
  for (let i=0; i<data.length; i++) {
    const e=data[i];
    if (i>0&&e.score<data[i-1].score) rank=i+1;
    const medal=rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':`${rank}`;
    const isMe=user&&e.email===user.email;
    const init=e.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
    const scoreDisplay = e.locked ? e.score : '<span style="color:var(--t3);font-size:11px;">—</span>';
    html+=`<tr style="${isMe?'background:rgba(232,232,232,.05);':''}">
      <td class="lb-rank">${e.locked?medal:'—'}</td>
      <td><div style="display:flex;align-items:center;gap:9px;">
        <div class="av" style="width:28px;height:28px;font-size:10px;background:${isMe?'var(--gold)':'var(--s3)'};color:${isMe?'#111':'var(--t2)'};">${init}</div>
        <span style="font-weight:${isMe?700:500};color:${isMe?'var(--gold)':e.locked?'var(--text)':'var(--t3)'};">${e.name}${isMe?' (þú)':''}</span>
      </div></td>
      <td class="lb-score">${scoreDisplay}</td>
      <td><span class="bdg ${e.locked?'bg':'bd'}">${e.locked?'🔒':'Open'}</span></td>
    </tr>`;
  }
  html+=`</tbody></table></div>`;
  el.innerHTML=html;
}

/* ══ ENTRIES (admin) ══ */
function renderEntries() {
  const el=document.getElementById('panel-entries'); if(!el) return;
  if(!adminPass) {
    el.innerHTML=`<div class="card"><div class="clabel">Admin access only</div>
      <div style="display:flex;flex-direction:column;gap:10px;max-width:300px;">
        <input type="password" id="apass" placeholder="Admin password" style="font-family:inherit;font-size:13px;padding:9px 12px;border:1px solid var(--b2);border-radius:6px;background:var(--s2);color:var(--text);outline:none;" onkeydown="if(event.key==='Enter')adminLogin()"/>
        <div style="display:flex;align-items:center;gap:10px;"><button class="btn btn-p" onclick="adminLogin()">Login →</button>
        <span style="font-size:12px;color:var(--red);display:none;" id="loginErr">Wrong password</span></div>
      </div></div>`;
    return;
  }
  if(!entries.length) { el.innerHTML='<div class="card"><div class="empty">No entries yet.</div></div>'; return; }
  const scored=entries.map(e=>({...e,score:Object.entries(results).filter(([id,r])=>e.picks?.[id]?.n===r.n).length})).sort((a,b)=>b.score-a.score);
  let html=`<div class="card"><div class="clabel">All entries (${entries.length})</div>
    <table class="etbl"><thead><tr><th>Player</th><th>Score</th><th>Status</th><th>Actions</th></tr></thead><tbody>`;
  for(const e of scored){
    const init=e.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
    const esc=e.email.replace(/'/g,"\\'");
    html+=`<tr><td><div style="display:flex;align-items:center;gap:9px;">
      <div class="av" style="width:28px;height:28px;font-size:10px;">${init}</div>
      <div><div style="font-weight:600;color:var(--text);">${e.name}</div><div style="font-size:10px;color:var(--t3);">${e.email}</div></div>
    </div></td>
    <td style="font-weight:700;color:var(--gold);font-size:16px;">${e.score}</td>
    <td><span class="bdg ${e.locked?'bg':'bd'}">${e.locked?'🔒':'Open'}</span></td>
    <td><div style="display:flex;gap:6px;">
      <button class="btn btn-d" style="font-size:10px;padding:3px 8px;" onclick="adminResetEntry('${esc}')">Reset</button>
      ${e.locked?`<button class="btn" style="font-size:10px;padding:3px 8px;" onclick="adminUnlockEntry('${esc}')">Unlock</button>`:''}
    </div></td></tr>`;
  }
  html+=`</tbody></table></div>`;
  el.innerHTML=html;
}

/* ══ TABS ══ */
function showTab(name, el) {
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.ntab').forEach(t=>t.classList.remove('active'));
  const panel=document.getElementById('panel-'+name);
  if(panel) panel.classList.add('active');
  if(el) el.classList.add('active');
  currentTab=name;
  if(name==='leaderboard') renderLeaderboard();
  if(name==='entries') renderEntries();
}

/* ══ ADMIN ══ */
async function adminLogin() {
  const pass=document.getElementById('apass')?.value||'';
  const r=await api('/admin/verify',{method:'POST',body:JSON.stringify({pass})});
  if(r?.ok){adminPass=pass;sessionStorage.setItem('adminPass',pass);document.getElementById('abar').classList.add('on');loadEntries();renderEntries();}
  else{const err=document.getElementById('loginErr');if(err){err.style.display='inline';setTimeout(()=>err.style.display='none',3000);}}
}
function adminLogout(){adminPass=null;sessionStorage.removeItem('adminPass');document.getElementById('abar').classList.remove('on');renderEntries();}
async function setActiveRound(roundId){activeRound=roundId;await api('/bracket-state',{method:'PUT',body:JSON.stringify({activeRound:roundId})});render();}
async function startTournament(){if(!confirm('Lock all picks?'))return;tournamentStarted=true;await api('/bracket-state',{method:'PUT',body:JSON.stringify({tournamentStarted:true})});render();}
async function stopTournament(){tournamentStarted=false;await api('/bracket-state',{method:'PUT',body:JSON.stringify({tournamentStarted:false})});render();}
async function manualSync(){
  const btn=document.getElementById('sync-btn'),st=document.getElementById('sync-status');
  if(btn){btn.disabled=true;btn.textContent='↻ Samstilli…';}
  const r=await api('/admin/sync-results',{method:'POST'});
  if(btn){btn.disabled=false;btn.textContent='↻ Samstilla niðurstöður';}
  if(r?.ok){if(st)st.textContent=`Synced · ${r.lastSync?new Date(r.lastSync).toLocaleTimeString():'now'}`;const res=await api('/results');if(res&&!res.error){results=res;propagateResults();render();}}
}
async function adminResetEntry(email){if(!confirm(`Reset picks for ${email}?`))return;const r=await api(`/admin/entries/${encodeURIComponent(email)}/reset`,{method:'PUT'});if(r?.ok){await loadEntries();renderEntries();}}
async function adminUnlockEntry(email){if(!confirm(`Unlock picks for ${email}?`))return;const r=await api(`/admin/entries/${encodeURIComponent(email)}/unlock`,{method:'PUT'});if(r?.ok){await loadEntries();renderEntries();}}
async function adminResetMyPicks(){if(!user)return;const r=await api(`/admin/entries/${encodeURIComponent(user.email)}/reset`,{method:'PUT'});if(r?.ok){picks={};user.locked=false;sessionStorage.setItem('wcUser',JSON.stringify(user));render();}}
async function loadEntries(){if(!adminPass)return;const d=await api('/entries');if(Array.isArray(d))entries=d;}
async function loadSyncStatus(){const r=await api('/admin/sync-status');const st=document.getElementById('sync-status');if(r&&st)st.textContent=`Last sync: ${r.lastSync?new Date(r.lastSync).toLocaleTimeString():'aldrei'}`;}
function logout(){sessionStorage.removeItem('wcUser');window.location.href='/';}

/* ══ BOOT ══ */
(async function init() {
  let sessionUser=null;
  try{sessionUser=JSON.parse(sessionStorage.getItem('wcUser'));}catch{}
  if(!sessionUser){window.location.href='/login';return;}
  user=sessionUser;
  document.getElementById('logout-btn').style.display='block';
  if(user.isAdmin){if(adminPass){document.getElementById('abar').classList.add('on');loadSyncStatus();}document.getElementById('tab-entries').style.display='';}
  teams=DEMO.slice();locked=false;tournamentStarted=false;activeRound='r32';
  initMatches(); propagateResults(); render();
  const [st,res]=await Promise.all([api('/bracket-state'),api('/results')]);
  if(st&&!st.error){locked=!!st.locked;tournamentStarted=!!st.tournamentStarted;activeRound=st.activeRound||'r32';if(st.teams&&st.teams.length===32)teams=st.teams.map(t=>({n:t.name||t.n,f:t.flag||t.f}));}
  if(res&&!res.error)results=res;
  const sel=document.getElementById('round-selector');if(sel)sel.value=activeRound;
  const fresh=await fetch(`${API}/entries/${encodeURIComponent(user.email)}`).then(r=>r.ok?r.json():null).catch(()=>null);
  if(fresh&&!fresh.error){user={...user,...fresh};sessionStorage.setItem('wcUser',JSON.stringify(user));picks=fresh.picks||{};}
  initMatches();propagateResults();render();
  if(adminPass)loadEntries();
})();
