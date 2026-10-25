/* ══════════ The venue maths ══════════
   How a venue's window, the state it is in and its shading are reckoned,
   how a site is told from its address, and how an arena's call dates come
   together as bars: one copy, read by the Brokerage Semaphore and Mark's
   Place alike (Mark, 2026-10-24), the Call Board drawing the bars the
   Semaphore reckons here. Until then Mark's Place held a copy of the
   Semaphore's own, each change there wanting copying by hand.

   It is not a room: it keeps nothing and draws nothing, and every function
   here answers from what it is handed. So it is loaded once, straight after
   the Hub and before anything that reads it, as a plain script, which a copy
   opened from disk loads as well as the site does. Mark's Place loads the
   same file from its own folder. The gatekeeper in supabase/ keeps a copy of
   the site's reading for itself, because it runs in the cloud and reads no
   file of the app's. */
var VenueMaths=(function(){
'use strict';

/* ── dates ── */
const DAY=86400000;
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const pad=n=>String(n).padStart(2,'0');
/* noon, so that a day is the same day in every timezone a summer or winter
   clock change can put between two dates */
const T=iso=>new Date(iso+'T12:00:00').getTime();
const todayISO=()=>{const d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());};
const fmtDay=iso=>{const[y,m,d]=iso.split('-');return +d+' '+MONTHS[+m-1]+' '+y;};
/* a date as exactly as it is known: a day, a span, or only its month,
   quarter, half or year */
function dispDate(dt){
  if(dt.gran==='none'||!dt.start)return 'no date yet';
  const[y,m]=dt.start.split('-').map(Number);
  switch(dt.gran){
    case 'day':return fmtDay(dt.start);
    case 'month':return MONTHS[m-1]+' '+y;
    case 'quarter':return 'Q'+(Math.floor((m-1)/3)+1)+' '+y;
    case 'half':return 'H'+(m<7?1:2)+' '+y;
    case 'year':return String(y);
    case 'range':return fmtDay(dt.start)+' – '+fmtDay(dt.end);
    default:return '';
  }
}
/* this year is understood, so it goes unsaid */
const trimYear=s=>{const y=' '+new Date().getFullYear();return s.endsWith(y)?s.slice(0,-y.length):s;};
const shortDay=iso=>trimYear(fmtDay(iso));
const shortDate=dt=>(dt.gran==='range'&&dt.start&&dt.end)
  ? shortDay(dt.start)+' – '+shortDay(dt.end)
  : trimYear(dispDate(dt));
const tDay=t=>shortDay(new Date(t).toISOString().slice(0,10));

/* ── sites ── */
/* Two spellings of one address — a trailing slash, a www, http against
   https — are the same page, and a second copy of it among the links is
   noise. */
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
   unrelated links turn out to share a stamp, or a venue: the Estonian
   research council's proposals site carries three partnerships' partner
   searches side by side, and the Polish centres' sites several more
   (found when the Marketplace made venues of them, 2026-10-14). That site
   moved from proposals.etag.ee to epss.proposals.ee on 2026-10-23, and the
   new host was not on the list: Water4All's, Biodiversa+'s and Sustainable
   Blue's partner searches at the new address read as one site, and became
   one venue serving all three arenas. The old host is read as the new, so
   a link to either address of the same partner search is the same site.
   Mark's Place matches its copied sites to the Semaphore's venues by the
   same rule, which is why the two must read a site alike. */
const SHARED_HOSTS=/^(?:b2match\.(?:io|com|eu)|(?:.+\.)?(?:europa\.eu|google\.com|linkedin\.com|youtube\.com|github\.com|eventbrite\.[a-z.]+|meetup\.com|lu\.ma|zoom\.us|microsoft\.com|sharepoint\.com|gov\.pl|horizoneuropencpportal\.eu|eurekanetwork\.org)|epss\.proposals\.ee)$/;
function siteKey(u){
  const k=linkKey(u),i=k.indexOf('/');
  const host=(i<0?k:k.slice(0,i)).replace(/:\d+$/,'').replace(/^proposals\.etag\.ee$/,'epss.proposals.ee');
  if(!SHARED_HOSTS.test(host))return host;
  const segs=(i<0?'':k.slice(i+1)).split('/').filter(x=>x&&!/^[a-z]{2}(?:[-_][a-z]{2})?$/.test(x));
  const e=segs.findIndex(x=>/^(?:e|event|events)$/.test(x));
  return [host].concat(e>=0&&segs[e+1]?segs.slice(0,e+2):segs).join('/');
}
/* a key on a shared host with nothing after the host names no one site;
   otherwise one key may stand inside the other, as a partner-search page
   inside its partnership's proposals site */
function sameSite(a,b){
  if(a===b)return true;
  const s=a.length<b.length?a:b,l=s===a?b:a;
  return s.indexOf('/')>0&&l.indexOf(s+'/')===0;
}

/* ── a venue's window ── */
const SPOT_MAX=14;          /* event days run at most two weeks; a longer exact span is the window itself */
const LEAD_IN=21,TAIL=14;   /* the window event days are given until Mark drags it: three weeks before, two after */
const DYING_MAX=21;         /* a window with no event days in it is dying for its last three weeks, or last third */
/* A window with no end runs on six weeks past today and fades out there
   with an arrow, rather than to the strip's edge: drawn to the edge, every
   standing partner search was a thick bar across the whole board (Mark,
   2026-10-15). */
const OPEN_RUN=42;          /* days an open-ended window is drawn past today */
/* the colour of where a venue stands, as three numbers for a shading:
   the new hue while new, bone while kept on the board, the brokerage red
   in Venues, grey once removed or over */
const PLACE_RGB={new:'185,227,90',board:'150,140,122',venues:'239,91,76',gone:'125,116,102'};
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
/* the last stretch of a window with no event days, when it is dying */
const tailOf=w=>Math.min(DYING_MAX*DAY,w.from!==null?(w.to-w.from)/3:DYING_MAX*DAY);
/* Where a venue stands today, finely: undated, arising (its window still
   ahead, or its season not yet dated), meeting (on its event days), active,
   dying (past its event days, or in the last stretch of a window that has
   none), over. The three sections of the Semaphore's Venues are the three
   middle phases; over is Limbo. */
function vState(v){
  const w=vWin(v);if(!w)return 'undated';
  const now=T(todayISO());
  if(w.to!==null&&now>w.to)return 'over';
  if(w.season||(w.from!==null&&now<w.from))return 'arising';
  if(w.ms!==null)return now<w.ms?'active':now<=w.me?'meeting':'dying';
  if(w.to!==null)return now>=w.to-tailOf(w)?'dying':'active';
  return 'active';
}
const PHASE={undated:'arising',arising:'arising',meeting:'active',active:'active',dying:'dying',over:'over'};
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
    const tail=tailOf(w);
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
    const tail=tailOf(w);
    if(w.to-tail>x0&&w.to-tail<x1)pts.push(w.to-tail);
  }
  pts.sort((a,b)=>a-b);
  return 'linear-gradient(90deg,'+pts.map(t=>'rgba('+rgb+','+(.1+.6*vHeat(v,Math.min(t,x1-1))).toFixed(2)+') '+
    ((t-x0)/(x1-x0)*100).toFixed(1)+'%').join(',')+')';
}
/* where a venue stands, in a few words */
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

/* ── a call's run ──
   The stages of one call — Stage 1 and Stage 2, pre- and full proposals,
   outline and full proposal, PO and FPP (Mark, 2026-10-18) — are one bar
   with a notch at each earlier deadline (`callBase`), and calls with
   exactly the same dates are one bar, because a cluster's work programme
   opens a dozen topics on the same two days and a dozen identical bars say
   nothing. Drawn so on the Semaphore's rotation cards first (Mark,
   2026-10-07), then on its board, and now on the Call Board and in Mark's
   Place's venue panels. */
function callBase(n){
  return String(n||'').replace(/\s*\(expected\)/ig,'')
    .replace(/\s*[–—-]\s*(stage\s*\d|pre-?proposals?|full( project)? proposals?|project outline|(?:po|fpp)\b).*$/i,'')
    .replace(/[\s\/]+stage\s*\d.*$/i,'').trim();
}
/* An arena's call dates as bars: `all` of them, those still `live` (open,
   then soon, the nearest first) and the `last` one closed. */
function callRuns(a){
  const now=T(todayISO()),by=new Map();
  for(const d of a.dates||[]){
    if(d.kind!=='call'||!d.start||d.gran==='none')continue;
    const name=d.call||'Untitled call',k=callBase(name)||name;
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

return {DAY,MONTHS,pad,T,todayISO,fmtDay,dispDate,trimYear,shortDay,shortDate,tDay,
  linkKey,SHARED_HOSTS,siteKey,sameSite,
  SPOT_MAX,LEAD_IN,TAIL,DYING_MAX,OPEN_RUN,PLACE_RGB,PHASE,
  isSpot,vWin,vState,vHeat,heatBG,vDateSay,callBase,callRuns};
})();
