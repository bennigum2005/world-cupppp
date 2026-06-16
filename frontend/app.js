const API_BASE = '/api';

/* Real 2026 bracket matchups — left side then right side, in order */
const DEMO_TEAMS = [
  /* LEFT SIDE — R16 matchups top to bottom */
  {name:'Germany',  flag:'🇩🇪'}, {name:'Scotland', flag:'🏴󠁧󠁢󠁳󠁣󠁴󠁿'},
  {name:'France',   flag:'🇫🇷'}, {name:'Egypt',    flag:'🇪🇬'},
  {name:'S. Korea', flag:'🇰🇷'}, {name:'Canada',   flag:'🇨🇦'},
  {name:'Netherlands',flag:'🇳🇱'},{name:'Morocco',  flag:'🇲🇦'},
  {name:'Colombia', flag:'🇨🇴'}, {name:'Croatia',  flag:'🇭🇷'},
  {name:'Spain',    flag:'🇪🇸'}, {name:'Austria',  flag:'🇦🇹'},
  {name:'USA',      flag:'🇺🇸'}, {name:'Bosnia',   flag:'🇧🇦'},
  {name:'Belgium',  flag:'🇧🇪'}, {name:'Ivory Coast',flag:'🇨🇮'},
  /* RIGHT SIDE — R16 matchups top to bottom */
  {name:'Brazil',   flag:'🇧🇷'}, {name:'Japan',    flag:'🇯🇵'},
  {name:'Ecuador',  flag:'🇪🇨'}, {name:'Norway',   flag:'🇳🇴'},
  {name:'Mexico',   flag:'🇲🇽'}, {name:'Sweden',   flag:'🇸🇪'},
  {name:'England',  flag:'🏴󠁧󠁢󠁥󠁮󠁧󠁿'}, {name:'Senegal',  flag:'🇸🇳'},
  {name:'Argentina',flag:'🇦🇷'}, {name:'Uruguay',  flag:'🇺🇾'},
  {name:'Australia',flag:'🇦🇺'}, {name:'Iran',     flag:'🇮🇷'},
  {name:'Switzerland',flag:'🇨🇭'},{name:'Algeria',  flag:'🇩🇿'},
  {name:'Portugal', flag:'🇵🇹'}, {name:'Turkey',   flag:'🇹🇷'},
];

const PLACEHOLDER_TEAMS = Array.from({length:32},(_,i)=>({
  name:`Team ${i+1}`, flag:'🏳'
}));

let isLocked = true;
let currentUser = null;
let allEntries = [];
let teams = PLACEHOLDER_TEAMS.map(t=>({...t}));

/* rounds[0] = left R16 (8 matches), rounds[1] = left QF (4),
   rounds[2] = left SF (2), rounds[3] = FINAL (1),
   rounds[4] = right SF (2), rounds[5] = right QF (4), rounds[6] = right R16 (8) */
let rounds = [];

function showTab(name, el) {
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.ntab').forEach(t=>t.classList.remove('active'));
  document.getElementById('panel-'+name).classList.add('active');
  el.classList.add('active');
  if (name==='entries') renderEntryList();
}

async function apiFetch(path, opts={}) {
  try {
    const res = await fetch(API_BASE+path,{headers:{'Content-Type':'application/json'},...opts});
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  } catch(e) { console.error('API:',e); return null; }
}

function makeMatch(id, t1, t2, src1, src2) {
  return {id, team1:t1||null, team2:t2||null, winner:null, src1:src1||null, src2:src2||null};
}

function initRounds() {
  const T = teams;
  /* left R16: pairs 0-1, 2-3, 4-5, 6-7, 8-9, 10-11, 12-13, 14-15 */
  const lR16 = Array.from({length:8},(_,i)=>makeMatch(`l0m${i}`,T[i*2],T[i*2+1]));
  /* left QF */
  const lQF  = Array.from({length:4},(_,i)=>makeMatch(`l1m${i}`,null,null,`l0m${i*2}`,`l0m${i*2+1}`));
  /* left SF */
  const lSF  = Array.from({length:2},(_,i)=>makeMatch(`l2m${i}`,null,null,`l1m${i*2}`,`l1m${i*2+1}`));

  /* right R16: pairs 16-17, 18-19, ..., 30-31 */
  const rR16 = Array.from({length:8},(_,i)=>makeMatch(`r0m${i}`,T[16+i*2],T[16+i*2+1]));
  const rQF  = Array.from({length:4},(_,i)=>makeMatch(`r1m${i}`,null,null,`r0m${i*2}`,`r0m${i*2+1}`));
  const rSF  = Array.from({length:2},(_,i)=>makeMatch(`r2m${i}`,null,null,`r1m${i*2}`,`r1m${i*2+1}`));

  /* Final */
  const final = [makeMatch('final',null,null,'l2m0','l2m1')];
  /* We'll set final src specially: left SF winners vs right SF winners */
  final[0].src1 = 'l2m0'; final[0].src2 = 'r2m0';

  rounds = [lR16, lQF, lSF, final, rSF, rQF, rR16];
}

function getMatch(id) {
  for (const r of rounds) for (const m of r) if (m.id===id) return m;
  return null;
}

function propagate() {
  /* left side */
  for (let r=1;r<=2;r++) {
    for (const m of rounds[r]) {
      m.team1 = getMatch(m.src1)?.winner||null;
      m.team2 = getMatch(m.src2)?.winner||null;
      if (m.winner&&((!m.team1||m.winner.name!==m.team1.name)&&(!m.team2||m.winner.name!==m.team2.name))) m.winner=null;
    }
  }
  /* right side (stored reversed: index 4=SF, 5=QF, 6=R16) */
  for (let r=4;r<=5;r++) {
    for (const m of rounds[r]) {
      m.team1 = getMatch(m.src1)?.winner||null;
      m.team2 = getMatch(m.src2)?.winner||null;
      if (m.winner&&((!m.team1||m.winner.name!==m.team1.name)&&(!m.team2||m.winner.name!==m.team2.name))) m.winner=null;
    }
  }
  /* final */
  const fin = rounds[3][0];
  fin.team1 = getMatch('l2m0')?.winner||null;
  fin.team2 = getMatch('r2m0')?.winner||null;
  if (fin.winner&&((!fin.team1||fin.winner.name!==fin.team1.name)&&(!fin.team2||fin.winner.name!==fin.team2.name))) fin.winner=null;
}

async function pickWinner(matchId, team) {
  if (isLocked||!team||!currentUser) return;
  const m=getMatch(matchId); if(!m) return;
  m.winner=team; propagate(); render(); await savePicks();
}

function makeSlot(t, matchId, isWin, isLose, canPick) {
  const isTbd=!t;
  const el=document.createElement('div');
  let cls='slot';
  if(isTbd)         cls+=' s-tbd';
  else if(!canPick) cls+=' s-dis';
  if(isWin)  cls+=' s-win';
  if(isLose) cls+=' s-lose';
  el.className=cls;
  el.innerHTML=`<span class="sflag">${t?t.flag:'🏳'}</span><span class="sname">${t?t.name:'TBD'}</span>${isWin?'<span class="scheck">✓</span>':''}`;
  if(canPick&&t&&!isTbd) el.addEventListener('click',()=>pickWinner(matchId,t));
  return el;
}

function buildRoundCol(roundMatches, label, isRight) {
  const col=document.createElement('div'); col.className='r-col';
  col.innerHTML=`<div class="r-col-label">${label}</div>`;
  const ms=document.createElement('div'); ms.className='r-col-matches';
  const canPick=!isLocked&&!!currentUser;

  for (const m of roundMatches) {
    const {team1:t1,team2:t2,winner:w}=m;
    const mu=document.createElement('div'); mu.className='matchup';
    const match=document.createElement('div'); match.className='match';
    const s1=makeSlot(t1,m.id,w&&t1&&w.name===t1.name,w&&t1&&w.name!==t1.name,canPick);
    const vs=document.createElement('div'); vs.className='vs-line'; vs.textContent='vs';
    const s2=makeSlot(t2,m.id,w&&t2&&w.name===t2.name,w&&t2&&w.name!==t2.name,canPick);
    match.append(s1,vs,s2); mu.appendChild(match); ms.appendChild(mu);
  }
  col.appendChild(ms);
  return col;
}

function render() {
  const outer=document.getElementById('bracketOuter');
  outer.innerHTML='';

  /* Left side: R16 → QF → SF */
  const leftSide=document.createElement('div'); leftSide.className='side side-left';
  leftSide.appendChild(buildRoundCol(rounds[0],'Round of 16',false));
  leftSide.appendChild(buildRoundCol(rounds[1],'Quarter-finals',false));
  leftSide.appendChild(buildRoundCol(rounds[2],'Semi-finals',false));
  outer.appendChild(leftSide);

  /* Center: Final + Trophy */
  const center=document.createElement('div'); center.className='center-col';
  const fin=rounds[3][0]; const canPick=!isLocked&&!!currentUser;
  const champ=fin.winner;
  center.innerHTML=`<div class="final-label">Final</div>`;
  const fs=document.createElement('div'); fs.className='final-slots';
  const ft1=makeSlot(fin.team1,'final',champ&&fin.team1&&champ.name===fin.team1.name,champ&&fin.team1&&champ.name!==fin.team1.name,canPick);
  const fvs=document.createElement('div'); fvs.className='vs-line'; fvs.textContent='vs';
  const ft2=makeSlot(fin.team2,'final',champ&&fin.team2&&champ.name===fin.team2.name,champ&&fin.team2&&champ.name!==fin.team2.name,canPick);
  fs.append(ft1,fvs,ft2);
  const tc=document.createElement('div'); tc.className='trophy-center';
  tc.innerHTML=`<div class="trophy-circle">🏆</div><div class="champ-label">Champion</div><div class="champ-name">${champ?champ.flag+' '+champ.name:'—'}</div>`;
  center.append(fs,tc);
  outer.appendChild(center);

  /* Right side: SF → QF → R16 (reversed display) */
  const rightSide=document.createElement('div'); rightSide.className='side side-right';
  rightSide.appendChild(buildRoundCol(rounds[4],'Semi-finals',true));
  rightSide.appendChild(buildRoundCol(rounds[5],'Quarter-finals',true));
  rightSide.appendChild(buildRoundCol(rounds[6],'Round of 16',true));
  outer.appendChild(rightSide);

  renderProgress();
}

function renderProgress() {
  const strip=document.getElementById('progStrip');
  if(!currentUser||isLocked){strip.style.display='none';return;}
  strip.style.display='flex';
  let made=0;
  for(const r of rounds) for(const m of r) if(m.winner) made++;
  const total=31;
  const champ=rounds[3][0].winner;
  strip.innerHTML=`
    <div class="prog-item"><div class="prog-label">Picks made</div><div class="prog-val">${made}/${total}</div></div>
    <div class="prog-item"><div class="prog-label">Remaining</div><div class="prog-val">${total-made}</div></div>
    <div class="prog-item"><div class="prog-label">My champion</div><div class="prog-val" style="font-size:14px;">${champ?champ.flag+' '+champ.name:'Not picked yet'}</div></div>`;
}

async function registerEntry() {
  const name=document.getElementById('inp-name').value.trim();
  const email=document.getElementById('inp-email').value.trim();
  const msg=document.getElementById('entryMsg');
  if(!name){setMsg(msg,'Please enter your name.','err');return;}
  if(!email||!/^[^@]+@[^@]+\.[^@]+$/.test(email)){setMsg(msg,'Please enter a valid email.','err');return;}
  const data=await apiFetch('/entries',{method:'POST',body:JSON.stringify({name,email})});
  if(!data){setMsg(msg,'Could not save — please try again.','err');return;}
  currentUser=data;
  setMsg(msg,data.created?'Details saved!':'Welcome back!','ok');
  if(data.picks){
    initRounds();
    for(const [mid,team] of Object.entries(data.picks)){const m=getMatch(mid);if(m)m.winner=team;}
    propagate();
  }
  await loadEntries(); showWelcomeBack(); render();
}

async function loadEntries(){const d=await apiFetch('/entries');if(d)allEntries=d;}

async function savePicks(){
  if(!currentUser)return;
  const picks={};
  for(const r of rounds) for(const m of r) if(m.winner) picks[m.id]=m.winner;
  const champion=rounds[3][0].winner||null;
  await apiFetch(`/entries/${encodeURIComponent(currentUser.email)}/picks`,{method:'PUT',body:JSON.stringify({picks,champion})});
  const idx=allEntries.findIndex(e=>e.email===currentUser.email);
  if(idx>=0){allEntries[idx].picks=picks;allEntries[idx].champion=champion;}
}

function renderEntryList(){
  const list=document.getElementById('entryList');
  const isAdmin=new URLSearchParams(location.search).get('admin')==='1';
  if(!isAdmin){list.innerHTML='<div class="empty">Entry list is private.</div>';return;}
  if(allEntries.length===0){list.innerHTML='<div class="empty">No entries yet — share the link with your friends!</div>';return;}
  const rows=allEntries.map(e=>{
    const picks=Object.keys(e.picks||{}).length;
    const champ=e.champion;
    const pct=Math.round((picks/31)*100);
    const init=e.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
    return `<tr>
      <td><div style="display:flex;align-items:center;gap:9px;">
        <div class="av" style="width:28px;height:28px;font-size:10px;">${init}</div>
        <div><div style="font-weight:600;">${e.name}</div><div style="font-size:11px;color:#888;">${e.email}</div></div>
      </div></td>
      <td>${champ?champ.flag+' '+champ.name:'<span style="color:#bbb">Not picked</span>'}</td>
      <td><div style="display:flex;align-items:center;gap:8px;">
        <div style="flex:1;height:4px;background:#eee;border-radius:2px;min-width:50px;">
          <div style="height:4px;background:#1a6b3c;border-radius:2px;width:${pct}%;"></div>
        </div>
        <span class="badge ${picks===31?'b-gold':picks>0?'b-green':'b-gray'}">${picks}/31</span>
      </div></td>
    </tr>`;
  }).join('');
  list.innerHTML=`<table class="entries-tbl"><thead><tr><th>Player</th><th>Champion pick</th><th>Progress</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function showWelcomeBack(){
  const wb=document.getElementById('welcomeBack');
  const es=document.getElementById('entrySection');
  if(!currentUser){wb.style.display='none';es.style.display='block';return;}
  es.style.display='none'; wb.style.display='block';
  const init=currentUser.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
  wb.innerHTML=`<div class="welcome-bar"><div class="av">${init}</div><div style="flex:1"><div class="wb-name">${currentUser.name}</div><div class="wb-sub">${currentUser.email}</div></div><button class="btn" onclick="switchUser()" style="font-size:11px;">Not you?</button></div>`;
}

function switchUser(){
  currentUser=null;initRounds();
  document.getElementById('inp-name').value='';
  document.getElementById('inp-email').value='';
  document.getElementById('entryMsg').textContent='';
  showWelcomeBack();render();
}

function setStatus(locked){
  const pill=document.getElementById('statusPill');
  pill.className='status-pill '+(locked?'locked':'open');
  document.getElementById('statusLabel').textContent=locked?'Bracket locked':'Picks open';
}

function setMsg(el,text,type){el.textContent=text;el.className='fmsg '+type;}

async function unlockBracket(){
  teams=DEMO_TEAMS.map(t=>({...t}));isLocked=false;
  await apiFetch('/bracket-state',{method:'PUT',body:JSON.stringify({locked:false,teams})});
  initRounds();setStatus(false);render();
}
async function lockBracket(){
  isLocked=true;teams=PLACEHOLDER_TEAMS.map(t=>({...t}));
  await apiFetch('/bracket-state',{method:'PUT',body:JSON.stringify({locked:true,teams:[]})});
  initRounds();setStatus(true);render();
}
async function resetCurrentPicks(){
  if(!currentUser)return;
  await apiFetch(`/entries/${encodeURIComponent(currentUser.email)}/picks`,{method:'PUT',body:JSON.stringify({picks:{},champion:null})});
  initRounds();render();
}

(async function init(){
  const isAdmin=new URLSearchParams(location.search).get('admin')==='1';
  if(isAdmin)document.getElementById('adminBar').classList.add('on');
  const state=await apiFetch('/bracket-state');
  if(state){isLocked=state.locked;if(!isLocked&&state.teams?.length)teams=state.teams;}
  setStatus(isLocked);
  await loadEntries();
  initRounds();render();
})();
