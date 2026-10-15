/* ══════════════════════════════════════════════════════════════════════
   THE NOTES ROOM — a heap of notes, and a shelf that files itself.

   A note is a title, a rich-text body and a set of tags; nothing is
   filed by hand. The organisation is computed from the tags into the
   Books page's own four-deep shape, drawn in the Books page's own
   language, because Mark reads that shape every day: the tag that best
   divides the notes becomes a book with a chapter head, inside it the
   best-dividing tags become the file tabs of its pages, inside a page
   they become coloured rows, and a row carries its notes as named pills
   — press one and the note balloons open underneath, exactly as a note
   does on the Books page.

   A note always stands in every book its tags earn. That was the room's
   own idea and there is no switch off it: a bar offering to file each
   note once was written, used by nobody, and taken out again.

   What the bar carries instead is the other way of getting to a note.
   The shelf is the room reading the tags for you; the tag view is you
   reading them yourself — pick a tag, pick another of what is left,
   and go on until what remains is short enough to look at. Same notes,
   same tags, no arithmetic in the way.

   The room runs alone, and now asks the other four rooms for nothing at
   all: the socket a note once pointed at projects, calls and researchers
   through was taken out on 2026-09-03, unused.
   ══════════════════════════════════════════════════════════════════ */
Hub.mount('notes', function (window, document, localStorage) {
'use strict';

var NT = {};   /* the namespace every inline handler calls by name */

/* ══ SMALL TOOLS ══════════════════════════════════════════════════════
   esc/jsq are the Ledger's pair, copied rather than shared: a value on
   its way into an inline handler passes two parsers, the HTML attribute
   reader and then JavaScript, and jsq covers the second where esc alone
   would hand an apostrophe straight back to it. */
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function jsq(s){return esc(String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"));}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
function el(id){return document.getElementById(id);}
function debounce(fn,ms){var t;return function(){var a=arguments;clearTimeout(t);
  t=setTimeout(function(){fn.apply(null,a);},ms);};}
/* in a template, inert, as sanitizeRich reads markup: a div runs an
   <img onerror> it is handed even off the page */
function toText(html){var d=document.createElement('template');d.innerHTML=html||'';
  return d.content.textContent||'';}
var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var MONF=['January','February','March','April','May','June','July','August',
  'September','October','November','December'];
function fmtDate(ms){var d=new Date(ms),s=d.getDate()+' '+MON[d.getMonth()];
  if(d.getFullYear()!==new Date().getFullYear())s+=' '+d.getFullYear();return s;}

/* The row and page colours. A computed page has no colour of its own the
   way a hand-made one does, so each tag key hashes into a small fixed
   palette — stable across reloads, which is what matters: a row that was
   blue yesterday being amber today would read as a different row.

   The hash is the default and not the verdict. A colour Mark has chosen
   for a tag is kept against that tag in the store and used everywhere the
   tag is drawn — its row, its page tab, and the wash on every note pill
   standing in it — so a colour set once in one book holds in all of them.
   CHOICES is the hash palette plus four that never come up by chance, so
   that picking has something to offer beyond rearranging the six. */
var PALETTE=['#C9A84C','#7FB0D8','#C07FA8','#7FC0A0','#C98A5A','#9A8BC9'];
var CHOICES=PALETTE.concat(['#D8695B','#6FA98C','#8A8BF0','#B0A48C']);
function tagColor(key){
  var own=store&&store.colors&&store.colors[key];
  if(own)return own;
  var h=0;for(var i=0;i<key.length;i++)h=(h*31+key.charCodeAt(i))>>>0;
  return PALETTE[h%PALETTE.length];
}

/* ══ THE STORE ════════════════════════════════════════════════════════
   notes.v1, the room's own key and nobody else's — the Ledger keeps
   pj-journal-v3 and it is never read or written from here. The
   saved object carries its schema version from day one, because
   migrating a versioned blob is easy and guessing what an unversioned
   one meant is not. Two facts in it are hand-made rather than computed:
   shelf, Mark's book order as tag keys, and view, which of the two ways
   into the notes the bar is set to. Two more joined them: colors, a
   colour chosen for a tag, and pins, what has been fixed in place inside
   a book. Both are keyed by tag and neither is ever computed, so a blob
   written before they existed simply has none and the room falls back to
   the arithmetic for everything. A blob written before this still
   carries `mode`; it is read by nobody now and left where it lies
   rather than stripped, because rewriting a saved file to delete a key
   is a risk taken for tidiness alone. */
var KEY='notes.v1';
var store=load();
function load(){
  try{
    var raw=localStorage.getItem(KEY);
    if(raw){var s=JSON.parse(raw);
      if(s&&s.v===1&&s.notes instanceof Array){
        s.shelf=s.shelf||[];
        s.view=(s.view==='tags')?'tags':'shelf';
        s.ties=(s.ties instanceof Array)?s.ties:[];
        s.colors=(s.colors&&typeof s.colors==='object')?s.colors:{};
        s.pins=(s.pins&&typeof s.pins==='object')?s.pins:{};
        return s;
      }}
  }catch(e){console.error('notes: unreadable store',e);
    Hub.note('Notes could not read its saved data — starting empty. '
      +'The old blob is untouched under notes.v1.',10000);}
  return {v:1,notes:[],shelf:[],view:'shelf',ties:[],colors:{},pins:{}};
}
/* Structural saves — a tag added, a note made or deleted, the shelf
   dragged, the view switched — recompute and repaint at once. Keystroke
   saves come through the debounce below and repaint nothing, so typing
   never fights a re-render. */
function save(structural){
  try{
    localStorage.setItem(KEY,JSON.stringify(store));
    /* An ISO date, because the bridge weighs this against the cloud row's
       own updated_at and that is one. Epoch milliseconds were written
       here for as long as this room rode in no cloud at all; the bridge
       still reads one of those, for the browsers that hold it. */
    localStorage.setItem(KEY+'-ts',new Date().toISOString());
  }catch(e){Hub.note('Notes could not save — '+((e&&e.message)||e),8000);}
  if(structural){shelve();render();}
  /* The room's single write path, so this is where the cloud hears that
     there is something to send. The room itself knows of no cloud — the
     bridge is what listens, exactly as it does for Semaphore. */
  try{Hub.emit('notes:saved');}catch(e){}
}
/* The half second of grace after a keystroke is longer than it takes to
   close a tab, and nothing used to cut it short — so the last words typed
   before closing were the ones that never reached the disk. Hiding the
   page is the last moment this certainly still runs, so the wait ends
   there. */
var saveTimer=null;
function saveSoon(){
  clearTimeout(saveTimer);
  saveTimer=setTimeout(function(){saveTimer=null;save(false);},500);
}
function saveNow(){
  if(!saveTimer)return;
  clearTimeout(saveTimer);saveTimer=null;
  save(false);
}
window.addEventListener('pagehide',saveNow);
document.addEventListener('visibilitychange',function(){
  if(document.visibilityState==='hidden')saveNow();
});
function byId(id){for(var i=0;i<store.notes.length;i++)
  if(store.notes[i].id===id)return store.notes[i];return null;}

/* ══ WHAT MARK HAS FIXED IN PLACE ═════════════════════════════════════
   The arithmetic decides what a book is divided into and in what order.
   This is the one place that overrules it, and it overrules it the same
   way the shelf's own drag does: what has been pinned comes first, in the
   order it was pinned, and everything else follows in the order the
   counting gave it.

   Pinning is a stack rather than a numbering, because that is the whole
   of what was asked for: say a page, a row or a note should stay, and it
   takes the first free place. Say a second and it takes the second. There
   is no box to type 4 into and no way to leave a gap at 3, which is what
   makes it possible to keep in your head — and unpinning is pressing the
   same pin again, after which everything behind it closes up.

   Pins hang off the book they were made in, so the same tag pinned first
   inside one book is untouched inside another. Three sorts, by what they
   order: the strip of page tabs, the rows of one page, and the notes
   inside one row. Rows and notes are filed under the page and the row
   slot they were pinned on, which already name the book they belong to.

   Nothing here is ever pruned. A row that stops earning its place comes
   back to the position Mark gave it when it earns one again, exactly as
   a book that falls off the shelf and returns does. */
function pinsFor(book,make){
  var all=store.pins||(store.pins={});
  var p=all[book];
  if(!p&&make)p=all[book]={pages:[],rows:{},notes:{}};
  if(!p)return null;
  if(!(p.pages instanceof Array))p.pages=[];
  if(!p.rows||typeof p.rows!=='object')p.rows={};
  if(!p.notes||typeof p.notes!=='object')p.notes={};
  return p;
}
function pinList(book,kind,sub){
  var p=pinsFor(book,false);
  if(!p)return [];
  if(kind==='pages')return p.pages;
  var l=p[kind][sub];
  return (l instanceof Array)?l:[];
}
function isPinned(book,kind,sub,key){
  return pinList(book,kind,sub).indexOf(key)>=0;
}
function pinTotal(book){
  var p=pinsFor(book,false),n=0;
  if(!p)return 0;
  n+=p.pages.length;
  ['rows','notes'].forEach(function(kind){
    Object.keys(p[kind]).forEach(function(k){
      n+=(p[kind][k]||[]).length;});
  });
  return n;
}
/* The one door in and out. `sub` is the page for a row and the row slot
   for a note, and is ignored for a page tab — a book has only one strip
   of them. */
NT.pin=function(kind,sub,key){
  if(!inBook()||!key)return;
  var p=pinsFor(cur,true),list;
  if(kind==='pages')list=p.pages;
  else list=p[kind][sub]=(p[kind][sub] instanceof Array)?p[kind][sub]:[];
  var i=list.indexOf(key);
  if(i>=0)list.splice(i,1);else list.push(key);
  save(true);
};
/* Pinned first in the order pinned, then the rest in the order given.
   Splicing out of a working copy rather than filtering twice, so a key
   that somehow appears in the pin list twice still moves one item. */
function applyPins(items,keys,idOf){
  if(!keys||!keys.length)return items;
  var left=items.slice(),out=[];
  keys.forEach(function(k){
    for(var i=0;i<left.length;i++){
      if(idOf(left[i])===k){out.push(left.splice(i,1)[0]);return;}
    }
  });
  return out.concat(left);
}
/* Colouring and pinning are offered inside a book and nowhere else: a
   search result, the flat lists and the tag view are all month rows in
   date order, and fixing the third month of a chronology in second place
   would be a lie about what the sheet is. */
function inBook(){
  return !SQ&&store.view!=='tags'&&cur!=='*'&&cur!=='~'&&cur!=='&';
}

/* ══ THE ARITHMETIC ═══════════════════════════════════════════════════
   What earns a level. Raw frequency is the trap the brief names: a tag
   on 90% of the notes divides nothing, and ranking by count alone gives
   one enormous book and then crumbs. So a tag is scored by how well it
   *divides* the set it is looking at — c*(n-c)/n, largest for a tag on
   half the notes, zero for a tag on none or all.

   Past four notes in five, a tag is the room's own name, not a shelf
   within it: it earns nothing anywhere. The shelf once named it in a
   footnote; that came off in the 2026-10-06 cleanup as a remark that
   told nothing the tags view does not, where it heads the list with its
   count. The line is 0.8 rather than the 0.9 the
   trap is usually described with, because a tag drifts up towards
   universal gradually and there is no note count at which an 85% book
   is useful where an 89% one is not. */
var MIN_BOOK=3;   /* a book needs three notes before it is worth a spine */
var MIN_SUB=2;    /* a page or row needs two — one note is not a division */
var CEIL=0.8;
/* How many tabs a strip and rows a sheet may carry before the tail is
   swept into "the rest". Uncapped overlap is right about the *notes* —
   a note belongs in every group its tags earn — but it is not a claim
   that seventeen file tabs can be read as a strip. A page Mark can take
   in at a glance is worth more than one that is complete, and the tail
   is one press away either way. */
var MAX_TABS=8, MAX_ROWS=7;

/* ── which division comes first ──
   Rows are the first division and pages the second, which is the order
   they read in: a sheet of a few named rows can be taken in at once, and
   a strip of tabs over it only earns its place once the book is too big
   for one sheet to say anything useful.

   It was the other way round to begin with, and wrongly: a book split
   into pages at six notes, and each of those pages then needed four of
   its own before it could have rows — so pages appeared almost at once,
   every page was too small to have rows, and rows never formed at all.
   Mark filled the room and saw exactly that.

   A page must also be a *large* split. The tag that best divides a book
   deserves a tab; a tag standing on two of its thirty notes is a row at
   most, and giving that a tab claims it is one of the book's main parts
   when it is a footnote. So a page has to hold a real share of the book
   as well as clearing the ordinary bar — and one qualifying page is no
   division at all, since that page and "the rest" is only the book said
   twice. */
var ROW_AT=3;        /* a set this deep is worth dividing into rows */
var PAGE_AT=12;      /* a book this big may be divided into pages as well */
var PAGE_SHARE=0.15; /* and each page must hold this much of the book */
var PAGE_MIN=3;      /* never fewer than this, however small the book */

/* ── tags do not care about capitals ──
   A tag is matched, filed and searched by its key, which is lower-case
   and single-spaced, so HORIZON, Horizon and horizon are one tag and
   always were. What did not follow was the spelling on screen: whoever
   typed it first won, so the same tag could read one way as a chip and
   another as a row heading. So one spelling is chosen for the whole
   room — the one written most often, earliest wins a tie — and that is
   the only one ever drawn. Adding a tag adopts it too, so the shift key
   cannot quietly make a second-looking tag out of an existing one. */
function keyOf(t){return String(t||'').trim().replace(/\s+/g,' ').toLowerCase();}
function dispOf(t){return String(t||'').trim().replace(/\s+/g,' ');}
var CANON={};
function canonise(){
  var seen={};
  store.notes.forEach(function(n){
    (n.tags||[]).forEach(function(t){
      var k=keyOf(t),d=dispOf(t);
      if(!k)return;
      if(!seen[k])seen[k]={};
      seen[k][d]=(seen[k][d]||0)+1;
    });
  });
  CANON={};
  /* a tag can be named in a tie without standing on any note yet, and it
     would otherwise be drawn in the lower case the key is stored in */
  tiesOf().forEach(function(t){
    if(t.aDisp&&!CANON[t.a])CANON[t.a]=t.aDisp;
    if(t.bDisp&&!CANON[t.b])CANON[t.b]=t.bDisp;
  });
  Object.keys(seen).forEach(function(k){
    var best=null,n=-1;
    Object.keys(seen[k]).forEach(function(d){
      if(seen[k][d]>n){n=seen[k][d];best=d;}
    });
    CANON[k]=best;
  });
}
function displayFor(key){return CANON[key]||key;}
function taggedWith(key){
  return store.notes.filter(function(n){
    return effTags(n).indexOf(key)>=0;});
}

/* ══ HOW TAGS RELATE ══════════════════════════════════════════════════
   Two tags can stand in one of two relations to each other, and both are
   Mark's to declare — the arithmetic cannot work them out, because they
   are facts about the world rather than about the notes.

     the same kind   ITEA and Chips JU are both a sort of call. Neither
                     divides the other: an ITEA page inside the Chips JU
                     book says nothing, and the mirror of it says nothing
                     either. So siblings never subdivide one another.

     a kind of       ITEA is an industrial grant. The narrow one divides
                     the broad one usefully — an ITEA page inside the
                     industrial grants book is worth having — and the
                     broad one cannot divide the narrow: every note in
                     the ITEA book is an industrial grant already, so a
                     row saying so groups nothing.

   The second relation says something further, and the room would be
   lying without it: a note tagged ITEA *is* a note about an industrial
   grant, whether or not that was typed. So a tag carries its broader
   tags with it everywhere the shelf counts — which is what makes an
   ITEA page inside the industrial grants book have anything in it.

   Ties are stored as declared, one pair at a time, and the closures are
   rebuilt on every shelve(): keeping the closure instead would mean two
   records of one fact, and the derived one would eventually be wrong. */
var SAME={},   /* key -> {key:1} every tag of the same kind, transitively */
    BROAD={},  /* key -> {key:1} every tag this one is a kind of, ditto */
    NARROW={}; /* key -> {key:1} the kinds of it — BROAD read backwards */

function tiesOf(){return (store.ties instanceof Array)?store.ties:(store.ties=[]);}

function relate(){
  SAME={};BROAD={};NARROW={};
  var ties=tiesOf();
  /* the same kind is mutual and travels: if a is b's kind and b is c's,
     then a and c are of a kind too */
  var groups=[];
  function classOf(k){
    for(var i=0;i<groups.length;i++)if(groups[i][k])return groups[i];
    return null;
  }
  ties.forEach(function(t){
    if(t.kind!=='same')return;
    var ga=classOf(t.a),gb=classOf(t.b);
    if(ga&&gb&&ga!==gb){
      Object.keys(gb).forEach(function(k){ga[k]=1;});
      groups.splice(groups.indexOf(gb),1);
    }else if(ga)ga[t.b]=1;
    else if(gb)gb[t.a]=1;
    else{var g={};g[t.a]=1;g[t.b]=1;groups.push(g);}
  });
  groups.forEach(function(g){
    Object.keys(g).forEach(function(k){SAME[k]=g;});
  });

  /* a kind of is one-way and also travels, so ITEA under industrial
     grants under funding puts both above ITEA */
  var up={};
  ties.forEach(function(t){
    if(t.kind!=='under')return;
    (up[t.a]||(up[t.a]={}))[t.b]=1;
  });
  Object.keys(up).forEach(function(k){
    var seen={},stack=Object.keys(up[k]);
    /* a cycle would be a nonsense declaration rather than an error, so
       it is walked once and left rather than followed forever */
    while(stack.length){
      var b=stack.pop();
      if(seen[b]||b===k)continue;
      seen[b]=1;
      Object.keys(up[b]||{}).forEach(function(x){stack.push(x);});
    }
    BROAD[k]=seen;
  });
  /* tags of a kind share what they are kinds of: if ITEA and Chips JU
     are the same kind and ITEA is an industrial grant, saying so of one
     without the other is the sort of half-fact that reads as a bug */
  Object.keys(SAME).forEach(function(k){
    var merged={};
    Object.keys(SAME[k]).forEach(function(sib){
      Object.keys(BROAD[sib]||{}).forEach(function(b){
        if(!SAME[k][b])merged[b]=1;
      });
    });
    if(Object.keys(merged).length)BROAD[k]=merged;
  });

  /* The same fact read the other way: which tags are kinds of this one.
     The shelf needs it because a declared kind is owed a place inside
     its broad tag's book whatever the counting says, and the counting
     only knows how to look upward. Built here from the finished BROAD,
     siblings' inheritance included, so the two can never disagree. */
  Object.keys(BROAD).forEach(function(k){
    Object.keys(BROAD[k]).forEach(function(b){
      (NARROW[b]||(NARROW[b]={}))[k]=1;
    });
  });
}

/* What a note counts as, rather than what was typed on it: its own tags,
   and everything those tags are a kind of. */
function effTags(n){
  var out=[],seen={};
  (n.tags||[]).forEach(function(t){
    var k=keyOf(t);
    if(!k||seen[k])return;
    seen[k]=1;out.push(k);
    Object.keys(BROAD[k]||{}).forEach(function(b){
      if(seen[b])return;
      seen[b]=1;out.push(b);
    });
  });
  return out;
}
/* Which tags may not divide a set already standing under `keys`: the
   context itself, anything of the same kind as it, and anything it is a
   kind of. What is left is the narrower and the unrelated — the two
   sorts that actually tell you something new. */
function barredBy(keys){
  var bar={};
  (keys||[]).forEach(function(k){
    if(!k)return;
    bar[k]=1;
    Object.keys(SAME[k]||{}).forEach(function(x){bar[x]=1;});
    Object.keys(BROAD[k]||{}).forEach(function(x){bar[x]=1;});
  });
  return bar;
}

/* every tag in a set of notes, with the notes it stands on; the display
   spelling is the first one met, so HORIZON and Horizon file together
   and the shelf shows whichever came first */
function tally(notes,skip){
  var m={},out=[];
  notes.forEach(function(n){
    var seen={};
    effTags(n).forEach(function(k){
      if(!k||skip[k]||seen[k])return;
      seen[k]=1;
      if(!m[k]){m[k]={key:k,display:displayFor(k),notes:[]};out.push(m[k]);}
      m[k].notes.push(n);
    });
  });
  return out;
}
function divide(c,n){return c*(n-c)/n;}
function rank(a,b){return b.score-a.score||b.notes.length-a.notes.length
  ||(a.key<b.key?-1:1);}

/* the shelf: which tags earn a book, and in what order.
   UNI is the set of tags standing on nearly every note in the room. They
   are skipped at every level, not only at the shelf: a tag that is the
   room's own name divides a page no better than it divides the shelf,
   and the first draft of this file let EU — on nine notes in ten — earn
   a row inside three books, where it read as a heading meaning nothing.
   Computed once per shelve() and consulted by every subdivision. */
var SHELF={books:[],everywhere:[],untagged:[]};
var UNI={};
/* How many notes a tag needs before it is worth a spine. Three is right
   for a room with a history in it and far too many for a room three
   notes old: two notes on the same tag is the first real grouping there
   is, and watching the first book appear is how anyone learns what this
   shelf does. So the bar is two until the room is past a dozen notes. */
function minBook(n){return n<12?2:MIN_BOOK;}

/* One pass of the book-picking, so it can be run again with a different
   set of tags held back. Every qualifying tag earns a book and a note
   stands in all of them — full overlap, as decided. */
function pickBooks(N,uni,mb){
  var books=[];
  tally(N,uni).forEach(function(t){
    var c=t.notes.length;
    if(N.length<mb||c<mb)return;
    t.score=divide(c,N.length);
    books.push(t);
  });
  books.sort(rank);
  return books;
}

function shelve(){
  canonise();
  relate();
  var N=store.notes,everywhere=[],uni={},mb=minBook(N.length);
  tally(N,{}).forEach(function(t){
    if(N.length>=mb&&t.notes.length>CEIL*N.length){
      everywhere.push(t);uni[t.key]=1;
    }
  });
  var books=pickBooks(N,uni,mb);
  /* A ceiling that empties the shelf has answered the wrong question.
     It exists to stop one tag on nearly everything crowding out the tags
     that actually divide the notes — but with three notes all tagged
     `budget` there is nothing to crowd out, and holding it back left the
     shelf blank and a footnote explaining why, which is not an answer to
     "where is my book". When the tag standing on everything is the only
     shelf there is, it gets to be the shelf. */
  if(!books.length&&everywhere.length){
    uni={};everywhere=[];
    books=pickBooks(N,uni,mb);
  }
  UNI=uni;
  /* The arithmetic decides which tags earn a book; the order on the
     shelf is Mark's. His saved order goes first and whatever still earns
     a place keeps it; a newly-earned book appends at the end. The saved
     list is never pruned, so a book that stops earning for a while comes
     back to the place he gave it rather than to the end of the queue. */
  var byKey={};books.forEach(function(b){byKey[b.key]=b;});
  var ordered=[];
  store.shelf.forEach(function(k){if(byKey[k]){ordered.push(byKey[k]);delete byKey[k];}});
  books.forEach(function(b){if(byKey[b.key])ordered.push(b);});
  SHELF={books:ordered,everywhere:everywhere,
    untagged:N.filter(function(n){return !(n.tags&&n.tags.length);})};
}

/* One level down: divide a set of notes by its best remaining tags.
   Every tag clearing the bar gets its group and a note stands in all of
   them — full overlap, as decided — with one pruning: a tag standing on
   exactly the notes an earlier group already holds would draw the same
   list twice under two names, which is noise, not another route. The set
   has to be minN deep before subdividing is clearer than just listing
   the pills.

   `ctx` is what this set already stands under — the book, and the page
   inside it. It is passed as well as `skip` because the two questions it
   answers point opposite ways: `skip` bars everything the context makes
   redundant, while ctx names the tags declared *kinds of* the context,
   and those are owed a place here however the counting falls.

   Why they are owed it. A tie is not a hint the arithmetic may weigh; it
   is Mark saying ITEA is a kind of industrial grant. So the industrial
   grants book has to have an ITEA page or row in it, and the ordinary
   bars are all wrong about that in the same way: the ceiling drops ITEA
   for standing on nearly the whole book, the cap drops it for arriving
   ninth, the floor drops it for standing on one note, and the identical
   -set pruning drops it for holding exactly what some other tag holds.
   Every one of those is a judgement that a tag is not telling you
   anything new — which is a fine judgement to make about a tag that
   merely happens to be there, and the wrong one about a tag whose place
   was declared. In Mark's own room ITEA stood on all seven notes of the
   industrial grants book and so appeared nowhere inside it, which is the
   bug this paragraph exists for.

   Kin do not pass the UNI bar, and that is deliberate: a tag on four
   notes in five of the whole room is the room's own name, the shelf
   already says so in its footnote, and repeating it as a row inside
   every book it is tied under is exactly the noise UNI was added to
   stop. Being tied buys a place in one book, not everywhere. */
function subdivide(notes,skip,minN,cap,floor,ctx){
  var out={groups:[],rest:notes.slice()};
  if(notes.length<minN)return out;
  floor=Math.max(MIN_SUB,floor||0);
  /* the room's near-universal tags divide nothing at any depth */
  var bar={};
  Object.keys(skip||{}).forEach(function(k){bar[k]=1;});
  Object.keys(UNI).forEach(function(k){bar[k]=1;});
  cap=cap||MAX_ROWS;
  var kin={};
  (ctx||[]).forEach(function(k){
    if(!k)return;
    Object.keys(NARROW[k]||{}).forEach(function(x){if(!bar[x])kin[x]=1;});
  });
  var cands=tally(notes,bar).filter(function(t){
    var c=t.notes.length;
    if(kin[t.key])return c>0;
    return c>=floor&&c<notes.length&&c<=CEIL*notes.length;
  });
  cands.forEach(function(t){t.score=divide(t.notes.length,notes.length);});
  cands.sort(rank);
  /* Kin first, so the cap can never be spent before they are placed, and
     so the book's declared parts head its strip of tabs. */
  cands.sort(function(a,b){
    return (kin[b.key]?1:0)-(kin[a.key]?1:0);
  });
  var seen={},caught={};
  cands.forEach(function(t){
    if(!kin[t.key]&&out.groups.length>=cap)return;
    var sig=t.notes.map(function(n){return n.id;}).sort().join('|');
    if(seen[sig]&&!kin[t.key])return;
    seen[sig]=1;
    out.groups.push(t);
    t.notes.forEach(function(n){caught[n.id]=1;});
  });
  out.rest=notes.filter(function(n){return !caught[n.id];});
  return out;
}

/* ══ WHAT IS OPEN ═════════════════════════════════════════════════════ */
var cur='*';        /* the open book: a tag key, '*' every note, '~' untagged */
var curTemp=false;  /* the open book was made from a tag on the spot */
var curPage=null;   /* the open page tab inside the book, or '*rest' */
var SQ='';          /* the live search text */
var panel={id:null,slot:null};   /* the ballooned-open note, and which row */
var shelfOpen=false;             /* the fold, opened out for this sitting */
/* Arrange mode. Reading a book and rearranging it are different jobs, and
   a pin beside every row and every note would be in the way of the first
   for the sake of the second — which is rare. So the pins and the colour
   swatches are all behind one press at the foot of the sheet, and the
   sheet at rest carries none of them. It survives a change of book on
   purpose: pinning is usually done to several books in one sitting. */
var arranging=false;
/* Whether the open note is being written rather than read. A note opens
   read-only: no caret in its title, none in its body, and no formatting
   rail on screen. The edit button beside the stamp is what turns all
   three on at once. A note just made opens the other way round, already
   editing, because it was made in order to be written.

   Like the drawer it replaced, it is a flag for the room rather than a
   fact about the note, so it resets with every note opened — reading is
   where a note starts, whatever the last one was left as. */
var editing=false;
/* True for exactly one render: the one that first draws a note's panel.
   It is what decides whether the balloon plays, and it is cleared by the
   render that used it. */
var panelFresh=false;
/* The id of a note being written, or null. While it is set the sheet
   holds that note and nothing else.

   A new note used to be dropped into Every note with its panel open,
   which meant writing one happened inside a wall of every note of this
   month and the last — the busiest sheet in the room, as a backdrop for
   the one thing wanting attention. Nothing else about where you were
   changes: the book you were reading is still open behind it and comes
   back the moment the note is closed, by which time its tags have filed
   it and it is wherever they put it. */
var writing=null;
/* The tag view's whole state: the keys picked so far, in the order they
   were picked, and the text filtering the list of what may be picked
   next. Neither is saved. Where you had got to in a search is not a
   fact about the notes, and coming back tomorrow three tags deep with
   no memory of why would be worse than starting at the top. */
var trail=[];
var TQ='';

/* ══ THE TAG VIEW ═════════════════════════════════════════════════════
   The other way to a note, and the plain one. Nothing is computed here:
   the notes still standing are those carrying every tag picked so far,
   and what may be picked next is every tag on them that would actually
   shorten the list. Pick, pick again, stop when the list is short enough
   to read. No ceiling, no cap, no best-dividing anything — that is the
   shelf's job, and this view exists for the days when its judgement is
   in the way rather than helping.

   Two kinds of tag are kept off the offer. One already picked, which
   would do nothing. And one standing on every note still here, which
   would leave the same list under a longer name — but those are named
   in a line underneath rather than dropped in silence, because "all of
   these are also ITEA" is worth knowing and is usually the answer to
   where a tag you were looking for went. */
function trailNotes(){
  if(!trail.length)return store.notes.slice();
  return store.notes.filter(function(n){
    var e=effTags(n);
    return trail.every(function(k){return e.indexOf(k)>=0;});
  });
}
function trailTags(left){
  var picked={};
  trail.forEach(function(k){picked[k]=1;});
  var next=[],whole=[];
  tally(left,picked).forEach(function(t){
    (t.notes.length>=left.length?whole:next).push(t);
  });
  next.sort(function(a,b){
    return b.notes.length-a.notes.length||(a.key<b.key?-1:1);});
  whole.sort(function(a,b){return a.key<b.key?-1:1;});
  return {next:next,whole:whole};
}

function renderTagRail(){
  var left=trailNotes(),t=trailTags(left),q=keyOf(TQ);
  var offer=t.next.filter(function(x){return !q||x.key.indexOf(q)>=0;});
  var h='';
  if(trail.length){
    h+='<div class="nt-rail-h">Narrowed by</div><ul class="nt-shelf-books">';
    trail.forEach(function(k,i){
      h+='<li class="nt-b nt-b-picked on" title="Drop this tag" '
        +'onclick="NT.trailDrop('+i+')">'
        +'<span class="nt-b-name">'+esc(displayFor(k))+'</span>'
        +'<span class="nt-b-x">drop</span></li>';
    });
    h+='</ul>';
  }
  if(trail.length)h+='<div class="nt-rail-h">Then</div>';
  if(offer.length){
    /* The same fold the shelf uses, and for the same reason: thirty tags
       is a scroll rather than a choice, and everything under this list
       — every note, the ties, the footnote — would be below the bottom
       of the column. Not folded while something is typed in the box:
       filtering is already the deliberate narrowing, and hiding half of
       what it found would be answering a question with half an answer. */
    var tfold=!shelfOpen&&!q&&offer.length>FOLD+2;
    h+='<ul class="nt-shelf-books">';
    (tfold?offer.slice(0,FOLD):offer).forEach(function(x){
      h+='<li class="nt-b" onclick="NT.trailPick(\''+jsq(x.key)+'\')">'
        +'<span class="nt-b-name">'+esc(x.display)+'</span>'
        +'<span class="nt-b-n">'+x.notes.length+'</span></li>';
    });
    h+='</ul>';
    if(tfold){
      h+='<button class="nt-more" onclick="NT.morebooks()">… and '
        +(offer.length-FOLD)+' more tags</button>';
    }else if(shelfOpen&&!q&&offer.length>FOLD+2){
      h+='<button class="nt-more" onclick="NT.morebooks()">show fewer</button>';
    }
  }else{
    h+='<div class="nt-shelf-note">'
      +(q?'No tag like that on what is left.'
         :'Nothing here narrows any further.')+'</div>';
  }
  h+='<div class="nt-shelf-split"></div>';
  h+='<div class="nt-b nt-b-special'+(!trail.length&&cur==='*'&&!SQ?' on':'')
    +'" onclick="NT.trailClear()">'
    +'<span class="nt-b-name">Every note</span>'
    +'<span class="nt-b-n">'+store.notes.length+'</span></div>';
  if(SHELF.untagged.length){
    h+='<div class="nt-b nt-b-special'+(cur==='~'&&!SQ?' on':'')
      +'" onclick="NT.openBook(\'~\')">'
      +'<span class="nt-b-name">Untagged</span>'
      +'<span class="nt-b-n">'+SHELF.untagged.length+'</span></div>';
  }
  h+='<div class="nt-b nt-b-special'+(cur==='&'&&!SQ?' on':'')
    +'" onclick="NT.openBook(\'&\')">'
    +'<span class="nt-b-name">How tags relate</span>'
    +'<span class="nt-b-n">'+(tiesOf().length||'')+'</span></div>';
  if(t.whole.length){
    h+='<div class="nt-shelf-note">All of these are also: '
      +t.whole.map(function(x){return esc(x.display);}).join(', ')+'.</div>';
  }
  el('nt-books-wrap').innerHTML=h;
}

/* ══ THE SHELF, DRAWN ═════════════════════════════════════════════════ */
var FOLD=10;
function renderShelf(){
  /* The heading and the box under it are furniture in the view, standing
     outside this repaint so that typing in the box survives it — which
     means the two words on them are the one thing the switch has to
     reach up and change by hand. */
  var isTags=store.view==='tags';
  var hd=el('nt-shelf-h'),mk=el('nt-make');
  if(hd)hd.textContent=isTags?'Tags':'The shelf';
  if(mk){
    mk.placeholder=isTags?'narrow by a tag…':'make a book from a tag…';
    mk.setAttribute('aria-label',
      isTags?'Narrow by a tag':'Make a book from a tag');
  }
  if(isTags){renderTagRail();return;}
  var list=SHELF.books;
  var fold=!shelfOpen&&list.length>FOLD+2;
  var shown=fold?list.slice(0,FOLD):list;
  /* The book being read always stands on the shelf, even when the fold
     would have hidden it. Pressing a tag can land you in a book that is
     eleventh by rank, and a lit spine is the only thing saying where you
     are — the fold is there to shorten a list, not to lose your place. */
  if(fold&&cur!=='*'&&cur!=='~'&&cur!=='+'&&!SQ){
    var open=null;
    list.forEach(function(b){if(b.key===cur)open=b;});
    if(open&&shown.indexOf(open)<0)shown=shown.concat([open]);
  }
  /* the heading and the make-a-book bar are furniture in the view and
     stand outside this repaint, so typing in the bar survives it */
  var h='<ul class="nt-shelf-books" id="nt-books">';
  shown.forEach(function(b){
    h+='<li class="nt-b'+(cur===b.key&&!SQ?' on':'')+'" data-key="'+esc(b.key)+'"'
      +' onclick="NT.openBook(\''+jsq(b.key)+'\')">'
      +'<span class="nt-grip" title="Drag to reorder">⣿</span>'
      +'<span class="nt-b-name">'+esc(b.display)+'</span>'
      +'<span class="nt-b-n">'+b.notes.length+'</span></li>';
  });
  h+='</ul>';
  /* A book made on the fly stands here while it is open and nowhere
     after: it is not on the shelf, it is in hand. Shown all the same,
     because a book you are reading with nothing lit beside it leaves
     you unable to say where you are. */
  if(curTemp&&!SQ){
    h+='<div class="nt-b nt-b-hand on" onclick="NT.openBook(\'*\')" '
      +'title="Made from a tag, and kept nowhere — press to put it down">'
      +'<span class="nt-b-name">'+esc(displayFor(cur))+'</span>'
      +'<span class="nt-b-put">put down</span></div>';
  }
  if(fold){
    h+='<button class="nt-more" onclick="NT.morebooks()">… and '
      +(list.length-FOLD)+' more books</button>';
  }else if(shelfOpen&&list.length>FOLD+2){
    h+='<button class="nt-more" onclick="NT.morebooks()">show fewer</button>';
  }
  h+='<div class="nt-shelf-split"></div>';
  h+='<div class="nt-b nt-b-special'+(cur==='*'&&!SQ?' on':'')+'" onclick="NT.openBook(\'*\')">'
    +'<span class="nt-b-name">Every note</span>'
    +'<span class="nt-b-n">'+store.notes.length+'</span></div>';
  if(SHELF.untagged.length){
    h+='<div class="nt-b nt-b-special'+(cur==='~'&&!SQ?' on':'')+'" onclick="NT.openBook(\'~\')">'
      +'<span class="nt-b-name">Untagged</span>'
      +'<span class="nt-b-n">'+SHELF.untagged.length+'</span></div>';
  }
  /* A standing entry rather than a dialog: how the tags relate is a
     lasting fact about the shelf, so it belongs among the shelf's other
     standing entries and not behind a button somewhere. */
  h+='<div class="nt-b nt-b-special'+(cur==='&'&&!SQ?' on':'')
    +'" onclick="NT.openBook(\'&\')">'
    +'<span class="nt-b-name">How tags relate</span>'
    +'<span class="nt-b-n">'+(tiesOf().length||'')+'</span></div>';
  el('nt-books-wrap').innerHTML=h;
  wireDrag();
}
NT.morebooks=function(){shelfOpen=!shelfOpen;renderShelf();};

/* Reordering is a pointer drag on the grip, not HTML5 drag-and-drop,
   because the room has to work on an iPad and native DnD there does
   not. The moves and the release are listened for on the document —
   which the Hub routes to the real one, gated on this room being
   visible — and not with pointer capture on the grip: reordering moves
   the dragged row in the DOM, and moving a captured element releases
   its capture mid-drag, which is exactly the bug this comment replaced. */
function wireDrag(){
  var list=el('nt-books');
  if(!list)return;
  [].forEach.call(list.querySelectorAll('.nt-grip'),function(g){
    g.addEventListener('pointerdown',function(e){
      e.preventDefault();
      e.stopPropagation();
      var row=g.parentNode;
      row.classList.add('dragging');
      var moved=false;
      function move(ev){
        var over=document.elementFromPoint(ev.clientX,ev.clientY);
        over=over&&over.closest?over.closest('.nt-b[data-key]'):null;
        if(!over||over===row||over.parentNode!==list)return;
        var r=over.getBoundingClientRect();
        list.insertBefore(row,(ev.clientY<r.top+r.height/2)?over:over.nextSibling);
        moved=true;
      }
      function up(){
        document.removeEventListener('pointermove',move);
        document.removeEventListener('pointerup',up);
        document.removeEventListener('pointercancel',up);
        row.classList.remove('dragging');
        if(!moved)return;
        /* The visible spines take the dragged order; everything the fold
           or the arithmetic is currently hiding — later books, and books
           that have stopped earning — keeps its old relative place after
           them, so a drag among ten spines never forgets the rest. */
        var order=[].map.call(list.querySelectorAll('.nt-b[data-key]'),
          function(x){return x.getAttribute('data-key');});
        SHELF.books.forEach(function(b){
          if(order.indexOf(b.key)<0)order.push(b.key);});
        store.shelf.forEach(function(k){
          if(order.indexOf(k)<0)order.push(k);});
        store.shelf=order;
        save(true);
      }
      document.addEventListener('pointermove',move);
      document.addEventListener('pointerup',up);
      document.addEventListener('pointercancel',up);
    });
  });
}

/* ══ THE OPEN BOOK, DRAWN ═════════════════════════════════════════════
   Every view — a book's page, the flat lists, search results — is the
   same sheet of rows, and a row is a coloured rail, a name, and the
   note pills. The open note's panel balloons inside whichever row was
   pressed; because a note can stand in several rows at once, the slot —
   which row instance — travels with the click. */
function recent(list){return list.slice().sort(function(a,b){
  return (b.edited||0)-(a.edited||0);});}
function preview(n){
  var t=toText(n.body).replace(/\s+/g,' ').trim();
  return t.length>110?t.slice(0,110)+'…':t;
}

/* A pushpin, drawn rather than typed: the pin characters are missing from
   enough fonts that one of them would show as a box on the iPad and be
   the only unreadable thing in the room. Filled means fixed. */
function pinIcon(on){
  return '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" '
    +'fill="'+(on?'currentColor':'none')+'" stroke="currentColor" '
    +'stroke-width="1.2">'
    +'<circle cx="6" cy="4" r="3"></circle>'
    +'<path d="M6 7.2 L6 11.2" stroke-linecap="round"></path></svg>';
}
function pinBtn(kind,sub,key,on,what){
  return '<button class="nt-pin'+(on?' on':'')+'" type="button" '
    +'title="'+(on?'Let ':'Keep ')+esc(what)+(on?' find its own place again':' where it is')+'" '
    +'aria-pressed="'+(on?'true':'false')+'" '
    +'onclick="NT.pin(\''+kind+'\',\''+jsq(sub||'')+'\',\''+jsq(key)+'\');'
    +'event.stopPropagation()">'+pinIcon(on)+'</button>';
}

function pillHTML(n,slot,arr){
  var on=panel.id===n.id&&panel.slot===slot;
  var name=n.title&&n.title.trim()?esc(n.title):'<i>Untitled</i>';
  var tip=esc((n.title||'Untitled')+' — '+fmtDate(n.edited||n.created));
  var pv=preview(n);
  if(pv)tip+='\n'+esc(pv);
  tip+='\nctrl-click to copy the whole note';
  /* The name is wrapped rather than sitting loose in the pill because the
     title box writes it live as it is typed, and the pin beside it in
     arrange mode would go with it if the whole pill were rewritten.
     A nut sat here for a day, before every note; it came off on
     2026-09-04 because a mark on everything is a bullet point. */
  return '<span class="nt-pill'+(on?' on':'')+'" data-id="'+esc(n.id)+'" '
    +'role="button" tabindex="0" title="'+tip+'" '
    +'onclick="NT.pillClick(event,\''+jsq(n.id)+'\',\''+jsq(slot)+'\')" '
    +'onkeydown="if(event.key===\'Enter\')NT.open(\''+jsq(n.id)+'\',\''+jsq(slot)+'\')">'
    +'<span class="nt-pill-nm">'+name+'</span>'
    +(arr?pinBtn('notes',slot,n.id,isPinned(cur,'notes',slot,n.id),'this note'):'')
    +'</span>';
}

/* Three columns, always the same three: the name in a measured column,
   the notes, and the row's own tally at the right edge. It was a flex run
   before, so a row's notes began wherever that row's name happened to
   end — four names, four starting points, and a sheet that read as
   rubble. A month row is the same three columns as a tag row, because it
   is the same row and drawing it differently was only ever an accident of
   the name being shorter.

   A row with nothing to name — a small book that earned no divisions at
   all — drops the column rather than leaving 150 pixels of nothing at the
   left of every line. */
function rowHTML(r,arr){
  var bare=(r.label==null);
  var h='<div class="nt-rowline'+(r.cls||'')+(bare?' nt-row-bare':'')
    +'" style="--rt-col:'+r.color+'">';
  if(!bare){
    /* A row named after a tag is a way in as well as a heading: pressing
       it makes that tag's own book on the spot. Rows that are a month or
       the leftovers name no tag and stay plain text. */
    h+=r.key
      ? '<span class="nt-row-name nt-row-open" role="button" tabindex="0" '
        +'title="Open everything tagged ‘'+esc(r.label)+'’ as a book" '
        +'onclick="NT.openTag(\''+jsq(r.key)+'\')" '
        +'onkeydown="if(event.key===\'Enter\')NT.openTag(\''+jsq(r.key)+'\')">'
        +esc(r.label)+'</span>'
      : '<span class="nt-row-name">'+esc(r.label)+'</span>';
  }
  var list=recent(r.notes);
  if(inBook())list=applyPins(list,pinList(cur,'notes',r.slot),
    function(n){return n.id;});
  h+='<div class="nt-pills">'
    +list.map(function(n){return pillHTML(n,r.slot,arr);}).join('')
    +'</div><div class="nt-rowend">';
  if(arr&&r.pkey){
    if(r.key)h+='<button class="nt-sw-btn" type="button" '
      +'title="The colour of this row" aria-label="Choose this row’s colour" '
      +'onclick="NT.swatches(this,\''+jsq(r.key)+'\');'
      +'event.stopPropagation()"></button>';
    h+=pinBtn('rows',r.page||'',r.pkey,
        isPinned(cur,'rows',r.page||'',r.pkey),'this row');
  }
  h+='<span class="nt-rown">'+r.notes.length+'</span></div>';
  if(panel.id&&panel.slot===r.slot){
    var n=byId(panel.id);
    if(n&&r.notes.indexOf(n)>=0)h+=panelHTML(n);
  }
  return h+'</div>';
}

/* rows for a set of notes divided by its tags — a book's page, or the
   whole of a small book */
function tagRows(notes,skip,slotPrefix,minN,ctx,page){
  var d=subdivide(notes,skip,minN,MAX_ROWS,0,ctx),rows=[];
  d.groups.forEach(function(g){
    rows.push({slot:slotPrefix+'|'+g.key,label:g.display,key:g.key,
      pkey:g.key,page:page,color:tagColor(g.key),notes:g.notes});
  });
  if(d.groups.length&&d.rest.length){
    rows.push({slot:slotPrefix+'|',label:'the rest',color:'#8A7648',
      pkey:'*rest',page:page,notes:d.rest,cls:' nt-row-rest'});
  }
  if(!d.groups.length){
    rows.push({slot:slotPrefix+'|',label:null,color:'#C9A84C',notes:notes});
  }
  return rows;
}
/* rows for a flat list — every note, the untagged, search results —
   grouped by month, newest first, so the sheet shape holds everywhere */
function monthRows(notes){
  var m={},order=[];
  recent(notes).forEach(function(n){
    var d=new Date(n.edited||n.created);
    var k=d.getFullYear()+'-'+d.getMonth();
    if(!m[k]){
      var label=MONF[d.getMonth()]
        +(d.getFullYear()===new Date().getFullYear()?'':' '+d.getFullYear());
      m[k]={slot:'m|'+k,label:label,color:'#C9A84C',notes:[]};
      order.push(m[k]);
    }
    m[k].notes.push(n);
  });
  return order;
}

function headHTML(name,count,plain){
  return '<div class="nt-head"><span class="nt-rule"></span>'
    +(plain?'':'<span class="nt-fl">❧</span>')
    +'<span class="nt-head-name'+(plain?' nt-plain':'')+'">'+esc(name)+'</span>'
    +(plain?'':'<span class="nt-fl">❧</span>')
    +'<span class="nt-head-n">'+count+'</span>'
    +'<span class="nt-rule"></span></div>';
}

function renderBook(){
  var box=el('nt-book');
  if(!store.notes.length&&!SQ){
    box.innerHTML='<div class="nt-empty">'
      +'<span class="nt-nut" aria-hidden="true"></span>'
      +'<h2>An empty shelf</h2>'
      +'<p>One nut, and nowhere to put it yet. A note here is a title, a body '
      +'and its tags — nothing is filed by hand. Once notes carry tags the '
      +'shelf on the left builds itself: the tag that best divides them '
      +'becomes a book, its pages and rows follow the same rule, and a note '
      +'stands everywhere its tags put it.</p>'
      +'<button onclick="NT.newNote()">Write the first note</button></div>';
    return;
  }

  var head='',tabs='',rows,noTabs=true;
  var book=inBook(),arr=arranging&&book,openPage='*all';
  /* A note being written, alone on its own sheet. Checked before
     everything else, because it is not a view of the notes at all — it is
     one note, standing where the sheet usually is. */
  var beingWritten=writing&&panel.id===writing&&byId(writing);
  if(beingWritten){
    head=headHTML('A new note','',true);
    rows=[{slot:'new|',label:null,color:'#C9A84C',notes:[beingWritten],
      cls:' nt-row-solo'}];
    panel={id:beingWritten.id,slot:'new|'};
    box.innerHTML=head
      +'<div class="nt-sheet nt-notabs">'
      +rowHTML(rows[0],false)
      /* no tally: "1 row · 1 note" about a note you are looking at is a
         count of the obvious. The colophon stays, because the sheet is
         still a sheet. */
      +'<div class="nt-sheet-foot">'
      +'<span class="nt-nut" aria-hidden="true"></span></div>'
      +'</div><div class="nt-leaves" aria-hidden="true"></div>';
    panelFresh=false;
    return;
  }
  if(writing)writing=null;   /* the note was deleted out from under it */
  if(SQ){
    var q=SQ.toLowerCase(),hits=[];
    store.notes.forEach(function(n){
      if((n.title||'').toLowerCase().indexOf(q)>=0
        ||(n.tags||[]).map(keyOf).join(' ').indexOf(q)>=0
        ||toText(n.body).toLowerCase().indexOf(q)>=0)hits.push(n);
    });
    head=headHTML('“'+SQ+'”',hits.length+' found',true);
    /* An empty sheet with a foot reading "0 rows · 0 notes" is a correct
       answer that looks like a broken one. This is the one place in the
       room where there is nothing else to read, so it is where the joke
       costs nothing. */
    if(!hits.length){
      box.innerHTML=head
        +'<div class="nt-sheet nt-notabs"><div class="nt-nothing">'
        +'<span class="nt-nut" aria-hidden="true"></span>Nothing. Not a nut.'
        +'</div></div><div class="nt-leaves" aria-hidden="true"></div>';
      return;
    }
    rows=monthRows(hits);
  }else if(cur==='&'){
    /* Two standing pages that belong to neither view and so are checked
       before the fork: the untagged are untagged whichever way you came
       looking, and how tags relate is a fact about both. */
    box.innerHTML=tiesHTML();
    return;
  }else if(cur==='~'){
    /* A squirrel buries far more than it digs up again, which is exactly
       what an untagged note is. The old line said what to do about it;
       the shelf's own emptiness says that already. */
    head=headHTML('Untagged',SHELF.untagged.length
      +' — buried, and not yet dug up',true);
    rows=monthRows(SHELF.untagged);
  }else if(store.view==='tags'){
    var left=trailNotes();
    head=headHTML(trail.length?trail.map(displayFor).join('  ·  '):'Every note',
      left.length+(left.length===1?' note':' notes'),true);
    /* Months are how an undivided pile of notes is made readable, and
       once a tag has been picked the pile is already divided — by the
       tag, which is the division that was asked for. Mark had them in
       both and wanted them only in the first: a HORIZON list broken into
       September, August and May answers a question nobody asked here,
       and puts four headings between him and six notes. */
    rows=trail.length
      ?[{slot:'t|',label:null,color:'#C9A84C',notes:recent(left)}]
      :monthRows(left);
  }else if(cur==='*'){
    head=headHTML('Every note',store.notes.length+' notes',true);
    rows=monthRows(store.notes);
  }else{
    var b=null;
    SHELF.books.forEach(function(x){if(x.key===cur)b=x;});
    if(!b){
      /* a book made on the fly — the tag never earned a spine, so its
         book is built here, now, out of whatever carries the tag, and
         is kept nowhere afterwards */
      var hits=taggedWith(cur);
      if(hits.length)b={key:cur,display:displayFor(cur),notes:hits};
    }
    if(!b){cur='*';curTemp=false;renderBook();renderShelf();return;}
    head=headHTML(b.display,b.notes.length+' notes'
      +(curTemp?' · made from a tag':''),false);
    var skip=barredBy([b.key]);
    var pages=subdivide(b.notes,skip,PAGE_AT,MAX_TABS,
      Math.max(PAGE_MIN,Math.ceil(PAGE_SHARE*b.notes.length)),[b.key]);
    /* One page and a remainder is the book again under two names — but
       not when that page was declared a kind of this book. There it is
       the book saying which part of itself it is, which is the whole
       point of having said so. */
    if(pages.groups.length<2
      &&!(pages.groups.length===1&&(NARROW[b.key]||{})[pages.groups[0].key]))
      pages={groups:[],rest:b.notes.slice()};
    if(pages.groups.length){
      noTabs=false;
      /* The rest joins the strip as an ordinary tab here rather than being
         appended after it, so that a pin can move it like any other — the
         leftovers of a book Mark reads first are still what he reads
         first. */
      var strip=pages.groups.map(function(p){
        return {key:p.key,display:p.display,notes:p.notes,
          color:tagColor(p.key)};});
      if(pages.rest.length)strip.push({key:'*rest',display:'the rest',
        notes:pages.rest,color:'#8A7648',rest:true});
      strip=applyPins(strip,pinList(cur,'pages'),function(p){return p.key;});
      var keys=strip.map(function(p){return p.key;});
      if(keys.indexOf(curPage)<0)curPage=keys[0];
      tabs='<div class="nt-tabsrow" role="tablist">'
        +strip.map(function(p){
          var on=p.key===curPage;
          return '<div class="nt-ptab'+(on?' on':'')+(p.rest?' nt-ptab-rest':'')
            +'" role="tab" '
            +'aria-selected="'+(on?'true':'false')+'" tabindex="0" '
            +'style="--pg-col:'+p.color+'" '
            +'onclick="NT.openPage(\''+jsq(p.key)+'\')" '
            +'onkeydown="if(event.key===\'Enter\')NT.openPage(\''+jsq(p.key)+'\')">'
            +(arr&&!p.rest
              ?'<button class="nt-sw-btn nt-ptab-sw" type="button" '
                +'title="The colour of this page" '
                +'aria-label="Choose this page’s colour" '
                +'onclick="NT.swatches(this,\''+jsq(p.key)+'\');'
                +'event.stopPropagation()"></button>'
              :'<span class="nt-ptab-dot"></span>')
            +esc(p.display)+'<i>'+p.notes.length+'</i>'
            +(arr?pinBtn('pages','',p.key,isPinned(cur,'pages','',p.key),
                'this page'):'')
            +'</div>';
        }).join('')
        +'</div>';
      var open=null;
      strip.forEach(function(p){if(p.key===curPage&&!p.rest)open=p;});
      var openNotes=open?open.notes:pages.rest;
      openPage=open?open.key:'*rest';
      rows=tagRows(openNotes,barredBy([b.key,open&&open.key]),
        'p|'+openPage,ROW_AT,[b.key,open&&open.key],openPage);
    }else{
      rows=tagRows(b.notes,skip,'p|*all',ROW_AT,[b.key],'*all');
    }
    rows=applyPins(rows,pinList(cur,'rows',openPage||'*all'),
      function(r){return r.pkey;});
  }

  /* The open note follows its row. A structural change — a tag added or
     dropped inside the panel — can dissolve the row that was hosting it,
     and the honest thing is for the panel to travel with the note to
     wherever the arithmetic now files it, not to vanish mid-edit. If the
     note is nowhere in this view at all, the panel closes. */
  if(panel.id){
    var hosts=rows.filter(function(r){
      return r.notes.some(function(n){return n.id===panel.id;});});
    if(!hosts.length){panel.id=null;panel.slot=null;}
    else if(!hosts.some(function(r){return r.slot===panel.slot;}))
      panel.slot=hosts[0].slot;
  }

  var total=0;rows.forEach(function(r){total+=r.notes.length;});
  /* The foot is the book's running folio — what page of what you are on,
     set the way a printed book sets it — and, in a book, the one way into
     arranging it. */
  var pins=book?pinTotal(cur):0;
  var foot='<div class="nt-sheet-foot">';
  if(book){
    foot+='<button class="nt-arrange'+(arr?' on':'')+'" type="button" '
      +'aria-pressed="'+(arr?'true':'false')+'" onclick="NT.arrange()">'
      +pinIcon(pins>0)+(arr?'done':'arrange')
      +(pins&&!arr?'<i>'+pins+'</i>':'')+'</button>';
  }
  /* One nut closes the tally, where a printed book puts its printer's
     device. On the Untagged sheet it is half-faded and says why. */
  var buried=(cur==='~'&&!SQ);
  foot+='<span class="nt-folio">'+rows.length+(rows.length===1?' row':' rows')
    +' · '+total+(total===1?' note':' notes')+'</span>'
    +'<span class="nt-nut'+(buried?' nt-nut-faded':'')+'" aria-hidden="true"'
    +(buried?' title="A squirrel forgets about a quarter of them."':'')
    +'></span></div>';
  var say=arr
    ? '<div class="nt-arrange-say">Press a pin to keep a page, a row or a '
      +'note where it is — the first thing you pin takes first place, the '
      +'next takes second, and the rest follow as they come. Press the '
      +'round swatch to give a row its own colour.</div>'
    : '';
  box.innerHTML=head+tabs
    +'<div class="nt-sheet'+(noTabs?' nt-notabs':'')+'">'
    +say
    +rows.map(function(r){return rowHTML(r,arr);}).join('')
    +foot
    +'</div><div class="nt-leaves" aria-hidden="true"></div>';
  panelFresh=false;
}

/* ── arranging, and the colours ──
   Both live on the sheet rather than in a dialog, for the same reason the
   ties page does: which row is which colour and which of them stays put
   are lasting facts about this book, and the place to state a fact about
   a thing is on the thing. */
NT.arrange=function(){
  if(!inBook())return;
  arranging=!arranging;
  closePop();
  renderBook();
};
NT.swatches=function(btn,key){
  var now=(store.colors||{})[key]||'';
  var h='<div class="nt-swatches">';
  CHOICES.forEach(function(c){
    h+='<button class="nt-sw'+(now===c?' on':'')+'" type="button" '
      +'style="--sw:'+c+'" aria-label="'+c+'" title="'+c+'" '
      +'onclick="NT.colour(\''+jsq(key)+'\',\''+c+'\')"></button>';
  });
  h+='</div><div class="nt-pop-row nt-sw-auto'+(now?'':' sel')+'" '
    +'onclick="NT.colour(\''+jsq(key)+'\',\'\')">'
    +'the colour the room picks</div>';
  popKind='colour';popRows=[];popSel=-1;
  openPop(btn,h);
};
NT.colour=function(key,c){
  if(c)(store.colors||(store.colors={}))[key]=c;
  else if(store.colors)delete store.colors[key];
  closePop();
  save(true);
};

/* ══ HOW TAGS RELATE, DRAWN ═══════════════════════════════════════════
   Its own page rather than a dialog, because a tie is a lasting fact
   about the shelf. Each line reads as the sentence it is — "ITEA is a
   kind of industrial grants" — so nobody has to remember which way round
   the pair was typed, which is the whole failing of a two-column table
   of relations. */
var tieKind='under', tieA='', tieB='';

function tiesHTML(){
  var ties=tiesOf();
  var h=headHTML('How tags relate',
    ties.length+(ties.length===1?' tie':' ties'),true);
  h+='<div class="nt-sheet nt-notabs">'
    +'<div class="nt-tie-new">'
    +'<input id="nt-tie-a" class="nt-tie-in" placeholder="a tag…"'
      +' autocomplete="off" spellcheck="false" value="'+esc(tieA)+'"'
      +' oninput="NT.tieSuggest(\'a\')" onfocus="NT.tieSuggest(\'a\')"'
      +' onkeydown="NT.tieKey(event,\'a\')">'
    +'<span class="seg nt-tie-seg" role="group" aria-label="Which relation">'
    +'<button id="nt-tie-under" onclick="NT.tieMode(\'under\')"'
      +(tieKind==='under'?' class="on" aria-pressed="true"':' aria-pressed="false"')
      +'>is a kind of</button>'
    +'<button id="nt-tie-same" onclick="NT.tieMode(\'same\')"'
      +(tieKind==='same'?' class="on" aria-pressed="true"':' aria-pressed="false"')
      +'>is the same kind as</button>'
    +'</span>'
    +'<input id="nt-tie-b" class="nt-tie-in" placeholder="another tag…"'
      +' autocomplete="off" spellcheck="false" value="'+esc(tieB)+'"'
      +' oninput="NT.tieSuggest(\'b\')" onfocus="NT.tieSuggest(\'b\')"'
      +' onkeydown="NT.tieKey(event,\'b\')">'
    +'<button class="nt-tie-add" onclick="NT.tieAdd()">Tie</button>'
    +'</div>';
  if(!ties.length){
    h+='<div class="nt-tie-empty">Nothing tied yet. Two tags of '
      +'<b>the same kind</b> — <i>ITEA</i> and <i>Chips JU</i>, say, both '
      +'a sort of call — stop dividing each other, so neither turns up as '
      +'a page or a row inside the other’s book.<br><br>'
      +'<b>A kind of</b> goes further. If <i>ITEA</i> is a kind of '
      +'<i>industrial grants</i>, then every note tagged ITEA counts as an '
      +'industrial grant too — so an <i>ITEA</i> page can stand inside the '
      +'<i>industrial grants</i> book, and <i>industrial grants</i> never '
      +'appears inside <i>ITEA</i>, where it would group nothing.</div>';
  }else{
    h+='<ul class="nt-ties">';
    ties.forEach(function(t,i){
      h+='<li class="nt-tie">'
        +'<span class="nt-tie-tag" onclick="NT.openTag(\''+jsq(displayFor(t.a))+'\')">'
        +esc(displayFor(t.a))+'</span>'
        +'<span class="nt-tie-verb">'
        +(t.kind==='same'?'is the same kind as':'is a kind of')+'</span>'
        +'<span class="nt-tie-tag" onclick="NT.openTag(\''+jsq(displayFor(t.b))+'\')">'
        +esc(displayFor(t.b))+'</span>'
        +'<button class="nt-tie-del" onclick="NT.tieDrop('+i+')"'
        +' aria-label="Untie">×</button></li>';
    });
    h+='</ul>';
  }
  return h+'</div>';
}
NT.tieMode=function(k){tieKind=(k==='same')?'same':'under';renderBook();};
/* The two boxes suggest over the tags that exist, as the box a book is
   made in does — but a tie may name a tag no note carries yet, so
   whatever is typed is allowed to stand. */
NT.tieSuggest=function(which){
  var inp=el('nt-tie-'+which);
  if(!inp)return;
  if(which==='a')tieA=inp.value; else tieB=inp.value;
  var q=keyOf(inp.value);
  var opts=tally(store.notes,{}).filter(function(t){
    return !q||t.key.indexOf(q)>=0;});
  opts.sort(function(a,b){return b.notes.length-a.notes.length
    ||(a.key<b.key?-1:1);});
  popRows=[];
  var h='';
  opts.slice(0,8).forEach(function(t){
    var i=popRows.length;
    popRows.push({tag:t.display});
    h+='<div class="nt-pop-row" onclick="NT.tiePick(\''+jsq(which)+'\','+i+')">'
      +esc(t.display)+'<span class="nt-pop-n">'+t.notes.length+'</span></div>';
  });
  if(!popRows.length){closePop();return;}
  popKind='tie';popSel=0;
  openPop(inp,h);
  markSel();
};
NT.tiePick=function(which,i){
  var inp=el('nt-tie-'+which);
  if(!inp||!popRows[i])return;
  inp.value=popRows[i].tag;
  if(which==='a')tieA=inp.value; else tieB=inp.value;
  closePop();
  inp.focus();
};
NT.tieKey=function(e,which){
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    if(popKind!=='tie'||!popRows.length)return;
    e.preventDefault();
    popSel=(popSel+(e.key==='ArrowDown'?1:popRows.length-1))%popRows.length;
    markSel();
    return;
  }
  if(e.key==='Enter'){
    e.preventDefault();
    if(popKind==='tie'&&popSel>=0&&popRows[popSel]){NT.tiePick(which,popSel);return;}
    if(which==='a'){closePop();var nb=el('nt-tie-b');if(nb)nb.focus();}
    else NT.tieAdd();
    return;
  }
  if(e.key==='Escape'&&!el('nt-pop').hidden){e.stopPropagation();closePop();}
};
NT.tieAdd=function(){
  closePop();
  var a=keyOf(tieA),b=keyOf(tieB);
  if(!a||!b){Hub.note('Name both tags first.',4000);return;}
  if(a===b){Hub.note('A tag is already itself.',4000);return;}
  var ties=tiesOf();
  var had=ties.some(function(t){
    return t.kind===tieKind&&((t.a===a&&t.b===b)
      ||(tieKind==='same'&&t.a===b&&t.b===a));
  });
  if(had){Hub.note('Those two are tied that way already.',4000);return;}
  /* The same pair said a second way is not a second fact but a
     contradiction, so the older reading goes rather than both standing. */
  store.ties=ties.filter(function(t){
    return !((t.a===a&&t.b===b)||(t.a===b&&t.b===a));
  });
  store.ties.push({a:a,b:b,kind:tieKind,aDisp:dispOf(tieA),bDisp:dispOf(tieB)});
  tieA='';tieB='';
  save(true);
};
NT.tieDrop=function(i){
  var ties=tiesOf();
  if(i<0||i>=ties.length)return;
  ties.splice(i,1);
  save(true);
};

NT.search=debounce(function(v){SQ=String(v||'').trim();
  panel={id:null,slot:null};renderBook();renderShelf();},160);
NT.openBook=function(k){
  cur=k;curTemp=false;SQ='';el('nt-search').value='';curPage=null;
  closePop();
  panel={id:null,slot:null};
  render();
  document.body.scrollTop=0;   /* the pane is the room's body and its scroller */
};
/* A book made by pressing a tag. A tag that has earned a spine opens the
   spine — pressing 'writing' should land you in the Writing everyone can
   see, not beside it — and any other tag gets a book built on the spot
   and kept nowhere.

   The note you pressed the tag inside carries that tag, so it is in the
   book about to open: it stays open and travels to whichever row now
   holds it, rather than closing under you. */
NT.openTag=function(tag){
  var k=keyOf(tag);
  if(!k||!taggedWith(k).length)return;
  var earned=false;
  SHELF.books.forEach(function(b){if(b.key===k)earned=true;});
  cur=k;curTemp=!earned;SQ='';el('nt-search').value='';curPage=null;
  /* the note stays open, but it is no longer being written on a sheet of
     its own — this is a move to a book, with the note carried into it */
  writing=null;
  panel.slot=null;
  render();
  el('nt-make').value='';
  document.body.scrollTop=0;
};

/* ── the bar a book is made in ──
   Type a tag and press Enter; the book is built out of whatever carries
   that tag and kept nowhere. Free text with autocomplete over the tags
   that exist, like the tag box in a note — but only over tags that
   exist, because a tag no note carries has no book to make. */
NT.makeSuggest=function(){
  var inp=el('nt-make');
  if(!inp)return;
  /* Same box, other view, other job: there it makes a book, here it
     shortens the list of tags left to pick from. No popup for that one
     — the list it filters is already on screen underneath. */
  if(store.view==='tags'){TQ=inp.value;closePop();renderShelf();return;}
  var q=keyOf(inp.value);
  var opts=tally(store.notes,{}).filter(function(t){
    return !q||t.key.indexOf(q)>=0;});
  opts.sort(function(a,b){
    /* what was typed, if it is a whole tag, before anything it is merely
       the start of */
    var ea=(a.key===q)?1:0,eb=(b.key===q)?1:0;
    return eb-ea||b.notes.length-a.notes.length||(a.key<b.key?-1:1);
  });
  opts=opts.slice(0,9);
  popRows=[];
  var h='';
  opts.forEach(function(t){
    var i=popRows.length;
    popRows.push({tag:t.display});
    h+='<div class="nt-pop-row" onclick="NT.makePick('+i+')">'+esc(t.display)
      +'<span class="nt-pop-n">'+t.notes.length+'</span></div>';
  });
  if(!popRows.length){
    h='<div class="nt-pop-quiet">No tag like that. A book can only be made '
      +'from a tag some note already carries.</div>';
  }
  popKind='make';popSel=popRows.length?0:-1;
  openPop(inp,h);
  markSel();
};
NT.makePick=function(i){if(popRows[i])NT.openTag(popRows[i].tag);};
NT.makeKey=function(e){
  var inp=el('nt-make');
  if(store.view==='tags'){
    if(e.key==='Enter'){
      e.preventDefault();
      var q=keyOf(inp.value);
      var offer=trailTags(trailNotes()).next.filter(function(x){
        return !q||x.key.indexOf(q)>=0;});
      if(offer.length)NT.trailPick(offer[0].key);
      return;
    }
    if(e.key==='Escape'&&inp.value){
      e.stopPropagation();inp.value='';TQ='';renderShelf();
    }
    return;
  }
  if(e.key==='Enter'){
    e.preventDefault();
    if(popKind==='make'&&popSel>=0&&popRows[popSel])NT.openTag(popRows[popSel].tag);
    else NT.openTag(inp.value);
    return;
  }
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    if(popKind!=='make'||!popRows.length)return;
    e.preventDefault();
    popSel=(popSel+(e.key==='ArrowDown'?1:popRows.length-1))%popRows.length;
    markSel();
    var row=el('nt-pop').querySelectorAll('.nt-pop-row')[popSel];
    if(row&&row.scrollIntoView)row.scrollIntoView({block:'nearest'});
    return;
  }
  if(e.key==='Escape'){
    if(!el('nt-pop').hidden){e.stopPropagation();closePop();}
    else inp.value='';
  }
};
NT.openPage=function(k){curPage=k;renderBook();};

/* ── the switch between the two ways in ──
   Switching drops where you had got to on the other side. Coming back to
   the shelf on the book you left is worth something; coming back to a
   trail of four tags picked for a reason you have since forgotten is
   not, and the tags rail says plainly what it is holding, so starting
   again costs one press. */
NT.view=function(v){
  v=(v==='tags')?'tags':'shelf';
  if(store.view===v)return;
  store.view=v;
  trail=[];TQ='';cur='*';curTemp=false;curPage=null;
  SQ='';el('nt-search').value='';
  panel={id:null,slot:null};
  var mk=el('nt-make');if(mk)mk.value='';
  save(true);
  document.body.scrollTop=0;
};
NT.trailPick=function(k){
  k=keyOf(k);
  if(!k||trail.indexOf(k)>=0)return;
  trail.push(k);
  TQ='';cur='*';SQ='';el('nt-search').value='';
  var mk=el('nt-make');if(mk)mk.value='';
  panel={id:null,slot:null};
  closePop();renderShelf();renderBook();
  document.body.scrollTop=0;
};
/* One step out, not everything after it. The trail is an and, not a
   path: having asked for the ITEA notes about budget, dropping ITEA
   leaves a perfectly good question — the budget ones — and throwing
   that away because ITEA was typed first would be arbitrary. */
NT.trailDrop=function(i){
  if(i<0||i>=trail.length)return;
  trail.splice(i,1);
  cur='*';panel={id:null,slot:null};
  closePop();renderShelf();renderBook();
};
NT.trailClear=function(){
  trail=[];TQ='';cur='*';SQ='';el('nt-search').value='';
  var mk=el('nt-make');if(mk)mk.value='';
  panel={id:null,slot:null};
  closePop();renderShelf();renderBook();
};

/* ══ THE BAR'S SMALL TRUTHS ═══════════════════════════════════════════ */
function renderBar(){
  var tags=tally(store.notes,{}).length;
  el('nt-count').textContent=store.notes.length+' notes · '+tags+' tags';
  var sh=el('nt-view-shelf'),tg=el('nt-view-tags'),on=store.view==='tags';
  sh.classList.toggle('on',!on);
  sh.setAttribute('aria-pressed',on?'false':'true');
  tg.classList.toggle('on',on);
  tg.setAttribute('aria-pressed',on?'true':'false');
}
function render(){closePop();renderShelf();renderBook();renderBar();}

/* ══ THE PANEL ════════════════════════════════════════════════════════
   One capsule reads and writes a note, ballooning open under the pill
   that was pressed — the Books page's own gesture. The panel carries
   everything the note is: name, body, tags, and what it points at. */

/* The toolbar is buttons, not a line of prose naming keyboard chords.
   It was that line once, on the Books page's reasoning that the keyboard
   already knows them — and the reasoning does not survive contact: ctrl-B
   reaches an editor only while the caret is already inside it, and
   pressed anywhere else in the room it is the browser's own shortcut for
   bookmarks, which is what Mark got. A button is in the right place
   whatever holds focus, and says what it does without being read.

   Six of the eight are drawn rather than written now. B, I and U are
   letters everywhere and stay letters; “• list”, “1. list”, “link” and
   “unlink” were four words of running text sitting in a row of controls,
   which is what made the strip read as a sentence rather than a tool
   rail. Each is an inline SVG in currentColor, so it takes the button's
   own quiet brass and its hover without a second rule.

   `onmousedown="return false"` on every one of them, because pressing a
   button would otherwise pull focus out of the body — and execCommand
   works on the selection, which by then would be gone. */
var IC_UL='<svg viewBox="0 0 16 13" width="15" height="12" aria-hidden="true" '
  +'fill="currentColor"><circle cx="2" cy="2.4" r="1.6"></circle>'
  +'<circle cx="2" cy="6.5" r="1.6"></circle>'
  +'<circle cx="2" cy="10.6" r="1.6"></circle>'
  +'<rect x="6" y="1.6" width="10" height="1.5"></rect>'
  +'<rect x="6" y="5.7" width="10" height="1.5"></rect>'
  +'<rect x="6" y="9.8" width="10" height="1.5"></rect></svg>';
var IC_OL='<svg viewBox="0 0 16 13" width="15" height="12" aria-hidden="true" '
  +'fill="currentColor"><rect x="6" y="1.6" width="10" height="1.5"></rect>'
  +'<rect x="6" y="5.7" width="10" height="1.5"></rect>'
  +'<rect x="6" y="9.8" width="10" height="1.5"></rect>'
  +'<path d="M1.2 1.5 2.4.9h.5v3.6h-.9V1.9l-.8.4z"></path>'
  +'<path d="M.5 8.6V8c1.6-1.2 2-1.5 2-2 0-.3-.2-.5-.6-.5-.4 0-.6.2-.7.6l-.8-.2c.2-.7.7-1.1 '
  +'1.5-1.1.9 0 1.4.4 1.4 1.1 0 .7-.5 1.1-1.6 1.9h1.7v.8z"></path>'
  +'<path d="M.6 11.9l.8-.2c.1.4.3.6.7.6.4 0 .6-.2.6-.5s-.2-.5-.7-.5h-.4v-.7h.4c.4 0 .6-.2.6-.4 '
  +'0-.3-.2-.4-.5-.4-.3 0-.5.2-.6.5l-.8-.2c.2-.7.7-1 1.4-1 .8 0 1.3.4 1.3 1 0 .4-.2.7-.6.8.5.1.7.4.7.9 '
  +'0 .7-.5 1.1-1.4 1.1-.8 0-1.3-.4-1.5-1z"></path></svg>';
var IC_LINK='<svg viewBox="0 0 16 13" width="15" height="12" aria-hidden="true" '
  +'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">'
  +'<path d="M6.4 8.6 9.6 5.4"></path>'
  +'<path d="M8.6 3.6 10 2.2a2.6 2.6 0 0 1 3.7 3.7l-1.4 1.4"></path>'
  +'<path d="M7.4 9.4 6 10.8a2.6 2.6 0 0 1-3.7-3.7l1.4-1.4"></path></svg>';
var IC_UNLINK='<svg viewBox="0 0 16 13" width="15" height="12" aria-hidden="true" '
  +'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">'
  +'<path d="M8.6 3.6 10 2.2a2.6 2.6 0 0 1 3.7 3.7l-1.4 1.4"></path>'
  +'<path d="M7.4 9.4 6 10.8a2.6 2.6 0 0 1-3.7-3.7l1.4-1.4"></path>'
  +'<path d="M2.4 2.2 13.6 10.8" stroke-width="1.3"></path></svg>';

/* Delete stands at the far end of this same rail rather than on a row of
   its own under it. It was under a rule of its own once, which made the
   old drawer two strips deep for the sake of one button — and a button
   that is the only thing on its row reads as more important than it is.
   Pushed to the right by the rail's own auto margin, so it is as far from
   the formatting buttons as the row allows. The rail is only ever on
   screen while a note is being edited, which is also the only time
   deleting one is a thing you might mean to do. */
function toolsHTML(){
  function b(cmd, label, title, ic) {
    return '<button class="nt-tool'+(ic?' nt-tool-ic':'')+'" '
      +'onmousedown="return false" title="'+esc(title)+'" '
      +'aria-label="'+esc(title)+'" onclick="NT.fmt(\''+cmd+'\')">'+label+'</button>';
  }
  return '<div class="nt-tools">'
    +b('bold','<b>B</b>','Bold')
    +b('italic','<i>I</i>','Italic')
    +b('underline','<u>U</u>','Underline')
    +'<span class="nt-tool-gap"></span>'
    +b('insertUnorderedList',IC_UL,'Bulleted list',1)
    +b('insertOrderedList',IC_OL,'Numbered list',1)
    +'<span class="nt-tool-gap"></span>'
    +'<button class="nt-tool nt-tool-ic" id="nt-link" onmousedown="return false"'
      +' title="Turn the selected words into a link" aria-label="Link"'
      +' onclick="NT.linkBox()">'+IC_LINK+'</button>'
    +b('unlink',IC_UNLINK,'Take the link off the selected words',1)
    +'<button class="nt-del" id="nt-del" onclick="NT.del()">Delete</button>'
    +'</div>';
}

/* ── the panel, and its strip ──
   A note opened is a title, the day it was written, the words, and its
   tags. That is all that is on screen, and none of it takes a caret until
   edit is pressed — a note is a page first and a box second, and a stray
   click in one you were only reading should not change it.

   The stamp is one date. It read "made 6 Sep · edited 8 Sep" until
   2026-09-09; the edited time is still kept, because the shelf sorts on
   it and the cloud compares on it, and it is simply not shown. Two dates
   and two words of running prose were four things to read in the corner
   of a panel, to answer a question — when did I write this — that one
   date answers.

   Pressing edit unrolls the formatting rail as a strip under the head,
   puts the caret in the body, and lets the title be typed in. It was a
   drawer at the foot of the panel until 2026-09-09, one press behind a
   hairline, and it was down there precisely so that nothing came between
   the title and the first line — a reasoning that stops applying once
   the rail is on screen only while you are writing anyway.

   The tags are the exception and stay live in both states: adding a tag
   is filing, not editing, and they are wanted on a note being read as
   much as on one being written. They were hidden away for half a day once
   and came straight back out.

   The strip is always in the DOM and opens by growing, rather than being
   written into the panel when it is asked for. Rendering it on demand
   meant a repaint of the whole sheet on every press, which replayed the
   panel's own balloon and jumped the rows under it in the same frame as
   the rail slid — three movements at once, which is what "jumpy" was.
   Now the press changes a few class names and nothing else moves. */
/* The pencil is drawn rather than written for the same reason the list
   and link buttons are: a word in a row that is otherwise a stamp and a
   × reads as running text. The word "edit" stays beside it, because
   unlike bold and italic this one has no shape anybody already knows. */
var IC_PENCIL='<svg viewBox="0 0 14 14" width="11" height="11" aria-hidden="true" '
  +'fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" '
  +'stroke-linejoin="round"><path d="M9.6 1.9 12.1 4.4 4.6 11.9 1.4 12.6 2.1 9.4z">'
  +'</path></svg>';
function panelHTML(n){
  /* The balloon is how a note arrives, so it plays once — when the note
     is opened — and not on every repaint of the sheet it sits in. It was
     on the panel's own rule, which meant adding a tag or dropping one
     replayed the whole capsule's scaleY under the caret. */
  var h='<div class="nt-panel'+(panelFresh?' nt-panel-new':'')+'">'
    +'<div class="nt-phead">'
      +'<input id="nt-title" class="nt-title" value="'+esc(n.title)+'" '
        +'placeholder="Untitled note" autocomplete="off" '
        +(editing?'':'readonly ')+'oninput="NT.typedTitle()">'
      +'<span class="nt-when">'+esc(fmtDate(n.created))+'</span>'
      +'<button class="nt-edit'+(editing?' on':'')+'" type="button" id="nt-edit" '
        +'aria-pressed="'+(editing?'true':'false')+'" onclick="NT.edit()" '
        +'title="Write in this note" aria-label="Write in this note">'
        +IC_PENCIL+'edit</button>'
      /* the press must not pull the caret out of a note being written */
      +'<button class="nt-copy" type="button" onmousedown="return false" '
        +'onclick="NT.copyNote()" '
        +'title="Copy this whole note, ready to paste elsewhere" '
        +'aria-label="Copy this whole note">'+IC_COPY+'copy</button>'
      +'<button class="nt-x" onclick="NT.close()" aria-label="Close">×</button>'
    +'</div>'
    +'<div class="nt-strip'+(editing?' on':'')+'" id="nt-strip">'
      +'<div class="nt-strip-in">'+toolsHTML()+'</div></div>'
    +'<div id="nt-body" class="nt-body'+(editing?' on':'')+'" '
      +'contenteditable="'+(editing?'true':'false')+'" '
      +'oninput="NT.typedBody()" onblur="NT.leftBody()" '
      +'onclick="NT.openLink(event)" onkeydown="NT.bodyKey(event)" '
      +'onkeyup="NT.tableBar()" onmouseup="NT.tableBar()" '
      +'onpaste="NT.pasteBody(event)" oncopy="NT.copyBody(event)" '
      +'oncut="NT.cutBody(event)">'+(n.body||'')+'</div>'
    +tableBarHTML()
    +'<div class="nt-tagrow" id="nt-tagrow">'+tagChipsHTML(n)+'</div>';
  return h+'</div>';
}
/* A few class names, three attributes and one measurement. Deliberately
   not a render: see the comment above panelHTML for what re-rendering to
   open this cost.

   The height is measured here rather than left to the stylesheet's
   ceiling, because a ceiling has to be generous enough for a fallback
   font that measures taller — and every pixel of that generosity is time
   in which the strip is already fully open and still animating, which is
   what makes one of these feel like it stalls. scrollHeight reports the
   content's height even while max-height is clamping it to nothing, so
   the exact number is there to be had before the growing starts.

   Turning it on ends by putting the caret at the END of the body rather
   than merely focusing it, which lands it at the start: a note reopened
   to be added to is the ordinary case, and having to press ctrl-End
   before typing would be the sort of small tax nobody reports and
   everybody feels. */
NT.edit=function(on){
  editing=(on===undefined)?!editing:!!on;
  var s=el('nt-strip'),b=el('nt-edit'),t=el('nt-title'),y=el('nt-body');
  if(s){
    s.style.maxHeight=editing?(s.scrollHeight+'px'):'0px';
    s.classList.toggle('on',editing);
  }
  if(b){
    b.classList.toggle('on',editing);
    b.setAttribute('aria-pressed',editing?'true':'false');
  }
  if(t)t.readOnly=!editing;
  if(y){
    y.classList.toggle('on',editing);
    y.setAttribute('contenteditable',editing?'true':'false');
    if(editing)caretToEnd(y);
  }
  NT.tableBar();
};
function caretToEnd(node){
  node.focus();
  try{
    var r=document.createRange();
    r.selectNodeContents(node);
    r.collapse(false);
    var sel=window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }catch(e){}
}

NT.open=function(id,slot){
  if(panel.id===id&&panel.slot===slot){NT.close();return;}
  panel={id:id,slot:slot||null};
  writing=null;
  editing=false;panelFresh=true;
  renderBook();
  /* Notes written before addresses were links still hold them as plain
     text, so every body is linkified as it is opened rather than only as
     it is edited — otherwise an old note would need a keystroke before
     its addresses became reachable. */
  var b=el('nt-body');
  if(b&&linkify(b)){dressLinks(b);NT.typedBody();}
  var p=document.querySelector('.nt-panel');
  if(p)p.scrollIntoView({block:'nearest'});
};
NT.close=function(){
  closePop();
  var n=byId(panel.id);
  panel={id:null,slot:null};
  writing=null;
  /* a note abandoned empty — a misclick on + Note — would shelve itself
     into Untagged as clutter, so it leaves with the panel */
  if(n&&!(n.title||'').trim()&&!toText(n.body).trim()
      &&!(n.tags&&n.tags.length)){
    store.notes=store.notes.filter(function(x){return x.id!==n.id;});
  }
  save(true);
};
NT.newNote=function(){
  var n={id:uid(),title:'',body:'',tags:[],
    created:Date.now(),edited:Date.now()};
  store.notes.push(n);
  /* cur, curPage and the search box are left exactly as they are: the
     sheet is taken over rather than navigated away from, so closing the
     note puts back the book that was open without having to remember
     which one it was. */
  writing=n.id;
  panel={id:n.id,slot:'new|'};
  /* Open, unlike every other note — this is the one case where a note is
     on screen because it is about to be written in, so making the writing
     cost a press would be asking a question whose answer is already
     known. The machinery a note opened for READING must not show is the
     rule this does not break: that note still opens shut. */
  editing=true;panelFresh=true;
  save(true);
  document.body.scrollTop=0;
  var t=el('nt-title');
  if(t)t.focus();
};

function touch(n){n.edited=Date.now();}
NT.typedTitle=function(){
  var n=byId(panel.id);if(!n)return;
  n.title=el('nt-title').value;
  touch(n);saveSoon();
  /* the pill is the note's name, so it follows the typing live — every
     pill, because in everywhere-mode the note stands in several rows */
  [].forEach.call(
    document.querySelectorAll('.nt-pill[data-id="'+n.id+'"] .nt-pill-nm'),
    function(p){p.textContent=n.title.trim()||'Untitled';});
};
NT.typedBody=function(){
  var n=byId(panel.id);if(!n)return;
  n.body=el('nt-body').innerHTML;
  touch(n);saveSoon();
};
/* execCommand is deprecated and is still the only thing a contenteditable
   answers to. The body has to hold focus first or there is no selection
   for the command to act on — which the buttons guarantee by refusing
   the mousedown that would have taken it away. */
NT.fmt=function(cmd){
  var b=el('nt-body');
  if(!b)return;
  b.focus();
  try{document.execCommand(cmd,false,null);}catch(e){}
  dressLinks(b);
  NT.typedBody();
};

/* ══ PASTING ═════════════════════════════════════════════════════════
   A paste keeps its shape and loses its clothes.

   This took plain text only at first, on the reasoning that a body
   pasted from a browser or Word arrives wearing foreign fonts and
   colours that would sit on this umber forever. True about the clothes
   and wrong about the shape: what Mark pastes is usually already a list
   or already has emphasis in it, and retyping that is the work the paste
   was meant to save. So the markup comes through a sieve instead —
   everything this room can draw is kept, everything else is unwrapped to
   the words inside it, and every attribute goes, which is where the
   fonts and colours and sizes were.

   The tags kept are the tags notes.css styles, and no others.

   A table is on the list because half of what Mark pastes is one — the
   plain x-by-x grids Word calls a Tabel. Unwrapped, which is what
   happened to them until now, a three-column partner table arrived as
   one column of loose paragraphs with nothing left to say which cell any
   of them had been in. TBODY is on the list for a reason that is easy to
   miss: Word writes <table><tr> with no body of its own and the parser
   supplies one, so a TBODY that is not kept is unwrapped and every row
   falls out of the table it was in. */
var RTE_KEEP={B:1,STRONG:1,I:1,EM:1,U:1,UL:1,OL:1,LI:1,BR:1,DIV:1,P:1,A:1,
  TABLE:1,CAPTION:1,THEAD:1,TBODY:1,TFOOT:1,TR:1,TD:1,TH:1};
/* Unwrapping these would spill their contents into the note as text —
   a stylesheet's rules, a script's source — so they are removed whole. */
var RTE_DROP={SCRIPT:1,STYLE:1,IFRAME:1,OBJECT:1,EMBED:1,LINK:1,META:1,SVG:1,FORM:1};

function unwrap(el){
  var parent=el.parentNode;
  if(!parent)return;
  while(el.firstChild)parent.insertBefore(el.firstChild,el);
  parent.removeChild(el);
}
/* Word and Google Docs write weight and slope as inline style on a bare
   span rather than as <b> or <i>. Stripping attributes and unwrapping
   the span would therefore throw away the very emphasis the paste was
   made to keep, so the three this room can draw are read off the style
   and put back as tags before the span goes. */
function styleTags(el){
  var out=[],s=(el.getAttribute&&el.getAttribute('style')||'').toLowerCase();
  if(!s)return out;
  if(/font-weight\s*:\s*(bold|[5-9]\d\d)/.test(s))out.push('B');
  if(/font-style\s*:\s*italic/.test(s))out.push('I');
  if(/text-decoration[^;]*underline/.test(s))out.push('U');
  return out;
}
/* ── the layout a paste is allowed to keep ──
   Fonts, colours and sizes are clothes and go. Where a paragraph sits,
   whether a list carries on counting, and whether the writer closed the
   gap under a line are not clothes — they are what the writing means,
   and Word and Docs both record them as style rather than as structure.
   So exactly four facts are read off before the attributes are stripped,
   and each is put back as one of this room's own classes rather than as
   the source's own measurements: a note still looks like a note. */
function isZeroLen(v){
  return /^-?0(\.0+)?\s*(pt|px|in|cm|mm|em|%)?$/.test(String(v||'').trim());
}
function lengthPt(v){
  var m=/^(-?[\d.]+)\s*(pt|px|in|cm|mm|em)?$/.exec(String(v||'').trim());
  if(!m)return 0;
  var n=parseFloat(m[1]);
  if(!isFinite(n))return 0;
  return n*({px:0.75,in:72,cm:28.35,mm:2.835,em:12}[m[2]]||1);
}
/* Word indents each level by half an inch, which is 36pt, so that is the
   step a level is counted in. Four levels is as deep as this panel can
   show something and still leave room for the words. */
function indentLevel(style){
  var m=/margin-left\s*:\s*([^;]+)/.exec(style);
  if(!m)return 0;
  return Math.max(0,Math.min(4,Math.round(lengthPt(m[1])/36)));
}
function isTight(style){
  var m=/margin-bottom\s*:\s*([^;]+)/.exec(style);
  if(m)return isZeroLen(m[1]);
  m=/(?:^|;)\s*margin\s*:\s*([^;]+)/.exec(style);
  if(m)return m[1].trim().split(/\s+/).every(isZeroLen);
  return false;
}
/* The Word pre-pass runs before clean() and needs a way to say what it
   worked out; clean() then strips every attribute, its own included. So
   a class already on the element survives, but only if it is one of the
   handful this room defines — anything else a source brought with it
   still goes. */
var NT_CLASS=/^nt-(in[1-4]|tight|blank|mid|right|vmid|b[strbl])$/;
function keptClasses(el){
  return String(el.getAttribute('class')||'').split(/\s+/).filter(function(c){
    return NT_CLASS.test(c);
  });
}
/* Where the words sit in their cell is not a font and not a colour: it
   is what the person who made the table decided the column was for, and
   a centred comments column read left is a different table. Word writes
   it as `align=` on the paragraph or `text-align` in its style; Excel
   writes it in a class, which is why §inlineSheet exists. */
function alignClass(el,style){
  var out=[];
  var h=/text-align\s*:\s*(left|right|center|centre)/.exec(style);
  h=h?h[1]:String(el.getAttribute('align')||'').toLowerCase();
  if(h==='center'||h==='centre')out.push('nt-mid');
  else if(h==='right')out.push('nt-right');
  if(el.tagName==='TD'||el.tagName==='TH'){
    var v=/vertical-align\s*:\s*(middle|center|bottom)/.exec(style);
    v=v?v[1]:String(el.getAttribute('valign')||'').toLowerCase();
    if(v==='middle'||v==='center')out.push('nt-vmid');
  }
  return out;
}
function layoutClass(el,style,inList){
  var cls=keptClasses(el);
  alignClass(el,style).forEach(function(c){
    if(cls.indexOf(c)<0)cls.push(c);
  });
  /* Only outside a list: inside one the item is already indented, and
     saying it twice walks the text off the right of the panel. */
  if(!inList&&/^(P|DIV|UL|OL)$/.test(el.tagName)){
    var lvl=(el.tagName==='UL'||el.tagName==='OL')?0:indentLevel(style);
    /* Word's List Paragraph style holds its half-inch in the stylesheet
       rather than on the paragraph, and the stylesheet is thrown away
       here. Without this, the very paragraph Mark writes under a bullet
       — styled, not indented by hand — came back flush left. */
    if(!lvl&&/mso-?list-?paragraph/i.test(el.getAttribute('class')||''))lvl=1;
    if(lvl)cls.push('nt-in'+lvl);
  }
  if(isTight(style)&&cls.indexOf('nt-tight')<0)cls.push('nt-tight');
  /* Word's own empty paragraph is a little over half the height this body
     would give one, so a mail with a single blank line between two tables
     arrived looking as though it had two. Marked here rather than left to
     the stylesheet because no selector can ask whether a paragraph holds
     nothing but a non-breaking space, which is what Word writes one as. */
  if(el.tagName==='P'&&cls.indexOf('nt-blank')<0
      &&!/\S/.test((el.textContent||'').replace(/\u00a0/g,' '))
      &&!el.querySelector('table,img,ul,ol'))cls.push('nt-blank');
  return cls.join(' ');
}
/* A list broken in half by an unbulleted paragraph is still one list to
   the person who wrote it, and Word says so with `start` on the second
   half. Dropped, the numbering began again at one — which is the whole
   of what Mark saw. The marker style travels with it, so a sub-list that
   was letters or hollow bullets stays that way. */
var OL_TYPE={'lower-alpha':'a','upper-alpha':'A','lower-roman':'i',
  'upper-roman':'I','decimal':'1'};
function listAttrs(el,style){
  var out={},m;
  if(el.tagName==='OL'){
    var st=parseInt(el.getAttribute('start'),10);
    if(isFinite(st)&&st>1&&st<10000)out.start=String(st);
    var t=String(el.getAttribute('type')||'').trim();
    if(/^[1aAiI]$/.test(t))out.type=t;
    else if((m=/list-style-type\s*:\s*([a-z-]+)/.exec(style))&&OL_TYPE[m[1]])
      out.type=OL_TYPE[m[1]];
  }else if(el.tagName==='UL'){
    var ut=String(el.getAttribute('type')||'').trim().toLowerCase();
    if(!/^(disc|circle|square)$/.test(ut)&&(m=/list-style-type\s*:\s*([a-z-]+)/.exec(style)))
      ut=m[1];
    if(/^(disc|circle|square)$/.test(ut))out.type=ut;
  }else if(el.tagName==='LI'){
    var v=parseInt(el.getAttribute('value'),10);
    if(isFinite(v)&&v>0&&v<10000)out.value=String(v);
  }
  return out;
}
/* A merged cell is the one thing about a table that the markup has to
   carry rather than the stylesheet: colspan and rowspan say which cells
   are missing from a row, and a row short of a cell with nothing to
   explain it draws crooked. Read as numbers rather than copied across as
   text, so nothing else can travel in on them. */
function cellAttrs(el){
  var out={};
  if(el.tagName!=='TD'&&el.tagName!=='TH')return out;
  ['colspan','rowspan'].forEach(function(k){
    var v=parseInt(el.getAttribute(k),10);
    if(isFinite(v)&&v>1&&v<100)out[k]=String(v);
  });
  return out;
}
function wrapChildren(el,tags){
  tags=tags.filter(function(t){return t!==el.tagName;});
  if(!tags.length||!el.firstChild)return;
  var outer=null,inner=null;
  tags.forEach(function(t){
    var node=document.createElement(t);
    if(!outer){outer=inner=node;}
    else{inner.appendChild(node);inner=node;}
  });
  while(el.firstChild)inner.appendChild(el.firstChild);
  el.appendChild(outer);
}
/* ── Word does not put a list on the clipboard as a list ──
   Every item is an ordinary paragraph carrying `mso-list:` in its style,
   and the bullet you can see is a literal character sitting in a span
   Word marks `mso-list:Ignore`. Pasted plainly, a list therefore arrives
   as a column of paragraphs each beginning with a stray dot, none of
   them indented, and nothing counting. This walks that back into real
   <ul> and <ol>, which is the shape the rest of this file already knows
   — after which everything else here works as it does for any paste.

   Read off Mark's own document: his lists are Word bullets at half an
   inch with a hanging indent, and the paragraphs he writes under them
   carry the List Paragraph style rather than a bullet, which is the
   case §layoutClass keeps the indent for. */
var WORD_BULLETS=/^[\s·•▪●]+/;
function prevElement(el){
  var n=el.previousSibling;
  while(n&&((n.nodeType===3&&!/\S/.test(n.nodeValue||''))||n.nodeType===8))
    n=n.previousSibling;
  return (n&&n.nodeType===1)?n:null;
}
function wordItem(el){
  var style=String(el.getAttribute('style')||'');
  var m=/mso-list\s*:[^;"']*level(\d+)/i.exec(style);
  var lvl=m?Math.max(1,Math.min(5,parseInt(m[1],10))):1;
  var glyph='';
  [].slice.call(el.querySelectorAll('span')).forEach(function(sp){
    if(!/mso-list\s*:\s*ignore/i.test(sp.getAttribute('style')||''))return;
    if(!glyph)glyph=sp.textContent||'';
    sp.parentNode.removeChild(sp);
  });
  /* some builds omit the marked span and leave the glyph loose in the
     text; only symbols are trimmed this way, never a letter, so a line
     that genuinely starts with a word cannot lose it */
  if(!glyph&&el.firstChild&&el.firstChild.nodeType===3){
    var t=el.firstChild.nodeValue||'';
    if(WORD_BULLETS.test(t)&&/^\S/.test(t)){
      glyph=t;
      el.firstChild.nodeValue=t.replace(WORD_BULLETS,'');
    }
  }
  var num=/^\s*(\d+)\s*[.)]/.exec(glyph);
  return {
    lvl:lvl,
    ordered:!!num||/^\s*[a-z]\s*[.)]/i.test(glyph),
    n:num?parseInt(num[1],10):0,
    tight:isTight(style.toLowerCase())
  };
}
function unwordLists(root){
  var items=[].slice.call(root.querySelectorAll('p,div')).filter(function(el){
    return /mso-list\s*:/i.test(el.getAttribute('style')||'');
  });
  if(!items.length)return;
  var run=null;
  items.forEach(function(el){
    var it=wordItem(el);
    /* one run is items standing next to each other; anything else
       between them ends the list and starts a new one, which is exactly
       what an explaining paragraph in the middle is meant to do */
    if(!run||run.parent!==el.parentNode||prevElement(el)!==run.mark)
      run={parent:el.parentNode,stack:[],mark:null};
    while(run.stack.length&&run.stack[run.stack.length-1].lvl>it.lvl)run.stack.pop();
    var cur=run.stack[run.stack.length-1];
    if(!cur||cur.lvl<it.lvl){
      var list=document.createElement(it.ordered?'ol':'ul');
      if(it.tight)list.setAttribute('style','margin-bottom:0');
      if(cur)(cur.list.lastElementChild||cur.list).appendChild(list);
      else{
        /* a sub-bullet whose parent items were interrupted by an
           explaining paragraph has nothing to nest inside, and standing
           it flush left would lose the one thing its depth was saying */
        if(it.lvl>1)list.setAttribute('class','nt-in'+Math.min(it.lvl-1,4));
        run.parent.insertBefore(list,el);
        run.mark=list;
      }
      run.stack.push({lvl:it.lvl,list:list,next:1});
      cur=run.stack[run.stack.length-1];
    }
    var li=document.createElement('li');
    /* the glyph is the true number, so a list resuming at three says so
       without anyone having to work it out */
    if(it.ordered&&it.n&&it.n!==cur.next){
      li.setAttribute('value',String(it.n));
      cur.next=it.n;
    }
    cur.next++;
    while(el.firstChild)li.appendChild(el.firstChild);
    cur.list.appendChild(li);
    el.parentNode.removeChild(el);
  });
}

/* ── the characters a paste brings that nothing can draw ──
   Outlook's tables came through with a small box standing between each
   of them — which is how a browser draws a character it has no glyph
   for, with the number of the character printed inside the box. The
   number was U+E113: the Private Use Area, the stretch of the alphabet
   that means whatever the font in use says it means and nothing at all
   otherwise. It is where Word and Outlook keep the drawings their own
   icon fonts make, Symbol's bullet and Wingdings' ticks among them. The
   sieve's whole business is throwing the fonts away, so what it left
   behind was a character with nothing left to draw it.

   They go, and the line they were standing on goes with them if that is
   all it held — an empty paragraph where an invisible marker used to be
   is the gap Mark saw, and it was never a blank line in his mail. A
   paragraph that was already blank is a blank line somebody typed, and
   that one stays: see nt-blank above for how tall it is drawn.

   The same sweep takes the zero-width and direction-marking characters,
   which are invisible by design and travel in from anywhere. */
var JUNK_CH=/[\uE000-\uF8FF\uFFF9-\uFFFD\uFEFF\u200B-\u200F\u202A-\u202E]/g;
function stripJunk(root){
  var emptied=[];
  (function walk(node){
    [].slice.call(node.childNodes).forEach(function(child){
      if(child.nodeType===1){walk(child);return;}
      if(child.nodeType!==3)return;
      var was=child.nodeValue||'',now=was.replace(JUNK_CH,'');
      if(now===was)return;
      child.nodeValue=now;
      /* the line it was on, which is the thing that may now be empty */
      var line=child.parentNode;
      while(line&&line.nodeType===1&&!/^(P|DIV|LI|TD|TH)$/.test(line.tagName))
        line=line.parentNode;
      if(line&&line.nodeType===1&&emptied.indexOf(line)<0)emptied.push(line);
    });
  })(root);
  emptied.forEach(function(line){
    /* a cell is a shape and stands whether or not it says anything, and
       a line still holding a table, a break or a picture is not empty */
    if(/^(TD|TH)$/.test(line.tagName))return;
    if(line.querySelector('table,img,br'))return;
    if(/\S/.test((line.textContent||'').replace(/\u00a0/g,' ')))return;
    if(line.parentNode)line.parentNode.removeChild(line);
  });
}
/* ── what a spreadsheet hides, and what its classes say ──
   Excel does not put its formatting on the cells. It writes a stylesheet
   at the top and hangs `class=xl65` on everything, and the sieve throws
   stylesheets away — so a table copied straight out of a sheet arrived
   with every column the width of its longest word and every centred
   heading ranged left. It also writes a spare row at the bottom, hidden
   with `display:none`, to keep its columns honest in a browser; stripped
   of its style that row is no longer hidden, and it turned up as an
   empty row under the table.

   So the stylesheet is read before it is discarded, and the handful of
   declarations that say something about SHAPE are laid onto the elements
   that wear the class, ahead of their own style so that anything written
   on the element still wins. Only that handful: a class is also where
   the fonts, the colours and the borders live, and those are the clothes
   this whole sieve exists to take off. Margins are left out too — Word's
   own MsoNormal declares none, and honouring that would close up the gap
   between every paragraph in the note. */
var SHEET_KEEP=/^(text-align|vertical-align|width|font-weight|font-style|text-decoration|border(-(top|right|bottom|left))?(-(width|style))?)$/;
function sheetRules(root){
  var map={},any=false;
  [].slice.call(root.querySelectorAll('style')).forEach(function(st){
    var css=String(st.textContent||'').replace(/\/\*[^]*?\*\//g,'');
    var re=/([^{}]+)\{([^{}]*)\}/g,m;
    while((m=re.exec(css))){
      var take=[];
      m[2].split(';').forEach(function(d){
        var c=d.indexOf(':');
        if(c<0)return;
        if(SHEET_KEEP.test(d.slice(0,c).trim().toLowerCase()))take.push(d.trim());
      });
      if(!take.length)continue;
      m[1].split(',').forEach(function(sel){
        /* a bare class, or a tag with one. Anything carrying a
           combinator is a claim about context that cannot be honoured
           by writing the declarations onto every element that matches. */
        var k=/^[A-Za-z]*\.([A-Za-z][\w-]*)$/.exec(sel.trim());
        if(!k)return;
        var key=k[1].toLowerCase();
        map[key]=(map[key]||[]).concat(take);
        any=true;
      });
    }
  });
  return any?map:null;
}
function inlineSheet(root){
  var map=sheetRules(root);
  if(!map)return;
  [].slice.call(root.querySelectorAll('*')).forEach(function(el){
    var add=[];
    String(el.getAttribute('class')||'').split(/\s+/).forEach(function(c){
      if(map[c.toLowerCase()])add=add.concat(map[c.toLowerCase()]);
    });
    if(!add.length)return;
    el.setAttribute('style',add.join(';')+';'+String(el.getAttribute('style')||''));
  });
}
/* Hidden is hidden for a reason, and the reason never survives the trip:
   the attributes that carried it are about to be stripped. */
function stripHidden(root){
  [].slice.call(root.querySelectorAll('*')).forEach(function(el){
    var s=String(el.getAttribute('style')||'').toLowerCase();
    var h=String(el.getAttribute('height')||'').trim();
    if(/display\s*:\s*none/.test(s)||(el.tagName==='TR'&&h==='0')){
      if(el.parentNode)el.parentNode.removeChild(el);
    }
  });
}
/* ── where a table's rules actually go ──
   Mark's sheet is a bordered block with two unruled lines of headings
   above it — a total, and the names of the columns in italic. Copied, all
   of it is one HTML table, and this room drew its own grid on every cell
   of it: the headings arrived boxed in, inside the table, which is not
   where he had put them.

   So a table that says anything at all about its own rules gets only the
   rules it asks for, side by side, and a cell that asks for none draws
   none — which is Word's and Excel's own default and is exactly what the
   two heading lines wanted. A table that says nothing (a web page, mostly)
   still gets the full grid, because a table with no lines anywhere and
   nothing saying so is unreadable. The lines are drawn in this room's own
   hairline either way: where a rule goes is the table's business, what
   colour it is drawn in is the room's.

   Sides are read as presence, not as measurements — `none`, `hidden` and
   a zero width mean no line, anything else means a line. */
function borderSides(el){
  var css=String(el.getAttribute('style')||'').toLowerCase();
  var out={top:false,right:false,bottom:false,left:false},said=false;
  var re=/(?:^|;)\s*border(?:-(top|right|bottom|left))?(?:-(width|style))?\s*:\s*([^;]+)/g,m;
  while((m=re.exec(css))){
    var v=String(m[3]).trim();
    if(!v)continue;
    var on=!(/(^|\s)(none|hidden)(\s|$)/.test(v)
      ||/(^|\s)0(\.0+)?(pt|px|em|in|cm|mm)?(\s|$)/.test(v));
    said=true;
    if(m[1])out[m[1]]=on;
    else{out.top=out.right=out.bottom=out.left=on;}
  }
  return said?out:null;
}
function mark(el,cls){
  var had=String(el.getAttribute('class')||'');
  if(had.split(/\s+/).indexOf(cls)<0)
    el.setAttribute('class',(had?had+' ':'')+cls);
}
function ruleTables(root){
  [].slice.call(root.querySelectorAll('table')).forEach(function(t){
    var cells=[].slice.call(t.querySelectorAll('td,th'));
    var sides=cells.map(borderSides),any=false;
    sides.forEach(function(b){if(b)any=true;});
    if(!any)return;
    mark(t,'nt-bs');
    cells.forEach(function(c,i){
      var b=sides[i];
      if(!b)return;
      if(b.top)mark(c,'nt-bt');
      if(b.right)mark(c,'nt-br');
      if(b.bottom)mark(c,'nt-bb');
      if(b.left)mark(c,'nt-bl');
    });
  });
}
/* ── the width of a column is shape, not clothes ──
   A table shrink-wraps to its longest word once the widths come off, so
   a thirteen-row work-package table that filled a Word page arrived in a
   third of the panel with its comments column squeezed to nothing. The
   widths are what the person laying the table out actually decided, so
   they are kept — as shares of the table rather than as the source's own
   points, because a note panel is not a page and a column measured in
   points would mean something different here.

   The table's own width is read against the width of an A4 page with
   Word's ordinary margins, which is what nearly every one of these was
   made on: a table that filled that page fills the note, and one that
   took half of it takes half. Capped at the panel, never stretched past
   it. */
var PAGE_PT=455;
/* A width is read as {v, pct}: the number, and whether it was already a
   share. Both turn up — a source measures in points or pixels, and a
   table copied back out of a note measures in the shares this wrote onto
   it. Both must be understood, or a note copied to Word and back would
   lose the very widths it had just been given. */
function widthOf(el){
  var m=/(?:^|;)\s*width\s*:\s*([^;]+)/i.exec(String(el.getAttribute('style')||''));
  if(m){
    var t=String(m[1]).trim();
    if(/%$/.test(t)){
      var p=parseFloat(t);
      if(isFinite(p)&&p>0)return {v:p,pct:true};
    }
    var pt=lengthPt(t);
    if(pt>0)return {v:pt,pct:false};
  }
  var w=String(el.getAttribute('width')||'').trim();
  /* a bare width attribute is pixels, and a browser pixel is three
     quarters of a point — the same conversion §lengthPt makes */
  return /^\d+$/.test(w)?{v:parseInt(w,10)*0.75,pct:false}:null;
}
function columnWidths(t){
  function read(list){
    var w=[],pct=null;
    for(var i=0;i<list.length;i++){
      var c=list[i],got=widthOf(c);
      if(!got)return null;
      /* points and shares cannot be added together, so a table that
         mixes them is one this cannot measure and is left alone */
      if(pct===null)pct=got.pct;
      else if(pct!==got.pct)return null;
      var span=Math.max(1,parseInt(c.getAttribute('colspan'),10)||1);
      for(var k=0;k<span;k++)w.push(got.v/span);
    }
    return w.length?{w:w,pct:!!pct}:null;
  }
  var got=read([].slice.call(t.querySelectorAll('col')));
  if(got)return got;
  var best=null;
  [].slice.call(t.rows||[]).forEach(function(r){
    var row=read([].slice.call(r.cells));
    /* the widest row that names every one of its columns — a row broken
       by a cell merged down from above names fewer than the table has */
    if(row&&(!best||row.w.length>best.w.length))best=row;
  });
  return best;
}
function sizeTables(root){
  [].slice.call(root.querySelectorAll('table')).forEach(function(t){
    var got=columnWidths(t);
    if(!got)return;
    var w=got.w,sum=0;
    w.forEach(function(x){sum+=x;});
    if(!(sum>0))return;
    /* columns already in shares say nothing about how wide the table is,
       so the table's own width is asked for and a table that does not
       name one takes the panel */
    var own=widthOf(t);
    t.__nt='width:'+(got.pct
      ?(own&&own.pct?own.v:100)
      :Math.round(Math.min(100,sum/PAGE_PT*100)))+'%';
    /* The share is how the table is DRAWN here, against a panel that is
       not a page. What it actually measured stays with it as well, so
       that a table going back out to Word goes at the size it came in
       at: Excel to a note to Word and Excel straight to Word have to put
       the same table on the page, and a share handed to Word means "fill
       the text column", which is a different and usually bigger thing.
       Carried as a custom property because it is the sieve's own note to
       itself rather than anything the browser should draw. It is added
       below, once the columns have been rounded: a table measured as the
       sum of its rounded columns comes back the same on the next trip,
       and one measured before the rounding gains a tenth of a point
       every time it goes round. */
    var row=null;
    [].slice.call(t.rows||[]).forEach(function(r){
      var n=0;
      [].forEach.call(r.cells,function(c){
        n+=Math.max(1,parseInt(c.getAttribute('colspan'),10)||1);});
      if(n>=w.length&&!row)row=r;
    });
    if(!row)return;
    /* the shares go on one row only: a browser takes a column's width
       from the first cell that names it, and writing it on every row is
       the same number said twenty-six times */
    var i=0,cut=[];
    [].forEach.call(row.cells,function(c){
      var span=Math.max(1,parseInt(c.getAttribute('colspan'),10)||1),share=0;
      for(var k=0;k<span&&i<w.length;k++,i++)share+=w[i];
      if(share>0)cut.push({cell:c,pct:Math.round(share/sum*1000)/10,pt:share});
    });
    if(!cut.length)return;
    /* The last column takes whatever rounding left over, so the shares
       add to a hundred exactly. Without it a table copied out of a note
       and pasted back in came back a tenth of a percent narrower every
       time, which is a difference no eye would see and the round-trip
       test rightly would. */
    var used=0;
    cut.forEach(function(x,k){if(k<cut.length-1)used+=x.pct;});
    cut[cut.length-1].pct=Math.round((100-used)*10)/10;
    var whole=0;
    cut.forEach(function(x){
      x.pt=Math.round(x.pt*10)/10;
      whole+=x.pt;
      x.cell.__nt='width:'+x.pct+'%'+(got.pct?'':';--nt-pt:'+x.pt+'pt');
    });
    if(!got.pct)t.__nt+=';--nt-pt:'+(Math.round(whole*10)/10)+'pt';
  });
}

/* A template holds the markup inert while it is inspected, so an image
   or a frame that is about to be discarded never starts loading. */
function sanitizeRich(html){
  var tmp=document.createElement('template');
  tmp.innerHTML=html||'';
  inlineSheet(tmp.content);
  stripHidden(tmp.content);
  unwordLists(tmp.content);
  stripJunk(tmp.content);
  ruleTables(tmp.content);
  sizeTables(tmp.content);
  (function clean(node,inList){
    [].slice.call(node.childNodes).forEach(function(child){
      if(child.nodeType===3)return;
      if(child.nodeType!==1){node.removeChild(child);return;}
      /* Upper-cased, because an inline SVG keeps the case it was written
         in: `svg` never matched `SVG`, so a pasted icon was unwrapped
         instead of dropped and its title and style rules landed in the
         note as text. */
      if(RTE_DROP[child.tagName.toUpperCase()]){node.removeChild(child);return;}
      var tag=child.tagName;
      /* everything worth keeping is read while the attributes are still
         there, because the next thing that happens is that they all go */
      var style=String(child.getAttribute('style')||'').toLowerCase();
      var tags=styleTags(child);
      var layout=layoutClass(child,style,inList);
      var listed=listAttrs(child,style);
      var spans=cellAttrs(child);
      var href=(tag==='A')?safeHref(child.getAttribute('href')):'';
      var deeper=inList||tag==='UL'||tag==='OL'||tag==='LI';
      if(!RTE_KEEP[tag]||(tag==='A'&&!href)){
        clean(child,inList);wrapChildren(child,tags);unwrap(child);
        return;
      }
      while(child.attributes&&child.attributes.length)
        child.removeAttribute(child.attributes[0].name);
      if(tag==='A'){
        child.setAttribute('href',href);
        child.setAttribute('target','_blank');
        child.setAttribute('rel','noopener noreferrer');
      }
      if(layout)child.setAttribute('class',layout);
      /* the one style the sieve writes itself: see §sizeTables */
      if(child.__nt)child.setAttribute('style',child.__nt);
      Object.keys(listed).forEach(function(k){child.setAttribute(k,listed[k]);});
      Object.keys(spans).forEach(function(k){child.setAttribute(k,spans[k]);});
      clean(child,deeper);
      wrapChildren(child,tags);
    });
  })(tmp.content,false);
  return tmp.innerHTML;
}
function plainToMarkup(text){
  return esc(text==null?'':String(text)).replace(/\n/g,'<br>');
}
NT.pasteBody=function(e){
  e.preventDefault();
  var cd=e.clipboardData||window.clipboardData;
  var html=cd?cd.getData('text/html'):'';
  /* text/plain is not a poorer copy of the same thing — it is what the
     clipboard holds when the source had no markup at all, and its line
     breaks are the only structure it has */
  var tmp=document.createElement('template');
  tmp.innerHTML=sanitizeRich(html||plainToMarkup(cd?cd.getData('text/plain'):''));
  /* an address is as likely to arrive as text as it is to arrive as a
     link, and either way it should be one by the time it lands */
  linkify(tmp.content);
  document.execCommand('insertHTML',false,tmp.innerHTML);
  var b=el('nt-body');
  if(b)dressLinks(b);
  NT.typedBody();NT.tableBar();
};

/* ── copying out ──
   The sieve above is half of the bargain and this is the other half. A
   note copied into Word or Outlook arrived unreadable, and the reason is
   the mirror image of the reason the sieve exists: Chromium writes the
   clipboard by inlining the computed style of everything it copies, so
   the room's cream ink, its dark wash and its serif all went with the
   words — and cream on Word's white page is very nearly nothing at all.
   The shape had always been fine. It was the clothes.

   So the room writes its own clipboard. The selection is cloned, the two
   classes a paste is allowed to keep are turned back into the
   measurements Word understands — half an inch a level, which is the step
   Word itself indents by — a table gets the rules drawn back onto it, and
   everything else goes as the plain tags it already is, with no colour,
   no font and no size on it anywhere. Word then dresses it in the
   receiving document's own style, which is what anyone pasting into a
   document wants and is exactly what this room does to a paste arriving.

   Only when the selection sits inside the body. One that reaches past it
   is the browser's to serve, and the browser does the ordinary thing. */
var PAPER_IN={'nt-in1':36,'nt-in2':72,'nt-in3':108,'nt-in4':144};
function dressForPaper(root){
  /* which tables draw only the rules they were given — asked before the
     loop, because the loop strips the class off the table before it ever
     reaches that table's cells */
  var ruled=[].slice.call(root.querySelectorAll('table.nt-bs'));
  function stated(node){
    for(var i=0;i<ruled.length;i++)if(ruled[i].contains(node))return true;
    return false;
  }
  /* what each table measured when it arrived, if it said — see the note
     in §sizeTables for why a share is the wrong thing to hand Word */
  function measured(el){
    var m=/--nt-pt\s*:\s*([\d.]+)pt/.exec(String(el.getAttribute('style')||''));
    return m?parseFloat(m[1]):0;
  }
  [].slice.call(root.querySelectorAll('*')).forEach(function(node){
    var css=[];
    /* the only style a note's own markup carries is the width the sieve
       measured off the source, and it is as much a part of the table
       going out as it was coming in */
    var pt=measured(node);
    if(pt>0)css.push('width:'+pt+'pt');
    else{
      var w=/(?:^|;)\s*width\s*:\s*([\d.]+%)/.exec(
        String(node.getAttribute('style')||''));
      if(w)css.push('width:'+w[1]);
    }
    String(node.getAttribute('class')||'').split(/\s+/).forEach(function(c){
      if(PAPER_IN[c])css.push('margin-left:'+PAPER_IN[c]+'pt');
      if(c==='nt-tight')css.push('margin-top:0','margin-bottom:0');
      if(c==='nt-mid')css.push('text-align:center');
      if(c==='nt-right')css.push('text-align:right');
      if(c==='nt-vmid')css.push('vertical-align:middle');
      if(c==='nt-bt')css.push('border-top:1px solid #808080');
      if(c==='nt-br')css.push('border-right:1px solid #808080');
      if(c==='nt-bb')css.push('border-bottom:1px solid #808080');
      if(c==='nt-bl')css.push('border-left:1px solid #808080');
    });
    node.removeAttribute('class');
    node.removeAttribute('style');
    /* Word draws a table by its borders and this room draws one by its
       stylesheet, which does not travel. Without this the grid lands as
       three columns of words with no lines anywhere between them. */
    if(node.tagName==='TABLE')css.push('border-collapse:collapse');
    if(node.tagName==='TD'||node.tagName==='TH'){
      /* a cell in a table that states its own rules has just had them
         written above; every other cell gets the grid */
      if(!stated(node))css.push('border:1px solid #808080');
      css.push('padding:2pt 5pt');
      /* top unless the cell said otherwise, which is what it said here */
      if(css.indexOf('vertical-align:middle')<0)css.push('vertical-align:top');
    }
    if(css.length)node.setAttribute('style',css.join(';'));
  });
}
function bodySelection(){
  var b=el('nt-body'),sel=window.getSelection();
  if(!b||!sel||!sel.rangeCount||sel.isCollapsed)return null;
  var r=sel.getRangeAt(0);
  if(!b.contains(r.commonAncestorContainer))return null;
  return {body:b,sel:sel,range:r};
}
function writePaper(e,got){
  var cd=e.clipboardData||window.clipboardData;
  if(!cd)return false;
  var tmp=document.createElement('template');
  tmp.content.appendChild(got.range.cloneContents());
  dressForPaper(tmp.content);
  try{
    cd.setData('text/html',tmp.innerHTML);
    /* the plain flavour is what a plain destination takes, and the
       selection's own text is the truest version of it there is */
    cd.setData('text/plain',got.sel.toString());
  }catch(err){return false;}
  e.preventDefault();
  return true;
}
NT.copyBody=function(e){
  var got=bodySelection();
  if(got)writePaper(e,got);
};
/* Cut is that same clipboard and then the removal the browser was about
   to do, asked for by name — refusing the default takes the removal away
   with it, and a cut that copies without cutting is worse than either
   half of itself. execCommand is used rather than lifting the nodes out
   by hand because it is what keeps the cut on the undo stack. */
NT.cutBody=function(e){
  var got=bodySelection();
  if(!got||!writePaper(e,got))return;
  try{document.execCommand('delete');}catch(err){got.range.deleteContents();}
  NT.typedBody();
};

/* ── a whole note, copied in one press ──
   Selecting a note by hand is a drag from the first word to the last with
   the panel scrolling under it, which is a fiddly way to say "this one".
   So the words of the note go onto the clipboard entire, dressed for
   paper by the same hand that dresses a selection, and in both flavours,
   so it lands in Word as itself and in anything plainer as text.

   Neither the name nor the tags go with them. Both are how the note is
   filed in this room rather than part of what it says, and a title
   arriving as a heading in the middle of a mail is a line to delete —
   which Mark asked to be spared on 2026-09-09.

   Copying something that is not selected means giving the browser
   something to copy: `execCommand` acts on a selection and there is no
   selection when the press was on a button. So an off-screen holder is
   written, selected, and taken away again the moment the copy is done,
   with whatever was selected before put back — the caret in a note being
   written must be where it was left. The holder carries the plain text
   rather than the markup because the listener on it replaces both
   flavours anyway, and a holder full of markup would start loading
   anything the markup pointed at. */
var IC_COPY='<svg viewBox="0 0 14 14" width="11" height="11" aria-hidden="true" '
  +'fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" '
  +'stroke-linecap="round"><rect x="4.9" y="1.4" width="7.7" height="8.8" rx="1.3">'
  +'</rect><path d="M9.6 12.6H2.7a1.3 1.3 0 0 1-1.3-1.3V4.3"></path></svg>';
/* Blocks are what a line break means in markup, so the plain flavour is
   built from the shape rather than read off textContent, which would run
   a table into one long word. A cell ends in a tab, which is what every
   spreadsheet and every mail client reads as the next column. */
function plainOf(root){
  var out=[];
  (function walk(node){
    [].slice.call(node.childNodes).forEach(function(c){
      if(c.nodeType===3){
        /* a newline in the source is the shape of the markup, not of the
           words: left in, the line the writer set between two rows of a
           table would arrive as a blank one */
        var t=c.nodeValue||'';
        out.push(/^\s*$/.test(t)?' ':t.replace(/\s*\n\s*/g,' '));
        return;
      }
      if(c.nodeType!==1)return;
      if(c.tagName==='BR'){out.push('\n');return;}
      if(c.tagName==='LI')out.push('\n• ');
      else if(/^(P|DIV|TR|TABLE|UL|OL)$/.test(c.tagName)){
        /* a paragraph inside a cell is not a line of its own — it is how
           Word writes the cell, and breaking there would stand every
           column of the table in a column of its own */
        var owner=c.parentNode;
        if(!(owner&&/^(TD|TH)$/.test(owner.tagName)))out.push('\n');
      }
      walk(c);
      if(c.tagName==='TD'||c.tagName==='TH')out.push('\t');
    });
  })(root);
  return out.join('').replace(/\u00a0/g,' ')
    .replace(/[ \t]+$/gm,'').replace(/\n{3,}/g,'\n\n').trim();
}
function toClipboard(html,text){
  var holder=document.createElement('div');
  holder.setAttribute('style','position:fixed; left:-9999px; top:0; '
    +'opacity:0; white-space:pre-wrap');
  holder.textContent=text||' ';
  document.body.appendChild(holder);
  var sel=window.getSelection(),kept=[],i;
  if(sel)for(i=0;i<sel.rangeCount;i++)kept.push(sel.getRangeAt(i));
  var wrote=false,ok=false;
  holder.addEventListener('copy',function(e){
    var cd=e.clipboardData||window.clipboardData;
    if(!cd)return;
    cd.setData('text/html',html);
    cd.setData('text/plain',text);
    e.preventDefault();wrote=true;
  },true);
  try{
    var r=document.createRange();
    r.selectNodeContents(holder);
    sel.removeAllRanges();sel.addRange(r);
    ok=document.execCommand('copy');
  }catch(e){}
  try{
    sel.removeAllRanges();
    kept.forEach(function(x){sel.addRange(x);});
  }catch(e){}
  if(holder.parentNode)holder.parentNode.removeChild(holder);
  return ok&&wrote;
}
NT.copyNote=function(id){
  var n=byId(id||panel.id);
  if(!n){Hub.note('No note to copy.',3000);return;}
  var tmp=document.createElement('template');
  tmp.innerHTML=n.body||'';
  dressForPaper(tmp.content);
  Hub.note(toClipboard(tmp.innerHTML,plainOf(tmp.content))
    ?'Copied — paste it anywhere.'
    :'This browser would not let the note onto the clipboard.',3000);
};
/* The pill is the note's name on the shelf, and holding ctrl while
   pressing one copies that note without opening it — Mark's own
   suggestion, and the only gesture that reaches a note from the sheet
   without first making it the open one. It is written in the pill's
   tooltip, which is the one place a keyboard chord can be said. */
NT.pillClick=function(e,id,slot){
  if(e&&(e.ctrlKey||e.metaKey)){
    e.preventDefault();e.stopPropagation();
    NT.copyNote(id);
    return;
  }
  NT.open(id,slot);
};

/* ══ TABLES ════════════════════════════════════════════════
   A table only ever arrives here from Word, and once it is in a note it
   is a list of partners or a list of work packages, which is to say a
   thing that grows. Rows can be added and taken away; columns cannot,
   because a column is a decision about what the table is FOR and that
   decision was made in the document it came from.

   Two ways to add one, and they are the same act. **Tab in the last cell
   makes a new row**, which is what Word does and therefore what the hands
   already do — and Tab everywhere else in a table walks to the next cell,
   which is the other half of the same habit. And a small bar stands
   beside the table while the caret is inside it, for the times the caret
   is in the middle of a table rather than at the end of it.

   The bar lives OUTSIDE the body. Everything inside `#nt-body` is the
   note — `NT.typedBody` saves that element's innerHTML verbatim — so a
   control drawn in there would be written into the note itself and would
   still be sitting in it a month later. */
function caretNode(){
  var b=el('nt-body');
  if(!b||!editing)return null;
  var sel=window.getSelection();
  if(!sel||!sel.rangeCount)return null;
  var n=sel.getRangeAt(0).startContainer;
  if(n&&n.nodeType===3)n=n.parentNode;
  return (n&&n.nodeType===1&&(n===b||b.contains(n)))?n:null;
}
function up(node,tag){
  var b=el('nt-body');
  while(node&&node!==b&&node.tagName!==tag)node=node.parentNode;
  return (node&&node.tagName===tag)?node:null;
}
function caretTable(){return up(caretNode(),'TABLE');}
function caretRow(){return up(caretNode(),'TR');}
function caretCell(){
  var n=caretNode();
  return up(n,'TD')||up(n,'TH');
}
function caretToStart(node){
  if(!node)return;
  try{
    var r=document.createRange();
    r.selectNodeContents(node);r.collapse(true);
    var s=window.getSelection();
    s.removeAllRanges();s.addRange(r);
  }catch(e){}
}
/* How many columns a table has, counting the merges: a row whose
   neighbour above is merged down into it carries fewer cells than the
   table is wide, and asking any one row how wide the table is therefore
   gets the wrong answer. */
function tableCols(t){
  var cols=0;
  [].slice.call((t&&t.rows)||[]).forEach(function(r){
    var n=0;
    [].forEach.call(r.cells,function(c){
      n+=Math.max(1,parseInt(c.getAttribute('colspan'),10)||1);});
    if(n>cols)cols=n;
  });
  return cols;
}
/* A new row is built rather than cloned, so that nothing of the old
   row's contents comes with it — plain cells, one per column of the
   table, never headings and never merged. Built to the TABLE's width
   rather than to the width of the row the caret is in: Mark's work
   package table merges its first and last columns down the pairs, so
   the row a caret sits in at the foot of it holds one cell out of
   three, and a new row cut to that shape was one cell wide and the next
   Tab made another of them. A paragraph holding a break is what Word
   puts in an empty cell, which is what the cells beside it hold and
   what makes them all the same height. */
NT.addRow=function(){
  var row=caretRow(),t=caretTable();
  if(!row||!t)return;
  var cols=tableCols(t)||row.cells.length;
  var fresh=document.createElement('tr');
  for(var i=0;i<cols;i++){
    var cell=document.createElement('td');
    cell.innerHTML='<p><br></p>';
    fresh.appendChild(cell);
  }
  row.parentNode.insertBefore(fresh,row.nextSibling);
  caretToStart(fresh.cells[0]);
  NT.typedBody();NT.tableBar();
};
/* The last row standing is not removed: a table with no rows in it is
   nothing on screen and no way back to it, so the button goes quiet
   instead and a table is got rid of the way anything else is. */
NT.delRow=function(){
  var t=caretTable(),row=caretRow();
  if(!t||!row||t.rows.length<2)return;
  var near=row.nextElementSibling||row.previousElementSibling;
  row.parentNode.removeChild(row);
  if(near&&near.cells&&near.cells[0])caretToStart(near.cells[0]);
  NT.typedBody();NT.tableBar();
};
NT.bodyKey=function(e){
  if(!e||e.key!=='Tab')return;
  var t=caretTable(),cell=caretCell();
  /* outside a table Tab is the browser's, and it means leave this box */
  if(!t||!cell)return;
  e.preventDefault();
  var cells=[].slice.call(t.querySelectorAll('td,th'));
  var i=cells.indexOf(cell);
  if(e.shiftKey){if(i>0)caretToStart(cells[i-1]);}
  else if(i>-1&&i<cells.length-1)caretToStart(cells[i+1]);
  else{NT.addRow();return;}
  NT.tableBar();
};
/* Beside the table where there is room for it, and on its own bottom
   corner where there is not. Under it is the obvious place and it is the
   wrong one: the bar is out of the flow, so under a table it lies over
   whatever comes next — and when the table is the last thing in the note,
   what comes next is the row a tag is added in. A table that keeps the
   full width it was given in Word leaves no room beside it either, which
   is why the corner is where the fallback goes: the far end of the last
   row is the emptiest part of a table of this kind, and the bar is only
   ever there while the caret is in that table. */
NT.tableBar=function(){
  var bar=el('nt-tbar');
  if(!bar)return;
  var t=caretTable(),panel=document.querySelector('.nt-panel');
  if(!t||!panel){bar.classList.remove('on');return;}
  bar.classList.add('on');
  var off=el('nt-tbar-del');
  if(off)off.disabled=(t.rows.length<2);
  var pr=panel.getBoundingClientRect(),tb=t.getBoundingClientRect();
  var beside=tb.right-pr.left+10;
  if(beside+bar.offsetWidth<pr.width-10){
    bar.style.left=beside+'px';
    bar.style.top=(tb.bottom-pr.top-bar.offsetHeight-1)+'px';
  }else{
    bar.style.left=(tb.right-pr.left-bar.offsetWidth-6)+'px';
    bar.style.top=(tb.bottom-pr.top-bar.offsetHeight-6)+'px';
  }
};
function tableBarHTML(){
  return '<div class="nt-tbar" id="nt-tbar">'
    +'<button class="nt-tbar-b" onmousedown="return false" '
      +'onclick="NT.addRow()" title="Add a row under this one">+ row</button>'
    +'<button class="nt-tbar-b" id="nt-tbar-del" onmousedown="return false" '
      +'onclick="NT.delRow()" title="Take this row out">− row</button>'
    +'</div>';
}

/* ══ LINKS ═══════════════════════════════════════════════════════════
   An address written in a note is a thing to go to, not a piece of
   text about a place.

   Three moments make one: an address becomes a link when it is pasted
   and again when the caret leaves the body, so typing one and clicking
   away is enough; the `link` button puts a link on whatever words are
   selected; and a press on any link opens it in a new tab. Editing a
   link's text means selecting across it — the price of a plain click
   meaning *go*, which is the trade the Ledger's notes already make. */
function safeHref(raw){
  var href=String(raw==null?'':raw).trim();
  if(!href||/[\u0000-\u001f\u007f]/.test(href))return '';
  if(/^www\./i.test(href))href='https://'+href;
  else if(/^\/\//.test(href))href='https:'+href;
  try{
    var url=new URL(href);
    /* nothing but the web and the post: a file:// or javascript: href
       written into a note would run against the app itself */
    return /^(https?:|mailto:)$/i.test(url.protocol)?url.href:'';
  }catch(e){return '';}
}
/* A sentence's full stop is not part of its address, and neither is the
   bracket a link was written inside. A closing bracket is only trimmed
   when the address does not open one of its own. */
function trimTail(token){
  var cut=token.length;
  while(cut>0){
    var c=token.charAt(cut-1);
    if('.,;:!?’"\''.indexOf(c)>=0){cut--;continue;}
    if(c===')'){
      var head=token.slice(0,cut);
      if((head.split(')').length-1)>(head.split('(').length-1)){cut--;continue;}
    }
    break;
  }
  return {url:token.slice(0,cut),tail:token.slice(cut)};
}
function linkify(root){
  var changed=false;
  (function walk(node){
    [].slice.call(node.childNodes).forEach(function(child){
      if(child.nodeType===1){
        if(child.tagName!=='A')walk(child);
        return;
      }
      if(child.nodeType!==3)return;
      var text=child.nodeValue||'';
      /* the last alternative is a bare email address: Mark's notes are
         full of them written plainly, and Word only makes a link of the
         ones it happened to autoformat */
      var rx=/(?:https?:\/\/|mailto:|www\.)[^\s<>]+|[^\s<>@]+@[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}/gi;
      var m,last=0,frag=null;
      while((m=rx.exec(text))){
        /* a prefix buried inside a longer word is ordinary text */
        if(m.index&&!/[\s([{"'<>:;,]/.test(text.charAt(m.index-1)))continue;
        var part=trimTail(m[0]);
        var href=safeHref(/^[a-z]+:|^www\./i.test(part.url)?part.url:'mailto:'+part.url);
        if(!href)continue;
        if(!frag)frag=document.createDocumentFragment();
        frag.appendChild(document.createTextNode(text.slice(last,m.index)));
        var a=document.createElement('a');
        a.href=href;a.target='_blank';a.rel='noopener noreferrer';
        a.textContent=part.url;
        frag.appendChild(a);
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
/* execCommand's createLink writes the href and nothing else, so every
   link it leaves behind would open over the top of the app. */
function dressLinks(root){
  if(!root)return;
  [].forEach.call(root.querySelectorAll('a[href]'),function(a){
    a.setAttribute('target','_blank');
    a.setAttribute('rel','noopener noreferrer');
  });
}
/* Linkifying while the caret is in the middle of a word would move it,
   so it waits for the caret to leave. */
NT.leftBody=function(){
  var b=el('nt-body');
  var bar=el('nt-tbar');
  if(bar)bar.classList.remove('on');
  if(!b||!byId(panel.id))return;
  if(linkify(b)){dressLinks(b);NT.typedBody();}
};
NT.openLink=function(e){
  var t=e&&e.target;
  var a=t&&t.closest?t.closest('a'):null;
  if(!a)return;
  var href=safeHref(a.getAttribute('href'));
  if(!href)return;
  e.preventDefault();
  e.stopPropagation();
  var w=window.open(href,'_blank','noopener,noreferrer');
  if(w)w.opener=null;
};

/* The address is asked for in the room's own popup rather than a
   prompt() — a native dialog is the one piece of chrome this app never
   shows. Which costs the selection: focusing the popup's box takes it,
   so the range is kept by hand and put back before the command runs. */
var linkRange=null;
NT.linkBox=function(){
  var b=el('nt-body');
  if(!b)return;
  linkRange=null;
  try{
    var s=window.getSelection();
    if(s&&s.rangeCount&&b.contains(s.getRangeAt(0).commonAncestorContainer))
      linkRange=s.getRangeAt(0).cloneRange();
  }catch(e){}
  if(!linkRange||linkRange.collapsed){
    Hub.note('Select the words the link should sit on first.',4000);
    return;
  }
  openPop(el('nt-link'),
    '<input id="nt-linkq" placeholder="https://…" autocomplete="off" '
    +'spellcheck="false" onkeydown="NT.linkKey(event)">'
    +'<div class="nt-pop-quiet">Enter to make the link. An address '
    +'written straight into a note becomes one on its own.</div>');
  popKind='link';
  el('nt-linkq').focus();
};
NT.linkKey=function(e){
  if(e.key!=='Enter')return;
  e.preventDefault();
  var b=el('nt-body'),inp=el('nt-linkq');
  var href=safeHref(inp?inp.value:'');
  if(!href){
    Hub.note('That is not an address this can open — http, https or mailto.',5000);
    return;
  }
  closePop();
  if(!b||!linkRange)return;
  b.focus();
  try{
    var s=window.getSelection();
    s.removeAllRanges();
    s.addRange(linkRange);
    document.execCommand('createLink',false,href);
  }catch(err){console.error('notes: could not make the link',err);}
  linkRange=null;
  dressLinks(b);
  NT.typedBody();
};

/* deleting takes two presses on the same button, because a native
   confirm() dialog is the one piece of chrome this app never shows */
var armT=null;
NT.del=function(){
  var b=el('nt-del');
  if(!b)return;
  if(!b.classList.contains('armed')){
    b.classList.add('armed');b.textContent='Press again to delete';
    armT=setTimeout(function(){
      var x=el('nt-del');
      if(x){x.classList.remove('armed');x.textContent='Delete';}
    },3000);
    return;
  }
  clearTimeout(armT);
  var id=panel.id;
  panel={id:null,slot:null};
  store.notes=store.notes.filter(function(x){return x.id!==id;});
  save(true);
};

/* ══ TAGS ═════════════════════════════════════════════════════════════
   Free text with autocomplete over the tags that already exist — no
   curated list, no admin screen. Enter or comma commits what is typed;
   Backspace in an empty box takes the last chip back. Adding or
   dropping one is structural, so the shelf answers immediately — and
   the open panel travels with its note if the change re-files it. */
function tagChipsHTML(n){
  var h='';
  (n.tags||[]).forEach(function(t,i){
    /* the chip is a way out as well as a label: pressing it makes that
       tag's book on the spot, with this note still open inside it */
    h+='<span class="nt-chip" role="button" tabindex="0" '
      +'title="Open everything tagged ‘'+esc(dispOf(t))+'’ as a book" '
      +'onclick="NT.openTag(\''+jsq(t)+'\')">'+esc(dispOf(t))
      +'<button onclick="NT.dropTag('+i+');event.stopPropagation()" '
      +'aria-label="Remove tag">×</button></span>';
  });
  h+='<input id="nt-taginput" placeholder="add a tag…" autocomplete="off"'
    +' spellcheck="false" oninput="NT.tagSuggest()" onkeydown="NT.tagKey(event)">';
  return h;
}
function addTag(text){
  var n=byId(panel.id),k=keyOf(text);
  if(!n||!k)return;
  var have=(n.tags||[]).some(function(t){return keyOf(t)===k;});
  /* a tag the room already knows is stored in the room's spelling of it,
     whatever case it was typed in */
  if(!have){n.tags.push(CANON[k]||dispOf(text));touch(n);save(true);}
  else closePop();
  var ti=el('nt-taginput');
  if(ti)ti.focus();
}
NT.dropTag=function(i){
  var n=byId(panel.id);if(!n)return;
  n.tags.splice(i,1);touch(n);save(true);
  var ti=el('nt-taginput');
  if(ti)ti.focus();
};

var popRows=[],popSel=-1,popKind='';
NT.tagSuggest=function(){
  var n=byId(panel.id),inp=el('nt-taginput');
  if(!n||!inp)return;
  var q=keyOf(inp.value);
  var have={};(n.tags||[]).forEach(function(t){have[keyOf(t)]=1;});
  var opts=tally(store.notes,{}).filter(function(t){
    return !have[t.key]&&(!q||t.key.indexOf(q)>=0);
  });
  opts.sort(function(a,b){return b.notes.length-a.notes.length
    ||(a.key<b.key?-1:1);});
  opts=opts.slice(0,8);
  popRows=[];var h='';
  var exact=opts.some(function(t){return t.key===q;});
  if(q&&!exact){
    popRows.push({tag:inp.value});
    h+='<div class="nt-pop-row" onclick="NT.pick(0)"><b>'+esc(dispOf(inp.value))
      +'</b><span class="nt-pop-n">new tag</span></div>';
  }
  opts.forEach(function(t){
    var i=popRows.length;
    popRows.push({tag:t.display});
    h+='<div class="nt-pop-row" onclick="NT.pick('+i+')">'+esc(t.display)
      +'<span class="nt-pop-n">'+t.notes.length+'</span></div>';
  });
  if(!popRows.length){closePop();return;}
  popKind='tag';popSel=0;
  openPop(inp,h);
  markSel();
};
NT.tagKey=function(e){
  var inp=el('nt-taginput');
  if(e.key==='Enter'||e.key===','){
    e.preventDefault();
    if(popKind==='tag'&&popSel>=0&&popRows[popSel])addTag(popRows[popSel].tag);
    else if(inp.value.trim())addTag(inp.value);
    return;
  }
  if(e.key==='Backspace'&&!inp.value){
    var n=byId(panel.id);
    if(n&&n.tags.length){e.preventDefault();NT.dropTag(n.tags.length-1);}
    return;
  }
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    if(popKind!=='tag')return;
    e.preventDefault();
    popSel=(popSel+(e.key==='ArrowDown'?1:popRows.length-1))%popRows.length;
    markSel();
    return;
  }
  if(e.key==='Escape'&&!el('nt-pop').hidden){e.stopPropagation();closePop();}
};
NT.pick=function(i){if(popRows[i])addTag(popRows[i].tag);};
function markSel(){
  [].forEach.call(el('nt-pop').querySelectorAll('.nt-pop-row'),function(r,i){
    r.classList.toggle('sel',i===popSel);
  });
}

/* ══ THE POPUP, AND WHERE IT LANDS ════════════════════════════════════
   The pane's transform is the trap the brief names: inside it a
   position:fixed box is measured against the scrolled content, so any
   box anchored to a control by arithmetic alone drifts the moment the
   pane has scrolled — this is how every Ledger menu once drew
   off-screen. So nothing is trusted: the box is parked at 0,0, asked
   where it actually landed, and moved by the difference between that
   and where the anchor really is. Wherever the origin turns out to be,
   the subtraction cancels it. Placement re-runs when the contents
   change size — the tag list grows as it is filtered — and the box
   flips above its anchor when the pane's floor is too close. */
var popAnchor=null;
function openPop(anchor,html){
  var pop=el('nt-pop');
  pop.innerHTML=html;
  pop.hidden=false;
  popAnchor=anchor;
  placePop();
}
function placePop(){
  var pop=el('nt-pop');
  if(!popAnchor||pop.hidden||!popAnchor.isConnected)return;
  pop.style.left='0px';pop.style.top='0px';
  var zero=pop.getBoundingClientRect(),a=popAnchor.getBoundingClientRect();
  var paneR=document.body.getBoundingClientRect();
  var w=pop.offsetWidth,hgt=pop.offsetHeight;
  var left=a.left-zero.left;
  if(a.left+w>paneR.right-14)left-=(a.left+w)-(paneR.right-14);
  var below=a.bottom+4+hgt<=paneR.bottom-10;
  var above=a.top-4-hgt>=paneR.top+66;   /* 66: the ribbon, plus a breath */
  var top=(below||!above)?(a.bottom+4-zero.top):(a.top-4-hgt-zero.top);
  pop.style.left=left+'px';pop.style.top=top+'px';
}
function closePop(){var pop=el('nt-pop');
  if(pop){pop.hidden=true;pop.innerHTML='';}
  popRows=[];popSel=-1;popKind='';popAnchor=null;}

/* ══ THE ROOM'S SURFACE ═══════════════════════════════════════════════
   What the bridge and the other rooms may ask for.

   There were two more until 2026-09-03: setRefSource and setRefOpen, the
   two halves of a socket the bridge filled with the Ledger's projects and
   calls and the Atlas's researchers, so that a note could carry a list of
   things elsewhere in the app that it pointed at. Mark had it and did not
   use it — a note here is general memory, not a record attached to one
   proposal — so the row of chips, the picker, the socket and the thirty
   lines of bridge that filled it are all gone. Old notes may still carry
   a `refs` array; nothing reads it, and it is left where it lies rather
   than rewriting saved data for tidiness.

   state and applyState are this room's half of the app's one Export /
   Import door, named exactly as Semaphore names them so the Ledger can
   ask every room the same question. Until they existed the notes were
   the only thing in the app that rode in no file at all: a browser
   cleared on a Tuesday took the whole heap with it, and there was
   nothing to import back. A file written before this simply has no
   `notes` key, and importing it leaves the heap alone. */
Hub.expose('notes',{
  /* Deep-copied on the way out, because the caller holds the result while
     the room carries on being edited, and a live reference would let a
     note typed after the export change what the export said. */
  state:function(){
    try{return JSON.parse(JSON.stringify(store));}catch(e){return null;}
  },
  /* An import replaces the heap rather than merging into it. Two heaps of
     notes have no honest key to merge on — the same thought written on
     two machines is two notes with two ids, and merging by id would join
     nothing while merging by title would join things that are not the
     same note. A swap can be undone by importing the other file back; a
     half-merge cannot be undone at all.

     What arrives is trusted for its content and not for its shape: a
     note missing its tags array would throw inside the arithmetic on the
     next shelve, far from the file that caused it, so the shape is made
     good here where the file is still in hand. */
  applyState:function(s){
    if(!s||!(s.notes instanceof Array))return false;
    store={v:1,notes:s.notes,
      shelf:(s.shelf instanceof Array)?s.shelf:[],
      view:(s.view==='tags')?'tags':'shelf',
      ties:(s.ties instanceof Array)?s.ties:[],
      /* the three hand-made facts travel with the notes, or an import
         would quietly throw away every colour and every pin */
      colors:(s.colors&&typeof s.colors==='object')?s.colors:{},
      pins:(s.pins&&typeof s.pins==='object')?s.pins:{}};
    var now=Date.now();
    store.notes.forEach(function(n){
      if(!n.id)n.id=uid();
      if(typeof n.title!=='string')n.title='';
      if(typeof n.body!=='string')n.body='';
      if(!(n.tags instanceof Array))n.tags=[];
      if(!n.created)n.created=now;
      if(!n.edited)n.edited=n.created;
    });
    /* Whatever was open belonged to the old heap and its id means nothing
       in the new one, so the room comes back to the top of the shelf. */
    cur='*';curTemp=false;curPage=null;SQ='';panel={id:null,slot:null};
    arranging=false;editing=false;
    save(true);
    return true;
  }
});

/* ══ LISTENERS AND BOOT ═══════════════════════════════════════════════
   Keys arrive through the Hub's routed document listener, gated on this
   room being the visible one, so Escape here never closes anything in
   another room. Clicks land on the pane and close a popup left open;
   so does scrolling the pane, because a box anchored to a control that
   has slid under the ribbon should not stay behind on its own. */
document.addEventListener('keydown',function(e){
  if(e.key!=='Escape')return;
  if(!el('nt-pop').hidden){closePop();return;}
  if(panel.id)NT.close();
});
document.addEventListener('click',function(e){
  var pop=el('nt-pop');
  if(pop.hidden)return;
  if(pop.contains(e.target))return;
  if(e.target&&(e.target.id==='nt-taginput'||e.target.id==='nt-make'))return;
  closePop();
},true);
document.addEventListener('scroll',function(e){
  /* scrolling the suggestion list is using the popup, not leaving it */
  var pop=el('nt-pop');
  if(pop&&e.target&&pop.contains&&pop.contains(e.target))return;
  closePop();
},true);
window.addEventListener('resize',function(){closePop();});

window.NT=NT;
shelve();
render();

});
