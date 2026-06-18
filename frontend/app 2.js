const API='/api';

const DEMO=[
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

const PH=Array.from({length:32},(_,i)=>({n:`Team ${i+1}`,f:'🏳'}));
let locked=true,user=null,entries=[],teams=PH.map(t=>({...t}));
let adminPass=sessionStorage.getItem('adminPass')||null;

/*
  BRACKET STRUCTURE — two-sided, both halves flow INWARD to the centre.

  Left half  (teams 0–15):  R16(8) → QF(4) → SF(2) → SF-Final(1) ─┐
                                                                      ├─ FINAL
  Right half (teams 16–31): R16(8) → QF(4) → SF(2) → SF-Final(1) ─┘

  Each half has 4 columns. The SF-Final column has ONE match where
  the 2 SF winners play to produce ONE finalist.

  Round indices in R[]:
    [0] Left R16      — 8 matches
    [1] Left QF       — 4 matches
    [2] Left SF       — 2 matches
    [3] Left SF-Final — 1 match  (winner = left finalist)
    [4] FINAL         — 1 match
    [5] Right SF-Final— 1 match  (winner = right finalist)
    [6] Right SF      — 2 matches
    [7] Right QF      — 4 matches
    [8] Right R16     — 8 matches
*/

let R=[];
function mk(id,t1,t2,s1,s2){return{id,t1:t1||null,t2:t2||null,w:null,s1:s1||null,s2:s2||null};}

function initR(){
  const T=teams;
  const lR=Array.from({length:8},(_,i)=>mk(`l0m${i}`,T[i*2],T[i*2+1]));
  const lQ=Array.from({length:4},(_,i)=>mk(`l1m${i}`,null,null,`l0m${i*2}`,`l0m${i*2+1}`));
  const lS=Array.from({length:2},(_,i)=>mk(`l2m${i}`,null,null,`l1m${i*2}`,`l1m${i*2+1}`));
  const lF=[mk('lf',null,null,'l2m0','l2m1')]; // 2 SF winners fight → left finalist

  const rR=Array.from({length:8},(_,i)=>mk(`r0m${i}`,T[16+i*2],T[16+i*2+1]));
  const rQ=Array.from({length:4},(_,i)=>mk(`r1m${i}`,null,null,`r0m${i*2}`,`r0m${i*2+1}`));
  const rS=Array.from({length:2},(_,i)=>mk(`r2m${i}`,null,null,`r1m${i*2}`,`r1m${i*2+1}`));
  const rF=[mk('rf',null,null,'r2m0','r2m1')]; // 2 SF winners fight → right finalist

  const fin=[mk('final',null,null,'lf','rf')]; // left finalist vs right finalist

  R=[lR,lQ,lS,lF,fin,rF,rS,rQ,rR];
}

function gm(id){for(const r of R)for(const m of r)if(m.id===id)return m;return null;}

function propM(m){
  if(!m.s1)return;
  m.t1=gm(m.s1)?.w||null;
  m.t2=gm(m.s2)?.w||null;
  if(m.w&&(!m.t1||m.w.n!==m.t1.n)&&(!m.t2||m.w.n!==m.t2.n))m.w=null;
}

function prop(){
  // left: QF[1], SF[2], SF-Final[3]
  for(const m of R[1]) propM(m);
  for(const m of R[2]) propM(m);
  for(const m of R[3]) propM(m);
  // right: SF-Final[5], SF[6], QF[7]
  for(const m of R[5]) propM(m);
  for(const m of R[6]) propM(m);
  for(const m of R[7]) propM(m);
  // final[4]
  propM(R[4][0]);
}

async function api(path,o={}){
  const h={'Content-Type':'application/json'};
  if(adminPass)h['x-admin-pass']=adminPass;
  try{const r=await fetch(API+path,{headers:h,...o});if(!r.ok)throw 0;return r.json();}
  catch{return null;}
}

async function pick(mid,team){
  if(locked||!team||!user)return;
  const m=gm(mid);if(!m)return;
  m.w=team;prop();render();await saveP();
}

/* ── MATCH CARD ── */
function buildCard(m,canPick){
  const{t1,t2,w}=m;
  if(!t1&&!t2){
    const d=document.createElement('div');d.className='tbd-card';d.textContent='TBD';return d;
  }
  const card=document.createElement('div');
  const interactive=canPick&&t1&&t2;
  card.className='mcard'+(interactive?'':' mlocked');

  const row=document.createElement('div');row.className='mcard-teams';

  function makeFC(t,isWin,isLose){
    const fc=document.createElement('div');
    fc.className='flag-circle'+(isWin?' fc-win':isLose?' fc-lose':!t?' fc-tbd':'');
    fc.textContent=t?t.f:'?';
    return fc;
  }

  const isW1=w&&t1&&w.n===t1.n, isL1=w&&t1&&w.n!==t1.n;
  const isW2=w&&t2&&w.n===t2.n, isL2=w&&t2&&w.n!==t2.n;
  const fc1=makeFC(t1,isW1,isL1);
  const fc2=makeFC(t2,isW2,isL2);

  const mid_col=document.createElement('div');mid_col.className='vs-mid';
  const vsT=document.createElement('div');vsT.className='vs-text';vsT.textContent='VS';
  const names=document.createElement('div');names.className='vs-names';
  const n1=document.createElement('div');n1.className='vname'+(isW1?' vwin':isL1?' vlose':'');n1.textContent=t1?t1.n:'—';
  const n2=document.createElement('div');n2.className='vname'+(isW2?' vwin':isL2?' vlose':'');n2.textContent=t2?t2.n:'—';
  names.append(n1,n2);mid_col.append(vsT,names);

  row.append(fc1,mid_col,fc2);
  card.appendChild(row);

  if(w){
    const wr=document.createElement('div');wr.className='winner-row';
    wr.innerHTML=`<span class="wflag">${w.f}</span>${w.n} advances`;
    card.appendChild(wr);
  }

  if(interactive){
    [fc1,fc2].forEach((fc,idx)=>{
      const team=idx===0?t1:t2;
      fc.style.cursor='pointer';
      fc.addEventListener('click',e=>{e.stopPropagation();pick(m.id,team);});
      fc.addEventListener('mouseenter',()=>fc.style.borderColor='var(--gold)');
      fc.addEventListener('mouseleave',()=>fc.style.borderColor='');
    });
  }
  return card;
}

function buildCol(matches,label){
  const col=document.createElement('div');col.className='rcol';
  col.innerHTML=`<div class="rlbl">${label}</div>`;
  const ms=document.createElement('div');ms.className='rmatches';
  const can=!locked&&!!user;
  for(const m of matches){
    const mu=document.createElement('div');mu.className='mu';
    mu.appendChild(buildCard(m,can));
    ms.appendChild(mu);
  }
  col.appendChild(ms);return col;
}

function buildFinal(){
  const can=!locked&&!!user;
  const f=R[4][0];const{t1,t2,w}=f;
  const card=document.createElement('div');
  card.className='fin-card'+(!can?' mlocked':'');

  const lbl=document.createElement('div');lbl.className='finlbl';lbl.textContent='Final';
  const row=document.createElement('div');row.className='fin-teams';

  function makeFF(t,isWin,isLose){
    const ff=document.createElement('div');
    ff.className='fin-flag'+(isWin?' fw':isLose?' fl':!t?' ft':'');
    ff.textContent=t?t.f:'?';
    return ff;
  }
  const isW1=w&&t1&&w.n===t1.n,isL1=w&&t1&&w.n!==t1.n;
  const isW2=w&&t2&&w.n===t2.n,isL2=w&&t2&&w.n!==t2.n;
  const ff1=makeFF(t1,isW1,isL1);
  const fvs=document.createElement('div');fvs.className='fin-vs';fvs.textContent='VS';
  const ff2=makeFF(t2,isW2,isL2);
  row.append(ff1,fvs,ff2);

  const tr=document.createElement('div');tr.className='trophy-ring';tr.textContent='🏆';
  const cl=document.createElement('div');cl.className='champ-lbl';cl.textContent='World Champion';
  const cv=document.createElement('div');cv.className='champ-val';cv.textContent=w?w.f+' '+w.n:'—';

  card.append(lbl,row,tr,cl,cv);

  if(can&&t1&&t2){
    [ff1,ff2].forEach((ff,idx)=>{
      const team=idx===0?t1:t2;
      ff.style.cursor='pointer';
      ff.addEventListener('click',()=>pick('final',team));
    });
  }
  return card;
}

function render(){
  const outer=document.getElementById('bouter');outer.innerHTML='';

  // Left: R16→QF→SF→SF-Final, all flow right (toward centre)
  const left=document.createElement('div');left.className='half hleft';
  left.appendChild(buildCol(R[0],'Round of 16'));
  left.appendChild(buildCol(R[1],'Quarter-finals'));
  left.appendChild(buildCol(R[2],'Semi-finals'));
  left.appendChild(buildCol(R[3],'SF Final'));
  outer.appendChild(left);

  // Centre: The Final
  const cc=document.createElement('div');cc.className='ccol';
  cc.appendChild(buildFinal());
  outer.appendChild(cc);

  // Right: SF-Final→SF→QF→R16, flows left (toward centre)
  const right=document.createElement('div');right.className='half hright';
  right.appendChild(buildCol(R[5],'SF Final'));
  right.appendChild(buildCol(R[6],'Semi-finals'));
  right.appendChild(buildCol(R[7],'Quarter-finals'));
  right.appendChild(buildCol(R[8],'Round of 16'));
  outer.appendChild(right);

  renderProg();
}

function renderProg(){
  const s=document.getElementById('pstrip');
  if(!user||locked){s.style.display='none';return;}
  s.style.display='flex';
  let made=0;for(const r of R)for(const m of r)if(m.w)made++;
  const champ=R[4][0].w;
  s.innerHTML=`
    <div class="pi"><div class="plbl">Picks made</div><div class="pval">${made}/31</div></div>
    <div class="pi"><div class="plbl">Remaining</div><div class="pval">${31-made}</div></div>
    <div class="pi"><div class="plbl">My champion</div><div class="pval" style="font-size:14px;">${champ?champ.f+' '+champ.n:'—'}</div></div>`;
}

function showTab(name,el){
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.ntab').forEach(t=>t.classList.remove('active'));
  document.getElementById('panel-'+name).classList.add('active');
  el.classList.add('active');
  if(name==='entries')renderEntries();
}

async function registerEntry(){
  const name=document.getElementById('iname').value.trim();
  const email=document.getElementById('iemail').value.trim();
  const msg=document.getElementById('fmsg');
  if(!name)return setMsg(msg,'Please enter your name.','err');
  if(!email||!/^[^@]+@[^@]+\.[^@]+$/.test(email))return setMsg(msg,'Please enter a valid email.','err');
  const d=await api('/entries',{method:'POST',body:JSON.stringify({name,email})});
  if(!d)return setMsg(msg,'Could not save — try again.','err');
  user=d;setMsg(msg,d.created?'Details saved!':'Welcome back!','ok');
  if(d.picks){initR();for(const[id,t]of Object.entries(d.picks)){const m=gm(id);if(m)m.w=t;}prop();}
  await loadE();showW();render();
}

async function loadE(){const d=await api('/entries');if(d)entries=d;}

async function saveP(){
  if(!user)return;
  const picks={};for(const r of R)for(const m of r)if(m.w)picks[m.id]=m.w;
  const champion=R[4][0].w||null;
  await api(`/entries/${encodeURIComponent(user.email)}/picks`,{method:'PUT',body:JSON.stringify({picks,champion})});
  const i=entries.findIndex(e=>e.email===user.email);
  if(i>=0){entries[i].picks=picks;entries[i].champion=champion;}
}

function showW(){
  const wb=document.getElementById('wbar'),es=document.getElementById('entrySection');
  if(!user){wb.style.display='none';es.style.display='block';return;}
  es.style.display='none';wb.style.display='block';
  const init=user.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
  wb.innerHTML=`<div class="wbar"><div class="av" style="width:32px;height:32px;font-size:11px;">${init}</div><div style="flex:1"><div class="wname">${user.name}</div><div class="wsub">${user.email}</div></div><button class="btn" onclick="switchUser()" style="font-size:11px;">Not you?</button></div>`;
}

function switchUser(){
  user=null;initR();
  document.getElementById('iname').value='';
  document.getElementById('iemail').value='';
  document.getElementById('fmsg').textContent='';
  showW();render();
}

function showEntriesTable(){
  const list=document.getElementById('elist');
  if(!entries.length){list.innerHTML='<div class="empty">No entries yet.</div>';return;}
  const rows=entries.map(e=>{
    const p=Object.keys(e.picks||{}).length;
    const pct=Math.round((p/31)*100);
    const init=e.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
    const saved=e.lastSaved?new Date(e.lastSaved).toLocaleDateString():'—';
    return `<tr>
      <td><div style="display:flex;align-items:center;gap:9px;">
        <div class="av" style="width:28px;height:28px;font-size:10px;">${init}</div>
        <div><div style="font-weight:600;color:var(--text);">${e.name}</div><div style="font-size:10px;color:var(--t3);">${e.email}</div></div>
      </div></td>
      <td>${e.champion?e.champion.f+' '+e.champion.n:'<span style="color:var(--t3)">Not picked</span>'}</td>
      <td><div style="display:flex;align-items:center;gap:8px;">
        <div style="flex:1;height:3px;background:var(--b2);border-radius:2px;min-width:60px;">
          <div style="height:3px;background:var(--gold);border-radius:2px;width:${pct}%;"></div>
        </div>
        <span class="bdg ${p===31?'bg':p>0?'bgg':'bd'}">${p}/31</span>
      </div></td>
      <td style="color:var(--t3);font-size:11px;">${saved}</td>
    </tr>`;
  }).join('');
  list.innerHTML=`<table class="etbl"><thead><tr><th>Player</th><th>Champion pick</th><th>Progress</th><th>Last saved</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderEntries(){
  const list=document.getElementById('elist');
  if(adminPass){showEntriesTable();return;}
  list.innerHTML=`
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

async function adminLogin(){
  const pass=document.getElementById('apass')?.value||'';
  const d=await api('/admin/verify',{method:'POST',body:JSON.stringify({pass})});
  if(d?.ok){
    adminPass=pass;sessionStorage.setItem('adminPass',pass);
    document.getElementById('abar').classList.add('on');
    await loadE();showEntriesTable();
  } else {
    const err=document.getElementById('loginErr');
    if(err){err.style.display='inline';setTimeout(()=>err.style.display='none',3000);}
  }
}

function adminLogout(){
  adminPass=null;sessionStorage.removeItem('adminPass');
  document.getElementById('abar').classList.remove('on');
  renderEntries();
}

function setStatus(l){
  const b=document.getElementById('sbadge');
  b.className='sbadge '+(l?'locked':'open');
  document.getElementById('slabel').textContent=l?'Bracket locked':'Picks open';
}
function setMsg(el,t,type){el.textContent=t;el.className='fmsg '+type;}

async function unlockBracket(){
  teams=DEMO.map(t=>({...t}));locked=false;
  await api('/bracket-state',{method:'PUT',body:JSON.stringify({locked:false,teams:teams.map(t=>({name:t.n,flag:t.f}))})});
  initR();setStatus(false);render();
}
async function lockBracket(){
  locked=true;teams=DEMO.map(t=>({...t}));
  await api('/bracket-state',{method:'PUT',body:JSON.stringify({locked:true,teams:[]})});
  initR();setStatus(true);render();
}
async function resetPicks(){
  if(!user)return;
  await api(`/entries/${encodeURIComponent(user.email)}/picks`,{method:'PUT',body:JSON.stringify({picks:{},champion:null})});
  initR();render();
}

(async function init(){
  if(adminPass)document.getElementById('abar').classList.add('on');

  // Always load demo teams so bracket is visible
  teams=DEMO.map(t=>({...t}));
  locked=false;

  const st=await api('/bracket-state');
  if(st){
    locked=st.locked;
    if(!locked&&st.teams?.length)teams=st.teams.map(t=>({n:t.name||t.n,f:t.flag||t.f}));
    else teams=DEMO.map(t=>({...t}));
  }

  setStatus(locked);
  await loadE();
  initR();render();
})();
