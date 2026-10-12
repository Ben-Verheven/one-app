/* ══════════ Proposal Ledger ══════════ */
Hub.mount('ledger', function(window, document, localStorage){

/* ═══════════════════════════════════════════════════════════════════
   THE PROPOSAL LEDGER

   One IIFE, modules in dependency order. Everything the markup calls
   inline is exposed on `PL` at the bottom; the tracker keeps its own
   `CT` namespace because its markup is static and addresses it by name.

   The shared engines are the point of the arrangement: ONE popover,
   ONE pointer-drag, ONE rich-text sanitiser, ONE note strip. Three
   places grow notes (a call's info table, a project's dossier, a
   tracker row) and they are the same component with different clothes.

   THE DATA MODEL (schema 3). Two records: `calls` and `projects`.

   A call is a record. It holds its own name, title, colour, links, key
   dates, order and info rows, and a project points at it by id. In
   schema 2 it held none of these: a call was a substring of every
   member project's name, and its fields were COPIED onto each member
   and resynced by fan-out on every edit. Reading a call meant picking a
   member and hoping. That is where the archived-copy drift, the
   unreachable all-archived call, and the table orphaned by a rename all
   came from, and none of those failures has anywhere left to happen.

   A standalone project has a call too, flagged `solo` and never shown
   as one, so key dates have exactly one home either way.

   Rows own notes, on calls and projects alike, and every note is
   {id,label,body,created,edited}. Todos are their own list. Schema 2
   had one array holding todos and notes together, rows derived from
   entry types with a side overlay for their names, and four different
   note shapes; all of that is gone.

   Anything arriving from anywhere — localStorage, an import, a cloud
   row — goes through upgrade() then adoptIncoming(), so there is one
   description of what the old shape meant and one place that repairs
   the new one.
   ═══════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

/* ══ UTILITIES ══════════════════════════════════════════════════════ */

/* Escapes &, <, >, " AND ' — the single quote matters because this app
   builds inline handlers as onclick="fn('+esc(v)+')". Without it a value
   containing an apostrophe breaks out of the string literal. */
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
/* A value going into an inline handler passes two parsers: the HTML
   attribute reader, and then JavaScript. esc() covers only the first — it
   writes an apostrophe as &#39;, which the attribute reader hands back to
   JavaScript as a live quote that closes the string early. So escape for
   JavaScript first, then for the attribute. Anything interpolated inside
   a quoted argument of an on* handler wants this rather than esc(). */
function jsq(s){return esc(String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"));}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
function mkId(){return 'mk'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);}
function safeUrl(u){return(!u)?'':(/^https?:\/\//i.test(u)?u:'https://'+u);}
function cssEsc(s){return (window.CSS&&CSS.escape)?CSS.escape(String(s)):String(s);}
function q(sel,root){return (root||document).querySelector(sel);}
function qa(sel,root){return Array.prototype.slice.call((root||document).querySelectorAll(sel));}
function byId(id){return document.getElementById(id);}

/* Colours reach `style` attributes in many renderers. They normally come
   from a palette, but a hand-edited or imported file can carry anything,
   and an unescaped value there can close the attribute and inject a
   handler. Only literal colour forms pass; anything else falls back. */
var CSS_COLOR_OK=/^(#[0-9a-fA-F]{3,8}|rgba?\([\d.,\s%]+\)|hsla?\([\d.,\s%deg]+\)|var\(--[\w-]+\)|[a-zA-Z]{3,20})$/;
function safeColor(c,fallback){
  c=(c==null?'':String(c)).trim();
  return CSS_COLOR_OK.test(c)?c:(fallback||'var(--gold2)');
}
function hexA(hex,a){
  if(!hex||typeof hex!=='string')hex='#8a7048';
  var h=hex.replace('#','');
  if(h.length!==6)h='8a7048';
  return 'rgba('+parseInt(h.slice(0,2),16)+','+parseInt(h.slice(2,4),16)+','+parseInt(h.slice(4,6),16)+','+a+')';
}
/* Plain text out of stored rich HTML — used by previews, tooltips and the
   search index. */
function plain(html){
  var d=document.createElement('div');d.innerHTML=html==null?'':String(html);
  return (d.textContent||'').replace(/\s+/g,' ').trim();
}
function trunc(s,n){s=s||'';return s.length>n?s.slice(0,n-1)+'\u2026':s;}

/* ── How long a todo is expected to take ──
   Minutes, so the horizon can add a day up. A ladder rather than a free
   number: the estimate is "about an hour", and a field that accepts 37
   invites a precision nobody has. It thins out as it climbs, because the
   difference between ten minutes and twenty is one you can feel and the
   difference between six hours and seven is not.

   0 is "not said", which is not the same as "nothing": an unestimated
   todo is left out of every total rather than counted as free. */
var EFFORTS=[10,20,30,45,60,90,120,180,240,480];
/* How the beam on a todo card divides that ladder up. One segment is an
   hour and there are four, so the beam is full at four hours and anything
   longer draws full and brighter rather than silently the same. See the
   beam itself in THE TODO CARD. */
var EFF_SEG=60,EFF_SEGS=4;
/* Short, for the card and the strip, where the column is 34px wide. */
function effortShort(m){
  m=+m||0;
  if(!m)return '';
  if(m<60)return m+'m';
  var h=Math.floor(m/60),r=m%60;
  return h+'h'+(r?String(r):'');
}
/* Long, for the picker and for anything that has room to be said properly. */
function effortLong(m){
  m=+m||0;
  if(!m)return '\u2014';
  if(m<60)return m+' min';
  if(m===90)return '1\u00bd hours';
  if(m===240)return '4 hours \u00b7 half a day';
  if(m===480)return '8 hours \u00b7 a day';
  var h=m/60;
  return h+(h===1?' hour':' hours');
}
/* Any number of minutes said in words. A day's total is a sum and lands
   wherever it lands, so it cannot borrow the ladder's own wording. */
function minutesLong(m){
  m=+m||0;
  if(!m)return 'nothing';
  var h=Math.floor(m/60),r=m%60,out=[];
  if(h)out.push(h+(h===1?' hour':' hours'));
  if(r)out.push(r+' min');
  return out.join(' ');
}
/* ── What kind of work a todo is ──
   A short closed list, because the whole value of a category is that two
   todos share one. A field you type into spells the same kind of work
   four ways by Christmas and then adds up to nothing.

   Nine, chosen to cover a proposal year rather than to be exhaustive:
   the five Mark named, plus the four the seeded week kept asking for —
   reading a call text, preparing for a meeting, deciding the shape of a
   thing, and the standing tide of admin that is none of the others.
   Saying nothing is a real answer and stays the default.

   This array is the only place they are written down. Adding, renaming or
   dropping one is an edit here and nowhere else, because a todo stores
   the key and the label is looked up — so a rename never has to touch a
   journal, and a key no longer in the list simply reads as unsaid rather
   than throwing its todo away. */
var CATS=[
  {k:'writing',   label:'Writing',            color:'#d8be5e'},
  {k:'proposal',  label:'Proposal',           color:'#e0a05c'},
  {k:'meeting',   label:'Meeting',            color:'#e08a7d'},
  {k:'consortium',label:'Consortium',         color:'#de85b0'},
  {k:'planning',  label:'Planning',           color:'#c58ce0'},
  {k:'projdev',   label:'Project development',color:'#9490e2'},
  {k:'reading',   label:'Reading',            color:'#7fb4dc'},
  {k:'portal',    label:'Portal',             color:'#66c4bd'},
  {k:'budget',    label:'Budget',             color:'#7fc98a'},
  {k:'admin',     label:'Admin',              color:'#e2ddd0'}
];
/* ── The category palette ──
   Only ever seen when the day is grouped by category, and then it is the
   only thing colour means: the board's own four call colours step aside
   for the length of that view, so no mark is ever asked to carry two
   meanings at once. That is the whole reason a colour was refused here
   until there was a mode to hang it on.

   Budget green and Admin white were named; the rest are spread round the
   wheel at roughly even steps from them, warm through to cool, so no two
   are neighbours. Every one of them is a light tint, because they are
   read as 9px text and as 13px dots over a dark hatched ground, and a
   dark hue would be a smudge at both sizes. `admin` is deliberately the
   only near-neutral: the work that is none of the others looks like none
   of the others.

   The list order is the palette's order, not an order anything is sorted
   in — the picker reads down it, so neighbours in the menu are also
   neighbours in hue, which is what makes ten of them choosable. */
var CAT_LABEL={},CAT_COLOR={};
CATS.forEach(function(c){CAT_LABEL[c.k]=c.label;CAT_COLOR[c.k]=c.color;});
function catLabel(k){return CAT_LABEL[k]||'';}
/* The fallback is the room's own quiet text, so a key left behind by a
   category that has since been dropped still draws as something. */
function catColor(k){return CAT_COLOR[k]||'#9d8458';}
function catOptionsHTML(cur){
  cur=cur||'';
  return '<option value=""'+(cur?'':' selected')+'>\u2014 not said</option>'
    +CATS.map(function(c){
      return '<option value="'+c.k+'"'+(c.k===cur?' selected':'')+'>'+esc(c.label)+'</option>';
    }).join('');
}
function effortOptionsHTML(cur){
  cur=+cur||0;
  return '<option value="0"'+(cur?'':' selected')+'>\u2014 not said</option>'
    +EFFORTS.map(function(m){
      return '<option value="'+m+'"'+(m===cur?' selected':'')+'>'+effortLong(m)+'</option>';
    }).join('');
}

/* Every reorder in the app is the same act: lift one item out of a list by
   id and drop it where another one sits. Five places had written that
   splice pair out by hand. Returns false when nothing moved, so a caller
   can skip the save and the re-render. `idOf` defaults to `x.id`; pass one
   for a list of bare keys. */
function moveById(list,srcId,tgtId,idOf){
  if(!Array.isArray(list)||srcId===tgtId)return false;
  idOf=idOf||function(x){return x.id;};
  var si=list.findIndex(function(x){return idOf(x)===srcId;});
  var ti=list.findIndex(function(x){return idOf(x)===tgtId;});
  if(si<0||ti<0)return false;
  list.splice(ti,0,list.splice(si,1)[0]);
  return true;
}

/* The CSS prefers-reduced-motion rule cannot reach JS-driven smooth
   scrolling — `behavior` is not a CSS property. Every smooth scroll in
   the app routes through here, so the one gap that rule leaves is closed. */
function reducedMotion(){
  try{return typeof window.matchMedia==='function'&&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;}catch(e){return false;}
}
function scrollPref(){return reducedMotion()?'auto':'smooth';}
/* Bringing something into view is best-effort: an element that has just
   been replaced is no longer in the document, and older engines throw on
   the options form. Pass instant:true where a jump is wanted — arrow-key
   navigation should not animate. */
function reveal(el,opts){
  if(!el||!el.scrollIntoView)return;
  var o=opts||{};
  try{
    el.scrollIntoView({behavior:o.instant?'auto':scrollPref(),
      block:o.block||'nearest',inline:o.inline||'nearest'});
  }catch(e){try{el.scrollIntoView();}catch(e2){}}
}
/* How a keyboard chord is spelled on this platform. Printed in the
   overflow menu and under the notes sheet, so it is said once. */
function modKey(){
  return (navigator.platform&&/Mac|iP/.test(navigator.platform))?'\u2318':'Ctrl\u2009';
}
function afterRender(fn){requestAnimationFrame(function(){requestAnimationFrame(fn);});}

/* ══ THE TURN ═══════════════════════════════════════════════════════
   Three things in the app turn over: the tracker sheet, the board, and a
   call card. They should feel like the same gesture, so the timing lives
   here once rather than three times in three different durations.

   What makes the sheet's turn read as a physical movement, and what a CSS
   transition cannot say, is that the two halves are eased differently: it
   accelerates into the half-way point and decelerates out of it, with the
   timing itself linear so the halves meet without a seam. A single
   cubic-bezier applied across the whole rotation cannot do that — it
   eases the ENDS of the turn and runs the middle flat, which is the part
   that reads as mechanical.

   It also lifts a little toward the viewer as it passes edge-on, so the
   card turns through space rather than pivoting on a pane of glass. */
var Turn=(function(){
  var MS=680;
  var EASE_IN='cubic-bezier(0.42,0,1,1)';
  var EASE_OUT='cubic-bezier(0,0,0.58,1)';

  function can(){
    return !reducedMotion()&&typeof Element!=='undefined'&&!!Element.prototype.animate;
  }
  /* `axis` is 'X' or 'Y'; `flipped` is the side being turned TO. The end
     state is held by a class, so this fills nothing and simply hands the
     element back when it lands. */
  function play(inner,axis,flipped){
    if(!inner||!can())return null;
    var from=flipped?0:180,to=flipped?180:0;
    function at(deg,lift){
      return 'rotate'+axis+'('+deg+'deg)'+(lift?' translateZ('+lift+'px)':'');
    }
    var anim=inner.animate([
      {transform:at(from,0),offset:0,   easing:EASE_IN},
      {transform:at(90,42), offset:0.5, easing:EASE_OUT},
      {transform:at(to,0),  offset:1}
    ],{duration:MS,easing:'linear',fill:'none'});
    if(anim&&anim.finished&&anim.finished.catch)anim.finished.catch(function(){});
    return anim;
  }
  return {play:play,MS:MS,can:can};
})();

/* ── Dates ── */
var DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
var MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
var MON3=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function ts(){return new Date().toLocaleString('en-GB',{day:'2-digit',month:'short',
  year:'numeric',hour:'2-digit',minute:'2-digit'}).replace(',',' —');}
function isIsoDate(s){return !!(s&&/^\d{4}-\d{2}-\d{2}$/.test((s||'').trim()));}
function isoOf(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function isoToday(){var d=new Date();d.setHours(0,0,0,0);return isoOf(d);}
function fmtDate(s){
  if(!s||!isIsoDate(s))return'\u2014';
  return new Date(s+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
}
function daysUntil(s){
  if(!s||!isIsoDate(s))return null;
  var d=new Date(s+'T00:00:00'),now=new Date();
  d.setHours(0,0,0,0);now.setHours(0,0,0,0);
  return Math.round((d-now)/86400000);
}
function addDays(iso,n){var d=new Date(iso+'T00:00:00');d.setDate(d.getDate()+n);return isoOf(d);}
function dayIndex(iso,startIso){
  return Math.round((new Date(iso+'T00:00:00')-new Date(startIso+'T00:00:00'))/86400000);
}
/* The most recent Monday, so the current workweek is always seen whole. */
function mondayIso(){
  var d=new Date();d.setHours(0,0,0,0);
  d.setDate(d.getDate()-((d.getDay()+6)%7));
  return isoOf(d);
}
/* Loose description of a date range, e.g. "first week of September". */
function fuzzyRange(startStr,endStr){
  var s=new Date(startStr+'T00:00:00'),e=new Date(endStr+'T00:00:00');
  if(isNaN(s)||isNaN(e))return fmtDate(startStr)+' \u2192 '+fmtDate(endStr);
  var curYear=new Date().getFullYear();
  var sm=s.getMonth(),em=e.getMonth(),sy=s.getFullYear(),ey=e.getFullYear(),sd=s.getDate(),ed=e.getDate();
  function wk(d){return d<=7?'first week of':d<=14?'second week of':d<=21?'third week of':'last week of';}
  function portion(d){return d<=10?'beginning of':d<=20?'mid':'end of';}
  function yr(y){return y!==curYear?' '+y:'';}
  if(sy===ey&&sm===em){
    if(ed-sd<=8)return wk(sd)+' '+MONTHS[sm]+yr(sy);
    return portion(Math.round((sd+ed)/2))+' '+MONTHS[sm]+yr(sy);
  }
  return portion(sd)+' '+MONTHS[sm]+yr(sy)+' to '+portion(ed)+' '+MONTHS[em]+yr(ey);
}
/* Relative stamps for note timestamps: short and human up to a week, an
   actual date beyond that — a relative figure stops being useful once you
   are reconciling against a call deadline. */
function fmtAbs(iso){
  if(!iso)return '';
  var d=new Date(iso);
  if(isNaN(d))return '';
  return d.toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',
    hour:'2-digit',minute:'2-digit'}).replace(',',' \u2014');
}
function fmtRel(iso){
  if(!iso)return '';
  var d=new Date(iso);
  if(isNaN(d))return '';
  var secs=Math.max(0,Math.floor((Date.now()-d.getTime())/1000));
  if(secs<45)return 'just now';
  var mins=Math.floor(secs/60);      if(mins<60)return mins+'m ago';
  var hrs=Math.floor(mins/60);       if(hrs<24)return hrs+'h ago';
  var days=Math.floor(hrs/24);
  if(days===1)return 'yesterday';
  if(days<7)return days+'d ago';
  var now=new Date();
  return d.toLocaleDateString('en-GB',d.getFullYear()===now.getFullYear()
    ?{day:'2-digit',month:'short'}
    :{day:'2-digit',month:'short',year:'numeric'});
}

/* ── Names & palettes ── */
/* A project belonging to a call is named "Call - Project". These two split
   that apart, and are the only place that convention is encoded. */
var CALL_PALETTE=['#7ab8d4','#7ad4a8','#d4a87a','#b87ad4','#d47a9a',
                  '#7a9ad4','#d4d07a','#7ad4c8','#d48c7a','#9ad47a',
                  '#c47ad4','#7ab4d4','#d4b07a','#7ad490','#d47ab0'];
var TITLE_COLORS=['#c9a84c','#e8c96a','#d4a040','#d98a6a','#c07a80','#d06a8a',
                  '#a07ab0','#9060c0','#7a8ad0','#6a8eb0','#5a9fb0','#5fa39a',
                  '#6aa060','#8a9a6a','#a0a040','#c0895a','#b08050','#f2e8d0'];
var WP_COLORS=['#B85242','#4A7C9E','#5E8A47','#C4922E','#C48176','#93A67C','#A07AB0','#5FA39A','#9A8450'];
/* Colour is a property of the call, so seedCallColor / callColorOf /
   projColor live with the store. */

/* Marker kinds. They live with the marker editor because that is their only
   consumer — the timeline reads the resolved colour, not the label. */
var MK_TYPES=['deadline','opening','info','meeting','milestone','other'];
var MK_LABELS={deadline:'Deadline',opening:'Opening',info:'Info date',
               meeting:'Meeting',milestone:'Milestone',other:'Other'};
var MK_HEX={deadline:'#c05050',opening:'#5a9a50',info:'#c9a84c',
            meeting:'#6a8eb0',milestone:'#9060c0',other:'#8a8478'};

/* The one entry kind still told apart by name: a todo in a v2 file. */
var TODO='todo';

/* ══ TOASTS ═════════════════════════════════════════════════════════
   Feedback and undo. Every destructive act that can be reversed says so
   here instead of asking first. */
var toastHost=null;
function toast(msg,opts){
  opts=opts||{};
  if(!toastHost){
    toastHost=document.createElement('div');toastHost.id='pj-toasts';
    document.body.appendChild(toastHost);
  }
  var t=document.createElement('div');
  t.className='pj-toast';t.setAttribute('role','status');
  var m=document.createElement('span');
  m.className='pj-toast-msg';m.textContent=msg;
  t.appendChild(m);
  var timer=null,gone=false;
  function dismiss(){
    if(gone)return;gone=true;
    clearTimeout(timer);
    t.classList.add('pj-toast-out');
    setTimeout(function(){if(t.parentNode)t.parentNode.removeChild(t);},220);
  }
  if(opts.action){
    var b=document.createElement('button');
    b.type='button';b.className='pj-toast-act';b.textContent=opts.action;
    b.onclick=function(){dismiss();if(opts.onAction)opts.onAction();};
    t.appendChild(b);
  }
  t.addEventListener('click',function(e){if(e.target===t||e.target===m)dismiss();});
  toastHost.appendChild(t);
  while(toastHost.children.length>3)toastHost.removeChild(toastHost.firstChild);
  /* `duration:0` is the one toast that must stay until it is pressed —
     the journal that could not be read — and `0||3200` quietly turned it
     into an ordinary one that was gone in three seconds, before the
     warning it carries could be read. */
  if(opts.duration!==0)timer=setTimeout(dismiss,opts.duration||(opts.action?6000:3200));
  return dismiss;
}
/* Where a jump lands. */
function flashEl(el){
  if(!el)return;
  el.classList.remove('pj-hit');void el.offsetWidth;el.classList.add('pj-hit');
  setTimeout(function(){el.classList.remove('pj-hit');},2400);
  reveal(el,{block:'center'});
}
/* Where `position:fixed` starts from in this room, in window coordinates.
   Every pane is transformed, which makes it the containing block of its
   fixed children — see Menu.open for the whole story. Most boxes here find
   the origin by parking themselves at 0,0 and reading where they landed,
   but a box that is itself transformed cannot: the tilted drag ghost and
   the centred deadline line would each read their own transform as part
   of the origin. So they ask an untransformed probe instead. Both used to
   be written in raw window coordinates and drew one scroll offset too
   high: the line ended above its dot, and the ghost floated away from the
   pointer it was meant to be held by. */
var originProbe=null;
function fixedOrigin(){
  if(!originProbe||!originProbe.isConnected){
    originProbe=document.createElement('div');
    originProbe.setAttribute('aria-hidden','true');
    originProbe.style.cssText='position:fixed;left:0;top:0;width:0;height:0;'
      +'visibility:hidden;pointer-events:none';
    document.body.appendChild(originProbe);
  }
  return originProbe.getBoundingClientRect();
}

/* ══ THE DIALOG ═════════════════════════════════════════════════════
   Toasts report; this one asks. It exists because window.confirm cannot
   be styled, cannot say which button is the dangerous one, and arrives
   wearing the browser's chrome in the middle of a page that has gone to
   some trouble not to look like one.

   Asking is the exception, not the rule. Where an act can be taken back,
   the app does it and offers the undo on a toast — that is a better
   bargain than a question, because it costs nothing when you meant it.
   This is for the acts that genuinely have no way back. */
var Dialog=(function(){
  var host=null,prevFocus=null,onYes=null,bound=false;

  function onKey(e){
    if(!host||host.hasAttribute('hidden'))return;
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}
    else if(e.key==='Enter'){e.preventDefault();e.stopPropagation();accept();}
  }
  function close(){
    if(!host||host.hasAttribute('hidden'))return;
    host.setAttribute('hidden','');
    host.innerHTML='';
    onYes=null;
    refreshVeil();
    if(bound){document.removeEventListener('keydown',onKey,true);bound=false;}
    var back=prevFocus;prevFocus=null;
    if(back&&back.focus){try{back.focus();}catch(e){}}
  }
  /* Whatever was typed is taken off the box before the box is taken down.
     `close()` empties the host, so a callback that went looking for its own
     field afterwards found nothing — and `fn()` cannot simply run first,
     because a callback that opens a second dialog would then have it shut
     underneath it. Anything with an id is handed over by id; a dialog with
     no fields hands over an empty object, which every older caller ignores
     because it never took an argument. */
  function accept(){
    var fn=onYes,vals={};
    if(host)qa('input,textarea,select',host).forEach(function(el){
      if(el.id)vals[el.id]=el.value;});
    close();
    if(fn)fn(vals);
  }
  /* opts: {title, body, html, confirm, cancel, danger}. `yes` runs only if
     the act is confirmed; there is deliberately no “no” branch, because
     every caller's answer to no is to do nothing.

     `body` is escaped and laid out `pre-line`, which is what a plain
     warning wants and why it is the default. `html` is the door for a
     dialog that has to carry a field or a list — it is markup this file
     built, never anything typed — and it turns the pre-line off, because
     markup does its own wrapping. `cancel:false` drops the second button
     for a dialog that only ever closes. */
  function ask(opts,yes){
    opts=opts||{};
    close();
    if(!host){
      host=document.createElement('div');
      host.id='pj-dialog';
      document.body.appendChild(host);
    }
    prevFocus=document.activeElement;
    onYes=yes||null;
    host.innerHTML='<div class="pjd-backdrop" onclick="PL.dialogClose()"></div>'
      +'<div class="pjd-box" role="alertdialog" aria-modal="true" aria-label="'
        +esc(opts.title||'Confirm')+'">'
        +'<div class="pjd-title">'+esc(opts.title||'Are you sure?')+'</div>'
        +'<div class="pjd-body'+(opts.html?' pjd-body-html':'')+'">'
          +(opts.html||esc(opts.body||''))+'</div>'
        +'<div class="pjd-foot">'
          +(opts.cancel===false?''
            :'<button type="button" class="btn" onclick="PL.dialogClose()">'
              +esc(opts.cancel||'Cancel')+'</button>')
          +'<button type="button" id="pjd-yes" class="btn'
            +(opts.danger===false?' btn-primary':' pjd-danger')+'" '
            +'onclick="PL.dialogAccept()">'+esc(opts.confirm||'Delete')+'</button>'
        +'</div>'
      +'</div>';
    host.removeAttribute('hidden');
    refreshVeil();
    if(!bound){document.addEventListener('keydown',onKey,true);bound=true;}
    var b=byId('pjd-yes');if(b)b.focus();
  }
  return {ask:ask,close:close,accept:accept};
})();

/* ══ THE POPOVER ════════════════════════════════════════════════════
   Every menu in the app is this: built on demand, parked on <body> so no
   scroll container can clip it, right- or centre-anchored to its trigger,
   clamped to the viewport, flipped above when there is no room below, and
   closed by an outside press or Escape. There used to be seven copies of
   this arithmetic. */
var Menu=(function(){
  var cur=null;   // {el, trigger, onClose}

  function onOutside(e){
    if(!cur)return;
    if(cur.el.contains(e.target))return;
    if(cur.trigger&&cur.trigger.contains(e.target))return;
    close();
  }
  /* Capture-phase, and it stops there: the app-level Escape handler runs on
     the bubble and would otherwise treat the same keypress as a second
     dismissal, closing whatever the menu was sitting on top of. */
  function onKey(e){
    if(e.key!=='Escape')return;
    e.stopPropagation();
    close();
  }

  function close(){
    if(!cur)return;
    var c=cur;cur=null;
    document.removeEventListener('mousedown',onOutside,true);
    document.removeEventListener('keydown',onKey,true);
    if(c.el&&c.el.parentNode)c.el.parentNode.removeChild(c.el);
    if(c.trigger){c.trigger.classList.remove('open');c.trigger.setAttribute('aria-expanded','false');}
    if(c.onClose)c.onClose();
  }
  function isOpen(id){ return !!(cur&&cur.el&&cur.el.id===id); }

  /* opts: {id, cls, align:'center'|'right'|'left', role, onClose} */
  function open(trigger,html,opts){
    opts=opts||{};
    var wasSame=isOpen(opts.id);
    close();
    if(wasSame)return null;             // a second press on the same trigger closes
    if(!trigger)return null;
    var el=document.createElement('div');
    el.className=opts.cls||'colmenu';
    if(opts.id)el.id=opts.id;
    if(opts.role)el.setAttribute('role',opts.role);
    el.innerHTML=html;
    document.body.appendChild(el);

    /* Where `fixed` actually starts from. The shell gives every pane a
       transform on purpose — it makes the pane a containing block so a
       room's fixed modals land inside the room instead of over the chrome
       — and the price is that `position:fixed` inside it answers to the
       pane's CONTENT rather than to the window, which means it scrolls
       with it. Every number below comes from getBoundingClientRect and is
       therefore in window coordinates, so writing them straight into
       `top` was right at the top of a room and wrong by exactly the scroll
       offset anywhere else: scroll a slice into view, open any menu, and
       it was drawn hundreds of pixels above the window.

       Park the box at 0,0 and read where that landed. The difference is
       the origin to take off, and it is zero when nothing up the tree is
       transformed, so this costs nothing where there was nothing wrong. */
    el.style.left='0px';el.style.top='0px';
    var org=el.getBoundingClientRect();

    var br=trigger.getBoundingClientRect(),mw=el.offsetWidth,mh=el.offsetHeight;
    var left;
    if(opts.align==='right')      left=br.right-mw;
    else if(opts.align==='left')  left=br.left;
    else                          left=br.left+br.width/2-mw/2;
    left=Math.max(8,Math.min(left,window.innerWidth-mw-8));
    var gap=(opts.align?5:6);
    var top=br.bottom+gap;
    if(top+mh>window.innerHeight-8)top=br.top-mh-gap;
    el.style.left=(left-org.left)+'px';
    el.style.top=(Math.max(8,top)-org.top)+'px';

    trigger.classList.add('open');
    trigger.setAttribute('aria-expanded','true');
    cur={el:el,trigger:trigger,onClose:opts.onClose||null};
    /* Bound on the next tick so the press that opened this cannot close it. */
    setTimeout(function(){
      if(!cur)return;
      document.addEventListener('mousedown',onOutside,true);
      document.addEventListener('keydown',onKey,true);
    },0);
    return el;
  }
  /* Refresh a menu's contents in place — used when a switch inside it is
     worth staying open for, because the thing underneath redraws. */
  function refresh(html){ if(cur&&cur.el)cur.el.innerHTML=html; }
  function anyOpen(){return !!cur;}

  return {open:open,close:close,refresh:refresh,anyOpen:anyOpen};
})();

/* ══ THE DRAG ENGINE ════════════════════════════════════════════════
   Native HTML5 dragstart/drop never fires on iOS/iPadOS Safari, so every
   reorder in the app is Pointer Events. One state machine, entered either
   from a listener bound to a handle or from a pointerdown that already
   happened (delegation), plus a ghost-carrying variant for the position
   pills, which drop into a specific slot rather than onto a sibling. */
var DRAG_THRESHOLD=8;
var Drag=(function(){

  /* A real drag can still be followed by a synthetic click. Components
     that are both pressable and draggable opt into swallowing that one
     click, without changing ordinary taps below the drag threshold. */
  function suppressNextClick(){
    function swallow(e){
      document.removeEventListener('click',swallow,true);
      e.preventDefault();
      e.stopPropagation();
      if(e.stopImmediatePropagation)e.stopImmediatePropagation();
    }
    document.addEventListener('click',swallow,true);
    setTimeout(function(){document.removeEventListener('click',swallow,true);},0);
  }

  function machine(cfg){
    /* cfg: {itemEl, containerSelector, scope, getKey, onDrop, grabs,
       suppressClick, startX, startY, pointerId} */
    var startX=cfg.startX,startY=cfg.startY,pid=cfg.pointerId,dragging=false;
    var itemEl=cfg.itemEl;

    function findTarget(x,y){
      var under=document.elementFromPoint(x,y);
      var target=under?under.closest(cfg.containerSelector):null;
      return target&&(!cfg.scope||cfg.scope.contains(target))?target:null;
    }
    function clearOver(){
      qa(cfg.containerSelector+'.drag-over',cfg.scope||document)
        .forEach(function(x){x.classList.remove('drag-over');});
    }
    function onMove(e){
      if(pid!==e.pointerId)return;
      if(!dragging){
        if(Math.abs(e.clientX-startX)<DRAG_THRESHOLD&&Math.abs(e.clientY-startY)<DRAG_THRESHOLD)return;
        dragging=true;
        itemEl.classList.add('dragging');
        if(!cfg.grabs){
          /* Past the threshold this is a drag, not a text interaction: drop
             focus and any selection the pointerdown started. */
          if(cfg.handle&&cfg.handle.blur)cfg.handle.blur();
          var sel=window.getSelection&&window.getSelection();
          if(sel&&sel.removeAllRanges)sel.removeAllRanges();
        }
      }
      e.preventDefault();
      var target=findTarget(e.clientX,e.clientY);
      clearOver();
      if(target&&target!==itemEl)target.classList.add('drag-over');
    }
    function finish(e,shouldDrop){
      if(pid!==e.pointerId)return;
      document.removeEventListener('pointermove',onMove);
      document.removeEventListener('pointerup',onUp);
      document.removeEventListener('pointercancel',onCancel);
      itemEl.classList.remove('dragging');
      clearOver();
      if(shouldDrop&&dragging){
        if(cfg.suppressClick)suppressNextClick();
        var target=findTarget(e.clientX,e.clientY);
        if(target&&target!==itemEl){
          var s=cfg.getKey(itemEl),t=cfg.getKey(target);
          if(s&&t&&s!==t)cfg.onDrop(s,t);
        }
      }
      dragging=false;pid=null;
    }
    function onUp(e){finish(e,true);}
    function onCancel(e){finish(e,false);}
    document.addEventListener('pointermove',onMove);
    document.addEventListener('pointerup',onUp);
    document.addEventListener('pointercancel',onCancel);
  }

  /* Bind a handle. opts.grabs=false when the handle is ALSO an interactive
     control (a call-info row's title input): preventDefault on pointerdown
     would stop it ever taking focus. */
  function handle(handleEl,itemEl,containerSelector,getKey,onDrop,opts){
    if(!handleEl||!itemEl)return;
    opts=opts||{};
    var grabs=(opts.grabsPointerDown!==false);
    handleEl.addEventListener('pointerdown',function(e){
      if(otherButton(e))return;
      if(grabs){e.preventDefault();e.stopPropagation();}
      machine({itemEl:itemEl,handle:handleEl,containerSelector:containerSelector,
        getKey:getKey,onDrop:onDrop,grabs:grabs,
        scope:opts.scope||null,suppressClick:!!opts.suppressClick,
        startX:e.clientX,startY:e.clientY,pointerId:e.pointerId});
    });
  }

  /* Enter from a pointerdown that already fired — used where the drag
     sources are rebuilt on every render and binding each one is waste. */
  function from(downEvt,itemEl,containerSelector,getKey,onDrop,opts){
    if(!itemEl)return;
    opts=opts||{};
    machine({itemEl:itemEl,handle:null,containerSelector:containerSelector,
      getKey:getKey,onDrop:onDrop,grabs:true,
      scope:opts.scope||null,suppressClick:!!opts.suppressClick,
      startX:downEvt.clientX,startY:downEvt.clientY,pointerId:downEvt.pointerId});
  }

  return {handle:handle,from:from,THRESHOLD:DRAG_THRESHOLD};
})();

/* ══ RICH TEXT ══════════════════════════════════════════════════════
   Note bodies store sanitized HTML. Formatting elements carry no
   attributes; links keep only a revalidated web or mail address and open
   in a separate, non-opener tab. Plain legacy text is escaped and safe
   URL-shaped text is linkified on the way in. */
var RTE_ALLOWED={B:1,STRONG:1,I:1,EM:1,U:1,UL:1,OL:1,LI:1,BR:1,DIV:1,P:1,A:1};
var RTE_DANGEROUS={SCRIPT:1,STYLE:1,IFRAME:1,OBJECT:1,EMBED:1,LINK:1,META:1,SVG:1,FORM:1};
function safeRichHref(raw){
  var href=String(raw==null?'':raw).trim();
  if(!href||/[\u0000-\u001f\u007f]/.test(href))return '';
  if(/^www\./i.test(href))href='https://'+href;
  else if(/^\/\//.test(href))href='https:'+href;
  try{
    var url=new URL(href);
    return /^(https?:|mailto:)$/i.test(url.protocol)?url.href:'';
  }catch(e){return '';}
}
function unwrapRich(el){
  var parent=el.parentNode;if(!parent)return;
  while(el.firstChild)parent.insertBefore(el.firstChild,el);
  parent.removeChild(el);
}
function sanitizeRichHTML(html){
  /* Template contents stay inert while untrusted pasted/imported markup is
     inspected, so discarded media cannot start loading on the way through. */
  var tmp=document.createElement('template');
  tmp.innerHTML=html||'';
  (function clean(node){
    Array.prototype.slice.call(node.childNodes).forEach(function(child){
      if(child.nodeType===1){
        /* Never unwrap script/style/etc — their text is not safe text. */
        if(RTE_DANGEROUS[child.tagName]){node.removeChild(child);return;}
        if(!RTE_ALLOWED[child.tagName]){
          clean(child);unwrapRich(child);
          return;
        }
        var href=child.tagName==='A'?safeRichHref(child.getAttribute('href')):'';
        while(child.attributes&&child.attributes.length)child.removeAttribute(child.attributes[0].name);
        if(child.tagName==='A'){
          if(!href){clean(child);unwrapRich(child);return;}
          child.setAttribute('href',href);
          child.setAttribute('target','_blank');
          child.setAttribute('rel','noopener noreferrer');
        }
        clean(child);
      } else if(child.nodeType!==3){
        node.removeChild(child);
      }
    });
  })(tmp.content);
  return tmp.innerHTML;
}
function trimLinkToken(token){
  var cut=token.length,pairs={')':'(',']':'[','}':'{'};
  while(cut){
    var ch=token.charAt(cut-1);
    if(/[.,;:!?'"]/.test(ch)){cut--;continue;}
    if(pairs[ch]){
      var body=token.slice(0,cut),open=(body.match(new RegExp('\\'+pairs[ch],'g'))||[]).length,
          close=(body.match(new RegExp('\\'+ch,'g'))||[]).length;
      if(close>open){cut--;continue;}
    }
    break;
  }
  return {url:token.slice(0,cut),tail:token.slice(cut)};
}
function linkifyRichRoot(root){
  var changed=false;
  (function walk(node){
    Array.prototype.slice.call(node.childNodes).forEach(function(child){
      if(child.nodeType===1){
        if(child.tagName!=='A')walk(child);
        return;
      }
      if(child.nodeType!==3)return;
      var text=child.nodeValue||'';
      var rx=/(?:https?:\/\/|mailto:|www\.)[^\s<>]+/gi,m,last=0,frag=null;
      while((m=rx.exec(text))){
        /* A prefix embedded in a word, address or path is ordinary text,
           not a standalone link. */
        if(m.index&&!/[\s([{"'<>:;,\u2013\u2014]/.test(text.charAt(m.index-1)))continue;
        var part=trimLinkToken(m[0]),href=safeRichHref(part.url);
        if(!href)continue;
        if(!frag)frag=document.createDocumentFragment();
        frag.appendChild(document.createTextNode(text.slice(last,m.index)));
        var a=document.createElement('a');
        a.href=href;a.target='_blank';a.rel='noopener noreferrer';
        a.textContent=part.url;frag.appendChild(a);
        if(part.tail)frag.appendChild(document.createTextNode(part.tail));
        last=m.index+m[0].length;
      }
      if(frag){
        frag.appendChild(document.createTextNode(text.slice(last)));
        child.parentNode.replaceChild(frag,child);
        changed=true;
      }
    });
  })(root);
  return changed;
}
function linkifyRichHTML(html){
  var tmp=document.createElement('template');
  tmp.innerHTML=sanitizeRichHTML(html);
  linkifyRichRoot(tmp.content);
  return tmp.innerHTML;
}
function linkifyRichElement(el){return !!(el&&linkifyRichRoot(el));}
/* Text typed somewhere that was not this editor. Used where plain text
   enters — a v2 note, a plain-text paste — and nowhere else. */
function plainToMarkup(text){
  return esc(text==null?'':String(text)).replace(/\n/g,'<br>');
}
/* Every body in the journal is markup, so this does not ask whether it
   might not be. Asking is what corrupted notes: a body holding an entity
   but no tag — what the editor writes for a double space or an ampersand
   — read as plain text and got escaped again on every open. Plain text is
   converted where it arrives instead. */
/* One update line, wherever an update is shown. The read-only panel on
   the horizon passes no delCall and gets no remove button. */
function substampHTML(s,delCall){
  return '<div class="substamp"><span class="substamp-stamp">'+esc(s.stamp)+'</span>'
    +'<span class="substamp-text">'+esc(s.text)+'</span>'
    +(delCall?'<button class="substamp-del" title="Remove" onclick="'+delCall+'">\u2715</button>':'')
    +'</div>';
}
function toEditableHTML(html){
  if(!html)return '';
  return linkifyRichHTML(html);
}
/* Pasting keeps the formatting this app understands. Fonts, colours,
   sizes and tables are dropped; safe links and plain URLs remain usable. */
function pasteRich(evt,onAfter){
  evt.preventDefault();
  var cd=evt.clipboardData||window.clipboardData;
  var htmlData=cd?cd.getData('text/html'):'';
  var source=htmlData||plainToMarkup(cd?cd.getData('text/plain'):'');
  var toInsert=linkifyRichHTML(source);
  document.execCommand('insertHTML',false,toInsert);
  if(onAfter)onAfter();
}
function openRichLink(evt){
  var target=evt&&evt.target;
  var a=target&&target.closest?target.closest('a'):null;
  var href=a?safeRichHref(a.getAttribute('href')):'';
  if(!href)return;
  evt.preventDefault();evt.stopPropagation();
  var opened=window.open(href,'_blank','noopener,noreferrer');
  if(opened)opened.opener=null;
}
/* execCommand is deprecated but is what a contenteditable actually
   responds to; the editor must regain focus first or there is no
   selection for the command to act on. */
function execFmt(rte,cmd){
  if(!rte)return;
  rte.focus();
  try{document.execCommand(cmd,false,null);}catch(e){}
}
function preview(html,max){
  var t=plain(html);
  max=max||90;
  return t.length>max?t.slice(0,max-1)+'\u2026':t;
}
function isBlank(html){return !plain(html);}

/* ══ THE STORE ══════════════════════════════════════════════════════
   Two top-level records.

   `calls` is new. A call used to have no storage at all: its identity was
   a substring of every member project's name, and its title, colour,
   links, key dates and order were COPIED onto each member and resynced
   by fan-out on every edit. Reading a call meant picking a member and
   hoping — literally callProjects(key)[0]. Fan-out only ever reached
   ACTIVE members, so archived ones kept stale copies; archive every
   member and the call became unreachable; rename it and its info table,
   filed under the parsed name, detached. It is a record now.

   `projects` holds what is actually a project's own: its name, its
   people, its links, its dossier rows, its todos, its tracker.

   Both go to localStorage under one key and to the cloud as one blob. */
var projects={};
var calls={};
var showingArchive=false;

var SCHEMA=3;
/* Saved shapes of call — key dates and the work that hangs off them, kept
   as offsets from the final date. See THE BACKBONE. Top-level rather than
   per call, because one describes a KIND of call and the point is to lay
   out the next one of that kind. */
var backbones=[];
var STORAGE_KEY='pj-journal-v3';
/* Read once to migrate, then left alone. Not deleted: if this build ever
   misbehaves, the previous one still opens on its own untouched data. */
var LEGACY_PROJECTS_KEY='pj-projects-v1';
var LEGACY_CALLINFO_KEY='pj-callinfo-v1';
var INBOX_ID='__inbox__';

function cid(){return 'c'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}

/* The permanent "no project" bucket. Not user-created, never listed as a
   project, and the one project with no call: it exists so a todo always
   has somewhere to live. */
function ensureInbox(){
  if(!projects[INBOX_ID]){
    projects[INBOX_ID]=newProject({
      id:INBOX_ID,name:'Todo',
      desc:'General todos not tied to a specific project',
      callId:'',order:-1
    });
    save();
  }
  return projects[INBOX_ID];
}

/* The permanent programme. Horizon Europe is not a call: it is a standing
   programme of them, and the work against it is not one proposal to one
   deadline but a project per topic, each written for a topic on the Call
   Board. So it is a call record like every other one and at the same time
   not one — it is on the beam whether or not anything is in it yet, it is
   always the last chip there, and its colour is white where every other
   call wears one of its own. A chip like all the others in every other
   respect: same shape, same weight, and the colour does the saying.

   It also keeps no calendar. Its dates are its projects' — each of them
   carries the opening and the deadline of the topic it was written for —
   which is why the timeline draws the programme a lane per project where
   a call gets one lane for all of them.

   Held to all of that on every load rather than trusted to stay that way:
   it sits in the same store as the calls, and every path that writes a
   call could otherwise have written over it. */
var PROGRAMME_ID='__horizon__';
var PROGRAMME_COLOR='#FFFFFF';
/* Past any order a call can be dragged to, so the programme stays at the
   right-hand end without taking part in the shuffle that numbers the
   rest — see reorderCalls, which leaves it out for the same reason. */
var PROGRAMME_ORDER=1e6;
function ensureProgramme(){
  var c=calls[PROGRAMME_ID];
  if(!c){
    c=calls[PROGRAMME_ID]=newCall({id:PROGRAMME_ID,name:'HORIZON',
      title:'Horizon Europe \u2014 general',color:PROGRAMME_COLOR});
    save();
  }
  c.solo=false;
  c.order=PROGRAMME_ORDER;                     // last on the bar, always
  return c;
}
/* A programme project's own key dates, imported from the topic it was
   written for. Written here rather than reached for at every site, so the
   one shape the rest of the room asks a call's markers for is asked of a
   project's in exactly the same words. */
function projectMarkers(p){
  if(!p||p.callId!==PROGRAMME_ID)return [];
  return (p.markers||[]).filter(function(m){
    return m&&m.date&&isIsoDate(m.date);});
}

/* ── Constructors ──
   One place each shape is born, so a field added here is present on
   everything new without a normaliser having to invent it later. */
function newCall(f){
  f=f||{};
  return {id:f.id||cid(),name:f.name||'',title:f.title||'',color:f.color||'',
    solo:!!f.solo,links:f.links||[],markers:f.markers||[],
    rows:f.rows||[],order:typeof f.order==='number'?f.order:0,
    created:f.created||nowIso()};
}
function newProject(f){
  f=f||{};
  return {id:f.id||uid(),callId:f.callId||'',name:f.name||'',desc:f.desc||'',
    /* The Call Board topic this project is written for. The id is the
       truth; the code and the title are what was written on the topic the
       day it was picked, kept here so a project card can be drawn — and a
       search palette filled — without building the Board, which is the
       lazy room and holds three and a half megabytes of prose. */
    topicId:f.topicId||'',topicCode:f.topicCode||'',topicTitle:f.topicTitle||'',
    /* Its own key dates, in the same shape a call's are, imported from
       that topic — the programme has no calendar of its own to hang them
       on and every one of its projects closes on a different day. */
    markers:f.markers||[],
    industrial:!!f.industrial,coordinator:f.coordinator||'',
    /* The people at the coordinating organisation; a partner's own ride
       on its partner record. See Contacts in the editors. */
    coordContacts:f.coordContacts||[],
    /* The project's own groups: a short label and, through the position
       carrying `pi`, the researcher who leads it. They were the
       contribution tracker's M&CS PM columns until 2026-09-03. */
    piGroups:f.piGroups||[],
    partners:f.partners||[],positions:f.positions||[],links:f.links||[],
    rows:f.rows||[],todos:f.todos||[],tracker:f.tracker||null,
    order:typeof f.order==='number'?f.order:0,archived:!!f.archived,
    created:f.created||nowIso()};
}
function newRow(f){
  f=f||{};
  return {id:f.id||uid(),name:f.name||'',color:f.color||'',notes:f.notes||[]};
}
function newNote(f){
  f=f||{};
  var now=nowIso();
  return {id:f.id||uid(),label:f.label||'',body:f.body||'',
    created:f.created||now,edited:f.edited||f.created||now};
}
function newTodo(f){
  f=f||{};
  var now=nowIso();
  return {id:f.id||uid(),text:f.text||'',done:!!f.done,doneAt:f.doneAt||null,
    dueDate:f.dueDate||'',deadline:f.deadline||'',effort:+f.effort||0,
    /* The key, never the label — see CATS. A todo written before
       categories existed simply has none, which is the same as one that
       was never given one, so there is nothing to migrate. */
    category:f.category||'',
    /* Tied to one of its call's key dates, and how many days off it —
       negative for before. The marker's ID and not its name, because the
       todo lives in the same call as the marker and ids there are stable
       across saves; a rename must not cut the string. See THE TIE. */
    anchorId:f.anchorId||'',anchorDays:+f.anchorDays||0,
    /* Waiting on another todo — see THE CONDITION. The blocker's id and
       nothing else: ids are made by uid() and are unique across the whole
       journal, so one field can point anywhere in the call without also
       having to remember which project it landed in. */
    blockedBy:f.blockedBy||'',
    subStamps:f.subStamps||[],checklist:f.checklist||[],
    created:f.created||now,edited:f.edited||now};
}

/* ── Reading a call from a project ──
   The whole point of the rewrite: one lookup, no parsing, no sample. */
function callOf(p){return (p&&p.callId&&calls[p.callId])||null;}
function callName(c){return (c&&!c.solo&&c.name)?c.name:'';}
/* What a call is CALLED on screen — its official title if it has one, its
   short name otherwise. The card's front and its back face both read this;
   the back used to print the call's internal id instead. */
function callTitle(c){return (c&&(c.title||'').trim())||callName(c)||'Call';}
function callNameOf(p){return callName(callOf(p));}
/* A call with no colour of its own gets a stable one from its name. */
function seedCallColor(name){
  if(!name)return null;
  var s=String(name).trim().toLowerCase(),hash=0;
  for(var i=0;i<s.length;i++)hash=((hash<<5)-hash)+s.charCodeAt(i);
  return CALL_PALETTE[Math.abs(hash)%CALL_PALETTE.length];
}
function callColorOf(c){
  if(!c)return 'var(--gold2)';
  return c.color||seedCallColor(callName(c))||'var(--gold2)';
}
/* The colour a project wears everywhere: on the board, on its card, on
   the seam its tracker opens out of. */
function projColor(p){return p?callColorOf(callOf(p)):'var(--gold2)';}

/* ── Lookups ── */
function findTodo(pid,tid){
  var p=projects[pid];if(!p)return null;
  return (p.todos||[]).find(function(t){return t.id===tid;})||null;
}
/* Rows live on calls and on projects alike, so everything that reads one
   takes the owner rather than asking which kind it is. */
function rowsOf(owner){return listOn(owner,'rows');}
function findRow(owner,rid){
  return rowsOf(owner).find(function(r){return r.id===rid;})||null;
}
/* The journal's one clock. */
function nowIso(){return new Date().toISOString();}
/* ══ THE TIE ═════════════════════════════════════════════════════════
   A todo hangs off one of its call's key dates, at a fixed distance:
   "three weeks before the PO submission". That distance is the thing
   worth keeping — the day it lands on is only ever the answer to it.

   EU dates move, constantly and late. A todo that only knew the day it
   was put on was true on the afternoon it was written and quietly wrong
   from the next amendment onwards; a whole plan would rot one marker at a
   time with nothing saying so. Tied, it moves when the date it was
   measured from moves.

   It follows without asking. This app's rule is that an act you can take
   back is done and offered back on a toast rather than put to a question,
   and nothing is more reversible than a date.

   Since 2026-08-28 it has no control of its own. Mark asked for the tie
   to come off the todo card and kept the following, which is the half he
   actually uses: a tie is written when a backbone lays out a new call,
   re-measured whenever he moves the todo by hand, and read whenever a key
   date moves — and never chosen from a menu. So `anchorPhrase`, which
   said a tie out loud, and `hardMarkersFor`, which filled the picker, went
   with the button; nothing below this line draws anything. */
function markerById(c,id){
  if(!c||!id)return null;
  return (c.markers||[]).filter(function(m){return m.id===id;})[0]||null;
}
/* The project's own key dates first, then its call's. A Horizon project
   holds its topic's dates itself and its programme holds none, so for it
   the first list is the only one; for every other project the first is
   empty and this is the lookup it always was. */
function todoAnchor(p,t){
  if(!p||!t||!t.anchorId)return null;
  return markerById(p,t.anchorId)||markerById(calls[p.callId],t.anchorId);
}
/* Moving a todo by hand does not cut the tie, it re-measures it: you have
   said "not three weeks before, two", and that is what should follow the
   next time the date moves. Cutting it would make every hand-placed day
   the last thing that day ever did. */
function retieTodo(p,t){
  var m=todoAnchor(p,t);
  if(!m||!m.date||!isIsoDate(m.date)||!t.dueDate||!isIsoDate(t.dueDate))return;
  t.anchorDays=dayIndex(t.dueDate,m.date);
}
/* The dates of a call's markers before something wrote over them, so the
   ones that actually moved can be told from the ones only re-saved. */
function markerDates(cid){
  var c=calls[cid],out={};
  ((c&&c.markers)||[]).forEach(function(m){if(m.id)out[m.id]=m.date||'';});
  return out;
}
/* Called after any write to a call's markers. Returns what it moved, so
   the caller can offer it back. */
function syncAnchored(cid,before){
  var c=calls[cid];if(!c)return [];
  var moved=[];
  (c.markers||[]).forEach(function(m){
    if(!m.id||!m.date||!isIsoDate(m.date))return;
    var was=before[m.id];
    if(!was||was===m.date)return;
    callProjects(cid).forEach(function(p){
      (p.todos||[]).forEach(function(t){
        if(t.done||t.anchorId!==m.id||!t.dueDate)return;
        var to=addDays(m.date,+t.anchorDays||0);
        if(to===t.dueDate)return;
        moved.push({pid:p.id,eid:t.id,from:t.dueDate});
        t.dueDate=to;stampEdited(t);
      });
    });
  });
  return moved;
}
function offerUndoMoves(moved,what){
  if(!moved.length)return;
  toast(moved.length+' todo'+(moved.length===1?'':'s')+' moved with '+what,
    {action:'Undo',onAction:function(){
      moved.forEach(function(mv){
        var t=findTodo(mv.pid,mv.eid);
        if(t){t.dueDate=mv.from;stampEdited(t);}
      });
      save();Board.render();CallCard.render();
    }});
}
/* ══ THE CONDITION ═══════════════════════════════════════════════════
   One todo waits on another: check the budget, and only then send the
   letter. What is stored is the blocker's id and nothing more — the two
   halves of an ordering, and no state of its own to fall out of step,
   because whether the wait is over is a question with exactly one answer
   and the blocker already holds it.

   The search runs over the CALL and not the project. A proposal's real
   dependencies cross the lane constantly — the letter cannot go until the
   coordinator's budget is signed off, and that budget is somebody else's
   project on the same call. Ids come from uid() and are unique across the
   journal, so the id alone is enough to find it wherever it sits.

   What it is NOT: a scheduler. Nothing is hidden, nothing is ordered for
   you, no date is invented. The card says what it is waiting for and in
   what colour, and the judgement stays where it belongs.

   The one thing it does do is carry. Move a todo that others are waiting
   on and they go with it, to the same day — one direction only, and Mark
   was explicit about which: **the conditional one follows, never the
   other way round.** That is the asymmetry the wait already describes.
   Something has to happen first; move the first thing and everything
   queued behind it has moved whether the app admits it or not, so the
   app admits it. Dragging the blocked one is a different act — you are
   saying "I will do this later than I said", which changes nothing about
   the thing it is waiting for, so nothing else moves. */
function blockerOf(p,t){
  if(!p||!t||!t.blockedBy)return null;
  var pool=p.callId?allCallProjects(p.callId):[p];
  if(!pool.length)pool=[p];
  for(var i=0;i<pool.length;i++){
    var list=pool[i].todos||[];
    for(var j=0;j<list.length;j++){
      if(list[j].id===t.blockedBy)return {p:pool[i],e:list[j]};
    }
  }
  return null;                 // the blocker was deleted: the wait is over
}
/* Would tying `t` to `id` close a ring? A waits on B waits on A is not an
   ordering, it is two todos neither of which can ever be first, and it is
   easy to write by accident across two projects of one call. Walked rather
   than remembered, because the chain is short and a cached answer is one
   more thing that can be wrong. */
function blockCycles(p,t,id){
  var seen={},cur=id,guard=0;
  seen[t.id]=true;
  while(cur&&guard++<200){
    if(seen[cur])return true;
    seen[cur]=true;
    var b=blockerOf(p,{blockedBy:cur});
    /* blockerOf finds the todo `cur` IS; what it waits on in turn is the
       next link, and a blocker in another project is looked up from that
       project so the pool is right at every step. */
    if(!b)return false;
    cur=b.e.blockedBy||'';
  }
  return false;
}
/* Everything on the call waiting on `id`, moved to `iso`, and everything
   waiting on those in turn. Walked as a queue rather than a recursion for
   the same reason `blockCycles` is walked: the chain is short, and a
   guard is cheaper than trusting that no ring ever got written.

   Only a todo that already HAS a planned date follows. A todo with none
   is not somewhere, so it cannot be moved from there — giving it a date
   would be making a plan rather than carrying one, and the No-planned-date
   list is Mark's own pile of things not yet decided. It still passes the
   move on to whatever waits on IT, so an undated link in the middle of a
   chain does not cut the chain.

   Done todos are left where they are: the wait is over, and a finished
   thing has no business being re-dated by a change to its old blocker. */
function moveWaiters(p,id,iso){
  if(!p||!id||!isIsoDate(iso))return 0;
  var pool=p.callId?allCallProjects(p.callId):[p];
  if(!pool.length)pool=[p];
  var queue=[id],seen={},moved=0,guard=0;
  seen[id]=true;
  while(queue.length&&guard++<400){
    var cur=queue.shift();
    pool.forEach(function(pr){
      (pr.todos||[]).forEach(function(t){
        if(t.done||t.blockedBy!==cur||seen[t.id])return;
        seen[t.id]=true;
        queue.push(t.id);
        if(!t.dueDate||t.dueDate===iso)return;
        t.dueDate=iso;
        retieTodo(pr,t);        // the tie is re-measured, never cut
        stampEdited(t);
        moved++;
      });
    });
  }
  return moved;
}
/* Said out loud, because a press that moves one dot and three dots is a
   press that has to explain itself. */
function waitMovedNote(n){
  if(!n)return;
  toast(n===1?'One todo waiting on it moved with it.'
             :n+' todos waiting on it moved with it.');
}

/* ── Fields that are meant to be lists ──
   A journal can arrive from an old export or a hand-edited file, so no
   field is assumed to be the shape it should be.

     asList(v)           read it as a list, change nothing
     listOn(o,'k')       make it a list ON the record, hand it back
     listsOn(o,'a','b')  several at once, for the normalisers

   The first two differ in a way that matters: asList hands back a fresh
   array for a bad field, so pushing onto it writes into nothing. Where
   something is about to be added, reach for listOn. */
function asList(v){return Array.isArray(v)?v:[];}
function listOn(obj,key){
  if(!obj)return [];
  if(!Array.isArray(obj[key]))obj[key]=[];
  return obj[key];
}
function listsOn(obj){
  for(var i=1;i<arguments.length;i++)listOn(obj,arguments[i]);
  return obj;
}
/* A press fully dealt with: neither bubbles nor does the browser default. */
function stopEvt(evt){if(evt){evt.stopPropagation();evt.preventDefault();}}
/* A mouse press that is not the left button. Touch and pen have no
   buttons to speak of, so they are never it. */
function otherButton(e){return e.pointerType==='mouse'&&e.button!==0;}
/* Every record that keeps an `edited` date is stamped through here. */
function stampEdited(rec){if(rec)rec.edited=nowIso();return rec;}

/* ══ MIGRATION ══════════════════════════════════════════════════════
   Schema 2 had projects and callInfo. Everything that arrives from
   anywhere — localStorage, an import, a cloud row — is put through this
   before anything reads it, so there is exactly one description of what
   the old shape meant and it lives here. */
/* v2's entry types. They are not part of schema 3 — a row has a name of
   its own — but the migration needs them to name the rows it builds. */
var V2_TYPES={budget:'Budget',effort:'Effort',important:'Important',
  consortium:'Consortium',meeting:'Meeting notes',call:'Call',proposal:'Proposal',
  note:'Note',todo:'Todo'};
/* TODO is declared once, up with the other constants — this second copy of
   the same line said nothing the first had not. */
var MON3_PARSE=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
/* v2 wrote two different things into `edited`: an ISO string in call rows
   and the tracker, and a human string from ts() in entries and checklist
   notes. ts() renders en-GB and then swaps the comma for an em dash, so
   what is actually in the data reads "30 Jul 2026 — 20:57". Parsed as
   LOCAL time, because that is the zone it was written in and the zone it
   will be rendered back into. */
function toIso(v){
  if(!v||typeof v!=='string')return '';
  var s=v.trim();if(!s)return '';
  if(/^\d{4}-\d{2}-\d{2}T/.test(s))return s;
  var m=s.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})(?:\s*(?:,|\u2014|-)\s*(\d{1,2}):(\d{2}))?$/);
  if(m){
    var mi=MON3_PARSE.indexOf(m[2].slice(0,1).toUpperCase()+m[2].slice(1,3).toLowerCase());
    if(mi>-1)return new Date(+m[3],mi,+m[1],m[4]?+m[4]:0,m[5]?+m[5]:0).toISOString();
  }
  var d=new Date(s);
  return isNaN(d.getTime())?'':d.toISOString();
}
/* Two different things were called doneAt. A todo's was written by
   isoToday() and is a plain date the Completed row groups by; a
   checklist item's was written by ts() and is a moment. Keep the first a
   date and make the second a real timestamp, rather than flattening
   both into whichever the other one wanted. */
function toDate(v){
  if(!v||typeof v!=='string')return '';
  var s=v.trim();
  if(isIsoDate(s))return s;
  var iso=toIso(s);
  return iso?iso.slice(0,10):'';
}
function v2Prefix(name){var i=(name||'').indexOf(' - ');return i>-1?name.slice(0,i).trim():(name||'');}
function v2Short(name){
  if(!name)return 'Untitled';
  var i=name.indexOf(' - ');
  return i>-1?name.slice(i+3):name;
}
function v2GroupKey(p){
  return (p.name&&p.name.indexOf(' - ')>-1)?v2Prefix(p.name):('__solo_'+p.id);
}
/* v2 kept two kinds of note: a `rich` one already held markup, an `entry`
   held textarea text. Converting here, once on the way in, is what lets
   every read downstream trust that a body is markup. */
function v2Note(n,kind){
  var label=kind==='entry'?n.stamp:n.label;
  var body=kind==='entry'?n.text:n.html;
  var created=toIso(n.created),edited=toIso(n.edited);
  if(!created&&edited)created=edited;
  var text=typeof body==='string'?body:(body==null?'':String(body));
  return newNote({id:n.id,
    label:typeof label==='string'?label:(label==null?'':String(label)),
    body:kind==='entry'?plainToMarkup(text):text,
    created:created,edited:edited||created});
}
/* v2 derived a project's rows: walk entries, take each distinct non-todo
   `type` in first-appearance order, then append any type present only in
   the p.infoRows overlay, reading name and colour from that overlay
   because an entry had nowhere to put them. That derivation runs once
   here and the answer is stored. */
var V2_SEED_COLORS=TITLE_COLORS;
function v2SeedColor(type){
  var h=0,s=String(type||'');
  for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;
  return V2_SEED_COLORS[h%V2_SEED_COLORS.length];
}
function v2SeedName(type){
  return V2_TYPES[type]||(String(type||'').replace(/^custom-.*/,'New row'))||'Row';
}
function v2Rows(p){
  var entries=asList(p.entries);
  var overlay=asList(p.infoRows);
  var seen={},order=[];
  entries.forEach(function(e){
    var t=(e&&e.type)||'note';
    if(t===TODO)return;
    if(!seen[t]){seen[t]=true;order.push(t);}
  });
  overlay.forEach(function(o){
    if(o&&!seen[o.type]){seen[o.type]=true;order.push(o.type);}
  });
  var list=order.map(function(t){
    var o=overlay.find(function(x){return x&&x.type===t;});
    return {row:newRow({
        name:o&&o.name!=null?o.name:v2SeedName(t),
        color:(o&&o.color)||v2SeedColor(t),
        notes:entries.filter(function(e){return e&&(e.type||'note')===t;})
                     .map(function(e){return v2Note(e,'entry');})}),
      order:o&&typeof o.order==='number'?o.order:1e6};
  });
  list.forEach(function(r,i){if(r.order===1e6)r.order=1e6+i;});
  list.sort(function(a,b){return a.order-b.order;});
  return list.map(function(r){return r.row;});
}
function v2Todo(e){
  var created=toIso(e.created),edited=toIso(e.edited);
  if(!created&&edited)created=edited;
  return newTodo({id:e.id,
    text:typeof e.text==='string'?e.text:String(e.text==null?'':e.text),
    done:!!e.done,doneAt:toDate(e.doneAt)||null,
    dueDate:e.dueDate||'',deadline:e.deadline||'',effort:+e.effort||0,
    category:typeof e.category==='string'?e.category:'',
    anchorId:typeof e.anchorId==='string'?e.anchorId:'',
    anchorDays:+e.anchorDays||0,
    blockedBy:typeof e.blockedBy==='string'?e.blockedBy:'',
    subStamps:asList(e.subStamps).slice(),
    created:created,edited:edited||created,
    checklist:asList(e.checklist).map(function(ci){
      return {id:ci.id||uid(),
        text:typeof ci.text==='string'?ci.text:String(ci.text==null?'':ci.text),
        done:!!ci.done,doneAt:toIso(ci.doneAt)||null,focus:!!ci.focus,
        /* Never notes: no id, no label, no rich body, appended and never
           edited. Named for what they are, so `.notes` means one thing. */
        log:asList(ci.notes).map(function(n){
          return {id:n.id||uid(),
            text:typeof n.text==='string'?n.text:String(n.text==null?'':n.text),
            at:toIso(n.stamp)||''};
        })};
    })});
}
function v2Tracker(t){
  if(!t||typeof t!=='object')return null;
  return {months:typeof t.months==='number'?t.months:36,
    pmGroups:asList(t.pmGroups),
    verticals:asList(t.verticals),
    wps:asList(t.wps).map(function(wp){
      var o=Object.assign({},wp);
      o.notes=asList(wp.notes).map(function(n){return v2Note(n,'rich');});
      o.tasks=asList(wp.tasks).map(function(tk){
        var to=Object.assign({},tk);
        to.notes=asList(tk.notes).map(function(n){return v2Note(n,'rich');});
        return to;
      });
      return o;
    })};
}
/* Call-level fields existed once per member and could disagree, because
   fan-out only ever wrote to active members. The app itself read the
   first ACTIVE member, so that is what the user has been looking at and
   that is what wins. An all-archived call — unreachable in v2 — falls
   back to the first member holding anything, which recovers it. */
function v2Pick(members,field,isEmpty){
  var active=members.filter(function(p){return !p.archived;});
  var pool=active.length?active:members,i;
  for(i=0;i<pool.length;i++)if(!isEmpty(pool[i][field]))return pool[i][field];
  for(i=0;i<members.length;i++)if(!isEmpty(members[i][field]))return members[i][field];
  return undefined;
}
function migrate2to3(src,srcCallInfo){
  var emptyStr=function(v){return !v&&v!==0;};
  var emptyArr=function(v){return !Array.isArray(v)||!v.length;};
  var emptyNum=function(v){return typeof v!=='number'||isNaN(v);};
  srcCallInfo=srcCallInfo||{};

  /* An old bug could assign a whole exported envelope to `projects`,
     leaving the real dictionaries one level too deep. v2 could only
     detect and delete that. A migration is not mid-flight, so it
     unwraps and recovers instead. */
  var inner=src&&src.projects;
  if(inner&&typeof inner==='object'&&!Array.isArray(inner)){
    var ks=Object.keys(inner),hits=0,allObj=ks.length>0;
    ks.forEach(function(k){
      var o=inner[k];
      if(!o||typeof o!=='object'||Array.isArray(o)){allObj=false;return;}
      if(Array.isArray(o.entries)||typeof o.name==='string')hits++;
    });
    if(allObj&&hits===ks.length){
      if(src.callInfo&&typeof src.callInfo==='object'&&!Object.keys(srcCallInfo).length)
        srcCallInfo=src.callInfo;
      src=inner;
    }
  }

  var groups=[],byKey={};
  Object.keys(src||{}).forEach(function(id){
    var p=src[id];
    if(!p||typeof p!=='object'||Array.isArray(p))return;
    if(!p.id)p.id=id;
    if(p.id===INBOX_ID)return;
    var key=v2GroupKey(p);
    if(!byKey[key]){byKey[key]={key:key,members:[]};groups.push(byKey[key]);}
    byKey[key].members.push(p);
  });

  var outCalls={},outProjects={};
  groups.forEach(function(g,gi){
    var solo=g.key.indexOf('__solo_')===0;
    var order=v2Pick(g.members,'callOrder',emptyNum);
    var c=newCall({name:solo?'':g.key,solo:solo,
      title:v2Pick(g.members,'call',emptyStr)||'',
      color:v2Pick(g.members,'callColor',emptyStr)||'',
      links:(v2Pick(g.members,'callLinks',emptyArr)||[]).map(function(l){return Object.assign({},l);}),
      markers:(v2Pick(g.members,'markers',emptyArr)||[]).map(function(m){return Object.assign({},m);}),
      order:(typeof order==='number'&&!isNaN(order))?order:gi,created:''});
    var ci=srcCallInfo[g.key];
    if(ci&&Array.isArray(ci.rows)){
      c.rows=ci.rows.map(function(r){
        return newRow({id:r.id,name:r.name||'',color:r.color||'',
          notes:asList(r.notes).map(function(n){return v2Note(n,'rich');})});
      });
      delete srcCallInfo[g.key];
    }
    outCalls[c.id]=c;
    g.members.forEach(function(p){
      var np=newProject({id:p.id,callId:c.id,
        name:solo?(p.name||'Untitled'):v2Short(p.name),
        desc:p.desc||'',industrial:!!p.industrial,coordinator:p.coordinator||'',
        partners:asList(p.partners),
        positions:asList(p.positions),
        links:asList(p.links).map(function(l){return Object.assign({},l);}),
        rows:v2Rows(p),
        todos:asList(p.entries)
                .filter(function(e){return e&&e.type===TODO;}).map(v2Todo),
        tracker:v2Tracker(p.tracker),
        order:typeof p.order==='number'?p.order:0,
        archived:!!p.archived,created:toIso(p.created)});
      if(!c.created||(np.created&&np.created<c.created))c.created=np.created;
      outProjects[np.id]=np;
    });
    if(!c.created)c.created=nowIso();
  });

  /* Anything left in callInfo was filed under a call name no project
     carries any more — the rename orphan. Never dropped: it becomes a
     call with no projects, so the notes are still there to re-attach. */
  Object.keys(srcCallInfo).forEach(function(key){
    var ci=srcCallInfo[key];
    if(!ci||!Array.isArray(ci.rows)||!ci.rows.length)return;
    var c=newCall({name:key,order:1e6,
      rows:ci.rows.map(function(r){
        return newRow({id:r.id,name:r.name||'',color:r.color||'',
          notes:asList(r.notes).map(function(n){return v2Note(n,'rich');})});
      })});
    outCalls[c.id]=c;
  });

  var inbox=(src||{})[INBOX_ID];
  outProjects[INBOX_ID]=newProject({id:INBOX_ID,callId:'',name:'Todo',
    desc:'General todos not tied to a specific project',order:-1,
    todos:(inbox&&asList(inbox.entries))
            .filter(function(e){return e&&e.type===TODO;}).map(v2Todo),
    created:toIso(inbox&&inbox.created)});

  return {calls:outCalls,projects:outProjects};
}

/* ── Normalising ──
   Runs on every path that replaces the journal wholesale, so every
   render can read the shape it expects. Constructors mean this only has
   to repair, never invent. */
function normalise(){
  invalidateDerived();
  Object.keys(calls).forEach(function(id){
    var c=calls[id];
    if(!c||typeof c!=='object'){delete calls[id];return;}
    c.id=id;
    if(typeof c.name!=='string')c.name='';
    if(typeof c.title!=='string')c.title='';
    if(typeof c.color!=='string')c.color='';
    c.solo=!!c.solo;
    listsOn(c,'links','markers');
    if(typeof c.order!=='number'||isNaN(c.order))c.order=0;
    normaliseRows(c);
    normaliseMarkers(c.markers);
  });
  Object.keys(projects).forEach(function(id){
    var p=projects[id];
    if(!p||typeof p!=='object'){delete projects[id];return;}
    p.id=id;
    if(id===INBOX_ID){
      if(!p.name||!String(p.name).trim())p.name='Todo';
      p.callId='';
    } else {
      if(!p.name||!String(p.name).trim())p.name='(unnamed project)';
      /* A project whose call vanished would otherwise have no home for
         its key dates. Give it one of its own rather than lose them. */
      if(!p.callId||!calls[p.callId]){
        var c=newCall({solo:true,order:Object.keys(calls).length});
        calls[c.id]=c;
        p.callId=c.id;
      }
    }
    listsOn(p,'links','partners','positions','markers');
    normaliseMarkers(p.markers);
    ['topicId','topicCode','topicTitle'].forEach(function(k){
      if(typeof p[k]!=='string')p[k]='';
    });
    if(typeof p.order!=='number'||isNaN(p.order))p.order=0;
    p.archived=!!p.archived;
    normaliseRows(p);
    listOn(p,'todos');
    p.todos.forEach(function(t){
      if(!t.id)t.id=uid();
      if(typeof t.text!=='string')t.text=String(t.text==null?'':t.text);
      t.done=!!t.done;
      if(t.doneAt===undefined)t.doneAt=null;
      if(!t.dueDate)t.dueDate='';
      if(!t.deadline)t.deadline='';
      listsOn(t,'subStamps','checklist');
      t.checklist.forEach(function(ci){
        if(!ci.id)ci.id=uid();
        if(typeof ci.text!=='string')ci.text=String(ci.text==null?'':ci.text);
        ci.done=!!ci.done;
        if(ci.doneAt===undefined)ci.doneAt=null;
        ci.focus=!!ci.focus;
        listOn(ci,'log');
        ci.log.forEach(function(l){
          if(!l.id)l.id=uid();
          if(typeof l.text!=='string')l.text=String(l.text==null?'':l.text);
          if(typeof l.at!=='string')l.at='';
        });
      });
    });
  });
}
function normaliseRows(owner){
  listOn(owner,'rows').forEach(function(r){
    if(!r.id)r.id=uid();
    if(typeof r.name!=='string')r.name='';
    if(typeof r.color!=='string')r.color='';
    listOn(r,'notes');
    r.notes.forEach(function(n){
      if(!n.id)n.id=uid();
      if(typeof n.label!=='string')n.label=String(n.label==null?'':n.label);
      if(typeof n.body!=='string')n.body=String(n.body==null?'':n.body);
      if(typeof n.created!=='string')n.created='';
      if(typeof n.edited!=='string')n.edited=n.created||'';
      /* Which note was open used to be written onto the row, so it was
         persisted and synced. It lives in memory now; drop leftovers. */
      delete n.openNote;
    });
    delete r.openNote;delete r._justOpenedNote;
  });
}
function normaliseMarkers(list){
  list.forEach(function(mk){
    if(!mk.id)mk.id=mkId();
    if(!mk.name)mk.name='Marker';
    if(mk.endDate===undefined)mk.endDate='';
    if(mk.hard===undefined)mk.hard=true;
    if(!mk.color)mk.color='deadline';
  });
}

/* Silently losing persistence is the one failure worth interrupting for —
   everything keeps working in memory, but an export is now urgent. */
/* If the journal could not be read, the app still runs — but on an empty
   store, and saving that would write the emptiness over data that is
   probably still perfectly fine underneath. So a failed load latches,
   and save() refuses until the page is reloaded. Losing a session's
   edits is recoverable; overwriting the journal is not. */
var loadFailed=false;
/* Housekeeping is not a change. Everything the room does on its way up —
   reading the journal, upgrading an old one, running the within-schema
   migrations — goes through save() exactly as an edit of Mark's does, and
   the cloud used to be unable to tell the two apart: a startup migration
   stamped the journal with today's date and the device then believed
   itself newer than a genuinely newer cloud copy for ever after. Rather
   than mark every one of those call sites, the room says when it has
   finished starting; before that, a save is the app tidying up after
   itself, and after it, a save is Mark. */
var bootDone=false;
var _persistWarned=false;
function persistWarn(){
  if(_persistWarned)return;_persistWarned=true;
  toast('Could not write to browser storage \u2014 changes may not survive a reload. Export your data as a backup.',{duration:9000});
}

var _saveSoonTimer=null;
function journalBlob(){
  return {schema:SCHEMA,calls:calls,projects:projects,backbones:backbones};
}
/* The one place the journal's top-level records are installed — four
   doors lead here. */
function applyJournal(j){
  calls=j.calls||{};
  projects=j.projects||{};
  /* Backbones joined at schema 3 rather than at a bump of their own: a
     journal written before they existed simply has none, and one written
     since, read by anything older, loses them and nothing else. There is
     no shape here for an older reader to misunderstand. */
  backbones=Array.isArray(j.backbones)?j.backbones:[];
}
function save(){
  if(_saveSoonTimer){clearTimeout(_saveSoonTimer);_saveSoonTimer=null;}
  if(loadFailed)return;
  invalidateDerived();
  try{
    localStorage.setItem(STORAGE_KEY,JSON.stringify(journalBlob()));
    localStorage.setItem(STORAGE_KEY+'-ts',nowIso());
  }catch(e){persistWarn();}
  /* One line for the whole of "the cloud has not been told about this
     yet". It writes a flag to disk, so a change made and then lost to a
     closed lid is picked up at the next open of this device rather than
     dying with the page that held it in a variable. */
  if(bootDone&&!Cloud.applying())Cloud.mark();
}
/* Keystroke streams (rich notes, tracker fields) debounce: save()
   serialises the entire journal, and doing that per keypress is work
   that grows with the journal. Structural edits still call save(). */
function saveSoon(){
  if(_saveSoonTimer)clearTimeout(_saveSoonTimer);
  _saveSoonTimer=setTimeout(save,400);
}
function flushSaveSoon(){if(_saveSoonTimer)save();}
window.addEventListener('pagehide',flushSaveSoon);
document.addEventListener('visibilitychange',function(){
  if(document.visibilityState==='hidden')flushSaveSoon();
});

/* ── One-time migrations within schema 3 ──
   These sweep every project, so they must not run per render. */
function splitMultiCountPhds(p){
  if(!p||!Array.isArray(p.positions))return false;
  var changed=false,out=[];
  p.positions.forEach(function(item){
    if(item.type==='phd'){
      var n=Math.max(1,parseInt(item.count)||1);
      if(n>1){
        changed=true;
        for(var i=0;i<n;i++)out.push(Object.assign({},item,{id:uid(),count:''}));
        return;
      }
      if(item.count!==''&&item.count!=null){item.count='';changed=true;}
    }
    out.push(item);
  });
  if(changed)p.positions=out;
  return changed;
}
/* ── Rich text that was escaped a second time ──
   An `&amp;` that introduces a known entity name was an entity before
   something escaped it. Only that shape is touched, so the `&amp;` in
   `R&amp;D` — followed by a D, not an entity — is left alone.

   The trade: someone typing the six characters `&nbsp;` literally will
   have them read as the space they spell. Not gated to run once, because
   an old export carrying the damage can be imported at any time. */
var OVER_ESCAPED_ENTITY=/&amp;(?=(?:amp|nbsp|lt|gt|quot|apos|#\d+);)/g;
function repairOverEscaped(text){
  if(typeof text!=='string'||text.indexOf('&amp;')<0)return null;
  var out=text,guard=0,next;
  /* Each pass peels one round of escaping. */
  while(guard++<12){
    next=out.replace(OVER_ESCAPED_ENTITY,'&');
    if(next===out)break;
    out=next;
  }
  return out===text?null:out;
}
/* Every rich-text field in the journal, named once — a new home for notes
   is added here rather than found by walking the tree hopefully. */
function forEachRichField(fn){
  function rowNotes(owner){
    asList(owner&&owner.rows).forEach(function(r){
      asList(r.notes).forEach(function(n){fn(n,'body');});
    });
  }
  Object.values(calls).forEach(rowNotes);
  Object.values(projects).forEach(function(p){
    rowNotes(p);
    var t=p.tracker;if(!t)return;
    asList(t.wps).forEach(function(wp){
      asList(wp.notes).forEach(function(n){fn(n,'body');});
      asList(wp.tasks).forEach(function(tk){
        asList(tk.notes).forEach(function(n){fn(n,'body');});
      });
    });
    asList(t.verticals).forEach(function(v){
      fn(v,'desc');fn(v,'ours');
    });
  });
}
/* Journals that came up from v2 before the conversion above existed still
   carry plain text in their bodies. A raw newline with no tag is the tell:
   type two lines into this editor and you get a <div> or <br> between
   them, one line and there is no newline to find — so the test cannot
   mistake markup for text. */
function looksLikeLegacyPlain(text){
  return typeof text==='string'&&text.indexOf('\n')>=0&&!/<[a-z!\/]/i.test(text);
}
function repairRichText(){
  var dirty=false;
  forEachRichField(function(obj,key){
    var val=obj[key],out=val;
    var unescaped=repairOverEscaped(out);
    if(unescaped!=null)out=unescaped;
    if(looksLikeLegacyPlain(out))out=plainToMarkup(out);
    if(out!==val){obj[key]=out;dirty=true;}
  });
  return dirty;
}
/* The project card's groups were the contribution tracker's M&CS PM
   columns until 2026-09-03. Every project that had such columns is given a
   copy of them — the SAME ids, which is the whole point: every position
   already points at one of them by id and none of them has to be re-filed.
   A project with no tracker, or none whose columns were marked M&CS,
   starts with no groups and draws its positions as one plain run. Nothing
   is taken out of the tracker; its columns go on being its columns. */
function adoptTrackerGroups(p){
  if(!p||Array.isArray(p.piGroups))return false;
  var cols=asList(p.tracker&&p.tracker.pmGroups);
  p.piGroups=cols.filter(function(g){return g&&g.isMCS;})
    .map(function(g){return {id:g.id,short:g.short||'?'};});
  return true;
}
function runDataMigrations(){
  var dirty=false;
  if(repairRichText())dirty=true;
  Object.values(projects).forEach(function(p){
    if(adoptTrackerGroups(p))dirty=true;
    if(splitMultiCountPhds(p))dirty=true;
    if(p.tracker){
      if(Tracker.wipeUngroupedPm(p.tracker))dirty=true;
      if(Tracker.stripDeadGroupFields(p.tracker))dirty=true;
    }
  });
  if(dirty)save();
  return dirty;
}

/* Whatever arrives — a load, an import, a cloud download — takes the same
   road in: upgrade it if it is old, repair it, make sure the inbox is
   there, then run the within-schema migrations. One place, so a new
   normaliser is added once rather than at four sites that drift apart.
   `opts.persist` writes the result back and redraws; the boot path
   leaves both to its caller, which renders once everything is up. */
function adoptIncoming(opts){
  normalise();
  ensureInbox();
  ensureProgramme();
  runDataMigrations();
  if(opts&&opts.persist){
    save();
    Board.render();
  }
}
/* Anything that is not already schema 3 is schema 2 by definition: there
   was no version stamp before the envelope carried one.

   A `books` or `notebooks` list in an older file is read past without a
   word: the Ledger's notes section is gone and the Notes room keeps its
   own store, which travels through ROOM_STORES instead. */
function upgrade(blob,legacyCallInfo){
  if(blob&&blob.schema===SCHEMA&&blob.projects)
    return {calls:blob.calls||{},projects:blob.projects||{},
      backbones:Array.isArray(blob.backbones)?blob.backbones:[]};
  var src=(blob&&blob.projects&&!blob.schema&&looksLikeV2Envelope(blob))?blob.projects
         :(blob&&blob.projects)||blob||{};
  var ci=(blob&&blob.callInfo)||legacyCallInfo||{};
  return migrate2to3(src,ci);
}
function looksLikeV2Envelope(b){
  return !!(b&&typeof b==='object'&&b.projects&&typeof b.projects==='object'
    &&(b.version||b.callInfo||b.exported));
}

function load(){
  try{
    var emb=byId('pj-data');
    if(emb){
      var d=JSON.parse(emb.textContent||'{}');
      /* Embedded data is a shipped, pre-populated file: it replaces the
         journal wholesale and localStorage is deliberately not consulted. */
      if(d&&Object.keys(d).length){
        applyJournal(upgrade(d));
        adoptIncoming();return;
      }
    }
    var cur=localStorage.getItem(STORAGE_KEY);
    if(cur){
      applyJournal(upgrade(JSON.parse(cur)));
      adoptIncoming();return;
    }
    /* Nothing under the current key: this is the first run of this build.
       Read the previous one's two keys, migrate, and leave them where
       they are — untouched, so the old file still opens on its own data. */
    var lp=localStorage.getItem(LEGACY_PROJECTS_KEY);
    var lc=localStorage.getItem(LEGACY_CALLINFO_KEY);
    if(lp||lc){
      var oldProjects=lp?JSON.parse(lp):{};
      var oldCallInfo=lc?JSON.parse(lc):{};
      applyJournal(migrate2to3(oldProjects,oldCallInfo));
      adoptIncoming();
      save();
      toast('Journal upgraded to the new data model. Your previous data is still on this device, untouched.',{duration:9000});
      return;
    }
  }catch(e){
    /* Distinguish "nothing stored yet" from "we could not read what is
       stored". Only the second is a failure, and it must not lead to a
       save. */
    applyJournal({});
    loadFailed=true;
    adoptIncoming();
    toast('Could not read your journal \u2014 nothing has been overwritten. '
      +'Reload to try again, and export a backup before making changes. ('+e.message+')',
      {duration:0});
    return;
  }
  adoptIncoming();
}

/* ── Derived views ──
   The board and the timeline are both projections over the journal, and
   both are stale for exactly one reason: the data underneath changed. So
   they drop together, explicitly on every save — a timing-based cache
   would be wrong, because a marker drag mutates and re-renders in the
   same tick and would read its own stale copy. */
var _hzCache=null,_tlCache=null;
function invalidateDerived(){_hzCache=null;_tlCache=null;}

/* ── Ordering ──
   Calls sort by their own order, projects by order within their call.
   This is the order the board draws its lanes in, so dragging a chip in
   the beam physically rearranges the table beneath it. */
function activeProjects(){
  return Object.values(projects).filter(function(p){return !p.archived&&p.id!==INBOX_ID;});
}
/* Read-only: unlike the renderer's own pass this never assigns or saves
   missing order values, so calling it elsewhere cannot create a second
   place establishing those defaults. */
function sortLikeBoard(list){
  var groups=[],idx={};
  list.forEach(function(p){
    var key=p.callId;
    if(!idx[key]){idx[key]={key:key,projs:[]};groups.push(idx[key]);}
    idx[key].projs.push(p);
  });
  groups.forEach(function(g){var c=calls[g.key];g._co=(c&&c.order)||0;});
  groups.sort(function(a,b){return (a._co-b._co)||0;});
  groups.forEach(function(g){g.projs.sort(function(a,b){return(a.order||0)-(b.order||0);});});
  var out=[];
  groups.forEach(function(g){g.projs.forEach(function(p){out.push(p);});});
  return out;
}
/* Groups the active projects by call, normalising any missing order
   values on the way through. This is the one place that assigns them.
   A call with no active projects does not draw a lane — the same as
   before — but unlike before, the call itself is still there. */
function callGroups(){
  var groups=[],idx={},dirty=false;
  activeProjects().sort(function(a,b){return(a.order||0)-(b.order||0);}).forEach(function(p){
    var key=p.callId,c=calls[key];
    if(!idx[key]){
      idx[key]={key:key,call:c,hasCall:!!(c&&!c.solo),projs:[]};
      groups.push(idx[key]);
    }
    idx[key].projs.push(p);
  });
  groups.forEach(function(g,gi){
    var c=g.call;
    if(c&&(typeof c.order!=='number'||isNaN(c.order))){c.order=gi;dirty=true;}
    g._co=c?c.order:gi;
  });
  groups.sort(function(a,b){return (a._co-b._co)||0;});
  groups.forEach(function(g){g.projs.sort(function(a,b){return(a.order||0)-(b.order||0);});});
  if(dirty)save();
  return {list:groups,byKey:idx};
}
function callProjects(callId){
  return activeProjects().filter(function(p){return p.callId===callId;});
}
/* Every project of a call, archived included. The call card needs this
   where the board does not: a call is edited as a whole. */
function allCallProjects(callId){
  return Object.values(projects).filter(function(p){
    return p.callId===callId&&p.id!==INBOX_ID;});
}
/* A call nobody belongs to any more is not deleted automatically: its
   rows and notes may be the only record of a proposal that was pulled.
   This is the explicit path, used when the last project is deleted and
   the call has nothing else in it. */
function pruneCallIfBare(callId){
  if(callId===PROGRAMME_ID)return false;       // it outlives everything in it
  var c=calls[callId];if(!c)return false;
  if(allCallProjects(callId).length)return false;
  var hasContent=(c.rows||[]).some(function(r){
    return (r.notes||[]).some(function(n){return !isBlank(n.body)||n.label;});
  })||(c.markers||[]).length||(c.links||[]).length;
  if(hasContent&&!c.solo)return false;
  delete calls[callId];
  return true;
}

/* "Open" is a todo that isn't done. "Overdue" is an open todo whose HARD
   deadline has passed — a passed planned date is just late. */
function projTodoStats(p){
  var open=0,overdue=0;
  (p.todos||[]).forEach(function(t){
    if(t.done)return;
    open++;
    var d=daysUntil(t.deadline);
    if(d!==null&&d<0)overdue++;
  });
  return {open:open,overdue:overdue};
}

/* ══ CLOUD SYNC (Supabase) ══════════════════════════════════════════
   One row in one table holds the whole journal as a blob — the same thing
   Export/Import does, automated over HTTP. Local save() always happens
   first and instantly; the push is a debounced echo on top, so nothing
   here can make the app feel slower.

   What decides whether a copy is taken is the pair of facts written down
   below, and they replaced a comparison that was wrong in a way it took
   months to see. The old rule read the journal's own `-ts` — the moment
   this BROWSER last wrote to disk — against the cloud row's `updated_at`
   — the moment the CLOUD was last written. Those are not the same
   quantity. A machine opening an old copy migrates it on the way in and
   saves, which stamps `-ts` with today; the download's answer lands a
   moment later, reads today against a genuinely newer upload from the
   other machine, and concludes that the older copy is the newer one. It
   concludes that for ever after — and the older the copy, the more
   certainly it migrates on the way in and locks itself out. Reported by
   Mark on 2026-09-02: a second PC holding a fortnight-old journal that
   would not take an update and could not be talked out of it. There is a
   comment further down that saw half of this and patched only the case
   where the local copy is EMPTY.

   So the two facts are kept explicitly, and neither is a clock reading:

     `pj-cloud-seen`   the cloud row's own `updated_at` as it stood at this
                       device's last successful exchange with it. Only ever
                       copied from the cloud, never from this machine.
     `pj-cloud-dirty`  set when a change is made here, cleared when a push
                       lands. It is on disk rather than in a variable
                       precisely because the case it exists for is the page
                       going away between the change and the push.

   The four cases are then plain and none of them needs to compare clocks:
   the cloud has not moved since we last saw it (push if we are dirty,
   otherwise nothing); it has moved and we hold nothing unsent (take it,
   always — this is the case that was broken); it has moved and so have we
   (ask, because only Mark knows which he wants); we have never synced this
   device at all (ask as well, unless there is nothing here to lose). */

/* How much is in a journal, for the two questions that ask: is it safe to
   upload this over the cloud copy, and what does a restore point say it
   holds. Written once so the guard and the label can never disagree. A
   project with no name and no todos is furniture, not work. */
function projectCount(pobj){
  if(!pobj||typeof pobj!=='object')return 0;
  var n=0;
  for(var k in pobj){
    if(!Object.prototype.hasOwnProperty.call(pobj,k))continue;
    if(k===INBOX_ID)continue;
    var pr=pobj[k];
    if(pr&&Array.isArray(pr.todos)&&!pr.todos.length&&!pr.name)continue;
    n++;
  }
  return n;
}
/* A blob may be a v3 journal, a v2 envelope or a bare projects object —
   the cloud row holds whichever generation last wrote it. */
function projectsIn(blob){
  return (blob&&blob.projects&&typeof blob.projects==='object')?blob.projects:blob;
}
function whenWords(iso){
  if(!iso)return 'an unknown time';
  var d=new Date(iso);
  return isNaN(d.getTime())?'an unknown time':d.toLocaleString();
}

var Cloud=(function(){
  var CFG_KEY='pj-cloud-config';
  /* The app's own Supabase project, written in since 2026-10-10. Before
     the lock this url and key were the password, and every device had them
     pasted in by hand; since it the key alone opens nothing, so it can
     stand in a public page and a new device asks only for the email and
     the password. A device with no connection stored takes this one; a
     device that was given another keeps it, and one that pressed
     Disconnect stays disconnected (`off`) rather than being quietly put
     back on at the next open. */
  var BUILT_IN={url:'https://eaaggqydnjkufzajgpzh.supabase.co',
    key:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhYWdncXlkbmprdWZ6YWpncHpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2NzEwMjMsImV4cCI6MjA5OTI0NzAyM30.pRQPc-qZWV0wwPPnfQU0I_HzmZZ36xZYIXJQYfQG96g'};
  var SEEN_KEY='pj-cloud-seen',DIRTY_KEY='pj-cloud-dirty';
  var client=null,timer=null,applying=false;
  /* Since 2026-10-09 the cloud answers only a logged-in Mark: the database
     rules let the anon key alone read nothing and write nothing. Before
     that the key WAS the password, typed into every device and enough on
     its own to read and rewrite the whole journal. `ready` is whether this
     client holds a session. Without one nothing below may ask the cloud
     anything: the library quietly falls back to the bare key, the rules
     answer that with no rows rather than an error, and "no row" reads here
     as a first sync ever — which would push this device's copy and be
     refused. Asking nothing is the honest state, and the chip says why. */
  var ready=false,who='',authWatch=null;
  /* Download-only mode: local edits are never pushed automatically. The
     manual "Sync now" is deliberately still gated too — safe means safe. */
  var uploadDisabled=false;
  var status='disconnected';
  /* Until the first read lands, this device has no idea what is up there
     and must not push: a freshly-cleared browser would otherwise race its
     own empty state into the cloud ahead of the download. */
  var snapshotSeen=false,remoteWeight=0,remoteStamp=null;
  /* A read that failed once used to block every upload for the rest of the
     session, with nothing retrying it and nothing on screen saying so — a
     morning's work stayed on the machine it was typed on and the app
     looked well. Both halves retry now, and both say so. */
  var readTries=0,pushTries=0,readRetry=null,pushRetry=null;
  var said='',asked=false;

  function loadCfg(){try{var r=localStorage.getItem(CFG_KEY);return r?JSON.parse(r):null;}catch(e){return null;}}
  function saveCfg(cfg){try{if(cfg)localStorage.setItem(CFG_KEY,JSON.stringify(cfg));else localStorage.removeItem(CFG_KEY);}catch(e){}}
  function seen(){try{return localStorage.getItem(SEEN_KEY);}catch(e){return null;}}
  function setSeen(v){try{if(v)localStorage.setItem(SEEN_KEY,v);else localStorage.removeItem(SEEN_KEY);}catch(e){}}
  function isDirty(){try{return localStorage.getItem(DIRTY_KEY)==='1';}catch(e){return false;}}
  /* One instant, two spellings. The stamp this device keeps after a push is
     the string it sent, `…:00.123Z`; a timestamp column hands the same
     moment back as `…:00.123+00:00`. Compared as text the two never
     matched, so every open after a push of this device's own read as "the
     cloud has moved" — and with an upload still owed, as two copies that
     had both changed. Still no clock of this machine's is consulted: both
     sides are the cloud's own `updated_at`. */
  function sameStamp(a,b){
    if(a===b)return true;
    if(!a||!b)return false;
    var x=Date.parse(a),y=Date.parse(b);
    return !isNaN(x)&&x===y;
  }
  function setDirty(on){try{if(on)localStorage.setItem(DIRTY_KEY,'1');else localStorage.removeItem(DIRTY_KEY);}catch(e){}}

  /* `quiet` is for the one status that arrives with a dialog already on
     screen: saying it twice is not saying it louder. */
  function setStatus(s,msg,quiet){
    status=s;
    var menuBtn=byId('hd-more-btn');
    if(menuBtn){
      var shortStatus={
        disconnected:'not connected',
        connecting:'connecting',
        syncing:'saving',
        synced:'synced',
        error:'sync error',
        login:'log in needed'
      };
      var statusLabel=shortStatus[s]||s;
      menuBtn.setAttribute('data-cloud-status',s);
      menuBtn.setAttribute('aria-label','More actions. Cloud sync: '+statusLabel);
      menuBtn.title='More actions — Cloud sync: '+statusLabel;
    }
    /* The same chip Semaphore, Notes and the Atlas wear, for the same
       reason: the Ledger's sync used to report itself into a panel that is
       shut, and a coloured dot on the overflow button that says nothing
       until you hover it. It was the only one of the four with nowhere to
       fail out loud, and it is the one that failed. */
    var chip=byId('pjcloud');
    if(chip){
      var chipState={disconnected:'off',connecting:'connecting',syncing:'syncing',
                     synced:'synced',error:'error',login:'login'};
      var chipWord={disconnected:'no cloud',connecting:'connecting',syncing:'saving',
                    synced:'synced',error:'sync error',login:'log in'};
      chip.setAttribute('data-state',chipState[s]||s);
      var w=chip.querySelector('span');
      if(w)w.textContent=chipWord[s]||s;
      chip.title=(chipWord[s]||s)+(msg?' — '+msg:'')
        +'\nThe journal on the cloud. Press for sync, restore points and history.';
    }
    var txt=byId('cloud-status-text');
    if(txt){
      var map={
        disconnected:'Not connected.',
        connecting:'Reading the cloud…',
        syncing:'Saving to cloud…',
        synced:'Synced ✓ (last: '+new Date().toLocaleTimeString()+')'
          +(uploadDisabled?' — safe mode: download only':'')+(msg?' — '+msg:''),
        error:'Sync error'+(msg?': '+msg:'')+'.',
        login:'Not logged in — nothing is read from or sent to the cloud until you log in.'
      };
      txt.textContent=map[s]||s;
    }
    /* Once per distinct message, not once per retry. */
    if(s==='error'&&msg&&msg!==said&&!quiet){said=msg;toast('Cloud sync — '+msg,{duration:9000});}
    if(s==='synced')said='';
  }
  function updateToggleBtn(){
    var btn=byId('cloud-upload-toggle');
    if(!btn)return;
    btn.textContent=uploadDisabled?'Turn sync back on (enable upload)':'Switch to safe mode (download only)';
    btn.classList.toggle('btn-primary',uploadDisabled);
    btn.title=uploadDisabled
      ?'Safe mode: local changes are NOT pushed to the cloud — this device only downloads. Click to re-enable two-way sync.'
      :'Click to stop pushing local changes to the cloud — this device will only download from it.';
    var sn=byId('cloud-sync-now');
    if(sn){sn.disabled=uploadDisabled;sn.style.opacity=uploadDisabled?'0.45':'';
      sn.title=uploadDisabled?'Disabled in safe mode — uploading is blocked.':'';}
  }

  function init(){
    var cfg=loadCfg();
    if(!cfg){cfg={url:BUILT_IN.url,key:BUILT_IN.key};saveCfg(cfg);}
    var setup=byId('cloud-setup-fields'),connected=byId('cloud-connected-fields');
    if(!cfg.url||!cfg.key){
      var fu=byId('cloud-url'),fk=byId('cloud-key');
      if(fu&&!fu.value)fu.value=BUILT_IN.url;
      if(fk&&!fk.value)fk.value=BUILT_IN.key;
      setStatus('disconnected');
      if(setup)setup.style.display='block';
      if(connected)connected.style.display='none';
      return;
    }
    uploadDisabled=!!cfg.uploadDisabled;
    updateToggleBtn();
    if(setup)setup.style.display='none';
    if(connected)connected.style.display='block';
    if(typeof window.supabase==='undefined'){
      setStatus('error','the Supabase library did not load — check your internet connection and reload the page.');return;
    }
    try{
      /* The session is kept under a name of this app's own rather than the
         library's default, so PROJECT.md can say where it lives. This is
         the one client in the page that signs in: the bridge's clients
         borrow its token through `token()` and hold no session at all. */
      client=window.supabase.createClient(cfg.url,cfg.key,{
        auth:{storageKey:'pj-cloud-auth',persistSession:true,
              autoRefreshToken:true,detectSessionInUrl:false}});
      snapshotSeen=false;remoteWeight=0;remoteStamp=null;
      readTries=0;pushTries=0;asked=false;ready=false;
      watchAuth();
      client.auth.getSession().then(function(r){
        var s=r&&r.data&&r.data.session;
        if(s)signedIn(s);else needLogin();
      }).catch(function(e){setStatus('error',e.message);});
    }catch(e){setStatus('error',e.message);}
  }

  /* The library tells us when the session ends on its own — a refresh
     refused because the session was revoked, or a log-out in another tab.
     Its advice is to call nothing of its own from inside this callback,
     since the callback runs under the lock those calls wait for; hence
     the setTimeout. */
  function watchAuth(){
    if(authWatch){try{authWatch.unsubscribe();}catch(e){}}
    var c=client;
    var sub=c.auth.onAuthStateChange(function(event,session){
      setTimeout(function(){
        if(c!==client)return;
        if(event==='SIGNED_OUT'){if(ready)signedOut();}
        else if(event==='SIGNED_IN'&&session&&!ready)signedIn(session);
        /* a renewal that finally got through, after the retries gave up:
           whatever is owed goes now rather than at the next change */
        else if(event==='TOKEN_REFRESHED'&&ready&&isDirty()&&!timer)queue();
      },0);
    });
    authWatch=sub&&sub.data&&sub.data.subscription;
  }
  function showLogin(on){
    var lf=byId('cloud-login-fields'),row=byId('cloud-sync-row'),w=byId('cloud-who');
    if(lf)lf.style.display=on?'block':'none';
    if(row)row.style.display=on?'none':'';
    if(w)w.textContent=on?'':'Logged in as '+who+'.';
    if(on){
      var em=byId('cloud-email'),cfg=loadCfg();
      if(em&&!em.value&&cfg&&cfg.email)em.value=cfg.email;
    }
  }
  function needLogin(){
    ready=false;
    showLogin(true);
    setStatus('login');
  }
  function signedIn(s){
    if(ready)return;
    ready=true;who=(s&&s.user&&s.user.email)||'';
    showLogin(false);
    snapshotSeen=false;remoteWeight=0;remoteStamp=null;
    readTries=0;pushTries=0;asked=false;
    download();
    /* the panel is usually open when this happens, and its list of cloud
       versions was drawn while there was no session to read it with */
    var cp=byId('cloud-panel');
    if(cp&&cp.style.display==='block'){History.recheck();cloudHistoryRefresh();}
    try{Hub.emit('cloud:session',true);}catch(e){}
  }
  function signedOut(){
    ready=false;who='';
    clearTimeout(timer);timer=null;clearTimeout(readRetry);clearTimeout(pushRetry);
    snapshotSeen=false;remoteWeight=0;remoteStamp=null;
    needLogin();
    var cp=byId('cloud-panel');
    if(cp&&cp.style.display==='block')cloudHistoryRefresh();
    try{Hub.emit('cloud:session',false);}catch(e){}
  }
  /* A password rather than a code by mail: Supabase's own mail service
     sends two messages an hour, and only to the project's team, so a code
     per device made logging in four devices a two-hour job. The session
     renews itself after this, so a device is logged in once. */
  function logIn(){
    if(!client){toast('Connect to the project first.');return;}
    var em=byId('cloud-email'),pw=byId('cloud-pass');
    var email=((em&&em.value)||'').trim(),pass=(pw&&pw.value)||'';
    if(!email||!pass){toast('Both your email and your password are needed.');return;}
    setStatus('connecting');
    client.auth.signInWithPassword({email:email,password:pass}).then(function(r){
      if(r&&r.error){setStatus('login');toast('Log in failed — '+r.error.message,{duration:7000});return;}
      if(pw)pw.value='';
      var cfg=loadCfg();if(cfg){cfg.email=email;saveCfg(cfg);}
      signedIn(r&&r.data&&r.data.session);
    }).catch(function(e){setStatus('login');toast('Log in failed — '+e.message,{duration:7000});});
  }
  function logOut(){
    if(!client)return;
    var c=client;
    signedOut();
    c.auth.signOut().catch(function(){});
  }
  /* The bridge's syncs and inboxes ask here for the token to send. A
     promise that refuses when there is no session — never the bare key —
     so a request made in that state fails out loud instead of being
     answered with an empty table. */
  function token(){
    if(!client||!ready)return Promise.reject(new Error('not logged in'));
    return client.auth.getSession().then(function(r){
      var s=r&&r.data&&r.data.session;
      if(!s){
        if(offline(r))throw new Error(r.error.message);
        ended();throw new Error('not logged in');
      }
      return s.access_token;
    });
  }
  /* A session can end without anyone pressing Log out: a renewal the
     server refuses lets the library keep the old one only until it runs
     out, and then quietly drop it. The next request would go out with the
     bare key and be refused — "permission denied", which says nothing
     useful. So every read and every look first asks whether there is still
     a session, and when there is not, says "log in" instead. */
  function ended(){if(ready)setTimeout(function(){if(ready)signedOut();},0);}
  /* A renewal that could not reach the server at all — a laptop waking
     before its network has — is not the end of the session, and must not
     send Mark to the login: the ordinary retries take it from there. Only
     an answer from the server (a 4xx) ends it. */
  function offline(r){
    var e=r&&r.error;
    return !!e&&!(e.status>=400&&e.status<500);
  }
  function live(go,failed){
    var c=client;
    c.auth.getSession().then(function(r){
      if(c!==client||!ready)return;
      if(!(r&&r.data&&r.data.session)){
        if(offline(r)){failed(r.error.message);return;}
        ended();return;
      }
      go();
    }).catch(function(e){if(c===client&&ready)failed(e.message);});
  }

  function connect(safe){
    var url=(byId('cloud-url').value||'').trim();
    var key=(byId('cloud-key').value||'').trim();
    if(!url||!key){toast('Both the Project URL and the anon public key are needed.');return;}
    var existing=loadCfg();
    saveCfg({url:url,key:key,
      uploadDisabled:(safe===undefined?!!(existing&&existing.uploadDisabled):!!safe)});
    init();
  }
  function disconnect(){
    if(client){
      var c=client;
      try{c.auth.signOut({scope:'local'}).catch(function(){});}catch(e){}
      if(authWatch){try{authWatch.unsubscribe();}catch(e){}authWatch=null;}
    }
    if(ready){ready=false;who='';try{Hub.emit('cloud:session',false);}catch(e){}}
    showLogin(false);
    saveCfg({off:true});client=null;
    snapshotSeen=false;remoteWeight=0;remoteStamp=null;
    /* What the cloud held is no longer known, so it is forgotten. What is
       unsent is still unsent, so that is kept: reconnecting should send it. */
    setSeen(null);
    clearTimeout(timer);clearTimeout(readRetry);clearTimeout(pushRetry);
    var setup=byId('cloud-setup-fields'),connected=byId('cloud-connected-fields');
    if(setup)setup.style.display='block';
    if(connected)connected.style.display='none';
    setStatus('disconnected');
  }
  function toggleUpload(){
    uploadDisabled=!uploadDisabled;
    var cfg=loadCfg();
    if(cfg){cfg.uploadDisabled=uploadDisabled;saveCfg(cfg);}
    if(uploadDisabled)clearTimeout(timer);
    updateToggleBtn();
    setStatus(status);
  }

  /* Every local change lands here. The flag is the memory of it that
     outlives the page. */
  function mark(){
    edits++;
    setDirty(true);
    queue();
  }
  var edits=0;
  function queue(){
    if(!client||!ready||uploadDisabled)return;
    clearTimeout(timer);
    timer=setTimeout(push,1200);
  }
  /* That debounce is 1.2 seconds of grace after the last keystroke, and a
     lid closes faster than that. Nothing used to flush it, so the last
     change of a session routinely never left the machine — and because the
     LOCAL save had happened, the machine it was typed on looked perfectly
     right while the cloud quietly stayed a day behind. Hiding the page is
     the last moment we are certainly still running. If the request is cut
     off half-sent even so, `pj-cloud-dirty` is on disk and the next open of
     this device sends it: that flag, not this handler, is what makes a lost
     upload recoverable. */
  function flush(){
    if(!timer)return;
    clearTimeout(timer);timer=null;
    push();
  }
  window.addEventListener('pagehide',flush);
  document.addEventListener('visibilitychange',function(){
    if(document.visibilityState==='hidden')flush();
    else lookAgain();
  });
  window.addEventListener('focus',lookAgain);

  /* A tab left open overnight still believes the cloud is where it was
     last evening. The first change made in it the next morning used to go
     straight up and write over everything the other machine had sent
     since — and that machine, holding nothing unsent, then took the old
     copy back at its next open. So coming back to the page asks whether
     the cloud has moved, and every upload asks the same question first:
     a moved cloud is read, and the four cases below decide, before
     anything is written over it. The look is one small request for a
     date, and at most one every half minute. */
  var lookedAt=0;
  function lookAgain(){
    if(!client||!ready||!snapshotSeen||timer)return;
    if(Date.now()-lookedAt<30000)return;
    lookedAt=Date.now();
    peek(function(moved){if(moved)download();});
  }
  /* `moved` is true when the cloud's row is no longer the one this session
     last read or wrote; `err` is set when it could not be asked at all. */
  function peek(cb){
    live(function(){peekNow(cb);},function(m){cb(false,m);});
  }
  function peekNow(cb){
    client.from('app_state').select('updated_at').eq('id','main').single()
      .then(function(res){
        if(res&&res.error){
          if(res.error.code==='PGRST116'){cb(!!remoteStamp);return;}
          cb(false,res.error.message);return;
        }
        cb(!sameStamp(res.data&&res.data.updated_at,remoteStamp));
      })
      .catch(function(e){cb(false,e.message);});
  }

  function push(){
    if(!client||!ready)return;
    clearTimeout(timer);timer=null;
    if(uploadDisabled){setStatus('synced');return;}
    if(!snapshotSeen){
      setStatus('error','still reading the cloud — the upload waits for that to finish');return;
    }
    /* This is the case that ate the data once: browser storage cleared, the
       app reloads with nothing, and sync pushes the nothing. */
    var localW=projectCount(projects);
    if(remoteWeight>0&&(localW===0||localW*2<remoteWeight)){
      Dialog.ask({title:'Overwrite the cloud copy?',
        body:'This device has '+localW+' project'+(localW===1?'':'s')+', but the cloud has '
          +remoteWeight+'.\n\nUploading now replaces the cloud copy with this smaller one. '
          +'If you cleared this browser’s data, cancel and reconnect in safe mode instead.',
        confirm:'Overwrite cloud'},send);
      setStatus('error','upload held — waiting on you. The cloud copy is untouched.',true);
      return;
    }
    send();
  }
  function send(){
    setStatus('syncing');
    peek(function(moved,err){
      if(err){pushFailed(err);return;}
      if(moved){download();return;}
      write();
    });
  }
  function write(){
    var iso=nowIso(),blob=journalBlob(),at=edits;
    client.from('app_state').upsert({id:'main',data:blob,updated_at:iso})
      .then(function(res){
        if(res&&res.error){pushFailed(res.error.message);return;}
        pushTries=0;
        remoteWeight=projectCount(projects);
        /* A change made while this was on the wire is not in it, and the
           flag is its only memory if the page goes before its own push. */
        remoteStamp=iso;setSeen(iso);if(at===edits)setDirty(false);
        History.keep(client,'main',iso,blob,remoteWeight);
        setStatus('synced');
      })
      .catch(function(e){pushFailed(e.message);});
  }
  /* "Will retry on the next change" was the whole of the old recovery, and
     the change that matters is usually the last one of the day — there is
     no next one. Five tries, spaced; and the dirty flag outlives all of
     them, so even a total failure is only a delay until the next open.
     The last tries wait half a minute each since the login (2026-10-09): a
     laptop waking before its network renews its session in vain, and the
     library then refuses every ask for a minute — three quick tries all
     fell inside that minute and the change waited for the next one. */
  function pushFailed(msg){
    if(!ready){needLogin();return;}
    setStatus('error',msg);
    if(pushTries++>=5)return;
    clearTimeout(pushRetry);
    pushRetry=setTimeout(function(){if(client&&ready&&isDirty())push();},
      pushTries<=2?pushTries*4000:30000);
  }

  function download(){
    if(!client||!ready)return;
    setStatus('connecting');
    live(downloadNow,readFailed);
  }
  function downloadNow(){
    client.from('app_state').select('data,updated_at').eq('id','main').single()
      .then(function(res){
        if(res&&res.error){
          if(res.error.code==='PGRST116'){       // no row yet: first sync ever
            snapshotSeen=true;remoteWeight=0;remoteStamp=null;readTries=0;
            if(uploadDisabled){setStatus('synced','no cloud copy exists yet');return;}
            setStatus('synced');push();return;
          }
          readFailed(res.error.message);
          return;
        }
        readTries=0;snapshotSeen=true;
        var incoming=res.data&&res.data.data;
        if(typeof incoming==='string'){try{incoming=JSON.parse(incoming);}catch(e){incoming=null;}}
        remoteStamp=(res.data&&res.data.updated_at)||null;
        remoteWeight=projectCount(projectsIn(incoming));
        if(!incoming){setStatus('synced','the cloud row is empty');push();return;}

        /* What the cloud held the moment this device opened, kept whether
           or not it is taken. It is the copy to come back to when a session
           goes wrong, which is the thing Mark asked for. */
        Snapshots.take('what the cloud held when this opened',incoming,remoteStamp);

        var lastSeen=seen();
        if(lastSeen&&sameStamp(lastSeen,remoteStamp)){   // the cloud is where we left it
          setStatus('synced');
          if(isDirty())push();
          return;
        }
        if(projectCount(projects)===0&&remoteWeight>0){
          take(incoming,'there was nothing on this device');return;
        }
        if(lastSeen&&!isDirty()){
          take(incoming,'this device had nothing unsent');return;
        }
        /* Either both sides have moved, or this device has never synced and
           cannot know. Both are questions, not decisions. */
        askWhich(incoming);
      })
      .catch(function(e){readFailed(e.message);});
  }
  /* A failed read blocks every upload deliberately — writing over a cloud
     copy we were not allowed to READ is how a good copy dies. What was
     wrong was that nothing tried again and nothing said anything. */
  function readFailed(msg){
    if(!ready){needLogin();return;}
    setStatus('error',msg+' — nothing is uploaded until a read succeeds');
    if(readTries++>=6)return;
    clearTimeout(readRetry);
    readRetry=setTimeout(download,readTries<3?2000:20000);
  }

  /* The one road in, whichever door a copy came through. What is here goes
     into the restore points first, so taking the cloud is never a thing
     that cannot be taken back. */
  function take(incoming,why){
    Snapshots.take('before taking the cloud copy');
    applying=true;
    applyJournal(upgrade(incoming));
    adoptIncoming({persist:true});
    applying=false;
    setSeen(remoteStamp);setDirty(false);
    setStatus('synced','took the cloud copy — '+why);
    toast('Took the cloud copy — '+why+'. The previous one is a restore point.',{duration:7000});
  }
  /* Both sides have moved since this device last synced, or this device has
     never synced at all and has no way to tell. Only Mark knows which copy
     he wants, and the box says what he needs to know it: what each one
     holds and when the cloud's was written. Dialog has one affirmative
     branch by design, and "do nothing" is the honest meaning of no here —
     keeping this device's copy costs nothing, because the next change
     uploads it. A restore point is taken either way, so neither answer is
     final. Asked once per version of the cloud: a retry that asks again
     every twenty seconds is not a question, it is a nag — but a copy the
     other machine sent after the answer is a new question, and once every
     upload looks before it writes, it is one that can come up mid-session. */
  function askWhich(incoming){
    if(asked===remoteStamp)return;
    asked=remoteStamp;
    var localW=projectCount(projects);
    /* Never having synced is not the same as holding unsent work, and the
       box must not claim the second when it only knows the first. */
    var mine=isDirty()?' and changes it has not sent.'
                      :', and has never synced with this cloud.';
    Dialog.ask({title:'Two copies have changed',
      body:'The cloud copy has '+remoteWeight+' project'+(remoteWeight===1?'':'s')
        +', written '+whenWords(remoteStamp)+'.\n'
        +'This device has '+localW+' project'+(localW===1?'':'s')+mine+'\n\n'
        +'Whichever you choose, what is on this device becomes a restore point first — '
        +'nothing is thrown away. Keeping this one uploads it at your next change.',
      confirm:'Take the cloud copy',cancel:'Keep this device’s copy',danger:false},
      function(){take(incoming,'you chose it');});
    setStatus('error','two copies have changed — waiting on you',true);
  }

  /* Pressing Check is asking, so it may be asked again. */
  function check(){asked=false;download();}

  return {init:init,connect:connect,disconnect:disconnect,push:push,
    queue:queue,mark:mark,check:check,toggleUpload:toggleUpload,
    logIn:logIn,logOut:logOut,token:token,
    client:function(){return ready?client:null;},
    connected:function(){return !!client&&ready;},
    signedIn:function(){return !!client&&ready;},
    configured:function(){return !!client;},
    applying:function(){return applying;}};
})();

/* ══ THE CLOUD'S OWN HISTORY ════════════════════════════════════════
   The row the sync writes is ONE row: every upload overwrites the last,
   and the last word wins even when the last word was a mistake. A second
   table keeps a copy of every upload, so a bad overwrite — from either
   machine — is something to walk back from either machine, which a restore
   point held in this browser can never be.

   It is only ever inserted into and read from. A trigger in Supabase drops
   all but the newest twenty of each row, so nothing in the browser has to
   be given permission to delete anything. Until the table exists every
   insert fails, and a failed insert is deliberately silent: the upload
   itself succeeded, and a missing history table must never read as a
   broken sync. The SQL that makes it is in the panel, under "Set up the
   history table". */
var History=(function(){
  var TABLE='app_state_history';
  var have=true;
  function keep(client,rowId,iso,blob,n){
    if(!client||!have)return;
    try{
      client.from(TABLE).insert({row_id:rowId,data:blob,n:n,saved_at:iso})
        .then(function(res){if(res&&res.error)have=false;})
        .catch(function(){have=false;});
    }catch(e){have=false;}
  }
  /* The list never asks for `data` — twenty journals is eight megabytes to
     draw a list of dates with. The blob is fetched for the one that is
     actually restored. */
  function list(client,rowId,cb){
    if(!client){cb(null,'not connected');return;}
    client.from(TABLE).select('id,saved_at,n').eq('row_id',rowId)
      .order('saved_at',{ascending:false}).limit(20)
      .then(function(res){
        if(res&&res.error){have=false;cb(null,res.error.message);return;}
        have=true;cb((res&&res.data)||[],null);
      })
      .catch(function(e){cb(null,e.message);});
  }
  function fetch(client,id,cb){
    if(!client){cb(null,'not connected');return;}
    client.from(TABLE).select('data,saved_at,n').eq('id',id).single()
      .then(function(res){
        if(res&&res.error){cb(null,res.error.message);return;}
        cb(res&&res.data,null);
      })
      .catch(function(e){cb(null,e.message);});
  }
  return {keep:keep,list:list,fetch:fetch,
    recheck:function(){have=true;}};
})();

function toggleCloudPanel(){
  var el=byId('cloud-panel');
  if(!el)return;
  var open=(el.style.display==='none'||!el.style.display);
  el.style.display=open?'block':'none';
  if(open){Snapshots.render();History.recheck();cloudHistoryRefresh();}
}
function closeCloudPanel(){
  var el=byId('cloud-panel');
  if(el)el.style.display='none';
}

/* ── Export / Import ── */

/* The rooms that keep a store of their own and hand it through this door.
   The key in the file is the room's own name, so a file can be read by
   eye, and `what` is how the toast says it out loud. Adding a room here
   is the whole of joining the export — both halves read this list. */
var ROOM_STORES=[{id:'semaphore',what:'the Semaphore board'},
                 {id:'notes',    what:'the notes'},
                 {id:'atlas',    what:'the Atlas edits'}];

/* 'a', 'a and b', 'a, b and c'. The old toast could only ever name one
   thing, so it said it plainly; with three it has to be a sentence. */
function andList(parts){
  if(parts.length<3)return parts.join(' and ');
  return parts.slice(0,-1).join(', ')+' and '+parts[parts.length-1];
}

/* The whole app in one object: the journal, and beside it the store of
   every room in ROOM_STORES.

   The rooms are asked by name rather than each being written out here,
   because the notes were added a year after Semaphore and the two halves
   of that change — export and import — sat forty lines apart with nothing
   to say they belonged together. One list, read twice.

   Three things want exactly this object — the Export file, a restore point
   and a version in the cloud history — so it is built in one place and
   they cannot drift. A file written before a room joined the list simply
   has no key for it, and reading that file leaves the room alone. */
function fullBlob(){
  var out=Object.assign({exported:ts()},journalBlob());
  ROOM_STORES.forEach(function(r){
    try{
      var api=Hub.api(r.id);
      if(api&&typeof api.state==='function'){
        var st=api.state();
        if(st)out[r.id]=st;
      }
    }catch(e){}
  });
  return out;
}

function exportData(){
  /* One door for the whole app, and no room needs an Export button of its
     own. What is carried is read back off the object rather than counted
     while it is built, so the toast cannot claim a room the file has not
     got. */
  var out=fullBlob();
  var carried=ROOM_STORES.filter(function(r){return !!out[r.id];})
                         .map(function(r){return r.what;});
  var blob=new Blob([JSON.stringify(out,null,2)],{type:'application/json'});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='one_app_'+nowIso().slice(0,10)+'.json';
  a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
  toast(carried.length?'Exported \u2014 '+andList(['journal'].concat(carried))
                      :'Journal exported to JSON');
}
/* Import merges. A file of any generation is upgraded first, so the merge
   only ever has to reason about one shape.

   Calls need a little care that projects do not. A project is merged by
   id and imported wins, which is what you would expect. But a v2 file has
   no call ids at all — they are generated during the upgrade — so
   importing the same old export twice would otherwise create a second
   copy of every call. Named calls therefore merge by name onto an
   existing one, and the incoming projects are pointed at it. */
function importData(input){
  var file=input.files[0];if(!file)return;
  var reader=new FileReader();
  reader.onload=function(e){
    try{
      var parsed=JSON.parse(e.target.result);
      /* Whatever this file turns out to hold, what is here now is kept
         first — the room stores below are replaced outright, and that
         happens before the journal's own question is even asked. */
      Snapshots.take('before importing a file');
      /* The other rooms' stores travel with the journal, and each is
         replaced rather than merged: two arena boards have no shared keys
         to merge on, two heaps of notes have no honest ones, and a
         half-merge is worse than a plain swap you can undo by importing
         the other file back. Only the journal itself merges, because a
         project really does have one id on both sides.

         This runs before the journal's own confirm box, exactly as the
         board always has: the box asks about projects, and answering it
         is not the moment to be asked about two other things as well. */
      var rode=[];
      ROOM_STORES.forEach(function(r){
        var incoming=parsed&&parsed[r.id];
        if(!incoming)return;
        try{
          var api=Hub.api(r.id);
          if(api&&typeof api.applyState==='function'
            &&api.applyState(incoming)!==false)rode.push(r.what);
        }catch(err2){toast('The '+r.id+' data in that file could not be read \u2014 '
          +err2.message,{duration:9000});}
      });
      var up=upgrade(parsed);
      var inProjects=up.projects||{},inCalls=up.calls||{},inBones=up.backbones||[];
      var ids=Object.keys(inProjects).filter(function(id){return id!==INBOX_ID;});
      if(!ids.length){
        toast(rode.length?'Imported '+andList(rode)+' \u2014 no projects in that file.'
                         :'No projects in that file.');
        input.value='';return;
      }
      var n=ids.length;
      /* Asked once, and only where there is something to overwrite: into
         an empty journal an import is just a load. The old flow asked and
         then made you dismiss a second box to be told it had worked — so
         the report is a toast now, which is what this app reports on. */
      var merge=function(){
        var remap={};
        Object.keys(inCalls).forEach(function(id){
          var inc=inCalls[id];
          var match=inc.name&&!inc.solo&&Object.values(calls).find(function(c){
            return !c.solo&&c.name===inc.name;});
          if(match){
            remap[id]=match.id;
            /* Imported wins on the call's own fields, and its rows are
               merged by id so a row edited on both sides is not doubled. */
            match.title=inc.title||match.title;
            match.color=inc.color||match.color;
            if((inc.markers||[]).length)match.markers=inc.markers;
            if((inc.links||[]).length)match.links=inc.links;
            (inc.rows||[]).forEach(function(r){
              var ex=findRow(match,r.id);
              if(ex){ex.name=r.name;ex.color=r.color;ex.notes=r.notes;}
              else rowsOf(match).push(r);
            });
          } else {
            remap[id]=id;
            calls[id]=inc;
          }
        });
        ids.forEach(function(id){
          var pr=inProjects[id];
          pr.callId=remap[pr.callId]||pr.callId;
          projects[id]=pr;
        });
        /* Backbones merge by name, the way calls do and for the same
           reason: they are a thing somebody named, so two files calling one
           "ITEA new year" mean the same shelf. Imported wins on a name that
           exists on both sides; a name that does not is added. */
        inBones.forEach(function(bb){
          if(!bb||!bb.name)return;
          var k=bb.name.trim().toLowerCase();
          var ex=backbones.filter(function(x){
            return (x.name||'').trim().toLowerCase()===k;})[0];
          if(ex){ex.anchor=bb.anchor||ex.anchor;ex.markers=bb.markers||[];
            ex.todos=bb.todos||[];ex.edited=bb.edited||nowIso();}
          else backbones.push(bb);
        });
        /* The inbox is never replaced — its todos are appended, because two
           journals both have one and neither is more correct. */
        var inInbox=inProjects[INBOX_ID];
        if(inInbox&&inInbox.todos&&inInbox.todos.length){
          var box=ensureInbox();
          inInbox.todos.forEach(function(t){
            if(!(box.todos||[]).some(function(x){return x.id===t.id;}))box.todos.push(t);
          });
        }
        adoptIncoming({persist:true});
        var parts=[];
        if(n)parts.push(n+' project'+(n===1?'':'s'));
        parts=parts.concat(rode);
        toast('Imported '+andList(parts));
      };
      if(Object.keys(projects).length>1){
        var what=n+' project'+(n===1?'':'s');
        Dialog.ask({title:'Import',
          body:what+' will be merged into this journal. '
            +'Where one appears in both, the imported one wins.',
          confirm:'Import',danger:false},merge);
      } else merge();
    }catch(err){toast('Could not read that file \u2014 '+err.message,{duration:9000});}
    input.value='';
  };
  reader.readAsText(file);
}

/* ══ RESTORE POINTS ═════════════════════════════════════════════════
   Three things replace the journal wholesale: a cloud download, an import,
   and a restore. Each of them keeps a copy of what was here first, and the
   copy is a `fullBlob()` — the same object Export writes to a file — so
   putting one back is a road that already exists rather than a second one
   that can rot apart from it.

   Three of them, and no more. A journal of Mark's runs to about 400 KB;
   `localStorage` is five megabytes for the whole of `file://`, shared with
   the live journal and the other three rooms' stores, and a ring that grew
   until it fell over would take the app's own save down with it. So the
   live save always happens first, and the ring gives up its oldest — and
   in the end the whole ring — rather than be the reason a real change
   could not be written. Depth belongs in the cloud history, where there is
   room for it; this half is for the last few minutes and for the times the
   cloud is exactly what you cannot reach. */
var Snapshots=(function(){
  var KEY='pj-restore-v1',KEEP=3;
  function read(){
    try{var r=localStorage.getItem(KEY);var a=r?JSON.parse(r):[];
      return Array.isArray(a)?a:[];}catch(e){return [];}
  }
  function write(list){
    while(list.length){
      try{localStorage.setItem(KEY,JSON.stringify(list));return true;}
      catch(e){list.pop();}    /* out of room: the oldest goes, then the next */
    }
    try{localStorage.removeItem(KEY);}catch(e){}
    return false;
  }
  /* `blob` is what to keep. Passing none keeps what is on screen now, which
     is what "before this is replaced" means at every call site.

     `key` names a copy that can arrive more than once — the cloud's, by
     its own `updated_at` — and a copy already kept under it is not kept
     again. Without it every open of the app spent a slot on the same
     unchanged cloud copy, and three opens were enough to push out the one
     restore point that held what a download had just replaced. */
  function take(why,blob,key){
    var b=blob||fullBlob();
    var list=read();
    if(key&&list.some(function(s){return s.key===key;}))return;
    list.unshift({at:nowIso(),why:why,n:projectCount(projectsIn(b)),blob:b,key:key||undefined});
    write(list.slice(0,KEEP));
    render();
  }
  /* Putting a copy back is the cloud download's road walked from disk: the
     journal is replaced rather than merged, and each room's store is handed
     over whole. A merge would be wrong here — the whole point of a restore
     point is that it is what you had, not a mixture of it and what went
     wrong afterwards. */
  function apply(b){
    ROOM_STORES.forEach(function(r){
      var incoming=b&&b[r.id];
      if(!incoming)return;
      try{
        var api=Hub.api(r.id);
        if(api&&typeof api.applyState==='function')api.applyState(incoming);
      }catch(e){toast('The '+r.id+' data in that copy could not be read — '+e.message,
        {duration:9000});}
    });
    applyJournal(upgrade(b));
    adoptIncoming({persist:true});
  }
  function restore(i){
    var list=read(),s=list[i];
    if(!s||!s.blob){toast('That restore point is no longer here.');return;}
    Dialog.ask({title:'Restore this copy?',
      body:'Everything in the app goes back to the copy from '+whenWords(s.at)
        +' — '+s.n+' project'+(s.n===1?'':'s')+'.\n\n'
        +'What is here now becomes a restore point of its own first, so this '
        +'can be undone the same way. The restored copy is uploaded to the cloud '
        +'like any other change.',
      confirm:'Restore',danger:false},function(){
      take('before restoring the copy from '+whenWords(s.at));
      apply(s.blob);
      toast('Restored the copy from '+whenWords(s.at)+'.',{duration:7000});
    });
  }
  function render(){
    var host=byId('cloud-restore-list');
    if(!host)return;
    var list=read();
    if(!list.length){
      host.innerHTML='<div class="cloud-empty">No restore points yet. One is kept every '
        +'time the app reads the cloud, and before anything replaces what is here.</div>';
      return;
    }
    host.innerHTML=list.map(function(s,i){
      return '<div class="cloud-rp">'
        +'<div class="cloud-rp-say"><b>'+esc(whenWords(s.at))+'</b>'
          +'<span>'+esc(s.n+' project'+(s.n===1?'':'s')+' — '+(s.why||''))+'</span></div>'
        +'<button type="button" class="btn btn-sm" onclick="PL.restorePoint('+i+')">Restore</button>'
        +'</div>';
    }).join('');
  }
  return {take:take,restore:restore,render:render,apply:apply};
})();

/* The cloud half of the same list. It is drawn only when the panel is
   opened, because it costs a request. */
function cloudHistoryRefresh(){
  var host=byId('cloud-history-list');
  if(!host)return;
  if(!Cloud.connected()){
    host.innerHTML='<div class="cloud-empty">'+(Cloud.configured()
      ?'Log in to see the versions in the cloud.':'Not connected to the cloud.')+'</div>';return;
  }
  host.innerHTML='<div class="cloud-empty">Reading…</div>';
  History.list(Cloud.client(),'main',function(rows,err){
    if(err){
      host.innerHTML='<div class="cloud-empty">No history yet — '+esc(err)
        +'. Set up the table below and it fills itself from your next change.</div>';
      return;
    }
    if(!rows||!rows.length){
      host.innerHTML='<div class="cloud-empty">The table is there and empty. '
        +'Your next change to the journal writes the first version into it.</div>';
      return;
    }
    /* The id is a bigserial, so it goes into the handler as a bare number;
       anything else is a row this build does not understand and is left
       out rather than written into an attribute unescaped. */
    host.innerHTML=rows.filter(function(r){return isFinite(Number(r.id));}).map(function(r){
      return '<div class="cloud-rp">'
        +'<div class="cloud-rp-say"><b>'+esc(whenWords(r.saved_at))+'</b>'
          +'<span>'+esc((r.n==null?'?':r.n)+' project'+(r.n===1?'':'s')+' — uploaded')+'</span>'
        +'</div>'
        +'<button type="button" class="btn btn-sm" onclick="PL.restoreCloudVersion('
          +Number(r.id)+')">Restore</button>'
        +'</div>';
    }).join('');
  });
}
function cloudHistoryRestore(id){
  if(!Cloud.connected())return;
  History.fetch(Cloud.client(),id,function(row,err){
    if(err||!row||!row.data){toast('Could not read that version — '+(err||'it is empty'),
      {duration:9000});return;}
    Dialog.ask({title:'Restore this version?',
      body:'Everything in the app goes back to the version uploaded '+whenWords(row.saved_at)
        +' — '+(row.n==null?'an unknown number of':row.n)+' projects.\n\n'
        +'What is here now becomes a restore point first, and the restored copy is '
        +'uploaded like any other change, so the other machine takes it too.',
      confirm:'Restore',danger:false},function(){
      Snapshots.take('before restoring the cloud version from '+whenWords(row.saved_at));
      Snapshots.apply(row.data);
      toast('Restored the version uploaded '+whenWords(row.saved_at)+'.',{duration:7000});
    });
  });
}

/* ══ THE NOTE STRIP ═════════════════════════════════════════
   One component with three homes. A row owns an ordered list of notes;
   the strip shows them as tabs, one open at a time, with a panel that
   balloons open between the rows.

   A tab and a body — that is the whole of it. The panel used to come in
   two shapes: a bare one in the tracker, and, in the call table and the
   dossier, one wearing a header bar with the note's name, its timestamp,
   three format buttons and a live word count. The bar is gone and the
   bare panel is the only shape. Nothing was lost with it: the tab names
   the note and carries its dates in its tooltip, renaming is on the tab,
   and bold, italic and bullets are on the keyboard.

   What still differs between the homes is clothes — which prefix the
   classes take, whether a tab carries a content dot — so that is an
   adapter, and the behaviour is written once.

   The adapter supplies:
     notes       the array
     openId      which note is open on this row, or ''
     justOpened  the note that was JUST opened (one-shot animation)
     focusId     the note the caret should land in (one-shot)
     renamingId  the note showing an inline rename box, or ''
     label(n) / body(n)               how to read a note
     call(name,...)                   builds an inline handler string
     dot         tabs carry a filled/hollow content dot
     rte         class for the editable body; defaults to 'note-rte'
*/
var Notes=(function(){

  /* Every element of a strip takes the same base class in all three homes.
     What differs is size and colour, and that is a delta rule scoped by
     the row the strip sits in (.ci-row, .pi-row, #ct-view) — so this
     builder no longer asks which home it is in. */

  /* With no header on the panel, the tab is where a note is read without
     opening it: what it is called, when it was last touched, how it
     starts, and — for anyone reconciling against a deadline — the actual
     dates it was created and edited. */
  function tabTitle(a,n){
    var body=a.body(n);
    var when=fmtRel(n.edited||n.created);
    var head=esc(a.label(n)||'Note');
    if(when)head+=' \u2014 '+esc(when);
    if(isBlank(body))head+=' \u2014 empty';
    var lines=[head];
    var prev=preview(body,90);
    if(prev)lines.push(esc(prev));
    if(n.created)lines.push('Created '+esc(fmtAbs(n.created)));
    if(n.edited&&n.edited!==n.created)lines.push('Edited '+esc(fmtAbs(n.edited)));
    lines.push('Drag to reorder \u2014 double-click or F2 to rename');
    return lines.join('\n');
  }

  function tabHTML(a,n){
    var empty=isBlank(a.body(n));
    var isOpen=a.openId===n.id;
    /* A rename box replaces its tab in place, so it wears the tab's own
       shape and open state. */
    if(a.renamingId===n.id){
      return '<input type="text" class="note-tab note-rename-input'+(isOpen?' open':'')+'" '
        +'data-rename="1" value="'+esc(a.label(n))+'" placeholder="Name this note\u2026" '
        +'onclick="event.stopPropagation()" '
        +'onblur="'+a.call('rename',n.id,'this.value')+'" '
        +'onkeydown="if(event.key===\'Enter\'||event.key===\'Escape\'){this.blur();}" />';
    }
    var cls='note-tab'+(empty?'':' has-content')+(isOpen?' open':'')
      +(isOpen&&a.justOpened===n.id?' just-opened':'');
    return '<span class="'+cls+'" role="button" tabindex="0" '
      +'data-note-tab="1" data-note-id="'+esc(n.id)+'" '
      +'onclick="'+a.call('toggle',n.id,'event')+'" '
      +'ondblclick="'+a.call('startRename',n.id,'event')+'" '
      +'onkeydown="'+a.call('tabKey',n.id,'event')+'" '
      +'title="'+tabTitle(a,n)+'">'
      +(a.dot?'<span class="note-dot"></span>':'')
      +(a.dot?'<span class="note-lbl">'+esc(a.label(n)||'Note')+'</span>'
             :esc(a.label(n)||'Note'))
      +'</span>';
  }

  /* The panel has no toolbar, so the chords are named on the control that
     starts a note. All four homes get them. */
  function addHTML(a){
    var mk=modKey();
    return '<button type="button" class="note-add" '
      +'onclick="'+a.call('add',null,'event')+'" '
      +'title="Add a note to this row\n'
        +esc(mk+'B')+' bold \u00b7 '+esc(mk+'I')+' italic \u00b7 '
        +esc(mk+'\u21e78')+' bullets \u00b7 '+esc(mk+'\u21e77')+' numbers">+</button>';
  }

  function delHTML(a,n){
    return '<button type="button" class="note-del" title="Delete this note" '
      +'onclick="'+a.call('del',n.id,'event')+'">\u2715</button>';
  }

  /* One panel, one shape: the body, and a delete in its corner. */
  function panelHTML(a){
    var n=(a.notes||[]).find(function(x){return x.id===a.openId;});
    if(!n)return '';
    return '<div class="note-panel'+(a.justOpened===n.id?' just-opened':'')+'" '
      +(a.focusId===n.id?'data-note-focus="1" ':'')
      +'onclick="event.stopPropagation()">'
      +delHTML(a,n)
      +'<div class="'+(a.rte||'note-rte')+'" contenteditable="true" '
        +'data-note-host="'+esc(a.hostId)+'" data-note-id="'+esc(n.id)+'" '
        +'oninput="'+a.call('input','this')+'" onpaste="'+a.call('paste','this','event')+'" '
        +'onblur="'+a.call('blur','this')+'" onclick="PL.openRichLink(event)" '
        +'onkeydown="'+a.call('key','this','event')+'">'+toEditableHTML(a.body(n))+'</div>'
    +'</div>';
  }

  /* Tabs are both buttons and drag handles. Scope each drag to its own
     strip so notes can be reordered within a row, never moved to another. */
  function bindDrag(root,onDrop){
    qa('[data-note-tab="1"]',root).forEach(function(tab){
      var strip=tab.parentElement;if(!strip)return;
      Drag.handle(tab,tab,'[data-note-tab="1"]',
        function(el){return el.getAttribute('data-note-id');},
        function(srcId,tgtId){onDrop(srcId,tgtId,tab);},
        {grabsPointerDown:false,suppressClick:true,scope:strip});
    });
  }

  function strip(a){
    var notes=a.notes||[];
    return {
      tabs:notes.map(function(n){return tabHTML(a,n);}).join('')+addHTML(a),
      panel:panelHTML(a),
      count:notes.length,
      filled:notes.filter(function(n){return !isBlank(a.body(n));}).length
    };
  }

  /* One click should leave you writing. The renderer marks the panel the
     caret is owed — the note just opened, or the one just named — and this
     puts it there, once. Any later render finds no mark and takes no
     focus, so typing in a row title beside an open note is undisturbed. */
  function focusAfterRender(root){
    root=root||document;
    /* A rename box wins: it is what you were sent there to fill in. */
    var ren=q('[data-rename="1"]',root);
    if(ren){
      if(document.activeElement!==ren){ren.focus();ren.select();}
      return;
    }
    var panel=q('.note-panel[data-note-focus="1"]',root);
    var body=panel&&q('[data-note-host]',panel);
    /* Never chase a body on a face that is turned away or a mode that has
       hidden the panel — focusing it would scroll the page to nothing. */
    if(!body||body.offsetParent===null)return;
    if(document.activeElement===body)return;
    try{body.focus({preventScroll:true});}catch(e){body.focus();}
    caretToEnd(body);
  }
  function caretToEnd(el){
    try{
      var r=document.createRange();r.selectNodeContents(el);r.collapse(false);
      var sel=window.getSelection();sel.removeAllRanges();sel.addRange(r);
    }catch(e){}
  }

  /* Live edit: update the tab's dot and the row's counter in place. A full
     re-render here would destroy the contenteditable mid-keystroke. */
  function pokeAfterEdit(note,rowEl,notes,bodyOf){
    if(!rowEl)return;
    var tab=rowEl.querySelector('[data-note-id="'+cssEsc(note.id)+'"]');
    if(tab)tab.classList.toggle('has-content',!isBlank(bodyOf(note)));
    var cnt=rowEl.querySelector('[data-rt-count]');
    if(cnt&&notes.length){
      var filled=notes.filter(function(x){return !isBlank(bodyOf(x));}).length;
      cnt.textContent=filled+'/'+notes.length;
      cnt.title=filled+' of '+notes.length+' notes have content';
    }
  }

  return {strip:strip,bindDrag:bindDrag,
    pokeAfterEdit:pokeAfterEdit,focusAfterRender:focusAfterRender};
})();

/* ══ THE CALENDAR ═══════════════════════════════════════════════════
   Native pickers cannot be styled or marked, and on iPadOS a type="date"
   input opens Safari's own wheel on tap regardless of readonly — over the
   top of anything. So every date field here is plain text and this is the
   picker. Today is always ringed; the field's own date always gets an
   arrow; both show together when they coincide. */
var DatePicker=(function(){
  var st={input:null,pop:null,y:0,m:0,onOutside:null,onKey:null};

  function iso(y,m,d){return y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');}

  function open(inputEl){
    close();
    /* Blur immediately so no software keyboard comes up either. */
    if(inputEl.blur)inputEl.blur();
    var today=new Date();today.setHours(0,0,0,0);
    var cur=isIsoDate(inputEl.value)?new Date(inputEl.value+'T00:00:00'):null;
    st.input=inputEl;
    st.y=(cur||today).getFullYear();
    st.m=(cur||today).getMonth();
    var pop=document.createElement('div');
    pop.className='dp-popup';
    pop.onclick=function(e){e.stopPropagation();};
    document.body.appendChild(pop);
    st.pop=pop;
    render();
    /* Where `fixed` actually starts from — the same correction the popover
       makes, for the same reason, and it was missing here. Every pane
       carries a transform, which makes it the containing block for a
       fixed child, so these window coordinates were being read against the
       pane's CONTENT and the calendar drew exactly one scroll offset too
       high. At the top of a room that is nothing; part-way down a long day
       it put the calendar four hundred pixels above the window, where the
       date could be tapped and nothing appeared to happen.

       Park the box at 0,0, read where that landed, take the difference
       off. It is zero when nothing up the tree is transformed. */
    pop.style.left='0px';pop.style.top='0px';
    var org=pop.getBoundingClientRect();
    var r=inputEl.getBoundingClientRect();
    var ph=pop.offsetHeight||300;
    var top=(r.bottom+6<=window.innerHeight-ph)?r.bottom+6:Math.max(6,r.top-ph-6);
    var left=Math.min(Math.max(6,r.left),window.innerWidth-pop.offsetWidth-6);
    pop.style.top=(top-org.top)+'px';pop.style.left=(left-org.left)+'px';
    st.onOutside=function(e){if(st.pop&&!st.pop.contains(e.target)&&e.target!==inputEl)close();};
    /* Capture-phase and stopping there, for the same reason as the popover:
       one Escape must dismiss one thing. */
    st.onKey=function(e){
      if(e.key!=='Escape')return;
      e.stopPropagation();
      close();
    };
    setTimeout(function(){
      document.addEventListener('mousedown',st.onOutside);
      document.addEventListener('touchstart',st.onOutside);
    },0);
    document.addEventListener('keydown',st.onKey,true);
  }
  function close(){
    if(st.pop&&st.pop.parentNode)st.pop.parentNode.removeChild(st.pop);
    if(st.onOutside){
      document.removeEventListener('mousedown',st.onOutside);
      document.removeEventListener('touchstart',st.onOutside);
    }
    if(st.onKey)document.removeEventListener('keydown',st.onKey,true);
    st.input=null;st.pop=null;st.onOutside=null;st.onKey=null;
  }
  function isOpen(){return !!st.pop;}
  function nav(delta){
    st.m+=delta;
    if(st.m<0){st.m=11;st.y--;}
    if(st.m>11){st.m=0;st.y++;}
    render();
  }
  function render(){
    if(!st.pop||!st.input)return;
    var y=st.y,m=st.m;
    var today=new Date();today.setHours(0,0,0,0);
    var todayIso=iso(today.getFullYear(),today.getMonth(),today.getDate());
    var selIso=isIsoDate(st.input.value)?st.input.value:null;
    var first=new Date(y,m,1);
    var startOffset=(first.getDay()+6)%7;         // weeks start Monday
    var inMonth=new Date(y,m+1,0).getDate();
    var inPrev=new Date(y,m,0).getDate();
    var cells=[];
    for(var i=0;i<startOffset;i++)
      cells.push({y:m===0?y-1:y,m:(m+11)%12,d:inPrev-startOffset+1+i,other:true});
    for(var d=1;d<=inMonth;d++)cells.push({y:y,m:m,d:d,other:false});
    while(cells.length<42){
      var nd=cells.length-(startOffset+inMonth)+1;
      cells.push({y:m===11?y+1:y,m:(m+1)%12,d:nd,other:true});
    }
    st.pop.innerHTML=
      '<div class="dp-hdr"><button type="button" class="dp-nav" onclick="PL.dpNav(-1)">\u2039</button>'
      +'<span class="dp-title">'+MONTHS[m]+' '+y+'</span>'
      +'<button type="button" class="dp-nav" onclick="PL.dpNav(1)">\u203a</button></div>'
      +'<div class="dp-wk">'+['Mo','Tu','We','Th','Fr','Sa','Su'].map(function(w){
        return '<span>'+w+'</span>';}).join('')+'</div>'
      +'<div class="dp-grid">'+cells.map(function(c){
        var ci=iso(c.y,c.m,c.d);
        var isToday=ci===todayIso,isSel=selIso&&ci===selIso;
        return '<button type="button" class="dp-cell'+(c.other?' dp-other':'')
          +(isToday?' dp-today':'')+(isSel?' dp-selected':'')+'" '
          +'onclick="PL.dpSelect('+c.y+','+c.m+','+c.d+')">'
          +(isSel?'<span class="dp-arrow">\u25be</span>':'')
          +'<span class="dp-daynum">'+c.d+'</span></button>';
      }).join('')+'</div>'
      +'<div class="dp-foot"><button type="button" class="dp-today-btn" '
        +'onclick="PL.dpSelect('+today.getFullYear()+','+today.getMonth()+','+today.getDate()+')">Today</button></div>';
  }
  function select(y,m,d){
    var input=st.input;if(!input)return;
    input.value=iso(y,m,d);
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
    close();
  }
  return {open:open,close:close,isOpen:isOpen,nav:nav,select:select};
})();

/* ══ FORM EDITORS ═══════════════════════════════════════════════════
   The four little list editors the new-project and edit forms share:
   key dates, named links, positions and partners. Each is a context-keyed
   scratch array that the form collects from on save. */
var Editors=(function(){
  var markers={em:[],np:[],ce:[]};
  var markerList={em:'em-markers-list',np:'np-markers-list',ce:'ce-markers-list'};
  var links={npc:[],npp:[],emp:[],ce:[]};
  var linkList={npc:'npc-links-list',npp:'npp-links-list',emp:'emp-links-list',ce:'ce-links-list'};
  var posItems={'new':[],edit:[]};
  var partners={'new':[],edit:[]};
  var piGroups={'new':[],edit:[]};
  var piList={'new':'np-res-list',edit:'em-res-list'};
  var posList={'new':'np-pos-list',edit:'em-pos-list'};
  /* The Researchers field each position editor draws its name suggestions
     from. Same two panes, keyed the way the editors already are. */
  var descField={'new':'np-desc',edit:'em-desc'};
  var partnerList={'new':'np-partner-list',edit:'em-partner-list'};

  /* ── Key dates ── */
  function markerInit(ctx,list){
    markers[ctx]=(list||[]).map(function(m){
      return {id:m.id||mkId(),name:m.name||'',date:m.date||'',endDate:m.endDate||'',
        isRange:!!m.endDate,color:m.color||'deadline'};
    });
    drawMarkers(ctx);
  }
  function markerAdd(ctx){
    markers[ctx].push({id:mkId(),name:'',date:'',endDate:'',isRange:false,color:'deadline'});
    drawMarkers(ctx);
  }
  function markerField(ctx,i,field,val){
    var l=markers[ctx];if(!l[i])return;
    l[i][field]=val;
    if(field==='isRange'){if(!val)l[i].endDate='';drawMarkers(ctx);}
    else if(field==='color')drawMarkers(ctx);
  }
  function markerRemove(ctx,i){markers[ctx].splice(i,1);drawMarkers(ctx);}
  function markerCollect(ctx){
    return markers[ctx].filter(function(m){return m.date;}).map(function(m){
      return {id:m.id,name:m.name.trim()||'Marker',date:m.date,
        endDate:(m.isRange?(m.endDate||''):''),kind:'custom',hard:true,
        color:m.color||'deadline'};
    });
  }
  function drawMarkers(ctx){
    var el=byId(markerList[ctx]);if(!el)return;
    var l=markers[ctx];
    /* Nothing where there is nothing. A line saying the list is empty,
       directly above a button saying "+ Add key date", is a sentence
       explaining the button under it — and three of those, on the three
       list editors a new call carries, are most of the reason the form
       stopped fitting on a laptop. */
    if(!l.length){el.innerHTML='';return;}
    el.innerHTML=l.map(function(m,i){
      function dateInp(field,val,title){
        return '<input type="text" inputmode="none" data-datefield readonly class="editor-inp" '
          +'style="flex:0 0 140px" placeholder="Pick a day" value="'+esc(val)+'"'
          +(title?' title="'+title+'"':'')
          +' onclick="PL.openDatePicker(this)" onchange="PL.markerField(\''+ctx+'\','+i+',\''+field+'\',this.value)" />';
      }
      var dates=m.isRange
        ? dateInp('date',m.date,'Start')
          +'<span style="color:var(--text3);font-size:11px">\u2192</span>'
          +dateInp('endDate',m.endDate,'End')
        : dateInp('date',m.date,'');
      var swatches='<div class="marker-swatches" title="Key date type">'
        +MK_TYPES.map(function(c){
          var sel=(c===m.color);
          return '<button type="button" class="marker-swatch" title="'+MK_LABELS[c]+'" '
            +'style="background:'+MK_HEX[c]+';border-color:'+(sel?'#fff':'transparent')
            +';box-shadow:'+(sel?'0 0 0 1px '+MK_HEX[c]:'none')+'" '
            +'onclick="PL.markerField(\''+ctx+'\','+i+',\'color\',\''+c+'\')"></button>';
        }).join('')+'</div>';
      return '<div class="marker-row">'
        +'<input type="text" class="editor-inp" style="flex:2;min-width:160px" '
          +'placeholder="Key date name (e.g. Deadline FPP)" value="'+esc(m.name)+'" '
          +'onchange="PL.markerField(\''+ctx+'\','+i+',\'name\',this.value)" />'
        +dates+swatches
        +'<label class="marker-range" title="Treat as a date range instead of a single day">'
          +'<input type="checkbox" '+(m.isRange?'checked':'')+' '
          +'onchange="PL.markerField(\''+ctx+'\','+i+',\'isRange\',this.checked)" /> Range</label>'
        +'<button type="button" class="editor-del" style="margin-left:auto" title="Remove key date" '
          +'onclick="PL.markerRemove(\''+ctx+'\','+i+')">\u2715</button>'
      +'</div>';
    }).join('');
  }

  /* ── Named links ── */
  function linkInit(ctx,list){
    links[ctx]=(list||[]).map(function(l){
      return {id:l.id||mkId(),name:l.name||'',url:l.url||''};});
    drawLinks(ctx);
  }
  function linkAdd(ctx){links[ctx].push({id:mkId(),name:'',url:''});drawLinks(ctx);}
  function linkField(ctx,i,field,val){var l=links[ctx];if(l[i])l[i][field]=val;}
  function linkRemove(ctx,i){links[ctx].splice(i,1);drawLinks(ctx);}
  function linkCollect(ctx){
    return (links[ctx]||[]).filter(function(l){return l.url&&l.url.trim();})
      .map(function(l){return {id:l.id,name:(l.name||'').trim()||'Link',url:l.url.trim()};});
  }
  function drawLinks(ctx){
    var el=byId(linkList[ctx]);if(!el)return;
    var l=links[ctx];
    if(!l.length){el.innerHTML='';return;}
    el.innerHTML=l.map(function(x,i){
      return '<div class="editor-row">'
        +'<input type="text" class="editor-inp" style="flex:1;min-width:110px" placeholder="Label" '
          +'value="'+esc(x.name)+'" onchange="PL.linkField(\''+ctx+'\','+i+',\'name\',this.value)" />'
        +'<input type="url" class="editor-inp" style="flex:2;min-width:150px" placeholder="https://\u2026" '
          +'value="'+esc(x.url)+'" onchange="PL.linkField(\''+ctx+'\','+i+',\'url\',this.value)" />'
        +'<button type="button" class="editor-del" title="Remove link" '
          +'onclick="PL.linkRemove(\''+ctx+'\','+i+')">\u2715</button>'
      +'</div>';
    }).join('');
  }
  function linksDisplayHTML(list,cls){
    var ls=(list||[]).filter(function(l){return l.url;});
    if(!ls.length)return '';
    return '<div class="'+(cls||'named-links')+'">'+ls.map(function(l){
      return '<a href="'+esc(safeUrl(l.url))+'" target="_blank" '
        +'onclick="event.stopPropagation()" class="named-link">'+esc(l.name||'Link')+' \u2197</a>';
    }).join('')+'</div>';
  }

  /* ── Researchers, and the groups the PIs among them lead ──
     A named person is a researcher; an unnamed post is a position. That is
     the whole of the pane's shape, and it is what took the same person out
     of two doors: a tenured position with a name typed into it and a name
     typed into the Researchers line were the same fact written twice, and
     the pane had to keep them in step.

     So a researcher is a tenured position, and the list at the top of the
     pane is those. A row is a name, a PI tick, and where they sit. Ticking
     PI makes a group — that person leads it and the label is typed on the
     same row; unticking takes the group away again and its posts fall to
     the first group, which is where the card would draw them anyway.

     Person-months are NOT on these rows. They are money, and money is
     entered in the section below where it is totalled, one line per person
     and per post. Who and where up here; what it costs down there. */
  function piInit(ctx,list){
    piGroups[ctx]=(list||[]).map(function(g){return {id:g.id||uid(),short:g.short||''};});
  }
  function piCollect(ctx){
    return piGroups[ctx].filter(function(g){return (g.short||'').trim();})
      .map(function(g){return {id:g.id,short:(g.short||'').trim()};});
  }
  function piPosOf(ctx,gid){
    return posItems[ctx].find(function(x){
      return x.type==='tenured'&&x.pi&&(x.groupId||'')===gid;});
  }
  function researchers(ctx){
    return posItems[ctx].filter(function(x){return x.type==='tenured';});
  }
  function resAdd(ctx){
    var first=piGroups[ctx][0];
    posItems[ctx].push({id:uid(),type:'tenured',name:'',py:'',fte:'',count:'',
      groupId:first?first.id:'',pi:false,pm:''});
    drawTeam(ctx);
  }
  function resRemove(ctx,id){
    var item=posItems[ctx].find(function(x){return x.id===id;});
    if(item&&item.pi)dropGroup(ctx,item.groupId||'');
    posItems[ctx]=posItems[ctx].filter(function(x){return x.id!==id;});
    drawTeam(ctx);
  }
  /* A group only exists because somebody leads it, so it goes when they
     stop. Everything that pointed at it is set adrift rather than deleted:
     the card puts anything with no valid group into the first one, and the
     pane lists it there too, so nothing disappears while it is being
     sorted out. */
  function dropGroup(ctx,gid){
    piGroups[ctx]=piGroups[ctx].filter(function(g){return g.id!==gid;});
    var first=piGroups[ctx][0];
    posItems[ctx].forEach(function(x){
      if((x.groupId||'')===gid)x.groupId=first?first.id:'';
    });
  }
  function resPI(ctx,id,on){
    var item=posItems[ctx].find(function(x){return x.id===id;});
    if(!item)return;
    if(on){
      var g={id:uid(),short:''};
      piGroups[ctx].push(g);
      item.pi=true;item.groupId=g.id;
    } else {
      var was=item.groupId||'';
      item.pi=false;
      dropGroup(ctx,was);
      var first=piGroups[ctx][0];
      item.groupId=first?first.id:'';
    }
    drawTeam(ctx);
  }
  /* The label of the group this researcher leads. The blocks below print
     it, so they follow — the researcher list does NOT, or the field would
     be torn out from under the caret on every keystroke. */
  /* A ticked PI does not always have a group behind them. `posInit` ticks
     the first tenured person in a group that has no flag yet, so the pane
     opens saying what the card already says — and on a project with no
     groups at all that leader's `groupId` names nothing. The label box was
     drawn for them all the same, and every keystroke went into a group
     that was never found: ticking PI, typing a group and saving lost the
     group every time. So the group is made here, at the first keystroke,
     and everything that shared the leader's old id comes with them, which
     is where the card draws it anyway. The label starts as what was
     typed, so `piCollect` writes it out; an untouched form still makes
     nothing. */
  function resGroup(ctx,id,val){
    var item=posItems[ctx].find(function(x){return x.id===id;});
    if(!item)return;
    var g=piGroups[ctx].find(function(x){return x.id===(item.groupId||'');});
    if(!g){
      var was=item.groupId||'';
      g={id:uid(),short:''};
      piGroups[ctx].push(g);
      posItems[ctx].forEach(function(x){
        if((x.groupId||'')===was)x.groupId=g.id;
      });
      item.groupId=g.id;
    }
    g.short=val;
    drawBlocks(ctx);
  }
  function resIn(ctx,id,gid){
    var item=posItems[ctx].find(function(x){return x.id===id;});
    if(!item)return;
    item.groupId=gid;
    drawTeam(ctx);
  }
  /* Person-months, added up the way the card adds them: blank is not zero,
     so a group nobody has costed says nothing rather than claiming 0. */
  function pmSum(list){
    var any=false,n=0;
    (list||[]).forEach(function(x){
      var v=parseFloat(x.pm);
      if(isNaN(v))return;
      any=true;n+=v;
    });
    return any?Math.round(n*100)/100:null;
  }
  function pmIn(ctx,gid){
    return pmSum(posItems[ctx].filter(function(x){return (x.groupId||'')===gid;}));
  }

  /* ── The researcher list ── */
  function drawRes(ctx){
    var el=byId(piList[ctx]);if(!el)return;
    var gs=piGroups[ctx],list=researchers(ctx);
    var html='<datalist id="posnames-'+ctx+'"></datalist>';
    if(!list.length)html+='<div class="editor-none">Nobody on it yet.</div>';
    list.forEach(function(item){
      var g=gs.find(function(x){return x.id===(item.groupId||'');});
      var where;
      if(item.pi){
        where='<span class="pie-label">Group</span>'
          +'<input type="text" class="pie-input pie-input-tag" maxlength="8" '
            +'value="'+esc(g?g.short:'')+'" placeholder="AC" aria-label="Group label" '
            +'oninput="PL.resGroup(\'' + ctx + '\',\''+item.id+'\',this.value)" />';
      } else if(gs.length){
        /* Where they sit, answered once and here. Only asked when there is
           more than one group; with one there is no question. */
        where=gs.length>1
          ?'<span class="pie-label pie-label-dim">in</span>'
            +'<select class="pie-input pie-select" aria-label="Group" '
            +'onchange="PL.resIn(\'' + ctx + '\',\''+item.id+'\',this.value)">'
            +gs.map(function(x,i){
              var on=g?(x.id===g.id):(i===0);
              return '<option value="'+esc(x.id)+'"'+(on?' selected':'')+'>'
                +esc((x.short||'').trim()||'Group')+'</option>';}).join('')
            +'</select>'
          :'<span class="pie-label pie-label-dim">in '+esc((gs[0].short||'').trim()||'the group')+'</span>';
      } else where='';
      html+='<div class="res-item-edit'+(item.pi?' res-item-pi':'')+'">'
        +'<input type="text" class="pie-input pie-input-wide" list="posnames-'+ctx+'" '
          +'value="'+esc(item.name)+'" placeholder="Full name" autocomplete="off" '
          +'aria-label="Researcher" '
          +'oninput="PL.resName(\'' + ctx + '\',\''+item.id+'\',this.value)" />'
        +'<label class="pie-pi" title="Leads a group of their own">'
          +'<input type="checkbox"'+(item.pi?' checked':'')+' '
          +'onchange="PL.resPI(\'' + ctx + '\',\''+item.id+'\',this.checked)" /> PI</label>'
        +'<span class="res-where">'+where+'</span>'
        +'<button class="btn btn-xs btn-danger" '
          +'onclick="PL.resRemove(\'' + ctx + '\',\''+item.id+'\')">Remove</button>'
      +'</div>';
    });
    el.innerHTML=html;
    posNames(ctx);
  }

  /* ── One block per group ──
     Its head names the group and the PI who leads it and carries the
     group's running person-months. Under it, everybody in that group with
     what they cost: the PI, then the tenured staff filed there, then the
     posts still to hire — and the buttons that add another. A post added
     from inside a block belongs to it, so there is no group to choose and
     none to get wrong. */
  function drawBlocks(ctx){
    var el=byId(posList[ctx]);if(!el)return;
    var groups=piGroups[ctx];
    var ids=groups.map(function(g){return g.id;});
    function addRow(gid){
      return '<div class="team-add">'
        +['phd','engd','postdoc'].map(function(k){
          return '<button type="button" class="btn btn-xs" '
            +'onclick="PL.addPosItem(\'' + ctx + '\',\''+k+'\',\''+gid+'\')">+ '
            +posLabel(k)+'</button>';
        }).join('')
      +'</div>';
    }
    function bodyOf(gid){
      var pi=piPosOf(ctx,gid);
      var staff=posItems[ctx].filter(function(x){
        return (x.groupId||'')===gid&&x.type==='tenured'&&!x.pi;});
      var posts=posItems[ctx].filter(function(x){
        return (x.groupId||'')===gid&&x.type!=='tenured';});
      var rows=(pi?posRowHTML(ctx,pi):'')
        +staff.map(function(x){return posRowHTML(ctx,x);}).join('')
        +posts.map(function(x){return posRowHTML(ctx,x);}).join('');
      return '<div class="team-pos">'+rows+'</div>'+addRow(gid);
    }
    var html='';
    groups.forEach(function(g){
      var pi=piPosOf(ctx,g.id);
      html+='<div class="team-grp">'
        +'<div class="team-hd">'
          +'<span class="team-hd-tag">'+esc((g.short||'').trim()||'?')+'</span>'
          +'<span class="team-hd-who">'+esc((pi&&pi.name||'').trim()||'— name the PI above')+'</span>'
          +'<span class="pie-total" data-pm-group="'+esc(g.id)+'">'+totalText(ctx,g.id)+'</span>'
        +'</div>'
        +bodyOf(g.id)
      +'</div>';
    });
    /* Anything pointing at no group, or at one that has gone. The card
       draws these with its first PI; here they are shown where they
       actually are, so nothing goes missing. With no PIs at all this is
       the whole list. */
    var loose=posItems[ctx].filter(function(x){return ids.indexOf(x.groupId||'')<0;});
    if(loose.length||!groups.length){
      html+='<div class="team-grp team-grp-loose">'
        +(groups.length
          ?'<div class="team-loose-hd">Not in a group '
            +'<span class="lbl-hint">— the card puts these with the first PI</span></div>'
          :'')
        +'<div class="team-pos">'+loose.map(function(x){return posRowHTML(ctx,x);}).join('')+'</div>'
        +addRow('')
      +'</div>';
    }
    el.innerHTML=html;
  }
  /* The two lists are one thing seen twice, so they are drawn together. */
  /* The running totals are refreshed on every redraw and not only when a
     person-month is typed: the heading's grand total was blank until the
     first keystroke, on a pane that had opened with the figures already
     in it. */
  function drawTeam(ctx){drawRes(ctx);drawBlocks(ctx);drawTotals(ctx);}
  /* Only the numbers, so a total can follow a keystroke without the field
     being typed into losing its caret. */
  function totalText(ctx,gid){
    var pm=pmIn(ctx,gid);
    return pm===null?'<i>— PM</i>':'<b>'+pm+'</b> PM';
  }
  function drawTotals(ctx){
    qa('[data-pm-group]',byId(posList[ctx])).forEach(function(el){
      el.innerHTML=totalText(ctx,el.getAttribute('data-pm-group'));
    });
    var all=byId(posList[ctx]+'-all');
    if(all){
      var t=pmSum(posItems[ctx]);
      all.innerHTML=(t===null?'':'<b>'+t+'</b> PM in total');
    }
  }

  /* ── Positions ── */
  function posLabel(t){return {phd:'PhD',postdoc:'Postdoc',engd:'EngD'}[t]||'Tenured';}
  function posCls(t){return {phd:'pt-phd',postdoc:'pt-postdoc',engd:'pt-engd'}[t]||'pt-tenured';}
  /* What `desc` becomes: the researchers, in the order they are listed, so
     the search palette and anything else reading it go on working. */
  function resNames(ctx){
    return researchers(ctx).map(function(x){return (x.name||'').trim();})
      .filter(Boolean).join(', ');
  }
  /* A project written before the researcher list existed carries its
     people as free text. The first time it is opened they are offered as
     rows — unticked, ungrouped, ready to sort out — and written only if
     the form is saved. A project that already has tenured positions is
     left alone: its names are where they belong. */
  function seedFromDesc(ctx,desc){
    if(researchers(ctx).length)return;
    var first=piGroups[ctx][0];
    (desc||'').split(',').forEach(function(n){
      n=n.trim().replace(/\s+/g,' ');
      if(!n)return;
      posItems[ctx].push({id:uid(),type:'tenured',name:n,py:'',fte:'',count:'',
        groupId:first?first.id:'',pi:false,pm:''});
    });
  }
  function posInit(ctx,list){
    posItems[ctx]=(list||[]).map(function(x){return Object.assign({},x);});
    /* The card shows a group's FIRST tenured position as its PI when no
       flag has been set, because a group always has one. The form opens
       saying the same thing rather than listing that person twice — once
       as a PI and once as an ordinary tenured post. Nothing is written
       unless the form is actually saved. */
    var led={};
    posItems[ctx].forEach(function(x){if(x.pi&&x.type==='tenured')led[x.groupId||'']=1;});
    posItems[ctx].forEach(function(x){
      if(x.type!=='tenured'||!(x.name||'').trim())return;
      var g=x.groupId||'';
      if(led[g])return;
      x.pi=true;led[g]=1;
    });
    drawTeam(ctx);
  }
  /* A post is added UNDER a PI, from that PI's own block, so the group is
     answered by where you pressed rather than by a picker afterwards.
     `gid` is the group's id; with no groups at all it is empty and the
     post joins the plain run. */
  function posAdd(ctx,type,gid){
    posItems[ctx].push({id:uid(),type:type,name:'',py:'',fte:'',count:'',
      groupId:gid||'',pi:false,pm:''});
    drawBlocks(ctx);
  }
  /* Names already written on this project, offered to every position's
     name field: the Researchers line first, since that is where Mark
     writes them, then any name already given to a position. A native
     datalist rather than a menu of this app's own — the same choice the
     topic picker made, and for the same reason. */
  function posNames(ctx){
    var el=byId('posnames-'+ctx);
    if(!el)return;
    var seen={},out=[];
    function add(n){
      n=(n||'').trim().replace(/\s+/g,' ');
      if(!n||seen[n.toLowerCase()])return;
      seen[n.toLowerCase()]=1;out.push(n);
    }
    var d=byId(descField[ctx]);
    if(d)(d.value||'').split(',').forEach(add);
    posItems[ctx].forEach(function(x){add(x.name);});
    piGroups[ctx].forEach(function(g){var q=piPosOf(ctx,g.id);if(q)add(q.name);});
    el.innerHTML=out.map(function(n){return '<option value="'+esc(n)+'"></option>';}).join('');
  }
  function posRemove(ctx,id){
    posItems[ctx]=posItems[ctx].filter(function(x){return x.id!==id;});
    drawBlocks(ctx);
  }
  function posField(ctx,id,field,val){
    var item=posItems[ctx].find(function(x){return x.id===id;});
    if(!item)return;
    item[field]=val;
    /* Every group's running total is printed on its own block's head, so a
       person-month written down here changes one of them. Only the totals
       are redrawn — redrawing the rows would take the number field out
       from under the caret while it is being typed into. */
    if(field==='pm')drawTotals(ctx);
    /* A PI's name is printed on their group's head as well. */
    if(field==='name'&&item.pi)drawBlocks(ctx);
  }
  function posCollect(ctx){
    return posItems[ctx].map(function(x){
      return {id:x.id,type:x.type,name:x.name,py:x.py,fte:x.fte,count:x.count,
        groupId:x.groupId||'',pi:!!x.pi&&x.type==='tenured',
        pm:(x.pm===''||x.pm==null||isNaN(parseFloat(x.pm)))?'':String(parseFloat(x.pm))};});
  }
  /* One row per post: what it is, what it needs typed, and what it costs
     the project in person-months. No group picker — the row already sits
     under the PI whose group it belongs to. The PI's own row is one of
     these: its name is set on the group's row above and stated here rather
     than offered again, so a name is written in one place and read in two.

     The columns are the same on every row — the kind, then whatever that
     kind needs, then the person-months hard against the right, then the
     remove — so a block of them reads down as well as across. */
  function posRowHTML(ctx,item){
    var pm='<span class="pie-label">PM</span>'
      +'<input type="number" min="0" step="1" class="pie-input pie-input-pm" '
      +'value="'+esc(item.pm==null?'':item.pm)+'" placeholder="–" aria-label="Person-months" '
      +'oninput="PL.posField(\'' + ctx + '\',\''+item.id+'\',\'pm\',this.value)" />';
    /* A researcher is a named person, and their name is set on the list
       above, so their row here states it rather than offering it again —
       one place to write it, two to read it. Neither can be removed from
       here either, so the removed button's place is held open or their
       person-months would sit further right than everybody else's. */
    if(item.type==='tenured'){
      return '<div class="pos-item-edit pos-item-pi'+(item.pi?' pos-item-lead':'')+'">'
        +'<span class="pt '+(item.pi?'pt-pi':'pt-tenured')+'">'
          +(item.pi?'PI':posLabel('tenured'))+'</span>'
        +'<span class="pie-fixed">'+esc((item.name||'').trim()||'— name it above')+'</span>'
        +pm+'<span class="pie-nodel" aria-hidden="true"></span>'
      +'</div>';
    }
    var mid='';
    if(item.type==='postdoc'||item.type==='engd'){
      mid='<span class="pie-label">Years</span>'
        +'<input type="number" min="1" step="1" class="pie-input pie-input-yr" '
        +'value="'+esc(item.py)+'" placeholder="2" aria-label="Years" '
        +'oninput="PL.posField(\'' + ctx + '\',\''+item.id+'\',\'py\',this.value)" />';
    } else if(item.type==='tenured'){
      mid='<input type="text" class="pie-input pie-input-wide" list="posnames-'+ctx+'" '
        +'value="'+esc(item.name)+'" placeholder="Name / role" autocomplete="off" '
        +'aria-label="Name" '
        +'oninput="PL.posField(\'' + ctx + '\',\''+item.id+'\',\'name\',this.value)" />';
    }
    return '<div class="pos-item-edit">'
      +'<span class="pt '+posCls(item.type)+'">'+posLabel(item.type)+'</span>'
      +'<span class="pie-mid">'+mid+'</span>'
      +pm
      +'<button class="btn btn-xs btn-danger" '
        +'onclick="PL.posRemove(\'' + ctx + '\',\''+item.id+'\')">Remove</button>'
    +'</div>';
  }


  /* ── Partners ── */
  /* The contacts are copied one level further down than the partner, so
     the form edits its own copy: a contact typed and then cancelled must
     not already be sitting in the journal behind the pane. */
  function partnerInit(ctx,list){
    partners[ctx]=(list||[]).map(function(x){
      return Object.assign({},x,{contacts:copyContacts(x.contacts)});});
    drawPartners(ctx);
  }
  function partnerAdd(ctx){partners[ctx].push({id:uid(),name:'',nlLead:false});drawPartners(ctx);}
  function partnerRemove(ctx,id){
    partners[ctx]=partners[ctx].filter(function(x){return x.id!==id;});
    drawPartners(ctx);
  }
  function partnerName(ctx,id,val){
    var p=partners[ctx].find(function(x){return x.id===id;});
    if(p)p.name=val;
  }
  function partnerLead(ctx,id){partners[ctx].forEach(function(p){p.nlLead=(p.id===id);});}
  function partnerCollect(ctx){
    return partners[ctx].map(function(x){
      return {id:x.id,name:x.name,nlLead:x.nlLead,contacts:keptContacts(x.contacts)};});
  }
  function drawPartners(ctx){
    var el=byId(partnerList[ctx]);if(!el)return;
    el.innerHTML=partners[ctx].map(function(p){
      return '<div class="partner-item">'
        +'<input type="text" class="partner-name-input" placeholder="Organisation name" value="'+esc(p.name)+'" '
          +'oninput="PL.partnerName(\''+ctx+'\',\''+p.id+'\',this.value)" />'
        +'<label class="nl-lead-label"><input type="radio" name="nl-lead-'+ctx+'" '+(p.nlLead?'checked':'')+' '
          +'onchange="PL.partnerLead(\''+ctx+'\',\''+p.id+'\')" /> NL lead</label>'
        +'<button class="btn btn-xs btn-danger" onclick="PL.partnerRemove(\''+ctx+'\',\''+p.id+'\')">Remove</button>'
        +contactsHTML(ctx,p.id,p.contacts||[])
      +'</div>';
    }).join('');
  }

  /* ── Contacts ──
     The people at each organisation, a name and an e-mail each, so the
     card can hand a whole consortium's addresses to Outlook in one copy
     (Mark asked for both halves on 2026-10-06). They belong to the
     organisation rather than to the project, which is why they ride on
     the partner record; the coordinator is a plain name and not a record,
     so its people are kept beside it in `coordContacts`, under the one
     owner key COORD. A row is kept if either field has something in it —
     a name with the address still to find is worth writing down. */
  var COORD='coord';
  var coordContacts={'new':[],edit:[]};
  var coordList={'new':'np-coord-contacts',edit:'em-coord-contacts'};
  function copyContacts(list){
    return (list||[]).map(function(c){return Object.assign({},c);});
  }
  function keptContacts(list){
    return (list||[]).map(function(c){
        return {id:c.id,name:(c.name||'').trim(),email:(c.email||'').trim()};})
      .filter(function(c){return c.name||c.email;});
  }
  function contactsOf(ctx,owner){
    if(owner===COORD)return coordContacts[ctx];
    var p=(partners[ctx]||[]).find(function(x){return x.id===owner;});
    if(!p)return null;
    if(!p.contacts)p.contacts=[];
    return p.contacts;
  }
  function contactRowHTML(ctx,owner,c){
    var at="'"+ctx+"','"+owner+"','"+c.id+"'";
    return '<div class="pcon-row">'
      +'<input type="text" class="partner-name-input pcon-name" placeholder="Contact person" '
        +'value="'+esc(c.name||'')+'" aria-label="Contact person" '
        +'oninput="PL.contactField('+at+',\'name\',this.value)" />'
      +'<input type="email" class="partner-name-input pcon-email" placeholder="name@company.com" '
        +'value="'+esc(c.email||'')+'" aria-label="E-mail" '
        +'oninput="PL.contactField('+at+',\'email\',this.value)" />'
      +'<button type="button" class="pcon-del" title="Remove this contact" '
        +'onclick="PL.contactRemove('+at+')">\u2715</button>'
    +'</div>';
  }
  function contactsHTML(ctx,owner,list){
    return '<div class="pcon-list">'
      +list.map(function(c){return contactRowHTML(ctx,owner,c);}).join('')
      +'<button type="button" class="pcon-add" '
        +'onclick="PL.contactAdd(\''+ctx+'\',\''+owner+'\')">+ Contact</button>'
    +'</div>';
  }
  function drawCoord(ctx){
    var el=byId(coordList[ctx]);if(!el)return;
    el.innerHTML=contactsHTML(ctx,COORD,coordContacts[ctx]);
  }
  function redrawContacts(ctx,owner){
    if(owner===COORD)drawCoord(ctx); else drawPartners(ctx);
  }
  function coordInit(ctx,list){coordContacts[ctx]=copyContacts(list);drawCoord(ctx);}
  function coordCollect(ctx){return keptContacts(coordContacts[ctx]);}
  /* A new row hands the caret to its name, so adding three people is
     type, Tab, type, and the button again. */
  function contactAdd(ctx,owner){
    var list=contactsOf(ctx,owner);if(!list)return;
    var c={id:uid(),name:'',email:''};
    list.push(c);
    redrawContacts(ctx,owner);
    var host=byId(owner===COORD?coordList[ctx]:partnerList[ctx]);
    var rows=host?qa('.pcon-name',host):[];
    var inp=rows.filter(function(x){
      return (x.getAttribute('oninput')||'').indexOf("'"+c.id+"'")>=0;})[0];
    if(inp)inp.focus();
  }
  function contactField(ctx,owner,id,k,val){
    var c=(contactsOf(ctx,owner)||[]).find(function(x){return x.id===id;});
    if(c)c[k]=val;
  }
  function contactRemove(ctx,owner,id){
    var list=contactsOf(ctx,owner);if(!list)return;
    var i=list.findIndex(function(x){return x.id===id;});
    if(i>=0)list.splice(i,1);
    redrawContacts(ctx,owner);
  }
  function sortedPartners(list){
    if(!list||!list.length)return [];
    var lead=list.filter(function(p){return p.nlLead;});
    var rest=list.filter(function(p){return !p.nlLead;})
      .sort(function(a,b){return(a.name||'').localeCompare(b.name||'');});
    return lead.concat(rest);
  }

  return {
    markerInit:markerInit,markerAdd:markerAdd,markerField:markerField,
    markerRemove:markerRemove,markerCollect:markerCollect,
    linkInit:linkInit,linkAdd:linkAdd,linkField:linkField,linkRemove:linkRemove,
    linkCollect:linkCollect,linksDisplayHTML:linksDisplayHTML,
    posInit:posInit,posAdd:posAdd,posRemove:posRemove,posField:posField,
    posCollect:posCollect,posLabel:posLabel,posCls:posCls,posNames:posNames,
    resNames:resNames,seedFromDesc:seedFromDesc,
    piInit:piInit,piCollect:piCollect,drawTeam:drawTeam,drawTotals:drawTotals,
    resAdd:resAdd,resRemove:resRemove,resPI:resPI,resGroup:resGroup,resIn:resIn,
    partnerInit:partnerInit,partnerAdd:partnerAdd,partnerRemove:partnerRemove,
    partnerName:partnerName,partnerLead:partnerLead,partnerCollect:partnerCollect,
    sortedPartners:sortedPartners,
    coordInit:coordInit,coordCollect:coordCollect,
    contactAdd:contactAdd,contactField:contactField,contactRemove:contactRemove
  };
})();

/* ══ THE ROW TABLE ═══════════════════════════════════════════════════
   Two places in the app are the same object: a call's info table and a
   project's dossier. Both are a list of coloured, named, reorderable
   rows, each carrying a strip of notes, with a colour popover on the
   dot and an inline rename on the title. They were written twice —
   twenty-two identically-named functions — because their data lives in
   different places: a call's rows are their own store, a project's are
   derived from its entries.

   That difference belongs in an adapter, not in a second copy of the
   component. An adapter says where the rows come from and how to read
   and write a note; everything else — rendering, opening, renaming,
   reordering, the editing bridge, the outside-click collapse — happens
   once, here.

   Registered under a namespace ('ci' or 'pi') which is also the CSS
   class prefix, so one set of PL handlers serves both: the namespace is
   their first argument. */
var RowTable=(function(){

  var adapters={};
  /* Which note is open, and which was JUST opened (for the one-shot
     animation), keyed ns|ctx|rowId. The composite key matters: a
     dossier's rows are keyed by entry type, and those repeat across
     projects — keyed by row alone, opening a note on one project's
     Budget row would open it on every project's. */
  var openNote={},justOpened={},focusNote={},renaming=null;

  /* An adapter says what is true of its own table; the defaults below do
     the rest, since the component can already reach any row and note from
     `rows(ctx)` alone.

     Declaring `owner(ctx)` — the record that HOLDS the rows — also buys
     the structural verbs, because the component can then reach the stored
     array rather than a copy. A table without an owner is a projection: it
     gets the note defaults, and asking it to add or delete a row fails
     loudly rather than writing into an array nobody keeps. */
  function register(ns,a){
    a=a||{};
    function row(ctx,rowId){return findRow(ns,ctx,rowId);}
    function note(ctx,rowId,noteId){return findNote(ns,ctx,rowId,noteId);}
    function fill(k,fn){if(a[k]===undefined)a[k]=fn;}

    fill('noteId',function(n){return n.id;});
    fill('noteLabel',function(n){return n.label||'Note';});
    fill('noteBody',function(n){return n.body;});
    fill('setNoteLabel',function(ctx,rowId,noteId,val){
      var n=note(ctx,rowId,noteId);if(n){n.label=val;stampEdited(n);}
    });
    fill('setNoteBody',function(ctx,rowId,noteId,html){
      var n=note(ctx,rowId,noteId);if(n){n.body=html;stampEdited(n);}
    });
    fill('setName',function(ctx,rowId,val){var r=row(ctx,rowId);if(r)r.name=val;});
    fill('setColor',function(ctx,rowId,color){var r=row(ctx,rowId);if(r)r.color=color;});

    fill('addNote',function(ctx,rowId){
      var r=row(ctx,rowId);if(!r)return null;
      var notes=listOn(r,'notes');
      var n=newNote({label:'Note '+(notes.length+1)});
      notes.push(n);
      return n.id;
    });
    /* No dialog: the note comes back from the toast below. */
    fill('confirmDelNote',function(ctx,rowId,noteId,go){go();});
    fill('delNote',function(ctx,rowId,noteId){
      var r=row(ctx,rowId);if(!r)return;
      var idx=(r.notes||[]).findIndex(function(n){return n.id===noteId;});
      if(idx<0)return;
      var n=r.notes[idx];
      r.notes.splice(idx,1);
      toast('Note deleted'+(n.body?' \u2014 \u201c'+trunc(plain(n.body),40)+'\u201d':''),
        {action:'Undo',onAction:function(){
          var back=row(ctx,rowId);if(!back)return;
          var notes=listOn(back,'notes');
          notes.splice(Math.min(idx,notes.length),0,n);
          save();A(ns).rerender(ctx);
        }});
    });
    fill('reorderNote',function(ctx,rowId,srcId,tgtId){
      var r=row(ctx,rowId);
      return !!(r&&moveById(r.notes,srcId,tgtId));
    });

    if(a.owner){
      function rows(ctx){var o=a.owner(ctx);return o?rowsOf(o):null;}
      fill('rows',function(ctx){return rows(ctx)||[];});
      fill('addRow',function(ctx){
        var list=rows(ctx);if(!list)return null;
        var r=newRow({color:TITLE_COLORS[list.length%TITLE_COLORS.length]});
        list[a.addRowAt==='top'?'unshift':'push'](r);
        return r.id;
      });
      /* The one act with no undo behind it, so the one that asks — and
         only when there is something to lose. */
      fill('confirmDelRow',function(ctx,rowId,go){
        var r=row(ctx,rowId);if(!r)return;
        var n=(r.notes||[]).length;
        if(!n){go();return;}
        Dialog.ask({title:'Delete row',
          body:'\u201c'+(r.name||'Untitled')+'\u201d and its '+n
            +(n===1?' note':' notes')+' will be deleted.\n\nThis cannot be undone.',
          confirm:'Delete row'},go);
      });
      fill('delRow',function(ctx,rowId){
        var list=rows(ctx);if(!list)return;
        var idx=list.findIndex(function(r){return r.id===rowId;});
        if(idx>=0)list.splice(idx,1);
      });
      fill('reorder',function(ctx,srcId,tgtId){
        var list=rows(ctx);if(list)moveById(list,srcId,tgtId);
      });
    }
    adapters[ns]=a;
  }
  function A(ns){return adapters[ns];}
  function keyOf(ns,ctx,rowId){return ns+'|'+ctx+'|'+rowId;}
  function parseHost(host){
    var p=String(host||'').split('|');
    return {ns:p[0],ctx:p[1],rowId:p.slice(2).join('|')};
  }
  function getOpen(ns,ctx,rowId){return openNote[keyOf(ns,ctx,rowId)]||'';}
  function setOpen(ns,ctx,rowId,noteId){
    var k=keyOf(ns,ctx,rowId);
    if(noteId)openNote[k]=noteId; else delete openNote[k];
  }
  /* The four state fields a strip needs, in one read. Two of them are
     one-shot and are consumed here, so each fires on the render right
     after the act and on no render after that: justOpened plays the
     balloon, focusNote lands the caret. They are separate because they do
     not always coincide — naming a note should hand the caret to its body
     without replaying the animation. Both the row table's own renderer and
     the tracker's go through this, so the rule is stated once. */
  function stripState(ns,ctx,rowId){
    var host=keyOf(ns,ctx,rowId);
    var open=openNote[host]||'';
    var st={openId:open,
      justOpened:justOpened[host]===open?open:'',
      focusId:focusNote[host]===open?open:'',
      renamingId:(renaming&&renaming.ns===ns&&renaming.ctx===ctx&&renaming.rowId===rowId)
        ?renaming.noteId:''};
    delete justOpened[host];
    delete focusNote[host];
    return st;
  }
  /* Forget which notes were open — for an owner that is switching to an
     entirely different subject, where none of the old rows still exist. */
  function clearNotes(ns,ctx){
    var pre=ns+'|'+ctx+'|';
    [openNote,justOpened,focusNote].forEach(function(map){
      Object.keys(map).forEach(function(k){if(k.indexOf(pre)===0)delete map[k];});
    });
    if(renaming&&renaming.ns===ns&&renaming.ctx===ctx)renaming=null;
  }
  /* The inline handler strings a strip hangs on its tabs and panel. A pure
     function of the row's address, so every owner builds them the same way. */
  function noteCalls(ns,ctx,rowId){
    var pre="'"+jsq(ns)+"','"+jsq(ctx)+"','"+jsq(rowId)+"'";
    return function(what,x,y){
      switch(what){
        case 'toggle':      return 'PL.rtToggleNote('+pre+",'"+jsq(x)+"',"+y+')';
        case 'startRename': return 'PL.rtStartRename('+pre+",'"+jsq(x)+"',"+y+')';
        case 'tabKey':      return 'PL.rtTabKey('+y+','+pre+",'"+jsq(x)+"')";
        case 'rename':      return 'PL.rtCommitRename('+pre+",'"+jsq(x)+"',"+y+')';
        case 'del':         return 'PL.rtDelNote('+pre+",'"+jsq(x)+"',"+y+')';
        case 'add':         return 'PL.rtAddNote('+pre+','+y+')';
        case 'input':       return 'PL.rtNoteInput('+x+')';
        case 'paste':       return 'PL.rtNotePaste('+x+','+y+')';
        case 'blur':        return 'PL.rtNoteBlur('+x+')';
        case 'key':         return 'PL.rtNoteKey('+x+','+y+')';
      }
      return '';
    };
  }
  function findRow(ns,ctx,rowId){
    return (A(ns).rows(ctx)||[]).find(function(r){return r.id===rowId;})||null;
  }
  function findNote(ns,ctx,rowId,noteId){
    var r=findRow(ns,ctx,rowId);
    return r?((r.notes||[]).find(function(n){return A(ns).noteId(n)===noteId;})||null):null;
  }

  /* ── Rows ── */
  /* Structural changes persist here, so no adapter has to remember to.
     Keystroke streams (a title, a note body) debounce instead. */
  function addRow(ns,ctx){
    var a=A(ns),id=a.addRow(ctx);
    /* Which row is new, so a caller can send the caret there. */
    if(id&&a.afterAddRow)a.afterAddRow(ctx,id);
    save();a.rerender(ctx);
  }
  /* An adapter is asked rather than polled: it may need to put a dialog
     up, and that answer does not arrive in the same turn. It calls back
     when — and only when — the act is confirmed. */
  function delRow(ns,ctx,rowId){
    var a=A(ns);
    function go(){a.delRow(ctx,rowId);save();a.rerender(ctx);}
    if(a.confirmDelRow)a.confirmDelRow(ctx,rowId,go); else go();
  }
  function setName(ns,ctx,rowId,val){A(ns).setName(ctx,rowId,val);saveSoon();}
  function setColor(ns,ctx,rowId,color){
    A(ns).setColor(ctx,rowId,color);save();
    /* One small DOM poke instead of a rebuild: re-rendering here would
       tear down every card, and any open editor with them, to change
       one swatch. */
    var rowEl=rowEl_(ns,ctx,rowId);
    /* Every part of a row that wears its colour reads --rt-col. */
    if(rowEl)rowEl.style.setProperty('--rt-col',color);
    else A(ns).rerender(ctx);
    Menu.close();
  }
  function colorMenu(btn,ns,ctx,rowId){
    Menu.open(btn,
      '<div class="colmenu-row"><label>Row colour</label><div class="tc-picker">'
      +TITLE_COLORS.map(function(c){
        return '<button type="button" class="tc-swatch" style="background:'+c+'" '
          +'onclick="PL.rtColor(\''+jsq(ns)+'\',\''+jsq(ctx)+'\',\''+jsq(rowId)+'\',\''+c+'\')" '
          +'title="'+c+'"></button>';
      }).join('')+'</div></div>',
      {id:'rt-rowcolormenu'});
  }
  function reorder(ns,ctx,srcId,tgtId){
    if(srcId===tgtId)return;
    A(ns).reorder(ctx,srcId,tgtId);save();A(ns).rerender(ctx);
  }

  /* ── Notes ── */
  function addNote(ns,ctx,rowId,evt){
    if(evt)evt.stopPropagation();
    var a=A(ns);
    var id=a.addNote(ctx,rowId);
    if(!id)return;
    setOpen(ns,ctx,rowId,id);
    justOpened[keyOf(ns,ctx,rowId)]=id;
    focusNote[keyOf(ns,ctx,rowId)]=id;
    /* A brand-new note is named before it is written: its tab is the only
       place the name shows, so it opens straight into the rename box. */
    if(a.renameOnAdd)renaming={ns:ns,ctx:ctx,rowId:rowId,noteId:id};
    save();a.rerender(ctx);
  }
  function delNote(ns,ctx,rowId,noteId,evt){
    if(evt)evt.stopPropagation();
    var a=A(ns);
    function go(){
      a.delNote(ctx,rowId,noteId);
      if(getOpen(ns,ctx,rowId)===noteId)setOpen(ns,ctx,rowId,'');
      save();a.rerender(ctx);
    }
    if(a.confirmDelNote)a.confirmDelNote(ctx,rowId,noteId,go); else go();
  }
  function toggleNote(ns,ctx,rowId,noteId,evt){
    if(evt)evt.stopPropagation();
    var a=A(ns);
    /* Any other note action ends a rename in progress. A stale one leaves
       that note's tab drawn as an input, which reads as a button that has
       gone missing. */
    if(renaming&&renaming.noteId!==noteId)renaming=null;
    if(getOpen(ns,ctx,rowId)===noteId)setOpen(ns,ctx,rowId,'');
    else{
      setOpen(ns,ctx,rowId,noteId);
      justOpened[keyOf(ns,ctx,rowId)]=noteId;
      focusNote[keyOf(ns,ctx,rowId)]=noteId;
    }
    a.rerender(ctx);
    /* A panel that opened inside a dense, scrolling table can land off
       screen; an owner that needs it says so. */
    if(a.afterOpen&&getOpen(ns,ctx,rowId))a.afterOpen(ctx,rowId);
  }
  function startRename(ns,ctx,rowId,noteId,evt){
    if(evt)evt.stopPropagation();
    renaming={ns:ns,ctx:ctx,rowId:rowId,noteId:noteId};
    A(ns).rerender(ctx);
  }
  function commitRename(ns,ctx,rowId,noteId,val){
    var n=findNote(ns,ctx,rowId,noteId);
    if(n){
      var lbl=(val||'').trim();
      if(lbl&&lbl!==A(ns).noteLabel(n))A(ns).setNoteLabel(ctx,rowId,noteId,lbl);
    }
    renaming=null;
    /* Named it — now write it. Leaving the rename box with the note still
       open hands the caret straight on to the body, so a new note is one
       gesture from blank to typing. */
    if(getOpen(ns,ctx,rowId)===noteId)focusNote[keyOf(ns,ctx,rowId)]=noteId;
    save();
    /* The blur that brought us here is usually a click landing on another
       tab. Redrawing the strip now destroys that tab between the press and
       the release, and the click is simply lost — so the rebuild waits a
       tick for the press to be delivered. */
    setTimeout(function(){A(ns).rerender(ctx);},0);
  }
  function tabKey(ev,ns,ctx,rowId,noteId){
    if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();toggleNote(ns,ctx,rowId,noteId,ev);}
    else if(ev.key==='F2'){ev.preventDefault();startRename(ns,ctx,rowId,noteId,ev);}
    else if(ev.key==='Delete'){ev.preventDefault();delNote(ns,ctx,rowId,noteId,ev);}
  }
  function reorderNote(ns,ctx,rowId,srcId,tgtId){
    var a=A(ns);
    if(!a||!a.reorderNote||!a.reorderNote(ctx,rowId,srcId,tgtId))return;
    save();a.rerender(ctx);
  }

  /* The editing bridge. A full re-render here would destroy the
     contenteditable mid-keystroke, so the counter, the tab's dot and the
     stamp are updated in place instead. */
  function onInput(el){
    var h=parseHost(el.getAttribute('data-note-host'));
    var a=A(h.ns);if(!a)return;
    var noteId=el.getAttribute('data-note-id');
    var row=findRow(h.ns,h.ctx,h.rowId);
    var n=row&&(row.notes||[]).find(function(x){return a.noteId(x)===noteId;});
    if(!n)return;
    var clean=sanitizeRichHTML(el.innerHTML);
    /* Only re-stamp when the content genuinely changed: oninput also
       fires for caret-only events in some browsers, and re-stamping on
       those makes "edited" drift every time a note is merely opened. */
    if(a.noteBody(n)!==clean)a.setNoteBody(h.ctx,h.rowId,noteId,clean);
    saveSoon();
    Notes.pokeAfterEdit(n,el.closest(a.rowSel||('.'+h.ns+'-row')),row.notes||[],a.noteBody);
  }
  function onPaste(el,evt){pasteRich(evt,function(){onInput(el);});}
  function onBlur(el){
    /* Replace only raw-URL text nodes. Existing anchors keep their identity,
       so clicking one cannot be interrupted by this blur. */
    linkifyRichElement(el);
    onInput(el);
  }
  /* With no toolbar the chords ARE the editor's vocabulary. */
  var FMT_KEYS={b:'bold',i:'italic',u:'underline'};
  var FMT_SHIFT={'8':'insertUnorderedList','*':'insertUnorderedList',
                 '7':'insertOrderedList',  '&':'insertOrderedList'};
  function onKey(el,ev){
    if((ev.ctrlKey||ev.metaKey)&&!ev.altKey){
      var k=ev.key.toLowerCase();
      var cmd=ev.shiftKey?(FMT_SHIFT[k]||FMT_SHIFT[ev.key]):FMT_KEYS[k];
      if(cmd){
        ev.preventDefault();
        execFmt(el,cmd);
        onInput(el);return;
      }
    }
    if(ev.key==='Escape'){
      ev.preventDefault();ev.stopPropagation();
      var h=parseHost(el.getAttribute('data-note-host'));
      toggleNote(h.ns,h.ctx,h.rowId,el.getAttribute('data-note-id'),ev);
    }
  }

  /* ── Rendering ── */
  function rowEl_(ns,ctx,rowId){
    return q('.'+ns+'-row[data-rt="'+cssEsc(keyOf(ns,ctx,rowId))+'"]');
  }
  function rowHTML(ns,ctx,r){
    var a=A(ns);
    var host=keyOf(ns,ctx,r.id);
    var st=stripState(ns,ctx,r.id);
    var strip=Notes.strip({
      hostId:host,
      notes:r.notes||[],
      openId:st.openId,justOpened:st.justOpened,focusId:st.focusId,
      renamingId:st.renamingId,
      label:a.noteLabel,body:a.noteBody,
      dot:true,
      call:noteCalls(ns,ctx,r.id)
    });

    var C="'"+jsq(ns)+"','"+jsq(ctx)+"','"+jsq(r.id)+"'";
    return '<div class="'+ns+'-row" data-rt="'+esc(host)+'" data-row-id="'+esc(r.id)+'" '
      +'style="--rt-col:'+safeColor(r.color)+'">'
      +'<div class="'+ns+'-row-main">'
        +(a.grip?'<div class="'+ns+'-row-drag" title="Drag to reorder">\u2807</div>':'')
        +'<button type="button" class="'+ns+'-row-colordot" '
          +'title="Change this row\u2019s colour" '
          +'onclick="PL.rtColorMenu(this,'+C+');event.stopPropagation()"></button>'
        +'<input type="text" class="'+ns+'-row-name" value="'+esc(r.name)+'" data-orig="'+esc(r.name)+'" '
          +'placeholder="Name this row\u2026" '
          +'title="'+(a.grip?'Click to rename':'Click to rename \u2014 drag to reorder')+'" '
          +'onchange="PL.rtName('+C+',this.value)" '
          +'onkeydown="PL.rowNameKey(event,this)" onclick="event.stopPropagation()" />'
        +'<div class="'+ns+'-row-tabs">'+strip.tabs+'</div>'
        +'<span class="'+ns+'-row-count" data-rt-count="1" '
          +'title="'+strip.filled+' of '+strip.count+' notes have content">'
          +(strip.count?strip.filled+'/'+strip.count:'')+'</span>'
        +'<button type="button" class="'+ns+'-row-del" title="Delete this row and its notes" '
          +'onclick="PL.rtDelRow('+C+')">\u2715</button>'
      +'</div>'+strip.panel+'</div>';
  }
  function rowsHTML(ns,ctx){
    return (A(ns).rows(ctx)||[]).map(function(r){return rowHTML(ns,ctx,r);}).join('');
  }

  /* ── Binding ──
     Called by the owner after it has put the rows in the document. */
  function bind(ns,ctx,container){
    if(!container)return;
    var a=A(ns);
    /* The DOM is rebuilt wholesale on every render, so whatever was owed
       focus has to be given it again here. */
    Notes.focusAfterRender(container);
    qa('.'+ns+'-row[data-rt]',container).forEach(function(rowEl){
      /* The drag source is the grip where there is one, otherwise the
         title itself — and in that case pointerdown must NOT be
         swallowed, or the input could never take focus. */
      var handle=a.grip?q('.'+ns+'-row-drag',rowEl):q('.'+ns+'-row-name',rowEl);
      if(handle){
        Drag.handle(handle,rowEl,'.'+ns+'-row[data-rt]',
          function(el){return el.getAttribute('data-row-id');},
          function(s,t){reorder(ns,ctx,s,t);},
          {grabsPointerDown:!!a.grip});
      }
      var rowId=rowEl.getAttribute('data-row-id');
      Notes.bindDrag(rowEl,function(s,t){reorderNote(ns,ctx,rowId,s,t);});
    });
  }

  /* Close every open note in one table. A click is "outside" unless it
     landed inside a panel, on a tab, in the rename box or in the colour
     popover — you must be able to click into the editor, press the
     format buttons and drag-select without the panel vanishing. */
  function collapseAll(ns,ctx){
    var rows=A(ns).rows(ctx)||[],changed=false;
    rows.forEach(function(r){
      var k=keyOf(ns,ctx,r.id);
      if(openNote[k]){delete openNote[k];changed=true;}
      delete justOpened[k];delete focusNote[k];
    });
    /* A rename box standing open is itself something to collapse, even
       when no panel was open behind it. */
    if(renaming&&renaming.ns===ns&&renaming.ctx===ctx){renaming=null;changed=true;}
    if(!changed)return false;
    /* Re-rendering would yank focus out of the row-title input if the
       click that triggered this was a click INTO that input. Remember
       where the caret was and put it back. */
    var act=document.activeElement,focusRow=null,selStart=null,selEnd=null;
    if(act&&act.classList&&act.classList.contains(ns+'-row-name')){
      var host=act.closest('.'+ns+'-row[data-rt]');
      if(host){
        focusRow=host.getAttribute('data-row-id');
        try{selStart=act.selectionStart;selEnd=act.selectionEnd;}catch(e){}
      }
    }
    save();A(ns).rerender(ctx);
    if(focusRow){
      var again=q('.'+ns+'-row[data-rt="'+cssEsc(keyOf(ns,ctx,focusRow))+'"] .'+ns+'-row-name');
      if(again){
        again.focus();
        if(selStart!=null){try{again.setSelectionRange(selStart,selEnd);}catch(e){}}
      }
    }
    return true;
  }
  /* The rename box carries .note-tab too, so it is covered by that test. */
  function isInside(target){
    if(!target||!target.closest)return true;
    return !!(target.closest('.note-panel')||target.closest('.note-tab')
      ||target.closest('.note-add')||target.closest('#rt-rowcolormenu'));
  }

  return {register:register,rowsHTML:rowsHTML,bind:bind,
    collapseAll:collapseAll,isInside:isInside,
    stripState:stripState,noteCalls:noteCalls,clearNotes:clearNotes,
    hostId:keyOf,openNoteId:getOpen,
    addRow:addRow,delRow:delRow,setName:setName,setColor:setColor,
    colorMenu:colorMenu,
    addNote:addNote,delNote:delNote,toggleNote:toggleNote,reorderNote:reorderNote,
    startRename:startRename,commitRename:commitRename,tabKey:tabKey,
    onInput:onInput,onPaste:onPaste,onBlur:onBlur,onKey:onKey};
})();

/* Shared by both tables' inline row-title fields: commit on Enter,
   revert on Escape. */
function rowNameKey(ev,el){
  if(ev.key==='Enter'){ev.preventDefault();el.blur();}
  else if(ev.key==='Escape'){
    /* Handled here and nowhere else: bubbling on would have the app-level
       Escape read the same press as “close whatever this row is in”. */
    ev.preventDefault();ev.stopPropagation();
    el.value=el.getAttribute('data-orig')||'';el.blur();
  }
}

/* ══ THE BEAM ═══════════════════════════════════════════════════════
   The board's header and the app's navigation. One chip per call, in
   call order. On the board a chip anchors that call's card over the
   table; on the timeline face the same chip switches that call's lane
   off and on. One bar, two jobs — which is the point of the bar being
   the header of both faces.

   The old counters (how many calls, how many projects) described a list
   that no longer exists. What earns the space instead is the next
   deadline, given in full: how long you have, when it is, and whose. */
var Beam=(function(){

  function render(){
    var host=byId('hz-beam');
    if(!host)return;
    host.innerHTML=html(activeProjects());
    /* The header's rule is the beam's top edge as far as the eye is
       concerned, so it mirrors whatever the bar just decided. Read back
       off the bar rather than recomputed, so the two cannot disagree. */
    var bar=q('.hz-bar',host),hdr=q('.hdr');
    if(hdr){
      var lit=!!(bar&&bar.classList.contains('anchored'));
      hdr.classList.toggle('anchored',lit);
      if(lit)hdr.style.setProperty('--ac',bar.style.getPropertyValue('--ac'));
      else hdr.style.removeProperty('--ac');
    }
    bindChipDrag();
  }

  function nextDeadline(active){
    var nextM=null,nextCall='',nextColor='',nextId='';
    var seen={};
    /* One pass over every key date that is in play, wherever it is kept:
       on the call for the calls, and on the project itself for a Horizon
       project, whose dates came from its topic and are its own. `label`
       is what the beam prints beside the date — the call's name, or the
       project's acronym, which is what a Horizon deadline is known by. */
    function consider(m,label,color,id){
      if(!m.date||!isIsoDate(m.date))return;
      var d=daysUntil(m.date);
      var endD=m.endDate?daysUntil(m.endDate):d;
      if(endD<0)return;                          // already behind us
      /* Rank on the EFFECTIVE date: for a range that has started but is
         still open, that is its end date, not its start. */
      var eff=(m.endDate&&d<0)?m.endDate:m.date;
      var nextEff=nextM?((nextM.endDate&&daysUntil(nextM.date)<0)?nextM.endDate:nextM.date):null;
      if(!nextM||eff<nextEff){
        nextM=m;nextCall=label;nextColor=color;nextId=id;
      }
    }
    active.forEach(function(p){
      projectMarkers(p).forEach(function(m){
        consider(m,p.name,safeColor(projColor(p),'var(--gold2)'),p.callId);
      });
      if(seen[p.callId])return;
      seen[p.callId]=1;
      var c=calls[p.callId];if(!c)return;
      (c.markers||[]).forEach(function(m){
        consider(m,callName(c),safeColor(callColorOf(c),'var(--gold2)'),c.id);
      });
    });
    return {m:nextM,call:nextCall,color:nextColor,id:nextId};
  }

  function html(active){
    var overdue=0;
    active.forEach(function(p){overdue+=projTodoStats(p).overdue;});
    var nx=nextDeadline(active);

    var dl;
    if(!nx.m){
      dl='<div class="beam-dl beam-dl-empty" title="No key dates on any call">'
        +'<span class="beam-dl-lead">Next deadline</span>'
        +'<span class="beam-dl-num">\u2014</span>'
        +'<span class="beam-dl-when">nothing upcoming</span></div>';
    } else {
      var d=daysUntil(nx.m.date);
      var open=(d<0&&nx.m.endDate);
      var num,unit;
      if(open){num='open';unit='closes '+fmtDate(nx.m.endDate);}
      else if(d===0){num='today';unit=fmtDate(nx.m.date);}
      else if(d===1){num='tomorrow';unit=fmtDate(nx.m.date);}
      else{num=d+' days';unit=fmtDate(nx.m.date);}
      var mName=nx.m.name||'Deadline';
      var cls=open?'':(d<=7?' crit':(d<=21?' warn':''));
      /* The same figure the wall on the board carries, said here as well —
         because the board only ever draws two to six weeks, and the
         deadline that matters most is usually the one just past its right
         edge. On the board the picture makes the point; here there is no
         picture, so the number has to. */
      var openMins=0;
      active.forEach(function(p){
        if(p.callId!==nx.id)return;
        (p.todos||[]).forEach(function(t){if(!t.done)openMins+=(+t.effort||0);});
      });
      var openTxt=openMins?effortShort(openMins):'';
      var full=(nx.call?nx.call+' \u2014 ':'')+mName+' \u00b7 '+fmtDate(nx.m.date)
        +(openTxt?' \u00b7 '+openTxt+' of open work in this call':'');
      dl='<button type="button" class="beam-dl'+cls+(Board.agendaOn()?' on':'')+'" '
        +'style="--call-col:'+esc(nx.color)+'" '
        +'aria-pressed="'+(Board.agendaOn()?'true':'false')+'" '
        +'title="'+esc(full)+' \u2014 click for every deadline in date order" '
        +'onclick="PL.toggleAgenda()">'
        +'<span class="beam-dl-lead">'+esc(mName)
          +(nx.call?' \u00b7 <b class="beam-dl-call">'+esc(nx.call)+'</b>':'')+'</span>'
        +'<span class="beam-dl-num">'+esc(num)+'</span>'
        +'<span class="beam-dl-when">'+esc(unit)
          +(openTxt?' \u00b7 <b class="beam-dl-open">'+esc(openTxt)+' open</b>':'')
        +'</span></button>';
    }
    var od=overdue
      ?'<button type="button" class="beam-overdue" title="'+overdue+' overdue todo'
        +(overdue===1?'':'s')+' \u2014 show them" onclick="PL.overdueClick(event)">'
        +'<b>'+overdue+'</b><span>overdue</span></button>'
      :'';

    /* The rules light for whichever call you are inside — anchored as a
       card, or opened as one of its projects' trackers. Both mean "you
       are in this call", so both colour the pair the same way. */
    var litCall=Nav.anchor()||Sheet.call();
    var acol='';
    if(litCall){
      var ag=active.filter(function(p){return p.callId===litCall;});
      if(ag.length)acol=safeColor(projColor(ag[0]),'var(--gold)');
    }

    return '<div class="hz-bar'+(acol?' anchored':'')+'"'
        +(acol?' style="--ac:'+esc(acol)+'"':'')
        +' role="toolbar" aria-label="Calls">'
      +chipsHTML(active)
      +'<div class="hz-bar-right">'+od+dl+'</div>'
    +'</div>';
  }

  function chipsHTML(active){
    var onTimeline=Board.face()==='timeline';
    var groups={},order=[];
    active.forEach(function(p){
      var k=p.callId,c=calls[k];
      if(!c||c.solo)return;                      // a project on its own has no chip
      /* On the timeline the chips switch lanes on and off, so a call that
         draws no lane has nothing to switch. */
      if(onTimeline&&!Timeline.hasLane(k))return;
      if(!groups[k]){groups[k]=[];order.push(k);}
      groups[k].push(p);
    });
    /* The programme is on the bar whether or not anything is in it: it is
       where a Horizon project is started, so it cannot wait until one
       exists to appear. On the timeline face a chip switches a lane on
       and off, and a programme with no work has no lane to switch, so
       there it keeps the same rule as everything else. */
    if(!onTimeline&&!groups[PROGRAMME_ID]&&calls[PROGRAMME_ID]){
      groups[PROGRAMME_ID]=[];order.push(PROGRAMME_ID);
    }
    if(!order.length)return '<div class="call-chips" id="call-chips"></div>';
    order.sort(function(a,b){return ((calls[a].order||0)-(calls[b].order||0))||0;});

    var chips=order.map(function(k){
      var g=groups[k],c=calls[k];
      var nm=callName(c)||'Call';
      var col=safeColor(callColorOf(c),'var(--gold)');
      var off=onTimeline&&Timeline.isHidden(k);
      var on=(!onTimeline&&(Nav.anchor()===k||Sheet.call()===k));
      var st={open:0,overdue:0};
      g.forEach(function(p){var s=projTodoStats(p);st.open+=s.open;st.overdue+=s.overdue;});
      /* Dot and name, nothing else: on a legend, a number beside every
         entry competes with the board it is a legend for. The tallies
         moved into the tooltip. */
      var prog=(k===PROGRAMME_ID);
      var count=g.length
        ? g.length+' project'+(g.length===1?'':'s')
        : 'nothing in it yet';
      /* No class of its own: the programme is the same chip as the rest
         and its white --c is the whole of what marks it out. */
      return '<button type="button" class="call-chip'+(on?' on':'')+(off?' off':'')+'" '
        +'data-call-chip="'+esc(k)+'" style="--c:'+esc(col)+'" '
        +'aria-pressed="'+((onTimeline?!off:on)?'true':'false')+'" '
        +'title="'+esc(nm)+' \u2014 '+count
          +(st.open?' \u00b7 '+st.open+' open todo'+(st.open===1?'':'s'):'')
          +(st.overdue?' \u00b7 '+st.overdue+' overdue':'')
          +(onTimeline
             ? (off?' \u2014 click to put it back on the timeline':' \u2014 click to take it off the timeline')
             : (on?' \u2014 click to return to the horizon'
                  :(prog?' \u2014 click to open the programme':' \u2014 click to open, or drag to reorder')))+'" '
        +'onclick="PL.pressCall(\''+esc(k)+'\')">'
        +'<span class="call-chip-dot"></span>'
        +'<span class="call-chip-lbl">'+esc(nm)+'</span>'
      +'</button>';
    }).join('');
    return '<div class="call-chips" id="call-chips">'+chips+'</div>';
  }

  /* Dragging a chip sets where the call sits — in the beam and, because
     the board reads the same order, in the table's lanes too. */
  function bindChipDrag(){
    var wrap=byId('call-chips');
    if(!wrap)return;
    qa('.call-chip[data-call-chip]',wrap).forEach(function(chip){
      /* The programme is pinned to the right-hand end — PROGRAMME_ORDER —
         so there is nothing for a drag on it to say. */
      if(chip.getAttribute('data-call-chip')===PROGRAMME_ID)return;
      Drag.handle(chip,chip,'.call-chip[data-call-chip]',
        function(el){return el.getAttribute('data-call-chip');},reorderCalls);
    });
  }

  function reorderCalls(srcKey,tgtKey){
    var order=[];
    activeProjects().forEach(function(p){
      if(p.callId===PROGRAMME_ID)return;       // pinned; never in the shuffle
      if(order.indexOf(p.callId)<0)order.push(p.callId);
    });
    order.sort(function(a,b){
      return (((calls[a]||{}).order||0)-((calls[b]||{}).order||0))||0;});
    /* A list of bare ids, so identity is the id itself. */
    if(!moveById(order,srcKey,tgtKey,function(k){return k;}))return;
    /* One write per call, where this used to write to every member. */
    order.forEach(function(k,i){if(calls[k])calls[k].order=i;});
    save();
    invalidateDerived();
    render();
    if(Nav.anchor())CallCard.render(); else Board.renderHorizon();
  }

  return {render:render};
})();

/* ══ NAVIGATION ═════════════════════════════════════════════════════
   A call chip owns one workspace: its project cards and their trackers.
   The chip stays on throughout that workspace; pressing it again always
   returns to the horizon.

   Below that there used to sit a second page, the notes, and a mode
   saying which of the two was up; the Notes room does that work now, so
   applyMode has one page to dress and only the anchored call to read. */
var Nav=(function(){
  var anchorCall=null;

  function anchor(){return anchorCall;}
  function setAnchor(k){anchorCall=k;}

  /* One place decides what is on screen, so the page, its containers and
     the header controls cannot disagree. */
  function applyMode(){
    var onCall=!!anchorCall;
    var bv=byId('board-view');
    if(bv)bv.classList.add('active');
    var hzEl=byId('horizon-container'),projEl=byId('projects-container');
    var beam=byId('hz-beam');
    if(beam)beam.style.display='';
    if(hzEl)hzEl.style.display=onCall?'none':'';
    if(projEl)projEl.style.display=onCall?'':'none';
    /* Archive filters projects, so it shows only where it bites. */
    var arcBtn=byId('hd-archive-btn');
    if(arcBtn)arcBtn.style.display=onCall?'':'none';
  }

  function activate(key){
    if(anchorCall===key){applyMode();return false;}
    clearLanding();
    Board.setAgenda(false);
    Board.clearDetail();
    anchorCall=key;
    applyMode();
    CallCard.render();
    return true;
  }

  function home(){
    clearLanding();
    if(Sheet.pid())Sheet.close(true);
    CallCard.cancelEdit();
    CallCard.closeInfoState();
    qa('.view').forEach(function(v){v.classList.remove('active');});
    var rootEl=byId('root');if(rootEl)rootEl.style.display='';
    Board.resetHome();
    anchorCall=null;
    QuickTodo.close();
    applyMode();
    Board.render();
    window.scrollTo(0,0);
  }

  function pressCall(key){
    if(Board.face()==='timeline'){Timeline.toggleCall(key);return;}
    if((Sheet.pid()&&Sheet.call()===key)||anchorCall===key){home();return;}
    if(Sheet.pid())Sheet.close(true);
    activate(key);
    Beam.render();
    window.scrollTo(0,0);
  }
  function release(){
    if(anchorCall||Sheet.pid())home();
  }

  /* "Show me this project" means: anchor the call it belongs to, then
     bring its card into view. Whether the dossier comes out with it is
     the caller's business, which is why `drawer` is a parameter and not a
     rule: the search palette is answering "take me to this project", and
     a drawer of that project's rows and notes is a fair reading of it.
     The board's lane is not. Mark asked on 2026-09-04 for a press on a
     project's name there to land on the card and stop, because the drawer
     it threw open was never what he had crossed the board to look at, and
     shutting it again was a second press for nothing.

     When the drawer is being left shut it also has to be shut FIRST.
     `openCard` outlives leaving a call, so a card left open earlier in
     the same call renders open again the moment CallCard redraws it —
     and the caller who asked for no drawer would get somebody else's. */
  /* ── Saying which card you arrived at ──
     A jump anchors the whole CALL, so the project asked for comes up in a
     list of its siblings wearing exactly their face, and scrolling it to
     the middle of the screen is the only thing that ever said which one it
     was. Mark reported on 2026-09-11 that he could not tell the card he
     had crossed the board for from the others of that call.

     Two marks, because one of them cannot last and the other cannot
     shout. The ring is `pj-hit`'s ring, held and then decayed to a quiet
     gold edge that STAYS — arriving is a moment, but "this is the one you
     asked for" has to survive the moment. And for as long as the ring is
     lit the other cards in the call stand back, which is the half a lit
     ring cannot do on its own: a card is already a bordered slab on a dark
     ground, so one more edge on one of them reads as a state, not as a
     choice between them.

     The resting edge is cleared by the next act of navigation — going
     home, anchoring another call, landing somewhere else — and by nothing
     else. A re-render of the card drops it too, which is the right moment
     for it to go: it has been read by then. */
  var landing=null;
  function clearLanding(){
    if(!landing)return;
    clearTimeout(landing.timer);
    if(landing.el)landing.el.classList.remove('pj-land');
    if(landing.host)landing.host.classList.remove('pj-landing');
    landing=null;
  }
  function land(el){
    clearLanding();
    if(!el)return;
    var host=el.parentElement;
    if(host&&!host.classList.contains('call-projects'))host=null;
    /* Re-adding the class alone would not replay the animation on a card
       that is already wearing it; the reflow between is what restarts it. */
    el.classList.remove('pj-land');void el.offsetWidth;el.classList.add('pj-land');
    if(host)host.classList.add('pj-landing');
    landing={el:el,host:host,timer:setTimeout(function(){
      if(host)host.classList.remove('pj-landing');
    },2300)};
    reveal(el,{block:'center'});
  }

  function openProject(id,drawer){
    var p=projects[id];
    if(!p){toast('That project no longer exists.');home();return;}
    home();
    if(drawer===false)Dossier.close();
    if(p.archived&&!showingArchive){showingArchive=true;syncArchiveLabel();}
    activate(p.callId);
    Beam.render();
    requestAnimationFrame(function(){
      land(q('.pi-fold[data-pid="'+cssEsc(id)+'"]'));
      if(drawer!==false)Dossier.open(id);
    });
  }

  return {anchor:anchor,setAnchor:setAnchor,activate:activate,applyMode:applyMode,home:home,
    pressCall:pressCall,release:release,openProject:openProject};
})();

function syncArchiveLabel(){
  var l=byId('archive-tab-label');
  if(l)l.textContent=showingArchive?'Hide archive':'Show archive';
}
function toggleArchiveView(){showingArchive=!showingArchive;syncArchiveLabel();CallCard.render();}

/* ── The overflow menu — the low-frequency ways in, off the header. ── */
function hdMoreToggle(evt){
  if(evt){evt.preventDefault();evt.stopPropagation();}
  var b=byId('hd-more-btn');
  var key=modKey()+'K';
  Menu.open(b,
     '<button type="button" role="menuitem" class="hd-more-item" onclick="PL.menuClose();PL.openPalette()">'
      +'<span>Search</span><span class="hd-more-key">'+key+'</span></button>'
    +'<div class="hd-more-sep"></div>'
    +'<button type="button" role="menuitem" class="hd-more-item" onclick="PL.menuClose();PL.toggleCloudPanel()">'
      +'<span>Cloud sync</span></button>'
    +'<button type="button" role="menuitem" class="hd-more-item" onclick="PL.menuClose();PL.backboneOpen()">'
      +'<span>Add call backbone</span></button>'
    +'<div class="hd-more-sep"></div>'
    +'<button type="button" role="menuitem" class="hd-more-item" onclick="PL.menuClose();PL.exportData()"><span>Export</span></button>'
    +'<label role="menuitem" class="hd-more-item hd-more-file"><span>Import</span>'
      +'<input type="file" accept=".json" style="display:none" onchange="PL.menuClose();PL.importData(this)" /></label>',
    {id:'hd-more-menu',cls:'hd-more-menu',align:'right',role:'menu'});
}

/* ══ THE BOARD ══════════════════════════════════════════════════════
   A coming-weeks day grid, and — turned over — the deadline timeline.
   Both faces are always mounted; a turn is a class toggle plus a height,
   never a swap.

   `open` names whatever slice the detail pane is showing. It has one
   shape per way in: a single todo {pid,eid}, a day {day}, a call
   {callKey,label}, a project {projId}, or one of the two states,
   {unplanned} / {overdue}. */
var Board=(function(){

  var weeks=3;                    // 2 | 3 | 4 | 6
  /* px per day column at minimum width — the same number as --hz-day-w in
     the stylesheet, which turns it into the board's natural width */
  var DAY_W=34;
  var WEEKS_W=76;                 // the corner the window trigger occupies
  var MONTH_HALF_W=26;            // half a month label at its widest
  /* Past this many days the board gives up the name gutter so the window
     fits the pane instead of scrolling; names become overlay tags. */
  var COMPACT_FROM=29;
  /* Breathing room around anything being revealed. Generous on purpose:
     at 16px content sat flush against the viewport edge and read as
     barely visible, particularly on a tablet. */
  var REVEAL_MARGIN=34;
  var WEEK_OPTS=[2,3,4,6];

  var open=null;                  // the current slice, or null
  /* One project's todos, gathered out of the day and shown alone — see
     `gather`. It belongs to the open slice and dies with it. */
  var only=null;
  var face='board';               // which side is up
  var agendaOn=false;
  var faceSwap=null,turnEnd=null;
  function cancelFaceSwap(){if(faceSwap){clearTimeout(faceSwap);faceSwap=null;}}
  var FLIP_MS=Turn.MS;            // the app's one turn duration
  var drag=null;
  var docBound=false,resizeBound=false;

  /* ── Collecting ── */
  function collect(){
    if(!_hzCache)_hzCache=collectRaw();
    return _hzCache;
  }
  function collectRaw(){
    ensureInbox();
    var list=sortLikeBoard(activeProjects());
    var inbox=projects[INBOX_ID];
    if(inbox)list.push(inbox);
    var lanes=[],byKey={};
    list.forEach(function(p){
      var todos=(p.todos||[]).filter(function(t){return !t.done;});
      if(!todos.length)return;
      var key,label;
      if(p.id===INBOX_ID){key='__inbox__';label='General';}
      else{
        key=p.callId;
        label=callNameOf(p)||p.name;
      }
      if(!byKey[key]){
        byKey[key]={key:key,label:label,flat:(p.id===INBOX_ID),
          color:projColor(p),projects:[]};
        lanes.push(byKey[key]);
      }
      byKey[key].projects.push({p:p,todos:todos});
    });
    return lanes;
  }
  /* \u2500\u2500 The rows a date puts on the board by itself \u2500\u2500
     `collectRaw` is built out of open todos, which is right for everything
     that counts work \u2014 the effort strip, the beam, a call's open minutes.
     But a Horizon proposal closing inside the window is exactly what the
     window is for, and until Mark asked on 2026-09-04 a project with the
     date and no todos yet was the one thing the board could not show: no
     todo, no lane, and the deadline went with it.

     So the extra rows are added HERE, where the window is known, onto a
     copy of the cached lanes. A copy because `collect()` is cached and
     read by everything that counts, and a row carrying no todos would
     otherwise be a project in those sums that has nothing in it. */
  function withProgrammeDates(lanes,startIso,days){
    var extra=activeProjects().filter(function(p){
      return p.callId===PROGRAMME_ID
        && !(p.todos||[]).some(function(t){return !t.done;})
        && projWallsInWindow(p,startIso,days).length;
    });
    if(!extra.length)return lanes;
    var out=lanes.slice(),lane=null,at=-1;
    out.forEach(function(c,i){if(c.key===PROGRAMME_ID){lane=c;at=i;}});
    var prog=calls[PROGRAMME_ID];
    var copy={key:PROGRAMME_ID,
      label:lane?lane.label:(callName(prog)||'HORIZON'),
      flat:false,
      color:lane?lane.color:safeColor(callColorOf(prog),'var(--gold2)'),
      projects:(lane?lane.projects:[]).concat(extra.map(function(p){
        return {p:p,todos:[]};}))};
    /* Back into the board's own order, so a row that arrived by its date
       is not simply stacked after the ones that arrived by their work. */
    var rank={};
    sortLikeBoard(activeProjects()).forEach(function(p,i){rank[p.id]=i;});
    copy.projects.sort(function(a,b){
      return (rank[a.p.id]||0)-(rank[b.p.id]||0);});
    if(at>=0){out[at]=copy;return out;}
    /* A programme lane that did not exist a moment ago belongs where the
       programme always sits: last of the calls, and still above General,
       which is not a call and closes the board. */
    var ib=-1;
    out.forEach(function(c,i){if(c.key==='__inbox__')ib=i;});
    if(ib>=0)out.splice(ib,0,copy); else out.push(copy);
    return out;
  }
  /* \u2500\u2500 One flag to a pole \u2500\u2500
     Horizon projects share deadlines constantly \u2014 every topic in a
     destination tends to close on the same day \u2014 and each of them draws
     its own line in its own row. Stacked, those lines read as one pole
     down the block, and before this each of them also carried its own
     flag: the same three words, four times, one under the other. Mark
     asked on 2026-09-09 for one.

     So the walls for the whole programme are collected in drawn order and
     a repeat of the same day AND the same name loses its tag. The name is
     half of the key on purpose: two dates on one day that say different
     things are not a repetition, and silencing the second would leave a
     row saying somebody else's date. The line always stays \u2014 it is what
     says the date crosses this project too.

     Collected once per render for the same reason the call walls are:
     the answer depends on every row, so no row can work it out alone. */
  function programmeWalls(lanes,startIso,days){
    var out={},seen={};
    (lanes||[]).forEach(function(c){
      if(c.key!==PROGRAMME_ID)return;
      c.projects.forEach(function(pr){
        var ws=projWallsInWindow(pr.p,startIso,days);
        ws.forEach(function(w){
          var k=w.i+'\u0000'+w.name;
          if(seen[k])w.flag=false; else seen[k]=1;
        });
        out[pr.p.id]=ws;
      });
    });
    return out;
  }
  function eachTodo(fn){
    collect().forEach(function(c){c.projects.forEach(function(pr){
      pr.todos.forEach(function(t){fn(t,pr.p,c);});});});
  }
  function unplannedCount(){var n=0;eachTodo(function(t){if(!t.dueDate)n++;});return n;}

  /* ── The walls ──
     A call's own hard dates, drawn down the board. The board is a picture
     of work against time, and the hardest dates in the work were the one
     thing not on it: they lived on the timeline face and in the beam, both
     of which are places you go to rather than places you plan in.

     A date that is a moment draws as a line. A date that is a window —
     "intention to submit, the 19th to the 23rd" — draws as a band, because
     that is what it is, and a line would be a lie about four of those
     days.

     The set is the beam's: every call carrying an active project, deduped,
     which is the same list as the chips above the board. `hard` is the
     marker's own flag, so a soft date stays off the grid.

     Each wall carries the open work still standing in its call. Not a
     judgement and not a rate — two facts, the way a day states its total
     and stops. The picture makes the point on its own: there is the work,
     and there is the wall. */
  function callOpenMinutes(){
    var per={};
    collect().forEach(function(c){
      if(c.key==='__inbox__')return;
      var m=0;
      c.projects.forEach(function(pr){pr.todos.forEach(function(t){m+=(+t.effort||0);});});
      per[c.key]=m;
    });
    return per;
  }
  function wallsInWindow(startIso,days){
    var out=[],seen={},mins=callOpenMinutes();
    activeProjects().forEach(function(p){
      if(!p.callId||seen[p.callId])return;
      seen[p.callId]=1;
      var c=calls[p.callId];if(!c)return;
      (c.markers||[]).forEach(function(m){
        if(!m.hard||!m.date||!isIsoDate(m.date))return;
        var a=dayIndex(m.date,startIso);
        var b=(m.endDate&&isIsoDate(m.endDate))?dayIndex(m.endDate,startIso):a;
        if(b<a)b=a;
        if(b<0||a>=days)return;                       // wholly outside the window
        out.push({i:Math.max(0,a),j:Math.min(days-1,b),ran:b>a,
          key:p.callId,name:m.name||'Key date',call:callName(c),
          /* The CALL's colour, never the marker's. A marker's `color` is a
             semantic key in this app — 'deadline', 'custom' — which the
             timeline maps to a look of its own, and 'deadline' happens to
             pass the colour test as a bare word, so a wall that trusted it
             drew with no background at all and looked like a bug in the
             layer. A wall means "this call's date" and takes that colour. */
          color:safeColor(callColorOf(c),'var(--gold2)'),
          mins:mins[p.callId]||0});
      });
    });
    out.forEach(function(w){
      var eff=w.mins?effortShort(w.mins):'';
      w.openTxt=eff;
      w.full=w.name+' \u2014 '+w.call+(eff?' \u00b7 '+eff+' of open work':'');
    });
    return out.sort(function(x,y){return x.i-y.i||(x.name<y.name?-1:1);});
  }
  /* \u2500\u2500 The programme's dates, on each project's own row \u2500\u2500
     The programme keeps no calendar of its own: every one of its projects
     is written for a different topic closing on a different day, which is
     why the timeline gives it a lane per project where a call gets one
     for all of them. A wall built for it out of `wallsInWindow` would
     therefore read as the whole block's date and cross three proposals it
     has nothing to do with \u2014 which is the mistake the walls came down off
     the top of the board to stop, one level further in. So a programme
     project's dates are drawn inside its own row, in the wall's own
     vocabulary: a line where the date falls, a flag naming it above.

     Openings are on this board the same as any call's are. The project
     CARD drops them, because there the question is what is being worked
     towards; the board is the window you plan in, and a topic opening
     inside it is a fact about that window.

     Its colour is the programme's, not the marker's, for the reason
     `wallsInWindow` gives \u2014 a marker's `color` is a semantic key here and
     'deadline' passes for a bare colour word. */
  function projWallsInWindow(p,startIso,days){
    var out=[],col=safeColor(projColor(p),'var(--gold2)');
    projectMarkers(p).forEach(function(m){
      if(!m.hard)return;
      var a=dayIndex(m.date,startIso);
      var b=(m.endDate&&isIsoDate(m.endDate))?dayIndex(m.endDate,startIso):a;
      if(b<a)b=a;
      if(b<0||a>=days)return;                       // wholly outside the window
      out.push({i:Math.max(0,a),j:Math.min(days-1,b),ran:b>a,
        name:m.name||'Key date',color:col,openTxt:'',
        full:(m.name||'Key date')+' \u2014 '+p.name});
    });
    return out.sort(function(x,y){return x.i-y.i||(x.name<y.name?-1:1);});
  }
  /* ── A call's walls, drawn on its own rows ──
     They stood over the whole board once, in a row of their own above the
     day letters, and were wrong twice over. Wrong in place: a key date
     belongs to one call, and drawn full height it crossed three others it
     has nothing to do with. And wrong in practice: every call's dates
     shared one row, so two dates a few days apart from two different calls
     had to fight for the same pixels, which is the overlapping Mark saw.

     Inside the call's own block neither happens. The line spans exactly
     the rows the date governs, and the only flags that can crowd are two
     of the same call's — which are days or weeks apart by their nature,
     and are given the room between them the same way.

     Under about six per cent of the window a flag has no room for a word,
     so it keeps its diamond and drops the text; the name is still on the
     title. Better a mark you can see and ask about than a word cut to
     three letters. */
  function callWallsHTML(call,walls,days,compact){
    return wallsLayerHTML((walls||[]).filter(function(w){return w.key===call.key;}),
      days,compact,'hz-call-walls');
  }
  /* One renderer for both, because a wall on a call's block and a wall on
     a programme project's row are the same drawing in a different box:
     the caller says which box by naming the layer's class, and each wall
     arrives carrying the sentence its own collector wants on the title.

     Every wall draws its line; only those still carrying `flag` draw a
     tag, and the tags space themselves against each OTHER rather than
     against the lines \u2014 a silenced wall between two flags is not a
     neighbour crowding either of them. See programmeWalls for who is
     silenced and why; a call's walls never set the field and so all of
     them are flagged, as they always were. */
  function wallsLayerHTML(mine,days,compact,layerCls){
    if(!mine.length)return '';
    var dayW=100/days;
    var flagged=mine.filter(function(w){return w.flag!==false;});
    var lines=mine.map(function(w){
      return w.ran
        ?'<span class="hz-wall hz-wall-band" data-col="'+esc(w.color)+'" '
          +'style="left:'+(w.i*dayW).toFixed(3)+'%;width:'
          +((w.j-w.i+1)*dayW).toFixed(3)+'%;--c:'+w.color+'"></span>'
        :'<span class="hz-wall" data-col="'+esc(w.color)+'" '
          +'style="left:'+(w.i*dayW).toFixed(3)+'%;--c:'+w.color+'"></span>';
    }).join('');
    var tags=flagged.map(function(w,n){
      var at=w.i*dayW;
      var right=(flagged[n+1]?flagged[n+1].i*dayW:100)-at;
      var left=at-(flagged[n-1]?flagged[n-1].i*dayW:0);
      var flip=at>82;
      var room=(flip?left:right)-1.5;
      var bare=room<6;
      var eff=w.openTxt||'';
      return '<span class="hz-wall-tag'+(flip?' flip':'')+(bare?' bare':'')+'" '
        +'data-col="'+esc(w.color)+'" '
        +'style="left:'+at.toFixed(3)+'%;max-width:'+Math.max(4,room).toFixed(3)+'%;'
        +'--c:'+w.color+'" title="'+esc(w.full||w.name)+'">'
        +'<span class="hz-wall-dia" aria-hidden="true"></span>'
        +(bare?'':'<span class="hz-wall-name">'+esc(w.name)+'</span>'
          +((eff&&!compact)?'<span class="hz-wall-open">'+esc(eff)+'</span>':''))
      +'</span>';
    }).join('');
    return '<span class="'+layerCls+'">'+lines+tags+'</span>';
  }

  /* ── The head ── */
  function weeksSelHTML(){
    return '<span class="hz-weeks-wrap">'
      +'<button type="button" class="opt-trigger" id="hz-weeks-btn" '
      +'aria-haspopup="listbox" aria-expanded="false" '
      +'aria-label="Horizon window length" onclick="PL.weeksMenu(event)">'
      +weeks+' weeks</button></span>';
  }
  function weeksMenu(evt){
    if(evt){evt.preventDefault();evt.stopPropagation();}
    Menu.open(byId('hz-weeks-btn'),
      WEEK_OPTS.map(function(w){
        return '<button type="button" role="option" class="opt-item'+(w===weeks?' sel':'')+'" '
          +'aria-selected="'+(w===weeks?'true':'false')+'" '
          +'onclick="PL.setWeeks('+w+')">'+w+' weeks</button>';
      }).join(''),
      {id:'hz-weeks-menu',cls:'opt-menu',align:'right',role:'listbox'});
  }
  function setWeeks(v){Menu.close();weeks=parseInt(v,10)||3;renderHorizon();}

  function axisHTML(startIso,days){
    var DOW=['MO','TU','WE','TH','FR','SA','SU'];
    var todayIso=isoToday(),dayW=100/days,h='',months='',seps='';
    /* The reserved corner as a percentage of the track, so the collision
       test works at any window length. In compact mode the track is the
       pane width, not days×DAY_W, so measure the live element when there
       is one and fall back to the nominal width on first paint. Half a
       label's width is added because the position is the label's CENTRE. */
    var trackEl=q('#horizon-container .hz-head-track');
    var trackPx=(trackEl&&trackEl.offsetWidth)||(days*DAY_W);
    var reservedPct=Math.min(40,((WEEKS_W+MONTH_HALF_W)/trackPx)*100);
    var runStart=0,runMonth=new Date(startIso+'T00:00:00').getMonth();
    for(var j=1;j<=days;j++){
      var mj=j<days?new Date(addDays(startIso,j)+'T00:00:00').getMonth():-1;
      if(mj!==runMonth){
        var d0=new Date(addDays(startIso,runStart)+'T00:00:00');
        var midPct=((runStart+j)/2)*dayW;
        var tucked=midPct>(100-reservedPct);
        months+='<span class="hz-month'+(tucked?' hz-month-tucked':'')+'" '
          +'style="left:'+midPct.toFixed(3)+'%">'
          +MONTHS[d0.getMonth()]+(d0.getMonth()===0?' '+d0.getFullYear():'')+'</span>';
        if(j<days)seps+='<span class="hz-month-sep" style="left:'+(j*dayW).toFixed(3)+'%"></span>';
        runStart=j;runMonth=mj;
      }
    }
    for(var i=0;i<days;i++){
      var iso=addDays(startIso,i);
      var d=new Date(iso+'T00:00:00');
      var cls=(iso===todayIso)?' today':(iso<todayIso?' past':'');
      h+='<button type="button" class="hz-day-lbl'+cls+'" '
        +'style="left:'+((i+0.5)*dayW).toFixed(3)+'%" data-iso="'+iso+'" '
        +'title="Show everything planned for this day" '
        +'onclick="PL.dayClick(\''+iso+'\',event)">'
        +'<span class="dow">'+DOW[(d.getDay()+6)%7]+'</span>'
        +'<span class="dom">'+d.getDate()+'</span></button>';
    }
    return '<div class="hz-months">'
        +'<div class="hz-months-seps">'+seps+'</div>'
        +'<div class="hz-months-labels">'+months+'</div>'
      +'</div><div class="hz-axis">'+h+'</div>';
  }

  function gridHTML(startIso,days){
    var dayW=100/days,todayIso=isoToday(),h='';
    for(var i=0;i<days;i++){
      var iso=addDays(startIso,i);
      var wd=(new Date(iso+'T00:00:00').getDay()+6)%7;
      if(wd>=5)h+='<div class="hz-col-weekend" style="left:'+(i*dayW).toFixed(3)+'%;width:'+dayW.toFixed(3)+'%"></div>';
      if(iso<todayIso)h+='<div class="hz-col-past" style="left:'+(i*dayW).toFixed(3)+'%;width:'+dayW.toFixed(3)+'%"></div>';
    }
    /* Day rules are one repeating gradient — faint enough that half a
       pixel of rounding is invisible. Week rules are not: at 42 days a
       repeating period lands successive lines on .667/.333/.000 and the
       browser snaps each differently, so some render 1px and some 2. Each
       is drawn individually against a track snapped to a whole multiple
       of the day count, so every one rasterises alike. */
    var lines='<div class="hz-grid-lines hz-grid-lines-day" style="background-size:'
      +(100/days).toFixed(6)+'% 100%"></div>';
    for(var wk=7;wk<days;wk+=7)
      lines+='<div class="hz-week-rule" style="left:'+((wk/days)*100).toFixed(4)+'%"></div>';
    h=lines+h;
    var ti=dayIndex(todayIso,startIso);
    if(ti>=0&&ti<days)
      h+='<div class="hz-today-line" style="left:'+((ti+0.5)*dayW).toFixed(3)+'%"></div>';
    return '<div class="hz-grid-bg">'+h+'</div>';
  }

  /* ── Lanes ── */

  /* Several todos of one project planned for one day.
     They used to be nudged 7px further down the lane each — which reads as
     one dot smeared at three, leaves the 44px lane at four, and lands in
     the row below at five. So a day's dots make a shape instead: two lie
     flat, three make a triangle, four a square, five a pentagon, six a
     hexagon. Past six one sits in the middle and the rest ring it, which
     is how a seventh circle packs around six anyway.

     The ring grows and the dots shrink together, so that the whole cluster
     is never wider than 27px — the narrowest a day column ever gets, at
     six weeks with the name gutter surrendered. That is the only number
     here that is not free: a cluster wider than its column would put a
     Tuesday's dots over Wednesday.

     `r` is the ring in px, `d` how big a dot in it may be without touching
     its neighbour. Indexed by how many share the day. */
  var CLUSTER=[null,null,           /* 0 and 1 never ask: one todo sits dead centre */
    {r:6.5,d:11},{r:7.5,d:10.5},{r:8,d:10},{r:9,d:9},{r:9,d:8}];
  var CLUSTER_R=9.5;                /* the ring everything past six rides on */
  var MARK_D=13;                    /* one dot alone, the size the board has always drawn */

  function clusterAt(i,n){
    if(n<2)return {x:0,y:0,d:MARK_D};
    var mid=(n>6),k=mid?n-1:n;
    var spec=mid
      ?{r:CLUSTER_R,d:Math.max(5,Math.min(8,2*CLUSTER_R*Math.sin(Math.PI/k)*0.9))}
      :CLUSTER[n];
    if(mid&&i===0)return {x:0,y:0,d:spec.d};
    /* Where the first corner sits. Odd counts point up so the shape reads
       as a triangle or a pentagon rather than as one lying on its side;
       four turns to a square; two simply lies flat. */
    var j=mid?i-1:i;
    var a=((k===2?0:(k===4?-45:-90))+j*360/k)*Math.PI/180;
    return {x:spec.r*Math.cos(a),y:spec.r*Math.sin(a),d:spec.d};
  }
  /* `left` carries the day as a per-cent of the track and the corner as
     px, because a day column is a fraction of a width that changes with
     the window while the shape drawn in it is not. `d` is 0 for a mark
     drawn at its ordinary size, so the stylesheet keeps its own default.

     The sign is written out rather than left to the number: `calc(50% +
     -6px)` is not valid CSS and fails silently, taking the whole rule and
     the marker's colour with it. */
  function markStyle(idx,dayW,c,d,col){
    var at=((idx+0.5)*dayW).toFixed(3)+'%';
    return 'left:'+(c.x?'calc('+at+(c.x<0?' - ':' + ')+Math.abs(c.x).toFixed(2)+'px)':at)+';'
      +(c.y?'margin-top:'+c.y.toFixed(2)+'px;':'')
      +(d?'--dot:'+d.toFixed(2)+'px;':'')
      +'--c:'+col;
  }

  function projRowHTML(pr,call,startIso,days,flat,compact,pwalls){
    var dayW=100/days,marks='';
    /* Two passes, because where a dot sits in its day depends on how many
       share that day — which is not known until every todo has been read.
       The first pass only counts and remembers; the second draws. */
    var dueN={},dlN={},plan=[];
    pr.todos.forEach(function(t){
      var dueIdx=t.dueDate?dayIndex(t.dueDate,startIso):-1;
      var dlIdx=t.deadline?dayIndex(t.deadline,startIso):-1;
      /* A date from before this Monday is parked in the first hatched
         column rather than dropped. The window starts on Monday, so a todo
         that fell due last Friday used to vanish from the board entirely,
         late and open and nowhere to be seen; Mark asked for the late work
         to sit on the greyed-out days instead. Only an open todo reaches
         this row, so anything dated before the window is by definition
         late. On a Monday there are no hatched days and the first column
         is today, where the late ones keep their red ring. */
      if(t.dueDate&&dueIdx<0)dueIdx=0;
      if(t.deadline&&dlIdx<0)dlIdx=0;
      var o={t:t,due:-1,dl:-1};
      if(t.dueDate&&dueIdx>=0&&dueIdx<days){o.due=dueIdx;dueN[dueIdx]=(dueN[dueIdx]||0)+1;}
      if(t.deadline&&dlIdx>=0&&dlIdx<days){o.dl=dlIdx;dlN[dlIdx]=(dlN[dlIdx]||0)+1;}
      plan.push(o);
    });
    var dueSeen={},dlSeen={};
    plan.forEach(function(o){
      var t=o.t;
      /* ── A mark is its category's colour, and it is born that way ──
         The board used to be painted in the calls and swap to the
         categories for as long as a day was open. The swap is gone: Mark
         asked for the category colours to be on the board permanently,
         and a palette that changes under you is the thing he was asking
         to stop, however well the mode was argued.
         So the colour is written once, here, out of the todo's own
         category — not applied afterwards over a call colour, which is
         why `applyPalette` and the `data-cat` it read are gone with it.
         `data-col` is now that same category colour, which is what the
         ghost carried behind a dragged mark wants anyway; it used to
         disagree with the board for the length of every drag over an open
         day. A category nobody has set keeps the quiet grey.
         The calls have not lost the board. They still own the rails down
         the left of each block, the walls across their own rows and the
         chips in the beam — structure, in one colour, with the marks
         inside it saying what kind of work each one is. Two palettes, one
         meaning each, and neither of them moves any more. */
      var col=catLabel(t.category)?safeColor(catColor(t.category)):'#6d6047';
      /* The runway joins the planned date to the hard deadline when both
         are in the window. It stays on the rail whatever the dots do: a
         faint line from one day to another, not from one dot to another. */
      if(o.due>=0&&o.dl>=0&&t.deadline>t.dueDate){
        var a=(o.due+0.5)*dayW,b=(o.dl+0.5)*dayW;
        marks+='<div class="hz-runway" data-col="'+esc(col)+'" '
          +'style="left:'+a.toFixed(3)+'%;width:'
          +Math.max(0.3,b-a).toFixed(3)+'%;--c:'+col+'"></div>';
      }
      var payload=' data-pid="'+esc(pr.p.id)+'" data-eid="'+esc(t.id)+'"'
        +' data-txt="'+esc(t.text)+'" data-col="'+esc(col)+'"'
        +' data-eff="'+esc(effortShort(t.effort)||'')+'"';
      if(o.due>=0){
        var nd=dueN[o.due],c=clusterAt(dueSeen[o.due]||0,nd);
        dueSeen[o.due]=(dueSeen[o.due]||0)+1;
        /* A dot says when, and whether it is late. It used to say two more
           things — half-tinted for a checklist part done, a star overhead
           for the item marked for this date — and at thirteen pixels, over
           a hatched column, neither could be read without being told it was
           there. The checklist says both properly on the open card. */
        var cls='hz-mark'+(t.dueDate<isoToday()?' overdue-mark':'')+(nd>1?' hz-clus':'');
        marks+='<button class="'+cls+'" style="'+markStyle(o.due,dayW,c,(nd>1?c.d:0),col)+'"'
          +payload+' data-kind="due" aria-label="'+esc(t.text)+'" '
          +'onclick="PL.markClick(this,event)"></button>';
      }
      if(o.dl>=0){
        var nl=dlN[o.dl],k=clusterAt(dlSeen[o.dl]||0,nl);
        dlSeen[o.dl]=(dlSeen[o.dl]||0)+1;
        /* The diamond is the smaller mark and clusters on the same ring;
           its own size trails the dot's, because a diamond is drawn on its
           corner and so needs its diagonal to fit where a circle fits. */
        var dld=Math.max(5,k.d-4);
        var urgent=daysUntil(t.deadline)<=6;
        marks+='<button class="hz-dl'+(urgent?' dl-urgent':'')+(nl>1?' hz-clus':'')+'" '
          +'style="'+markStyle(o.dl,dayW,k,(nl>1?dld:0),col)+'"'
          +payload+' data-kind="dl" aria-label="'+esc('Deadline: '+t.text)+'" '
          +'onclick="PL.markClick(this,event)"></button>';
      }
    });
    /* The rail lives inside the track, so it and the markers share one box
       and one 50% centre — no chance of drifting apart when row heights
       or padding change. */
    var track='<span class="hz-proj-track" data-days="'+days+'" data-start="'+startIso+'">'
      +'<span class="hz-proj-rail"></span>'+marks+'</span>';
    if(flat)return track;

    /* This project's own key dates, which only a programme project has —
       see projWallsInWindow. Unlike a call's block this row reserves no
       strip for the flag: Mark asked on 2026-09-09 for these lanes to be
       the same height as every other one, and a row is a single lane, so
       the flag can only ever meet its OWN dots and only when the date and
       a planned day fall in the same column. It sits at the row's top
       edge, which puts it a pixel or two into a dot at worst, where a
       call's flag stood over four rows' worth and had to be lifted clear.

       They arrive already collected, because which of them carries a flag
       is a question about every programme row at once \u2014 see
       programmeWalls. Falling back to this project's own is what keeps a
       flat call and a stray caller drawing something sane. */
    var wallsHtml=wallsLayerHTML(
      (pwalls&&pwalls[pr.p.id])||projWallsInWindow(pr.p,startIso,days),
      days,compact,'hz-proj-walls');

    /* The name goes to the project's own card, not to its contribution
       tracker. The tracker was one press from the board here and nowhere
       else, which made the name on a lane the odd one out: everywhere
       else in the room a project's name is the way to the card, and the
       tracker is reached from the card's own band. Mark asked for the two
       to agree. The button keeps `hz-proj-open`, because the lane's own
       click handler reads that class to tell a press on the name from a
       press on empty lane space, and the search palette anchors the
       tracker's opening animation on it.

       It lands on the card with the dossier still shut — the `false`
       below. Crossing the board to a project is a step out of one room's
       worth of work into another, and arriving with a drawer of rows and
       notes already out is an answer to a question nobody asked here. The
       chevron on the card opens it in one press when it IS wanted. */
    var name=pr.p.name;
    var nameBtn='<button type="button" class="'+(compact?'hz-tag':'hz-proj-name')+' hz-proj-open" '
      +'data-pid="'+esc(pr.p.id)+'" '
      +'title="'+esc(name)+' \u2014 open the project card" '
      +'onclick="PL.openProject(\''+esc(pr.p.id)+'\',false);event.stopPropagation()">'
      +(compact?esc(name):'<span class="hz-proj-label">'+esc(name)+'</span>')+'</button>';
    return '<div class="hz-proj hz-proj-click" role="button" tabindex="0" '
      +'title="Show every todo in this project" '
      +'data-pid="'+esc(pr.p.id)+'" onclick="PL.projRowClick(this,event)">'
      +wallsHtml+nameBtn+track+'</div>';
  }

  function railHTML(call){
    return '<div class="hz-rail" role="button" tabindex="0" '
      +'data-call-key="'+esc(call.key)+'" data-call-label="'+esc(call.label)+'" '
      +'aria-label="'+esc(call.label)+' \u2014 show every todo in this call" '
      +'title="'+esc(call.label)+' \u2014 show every todo in this call" '
      +'onclick="PL.callElClick(this,event)"></div>';
  }

  function callHTML(call,startIso,days,laneIdx,compact,walls,pwalls){
    var style=' style="--c:'+safeColor(call.color)+';animation-delay:'+(laneIdx*55)+'ms"';
    var wallsHtml=callWallsHTML(call,walls,days,compact);
    /* The strip the flags stand in is only reserved on a call that has
       one in the window, so a call with no key date in view keeps the row
       rhythm it always had. */
    var wcls=wallsHtml?' hz-call-walled':'';
    /* A flat call ("General") has exactly one implicit project, so a
       header row above an unnamed lane would read as two rows. Its colour
       edge and its markers share the one line. */
    if(call.flat){
      var track=projRowHTML(call.projects[0],call,startIso,days,true,compact,pwalls);
      return '<div class="hz-call"'+style+'>'
        +railHTML(call)
        +'<div class="hz-call-body'+wcls+'">'+wallsHtml
          +'<div class="hz-proj hz-proj-flat hz-proj-click" role="button" tabindex="0" '
            +'data-call-key="'+esc(call.key)+'" data-call-label="'+esc(call.label)+'" '
            +'title="Show every todo in this call" onclick="PL.callElClick(this,event)">'
            +(compact?'<span class="hz-tag">'+esc(call.label)+'</span>'
                     :'<span class="hz-proj-name"><span class="hz-proj-label">'
                      +esc(call.label)+'</span></span>')
            +track
          +'</div>'
        +'</div></div>';
    }
    return '<div class="hz-call"'+style+'>'
      +railHTML(call)
      +'<div class="hz-call-body'+wcls+'">'+wallsHtml
        +call.projects.map(function(pr){
          return projRowHTML(pr,call,startIso,days,false,compact,pwalls);}).join('')
      +'</div></div>';
  }

  /* ── The leads line ──
     Semaphore's open leads, as the last line on the board — see THE LEADS
     LINE for what a lead is here and where it lives. It is drawn as a flat
     lane, like General: one line, its own edge, no header row above it.

     A lead with a day to come back sits on that day as a dot, in the line's
     one colour, and one from before this Monday is parked in the first
     column with the overdue ring, exactly as a late todo is. A lead with no
     day yet has nowhere on the grid to stand, so the line counts them in a
     small box beside its own name — Mark asked for that box there rather
     than in the effort strip's Unplanned, which counts todos and only
     todos.

     The dots are `hz-mark`s and are dragged to another day the way a todo's
     are; the drop moves the lead's day in the Semaphore (see dragEnd). The
     hover label passes over the line — it reads todos — so each dot carries
     its own title. Each dot is its arena type's colour (Mark, 2026-10-11), so a
     week of leads can be read by type without hovering; the lane's own
     edge stays the section's stone. */
  function leadsLaneHTML(startIso,days,compact,laneIdx){
    var all=Leads.list();
    /* Drawn with no leads at all as long as one can be started from it —
       the line's name is the way to the first one. */
    if(!all.length&&!Leads.canAdd())return '';
    var dayW=100/days,col=Leads.COLOR,today=isoToday();
    var n={},seen={},plan=[],undated=0;
    all.forEach(function(l){
      if(!l.due){undated++;return;}
      var i=dayIndex(l.due,startIso);
      if(i<0)i=0;
      if(i>=days)return;
      n[i]=(n[i]||0)+1;plan.push({l:l,i:i});
    });
    var marks=plan.map(function(o){
      var k=n[o.i],c=clusterAt(seen[o.i]||0,k);
      seen[o.i]=(seen[o.i]||0)+1;
      var key=Leads.keyOf(o.l),hex=Leads.hexOf(o.l);
      return '<button class="hz-mark hz-lead-mark'+(o.l.due<today?' overdue-mark':'')
        +(k>1?' hz-clus':'')+'" style="'+markStyle(o.i,dayW,c,(k>1?c.d:0),hex)+'" '
        +'data-lead="'+esc(key)+'" data-col="'+hex+'" '
        +'title="'+esc(o.l.name+' — '+o.l.arena+' — drag to another day')+'" aria-label="'+esc('Lead: '+o.l.name)+'" '
        +'onclick="PL.leadMarkClick(this,event)"></button>';
    }).join('');
    var un=undated
      ?'<button type="button" class="hz-leads-undated'
        +((open&&open.leads==='undated')?' active':'')+'" '
        +'title="'+undated+' lead'+(undated===1?'':'s')+' with no day to come back — show them" '
        +'aria-label="'+undated+' unplanned lead'+(undated===1?'':'s')+'" '
        +'onclick="PL.leadsUndatedClick(event)">'+undated+'</button>'
      :'';
    /* The name starts a new lead, the way a project's name is the way to
       that project: Mark asked for it there (2026-10-06). The empty lane
       beside it still lists them all. */
    var newOn=open&&open.leads==='new';
    var nameBtn=function(cls,inner){
      return '<button type="button" class="'+cls+' hz-proj-open hz-leads-new'+(newOn?' active':'')+'" '
        +'title="Leads — start a new one" onclick="PL.leadsNewClick(event)">'+inner+'</button>';
    };
    var name=compact
      ?nameBtn('hz-tag','Leads +')+(un?'<span class="hz-leads-undated-at">'+un+'</span>':'')
      :'<span class="hz-proj-name">'+nameBtn('hz-leads-name','<span class="hz-proj-label">Leads</span>'
          +'<span class="hz-leads-plus" aria-hidden="true">+</span>')+un+'</span>';
    return '<div class="hz-call hz-call-leads" style="--c:'+col
        +';animation-delay:'+(laneIdx*55)+'ms">'
      +'<div class="hz-rail" role="button" tabindex="0" '
        +'aria-label="Leads — show every open lead" title="Leads — show every open lead" '
        +'onclick="PL.leadsClick(event)"></div>'
      +'<div class="hz-call-body">'
        +'<div class="hz-proj hz-proj-flat hz-proj-click hz-leads-row" role="button" tabindex="0" '
          +'title="Show every open lead" onclick="PL.leadsClick(event)">'
          +name
          +'<span class="hz-proj-track" data-days="'+days+'" data-start="'+startIso+'">'
            +'<span class="hz-proj-rail"></span>'+marks+'</span>'
        +'</div>'
      +'</div></div>';
  }

  /* ── The effort strip ──
     What the days above actually cost. The board says how many things
     land on a Tuesday; it could never say whether that is a Tuesday you
     can survive. Each todo carries an estimate now, and this adds them up
     under the column they were planned into.

     It stands where the call legend used to. The legend printed every
     call name in its own colour beneath the grid, which is exactly what
     the beam above the board already does — the same row said twice, once
     at each end. This says something the board could not.

     The bar is measured against a working day, always, and stops there.
     Scaling to the busiest day on screen was the obvious thing and the
     wrong one twice over: a week of one-hour days would draw itself full,
     and one twelve-hour Thursday would flatten every other day in the
     window into a stub. A full bar means a full day. Past that the bar has
     nothing left to say, so the colour says it instead. */
  function effortHTML(startIso,days){
    var dayW=100/days,todayIso=isoToday();
    var per={},anyEffort=false,unplannedMins=0;
    eachTodo(function(t){
      var m=+t.effort||0;
      if(m)anyEffort=true;
      if(!t.dueDate){unplannedMins+=m;return;}
      if(!m)return;
      var i=dayIndex(t.dueDate,startIso);
      if(i<0||i>=days)return;
      per[i]=(per[i]||0)+m;
    });
    var cells='';
    for(var i=0;i<days;i++){
      var m=per[i]||0;
      if(!m)continue;                       // an empty day says nothing
      var iso=addDays(startIso,i);
      var h=Math.max(3,Math.round(Math.min(1,m/480)*20));
      cells+='<button type="button" class="hz-eff'+(m>480?' hz-eff-over':'')
        +(iso===todayIso?' today':(iso<todayIso?' past':''))+'" '
        +'style="left:'+(i*dayW).toFixed(3)+'%;width:'+dayW.toFixed(3)+'%" '
        +'data-iso="'+esc(iso)+'" '
        +'title="'+esc(minutesLong(m))+' planned \u2014 show everything on this day" '
        +'onclick="PL.dayClick(\''+iso+'\',event)">'
        +'<span class="hz-eff-num">'+esc(effortShort(m))+'</span>'
        +'<span class="hz-eff-bar" style="height:'+h+'px"></span>'
      +'</button>';
    }
    /* Todos with no planned date are effort with nowhere to sit, so they
       belong to this row rather than to the grid. This is also the only
       way into that slice, which is why it survives the legend. */
    var n=unplannedCount();
    var unplanned=n
      ?'<button type="button" class="hz-eff-unplanned'
        +((open&&open.unplanned)?' active':'')+'" '
        +'title="'+n+' todo'+(n===1?'':'s')+' with no planned date'
          +(unplannedMins?' \u2014 '+esc(minutesLong(unplannedMins)):'')
          +' \u2014 show them" onclick="PL.unplannedClick(event)">'
        +'<span class="hz-eff-unplanned-dot" aria-hidden="true"></span>'
        +'<span>Unplanned</span><b>'+n+'</b></button>'
      :'';
    return '<div class="hz-effort" aria-label="Effort planned per day">'
      +'<div class="hz-effort-gutter">Effort</div>'
      +'<div class="hz-effort-track">'+cells
        +(anyEffort?'':'<span class="hz-eff-hint">Give a todo an effort and its days add up here</span>')
      +'</div>'+unplanned
    +'</div>';
  }

  /* ── Rendering ── */
  /* ── Redrawing in place ──
     The board is rebuilt from nothing on every change, and for the instant
     between the old one coming out and the new one going in the page is
     only as tall as the beam. The browser clamps the room's scroll to that
     — to the top — and the new board arrives under a view that has already
     gone. Mark found it pressing a lead's ruit and ticking a todo done
     (2026-10-06): the page leapt to the top and stayed there. So the room's
     scroll is read before, the container is held at its old height while
     the new board goes in, and the scroll is put back — at `auto`, because
     the room is `scroll-behavior:smooth` and would otherwise ease there
     from the top (see the animation notes on that trap).

     And a redraw is not an arrival. The lanes, the dots and the cards in
     the list all play an entrance, which is right the first time the board
     is drawn and when a slice is opened, and was a flicker of the whole
     board on every press after that. Once the board has been on screen a
     moment it carries `hz-drawn`, which stands those entrances down; a
     slice keeps its cards' entrance only when it is a different slice
     from the one drawn last. */
  var lastSlice=null;
  function renderHorizon(){
    var el=byId('horizon-container');if(!el)return;
    var room=el.closest&&el.closest('.pane');
    var top=room?room.scrollTop:0;
    if(top>0)el.style.minHeight=el.offsetHeight+'px';
    var slice=open?JSON.stringify(open,function(k,v){return k==='expanded'?undefined:v;}):null;
    var same=(slice!==null&&slice===lastSlice);
    lastSlice=slice;
    renderHorizonNow();
    var pane=byId('hz-detail');
    if(pane&&same)pane.classList.add('hz-same');
    if(!el._drawnSoon){el._drawnSoon=true;setTimeout(function(){el.classList.add('hz-drawn');},900);}
    if(top>0&&room){
      var put=function(){
        var sb=room.style.scrollBehavior;room.style.scrollBehavior='auto';
        room.scrollTop=top;room.style.scrollBehavior=sb;
      };
      put();
      /* the pin comes off once the new board has its own height — after
         fitFlipSoon's two frames — and the scroll is put back once more in
         case the board came out shorter and the browser clamped it */
      requestAnimationFrame(function(){requestAnimationFrame(function(){requestAnimationFrame(function(){
        el.style.minHeight='';put();});});});
    }
  }
  function renderHorizonNow(){
    var el=byId('horizon-container');if(!el)return;
    hideHover();
    Menu.close();               // menus live on body and would be orphaned
    cancelFaceSwap();

    var startIso=mondayIso(),days=weeks*7;
    var compact=days>=COMPACT_FROM;
    var lanes=withProgrammeDates(collect(),startIso,days);
    var walls=wallsInWindow(startIso,days);
    var pwalls=programmeWalls(lanes,startIso,days);
    var leadsLane=leadsLaneHTML(startIso,days,compact,lanes.length);
    var board;
    if(!lanes.length&&!leadsLane){
      board='<div class="empty" style="margin-top:2rem">No open todos anywhere \u2014 the horizon is clear.</div>';
    } else {
      board='<div class="hz-scroll'+(compact?' hz-compact':'')+'">'
        /* how long the window is; the stylesheet turns it into a width */
        +'<div class="hz-wrap" style="--hz-days:'+days+'">'
        +'<div class="hz-head">'
          +'<div class="hz-head-gutter">'
            /* The corner above the name column carried nothing. It turns
               the board over now — the one control belonging to the sheet
               rather than to either face. */
            +'<div class="hz-head-gutter-months">'+flipBtnHTML('timeline')+'</div>'
            +'<div class="hz-head-gutter-axis"></div>'
          +'</div>'
          +'<div class="hz-head-track">'+axisHTML(startIso,days)+'</div>'
          +weeksSelHTML()
        +'</div>'
        +'<div class="hz-lanes">'
          +'<div class="hz-grid-layer"><div class="hz-grid-track">'+gridHTML(startIso,days)+'</div></div>'
          +lanes.map(function(c,i){
            return callHTML(c,startIso,days,i,compact,walls,pwalls);}).join('')
          +leadsLane
        +'</div>'
        +effortHTML(startIso,days)
      +'</div></div>';
    }
    var faceCls=(face==='timeline')?' flipped showing-back':'';
    el.innerHTML='<div class="hz-flip'+faceCls+'" id="hz-flip">'
        +'<div class="hz-flip-inner" id="hz-flip-inner">'
          +'<div class="hz-face hz-face-front" id="hz-face-board">'+board+'</div>'
          +'<div class="hz-face hz-face-back" id="hz-face-time">'
            +(face==='timeline'?Timeline.faceHTML():'')+'</div>'
        +'</div></div>'
      +'<div id="hz-agenda" class="hz-agenda"></div>'
      +'<div id="hz-detail" class="hz-detail"></div>';

    bindBoard();
    snapTrack();      // integer column widths → uniform grid lines
    fitRails();       // each row's dots start just past its own name
    renderDetail();   // keep any open card in step with the board
    renderAgenda();
    fitFlip();fitFlipSoon();
  }

  /* One refresh for the whole board: the beam, plus whichever face the
     stage is showing — an anchored call's card, or the horizon itself. */
  function render(){
    Beam.render();
    if(Nav.anchor()){CallCard.render();return;}
    renderHorizon();
  }

  /* Round the track down to a whole multiple of the day count, so every
     column boundary lands on an integer pixel.

     The old guard here — "only shrink when the snapped width fits the
     pane" — could not fail: `snapped` is built out of `scroll.clientWidth`
     and so is never larger than it. Every board was therefore snapped down
     to the pane, including the ones the width rule above had deliberately
     made wider than it, and at the narrow end that squeezed three weeks
     into 13px a column and ran the day letters into each other.

     The real question is the one the width rule already asks: does a day
     still get its minimum column? If it does the board is meant to fit and
     snapping only tidies the rounding; if it does not, the board is meant
     to scroll and its natural width is left alone. */
  function snapTrack(){
    var wrap=q('#horizon-container .hz-wrap'),scroll=q('#horizon-container .hz-scroll');
    if(!wrap||!scroll)return;
    var days=weeks*7;
    var probe=q('.hz-proj-track',wrap)||q('.hz-head-track',wrap);
    if(!probe)return;
    var gutter=wrap.getBoundingClientRect().width-probe.getBoundingClientRect().width;
    var avail=scroll.clientWidth-gutter;
    var per=Math.floor(avail/days);
    if(per<DAY_W){wrap.style.removeProperty('width');return;}
    wrap.style.width=(per*days+gutter)+'px';
  }

  /* Per-row rail start: measure how wide each project name actually
     renders and begin that row's dotted line just past it, so the dots
     connect to the text rather than all rows sharing one compromise. */
  function fitRails(){
    var wrap=q('#horizon-container .hz-wrap');
    if(!wrap||wrap.closest('.hz-compact'))return;
    /* Measure every row, then write every row: interleaving makes each
       read flush the previous write, so a board with N calls would pay
       for N forced reflows on every render. */
    var jobs=[];
    qa('.hz-proj',wrap).forEach(function(row){
      var name=q('.hz-proj-name',row),track=q('.hz-proj-track',row);
      if(!name||!track)return;
      var cs=getComputedStyle(name);
      var pad=parseFloat(cs.paddingLeft)||0,padR=parseFloat(cs.paddingRight)||0;
      var textW;
      /* Range over the text node: scrollWidth would include the cell's
         own padding and double-count it below. */
      try{
        var rng=document.createRange();rng.selectNodeContents(name);
        textW=rng.getBoundingClientRect().width;
      }catch(e){textW=0;}
      if(!textW)textW=name.scrollWidth-pad-padR;
      textW=Math.max(0,Math.min(textW,name.clientWidth-pad-padR));
      var gap=parseFloat(getComputedStyle(track).getPropertyValue('--hz-rail-gap'))||6;
      jobs.push([track,Math.max(0,pad+textW+gap)]);
    });
    jobs.forEach(function(j){j[0].style.setProperty('--hz-rail-reach',j[1]+'px');});
  }

  /* ── The hover label ── */
  function hoverEl(){
    var p=byId('hz-hover');
    if(!p){
      p=document.createElement('div');
      p.id='hz-hover';p.className='hz-lbl hz-lbl-float';
      document.body.appendChild(p);
    }
    return p;
  }
  /* The label used to say only which todo a dot was. It now says what kind
     of work it is and how long it is meant to take as well — the two
     things the card would tell you, on the one surface that can answer
     without opening anything. A desk has hover and an iPad has not, so
     nothing lives here that a tap does not also reach: tapping a dot opens
     the card, and tapping the lane opens the project's list.

     What it labels is a CELL and not a dot: one project's row where it
     crosses one day's column, and everything in it. A day's todos in one
     project are drawn as a shape rather than a stack, so hovering the
     shape and being told about whichever of the five circles the pointer
     happened to land on was the one thing the label could not usefully
     say. It is also why the pointer no longer has to find a dot at all —
     anywhere in the cell will do, which at 27px a column is the difference
     between a label you can call up and one you have to aim at. */
  var hoverCell=null;               // 'pid|iso', so a mousemove that has not left the cell costs nothing
  var HOVER_MAX=9;                  // past this the label is taller than it is worth

  /* One line per todo, in three columns that line up down the label: what
     kind it is, how long it takes, and what it is. It was two lines each
     with a rule between them and the category shouted in small caps over
     every title — five todos of that is a paragraph, and a thing you read
     by hovering has to be taken in at a glance or it is not worth the
     hover.

     The mark in the first column is the board's own mark shrunk: a circle
     for work planned into the day, a diamond for a deadline landing on it,
     in the category's colour. The board draws exactly those two shapes for
     exactly those two things, so the label needs no key and no word — it
     is the dots you are pointing at, listed.

     The columns do the separating. Rules between rows were the heaviest
     thing in the old label and they were separating things that a shared
     left edge and a shared baseline had already separated. */
  function cellHTML(list,iso){
    var shown=list.slice(0,HOVER_MAX),over=list.length-shown.length;
    return shown.map(function(o){
      var col=catLabel(o.e.category)?catColor(o.e.category):'#6d6047';
      /* A mark parked in the first column from an earlier date says which
         date, since the head above names the column and not the todo. */
      var was=o.kind==='dl'?o.e.deadline:o.e.dueDate;
      var late='';
      if(iso&&was&&was<iso){
        var wd=new Date(was+'T00:00:00');
        late='<span class="hz-lbl-late">'+(o.kind==='dl'?'deadline ':'planned ')
          +wd.getDate()+' '+MON3[wd.getMonth()]+'</span>';
      }
      return '<span class="hz-lbl-row">'
        +'<span class="hz-lbl-dot'+(o.kind==='dl'?' dl':'')+'" '
          +'data-pid="'+esc(o.p.id)+'" data-eid="'+esc(o.e.id)+'" '
          +'data-kind="'+esc(o.kind)+'" '
          +'style="--c:'+safeColor(col)+'"></span>'
        +'<span class="hz-lbl-eff">'+esc(effortShort(o.e.effort)||'\u2013')+'</span>'
        +'<span class="hz-lbl-txt">'+esc(o.e.text)+late+'</span>'
      +'</span>';
    }).join('')
    +(over?'<span class="hz-lbl-more">and '+over+' more</span>':'');
  }
  /* Everything of one project that touches one day: what is planned into
     it, and what is only due on it because a deadline lands there. The
     second sort is by effort, matching the day slice a click opens, so
     the label reads in the order the list will.
     The window's first column also holds whatever the board parked there
     from before the window began, so `startIso` is passed to say which
     column that is. */
  function todosInCell(pid,iso,startIso){
    var out=[],first=(iso===startIso);
    eachTodo(function(t,p){
      if(p.id!==pid)return;
      if(t.dueDate===iso||(first&&t.dueDate&&t.dueDate<iso))out.push({p:p,e:t,kind:'due'});
      else if(t.deadline===iso||(first&&t.deadline&&t.deadline<iso))out.push({p:p,e:t,kind:'dl'});
    });
    return byEffortDesc(out);
  }
  /* ── The dots coming forward ──
     The label's first column is the board's own marks at label size, and
     this is the sentence that says so out loud: on opening, each of those
     dots is put back on top of the board mark it stands for, wearing that
     mark's colour and that mark's size, and then let go. They travel up
     into the label, line up in its column, shrink to label size and take
     their category's colour on the way; the rest of each row fades in
     behind them once they are nearly home.

     The board marks themselves are hidden for the flight, which is what
     makes it read as the dots MOVING rather than as a second set of dots
     appearing. `flown` is the list to put back — on the next cell, on
     leaving the board, and after the flight itself — because a label that
     is dismissed mid-flight must not leave a hole in the row.

     This runs on the way in and on the way in only. There was a return
     flight once and it is gone; see `hideHover`.

     Three things have to be undone rather than left to a stylesheet. The
     label clips to its own rounded box, so it is opened up for the flight
     and closed again after; its own pop-in would move the box three
     pixels while the dots were being measured against it, so it stands
     down and the arrival is the entrance; and each dot's transform is
     written inline, since it is a measurement and not a style.

     A deadline dot is a square standing on its corner, so its rotation has
     to be carried through the flight or it would spin. Order matters:
     translate, then scale, then rotate, all about the centre. */
  var flown=[];                 // board marks standing down for a flight
  var pairs=[];                 // {dot,src} — the flight in the air
  var flyTimer=null;
  function unflyMarks(){
    flown.forEach(function(m){m.classList.remove('hz-flown');});
    flown=[];
  }
  /* Every measurement is taken before any style is written, and every
     style is written after the last measurement. Interleaving them — read
     a rect, write a transform, read the next rect — makes the browser
     settle the layout again between every pair, and nine of those inside
     one mousemove is exactly the stutter this animation was supposed to
     avoid. Two passes, one layout. This is the same rule `playMove` keeps
     for the cards, for the same reason. */
  function measureFlight(pop,host){
    var by={};
    /* Indexed rather than selected. A project id and a todo id are made
       here and not typed, but they end up inside an attribute selector,
       and one apostrophe in one of them would be a thrown exception in the
       middle of a hover. Reading the attributes back off the marks cannot
       be broken by their contents. */
    qa('.hz-mark,.hz-dl',host).forEach(function(m){
      by[(m.classList.contains('hz-dl')?'dl':'due')+'|'
        +m.getAttribute('data-pid')+'|'+m.getAttribute('data-eid')]=m;
    });
    var out=[];
    qa('.hz-lbl-dot[data-eid]',pop).forEach(function(dot){
      var src=by[dot.getAttribute('data-kind')+'|'
        +dot.getAttribute('data-pid')+'|'+dot.getAttribute('data-eid')];
      if(!src)return;
      var sr=src.getBoundingClientRect(),dr=dot.getBoundingClientRect();
      if(!sr.width||!dr.width)return;
      out.push({dot:dot,src:src,
        dx:(sr.left+sr.width/2)-(dr.left+dr.width/2),
        dy:(sr.top+sr.height/2)-(dr.top+dr.height/2),
        sc:(src.offsetWidth||13)/(dot.offsetWidth||7),
        col:getComputedStyle(src).backgroundColor,
        spin:(dot.getAttribute('data-kind')==='dl'?' rotate(45deg)':'')});
    });
    return out;
  }
  /* Where a dot sits when it is standing on its board mark. */
  function onMark(f){
    return 'translate('+f.dx.toFixed(1)+'px,'+f.dy.toFixed(1)+'px) '
      +'scale('+f.sc.toFixed(3)+')'+f.spin;
  }
  function clearFlight(){
    if(flyTimer){clearTimeout(flyTimer);flyTimer=null;}
    pairs.forEach(function(f){
      f.dot.style.transition='';f.dot.style.transitionDelay='';
      f.dot.style.transform='';f.dot.style.background='';
    });
    pairs=[];
  }
  function flyDots(pop,host){
    if(reducedMotion()||!host)return;
    clearFlight();
    var fs=measureFlight(pop,host);
    if(!fs.length)return;
    fs.forEach(function(f){
      f.dot.style.transition='none';
      f.dot.style.transform=onMark(f);
      f.dot.style.background=f.col;
      f.src.classList.add('hz-flown');
      flown.push(f.src);
    });
    pairs=fs;
    pop.classList.add('hz-lbl-flying');
    /* The start of a flight has to be a style the browser has actually
       computed, or the transition has nothing to run FROM. A
       requestAnimationFrame callback runs BEFORE the frame's own style
       pass, so parking the dots on their marks and clearing them one
       frame later were two writes the browser only ever saw as one: it
       compared the label's resting position with itself and moved
       nothing. Reading a layout value here forces that first pass — once
       for the whole flight, not once per dot — and the dots then have a
       real place to leave from. This is what "the hover is not smooth"
       was: not a slow flight but no flight at all, the dots simply
       appearing where they already belonged. */
    void pop.offsetWidth;
    requestAnimationFrame(function(){
      fs.forEach(function(f,i){
        f.dot.style.transition='';
        /* After, and not before: `transition` is the shorthand, so clearing
           it clears the delay with it. The stagger is what makes five dots
           read as five dots lining up rather than as one shape sliding. */
        f.dot.style.transitionDelay=(i*STAGGER).toFixed(3)+'s';
        f.dot.style.transform='';
        f.dot.style.background='';
      });
      flyTimer=setTimeout(function(){
        flyTimer=null;
        /* `hz-lbl-flying` deliberately STAYS. It carries `animation:none`,
           and taking it off half a second after the label opened let the
           label's own pop-in — which had been standing down for the
           flight — start from the beginning, so a settled label faded
           itself out and back in for no reason at all. That was the last
           flicker in this. Nothing the class does is worth undoing once
           the dots are home: an overflow nothing overflows, a transition
           nothing transitions, and a fade already held at full. It comes
           off when the label is taken down or rebuilt for another cell,
           which is the only moment it could be seen coming off. */
        fs.forEach(function(f){f.dot.style.transitionDelay='';});
        unflyMarks();
      },flightMs(fs.length));
    });
  }
  /* The flight, in numbers. Short: a label opens right beside the cell it
     describes, so a dot has only a hundred-odd pixels to cross, and a
     journey that short reads as slow long before it reads as graceful.
     The stagger is what carries the meaning — five dots lining up — so it
     is the part that survives being quick. */
  var FLY_MS=280,STAGGER=0.028;
  function flightMs(n){return FLY_MS+n*STAGGER*1000+80;}
  function showCellHover(track,pid,iso,anchor){
    var list=todosInCell(pid,iso,track.getAttribute('data-start'));
    if(!list.length){hideHover();hoverCell=null;return;}
    var key=pid+'|'+iso;
    var pop=hoverEl();
    /* Already up, and for this cell: leave it entirely alone. It used to
       fall through and re-place itself on every mousemove — and placing it
       means parking it at 0,0 to find where `fixed` starts from, so a
       label you were reading flinched once per pointer event, and any
       flight still in the air was measured against a box that had just
       jumped. The label is anchored to the CELL and not to the pointer, so
       there is nothing here that moving the mouse can change. */
    if(key===hoverCell&&pop.style.display!=='none')return;
    var fresh=(key!==hoverCell);
    if(fresh){
      hoverCell=key;
      clearFlight();
      pop.classList.remove('hz-lbl-flying');
      unflyMarks();
      pop.className='hz-lbl hz-lbl-float';
      /* One head for the whole label instead of a colour bar down its
         side: it says which cell this is, which the bar never did. The
         board's columns are twenty-seven pixels wide at six weeks, so
         being one day out is easy and the date is worth confirming. */
      var d=new Date(iso+'T00:00:00');
      pop.innerHTML='<span class="hz-lbl-head">'
          +'<span class="hz-lbl-where">'+esc(list[0].p.name)+'</span>'
          +'<span class="hz-lbl-when">'+DAYS[d.getDay()].slice(0,3)+' '+d.getDate()
            +' '+MONTHS[d.getMonth()].slice(0,3)+'</span>'
        +'</span>'
        +'<span class="hz-lbl-rows">'+cellHTML(list,iso)+'</span>';
    }
    pop.style.display='flex';
    /* Where `fixed` actually starts from — the third and last place in
       this room that needed the correction, after the popover and the
       calendar. Parking the box at 0,0 and reading where that lands gives
       the origin to subtract; without it the label was drawn one scroll
       offset too high, which past a couple of hundred pixels put it off
       the top of the window entirely.

       The ceiling is the bottom of the room's own bar and not the top of
       the window: the bar is sticky inside the pane and the shell's title
       sits above it in a stacking context this label cannot reach, so a
       label that flipped only at the window edge was drawn under both.
       The bar is asked where it ends rather than the 60 being written out
       again here. */
    pop.style.left='0px';pop.style.top='0px';
    var pr=pop.getBoundingClientRect();
    var bar=q('.oa-bar'),ceil=(bar?bar.getBoundingClientRect().bottom:0)+8;
    var left=Math.max(8,Math.min(anchor.cx-pr.width/2,window.innerWidth-pr.width-8));
    var top=anchor.top-pr.height-9;
    if(top<ceil)top=anchor.bottom+9;
    pop.style.left=(left-pr.left)+'px';
    pop.style.top=(top-pr.top)+'px';
    /* Only on arriving at a cell. A mousemove inside one it is already
       showing costs nothing, and re-flying the dots every few pixels of
       pointer travel would be a label that never settles. */
    if(fresh)flyDots(pop,byId('horizon-container'));
  }
  /* Which day column the pointer is in, read off the track itself — it
     carries the window it was drawn for, so this needs no shared state and
     stays right when the window length changes under it. */
  function cellAt(track,clientX){
    var days=+track.getAttribute('data-days')||0,start=track.getAttribute('data-start');
    if(!days||!start)return null;
    var r=track.getBoundingClientRect();
    if(!r.width)return null;
    var w=r.width/days,i=Math.floor((clientX-r.left)/w);
    if(i<0||i>=days)return null;
    return {iso:addDays(start,i),
      cx:r.left+(i+0.5)*w,top:r.top-7,bottom:r.bottom+7};
  }
  /* Down, and at once, whoever asked. The label used to fly its dots home
     when the pointer left the cell — the arrival run backwards, with the
     panel dissolving around them — and it read as a second event rather
     than as a dismissal: a box you had finished with sitting there for a
     third of a second while something crawled out of it, and every fresh
     label having to overtake a farewell still in the air. Mark asked for
     it gone. The dots coming forward say the one thing there is to say,
     which is that the label IS those marks; leaving is not a sentence, so
     nothing is said on the way out. */
  function hideHover(){
    var p=byId('hz-hover');
    if(p){p.style.display='none';
      p.classList.remove('hz-lbl-flying');}
    clearFlight();
    unflyMarks();
    hoverCell=null;
  }
  /* ── Slices ── */
  function todosOnDay(iso){
    var out=[];
    eachTodo(function(t,p){
      if(t.dueDate===iso)out.push({p:p,e:t,kind:'due'});
      else if(t.deadline===iso)out.push({p:p,e:t,kind:'dl'});
    });
    return out;
  }
  /* A day carrying sixteen todos drew as one wall of identical cards —
     the project named sixteen times down the left, the same date written
     sixteen times down the right, and nothing saying which four belonged
     together. The list was already standing in project order, because
     `eachTodo` walks the board; it simply never said so.

     So a day is drawn as blocks. The projects keep board order, so the
     blocks run down the page in the same order as the lanes above them
     and the eye can travel between the two. Inside a block the biggest
     job goes first, because on a full day the question is what the large
     lumps are, and the ten-minute jobs then collect at the foot where you
     can see how many of them there are. An unestimated todo sorts last
     for want of anywhere honest to put it, which also gathers the ones
     worth estimating.

     Ties keep the order they arrived in, so the list is stable rather
     than arbitrary — the same day drawn twice draws the same.

     A day holding one todo is drawn flat, the way every day was drawn
     before this existed. A block heading is there to separate stacks and
     to say once what the cards under it would otherwise each repeat, and
     with a single card it does neither — it only says the count and the
     effort a third time, under a head that has already said both. The
     summary line above keeps the same rule for the same reason. */
  function byEffortDesc(list){
    return list.map(function(it,i){return {it:it,i:i};})
      .sort(function(a,b){
        var ea=+a.it.e.effort||0,eb=+b.it.e.effort||0;
        return ea===eb?a.i-b.i:eb-ea;
      }).map(function(x){return x.it;});
  }
  /* Only what is actually planned into the day counts towards it. A day
     also collects the todos whose hard deadline lands on it while their
     work sits on some earlier day, and those cost that earlier day, not
     this one. Counting them here would put a number under the date that
     disagreed with the effort strip's own column directly above it. */
  function plannedMinutes(list){
    var m=0;
    list.forEach(function(it){if(it.kind!=='dl')m+=(+it.e.effort||0);});
    return m;
  }
  /* A day is cut by the kind of work, and only that. It used to be a
     choice between projects and categories, with a switch above the list
     to say which — and the project half turned out to be answering a
     question the board already answers, since a project IS a row up there.
     What the list is for is the thing the board cannot show: that this
     Friday is seven hours of writing with an hour of portal work stuck to
     it. Whose work it is comes back on demand instead — see `gather`.

     Since 2026-08-28 this draws EVERY slice and not only a day of more
     than one todo. The card stopped carrying its category as a word on
     its own row that day, so the brace beside the run is the only place
     the word is written — which turns what used to be a day's luxury into
     every list's only label, and settles a shape question at the same
     time: a card is now the same card, at the same inset, whichever door
     it was opened by. Mark opened a single todo, found a wider box with
     the word inside it instead of beside it, and asked for the one shape.

     `weigh` is the day's own arithmetic and nothing else's. A day sorts
     its runs by how many hours each is worth and its cards biggest-first,
     because what a day is asking of you is a quantity. Every other slice
     arrives already sorted by something it means — longest overdue first,
     chronological down a call — and is handed back untouched: there the
     runs BREAK where the category changes rather than collecting every
     card of a kind into one place, so a category that turns up twice down
     a chronological list is braced twice and the list still reads in the
     order it means. Gathering those lists instead would have cost the
     thing they are sorted by, which is the whole of what they say.
     The brace labels those lists; it does not get to re-sort them. */
  function dayGroupsHTML(items,opts){
    opts=opts||{};
    var groups=[],by={};
    function open(it,k){
      var g={k:k,label:catLabel(it.e.category)||'Not said',
        color:catLabel(it.e.category)?catColor(it.e.category):'',list:[]};
      groups.push(g);return g;
    }
    items.forEach(function(it){
      var k=catLabel(it.e.category)?it.e.category:'\u0000',g;
      if(opts.weigh){ g=by[k]||(by[k]=open(it,k)); }
      else{
        g=groups[groups.length-1];
        if(!g||g.k!==k)g=open(it,k);
      }
      g.list.push(it);
    });
    if(opts.weigh)groups.sort(function(a,b){
      if(a.k==='\u0000')return 1;
      if(b.k==='\u0000')return -1;
      var d=plannedMinutes(b.list)-plannedMinutes(a.list);
      return d||(a.label<b.label?-1:1);
    });
    /* The name flanks its run instead of standing over it — a brace down
       the left rather than a heading on a line of its own. A heading is
       the one thing on a list that never needs its own row: the cards
       beside it already say where it starts and where it stops.

       The brace is a rounded rule in the group's colour, drawn the full
       height of the run, and the label sits at its top so a column of
       group names reads at an even rhythm however tall the runs are. */
    return groups.map(function(g){
      var n=g.list.length,mins=plannedMinutes(g.list);
      return '<div class="hz-day-grp"'
          +(g.color?' style="--grp:'+safeColor(g.color)+'"':'')+'>'
        +'<div class="hz-day-flank">'
          +'<span class="hz-day-flank-name">'+esc(g.label)+'</span>'
          +'<span class="hz-day-flank-sum">'+n+' todo'+(n===1?'':'s')
            +(mins?' \u00b7 '+esc(effortShort(mins)):'')+'</span>'
        +'</div>'
        +'<div class="hz-day-grp-body">'
        +(opts.weigh?byEffortDesc(g.list):g.list).map(function(it){
          return (it.kind==='dl'?'<div class="hz-day-flag">\u25c6 deadline</div>':'')
            /* The card is drawn the same gathered as ungathered. The name
               column used to be dropped once a project was gathered, on
               the reasoning that every card left says the same name and
               the chip above says it too — true, and beside the point.
               The gather is a movement you are meant to FOLLOW, and a card
               that changes shape in the frame it sets off in is not the
               card you were looking at any more: 170px comes out of every
               row, the text reflows, and by the time the flight is over
               there is nothing to recognise. Mark asked for the details to
               stay. A fact said twice costs a column; a card you cannot
               follow costs the whole movement. */
            +TodoCard.html(it.e,it.p,{gather:!!opts.gather});
        }).join('')
        +'</div>'
      +'</div>';
    }).join('');
  }
  function unplannedTodos(){
    var out=[];eachTodo(function(t,p){if(!t.dueDate)out.push({p:p,e:t,kind:'due'});});return out;
  }
  /* Longest overdue first, so the worst of it reads at the top. */
  function overdueTodos(){
    var today=isoToday(),out=[];
    eachTodo(function(t,p){if(t.deadline&&t.deadline<today)out.push({p:p,e:t,kind:'dl'});});
    return out.sort(function(a,b){return a.e.deadline<b.e.deadline?-1:a.e.deadline>b.e.deadline?1:0;});
  }
  /* Chronological by planned date. Undated todos have no place on that
     line, so they sink to the bottom rather than sorting as if due at the
     epoch; ties keep board order, which makes it stable, not arbitrary. */
  function sortChrono(list){
    return list.map(function(it,i){return {it:it,i:i};})
      .sort(function(a,b){
        var da=a.it.e.dueDate||'',db=b.it.e.dueDate||'';
        if(da&&db){if(da!==db)return da<db?-1:1;}
        else if(da!==db)return da?-1:1;
        return a.i-b.i;
      }).map(function(x){return x.it;});
  }
  function todosOfCall(key){
    var out=[];
    eachTodo(function(t,p,c){if(c.key===key)out.push({p:p,e:t,kind:'due'});});
    return sortChrono(out);
  }
  function todosOfProject(pid){
    var out=[];
    eachTodo(function(t,p){if(p.id===pid)out.push({p:p,e:t,kind:'due'});});
    return sortChrono(out);
  }

  /* ── Gathering a project out of the day ──
     Press a project's name on any card and the day answers "and what else
     is this project asking of today": every one of its todos travels to
     the top and everything else steps out, and the cards move to get
     there rather than being redrawn somewhere else. Press it again and
     they go back.

     This is what is left of the old cut. Grouping a day by project was a
     mode you had to be in; it is a question you ask about one project,
     from the card that raised it, and the answer is temporary by nature.
     It belongs to the open slice and dies with it. */
  function gather(pid,evt){
    stopEvt(evt);
    /* Which card asked. The name is a button inside the card, so the card
       the press came from is the card that was under the pointer — the one
       Mark's eye is already on, and therefore the one that has to lead the
       flight so he can follow it to where it lands instead of finding the
       list rearranged and having to read it again. The chip in the bar
       hands the day back from outside any card and names none, which is
       right: going back is not a thing you follow. */
    var t=evt&&evt.target,from=t&&t.closest&&t.closest('.todo-card-later');
    only=(only===pid)?null:pid;
    renderDetail({flip:true,lead:(from&&from.id)||''});
  }
  /* What the gathered project is called, for the chip that hands the day
     back. A project can be deleted while its day is open, so this answers
     with nothing rather than with a stale name, and the chip is left off. */
  function gatheredName(){
    if(!only)return '';
    var p=projects[only];
    return p?p.name:'';
  }
  function clearDetail(){
    open=null;
    only=null;
    var ub=q('.hz-eff-unplanned');
    if(ub)ub.classList.remove('active');
    var d=byId('hz-detail');
    if(d){d.innerHTML='';d.classList.remove('open');}
    var host=byId('horizon-container');
    if(host){
      qa('.active',host).forEach(function(m){m.classList.remove('active');});
    }
    hideHover();
  }
  function resetHome(){
    cancelFaceSwap();
    face='board';
    agendaOn=false;
    clearDetail();
  }

  /* ── Moving the cards rather than redrawing them ──
     First-Last-Invert-Play, the old trick and still the only honest one:
     note where every card is, rebuild the list, note where each one has
     ended up, put it back where it started with a transform, and let one
     transition carry it home. Nothing is animated that is not a real
     layout — the cards you see travelling are the cards, not stand-ins,
     and a card that was not on screen before simply fades in.

     The alternative was animating a filter, which always ends up lying
     about where things went. This cannot: the end state is a plain render
     and the movement is the difference between two of them. */
  /* Positions are kept relative to the PANE and not to the window. The
     pane can lose height between the two measurements — gathering five
     todos out of sixteen is most of it — and a room scrolled near the
     bottom has its scroll clamped to the shorter page, which moves every
     card in the window by that much. Measured against the window the FLIP
     then inverts by a distance that includes a scroll jump it knows
     nothing about, and the cards set off from the wrong place. The pane
     scrolls with its own contents, so a card's offset inside it is the
     same number before and after whatever the scrollbar does. */
  function cardRects(pane){
    var m={},pr=pane.getBoundingClientRect();
    qa('.todo-card-later',pane).forEach(function(el){
      var r=el.getBoundingClientRect();
      m[el.id]={x:r.left-pr.left,y:r.top-pr.top};
    });
    return m;
  }
  /* Every rect is read before any style is written. Reading one card's
     position and immediately writing its transform, card by card, forces
     the browser to settle the layout again between every pair — sixteen
     times on a heavy day, inside the one frame that has to be smooth, and
     that is exactly what the movement was stuttering on. Two passes: the
     whole list is measured, then the whole list is moved. */
  /* The room's scroll, carried by hand rather than left to the browser.
     Gathering can take six hundred pixels out of the pane, and a room
     scrolled near the bottom cannot stay where it is on a shorter page —
     it gets clamped, in one frame, while the cards are still in the air.
     Letting the held height down slowly only spread that clamp over the
     transition, which turned a jump into a slide nobody asked for and left
     the cards drifting against it.

     So the pane is held at its old height for the WHOLE flight and the
     scroll is tweened to where it will legally be able to sit, on the same
     curve and over the same 340. The view and the cards then move as one
     thing. Released at the end, the min-height only takes away slack that
     is now below the fold, which is why nothing moves when it goes. */
  function easeMove(t){
    return t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;   // matches MOVE_CURVE
  }
  function tweenScroll(room,from,to){
    if(!room||Math.abs(to-from)<1)return;
    /* The room is `scroll-behavior:smooth`, and that is the whole of "the
       screen movement gets dragged". Under it, every `scrollTop=` is not a
       position but a REQUEST — the browser starts an animation of its own
       towards it and reports where that animation currently is. Writing a
       new one every frame restarted the browser's easing every frame, so
       it never got past its own first few pixels; the view sat still for
       the length of the flight and then slid the whole way once the writes
       stopped. Held at `auto` the writes are positions again and the
       curve below is the one that runs.
       Restored rather than cleared to a value, because smooth is the
       room's own choice for every other scroll in it — the palette, the
       reveal, an anchor — and this is one gesture borrowing the wheel. */
    var was=room.style.scrollBehavior;
    room.style.scrollBehavior='auto';
    var t0=0;
    var step=function(ts){
      if(!t0)t0=ts;
      var k=Math.min(1,(ts-t0)/MOVE_MS);
      room.scrollTop=from+(to-from)*easeMove(k);
      if(k<1)requestAnimationFrame(step);
      else room.style.scrollBehavior=was;
    };
    requestAnimationFrame(step);
  }
  function playMove(pane,before,settle,room,from,to,lead){
    if(reducedMotion())return;
    var cards=qa('.todo-card-later',pane);
    var pr=pane.getBoundingClientRect();
    var now=cards.map(function(el){
      var r=el.getBoundingClientRect();
      return {x:r.left-pr.left,y:r.top-pr.top};
    });
    var moved=[];
    cards.forEach(function(el,i){
      var was=before[el.id];
      if(!was){el.classList.add('todo-arrive');return;}
      var dx=was.x-now[i].x,dy=was.y-now[i].y;
      /* Tagged whether it travels or not: the list gives its children a
         staggered entrance animation and the pane was just rebuilt, so
         every card is a new node about to play it. `todo-moving` carries
         `animation:none`, which is how a card that has NOT moved is told
         to stay exactly where it is instead of fading in underneath the
         ones that are flying. */
      el.classList.add('todo-moving');
      if(Math.abs(dx)<1&&Math.abs(dy)<1)return;
      el.style.transition='none';
      el.style.transform='translate('+dx.toFixed(1)+'px,'+dy.toFixed(1)+'px)';
      moved.push(el);
    });
    /* The card that asked goes first and the rest fall in behind it, one
       beat apart. Sixteen cards leaving in the same frame is a block of
       text jumping to a new position — there is no single thing in it to
       watch, which is exactly what Mark said: he had to work out the new
       list from scratch when it settled. Given a lead and a stagger the
       same movement reads as a card being pulled to the top with its
       fellows following, and the eye that was on it stays on it. The
       stagger is capped, because past half a dozen it stops saying
       "these are following" and starts saying "this list is slow". */
    if(lead)moved.sort(function(a,b){
      return (b.id===lead?1:0)-(a.id===lead?1:0);
    });
    if(lead&&moved.length&&moved[0].id===lead)moved[0].classList.add('todo-lead');
    /* Forced once, and for the dots' reason exactly: a rAF callback lands
       before the frame's style pass, so the inverted transforms written
       just above and cleared just below were a single change of nothing.
       Reading a layout value here is the browser being made to settle the
       start of the flight, so there is somewhere for the cards to travel
       from. One read for the whole list — this is not the per-card
       measuring the two-pass rule above exists to avoid. */
    void pane.offsetWidth;
    requestAnimationFrame(function(){
      moved.forEach(function(el,i){
        el.style.transition='';
        /* After, and not before: `transition` is the shorthand and
           clearing it clears the delay with it. */
        el.style.transitionDelay=(Math.min(i,MOVE_LEAD_MAX)*MOVE_STAGGER).toFixed(3)+'s';
        el.style.transform='';
      });
      tweenScroll(room,from,to);
      setTimeout(function(){
        qa('.todo-moving,.todo-arrive',pane).forEach(function(el){
          /* Swapped, not simply taken off, and `todo-settled` goes on
             FIRST. Both flight classes carry `animation:none`, and what
             they are suppressing is the detail list's own entrance —
             every card in it slides five pixels and fades in. Take the
             class away and that entrance, which has been standing by
             since the list was built, starts from the beginning: half a
             second after the cards had landed and settled, all of them
             faded out and slid again. It is the same trap the hover
             label's pop-in fell into, in the one place the lesson was
             not applied. `todo-settled` carries the suppression and
             nothing else, so it costs nothing to leave on for good;
             everything that must NOT persist — the long transition, the
             dead pointer, the raised stacking, the layer hint — comes
             off with the class that brought it. */
          el.classList.add('todo-settled');
          el.classList.remove('todo-moving','todo-arrive','todo-lead');
          /* The delay is inline, so it would otherwise sit on the card for
             good and put a third of a second in front of its own hover. */
          el.style.transitionDelay='';});
        /* Last, and only now: the slack this takes away is all below the
           fold by the time the scroll has finished moving, so letting it
           go is invisible. Released any earlier and it is the clamp all
           over again, underneath cards that are still flying. */
        if(settle)pane.style.minHeight='';
      },MOVE_MS+MOVE_LEAD_MAX*MOVE_STAGGER*1000+70);
    });
  }
  /* Slow on purpose, and slower than it was. 340 was enough to see that
     something had happened and not enough to watch it happen: Mark asked
     to be able to follow every box to where it lands, and a card crossing
     six hundred pixels in a third of a second is read at the end rather
     than along the way. 560 is the trip, and the stagger sits on top of
     it — a longer beat too, because a slower flight needs more space
     between the cards before they read as following one another rather
     than as one block.
     The scroll tween runs the 560 ALONE, with no stagger: it is the view
     moving, and what it has to keep step with is the lead card, which has
     no delay either. That is the whole of "the screen movement is too
     fast" — the view was travelling six hundred pixels on the old number
     while the eye was on a card, and the two have to be one gesture. */
  var MOVE_MS=560,MOVE_STAGGER=0.042,MOVE_LEAD_MAX=5;
  /* ── The rest of the day, leaving ──
     Coming back from a gathered project the day's other cards fade in,
     because they are new nodes with nowhere to travel from. Going the
     other way they used to simply cease: the render replaced them and
     four of sixteen cards were left standing in an empty pane. Mark asked
     for the mirror, and he is right that it is the same event — one set
     of cards is arriving and the other is leaving, and both should be
     watchable.

     What fades is the real card and not a picture of it. Replacing the
     pane's `innerHTML` detaches the old nodes but the references taken a
     moment earlier are still live, so they can be put straight back over
     the new list, parked at the corner they were measured at, and faded
     there. Absolutely positioned, so they cost the new list no height and
     the FLIP above is measured against a layout they are not in; and
     beneath it, so the cards flying to the top pass in front of the day
     dissolving behind them.

     Nothing depends on the timer: the next render replaces the pane's
     children and takes any ghost with it. It is only there so a pane
     nobody opens again is not left holding a dozen invisible cards. */
  /* A run whose every card is leaving goes as a run, brace and label and
     all; a run that keeps even one card stays where it is and loses its
     departing cards one at a time. Without the first half the braces were
     the one thing on the list that still jumped: the label and the rule
     vanished in the frame the press landed while the cards they belonged
     to were still sitting there fading, so the day came apart in two
     pieces instead of leaving. Groups come before their own cards in
     document order, which is what lets one walk decide both. */
  function ghostsFor(olds,kept){
    var gone=[],covered=[];
    olds.forEach(function(el){
      if(el.classList.contains('hz-day-grp')){
        var cards=qa('.todo-card-later',el);
        var lives=cards.some(function(c){return !!kept[c.id];});
        if(cards.length&&!lives){gone.push(el);covered=covered.concat(cards);}
        return;
      }
      if(!kept[el.id]&&covered.indexOf(el)<0)gone.push(el);
    });
    return gone;
  }
  function ghostOut(pane,gone){
    if(reducedMotion()||!gone.length)return;
    gone.forEach(function(el){
      var r=el._ghost;if(!r)return;
      /* `todo-settled` above all: it carries `animation:none`, which is
         exactly the suppression that would swallow the fade. */
      el.classList.remove('todo-settled','todo-moving','todo-arrive','todo-lead');
      el.classList.add('hz-leaving');
      el.style.transition='';el.style.transitionDelay='';el.style.transform='';
      /* Inline, so nothing in the cascade has to be argued with: a card is
         `position:relative` by its own rule and a run is in flow. */
      el.style.position='absolute';
      el.style.left=r.x.toFixed(1)+'px';
      el.style.top=r.y.toFixed(1)+'px';
      el.style.width=r.w.toFixed(1)+'px';
      pane.appendChild(el);
    });
    setTimeout(function(){
      gone.forEach(function(el){
        if(el.parentNode)el.parentNode.removeChild(el);
      });
    },MOVE_MS+140);
  }
  /* The scroll position is put back by hand. Replacing the pane's contents
     can clamp it — briefly, before the min-height above takes hold — and a
     room that scrolls a hundred pixels and back is the one thing an
     animation cannot hide. */
  function renderDetail(opts){
    opts=opts||{};
    var pane0=byId('hz-detail');
    if(!(opts.flip&&pane0)||reducedMotion()){renderDetailNow();return;}
    /* Walked and not looked up by id: the room's own document is scoped to
       the inside of the pane, so the pane itself is not a thing it can be
       asked for by name. `closest` walks the real tree and finds it. */
    var room=(pane0.closest&&pane0.closest('.pane'))||pane0.parentElement;
    var before=cardRects(pane0),beforeH=pane0.offsetHeight;
    /* Measured and held before the render, because the render is what
       detaches them: every run and every card, each remembering where it
       stood so whichever of them the new list has no place for can be
       faded there. Stashed on the node rather than in a map because a run
       has no id to key one by. */
    var pr0=pane0.getBoundingClientRect();
    var olds=qa('.hz-day-grp,.todo-card-later',pane0);
    olds.forEach(function(el){
      var r=el.getBoundingClientRect();
      el._ghost={x:r.left-pr0.left,y:r.top-pr0.top,w:r.width};
    });
    var top=room?room.scrollTop:0;
    renderDetailNow();
    var pane=byId('hz-detail');
    if(!pane)return;
    /* Pinned first, scroll restored second. A pane that has just lost six
       hundred pixels drags the scroll down with it the moment it is
       rendered, and putting the scroll back before the height is held
       simply lets it be clamped straight down again. min-height and not
       height: the pane may only ever be too tall during this, never too
       short, so nothing is ever clipped. */
    var afterH=pane.offsetHeight;
    var settle=(beforeH>0&&Math.abs(beforeH-afterH)>1);
    if(settle)pane.style.minHeight=beforeH+'px';
    if(room&&room.scrollTop!==top)room.scrollTop=top;
    /* Where the scroll will be allowed to sit once the pin comes off. The
       pin is worth exactly the height the pane lost, so the page is about
       to be that much shorter; asking for it now means the tween has
       somewhere real to aim at while the pane is still holding itself up. */
    var to=top;
    if(room&&settle){
      var slack=Math.max(0,beforeH-afterH);
      to=Math.max(0,Math.min(top,room.scrollHeight-slack-room.clientHeight));
    }
    playMove(pane,before,settle,room,top,to,opts.lead||'');
    /* After `playMove` and not before: it takes its list of cards the
       moment it is called, and a ghost put back any earlier would be in
       it — measured, given a transform and flown to a place it is not
       going. Appended afterwards it is simply not one of the cards. */
    var kept={};
    qa('.todo-card-later',pane).forEach(function(el){kept[el.id]=1;});
    ghostOut(pane,ghostsFor(olds,kept));
  }
  function renderDetailNow(){
    var pane=byId('hz-detail');if(!pane)return;
    if(!open){pane.innerHTML='';pane.classList.remove('open');return;}
    var host=byId('horizon-container');
    if(host)qa('.active',host).forEach(function(m){m.classList.remove('active');});
    if(!open.day)only=null;      // a gather is a day's, and only a day's

    /* The leads line opens three slices of its own — every open lead, the
       ones with no day yet, or the one a dot stands for — and they are
       Semaphore's leads, so they are read from the socket and drawn by
       THE LEADS LINE rather than by the todo slices below. Same head, same
       list, same way out. */
    if(open.leads==='new'){
      pane.innerHTML='<div class="hz-detail-head">'
          +'<span class="hz-detail-lbl">New lead</span>'
          +'<button class="hz-detail-close" title="Close" onclick="PL.closeDetail(event)">\u2715</button>'
        +'</div>'
        +'<div class="hz-detail-list"><div class="hz-day-grp" style="--grp:'+Leads.COLOR+'">'
          +'<div class="hz-day-flank"><span class="hz-day-flank-name">Spotted</span>'
            +'<span class="hz-day-flank-sum">where a lead starts</span></div>'
          +'<div class="hz-day-grp-body">'+Leads.newHTML()+'</div></div></div>';
      pane.classList.add('open');
      if(host){var nb=q('.hz-leads-new',host);if(nb)nb.classList.add('active');}
      return;
    }
    if(open.leads||open.lead){
      var ls=Leads.list(),lhead;
      if(open.lead){
        ls=ls.filter(function(l){return Leads.keyOf(l)===open.lead;});
        lhead='Selected lead';
      } else if(open.leads==='undated'){
        ls=ls.filter(function(l){return !l.due;});
        lhead='Leads with no date';
      } else lhead='Leads';
      if(!ls.length){clearDetail();return;}
      pane.innerHTML='<div class="hz-detail-head">'
          +'<span class="hz-detail-lbl">'+esc(lhead)+'</span>'
          +(open.lead?'':'<span class="hz-detail-count">'+ls.length+' lead'+(ls.length===1?'':'s')+'</span>')
          +(open.leads==='all'&&Leads.canAdd()
            ?'<button type="button" class="hz-leads-head-new" onclick="PL.leadsNewClick(event)">+ New lead</button>':'')
          +'<button class="hz-detail-close" title="Close" onclick="PL.closeDetail(event)">✕</button>'
        +'</div>'
        +(open.leads==='undated'?'<div class="hz-detail-hint">Give one a day to come back and it appears on the line above.</div>':'')
        +'<div class="hz-detail-list">'+Leads.listHTML(ls)+'</div>';
      pane.classList.add('open');
      if(open.lead){
        var lc=q('.lead-card',pane);
        if(lc&&open.expanded!==false)lc.classList.add('open');
      }
      if(host){
        var lrow=q('.hz-leads-row',host);
        if(open.leads==='all'&&lrow){
          lrow.classList.add('active');
          var lr=q('.hz-call-leads .hz-rail',host);if(lr)lr.classList.add('active');
        }
        if(open.leads==='undated'){var ub=q('.hz-leads-undated',host);if(ub)ub.classList.add('active');}
        if(open.lead)qa('.hz-lead-mark',host).forEach(function(m){
          if(m.getAttribute('data-lead')===open.lead)m.classList.add('active');});
      }
      return;
    }

    /* Every slice but a single todo has the same shape: a heading and a
       stack of real todo cards. Only the source and the label differ. */
    if(open.day||open.unplanned||open.overdue||open.callKey||open.projId){
      var items,head,dayLeads=[];
      if(open.unplanned){items=unplannedTodos();head='No planned date';}
      else if(open.overdue){items=overdueTodos();head='Overdue';}
      else if(open.callKey){items=todosOfCall(open.callKey);head=open.label||'Call';}
      else if(open.projId){
        items=todosOfProject(open.projId);
        var pp=projects[open.projId];
        head=pp?pp.name:'Project';
      } else {
        items=todosOnDay(open.day);
        head='';
        if(only)items=items.filter(function(it){return it.p.id===only;});
        /* A gathered project is one project's work, and a lead is no
           project's, so the leads step aside with the rest of the day. */
        if(!only)dayLeads=leadsOnDay(open.day);
      }
      if(!items.length&&!dayLeads.length){clearDetail();return;}
      var leadsOut=dayLeads.length&&leadsFold===open.day;
      /* A day used to have two shapes: one todo drawn flat, more than one
         braced, on the reasoning that a brace over a single card would be
         saying that card's category twice. That reasoning went when the
         word came off the card's own row — the brace is now the only place
         it is written, so with one card it says it once, and a day of one
         todo that looked like nothing else in the room can stop doing
         that. Every slice is braced; there is no second shape left. */
      /* A day says nothing above its work. It used to carry two full rows
         — the date with a count and a total, then every category on the
         day with its share of the hours — and both were answers to
         questions the board directly above had already answered: which day
         is lit on the axis, what the column costs on the effort strip.
         Two rows of vertical space to say it a second time is the whole
         reason a long day needed scrolling before it could be read.

         A day is always cut by the kind of work now, so even the cut
         switch that used to stand here is gone, and the bar is normally
         nothing but the way out. The one thing it does say is when the day
         is NOT showing all of itself: a gathered project takes the rest of
         the day off the screen, and something has to name what is left and
         hand it back. The close sits opposite, because clicking the day on
         the axis again is the other way out and not everyone will find it.

         Every other slice keeps its head. "Overdue" and "No planned date"
         have no lit label on the board to fall back on — for those the
         heading is the only thing that says what you are looking at. */
      pane.innerHTML=(open.day
        ?'<div class="hz-day-bar">'
          +(dayLeads.length
            ?'<button type="button" class="hz-day-leads-btn'+(leadsOut?' on':'')+'" '
              +'aria-expanded="'+(leadsOut?'true':'false')+'" '
              +'title="'+(leadsOut?'Fold the leads away':'Show the leads due back this day')+'" '
              +'onclick="PL.dayLeadsToggle(event)">'
              +'<span class="hz-day-leads-chev" aria-hidden="true">\u25B8</span>'
              +dayLeads.length+' lead'+(dayLeads.length===1?'':'s')+'</button>'
            :'')
          +(only&&gatheredName()
            ?'<button type="button" class="hz-day-only" '
              +'title="Show the whole day again" '
              +'onclick="PL.dayGather(\''+jsq(only)+'\',event)">'
              +'<span class="hz-day-only-name">'+esc(gatheredName())+'</span>'
              +'<span class="hz-day-only-x">\u2715</span></button>'
            :'')
          +'<button class="hz-detail-close" title="Close" onclick="PL.closeDetail(event)">\u2715</button>'
        +'</div>'
        :'<div class="hz-detail-head">'
          +'<span class="hz-detail-lbl">'+esc(head)+'</span>'
          +'<span class="hz-detail-count">'+items.length+' todo'+(items.length===1?'':'s')+'</span>'
          +'<button class="hz-detail-close" title="Close" onclick="PL.closeDetail(event)">\u2715</button>'
        +'</div>')
        +(open.unplanned?'<div class="hz-detail-hint">Give one a planned date and it appears on the board above.</div>':'')
        +'<div class="hz-detail-list">'
        +(leadsOut?'<div class="hz-day-leads">'+Leads.listHTML(dayLeads)+'</div>':'')
        +(items.length?dayGroupsHTML(items,{weigh:!!open.day,gather:!!open.day}):'')
        +'</div>';
      pane.classList.add('open');
      if(host&&open.day){
        qa('.hz-day-lbl',host).forEach(function(d){
          if(d.getAttribute('data-iso')===open.day)d.classList.add('active');});
      }
      if(open.unplanned){
        var sb=q('.hz-eff-unplanned');if(sb)sb.classList.add('active');
      }
      if(host&&open.callKey){
        qa('.hz-rail[data-call-key]',host).forEach(function(c){
          if(c.getAttribute('data-call-key')===open.callKey)c.classList.add('active');});
      }
      if(host&&open.projId){
        qa('.hz-proj-name[data-pid],.hz-tag[data-pid]',host).forEach(function(c){
          if(c.getAttribute('data-pid')===open.projId){
            c.classList.add('active');
            var row=c.closest('.hz-proj');if(row)row.classList.add('active');
          }});
      }
      return;
    }

    var p=projects[open.pid];
    var e=p&&findTodo(open.pid,open.eid);
    /* Deleted, or ticked done — the board only shows open todos. */
    if(!p||!e||e.done){clearDetail();return;}
    /* Through the same braces as every other slice — a run of one. It was
       a bare card at full width, which made the one door you arrive at by
       clicking a dot on the board the one place the card had a different
       shape and no category beside it. */
    pane.innerHTML='<div class="hz-detail-head">'
      +'<span class="hz-detail-lbl">Selected todo</span>'
      +'<button class="hz-detail-close" title="Close" onclick="PL.closeDetail(event)">\u2715</button>'
      +'</div>'
      +'<div class="hz-detail-list">'
      +dayGroupsHTML([{p:p,e:e,kind:'due'}],{})
      +'</div>';
    pane.classList.add('open');
    var card=q('.todo-card-later',pane);
    if(card&&open.expanded!==false)card.classList.add('open');
    /* Mark the source marker so the link is unmistakable. */
    if(host){
      qa('.hz-mark,.hz-dl',host).forEach(function(m){
        if(m.getAttribute('data-pid')===open.pid&&m.getAttribute('data-eid')===open.eid)
          m.classList.add('active');
      });
    }
  }

  /* Bring the pane into view with room to breathe. block:'nearest' parks
     content flush against the viewport edge, which reads as barely
     visible; this only scrolls when the pane isn't already comfortable. */
  function revealPane(){
    var pane=byId('hz-detail');if(!pane)return;
    pane.classList.remove('hz-detail-in');void pane.offsetWidth;
    pane.classList.add('hz-detail-in');
    requestAnimationFrame(function(){
      var r=pane.getBoundingClientRect();
      var vh=window.innerHeight||document.documentElement.clientHeight;
      var margin=REVEAL_MARGIN;
      if(r.top>=margin&&(r.bottom<=vh-margin||r.top<=vh*0.45))return;
      var target=r.top-margin;
      /* If the pane fits the usable height, don't scroll further than
         needed. The comparison must be against its own visible run, not
         the raw window height. */
      if(r.height<=vh-margin*2)target=Math.min(target,r.bottom-(vh-margin));
      if(Math.abs(target)<2)return;
      try{window.scrollBy({top:target,behavior:scrollPref()});}
      catch(e){window.scrollBy(0,target);}
    });
  }
  function showSlice(){
    /* a slice being opened is an arrival: its cards play their entrance */
    var pane=byId('hz-detail');if(pane)pane.classList.remove('hz-same');
    lastSlice=open?JSON.stringify(open,function(k,v){return k==='expanded'?undefined:v;}):null;
    renderDetail();revealPane();
  }

  /* ── Interactions ── */
  function dayClick(iso,evt){
    stopEvt(evt);
    if(open&&open.day===iso){clearDetail();return;}
    if(!todosOnDay(iso).length&&!leadsOnDay(iso).length){
      clearDetail();
      var lbl=q('.hz-day-lbl[data-iso="'+iso+'"]');
      if(lbl){
        lbl.classList.remove('hz-day-empty');void lbl.offsetWidth;
        lbl.classList.add('hz-day-empty');
        setTimeout(function(){lbl.classList.remove('hz-day-empty');},600);
      }
      return;
    }
    leadsFold=null;
    open={day:iso};showSlice();
  }
  /* The leads due back on a day, folded under one line in the day's bar
     until pressed: Mark asked for them on the day (2026-10-08), but not all
     at once, because the day is first of all its todos. Which day's leads
     are out is kept beside `open` rather than in it, so unfolding them is
     not taken for a new slice and the todos already on screen do not play
     their entrance again. Only the leads drawn on that very day: one
     parked in the first column for being late is not that day's, exactly
     as a late todo is not. */
  var leadsFold=null;
  function leadsOnDay(iso){
    return Leads.list().filter(function(l){return l.due===iso;});
  }
  function dayLeadsToggle(evt){
    stopEvt(evt);
    if(!open||!open.day)return;
    leadsFold=(leadsFold===open.day)?null:open.day;
    var pane=byId('hz-detail');if(pane)pane.classList.add('hz-same');
    renderDetailNow();
    var block=pane&&q('.hz-day-leads',pane);
    if(block&&!reducedMotion())block.classList.add('hz-day-leads-in');
  }
  function callClick(key,label,evt){
    var t0=evt&&evt.target;
    if(t0&&t0.closest&&t0.closest('.hz-mark,.hz-dl,.hz-lbl'))return;
    stopEvt(evt);
    if(open&&open.callKey===key){clearDetail();return;}
    if(!todosOfCall(key).length){clearDetail();return;}
    open={callKey:key,label:label};showSlice();
  }
  /* Key and label come from data attributes, so a name containing quotes
     cannot break an inline handler. */
  function callElClick(el,evt){
    callClick(el.getAttribute('data-call-key'),el.getAttribute('data-call-label'),evt);
  }
  /* A lane contains markers and, in a flat call, a name button. Only treat
     a click as "open this project" when it landed on empty lane space. */
  function projRowClick(row,evt){
    var t=evt&&evt.target;
    if(t&&t.closest&&t.closest('.hz-mark,.hz-dl,.hz-lbl,.hz-proj-open,.hz-wall-tag'))return;
    projClick(row.getAttribute('data-pid'),evt);
  }
  function projClick(pid,evt){
    stopEvt(evt);
    if(open&&open.projId===pid){clearDetail();return;}
    if(!todosOfProject(pid).length){clearDetail();return;}
    open={projId:pid};showSlice();
  }
  function overdueClick(evt){
    stopEvt(evt);
    if(open&&open.overdue){clearDetail();return;}
    if(!overdueTodos().length){clearDetail();return;}
    if(face==='timeline')flip('board');       // the cards belong to the board
    open={overdue:true};showSlice();
  }
  function unplannedClick(evt){
    stopEvt(evt);
    if(open&&open.unplanned){clearDetail();return;}
    if(!unplannedTodos().length){clearDetail();return;}
    open={unplanned:true};showSlice();
  }
  function openDetail(pid,eid){
    if(open&&open.pid===pid&&open.eid===eid){clearDetail();return;}
    open={pid:pid,eid:eid,expanded:true};showSlice();
  }
  function rememberTodoExpanded(expanded){
    if(open&&((open.pid&&open.eid)||open.lead))open.expanded=!!expanded;
  }
  /* The leads line's three ways in: the line itself, the box of leads with
     no day, and a dot. Each is pressed again to close, as every other
     slice is. */
  function leadsClick(evt){
    var t=evt&&evt.target;
    if(t&&t.closest&&t.closest('.hz-lead-mark,.hz-leads-undated,.hz-leads-new'))return;
    stopEvt(evt);
    if(open&&open.leads==='all'){clearDetail();return;}
    if(!Leads.list().length){clearDetail();return;}
    if(face==='timeline')flip('board');
    open={leads:'all'};showSlice();
  }
  function leadsUndatedClick(evt){
    stopEvt(evt);
    if(open&&open.leads==='undated'){clearDetail();return;}
    open={leads:'undated'};showSlice();
  }
  function leadsNewClick(evt){
    stopEvt(evt);
    if(open&&open.leads==='new'){clearDetail();return;}
    if(!Leads.canAdd()){toast('The Semaphore has no arena to file a lead under.');return;}
    if(face==='timeline')flip('board');
    Leads.newOpen();
    open={leads:'new'};showSlice();
    afterRender(function(){var f=byId('lnew-project');if(f)f.focus({preventScroll:true});});
  }
  /* Where a lead just made from the board lands: its own card, open. */
  function showLead(key){open={lead:key,expanded:true};showSlice();}
  function leadMarkClick(el,evt){
    stopEvt(evt);
    if(el._dragged){el._dragged=false;return;}   // ignore the click ending a drag
    hideHover();
    var key=el.getAttribute('data-lead');
    if(open&&open.lead===key){clearDetail();return;}
    open={lead:key,expanded:true};showSlice();
  }
  /* Semaphore saved, or the Ledger came back into view: the line is read
     again. A slice that was showing leads is redrawn with it, keeping its
     place, because `render` keeps `open`. */
  /* Semaphore saves for things the line never shows — a filter, a card
     turned over, a sweep stamped — and every one of them used to redraw the
     whole board, shutting whatever card was open on it and taking the caret
     out of a half-written new lead. So the leads are compared with the ones
     last drawn, and the board is only redrawn when a lead has changed. */
  var leadsSeen=null;
  function leadsChanged(){
    var now=JSON.stringify(Leads.list());
    if(now===leadsSeen)return;
    leadsSeen=now;
    render();
  }
  function closeDetail(evt){if(evt)evt.stopPropagation();clearDetail();}
  function markClick(el,evt){
    stopEvt(evt);
    if(el._dragged){el._dragged=false;return;}   // ignore the click ending a drag
    hideHover();
    openDetail(el.getAttribute('data-pid'),el.getAttribute('data-eid'));
  }

  /* ── Dragging a marker to another day ── */
  function dragStart(el,ev){
    var track=el.parentElement;if(!track)return;
    ev.preventDefault();
    hideHover();
    drag={el:el,track:track,startX:ev.clientX,moved:false,
      days:parseInt(track.getAttribute('data-days'),10)||21,
      startIso:track.getAttribute('data-start')||mondayIso(),
      origLeft:el.style.left,origTop:el.style.marginTop,newIso:null};
    try{el.setPointerCapture(ev.pointerId);}catch(e){}
    el.classList.add('dragging');
    document.addEventListener('pointermove',dragMove);
    document.addEventListener('pointerup',dragEnd);
    document.addEventListener('pointercancel',dragCancel);
  }
  function dragMove(ev){
    if(!drag)return;
    if(!drag.moved&&Math.abs(ev.clientX-drag.startX)<3)return;   // tolerate a shaky click
    drag.moved=true;
    var r=drag.track.getBoundingClientRect();
    var idx=Math.max(0,Math.min(drag.days-1,Math.floor((ev.clientX-r.left)/(r.width/drag.days))));
    drag.newIso=addDays(drag.startIso,idx);
    drag.el.style.left=(((idx+0.5)/drag.days)*100).toFixed(3)+'%';
    /* A dot lifted out of a cluster goes back on the rail while it is
       carried, so what is under the pointer is the day it will land on
       and not a corner of the shape it came from. */
    drag.el.style.marginTop='';
    /* The same label, at one row: the mark being carried and the day it
       will land on. It used to be a colour bar and a date, which was the
       old label's shape and is nobody's shape now. */
    var tip=hoverEl();
    var dt=new Date(drag.newIso+'T00:00:00');
    tip.className='hz-lbl hz-lbl-float hz-lbl-drag';
    tip.innerHTML='<span class="hz-lbl-row">'
      +'<span class="hz-lbl-dot'
        +(drag.el.getAttribute('data-kind')==='dl'?' dl':'')+'" '
        +'style="--c:'+safeColor(drag.el.getAttribute('data-col'))+'"></span>'
      +'<span class="hz-lbl-txt">'+['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][(dt.getDay()+6)%7]
      +' '+dt.getDate()+' '+MON3[dt.getMonth()]+'</span></span>';
    tip.style.display='flex';
    tip.style.left='0px';tip.style.top='0px';        // the origin — see showCellHover
    var pr=tip.getBoundingClientRect();
    var er=drag.el.getBoundingClientRect();
    var dbar=q('.oa-bar'),dceil=(dbar?dbar.getBoundingClientRect().bottom:0)+8;
    var tl=Math.max(8,Math.min(er.left+er.width/2-pr.width/2,window.innerWidth-pr.width-8));
    var tt=er.top-pr.height-9;
    if(tt<dceil)tt=er.bottom+9;
    tip.style.left=(tl-pr.left)+'px';
    tip.style.top=(tt-pr.top)+'px';
  }
  function dragTeardown(){
    document.removeEventListener('pointermove',dragMove);
    document.removeEventListener('pointerup',dragEnd);
    document.removeEventListener('pointercancel',dragCancel);
  }
  function dragCancel(){
    if(drag){
      drag.el.style.left=drag.origLeft;
      drag.el.style.marginTop=drag.origTop;
      drag.el.classList.remove('dragging');
      drag=null;
    }
    hideHover();dragTeardown();
  }
  function dragEnd(){
    var d=drag;if(!d){dragTeardown();return;}
    d.el.classList.remove('dragging');
    hideHover();dragTeardown();
    drag=null;
    if(!d.moved||!d.newIso)return;              // a plain click, not a drag
    d.el._dragged=true;                          // suppress the click that follows
    /* A lead's dot moves the lead's day, in the Semaphore, through the same
       door the date on its card uses (Mark asked to drag them like todos,
       2026-10-06). Its save redraws this board, so nothing is drawn here. */
    var lk=d.el.getAttribute('data-lead');
    if(lk){Leads.due(lk,d.newIso);return;}
    var t=findTodo(d.el.getAttribute('data-pid'),d.el.getAttribute('data-eid'));
    if(!t)return;
    var dpid=d.el.getAttribute('data-pid'),followed=0;
    if(d.el.getAttribute('data-kind')==='dl')t.deadline=d.newIso;
    else{
      t.dueDate=d.newIso;
      retieTodo(projects[dpid],t);
      /* Only the planned date carries. A deadline is somebody else's date
         — a call closing, a review — and moving it says nothing about
         when the work waiting behind it can be done. */
      followed=moveWaiters(projects[dpid],t.id,d.newIso);
    }
    stampEdited(t);
    save();
    renderHorizon();
    waitMovedNote(followed);
  }

  function bindBoard(){
    var host=byId('horizon-container');
    if(!host||host._bound)return;
    host._bound=true;
    /* mousemove and not mouseover, because a cell is a region and not an
       element — crossing from one day into the next inside the same lane
       fires no mouseover at all. `hoverCell` makes the repeats free: the
       label is only rebuilt when the pointer has actually changed cell. */
    host.addEventListener('mousemove',function(ev){
      var track=ev.target.closest&&ev.target.closest('.hz-proj-track');
      if(!track||drag){if(!track)hideHover();return;}
      var row=track.closest('.hz-proj');
      var pid=row&&(row.getAttribute('data-pid')
        ||(function(){var b=q('.hz-proj-open,[data-pid]',row);return b&&b.getAttribute('data-pid');})());
      /* The General lane is flat and names a call rather than a project,
         so the project is found from the mark that was drawn in it. */
      if(!pid){var any=q('.hz-mark,.hz-dl',track);pid=any&&any.getAttribute('data-pid');}
      var cell=pid&&cellAt(track,ev.clientX);
      if(!cell){hideHover();return;}
      showCellHover(track,pid,cell.iso,cell);
    });
    host.addEventListener('mouseleave',hideHover);
    host.addEventListener('pointerdown',function(ev){
      var m=ev.target.closest&&ev.target.closest('.hz-mark,.hz-dl');
      if(!m||ev.button)return;
      dragStart(m,ev);
    });
    /* Document- and window-level listeners get their own flags: the
       container element can be replaced (resetting its flag) while these
       remain attached, which would stack a copy on every render. */
    if(!docBound){
      docBound=true;
      document.addEventListener('keydown',function(ev){
        if(ev.key!=='Escape')return;
        if(drag)dragCancel(); else clearDetail();
      });
    }
    if(!resizeBound){
      resizeBound=true;
      var rt;
      window.addEventListener('resize',function(){
        clearTimeout(rt);rt=setTimeout(snapTrack,120);
        fitFlip();
      });
    }
  }

  /* ── The turn ── */
  function flipBtnHTML(to){
    var toTime=(to==='timeline');
    var svg=toTime
      ? '<svg viewBox="0 0 24 16" width="19" height="13" fill="none" stroke="currentColor" '
          +'stroke-width="1.6" stroke-linecap="round" aria-hidden="true">'
          +'<path d="M2.5 4h11M2.5 8h15M2.5 12h7.5"/>'
          +'<circle cx="15" cy="4" r="1.7" fill="currentColor" stroke="none"/>'
          +'<circle cx="19" cy="8" r="1.7" fill="currentColor" stroke="none"/>'
          +'<circle cx="11.5" cy="12" r="1.7" fill="currentColor" stroke="none"/></svg>'
      : '<svg viewBox="0 0 24 16" width="19" height="13" fill="none" stroke="currentColor" '
          +'stroke-width="1.5" stroke-linecap="round" aria-hidden="true">'
          +'<rect x="2.5" y="2.5" width="19" height="11" rx="1.8"/>'
          +'<path d="M8.8 2.5v11M15.2 2.5v11M2.5 6.8h19"/></svg>';
    return '<button type="button" class="hz-corner-btn" onclick="PL.flip(\''+(toTime?'timeline':'board')+'\')" '
      +'title="'+(toTime?'Turn the board over \u2014 every call deadline on one timeline'
                       :'Turn back to the coming weeks')+'" '
      +'aria-label="'+(toTime?'Show the deadline timeline':'Show the horizon board')+'">'
      +svg+'</button>';
  }
  /* The inner box has no intrinsic height (both faces are absolute), so it
     is given the height of whichever face is up. Doing that here rather
     than in CSS is what lets the page below travel with the turn. */
  function fitFlip(){
    var inner=byId('hz-flip-inner');if(!inner)return;
    var f=byId(face==='timeline'?'hz-face-time':'hz-face-board');
    if(!f)return;
    var h=f.offsetHeight;
    /* Zero means the board is hidden behind an anchored call card, not
       that the face is empty — keep the last good height. */
    if(!h)return;
    inner.style.height=h+'px';
  }
  function fitFlipSoon(){
    if(typeof requestAnimationFrame!=='function'){fitFlip();return;}
    requestAnimationFrame(function(){requestAnimationFrame(fitFlip);});
  }
  function flip(to){
    var want=(to==='timeline'||to==='board')?to:(face==='board'?'timeline':'board');
    if(want===face){fitFlip();return;}
    face=want;
    var el=byId('hz-flip');
    if(!el){renderHorizon();Beam.render();return;}
    /* A day slice belongs to the board; it means nothing against the chart. */
    if(want==='timeline'&&open){open=null;renderDetail();}
    if(want==='timeline')Timeline.refreshFace();
    Menu.close();
    el.classList.toggle('flipped',want==='timeline');
    /* A 3D object only for the length of the turn, flat again the moment
       it lands — see .hz-flip in the stylesheet for the lines it left. */
    if(turnEnd){clearTimeout(turnEnd);turnEnd=null;}
    if(Turn.can()){
      el.classList.add('turning');
      turnEnd=setTimeout(function(){
        turnEnd=null;
        var live=byId('hz-flip');
        if(live)live.classList.remove('turning');
      },FLIP_MS);
    }
    Turn.play(byId('hz-flip-inner'),'X',want==='timeline');
    /* The sheet is edge-on half-way through, which is the single instant
       nothing is visible either way — so that is when the painted face
       changes hands. Nothing is ever seen through anything. */
    cancelFaceSwap();
    var paint=function(){
      faceSwap=null;
      var live=byId('hz-flip');
      if(live)live.classList.toggle('showing-back',face==='timeline');
      fitFlip();
    };
    if(!Turn.can())paint(); else faceSwap=setTimeout(paint,FLIP_MS/2);
    fitFlip();fitFlipSoon();
    Beam.render();      // the chips change job with the face
    renderAgenda();
  }

  /* ── The chronological list, under whichever face is up ── */
  function toggleAgenda(){agendaOn=!agendaOn;renderAgenda();Beam.render();}
  function setAgenda(v){agendaOn=v;}
  function renderAgenda(){
    var host=byId('hz-agenda');if(!host)return;
    if(!agendaOn){host.innerHTML='';return;}
    host.innerHTML=Timeline.agendaHTML()
      ||'<div class="tl2-agenda"><div class="tl2-agenda-hd">Upcoming deadlines</div>'
        +'<div class="tl-empty" style="padding:1.1rem">Nothing upcoming.</div></div>';
    fitFlip();
  }

  return {
    render:render,renderHorizon:renderHorizon,
    renderAgenda:renderAgenda,clearDetail:clearDetail,resetHome:resetHome,
    openDetail:openDetail,rememberTodoExpanded:rememberTodoExpanded,
    closeDetail:closeDetail,dayClick:dayClick,dayLeadsToggle:dayLeadsToggle,
    callElClick:callElClick,
    projRowClick:projRowClick,markClick:markClick,
    gather:gather,
    overdueClick:overdueClick,unplannedClick:unplannedClick,
    leadsClick:leadsClick,leadsUndatedClick:leadsUndatedClick,
    leadMarkClick:leadMarkClick,leadsChanged:leadsChanged,
    leadsNewClick:leadsNewClick,showLead:showLead,
    weeksMenu:weeksMenu,setWeeks:setWeeks,
    flip:flip,face:function(){return face;},fitFlip:fitFlip,
    flipBtnHTML:flipBtnHTML,
    toggleAgenda:toggleAgenda,setAgenda:setAgenda,agendaOn:function(){return agendaOn;}
  };
})();

/* ══ THE TIMELINE FACE ═══════════════════════════════════════════════
   Every CALL deadline on one chart — no project todos. Each call gets a
   swimlane, so every marker belonging to the same call sits on one line,
   joined by a spine. Call membership at a glance, which colour alone
   cannot do once two calls draw similar hues.

   The page this used to live on is gone: its header, legend chips, search
   box and counter strip went with it. The beam above the board is the
   legend now, and the next deadline it repeated is already up there. */
var Timeline=(function(){

  var MONTH_OPTS=[3,6,9,12,18,24];
  var state={months:12,showPast:false,hiddenCalls:{}};
  var pinnedDot=null;

  function collect(){
    if(_tlCache)return _tlCache;
    _tlCache=collectRaw();
    return _tlCache;
  }
  /* Whether a call draws a lane at all. The beam's chips are this face's
     legend and its switches, so one for a call with no lane would be a
     switch with nothing on the other end. */
  function hasLane(callId){
    return collect().some(function(c){return c.callId===callId;});
  }
  /* One row per call that has an active project and a name. Markers are
     read straight off the call: they are stored once now, so the pass
     that used to de-duplicate the same marker mirrored onto every member
     project has nothing left to do and is gone. */
  function collectRaw(){
    var members={};
    activeProjects().forEach(function(p){
      (members[p.callId]=members[p.callId]||[]).push(p.id);
    });
    var list=[];
    Object.keys(members).forEach(function(id){
      var c=calls[id];
      if(!c||c.solo||!c.name)return;
      var marks=(c.markers||[]).filter(function(m){return m&&m.date;})
        .map(function(m){
          return {id:m.id,name:m.name||'Untitled',date:m.date,
            endDate:m.endDate||'',color:m.color||'',hard:!!m.hard,
            pid:members[id][0],callId:id};
        });
      /* This face is a chart of dates. A call with none has nothing to
         draw, no place in an ordering by what lands next, and an empty
         lane for it is a row of nothing — so it is simply not on this
         side. It keeps its chip on the board and its card as before. */
      if(!marks.length)return;
      list.push({callId:id,prefix:c.name,color:safeColor(callColorOf(c),'#c9a84c'),
        projects:members[id],markers:marks});
    });
    /* The programme is the exception, and it is the reason this is not
       simply "one lane per call": its dates are not the programme's, they
       are each project's own, taken from the topic it was written for.
       Drawn on one lane they would be a row of deadlines with nothing
       saying which proposal is due — so every Horizon project gets a lane
       of its own, named by its acronym and labelled with its topic. They
       still answer to the programme's chip, because `callId` is what the
       beam switches lanes by. */
    activeProjects().forEach(function(p){
      var own=projectMarkers(p);
      if(!own.length)return;
      list.push({callId:PROGRAMME_ID,prefix:p.name,
        color:safeColor(projColor(p),'#c9a84c'),
        projects:[p.id],meta:p.topicCode||'',
        markers:own.map(function(m){
          return {id:m.id,name:m.name||'Untitled',date:m.date,
            endDate:m.endDate||'',color:m.color||'',hard:!!m.hard,
            pid:p.id,callId:PROGRAMME_ID};
        })});
    });
    list.forEach(function(c){
      c.markers.sort(function(a,b){return a.date<b.date?-1:(a.date>b.date?1:0);});
    });
    /* Calls with the nearest upcoming deadline float to the top. This is
       deliberately NOT the board's order: the timeline answers "what lands
       next", so urgency outranks arrangement here. */
    list.sort(function(a,b){
      var an=nextDate(a.markers),bn=nextDate(b.markers);
      if(an&&bn)return an<bn?-1:(an>bn?1:a.prefix.localeCompare(b.prefix));
      if(an)return -1;
      if(bn)return 1;
      return a.prefix.localeCompare(b.prefix);
    });
    return list;
  }
  function nextDate(markers){
    var today=isoToday();
    for(var i=0;i<markers.length;i++)if(markers[i].date>=today)return markers[i].date;
    return null;
  }

  /* A plain linear scale keeps distances honest: two markers a month apart
     always look a month apart. */
  function range(){
    var start=new Date();start.setHours(0,0,0,0);
    if(state.showPast)start.setMonth(start.getMonth()-3);
    var end=new Date();end.setHours(0,0,0,0);
    end.setMonth(end.getMonth()+state.months);
    return {start:start,end:end,startMs:start.getTime(),endMs:end.getTime()};
  }
  function pct(dateStr,r){
    var t=new Date(dateStr+'T00:00:00').getTime();
    var span=r.endMs-r.startMs;
    return span<=0?0:Math.max(0,Math.min(100,((t-r.startMs)/span)*100));
  }
  function inRange(dateStr,r){
    var t=new Date(dateStr+'T00:00:00').getTime();
    return t>=r.startMs&&t<=r.endMs;
  }
  function countdown(dateStr){
    var n=daysUntil(dateStr);
    if(n<0)return {txt:Math.abs(n)+'d ago',cls:'past'};
    if(n===0)return {txt:'today',cls:'today'};
    if(n===1)return {txt:'tomorrow',cls:'urgent'};
    if(n<=14)return {txt:'in '+n+'d',cls:'urgent'};
    if(n<=60)return {txt:'in '+n+'d',cls:'soon'};
    return {txt:'in '+Math.round(n/30)+'mo',cls:'far'};
  }

  /* ── The window control: one popover holding both things that change
     what the chart covers — how far ahead it reaches, and whether it
     also looks back. */
  function winSelHTML(){
    return '<button type="button" class="opt-trigger" id="tl-win-btn" '
      +'aria-haspopup="listbox" aria-expanded="false" '
      +'aria-label="How far the timeline reaches" onclick="PL.tlWinMenu(event)">'
      +'Next '+state.months+' months'+(state.showPast?' \u00b7 past':'')+'</button>';
  }
  function winMenuHTML(){
    return MONTH_OPTS.map(function(m){
        return '<button type="button" role="option" class="opt-item'+(m===state.months?' sel':'')+'" '
          +'aria-selected="'+(m===state.months?'true':'false')+'" '
          +'onclick="PL.tlWinPick('+m+')">Next '+m+' months</button>';
      }).join('')
      +'<div class="opt-sep"></div>'
      +'<button type="button" role="option" class="opt-item'+(state.showPast?' sel':'')+'" '
        +'aria-selected="'+(state.showPast?'true':'false')+'" '
        +'onclick="PL.tlPastToggle()">Show past</button>';
  }
  function winMenu(evt){
    if(evt){evt.preventDefault();evt.stopPropagation();}
    Menu.open(byId('tl-win-btn'),winMenuHTML(),
      {id:'tl-win-menu',cls:'opt-menu',align:'right',role:'listbox'});
  }
  function winPick(m){Menu.close();setMonths(m);}
  /* A switch, unlike a length, is worth staying open for: the chart
     redraws underneath and the tick moves, so the effect is visible
     without a second trip to the menu. */
  function pastToggle(){
    state.showPast=!state.showPast;
    refreshFace();Board.renderAgenda();
    Menu.refresh(winMenuHTML());
    var b=byId('tl-win-btn');
    if(b){b.classList.add('open');b.setAttribute('aria-expanded','true');}
  }
  function setMonths(v){state.months=parseInt(v,10)||12;refreshFace();Board.renderAgenda();}
  function isHidden(callId){return !!state.hiddenCalls[callId];}
  /* Pressed from a chip while the timeline is up: it filters the chart
     instead of anchoring a card. */
  function toggleCall(callId){
    if(state.hiddenCalls[callId])delete state.hiddenCalls[callId];
    else state.hiddenCalls[callId]=true;
    refreshFace();Beam.render();Board.renderAgenda();
  }

  /* ── The face ── */
  function faceHTML(){
    var lanes=collect();
    var corner=Board.flipBtnHTML('board');
    if(!lanes.length){
      /* Two different nothings: no calls at all, or calls that simply have
         no dates on them yet. Saying the first when it is the second sends
         you off to create a call you already have. */
      var anyCall=Object.keys(calls).some(function(id){
        var c=calls[id];return c&&!c.solo&&c.name;});
      return '<div class="tl2-scroll"><div class="tl2-wrap">'
        +'<div class="tl-face-head">'+corner+'</div>'
        +'<div class="tl-empty" style="padding:1.5rem 0 2rem">'
        +(anyCall
           ? 'No key dates yet. Add one to a call \u2014 on its card, under '
             +'\u201cEdit call\u201d \u2014 and its lane appears here.'
           : 'No calls yet. Create a project with a call name (e.g. '
             +'\u201cITEA \u2014 MyProject\u201d) to see its deadlines here.')
        +'</div>'
      +'</div></div>';
    }
    var r=range();
    var visible=lanes.filter(function(c){return !state.hiddenCalls[c.callId];});
    return '<div class="tl2-scroll" tabindex="0" aria-label="Scrollable deadline timeline">'
      +'<div class="tl2-wrap">'
        +'<div class="tl-face-head">'+corner
          +'<div class="tl-face-ctl">'+winSelHTML()+'</div></div>'
        +axisHTML(r)
        +'<div class="tl2-lanes">'
          +(visible.length
             ? visible.map(function(c){return laneHTML(c,r);}).join('')
             : '<div class="tl-empty" style="padding:1.5rem 0">Every call is switched off \u2014 '
               +'press a call button above to bring it back.</div>')
          +todayLineHTML(r)
        +'</div>'
      +'</div></div>';
  }
  /* Year boundaries get a stronger tick, so a 24-month window stays
     readable instead of turning into an undifferentiated ruler. */
  function axisHTML(r){
    var ticks='',d=new Date(r.start);
    d.setDate(1);
    if(d<r.start)d.setMonth(d.getMonth()+1);
    while(d<=r.end){
      var iso=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-01';
      var isYear=(d.getMonth()===0);
      ticks+='<div class="tl2-tick'+(isYear?' year':'')+'" style="left:'+pct(iso,r).toFixed(3)+'%">'
        +'<span class="tl2-tick-lbl">'+(isYear?(MON3[0]+' '+d.getFullYear()):MON3[d.getMonth()])
        +'</span></div>';
      d.setMonth(d.getMonth()+1);
    }
    return '<div class="tl2-axis">'+ticks+'</div>';
  }
  /* Drawn inside .tl2-lanes rather than the padded wrap, so its percentage
     resolves against the same box the markers' do. */
  function todayLineHTML(r){
    var today=isoToday();
    if(!inRange(today,r))return '';
    return '<div class="tl2-today" style="left:'+pct(today,r).toFixed(3)+'%"><span>today</span></div>';
  }
  function laneHTML(c,r){
    var vis=c.markers.filter(function(m){return inRange(m.date,r);});
    var spine='';
    if(vis.length>1){
      var first=pct(vis[0].date,r),last=pct(vis[vis.length-1].date,r);
      spine='<div class="tl2-spine" style="left:'+first.toFixed(3)+'%;width:'
        +Math.max(0,last-first).toFixed(3)+'%"></div>';
    }
    var offCount=c.markers.length-vis.length;
    var dots=vis.map(function(m){
      var p=pct(m.date,r),cd=countdown(m.date);
      var col=m.color||c.color;
      /* `col` may be a semantic label (deadline/opening/…) rather than a
         real colour. That is fine for the dot's own var(--c), but the
         line and its date label need something renderable. */
      var lineHex=MK_HEX[col]||(/^#|^rgb|^hsl/i.test(col)?col:null)
        ||MK_HEX[c.color]||(/^#|^rgb|^hsl/i.test(c.color||'')?c.color:null)||'#c9a84c';
      /* A marker with an end date is a window (a submission period), not
         a single day. */
      var span='';
      if(m.endDate&&inRange(m.endDate,r)){
        var p2=pct(m.endDate,r);
        span='<div class="tl2-span" style="left:'+p.toFixed(3)+'%;width:'
          +Math.max(0.4,p2-p).toFixed(3)+'%;--c:'+safeColor(col)+'"></div>';
      }
      return span
        +'<button class="tl2-dot '+cd.cls+'" style="left:'+p.toFixed(3)+'%;--c:'+safeColor(col)+'" '
        +'data-pfx="'+esc(c.callId)+'" data-date="'+esc(m.date)+'" data-linec="'+esc(lineHex)+'" '
        +'onmouseenter="PL.tlDotHover(this)" onmouseleave="PL.tlDotUnhover()" '
        +'onclick="PL.tlDotClick(this,event)" '
        +'title="'+esc(c.prefix)+' \u2014 '+esc(m.name)+'\n'+esc(fmtDate(m.date))
          +(m.endDate?' \u2192 '+esc(fmtDate(m.endDate)):'')+' ('+cd.txt+')">'
        +'<span class="tl2-dot-lbl">'+esc(m.name)+'</span></button>';
    }).join('');
    return '<div class="tl2-lane" style="--c:'+safeColor(c.color)+'">'
      +'<div class="tl2-lane-head">'
        +'<span class="tl2-lane-name">'+esc(c.prefix)+'</span>'
        /* A lane that IS one project says which topic it is written for;
           counting its projects would only ever say "1 project". */
        +'<span class="tl2-lane-meta">'
          +esc(c.meta||(c.projects.length+' project'+(c.projects.length===1?'':'s')))
          +(offCount?' \u00b7 '+offCount+' outside window':'')+'</span></div>'
      +'<div class="tl2-lane-rail">'+spine+dots
        +(vis.length?'':'<span class="tl2-lane-empty">No deadlines in this window</span>')
      +'</div></div>';
  }

  /* The chart shows shape and overlap; the agenda gives exact dates you
     can act on. */
  function agendaHTML(){
    var today=isoToday(),rows=[];
    collect().filter(function(c){return !state.hiddenCalls[c.callId];}).forEach(function(c){
      c.markers.forEach(function(m){
        if(!state.showPast&&m.date<today)return;
        rows.push({c:c,m:m});
      });
    });
    if(!rows.length)return '';
    rows.sort(function(a,b){return a.m.date<b.m.date?-1:(a.m.date>b.m.date?1:0);});
    return '<div class="tl2-agenda"><div class="tl2-agenda-hd">Upcoming deadlines</div>'
      +rows.map(function(r){
        var cd=countdown(r.m.date);
        return '<button class="tl2-ag-row '+cd.cls+'" style="--c:'+safeColor(r.m.color||r.c.color)+'" '
          +'onclick="PL.gotoCall('+JSON.stringify(r.c.callId).replace(/"/g,'&quot;')+')">'
          +'<span class="tl2-ag-date">'+esc(fmtDate(r.m.date))+'</span>'
          +'<span class="tl2-ag-call">'+esc(r.c.prefix)+'</span>'
          +'<span class="tl2-ag-name">'+esc(r.m.name)
            +(r.m.endDate?'<span class="tl2-ag-end"> \u2192 '+esc(fmtDate(r.m.endDate))+'</span>':'')
          +'</span>'
          +'<span class="tl2-ag-cd '+cd.cls+'">'+cd.txt+'</span></button>';
      }).join('')+'</div>';
  }

  function refreshFace(){
    var f=byId('hz-face-time');
    if(!f)return;
    f.innerHTML=faceHTML();
    Board.fitFlip();
    requestAnimationFrame(function(){requestAnimationFrame(Board.fitFlip);});
  }

  /* ── The deadline line ──
     Hovering a dot runs a thin line up to the ruler and prints the exact
     date where it lands, on the ruler itself: a quick read, not a trip
     away from the chart. */
  function lineEl(){
    var line=byId('tl2-dl-line');
    if(!line){
      line=document.createElement('div');
      line.id='tl2-dl-line';line.className='tl2-dl-line';
      line.innerHTML='<span class="tl2-dl-date"></span>';
      document.body.appendChild(line);
    }
    return line;
  }
  function showLine(el){
    var wrap=q('.tl2-wrap');
    if(!wrap||!el)return;
    var line=lineEl();
    /* The line starts at the ruler, not at the top of the panel: the
       date rides in the axis band, so that is where the run has to begin
       for the label to land on it. */
    var axis=q('.tl2-axis',wrap);
    var top=(axis||wrap).getBoundingClientRect().top;
    var dr=el.getBoundingClientRect(),org=fixedOrigin();
    line.style.left=(dr.left+dr.width/2-org.left).toFixed(1)+'px';
    line.style.top=(top-org.top).toFixed(1)+'px';
    line.style.height=Math.max(0,(dr.top+dr.height/2)-top).toFixed(1)+'px';
    line.style.setProperty('--c',el.getAttribute('data-linec')||'#c9a84c');
    q('.tl2-dl-date',line).textContent=fmtDate(el.getAttribute('data-date'));
    line.classList.add('show');
  }
  function hideLine(){var line=byId('tl2-dl-line');if(line)line.classList.remove('show');}
  function dotHover(el){showLine(el);}
  function dotUnhover(){if(!pinnedDot)hideLine();}
  /* Devices without hover need a tap to show the date and another to
     dismiss it. */
  function dotClick(el,evt){
    if(evt)evt.stopPropagation();
    if(pinnedDot===el){pinnedDot=null;hideLine();}
    else{pinnedDot=el;showLine(el);}
  }
  function unpin(){if(pinnedDot){pinnedDot=null;hideLine();}}
  document.addEventListener('click',function(evt){
    if(pinnedDot&&!evt.target.closest('.tl2-dot'))unpin();
  });
  /* A pinned line is fixed to the viewport, so it would hang in the wrong
     place once the chart scrolls under it. Simplest correct answer: drop it. */
  document.addEventListener('scroll',unpin,true);
  window.addEventListener('resize',unpin);

  /* From the agenda: go to the call in the overview. The chart's own dots
     stopped jumping — they draw the line instead. */
  function gotoCall(callId){
    Nav.home();
    /* A call card is a board-side thing, so the sheet turns back first —
       otherwise the card would arrive behind the chart. */
    Board.flip('board');
    Nav.pressCall(callId);
    afterRender(function(){
      var card=q('.cc-flip[data-call-key="'+cssEsc(callId)+'"]');
      if(card)flashEl(card);
    });
  }
  return {faceHTML:faceHTML,agendaHTML:agendaHTML,refreshFace:refreshFace,
    winMenu:winMenu,winPick:winPick,pastToggle:pastToggle,setMonths:setMonths,
    isHidden:isHidden,hasLane:hasLane,toggleCall:toggleCall,
    dotHover:dotHover,dotUnhover:dotUnhover,dotClick:dotClick,
    gotoCall:gotoCall};
})();

/* ══ THE TRACKER SHEET ═══════════════════════════════════════════════
   A call is one workspace. Its cards stay underneath while a tracker
   receives the selected card, then sends it back to the same place. */
var Sheet=(function(){
  var TURN_MS=680;
  var EASE_IN='cubic-bezier(0.42,0,1,1)';
  var EASE_OUT='cubic-bezier(0,0,0.58,1)';
  var EASE_HEIGHT='cubic-bezier(0.45,0,0.55,1)';
  var pid=null,call=null,phase='closed',ro=null,animations=[],run=0;

  function watch(sheet){
    if(typeof ResizeObserver!=='function')return;
    if(!ro){
      ro=new ResizeObserver(function(){
        var st=byId('hz-stage'),sh=byId('ct-sheet');
        if(st&&sh&&phase==='open')st.style.height=sh.offsetHeight+'px';
      });
    }
    ro.observe(sheet);
  }
  function unwatch(){if(ro)ro.disconnect();}

  function rect(el){
    if(!el||!el.getBoundingClientRect)return null;
    var r=el.getBoundingClientRect();
    return {left:r.left,top:r.top,width:r.width,height:r.height};
  }
  function canTurn(){
    return !reducedMotion()&&typeof Element!=='undefined'&&Element.prototype.animate;
  }
  function mixRect(a,b,t){
    return {
      left:a.left+(b.left-a.left)*t,top:a.top+(b.top-a.top)*t,
      width:a.width+(b.width-a.width)*t,height:a.height+(b.height-a.height)*t
    };
  }
  function inertClone(node){
    var clone=node.cloneNode(true);
    clone.removeAttribute('id');
    qa('[id]',clone).forEach(function(el){el.removeAttribute('id');});
    qa('a,button,input,textarea,select,[contenteditable]',clone).forEach(function(el){
      el.setAttribute('tabindex','-1');
      el.removeAttribute('contenteditable');
      el.removeAttribute('autofocus');
    });
    clone.setAttribute('aria-hidden','true');
    return clone;
  }
  function capture(el){
    if(!el||!el.getBoundingClientRect)return null;
    var node=(el.closest&&el.closest('.proj-row'))||el;
    var box=rect(node),css=getComputedStyle(node),clone=inertClone(node);
    if(!box||!box.width||!box.height)return null;
    clone.style.background=css.background;
    clone.style.borderColor=css.borderColor;
    clone.style.boxShadow=css.boxShadow;
    return {
      box:box,clone:clone,
      background:css.background,borderRadius:css.borderRadius
    };
  }
  function clearFace(){
    var face=byId('ct-turn-project');
    if(!face)return;
    face.innerHTML='';
    face.style.background='';
    face.style.borderRadius='';
  }
  function prepareFace(source,target){
    var face=byId('ct-turn-project'),content=document.createElement('div');
    clearFace();
    face.style.background=source.background;
    face.style.borderRadius=source.borderRadius;
    content.className='ct-turn-project-content';
    content.style.width=source.box.width+'px';
    content.style.height=source.box.height+'px';
    source.clone.style.width='100%';
    source.clone.style.height='100%';
    content.appendChild(source.clone);
    face.appendChild(content);
    return {
      node:content,
      inverse:'scale('+(target.width/source.box.width)+','+
        (target.height/source.box.height)+')'
    };
  }
  function clearAnimations(){
    animations.splice(0).forEach(function(a){try{a.cancel();}catch(e){}});
  }
  function stopAnimations(){run++;clearAnimations();}
  function play(el,keyframes,options){
    var timing={duration:TURN_MS,easing:'linear',fill:'both'};
    Object.keys(options||{}).forEach(function(k){timing[k]=options[k];});
    var animation=el.animate(keyframes,timing);
    animation.finished.catch(function(){});
    animations.push(animation);
    return animation;
  }
  function mapRect(box,target){
    return 'translate3d('+(box.left-target.left)+'px,'+(box.top-target.top)+
      'px,0) scale('+(box.width/target.width)+','+(box.height/target.height)+')';
  }
  function midpoint(a,b){
    var mid=mixRect(a,b,0.5);
    mid.top-=Math.min(18,Math.max(8,Math.abs(b.height-a.height)*0.025));
    return mid;
  }
  function turn(source,target,face,closing){
    var outer=byId('ct-turn'),inner=byId('ct-turn-inner');
    var edge=mapRect(midpoint(source.box,target),target);
    var start=closing?'none':mapRect(source.box,target);
    var end=closing?mapRect(source.box,target):'none';
    play(outer,[
      {transform:start,offset:0,easing:EASE_IN},
      {transform:edge,offset:0.5,easing:EASE_OUT},
      {transform:end,offset:1}
    ]);
    play(face.node,closing?[
      {transform:'none',offset:0,easing:EASE_IN},
      {transform:'none',offset:0.5,easing:EASE_OUT},
      {transform:face.inverse,offset:1}
    ]:[
      {transform:face.inverse,offset:0,easing:EASE_IN},
      {transform:'none',offset:0.5,easing:EASE_OUT},
      {transform:'none',offset:1}
    ]);
    return play(inner,closing?[
      {transform:'translateZ(0) rotateX(-180deg)',offset:0,easing:EASE_IN},
      {transform:'translateZ(86px) rotateX(-90deg)',offset:0.5,easing:EASE_OUT},
      {transform:'translateZ(0) rotateX(0deg)',offset:1}
    ]:[
      {transform:'translateZ(0) rotateX(0deg)',offset:0,easing:EASE_IN},
      {transform:'translateZ(86px) rotateX(-90deg)',offset:0.5,easing:EASE_OUT},
      {transform:'translateZ(0) rotateX(-180deg)',offset:1}
    ]);
  }
  function panes(stage){
    return Array.prototype.filter.call(stage.children,function(el){
      return !el.classList.contains('ct-sheet')&&getComputedStyle(el).display!=='none';
    });
  }
  function recede(stage,closing){
    panes(stage).forEach(function(el){
      /* The horizon centres itself with a transform; recession composes it. */
      var base=getComputedStyle(el).transform;
      var at=function(extra){return (base==='none'?'':base+' ')+extra;};
      var opening=[
        {opacity:1,transform:at('translateY(0) scale(1)'),offset:0,easing:EASE_OUT},
        {opacity:0.035,transform:at('translateY(10px) scale(0.965)'),
          offset:0.52,easing:'linear'},
        {opacity:0,transform:at('translateY(12px) scale(0.96)'),offset:1}
      ];
      var returning=[
        {opacity:0,transform:at('translateY(12px) scale(0.96)'),
          offset:0,easing:'linear'},
        {opacity:0.035,transform:at('translateY(10px) scale(0.965)'),
          offset:0.48,easing:EASE_IN},
        {opacity:1,transform:at('translateY(0) scale(1)'),offset:1}
      ];
      play(el,closing?returning:opening);
    });
  }
  function resizeStage(stage,from,to){
    play(stage,[{height:from+'px'},{height:to+'px'}],{easing:EASE_HEIGHT});
  }
  function setTurnOpen(open){
    var outer=byId('ct-turn'),inner=byId('ct-turn-inner');
    if(outer)outer.style.transform='none';
    if(inner)inner.style.transform=open?'rotateX(-180deg)':'rotateX(0deg)';
  }
  function finishOpen(stage,sheet,height,activateCall){
    stage.classList.add('sheet-only');
    setTurnOpen(true);
    stage.style.height=height+'px';
    sheet.classList.remove('turning');
    stage.classList.remove('sheet-turning');
    phase='open';
    if(activateCall)Nav.activate(call);
    clearFace();
    clearAnimations();
    watch(sheet);
    Beam.render();
  }
  function finishClosed(stage,sheet){
    unwatch();
    sheet.classList.remove('mounted','turning');
    sheet.setAttribute('aria-hidden','true');
    stage.classList.remove('sheet-only','sheet-turning');
    stage.style.height='';
    var view=byId('ct-view');if(view)view.classList.remove('active');
    setTurnOpen(false);
    clearFace();
    clearAnimations();
    pid=null;call=null;phase='closed';
    Beam.render();
  }

  function open(id,el){
    var p=projects[id];
    var stage=byId('hz-stage'),sheet=byId('ct-sheet');
    if(!p||!stage||!sheet)return;
    if(phase!=='closed'){
      if(pid===id)return;
      close(true);
    }

    var fromHorizon=!!(el&&el.closest&&el.closest('#horizon-container'));
    var source=fromHorizon?null:capture(el);
    if(!fromHorizon&&!source)return;
    var stageH=stage.offsetHeight;
    stopAnimations();unwatch();
    pid=id;
    call=(p.id===INBOX_ID)?'__inbox__':p.callId;
    phase='opening';

    /* Horizon entry is navigation, not an object turn. Prepare the call
       workspace while hidden, then show its tracker directly. */
    if(fromHorizon){
      stage.style.height=stageH+'px';
      stage.classList.add('sheet-only');
      Nav.activate(call);
      Beam.render();
      sheet.classList.add('mounted');
      sheet.setAttribute('aria-hidden','false');
      setTurnOpen(true);
      Tracker.open(id);
      finishOpen(stage,sheet,sheet.offsetHeight,false);
      return;
    }

    stage.classList.remove('sheet-only');
    stage.classList.add('sheet-turning');
    stage.style.height=stageH+'px';
    Nav.activate(call);
    Beam.render();
    sheet.classList.add('mounted','turning');
    sheet.setAttribute('aria-hidden','false');
    setTurnOpen(false);
    Tracker.open(id);
    var target=rect(byId('ct-turn')),height=sheet.offsetHeight;
    if(!target||!target.width||!target.height){
      finishOpen(stage,sheet,height,false);
      return;
    }
    var face=prepareFace(source,target);
    if(!canTurn()){
      finishOpen(stage,sheet,height,false);
      return;
    }
    var token=run;
    recede(stage,false);
    resizeStage(stage,stageH,height);
    turn(source,target,face,false).finished.then(function(){
      if(token===run&&phase==='opening')finishOpen(stage,sheet,height,false);
    },function(){});
  }

  function close(instant){
    var stage=byId('hz-stage'),sheet=byId('ct-sheet');
    if(!stage||!sheet||!sheet.classList.contains('mounted'))return;
    if(phase==='closing'&&!instant)return;
    /* End row editing before measuring the sheet, so the return turn starts
       from the settled tracker height rather than changing mid-animation. */
    Tracker.closeEdit();
    var wasOpening=phase==='opening',closingId=pid;
    stopAnimations();unwatch();
    if(instant||wasOpening){finishClosed(stage,sheet);return;}
    phase='closing';

    /* Refresh the card before revealing it: PM and tracker edits made
       inside the sheet must already be visible at the landing point. */
    setTurnOpen(true);
    stage.classList.add('sheet-only');
    if(Nav.anchor()!==call)Nav.activate(call); else CallCard.render();
    var destination=capture(byId('pc-'+closingId));
    var target=rect(byId('ct-turn')),startH=sheet.offsetHeight;
    stage.style.height='';
    var endH=stage.offsetHeight;
    stage.style.height=startH+'px';
    if(!destination||!target||!target.width||!target.height){
      finishClosed(stage,sheet);
      return;
    }
    var face=prepareFace(destination,target);
    sheet.classList.add('turning');
    stage.classList.add('sheet-turning');
    if(!canTurn()){
      stage.classList.remove('sheet-only');
      finishClosed(stage,sheet);
      return;
    }
    var token=run;
    recede(stage,true);
    resizeStage(stage,startH,endH);
    var master=turn(destination,target,face,true);
    stage.classList.remove('sheet-only');
    master.finished.then(function(){
      if(token===run&&phase==='closing')finishClosed(stage,sheet);
    },function(){});
  }
  return {open:open,close:close,
    pid:function(){return pid;},call:function(){return call;}};
})();

/* ══ THE TODO CARD ═══════════════════════════════════════════════════
   One renderer for every slice the board opens. Collapsed it shows the
   project, the text, the checklist cue and the date; expanded, every
   control on it works — updates, editing, the checklist, dates, done,
   delete — wherever it happens to be drawn. */
var TodoCard=(function(){

  /* `opts` is what the slice around the card knows and the card cannot:
     whether the project name on this row is a press that gathers the day.
     It used to carry a second answer — which of the card's labels the
     brace had already said — and does not need to any more: the category
     word is off every card, so there is nothing left to suppress. */
  function html(e,p,opts){
    opts=opts||{};
    var days=e.dueDate?daysUntil(e.dueDate):null;
    var dueCls=days===null?'':days<0?'todo-due-overdue':days===0?'todo-due-today'
      :days<=6?'todo-due-soon':days<=13?'todo-due-nextweek':'';
    var pid=p.id,eid=e.id;

    var subInner=(e.subStamps&&e.subStamps.length)
      ?'<div class="substamps">'+e.subStamps.map(function(s,si){
          return substampHTML(s,'PL.delSubStamp(\''+pid+'\',\''+eid+'\','+si+',event)');
        }).reverse().join('')+'</div>'
      :'';

    /* ── Waiting on ──
       Built here, ahead of the header that shows it, because `waitPick`
       right below reads `blk` before drawing its own dot, and a `var`
       declared further down is still `undefined` up here, hoisting or not
       — both it and `blkChip` (placed on the row once the header is
       assembled, further down) have to draw off the one true answer.

       The chip carries the BLOCKER's category colour and word rather than
       the blocked todo's own: what you need off a glance is not which
       todo is in the way but what KIND of thing is — "this one is stuck
       behind a budget question", "this one is waiting on the consortium"
       — and the day is already teaching you that palette in its braces
       and on the board. The exact todo is one press and one tooltip away,
       which is the right depth for it.

       Open and cleared are one chip in two states rather than two chips.
       A wait that is over is worth seeing for as long as the todo is still
       there to be done — it is the sentence "you can go now" — so it stays
       and goes quiet, ringed instead of filled, in the room's own grey.
       A blocker with no category of its own says the plain word instead of
       an empty one, in that same grey. */
    var blk=blockerOf(p,e);
    /* ── Pointing at the blocker without leaving the card ──
       Two controls on this card name the todo that has to happen first —
       the chip in the header and the picker on the action row — and
       neither could say WHERE it is. Mark asked for the hover to answer
       that: pass over either one and the todo it names lights up while
       the rest of the list falls back, so the eye finds it without a
       press and without losing the card it started from.

       The same pair of handlers on both, because the two controls say the
       same fact and a fact said twice must behave the same way twice. It
       does nothing at all when the blocker is not drawn on this screen —
       most often it sits on another day — since a list that fades with
       nothing lit is a promise the page cannot keep; the chip's click,
       which opens the blocker as its own slice, is still the answer then,
       and the tooltip still says which todo it is. An iPad has no hover
       and loses nothing: on it the click was always the whole control. */
    var blkLit=blk
      ?' onmouseenter="PL.litBlocker(this,\''+jsq(blk.p.id)+'\',\''+jsq(blk.e.id)+'\')"'
       +' onmouseleave="PL.unlitBlocker()"'
      :'';
    var blkChip='',blkTint='#a08b5e';
    if(blk){
      var bOpen=!blk.e.done;
      var bCat=catLabel(blk.e.category);
      var bCol=bOpen&&bCat?catColor(blk.e.category):'#a08b5e';
      blkTint=bCol;
      blkChip='<button type="button" class="todo-block'+(bOpen?'':' cleared')+'" '
        +'style="--blk:'+safeColor(bCol)+'" '
        +'title="'+esc((bOpen?'Waiting on: ':'Cleared \u2014 was waiting on: ')
          +blk.e.text+(blk.p.id===pid?'':' ('+blk.p.name+')')
          +' \u2014 click to open it')+'" '
        +'aria-label="'+esc((bOpen?'Waiting on ':'No longer waiting on ')+blk.e.text)+'" '
        +blkLit
        +'onclick="PL.openBlocker(\''+jsq(pid)+'\',\''+jsq(eid)+'\',event)">'
        +'<span class="todo-block-dot"></span>'
        +esc(bCat||(bOpen?'Waiting':'Cleared'))
        +'</button>';
    }
    /* The picker for the same fact, on the action row rather than the
       header. Category and effort both lead the header — `catBtn` and
       `effortMark`, below — so an open card has already answered them
       before the action row is even reached; waiting on has no seat up
       there, since the header only grows a chip once a todo is actually
       blocked, and a todo that is NOT waiting still needs a place to say
       so and to start one from. This is that place — the room's own menu,
       off a plain click, in the same clothes the header's pickers wear.

       It says "Make conditional" now, and not "Not waiting". Mark's own
       word for this is conditional, and the old label had the two faults a
       label can have at once: it named a state nobody is looking for —
       most todos are not waiting on anything, so the row opened by
       answering a question that had not been asked — and it named it in
       the negative, which reads as a report rather than as something you
       may press. Set, it says what it is conditional ON, which is the only
       part worth the width.

       Its weight follows its state, which is the whole reason it can sit
       this far down the row without being lost. Unset it is a ghost —
       Mark's count is that he needs it occasionally, and an occasional
       control that draws like a frequent one costs attention on every card
       it appears on. The moment something IS set it becomes a bordered
       chip carrying the blocker's own colour, because a todo that cannot
       be started yet is the most important thing its card has to say. */
    var pickPay=' data-pid="'+esc(pid)+'" data-eid="'+esc(eid)+'" '
      +'aria-haspopup="listbox" aria-expanded="false" ';
    var blkWhere=blk?blk.e.text+(blk.p.id===pid?'':' ('+blk.p.name+')'):'';
    var waitPick='<button class="todo-btn todo-btn-pick'+(blk?'':' todo-btn-quiet')+'"'
      +pickPay+blkLit
      +'title="'+esc(blk?'Conditional on: '+blkWhere
                          +' \u2014 hover to find it, click to change'
                       :'Nothing has to happen first \u2014 click to make this'
                          +' conditional on another todo')+'" '
      +'aria-label="'+esc(blk?'Conditional on '+blkWhere:'Make conditional')+'" '
      +'onclick="PL.todoWaitMenu(this,event)">'
      +'<span class="todo-btn-dot'+(blk?'':' unset')+'"'
        +(blk?' style="--c:'+safeColor(blkTint)+'"':'')+'></span>'
      +(blk?esc('Conditional on '+trunc(blk.e.text,20)):'Make conditional')+'</button>';
    /* ── The actions row, read from the left edge to the right one ──
       Rebuilt 2026-08-28 on Mark's word, and the sentence it now makes is
       the design: what this card is FOR, then what changes it, then what
       ends it.

       The two things it is for lead, because the left edge is where a hand
       goes first and the row's leading pixels are the only prominence
       nothing has to be given. Add update is the loudest control on the
       card — the room's own primary face, and the one press Mark makes
       most — with Checklist item plain-bordered beside it. Before this
       they were the fourth and fifth of nine identical pills, behind a
       state that is not a verb at all.

       Then Edit, used as often as either but changing what is already
       there rather than adding to it: a ghost, no border until the
       pointer is on it, so it is present in the row without competing for
       it. Then the conditional, which is quieter still while nothing is
       set — see `waitPick` above for why its weight moves with its state.

       The row ENDS with the two acts that end a todo, and it ends them at
       the far edge: `todo-actions-end` pushes Done to the right, a rule
       separates it, and Delete sits beyond that rule. Reaching right is
       how a card is finished, and the irreversible way of finishing it
       costs the longest reach on the row. Done wears the checklist's own
       tick box rather than a tick glyph in a label, because ticking a box
       is what this act IS everywhere else on this card, and it says
       ticking a box is what this act IS everywhere else on this card. It
       never has to show a filled state: a ticked todo leaves the board
       for its project's Completed row and is not drawn as a card again.

       Open project left the row entirely. The project's name is written on
       this card's own header two lines above, and a verb whose whole
       result is a noun already on the screen is a pill spent saying
       nothing. */
    var gap='<span class="todo-actions-gap"></span>';
    var actions='<div class="todo-actions">'
      +'<button class="todo-btn todo-btn-primary" onclick="PL.toggleAddUpdate(\'asw-'+pid+'-'+eid+'\',event)">+ Add update</button>'
      +'<button class="todo-btn" onclick="PL.focusChkAdd(\''+pid+'\',\''+eid+'\',event)">\u2611 Checklist item</button>'
      +gap
      +'<button class="todo-btn todo-btn-quiet" onclick="PL.beginEditTodo(\''+pid+'\',\''+eid+'\',event)">\u270e Edit</button>'
      +waitPick
      +'<button class="todo-btn todo-btn-done todo-actions-end" '
        +'onclick="PL.toggleTodoDone(\''+pid+'\',\''+eid+'\',event)">'
        +'<span class="todo-done-box" aria-hidden="true">\u2713</span>Done</button>'
      +gap
      +'<button class="todo-btn todo-btn-danger todo-btn-quiet" '
        +'onclick="PL.deleteTodo(\''+pid+'\',\''+eid+'\',event)">\u2715 Delete</button>'
      +'</div>';

    var addUpdate='<div class="add-substamp-wrap" id="asw-'+pid+'-'+eid+'">'
      +'<div class="add-substamp-row">'
      +'<textarea class="add-substamp-input" placeholder="Add an update\u2026" id="sub-'+pid+'-'+eid+'" '
        +'onkeydown="PL.subStampKey(event,\''+pid+'\',\''+eid+'\')" rows="2"></textarea>'
      +'<button class="btn btn-sm" onclick="PL.addSubStamp(\''+pid+'\',\''+eid+'\',event)">Add</button>'
      +'</div></div>';

    var dueLabel='No date';
    if(e.dueDate){
      var dt=new Date(e.dueDate+'T00:00:00');
      dueLabel='<span style="margin-right:8px">'+DAYS[dt.getDay()]+'</span>'
        +'<span>'+dt.getDate()+' '+MONTHS[dt.getMonth()]+' '+dt.getFullYear()+'</span>';
    }
    /* ── The effort beam ──
       Effort used to be printed on its button — `1h30`, `45m` — and a
       column of numbers is a column you read, one row at a time. A length
       is a thing you see, so a stack of sixteen sorts itself out at a
       glance instead of being worked through.

       It fills in segments of an hour: how full the first one is says
       what fraction of an hour a todo is, and how many are lit says how
       many hours. Four of them, so a full beam is four hours. Longer than
       that the beam has no room left to say anything, so it says it in
       colour instead — all four segments lit brighter, which reads as
       "full, and then some" rather than as the same four hours. The exact
       minutes stay on the button's own tooltip, which is where a figure
       you look up rather than scan belongs.

       The width is set by the smallest thing it has to tell apart. Ten
       minutes and twenty are a sixth and a third of one segment, so a
       segment has to be wide enough that a sixth of it is still visibly
       half of a third: at 21px it is about 3.5px against 7. That is what
       decides the 92, not the space available. A lit segment never draws
       under 3px, so the shortest rung on the ladder is always something.

       Still a button, and still one fixed width whatever it holds, because
       the column it keeps is what makes a stack comparable. Drawn even at
       nothing: a control that appears only once you have used it cannot be
       how you first use it. */
    var effMins=+e.effort||0,segs='';
    for(var sgi=0;sgi<EFF_SEGS;sgi++){
      var lit=Math.max(0,Math.min(1,(effMins-sgi*EFF_SEG)/EFF_SEG));
      segs+='<span class="todo-eff-seg">'
        +(lit>0?'<span class="todo-eff-fill" style="width:'+(lit*100).toFixed(1)+'%"></span>':'')
        +'</span>';
    }
    var effOver=effMins>EFF_SEG*EFF_SEGS;
    var effortMark='<button type="button" class="todo-effort'+(effMins?'':' unset')
      +(effOver?' over':'')+'" '
      +'data-pid="'+esc(pid)+'" data-eid="'+esc(eid)+'" '
      +'aria-haspopup="listbox" aria-expanded="false" '
      +'title="'+esc(effMins?'Effort \u2014 '+effortLong(effMins):'No effort set')
        +' \u2014 click to change" '
      +'aria-label="'+esc(effMins?'Effort, '+effortLong(effMins):'Effort, not set')+'" '
      +'onclick="PL.todoEffortMenu(this,event)">'+segs+'</button>';
    /* ── The category, now a dot rather than a word ──
       It was a 140px column of nine-pixel capitals immediately before the
       text — the whole label, on every card, in its own fixed column. That
       was right while a card could turn up in a list with no brace beside
       it, and it stopped being right on 2026-08-28, when every slice
       started drawing through `dayGroupsHTML`: the brace to the left of
       the run now writes the word for every card there is, and a card that
       also wrote it was the same fact twice on one row, 140px apart.

       What was still missing was the way to SET it. The word was the
       control as well as the label, so cutting it would have left the
       category unchangeable — and the day slice, which already suppressed
       the word because its brace said it, had exactly that hole: Mark
       found it and asked for a small coloured button instead.

       So: a disc in the category's colour, in the same slot the word had,
       one press from the same menu. It keeps the disc/ring rule the rest
       of this card already uses — filled when a category is set, an empty
       ring when it is not, so an unanswered question reads as unanswered
       rather than as a quiet answer — and the word itself is on the hover,
       which is where a thing you check rather than scan belongs. Before
       the text and not beside the date, because it says what this todo IS
       and belongs against the sentence it qualifies; the date is somebody
       else's fact and has its own end of the row. */
    var catSet=!!catLabel(e.category);
    var catTip=catSet?'Category \u2014 '+catLabel(e.category)+' \u2014 click to change'
                     :'No category set \u2014 click to choose one';
    var catBtn='<button type="button" class="todo-cat'+(catSet?'':' unset')+'" '
      +(catSet?'style="--c:'+safeColor(catColor(e.category))+'" ':'')
      +'data-pid="'+esc(pid)+'" data-eid="'+esc(eid)+'" '
      +'aria-haspopup="listbox" aria-expanded="false" '
      +'title="'+esc(catTip)+'" '
      +'aria-label="'+esc(catSet?'Category, '+catLabel(e.category):'Category, not set')+'" '
      +'onclick="PL.todoCatMenu(this,event)">'
      +'<span class="todo-cat-dot" aria-hidden="true"></span></button>';
    var dateLabel='<span class="todo-later-due '+dueCls+'" '
      +'title="Tap to change the due date">'
      +dueLabel
      +'<input type="text" inputmode="none" data-datefield id="tdi-'+pid+'-'+eid+'" '
      +'class="todo-date-input" value="'+esc(e.dueDate||'')+'" readonly '
      +'onclick="event.stopPropagation();PL.openDatePicker(this)" '
      +'onchange="PL.updateTodoDue(\''+pid+'\',\''+eid+'\',this.value,event)" /></span>';

    /* Effort leads the row rather than closing it. It used to sit beside
       the date at the far end, which is the right place for a number you
       read one card at a time and the wrong one for a stack of sixteen:
       at the left edge the fixed-width beams stand in a column you can run
       an eye down, and the biggest job on a day is found by looking rather
       than by reading. How long, then what kind, then what — three fixed
       columns and then the sentence. */
    /* ── One colour, and it is the category's ──
       The edge used to agree with whatever braced the card, which meant it
       said the category inside a day and said nothing at all in the four
       slices that have no braces — a todo was a different colour, or no
       colour, depending on which door you came in by. Mark asked for one:
       a todo IS its category, everywhere it is drawn, and the calls keep
       the board, where the dots and the rails and the beam's chips are
       already a legend for them.
       That costs nothing where the day is concerned, since a day's runs
       are cut by category and the brace was already this colour; what it
       buys is the project list, the call list, the overdue list and the
       unplanned list, where the cards were uniformly grey. A category
       nobody has set keeps that grey, which is the honest answer.
       The room's rule that a rule down the left margin is structure still
       holds — it is why the flank and the edge must never disagree, and
       they no longer can, because they are now the same fact. */
    var edge=catLabel(e.category)?safeColor(catColor(e.category)):'';
    return '<div class="todo-card-later'
      +(blk&&!blk.e.done?' todo-waiting':'')+'" id="todo-'+pid+'-'+eid+'"'
      +(edge?' style="--edge:'+edge+'"':'')
      +' onclick="PL.toggleTodoExpand(this,event)">'
      +'<div class="todo-later-row">'
      +effortMark
      /* Cut by category, the project name goes plain. Its call colour is
         a perfectly good signal and the wrong one here: the headings, the
         chips and every dot on the board are wearing category colours for
         as long as this view is up, and a gold project name under a gold
         Writing heading reads as agreement between two things that have
         nothing to do with each other. One meaning for colour at a time. */
      /* In a day the name is a press: it gathers that project's todos to
         the top and sends the rest of the day away, and pressing it again
         brings the day back. It reads as text until you are over it, which
         is the point — a day of sixteen cards should not look like a day
         of sixteen buttons. */
      +(opts.gather
        ?'<button type="button" class="todo-later-proj todo-proj-btn"'
          +' title="'+esc('Show only '+p.name)+'"'
          +' onclick="PL.dayGather(\''+jsq(pid)+'\',event)">'
          +esc(p.name)+'</button>'
        :'<span class="todo-later-proj">'+esc(p.name)+'</span>')
      +catBtn
      +blkChip
      +'<span class="todo-later-text">'+esc(e.text)+'</span>'
      +dateLabel
      +'</div>'
      +'<div class="todo-expand">'+actions+Checklist.html(pid,eid,e)+addUpdate+subInner+'</div>'
      +'</div>';
  }

  /* ── The effort picker ──
     The ladder in the app's own menu rather than a field of its own: the
     window length and the timeline's reach are both chosen this way, and
     an estimate is the same kind of choice — one of a short list, made in
     one press, with the current one ticked. */
  function effortMenuHTML(pid,eid,e){
    var item=function(m,label){
      return '<button type="button" role="option" class="opt-item'
        +((+e.effort||0)===m?' sel':'')+'" '
        +'aria-selected="'+((+e.effort||0)===m?'true':'false')+'" '
        +'onclick="PL.setTodoEffort(\''+jsq(pid)+'\',\''+jsq(eid)+'\','+m+',event)">'
        +esc(label)+'</button>';
    };
    return item(0,'Not said')+'<div class="opt-sep"></div>'
      +EFFORTS.map(function(m){return item(m,effortLong(m));}).join('');
  }
  function catMenuHTML(pid,eid,e){
    var item=function(k,label){
      return '<button type="button" role="option" class="opt-item'
        +((e.category||'')===k?' sel':'')+'" '
        +'aria-selected="'+((e.category||'')===k?'true':'false')+'" '
        +'onclick="PL.setTodoCat(\''+jsq(pid)+'\',\''+jsq(eid)+'\',\''+jsq(k)+'\',event)">'
        +esc(label)+'</button>';
    };
    return item('','Not said')+'<div class="opt-sep"></div>'
      +CATS.map(function(c){return item(c.k,c.label);}).join('');
  }
  /* ── The wait picker ──
     What has to happen first, chosen the way a category is: the room's own
     menu, off a button on the card's own row. It was a native `<select>`
     at the foot of the edit form, which was both the wrong depth and the
     wrong clothes.

     It opens on the todo's OWN project. A wait that crosses to another
     project on the same call is real — the letter waits on a budget that
     belongs to the coordinator — and the picker still reaches it, but
     Mark's own count is that it is the rare case, and a list of every open
     todo on a call is thirty lines to read for the four that were ever
     likely. So the project comes first and the call is one press away.
     The switch stays where it was put for the rest of the session:
     somebody who needed the wide list once usually needs it twice.

     It opens wide by itself when the wait already set is in another
     project, because a picker that cannot show what is currently chosen
     is lying about the state. */
  var waitWide=false,waitOn=null;
  function waitRowsHTML(p,e,pid,eid){
    var pool=(waitWide&&p.callId)?allCallProjects(p.callId):[p];
    if(!pool.length)pool=[p];
    var cur=e.blockedBy||'',out='';
    pool.forEach(function(pr){
      /* Done todos are left out — a wait on something finished was over
         before it was written — and so is anything that already waits on
         this one, which is the only ring the picker can close in one
         step. */
      var rows=(pr.todos||[]).filter(function(t){
        return t.id!==e.id&&!t.done&&!blockCycles(p,e,t.id);
      }).map(function(t){
        return '<button type="button" role="option" class="opt-item'
          +(t.id===cur?' sel':'')+'" aria-selected="'+(t.id===cur?'true':'false')+'" '
          +'title="'+esc(t.text)+'" '
          +'onclick="PL.setTodoWait(\''+jsq(pid)+'\',\''+jsq(eid)+'\',\''+jsq(t.id)+'\',event)">'
          +esc(t.text.length>54?t.text.slice(0,53)+'\u2026':t.text)+'</button>';
      }).join('');
      if(!rows)return;
      /* The project's name only where there is more than one of them to
         tell apart — on the near list it would be the same word over
         every row. */
      if(pool.length>1)out+='<div class="opt-head">'+esc(pr.name)+'</div>';
      out+=rows;
    });
    return out;
  }
  function waitMenuHTML(pid,eid){
    var p=projects[pid],e=findTodo(pid,eid);
    if(!p||!e)return '';
    var rows=waitRowsHTML(p,e,pid,eid);
    var wide=!!(p.callId&&allCallProjects(p.callId).length>1);
    return (wide?'<div class="opt-switch">'
        +'<button type="button" class="opt-sw'+(waitWide?'':' on')+'" '
          +'onclick="PL.todoWaitScope(0,event)">This project</button>'
        +'<button type="button" class="opt-sw'+(waitWide?' on':'')+'" '
          +'onclick="PL.todoWaitScope(1,event)">Whole call</button>'
      +'</div>':'')
      +'<button type="button" role="option" class="opt-item'+(e.blockedBy?'':' sel')+'" '
        +'aria-selected="'+(e.blockedBy?'false':'true')+'" '
        +'onclick="PL.setTodoWait(\''+jsq(pid)+'\',\''+jsq(eid)+'\',\'\',event)">Not waiting</button>'
      +(rows?'<div class="opt-sep"></div>'+rows
            :'<div class="opt-none">'
              +(waitWide?'Nothing else open on this call.':'Nothing else open in this project.')
             +'</div>');
  }
  function waitMenu(el,evt){
    if(evt){evt.preventDefault();evt.stopPropagation();}
    var pid=el.getAttribute('data-pid'),eid=el.getAttribute('data-eid');
    var p=projects[pid],e=findTodo(pid,eid);
    if(!p||!e)return;
    waitOn={pid:pid,eid:eid};
    if(e.blockedBy&&!(p.todos||[]).some(function(t){return t.id===e.blockedBy;}))waitWide=true;
    Menu.open(el,waitMenuHTML(pid,eid),
      {id:'todo-wait-menu',cls:'opt-menu opt-menu-list',align:'center',role:'listbox'});
  }
  /* The switch is worth staying open for — the list under it is the thing
     being changed — so the menu is refilled in place rather than reopened.
     `waitOn` is what the refill needs and the button that opened it is
     gone from this call's arguments. */
  function waitScope(wide,evt){
    if(evt){evt.preventDefault();evt.stopPropagation();}
    waitWide=!!(+wide);
    if(waitOn)Menu.refresh(waitMenuHTML(waitOn.pid,waitOn.eid));
  }
  function setWait(pid,eid,tid,evt){
    if(evt)evt.stopPropagation();
    Menu.close();
    var e=findTodo(pid,eid);if(!e)return;
    /* Checked here and not only when the list was built: a second card
       open in another slice can have moved a wait under this one since. */
    if(tid&&tid!==e.blockedBy&&blockCycles(projects[pid],e,tid)){
      toast('Those two would be waiting on each other.');return;
    }
    e.blockedBy=tid||'';
    stampEdited(e);
    save();
    var card=byId('todo-'+pid+'-'+eid);
    var wasOpen=!!(card&&card.classList.contains('open'));
    Board.render();
    var again=byId('todo-'+pid+'-'+eid);
    if(again&&wasOpen)again.classList.add('open');
  }
  function catMenu(el,evt){
    if(evt){evt.preventDefault();evt.stopPropagation();}
    var pid=el.getAttribute('data-pid'),eid=el.getAttribute('data-eid');
    var e=findTodo(pid,eid);if(!e)return;
    Menu.open(el,catMenuHTML(pid,eid,e),
      {id:'todo-cat-menu',cls:'opt-menu',align:'center',role:'listbox'});
  }
  /* Setting one costs a render, because the day's own summary line counts
     categories up and would otherwise go on saying the old total. The card
     that was open when the menu was used is put back the way it was found,
     exactly as setting an effort does. */
  function setCat(pid,eid,k,evt){
    if(evt)evt.stopPropagation();
    Menu.close();
    var e=findTodo(pid,eid);if(!e)return;
    e.category=k||'';
    stampEdited(e);
    save();
    var card=byId('todo-'+pid+'-'+eid);
    var wasOpen=!!(card&&card.classList.contains('open'));
    Board.render();
    var again=byId('todo-'+pid+'-'+eid);
    if(again&&wasOpen)again.classList.add('open');
  }
  function effortMenu(el,evt){
    /* The row is a click target of its own — the whole card opens on it —
       so this press must not also count as one. */
    if(evt){evt.preventDefault();evt.stopPropagation();}
    var pid=el.getAttribute('data-pid'),eid=el.getAttribute('data-eid');
    var e=findTodo(pid,eid);if(!e)return;
    Menu.open(el,effortMenuHTML(pid,eid,e),
      {id:'todo-effort-menu',cls:'opt-menu',align:'center',role:'listbox'});
  }
  function setEffort(pid,eid,mins,evt){
    if(evt)evt.stopPropagation();
    Menu.close();
    var e=findTodo(pid,eid);if(!e)return;
    e.effort=+mins||0;
    stampEdited(e);
    save();
    /* The strip under the board only hears about this through a render,
       and a render draws every card collapsed — so a card that was open
       when the menu was used is put back the way it was found. */
    var card=byId('todo-'+pid+'-'+eid);
    var wasOpen=!!(card&&card.classList.contains('open'));
    Board.render();
    var again=byId('todo-'+pid+'-'+eid);
    if(again&&wasOpen)again.classList.add('open');
  }

  /* Expanding and collapsing keeps the card comfortably in view: only
     scroll as far as needed, and never push the card's own header off the
     top, so the thing you clicked stays where you can see it. */
  function scrollIntoView(el,wasOpen){
    if(!el||!el.getBoundingClientRect)return;
    var behavior=scrollPref();
    requestAnimationFrame(function(){
      var r=el.getBoundingClientRect();
      var vh=window.innerHeight||document.documentElement.clientHeight;
      var pad=34;
      if(!wasOpen){
        var overBottom=r.bottom-(vh-pad),overTop=pad-r.top;
        if(overTop>0)window.scrollBy({top:-overTop,behavior:behavior});
        else if(overBottom>0){
          var maxShift=Math.max(0,r.top-pad);
          window.scrollBy({top:Math.min(overBottom,maxShift),behavior:behavior});
        }
      } else {
        if(r.top<pad)window.scrollBy({top:r.top-pad,behavior:behavior});
        else if(r.bottom>vh-pad){
          var shift=Math.min(r.bottom-(vh-pad),Math.max(0,r.top-pad));
          if(shift>1)window.scrollBy({top:shift,behavior:behavior});
        }
      }
    });
  }

  function toggleExpand(el,evt){
    if(el.classList.contains('editing'))return;   // only Cancel/Save may leave
    if(evt){
      var t=evt.target,node=t;
      while(node&&node!==el){
        if(node.classList&&node.classList.contains('todo-expand'))return;
        node=node.parentElement;
      }
      if(t.tagName==='INPUT'||t.tagName==='BUTTON'||t.tagName==='SELECT')return;
      var selTxt=window.getSelection&&window.getSelection().toString();
      if(selTxt)return;
    }
    var wasOpen=el.classList.contains('open');
    el.classList.toggle('open');
    if(el.closest&&el.closest('#hz-detail'))
      Board.rememberTodoExpanded(el.classList.contains('open'));
    scrollIntoView(el,wasOpen);
  }

  /* ── Updates ── */
  function refreshSubStamps(pid,eid,e){
    var card=byId('todo-'+pid+'-'+eid);
    if(!card){Board.render();return;}
    var exp=q('.todo-expand',card);if(!exp)return;
    var existing=q('.substamps',exp);
    var subs=e.subStamps||[];
    if(!subs.length){if(existing)existing.remove();return;}
    var inner=subs.map(function(s,si){
      return substampHTML(s,'PL.delSubStamp(\''+pid+'\',\''+eid+'\','+si+',event)');
    }).reverse().join('');
    if(existing)existing.innerHTML=inner;
    else{
      var d=document.createElement('div');
      d.className='substamps';d.innerHTML=inner;exp.appendChild(d);
    }
  }
  function toggleAddUpdate(wrapId,evt){
    if(evt)evt.stopPropagation();
    var wrap=byId(wrapId);if(!wrap)return;
    wrap.classList.toggle('open');
    if(wrap.classList.contains('open')){
      var inp=q('.add-substamp-input',wrap);if(inp)inp.focus();
    }
  }
  function addSubStamp(pid,eid,evt){
    if(evt)evt.stopPropagation();
    var e=findTodo(pid,eid);if(!e)return;
    var inp=byId('sub-'+pid+'-'+eid);
    if(!inp||!inp.value.trim())return;
    listOn(e,'subStamps').push({stamp:ts(),text:inp.value.trim()});
    inp.value='';save();
    refreshSubStamps(pid,eid,e);
    var wrap=byId('asw-'+pid+'-'+eid);
    if(wrap)wrap.classList.remove('open');
  }
  function subStampKey(evt,pid,eid){
    evt.stopPropagation();
    if(evt.key==='Enter'&&!evt.shiftKey){evt.preventDefault();addSubStamp(pid,eid,evt);}
  }
  function delSubStamp(pid,eid,idx,evt){
    if(evt)evt.stopPropagation();
    var e=findTodo(pid,eid);if(!e||!e.subStamps)return;
    e.subStamps.splice(idx,1);save();
    refreshSubStamps(pid,eid,e);
  }

  /* ── Dates & state ── */
  function updateDue(pid,eid,val,evt){
    if(evt)evt.stopPropagation();
    var e=findTodo(pid,eid);if(!e)return;
    e.dueDate=val||'';
    retieTodo(projects[pid],e);      // the tie is re-measured, never cut
    var followed=moveWaiters(projects[pid],e.id,e.dueDate);
    stampEdited(e);
    save();Board.render();
    waitMovedNote(followed);
  }
  /* Ticking a todo off files it: it leaves the board and reappears as a
     note on the Completed row of its project's dossier. */
  function toggleDone(pid,eid,evt){
    if(evt)evt.stopPropagation();
    var e=findTodo(pid,eid);if(!e)return;
    e.done=!e.done;
    if(e.done)e.doneAt=isoToday(); else delete e.doneAt;
    save();Board.render();
  }
  function del(pid,eid,evt){
    if(evt)evt.stopPropagation();
    var p=projects[pid];if(!p)return;
    var idx=(p.todos||[]).findIndex(function(x){return x.id===eid;});
    if(idx<0)return;
    var e=p.todos[idx];
    p.todos.splice(idx,1);save();
    if(Dossier.openCard()===pid){Dossier.rerender(pid);Beam.render();}
    else Board.render();
    toast('Todo deleted \u2014 \u201c'+trunc(plain(e.text),40)+'\u201d',{action:'Undo',onAction:function(){
      var pr=projects[pid];if(!pr)return;
      pr.todos.splice(Math.min(idx,pr.todos.length),0,e);save();
      if(Dossier.openCard()===pid){Dossier.rerender(pid);Beam.render();}
      else{
        Board.render();
        afterRender(function(){flashEl(byId('todo-'+pid+'-'+eid));});
      }
    }});
  }
  /* ── Editing in place ── */
  function beginEdit(pid,eid,evt){
    stopEvt(evt);
    var e=findTodo(pid,eid);if(!e)return;
    var card=byId('todo-'+pid+'-'+eid);
    if(!card||card.classList.contains('editing'))return;
    card.classList.add('open','editing');
    var stop=function(ev){ev.stopPropagation();};
    function makeEditable(el){
      if(!el)return;
      el.setAttribute('contenteditable','true');
      el.classList.add('inline-editable');
      el.addEventListener('mousedown',stop);
      el.addEventListener('click',stop);
      el.addEventListener('keydown',function(ev){
        ev.stopPropagation();
        if(ev.key==='Enter'){
          ev.preventDefault();
          if(ev.altKey)document.execCommand('insertLineBreak');
          else saveEdit(pid,eid);
        }
      });
    }
    var textEl=q('.todo-later-text',card);
    makeEditable(textEl);
    qa('.substamp-text',card).forEach(makeEditable);
    var actions=q('.todo-actions',card);
    if(actions)actions.style.display='none';
    var expand=q('.todo-expand',card);
    var barId='edbar-'+pid+'-'+eid;
    if(expand&&!byId(barId)){
      var bar=document.createElement('div');
      bar.id=barId;bar.className='todo-edit-bar';bar.onclick=stop;
      var pick='readonly onclick="event.stopPropagation();PL.openDatePicker(this)"';
      /* Category, the conditional and Effort are none of them here any
         more \u2014 all three are on the card itself, one press from a plain
         click, in the room's own menus (see the notes by `catBtn`,
         `effortMark` and `waitPick` above); Tied to was the fourth and is
         now set by nothing at all, see THE TIE. What is left is what
         genuinely wants a form: the two dates a todo carries, which are
         typed \u2014 or picked \u2014 rather than chosen from a short list. */
      bar.innerHTML='<label class="teb-lbl">Planned</label>'
        +'<input type="text" inputmode="none" data-datefield class="teb-due" value="'+esc(e.dueDate||'')+'" '+pick+' />'
        +'<label class="teb-lbl">Deadline</label>'
        +'<input type="text" inputmode="none" data-datefield class="teb-deadline" value="'+esc(e.deadline||'')+'" '+pick+' />'
        +'<button type="button" class="teb-clear" title="Remove deadline" '
          +'onclick="var d=this.parentElement.querySelector(\'.teb-deadline\');if(d)d.value=\'\';event.stopPropagation()">clear&nbsp;deadline</button>'
        +'<div class="teb-actions">'
          +'<button class="btn btn-sm" onclick="PL.cancelEditTodo(event)">Cancel</button>'
          +'<button class="btn btn-sm btn-primary" onclick="PL.saveEditTodo(\''+pid+'\',\''+eid+'\',event)">Save</button>'
        +'</div>';
      expand.appendChild(bar);
    }
    if(textEl){
      textEl.focus();
      var range=document.createRange();range.selectNodeContents(textEl);range.collapse(false);
      var sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);
    }
  }
  /* Following the wait. The blocker is opened as its own slice rather than
     scrolled to: it is very often on another day and quite often in
     another project, so "where is it" is the question, and the single-todo
     slice is the room's own answer to that question everywhere else. */
  function openBlocker(pid,eid,evt){
    stopEvt(evt);
    var p=projects[pid],e=findTodo(pid,eid);
    if(!p||!e)return;
    var b=blockerOf(p,e);
    if(!b){toast('That todo is gone \u2014 nothing is holding this one up.');return;}
    Board.openDetail(b.p.id,b.e.id);
  }
  /* ── Lighting the blocker where it stands ──
     The other half of the same question, for when the todo that has to
     happen first is already on the screen: rather than opening it as its
     own slice and losing the list, the list itself answers — the blocker
     takes a gold ring and everything not in the conversation falls back.

     It costs one class each way and no render, which is what lets it ride
     a hover at all. The fall-back is an opacity and this is the one place
     in the room where that is right: the room's rule is that a contrast is
     set as a colour so small text stays readable, and the whole point here
     is that these cards are NOT to be read for as long as the pointer
     rests — they are the page's background for a second, not quiet text on
     it, and every one of them is back at full strength the moment the
     pointer leaves.

     A brace goes with its run only when nothing in that run survived the
     fade, so the lit card keeps the label that says which group it is in.
     `litOn` is not an optimisation: `unlitBlocker` runs on every mouseleave
     the row can produce, and walking the pane's cards on each of them for
     classes that were never set is work no gesture should cost. */
  var litOn=false;
  function litBlocker(el,bpid,beid){
    unlitBlocker();
    var target=byId('todo-'+bpid+'-'+beid);
    if(!target)return;      // not drawn here: a fade with nothing lit is a lie
    var here=el&&el.closest?el.closest('.todo-card-later'):null;
    qa('.todo-card-later').forEach(function(c){
      if(c!==target&&c!==here)c.classList.add('todo-dim');
    });
    qa('.hz-day-grp').forEach(function(g){
      if(!q('.todo-card-later:not(.todo-dim)',g)){
        var fl=q('.hz-day-flank',g);
        if(fl)fl.classList.add('todo-dim');
      }
    });
    target.classList.add('todo-lit');
    litOn=true;
  }
  function unlitBlocker(){
    if(!litOn)return;
    qa('.todo-dim').forEach(function(c){c.classList.remove('todo-dim');});
    qa('.todo-lit').forEach(function(c){c.classList.remove('todo-lit');});
    litOn=false;
  }
  function cancelEdit(evt){
    stopEvt(evt);
    Board.render();          // a re-render restores the original values
  }
  function saveEdit(pid,eid,evt){
    stopEvt(evt);
    var e=findTodo(pid,eid);if(!e)return;
    var card=byId('todo-'+pid+'-'+eid);if(!card)return;
    var textEl=q('.todo-later-text',card);
    var newText=textEl?(textEl.innerText||textEl.textContent||'').trim():e.text;
    if(!newText){toast('A todo needs some text.');return;}
    e.text=newText;
    /* Updates display newest-first, so reverse back to source order. */
    if(Array.isArray(e.subStamps)){
      qa('.substamp-text',card).reverse().forEach(function(el,i){
        if(e.subStamps[i])e.subStamps[i].text=(el.innerText||el.textContent||'').trim();
      });
    }
    var dueInp=q('.teb-due',card),dlInp=q('.teb-deadline',card);
    var followed=0;
    if(dueInp&&dueInp.value!==e.dueDate){
      e.dueDate=dueInp.value;
      /* The same hand move as the calendar on the card, so the same
         re-measure. Without it a todo re-dated here kept its old distance
         from its key date, and the next time that date moved it jumped
         back to where it had been before this edit. */
      retieTodo(projects[pid],e);
      followed=moveWaiters(projects[pid],e.id,e.dueDate);
    }
    if(dlInp)e.deadline=dlInp.value;
    stampEdited(e);
    save();
    Board.render();
    var reopened=byId('todo-'+pid+'-'+eid);
    if(reopened)reopened.classList.add('open');
    waitMovedNote(followed);
  }

  return {html:html,catMenu:catMenu,setCat:setCat,toggleExpand:toggleExpand,
    toggleAddUpdate:toggleAddUpdate,addSubStamp:addSubStamp,subStampKey:subStampKey,
    delSubStamp:delSubStamp,
    updateDue:updateDue,toggleDone:toggleDone,del:del,
    beginEdit:beginEdit,cancelEdit:cancelEdit,saveEdit:saveEdit,
    openBlocker:openBlocker,litBlocker:litBlocker,unlitBlocker:unlitBlocker,
    waitMenu:waitMenu,setWait:setWait,waitScope:waitScope,
    effortMenu:effortMenu,setEffort:setEffort};
})();

/* ══ THE LEADS LINE ══════════════════════════════════════════════════
   Semaphore's open leads, as one line at the foot of the board and as
   cards in the list under it. Mark asked for it on 2026-10-06: the leads
   are work he has to come back to on a day, the board is where he looks
   to see his days, and keeping them in another room meant they were not
   on it.

   Nothing here is stored. The bridge fills a socket (`fill`) with a read
   of the leads as they are and a way to change one; every press on a lead
   card goes back through that, lands on Semaphore's own record, and the
   save that writes it is what redraws this line — so a lead reads the
   same on both sides because there is only one of it. Unfilled, the line
   simply is not drawn, and the room runs as it did.

   A lead is not a todo and the card does not pretend otherwise. It keeps
   the todo card's shape — the same row, the same open face, the same
   action row read left to right — so it sits in the list without a second
   idea of what a card is; but where a todo has its effort, a lead has the
   three steps Semaphore moves it through, and where a todo has Done and
   Delete, a lead has Complete, which is all Semaphore lets you do to end
   one — and which asks how it ended. Its colour is its arena type's, from the
   Semaphore's own family of tones, chosen there (see "A lead's colour"
   below).

   A lead can be started here as well (Mark, 2026-10-06): the line's name
   opens a new-lead card in the list, which files the lead under the arena
   chosen on it, in the Semaphore, at Spotted — where every lead starts. */
var Leads=(function(){
  var sock=null;
  /* The section's frame — `--lead` in the stylesheet, where the reason is
     written. */
  var COLOR='var(--lead)';
  /* ── A lead's colour ──
     A lead wears the colour of its arena's type, which Mark chooses in the
     Semaphore where the types are made (2026-10-11), and it arrives here
     ready as `tone`. It was a colour per arena, chosen on the lead from a
     palette kept here, until he asked for the leads of one kind of arena to
     look alike; the palette went to the Semaphore with the choice. A lead
     that came without one falls back on the old palette's sand. */
  function hexOf(l){return (l&&l.tone)||'#b5a690';}
  var STAGES=[['spotted','Spotted'],['contacted','Contacted'],['talking','Talking']];
  /* A card the press was made on, kept open across the redraw that press
     causes. Only the one: a list redraws shut except for the card you are
     working in, which is how every other card in the room behaves. And only
     if it was open: a day or a step changed on a shut card once came back
     opened, which Mark did not ask for (2026-10-06). */
  var keep=null;

  function fill(o){sock=(o&&o.list&&o.change)?o:null;}
  function list(){
    if(!sock)return [];
    try{return sock.list()||[];}catch(e){console.error(e);return [];}
  }
  function keyOf(l){return l.aid+'|'+l.id;}
  function find(key){
    return list().filter(function(l){return keyOf(l)===key;})[0]||null;
  }
  /* The board order inside a stage: soonest first, then the undated,
     then by name — the order Semaphore reads a section in. */
  function sorted(ls){
    var rank={spotted:0,contacted:1,talking:2};
    return ls.slice().sort(function(a,b){
      var s=rank[a.stage]-rank[b.stage];if(s)return s;
      if(a.stage==='contacted'){s=KIND_RANK[kindOf(a)]-KIND_RANK[kindOf(b)];if(s)return s;}
      if(!!a.due!==!!b.due)return a.due?-1:1;
      if(a.due&&b.due&&a.due!==b.due)return a.due<b.due?-1:1;
      return a.name.localeCompare(b.name);
    });
  }
  function change(key,op,val){
    if(!sock)return false;
    var i=key.indexOf('|');
    var c=cardOf(key);
    keep=c&&c.classList.contains('open')?key:null;
    var ok=false;
    try{ok=sock.change(key.slice(0,i),key.slice(i+1),op,val);}
    catch(e){console.error(e);}
    keep=null;
    if(!ok)toast('That lead could not be changed — it may have moved in the Semaphore.');
    return ok;
  }

  /* ── The card ── */
  /* The ruit — where the lead has got to, the same mark the Semaphore draws
     (see "the ruit" there for what each dot means and what a press does; the
     deciding is done there, once, and this only asks for it). Spotted on the
     left; the path up is the researchers asked, the path down the lead itself
     written to; Talking on the right. Same geometry in both rooms, so the two
     read as one mark. With no key it is drawn as a picture and takes no
     presses — the new-lead card shows where a lead starts. */
  var RUIT={sp:[6,13],r:[23,5],l:[23,21],t:[40,13]};
  function ruitHTML(l,key){
    var r=!!l.toResearchers,ld=!!l.toLead,talk=l.stage==='talking',st=l.stage;
    function seg(p,q,on){return '<line x1="'+p[0]+'" y1="'+p[1]+'" x2="'+q[0]+'" y2="'+q[1]+'"'+(on?' class="on"':'')+'/>';}
    var on={sp:true,r:r,l:ld,t:talk};
    var now={sp:st==='spotted',r:st==='contacted'&&r,l:st==='contacted'&&ld,t:talk};
    var NAMES={sp:'Spotted — clears both paths',r:'Researchers contacted',l:'Lead contacted',t:'Talking'};
    var V={sp:'spotted',r:'researchers',l:'lead',t:'talking'};
    return '<span class="lead-ruit'+(key?'':' still')+'" role="group" aria-label="Where this lead has got to">'
      +'<svg viewBox="0 0 46 26" aria-hidden="true">'
        +seg(RUIT.sp,RUIT.r,r)+seg(RUIT.sp,RUIT.l,ld)+seg(RUIT.r,RUIT.t,talk&&r)+seg(RUIT.l,RUIT.t,talk&&ld)
      +'</svg>'
      +['sp','r','l','t'].map(function(k){
        var cls='lead-dot'+(on[k]?' on':'')+(now[k]?' now':'');
        var pos='left:'+RUIT[k][0]+'px;top:'+RUIT[k][1]+'px';
        if(!key)return '<span class="'+cls+'" style="'+pos+'"><i></i></span>';
        return '<button type="button" class="'+cls+'" style="'+pos+'" '
          +'title="'+NAMES[k]+'" aria-label="'+NAMES[k]+'" aria-pressed="'+(on[k]?'true':'false')+'" '
          +'onclick="PL.leadPath(\''+jsq(key)+'\',\''+V[k]+'\',event)"><i></i></button>';
      }).join('')
      +'</span>';
  }
  /* The score — how much the lead is worth to Mark, one to five: the same
     numbered, coloured dot the Semaphore draws, with the same invisible menu
     over it (see "the score" there; the deciding is done there and this only
     asks for it). */
  function scoreHTML(l,key){
    var n=+l.score||0;
    var tip=n?'Worth '+n+' of 5 — click to change':'Not scored yet — click to score how valuable this lead is';
    var opts='<option value="0"'+(n?'':' selected')+'>No score</option>';
    for(var k=1;k<=5;k++)opts+='<option value="'+k+'"'+(k===n?' selected':'')+'>'+k
      +(k===1?' — least':k===5?' — most':'')+'</option>';
    return '<label class="lead-score s'+n+'" title="'+tip+'" onclick="event.stopPropagation()">'
      +'<span aria-hidden="true">'+(n||'')+'</span>'
      +'<select aria-label="How valuable this lead is, 1 to 5" '
        +'onchange="PL.leadScore(\''+jsq(key)+'\',this.value,event)">'+opts+'</select></label>';
  }
  /* the day as a todo card writes it: weekday, then the full date */
  function dueLabelHTML(iso){
    if(!iso)return 'No date';
    var dt=new Date(iso+'T00:00:00');
    return '<span style="margin-right:8px">'+DAYS[dt.getDay()]+'</span>'
      +'<span>'+dt.getDate()+' '+MONTHS[dt.getMonth()]+' '+dt.getFullYear()+'</span>';
  }
  function html(l){
    var key=keyOf(l),lid=esc(l.id),k=jsq(key);
    var days=l.due?daysUntil(l.due):null;
    var dueCls=days===null?'':days<0?'todo-due-overdue':days===0?'todo-due-today'
      :days<=6?'todo-due-soon':days<=13?'todo-due-nextweek':'';
    var dueLabel=dueLabelHTML(l.due);
    var dateLabel='<span class="todo-later-due '+dueCls+'" '
      +'title="The day to come back to this lead — tap to change it">'
      +dueLabel
      +'<input type="text" inputmode="none" data-datefield class="todo-date-input" '
      +'value="'+esc(l.due||'')+'" readonly '
      +'onclick="event.stopPropagation();PL.openDatePicker(this)" '
      +'onchange="PL.leadDue(\''+k+'\',this.value,event)" /></span>';

    var gap='<span class="todo-actions-gap"></span>';
    var actions='<div class="todo-actions">'
      +'<button class="todo-btn todo-btn-primary" onclick="PL.leadOpenBox(\'lnw-'+lid+'\',event)">+ Add update</button>'
      +'<button class="todo-btn" onclick="PL.leadOpenBox(\'llw-'+lid+'\',event)">+ Link or email</button>'
      +gap
      +'<button class="todo-btn todo-btn-quiet" onclick="PL.leadBeginEdit(\''+k+'\',event)">✎ Edit</button>'
      +'<button class="todo-btn todo-btn-done todo-actions-end" '
        +'title="Done with this one — say how it ended; it stays in the Semaphore’s record" '
        +'onclick="PL.leadDone(\''+k+'\',event)">'
        +'<span class="todo-done-box" aria-hidden="true">✓</span>Complete</button>'
      +'</div>';
    /* Complete asks how the lead ended before it closes it (Mark, 2026-10-11):
       while `lead-ending` is on, the action row gives way to the three answers
       and Cancel, as Edit gives it to Cancel and Save. */
    var ending='<div class="todo-actions lead-end"><span class="lead-end-q">How did it end?</span>'
      +END_NAME.map(function(o){
        return '<button class="todo-btn" onclick="PL.leadEnd(\''+k+'\',\''+o[0]+'\',event)">'+o[1]+'</button>';
      }).join('')
      +gap
      +'<button class="todo-btn todo-btn-quiet" onclick="PL.leadEndCancel(\''+k+'\',event)">Cancel</button>'
      +'</div>';
    /* Edit changes the card in place (Mark, 2026-10-06): it keeps its look,
       and every fact on it — the name, the match, each link's address and
       name, each update — has its field drawn beside it, shown only while
       `lead-editing` is on. A cross marks a line to go and Save keeps the
       lot through the Semaphore's own edit, so both rooms change the lead the
       same way. The action row gives way to Cancel and Save meanwhile. */
    var inp=function(cls,v,ph,extra){
      return '<input type="text" class="lead-in '+cls+'" value="'+esc(v||'')+'" placeholder="'+ph+'" '
        +'aria-label="'+ph+'" autocomplete="off"'+(extra||'')+'>';};
    var edit=''
      +'<div class="lead-ed lead-band"><span class="lead-band-k">Links</span><span class="lead-ed-links">'
        +l.links.map(function(x){
          return '<span class="lead-ed-row" data-k="'+esc(x.id)+'">'
            +inp('lead-ed-url',x.url,'https://… or name@…')+inp('lead-ed-label',x.label,'Whose, or what — optional')
            +'<button class="substamp-del" title="Take this link off when saved" aria-label="Remove link" '
              +'onclick="PL.leadEditDrop(this,event)">✕</button></span>';
        }).join('')
        +'<span class="lead-ed-row" data-k="new">'
          +inp('lead-ed-url','','https://… or name@… — add a link')+inp('lead-ed-label','','Whose, or what — optional')
        +'</span></span></div>'
      +(l.updates.length?'<div class="lead-ed substamps lead-ed-ups">'+l.updates.slice().reverse().map(function(u){
          return '<div class="substamp lead-ed-row" data-u="'+(+u.i)+'"><span class="substamp-stamp">'+esc(u.when)+'</span>'
            +'<textarea class="lead-in lead-ed-up" rows="1" aria-label="Update">'+esc(u.text)+'</textarea>'
            +'<button class="substamp-del" title="Take this line out when saved" aria-label="Remove update" '
              +'onclick="PL.leadEditDrop(this,event)">✕</button></div>';
        }).join('')+'</div>':'')
      /* Cancel and Save come after everything being edited */
      +'<div class="lead-ed lead-ed-bar"><span class="sp"></span>'
        +'<button class="todo-btn todo-btn-quiet" onclick="PL.leadCancelEdit(\''+k+'\',event)">Cancel</button>'
        +'<button class="todo-btn todo-btn-primary" onclick="PL.leadSaveEdit(\''+k+'\',event)">Save</button></div>';
    var links=l.links.length
      ?'<div class="lead-band"><span class="lead-band-k">Links</span><span class="lead-links">'
        +l.links.map(function(x){
          var nm=esc(x.name);
          var a=x.url
            ?'<a class="lead-link" href="'+esc(x.url)+'" target="_blank" rel="noopener" '
              +'title="'+esc(x.url.replace(/^mailto:/i,''))+'" onclick="event.stopPropagation()">'+nm+'</a>'
            :'<span class="lead-link">'+nm+'</span>';
          return '<span class="lead-link-wrap">'+a
            +'<button class="substamp-del" title="Take this link off" aria-label="Remove link" '
              +'onclick="PL.leadLinkDel(\''+k+'\',\''+jsq(x.id)+'\',event)">✕</button></span>';
        }).join('')
      +'</span></div>':'';
    var addLink='<div class="add-substamp-wrap" id="llw-'+lid+'"><div class="add-substamp-row">'
      +'<input type="text" class="add-substamp-input lead-link-in" id="llu-'+lid+'" placeholder="https://… or name@…" '
        +'aria-label="Link or email address" autocomplete="off" '
        +'onkeydown="PL.leadLinkKey(event,\''+k+'\')">'
      +'<input type="text" class="add-substamp-input lead-link-in" id="lll-'+lid+'" placeholder="Whose, or what — optional" '
        +'aria-label="Name it" autocomplete="off" onkeydown="PL.leadLinkKey(event,\''+k+'\')">'
      +'<button class="btn btn-sm" onclick="PL.leadAddLink(\''+k+'\',event)">Add</button>'
      +'</div></div>';
    var addNote='<div class="add-substamp-wrap" id="lnw-'+lid+'"><div class="add-substamp-row">'
      +'<textarea class="add-substamp-input" placeholder="What has happened?" id="lnt-'+lid+'" rows="2" '
        +'onkeydown="PL.leadNoteKey(event,\''+k+'\')"></textarea>'
      +'<button class="btn btn-sm" onclick="PL.leadAddNote(\''+k+'\',event)">Add</button>'
      +'</div></div>';
    /* Newest first, as a todo's updates are; Semaphore keeps them oldest
       first, and the index each one carries is its place THERE. */
    var ups=l.updates.length
      ?'<div class="substamps">'+l.updates.slice().reverse().map(function(u){
          return substampHTML({stamp:u.when,text:u.text},
            'PL.leadNoteDel(\''+k+'\','+(+u.i)+',event)');
        }).join('')+'</div>':'';

    var hex=hexOf(l);
    var colTip=(l.type?l.type+' \u2014 ':'')+'the colour of '+l.arena+'\u2019s type, chosen in the Semaphore';
    return '<div class="todo-card-later lead-card'+(keep===key?' open':'')+'" id="lead-'+lid+'" '
      +'style="--edge:'+hex+';--lead:'+hex+'" data-lead="'+esc(key)+'" '
      +'onclick="PL.toggleTodoExpand(this,event)">'
      +'<div class="todo-later-row">'
      +'<span class="lead-ruit-slot">'+ruitHTML(l,key)+'</span>'
      /* the type's colour, standing where the category stands on a todo;
         it is chosen in the Semaphore, so here it is only shown */
      +'<span class="todo-cat lead-col" style="--c:'+hex+'" title="'+esc(colTip)+'">'
        +'<span class="todo-cat-dot" aria-hidden="true"></span></span>'
      /* The arena is in the project's seat and is the way across, the way a
         project's name is: it opens that arena in the Semaphore. */
      +'<button type="button" class="todo-later-proj todo-proj-btn" '
        +'title="'+esc('Open '+l.arena+' in the Semaphore')+'" '
        +'onclick="PL.leadArena(\''+k+'\',event)">'+esc(l.arena)+'</button>'
      /* What it is, and under it, quieter, who could fit it — the match is on
         the shut card since Mark asked for it there (2026-10-06), and the
         Match band it had on the open card went with it. */
      +'<span class="todo-later-text lead-text"><span class="lead-nm">'+esc(l.name)+'</span>'
        +'<textarea class="lead-in lead-nm-in" id="lep-'+lid+'" rows="1" placeholder="What is the project?" '
          +'aria-label="What is the project?">'+esc(l.project)+'</textarea>'
        +'<span class="lead-sub'+(l.match?'':' none')+'">'+esc(l.match||'No match yet')+'</span>'
        +'<textarea class="lead-in lead-sub-in" id="lem-'+lid+'" rows="1" placeholder="Who could be a good match?" '
          +'aria-label="Who could be a good match?">'+esc(l.match)+'</textarea></span>'
      +scoreHTML(l,key)
      +dateLabel
      +'</div>'
      +'<div class="todo-expand">'+actions+ending+edit+links+addLink+addNote+ups+'</div>'
      +'</div>';
  }
  /* Contacted is two paths, and Mark asked on 2026-10-06 for the step to be
     split by them, quietly. The leads written to both ways come first: they
     are the ones most likely to answer, and Mark asked for them on top of
     the stack (2026-10-08). Then the leads whose researchers were written
     to, then the leads written to directly — the ruit's upper point over
     its lower. Each run is headed by a small ruit with only its own path
     drawn, rather than by a second brace, because it is still the one step. */
  var KIND_RANK={both:0,researchers:1,lead:2};
  var KIND_NAME={researchers:'researchers contacted',both:'both contacted',lead:'lead contacted'};
  /* How a lead ended, asked by Complete: the Semaphore's own answers in its
     own words (see OUTCOMES there), written here as the ruit is. */
  var END_NAME=[['project','Became a project'],['nowhere','Went nowhere'],['declined','They declined']];
  function kindOf(l){
    return l.toResearchers&&l.toLead?'both':(l.toResearchers?'researchers':'lead');
  }
  function kindHTML(k){
    var up=k!=='lead',dn=k!=='researchers';
    var ln=function(x1,y1,x2,y2,on){return '<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'"'+(on?' class="on"':'')+'/>';};
    return '<div class="lead-kind"><svg viewBox="0 0 16 10" aria-hidden="true">'
      +ln(1,5,8,1.5,up)+ln(8,1.5,15,5,up)+ln(1,5,8,8.5,dn)+ln(8,8.5,15,5,dn)
      +'</svg><span>'+KIND_NAME[k]+'</span></div>';
  }
  /* The list: braced by step, in Semaphore's own order — spotted, then
     contacted, then talking — because that is how a list of leads is read
     there, and the brace is the only place the step is written as a word. */
  function listHTML(ls){
    var groups=[];
    sorted(ls).forEach(function(l){
      var g=groups[groups.length-1];
      if(!g||g.stage!==l.stage){g={stage:l.stage,list:[]};groups.push(g);}
      g.list.push(l);
    });
    return groups.map(function(g){
      var nm='';STAGES.forEach(function(s){if(s[0]===g.stage)nm=s[1];});
      var n=g.list.length;
      return '<div class="hz-day-grp" style="--grp:'+COLOR+'">'
        +'<div class="hz-day-flank">'
          +'<span class="hz-day-flank-name">'+esc(nm)+'</span>'
          +'<span class="hz-day-flank-sum">'+n+' lead'+(n===1?'':'s')+'</span>'
        +'</div>'
        +'<div class="hz-day-grp-body">'+(g.stage!=='contacted'?g.list.map(html).join('')
          :g.list.map(function(l,i){
            var k=kindOf(l),prev=i?kindOf(g.list[i-1]):null;
            return (k!==prev?kindHTML(k):'')+html(l);
          }).join(''))+'</div>'
      +'</div>';
    }).join('');
  }

  /* ── A new lead ──
     A card in the list's own shape, open, with the arena where a lead's
     arena stands and the day where its day stands, and the two boxes the
     Semaphore asks a lead for under them. What has been chosen lives in
     `draft` rather than in the fields, because choosing the arena or the
     day redraws the card and must not cost what was typed. The arena is
     remembered for the next one: leads tend to come out of one sweep. */
  var draft=null,lastArena=null;
  function arenas(){
    if(!sock||!sock.arenas)return [];
    try{return sock.arenas()||[];}catch(e){console.error(e);return [];}
  }
  function canAdd(){return !!(sock&&sock.add&&arenas().length);}
  function startDraft(){
    var as=arenas();
    var keepA=as.some(function(a){return a.id===lastArena;})?lastArena:null;
    draft={aid:keepA,due:'',project:'',match:'',links:[{url:'',label:''}]};
  }
  function readDraft(){
    if(!draft)return;
    ['project','match'].forEach(function(k){
      var el=byId('lnew-'+k);if(el)draft[k]=el.value;});
    draft.links.forEach(function(k,i){
      var u=byId('lnew-url-'+i),n=byId('lnew-label-'+i);
      if(u)k.url=u.value;if(n)k.label=n.value;});
  }
  function newHTML(){
    /* whatever is typed in the card now standing is kept across the redraw */
    if(draft)readDraft(); else startDraft();
    var as=arenas(),a=as.filter(function(x){return x.id===draft.aid;})[0];
    var dueLabel='No date';
    if(draft.due){
      var dt=new Date(draft.due+'T00:00:00');
      dueLabel='<span style="margin-right:8px">'+DAYS[dt.getDay()]+'</span>'
        +'<span>'+dt.getDate()+' '+MONTHS[dt.getMonth()]+' '+dt.getFullYear()+'</span>';
    }
    return '<div class="todo-card-later lead-card lead-new open" style="--edge:'+COLOR+'">'
      +'<div class="todo-later-row">'
        +'<span class="lead-ruit-slot" aria-hidden="true">'+ruitHTML({stage:'spotted'},null)+'</span>'
        +'<button type="button" class="opt-trigger lead-new-arena'+(a?'':' unset')+'" id="lnew-arena" '
          +'aria-haspopup="listbox" aria-expanded="false" '
          +'title="The arena this lead is filed under in the Semaphore" '
          +'onclick="PL.leadNewArenaMenu(event)">'+esc(a?a.name:'Choose an arena')+'</button>'
        +'<span class="todo-later-text lead-new-title">New lead</span>'
        +'<span class="todo-later-due" title="The day to come back to it — optional">'
          +dueLabel
          +'<input type="text" inputmode="none" data-datefield class="todo-date-input" '
          +'value="'+esc(draft.due)+'" readonly '
          +'onclick="event.stopPropagation();PL.openDatePicker(this)" '
          +'onchange="PL.leadNewDue(this.value,event)" /></span>'
      +'</div>'
      +'<div class="lead-new-body">'
        +'<textarea class="add-substamp-input" id="lnew-project" rows="1" '
          +'placeholder="What is the project?" aria-label="What is the project?">'+esc(draft.project)+'</textarea>'
        +'<textarea class="add-substamp-input" id="lnew-match" rows="2" '
          +'placeholder="Who could be a good match? — optional" aria-label="Who could be a good match?">'
          +esc(draft.match)+'</textarea>'
        /* each link with its name beside it, as a link added to a lead later
           can have one, and as many as the lead was found with (Mark,
           2026-10-06) */
        +draft.links.map(function(k,i){
          var enter='onkeydown="if(event.key===\'Enter\'){event.preventDefault();PL.leadNewSave(event);}"';
          return '<div class="lead-new-link">'
            +'<input type="text" class="add-substamp-input lead-link-in" id="lnew-url-'+i+'" placeholder="https://… or name@… — a link, optional" '
              +'aria-label="Link or email address" autocomplete="off" value="'+esc(k.url)+'" '+enter+'>'
            +'<input type="text" class="add-substamp-input lead-link-in lead-link-name" id="lnew-label-'+i+'" placeholder="Whose, or what \u2014 optional" '
              +'aria-label="Name the link" autocomplete="off" value="'+esc(k.label)+'" '+enter+'>'
          +'</div>';
        }).join('')
        +'<button type="button" class="lead-new-more" onclick="PL.leadNewLink(event)">+ Another link</button>'
        +'<div class="teb-actions">'
          +'<button class="btn btn-sm" onclick="PL.closeDetail(event)">Cancel</button>'
          +'<button class="btn btn-sm btn-primary" onclick="PL.leadNewSave(event)">Add lead</button>'
        +'</div>'
      +'</div>'
    +'</div>';
  }
  function newArenaMenu(evt){
    stopEvt(evt);
    readDraft();
    var as=arenas();
    Menu.open(byId('lnew-arena'),
      as.map(function(a){
        var on=draft&&a.id===draft.aid;
        return '<button type="button" role="option" class="opt-item'+(on?' sel':'')+'" '
          +'aria-selected="'+(on?'true':'false')+'" '
          +'onclick="PL.leadNewArena(\''+jsq(a.id)+'\')">'+esc(a.name)+'</button>';
      }).join(''),
      {id:'lnew-arena-menu',cls:'opt-menu lead-arena-menu',align:'left',role:'listbox'});
  }
  function refreshNew(){
    var c=q('.lead-new');if(!c)return;
    var t=document.createElement('div');t.innerHTML=newHTML();
    c.parentNode.replaceChild(t.firstChild,c);
  }
  function newArena(aid){
    Menu.close();
    readDraft();if(!draft)return;
    draft.aid=aid;refreshNew();
    var f=byId('lnew-project');if(f)f.focus();
  }
  function newDue(v,evt){
    if(evt)evt.stopPropagation();
    readDraft();if(!draft)return;
    draft.due=v||'';refreshNew();
  }
  function newSave(evt){
    stopEvt(evt);
    readDraft();if(!draft)return;
    if(!draft.aid){toast('Choose the arena this lead belongs to.');
      var b=byId('lnew-arena');if(b)flashEl(b);return;}
    if(!draft.project.trim()&&!draft.match.trim()
      &&!draft.links.some(function(k){return k.url.trim();})){
      toast('Say what the project is.');var f=byId('lnew-project');if(f)f.focus();return;}
    var d=draft;
    lastArena=d.aid;
    draft=null;
    /* The add saves in the Semaphore, and that save redraws this board —
       with the new-lead card still open unless the slice moves first. So
       it moves first: to the lead just made, open, the way a dot opens it. */
    var lid=null;
    try{lid=sock.add(d.aid,{project:d.project,match:d.match,links:d.links,due:d.due||null});}
    catch(e){console.error(e);}
    if(!lid){draft=d;toast('The lead could not be added — is the Semaphore’s board readable?');return;}
    Board.showLead(d.aid+'|'+lid);
    toast('Lead added to the Semaphore');
  }
  function newLink(evt){
    stopEvt(evt);
    readDraft();if(!draft)return;
    draft.links.push({url:'',label:''});refreshNew();
    var f=byId('lnew-url-'+(draft.links.length-1));if(f)f.focus();
  }
  function newOpen(){startDraft();}
  function newDrop(){draft=null;}

  /* ── What the presses do ── */
  function path(key,v,evt){stopEvt(evt);change(key,'path',v);}
  function score(key,v,evt){stopEvt(evt);change(key,'score',v);}
  /* While the card is being edited the day is one more of its fields: it is
     shown and kept for Save rather than saved at once, because a save redraws
     the card and would throw away everything else typed into it. */
  function due(key,v,evt){
    if(evt)evt.stopPropagation();
    var c=cardOf(key);
    if(c&&c.classList.contains('lead-editing')){
      c.setAttribute('data-due',v||'');
      /* the label is rewritten in front of its own (invisible) field */
      var lbl=q('.todo-later-due',c),inp=lbl&&q('input',lbl);
      if(lbl&&inp){
        while(lbl.firstChild&&lbl.firstChild!==inp)lbl.removeChild(lbl.firstChild);
        var tmp=document.createElement('span');tmp.innerHTML=dueLabelHTML(v);
        while(tmp.firstChild)lbl.insertBefore(tmp.firstChild,inp);
      }
      return;
    }
    change(key,'due',v||null);
  }
  /* Complete opens the question on the card; an answer closes the lead in
     the Semaphore, and Undo reopens it there, answer and all. A lead that
     became a project is the Semaphore's to announce: the bridge opens the new
     project here with its name and links. */
  function done(key,evt){
    stopEvt(evt);
    var c=cardOf(key);if(!c)return;
    c.classList.add('open','lead-ending');
  }
  function endCancel(key,evt){
    stopEvt(evt);
    var c=cardOf(key);if(c)c.classList.remove('lead-ending');
  }
  function end(key,v,evt){
    stopEvt(evt);
    var l=find(key);if(!l)return;
    if(change(key,'done',v))
      toast('Lead completed — “'+trunc(l.name,40)+'”',{action:'Undo',onAction:function(){
        change(key,'done');}});
  }
  function arenaOf(key,evt){
    stopEvt(evt);
    var l=find(key);if(!l||!sock||!sock.open)return;
    sock.open(l.aid);
  }
  function openBox(id,evt){
    if(evt)evt.stopPropagation();
    var w=byId(id);if(!w)return;
    w.classList.toggle('open');
    if(w.classList.contains('open')){
      var f=q('input,textarea',w);if(f)f.focus();
    }
  }
  function cardOf(key){
    var l=find(key);return l?byId('lead-'+l.id):null;
  }
  function beginEdit(key,evt){
    stopEvt(evt);
    var c=cardOf(key);if(!c)return;
    c.classList.add('editing','lead-editing');
    c.classList.add('open');
    /* the boxes take the height of what is in them, so a long match or update
       is read whole rather than through a one-line slot */
    qa('textarea.lead-in',c).forEach(function(t){
      var fit=function(){t.style.height='auto';t.style.height=t.scrollHeight+'px';};
      fit();t.addEventListener('input',fit);
    });
    var f=q('.lead-nm-in',c);if(f){f.focus();f.select();}
  }
  function cancelEdit(key,evt){
    stopEvt(evt);
    var c=cardOf(key);if(c)c.classList.remove('editing','lead-editing');
  }
  function saveEdit(key,evt){
    stopEvt(evt);
    var l=find(key);if(!l)return;
    var p=byId('lep-'+l.id),m=byId('lem-'+l.id),c=cardOf(key);
    if(!p||!m||!c)return;
    var v={project:p.value,match:m.value,
      due:c.hasAttribute('data-due')?c.getAttribute('data-due'):undefined,
      links:qa('.lead-ed-links .lead-ed-row',c).map(function(r){
        return {id:r.getAttribute('data-k'),url:q('.lead-ed-url',r).value,
          label:q('.lead-ed-label',r).value,gone:r.classList.contains('gone')};}),
      updates:qa('.lead-ed-ups .lead-ed-row',c).map(function(r){
        return {i:+r.getAttribute('data-u'),text:q('.lead-ed-up',r).value,gone:r.classList.contains('gone')};})};
    if(!v.project.trim()&&!v.match.trim()&&!v.links.some(function(x){return !x.gone&&(x.url.trim()||x.label.trim());})){
      toast('A lead needs at least a project, a match or a link.');return;}
    change(key,'edit',v);
  }
  /* marks a link or an update to go when the edit is saved, and back */
  function editDrop(btn,evt){
    stopEvt(evt);
    var r=btn.closest('.lead-ed-row');if(r)r.classList.toggle('gone');
  }
  function addNote(key,evt){
    if(evt)evt.stopPropagation();
    var l=find(key);if(!l)return;
    var t=byId('lnt-'+l.id);if(!t||!t.value.trim())return;
    change(key,'note',t.value);
  }
  function noteKey(evt,key){
    evt.stopPropagation();
    if(evt.key==='Enter'&&!evt.shiftKey){evt.preventDefault();addNote(key,evt);}
  }
  function noteDel(key,i,evt){stopEvt(evt);change(key,'noteDel',i);}
  function addLink(key,evt){
    if(evt)evt.stopPropagation();
    var l=find(key);if(!l)return;
    var u=byId('llu-'+l.id),n=byId('lll-'+l.id);
    if(!u||(!u.value.trim()&&!(n&&n.value.trim())))return;
    change(key,'link',{url:u.value,label:n?n.value:''});
  }
  function linkKey(evt,key){
    evt.stopPropagation();
    if(evt.key==='Enter'){evt.preventDefault();addLink(key,evt);}
  }
  function linkDel(key,kid,evt){stopEvt(evt);change(key,'linkDel',kid);}

  return {fill:fill,list:list,keyOf:keyOf,find:find,sorted:sorted,
    html:html,listHTML:listHTML,COLOR:COLOR,hexOf:hexOf,
    canAdd:canAdd,newHTML:newHTML,newOpen:newOpen,newDrop:newDrop,
    newArenaMenu:newArenaMenu,newArena:newArena,newDue:newDue,newSave:newSave,newLink:newLink,
    path:path,score:score,due:due,done:done,end:end,endCancel:endCancel,arena:arenaOf,openBox:openBox,
    beginEdit:beginEdit,cancelEdit:cancelEdit,saveEdit:saveEdit,editDrop:editDrop,
    addNote:addNote,noteKey:noteKey,noteDel:noteDel,
    addLink:addLink,linkKey:linkKey,linkDel:linkDel,
    hexOf:hexOf};
})();

/* ══ THE CHECKLIST ═══════════════════════════════════════════════════
   A sequence attached to a todo, stored as e.checklist. Order in the
   array IS the sequence. Ticking items never touches e.done — the parent
   stays manual. Exactly one item may carry the "for this date" mark. */
var Checklist=(function(){
  var addClosing=false;   // set while an add commits, so the refresh does
                          // not restore the beam we just closed
  var drag=null;

  function list(e){if(!e.checklist)e.checklist=[];return e.checklist;}
  function stats(e){
    var l=(e&&e.checklist)||[],d=0;
    l.forEach(function(i){if(i.done)d++;});
    return {total:l.length,done:d};
  }
  function focusIdx(e){
    var l=(e&&e.checklist)||[];
    for(var i=0;i<l.length;i++)if(l[i].focus&&!l[i].done)return i;
    return -1;
  }

  /* A collapsed todo used to carry a cue here — a row of dots, or an n/m
     counter past six items — summarising the checklist in a fixed slot
     beside the date. The slot now holds the effort, and the checklist is
     read on the open card, where it is written out in full. `focusIdx`
     stays: it is a question about the list, and the list still answers it. */

  function html(pid,eid,e){
    var l=(e&&e.checklist)||[];
    var s=stats(e);
    var pct=s.total?Math.round(s.done/s.total*100):0;
    /* The expand-all control appears only when there are live items
       carrying updates — exactly the set it would open. */
    var anyNotes=l.some(function(it){return !it.done&&(it.log||[]).length;});
    var hdr=s.total
      ?'<div class="chk-hdr"><span class="chk-hdr-count">'+s.done+' / '+s.total+'</span>'
        +'<span class="chk-hdr-bar"><span class="chk-hdr-bar-fill" style="width:'+pct+'%"></span></span>'
        +(anyNotes?'<button class="chk-hdr-btn" data-chk-expand="0" '
          +'onclick="PL.toggleAllChkNotes(\''+pid+'\',\''+eid+'\',event)" '
          +'title="Show every item\u2019s updates">updates \u25be</button>':'')
        +'</div>'
      :'';
    return '<div class="chk-wrap" id="chk-'+pid+'-'+eid+'" '
      +'data-pid="'+esc(pid)+'" data-eid="'+esc(eid)+'">'
      +hdr
      +'<div class="chk-list" id="chkl-'+pid+'-'+eid+'">'
      +l.map(function(it,idx){return itemHTML(pid,eid,it,idx);}).join('')+'</div>'
      +'<div class="chk-add" id="chkadd-'+pid+'-'+eid+'">'
      +'<div class="chk-add-row">'
      +'<input type="text" class="chk-add-input" id="chka-'+pid+'-'+eid+'" '
        +'placeholder="New checklist item\u2026" onclick="event.stopPropagation()" '
        +'onblur="PL.chkAddBlur(\''+pid+'\',\''+eid+'\')" '
        +'onkeydown="PL.chkAddKey(event,\''+pid+'\',\''+eid+'\')" />'
      +'<button class="btn btn-sm" onmousedown="event.preventDefault()" '
        +'onclick="PL.addChkItem(\''+pid+'\',\''+eid+'\',event)">Add</button>'
      +'</div></div></div>';
  }

  function itemHTML(pid,eid,it,idx){
    var notes=it.log||[],hasNotes=notes.length>0;
    var isFocus=!!it.focus&&!it.done;
    var cls='chk-item'+(it.done?' chk-done':'')+(hasNotes?' chk-has-notes':'')
      +(isFocus?' chk-focus':'');
    /* Two-stage marker: closed with updates it reads "● n" and reveals
       them; open, or with none at all, it reads "＋" and opens the input. */
    var noteLabel=hasNotes?('\u25cf '+notes.length):'\uff0b';
    var noteTitle=hasNotes?(notes.length+' update'+(notes.length===1?'':'s')+' \u2014 click to show')
      :'Add an update to this item';
    /* Newest first, to sit directly under the input. Reversed AFTER
       mapping so each row keeps its true array index for deletion. */
    var notesInner=notes.map(function(n,ni){
      return '<div class="chk-note"><span class="chk-note-stamp" '
        +'title="'+esc(n.at?fmtAbs(n.at):'')+'">'+esc(n.at?fmtRel(n.at):'')+'</span>'
        +'<span class="chk-note-text">'+esc(n.text)+'</span>'
        +'<button class="chk-note-del" title="Remove update" '
        +'onclick="PL.delChkNote(\''+pid+'\',\''+eid+'\','+idx+','+ni+',event)">\u2715</button></div>';
    }).reverse().join('');
    return '<div class="'+cls+'" data-chk-idx="'+idx+'">'
      +'<span class="chk-grip" title="Drag to reorder" '
        +'onpointerdown="PL.chkGripDown(event,\''+pid+'\',\''+eid+'\','+idx+')">\u283f</span>'
      +'<button class="chk-box'+(it.done?' chk-box-done':'')+'" '
        +(it.done&&it.doneAt?'title="'+esc('Done '+fmtAbs(it.doneAt))+'" ':'')
        +'role="checkbox" aria-checked="'+(it.done?'true':'false')+'" '
        +'onclick="PL.toggleChkItem(\''+pid+'\',\''+eid+'\','+idx+',event)">\u2713</button>'
      +'<button class="chk-star'+(isFocus?' chk-star-on':'')+'" '
        +'title="'+(isFocus?'For this date \u2014 click to unmark':'Mark as the thing to do for this date')+'" '
        +'aria-pressed="'+(isFocus?'true':'false')+'" '
        +'onclick="PL.toggleChkFocus(\''+pid+'\',\''+eid+'\','+idx+',event)">'+(isFocus?'\u2605':'\u2606')+'</button>'
      +'<span class="chk-main"><span class="chk-text" title="Click to edit" '
        +'onclick="PL.editChkItem(\''+pid+'\',\''+eid+'\','+idx+',event)">'+esc(it.text)+'</span></span>'
      +'<button class="chk-note-btn" title="'+esc(noteTitle)+'" '
        +'onclick="PL.toggleChkNotes(\''+pid+'\',\''+eid+'\','+idx+',event)">'+noteLabel+'</button>'
      +'<button class="chk-del" title="Remove item" '
        +'onclick="PL.delChkItem(\''+pid+'\',\''+eid+'\','+idx+',event)">\u2715</button>'
      +'</div>'
      +'<div class="chk-notes" data-chk-notes="'+idx+'">'
      +'<div class="chk-note-add"><div class="chk-note-add-row">'
      +'<input type="text" class="chk-note-input" placeholder="Add an update\u2026" '
        +'onclick="event.stopPropagation()" onblur="PL.chkNoteBlur(this)" '
        +'onkeydown="PL.chkNoteKey(event,\''+pid+'\',\''+eid+'\','+idx+')" />'
      +'<button class="btn btn-sm" onmousedown="event.preventDefault()" '
        +'onclick="PL.addChkNote(\''+pid+'\',\''+eid+'\','+idx+',event)">Add</button>'
      +'</div></div>'+notesInner+'</div>';
  }

  /* Re-render in place, preserving which drawers were open — ticking an
     item must not collapse the drawer you were reading. */
  function refresh(pid,eid,e){
    var wrap=byId('chk-'+pid+'-'+eid);
    if(!wrap){Board.render();return;}
    var openIdx={};
    qa('.chk-item.chk-notes-open',wrap).forEach(function(el){
      openIdx[el.getAttribute('data-chk-idx')]=true;});
    var expandAll=!!q('.chk-hdr-btn[data-chk-expand="1"]',wrap);
    var addWrap=byId('chkadd-'+pid+'-'+eid);
    var addOpen=addWrap&&addWrap.classList.contains('open');
    var focused=document.activeElement;
    var refocusAdd=focused&&focused.id==='chka-'+pid+'-'+eid;
    var tmp=document.createElement('div');
    tmp.innerHTML=html(pid,eid,e);
    wrap.replaceWith(tmp.firstChild);
    var fresh=byId('chk-'+pid+'-'+eid);
    if(fresh){
      Object.keys(openIdx).forEach(function(i){
        var el=q('.chk-item[data-chk-idx="'+i+'"]',fresh);
        if(el)el.classList.add('chk-notes-open');
      });
      /* Restore expand-all silently: replaying the cascade on every tick
         or rename would be noise, not feedback. */
      if(expandAll){
        qa('.chk-item.chk-has-notes:not(.chk-done)',fresh).forEach(function(el){
          el.classList.add('chk-notes-open');});
        var hb=q('.chk-hdr-btn',fresh);
        if(hb){hb.setAttribute('data-chk-expand','1');hb.innerHTML='updates \u25b4';
          hb.title='Hide all updates';}
      }
      if(addOpen&&!addClosing){
        var aw=byId('chkadd-'+pid+'-'+eid);
        if(aw)aw.classList.add('open');
      }
    }
    if(refocusAdd&&!addClosing){var a=byId('chka-'+pid+'-'+eid);if(a)a.focus();}
  }

  /* ── Items ── */
  function addItem(pid,eid,evt,chain){
    if(evt)evt.stopPropagation();
    var e=findTodo(pid,eid);if(!e)return;
    var inp=byId('chka-'+pid+'-'+eid);if(!inp)return;
    var v=inp.value.trim();
    if(!v){                                      // an empty commit closes the beam
      var aw0=byId('chkadd-'+pid+'-'+eid);if(aw0)aw0.classList.remove('open');
      return;
    }
    list(e).push({id:uid(),text:v,done:false,doneAt:null,focus:false,log:[]});
    var newIdx=list(e).length-1;
    inp.value='';
    stampEdited(e);save();
    addClosing=!chain;
    refresh(pid,eid,e);
    addClosing=false;
    /* The input sits above the list while items append at the end, so
       mark the arrival briefly — otherwise a long checklist gives no sign
       that anything landed. */
    var freshRow=q('#chk-'+pid+'-'+eid+' .chk-item[data-chk-idx="'+newIdx+'"]');
    if(freshRow){
      freshRow.classList.add('chk-fresh');
      setTimeout(function(){freshRow.classList.remove('chk-fresh');},420);
      reveal(freshRow,{instant:true});
    }
    /* Enter chains: the beam stays open and refocused so a whole list can
       be typed in one run. The Add button ends the run. */
    var aw=byId('chkadd-'+pid+'-'+eid);
    if(chain){
      if(aw)aw.classList.add('open');
      var nx=byId('chka-'+pid+'-'+eid);
      if(nx){nx.value='';nx.focus();reveal(nx,{instant:true});}
    } else if(aw)aw.classList.remove('open');
  }
  function addKey(evt,pid,eid){
    evt.stopPropagation();
    if(evt.key==='Enter'){evt.preventDefault();addItem(pid,eid,evt,true);}
    else if(evt.key==='Escape'){
      evt.preventDefault();
      var inp=byId('chka-'+pid+'-'+eid);if(inp)inp.value='';
      var aw=byId('chkadd-'+pid+'-'+eid);if(aw)aw.classList.remove('open');
    }
  }
  function addBlur(pid,eid){
    var inp=byId('chka-'+pid+'-'+eid);
    if(inp&&inp.value.trim())return;
    var aw=byId('chkadd-'+pid+'-'+eid);
    if(aw)setTimeout(function(){
      var cur=byId('chka-'+pid+'-'+eid);
      if(cur&&(document.activeElement===cur||cur.value.trim()))return;
      aw.classList.remove('open');
    },120);
  }
  /* From the action bar: open the card, reveal the beam, focus it. */
  function focusAdd(pid,eid,evt){
    if(evt)evt.stopPropagation();
    var card=byId('todo-'+pid+'-'+eid);
    if(card&&!card.classList.contains('open'))card.classList.add('open');
    var aw=byId('chkadd-'+pid+'-'+eid);if(!aw)return;
    aw.classList.add('open');
    var a=byId('chka-'+pid+'-'+eid);
    if(a){a.focus();reveal(a,{instant:true});}
  }
  function toggleItem(pid,eid,idx,evt){
    if(evt)evt.stopPropagation();
    var e=findTodo(pid,eid);if(!e)return;
    var it=list(e)[idx];if(!it)return;
    it.done=!it.done;
    it.doneAt=it.done?nowIso():null;
    if(it.done&&it.focus)it.focus=false;   // completing the focus item clears it
    stampEdited(e);save();
    refresh(pid,eid,e);
  }
  function delItem(pid,eid,idx,evt){
    if(evt)evt.stopPropagation();
    var e=findTodo(pid,eid);if(!e)return;
    var l=list(e),it=l[idx];if(!it)return;
    function go(){
      l.splice(idx,1);
      stampEdited(e);save();
      refresh(pid,eid,e);
    }
    /* An item with updates on it is the only kind worth asking about. */
    if(!it.log||!it.log.length){go();return;}
    Dialog.ask({title:'Delete checklist item',
      body:'\u201c'+trunc(it.text,60)+'\u201d and its '+it.log.length
        +' update'+(it.log.length===1?'':'s')+' will be deleted.',
      confirm:'Delete item'},go);
  }
  /* Inline rename: swap the text span for an input, commit on Enter or blur. */
  function editItem(pid,eid,idx,evt){
    if(evt)evt.stopPropagation();
    var e=findTodo(pid,eid);if(!e)return;
    var it=list(e)[idx];if(!it)return;
    var wrap=byId('chk-'+pid+'-'+eid);if(!wrap)return;
    var row=q('.chk-item[data-chk-idx="'+idx+'"]',wrap);if(!row)return;
    var span=q('.chk-text',row);if(!span)return;
    var inp=document.createElement('input');
    inp.type='text';inp.className='chk-text-input';inp.value=it.text;
    var committed=false;
    function commit(keep){
      if(committed)return;committed=true;
      if(keep){
        var v=inp.value.trim();
        if(v&&v!==it.text){it.text=v;stampEdited(e);save();}
      }
      refresh(pid,eid,e);
    }
    inp.onclick=function(ev){ev.stopPropagation();};
    inp.onkeydown=function(ev){
      ev.stopPropagation();
      if(ev.key==='Enter'){ev.preventDefault();commit(true);}
      else if(ev.key==='Escape'){ev.preventDefault();commit(false);}
    };
    inp.onblur=function(){commit(true);};
    span.replaceWith(inp);
    inp.focus();inp.setSelectionRange(inp.value.length,inp.value.length);
  }
  function toggleFocus(pid,eid,idx,evt){
    if(evt)evt.stopPropagation();
    var e=findTodo(pid,eid);if(!e)return;
    var l=list(e),it=l[idx];if(!it)return;
    var turningOn=!it.focus;
    l.forEach(function(x){x.focus=false;});      // exactly one, ever
    it.focus=turningOn&&!it.done;
    stampEdited(e);save();
    refresh(pid,eid,e);
  }

  /* ── Per-item updates ── */
  function syncNoteBtn(row,it,open){
    var btn=row&&q('.chk-note-btn',row);if(!btn)return;
    var n=(it&&it.log&&it.log.length)||0;
    if(open||!n){
      btn.textContent='\uff0b';
      btn.title=n?'Add another update':'Add an update to this item';
    }else{
      btn.textContent='\u25cf '+n;
      btn.title=n+' update'+(n===1?'':'s')+' \u2014 click to show';
    }
  }
  function animateDrawer(drawer,delay){
    if(!drawer)return;
    drawer.classList.remove('chk-just-opened');
    void drawer.offsetWidth;
    if(delay)drawer.style.animationDelay=delay+'ms';
    drawer.classList.add('chk-just-opened');
    setTimeout(function(){
      drawer.classList.remove('chk-just-opened');
      drawer.style.animationDelay='';
    },460+(delay||0));
  }
  function toggleNotes(pid,eid,idx,evt){
    if(evt)evt.stopPropagation();
    var e=findTodo(pid,eid);
    var it=e&&list(e)[idx];
    var wrap=byId('chk-'+pid+'-'+eid);if(!wrap)return;
    var row=q('.chk-item[data-chk-idx="'+idx+'"]',wrap);if(!row)return;
    var drawer=q('.chk-notes[data-chk-notes="'+idx+'"]',wrap);
    var addWrap=drawer&&q('.chk-note-add',drawer);
    var hasNotes=!!(it&&it.log&&it.log.length);
    var isOpen=row.classList.contains('chk-notes-open');

    if(isOpen&&hasNotes&&addWrap&&!addWrap.classList.contains('open')){
      addWrap.classList.add('open');           // stage two: reveal the input
      syncNoteBtn(row,it,true);
      var i2=q('.chk-note-input',drawer);if(i2)i2.focus();
      return;
    }
    if(isOpen){
      row.classList.remove('chk-notes-open');
      if(addWrap)addWrap.classList.remove('open');
      syncNoteBtn(row,it,false);
      return;
    }
    row.classList.add('chk-notes-open');
    if(drawer){
      animateDrawer(drawer);
      if(!hasNotes){                            // nothing to read → the input
        if(addWrap)addWrap.classList.add('open');
        var inp=q('.chk-note-input',drawer);if(inp)inp.focus();
      }
      syncNoteBtn(row,it,true);
    }
  }
  function noteBlur(inp){
    if(inp.value.trim())return;
    var addWrap=inp.closest('.chk-note-add');
    if(addWrap)setTimeout(function(){
      if(document.activeElement===inp||inp.value.trim())return;
      addWrap.classList.remove('open');
      var drawer=addWrap.closest('.chk-notes');
      var row=drawer&&drawer.previousElementSibling;
      if(row&&row.classList.contains('chk-item'))syncNoteBtn(row,null,false);
    },120);
  }
  function addNote(pid,eid,idx,evt){
    if(evt)evt.stopPropagation();
    var e=findTodo(pid,eid);if(!e)return;
    var it=list(e)[idx];if(!it)return;
    var wrap=byId('chk-'+pid+'-'+eid);if(!wrap)return;
    var drawer=q('.chk-notes[data-chk-notes="'+idx+'"]',wrap);
    var inp=drawer&&q('.chk-note-input',drawer);if(!inp)return;
    var v=inp.value.trim();if(!v)return;
    if(!it.log)it.log=[];
    it.log.push({id:uid(),text:v,at:nowIso()});
    inp.value='';
    stampEdited(e);save();
    refresh(pid,eid,e);
    /* Keep the drawer open and the caret in it for a quick second update. */
    var fresh=byId('chk-'+pid+'-'+eid);
    if(fresh){
      var r=q('.chk-item[data-chk-idx="'+idx+'"]',fresh);
      if(r)r.classList.add('chk-notes-open');
      var d=q('.chk-notes[data-chk-notes="'+idx+'"]',fresh);
      var ni=d&&q('.chk-note-input',d);if(ni)ni.focus();
    }
  }
  function noteKey(evt,pid,eid,idx){
    evt.stopPropagation();
    if(evt.key==='Enter'){evt.preventDefault();addNote(pid,eid,idx,evt);}
  }
  function delNote(pid,eid,idx,nidx,evt){
    if(evt)evt.stopPropagation();
    var e=findTodo(pid,eid);if(!e)return;
    var it=list(e)[idx];if(!it||!it.log)return;
    it.log.splice(nidx,1);
    stampEdited(e);save();
    refresh(pid,eid,e);
    var fresh=byId('chk-'+pid+'-'+eid);
    if(fresh){
      var r=q('.chk-item[data-chk-idx="'+idx+'"]',fresh);
      if(r)r.classList.add('chk-notes-open');
    }
  }
  /* Expanding "all" means all the LIVE ones: finished items stay folded,
     since their updates are history rather than something still to act
     on. Collapsing closes everything, including any opened by hand. */
  function setAllNotes(pid,eid,open){
    var wrap=byId('chk-'+pid+'-'+eid);if(!wrap)return;
    var e=findTodo(pid,eid),n=0;
    qa(open?'.chk-item.chk-has-notes:not(.chk-done)':'.chk-item',wrap).forEach(function(el){
      var was=el.classList.contains('chk-notes-open');
      el.classList.toggle('chk-notes-open',open);
      var idx=el.getAttribute('data-chk-idx');
      var drawer=q('.chk-notes[data-chk-notes="'+idx+'"]',wrap);
      var aw=drawer&&q('.chk-note-add',drawer);
      if(aw)aw.classList.remove('open');        // reading many: never open inputs
      var it=e&&list(e)[parseInt(idx,10)];
      syncNoteBtn(el,it,open);
      if(open&&!was){animateDrawer(drawer,n*45);n++;}   // a cascade, not a snap
    });
    var btn=q('.chk-hdr-btn',wrap);
    if(btn){
      btn.setAttribute('data-chk-expand',open?'1':'0');
      btn.innerHTML='updates '+(open?'\u25b4':'\u25be');
      btn.title=open?'Hide all updates':'Show every item\u2019s updates';
    }
  }
  function toggleAllNotes(pid,eid,evt){
    if(evt)evt.stopPropagation();
    var wrap=byId('chk-'+pid+'-'+eid);if(!wrap)return;
    var btn=q('.chk-hdr-btn',wrap);
    setAllNotes(pid,eid,!(btn&&btn.getAttribute('data-chk-expand')==='1'));
  }
  /* Clicking outside a checklist folds its expansions back up, so a card
     returns to a clean read. Text being entered is preserved. */
  function collapseAll(wrap){
    if(!wrap)return;
    var live=q('.chk-add.open .chk-add-input,.chk-note-add.open .chk-note-input',wrap);
    if(live&&live.value.trim())return;
    /* Read off the wrap rather than split out of its id: a project id
       with a hyphen in it — the test seed's all have one — was cut at the first
       hyphen, the todo was not found, and every folded item's button
       forgot its count of updates. */
    var e=findTodo(wrap.getAttribute('data-pid'),wrap.getAttribute('data-eid'));
    qa('.chk-item.chk-notes-open',wrap).forEach(function(row){
      row.classList.remove('chk-notes-open');
      var it=e&&list(e)[parseInt(row.getAttribute('data-chk-idx'),10)];
      syncNoteBtn(row,it,false);
    });
    qa('.chk-note-add.open',wrap).forEach(function(a){a.classList.remove('open');});
    var beam=q('.chk-add.open',wrap);if(beam)beam.classList.remove('open');
    var hb=q('.chk-hdr-btn',wrap);
    if(hb&&hb.getAttribute('data-chk-expand')==='1'){
      hb.setAttribute('data-chk-expand','0');
      hb.innerHTML='updates \u25be';
      hb.title='Show every item\u2019s updates';
    }
  }
  document.addEventListener('click',function(ev){
    var wraps=qa('.chk-wrap');
    if(!wraps.length||!ev.target.closest)return;
    var inside=ev.target.closest('.chk-wrap');
    /* The Checklist item control lives in the todo's action bar, outside
       the list itself — treat a click on it as inside its own card's
       list, or this would close the beam it just opened. */
    var card=ev.target.closest('.todo-card-later');
    var ownWrap=card?q('.chk-wrap',card):null;
    wraps.forEach(function(w){if(w!==inside&&w!==ownWrap)collapseAll(w);});
  },true);

  /* ── Reorder by dragging the grip ──
     Scoped to one card, so it cannot collide with anything else. */
  function gripDown(evt,pid,eid,idx){
    evt.stopPropagation();evt.preventDefault();
    var listEl=byId('chkl-'+pid+'-'+eid);if(!listEl)return;
    var row=q('.chk-item[data-chk-idx="'+idx+'"]',listEl);if(!row)return;
    drag={pid:pid,eid:eid,from:idx,to:idx,row:row,listEl:listEl,marked:null};
    row.classList.add('chk-dragging');
    document.addEventListener('pointermove',gripMove,{passive:false});
    document.addEventListener('pointerup',gripUp);
    document.addEventListener('pointercancel',gripCancel);
  }
  function clearMark(){
    if(drag&&drag.marked){
      drag.marked.classList.remove('chk-drop-before','chk-drop-after');
      drag.marked=null;
    }
  }
  function gripMove(evt){
    if(!drag)return;
    evt.preventDefault();
    var rows=qa('.chk-item',drag.listEl);
    var y=evt.clientY,target=null,after=false;
    for(var i=0;i<rows.length;i++){
      var r=rows[i].getBoundingClientRect();
      if(y>=r.top&&y<=r.bottom){target=rows[i];after=(y>r.top+r.height/2);break;}
      if(y<r.top){target=rows[i];after=false;break;}
      target=rows[i];after=true;
    }
    clearMark();
    if(target&&target!==drag.row){
      target.classList.add(after?'chk-drop-after':'chk-drop-before');
      drag.marked=target;
      var ti=parseInt(target.getAttribute('data-chk-idx'),10);
      drag.to=after?ti+1:ti;
    } else drag.to=drag.from;
  }
  function gripUp(){
    if(!drag){gripTeardown();return;}
    var d=drag;
    clearMark();
    d.row.classList.remove('chk-dragging');
    gripTeardown();
    var from=d.from,to=d.to;
    if(to>from)to--;                     // the removal shifts the indices
    drag=null;
    if(to===from||to<0)return;
    var e=findTodo(d.pid,d.eid);if(!e)return;
    var l=list(e);
    if(from<0||from>=l.length)return;
    var moved=l.splice(from,1)[0];
    l.splice(Math.min(to,l.length),0,moved);
    stampEdited(e);save();
    refresh(d.pid,d.eid,e);
  }
  function gripCancel(){
    if(drag){clearMark();drag.row.classList.remove('chk-dragging');drag=null;}
    gripTeardown();
  }
  function gripTeardown(){
    document.removeEventListener('pointermove',gripMove);
    document.removeEventListener('pointerup',gripUp);
    document.removeEventListener('pointercancel',gripCancel);
  }

  return {stats:stats,focusIdx:focusIdx,
    html:html,
    addItem:addItem,addKey:addKey,addBlur:addBlur,focusAdd:focusAdd,
    toggleItem:toggleItem,delItem:delItem,editItem:editItem,toggleFocus:toggleFocus,
    toggleNotes:toggleNotes,noteBlur:noteBlur,addNote:addNote,noteKey:noteKey,
    delNote:delNote,toggleAllNotes:toggleAllNotes,
    gripDown:gripDown};
})();

/* ══ THE CALL CARD ═══════════════════════════════════════════════════
   What an anchored call shows: the call itself, its projects, and — on
   the card's other face — its own info table. Both faces are always
   mounted, so opening the table is a class toggle and never a swap. */
var CallCard=(function(){
  var editing=null;       // call key whose edit form is open
  var editColor='';
  var openInfo=null;      // call key whose info table is showing

  /* ── The turn ──
     Both faces are absolute, so the box they sit in has no height of its
     own and is given the height of whichever face is up. Two things the
     CSS cannot do by itself: the painted face has to change hands at the
     half-way point, and the height has to be re-measured whenever a face's
     content changes — which is what a note being typed into does, with no
     render happening at all to hang a measurement off. */
  var FLIP_MS=Turn.MS;    // the app's one turn duration
  var faceSwap=null,faceObs=null,turnEnd=null;
  function cancelFaceSwap(){if(faceSwap){clearTimeout(faceSwap);faceSwap=null;}}

  function faceOf(card){
    return q(card.classList.contains('cc-flipped')?'.cc-flip-back':'.cc-flip-front',card);
  }
  function fitCard(card){
    if(!card)return;
    var inner=q('.cc-flip-inner',card),face=faceOf(card);
    if(!inner||!face)return;
    var h=face.offsetHeight;
    /* Zero means the card is hidden behind the horizon, not that the face
       is empty — keep the last good height. */
    if(!h)return;
    inner.style.height=h+'px';
  }
  function fitAll(){qa('.cc-flip').forEach(fitCard);}

  function observeFaces(){
    if(typeof ResizeObserver!=='function')return;
    if(faceObs)faceObs.disconnect();
    faceObs=new ResizeObserver(function(entries){
      entries.forEach(function(en){
        var card=en.target.closest&&en.target.closest('.cc-flip');
        if(card&&faceOf(card)===en.target)fitCard(card);
      });
    });
    qa('.cc-flip-front,.cc-flip-back').forEach(function(f){faceObs.observe(f);});
  }

  function paintFace(card,flipped){
    card.classList.toggle('showing-back',flipped);
    fitCard(card);
  }
  /* The single instant nothing is visible either way. */
  function scheduleSwap(card,flipped){
    cancelFaceSwap();
    if(!Turn.can()){paintFace(card,flipped);return;}
    faceSwap=setTimeout(function(){
      faceSwap=null;
      if(card.parentNode)paintFace(card,flipped);
    },FLIP_MS/2);
  }
  /* Turning a card: the height is handed to the box, which settles into
     it on its own transition, while the rotation is played. The card is
     made a 3D object for the duration and flat again the moment it lands,
     so nothing stays composited that is not moving. */
  function turnCard(card,flipped){
    if(!card)return;
    if(turnEnd){clearTimeout(turnEnd);turnEnd=null;}
    card.classList.toggle('cc-flipped',flipped);
    if(!Turn.can()){
      card.classList.remove('turning');
      fitCard(card);paintFace(card,flipped);
      return;
    }
    card.classList.add('turning');
    fitCard(card);
    Turn.play(q('.cc-flip-inner',card),'Y',flipped);
    scheduleSwap(card,flipped);
    turnEnd=setTimeout(function(){
      turnEnd=null;
      if(card.parentNode)card.classList.remove('turning');
    },FLIP_MS);
  }

  function render(){
    var container=byId('projects-container');
    if(!container)return;
    var groups=callGroups();
    /* Nothing anchored means the horizon is showing; the pane stays empty
       rather than rendering a list nobody asked for. */
    if(!Nav.anchor()){container.innerHTML='';return;}
    var g=groups.byKey[Nav.anchor()];
    /* The programme is the one call that can be anchored while empty —
       it is on the beam from the first reload, and opening it is how the
       first project in it gets started. */
    if(!g&&Nav.anchor()===PROGRAMME_ID&&calls[PROGRAMME_ID])
      g={key:PROGRAMME_ID,call:calls[PROGRAMME_ID],hasCall:true,projs:[]};
    if(!g){
      /* The anchored call vanished — renamed, or its last project deleted.
         Fall back to the board rather than leaving a dead pane on screen. */
      Nav.setAnchor(null);
      Nav.applyMode();Board.renderHorizon();Beam.render();
      container.innerHTML='';return;
    }
    var html='<div class="overview overview-anchored" id="proj-list">'
      +(g.hasCall
         ? cardHTML(g.key,g.projs)
         : '<div class="solo-wrap" data-call-key="'+esc(g.key)+'">'
           +ProjectCard.html(g.projs[0],false)+'</div>')
      +'</div>';
    if(showingArchive){
      /* Archive is scoped to the anchored call too — every archived
         project in the ledger under one call's heading would be a lie. */
      var arc=Object.values(projects).filter(function(p){
        return p.archived&&p.id!==INBOX_ID&&p.callId===Nav.anchor();});
      html+='<div class="section-label">Archived</div>';
      html+=arc.length
        ?'<div class="overview">'+arc.map(function(p){return ProjectCard.html(p,true);}).join('')+'</div>'
        :'<div class="empty" style="padding:1rem 0">No archived projects in this call.</div>';
    }
    container.innerHTML=html;
    ProjectCard.bindDrag();
    Dossier.rebindOpen();
    /* A freshly rendered card is already on the side it belongs on, so it
       shows that face at once rather than turning to it. */
    qa('.cc-flip',container).forEach(function(card){
      card.classList.remove('turning');
      card.classList.toggle('showing-back',card.classList.contains('cc-flipped'));
    });
    /* Bound only once the back is showing. Binding is also where a note's
       rename box or body is handed the caret, and the back face is
       visibility:hidden until `showing-back` is on it — a hidden element
       refuses focus. Bound first, a call note's name box opened with no
       caret in it, so renaming a call note (and naming a new one) typed
       into nothing; the dossier never had this because it has no turn. */
    if(openInfo)Info.bind(openInfo);
    fitAll();afterRender(fitAll);
    observeFaces();
  }

  /* The call's next key date, worded and coloured the way the card has
     always said it: a name and a bolded relative "when", going amber then
     red as it approaches. */
  function deadlineTxtHTML(m){
    var d=daysUntil(m.date);
    var inD=(m.endDate&&d<0)?daysUntil(m.endDate):d;
    var urg=inD<0?'':(inD<=14?' urgent':(inD<=45?' soon':''));
    var when;
    if(d<0&&m.endDate)when='open now';
    else if(d<0)when='passed';
    else if(d===0)when='today';
    else if(d===1)when='tomorrow';
    else when='in '+d+'d';
    return '<span class="cp-next'+urg+'">'+esc(m.name||'Deadline')+' <b>'+when+'</b></span>';
  }

  /* A programme project's next deadline: the first still ahead, or — with
     none ahead — the last one behind, so a project whose call has closed
     still says where it stands. An opening is not a deadline and is left
     out of both, the same as on the card itself. */
  function nextDeadlineOf(p){
    var ms=projectMarkers(p).filter(function(m){return m.color!=='opening';})
      .map(function(m){return m.date;}).filter(Boolean).sort();
    if(!ms.length)return null;
    var ahead=ms.filter(function(d){var n=daysUntil(d);return n!==null&&n>=0;});
    return {date:ahead.length?ahead[0]:ms[ms.length-1],ahead:!!ahead.length};
  }
  /* On the programme the list is in deadline order, and nowhere else is.
     Every one of its projects is written for a different topic closing on
     a different day, so "which is next" is the only question this list is
     ever asked; every other call holds projects that close together, and
     there the order is Mark's own and dragged by hand. Projects whose
     deadlines have all passed fall to the bottom, most recent first, and
     anything not linked to a topic at all comes last in the order it was
     already in. */
  function orderedProjects(key,projs){
    if(key!==PROGRAMME_ID)return projs;
    return projs.map(function(p,i){return {p:p,i:i,d:nextDeadlineOf(p)};})
      .sort(function(a,b){
        var ra=a.d?(a.d.ahead?0:1):2,rb=b.d?(b.d.ahead?0:1):2;
        if(ra!==rb)return ra-rb;
        if(!a.d||!b.d||a.d.date===b.d.date)return a.i-b.i;
        return (a.d.date<b.d.date?-1:1)*(ra===0?1:-1);
      }).map(function(r){return r.p;});
  }

  function cardHTML(key,projs){
    var c=calls[key];if(!c)return '';
    var col=safeColor(callColorOf(c),'var(--gold2)');
    var fullName=callTitle(c);
    projs=orderedProjects(key,projs);
    /* The programme has no dates of its own, so what is next in it is
       whatever its projects' topics say. Each one is named by the project
       it belongs to, because on this card "Submission deadline" alone
       could be any of them — and the openings are left out of it, so the
       head says the same thing the first card under it does. */
    var own=(key===PROGRAMME_ID)
      ? projs.reduce(function(a,p){
          return a.concat(projectMarkers(p)
            .filter(function(m){return m.color!=='opening';})
            .map(function(m){
              return Object.assign({},m,{name:p.name+' · '+(m.name||'Key date')});
            }));
        },[])
      : (c.markers||[]);
    var markers=own.filter(function(m){return m.date&&isIsoDate(m.date);})
      .sort(function(a,b){return a.date<b.date?-1:1;});
    var future=markers.filter(function(m){var d=daysUntil(m.date);return d!==null&&d>=0;});
    var nextM=future.length?future[0]:(markers.length?markers[markers.length-1]:null);

    /* The card used to carry "Save as backbone" and "Backbones…" here
       too — moved to the header’s overflow menu (PL.backboneOpen, THE
       BACKBONE below), because authoring one no longer needs a call that
       already ran. This footer is call-editing only now. */
    var footer=(editing===key)
      ? editFormHTML(c)
      : '<div class="cc-footer">'
        +'<button type="button" class="cc-edit-btn" '
        +'onclick="PL.openCallEdit(\''+esc(key)+'\');event.stopPropagation()">Edit call \u270e</button></div>';

    var front='<div class="call-card" data-call-key="'+esc(key)+'" style="--call-col:'+col+'">'
      +'<div class="call-card-head">'
        +'<div class="cc-titlewrap">'
          +'<div class="cc-name" style="color:'+col+'">'+esc(fullName)+'</div>'
          +'<div class="cc-deadline">'
            +(nextM?deadlineTxtHTML(nextM):'<span class="cc-nodate">No key dates yet</span>')
          +'</div>'
        +'</div>'
        +'<div class="cc-head-right">'
          +Editors.linksDisplayHTML(c.links,'cc-links')
          +'<button type="button" class="cc-info-btn" title="Call info \u2014 notes for this call" '
            +'onclick="PL.openCallInfo(\''+esc(key)+'\');event.stopPropagation()">i</button>'
        +'</div>'
      +'</div>'
      +'<div class="call-projects">'
        +(projs.length
           ? projs.map(function(p){return ProjectCard.html(p,false);}).join('')
           : '<div class="cc-empty">Nothing in this call yet \u2014 press '
             +'<b>+ Project</b> above and pick '+esc(callName(c)||'it')
             +' as the call.</div>')
      +'</div>'+footer
    +'</div>';

    return '<div class="cc-flip'+(openInfo===key?' cc-flipped':'')+'" '
      +'data-call-key="'+esc(key)+'" style="--call-col:'+col+'">'
      +'<div class="cc-flip-inner">'
        +'<div class="cc-flip-front">'+front+'</div>'
        +'<div class="cc-flip-back">'+Info.tableHTML(key)+'</div>'
      +'</div></div>';
  }

  function editFormHTML(c){
    return '<div class="cc-edit" onclick="event.stopPropagation()">'
      +'<div class="fsec fsec-first">Edit call</div>'
      +'<div class="fg"><label>Short call name <span class="lbl-hint">\u2014 the call\u2019s title</span></label>'
        +'<input type="text" id="ce-name" value="'+esc(c.name||'')+'" /></div>'
      +'<div class="fg"><label>Official call name <span class="lbl-hint">\u2014 shown below the title</span></label>'
        +'<input type="text" id="ce-callfull" value="'+esc(c.title||'')+'" /></div>'
      +'<div class="fg"><label>Call colour</label>'
        +'<div id="ce-color-swatches" class="tc-picker">'+colorSwatches(editColor)+'</div></div>'
      +'<div class="fg"><label>Call links</label><div id="ce-links-list"></div>'
        +'<button type="button" class="btn btn-sm btn-primary" style="margin-top:6px" '
        +'onclick="PL.linkAdd(\'ce\')">+ Add link</button></div>'
      +'<div class="fg"><label>Key dates</label><div id="ce-markers-list"></div>'
        +'<div style="margin-top:8px"><button type="button" class="btn btn-sm btn-primary" '
        +'onclick="PL.markerAdd(\'ce\')">+ Add key date</button></div></div>'
      +'<div class="form-row">'
        +'<button class="btn btn-primary" onclick="PL.saveCallEdit(\''+esc(c.id)+'\')">Save call</button>'
        +'<button class="btn" onclick="PL.cancelCallEdit()">Cancel</button></div>'
    +'</div>';
  }
  function colorSwatches(current){
    current=(current||'').toLowerCase();
    return '<button type="button" class="tc-swatch tc-auto'+(!current?' sel':'')+'" '
        +'onclick="PL.setCallColor(\'\')" title="Automatic">Auto</button>'
      +TITLE_COLORS.map(function(c){
        return '<button type="button" class="tc-swatch'+(current===c?' sel':'')+'" '
          +'style="background:'+c+'" onclick="PL.setCallColor(\''+c+'\')" title="'+c+'"></button>';
      }).join('');
  }
  function setColor(c){
    editColor=c||'';
    var el=byId('ce-color-swatches');
    if(el)el.innerHTML=colorSwatches(editColor);
  }
  function openEdit(key){
    var c=calls[key];if(!c)return;
    editing=key;
    editColor=c.color||'';
    render();
    Editors.linkInit('ce',c.links||[]);
    Editors.markerInit('ce',c.markers||[]);
    var nm=byId('ce-name');if(nm)nm.focus();
  }
  function cancelEdit(){if(editing){editing=null;render();}}
  /* One record, one write. This used to loop over every project in the
     call, rebuild each one's name around a new prefix, and copy the
     title, colour, links and key dates onto all of them — which is also
     why renaming a call detached its table and why archived members kept
     stale copies. A rename is now just a rename. */
  function saveEdit(key){
    var c=calls[key];if(!c)return;
    c.name=(byId('ce-name').value||'').trim();
    c.title=(byId('ce-callfull').value||'').trim();
    c.color=editColor||'';
    /* Keep each link's and marker's existing id: regenerating them on
       every save churned them constantly, defeating any id-based
       reference and making every save look like a wholesale change to
       the cloud. */
    c.links=Editors.linkCollect('ce').map(function(l){return Object.assign({},l);});
    var wasDates=markerDates(c.id);
    c.markers=Editors.markerCollect('ce').map(function(m){return Object.assign({},m);});
    var moved=syncAnchored(c.id,wasDates);
    /* A call with a name is a call, not a lone project. */
    if(c.name)c.solo=false;
    save();
    editing=null;
    render();Beam.render();
    offerUndoMoves(moved,'the key dates you changed');
  }

  /* ══ THE CALL INFO TABLE ══════════════════════════════════════════
     The card's back face, and the same RowTable the project dossier is —
     now over the same data shape too. The rows are the call's own, so
     they survive a project being deleted or renamed, and the separate
     dictionary keyed by the call's name is gone along with the orphans
     it used to strand. */
  var Info=(function(){

    function call(key){return calls[key]||null;}
    /* The call's own rows, already in the component's shape: no
       projection and no copy to keep in step. Everything else about this
       table is the default — it is the plainest of the four. */
    RowTable.register('ci',{
      owner:call,
      renameOnAdd:true,
      rerender:function(){render();}
    });

    function tableHTML(key){
      var c=call(key);if(!c)return '';
      var rows=rowsOf(c);
      var nRows=rows.length;
      var nNotes=rows.reduce(function(a,r){return a+((r.notes||[]).length);},0);
      var meta=nRows?('<span class="ci-head-meta">'+nRows+(nRows===1?' row':' rows')
        +(nNotes?' \u00b7 '+nNotes+(nNotes===1?' note':' notes'):'')+'</span>'):'';
      return '<div class="ci-table" data-call-key="'+esc(key)+'">'
        +'<div class="ci-table-head">'
          +'<div class="ci-table-title">'+esc(callTitle(c))+' \u2014 Call info'+meta+'</div>'
          +'<button type="button" class="ci-addrow" onclick="PL.rtAddRow(\'ci\',\''+esc(key)+'\')" '
            +'title="Add a new row">+ Row</button>'
          +'<button type="button" class="cc-info-btn" title="Back to the call" '
            +'onclick="PL.closeCallInfo()">\u2190</button>'
        +'</div>'
        +'<div class="ci-rows">'
        +(nRows?RowTable.rowsHTML('ci',key)
               :'<div class="ci-empty">No rows yet. Add one to start taking notes on this call.</div>')
        +'</div></div>';
    }

    function bind(key){
      RowTable.bind('ci',key,q('.ci-table[data-call-key="'+cssEsc(key)+'"] .ci-rows'));
    }

    /* Clicking away from a note folds it up but stays on the table — the
       dossier's outside click closes the whole fold instead, which is
       why each owner binds its own rather than the component doing it.
       'click', not 'mousedown', so it runs after the tab's own handler
       has toggled state; otherwise opening a note would be undone in
       the same gesture. */
    function onOutsideClick(e){
      if(!openInfo)return;
      if(RowTable.isInside(e.target))return;
      RowTable.collapseAll('ci',openInfo);
    }
    function bindOutside(){
      document.removeEventListener('click',onOutsideClick);
      document.addEventListener('click',onOutsideClick);
    }
    function unbindOutside(){document.removeEventListener('click',onOutsideClick);}

    /* No `ensure` any more: the call record IS the store, so there is
       nothing to lazily create before reading it. */
    return {tableHTML:tableHTML,bind:bind,
      bindOutside:bindOutside,unbindOutside:unbindOutside};
  })();

  /* Opening the table is a real flip, so the card must be painted in its
     unflipped state first — otherwise there is no "before" for the
     rotation to animate from and it simply appears already turned. */
  function openInfoTable(key){
    editing=null;                 // the two expansions never open at once
    var opening=openInfo!==key;
    openInfo=null;
    render();
    if(!opening)return;
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        openInfo=key;
        var card=q('.cc-flip[data-call-key="'+cssEsc(key)+'"]');
        if(card){
          /* The height travels with the turn: measured off the back, which
             is laid out already even though it is not painted yet. */
          turnCard(card,true);
          Info.bind(key);          // no second render will do this itself
          Info.bindOutside();
        } else render();
      });
    });
  }
  function closeInfoTable(){
    Info.unbindOutside();
    var key=openInfo;
    var card=key?q('.cc-flip[data-call-key="'+cssEsc(key)+'"]'):null;
    if(card){
      /* Same reasoning in reverse: remove the class and let the mounted
         element animate back, rather than re-rendering it fresh with the
         class already absent. */
      turnCard(card,false);
      setTimeout(function(){
        if(openInfo!==key)return;   // a different call opened in the window
        openInfo=null;render();
      },FLIP_MS);
      return;
    }
    openInfo=null;render();
  }
  function closeInfoState(){openInfo=null;Info.unbindOutside();}

  return {render:render,openEdit:openEdit,cancelEdit:cancelEdit,saveEdit:saveEdit,
    setColor:setColor,openInfoTable:openInfoTable,closeInfoTable:closeInfoTable,
    closeInfoState:closeInfoState,isInfoOpen:function(){return openInfo;}};
})();

/* ══ THE CALL BOARD'S TOPICS ═════════════════════════════════════════
   A programme project is written for one topic on the Call Board, and
   this is the whole of what this room knows about that one: a list to
   pick from, and a way to open one. Both arrive from the bridge and both
   are empty until it fills them, which is what lets this room be opened
   with the Board never built at all.

   Nothing here is stored. What a project keeps is the topic's id and the
   two strings that were on it the day it was picked — asking the Board
   again on every render would build three and a half megabytes of
   Commission prose in order to print eighteen characters. */
var Topics=(function(){
  var listFn=null,openFn=null,cache=null;

  function fill(o){
    listFn=(o&&o.list)||null;
    openFn=(o&&o.open)||null;
    cache=null;
  }
  /* Asked for when one of the two project forms opens, and not before:
     the first ask is what builds the Board. */
  function all(){
    if(cache)return cache;
    if(!listFn)return [];
    try{cache=listFn()||[];}catch(e){console.error(e);cache=[];}
    return cache;
  }
  function byCode(code){
    code=String(code||'').trim().toLowerCase();
    if(!code)return null;
    return all().filter(function(t){
      return String(t.code||'').toLowerCase()===code
          || String(t.id||'').toLowerCase()===code;
    })[0]||null;
  }
  function open(id){
    if(!openFn){toast('The Call Board is not available.');return;}
    openFn(id);
  }
  return {fill:fill,all:all,byCode:byCode,open:open};
})();

/* What a project card prints — the topic as it was written down, not as
   the Board would say it now. Null for a project never linked to one. */
function projectTopic(p){
  if(!p||!p.topicId)return null;
  return {id:p.topicId,code:p.topicCode||p.topicId,title:p.topicTitle||''};
}
function openProjectTopic(pid){
  var p=projects[pid];
  if(!p||!p.topicId)return;
  Topics.open(p.topicId);
}

/* ── The picker, on both project forms ──
   A native datalist rather than a menu of this app's own: five hundred
   topics is more than a menu wants and exactly what a datalist is for,
   and it arrives with its own keyboard. One builder for both forms, so
   the new-project form and the edit form cannot drift apart — which is
   why the new-project form has a slot in its markup here rather than the
   field itself. */
var TopicPick=(function(){

  function fieldHTML(prefix){
    return '<div class="fg" id="'+prefix+'-topic-fg">'
      +'<label>Call Board topic <span class="lbl-hint">— the Horizon '
        +'topic this project is written for</span></label>'
      +'<input type="text" id="'+prefix+'-topic" list="'+prefix+'-topic-list" '
        +'autocomplete="off" placeholder="e.g. 2026-01-STAYHLTH-02" '
        +'oninput="PL.topicInput(\''+prefix+'\')" />'
      +'<datalist id="'+prefix+'-topic-list"></datalist>'
      +'<div class="topic-note" id="'+prefix+'-topic-note"></div></div>';
  }
  function fillList(prefix){
    var dl=byId(prefix+'-topic-list');
    if(!dl||dl._filled)return;
    var ts=Topics.all();
    dl.innerHTML=ts.map(function(t){
      return '<option value="'+esc(t.code)+'">'+esc(t.title)+'</option>';
    }).join('');
    dl._filled=true;
    if(!ts.length){
      var note=byId(prefix+'-topic-note');
      if(note)note.textContent='The Call Board did not start, so there is nothing to pick from.';
    }
  }
  /* Shown for the programme and nowhere else, because nowhere else is a
     project one topic's worth of work. */
  function show(prefix,on){
    var fg=byId(prefix+'-topic-fg');
    if(fg)fg.style.display=on?'':'none';
    if(on)fillList(prefix);
  }
  function onInput(prefix){
    var inp=byId(prefix+'-topic'),note=byId(prefix+'-topic-note');
    if(!inp||!note)return;
    var v=(inp.value||'').trim();
    if(!v){note.textContent='';note.classList.remove('bad');return;}
    var t=Topics.byCode(v);
    /* The deadline is said here, before Save, because it is the thing
       the pick brings with it: linking a topic writes its dates onto the
       project and they are the dates everything else will hang off. */
    note.textContent=t
      ? t.title+(t.d1?'  —  '+(t.twoStage?'stage 1 ':'')+'deadline '+fmtDate(t.d1):'')
      : 'No topic on the Call Board carries that code.';
    note.classList.toggle('bad',!t);
  }
  /* The topic's own dates, in the shape a key date is stored in. The ids
     are built from the topic's id rather than made fresh, so re-picking
     the same topic leaves whatever was tied to these dates tied; picking
     a different topic gives different ids, and a todo tied to the old
     date comes untied the same way it does when a key date is deleted. */
  function markersOf(t){
    var out=[];
    if(!t)return out;
    function add(suffix,name,date,kind){
      if(!date)return;
      out.push({id:'tp-'+t.id+'-'+suffix,name:name,date:date,endDate:'',
        kind:'topic',hard:true,color:kind});
    }
    add('open','Call opens',t.opening,'opening');
    add('d1',t.twoStage?'Stage 1 deadline':'Submission deadline',t.d1,'deadline');
    add('d2','Stage 2 deadline',t.d2,'deadline');
    return out;
  }
  /* What to write onto the project, or null when what is in the box is
     not a topic. An empty box unlinks it — and takes the dates with it,
     because they were never the project's own. */
  function collect(prefix){
    var inp=byId(prefix+'-topic');
    var v=inp?(inp.value||'').trim():'';
    if(!v)return {topicId:'',topicCode:'',topicTitle:'',markers:[]};
    var t=Topics.byCode(v);
    if(!t)return null;
    return {topicId:t.id,topicCode:t.code,topicTitle:t.title,markers:markersOf(t)};
  }
  function set(prefix,p){
    var inp=byId(prefix+'-topic');
    if(inp)inp.value=(p&&p.topicCode)||'';
    show(prefix,true);
    onInput(prefix);
  }
  return {fieldHTML:fieldHTML,show:show,onInput:onInput,collect:collect,set:set};
})();

/* ══ THE PROJECT CARD ═════════════════════════════════════════════════
   Its front carries the name, the description, its links, its dated
   todos and the two right-hand columns (positions and partners). It
   never navigates: the tab on its bottom edge folds the dossier out
   below it, in place. */
var ProjectCard=(function(){

  /* ── Positions ──
     ALWAYS one pill per person: a PhD entry with a count of three renders
     as three identical pills, never a combined "×3". One function draws a
     position, so the plain list and the grouped tree cannot disagree
     about how a position looks depending on where it sits. */
  function postdocBg(py){
    var t=Math.min((py-1)/4,1);
    return 'rgb('+Math.round(58+t*(42-58))+','+Math.round(58+t*(42-58))+','+Math.round(80+t*(72-80))+')';
  }
  function postdocBorder(py){
    var t=Math.min((py-1)/4,1);
    return 'rgba('+Math.round(80+t*(60-80))+','+Math.round(90+t*(70-90))+','+Math.round(130+t*(160-130))+',0.45)';
  }
  function pillsHTML(item,draggable){
    var type=item.type;
    var attrs=draggable
      ?' data-pos-id="'+esc(item.id)+'" title="'+esc(item.name||Editors.posLabel(type))
        +' \u2014 drag to move between groups"'
      :'';
    var dragCls=draggable?' pos-pill-drag':'';
    if(type==='phd'){
      var n=Math.max(1,parseInt(item.count)||1),out=[];
      for(var i=0;i<n;i++)
        out.push('<span class="pt'+dragCls+' '+Editors.posCls(type)+'"'+attrs+'>'+Editors.posLabel(type)+'</span>');
      return out;
    }
    if(type==='postdoc'||type==='engd'){
      var py=parseFloat(item.py)||1;
      var bg=type==='postdoc'
        ?('background:'+postdocBg(py)+';color:#8faabb;border:1px solid '+postdocBorder(py))
        :'';
      var cls=type==='engd'?' '+Editors.posCls(type):'';
      var short=type==='postdoc'?'Pdoc':Editors.posLabel(type);
      return ['<span class="pt pt-yrlabel'+dragCls+cls+'"'+(bg?' style="'+bg+'"':'')+attrs+'>'
        +short+' / '+py+'yr</span>'];
    }
    /* Tenured staff who are not the PI: the name and nothing else. The
       FTE used to trail it as a qualifier and came off on 2026-09-03 with
       the field itself — what a post costs the project is its
       person-months now, and those are read off the group's header rather
       than off every pill. */
    return ['<span class="pt'+dragCls+' pt-tenured"'+attrs+'>'
      +esc((item.name||'').trim()||Editors.posLabel('tenured'))+'</span>'];
  }
  function plainPositionsHTML(positions){
    if(!positions||!positions.length)return '';
    /* Grouped by type purely to keep same-type pills on one line; every
       position still gets its own pill and nothing is capped. */
    var groups={},order=[];
    positions.forEach(function(pos){
      if(!groups[pos.type]){groups[pos.type]=[];order.push(pos.type);}
      groups[pos.type].push(pos);
    });
    var html='';
    order.forEach(function(type){
      var line='';
      groups[type].forEach(function(item){
        pillsHTML(item,false).forEach(function(p){line+=p;});});
      if(line)html+='<div class="pos-plain-line">'+line+'</div>';
    });
    return html;
  }

  /* ── The groups, and the PI who leads each ──
     A group is a label and the researcher who leads it, both typed on the
     project pane. They used to be the contribution tracker's M&CS PM
     columns, which meant a card could not say who was being hired until
     somebody had filled in a person-month table in another room, and that
     a column added there for a partner organisation turned up here as a
     place to put your own people. Nothing on this card reads the tracker
     any more; the tracker keeps its own columns for its own table, and the
     two person-month sums are answering different questions.

     The PI is the position in that group carrying `pi` — always a tenured
     one, always exactly one, and it is drawn on the group's header rather
     than in the tree, because the header IS its branch. A group whose flag
     has never been set shows its first tenured position, since a group
     always has a PI and the card should say so before the form has been
     opened. */
  function piOf(items){
    var ten=(items||[]).filter(function(x){return (x.type||'')==='tenured'&&(x.name||'').trim();});
    if(!ten.length)return null;
    return ten.find(function(x){return x.pi;})||ten[0];
  }
  /* Person-months, added up from the positions themselves. Blank is not
     zero anywhere here: a group nobody has costed yet says nothing rather
     than claiming 0 PM, and the card's total is the sum of what has
     actually been written down. */
  function pmOf(items){
    var any=false,n=0;
    (items||[]).forEach(function(x){
      var v=parseFloat(x.pm);
      if(isNaN(v))return;
      any=true;n+=v;
    });
    return any?Math.round(n*100)/100:null;
  }
  /* Which group each position is drawn in. A position pointing at a group
     that has been removed, or at none, falls into the FIRST — display-time
     only, nothing is written back unless it is actually dragged, and there
     is no separate "unassigned" bucket, so every position visibly lives
     somewhere. */
  function byGroupOf(p,groups){
    var ids=groups.map(function(g){return g.id;}),top=ids[0],out={};
    (p.positions||[]).forEach(function(item){
      var gid=(item.groupId&&ids.indexOf(item.groupId)>-1)?item.groupId:top;
      (out[gid]=out[gid]||[]).push(item);
    });
    return out;
  }
  /* The project's person-months, at the far end of the head band. The
     TOTAL and nothing else: each group's own number is on its header, a
     hand's width to the right, so listing them here as well would be the
     card saying the same figures twice on one screen — and the band has
     better uses for that width when a topic id is long. */
  function pmStripHTML(p){
    var groups=asList(p.piGroups);
    if(!groups.length)return '';
    var by=byGroupOf(p,groups),total=null,names=[];
    groups.forEach(function(g){
      var n=pmOf(by[g.id]);
      if(n===null)return;
      total=(total||0)+n;
      names.push(esc(g.short||'?')+' '+n);
    });
    if(total===null)return '';
    return '<span class="pm-strip" title="'+esc(names.join(' \u00b7 '))+'">'
      +'<span class="pm-tot"><b>'+Math.round(total*100)/100+'</b> PM</span></span>';
  }
  /* Side by side or stacked, decided by the room the card has.
     A header is one fixed width now — see --pos-hd-w — and the column
     around it takes the width of what it holds rather than a flat 380, so
     two of them side by side cost the card 432 points and stacking costs
     206 and a second row of tree. Two always stand side by side: the
     shorter card is worth the hundred and seventy points the first column
     gives up for it, and a stacked pair was the one change that made a
     card taller instead of shorter. Three or more still stack; the card
     has never been wide enough for a readable third. Counting the
     characters of a name, which is what decided this before, was a proxy
     for a width and stopped being needed the moment the width was fixed. */
  function positionsHTML(p){
    var groups=asList(p.piGroups);
    if(!groups.length)return plainPositionsHTML(p.positions);
    var by=byGroupOf(p,groups);
    var html='<div class="pos-groups'+(groups.length===2?' pos-groups-cols':'')+'" '
      +'data-pos-proj="'+esc(p.id)+'">';
    groups.forEach(function(g){
      var items=by[g.id]||[];
      var pi=piOf(items);
      var rest=pi?items.filter(function(x){return x.id!==pi.id;}):items;
      var branches=rest.length
        ? rest.map(function(item){
            return '<div class="pos-branch" data-branch-pos="'+esc(item.id)+'">'
              +pillsHTML(item,true).join('')+'</div>';
          }).join('')
        : '<div class="pos-branch pos-branch-empty"><span class="pos-mcs-empty">'
          +(pi?'no other positions':'no positions')+'</span></div>';
      var pm=pmOf(items);
      /* The name is written as plain text and NOT as a link: the bridge
         linkifies every researcher's name written anywhere in any room, so
         it becomes an Atlas link here by itself, and doing it by hand
         would give the bridge a link to find inside a link. */
      html+='<div class="pos-mcs-section" data-drop-group="'+esc(g.id)+'">'
        +'<div class="pos-mcs-hd'+(pi?' pos-mcs-hd-pi':'')+'" '
          +'title="'+(pi?esc((pi.name||'').trim())+' \u2014 PI, ':'')+esc(g.short||'Group')
          +(pm===null?'':' \u00b7 '+pm+' PM')+'">'
          +'<span class="pos-mcs-hd-name">'+esc(g.short||'?')+'</span>'
          +(pi?'<span class="pos-mcs-hd-who pos-pill-drag" data-pos-id="'+esc(pi.id)+'">'
              +esc((pi.name||'').trim())+'</span>':'')
          +(pm===null?'':'<span class="pos-mcs-hd-pm"><b>'+pm+'</b> PM</span>')
        +'</div><div class="pos-tree">'+branches+'</div></div>';
    });
    return html+'</div>';
  }

  /* ── Partners ──
     The coordinator, then three of the consortium, then a count. Three,
     because a consortium of eleven is a paragraph and this column is
     186px; and never an arbitrary three — the sort already puts the Dutch
     lead first and the rest in alphabetical order, so the three shown are
     always the same three.

     The rest are in the card, not fetched: `+8` opens them in a small
     panel over it, on hover AND on focus, which is why it is a focusable
     span rather than plain text — an iPad has no hover and a tap gives
     focus, so the same control answers there. */
  var PRT_SHOWN=3;
  /* Every name is one line and says the rest on its tooltip: see
     .prt-name for why a name may no longer wrap. */
  function prtRow(pt){
    var nm=pt&&pt.name?pt.name:(typeof pt==='string'?pt:'');
    if(!nm)return '';
    return '<div class="prt-row"><span class="prt-name" title="'+esc(nm)+'">'+esc(nm)+'</span>'
      +(pt.nlLead?'<span class="nl-lead-badge prt-nl" title="Dutch lead partner">NL</span>':'')
      +'</div>';
  }
  function partnersHTML(p){
    var coord=p.coordinator
      ?'<div class="prt-coord">'+mailBtnHTML(p)
        +'<span class="prt-name prt-name-lead" title="'+esc(p.coordinator)+'">'
        +esc(p.coordinator)+'</span></div>'
      :'<div class="prt-coord">'+mailBtnHTML(p)+'<span class="prt-none">\u2014</span></div>';
    var list=Editors.sortedPartners(p.partners||[]);
    var block='';
    if(list.length){
      var rows=list.slice(0,PRT_SHOWN).map(prtRow).join('');
      var hidden=list.slice(PRT_SHOWN);
      var more=hidden.length
        ?'<div class="prt-row prt-more-row"><span class="prt-more" tabindex="0" '
          +'role="button" aria-label="Show the other '+hidden.length+' partners">'
          +'+'+hidden.length
          +'<span class="prt-rest"><span class="prt-list-rest">'
            +hidden.map(prtRow).join('')+'</span></span>'
        +'</span></div>'
        :'';
      block='<div class="prt-list">'+rows+more+'</div>';
    }
    return '<div class="prt-block">'+coord+block+'</div>';
  }

  /* ── Mailing the consortium ──
     The envelope stands at the left end of the coordinator's line, the
     one place in the column with room to spare, so the column gains no
     line by carrying it — a card is not to grow for a control. It is
     drawn only when somebody in the consortium has an address.

     Pressed, it lists everybody by organisation, every address ticked,
     and one button puts the ticked ones on the clipboard as
     `Name <address>; …` — the form Outlook's To line reads as a list of
     people, named, rather than as bare addresses. An organisation's own
     tick takes all of its people at once, which is the usual question
     ("the industry, not the universities"). People without an address
     are listed but cannot be ticked, so a contact half written down still
     says who is missing. */
  var IC_MAIL='<svg viewBox="0 0 14 10" width="13" height="10" aria-hidden="true" fill="none" '
    +'stroke="currentColor" stroke-width="1.2" stroke-linejoin="round">'
    +'<rect x="0.8" y="0.8" width="12.4" height="8.4" rx="1"></rect>'
    +'<path d="M1 1.4l6 4.6 6-4.6"></path></svg>';
  function mailOrgs(p){
    var out=[];
    if(p.coordinator||(p.coordContacts||[]).length)
      out.push({name:p.coordinator||'Coordinator',lead:true,contacts:p.coordContacts||[]});
    Editors.sortedPartners(p.partners||[]).forEach(function(pt){
      if(pt&&(pt.contacts||[]).length)out.push({name:pt.name||'Partner',contacts:pt.contacts});
    });
    return out.filter(function(o){return o.contacts.length;});
  }
  function hasAddress(c){return !!(c&&/\S+@\S+/.test(c.email||''));}
  function mailCount(p){
    return mailOrgs(p).reduce(function(n,o){return n+o.contacts.filter(hasAddress).length;},0);
  }
  function mailBtnHTML(p){
    var n=mailCount(p);
    if(!n)return '';
    return '<button type="button" class="prt-mail" aria-haspopup="dialog" aria-expanded="false" '
      +'title="E-mail the consortium \u2014 pick who, copy the addresses for Outlook" '
      +'aria-label="E-mail the consortium: '+n+(n===1?' address':' addresses')+'" '
      +'onclick="PL.prtMail(event,\''+esc(p.id)+'\')">'+IC_MAIL+'<span>'+n+'</span></button>';
  }
  function mailMenuHTML(p){
    var orgs=mailOrgs(p),i=0;
    var groups=orgs.map(function(o){
      var rows=o.contacts.map(function(c){
        var ok=hasAddress(c);
        return '<label class="pcon-pick'+(ok?'':' pcon-noaddr')+'">'
          +'<input type="checkbox" class="pcon-tick" '+(ok?'checked ':'disabled ')
            +'data-addr="'+esc(ok?c.email.trim():'')+'" data-who="'+esc((c.name||'').trim())+'" '
            +'onchange="PL.prtMailTick(this)" />'
          +'<span class="pcon-who">'+esc((c.name||'').trim()||c.email||'')+'</span>'
          +'<span class="pcon-addr">'+(ok?esc(c.email.trim()):'no e-mail')+'</span>'
        +'</label>';
      }).join('');
      var any=o.contacts.some(hasAddress);
      return '<div class="pcon-org" data-org="'+(i++)+'">'
        +'<label class="pcon-org-hd'+(o.lead?' pcon-org-lead':'')+'">'
          +'<input type="checkbox" class="pcon-org-tick" '+(any?'checked ':'disabled ')
            +'onchange="PL.prtMailOrg(this)" />'
          +'<span>'+esc(o.name)+'</span></label>'
        +rows+'</div>';
    }).join('');
    return '<div class="pcon-menu-hd">'
        +'<label class="pcon-all"><input type="checkbox" class="pcon-all-tick" checked '
          +'onchange="PL.prtMailAll(this)" /><span>Everyone</span></label></div>'
      /* `data-noatlas`: these are company people, and the bridge would
         otherwise turn any of them sharing a surname with a researcher
         into an Atlas link — a "Jansen" at NXP underlined as somebody
         at the university. */
      +'<div class="pcon-menu-list" data-noatlas>'+groups+'</div>'
      +'<div class="colmenu-actions">'
        +'<button type="button" class="btn btn-sm btn-primary pcon-copy" '
          +'onclick="PL.prtMailCopy()">Copy</button></div>';
  }
  function mailMenu(evt,pid){
    if(evt){evt.preventDefault();evt.stopPropagation();}
    var p=projects[pid];if(!p)return;
    var btn=evt&&evt.currentTarget;
    var el=Menu.open(btn,mailMenuHTML(p),{id:'pcon-menu',cls:'colmenu pcon-menu',
      align:'right',role:'dialog'});
    if(el)mailSync();
  }
  function mailTicks(){
    var m=byId('pcon-menu');
    return m?qa('.pcon-tick',m).filter(function(x){return !x.disabled;}):[];
  }
  /* The organisation ticks and Everyone are read off the people under
     them, never stored: a tick half the people agree with shows as the
     browser's own in-between mark. */
  function mailSync(){
    var m=byId('pcon-menu');if(!m)return;
    function agree(box,ticks){
      var on=ticks.filter(function(x){return x.checked;}).length;
      box.checked=!!ticks.length&&on===ticks.length;
      box.indeterminate=on>0&&on<ticks.length;
    }
    qa('.pcon-org',m).forEach(function(g){
      var box=q('.pcon-org-tick',g);
      if(box&&!box.disabled)agree(box,qa('.pcon-tick',g).filter(function(x){return !x.disabled;}));
    });
    var all=q('.pcon-all-tick',m);
    var ticks=mailTicks();
    if(all)agree(all,ticks);
    var n=ticks.filter(function(x){return x.checked;}).length;
    var btn=q('.pcon-copy',m);
    if(btn){
      btn.textContent=n?('Copy '+n+(n===1?' address':' addresses')):'Nobody ticked';
      btn.disabled=!n;
    }
  }
  function mailTick(){mailSync();}
  function mailOrg(box){
    var g=box.closest('.pcon-org');if(!g)return;
    qa('.pcon-tick',g).forEach(function(x){if(!x.disabled)x.checked=box.checked;});
    mailSync();
  }
  function mailAll(box){
    mailTicks().forEach(function(x){x.checked=box.checked;});
    mailSync();
  }
  /* Written through a selected, off-screen field and `execCommand`,
     because the press is synchronous and that works from file:// in every
     browser the app opens in; the asynchronous clipboard is tried only if
     it refuses. */
  function mailCopy(){
    var seen={},list=[];
    mailTicks().forEach(function(x){
      if(!x.checked)return;
      var a=x.getAttribute('data-addr'),who=x.getAttribute('data-who');
      if(!a||seen[a.toLowerCase()])return;
      seen[a.toLowerCase()]=true;
      /* A name with a comma or a full stop in it would split in Outlook,
         so the name is quoted then. */
      var nm=who&&/[,;.<>@"]/.test(who)?'"'+who.replace(/"/g,'')+'"':who;
      list.push(nm?nm+' <'+a+'>':a);
    });
    if(!list.length)return;
    var text=list.join('; ');
    var ta=document.createElement('textarea');
    ta.value=text;ta.setAttribute('readonly','');
    ta.setAttribute('style','position:fixed;left:-9999px;top:0;opacity:0');
    document.body.appendChild(ta);
    ta.select();
    var ok=false;
    try{ok=document.execCommand('copy');}catch(e){}
    ta.parentNode.removeChild(ta);
    var said=list.length+(list.length===1?' address':' addresses')
      +' copied \u2014 paste them into the To line in Outlook';
    if(ok){Menu.close();toast(said);return;}
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(function(){Menu.close();toast(said);},
        function(){toast('This browser would not let the addresses onto the clipboard.');});
    } else toast('This browser would not let the addresses onto the clipboard.');
  }

  /* ── Key-date wording, shared with the marker rows ── */
  function markerDateStr(m){
    if(m.endDate&&m.endDate!==m.date)return fuzzyRange(m.date,m.endDate);
    return fmtDate(m.date);
  }
  /* How near a date is, said as a colour as well as a number. One ladder
     for every date on every project card \u2014 the topic's own deadline and
     the todos' alike \u2014 so a red "in 4d" means the same thing wherever it
     is read on the card. The bands are the call card's own (.cp-next):
     inside a fortnight is urgent, inside six weeks is soon. Set as
     colour and never as opacity, and the far band is no longer the
     room's third rank: --text3 at 11px clears only 3.9:1 on this
     card's ground, which is the same complaint the board's dimmed days
     drew. */
  function relBand(d){
    if(d===null)return '';
    if(d<0)return ' mi-rel-past';
    if(d<=14)return ' mi-rel-urgent';
    if(d<=45)return ' mi-rel-soon';
    return '';
  }
  function markerRelHTML(m){
    var d=daysUntil(m.date);
    if(d===null)return '';
    var txt,band=relBand(d);
    if(m.endDate&&m.endDate!==m.date){
      var de=daysUntil(m.endDate);
      /* A window that is open is measured to its far end, not its near
         one: "ongoing" in red because it opened months ago would be the
         opposite of the truth. */
      if(d<=0&&de>=0){txt='ongoing';band=relBand(de);}
      else txt=d>=0?('in '+d+'d'):(Math.abs(d)+'d ago');
    } else txt=d>=0?('in '+d+'d'):(Math.abs(d)+'d ago');
    return ' <span class="mi-rel'+band+'">\u00b7 '+txt+'</span>';
  }

  /* The second half of a programme project's title: the topic it was
     written for, quieter than the acronym in front of it because it is
     what the project is about and not what it is called. It opens the
     Board's reader over this room rather than travelling there — the
     same drawer a researcher's name opens. */
  function topicHTML(p){
    var t=projectTopic(p);
    if(!t)return '';
    /* The whole topic id, not the short form. The short one drops the
       programme and the cluster off the front, which reads fine on the
       Board where a cluster tab is lit above it, and reads as half an
       answer here \u2014 a project card is the only place the topic is named
       at all, and the id is what gets pasted into the portal. */
    return '<button type="button" class="pc-topic" '
      +'title="'+esc(t.title||t.code)+' \u2014 read the topic" '
      +'onclick="PL.openTopic(\''+esc(p.id)+'\');event.stopPropagation()">'
      +'<span class="pc-topic-dash">\u2013</span>'+esc(t.id||t.code)+'</button>';
  }

  function html(p,arch){
    var titleColor=safeColor(projColor(p));
    var isPlaceholder=/^\(unnamed project/.test(p.name||'');
    var rowNotes=rowsOf(p).reduce(function(n,r){return n+(r.notes||[]).length;},0);
    var hasContent=!!(rowNotes||(p.todos&&p.todos.length)||(p.positions&&p.positions.length)
      ||(p.links&&p.links.length)||(p.desc&&p.desc.trim()));
    var emptyBadge=isPlaceholder
      ?'<span class="archived-badge" title="'+(hasContent
        ?'This project has notes, positions, links, a description, or a call name.'
        :'No notes, positions, links, description, or call name \u2014 safe to delete from the fold-out.')
        +'">unnamed</span>'
      :'';

    /* A Horizon project's own key date, above its todos' deadlines — and
       there is exactly one of them now. The whole of the topic's calendar
       used to be listed: the opening, then a stage 1 and a stage 2. The
       opening is the one date on the card that asks nothing of anybody,
       and by the time a project is in the ledger the call has almost
       always opened, so it stood there permanently saying "yes, you may
       start"; and of two stage deadlines the nearer one is the only one
       being worked towards. So: the first deadline still ahead — and once
       they have all passed, the last of them, because a card that has
       gone silent is worse than one saying the date is behind you.
       Every other project has none, and the row simply starts with the
       todos as before. */
    var keyMarks=projectMarkers(p)
      .filter(function(m){return m.color!=='opening';})
      .slice().sort(function(a,b){return a.date<b.date?-1:1;});
    var nextKey=keyMarks.filter(function(m){
      var d=daysUntil(m.date);return d!==null&&d>=0;})[0]
      ||keyMarks[keyMarks.length-1]||null;
    var keyRows=nextKey
      ? '<div class="mi-row mi-row-key"><span class="mi-label mi-label-wide">'
        +esc(nextKey.name||'Key date')+'</span><span class="mi-val">'
        +markerDateStr(nextKey)+markerRelHTML(nextKey)+'</span></div>'
      : '';

    var deadlineRows=(p.todos||[])
      .filter(function(e){return !e.done&&e.deadline&&isIsoDate(e.deadline);})
      .sort(function(a,b){return a.deadline<b.deadline?-1:1;})
      .map(function(e){
        var nm=(e.text||'Todo').trim().replace(/\s+/g,' ');
        var short=nm.length>48?nm.slice(0,46)+'\u2026':nm;
        return '<div class="mi-row"><span class="mi-label mi-label-wide" title="'+esc(nm)+'">'
          +esc(short)+'</span><span class="mi-val">'
          +markerDateStr({date:e.deadline})+markerRelHTML({date:e.deadline})+'</span></div>';
      }).join('');

    /* The links are what actually leaves the app, so they sit last on
       the band's leading run \u2014 a reach outward belongs at the far end of
       whatever it is part of. */
    var links=(p.links||[]).filter(function(l){return l.url;});
    var wsi=links.findIndex(function(l){return /workspace/i.test(l.name||'');});
    var ws=wsi>-1?links[wsi]:null;
    var rest=links.filter(function(l,i){return i!==wsi;});
    function linkA(l){
      return '<a href="'+esc(safeUrl(l.url))+'" target="_blank" '
        +'onclick="event.stopPropagation()" class="named-link">'+esc(l.name||'Link')+' \u2197</a>';
    }
    var parts=[];
    if(ws)parts.push(linkA(ws));
    rest.forEach(function(l){parts.push(linkA(l));});
    var linksEnd=parts.length
      ?'<span class="pc-links">'+parts.join('')+'</span>'
      :'';

    /* ── The controls, on the title's own row ──
       Everything you do to the project as a whole shares the head band
       with the name it belongs to. They spent a day on a row of their own
       across the card's underside, which read well and cost every card
       forty points of height for four controls — and the band beside the
       title was standing empty. So: the links first, because they are the
       only things here that leave the app and the far side is where a
       reach outward belongs; then the person-months; then Tracker in the
       filled face, Edit quiet beside it, and the dossier's chevron alone
       in the card's top-right corner.

       The chevron keeps no word. It is the one control whose drawer opens
       somewhere else entirely — at the foot of the card — so it is set
       apart from the pair it would otherwise be read with, and it turns
       over when the drawer is out.

       Both Tracker and Edit are on an archived card too: Restore lives
       inside the edit form, so a card without them would be a card there
       is no way back from. Only the grip goes. */
    var isOpen=Dossier.isOpen(p.id);
    var byDeadline=(p.callId===PROGRAMME_ID);
    /* Against the name: the tracker, then the material the project keeps
       elsewhere. Mark asked for the tracker to take the links' own form,
       arrow and all, having been told the arrow would not be strictly
       true — the tracker is this card's other face and does not leave the
       app. He is right that the row reads better for it, and the arrow is
       doing a looser job here than the one `Add todo ↗` failed at: every
       one of these takes you off this card to the thing behind it, and
       what differs is only how far. */
    /* + Todo, beside the tracker and ahead of the links. It came off this
       card on 2026-09-02 for wearing a departure arrow and going nowhere,
       and because the bar's own + Todo opened the same pane anyway; Mark
       asked for it back on 2026-09-04. What earns it the space this time
       is that it is not that button: `PL.projectTodo` names THIS project,
       so the pane opens with the call and the project already filled in
       from a card that does not have to be folded out first, where the
       bar's button reads whatever happens to be open and leaves the
       project still to pick. The arrow is the one the whole run wears \u2014
       each of these takes you off the card to the thing behind it.

       Not on an archived card: an archived project is out of
       activeProjects(), so the pane's own picker would not list it and
       the todo would have nowhere to land. */
    var todoBtn=arch?''
      :'<button type="button" class="named-link" '
        +'title="Write a todo for '+esc(p.name)+'" '
        +'aria-label="Add a todo to '+esc(p.name)+'" '
        +'onclick="PL.projectTodo(\''+esc(p.id)+'\');event.stopPropagation()">'
        +'+ Todo \u2197</button>';
    var lead='<span class="pc-lead-acts">'
      +'<button type="button" class="named-link" '
        +'title="Turn '+esc(p.name)+' over to its contribution tracker" '
        +'aria-label="Turn '+esc(p.name)+' over to its contribution tracker" '
        +'onclick="PL.openTracker(\''+esc(p.id)+'\',this);event.stopPropagation()">'
        +'Tracker \u2197</button>'
      +todoBtn
      +linksEnd
    +'</span>';
    /* At the far end: what it costs, what changes it, and the drawer. */
    var acts='<span class="pc-acts">'
      +pmStripHTML(p)
      +'<button type="button" class="pc-btn pc-btn-bare" '
        +'title="Edit this project \u2014 its details, and archiving or deleting it" '
        +'aria-label="Edit '+esc(p.name)+'" '
        +'onclick="PL.piEditProject(\''+esc(p.id)+'\',event)">Edit</button>'
      +'<button type="button" class="pc-btn pc-btn-icon pc-dossier" '
        +'title="'+(isOpen?'Close the dossier':'Open the dossier \u2014 the project\u2019s rows and notes')+'" '
        +'aria-label="'+(isOpen?'Close':'Open')+' the dossier for '+esc(p.name)+'" '
        +'onclick="PL.toggleFold(\''+esc(p.id)+'\',event)">'
        +'<span class="pc-dossier-chev">\u25be</span></button>'
    +'</span>';

    /* ── The grip ──
       The card's whole leading edge, and no glyph at all: the widest drag
       target a row can offer, it costs the card none of its width, and it
       is the one place the call's own colour reaches the card rather than
       only its name. It keeps the rail's two class names so the delegated
       pointerdown and the programme's fixed case go on working untouched.
       On the programme the list is in deadline order and nothing can be
       dragged out of it, so there the edge is a mark and says why rather
       than pretending to be a handle. An archived card is out of every
       order and has no edge at all. */
    var grip=arch?''
      :'<div class="proj-row-handle'+(byDeadline?' proj-row-handle-fixed':'')+'" '
        +'style="--grip:'+titleColor+'" '
        +'title="'+(byDeadline
          ? 'Ordered by deadline, soonest first'
          : 'Drag to reorder within this call')+'" '
        +'onclick="event.stopPropagation()"></div>';

    /* ── The head band ──
       The name, its topic and the project's person-months on one line
       across the whole card, over a rule. The title used to stand in the
       card's top-left corner with the researchers under it and the two
       right-hand columns leaning on its edge; the researchers are the
       group headers now, which left that corner holding a title and a
       great deal of nothing. On its own band the title is read at the same
       height on every card down a call, the topic gets the width it has
       always wanted, and the person-months have somewhere to be that costs
       no row of their own.

       Below it the card is three plain columns of equal standing: what is
       due, who is on it, who it is with. */
    var band='<div class="pc-band">'
      +'<span class="pc-name" style="color:'+titleColor+'">'+esc(p.name)+'</span>'
      +topicHTML(p)
      +(arch?'<span class="archived-badge">archived</span>':'')+emptyBadge
      +lead
      +acts
    +'</div>';

    return '<div class="pi-fold'+(isOpen?' pi-open':'')+'" data-pid="'+esc(p.id)+'">'
      +'<div class="proj-row" id="pc-'+esc(p.id)+'">'
      +grip
      +band
      /* ── The three columns ──
         The people first, hard against the card's left edge on every card
         there is; then the dates, where a card has any; then the partners.
         The dates used to lead and the people to follow them, which meant
         the position trees started at a different place depending on
         whether the project had a deadline on it — Mark asked for them
         aligned left twice, and this is the answer that holds for the
         Horizon programme too. A column with nothing in it is not drawn at
         all rather than standing there as a rule with an empty half-card
         behind it. */
      +'<div class="proj-row-top">'
      +'<div class="proj-col-people">'+positionsHTML(p)+'</div>'
      +((keyRows||deadlineRows)
        /* Down the programme the dates are the only thing a card has to
           the right of its people, so the box takes the slack instead of
           standing in the middle of the row with a hand's width of
           nothing behind it \u2014 see .pc-dates-far. Every programme card is
           the same shape, none of them carrying partners, so they all
           still open on one line. */
        ?'<div class="proj-col-dates'+(byDeadline?' pc-dates-far':'')+'">'
          +'<div class="pc-deadlines">'+keyRows+deadlineRows+'</div>'
        +'</div>'
        :'')
      +((p.industrial&&(p.coordinator||(p.partners&&p.partners.length)))
        ?'<div class="proj-col-prt">'+partnersHTML(p)+'</div>'
        :'')
      +'</div>'
      +'</div>'
      +'<div class="pi-fold-panel"><div class="pi-fold-clip"><div class="pi-fold-body">'
        +(isOpen?Dossier.faceHTML(p.id):'')
      +'</div></div></div>'
    +'</div>';
  }

  /* ── Reordering ──
     One delegated listener on the container survives every re-render,
     rather than re-attaching to every row each time. */
  function bindDrag(){
    var container=byId('projects-container');
    if(container&&!container._dragDelegated){
      container._dragDelegated=true;
      container.addEventListener('pointerdown',function(e){
        if(otherButton(e))return;
        var t=e.target;
        if(!t||!t.closest)return;
        var h=t.closest('.proj-row-handle');
        if(!h)return;
        /* The programme's list is in deadline order, so its grip is a
           mark and not a handle; starting a drag there would end in a
           reorder the next render throws away. */
        if(h.classList.contains('proj-row-handle-fixed'))return;
        var row=h.closest('.proj-row[id^="pc-"]');
        if(!row)return;
        e.preventDefault();e.stopPropagation();
        Drag.from(e,row,'.proj-row[id^="pc-"]',
          function(el){return el.id.replace('pc-','');},reorderWithinCall);
      });
    }
    bindPositionDrag();
  }
  function reorderWithinCall(srcId,tgtId){
    var src=projects[srcId],tgt=projects[tgtId];
    if(!src||!tgt)return;
    var k=src.callId;
    if(k!==tgt.callId)return;              // only within the same call
    if(k===PROGRAMME_ID)return;            // deadline order; nothing to save
    var list=activeProjects().filter(function(p){return p.callId===k;})
      .sort(function(a,b){return(a.order||0)-(b.order||0);});
    if(!moveById(list,srcId,tgtId))return;
    list.forEach(function(p,i){projects[p.id].order=i;});
    save();CallCard.render();
  }

  /* ── Dragging a position between groups ──
     The pill is text at rest, so pointerdown is left alone until the
     threshold decides this is a drag. The pointer is deliberately NOT
     captured: capture would make elementFromPoint keep reporting the pill
     itself instead of the zone underneath it. */
  function bindPositionDrag(){
    qa('.pos-groups[data-pos-proj]').forEach(function(container){
      var pid=container.getAttribute('data-pos-proj');
      qa('.pos-pill-drag[data-pos-id]',container).forEach(function(pill){
        if(pill._posBound)return;
        pill._posBound=true;
        var itemId=pill.getAttribute('data-pos-id');
        var startX=0,startY=0,dragging=false,ptrId=null,ghost=null,dropBefore=false;

        /* elementFromPoint returns the topmost element, which while
           dragging is the dimmed source pill sitting under the cursor.
           Hiding it for the hit test makes the lookup see what is
           actually underneath. */
        function probe(x,y){
          var prev=pill.style.visibility;
          pill.style.visibility='hidden';
          var under=document.elementFromPoint(x,y);
          pill.style.visibility=prev;
          return under;
        }
        function findZone(x,y){
          var u=probe(x,y);
          return u?u.closest('.pos-mcs-section[data-drop-group]'):null;
        }
        /* Which branch, and which side of it, so a drop can land at a
           specific slot rather than just "in this group". */
        function findBranch(x,y){
          var u=probe(x,y);
          var br=u?u.closest('.pos-branch[data-branch-pos]'):null;
          if(!br)return null;
          var r=br.getBoundingClientRect();
          dropBefore=(y<r.top+r.height/2);
          return br;
        }
        function clearOver(){
          qa('.drop-target',container).forEach(function(z){z.classList.remove('drop-target');});
          qa('.drop-before,.drop-after',container).forEach(function(z){
            z.classList.remove('drop-before','drop-after');});
        }
        function makeGhost(e){
          var r=pill.getBoundingClientRect();
          ghost=pill.cloneNode(true);
          ghost.classList.add('pos-drag-ghost');
          ghost.classList.remove('dragging');
          ghost.style.width=r.width+'px';ghost.style.height=r.height+'px';
          ghost._dx=e.clientX-r.left;ghost._dy=e.clientY-r.top;
          document.body.appendChild(ghost);
          moveGhost(e);
        }
        function moveGhost(e){
          if(!ghost)return;
          var org=fixedOrigin();
          ghost.style.left=(e.clientX-ghost._dx-org.left)+'px';
          ghost.style.top=(e.clientY-ghost._dy-org.top)+'px';
        }
        function killGhost(){
          if(ghost&&ghost.parentNode)ghost.parentNode.removeChild(ghost);
          ghost=null;
        }
        function onMove(e){
          if(ptrId!==e.pointerId)return;
          if(!dragging){
            if(Math.abs(e.clientX-startX)<Drag.THRESHOLD&&Math.abs(e.clientY-startY)<Drag.THRESHOLD)return;
            dragging=true;
            pill.classList.add('dragging');
            document.body.classList.add('pos-dragging');
            var sel=window.getSelection&&window.getSelection();
            if(sel&&sel.removeAllRanges)sel.removeAllRanges();
            makeGhost(e);
          }
          e.preventDefault();
          moveGhost(e);
          var zone=findZone(e.clientX,e.clientY);
          var branch=zone?findBranch(e.clientX,e.clientY):null;
          clearOver();
          if(zone)zone.classList.add('drop-target');
          if(branch&&branch!==pill.closest('.pos-branch'))
            branch.classList.add(dropBefore?'drop-before':'drop-after');
        }
        function finish(e,shouldDrop){
          if(ptrId!==e.pointerId)return;
          document.removeEventListener('pointermove',onMove);
          document.removeEventListener('pointerup',onUp);
          document.removeEventListener('pointercancel',onCancel);
          pill.classList.remove('dragging');
          document.body.classList.remove('pos-dragging');
          if(shouldDrop&&dragging){
            var zone=findZone(e.clientX,e.clientY);
            var branch=zone?findBranch(e.clientX,e.clientY):null;
            if(zone){
              var beforeId=null;
              if(branch){
                var tid=branch.getAttribute('data-branch-pos');
                if(tid&&tid!==itemId)beforeId=dropBefore?tid:posAfter(pid,tid);
              }
              movePosition(pid,itemId,zone.getAttribute('data-drop-group')||'',beforeId);
            }
          }
          killGhost();clearOver();
          /* A pointerup after a real drag is still followed by a synthetic
             click. Swallow exactly one, in the capture phase. */
          if(dragging){
            var swallow=function(ev){
              ev.stopPropagation();ev.preventDefault();
              document.removeEventListener('click',swallow,true);
            };
            document.addEventListener('click',swallow,true);
            setTimeout(function(){document.removeEventListener('click',swallow,true);},400);
          }
          dragging=false;ptrId=null;
        }
        function onUp(e){finish(e,true);}
        function onCancel(e){finish(e,false);}
        pill.addEventListener('pointerdown',function(e){
          if(otherButton(e))return;
          startX=e.clientX;startY=e.clientY;ptrId=e.pointerId;dragging=false;
          document.addEventListener('pointermove',onMove);
          document.addEventListener('pointerup',onUp);
          document.addEventListener('pointercancel',onCancel);
        });
      });
    });
  }
  /* "Insert after X", expressed as an insert-before target. */
  function posAfter(pid,id){
    var p=projects[pid];if(!p||!Array.isArray(p.positions))return null;
    var i=p.positions.findIndex(function(x){return x.id===id;});
    if(i<0||i+1>=p.positions.length)return null;
    return p.positions[i+1].id;
  }
  /* The tree is a grouped projection of one flat array, so moving within
     a branch and moving between branches are the same operation with a
     different groupId. */
  function movePosition(pid,itemId,groupId,beforeId){
    var p=projects[pid];if(!p||!Array.isArray(p.positions))return;
    var from=p.positions.findIndex(function(x){return x.id===itemId;});
    if(from<0||beforeId===itemId)return;
    var item=p.positions[from];
    var prevGroup=item.groupId||'';
    p.positions.splice(from,1);
    item.groupId=groupId||'';
    var to=p.positions.length;
    if(beforeId){
      var bi=p.positions.findIndex(function(x){return x.id===beforeId;});
      if(bi>-1)to=bi;
    } else {
      /* No explicit target: land at the end of the destination group
         rather than the end of the whole array, so it appears where it
         was dropped. */
      var lastIn=-1;
      p.positions.forEach(function(x,i){if((x.groupId||'')===(groupId||''))lastIn=i;});
      if(lastIn>-1)to=lastIn+1;
    }
    p.positions.splice(to,0,item);
    /* One PI to a group: a PI dragged into a group leads it, and whoever
       led it before does not. The one being moved wins because moving it
       is the deliberate act. */
    if(item.pi)p.positions.forEach(function(x){
      if(x.id!==item.id&&(x.groupId||'')===(item.groupId||''))x.pi=false;});
    if(prevGroup===item.groupId&&from===to)return;
    save();CallCard.render();
  }

  return {html:html,bindDrag:bindDrag,
    mailMenu:mailMenu,mailTick:mailTick,mailOrg:mailOrg,mailAll:mailAll,mailCopy:mailCopy};
})();

/* ══ THE BACKBONE ════════════════════════════════════════════════════
   A saved shape of call: key events, named once, and the todos that hang
   off them, kept as offsets so the whole thing can be laid out again from
   one date.

   Every ITEA round is the same round. So is every Horizon lump-sum call:
   it opens, there is a gate, there is a submission, and the same fifteen
   things have to happen in the same order between them. Typing that out
   for each new call is not planning, it is transcription — and what it
   goes wrong at is memory, because a missed eligibility requirement does
   not cost time, it costs the proposal.

   This began as a per-project list of todos anchored to whatever key dates
   the call already had — the wrong end of the thing, since it could only
   be applied after a call existed. It became a backbone SAVED from a call
   that had already run, with no editor of its own, on the reasoning that
   the call sitting in front of you is a better editor than any form could
   be. Mark asked for a form anyway: the shape of a round is known before
   the first call of it exists, and typing "Opening, PO deadline, FPP
   deadline, Submission" from memory once is less work than running a
   whole call just to have something to save it from.

   A backbone owns both halves, so no guess is needed at either end. It
   carries its OWN key events as offsets from one of them — the anchor,
   the date you actually know first once the real call is announced — and
   its todos anchor to whichever event they belong to, by name, its own
   name, which always matches because it wrote it. Chosen while a call is
   being created, it fills the key-date editor in that form: real rows, in
   front of you, editable before you press Create. Nothing is written
   behind your back. */
var Backbone=(function(){

  function list(){if(!Array.isArray(backbones))backbones=[];return backbones;}
  function find(id){return list().filter(function(b){return b.id===id;})[0]||null;}
  function byName(n){
    var k=(n||'').trim().toLowerCase();
    return list().filter(function(b){return (b.name||'').trim().toLowerCase()===k;})[0]||null;
  }
  /* The key dates a backbone lays out from one date, in the shape the
     form's own editor takes — so what appears is editor rows and not a
     fact written somewhere you cannot see. */
  function markersAt(b,aIso){
    if(!b||!aIso||!isIsoDate(aIso))return [];
    return (b.markers||[]).map(function(m){
      return {id:uid(),name:m.name,date:addDays(aIso,+m.days||0),
        endDate:(m.endDays==null?'':addDays(aIso,+m.endDays||0)),
        color:'deadline'};
    });
  }
  /* Built against the call's REAL markers — the rows the form is actually
     carrying when Create is pressed, not the dates the backbone proposed.
     Mark sets the key dates himself; a todo laid out from anything else
     would be answering a question nobody asked.

     Each one comes out tied, by the marker's own id, so it goes on
     following that date for the life of the call. That is the whole
     point: the backbone lays the work out once, and the tie keeps it
     true afterwards. */
  function todosFor(b,c){
    if(!b||!c)return [];
    var byNm={};
    (c.markers||[]).forEach(function(m){
      if(m.name)byNm[m.name.trim().toLowerCase()]=m;});
    return (b.todos||[]).map(function(t){
      var m=t.marker?byNm[(t.marker||'').trim().toLowerCase()]:null;
      var ok=m&&m.date&&isIsoDate(m.date);
      return newTodo({text:t.text,effort:t.effort,category:t.category,
        dueDate:ok?addDays(m.date,+t.days||0):'',
        anchorId:ok?m.id:'',anchorDays:ok?(+t.days||0):0});
    });
  }

  /* ── In the new-call form ── */
  var chosen=null;                 // {id, iso} while the form is open
  function fillPicker(){
    var sel=byId('np-backbone');if(!sel)return;
    sel.innerHTML='<option value="">— none —</option>'
      +list().map(function(b){
        return '<option value="'+esc(b.id)+'">'+esc(b.name)+'</option>';}).join('');
    sel.value='';
    var d=byId('np-backbone-date');if(d)d.value='';
    chosen=null;
    note('');
  }
  function note(txt){
    var n=byId('np-backbone-note');
    if(n)n.textContent=txt||'';
  }
  /* Both controls run this, so it does not matter which order they are
     touched in: pick then date, or date then pick. */
  function choose(){
    var sel=byId('np-backbone'),d=byId('np-backbone-date');
    var b=sel&&sel.value?find(sel.value):null;
    if(!b){chosen=null;note('');return;}
    if(!d||!d.value){
      chosen=null;
      note('Give “'+b.anchor+'” a date and the '+(b.markers||[]).length
        +' key date'+((b.markers||[]).length===1?'':'s')+' fill in.');
      return;
    }
    chosen={id:b.id,iso:d.value};
    Editors.markerInit('np',markersAt(b,d.value));
    var n=(b.todos||[]).length;
    note((b.markers||[]).length+' key date'+((b.markers||[]).length===1?'':'s')
      +' filled in below, counted back from “'+b.anchor+'” — change any of '
      +'them and the work follows'
      +(n?'. '+n+' todo'+(n===1?'':'s')+', each tied to the date it hangs off.':'.'));
  }
  /* Called by the form once the project exists. The todos are built from
     the marker dates the form is ACTUALLY carrying, not from the ones the
     backbone proposed, so anything moved by hand before pressing Create is
     what the work hangs off. */
  function applyTodos(p){
    if(!chosen)return 0;
    var b=find(chosen.id);if(!b)return 0;
    var td=todosFor(b,calls[p.callId]);
    if(!td.length)return 0;
    listOn(p,'todos');
    td.forEach(function(t){p.todos.push(t);});
    return td.length;
  }
  function used(){return !!chosen;}

  /* ── The editor ──
     Reached from the header's overflow menu (PL.backboneOpen), not from
     any call — a backbone is authored directly now: key events by name,
     each an offset in weeks or months from whichever one is the anchor,
     and todos the same way off whichever event they belong to.

     Offsets are kept on disk in DAYS, which is what markersAt/todosFor
     above have always taken and is not changing. The typed amount and
     unit are kept alongside them purely so re-opening the editor shows
     back what was actually typed rather than a number reverse-engineered
     from it — nothing outside this editor ever reads amt/unit/dir. */
  var edState=null;   // {id, name, events:[{id,name,anchor,amt,unit,dir}], todos:[{id,text,tied,amt,unit,dir}]}
  var shown=false;
  function isOpen(){return shown;}

  function offsetDays(row){
    var amt=Math.abs(+row.amt)||0;
    var span=amt*(row.unit==='months'?30:7);
    return row.dir==='after'?span:-span;
  }
  /* The reverse, for a backbone that predates this editor and was saved
     with only a day count — read back as the nearest whole week, or
     whole months when the count happens to land on one exactly. */
  function unitsFor(days){
    var abs=Math.abs(+days||0);
    if(abs&&abs%30===0)return {amt:abs/30,unit:'months'};
    return {amt:Math.round(abs/7),unit:'weeks'};
  }

  function blank(){return {id:null,name:'',events:[],todos:[]};}
  function load(id){
    var b=id?find(id):null;
    if(!b){edState=blank();return;}
    var evs=(b.markers||[]).map(function(m){
      var u=(m.unit&&m.amt!=null)?{amt:m.amt,unit:m.unit}:unitsFor(m.days);
      return {id:mkId(),name:m.name||'',anchor:false,amt:u.amt,unit:u.unit,
        dir:m.dir||((+m.days||0)>=0?'after':'before')};
    });
    var aKey=(b.anchor||'').trim().toLowerCase(),gotAnchor=false;
    evs.forEach(function(e){
      if(!gotAnchor&&e.name.trim().toLowerCase()===aKey){e.anchor=true;gotAnchor=true;}
    });
    if(!gotAnchor&&evs.length)evs[evs.length-1].anchor=true;
    var byNm={};
    evs.forEach(function(e){byNm[e.name.trim().toLowerCase()]=e.id;});
    var tds=(b.todos||[]).map(function(t){
      var u=(t.unit&&t.amt!=null)?{amt:t.amt,unit:t.unit}:unitsFor(t.days);
      return {id:mkId(),text:t.text||'',tied:byNm[(t.marker||'').trim().toLowerCase()]||'',
        amt:u.amt,unit:u.unit,dir:t.dir||((+t.days||0)>=0?'after':'before')};
    });
    edState={id:b.id,name:b.name||'',events:evs,todos:tds};
  }

  function open(){
    Menu.close();
    load(null);
    shown=true;
    var host=byId('bb-editor');if(!host)return;
    host.removeAttribute('hidden');
    draw();
    refreshVeil();
    setTimeout(function(){var i=byId('bbe-name');if(i)i.focus();},30);
  }
  function close(){
    shown=false;
    var host=byId('bb-editor');
    if(host)host.setAttribute('hidden','');
    refreshVeil();
  }
  function editOne(id){load(id);draw();}
  function newOne(){load(null);draw();}

  function evAdd(){
    edState.events.push({id:mkId(),name:'',anchor:!edState.events.length,
      amt:2,unit:'weeks',dir:'before'});
    draw();
  }
  function evField(i,field,val){
    var e=edState.events[i];if(!e)return;
    e[field]=val;
    draw();
  }
  function evAnchor(i){
    edState.events.forEach(function(e,j){e.anchor=(j===i);});
    draw();
  }
  function evRemove(i){
    var was=edState.events[i];
    edState.events.splice(i,1);
    if(was&&was.anchor&&edState.events.length)edState.events[0].anchor=true;
    draw();
  }

  function tdAdd(){
    var anchorEv=edState.events.filter(function(e){return e.anchor;})[0];
    edState.todos.push({id:mkId(),text:'',tied:anchorEv?anchorEv.id:'',
      amt:1,unit:'weeks',dir:'before'});
    draw();
  }
  function tdField(i,field,val){
    var t=edState.todos[i];if(!t)return;
    t[field]=val;
    draw();
  }
  function tdRemove(i){
    edState.todos.splice(i,1);
    draw();
  }

  function offsetHTML(kind,i,row){
    return '<div class="bbe-off">'
      +'<input type="number" class="editor-inp bbe-off-n" min="0" step="1" value="'+esc(row.amt)+'" '
        +'onchange="PL.backbone'+kind+'Field('+i+',\'amt\',this.value)" />'
      +'<select class="editor-inp bbe-off-u" onchange="PL.backbone'+kind+'Field('+i+',\'unit\',this.value)">'
        +'<option value="weeks"'+(row.unit==='weeks'?' selected':'')+'>weeks</option>'
        +'<option value="months"'+(row.unit==='months'?' selected':'')+'>months</option>'
      +'</select>'
      +'<select class="editor-inp bbe-off-d" onchange="PL.backbone'+kind+'Field('+i+',\'dir\',this.value)">'
        +'<option value="before"'+(row.dir!=='after'?' selected':'')+'>before</option>'
        +'<option value="after"'+(row.dir==='after'?' selected':'')+'>after</option>'
      +'</select>'
    +'</div>';
  }

  function drawEvents(){
    var el=byId('bbe-events');if(!el)return;
    var evs=edState.events;
    if(!evs.length){
      el.innerHTML='<div class="editor-none">No key events yet. Click "+ Add key event".</div>';
      return;
    }
    el.innerHTML=evs.map(function(e,i){
      return '<div class="bbe-row bbe-ev-row">'
        +'<input type="text" class="editor-inp bbe-name-inp" placeholder="e.g. Submission deadline" '
          +'value="'+esc(e.name)+'" onchange="PL.backboneEvField('+i+',\'name\',this.value)" />'
        +(e.anchor
          ? '<span class="bbe-anchor-tag" title="Every other event and todo counts from this one">the anchor — dated when you use it</span>'
          : offsetHTML('Ev',i,e))
        +'<label class="bbe-anchor-label" title="Make this the date everything else counts from">'
          +'<input type="radio" name="bbe-anchor" '+(e.anchor?'checked':'')+' '
          +'onchange="PL.backboneEvAnchor('+i+')" /> Anchor</label>'
        +'<button type="button" class="editor-del" title="Remove this key event" '
          +'onclick="PL.backboneEvRemove('+i+')">✕</button>'
      +'</div>';
    }).join('');
  }

  function drawTodos(){
    var el=byId('bbe-todos');if(!el)return;
    var evs=edState.events;
    if(!edState.todos.length){
      el.innerHTML='<div class="editor-none">No todos yet. Click "+ Add todo".</div>';
      return;
    }
    el.innerHTML=edState.todos.map(function(t,i){
      var tiedOpts=evs.length
        ? evs.map(function(e){
            return '<option value="'+esc(e.id)+'"'+(t.tied===e.id?' selected':'')+'>'
              +esc(e.name||'(unnamed event)')+'</option>';
          }).join('')
        : '<option value="">— add a key event first —</option>';
      return '<div class="bbe-row bbe-td-row">'
        +'<input type="text" class="editor-inp bbe-name-inp" placeholder="e.g. Draft the impact section" '
          +'value="'+esc(t.text)+'" onchange="PL.backboneTdField('+i+',\'text\',this.value)" />'
        +'<select class="editor-inp bbe-tied" '+(evs.length?'':'disabled')+' '
          +'onchange="PL.backboneTdField('+i+',\'tied\',this.value)">'+tiedOpts+'</select>'
        +offsetHTML('Td',i,t)
        +'<button type="button" class="editor-del" title="Remove this todo" '
          +'onclick="PL.backboneTdRemove('+i+')">✕</button>'
      +'</div>';
    }).join('');
  }

  function drawSaved(){
    var el=byId('bbe-saved');if(!el)return;
    if(!list().length){
      el.innerHTML='<div class="editor-none">No backbones saved yet — the one below will be the first.</div>';
      return;
    }
    el.innerHTML=list().map(function(b){
      return '<div class="bb-row'+(edState.id===b.id?' bb-row-active':'')+'" '
        +'onclick="PL.backboneEdit(\''+jsq(b.id)+'\')">'
        +'<span class="bb-row-name">'+esc(b.name)+'</span>'
        +'<span class="bb-row-meta">'+(b.markers||[]).length+' event'
          +((b.markers||[]).length===1?'':'s')
          +' · '+(b.todos||[]).length+' todo'+((b.todos||[]).length===1?'':'s')+'</span>'
        +'<button type="button" class="bb-row-del" title="Delete this backbone" '
          +'onclick="PL.backboneDelete(\''+jsq(b.id)+'\',event)">✕</button>'
      +'</div>';
    }).join('')
      +'<button type="button" class="btn btn-sm bbe-new-btn" onclick="PL.backboneNew()">+ New backbone</button>';
  }

  function draw(){
    var t=byId('bbe-form-title');
    if(t)t.textContent=edState.id?('Editing “'+(edState.name||'')+'”'):'New backbone';
    var n=byId('bbe-name');if(n&&n.value!==edState.name)n.value=edState.name;
    drawSaved();
    drawEvents();
    drawTodos();
  }
  function nameField(val){edState.name=val;}

  function editorSave(){
    var name=(edState.name||'').trim();
    if(!name){toast('Name this backbone first.');return;}
    var evs=edState.events.filter(function(e){return (e.name||'').trim();});
    if(!evs.length){toast('Add at least one key event.');return;}
    var anchorEv=evs.filter(function(e){return e.anchor;})[0]||evs[0];
    var markers=evs.map(function(e){
      var isAnchor=(e===anchorEv);
      return {name:e.name.trim(),days:isAnchor?0:offsetDays(e),endDays:null,
        amt:isAnchor?0:(+e.amt||0),unit:e.unit,dir:e.dir};
    });
    var tds=edState.todos.filter(function(t){
      return (t.text||'').trim()&&t.tied&&evs.some(function(e){return e.id===t.tied;});
    }).map(function(t){
      var ev=evs.filter(function(e){return e.id===t.tied;})[0];
      return {text:t.text.trim(),effort:0,category:'',marker:ev.name.trim(),
        days:offsetDays(t),amt:+t.amt||0,unit:t.unit,dir:t.dir};
    });
    var now=nowIso();
    var rec={name:name,anchor:anchorEv.name.trim(),markers:markers,todos:tds,edited:now};
    var existing=edState.id?find(edState.id):byName(name);
    if(existing)Object.assign(existing,rec);
    else list().push(Object.assign({id:uid(),created:now},rec));
    save();
    edState.id=(existing||list()[list().length-1]).id;
    fillPicker();
    toast('Backbone “'+trunc(name,32)+'” saved — '+markers.length+' key event'
      +(markers.length===1?'':'s')+', '+tds.length+' todo'+(tds.length===1?'':'s'));
    draw();
  }

  function del(id,evt){
    if(evt)evt.stopPropagation();
    var b=find(id);if(!b)return;
    var at=list().indexOf(b);
    list().splice(at,1);save();
    toast('Backbone “'+trunc(b.name||'',32)+'” deleted',
      {action:'Undo',onAction:function(){list().splice(at,0,b);save();if(shown)drawSaved();}});
    if(shown){
      if(edState&&edState.id===id)load(null);
      draw();
    }
    fillPicker();
  }

  return {fillPicker:fillPicker,choose:choose,applyTodos:applyTodos,used:used,
    isOpen:isOpen,open:open,close:close,edit:editOne,newOne:newOne,
    nameField:nameField,save:editorSave,
    evAdd:evAdd,evField:evField,evAnchor:evAnchor,evRemove:evRemove,
    tdAdd:tdAdd,tdField:tdField,tdRemove:tdRemove,
    del:del};
})();

/* ══ THE DOSSIER ═════════════════════════════════════════════════════
   The card's fold-out face, and the same structure the call table is: a
   list of rows, each owning its notes.

   It used to be neither. Rows were DERIVED — walk p.entries, take each
   distinct non-todo `type`, and read the row's name and colour from a
   side overlay (p.infoRows) because an entry had nowhere to put them.
   So `type` was doing three jobs at once: telling a todo from a note,
   identifying a row, and standing in as an id for custom rows
   ('custom-<uid>'). All three are now separate things, and a note simply
   lives in a row. */
var Dossier=(function(){
  var openCard=null;
  var openDone={},doneAll={};
  var DONE_SHOWN=12;   // newest this many; the rest wait behind a chip

  /* Takes a project or its id: the adapter is handed a ctx (the id),
     while the internal callers already hold the object. */
  function proj(p){return (typeof p==='string')?projects[p]:p;}
  function rows(p){p=proj(p);return p?rowsOf(p):[];}

  /* ── The rows themselves are a RowTable ──
     Same component the call table is, and now the same data shape too,
     so this adapter says almost nothing: where the rows live, and that
     a note is a note. */
  RowTable.register('pi',{
    owner:function(pid){return projects[pid]||null;},
    grip:true,             /* a dedicated handle, so the title stays a field */
    renameOnAdd:true,
    addRowAt:'top',        /* new rows land where the eye is */
    rerender:rerender
  });

  /* ── The Completed row ──
     A ticked todo leaves the board for good, but it is still a record of
     work done on this project — so it comes back here as a note named for
     the day it was finished. Read-only by design: the only verbs are
     reopen and delete. */
  function doneKey(e){
    if(e.doneAt&&isIsoDate(e.doneAt))return e.doneAt;
    if(e.dueDate&&isIsoDate(e.dueDate))return e.dueDate;
    return '';
  }
  /* Only todos ticked from now on carry a doneAt. Older ones fall back to
     their planned date, and failing that to the day they were written —
     which their stamp already records. */
  function doneName(e){
    var k=doneKey(e);
    if(k)return fmtDate(k);
    /* Nothing recorded either date, so fall back to the day it was
       written, which every todo now carries as a real timestamp. */
    return e.created?fmtDate(e.created.slice(0,10)):'\u2014';
  }
  function doneTodos(p){
    return ((p&&p.todos)||[])
      .filter(function(e){return e.done;})
      .map(function(e,i){return {e:e,i:i};})
      .sort(function(a,b){
        var ka=doneKey(a.e),kb=doneKey(b.e);
        if(ka!==kb)return (ka&&kb)?(ka<kb?1:-1):(ka?-1:1);
        return b.i-a.i;                      // newest entry first within a day
      })
      .map(function(x){return x.e;});
  }
  function toggleDone(pid,eid,evt){
    if(evt)evt.stopPropagation();
    openDone[pid]=(openDone[pid]===eid)?'':eid;
    rerender(pid);
  }
  function showAllDone(pid,evt){
    if(evt)evt.stopPropagation();
    doneAll[pid]=true;rerender(pid);
  }
  function reopenTodo(pid,eid,evt){
    if(evt)evt.stopPropagation();
    var e=findTodo(pid,eid);if(!e)return;
    e.done=false;delete e.doneAt;
    openDone[pid]='';
    save();rerender(pid);
    Beam.render();                           // it counts against the board again
    toast('Todo reopened.');
  }
  function doneRowHTML(pid){
    var p=projects[pid];if(!p)return '';
    var all=doneTodos(p);
    if(!all.length)return '';
    var dones=doneAll[pid]?all:all.slice(0,DONE_SHOWN);
    var hidden=all.length-dones.length;
    var openId=openDone[pid]||'';
    var tabs=dones.map(function(e){
      var txt=String(e.text||'').replace(/\s+/g,' ').trim();
      var tip=esc(doneName(e))+(txt?'\n'+esc(trunc(txt,90)):'')
        +(e.created?'\nWritten '+esc(fmtAbs(e.created)):'');
      return '<span class="note-tab has-content'+(openId===e.id?' open':'')+'" '
        +'role="button" tabindex="0" '
        +'onclick="PL.piToggleDone(\''+jsq(pid)+'\',\''+jsq(e.id)+'\',event)" '
        +'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();'
          +'PL.piToggleDone(\''+jsq(pid)+'\',\''+jsq(e.id)+'\',event);}" '
        +'title="'+tip+'">'
        +'<span class="note-dot"></span>'
        +'<span class="note-lbl">'+esc(doneName(e))+'</span></span>';
    }).join('');
    if(hidden)tabs+='<button type="button" class="pi-done-more" title="Show the older ones too" '
      +'onclick="PL.piShowAllDone(\''+jsq(pid)+'\',event)">+'+hidden+' older</button>';

    var open=dones.find(function(e){return e.id===openId;});
    var panel='';
    if(open){
      var chk=open.checklist||[];
      var chkHtml=chk.length?'<div class="pi-done-chk">'+chk.map(function(c){
        return '<div class="pi-done-chk-item'+(c.done?' done':'')+'">'
          +'<span class="pi-done-chk-mark">'+(c.done?'\u2713':'\u00b7')+'</span>'+esc(c.text||'')+'</div>';
      }).join('')+'</div>':'';
      var subs=(open.subStamps||[]).slice().reverse()
        .map(function(u){return substampHTML(u,'');}).join('');
      /* The same bare panel a note opens into: no header repeating the
         date the tab already carries, just the record and its two verbs
         floated into the corner for the text to wrap past. */
      panel='<div class="note-panel pi-done-panel" onclick="event.stopPropagation()">'
        +'<div class="pi-done-tools">'
          +'<button type="button" class="pi-done-btn" title="Put this back on the board" '
            +'onclick="PL.piReopen(\''+jsq(pid)+'\',\''+jsq(open.id)+'\',event)">\u21a9 Reopen</button>'
          +'<button type="button" class="note-del" title="Delete this todo" '
            +'onclick="PL.deleteTodo(\''+jsq(pid)+'\',\''+jsq(open.id)+'\',event)">\u2715</button>'
        +'</div>'
        +'<div class="pi-done-text">'+esc(open.text||'')+'</div>'
        +chkHtml
        +(subs?'<div class="substamps pi-done-subs">'+subs+'</div>':'')
      +'</div>';
    }
    /* No data-rt: this row is derived, not one of the table's own, so the
       shared component never sees it and it stays out of the reorder. */
    return '<div class="pi-row pi-row-done'+(panel?' pi-done-lit':'')+'" data-pid="'+esc(pid)+'">'
      +'<div class="pi-row-main">'
        +'<span class="pi-done-gap" aria-hidden="true"></span>'
        +'<span class="pi-done-dot" aria-hidden="true"></span>'
        +'<span class="pi-done-name">Completed</span>'
        +'<div class="pi-row-tabs">'+tabs+'</div>'
        +'<span class="pi-row-count" title="'+all.length+' finished todo'+(all.length===1?'':'s')+'">'
          +all.length+'</span>'
        +'<span class="pi-done-tail" aria-hidden="true"></span>'
      +'</div>'+panel+'</div>';
  }

  function faceHTML(pid){
    var p=projects[pid];if(!p)return '';
    var list=rows(p);
    var doneHtml=doneRowHTML(pid);
    var rowsHtml=list.length
      ? RowTable.rowsHTML('pi',pid)
      : (doneHtml?'':'<div class="pi-empty">No rows yet. Add one to start taking notes on this project.</div>');
    var nNotes=list.reduce(function(a,r){return a+r.notes.length;},0);
    var meta=list.length
      ?'<span class="pi-head-meta">'+list.length+(list.length===1?' row':' rows')
        +(nNotes?' \u00b7 '+nNotes+(nNotes===1?' note':' notes'):'')+'</span>'
      :'';
    return '<div class="pi-face">'
      +'<div class="pi-head">'
        +'<div class="pi-head-title">Dossier'+meta+'</div>'
        +'<button type="button" class="pi-addrow" title="Add a new row" '
          +'onclick="PL.rtAddRow(\'pi\',\''+esc(pid)+'\');event.stopPropagation()">+ Row</button>'
      +'</div>'
      +'<div class="pi-rows">'+rowsHtml+doneHtml+'</div>'
      /* The foot the three project actions used to stand on is gone. Edit
         is a button on the card's own rail now, and archiving and
         deleting are inside the form it opens: they are things you do to
         a project, and the dossier is where you keep notes about one. A
         Delete sitting under a page of notes was also the wrong place for
         the one control in the room that throws work away. */
      +'</div>';
  }

  /* ── The fold ── */
  function isOpen(pid){return openCard===pid;}
  function toggleFold(pid,evt){
    stopEvt(evt);
    if(openCard===pid)close(); else open(pid);
  }
  function open(pid){
    var p=projects[pid];
    if(!p){toast('That project no longer exists.');return;}
    if(openCard&&openCard!==pid){
      /* Collapse the other first, without waiting — two cards mid-fold at
         once reads as chaos and the layout fights itself. */
      var pe=q('.pi-fold[data-pid="'+cssEsc(openCard)+'"]');
      if(pe)pe.classList.remove('pi-open');
    }
    openCard=pid;
    var el=q('.pi-fold[data-pid="'+cssEsc(pid)+'"]');
    if(!el){CallCard.render();return;}
    var body=q('.pi-fold-body',el);
    if(body)body.innerHTML=faceHTML(pid);
    /* The panel must be painted at its closed size before the class
       lands, or there is no "before" state and it simply appears open. */
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        if(openCard!==pid)return;
        el.classList.add('pi-open');
        bindRowDrag(pid);
        bindOutside();
      });
    });
  }
  function close(){
    unbindOutside();
    var pid=openCard;
    if(!pid)return;
    var el=q('.pi-fold[data-pid="'+cssEsc(pid)+'"]');
    openCard=null;
    if(!el)return;
    el.classList.remove('pi-open');
    /* Leave the content mounted until the fold has finished closing —
       emptying it at once makes the panel collapse instead of animating. */
    setTimeout(function(){
      if(openCard===pid)return;                 // reopened within the window
      var body=q('.pi-fold-body',el);
      if(body&&!el.classList.contains('pi-open'))body.innerHTML='';
    },460);                                     // must exceed the 0.44s slide
  }
  function rerender(pid){
    if(openCard!==pid){CallCard.render();return;}
    var el=q('.pi-fold[data-pid="'+cssEsc(pid)+'"]');
    if(!el){CallCard.render();return;}
    var body=q('.pi-fold-body',el);
    if(!body){CallCard.render();return;}
    body.innerHTML=faceHTML(pid);
    bindRowDrag(pid);
  }
  function onOutside(e){
    if(!openCard)return;
    if(e.target.closest('.pi-fold.pi-open'))return;
    /* The things parked outside this card so nothing can clip them are
       still its business: a colour menu, the calendar, a toast, and the
       new-todo pane opened from its own Add todo button. A press inside
       one of those must not fold the card away underneath it. */
    if(e.target.closest('.colmenu'))return;
    if(e.target.closest('.dp-popup'))return;
    if(e.target.closest('.pj-toast'))return;
    if(e.target.closest('#qt'))return;
    /* Every pane in this room opens over the card, and the edit pane in
       particular is opened FROM it. A press inside one is not a press
       outside the card. */
    if(e.target.closest('.pf-host'))return;
    close();
  }
  function bindOutside(){setTimeout(function(){document.addEventListener('mousedown',onOutside);},0);}
  function unbindOutside(){document.removeEventListener('mousedown',onOutside);}

  function bindRowDrag(pid){
    RowTable.bind('pi',pid,q('.pi-fold[data-pid="'+cssEsc(pid)+'"] .pi-rows'));
  }
  function rebindOpen(){
    if(openCard)bindRowDrag(openCard);
  }

  /* ── Project actions, living on the folded-out face ── */
  function archive(pid,evt){
    if(evt)evt.stopPropagation();
    var p=projects[pid];if(!p)return;
    p.archived=!p.archived;
    save();
    var wasArchived=p.archived;
    /* An archived project leaves the active list entirely, so there is
       nothing left to stay folded open on — and the pane that raised this
       is describing a project that has left the list. */
    ProjectForm.closeEdit();
    close();CallCard.render();
    toast(wasArchived?'Project archived':'Project restored',{action:'Undo',onAction:function(){
      var pr=projects[pid];if(!pr)return;
      pr.archived=!pr.archived;save();CallCard.render();
    }});
  }
  function del(pid,evt){
    if(evt)evt.stopPropagation();
    var p=projects[pid];if(!p)return;
    /* No question asked. This used to warn that it could not be undone
       while the toast below has always offered exactly that — so the
       warning was both an interruption and untrue. */
    var snapshot=JSON.parse(JSON.stringify(p));
    var callId=p.callId;
    delete projects[pid];
    /* The call outlives its projects unless it was this project's own
       solo call, or a real call left holding nothing at all. Its notes
       may be the only record of a proposal that was pulled. */
    var callSnapshot=calls[callId]?JSON.parse(JSON.stringify(calls[callId])):null;
    var prunedCall=pruneCallIfBare(callId);
    if(Nav.anchor()===callId&&prunedCall)Nav.setAnchor(null);
    ProjectForm.closeEdit();
    save();close();CallCard.render();Beam.render();
    toast('Project deleted \u2014 \u201c'+trunc(plain(snapshot.name||''),40)+'\u201d',
      {action:'Undo',onAction:function(){
        if(prunedCall&&callSnapshot&&!calls[callId])calls[callId]=callSnapshot;
        projects[pid]=snapshot;save();CallCard.render();Beam.render();
      }});
  }

  return {faceHTML:faceHTML,isOpen:isOpen,toggleFold:toggleFold,open:open,close:close,
    rerender:rerender,rebindOpen:rebindOpen,openCard:function(){return openCard;},
    toggleDone:toggleDone,showAllDone:showAllDone,reopenTodo:reopenTodo,
    archive:archive,del:del};
})();

/* ══ THE CONTRIBUTION TRACKER ═════════════════════════════════════════
   Work packages, their tasks, and who contributes how many person-months
   to each. Three readings of the same rows — detail, timeline, board
   image — never two at once.

   Editing happens IN the rows. Pressing a work package's title turns it
   and every task under it into edit rows: the number and name in the cell
   that already showed them, the months and the leader in the body where
   the bar they describe is drawn. The table never changes shape, so you
   never lose your place in it. */
var Tracker=(function(){

  var PMCOL_W=32;                 // keep in step with #ct-view .pm-tcell
  var pid=null;
  var gantt=false,board=false;
  var editWP=null;                // the work package whose block is open
  var openVertical=null;
  var labelW=300;
  var imgUrl=null;

  function proj(){return pid?projects[pid]:null;}
  function data(){
    var p=proj();if(!p)return null;
    if(!p.tracker||typeof p.tracker!=='object')p.tracker={};
    var t=p.tracker;
    listsOn(t,'wps','pmGroups','verticals');
    if(!t.months)t.months=36;
    t.wps.forEach(function(wp){
      if(!wp.id)wp.id=uid();
      listsOn(wp,'tasks','notes');
      if(!wp.pmByGroup||typeof wp.pmByGroup!=='object')wp.pmByGroup={};
      wp.tasks.forEach(function(tk){
        if(!tk.id)tk.id=uid();
        listOn(tk,'notes');
        if(!tk.pmByGroup||typeof tk.pmByGroup!=='object')tk.pmByGroup={};
      });
    });
    return t;
  }

  /* ── Migrations, called once at load from runDataMigrations ── */
  /* PM used to be a single number per row before groups existed. Any such
     value has no column to live in now, so it is dropped rather than
     silently attributed to whichever group happens to be first. */
  function wipeUngroupedPm(t){
    if(!t||!Array.isArray(t.wps))return false;
    var dirty=false;
    function clean(r){
      if(r&&r.pm!==undefined){delete r.pm;dirty=true;}
    }
    t.wps.forEach(function(wp){clean(wp);(wp.tasks||[]).forEach(clean);});
    return dirty;
  }
  /* A group can be deleted while rows still carry PM keyed to its id.
     Those numbers would then be invisible but still counted in totals. */
  function stripDeadGroupFields(t){
    if(!t||!Array.isArray(t.wps))return false;
    var live={};
    (t.pmGroups||[]).forEach(function(g){live[g.id]=true;});
    var dirty=false;
    function clean(r){
      if(!r||!r.pmByGroup)return;
      Object.keys(r.pmByGroup).forEach(function(gid){
        if(!live[gid]){delete r.pmByGroup[gid];dirty=true;}
      });
    }
    t.wps.forEach(function(wp){clean(wp);(wp.tasks||[]).forEach(clean);});
    return dirty;
  }

  /* ── Effort ──
     A work package's effort is its own PM, or — having none of its own —
     the sum of its tasks'. Written once, so the row total, the group
     total and the project card cannot disagree. */
  function rowPm(r,gid){
    var v=r&&r.pmByGroup?r.pmByGroup[gid]:'';
    return (v===''||v==null||isNaN(v))?null:Number(v);
  }
  function wpPm(wp,gid){
    var own=rowPm(wp,gid);
    if(own!=null)return own;
    var sum=0,any=false;
    (wp.tasks||[]).forEach(function(tk){
      var v=rowPm(tk,gid);
      if(v!=null){sum+=v;any=true;}
    });
    return any?sum:null;
  }
  function totalPm(){
    var t=data();if(!t)return 0;
    var sum=0;
    t.wps.forEach(function(wp){
      (t.pmGroups||[]).forEach(function(g){
        var v=wpPm(wp,g.id);
        if(v!=null)sum+=v;
      });
    });
    return Math.round(sum*100)/100;
  }
  /* Implied months: a work package without its own span covers the union
     of its tasks' spans, so a bar is drawn either way. */
  function wpSpan(wp){
    var s=parseFloat(wp.startMonth),e=parseFloat(wp.endMonth);
    if(!isNaN(s)&&!isNaN(e))return {s:s,e:e,implied:false};
    var ms=null,me=null;
    (wp.tasks||[]).forEach(function(tk){
      var ts=parseFloat(tk.startMonth),te=parseFloat(tk.endMonth);
      if(!isNaN(ts))ms=(ms==null?ts:Math.min(ms,ts));
      if(!isNaN(te))me=(me==null?te:Math.max(me,te));
    });
    if(ms!=null&&me!=null)return {s:ms,e:me,implied:true};
    return null;
  }
  function wpColor(wp,idx){
    return safeColor(wp.color||WP_COLORS[idx%WP_COLORS.length],'#8a7048');
  }
  function taskColor(task,wp,idx){
    var baseline=wpColor(wp,idx);
    return safeColor(task&&task.color?task.color:baseline,baseline);
  }

  /* ── The head ── */
  function groupHeadHTML(){
    var t=data();if(!t)return '';
    return (t.pmGroups||[]).map(function(g){
      return '<button type="button" class="pm-tag" data-gid="'+esc(g.id)+'" '
        +'title="'+esc(g.name||g.short||'Group')+(g.isMCS?' \u2014 M&CS group':'')
        +' \u2014 click to edit" onclick="CT.groupMenu(this,\''+esc(g.id)+'\')">'
        +esc(g.short||'?')+'</button>';
    }).join('');
  }
  function groupMenu(btn,gid){
    var t=data();if(!t)return;
    var g=(t.pmGroups||[]).find(function(x){return x.id===gid;});
    if(!g)return;
    Menu.open(btn,
      '<div class="colmenu-row"><label>Short label</label>'
        +'<input type="text" value="'+esc(g.short||'')+'" maxlength="6" '
        +'oninput="CT.groupField(\''+esc(gid)+'\',\'short\',this.value)" /></div>'
      +'<div class="colmenu-row"><label>Full name</label>'
        +'<input type="text" value="'+esc(g.name||'')+'" '
        +'oninput="CT.groupField(\''+esc(gid)+'\',\'name\',this.value)" /></div>'
      +'<label class="colmenu-row pmg-mcs-row"><input type="checkbox"'+(g.isMCS?' checked':'')+' '
        +'onchange="CT.groupField(\''+esc(gid)+'\',\'isMCS\',this.checked)" /> M&amp;CS group</label>'
      +'<div class="colmenu-actions">'
        +'<button type="button" class="btn btn-xs btn-danger" '
        +'onclick="CT.delGroup(\''+esc(gid)+'\')">Delete column</button></div>',
      {id:'ct-pmgroupmenu'});
  }
  function groupField(gid,field,val){
    var t=data();if(!t)return;
    var g=(t.pmGroups||[]).find(function(x){return x.id===gid;});
    if(!g)return;
    g[field]=val;
    saveSoon();
    if(field==='short'){
      var tag=q('#ct-pmgrouphead .pm-tag[data-gid="'+cssEsc(gid)+'"]');
      if(tag)tag.textContent=val||'?';
    }
    /* An M&CS switch changes the project card's whole right-hand column,
       so that has to be redrawn — but only once the menu is closed, or the
       checkbox would be torn out from under the pointer. */
    if(field==='isMCS')_mcsDirty=true;
  }
  var _mcsDirty=false;
  function addGroup(){
    var t=data();if(!t)return;
    t.pmGroups.push({id:uid(),short:'NEW',name:'',isMCS:false});
    save();render();
  }
  /* Re-entered with the answer rather than wrapping the body in a
     closure: the question is asked once, at the top, and everything below
     reads exactly as it did. */
  function delGroup(gid,confirmed){
    var t=data();if(!t)return;
    if(!confirmed){
      Dialog.ask({title:'Delete PM column',
        body:'Any person-months recorded in this column will be lost.',
        confirm:'Delete column'},function(){delGroup(gid,true);});
      return;
    }
    t.pmGroups=(t.pmGroups||[]).filter(function(g){return g.id!==gid;});
    stripDeadGroupFields(t);
    /* A group that was a home for positions is gone; they fall back to the
       first group at display time, so nothing needs rewriting here. */
    save();Menu.close();render();
    CallCard.render();
  }

  /* ── The Gantt scale ── */
  function scaleLaneHTML(){
    var t=data();if(!t)return '';
    var m=t.months||36,h='',step=m<=18?3:(m<=36?6:12);
    /* Boundaries, rather than repeated background slices, define the header:
       m months always means exactly m boxes, including an explicit far edge. */
    for(var boundary=0;boundary<=m;boundary++){
      var edge=(boundary===m);
      h+='<div class="scale-tick'+(boundary%12===0?' year':'')+'" style="'
        +(edge?'right:0':'left:'+((boundary/m)*100).toFixed(4)+'%')+'"></div>';
    }
    var marks=[1];
    for(var i=step;i<m;i+=step)if(marks.indexOf(i)<0)marks.push(i);
    if(marks.indexOf(m)<0)marks.push(m);
    marks.forEach(function(month){
      h+='<span class="scale-num" style="left:'+(((month-0.5)/m)*100).toFixed(4)+'%">'
        +month+'</span>';
    });
    return h;
  }

  /* ── Rows ── */
  function pmCellsHTML(r,isWp,wp){
    var t=data();if(!t)return '';
    var groups=t.pmGroups||[];
    if(!groups.length)return '';
    var leader=matchingLeaderGroup(r,groups);
    return '<div class="pm-stack">'+groups.map(function(g){
      var shown=isWp?wpPm(wp,g.id):rowPm(r,g.id);
      var own=rowPm(r,g.id);
      /* The matching group gets the one leadership mark: its crown. */
      var leads=leader&&leader.id===g.id;
      return '<div class="pm-tcell'+(leads?' leads':'')+'"'
        +(leads?' title="'+esc(r.leader)+' leads this'+(isWp?' work package':' task')+'"':'')+'>'
        +'<input class="pm-tcell-input" type="text" inputmode="decimal" '
          +'value="'+esc(own==null?'':own)+'" '
          +'placeholder="'+esc(shown==null?'':(own==null?shown:''))+'" '
          +'title="'+esc((g.name||g.short||'Group')+' \u2014 person-months')
            +(own==null&&shown!=null?' (from tasks)':'')+'" '
          +'onchange="CT.setPm(\''+esc(r.id)+'\',\''+esc(g.id)+'\',this.value)" '
          +'onclick="event.stopPropagation()" /></div>';
    }).join('')+'</div>';
  }

  function groupKey(value){
    return String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  }
  function matchingLeaderGroup(r,groups){
    var key=groupKey(r&&r.leader);
    if(!key)return null;
    return (groups||[]).find(function(g){
      return key===groupKey(g.short)||key===groupKey(g.name);
    })||null;
  }

  function notesStrip(r){
    var st=RowTable.stripState(NS,NCTX,r.id);
    return Notes.strip({
      hostId:RowTable.hostId(NS,NCTX,r.id),
      notes:r.notes||[],
      openId:st.openId,justOpened:st.justOpened,focusId:st.focusId,
      renamingId:st.renamingId,
      label:function(n){return n.label;},
      body:function(n){return n.body;},
      /* No dot: the tracker's tabs colour themselves when they have
         content. The body is the tracker's own rich-text field, shared
         with the verticals panel, so it keeps that class. */
      dot:false,rte:'rte-edit',
      call:RowTable.noteCalls(NS,NCTX,r.id)
    });
  }

  function ganttHTML(r,span,color,isWp){
    var t=data();if(!t)return '';
    if(!span)return '';
    var m=t.months||36;
    var start=Math.max(1,Math.min(m,span.s));
    var end=Math.max(start,Math.min(m,span.e));
    var left=((start-1)/m)*100,width=((end-start+1)/m)*100;
    if(width<=0)return '';
    var groups=t.pmGroups||[],hasPm=false;
    if(isWp){
      groups.forEach(function(g){
        var v=wpPm(r,g.id);
        if(v!=null&&v>0)hasPm=true;
      });
    }
    var crown=isWp&&matchingLeaderGroup(r,groups)
      ?'<span class="bar-crown" aria-hidden="true">\u265B</span>':'';
    return '<div class="bar'+(hasPm?' on':' no-effort')+(span.implied?' implied':'')+'" '
      +'style="left:'+left.toFixed(4)+'%;width:'+width.toFixed(4)+'%;'
      +'background:'+(hasPm?color:'transparent')+';border-color:'
      +(hasPm?color:hexA(color,0.65))+'">'+crown+'</div>';
  }

  function rowHTML(r,isWp,wp,idx,wpIdx,isLast){
    var t=data();
    var color=isWp?wpColor(r,wpIdx):taskColor(r,wp,wpIdx);
    var editingThis=editWP&&(isWp?editWP===r.id:editWP===wp.id);
    var span=isWp?wpSpan(r):(function(){
      var s=parseFloat(r.startMonth),e=parseFloat(r.endMonth);
      return (!isNaN(s)&&!isNaN(e))?{s:s,e:e,implied:false}:null;
    })();
    var strip=notesStrip(r);
    var involved=openVertical?vInvolves(openVertical,r.id):false;

    var cls='row '+(isWp?'wp':'task')
      +(editingThis?' editing':'')
      +(isLast?' task-last':'')
      +(involved?' v-involved':'')
      +(RowTable.openNoteId(NS,NCTX,r.id)?' open note-open':'');

    var label;
    if(editingThis){
      label='<div class="row-label">'
        +'<button type="button" class="ed-colordot" style="background:'
          +(!isWp&&!r.color?hexA(color,0.5):color)+'" '
          +'title="'+(isWp?'Choose work package colour'
            :(r.color?'Choose task colour':'Using work package colour — choose a task colour'))+'" '
          +'onclick="CT.colorMenu(this,\''+esc(r.id)+'\')"></button>'
        +'<span class="ed-numwrap">'
          +(isWp?'':'<span class="ed-numpre">'+esc(wp.num||'')+'.</span>')
          +'<input class="ed-in ed-num" type="text" value="'+esc(r.num||'')+'" '
            +'placeholder="'+(isWp?'1':'1')+'" title="Number" '
            +'onchange="CT.setField(\''+esc(r.id)+'\',\'num\',this.value)" /></span>'
        +'<input class="ed-in ed-name" type="text" value="'+esc(r.name||'')+'" '
          +'placeholder="'+(isWp?'Work package name':'Task name')+'" '
          +'onchange="CT.setField(\''+esc(r.id)+'\',\'name\',this.value)" />'
      +'</div>';
    } else {
      label='<div class="row-label" title="'+(isWp
          ?'Click to edit this work package and its tasks'
          :'Click to edit \u2014 opens the whole work package')+'" '
        +'onclick="CT.openEdit(\''+esc(isWp?r.id:wp.id)+'\')">'
        +'<span class="row-num">'+esc(isWp?(r.num||''):((wp.num||'')+'.'+(r.num||'')))+'</span>'
        +'<span class="row-name'+(r.name?'':' empty')+'">'
          +esc(r.name||(isWp?'Untitled work package':'Untitled task'))+'</span>'
      +'</div>';
    }

    var body;
    if(editingThis){
      body='<div class="row-body"><div class="row-detail"><div class="ed-inline">'
        +'<span class="ed-f"><span>from</span>'
          +'<input class="ed-in ed-mon" type="text" inputmode="numeric" value="'+esc(r.startMonth==null?'':r.startMonth)+'" '
          +'placeholder="M1" onchange="CT.setField(\''+esc(r.id)+'\',\'startMonth\',this.value)" /></span>'
        +'<span class="ed-f"><span>to</span>'
          +'<input class="ed-in ed-mon" type="text" inputmode="numeric" value="'+esc(r.endMonth==null?'':r.endMonth)+'" '
          +'placeholder="M'+(t.months||36)+'" onchange="CT.setField(\''+esc(r.id)+'\',\'endMonth\',this.value)" /></span>'
        +'<span class="ed-f ed-f-leader"><span>leader</span>'
          +'<input class="ed-in" type="text" value="'+esc(r.leader||'')+'" '
          +'placeholder="Partner" title="Who leads this \u2014 matching a PM column rings its number" '
          +'onchange="CT.setField(\''+esc(r.id)+'\',\'leader\',this.value)" /></span>'
        +'<span class="ed-actions">'
          +(isWp?'<button type="button" class="ed-btn" title="Add a task to this work package" '
            +'onclick="CT.addTask(\''+esc(r.id)+'\')">+ Task</button>':'')
          +(isWp?'<button type="button" class="ed-btn ed-done" onclick="CT.closeEdit()">Done</button>':'')
          +'<button type="button" class="icon-btn del" title="Delete this '+(isWp?'work package':'task')+'" '
            +'onclick="CT.delRow(\''+esc(r.id)+'\')">\u2715</button>'
        +'</span></div></div></div>';
    } else {
      body='<div class="row-body">'
        +'<div class="row-detail"><div class="col-notes"><div class="note-tabs">'
          +strip.tabs+'</div></div></div>'
        +'<div class="row-gantt">'+ganttHTML(r,span,color,isWp)+'</div>'
      +'</div>';
    }

    var dot=(involved&&openVertical)?'<span class="v-dot"></span>':'';
    var vars=' style="--row-color:'+color+';--row-fill:'+hexA(color,isWp?0.32:0.24)
      +';--row-edge:'+hexA(color,0.7)
      +(isWp?'':';--wp-tint:'+hexA(color,0.13)+';--wp-beam:'+hexA(color,0.55))+'"';
    return '<div class="'+cls+'" data-row-id="'+esc(r.id)+'"'+vars+'>'
      +label+dot+pmCellsHTML(r,isWp,isWp?r:null)+body
      +(editingThis?'':strip.panel)+'</div>';
  }

  function rowsHTML(){
    var t=data();if(!t)return '';
    if(!t.wps.length)
      return '<div class="empty-state">No work packages yet. Use <b>+ WP</b> above to add the first one.</div>';
    var out='';
    t.wps.forEach(function(wp,wi){
      out+=wpBlockHTML(wp,wi);
    });
    return out;
  }
  function wpBlockHTML(wp,wi){
    try{
      var out=rowHTML(wp,true,null,wi,wi,false);
      (wp.tasks||[]).forEach(function(tk,ti){
        out+=rowHTML(tk,false,wp,ti,wi,ti===wp.tasks.length-1);
      });
      return out;
    }catch(err){
      /* One malformed row must not blank the whole board. */
      return '<div class="row-render-error">Could not draw \u201c'
        +esc(wp.name||'work package')+'\u201d \u2014 '+esc(err.message)+'</div>';
    }
  }

  /* ── Verticals ── */
  function vInvolves(v,rowId){
    return !!(v&&Array.isArray(v.rows)&&v.rows.indexOf(rowId)>-1);
  }
  function vcolor(v,i){return safeColor((v&&v.color)||WP_COLORS[i%WP_COLORS.length],'#8a7048');}
  function vfootHTML(){
    var t=data();if(!t)return '';
    var tabs=(t.verticals||[]).map(function(v,i){
      var c=vcolor(v,i);
      var on=openVertical&&openVertical.id===v.id;
      return '<button type="button" class="vtab'+(on?' active':'')+'" '
        +'style="--vtab-color:'+c+';--vtab-color-dim:'+hexA(c,0.45)+'" '
        +'onclick="CT.toggleVertical(\''+esc(v.id)+'\')" '
        +'title="'+esc(v.name||'Untitled')+'">'+esc(v.short||v.name||'\u2014')+'</button>';
    }).join('');
    return '<div class="vfoot-left">'
        +'<span class="vfoot-lbl" contenteditable="true" spellcheck="false" '
          +'title="Rename this strip" onblur="CT.setVLabel(this.textContent)" '
          +'onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur();}">'
          +esc(t.verticalLabel||'Use cases')+'</span>'
      +'</div>'
      +'<div class="vfoot-tabs">'+tabs
        +'<button type="button" class="btn btn-mini vadd" title="Add a use case or demonstrator" '
        +'onclick="CT.addVertical()">+</button></div>';
  }
  function vpanelHTML(){
    if(!openVertical)return '';
    var t=data();if(!t)return '';
    var i=(t.verticals||[]).findIndex(function(x){return x.id===openVertical.id;});
    var v=openVertical,c=vcolor(v,i<0?0:i);
    var wpList=t.wps.map(function(wp,wi){
      var col=wpColor(wp,wi);
      var rows='<label class="vp-wp" data-vrow-id="'+esc(wp.id)+'"><input type="checkbox"'
        +(vInvolves(v,wp.id)?' checked':'')+' '
        +'onchange="CT.toggleVRow(\''+esc(wp.id)+'\',this.checked)" />'
        +'<span class="vp-wp-dot" style="background:'+col+'"></span>'
        +'<span class="vp-wp-num">'+esc(wp.num||'')+'</span>'
        +'<span class="vp-wp-name">'+esc(wp.name||'Untitled')+'</span></label>';
      (wp.tasks||[]).forEach(function(tk){
        var taskCol=taskColor(tk,wp,wi);
        rows+='<label class="vp-wp vp-task" data-vrow-id="'+esc(tk.id)+'"><input type="checkbox"'
          +(vInvolves(v,tk.id)?' checked':'')+' '
          +'onchange="CT.toggleVRow(\''+esc(tk.id)+'\',this.checked)" />'
          +'<span class="vp-wp-dot" style="background:'
            +(tk.color?taskCol:hexA(taskCol,0.5))+'"></span>'
          +'<span class="vp-wp-num">'+esc((wp.num||'')+'.'+(tk.num||''))+'</span>'
          +'<span class="vp-wp-name">'+esc(tk.name||'Untitled')+'</span></label>';
      });
      return rows;
    }).join('');
    return '<div class="vpanel" style="--vcolor:'+c+';--vcolor-glow:'+hexA(c,0.5)+'">'
      +'<div class="vp-head"><div class="vp-head-left">'
        +'<span class="vp-title">'+esc(v.name||'Untitled')+'</span>'
        +(v.leader?'<span class="vp-head-leader">led by '+esc(v.leader)+'</span>':'')
      +'</div><button type="button" class="icon-btn" title="Close" onclick="CT.closeVertical()">\u2715</button></div>'
      +'<div class="vp-body">'
        +'<div class="vp-row">'
          +'<div class="field vp-short"><label>Short label</label>'
            +'<input type="text" value="'+esc(v.short||'')+'" maxlength="10" '
            +'onchange="CT.setVField(\'short\',this.value)" /></div>'
          +'<div class="field vp-grow"><label>Name</label>'
            +'<input type="text" value="'+esc(v.name||'')+'" '
            +'onchange="CT.setVField(\'name\',this.value)" /></div>'
          +'<div class="field vp-leader"><label>Leader</label>'
            +'<input type="text" value="'+esc(v.leader||'')+'" '
            +'onchange="CT.setVField(\'leader\',this.value)" /></div>'
        +'</div>'
        +'<div class="field"><label>Colour</label><div class="clr-picker">'
          +'<button type="button" class="clr-swatch clr-auto'+(!v.color?' sel':'')+'" '
            +'style="background:'+vcolor(v,i<0?0:i)+'" onclick="CT.setVField(\'color\',\'\')" '
            +'title="Automatic"></button>'
          +WP_COLORS.map(function(x){
            return '<button type="button" class="clr-swatch'+(v.color===x?' sel':'')+'" '
              +'style="background:'+x+'" onclick="CT.setVField(\'color\',\''+x+'\')"></button>';
          }).join('')+'</div></div>'
        +'<div class="field full"><label>Description</label>'
          +'<div class="rte-edit" contenteditable="true" data-placeholder="What is this use case?" '
          +'oninput="CT.setVRich(\'desc\',this)" onpaste="CT.vPaste(this,event)" '
          +'onblur="CT.vBlur(\'desc\',this)" onclick="PL.openRichLink(event)">'
          +toEditableHTML(v.desc||'')+'</div></div>'
        +'<div class="field full"><label>Our contribution <span class="field-hint">(TU/e)</span></label>'
          +'<div class="rte-edit" contenteditable="true" data-placeholder="What we bring to it" '
          +'oninput="CT.setVRich(\'ours\',this)" onpaste="CT.vPaste(this,event)" '
          +'onblur="CT.vBlur(\'ours\',this)" onclick="PL.openRichLink(event)">'
          +toEditableHTML(v.ours||'')+'</div></div>'
        +'<div class="field"><label>Work packages &amp; tasks involved</label>'
          +'<div class="vp-wps">'+(wpList||'<div class="vp-empty">No work packages yet.</div>')+'</div></div>'
      +'</div>'
      +'<div class="vp-foot">'
        +'<button type="button" class="btn btn-mini del-text" onclick="CT.delVertical()">Delete</button>'
        +'<button type="button" class="btn btn-mini btn-primary" onclick="CT.closeVertical()">Done</button>'
      +'</div></div>';
  }

  /* ── Render ── */
  function render(){
    var t=data();if(!t)return;
    var view=byId('ct-view');if(!view)return;

    var head=byId('ct-proj-name');
    if(head){
      var p=proj();
      var currentName=p?p.name:'';
      head.textContent=currentName;
      head.style.color=safeColor(projColor(p));
      head.title='Flip back to '+currentName+' project card';
      head.setAttribute('aria-label',head.title);
    }
    byId('ct-pmgrouphead').innerHTML=groupHeadHTML();
    byId('ct-scale-lane').innerHTML=scaleLaneHTML();
    var mIn=byId('ct-months');if(mIn)mIn.value=t.months||36;
    byId('ct-tot-pm').textContent=totalPm();

    var rowsEl=byId('ct-rows');
    rowsEl.innerHTML=rowsHTML();
    rowsEl.classList.toggle('v-open',!!openVertical);
    rowsEl.style.setProperty('--m',t.months||36);

    byId('ct-vfoot').innerHTML=vfootHTML();
    byId('ct-vpanel-host').innerHTML=vpanelHTML()
      +(openVertical?'<div class="vspine on" style="--vcolor:'
        +vcolor(openVertical,0)+'"></div>':'');

    view.classList.toggle('gantt-on',gantt);
    view.classList.toggle('board-on',board);
    var gl=byId('ct-gantt-lbl');if(gl)gl.textContent='Timeline';
    var bl=byId('ct-board-lbl');if(bl)bl.textContent='Board';
    /* Board mode replaces the Gantt in the same space, so the two are
       mutually exclusive rather than layered. */
    var gb=byId('ct-gantt-btn'),bb=byId('ct-board-btn');
    if(gb)gb.disabled=board;
    if(bb)bb.disabled=gantt;

    view.style.setProperty('--label-w',labelW+'px');
    view.style.setProperty('--pmcol-w',((t.pmGroups||[]).length*PMCOL_W)+'px');

    refreshBoardImg();
    bindLabelDrag();
    bindNoteDrag();
    Notes.focusAfterRender(rowsEl);
  }

  /* ── The label-width handle ──
     Changes --label-w only. The PM columns keep their fixed width and
     simply slide with wherever the title box now ends. */
  function bindLabelDrag(){
    var h=byId('ct-pmcol-drag');
    if(!h||h._bound)return;
    h._bound=true;
    h.addEventListener('pointerdown',function(e){
      if(otherButton(e))return;
      e.preventDefault();
      var startX=e.clientX,startW=labelW;
      h.classList.add('dragging');
      function move(ev){
        labelW=Math.max(160,Math.min(620,startW+(ev.clientX-startX)));
        var v=byId('ct-view');
        if(v)v.style.setProperty('--label-w',labelW+'px');
      }
      function up(){
        h.classList.remove('dragging');
        document.removeEventListener('pointermove',move);
        document.removeEventListener('pointerup',up);
      }
      document.addEventListener('pointermove',move);
      document.addEventListener('pointerup',up);
    });
  }
  function bindNoteDrag(root){
    var rows=root&&root.matches&&root.matches('.row[data-row-id]')
      ?[root]:qa('.row[data-row-id]',root||byId('ct-rows'));
    rows.forEach(function(rowEl){
      var rowId=rowEl.getAttribute('data-row-id');
      Notes.bindDrag(rowEl,function(srcId,tgtId){
        RowTable.reorderNote(NS,NCTX,rowId,srcId,tgtId);
      });
    });
  }

  /* Redraw only the block that just left edit mode. A click in another
     field keeps its focus and caret because the destination DOM stays put. */
  function renderBlock(wpId){
    var t=data(),rowsEl=byId('ct-rows');
    if(!t||!rowsEl)return;
    var wi=t.wps.findIndex(function(wp){return wp.id===wpId;});
    if(wi<0)return;
    var wp=t.wps[wi];
    var ids=[wp.id].concat((wp.tasks||[]).map(function(task){return task.id;}));
    var oldRows=ids.map(function(id){
      return q('.row[data-row-id="'+cssEsc(id)+'"]',rowsEl);
    }).filter(Boolean);
    if(!oldRows.length)return;

    var box=document.createElement('template');
    box.innerHTML=wpBlockHTML(wp,wi);
    var fresh=Array.prototype.slice.call(box.content.children);
    rowsEl.insertBefore(box.content,oldRows[0]);
    oldRows.forEach(function(row){row.remove();});
    fresh.forEach(bindNoteDrag);
    refreshVerticalRows(wp,wi);
  }
  function refreshVerticalRows(wp,wi){
    if(!openVertical)return;
    [wp].concat(wp.tasks||[]).forEach(function(row,i){
      var el=q('.vp-wp[data-vrow-id="'+cssEsc(row.id)+'"]',byId('ct-vpanel-host'));
      if(!el)return;
      var isWp=i===0,color=isWp?wpColor(wp,wi):taskColor(row,wp,wi);
      var dot=q('.vp-wp-dot',el),num=q('.vp-wp-num',el),name=q('.vp-wp-name',el);
      if(dot)dot.style.background=isWp||row.color?color:hexA(color,0.5);
      if(num)num.textContent=isWp?(row.num||''):((wp.num||'')+'.'+(row.num||''));
      if(name)name.textContent=row.name||'Untitled';
    });
  }

  /* ── Row lookup & mutation ── */
  function findRow(rowId){
    var t=data();if(!t)return null;
    for(var i=0;i<t.wps.length;i++){
      var wp=t.wps[i];
      if(wp.id===rowId)return {r:wp,isWp:true,wp:null,wi:i};
      for(var j=0;j<(wp.tasks||[]).length;j++)
        if(wp.tasks[j].id===rowId)return {r:wp.tasks[j],isWp:false,wp:wp,wi:i,ti:j};
    }
    return null;
  }
  function setField(rowId,field,val){
    var f=findRow(rowId);if(!f)return;
    if(field==='startMonth'||field==='endMonth'){
      var n=parseFloat(val);
      f.r[field]=isNaN(n)?'':n;
    } else f.r[field]=val;
    save();
    if(!editWP)render();
  }
  function setPm(rowId,gid,val){
    var f=findRow(rowId);if(!f)return;
    if(!f.r.pmByGroup)f.r.pmByGroup={};
    var s=String(val==null?'':val).trim().replace(',','.');
    if(!s)delete f.r.pmByGroup[gid];
    else{
      var n=parseFloat(s);
      if(isNaN(n)){delete f.r.pmByGroup[gid];}
      else f.r.pmByGroup[gid]=n;
    }
    save();
    if(!editWP)render();
    var total=byId('ct-tot-pm');if(total)total.textContent=totalPm();
    CallCard.render();     // the project card's PM totals move with this
  }
  function colorMenu(btn,rowId){
    var f=findRow(rowId);if(!f)return;
    var inherited=!f.isWp&&!f.r.color;
    Menu.open(btn,
      '<div class="colmenu-row"><label>'+(f.isWp?'Work package colour':'Task colour')+'</label><div class="tc-picker">'
      +(!f.isWp
        ?'<button type="button" class="tc-auto'+(inherited?' sel':'')+'" '
          +'onclick="CT.setColor(\''+esc(rowId)+'\',\'\')" '
          +'title="Use the work package colour">WP default</button>'
        :'')
      +WP_COLORS.map(function(c){
        return '<button type="button" class="tc-swatch'+(f.r.color===c?' sel':'')+'" style="background:'+c+'" '
          +'onclick="CT.setColor(\''+esc(rowId)+'\',\''+c+'\')" title="'+c+'"></button>';
      }).join('')+'</div></div>',
      {id:'ct-rowcolormenu'});
  }
  function setColor(rowId,c){
    var f=findRow(rowId);if(!f)return;
    f.r.color=c;save();Menu.close();render();
  }
  function addWP(){
    var t=data();if(!t)return;
    var wp={id:uid(),num:String(t.wps.length+1),name:'',color:'',
      startMonth:'',endMonth:'',leader:'',pmByGroup:{},notes:[],tasks:[]};
    t.wps.push(wp);
    /* Open the new one straight away — a blank untitled row is not useful
       to look at, only to fill in. */
    editWP=wp.id;
    save();render();
    var el=q('#ct-rows .row[data-row-id="'+cssEsc(wp.id)+'"] .ed-name');
    if(el)el.focus();
  }
  function addTask(wpId){
    var f=findRow(wpId);if(!f||!f.isWp)return;
    var tk={id:uid(),num:String((f.r.tasks||[]).length+1),name:'',
      color:'',startMonth:'',endMonth:'',leader:'',pmByGroup:{},notes:[]};
    f.r.tasks.push(tk);
    editWP=wpId;
    save();render();
    var el=q('#ct-rows .row[data-row-id="'+cssEsc(tk.id)+'"] .ed-name');
    if(el)el.focus();
  }
  function delRow(rowId,confirmed){
    var t=data(),f=findRow(rowId);
    if(!t||!f)return;
    if(f.isWp){
      var n=(f.r.tasks||[]).length;
      if(!confirmed){
        Dialog.ask({title:'Delete work package',
          body:'\u201c'+(f.r.name||'untitled')+'\u201d'
            +(n?' and its '+n+' task'+(n===1?'':'s'):'')+' will be deleted.',
          confirm:'Delete'},function(){delRow(rowId,true);});
        return;
      }
      t.wps.splice(f.wi,1);
      if(editWP===rowId)editWP=null;
    } else {
      f.wp.tasks.splice(f.ti,1);
    }
    /* Anything a vertical pointed at may be gone now. */
    (t.verticals||[]).forEach(function(v){
      if(Array.isArray(v.rows))v.rows=v.rows.filter(function(x){return !!findRow(x);});
    });
    save();render();
    CallCard.render();
  }
  /* Pressing a work package's title opens the whole block: the WP and
     every task under it, all at once. */
  function openEdit(wpId){
    editWP=(editWP===wpId)?null:wpId;
    render();
  }
  function blurActiveWithin(selector){
    var active=document.activeElement;
    if(active&&active.closest&&active.closest(selector)&&active.blur)
      active.blur();
  }
  function commitActiveEdit(){blurActiveWithin('#ct-rows .row.editing');}
  function closeEdit(){
    if(!editWP)return;
    /* A keyboard/programmatic close can redraw before the focused control's
       normal change event. Commit anything mounted in the tracker first. */
    blurActiveWithin('#ct-view');
    editWP=null;
    render();
  }
  function closeEditAway(expectedId){
    if(editWP!==expectedId)return;
    commitActiveEdit();
    editWP=null;
    renderBlock(expectedId);
  }

  /* ── Notes ──
     The third home of the shared row-table notes. The tracker keeps its own
     rows — a work-package tree with its own editing and its own Gantt — so
     it registers only the note half of the adapter and never asks the
     component to draw a row. Its two departures from the other two homes
     are declared, not coded: a new note opens into its rename box, and an
     opened panel is scrolled to inside a table that can be taller than the
     window. */
  var NS='ct',NCTX='';
  function allRows(){
    var t=data(),out=[];
    if(t)(t.wps||[]).forEach(function(w){
      out.push(w);
      (w.tasks||[]).forEach(function(x){out.push(x);});
    });
    return out;
  }
  /* A projection rather than an owner: these rows are work packages and
     tasks gathered from two levels of the tracker, so the component is
     given the list to read and asked for none of the structural verbs —
     rows are added and removed through the tracker's own editor. */
  RowTable.register(NS,{
    rows:allRows,
    rowSel:'#ct-rows .row',
    renameOnAdd:true,
    /* Reordering redraws every row, which would tear down an open edit
       block mid-gesture — so close it first, keeping any typed value. */
    reorderNote:function(ctx,rowId,srcId,tgtId){
      var f=findRow(rowId);
      if(!f||!moveById(f.r.notes,srcId,tgtId))return false;
      if(editWP){blurActiveWithin('#ct-view');editWP=null;}
      return true;
    },
    afterOpen:function(ctx,rowId){
      var panel=q('#ct-rows .row[data-row-id="'+cssEsc(rowId)+'"] .note-panel');
      reveal(panel);
    },
    rerender:function(){render();}
  });
  /* ── Verticals ── */
  function addVertical(){
    var t=data();if(!t)return;
    var v={id:uid(),short:'',name:'',leader:'',color:'',desc:'',ours:'',rows:[]};
    t.verticals.push(v);
    openVertical=v;
    save();render();
  }
  function toggleVertical(id){
    var t=data();if(!t)return;
    var v=(t.verticals||[]).find(function(x){return x.id===id;});
    openVertical=(openVertical&&openVertical.id===id)?null:v;
    render();
  }
  function closeVertical(){openVertical=null;render();}
  function delVertical(confirmed){
    var t=data();if(!t||!openVertical)return;
    if(!confirmed){
      var nm=openVertical.name||'this entry';
      Dialog.ask({title:'Delete entry',
        body:'\u201c'+nm+'\u201d will be deleted.',
        confirm:'Delete'},function(){delVertical(true);});
      return;
    }
    t.verticals=(t.verticals||[]).filter(function(v){return v.id!==openVertical.id;});
    openVertical=null;save();render();
  }
  function setVField(field,val){
    if(!openVertical)return;
    openVertical[field]=val;
    save();render();
  }
  function setVRich(field,el){
    if(!openVertical)return;
    openVertical[field]=sanitizeRichHTML(el.innerHTML);
    saveSoon();
  }
  function vBlur(field,el){
    linkifyRichElement(el);
    setVRich(field,el);
  }
  function vPaste(el,evt){
    pasteRich(evt,function(){
      var field=el.previousElementSibling&&/contribution/i.test(el.previousElementSibling.textContent||'')
        ?'ours':'desc';
      setVRich(field,el);
    });
  }
  function toggleVRow(rowId,on){
    if(!openVertical)return;
    listOn(openVertical,'rows');
    var i=openVertical.rows.indexOf(rowId);
    if(on&&i<0)openVertical.rows.push(rowId);
    else if(!on&&i>-1)openVertical.rows.splice(i,1);
    save();render();
  }
  function setVLabel(val){
    var t=data();if(!t)return;
    t.verticalLabel=(val||'').trim()||'Use cases';
    save();
  }

  /* ── Modes ── */
  function setMonths(v){
    var t=data();if(!t)return;
    var n=parseInt(v,10);
    t.months=(isNaN(n)||n<1)?36:Math.min(120,n);
    save();render();
  }
  function toggleGantt(){
    if(board)return;
    gantt=!gantt;
    if(gantt)editWP=null;      // the chart is a different reading of the rows
    render();
  }
  function toggleBoard(){
    if(gantt)return;
    board=!board;
    if(board)editWP=null;
    render();
  }

  /* ── The board image ──
     A photo of a physical planning board can be several megabytes, which
     does not belong in localStorage (5MB total) and must never be pushed
     to the cloud blob. It lives in IndexedDB, keyed by project, and only
     a flag is stored in the journal. */
  var DB_NAME='pj-images',DB_STORE='img';
  function withStore(mode,fn){
    if(!window.indexedDB){fn(null);return;}
    var req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=function(){
      var db=req.result;
      if(!db.objectStoreNames.contains(DB_STORE))db.createObjectStore(DB_STORE);
    };
    req.onsuccess=function(){
      var db=req.result;
      try{fn(db.transaction(DB_STORE,mode).objectStore(DB_STORE),db);}
      catch(e){fn(null);}
    };
    req.onerror=function(){fn(null);};
  }
  function uploadBoardImg(file){
    if(!file||!pid)return;
    if(file.size>12*1024*1024){toast('That image is over 12 MB \u2014 please use a smaller one.',{duration:6000});return;}
    var reader=new FileReader();
    reader.onload=function(e){
      withStore('readwrite',function(store){
        if(!store){toast('Could not store the image on this device.',{duration:6000});return;}
        var put=store.put(e.target.result,pid);
        put.onsuccess=function(){
          var t=data();if(!t)return;
          t.hasBoardImg=true;save();
          board=true;gantt=false;
          render();
        };
        put.onerror=function(){toast('Could not store the image on this device.',{duration:6000});};
      });
    };
    reader.readAsDataURL(file);
  }
  function removeBoardImg(confirmed){
    if(!pid)return;
    if(!confirmed){
      Dialog.ask({title:'Remove board image',
        body:'The uploaded board image for this project will be removed.',
        confirm:'Remove'},function(){removeBoardImg(true);});
      return;
    }
    withStore('readwrite',function(store){
      if(store)store.delete(pid);
      var t=data();
      if(t){delete t.hasBoardImg;save();}
      imgUrl=null;render();
    });
  }
  /* The overlay sits absolutely over the timeline columns, so it cannot
     make anything taller: a board with more height than the stack of work
     packages simply ran off the bottom and was clipped there. Give the
     rows area a floor instead, and the page grows to the board rather
     than the board being cut to the page. */
  function fitBoard(on){
    var rows=q('#ct-view .rows-wrap'),ov=byId('ct-board-overlay'),img=byId('ct-boardimg');
    if(!rows)return;
    rows.style.minHeight='';
    if(!on||!board||!ov||!img||!img.naturalWidth)return;
    var w=ov.getBoundingClientRect().width;
    if(!w)return;
    /* The height the board wants at the table's full width. The rows area
       is given that as a floor, so the image fills the table exactly
       rather than being cut off at the last work package. */
    var need=Math.round(w*img.naturalHeight/img.naturalWidth);
    if(need>rows.getBoundingClientRect().height)rows.style.minHeight=need+'px';
  }
  function refreshBoardImg(){
    var t=data();
    var wrap=byId('ct-boardimg-wrap'),empty=byId('ct-boardimg-empty'),
        img=byId('ct-boardimg');
    if(!wrap||!empty||!img)return;
    var view=byId('ct-view');
    function show(url){
      imgUrl=url;
      /* Its proportions are not known until it has decoded, and the floor
         below depends on them. */
      img.onload=function(){fitBoard(true);};
      img.src=url;
      wrap.style.display='';empty.style.display='none';
      if(view)view.classList.add('has-board');
      if(img.complete&&img.naturalWidth)fitBoard(true);
    }
    function hide(){
      wrap.style.display='none';empty.style.display='';
      if(view)view.classList.remove('has-board');
      fitBoard(false);
    }
    if(!t||!t.hasBoardImg){hide();return;}
    if(imgUrl){show(imgUrl);return;}
    withStore('readonly',function(store){
      if(!store){hide();return;}
      var get=store.get(pid);
      get.onsuccess=function(){
        if(get.result)show(get.result); else hide();
      };
      get.onerror=hide;
    });
  }

  window.addEventListener('resize',function(){
    if(board&&imgUrl)fitBoard(true);
  });

  /* ── Opening ── */
  function open(id){
    pid=id;
    imgUrl=null;
    editWP=null;openVertical=null;
    RowTable.clearNotes(NS,NCTX);
    gantt=false;board=false;
    var view=byId('ct-view');
    if(view)view.classList.add('active');
    render();
  }

  /* When a menu that changed an M&CS flag closes, the project card needs
     redrawing — but not while the menu is still under the pointer. */
  document.addEventListener('mousedown',function(){
    if(!_mcsDirty)return;
    setTimeout(function(){
      if(!_mcsDirty)return;
      _mcsDirty=false;
      render();CallCard.render();
    },0);
  },true);

  function isOutsideEditBlock(target){
    if(!editWP||!target||!target.closest)return false;
    if(target.closest('#ct-rowcolormenu'))return false;
    var rowEl=target.closest('#ct-rows .row[data-row-id]');
    if(rowEl){
      var f=findRow(rowEl.getAttribute('data-row-id'));
      var blockId=f&&(f.isWp?f.r.id:f.wp.id);
      if(blockId===editWP)return false;
    }
    return true;
  }

  /* Commit before an outside control can redraw the tracker; finish the
     visual transition after that control's own click has run. */
  document.addEventListener('pointerdown',function(evt){
    if(isOutsideEditBlock(evt.target))commitActiveEdit();
  },true);
  document.addEventListener('click',function(evt){
    if(!isOutsideEditBlock(evt.target))return;
    var closingId=editWP;
    setTimeout(function(){closeEditAway(closingId);},0);
  },true);

  return {open:open,
    wipeUngroupedPm:wipeUngroupedPm,stripDeadGroupFields:stripDeadGroupFields,
    setMonths:setMonths,toggleGantt:toggleGantt,toggleBoard:toggleBoard,
    addWP:addWP,addTask:addTask,delRow:delRow,openEdit:openEdit,closeEdit:closeEdit,
    setField:setField,setPm:setPm,colorMenu:colorMenu,setColor:setColor,
    addPmGroup:addGroup,groupMenu:groupMenu,groupField:groupField,delGroup:delGroup,
    addVertical:addVertical,toggleVertical:toggleVertical,closeVertical:closeVertical,
    delVertical:delVertical,setVField:setVField,setVRich:setVRich,vPaste:vPaste,vBlur:vBlur,
    toggleVRow:toggleVRow,setVLabel:setVLabel,
    uploadBoardImg:uploadBoardImg,removeBoardImg:removeBoardImg};
})();

/* ══ THE FORMS ══════════════════════════════════════════════════════ */

/* Every box this room opens over itself is a `.pf-host`, so whether the
   shell should stand aside is a question the page can answer — rather
   than one each pane has to remember to answer twice, once the right way
   round and once the wrong one. See Hub.veil for why the shell has to be
   asked at all.

   The question box and the search palette are not `.pf-host` — they are
   older than the family — so they are named beside it. Left out, the ring
   stayed live over both: a press on it walked off to another room with a
   question still waiting here.

   The veil is the page's, not the room's, so it is only this room's to
   raise while this room is the one showing, and it is asked again at
   every change of room. Alt and a digit walked away from an open pane and
   left the ring faded and dead over whichever room came next. */
function refreshVeil(){
  try{Hub.veil(Hub.active()==='ledger'
    &&!!q('.pf-host:not([hidden]),#pj-dialog:not([hidden]),#pj-palette:not([hidden])'));}
  catch(e){}
}
try{Hub.onRoom(refreshVeil);}catch(e){}

/* Pending updates typed into the quick-add form before the todo exists. */
var pendingSubstamps={qt:[]};
function addPendingSubstamp(ctx){
  var inp=byId(ctx+'-substamp-input');
  if(!inp||!inp.value.trim())return;
  pendingSubstamps[ctx].push({stamp:ts(),text:inp.value.trim()});
  inp.value='';
  drawPendingSubstamps(ctx);
}
function removePendingSubstamp(ctx,i){
  pendingSubstamps[ctx].splice(i,1);
  drawPendingSubstamps(ctx);
}
function drawPendingSubstamps(ctx){
  var el=byId(ctx+'-substamps-list');
  if(!el)return;
  el.innerHTML=pendingSubstamps[ctx].map(function(s,i){
    return substampHTML(s,'PL.removePendingSubstamp(\''+ctx+'\','+i+')');
  }).join('');
}

/* ── The new-todo pane ──
   A todo is a short line of text filed against a project, and the box it
   used to be written in said otherwise: a textarea deep enough for a
   paragraph, sitting UNDER three rows of settings, inside a panel that
   shoved the whole board down for as long as it was open. So the name
   leads now, on one line, with the five settings in two rows beneath it,
   the update box behind a link, and the whole thing floating over the
   page in the shape the search palette and the dialog already wear.

   Where the todo lands follows where you were standing when you asked
   for it. A project card or its tracker open means that project; a call
   anchored with no card open means that call, with the project still to
   pick — and the picker SAYS it is waiting rather than guessing, because
   a todo filed under the wrong project of the right call is the kind of
   mistake nobody ever notices. */
var QuickTodo=(function(){
  var shown=false,prevFocus=null;
  /* Standalone projects have a call each, flagged solo and never named,
     so they cannot be listed by call name and share one entry instead. */
  var NO_CALL='__nocall__';

  function isOpen(){return shown;}

  function callKeyOf(p){
    if(!p||p.id===INBOX_ID)return INBOX_ID;
    var c=calls[p.callId];
    return (c&&!c.solo&&c.name)?p.callId:NO_CALL;
  }
  function projectsUnder(key){
    if(key===INBOX_ID)return [ensureInbox()];
    return sortLikeBoard(activeProjects().filter(function(p){
      return callKeyOf(p)===key;}));
  }
  /* Which project card is actually folded out, read off the page rather
     than asked of the Dossier: `openCard` outlives leaving the call it
     belongs to, and a stale one would file the todo into the call you
     just walked away from. */
  function openProject(){
    var pid=Sheet.pid();
    if(pid)return pid;
    var el=q('.pi-fold.pi-open');
    return (el&&el.getAttribute('data-pid'))||'';
  }
  /* Where a new todo would land if you asked for one right here. */
  function here(){
    var pid=openProject(),p=pid?projects[pid]:null;
    if(p&&p.id!==INBOX_ID)return {call:callKeyOf(p),proj:p.id};
    var ck=Nav.anchor()||Sheet.call()||'';
    var c=ck?calls[ck]:null;
    if(c&&!c.solo&&c.name)return {call:ck,proj:''};
    return {call:INBOX_ID,proj:INBOX_ID};
  }
  /* Asked for from one project's own card. `here()` cannot answer this:
     it reads the card that is folded OUT, and the card carrying the
     button need not be — a shut card would send the todo to the call with
     the project still to pick, which is exactly the mistake the picker
     refuses to guess at. So the project is named outright. */
  function openFor(pid){
    var p=projects[pid];if(!p)return;
    open({call:callKeyOf(p),proj:p.id});
  }

  function callOptionsHTML(sel){
    var out=['<option value="'+INBOX_ID+'"'+(sel===INBOX_ID?' selected':'')
      +'>General \u2014 no call</option>'];
    callGroups().list.forEach(function(g){
      if(!g.hasCall)return;
      out.push('<option value="'+esc(g.key)+'"'+(g.key===sel?' selected':'')
        +'>'+esc(callName(g.call))+'</option>');
    });
    if(projectsUnder(NO_CALL).length)
      out.push('<option value="'+NO_CALL+'"'+(sel===NO_CALL?' selected':'')
        +'>Projects on their own</option>');
    return out.join('');
  }
  function fillProjects(key,want){
    var sel=byId('qt-project');if(!sel)return;
    if(key===INBOX_ID){
      sel.innerHTML='<option value="'+INBOX_ID+'">General (no project)</option>';
      sel.value=INBOX_ID;
    } else {
      var list=projectsUnder(key);
      sel.innerHTML='<option value="">\u2014 which project? \u2014</option>'
        +list.map(function(p){
          return '<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>';}).join('');
      sel.value=(want&&list.some(function(p){return p.id===want;}))?want:'';
    }
    settle();
  }
  /* The two pickers say where it lands in parts; this says it whole, and
     lends the pane the call's own colour while it is open. */
  function settle(){
    var sel=byId('qt-project'),lbl=byId('qt-where'),box=byId('qt-box'),cs=byId('qt-call');
    if(!sel||!lbl||!box||!cs)return;
    sel.classList.toggle('needs',!sel.value);
    var key=cs.value,col='',where;
    if(key===INBOX_ID)where='General \u2014 not tied to a project';
    else{
      var c=calls[key],p=projects[sel.value];
      var nm=(c&&callName(c))||'On its own';
      where=p?nm+' \u00b7 '+p.name:nm+' \u00b7 which project?';
      col=safeColor(p?projColor(p):callColorOf(c),'');
    }
    lbl.textContent=where;
    if(col)box.style.setProperty('--pf-col',col);
    else box.style.removeProperty('--pf-col');
  }

  /* A date field is a written-out date with its own invisible input lying
     over it, the same trick the todo card uses: tapping the words opens
     this app's calendar rather than a native wheel. */
  function dateLabel(iso){
    if(!isIsoDate(iso))return 'Not set';
    var d=new Date(iso+'T00:00:00'),n=daysUntil(iso);
    var txt=DAYS[d.getDay()].slice(0,3)+' '+d.getDate()+' '+MON3[d.getMonth()]
      +(d.getFullYear()!==new Date().getFullYear()?' '+d.getFullYear():'');
    if(n===0)return txt+' \u00b7 today';
    if(n===1)return txt+' \u00b7 tomorrow';
    if(n>0)return txt+' \u00b7 in '+n+'d';
    return txt+' \u00b7 '+Math.abs(n)+'d ago';
  }
  function paintDates(){
    ['qt-due','qt-deadline'].forEach(function(id){
      var inp=byId(id),lbl=byId(id+'-lbl'),wrap=byId(id+'-wrap');
      if(!inp||!lbl||!wrap)return;
      lbl.textContent=dateLabel(inp.value);
      wrap.classList.toggle('set',isIsoDate(inp.value));
    });
  }
  function clearDate(id){
    var inp=byId(id);
    if(inp)inp.value='';
    paintDates();
  }

  function open(at){
    var host=byId('qt');if(!host)return;
    at=at||here();
    prevFocus=document.activeElement;
    shown=true;
    host.removeAttribute('hidden');
    pendingSubstamps.qt=[];
    drawPendingSubstamps('qt');
    var more=byId('qt-more'),mb=byId('qt-more-btn');
    if(more)more.hidden=true;
    if(mb)mb.textContent='+ Add an update';
    byId('qt-text').value='';
    byId('qt-due').value='';
    byId('qt-deadline').value='';
    byId('qt-effort').innerHTML=effortOptionsHTML(0);
    /* Offered where a todo is born, not only on the card it becomes. A
       category set later is a second visit to work already filed, and the
       summary line under a day is empty until somebody makes those
       visits. */
    byId('qt-category').innerHTML=catOptionsHTML('');
    var cs=byId('qt-call');
    cs.innerHTML=callOptionsHTML(at.call);
    /* A call with nothing active left in it draws no lane and is not
       offered here either, so fall back rather than show a blank pick. */
    if(cs.value!==at.call)cs.value=INBOX_ID;
    fillProjects(cs.value,at.proj);
    paintDates();
    refreshVeil();
    byId('qt-text').focus();
  }
  function close(){
    var host=byId('qt');
    if(!host||!shown)return;
    shown=false;
    host.setAttribute('hidden','');
    refreshVeil();
    DatePicker.close();
    var back=prevFocus;prevFocus=null;
    if(back&&back.focus){try{back.focus();}catch(e){}}
  }
  function toggle(){if(shown)close(); else open();}

  function add(){
    var name=(byId('qt-text').value||'').trim();
    if(!name){toast('A todo needs a name.');byId('qt-text').focus();return;}
    var sel=byId('qt-project'),p=sel.value?projects[sel.value]:null;
    if(!p){settle();sel.focus();toast('Which project is this for?');return;}
    listOn(p,'todos');
    p.todos.push(newTodo({text:name,
      dueDate:byId('qt-due').value||'',deadline:byId('qt-deadline').value||'',
      effort:+byId('qt-effort').value||0,
      category:byId('qt-category').value||'',
      subStamps:pendingSubstamps.qt.slice()}));
    pendingSubstamps.qt=[];
    save();
    close();
    /* The card it was filed from is still folded out behind the pane, and
       a re-render rebuilds the call's whole workspace — so it is opened
       again rather than left shut under the new todo. */
    var keep=openProject();
    Board.render();
    if(keep&&keep!==Sheet.pid())Dossier.open(keep);
    toast('Todo added to '+(p.id===INBOX_ID?'General':p.name));
  }

  function nameKey(ev){
    if(ev.key!=='Enter')return;
    ev.preventDefault();
    add();
  }
  function updateKey(ev){
    if(ev.key!=='Enter'||ev.shiftKey)return;
    ev.preventDefault();
    addPendingSubstamp('qt');
  }
  /* An update written before the todo exists is the rare case, so it
     waits behind a line of text rather than holding a box open. */
  function more(){
    var box=byId('qt-more'),btn=byId('qt-more-btn');
    if(!box)return;
    var opening=box.hidden;
    box.hidden=!opening;
    if(btn)btn.textContent=opening?'\u2212 Hide the update box':'+ Add an update';
    if(opening){var i=byId('qt-substamp-input');if(i)i.focus();}
  }
  function onCall(){fillProjects(byId('qt-call').value,'');}

  return {open:open,openFor:openFor,close:close,toggle:toggle,isOpen:isOpen,
    add:add,onCall:onCall,onProject:settle,nameKey:nameKey,updateKey:updateKey,
    more:more,paintDates:paintDates,clearDate:clearDate};
})();

/* ── The project panes ──
   Two boxes wearing the shell every other pane in this room wears: one
   for starting a project, one for editing the one already on a card.
   Both used to be something else. The new-project form was an inline
   block in the page: a single column of every field this app knows,
   which shoved the whole board down for as long as it was open and put
   Create three screens below Name. The edit form was mounted inside the
   dossier's fold-out, which made changing a project's details something
   you did from inside its notes.

   They ask about the same object, so the half they share — the name,
   the description, the links, the positions and what kind of grant it
   is — is written by ONE builder and cannot drift. It already had: the
   two forms had settled into different orders, worded their labels
   differently, and only one of them offered the Call Board topic.

   What they do NOT share is the call. Starting a project is the one
   moment a call can be described; editing one never is, because a call
   outlives its projects and is edited from its own card. So the new pane
   asks about the call and the edit pane simply states it. */
var ProjectForm=(function(){
  /* Every id in both panes is prefixed, and the prefixes are the ones the
     form editors were already keyed by — `p` for the pane's own fields,
     `links` for its link editor, `ed` for its position and partner
     editors — so Editors and Backbone needed no change at all. */
  var NEW={p:'np',links:'npp',ed:'new'};
  var EDIT={p:'em',links:'emp',ed:'edit'};
  var newShown=false,editing=null,prevFocus=null;

  function isNewOpen(){return newShown;}
  function isEditOpen(){return !!editing;}
  function editingId(){return editing;}

  /* ── The name, which leads both panes ──
     The same field the new-todo pane opens with, for the same reason:
     one line, at the size that says this IS the thing. */
  /* The pane's first heading. Sections two and three announce themselves
     and section one did not, which left the name and the people reading as
     loose material above the form rather than as the first of three
     questions it asks. Mark asked for the grand distinctions to be more
     distinct; this is the missing third of them. */
  function nameHTML(c,val,ph){
    return '<div class="fsec fsec-first">The project</div>'
      +'<input type="text" id="'+c.p+'-name" class="pf-name" maxlength="120" '
      +'autocomplete="off" aria-label="Project name" '
      +'placeholder="'+esc(ph)+'" value="'+esc(val||'')+'" />';
  }
  /* ── What the project is, who is on it, what kind it is ──
     The half both panes hold, in one order: what it is, then who, then
     what kind — narrowing from the thing to its people to its paperwork,
     which is also the order these get filled in. */
  /* ── Who is on it ──
     The field the card prints under a project's name. It was called the
     description and offered four lines of textarea for one; what Mark
     actually writes in it is the researchers, which is also why it is
     the one line on the card the Atlas linkifies \u2014 every name in it is
     already a link to that person's dossier. So it says so, it is one
     line, and it stands directly under the name rather than down among
     the paperwork, because on the card it stands directly under the
     title. It is still free text: `desc` is unchanged and anything
     already written there is kept. */
  /* The free-text Researchers line is gone: the list in the first section
     replaced it on 2026-09-03, in the same place under the title. The
     field is kept, hidden, because `desc` is still what the search palette
     reads and what a project written before the change carries — its names
     are offered as rows the first time such a project is opened, and it is
     rewritten from those rows on save, so nothing is lost and nothing is
     said twice. */
  function peopleHTML(c){
    return '<input type="hidden" id="'+c.p+'-desc" />';
  }
  /* ── The three sections ──
     Who is on it, what it costs, what kind of grant it is — in the order a
     project is actually filled in, each behind a heading of its own and on
     its own ground. It used to be one block called Details holding every
     field the app knows, which is a drawer and not a form.

     `.pf-block`, not `.fg`, for anything holding controls rather than a
     field. `.fg input` is the room's one field look — full width, 39px
     tall — and it is more specific than the little rules the row editors
     rely on, so a `.fg` wrapped round one of them stretches every small
     input in it into a text box. Captions are plain captions for the same
     family of reason: a <label> around a <label> is closed by the parser
     at the inner one, which is how a tick once came to sit above its own
     words. */
  function detailHTML(c){
    return ''
      /* ── Who is on it ──
         Researchers, then the material the project keeps elsewhere. A
         named person is a researcher; an unnamed post is a position, and
         those are the section below. Splitting them is what took the same
         person out of two doors. */
      +'<div class="pf-block"><div class="pf-sub">Researchers <span class="lbl-hint">'
        +'\u2014 who is on it; tick PI and they lead a group of their own'
        +'</span></div>'
        +'<div id="'+c.p+'-res-list" class="pos-items-edit"></div>'
        +'<div class="pf-btnrow">'
          +'<button type="button" class="btn btn-sm" '
            +'onclick="PL.addResearcher(\''+c.ed+'\')">+ Researcher</button>'
        +'</div>'
        +'<div class="fg pf-links"><label>Project links</label>'
          +'<div id="'+c.links+'-links-list"></div>'
          +'<button type="button" class="btn btn-sm" style="margin-top:6px" '
            +'onclick="PL.linkAdd(\''+c.links+'\')">+ Add link</button></div>'
      +'</div>'
      /* ── What it costs ──
         One block per group: its head names the group and its PI and
         carries the running total, and everything in that group is under
         it — the people with what they put in, then the posts still to
         hire. A post added from inside a block belongs to it, so there is
         no group to choose and none to get wrong. */
      +'<div class="fsec fsec-pos">Positions and person-months'
        +'<span class="fsec-tot" id="'+c.p+'-pos-list-all"></span></div>'
      +'<div class="pf-block">'
        +'<div id="'+c.p+'-pos-list"></div>'
      +'</div>'
      /* ── The grant ──
         A coordinator and a list of Dutch partners are a question for an
         industrial grant and for nothing else, so they are behind the tick
         rather than two empty fields on every form. */
      +'<div class="fsec">The grant</div>'
      +'<div class="pf-block">'
        +'<label class="check-row" onclick="PL.toggleIndustrial(\''+c.ed+'\')">'
          +'<input type="checkbox" id="'+c.p+'-industrial" /><span>Industrial grant</span></label>'
        +'<div class="industrial-section" id="'+c.p+'-industrial-section">'
          +'<div class="fg"><label>Coordinating organisation</label>'
            +'<input type="text" id="'+c.p+'-coordinator" placeholder="e.g. Philips Research" />'
            +'<div id="'+c.p+'-coord-contacts" class="pcon-coord"></div></div>'
          +'<div class="fg"><label>Dutch partners</label>'
            +'<div id="'+c.p+'-partner-list" class="partner-list"></div>'
            +'<button type="button" class="btn btn-sm btn-primary" style="margin-top:6px" '
              +'onclick="PL.addPartner(\''+c.ed+'\')">+ Add partner</button></div>'
        +'</div></div>';
  }

  /* ── Where it belongs, on the new pane ──
     One picker, and then exactly one of three blocks: the topic field for
     the programme, a statement of the call being joined, or the fields
     that describe a call being started. Never two of them, and never a
     field that will not be read. */
  function whereHTML(){
    return '<div class="fsec">Where it belongs</div>'
      +'<div class="fg"><label>Call</label>'
        +'<select id="np-call-select" onchange="PL.onCallSelectChange()"></select></div>'
      +'<div id="np-topic-slot"></div>'
      +'<div class="pf-ro" id="np-call-known" hidden></div>'
      +'<div id="np-call-new" hidden>'
        +'<div class="pf-pair">'
          +'<div class="fg"><label>Short call name</label>'
            +'<input type="text" id="np-call" placeholder="e.g. ITEA" oninput="PL.npCallName()" /></div>'
          +'<div class="fg"><label>Official call name</label>'
            +'<input type="text" id="np-callfull" placeholder="e.g. ITEA Call 2026 \u2014 AI for Industry" /></div>'
        +'</div>'
        /* A call's links, its backbone and its calendar are only a
           question once there is a call to hang them on. A project
           standing on its own has none, and a short name already in use
           has them already — so this block waits until the name typed
           above is a call being started. */
        +'<div id="np-call-extra" hidden>'
        +'<div class="fg"><label>Call links</label><div id="npc-links-list"></div>'
          +'<button type="button" class="btn btn-sm btn-primary" style="margin-top:6px" '
            +'onclick="PL.linkAdd(\'npc\')">+ Add link</button></div>'
        +'<div class="fg"><label>Backbone <span class="lbl-hint">'
          +'\u2014 a saved shape of call, and its closing date</span></label>'
          +'<div class="np-bb-row">'
            +'<select id="np-backbone" class="np-bb-pick" onchange="PL.backboneChoose()"></select>'
            +'<input type="text" inputmode="none" data-datefield readonly id="np-backbone-date" class="np-bb-date" '
              +'placeholder="Closing date" onclick="PL.openDatePicker(this)" onchange="PL.backboneChoose()" />'
          +'</div><div id="np-backbone-note" class="np-bb-note"></div></div>'
        +'<div class="fg"><label>Key dates</label>'
          +'<div id="np-markers-list"></div>'
          +'<div class="pf-btnrow" style="margin-top:8px">'
            +'<button type="button" class="btn btn-sm btn-primary" '
            +'onclick="PL.markerAdd(\'np\')">+ Add key date</button></div></div>'
        +'</div>'
      +'</div>';
  }
  /* A call being joined is stated, not offered for editing. It used to be
     offered: its links and key dates arrived pre-filled and were written
     back on Create, so adding a project could quietly rewrite the dates
     that other people’s todos were tied to, from a form that never said
     it might. */
  function knownCallHTML(c){
    var ms=(c.markers||[]).filter(function(m){return m.date&&isIsoDate(m.date);})
      .sort(function(a,b){return a.date<b.date?-1:1;});
    var next=ms.filter(function(m){var d=daysUntil(m.date);return d!==null&&d>=0;})[0];
    var l=(c.links||[]).length;
    return '<div class="pf-ro-line"><b>'+esc(callName(c))+'</b>'
      +(c.title?' \u00b7 '+esc(c.title):'')+'</div>'
      +'<div class="pf-ro-note">'
      +(ms.length?ms.length+' key date'+(ms.length===1?'':'s'):'No key dates yet')
      +(next?' \u00b7 next '+esc(next.name||'key date')+' '+fmtDate(next.date):'')
      +(l?' \u00b7 '+l+' link'+(l===1?'':'s'):'')
      +' \u2014 all of it edited from the call\u2019s own card, never from here.</div>';
  }
  /* The call a project already has, on the edit pane. */
  /* Two lines of prose used to stand over these saying what each one
     does and how each undoes. Both are things you read once, and they
     were the last thing between the form and the bottom of a laptop
     screen \u2014 so they are on the buttons, where a hesitating hand finds
     them and a fitting form does not carry them. */
  function fateHTML(p){
    return '<div class="fsec">Archive or delete</div>'
      +'<div class="pf-btnrow">'
      +'<button type="button" class="btn btn-sm" '
        +'title="'+(p.archived?'Put it back on its call'
          :'Take it off the call and keep every word of it \u2014 archived projects '
           +'are behind Show archive in the header')+'" '
        +'onclick="PL.piArchive(\''+esc(p.id)+'\',event)">'
        +(p.archived?'Restore project':'Archive project')+'</button>'
      +'<button type="button" class="btn btn-sm pf-fate-danger" '
        +'title="Undoable from the message it leaves, and from nowhere else" '
        +'onclick="PL.piDelete(\''+esc(p.id)+'\',event)">Delete project</button></div>';
  }

  /* The head says where the pane is working, whole, and takes that
     call\u2019s colour \u2014 the same thing the new-todo pane does. */
  /* Only the colour. The new-todo pane writes where it will land beside
     its title as well, and these two did for a while — but a caption
     tucked against the close button reads as a label ON that button, and
     it was saying a third time what the name field and the "Where it
     belongs" block below it already say. The dot and the hairline keep
     the call's colour, which says the same thing without a word. */
  function paintWhere(pfx,p,c){
    var box=byId(pfx+'-box');
    if(!box)return;
    var col=p?safeColor(projColor(p),''):(c?safeColor(callColorOf(c),''):'');
    if(col)box.style.setProperty('--pf-col',col);
    else box.style.removeProperty('--pf-col');
  }
  /* What Create is about to do, said before it is pressed. The one thing
     this form can do by surprise is join a call you meant to start, when
     the short name you typed is already in use. */
  function footNote(){
    var el=byId('np-foot-note'),extra=byId('np-call-extra');
    if(!el)return;
    var sel=byId('np-call-select'),key=sel?sel.value:'';
    if(extra)extra.hidden=true;
    if(key){
      var c=calls[key];
      el.textContent=c?'Joins '+callName(c)+'.':'';
      return;
    }
    var inp=byId('np-call'),short=inp?(inp.value||'').trim():'';
    if(!short){el.textContent='Stands on its own \u2014 no call.';return;}
    var m=Object.values(calls).filter(function(x){
      return !x.solo&&x.name===short;})[0];
    if(extra)extra.hidden=!!m;
    el.textContent=m
      ?'Joins the existing '+callName(m)+' call \u2014 its links and key dates stay as they are.'
      :'Starts a new call, '+short+'.';
  }

  /* Existing calls come first so a new project joins one rather than
     accidentally starting a near-duplicate. The programme is listed ahead
     of them, out of the alphabet: it is the one call that is always
     there, and the one this list is most often opened for. */
  function fillCallSelect(){
    var sel=byId('np-call-select');if(!sel)return;
    var opts=Object.values(calls).filter(function(c){
        return !c.solo&&c.name&&c.id!==PROGRAMME_ID;})
      .sort(function(a,b){return a.name.localeCompare(b.name);});
    var prog=calls[PROGRAMME_ID];
    sel.innerHTML='<option value="">\u2014 none / new call \u2014</option>'
      +(prog?'<option value="'+esc(PROGRAMME_ID)+'">'+esc(callName(prog))
            +' \u2014 the programme</option>':'')
      +opts.map(function(c){
        return '<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>';}).join('');
  }
  function onCallSelect(){
    var sel=byId('np-call-select');if(!sel)return;
    var key=sel.value,c=key?calls[key]:null,prog=(key===PROGRAMME_ID);
    /* Only a programme project is one topic\u2019s worth of work, so only
       there is there a topic to pick \u2014 and asking for the list is what
       builds the Call Board, which is reason enough not to ask twice. */
    TopicPick.show('np',prog);
    var known=byId('np-call-known'),fresh=byId('np-call-new');
    if(known){
      known.hidden=!(c&&!prog);
      if(c&&!prog)known.innerHTML=knownCallHTML(c);
    }
    if(fresh)fresh.hidden=!!key;
    paintWhere('np',null,c);
    footNote();
  }

  function giveFocusBack(){
    var back=prevFocus;prevFocus=null;
    if(back&&back.focus){try{back.focus();}catch(e){}}
  }

  /* `from` is a lead that became a project, handed over by the bridge
     (Mark, 2026-10-11): its name and links, so the project starts from what
     the lead already knew. Pressed from the bar it is nothing. */
  function openNew(from){
    var host=byId('np');if(!host)return;
    if(editing)closeEdit();
    if(newShown)return;
    var lead=(from&&typeof from==='object'&&Array.isArray(from.links))?from:null;
    prevFocus=document.activeElement;
    newShown=true;
    byId('np-body').innerHTML=
      nameHTML(NEW,lead?String(lead.name||'').slice(0,120):'','Name it \u2014 the acronym you will call it by')
      +peopleHTML(NEW)+whereHTML()+detailHTML(NEW);
    host.removeAttribute('hidden');
    Editors.piInit('new',[]);
    Editors.posInit('new',[]);
    Editors.drawTeam('new');
    Editors.partnerInit('new',[]);
    Editors.coordInit('new',[]);
    Editors.linkInit('npc',[]);
    Editors.linkInit('npp',lead?lead.links:[]);
    Editors.markerInit('np',[]);
    /* The topic field is built from the one builder both panes use rather
       than written out here, so they cannot ask for it differently. */
    var slot=byId('np-topic-slot');
    if(slot)slot.innerHTML=TopicPick.fieldHTML('np');
    fillCallSelect();
    Backbone.fillPicker();
    onCallSelect();
    refreshVeil();
    byId('np-name').focus();
  }
  function closeNew(){
    var host=byId('np');
    if(!host||!newShown)return;
    newShown=false;
    host.setAttribute('hidden','');
    /* Emptied rather than left standing: every id in it is unique to the
       pane, and a hidden second copy of them is how a stale field gets
       read by mistake. */
    byId('np-body').innerHTML='';
    var note=byId('np-foot-note');if(note)note.textContent='';
    refreshVeil();
    DatePicker.close();
    giveFocusBack();
  }
  function create(){
    var nmEl=byId('np-name');
    var name=nmEl?(nmEl.value||'').trim():'';
    if(!name){toast('A project needs a name.');if(nmEl)nmEl.focus();return;}
    var sel=byId('np-call-select');
    var joined=(sel&&sel.value&&calls[sel.value])||null;
    var onProgramme=!!(joined&&joined.id===PROGRAMME_ID);
    /* Read before anything is written: a code that is not a topic should
       stop the whole thing rather than quietly create a project with the
       link silently dropped. */
    var topic={topicId:'',topicCode:'',topicTitle:'',markers:[]};
    if(onProgramme){
      topic=TopicPick.collect('np');
      if(!topic){
        toast('That is not a topic on the Call Board \u2014 pick one from the list, or empty the box.');
        return;
      }
    }
    /* A project always has a call: on its own it gets a solo one, so its
       key dates have the same home either way. A short name already in
       use is the same call and not a second one by that name \u2014 which is
       what the foot of the pane has been saying while it was typed. */
    var c=joined;
    if(!c){
      var short=(byId('np-call').value||'').trim();
      var full=(byId('np-callfull').value||'').trim();
      if(short)c=Object.values(calls).filter(function(x){
        return !x.solo&&x.name===short;})[0]||null;
      if(!c){
        var maxOrder=-1;
        Object.values(calls).forEach(function(x){
          if(typeof x.order==='number'&&x.order>maxOrder)maxOrder=x.order;});
        c=newCall({name:short,title:full,solo:!short,
          markers:Editors.markerCollect('np'),
          links:Editors.linkCollect('npc'),
          order:maxOrder+1});
        calls[c.id]=c;
      }
    }
    var order=0;
    callProjects(c.id).forEach(function(x){
      if((x.order||0)>=order)order=(x.order||0)+1;});
    var ind=byId('np-industrial').checked;
    var p=newProject({callId:c.id,name:name,
      desc:Editors.resNames('new'),
      topicId:topic.topicId,topicCode:topic.topicCode,topicTitle:topic.topicTitle,
      markers:topic.markers,
      links:Editors.linkCollect('npp'),
      piGroups:Editors.piCollect('new'),
      positions:Editors.posCollect('new'),
      industrial:ind,
      coordinator:ind?(byId('np-coordinator').value||'').trim():'',
      coordContacts:ind?Editors.coordCollect('new'):[],
      partners:ind?Editors.partnerCollect('new'):[],
      order:order});
    projects[p.id]=p;
    /* The backbone\u2019s todos land after the project exists, dated from the
       key dates it laid out \u2014 so a call created from one arrives with its
       work on it and not only its calendar. */
    var laid=Backbone.applyTodos(p);
    save();
    closeNew();
    Nav.home();
    toast('Project created \u2014 '+p.name
      +(laid?' \u00b7 '+laid+' todo'+(laid===1?'':'s')+' from the backbone':''));
  }

  function openEdit(pid,evt){
    if(evt)evt.stopPropagation();
    if(editing===pid){closeEdit();return;}
    var p=projects[pid];
    if(!p){toast('That project no longer exists.');return;}
    if(newShown)closeNew();
    if(editing)closeEdit();
    prevFocus=document.activeElement;
    editing=pid;
    var onProg=(p.callId===PROGRAMME_ID);
    byId('pe-body').innerHTML=
      nameHTML(EDIT,p.name,'Project name')
      +peopleHTML(EDIT)
      /* The call this project is in used to be stated here, read-only,
         pointing at the call card. A line you cannot act on is a line
         you read once and then step over on every visit afterwards, and
         the head of the pane already carries the call's own colour. So
         it is gone, and the only thing left between the project and its
         details is the one thing here that CAN be changed: the topic a
         programme project is written for. `pf-apart` sets that off from
         the name and the researchers, which are one thought together. */
      +(onProg?'<div class="pf-apart">'+TopicPick.fieldHTML('em')+'</div>':'')
      +detailHTML(EDIT)
      +fateHTML(p);
    byId('pe').removeAttribute('hidden');
    byId('em-desc').value=p.desc||'';
    byId('em-coordinator').value=p.coordinator||'';
    byId('em-industrial').checked=!!p.industrial;
    byId('em-industrial-section').classList.toggle('visible',!!p.industrial);
    Editors.piInit('edit',p.piGroups||[]);
    Editors.posInit('edit',p.positions||[]);
    Editors.seedFromDesc('edit',p.desc||'');
    Editors.drawTeam('edit');
    Editors.partnerInit('edit',p.partners||[]);
    Editors.coordInit('edit',p.coordContacts||[]);
    Editors.linkInit('emp',p.links||[]);
    if(onProg)TopicPick.set('em',p);
    paintWhere('pe',p,null);
    refreshVeil();
    var el=byId('em-name');
    if(el){el.focus();try{el.select();}catch(e){}}
  }
  function closeEdit(){
    var host=byId('pe');
    if(!host||!editing)return;
    editing=null;
    host.setAttribute('hidden','');
    byId('pe-body').innerHTML='';
    var note=byId('pe-foot-note');if(note)note.textContent='';
    refreshVeil();
    DatePicker.close();
    giveFocusBack();
  }
  function saveEdit(pid){
    pid=pid||editing;
    var p=pid?projects[pid]:null;
    if(!p){closeEdit();return;}
    if(p.callId===PROGRAMME_ID){
      var topic=TopicPick.collect('em');
      if(!topic){
        toast('That is not a topic on the Call Board \u2014 pick one from the list, or empty the box.');
        return;
      }
      p.topicId=topic.topicId;p.topicCode=topic.topicCode;p.topicTitle=topic.topicTitle;
      p.markers=topic.markers;
    }
    var nm=(byId('em-name').value||'').trim();
    if(nm)p.name=nm;
    p.desc=Editors.resNames('edit');
    p.links=Editors.linkCollect('emp');
    p.piGroups=Editors.piCollect('edit');
    p.positions=Editors.posCollect('edit');
    p.industrial=byId('em-industrial').checked;
    p.coordinator=p.industrial?(byId('em-coordinator').value||'').trim():'';
    p.coordContacts=p.industrial?Editors.coordCollect('edit'):[];
    p.partners=p.industrial?Editors.partnerCollect('edit'):[];
    save();
    closeEdit();
    /* The card front carries the name, the description and the topic, so
       the whole pane rebuilds \u2014 and a dossier that was folded out is
       opened again on the card just edited, but only if that card is
       still on the page: `openCard` outlives the call it belongs to. */
    var keep=Dossier.openCard();
    CallCard.render();
    if(keep&&q('.pi-fold[data-pid="'+cssEsc(keep)+'"]'))Dossier.open(keep);
    toast('Project details saved');
  }

  return {openNew:openNew,closeNew:closeNew,create:create,
    onCallSelect:onCallSelect,footNote:footNote,
    openEdit:openEdit,closeEdit:closeEdit,saveEdit:saveEdit,
    isNewOpen:isNewOpen,isEditOpen:isEditOpen,editingId:editingId};
})();

function toggleIndustrial(ctx){
  /* The label wraps the checkbox, so this handler runs before the browser
     has flipped it — read the state one tick later. */
  setTimeout(function(){
    var prefix=(ctx==='new')?'np':'em';
    var cb=byId(prefix+'-industrial');
    var sec=byId(prefix+'-industrial-section');
    if(cb&&sec)sec.classList.toggle('visible',cb.checked);
  },0);
}

/* ══ THE SEARCH PALETTE ═════════════════════════════════════════════
   One field over everything: projects, calls, todos, notes, checklist
   items and tracker rows. Ranked, grouped, keyboard-driven. */
var Palette=(function(){
  var idx=null,results=[],sel=0,open=false;

  function build(){
    var out=[];
    /* A call is indexed once, from its own record, rather than being
       reconstructed from whichever project happened to mention it. */
    Object.values(calls).forEach(function(c){
      var nm=callName(c);
      if(!nm)return;
      out.push({kind:'call',label:nm,sub:c.title||'call',call:c.id});
      (c.markers||[]).forEach(function(m){
        if(!m.date)return;
        out.push({kind:'deadline',label:m.name||'Key date',
          sub:nm+' \u00b7 '+fmtDate(m.date),call:c.id});
      });
      pushNotes(out,rowsOf(c),function(r,n){
        return {sub:nm+' \u00b7 '+(r.name||n.label||'call info'),call:c.id};
      });
    });
    Object.values(projects).forEach(function(p){
      if(p.id===INBOX_ID)return;
      out.push({kind:'project',label:p.name,
        sub:(callNameOf(p)||'no call')+(p.archived?' \u00b7 archived':''),
        pid:p.id});
      (p.todos||[]).forEach(function(t){
        var txt=plain(t.text);
        out.push({kind:t.done?'done':'todo',label:txt||'(empty todo)',
          sub:p.name+(t.dueDate?' \u00b7 '+fmtDate(t.dueDate):''),
          pid:p.id,eid:t.id});
        (t.checklist||[]).forEach(function(ci){
          if(!ci.text)return;
          out.push({kind:'checklist',label:ci.text,
            sub:p.name+' \u00b7 '+trunc(txt,40),pid:p.id,eid:t.id});
        });
      });
      pushNotes(out,rowsOf(p),function(r,n){
        return {sub:p.name+' \u00b7 '+(n.label||r.name||'note'),
          pid:p.id,eid:n.id,rowId:r.id};
      });
      var t=p.tracker;
      if(t&&Array.isArray(t.wps)){
        t.wps.forEach(function(wp){
          if(wp.name)out.push({kind:'wp',label:wp.name,
            sub:p.name+' \u00b7 WP'+(wp.num||''),pid:p.id});
          (wp.tasks||[]).forEach(function(tk){
            if(tk.name)out.push({kind:'wp',label:tk.name,
              sub:p.name+' \u00b7 '+(wp.num||'')+'.'+(tk.num||''),pid:p.id});
          });
          pushNotes(out,[wp],function(r,n){
            return {sub:p.name+' \u00b7 '+(n.label||'tracker note'),pid:p.id};
          });
        });
      }
    });
    return out;
  }

  /* Subsequence match, scored so that earlier and tighter wins. Cheap,
     forgiving of typing "prpsl" for "proposal", and good enough at this
     scale that a real fuzzy library would be overkill. */
  function score(hay,needle){
    var h=hay.toLowerCase(),n=needle.toLowerCase();
    if(!n)return 0;
    var direct=h.indexOf(n);
    if(direct>-1)return 1000-direct*2-(h.length-n.length)*0.1;
    var hi=0,ni=0,first=-1,gaps=0,last=-1;
    while(hi<h.length&&ni<n.length){
      if(h[hi]===n[ni]){
        if(first<0)first=hi;
        if(last>-1&&hi-last>1)gaps+=hi-last-1;
        last=hi;ni++;
      }
      hi++;
    }
    if(ni<n.length)return -1;
    return 500-first*2-gaps*3-(h.length-n.length)*0.05;
  }
  function highlight(text,needle){
    if(!needle)return esc(text);
    var i=text.toLowerCase().indexOf(needle.toLowerCase());
    if(i<0)return esc(text);
    return esc(text.slice(0,i))+'<b>'+esc(text.slice(i,i+needle.length))+'</b>'
      +esc(text.slice(i+needle.length));
  }

  /* Every note in a set of rows, as palette entries. Only where it lives
     differs between the four homes, so only that is passed in. */
  function pushNotes(out,rows,where){
    (rows||[]).forEach(function(r){
      (r.notes||[]).forEach(function(n){
        var txt=plain(n.body);
        if(!txt)return;
        var entry=where(r,n);
        entry.kind='note';entry.label=txt;
        out.push(entry);
      });
    });
  }
  var GROUPS={project:'Projects',call:'Calls',
    deadline:'Key dates',todo:'Todos',
    checklist:'Checklist items',note:'Notes',wp:'Tracker',done:'Completed'};
  var ORDER=['project','call','deadline','todo','checklist','wp','note','done'];

  function search(query){
    var qy=(query||'').trim();
    if(!idx)idx=build();
    if(!qy){
      /* An empty field is not a dead end: offer the projects, so the
         palette doubles as a jump list. */
      results=idx.filter(function(x){return x.kind==='project';}).slice(0,40);
      return;
    }
    results=idx.map(function(x){
      var s=Math.max(score(x.label,qy),score(x.sub||'',qy)*0.5);
      return {x:x,s:s};
    }).filter(function(r){return r.s>0;})
      .sort(function(a,b){
        var oa=ORDER.indexOf(a.x.kind),ob=ORDER.indexOf(b.x.kind);
        return (b.s-a.s)||(oa-ob);
      })
      .slice(0,60).map(function(r){return r.x;});
  }

  function draw(query){
    var host=byId('pjp-results');
    if(!host)return;
    if(!results.length){
      host.innerHTML='<div class="pjp-empty">Nothing matches \u201c'+esc(query)+'\u201d.</div>';
      return;
    }
    var html='',lastKind=null,i=0;
    /* Grouped in a fixed order so the same query always lays out the same
       way, however the scores fall. */
    ORDER.forEach(function(kind){
      results.forEach(function(r){
        if(r.kind!==kind)return;
        if(lastKind!==kind){
          html+='<div class="pjp-group">'+(GROUPS[kind]||kind)+'</div>';
          lastKind=kind;
        }
        html+='<div class="pjp-item'+(i===sel?' sel':'')+'" data-i="'+i+'" '
          +'onmousemove="PL.paletteHover('+i+')" onclick="PL.paletteGo('+i+')">'
          +'<span class="pjp-label">'+highlight(trunc(r.label,110),query)+'</span>'
          +(r.sub?'<span class="pjp-sub">'+esc(r.sub)+'</span>':'')+'</div>';
        i++;
      });
    });
    host.innerHTML=html;
    var selEl=q('.pjp-item.sel',host);
    reveal(selEl,{instant:true});
  }

  function host(){
    var el=byId('pj-palette');
    if(el)return el;
    el=document.createElement('div');
    el.id='pj-palette';el.hidden=true;
    el.innerHTML='<div class="pjp-backdrop" onclick="PL.closePalette()"></div>'
      +'<div class="pjp-box" role="dialog" aria-label="Search">'
      +'<input id="pjp-input" type="text" autocomplete="off" spellcheck="false" '
        +'placeholder="Search projects, todos, notes\u2026" '
        +'oninput="PL.paletteInput(this.value)" onkeydown="PL.paletteKey(event)" />'
      +'<div id="pjp-results"></div>'
      +'<div class="pjp-foot"><span>\u2191\u2193 move</span><span>\u21b5 open</span>'
        +'<span>esc close</span></div></div>';
    document.body.appendChild(el);
    return el;
  }
  function show(){
    var el=host();
    idx=null;                 // rebuilt each time, so it is never stale
    sel=0;open=true;
    el.hidden=false;
    refreshVeil();
    var inp=byId('pjp-input');
    inp.value='';
    search('');draw('');
    inp.focus();
  }
  function close(){
    var el=byId('pj-palette');
    if(el)el.hidden=true;
    open=false;
    refreshVeil();
  }
  function onInput(v){sel=0;search(v);draw(v);}
  function hover(i){
    if(i===sel)return;
    sel=i;
    qa('.pjp-item').forEach(function(el){
      el.classList.toggle('sel',parseInt(el.getAttribute('data-i'),10)===sel);});
  }
  function onKey(ev){
    if(ev.key==='Escape'){ev.preventDefault();close();return;}
    if(ev.key==='ArrowDown'||ev.key==='ArrowUp'){
      ev.preventDefault();
      if(!results.length)return;
      sel=(sel+(ev.key==='ArrowDown'?1:-1)+results.length)%results.length;
      draw(byId('pjp-input').value);
      return;
    }
    if(ev.key==='Enter'){ev.preventDefault();go(sel);}
  }
  function go(i){
    var r=results[i];
    if(!r)return;
    close();
    if(r.kind==='call'||(r.kind==='note'&&r.call&&!r.pid)){
      Nav.home();Nav.pressCall(r.call);
      afterRender(function(){
        var card=q('.cc-flip[data-call-key="'+cssEsc(r.call)+'"]');
        if(card)flashEl(card);
      });
      return;
    }
    if(r.kind==='deadline'){
      Nav.home();Board.flip('timeline');Board.setAgenda(true);
      Board.renderAgenda();Beam.render();
      return;
    }
    if(!r.pid)return;
    if(r.kind==='todo'){
      Nav.home();
      Board.openDetail(r.pid,r.eid);
      afterRender(function(){flashEl(byId('todo-'+r.pid+'-'+r.eid));});
      return;
    }
    if(r.kind==='checklist'){
      Nav.home();
      Board.openDetail(r.pid,r.eid);
      afterRender(function(){
        var card=byId('todo-'+r.pid+'-'+r.eid);
        if(card){card.classList.add('open');flashEl(card);}
      });
      return;
    }
    if(r.kind==='wp'){
      Nav.home();
      afterRender(function(){
        var p=projects[r.pid];
        if(!p)return;
        var nameBtn=q('.hz-proj-open[data-pid="'+cssEsc(r.pid)+'"]');
        Sheet.open(r.pid,nameBtn);
      });
      return;
    }
    /* A project, a note, or a completed todo: all live on the card. */
    Nav.openProject(r.pid);
    if(r.kind==='note'||r.kind==='done'){
      afterRender(function(){
        /* Rows are addressed by the shared component's composite key,
           whose last part is the row's id. It was built from a `type`
           that no entry carries, so the row a note was found in was
           never lit. A tracker note names no row, and lights none. */
        var sel2=r.kind==='done'
          ?'.pi-row-done'
          :(r.rowId?'.pi-row[data-rt="'+cssEsc('pi|'+r.pid+'|'+r.rowId)+'"]':'');
        var row=sel2&&q(sel2);
        if(row)flashEl(row);
      });
    }
  }
  function isOpen(){return open;}
  return {show:show,close:close,onInput:onInput,onKey:onKey,hover:hover,go:go,isOpen:isOpen};
})();

/* ══ KEYBOARD ═══════════════════════════════════════════════════════ */
document.addEventListener('keydown',function(ev){
  var mod=ev.metaKey||ev.ctrlKey;
  if(mod&&(ev.key==='k'||ev.key==='K')){
    ev.preventDefault();
    if(Palette.isOpen())Palette.close(); else Palette.show();
    return;
  }
  if(ev.key==='Escape'){
    if(Palette.isOpen())return;              // the palette handles its own
    if(DatePicker.isOpen()){DatePicker.close();return;}
    if(Menu.anyOpen()){Menu.close();return;}
    if(ProjectForm.isEditOpen()){ProjectForm.closeEdit();return;}
    if(ProjectForm.isNewOpen()){ProjectForm.closeNew();return;}
    if(QuickTodo.isOpen()){QuickTodo.close();return;}
    if(Backbone.isOpen()){Backbone.close();return;}
    if(Sheet.pid()){Sheet.close();return;}
    if(CallCard.isInfoOpen()){CallCard.closeInfoTable();return;}
    if(Dossier.openCard()){Dossier.close();return;}
    if(Nav.anchor()){Nav.release();return;}
    return;
  }
  /* Single-letter shortcuts only outside a field, so typing is never
     hijacked. */
  var t=ev.target;
  if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT'
    ||t.isContentEditable))return;
  if(mod||ev.altKey)return;
  if(ev.key==='/'){ev.preventDefault();Palette.show();return;}
  if(ev.key==='n'){ev.preventDefault();ProjectForm.openNew();return;}
  if(ev.key==='t'){ev.preventDefault();QuickTodo.toggle();return;}
  if(ev.key==='b'){
    ev.preventDefault();
    if(Nav.anchor())Nav.release();
    Board.flip(Board.face()==='board'?'timeline':'board');
    return;
  }
});

/* ══ THE PUBLIC NAMESPACE ═══════════════════════════════════════════
   Everything the markup calls inline. There used to be ~200 bare globals;
   now there is one object, and its keys are the app's entire surface. */
window.PL={
  /* shell & navigation */
  home:Nav.home,pressCall:Nav.pressCall,openProject:Nav.openProject,
  toggleArchiveView:toggleArchiveView,hdMoreToggle:hdMoreToggle,
  menuClose:Menu.close,
  gotoCall:Timeline.gotoCall,
  toggleCloudPanel:toggleCloudPanel,closeCloudPanel:closeCloudPanel,
  exportData:exportData,importData:importData,
  openRichLink:openRichLink,
  dialogClose:function(){Dialog.close();},dialogAccept:function(){Dialog.accept();},
  connectCloud:function(){Cloud.connect();},
  logInCloud:Cloud.logIn,logOutCloud:Cloud.logOut,
  connectCloudSafe:function(){Cloud.connect(true);},
  disconnectCloud:Cloud.disconnect,pushToCloud:Cloud.push,
  toggleUploadDisabled:Cloud.toggleUpload,checkCloud:Cloud.check,
  restorePoint:Snapshots.restore,restoreCloudVersion:cloudHistoryRestore,
  refreshCloudHistory:cloudHistoryRefresh,

  /* the call backbone — reached from the header's overflow menu, not from
     any one call; used again from the new-call form below */
  backboneOpen:Backbone.open,backboneClose:Backbone.close,
  backboneEdit:Backbone.edit,backboneNew:Backbone.newOne,
  backboneNameField:Backbone.nameField,backboneSave:Backbone.save,
  backboneEvAdd:Backbone.evAdd,backboneEvField:Backbone.evField,
  backboneEvAnchor:Backbone.evAnchor,backboneEvRemove:Backbone.evRemove,
  backboneTdAdd:Backbone.tdAdd,backboneTdField:Backbone.tdField,
  backboneTdRemove:Backbone.tdRemove,backboneDelete:Backbone.del,
  backboneChoose:Backbone.choose,

  /* board */
  dayClick:Board.dayClick,dayLeadsToggle:Board.dayLeadsToggle,callElClick:Board.callElClick,projRowClick:Board.projRowClick,
  markClick:Board.markClick,closeDetail:Board.closeDetail,
  overdueClick:Board.overdueClick,unplannedClick:Board.unplannedClick,
  leadsClick:Board.leadsClick,leadsUndatedClick:Board.leadsUndatedClick,
  leadMarkClick:Board.leadMarkClick,leadsNewClick:Board.leadsNewClick,
  leadNewArenaMenu:Leads.newArenaMenu,leadNewArena:Leads.newArena,
  leadNewDue:Leads.newDue,leadNewSave:Leads.newSave,leadNewLink:Leads.newLink,
  leadPath:Leads.path,leadScore:Leads.score,leadDue:Leads.due,leadDone:Leads.done,
  leadEnd:Leads.end,leadEndCancel:Leads.endCancel,leadArena:Leads.arena,
  leadOpenBox:Leads.openBox,leadBeginEdit:Leads.beginEdit,leadCancelEdit:Leads.cancelEdit,
  leadSaveEdit:Leads.saveEdit,leadEditDrop:Leads.editDrop,leadAddNote:Leads.addNote,leadNoteKey:Leads.noteKey,
  leadNoteDel:Leads.noteDel,leadAddLink:Leads.addLink,leadLinkKey:Leads.linkKey,
  leadLinkDel:Leads.linkDel,
  weeksMenu:Board.weeksMenu,setWeeks:Board.setWeeks,flip:Board.flip,
  toggleAgenda:Board.toggleAgenda,

  /* timeline */
  tlWinMenu:Timeline.winMenu,tlWinPick:Timeline.winPick,tlPastToggle:Timeline.pastToggle,
  tlDotHover:Timeline.dotHover,tlDotUnhover:Timeline.dotUnhover,tlDotClick:Timeline.dotClick,

  /* the tracker sheet */
  openTracker:function(id,el){Sheet.open(id,el);},
  closeTracker:function(){Sheet.close();},

  /* todo cards */
  toggleTodoExpand:TodoCard.toggleExpand,
  toggleAddUpdate:TodoCard.toggleAddUpdate,addSubStamp:TodoCard.addSubStamp,
  subStampKey:TodoCard.subStampKey,delSubStamp:TodoCard.delSubStamp,
  updateTodoDue:TodoCard.updateDue,toggleTodoDone:TodoCard.toggleDone,
  deleteTodo:TodoCard.del,
  beginEditTodo:TodoCard.beginEdit,cancelEditTodo:TodoCard.cancelEdit,
  saveEditTodo:TodoCard.saveEdit,
  todoEffortMenu:TodoCard.effortMenu,setTodoEffort:TodoCard.setEffort,
  todoCatMenu:TodoCard.catMenu,setTodoCat:TodoCard.setCat,
  todoWaitMenu:TodoCard.waitMenu,setTodoWait:TodoCard.setWait,
  todoWaitScope:TodoCard.waitScope,
  dayGather:Board.gather,
  openBlocker:TodoCard.openBlocker,
  litBlocker:TodoCard.litBlocker,unlitBlocker:TodoCard.unlitBlocker,

  /* checklist */
  addChkItem:Checklist.addItem,chkAddKey:Checklist.addKey,
  chkAddBlur:Checklist.addBlur,focusChkAdd:Checklist.focusAdd,
  toggleChkItem:Checklist.toggleItem,delChkItem:Checklist.delItem,
  editChkItem:Checklist.editItem,toggleChkFocus:Checklist.toggleFocus,
  toggleChkNotes:Checklist.toggleNotes,chkNoteBlur:Checklist.noteBlur,
  addChkNote:Checklist.addNote,chkNoteKey:Checklist.noteKey,delChkNote:Checklist.delNote,
  toggleAllChkNotes:Checklist.toggleAllNotes,chkGripDown:Checklist.gripDown,

  /* call card */
  openCallEdit:CallCard.openEdit,cancelCallEdit:CallCard.cancelEdit,
  saveCallEdit:CallCard.saveEdit,setCallColor:CallCard.setColor,
  openCallInfo:CallCard.openInfoTable,closeCallInfo:CallCard.closeInfoTable,

  /* the row table — one set of handlers for both the call info
     table and the project dossier; the namespace picks the adapter */
  rtAddRow:RowTable.addRow,rtDelRow:RowTable.delRow,
  rtName:RowTable.setName,rtColor:RowTable.setColor,rtColorMenu:RowTable.colorMenu,
  rtAddNote:RowTable.addNote,rtDelNote:RowTable.delNote,rtToggleNote:RowTable.toggleNote,
  rtStartRename:RowTable.startRename,rtCommitRename:RowTable.commitRename,
  rtTabKey:RowTable.tabKey,rtNoteInput:RowTable.onInput,rtNotePaste:RowTable.onPaste,
  rtNoteBlur:RowTable.onBlur,rtNoteKey:RowTable.onKey,
  rowNameKey:rowNameKey,

  /* project cards & the dossier */
  toggleFold:Dossier.toggleFold,
  piToggleDone:Dossier.toggleDone,piShowAllDone:Dossier.showAllDone,
  piReopen:Dossier.reopenTodo,
  piArchive:Dossier.archive,piDelete:Dossier.del,
  piEditProject:ProjectForm.openEdit,piSaveEdit:ProjectForm.saveEdit,
  piCancelEdit:ProjectForm.closeEdit,

  /* forms */
  showNewForm:ProjectForm.openNew,hideNewForm:ProjectForm.closeNew,
  createProject:ProjectForm.create,
  onCallSelectChange:ProjectForm.onCallSelect,npCallName:ProjectForm.footNote,
  toggleIndustrial:toggleIndustrial,
  topicInput:TopicPick.onInput,openTopic:openProjectTopic,
  toggleQuickTodo:QuickTodo.toggle,closeQuickTodo:QuickTodo.close,
  projectTodo:QuickTodo.openFor,
  addQuickTodo:QuickTodo.add,quickTodoCall:QuickTodo.onCall,
  quickTodoProject:QuickTodo.onProject,quickTodoKey:QuickTodo.nameKey,
  quickTodoUpdateKey:QuickTodo.updateKey,quickTodoMore:QuickTodo.more,
  quickTodoDate:QuickTodo.paintDates,quickTodoClearDate:QuickTodo.clearDate,
  addPendingSubstamp:addPendingSubstamp,removePendingSubstamp:removePendingSubstamp,
  markerAdd:Editors.markerAdd,markerField:Editors.markerField,
  markerRemove:Editors.markerRemove,
  linkAdd:Editors.linkAdd,linkField:Editors.linkField,linkRemove:Editors.linkRemove,
  addPosItem:Editors.posAdd,posRemove:Editors.posRemove,posField:Editors.posField,
  posNames:Editors.posNames,
  addResearcher:Editors.resAdd,resRemove:Editors.resRemove,resPI:Editors.resPI,
  resGroup:Editors.resGroup,resIn:Editors.resIn,
  resName:function(ctx,id,v){Editors.posField(ctx,id,'name',v);},
  addPartner:Editors.partnerAdd,partnerRemove:Editors.partnerRemove,
  partnerName:Editors.partnerName,partnerLead:Editors.partnerLead,
  contactAdd:Editors.contactAdd,contactField:Editors.contactField,
  contactRemove:Editors.contactRemove,
  prtMail:ProjectCard.mailMenu,prtMailTick:ProjectCard.mailTick,
  prtMailOrg:ProjectCard.mailOrg,prtMailAll:ProjectCard.mailAll,
  prtMailCopy:ProjectCard.mailCopy,

  /* the calendar */
  openDatePicker:function(el){DatePicker.open(el);},
  dpNav:DatePicker.nav,dpSelect:DatePicker.select,

  /* the palette */
  openPalette:Palette.show,closePalette:Palette.close,
  paletteInput:Palette.onInput,paletteKey:Palette.onKey,
  paletteHover:Palette.hover,paletteGo:Palette.go
};
window.CT=Tracker;

/* ══ BOOT ═══════════════════════════════════════════════════════════ */
load();
/* Everything above was the app reading itself in; everything below and
   after is Mark. See `bootDone` at THE STORE for why the cloud has to know
   the difference. */
bootDone=true;
Nav.applyMode();
Board.render();
Cloud.init();
syncArchiveLabel();

/* The board's flip box needs a measured height, and fonts landing late
   change it. */
window.addEventListener('load',function(){
  Board.fitFlip();
  if(document.fonts&&document.fonts.ready)
    document.fonts.ready.then(function(){Board.fitFlip();});
});

/* ══ WHAT THE OTHER ROOMS MAY ASK FOR ═══════════════════════════════
   Inside the closure, because that is where the journal is. This block
   used to sit just past the closing brace below, where `projects`,
   `calls` and `save` are not names at all — so three of its five keys
   had always handed back null, and would have gone on doing so silently
   for whoever reached for them next. */
try{ Hub.expose('ledger',{
  PL:       window.PL,
  projects: function(){ return projects; },
  calls:    function(){ return calls; },
  save:     save,
  /* The socket the Call Board's topics arrive through — empty until the
     bridge fills it, and the room runs perfectly well with it unfilled. */
  setTopics: Topics.fill,
  /* The socket Semaphore's leads arrive through, and the call that says
     they have changed — both filled and made by the bridge; see THE LEADS
     LINE. */
  setLeads: function(o){ Leads.fill(o); Board.render(); },
  leadsChanged: function(){ Board.leadsChanged(); },
  /* A restore point of everything as it stands, for the bridge to keep
     before a room's cloud copy replaces what this device holds. */
  snapshot: function(why){ Snapshots.take(why); },
  /* The one login in the page. The bridge's three room syncs and the two
     inboxes send this token rather than signing in themselves: two clients
     holding one session would each renew it, and Supabase revokes a whole
     session when a renewal is used twice. `cloud:session` on the bus says
     when it starts and ends. */
  signedIn: Cloud.signedIn,
  token:    Cloud.token
}); }catch(e){}

})();
});
