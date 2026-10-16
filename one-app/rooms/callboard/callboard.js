/* ══════════ Call Board ══════════ */
Hub.mount('callboard', function(window, document, localStorage){

const DATA = window.__CB_DATA();   /* data/callboard-topics.js */
const PAGES = DATA.pages;
PAGES.forEach(p=>{
  p.callById = Object.fromEntries(p.calls.map(c=>[c.id,c]));
  p.state = {sel:new Set(), selTopicCall:null, q:'', type:null, closed:new Set()};
  p.nTopics = Object.keys(p.meta).length;
});
let P = PAGES[0];
let MODE='cluster';

/* every call, with its cluster; and the topic list per call.
   TOPIC_BY_ID is the same records again under their own id, because a
   topic is now reached by id alone — from the reader, and from a project
   in the Ledger that was linked to one. Built here rather than searched
   for later: the two sheets each hold a different, partial record of the
   same topic, and one map means there is a single full one. */
const ALLCALLS=[]; const TOPICS_BY_CALL={}; const TOPIC_BY_ID={};
PAGES.forEach(p=>{
  p.calls.forEach(c=>{ c.clusterLabel=p.label; c.pageIdx=PAGES.indexOf(p); ALLCALLS.push(c); TOPICS_BY_CALL[c.id]=[]; });
  p.destinations.forEach(d=>d.themes.forEach(th=>th.topics.forEach(t=>{
    const m=p.meta[t.id];
    const item={id:t.id,title:t.title,type:m.type||'',budget:m.budget,contrib:m.contrib,count:m.count,dest:d.name,page:p};
    TOPICS_BY_CALL[m.call].push(item);
    TOPIC_BY_ID[t.id]={topic:item,call:p.callById[m.call]};
  })));
});
/* The short form of a topic's id, the one the sheet prints in its rows —
   written once here because the Ledger prints it on a project card too,
   through the bridge, and the two must not drift. */
const shortTopicId=id=>String(id).replace(/^HORIZON-(CL\d-|HLTH-)?/,'');
const ALLTOPICS=ALLCALLS.reduce((a,c)=>a+TOPICS_BY_CALL[c.id].length,0);
const OV={from:null,to:null,sel:new Set(),clusters:new Set(PAGES.map(p=>p.key)),
          arrange:'cluster',group:'deadline',q:'',type:null,preset:'6m'};
const inSpan=c=>c.d1>=OV.from&&c.d1<=OV.to;   /* stage 2 is not an entry point */
const iso=d=>d.toISOString().slice(0,10);
function setPreset(k){
  const now=new Date(); const t0=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const add=m=>{const d=new Date(t0);d.setMonth(d.getMonth()+m);return d;};
  const map={'1m':[t0,add(1)],'3m':[t0,add(3)],'6m':[t0,add(6)],'12m':[t0,add(12)],
             '2026':[new Date(2026,0,1),new Date(2026,11,31)],
             '2027':[new Date(2027,0,1),new Date(2027,11,31)],
             'all':[new Date(2025,11,1),new Date(2027,11,31)]};
  const [a,b]=map[k]||map['6m']; OV.preset=k; OV.from=iso(a); OV.to=iso(b);
}
setPreset('6m');

const setHdrH=()=>document.documentElement.style.setProperty('--hdr-h', document.getElementById('hdr').offsetHeight+'px');
window.addEventListener('resize', ()=>{setHdrH();});
window.addEventListener('load', setHdrH);

const lum=hex=>{const v=[1,3,5].map(i=>parseInt(hex.substr(i,2),16)/255)
  .map(c=>c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4));
  return 0.2126*v[0]+0.7152*v[1]+0.0722*v[2];};

/* ── the ink on a coloured chip ──
   Every call series arrives with a pale, a colour and an ink chosen to sit
   on it, and every one of them landed between 3.7 and 4.4 against its own
   chip — the whole family a single notch under the 4.5 a ten-pixel code
   needs. Rather than pick nineteen new inks by hand and lose the tuning
   between them, the given ink is walked towards black in tenths until it
   clears the ratio. Most need one step, none needs more than three, and
   the hue each series was given is kept. Memoised: this runs once per
   series and then per chip on every repaint. */
const CONTRAST_MIN=4.5;
const hex2=n=>Math.round(Math.max(0,Math.min(255,n))).toString(16).padStart(2,'0');
const ratioOf=(a,b)=>{const l1=lum(a),l2=lum(b);
  return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);};
const inkCache=new Map();
function readableInk(ink,on){
  const base=ink||'#14171B';
  if(!on||!/^#[0-9a-f]{6}$/i.test(base)||!/^#[0-9a-f]{6}$/i.test(on))return base;
  const key=base+on;
  if(inkCache.has(key))return inkCache.get(key);
  let out=base;
  const rgb=[1,3,5].map(i=>parseInt(base.substr(i,2),16));
  for(let k=10;k>=0&&ratioOf(out,on)<CONTRAST_MIN;k--)
    out='#'+rgb.map(v=>hex2(v*k/10)).join('');
  inkCache.set(key,out);
  return out;
}
const fg=c=>readableInk(c.ink,c.color);
const ovFg=c=>readableInk(c.ovInk,c.ovColor);
/* How far along a chart's first January has to fall before the year the
   chart opens in is also named at the left edge. Below this the two labels
   are printed on top of one another. Read as a share of the track. */
const YEAR_LABEL_GAP=5;

const d3=s=>new Date(s+'T12:00');
const dmy=s=>d3(s).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
const dm =s=>d3(s).toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
const yy =s=>s.slice(2,4);

/* ---------- tabs ---------- */
const tabsEl=document.getElementById('tabs');
PAGES.forEach((p,i)=>{
  const b=document.createElement('button'); b.className='tab'; b.setAttribute('role','tab');
  b.setAttribute('aria-selected', String(i===0));
  b.innerHTML=`<span class="ck">${p.key}</span><span class="cn">${p.label}</span><span class="cc">${Object.keys(p.meta).length}</span>`;
  b.addEventListener('click',()=>selectPage(i));
  tabsEl.appendChild(b);
});
const ovTab=document.createElement('button');
ovTab.className='tab'; ovTab.setAttribute('role','tab'); ovTab.setAttribute('aria-selected','false');
ovTab.innerHTML=`<span class="ck">ALL</span><span class="cn">Deadline planner</span><span class="cc">${ALLTOPICS}</span>`;
ovTab.addEventListener('click',()=>selectPage(PAGES.length));
tabsEl.appendChild(ovTab);

function selectPage(i){
  const tabs=[...tabsEl.children];
  tabs.forEach((t,k)=>t.setAttribute('aria-selected',String(k===i)));
  if(i===PAGES.length){ MODE='overview'; location.hash='all'; }
  else { MODE='cluster'; P=PAGES[i]; location.hash=P.key.toLowerCase(); }
  document.getElementById('ovbar').classList.toggle('on', MODE==='overview');
  render(); setHdrH(); window.scrollTo({top:0});
}

/* ---------- render ---------- */
let topicEls=[], T0, T1, SPAN;
const X=d=>(d3(d)-T0)/SPAN*100;

function render(){
  if(MODE==='overview') return renderOverview();
  document.getElementById('legcolour').textContent='colour = call series · saturated tone = 2026 call, pale tone = 2027 call';
  document.querySelector('.tl-title').textContent='Calls · chronological';
  buildLedger(); buildTimeline(); buildFamKey();
  const qEl=document.getElementById('q'); qEl.value=P.state.q;
  document.getElementById('qclr').style.display=P.state.q?'block':'none';
  document.querySelectorAll('.tchip').forEach(x=>x.setAttribute('aria-pressed',String(x.textContent===P.state.type)));
  applyFilters(); paintTimeline(); paintPills(); showCard([...P.state.sel]);
}

function buildFamKey(){
  const el=document.getElementById('famkey'); el.innerHTML='';
  (P.families||[]).forEach(f=>{
    const cs=P.calls.filter(c=>c.family===f.label).sort((a,b)=>(a.edition-b.edition)||a.opening.localeCompare(b.opening));
    const sw=cs.map(c=>`<i style="background:${c.color}" title="${c.short} — ${c.id}"></i>`).join('');
    const it=document.createElement('span'); it.className='fi';
    it.innerHTML=`<span class="fsw">${sw}</span>${f.label}`;
    el.appendChild(it);
  });
}

function buildLedger(){
  const ledger=document.getElementById('ledger'); ledger.innerHTML=''; topicEls=[];
  P.destinations.forEach((dest,di)=>{
    const dEl=document.createElement('section'); dEl.className='dest';
    if(P.state.closed.has(dest.name)) dEl.classList.add('closed');
    const nTop=dest.themes.reduce((a,t)=>a+t.topics.length,0);
    const h=document.createElement('div'); h.className='dest-h'; h.tabIndex=0; h.setAttribute('role','button');
    h.innerHTML=`<span class="dnum">D${di+1}</span><span class="dname">${dest.name}</span><span class="dcount" data-n="${nTop}">${nTop} topics</span><span class="caret">▼</span>`;
    const tog=()=>{dEl.classList.toggle('closed');
      if(dEl.classList.contains('closed')) P.state.closed.add(dest.name); else P.state.closed.delete(dest.name);};
    h.addEventListener('click',tog);
    h.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();tog();}});
    dEl.appendChild(h);
    const body=document.createElement('div'); body.className='dest-body';
    dest.themes.forEach(theme=>{
      if(!theme.topics.length) return;
      let thEl=null;
      if(theme.name){thEl=document.createElement('div');thEl.className='theme-h';thEl.textContent=theme.name;body.appendChild(thEl);}
      theme.topics.forEach(tp=>{
        const m=P.meta[tp.id], c=P.callById[m.call];
        const shortId=shortTopicId(tp.id);
        const row=document.createElement('div'); row.className='topic'; row.tabIndex=0; row.setAttribute('role','button');
        row.dataset.call=m.call; row.dataset.type=m.type||''; row.dataset.search=(tp.id+' '+tp.title).toLowerCase();
        row.dataset.id=tp.id;
        row.title=tp.id+' — '+tp.title;
        row.innerHTML=`<span class="bar" style="background:${c.color}"></span>
          <span class="cchip w" style="background:${c.color};color:${fg(c)}">${c.short}</span>
          <span class="tbadge">${m.type||'—'}</span>
          <span class="tid">${shortId}</span>
          <span class="ttl">${tp.title}</span>`;
        const det=document.createElement('div'); det.className='tdetail';
        det.innerHTML=`<table>
          <tr><td>Topic</td><td class="full">${tp.id}</td></tr>
          <tr><td>Call</td><td class="full">${c.id} <span style="color:var(--muted)">(${c.name})</span></td></tr>
          <tr><td>Opens</td><td class="full">${dmy(c.opening)}</td></tr>
          <tr><td>Deadline</td><td class="full">${c.twoStage? dmy(c.d1)+' (stage 1) → '+dmy(c.d2)+' (stage 2)' : dmy(c.d1)}</td></tr>
          <tr><td>Topic budget</td><td>${m.budget? 'EUR '+m.budget+' million':'—'}</td></tr>
          <tr><td>EU contribution</td><td>${m.contrib? m.contrib.replace(' to ',' – ')+' M€ per project':'—'}</td></tr>
          <tr><td>Projects</td><td>${m.count? '~'+m.count+' expected':'—'}</td></tr></table>`;
        det.appendChild(detailButtons({id:tp.id,title:tp.title,type:m.type,budget:m.budget,contrib:m.contrib,dest:dest.name}, c));
        const act=()=>toggleTopic(row,det,m.call,c.color);
        row.addEventListener('click',act);
        row.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();act();}});
        body.appendChild(row); body.appendChild(det);
        topicEls.push({row,det,call:m.call,type:m.type||'',theme:thEl,dest:dEl});
      });
    });
    dEl.appendChild(body); ledger.appendChild(dEl);
  });
  elsewhereEl=document.createElement('div'); ledger.appendChild(elsewhereEl);
}

function toggleTopic(row,det,callId,color){
  const was=row.classList.contains('sel');
  topicEls.forEach(t=>{t.row.classList.remove('sel');t.det.classList.remove('open');});
  closeElsewhere();
  P.state.selTopicCall=null;
  if(!was){row.classList.add('sel');row.style.setProperty('--selcol',color);det.classList.add('open');P.state.selTopicCall=callId;}
  paintTimeline();
}

function buildTimeline(){
  document.getElementById('tl').classList.remove('ov','windowed');
  const dates=P.calls.flatMap(c=>[c.opening,c.d1,c.d2].filter(Boolean)).sort();
  const first=d3(dates[0]), last=d3(dates[dates.length-1]);
  T0=new Date(first.getFullYear(), first.getMonth(), 1);
  T1=new Date(last.getFullYear(), last.getMonth()+1, 15);
  SPAN=T1-T0;
  const tl=document.getElementById('tl');
  let grid='', axl='', years=new Set(), firstJan=Infinity;
  for(let d=new Date(T0); d<T1; d=new Date(d.getFullYear(), d.getMonth()+1, 1)){
    const nx=new Date(d.getFullYear(), d.getMonth()+1, 1);
    const x=(d-T0)/SPAN*100, w=(Math.min(nx,T1)-d)/SPAN*100;
    const isY=d.getMonth()===0, isQ=d.getMonth()%3===0;
    grid+=`<div class="gline${isY?' year':(isQ?' q':'')}" style="left:${x}%"></div>`;
    axl+=`<div class="mlabel" style="left:${x+w/2}%">${d.toLocaleDateString('en-GB',{month:'short'})[0]}</div>`;
    if(isY){axl+=`<div class="ylabel" style="left:${x}%">${d.getFullYear()}</div>`;
      years.add(d.getFullYear());firstJan=Math.min(firstJan,x);}
  }
  /* the same rule as the overview: name the opening year only when the
     first January leaves room for it */
  if(!years.has(T0.getFullYear())&&firstJan>YEAR_LABEL_GAP)
    axl+=`<div class="ylabel" style="left:0%">${T0.getFullYear()}</div>`;
  tl.innerHTML=`<div class="tl-axis"><div class="plot" style="top:0;bottom:0">${axl}</div></div><div class="tl-rows" id="tlrows"></div>`;
  tl.insertAdjacentHTML('afterbegin',`<div class="plot">${grid}</div>`);
  const rowsEl=document.getElementById('tlrows');
  P.calls.forEach(c=>{
    const r=document.createElement('div'); r.className='crow'; r.tabIndex=0; r.setAttribute('role','button');
    r.dataset.call=c.id; r.title=c.id;
    const x0=X(c.opening), x1=X(c.d1), last=c.twoStage?X(c.d2):x1;
    let b=`<span class="cbar" style="left:${x0}%;width:${Math.max(x1-x0,.8)}%;background:${c.color}"></span>
      <span class="dot" style="left:${x0}%;background:${c.color};box-shadow:0 0 0 1px ${c.ink}"></span>
      <span class="cap" style="left:${x1}%;background:${c.ink}"></span>`;
    if(c.twoStage) b+=`<span class="cbar2" style="left:${x1}%;width:${Math.max(X(c.d2)-x1,.8)}%;background-color:${c.color}"></span>
      <span class="cap" style="left:${X(c.d2)}%;background:${c.ink}"></span>`;
    b+=`<span class="dtag" style="left:${x0}%;color:${c.ink||c.color}">${dm(c.opening)} ’${yy(c.opening)}</span>`;
    b+=`<span class="dtag r" style="left:${last}%;color:${c.ink||c.color}">${c.twoStage? dm(c.d1)+' → '+dm(c.d2)+' ’'+yy(c.d2) : dm(c.d1)+' ’'+yy(c.d1)}</span>`;
    r.innerHTML=`<span class="lbl"><span class="cchip w" style="background:${c.color};color:${fg(c)}">${c.short}</span><span class="nm">${c.name}</span></span><span class="track">${b}</span>`;
    const act=()=>toggleCall(c.id);
    r.addEventListener('click',act);
    r.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();act();}});
    r.addEventListener('mouseenter',()=>{if(!P.state.sel.size&&!P.state.selTopicCall)soft(c.id);showCard([c.id]);});
    r.addEventListener('mouseleave',()=>{if(!P.state.sel.size&&!P.state.selTopicCall)soft(null);showCard([...P.state.sel]);});
    rowsEl.appendChild(r);
  });
  const now=new Date();
  if(now>T0&&now<T1){
    const x=(now-T0)/SPAN*100;
    const pl=document.createElement('div'); pl.className='plot';
    pl.innerHTML=`<div class="today" style="left:${x}%"></div><div class="today-tag" style="left:${x}%">today</div>`;
    tl.appendChild(pl);
  }
}

function toggleCall(id){
  const s=P.state.sel;
  s.has(id)?s.delete(id):s.add(id);
  if(s.size){topicEls.forEach(t=>{t.row.classList.remove('sel');t.det.classList.remove('open');});P.state.selTopicCall=null;}
  applyFilters(); paintTimeline(); paintPills(); showCard([...s]);
}
function soft(id){topicEls.forEach(t=>t.row.classList.toggle('dim', !!id && t.call!==id));}

function applyFilters(){
  const st=P.state; let visible=0; const perDest=new Map();
  topicEls.forEach(t=>{
    const hit=!st.q||t.row.dataset.search.includes(st.q)||(FULLTEXT&&inFull(t.row.dataset.id,st.q));
    const show=(!st.sel.size||st.sel.has(t.call)) && (!st.type||t.type===st.type) && hit;
    t._show=show;
    t.row.classList.toggle('hidden',!show); t.row.classList.remove('dim');
    if(!show) t.det.classList.remove('open');
    if(show) visible++;
    const a=perDest.get(t.dest)||[0,0]; a[1]++; if(show)a[0]++; perDest.set(t.dest,a);
  });
  new Set(topicEls.map(t=>t.theme).filter(Boolean)).forEach(th=>
    th.classList.toggle('hidden', !topicEls.some(t=>t.theme===th&&t._show)));
  perDest.forEach((a,dEl)=>{
    dEl.classList.toggle('hidden', a[0]===0);
    const dc=dEl.querySelector('.dcount');
    dc.textContent=(st.sel.size||st.type||st.q)?`${a[0]} of ${dc.dataset.n}`:`${dc.dataset.n} topics`;
  });
  const away=paintElsewhere(visible);
  /* Only while something narrows the list: unfiltered, "38 of 38 topics"
     repeated the count already on the cluster's tab. */
  document.getElementById('count').textContent=(st.sel.size||st.type||st.q)
    ?`${visible} of ${P.nTopics} topics`+(away?` · ${away} in other clusters`:''):'';
}

/* ── the other clusters, while a search is typed ──
   The search used to stop at the edge of the open tab: a word typed on
   one cluster said nothing about the topic that held it in another, and
   finding it meant typing it again on every tab. The words are now one
   search over every call in the work programme. The open cluster keeps
   its own sheet; each other cluster's matches follow it under that
   cluster's name, and the name opens the cluster with the same words
   still in the box. The type chip narrows these too. Calls picked on the
   chart do not, because those calls belong to the open cluster. */
let elsewhereEl=null;
function closeElsewhere(){
  elsewhereEl.querySelectorAll('.tdetail.open').forEach(x=>x.classList.remove('open'));
  elsewhereEl.querySelectorAll('.topic.sel').forEach(x=>x.classList.remove('sel'));
}
function paintElsewhere(visible){
  const st=P.state; elsewhereEl.innerHTML=''; let n=0;
  if(!st.q) return 0;
  PAGES.forEach((p,i)=>{
    if(p===P) return;
    const hits=[];
    p.destinations.forEach(d=>d.themes.forEach(th=>th.topics.forEach(tp=>{
      const m=p.meta[tp.id];
      if(st.type&&(m.type||'')!==st.type) return;
      if((tp.id+' '+tp.title).toLowerCase().includes(st.q)||(FULLTEXT&&inFull(tp.id,st.q)))
        hits.push({id:tp.id,title:tp.title,type:m.type||'',budget:m.budget,contrib:m.contrib,count:m.count,
                   dest:d.name,call:p.callById[m.call]});
    })));
    if(!hits.length) return;
    if(!n){const cap=document.createElement('div'); cap.className='theme-h'; cap.textContent='In the other clusters';
      elsewhereEl.appendChild(cap);}
    n+=hits.length;
    const h=document.createElement('div'); h.className='dest-h'; h.tabIndex=0; h.setAttribute('role','button');
    h.innerHTML=`<span class="dnum" style="opacity:1"><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${p.clusterColor}"></span></span>
      <span class="dname">${p.key} · ${p.label}</span><span class="dcount">${hits.length} of ${p.nTopics} topics</span>`;
    h.title='Open '+p.full;
    h.addEventListener('click',()=>selectPage(i));
    h.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectPage(i);}});
    elsewhereEl.appendChild(h);
    hits.forEach(t=>{
      const c=t.call;
      const row=document.createElement('div'); row.className='topic'; row.tabIndex=0; row.setAttribute('role','button');
      row.title=t.id+' — '+t.title+'  ·  '+t.dest;
      row.innerHTML=`<span class="bar" style="background:${c.color}"></span>
        <span class="cchip w" style="background:${c.color};color:${fg(c)}">${c.short}</span>
        <span class="tbadge">${t.type||'—'}</span>
        <span class="tid">${shortTopicId(t.id)}</span>
        <span class="ttl">${t.title}</span>`;
      const det=document.createElement('div'); det.className='tdetail';
      det.innerHTML=`<table>
        <tr><td>Topic</td><td class="full">${t.id}</td></tr>
        <tr><td>Destination</td><td>${t.dest}</td></tr>
        <tr><td>Call</td><td class="full">${c.id} <span style="color:var(--muted)">(${c.name})</span></td></tr>
        <tr><td>Opens</td><td class="full">${dmy(c.opening)}</td></tr>
        <tr><td>Deadline</td><td class="full">${c.twoStage? dmy(c.d1)+' (stage 1) → '+dmy(c.d2)+' (stage 2)' : dmy(c.d1)}</td></tr>
        <tr><td>Topic budget</td><td>${t.budget? 'EUR '+t.budget+' million':'—'}</td></tr>
        <tr><td>EU contribution</td><td>${t.contrib? t.contrib.replace(' to ',' – ')+' M€ per project':'—'}</td></tr>
        <tr><td>Projects</td><td>${t.count? '~'+t.count+' expected':'—'}</td></tr></table>`;
      det.appendChild(detailButtons(t, c));
      const act=()=>{
        const was=det.classList.contains('open');
        topicEls.forEach(x=>{x.row.classList.remove('sel');x.det.classList.remove('open');});
        if(P.state.selTopicCall){P.state.selTopicCall=null;paintTimeline();}
        closeElsewhere();
        if(!was){det.classList.add('open');row.classList.add('sel');row.style.setProperty('--selcol',c.color);}
      };
      row.addEventListener('click',act);
      row.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();act();}});
      elsewhereEl.appendChild(row); elsewhereEl.appendChild(det);
    });
  });
  if(!n&&!visible){const e=document.createElement('div'); e.className='empty';
    e.textContent='No topic in any cluster matches this search.'; elsewhereEl.appendChild(e);}
  return n;
}
function paintTimeline(){
  const st=P.state;
  const focus=st.sel.size?st.sel:(st.selTopicCall?new Set([st.selTopicCall]):null);
  document.querySelectorAll('.crow').forEach(r=>{
    const on=focus&&focus.has(r.dataset.call);
    r.classList.toggle('on',!!on); r.classList.toggle('dim',!!focus&&!on);
  });
}
function paintPills(){
  const p=document.getElementById('pills'); p.innerHTML='';
  [...P.state.sel].map(id=>P.callById[id]).sort((a,b)=>a.opening.localeCompare(b.opening)).forEach(c=>{
    const el=document.createElement('span'); el.className='pill'; el.style.background=c.color; el.style.color=fg(c);
    el.innerHTML=`${c.short}<button aria-label="Remove ${c.short}">✕</button>`;
    el.querySelector('button').addEventListener('click',()=>toggleCall(c.id));
    p.appendChild(el);
  });
  if(P.state.sel.size>1){
    const ca=document.createElement('button'); ca.className='pill clearall'; ca.textContent='clear all';
    ca.addEventListener('click',()=>{P.state.sel.clear();applyFilters();paintTimeline();paintPills();showCard([]);});
    p.appendChild(ca);
  }
}
function showCard(ids){
  const el=document.getElementById('selcard');
  if(!ids.length){el.innerHTML='';return;}
  const list=ids.map(id=>P.callById[id]).sort((a,b)=>a.opening.localeCompare(b.opening));
  if(list.length===1){
    const c=list[0];
    el.innerHTML=`<span><span class="k">${c.id}</span></span>
      <span>opens <span class="k">${dmy(c.opening)}</span></span>
      <span>${c.twoStage?'stage 1':'deadline'} <span class="k">${dmy(c.d1)}</span></span>
      ${c.twoStage?`<span>stage 2 <span class="k">${dmy(c.d2)}</span></span>`:''}
      <span><span class="k">${c.nTopics}</span> topics</span>
      <span><span class="k">€${c.budget}M</span></span>`;
  } else {
    const nT=list.reduce((a,c)=>a+c.nTopics,0), b=list.reduce((a,c)=>a+c.budget,0);
    const next=list.map(c=>c.d1).sort()[0];
    el.innerHTML=`<span><span class="k">${list.length}</span> calls selected</span>
      <span>first opening <span class="k">${dmy(list[0].opening)}</span></span>
      <span>earliest deadline <span class="k">${dmy(next)}</span></span>
      <span><span class="k">${nT}</span> topics</span>
      <span><span class="k">€${b.toFixed(2)}M</span></span>`;
  }
}



/* ===================== full topic text ===================== */
/* The three types of action, spelled. The chips on the Board are the
   shorthand and stay the shorthand — they sit in a row of three and are
   read against each other. The reader is where one of them turns up
   alone, sometimes over the top of another room entirely, so there it is
   written out. Anything not in this list prints as it arrives. */
const ACTION_TYPES={RIA:'Research and Innovation Action',
                    IA:'Innovation Action',
                    CSA:'Coordination and Support Action'};
const DESC = window.__CB_DESC();   /* data/callboard-descriptions.js */
const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
/* The search is matched against the words, not against their escaped
   form. It used to run over the escaped text, so a search for "a" or "lt"
   also matched inside `&amp;` and `&lt;`, split the entity with a mark,
   and the reader showed "&amp;" where the topic said "&". */
function hl(s){
  const q=(MODE==='overview'?OV.q:P.state.q);
  const text=String(s);
  if(!q||!FULLTEXT) return esc(text);
  const rx=new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'ig');
  let out='',last=0;
  text.replace(rx,(m,at)=>{
    out+=esc(text.slice(last,at))+'<mark>'+esc(m)+'</mark>';
    last=at+m.length;
    return m;
  });
  return out+esc(text.slice(last));
}
const descText=id=>{
  const d=DESC[id]; if(!d) return '';
  return (d.o||[]).concat(d.s||[]).join(' ')+' '+(d.x||[]).map(x=>x[1].join(' ')).join(' ');
};
let FULLTEXT=false; let FULLIDX=null;
function fullIndex(){
  if(FULLIDX) return FULLIDX;
  FULLIDX={};
  for(const id in DESC) FULLIDX[id]=descText(id).toLowerCase();
  return FULLIDX;
}
const inFull=(id,q)=>{const ix=fullIndex()[id]; return !!ix&&ix.includes(q);};

/* The head is the same labelled list the dropdown under a topic row
   carries, in the same order: the name first, then the code, then the
   rest. The two are read one straight after the other, and the head used
   to lead with the code and set the facts as a run of prose, so arriving
   here read as arriving at a different topic. There was a second link
   beside the topic's own that opened the call the topic belongs to; it is
   gone, from here and from the dropdown alike.

   Either sheet hands over the partial record it happens to hold — the
   cluster sheet's carries no project count, the planner's does — and a
   room reaching in across the bridge hands over nothing but an id. One
   lookup makes all three the same topic. */
function openReader(topic, call){
  const rec=TOPIC_BY_ID[(topic&&topic.id)||topic];
  if(rec){ topic=rec.topic; call=call||rec.call; }
  if(!topic||!call) return false;
  const d=DESC[topic.id];
  document.getElementById('rdtitle').innerHTML=hl(topic.title);
  const row=(k,v,mono)=>v?`<tr><td>${k}</td><td${mono?' class="full"':''}>${v}</td></tr>`:'';
  /* The Topic row is the id and nothing else. It used to open with the
     call's coloured chip and a type badge, with the id trailing behind
     both — three things on the row the panel's own labels already name,
     in front of the one string anybody ever copies out of here. The chip
     is the Board's own device for telling calls apart at a glance, which
     is a job nothing in this panel has, and the type has a row of its
     own below, spelled out: RIA and IA and CSA are shorthand that reads
     off a row of three chips and says nothing standing alone. */
  document.getElementById('rdmeta').innerHTML='<table>'
    +row('Topic',esc(topic.id),1)
    +row('Type of action',topic.type
        ? esc(ACTION_TYPES[topic.type]||topic.type)
          +(ACTION_TYPES[topic.type]?` <span class="aside">(${esc(topic.type)})</span>`:'')
        : '')
    +row('Call',`${esc(call.id)} <span class="aside">(${esc(call.name)})</span>`,1)
    +row('Opens',dmy(call.opening),1)
    +row('Deadline',call.twoStage? dmy(call.d1)+' (stage 1) → '+dmy(call.d2)+' (stage 2)'
                                 : dmy(call.d1),1)
    +row('Destination',topic.dest?esc(topic.dest):'')
    +row('Topic budget',topic.budget?'EUR '+topic.budget+' million':'')
    +row('EU contribution',topic.contrib?esc(topic.contrib.replace(' to ',' – '))+' M€ per project':'')
    +row('Projects',topic.count?'~'+topic.count+' expected':'')
    +'</table>';
  const links=document.getElementById('rdlinks');
  links.innerHTML='';
  links.appendChild(portalLink(topicURL(topic.id),'Topic on portal'));
  const body=document.getElementById('rdbody');
  if(!d){ body.innerHTML='<p>No full text could be extracted for this topic.</p>'; }
  else{
    const paras=arr=>(arr||[]).map(p=>p.startsWith('• ')
      ? `<p class="bul">•&nbsp;${hl(p.slice(2))}</p>` : `<p>${hl(p)}</p>`).join('');
    let h='';
    if(d.o&&d.o.length) h+=`<h3>Expected Outcome</h3>${paras(d.o)}`;
    if(d.s&&d.s.length) h+=`<h3>Scope</h3>${paras(d.s)}`;
    (d.x||[]).forEach(([name,ps])=>{ if(ps&&ps.length) h+=`<h3>${esc(name)}</h3>${paras(ps)}`; });
    if(d.c&&d.c.length) h+=`<h3>Specific conditions</h3><dl>`+
      d.c.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${hl(v)}</dd>`).join('')+`</dl>`;
    body.innerHTML=h;
  }
  body.scrollTop=0;
  /* ── why the slide is started two frames late ──
     Everything above this line is expensive and all of it lands in one
     go: a topic's full text is a few dozen paragraphs of 16.5px serif
     inside a scroller, and when the panel is being lent to another room
     the pane it lives in has just had its whole board switched off with
     `display:none` in the same tick. Adding `open` immediately meant the
     browser had to finish both of those layouts before it could paint
     the first frame of a 200ms transform — so the panel sat still, then
     jumped, which is the stutter Mark reported pressing a topic on a
     project card. Two frames of nothing is imperceptible; a slide that
     drops its first four frames is not. This is the same double
     requestAnimationFrame the Ledger's own fold-out uses, for the same
     reason.
     The close button is focused at the end rather than the start for a
     second reason: every pane in this app carries a transform, so a
     `position:fixed` panel inside one is positioned against the pane and
     focusing something inside it while it is parked off the right edge
     can scroll the pane to reach it. */
  const rd=document.getElementById('reader'), sc=document.getElementById('scrim');
  rd.setAttribute('aria-hidden','false');
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    /* Escape inside those two frames would otherwise be undone here. */
    if(rd.getAttribute('aria-hidden')!=='false') return;
    rd.classList.add('open');
    sc.classList.add('open');
    try{ document.getElementById('rdclose').focus({preventScroll:true}); }
    catch(e){ document.getElementById('rdclose').focus(); }
  }));
  return true;
}
function closeReader(){
  document.getElementById('reader').classList.remove('open');
  document.getElementById('reader').setAttribute('aria-hidden','true');
  document.getElementById('scrim').classList.remove('open');
}
document.getElementById('rdclose').addEventListener('click',closeReader);
document.getElementById('scrim').addEventListener('click',closeReader);

const PORTAL='https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/';
const topicURL=id=>PORTAL+'topic-details/'+encodeURIComponent(id);
function portalLink(href, label, title){
  const a=document.createElement('a'); a.className='portalink'; a.href=href; a.target='_blank'; a.rel='noopener';
  a.innerHTML=label+' <span class="arr">↗</span>'; if(title) a.title=title;
  a.addEventListener('click',e=>e.stopPropagation());
  return a;
}
function detailButtons(topic, call){
  const row=document.createElement('div'); row.className='btnrow';
  row.appendChild(readerButton(topic, call));
  row.appendChild(portalLink(topicURL(topic.id),'Topic on portal','Open '+topic.id+' on the Funding & Tenders Portal'));
  return row;
}

function readerButton(topic, call){
  const b=document.createElement('button'); b.className='readbtn';
  b.innerHTML='Read full topic text <span style="opacity:.6">▸</span>';
  b.addEventListener('click',e=>{e.stopPropagation();openReader(topic,call);});
  return b;
}

/* ===================== overview page ===================== */
let OT0,OT1,OSPAN; const OX=d=>(d3(d)-OT0)/OSPAN*100;

function ovScope(){                       /* calls currently driving the topic list */
  if(OV.sel.size) return ALLCALLS.filter(c=>OV.sel.has(c.id));
  return ALLCALLS.filter(c=>OV.clusters.has(c.cluster) && inSpan(c));
}

function renderOverview(){
  const qEl=document.getElementById('q'); qEl.value=OV.q;
  document.getElementById('qclr').style.display=OV.q?'block':'none';
  document.querySelectorAll('#typechips .tchip').forEach(x=>x.setAttribute('aria-pressed',String(x.textContent===OV.type)));
  document.getElementById('legcolour').textContent='colour = cluster · saturated tone = 2026 call, pale tone = 2027 call · window matches first-stage deadlines; stage-2 tails are shown but never selected';
  document.querySelector('.tl-title').innerHTML='All calls · <span>drag the date axis to set a window</span>';
  buildOvControls(); buildOvTimeline(); buildOvLedger(); paintOv();
}

function buildOvControls(){
  const pr=document.getElementById('presets');
  if(!pr.dataset.built){
    [['1m','1 month'],['3m','3 months'],['6m','6 months'],['12m','12 months'],['2026','2026'],['2027','2027'],['all','Everything']]
      .forEach(([k,lab])=>{
        const b=document.createElement('button'); b.className='pchip'; b.textContent=lab; b.dataset.k=k;
        b.addEventListener('click',()=>{setPreset(k);OV.sel.clear();renderOverview();});
        pr.appendChild(b);
      });
    pr.dataset.built='1';
    const cc=document.getElementById('cchips');
    PAGES.forEach((p,i)=>{
      const b=document.createElement('button'); b.className='clchip'; b.dataset.k=p.key;
      b.innerHTML=`<i style="background:${p.clusterColor}"></i>${p.key}`;
      b.title=p.full+' — click to filter, double-click to open that cluster';
      b.addEventListener('click',()=>{
        OV.clusters.has(p.key)?OV.clusters.delete(p.key):OV.clusters.add(p.key);
        if(!OV.clusters.size) PAGES.forEach(x=>OV.clusters.add(x.key));
        renderOverview();
      });
      b.addEventListener('dblclick',()=>selectPage(i));
      cc.appendChild(b);
    });
    document.querySelectorAll('#arrangeseg button').forEach(b=>b.addEventListener('click',()=>{
      OV.arrange=b.dataset.v; renderOverview();}));
    document.querySelectorAll('#groupseg button').forEach(b=>b.addEventListener('click',()=>{
      OV.group=b.dataset.v; buildOvControls(); buildOvLedger(); paintOv();}));
  }
  document.querySelectorAll('#presets .pchip').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.k===OV.preset)));
  document.querySelectorAll('#cchips .clchip').forEach(b=>{
    const on=OV.clusters.has(b.dataset.k);
    b.setAttribute('aria-pressed',String(on)); b.classList.toggle('off',!on);
  });
  document.querySelectorAll('#arrangeseg button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===OV.arrange)));
  document.querySelectorAll('#groupseg button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===OV.group)));
  const scope=ovScope();
  const nT=scope.reduce((a,c)=>a+TOPICS_BY_CALL[c.id].length,0);
  const bud=scope.reduce((a,c)=>a+c.budget,0);
  document.getElementById('spanread').innerHTML=
    `${dmy(OV.from)} → ${dmy(OV.to)} <span class="sub">· ${scope.length} calls · ${nT} topics · €${bud.toFixed(0)}M</span>`;
}

/* ---------- the chronological chart, and dragging its ends ---------- */
function buildOvTimeline(){
  const dates=ALLCALLS.flatMap(c=>[c.opening,c.d1,c.d2].filter(Boolean)).concat([OV.from,OV.to]).sort();
  const f=d3(dates[0]), l=d3(dates[dates.length-1]);
  OT0=new Date(f.getFullYear(),f.getMonth(),1); OT1=new Date(l.getFullYear(),l.getMonth()+1,15); OSPAN=OT1-OT0;
  const tl=document.getElementById('tl'); tl.classList.add('ov');
  let grid='',axl='',firstJan=Infinity;
  for(let d=new Date(OT0); d<OT1; d=new Date(d.getFullYear(),d.getMonth()+1,1)){
    const nx=new Date(d.getFullYear(),d.getMonth()+1,1);
    const x=(d-OT0)/OSPAN*100, w=(Math.min(nx,OT1)-d)/OSPAN*100;
    const isY=d.getMonth()===0, isQ=d.getMonth()%3===0;
    grid+=`<div class="gline${isY?' year':(isQ?' q':'')}" style="left:${x}%"></div>`;
    axl+=`<div class="mlabel" style="left:${x+w/2}%">${d.toLocaleDateString('en-GB',{month:'short'})[0]}</div>`;
    if(isY){axl+=`<div class="ylabel" style="left:${x}%">${d.getFullYear()}</div>`;firstJan=Math.min(firstJan,x);}
  }
  /* The year the chart opens in is named at its left edge — but only when
     the first January is far enough along to leave room for it. A window
     opening in December put "2025" and "2026" on top of each other. */
  if(firstJan>YEAR_LABEL_GAP) axl+=`<div class="ylabel" style="left:0%">${OT0.getFullYear()}</div>`;
  tl.innerHTML=`<div class="tl-axis"><div class="plot" style="top:0;bottom:0">${axl}</div></div><div class="tl-rows" id="tlrows"></div>`;
  tl.insertAdjacentHTML('afterbegin',`<div class="plot">${grid}</div>`);
  const rowsEl=document.getElementById('tlrows');

  const groups = OV.arrange==='cluster'
    ? PAGES.map(p=>({label:p.key+' · '+p.label, color:p.clusterColor, page:p,
                     calls:p.calls.slice().sort((a,b)=>a.d1.localeCompare(b.d1))}))
    : [{label:null, calls:ALLCALLS.slice().sort((a,b)=>a.d1.localeCompare(b.d1)||a.id.localeCompare(b.id))}];

  groups.forEach(g=>{
    if(g.label){
      const h=document.createElement('div'); h.className='swim-h';
      h.innerHTML=`<i style="background:${g.color}"></i>${g.label}<span style="color:var(--line-strong)">— ${g.calls.length} calls</span>`;
      rowsEl.appendChild(h);
    }
    g.calls.forEach(c=>rowsEl.appendChild(ovRow(c)));
  });

  const now=new Date();
  if(now>OT0&&now<OT1){
    const x=(now-OT0)/OSPAN*100;
    const pl=document.createElement('div'); pl.className='plot';
    pl.innerHTML=`<div class="today" style="left:${x}%"></div><div class="today-tag" style="left:${x}%">today</div>`;
    tl.appendChild(pl);
  }
  /* selected-window band + brush */
  const band=document.createElement('div'); band.className='plot'; band.id='ovband';
  tl.appendChild(band);
  const brush=document.createElement('div'); brush.className='brush'; brush.id='ovbrush';
  tl.appendChild(brush);
  let anchor=null;
  const pos=e=>ovDateAt(e.clientX);
  brush.addEventListener('pointerdown',e=>{
    anchor=pos(e); brush.setPointerCapture(e.pointerId);
    OV.from=anchor; OV.to=anchor; OV.preset=null; OV.sel.clear(); drawBand(); e.preventDefault();
  });
  brush.addEventListener('pointermove',e=>{
    if(anchor===null) return;
    const p=pos(e); OV.from=p<anchor?p:anchor; OV.to=p<anchor?anchor:p;
    drawBand(); buildOvControls(); paintOv(true);
  });
  const done=()=>{ if(anchor===null) return; anchor=null; buildOvControls(); buildOvLedger(); paintOv(); };
  brush.addEventListener('pointerup',done);
  brush.addEventListener('pointercancel',done);
  drawBand();
}

function drawBand(){
  const el=document.getElementById('ovband'); if(!el) return;
  const a=OX(OV.from), b=OX(OV.to);
  /* the chart says whether it is carrying a window, so the brush knows
     whether its own invitation is still worth printing */
  const tl=document.getElementById('tl'); if(tl) tl.classList.add('windowed');
  /* A window that opens today is already named by the today marker sitting
     on the same line, so it neither draws a start handle nor prints its own
     date over it. */
  const opensToday=OV.from===todayISO();
  el.innerHTML=`<div class="band${opensToday?'':' free'}" style="left:${a}%;width:${Math.max(b-a,0.3)}%"></div>
    ${opensToday?'':`<div class="band-tag" style="left:${a}%;transform:translateX(-100%)">${dm(OV.from)} ’${yy(OV.from)}</div>`}
    <div class="band-tag" style="left:${b}%">${dm(OV.to)} ’${yy(OV.to)}</div>
    ${opensToday?'':`<div class="handle" data-edge="from" style="left:${a}%" title="Drag to move the start of the window"></div>`}
    <div class="handle" data-edge="to" style="left:${b}%" title="Drag to move the end of the window"></div>`;
  el.querySelectorAll('.handle').forEach(h=>h.addEventListener('pointerdown',startEdgeDrag));
}

function todayISO(){const n=new Date();return iso(new Date(n.getFullYear(),n.getMonth(),n.getDate()));}

function ovDateAt(clientX){
  const brush=document.getElementById('ovbrush'); if(!brush) return OV.from;
  const r=brush.getBoundingClientRect();
  const frac=Math.max(0,Math.min(1,(clientX-r.left)/r.width));
  return iso(new Date(OT0.getTime()+frac*OSPAN));
}

function startEdgeDrag(e){
  const h=e.currentTarget, edge=h.dataset.edge;
  h.classList.add('drag'); h.setPointerCapture(e.pointerId); e.preventDefault(); e.stopPropagation();
  OV.preset=null; OV.sel.clear();
  const move=ev=>{
    let d=ovDateAt(ev.clientX);
    if(edge==='from') OV.from = d>OV.to ? OV.to : d;
    else              OV.to   = d<OV.from ? OV.from : d;
    drawBand(); buildOvControls(); paintOv(true);
    const nh=document.querySelector(`.handle[data-edge="${edge}"]`);
    if(nh){ nh.classList.add('drag'); }
  };
  const up=()=>{
    document.removeEventListener('pointermove',move);
    document.removeEventListener('pointerup',up);
    document.querySelectorAll('.handle').forEach(x=>x.classList.remove('drag'));
    buildOvControls(); buildOvLedger(); paintOv();
  };
  document.addEventListener('pointermove',move);
  document.addEventListener('pointerup',up);
}

/* ---------- the topic list under the chart ---------- */
function ovRow(c){
  const r=document.createElement('div'); r.className='crow'; r.tabIndex=0; r.setAttribute('role','button');
  r.dataset.call=c.id; r.title=c.id+' — '+c.name;
  const x0=OX(c.opening), x1=OX(c.d1), lastx=c.twoStage?OX(c.d2):x1;
  let b=`<span class="cbar" style="left:${x0}%;width:${Math.max(x1-x0,.8)}%;background:${c.ovColor}"></span>
    <span class="dot" style="left:${x0}%;background:${c.ovColor};box-shadow:0 0 0 1px ${c.ovInk}"></span>
    <span class="cap" style="left:${x1}%;background:${c.ovInk}"></span>`;
  if(c.twoStage) b+=`<span class="cbar2" style="left:${x1}%;width:${Math.max(OX(c.d2)-x1,.8)}%;background-color:${c.ovColor}"></span>
    <span class="cap" style="left:${OX(c.d2)}%;background:${c.ovInk}"></span>`;
  b+=`<span class="dtag r" style="left:${lastx}%;color:${c.ovInk}">${c.twoStage? dm(c.d1)+' → '+dm(c.d2)+' ’'+yy(c.d2) : dm(c.d1)+' ’'+yy(c.d1)}</span>`;
  const lbl = OV.arrange==='cluster'
    ? `<span class="cchip w" style="background:${c.ovColor};color:${ovFg(c)}">${c.short}</span><span class="nm">${c.name}</span>`
    : `<span class="cchip" style="background:${c.ovColor};color:${ovFg(c)}">${c.cluster} ${c.short}</span><span class="nm">${c.name}</span>`;
  r.innerHTML=`<span class="lbl">${lbl}</span><span class="track">${b}</span>`;
  r.addEventListener('click',()=>{
    OV.sel.has(c.id)?OV.sel.delete(c.id):OV.sel.add(c.id);
    buildOvControls(); buildOvLedger(); paintOv();
  });
  r.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();r.click();}});
  return r;
}

function buildOvLedger(){
  const ledger=document.getElementById('ledger'); ledger.innerHTML='';
  const scope=ovScope();
  const inScope=new Set(scope.map(c=>c.id));
  const match=t=>(!OV.type||t.type===OV.type)&&
    (!OV.q||(t.id+' '+t.title).toLowerCase().includes(OV.q)||(FULLTEXT&&inFull(t.id,OV.q)));
  const keyDate=c=>c.d1;
  let shown=0;

  const topicRow=(t,c)=>{
    const shortId=shortTopicId(t.id);
    const row=document.createElement('div'); row.className='topic'; row.tabIndex=0;
    row.title=t.id+' — '+t.title+'  ·  '+t.dest;
    row.innerHTML=`<span class="bar" style="background:${c.ovColor}"></span>
      ${OV.group==='cluster'?`<span class="cchip w" style="background:${c.ovColor};color:${ovFg(c)}">${c.short}</span>`:''}
      <span class="tbadge">${t.type||'—'}</span>
      <span class="tid">${shortId}</span>
      <span class="ttl">${t.title}</span>`;
    const det=document.createElement('div'); det.className='tdetail';
    det.innerHTML=`<table>
      <tr><td>Topic</td><td class="full">${t.id}</td></tr>
      <tr><td>Destination</td><td>${t.dest}</td></tr>
      <tr><td>Call</td><td class="full">${c.id} <span style="color:var(--muted)">(${c.name})</span></td></tr>
      <tr><td>Opens</td><td class="full">${dmy(c.opening)}</td></tr>
      <tr><td>Deadline</td><td class="full">${c.twoStage? dmy(c.d1)+' (stage 1) → '+dmy(c.d2)+' (stage 2)' : dmy(c.d1)}</td></tr>
      <tr><td>Topic budget</td><td>${t.budget? 'EUR '+t.budget+' million':'—'}</td></tr>
      <tr><td>EU contribution</td><td>${t.contrib? t.contrib.replace(' to ',' – ')+' M€ per project':'—'}</td></tr>
      <tr><td>Projects</td><td>${t.count? '~'+t.count+' expected':'—'}</td></tr></table>`;
    det.appendChild(detailButtons(t, c));
    row.addEventListener('click',()=>{
      const was=det.classList.contains('open');
      ledger.querySelectorAll('.tdetail.open').forEach(x=>x.classList.remove('open'));
      ledger.querySelectorAll('.topic.sel').forEach(x=>x.classList.remove('sel'));
      if(!was){det.classList.add('open');row.classList.add('sel');row.style.setProperty('--selcol',c.ovColor);}
    });
    row.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();row.click();}});
    ledger.appendChild(row); ledger.appendChild(det);
  };

  if(OV.group==='deadline'){
    /* one block per call, in the order they close */
    scope.slice().sort((a,b)=>keyDate(a).localeCompare(keyDate(b))||a.cluster.localeCompare(b.cluster)).forEach(c=>{
      const tops=TOPICS_BY_CALL[c.id].filter(match);
      if(!tops.length) return;
      shown+=tops.length;
      const dlHtml = c.twoStage
        ? `${dmy(c.d1)}<span class="cmeta"> · stage 1</span>`
        : dmy(c.d1);
      const hd=document.createElement('div'); hd.className='callhdr';
      hd.innerHTML=`<span class="clk" style="background:${c.ovColor};color:${ovFg(c)}">${c.cluster} ${c.short}</span>
        <span class="cname">${c.name}</span>
        <span class="cdl">${dlHtml}</span>
        <span class="cmeta">opens ${dm(c.opening)} ’${yy(c.opening)}${c.twoStage?` · stage 2 ${dm(c.d2)} ’${yy(c.d2)}`:''} · ${tops.length}/${TOPICS_BY_CALL[c.id].length} topics · €${c.budget}M</span>`;
      hd.title='Open '+c.cluster+' — '+c.id;
      hd.addEventListener('click',()=>selectPage(c.pageIdx));
      ledger.appendChild(hd);
      tops.forEach(t=>topicRow(t,c));
    });
  } else {
    /* cluster → destination, the content view of the same window */
    PAGES.forEach(p=>{
      if(!p.calls.some(c=>inScope.has(c.id))) return;
      const block=[];
      p.destinations.forEach(d=>{
        const tops=[];
        d.themes.forEach(th=>th.topics.forEach(t=>{
          const m=p.meta[t.id];
          if(!inScope.has(m.call)) return;
          const item={id:t.id,title:t.title,type:m.type||'',budget:m.budget,contrib:m.contrib,count:m.count,dest:d.name};
          if(match(item)) tops.push([item, p.callById[m.call]]);
        }));
        if(tops.length) block.push([d.name,tops]);
      });
      if(!block.length) return;
      const n=block.reduce((a,b)=>a+b[1].length,0); shown+=n;
      const h=document.createElement('div'); h.className='dest-h'; h.style.cursor='default';
      h.innerHTML=`<span class="dnum" style="opacity:1"><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${p.clusterColor}"></span></span>
        <span class="dname">${p.key} · ${p.label}</span><span class="dcount">${n} topics closing</span>`;
      h.title='Open '+p.full; h.style.cursor='pointer';
      h.addEventListener('click',()=>selectPage(PAGES.indexOf(p)));
      ledger.appendChild(h);
      block.forEach(([dname,tops])=>{
        const dh=document.createElement('div'); dh.className='theme-h'; dh.textContent=dname;
        ledger.appendChild(dh);
        tops.forEach(([t,c])=>topicRow(t,c));
      });
    });
  }

  if(!shown){
    const e=document.createElement('div'); e.className='empty';
    e.textContent = OV.sel.size? 'No topics match the current filters in the pinned calls.'
      : 'No submission deadlines fall in this window. Widen the window, or pick a preset above.';
    ledger.appendChild(e);
  }
  document.getElementById('count').textContent=shown<ALLTOPICS?`${shown} of ${ALLTOPICS} topics`:'';
}

/* ---------- repainting what is already drawn ---------- */
function paintOv(quick){
  const pinned=OV.sel;
  document.querySelectorAll('#tlrows .crow').forEach(r=>{
    const c=ALLCALLS.find(x=>x.id===r.dataset.call);
    const cluOn=OV.clusters.has(c.cluster);
    const on = pinned.size ? pinned.has(c.id) : (cluOn && inSpan(c));
    r.classList.toggle('on', !!pinned.size && pinned.has(c.id));
    r.classList.toggle('out', !on);
  });
  if(quick) return;
  const p=document.getElementById('pills'); p.innerHTML='';
  [...pinned].map(id=>ALLCALLS.find(c=>c.id===id)).sort((a,b)=>a.d1.localeCompare(b.d1)).forEach(c=>{
    const el=document.createElement('span'); el.className='pill'; el.style.background=c.ovColor; el.style.color=c.ovInk;
    el.innerHTML=`${c.cluster} ${c.short}<button aria-label="Unpin">✕</button>`;
    el.querySelector('button').addEventListener('click',()=>{OV.sel.delete(c.id);buildOvControls();buildOvLedger();paintOv();});
    p.appendChild(el);
  });
  if(pinned.size>1){
    const ca=document.createElement('button'); ca.className='pill clearall'; ca.textContent='unpin all';
    ca.addEventListener('click',()=>{OV.sel.clear();buildOvControls();buildOvLedger();paintOv();});
    p.appendChild(ca);
  }
  const scope=ovScope();
  const nT=scope.reduce((a,c)=>a+TOPICS_BY_CALL[c.id].length,0);
  const first=scope.map(c=>c.d1).sort()[0];
  const el=document.getElementById('selcard');
  el.innerHTML = scope.length
    ? `<span><span class="k">${scope.length}</span> calls take submissions in this window</span>
       <span>next deadline <span class="k">${dmy(first)}</span></span>
       <span><span class="k">${nT}</span> topics</span>
       <span><span class="k">€${scope.reduce((a,c)=>a+c.budget,0).toFixed(0)}M</span></span>
       ${pinned.size?'<span>pinned calls override the window</span>':''}`
    : '<span>No submission deadlines fall in this window.</span>';
  document.getElementById('famkey').innerHTML='';
}

/* ---------- controls ---------- */
const tc=document.getElementById('typechips');
['RIA','IA','CSA'].forEach(ty=>{
  const b=document.createElement('button'); b.className='tchip'; b.textContent=ty; b.setAttribute('aria-pressed','false');
  b.addEventListener('click',()=>{
    if(MODE==='overview'){
      OV.type = OV.type===ty?null:ty;
      tc.querySelectorAll('.tchip').forEach(x=>x.setAttribute('aria-pressed',String(x.textContent===OV.type)));
      buildOvLedger(); return;
    }
    P.state.type = P.state.type===ty?null:ty;
    tc.querySelectorAll('.tchip').forEach(x=>x.setAttribute('aria-pressed',String(x.textContent===P.state.type)));
    applyFilters();
  });
  tc.appendChild(b);
});
const ftEl=document.getElementById('ftchip');
ftEl.addEventListener('click',()=>{
  FULLTEXT=!FULLTEXT; ftEl.setAttribute('aria-pressed',String(FULLTEXT));
  ftEl.textContent = FULLTEXT ? '✓ full text' : '＋ full text';
  if(MODE==='overview') buildOvLedger(); else applyFilters();
});
const qEl=document.getElementById('q'), qClr=document.getElementById('qclr');
qEl.addEventListener('input',()=>{
  const v=qEl.value.trim().toLowerCase(); qClr.style.display=v?'block':'none';
  if(MODE==='overview'){OV.q=v;buildOvLedger();} else {PAGES.forEach(p=>p.state.q=v);applyFilters();}
});
qClr.addEventListener('click',()=>{
  qEl.value=''; qClr.style.display='none';
  if(MODE==='overview'){OV.q='';buildOvLedger();} else {PAGES.forEach(p=>p.state.q='');applyFilters();}
  qEl.focus();
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&document.getElementById('reader').classList.contains('open')){ closeReader(); return; }
  if(e.key==='Escape'&&MODE==='overview'){
    OV.sel.clear(); OV.type=null; OV.q=''; qEl.value=''; qClr.style.display='none';
    PAGES.forEach(p=>OV.clusters.add(p.key)); setPreset('6m'); renderOverview(); return;
  }
  if(e.key==='Escape'){
    P.state.sel.clear(); P.state.selTopicCall=null; P.state.type=null; PAGES.forEach(p=>p.state.q='');
    qEl.value=''; qClr.style.display='none';
    tc.querySelectorAll('.tchip').forEach(x=>x.setAttribute('aria-pressed','false'));
    topicEls.forEach(t=>{t.row.classList.remove('sel');t.det.classList.remove('open');});
    applyFilters(); paintTimeline(); paintPills(); showCard([]);
  }
  /* A bare digit only. Alt and a digit is the shell's way between rooms,
     and it used to turn this room's page over on the way past. */
  if(/^[1-9]$/.test(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey
     && document.activeElement!==qEl && +e.key-1<=PAGES.length) selectPage(+e.key-1);
});

const hash=(location.hash||'').replace('#','').toLowerCase();
const start = hash==='all' ? PAGES.length : Math.max(0, PAGES.findIndex(p=>p.key.toLowerCase()===hash));
selectPage(start);


/* ---------- what the other rooms may ask for ----------
   Two questions and one act: which topics are there, what is this one,
   and open it. The list is flattened here rather than in the bridge
   because the shape of a page is this room's business — the caller gets
   one row per topic and never has to know that a cluster holds
   destinations which hold themes which hold these.

   This room is the lazy one: nothing is built until it is first opened,
   so a caller reaching for any of this has to ask the Hub to build it
   first. That is the bridge's job and it is the only place that does it. */
/* One row per topic, and the dates on it are the call's — a topic keeps
   no calendar of its own, it opens and closes with the call it sits in.
   They travel as the ISO strings they are stored as, never as anything
   this room has formatted: the room reading them writes its own dates. */
function topicRow(id){
  var r=TOPIC_BY_ID[id];
  if(!r)return null;
  var c=r.call;
  return {id:id,code:shortTopicId(id),title:r.topic.title,type:r.topic.type,
          dest:r.topic.dest,call:c.id,callName:c.name,
          opening:c.opening||'',d1:c.d1||'',d2:(c.twoStage&&c.d2)||'',
          twoStage:!!c.twoStage};
}
Hub.expose('callboard',{
  topics:function(){ return Object.keys(TOPIC_BY_ID).map(topicRow); },
  openReader:function(id){ return openReader(id); },
  closeReader:closeReader
});

});
