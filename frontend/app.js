const API_BASE = '/api';

/* 32 demo teams — left half uses indices 0-15, right half 16-31
   Each pair is one R16 match */
const DEMO_TEAMS = [
  /* LEFT — top to bottom */
  {name:'Germany',     flag:'🇩🇪'},{name:'Scotland',    flag:'🏴󠁧󠁢󠁳󠁣󠁴󠁿'},
  {name:'France',      flag:'🇫🇷'},{name:'Egypt',       flag:'🇪🇬'},
  {name:'Netherlands', flag:'🇳🇱'},{name:'Morocco',     flag:'🇲🇦'},
  {name:'Spain',       flag:'🇪🇸'},{name:'Austria',     flag:'🇦🇹'},
  {name:'USA',         flag:'🇺🇸'},{name:'Bosnia',      flag:'🇧🇦'},
  {name:'Belgium',     flag:'🇧🇪'},{name:'S. Korea',    flag:'🇰🇷'},
  {name:'Colombia',    flag:'🇨🇴'},{name:'Croatia',     flag:'🇭🇷'},
  {name:'Canada',      flag:'🇨🇦'},{name:'Ivory Coast', flag:'🇨🇮'},
  /* RIGHT — top to bottom */
  {name:'Brazil',      flag:'🇧🇷'},{name:'Japan',       flag:'🇯🇵'},
  {name:'England',     flag:'🏴󠁧󠁢󠁥󠁮󠁧󠁿'},{name:'Senegal',     flag:'🇸🇳'},
  {name:'Argentina',   flag:'🇦🇷'},{name:'Ecuador',     flag:'🇪🇨'},
  {name:'Portugal',    flag:'🇵🇹'},{name:'Turkey',      flag:'🇹🇷'},
  {name:'Mexico',      flag:'🇲🇽'},{name:'Sweden',      flag:'🇸🇪'},
  {name:'Australia',   flag:'🇦🇺'},{name:'Norway',      flag:'🇳🇴'},
  {name:'Switzerland', flag:'🇨🇭'},{name:'Algeria',     flag:'🇩🇿'},
  {name:'Uruguay',     flag:'🇺🇾'},{name:'Iran',        flag:'🇮🇷'},
];

const PLACEHOLDER = Array.from({length:32},(_,i)=>({name:`Team ${i+1}`,flag:'🏳'}));

let isLocked=true, currentUser=null, allEntries=[], teams=PLACEHOLDER.map(t=>({...t}));

/* rounds layout:
   [0] left R16  (8 matches)
   [1] left QF   (4)
   [2] left SF   (2)
   [3] final     (1)
   [4] right SF  (2)
   [5] right QF  (4)
   [6] right R16 (8)
*/
let rounds=[];

function mk(id,t1,t2,s1,s2){return{id,team1:t1||null,team2:t2||null,winner:null,src1:s1||null,src2:s2||null};}

function initRounds(){
  const T=teams;
  const lR16=Array.from({length:8},(_,i)=>mk(`l0m${i}`,T[i*2],T[i*2+1]));
  const lQF =Array.from({length:4},(_,i)=>mk(`l1m${i}`,null,null,`l0m${i*2}`,`l0m${i*2+1}`));
  const lSF =Array.from({length:2},(_,i)=>mk(`l2m${i}`,null,null,`l1m${i*2}`,`l1m${i*2+1}`));
  const rR16=Array.from({length:8},(_,i)=>mk(`r0m${i}`,T[16+i*2],T[16+i*2+1]));
  const rQF =Array.from({length:4},(_,i)=>mk(`r1m${i}`,null,null,`r0m${i*2}`,`r0m${i*2+1}`));
  const rSF =Array.from({length:2},(_,i)=>mk(`r2m${i}`,null,null,`r1m${i*2}`,`r1m${i*2+1}`));
  const fin =[mk('final',null,null,'l2m0','r2m0')];
  rounds=[lR16,lQF,lSF,fin,rSF,rQF,rR16];
}

function getM(id){for(const r of rounds)for(const m of r)if(m.id===id)return m;return null;}

function propagate(){
  [[1,2],[4,5]].forEach(([a,b])=>{
    for(let r=a;r<=b;r++)for(const m of rounds[r]){
      m.team1=getM(m.src1)?.winner||null;
      m.team2=getM(m.src2)?.winner||null;
      if(m.winner&&(!m.team1||m.winner.name!==m.team1.name)&&(!m.team2||m.winner.name!==m.team2.name))m.winner=null;
    }
  });
  const f=rounds[3][0];
  f.team1=getM('l2m0')?.winner||null;
  f.team2=getM('r2m0')?.winner||null;
  if(f.winner&&(!f.team1||f.winner.name!==f.team1.name)&&(!f.team2||f.winner.name!==f.team2.name))f.winner=null;
}

async function apiFetch(path,opts={}){
  try{const r=await fetch(API_BASE+path,{headers:{'Content-Type':'application/json'},...opts});if(!r.ok)throw new Error();return r.json();}catch(e){console.error(e);return null;}
}

async function pickWinner(mid,team){
  if(isLocked||!team||!currentUser)return;
  const m=getM(mid);if(!m)return;
  m.winner=team;propagate();render();await savePicks();
}

function makeSlot(t,mid,win,lose,canPick){
  const el=document.createElement('div');
  let c='slot';
  if(!t)c+=' s-tbd';else if(!canPick)c+=' s-dis';
  if(win)c+=' s-win';if(lose)c+=' s-lose';
  el.className=c;
  el.innerHTML=`<span class="sflag">${t?t.flag:'🏳'}</span><span class="sname">${t?t.name:'TBD'}</span>${win?'<span class="scheck">✓</span>':''}`;
  if(canPick&&t)el.addEventListener('click',()=>pickWinner(mid,t));
  return el;
}

function buildCol(matchArr,label,isRight){
  const col=document.createElement('div');col.className='r-col';
  col.innerHTML=`<div class="r-col-label">${label}</div>`;
  const ms=document.createElement('div');ms.className='r-col-matches';
  const can=!isLocked&&!!currentUser;
  for(const m of matchArr){
    const {team1:t1,team2:t2,winner:w}=m;
    const mu=document.createElement('div');mu.className='matchup';
    const match=document.createElement('div');match.className='match';
    const s1=makeSlot(t1,m.id,w&&t1&&w.name===t1.name,w&&t1&&w.name!==t1.name,can);
    const vs=document.createElement('div');vs.className='vs-line';vs.textContent='vs';
    const s2=makeSlot(t2,m.id,w&&t2&&w.name===t2.name,w&&t2&&w.name!==t2.name,can);
    match.append(s1,vs,s2);mu.appendChild(match);ms.appendChild(mu);
  }
  col.appendChild(ms);return col;
}

function render(){
  const outer=document.getElementById('bracketOuter');
  outer.innerHTML='';
  const can=!isLocked&&!!currentUser;

  /* LEFT HALF — flows left to right toward centre */
  const left=document.createElement('div');left.className='half half-left';
  left.appendChild(buildCol(rounds[0],'Round of 16'));
  left.appendChild(buildCol(rounds[1],'Quarter-finals'));
  left.appendChild(buildCol(rounds[2],'Semi-finals'));
  outer.appendChild(left);

  /* CENTRE */
  const centre=document.createElement('div');centre.className='center-col';
  const fin=rounds[3][0];const champ=fin.winner;
  const lbl=document.createElement('div');lbl.className='final-lbl';lbl.textContent='Final';
  const fs=document.createElement('div');fs.className='final-slots';
  const f1=makeSlot(fin.team1,'final',champ&&fin.team1&&champ.name===fin.team1.name,champ&&fin.team1&&champ.name!==fin.team1.name,can);
  const fvs=document.createElement('div');fvs.className='vs-line';fvs.textContent='vs';
  const f2=makeSlot(fin.team2,'final',champ&&fin.team2&&champ.name===fin.team2.name,champ&&fin.team2&&champ.name!==fin.team2.name,can);
  fs.append(f1,fvs,f2);
  const tw=document.createElement('div');tw.className='trophy-wrap';
  tw.innerHTML=`<div class="trophy-ring">🏆</div><div class="champ-name-lbl">World Champion</div><div class="champ-name-val">${champ?champ.flag+' '+champ.name:'—'}</div>`;
  centre.append(lbl,fs,tw);
  outer.appendChild(centre);

  /* RIGHT HALF — flows right to left toward centre (reversed columns) */
  const right=document.createElement('div');right.className='half half-right';
  right.appendChild(buildCol(rounds[4],'Semi-finals',true));
  right.appendChild(buildCol(rounds[5],'Quarter-finals',true));
  right.appendChild(buildCol(rounds[6],'Round of 16',true));
  outer.appendChild(right);

  renderProg();
}

function renderProg(){
  const s=document.getElementById('progStrip');
  if(!currentUser||isLocked){s.style.display='none';return;}
  s.style.display='flex';
  let made=0;for(const r of rounds)for(const m of r)if(m.winner)made++;
  const champ=rounds[3][0].winner;
  s.innerHTML=`
    <div class="prog-item"><div class="prog-label">Picks made</div><div class="prog-val">${made}/31</div></div>
    <div class="prog-item"><div class="prog-label">Remaining</div><div class="prog-val">${31-made}</div></div>
    <div class="prog-item"><div class="prog-label">My champion</div><div class="prog-val" style="font-size:14px;">${champ?champ.flag+' '+champ.name:'—'}</div></div>`;
}

function showTab(name,el){
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.ntab').forEach(t=>t.classList.remove('active'));
  document.getElementById('panel-'+name).classList.add('active');
  el.classList.add('active');
  if(name==='entries')renderEntries();
}

async function registerEntry(){
  const name=document.getElementById('inp-name').value.trim();
  const email=document.getElementById('inp-email').value.trim();
  const msg=document.getElementById('entryMsg');
  if(!name)return setMsg(msg,'Please enter your name.','err');
  if(!email||!/^[^@]+@[^@]+\.[^@]+$/.test(email))return setMsg(msg,'Please enter a valid email.','err');
  const d=await apiFetch('/entries',{method:'POST',body:JSON.stringify({name,email})});
  if(!d)return setMsg(msg,'Could not save — try again.','err');
  currentUser=d;
  setMsg(msg,d.created?'Details saved!':'Welcome back!','ok');
  if(d.picks){initRounds();for(const[mid,t]of Object.entries(d.picks)){const m=getM(mid);if(m)m.winner=t;}propagate();}
  await loadEntries();showWelcome();render();
}

async function loadEntries(){const d=await apiFetch('/entries');if(d)allEntries=d;}

async function savePicks(){
  if(!currentUser)return;
  const picks={};for(const r of rounds)for(const m of r)if(m.winner)picks[m.id]=m.winner;
  const champion=rounds[3][0].winner||null;
  await apiFetch(`/entries/${encodeURIComponent(currentUser.email)}/picks`,{method:'PUT',body:JSON.stringify({picks,champion})});
  const i=allEntries.findIndex(e=>e.email===currentUser.email);
  if(i>=0){allEntries[i].picks=picks;allEntries[i].champion=champion;}
}

function showWelcome(){
  const wb=document.getElementById('welcomeBack');
  const es=document.getElementById('entrySection');
  if(!currentUser){wb.style.display='none';es.style.display='block';return;}
  es.style.display='none';wb.style.display='block';
  const init=currentUser.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
  wb.innerHTML=`<div class="welcome-bar"><div class="av" style="width:32px;height:32px;font-size:11px;">${init}</div><div style="flex:1"><div class="wb-name">${currentUser.name}</div><div class="wb-sub">${currentUser.email}</div></div><button class="btn" onclick="switchUser()" style="font-size:11px;">Not you?</button></div>`;
}

function switchUser(){
  currentUser=null;initRounds();
  document.getElementById('inp-name').value='';
  document.getElementById('inp-email').value='';
  document.getElementById('entryMsg').textContent='';
  showWelcome();render();
}

function renderEntries(){
  const list=document.getElementById('entryList');
  const admin=new URLSearchParams(location.search).get('admin')==='1';
  if(!admin){list.innerHTML='<div class="empty">Entry list is private.</div>';return;}
  if(!allEntries.length){list.innerHTML='<div class="empty">No entries yet.</div>';return;}
  const rows=allEntries.map(e=>{
    const picks=Object.keys(e.picks||{}).length;
    const pct=Math.round((picks/31)*100);
    const init=e.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
    return `<tr>
      <td><div style="display:flex;align-items:center;gap:9px;">
        <div class="av" style="width:28px;height:28px;font-size:10px;">${init}</div>
        <div><div style="font-weight:600;color:var(--text);">${e.name}</div><div style="font-size:10px;color:var(--text3);">${e.email}</div></div>
      </div></td>
      <td>${e.champion?e.champion.flag+' '+e.champion.name:'<span style="color:var(--text3)">Not picked</span>'}</td>
      <td><div style="display:flex;align-items:center;gap:8px;">
        <div style="flex:1;height:3px;background:var(--border2);border-radius:2px;min-width:60px;">
          <div style="height:3px;background:var(--gold);border-radius:2px;width:${pct}%;"></div>
        </div>
        <span class="badge ${picks===31?'b-gold':picks>0?'b-green':'b-dim'}">${picks}/31</span>
      </div></td>
    </tr>`;
  }).join('');
  list.innerHTML=`<table class="entries-tbl"><thead><tr><th>Player</th><th>Champion pick</th><th>Progress</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function setStatus(locked){
  const b=document.getElementById('statusBadge');
  b.className='status-badge '+(locked?'locked':'open');
  document.getElementById('statusLabel').textContent=locked?'Bracket locked':'Picks open';
}
function setMsg(el,t,type){el.textContent=t;el.className='fmsg '+type;}

async function unlockBracket(){
  teams=DEMO_TEAMS.map(t=>({...t}));isLocked=false;
  await apiFetch('/bracket-state',{method:'PUT',body:JSON.stringify({locked:false,teams})});
  initRounds();setStatus(false);render();
}
async function lockBracket(){
  isLocked=true;teams=PLACEHOLDER.map(t=>({...t}));
  await apiFetch('/bracket-state',{method:'PUT',body:JSON.stringify({locked:true,teams:[]})});
  initRounds();setStatus(true);render();
}
async function resetCurrentPicks(){
  if(!currentUser)return;
  await apiFetch(`/entries/${encodeURIComponent(currentUser.email)}/picks`,{method:'PUT',body:JSON.stringify({picks:{},champion:null})});
  initRounds();render();
}

(async function init(){
  const admin=new URLSearchParams(location.search).get('admin')==='1';
  if(admin)document.getElementById('adminBar').classList.add('on');
  const st=await apiFetch('/bracket-state');
  if(st){isLocked=st.locked;if(!isLocked&&st.teams?.length)teams=st.teams;}
  setStatus(isLocked);
  await loadEntries();
  initRounds();render();
})();
