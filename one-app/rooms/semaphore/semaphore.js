/* ══════════ Brokerage Semaphore ══════════ */
Hub.mount('semaphore', function(window, document, localStorage){

'use strict';
/* ============ state ============ */
const LS='semaphore.v1';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>crypto.randomUUID?crypto.randomUUID():'id'+Math.random().toString(36).slice(2,10)+Date.now().toString(36);
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY=86400000;
const pad=n=>String(n).padStart(2,'0');
const T=iso=>new Date(iso+'T12:00:00').getTime();
const todayISO=()=>{const d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());};
const lastDay=(y,m)=>new Date(y,m,0).getDate();
const fmtDay=iso=>{const[y,m,d]=iso.split('-');return +d+' '+MONTHS[+m-1]+' '+y;};
const ymAdd=(ym,n)=>{const[y,m]=ym.split('-').map(Number);const i=y*12+(m-1)+n;return Math.floor(i/12)+'-'+pad(i%12+1);};
const thisYM=()=>todayISO().slice(0,7);

const GRADES={
  fixed:{name:'Fixed',long:'Published, confirmed'},
  uncertain:{name:'Uncertain',long:'Indicative, extrapolated or not yet announced'}
};
const KINDS={brokerage:{name:'Brokerage'},call:{name:'Call'}};
/* ───────── how much an arena is worth ─────────
   The rotation on its own treats every arena alike: a programme you watch out of
   diligence comes round as often as the partnership your work lives in, which is
   fine for eight arenas and a treadmill for forty. So each one carries a standing
   weight, set once in its own panel and rarely touched.

   It buys frequency, not height — the same choice the open call makes. A central
   arena turns about twice as often, a peripheral one about a third as often, and
   the freezer is simply the step past peripheral: one axis, four positions, from
   the work you are in to the work you have put away. */
/* Where a lead has got to. Three steps and no more: the point is to know at a
   glance whether anyone has been written to yet, not to run a pipeline. There is
   deliberately no 'agreed' — the moment something is agreed it stops being a
   lead and becomes a project on the ledger, so the last thing this side can say
   is that a conversation is running. Closing a lead is separate: one closed at
   'talking' came to something, one closed at 'spotted' did not, and between them
   an arena's record says whether it has ever been worth the attention.

   Anything still carrying the old fourth step is read as 'talking' — the far end
   of the funnel it actually reached — rather than dropped back to the start. */
const STAGES=['spotted','contacted','talking'];
const STAGE_NAME={spotted:'Spotted',contacted:'Contacted',talking:'Talking'};
const stageOf=l=>{const s=l&&l.stage;
  return STAGE_NAME[s]?s:(s==='agreed'?'talking':'spotted');};
/* How a closed lead ended, asked when it is completed (Mark, 2026-10-11): it
   became a project, it went nowhere, or the other side declined. Kept on the
   lead as `outcome`, beside `doneAt`. An open lead has none, and nor does one
   closed before the question was asked; that one reads as plainly closed.
   `said` is the quiet line of a closed lead. The Ledger's lead card asks the
   same question in the same words, written there too, as the ruit is. */
const OUTCOMES={project:{name:'Became a project',said:'became a project'},
                nowhere:{name:'Went nowhere',said:'went nowhere'},
                declined:{name:'They declined',said:'declined'}};
const isOutcome=k=>Object.prototype.hasOwnProperty.call(OUTCOMES,k);

const WEIGHTS={
  central:   {name:'Central',   turn:.6,lift:1, long:'Work you are actually in. Comes round about twice as often.'},
  ordinary:  {name:'Ordinary',  turn:1, lift:.5,long:'The ordinary rotation \u2014 about four weeks.'},
  peripheral:{name:'Peripheral',turn:3, lift:0, long:'Watched out of diligence. Comes round about a third as often.'}
};
const weightOf=a=>WEIGHTS[a&&a.weight]?a.weight:'ordinary';
const weightClass=a=>{const w=weightOf(a);return w==='ordinary'?'':' w-'+w;};

/* stages of a call, in the order they happen */
const ROLES={
  announcement:{name:'Announcement window',short:'announcement window',c:'var(--r-ann)',ord:0},
  publication:{name:'Publication date',short:'publication',c:'var(--r-pub)',ord:1},
  deadline:{name:'Submission deadline',short:'submission deadline',c:'var(--r-dl)',ord:2}
};
function roleOf(dt){return ROLES[dt&&dt.role]||ROLES.publication;}
function dtColor(dt){return dt.kind==='call'?roleOf(dt).c:'var(--brok)';}
const ROLE_ORDER=['announcement','publication','deadline'];
function dtLabel(dt){
  return dt.kind==='call'?(dt.call||'Untitled call'):(dt.label||'(untitled)');
}
function dtSub(dt){
  return dt.kind==='call'?(ROLES[dt.role]||ROLES.publication).short:(dt.note||'');
}

/* ───────── a type's colour ─────────
   Every arena type wears a colour, and every lead wears its arena's type
   colour — on the wall, on the Ledger's board and in Pocket (Mark,
   2026-10-11). Before, each arena had a colour of its own, chosen on one of
   its leads, and the leads of two Joint Undertakings looked unrelated.

   The tones began as soft earth tints, every one greyed down, so a lead
   never read as one of the Ledger's clean category tints. Mark wanted more
   of them, and then harder ones (2026-10-12): two shades of thirteen hues,
   light over deep, at twice the old colourfulness, every one of the same
   lightness in its row so none shouts over the others; four hues (aqua and
   teal, cornflower and cobalt, lilac and violet, rose and berry) fill what
   were the widest gaps around the wheel. The old keys are all still here,
   so a colour he chose for an arena can be carried over to its type. A type
   stores the key, not the hex, so adjusting a tone here moves every type
   wearing it. */
const TONES=[
  {k:'blush',      label:'Blush',      color:'#e19292'}, {k:'terracotta', label:'Terracotta', color:'#db9973'},
  {k:'sand',       label:'Sand',       color:'#cda364'}, {k:'straw',      label:'Straw',      color:'#bdaa62'},
  {k:'olive',      label:'Olive',      color:'#9db672'}, {k:'sage',       label:'Sage',       color:'#6ebe9b'},
  {k:'aqua',       label:'Aqua',       color:'#59beb8'}, {k:'mist',       label:'Mist',       color:'#5bbad0'},
  {k:'cornflower', label:'Cornflower', color:'#71b3e1'}, {k:'dusk',       label:'Dusk',       color:'#8faae8'},
  {k:'lilac',      label:'Lilac',      color:'#aca0e2'}, {k:'mauve',      label:'Mauve',      color:'#c598d1'},
  {k:'rose',       label:'Rose',       color:'#d992b3'},
  {k:'rosewood',   label:'Rosewood',   color:'#ad6464'}, {k:'rust',       label:'Rust',       color:'#a96b45'},
  {k:'umber',      label:'Umber',      color:'#9c7334'}, {k:'ochre',      label:'Ochre',      color:'#8d7b32'},
  {k:'moss',       label:'Moss',       color:'#6f8644'}, {k:'fern',       label:'Fern',       color:'#3c8d6d'},
  {k:'teal',       label:'Teal',       color:'#1b8e88'}, {k:'slate',      label:'Slate',      color:'#218a9f'},
  {k:'cobalt',     label:'Cobalt',     color:'#4183ae'}, {k:'twilight',   label:'Twilight',   color:'#617ab5'},
  {k:'violet',     label:'Violet',     color:'#7d71b0'}, {k:'plum',       label:'Plum',       color:'#9469a0'},
  {k:'berry',      label:'Berry',      color:'#a66384'}
];
/* The order a type is handed a tone when it has none: hues far apart first,
   because neighbours on the wheel are close by design, and two types made one
   after the other must not come out Terracotta and Rust. A type keeps the tone
   it was given, so moving types up and down never recolours them. */
const TONE_SPREAD=['terracotta','sage','cobalt','sand','mauve','teal','olive','rosewood','ochre',
  'lilac','mist','berry','straw','fern','dusk','rust','aqua','plum','blush','violet','umber',
  'cornflower','moss','rose','twilight','slate'];
const toneHex=k=>{const t=TONES.find(t=>t.k===k);return t?t.color:'';};
function freeTone(types){
  const used=new Set((types||[]).map(t=>t.color));
  return TONE_SPREAD.find(k=>!used.has(k))||TONE_SPREAD[(types||[]).length%TONE_SPREAD.length];
}
/* Every type comes out of here with a tone. One without is given the colour
   most of its arenas wore when colours were the arenas' own, so what Mark
   chose then carries over, and otherwise the next free tone. Pocket reads the
   same board, so it settles the same types the same way until the desk has
   saved them. */
function settleTones(s){
  const taken=new Set();
  s.types.forEach(t=>{if(toneHex(t.color))taken.add(t.color);else t.color=null;});
  s.types.forEach(t=>{
    if(t.color)return;
    const n={};
    s.arenas.forEach(a=>{if(a.typeId===t.id&&toneHex(a.color))n[a.color]=(n[a.color]||0)+1;});
    const best=Object.keys(n).filter(k=>!taken.has(k))
      .sort((x,y)=>n[y]-n[x]||TONE_SPREAD.indexOf(x)-TONE_SPREAD.indexOf(y))[0];
    t.color=best||freeTone(s.types.filter(u=>u.color));
    taken.add(t.color);
  });
}
function typeOf(a){return (a&&S.types.find(t=>t.id===a.typeId))||null;}
function arenaTone(a){const t=typeOf(a);return t?toneHex(t.color):'';}
function defaultTypes(){
  return ['Partnership','Mission','Cluster','Joint Undertaking','Programme']
    .map((n,i)=>({id:uid(),name:n,color:TONE_SPREAD[i]}));
}
function blank(){
  return {v:1,types:defaultTypes(),arenas:[],
    ui:{q:'',collapsed:{},view:'board',
        wallSort:'rotation',boardSort:'date',cuAll:false,
        howOpen:false,freezerOpen:false}};
}
/* An arena remembers which of its own dates it is waiting for. That goes stale
   the moment the dates change, so this puts it straight — a wait ends when the
   thing waited for is deleted or has been and gone. */
function reconcile(a){
  if(!a)return a;
  if(a.hold){
    const dt=(a.dates||[]).find(d=>d.id===a.hold.dateId&&d.start);
    if(!dt||T(dt.end||dt.start)<T(todayISO()))a.hold=null;
  }
  return a;
}
/* The one door everything that arrives comes through — storage, an import,
   the cloud. What leaves here is a board every other function in the room
   may assume the shape of, so the two collections the whole app iterates
   are made real first and the arenas are given the fields they are read
   for whether or not they came with them. */
function migrate(s){
  if(!s||typeof s!=='object'||Array.isArray(s))s={};
  if(!Array.isArray(s.arenas))s.arenas=[];
  if(!Array.isArray(s.types)||!s.types.length)s.types=defaultTypes();
  s.types=s.types.filter(t=>t&&typeof t==='object')
    .map(t=>({id:t.id||uid(),name:String(t.name||'').trim()||'Untitled type',
              color:typeof t.color==='string'?t.color:null}));
  s.arenas=s.arenas.filter(a=>a&&typeof a==='object');
  s.arenas.forEach(a=>{
    if(!a.id)a.id=uid();
    a.name=String(a.name==null?'':a.name).trim()||'Unnamed arena';
    if(!Array.isArray(a.tags))a.tags=[];
  });
  s.arenas.forEach(a=>{
    if(!Array.isArray(a.links))a.links=a.link?[{id:uid(),label:'',url:a.link}]:[];
    delete a.link;
    (a.links||[]).forEach(l=>{if(!l.id)l.id=uid();});
  });
  s.arenas.forEach(a=>{
    if(!a.brokerage||typeof a.brokerage!=='object')a.brokerage={notes:'',links:[]};
    if(!Array.isArray(a.brokerage.links))a.brokerage.links=[];
    if(typeof a.brokerage.notes!=='string')a.brokerage.notes='';
    /* Pinning once belonged to a single brokerage link, then to the whole card
       as well. Mark took the whole card's pin away on 2026-10-11 — Pinned is
       the round of links he keeps to hand and nothing else — so an arena's own
       `pin` is dropped here, and a link's `pin`, the moment it was pinned, is
       kept. */
    delete a.pin;
    a.brokerage.links.forEach(l=>{if(!l.id)l.id=uid();});
    /* the freezer holds the date it went in, so the panel can say since when */
    if(typeof a.frozenAt!=='string')a.frozenAt=null;
    /* how much this arena is worth of the rotation; unset means ordinary */
    if(!WEIGHTS[a.weight])a.weight='ordinary';
    /* one sweep clock and one follow-up. The old pair of stamps collapses
       into the sweep. */
    if(!('sweptAt' in a))a.sweptAt=a.lastCheckedAt||null;
    if(!('sweptPrev' in a))a.sweptPrev=a.prevCheckedAt||null;
    delete a.lastCheckedAt;delete a.prevCheckedAt;delete a.lastWatchedAt;delete a.prevWatchedAt;
    /* The look notice is gone — the nightly agents hunt for the event and the
       tool now and leave what they find in Dispatches — so the answers it kept
       ("nothing yet", "found it") have nothing left to answer and are dropped. */
    delete a.look;
    /* A lead is whatever a sweep turned up: a partner, a project page, a thread
       worth pursuing. The old single follow-up was the same object with nothing
       found yet — a name and a date — so it becomes one rather than sitting
       beside them. */
    if(!Array.isArray(a.leads))a.leads=[];
    if(a.todo&&typeof a.todo==='object'&&String(a.todo.text||'').trim())
      a.leads.push({id:uid(),project:String(a.todo.text).trim(),match:'',links:[],
                    stage:'spotted',due:a.todo.due||todayISO(),doneAt:null});
    delete a.todo;
    a.leads.forEach(l=>{
      if(!l.id)l.id=uid();
      /* a lead used to be a partner with a note; it is now the project itself,
         and a separate thought about who might fit it */
      if(typeof l.project!=='string')l.project=String(l.name||'').trim();
      if(typeof l.match!=='string')l.match=String(l.note||'');
      delete l.name;delete l.note;
      l.project=l.project.trim();
      /* through stageOf, so the fold from the old fourth step and the
         fallback for anything unreadable are each stated once. Written back
         rather than merely read: a lead that reached the far end of the
         funnel must not be knocked to the start of it on the way in. */
      l.stage=stageOf(l);
      /* Which way it was contacted — see "the ruit". A lead from before the
         two paths existed that had got past Spotted is put on the lower path,
         the lead itself; Mark asked only that the data come out clean. */
      l.toResearchers=l.toResearchers===true;
      l.toLead=l.toLead===true;
      if(l.stage==='spotted'){l.toResearchers=false;l.toLead=false;}
      else if(!l.toResearchers&&!l.toLead)l.toLead=true;
      if(!Array.isArray(l.links))l.links=[];
      l.links.forEach(k=>{if(!k.id)k.id=uid();});
      if(typeof l.due!=='string'||!l.due)l.due=null;
      if(typeof l.doneAt!=='string'||!l.doneAt)l.doneAt=null;
      /* how it ended: only a closed lead has an answer (see OUTCOMES) */
      if(!l.doneAt||!isOutcome(l.outcome))delete l.outcome;
      /* how much Mark thinks the lead is worth, 1 to 5 (see "the score");
         anything else is no score yet */
      if(!(l.score>=1&&l.score<=5))delete l.score;else l.score=Math.round(l.score);
      /* what has happened to it, oldest first; the old bolt-on wrote a
         formatted stamp, the card now writes the day itself */
      if(!Array.isArray(l.updates))l.updates=[];
      l.updates=l.updates.filter(u=>u&&typeof u.text==='string'&&u.text.trim())
        .map(u=>u.at?{at:String(u.at),text:u.text}:{stamp:String(u.stamp||''),text:u.text});
    });
    a.leads=a.leads.filter(l=>l.project||l.match||l.links.length||l.updates.length);
    /* parked until a dated event of its own; the date is held by reference, so
       moving the event moves the wait with it */
    if(!a.hold||typeof a.hold!=='object'||!a.hold.dateId)a.hold=null;
    else a.hold={dateId:String(a.hold.dateId)};
    delete a.todos;
    if(!Array.isArray(a.dates))a.dates=[];   /* the rest of the app iterates this freely */
    a.dates.forEach(dt=>{
      /* everywhere else reads a date as call-or-brokerage and as one of the
         granularities the editor offers — 'none' among them, which is how an
         entry says it is coming but has no date yet */
      dt.kind=dt.kind==='call'?'call':'brokerage';
      if(!['day','month','quarter','half','year','range','none'].includes(dt.gran))
        dt.gran=dt.start?((dt.end&&dt.start!==dt.end)?'range':'day'):'none';
      /* A date is a span of one day or of many, and everything downstream
         reads both ends of it. A file written by hand, or by a version that
         only ever kept single days, can arrive with a start and no end —
         and T(undefined) is NaN, which then runs silently through the whole
         standing calculation and leaves the card with a score no comparison
         can order. Both ends, once, here. */
      if(!dt.start)dt.start=null;
      if(!dt.end)dt.end=dt.start;
      if(dt.start&&dt.end<dt.start){const e=dt.end;dt.end=dt.start;dt.start=e;}
      if(dt.grade!=='fixed')dt.grade='uncertain';
      if(dt.kind==='call'){
        if(!dt.call)dt.call=dt.label||'Call';
        if(!ROLES[dt.role])dt.role='publication';
      }
    });
  });
  /* An arena's own colour is its type's now (see "a type's colour"): read
     once to give the types theirs, then gone. */
  settleTones(s);
  s.arenas.forEach(a=>{delete a.color;});
  /* ── the ui, whole ──
     Every field below was guarded one at a time, and each guard asked only
     whether `s.ui` existed at all. A board arriving with *some* of a ui —
     a hand-edited file, an export from a build that kept fewer settings —
     therefore passed straight through with holes in it, and the first
     render read `S.ui.tagSel.filter` off nothing and threw. That throw
     happened after the state had already been written to storage, so the
     room came back dead on the next load and stayed dead: exactly the loss
     the load() below refuses to allow, arriving by the other door.

     So the ui is not patched field by field any more. A fresh, complete one
     is made, and whatever arrived is laid over it a field at a time, each
     one taken only if it is the shape that field is meant to be. There is
     no way through this that leaves a hole. */
  {
    const d=blank().ui, u=(s.ui&&typeof s.ui==='object'&&!Array.isArray(s.ui))?s.ui:{};
    const map=v=>(v&&typeof v==='object'&&!Array.isArray(v))?v:null;
    const ui=Object.assign({},d);
    ui.q        = typeof u.q==='string' ? u.q : d.q;
    ui.collapsed= map(u.collapsed) || {};
    ui.view     = ['brokerage','dispatch','coming'].includes(u.view) ? u.view : 'board';
    ui.cuAll    = u.cuAll===true;
    /* By type was merged into the rotation (2026-10-11), so it lands there */
    ui.wallSort = ['pinned','leads'].includes(u.wallSort) ? u.wallSort : 'rotation';
    /* the board's two orders since 2026-10-11 (see "the board's two orders");
       the two it had before — next publication, and by status — both read as
       the date order, which took their place */
    ui.boardSort = u.boardSort==='mine' ? 'mine' : 'date';
    ui.howOpen     = u.howOpen===true;
    ui.freezerOpen = u.freezerOpen===true;
    s.ui=ui;
  }
  const first=new Map();
  s.arenas.forEach(a=>(a.tags||[]).forEach(t=>{
    const k=String(t).trim().toLowerCase();
    if(k&&!first.has(k))first.set(k,String(t).trim());
  }));
  s.arenas.forEach(a=>{
    const seen=new Set(),out=[];
    (a.tags||[]).forEach(t=>{const k=String(t).trim().toLowerCase();
      if(!k||seen.has(k))return;seen.add(k);out.push(first.get(k));});
    a.tags=out;
  });
  /* Anything an arena remembers about its dates has to be reconciled whenever
     those dates change — on load here, and at the moment of an edit below. */
  s.arenas.forEach(reconcile);
  return s;
}
/* Reading the board is the one place this app can lose everything: if migrate
   throws, the old code caught it, opened a blank board and let the next save
   write that blank over the only copy. So a genuine first run is told apart from
   a board that would not read — and in the second case nothing is written at
   all, leaving the stored text untouched for a reload or an import to recover. */
let loadError=null;
function load(){
  const raw=localStorage.getItem(LS);
  if(!raw)return null;                       /* nothing stored: a real first run */
  try{
    const s=JSON.parse(raw);
    if(!s||!s.arenas||!s.types)throw new Error('not a Semaphore board');
    return migrate(s);
  }catch(e){
    loadError=e;
    return null;
  }
}
let S=load()||blank();
let saveWarned=false;
function save(){
  if(loadError)return;                       /* refuse to overwrite what we could not read */
  try{localStorage.setItem(LS,JSON.stringify(S));}
  catch(e){
    /* Once. A failing write fails on every keystroke after it, and a box
       that will not go away is worse than the thing it is reporting. */
    if(saveWarned)return;
    saveWarned=true;
    Ask.tell('Could not save',
      'This board could not be written to browser storage, so changes may '+
      'not survive a reload. Export it from the Ledger to keep a copy. ('+e.message+')');
  }
}

/* ============ date semantics ============ */
function resolve(gran,v){
  switch(gran){
    case 'day':return v.day?[v.day,v.day]:[null,null];
    case 'month':return v.y&&v.m?[v.y+'-'+pad(v.m)+'-01',v.y+'-'+pad(v.m)+'-'+pad(lastDay(v.y,v.m))]:[null,null];
    case 'quarter':{if(!v.y||!v.q)return[null,null];const m1=(v.q-1)*3+1,m2=m1+2;
      return[v.y+'-'+pad(m1)+'-01',v.y+'-'+pad(m2)+'-'+pad(lastDay(v.y,m2))];}
    case 'half':{if(!v.y||!v.h)return[null,null];const m1=v.h===1?1:7,m2=m1+5;
      return[v.y+'-'+pad(m1)+'-01',v.y+'-'+pad(m2)+'-'+pad(lastDay(v.y,m2))];}
    case 'year':return v.y?[v.y+'-01-01',v.y+'-12-31']:[null,null];
    case 'range':{if(!v.from||!v.to)return[null,null];return v.to<v.from?[v.to,v.from]:[v.from,v.to];}
    default:return[null,null];
  }
}
function dispDate(dt){
  if(dt.gran==='none'||!dt.start)return 'no date yet';
  const[y,m]=dt.start.split('-').map(Number);
  switch(dt.gran){
    case 'day':return fmtDay(dt.start);
    case 'month':return MONTHS[m-1]+' '+y;
    case 'quarter':return 'Q'+(Math.floor((m-1)/3)+1)+' '+y;
    case 'half':return 'H'+(m<7?1:2)+' '+y;
    case 'year':return String(y);
    case 'range':return fmtDay(dt.start)+' \u2013 '+fmtDay(dt.end);
    default:return '';
  }
}
function gradeOptions(gran){
  /* only an exact day or an exact span can ever be called fixed */
  return (gran==='day'||gran==='range')?['fixed','uncertain']:['uncertain'];
}
function gradeDefault(gran){
  return gran==='day'?'fixed':'uncertain';
}

/* ============ filtering ============ */
function typeName(id){const t=S.types.find(t=>t.id===id);return t?t.name:'(no type)';}
/* The freezer is one rule, applied once: a frozen arena is not in the pool the
   board, the wall, the search or the counts draw from. Nothing downstream has
   to know about it. */
function liveArenas(){return S.arenas.filter(a=>!a.frozenAt);}
function frozenArenas(){
  return S.arenas.filter(a=>!!a.frozenAt)
    .sort((x,y)=>(y.frozenAt||'').localeCompare(x.frozenAt||'')||x.name.localeCompare(y.name));
}
/* Search runs over everything you have written down, not only the arena's name.
   A lead is usually the only place a partner's name is recorded, so "which arena
   was Fraunhofer under" is precisely the question the board could not answer
   while the box matched titles alone. */
function haystack(a){
  const bk=a.brokerage||{};
  const parts=[a.name,(a.tags||[]).join(' '),a.notes||'',bk.notes||''];
  (a.links||[]).concat(bk.links||[]).forEach(l=>parts.push(l.label||'',l.url||''));
  (a.leads||[]).forEach(l=>{
    parts.push(l.project||'',l.match||'',STAGE_NAME[stageOf(l)]);
    (l.updates||[]).forEach(u=>parts.push(u.text||''));
    (l.links||[]).forEach(k=>parts.push(k.label||'',k.url||''));
  });
  (a.dates||[]).forEach(d=>parts.push(dtLabel(d),d.note||''));
  return parts.join('\n').toLowerCase();
}
/* which leads answer to the current query — so a card can open itself at the
   one you were looking for rather than merely appearing for no visible reason */
function leadHits(a,ql){
  if(!ql)return [];
  return (a.leads||[]).filter(l=>
    ([l.project||'',l.match||'']
      .concat((l.links||[]).map(k=>(k.label||'')+' '+(k.url||'')))
      .concat((l.updates||[]).map(u=>u.text||''))
      .join(' ').toLowerCase()).includes(ql));
}
/* The search is the only thing that narrows the board. The type, tag,
   certainty and layer filters are gone: they hid arenas and dates behind a
   panel that was usually shut, so the board could look emptier than it was
   with nothing on screen saying why. */
function visibleArenas(){
  const ql=S.ui.q.trim().toLowerCase();
  return liveArenas().filter(a=>!ql||haystack(a).includes(ql));
}
/* an empty screen should say what to do, not just that it is empty */
function emptyReason(onBoard){
  const frozen=S.arenas.length-liveArenas().length;
  return frozen&&frozen===S.arenas.length
    ?['Every arena is in the freezer.',
      onBoard?'Thaw one below to put it back.':'Thaw one from the freezer under the board.']
    :['Nothing matches the search.','Clear it, or try a shorter word.'];
}
/* Tags match case-insensitively. The first spelling entered is the one kept,
   so "SME" stays "SME" and typing "sme" later reuses it rather than splitting. */
const tkey=t=>String(t).trim().toLowerCase();
function canonTag(t){
  const k=tkey(t);
  for(const a of S.arenas)for(const x of a.tags||[])if(tkey(x)===k)return x;
  return String(t).trim();
}
function cleanTags(list){
  const out=[],seen=new Set();
  for(const raw of list){
    const t=String(raw).trim();if(!t)continue;
    const k=tkey(t);if(seen.has(k))continue;
    seen.add(k);out.push(canonTag(t));
  }
  return out;
}

/* ============ search ============ */
/* One box, opened from its button in the header. Typing narrows whichever
   view is showing; an empty box that loses focus folds back into the button,
   and a box with words in it stays open, so a narrowed board always shows
   what narrowed it. */
function searchChanged(){
  save();
  if(S.ui.view==='brokerage')renderWall();else renderBoard();
  if(S.ui.view==='coming')renderComing();
}
function applySearchBox(open){
  const si=$('#search'),b=$('#searchBtn');
  const show=open||!!S.ui.q;
  si.hidden=!show;b.hidden=show;
  if(si.value!==S.ui.q)si.value=S.ui.q;
}

/* ============ render: board ============ */
let T0=0,T1=1,SPAN=12,WSTART='';
function winTimes(){
  /* The board always shows last month and the next twelve: the controls
     that moved the window and changed its span went with the filter panel. */
  SPAN=12;WSTART=ymAdd(thisYM(),-1);
  T0=T(WSTART+'-01');
  T1=T(ymAdd(WSTART,SPAN)+'-01');
}
const X=t=>(t-T0)/(T1-T0)*100;

function laneBG(){
  const q=[],l=[];
  for(let i=0;i<SPAN;i++){
    const a=X(T(ymAdd(WSTART,i)+'-01')),b=X(T(ymAdd(WSTART,i+1)+'-01'));
    const m=+ymAdd(WSTART,i).split('-')[1];
    const col=Math.floor((m-1)/3)%2===1?'rgba(0,0,0,.22)':'transparent';
    q.push(col+' '+a+'%, '+col+' '+b+'%');
    if(i>0)l.push('transparent calc('+a+'% - 1px), var(--grid) calc('+a+'% - 1px), var(--grid) '+a+'%, transparent '+a+'%');
  }
  return 'linear-gradient(90deg, transparent 0%, '+l.join(', ')+', transparent 100%), linear-gradient(90deg, '+q.join(', ')+')';
}

function axisHTML(){
  let cells='';
  for(let i=0;i<SPAN;i++){
    const ym=ymAdd(WSTART,i);
    const[y,m]=ym.split('-').map(Number);
    const left=X(T(ym+'-01'));
    const jan=m===1||i===0;
    const full=MONTHS[m-1]+(jan?' \u2019'+String(y).slice(2):'');
    cells+='<span class="mcell'+(m===1?' jan':'')+'" style="left:'+left+'%">'+full+'</span>';
  }
  const now=T(todayISO());
  if(now>=T0&&now<=T1)cells+='<div class="nowcaret" style="left:'+X(now)+'%"></div>';
  return cells;
}

function callSpans(a){
  const by=new Map();
  for(const dt of a.dates){
    if(dt.kind!=='call'||!dt.start)continue;
    if(dt.role!=='publication'&&dt.role!=='deadline')continue;
    const k=(dt.call||'').trim().toLowerCase();if(!k)continue;
    if(!by.has(k))by.set(k,{});
    by.get(k)[dt.role]=dt;
  }
  const out=[];
  for(const[,v]of by){
    if(v.publication&&v.deadline&&v.publication.start<=v.deadline.end)
      out.push({name:v.publication.call,from:v.publication.start,to:v.deadline.end,
                pub:v.publication.id,dl:v.deadline.id});
  }
  return out;
}
/* Every marker this arena puts into its lane, for the window on screen.

   Brokerage is drawn first and largest, because it is what the room is for:
   a diamond for a day, a band for a span. Calls are drawn the way the cards
   draw them (see callRuns): one bar from publication to deadline under the
   brokerage marks, the stages of one call as one bar with a notch, and calls
   with the same dates as one bar. They used to be a hairline between two
   ticks, so an arena with three calls was three stacked hairlines and six
   ticks, and every uncertain date was a soft blur on top (Mark, 2026-10-07:
   overhaul the board "in a similar style" to the cards).

   Uncertain is a dashed outline here as everywhere else in the room. It was
   a haze on the board and a dash on the cards for an evening, and Mark chose
   the dash for both: a blurred 4px bar only looks out of focus.

   Whatever is over is grey — a closed call, a brokerage day gone by — so the
   colour on a row is what still lies ahead of it. */
function laneHTML(a){
  let h='';
  const now=T(todayISO());
  for(const dt of a.dates){
    if(dt.kind==='call'||!dt.start)continue;
    const s=T(dt.start),e=T(dt.end)+DAY;
    if(e<T0||s>T1)continue;
    const L=Math.max(0,X(s)),R=Math.min(100,X(e)),W=R-L;
    const unc=dt.grade!=='fixed',past=e<=now;
    const data=' data-act="jumpDate" data-a="'+a.id+'" data-d="'+dt.id+'" data-tipd="1" tabindex="0" role="button" aria-label="'+esc(dtLabel(dt))+'"';
    if(dt.gran==='day'){
      h+='<div class="mk bk '+(unc?'bk-unc':'bk-fixed')+(past?' past':'')+'" style="left:'+X(s+DAY/2)+'%"'+data+'></div>';
    }else{
      const lbl=W>7?'<span class="bl">'+esc(dtLabel(dt))+'</span>':'';
      h+='<div class="mk bk bk-band'+(unc?' unc':'')+(past?' past':'')+'" style="left:'+L+'%;width:'+W+'%"'+data+'>'+lbl+'</div>';
    }
  }
  /* Where two bars overlap, a bar takes the lowest level whose previous
     occupant has already cleared, with daylight between them, three levels
     at most. The floor never moves, so the earliest call in every lane sits
     on one baseline across the whole board. A call with no publication
     recorded comes in faded from three weeks before its deadline; one with
     no deadline runs out faded five weeks past its publication. */
  {
    const gap=(T1-T0)*.015,freeAt=[],placed=[];
    const items=callRuns(a).all
      .map(r=>({r,s:r.open?T(r.open.start):T(r.close.start)-21*DAY,
                  e:r.close?T(r.close.end||r.close.start)+DAY:T(r.open.start)+35*DAY}))
      .filter(x=>x.e>=T0&&x.s<=T1)
      .sort((x,y)=>x.s-y.s||x.e-y.e);
    for(const it of items){
      let lv=0;
      while(lv<freeAt.length&&freeAt[lv]+gap>it.s)lv++;
      freeAt[lv]=it.e;
      placed.push({it,lv:Math.min(lv,2)});
    }
    const Y=[[5],[5],[4,11],[3,9,15]][Math.min(freeAt.length,3)]||[5];
    for(const{it,lv}of placed){
      const r=it.r,L=Math.max(0,X(it.s)),R=Math.min(100,X(it.e)),W=Math.max(R-L,.3);
      const notch=r.dls.slice(0,-1).map(d=>{const x=X(T(d.start));
        return x>=L&&x<=R?'<i style="left:'+((x-L)/W*100).toFixed(1)+'%"></i>':'';}).join('');
      const at=r.next||r.close||r.open;
      const cls=(r.state==='closed'?' past':'')+(r.unc?' unc':'')+(r.open?'':' lead-in')+(r.close?'':' run-on');
      h+='<div class="mk cl rb'+cls+'" style="left:'+L.toFixed(2)+'%;width:'+W.toFixed(2)+'%;bottom:'+Y[lv]+'px" '+
         'data-act="openDate" data-a="'+a.id+'" data-d="'+at.id+'" data-tipt="'+esc(runTip(r))+'" '+
         'tabindex="0" role="button" aria-label="'+esc(dtLabel(at)+', '+dispDate(at))+'">'+notch+'</div>';
    }
  }
  if(now>=T0&&now<=T1)h+='<div class="now" style="left:'+X(now)+'%"></div>';
  return h;
}
/* ───────── the board's two orders ─────────
   Mark chooses between two, from the heading over the column beside the
   names (2026-10-11), and each group of the board follows it:
   MINE   his own order of the arenas within a type, set by dragging in the
          list of types, kept on each arena as `bkPos`.
   DATE   whatever comes first: the soonest deadline, call opening or
          brokerage event still to come, so the arena with the nearest
          thing to act on stands at the top. A brokerage entry spanning more
          than about six weeks is a season pencilled in, not an event, and
          does not count, as in eventNear. An arena with nothing coming goes
          to the foot, by name.
   It replaced two orders that each said half of this: the next publication
   only, and Opens / Open / Between. */
function nextKeyT(a){
  const now=T(todayISO());
  let best=Infinity;
  for(const dt of a.dates||[]){
    if(!dt.start||T(dt.end||dt.start)<now)continue;
    if(dt.kind==='call'?!(dt.role==='deadline'||dt.role==='publication')
                       :T(dt.end||dt.start)-T(dt.start)>45*DAY)continue;
    best=Math.min(best,Math.max(now,T(dt.start)));
  }
  return best;
}
function mineOrder(x,y){return bkPos(x)-bkPos(y)||x.name.localeCompare(y.name);}
function dateOrder(x,y){
  const a=nextKeyT(x),b=nextKeyT(y);
  return (a===b?0:a-b)||x.name.localeCompare(y.name);
}
const boardOrder=()=>S.ui.boardSort==='mine'?mineOrder:dateOrder;
const BOARD_SORTS={mine:{name:'My order',long:'Your own order, as set in Types'},
                   date:{name:'By date',long:'Soonest first: the nearest deadline, call opening or brokerage event'}};
let sortOpen=false;
/* The board stays a picture of the calendar. The one thing that gets a mark
   here is a wait whose date is coming up, in the green todos always wear. */
function boardRow(a,bg){
  const looms=a.dates.filter(d=>!d.start);
  const loomBtn=looms.length?
    '<button class="loom" data-act="openArena" data-id="'+a.id+'" data-tipl="1"><i class="sw sw-uncertain"></i>'+looms.length+'</button>':'';
  const st=standing(a);
  const owed=st.state==='wake'?'Coming up: '+st.hold.label:'';
  const due=owed?
    '<button class="duemk" data-act="openArena" data-id="'+a.id+'" '+
    'title="'+esc(owed)+'" aria-label="'+esc(owed)+'"></button>':'';
  /* The column beside the names that said Open / Opens / Between went on
     2026-10-11 (Mark): the calendar beside the name says it already. */
  return '<div class="row"><div class="cell name">'+
    '<button class="nm'+weightClass(a)+'" data-act="openArena" data-id="'+a.id+'">'+esc(a.name)+'</button>'+due+loomBtn+
    '</div>'+
    '<div class="lane" style="background-image:'+bg+'" data-aid="'+a.id+'">'+laneHTML(a)+'</div></div>';
}
function renderBoard(){keepPlace(()=>{
  winTimes();
  const board=$('#board');
  if(loadError){
    board.innerHTML='<div class="empty"><p>The saved board could not be read.</p>'+
      '<p class="hint" style="margin-top:6px">Nothing has been changed and nothing is being saved \u2014 '+
      'what was stored is still in this browser, untouched.<br>'+
      'Reload to try again, or import your most recent export.<br><br>'+
      esc(String(loadError&&loadError.message||loadError))+'</p></div>';
    return;
  }
  if(!S.arenas.length){
    board.innerHTML='<div class="empty"><p>Nothing on the board yet.</p>'+
      '<p class="hint" style="margin-top:6px">Add an arena, paste a batch through Quick add,<br>or load the example set to see how it reads.</p>'+
      '<div class="btns"><button class="btn primary" data-act="addArena">+ Arena</button>'+
      '<button class="btn" data-act="openQuick">Quick add</button>'+
      '<button class="btn" data-act="seed">Load example set</button></div></div>';
    return;
  }
  const bg=laneBG();
  const vis=visibleArenas();
  if(!vis.length){
    const[head,hint]=emptyReason(true);
    board.innerHTML='<div class="empty"><p>'+head+'</p>'+
      '<p class="hint" style="margin-top:6px">'+hint+'</p></div>';
    return;
  }
  /* The heading over the names names the order the groups are in, and opens
     the choice of the two (Mark, 2026-10-11). It stood over a status column,
     saying "Where", which named neither the column nor what pressing it
     did; the column went the same day, and the choice came over here. */
  const so=BOARD_SORTS[S.ui.boardSort];
  let h='<div class="axisrow"><div class="corner sorter">Arena<button class="whsort'+(sortOpen?' on':'')+'" data-act="boardSort" '+
      'aria-haspopup="listbox" aria-expanded="'+sortOpen+'" title="Order of the arenas in each type: '+esc(so.long)+'">'+so.name+
      '<i aria-hidden="true">\u25BE</i></button>'+
      (sortOpen?'<span class="whmenu" role="listbox" aria-label="Order of the arenas">'+
        Object.keys(BOARD_SORTS).map(k=>'<button class="'+(k===S.ui.boardSort?'sel':'')+'" data-act="boardSortSet" data-v="'+k+'" '+
          'role="option" aria-selected="'+(k===S.ui.boardSort)+'"><b>'+BOARD_SORTS[k].name+'</b><span>'+BOARD_SORTS[k].long+'</span></button>').join('')+
      '</span>':'')+'</div>'+
    '<div class="axis" style="background:'+bg+'">'+axisHTML()+'</div></div>';
  for(const ty of S.types){
    const group=vis.filter(a=>a.typeId===ty.id).sort(boardOrder());
    if(!group.length)continue;
    const col=!!S.ui.collapsed[ty.id];
    h+='<div class="grp'+(col?' collapsed':'')+'" style="--tone:'+esc(toneHex(ty.color))+'">'+
       '<div class="ghead"><div class="gc">'+
       '<button class="caret" data-act="toggleGroup" data-id="'+ty.id+'" aria-label="Collapse group">'+(col?'\u25B8':'\u25BE')+'</button>'+
       '<span class="gname">'+esc(ty.name)+'</span><span class="gcount">'+group.length+'</span></div></div>';
    if(col){h+='</div>';continue;}
    for(const a of group)h+=boardRow(a,bg);
    h+='</div>';
  }
  const orphans=vis.filter(a=>!S.types.some(t=>t.id===a.typeId)).sort(boardOrder());
  if(orphans.length){
    h+='<div class="grp"><div class="ghead"><div class="gc"><span class="gname">Untyped</span>'+
       '<span class="gcount">'+orphans.length+'</span></div></div>';
    for(const a of orphans)h+=boardRow(a,bg);
    h+='</div>';
  }
  board.innerHTML=h;
});}

/* ============ render: freezer ============
   The board's own footnote: it belongs to the timeline, not to the brokerage
   views, so it shows there and nowhere else. Shut by default — the freezer is
   somewhere to put things, not somewhere to look — and grouped by type in the
   board's order, against the board's own name column. */
function renderFreezer(){
  const el=$('#freezer'),list=frozenArenas();
  if(!list.length||S.ui.view!=='board'){el.hidden=true;el.innerHTML='';return;}
  el.hidden=false;
  const open=!!S.ui.freezerOpen;
  const chip=a=>'<span class="frchip">'+
      '<button class="frname" data-act="openArena" data-id="'+a.id+'" '+
        'title="Frozen '+esc(shortDay(a.frozenAt))+'">'+esc(a.name)+'</button>'+
      '<button class="frout" data-act="thaw" data-id="'+a.id+'" '+
        'title="Put '+esc(a.name)+' back on the board" aria-label="Thaw '+esc(a.name)+'">Thaw</button>'+
    '</span>';
  const byName=(x,y)=>x.name.localeCompare(y.name);
  const group=(name,members)=>members.length
    ? '<div class="frgrp"><span class="frty">'+esc(name)+'<i>'+members.length+'</i></span>'+
        '<div class="frchips">'+members.sort(byName).map(chip).join('')+'</div></div>'
    : '';
  const body=S.types.map(t=>group(t.name,list.filter(a=>a.typeId===t.id))).join('')+
    group('Untyped',list.filter(a=>!S.types.some(t=>t.id===a.typeId)));
  el.innerHTML='<button class="frbar" data-act="toggleFreezer" aria-expanded="'+(open?'true':'false')+'">'+
      '<i class="frost"></i>Freezer<span class="frn">'+list.length+'</span>'+
      '<span class="frcaret">'+(open?'\u25BE':'\u25B8')+'</span></button>'+
    (open?'<div class="frbody">'+body+'</div>':'');
}

/* ============ dispatches ============
   A scheduled task in the cloud reads the programmes' own pages and leaves
   what it found in a table of its own. Nothing it says is on the board: a
   finding is read here, and becomes a date, a link or an arena only when it
   is accepted. That is the whole design — a website changes its layout, or a
   page says something the agent reads too generously, and the cost of it is a
   line you dismiss rather than a wrong date under your nose for a month.

   The findings are not kept in `S`. They live in the cloud, they are read
   when this view is opened, and what is done with one is written back there
   before anything happens here — so two machines cannot accept the same
   finding twice, and a board exported to a file carries no half-answered
   inbox with it. */
const finds={rows:[],state:'cold',error:null,busy:null,said:'',all:false};

function loadFinds(){
  const api=(typeof Hub!=='undefined'&&Hub.api)?Hub.api('semaphore-inbox'):null;
  if(!api||!api.ready()){
    finds.state='nocloud';finds.rows=[];renderDispatch();return;
  }
  finds.state='reading';finds.error=null;renderDispatch();
  settleAsks();
  api.list((rows,err)=>{
    if(err){finds.state='error';finds.error=err;finds.rows=[];}
    else{finds.state='ready';finds.rows=rows;}
    renderDispatch();applyView();
  });
}

/* What a finding would read like on the board, in the board's own words. The
   date it describes is the same object the editor makes, so `dispDate` and the
   grade swatches say exactly what they will say once it is accepted. */
function findDate(r){
  return {id:uid(),kind:r.date_kind==='call'?'call':'brokerage',
          label:r.label||'',call:r.call||'',
          role:ROLES[r.role]?r.role:(r.date_kind==='call'?'publication':''),
          gran:r.gran||'none',grade:r.grade==='fixed'?'fixed':'uncertain',
          start:r.start_date||null,end:r.end_date||r.start_date||null,note:''};
}
function findHost(u){
  try{return new URL(u).hostname.replace(/^www\./,'')+new URL(u).pathname.replace(/\/$/,'');}
  catch(e){return u||'';}
}
function findText(r){
  const a=arena(r.arena_id);
  if(r.kind==='link'){
    const ev=siteFor(r);
    if(ev)return 'Website — <b>'+esc(dtLabel(ev))+'</b> <span class="dpwhen">'+esc(dispDate(ev))+'</span>'+
      ' <span class="dpwas">'+esc(findHost(r.url))+'</span>';
    return 'Link — <b>'+esc(r.label||findHost(r.url))+'</b> for the brokerage links';
  }
  if(r.kind==='arena')
    return 'New arena — <b>'+esc(r.arena_name)+'</b>'+(r.note?' — '+esc(r.note):'');
  /* a rewrite shows the text it would replace, read from the board now, since
     that is what Accept throws away */
  if(r.kind==='info'){
    const old=a?String((r.date_kind==='brokerage'?(a.brokerage||{}).notes:a.notes)||'').trim():'';
    return 'New <b>'+infoName(r)+'</b> text — '+esc(r.note||'')+
      '<span class="dpwas dpold">'+(old?'was: '+esc(old):'was empty')+'</span>';
  }
  const dt=findDate(r);
  const when='<span class="dpwhen">'+esc(dispDate(dt))+'</span>';
  /* a correction says what it replaces, because the old date is the thing you
     are being asked about */
  let was='';
  if(r.replaces_date_id&&a){
    const old=(a.dates||[]).find(d=>d.id===r.replaces_date_id);
    if(old)was=' <span class="dpwas">was '+esc(dispDate(old))+'</span>';
  }
  if(dt.kind==='call')
    return 'Call — <span class="dpcall">'+esc(dt.call||'Call')+' · '+
           esc(roleOf(dt).short)+'</span> '+when+was;
  return 'Brokerage — <b>'+esc(dt.label||'Event')+'</b> '+when+was;
}
function findSwatch(r){
  if(r.kind==='arena'||r.kind==='link'||r.kind==='info')return '<i class="sw sw-uncertain"></i>';
  const dt=findDate(r);
  if(dt.kind==='call')return '<i class="sw sw-call"></i>';
  return '<i class="sw sw-'+dt.grade+'"></i>';
}
function findRow(r){
  const busy=finds.busy===r.id||finds.all;
  return '<div class="dprow'+(busy?' gone':'')+'" data-fid="'+r.id+'">'+
    '<span class="dpw">'+findSwatch(r)+'</span>'+
    '<span class="dptx">'+findText(r)+
      (r.evidence?'<span class="dpev">“'+esc(r.evidence)+'”</span>':'')+
      '<a class="dpsrc" href="'+esc(r.source_url)+'" target="_blank" rel="noopener">'+
        esc(findHost(r.source_url))+'</a>'+
      /* the event's own page, when the agent found one apart from where it read
         the date — this is the link Accept puts among the brokerage links */
      (r.kind==='date'&&r.url&&linkKey(r.url)!==linkKey(r.source_url)?
        '<a class="dpsrc" href="'+esc(r.url)+'" target="_blank" rel="noopener" title="The event\u2019s own page">'+
        esc(findHost(r.url))+'</a>':'')+
    '</span>'+
    '<span class="dpa">'+
      '<button class="nbtn" data-act="findTake" data-f="'+r.id+'"'+(busy?' disabled':'')+
        ' title="Put this on the board">Accept</button>'+
      '<button class="nbtn" data-act="findDrop" data-f="'+r.id+'"'+(busy?' disabled':'')+
        ' title="Not right — and do not offer it again">Dismiss</button>'+
    '</span>'+
  '</div>';
}
function renderDispatch(){
  const el=$('#dispatch');
  if(!el)return;
  const bar=body=>'<div class="dpbar">'+body+'</div>';
  if(finds.state==='nocloud'){
    el.innerHTML=bar('<span class="dpsay">Not connected.</span>'+
      '<span class="spacer"></span>'+
      '<button class="btn ghost" data-act="findRefresh">Try again</button>')+
      '<p class="dpnote">The findings live beside this board in the cloud, so this '+
      'view needs the connection set in the Ledger’s cloud panel.</p>';
    return;
  }
  if(finds.state==='cold'||finds.state==='reading'){
    el.innerHTML=bar('<span class="dpsay">Reading…</span>');
    return;
  }
  if(finds.state==='error'){
    el.innerHTML=bar('<span class="dpsay dperr">Could not read them — '+esc(finds.error)+'</span>'+
      '<span class="spacer"></span>'+
      '<button class="btn ghost" data-act="findRefresh">Try again</button>');
    return;
  }
  /* grouped by arena, in the order they were found: a morning’s batch for one
     programme is read together, and the arenas with nothing to say are absent
     rather than listed as empty */
  const order=[],by=new Map();
  finds.rows.forEach(r=>{
    const k=r.arena_id||('new:'+String(r.arena_name||'').toLowerCase());
    if(!by.has(k)){by.set(k,[]);order.push(k);}
    by.get(k).push(r);
  });
  const head=bar('<span class="dpsay">'+
      (finds.rows.length?'<b>'+finds.rows.length+'</b> waiting — nothing is on the board '+
        'until you accept it.':'Nothing waiting.')+'</span>'+
      (finds.said?'<span class="dpsay">'+esc(finds.said)+'</span>':'')+
      '<span class="spacer"></span>'+
      /* only from two up: with one finding waiting it would be a second
         Accept button for the same row */
      (finds.rows.length>1?'<button class="btn ghost" data-act="findAll"'+
        (finds.all||finds.busy!=null?' disabled':'')+
        ' title="Put every finding below on the board">Accept all</button>':'')+
      '<button class="btn ghost" data-act="findRefresh"'+(finds.all?' disabled':'')+
        '>Check again</button>');
  if(!finds.rows.length){
    el.innerHTML=head+'<p class="dpnote">Each night the agent looks through about three arenas, and any '+
      'you have asked it to, for brokerage events (new ones, and changes to the ones on the board) and '+
      'partner-search tools, and offers a short rewrite of their About and Brokerage texts where those are '+
      'wrong, out of date or missing something important. Once a week it looks for call dates, new and '+
      'changed, and programmes you are not watching yet. Whatever it finds waits here.</p>';
    return;
  }
  const groups=order.map(k=>{
    const rows=by.get(k),a=arena(rows[0].arena_id);
    const name=a?a.name:rows[0].arena_name;
    return '<div class="dpgrp"><p class="dph">'+esc(name)+
      (a?'':' <b>· not on the board yet</b>')+
      ' <b>· '+rows.length+'</b></p>'+rows.map(findRow).join('')+'</div>';
  }).join('');
  el.innerHTML=head+'<div class="dplist">'+groups+'</div>';
}

/* An ask to the agent (see askHTML) is put out here, once the agent's own log
   shows it has looked at that arena since the ask was made. The times are
   compared as moments, not as text: the database writes them in a different
   spelling from the browser's. */
function settleAsks(){
  const api=(typeof Hub!=='undefined'&&Hub.api)?Hub.api('semaphore-inbox'):null;
  if(!api||!api.visits||!api.ready())return;
  const asked=S.arenas.filter(a=>a.askAt);
  if(!asked.length)return;
  const since=asked.map(a=>a.askAt).sort()[0];
  api.visits(since,(rows,err)=>{
    if(err||!rows)return;
    let changed=false;
    for(const a of asked){
      const at=Date.parse(a.askAt);
      if(rows.some(r=>r.arena_id===a.id&&Date.parse(r.checked_at)>at)){a.askAt=null;changed=true;}
    }
    if(changed)relinked();
  });
}

/* Accepting is the only door a finding has into the board, so every shape it
   can arrive in is handled in one place. A date replaces the one it corrects
   rather than standing beside it — two readings of the same deadline on one
   lane is worse than either of them alone. */
function takeFind(r){
  /* everything a finding puts on the board is stamped with the moment, which is
     what lets the card and the panel mark it new (see isFresh) */
  const now=new Date().toISOString();
  if(r.kind==='arena'){
    const a=newArena(String(r.arena_name||'New arena').trim()||'New arena',S.types[0].id,[]);
    if(r.url)a.links.push({id:uid(),label:'',url:r.url,foundAt:now});
    else if(r.source_url)a.links.push({id:uid(),label:'',url:r.source_url,foundAt:now});
    S.arenas.push(a);
    save();renderAll();
    /* Deliberately no drawer. Accepting is done in runs of five or ten, and a
       panel opening over the list turns the run into a series of interruptions;
       the arena is on the board and its type can be set whenever. */
    return 'Arena added — open it to set its type.';
  }
  const a=findArena(r);
  if(!a)return 'That arena is no longer on this board.';
  /* A short rewrite of one of the arena's two texts, from the pages the
     nightly agent read (Mark, 2026-10-10). It replaces the whole text, so that
     what is wrong or out of date goes rather than piling up under a newer
     line; Dispatches shows the text it replaces before Accept is pressed. */
  if(r.kind==='info'){
    const t=String(r.note||'').trim();
    if(!t)return 'That text was empty, so nothing changed.';
    if(r.date_kind==='brokerage'){a.brokerage=a.brokerage||{notes:'',links:[]};a.brokerage.notes=t;}
    else a.notes=t;
    save();renderAll();
    return 'New '+infoName(r)+' text on '+a.name+'.';
  }
  if(r.kind==='link'){
    const ev=siteFor(r);
    if(ev){
      ev.url=r.url;
      save();renderAll();
      return 'Website added to '+dtLabel(ev)+'.';
    }
    if(hasLink(a,r.url))return 'That link is already on '+a.name+'.';
    a.brokerage=a.brokerage||{notes:'',links:[]};
    a.brokerage.links.push({id:uid(),label:r.label||'',url:r.url,foundAt:now});
    save();renderAll();
    return 'Link added to '+a.name+'.';
  }
  const dt=findDate(r);
  dt.foundAt=now;
  /* A brokerage event is something you go to, so its page comes with it into
     the brokerage links: the event's own page when the agent gave one, else
     the page it read the date on. Until this the page was shown in Dispatches
     and dropped on Accept, and the card said when an event was but not where. */
  let linked=false;
  const page=dt.kind==='brokerage'?(r.url||r.source_url):null;
  if(page&&!hasLink(a,page)){
    a.brokerage=a.brokerage||{notes:'',links:[]};
    a.brokerage.links.push({id:uid(),label:dt.label||'Event page',url:page,foundAt:now});
    linked=true;
  }
  /* the editor’s own rule: only an exact day or an exact span can be called
     fixed, whatever the agent thought it read */
  if(!gradeOptions(dt.gran).includes(dt.grade))dt.grade=gradeDefault(dt.gran);
  if(page)dt.url=page;
  const i=r.replaces_date_id?(a.dates||[]).findIndex(d=>d.id===r.replaces_date_id):-1;
  if(i>=0){dt.id=a.dates[i].id;dt.note=a.dates[i].note||'';dt.url=dt.url||a.dates[i].url||'';
    if(a.dates[i].stampedAt){dt.stampedAt=a.dates[i].stampedAt;dt.stampPrev=a.dates[i].stampPrev||null;}
    a.dates[i]=dt;}
  else a.dates.push(dt);
  reconcile(a);
  save();renderAll();
  return (i>=0?'Date corrected on ':'Date added to ')+a.name+(linked?', with its page.':'.');
}
/* An info finding's date_kind says which of the arena's two texts it is for,
   named as the arena's panel names them. */
function infoName(r){return r.date_kind==='brokerage'?'Brokerage':'About';}
/* A link finding that names one of the arena's brokerage events (its
   `replaces_date_id`) is that event's website, found by the catch-up task or
   the nightly agent: it goes on the event, not among the arena's links. One
   naming a date that has since gone is an ordinary link again. */
function siteFor(r){
  if(r.kind!=='link'||!r.replaces_date_id)return null;
  const a=findArena(r);
  return a&&(a.dates||[]).find(d=>d.id===r.replaces_date_id&&d.kind!=='call')||null;
}
/* Two spellings of one address — a trailing slash, a www, http against https —
   are the same page, and a second copy of it among the links is noise. */
function linkKey(u){
  return String(u||'').trim().toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/[#?].*$/,'').replace(/\/+$/,'');
}
/* One site, for the stamp (Mark, 2026-10-12): a stamp stands on every link
   that reaches the same event or tool, however each is named and whichever
   page of it each points at — its front page, its sign-up, its list of
   participants, another language. linkKey alone kept those apart, so one
   event linked from three cards carried three stamps. The site is the host,
   which is the event itself wherever it has a host of its own
   (an-event.b2match.io). Where one host carries many events or tools side by
   side — b2match.com, every europa.eu portal, the big general platforms — the
   host would give them all one stamp, so there the site is the path, the
   language left out, and it stops at the event's own name where the path has
   one (/e/an-event, /events/an-event). A host goes on SHARED_HOSTS when two
   unrelated links turn out to share a stamp. */
const SHARED_HOSTS=/^(?:b2match\.(?:io|com|eu)|(?:.+\.)?(?:europa\.eu|google\.com|linkedin\.com|youtube\.com|github\.com|eventbrite\.[a-z.]+|meetup\.com|lu\.ma|zoom\.us|microsoft\.com|sharepoint\.com))$/;
function siteKey(u){
  const k=linkKey(u),i=k.indexOf('/');
  const host=(i<0?k:k.slice(0,i)).replace(/:\d+$/,'');
  if(!SHARED_HOSTS.test(host))return host;
  const segs=(i<0?'':k.slice(i+1)).split('/').filter(x=>x&&!/^[a-z]{2}(?:[-_][a-z]{2})?$/.test(x));
  const e=segs.findIndex(x=>/^(?:e|event|events)$/.test(x));
  return [host].concat(e>=0&&segs[e+1]?segs.slice(0,e+2):segs).join('/');
}
function hasLink(a,u){
  const k=linkKey(u);
  if(!k)return false;
  const bk=a.brokerage||{links:[]};
  return (bk.links||[]).concat(a.links||[]).some(l=>linkKey(l.url)===k);
}

/* A finding about an arena the board did not have yet carries only the
   arena's name. Once its "New arena" finding has been accepted the arena is
   here under that name, and the date or link belongs on it — without this,
   accepting the pair in order said "no longer on this board" and the date
   was lost, marked answered in the cloud and never written. */
function findArena(r){
  const a=arena(r.arena_id);
  if(a||r.arena_id)return a;
  const n=String(r.arena_name||'').trim().toLowerCase();
  return n?S.arenas.find(x=>String(x.name||'').trim().toLowerCase()===n):undefined;
}

/* The cloud is told first. If the row cannot be marked answered — no
   connection, or another machine got there — nothing is written here, because
   a finding that stays `new` in the cloud would be offered again and the same
   date would land twice. */
function answerFind(id,take){
  const api=(typeof Hub!=='undefined'&&Hub.api)?Hub.api('semaphore-inbox'):null;
  const r=finds.rows.find(x=>String(x.id)===String(id));
  if(!r||!api)return;
  finds.busy=r.id;finds.said='';renderDispatch();
  api.decide(r.id,take?'accepted':'dismissed',err=>{
    finds.busy=null;
    if(err){finds.said='Not answered — '+err;renderDispatch();return;}
    finds.rows=finds.rows.filter(x=>x.id!==r.id);
    finds.said=take?takeFind(r):'Dismissed.';
    renderDispatch();applyView();
  });
}

/* Accept all is the same door as Accept, walked once per finding and one at a
   time, so each is still marked answered in the cloud before it touches the
   board. New arenas go first, so the dates found for them have somewhere to
   land. A finding that still has no arena to go on is left waiting rather
   than marked answered and dropped; one the cloud refuses stays too. */
function acceptAllFinds(){
  const api=(typeof Hub!=='undefined'&&Hub.api)?Hub.api('semaphore-inbox'):null;
  if(!api||finds.all||!finds.rows.length)return;
  const queue=finds.rows.filter(r=>r.kind==='arena')
    .concat(finds.rows.filter(r=>r.kind!=='arena'));
  let done=0,left=0,failed='';
  finds.all=true;finds.said='';renderDispatch();
  const next=()=>{
    const r=queue.shift();
    if(!r){
      finds.all=false;
      finds.said=done+' accepted'+(left?' — '+left+' left waiting'+
        (failed?' ('+failed+')':' (no arena to put them on)'):'')+'.';
      renderDispatch();applyView();return;
    }
    if(r.kind!=='arena'&&!findArena(r)){
      left++;next();return;
    }
    api.decide(r.id,'accepted',err=>{
      if(err){left++;failed=String(err);next();return;}
      finds.rows=finds.rows.filter(x=>x.id!==r.id);
      takeFind(r);done++;
      renderDispatch();next();
    });
  };
  next();
}

/* ============ coming up ============
   Every arena's dates on one line, in time order — the phone companion's
   "Coming up", which Mark asked for here too (2026-10-08) and chose in the
   same shape: a spine down the page, a date on its left, the event and its
   arena on its right. The desk's width goes to what the phone had no room
   for: the event's own website in a column of its own, opened in one press,
   and a way to remove an event that should not be on the board at all.

   Brokerage first, as everywhere in this room: calls come in only when
   "Everything" is chosen, quieter, in their own stage colour. The window is
   the phone's: a year forward, and for a call a fortnight back, so a
   deadline just passed still says where the round stands. A brokerage event
   that is over goes to Limbo, folded into one line at the top, and stays
   there until Mark takes it off by hand (2026-10-11, the same in Pocket):
   the fortnight before it, a line of its own too, let an event leave the
   board unseen, and unfolded it was a whole screen of September before the
   first thing still to come. The filters above apply, the freezer is out,
   as on the board. A month with nothing in it is left out. */
let cuLimbo=false;             /* Limbo, unfolded on request */
let cuHi=null;                 /* the event a press on the board or a card came for */
let cuNew=false;               /* the new-event form is open */
const cuOpen=new Set();        /* arena|event of the rows whose arena's strip is unfolded */
/* A brokerage diamond, on the board or on a card, is pressed to see that
   event in the list: Mark asked for it (2026-10-08), because the list is
   where an event's website and its neighbours in time are. An event the
   list does not hold — more than a year off — opens its arena's panel as
   every press did before. */
function jumpDate(aid,did){
  const a=arena(aid),d=a&&(a.dates||[]).find(x=>x.id===did);
  if(!d)return;
  const now=T(todayISO()),e=T(d.end||d.start);
  if(d.kind==='call'||!d.start||T(d.start)>now+366*DAY||!visibleArenas().includes(a)){
    openDrawer(aid,did);return;}
  if(e<now)cuLimbo=true;
  cuHi=did;S.ui.view='coming';save();renderAll();
  const row=document.querySelector('#coming .culn[data-cud="'+did+'"]');
  if(row)row.scrollIntoView({block:'center'});
}
function comingUp(){
  const now=T(todayISO()),from=now-14*DAY,to=now+366*DAY,out=[];
  for(const a of visibleArenas())for(const d of a.dates||[]){
    if(!d.start||d.gran==='none')continue;
    const call=d.kind==='call';
    if(!S.ui.cuAll&&call)continue;
    const s=T(d.start),e=T(d.end||d.start);
    if((call&&e<from)||s>to)continue;
    out.push({a,d,s,e,limbo:!call&&e<now});
  }
  /* What is over goes above the today line and everything else below it,
     so an event that began in September and runs into November is read
     with what is still to come, not above the fortnight just past. */
  out.sort((x,y)=>(x.e>=now)-(y.e>=now)||x.s-y.s||(x.d.kind==='call')-(y.d.kind==='call')||
    dtLabel(x.d).localeCompare(dtLabel(y.d)));
  return out;
}
/* The date as the list gives it: the month and year are already on the
   left, so a day is "9 Oct" and a span "14–15 Oct" rather than two lines of
   full dates in a column made for one. */
function cuDate(d){
  const[y,m,dd]=d.start.split('-').map(Number);
  switch(d.gran){
    case 'month':return MONTHS[m-1];
    case 'quarter':return 'Q'+(Math.floor((m-1)/3)+1);
    case 'half':return 'H'+(m<7?1:2);
    case 'year':return String(y);
    case 'range':{
      if(!d.end||d.end===d.start)return dd+' '+MONTHS[m-1];
      const[y2,m2,d2]=d.end.split('-').map(Number);
      if(y2===y&&m2===m)return dd+'\u2013'+d2+' '+MONTHS[m-1];
      return dd+' '+MONTHS[m-1]+' \u2013 '+d2+' '+MONTHS[m2-1];
    }
    default:return dd+' '+MONTHS[m-1];
  }
}
/* An event is stamped once you have been through it, as a pinned link is,
   and counts the days since the same way (Mark, 2026-10-09). An event and a
   pinned link are often one site — the platform pinned for the round is also
   the page of the event it hosts — and two stamps on one site would disagree
   by the next morning. So a site keeps one stamp: a press on either stamps
   every event and link with that address, and each row reads the newest
   stamp among them, which is what lets a link stamped before events had
   stamps count for the event too. An event with no website stands alone.
   "That address" is the site (siteKey), so the links on the rotation cards
   share it as well. */
function stampMates(h){
  const k=h.url&&siteKey(h.url),out=[h];
  if(!k)return out;
  for(const a of S.arenas){
    for(const d of a.dates||[])if(d!==h&&d.url&&siteKey(d.url)===k)out.push(d);
    for(const lk of ((a.brokerage&&a.brokerage.links)||[]).concat(a.links||[]))
      if(lk!==h&&lk.url&&siteKey(lk.url)===k)out.push(lk);
  }
  return out;
}
function stampOf(h){
  let s=null;
  for(const m of stampMates(h))if(m.stampedAt&&(!s||m.stampedAt>s))s=m.stampedAt;
  return s;
}
/* a same-day press takes it back, on every row that shares the site */
function toggleStamp(h){
  const t=todayISO(),mates=stampMates(h);
  if(mates.some(m=>m.stampedAt===t)){
    for(const m of mates)if(m.stampedAt===t){m.stampedAt=m.stampPrev||null;delete m.stampPrev;}
  }else for(const m of mates){m.stampPrev=m.stampedAt||null;m.stampedAt=t;}
}
/* Here the stamp is the count: the days since it was pressed stand inside
   the circle in place of the tick, and the circle is white, reddening over a
   fortnight (Mark, 2026-10-12) — a list walked event by event is read for
   what has waited longest, and a tick beside a number said the same thing
   twice. Fourteen days and more is the room's brokerage red. An event never
   stamped keeps the empty ring and its tick (Mark, 2026-10-12), so that it
   reads as not yet done rather than as a blank count. */
function cuStampHTML(a,d){
  const st=stampSay(stampOf(d)),n=st.d===null?null:Math.max(0,st.d);
  const tip=st.on?st.stTip:st.ageTip+' \u2014 stamp it once you have been through it';
  return '<button class="stamp'+(n===null?'':' custamp')+'" data-act="cuStamp" data-a="'+a.id+'" data-d="'+d.id+'" '+
    (n===null?'':'style="--age:'+Math.round(Math.min(n,14)/14*100)+'%" ')+'title="'+tip+'" aria-label="'+tip+'">'+
    (n===null?'\u2713':n)+'</button>';
}
/* the stamp and its count, as Pinned draws them */
function stampSay(st){
  const t=todayISO(),on=st===t;
  const d=st?daysBetween(T(st),T(t)):null;
  return{on,d,
    age:d===null?'\u2014':d<=0?'today':d+' d',
    ageTip:d===null?'Not stamped yet':d<=0?'Stamped today':'Stamped '+(d===1?'yesterday':d+' days ago'),
    stTip:on?'Stamped today \u2014 click to undo':'Stamp it once you have been through it'};
}
const LONG_MONTHS=['January','February','March','April','May','June','July','August',
  'September','October','November','December'];
function comingRow(it){
  const{a,d}=it,now=T(todayISO()),call=d.kind==='call',past=it.e<now&&!it.limbo;
  /* no count of the days to go (Mark, 2026-10-12): the date stands on the
     left already, and only an event under way says so */
  const when=!call&&it.e>=now&&it.s<=now?'on now':'';
  const tone=arenaTone(a),open=!call&&cuOpen.has(a.id+'|'+d.id);
  const site=call?'':d.url
    ?'<a class="cusite" href="'+esc(d.url)+'" target="_blank" rel="noopener" title="'+esc(d.url)+'">'+
      esc(linkName({url:d.url}))+'</a>'
    :'<button class="cusite none" data-act="cuSite" data-a="'+a.id+'" data-d="'+d.id+'" '+
      'title="This event has no website yet \u2014 add one">add website</button>';
  const stamp=call?'':cuStampHTML(a,d);
  return '<div class="culn'+(call?' call':'')+(past?' past':'')+(it.limbo?' limbo':'')+(cuHi===d.id?' cuhi':'')+'" data-cud="'+d.id+'" style="--c:'+dtColor(d)+'">'+
    '<span class="cud'+(d.grade==='fixed'?'':' unc')+'" title="'+esc(dispDate(d))+'">'+
      (d.grade==='fixed'?'':'\u2248\u2009')+esc(cuDate(d))+'</span>'+
    '<span class="cug"><i class="sw sw-'+d.grade+'"></i></span>'+
    '<span class="cut">'+
      '<button class="cuname" data-act="openDate" data-a="'+a.id+'" data-d="'+d.id+'" title="Open '+esc(a.name)+'">'+
        esc(dtLabel(d))+'</button>'+
      (call?'<span class="custage">'+esc(roleOf(d).short)+'</span>':'')+
      /* the arena's name opens its panel, as a tap on it does in Pocket
         (Mark, 2026-10-12) */
      '<span class="cuar"><button class="cuat'+(tone?' toned':'')+'" data-act="openArena" data-id="'+a.id+'" title="Open '+esc(a.name)+'"'+(tone?' style="--tone:'+esc(tone)+'"':'')+'>'+esc(a.name)+'</button>'+
        (when?'<span class="cusoon">'+when+'</span>':'')+
        (call?'':'<button class="cuwx'+(open?' on':'')+'" data-act="cuStrip" data-a="'+a.id+'" data-d="'+d.id+'" aria-expanded="'+open+'" '+
          'title="'+(open?'Fold away':'Show')+' the arena\u2019s calls and events in time" aria-label="The arena\u2019s calls and events in time">'+
          '\u25BE</button>')+'</span>'+
    '</span>'+
    '<span class="cuend">'+site+stamp+
      (call?'':'<button class="cudel" data-act="cuDel" data-a="'+a.id+'" data-d="'+d.id+'"'+(it.limbo?' data-limbo="1"':'')+' '+
        'title="Remove this event from the app" aria-label="Remove '+esc(dtLabel(d))+'">\u2715</button>')+
    '</span>'+
    (open?'<div class="cuwline">'+cardLineHTML(a,'top',d.id)+'</div>':'')+
  '</div>';
}
/* A brokerage event added from the list is an ordinary date on the arena
   chosen here — the same date the arena's panel makes, read by the same
   reader — so it is on the board, the cards and the panel the moment it is
   saved (Mark, 2026-10-08). The form is the panel's date form laid out
   across the desk, with the arena in front, since here there is none yet. */
function cuFormHTML(){
  const arenas=liveArenas().slice().sort((x,y)=>x.name.localeCompare(y.name));
  const grans=[['day','Exact day'],['range','Exact span'],['month','A month'],['quarter','A quarter'],
               ['half','A half-year'],['year','A year']]
    .map(([v,n])=>'<option value="'+v+'">'+n+'</option>').join('');
  return '<form class="dform cuform" data-a="" data-d="new">'+
    '<input type="hidden" name="kind" value="brokerage"><input type="hidden" name="note" value="">'+
    '<div class="fld"><label>Arena</label><select name="arena" required>'+
      '<option value="">Choose an arena</option>'+
      arenas.map(a=>'<option value="'+a.id+'">'+esc(a.name)+'</option>').join('')+'</select></div>'+
    '<div class="fld"><label>Event</label><input name="label" placeholder="e.g. Cluster 4 brokerage day, Brussels" autocomplete="off"></div>'+
    '<div class="fld"><label>Website</label><input name="url" placeholder="The event\u2019s own page" autocomplete="off"></div>'+
    '<div class="fld"><label>How well is it known</label><select name="gran">'+grans+'</select></div>'+
    '<div class="fld"><label>When</label><span class="granIn">'+granInputsHTML('day',null)+'</span></div>'+
    '<div class="fld gradefld"><label>Certainty</label>'+gradeSegHTML('day','fixed')+'</div>'+
    '<div class="fbtns"><button type="button" class="btn" data-act="cuNew">Cancel</button>'+
      '<button type="submit" class="btn primary">Add event</button></div>'+
  '</form>';
}
function renderComing(){
  const el=$('#coming');
  if(!el)return;
  const all=comingUp(),now=T(todayISO());
  const limbo=all.filter(x=>x.limbo),list=all.filter(x=>!x.limbo);
  const brk=list.filter(x=>x.d.kind!=='call'&&x.e>=now);
  const bare=brk.filter(x=>!x.d.url).length;
  const pills='<div class="wsort">'+[['0','Brokerage'],['1','Everything']].map(([v,n])=>
    '<button class="'+((S.ui.cuAll?'1':'0')===v?'on':'')+'" data-act="cuAll" data-v="'+v+'">'+n+'</button>').join('')+'</div>';
  const addBtn='<button class="btn'+(cuNew?' on':'')+'" data-act="cuNew" aria-expanded="'+cuNew+'">+ Brokerage event</button>';
  const head='<div class="dpbar">'+pills+
    '<span class="dpsay">'+(brk.length
      ?'<b>'+brk.length+'</b> brokerage event'+(brk.length===1?'':'s')+' in the coming year'+
        (bare?', <b>'+bare+'</b> still without a website':'')+'.'
      :'')+'</span><span class="spacer"></span>'+addBtn+'</div>'+(cuNew?cuFormHTML():'');
  const lim=limbo.length?'<div class="culimbo"><button class="culb" data-act="cuLimbo" aria-expanded="'+cuLimbo+'">'+
      '<span class="culc">Limbo</span><b>'+limbo.length+'</b> '+(limbo.length===1?'event is over':'events are over')+
      '<span class="culw">'+(cuLimbo?'Hide':'Show')+'</span></button>'+
    (cuLimbo?'<p class="culh">Each waits here until you take it off with \u2715.</p>'+
      '<div class="cuspine">'+limbo.map(comingRow).join('')+'</div>':'')+'</div>':'';
  if(!list.length){
    const why=liveArenas().length&&!visibleArenas().length?emptyReason(false):
      [S.ui.cuAll?'Nothing dated in the coming year.':'No brokerage event in the coming year.',
       S.ui.cuAll?'Give an arena a date and it appears here.':'Choose Everything to see the calls as well.'];
    el.innerHTML=head+(lim?'<div class="culist">'+lim+'</div>':'')+'<div class="empty"><p>'+why[0]+'</p><p class="hint" style="margin-top:6px">'+why[1]+'</p></div>';
    return;
  }
  /* An event still running is filed under this month rather than the month
     it began in, so the list opens on now. */
  const thisM=thisYM(),months=[],by=new Map();
  for(const it of list){
    let m=it.d.start.slice(0,7);
    if(m<thisM&&it.e>=T(todayISO()))m=thisM;
    if(!by.has(m)){by.set(m,[]);months.push(m);}
    by.get(m).push(it);
  }
  let placed=false;
  const body=months.map(m=>{
    const rows=by.get(m).map(it=>{
      let h='';
      if(!placed&&it.e>=now){placed=true;h='<div class="cutoday"><span>today</span></div>';}
      return h+comingRow(it);
    }).join('');
    return '<section class="cumon"><div class="cumn">'+LONG_MONTHS[+m.slice(5,7)-1]+
      '<small>'+m.slice(0,4)+'</small></div><div class="cuspine">'+rows+'</div></section>';
  }).join('');
  el.innerHTML=head+'<div class="culist">'+lim+body+(placed?'':'<div class="cutoday"><span>today</span></div>')+'</div>';
}

/* ============ drawer ============ */
const drawer={id:null,edit:null,hi:null,editing:false,scope:null};
/* which card has its follow-up composer open, which has its link composer open,
   and which one just moved */
let lkEdit={a:null,l:null},leadEdit={a:null,l:null},waitPick=null,settleId=null,pinEdit=null;
/* the lead whose Complete is asking how it ended, which is about the moment */
let endAsk={a:null,l:null};
/* the update being written, and the leads showing their whole history —
   both are about the moment, so neither is remembered */
let noteEdit={a:null,l:null};
const updOpen=new Set();
/* Closed leads are a record, not a queue, so they are put away behind one line
   and only come out when asked for. Keyed by arena, and kept out of the board's
   own state: it is a way of looking at the moment, not a fact about the work,
   so it is never written to storage and does not survive a reload. */
const closedOpen=new Set();
const UPD_SHOWN=2;               /* how much history a row shows before it offers the rest */
function arena(id){return S.arenas.find(a=>a.id===id);}
function byDateSort(x,y){
  const lx=!x.start,ly=!y.start;
  if(lx!==ly)return lx?1:-1;
  return (x.start||'').localeCompare(y.start||'');
}
function granInputsHTML(gran,dt){
  const curY=dt&&dt.start?+dt.start.slice(0,4):new Date().getFullYear();
  const yIn='<input type="number" name="y" min="2000" max="2100" value="'+curY+'" aria-label="Year">';
  const mSel=(sel)=>'<select name="m" aria-label="Month">'+MONTHS.map((n,i)=>'<option value="'+(i+1)+'"'+((i+1)===sel?' selected':'')+'>'+n+'</option>').join('')+'</select>';
  switch(gran){
    case 'day':return '<input type="date" name="day" value="'+(dt&&dt.gran==='day'?dt.start:'')+'">';
    case 'month':return yIn+mSel(dt&&dt.gran==='month'?+dt.start.slice(5,7):new Date().getMonth()+1);
    case 'quarter':{const q=dt&&dt.gran==='quarter'?Math.floor((+dt.start.slice(5,7)-1)/3)+1:1;
      return yIn+'<select name="q" aria-label="Quarter">'+[1,2,3,4].map(n=>'<option value="'+n+'"'+(n===q?' selected':'')+'>Q'+n+'</option>').join('')+'</select>';}
    case 'half':{const hh=dt&&dt.gran==='half'?(+dt.start.slice(5,7)<7?1:2):1;
      return yIn+'<select name="h" aria-label="Half">'+[1,2].map(n=>'<option value="'+n+'"'+(n===hh?' selected':'')+'>H'+n+'</option>').join('')+'</select>';}
    case 'year':return yIn;
    case 'range':return '<input type="date" name="from" value="'+(dt&&dt.gran==='range'?dt.start:'')+'" aria-label="From">'+
                        '<input type="date" name="to" value="'+(dt&&dt.gran==='range'?dt.end:'')+'" aria-label="To">';
    default:return '<p class="fhint">Parked off the timeline until a date exists.</p>';
  }
}
function kindFieldsHTML(kind,dt){
  const same=dt&&dt.kind===kind;
  if(kind==='call'){
    const role=(same&&ROLES[dt.role])?dt.role:'publication';
    return '<div class="fld"><label>Call</label>'+
        '<input name="call" value="'+(same?esc(dt.call||''):'')+'" placeholder="e.g. Call 2027-1" autocomplete="off">'+
        '<p class="fhint">Give the publication date and the submission deadline the same name and the board joins them into one submission window.</p></div>'+
      '<div class="fld"><label>Stage</label><input type="hidden" name="role" value="'+role+'">'+
        '<div class="opts">'+ROLE_ORDER.map(r=>
          '<button type="button" class="opt'+(r===role?' on':'')+'" data-act="segRole" data-v="'+r+'" style="--c:'+ROLES[r].c+'">'+
          '<span class="dot"></span>'+ROLES[r].name+'</button>').join('')+'</div></div>';
  }
  /* An event's own website, so the event can be opened from wherever it is
     shown rather than looked for among the arena's links under a slightly
     different name (Mark, 2026-10-08). The arena's links are offered in the
     box's own list, because most events already have their page there. */
  return '<div class="fld"><label>Label</label>'+
      '<input name="label" value="'+(same?esc(dt.label||''):'')+'" placeholder="e.g. Online brokerage day" autocomplete="off"></div>'+
    '<div class="fld"><label>Website</label>'+
      '<input name="url" list="dsites" value="'+(same?esc(dt.url||''):'')+'" placeholder="The event\u2019s own page \u2014 pick one of the arena\u2019s links or paste one" autocomplete="off"></div>'+
    '<div class="fld"><label>Note</label>'+
      '<input name="note" value="'+(same?esc(dt.note||''):'')+'" placeholder="Basis, source \u2014 optional" autocomplete="off"></div>';
}
function gradeSegHTML(gran,grade){
  const allowed=gradeOptions(gran);
  if(!allowed.includes(grade))grade=gradeDefault(gran);
  const btn=g=>{
    const ok=allowed.includes(g);
    return '<button type="button" class="seg-b '+g+(g===grade?' on':'')+'" data-act="segGrade" data-v="'+g+'"'+
      (ok?'':' disabled title="Only an exact day or an exact span can be called fixed"')+'>'+GRADES[g].name+'</button>';
  };
  return '<input type="hidden" name="grade" value="'+grade+'">'+
    '<div class="seg">'+btn('fixed')+btn('uncertain')+'</div>'+
    '<p class="fhint">'+GRADES[grade].long+'</p>';
}
function dateFormHTML(a,dt){
  const g=dt?dt.gran:'day';
  const grade=dt?dt.grade:gradeDefault(g);
  const grans=[['day','Exact day'],['range','Exact span'],['month','A month'],['quarter','A quarter'],
               ['half','A half-year'],['year','A year'],['none','No date yet']]
    .map(([v,n])=>'<option value="'+v+'"'+(v===g?' selected':'')+'>'+n+'</option>').join('');
  const isCall=dt?dt.kind==='call':true;
  return '<form class="dform" data-a="'+a.id+'" data-d="'+(dt?dt.id:'new')+'">'+
    '<div class="fld"><label>Kind</label><input type="hidden" name="kind" value="'+(isCall?'call':'brokerage')+'">'+
      '<div class="seg">'+
        '<button type="button" class="seg-b'+(isCall?' on':'')+'" data-act="segKind" data-v="call">Call</button>'+
        '<button type="button" class="seg-b'+(isCall?'':' on')+'" data-act="segKind" data-v="brokerage">Brokerage</button>'+
      '</div></div>'+
    '<div class="kindfields">'+kindFieldsHTML(isCall?'call':'brokerage',dt)+'</div>'+
    '<datalist id="dsites">'+(a.brokerage&&a.brokerage.links||[]).concat(a.links||[])
      .filter(l=>l.url&&!/^mailto:/i.test(l.url))
      .map(l=>'<option value="'+esc(l.url)+'">'+esc(linkName(l))+'</option>').join('')+'</datalist>'+
    '<div class="fld"><label>How well is it known</label><select name="gran">'+grans+'</select></div>'+
    '<div class="fld"><label>When</label><span class="granIn">'+granInputsHTML(g,dt)+'</span></div>'+
    '<div class="fld gradefld"><label>Certainty</label>'+gradeSegHTML(g,grade)+'</div>'+
    '<div class="fbtns"><button type="button" class="btn" data-act="cancelDate">Cancel</button>'+
    '<button type="submit" class="btn primary">Save</button></div></form>';
}
/* ---- read view: one stream, in time order ---- */
function linkName(lk){
  if(lk.label)return lk.label;
  if(!lk.url)return '(unnamed)';
  /* a mail address has no host to stand for it, so it stands for itself */
  if(/^mailto:/i.test(lk.url))return lk.url.slice(7);
  try{return new URL(lk.url).hostname.replace(/^www\./,'');}catch(e){return lk.url;}
}
function panelCard(label,brok,notes,linkList,editAct,a){
  const scope=brok?'brokerage':'arena';
  const rows=wallLinkRows(a,linkList,scope);
  if(!notes&&!rows)return '';
  return '<section class="card pcard'+(brok?' brok':'')+'">'+
    '<div class="chd"><span class="ctitle">'+label+'</span>'+
      '<button class="ib cact" data-act="'+editAct+'" data-id="'+a.id+'" title="Edit">\u270E</button></div>'+
    (notes?'<div class="cbd"><p class="ptext">'+esc(notes)+'</p></div>':'')+
    (rows?wallLinks(a,scope,rows):'')+
  '</section>';
}
function dateText(dt){
  if(!dt.start)return '<span class="d none">\u2014</span>';
  const cls=dt.grade==='fixed'?'':' unc';
  const pre=dt.grade==='fixed'?'':'\u2248\u2009';
  return '<span class="d'+cls+'">'+pre+dispDate(dt)+'</span>';
}
function dateRow(a,dt,past){
  const sub=dtSub(dt);
  const tag=freshTag(a,dt);
  const body=dt.kind==='call'?
    esc(dtLabel(dt))+tag+'<span class="stage">'+esc(roleOf(dt).short)+'</span>':
    esc(dtLabel(dt))+tag+(sub?'<span class="nt">'+esc(sub)+'</span>':'')+
      (dt.url?'<a class="dsite" href="'+esc(dt.url)+'" target="_blank" rel="noopener">'+
        esc(linkName({url:dt.url}))+'</a>':'');
  const c=dtColor(dt);
  /* a date the agent found says so on hover even once it is no longer new */
  const tip=GRADES[dt.grade].long+(dt.foundAt?' \u2014 found by the nightly agent':'');
  return '<div class="ln'+(dt.kind==='call'?' call':'')+(past?' past':'')+(drawer.hi===dt.id?' hi':'')+
    '" data-did="'+dt.id+'" style="--c:'+c+'" title="'+esc(tip)+'">'+
    dateText(dt)+'<span class="g"><i class="sw sw-'+dt.grade+'"></i></span>'+
    '<span class="t">'+body+'</span></div>';
}
function streamHTML(a){
  const now=T(todayISO());
  const dated=[],undated=[];
  a.dates.forEach(dt=>{
    if(!dt.start)undated.push(dt);
    else dated.push({t:T(dt.start),end:T(dt.end),dt});
  });
  dated.sort((x,y)=>x.t-y.t);
  if(!dated.length&&!undated.length)
    return '<p class="blank">No dates recorded yet.</p>';
  let h='',placed=false;
  for(const it of dated){
    const past=it.end<now;
    if(!past&&!placed){h+='<div class="mark today"><span class="mlab">today</span></div>';placed=true;}
    h+=dateRow(a,it.dt,past);
  }
  if(!placed&&dated.length)h+='<div class="mark today"><span class="mlab">today</span></div>';
  if(undated.length){
    h+='<div class="mark"><span class="mlab">no date yet</span></div>';
    h+=undated.map(dt=>dateRow(a,dt,false)).join('');
  }
  return h;
}
/* the same follow-up as on the wall, so an arena reads the same
   from either side, plus the one fact the wall keeps in its tooltip */
/* beside the sweep that will clear them, how many marks the panel is showing */
function freshSaid(a){
  const n=freshItems(a).length;
  return n?'<i class="wfresh" title="'+n+' thing'+(n===1?'':'s')+' the nightly agent found, marked new below '+
    '\u2014 sweeping this arena marks '+(n===1?'it':'them')+' seen, here and on the card">'+n+' new</i>':'';
}
function rotBarHTML(a){
  const s=standing(a);
  return '<div class="rotbar">'+
    '<div class="swept">'+
      '<button class="stamp'+(a.sweptAt===todayISO()?' on':'')+'" data-act="sweep" data-id="'+a.id+'" '+
        'title="'+esc(sweptTitle(a))+'" aria-label="'+esc(sweptTitle(a))+'">\u2713</button>'+
      '<span>'+esc(sweptLine(a))+'</span>'+freshSaid(a)+'<span class="sp"></span>'+askHTML(a)+
      (s.note?'<span class="season">'+s.note.text+'</span>':'')+
    '</div>'+
    '<div class="wbody">'+leadListHTML(a,leadHits(a,S.ui.q.trim().toLowerCase()))+'</div>'+
    frontStrips(a,s,[])+
    (waitPick===a.id?waitPickHTML(a):offerHTML(a,s))+
  '</div>';
}
function readHTML(a){
  const tags=(a.tags||[]).map(t=>'#'+esc(t)).join('<i>\u00B7</i>');
  const bk=a.brokerage||{notes:'',links:[]};
  const blocks=panelCard('About',false,a.notes||'',a.links,'editCard',a)+
               panelCard('Brokerage',true,bk.notes||'',bk.links,'editBrokerage',a);
  /* Freezing suspends the rotation entirely, so the panel stops offering the
     parts of it that could not fire — a follow-up or a wait set here would
     promise a return the freezer has already ruled out. Anything already parked
     keeps its place in the record and resumes on thaw, which the banner says. */
  const nOpen=openLeads(a).length;
  const parked=a.hold?' Its wait resumes when you thaw it.'
              :nOpen?' Its '+(nOpen===1?'lead resumes':nOpen+' leads resume')+' when you thaw it.':'';
  const frozen=a.frozenAt
    ?'<div class="frozenbar"><i class="frost"></i>'+
       '<span class="frtx">In the freezer since '+esc(shortDay(a.frozenAt))+
         ' \u2014 kept off the board and the wall.'+parked+'</span>'+
       '<button class="btn" data-act="thaw" data-id="'+a.id+'">Thaw</button></div>'
    :'';
  return '<div class="cbody">'+
    '<div class="chead">'+
      '<button class="x" data-act="closeDrawer" aria-label="Close">\u2715</button>'+
      '<h2 id="aname">'+esc(a.name)+'</h2>'+
      '<p class="meta">'+esc(typeName(a.typeId))+(tags?'<i>\u00B7</i>'+tags:'')+'</p>'+
    '</div>'+
    frozen+
    '<div class="blocks">'+blocks+(a.frozenAt?'':rotBarHTML(a))+'</div>'+
    '<div class="rule"></div>'+
    '<div class="stream">'+streamHTML(a)+'</div>'+
    '</div>'+
    '<div class="cfoot">'+
      '<button class="btn" data-act="editCard">Edit</button>'+
      (a.frozenAt?'':'<button class="btn ghost" data-act="freeze" data-id="'+a.id+'" '+
        'title="Keep this arena off the board and the wall">Freeze</button>')+
      '<span class="sp"></span>'+
      '<button class="btn" data-act="startAdd" data-what="date">+ Date</button>'+
      '<button class="btn" data-act="startAdd" data-what="link">+ Link</button>'+
    '</div>';
}
/* ---- edit view ---- */
function editDateRow(a,dt){
  const sub=dt.kind==='call'?roleOf(dt).short:(dt.note||'');
  return '<div class="erow" style="--c:'+dtColor(dt)+'">'+
    '<span class="ec"><i class="sw sw-'+dt.grade+'"></i></span>'+
    '<span class="ebody"><span class="lbl">'+esc(dtLabel(dt))+'</span>'+
      (sub?'<span class="esub">'+esc(sub)+'</span>':'')+'</span>'+
    '<span class="when">'+dispDate(dt)+'</span>'+
    '<button class="ib" title="Edit" data-act="editDate" data-a="'+a.id+'" data-d="'+dt.id+'">\u270E</button>'+
    (dt.start?'<button class="ib" title="Copy to next year, marked uncertain" data-act="dupDate" data-a="'+a.id+'" data-d="'+dt.id+'">+1y</button>':'')+
    '<button class="ib" title="Delete" data-act="delDate" data-a="'+a.id+'" data-d="'+dt.id+'">\u2715</button>'+
  '</div>'+(drawer.edit===dt.id?dateFormHTML(a,dt):'');
}
function ecard(title,brok){
  return '<section class="card epanel'+(brok?' brok':'')+'">'+
    '<div class="chd"><span class="ctitle">'+title+'</span></div>'+
    '<div class="cbd">';
}
const ECLOSE='</div></section>';
function editHTML(a){
  const sc=drawer.scope;
  const show=k=>!sc||sc===k;
  const tyOpts=S.types.map(t=>'<option value="'+t.id+'"'+(t.id===a.typeId?' selected':'')+'>'+esc(t.name)+'</option>').join('');
  const none=t=>'<p class="enone">'+t+'</p>';
  const linkRows=(list,scope)=>list.map(lk=>
    '<div class="erow lk">'+
      '<input class="e1" data-lk="'+lk.id+'" data-lks="'+scope+'" data-lkf="label" value="'+esc(lk.label||'')+'" placeholder="Name" aria-label="Link name" autocomplete="off">'+
      '<input class="e2" data-lk="'+lk.id+'" data-lks="'+scope+'" data-lkf="url" value="'+esc(lk.url||'')+'" placeholder="https://\u2026" aria-label="Link address" autocomplete="off">'+
      '<a class="ib'+(lk.url?'':' off')+'" href="'+esc(lk.url||'#')+'" target="_blank" rel="noopener" title="Open in a new tab">\u2197</a>'+
      '<button class="ib" data-act="delLink" data-a="'+a.id+'" data-l="'+lk.id+'" data-scope="'+scope+'" title="Remove">\u2715</button>'+
    '</div>').join('');
  const bk=a.brokerage||{notes:'',links:[]};
  const arenaLinks='<div class="fld"><label>Links</label>'+(linkRows(a.links||[],'arena')||none('None yet'))+
    '<button class="btn addbtn" data-act="addLink" data-a="'+a.id+'" data-scope="arena">+ Link</button></div>';
  const brokLinks='<div class="fld"><label>Links</label>'+(linkRows(bk.links||[],'brokerage')||none('None yet'))+
    '<button class="btn addbtn" data-act="addLink" data-a="'+a.id+'" data-scope="brokerage">+ Brokerage link</button></div>';

  const wq=weightOf(a);
  const weightFld='<div class="fld"><label>How much it matters</label>'+
    '<div class="seg">'+Object.keys(WEIGHTS).map(k=>
      '<button type="button" class="seg-b'+(k===wq?' on':'')+'" data-act="setWeight" '+
      'data-id="'+a.id+'" data-v="'+k+'" title="'+esc(WEIGHTS[k].long)+'">'+WEIGHTS[k].name+'</button>').join('')+
    '</div><p class="fhint">'+esc(WEIGHTS[wq].long)+
    ' It changes how often this arena comes round, not how loudly it shouts when it does. '+
    'The freezer is the step past peripheral.</p></div>';

  let h='';
  if(show('details'))
    h+=ecard('Details')+
      '<div class="fld"><label>Name</label><input data-field="name" value="'+esc(a.name)+'" autocomplete="off"></div>'+
      '<div class="f2"><div class="fld"><label>Type</label><select data-field="typeId">'+tyOpts+'</select></div>'+
      '<div class="fld"><label>Tags</label><input data-field="tags" value="'+esc((a.tags||[]).join(', '))+'" placeholder="comma, separated" autocomplete="off"></div></div>'+
      weightFld+
      '<div class="fld"><label>Notes</label><textarea data-field="notes" placeholder="Anything worth remembering"></textarea></div>'+
      arenaLinks+ECLOSE;
  if(!sc||sc==='brokerage')
    h+=ecard('Brokerage',true)+
      '<p class="fhint top">The events and tools themselves \u2014 platforms, contacts, what to do first.</p>'+
      '<div class="fld"><label>Notes</label><textarea data-field="bknotes" placeholder="How this arena\u2019s brokerage works"></textarea></div>'+
      brokLinks+ECLOSE;
  if(sc==='links')
    h+=ecard('Links')+arenaLinks+ECLOSE+
       ecard('Brokerage links',true)+brokLinks+ECLOSE;
  if(show('dates')){
    const dates=[...a.dates].sort(byDateSort).map(dt=>editDateRow(a,dt)).join('');
    h+=ecard('Dates')+(dates||none('None yet'))+
      (drawer.edit==='new'?dateFormHTML(a,null):'')+
      '<button class="btn addbtn" data-act="addDate" data-a="'+a.id+'">+ Date</button>'+ECLOSE;
  }
  if(!sc)h+='<div class="danger"><button class="btn" data-act="delArena" data-id="'+a.id+'">Delete arena</button></div>';

  const sub=sc?({links:'Links',dates:'Dates',brokerage:'Brokerage'})[sc]:'Editing';
  return '<div class="cbody">'+
    '<div class="chead">'+
      '<button class="x" data-act="closeDrawer" aria-label="Close">\u2715</button>'+
      '<h2 id="aname">'+esc(a.name)+'</h2>'+
      '<p class="meta">'+sub+' \u2014 changes save as you make them</p></div>'+
    h+'</div>'+
    '<div class="cfoot">'+
      (sc?'<button class="btn" data-act="editCard">Edit everything</button>':'')+
      '<span class="sp"></span>'+
      '<button class="btn primary wide" data-act="doneCard">Done</button></div>';
}
function drawCallSpans(a){
  const stream=$('#card .stream');if(!stream)return;
  stream.querySelectorAll('.spanline').forEach(el=>el.remove());
  for(const sp of callSpans(a)){
    const p=stream.querySelector('.ln[data-did="'+sp.pub+'"]');
    const d=stream.querySelector('.ln[data-did="'+sp.dl+'"]');
    if(!p||!d)continue;
    const top=Math.min(p.offsetTop+p.offsetHeight/2,d.offsetTop+d.offsetHeight/2);
    const bot=Math.max(p.offsetTop+p.offsetHeight/2,d.offsetTop+d.offsetHeight/2);
    const el=document.createElement('div');
    el.className='spanline';
    el.title=sp.name+' \u2014 submission period';
    el.style.top=top+'px';el.style.height=(bot-top)+'px';
    stream.appendChild(el);
  }
}
function autoGrow(el){
  if(!el)return;
  el.style.height='auto';
  el.style.height=Math.max(el.scrollHeight+2,62)+'px';
}
function renderDrawer(){
  const c=$('#card'),sc=$('#cardScrim');
  const a=arena(drawer.id);
  if(!a){c.classList.remove('open');sc.classList.remove('open');c.innerHTML='';return;}
  const body=c.querySelector('.cbody');const top=body?body.scrollTop:0;
  c.innerHTML=drawer.editing?editHTML(a):readHTML(a);
  if(drawer.editing){
    const ta=c.querySelector('textarea[data-field=notes]');if(ta){ta.value=a.notes||'';autoGrow(ta);}
    const tb=c.querySelector('textarea[data-field=bknotes]');if(tb){tb.value=(a.brokerage&&a.brokerage.notes)||'';autoGrow(tb);}
  }
  sc.classList.add('open');c.classList.add('open');
  const nb=c.querySelector('.cbody');if(nb)nb.scrollTop=top;
  if(!drawer.editing)drawCallSpans(a);
}
function openDrawer(id,dateId){
  drawer.id=id;drawer.edit=null;drawer.hi=dateId||null;drawer.editing=false;drawer.scope=null;
  renderDrawer();
  /* the panel is fixed inside a box that scrolls; focusing it without this
     asks the browser to bring it into view, and the board jumps to the top */
  $('#card').focus({preventScroll:true});
  if(dateId){const el=$('#card .ln.hi');if(el)el.scrollIntoView({block:'center'});}
}
function closeDrawer(){drawer.id=null;drawer.edit=null;drawer.hi=null;drawer.editing=false;drawer.scope=null;renderDrawer();}

/* ============ actions ============ */
function bkPos(a){return typeof a.bkPos==='number'?a.bkPos:1e9;}

/* The rotation wall's order. An arena with nothing recorded still earns a
   card while it is asking for something — a wait whose day is in reach —
   because a ghost at the foot of the wall cannot say so. It drops back to a
   ghost once the day has passed. The wall asks it of one type at a time;
   the new-lead menu on the Ledger lists the arenas the same way, type by
   type in Mark's order of types, each type's cards first and its ghosts
   after. */
function hasBrokerage(a){const b=a.brokerage||{};return !!(b.notes||(b.links||[]).length||(a.leads||[]).length);}
function rotationSplit(arenas){
  const ask=RUNG.asking[0];
  const scored=arenas.map(a=>({a,s:standing(a)}));
  const list=scored.filter(x=>hasBrokerage(x.a)||x.s.score>=ask)
    .sort((x,y)=>y.s.score-x.s.score||x.a.name.localeCompare(y.a.name));
  const empty=scored.filter(x=>!hasBrokerage(x.a)&&x.s.score<ask).map(x=>x.a)
    .sort((x,y)=>x.name.localeCompare(y.name));
  return{list,empty};
}
function rotationOrder(arenas){
  const out=[];
  S.types.map(t=>t.id).concat([null]).forEach(id=>{
    const{list,empty}=rotationSplit(arenas.filter(a=>id?a.typeId===id:!typeOf(a)));
    out.push(...list.map(x=>x.a),...empty);
  });
  return out;
}
/* ───────── standing ─────────
   A card's height on the wall is one number, and three things move it. None of
   the arithmetic is ever on screen: a card shows a follow-up, or just its own
   size.

   SWEEP   the plain rotation. You go through a platform, you stamp it, it
           sinks; time floats it back up. The calendar raises the ceiling — a
           platform is worth trawling once its call is published, best shortly
           after, tailing off towards the deadline.
           Finding the event or the tool in the first place used to be a
           fourth: a notice in the run-up to a publication that asked you to go
           and look. It kept asking for hunts the scheduled agents now do every
           night, so it is gone; what they find waits in Dispatches.
   A lead's day used to be a fourth: on the day, its card went to the top of
   the wall with a green strip. The Ledger's board now carries every lead on
   its day, so the card no longer calls out for it (Mark, 2026-10-06) — a lead
   changes nothing about where its arena stands. Putting a card away is the
   wait, below.
   WAIT    parked against a date of its own: dormant until three weeks out,
           then awake and climbing as the day comes. */
const SWEEP_CYCLE=28;                    /* days for an untouched card to climb back */
const SWEEP_SHORT=7;                     /* ...and while one of its calls is open */

const NEAR=21;                           /* three weeks: when a dated thing becomes your business */
const EVENT_NEAR=30;                     /* a month either side of a brokerage event */
const FORMING=42;                        /* six weeks: about how long a consortium takes to come
                                            together — which is why brokerage surfaces within
                                            roughly that long after a call opens, and why it is
                                            worth nothing that long before the call shuts */
const clamp01=x=>x<0?0:x>1?1:x;
const daysBetween=(a,b)=>Math.round((b-a)/DAY);

/* ───────── one ladder, four rungs ─────────
   A card is in exactly one state, and the rungs do not overlap, so the order you
   read down the wall is the order of the ladder itself: what is asking to be
   looked at, what is merely due a turn, and what is parked. (There was a
   fourth rung above them, for a lead whose day had come; see "standing".)
   Before this the branches read as a ladder but the numbers did not — ordinary
   rotation could climb past a card that was asking you a question. Now the kind
   of thing decides the rung and the degree decides the place within it. */
const RUNG={asking:[.68,.88],turning:[.10,.66],parked:[0,.04]};
const rung=(r,t)=>r[0]+(r[1]-r[0])*clamp01(t);
/* parked cards still order among themselves, by how soon they are due back */
const soon=days=>clamp01(1-days/180);

/* this year is understood, so it goes unsaid */
const trimYear=s=>{const y=' '+new Date().getFullYear();return s.endsWith(y)?s.slice(0,-y.length):s;};
const shortDay=iso=>trimYear(fmtDay(iso));
const shortDate=dt=>(dt.gran==='range'&&dt.start&&dt.end)
  ? shortDay(dt.start)+' \u2013 '+shortDay(dt.end)
  : trimYear(dispDate(dt));

function callKey(dt){return (dt.call||'').trim().toLowerCase()||'#'+dt.id;}
function windowsOf(a){
  const by=new Map();
  for(const dt of (a.dates||[])){
    if(dt.kind!=='call'||!dt.start)continue;
    const k=callKey(dt);
    if(!by.has(k))by.set(k,{key:k,name:dt.call||'Untitled call'});
    by.get(k)[ROLES[dt.role]?dt.role:'publication']=dt;
  }
  return [...by.values()];
}

/* How badly a call wants you to go through the platform for partners.

   Partner search is front-loaded. Profiles take a week or two to appear on a
   matchmaking platform after a call opens, so the trawl is worth most about
   three weeks in; and by the last six weeks before the deadline the consortia
   have closed and the writing has started, so a sweep then turns up little but
   others in the same position. The ramp therefore runs over that forming window
   rather than over the whole call, and its peak sits at a real three weeks
   rather than at a share of however long the call happens to run — brokerage
   lands a month or so after opening whether the call is open for three months
   or for seven. */
function sweepOf(w){
  const now=T(todayISO());
  const pub=w.publication,dl=w.deadline;
  if(!pub)return null;
  const from=T(pub.end);
  const shut=dl?T(dl.end):from+3*FORMING*DAY;   /* no deadline recorded: assume about four months */
  if(now<from||now>shut)return null;
  const open=dl?('Open until <b>'+esc(shortDate(dl))+'</b>'):'Call open';
  const close=Math.max(from+7*DAY,shut-Math.min(FORMING*DAY,.45*(shut-from)));
  /* still open, but too late to be joining a consortium */
  if(now>close)return {pull:0,text:open+' \u2014 consortia will be settled by now'};
  const peak=from+Math.min(NEAR*DAY,(close-from)*.4);
  const pull=now<=peak?(now-from)/(peak-from):1-(now-peak)/(close-peak);
  return {pull:clamp01(pull),text:open};
}
/* The next dated thing this arena has coming, of any kind — what a card waits
   for when you tell it to wait. */
function futureDates(a){
  const now=T(todayISO());
  return (a.dates||[]).filter(d=>d.start&&T(d.end||d.start)>=now)
    .sort((x,y)=>T(x.start)-T(y.start));
}
function nextDate(a){return futureDates(a)[0]||null;}
/* The other thing that quickens a card, and the plainest one: a brokerage event
   of its own, close by. From a month before until a month after, the arena is
   worth looking at weekly whatever else is true of it — beforehand because
   registration, profiles and the agenda all land in those weeks, and afterwards
   because that is when the contacts made there are still warm.

   Only an actual event counts. A brokerage entry pencilled into a quarter or a
   year is a guess at a season, not a date, so anything spanning more than about
   six weeks is left out of it. */
function eventNear(a){
  const now=T(todayISO());
  for(const d of (a.dates||[])){
    if(d.kind!=='brokerage'||!d.start)continue;
    const s=T(d.start),e=T(d.end||d.start);
    if(e-s>45*DAY)continue;
    if(now>=s-EVENT_NEAR*DAY&&now<=e+EVENT_NEAR*DAY)return d;
  }
  return null;
}
/* Both branches used to test for a nought day, and both dates here are
   noon-normalised \u2014 so a day that has neither arrived nor passed is always
   at least one, and "tomorrow" and "yesterday", which were plainly what was
   wanted, could not be reached. Today itself is caught by the middle line. */
function eventNote(d){
  const now=T(todayISO()),s=T(d.start),e=T(d.end||d.start);
  const said='<b>'+esc(dtLabel(d))+'</b>';
  if(now<s){const n=daysBetween(now,s);
    return said+' \u2014 '+(n===1?'tomorrow':'in '+n+' days');}
  if(now<=e)return said+' \u2014 on now';
  const n=daysBetween(e,now);
  return said+' \u2014 '+(n===1?'yesterday':n+' days ago');
}

/* A wait, resolved: dormant until a few weeks out, then awake and climbing as
   the day approaches. The event is held by reference, so if you move the date
   the wait moves with it; if you delete it, the wait is over. */
function holdOf(a){
  if(!a.hold||!a.hold.dateId)return null;
  const dt=(a.dates||[]).find(d=>d.id===a.hold.dateId&&d.start);
  if(!dt)return null;
  const now=T(todayISO()),at=T(dt.start),gone=T(dt.end||dt.start);
  if(gone<now)return null;                       /* the day has been and gone */
  const wake=at-NEAR*DAY,near=daysBetween(now,at);
  return {dt,at,wake,near,asleep:now<wake,label:dtLabel(dt)};
}

/* What a sweep turned up. A lead is open until you tick it off; a done one stays
   in the record, because "did this arena ever produce anything" is a question
   worth being able to answer. */
function openLeads(a){return (a.leads||[]).filter(l=>!l.doneAt);}
function doneLeads(a){return (a.leads||[]).filter(l=>l.doneAt);}
/* A list of leads is read as a funnel, not as a diary: everything still only
   spotted stands in one section, then what has been contacted, then what is
   being talked to — the same three steps, running down the card, each behind
   its own wall.

   Inside a section the day decides, soonest first, then the undated. Which is
   the opposite of what this used to say, and for a reason: while the step was
   carried by the sort itself, letting the date sort too meant one column was
   trying to say two things and said neither. Now the section says the step and
   nothing else has to, so the order within it is free to be the plain
   chronological one — read down a section and you read forward in time. */
const STAGE_RANK={spotted:0,contacted:1,talking:2};
function leadOrder(x,y){
  const s=STAGE_RANK[stageOf(x)]-STAGE_RANK[stageOf(y)];
  if(s)return s;
  if(!!x.due!==!!y.due)return x.due?-1:1;               /* dated before undated */
  if(x.due&&y.due&&x.due!==y.due)return x.due<y.due?-1:1;
  return leadName(x).localeCompare(leadName(y));
}
function sortedOpen(a){return openLeads(a).slice().sort(leadOrder);}
/* the closed ones are a record rather than a queue, so they read newest first */
function sortedDone(a){return doneLeads(a).slice().sort((x,y)=>
  String(y.doneAt||'').localeCompare(String(x.doneAt||''))||leadName(x).localeCompare(leadName(y)));}
function leadName(l){return l.project||(l.links[0]?linkName(l.links[0]):'')||'Untitled lead';}

function standing(a){
  const now=T(todayISO());
  let sweep=null;
  for(const w of windowsOf(a)){
    const K=sweepOf(w);
    if(K&&(!sweep||K.pull>sweep.pull))sweep={...K,call:w.name};
  }
  /* An open call puts the card on a short rotation rather than letting it stand:
     the cadence tightens from four weeks to about a week at the peak of the
     window, so it keeps coming back around while the call is live. The arena's
     standing weight scales that whole cadence — the call says how live this
     moment is, the weight says how much the arena is worth at all, and they
     multiply rather than competing. */
  const W=WEIGHTS[weightOf(a)];
  let cycle=W.turn*(SWEEP_CYCLE-(SWEEP_CYCLE-SWEEP_SHORT)*(sweep?sweep.pull:0));
  /* An event of its own is a floor, not another multiplier: within the month
     either side the card comes round at least weekly however peripheral the
     arena and however quiet its calls. */
  const event=eventNear(a);
  if(event)cycle=Math.min(cycle,SWEEP_SHORT);
  const rest=a.sweptAt?clamp01(daysBetween(T(a.sweptAt),now)/cycle):1;
  const hold=holdOf(a);
  const st={sweep,event,rest,hold,note:null,state:'rotate',score:0};
  if(hold&&hold.asleep){                    /* asleep until its own date */
    st.state='held';st.score=rung(RUNG.parked,soon(daysBetween(now,hold.wake)));
  }else if(hold){                                 /* that date is in reach */
    st.state='wake';st.score=rung(RUNG.asking,1-hold.near/NEAR);
  }else{                                          /* simply due a turn */
    /* the event is the more immediate fact of the two, so it is the one said */
    st.note=event?{pull:1,text:eventNote(event)}:sweep;
    /* every term scales with rest, so a card just stamped sits at the foot of
       the rung whatever its weight or its calls — nothing shouts at you the day
       you handled it. The weight only breaks the tie when two cards have gone
       equally stale. */
    st.score=rung(RUNG.turning,.70*Math.pow(rest,1.4)+.20*(sweep?sweep.pull:0)*rest+.10*W.lift*rest);
    st.state=sweep&&sweep.pull>.2?'sweep':'rotate';
  }
  return st;
}
function promptCount(){
  /* whatever stands on the asking rung or above is asking you something */
  return visibleArenas().filter(a=>standing(a).score>=RUNG.asking[0]).length;
}
function sweptTitle(a){
  if(!a.sweptAt)return 'Not swept yet \u2014 click when you have been through the platform';
  const d=daysBetween(T(a.sweptAt),T(todayISO()));
  if(d<=0)return 'Swept today \u2014 click to undo';
  return 'Swept '+(d===1?'yesterday':d+' days ago')+' \u2014 click to log a new sweep';
}
function sweptLine(a){
  if(!a.sweptAt)return 'Never swept';
  const d=daysBetween(T(a.sweptAt),T(todayISO()));
  return d<=0?'Swept today':d===1?'Swept yesterday':'Swept '+d+' days ago';
}
/* What the nightly agents brought, and whether you have looked since. A date
   or a link that comes in through Dispatches carries `foundAt`, the moment it
   was accepted, and reads as new until the arena is next swept — a sweep is
   already the act that means "I have been through this one", so it needs no
   second button to say so. The card and the panel ask this of the same
   record, which is what keeps the two in step: sweep from either and the mark
   goes from both. Before this an accepted finding simply joined the arena
   and looked exactly like something typed by hand, so a morning's Accept all
   left nothing to say what had changed. */
function isFresh(a,x){return !!(x&&x.foundAt)&&(!a.seenAt||x.foundAt>a.seenAt);}
function freshItems(a){
  const bk=a.brokerage||{links:[]};
  return (a.dates||[]).concat(bk.links||[],a.links||[]).filter(x=>isFresh(a,x));
}
function foundTitle(x){
  return 'Found by the nightly agent'+(x.foundAt?' — accepted '+shortDay(x.foundAt.slice(0,10)):'')+
    '. New until you next sweep this arena.';
}
function freshTag(a,x){
  return isFresh(a,x)?'<i class="wfresh" title="'+esc(foundTitle(x))+'">new</i>':'';
}
/* Every link row, on a card and in the panel alike: the link, then the two
   things you do to it in passing — pin it, or take it off. `scope` says which
   of the arena's two lists it is in, so a row can also be dragged to a new
   place (see "putting links in your own order").

   A pinned link has gone to the Pinned arrangement and stands there on its
   own, so a card leaves it out (`onCard`): seen twice it would be read as
   two things. The panel still lists it, pin lit — the panel is the arena's
   whole record, and the place to take a pin back. */
/* On a rotation card a link is its name alone, its host left off (Mark,
   2026-10-12): the address is a hover away, in the title. In its place the
   link carries its stamp, the site's (stampMates), so a site gone through
   from one card shows as gone through on every card that links it. */
function wallLinkRows(a,list,scope,onCard){
  return (list||[]).filter(lk=>!(onCard&&lk.pin)).map(lk=>{
    const nm=esc(linkName(lk));
    const body=lk.url
      ? '<a class="wlink" draggable="false" href="'+esc(lk.url)+'" target="_blank" rel="noopener" title="'+esc(lk.url)+'">'+
          '<span class="wn">'+nm+'</span>'+freshTag(a,lk)+(onCard?'':'<span class="wd">'+esc(linkHost(lk))+'</span>')+'</a>'
      : '<span class="wlink dead"><span class="wn">'+nm+'</span>'+freshTag(a,lk)+'</span>';
    const ref=' data-a="'+a.id+'" data-lks="'+scope+'" data-l="'+esc(lk.id||'')+'"';
    let stamp='';
    if(onCard&&lk.url){
      const{on,d,ageTip,stTip}=stampSay(stampOf(lk));
      const tip=on?stTip:ageTip+' — stamp it once you have been through it';
      stamp='<button class="stamp'+(on?' on':'')+(d===null?'':' dated')+'" data-act="lkStamp"'+ref+' title="'+tip+'" aria-label="'+tip+'">✓'+
        (d===null?'':'<span class="sdays">'+Math.max(0,d)+'</span>')+'</button>';
    }
    return '<div class="wlrow" data-lk="'+esc(lk.id||'')+'">'+body+
      '<span class="wlc">'+
        '<button class="lpin'+(lk.pin?' on':'')+'" data-act="lkPin"'+ref+
          ' title="'+(lk.pin?'Pinned — click to take it off Pinned':'Pin this link — it moves to Pinned')+'"'+
          ' aria-label="'+(lk.pin?'Unpin ':'Pin ')+nm+'"><i></i></button>'+
        '<button class="ldel" data-act="lkDel"'+ref+' title="Remove this link" aria-label="Remove '+nm+'">✕</button>'+
        stamp+
      '</span></div>';
  }).join('');
}
/* the list a link row belongs to, and the link itself */
function linkList(a,scope){
  if(!a)return null;
  if(scope==='arena')return a.links||(a.links=[]);
  a.brokerage=a.brokerage||{notes:'',links:[]};
  return a.brokerage.links||(a.brokerage.links=[]);
}
function linkOf(a,scope,id){const l=linkList(a,scope);return l?l.find(x=>x.id===id):null;}
/* a change to a link shows on the card, in the panel and on Pinned at once */
function relinked(){save();repaint();renderDrawer();}
function wallLinks(a,scope,rows){
  return '<div class="wlinks" data-a="'+a.id+'" data-lks="'+scope+'">'+rows+'</div>';
}
/* ---- the line on top of a card ----
   What a card has to say first is where its arena stands in a call's run:
   open, about to open, or between calls, and how long until the next thing
   that matters. It was a spine of up to four dates, and on a real wall
   those were topic codes cut off at the same point, several of them
   sharing one deadline, so finding out whether anything was open meant
   reading every row, and the links under it read as more of the same
   (Mark, 2026-10-07: "a mess"). Now it is one phase line over a strip of
   time, picked from three drawn options.

   The strip runs from five weeks back to the last date it shows. A call is
   a bar from its publication to its deadline. The stages of one call —
   Stage 1 and Stage 2, pre- and full proposals, outline and full proposal —
   are one bar with a notch at each earlier deadline (`callBase`), and calls
   with exactly the same dates are one bar, because a cluster's work
   programme opens a dozen topics on the same two days and a dozen identical
   bars say nothing. Brokerage events are diamonds on a lane above, and
   today is the gold line through both. Names are in the room's tooltip:
   the strip is a picture of where you are, the panel is where you read.
   A call on it opens the panel on its own date, as the rows did; a
   brokerage event, on the strip or named by the phase line, is shown in
   Coming up (jumpDate), where its website and its stamp are.

   A call whose deadline has passed leaves the card; the panel keeps it.
   A top card draws up to four calls, a middle card two, the tail none. */
function callBase(n){
  return String(n||'').replace(/\s*\(expected\)/ig,'')
    .replace(/\s*[–—-]\s*(stage\s*\d|pre-?proposals?|full( project)? proposals?|project outline).*$/i,'')
    .replace(/[\s\/]+stage\s*\d.*$/i,'').trim();
}
function callRuns(a){
  const now=T(todayISO()),by=new Map();
  for(const d of a.dates||[]){
    if(d.kind!=='call'||!d.start||d.gran==='none')continue;
    const k=callBase(dtLabel(d))||dtLabel(d);
    if(!by.has(k))by.set(k,{all:[],opens:[],anns:[],dls:[]});
    const r=by.get(k);
    r.all.push(d);
    (d.role==='deadline'?r.dls:d.role==='announcement'?r.anns:r.opens).push(d);
  }
  const byStart=(x,y)=>T(x.start)-T(y.start);
  const merged=new Map();
  for(const r of by.values()){
    r.opens.sort(byStart);r.anns.sort(byStart);r.dls.sort(byStart);
    /* a bar opens on the publication; the announcement window is only the
       opening when no publication is known. It is uncertain when either of
       its two ends is — ITEA's call was drawn dashed for a vague
       announcement month although its publication and deadline were fixed */
    r.open=r.opens[0]||r.anns[0]||null;
    r.close=r.dls[r.dls.length-1]||null;
    r.unc=[r.open,r.close].some(d=>d&&d.grade!=='fixed');
    r.next=r.dls.find(d=>T(d.end||d.start)>=now)||null;
    /* a publication with no deadline recorded is taken as open for a year,
       which is longer than any call here runs, and closed after that */
    const endT=r.close?T(r.close.end||r.close.start):T(r.open.start)+365*DAY;
    r.state=endT<now?'closed':(r.open&&T(r.open.start)>now?'soon':'open');
    const key=(r.open?r.open.start:'')+'|'+r.dls.map(d=>d.start).join(',')+'|'+r.unc;
    if(merged.has(key))merged.get(key).all.push(...r.all);else merged.set(key,r);
  }
  const all=[...merged.values()];
  const when=r=>r.state==='open'?(r.next?T(r.next.start):9e15):T(r.open.start);
  const live=all.filter(r=>r.state!=='closed')
    .sort((x,y)=>(x.state==='soon')-(y.state==='soon')||when(x)-when(y));
  const last=all.filter(r=>r.state==='closed')
    .sort((x,y)=>T(y.close?y.close.start:y.open.start)-T(x.close?x.close.start:x.open.start))[0]||null;
  return {live,last,all};
}
/* the calls on one bar, each named once, and the dates the bar runs between */
function runTip(r){
  const names=[...new Set(r.all.map(dtLabel))];
  const span=(r.open?'Publication '+dispDate(r.open):'Publication not recorded')+
    (r.close?'  →  deadline '+dispDate(r.close):'  →  no deadline recorded');
  const stages=r.dls.length>1?'\n'+r.dls.length+' deadlines: '+r.dls.map(shortDate).join(', '):'';
  return names.join('\n')+'\n'+span+stages+(r.unc?'\nUncertain':'');
}
/* `hi`, the id of one brokerage event: Coming up unfolds an arena's strip
   under one of its events and has that event marked on it (Mark,
   2026-10-12), with the strip widened to reach it however far off it is. */
function cardLineHTML(a,t,hi){
  const now=T(todayISO());
  const{live,last}=callRuns(a);
  const evs=(a.dates||[]).filter(d=>d.kind!=='call'&&d.start&&d.gran!=='none')
    .map(d=>({d,s:T(d.start),e:T(d.end||d.start)})).sort((x,y)=>x.s-y.s);
  const ahead=evs.filter(x=>x.e>=now);
  if(!live.length&&!last&&!evs.length)return '';
  const when=d=>(d.grade==='fixed'?'':'≈ ')+shortDate(d);
  const until=d=>{const n=daysBetween(now,T(d.start));
    return T(d.end||d.start)>=now&&n<=0?'on now':n<0?'':n===1?'tomorrow':'in '+n+' d';};

  /* the phase line: the one sentence the card leads with */
  let ph;
  const o=live.find(r=>r.state==='open'&&r.next)||live.find(r=>r.state==='open');
  const so=live.find(r=>r.state==='soon');
  if(o&&o.next)ph={w:'Open',c:'open',pre:'next deadline ',d:o.next};
  else if(o)ph={w:'Open',c:'open',pre:'published ',d:o.open,still:true};
  else if(so)ph={w:'Opens',c:'soon',pre:'',d:so.open};
  else if(ahead.length)ph={w:last?'Between calls':'No call dated',c:'none',pre:'brokerage ',d:ahead[0].d};
  else if(last)ph={w:'Between calls',c:'none',pre:'last deadline ',d:last.close||last.open,still:true};
  else ph={w:'No call dated',c:'none',pre:'',d:null};
  const n=ph.d&&!ph.still?until(ph.d):'';
  const fresh=(a.dates||[]).find(d=>isFresh(a,d));
  const phInner='<span class="wpw '+ph.c+'">'+ph.w+'</span>'+
    '<span class="wpt">'+esc(ph.pre)+(ph.d?'<span class="wpd'+(ph.d.grade==='fixed'?'':' unc')+'">'+esc(when(ph.d))+'</span>':'')+
      (fresh?freshTag(a,fresh):'')+'</span>'+
    (n?'<span class="wpn">'+n+'</span>':'');
  const phase=ph.d
    ?'<button class="wph" data-act="'+(ph.d.kind==='call'?'openDate':'jumpDate')+'" data-a="'+a.id+'" data-d="'+ph.d.id+'">'+phInner+'</button>'
    :'<div class="wph">'+phInner+'</div>';

  /* the strip */
  const rows=live.slice(0,t==='mid'?2:4);
  const me=hi?evs.find(x=>x.d.id===hi):null;
  const t0=Math.min(now-35*DAY,me?me.s-14*DAY:Infinity);
  let t1=now+100*DAY;
  /* a call with no deadline yet gets two months past its opening, so it is
     seen to begin rather than squeezed against the edge */
  for(const r of rows)t1=Math.max(t1,r.close?T(r.close.end||r.close.start):T(r.open.start)+60*DAY);
  for(const x of ahead.slice(0,3))t1=Math.max(t1,x.e);
  if(me)t1=Math.max(t1,me.e);
  t1=Math.min(t1+12*DAY,Math.max(now+380*DAY,me?me.e+12*DAY:0));
  const P=v=>Math.max(0,Math.min(100,(v-t0)/(t1-t0)*100)).toFixed(2);
  let lane='';
  for(const x of evs){
    if(x.e<t0||x.s>t1)continue;
    const cls=(x.e<now?' past':'')+(x.d.grade==='fixed'?'':' unc')+(isFresh(a,x.d)?' fresh':'')+(x===me?' this':'');
    if(x.e-x.s>=3*DAY)lane+='<span class="wsr'+(x.e<now?' past':'')+(x===me?' this':'')+'" style="left:'+P(x.s)+'%;width:'+(P(x.e)-P(x.s)).toFixed(2)+'%"></span>';
    lane+='<button class="wsd'+cls+'" data-act="jumpDate" data-tipd data-a="'+a.id+'" data-d="'+x.d.id+'" '+
      'style="left:'+P(x.s)+'%" aria-label="'+esc(dtLabel(x.d)+', '+dispDate(x.d))+'"></button>';
  }
  const bars=rows.map(r=>{
    const x0=r.open?+P(T(r.open.start)):0;
    const x1=r.close?+P(T(r.close.end||r.close.start)):100;
    const w=Math.max(x1-x0,.8);
    const notch=r.dls.slice(0,-1).map(d=>'<i style="left:'+((+P(T(d.start))-x0)/w*100).toFixed(1)+'%"></i>').join('');
    const at=r.next||r.close||r.open;
    const cls=(r.unc?' unc':'')+(r.open?'':' lead-in')+(r.close?'':' run-on')+(r.all.some(d=>isFresh(a,d))?' fresh':'');
    return '<div class="wsrow"><button class="wsb'+cls+'" data-act="openDate" data-a="'+a.id+'" data-d="'+at.id+'" '+
      'data-tipt="'+esc(runTip(r))+'" style="left:'+x0.toFixed(2)+'%;width:'+w.toFixed(2)+'%" '+
      'aria-label="'+esc(dtLabel(at)+', '+dispDate(at))+'">'+notch+'</button></div>';
  }).join('');
  /* a letter per month, the year in place of January's; a label that would
     run into the one before it (a year is four letters wide) is left out */
  let ticks='',lastX=-99,lastW=0;
  const span=(t1-t0)/DAY,step=span>300?2:1;
  const m=new Date(t0);m.setDate(1);m.setMonth(m.getMonth()+1);
  for(let i=0;m.getTime()<t1;i++,m.setMonth(m.getMonth()+1)){
    const jan=m.getMonth()===0,x=+P(m.getTime());
    ticks+='<i style="left:'+x.toFixed(2)+'%"></i>';
    if((i%step===0||jan)&&x<96&&x-lastX>=lastW){
      ticks+='<span class="'+(jan?'y':'')+'" style="left:'+x.toFixed(2)+'%">'+(jan?m.getFullYear():MONTHS[m.getMonth()][0])+'</span>';
      lastX=x;lastW=jan?9:3.5;          /* in % of a strip 250–320px wide */
    }
  }
  const more=live.length-rows.length;
  return '<div class="wline">'+phase+
    '<div class="wstrip">'+
      '<div class="wsl">'+lane+'</div>'+
      (bars?'<div class="wsbars">'+bars+'</div>':'')+
      '<span class="wsnow" style="left:'+P(now)+'%"></span>'+
      '<div class="wsx">'+ticks+'</div>'+
    '</div>'+
    (more>0?'<p class="wlmore">+'+more+' more call'+(more>1?'s':'')+'</p>':'')+
  '</div>';
}
function linkHost(lk){
  try{return new URL(lk.url).hostname.replace(/^www\./,'');}catch(e){return '';}
}
function lkFormHTML(a,leadId){
  return '<form class="lkform" data-lka="'+a.id+'"'+(leadId?' data-lkl="'+esc(leadId)+'"':'')+'>'+
    '<input class="lu" name="url" placeholder="'+(leadId?'https://\u2026 or name@\u2026':'https://\u2026')+'" '+
      'aria-label="'+(leadId?'Link or email address':'Link address')+'" autocomplete="off">'+
    '<input class="lx" name="label" placeholder="'+(leadId?'Whose, or what \u2014 optional':'Name it \u2014 optional')+'" '+
      'aria-label="Link name" autocomplete="off">'+
    '<button type="submit" class="ib" title="Add" aria-label="Add link">\u2713</button>'+
    '<button type="button" class="ib" data-act="lkCancel" title="Done" aria-label="Done">\u2715</button>'+
  '</form>';
}
/* ───────── leads ─────────
   The links above are the arena's standing infrastructure: the platform, the
   programme page, the things you sweep. A lead is what the sweeping turned up —
   a partner, a project page, a thread — and it carries its own note, its own
   links and its own day to come back. Keeping the two apart is the whole point:
   one is the tool, the other is the catch.

   Leads stay shut, and none of them raises its arena's card — their days are
   on the Ledger's board. They are worked in the arena's panel and on Leads,
   not on the cards: Mark took them off the rotation cards on 2026-10-11. */
/* The form a NEW lead is written in. An existing lead is edited in its own
   card now (see "one lead card, in both rooms"), so this has one job. */
function leadFormHTML(a){
  /* Both boxes grow as you type rather than scrolling sideways: what you are
     writing here is a couple of sentences, and losing sight of the first half
     of them while writing the second is the whole problem with a one-line
     field. The stage and the date are not here — they are set on the row
     itself, where they are read, and a property with two doors is exactly
     what this card had too much of. */
  const box=(k,v,ph)=>'<textarea class="grow" name="'+k+'" rows="1" placeholder="'+ph+'" '+
    'aria-label="'+ph+'">'+esc(v||'')+'</textarea>';
  return '<form class="leadform" data-la="'+a.id+'" data-lid="new">'+
    box('project','','What is the project?')+
    box('match','','Who could be a good match?')+
    /* the link a lead is found with gets a name as well, as every other link
       on a lead can, and a lead is often found with more than one — the
       call, the project, a person — so another row is a press away (Mark,
       2026-10-06) */
    leadFormLinkHTML()+
    '<button type="button" class="lfmore" data-act="leadLinkRow">+ Another link</button>'+
    '<div class="lfbtn">'+
      '<span class="lfhint">the day and the step are set on the card</span>'+
      '<span class="sp"></span>'+
      '<button type="button" class="ib" data-act="leadCancel" title="Cancel" aria-label="Cancel">\u2715</button>'+
      '<button type="submit" class="ib ok" title="Save \u2014 or \u2318\u21A9" aria-label="Save lead">\u2713</button>'+
    '</div>'+
  '</form>';
}
function leadFormLinkHTML(){
  return '<div class="lnrow">'+
    '<input class="ln3" name="url" placeholder="https://\u2026 or name@\u2026 \u2014 a link, optional" aria-label="Link or email address" autocomplete="off">'+
    '<input class="ln3 lnl" name="label" placeholder="Whose, or what \u2014 optional" aria-label="Name the link" autocomplete="off">'+
  '</div>';
}
/* One line of history, written where the last one was read. */
function noteFormHTML(a,l){
  return '<form class="noteform" data-na="'+a.id+'" data-nl="'+l.id+'">'+
    '<textarea class="grow" name="text" rows="1" placeholder="What has happened?" '+
      'aria-label="What has happened"></textarea>'+
    '<div class="lfbtn"><span class="lfhint">\u2318\u21A9 to keep</span><span class="sp"></span>'+
      '<button type="button" class="ib" data-act="noteCancel" title="Cancel" aria-label="Cancel">\u2715</button>'+
      '<button type="submit" class="ib ok" title="Keep \u2014 or \u2318\u21A9" aria-label="Keep">\u2713</button></div>'+
  '</form>';
}
/* Updates were once stamped with a formatted string; new ones carry the day
   itself, so both have to read the same. */
function updWhen(u){
  if(!u)return '';
  if(u.at)return shortDay(u.at);
  const m=/^(\d{1,2})\s+([A-Za-z]{3})/.exec(String(u.stamp||''));
  return m?(m[1]+' '+m[2]):String(u.stamp||'').slice(0,6);
}
/* The lead's own links: its catch, not the arena's tools, so they are listed
   in their own smaller hand and each one can be taken off again. */
function leadLinkRows(a,l,shut){
  return (l.links||[]).map(lk=>{
    const nm=esc(linkName(lk));
    const body=lk.url
      ? '<a class="lla'+(/^mailto:/i.test(lk.url)?' mail':'')+'" draggable="false" href="'+esc(lk.url)+'" target="_blank" rel="noopener" '+
          'title="'+esc(lk.url.replace(/^mailto:/i,''))+'"><i></i>'+nm+'</a>'
      : '<span class="lla dead"><i></i>'+nm+'</span>';
    const x=shut?'':'<button class="lx" data-act="leadLinkDel" data-id="'+a.id+'" data-l="'+l.id+'" '+
      'data-k="'+lk.id+'" title="Take this link off" aria-label="Remove link">\u2715</button>';
    return '<div class="llrow">'+body+x+'</div>';
  }).join('');
}
/* Every band under the name is written the same way — a word in the label
   gutter, the thing itself in the column beside it — and each one is a section
   of its own with a rule above it. Same left edge as before, but the bands no
   longer run together into one grey paragraph. */
function leadSec(label,body,cls){
  return '<div class="lsec'+(cls?' '+cls:'')+'">'+
    '<i class="lsl">'+label+'</i><div class="lsb">'+body+'</div></div>';
}
/* ───────── the ruit ─────────
   Where a lead has got to, drawn as a diamond (Mark's word: a ruit, 2026-10-06).
   From Spotted on the left the line splits — the upper path is the researchers
   on our side who have been asked, the lower one the lead itself written to —
   and the two meet again at Talking on the right. The two middle dots switch on
   their own, so either path or both can be lit; the paths taken stay lit once a
   lead is talking. The section the lead stands in is still worked out from
   `stage`, so the three sections are unchanged.

   The Ledger draws the same ruit for the same lead; the two are written once in
   each room because a room never borrows another room's code, and they are
   kept to the same geometry so they read as one mark. */
const RUIT={sp:[6,13],r:[23,5],l:[23,21],t:[40,13]};
function leadRuitHTML(a,l,st,done){
  const r=!!l.toResearchers,ld=!!l.toLead,talk=st==='talking';
  const seg=(p,q,on)=>'<line x1="'+p[0]+'" y1="'+p[1]+'" x2="'+q[0]+'" y2="'+q[1]+'"'+(on?' class="on"':'')+'/>';
  const now=k=>k==='sp'?st==='spotted':k==='t'?talk:(st==='contacted'&&(k==='r'?r:ld));
  const on={sp:true,r,l:ld,t:talk};
  const NAMES={sp:'Spotted — clears both paths',r:'Researchers contacted',l:'Lead contacted',t:'Talking'};
  const V={sp:'spotted',r:'researchers',l:'lead',t:'talking'};
  return '<span class="lruit'+(done?' shut':'')+'" role="group" aria-label="Where this lead has got to">'+
    '<svg viewBox="0 0 46 26" aria-hidden="true">'+
      seg(RUIT.sp,RUIT.r,r)+seg(RUIT.sp,RUIT.l,ld)+seg(RUIT.r,RUIT.t,talk&&r)+seg(RUIT.l,RUIT.t,talk&&ld)+
    '</svg>'+
    ['sp','r','l','t'].map(k=>'<button class="ldot'+(on[k]?' on':'')+(now(k)?' now':'')+'" '+
      'style="left:'+RUIT[k][0]+'px;top:'+RUIT[k][1]+'px" '+
      'data-act="leadPath" data-id="'+a.id+'" data-l="'+l.id+'" data-v="'+V[k]+'" '+
      'title="'+NAMES[k]+'" aria-label="'+NAMES[k]+'" aria-pressed="'+(on[k]?'true':'false')+'"'+
      (done?' disabled':'')+'><i></i></button>').join('')+
  '</span>';
}
/* What a press on one of the ruit's dots does — the one place it is decided,
   used by this room's own dots and by the Ledger's. The first dot puts a lead
   back to Spotted; a middle dot switches its path; the last makes the lead
   Talking, or takes it back to Contacted when it already is. A lead with no
   path left lit falls back to Spotted, because "contacted, but nobody" says
   nothing; and a lead made Talking with no path yet takes the lower one, the
   lead itself, since a conversation is with someone. */
function leadPath(l,v){
  if(v==='spotted'){l.stage='spotted';l.toResearchers=false;l.toLead=false;return true;}
  if(v==='researchers'||v==='lead'){
    const k=v==='researchers'?'toResearchers':'toLead';
    l[k]=!l[k];
    if(!l.toResearchers&&!l.toLead)l.stage='spotted';
    else if(l.stage==='spotted')l.stage='contacted';
    return true;
  }
  if(v==='talking'){
    if(l.stage==='talking'){l.stage=(l.toResearchers||l.toLead)?'contacted':'spotted';return true;}
    if(!l.toResearchers&&!l.toLead)l.toLead=true;
    l.stage='talking';return true;
  }
  return false;
}
/* ───────── the score ─────────
   How much a lead is worth to Mark, one to five, set by himself (he asked for
   it on 2026-10-10). One dot with the number in it, coloured from red for a 1
   to green for a 5, so a column of leads can be read for its best ones at a
   glance; a lead with no score yet shows an empty ring. The dot is a menu: an
   invisible select lies over it, as the invisible date field lies over the
   day, so the desk and the iPad each open their own picker and nothing new
   has to be drawn for it. It is his judgement, not a step, so it orders
   nothing and moves nothing.

   The Ledger draws the same dot for the same lead and asks this room to set
   it (the `score` verb), so the two always agree. */
function leadScoreHTML(a,l,shut){
  const n=l.score||0;
  const tip=n?'Worth '+n+' of 5 — click to change':'Not scored yet — click to score how valuable this lead is';
  return '<label class="lscore s'+n+(shut?' shut':'')+'" title="'+tip+'">'+
    '<span aria-hidden="true">'+(n||'')+'</span>'+
    '<select data-lsa="'+a.id+'" data-lsl="'+l.id+'" aria-label="How valuable this lead is, 1 to 5"'+
      (shut?' disabled':'')+'>'+
      '<option value="0"'+(n?'':' selected')+'>No score</option>'+
      [1,2,3,4,5].map(k=>'<option value="'+k+'"'+(k===n?' selected':'')+'>'+k+(k===1?' — least':k===5?' — most':'')+'</option>').join('')+
    '</select></label>';
}
/* 1 to 5 sets the score, anything else takes it off */
function leadScore(l,v){
  const k=Math.round(+v);
  if(k>=1&&k<=5)l.score=k;else delete l.score;
  return true;
}
/* Closing a lead with how it ended — this room's Complete and the Ledger's
   both come here. */
function endLead(l,v){
  if(!isOutcome(v))return false;
  l.doneAt=todayISO();l.outcome=v;
  return true;
}
/* A lead that became a project is said out loud for the Ledger, where
   projects are kept: the bridge opens the Ledger's new project with the
   lead's name and links filled in (Mark, 2026-10-11). This room only says so,
   and knows nothing of where it goes. */
function leadToProject(a,l){
  try{
    if(typeof Hub!=='undefined'&&Hub.emit)Hub.emit('semaphore:project',{
      name:l.project||'',arena:a.name,
      links:(l.links||[]).filter(k=>k.url).map(k=>({name:linkName(k),url:k.url}))});
  }catch(e){console.error(e);}
}
/* Which of Contacted's two paths a lead is on, for the leads view's split.
   Both ways first: those are the most promising, and Mark asked for them on
   top of the stack (2026-10-08). The Ledger's list keeps the same order. */
const KIND_RANK={both:0,researchers:1,lead:2};
const KIND_NAME={researchers:'researchers contacted',both:'both contacted',lead:'lead contacted'};
function leadKind(l){return l.toResearchers&&l.toLead?'both':(l.toResearchers?'researchers':'lead');}
function leadKindHTML(k){
  const up=k!=='lead',dn=k!=='researchers';
  const ln=(x1,y1,x2,y2,on)=>'<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'"'+(on?' class="on"':'')+'/>';
  return '<div class="lkind"><svg viewBox="0 0 16 10" aria-hidden="true">'+
    ln(1,5,8,1.5,up)+ln(8,1.5,15,5,up)+ln(1,5,8,8.5,dn)+ln(8,8.5,15,5,dn)+
    '</svg><span>'+KIND_NAME[k]+'</span></div>';
}
/* ───────── one lead card, in both rooms ─────────
   Mark asked on 2026-10-06 for a lead to look the same wherever it is shown,
   and chose the Ledger's card as the standard: shut until pressed. So a lead
   here is two lines — its three steps and its day, then its name — and a press
   opens it to the same action row the Ledger's card has, in the same order and
   with the same words (+ Add update, + Link or email, Edit, then Complete at
   the far right), and under that its match, its links and its updates, newest
   first, each with its day. The colours stay this room's: dark on the wall and
   the board, paper in the drawer.

   Which leads stand open is not saved: it is where you are working this
   session, as it is on the Ledger. Opening a composer opens its lead. */
const leadOpen=new Set();
const LONG_DOW=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const LONG_MON=['January','February','March','April','May','June','July','August',
  'September','October','November','December'];
/* the day as the Ledger's card writes it, so the two read alike */
/* the short form for the quiet line: Sun 4 Oct */
function shortDow(iso){
  const d=new Date(iso+'T12:00:00');
  return LONG_DOW[d.getDay()].slice(0,3)+' '+d.getDate()+' '+LONG_MON[d.getMonth()].slice(0,3);
}
function longDay(iso){
  const d=new Date(iso+'T12:00:00');
  return LONG_DOW[d.getDay()]+' '+d.getDate()+' '+LONG_MON[d.getMonth()]+' '+d.getFullYear();
}
/* Each lead wears its arena type's colour (see "a type's colour"). */
function leadToneOf(a){return arenaTone(a);}
/* ───────── the colour dot ─────────
   On the leads view each row carries the Ledger's dot before the arena's
   name, in its type's colour. It was a button opening the swatches, when the
   colour was the arena's; the colour is chosen on the type now, at the head
   of its row on the wall or the board, so here the dot only shows it. */
function leadColHTML(a){
  const hex=arenaTone(a),t=typeOf(a);
  if(!hex)return '';
  return '<span class="lcolwrap"><span class="lcol" style="--c:'+esc(hex)+'" '+
    'title="'+esc((t?t.name+' \u2014 ':'')+'the colour of '+a.name+'\u2019s type')+'"><i aria-hidden="true"></i></span></span>';
}
/* ───────── a type's colour dot ─────────
   In the list of types each type carries its colour as a dot that opens the
   swatches. Only one menu is open at a time; a press anywhere else or Escape
   shuts it. The dot and the arrows that moved a type stood on the rows'
   own heads for a day, until Mark asked for everything about types in one
   place (2026-10-11, see "the types, managed"). */
let colOpen=null;
function typeDotHTML(t){
  const open=colOpen===t.id,cur=TONES.find(x=>x.k===t.color);
  const tip='Colour of '+t.name+(cur?' \u2014 '+cur.label:'')+' \u2014 click to change';
  return '<span class="lcolwrap tycol">'+
    '<button class="lcol'+(open?' open':'')+'" data-act="typeColMenu" data-id="'+t.id+'" style="--c:'+esc(toneHex(t.color))+'" '+
      'aria-haspopup="listbox" aria-expanded="'+(open?'true':'false')+'" '+
      'title="'+esc(tip)+'" aria-label="'+esc(tip)+'"><i aria-hidden="true"></i></button>'+
    (open
      ? '<span class="lcolpop" data-act="typeColPop" role="listbox" aria-label="Colour of '+esc(t.name)+'">'+
          TONES.map(x=>'<button class="lsw'+(x.k===t.color?' sel':'')+'" data-act="typeColor" data-id="'+t.id+'" '+
            'data-v="'+x.k+'" role="option" aria-selected="'+(x.k===t.color?'true':'false')+'" '+
            'style="--c:'+x.color+'" title="'+x.label+'" aria-label="'+x.label+'"></button>').join('')+
        '</span>'
      : '')+
  '</span>';
}
function leadRowHTML(a,l,hit,say){
  const now=T(todayISO());
  const over=l.due?daysBetween(T(l.due),now):null;
  const done=!!l.doneAt;
  const due=over!==null&&over>=0&&!done;      /* a closed lead is not owed */
  const st=stageOf(l);
  const ups=l.updates||[];
  const more=updOpen.has(l.id);
  const rows=(more?ups.map((u,i)=>[u,i]):ups.map((u,i)=>[u,i]).slice(-UPD_SHOWN)).reverse();
  const writing=noteEdit.a===a.id&&noteEdit.l===l.id;
  const adding=lkEdit.a===a.id&&lkEdit.l===l.id;
  /* Editing happens in the card itself (Mark, 2026-10-06): the card keeps
     its look and every fact on it becomes the field that holds it — the name,
     the match, each link's address and name, each update. It used to be swapped
     for a form holding only the first two. */
  const editing=!done&&leadEdit.a===a.id&&leadEdit.l===l.id;
  /* Complete asks how the lead ended before it closes it (see OUTCOMES) */
  const ending=!done&&endAsk.a===a.id&&endAsk.l===l.id;
  const open=leadOpen.has(l.id)||writing||adding||editing||ending;
  const ids='data-id="'+a.id+'" data-l="'+l.id+'"';
  /* the day, set where it is read; the invisible field over the label opens
     the calendar. Short on the quiet line of a card a few hundred pixels
     wide, where the long form pushed the match out. */
  /* While the card is being edited the day is one more of its fields: its
     calendar writes into the edit (`name="due"`) instead of saving at once,
     because a save redraws the card and would throw away everything else
     typed into it. The ruit waits for the same reason. */
  const when=done
    ? '<span class="lwhen shut" title="Closed">'+(isOutcome(l.outcome)?OUTCOMES[l.outcome].said+' \u00B7 ':'closed ')+
        esc(shortDay(l.doneAt))+'</span>'
    : editing
    ? '<label class="lwhen set" title="The day to come back to this \u2014 click to change it">'+
        '<span>'+esc(l.due?(say?longDay(l.due):shortDow(l.due)):'No date')+'</span>'+
        '<input type="date" name="due" value="'+esc(l.due||'')+'" data-say="'+(say?1:'')+'" '+
          'aria-label="Come back on"></label>'
    : '<label class="lwhen'+(l.due?' set':'')+(due?' late':'')+'" '+
        'title="'+(l.due?esc(longDay(l.due))+' — ':'')+'The day to come back to this — click to set it">'+
        '<span>'+esc(l.due?(say?longDay(l.due):shortDow(l.due)):'No date')+'</span>'+
        '<input type="date" value="'+esc(l.due||'')+'" data-lda="'+a.id+'" data-ldl="'+l.id+'" '+
          'aria-label="Come back on"></label>';
  /* How a lead ends. In the arena's panel it stands at the top right of the
     open card, where the eye leaves it, and only once the card is open
     (Mark, 2026-10-06); on the wide rows of the leads view it ends the action
     row, as Done ends a todo's. Pressed, it asks how the lead ended. */
  const doneBtn='<button class="ldone'+(done?' back':'')+'" data-act="leadDone" '+ids+' '+
      'title="'+(done?'Put this lead back into the funnel':'Done with this one — say how it ended; it stays in the record')+'" '+
      'aria-label="'+(done?'Reopen this lead':'Complete this lead')+'">'+
      '<i aria-hidden="true">'+(done?'↺':'✓')+'</i>'+(done?'Reopen':'Complete')+'</button>';
  /* Left to right as on the Ledger: what the lead is for, what changes it,
     what ends it. A closed lead is a record — the one thing left to do with it
     is put it back. While editing the row is the way out of the edit, and
     while Complete is asking how the lead ended it is the three answers. */
  const acts=ending
    ? '<div class="lacts"><span class="lendq">How did it end?</span>'+
        Object.keys(OUTCOMES).map(k=>'<button class="lact" data-act="leadEnd" '+ids+' data-v="'+k+'">'+
          OUTCOMES[k].name+'</button>').join('')+
        '<span class="sp"></span><button class="lact quiet" data-act="leadEndCancel">Cancel</button></div>'
    : editing
    ? '<div class="lacts"><span class="lfhint">⌘↩ to save</span><span class="sp"></span>'+
        '<button class="lact quiet" data-act="leadCancel">Cancel</button>'+
        '<button class="lact prim" data-act="leadSave" '+ids+'>Save</button></div>'
    : '<div class="lacts">'+
      (done?'':
        '<button class="lact prim" data-act="noteAdd" '+ids+'>+ Add update</button>'+
        '<button class="lact" data-act="lkAdd" '+ids+' '+
          'title="A web address, or a contact’s email address">+ Link or email</button>'+
        '<span class="lgap" aria-hidden="true"></span>'+
        '<button class="lact quiet" data-act="leadEdit" '+ids+' '+
          'title="Edit everything on this lead">✎ Edit</button>')+
      '<span class="sp"></span>'+(say?doneBtn:'')+
    '</div>';
  const box=(name,v,ph,cls)=>'<textarea class="grow '+cls+'" name="'+name+'" rows="1" '+
    'placeholder="'+ph+'" aria-label="'+ph+'">'+esc(v||'')+'</textarea>';
  /* While editing, every link is its address and its name, side by side,
     with one empty pair at the foot for a new one; every update is its own
     line of text. A cross marks a line to go and Save takes it out, so
     nothing is lost by a press until the edit is kept. */
  const body=editing
    ? leadSec('links','<div class="llinks ledlinks">'+
        (l.links||[]).map(k=>'<div class="ledrow" data-k="'+k.id+'">'+
          '<input class="ledin" name="url" value="'+esc(k.url||'')+'" placeholder="https://… or name@…" aria-label="Link or email address" autocomplete="off">'+
          '<input class="ledin" name="label" value="'+esc(k.label||'')+'" placeholder="Whose, or what — optional" aria-label="Name the link" autocomplete="off">'+
          '<button class="lx" data-act="leadEditDrop" title="Take this link off when saved" aria-label="Remove link">✕</button></div>').join('')+
        '<div class="ledrow" data-k="new">'+
          '<input class="ledin" name="url" placeholder="https://… or name@… — add a link" aria-label="New link or email address" autocomplete="off">'+
          '<input class="ledin" name="label" placeholder="Whose, or what — optional" aria-label="Name the new link" autocomplete="off"></div>'+
      '</div>')+
      (ups.length?'<div class="lupd ledups">'+ups.map((u,i)=>[u,i]).reverse().map(([u,i])=>
        '<div class="lurow ledrow" data-u="'+i+'"><span class="lud">'+esc(updWhen(u))+'</span>'+
          box('text',u.text,'What happened','ledup')+
          '<button class="lx" data-act="leadEditDrop" title="Take this line out when saved" aria-label="Remove update">✕</button></div>').join('')+
      '</div>':'')
    : ((l.links||[]).length||adding
      ? leadSec('links',
          ((l.links||[]).length?'<div class="llinks">'+leadLinkRows(a,l,done)+'</div>':'')+
          (adding?lkFormHTML(a,l.id):''))
      : '')+
    (writing?'<div class="lnew">'+noteFormHTML(a,l)+'</div>':'')+
    (rows.length
      ? '<div class="lupd">'+rows.map(([u,i])=>
          '<p class="lurow"><span class="lud">'+esc(updWhen(u))+'</span><span>'+esc(u.text||'')+'</span>'+
          '<button class="lx" data-act="updDel" '+ids+' data-u="'+i+'" '+
            'title="Take this line out" aria-label="Remove update">✕</button></p>').join('')+
          (ups.length>UPD_SHOWN
            ? '<button class="lfa lmore" data-act="updMore" '+ids+'>'+
                (more?'fewer':(ups.length-UPD_SHOWN)+' earlier')+'</button>'
            : '')+
        '</div>'
      : '');
  const tone=leadToneOf(a);
  return '<article class="lead k-'+st+(say?' wide':'')+(due?' due':'')+(done?' done':'')+(hit?' hit':'')+
      (open?' open':'')+(editing?' editing':'')+(tone?' toned':'')+
      '"'+(tone?' style="--tone:'+esc(tone)+'"':'')+' data-lid="'+l.id+'" data-act="leadOpen" '+ids+'>'+
    /* Shut, a lead is its ruit beside two lines: what it is, and under it,
       smaller and quieter, who could fit it and the day to come back. The ruit
       leads because it is the thing that changes; a column of these sorts
       itself by how far each has got (Mark chose this over the name leading
       and the ruit closing the row, 2026-10-06). */
    /* On the leads board (`say`) the row is the Ledger's, column for column:
       ruit, the arena — a lead there stands among every other arena's, so it
       says whose it is, and that name opens it — then what it is over who
       could fit it, then the day written in full. In the arena's panel the
       arena goes without saying and the day rides on the quiet line. */
    '<header class="lhead">'+leadRuitHTML(a,l,st,done||editing)+
      (say?leadColHTML(a):'')+
      (say?'<button class="lar" data-act="openArena" data-id="'+a.id+'" '+
        'title="Open '+esc(a.name)+'">'+esc(a.name)+'</button>':'')+
      '<div class="ltx">'+
        /* floated, so it takes the top right corner and the name runs beside
           it while the quiet line below keeps the card's whole width */
        (!say&&open&&!editing&&!ending?doneBtn:'')+
        (editing
          ? box('project',l.project,'What is the project?','lname lname-in')+
            '<div class="lsub">'+box('match',l.match,'Who could be a good match?','lmt lmt-in')+(say?'':when)+'</div>'
          : '<p class="lname" title="'+(open?'Shut this lead':'Open this lead')+'">'+esc(leadName(l))+'</p>'+
            '<div class="lsub">'+
              '<span class="lmt'+(l.match?'':' none')+'">'+esc(l.match||'No match yet')+'</span>'+
              (say?'':leadScoreHTML(a,l,done)+when)+
            '</div>')+
      '</div>'+
      (say?leadScoreHTML(a,l,done||editing)+when:'')+
    '</header>'+
    /* while editing, Cancel and Save come after everything being edited */
    (open?(editing?'':acts)+(body?'<div class="lbody">'+body+'</div>':'')+(editing?acts:''):'')+
  '</article>';
}
/* What Save on an edited card keeps. One place, used by this room's card and
   by the Ledger's (as the `edit` verb): the name and the match, every link's
   address and name — dropping the ones marked to go and adding the new pair
   when it says anything — and every update's text, an emptied one going the
   way of a marked one. A lead left saying nothing at all is refused. */
function leadEditAll(l,v){
  const project=String(v.project||'').trim(),match=String(v.match||'').trim();
  if(!project&&!match&&!(l.links||[]).length)return false;
  l.project=project;l.match=match;
  if(typeof v.due==='string')l.due=v.due||null;
  if(Array.isArray(v.links)){
    const keep=[];
    for(const x of v.links){
      const url=String(x.url||'').trim(),label=String(x.label||'').trim();
      if(x.gone)continue;
      if(!x.id||x.id==='new'){if(url||label)keep.push({id:uid(),label,url:url?leadLinkUrl(url):''});continue;}
      const k=(l.links||[]).find(y=>y.id===x.id);if(!k)continue;
      if(!url&&!label)continue;
      k.url=url?leadLinkUrl(url):'';k.label=label;keep.push(k);
    }
    l.links=keep;
  }
  if(Array.isArray(v.updates)&&Array.isArray(l.updates)){
    const by={};v.updates.forEach(x=>{by[x.i]=x;});
    l.updates=l.updates.filter((u,i)=>{
      const x=by[i];if(!x)return true;
      if(x.gone)return false;
      const t=String(x.text||'').trim();if(!t)return false;
      u.text=t;return true;
    });
  }
  return true;
}
/* Reads an edited card back out of the page, for leadEditAll. */
function leadEditRead(card){
  const val=(el,n)=>{const f=el.querySelector('[name='+n+']');return f?f.value:'';};
  const due=card.querySelector('input[name=due]');
  return {
    due:due?due.value:undefined,
    project:val(card.querySelector('.ltx'),'project'),
    match:val(card.querySelector('.ltx'),'match'),
    links:[...card.querySelectorAll('.ledlinks .ledrow')].map(r=>({id:r.dataset.k,
      url:val(r,'url'),label:val(r,'label'),gone:r.classList.contains('gone')})),
    updates:[...card.querySelectorAll('.ledups .ledrow')].map(r=>({i:+r.dataset.u,
      text:val(r,'text'),gone:r.classList.contains('gone')}))
  };
}
/* Which date to sleep until. The next one is rarely the right one: with a
   deadline a fortnight out, what you actually want is to be woken for the call
   after it, so the arena's whole future is offered rather than guessed at. */
function waitPickHTML(a){
  const list=futureDates(a);
  if(!list.length)return '';
  const now=T(todayISO());
  return '<div class="waitpick"><p class="wphd">Sleep until \u2014 and come back three weeks before</p>'+
    list.map(d=>{
      const days=daysBetween(now,T(d.start));
      const sub=d.kind==='call'?roleOf(d).short:(d.note||'');
      return '<button class="wpo" data-act="holdSet" data-id="'+a.id+'" data-d="'+d.id+'" '+
        'style="--c:'+dtColor(d)+'"><span class="dot"></span>'+
        '<span class="wpn">'+esc(dtLabel(d))+(sub?'<i>'+esc(sub)+'</i>':'')+'</span>'+
        '<span class="wpd">'+esc(shortDate(d))+(days>0?' \u00B7 '+days+'d':'')+'</span></button>';
    }).join('')+
    '<button class="wpx" data-act="lkCancel">Cancel</button></div>';
}
/* What the panel offers under the leads: a wait. */
function offerHTML(a,st){
  const nx=st.hold?null:nextDate(a);
  if(!nx)return '';
  return '<div class="offer"><span class="sp"></span>'+
    '<button data-act="waitPick" data-id="'+a.id+'" '+
    'title="Sleep until one of this arena\u2019s coming dates \u2014 back three weeks before">'+
    'Wait for\u2026</button></div>';
}

/* A wait and a search hit. Both are strips under the head, the same shape,
   because they answer the same question: why is this card where it is. A lead
   whose day has come used to be a third; its day is on the Ledger's board now.
   A hit names the lead the search found, and a press opens the arena's panel,
   where its leads are: a card has had no side of leads since 2026-10-11. */
/* What a card is waiting for, with the day and the way out of the wait. On
   a card it stands in the foot, where "Wait for…" offers one (Mark,
   2026-10-11: the wait answers that offer, so it goes where the offer was);
   in the panel it stays with the other strips. */
function holdStripHTML(a,hold){
  const when=hold.asleep?shortDay(hold.dt.start):(hold.near<=0?'today':'in '+hold.near+'d');
  return '<div class="strip'+(hold.asleep?' asleep':' due')+'"><span class="sg"></span>'+
    '<button class="stx" data-act="waitPick" data-id="'+a.id+'" '+
      'title="Wait for a different date instead">'+(hold.asleep?'Waiting for ':'Back for ')+esc(hold.label)+'</button>'+
    '<span class="swhen">'+esc(when)+'</span>'+
    '<button class="sdone" data-act="holdClear" data-id="'+a.id+'" '+
      'title="Stop waiting \u2014 back into the rotation" aria-label="Stop waiting">\u2713</button></div>';
}
function frontStrips(a,st,hits,onCard){
  let h='';
  if(st.hold&&!onCard)h+=holdStripHTML(a,st.hold);
  if(hits.length){
    h+='<div class="strip find"><span class="sg"></span>'+
      '<button class="stx" data-act="openArena" data-id="'+a.id+'">'+esc(leadName(hits[0]))+
      (hits.length>1?' <i>+'+(hits.length-1)+'</i>':'')+'</button>'+
      '<span class="swhen">found</span></div>';
  }
  return h;
}
/* Asking the nightly agent to look at this arena on its next run, on top of
   the three it would have picked anyway. The ask is a moment (`askAt`) on the
   arena, so it rides to the cloud with the board and the agent's gatekeeper
   can see it; it stands until the agent's log says it has been since (see
   settleAsks), and pressing it again takes it back. The daily run is Sunday
   to Thursday night, so an ask made on a Friday waits for Sunday. */
function askHTML(a){
  const on=!!a.askAt;
  const tip=on?'The nightly agent looks at this arena on its next run — click to take the request back'
              :'Ask the nightly agent to look at this arena on its next run';
  return '<button class="wask'+(on?' on':'')+'" data-act="askAgent" data-id="'+a.id+'" '+
    'aria-pressed="'+(on?'true':'false')+'" title="'+tip+'" aria-label="'+esc(tip)+'"><i></i></button>';
}
function headHTML(a,st,t){
  const bk=a.brokerage||{links:[]};
  /* pinned links live on Pinned, not on the card, so they are not counted here */
  const n=(bk.links||[]).filter(l=>!l.pin).length;
  const nNew=t==='rest'?freshItems(a).length:0;
  /* the title and its count share one flexible cell, so whatever is written
     there can never move the controls on the right */
  return '<header class="wch">'+
    '<span class="wnm">'+
      '<button class="wname'+weightClass(a)+'" data-act="openArena" data-id="'+a.id+'" title="Open arena">'+esc(a.name)+'</button>'+
      (t==='rest'&&n?'<span class="wcnt" title="'+n+' tool'+(n===1?'':'s')+'">'+n+'</span>':'')+
      /* a tail card shows neither its dates nor its links, so what the agent
         brought it is one dot beside the name */
      (t==='rest'&&nNew?'<i class="wfdot" title="'+nNew+' new from the nightly agent — open the arena"></i>':'')+
    '</span>'+
    /* a tail card is one line of name, so it carries the ring only while it is lit */
    (t!=='rest'||a.askAt?askHTML(a):'')+
    /* The stamp carries the days since it was last pressed, 0 on the day
       itself (Mark, 2026-10-11), so a row can be read for how long each card
       has gone untouched without hovering. A card never stamped has none. */
    '<button class="stamp'+(a.sweptAt===todayISO()?' on':'')+(a.sweptAt?' dated':'')+'" data-act="sweep" data-id="'+a.id+'" '+
      'title="'+esc(sweptTitle(a))+'" aria-label="'+esc(sweptTitle(a))+'">\u2713'+
      (a.sweptAt?'<span class="sdays">'+Math.max(0,daysBetween(T(a.sweptAt),T(todayISO())))+'</span>':'')+'</button>'+
    '<button class="ib wedit" data-act="editBrokerage" data-id="'+a.id+'" title="Edit brokerage">\u270E</button>'+
  '</header>';
}
/* The list itself, in the arena's panel. It was on the back of every card on
   the wall as well, until Mark took the leads off the rotation cards
   (2026-10-11): they are worked here, on Leads, on the Ledger and in Pocket. */
function leadListHTML(a,hits){
  const hit=new Set(hits.map(l=>l.id));
  const row=l=>leadRowHTML(a,l,hit.has(l.id));
  const open=sortedOpen(a),done=sortedDone(a);
  const adding=leadEdit.a===a.id&&leadEdit.l==='new';
  let h='';
  if(!open.length&&!done.length&&!adding)
    h+='<p class="lnone">Nothing found here yet \u2014 a lead is whatever a sweep turns up.</p>';
  /* Three sections, stacked — spotted, contacted, talking, top to bottom, each
     one a bounded region with the leads standing inside it. Nothing on a lead
     says which step it is on: the section it is standing in says it.

     Stacked and not side by side, because the arena panel it stands in is
     narrow, 404px. Where there is width for three abreast — the Leads
     arrangement, which is one board rather than a wall of cards — the board
     below lays them out itself.

     An empty section is dropped rather than drawn: a box around nothing is
     only worth the room when it is holding a place open for something, and
     stacked there is no place to hold. */
  h+='<div class="lcols">';
  for(const k of STAGES){
    const band=open.filter(l=>stageOf(l)===k);
    if(!band.length)continue;
    h+='<section class="lband k-'+k+'">'+
      '<p class="lbh">'+STAGE_NAME[k]+'<b>'+band.length+'</b></p>'+
      '<div class="lgrid">'+band.map(row).join('')+'</div>'+
    '</section>';
  }
  h+='</div>';
  /* the way to add one sits directly under the ones you have, not past the
     record of the ones you have closed */
  if(adding)h+=leadFormHTML(a);
  else h+='<div class="leadadd"><button data-act="leadAdd" data-id="'+a.id+'">+ Lead</button></div>';
  /* Closed leads are out of the open view entirely: one line saying how many,
     and the record itself only if you ask. A search that lands inside a closed
     lead opens the record on its own, because a hit you cannot see is worse
     than a record you did not open.

     Under that line, what the arena has given (Mark, 2026-10-11): how many
     leads it has had, open and closed, how many reached Talking and how many
     became projects — the count that says whether it earns its place in the
     rotation. It waits for a first closed lead, since before one the leads
     above already say all of it. */
  if(done.length){
    const shown=closedOpen.has(a.id)||done.some(l=>hit.has(l.id));
    const all=a.leads||[],talked=all.filter(l=>stageOf(l)==='talking').length,
          made=all.filter(l=>l.outcome==='project').length;
    h+='<div class="lclosed'+(shown?' open':'')+'">'+
      '<button class="lcbar" data-act="closedMore" data-id="'+a.id+'" '+
        'aria-expanded="'+(shown?'true':'false')+'" '+
        'title="'+(shown?'Put the record away again':'Leads you have closed \u2014 a record, not a queue')+'">'+
        '<span class="lccar" aria-hidden="true">'+(shown?'\u25BE':'\u25B8')+'</span>'+
        'Closed<b>'+done.length+'</b></button>'+
      '<p class="lctally"><b>'+all.length+'</b> lead'+(all.length===1?'':'s')+' so far \u00B7 <b>'+talked+
        '</b> reached talking \u00B7 '+(made?'<b>'+made+'</b> became '+(made===1?'a project':'projects'):'no project yet')+'</p>'+
      (shown?'<div class="llist lcrec">'+done.map(row).join('')+'</div>':'')+
    '</div>';
  }
  return h;
}
/* The wait is not a lead: it is the card putting itself away until a date on its
   own timeline — the arena's own answer to "not now". That is a statement
   about the arena, not about anything the sweeping turned up, so it belongs on
   the face that says what the arena is: at the foot of the front, under a rule,
   directly beneath the strip that will say "Waiting for…" once it is set.
   Setting it and reading it are then the same place.

   It is offered only where there is room to read it: the tail of the wall is
   one line of name and count, and a verb under it would be the loudest thing
   on a card that is meant to be quiet. */
function waitFootHTML(a,st,t){
  if(waitPick===a.id)
    return '<div class="wfoot wfoot-pick">'+waitPickHTML(a)+'</div>';
  if(t==='rest')return '';
  if(st.hold)return '<div class="wfoot">'+holdStripHTML(a,st.hold)+'</div>';
  const nx=nextDate(a);
  if(!nx)return '';
  return '<div class="wfoot"><div class="offer"><span class="sp"></span>'+
    '<button data-act="waitPick" data-id="'+a.id+'" '+
      'title="Sleep until one of this arena\u2019s coming dates \u2014 back three weeks before">'+
      'Wait for\u2026</button></div></div>';
}
function wallCard(a,st,tier){
  const bk=a.brokerage||{notes:'',links:[]};
  const s=st||standing(a);
  const t=tier||'lead';
  const hits=leadHits(a,S.ui.q.trim().toLowerCase());
  /* At most three links on a card, so a card with many does not grow tall
     for them (Mark, 2026-10-11); the rest are a press away in the panel. */
  const LK_ON_CARD=3;
  const loose=(bk.links||[]).filter(l=>!l.pin);
  const rows=t==='rest'?'':wallLinkRows(a,loose.slice(0,LK_ON_CARD),'brokerage',true);
  const nPinned=(bk.links||[]).length-loose.length;
  const nMore=loose.length-LK_ON_CARD;
  /* The face is built in three parts: a head that never moves, a middle that
     takes whatever room the card has and scrolls when there is more than that,
     and a foot pinned to the floor. It is what lets a row of cards line up —
     every head on one line, every foot on another — however unequal what
     lies between them happens to be. */
  const front='<div class="wface wfront">'+
    headHTML(a,s,t)+
    '<div class="wscroll"><div class="wsin">'+
      /* The front is the line and the links, nothing else (Mark, 2026-10-06):
         where the arena stands in time, and where to go. The brokerage note
         and the season sentence came off — the note is in the panel, and the
         line says what the season sentence said, better. */
      frontStrips(a,s,hits,true)+
      (t==='rest'?'':cardLineHTML(a,t))+
      /* The links are a different kind of thing from the line above them —
         where to go, not where the arena stands — so they stand in a band
         of their own on a darker ground under a firm rule (Mark, 2026-10-07:
         "make visibly plain that this is something else"). They used to
         follow the dates straight on in the same type, and read as more
         dates. The band's "Links" heading went on 2026-10-11, at his asking:
         the ground and the rule say it alone. */
      (t==='rest'?'':'<div class="wlk">'+
        (rows?wallLinks(a,'brokerage',rows)+
            (nMore>0?'<button class="wlmore" data-act="openArena" data-id="'+a.id+'">+ '+nMore+' more in the arena</button>':'')
          :nPinned?'<p class="wpinned">'+(nPinned===1?'Its one link is':'Its '+nPinned+' links are')+' on Pinned</p>'
          :'<p class="wnone">No links yet</p>')+'</div>')+
    '</div></div>'+
    waitFootHTML(a,s,t)+
  '</div>';
  return '<article class="wcard t-'+t+' s-'+s.state+(s.state==='held'?' held':'')+'" data-id="'+a.id+'">'+
    '<div class="wfin">'+front+'</div></article>';
}

/* ───────── one face ─────────
   A card is one face. It had a second, of leads, turned to with a 3D flip,
   until Mark took the leads off the rotation cards (2026-10-11). The face
   stands in a box (`.wfin`) that is handed its height, so a row of cards can
   be evened up (below). */
let faceObs=null;
function faceOf(card){return card.querySelector('.wfront');}
/* ───────── one rhythm for the wall ─────────
   The FRONT of a card is as tall as what it holds, and every front in the same
   row of the wall stands as tall as the tallest of them (`evenRows`), so a row
   still reads as a grid, with every head on one line and every foot on
   another. Fronts used to be put on the nearest rung above what they held,
   and a rung is 88 or 104 pixels: a card holding
   330 was drawn at 416, and the wall was full of empty floors (Mark,
   2026-10-07: "some cards are large for no particular reason"). The front's
   ladder now only says where it stops growing.

   Past the top rung the card stops growing and its middle scrolls, which is
   what the sill at its foot is for: a card on a wall that grew to fifteen
   hundred pixels would stop being a card. The side of leads a card had until
   2026-10-11 climbed a ladder of its own, in whole leads, and went with them.
   Working through leads at length is what the Leads arrangement is for, and
   it has no ladder at all — it is not a wall of cards but one board, and a
   board is as tall as what stands on it. */
const RUNGS={lead: {base:208,step:104,rungs:4,fit:true},
             mid:  {base:152,step:88, rungs:3,fit:true},
             rest: {base:44, step:44, rungs:4}};
function ladderOf(card){
  if(card.classList.contains('t-mid'))return RUNGS.mid;
  if(card.classList.contains('t-rest'))return RUNGS.rest;
  return RUNGS.lead;
}
/* What the face would be if nothing stopped it. The head and the foot are fixed
   and the middle is a scroller, so the face's own height says nothing — only
   the three parts, added up, do. */
function faceNatural(f){
  const mid=f.querySelector('.wsin');
  if(!mid)return f.offsetHeight;
  const hd=f.querySelector('.wch'),ft=f.querySelector('.wfoot');
  return (hd?hd.offsetHeight:0)+midNatural(f,mid)+(ft?ft.offsetHeight:0);
}
/* The front's middle stretches to fill its box, so that its links band can
   stand on the floor of a card evened up to its row's height, with the spare
   room between the strip and the links rather than under the links. A
   stretched middle measures as tall as the box it is in, which would never
   let a card shrink back, so the front is measured by its parts. They carry
   no margins of their own; the band's auto margin is the stretch. */
function midNatural(f,mid){
  if(!f.classList.contains('wfront'))return mid.offsetHeight;
  let h=0;
  for(let i=0;i<mid.children.length;i++)h+=mid.children[i].offsetHeight;
  return h;
}
/* Measuring and setting are kept apart on purpose.
   `offsetHeight` cannot be answered until the page is laid out, and setting a
   height invalidates that layout — so a loop that reads one card, writes it,
   then reads the next forces the browser to lay the whole document out again
   on every card. Forty cards meant forty full reflows. So: read every card
   first, decide every height, and only then write. One reflow, whatever the
   size of the wall. `measureCard` never touches the DOM; `applyCard` never
   reads it. */
function measureCard(card){
  const fin=card.querySelector('.wfin'),f=faceOf(card);
  if(!fin||!f)return null;
  const nat=faceNatural(f);
  if(!nat)return null;                         /* hidden, not empty: keep the last good height */
  const L=ladderOf(card);
  let h=nat;
  if(L){
    const over=Math.max(0,nat-L.base);
    h=L.fit?Math.min(nat,L.base+(L.rungs-1)*L.step)
           :L.base+Math.min(Math.ceil(over/L.step),L.rungs-1)*L.step;
  }
  /* the face is told whether it overflows the box — once the row has had its
     say about how tall the box is */
  const faces=[];
  card.querySelectorAll('.wface').forEach(fc=>faces.push([fc,faceNatural(fc)]));
  return {fin:fin,h:h,faces:faces,even:!!(L&&L.fit),
          par:card.parentElement,top:card.offsetTop,cap:L?L.base+(L.rungs-1)*L.step:h};
}
/* Every card in one row of the wall takes the tallest card's height. Cards
   share a row when they share a parent and a top edge. */
function evenRows(plan){
  const rows=new Map();
  for(const m of plan){
    if(!m||!m.even)continue;
    let byTop=rows.get(m.par);
    if(!byTop)rows.set(m.par,byTop=new Map());
    if(!byTop.has(m.top))byTop.set(m.top,[]);
    byTop.get(m.top).push(m);
  }
  rows.forEach(byTop=>byTop.forEach(ms=>{
    const h=Math.min(Math.max(...ms.map(m=>m.h)),Math.min(...ms.map(m=>m.cap)));
    for(const m of ms)m.h=Math.max(m.h,h);
  }));
}
function applyCard(m,instant){
  if(!m)return;
  for(let i=0;i<m.faces.length;i++)m.faces[i][0].classList.toggle('scrolls',m.faces[i][1]>m.h+1);
  const fin=m.fin;
  if(instant){
    const prev=fin.style.transition;
    fin.style.transition='none';
    fin.style.height=m.h+'px';
    void fin.offsetHeight;                     /* land it before the transition returns */
    fin.style.transition=prev;
  }else fin.style.height=m.h+'px';
}
/* One card changing size can change its whole row, so a card is fitted with
   the cards beside it: read them all, even them out, then write. */
function rowOf(card){
  const p=card.parentElement,top=card.offsetTop;
  if(!p||card.classList.contains('t-rest'))return [card];
  return Array.prototype.filter.call(p.children,c=>c.classList.contains('wcard')&&c.offsetTop===top);
}
function fitCard(card,instant){
  const plan=rowOf(card).map(measureCard);
  evenRows(plan);
  plan.forEach(m=>applyCard(m,instant));
}
function fitWall(instant){
  const cards=document.querySelectorAll('#wall .wcard');
  const plan=[];
  cards.forEach(c=>plan.push(measureCard(c)));   /* every read … */
  evenRows(plan);
  plan.forEach(m=>applyCard(m,instant));        /* … then every write */
  if(typeof ResizeObserver!=='function')return;
  if(faceObs)faceObs.disconnect();
  /* the face is pinned to the box now, so what changes size is the middle */
  faceObs=new ResizeObserver(es=>es.forEach(en=>{
    const card=en.target.closest&&en.target.closest('.wcard');
    const face=en.target.closest&&en.target.closest('.wface');
    if(card&&face&&faceOf(card)===face)fitCard(card);
  }));
  document.querySelectorAll('#wall .wsin').forEach(f=>faceObs.observe(f));
}
/* Stamping reorders the wall, so the wall moves rather than cuts: every card
   that keeps its identity glides from where it was to where it now belongs. */
function wallRects(){
  const m=new Map();
  document.querySelectorAll('#wall .wcard').forEach(el=>m.set(el.dataset.id,el.getBoundingClientRect()));
  return m;
}
function wallGlide(pre){
  const w=$('#wall');
  if(w.hidden||!pre.size)return;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  w.querySelectorAll('.wcard').forEach(el=>{
    const was=pre.get(el.dataset.id);
    if(!was){el.animate([{opacity:0,transform:'translateY(7px)'},{opacity:1,transform:'none'}],
      {duration:240,easing:'ease-out'});return;}
    const now=el.getBoundingClientRect();
    const dx=was.left-now.left,dy=was.top-now.top;
    if(Math.abs(dx)<1&&Math.abs(dy)<1)return;
    el.animate([{transform:'translate('+dx+'px,'+dy+'px)'},{transform:'none'}],
      {duration:420,easing:'cubic-bezier(.22,.72,.24,1)'});
  });
}
/* A row scrolls on its own, and painting the wall again would send every row
   back to its first card — so a stamp made far along a row would lose the
   place it was made in. Each row's place is held across the paint, by type. */
function trackPlaces(){
  const m=new Map();
  document.querySelectorAll('#wall .wtrack').forEach(el=>m.set(el.dataset.ty,el.scrollLeft));
  return m;
}
function renderWall(){keepPlace(()=>{
  const pre=wallRects(),at=trackPlaces();
  paintWall();
  growAll($('#wall'));
  fitWall(true);                 /* the faces are absolute: hand each box its height */
  document.querySelectorAll('#wall .wtrack').forEach(el=>{const x=at.get(el.dataset.ty);if(x)el.scrollLeft=x;});
  wallGlide(pre);
  if(settleId){
    const el=document.querySelector('#wall .wcard[data-id="'+settleId+'"]');
    if(el){el.classList.add('settle');setTimeout(()=>el.classList.remove('settle'),1600);}
    settleId=null;
  }
});}
/* Written as three sentences about what you do, not three formulas. */
function howHTML(){
  if(!S.ui.howOpen)return '';
  const line=(t,d)=>'<dt>'+t+'</dt><dd>'+d+'</dd>';
  return '<div class="how"><dl>'+
    line('Sweep','Stamp a card <b>\u2713</b> once you have been through its platform and it goes to the '+
      'far right of its row, working its way back to the left over about four weeks. In the weeks just after one of its calls opens that '+
      'cadence tightens to roughly <b>a week</b>, because partner search is front-loaded \u2014 and by '+
      'the last six weeks before a deadline, when the consortia have closed and the writing has started, '+
      'it loosens back to an ordinary turn. A brokerage event of the arena\u2019s own does the same more '+
      'bluntly: from <b>a month before until a month after</b> it, the card comes round at least weekly '+
      'whatever else is true of it \u2014 beforehand for the registration and the agenda, afterwards while '+
      'the contacts made there are still warm.')+
    line('How much it matters','Each arena carries a standing weight \u2014 <b>central</b>, <b>ordinary</b> '+
      'or <b>peripheral</b> \u2014 set once in its own panel. It buys frequency rather than height: central '+
      'comes round about twice as often, peripheral about a third as often, and the freezer is the step '+
      'past peripheral. On the board and the wall it shows only in the weight of the name.')+
    line('Leads','The links on a card are the arena\u2019s own tools \u2014 the platform, '+
      'the programme page, the things you sweep. A <b>lead</b> is what the sweeping turned up: a partner, '+
      'a project page, a thread. Leads are not on the cards: they are in the arena\u2019s panel, opened '+
      'from its name, and under <b>Leads</b>. A lead is the same card there and on the Ledger: shut, it is its '+
      '<b>ruit</b> \u2014 spotted, then researchers or the lead itself contacted, then talking \u2014 '+
      'beside its name, with the match and the day under it; pressed, it opens to add an update or a '+
      'link, to edit everything on it in place, and to complete it. Leads stand inside three sections '+
      '\u2014 <b>spotted</b>, <b>contacted</b>, <b>talking</b> \u2014 and no further: the moment '+
      'something is agreed it is a project for the ledger rather than a lead. A lead\u2019s day does not '+
      'move its card on the wall; every lead stands on its day on the Ledger\u2019s board. Completing one '+
      'asks how it ended \u2014 it <b>became a project</b>, it <b>went nowhere</b>, or <b>they declined</b> '+
      '\u2014 and closes it without throwing it away; a project opens the Ledger\u2019s new project with '+
      'the lead\u2019s name and links filled in. The closed ones fold into a single line at the foot of the '+
      'arena\u2019s list, with what the arena has given under it: its leads so far, how many reached '+
      'talking and how many became projects. <b>Leads</b>, beside the arrangements above, drops the wall altogether and lists every '+
      'lead from every arena, the three steps one under another, as the Ledger lists them.')+
    line('Wait for a date','Not a lead but the opposite: the card putting itself away rather than pursuing '+
      'anything. It sleeps until <b>three weeks</b> before its '+
      'next dated thing, faded at the far right of its row, then wakes and comes back in a row of its own '+
      'at the top, <b>Back from waiting</b>; the night before it wakes, the nightly agent is asked to look '+
      'it over, so it comes back up to date. Stamp it there and the wait is over and the card back in its '+
      'own row. Move that date and the wait moves with it; delete it, or let it pass, and the card is '+
      'simply back in the rotation.')+
    line('Pinned','A separate arrangement, and the only one you author. Click the diamond beside one of a '+
      'card\u2019s links and that link moves to <b>Pinned</b>, off every card, with a stamp of its own '+
      'and the days since you last pressed it.')+
    line('Ask the agent','The ring in a card\u2019s head asks the nightly agent to look at that arena on its '+
      'next run, on top of the ones it picks itself. It goes out once the agent has been. What the agent '+
      'brings is brokerage events, partner-search tools and short rewrites of the card\u2019s About and '+
      'Brokerage texts, and they wait in <b>Dispatches</b>; once accepted, events and links are marked '+
      '<b>new</b> until you next sweep the arena, and a rewrite takes the old text\u2019s place.')+
    '</dl><p class="coda">None of this is a setting, and none of the arithmetic is on screen. '+
    'Every type has a row of its own, in the order you give the types, and a card is only ever '+
    'weighed against the others of its type. Within a row, position is the whole readout: the '+
    'further left a card stands, the more it wants attention today. Order runs in rungs \u2014 what '+
    'is asking to be looked at, then what is merely due a turn, then what is parked \u2014 and within '+
    'a rung, by how much. A card you stamp today waits at the far right of its row until tomorrow.</p></div>';
}
/* One pinned link, as Pocket draws it (Mark, 2026-10-11): the name on a line
   of its own, wrapping rather than cut, on a box in its arena type's colour,
   and its host not shown, since a pinned link is read by its name; under it the
   stamp carrying the days since it was last pressed, the arena it came from,
   the pencil that changes its name and address, and the pin to put it back.
   While the pencil is open the name gives way to the form (`pinEdit`). */
function pinRowHTML(p){
  const{a,lk,scope}=p;
  const ref=' data-a="'+a.id+'" data-lks="'+scope+'" data-l="'+esc(lk.id||'')+'"';
  const{on,d,ageTip,stTip}=stampSay(stampOf(lk));
  const nm=esc(linkName(lk));
  const tone=arenaTone(a);
  const top=pinEdit===lk.id
    ?'<form class="lkform pkform" data-pka="'+a.id+'" data-pks="'+scope+'" data-pkl="'+esc(lk.id||'')+'">'+
       '<input class="lu" name="url" value="'+esc(lk.url||'')+'" placeholder="https://…" aria-label="Link address" autocomplete="off">'+
       '<input class="lx" name="label" value="'+esc(lk.label||'')+'" placeholder="Name it — optional" aria-label="Link name" autocomplete="off">'+
       '<button type="submit" class="ib" title="Save" aria-label="Save">✓</button>'+
       '<button type="button" class="ib" data-act="lkCancel" title="Cancel" aria-label="Cancel">✕</button>'+
     '</form>'
    :lk.url
      ?'<a class="wplink" href="'+esc(lk.url)+'" target="_blank" rel="noopener" title="'+esc(lk.url)+'">'+
         '<span class="wn">'+nm+'</span>'+freshTag(a,lk)+'</a>'
      :'<span class="wplink dead"><span class="wn">'+nm+'</span></span>';
  const tip=on?stTip:ageTip+' — stamp it once you have been through it';
  return '<div class="wprow'+(on?' on':'')+(tone?' toned':'')+'"'+(tone?' style="--tone:'+esc(tone)+'"':'')+'>'+top+
    '<div class="wpfoot">'+
      '<button class="stamp'+(on?' on':'')+(d===null?'':' dated')+'" data-act="lkStamp"'+ref+' title="'+tip+'" aria-label="'+tip+'">✓'+
        (d===null?'':'<span class="sdays">'+Math.max(0,d)+'</span>')+'</button>'+
      '<button class="wpa" data-act="openArena" data-id="'+a.id+'" title="Open '+esc(a.name)+'">'+esc(a.name)+'</button>'+
      '<button class="wped" data-act="pinEdit"'+ref+' title="Change its name or address" aria-label="Edit '+nm+'">✎</button>'+
      '<button class="lpin on" data-act="lkPin"'+ref+' title="Pinned — click to put it back on its card" aria-label="Unpin '+nm+'"><i></i></button>'+
    '</div>'+
  '</div>';
}
function paintWall(){
  const w=$('#wall');
  const vis=visibleArenas();
  if(!vis.length){
    const[head,hint]=emptyReason();
    w.innerHTML='<div class="empty"><p>'+head+'</p>'+
      '<p class="hint" style="margin-top:6px">'+hint+'</p></div>';
    return;
  }
  const has=hasBrokerage;
  const sortBtns='<div class="wsort">'+
    [['rotation','Rotation','A row for every type, in your order of types; in each row, first is whatever wants attention today'],
     ['pinned','Pinned','The links you have pinned, each with its own stamp'],
     ['leads','Leads','One board \u2014 every lead you are pursuing, in the step it has reached']].map(([v,n,t])=>
      '<button class="'+(S.ui.wallSort===v?'on':'')+'" data-act="setWallSort" data-v="'+v+'" title="'+t+'">'+n+'</button>').join('')+
    '</div>';
  /* the mechanics only govern the rotation, so they are only offered there */
  const howBtn=S.ui.wallSort==='rotation'
    ?'<button class="howbtn'+(S.ui.howOpen?' on':'')+'" data-act="toggleHow" '+
      'aria-expanded="'+(S.ui.howOpen?'true':'false')+'">How the order works</button>':'';

  /* ---- pinned: the links you keep to hand ----
     Single links: the platforms gone through so often that they are a round
     of their own rather than part of one arena's. Each carries its own stamp,
     and how many days ago it was last pressed, so the round can be walked the
     way the rotation is. A pinned link stands only here; no card shows it as
     well. Whole cards could be pinned here too until Mark took that away on
     2026-10-11: a card belongs in its type's row, and the links were what he
     kept to hand. */
  if(S.ui.wallSort==='pinned'){
    const pins=[];
    for(const a of vis)for(const scope of ['brokerage','arena'])
      for(const lk of linkList(a,scope))if(lk.pin)pins.push({a,lk,scope});
    pins.sort((x,y)=>String(x.lk.pin).localeCompare(String(y.lk.pin)));
    let h='<div class="whead">'+sortBtns+
      (pins.length?'<span class="wsay"><b>'+pins.length+'</b> link'+(pins.length===1?'':'s')+' kept to hand.</span>':'')+'</div>';
    if(pins.length)h+='<div class="wplist">'+pins.map(pinRowHTML).join('')+'</div>';
    else
      h+='<div class="empty"><p>Nothing pinned yet.</p>'+
        '<p class="hint" style="margin-top:6px">Click the diamond beside one of a card\u2019s links to keep it here.</p></div>';
    w.innerHTML=h;
    return;
  }

  /* ---- leads: one board, three sections, every arena's leads in them ----
     Not a wall of arenas each carrying its own three steps — that was the same
     list repeated once per card, and it told you nothing you could act on.
     There is one Spotted, one Contacted, one Talking, and every lead you are
     pursuing stands in whichever of the three it has reached, whoever it
     belongs to. A lead says its arena on itself, which is all the arena card
     was doing in the old arrangement anyway.

     Within a section the day decides, soonest first, then the undated: read
     down a section and you read forward in time. The closed ones are not here —
     they are a record and they stay on their own cards. */
  if(S.ui.wallSort==='leads'){
    const all=[];
    for(const a of vis)for(const l of openLeads(a))all.push({a,l});
    const owed=all.filter(({l})=>l.due&&daysBetween(T(l.due),T(todayISO()))>=0).length;
    const arenas=new Set(all.map(({a})=>a.id)).size;
    let h='<div class="whead">'+sortBtns+
      (all.length?'<span class="wsay"><b>'+all.length+'</b> lead'+(all.length===1?'':'s')+
        ' across <b>'+arenas+'</b> arena'+(arenas===1?'':'s')+
        (owed?', <b>'+owed+'</b> owed today':'')+'.</span>':'')+'</div>';
    if(all.length){
      const ql=S.ui.q.trim().toLowerCase();
      const hit=new Set();
      if(ql)for(const a of vis)for(const l of leadHits(a,ql))hit.add(l.id);
      const byDay=(x,y)=>{
        if(!!x.l.due!==!!y.l.due)return x.l.due?-1:1;
        if(x.l.due&&y.l.due&&x.l.due!==y.l.due)return x.l.due<y.l.due?-1:1;
        return leadName(x.l).localeCompare(leadName(y.l));
      };
      /* The Ledger's list, exactly (Mark, 2026-10-06): the three steps one
         under another rather than side by side, each a run of full-width lead
         rows with its name and count braced down the left, and a step with
         nothing in it left out, as the Ledger leaves out a category with no
         todos. Every lead is the same shut row the Ledger draws — ruit, arena,
         what it is over who could fit it, the day — and opens in place. */
      h+='<div class="lruns">';
      for(const k of STAGES){
        const col=all.filter(({l})=>stageOf(l)===k).sort(byDay);
        if(!col.length)continue;
        /* Contacted runs by its two paths, as on the Ledger's list (Mark,
           2026-10-06): both ways first (2026-10-08), then the researchers
           asked, then the lead written to — the ruit's upper point over its
           lower — each run under a small ruit with only its own path drawn. */
        if(k==='contacted')col.sort((x,y)=>KIND_RANK[leadKind(x.l)]-KIND_RANK[leadKind(y.l)]||byDay(x,y));
        h+='<section class="lrun k-'+k+'">'+
          '<div class="lflank"><span class="lfn">'+STAGE_NAME[k]+'</span>'+
            '<span class="lfc">'+col.length+' lead'+(col.length===1?'':'s')+'</span></div>'+
          '<div class="lrows">'+col.map(({a,l},i)=>{
            const kd=k==='contacted'?leadKind(l):null;
            return (kd&&(!i||leadKind(col[i-1].l)!==kd)?leadKindHTML(kd):'')+
              leadRowHTML(a,l,hit.has(l.id),true);
          }).join('')+'</div>'+
        '</section>';
      }
      h+='</div>';
    }else{
      const shut=vis.reduce((k,a)=>k+doneLeads(a).length,0);
      h+='<div class="empty"><p>Nothing being pursued.</p>'+
        '<p class="hint" style="margin-top:6px">'+
        (shut?'The '+shut+' closed lead'+(shut===1?' is':'s are')+' still on their own cards.<br>':'')+
        'Open an arena and press + Lead to start one.</p></div>';
    }
    w.innerHTML=h;
    return;
  }

  /* ---- the rotation: a strip for every type ----
     Rotation and By type were two arrangements, and Mark merged them
     (2026-10-11): the rotation used to rank every arena against every other,
     so one busy type could fill the whole head of the wall while a quiet one
     never stood high, and By type kept a hand-made order that did no
     rotating at all. Now each type is a row in his own order of types, and
     inside a row the cards stand in rotation order — standing() unchanged,
     only compared within the type — so every type has a first card of its
     own. The rows have no big and small cards any more: every card is one
     size, the row trails off to the right and scrolls, and a card stamped
     today goes towards the far right of its row, so the stamp visibly puts
     it away. Past the stamped ones, at the very end, stand the cards asleep
     until a date of their own (Mark, 2026-10-11: those waiting always on the
     far right). One whose date has come within reach is awake and leaves its
     row for a row of its own over all the others, "Back from waiting", which
     is there only while it holds a card (Mark, 2026-10-11); stamping a card
     there ends its wait (see the sweep) and sends it back to its own row. */
  const ask=RUNG.asking[0];
  const today=todayISO();
  const woke=vis.filter(a=>standing(a).state==='wake');
  const rest=vis.filter(a=>!woke.includes(a));
  const rows=S.types.map(t=>[t,rest.filter(a=>a.typeId===t.id)])
    .concat([[null,rest.filter(a=>!typeOf(a))]]).filter(r=>r[1].length);
  const n=vis.filter(a=>standing(a).score>=ask).length;
  let h='<div class="whead">'+sortBtns+
    (n?'<span class="wsay"><b>'+n+'</b> '+(n===1?'card is':'cards are')+
      ' asking for something.</span>':'')+howBtn+
    '<button class="howbtn" data-act="resetStamps" title="Take the stamp off every card in the rotation">Reset all stamps</button>'+
    '</div>'+howHTML();
  let any=!!woke.length;
  if(woke.length){
    const back=woke.map(a=>({a,s:standing(a)})).sort((x,y)=>y.s.score-x.s.score||x.a.name.localeCompare(y.a.name));
    h+='<section class="wtrow wwoke">'+
      '<div class="wthead"><span class="wtn">Back from waiting</span>'+
        '<span class="wtc">'+back.length+' card'+(back.length===1?'':'s')+' \u00B7 stamp one to send it back to its row</span></div>'+
      '<div class="wtrack" data-ty="__woke">'+back.map(x=>wallCard(x.a,x.s,'lead')).join('')+'</div>'+
    '</section>';
  }
  for(const[t,arenas]of rows){
    const{list,empty}=rotationSplit(arenas);
    const asleep=x=>x.s.state==='held';
    const cards=list.filter(x=>!asleep(x)&&x.a.sweptAt!==today)
      .concat(list.filter(x=>!asleep(x)&&x.a.sweptAt===today),list.filter(asleep));
    const k=list.filter(x=>x.s.score>=ask).length;
    if(cards.length)any=true;
    h+='<section class="wtrow"'+(t?' style="--tone:'+esc(toneHex(t.color))+'"':'')+'>'+
      '<div class="wthead">'+
        '<span class="wtn">'+esc(t?t.name:'Untyped')+'</span>'+
        '<span class="wtc">'+arenas.length+' arena'+(arenas.length===1?'':'s')+
          (k?' \u00B7 <b>'+k+' asking</b>':'')+'</span></div>'+
      (cards.length?'<div class="wtrack" data-ty="'+(t?t.id:'')+'">'+
        cards.map(x=>wallCard(x.a,x.s,'lead')).join('')+'</div>':'')+
      (empty.length?'<p class="wrest">No brokerage material yet \u2014 '+
        empty.map(a=>'<button class="wghost" data-act="editBrokerage" data-id="'+a.id+'">'+esc(a.name)+'</button>').join('')+'</p>':'')+
    '</section>';
  }
  if(!any)h+='<p class="wempty">Nothing recorded yet \u2014 add brokerage links to an arena first.</p>';
  w.innerHTML=h;
}
function applyView(){
  const v=S.ui.view;
  $('#board').hidden=v!=='board';
  $('#wall').hidden=v!=='brokerage';
  $('#dispatch').hidden=v!=='dispatch';
  $('#coming').hidden=v!=='coming';
  document.querySelectorAll('#viewseg button, #dispatchBtn').forEach(b=>
    b.classList.toggle('on',b.dataset.v===S.ui.view));
  const tab=document.querySelector('#viewseg button[data-v=brokerage]');
  if(tab){
    const n=promptCount();
    tab.querySelector('.tabn')?.remove();
    if(n)tab.insertAdjacentHTML('beforeend','<span class="tabn">'+n+'</span>');
  }
  /* The findings are read from the cloud, so this count is what was last read
     and not a promise about what is there now — which is why the tab says
     nothing at all until the view has been opened once. */
  const dtab=document.querySelector('#dispatchBtn');
  if(dtab){
    const n=finds.state==='ready'?finds.rows.length:0;
    dtab.querySelector('.tabn')?.remove();
    if(n)dtab.insertAdjacentHTML('beforeend','<span class="tabn dpn">'+n+'</span>');
  }
}
/* every change to a card's standing goes through here, so the wall always
   re-orders in one place and the card that moved is the one marked to settle */
/* Rebuilding the room throws away the scroller's place. For an instant the
   board is empty, the browser clamps scrollTop to whatever the collapsed
   content allows — nearly always zero — and putting the content back does not
   put the place back. Setting a step or opening a composer is not a request to
   be sent to the top of the room, so the place is held across the paint. */
function keepPlace(fn){
  const sc=document.getElementById('semscroll');
  if(!sc){fn();return;}
  const top=sc.scrollTop,left=sc.scrollLeft;
  fn();
  if(sc.scrollTop!==top)sc.scrollTop=top;
  if(sc.scrollLeft!==left)sc.scrollLeft=left;
}
function repaint(){
  if(S.ui.view==='brokerage')renderWall();
  else if(S.ui.view==='dispatch')renderDispatch();
  else if(S.ui.view==='coming')renderComing();
  else renderBoard();
}
function restack(id){
  closeComposers();save();
  if(S.ui.view==='brokerage')settleId=id;
  repaint();renderDrawer();applyView();
}
/* Focusing a freshly painted composer asks the browser to bring it into view,
   which scrolls the room out from under the card you are working in. The
   composer is already where you clicked, so it needs the cursor, not the trip. */
function focusLk(){
  const el=document.querySelector('.lkform input[name=url]');
  if(el)el.focus({preventScroll:true});
}
/* the chip is the control, so pointing at it and pressing should open the
   calendar rather than merely putting a cursor in an invisible field */
document.addEventListener('click',e=>{
  const inp=e.target&&e.target.closest&&e.target.closest('.lwhen input');
  if(inp&&inp.showPicker){try{inp.showPicker();}catch(err){}}
},true);
/* A box that grows with what is in it, so a couple of sentences stay in sight. */
function growBox(el){
  if(!el)return;
  el.style.height='auto';
  /* scrollHeight counts the padding but not the border, and these boxes are
     border-box, so the border has to be added back or the last line is clipped */
  const edge=el.offsetHeight-el.clientHeight;
  const want=el.scrollHeight+edge;
  el.style.height=Math.min(want,MAX_BOX)+'px';
  el.style.overflowY=want>MAX_BOX?'auto':'hidden';
}
const MAX_BOX=280;             /* past this it scrolls: a lead is not an essay */
function growAll(root){(root||document).querySelectorAll('textarea.grow').forEach(growBox);}
function focusLead(){
  growAll();
  const el=document.querySelector('.leadform textarea[name=project],.lead.editing textarea[name=project]');
  if(el){el.focus({preventScroll:true});el.select();}
}
function focusNote(){
  growAll();
  const el=document.querySelector('.noteform textarea[name=text]');
  if(el)el.focus({preventScroll:true});
}
function closeComposers(){lkEdit={a:null,l:null};leadEdit={a:null,l:null};
  noteEdit={a:null,l:null};endAsk={a:null,l:null};waitPick=null;pinEdit=null;}
function renderAll(){
  if(S.ui.view==='brokerage')renderWall();else renderBoard();
  if(S.ui.view==='dispatch')renderDispatch();
  if(S.ui.view==='coming')renderComing();
  renderFreezer();renderDrawer();applySearchBox(false);applyView();
}

function newArena(name,typeId,tags){
  return {id:uid(),name,typeId,tags:tags||[],links:[],notes:'',
          brokerage:{notes:'',links:[]},dates:[],
          sweptAt:null,sweptPrev:null,leads:[],hold:null,frozenAt:null,
          weight:'ordinary'};
}
function addArena(){
  const a=newArena('New arena',S.types[0].id,[]);
  S.arenas.push(a);save();renderAll();openDrawer(a.id);
  drawer.editing=true;renderDrawer();
  const n=$('#card input[data-field=name]');if(n){n.focus();n.select();}
}
function quickCreate(){
  const lines=$('#quickText').value.split('\n').map(l=>l.trim()).filter(Boolean);
  let made=0;
  for(const line of lines){
    const p=line.split(';').map(x=>x.trim());
    if(!p[0])continue;
    let tyId=S.types[0].id;
    if(p[1]){
      let t=S.types.find(t=>t.name.toLowerCase()===p[1].toLowerCase());
      if(!t){t={id:uid(),name:p[1],color:freeTone(S.types)};S.types.push(t);}
      tyId=t.id;
    }
    const tags=p[2]?cleanTags(p[2].split(',')):[];
    S.arenas.push(newArena(p[0],tyId,tags));
    made++;
  }
  if(made){save();closeModals();$('#quickText').value='';renderAll();}
  else Ask.tell('Nothing to create',
    'Every line was blank. Put a name on at least one of them \u2014 the type '+
    'and the tags after it are optional.');
}
function readDateForm(f){
  const gran=f.gran.value;
  const v={};
  if(gran==='day')v.day=f.day.value;
  if(['month','quarter','half','year'].includes(gran))v.y=+f.y.value;
  if(gran==='month')v.m=+f.m.value;
  if(gran==='quarter')v.q=+f.q.value;
  if(gran==='half')v.h=+f.h.value;
  if(gran==='range'){v.from=f.from.value;v.to=f.to.value;}
  const[start,end]=resolve(gran,v);
  if(gran!=='none'&&!start){
    Ask.tell('The date is incomplete',
      'Fill it in, or set \u201CHow well is it known\u201D to \u201CNo date yet\u201D '+
      'if it is coming but you do not know when.');
    return null;}
  let grade=f.grade.value;
  if(!gradeOptions(gran).includes(grade))grade=gradeDefault(gran);
  const kind=f.kind.value;
  if(kind==='call'){
    const role=ROLES[f.role.value]?f.role.value:'publication';
    return {kind,call:f.call.value.trim()||'Untitled call',role,label:'',note:'',gran,grade,start,end};
  }
  const url=f.url?f.url.value.trim():'';
  return {kind,label:f.label.value.trim()||'(untitled)',call:'',role:'',
          note:f.note.value.trim(),url:url?leadLinkUrl(url):'',gran,grade,start,end};
}
function shiftYear(iso){
  const d=new Date(iso+'T12:00:00');d.setFullYear(d.getFullYear()+1);
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
}

/* example set */
function seed(){
  /* the example set brings its own types: it must not depend on the ones the
     board happens to have, which you are free to rename or delete */
  const ty=n=>{
    const t=S.types.find(t=>t.name===n);
    if(t)return t.id;
    const made={id:uid(),name:n,color:freeTone(S.types)};S.types.push(made);return made.id;
  };
  const B=(label,gran,grade,v,note)=>{const[start,end]=resolve(gran,v||{});
    return{id:uid(),kind:'brokerage',label,call:'',role:'',gran,grade,start,end,note:note||''};};
  const C=(call,role,gran,grade,v)=>{const[start,end]=resolve(gran,v||{});
    return{id:uid(),kind:'call',label:'',call,role,gran,grade,start,end,note:''};};
  const mk=(name,type,tags,dates,bk,swept,leads)=>Object.assign(newArena(name,ty(type),tags),
    {brokerage:bk||{notes:'',links:[]},dates,sweptAt:swept||null,leads:leads||[]});
  S.arenas.push(
    mk('ITEA 4','Programme',['software','systems'],[
      B('PO Days 2026 \u00B7 Berlin','day','fixed',{day:'2026-09-08'}),
      C('Call 2026','announcement','month','uncertain',{y:2026,m:7}),
      C('Call 2026','publication','day','fixed',{day:'2026-09-08'}),
      C('Call 2026','deadline','day','fixed',{day:'2026-11-05'})],
      {notes:'Project Outline pitches happen live at PO Days \u2014 partners are found there, not after.',
       links:[{id:uid(),label:'PO Days programme',url:'https://itea4.org'},
              {id:uid(),label:'Project outline tool',url:'https://itea4.org/project-outline'}]},'2026-07-30'),
    mk('Chips JU','Joint Undertaking',['semiconductors'],[
      C('Calls 2026-2','publication','day','fixed',{day:'2026-11-12'}),
      C('Calls 2026-2','deadline','day','fixed',{day:'2027-02-17'}),
      B('Info & brokerage day','month','uncertain',{y:2027,m:3},'Ran mid-March the last three editions')],
      {notes:'Brokerage runs through the JU\u2019s own matchmaking platform, opens with the call.',
       links:[{id:uid(),label:'Chips JU matchmaking',url:'https://www.chips-ju.europa.eu'}]},'2026-08-04'),
    mk('2ZERO','Partnership',['mobility'],[
      B('Online brokerage day','day','fixed',{day:'2027-01-21'}),
      C('Call 2027','publication','quarter','uncertain',{y:2027,q:2}),
      B('Partner search tool reopening','none','uncertain')],
      {notes:'Partner search runs on the 2ZERO platform; register the profile before the tool opens.',
       links:[{id:uid(),label:'2ZERO partner search',url:'https://www.2zeroemission.eu'}]},
      '2026-07-22',[{id:uid(),name:'Fraunhofer IVI',note:'Runs the depot-charging pilot \u2014 ask about WP2',
        links:[{id:uid(),label:'Their 2ZERO profile',url:'https://www.2zeroemission.eu/profile'}],
        due:'2026-09-04',doneAt:null}]),
    mk('Cluster 4 \u00B7 Digital & Industry','Cluster',['digital','manufacturing'],[
      C('WP 2027 first calls','publication','quarter','uncertain',{y:2027,q:1}),
      B('EC info days + brokerage','month','uncertain',{y:2026,m:11},'Pattern: November')]),
    mk('Cities Mission','Mission',['climate','urban'],[
      B('Cities Mission conference','month','uncertain',{y:2026,m:10})]),
    mk('Eurostars','Programme',['SME'],[
      C('Autumn cut-off','deadline','month','uncertain',{y:2026,m:9}),
      B('Matchmaking platform for next cut-off','none','uncertain')]),
    mk('COST','Programme',['networking'],[
      C('Open Call','deadline','day','fixed',{day:'2026-10-20'})]),
    mk('Xecs','Programme',['electronics'],[
      B('Project outline matchmaking \u00B7 online','day','fixed',{day:'2026-09-15'}),
      C('Call 8','publication','half','uncertain',{y:2027,h:1})],
      {notes:'',links:[{id:uid(),label:'Xecs partner search',url:'https://xecs.eu'}]})
  );
  migrate(S);          /* the example set goes in in the same shape as anything else */
  save();renderAll();
}

/* ───────── leads, lent to the Ledger's board ─────────
   Mark asked on 2026-10-06 for his open leads to stand on the Ledger's board
   as one line of their own, opening into cards he can work on there — and for
   the two to be one record, not a copy that drifts. So nothing is copied. The
   bridge hands the Ledger a read of the leads as they are this moment, and
   every change made over there comes back through `leadVerb` and lands on the
   very same object the cards in this room are drawn from, by the same save.

   The verbs are the ones this room's own controls already perform, written
   once more here only because those live inside click and submit handlers
   that read their arguments off the DOM. Each ends in `restack`, which is the
   room's own "a lead changed" path: it saves, which tells the cloud and the
   bridge, and redraws whatever of this room is showing.

   A frozen arena's leads stay off the board, for the reason the freezer says
   they do: they resume when the arena is thawed, and a board that kept
   reminding him of them would be a freezer that does not freeze. */
function leadsForBoard(){
  const out=[];
  liveArenas().forEach(a=>openLeads(a).forEach(l=>out.push({
    aid:a.id,arena:a.name,tone:arenaTone(a),type:(typeOf(a)||{}).name||'',
    id:l.id,name:leadName(l),project:l.project||'',
    match:l.match||'',stage:stageOf(l),due:l.due||null,
    toResearchers:!!l.toResearchers,toLead:!!l.toLead,score:l.score||0,
    links:(l.links||[]).map(k=>({id:k.id,url:k.url||'',label:k.label||'',name:linkName(k)})),
    updates:(l.updates||[]).map((u,i)=>({i,when:updWhen(u),at:u.at||'',text:u.text||''}))
  })));
  return out;
}
/* The arenas a new lead can be filed under, and the filing itself — the
   same lead the drawer's own "+ Lead" makes, starting where every lead
   starts, at Spotted. The Ledger asks for these when Mark adds a lead from
   its board (2026-10-06), so a lead begun there is born here. A frozen
   arena is not offered: a lead filed into the freezer would vanish from
   the board in the same press that made it. They come in the rotation
   wall's order, top card first and the ghosts after, as Mark asked on
   2026-10-06: the arena a lead is spotted in is the one being swept, and
   that one is near the top of the wall. The rule is the wall's own, so
   the two cannot drift apart. */
function arenasForBoard(){
  return rotationOrder(liveArenas()).map(a=>({id:a.id,name:a.name}));
}
/* A bare address with an @ in it is a person to write to; anything else
   without a scheme is a site. */
function leadLinkUrl(url){
  return /^[^\s@\/]+@[^\s@\/]+\.[^\s@\/]+$/.test(url)?'mailto:'+url
    :(/^(https?:|mailto:|file:)/i.test(url)?url:'https://'+url);
}
function leadAdd(aid,v){
  const a=arena(aid);if(!a)return null;
  const project=String(v&&v.project||'').trim(),match=String(v&&v.match||'').trim();
  const links=((v&&v.links)||[]).map(k=>({url:String(k&&k.url||'').trim(),label:String(k&&k.label||'').trim()}))
    .filter(k=>k.url);
  if(!project&&!match&&!links.length)return null;
  const l={id:uid(),project,match,links:links.map(k=>({id:uid(),label:k.label,url:leadLinkUrl(k.url)})),
    stage:'spotted',toResearchers:false,toLead:false,due:(v&&v.due)||null,doneAt:null,updates:[]};
  if(!Array.isArray(a.leads))a.leads=[];
  a.leads.push(l);
  restack(a.id);
  return l.id;
}
function leadVerb(aid,lid,op,val){
  const a=arena(aid);if(!a)return false;
  const l=(a.leads||[]).find(x=>x.id===lid);if(!l)return false;
  switch(op){
    case 'due':l.due=val||null;break;
    case 'path':if(!leadPath(l,val))return false;break;
    case 'score':if(!leadScore(l,val))return false;break;
    /* Complete with its answer, or — pressed again with none, as the
       Ledger's Undo does — reopened, answer and all */
    case 'done':
      if(l.doneAt){l.doneAt=null;delete l.outcome;}
      else if(!endLead(l,val))return false;
      break;
    case 'edit':if(!val||!leadEditAll(l,val))return false;break;
    case 'note':{
      const text=String(val||'').trim();if(!text)return false;
      if(!Array.isArray(l.updates))l.updates=[];
      l.updates.push({at:todayISO(),text});break;}
    case 'noteDel':{
      const i=+val;
      if(!Array.isArray(l.updates)||!(i>=0&&i<l.updates.length))return false;
      l.updates.splice(i,1);break;}
    case 'link':{
      /* the same reading of a bare address as the link form's: one with an
         @ in it is a person to write to, anything else without a scheme is
         a site */
      let url=String(val&&val.url||'').trim();const label=String(val&&val.label||'').trim();
      if(!url&&!label)return false;
      if(url&&/^[^\s@\/]+@[^\s@\/]+\.[^\s@\/]+$/.test(url))url='mailto:'+url;
      else if(url&&!/^(https?:|mailto:|file:)/i.test(url))url='https://'+url;
      if(!Array.isArray(l.links))l.links=[];
      l.links.push({id:uid(),label,url});break;}
    case 'linkDel':l.links=(l.links||[]).filter(k=>k.id!==val);break;
    default:return false;
  }
  restack(a.id);
  if(op==='done'&&l.doneAt&&l.outcome==='project')leadToProject(a,l);
  return true;
}

/* ============ modals ============ */
function closeModals(){document.querySelectorAll('.modal').forEach(m=>m.classList.remove('open'));}

/* ── asking, and saying ──
   Two shapes, one box. `ask` puts a question with a way out of it and calls
   back only on yes; `tell` states something that has already happened and
   has one way out. Both are the room's own furniture rather than the
   browser's: confirm() and alert() draw a system box with the file's URL in
   its title, they block the page while they are up — which stops a card
   mid-turn — and on a tablet they arrive somewhere the board is not. */
const Ask=(function(){
  const box=()=>$('#askModal');
  let onYes=null,restore=null;
  function shut(){
    const m=box();if(!m)return;
    m.classList.remove('open','tell');
    onYes=null;
    /* back to whatever the question interrupted */
    if(restore&&restore.isConnected&&restore.focus)restore.focus();
    restore=null;
  }
  function put(title,body,yesLabel,cb,isTell){
    const m=box();
    if(!m){                        /* markup gone: never silently do the thing */
      if(!isTell&&typeof cb==='function')return;
      return;
    }
    restore=document.activeElement;
    $('#askTitle').textContent=title;
    $('#askBody').textContent=body;
    $('#askYes').textContent=yesLabel;
    m.classList.toggle('tell',!!isTell);
    onYes=isTell?null:(cb||null);
    m.classList.add('open');
    $('#askYes').focus();
  }
  function ask(title,body,yesLabel,cb){put(title,body,yesLabel||'Yes',cb,false);}
  function tell(title,body){put(title,body,'Close',null,true);}
  function isOpen(){const m=box();return !!(m&&m.classList.contains('open'));}
  function yes(){const cb=onYes;shut();if(cb)cb();}
  return {ask,tell,shut,isOpen,yes};
})();
$('#askYes').addEventListener('click',Ask.yes);
$('#askNo').addEventListener('click',Ask.shut);
/* A type's colour or place shows on the wall, the board, the leads and the
   list of types at once, so a change to either redraws all four. */
function typesShown(){renderTypes();renderAll();}
/* ───────── the types, managed ─────────
   Everything about the types in one place, opened from the Types button
   beside + Arena (Mark, 2026-10-11): their order, which the cards, the board
   and Pocket all follow; their names and colours; merging one into another;
   and moving an arena from one type to another. All of it by dragging, as
   he asked the same day, over a first version of arrows and drop-down
   menus: a type is dragged by its grip up or down to order it, or onto
   another type to merge into it; a type opens to show its arenas one under
   another in Mark's own order (the board's "My order"), and an arena is
   dragged up or down to reorder it, between the arenas of another open type
   to move it there at that place, or onto a shut type to move it to that
   type's end (see "dragging in the list of types"). Which types stand open
   is not saved. */
const tyOpen=new Set();
function renderTypes(){
  const arenaRows=ars=>'<div class="tyarenas">'+ars.map(a=>
    '<div class="tyrow" data-tydrag="arena" data-id="'+a.id+'" title="Drag to reorder, or onto another type to move it there">'+
      '<span class="tygrip" data-tydrag="arena" data-id="'+a.id+'" aria-hidden="true">\u283F</span>'+
      '<span class="tyrn">'+esc(a.name)+'</span>'+(a.frozenAt?'<i>frozen</i>':'')+'</div>').join('')+'</div>';
  const byName=mineOrder;
  let h=S.types.map(t=>{
    const ars=S.arenas.filter(a=>a.typeId===t.id).sort(byName);
    const n=ars.length,open=n&&tyOpen.has(t.id);
    return '<section class="tyblock'+(open?' open':'')+'" data-ty="'+t.id+'" style="--tone:'+esc(toneHex(t.color))+'">'+
      '<div class="tyline">'+
        '<span class="tygrip" data-tydrag="type" data-id="'+t.id+'" '+
          'title="Drag up or down to reorder; drop onto another type to merge into it" aria-hidden="true">⠿</span>'+
        typeDotHTML(t)+
        '<input value="'+esc(t.name)+'" data-tyname="'+t.id+'" aria-label="Name of the type">'+
        '<button class="tyn" data-act="tyArenas" data-id="'+t.id+'"'+(n?'':' disabled')+
          ' aria-expanded="'+(open?'true':'false')+'">'+n+' arena'+(n===1?'':'s')+(n?(open?' ▾':' ▸'):'')+'</button>'+
        '<button class="ib" data-act="delType" data-id="'+t.id+'"'+
          ' title="'+(n?'Merge it or move its arenas first':'Remove '+esc(t.name))+'"'+(n?' disabled':'')+'>✕</button>'+
      '</div>'+
      (open?arenaRows(ars):'')+
    '</section>';
  }).join('');
  /* an arena whose type was taken from under it is offered a home here */
  const lost=S.arenas.filter(a=>!typeOf(a)).sort(byName);
  if(lost.length)h+='<section class="tyblock open"><div class="tyline"><span class="tylost">Untyped</span></div>'+arenaRows(lost)+'</section>';
  $('#tylist').innerHTML=h;
}
/* One type into another: every arena of it goes over, and it is removed.
   Asked first, because it cannot be told apart afterwards. */
function mergeTypes(from,to){
  if(!from||!to||from===to)return;
  const n=S.arenas.filter(a=>a.typeId===from.id).length;
  Ask.ask('Merge '+from.name+' into '+to.name+'?',
    (n===1?'Its one arena becomes ':n?'Its '+n+' arenas become ':'It has no arenas; ')+
    (n?to.name+', in '+to.name+'’s colour, and ':'')+from.name+' is removed.','Merge',()=>{
      S.arenas.forEach(a=>{if(a.typeId===from.id)a.typeId=to.id;});
      S.types=S.types.filter(t=>t!==from);
      delete S.ui.collapsed[from.id];
      tyOpen.delete(from.id);if(n)tyOpen.add(to.id);
      save();typesShown();
    });
}
/* ───────── dragging in the list of types ─────────
   The same hand as the links' own reordering (see "putting links in your own
   order"): with a mouse a thing lifts once it has travelled a few pixels; on
   the iPad a grip lifts at once, since it is nothing but a grip, and the rest
   of an arena's row once it has been held still for a moment, so a finger
   can still scroll the list. A copy follows the pointer and the place it
   would land is marked: a line above or below a type to put a type there, a
   line between two arenas to put an arena there, the type itself outlined to
   merge into it or to take an arena at its end. Near the edge of the
   box the list scrolls. Escape puts everything back. */
let tdDrag=null,tdSwallow=false;
/* A drag let go of outside the box ends in a click on the dimmed ground
   around it, which shuts the box — found 2026-10-11 testing Escape mid-drag.
   The click a drag makes is not wanted anywhere, so it is taken here, as the
   links' own reordering takes theirs (lkSwallow). It is waited for however
   long the button is held after Escape has dropped the drag, and the next
   press clears the wait if no click came. */
document.addEventListener('click',e=>{
  if(!tdSwallow)return;
  tdSwallow=false;e.preventDefault();e.stopPropagation();
},true);
document.addEventListener('pointerdown',e=>{
  if(e.button!==0||tdDrag)return;
  tdSwallow=false;
  const src=e.target.closest&&e.target.closest('#tylist [data-tydrag]');
  if(!src)return;
  const kind=src.dataset.tydrag;
  const D=tdDrag={src,kind,id:src.dataset.id,pid:e.pointerId,x:e.clientX,y:e.clientY,lx:e.clientX,ly:e.clientY,
    on:false,hold:e.pointerType!=='mouse'&&!src.classList.contains('tygrip'),timer:0,ghost:null,ox:0,oy:0,drop:null,raf:0};
  src.addEventListener('pointermove',tdMove);
  src.addEventListener('pointerup',tdUp);
  src.addEventListener('pointercancel',tdCancel);
  src.addEventListener('touchmove',tdTouch,{passive:false});
  if(D.hold)D.timer=setTimeout(()=>{if(tdDrag===D&&!D.on)tdLift();},LK_HOLD);
});
function tdTouch(e){if(tdDrag&&(tdDrag.on||!tdDrag.hold))e.preventDefault();}
function tdLift(){
  const D=tdDrag;if(!D)return;
  D.on=true;tdSwallow=true;
  try{D.src.setPointerCapture(D.pid);}catch(err){}
  const face=D.kind==='type'?D.src.closest('.tyline'):D.src.closest('.tyrow');
  const r=face.getBoundingClientRect();
  D.ox=D.x-r.left;D.oy=D.y-r.top;
  D.ghost=face.cloneNode(true);
  D.ghost.classList.add('tyghost');
  /* a type's copy is cut short, so it does not cover the mark saying where it would land */
  D.ghost.style.width=(D.kind==='type'?Math.min(r.width,340):r.width)+'px';
  const tone=D.src.closest('.tyblock');
  if(tone&&tone.style.getPropertyValue('--tone'))D.ghost.style.setProperty('--tone',tone.style.getPropertyValue('--tone'));
  $('#typesModal .mbox').appendChild(D.ghost);
  (D.kind==='type'?D.src.closest('.tyblock'):D.src.closest('.tyrow')).classList.add('tysrc');
  tdPlace();
  const box=$('#typesModal .mbox');
  const step=()=>{
    if(tdDrag!==D)return;
    const b=box.getBoundingClientRect();
    if(D.ly<b.top+48)box.scrollTop-=8;else if(D.ly>b.bottom-48)box.scrollTop+=8;
    D.raf=requestAnimationFrame(step);
  };
  D.raf=requestAnimationFrame(step);
}
function tdPlace(){
  const D=tdDrag;
  D.ghost.style.left=(D.lx-D.ox)+'px';D.ghost.style.top=(D.ly-D.oy)+'px';
}
/* where a drop at this height would land */
function tdTarget(y){
  const D=tdDrag;
  const blocks=[...document.querySelectorAll('#tylist .tyblock[data-ty]')];
  if(!blocks.length)return null;
  let b=blocks.find(x=>{const r=x.getBoundingClientRect();return y>=r.top-3&&y<=r.bottom+3;});
  if(!b&&D.kind==='type'){
    if(y<blocks[0].getBoundingClientRect().top)return {b:blocks[0],how:'before'};
    if(y>blocks[blocks.length-1].getBoundingClientRect().bottom)return {b:blocks[blocks.length-1],how:'after'};
  }
  if(!b)return null;
  /* An arena dropped among the arenas of an open type lands between the two
     it is dropped between; dropped anywhere else on a type, at its end. */
  if(D.kind==='arena'){
    const rows=[...b.querySelectorAll('.tyrow')];
    const box=rows.length&&b.querySelector('.tyarenas').getBoundingClientRect();
    if(box&&y>=box.top-4){
      const at=rows.findIndex(r=>{const q=r.getBoundingClientRect();return y<q.top+q.height/2;});
      return at<0?{b,how:'into',row:rows[rows.length-1],side:'below',i:rows.length}
                 :{b,how:'into',row:rows[at],side:'above',i:at};
    }
    const ar=arena(D.id);
    return ar&&ar.typeId!==b.dataset.ty?{b,how:'into',i:-1}:null;
  }
  if(b.dataset.ty===D.id)return null;
  const r=b.getBoundingClientRect(),edge=Math.min(12,r.height*.25);
  return {b,how:y<r.top+edge?'before':y>r.bottom-edge?'after':'merge'};
}
function tdMark(t){
  document.querySelectorAll('#tylist .tyblock[data-say]').forEach(x=>{
    x.classList.remove('drop-before','drop-after','drop-merge','drop-into');x.removeAttribute('data-say');});
  document.querySelectorAll('#tylist .tyrow.drop-above,#tylist .tyrow.drop-below').forEach(x=>
    x.classList.remove('drop-above','drop-below'));
  if(!t)return;
  /* a place among the arenas is a line between two of them; anywhere else,
     the type itself is outlined and says what the drop does */
  if(t.row){t.row.classList.add('drop-'+t.side);t.b.dataset.say='';return;}
  t.b.classList.add('drop-'+t.how);
  t.b.dataset.say=t.how==='merge'?'Merge into this type':t.how==='into'?'Move here':'';
}
function tdMove(e){
  const D=tdDrag;if(!D||e.pointerId!==D.pid)return;
  D.lx=e.clientX;D.ly=e.clientY;
  if(!D.on){
    const far=Math.abs(e.clientY-D.y)>LK_SLOP||Math.abs(e.clientX-D.x)>LK_SLOP;
    if(!far)return;
    if(D.hold){tdCancel();return;}              /* moved before the hold: that is a scroll */
    tdLift();
  }
  e.preventDefault();
  tdPlace();
  D.drop=tdTarget(e.clientY);
  tdMark(D.drop);
}
function tdEnd(){
  const D=tdDrag;if(!D)return null;
  clearTimeout(D.timer);cancelAnimationFrame(D.raf);
  D.src.removeEventListener('pointermove',tdMove);
  D.src.removeEventListener('pointerup',tdUp);
  D.src.removeEventListener('pointercancel',tdCancel);
  D.src.removeEventListener('touchmove',tdTouch,{passive:false});
  try{D.src.releasePointerCapture(D.pid);}catch(err){}
  if(D.ghost)D.ghost.remove();
  document.querySelectorAll('#tylist .tysrc').forEach(x=>x.classList.remove('tysrc'));
  tdMark(null);
  tdDrag=null;
  return D;
}
function tdCancel(){tdEnd();}
function tdUp(){
  const D=tdEnd();if(!D||!D.on||!D.drop)return;
  const{b,how}=D.drop,to=S.types.find(t=>t.id===b.dataset.ty);
  if(!to)return;
  /* the arena joins its type's order at the place it was dropped, and that
     type's order is written down again from the top */
  if(D.kind==='arena'){
    const ar=arena(D.id);if(!ar)return;
    const shown=[...b.querySelectorAll('.tyrow')].map(r=>arena(r.dataset.id)).filter(Boolean);
    const list=(shown.length?shown:S.arenas.filter(a=>a.typeId===to.id).sort(mineOrder)).filter(a=>a!==ar);
    let i=D.drop.i;
    if(i<0)i=list.length;
    else if(shown.indexOf(ar)>=0&&shown.indexOf(ar)<i)i--;  /* its own old place no longer counts */
    list.splice(Math.min(i,list.length),0,ar);
    ar.typeId=to.id;
    list.forEach((a,k)=>{a.bkPos=k;});
    tyOpen.add(to.id);save();typesShown();
    return;
  }
  const from=S.types.find(t=>t.id===D.id);if(!from)return;
  if(how==='merge'){mergeTypes(from,to);return;}
  const rest=S.types.filter(t=>t!==from);
  const i=rest.indexOf(to)+(how==='after'?1:0);
  rest.splice(i,0,from);
  S.types=rest;save();typesShown();
}

/* ============ tooltip ============ */
const tip=$('#tip');
document.addEventListener('mouseover',e=>{
  const el=e.target.closest('[data-tipd],[data-tipl],[data-tipt]');
  if(!el){tip.style.display='none';return;}
  let txt='';
  const a=arena(el.dataset.a||el.dataset.id);
  /* a bar on a card's strip can stand for several calls at once, so it
     brings its own words rather than one date's */
  if(el.dataset.tipt&&a){
    txt=a.name+'\n'+el.dataset.tipt;
  }else if(el.dataset.tipl&&a){
    const looms=a.dates.filter(d=>!d.start);
    txt=a.name+'\nComing \u2014 no date yet:\n'+looms.map(d=>'\u00B7 '+dtLabel(d)).join('\n');
  }else if(el.dataset.d&&a){
    const dt=a.dates.find(d=>d.id===el.dataset.d);
    if(dt)txt=a.name+'\n'+dtLabel(dt)+(dtSub(dt)?' \u00B7 '+dtSub(dt):'')+'\n'+KINDS[dt.kind].name+' \u00B7 '+GRADES[dt.grade].name+' \u2014 '+dispDate(dt);
  }
  if(!txt){tip.style.display='none';return;}
  tip.textContent=txt;tip.style.display='block';
});
document.addEventListener('mousemove',e=>{
  if(tip.style.display==='none')return;
  const w=tip.offsetWidth,h=tip.offsetHeight;
  let x=e.clientX+14,y=e.clientY+16;
  /* through `window`, not bare: bare identifiers skip the room's own
     window and measure the page, which is not the box the tip is in */
  if(x+w>window.innerWidth-8)x=e.clientX-w-10;
  if(y+h>window.innerHeight-8)y=e.clientY-h-10;
  tip.style.left=x+'px';tip.style.top=y+'px';
});

/* ============ events ============ */
document.addEventListener('click',e=>{
  /* an open colour menu takes the press that shuts it, as the Ledger's does,
     unless the press is on a dot, which opens that one instead */
  if(colOpen&&!e.target.closest('.lcolpop,[data-act=typeColMenu]')){colOpen=null;typesShown();return;}
  if(sortOpen&&!e.target.closest('.whmenu,[data-act=boardSort]')){sortOpen=false;renderBoard();return;}
  const b=e.target.closest('[data-act]');
  if(!b)return;
  const act=b.dataset.act,id=b.dataset.id,a=arena(b.dataset.a||id);
  switch(act){
    case 'typeColMenu':{colOpen=colOpen===id?null:id;typesShown();
      const sw=colOpen&&document.querySelector('.lcolpop .lsw.sel');
      if(sw)sw.focus({preventScroll:true});break;}
    case 'typeColPop':break;
    /* Every card's stamp at once, so the whole rotation starts round again
       (Mark, 2026-10-11). Asked first: there is no taking it back, the
       stamps' days are gone. A frozen arena is out of the rotation, and a
       pinned link's own stamp is not a card's, so both keep theirs. */
    case 'resetStamps':{
      const on=S.arenas.filter(x=>!x.frozenAt&&x.sweptAt);
      if(!on.length){Ask.tell('Nothing to reset','No card in the rotation has a stamp.');break;}
      Ask.ask('Reset all stamps?',
        'The stamp comes off all '+on.length+' stamped card'+(on.length===1?'':'s')+' in the rotation, as if '+
        'none had ever been swept, so every card comes round again. The days they were stamped are not kept.',
        'Reset',()=>{on.forEach(x=>{x.sweptAt=null;x.sweptPrev=null;});save();renderAll();});
      break;}
    case 'tyArenas':if(tyOpen.has(id))tyOpen.delete(id);else tyOpen.add(id);renderTypes();break;
    case 'typeColor':{colOpen=null;const t=S.types.find(t=>t.id===id);
      if(t&&toneHex(b.dataset.v))t.color=b.dataset.v;
      save();typesShown();break;}
    case 'addArena':addArena();break;
    case 'openArena':openDrawer(id);break;
    case 'openDate':openDrawer(b.dataset.a,b.dataset.d);break;
    case 'closeDrawer':closeDrawer();break;
    case 'sweep':{const ar=arena(id);if(!ar)break;
      const t=todayISO();
      /* the sweep is also what marks the agent's findings seen (see isFresh),
         to the moment rather than the day, so a finding accepted after this
         morning's sweep is still new; the same-day undo gives the marks back */
      /* Stamping a card that is back from waiting is the end of that wait:
         its date has come within reach and the card has now been looked at,
         so it goes back to its own row (Mark, 2026-10-11). The wait is kept
         aside for the day, so taking the stamp off puts it back as well. */
      if(ar.sweptAt===t){ar.sweptAt=ar.sweptPrev||null;ar.seenAt=ar.seenPrev||null;   /* same-day undo */
           if(ar.holdPrev){ar.hold=ar.holdPrev;reconcile(ar);}delete ar.holdPrev;}
      else{ar.sweptPrev=ar.sweptAt||null;ar.sweptAt=t;
           ar.seenPrev=ar.seenAt||null;ar.seenAt=new Date().toISOString();
           const h=holdOf(ar);
           if(h&&!h.asleep){ar.holdPrev=ar.hold;ar.hold=null;}else delete ar.holdPrev;}
      restack(ar.id);break;}
    /* A press on a lead's own ground opens or shuts it. Its links, its date
       and the fields of a composer inside it are presses of their own. */
    case 'leadOpen':{
      if(e.target.closest('a,input,textarea,select,label,form'))break;
      const k=b.dataset.l;if(!k)break;
      if(leadOpen.has(k))leadOpen.delete(k);else leadOpen.add(k);
      repaint();renderDrawer();break;}
    case 'leadAdd':{closeComposers();leadEdit={a:id,l:'new'};
      repaint();renderDrawer();focusLead();break;}
    case 'leadEdit':{closeComposers();leadEdit={a:id,l:b.dataset.l};leadOpen.add(b.dataset.l);
      repaint();renderDrawer();focusLead();break;}
    case 'leadCancel':{closeComposers();repaint();renderDrawer();break;}
    /* another link row, added in place: a redraw would cost what is typed */
    case 'leadLinkRow':{
      b.insertAdjacentHTML('beforebegin',leadFormLinkHTML());
      const r=b.previousElementSibling;if(r)r.querySelector('[name=url]').focus();
      break;}
    case 'leadSave':{const ar=arena(id);if(!ar)break;
      const l=(ar.leads||[]).find(x=>x.id===b.dataset.l);if(!l)break;
      const card=b.closest('.lead');if(!card)break;
      if(!leadEditAll(l,leadEditRead(card))){Ask.tell('Nothing left','A lead needs at least a project, a match or a link.');break;}
      closeComposers();restack(ar.id);break;}
    /* marks a link or an update to go when the edit is saved, and back */
    case 'leadEditDrop':{const r=b.closest('.ledrow');if(r)r.classList.toggle('gone');break;}
    /* One way to move a lead on: press a dot of its ruit. There is no second
       control that walks it round, and none in the form. */
    case 'leadPath':{const ar=arena(id);if(!ar)break;
      const l=(ar.leads||[]).find(x=>x.id===b.dataset.l);if(!l||l.doneAt)break;
      if(leadPath(l,b.dataset.v)){save();repaint();renderDrawer();}break;}
    /* Complete asks how the lead ended before it closes it (see OUTCOMES);
       Reopen puts it back at once, answer and all, since nothing was thrown
       away. */
    case 'leadDone':{const ar=arena(id);if(!ar)break;
      const l=(ar.leads||[]).find(x=>x.id===b.dataset.l);if(!l)break;
      if(l.doneAt){l.doneAt=null;delete l.outcome;restack(ar.id);break;}
      closeComposers();endAsk={a:ar.id,l:l.id};leadOpen.add(l.id);
      repaint();renderDrawer();break;}
    case 'leadEnd':{const ar=arena(id);if(!ar)break;
      const l=(ar.leads||[]).find(x=>x.id===b.dataset.l);if(!l||l.doneAt)break;
      if(!endLead(l,b.dataset.v))break;
      restack(ar.id);
      if(l.outcome==='project')leadToProject(ar,l);
      break;}
    case 'leadEndCancel':{closeComposers();repaint();renderDrawer();break;}
    case 'leadLinkDel':{const ar=arena(id);if(!ar)break;
      const l=(ar.leads||[]).find(x=>x.id===b.dataset.l);if(!l)break;
      l.links=(l.links||[]).filter(k=>k.id!==b.dataset.k);
      save();repaint();renderDrawer();break;}
    case 'noteAdd':{closeComposers();noteEdit={a:id,l:b.dataset.l};leadOpen.add(b.dataset.l);
      repaint();renderDrawer();focusNote();break;}
    case 'noteCancel':{closeComposers();repaint();renderDrawer();break;}
    case 'updMore':{const k=b.dataset.l;
      if(updOpen.has(k))updOpen.delete(k);else updOpen.add(k);
      repaint();renderDrawer();break;}
    case 'closedMore':{
      if(closedOpen.has(id))closedOpen.delete(id);else closedOpen.add(id);
      repaint();renderDrawer();break;}
    case 'updDel':{const ar=arena(id);if(!ar)break;
      const l=(ar.leads||[]).find(x=>x.id===b.dataset.l);if(!l)break;
      const i=+b.dataset.u;
      if(!Array.isArray(l.updates)||!(i>=0&&i<l.updates.length))break;
      l.updates.splice(i,1);
      save();repaint();renderDrawer();break;}
    case 'lkAdd':{closeComposers();lkEdit={a:id,l:b.dataset.l||null};if(b.dataset.l)leadOpen.add(b.dataset.l);
      repaint();renderDrawer();focusLk();break;}
    case 'lkCancel':{closeComposers();repaint();renderDrawer();break;}
    case 'pinEdit':{const open=pinEdit===b.dataset.l;closeComposers();if(!open)pinEdit=b.dataset.l;
      repaint();renderDrawer();focusLk();break;}

    case 'waitPick':{closeComposers();waitPick=id;repaint();renderDrawer();break;}
    case 'holdSet':{const ar=arena(id);if(!ar)break;
      const d=(ar.dates||[]).find(x=>x.id===b.dataset.d);if(!d)break;
      closeComposers();ar.hold={dateId:d.id};restack(ar.id);break;}
    case 'holdClear':{const ar=arena(id);if(!ar)break;ar.hold=null;restack(ar.id);break;}
    case 'setWeight':{const ar=arena(id);if(!ar)break;
      if(!WEIGHTS[b.dataset.v])break;
      ar.weight=b.dataset.v;save();renderDrawer();
      if(S.ui.view==='brokerage')renderWall();else renderBoard();
      applyView();break;}
    case 'toggleHow':S.ui.howOpen=!S.ui.howOpen;save();renderWall();break;
    case 'freeze':{const ar=arena(id);if(!ar)break;
      ar.frozenAt=todayISO();
      S.ui.freezerOpen=true;                 /* show where it went */
      closeComposers();save();renderAll();break;}
    case 'thaw':{const ar=arena(id);if(!ar)break;
      ar.frozenAt=null;save();renderAll();break;}
    case 'toggleFreezer':S.ui.freezerOpen=!S.ui.freezerOpen;save();renderFreezer();break;
    /* A link pinned is the moment it was pinned, which is the order Pinned
       lists them in; unpinned, it is back on its card where it was. */
    case 'lkPin':{const lk=linkOf(a,b.dataset.lks,b.dataset.l);if(!lk)break;
      if(lk.pin)delete lk.pin;else lk.pin=new Date().toISOString();
      relinked();break;}
    /* the link's own sweep, on Pinned and on the cards: the day you last went
       through its site, and a same-day press takes it back, as the arena's
       stamp does */
    case 'lkStamp':{const lk=linkOf(a,b.dataset.lks,b.dataset.l);if(!lk)break;
      toggleStamp(lk);relinked();break;}
    /* Quick, but not one slip from gone: the first press turns the cross into
       the word, a second within three seconds removes the link. The button is
       changed in place rather than redrawn, so nothing else on the wall moves
       while it waits. */
    case 'lkDel':{const list=linkList(a,b.dataset.lks);if(!list)break;
      if(!b.classList.contains('armed')){
        b.classList.add('armed');b.textContent='Remove';
        setTimeout(()=>{if(b.isConnected){b.classList.remove('armed');b.textContent='\u2715';}},3000);
        break;
      }
      const k=list.findIndex(l=>l.id===b.dataset.l);
      if(k>=0)list.splice(k,1);
      relinked();break;}
    case 'askAgent':{const ar=arena(id);if(!ar)break;
      ar.askAt=ar.askAt?null:new Date().toISOString();
      relinked();break;}
    case 'setWallSort':{const v=b.dataset.v;
      S.ui.wallSort=['pinned','leads'].includes(v)?v:'rotation';
      save();renderWall();break;}
    case 'setView':{const v=b.dataset.v;
      S.ui.view=['brokerage','dispatch','coming'].includes(v)?v:'board';
      cuHi=null;
      save();renderAll();
      /* the findings are asked for when you come to look at them, and again
         every time you come back: a list read an hour ago is a list another
         machine may have answered since */
      if(S.ui.view==='dispatch')loadFinds();
      break;}
    case 'findRefresh':loadFinds();break;
    case 'cuAll':S.ui.cuAll=b.dataset.v==='1';save();renderComing();break;
    case 'cuLimbo':cuLimbo=!cuLimbo;renderComing();break;
    case 'cuStrip':{const k=b.dataset.a+'|'+b.dataset.d;if(cuOpen.has(k))cuOpen.delete(k);else cuOpen.add(k);renderComing();break;}
    case 'cuStamp':{if(!a)break;const dt=a.dates.find(d=>d.id===b.dataset.d);if(!dt)break;
      toggleStamp(dt);save();renderComing();break;}
    case 'jumpDate':jumpDate(b.dataset.a,b.dataset.d);break;
    case 'cuNew':{cuNew=!cuNew;renderComing();
      const f=document.querySelector('#coming .cuform select[name=arena]');if(f)f.focus();break;}
    /* An event's missing website is added where an event is edited: its
       arena's panel opens on the date's own editor, the Website box first. */
    case 'cuSite':{if(!a)break;openDrawer(a.id,b.dataset.d);
      drawer.editing=true;drawer.edit=b.dataset.d;renderDrawer();
      const f=document.querySelector('#card .dform input[name=url]');
      if(f){f.scrollIntoView({block:'center'});f.focus({preventScroll:true});}
      break;}
    /* Removing an event from the list removes it from the board: there is
       one record of it, on its arena, and every view reads that (Mark,
       2026-10-08: "remove them from everywhere in the app"). */
    case 'cuDel':{if(!a)break;const dt=a.dates.find(d=>d.id===b.dataset.d);if(!dt)break;
      const aid=a.id,did=dt.id;
      /* In Limbo every event is there to be taken off, and asking each time
         would make clearing it a dialog per row; the ask stays for an event
         still to come, which a stray click must not lose. */
      if(b.dataset.limbo){a.dates=a.dates.filter(d=>d.id!==did);reconcile(a);save();renderAll();break;}
      Ask.ask('Remove this event?',
        '\u201C'+dtLabel(dt)+'\u201D \u2014 '+dispDate(dt)+', on '+a.name+
        '. It goes from the whole app: this list, the board, the cards and the arena\u2019s panel.',
        'Remove',()=>{
          const ar=arena(aid);if(!ar)return;
          ar.dates=ar.dates.filter(d=>d.id!==did);reconcile(ar);save();renderAll();
        });
      break;}
    case 'findAll':{
      const n=finds.rows.length;
      Ask.ask('Accept all '+n+'?',
        'Every finding in the list goes on the board: new dates, corrected dates, '+
        'links, new arenas, and new About and Brokerage texts in place of the old. Nothing is dismissed. A single one can be taken off '+
        'the board again afterwards, but not all at once.',
        'Accept all '+n,acceptAllFinds);
      break;
    }
    case 'findTake':answerFind(b.dataset.f,true);break;
    case 'findDrop':answerFind(b.dataset.f,false);break;
    case 'editBrokerage':{openDrawer(id);drawer.editing=true;drawer.scope='brokerage';renderDrawer();
      const ta=$('#card textarea[data-field=bknotes]');if(ta)ta.focus();break;}
    case 'openSearch':applySearchBox(true);$('#search').focus();break;
    case 'toggleGroup':S.ui.collapsed[id]=!S.ui.collapsed[id];save();renderBoard();break;
    case 'boardSort':sortOpen=!sortOpen;renderBoard();break;
    case 'boardSortSet':sortOpen=false;S.ui.boardSort=b.dataset.v==='mine'?'mine':'date';save();renderBoard();break;
    case 'openQuick':$('#quickModal').classList.add('open');$('#quickText').focus();break;
    case 'openTypes':renderTypes();$('#typesModal').classList.add('open');break;
    case 'closeModals':closeModals();break;
    case 'quickCreate':quickCreate();break;
    case 'seed':seed();break;
    case 'addType':{const n=$('#tyNew').value.trim();if(!n)break;
      if(S.types.some(t=>t.name.toLowerCase()===n.toLowerCase())){
        Ask.tell('That type already exists','There is already a type called \u201C'+n+'\u201D.');break;}
      S.types.push({id:uid(),name:n,color:freeTone(S.types)});$('#tyNew').value='';save();renderTypes();renderAll();break;}
    case 'delType':{const n=S.arenas.filter(x=>x.typeId===id).length;
      if(n){Ask.tell('Still in use',
        n+' arena'+(n===1?' still uses':'s still use')+' this type. Give '+
        (n===1?'it':'them')+' another type, or merge this one into another, and it can go.');break;}
      S.types=S.types.filter(t=>t.id!==id);save();renderTypes();renderAll();break;}
    case 'addDate':drawer.editing=true;drawer.edit='new';renderDrawer();
      {const f=$('#card .dform');if(f){f.scrollIntoView({block:'center'});
        const l=f.querySelector('input[name=call],input[name=label]');if(l)l.focus();}}break;
    case 'editDate':drawer.editing=true;drawer.edit=b.dataset.d;drawer.hi=b.dataset.d;renderDrawer();break;
    case 'cancelDate':drawer.edit=null;renderDrawer();break;
    case 'dupDate':{if(!a)break;const dt=a.dates.find(d=>d.id===b.dataset.d);if(!dt||!dt.start)break;
      const cp={...dt,id:uid(),grade:'uncertain',start:shiftYear(dt.start),end:shiftYear(dt.end),
                note:dt.kind==='call'?'':(dt.note?dt.note+' \u00B7 ':'')+'extrapolated from '+dispDate(dt)};
      delete cp.stampedAt;delete cp.stampPrev;   /* next year's edition has not been through anyone's hands */
      a.dates.push(cp);reconcile(a);drawer.hi=cp.id;save();renderAll();break;}
    case 'delDate':{if(!a)break;const dt=a.dates.find(d=>d.id===b.dataset.d);
      if(!dt)break;
      const aid=a.id,did=dt.id;
      Ask.ask('Delete this date?',
        '\u201C'+dtLabel(dt)+'\u201D \u2014 '+dispDate(dt)+
        '. Anything waiting on it goes back into the rotation.',
        'Delete',()=>{
          const ar=arena(aid);if(!ar)return;
          ar.dates=ar.dates.filter(d=>d.id!==did);reconcile(ar);save();renderAll();
        });
      break;}
    case 'segKind':{const f=b.closest('.dform');if(!f)break;
      f.kind.value=b.dataset.v;
      f.querySelectorAll('[data-act=segKind]').forEach(x=>x.classList.toggle('on',x.dataset.v===b.dataset.v));
      f.querySelector('.kindfields').innerHTML=kindFieldsHTML(b.dataset.v,null);break;}
    case 'segRole':{const f=b.closest('.dform');if(!f)break;
      f.role.value=b.dataset.v;
      f.querySelectorAll('[data-act=segRole]').forEach(x=>x.classList.toggle('on',x.dataset.v===b.dataset.v));break;}
    case 'segGrade':{const f=b.closest('.dform');if(!f)break;
      f.querySelector('.gradefld').innerHTML='<label>Certainty</label>'+gradeSegHTML(f.gran.value,b.dataset.v);break;}
    case 'editCard':drawer.editing=true;drawer.scope=null;drawer.edit=null;renderDrawer();break;
    case 'doneCard':drawer.editing=false;drawer.scope=null;drawer.edit=null;renderDrawer();break;
    case 'startAdd':{const w=b.dataset.what,ar=arena(drawer.id);if(!ar)break;
      drawer.editing=true;
      drawer.scope=w==='link'?'links':'dates';
      if(w==='link'){ar.links=ar.links||[];ar.links.push({id:uid(),label:'',url:''});save();}
      if(w==='date')drawer.edit='new';
      renderDrawer();
      const sel=w==='link'?'#card .erow input[data-lks=arena][data-lkf=label]':
                w==='date'?'#card .dform input[name=call],#card .dform input[name=label]':'#tdText';
      const els=document.querySelectorAll(sel);const el=els[els.length-1];
      if(el){el.focus();el.scrollIntoView({block:'center'});}
      break;}
    case 'addLink':{if(!a)break;
      const sc=b.dataset.scope==='brokerage'?(a.brokerage=a.brokerage||{notes:'',links:[]}):a;
      sc.links=sc.links||[];sc.links.push({id:uid(),label:'',url:''});
      drawer.editing=true;save();renderDrawer();
      {const sq=b.dataset.scope==='brokerage'?'brokerage':'arena';
       const rows=document.querySelectorAll('#card .erow input[data-lks='+sq+'][data-lkf=label]');const last=rows[rows.length-1];
       if(last){last.focus();last.scrollIntoView({block:'center'});}}break;}
    case 'delLink':{if(!a)break;
      const sc=b.dataset.scope==='brokerage'?(a.brokerage=a.brokerage||{notes:'',links:[]}):a;
      sc.links=(sc.links||[]).filter(l=>l.id!==b.dataset.l);save();renderDrawer();break;}
    case 'delArena':{if(!a)break;
      const aid=a.id,leads=(a.leads||[]).length,dates=(a.dates||[]).length;
      const carries=[leads?leads+' lead'+(leads===1?'':'s'):'',
                     dates?dates+' date'+(dates===1?'':'s'):''].filter(Boolean).join(' and ');
      Ask.ask('Delete this arena?',
        '\u201C'+a.name+'\u201D'+(carries?', with its '+carries+',':'')+
        ' will be removed and cannot be brought back. To put it away instead, '+
        'freeze it \u2014 the freezer keeps everything.',
        'Delete',()=>{
          S.arenas=S.arenas.filter(x=>x.id!==aid);closeDrawer();save();renderAll();
        });
      break;}
  }
});

/* ───────── typing, and the forms it goes into ───────── */
document.addEventListener('input',e=>{
  const t=e.target;
  if(t&&t.classList&&t.classList.contains('grow')){growBox(t);fitWall();}
},true);
document.addEventListener('keydown',e=>{
  const t=e.target;
  if(t&&t.tagName==='TEXTAREA'&&t.classList.contains('grow')&&e.key==='Enter'&&(e.metaKey||e.ctrlKey)){
    e.preventDefault();
    const f=t.closest('form');
    if(f)f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
    else{const sv=t.closest('.lead.editing')&&t.closest('.lead.editing').querySelector('[data-act=leadSave]');if(sv)sv.click();}
  }
});
/* A bare address with an @ in it is a person to write to, not a site: it
   used to be given https:// like any other and opened as a broken page. */
function typedAddr(url){
  url=String(url||'').trim();
  if(url&&/^[^\s@\/]+@[^\s@\/]+\.[^\s@\/]+$/.test(url))return 'mailto:'+url;
  if(url&&!/^(https?:|mailto:|file:)/i.test(url))return 'https://'+url;
  return url;
}
document.addEventListener('submit',e=>{
  /* a pinned link's new name and address; emptied of both, it stays as it
     was, since taking a link away is the cross on its card */
  const pf=e.target.closest('.pkform');
  if(pf){
    e.preventDefault();
    const lk=linkOf(arena(pf.dataset.pka),pf.dataset.pks,pf.dataset.pkl);
    const url=typedAddr(pf.elements.url.value),label=pf.elements.label.value.trim();
    closeComposers();
    if(lk&&(url||label)){lk.url=url;lk.label=label;}
    relinked();
    return;
  }
  const lf=e.target.closest('.lkform');
  if(lf){
    e.preventDefault();
    const a=arena(lf.dataset.lka);if(!a)return;
    const url=typedAddr(lf.elements.url.value);
    const label=lf.elements.label.value.trim();
    if(!url&&!label){closeComposers();repaint();renderDrawer();return;}
    const lead=lf.dataset.lkl?(a.leads||[]).find(x=>x.id===lf.dataset.lkl):null;
    if(lf.dataset.lkl&&!lead)return;
    if(lead)lead.links.push({id:uid(),label,url});
    else{
      a.brokerage=a.brokerage||{notes:'',links:[]};
      a.brokerage.links=a.brokerage.links||[];
      a.brokerage.links.push({id:uid(),label,url});
    }
    save();repaint();renderDrawer();
    focusLk();            /* the composer stays up: these tend to come in twos and threes */
    return;
  }
  const nf=e.target.closest('.noteform');
  if(nf){
    e.preventDefault();
    const a=arena(nf.dataset.na);if(!a)return;
    const l=(a.leads||[]).find(x=>x.id===nf.dataset.nl);if(!l)return;
    const text=nf.elements.text.value.trim();
    if(text){
      if(!Array.isArray(l.updates))l.updates=[];
      l.updates.push({at:todayISO(),text});
    }
    closeComposers();restack(a.id);
    return;
  }
  const df=e.target.closest('.leadform');
  if(df){
    e.preventDefault();
    const a=arena(df.dataset.la);if(!a)return;
    /* the same filing the Ledger's new lead uses, so a lead begun in either
       room is born the same way, at Spotted */
    const links=[...df.querySelectorAll('.lnrow')].map(r=>({
      url:r.querySelector('[name=url]').value,label:r.querySelector('[name=label]').value}));
    closeComposers();
    if(!leadAdd(a.id,{project:df.elements.project.value,match:df.elements.match.value,links})){
      repaint();renderDrawer();}
    return;
  }
  const cf=e.target.closest('.cuform');
  if(cf){
    e.preventDefault();
    const a=arena(cf.elements.arena.value);
    if(!a){Ask.tell('Which arena?','Choose the arena this event belongs to, and it is filed there.');return;}
    const vals=readDateForm(cf);if(!vals)return;
    const dt={id:uid(),...vals};
    a.dates.push(dt);reconcile(a);
    cuNew=false;cuHi=dt.id;save();renderAll();
    const row=document.querySelector('#coming .culn[data-cud="'+dt.id+'"]');
    if(row)row.scrollIntoView({block:'center'});
    return;
  }
  const f=e.target.closest('.dform');
  if(!f)return;
  e.preventDefault();
  const a=arena(f.dataset.a);if(!a)return;
  const vals=readDateForm(f);if(!vals)return;
  if(f.dataset.d==='new'){const dt={id:uid(),...vals};a.dates.push(dt);drawer.hi=dt.id;}
  else{const dt=a.dates.find(d=>d.id===f.dataset.d);if(dt)Object.assign(dt,vals);drawer.hi=f.dataset.d;}
  reconcile(a);              /* renaming a call, or moving its date, changes what it remembers */
  drawer.edit=null;save();renderAll();
});

document.addEventListener('change',e=>{
  const el=e.target;
  /* the day to come back, set on the row it belongs to */
  /* a day picked while the card is being edited is shown, and kept for Save */
  if(el.name==='due'&&el.closest('.lead.editing')){
    const sp=el.parentNode.querySelector('span');
    if(sp)sp.textContent=el.value?(el.dataset.say?longDay(el.value):shortDow(el.value)):'No date';
    return;
  }
  if(el.dataset&&el.dataset.lsa&&el.dataset.lsl){
    const a=arena(el.dataset.lsa);if(!a)return;
    const l=(a.leads||[]).find(x=>x.id===el.dataset.lsl);if(!l||l.doneAt)return;
    leadScore(l,el.value);save();repaint();renderDrawer();return;
  }
  if(el.dataset&&el.dataset.lda&&el.dataset.ldl){
    const a=arena(el.dataset.lda);if(!a)return;
    const l=(a.leads||[]).find(x=>x.id===el.dataset.ldl);if(!l)return;
    l.due=el.value||null;
    restack(a.id);return;
  }
  /* link rows */
  if(el.dataset.lk&&drawer.id){
    const a=arena(drawer.id);if(!a)return;
    const pool=el.dataset.lks==='brokerage'?((a.brokerage&&a.brokerage.links)||[]):(a.links||[]);
    const lk=pool.find(l=>l.id===el.dataset.lk);if(!lk)return;
    let v=el.value.trim();
    if(el.dataset.lkf==='url'&&v&&!/^(https?:|mailto:|file:)/i.test(v)){v='https://'+v;el.value=v;}
    lk[el.dataset.lkf]=v;
    const an=el.closest('.erow').querySelector('a.ib');
    if(an){an.href=lk.url||'#';an.classList.toggle('off',!lk.url);}
    save();return;
  }
  /* drawer arena fields */
  if(el.dataset.field&&drawer.id){
    const a=arena(drawer.id);if(!a)return;
    const v=el.value;
    if(el.dataset.field==='bknotes'){a.brokerage=a.brokerage||{notes:'',links:[]};a.brokerage.notes=v;}
    else if(el.dataset.field==='tags'){a.tags=cleanTags(v.split(','));el.value=a.tags.join(', ');}
    else a[el.dataset.field]=el.dataset.field==='name'?(v.trim()||'Unnamed arena'):v.trim();
    save();if(S.ui.view==='brokerage')renderWall();else renderBoard();
    if(el.dataset.field==='name'){const h=$('#aname');if(h)h.textContent=a.name;el.value=a.name;}
    return;
  }
  /* precision change inside date form */
  if(el.name==='gran'&&el.closest('.dform')){
    const f=el.closest('.dform');
    f.querySelector('.granIn').innerHTML=granInputsHTML(el.value,null);
    f.querySelector('.gradefld').innerHTML='<label>Certainty</label>'+gradeSegHTML(el.value,f.grade.value);
    return;
  }
  /* type rename */
  if(el.dataset.tyname){
    const t=S.types.find(t=>t.id===el.dataset.tyname);
    if(t&&el.value.trim()){t.name=el.value.trim();save();renderAll();}
    return;
  }
});

document.addEventListener('input',e=>{
  if(e.target.matches&&e.target.matches('textarea[data-field]'))autoGrow(e.target);
});
$('#search').addEventListener('input',()=>{S.ui.q=$('#search').value;searchChanged();});
$('#search').addEventListener('blur',()=>applySearchBox(false));
/* Escape empties the box and folds it away, and goes no further: it is the
   innermost thing open, so the drawer behind it stays as it was. */
$('#search').addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  e.stopPropagation();
  S.ui.q='';searchChanged();applySearchBox(false);$('#searchBtn').focus();
});
$('#quickText').addEventListener('input',()=>{
  const n=$('#quickText').value.split('\n').filter(l=>l.trim()).length;
  $('#quickPrev').textContent=n?n+' arena'+(n===1?'':'s')+' to create':'';
});
/* ───────── escape, and closing by clicking away ───────── */
/* Escape takes back exactly one thing — the innermost one — and then stops.
   It used to shut any open modal and, in the same press, also step the
   drawer behind it back or close it outright: one key, two undos, and the
   panel you were reading gone along with the box you had actually meant to
   dismiss. The order below is the order things stand in. */
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape'){
    if((e.key==='Enter'||e.key===' ')&&e.target.classList&&e.target.classList.contains('mk')){
      e.preventDefault();e.target.click();
    }
    return;
  }
  if(tdDrag){tdCancel();return;}                             /* a type or arena being dragged */
  if(colOpen){colOpen=null;typesShown();return;}             /* a colour menu */
  if(sortOpen){sortOpen=false;renderBoard();return;}         /* the board's order */
  if(Ask.isOpen()){Ask.shut();return;}                       /* the question */
  if(document.querySelector('.modal.open')){closeModals();return;}   /* a sheet */
  if(lkEdit.a||leadEdit.a||noteEdit.a||waitPick||pinEdit){  /* a composer */
    closeComposers();repaint();renderDrawer();return;
  }
  if(drawer.edit){drawer.edit=null;renderDrawer();return;}   /* a date form */
  if(drawer.editing){drawer.editing=false;renderDrawer();return;}  /* the edit face */
  if(drawer.id)closeDrawer();                                /* the panel itself */
});
document.querySelectorAll('.modal').forEach(m=>m.addEventListener('click',e=>{
  if(e.target!==m)return;
  /* a question is answered, not dismissed by looking away */
  if(m.id==='askModal')return;
  closeModals();
}));
$('#cardScrim').addEventListener('click',closeDrawer);

/* A card's middle scrolls once it holds more than its rung; the sill says so
   until there is nothing more under it. Caught on the wall rather than bound
   per card, because the cards are rebuilt on every change. */
$('#wall').addEventListener('scroll',e=>{
  const s=e.target;
  if(!s.classList||!s.classList.contains('wscroll'))return;
  s.classList.toggle('atend',s.scrollTop+s.clientHeight>=s.scrollHeight-2);
},true);

/* ───────── putting links in your own order ─────────
   A link on a card or in the panel is picked up and dropped higher or lower
   in its own list; the order is the arena's, so the card and the panel show
   the same one. Pressing without moving still opens the link, so the gesture
   needs nothing of its own on screen: with a mouse a row lifts once it has
   travelled a few pixels, and on the iPad, where a finger moving is the card
   scrolling, once it has been held still for a moment.

   Pointer capture, once the row is up, rather than the document's own move and up, because those
   are gated on this room being the one showing (hub.js) and the panel is
   also lent over the Ledger, where it is not. */
let lkDrag=null,lkSwallow=false;
const LK_HOLD=380,LK_SLOP=5;
/* every movement in the app stands down under reduced motion; the rows then
   simply change places */
const LK_MS=(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)?0:160;
document.addEventListener('pointerdown',e=>{
  if(e.button!==0||lkDrag)return;
  /* the pin and the cross are pressed, never dragged */
  if(e.target.closest&&e.target.closest('.wlc'))return;
  const row=e.target.closest&&e.target.closest('.wlrow[data-lk]');
  const list=row&&row.parentElement;
  if(!list||!list.matches('.wlinks[data-lks]')||list.children.length<2)return;
  const L=lkDrag={row,list,pid:e.pointerId,x:e.clientX,y:e.clientY,on:false,
    touch:e.pointerType!=='mouse',timer:0,grab:0,ty:0};
  row.addEventListener('pointermove',lkMove);
  row.addEventListener('pointerup',lkUp);
  row.addEventListener('pointercancel',lkCancel);
  row.addEventListener('touchmove',lkTouch,{passive:false});
  if(L.touch)L.timer=setTimeout(()=>{if(lkDrag===L&&!L.on)lkLift(L.y);},LK_HOLD);
});
/* a finger that is held still has to keep the card from scrolling once the
   row is up, and only a non-passive touchmove can say so — on the row itself,
   since the document's is gated the same way as its pointermove */
function lkTouch(e){if(lkDrag&&lkDrag.on)e.preventDefault();}
function lkLift(y){
  const L=lkDrag;if(!L)return;
  L.on=true;
  /* captured only once it is up: a captured press makes the browser send the
     click to the row instead of the link, and a plain press stopped opening */
  try{L.row.setPointerCapture(L.pid);}catch(err){}
  const top=L.list.getBoundingClientRect().top;
  L.grab=(y-top)-L.row.offsetTop;
  L.list.classList.add('lkdragging');
  L.row.classList.add('lkup');
  /* the open link it would have been is not wanted after a drag */
  lkSwallow=true;
}
function lkMove(e){
  const L=lkDrag;if(!L||e.pointerId!==L.pid)return;
  if(!L.on){
    const far=Math.abs(e.clientY-L.y)>LK_SLOP||Math.abs(e.clientX-L.x)>LK_SLOP;
    if(!far)return;
    if(L.touch){lkCancel();return;}             /* moved first: that is a scroll */
    lkLift(L.y);
  }
  e.preventDefault();
  const top=L.list.getBoundingClientRect().top;
  /* where the row's top should be — kept to its own list, so it cannot be
     carried up over the notes or down into the foot */
  const want=Math.max(0,Math.min((e.clientY-top)-L.grab,L.list.clientHeight-L.row.offsetHeight));
  const mid=want+L.row.offsetHeight/2;
  const sibs=[...L.list.children].filter(r=>r!==L.row);
  const ref=sibs.find(r=>mid<r.offsetTop+r.offsetHeight/2)||null;
  const cur=L.row.nextElementSibling;
  if(ref!==cur&&!(ref===null&&cur===null)){
    /* the rows it passes slide out of its way rather than jumping */
    const before=new Map(sibs.map(r=>[r,r.getBoundingClientRect().top]));
    L.list.insertBefore(L.row,ref);
    sibs.forEach(r=>{
      const d=before.get(r)-r.getBoundingClientRect().top;
      if(d){r.style.transition='none';r.style.transform='translateY('+d+'px)';}
    });
    void L.list.offsetWidth;                      /* one style pass, so the slide has a start */
    sibs.forEach(r=>{if(r.style.transform){r.style.transition='transform '+LK_MS+'ms cubic-bezier(0.65,0,0.35,1)';r.style.transform='';}});
  }
  L.ty=want-L.row.offsetTop;
  L.row.style.transform='translateY('+L.ty+'px)';
}
function lkEnd(){
  const L=lkDrag;if(!L)return null;
  clearTimeout(L.timer);
  L.row.removeEventListener('pointermove',lkMove);
  L.row.removeEventListener('pointerup',lkUp);
  L.row.removeEventListener('pointercancel',lkCancel);
  L.row.removeEventListener('touchmove',lkTouch,{passive:false});
  try{L.row.releasePointerCapture(L.pid);}catch(err){}
  lkDrag=null;
  return L;
}
function lkCancel(){
  const L=lkEnd();if(!L)return;
  L.row.style.transform='';L.row.classList.remove('lkup');L.list.classList.remove('lkdragging');
  lkSwallow=false;
}
function lkUp(e){
  const L=lkEnd();if(!L||!L.on)return;
  /* settle into its slot, then write the order down */
  L.row.style.transition='transform '+LK_MS+'ms cubic-bezier(0.65,0,0.35,1)';
  L.row.style.transform='';
  setTimeout(()=>{
    L.row.style.transition='';L.row.classList.remove('lkup');L.list.classList.remove('lkdragging');
    const arr=linkList(arena(L.list.dataset.a),L.list.dataset.lks);
    if(!arr)return;
    /* A card leaves its pinned links out, so the rows on screen can be fewer
       than the list. The ones shown are dealt back into the places the shown
       ones held, and a pinned link keeps its own place among them. */
    const ids=[...L.list.children].map(r=>r.dataset.lk);
    const shown=new Set(ids);
    const slots=[];arr.forEach((l,k)=>{if(shown.has(l.id))slots.push(k);});
    const byId=new Map(arr.map(l=>[l.id,l]));
    ids.forEach((id,k)=>{if(byId.has(id)&&k<slots.length)arr[slots[k]]=byId.get(id);});
    save();
    /* the list it was dropped in is already right; the other place that shows
       it — the card under the panel, or the panel over the card — is redrawn */
    if(L.list.closest('#card'))repaint();else renderDrawer();
  },LK_MS);
  /* the click the release would make lands after this; a stray swallow left
     over from a release that made none is cleared on the next press */
  setTimeout(()=>{lkSwallow=false;},LK_MS+400);
}
document.addEventListener('click',e=>{
  if(!lkSwallow)return;
  if(e.target.closest&&e.target.closest('.wlrow')){e.preventDefault();e.stopPropagation();}
  lkSwallow=false;
},true);

renderAll();
/* The bridge, which holds the one connection this app has, is loaded after
   every room and the Supabase library after that. So a board that opens on
   this view asks for its findings a moment later rather than at mount, when
   there would be nothing to ask. */
if(S.ui.view==='dispatch')setTimeout(loadFinds,800);
/* The same wait for the asks to the agent, and again whenever the room is
   come back to — the agent works at night, and the app is often left open. */
setTimeout(settleAsks,1500);
if(typeof Hub!=='undefined'&&Hub.onRoom)Hub.onRoom(now=>{if(now==='semaphore')settleAsks();});


try{
  /* save() is Semaphore's single write path; wrapping it is how the cloud
     hears about a change without the app being told a cloud exists. */
  var __semSave = save;
  save = function(){
    __semSave.apply(this, arguments);
    try{ Hub.emit('semaphore:saved'); }catch(e){}
  };
  Hub.expose('semaphore',{
    state:      function(){ return S; },
    save:       function(){ return save(); },
    renderAll:  (typeof renderAll==='function')?renderAll:null,
    /* the open leads, read fresh, and the one way to change one — see
       "leads, lent to the Ledger's board" */
    leads:      function(){ return leadsForBoard(); },
    leadVerb:   function(aid,lid,op,val){ return leadVerb(aid,lid,op,val); },
    arenas:     function(){ return arenasForBoard(); },
    leadAdd:    function(aid,v){ return leadAdd(aid,v); },
    openArena:  function(aid){ if(arena(aid))openDrawer(aid); },
    /* Escape, for when the drawer is lent to another room and this room's
       own key handler is not the one listening: the innermost thing first,
       as that handler does. */
    escape:     function(){
      if(Ask.isOpen())Ask.shut();
      else if(document.querySelector('.modal.open'))closeModals();
      else closeDrawer();
    },
    applyState: function(obj){
      S = (typeof migrate==='function') ? migrate(obj) : obj;
      /* A whole board handed over is the recovery the refusal to save was
         waiting for. Left set, the new board was drawn over by the old
         error and never written, so the cloud or a file could not mend a
         board that would not read — only a reload could, and that read the
         same broken text again. */
      loadError = null;
      if(!S.ui && typeof blank==='function') S.ui = blank().ui;
      __semSave();
      if(typeof renderAll==='function') renderAll();
    }
  });
}catch(e){}
});
