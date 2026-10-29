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
const OV={from:null,to:null,sel:new Set(),clusters:new Set(PAGES.map(p=>p.key)),known:new Set(PAGES.map(p=>p.key)),
          arrange:'cluster',group:'deadline',q:'',type:null,preset:'6m'};
const inSpan=c=>c.d1>=OV.from&&c.d1<=OV.to;   /* stage 2 is not an entry point */
/* The day as the clock on the wall reads it. It was toISOString's, which is
   the day in Greenwich: a local midnight in the Netherlands is the evening before
   there, so the window and today both came out a day early, and a call whose
   deadline was yesterday still stood in the six months ahead. */
const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
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

/* ---------- tabs ----------
   One row of tabs at a time, chosen by a triangle of three points beside
   it (Mark, issue 1, 2026-10-28): Horizon's clusters and missions, the
   Partnerships (the arenas' tabs), and All with the Freezer. Pressing a
   point turns the triangle until that point faces right, at the row it
   chose, the way the line of room marks walks the room chosen to its
   right-hand end, and opens the tab last open in that row. Each point is
   a mark, as each room is: the sun on the horizon, an EU star, a frost
   crystal, with the group's name beside the triangle. Of the two drawn,
   Mark chose this over letters at the points.

   It replaced two rows standing at once, each named at its left
   (2026-10-25): thirteen codes, all equally loud. Those had replaced a
   roll showing one row at a time with the others peeking over and under
   the bar, which were cut off at its edges and read as broken; and all
   thirteen in one row ran into the room's name on the iPad held sideways.
   The three rows share one place, the two not chosen kept invisible
   there, so the place is as wide as the longest and the triangle does not
   jump sideways when a shorter row comes in. */
const tabsEl=document.getElementById('tabs');
const GROUPS=[{g:'hz',name:'Horizon'},{g:'ar',name:'Partnerships'},{g:'all',name:'All & Freezer'}];
/* the three marks, each drawn round its point */
const GROUP_MARKS=[
  '<path d="M-6 1.5A6 6 0 0 1 6 1.5Z" fill="#E4CB86"/><line x1="-8" y1="3.5" x2="8" y2="3.5" stroke="#E4CB86" stroke-width="1.4" stroke-linecap="round"/>',
  '<path d="M0-7L1.9-2.3 6.7-2.2 2.9 0.9 4.2 5.7 0 3-4.2 5.7-2.9 0.9-6.7-2.2-1.9-2.3Z" fill="#E4CB86"/>',
  '<g stroke="#CFE0E6" stroke-width="1.4" stroke-linecap="round"><line x1="0" y1="-7" x2="0" y2="7"/><line x1="-6.1" y1="-3.5" x2="6.1" y2="3.5"/><line x1="-6.1" y1="3.5" x2="6.1" y2="-3.5"/></g>'];
{
  const R=17, C=26, at=i=>[C+R*Math.cos(i*2*Math.PI/3),C+R*Math.sin(i*2*Math.PI/3)];
  tabsEl.innerHTML='<div class="tsel"><div class="tri"><svg width="52" height="52" viewBox="0 0 52 52" role="tablist" aria-label="Groups of tabs">'
    +'<g class="spin"><polygon points="'+[0,1,2].map(i=>at(i).join(',')).join(' ')+'"/>'
    +GROUPS.map((g,i)=>'<g class="pt" data-i="'+i+'" tabindex="0" role="tab" aria-label="'+g.name+'" transform="translate('+at(i).join(',')+')">'
      +'<circle class="hit" r="11"/><g class="mk">'+GROUP_MARKS[i]+'<circle class="pfd" cx="7.5" cy="-7.5" r="2.6"/></g></g>').join('')
    +'</g></svg></div><span class="glab"></span>'
    +GROUPS.map(g=>'<div class="trow" data-g="'+g.g+'" role="tablist" aria-label="'+g.name+'"></div>').join('')+'</div>';
}
const rowOf=g=>tabsEl.querySelector(`.trow[data-g="${g}"]`);
const htabEls=PAGES.map((p,i)=>{
  const b=document.createElement('button'); b.className='tab'; b.setAttribute('role','tab'); b.dataset.k=p.key;
  b.setAttribute('aria-selected', String(i===0));
  b.innerHTML=`<span class="ck">${p.key}</span><span class="cn">${p.label}</span>`;
  b.addEventListener('click',()=>selectPage(i));
  rowOf('hz').appendChild(b);
  return b;
});
const ovTab=document.createElement('button');
ovTab.className='tab'; ovTab.setAttribute('role','tab'); ovTab.setAttribute('aria-selected','false'); ovTab.dataset.k='ALL';
ovTab.innerHTML=`<span class="ck">ALL</span><span class="cn">Deadline planner</span>`;
ovTab.addEventListener('click',()=>selectPage(PAGES.length));
rowOf('all').appendChild(ovTab);
/* every frozen arena's calls on one chart (see "the freezer") */
const fzTab=document.createElement('button');
fzTab.className='tab'; fzTab.setAttribute('role','tab'); fzTab.setAttribute('aria-selected','false'); fzTab.dataset.k='FREEZER';
fzTab.title='Every arena put away, its calls on the timeline';
fzTab.innerHTML=`<span class="ck">FREEZER</span><span class="cn">Every arena put away</span>`;
fzTab.addEventListener('click',()=>selectArenaTab('FREEZER'));
rowOf('all').appendChild(fzTab);

/* the triangle: which point faces right, and how far it has turned, kept
   whole so that every turn goes the short way round */
const spinEl=tabsEl.querySelector('.spin'), glabEl=tabsEl.querySelector('.glab');
const ptEls=[...tabsEl.querySelectorAll('.pt')];
let GSEL=-1, TURN=0;
const LAST={};          /* the tab last open in each row, by its key */
function showGroup(i){
  if(GSEL>=0&&i!==GSEL) TURN+=((i-GSEL)%3+3)%3===1?-120:120;
  GSEL=i;
  spinEl.style.transform=`rotate(${TURN}deg)`;
  ptEls.forEach((pt,k)=>{
    pt.classList.toggle('on',k===i); pt.setAttribute('aria-selected',String(k===i));
    /* each mark turns back as far as the triangle turns, so it stays upright */
    pt.querySelector('.mk').style.transform=`rotate(${-TURN}deg) scale(${k===i?1.22:1})`;
  });
  glabEl.textContent=GROUPS[i].name;
  tabsEl.querySelectorAll('.trow').forEach(r=>r.classList.toggle('cur',r.dataset.g===GROUPS[i].g));
}
function pickGroup(i){
  const tabs=[...rowOf(GROUPS[i].g).querySelectorAll('.tab')];
  if(!tabs.length) return;
  (tabs.find(t=>t.dataset.k===LAST[GROUPS[i].g])||tabs[0]).click();
}
ptEls.forEach((pt,i)=>{
  pt.addEventListener('click',()=>pickGroup(i));
  pt.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pickGroup(i);}});
});

/* The arenas' tabs come and go with the arenas, so a tab is marked live by
   which element it is rather than by its place in a row; the triangle
   turns to the row it stands in, wherever it was chosen from. */
function markTab(el){
  tabsEl.querySelectorAll('.tab').forEach(t=>t.setAttribute('aria-selected',String(t===el)));
  const row=el&&el.closest('.trow'); if(!row) return;
  LAST[row.dataset.g]=el.dataset.k;
  showGroup(GROUPS.findIndex(x=>x.g===row.dataset.g));
}
function selectPage(i){
  if(i===PAGES.length){ MODE='overview'; location.hash='all'; markTab(ovTab); }
  else { MODE='cluster'; P=PAGES[i]; location.hash=P.key.toLowerCase(); markTab(htabEls[i]); }
  afterSelect();
}
function selectArenaTab(key, openId){
  const p=arenaPage(key);
  if(!p) return;
  MODE='arena'; P=p; location.hash=key.toLowerCase(); markTab(p.tabEl);
  if(openId&&p.callById[openId]) p.state.openArena=p.callById[openId].arenaId;
  afterSelect();
}
function afterSelect(){
  if(TA.on) taSet(false,true);
  document.getElementById('ovbar').classList.toggle('on', MODE==='overview');
  document.getElementById('hdr').classList.toggle('arena', MODE==='arena');
  document.getElementById('q').placeholder=MODE==='arena'?'Search arenas and calls…':'Search topic ID or title…';
  render(); setHdrH(); window.scrollTo({top:0});
}

/* ---------- the arenas' calls ----------
   Every arena on the Brokerage Semaphore that is not a Horizon cluster or
   mission has its calls drawn here (Mark, 2026-10-24), in a tab for each
   of Mark's three big types, Joint Undertakings, co-funded and
   co-programmed partnerships, and one more for every other arena. A
   Pillar 2 arena is a cluster or mission already, and its tab is the
   cluster's own, so it gets none. The types are told apart by their
   names, which are Mark's own.

   One row to a call, on the sheet and on the chart alike, the arena named
   on the call's chip and the call in the text beside it, which is the shape
   a Horizon topic already has here. Of the three ways drawn Mark chose this
   over the arena's name once beside all its calls and over a light line
   heading each arena; the dark heading of a destination was turned down
   for arenas, because most hold a call or two and a heading for each
   cluttered the sheet and took a row of the chart.

   The rows come from the Semaphore through the bridge, which hands over
   the runs the Semaphore itself works out, so the stages of one call are
   one bar here as there. An arena wears a colour of its own on the chip
   and the bar, saturated for the round it is in and pale for the next, as
   the 2026 and 2027 calls are in Horizon; a date not yet published to the
   day is a soft band over the time it can fall in (see softSpan). */
const TYPE_TABS=[
  {key:'JU',full:'Joint Undertakings',color:'#7D71B0',test:/\bJU\b|joint\s*undertaking/i},
  {key:'CoFund',full:'Co-funded partnerships',color:'#3C8D6D',test:/co[\s-]*fund/i},
  {key:'CoProg',full:'Co-programmed partnerships',color:'#A96B45',test:/co[\s-]*prog/i},
  {key:'OTHER',full:'Every other arena',color:'#6F7F8F',test:null}];
const HORIZON_TYPE=/pillar\s*(2|ii)\b|\bclusters?\b|\bmissions?\b/i;
/* An arena wears its type's colour from the Semaphore, as a tag in the
   Semaphore's own look, so that the two rooms read as one (Mark, issue 2,
   2026-10-28). Before, the Call Board handed each arena a colour of its
   own, which meant nothing anywhere else. A call is lighter the further
   off it is, its bar and its arena's tag on its row alike: the type's full
   colour within three months, lighter beyond six, lighter again beyond
   twelve. Mark chose this over full colour for the round a call is in and
   pale for the next, the rule it replaced. Within one tab every arena may
   wear the same colour, so the rule between arenas is firmer (callboard.css).
   A frozen arena's calls are frosted besides. */
const PAPER='#F7F3E9', FROST='#DDE4E6', NO_TONE='#9C8B66';
const mixHex=(a,b,t)=>'#'+[1,3,5].map(i=>hex2(parseInt(a.substr(i,2),16)*t+parseInt(b.substr(i,2),16)*(1-t))).join('');
const toneOf=a=>/^#[0-9a-f]{6}$/i.test((a&&a.tone)||'')?a.tone:NO_TONE;
function nearness(r){
  const dl=(r.dls||[])[0], d=dl||r.open||r.ann;
  if(!d||!d.start) return 1;
  const months=(d3(dl?dlDay(dl):d.start)-new Date())/(30.4*864e5);
  return months<=3?1:months<=6?.66:months<=12?.42:.3;
}
/* the tag naming an arena on a row: a wash of its colour with the colour
   itself as a solid edge at its left, as the Semaphore draws an arena; an
   arena with no call yet wears its type's pale tone */
function tagHTML(a,c,text){
  const col=c?c.color:mixHex(toneOf(a),PAPER,.42), fz=!!a.frozenAt;
  return `<span class="cchip w achip stag${fz?' frz':''}" style="--tone:${col};background:${mixHex(col,PAPER,.3)}">${fz?'<i class="frost"></i>':''}${esc(text)}</span>`;
}
let ARENA_SRC=null, APAGES=[], ACALLS=[], FZ=null, pendingTab=null;
/* an arena's tab, or the Freezer, by its key, while it has a tab */
const arenaPage=k=>k==='FREEZER'?FZ:APAGES.find(x=>x.key===k&&x.tabEl);
const allPages=()=>PAGES.concat(APAGES);
const everyCall=()=>ALLCALLS.concat(ACALLS);
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
/* A date as exactly as it is known: a day, or only its month, quarter,
   half or year. Written short on the chart and in a row, long in a card. */
function whenShort(d){
  if(!d||!d.start) return '';
  const y='’'+d.start.slice(2,4), m=MON[+d.start.slice(5,7)-1];
  switch(d.gran){
    case 'month': return m+' '+y;
    case 'quarter': return 'Q'+(Math.floor((+d.start.slice(5,7)-1)/3)+1)+' '+y;
    case 'half': return 'H'+(+d.start.slice(5,7)<7?1:2)+' '+y;
    case 'year': return d.start.slice(0,4);
    case 'range': return dm(d.start)+' – '+dm(d.end)+' '+y;
    default: return dm(d.start)+' '+y;
  }
}
function whenLong(d){
  if(!d||!d.start) return '';
  const y=d.start.slice(0,4), m=MON[+d.start.slice(5,7)-1];
  switch(d.gran){
    case 'month': return m+' '+y;
    case 'quarter': return 'Q'+(Math.floor((+d.start.slice(5,7)-1)/3)+1)+' '+y;
    case 'half': return 'H'+(+d.start.slice(5,7)<7?1:2)+' '+y;
    case 'year': return y;
    case 'range': return dmy(d.start)+' – '+dmy(d.end);
    default: return dmy(d.start);
  }
}
/* where a deadline known only to its month falls on the chart: its last
   day, the latest it can be; an opening falls on its first */
const dlDay=d=>(d.gran==='day'||d.gran==='range')?d.start:(d.end||d.start);
/* Where a date not yet published to the day can fall, which the chart
   draws as a soft band rather than a point (Mark, 2026-10-28, chosen over
   an outline for anything uncertain and over the dashed bar it replaces,
   which put a deadline known only to its month on that month's last day
   with the hard tick of a real one): the whole month, quarter, half or
   year it is known to, or a week either side of a day only guessed.
   Null for a date published to the day. */
function softSpan(d){
  if(!d||!d.start||d.grade==='fixed') return null;
  const by=(s,n)=>{ const t=d3(s); t.setDate(t.getDate()+n); return t.toISOString().slice(0,10); };
  return (d.gran==='day'||d.gran==='range')?[by(d.start,-7),by(d.end||d.start,7)]:[d.start,by(d.end||d.start,1)];
}
function tabOfType(name){
  if(HORIZON_TYPE.test(name||'')) return null;
  return TYPE_TABS.find(t=>t.test&&t.test.test(name||''))||TYPE_TABS[TYPE_TABS.length-1];
}
/* The name on an arena's chip, without the words that say what kind of
   arena it is (Mark, 2026-10-28): "European Partnership for", "Co-funded
   Partnership", "Joint Undertaking" and the like stood on nearly every
   chip, told no partnership from another and pushed the words that do off
   its end. The full name stays on hover, in a search and in its panel. A
   name that is nothing but such words keeps them. */
const KIND_WORDS=/\b(?:the\s+)?(?:co[\s-]*(?:funded|programmed)\s+)?(?:european\s+)?(?:partnerships?|joint\s+undertaking)\b(?:\s+(?:on|for|in|of))?/gi;
function tagName(name){
  const n=String(name||'');
  const s=n.replace(KIND_WORDS,' ').replace(/\(\s*\)/g,' ').replace(/\s{2,}/g,' ')
    .replace(/^[\s–—:·,-]+|[\s–—:·,-]+$/g,'');
  return s?s.charAt(0).toUpperCase()+s.slice(1):n;
}
function readArenas(){
  let list=[];
  try{ list=(ARENA_SRC&&ARENA_SRC.list())||[]; }catch(e){ console.error(e); list=[]; }
  try{ FROZEN=(ARENA_SRC&&ARENA_SRC.frozen&&ARENA_SRC.frozen())||[]; }catch(e){ console.error(e); FROZEN=[]; }
  const before=new Map(APAGES.map(p=>[p.key,p.state]));
  APAGES=TYPE_TABS.map(t=>({key:t.key,label:t.full,full:t.full,clusterColor:t.color,arena:true,unit:t.key==='CoProg'?'topics':'calls',
    arenas:[],calls:[],trows:t.key==='CoProg'?[]:null,callById:{},families:[],destinations:[],meta:{},nTopics:0,
    state:before.get(t.key)||{sel:new Set(),selTopicCall:null,q:'',type:null,closed:new Set()}}));
  const q=(PAGES[0]&&PAGES[0].state.q)||'';
  COPROG_RUNS=[]; Object.keys(COPROG_OF).forEach(k=>delete COPROG_OF[k]);
  list.forEach(a=>{
    const tt=tabOfType(a.type); if(!tt) return;
    const p=APAGES.find(x=>x.key===tt.key);
    if(p.trows) coprogTopics(p,a); else arenaCalls(p,a);
  });
  /* the Freezer holds every arena put away, Pillar 2's too, each type's
     together in the order they first come */
  FZ={key:'FREEZER',label:'Freezer',full:'Every arena put away',clusterColor:FROST,arena:true,frozen:true,unit:'calls',
    arenas:[],calls:[],callById:{},families:[],destinations:[],meta:{},nTopics:0,tabEl:fzTab,
    state:(FZ&&FZ.state)||{sel:new Set(),selTopicCall:null,q:'',type:null,closed:new Set()}};
  const tyOrder=[...new Set(FROZEN.map(a=>a.type||''))];
  FROZEN.slice().sort((x,y)=>tyOrder.indexOf(x.type||'')-tyOrder.indexOf(y.type||'')).forEach(a=>arenaCalls(FZ,a));
  FZ.nTopics=FZ.calls.length; FZ.state.q=q;
  APAGES.forEach(p=>{ p.nTopics=p.calls.length+(p.trows||[]).length; p.state.q=q; });
  ACALLS=APAGES.flatMap(p=>p.calls);     /* the Freezer's stay out of All and the searches */
  APAGES.forEach(p=>{ if(!OV.known.has(p.key)){ OV.known.add(p.key); OV.clusters.add(p.key); } });
  buildArenaTabs();
}
/* one arena's calls on its page, one to a run, in the colour its
   nearness gives */
function arenaCalls(p,a){
  const tone=toneOf(a), ink=readableInk(mixHex(tone,'#2C2418',.45),PAPER);
  p.arenas.push(a);
  const start=r=>((r.open||r.ann||(r.dls||[])[0]||{}).start)||'';
  (a.runs||[]).slice().sort((x,y)=>start(x).localeCompare(start(y))).forEach((r,i)=>{
    const dls=r.dls||[], near=mixHex(tone,PAPER,nearness(r));
    const color=a.frozenAt?mixHex(near,FROST,.5):near, from=r.open||r.ann||null, annOnly=!r.open&&!!r.ann&&!dls.length;
    const c={id:'arena:'+a.id+':'+i, arena:a, arenaId:a.id, run:r, first:i===0,
      short:tagName(a.name), name:r.name, color, ink, ovColor:color, ovInk:ink,
      cluster:p.key, clusterLabel:p.label, nTopics:0, budget:0, unc:!!r.unc,
      opening:from?from.start:null, annEnd:annOnly?r.ann.end:null,
      d1:dls.length?dlDay(dls[0]):null, d2:dls.length>1?dlDay(dls[dls.length-1]):null, twoStage:dls.length>1,
      sOpen:r.open?softSpan(r.open):null, sD1:dls.length?softSpan(dls[0]):null, sD2:dls.length>1?softSpan(dls[dls.length-1]):null};
    const say=d=>(softSpan(d)?'≈ ':'')+whenShort(d);
    c.tagOpen=from?say(from):'';
    c.tagEnd=annOnly?'expected '+whenShort(r.ann)
      :dls.length>1?say(dls[0])+' → '+say(dls[dls.length-1])
      :dls.length?say(dls[0]):(from?'opens '+say(from):'');
    p.calls.push(c); p.callById[c.id]=c;
  });
}
/* ---------- CoProg: the partnerships' own Horizon topics ----------
   A co-programmed partnership's calls are Horizon topics, so its rows on
   the CoProg tab are those topics, each with the cluster call it sits in,
   drawn at that call's dates as the Work Programme and the Horizon check
   have them (Mark, 2026-10-29, canvas 8.4). Before, they were the dates
   ChatGPT's search found for the cluster calls named after each
   partnership; those left the tab, and the search stopped looking for
   them (GPT_HORIZON in semaphore.js). The Ledger can still tie a call to
   one of them (COPROG_RUNS), so no tie made before is lost.

   A topic is a partnership's when the Work Programme's own sentence says
   so, "This topic implements the co-programmed European Partnership on
   …" or lies "within the scope of" it, naming the partnership by its name
   on the Semaphore or the short name in its brackets, commas and capitals
   aside ("AI, data, and robotics" is "AI, Data and Robotics"). Mark chose
   that over the name anywhere in the topic, measured on 2026-10-29: the
   sentence found 66 topics, none stray, where the name anywhere brought
   photonics as one item of a list of manufacturing techniques and
   textiles in waste topics. A partnership the Work Programme spells
   otherwise (Textiles for the Future, not "of") finds nothing until its
   name on the Semaphore is the Work Programme's. Only topics whose call
   is still open or to come stand on the tab. */
let COPROG_SENT=null, COPROG_RUNS=[];
const COPROG_OF={};          /* a topic's id → the partnerships it is, for the Atlas's filter */
const wordsOf=s=>' '+(String(s||'').toLowerCase().match(/[a-z0-9]+/g)||[]).join(' ')+' ';
function coprogIds(a){
  if(!COPROG_SENT){
    COPROG_SENT={};
    Object.keys(TOPIC_BY_ID).forEach(id=>{
      COPROG_SENT[id]=(TOPIC_BY_ID[id].topic.title+'. '+descText(id)).split(/[.;]\s+/)
        .filter(z=>/co.?programmed/i.test(z)&&/partnership/i.test(z)).map(wordsOf);
    });
  }
  const n=String(a.name||'');
  const forms=[n.replace(/\s*\([^)]*\)/g,'')].concat((n.match(/\(([^)]+)\)/g)||[]).map(x=>x.slice(1,-1))).map(wordsOf).filter(f=>f.trim());
  return Object.keys(COPROG_SENT).filter(id=>COPROG_SENT[id].some(z=>forms.some(f=>z.includes(f))));
}
function coprogTopics(p,a){
  p.arenas.push(a);
  /* its own runs, kept for the Ledger's picker and a text's call */
  const own={key:p.key,label:p.label,arenas:[],calls:[],callById:{}};
  arenaCalls(own,a); COPROG_RUNS.push(...own.calls);
  const tone=toneOf(a), ink=readableInk(mixHex(tone,'#2C2418',.45),PAPER), today=todayISO();
  const ids=coprogIds(a);
  ids.forEach(id=>(COPROG_OF[id]=COPROG_OF[id]||[]).push(a.id));
  ids.map(id=>TOPIC_BY_ID[id]).filter(x=>((x.call.twoStage&&x.call.d2)||x.call.d1||'')>=today)
    .sort((x,y)=>(x.call.d1||'').localeCompare(y.call.d1||'')||x.topic.id.localeCompare(y.topic.id))
    .forEach(({topic,call},i)=>{
      const near=mixHex(tone,PAPER,nearness({dls:[{start:call.d1,gran:'day'}]}));
      p.trows.push({id:'coprog:'+a.id+':'+topic.id, arena:a, arenaId:a.id, topicId:topic.id, hcall:call,
        run:{names:[topic.title],fresh:false,was:[]}, first:i===0, short:tagName(a.name), name:topic.title,
        color:a.frozenAt?mixHex(near,FROST,.5):near, ink, cluster:p.key, clusterLabel:p.label, nTopics:0, budget:0,
        opening:call.opening, d1:call.d1, d2:call.twoStage?call.d2:null, twoStage:!!call.twoStage});
    });
}
/* the cluster call's own chip, before a partnership's topic */
const hccHTML=c=>`<span class="hcc" style="background:${c.hcall.color};color:${fg(c.hcall)}" title="${attr(c.hcall.id)}">${esc(c.hcall.short)}</span>`;
function buildArenaTabs(){
  const row=rowOf('ar'); row.innerHTML='';
  /* and a tab with none yet while a new arena of its type is judged there */
  const jf=judgedFind();
  const shown=APAGES.filter(p=>p.arenas.length||(jf&&jf.tab===p.key));
  APAGES.forEach(p=>{ p.tabEl=null; });
  shown.forEach(p=>{
    const b=document.createElement('button'); b.className='tab'; b.setAttribute('role','tab'); b.title=p.full; b.dataset.k=p.key;
    b.setAttribute('aria-selected',String(MODE==='arena'&&P.key===p.key));
    b.innerHTML=`<span class="ck">${p.key}</span><span class="cn">${p.label}</span>`;
    b.addEventListener('click',()=>selectArenaTab(p.key));
    row.appendChild(b); p.tabEl=b;
  });
  /* with no arena yet, the Partnerships' point has no row to turn to */
  ptEls[1].classList.toggle('off',!shown.length);
}
/* the socket the bridge fills, and again on every change on the other side */
function arenasArrived(){
  readArenas(); readFinds(); taStale();
  /* While judging, a change made elsewhere on the board is drawn where
     Mark is. Every save went to the find's tab, so Seen pressed on another
     tab's glowing call, straight after ChatGPT's answer was put on the
     board, threw him back to the arena being judged, and seemed to do
     nothing (Mark, 2026-10-26). A find judged moves on by itself (judge). */
  if(JUDGE.on){ const f=judgedFind(); if(!f||MODE!=='overview'&&(!f.tab||f.tab===P.key)) return showFind(); }
  paintJudge();
  if(pendingTab){ const k=pendingTab; pendingTab=null; if(arenaPage(k)) return selectArenaTab(k); }
  if(MODE==='arena'){
    const p=arenaPage(P.key);
    if(!p) return selectPage(0);
    P=p; markTab(p.tabEl); render();
  } else if(MODE==='overview') renderOverview();
  else {
    /* a cluster's sheet stays as it is; only the chart, where a new
       arena being judged stands, is drawn again */
    markTab(htabEls[PAGES.indexOf(P)]);
    buildTimeline(); paintTimeline();
  }
}

function arenaRow(c){
  const row=document.createElement('div'); row.className='topic'+(c.first?' afirst':''); row.tabIndex=0; row.setAttribute('role','button');
  row.dataset.call=c.id; row.dataset.type=''; row.dataset.id=c.id;
  row.dataset.search=(c.arena.name+' '+c.run.names.join(' ')).toLowerCase();
  row.title=c.arena.name+' — '+c.run.names.join(', ');
  row.innerHTML=`<span class="bar" style="background:${c.color}"></span>
    ${tagHTML(c.arena,c,c.short)}
    <span class="ttl">${esc(c.name)}</span>
    <span class="adl${c.unc?' unc':''}">${esc(c.tagEnd)}</span>`;
  /* A new or changed date, put on the board by a search, is not judged:
     it goes straight on and its call glows here and on the chart until
     Mark presses Seen, which marks the whole arena seen, as in its panel
     (Mark, 2026-10-24). A changed date says on hover what it was. */
  if(c.run.fresh){
    row.classList.add('fresh');
    row.title+='\nNew since you last looked'+(c.run.was.length?' — '+c.run.was.join('; '):'');
    row.appendChild(seenButton(c));
  }
  return row;
}
/* An arena's tab is the chart alone (Mark, 2026-10-24): the list beside it
   only said again what the chart says, cut short, so it went, and the
   chart takes the width. Each arena's chip is as long as its name, which
   tells one from another at a glance, and its calls are named more fully
   beside it; their dates stand on the chart and on hover. What a search
   finds in the other tabs goes under the chart instead. */
function clearArenaList(){
  document.getElementById('ledger').innerHTML=''; topicEls=[];
  elsewhereEl=document.getElementById('tlaway');
}
/* Seen, on a row whose call has a new date (see arenaRow) */
function seenButton(c){
  const b=document.createElement('button'); b.className='seen'; b.textContent='Seen ✓';
  b.title='The glow on '+c.arena.name+'’s new dates goes';
  b.addEventListener('click',e=>{ e.stopPropagation(); if(ARENA_SRC&&ARENA_SRC.seen) ARENA_SRC.seen(c.arenaId); });
  return b;
}
/* Thaw, at the end of a frozen arena's first row on the Freezer tab */
function thawButton(r,a){
  if(!a.frozenAt) return;
  const b=document.createElement('button'); b.className='vbtn thaw'; b.textContent='Thaw';
  b.title='Put '+a.name+' back among the live arenas';
  b.addEventListener('click',e=>{ e.stopPropagation(); if(ARENA_SRC&&ARENA_SRC.thaw) ARENA_SRC.thaw(a.id); });
  r.querySelector('.lbl').appendChild(b);
}
function arenaChartRow(c,a){
  const r=document.createElement('div');
  r.className='crow arow'+(c.first?' afirst':'')+(c.run.fresh?' fresh':''); r.tabIndex=0; r.setAttribute('role','button');
  r.dataset.call=c.id; r.dataset.arena=a.id; r.dataset.search=(a.name+' '+c.run.names.join(' ')).toLowerCase();
  r.title=a.name+' — '+c.run.names.join(', ')+(c.run.fresh?'\nNew since you last looked'+(c.run.was.length?' — '+c.run.was.join('; '):''):'');
  r.innerHTML=`<span class="lbl">${tagHTML(a,c,c.short)}<span class="nm">${esc(c.name)}</span></span><span class="track">${barsHTML(c,X,c.color,c.ink,true)}</span>`;
  if(c.run.fresh) r.querySelector('.lbl').appendChild(seenButton(c));
  if(c.first) thawButton(r,a);
  const act=()=>openArena(a.id);
  r.addEventListener('click',act);
  r.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();act();}});
  r.addEventListener('mouseenter',()=>showCard([c.id]));
  r.addEventListener('mouseleave',()=>showCard([]));
  return r;
}
/* A co-programmed partnership's topic (see "CoProg"): its tag opens the
   partnership where it stands, as an arena's call does; the rest of the
   row reads the topic, as a Horizon topic's row does. */
function topicChartRow(c,a){
  const r=document.createElement('div');
  r.className='crow arow'+(c.first?' afirst':''); r.tabIndex=0; r.setAttribute('role','button');
  r.dataset.call=c.id; r.dataset.arena=a.id; r.dataset.search=(a.name+' '+c.topicId+' '+c.name).toLowerCase();
  r.title=a.name+' — '+c.topicId+' — '+c.name;
  r.innerHTML=`<span class="lbl">${tagHTML(a,c,c.short)}<span class="nm">${hccHTML(c)}${esc(c.name)}</span></span><span class="track">${barsHTML(c,X,c.color,c.ink,true)}</span>`;
  r.querySelector('.achip').addEventListener('click',e=>{ e.stopPropagation(); openArena(a.id); });
  const act=()=>openReader(c.topicId);
  r.addEventListener('click',act);
  r.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();act();}});
  return r;
}
/* An arena whose calls are not on the Semaphore's board yet still stands,
   so its absence from the chart says something. */
function arenaEmptyRow(a,say){
  say=say||'no call dates on the board yet';
  const r=document.createElement('div'); r.className='crow arow afirst'; r.tabIndex=0; r.setAttribute('role','button');
  r.dataset.arena=a.id; r.dataset.search=a.name.toLowerCase(); r.title=a.name+' — '+say;
  r.innerHTML=`<span class="lbl">${tagHTML(a,null,tagName(a.name))}<span class="nm anone">${esc(say)}</span></span><span class="track"></span>`;
  thawButton(r,a);
  r.addEventListener('click',()=>openArena(a.id));
  r.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openArena(a.id);}});
  return r;
}
/* Pressing a call or its arena opens the whole arena where it stands
   (Mark, 2026-10-24): a frame round its own rows, which keep their chips,
   names and bars where they were, so the board's month line above stays
   their timeline, and the board's month lines show through the frame
   (Mark chose this on 2026-10-28, over a month line of the frame's own and
   over a frame opening upwards). Over the rows, one line: its name, its type, Site and
   Reference, Seen, its panel and ✕. Its About text and its open leads stood
   there too, and every date was written on its bar; Mark found them in the
   way (issue 5), and the dates now show on a bar as on any other row, on
   hover. The other arenas dim. A click anywhere outside it shuts it and
   does nothing else (see "a click outside an arena opened"); before, it
   opened the arena clicked, which Mark did not mean. */
function openArena(id){
  P.state.openArena=P.state.openArena===id?null:id;
  buildTimeline(); paintTimeline(); applyFilters();
  const b=document.querySelector('#tl .aopen');
  if(b){ const top=b.getBoundingClientRect().top; if(top<120||top>window.innerHeight-200) b.scrollIntoView({block:'center'}); }
}
/* An arena's two links on the frame, by the words Mark uses for them:
   Site, its first link to a web page, and Reference, its first link to a
   document. The rest are in its panel. */
const isDoc=u=>/\.(pdf|docx?|pptx?|xlsx?)([?#]|$)/i.test(u||'');
function arenaLinks(a){
  const web=(a.links||[]).filter(l=>/^https?:\/\//i.test(l.url||''));
  return {site:web.find(l=>!isDoc(l.url))||null,ref:web.find(l=>isDoc(l.url))||null};
}
function arenaOpenBlock(a,calls){
  const blk=document.createElement('div'); blk.className='aopen'; blk.dataset.arena=a.id;
  blk.dataset.search=(a.name+' '+calls.map(c=>c.run.names.join(' ')).join(' ')).toLowerCase();
  const {site,ref}=arenaLinks(a);
  const link=(l,w)=>l?`<a href="${attr(l.url)}" target="_blank" rel="noopener" title="${attr((l.label?l.label+' — ':'')+l.url)}">${w} ↗</a>`:'';
  blk.innerHTML=`<div class="aoh">
      ${tagHTML(a,calls[0]||null,a.name)}
      <span class="aoty">${esc(a.type||'')}</span>
      ${site||ref?`<span class="aoln">${link(site,'Site')}${link(ref,'Reference')}</span>`:''}
      <span class="aosp"></span><span class="aobt"></span></div>`;
  const bt=blk.querySelector('.aobt');
  if(calls.some(c=>c.run.fresh)) bt.appendChild(seenButton(calls[0]));
  const panel=document.createElement('button'); panel.className='vbtn dark'; panel.textContent='Its panel ▸';
  panel.title='Everything about '+a.name+', in the Semaphore';
  panel.addEventListener('click',e=>{ e.stopPropagation(); if(ARENA_SRC&&ARENA_SRC.open) ARENA_SRC.open(a.id); });
  const x=document.createElement('button'); x.className='vbtn aox'; x.textContent='✕'; x.setAttribute('aria-label','Close '+a.name);
  x.addEventListener('click',e=>{ e.stopPropagation(); openArena(a.id); });
  bt.append(panel,x);
  calls.forEach(c=>{
    const r=document.createElement('div'); r.className='crow aorow'+(c.run.fresh?' fresh':''); r.dataset.call=c.id;
    r.title=a.name+' — '+c.run.names.join(', ')+(c.run.was.length?'\n'+c.run.was.join('; '):'');
    r.innerHTML=`<span class="lbl">${tagHTML(a,c,c.short)}<span class="nm">${c.topicId?hccHTML(c):''}${esc(c.name)}</span></span><span class="track">${barsHTML(c,X,c.color,c.ink,true)}</span>`;
    if(c.topicId){ r.addEventListener('click',()=>openReader(c.topicId)); blk.appendChild(r); return; }
    const t=keptText(c);
    if(t){
      const tb=document.createElement('button'); tb.className='vbtn tbtn'; tb.textContent='▤ Text';
      tb.title='Read '+(t.title||t.call)+', the call’s official text';
      tb.addEventListener('click',e=>{ e.stopPropagation(); openText(t,c); });
      r.querySelector('.nm').after(tb);
    }
    blk.appendChild(r);
  });
  if(!calls.length) blk.insertAdjacentHTML('beforeend',`<div class="crow aorow"><span class="lbl">${tagHTML(a,null,tagName(a.name))}<span class="nm anone">no call dates on the board yet</span></span><span class="track"></span></div>`);
  return blk;
}
/* A click outside an arena opened shuts it and goes no further, so the
   arena or call under the pointer is not opened in the same stroke (Mark,
   issue 5). Only on the chart: the tabs, the search and the reader keep
   their own presses, and a tab changed shuts the arena anyway. */
document.getElementById('tl').addEventListener('click',e=>{
  if(MODE!=='arena'||!P.state.openArena||e.target.closest('.aopen')) return;
  e.stopPropagation(); e.preventDefault();
  openArena(P.state.openArena);
},true);
/* The arenas in their order, each type's under its name when the tab holds
   more than one type, as OTHER and the Freezer do (Mark, 2026-10-24): the
   name once, in small capitals, beside a square in the type's colour. A
   slim rule in that colour ran down the rows' left until the tags took the
   type's colour themselves (2026-10-28). */
function buildArenaRows(rowsEl){
  if(P.frozen&&!P.arenas.length) rowsEl.insertAdjacentHTML('beforeend','<div class="aonone">Nothing is put away.</div>');
  const types=new Set(P.arenas.map(a=>a.type||''));
  let ty=null;
  P.arenas.forEach(a=>{
    if(types.size>1&&(a.type||'')!==ty){
      ty=a.type||'';
      rowsEl.insertAdjacentHTML('beforeend',`<div class="tyh" style="--ty:${attr(a.tone||'#9C8B66')}" data-ty="${attr(ty)}"><i></i>${esc(ty||'No type')}</div>`);
    }
    const calls=P.calls.concat(P.trows||[]).filter(c=>c.arenaId===a.id);
    const add=el=>{ if(types.size>1){ el.classList.add('typed'); el.style.setProperty('--ty',a.tone||'#9C8B66'); el.dataset.ty=ty; } rowsEl.appendChild(el); };
    if(P.state.openArena===a.id) add(arenaOpenBlock(a,calls));
    else if(!calls.length) add(arenaEmptyRow(a,P.trows?'no topic of the Work Programme names it':null));
    else calls.forEach(c=>add(c.topicId?topicChartRow(c,a):arenaChartRow(c,a)));
  });
}

/* ---------- the tab an arena belongs to ----------
   A new arena waiting to be judged and an arena in the freezer stand in
   the tab of its type, and a Pillar 2 arena in the cluster or mission tab
   that it is. The venues serving the arenas stood in those tabs too, as
   lanes over the calls behind a Brokerage switch (2026-10-24), until Mark
   sent them back to the Semaphore (2026-10-25): the Call Board is for
   calls, and a venue's card there still shows the calls it is for. */
/* the Horizon page a Pillar 2 arena is, by its name: Cluster 4 is CL4, the
   missions and the horizontal activities their own pages */
function pageOfArena(name){
  const n=String(name||''), m=n.match(/\bcluster\s*(\d)\b/i);
  return PAGES.find(p=>m?p.key==='CL'+m[1]
    :/mission/i.test(n)?/miss/i.test(p.key+' '+p.label)
    :/horizontal/i.test(n)?/horiz/i.test(p.key+' '+p.label):false)||null;
}
/* the tab an arena's things stand in, by its type and, for a Horizon one,
   its name */
function arenaTabKey(name,type){
  if(HORIZON_TYPE.test(type||'')){ const p=pageOfArena(name); return p?p.key:null; }
  return tabOfType(type).key;
}
const tabOrder=k=>{ const i=PAGES.findIndex(p=>p.key===k); if(i>=0) return i;
  const j=TYPE_TABS.findIndex(t=>t.key===k); return j>=0?PAGES.length+j:999; };
/* ---------- judging the finds, one at a time ----------
   Whatever a search for calls found waits here to be judged before it
   lands (Mark, 2026-10-24): a new arena suggested, by ChatGPT's search
   for calls or the agent. The Semaphore's Dispatches did this until then.
   Here the board goes to the tab where a find belongs and draws it in
   place with a dashed edge, not on the board yet, and the panel it will
   become says what it is and asks: added, in the type chosen there, or
   not (see paintJudge). Then
   the next, in the order of the tabs. Stop leaves the rest waiting,
   counted on the pill in the search row, which starts again. New venues
   were judged here too, drawn on their lanes, until they went back to the
   Semaphore with the lanes (2026-10-25), where each is put to Mark in its
   own card. Dates are not judged: a new or changed one goes straight on
   and glows on its call's row until Seen (see arenaRow). The official
   text of a call on the board is the second kind (2026-10-28), read on the
   EU portal by the nightly Horizon check or found by ChatGPT's search for
   call texts, and kept beside its call only once judged here (see "the
   official call texts"). */
const JUDGE={on:false,key:null,pos:0,done:0,types:{}};
let FINDS=[], FTYPES=[];
function readFinds(){
  let o=null;
  try{ o=ARENA_SRC&&ARENA_SRC.finds&&ARENA_SRC.finds(); }catch(e){ console.error(e); }
  o=o||{finds:[],types:[]};
  FTYPES=o.types||[];
  FINDS=(o.finds||[]).filter(f=>f.kind==='arena').map(f=>{
    const type=JUDGE.types[f.key]||f.type, t=FTYPES.find(x=>x.id===type);
    return Object.assign({},f,{type,tab:t?arenaTabKey(f.name,t.name):null});
  }).concat(textFinds()).sort((x,y)=>tabOrder(x.tab)-tabOrder(y.tab)||x.name.localeCompare(y.name));
}
/* the find on the bar: the one named, or, once that one is judged, the one
   now standing in its place, and after the last the first again */
function judgedFind(){
  if(!JUDGE.on||!FINDS.length) return null;
  return FINDS.find(f=>f.key===JUDGE.key)||FINDS[JUDGE.pos<FINDS.length?JUDGE.pos:0];
}
function startJudging(){
  readFinds();
  if(!FINDS.length){ paintJudge(); return; }
  JUDGE.on=true; JUDGE.done=0; JUDGE.pos=0; JUDGE.key=FINDS[0].key;
  showFind();
}
function stopJudging(){
  JUDGE.on=false; JUDGE.key=null;
  if(MODE==='overview') renderOverview(); else render();
  paintJudge();
}
function showFind(){
  const f=judgedFind();
  if(!f){
    if(JUDGE.on&&JUDGE.done) Hub.note('Everything found is judged.',4000);
    JUDGE.on=false; JUDGE.key=null;
    if(MODE==='overview') renderOverview(); else render(); paintJudge(); return;
  }
  JUDGE.key=f.key; JUDGE.pos=FINDS.indexOf(f);
  const tab=f.tab||(MODE==='overview'?PAGES[0].key:P.key);
  if(tab!==P.key||MODE==='overview'){
    const i=PAGES.findIndex(p=>p.key===tab);
    if(i>=0) selectPage(i); else { buildArenaTabs(); selectArenaTab(tab); }
  } else render();
  paintJudge();
}
function stepFind(d){
  if(!FINDS.length) return;
  JUDGE.pos=(JUDGE.pos+d+FINDS.length)%FINDS.length; JUDGE.key=FINDS[JUDGE.pos].key;
  showFind();
}
/* Judged: the Semaphore does it and saves, the save comes back here as a
   change, and the next find is the one now standing where this one stood. */
function judge(key,verb,type){
  const was=JUDGE.on&&judgedFind()&&judgedFind().key===key;
  /* a text is answered in the cloud, where it waits */
  if(key.startsWith('text:')){
    const api=textApi();
    if(!api){ Hub.note('Log in to the cloud first: the call texts are kept there.',6000); return; }
    api.decide(key.slice(5),verb==='add'?'kept':'no',err=>{
      if(err){ Hub.note(err,6000); return; }
      if(was){ JUDGE.done++; JUDGE.key=null; readFinds(); showFind(); }
      else { readFinds(); paintJudge(); }
    });
    return;
  }
  if(!ARENA_SRC||!ARENA_SRC.judge) return;
  ARENA_SRC.judge(key,verb,type,err=>{
    if(err){ Hub.note(err,6000); return; }
    if(was){ JUDGE.done++; JUDGE.key=null; readFinds(); showFind(); }
  });
}
/* The find on the bar is shown as the panel it will become, the
   Semaphore's drawer lent over this room (Mark, issue 17, 2026-10-28),
   which replaced a dark bar along the foot of the room: its site under its
   name, where it goes and Add or No at its head, Back, Skip and Stop in
   the band over it. What each press does stays here. */
function paintJudge(){
  const pill=document.getElementById('jpill');
  const n=FINDS.length;
  pill.hidden=!n&&!JUDGE.on;
  pill.classList.toggle('on',JUDGE.on);
  pill.textContent=JUDGE.on?'Judging · '+(JUDGE.done+JUDGE.pos+1)+' of '+(JUDGE.done+n)
    :n+(n===1?' find':' finds')+' to judge';
  pill.title=JUDGE.on?'The find in the panel on the right':'Go through what the searches found, one at a time';
  paintTabDots();
  const f=judgedFind();
  if(!f){ if(ARENA_SRC&&ARENA_SRC.unfind) ARENA_SRC.unfind(); return; }
  if(!ARENA_SRC||!ARENA_SRC.find) return;
  const t=f.kind==='text'?f.text:null;
  ARENA_SRC.find({kind:f.kind,dates:f.dates||[],name:f.name,url:t?t.source_url||'':f.url,why:f.why,from:f.from,has:f.has,type:f.type,
    text:t?{source:t.source,sourceTitle:t.source_title||'',arena:f.arenaName||'',call:t.ident||t.call,
      sections:(t.sections||[]).slice(0,2).map(x=>({h:x.h||'',p:(x.p||[]).slice(0,4)})),
      more:(t.sections||[]).length>2||(t.sections||[]).some(x=>(x.p||[]).length>4)}:null,
    /* the panel is lent over the whole room, so the reader cannot open
       above it: it is put aside while the text is read, and closing the
       reader brings it back on the same find */
    read:t?()=>{ if(ARENA_SRC.unfind) ARENA_SRC.unfind(); openText(t,f.call,paintJudge); }:null,
    types:FTYPES.map(t=>({id:t.id,name:t.name})),
    cur:JUDGE.done+JUDGE.pos,total:JUDGE.done+n,done:JUDGE.done,n,
    judge:(verb,type)=>judge(f.key,verb,type),
    step:d=>stepFind(d),
    stop:()=>{ if(JUDGE.on) stopJudging(); },
    retype:t=>{ JUDGE.types[f.key]=t; readFinds(); showFind(); }});
}
const hostOf=u=>{ try{ return new URL(u).hostname.replace(/^www\./,''); }catch(e){ return String(u||''); } };
document.getElementById('jpill').addEventListener('click',()=>{ if(!JUDGE.on) startJudging(); });
/* ChatGPT's search for calls, whose answer brings the finds judged here:
   the Semaphore holds the arenas' calls and reads the answer, so its box
   is lent over this room (see "ChatGPT's search" in semaphore.js) */
document.getElementById('gptb').addEventListener('click',()=>{ if(ARENA_SRC&&ARENA_SRC.gpt) ARENA_SRC.gpt(); });
/* a dot on every tab where a find waits */
function paintTabDots(){
  const by=new Map(); FINDS.forEach(f=>{ if(f.tab) by.set(f.tab,(by.get(f.tab)||0)+1); });
  const mark=(el,k)=>{ if(!el) return; el.querySelector('.fd')?.remove();
    const n=by.get(k); if(n) el.insertAdjacentHTML('beforeend',`<i class="fd" title="${n} find${n===1?'':'s'} to judge here"></i>`); };
  PAGES.forEach((p,i)=>mark(htabEls[i],p.key));
  APAGES.forEach(p=>mark(p.tabEl,p.key));
  /* and on the triangle's point, since its row may be the one not shown */
  ptEls.forEach((pt,k)=>pt.classList.toggle('fd',!!rowOf(GROUPS[k].g).querySelector('.fd')));
}
/* the call a text being judged belongs to, marked on its row with the
   text's mark dashed, as the new arena's row is dashed: not kept yet */
function ghostText(rowsEl){
  const f=judgedFind();
  if(!f||f.kind!=='text'||!f.call) return;
  const r=[...rowsEl.querySelectorAll('.crow')].find(x=>x.dataset.call===f.call.id);
  const nm=r&&r.querySelector('.nm');
  if(nm) nm.insertAdjacentHTML('afterend','<span class="tghost" title="Its text, not kept yet">▤ Text</span>');
}
/* the new arena being judged, as a row of its tab's chart, dashed */
function ghostArenaRow(rowsEl){
  const f=judgedFind();
  if(!f||f.kind!=='arena'||MODE==='overview'||(f.tab&&f.tab!==P.key)) return;
  rowsEl.insertAdjacentHTML('beforeend',`<div class="crow ghost afirst"><span class="lbl"><span class="cchip w achip">${esc(f.name)}</span><span class="nm anone">a new arena, not on the board yet</span></span><span class="track"></span></div>`);
}

/* ---------- the official call texts ----------
   An arena's call can be read in the same reader as a Horizon topic, with
   a link to where its text came from (Mark, 2026-10-24; built 2026-10-28).
   The texts are the cloud's, in a table of their own (call_texts), never
   on the Semaphore's board: two places fill it. The nightly Horizon check
   copies, word for word, the text of every call on the board that the EU
   portal carries, found by the portal id written in the call's name; Mark
   chose that over asking ChatGPT for those too, as exact and free.
   ChatGPT's search for call texts brings the rest. Either way a text is a
   find, judged here one at a time, and once kept it opens from the Text
   beside its call in the arena opened, which Mark chose over a mark on
   every row of the chart. Which call a text belongs to is the bridge's
   rule (`fits` in bridge.js), the same for ChatGPT's search. */
const textApi=()=>{ try{ const a=Hub.api('call-texts'); return a&&a.ready&&a.ready()?a:null; }catch(e){ return null; } };
const callTexts=()=>{ try{ const a=Hub.api('call-texts'); return (a&&a.list&&a.list())||[]; }catch(e){ return []; } };
/* whether text `t` is call `c`'s, by the bridge's one rule */
function textFits(t,c){
  try{ const a=Hub.api('call-texts'); return !!(a&&a.fits&&c)&&a.fits(t,c.arenaId,[c.name].concat((c.run&&c.run.names)||[])); }
  catch(e){ return false; }
}
const keptText=c=>callTexts().find(t=>t.status==='kept'&&textFits(t,c))||null;
/* the texts waiting, as finds in the tab of their arena */
function textFinds(){
  const arenas=APAGES.flatMap(p=>p.arenas).concat(FZ?FZ.arenas:[]);
  const calls=ACALLS.concat(FZ?FZ.calls:[],COPROG_RUNS);
  return callTexts().filter(t=>t.status==='new').map(t=>{
    const c=calls.find(x=>textFits(t,x))||null, a=c?c.arena:arenas.find(x=>x.id===t.arena_id);
    const tt=a&&tabOfType(a.type);
    return {kind:'text',key:'text:'+t.id,text:t,call:c,name:t.title||t.call,arenaName:a?a.name:'',
      tab:c?c.cluster:(a&&a.frozenAt?'FREEZER':tt?tt.key:null)};
  });
}
/* a text's paragraphs as the reader sets a topic's: a bullet kept, a line
   heading a list ("Proposals are expected to:") set apart */
function textBody(secs){
  return (secs||[]).map(x=>(x.h?`<h3>${esc(x.h)}</h3>`:'')+(x.p||[]).map(p=>
    p.startsWith('• ')?`<p class="bul">•&nbsp;${esc(p.slice(2))}</p>`
    :/^[^•].{0,80}:$/.test(p)?`<p class="sub">${esc(p)}</p>`:`<p>${esc(p)}</p>`).join('')).join('');
}
function openText(t,c,back){
  RD_ID=null; RD_BACK=back||null;
  const a=c&&c.arena, short=a?tagName(a.name):'';
  document.getElementById('rdtitle').textContent=t.title||t.call;
  const row=(k,v,mono)=>v?`<tr><td>${k}</td><td${mono?' class="full"':''}>${v}</td></tr>`:'';
  const from=t.source==='portal'?'Word for word from the Funding &amp; Tenders portal'
    :'Found by ChatGPT’s search for call texts'+(t.source_title?', from “'+esc(t.source_title)+'”':'');
  document.getElementById('rdmeta').innerHTML='<table>'
    +row('Arena',a?esc(short)+(short!==a.name?` <span class="aside">(${esc(a.name)})</span>`:''):'')
    +row('Call',esc(t.ident||t.call),!!t.ident)
    +row('Opens',c&&c.tagOpen&&!c.annEnd?esc(c.tagOpen):'')
    +row('Deadline',c&&c.tagEnd?esc(c.tagEnd):'')
    +row('Text',from+(t.read_at?', read '+dmy(String(t.read_at).slice(0,10)):''))
    +'</table>';
  const links=document.getElementById('rdlinks'); links.innerHTML='';
  if(/^https?:\/\//i.test(t.source_url||'')) links.appendChild(portalLink(t.source_url,'Call text at its source'));
  const nt=document.getElementById('rdnotes'); nt.hidden=true; nt.innerHTML='';
  const body=document.getElementById('rdbody');
  body.innerHTML=textBody(t.sections)||'<p>This text has no sections.</p>';
  body.scrollTop=0;
  slideReader();
}

/* ---------- the portal, laid over the Work Programme ----------
   The Work Programme file is the Call Board's Horizon, as adopted, and is
   never changed. What the EU portal says today about each of its topics
   is read every night by the Horizon check, a plain program in Supabase
   (supabase/10-horizon-check-function.ts), into a table of its own, and
   laid over the file here (Mark, 2026-10-24; built 2026-10-28): a call
   whose dates the portal gives otherwise is drawn at the portal's dates,
   glowing until Seen, and says on hover what the Work Programme said; a
   topic the portal no longer has, or has moved to another call, is struck
   through where it stands, glowing until Seen and struck for good, which
   Mark chose over folding such topics into one line under their heading.
   The portal's notices about dates, eligibility or a cancellation stand in
   the reader; its other notices (a submission system opening, page limits,
   success rates) are left out. Topics new to the portal are not shown.
   When the topics of one call disagree among themselves, the last read
   gives the call its dates. */
const HZ={rows:new Map()};
ALLCALLS.forEach(c=>{ c.wp={opening:c.opening,d1:c.d1,d2:c.d2}; });
const hzApi=()=>{ try{ const a=Hub.api('horizon'); return a&&a.ready&&a.ready()?a:null; }catch(e){ return null; } };
const unseen=r=>!!(r&&r.changed_at&&(!r.seen_at||r.seen_at<r.changed_at));
const dmyOr=d=>d?dmy(d):'—';
function layHorizon(){
  ALLCALLS.forEach(c=>{ Object.assign(c,c.wp); c.hz=null; });
  HZ.rows.forEach(r=>{
    if(r.diff!=='dates') return;
    const rec=TOPIC_BY_ID[r.id], c=rec&&rec.call;
    if(!c) return;
    const dl=r.deadlines||[];
    if(r.opening) c.opening=r.opening;
    if(dl[0]) c.d1=dl[0];
    if(c.twoStage&&dl[1]) c.d2=dl[1];
    const h=c.hz||(c.hz={ids:[],fresh:false});
    h.ids.push(r.id); h.fresh=h.fresh||unseen(r);
    h.was='The Work Programme said: opens '+dmyOr(c.wp.opening)+', deadline '+
      (c.twoStage?dmyOr(c.wp.d1)+' → '+dmyOr(c.wp.d2):dmyOr(c.wp.d1));
  });
}
function readHorizon(){
  const api=hzApi(); if(!api) return;
  api.changes((rows,err)=>{
    if(err||!rows) return;
    HZ.rows=new Map(rows.map(r=>[r.id,r]));
    layHorizon();
    if(MODE!=='arena') render();
  });
}
function hzSeen(ids){
  const api=hzApi();
  if(!api){ Hub.note('Log in to the cloud first: what the portal said is kept there.',6000); return; }
  api.seen(ids,err=>{
    if(err){ Hub.note('Not marked seen — '+err,6000); return; }
    const now=new Date().toISOString();
    ids.forEach(id=>{ const r=HZ.rows.get(id); if(r) r.seen_at=now; });
    layHorizon(); render();
  });
}
function hzSeenButton(ids){
  const b=document.createElement('button'); b.className='seen'; b.textContent='Seen ✓';
  b.title='The glow goes';
  b.addEventListener('click',e=>{ e.stopPropagation(); hzSeen(ids); });
  return b;
}
/* a topic's row, as the portal has it */
function hzTopic(row,id){
  const r=HZ.rows.get(id); if(!r) return;
  if(r.diff==='gone'||r.diff==='moved'){
    row.classList.add('gone');
    row.querySelector('.ttl').insertAdjacentHTML('afterend',
      `<span class="hztag">${r.diff==='moved'?'Moved to '+esc(shortTopicId(r.moved_to||'')):'Gone from the portal'}</span>`);
    row.title+='\n'+(r.diff==='moved'?'The portal now has it as '+r.moved_to:'The portal no longer has this topic');
  } else row.title+='\nThe portal gives its call other dates than the Work Programme';
  if(unseen(r)){ row.classList.add('fresh'); row.appendChild(hzSeenButton([id])); }
}
/* the portal's notices worth reading in the reader: about dates,
   eligibility or a cancellation (Mark, 2026-10-28) */
const NOTICE=/postpon|extended|extension|cancel|withdrawn|eligib|no longer|reopen|corrigend|deadline (?:is|has been|was|will be) (?:changed|moved|postponed|extended)/i;
let RD_ID=null, RD_BACK=null;
function readerNotices(id){
  const nt=document.getElementById('rdnotes'); nt.hidden=true; nt.innerHTML='';
  const api=hzApi(); if(!api) return;
  api.notices(id,list=>{
    if(RD_ID!==id) return;
    const keep=(list||[]).filter(n=>n&&NOTICE.test(n.text||''));
    if(!keep.length) return;
    nt.innerHTML=`<p class="rnk">From the portal</p>`+keep.slice(0,6).map(n=>{
      const s=String(n.text); return `<p><span class="rnd">${n.at?esc(dmy(n.at)):''}</span>${esc(s.length>420?s.slice(0,420)+'…':s)}</p>`;
    }).join('');
    nt.hidden=false;
  });
}

/* ---------- render ---------- */
let topicEls=[], T0, T1, SPAN;
const X=d=>(d3(d)-T0)/SPAN*100;

const SRC_HORIZON=document.querySelector('.src').innerHTML;
const SRC_ARENAS='Source: your arenas’ call dates on the Brokerage Semaphore, found by ChatGPT’s search or written by hand. A soft end is a date not yet published to the day, drawn over the time it can fall in — confirm on the call’s own page before acting.';
function render(){
  document.getElementById('tlaway').innerHTML='';
  if(MODE==='overview') return renderOverview();
  const arena=MODE==='arena';
  document.getElementById('legcolour').textContent=arena
    ?'colour = the arena’s type, as on the Semaphore · lighter = further off: full within 3 months, lighter beyond 6 and 12 · a soft end ≈ when it can fall, not yet published to the day'
    :'colour = call series · saturated tone = 2026 call, pale tone = 2027 call';
  document.getElementById('tltxt').textContent='Calls · chronological';
  document.querySelector('.src').innerHTML=arena?SRC_ARENAS:SRC_HORIZON;
  if(arena) clearArenaList(); else buildLedger();
  if(arena&&P.state.openArena&&!P.arenas.some(a=>a.id===P.state.openArena)) P.state.openArena=null;
  buildTimeline(); buildFamKey();
  const qEl=document.getElementById('q'); qEl.value=P.state.q;
  document.getElementById('qclr').style.display=P.state.q?'block':'none';
  document.querySelectorAll('.tchip').forEach(x=>x.setAttribute('aria-pressed',String(x.textContent===P.state.type)));
  /* An arena's tab is drawn again whenever the Semaphore saves, which may
     be a change made in its drawer lent over this very tab, so the arena
     that was open stays open rather than shut under the change. */
  if(arena) P.state.sel.forEach(id=>{ if(!P.callById[id]) P.state.sel.delete(id); });
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
        hzTopic(row,tp.id);
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

/* Every day a call's bar reaches, for the chart's span. An arena's call
   may be no more than an expected window, or an opening with no deadline
   recorded yet; a Horizon call is always an opening and one or two. */
const callDates=c=>[c.opening,c.d1,c.d2,c.annEnd].concat(c.sOpen||[],c.sD1||[],c.sD2||[]).filter(Boolean);
const rgba=(h,a)=>/^#[0-9a-f]{6}$/i.test(h)?'rgba('+[1,3,5].map(i=>parseInt(h.substr(i,2),16)).join(',')+','+a+')':h;
/* One call's bar, its stages and its two date tags, in the colours the
   chart asks for: a cluster's own chart wears the call series' colours,
   the overview the cluster's. The opening's tag is the cluster chart's
   alone. An arena's call adds three looks a Horizon call never needs: a
   soft band where a date not yet published to the day can fall (see
   softSpan), the bar running solid only between what is known, a soft
   band alone for a call only expected, and a bar fading out where no
   deadline is known. */
function barsHTML(c,X,col,ink,withOpen){
  let b='';
  const soft=(sp,dir)=>{ const a=X(sp[0]), w=Math.max(X(sp[1])-a,.8);
    const g=dir==='in'?`transparent,${col}`:dir==='out'?`${col},transparent`:`transparent,${col} 50%,transparent`;
    return `<span class="csoft" style="left:${a}%;width:${w}%;background:linear-gradient(90deg,${g})"></span>`; };
  if(c.annEnd){
    const a=X(c.opening), w=Math.max(X(c.annEnd)-a,.8);
    return soft([c.opening,c.annEnd],'both')+`<span class="dtag r" style="left:${a+w}%;color:${ink}">${c.tagEnd}</span>`;
  }
  /* where the solid bar starts and ends: past a soft opening, short of a
     soft deadline */
  const x0=c.opening?X(c.sOpen?c.sOpen[1]:c.opening):null, x1=c.d1?X(c.sD1?c.sD1[0]:c.d1):null;
  if(c.sOpen) b+=soft(c.sOpen,'in');
  if(x0!==null&&x1!==null)
    b+=`<span class="cbar${c.sD1?' sd':''}${c.sOpen?' so':''}" style="left:${x0}%;width:${Math.max(x1-x0,.8)}%;background:${col}"></span>`;
  else if(x0!==null) b+=`<span class="cbar fade" style="left:${x0}%;width:9%;--fc:${col}"></span>`;
  if(c.sD1) b+=soft(c.sD1,c.twoStage?'both':'out');
  if(x0!==null&&!c.sOpen) b+=`<span class="dot" style="left:${x0}%;background:${col};box-shadow:0 0 0 1px ${ink}"></span>`;
  if(x1!==null&&!c.sD1) b+=`<span class="cap" style="left:${x1}%;background:${ink}"></span>`;
  if(c.twoStage){
    const s1=X(c.sD1?c.sD1[1]:c.d1), s2=X(c.sD2?c.sD2[0]:c.d2);
    b+=`<span class="cbar2" style="left:${s1}%;width:${Math.max(s2-s1,.8)}%;background-color:${col}"></span>`;
    b+=c.sD2?soft(c.sD2,'out'):`<span class="cap" style="left:${X(c.d2)}%;background:${ink}"></span>`;
  }
  const last=c.twoStage?X(c.sD2?c.sD2[1]:c.d2):(x1!==null?X(c.sD1?c.sD1[1]:c.d1):x0);
  /* with no deadline known, the one tag already says when it opens */
  if(withOpen&&x0!==null&&x1!==null) b+=`<span class="dtag" style="left:${c.sOpen?X(c.sOpen[0]):x0}%;color:${ink||col}">${c.tagOpen||(dm(c.opening)+' ’'+yy(c.opening))}</span>`;
  b+=`<span class="dtag r" style="left:${last}%;color:${ink||col}">${c.tagEnd||(c.twoStage? dm(c.d1)+' → '+dm(c.d2)+' ’'+yy(c.d2) : dm(c.d1)+' ’'+yy(c.d1))}</span>`;
  return b;
}

function buildTimeline(){
  document.getElementById('tl').classList.remove('ov','windowed');
  /* a tab whose arenas have no dates yet still gets an axis: the year round today */
  const dates=P.calls.concat(P.trows||[]).flatMap(callDates).sort();
  if(!dates.length){ const t=todayISO(); dates.push(t.slice(0,4)+'-01-01',t.slice(0,4)+'-12-31'); }
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
     first January leaves room for it — and when today's tag does too. An
     arena's tab often opens the month before this one, and the year and
     "today" were printed over each other at the chart's left edge. */
  const todayAt=(new Date()-T0)/SPAN*100;
  if(!years.has(T0.getFullYear())&&firstJan>YEAR_LABEL_GAP&&!(todayAt>=0&&todayAt<YEAR_LABEL_GAP*1.6))
    axl+=`<div class="ylabel" style="left:0%">${T0.getFullYear()}</div>`;
  tl.innerHTML=`<div class="tl-axis"><div class="plot" style="top:0;bottom:0">${axl}</div></div><div class="tl-rows" id="tlrows"></div>`;
  tl.insertAdjacentHTML('afterbegin',`<div class="plot">${grid}</div>`);
  const rowsEl=document.getElementById('tlrows');
  ghostArenaRow(rowsEl);
  if(MODE==='arena'){ buildArenaRows(rowsEl); ghostText(rowsEl); }
  else P.calls.forEach(c=>{
    const r=document.createElement('div'); r.className='crow'; r.tabIndex=0; r.setAttribute('role','button');
    r.dataset.call=c.id; r.title=c.id;
    const b=barsHTML(c,X,c.color,c.ink,true);
    r.innerHTML=`<span class="lbl"><span class="cchip w" style="background:${c.color};color:${fg(c)}">${esc(c.short)}</span><span class="nm">${esc(c.name)}</span></span><span class="track">${b}</span>`;
    if(c.hz){ r.title+='\n'+c.hz.was; if(c.hz.fresh){ r.classList.add('fresh'); r.querySelector('.lbl').appendChild(hzSeenButton(c.hz.ids)); } }
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
/* An opening's tag and its deadline's, on a short bar, were printed over
   one another ("14 Oc 17 Feb ’27"). The opening's gives way, its dot
   still marking it. Measured, since a tag's width is the font's; a row
   measured while the room is out of sight has no width yet and is
   measured again when it is next lit or hovered. */
function untangle(row){
  if(row.dataset.tg) return;
  const g=row.querySelectorAll('.track .dtag');
  if(g.length<2) return;
  const a=g[0].getBoundingClientRect(), b=g[g.length-1].getBoundingClientRect();
  if(!b.width) return;
  row.dataset.tg='1';
  g[0].classList.toggle('clash',a.right+4>b.left);
}
document.getElementById('tl').addEventListener('mouseover',e=>{
  const r=e.target.closest&&e.target.closest('.crow'); if(r) untangle(r);
});

/* ---------- the freezer ----------
   Every arena put away has its calls on one chart, the Freezer's, the
   second tab beside All (Mark, issue 1, 2026-10-28), so a frozen arena
   whose call comes round again can be seen and thawed: each type's under
   its name, its tag frosted with a dashed edge, Thaw at the end of its
   first row. Before, the arenas put away stood as names under the calls
   of the tab they belonged to, behind one line that said how many
   (2026-10-25), with no dates; that line went when the Freezer had a tab
   of its own, so the freezer has one home. */
let FROZEN=[];

function toggleCall(id){
  const s=P.state.sel;
  s.has(id)?s.delete(id):s.add(id);
  if(s.size){topicEls.forEach(t=>{t.row.classList.remove('sel');t.det.classList.remove('open');});P.state.selTopicCall=null;}
  applyFilters(); paintTimeline(); paintPills(); showCard([...s]);
}
function soft(id){topicEls.forEach(t=>t.row.classList.toggle('dim', !!id && t.call!==id));}

function applyFilters(){
  const st=P.state; let visible=0; const perDest=new Map();
  if(P.arena){
    /* An arena's tab has no list (see clearArenaList): the words typed
       keep the chart's rows whose arena or call they name. */
    document.querySelectorAll('#tlrows > .arow, #tlrows > .aopen').forEach(r=>{
      const hit=!st.q||r.dataset.search.includes(st.q);
      r.classList.toggle('hidden',!hit);
      if(!hit) return;
      if(r.classList.contains('aopen')) visible+=r.querySelectorAll('.aorow').length;
      else if(r.dataset.call&&(!st.sel.size||st.sel.has(r.dataset.call))) visible++;
    });
    paintTypeHeads();
    const away=paintElsewhere(visible);
    document.getElementById('count').textContent=(st.sel.size||st.q)
      ?`${visible} of ${P.nTopics} calls`+(away?` · ${away} in other tabs`:''):'';
    return;
  }
  topicEls.forEach(t=>{
    const hit=!st.q||t.row.dataset.search.includes(st.q)||(FULLTEXT&&inFull(t.row.dataset.id,st.q));
    const show=(!st.sel.size||st.sel.has(t.call)) && (!st.type||t.type===st.type) && hit;
    t._show=show;
    t.row.classList.toggle('hidden',!show); t.row.classList.remove('dim');
    if(!show) t.det.classList.remove('open');
    if(show) visible++;
    if(!t.dest) return;   /* an arena's calls stand under no destination */
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
     is a count Mark does not want in the beam, the tabs having lost theirs
     on his word (2026-10-28). */
  document.getElementById('count').textContent=(st.sel.size||st.type||st.q)
    ?`${visible} of ${P.nTopics} ${P.unit||'topics'}`+(away?` · ${away} in other tabs`:''):'';
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
    if(!n){const cap=document.createElement('div'); cap.className='theme-h'; cap.textContent='In the other tabs';
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
  /* The arenas' calls are found by the arena's name and the call's. A type
     of action says nothing about them, so a type chip leaves them out. A
     press opens their tab with the same words in the box, the call open. */
  if(!st.type) APAGES.forEach(p=>{
    if(p===P||!p.tabEl) return;
    const hits=p.calls.filter(c=>(c.arena.name+' '+c.run.names.join(' ')).toLowerCase().includes(st.q));
    if(!hits.length) return;
    if(!n){const cap=document.createElement('div'); cap.className='theme-h'; cap.textContent='In the other tabs';
      elsewhereEl.appendChild(cap);}
    n+=hits.length;
    const h=document.createElement('div'); h.className='dest-h'; h.tabIndex=0; h.setAttribute('role','button');
    h.innerHTML=`<span class="dnum" style="opacity:1"><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${p.clusterColor}"></span></span>
      <span class="dname">${p.key} · ${p.label}</span><span class="dcount">${hits.length} of ${p.calls.length} calls</span>`;
    h.title='Open '+p.full;
    h.addEventListener('click',()=>selectArenaTab(p.key));
    h.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectArenaTab(p.key);}});
    elsewhereEl.appendChild(h);
    hits.forEach(c=>{
      const row=arenaRow(Object.assign({},c,{first:false}));
      const go=()=>selectArenaTab(p.key,c.id);
      row.addEventListener('click',go);
      row.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}});
      elsewhereEl.appendChild(row);
    });
  });
  if(!n&&!visible){const e=document.createElement('div'); e.className='empty';
    e.textContent='Nothing in any tab matches this search.'; elsewhereEl.appendChild(e);}
  return n;
}
/* Calls picked by hand light and the rest dim; an arena opened dims the
   rows outside it. */
function paintTimeline(){
  const st=P.state, open=MODE==='arena'&&!!st.openArena;
  const focus=st.sel.size?st.sel:(st.selTopicCall?new Set([st.selTopicCall]):null);
  document.querySelectorAll('#tl .crow').forEach(r=>{
    if(r.classList.contains('ghost')) return;
    const on=!!focus&&focus.has(r.dataset.call);
    r.classList.toggle('on',on);
    r.classList.toggle('dim',(!!focus&&!on)||(open&&r.classList.contains('arow')));
    if(on||r.classList.contains('aorow')) untangle(r);
  });
  paintTypeHeads();
}
/* a type's name over the arenas of that type goes when none of them shows */
function paintTypeHeads(){
  let h=null, any=false;
  const end=()=>{ if(h) h.classList.toggle('folded',!any); };
  document.querySelectorAll('#tlrows > .tyh, #tlrows > .typed').forEach(el=>{
    if(el.classList.contains('tyh')){ end(); h=el; any=false; return; }
    if(!el.classList.contains('hidden')) any=true;
  });
  end();
}
function paintPills(){
  const p=document.getElementById('pills'); p.innerHTML='';
  [...P.state.sel].map(id=>P.callById[id]).filter(Boolean).sort((a,b)=>(a.opening||'').localeCompare(b.opening||'')).forEach(c=>{
    const el=document.createElement('span'); el.className='pill'; el.style.background=c.color; el.style.color=fg(c);
    el.innerHTML=`${esc(c.short)}<button>✕</button>`;
    el.querySelector('button').setAttribute('aria-label','Remove '+c.short);
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
  const list=ids.map(id=>P.callById[id]).filter(Boolean).sort((a,b)=>(a.opening||'').localeCompare(b.opening||''));
  if(!list.length){el.innerHTML='';return;}
  /* An arena's call has no topics or budget here, only its dates, and
     those stand on its bar as it is hovered; said again under the chart
     they were only said twice (2026-10-25). */
  if(list[0].arena){el.innerHTML='';return;}
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
/* A topic's text is the Topic Atlas's (Mark, 2026-10-29): one copy,
   checked against the portal when it was built, which this room's reader,
   its full-text search, CoProg's rows and the Atlas switch all read
   (topic-atlas/topics.js). The Board's own copy of the Commission's prose
   went with it: some of its topics carried another topic's text, one of
   them a quantum-computing call under a Galileo topic, which the Topic
   Atlas had set aside. The file is five megabytes, so it is fetched in the
   background once this room is built, never at the app's load, and a
   topic opened before it arrives says so and fills in when it does (Mark
   chose that wait over a heavier start). Its shape here is the one the
   old file had: o and s the Expected Outcome's and the Scope's
   paragraphs, x the other sections, c the conditions, and a note where
   the text was set aside. */
let DESC={}, TEXTS='wait';
function textsArrived(){
  if(!window.TOPIC_ATLAS_DATA){ TEXTS='none'; return; }
  DESC={};
  window.TOPIC_ATLAS_DATA.topics.forEach(t=>{
    const cap=w=>String(w||'').charAt(0).toUpperCase()+String(w||'').slice(1);
    DESC[t.id]={o:t.s.outcome||[],s:t.s.scope||[],
      x:(t.x||[]).map(x=>[x.name,x.paras||[]]).concat((t.tr||[]).filter(r=>r.reason==='footnotes'&&r.paras&&r.paras.length).map(r=>[cap(r.reason),r.paras])),
      c:(t.ct||[]).map(c=>[c.label,c.text]),
      note:(t.fl||[]).filter(f=>f.kind==='text-mismatch').map(f=>f.note).join(' ')};
  });
  TEXTS='here'; FULLIDX=null; COPROG_SENT=null;
}
const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
/* the same, for a value standing inside an attribute's quotes: an address
   a search brought may carry a quote mark of its own */
const attr=s=>esc(s).replace(/"/g,'&quot;');
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
    +row('Portal',(r=>!r?'':r.diff==='gone'?'No longer on the portal'
      :r.diff==='moved'?'Moved to '+esc(r.moved_to||''):call.hz?esc(call.hz.was):'')(HZ.rows.get(topic.id)))
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
  RD_ID=topic.id; RD_BACK=null; readerNotices(topic.id);
  const body=document.getElementById('rdbody');
  if(!d||(d.note&&!d.o.length&&!d.s.length)||!(d.o.length||d.s.length||d.x.length||d.c.length)){
    body.innerHTML=TEXTS==='wait'?'<p class="rdwait">Reading the topics’ texts…</p>'
      :TEXTS==='none'?'<p>The topics’ texts are in the folder topic-atlas beside the app, which this copy of the app does not have.</p>'
      :d&&d.note?`<p>The work programme printed another action’s text under this topic, so it is set aside: ${esc(d.note)}</p><p>Read the topic on the portal.</p>`
      :'<p>No full text could be extracted for this topic.</p>';
  }
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
  slideReader();
  return true;
}
function slideReader(){
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
}
function closeReader(){
  const back=RD_BACK; RD_BACK=null;
  if(back&&JUDGE.on) setTimeout(back,0);
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
  if(OV.sel.size) return everyCall().filter(c=>OV.sel.has(c.id));
  return everyCall().filter(c=>OV.clusters.has(c.cluster) && inSpan(c));
}
const topicsOf=c=>TOPICS_BY_CALL[c.id]||[];   /* an arena's call has none here */
const callKey=c=>c.d1||c.opening||c.annEnd||'';

function renderOverview(){
  const qEl=document.getElementById('q'); qEl.value=OV.q;
  document.getElementById('qclr').style.display=OV.q?'block':'none';
  document.querySelectorAll('#typechips .tchip').forEach(x=>x.setAttribute('aria-pressed',String(x.textContent===OV.type)));
  document.getElementById('legcolour').textContent='colour = cluster · saturated tone = 2026 call, pale tone = 2027 call · window matches first-stage deadlines; stage-2 tails are shown but never selected';
  document.getElementById('tltxt').innerHTML='All calls · <span>drag the date axis to set a window</span>';
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
    document.querySelectorAll('#arrangeseg button').forEach(b=>b.addEventListener('click',()=>{
      OV.arrange=b.dataset.v; renderOverview();}));
    document.querySelectorAll('#groupseg button').forEach(b=>b.addEventListener('click',()=>{
      OV.group=b.dataset.v; buildOvControls(); buildOvLedger(); paintOv();}));
  }
  document.querySelectorAll('#presets .pchip').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.k===OV.preset)));
  /* A chip for every tab with calls in it, the arenas' tabs after the
     clusters; drawn afresh each time, as the arenas' tabs come and go. */
  const cc=document.getElementById('cchips'); cc.innerHTML='';
  allPages().filter(p=>!p.arena||p.tabEl).forEach(p=>{
    const b=document.createElement('button'); b.className='clchip'; b.dataset.k=p.key;
    b.innerHTML=`<i style="background:${p.clusterColor}"></i>${p.key}`;
    b.title=p.full+' — click to filter, double-click to open that tab';
    b.addEventListener('click',()=>{
      OV.clusters.has(p.key)?OV.clusters.delete(p.key):OV.clusters.add(p.key);
      if(!OV.clusters.size) allPages().forEach(x=>OV.clusters.add(x.key));
      renderOverview();
    });
    b.addEventListener('dblclick',()=>p.arena?selectArenaTab(p.key):selectPage(PAGES.indexOf(p)));
    cc.appendChild(b);
  });
  document.querySelectorAll('#cchips .clchip').forEach(b=>{
    const on=OV.clusters.has(b.dataset.k);
    b.setAttribute('aria-pressed',String(on)); b.classList.toggle('off',!on);
  });
  document.querySelectorAll('#arrangeseg button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===OV.arrange)));
  document.querySelectorAll('#groupseg button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===OV.group)));
  const scope=ovScope();
  const nT=scope.reduce((a,c)=>a+topicsOf(c).length,0);
  const bud=scope.reduce((a,c)=>a+c.budget,0);
  document.getElementById('spanread').innerHTML=
    `${dmy(OV.from)} → ${dmy(OV.to)} <span class="sub">· ${scope.length} calls · ${nT} topics · €${bud.toFixed(0)}M</span>`;
}

/* ---------- the chronological chart, and dragging its ends ---------- */
function buildOvTimeline(){
  const dates=everyCall().flatMap(callDates).concat([OV.from,OV.to]).sort();
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
    ? allPages().filter(p=>p.calls.length&&(!p.arena||p.tabEl)).map(p=>({label:p.key+' · '+p.label, color:p.clusterColor, page:p,
                     calls:p.calls.slice().sort((a,b)=>callKey(a).localeCompare(callKey(b)))}))
    : [{label:null, calls:everyCall().slice().sort((a,b)=>callKey(a).localeCompare(callKey(b))||a.id.localeCompare(b.id))}];

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
  r.dataset.call=c.id; r.title=c.arena?c.arena.name+' — '+c.run.names.join(', '):c.id+' — '+c.name;
  const b=barsHTML(c,OX,c.ovColor,c.ovInk,false);
  const lbl = OV.arrange==='cluster'
    ? `<span class="cchip w${c.arena?' achip':''}" style="background:${c.ovColor};color:${ovFg(c)}">${esc(c.short)}</span><span class="nm">${esc(c.name)}</span>`
    : `<span class="cchip${c.arena?' achip':''}" style="background:${c.ovColor};color:${ovFg(c)}">${c.cluster} ${esc(c.short)}</span><span class="nm">${esc(c.name)}</span>`;
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
  const keyDate=callKey;
  let shown=0, shownCalls=0;
  /* An arena's call has no topics under it here, so it stands as its
     heading alone, and opens its own tab with the call open. A type of
     action says nothing about it, so a type chip leaves it out. */
  const arenaHdr=c=>{
    if(OV.type) return;
    if(OV.q&&!(c.arena.name+' '+c.run.names.join(' ')).toLowerCase().includes(OV.q)) return;
    const hd=document.createElement('div'); hd.className='callhdr';
    hd.innerHTML=`<span class="clk" style="background:${c.ovColor};color:${ovFg(c)}">${c.cluster} ${esc(c.short)}</span>
      <span class="cname">${esc(c.name)}</span>
      <span class="cdl${c.unc?' unc':''}">${esc(c.tagEnd)}</span>
      <span class="cmeta">${c.tagOpen?(c.annEnd?'expected ':'opens ')+esc(c.tagOpen):''}</span>`;
    hd.title='Open '+c.cluster+' — '+c.arena.name;
    hd.addEventListener('click',()=>selectArenaTab(c.cluster,c.id));
    ledger.appendChild(hd); shownCalls++;
  };

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
      if(c.arena) return arenaHdr(c);
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
    APAGES.forEach(p=>{
      const cs=p.calls.filter(c=>inScope.has(c.id)); if(!cs.length) return;
      const h=document.createElement('div'); h.className='dest-h';
      h.innerHTML=`<span class="dnum" style="opacity:1"><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${p.clusterColor}"></span></span>
        <span class="dname">${p.key} · ${p.label}</span><span class="dcount">${cs.length} calls closing</span>`;
      h.title='Open '+p.full; h.style.cursor='pointer';
      h.addEventListener('click',()=>selectArenaTab(p.key));
      ledger.appendChild(h);
      const before=shownCalls;
      cs.sort((a,b)=>keyDate(a).localeCompare(keyDate(b))).forEach(arenaHdr);
      if(shownCalls===before) h.remove();
    });
  }

  if(!shown&&!shownCalls){
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
  const every=everyCall();
  document.querySelectorAll('#tlrows .crow').forEach(r=>{
    const c=every.find(x=>x.id===r.dataset.call); if(!c) return;
    const cluOn=OV.clusters.has(c.cluster);
    const on = pinned.size ? pinned.has(c.id) : (cluOn && inSpan(c));
    r.classList.toggle('on', !!pinned.size && pinned.has(c.id));
    r.classList.toggle('out', !on);
  });
  if(quick) return;
  const p=document.getElementById('pills'); p.innerHTML='';
  [...pinned].map(id=>every.find(c=>c.id===id)).filter(Boolean).sort((a,b)=>callKey(a).localeCompare(callKey(b))).forEach(c=>{
    const el=document.createElement('span'); el.className='pill'; el.style.background=c.ovColor; el.style.color=c.ovInk;
    el.innerHTML=`${c.cluster} ${esc(c.short)}<button aria-label="Unpin">✕</button>`;
    el.querySelector('button').addEventListener('click',()=>{OV.sel.delete(c.id);buildOvControls();buildOvLedger();paintOv();});
    p.appendChild(el);
  });
  if(pinned.size>1){
    const ca=document.createElement('button'); ca.className='pill clearall'; ca.textContent='unpin all';
    ca.addEventListener('click',()=>{OV.sel.clear();buildOvControls();buildOvLedger();paintOv();});
    p.appendChild(ca);
  }
  const scope=ovScope();
  const nT=scope.reduce((a,c)=>a+topicsOf(c).length,0);
  const first=scope.map(c=>c.d1).filter(Boolean).sort()[0];
  const el=document.getElementById('selcard');
  el.innerHTML = scope.length
    ? `<span><span class="k">${scope.length}</span> calls take submissions in this window</span>
       ${first?`<span>next deadline <span class="k">${dmy(first)}</span></span>`:''}
       <span><span class="k">${nT}</span> topics</span>
       <span><span class="k">€${scope.reduce((a,c)=>a+c.budget,0).toFixed(0)}M</span></span>
       ${pinned.size?'<span>pinned calls override the window</span>':''}`
    : '<span>No submission deadlines fall in this window.</span>';
  document.getElementById('famkey').innerHTML='';
}

/* ===================== the Topic Atlas inside the Board =====================
   Topics | Atlas, beside the box (Mark, agreed 2026-10-24, built
   2026-10-29; drawn on the canvas "The Call Board, Grown", section 8).
   Switched to Atlas, what is typed becomes keywords, each given with Enter
   as in the Topic Atlas, read as the Topic Atlas reads them, and every call
   is searched whichever tab is open: the Horizon topics, and the arenas'
   calls whose official text is kept. The Horizon topics are the Topic
   Atlas's own, its texts checked against the portal and the ideas its
   build found in them, and the ranking is its own engine with its
   libraries: the files its page reads (topic-atlas/topics.js,
   textutil.js, scorer.js and library.js), so a keyword ranks the topics
   here as it does there. The Board's own copies of the texts were tried
   first and were not good enough: one topic's carried another topic's
   text, which the Topic Atlas had put right, and it came fourth for
   "digital twin" and "manufacturing". The results are drawn as the Topic Atlas draws them, adjusted
   to the Board (Mark, 8.5): its card at the full width, because in the
   sheet's half its lines were cut and the label where the keywords meet
   spilled over the chart; the call's chip on each card; and over them a
   strip of when, each result a numbered dot at its deadline, which brings
   its card into view. Of its rail only the filters stay, folded behind one
   Filters button, and the tuning stays on the Topic Atlas's defaults with
   no control for it (Mark, 2026-10-24). A plain program, as Mark wants it:
   nothing here asks Claude what a text means.

   The four files are fetched once this room is built, as plain scripts
   beside the app, never at the app's load: the topics alone are five
   megabytes, and a copy of the app without the folder topic-atlas (the
   single-file build) still starts, and says so here.
   An arena's call text is not in the Topic Atlas, so which idea it names
   is read here, once: the longest of an idea's names that starts at a
   word wins, in the three spellings Mark's Place reads with. A tab
   pressed leaves Atlas for that tab; the keywords stay, on this device,
   for the next time. */
const TA={on:false,chips:[],off:{},filt:{when:'upcoming',until:'',where:[],types:[]},fopen:false,
  loading:false,failed:false,shown:40,expanded:new Set(),openSnips:new Set(),openNbrs:new Set(),last:null,
  LIB:null,TU:null,C:null,FIND:null,HZR:null,R:null,S:null,stats:null};
const TAKEY='callboard.atlas';
try{
  const s=JSON.parse(localStorage.getItem(TAKEY)||'null');
  if(s){
    if(Array.isArray(s.chips)) TA.chips=s.chips.filter(x=>typeof x==='string');
    if(s.off&&typeof s.off==='object') TA.off=s.off;
    if(s.filt&&typeof s.filt==='object') Object.assign(TA.filt,s.filt);
  }
}catch(e){ /* storage unavailable: start fresh */ }
function taSave(){ try{ localStorage.setItem(TAKEY,JSON.stringify({chips:TA.chips,off:TA.off,filt:TA.filt})); }catch(e){} }
const TAFILES={'library.js':'TOPIC_LIBRARY','textutil.js':'TextUtil','scorer.js':'Scorer','topics.js':'TOPIC_ATLAS_DATA'};
const taCan=()=>Object.values(TAFILES).every(k=>!!window[k]);
/* the Topic Atlas's files, one after another, each as a plain script */
const TAWAIT=[];
function taLoad(done){
  if(taCan()||TA.failed) return done();
  TAWAIT.push(done);
  if(TA.loading) return;
  TA.loading=true;
  const files=Object.keys(TAFILES).filter(f=>!window[TAFILES[f]]);
  const end=failed=>{ TA.loading=false; TA.failed=failed; TAWAIT.splice(0).forEach(f=>f()); };
  const next=()=>{
    const f=files.shift();
    if(!f) return end(!taCan());
    const el=document.createElement('script'); el.src='../topic-atlas/'+f;
    el.onload=next; el.onerror=()=>end(true);
    document.body.appendChild(el);
  };
  next();
}
const TASECS=['title','outcome','scope','intro'];
const TASEC={title:['T','Title'],outcome:['O','Expected Outcome'],scope:['S','Scope'],intro:['I','Where it sits']};
const TAAXN={method:'method / expertise',domain:'application domain',text:'the words themselves'};
const TARELN={broader:'broader',narrower:'narrower',related:'related'};
const TALVL={title:'both in the title',joined:'joined',same:'same sentence',next:'next sentence'};
const TALVLT={title:'the title names both: counts as joined',joined:'joined: one sentence, few words between, not two items of a list',
  same:'in the same sentence, not joined',next:'in the next sentence'};
const TAEX=['digital twins','batteries','machine learning, healthcare','climate adaptation','cybersecurity','photonics','process mining'];
const taF2=x=>(+x).toFixed(2);
const taG=()=>window.Scorer||{MTG:{},MTT:{},RELG:{},DEFAULTS:{step:{},weights:{},cap:2}};

/* the ideas a text is read for: each name an idea is found by, three
   ways, as Mark's Place reads them (`vocab` there): as words made singular,
   as written for a name marked "=" in the library (arts is not art), and
   in capitals for an acronym (ML, LCA, EV) */
function taInit(){
  if(TA.FIND) return true;
  if(!taCan()) return false;
  const L=window.TOPIC_LIBRARY; TA.LIB=L;
  TA.TU=window.TextUtil.make((L.methods.meta||{}).irregular||{});
  TA.C=new Map(); [L.methods,L.domains].forEach(lib=>lib.concepts.forEach(c=>TA.C.set(c.id,c)));
  const F={n:{},l:{},c:{}};
  TA.C.forEach(c=>(c.extract||[]).concat(c.added||[]).forEach(a=>{
    let mode='n', k;
    if(a[0]==='='){ mode='l'; k=TA.TU.tokens(a.slice(1)).map(t=>t.l); }
    else if(/^[A-Z0-9][A-Z0-9\-]{1,7}s?$/.test(a)&&/[A-Z]/.test(a)){ mode='c'; k=TA.TU.tokens(a).map(t=>t.c); }
    else k=TA.TU.tokens(a).map(t=>t.n);
    if(!k.length) return;
    const list=F[mode][k[0]]||(F[mode][k[0]]=[]), key=k.join(' ');
    const had=list.find(x=>x.key===key);
    if(had){ if(!had.ids.includes(c.id)) had.ids.push(c.id); } else list.push({key,k,ids:[c.id]});
  }));
  TA.FIND=F;
  return true;
}
/* one record's ideas, each with the places it is named, in the shape the
   Topic Atlas's records carry them */
function taConcepts(sections){
  const out=new Map();
  TASECS.forEach(sec=>(sections[sec]||[]).forEach((para,p)=>{
    const tk=TA.TU.tokens(para.text);
    for(let i=0;i<tk.length;i++){
      let best=null;
      for(const mode of ['n','l','c']) for(const x of TA.FIND[mode][tk[i][mode]]||[]){
        if((best&&x.k.length<=best.k.length)||i+x.k.length>tk.length) continue;
        let ok=true;
        for(let j=1;j<x.k.length;j++) if(tk[i+j][mode]!==x.k[j]){ ok=false; break; }
        if(ok) best=x;
      }
      if(!best) continue;
      const s=tk[i].s, e=tk[i+best.k.length-1].e;
      best.ids.forEach(c=>{
        const key=c+'|'+sec;
        const o=out.get(key)||out.set(key,{c,axis:TA.C.get(c).axis,sec,n:0,hits:[]}).get(key);
        o.n++; o.hits.push({p,s,e,ph:para.text.slice(s,e)});
      });
      i+=best.k.length-1;
    }
  }));
  return [...out.values()];
}
const taPara=t=>({text:String(t),boiler:[]});
/* The Topic Atlas's topics, unpacked as its page unpacks them (they travel
   compact), each joined to the Board's own topic and call, whose dates the
   nightly Horizon check keeps; a topic the Board lacks keeps the Topic
   Atlas's. Unpacked once, then kept. */
function taHorizon(){
  if(TA.HZR) return TA.HZR;
  TA.HZR=window.TOPIC_ATLAS_DATA.topics.map(t=>{
    const sections={};
    TASECS.forEach(sec=>{
      const b=(t.b&&t.b[sec])||[];
      sections[sec]=(t.s[sec]||[]).map((text,p)=>({text,boiler:b.filter(x=>x[0]===p).map(x=>[x[1],x[2]])}));
    });
    const concepts=t.k.filter(([c])=>TA.C.has(c)).map(([c,si,n,flat])=>{
      const sec=TASECS[si], hits=[];
      for(let i=0;i<flat.length;i+=3) hits.push({p:flat[i],s:flat[i+1],e:flat[i+2],ph:sections[sec][flat[i]].text.slice(flat[i+1],flat[i+2])});
      return {c,axis:TA.C.get(c).axis,sec,n,hits};
    });
    const f=t.f, b=TOPIC_BY_ID[t.id], fc=f.call||{};
    const call=b?b.call:{id:fc.id||'',short:shortTopicId(fc.id||''),color:NO_TONE,ink:'#2C2418',
      opening:fc.opening,d1:fc.deadline,d2:fc.deadline2,twoStage:!!fc.twoStage};
    return {id:t.id,kind:'topic',title:t.title,f,board:b?b.topic:null,call,sections,concepts,
      extra:t.x||[],conds:t.ct||[],cancelled:!!(f.status&&f.status.cancelled)};
  });
  return TA.HZR;
}
/* An arena's call with its official text kept: the text's sections as the
   Topic Atlas's parts, those about what is expected as its Expected
   Outcome and the rest as its Scope, the order and headings kept for the
   reader. The Freezer's stay out, as from every search on the Board. */
function taArenas(){
  const out=[];
  ACALLS.forEach(c=>{
    const t=keptText(c); if(!t) return;
    const sections={title:[taPara(t.title||c.name)],outcome:[],scope:[],intro:[]}, disp=[];
    (t.sections||[]).forEach(x=>{
      const sec=/outcome|objective|impact|expected/i.test(x.h||'')?'outcome':'scope';
      (x.p||[]).forEach(p=>{ disp.push({h:x.h||'',sec,i:sections[sec].length}); sections[sec].push(taPara(p)); });
    });
    out.push({id:c.id,kind:'call',title:t.title||c.name,c,t,disp,sections,concepts:taConcepts(sections)});
  });
  return out;
}
/* the engine over every record, made again when the arenas or their texts
   change; a concept's rarity is counted over these records */
function taEngine(){
  if(TA.S) return TA.S;
  if(!taInit()) return null;
  const H=taHorizon(), A=taArenas(), R=H.concat(A);
  /* rarity as the Topic Atlas counts it, its call texts added */
  const df=Object.assign({},window.TOPIC_ATLAS_DATA.stats.df);
  A.forEach(r=>new Set(r.concepts.map(o=>o.c)).forEach(c=>{ df[c]=(df[c]||0)+1; }));
  TA.R=R; TA.stats={N:window.TOPIC_ATLAS_DATA.stats.N+A.length,df};
  TA.S=window.Scorer.create({libraries:TA.LIB,stats:TA.stats,records:R},TA.TU);
  return TA.S;
}
function taStale(){ TA.S=null; TA.R=null; if(TA.on) taRender(); }

/* where a record stands: its tab or tabs (a co-programmed partnership's
   topic is in its cluster's and in CoProg), its type, its first deadline,
   and whether it is closed (the portal no longer having a topic closes it) */
const taTabs=r=>r.kind==='topic'?[r.board?r.board.page.key:r.f.part.key].concat(COPROG_OF[r.id]?['CoProg']:[]):[r.c.cluster];
const taDl=r=>r.kind==='topic'?r.call.d1:(r.c.d1||null);
const taGone=r=>{ if(r.kind!=='topic') return false; const h=HZ.rows.get(r.id); return r.cancelled||(!!h&&h.diff==='gone'); };
const taClosed=r=>taGone(r)||(!!taDl(r)&&taDl(r)<todayISO());
const TAPRED={
  when:r=>TA.filt.when==='all'||!taClosed(r),
  until:r=>!TA.filt.until||(!!taDl(r)&&taDl(r)<=TA.filt.until),
  where:r=>!TA.filt.where.length||taTabs(r).some(k=>TA.filt.where.includes(k)),
  types:r=>!TA.filt.types.length||(r.kind==='topic'&&TA.filt.types.includes((r.f.actionType||{}).code||''))};
const taPasses=(r,except)=>Object.keys(TAPRED).every(k=>k===except||TAPRED[k](r));
const taFiltN=()=>[TA.filt.when!=='upcoming',!!TA.filt.until,TA.filt.where.length>0,TA.filt.types.length>0].filter(Boolean).length;

/* ── the page of results ── */
function taRender(){
  const el=document.getElementById('taview'), cnt=document.getElementById('count');
  taFiltersPaint();
  if(!taCan()){
    cnt.textContent='';
    if(TA.failed){ el.innerHTML='<div class="taempty"><h2>The Topic Atlas is not beside the app.</h2><p>The switch reads with the Topic Atlas’s own files, in the folder topic-atlas beside one-app. This copy of the app has none.</p></div>'; return; }
    el.innerHTML='<div class="taempty"><h2>Reading the Topic Atlas…</h2></div>';
    taLoad(()=>{ if(TA.on) taRender(); });
    return;
  }
  if(!TA.chips.length){
    TA.last=null; cnt.textContent='';
    const n=ACALLS.filter(c=>keptText(c)).length;
    el.innerHTML=`<div class="taempty"><h2>Which calls fit a researcher?</h2>
      <p>Type what the researcher works on — a method, an application, a technology — and press <b>Enter</b>, each keyword in turn. Every keyword has to be answered.</p>
      <p>Each keyword is read as ideas from the Topic Atlas’s two libraries, <span class="cnode a-method">methods &amp; expertise</span> and <span class="cnode a-domain">application domains</span>, and every call is searched, whichever tab is open: the Topic Atlas’s ${window.TOPIC_ATLAS_DATA.topics.length} Horizon topics, and the arenas’ calls whose official text is kept (${n} now). A topic’s code pins that topic.</p>
      <div class="sugg">${TAEX.map(s=>`<button class="chip" data-try="${attr(s)}">${esc(s)}</button>`).join('')}</div></div>`;
    taWire(el,null); return;
  }
  const S=taEngine(), R=TA.R;
  const res=S.search(TA.chips,{off:TA.off}); TA.last=res;
  const all=res.list, list=all.filter(e=>taPasses(R[e.ti]));
  const closedHidden=TA.filt.when==='upcoming'?all.filter(e=>taClosed(R[e.ti])&&taPasses(R[e.ti],'when')).length:0;
  const other=all.length-list.length-closedHidden;
  let h=`<div class="tamap">${taMappingHTML(res)}</div>`;
  h+=`<div class="rescount"><span>${all.length} reached${TA.chips.length>1?' (every keyword required)':''}</span>`
    +(closedHidden?`<span>· ${closedHidden} closed <button class="act" data-showclosed>show them</button></span>`:'')
    +(other>0?`<span>· ${other} outside the filters</span>`:'')+`</div>`;
  if(!list.length){
    h+='<div class="taempty"><h2>Nothing to show.</h2>'+(!all.length
      ?(res.perChip.some(pc=>!pc.entries.length&&!pc.codes.length&&!pc.text)
        ?'<p>A keyword found nothing — the line above says what it might have meant.</p>'
        :`<p>Every keyword was read, but no call answers all of them${TA.chips.length>1?'. Remove one, or switch a reading back on in the line above':''}.</p>`)
      :`<p>The filters hide all ${all.length}. <button class="sbtn" data-freset>clear the filters</button></p>`)+'</div>';
  } else {
    const shown=list.slice(0,TA.shown), maxScore=Math.max(...list.map(e=>e.score),1e-9), sw=taSectionWidths(shown);
    h+=taWhenHTML(shown);
    h+=`<div class="taresults" style="--ww:${sw.ww}px;--mw:${sw.mw}px">${shown.map((e,i)=>taCardHTML(e,i+1,maxScore,res)).join('')}`
      +(list.length>TA.shown?`<div style="margin:8px 4px"><button class="sbtn" data-moreres>show ${Math.min(40,list.length-TA.shown)} more</button> <span class="hint">of ${list.length-TA.shown} further down</span></div>`:'')+`</div>`;
  }
  el.innerHTML=h;
  cnt.textContent=list.length?`${list.length} found · every tab`:'';
  taWire(el,res);
}

/* how each keyword was read: its ideas, any switched off, the ideas one
   step away; one no idea answers is looked for as its words */
function taCnode(id,landing,extra){
  const c=TA.C.get(id);
  return `<span class="cnode a-${c.axis}${landing?' landing':''}${extra||''}" title="${attr(taConceptTitle(id))}">${esc(c.label)}</span>`;
}
function taConceptTitle(id){
  const c=TA.C.get(id); if(!c) return '';
  const an=c.anchors||{}, anch=[...(an.msc||[]),...(an.ccs||[]),...(an.arxiv||[])].slice(0,4).join(' · ');
  const df=TA.stats.df[id]||0;
  return `${TAAXN[c.axis]} concept · named in ${df} of ${TA.stats.N} texts here (idf ${taF2(TA.S.idf(id))})`+(anch?` · ${anch}`:'')+(c.note?` — ${c.note}`:'');
}
function taMappingHTML(res){
  const G=taG();
  return res.perChip.map((pc,ci)=>{
    let h=`<div class="maprow"><span class="q">${esc(pc.q)}</span><span class="arrow">→</span>`;
    if(pc.entries.length){
      h+=pc.entries.map(e=>`<span class="ment" data-toggle="${ci}|${attr(e.c)}" title="${attr(G.MTT[e.mt]+(e.mt!=='exact'&&e.mt!=='alias'?` — via “${e.via}”`:'')+(e.off?' · switched off: click to use it again':' · click to switch this reading off'))}">`
        +`<span class="pmt">${G.MTG[e.mt]}</span>${taCnode(e.c,true,e.off?' off':'')}`
        +(e.mt!=='exact'&&e.mt!=='alias'?`<span class="via">via “${esc(e.via)}”</span>`:'')+`</span>`).join(' ');
      const nb=pc.reachedList.filter(r=>r.d>0);
      if(nb.length) h+=` <button class="more" data-nbrs="${ci}">${TA.openNbrs.has(ci)?'hide':'+'} ${nb.length} concept${nb.length===1?'':'s'} one step away</button>`;
    } else if(pc.codes.length){
      h+=`<span class="reach">topic code — ${pc.codes.length} topic${pc.codes.length===1?'':'s'} pinned to the top</span>`;
    } else if(pc.text){
      h+=`<span class="cnode a-text landing" title="${attr(G.MTT.text)}">¶ “${esc(pc.text.nm)}”</span><span class="reach">in neither library — the words themselves, found in ${pc.text.df} text${pc.text.df===1?'':'s'}</span>`;
    } else {
      const sug=TA.S.matchChip(pc.q,2).entries.slice(0,6);
      h+=`<span class="reach" style="color:var(--danger)">no concept and no text answers this</span>`
        +(sug.length?` <span class="reach">· did you mean</span> ${sug.map(e=>`<button class="chip" data-swap="${ci}" data-to="${attr(TA.C.get(e.c).label)}">${esc(TA.C.get(e.c).label)}</button>`).join(' ')}`:'');
    }
    h+='</div>';
    if(TA.openNbrs.has(ci)&&pc.entries.length){
      const st=G.DEFAULTS.step, nb=pc.reachedList.filter(r=>r.d>0).map(r=>({r,cost:r.path.reduce((f,s)=>f*st[s.rel],1)}))
        .sort((a,b)=>b.cost-a.cost||TA.C.get(a.r.c).label.localeCompare(TA.C.get(b.r.c).label));
      h+=`<div class="nbrs">${nb.map(({r,cost})=>`<span class="nb" title="${attr(r.path.map(s=>TARELN[s.rel]+(s.note?' — '+s.note:'')).join(' → '))}">`
        +`<span class="prel">${r.path.map(s=>G.RELG[s.rel]).join('')}</span>${taCnode(r.c)}<span class="cost">×${taF2(cost)}</span></span>`).join('')}</div>`;
    }
    return h;
  }).join('');
}

/* when: every result shown, a numbered dot at its first deadline, over the
   months from the earliest of them (or today) to the last; a press brings
   its card into view. An arena's call with no deadline yet stands where it
   is expected, or opens; a date not yet known to the day wears a ring. */
function taWhenHTML(list){
  const pts=list.map((e,i)=>{
    const r=TA.R[e.ti], c=r.kind==='topic'?r.call:r.c;
    const at=r.kind==='topic'?c.d1:(c.d1||c.annEnd||c.opening);
    return at?{i,r,c,at}:null;
  }).filter(Boolean);
  if(!pts.length) return '';
  const today=todayISO(), ds=pts.map(p=>p.at).concat(today).sort();
  const a=d3(ds[0]), z=d3(ds[ds.length-1]);
  const T0=new Date(a.getFullYear(),a.getMonth(),1), T1=new Date(z.getFullYear(),z.getMonth()+1,1), W=T1-T0;
  const Xs=s=>(d3(s)-T0)/W*100;
  let ax='', gl='';
  for(let d=new Date(T0); d<T1; d=new Date(d.getFullYear(),d.getMonth()+1,1)){
    const x=(d-T0)/W*100, nx=(new Date(d.getFullYear(),d.getMonth()+1,1)-T0)/W*100, y=d.getMonth()===0;
    gl+=`<span class="tgl${y?' y':''}" style="left:${x}%"></span>`;
    ax+=y?`<i class="y" style="left:${(x+nx)/2}%">${d.getFullYear()}</i>`:`<i style="left:${(x+nx)/2}%">${MON[d.getMonth()][0]}</i>`;
  }
  const lanes=[]; let dots='';
  pts.forEach(p=>{
    const x=Xs(p.at);
    let ln=0; while((lanes[ln]||[]).some(v=>Math.abs(v-x)<2.2)) ln++;
    (lanes[ln]=lanes[ln]||[]).push(x);
    const soft=p.r.kind==='call'&&!!(p.c.sD1||(!p.c.d1&&(p.c.sOpen||p.c.annEnd)));
    const ink=p.r.kind==='topic'?fg(p.c):p.c.ink;
    const when=p.r.kind==='topic'?'deadline '+dmy(p.at):(p.c.tagEnd||dmy(p.at));
    dots+=`<button class="tdotn${soft?' soft':''}" data-go="${p.i+1}" style="left:${x}%;top:${26+ln*26}px;background:${p.c.color};color:${ink}" title="${attr((p.i+1)+' · '+p.r.title+' · '+when)}">${p.i+1}</button>`;
  });
  const t=Xs(today);
  return `<div class="tawhen"><div class="tl-title">When · each result at its deadline, a press brings its card into view</div>`
    +`<div class="tastrip" style="height:${26+lanes.length*26+4}px">${gl}<div class="tax">${ax}</div>`
    +(t>=0&&t<=100?`<span class="ttoday" style="left:${t}%" title="today"></span>`:'')+dots+`</div></div>`;
}

/* one result, as the Topic Atlas's card: its rank, the call's chip, its
   title (which opens the reader), the score split by part, the facts, and
   each keyword's lines */
function taWhen(r){
  if(r.kind==='call'){
    const c=r.c;
    return c.d1||c.annEnd?(c.tagOpen&&!c.annEnd&&c.opening>todayISO()?`<span class="st-fc">opens ${esc(c.tagOpen)}</span>, `:'')+`deadline ${esc(c.tagEnd)}`:esc(c.tagEnd||'');
  }
  const c=r.call, two=c.twoStage?' (stage 1)':'', t=todayISO();
  if(taGone(r)) return '<span class="closed">no longer on the portal</span>';
  if(c.d1<t) return `<span class="closed">closed ${dmy(c.d1)}${two}</span>`;
  if(c.opening>t) return `<span class="st-fc">opens ${dmy(c.opening)}</span>, deadline ${dmy(c.d1)}${two}`;
  return `<span class="st-open">open</span>, deadline ${dmy(c.d1)}${two}`;
}
function taCardHTML(e,rank,maxScore,res){
  const r=TA.R[e.ti];
  const base=e.base!=null?e.base:e.score, F=e.near?e.near.F:1, scale=e.sum>0?base/maxScore/e.sum:0;
  const segs=TASECS.map(s=>`<i class="s-${s}" style="width:${(e.bySec[s]*scale*100).toFixed(1)}%" title="${TASEC[s][1]}: ${taF2(e.bySec[s])}"></i>`).join('')
    +(F!==1?`<i class="s-near" style="width:${((e.score-base)/maxScore*100).toFixed(1)}%" title="where your keywords meet: ×${taF2(F)}, +${taF2(e.score-base)}"></i>`:'');
  let chip, facts;
  if(r.kind==='topic'){
    const f=r.f, at=f.actionType||{}, pp=(f.budget||{}).perProjectEURm;
    chip=`<span class="cchip w" style="background:${r.call.color};color:${fg(r.call)}" title="${attr(r.call.id)}">${esc(r.call.short)}</span>`;
    facts=[`<span class="code">${esc(shortTopicId(r.id))}</span>`,esc(f.part.label),f.destination?esc(f.destination):null,
      at.code?`<span title="${attr(at.label||at.code)}">${esc(at.code)}</span>`:null,
      pp?`€${pp[0]===pp[1]?+pp[0]:+pp[0]+'–'+(+pp[1])}M per project`:null,taWhen(r)];
  } else {
    chip=tagHTML(r.c.arena,r.c,r.c.short);
    facts=[esc(r.c.arena.name),'its call text',taWhen(r)];
  }
  const meetRows=new Set(taMeetsOf(e).flatMap(({p})=>[p.m.ra,p.m.rb]));
  const blocks=[];
  res.perChip.forEach((pc,ci)=>{
    const rows=e.chips[ci]||[], code=pc.codes.includes(e.ti);
    if(!rows.length&&!code) return;
    const key=e.ti+':'+ci, open=TA.expanded.has(key);
    const shown=rows.map((rw,k)=>({rw,k})).filter(({rw,k})=>open||k<3||meetRows.has(rw));
    blocks.push({ci,pc,rows:shown,n:rows.length,code,
      more:shown.length<rows.length?`<button class="showmore" data-more="${key}">show all ${rows.length} lines ↓</button>`:''});
  });
  return `<div class="card" id="tacard${rank}"><div class="top"><span class="rank">${rank}</span>${chip}`
    +`<span class="rname" data-read="${e.ti}">${esc(r.title)}</span>`
    +`<span class="scorewrap"><span class="sbar" title="the score, split by the part of the text each line came from">${segs}</span><span class="snum">${e.score>0||!e.codeHit?taF2(e.score):'code'}</span></span></div>`
    +`<div class="raffil">${facts.filter(Boolean).join(' · ')}</div><div class="paths">${blocks.length?taLinesHTML(e,blocks):''}</div></div>`;
}

/* ── the keywords' lines, as the Topic Atlas draws them ──
   One grid per card. Each line: how the keyword matched → the ideas it went
   through → the idea it landed on, then a dotted arrow to the words landed
   upon, in a column as wide on every card; a line pressed shows its
   sentence. Where two keywords meet, a bracket joins their words, how they
   meet beside it, and a press shows that sentence. */
const TAMEAS=document.createElement('canvas').getContext('2d');
const taTextW=(s,font)=>{ TAMEAS.font=font; return Math.ceil(TAMEAS.measureText(s).width); };
const TAFONT={c:'14.5px "Crimson Text", Georgia, serif',cl:'600 14.5px "Crimson Text", Georgia, serif',
  w:'14px "Crimson Text", Georgia, serif',m:'11px "IBM Plex Mono", monospace',t:'10px "IBM Plex Mono", monospace'};
const TALANE=12;
const taBadge=sec=>`<span class="badge s-${sec}" title="${TASEC[sec][1]}">${TASEC[sec][0]}</span>`;
const taPhrase=rw=>`“${rw.hits[0].ph}”${rw.n>1?` ×${rw.n}`:''}`;
const taWordsHTML=(rw,meets)=>`${taBadge(rw.sec)}<span class="psrc${meets?' meetw':''}" title="${attr('“'+rw.hits[0].ph+'”'+(rw.n>1?` — ${rw.n} mentions`:'')+(meets?' · meets another keyword':''))}">${esc(taPhrase(rw))}</span>`
  +(meets?'<i class="marm" aria-hidden="true"></i>':'');
const taMeetsOf=e=>e.near?e.near.pairs.map((p,k)=>({p,k})).filter(x=>x.p.m&&x.p.m.v>0):[];
function taPathWidth(rw){
  const G=taG();
  let w=6+taTextW(G.MTG[rw.mt],TAFONT.m)+8;
  if(rw.axis==='text') return w+taTextW(`“${rw.via}”`,TAFONT.cl)+14;
  const L=rw.path.length;
  w+=taTextW(TA.C.get(rw.start).label,L?TAFONT.c:TAFONT.cl)+14;
  rw.path.forEach((st,i)=>{ w+=4+taTextW(`—${G.RELG[st.rel]}→`,TAFONT.m)+8+2+taTextW(TA.C.get(st.c).label,i===L-1?TAFONT.cl:TAFONT.c)+14; });
  return w;
}
function taSectionWidths(list){
  let ww=0, lanes=0, lw=0;
  for(const e of list){
    for(const rows of Object.values(e.chips)) for(const rw of rows) ww=Math.max(ww,taTextW(taPhrase(rw),TAFONT.w));
    const ms=taMeetsOf(e);
    lanes=Math.max(lanes,ms.length);
    for(const {p} of ms) lw=Math.max(lw,taTextW(TALVL[p.m.lvl],TAFONT.t));
  }
  return {ww:Math.min(400,Math.max(170,ww+62)),mw:lanes?8+lanes*TALANE+lw+20:0};
}
function taPieces(rw){
  const G=taG();
  if(rw.axis==='text') return [`<span class="pmt" title="${attr(G.MTT[rw.mt])}">${G.MTG[rw.mt]}</span><span class="cnode a-text landing" title="${attr(G.MTT.text)}">“${esc(rw.via)}”</span>`];
  const L=rw.path.length;
  return [`<span class="pmt" title="${attr(G.MTT[rw.mt])}">${G.MTG[rw.mt]}</span>${taCnode(rw.start,!L)}`,
    ...rw.path.map((st,i)=>`<span class="prel" title="${attr(TARELN[st.rel]+(st.note?' — '+st.note:'')+' · ×'+taF2(G.DEFAULTS.step[st.rel]))}">—${G.RELG[st.rel]}→</span>${taCnode(st.c,i===L-1)}`)];
}
function taLinesHTML(e,blocks){
  const N=e.near, meets=taMeetsOf(e), inMeet=new Set(meets.flatMap(({p})=>[p.m.ra,p.m.rb])), at=new Map();
  let r=0, h='';
  blocks.forEach((b,bi)=>{
    r++;
    h+=`<div class="lrow lq" style="grid-row:${r}"><span class="qgroup"><b>${esc(b.pc.q)}</b> — ${b.n?`${b.n} line${b.n===1?'':'s'}`:''}${b.code?`${b.n?' · ':''}matches the topic code`:''}</span>`;
    if(bi===0){
      h+='<span class="lh lwh">landed-upon words</span>';
      if(N){
        const off=N.pairs.filter(p=>!(p.m&&p.m.v>0));
        const tip=off.length?`not within a sentence of each other: ${off.map(p=>`${TA.chips[p.a]} ↔ ${TA.chips[p.b]}`).join('; ')}`:'';
        h+=`<span class="lh lmh"${tip?` title="${attr(tip)}"`:''}><span class="qgroup near"><b>where they meet</b> <span class="mono">×${taF2(N.F)}</span></span></span>`;
      }
    }
    h+='</div>';
    b.rows.forEach(({rw,k})=>{
      const key=e.ti+':'+b.ci+':'+k, ps=taPieces(rw);
      const path=ps.map((p,i)=>`<span class="pc${i===ps.length-1?' pl':''}">${p}</span>`).join('')+'<i class="dots" aria-hidden="true"></i>';
      const mt=inMeet.has(rw);
      at.set(rw,++r);
      h+=`<div class="lrow line" style="grid-row:${r}" data-snip="${key}"><span class="lp">${path}</span><span class="lw${mt?' mt':''}"><span class="lw1">${taWordsHTML(rw,mt)}</span></span></div>`;
      if(TA.openSnips.has(key)) h+=`<div class="lsn" style="grid-row:${++r}">${taSnippetHTML(e.ti,rw.sec,rw.hits[0])}</div>`;
    });
    if(b.more) h+=`<div class="lrow lmore" style="grid-row:${++r}"><span class="lp">${b.more}</span></div>`;
  });
  const band=`<i class="wband" style="grid-row:1 / ${r+1}" aria-hidden="true"></i>`;
  const brs=meets.map(({p,k})=>{ const a=at.get(p.m.ra), z=at.get(p.m.rb); return {p,k,top:Math.min(a,z),bot:Math.max(a,z)}; })
    .filter(x=>x.top&&x.bot&&x.top!==x.bot).sort((x,y)=>(x.bot-x.top)-(y.bot-y.top)||x.top-y.top);
  const lanes=[];
  for(const x of brs){
    let l=0;
    while((lanes[l]||[]).some(o=>!(x.top>o.bot||x.bot<o.top))) l++;
    (lanes[l]=lanes[l]||[]).push(x); x.lane=l;
  }
  for(const x of brs){
    const m=x.p.m;
    const tip=`${TA.chips[x.p.a]} ↔ ${TA.chips[x.p.b]}: ${TALVLT[m.lvl]}${m.words!=null?` · ${m.words} word${m.words===1?'':'s'} between${m.list?', two items of a list':''}`:''} · ${TASEC[m.sec][1]} · click for the sentence`;
    h+=`<i class="mbr" style="grid-row:${x.top} / ${x.bot};width:${6+x.lane*TALANE}px" aria-hidden="true"></i>`
      +`<span class="mlw" style="grid-row:${x.top} / ${x.bot};left:${8+lanes.length*TALANE}px"><button class="mlab" data-snip="${e.ti}:n:${x.k}" title="${attr(tip)}">${esc(TALVL[m.lvl])}</button></span>`;
  }
  for(const {p,k} of meets) if(TA.openSnips.has(e.ti+':n:'+k)) h+=`<div class="lsn" style="grid-row:${++r}">${taMeetSnippetHTML(e.ti,p.m)}</div>`;
  const pw=Math.max(300,...blocks.flatMap(b=>b.rows.map(({rw})=>taPathWidth(rw)+56)));
  return `<div class="lines" style="--pw:${pw}px;grid-template-rows:repeat(${r}, auto)">${band}${h}</div>`;
}
const taSentenceOf=(text,s)=>TA.TU.sentences(text).find(([a,b])=>s>=a&&s<b)||[0,text.length];
const taWhere=(r,sec,p)=>r.kind==='call'&&sec!=='title'?(((r.disp.find(d=>d.sec===sec&&d.i===p)||{}).h)||TASEC[sec][1]):TASEC[sec][1];
function taSnippetHTML(ti,sec,h){
  const r=TA.R[ti], text=r.sections[sec][h.p].text, [a,b]=taSentenceOf(text,h.s);
  let pre=text.slice(a,h.s).replace(/^•\s*/,''), post=text.slice(h.e,b).replace(/\s+$/,'');
  const lead=pre.length>220, tail=post.length>220;
  if(lead) pre=pre.slice(-220);
  if(tail) post=post.slice(0,220);
  return `<div class="snippet">“${lead?'…':''}${esc(pre)}<mark>${esc(text.slice(h.s,h.e))}</mark>${esc(post)}${tail?'…':''}”`
    +`<span class="from">${esc(taWhere(r,sec,h.p))} · paragraph ${h.p+1}<button data-read="${ti}">read it ▸</button></span></div>`;
}
function taMeetSnippetHTML(ti,m){
  const r=TA.R[ti];
  const [x,y]=(m.ha.p<m.hb.p||(m.ha.p===m.hb.p&&m.ha.s<m.hb.s))?[m.ha,m.hb]:[m.hb,m.ha];
  const piece=(p,hs)=>{
    const text=r.sections[m.sec][p].text, last=hs[hs.length-1];
    const a=taSentenceOf(text,hs[0].s)[0], b=taSentenceOf(text,last.s)[1];
    let pre=text.slice(a,hs[0].s).replace(/^[•◦]\s*/,''), post=text.slice(last.e,b).replace(/\s+$/,'');
    const lead=pre.length>160, tail=post.length>160;
    if(lead) pre=pre.slice(-160);
    if(tail) post=post.slice(0,160);
    let mid='';
    hs.forEach((h,i)=>{ mid+=`<mark>${esc(text.slice(h.s,h.e))}</mark>`+(i+1<hs.length?esc(text.slice(h.e,hs[i+1].s)):''); });
    return `${lead?'…':''}${esc(pre)}${mid}${esc(post)}${tail?'…':''}`;
  };
  const body=x.p===y.p?piece(x.p,[x,y]):`${piece(x.p,[x])} <span class="sep">¶</span> ${piece(y.p,[y])}`;
  const where=m.sec==='title'?'Title':`${esc(taWhere(r,m.sec,x.p))} · ${x.p===y.p?`paragraph ${x.p+1}`:`paragraphs ${x.p+1}–${y.p+1}`}`;
  const how=m.words!=null?` · ${m.words} word${m.words===1?'':'s'} between${m.list?', two items of a list':''}`:'';
  return `<div class="snippet near">“${body}”<span class="from">${where} · ${TALVL[m.lvl]}${how}<button data-read="${ti}">read it ▸</button></span></div>`;
}

/* every press on the page of results */
function taAdd(list){
  list.forEach(s=>{ if(!TA.chips.includes(s)) TA.chips.push(s); });
  TA.shown=40; taSave(); taChipsPaint(); taRender();
}
function taWire(el,res){
  const on=(sel,fn)=>el.querySelectorAll(sel).forEach(b=>b.addEventListener('click',ev=>fn(b,ev)));
  on('[data-try]',b=>taAdd(b.dataset.try.split(',').map(s=>s.trim()).filter(Boolean)));
  if(!res) return;
  on('[data-read]',(b,ev)=>{ ev.stopPropagation(); taOpenReader(+b.dataset.read); });
  on('[data-more]',b=>{ TA.expanded.add(b.dataset.more); taRender(); });
  on('[data-moreres]',()=>{ TA.shown+=40; taRender(); });
  on('[data-snip]',(b,ev)=>{
    if(ev.target.closest('[data-read]')) return;
    const k=b.dataset.snip; TA.openSnips.has(k)?TA.openSnips.delete(k):TA.openSnips.add(k); taRender();
  });
  on('[data-showclosed]',()=>{ TA.filt.when='all'; taSave(); taRender(); });
  on('[data-freset]',()=>{ TA.filt={when:'all',until:'',where:[],types:[]}; taSave(); taRender(); });
  on('[data-toggle]',b=>{
    const [ci,c]=b.dataset.toggle.split('|'), q=TA.chips[+ci], off=new Set(TA.off[q]||[]);
    off.has(c)?off.delete(c):off.add(c);
    if(off.size) TA.off[q]=[...off]; else delete TA.off[q];
    taSave(); taRender();
  });
  on('[data-nbrs]',b=>{ const ci=+b.dataset.nbrs; TA.openNbrs.has(ci)?TA.openNbrs.delete(ci):TA.openNbrs.add(ci); taRender(); });
  on('[data-swap]',b=>{ const ci=+b.dataset.swap; delete TA.off[TA.chips[ci]]; TA.chips[ci]=b.dataset.to; taSave(); taChipsPaint(); taRender(); });
  on('[data-go]',b=>{
    const card=document.getElementById('tacard'+b.dataset.go); if(!card) return;
    card.scrollIntoView({behavior:'smooth',block:'start'});
    card.classList.add('flash'); setTimeout(()=>card.classList.remove('flash'),1400);
  });
}

/* ── the reader: the Board's own, with what was found in it ──
   The head is the Board's (a topic's facts and the portal's notices, or a
   call's); the body is the Topic Atlas's: the score and what it is made
   of, every idea the text names with the ones counted for the keywords
   outlined, and the text itself in the Board's type with each idea
   underlined in its axis's colour, the phrases that count in bold and the
   sentences where the keywords meet shaded. An idea pressed is added as a
   keyword. */
function taParaHTML(text,spans){
  if(!spans.length) return esc(text);
  const cuts=new Set([0,text.length]);
  for(const sp of spans){ cuts.add(Math.max(0,sp.s)); cuts.add(Math.min(text.length,sp.e)); }
  const pts=[...cuts].sort((a,b)=>a-b);
  let out='';
  for(let i=0;i<pts.length-1;i++){
    const a=pts[i], b=pts[i+1], seg=text.slice(a,b), on=spans.filter(sp=>sp.s<=a&&sp.e>=b);
    if(!on.length){ out+=esc(seg); continue; }
    const cls=[...new Set(on.flatMap(sp=>sp.cls.split(' ')))].join(' ');
    const title=[...new Set(on.map(sp=>sp.title).filter(Boolean))].join(' · ');
    out+=`<span class="${cls}"${title?` title="${attr(title)}"`:''}>${esc(seg)}</span>`;
  }
  return out;
}
function taSpansFor(r,sec,p,credited,meets){
  const sp=[];
  for(const mt of meets) if(mt.sec===sec&&mt.p===p) sp.push({s:mt.s,e:mt.e,cls:'meet',title:mt.title});
  for(const o of r.concepts) if(o.sec===sec) for(const h of o.hits) if(h.p===p){
    const c=TA.C.get(o.c), q=credited.has(sec+'|'+p+'|'+h.s);
    sp.push({s:h.s,e:h.e,cls:`xc a-${c.axis}${q?' qhit':''}`,title:`${c.label} · ${TAAXN[c.axis]}${q?' · counted for your keywords':''}`});
  }
  for(const k of credited.keys()){
    const [s0,p0,a]=k.split('|');
    if(s0===sec&&+p0===p&&!sp.some(x=>x.s===+a)) sp.push({s:+a,e:credited.get(k),cls:'xc a-text qhit',title:'your keyword, in the text'});
  }
  for(const [a,z] of (r.sections[sec][p].boiler||[])) sp.push({s:a,e:z,cls:'boil',title:'standing text of the work programme: not searched'});
  return sp;
}
function taOpenReader(ti){
  const r=TA.R[ti]; if(!r) return;
  const e=TA.last?TA.last.list.find(x=>x.ti===ti):null;
  if(r.kind==='call') openText(r.t,r.c);
  else if(!openReader(r.id)){
    /* a topic the Board lacks: the Topic Atlas's own facts at the head */
    RD_ID=null; RD_BACK=null;
    document.getElementById('rdtitle').textContent=r.title;
    document.getElementById('rdmeta').innerHTML=`<table><tr><td>Topic</td><td class="full">${esc(r.id)}</td></tr><tr><td>Call</td><td class="full">${esc(r.call.id)}</td></tr><tr><td>Deadline</td><td class="full">${dmy(r.call.d1)}</td></tr></table>`;
    const ln=document.getElementById('rdlinks'); ln.innerHTML=''; ln.appendChild(portalLink(topicURL(r.id),'Topic on portal'));
    const nt=document.getElementById('rdnotes'); nt.hidden=true; nt.innerHTML='';
    slideReader();
  }
  const credited=new Map();
  if(e) for(const rows of Object.values(e.chips)) for(const rw of rows) for(const h of rw.hits) credited.set(rw.sec+'|'+h.p+'|'+h.s,h.e);
  const meets=[];
  if(e&&e.near) for(const p of e.near.pairs) if(p.m&&p.m.v>0){
    const title=`where ${TA.chips[p.a]} and ${TA.chips[p.b]} meet: ${TALVL[p.m.lvl]}`;
    for(const h of [p.m.ha,p.m.hb]){ const [s,en]=taSentenceOf(r.sections[p.m.sec][h.p].text,h.s); meets.push({sec:p.m.sec,p:h.p,s,e:en,title}); }
  }
  let b='';
  if(e&&!(e.score>0)&&e.codeHit) b+='<div class="whybox">Pinned to the top of the list by its code.</div>';
  else if(e) b+=`<div class="whybox">For your keywords this ${r.kind==='topic'?'topic':'call'} scores <b>${taF2(e.score)}</b>`
    +(TA.chips.length>1&&e.perChip?` (${TA.chips.map((q,ci)=>`${esc(q)} ${taF2(e.perChip[ci])}`).join(' · ')}${e.near&&e.near.F!==1?`; ×${taF2(e.near.F)} where they meet`:''})`:'')+'. '
    +'The phrases that count are <span class="xc a-method qhit">set in bold</span> below; every idea found is underlined in its axis’s colour.'
    +(meets.length?' The sentences where your keywords meet are <span class="meet">shaded</span>.':'')+'</div>';
  const D=taG().DEFAULTS, weight={};
  for(const o of r.concepts) weight[o.c]=(weight[o.c]||0)+D.weights[o.sec]*TA.S.idf(o.c)*Math.min(o.n,D.cap);
  const hitC=new Set(e?Object.values(e.chips).flat().map(rw=>rw.c).filter(Boolean):[]);
  const secsOf=c=>TASECS.filter(s=>r.concepts.some(o=>o.c===c&&o.sec===s));
  for(const axis of ['method','domain']){
    const cs=Object.keys(weight).filter(c=>TA.C.get(c).axis===axis).sort((a,z)=>weight[z]-weight[a]);
    b+=`<div class="rsec"><h4><span class="tdot a-${axis}"></span>${axis==='method'?'Methods &amp; expertise':'Application domains'} · ${cs.length}</h4>`
      +(cs.length?`<div class="kwline">${cs.map(c=>`<span class="tcc a-${axis}${hitC.has(c)?' hit':''}" data-addkw="${attr(TA.C.get(c).label)}" title="${attr(taConceptTitle(c)+' · click to search for it')}">${esc(TA.C.get(c).label)}`
          +` <span class="n">${secsOf(c).map(s=>`<i class="mb s-${s}" title="${TASEC[s][1]}">${TASEC[s][0]}</i>`).join('')}&nbsp;${taF2(weight[c])}</span></span>`).join('')}</div>`
        :`<div class="hint">None found.</div>`)+'</div>';
  }
  const para=(sec,i)=>{
    const t=r.sections[sec][i].text, bul=t.startsWith('• '), sub=!bul&&/^[^•].{0,80}:$/.test(t);
    return `<p${bul?' class="bul"':sub?' class="sub"':''}>${taParaHTML(t,taSpansFor(r,sec,i,credited,meets))}</p>`;
  };
  if(r.kind==='topic'){
    if(r.sections.outcome.length) b+='<h3>Expected Outcome</h3>'+r.sections.outcome.map((_,i)=>para('outcome',i)).join('');
    if(r.sections.scope.length) b+='<h3>Scope</h3>'+r.sections.scope.map((_,i)=>para('scope',i)).join('');
    r.extra.forEach(x=>{ if(x.paras&&x.paras.length) b+=`<h3>${esc(x.name)}</h3>`+x.paras.map(p=>`<p>${esc(p)}</p>`).join(''); });
    if(r.sections.intro.length) b+='<h3>Where it sits</h3>'+r.sections.intro.map((_,i)=>para('intro',i)).join('');
    if(r.conds.length) b+='<h3>Specific conditions</h3><dl>'+r.conds.map(c=>`<dt>${esc(c.label)}</dt><dd>${esc(c.text)}</dd>`).join('')+'</dl>';
    b+='<p class="hint">The text is the Topic Atlas’s, checked against the Funding &amp; Tenders portal; greyed is the work programme’s standing text, not searched.</p>';
  } else {
    let head=null;
    r.disp.forEach(x=>{
      if(x.h!==head){ head=x.h; if(head) b+=`<h3>${esc(head)}</h3>`; }
      b+=para(x.sec,x.i);
    });
  }
  const body=document.getElementById('rdbody');
  body.innerHTML=`<div class="ta">${b}</div>`;
  body.scrollTop=0;
  body.querySelectorAll('[data-addkw]').forEach(el=>el.addEventListener('click',()=>{ closeReader(); taAdd([el.dataset.addkw]); }));
}

/* ── the switch, the keywords, and the filters ── */
function taChipsPaint(){
  const el=document.getElementById('tachips');
  el.innerHTML=TA.chips.map((c,i)=>`<span class="takw">${esc(c)}<button data-rm="${i}" title="Remove" aria-label="Remove ${attr(c)}">×</button></span>`).join('');
  el.querySelectorAll('[data-rm]').forEach(b=>b.addEventListener('click',()=>{
    const [q]=TA.chips.splice(+b.dataset.rm,1); delete TA.off[q];
    TA.shown=40; taSave(); taChipsPaint(); taRender();
  }));
  document.getElementById('taq').placeholder=TA.chips.length?'Add another keyword…':'Type a method, an application or a topic code, then Enter…';
}
/* `quiet` is a tab pressed, which draws the room itself afterwards */
function taSet(on,quiet){
  TA.on=on;
  const $=id=>document.getElementById(id);
  $('hdr').classList.toggle('atlas',on);
  $('tabox').hidden=!on; $('tafbtn').hidden=!on;
  document.querySelector('.wrap').hidden=on; $('taview').hidden=!on;
  document.querySelectorAll('#taseg button').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.v==='atlas')===on)));
  if(on){ taChipsPaint(); taRender(); }
  else{ $('tafilt').hidden=true; if(!quiet) render(); }
  setHdrH();
  if(!quiet) window.scrollTo({top:0});
  if(on) $('taq').focus({preventScroll:true});
}
function taFiltersPaint(){
  const el=document.getElementById('tafilt'), fb=document.getElementById('tafbtn'), n=taFiltN(), F=TA.filt;
  el.hidden=!(TA.on&&TA.fopen);
  fb.setAttribute('aria-expanded',String(TA.fopen));
  fb.textContent='Filters'+(n?' · '+n:'')+(TA.fopen?' ▴':' ▾');
  if(!TA.fopen){ el.innerHTML=''; return; }
  const ch=(f,k,lab)=>`<button class="tchip" data-f="${f}" data-k="${attr(k)}" aria-pressed="${F[f].includes(k)}">${esc(lab||k)}</button>`;
  el.innerHTML=`<span class="seglabel">Which</span><div class="seg"><button data-when="upcoming" aria-pressed="${F.when==='upcoming'}">Open &amp; upcoming</button><button data-when="all" aria-pressed="${F.when==='all'}">All, closed too</button></div>`
    +`<span class="seglabel">Deadline by</span><input type="date" id="tauntil" value="${attr(F.until)}" aria-label="Deadline by">`
    +`<span class="seglabel">Where</span><div class="grp">${PAGES.map(p=>ch('where',p.key)).join('')}</div><div class="grp">${TYPE_TABS.map(t=>ch('where',t.key)).join('')}</div>`
    +`<span class="seglabel">Type of action</span><div class="grp">${['RIA','IA','CSA'].map(t=>ch('types',t)).join('')}</div>`
    +(n?'<button class="taclear">Clear the filters</button>':'');
  const again=()=>{ taSave(); taRender(); setHdrH(); };
  el.querySelectorAll('[data-when]').forEach(b=>b.addEventListener('click',()=>{ F.when=b.dataset.when; again(); }));
  el.querySelectorAll('[data-f]').forEach(b=>b.addEventListener('click',()=>{
    const a=F[b.dataset.f], k=b.dataset.k, i=a.indexOf(k); i<0?a.push(k):a.splice(i,1); again();
  }));
  el.querySelector('#tauntil').addEventListener('change',e=>{ F.until=e.target.value||''; again(); });
  const cl=el.querySelector('.taclear'); if(cl) cl.addEventListener('click',()=>{ TA.filt={when:'upcoming',until:'',where:[],types:[]}; again(); });
}
document.querySelectorAll('#taseg button').forEach(b=>b.addEventListener('click',()=>taSet(b.dataset.v==='atlas')));
document.getElementById('tafbtn').addEventListener('click',()=>{ TA.fopen=!TA.fopen; taFiltersPaint(); setHdrH(); });
const taqEl=document.getElementById('taq');
taqEl.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&taqEl.value.trim()){
    const v=taqEl.value; taqEl.value='';
    taAdd(v.split(/[,;]+/).map(s=>s.trim()).filter(Boolean));
  } else if(e.key==='Backspace'&&!taqEl.value&&TA.chips.length){
    delete TA.off[TA.chips.pop()]; TA.shown=40; taSave(); taChipsPaint(); taRender();
  }
});
document.getElementById('tabox').addEventListener('click',e=>{ if(e.target.id==='tabox'||e.target.id==='tachips') taqEl.focus(); });

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
  if(MODE==='overview'){OV.q=v;buildOvLedger();} else {allPages().forEach(p=>p.state.q=v);applyFilters();}
});
qClr.addEventListener('click',()=>{
  qEl.value=''; qClr.style.display='none';
  if(MODE==='overview'){OV.q='';buildOvLedger();} else {allPages().forEach(p=>p.state.q='');applyFilters();}
  qEl.focus();
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&document.getElementById('reader').classList.contains('open')){ closeReader(); return; }
  if(e.key==='Escape'&&JUDGE.on){ stopJudging(); return; }
  if(e.key==='Escape'&&MODE==='overview'){
    OV.sel.clear(); OV.type=null; OV.q=''; qEl.value=''; qClr.style.display='none';
    allPages().forEach(p=>OV.clusters.add(p.key)); setPreset('6m'); renderOverview(); return;
  }
  if(e.key==='Escape'){
    P.state.sel.clear(); P.state.selTopicCall=null; P.state.type=null; allPages().forEach(p=>p.state.q='');
    qEl.value=''; qClr.style.display='none';
    tc.querySelectorAll('.tchip').forEach(x=>x.setAttribute('aria-pressed','false'));
    topicEls.forEach(t=>{t.row.classList.remove('sel');t.det.classList.remove('open');});
    if(P.state.openArena){ P.state.openArena=null; buildTimeline(); }
    applyFilters(); paintTimeline(); paintPills(); showCard([]);
  }
  /* A bare digit only. Alt and a digit is the shell's way between rooms,
     and it used to turn this room's page over on the way past. */
  if(/^[1-9]$/.test(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey
     && document.activeElement!==qEl && document.activeElement!==taqEl && +e.key-1<=PAGES.length) selectPage(+e.key-1);
});

const hash=(location.hash||'').replace('#','').toLowerCase();
const start = hash==='all' ? PAGES.length : Math.max(0, PAGES.findIndex(p=>p.key.toLowerCase()===hash));
/* An arena's tab named in the address cannot open yet: the arenas arrive
   from the bridge a moment after the room is built. It is opened then. */
const atab=hash==='freezer'?'FREEZER':(TYPE_TABS.find(t=>t.key.toLowerCase()===hash)||{}).key;
if(atab) pendingTab=atab;
selectPage(start);


/* ---------- what the other rooms may ask for ----------
   Which topics and which arenas' calls are there, and open one: a topic
   in the reader, or a call's kept text. The list is flattened here rather
   than in the bridge because the shape of a page is this room's business
   — the caller gets one row per topic and never has to know that a
   cluster holds destinations which hold themes which hold these.

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
/* The arenas' calls the Ledger may tie one of its calls to (Mark,
   2026-10-29): the calls of every tab but the clusters' and missions',
   which the Ledger reaches as topics, and none of the Freezer's. A call is
   a run as this room draws it, its dates as the Semaphore hands them over,
   ids and all, never formatted here. */
function callRow(c){
  return {arena:c.arenaId,arenaName:c.arena.name,short:c.short,tab:c.cluster,
          name:c.name,names:c.run.names.slice(),open:c.run.open,ann:c.run.ann,dls:c.run.dls.slice()};
}
Hub.expose('callboard',{
  topics:function(){ return Object.keys(TOPIC_BY_ID).map(topicRow); },
  calls:function(){ return ACALLS.concat(COPROG_RUNS).map(callRow); },
  /* a call's kept text, read in the reader as on an arena opened here;
     false when the call has none */
  openText:function(arenaId,names){
    const c=ACALLS.concat(FZ?FZ.calls:[],COPROG_RUNS).find(x=>x.arenaId===arenaId&&x.run.names.some(n=>(names||[]).indexOf(n)>-1));
    const t=c&&keptText(c);
    if(!t) return false;
    openText(t,c); return true;
  },
  openReader:function(id){ return openReader(id); },
  closeReader:closeReader,
  /* the socket for the Semaphore's arenas: a read of them, and their
     drawer to lend over this room — filled by the bridge, then told of
     every change on the other side */
  setArenas:function(o){ ARENA_SRC=o||null; arenasArrived(); },
  arenasChanged:function(){ if(ARENA_SRC) arenasArrived(); },
  /* go through what waits to be judged, from the first find, as ChatGPT's
     answer put on the board asks */
  judge:function(){ if(ARENA_SRC) startJudging(); },
  /* the call texts read again from the cloud (bridge.js), and the cloud
     back after a login or on coming back to the room */
  textsChanged:function(){
    readFinds(); taStale();
    if(JUDGE.on) return;
    paintJudge();
    if(MODE==='arena') render();
  },
  cloudBack:function(){ readHorizon(); }
});
readHorizon();
taLoad(()=>{
  textsArrived();
  if(ARENA_SRC) arenasArrived();     /* CoProg's rows are found in the texts */
  if(FULLTEXT&&!TA.on) MODE==='overview'?buildOvLedger():applyFilters();
  const rd=document.getElementById('reader');
  if(RD_ID&&rd.getAttribute('aria-hidden')==='false'&&document.querySelector('#rdbody .rdwait')) openReader(RD_ID);
});
/* The room is built late and only once; the bridge waits for this to
   hand it the arenas. */
Hub.emit('callboard:ready');

});
