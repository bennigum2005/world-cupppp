const API='/api';

/* 32 demo teams. Indices 0–15 = LEFT half (top→bottom), 16–31 = RIGHT half (top→bottom).
   Each adjacent pair = one R16 match. */
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

/* rounds[0]=left R16(8), [1]=left QF(4), [2]=left SF(2),
   [3]=final(1),
   [4]=right SF(2), [5]=right QF(4), [6]=right R16(8) */
let R=[];

function mk(id,t1,t2,s1,s2){return{id,t1:t1||null,t2:t2||null,w:null,s1:s1||null,s2:s2||null};}

function initR(){
  const T=teams;
  const lR=Array.from({length:8},(_,i)=>mk(`l0m${i}`,T[i*2],T[i*2+1]));
  const lQ=Array.from({length:4},(_,i)=>mk(`l1m${i}`,null,null,`l0m${i*2}`,`l0m${i*2+1}`));
  const lS=Array.from({length:2},(_,i)=>mk(`l2m${i}`,null,null,`l1m${i*2}`,`l1m${i*2+1}`));
  const rR=Array.from({length:8},(_,i)=>mk(`r0m${i}`,T[16+i*2],T[16+i*2+1]));
  const rQ=Array.from({length:4},(_,i)=>mk(`r1m${i}`,null,null,`r0m${i*2}`,`r0m${i*2+1}`));
  const rS=Array.from({length:2},(_,i)=>mk(`r2m${i}`,null,null,`r1m${i*2}`,`r1m${i*2+1}`));
  const fin=[mk('final',null,null,'l2m0','r2m0')];
  R=[lR,lQ,lS,fin,rS,rQ,rR];
}

function gm(id){for(const r of R)for(const m of r)if(m.id===id)return m;return null;}

function prop(){
  /* left: QF, SF */
  for(let r=1;r<=2;r++)for(const m of R[r]){
    m.t1=gm(m.s1)?.w||null; m.t2=gm(m.s2)?.w||null;
    if(m.w&&(!m.t1||m.w.n!==m.t1.n)&&(!m.t2||m.w.n!==m.t2.n))m.w=null;
  }
  /* right: SF, QF */
  for(let r=4;r<=5;r++)for(const m of R[r]){
    m.t1=gm(m.s1)?.w||null; m.t2=gm(m.s2)?.w||null;
    if(m.w&&(!m.t1||m.w.n!==m.t1.n)&&(!m.t2||m.w.n!==m.t2.n))m.w=null;
  }
  /* final */
  const f=R[3][0];
  f.t1=gm('l2m0')?.w||null; f.t2=gm('r2m0')?.w||null;
  if(f.w&&(!f.t1||f.w.n!==f.t1.n)&&(!f.t2||f.w.n!==f.t2.n))f.w=null;
}

async function api(path,o={}){
  try{const r=await fetch(API+path,{headers:{'Content-Type':'application/json'},...o});if(!r.ok)throw 0;return r.json();}
  catch{return null;}
}

async function pick(mid,team){
  if(locked||!team||!user)return;
  const m=gm(mid);if(!m)return;
  m.w=team;prop();render();await saveP();
}

/* ── BUILD MATCHUP CARD ── */
function buildCard(m,canPick){
  const {t1,t2,w}=m;
  const hasBoth=t1&&t2;

  /* if neither team known yet → TBD placeholder */
  if(!t1&&!t2){
    const d=document.createElement('div');d.className='tbd-card';d.textContent='TBD';return d;
  }

  const card=document.createElement('div');
  card.className='mcard'+((!canPick||!hasBoth)?' mlocked':'');

  /* flag circles row */
  const row=document.createElement('div');row.className='mcard-teams';

  const fc1=document.createElement('div');
  fc1.className='flag-circle'+(w&&t1&&w.n===t1.n?' fc-win':w&&t1?' fc-lose':'')+(t1?' ':' fc-tbd');
  fc1.textContent=t1?t1.f:'?';

  const mid_col=document.createElement('div');mid_col.className='vs-mid';
  const vsText=document.createElement('div');vsText.className='vs-text';vsText.textContent='VS';
  const names=document.createElement('div');names.className='vs-names';
  const n1=document.createElement('div');
  n1.className='vname'+(w&&t1&&w.n===t1.n?' vwin':w&&t1?' vlose':'');
  n1.textContent=t1?t1.n:'—';
  const n2=document.createElement('div');
  n2.className='vname'+(w&&t2&&w.n===t2.n?' vwin':w&&t2?' vlose':'');
  n2.textContent=t2?t2.n:'—';
  names.append(n1,n2);mid_col.append(vsText,names);

  const fc2=document.createElement('div');
  fc2.className='flag-circle'+(w&&t2&&w.n===t2.n?' fc-win':w&&t2?' fc-lose':'')+(t2?' ':' fc-tbd');
  fc2.textContent=t2?t2.f:'?';

  row.append(fc1,mid_col,fc2);
  card.appendChild(row);

  /* winner strip */
  if(w){
    const wr=document.createElement('div');wr.className='winner-row';
    wr.innerHTML=`<span class="wflag">${w.f}</span>${w.n} advances`;
    card.appendChild(wr);
  }

  /* click to pick */
  if(canPick&&hasBoth&&!w){
    fc1.style.cursor='pointer';fc2.style.cursor='pointer';
    fc1.title=`Pick ${t1.n}`;fc2.title=`Pick ${t2.n}`;
    fc1.addEventListener('click',e=>{e.stopPropagation();pick(m.id,t1);});
    fc2.addEventListener('click',e=>{e.stopPropagation();pick(m.id,t2);});
    fc1.addEventListener('mouseenter',()=>fc1.style.borderColor='var(--gold)');
    fc1.addEventListener('mouseleave',()=>fc1.style.borderColor='');
    fc2.addEventListener('mouseenter',()=>fc2.style.borderColor='var(--gold)');
    fc2.addEventListener('mouseleave',()=>fc2.style.borderColor='');
  } else if(canPick&&hasBoth&&w){
    /* allow re-pick by clicking a flag */
    fc1.style.cursor='pointer';fc2.style.cursor='pointer';
    fc1.addEventListener('click',e=>{e.stopPropagation();pick(m.id,t1);});
    fc2.addEventListener('click',e=>{e.stopPropagation();pick(m.id,t2);});
  }

  return card;
}

function buildCol(matches,label,isRightHalf){
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

function buildFinal(can){
  const f=R[3][0];const {t1,t2,w}=f;
  const card=document.createElement('div');
  card.className='fin-card'+(!can?' mlocked':'');

  const lbl=document.createElement('div');lbl.className='finlbl';lbl.textContent='Final';
  const row=document.createElement('div');row.className='fin-teams';

  const ff1=document.createElement('div');
  ff1.className='fin-flag'+(w&&t1&&w.n===t1.n?' fw':w&&t1?' fl':!t1?' ft':'');
  ff1.textContent=t1?t1.f:'?';

  const fvs=document.createElement('div');fvs.className='fin-vs';fvs.textContent='VS';

  const ff2=document.createElement('div');
  ff2.className='fin-flag'+(w&&t2&&w.n===t2.n?' fw':w&&t2?' fl':!t2?' ft':'');
  ff2.textContent=t2?t2.f:'?';

  row.append(ff1,fvs,ff2);

  const tr=document.createElement('div');tr.className='trophy-ring';tr.textContent='🏆';
  const cl=document.createElement('div');cl.className='champ-lbl';cl.textContent='World Champion';
  const cv=document.createElement('div');cv.className='champ-val';cv.textContent=w?w.f+' '+w.n:'—';

  card.append(lbl,row,tr,cl,cv);

  if(can&&t1&&t2){
    ff1.style.cursor='pointer';ff2.style.cursor='pointer';
    ff1.addEventListener('click',()=>pick('final',t1));
    ff2.addEventListener('click',()=>pick('final',t2));
  }
  return card;
}

function render(){
  const outer=document.getElementById('bouter');outer.innerHTML='';
  const can=!locked&&!!user;

  /* LEFT: R16 outermost → SF innermost (toward centre) */
  const left=document.createElement('div');left.className='half hleft';
  left.appendChild(buildCol(R[0],'Round of 16'));
  left.appendChild(buildCol(R[1],'Quarter-finals'));
  left.appendChild(buildCol(R[2],'Semi-finals'));
  outer.appendChild(left);

  /* CENTRE */
  const cc=document.createElement('div');cc.className='ccol';
  cc.appendChild(buildFinal(can));
  outer.appendChild(cc);

  /* RIGHT: SF innermost (toward centre) → R16 outermost */
  const right=document.createElement('div');right.className='half hright';
  right.appendChild(buildCol(R[4],'Semi-finals',true));
  right.appendChild(buildCol(R[5],'Quarter-finals',true));
  right.appendChild(buildCol(R[6],'Round of 16',true));
  outer.appendChild(right);

  renderProg();
}

function renderProg(){
  const s=document.getElementById('pstrip');
  if(!user||locked){s.style.display='none';return;}
  s.style.display='flex';
  let made=0;for(const r of R)for(const m of r)if(m.w)made++;
  const champ=R[3][0].w;
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
  user=d; setMsg(msg,d.created?'Details saved!':'Welcome back!','ok');
  if(d.picks){initR();for(const[id,t]of Object.entries(d.picks)){const m=gm(id);if(m)m.w=t;}prop();}
  await loadE(); showW(); render();
}

async function loadE(){const d=await api('/entries');if(d)entries=d;}

async function saveP(){
  if(!user)return;
  const picks={};for(const r of R)for(const m of r)if(m.w)picks[m.id]=m.w;
  const champion=R[3][0].w||null;
  await api(`/entries/${encodeURIComponent(user.email)}/picks`,{method:'PUT',body:JSON.stringify({picks,champion})});
  const i=entries.findIndex(e=>e.email===user.email);
  if(i>=0){entries[i].picks=picks;entries[i].champion=champion;}
}

function showW(){
  const wb=document.getElementById('wbar');
  const es=document.getElementById('entrySection');
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

function renderEntries(){
  const list=document.getElementById('elist');
  const admin=new URLSearchParams(location.search).get('admin')==='1';
  if(!admin){list.innerHTML='<div class="empty">Entry list is private.</div>';return;}
  if(!entries.length){list.innerHTML='<div class="empty">No entries yet.</div>';return;}
  const rows=entries.map(e=>{
    const p=Object.keys(e.picks||{}).length;
    const pct=Math.round((p/31)*100);
    const init=e.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
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
    </tr>`;
  }).join('');
  list.innerHTML=`<table class="etbl"><thead><tr><th>Player</th><th>Champion pick</th><th>Progress</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function setStatus(l){
  const b=document.getElementById('sbadge');
  b.className='sbadge '+(l?'locked':'open');
  document.getElementById('slabel').textContent=l?'Bracket locked':'Picks open';
}
function setMsg(el,t,type){el.textContent=t;el.className='fmsg '+type;}

async function unlockBracket(){
  teams=DEMO.map(t=>({n:t.n,f:t.f}));locked=false;
  await api('/bracket-state',{method:'PUT',body:JSON.stringify({locked:false,teams:teams.map(t=>({name:t.n,flag:t.f}))})});
  initR();setStatus(false);render();
}
async function lockBracket(){
  locked=true;teams=PH.map(t=>({...t}));
  await api('/bracket-state',{method:'PUT',body:JSON.stringify({locked:true,teams:[]})});
  initR();setStatus(true);render();
}
async function resetPicks(){
  if(!user)return;
  await api(`/entries/${encodeURIComponent(user.email)}/picks`,{method:'PUT',body:JSON.stringify({picks:{},champion:null})});
  initR();render();
}

(async function init(){
  const admin=new URLSearchParams(location.search).get('admin')==='1';
  if(admin)document.getElementById('abar').classList.add('on');
  const st=await api('/bracket-state');
  if(st){
    locked=st.locked;
    if(!locked&&st.teams?.length)teams=st.teams.map(t=>({n:t.name||t.n,f:t.flag||t.f}));
  }
  setStatus(locked);
  await loadE();
  initR();render();
})();
