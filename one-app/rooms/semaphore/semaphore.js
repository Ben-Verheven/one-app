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
   the work you are in to the work you have put away. Since the Marketplace
   (2026-10-14) it is the venues serving the arena that it quickens or slows
   (see vEvery), the rotation of arenas having gone. */
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
  central:   {name:'Central',   turn:.6,lift:1, long:'Work you are actually in. Its venues come round about twice as often.'},
  ordinary:  {name:'Ordinary',  turn:1, lift:.5,long:'Its venues come round at their own pace.'},
  peripheral:{name:'Peripheral',turn:3, lift:0, long:'Watched out of diligence. Its venues come round about a third as often.'}
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
/* How wide the board's column of names is, once dragged by its edge (Mark,
   2026-10-14), so a long arena name can be read whole; null until then, and
   the stylesheet's own width stands. */
const NAME_MIN=140,NAME_MAX=560;
function blank(){
  return {v:1,types:defaultTypes(),arenas:[],venues:[],
    ui:{q:'',collapsed:{},view:'now',
        boardSort:'date',nameW:null,freezerOpen:false,nowTab:'active',keptOpen:false,shOpen:{}}};
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
       as well. Mark took the whole card's pin away on 2026-10-11, and Pinned
       itself with the links' pins on 2026-10-12, so every `pin` is dropped
       here and a link that stood on Pinned is back on its card. */
    delete a.pin;
    a.brokerage.links.forEach(l=>{if(!l.id)l.id=uid();delete l.pin;});
    (a.links||[]).forEach(l=>{delete l.pin;});
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
  /* the events and tools, wherever they still stand on an arena, become
     venues (see "venues") */
  absorbVenues(s);
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
    /* Now, the Board, Leads and Dispatches since the Marketplace
       (2026-10-14). The Rotation and Coming up went with it and land on
       Now; Leads was the wall in its leads arrangement until then. */
    ui.view     = ['now','board','leads','dispatch'].includes(u.view) ? u.view
                : u.view==='brokerage'&&u.wallSort==='leads' ? 'leads' : 'now';
    /* the board's two orders since 2026-10-11 (see "the board's two orders");
       the two it had before — next publication, and by status — both read as
       the date order, which took their place */
    ui.boardSort = u.boardSort==='mine' ? 'mine' : 'date';
    ui.nameW = Number.isFinite(u.nameW) ? Math.min(NAME_MAX,Math.max(NAME_MIN,Math.round(u.nameW))) : null;
    ui.freezerOpen = u.freezerOpen===true;
    /* which of Venues' tabs is showing (Mark, 2026-10-15): the three
       sections or Limbo; the Events and Tools of the Now page before land
       on Active */
    ui.nowTab = ['arising','active','dying','over'].includes(u.nowTab) ? u.nowTab : 'active';
    /* whether the board's tray lists what is kept on the board as well */
    ui.keptOpen = u.keptOpen===true;
    /* which shared venues on the board are unfolded to show their arenas */
    ui.shOpen = map(u.shOpen) || {};
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
/* ============ venues ============
   The Marketplace is kept around the places Mark goes to look for projects
   and partners: a brokerage event's marketplace, a partner-search tool
   (Mark, 2026-10-14, when the Semaphore became the Marketplace). Until then
   the room was kept around the arenas, and what he actually visited was
   scattered over it: an event was one day among an arena's dates, a tool
   was one brokerage link among many, and the same partner search stood on
   seven arenas as seven links. Stamps already belonged to the site rather
   than the link (siteKey), and removing an event took its links off every
   card, both because the venue was the real thing all along.

   A venue is any place of that kind, active for a while (Mark, 2026-10-15:
   "drop the distinction between tools and events, they are all just
   venues"). It has a window of activity, `opens` to `closes`, which he sets
   by dragging its two ends on the board or on Venues, and it may have event
   days (`gran`/`start`/`end`/`grade`), the meeting days activity clusters
   round, drawn as diamonds inside the window. A venue serves one arena or
   several, and is listed once. It has a rhythm, how often it wants a visit,
   and a record of the visits, each one answering "anything?": leads that
   start from it say so (`venueId`), so a venue can show what it has given.

   Where it stands is `place` (Mark, 2026-10-15). Everything lands on the
   board first: what the agent finds is `new`, glowing there until he does
   something with it; he moves it to Venues (`venues`), keeps it on the
   board to think about (`board`), or removes it (`gone`). A removed venue
   stays in the list as a stub with its name, site and arenas, hidden
   everywhere, so the agent can see it was turned down and does not bring
   it back; a stub is dropped after a year and a bit. A venue in Venues is
   still drawn on the board.

   It is kept in `S.venues`, beside the arenas, and a visit's id is its day,
   so the same visit made on the desk and the iPad is one visit when the two
   copies are put together. */
const RHYTHM={meeting:2,active:4,dying:7,standing:21};   /* days between visits, by where a venue stands */
const SPOT_MAX=14;          /* event days run at most two weeks; a longer exact span is the window itself */
const LEAD_IN=21,TAIL=14;   /* the window event days are given until Mark drags it: three weeks before, two after */
const DYING_MAX=21;         /* a window with no event days in it is dying for its last three weeks, or last third */
const NOW_BACK=28,NOW_AHEAD=84;   /* the Venues page's strip: four weeks back, twelve ahead (Mark chose the strip of time) */
const VGOT={nothing:'nothing new',something:'something',lead:'a lead'};
const PLACES=['new','board','venues','gone'];
const GONE_KEEP=400;        /* days a removed venue's stub is kept for the agent to see */
/* Every venue on the board when places began went to Venues, where Mark had
   them. One that arrives later without a place came from the agent through
   a gatekeeper that does not know of places yet, which marks what it adds
   with `foundAt`, so a venue found after this moment is new on the board.
   The same rule on every device, so two copies agree without asking. */
const PLACES_SINCE='2026-10-15T19:00:00Z';

/* A short fixed name for a site, so the venue a tool link becomes has the
   same id on every device that turns it into one: two devices each making
   it with an id of its own would have put two copies of it on the board
   when their copies were put together. */
function hashKey(s){
  let h=0x811c9dc5;
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193);}
  return (h>>>0).toString(36);
}
const ISO_DAY=/^\d{4}-\d{2}-\d{2}$/;
function tidyVenue(v){
  if(!v.id)v.id=uid();
  /* A tool was always open; as a venue it is one whose window opened when it
     was first visited or found, and has no end yet. `kind` stays on every
     venue, always 'event', because the gatekeeper's copy of this function
     and an older Pocket wipe a tool's window on every write they make. */
  if(v.kind==='tool'){
    const first=(Array.isArray(v.visits)?v.visits:[]).map(x=>x&&(x.at||x.id)).filter(x=>ISO_DAY.test(x||'')).sort()[0];
    const found=typeof v.foundAt==='string'?v.foundAt.slice(0,10):'';
    if(!ISO_DAY.test(v.opens||''))v.opens=first||(ISO_DAY.test(found)?found:todayISO());
    v.gran='none';
  }
  v.kind='event';
  if(!PLACES.includes(v.place))v.place=typeof v.foundAt==='string'&&v.foundAt>=PLACES_SINCE?'new':'venues';
  if(v.place==='gone'){if(!ISO_DAY.test(v.goneAt||''))v.goneAt=todayISO();}else delete v.goneAt;
  v.name=String(v.name==null?'':v.name).trim()||'Unnamed venue';
  v.url=typeof v.url==='string'?v.url.trim():'';
  v.arenas=[...new Set((Array.isArray(v.arenas)?v.arenas:[]).filter(x=>typeof x==='string'&&x))];
  if(!Array.isArray(v.pages))v.pages=[];
  v.pages=v.pages.filter(p=>p&&typeof p==='object'&&p.url);
  v.pages.forEach(p=>{if(!p.id)p.id=uid();if(typeof p.label!=='string')p.label='';});
  /* one visit a day, its id the day itself */
  const seen=new Set();
  v.visits=(Array.isArray(v.visits)?v.visits:[]).filter(x=>x&&ISO_DAY.test(x.at||x.id||'')).map(x=>{
    const at=x.at||x.id;const o={id:at,at};
    if(VGOT[x.got])o.got=x.got;
    if(typeof x.text==='string'&&x.text.trim())o.text=x.text.trim();
    if(typeof x.leadId==='string'&&x.leadId)o.leadId=x.leadId;
    return o;
  }).filter(x=>!seen.has(x.at)&&seen.add(x.at)).sort((x,y)=>x.at.localeCompare(y.at));
  if(!['day','month','quarter','half','year','range','none'].includes(v.gran))
    v.gran=v.start?((v.end&&v.start!==v.end)?'range':'day'):'none';
  if(!v.start||v.gran==='none'){v.start=null;v.end=null;if(v.gran!=='none')v.gran='none';}
  if(v.start&&!v.end)v.end=v.start;
  if(v.start&&v.end<v.start){const e=v.end;v.end=v.start;v.start=e;}
  v.grade=v.grade==='fixed'&&gradeOptions(v.gran).includes('fixed')?'fixed':'uncertain';
  ['opens','closes'].forEach(k=>{if(!ISO_DAY.test(v[k]||''))v[k]=null;});
  if(v.opens&&v.closes&&v.closes<v.opens){const c=v.closes;v.closes=v.opens;v.opens=c;}
  if(!(v.every>=1&&v.every<=365))delete v.every;else v.every=Math.round(v.every);
  if(typeof v.note!=='string')v.note='';
  if(typeof v.memo==='string'&&!v.memo.trim())delete v.memo;
  /* his own place for it within its group on Venues (see "dragging a
     venue into place") */
  if(!Number.isFinite(v.vpos))delete v.vpos;
  /* the section of Venues Mark put it in by hand, if he did (see vPhase) */
  if(!['arising','active','dying','over'].includes(v.phase))delete v.phase;
  /* The agent's doubt, a ? on a venue it was unsure of, went the evening it
     came (Mark, 2026-10-15): everything it finds now waits on the board for
     him to judge, so there is nothing left for it to be unsure on his behalf. */
  delete v.doubt;
  return v;
}
function joinVenue(v,aid){if(aid&&!v.arenas.includes(aid))v.arenas.push(aid);}
/* the stamps an event or a link carried become visits */
function takeStamps(v,x){
  for(const at of [x.stampPrev,x.stampedAt])
    if(at&&ISO_DAY.test(at)&&!v.visits.some(y=>y.at===at))v.visits.push({id:at,at});
  v.visits.sort((p,q)=>p.at.localeCompare(q.at));
}
/* Everything the room used to keep about events and tools is turned into
   venues here, on every read of the board and not once: Pocket, an older
   copy of the desk and the agent's Dispatches can all still put a
   brokerage date or link on an arena, and each is taken in the moment it
   arrives. A brokerage date becomes an event venue under its own id, or
   joins the event already standing at the same site on the same day. The
   general tool, and every brokerage link that was ever stamped, becomes a
   tool venue. Any other brokerage link to a venue's site joins that venue,
   adding its arena, so GREENET's seven links become one venue serving
   seven arenas. The links left over are background, as the agent finds
   them: info pages, last year's "basis" pages. */
function absorbVenues(s){
  if(!Array.isArray(s.venues))s.venues=[];
  s.venues=s.venues.filter(v=>v&&typeof v==='object').map(tidyVenue);
  const byId=new Map(s.venues.map(v=>[v.id,v])),bySite=new Map();
  for(const v of s.venues){const k=v.url&&siteKey(v.url);if(k&&!bySite.has(k))bySite.set(k,v);}
  const add=v=>{s.venues.push(v);byId.set(v.id,v);const k=v.url&&siteKey(v.url);if(k&&!bySite.has(k))bySite.set(k,v);};
  for(const a of s.arenas){
    const keep=[];
    for(const d of a.dates||[]){
      if(d.kind==='call'){keep.push(d);continue;}
      const k=d.url&&siteKey(d.url);
      let v=byId.get(d.id)||null;
      if(!v&&k){const w=bySite.get(k);if(w&&w.kind==='event'&&w.start===d.start)v=w;}
      if(v){joinVenue(v,a.id);takeStamps(v,d);if(!v.memo&&d.memo)v.memo=d.memo;continue;}
      v=tidyVenue({id:d.id,kind:'event',name:d.label||'',url:d.url||'',arenas:[a.id],
        gran:d.gran,start:d.start,end:d.end,grade:d.grade,opens:null,closes:null,
        note:d.note||'',memo:d.memo,visits:[],pages:[]});
      if(d.foundAt)v.foundAt=d.foundAt;
      takeStamps(v,d);add(v);
    }
    a.dates=keep;
  }
  for(const a of s.arenas){
    const bk=a.brokerage;if(!bk||!Array.isArray(bk.links))continue;
    const keep=[];
    for(const l of bk.links){
      const k=l.url&&!/^mailto:/i.test(l.url)&&siteKey(l.url);
      let v=k?bySite.get(k):null;
      if(!v&&k&&(a.toolId===l.id||l.stampedAt)){
        const id='vt'+hashKey(k);
        v=byId.get(id)||null;
        if(!v){v=tidyVenue({id,kind:'tool',name:l.label||linkHost(l)||k,url:l.url,arenas:[],note:'',visits:[],pages:[]});
          if(l.foundAt)v.foundAt=l.foundAt;add(v);}
      }
      if(!v){keep.push(l);continue;}
      joinVenue(v,a.id);takeStamps(v,l);
      if(!v.url)v.url=l.url;
      else if(linkKey(l.url)!==linkKey(v.url)&&!v.pages.some(p=>linkKey(p.url)===linkKey(l.url)))
        v.pages.push({id:l.id,label:l.label||'',url:l.url});
    }
    bk.links=keep;
    delete a.toolId;
  }
  const now=T(todayISO());
  s.venues=s.venues.filter(v=>v.place!=='gone'||now-T(v.goneAt)<=GONE_KEEP*DAY);
  return s;
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
   unrelated links turn out to share a stamp, or a venue: the Estonian
   research council's proposals site carries three partnerships' partner
   searches side by side, and the Polish centres' sites several more
   (found when the Marketplace made venues of them, 2026-10-14). */
const SHARED_HOSTS=/^(?:b2match\.(?:io|com|eu)|(?:.+\.)?(?:europa\.eu|google\.com|linkedin\.com|youtube\.com|github\.com|eventbrite\.[a-z.]+|meetup\.com|lu\.ma|zoom\.us|microsoft\.com|sharepoint\.com|gov\.pl|horizoneuropencpportal\.eu|eurekanetwork\.org)|proposals\.etag\.ee)$/;
function siteKey(u){
  const k=linkKey(u),i=k.indexOf('/');
  const host=(i<0?k:k.slice(0,i)).replace(/:\d+$/,'');
  if(!SHARED_HOSTS.test(host))return host;
  const segs=(i<0?'':k.slice(i+1)).split('/').filter(x=>x&&!/^[a-z]{2}(?:[-_][a-z]{2})?$/.test(x));
  const e=segs.findIndex(x=>/^(?:e|event|events)$/.test(x));
  return [host].concat(e>=0&&segs[e+1]?segs.slice(0,e+2):segs).join('/');
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
  save();repaint();applyView();
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

   The venues are drawn first and largest, because they are what the room is
   for: each its window, shaded by how much goes on in it, its event days as
   diamonds, its name inside the band or after it, in the colour of where it
   stands — new, kept on the board, or in Venues (see "a venue's window,
   drawn"). Each venue has a track of its own wherever it would touch
   another, its name included, so nothing on a row overlaps and a row
   grows a track rather than piling one mark on another (Mark, 2026-10-15:
   "make sure the board does not get cluttered"). A venue not dated yet is a
   small chip, the chips side by side from today's line.

   Calls are drawn the way the cards drew them (see callRuns): one bar from
   publication to deadline under the venues, the stages of one call as one
   bar with a notch, strong only up to the first deadline, and calls with
   the same dates as one bar. Uncertain is
   a dashed outline here as everywhere else in the room: a blurred 4px bar
   only looks out of focus (Mark, 2026-10-07).

   Whatever is over is grey — a closed call, a window gone by — so the
   colour on a row is what still lies ahead of it. */
const TRACK_H=19,LABEL_CH=6.3;     /* a venue's track, and the width of one letter of its name, in pixels */
let laneW=1000;                    /* the lanes' width in pixels, measured as the board is drawn */
const labelPx=v=>Math.min(v.name.length,38)*LABEL_CH+(v.place==='new'?34:0)+12;
function venueLabel(v,indent){
  const nm=v.name.length>38?v.name.slice(0,37)+'…':v.name;
  return '<span class="vbl"'+(indent?' style="padding-left:'+Math.round(indent)+'px"':'')+'>'+
    (v.place==='new'?'<b class="newtag">new</b>':'')+esc(nm)+'</span>';
}
/* The venues of one row packed into tracks: a band where it touches
   nothing, its name inside or after it; a thin quiet line for one already in
   Venues (`quietOk`), which needs no room for a name and packs tighter; the
   undated as chips from today's line. Returns the markup and the height. */
function venueTracks(vs,quietOk){
  let h='';
  const now=T(todayISO());
  const px=t=>X(t)/100*laneW;
  const items=[],chips=[];
  for(const v of vs){
    const w=vWin(v);
    if(!w){chips.push(v);continue;}
    const from=w.from===null?T0:Math.max(T0,w.from);
    const to=w.to===null?Math.min(T1,Math.max(now,w.from===null?now:w.from)+OPEN_RUN*DAY):Math.min(T1,w.to+DAY);
    if(to<T0||from>T1)continue;
    const L=px(from),R=px(to),run=w.to===null?16:0;
    if(quietOk&&v.place==='venues'){items.push({v,L,R,run,quiet:true,end:R+run});continue;}
    const lp=labelPx(v);
    /* a name inside the band starts clear of its first diamond */
    const at=w.ms!==null&&px(w.ms)<R?Math.max(L,px(w.ms+DAY)+8):L;
    const inside=R-at>=lp+8;
    items.push({v,L,R,run,inside,indent:at-L,end:(inside?R:Math.min(laneW,R+lp+6))+run});
  }
  items.sort((x,y)=>x.L-y.L||x.end-y.end);
  const tracks=[];
  for(const it of items){
    let k=0;while(k<tracks.length&&tracks[k].end+6>it.L)k++;
    tracks[k]={end:it.end,full:(tracks[k]&&tracks[k].full)||!it.quiet};it.k=k;
  }
  const tops=[];let y=5;
  tracks.forEach((t,k)=>{const th=t.full?TRACK_H:12;tops[k]=y+th/2;y+=th;});
  for(const it of items){
    const top=Math.round(tops[it.k]);
    h+=bandHTML(it.v,T0,T1,top,it.inside?venueLabel(it.v,it.indent+6):'',it.quiet);
    if(!it.quiet&&!it.inside)h+='<span class="vbl out st-'+it.v.place+'" style="top:'+top+'px;left:calc('+(it.R/laneW*100).toFixed(2)+'% + '+it.run+'px)">'+venueLabel(it.v)+'</span>';
  }
  if(chips.length){
    const top=Math.round(y+TRACK_H/2);let x=Math.max(0,px(now)+6);
    for(const v of chips){
      h+='<button class="vchip st-'+v.place+'" style="top:'+top+'px;left:'+(x/laneW*100).toFixed(2)+'%" data-act="openVenue" data-v="'+v.id+'" data-tipv="'+v.id+'">'+
        venueLabel(v)+'<i>not dated</i></button>';
      x+=labelPx(v)+70;
    }
    y+=TRACK_H;
  }
  return {h,height:y};
}
function laneHTML(a,vs){
  const now=T(todayISO());
  const vt=venueTracks(vs,true);
  let h=vt.h;
  /* the calls, under the venues. Where two bars overlap, a bar takes the
     lowest level whose previous occupant has already cleared, with daylight
     between them, three levels at most. The floor never moves, so the
     earliest call in every lane sits on one baseline across the whole
     board. A call with no publication recorded comes in faded from three
     weeks before its first deadline, so every stage of it lies on the bar
     as a notch: from the last, BiodivFuture's pre-proposal deadline in
     November fell off the board and only April's showed (2026-10-15). One
     with no deadline runs out faded five weeks past its publication. */
  let callH=0;
  {
    const gap=(T1-T0)*.015,freeAt=[],placed=[];
    const items=callRuns(a).all
      .map(r=>({r,s:r.open?T(r.open.start):T((r.dls[0]||r.close).start)-21*DAY,
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
    callH=placed.length?Y[Y.length-1]+8:0;
    for(const{it,lv}of placed){
      const r=it.r,L=Math.max(0,X(it.s)),R=Math.min(100,X(it.e)),W=Math.max(R-L,.3);
      /* A call with a date or stage that is new (see "what the agents
         brought") wears the new colour on the board itself, glowing, until
         Mark marks the arena seen: inside the arena's panel alone it was
         missed, which he found when an import was to bring a season of new
         call dates at once (2026-10-17). */
      const fr=[r.open,r.close].concat(r.dls).some(d=>d&&isFresh(a,d))?' fresh':'';
      /* the earlier deadlines stand beside the bar, not in it: a faded end
         is a mask, and a mask cuts whatever is inside the bar to its height */
      const notch=r.dls.slice(0,-1).map(d=>{const x=X(T(d.start)+DAY/2);
        return x>=L&&x<=R?'<i class="rbn'+(T(d.end||d.start)<now?' past':'')+(isFresh(a,d)?' fresh':'')+'" style="left:'+x.toFixed(2)+'%;bottom:'+(Y[lv]-4)+'px" '+
          'data-act="openDate" data-a="'+a.id+'" data-d="'+d.id+'" title="'+esc(dtLabel(d)+' \u2014 '+dispDate(d))+'"></i>':'';}).join('');
      const at=r.next||r.close||r.open;
      const attrs='data-act="openDate" data-a="'+a.id+'" data-d="'+at.id+'" data-tipt="'+esc(runTip(r))+'" '+
         'tabindex="0" role="button" aria-label="'+esc(dtLabel(at)+', '+dispDate(at))+'"';
      /* A call in stages is full strength only from its publication to its
         first deadline, the pre-proposal or first stage, and a thin line on
         to the last: the weeks before the first deadline are when consortia
         form and brokerage can still do something, and after it the work is
         in the hands of whoever got through (Mark, 2026-10-16). The strong
         part greys once that first deadline is past, as anything over does,
         while the line to the full proposal keeps its colour until it too
         is over. */
      const d1=r.dls.length>1?r.dls[0]:null;
      if(d1){
        const t1=T(d1.end||d1.start),S=Math.min(100,Math.max(0,X(t1+DAY)));
        if(S>L){
          const cls=(t1<now?' past':'')+([r.open,d1].some(d=>d&&d.grade!=='fixed')?' unc':'')+(r.open?'':' lead-in')+fr;
          h+='<div class="mk cl rb'+cls+'" style="left:'+L.toFixed(2)+'%;width:'+Math.max(S-L,.3).toFixed(2)+'%;bottom:'+Y[lv]+'px" '+attrs+'></div>';
        }
        if(R>S){
          const cls=(r.state==='closed'?' past':'')+(r.close.grade!=='fixed'?' unc':'')+fr;
          h+='<div class="mk cl rbt'+cls+'" style="left:'+S.toFixed(2)+'%;width:'+(R-S).toFixed(2)+'%;bottom:'+(Y[lv]+1)+'px" '+attrs+'></div>';
        }
        h+=notch;continue;
      }
      const cls=(r.state==='closed'?' past':'')+(r.unc?' unc':'')+(r.open?'':' lead-in')+(r.close?'':' run-on')+fr;
      h+='<div class="mk cl rb'+cls+'" style="left:'+L.toFixed(2)+'%;width:'+W.toFixed(2)+'%;bottom:'+Y[lv]+'px" '+attrs+'></div>'+notch;
    }
  }
  if(now>=T0&&now<=T1)h+='<div class="now" style="left:'+X(now)+'%"></div>';
  return {h,height:Math.max(36,Math.max(vt.height,4)+callH+4)};
}
/* ───────── the board's two orders ─────────
   Mark chooses between two, from the heading over the column beside the
   names (2026-10-11), and each group of the board follows it:
   MINE   his own order of the arenas within a type, set by dragging in the
          list of types, kept on each arena as `bkPos`.
   DATE   whatever comes first: the soonest deadline, call opening or
          venue's event days still to come, so the arena with the nearest
          thing to act on stands at the top. A brokerage entry spanning more
          than about six weeks is a season pencilled in, not an event, and
          does not count. An arena with nothing coming goes
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
  for(const v of venuesOf(a)){
    const w=vWin(v);
    if(w&&w.ms!==null&&w.me>=now)best=Math.min(best,Math.max(now,w.ms));
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
                   date:{name:'By date',long:'Soonest first: the nearest deadline, call opening or event days'}};
let sortOpen=false;
/* An arena's venues without event days, for the old findings Dispatches may
   still hold that offered an arena its general tool (see takeFind); the
   diamond the tools stood as against the names went when tools became
   venues with windows of their own (2026-10-15). */
function arenaTools(a){return venuesOf(a).filter(v=>!v.start);}
/* The board stays a picture of the calendar. A dot after an arena's name
   says one of its venues is new, so a folded group or a long row still
   shows where the agent has been; new dates and links say how many after
   the name, in the new colour, with the tick that marks them seen. */
function freshPill(a){
  const n=freshItems(a).length;
  return n?'<button class="freshn" data-act="seenArena" data-id="'+a.id+'" title="'+n+' new date'+(n===1?'':'s')+
    ' or link'+(n===1?'':'s')+' on '+esc(a.name)+', glowing on the board \u2014 press when you have seen '+(n===1?'it':'them')+'">'+
    n+' new <span aria-hidden="true">\u2713</span></button>':'';
}
function boardRow(a,bg){
  const looms=a.dates.filter(d=>!d.start);
  const loomBtn=looms.length?
    '<button class="loom" data-act="openArena" data-id="'+a.id+'" data-tipl="1"><i class="sw sw-uncertain"></i>'+looms.length+'</button>':'';
  const all=venuesOf(a).filter(v=>!inLimbo(v)),shared=all.filter(isShared),own=all.filter(v=>!isShared(v));
  const fresh=own.some(v=>v.place==='new');
  const lane=laneHTML(a,own);
  const shTag=shared.length?'<span class="shtag" title="Also served by, under Shared venues at the top: '+esc(shared.map(v=>v.name).join(', '))+'">+'+shared.length+' shared</span>':'';
  /* The column beside the names that said Open / Opens / Between went on
     2026-10-11 (Mark): the calendar beside the name says it already. */
  return '<div class="row"><div class="cell name">'+
    '<button class="nm'+weightClass(a)+'" data-act="openArena" data-id="'+a.id+'">'+esc(a.name)+'</button>'+
    (fresh?'<i class="newdot" title="Something new from the agent on this row"></i>':'')+freshPill(a)+loomBtn+shTag+
    '</div>'+
    '<div class="lane" style="height:'+lane.height+'px;background-image:'+bg+'" data-aid="'+a.id+'" data-t0="'+T0+'" data-t1="'+T1+'">'+lane.h+'</div></div>';
}
/* ───────── the shared venues ─────────
   A venue serving two arenas or more stands once, in a group of its own at
   the top of the board, the arenas it serves under its name in their types'
   colours as Venues shows them; an arena's row keeps its own venues and
   says "+2 shared" after its name (Mark, 2026-10-15). Drawn on every row it
   served, one partner search stood seven times over the partnerships, as
   loud each time, and nothing said the seven were one. Here it is a full
   band in the colour of where it stands, since the row is its alone. An
   arena in the freezer does not count. */
function isShared(v){return v.arenas.filter(id=>{const a=arena(id);return a&&!a.frozenAt;}).length>1;}
/* Each shared venue is one line, folded (Mark, 2026-10-15): its name, how
   many arenas it serves, and its window drawn as on the arena rows, thin
   once it is in Venues. Unfolded by its caret, the arenas stand under it
   one to a line, each with its own calls drawn as on its own row, held to
   the venue by a rule down the left and the venue's window shaded faintly
   behind them, its event days a line through them, so a call can be read
   against the event. The tags under the name, two to a line, did not
   line up with anything. */
function sharedRows(bg){
  const vs=visibleVenues().filter(v=>isShared(v)&&!inLimbo(v));
  if(!vs.length)return '';
  const by=v=>{const w=vWin(v);return w&&w.from!==null?w.from:w?-1e15:1e15;};
  vs.sort((x,y)=>by(x)-by(y)||x.name.localeCompare(y.name));
  const col=!!S.ui.collapsed.shared,fresh=vs.some(v=>v.place==='new');
  const now=T(todayISO()),nowLine=now>=T0&&now<=T1?'<div class="now" style="left:'+X(now)+'%"></div>':'';
  const tyAt=new Map(S.types.map((t,i)=>[t.id,i]));
  let h='<div class="grp shgrp'+(col?' collapsed':'')+'"><div class="ghead"><div class="gc">'+
    '<button class="caret" data-act="toggleGroup" data-id="shared" aria-label="Collapse group">'+(col?'\u25B8':'\u25BE')+'</button>'+
    '<span class="gname">Shared venues</span><span class="gcount">'+vs.length+'</span>'+
    (fresh?'<i class="newdot" title="Something new from the agent here"></i>':'')+'</div></div>';
  if(col)return h+'</div>';
  for(const v of vs){
    const open=!!S.ui.shOpen[v.id];
    const as=venueArenas(v).filter(a=>!a.frozenAt)
      .sort((x,y)=>(tyAt.has(x.typeId)?tyAt.get(x.typeId):99)-(tyAt.has(y.typeId)?tyAt.get(y.typeId):99)||boardOrder()(x,y));
    const vt=venueTracks([v],true);
    h+='<div class="shblock'+(open?' open':'')+' st-'+v.place+'"><div class="row shrow"><div class="cell name">'+
      '<button class="shcar" data-act="shOpen" data-v="'+v.id+'" aria-expanded="'+open+'" title="'+(open?'Fold the arenas away':'Show the arenas it serves, with their calls')+'">'+(open?'\u25BE':'\u25B8')+'</button>'+
      vGlyph(v)+'<button class="nm" data-act="openVenue" data-v="'+v.id+'" title="'+esc(v.name)+'">'+esc(v.name)+'</button>'+
      (v.place==='new'?'<i class="newdot"></i>':'')+
      '<span class="shtag" title="'+esc(as.map(a=>a.name).join(', '))+'">'+as.length+' arenas</span></div>'+
      '<div class="lane" style="height:'+Math.max(36,vt.height)+'px;background-image:'+bg+'" data-t0="'+T0+'" data-t1="'+T1+'">'+vt.h+nowLine+'</div></div>';
    if(open){
      const w=vWin(v);
      let shade='';
      if(w){
        const a=w.from===null?T0:Math.max(T0,w.from),b=w.to===null?Math.min(T1,Math.max(now,w.from===null?now:w.from)+OPEN_RUN*DAY):Math.min(T1,w.to+DAY);
        if(b>T0&&a<T1)shade='<i class="shwin" style="left:'+X(a).toFixed(2)+'%;width:'+(X(b)-X(a)).toFixed(2)+'%"></i>';
        if(w.ms!==null)shade+='<i class="shday" style="left:'+X(w.ms+DAY/2).toFixed(2)+'%"></i>';
      }
      for(const a of as){
        const ln=laneHTML(a,[]),tone=arenaTone(a);
        h+='<div class="row shsub"><div class="cell name">'+
          '<button class="cuat'+(tone?' toned':'')+'" data-act="openArena" data-id="'+a.id+'"'+(tone?' style="--tone:'+esc(tone)+'"':'')+' title="'+esc(a.name)+'">'+esc(a.name)+'</button>'+freshPill(a)+'</div>'+
          '<div class="lane" style="height:'+ln.height+'px;background-image:'+bg+'" data-t0="'+T0+'" data-t1="'+T1+'">'+shade+ln.h+'</div></div>';
      }
    }
    h+='</div>';
  }
  return h+'</div>';
}
/* ───────── the tray ─────────
   Everything the agent finds lands on the board first, and stays marked new
   until Mark does something with it (2026-10-15). Over the board stands a
   tray listing what is new, each with the three things to do with it, so
   none is missed in a long board; it goes when there is nothing new. Under
   it, folded, what he kept on the board to think about. A new arena the
   agent suggests still waits in Dispatches, and the tray points there. */
function trayRow(v){
  const as=venueArenas(v).map(a=>a.name).join(', ');
  return '<div class="trow st-'+v.place+'">'+vGlyph(v)+
    '<button class="tnm" data-act="openVenue" data-v="'+v.id+'" title="Open '+esc(v.name)+'">'+esc(v.name)+'</button>'+
    '<span class="tar" title="'+esc(as)+'">'+esc(as||'no arena')+'</span>'+
    '<span class="twhen">'+esc(vDateSay(v))+'</span>'+
    '<span class="tact">'+(v.url?'<a class="tgo" href="'+esc(v.url)+'" target="_blank" rel="noopener" data-act="vGo" data-v="'+v.id+'" title="'+esc(v.url)+'">site ↗</a>':'')+
      '<button class="btn primary" data-act="vPlace" data-v="'+v.id+'" data-p="venues" title="Move it to Venues">→ Venues</button>'+
      (v.place==='new'?'<button class="btn" data-act="vPlace" data-v="'+v.id+'" data-p="board" title="Leave it on the board to think about">Keep</button>':'')+
      '<button class="btn ghost" data-act="vRemove" data-v="'+v.id+'" title="Off the board; the agent will not bring it back">Remove</button></span></div>';
}
/* An arena with new dates or links stands in the tray too, under the new
   venues, with what is new on it and the tick that marks it seen. */
function trayDatesRow(a){
  const xs=freshItems(a),nd=xs.filter(x=>(a.dates||[]).includes(x)).length,nl=xs.length-nd;
  const what=[nd?nd+' date'+(nd===1?'':'s'):'',nl?nl+' link'+(nl===1?'':'s'):''].filter(Boolean).join(', ');
  const tone=arenaTone(a);
  return '<div class="trow st-new"><span aria-hidden="true"></span>'+
    '<button class="tnm" data-act="openArena" data-id="'+a.id+'" title="Open '+esc(a.name)+'">'+esc(a.name)+'</button>'+
    '<span class="tar">'+(tone?'<i class="tdot" style="background:'+esc(tone)+'"></i>':'')+esc(typeOf(a)?typeOf(a).name:'')+'</span>'+
    '<span class="twhen">'+esc(what)+' new</span>'+
    '<span class="tact"><button class="btn" data-act="seenArena" data-id="'+a.id+'" title="The glow on its calls goes">Seen \u2713</button></span></div>';
}
function trayHTML(){
  const all=visibleVenues();
  const fresh=all.filter(v=>v.place==='new'),kept=all.filter(v=>v.place==='board');
  const arenasNew=finds.state==='ready'?finds.rows.filter(r=>r.kind==='arena').length:0;
  const dated=visibleArenas().filter(a=>freshItems(a).length);
  if(!fresh.length&&!kept.length&&!arenasNew&&!dated.length)return '';
  const by=v=>{const w=vWin(v);return w&&w.from!==null?w.from:9e15;};
  const order=(x,y)=>by(x)-by(y)||x.name.localeCompare(y.name);
  const open=!!S.ui.keptOpen;
  return '<div class="tray'+(fresh.length||dated.length?' fresh':'')+'">'+
    (fresh.length?'<p class="thead"><i class="tglow"></i>New on the board<b>'+fresh.length+'</b>'+
      '<span>found by the agent — move each to Venues, keep it here to think about, or remove it</span></p>'+
      '<div class="trows">'+fresh.sort(order).map(trayRow).join('')+'</div>':'')+
    (dated.length?'<p class="thead"><i class="tglow"></i>New dates and links<b>'+dated.length+'</b>'+
      '<span>glowing on their arenas\u2019 rows \u2014 mark each seen when you have looked</span>'+
      (dated.length>1?'<button class="btn ghost tall" data-act="seenAll">All seen \u2713</button>':'')+'</p>'+
      '<div class="trows">'+dated.map(trayDatesRow).join('')+'</div>':'')+
    (kept.length?'<button class="thead tkept" data-act="trayKept" aria-expanded="'+open+'"><span aria-hidden="true">'+(open?'▾':'▸')+'</span>'+
      'Kept on the board<b>'+kept.length+'</b><span>to think about</span></button>'+
      (open?'<div class="trows">'+kept.sort(order).map(trayRow).join('')+'</div>':''):'')+
    (arenasNew?'<button class="thead tarena" data-act="setView" data-v="dispatch">New arenas suggested<b>'+arenasNew+'</b><span>waiting in Dispatches →</span></button>':'')+
  '</div>';
}
function renderBoard(){keepPlace(()=>{
  winTimes();
  nameWidth();
  const board=$('#board');
  if(loadError){
    board.innerHTML='<div class="empty"><p>The saved board could not be read.</p>'+
      '<p class="hint" style="margin-top:6px">Nothing has been changed and nothing is being saved — '+
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
  /* the lanes' width, for packing the venues' names: the board less its
     padding, the names and the group's indent */
  const bw=board.clientWidth||(window.innerWidth-60);
  laneW=Math.max(300,bw-44-13-(S.ui.nameW||236));
  /* The heading over the names names the order the groups are in, and opens
     the choice of the two (Mark, 2026-10-11). It stood over a status column,
     saying "Where", which named neither the column nor what pressing it
     did; the column went the same day, and the choice came over here. */
  const so=BOARD_SORTS[S.ui.boardSort];
  let h=trayHTML()+'<div class="axisrow"><div class="corner sorter">Arena<button class="whsort'+(sortOpen?' on':'')+'" data-act="boardSort" '+
      'aria-haspopup="listbox" aria-expanded="'+sortOpen+'" title="Order of the arenas in each type: '+esc(so.long)+'">'+so.name+
      '<i aria-hidden="true">▾</i></button>'+
      (sortOpen?'<span class="whmenu" role="listbox" aria-label="Order of the arenas">'+
        Object.keys(BOARD_SORTS).map(k=>'<button class="'+(k===S.ui.boardSort?'sel':'')+'" data-act="boardSortSet" data-v="'+k+'" '+
          'role="option" aria-selected="'+(k===S.ui.boardSort)+'"><b>'+BOARD_SORTS[k].name+'</b><span>'+BOARD_SORTS[k].long+'</span></button>').join('')+
      '</span>':'')+'</div>'+
    '<div class="axis" style="background:'+bg+'">'+axisHTML()+'</div></div>'+sharedRows(bg);
  for(const ty of S.types){
    const group=vis.filter(a=>a.typeId===ty.id).sort(boardOrder());
    if(!group.length)continue;
    const col=!!S.ui.collapsed[ty.id];
    const nNew=col?group.filter(a=>venuesOf(a).some(v=>v.place==='new'&&!isShared(v))||freshItems(a).length).length:0;
    h+='<div class="grp'+(col?' collapsed':'')+'" style="--tone:'+esc(toneHex(ty.color))+'">'+
       '<div class="ghead"><div class="gc">'+
       '<button class="caret" data-act="toggleGroup" data-id="'+ty.id+'" aria-label="Collapse group">'+(col?'▸':'▾')+'</button>'+
       '<span class="gname">'+esc(ty.name)+'</span><span class="gcount">'+group.length+'</span>'+
       (nNew?'<i class="newdot" title="'+nNew+' arena'+(nNew===1?'':'s')+' here with something new"></i>':'')+'</div></div>';
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
  /* the edge of the column of names, from the axis down, to drag (see "the
     width of the names") */
  board.innerHTML=h+'<div class="namegrip" title="Drag to widen or narrow the arenas’ names" aria-hidden="true"></div>';
  const ax=board.querySelector('.axisrow'),g=board.querySelector('.namegrip');
  if(ax&&g)g.style.top=ax.offsetTop+'px';
});}
/* ───────── the width of the names ─────────
   Mark asked on 2026-10-14 to drag the board so more of each arena's name
   shows. The column's width is one variable, `--namew`, on the room, so the
   board's rows, its heading and the freezer under it move together; the
   grip on the column's edge sets it while dragging without a redraw, and
   the width is kept in the ui on letting go. */
function nameWidth(){
  if(S.ui.nameW)document.body.style.setProperty('--namew',S.ui.nameW+'px');
  else document.body.style.removeProperty('--namew');
}
let nameDrag=null;
document.addEventListener('pointerdown',e=>{
  const g=e.target.closest&&e.target.closest('.namegrip');
  if(!g||e.button!==0)return;
  e.preventDefault();
  const c=document.querySelector('.axisrow .corner');
  const w=c?Math.round(c.getBoundingClientRect().width):(S.ui.nameW||236);
  nameDrag={x:e.clientX,w,now:w};
  g.classList.add('on');
});
document.addEventListener('pointermove',e=>{
  if(!nameDrag)return;
  nameDrag.now=Math.min(NAME_MAX,Math.max(NAME_MIN,Math.round(nameDrag.w+e.clientX-nameDrag.x)));
  document.body.style.setProperty('--namew',nameDrag.now+'px');
});
document.addEventListener('pointerup',()=>{
  if(!nameDrag)return;
  S.ui.nameW=nameDrag.now;nameDrag=null;
  const g=document.querySelector('.namegrip.on');if(g)g.classList.remove('on');
  save();
});

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
  api.list((rows,err)=>{
    if(err){finds.state='error';finds.error=err;finds.rows=[];}
    else{finds.state='ready';finds.rows=rows;}
    renderDispatch();applyView();
    if(S.ui.view==='board')renderBoard();     /* the tray points to new arenas */
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
    if(ev)return 'Website — <b>'+esc(ev.name)+'</b> <span class="dpwhen">'+esc(dispDate(ev))+'</span>'+
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
  /* a general tool says which tool it would take the place of, since on an
     arena that has one the finding is a new address for it (see takeFind) */
  /* a removal names the date as the board holds it now, and why */
  if(r.kind==='remove'){
    const old=a&&(a.dates||[]).find(d=>d.id===r.replaces_date_id)||venue(r.replaces_date_id);
    if(!old)return 'Remove a date — <span class="dpwas">no longer on the board</span>';
    return 'Remove — <b>'+esc(old.name||dtLabel(old))+'</b> <span class="dpwhen">'+esc(dispDate(old))+'</span>'+
      (r.note?' <span class="dpwas dpold">'+esc(r.note)+'</span>':'');
  }
  if(r.kind==='tool'){
    const cur=a&&arenaTools(a).length===1?arenaTools(a)[0]:null;
    return 'Tool — <b>'+esc(r.label||findHost(r.url))+'</b>'+
      (!cur?' as a venue':linkKey(cur.url)===linkKey(r.url)?'<span class="dpwas dpold">already its tool</span>':
        '<span class="dpwas dpold">was: '+esc(cur.name)+' · '+esc(findHost(cur.url))+'</span>');
  }
  const dt=findDate(r);
  const when='<span class="dpwhen">'+esc(dispDate(dt))+'</span>';
  /* a correction says what it replaces, because the old date is the thing you
     are being asked about */
  let was='';
  if(r.replaces_date_id&&a){
    const old=(a.dates||[]).find(d=>d.id===r.replaces_date_id)||venue(r.replaces_date_id);
    if(old)was=' <span class="dpwas">was '+esc(dispDate(old))+'</span>';
  }
  if(dt.kind==='call')
    return 'Call — <span class="dpcall">'+esc(dt.call||'Call')+' · '+
           esc(roleOf(dt).short)+'</span> '+when+was;
  return 'Brokerage — <b>'+esc(dt.label||'Event')+'</b> '+when+was;
}
function findSwatch(r){
  if(r.kind==='arena'||r.kind==='link'||r.kind==='info'||r.kind==='tool'||r.kind==='remove')return '<i class="sw sw-uncertain"></i>';
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
      ((r.kind==='date'||r.kind==='tool')&&r.url&&linkKey(r.url)!==linkKey(r.source_url)?
        '<a class="dpsrc" href="'+esc(r.url)+'" target="_blank" rel="noopener" title="'+
        (r.kind==='tool'?'The tool itself':'The event\u2019s own page')+'">'+
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
    el.innerHTML=head+'<p class="dpnote">The room\u2019s agent (the task called Marketplace agent) works when you ask it to, from a Claude '+
      'session, and changes the board itself: venues, their dates and websites, call dates, links and the '+
      'About and Brokerage texts. What it changed is in its own report. Only a new arena it suggests waits here.</p>';
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
  /* An arena's general tool, found by the nightly agent (Mark, 2026-10-14).
     An arena without one gets it: the brokerage link already at that address,
     else a new one, becomes the tool. The agent offers one to an arena that
     has a tool only when that tool's address has moved, so Accept puts the
     new address on the same link, which keeps its place among the links. */
  /* A date an agent found to be wrong with nothing to put in its place — a
     guess the real call has overtaken, a second copy of one date (Mark,
     2026-10-14). Until this there was no way to say so, and a correction
     would only have made a second copy. Accept deletes it as the panel's
     ✕ does, so a wait on it ends with it. */
  /* A brokerage event the finding names is a venue now, under the date's
     own id (see absorbVenues), so a removal or a correction reaches it there. */
  if(r.kind==='remove'){
    const dt=(a.dates||[]).find(d=>d.id===r.replaces_date_id);
    if(!dt){
      const v=venue(r.replaces_date_id);
      if(!v)return 'That date is no longer on '+a.name+'.';
      dropVenue(v.id);
      return v.name+' removed.';
    }
    a.dates=a.dates.filter(d=>d!==dt);reconcile(a);
    save();renderAll();
    return 'Date removed from '+a.name+'.';
  }
  /* A tool is a venue (2026-10-14). One already standing at the same site
     only takes this arena in; an arena with one tool is given the new
     address, as the general tool was; otherwise it is a new tool. */
  if(r.kind==='tool'){
    if(!r.url)return 'That finding had no address, so nothing changed.';
    const k=siteKey(r.url);
    const same=(S.venues||[]).find(v=>v.url&&siteKey(v.url)===k);
    if(same){
      if(same.arenas.includes(a.id))return 'That is already a tool of '+a.name+'.';
      joinVenue(same,a.id);save();renderAll();
      return same.name+' now serves '+a.name+' too.';
    }
    const cur=arenaTools(a);
    if(cur.length===1){cur[0].url=r.url;if(r.label)cur[0].name=r.label;cur[0].foundAt=now;save();renderAll();
      return 'New address for '+cur[0].name+'.';}
    const id=venue('vt'+hashKey(k))?uid():'vt'+hashKey(k);
    S.venues.push(tidyVenue({id,kind:'tool',name:r.label||findHost(r.url),url:r.url,arenas:[a.id],
      note:'',visits:[],pages:[],foundAt:now}));
    save();renderAll();
    return 'Tool added to '+a.name+'.';
  }
  if(r.kind==='link'){
    const ev=siteFor(r);
    if(ev){
      ev.url=r.url;
      save();renderAll();
      return 'Website added to '+ev.name+'.';
    }
    if(hasLink(a,r.url))return 'That link is already on '+a.name+'.';
    a.brokerage=a.brokerage||{notes:'',links:[]};
    a.brokerage.links.push({id:uid(),label:r.label||'',url:r.url,foundAt:now});
    absorbVenues(S);
    save();renderAll();
    return 'Link added to '+a.name+'.';
  }
  const dt=findDate(r);
  dt.foundAt=now;
  if(dt.kind==='brokerage'&&r.replaces_date_id){
    const v=venue(r.replaces_date_id);
    if(v&&v.kind==='event'){
      if(!gradeOptions(dt.gran).includes(dt.grade))dt.grade=gradeDefault(dt.gran);
      Object.assign(v,{gran:dt.gran,start:dt.start,end:dt.end,grade:dt.grade});
      if(!v.url&&(r.url||r.source_url))v.url=r.url||r.source_url;
      tidyVenue(v);save();renderAll();
      return 'Date corrected on '+v.name+'.';
    }
  }
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
    if(a.dates[i].memo)dt.memo=a.dates[i].memo;   /* a corrected date keeps Mark's note on it */
    if(a.dates[i].stampedAt){dt.stampedAt=a.dates[i].stampedAt;dt.stampPrev=a.dates[i].stampPrev||null;}
    a.dates[i]=dt;}
  else a.dates.push(dt);
  reconcile(a);
  absorbVenues(S);           /* a brokerage date is a venue at once */
  save();renderAll();
  return (i>=0?'Date corrected on ':'Date added to ')+a.name+(linked?', with its page.':'.');
}
/* An info finding's date_kind says which of the arena's two texts it is for,
   named as the arena's panel names them. */
function infoName(r){return r.date_kind==='brokerage'?'Brokerage':'About';}
/* A link finding that names one of the brokerage events (its
   `replaces_date_id`) is that event's website: it goes on the event's
   venue, which carries the date's id, not among the arena's links. One
   naming an event that has since gone is an ordinary link again. */
function siteFor(r){
  if(r.kind!=='link'||!r.replaces_date_id)return null;
  const v=venue(r.replaces_date_id);
  return v&&v.kind==='event'?v:null;
}
/* Two spellings of one address — a trailing slash, a www, http against https —
   are the same page, and a second copy of it among the links is noise. */
function linkKey(u){
  return String(u||'').trim().toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/[#?].*$/,'').replace(/\/+$/,'');
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

/* ── venues, on screen ── */
const LIMBO_GHOST='<svg class="culgh" viewBox="0 0 16 18" width="16" height="18" aria-hidden="true"><path d="M8 1.5C4.7 1.5 2.5 4 2.5 7.2V16l1.8-1.4L6.1 16 8 14.6 9.9 16l1.8-1.4L13.5 16V7.2C13.5 4 11.3 1.5 8 1.5z" fill="currentColor"/><ellipse cx="6" cy="7.6" rx="1.05" ry="1.45" fill="#15171A"/><ellipse cx="10" cy="7.6" rx="1.05" ry="1.45" fill="#15171A"/><ellipse cx="8" cy="11" rx=".9" ry="1.1" fill="#15171A"/></svg>';
function venue(id){return (S.venues||[]).find(v=>v.id===id)||null;}
function venueArenas(v){return v.arenas.map(arena).filter(Boolean);}
/* every venue an arena is served by, wherever it stands but removed */
function venuesOf(a){return (S.venues||[]).filter(v=>v.place!=='gone'&&v.arenas.includes(a.id));}
/* A venue all of whose arenas are in the freezer is in the freezer with
   them; one serving no arena at all is still in sight, so it can be given one. */
function liveVenue(v){const as=venueArenas(v);return v.place!=='gone'&&(!as.length||as.some(a=>!a.frozenAt));}
function venueHay(v){
  return [v.name,v.url,v.note||'',v.memo||'']
    .concat(v.pages.map(p=>(p.label||'')+' '+p.url),v.visits.map(x=>x.text||''),venueArenas(v).map(a=>a.name))
    .join('\n').toLowerCase();
}
/* what the search leaves of the venues, wherever they stand; the Venues
   page takes the ones in Venues from it, the board all of them */
function visibleVenues(){
  const ql=S.ui.q.trim().toLowerCase();
  const vis=new Set(visibleArenas().map(a=>a.id));
  return (S.venues||[]).filter(v=>liveVenue(v)&&(!ql||venueHay(v).includes(ql)||v.arenas.some(id=>vis.has(id))));
}
const inVenues=v=>v.place==='venues';
/* Limbo is what is over, and the board is what is coming and going on: a
   venue in Limbo is off the board (Mark, 2026-10-17), on the arena rows
   and among the Shared venues alike, and waits in Limbo to be deleted.
   Its arena's panel still lists it. */
const inLimbo=v=>inVenues(v)&&vPhase(v)==='over';
const onTrial=v=>v.place==='new'||v.place==='board';
/* A venue's event days are its meeting days when they are a day or a span
   of up to two weeks. A longer exact span is the stretch its marketplace is
   open, and stands as its window; a month, a quarter or a year is a guess
   at a season. */
function isSpot(v){
  if(!v.start)return false;
  return v.gran==='day'||(v.gran==='range'&&T(v.end)-T(v.start)<=SPOT_MAX*DAY);
}
/* The window: from and to, either of which may be open (null), and the
   meeting days inside it, ms and me, when it has any. Mark sets the two ends
   (`opens`, `closes`) by dragging them; until he does, meeting days are
   given three weeks before and two after, a long exact span is its own
   window, and a season is its own stretch, marked as the guess it is. A
   venue with no days and no ends at all has no window: it is not dated yet.
   `set` says which ends are his. */
function vWin(v){
  const spot=isSpot(v);
  const ms=spot?T(v.start):null,me=spot?T(v.end||v.start):null;
  let from=v.opens?T(v.opens):null,to=v.closes?T(v.closes):null;
  const set={from:from!==null,to:to!==null};
  let season=false;
  if(spot){
    if(from===null)from=ms-LEAD_IN*DAY;
    if(to===null)to=me+TAIL*DAY;
    from=Math.min(from,ms);to=Math.max(to,me);
  }else if(v.start){
    season=!(v.gran==='range'&&v.grade==='fixed');
    if(from===null)from=T(v.start);
    if(to===null)to=T(v.end||v.start);
  }
  if(from===null&&to===null)return null;
  return {from,to,ms,me,season:season&&!set.from&&!set.to,set,unc:v.start?v.grade!=='fixed':false};
}
/* Where a venue stands today, finely: undated, arising (its window still
   ahead, or its season not yet dated), meeting (on its event days), active,
   dying (past its event days, or in the last stretch of a window that has
   none), over. The three sections of Venues are the three middle phases
   (vPhase); over is Limbo. */
function vState(v){
  const w=vWin(v);if(!w)return 'undated';
  const now=T(todayISO());
  if(w.to!==null&&now>w.to)return 'over';
  if(w.season||(w.from!==null&&now<w.from))return 'arising';
  if(w.ms!==null)return now<w.ms?'active':now<=w.me?'meeting':'dying';
  if(w.to!==null){
    const tail=Math.min(DYING_MAX*DAY,w.from!==null?(w.to-w.from)/3:DYING_MAX*DAY);
    return now>=w.to-tail?'dying':'active';
  }
  return 'active';
}
const PHASE={undated:'arising',arising:'arising',meeting:'active',active:'active',dying:'dying',over:'over'};
/* The section a venue stands in. Mark can put one in another section by
   hand from its panel (2026-10-15), and there it stays (`phase`) until he
   gives it back to its dates; its window and its words keep saying what
   the dates say. */
function vPhaseByDates(v){return PHASE[vState(v)];}
function vPhase(v){return v.phase||vPhaseByDates(v);}
/* How much is going on at a venue at one moment, from 0 to 1: rising
   through the window to its event days, full on them, falling away after;
   flat where there are none, fading through the last stretch. It is the
   shading of a window. */
function vHeat(v,t){
  const w=vWin(v);if(!w)return 0;
  if((w.from!==null&&t<w.from)||(w.to!==null&&t>w.to+DAY))return 0;
  if(w.ms!==null){
    if(t<w.ms)return .3+.7*(t-w.from)/Math.max(DAY,w.ms-w.from);
    if(t<=w.me+DAY)return 1;
    return Math.max(.15,1-.85*(t-w.me-DAY)/Math.max(DAY,w.to-w.me));
  }
  if(w.season)return .35;
  if(w.to!==null){
    const tail=Math.min(DYING_MAX*DAY,w.from!==null?(w.to-w.from)/3:DYING_MAX*DAY);
    if(t>w.to-tail)return Math.max(.15,.6-.45*(t-(w.to-tail))/Math.max(DAY,tail));
  }
  return .6;
}
/* the shading of a window drawn from x0 to x1 (times), as a gradient in
   the colour `rgb` (three numbers), the heat at each stop as its strength */
function heatBG(v,x0,x1,rgb){
  const w=vWin(v);if(!w||x1<=x0)return '';
  const pts=[x0,x1];
  [w.from,w.ms,w.me!==null?w.me+DAY:null,w.to].forEach(t=>{if(t!==null&&t>x0&&t<x1)pts.push(t);});
  if(w.to!==null&&w.ms===null&&!w.season){
    const tail=Math.min(DYING_MAX*DAY,w.from!==null?(w.to-w.from)/3:DYING_MAX*DAY);
    if(w.to-tail>x0&&w.to-tail<x1)pts.push(w.to-tail);
  }
  pts.sort((a,b)=>a-b);
  return 'linear-gradient(90deg,'+pts.map(t=>'rgba('+rgb+','+(.1+.6*vHeat(v,Math.min(t,x1-1))).toFixed(2)+') '+
    ((t-x0)/(x1-x0)*100).toFixed(1)+'%').join(',')+')';
}
function lastVisit(v){const n=v.visits.length;return n?v.visits[n-1]:null;}
function vSince(v){const x=lastVisit(v);return x?daysBetween(T(x.at),T(todayISO())):null;}
/* How often a venue wants a visit. Where it stands sets the base: on its
   event days every other day, active every four days, dying once a week, a
   window with no event days and no end every three weeks; one arising, over
   or undated wants none, nor does one not yet in Venues. The weight of the
   arenas it serves scales it: a venue serving a central arena comes round
   more often. What the visits gave scales it last: something found in
   either of the last two brings it round sooner, three answered visits in
   a row with nothing new send it further off. A rhythm Mark sets himself
   (`every`) stands as he set it. */
function vEvery(v){
  if(v.every)return v.every;
  if(!inVenues(v))return null;
  /* a section set by hand sets the rhythm too: none in Arising or Limbo */
  const nat=vState(v),w=vWin(v);
  const st=!v.phase||v.phase===PHASE[nat]?nat:v.phase==='over'?'over':v.phase==='arising'?'arising':v.phase;
  const base=st==='active'&&w&&w.ms===null&&w.to===null?RHYTHM.standing:RHYTHM[st];
  if(!base)return null;
  const as=venueArenas(v).filter(a=>!a.frozenAt);
  let e=base*(as.length?Math.min(...as.map(a=>WEIGHTS[weightOf(a)].turn)):1);
  const said=v.visits.filter(x=>x.got);
  const last2=said.slice(-2),last3=said.slice(-3);
  if(last2.some(x=>x.got!=='nothing'))e*=.75;
  else if(last3.length===3&&last3.every(x=>x.got==='nothing'))e*=1.5;
  return Math.max(1,Math.round(e));
}
function vDue(v){
  const e=vEvery(v);if(!e)return false;
  const d=vSince(v);return d===null||d>=e;
}
/* what a venue has given: its visits, the ones that found something, and
   the leads started from it */
function vLeads(v){
  const out=[];
  for(const a of S.arenas)for(const l of a.leads||[])if(l.venueId===v.id)out.push({a,l});
  return out;
}
function vYield(v){
  const n=v.visits.length,found=v.visits.filter(x=>x.got==='something'||x.got==='lead').length,leads=vLeads(v).length;
  return {n,found,leads};
}
function vYieldSay(v){
  const y=vYield(v);
  if(!y.n&&!y.leads)return 'not visited yet';
  return y.n+' visit'+(y.n===1?'':'s')+(y.found?' · '+y.found+' found':'')+(y.leads?' · '+y.leads+' lead'+(y.leads===1?'':'s'):'');
}
function vHost(v){return v.url?linkName({url:v.url}):'';}
const tDay=t=>shortDay(new Date(t).toISOString().slice(0,10));
function vDateSay(v){
  const st=vState(v),w=vWin(v);
  const meets=v.start?(v.grade==='fixed'?'':'≈ ')+shortDate(v):'';
  switch(st){
    case 'undated':return 'not dated yet';
    case 'arising':return w.season?'expected '+meets:'opens '+tDay(w.from)+(w.ms!==null?' · meets '+meets:'');
    case 'meeting':return 'meeting now · until '+tDay(w.to);
    case 'active':return w.ms!==null?'meets '+meets:w.to!==null?'until '+tDay(w.to):'open, no end set';
    case 'dying':return (w.ms!==null?'met '+meets+' · ':'')+'closes '+tDay(w.to);
    default:return 'closed '+tDay(w.to)+(w.ms!==null?' · met '+meets:'');
  }
}
/* Where it stands, in the board's words: new, kept, or in Venues and in
   which section of it */
const PLACE_SAY={new:'New on the board',board:'Kept on the board',venues:'In Venues',gone:'Removed'};
const PHASE_SAY={arising:'Arising',active:'Active',dying:'Dying',over:'Limbo'};
function vPlaceSay(v){return PLACE_SAY[v.place]+(inVenues(v)?' · '+PHASE_SAY[vPhase(v)]:'');}
/* a venue's mark: a diamond where it has event days, dashed while they are
   a guess; a rounded bar, the shape of a window, where it has none */
function vGlyph(v){
  return v.start?'<i class="vgl ev'+(v.grade==='fixed'?'':' unc')+'" title="Drag to put it in your own place within its group" aria-hidden="true"></i>':
    '<i class="vgl win" title="Drag to put it in your own place within its group" aria-hidden="true"></i>';
}
/* the arenas a venue serves, each in its type's colour */
function vArenaChips(v,max){
  const as=venueArenas(v);
  const shown=max?as.slice(0,max):as;
  return '<span class="vchips">'+shown.map(a=>{const tone=arenaTone(a);
    return '<button class="cuat'+(tone?' toned':'')+'" data-act="openArena" data-id="'+a.id+'" title="Open '+esc(a.name)+'"'+
      (tone?' style="--tone:'+esc(tone)+'"':'')+'>'+esc(a.name)+'</button>';}).join('')+
    (as.length>shown.length?'<span class="vmore" title="'+esc(as.slice(shown.length).map(a=>a.name).join(', '))+'">+'+(as.length-shown.length)+'</span>':'')+
    (as.length?'':'<span class="vmore">no arena</span>')+'</span>';
}
/* Go opens the venue's own site and is the visit (Mark, 2026-10-15): the
   day is recorded as it is pressed, a tick on the venue's strip, and the
   button says Visited for the rest of that day, still opening the site.
   Coming back asks what it gave (see "the visit question"). The stamp, a
   disc pressed by hand after going, went that day: every visit began with
   Go anyway. A venue with no site is visited from its panel. */
function vGoHTML(v){
  const done=v.visits.some(x=>x.at===todayISO());
  return v.url
    ?'<a class="vgo'+(done?' done':'')+'" href="'+esc(v.url)+'" target="_blank" rel="noopener" data-act="vGo" data-v="'+v.id+'" title="'+
      esc((done?'Visited today \u2014 opens ':'Opens and counts as a visit \u2014 ')+v.url)+'">'+(done?'Visited ↗':'Go ↗')+'</a>'
    :'<button class="vgo none" data-act="vEdit" data-v="'+v.id+'" title="No website yet — add one">+ site</button>';
}
/* ── asking the agent about one venue ──
   Mark asked on 2026-10-15 for a mark he can set on a venue so the agent
   looks at that one at least. The ask is a moment on the venue (`askAt`);
   the agent's nightly scan takes a venue whose ask is later than its own
   last look at it first, and once the log the agent keeps of its rounds
   (the `venue:` rows of `semaphore_agent_log`) shows a look after the ask,
   the ask is taken off here, so the button goes quiet by itself. */
function vAgentHTML(v){
  const on=!!v.askAt;
  const tip=on?'The agent looks at this venue on its next night run — press to take the ask back':
    'Ask the agent to look at this venue on its next night run';
  return '<button class="vagent'+(on?' on':'')+'" data-act="vAgent" data-v="'+v.id+'" title="'+tip+'" aria-pressed="'+on+'">'+
    (on?'Agent asked':'Ask agent')+'</button>';
}
/* An arena can be asked about the same way (Mark, 2026-10-15), from the
   head of its panel: the agent then goes through its calls first — every
   round, its exact published dates and stages — and its links, texts and
   venues. The log names an arena by its own id. */
function arenaAgentHTML(a){
  const on=!!a.askAt;
  const tip=on?'The agent looks at this arena on its next night run — press to take the ask back':
    'Ask the agent to check this arena — its call dates, links and venues — on its next night run';
  return '<button class="vagent'+(on?' on':'')+'" data-act="aAgent" data-id="'+a.id+'" title="'+tip+'" aria-pressed="'+on+'">'+
    (on?'Agent asked':'Ask agent')+'</button>';
}
function refreshAsks(){
  const asked=(S.venues||[]).filter(v=>v.askAt).concat(S.arenas.filter(a=>a.askAt));
  const api=(typeof Hub!=='undefined'&&Hub.api)?Hub.api('semaphore-inbox'):null;
  if(!asked.length||!api||!api.ready()||!api.visits)return;
  const since=asked.map(x=>x.askAt).sort()[0];
  api.visits(since,(rows,err)=>{
    if(err||!rows)return;
    let done=false;
    for(const r of rows){
      const id=String(r.arena_id||'');
      const x=id.startsWith('venue:')?venue(id.slice(6)):arena(id);
      if(x&&x.askAt&&Date.parse(r.checked_at)>=Date.parse(x.askAt)){delete x.askAt;done=true;}
    }
    if(done){save();renderAll();renderDrawer();}
  });
}

/* ── the visit question ──
   One question after a visit, three answers: nothing new, something (with a
   line if he likes), or a lead, asked in a bar at the foot of the room when
   he comes back to the app after Go (2026-10-14). Go has recorded the visit
   already, so "Not now" keeps it unanswered, and "Not a visit" takes back a
   Go pressed by mistake. */
let vBack=null;               /* {id,at}: the venue Go was last pressed for, until he is back */
let vAsking=null;             /* the venue the bar at the foot is asking about */
function vAskHTML(v,where){
  const today=v.visits.find(x=>x.at===todayISO());
  const got=today&&today.got;
  const on=k=>got===k?' on':'';
  const q='Back from <b>'+esc(v.name)+'</b>. Anything there?';
  return '<div class="vask '+where+'" data-v="'+v.id+'" role="group" aria-label="What the visit gave">'+
    '<span class="vq">'+q+'</span>'+
    '<button class="va'+on('nothing')+'" data-act="vAns" data-v="'+v.id+'" data-g="nothing">Nothing new</button>'+
    '<span class="vsome"><button class="va s'+on('something')+'" data-act="vAns" data-v="'+v.id+'" data-g="something">Something…</button>'+
      '<input class="vtx" type="text" placeholder="What, in a line — optional" value="'+esc(today&&today.text||'')+'" aria-label="What you saw"></span>'+
    '<button class="va l'+on('lead')+'" data-act="vAns" data-v="'+v.id+'" data-g="lead">A lead</button>'+
    '<button class="vx" data-act="vAskOff">Not now</button>'+
    (today?'<button class="vx" data-act="vUnstamp" data-v="'+v.id+'">Not a visit</button>':'')+
  '</div>';
}
function visitToday(v){
  const t=todayISO();let x=v.visits.find(y=>y.at===t);
  if(!x){x={id:t,at:t};v.visits.push(x);}
  return x;
}
function vAnswer(v,got,text){
  const x=visitToday(v);
  if(VGOT[got])x.got=got;
  const t=String(text||'').trim();
  if(got==='something'&&t)x.text=t;else if(got!=='something'&&!x.leadId)delete x.text;
  return x;
}
function renderAsk(){
  const el=$('#vbar');if(!el)return;
  const v=vAsking&&venue(vAsking);
  el.hidden=!v;
  el.innerHTML=v?vAskHTML(v,'bar'):'';
}
/* Back in the app after Go: the page coming to the front again. A second
   or two is allowed for, since a Go whose tab never really opened is not a
   visit to ask about. */
function cameBack(){
  if(!vBack||document.visibilityState==='hidden')return;
  if(Date.now()-vBack.at<1500)return;
  const v=venue(vBack.id);vBack=null;
  if(!v)return;
  vAsking=v.id;renderAsk();
}
document.addEventListener('visibilitychange',cameBack);
window.addEventListener('focus',cameBack);

/* ── a venue's window, drawn ──
   The same band on the board's lanes and on the Venues strip: the window
   shaded by its heat in the colour of where the venue stands (the
   brokerage red in Venues, the new hue while new, bone while kept), a
   dashed edge while it is a season's guess, its two ends to drag, and its
   event days as diamonds over it. `t0`/`t1` are the strip's ends, `top` the
   middle of the band in pixels, or null for the middle of the strip.

   A window with no end runs on six weeks past today and fades out there
   with an arrow, rather than to the strip's edge: drawn to the edge, every
   standing partner search was a thick bar across the whole board (Mark,
   2026-10-15). Its end can still be dragged to give it a real one. A
   `quiet` band is one already in Venues, drawn on the board as a thin line
   with its diamonds and no name, so what still waits for Mark stands out
   (the same evening). */
const OPEN_RUN=42;          /* days an open-ended window is drawn past today */
const PLACE_RGB={new:'185,227,90',board:'150,140,122',venues:'239,91,76',gone:'125,116,102'};
function bandHTML(v,t0,t1,top,label,quiet){
  const w=vWin(v);if(!w)return '';
  const P=t=>(t-t0)/(t1-t0)*100,C=x=>Math.max(0,Math.min(100,x));
  const now=T(todayISO());
  const from=w.from===null?t0:Math.max(t0,w.from),to=w.to===null?Math.min(t1,Math.max(now,w.from===null?now:w.from)+OPEN_RUN*DAY):Math.min(t1,w.to+DAY);
  if(to<t0||from>t1)return '';
  const L=C(P(from)),R=C(P(to)),past=w.to!==null&&w.to+DAY<now;
  const y=top===null?'':'top:'+top+'px;';
  const rgb=past?PLACE_RGB.gone:PLACE_RGB[v.place];
  const data=' data-act="openVenue" data-v="'+v.id+'" data-tipv="'+v.id+'"';
  let h='<div class="vband st-'+v.place+(quiet?' quiet':'')+(past?' past':'')+(w.season?' season':'')+(w.from===null?' openl':'')+(w.to===null?' openr':'')+
    '" style="'+y+'left:'+L.toFixed(2)+'%;width:'+Math.max(R-L,.5).toFixed(2)+'%;background:'+heatBG(v,from,to,rgb)+'"'+data+
    ' role="button" tabindex="0" aria-label="'+esc(v.name)+', '+esc(vDateSay(v))+'">'+
    '<i class="vh l" data-v="'+v.id+'" data-end="opens" title="Drag to set when it opens — double-click to undo"></i>'+
    '<i class="vh r" data-v="'+v.id+'" data-end="closes" title="Drag to set when it closes — double-click to undo"></i>'+
    (quiet?'':label||'')+'</div>';
  if(w.to===null&&R<99)h+='<span class="vrun" style="'+y+'left:'+R.toFixed(2)+'%" aria-hidden="true">→</span>';
  if(w.ms!==null){
    if(w.me>w.ms){const a=C(P(w.ms)),b=C(P(w.me+DAY));
      h+='<i class="vmeet'+(past?' past':'')+'" style="'+y+'left:'+a.toFixed(2)+'%;width:'+Math.max(b-a,.4).toFixed(2)+'%"'+data+'></i>';}
    const x=P(w.ms+DAY/2);
    if(x>=0&&x<=100)h+='<i class="vdia st-'+v.place+(w.unc?' unc':'')+(past?' past':'')+'" style="'+y+'left:'+x.toFixed(2)+'%"'+data+'></i>';
  }
  return h;
}
/* ── dragging a window's ends ──
   Mark sets how long a venue is active by its two ends (2026-10-15), on the
   board and on Venues alike, which are one record and so stay in step. The
   end follows the pointer by the day, held by the event days (a window
   cannot open after them or close before them) and by the other end; the
   day it would take is said beside the pointer, and letting go keeps it. A
   double-click on an end gives it back to its default. The press that
   follows the drag is swallowed, so letting go does not open the venue.

   The move and the release are heard on the end itself, which holds the
   pointer, rather than on the document: the document's are gated on this
   room being the one showing (hub.js), and a venue's panel is also lent
   over the Ledger. There the drag moved nothing, and the release it never
   heard came at the next one in this room, which wrote whatever day the
   pointer was over then. */
let wDrag=null,wSwallow=0;
/* The end under the pointer, found by where it is as well as by what was
   hit. An open end fades out through a mask on the band, and a mask takes
   the clicks of what it hides with it: the end of a window with no end,
   the one the comment above says can be dragged to give it one, could not
   be pressed at all. */
function vhAt(e){
  const hit=e.target.closest&&e.target.closest('.vh');
  if(hit)return hit;
  const strip=e.target.closest&&e.target.closest('[data-t0]');
  if(!strip)return null;
  for(const h of strip.querySelectorAll('.vh')){
    const r=h.getBoundingClientRect();
    if(e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom)return h;
  }
  return null;
}
document.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;
  const hd=vhAt(e);
  if(!hd)return;
  const v=venue(hd.dataset.v),strip=hd.closest('[data-t0]'),band=hd.parentElement;
  if(!v||!strip||!band)return;
  e.preventDefault();e.stopPropagation();
  const r=strip.getBoundingClientRect(),w=vWin(v);
  wDrag={v,band,end:hd.dataset.end,r,t0:+strip.dataset.t0,t1:+strip.dataset.t1,w,day:null,
    L:parseFloat(band.style.left),R:parseFloat(band.style.left)+parseFloat(band.style.width)};
  band.classList.add('dragging');
  try{hd.setPointerCapture(e.pointerId);}catch(x){}
  hd.addEventListener('pointermove',wMove);
  hd.addEventListener('pointerup',wUp);
  hd.addEventListener('pointercancel',wUp);
},true);
function wMove(e){
  if(!wDrag)return;
  const d=wDrag,w=d.w;
  let t=d.t0+(e.clientX-d.r.left)/d.r.width*(d.t1-d.t0);
  if(d.end==='opens'){
    let hi=w.ms!==null?w.ms:(w.to!==null?w.to-DAY:Infinity);
    t=Math.min(t,hi);
  }else{
    let lo=w.me!==null?w.me:(w.from!==null?w.from+DAY:-Infinity);
    t=Math.max(t,lo);
  }
  const day=new Date(t+DAY/2);day.setHours(12,0,0,0);
  const iso=day.getFullYear()+'-'+pad(day.getMonth()+1)+'-'+pad(day.getDate());
  d.day=iso;
  const x=Math.max(0,Math.min(100,(T(iso)+(d.end==='closes'?DAY:0)-d.t0)/(d.t1-d.t0)*100));
  if(d.end==='opens')d.L=x;else d.R=x;
  d.band.style.left=Math.min(d.L,d.R).toFixed(2)+'%';
  d.band.style.width=Math.max(Math.abs(d.R-d.L),.5).toFixed(2)+'%';
  tip.textContent=(d.end==='opens'?'Opens ':'Closes ')+fmtDay(iso);
  tip.style.display='block';tip.style.left=(e.clientX+14)+'px';tip.style.top=(e.clientY+16)+'px';
}
function wUp(e){
  const hd=e.currentTarget;
  hd.removeEventListener('pointermove',wMove);
  hd.removeEventListener('pointerup',wUp);
  hd.removeEventListener('pointercancel',wUp);
  if(!wDrag)return;
  const d=wDrag;wDrag=null;tip.style.display='none';
  d.band.classList.remove('dragging');
  wSwallow=Date.now();
  if(!d.day||e.type==='pointercancel')return;
  d.v[d.end]=d.day;tidyVenue(d.v);
  save();renderAll();
}
document.addEventListener('click',e=>{
  if(Date.now()-wSwallow<400&&e.target.closest&&e.target.closest('.vband,.vh,[data-t0]')){e.preventDefault();e.stopPropagation();}
},true);
document.addEventListener('dblclick',e=>{
  const hd=vhAt(e);if(!hd)return;
  const v=venue(hd.dataset.v);if(!v)return;
  v[hd.dataset.end]=null;
  /* a window with no event days has no default to go back to at its
     opening, so there an end is only ever moved */
  if(!v.start&&!v.opens&&!v.closes)v.opens=todayISO();
  save();renderAll();
});

/* ── Venues: three sections and Limbo ──
   What Mark has moved to Venues, in three tabs by where each stands today:
   Arising (its window still ahead, or not dated yet), Active (open, up to
   and through its event days), Dying (past them, or in the last stretch of
   a window without any), with Limbo set apart for what is over (Mark,
   2026-10-15; the Now page with its Events and Tools tabs before). Each tab
   says how many it holds and how many of them are due, so a due venue is
   not missed from another tab. Every venue is a row on one strip of time,
   four weeks back and twelve ahead: its window shaded by its heat, its
   event days as diamonds, the visits as ticks under it, today the gold
   line, and a red ring on today's line when it is due.

   The order is fixed by what a venue is, never by what was done to it
   (Mark, 2026-10-15: "don't change the order upon checking"): the venues
   serving two arenas or more first, as one block, as on the board; then
   each type's own, in his order of types; inside each, by the start of the
   window, those open from before the strip first and the undated last.
   Each group stands under a thin band in its type's colour, as the board's
   groups do, the shared ones under Shared (Mark asked for the order without
   headings first, and for the headings the same evening, 2026-10-15). */
function nowSpan(){const now=T(todayISO());return {now,t0:now-NOW_BACK*DAY,t1:now+NOW_AHEAD*DAY};}
function vTrackHTML(v,sp){
  const{now,t0,t1}=sp;
  const P=t=>((t-t0)/(t1-t0)*100);
  const C=x=>Math.max(0,Math.min(100,x));
  let h='';
  const w=vWin(v);
  if(!w)h+='<span class="vbeyond" data-tipv="'+v.id+'">not dated yet — set it in its panel</span>';
  else if(w.from!==null&&w.from>t1)h+='<span class="vbeyond" data-tipv="'+v.id+'">'+esc(vDateSay(v))+' →</span>';
  else{
    h+=bandHTML(v,t0,t1,null,'');
    const lx=w.to===null?101:P(w.to+DAY);
    if(lx<90&&lx>-1)h+='<span class="vlab" style="left:'+C(lx).toFixed(2)+'%">'+esc(w.ms!==null?(w.unc?'≈ ':'')+shortDate(v):'closes '+tDay(w.to))+'</span>';
  }
  for(const x of v.visits){const t=T(x.at);if(t>=t0&&t<=t1)
    h+='<i class="vtick'+(x.got&&x.got!=='nothing'?' found':'')+'" style="left:'+P(t+DAY/2).toFixed(2)+'%" title="'+esc(shortDay(x.at)+(x.got?' — '+VGOT[x.got]:''))+'"></i>';}
  h+='<i class="vnow" style="left:'+P(now+DAY/2).toFixed(2)+'%"></i>';
  if(vDue(v))h+='<i class="vpulse" style="left:'+P(now+DAY/2).toFixed(2)+'%" title="Due for a visit"></i>';
  return '<div class="vtrack" data-act="openVenue" data-v="'+v.id+'" data-t0="'+t0+'" data-t1="'+t1+'">'+h+'</div>';
}
function nowRow(v,sp,over){
  const due=vDue(v);
  return '<div class="vrow'+(due?' due':'')+(over?' over':'')+'" data-vid="'+v.id+'">'+
    '<div class="vname">'+vGlyph(v)+
      '<span class="vnt"><span class="vnmrow"><button class="vnm" data-act="openVenue" data-v="'+v.id+'" title="'+esc(v.name)+'">'+esc(v.name)+'</button></span>'+
        vArenaChips(v,2)+'</span></div>'+
    vTrackHTML(v,sp)+
    '<div class="vend">'+vGoHTML(v)+
      (over?'<button class="btn ghost vdel" data-act="vDrop" data-v="'+v.id+'" data-limbo="1" title="Gone from the app, and the agent will not bring it back" aria-label="Delete '+esc(v.name)+'">Delete</button>':'')+
    '</div></div>';
}
function nowAxisHTML(sp){
  const{now,t0,t1}=sp;
  const P=t=>((t-t0)/(t1-t0)*100);
  let h='';
  /* a Monday every two weeks, and the first of each month marked apart */
  const d=new Date(t0);d.setDate(d.getDate()+((8-d.getDay())%7));
  for(let i=0;d.getTime()<t1;i++,d.setDate(d.getDate()+7)){
    const x=P(d.getTime());
    h+='<i class="vwk" style="left:'+x.toFixed(2)+'%"></i>';
    if(i%2===0&&x<96)h+='<span style="left:'+x.toFixed(2)+'%">'+d.getDate()+' '+MONTHS[d.getMonth()]+'</span>';
  }
  return h+'<b class="vnowc" style="left:'+P(now+DAY/2).toFixed(2)+'%"></b>';
}
function nowEmptyHTML(){
  if(!S.arenas.length&&!(S.venues||[]).length)
    return '<div class="empty"><p>Nothing in the Brokerage Semaphore yet.</p>'+
      '<p class="hint" style="margin-top:6px">Add a venue, or an arena first,<br>or load the example set to see how it reads.</p>'+
      '<div class="btns"><button class="btn primary" data-act="vNew">+ Venue</button>'+
      '<button class="btn" data-act="addArena">+ Arena</button>'+
      '<button class="btn" data-act="seed">Load example set</button></div></div>';
  const q=S.ui.q.trim();
  return '<div class="empty"><p>'+(q?'No venue matches the search.':'No venue in Venues yet.')+'</p>'+
    '<p class="hint" style="margin-top:6px">'+(q?'Clear it, or try a shorter word.':'Move one here from the board with → Venues, or press + Venue.')+'</p></div>';
}
const NOW_TABS={arising:{name:'Arising',none:'Nothing arising: no venue in Venues whose window is still ahead.'},
  active:{name:'Active',none:'Nothing active. A venue is active from its window’s opening through its event days.'},
  dying:{name:'Dying',none:'Nothing dying. A venue dies after its event days, or in the last weeks of its window.'},
  over:{name:'Limbo',none:''}};
/* the group a venue stands in on Venues: -1 shared, else the place of its
   arena's type in his order, then those of no known type, then those
   serving no arena */
function vBlock(v){
  if(isShared(v))return -1;
  const as=venueArenas(v).filter(a=>!a.frozenAt);
  if(!as.length)return S.types.length+1;
  const i=S.types.findIndex(t=>t.id===as[0].typeId);
  return i<0?S.types.length:i;
}
function blockHead(k,n){
  const t=k>=0&&k<S.types.length?S.types[k]:null;
  const name=k===-1?'Shared':t?t.name:k===S.types.length?'Untyped':'No arena';
  const tone=k===-1?'#9c7334':t?toneHex(t.color):'';
  return '<div class="vgrp"'+(tone?' style="--tone:'+esc(tone)+'"':'')+'><span>'+esc(name)+'</span><b>'+n+'</b></div>';
}
/* rows under the heading of each group they fall in, in the order given */
function blockRows(list,sp,over){
  let h='',i=0;
  while(i<list.length){
    const k=vBlock(list[i]);let j=i;
    while(j<list.length&&vBlock(list[j])===k)j++;
    h+=blockHead(k,j-i)+'<div class="vrows'+(over?' limbo':'')+'">'+list.slice(i,j).map(v=>nowRow(v,sp,over)).join('')+'</div>';
    i=j;
  }
  return h;
}
/* the order on Venues: the group, then his own place in it where he has
   dragged one (`vpos`), then the start of the window */
function venueOrder(x,y){
  const from=v=>{const w=vWin(v);return !w?Infinity:w.from===null?-Infinity:w.from;};
  const pos=v=>Number.isFinite(v.vpos)?v.vpos:Infinity;
  return vBlock(x)-vBlock(y)||(pos(x)===pos(y)?0:pos(x)<pos(y)?-1:1)||
    (from(x)===from(y)?0:from(x)<from(y)?-1:1)||x.name.localeCompare(y.name);
}
function nowSections(){
  const all=visibleVenues().filter(inVenues);
  const by={arising:[],active:[],dying:[],over:[]};
  for(const v of all)by[vPhase(v)].push(v);
  for(const k in by)by[k].sort(venueOrder);
  return {all,by};
}
/* ── dragging a venue into place ──
   Mark puts the venues of a group in his own order by dragging one by its
   mark at the left of its row (2026-10-15). The rows of the group change
   places under the pointer; letting go keeps the order, for the whole
   group across the four tabs: the venue goes in just before the one that
   now follows it on screen, or just after the one before it, and every
   venue of the group is numbered afresh (`vpos`). One never dragged
   stands after those that were, by the start of its window. */
let vDrag=null;
document.addEventListener('pointerdown',e=>{
  const g=e.target.closest&&e.target.closest('#now .vrow .vgl');
  if(!g||e.button!==0)return;
  const row=g.closest('.vrow'),list=row&&row.parentElement;
  if(!list||list.children.length<2)return;
  e.preventDefault();
  vDrag={row,list,moved:false};
  row.classList.add('vdragging');
  try{g.setPointerCapture(e.pointerId);}catch(x){}
});
document.addEventListener('pointermove',e=>{
  if(!vDrag)return;
  const{row,list}=vDrag;
  const next=[...list.children].find(r=>r!==row&&e.clientY<r.getBoundingClientRect().top+r.offsetHeight/2)||null;
  if(next!==row.nextElementSibling||(!next&&row!==list.lastElementChild)){list.insertBefore(row,next);vDrag.moved=true;}
});
document.addEventListener('pointerup',()=>{
  if(!vDrag)return;
  const{row,list,moved}=vDrag;vDrag=null;
  row.classList.remove('vdragging');
  if(!moved)return;
  const ids=[...list.children].map(r=>r.dataset.vid),v=venue(row.dataset.vid);
  if(!v)return;
  const i=ids.indexOf(v.id),k=vBlock(v);
  const group=(S.venues||[]).filter(x=>inVenues(x)&&liveVenue(x)&&vBlock(x)===k&&x!==v).sort(venueOrder);
  const after=ids[i+1]&&group.findIndex(x=>x.id===ids[i+1]);
  const before=ids[i-1]&&group.findIndex(x=>x.id===ids[i-1]);
  group.splice(after>=0&&ids[i+1]?after:before>=0&&ids[i-1]?before+1:group.length,0,v);
  group.forEach((x,n)=>{x.vpos=n;});
  save();renderNow();
});
function renderNow(){keepPlace(()=>{
  const el=$('#now');if(!el)return;
  const sp=nowSpan();
  const{all,by}=nowSections();
  if(!all.length){el.innerHTML=nowEmptyHTML();return;}
  const tab=NOW_TABS[S.ui.nowTab]?S.ui.nowTab:'active';
  const tabDue=xs=>xs.filter(vDue).length;
  const tabHTML=k=>{const xs=by[k],d=tabDue(xs);
    return '<button class="vtab t-'+k+(tab===k?' on':'')+'" data-act="nowTab" data-t="'+k+'" aria-pressed="'+(tab===k)+'">'+NOW_TABS[k].name+
      '<b>'+xs.length+'</b>'+(d?'<i class="vtabdue" title="'+d+' due for a visit">'+d+' due</i>':'')+'</button>';};
  const shown=by[tab],due=tabDue(shown);
  let h='<div class="vhead"><div class="vtabs" role="group" aria-label="Where the venues stand">'+
      tabHTML('arising')+tabHTML('active')+tabHTML('dying')+'</div>'+
    /* Limbo stands apart from the three, in its fog: what is over is not
       a stage of the work but what is left of it */
    '<button class="culimbo vlimbotab'+(tab==='over'?' on':'')+'" data-act="nowTab" data-t="over" aria-pressed="'+(tab==='over')+'">'+
      '<span class="culfog" aria-hidden="true"></span>'+LIMBO_GHOST+'<span class="culc">Limbo</span><b>'+by.over.length+'</b></button>'+
    '<span class="wsay">'+(tab==='over'?(by.over.length?'Over and off the board, each waiting until you delete it \u2014 or drag its end on, or put it in another section from its panel.':'Nothing in Limbo.'):
      due?'<b>'+due+'</b> '+(due===1?'venue here is':'venues here are')+' due for a visit.':'Nothing here is due for a visit.')+'</span>'+
    '<span class="vkey"><i class="vgl ev"></i>event days<i class="vkbar"></i>window, by how much goes on<i class="vkp"></i>due</span></div>';
  h+='<div class="vaxis"><span class="vaxl">'+NOW_TABS[tab].name+'</span><div class="vaxt">'+nowAxisHTML(sp)+'</div><span></span></div>';
  if(!shown.length){h+=tab==='over'?'':'<p class="vnone vtabnone">'+NOW_TABS[tab].none+'</p>';el.innerHTML=h;return;}
  const dated=shown.filter(v=>vWin(v)),undated=shown.filter(v=>!vWin(v));
  h+=blockRows(dated,sp,tab==='over');
  if(undated.length)h+='<p class="vsec">Not dated yet</p>'+blockRows(undated,sp,false);
  el.innerHTML=h;
});}

/* ── a venue, opened ──
   Its panel takes the arena's place in the drawer: where it stands, and
   for one still on the board the three things to do with it; its window,
   the rhythm, every visit, the leads it gave, the arenas it serves, its
   other pages and Mark's own note. Edit changes what it is and when. */
const VENUE_LEAD='venue-lead';     /* leadEdit.a while a lead is being started from a venue's panel */
let vNoteT=null;
/* the window on a strip of its own, a week either side, with today */
function vLifeHTML(v){
  const w=vWin(v);
  if(!w)return '';
  const now=T(todayISO());
  const a=w.from===null?Math.min(now,w.to)-42*DAY:w.from,b=w.to===null?Math.max(now,w.from)+42*DAY:w.to;
  const t0=Math.min(a,now)-7*DAY,t1=Math.max(b,now)+7*DAY;
  const P=t=>((t-t0)/(t1-t0)*100).toFixed(2);
  let h='<div class="vlife" data-t0="'+t0+'" data-t1="'+t1+'"><i class="vax"></i>'+bandHTML(v,t0,t1,null,'');
  if(w.ms!==null)h+='<span class="vlt up" style="left:'+P(w.ms+DAY/2)+'%">meets '+esc(shortDate(v))+'</span>';
  if(w.from!==null)h+='<span class="vlt" style="left:'+P(w.from)+'%">opens<br>'+tDay(w.from)+'</span>';
  if(w.to!==null)h+='<span class="vlt" style="left:'+P(w.to+DAY)+'%">closes<br>'+tDay(w.to)+'</span>';
  h+='<i class="vnow" style="left:'+P(now+DAY/2)+'%"></i><span class="vlt up now" style="left:'+P(now+DAY/2)+'%">today</span>';
  return h+'</div>';
}
function vEveryHTML(v){
  const auto=v.every?null:vEvery(v);
  const opts=[0,1,2,3,4,5,7,10,14,21,30,45,60];
  const why=!inVenues(v)?'it is not in Venues':({arising:'it is arising',over:'it is over',undated:'it has no date'}[vState(v)]||'it rests');
  return '<select class="vevery" data-vevery="'+v.id+'" aria-label="How often to visit">'+
    opts.map(n=>'<option value="'+n+'"'+((v.every||0)===n?' selected':'')+'>'+
      (n?'every '+n+' day'+(n===1?'':'s'):(auto?'by itself — now every '+auto+' day'+(auto===1?'':'s'):'by itself — none while '+why))+
    '</option>').join('')+'</select>';
}
/* The window and the event days in words, and whose each end is: Mark's,
   or the one given round the event days until he moves it. */
function vFactsHTML(v){
  const w=vWin(v);
  const row=(k,x)=>'<dt>'+k+'</dt><dd>'+x+'</dd>';
  const end=(k,t,set)=>row(k,t===null?'<i>no end set</i>':esc(fmtDay(new Date(t).toISOString().slice(0,10)))+
    (set?'':' <i>'+(w.season?'— the season, a guess':'— round the event days, until you drag it')+'</i>'));
  return (w?end('opens',w.from,w.set.from):row('window','<i>not set — Edit, or give it event days</i>'))+
    row('event days',v.start?esc((v.grade==='fixed'?'':'≈ ')+dispDate(v)):'<i>none</i>')+
    (w?end('closes',w.to,w.set.to):'');
}
/* What to do with a venue still on the board (Mark, 2026-10-15): move it
   to Venues, keep it on the board to think about, or remove it. In Venues
   it can go back to the board. */
function vPlaceHTML(v){
  const found=v.foundAt?' <i>found by the agent '+esc(shortDay(v.foundAt.slice(0,10)))+'</i>':'';
  if(onTrial(v))return '<div class="vplace st-'+v.place+'"><span><b>'+PLACE_SAY[v.place]+'</b>'+found+'</span>'+
    '<button class="btn primary" data-act="vPlace" data-v="'+v.id+'" data-p="venues" title="Move it to Venues, where it comes round for visits">→ Venues</button>'+
    (v.place==='new'?'<button class="btn" data-act="vPlace" data-v="'+v.id+'" data-p="board" title="Leave it on the board to think about">Keep on board</button>':'')+
    '<button class="btn ghost" data-act="vRemove" data-v="'+v.id+'" title="Off the board; the agent will not bring it back">Remove</button></div>';
  /* in Venues: the section it stands in, any of which can be chosen by
     hand, and the way back to the board */
  const ph=vPhase(v),nat=vPhaseByDates(v);
  return '<div class="vplace st-venues"><span><b>In Venues</b>'+
      (v.phase&&v.phase!==nat?'<i>put here by you; its dates say '+PHASE_SAY[nat]+'</i>':'')+'</span>'+
    '<span class="vphseg" role="group" aria-label="Section in Venues">'+['arising','active','dying','over'].map(k=>
      '<button class="'+(k===ph?'on':'')+'" data-act="vPhase" data-v="'+v.id+'" data-ph="'+k+'" aria-pressed="'+(k===ph)+'" title="'+
        (k===nat?'Where its dates put it':'Put it in '+PHASE_SAY[k]+' by hand')+'">'+PHASE_SAY[k]+'</button>').join('')+'</span>'+
    (v.phase?'<button class="vreset" data-act="vPhase" data-v="'+v.id+'" data-ph="" title="Let its dates decide again">by its dates</button>':'')+
    '<button class="btn ghost" data-act="vPlace" data-v="'+v.id+'" data-p="board" title="Take it out of Venues; it stays on the board">Back to the board</button></div>';
}
function venueReadHTML(v){
  const d=vSince(v);
  const visits=v.visits.slice().reverse();
  const leads=vLeads(v);
  const addable=liveArenas().filter(a=>!v.arenas.includes(a.id)).sort((x,y)=>x.name.localeCompare(y.name));
  const adding=leadEdit.a===VENUE_LEAD;
  const w=vWin(v);
  return '<div class="cbody vpanel">'+
    '<div class="chead vchead">'+
      '<button class="x" data-act="closeDrawer" aria-label="Close">✕</button>'+
      '<p class="vkind">Venue'+(vHost(v)?' · '+esc(vHost(v)):'')+'</p>'+
      '<h2 id="aname">'+esc(v.name)+'</h2>'+
      '<div class="vchrow">'+vGoHTML(v)+(v.url?'':'<button class="vgo none" data-act="vVisit" data-v="'+v.id+'" title="Record today\u2019s visit">Visited today</button>')+vAgentHTML(v)+
        '<span class="vlast">'+(d===null?'not visited yet':'last visit '+(d<=0?'today':d===1?'yesterday':d+' days ago'))+
          (vEvery(v)?' · every '+vEvery(v)+' d':'')+'</span></div>'+
    '</div>'+vPlaceHTML(v)+
    '<section class="vps"><p class="vph">Its window <i>'+esc(vDateSay(v))+'</i>'+
      (v.opens||v.closes?'<button class="vreset" data-act="vWinReset" data-v="'+v.id+'" title="Give both ends back to their default">reset</button>':'')+'</p>'+
      vLifeHTML(v)+
      '<dl class="vdl">'+vFactsHTML(v)+(v.note?'<dt>basis</dt><dd>'+esc(v.note)+'</dd>':'')+'</dl>'+
      (w?'<p class="fhint">Drag either end of the band, here, on the board or on Venues, to say how long it is active.</p>':'')+
    '</section>'+
    '<section class="vps"><p class="vph">Rhythm</p>'+vEveryHTML(v)+'</section>'+
    '<section class="vps"><p class="vph">Visits <i>'+esc(vYieldSay(v))+'</i></p>'+
      (visits.length?visits.map(x=>{
        const ld=x.leadId&&leads.find(y=>y.l.id===x.leadId);
        return '<div class="vvis"><span class="vvd">'+esc(shortDay(x.at))+'</span>'+
          '<span class="vgot '+(x.got||'none')+'">'+(x.got?VGOT[x.got]:'visited')+'</span>'+
          '<span class="vvt">'+(ld?'→ <button class="vld" data-act="openArena" data-id="'+ld.a.id+'">'+esc(leadName(ld.l))+'</button>':esc(x.text||''))+'</span>'+
          '<button class="lx" data-act="vVisitDel" data-v="'+v.id+'" data-at="'+x.at+'" title="Take this visit out" aria-label="Remove visit">✕</button></div>';
      }).join(''):'<p class="vnone">None yet. Go records each one.</p>')+
    '</section>'+
    '<section class="vps"><p class="vph">Leads from here</p>'+
      (leads.length?leads.map(({a,l})=>'<p class="vlead"><button data-act="openArena" data-id="'+a.id+'">'+esc(leadName(l))+'</button>'+
        '<i>'+esc(a.name)+' · '+(l.doneAt?(isOutcome(l.outcome)?OUTCOMES[l.outcome].said:'closed'):STAGE_NAME[stageOf(l)])+'</i></p>').join(''):'')+
      (adding?leadFormHTML(null,v):'<div class="leadadd"><button data-act="vLeadNew" data-v="'+v.id+'">+ Lead from here</button></div>')+
    '</section>'+
    '<section class="vps"><p class="vph">Serves</p>'+
      '<div class="vserves">'+venueArenas(v).map(a=>{const tone=arenaTone(a);
        return '<span class="vsv"><button class="cuat'+(tone?' toned':'')+'" data-act="openArena" data-id="'+a.id+'"'+(tone?' style="--tone:'+esc(tone)+'"':'')+'>'+esc(a.name)+'</button>'+
          '<button class="lx" data-act="vArenaDel" data-v="'+v.id+'" data-id="'+a.id+'" title="It does not serve '+esc(a.name)+'" aria-label="Remove '+esc(a.name)+'">✕</button></span>';}).join('')+
      '</div>'+
      (addable.length?'<select class="vaddar" data-vaddarena="'+v.id+'" aria-label="Another arena it serves"><option value="">+ Another arena it serves</option>'+
        addable.map(a=>'<option value="'+a.id+'">'+esc(a.name)+'</option>').join('')+'</select>':'')+
    '</section>'+
    '<section class="vps"><p class="vph">Other pages</p>'+
      v.pages.map(p=>'<div class="vpg"><a href="'+esc(p.url)+'" target="_blank" rel="noopener" title="'+esc(p.url)+'">↗ '+esc(p.label||linkName(p))+'</a>'+
        '<span class="vpgh">'+esc(linkHost(p))+'</span>'+
        '<button class="lx" data-act="vPageDel" data-v="'+v.id+'" data-p="'+p.id+'" title="Take this page off" aria-label="Remove page">✕</button></div>').join('')+
      '<form class="vpageform" data-v="'+v.id+'"><input name="url" placeholder="https://… another page of it" aria-label="Address" autocomplete="off">'+
        '<input name="label" placeholder="Name it — optional" aria-label="Name" autocomplete="off"><button type="submit" class="ib" title="Add" aria-label="Add page">✓</button></form>'+
    '</section>'+
    '<section class="vps"><p class="vph">Your note</p>'+
      '<textarea class="vmemo" data-vmemo="'+v.id+'" rows="2" placeholder="Anything worth remembering about it">'+esc(v.memo||'')+'</textarea></section>'+
  '</div>'+
  '<div class="cfoot">'+
    '<button class="btn" data-act="vEdit" data-v="'+v.id+'">Edit</button>'+
    '<span class="sp"></span>'+
    '<button class="btn ghost" data-act="vRemove" data-v="'+v.id+'" title="Off the board altogether; the agent will not bring it back">Remove</button>'+
  '</div>';
}
/* The form a venue is made and changed in. Its event days are written the
   way an arena's dates are, with the same reading of how well they are
   known; its window is two optional days, which dragging sets as well. */
function venueFormHTML(v,aid){
  const g=v?v.gran:'none';
  const dt=v&&v.start?v:null;
  const grade=v?v.grade:gradeDefault(g);
  const grans=[['none','No event days'],['day','Exact day'],['range','Exact span'],['month','A month'],['quarter','A quarter'],
               ['half','A half-year'],['year','A year']]
    .map(([x,n])=>'<option value="'+x+'"'+(x===g?' selected':'')+'>'+n+'</option>').join('');
  const arenas=liveArenas().slice().sort((x,y)=>x.name.localeCompare(y.name));
  return '<form class="dform vform" data-v="'+(v?v.id:'new')+'">'+
    '<input type="hidden" name="kind" value="event">'+
    (v?'':'<div class="fld"><label>Serves</label><select name="arena"><option value="">Choose an arena</option>'+
      arenas.map(a=>'<option value="'+a.id+'"'+(a.id===aid?' selected':'')+'>'+esc(a.name)+'</option>').join('')+'</select></div>')+
    '<div class="fld"><label>Name</label><input name="label" value="'+esc(v?v.name:'')+'" placeholder="e.g. Cluster 4 brokerage day, Brussels" autocomplete="off"></div>'+
    '<div class="fld"><label>Website</label><input name="url" value="'+esc(v?v.url:'')+'" placeholder="Its own page" autocomplete="off"></div>'+
    '<div class="f2"><div class="fld"><label>Opens</label><input type="text" inputmode="none" readonly data-cal data-cal-none name="opens" placeholder="Optional" value="'+esc(v&&v.opens||'')+'"></div>'+
    '<div class="fld"><label>Closes</label><input type="text" inputmode="none" readonly data-cal data-cal-none name="closes" placeholder="Optional" value="'+esc(v&&v.closes||'')+'"></div></div>'+
    '<p class="fhint">How long it is active. Left empty, it opens three weeks before its event days and closes two weeks after; a new venue with no event days opens today.</p>'+
    '<div class="fld"><label>Event days — how well known</label><select name="gran">'+grans+'</select></div>'+
    '<div class="fld"><label>When</label><span class="granIn">'+granInputsHTML(g,dt)+'</span></div>'+
    '<div class="fld gradefld"><label>Certainty</label>'+gradeSegHTML(g,grade)+'</div>'+
    '<div class="fld"><label>Basis</label><input name="note" value="'+esc(v&&v.note||'')+'" placeholder="Where the dates come from — optional" autocomplete="off"></div>'+
    '<div class="fbtns"><button type="button" class="btn" data-act="vEditCancel">Cancel</button>'+
      '<button type="submit" class="btn primary">'+(v?'Save':'Add venue')+'</button></div>'+
  '</form>';
}
function venueEditHTML(v,aid){
  return '<div class="cbody vpanel"><div class="chead">'+
      '<button class="x" data-act="closeDrawer" aria-label="Close">✕</button>'+
      '<h2 id="aname">'+(v?esc(v.name):'New venue')+'</h2>'+
      '<p class="meta">'+(v?'Editing':'A place you go to find projects in the making — it goes straight to Venues')+'</p></div>'+
    venueFormHTML(v,aid)+'</div>';
}
/* What the form says, or null when the date is incomplete (readDateForm
   says so). A venue with no event days and no window is still a venue: it
   waits under Arising, not dated yet. */
function readVenueForm(f){
  const url=f.elements.url.value.trim();
  const o={kind:'event',name:f.elements.label.value.trim(),url:url?leadLinkUrl(url):''};
  f.elements.kind.value='brokerage';
  const d=readDateForm(f);
  f.elements.kind.value='event';
  if(!d)return null;
  Object.assign(o,{gran:d.gran,start:d.start,end:d.end,grade:d.grade,note:d.note,
    opens:f.elements.opens.value||null,closes:f.elements.closes.value||null});
  return o;
}
function openVenue(id){
  closeComposers();
  drawer.id=null;drawer.vid=id;drawer.vnew=null;drawer.edit=null;drawer.hi=null;drawer.editing=false;drawer.scope=null;
  renderDrawer();
  refreshAsks();
  $('#card').focus({preventScroll:true});
}
function newVenue(aid){
  closeComposers();
  drawer.id=null;drawer.vid=null;drawer.vnew={aid:aid||null};drawer.editing=true;drawer.edit=null;drawer.scope=null;
  renderDrawer();
  const f=$('#card .vform input[name=label]');if(f)f.focus({preventScroll:true});
}
/* Removing a venue takes it off the whole board, but leaves a stub with
   its name, site and arenas, so the agent sees it was turned down and does
   not put it back (see "venues"). A lead started from it keeps its own
   record and only forgets where it came from. */
function dropVenue(id){
  const v=venue(id);if(!v)return;
  for(const k of Object.keys(v))if(!['id','kind','name','url','arenas','gran','start','end','grade','foundAt'].includes(k))delete v[k];
  v.place='gone';v.goneAt=todayISO();v.visits=[];v.pages=[];v.note='';
  for(const a of S.arenas)for(const l of a.leads||[])if(l.venueId===id)delete l.venueId;
  if(drawer.vid===id)drawer.vid=null;
  if(vAsking===id){vAsking=null;renderAsk();}
  save();renderAll();
}
/* The venues an arena is served by, in its panel: where each stands, the
   Go, and a new one for it. */
function arenaVenuesHTML(a){
  const vs=venuesOf(a);
  const by=v=>{const w=vWin(v);return w&&w.from!==null?w.from:1e15;};
  const rows=vs.slice().sort((x,y)=>by(x)-by(y)||x.name.localeCompare(y.name)).map(v=>
    '<div class="avrow st-'+v.place+(vState(v)==='over'?' over':'')+(vDue(v)?' due':'')+'">'+vGlyph(v)+
      '<span class="avt"><button class="vnm" data-act="openVenue" data-v="'+v.id+'">'+esc(v.name)+'</button>'+
        '<i>'+(onTrial(v)?'<b class="avplace">'+(v.place==='new'?'new':'on the board')+'</b> · ':'')+esc(vDateSay(v))+'</i></span>'+
      '<span class="vend">'+vGoHTML(v)+'</span></div>').join('');
  return '<section class="card pcard brok"><div class="chd"><span class="ctitle">Venues</span>'+
      '<button class="ib cact" data-act="vNew" data-id="'+a.id+'" title="A new venue for '+esc(a.name)+'">+</button></div>'+
    (rows?'<div class="avlist">'+rows+'</div>':'<div class="cbd"><p class="ptext vnone">No venue yet — a place it is served by, where projects in the making can be found.</p></div>')+
  '</section>';
}

/* ============ drawer ============ */
/* `vid` is a venue standing in the drawer in place of an arena, and `vnew`
   the venue being made, with the arena it was begun from */
const drawer={id:null,vid:null,vnew:null,edit:null,hi:null,editing:false,scope:null};
/* which card has its follow-up composer open, which has its link composer open,
   and which one just moved */
/* leadEdit.a is BOARD while the new-lead form stands on Leads rather than in
   an arena's panel; no arena's id can be that word. */
const BOARD='leads-board';
let leadLastArena=null;
let lkEdit={a:null,l:null},leadEdit={a:null,l:null};
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
    case 'day':return '<input type="text" inputmode="none" readonly data-cal name="day" placeholder="Pick a day" value="'+(dt&&dt.gran==='day'?dt.start:'')+'">';
    case 'month':return yIn+mSel(dt&&dt.gran==='month'?+dt.start.slice(5,7):new Date().getMonth()+1);
    case 'quarter':{const q=dt&&dt.gran==='quarter'?Math.floor((+dt.start.slice(5,7)-1)/3)+1:1;
      return yIn+'<select name="q" aria-label="Quarter">'+[1,2,3,4].map(n=>'<option value="'+n+'"'+(n===q?' selected':'')+'>Q'+n+'</option>').join('')+'</select>';}
    case 'half':{const hh=dt&&dt.gran==='half'?(+dt.start.slice(5,7)<7?1:2):1;
      return yIn+'<select name="h" aria-label="Half">'+[1,2].map(n=>'<option value="'+n+'"'+(n===hh?' selected':'')+'>H'+n+'</option>').join('')+'</select>';}
    case 'year':return yIn;
    case 'range':return '<input type="text" inputmode="none" readonly data-cal name="from" placeholder="From" value="'+(dt&&dt.gran==='range'?dt.start:'')+'" aria-label="From">'+
                        '<input type="text" inputmode="none" readonly data-cal name="to" placeholder="To" value="'+(dt&&dt.gran==='range'?dt.end:'')+'" aria-label="To">';
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
  /* the events the arena is served by stand in its stream as its brokerage
     dates did, in time order among the calls */
  const evs=venuesOf(a).filter(v=>v.start).map(v=>({id:v.id,kind:'brokerage',label:v.name,
    gran:v.gran,start:v.start,end:v.end,grade:v.grade,note:v.note,url:v.url}));
  a.dates.concat(evs).forEach(dt=>{
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
/* how many marks the panel is showing, and the tick that clears them */
function freshSaid(a){
  const n=freshItems(a).length;
  return n?'<i class="wfresh" title="'+n+' new thing'+(n===1?'':'s')+', marked new below">'+n+' new</i>'+
    '<button class="btn ghost wseen" data-act="seenArena" data-id="'+a.id+'">Seen \u2713</button>':'';
}
/* The panel's band of leads. It carried the arena's sweep, the ring that
   asked the nightly agent and the wait as well, until the rotation of
   arenas went with the Marketplace (2026-10-14): the venues come round now,
   and the agent is asked from a Claude session. */
function rotBarHTML(a){
  return '<div class="rotbar">'+
    (freshItems(a).length?'<div class="swept">'+freshSaid(a)+'</div>':'')+
    '<div class="wbody">'+leadListHTML(a,leadHits(a,S.ui.q.trim().toLowerCase()))+'</div>'+
  '</div>';
}
function readHTML(a){
  const tags=(a.tags||[]).map(t=>'#'+esc(t)).join('<i>\u00B7</i>');
  const bk=a.brokerage||{notes:'',links:[]};
  const blocks=panelCard('About',false,a.notes||'',a.links,'editCard',a)+
               panelCard('Brokerage',true,bk.notes||'',bk.links,'editBrokerage',a)+
               arenaVenuesHTML(a);
  /* Freezing suspends the rotation entirely, so the panel stops offering the
     parts of it that could not fire — a follow-up or a wait set here would
     promise a return the freezer has already ruled out. Anything already parked
     keeps its place in the record and resumes on thaw, which the banner says. */
  const nOpen=openLeads(a).length;
  const parked=nOpen?' Its '+(nOpen===1?'lead resumes':nOpen+' leads resume')+' when you thaw it.':'';
  const frozen=a.frozenAt
    ?'<div class="frozenbar"><i class="frost"></i>'+
       '<span class="frtx">In the freezer since '+esc(shortDay(a.frozenAt))+
         ' \u2014 kept off the board, and its venues off Venues, unless they serve another arena too.'+parked+'</span>'+
       '<button class="btn" data-act="thaw" data-id="'+a.id+'">Thaw</button></div>'
    :'';
  return '<div class="cbody">'+
    '<div class="chead">'+
      '<button class="x" data-act="closeDrawer" aria-label="Close">\u2715</button>'+
      '<h2 id="aname">'+esc(a.name)+'</h2>'+
      '<p class="meta">'+esc(typeName(a.typeId))+(tags?'<i>\u00B7</i>'+tags:'')+'</p>'+
      '<div class="vchrow">'+arenaAgentHTML(a)+'</div>'+
    '</div>'+
    frozen+
    '<div class="blocks">'+blocks+(a.frozenAt?'':rotBarHTML(a))+'</div>'+
    '<div class="rule"></div>'+
    '<div class="stream">'+streamHTML(a)+'</div>'+
    '</div>'+
    '<div class="cfoot">'+
      '<button class="btn" data-act="editCard">Edit</button>'+
      (a.frozenAt?'':'<button class="btn ghost" data-act="freeze" data-id="'+a.id+'" '+
        'title="Keep this arena off the board, and its venues off Venues">Freeze</button>')+
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
    ' It changes how often the venues serving this arena come round, not how loudly they shout when they do. '+
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
  const v=drawer.vid?venue(drawer.vid):null;
  const a=v||drawer.vnew?null:arena(drawer.id);
  if(!a&&!v&&!drawer.vnew){c.classList.remove('open');sc.classList.remove('open');c.innerHTML='';return;}
  const body=c.querySelector('.cbody');const top=body?body.scrollTop:0;
  /* a venue's note keeps its caret while the panel is drawn again round it */
  const typing=document.activeElement&&document.activeElement.matches&&document.activeElement.matches('textarea.vmemo')?document.activeElement:null;
  if(typing&&v&&c.contains(typing))return;
  c.innerHTML=drawer.vnew?venueEditHTML(null,drawer.vnew.aid):
    v?(drawer.editing?venueEditHTML(v):venueReadHTML(v)):(drawer.editing?editHTML(a):readHTML(a));
  c.querySelectorAll('textarea.vmemo').forEach(autoGrow);
  if(v||drawer.vnew){growAll(c);sc.classList.add('open');c.classList.add('open');
    const nb=c.querySelector('.cbody');if(nb)nb.scrollTop=top;return;}
  if(drawer.editing){
    const ta=c.querySelector('textarea[data-field=notes]');if(ta){ta.value=a.notes||'';autoGrow(ta);}
    const tb=c.querySelector('textarea[data-field=bknotes]');if(tb){tb.value=(a.brokerage&&a.brokerage.notes)||'';autoGrow(tb);}
  }
  sc.classList.add('open');c.classList.add('open');
  const nb=c.querySelector('.cbody');if(nb)nb.scrollTop=top;
  if(!drawer.editing)drawCallSpans(a);
}
function openDrawer(id,dateId){
  drawer.id=id;drawer.vid=null;drawer.vnew=null;drawer.edit=null;drawer.hi=dateId||null;drawer.editing=false;drawer.scope=null;
  renderDrawer();
  refreshAsks();
  /* the panel is fixed inside a box that scrolls; focusing it without this
     asks the browser to bring it into view, and the board jumps to the top */
  $('#card').focus({preventScroll:true});
  if(dateId){const el=$('#card .ln.hi');if(el)el.scrollIntoView({block:'center'});}
}
/* What the agent brought an arena is marked new until its panel has been
   looked at and shut again; it was the arena's sweep that cleared it, until
   the sweep went with the rotation (2026-10-14). */
function closeDrawer(){
  const a=!drawer.vid&&!drawer.vnew&&arena(drawer.id);
  if(leadEdit.a===VENUE_LEAD)closeComposers();
  drawer.id=null;drawer.vid=null;drawer.vnew=null;drawer.edit=null;drawer.hi=null;drawer.editing=false;drawer.scope=null;renderDrawer();
  repaint();
}

/* ============ actions ============ */
function bkPos(a){return typeof a.bkPos==='number'?a.bkPos:1e9;}

const daysBetween=(a,b)=>Math.round((b-a)/DAY);

/* this year is understood, so it goes unsaid */
const trimYear=s=>{const y=' '+new Date().getFullYear();return s.endsWith(y)?s.slice(0,-y.length):s;};
const shortDay=iso=>trimYear(fmtDay(iso));
const shortDate=dt=>(dt.gran==='range'&&dt.start&&dt.end)
  ? shortDay(dt.start)+' \u2013 '+shortDay(dt.end)
  : trimYear(dispDate(dt));

/* What a visit turned up. A lead is open until you tick it off; a done one stays
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

/* What the nightly agents brought, and whether you have looked since. A date
   or a link that comes in through Dispatches, or in a file imported with it,
   carries `foundAt`, the moment it was accepted, and reads as new until Mark
   marks the arena seen (`seenAt`), with the tick on its row, in the tray or
   in its panel. Until 2026-10-17 shutting the panel marked it seen, and a
   glance at an arena cleared what he had meant to come back to; he asked
   for the new to stay until he checks it off. Before any of this an
   accepted finding simply joined the arena and looked exactly like
   something typed by hand, so a morning's Accept all left nothing to say
   what had changed. */
function isFresh(a,x){return !!(x&&x.foundAt)&&(!a.seenAt||x.foundAt>a.seenAt);}
function freshItems(a){
  const bk=a.brokerage||{links:[]};
  return (a.dates||[]).concat(bk.links||[],a.links||[]).filter(x=>isFresh(a,x));
}
function foundTitle(x){
  return 'Found by the nightly agent'+(x.foundAt?' — accepted '+shortDay(x.foundAt.slice(0,10)):'')+
    '. New until you mark this arena seen.';
}
function freshTag(a,x){
  return isFresh(a,x)?'<i class="wfresh" title="'+esc(foundTitle(x))+'">new</i>':'';
}
/* Every link row in the panel: the link, its host, then the things you do
   to it in passing. `scope` says which of the arena's two lists it is in,
   so a row can also be dragged to a new place (see "putting links in your
   own order"). The rotation cards showed the same rows with a stamp, until
   the cards went with the Marketplace (2026-10-14). */
function wallLinkRows(a,list,scope){
  return (list||[]).map(lk=>{
    const nm=esc(linkName(lk));
    const body=lk.url
      ? '<a class="wlink" draggable="false" href="'+esc(lk.url)+'" target="_blank" rel="noopener" title="'+esc(lk.url)+'">'+
          '<span class="wn">'+nm+'</span>'+freshTag(a,lk)+'<span class="wd">'+esc(linkHost(lk))+'</span></a>'
      : '<span class="wlink dead"><span class="wn">'+nm+'</span>'+freshTag(a,lk)+'</span>';
    const ref=' data-a="'+a.id+'" data-lks="'+scope+'" data-l="'+esc(lk.id||'')+'"';
    /* a brokerage link that is a place to go and look can be made a venue,
       where it comes round and is visited (2026-10-14); it was the arena's
       general tool, marked here by a diamond, until then */
    const make=scope==='brokerage'&&lk.url&&!/^mailto:/i.test(lk.url)
      ? '<button class="lmake" data-act="vMake"'+ref+' title="Make this a venue \u2014 a place you visit, straight into Venues" '+
          'aria-label="Make a venue of '+nm+'">\u2192 venue</button>'
      : '';
    return '<div class="wlrow" data-lk="'+esc(lk.id||'')+'">'+body+
      '<span class="wlc">'+make+
        '<button class="ldel" data-act="lkDel"'+ref+' title="Remove this link" aria-label="Remove '+nm+'">✕</button>'+
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
/* a change to a link shows in the panel and wherever else it is drawn */
function relinked(){save();repaint();renderDrawer();}
function wallLinks(a,scope,rows){
  return '<div class="wlinks" data-a="'+a.id+'" data-lks="'+scope+'">'+rows+'</div>';
}
/* ---- a call's run ----
   The stages of one call — Stage 1 and Stage 2, pre- and full proposals,
   outline and full proposal, PO and FPP (Mark, 2026-10-18) — are one bar with a notch at each earlier
   deadline (`callBase`), and calls with exactly the same dates are one bar,
   because a cluster's work programme opens a dozen topics on the same two
   days and a dozen identical bars say nothing. Drawn so on the rotation
   cards first (Mark, 2026-10-07), and on the board since; the cards went
   with the Marketplace (2026-10-14). */
function callBase(n){
  return String(n||'').replace(/\s*\(expected\)/ig,'')
    .replace(/\s*[–—-]\s*(stage\s*\d|pre-?proposals?|full( project)? proposals?|project outline|(?:po|fpp)\b).*$/i,'')
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
  /* the weeks that count for brokerage: publication to the first deadline */
  const wk=r.open&&r.dls[0]?Math.round((T(r.dls[0].start)-T(r.open.start))/(7*DAY)):-1;
  const brk=wk>=0?'\nFor brokerage: '+wk+(wk===1?' week':' weeks')+' to the first deadline':'';
  return names.join('\n')+'\n'+span+stages+brk+(r.unc?'\nUncertain':'');
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
   card now (see "one lead card, in both rooms"), so this has one job. Without
   an arena it is the one Leads opens, where no arena is in hand yet, and the
   arena is chosen in front of the rest, as Coming up's new event chooses its
   own (Mark asked to add leads from Leads on 2026-10-12). */
function leadFormHTML(a,ven){
  /* Both boxes grow as you type rather than scrolling sideways: what you are
     writing here is a couple of sentences, and losing sight of the first half
     of them while writing the second is the whole problem with a one-line
     field. The stage and the date are not here — they are set on the row
     itself, where they are read, and a property with two doors is exactly
     what this card had too much of. */
  const box=(k,v,ph)=>'<textarea class="grow" name="'+k+'" rows="1" placeholder="'+ph+'" '+
    'aria-label="'+ph+'">'+esc(v||'')+'</textarea>';
  /* the rotation's order, top card first, as the Ledger's new lead offers
     them, and the last one filed under kept: leads come out of one sweep */
  /* Begun from a venue, it is filed under one of the arenas the venue
     serves, chosen only when there is more than one, and it remembers the
     venue (2026-10-14). */
  const from=ven?venueArenas(ven).filter(x=>!x.frozenAt):null;
  const pick=a?'':from&&from.length===1?'<input type="hidden" name="arena" value="'+from[0].id+'">':
    '<select name="arena" required aria-label="The arena this lead is filed under">'+
    '<option value="">Choose an arena</option>'+
    (from?from.map(x=>({id:x.id,name:x.name})):arenasForBoard()).map(x=>'<option value="'+x.id+'"'+(x.id===leadLastArena?' selected':'')+'>'+
      esc(x.name)+'</option>').join('')+'</select>';
  return '<form class="leadform'+(a?'':' leadboard')+'" data-la="'+(a?a.id:'')+'"'+(ven?' data-venue="'+ven.id+'"':'')+' data-lid="new">'+
    pick+
    box('project','','What is the project?')+
    box('match','','Who could be a good match?')+
    /* who is behind the project and who to write to there, asked for on
       2026-10-14 so the weekly Excel can say it beside each lead */
    box('coordinator','','Coordinator \u2014 the organisation that started it, optional')+
    box('contact','','Main contact person \u2014 optional')+
    box('email','','Their email address \u2014 optional')+
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
/* Each says what kind it is and where it goes: a mark for a page, a letter or
   a document, the name, and at the far end the host or the address in a
   quieter hand \u2014 which a bare name hid until it was hovered. */
function leadLinkRows(a,l,shut){
  return (l.links||[]).map(lk=>{
    const nm=esc(linkName(lk)),url=String(lk.url||''),mail=/^mailto:/i.test(url);
    let host='';
    if(mail)host=url.slice(7);
    else if(url){try{host=new URL(url).hostname.replace(/^www\./,'');}catch(e){host=url;}}
    const kind=mail?'mail':/\.(pdf|docx?|pptx?|xlsx?)([?#]|$)/i.test(url)?'doc':'web';
    const ico='<span class="lki" aria-hidden="true">'+LEAD_ICON[url?kind:'web']+'</span>';
    const said='<span class="llnm">'+nm+'</span>'+(host&&host!==linkName(lk)?'<span class="llhost">'+esc(host)+'</span>':'');
    const body=url
      ? '<a class="lla" draggable="false" href="'+esc(url)+'" target="_blank" rel="noopener" '+
          'title="'+esc(mail?'Write to '+host:url)+'">'+ico+said+'</a>'
      : '<span class="lla dead">'+ico+said+'</span>';
    const x=shut?'':'<button class="lx" data-act="leadLinkDel" data-id="'+a.id+'" data-l="'+l.id+'" '+
      'data-k="'+lk.id+'" title="Take this link off" aria-label="Remove link">\u2715</button>';
    return '<div class="llrow">'+body+x+'</div>';
  }).join('');
}
/* The marks on the two boxes, drawn in the stroke of the text beside them.
   The Ledger draws the same five for the same lead, to the same geometry. */
const LEAD_ICON=(()=>{
  const s=d=>'<svg viewBox="0 0 12 12">'+d+'</svg>';
  return {
    org:s('<path d="M2 11V3.6L6 1.6l4 2V11M1 11h10M4.8 11V8.2h2.4V11"/>'),
    person:s('<circle cx="6" cy="3.9" r="2.2"/><path d="M1.9 11c.6-2.4 2.1-3.6 4.1-3.6s3.5 1.2 4.1 3.6"/>'),
    mail:s('<rect x="1.2" y="2.6" width="9.6" height="6.8" rx="1"/><path d="M1.6 3.2 6 6.6l4.4-3.4"/>'),
    web:s('<path d="M4.6 2.6H2.4v7h7V7.4M6.6 1.6h3.8v3.8M10.4 1.6 5.6 6.4"/>'),
    doc:s('<path d="M3 1.4h4l2.6 2.6v6.6H3zM7 1.4V4h2.6"/>')
  };
})();
/* An address as it is kept: bare, never with the "mailto:" a link wears. */
const leadMail=v=>String(v||'').trim().replace(/^mailto:/i,'').trim();
function leadPanesHTML(a,l,shut,adding){
  const mail=leadMail(l.email),n=(l.links||[]).length;
  const row=(ico,v,k)=>'<p class="lwrow"><span class="lki" aria-hidden="true">'+LEAD_ICON[ico]+'</span>'+
    '<span class="lwv">'+esc(v)+'</span><i>'+k+'</i></p>';
  const who=l.coordinator||l.contact||mail
    ? '<div class="lpane" data-act="leadStay"><p class="lph">Who</p>'+
        (l.coordinator?row('org',l.coordinator,'Coordinator'):'')+
        (l.contact?row('person',l.contact,'Main contact'):'')+
        (mail?'<p class="lmrow"><a class="lmail" href="mailto:'+esc(mail)+'" draggable="false" '+
            'title="Write to '+esc(l.contact||mail)+'"><span class="lki" aria-hidden="true">'+LEAD_ICON.mail+'</span>'+
            '<span>'+esc(mail)+'</span></a>'+
          '<button class="lcopy" data-act="copyMail" data-v="'+esc(mail)+'" title="Copy the address">Copy</button></p>':'')+
      '</div>'
    : '';
  /* The box is there on an open lead even with nothing in it, because the
     way to add a link is on its head now (Mark, 2026-10-21); a closed lead
     with none has nothing to add to and shows none. */
  const links=n||adding||!shut
    ? '<div class="lpane" data-act="leadStay"><p class="lph">Links'+(n?'<b>'+n+'</b>':'')+
        (shut||adding?'':'<button class="lact lphb" data-act="lkAdd" data-id="'+a.id+'" data-l="'+l.id+'" '+
          'title="A web address, or a contact’s email address">+ Link or email</button>')+'</p>'+
        (n?'<div class="llinks">'+leadLinkRows(a,l,shut)+'</div>':adding?'':'<p class="lnil">None yet</p>')+
        (adding?lkFormHTML(a,l.id):'')+
      '</div>'
    : '';
  return who||links?'<div class="lpanes">'+who+links+'</div>':'';
}
/* What has happened, newest first, in a box of its own under the two, with
   + Add update on its head and the line being written straight under it,
   above the lines already there (Mark, 2026-10-21: "add update right above
   the update pane"). The button stood in a row at the top of the card, and
   the line it opened came up there, apart from the history it joins. */
function leadUpdHTML(a,l,shut,writing){
  const ups=l.updates||[];
  if(shut&&!ups.length)return '';
  const more=updOpen.has(l.id),ids='data-id="'+a.id+'" data-l="'+l.id+'"';
  const rows=(more?ups.map((u,i)=>[u,i]):ups.map((u,i)=>[u,i]).slice(-UPD_SHOWN)).reverse();
  return '<div class="lpane lupdpane" data-act="leadStay"><p class="lph">Updates'+(ups.length?'<b>'+ups.length+'</b>':'')+
      (shut||writing?'':'<button class="lact prim lphb" data-act="noteAdd" '+ids+'>+ Add update</button>')+'</p>'+
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
      : writing?'':'<p class="lnil">Nothing yet</p>')+
  '</div>';
}
/* Through a selected, off-screen field first, as the Ledger's mailing list
   copies, because that works from file:// in every browser the app opens
   in; the asynchronous clipboard only if it refuses. */
function copyText(t,done){
  const ta=document.createElement('textarea');
  ta.value=t;ta.setAttribute('readonly','');
  ta.setAttribute('style','position:fixed;left:-9999px;top:0;opacity:0');
  document.body.appendChild(ta);ta.select();
  let ok=false;try{ok=document.execCommand('copy');}catch(e){}
  ta.remove();
  if(ok||!(navigator.clipboard&&navigator.clipboard.writeText)){done(ok);return;}
  navigator.clipboard.writeText(t).then(()=>done(true),()=>done(false));
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
   nothing. A lead made Talking lights every dot on its way (Mark,
   2026-10-21): it used to take only the lower path when none was lit, which
   left a talking lead looking half-reached, and he had to press the other
   two by hand each time. Taken back to Contacted, it keeps both paths. */
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
    l.toResearchers=true;l.toLead=true;
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
/* Which of Contacted's two paths a lead is on, for the order of Leads.
   Both ways first: those are the most promising, and Mark asked for them on
   top of the stack (2026-10-08). The Ledger's list keeps the same order. */
const KIND_RANK={both:0,researchers:1,lead:2};
const KIND_NAME={researchers:'researchers contacted',both:'both contacted',lead:'lead contacted'};
function leadKind(l){return l.toResearchers&&l.toLead?'both':(l.toResearchers?'researchers':'lead');}
/* ───────── one lead card, in both rooms ─────────
   Mark asked on 2026-10-06 for a lead to look the same wherever it is shown,
   and chose the Ledger's card as the standard: shut until pressed. So a lead
   here is two lines — its three steps and its day, then its name — and a press
   opens it: Edit and Complete at its head, who and the links side by side
   under it, and its updates under those, newest first, each with its day.
   Since 2026-10-21 each box carries the button that adds to it, where the
   Ledger's card still has its one row of them, in the same words. The
   colours stay this room's: dark on the wall and the board, paper in the
   drawer.

   Which leads stand open is not saved: it is where you are working this
   session, as it is on the Ledger. Opening a composer opens its lead. */
const leadOpen=new Set();
/* The leads table's columns, and what its heading sorts each step by. The
   order chosen is not saved either: it is a way of looking for something
   now. Unsorted, each step runs by the day, as it always has. The last
   update and the score put the newest and the best first. */
const LEAD_COLS=[{name:'Step'},{name:'Arena',k:'arena'},{name:'Project',k:'project'},{name:'Match',k:'match'},
  {name:'Who',k:'who'},{name:'Last update',k:'update'},{name:'Score',k:'score'},{name:'Next',k:'day'}];
const lastAt=l=>{const u=(l.updates||[])[(l.updates||[]).length-1];return u?(u.at||''):'';};
const byText=f=>(x,y)=>{const p=f(x),q=f(y);return !p!==!q?(p?-1:1):p.localeCompare(q);};
const LEAD_SORT={
  arena:byText(x=>x.a.name),
  project:byText(x=>leadName(x.l)),
  match:byText(x=>x.l.match||''),
  who:byText(x=>x.l.contact||x.l.coordinator||''),
  update:(x,y)=>{const p=lastAt(x.l),q=lastAt(y.l);return p===q?0:p>q?-1:1;},
  score:(x,y)=>(y.l.score||0)-(x.l.score||0),
  day:(x,y)=>!!x.l.due!==!!y.l.due?(x.l.due?-1:1):x.l.due===y.l.due?0:x.l.due<y.l.due?-1:1
};
let leadSort={k:null,rev:false};
const STAGE_SAY={talking:'a conversation is running',contacted:'written to, waiting for an answer',
  spotted:'found, nobody written to yet'};
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
  /* within the week: the leads table colours it as coming (Mark chose the
     table with its dates coloured by how near they are, 2026-10-21) */
  const soon=over!==null&&over<0&&over>=-7&&!done;
  const st=stageOf(l);
  const ups=l.updates||[];
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
     wide, where the long form pushed the match out, and short in the
     table's last column, where how near it is is said beside it. */
  /* While the card is being edited the day is one more of its fields: its
     calendar writes into the edit (`name="due"`) instead of saving at once,
     because a save redraws the card and would throw away everything else
     typed into it. The ruit waits for the same reason. */
  const near=say&&l.due&&!done?(over>1?' · '+over+' days late':over===1?' · 1 day late':over===0?' · today':''):'';
  const when=done
    ? '<span class="lwhen shut" title="Closed">'+(isOutcome(l.outcome)?OUTCOMES[l.outcome].said+' · ':'closed ')+
        esc(shortDay(l.doneAt))+'</span>'
    : editing
    ? '<label class="lwhen set" title="The day to come back to this — click to change it">'+
        '<span>'+esc(l.due?shortDow(l.due):'No date')+'</span>'+
        '<input type="text" inputmode="none" readonly data-cal data-cal-none name="due" value="'+esc(l.due||'')+'" '+
          'aria-label="Come back on"></label>'
    : '<label class="lwhen'+(l.due?' set':'')+(due?' late':'')+(soon?' soon':'')+'" '+
        'title="'+(l.due?esc(longDay(l.due))+' — ':'')+'The day to come back to this — click to set it">'+
        '<span>'+esc(l.due?shortDow(l.due):'No date')+(near?'<i class="lnear">'+esc(near)+'</i>':'')+'</span>'+
        '<input type="text" inputmode="none" readonly data-cal data-cal-none value="'+esc(l.due||'')+'" data-lda="'+a.id+'" data-ldl="'+l.id+'" '+
          'aria-label="Come back on"></label>';
  /* How a lead ends, and the way into editing it, stand at the head of the
     open card, on the line they change (Mark, 2026-10-21, from a drawn
     sheet): in the arena's panel at its top right, on the table in the
     column that says the last update when the lead is shut, since the
     updates themselves are in sight below once it is open. Each other verb
     moved onto the box it adds to: + Add update on the updates, + Link or
     email on the links. They were one row of buttons between the head and
     the boxes, and the update written with the first of them landed a
     screen below it. Pressed, Complete asks how the lead ended. */
  const doneBtn='<button class="ldone'+(done?' back':'')+'" data-act="leadDone" '+ids+' '+
      'title="'+(done?'Put this lead back into the funnel':'Done with this one — say how it ended; it stays in the record')+'" '+
      'aria-label="'+(done?'Reopen this lead':'Complete this lead')+'">'+
      '<i aria-hidden="true">'+(done?'↺':'✓')+'</i>'+(done?'Reopen':'Complete')+'</button>';
  const editBtn=done?'':'<button class="lact quiet" data-act="leadEdit" '+ids+' '+
      'title="Edit everything on this lead">✎ Edit</button>';
  const headActs=open&&!editing&&!ending?'<span class="lheadacts">'+editBtn+doneBtn+'</span>':'';
  /* While editing the row under the card is the way out of the edit, and
     while Complete is asking how the lead ended it is the three answers. */
  const acts=ending
    ? '<div class="lacts"><span class="lendq">How did it end?</span>'+
        Object.keys(OUTCOMES).map(k=>'<button class="lact" data-act="leadEnd" '+ids+' data-v="'+k+'">'+
          OUTCOMES[k].name+'</button>').join('')+
        '<span class="sp"></span><button class="lact quiet" data-act="leadEndCancel" '+ids+'>Cancel</button></div>'
    : editing
    ? '<div class="lacts"><span class="lfhint">⌘↩ to save</span><span class="sp"></span>'+
        '<button class="lact quiet" data-act="leadCancel" '+ids+'>Cancel</button>'+
        '<button class="lact prim" data-act="leadSave" '+ids+'>Save</button></div>'
    : '';
  const box=(name,v,ph,cls)=>'<textarea class="grow '+cls+'" name="'+name+'" rows="1" '+
    'placeholder="'+ph+'" aria-label="'+ph+'">'+esc(v||'')+'</textarea>';
  /* While editing, every link is its address and its name, side by side,
     with one empty pair at the foot for a new one; every update is its own
     line of text. A cross marks a line to go and Save takes it out, so
     nothing is lost by a press until the edit is kept. */
  /* Who is behind the project and who to write to there, over the links:
     facts about the lead, where the links are the ways to it. A lead with
     neither shows no band until it is edited. */
  const who=editing
    ? leadSec('who','<div class="lwho">'+
        '<div class="lwr"><i>coordinator</i>'+box('coordinator',l.coordinator,'The organisation that started it','lwin')+'</div>'+
        '<div class="lwr"><i>contact</i>'+box('contact',l.contact,'Main contact person','lwin')+'</div>'+
        '<div class="lwr"><i>email</i>'+box('email',l.email,'The contact’s email address','lwin')+'</div></div>')
    : '';
  /* ── who and the links, side by side ──
     Mark chose this from three drawn (2026-10-16): who is behind the
     project in one box, the ways to it in another, side by side wherever the
     card is wide enough and one over the other in an arena's narrow panel.
     They used to be two labelled bands down the left edge, which left the
     right half of a wide card empty and gave the contact no address; a link
     said neither what kind it was nor where it went. A press inside either
     box keeps the card open, so an address can be selected. */
  const panes=editing?'':leadPanesHTML(a,l,done,adding)+leadUpdHTML(a,l,done,writing);
  /* the venue it was found at, which opens it */
  const fromV=l.venueId&&venue(l.venueId);
  const from=fromV&&!editing?leadSec('from','<button class="lfrom" data-act="openVenue" data-v="'+fromV.id+'" '+
    'title="Open '+esc(fromV.name)+'">'+esc(fromV.name)+'</button>'):'';
  const body=from+who+(editing
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
    : panes);
  const tone=leadToneOf(a);
  /* ── the leads table ──
     Mark chose one table for Leads (2026-10-21), from three drawn beside the
     list it replaced: a line per lead, under its step's coloured heading,
     with the ruit as the first column rather than a coloured box naming
     the step. So on Leads (`say`) the head is a row of cells — the ruit, the
     arena in its type's colour, what it is, who could fit it, who is behind
     it, the last thing that happened, the score, the day — and a press on
     the line opens the lead under it. In the arena's panel the arena goes
     without saying and the day rides on the quiet line, as before. */
  const last=ups.length?ups[ups.length-1]:null;
  const whoSaid=[l.contact,l.coordinator].filter(Boolean).join(' · ');
  const cells=say
    ? (editing
        ? '<div class="ltx">'+box('project',l.project,'What is the project?','lname lname-in')+
            '<div class="lsub">'+box('match',l.match,'Who could be a good match?','lmt lmt-in')+'</div></div>'
        : '<p class="lname" title="'+(open?'Shut this lead':'Open this lead')+'">'+esc(leadName(l))+'</p>'+
          '<span class="lmt'+(l.match?'':' none')+'">'+esc(l.match||'No match yet')+'</span>'+
          '<span class="lcwho'+(whoSaid?'':' none')+'">'+esc(whoSaid||'—')+'</span>'+
          (headActs||'<span class="lcup'+(last?'':' none')+'">'+
            (last?'<i>'+esc(updWhen(last))+'</i>'+esc(last.text||''):'—')+'</span>'))
    : '<div class="ltx">'+
        /* floated, so it takes the top right corner and the name runs beside
           it while the quiet line below keeps the card's whole width */
        headActs+
        (editing
          ? box('project',l.project,'What is the project?','lname lname-in')+
            '<div class="lsub">'+box('match',l.match,'Who could be a good match?','lmt lmt-in')+when+'</div>'
          : '<p class="lname" title="'+(open?'Shut this lead':'Open this lead')+'">'+esc(leadName(l))+'</p>'+
            '<div class="lsub">'+
              '<span class="lmt'+(l.match?'':' none')+'">'+esc(l.match||'No match yet')+'</span>'+
              leadScoreHTML(a,l,done)+when+
            '</div>')+
      '</div>';
  return '<article class="lead k-'+st+(say?' wide':'')+(due?' due':'')+(done?' done':'')+(hit?' hit':'')+
      (open?' open':'')+(editing?' editing':'')+(tone?' toned':'')+
      '"'+(tone?' style="--tone:'+esc(tone)+'"':'')+' data-lid="'+l.id+'" data-act="leadOpen" '+ids+'>'+
    /* Shut, a lead is its ruit beside two lines: what it is, and under it,
       smaller and quieter, who could fit it and the day to come back. The ruit
       leads because it is the thing that changes; a column of these sorts
       itself by how far each has got (Mark chose this over the name leading
       and the ruit closing the row, 2026-10-06). */
    '<header class="lhead">'+leadRuitHTML(a,l,st,done||editing)+
      (say?'<button class="lar" data-act="openArena" data-id="'+a.id+'" '+
        'title="Open '+esc(a.name)+'">'+esc(a.name)+'</button>':'')+
      cells+
      (say?leadScoreHTML(a,l,done||editing)+when:'')+
    '</header>'+
    /* while editing, Cancel and Save come after everything being edited */
    (open?(ending?acts:'')+(body?'<div class="lbody">'+body+'</div>':'')+(editing?acts:''):'')+
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
  leadWhoSet(l,v);
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
/* The coordinator (the organisation that started the project) and the main
   contact person, both plain words and both optional (Mark, 2026-10-14), and
   the contact's email address, kept bare (2026-10-16). A
   field left out of `v` is left alone, so a caller that knows nothing of
   them — an older Pocket — cannot wipe them; an emptied one takes the key
   off, so a lead that never had them stays as it was. */
function leadWhoSet(l,v){
  ['coordinator','contact','email'].forEach(k=>{
    if(typeof v[k]!=='string')return;
    const t=k==='email'?leadMail(v[k]):v[k].trim();
    if(t)l[k]=t;else delete l[k];
  });
}
/* Reads an edited card back out of the page, for leadEditAll. */
function leadEditRead(card){
  const val=(el,n)=>{const f=el&&el.querySelector('[name='+n+']');return f?f.value:'';};
  const due=card.querySelector('input[name=due]');
  const who=card.querySelector('.lwho');
  return {
    due:due?due.value:undefined,
    project:val(card.querySelector('.ltx'),'project'),
    match:val(card.querySelector('.ltx'),'match'),
    coordinator:who?val(who,'coordinator'):undefined,
    contact:who?val(who,'contact'):undefined,
    email:who?val(who,'email'):undefined,
    links:[...card.querySelectorAll('.ledlinks .ledrow')].map(r=>({id:r.dataset.k,
      url:val(r,'url'),label:val(r,'label'),gone:r.classList.contains('gone')})),
    updates:[...card.querySelectorAll('.ledups .ledrow')].map(r=>({i:+r.dataset.u,
      text:val(r,'text'),gone:r.classList.contains('gone')}))
  };
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
      '<p class="lbh" data-mk="g:'+k+'">'+STAGE_NAME[k]+'<b>'+band.length+'</b></p>'+
      '<div class="lgrid">'+band.map(row).join('')+'</div>'+
    '</section>';
  }
  h+='</div>';
  /* the way to add one sits directly under the ones you have, not past the
     record of the ones you have closed */
  if(adding)h+=leadFormHTML(a);
  else h+='<div class="leadadd" data-mk="add"><button data-act="leadAdd" data-id="'+a.id+'">+ Lead</button></div>';
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
    h+='<div class="lclosed'+(shown?' open':'')+'" data-mk="closed">'+
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
function renderWall(){keepPlace(()=>{paintWall();growAll($('#wall'));});}
function paintWall(){
  const w=$('#wall');
  const vis=visibleArenas();
  if(!vis.length){
    const[head,hint]=emptyReason();
    w.innerHTML='<div class="empty"><p>'+head+'</p>'+
      '<p class="hint" style="margin-top:6px">'+hint+'</p></div>';
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
  {
    const all=[];
    for(const a of vis)for(const l of openLeads(a))all.push({a,l});
    const owed=all.filter(({l})=>l.due&&daysBetween(T(l.due),T(todayISO()))>=0).length;
    const arenas=new Set(all.map(({a})=>a.id)).size;
    const adding=leadEdit.a===BOARD;
    let h='<div class="whead lhead">'+
      (all.length?'<span class="wsay"><b>'+all.length+'</b> lead'+(all.length===1?'':'s')+
        ' across <b>'+arenas+'</b> arena'+(arenas===1?'':'s')+
        (owed?', <b>'+owed+'</b> owed today':'')+'.</span>':'')+
      /* The weekly Excel of every lead (Mark, 2026-10-14). A file written
         for reading elsewhere is a door out of the app, so the bridge
         writes it; this room only asks. */
      '<button class="btn leadxl" data-act="leadsExcel" title="Write every lead, open and closed, with its '+
        'updates, into one Excel file \u2014 the same file again each time, where the '+
        'browser allows it">Excel</button>'+
      '<button class="btn leadnew'+(adding?' on':'')+'" data-act="leadAddBoard" aria-expanded="'+adding+'">+ Lead</button>'+
      '</div>'+(adding?leadFormHTML(null):'');
    if(all.length){
      const ql=S.ui.q.trim().toLowerCase();
      const hit=new Set();
      if(ql)for(const a of vis)for(const l of leadHits(a,ql))hit.add(l.id);
      const byDay=(x,y)=>{
        if(!!x.l.due!==!!y.l.due)return x.l.due?-1:1;
        if(x.l.due&&y.l.due&&x.l.due!==y.l.due)return x.l.due<y.l.due?-1:1;
        return leadName(x.l).localeCompare(leadName(y.l));
      };
      const sorter=LEAD_SORT[leadSort.k]||null;
      const order=(x,y)=>(sorter?sorter(x,y)*(leadSort.rev?-1:1):0)||byDay(x,y);
      /* One table (Mark, 2026-10-21; see "the leads table"): a heading over
         the columns, whose names sort the leads within each step, and the
         steps one under another, each under a band in a colour of its own,
         a step with nothing in it left out. Every lead is one line and opens
         in place. It replaced the Ledger's list, whose rows all wore the same
         grey and said neither who was behind a lead nor what had last
         happened on it. */
      /* Furthest along first (Mark, 2026-10-16): Talking on top, over even
         the both-ways Contacted, then Contacted, then Spotted last. It used
         to run spotted-first, the order a lead moves in, which put the leads
         with a conversation running at the bottom of the board. */
      h+='<div class="ltable"><div class="lthead" data-mk="thead">'+LEAD_COLS.map(c=>c.k
          ? '<button class="ltc'+(leadSort.k===c.k?' on':'')+'" data-act="leadSort" data-v="'+c.k+'" '+
              'title="Sort each step by '+c.name.toLowerCase()+(leadSort.k===c.k?' — again to turn the order round':'')+'">'+
              c.name+(leadSort.k===c.k?'<i aria-hidden="true">'+(leadSort.rev?'▴':'▾')+'</i>':'')+'</button>'
          : '<span class="ltc">'+c.name+'</span>').join('')+'</div>';
      for(const k of STAGES.slice().reverse()){
        const col=all.filter(({l})=>stageOf(l)===k).sort(order);
        if(!col.length)continue;
        /* Contacted runs by its two paths while the day orders it, as it did
           on the Ledger's list (Mark, 2026-10-06): both ways first
           (2026-10-08), then the researchers asked, then the lead written to.
           The ruit at the head of each line says which. */
        if(k==='contacted'&&!sorter)col.sort((x,y)=>KIND_RANK[leadKind(x.l)]-KIND_RANK[leadKind(y.l)]||byDay(x,y));
        h+='<section class="lgrp k-'+k+'">'+
          '<p class="lgh" data-mk="g:'+k+'">'+STAGE_NAME[k]+'<b>'+col.length+'</b><span>'+STAGE_SAY[k]+'</span></p>'+
          col.map(({a,l})=>leadRowHTML(a,l,hit.has(l.id),true)).join('')+
        '</section>';
      }
      h+='</div>';
    }else{
      const shut=vis.reduce((k,a)=>k+doneLeads(a).length,0);
      h+='<div class="empty"><p>Nothing being pursued.</p>'+
        '<p class="hint" style="margin-top:6px">'+
        (shut?'The '+shut+' closed lead'+(shut===1?' is':'s are')+' still on their own cards.<br>':'')+
        'Press + Lead to start one.</p></div>';
    }
    w.innerHTML=h;
    return;
  }

}
function applyView(){
  const v=S.ui.view;
  $('#board').hidden=v!=='board';
  $('#wall').hidden=v!=='leads';
  $('#dispatch').hidden=v!=='dispatch';
  $('#now').hidden=v!=='now';
  document.querySelectorAll('#viewseg button, #leadsBtn, #dispatchBtn').forEach(b=>
    b.classList.toggle('on',b.dataset.v===v));
  /* how many venues are due for a visit, on the Venues tab, and how many
     are new on the board, on the Board's, in the new hue */
  const tab=document.querySelector('#viewseg button[data-v=now]');
  if(tab){
    const n=visibleVenues().filter(vDue).length;
    tab.querySelector('.tabn')?.remove();
    if(n)tab.insertAdjacentHTML('beforeend','<span class="tabn">'+n+'</span>');
  }
  const btab=document.querySelector('#viewseg button[data-v=board]');
  if(btab){
    const n=visibleVenues().filter(v=>v.place==='new').length;
    btab.querySelector('.tabn')?.remove();
    if(n)btab.insertAdjacentHTML('beforeend','<span class="tabn newn" title="'+n+' new on the board">'+n+'</span>');
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
/* every change to a lead goes through here, so what shows is redrawn in one place */
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
/* ── a lead opening in place ──
   Opening or shutting a lead used to redraw the whole board and the arena's
   panel round it. Every card came back as a new one, so the card under the
   pointer lost its hover and took it again a frame later — its edge, its
   name's underline and its day faded out and back in, which Mark saw as the
   card blinking (2026-10-16) — and the card grew downwards at a stroke, its
   new half often below the fold. Now only that lead is drawn again, inside
   the cards already standing for it, so nothing else is touched and the
   pointer never leaves anything. The card pressed grows to its new height
   while the list scrolls, on the same curve and in the same frames, just far
   enough to show the whole of it, never pushing its head off the top; shut,
   it only scrolls back if its head had gone above the top. Writing height
   and scroll together each frame, with the scroller's own smoothing held off
   (see notes/animation.md), is what keeps the two moving as one thing. */
const UNFOLD_MS=320;
const easeInOut=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
function leadUnfold(lid,pressed){
  if(!pressed){repaint();renderDrawer();return;}
  /* this arena's card for the lead, on Leads and in the panel alike: a lead
     copied with its arena keeps its id, and the copy is a card of its own */
  const cards=[...document.querySelectorAll('#pane-semaphore article.lead[data-lid="'+CSS.escape(lid)+'"]'+
    '[data-id="'+CSS.escape(pressed.dataset.id||'')+'"]')];
  if(!cards.length){repaint();renderDrawer();return;}
  const still=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  cards.forEach(card=>{
    const a=arena(card.dataset.id),l=a&&(a.leads||[]).find(x=>x.id===lid);
    if(!l)return;
    const h0=card.getBoundingClientRect().height;
    const tp=document.createElement('template');
    tp.innerHTML=leadRowHTML(a,l,card.classList.contains('hit'),card.classList.contains('wide'));
    const fresh=tp.content.firstElementChild;
    const run=(card._unfold||0)+1;card._unfold=run;   /* a second press takes over */
    card.className=fresh.className;
    card.setAttribute('style',fresh.getAttribute('style')||'');
    card.innerHTML=fresh.innerHTML;
    growAll(card);
    if(card!==pressed)return;
    const h1=card.getBoundingClientRect().height;
    const sc=card.closest('.cbody')||document.getElementById('semscroll');
    if(!sc)return;
    const pad=18,view=sc.clientHeight;
    const at=card.getBoundingClientRect().top-sc.getBoundingClientRect().top;
    let shift=0;
    if(at<pad)shift=at-pad;
    else if(h1>h0&&at+h1>view-pad)shift=Math.min(at+h1-(view-pad),at-pad);
    const top0=sc.scrollTop,top1=Math.max(0,Math.min(top0+shift,sc.scrollHeight-view));
    if(still){sc.scrollTop=top1;return;}
    if(Math.abs(h1-h0)<1&&Math.abs(top1-top0)<1)return;
    /* the scroller's own value, taken once: a press that takes over from
       another would otherwise take the 'auto' set here for its own */
    if(sc._sb===undefined)sc._sb=sc.style.scrollBehavior;
    sc.style.scrollBehavior='auto';
    card.style.height=h0+'px';card.style.overflow='hidden';
    const t0=performance.now();
    const step=now=>{
      if(card._unfold!==run)return;
      const p=Math.min(1,(now-t0)/UNFOLD_MS),e=easeInOut(p);
      card.style.height=(h0+(h1-h0)*e)+'px';
      if(top1!==top0)sc.scrollTop=top0+(top1-top0)*e;
      if(p<1){requestAnimationFrame(step);return;}
      card.style.height='';card.style.overflow='';sc.style.scrollBehavior=sc._sb;
    };
    requestAnimationFrame(step);
  });
}
/* A lead's card drawn again where it stands, for everything that changes
   only what is inside it — a composer opened or put away, a line or a link
   taken out, more of its history — so the rest of the list stays where it
   is under the pointer, as opening it does. A composer open on another lead
   is put away by redrawing that lead too; the two forms that belong to no
   card (a new lead, an arena's own link) still need the room drawn again. */
function leadRedo(card,set){
  const lid=card&&card.dataset.lid;
  const loose=leadEdit.l==='new'||(lkEdit.a&&!lkEdit.l);
  const was=[noteEdit.l,lkEdit.l,leadEdit.l,endAsk.l].filter(k=>k&&k!=='new'&&k!==lid);
  closeComposers();if(set)set();
  if(!card||!card.isConnected||loose){repaint();renderDrawer();return;}
  was.forEach(k=>{
    const c=document.querySelector('#pane-semaphore article.lead[data-lid="'+CSS.escape(k)+'"]');
    if(c)leadUnfold(k,c);
  });
  leadUnfold(lid,card);
}
/* ── a lead moving, and the view moving with it ──
   A press on the ruit, a new day, a score, an update or Complete can each
   send a lead to another place in the list: another step, further down its
   step, or off the list. It used to vanish from under the pointer and stand
   somewhere else at once, often out of sight, with everything between the
   two places jumping by a card's height, so Mark lost track of what had gone
   where (2026-10-21). Now the list is drawn in its new order and then every
   lead and heading in it is put back where it was and slides to its new
   place, on easeInOutCubic over MOVE_MS; the lead that moved rides over the
   others, the view scrolls with it on the same curve only as far as keeps
   it in sight, and it glows for a moment where it landed. A lead new to the
   list fades in. Positions are measured against the scroller, never the
   window, and every write comes after every read (notes/animation.md). */
const MOVE_MS=560;
function leadMarks(sc){
  const top=sc.getBoundingClientRect().top,m=new Map();
  sc.querySelectorAll('article.lead[data-lid],[data-mk]').forEach(el=>{
    const k=el.dataset.mk||('l:'+el.dataset.id+':'+el.dataset.lid);
    if(!m.has(k))m.set(k,{el,y:el.getBoundingClientRect().top-top});
  });
  return m;
}
function leadMove(card,fn){
  const sc0=card&&card.isConnected&&(card.closest('.cbody')||document.getElementById('semscroll'));
  const still=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!sc0||still){fn();return;}
  /* the panel is drawn afresh, scroller and all, so it is found again after */
  const inPanel=!!card.closest('#card'),key='l:'+card.dataset.id+':'+card.dataset.lid;
  const before=leadMarks(sc0);
  fn();
  const sc=inPanel?document.querySelector('#card .cbody'):document.getElementById('semscroll');
  if(!sc)return;
  const after=leadMarks(sc),view=sc.clientHeight,pad=24,me=after.get(key);
  const top0=sc.scrollTop;let top1=top0;
  if(me){
    const y=me.y,h=me.el.getBoundingClientRect().height;
    if(y<pad)top1=top0+y-pad;
    else if(y+h>view-pad)top1=top0+Math.min(y+h-(view-pad),y-pad);
    top1=Math.max(0,Math.min(top1,sc.scrollHeight-view));
  }
  const moving=[];
  after.forEach((x,k)=>{
    const b=before.get(k);
    if(!b){x.el.classList.add('lmv-in');moving.push(x.el);return;}
    const dy=b.y-x.y;if(Math.abs(dy)<1)return;
    x.el.style.transition='none';x.el.style.transform='translateY('+dy+'px)';moving.push(x.el);
  });
  const went=!!me&&moving.includes(me.el);
  if(went)me.el.classList.add('lmv-me');
  void sc.offsetWidth;          /* one style pass, so the start is seen */
  moving.forEach(el=>{el.style.transition='transform '+MOVE_MS+'ms cubic-bezier(.65,0,.35,1)';el.style.transform='';});
  if(sc._sb===undefined)sc._sb=sc.style.scrollBehavior;
  sc.style.scrollBehavior='auto';
  const t0=performance.now(),run=(sc._mv||0)+1;sc._mv=run;
  const step=now=>{
    if(sc._mv!==run)return;
    const p=Math.min(1,(now-t0)/MOVE_MS),e=easeInOut(p);
    if(top1!==top0)sc.scrollTop=top0+(top1-top0)*e;
    if(p<1){requestAnimationFrame(step);return;}
    sc.style.scrollBehavior=sc._sb;
    moving.forEach(el=>{el.style.transition='';el.classList.remove('lmv-in');});
    if(went){
      me.el.classList.remove('lmv-me');me.el.classList.add('lmv-land');
      setTimeout(()=>me.el.classList.remove('lmv-land'),1700);
    }
  };
  requestAnimationFrame(step);
}
/* the card a press came from, found from the press */
const cardOf=el=>el&&el.closest&&el.closest('article.lead');
function repaint(){
  if(S.ui.view==='now')renderNow();
  else if(S.ui.view==='leads')renderWall();
  else if(S.ui.view==='dispatch')renderDispatch();
  else renderBoard();
}
function restack(){
  closeComposers();save();
  repaint();renderDrawer();applyView();
}
/* Focusing a freshly painted composer asks the browser to bring it into view,
   which scrolls the room out from under the card you are working in. The
   composer is already where you clicked, so it needs the cursor, not the trip. */
function focusLk(){
  const el=document.querySelector('.lkform input[name=url]');
  if(el)el.focus({preventScroll:true});
}
/* The calendar: the Ledger's, drawn again in this room's paint. A
   type="date" field opens the browser's own picker, which cannot be marked
   or styled, and on iPadOS is Safari's wheel over the top of everything, so
   this was the one room whose dates looked like another app's. The same
   grid and the same marks as the Ledger's: weeks from Monday, today filled,
   the field's own day ringed and arrowed, Today at the foot. A field that
   may stand empty (data-cal-none, a lead's day to come back) also gets No
   date there, because the native picker's clear button was the only way a
   day was ever taken off. Every date field here is read-only text with
   data-cal, so a press opens this and no keyboard comes up. */
const Cal=(()=>{
  let inp=null,pop=null,y=0,m=0;
  const iso=(yy,mm,dd)=>yy+'-'+String(mm+1).padStart(2,'0')+'-'+String(dd).padStart(2,'0');
  const isIso=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'');
  function open(el){
    close();
    el.blur();
    const today=new Date(),cur=isIso(el.value)?new Date(el.value+'T00:00:00'):null;
    inp=el;y=(cur||today).getFullYear();m=(cur||today).getMonth();
    pop=document.createElement('div');
    pop.className='calpop';
    pop.addEventListener('click',pick);
    document.body.appendChild(pop);
    draw();
    /* The pane carries a transform, which makes it the box a fixed child is
       placed against, so window coordinates land one scroll offset out: the
       Ledger's calendar drew four hundred pixels above the window that way.
       Park at 0,0, read where that landed, take the difference off. */
    pop.style.left='0px';pop.style.top='0px';
    const org=pop.getBoundingClientRect(),r=el.getBoundingClientRect(),ph=pop.offsetHeight;
    const top=(r.bottom+6<=window.innerHeight-ph)?r.bottom+6:Math.max(6,r.top-ph-6);
    const left=Math.min(Math.max(6,r.left),window.innerWidth-pop.offsetWidth-6);
    pop.style.top=(top-org.top)+'px';pop.style.left=(left-org.left)+'px';
  }
  function close(){
    if(pop&&pop.parentNode)pop.parentNode.removeChild(pop);
    inp=null;pop=null;
  }
  function draw(){
    const t=new Date(),todayIso=iso(t.getFullYear(),t.getMonth(),t.getDate());
    const sel=isIso(inp.value)?inp.value:null;
    const lead=(new Date(y,m,1).getDay()+6)%7,inMonth=new Date(y,m+1,0).getDate();
    const cells=[];
    for(let i=0;i<42;i++){
      const d=new Date(y,m,1-lead+i);
      cells.push({y:d.getFullYear(),m:d.getMonth(),d:d.getDate(),other:i<lead||i>=lead+inMonth});
    }
    pop.innerHTML=
      '<div class="calhdr"><button type="button" class="btn calnav" data-calnav="-1" aria-label="Previous month">\u2039</button>'+
      '<span class="caltitle">'+LONG_MON[m]+' '+y+'</span>'+
      '<button type="button" class="btn calnav" data-calnav="1" aria-label="Next month">\u203a</button></div>'+
      '<div class="calwk">'+['Mo','Tu','We','Th','Fr','Sa','Su'].map(w=>'<span>'+w+'</span>').join('')+'</div>'+
      '<div class="calgrid">'+cells.map(c=>{
        const ci=iso(c.y,c.m,c.d);
        return '<button type="button" class="calday'+(c.other?' other':'')+(ci===todayIso?' today':'')+
          (ci===sel?' sel':'')+'" data-calday="'+ci+'">'+(ci===sel?'<span class="calarrow">\u25BE</span>':'')+
          '<span class="calnum">'+c.d+'</span></button>';
      }).join('')+'</div>'+
      '<div class="calfoot"><button type="button" class="btn" data-calday="'+todayIso+'">Today</button>'+
      (inp.hasAttribute('data-cal-none')&&inp.value?'<button type="button" class="btn" data-calday="">No date</button>':'')+
      '</div>';
  }
  /* Kept inside the box: a press here that reached the room's own click
     handling would land on whatever stands under the calendar. */
  function pick(e){
    e.stopPropagation();
    const b=e.target.closest('button');if(!b||!inp)return;
    if(b.dataset.calnav){
      m+=+b.dataset.calnav;
      if(m<0){m=11;y--;}
      if(m>11){m=0;y++;}
      draw();return;
    }
    const el=inp;
    el.value=b.dataset.calday;
    close();
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
  }
  return {open,close,isOpen:()=>!!pop,
    outside:e=>{if(pop&&!pop.contains(e.target)&&e.target!==inp)close();}};
})();
document.addEventListener('mousedown',Cal.outside);
document.addEventListener('touchstart',Cal.outside);
/* the chip is the control, so pointing at it and pressing opens the
   calendar rather than merely putting a cursor in an invisible field */
document.addEventListener('click',e=>{
  const inp=e.target&&e.target.closest&&e.target.closest('input[data-cal]');
  if(inp)Cal.open(inp);
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
  noteEdit={a:null,l:null};endAsk={a:null,l:null};}
function renderAll(){
  repaint();
  renderFreezer();renderDrawer();renderAsk();applySearchBox(false);applyView();
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
  /* a venue with no event days and one with them, so Venues has both to show */
  const tz=S.arenas.find(a=>a.name==='2ZERO'&&!a.toolId);
  if(tz&&tz.brokerage.links[0])tz.toolId=tz.brokerage.links[0].id;
  migrate(S);          /* the example set goes in in the same shape as anything else */
  const po=(S.venues||[]).find(v=>/^PO Days/.test(v.name));
  if(po&&po.start){po.opens=po.start.slice(0,8)+'01';po.closes=po.start.slice(0,8)+'28';}
  /* and one of each place on the board, so the tray has something to show:
     a find of the agent's still new, another kept to think about */
  const found=new Date().toISOString();
  const cm=(S.venues||[]).find(v=>/^Cities Mission/.test(v.name));
  if(cm){cm.place='new';cm.foundAt=found;}
  const ec=(S.venues||[]).find(v=>/^EC info days/.test(v.name));
  if(ec)ec.place='board';
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
    match:l.match||'',coordinator:l.coordinator||'',contact:l.contact||'',email:l.email||'',
    stage:stageOf(l),due:l.due||null,
    toResearchers:!!l.toResearchers,toLead:!!l.toLead,score:l.score||0,
    links:(l.links||[]).map(k=>({id:k.id,url:k.url||'',label:k.label||'',name:linkName(k)})),
    updates:(l.updates||[]).map((u,i)=>({i,when:updWhen(u),at:u.at||'',text:u.text||''}))
  })));
  return out;
}
/* Every lead there is, open and closed, frozen arenas' too, read out in
   words for the weekly Excel (Mark, 2026-10-14) — the bridge writes the
   file, and this room only reads its leads out for it. "Where" is the
   step in this room's own words, Contacted saying which of its two paths;
   a closed lead keeps the step it had reached and says how it ended. */
function leadsForExcel(){
  const out=[];
  S.arenas.forEach(a=>(a.leads||[]).forEach(l=>{
    const st=stageOf(l);
    out.push({id:l.id,aid:a.id,arena:a.name,type:(typeOf(a)||{}).name||'',tone:arenaTone(a),frozen:!!a.frozenAt,
      name:leadName(l),project:l.project||'',match:l.match||'',
      coordinator:l.coordinator||'',contact:l.contact||'',email:l.email||'',
      stage:st,kind:st==='contacted'?leadKind(l):'',toResearchers:!!l.toResearchers,toLead:!!l.toLead,
      where:st==='contacted'?'Contacted \u2014 '+KIND_NAME[leadKind(l)]:st==='talking'?'Talking':'Spotted',
      score:l.score||0,due:l.due||null,doneAt:l.doneAt||null,
      ended:l.doneAt?(isOutcome(l.outcome)?OUTCOMES[l.outcome].name:'Closed'):'',
      links:(l.links||[]).map(k=>({name:linkName(k),url:String(k.url||'')})),
      updates:(l.updates||[]).map(u=>({at:u.at||'',when:updWhen(u),text:u.text||''}))});
  }));
  return out;
}
/* The arenas a new lead can be filed under, and the filing itself — the
   same lead the drawer's own "+ Lead" makes, starting where every lead
   starts, at Spotted. The Ledger asks for these when Mark adds a lead from
   its board (2026-10-06), so a lead begun there is born here. A frozen
   arena is not offered: a lead filed into the freezer would vanish from
   the board in the same press that made it. They came in the rotation
   wall's order until the rotation of arenas went with the Marketplace
   (2026-10-14); they come type by type now, in Mark's order of types, each
   type's arenas in his own order, as the board's "My order" has them. */
function arenasForBoard(){
  const out=[];
  S.types.map(t=>t.id).concat([null]).forEach(id=>
    out.push(...liveArenas().filter(a=>id?a.typeId===id:!typeOf(a)).sort(mineOrder)));
  return out.map(a=>({id:a.id,name:a.name}));
}
/* A bare address with an @ in it is a person to write to; anything else
   without a scheme is a site. */
function leadLinkUrl(url){
  /* the scheme is asked about first: "mailto:x@y.z" is itself a bare
     address to the second test, and every Save on an edited card once put
     another "mailto:" in front of it */
  return /^(https?:|mailto:|file:)/i.test(url)?url
    :(/^[^\s@\/]+@[^\s@\/]+\.[^\s@\/]+$/.test(url)?'mailto:'+url:'https://'+url);
}
function leadAdd(aid,v){
  const a=arena(aid);if(!a)return null;
  const project=String(v&&v.project||'').trim(),match=String(v&&v.match||'').trim();
  const links=((v&&v.links)||[]).map(k=>({url:String(k&&k.url||'').trim(),label:String(k&&k.label||'').trim()}))
    .filter(k=>k.url);
  if(!project&&!match&&!links.length)return null;
  const l={id:uid(),project,match,links:links.map(k=>({id:uid(),label:k.label,url:leadLinkUrl(k.url)})),
    stage:'spotted',toResearchers:false,toLead:false,due:(v&&v.due)||null,doneAt:null,updates:[]};
  leadWhoSet(l,v||{});
  /* the venue it was found at, when it was started from one (2026-10-14) */
  if(v&&v.venueId&&venue(v.venueId))l.venueId=v.venueId;
  if(!Array.isArray(a.leads))a.leads=[];
  a.leads.push(l);
  restack();
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
  restack();
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
    if(!m)return;                  /* markup gone: never silently do the thing */
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
  const el=e.target.closest('[data-tipd],[data-tipl],[data-tipt],[data-tipv]');
  if(!el){tip.style.display='none';return;}
  let txt='';
  const a=arena(el.dataset.a||el.dataset.id);
  const v=el.dataset.tipv&&venue(el.dataset.tipv);
  if(v)txt=v.name+'\n'+vPlaceSay(v)+' \u2014 '+vDateSay(v)+(v.start?'\nevent days '+(v.grade==='fixed'?'':'\u2248 ')+dispDate(v):'')+
    '\n'+vYieldSay(v)+(vEvery(v)?' \u00B7 every '+vEvery(v)+' d':'');
  /* a bar on a card's strip can stand for several calls at once, so it
     brings its own words rather than one date's */
  if(v){}else if(el.dataset.tipt&&a){
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
/* On the room itself, not the document: the document's is gated on this
   room showing (hub.js), and over the Ledger, where the drawer is lent,
   the tip stood wherever it first appeared. */
document.body.addEventListener('mousemove',e=>{
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
    case 'tyArenas':if(tyOpen.has(id))tyOpen.delete(id);else tyOpen.add(id);renderTypes();break;
    case 'typeColor':{colOpen=null;const t=S.types.find(t=>t.id===id);
      if(t&&toneHex(b.dataset.v))t.color=b.dataset.v;
      save();typesShown();break;}
    case 'addArena':addArena();break;
    case 'openArena':openDrawer(id);break;
    case 'openDate':openDrawer(b.dataset.a,b.dataset.d);break;
    case 'closeDrawer':closeDrawer();break;
    /* A press on a lead's own ground opens or shuts it. Its links, its date
       and the fields of a composer inside it are presses of their own. */
    case 'leadOpen':{
      if(e.target.closest('a,input,textarea,select,label,form'))break;
      const k=b.dataset.l;if(!k)break;
      if(leadOpen.has(k))leadOpen.delete(k);else leadOpen.add(k);
      leadUnfold(k,b);break;}
    case 'leadAdd':{closeComposers();leadEdit={a:id,l:'new'};
      repaint();renderDrawer();focusLead();break;}
    case 'leadEdit':{leadRedo(cardOf(b),()=>{leadEdit={a:id,l:b.dataset.l};leadOpen.add(b.dataset.l);});
      focusLead();break;}
    case 'leadAddBoard':{const was=leadEdit.a===BOARD;closeComposers();
      if(!was)leadEdit={a:BOARD,l:'new'};
      repaint();renderDrawer();
      if(!was){growAll();const f=document.querySelector('.leadboard select[name=arena]');
        if(f)f.focus({preventScroll:true});}
      break;}
    case 'leadCancel':{leadRedo(leadEdit.l!=='new'&&cardOf(b));break;}
    case 'leadsExcel':{
      /* ⌥ (Alt) with the press asks where to keep the file afresh */
      if(typeof Hub!=='undefined'&&Hub.emit)Hub.emit('leads:excel',{fresh:!!e.altKey});break;}
    /* another link row, added in place: a redraw would cost what is typed */
    case 'leadLinkRow':{
      b.insertAdjacentHTML('beforebegin',leadFormLinkHTML());
      const r=b.previousElementSibling;if(r)r.querySelector('[name=url]').focus();
      break;}
    case 'leadSave':{const ar=arena(id);if(!ar)break;
      const l=(ar.leads||[]).find(x=>x.id===b.dataset.l);if(!l)break;
      const card=b.closest('.lead');if(!card)break;
      if(!leadEditAll(l,leadEditRead(card))){Ask.tell('Nothing left','A lead needs at least a project, a match or a link.');break;}
      leadMove(card,()=>{closeComposers();restack();});break;}
    /* marks a link or an update to go when the edit is saved, and back */
    case 'leadEditDrop':{const r=b.closest('.ledrow');if(r)r.classList.toggle('gone');break;}
    /* One way to move a lead on: press a dot of its ruit. There is no second
       control that walks it round, and none in the form. */
    case 'leadPath':{const ar=arena(id);if(!ar)break;
      const l=(ar.leads||[]).find(x=>x.id===b.dataset.l);if(!l||l.doneAt)break;
      leadMove(cardOf(b),()=>{if(leadPath(l,b.dataset.v)){save();repaint();renderDrawer();}});break;}
    /* Complete asks how the lead ended before it closes it (see OUTCOMES);
       Reopen puts it back at once, answer and all, since nothing was thrown
       away. */
    case 'leadDone':{const ar=arena(id);if(!ar)break;
      const l=(ar.leads||[]).find(x=>x.id===b.dataset.l);if(!l)break;
      if(l.doneAt){leadMove(cardOf(b),()=>{l.doneAt=null;delete l.outcome;restack();});break;}
      leadRedo(cardOf(b),()=>{endAsk={a:ar.id,l:l.id};leadOpen.add(l.id);});break;}
    case 'leadEnd':{const ar=arena(id);if(!ar)break;
      const l=(ar.leads||[]).find(x=>x.id===b.dataset.l);if(!l||l.doneAt)break;
      if(!isOutcome(b.dataset.v))break;
      leadMove(cardOf(b),()=>{endLead(l,b.dataset.v);restack();});
      if(l.outcome==='project')leadToProject(ar,l);
      break;}
    case 'leadEndCancel':{leadRedo(cardOf(b));break;}
    /* the button says it worked, in place of a toast over the card */
    case 'copyMail':{const v=b.dataset.v;if(!v)break;
      copyText(v,ok=>{b.textContent=ok?'Copied':'Not copied';
        setTimeout(()=>{b.textContent='Copy';},1600);});
      break;}
    case 'leadLinkDel':{const ar=arena(id);if(!ar)break;
      const l=(ar.leads||[]).find(x=>x.id===b.dataset.l);if(!l)break;
      l.links=(l.links||[]).filter(k=>k.id!==b.dataset.k);
      save();leadUnfold(l.id,cardOf(b));break;}
    case 'noteAdd':{leadRedo(cardOf(b),()=>{noteEdit={a:id,l:b.dataset.l};leadOpen.add(b.dataset.l);});
      focusNote();break;}
    case 'noteCancel':{leadRedo(cardOf(b));break;}
    case 'updMore':{const k=b.dataset.l;
      if(updOpen.has(k))updOpen.delete(k);else updOpen.add(k);
      leadUnfold(k,cardOf(b));break;}
    case 'closedMore':{
      if(closedOpen.has(id))closedOpen.delete(id);else closedOpen.add(id);
      repaint();renderDrawer();break;}
    case 'updDel':{const ar=arena(id);if(!ar)break;
      const l=(ar.leads||[]).find(x=>x.id===b.dataset.l);if(!l)break;
      const i=+b.dataset.u;
      if(!Array.isArray(l.updates)||!(i>=0&&i<l.updates.length))break;
      l.updates.splice(i,1);
      save();leadUnfold(l.id,cardOf(b));break;}
    case 'lkAdd':{
      if(b.dataset.l)leadRedo(cardOf(b),()=>{lkEdit={a:id,l:b.dataset.l};leadOpen.add(b.dataset.l);});
      else{closeComposers();lkEdit={a:id,l:null};repaint();renderDrawer();}
      focusLk();break;}
    case 'lkCancel':{
      if(lkEdit.l)leadRedo(cardOf(b));
      else{closeComposers();repaint();renderDrawer();}
      break;}
    case 'leadSort':{const k=b.dataset.v;
      if(leadSort.k===k)leadSort.rev=!leadSort.rev;else leadSort={k,rev:false};
      renderWall();break;}

    case 'setWeight':{const ar=arena(id);if(!ar)break;
      if(!WEIGHTS[b.dataset.v])break;
      ar.weight=b.dataset.v;save();renderDrawer();repaint();applyView();break;}
    case 'freeze':{const ar=arena(id);if(!ar)break;
      ar.frozenAt=todayISO();
      S.ui.freezerOpen=true;                 /* show where it went */
      closeComposers();save();renderAll();break;}
    case 'thaw':{const ar=arena(id);if(!ar)break;
      ar.frozenAt=null;save();renderAll();break;}
    case 'toggleFreezer':S.ui.freezerOpen=!S.ui.freezerOpen;save();renderFreezer();break;
    case 'trayKept':S.ui.keptOpen=!S.ui.keptOpen;save();renderBoard();break;
    case 'seenArena':{const a=arena(b.dataset.id);if(!a)break;a.seenAt=new Date().toISOString();save();renderAll();break;}
    case 'seenAll':{const at=new Date().toISOString();for(const a of S.arenas)if(freshItems(a).length)a.seenAt=at;save();renderAll();break;}
    case 'shOpen':{const k=b.dataset.v;if(S.ui.shOpen[k])delete S.ui.shOpen[k];else S.ui.shOpen[k]=true;save();renderBoard();break;}
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
    case 'setView':{const v=b.dataset.v;
      S.ui.view=['now','leads','dispatch'].includes(v)?v:'board';
      save();renderAll();
      /* the findings are asked for when you come to look at them, and again
         every time you come back: a list read an hour ago is a list another
         machine may have answered since */
      if(S.ui.view==='dispatch'||S.ui.view==='board')loadFinds();
      break;}
    case 'findRefresh':loadFinds();break;
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
    /* ── venues ── */
    case 'openVenue':if(venue(b.dataset.v))openVenue(b.dataset.v);break;
    /* The link opens the site by itself; the press is the visit. The room
       is drawn again a moment later, so the link the browser is following
       is still there while it follows it. */
    case 'vGo':{const v=venue(b.dataset.v);if(!v)break;
      visitToday(v);save();
      vBack={id:v.id,at:Date.now()};vAsking=null;renderAsk();
      setTimeout(()=>{repaint();renderDrawer();applyView();},0);break;}
    case 'vVisit':{const v=venue(b.dataset.v);if(!v)break;
      visitToday(v);save();repaint();renderDrawer();applyView();break;}
    case 'vAns':{const v=venue(b.dataset.v);if(!v)break;
      const box=b.closest('.vask'),tx=box&&box.querySelector('.vtx');
      const got=b.dataset.g;
      vAnswer(v,got,tx?tx.value:'');
      if(vAsking===v.id)vAsking=null;
      save();renderAsk();
      if(got==='lead'){openVenue(v.id);leadEdit={a:VENUE_LEAD,l:'new'};renderDrawer();focusLead();}
      else{repaint();renderDrawer();}
      applyView();break;}
    case 'vAgent':{const v=venue(b.dataset.v);if(!v)break;
      if(v.askAt)delete v.askAt;else v.askAt=new Date().toISOString();
      save();renderDrawer();break;}
    case 'aAgent':{const ar=arena(id);if(!ar)break;
      if(ar.askAt)delete ar.askAt;else ar.askAt=new Date().toISOString();
      save();renderDrawer();break;}
    case 'vUnstamp':{const v=venue(b.dataset.v);if(!v)break;
      v.visits=v.visits.filter(x=>x.at!==todayISO());
      if(vAsking===v.id){vAsking=null;renderAsk();}
      save();repaint();renderDrawer();applyView();break;}
    case 'vAskOff':vAsking=null;renderAsk();break;
    case 'nowTab':S.ui.nowTab=NOW_TABS[b.dataset.t]?b.dataset.t:'active';save();renderNow();break;
    /* Where a venue stands (see "venues"): to Venues, kept on the board, or
       back to the board from Venues. Moving one to Venues shows the tab it
       landed in, so it is seen where it went. */
    case 'vPlace':{const v=venue(b.dataset.v);if(!v||!['board','venues'].includes(b.dataset.p))break;
      v.place=b.dataset.p;
      if(v.place==='board')delete v.phase;
      if(v.place==='venues'){const ph=vPhase(v);S.ui.nowTab=ph;}
      save();renderAll();break;}
    /* a section chosen by hand; the one its dates give, or "by its dates",
       hands it back to them. The tab follows it, so it is seen where it went. */
    case 'vPhase':{const v=venue(b.dataset.v);if(!v)break;
      const k=b.dataset.ph;
      if(!k||k===vPhaseByDates(v))delete v.phase;else v.phase=k;
      S.ui.nowTab=vPhase(v);
      save();renderAll();break;}
    case 'vWinReset':{const v=venue(b.dataset.v);if(!v)break;
      v.opens=null;v.closes=null;
      if(!v.start)v.opens=todayISO();
      save();renderAll();break;}
    /* In Limbo every venue is there to be let go, and asking each time would
       make clearing it a question per row, as on Coming up; a new one on the
       board is a press to turn down, as Dispatches' Dismiss was. Anywhere
       else a stray press must not lose one with its visits. */
    case 'vDrop':{const v=venue(b.dataset.v);if(v)dropVenue(v.id);break;}
    case 'vRemove':{const v=venue(b.dataset.v);if(!v)break;
      /* a new find with nothing of his on it goes at a second press, as a
         link's cross does: the first turns the word into the question */
      if(v.place==='new'&&!v.visits.length){
        if(!b.classList.contains('armed')){
          b.classList.add('armed');b.textContent='Sure?';
          setTimeout(()=>{if(b.isConnected){b.classList.remove('armed');b.textContent='Remove';}},3000);
          break;
        }
        dropVenue(v.id);break;}
      const nl=vLeads(v).length;
      Ask.ask('Remove '+v.name+'?',
        'It goes off the whole board'+(v.visits.length?', with its '+v.visits.length+' visit'+(v.visits.length===1?'':'s'):'')+
        (v.pages.length?' and its other pages':'')+', and the agent will not bring it back.'+(nl?' The '+(nl===1?'lead':nl+' leads')+' started from it '+(nl===1?'stays':'stay')+', and only '+(nl===1?'forgets':'forget')+' where '+(nl===1?'it':'they')+' came from.':''),
        'Remove',()=>{closeDrawer();dropVenue(v.id);});
      break;}
    case 'vNew':newVenue(id||null);break;
    case 'vEdit':{const v=venue(b.dataset.v);if(!v)break;
      if(drawer.vid!==v.id)openVenue(v.id);
      drawer.editing=true;renderDrawer();
      const f=$('#card .vform input[name='+(v.url?'label':'url')+']');if(f)f.focus({preventScroll:true});
      break;}
    case 'vEditCancel':{
      if(drawer.vnew){const aid=drawer.vnew.aid;drawer.vnew=null;drawer.editing=false;
        if(aid)openDrawer(aid);else closeDrawer();break;}
      drawer.editing=false;renderDrawer();break;}
    case 'vArenaDel':{const v=venue(b.dataset.v);if(!v)break;
      v.arenas=v.arenas.filter(x=>x!==id);save();renderAll();break;}
    case 'vPageDel':{const v=venue(b.dataset.v);if(!v)break;
      v.pages=v.pages.filter(x=>x.id!==b.dataset.p);save();renderDrawer();break;}
    case 'vVisitDel':{const v=venue(b.dataset.v);if(!v)break;
      v.visits=v.visits.filter(x=>x.at!==b.dataset.at);save();renderAll();break;}
    case 'vLeadNew':{const v=venue(b.dataset.v);if(!v)break;
      closeComposers();leadEdit={a:VENUE_LEAD,l:'new'};renderDrawer();focusLead();break;}
    /* A brokerage link in an arena's panel made a venue, in Venues since it
       is Mark's own doing, open from today until he gives it days or an end. */
    case 'vMake':{const lk=linkOf(a,'brokerage',b.dataset.l);if(!lk||!lk.url)break;
      const k=siteKey(lk.url);
      let v=(S.venues||[]).find(x=>x.url&&siteKey(x.url)===k);
      if(!v){v=tidyVenue({id:venue('vt'+hashKey(k))?uid():'vt'+hashKey(k),name:lk.label||linkHost(lk)||k,
        url:lk.url,arenas:[a.id],note:'',visits:[],pages:[],opens:todayISO(),place:'venues'});S.venues.push(v);}
      else if(v.place==='gone'){v.place='venues';if(!v.start&&!v.opens)v.opens=todayISO();tidyVenue(v);}
      joinVenue(v,a.id);
      absorbVenues(S);       /* every other link to the same site joins it */
      save();renderAll();openVenue(v.id);break;}
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
      /* The last type stays: a new arena, typed or accepted from Dispatches,
         is filed under the first type there is, and with none + Arena threw
         and an accepted finding was lost after the cloud had marked it taken. */
      if(S.types.length<2){Ask.tell('The last type','A board keeps at least one type. Rename this one instead.');break;}
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
      delete cp.memo;                            /* nor has anyone written on it yet */
      a.dates.push(cp);reconcile(a);drawer.hi=cp.id;save();renderAll();break;}
    case 'delDate':{if(!a)break;const dt=a.dates.find(d=>d.id===b.dataset.d);
      if(!dt)break;
      const aid=a.id,did=dt.id;
      Ask.ask('Delete this date?',
        '\u201C'+dtLabel(dt)+'\u201D \u2014 '+dispDate(dt)+
        '.',
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
          S.arenas=S.arenas.filter(x=>x.id!==aid);
          (S.venues||[]).forEach(v=>{v.arenas=v.arenas.filter(x=>x!==aid);});
          closeDrawer();save();renderAll();
        });
      break;}
  }
});

/* ───────── typing, and the forms it goes into ───────── */
document.addEventListener('input',e=>{
  const t=e.target;
  if(t&&t.classList&&t.classList.contains('grow'))growBox(t);
},true);
/* ⌘↩ keeps what is being written, heard on the room for the reason the
   tip's mousemove is: a lead begun in the drawer lent over the Ledger is
   written there too. */
document.body.addEventListener('keydown',e=>{
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
  const lf=e.target.closest('.lkform');
  if(lf){
    e.preventDefault();
    const a=arena(lf.dataset.lka);if(!a)return;
    const url=typedAddr(lf.elements.url.value);
    const label=lf.elements.label.value.trim();
    if(!url&&!label){
      if(lf.dataset.lkl)leadRedo(cardOf(lf));else{closeComposers();repaint();renderDrawer();}
      return;}
    const lead=lf.dataset.lkl?(a.leads||[]).find(x=>x.id===lf.dataset.lkl):null;
    if(lf.dataset.lkl&&!lead)return;
    if(lead)lead.links.push({id:uid(),label,url});
    else{
      a.brokerage=a.brokerage||{notes:'',links:[]};
      a.brokerage.links=a.brokerage.links||[];
      a.brokerage.links.push({id:uid(),label,url});
    }
    save();
    if(lead)leadUnfold(lead.id,cardOf(lf));else{repaint();renderDrawer();}
    focusLk();            /* the composer stays up: these tend to come in twos and threes */
    return;
  }
  const nf=e.target.closest('.noteform');
  if(nf){
    e.preventDefault();
    const a=arena(nf.dataset.na);if(!a)return;
    const l=(a.leads||[]).find(x=>x.id===nf.dataset.nl);if(!l)return;
    const text=nf.elements.text.value.trim();
    leadMove(cardOf(nf),()=>{
      if(text){
        if(!Array.isArray(l.updates))l.updates=[];
        l.updates.push({at:todayISO(),text});
      }
      closeComposers();restack();
    });
    return;
  }
  const df=e.target.closest('.leadform');
  if(df){
    e.preventDefault();
    const a=arena(df.dataset.la||(df.elements.arena&&df.elements.arena.value));
    if(!a){Ask.tell('Which arena?','Choose the arena this lead belongs to, and it is filed there.');return;}
    /* the same filing the Ledger's new lead uses, so a lead begun in either
       room is born the same way, at Spotted */
    const links=[...df.querySelectorAll('.lnrow')].map(r=>({
      url:r.querySelector('[name=url]').value,label:r.querySelector('[name=label]').value}));
    closeComposers();
    const ven=df.dataset.venue&&venue(df.dataset.venue);
    const lid=leadAdd(a.id,{project:df.elements.project.value,match:df.elements.match.value,
      coordinator:df.elements.coordinator.value,contact:df.elements.contact.value,
      email:df.elements.email.value,links,venueId:ven?ven.id:null});
    /* a lead started from a venue is today's visit's answer */
    if(ven&&lid){const x=vAnswer(ven,'lead');x.leadId=lid;leadLastArena=a.id;save();repaint();renderDrawer();return;}
    /* on Leads the new lead stands open, so it is seen where it landed */
    if(!df.dataset.la&&lid){leadLastArena=a.id;leadOpen.add(lid);}
    if(!lid||!df.dataset.la){repaint();renderDrawer();}
    return;
  }
  const vf=e.target.closest('.vform');
  if(vf){
    e.preventDefault();
    const o=readVenueForm(vf);if(!o)return;
    if(vf.dataset.v==='new'){
      const a=arena(vf.elements.arena&&vf.elements.arena.value);
      if(!o.name&&!o.url){Ask.tell('Name it','Give the venue a name or its website.');return;}
      const v=tidyVenue(Object.assign({id:uid(),arenas:a?[a.id]:[],visits:[],pages:[],note:''},o,
        {name:o.name||linkName({url:o.url}),place:'venues'}));
      if(!v.start&&!v.opens&&!v.closes)v.opens=todayISO();
      S.venues.push(v);
      drawer.vnew=null;save();renderAll();openVenue(v.id);
      return;
    }
    const v=venue(vf.dataset.v);if(!v)return;
    const keep={id:v.id,arenas:v.arenas,visits:v.visits,pages:v.pages,memo:v.memo,every:v.every,foundAt:v.foundAt,place:v.place};
    Object.assign(v,o,keep,{name:o.name||v.name});
    tidyVenue(v);
    drawer.editing=false;save();renderAll();
    return;
  }
  const pf=e.target.closest('.vpageform');
  if(pf){
    e.preventDefault();
    const v=venue(pf.dataset.v);if(!v)return;
    const url=typedAddr(pf.elements.url.value);
    if(!url)return;
    if(!v.pages.some(x=>linkKey(x.url)===linkKey(url))&&linkKey(url)!==linkKey(v.url))
      v.pages.push({id:uid(),label:pf.elements.label.value.trim(),url});
    save();renderDrawer();
    const f=document.querySelector('#card .vpageform input[name=url]');if(f)f.focus({preventScroll:true});
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
  absorbVenues(S);           /* a brokerage date written here is a venue at once */
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
    leadMove(cardOf(el),()=>{leadScore(l,el.value);save();repaint();renderDrawer();});return;
  }
  /* a venue's rhythm, and another arena it serves */
  if(el.dataset&&el.dataset.vevery){
    const v=venue(el.dataset.vevery);if(!v)return;
    const n=+el.value;if(n>=1)v.every=n;else delete v.every;
    save();renderAll();return;
  }
  if(el.dataset&&el.dataset.vaddarena){
    const v=venue(el.dataset.vaddarena);if(!v||!arena(el.value))return;
    joinVenue(v,el.value);save();renderAll();return;
  }
  if(el.dataset&&el.dataset.lda&&el.dataset.ldl){
    const a=arena(el.dataset.lda);if(!a)return;
    const l=(a.leads||[]).find(x=>x.id===el.dataset.ldl);if(!l)return;
    leadMove(cardOf(el),()=>{l.due=el.value||null;restack();});return;
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
    save();repaint();
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
  /* A venue's note is kept as it is typed, and saved once the typing
     pauses: a save on every keystroke would send the board to the cloud
     for every letter. The panel is not redrawn, which would take the caret
     out of the box. */
  if(e.target.matches&&e.target.matches('textarea.vmemo')){
    const v=venue(e.target.dataset.vmemo);if(!v)return;
    v.memo=e.target.value;autoGrow(e.target);
    clearTimeout(vNoteT);vNoteT=setTimeout(()=>{vNoteT=null;tidyVenue(v);save();},600);
  }
});
/* leaving the box saves what is waiting at once, so a reload straight after
   cannot lose the last words */
document.addEventListener('focusout',e=>{
  if(vNoteT&&e.target.matches&&e.target.matches('textarea.vmemo')){clearTimeout(vNoteT);vNoteT=null;save();}
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
  if(Cal.isOpen()){Cal.close();return;}                     /* the calendar */
  if(tdDrag){tdCancel();return;}                             /* a type or arena being dragged */
  if(colOpen){colOpen=null;typesShown();return;}             /* a colour menu */
  if(sortOpen){sortOpen=false;renderBoard();return;}         /* the board's order */
  if(Ask.isOpen()){Ask.shut();return;}                       /* the question */
  if(document.querySelector('.modal.open')){closeModals();return;}   /* a sheet */
  if(lkEdit.a||leadEdit.a||noteEdit.a||endAsk.a){  /* a composer, put away in its own card */
    const k=noteEdit.l||lkEdit.l||leadEdit.l||endAsk.l;
    leadRedo(k&&k!=='new'&&document.querySelector('#pane-semaphore article.lead[data-lid="'+CSS.escape(k)+'"]'));return;
  }
  if(drawer.vnew){drawer.vnew=null;closeDrawer();return;}    /* a venue being made */
  if(drawer.edit){drawer.edit=null;renderDrawer();return;}   /* a date form */
  if(drawer.editing){drawer.editing=false;renderDrawer();return;}  /* the edit face */
  if(drawer.id||drawer.vid)closeDrawer();                    /* the panel itself, an arena's or a venue's */
});
document.querySelectorAll('.modal').forEach(m=>m.addEventListener('click',e=>{
  if(e.target!==m)return;
  /* a question is answered, not dismissed by looking away */
  if(m.id==='askModal')return;
  closeModals();
}));
$('#cardScrim').addEventListener('click',closeDrawer);

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
  /* the cross and the press that makes a venue are pressed, never dragged */
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
    /* A card shows at most three links, so the rows on screen can be fewer
       than the list. The ones shown are dealt back into the places the shown
       ones held, and a link not shown keeps its own place among them. */
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
if(S.ui.view==='dispatch'||S.ui.view==='board')setTimeout(loadFinds,800);


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
    /* every lead, closed ones too, for the weekly Excel the bridge writes */
    allLeads:   function(){ return leadsForExcel(); },
    openArena:  function(aid){ if(arena(aid))openDrawer(aid); },
    /* Escape, for when the drawer is lent to another room and this room's
       own key handler is not the one listening: the innermost thing first,
       as that handler does. */
    escape:     function(){
      if(Cal.isOpen())Cal.close();
      else if(Ask.isOpen())Ask.shut();
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
