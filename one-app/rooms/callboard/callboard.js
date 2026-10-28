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
   The tabs stand in two rows that stay put (Mark, 2026-10-25): the
   clusters and missions on the first, the arenas' tabs and ALL on the
   second, each row named at its left, so every tab is one press away and
   in sight. They replaced a roll that showed one row at a time, the
   others peeking over and under the bar, turned by the wheel or a swipe:
   the peeking rows were cut off at the bar's edges and read as broken,
   and a tab in another row was two moves away. All thirteen side by side
   in one row, before the roll, ran into the room's name on the iPad held
   sideways. */
const tabsEl=document.getElementById('tabs');
tabsEl.innerHTML='<div class="tgrid">'
  +'<span class="tglab">Horizon</span><div class="trow" data-g="hz" role="tablist" aria-label="Horizon"></div>'
  +'<span class="tglab" data-g="ar">Arenas</span><div class="tline">'
  +'<div class="trow" data-g="ar" role="tablist" aria-label="Arenas"></div>'
  +'<div class="trow tall" data-g="all" role="tablist" aria-label="All calls"></div></div></div>';
const rowOf=g=>tabsEl.querySelector(`.trow[data-g="${g}"]`);
const htabEls=PAGES.map((p,i)=>{
  const b=document.createElement('button'); b.className='tab'; b.setAttribute('role','tab');
  b.setAttribute('aria-selected', String(i===0));
  b.innerHTML=`<span class="ck">${p.key}</span><span class="cn">${p.label}</span>`;
  b.addEventListener('click',()=>selectPage(i));
  rowOf('hz').appendChild(b);
  return b;
});
const ovTab=document.createElement('button');
ovTab.className='tab'; ovTab.setAttribute('role','tab'); ovTab.setAttribute('aria-selected','false');
ovTab.innerHTML=`<span class="ck">ALL</span><span class="cn">Deadline planner</span>`;
ovTab.addEventListener('click',()=>selectPage(PAGES.length));
rowOf('all').appendChild(ovTab);

/* The arenas' tabs come and go with the arenas, so a tab is marked live by
   which element it is rather than by its place in a row. */
function markTab(el){
  tabsEl.querySelectorAll('.tab').forEach(t=>t.setAttribute('aria-selected',String(t===el)));
}
function selectPage(i){
  if(i===PAGES.length){ MODE='overview'; location.hash='all'; markTab(ovTab); }
  else { MODE='cluster'; P=PAGES[i]; location.hash=P.key.toLowerCase(); markTab(htabEls[i]); }
  afterSelect();
}
function selectArenaTab(key, openId){
  const p=APAGES.find(x=>x.key===key&&x.tabEl);
  if(!p) return;
  MODE='arena'; P=p; location.hash=key.toLowerCase(); markTab(p.tabEl);
  if(openId&&p.callById[openId]) p.state.openArena=p.callById[openId].arenaId;
  afterSelect();
}
function afterSelect(){
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
  {key:'COFUND',full:'Co-funded partnerships',color:'#3C8D6D',test:/co[\s-]*fund/i},
  {key:'COPROG',full:'Co-programmed partnerships',color:'#A96B45',test:/co[\s-]*prog/i},
  {key:'OTHER',full:'Every other arena',color:'#6F7F8F',test:null}];
const HORIZON_TYPE=/pillar\s*(2|ii)\b|\bclusters?\b|\bmissions?\b/i;
/* saturated, pale, and an ink for the chip, in the work programme's own manner */
const ARENA_TONES=[
  ['#4A88CA','#A6C1F9','#002E59'],['#DD7666','#F5B5A9','#56160F'],['#21A17C','#86D0B3','#03392A'],
  ['#8B78C8','#C3B6EE','#2A1C58'],['#D2893D','#F0C390','#4A2600'],['#1295AB','#7FCBD8','#033A44'],
  ['#C2668F','#EDB2CB','#4A1230'],['#8A9A3B','#C9D48A','#2C3308'],['#5F7DB0','#AFC2E2','#16284A'],
  ['#A8794A','#D9BC98','#3A2410'],['#3BA3A0','#9FD8D5','#0A3735'],['#B0638F','#E0B0CC','#3E1530']];
let ARENA_SRC=null, APAGES=[], ACALLS=[], pendingTab=null;
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
  APAGES=TYPE_TABS.map(t=>({key:t.key,label:t.full,full:t.full,clusterColor:t.color,arena:true,unit:'calls',
    arenas:[],calls:[],callById:{},families:[],destinations:[],meta:{},nTopics:0,
    state:before.get(t.key)||{sel:new Set(),selTopicCall:null,q:'',type:null,closed:new Set()}}));
  const q=(PAGES[0]&&PAGES[0].state.q)||'';
  list.forEach(a=>{
    const tt=tabOfType(a.type); if(!tt) return;
    const p=APAGES.find(x=>x.key===tt.key), tone=ARENA_TONES[p.arenas.length%ARENA_TONES.length];
    p.arenas.push(a);
    const start=r=>((r.open||r.ann||(r.dls||[])[0]||{}).start)||'';
    let live=0;
    (a.runs||[]).slice().sort((x,y)=>start(x).localeCompare(start(y))).forEach((r,i)=>{
      const dls=r.dls||[], pale=r.state!=='closed'&&(live++>0);
      const color=pale?tone[1]:tone[0], from=r.open||r.ann||null, annOnly=!r.open&&!!r.ann&&!dls.length;
      const c={id:'arena:'+a.id+':'+i, arena:a, arenaId:a.id, run:r, first:i===0,
        short:tagName(a.name), name:r.name, color, ink:tone[2], ovColor:color, ovInk:tone[2],
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
  });
  APAGES.forEach(p=>{ p.nTopics=p.calls.length; p.state.q=q; });
  ACALLS=APAGES.flatMap(p=>p.calls);
  APAGES.forEach(p=>{ if(!OV.known.has(p.key)){ OV.known.add(p.key); OV.clusters.add(p.key); } });
  buildArenaTabs();
}
function buildArenaTabs(){
  const row=rowOf('ar'); row.innerHTML='';
  /* and a tab with none yet while a new arena of its type is judged there */
  const jf=judgedFind();
  const shown=APAGES.filter(p=>p.arenas.length||frozenIn(p.key).length||(jf&&jf.tab===p.key));
  APAGES.forEach(p=>{ p.tabEl=null; });
  shown.forEach(p=>{
    const b=document.createElement('button'); b.className='tab'; b.setAttribute('role','tab'); b.title=p.full;
    b.setAttribute('aria-selected',String(MODE==='arena'&&P.key===p.key));
    b.innerHTML=`<span class="ck">${p.key}</span><span class="cn">${p.label}</span>`;
    b.addEventListener('click',()=>selectArenaTab(p.key));
    row.appendChild(b); p.tabEl=b;
  });
  tabsEl.querySelector('.tglab[data-g="ar"]').hidden=!shown.length;
}
/* the socket the bridge fills, and again on every change on the other side */
function arenasArrived(){
  readArenas(); readFinds();
  /* While judging, a change made elsewhere on the board is drawn where
     Mark is. Every save went to the find's tab, so Seen pressed on another
     tab's glowing call, straight after ChatGPT's answer was put on the
     board, threw him back to the arena being judged, and seemed to do
     nothing (Mark, 2026-10-26). A find judged moves on by itself (judge). */
  if(JUDGE.on){ const f=judgedFind(); if(!f||MODE!=='overview'&&(!f.tab||f.tab===P.key)) return showFind(); }
  paintJudge();
  if(pendingTab){ const k=pendingTab; pendingTab=null; if(APAGES.some(p=>p.key===k&&p.tabEl)) return selectArenaTab(k); }
  if(MODE==='arena'){
    const p=APAGES.find(x=>x.key===P.key&&x.tabEl);
    if(!p) return selectPage(0);
    P=p; markTab(p.tabEl); render();
  } else if(MODE==='overview') renderOverview();
  else {
    /* a cluster's sheet stays as it is; only the chart, where its
       freezer stands, is drawn again */
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
    <span class="cchip w achip" style="background:${c.color};color:${fg(c)}">${esc(c.short)}</span>
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
function arenaChartRow(c,a){
  const r=document.createElement('div');
  r.className='crow arow'+(c.first?' afirst':'')+(c.run.fresh?' fresh':''); r.tabIndex=0; r.setAttribute('role','button');
  r.dataset.call=c.id; r.dataset.arena=a.id; r.dataset.search=(a.name+' '+c.run.names.join(' ')).toLowerCase();
  r.title=a.name+' — '+c.run.names.join(', ')+(c.run.fresh?'\nNew since you last looked'+(c.run.was.length?' — '+c.run.was.join('; '):''):'');
  r.innerHTML=`<span class="lbl"><span class="cchip w achip" style="background:${c.color};color:${fg(c)}">${esc(c.short)}</span><span class="nm">${esc(c.name)}</span></span><span class="track">${barsHTML(c,X,c.color,c.ink,true)}</span>`;
  if(c.run.fresh) r.querySelector('.lbl').appendChild(seenButton(c));
  const act=()=>openArena(a.id);
  r.addEventListener('click',act);
  r.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();act();}});
  r.addEventListener('mouseenter',()=>showCard([c.id]));
  r.addEventListener('mouseleave',()=>showCard([]));
  return r;
}
/* An arena whose calls are not on the Semaphore's board yet still stands,
   so its absence from the chart says something. */
function arenaEmptyRow(a){
  const r=document.createElement('div'); r.className='crow arow afirst'; r.tabIndex=0; r.setAttribute('role','button');
  r.dataset.arena=a.id; r.dataset.search=a.name.toLowerCase(); r.title=a.name+' — no call dates on the board yet';
  r.innerHTML=`<span class="lbl"><span class="cchip w achip anon">${esc(tagName(a.name))}</span><span class="nm anone">no call dates on the board yet</span></span><span class="track"></span>`;
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
  const tone=calls[0]||{color:'#E6DDC9',ink:'#5C5140'};
  const {site,ref}=arenaLinks(a);
  const link=(l,w)=>l?`<a href="${attr(l.url)}" target="_blank" rel="noopener" title="${attr((l.label?l.label+' — ':'')+l.url)}">${w} ↗</a>`:'';
  blk.innerHTML=`<div class="aoh">
      <span class="cchip achip" style="background:${tone.color};color:${calls[0]?fg(calls[0]):'var(--ink2)'}">${esc(a.name)}</span>
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
    r.innerHTML=`<span class="lbl"><span class="cchip w achip" style="background:${c.color};color:${fg(c)}">${esc(a.name)}</span><span class="nm">${esc(c.name)}</span></span><span class="track">${barsHTML(c,X,c.color,c.ink,true)}</span>`;
    blk.appendChild(r);
  });
  if(!calls.length) blk.insertAdjacentHTML('beforeend',`<div class="crow aorow"><span class="lbl"><span class="cchip w achip anon">${esc(a.name)}</span><span class="nm anone">no call dates on the board yet</span></span><span class="track"></span></div>`);
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
   more than one type, as OTHER does (Mark, 2026-10-24): the name once, in
   small capitals, over a slim rule in the type's own colour from Types.
   Chosen over edging each chip in it and over a wash behind the rows. */
function buildArenaRows(rowsEl){
  const types=new Set(P.arenas.map(a=>a.type||''));
  let ty=null;
  P.arenas.forEach(a=>{
    if(types.size>1&&(a.type||'')!==ty){
      ty=a.type||'';
      rowsEl.insertAdjacentHTML('beforeend',`<div class="tyh" style="--ty:${attr(a.tone||'#9C8B66')}" data-ty="${attr(ty)}"><i></i>${esc(ty||'No type')}</div>`);
    }
    const calls=P.calls.filter(c=>c.arenaId===a.id);
    const add=el=>{ if(types.size>1){ el.classList.add('typed'); el.style.setProperty('--ty',a.tone||'#9C8B66'); el.dataset.ty=ty; } rowsEl.appendChild(el); };
    if(P.state.openArena===a.id) add(arenaOpenBlock(a,calls));
    else if(!calls.length) add(arenaEmptyRow(a));
    else calls.forEach(c=>add(arenaChartRow(c,a)));
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
   and glows on its call's row until Seen (see arenaRow). A call text, the
   third kind of find drawn, comes with the search for official call
   texts. */
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
  }).sort((x,y)=>tabOrder(x.tab)-tabOrder(y.tab)||x.name.localeCompare(y.name));
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
  if(!ARENA_SRC||!ARENA_SRC.judge) return;
  const was=JUDGE.on&&judgedFind()&&judgedFind().key===key;
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
  ARENA_SRC.find({name:f.name,url:f.url,why:f.why,from:f.from,has:f.has,type:f.type,
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
}
/* the new arena being judged, as a row of its tab's chart, dashed */
function ghostArenaRow(rowsEl){
  const f=judgedFind();
  if(!f||f.kind!=='arena'||MODE==='overview'||(f.tab&&f.tab!==P.key)) return;
  rowsEl.insertAdjacentHTML('beforeend',`<div class="crow ghost afirst"><span class="lbl"><span class="cchip w achip">${esc(f.name)}</span><span class="nm anone">a new arena, not on the board yet</span></span><span class="track"></span></div>`);
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
    ?'colour = the arena · saturated tone = the round it is in, pale tone = the next · a soft end ≈ when it can fall, not yet published to the day'
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
  const dates=P.calls.flatMap(callDates).sort();
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
  if(MODE==='arena') buildArenaRows(rowsEl);
  else P.calls.forEach(c=>{
    const r=document.createElement('div'); r.className='crow'; r.tabIndex=0; r.setAttribute('role','button');
    r.dataset.call=c.id; r.title=c.id;
    const b=barsHTML(c,X,c.color,c.ink,true);
    r.innerHTML=`<span class="lbl"><span class="cchip w" style="background:${c.color};color:${fg(c)}">${esc(c.short)}</span><span class="nm">${esc(c.name)}</span></span><span class="track">${b}</span>`;
    const act=()=>toggleCall(c.id);
    r.addEventListener('click',act);
    r.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();act();}});
    r.addEventListener('mouseenter',()=>{if(!P.state.sel.size&&!P.state.selTopicCall)soft(c.id);showCard([c.id]);});
    r.addEventListener('mouseleave',()=>{if(!P.state.sel.size&&!P.state.selTopicCall)soft(null);showCard([...P.state.sel]);});
    rowsEl.appendChild(r);
  });
  buildFreezer(rowsEl);
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
   The arenas put away stand under the calls of the tab they belong to,
   behind one line that says how many (Mark, 2026-10-25): the Semaphore
   kept the freezer under Venues once its Board was gone, a long way from
   the calls the arenas were put away from. Shut until pressed, since it
   is somewhere to put things, not somewhere to look. A name opens the
   arena's panel, which says since when; Thaw puts it back among the
   live ones. */
let FROZEN=[], FRZ_OPEN=false;
const frozenIn=k=>FROZEN.filter(a=>arenaTabKey(a.name,a.type)===k);
function buildFreezer(rowsEl){
  const list=frozenIn(P.key);
  if(!list.length) return;
  const box=document.createElement('div'); box.className='frz'+(FRZ_OPEN?' open':'');
  box.innerHTML=`<button class="frzbar" aria-expanded="${FRZ_OPEN}"><i class="frost"></i>Freezer<span>${list.length} arena${list.length===1?'':'s'} put away</span><b>${FRZ_OPEN?'▾':'▸'}</b></button>`
    +(FRZ_OPEN?'<div class="frzchips">'+list.map(a=>`<span class="frzchip" style="--ty:${attr(a.tone||'#9C8B66')}"><button class="frzname" data-id="${attr(a.id)}" title="${attr(a.name)} — its panel">${esc(tagName(a.name))}</button><button class="frzout" data-id="${attr(a.id)}" title="Put ${attr(a.name)} back among the live arenas">Thaw</button></span>`).join('')+'</div>':'');
  box.querySelector('.frzbar').addEventListener('click',()=>{ FRZ_OPEN=!FRZ_OPEN; buildTimeline(); paintTimeline(); applyFilters(); });
  box.querySelectorAll('.frzname').forEach(b=>b.addEventListener('click',()=>{ if(ARENA_SRC&&ARENA_SRC.open) ARENA_SRC.open(b.dataset.id); }));
  box.querySelectorAll('.frzout').forEach(b=>b.addEventListener('click',()=>{ if(ARENA_SRC&&ARENA_SRC.thaw) ARENA_SRC.thaw(b.dataset.id); }));
  rowsEl.appendChild(box);
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
const DESC = window.__CB_DESC();   /* data/callboard-descriptions.js */
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
     && document.activeElement!==qEl && +e.key-1<=PAGES.length) selectPage(+e.key-1);
});

const hash=(location.hash||'').replace('#','').toLowerCase();
const start = hash==='all' ? PAGES.length : Math.max(0, PAGES.findIndex(p=>p.key.toLowerCase()===hash));
/* An arena's tab named in the address cannot open yet: the arenas arrive
   from the bridge a moment after the room is built. It is opened then. */
const atab=TYPE_TABS.find(t=>t.key.toLowerCase()===hash);
if(atab) pendingTab=atab.key;
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
  closeReader:closeReader,
  /* the socket for the Semaphore's arenas: a read of them, and their
     drawer to lend over this room — filled by the bridge, then told of
     every change on the other side */
  setArenas:function(o){ ARENA_SRC=o||null; arenasArrived(); },
  arenasChanged:function(){ if(ARENA_SRC) arenasArrived(); },
  /* go through what waits to be judged, from the first find, as ChatGPT's
     answer put on the board asks */
  judge:function(){ if(ARENA_SRC) startJudging(); }
});
/* The room is built late and only once; the bridge waits for this to
   hand it the arenas. */
Hub.emit('callboard:ready');

});
