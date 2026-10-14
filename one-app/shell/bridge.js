/* ══════════════════════════════════════════════════════════════════════
   Bridge — what the five rooms say to each other.

   Chiefly one thing, done thoroughly: any researcher the Atlas knows
   about becomes a link wherever their name is written, in the Ledger or
   in Semaphore, without either app being told about it. The work happens
   on the rendered DOM, so it covers names typed into fields that were
   saved long ago as much as ones typed a second ago.

   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* The Atlas parses its 2.1MB blob at boot and hands the result over, so
     this does not parse it a second time. The fallback only runs if that
     ever stops being exposed. */
  var G = Hub.api('atlas').G || null;
  if (!G) {
    try {
      var tag = document.querySelector('#pane-atlas #G');
      if (tag) G = JSON.parse(tag.textContent);
    } catch (e) { console.error('Bridge: could not read the atlas', e); }
  }
  if (!G || !G.researchers) return;

  var R = G.researchers;

  /* ── who the atlas knows, and what they might be called ───────────── */

  function fold(s) {
    try { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
    catch (e) { return s; }
  }
  /* "Mark de Berg" -> "de Berg";  "Nikolay Yakovets" -> "Yakovets" */
  function surnameOf(name) {
    var parts = name.split(/\s+/);
    for (var i = 1; i < parts.length; i++) {
      if (/^[a-z]/.test(parts[i])) return parts.slice(i).join(' ');
    }
    return parts[parts.length - 1];
  }

  var byVariant = Object.create(null);   /* lowercased variant -> rid */
  var surnameCount = Object.create(null);

  R.forEach(function (r) {
    var sn = surnameOf(r.name).toLowerCase();
    surnameCount[sn] = (surnameCount[sn] || 0) + 1;
  });

  R.forEach(function (r, rid) {
    if (!r || !r.name) return;
    var name = r.name.trim();
    var first = name.split(/\s+/)[0];
    var sn = surnameOf(name);
    var vs = [name, fold(name)];
    if (first && sn && first !== sn) {
      vs.push(first[0] + '. ' + sn, first[0] + ' ' + sn,
              fold(first[0] + '. ' + sn), fold(first[0] + ' ' + sn));
    }
    /* a bare surname only when it can mean exactly one person */
    if (surnameCount[sn.toLowerCase()] === 1 && sn.length > 3) {
      vs.push(sn, fold(sn));
    }
    vs.forEach(function (v) {
      v = v.trim();
      if (v.length < 4) return;
      var k = v.toLowerCase();
      if (!(k in byVariant)) byVariant[k] = rid;
    });
  });

  var variants = Object.keys(byVariant).sort(function (a, b) { return b.length - a.length; });
  if (!variants.length) return;

  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  var RX;
  try {
    RX = new RegExp(
      "(?<![\\p{L}\\p{N}'\u2019-])(" + variants.map(esc).join('|') + ")(?![\\p{L}\\p{N}'\u2019-])",
      'giu');
  } catch (e) {
    RX = new RegExp('\\b(' + variants.map(esc).join('|') + ')\\b', 'gi');
  }

  /* ── linkifying ───────────────────────────────────────────────────── */

  /* `svg` twice over: an HTML page reports its own elements' names in
     capitals but an inline SVG's in the case it was written, so `SVG`
     alone never matched and a name inside a chart's text was wrapped in
     an HTML link the drawing cannot show. */
  var SKIP_TAGS = {
    SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1,
    NOSCRIPT: 1, SVG: 1, svg: 1, CANVAS: 1, TITLE: 1
  };

  /* one element, not its whole ancestry */
  function closedElement(el) {
    return !!(SKIP_TAGS[el.tagName] ||
              (el.classList && el.classList.contains('atlas-ref')) ||
              (el.hasAttribute && el.hasAttribute('data-noatlas')) ||
              el.isContentEditable);
  }
  /* used only for the loose text nodes a mutation hands us directly */
  function skippable(node) {
    for (var el = node.parentNode; el && el.nodeType === 1; el = el.parentNode) {
      if (closedElement(el)) return true;
      if (el.classList && el.classList.contains('pane')) return false;
    }
    return false;
  }

  function linkifyTextNode(tn) {
    var text = tn.nodeValue;
    if (!text || text.length < 4 || text.length > 4000) return false;

    /* one pass: the old code ran test() and then exec() over the same
       string, scanning every node twice to find the ones with no names */
    RX.lastIndex = 0;
    var frag = null, last = 0, m;
    while ((m = RX.exec(text))) {
      var rid = byVariant[m[1].toLowerCase()];
      if (rid === undefined) continue;
      if (!frag) frag = document.createDocumentFragment();
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      var a = document.createElement('a');
      a.className = 'atlas-ref';
      a.setAttribute('data-rid', rid);
      a.setAttribute('title', 'Atlas — ' + R[rid].name);
      a.textContent = m[1];
      frag.appendChild(a);
      last = m.index + m[1].length;
    }
    if (!frag) return false;
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    tn.parentNode.replaceChild(frag, tn);
    return true;
  }

  function sweep(rootNode) {
    if (!rootNode || rootNode.nodeType === 3) {
      if (rootNode && !skippable(rootNode)) linkifyTextNode(rootNode);
      return;
    }
    if (rootNode.nodeType !== 1) return;
    /* walking elements as well as text lets REJECT prune a whole subtree —
       with a text-only walker it behaved as SKIP and every node inside a
       closed element was still visited and still had its ancestry walked */
    if (closedElement(rootNode)) return;
    var walker = document.createTreeWalker(
      rootNode, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
        acceptNode: function (n) {
          if (n.nodeType === 1) {
            return closedElement(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      });
    var batch = [], n;
    while ((n = walker.nextNode())) batch.push(n);
    batch.forEach(linkifyTextNode);
  }

  function watch(paneId) {
    var root = document.getElementById('pane-' + paneId);
    if (!root) return;

    /* per-watcher: a shared flag let one room's flush swallow the other
       room's mutations for the duration */
    var pending = [], timer = null, busy = false;
    var WATCH = { childList: true, subtree: true, characterData: true };
    function flush() {
      timer = null;
      var nodes = pending; pending = [];
      busy = true;
      obs.disconnect();
      try { nodes.forEach(sweep); }
      catch (e) { console.error('Bridge sweep', e); }
      obs.observe(root, WATCH);
      busy = false;
      /* anything that arrived while we were rewriting still deserves a look */
      if (pending.length && !timer) timer = setTimeout(flush, 140);
    }
    var obs = new MutationObserver(function (records) {
      if (busy) return;
      for (var i = 0; i < records.length; i++) {
        var rec = records[i];
        if (rec.type === 'characterData') pending.push(rec.target);
        else for (var j = 0; j < rec.addedNodes.length; j++) pending.push(rec.addedNodes[j]);
      }
      if (pending.length && !timer) timer = setTimeout(flush, 140);
    });

    busy = true;
    sweep(root);
    busy = false;
    obs.observe(root, WATCH);
  }

  /* The Call Board is left out on purpose: it holds several megabytes of
     Commission prose and no TU/e names, so scanning it would cost a lot
     and find nothing. */
  ['ledger', 'semaphore'].forEach(watch);

  /* ── the Atlas's dossier, lent to the other rooms ─────────────────── */

  /* The dossier is a fixed panel that slides in from the right, and it
     lives inside the Atlas's pane. Rather than travel to the room to see
     it, the pane is made visible with its body hidden, so the panel alone
     floats over whichever room you are standing in. The pane lets clicks
     through; only the panel takes them. */
  var atlasPane = document.getElementById('pane-atlas');
  var dossier = atlasPane && atlasPane.querySelector('#dossier');
  var lending = false;

  function lendDossier() {
    if (!atlasPane || Hub.active() === 'atlas') return;
    lending = true;
    atlasPane.classList.add('oa-lending');
  }
  function returnDossier() {
    if (!lending) return;
    lending = false;
    if (atlasPane) atlasPane.classList.remove('oa-lending');
  }

  /* the panel is closed by its own button, by Escape, by clicking away —
     all of which end in the same class coming off, so that is what is
     watched rather than each of the ways in */
  if (dossier) {
    new MutationObserver(function () {
      if (!dossier.classList.contains('open')) returnDossier();
    }).observe(dossier, { attributes: true, attributeFilter: ['class'] });
  }
  Hub.onRoom(function () { returnDossier(); });

  function showResearcher(rid) {
    var api = Hub.api('atlas');
    if (!Hub.pane('atlas') || !api.openDossier) {
      Hub.note('The Atlas did not start — see the console'); return;
    }
    lendDossier();
    try { api.openDossier(rid); }
    catch (e) { console.error(e); returnDossier(); }
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && lending && dossier) {
      e.stopPropagation();
      dossier.classList.remove('open');
    }
  }, true);

  /* Three of the panel's own buttons — Show on map, Walk from here, and a
     concept chip — answer by redrawing the Atlas itself. Lent, that
     redraw happened behind whichever room you were in: the panel closed
     and nothing else appeared to happen. So a press on one of them takes
     you to the Atlas first, and the Atlas's own handler then runs in a
     room you can see. */
  if (dossier) dossier.addEventListener('click', function (e) {
    if (!lending) return;
    var b = e.target.closest && e.target.closest('[data-dmap],[data-dwalk],[data-node]');
    if (b && dossier.contains(b)) Hub.go('atlas');
  }, true);

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('.atlas-ref');
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    showResearcher(+a.getAttribute('data-rid'));
  }, true);

  /* ── the Call Board's reader, lent the same way ────────────────────── */

  /* The panel that reads a Horizon topic out in full, borrowed exactly as
     the dossier is: a project in the Ledger that names a topic should be
     able to show it without the trip to another room. One difference —
     the reader is a modal in its own room and stays one here, so its
     scrim comes with it and takes the clicks that close it.

     The Board is the lazy room: three and a half megabytes of Commission
     prose are not built until it is first opened. Anything reaching into
     it has to ask the Hub to build it, and this is the only place that
     asks. */
  var cbPane = document.getElementById('pane-callboard');
  var reader = cbPane && cbPane.querySelector('#reader');
  var lendingReader = false;

  function lendReader() {
    if (!cbPane || Hub.active() === 'callboard') return;
    lendingReader = true;
    cbPane.classList.add('oa-lending');
  }
  function returnReader() {
    if (!lendingReader) return;
    lendingReader = false;
    if (cbPane) cbPane.classList.remove('oa-lending');
  }
  if (reader) {
    new MutationObserver(function () {
      if (!reader.classList.contains('open')) returnReader();
    }).observe(reader, { attributes: true, attributeFilter: ['class'] });
  }
  Hub.onRoom(function () { returnReader(); });

  function callboard() {
    Hub.ensure('callboard');
    return Hub.api('callboard');
  }
  function showTopic(id) {
    var api = callboard();
    if (!api.openReader) {
      Hub.note('The Call Board did not start — see the console'); return;
    }
    lendReader();
    try {
      if (!api.openReader(id)) {
        returnReader();
        Hub.note('That topic is not on the Call Board');
      }
    } catch (e) { console.error(e); returnReader(); }
  }

  /* The Board binds its own Escape, but keys reach the room that is
     showing — and while the reader is lent, that is some other room. */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !lendingReader) return;
    e.stopPropagation();
    var close = Hub.api('callboard').closeReader;
    if (close) close(); else returnReader();
  }, true);

  /* ── the topic a project was written for ──────────────────────────── */

  /* The Ledger keeps a programme whose projects are each written for one
     Horizon topic. It stores the topic's id and what was written on it
     the day it was picked, so a project card draws without any of this;
     these two functions are the whole of the rest. The list is asked for
     only when one of the project forms is opened, which is what keeps the
     Board unbuilt for anyone who never links a project to a topic. */
  (function () {
    var L = Hub.api('ledger');
    if (!L.setTopics) return;
    L.setTopics({
      list: function () {
        var api = callboard();
        return api.topics ? api.topics() : [];
      },
      open: showTopic
    });
  })();

  /* ── Semaphore's arena drawer, lent the same way ─────────────────── */

  /* A lead card on the Ledger names its arena, and Mark asked on
     2026-10-06 for that name to open the arena's drawer where he is
     standing rather than carry him off to the Semaphore. So the drawer is
     borrowed as the dossier and the reader are: the pane is shown with its
     board hidden, and only the drawer, its scrim and any box it raises
     take clicks. Everything pressed in it is the Semaphore's own handler
     doing what it always does — a lead changed there saves, and the save
     redraws the Ledger's line underneath. */
  var semPane = document.getElementById('pane-semaphore');
  var semCard = semPane && semPane.querySelector('#card');
  var lendingArena = false;

  function lendArena() {
    if (!semPane || Hub.active() === 'semaphore') return;
    lendingArena = true;
    semPane.classList.add('oa-lending');
  }
  function returnArena() {
    if (!lendingArena) return;
    lendingArena = false;
    if (semPane) semPane.classList.remove('oa-lending');
  }
  if (semCard) {
    new MutationObserver(function () {
      if (!semCard.classList.contains('open')) returnArena();
    }).observe(semCard, { attributes: true, attributeFilter: ['class'] });
  }
  Hub.onRoom(function () { returnArena(); });

  function showArena(aid) {
    var api = Hub.api('semaphore');
    if (!Hub.pane('semaphore') || !api.openArena) {
      Hub.note('The Semaphore did not start — see the console'); return;
    }
    lendArena();
    try { api.openArena(aid); }
    catch (e) { console.error(e); returnArena(); }
    if (semCard && !semCard.classList.contains('open')) returnArena();
  }

  /* The room's own Escape is gated on the room being the one showing, and
     while its drawer is lent it is not. */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !lendingArena) return;
    e.stopPropagation();
    var esc = Hub.api('semaphore').escape;
    if (esc) esc(); else returnArena();
  }, true);

  /* ── Semaphore's leads, on the Ledger's board ─────────────────────── */

  /* The Ledger draws a line of leads under its board, and the cards it opens
     out of that line change the leads themselves — one record, which is what
     Mark asked for on 2026-10-06. The Ledger is handed a socket the way it is
     handed the Call Board's topics: a read, a write, the arenas a new lead
     may be filed under, and the arena's drawer, lent over the Ledger — and
     nothing about Semaphore beyond them.

     A change made on either side reaches the other by the same road. Semaphore
     emits `semaphore:saved` on every save, whichever room the change was made
     in, and that redraws the Ledger's line; a board replaced from the cloud is
     written without the event, so the line is also read again whenever the
     Ledger comes back into view. */
  (function () {
    var L = Hub.api('ledger'), S = Hub.api('semaphore');
    if (!L.setLeads || !S.leads || !S.leadVerb) return;
    L.setLeads({
      list: function () { return S.leads(); },
      change: function (aid, lid, op, val) { return S.leadVerb(aid, lid, op, val); },
      arenas: function () { return S.arenas ? S.arenas() : []; },
      add: function (aid, v) { return S.leadAdd ? S.leadAdd(aid, v) : null; },
      open: showArena
    });
    Hub.on('semaphore:saved', function () { L.leadsChanged(); });
    Hub.onRoom(function (now) { if (now === 'ledger') L.leadsChanged(); });

    /* A lead completed as having become a project, on either side (Mark,
       2026-10-11): projects are the Ledger's, so the Ledger opens its new
       project with the lead's name and links filled in. A drawer lent over
       the Ledger is put away first, or the form would open under it. */
    Hub.on('semaphore:project', function (p) {
      if (!L.PL || typeof L.PL.showNewForm !== 'function' || !p) return;
      if (lendingArena && S.escape) S.escape();
      if (Hub.active() !== 'ledger') Hub.go('ledger');
      try { L.PL.showNewForm({ name: p.name || '', links: p.links || [] }); }
      catch (e) { console.error(e); }
    });
  })();

  /* ── the ring ─────────────────────────────────────────────────────── */

  /* A line of glyphs, one to a room. The one at the right-hand end is the
     room you are in, and it sits where each app's own glyph used to, a
     gap to the left of the title. Click any other and the line walks
     until that glyph takes the right-hand place — the walk and the page
     change are the same gesture.

     The order below is the order on the line, and how many there are is
     the width shell.css reserves for it: adding a room here means moving
     the two numbers named at #oa-ring. */

  var ROOMS = [{"id": "ledger", "label": "Proposal Ledger", "sub": "proposals in flight"}, {"id": "semaphore", "label": "Brokerage Semaphore", "sub": "brokerage watch"}, {"id": "callboard", "label": "Call Board", "sub": "Horizon Europe 2026\u201327"}, {"id": "atlas", "label": "Researcher Atlas", "sub": "researcher atlas"}, {"id": "notes", "label": "Notes", "sub": "a shelf that files itself"}];
  /* what each room calls itself in the bar now */
  var TITLES = {
    ledger: 'Proposal Ledger', semaphore: 'Brokerage Semaphore',
    callboard: 'Call Board', atlas: 'Researcher Atlas', notes: 'Notes'
  };
  /* per room: the element that carries the bar, and the wordmark to hide
     now that the shell writes the name. Notes was written after the shell
     already wrote the name, so it never gave itself one to hide. */
  var ROOM = {
    ledger:    { bar: '.hdr',              mark: '.hdr-mark' },
    semaphore: { bar: 'header.top',        mark: 'header.top .mark h1' },
    callboard: { bar: '.tabs',             mark: null },
    atlas:     { bar: '#app > header',     mark: '#app > header .wordmark' },
    notes:     { bar: '.nt-bar',           mark: null }
  };
  function el(pid, which) {
    var pane = document.getElementById('pane-' + pid);
    var sel = ROOM[pid] && ROOM[pid][which];
    return (pane && sel) ? pane.querySelector(sel) : null;
  }

  /* the one beam, worn by whichever element each app already used as its
     header — the Board's is its cluster row */
  /* the Ledger's header lives inside its centred board column; lifted to
     the top of the room it is full width without any vw arithmetic */
  (function () {
    var pane = document.getElementById('pane-ledger');
    var hdr = pane && pane.querySelector('.hdr');
    if (hdr && hdr.parentNode !== pane) pane.insertBefore(hdr, pane.firstChild);
  })();

  Object.keys(ROOM).forEach(function (pid) {
    if (!Hub.pane(pid)) return;
    var bar = el(pid, 'bar');
    if (bar) bar.classList.add('oa-bar');
  });

  var ring = document.getElementById('oa-ring');
  var sweepEl = document.getElementById('oa-sweep');
  var order = ROOMS.map(function (r) { return r.id; });
  var moving = false;

  function glyph(pid) {
    var b = document.createElement('button');
    b.className = 'oa-g';
    b.setAttribute('data-room', pid);
    var r = ROOMS.filter(function (x) { return x.id === pid; })[0];
    b.setAttribute('title', TITLES[pid] + (r ? ' — ' + r.sub : ''));
    b.setAttribute('aria-label', TITLES[pid]);
    var g = document.createElement('span');
    g.className = 'g g-' + pid;
    b.appendChild(g);
    b.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      moveTo(pid);
    });
    ring.appendChild(b);
    return b;
  }
  var glyphs = {};
  order.forEach(function (pid) { glyphs[pid] = glyph(pid); });

  function place() {
    order.forEach(function (pid, i) {
      var b = glyphs[pid];
      if (!b) return;
      var here = (i === order.length - 1);
      b.style.setProperty('--slot', i);
      b.classList.toggle('on', here);
      /* the mark at the right point is the room you are in, and that has
         to be said as well as drawn */
      if (here) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
  }

  /* The room you are in stands at the right of the line, against the
     title. Choosing another walks it along to that place and lets the
     rest close up behind it, keeping their order. */
  function moveTo(pid, instant) {
    if (order.indexOf(pid) < 0) return;
    if (!instant && (moving || order[order.length - 1] === pid)) {
      if (order[order.length - 1] === pid) Hub.go(pid);
      return;
    }
    order = order.filter(function (x) { return x !== pid; }).concat([pid]);

    if (instant) {
      ring.classList.add('still');
      place();
      void ring.offsetWidth;
      ring.classList.remove('still');
      Hub.go(pid);
      return;
    }
    moving = true;
    ring.classList.add('walking');
    place();
    setTimeout(function () { Hub.go(pid); }, 240);
    setTimeout(function () { moving = false; ring.classList.remove('walking'); }, 600);
  }

  /* ── the name ────────────────────────────────────────────────────── */

  /* Written by the shell, not by the rooms. Four marks in four different
     apps sat in four different DOM contexts and measured differently no
     matter what was done to them; one element cannot disagree with
     itself. Each app's own wordmark is hidden and its bar is given
     exactly enough left padding to clear this one. */

  var titleEl = document.getElementById('oa-title');

  Object.keys(ROOM).forEach(function (pid) {
    var m = el(pid, 'mark');
    if (m) m.classList.add('oa-hidden-mark');
  });

  titleEl.addEventListener('click', function () {
    if (Hub.active() !== 'ledger') return;
    var api = Hub.api('ledger');
    if (api.PL && api.PL.home) { try { api.PL.home(); } catch (e) {} }
  });

  function nameRoom(pid) {
    titleEl.textContent = TITLES[pid] || '';
    titleEl.classList.toggle('home', pid === 'ledger');
    titleEl.setAttribute('title', pid === 'ledger' ? 'Back to the horizon' : '');
    /* the bar must start after the name, and the names are not equal */
    var bar = el(pid, 'bar');
    if (!bar) return;
    /* measure whichever of the two is actually on screen — the name is
       dropped on narrow screens and the glyph line carries the room */
    var anchor = titleEl.offsetWidth ? titleEl : ring;
    var clear = Math.round(anchor.getBoundingClientRect().right + 22);
    bar.style.setProperty('padding-left', clear + 'px', 'important');
    /* the same measurement, for the ground the line of rooms stands on */
    document.documentElement.style.setProperty('--oa-clear', clear + 'px');
  }

  /* The serif arrives after the first paint, and it is wider than the
     fallback — measuring before it lands puts the bar's controls under
     the name. Re-measured when the font is ready, and whenever the
     window changes shape. */
  function remeasure() {
    var pid = Hub.active();
    if (pid) nameRoom(pid);
  }
  try {
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
  } catch (e) {}
  window.addEventListener('resize', remeasure);
  window.addEventListener('orientationchange', function () {
    setTimeout(remeasure, 260);
  });
  setTimeout(remeasure, 400);

  /* ── the page change ──────────────────────────────────────────────── */

  Hub.onRoom(function (pid) {
    nameRoom(pid);
    /* anything may call Hub.go — a keyboard shortcut, a cross-app jump.
       The line follows rather than being the only way to move. */
    if (order[order.length - 1] !== pid && order.indexOf(pid) >= 0) {
      order = order.filter(function (x) { return x !== pid; }).concat([pid]);
      place();
    }
    sweepEl.classList.remove('run');
    void sweepEl.offsetWidth;
    sweepEl.classList.add('run');
  });

  /* One digit per room, all five of them — the test stopped at 4 from
     before the Notes room existed. Read from the key's place rather than
     its character, because on an iPad or Mac keyboard Option and 1 types ¡
     and the shortcut never fired there at all. Not while a room has a box open over
     itself: the veil is how a room says a form is waiting, and walking
     away from one left it waiting in a room nobody could see. */
  document.addEventListener('keydown', function (e) {
    var d = /^Digit([1-9])$/.exec(e.code || '');
    if (e.altKey && !e.ctrlKey && !e.metaKey && d) {
      var r = ROOMS[+d[1] - 1];
      if (!r) return;
      e.preventDefault();
      if (document.documentElement.classList.contains('oa-veiled')) return;
      moveTo(r.id);
    }
  });

  function realWinOn(type, fn) {
    try { window.addEventListener(type, fn); } catch (e) {}
  }

  /* ── the rooms that keep their own state, on the Ledger's cloud ──── */

  /* The Ledger keeps its connection in `pj-cloud-config` and its state in
     the `app_state` table under id 'main'. A room that holds a store of
     its own borrows that same connection and takes a row beside it, named
     after itself — no second setup, no schema change, one Supabase
     project holding all of them.

     Written once and run per room. It was Semaphore's alone until the
     Notes room needed the same thing, and a second copy of two hundred
     lines is two copies that answer a cloud error differently within the
     month. What differs between rooms is the five facts in `spec`; a room
     joins by handing them over, having `state()` and `applyState()`, and
     emitting `<room>:saved` when it writes to disk.

     `things` names the room's own list twice over: it is the key the
     count is taken from, and the word the "this device is empty" refusal
     is written with. `ui`, for a room that has any, names the keys of its
     store that only say where the room was looking — see `body()`. `merge`,
     for a room whose store can be put together piece by piece, says so —
     see "putting two copies together". `pane`
     and `chip` are written out in full rather than built from `room`,
     because `names.py` scans the source for the ids it indexes and a name
     spelled `'pane-' + ROOM` is a name no scanner can see — NAMES.md would
     report both panes as painted and never written, which is the index
     telling a lie about live code. */
  /* The token every cloud call outside the Ledger sends. Always a promise,
     and a refused one when nobody is logged in: the library calls this as
     the client is built, and a throw there would break the build of it. */
  function ledgerToken() {
    try {
      var L = Hub.api('ledger');
      if (!L || typeof L.token !== 'function') return Promise.reject(new Error('the Ledger has not started'));
      return L.token();
    } catch (e) { return Promise.reject(e); }
  }

  function roomCloud(spec) {
    (function () {
      var CFG = 'pj-cloud-config', ROW = spec.row;
      var KEY = spec.key, TS = spec.key + '-ts';
      var SEEN = spec.key + '-seen', DIRTY = spec.key + '-dirty', SUM = spec.key + '-sum';
      var BASE = spec.key + '-base';
      var ROOM = spec.room, NAME = spec.name, THINGS = spec.things;
      var UI = spec.ui || [];

      var pane = document.getElementById(spec.pane);
      var chip = document.getElementById(spec.chip);
      var client = null, cfg = null, api = null;
      var seen = false, remoteN = 0, timer = null, applying = false, warned = false;
      var state = 'waiting', why = 'starting up', tries = 0, boot = null, said = '';
      /* `remoteStamp` is the cloud row's `updated_at` as this session last
         read or wrote it; `lastBody` is what that row holds as this room
         reads it back, less the room's view settings. */
      var remoteStamp = null, lastBody = null;
      var readTries = 0, pushTries = 0, readRetry = null, pushRetry = null;

      function readCfg() {
        try { return JSON.parse(localStorage.getItem(CFG) || 'null'); }
        catch (e) { return null; }
      }
      function local() {
        try { return JSON.parse(localStorage.getItem(KEY) || 'null'); }
        catch (e) { return null; }
      }
      function n(s) { var l = s && s[THINGS]; return l ? l.length : 0; }
      function stamp() { try { return localStorage.getItem(TS); } catch (e) { return null; } }
      /* Semaphore has always written an ISO date here and so does every
         sync below, but the Notes room stamped epoch milliseconds for as
         long as it rode in no cloud at all, and one of those is still on
         disk wherever it was used before today. `new Date` on a bare
         number-string is an Invalid Date, and every comparison against one
         is false — which would have read as "the cloud is not newer" and
         pushed this device's copy over a good one. Both shapes are read. */
      function stampDate() {
        var v = stamp();
        if (!v) return null;
        var d = /^\d+$/.test(v) ? new Date(+v) : new Date(v);
        return isNaN(d.getTime()) ? null : d;
      }
      function setStamp(v) { try { localStorage.setItem(TS, v); } catch (e) {} }

      /* ── which copy wins ─────────────────────────────────────────────
         The Ledger's two keys, per room, for the Ledger's reason (see
         PROJECT.md). The stamp above was this machine's own clock, written
         at every save, and the cloud's `updated_at` was weighed against it:
         any change made here before the cloud's answer landed — or in a
         tab left open overnight — made a stale board "the newer one", and
         it went up over a day of the other machine's work. `-seen` is only
         ever copied from the cloud, `-dirty` is set by a change made here
         and cleared when a push lands. The stamp is still written, and read
         once: by a device that has never synced under these two keys. */
      function seenStamp() { try { return localStorage.getItem(SEEN); } catch (e) { return null; } }
      /* `-sum` is a fingerprint of what the cloud said at that exchange,
         kept beside the stamp. A cloud that has moved but still says the
         same thing — a copy pushed again by a build that sends every view
         change, or the same words sent twice — is not a second copy of
         the work, and treating it as one moved this device's unsent
         change into a restore point for nothing. */
      function setSeen(v, said) {
        try {
          if (!v) return;
          localStorage.setItem(SEEN, v);
          if (said != null) { localStorage.setItem(SUM, sum(said)); keepBase(said); }
        } catch (e) {}
      }
      function seenSum() { try { return localStorage.getItem(SUM); } catch (e) { return null; } }
      function sum(s) {
        var h = 2166136261;
        for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
        return (h >>> 0).toString(36) + '.' + s.length;
      }
      function isDirty() { try { return localStorage.getItem(DIRTY) === '1'; } catch (e) { return false; } }
      function setDirty(on) {
        try { if (on) localStorage.setItem(DIRTY, '1'); else localStorage.removeItem(DIRTY); } catch (e) {}
      }
      /* the same instant can come back spelled `Z` or `+00:00` */
      function sameStamp(a, b) {
        if (a === b) return true;
        if (!a || !b) return false;
        var x = Date.parse(a), y = Date.parse(b);
        return !isNaN(x) && x === y;
      }
      /* What a copy says, less where the room was looking. Semaphore saves
         its filters and Notes which way in was chosen through the same
         save as a real change, and every one of those went up as a new
         cloud version — twenty clicks between tabs and the history table,
         twenty deep, held nothing but tab changes. The view still travels,
         with the next change that is worth sending. */
      function body(s) {
        if (!s) return '';
        if (!UI.length) return JSON.stringify(s);
        var o = {};
        Object.keys(s).forEach(function (k) { if (UI.indexOf(k) < 0) o[k] = s[k]; });
        return JSON.stringify(o);
      }

      /* ── what the room says about itself ────────────────────────────
         The old module made this decision once, silently, at parse time: if
         any one of the three things it needs was not there yet it returned
         null and the room simply never synced, with nothing on screen to
         say so. Both halves of that were wrong. It now waits for what it
         needs, and it always says where it has got to. */
      var WORD = { waiting:'cloud', connecting:'connecting', syncing:'saving',
                   synced:'synced', error:'sync error', off:'no cloud', login:'log in' };
      function paint() {
        if (!chip) return;
        chip.setAttribute('data-state', state);
        chip.querySelector('span').textContent = WORD[state] || state;
        chip.title = (WORD[state] || state) + (why ? ' \u2014 ' + why : '') +
          '\n' + NAME + ' shares the Ledger\u2019s Supabase connection. Press to ask the cloud again.';
      }
      function set(st, msg) {
        state = st; why = msg || '';
        paint();
        /* an error is worth saying out loud once, but not on every retry */
        if (st === 'error' && msg && msg !== said) {
          said = msg;
          Hub.note(NAME + ' cloud \u2014 ' + msg, 9000);
        }
        if (st === 'synced') said = '';
      }

      /* the one thing standing in the way, in the order it has to be fixed */
      function missing() {
        if (!pane) return 'this build has no ' + NAME + ' pane';
        var c = readCfg();
        if (!c || !c.url || !c.key)
          return 'no cloud connection saved yet \u2014 set one up in the Ledger';
        if (typeof window.supabase === 'undefined')
          return 'the Supabase library has not loaded \u2014 check the connection and reload';
        if (!loggedIn()) return NOT_IN;
        var a = Hub.api(ROOM);
        if (!a || typeof a.applyState !== 'function') {
          var f = Hub.failure && Hub.failure(ROOM);
          return f ? (NAME + ' did not start \u2014 ' + f) : NAME + ' is still starting';
        }
        return null;
      }
      /* The cloud answers only a logged-in Mark (since 2026-10-09), and the
         Ledger holds the one login in the page. Until it has a session this
         room asks the cloud nothing at all — see `token()` in the Ledger for
         why a request without one would be answered with an empty table
         rather than refused. */
      var NOT_IN = 'not logged in \u2014 log in from the Ledger\u2019s cloud panel';
      function loggedIn() {
        var L = Hub.api('ledger');
        return !!(L && typeof L.signedIn === 'function' && L.signedIn());
      }
      function schedule() {
        tries++;
        /* quick while the page is still settling, then patient: a Ledger
           connected halfway through a session should be picked up too */
        var wait = tries < 40 ? 250 : tries < 100 ? 1000 : 5000;
        clearTimeout(boot);
        boot = setTimeout(start, wait);
      }
      function start() {
        clearTimeout(boot); boot = null;
        var m = missing();
        if (m) {
          set(!readCfg() ? 'off' : m === NOT_IN ? 'login' : 'waiting', m);
          schedule();
          return;
        }
        cfg = readCfg();
        api = Hub.api(ROOM);
        try {
          /* No session of its own: it sends the Ledger's token. Two clients
             holding one session in one page each renew it, and Supabase
             takes a renewal used twice as a stolen session and ends it for
             every device. With `accessToken` the library builds no sign-in
             half at all, so there is nothing here to contend. */
          client = window.supabase.createClient(cfg.url, cfg.key, {
            accessToken: ledgerToken
          });
        } catch (e) {
          client = null;
          set('error', 'could not open the connection \u2014 ' + e.message);
          schedule();
          return;
        }
        download();
      }

      function download() {
        if (!client) { start(); return; }
        clearTimeout(readRetry); readRetry = null;
        set('connecting', 'reading the cloud');
        client.from('app_state').select('data,updated_at').eq('id', ROW).single()
          .then(function (res) {
            if (res && res.error) {
              if (res.error.code === 'PGRST116') {   /* no row yet */
                seen = true; warned = false; remoteN = 0; readTries = 0;
                remoteStamp = null; lastBody = null;
                set('synced', 'no cloud copy yet'); push(); return;
              }
              readFailed(res.error.message); return;   /* leave seen false: never push over an unread cloud */
            }
            seen = true; warned = false; readTries = 0;
            var d = res.data && res.data.data;
            if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
            remoteN = n(d);
            remoteStamp = (res.data && res.data.updated_at) || null;
            if (!d) { lastBody = null; set('synced', 'the cloud row is empty'); push(); return; }
            lastBody = body(d);

            var loc = local(), was = seenStamp();
            /* the cloud is where this device left it — or says what it said
               then: send what is owed */
            if (was && (sameStamp(was, remoteStamp) || seenSum() === sum(lastBody))) {
              if (!isDirty()) setSeen(remoteStamp, lastBody);
              set('synced');
              if (isDirty()) push();
              return;
            }
            /* the two already say the same thing: nothing to replace */
            if (loc && body(loc) === lastBody) {
              setSeen(remoteStamp, lastBody); setDirty(false); set('synced'); return;
            }
            /* nothing here to lose — a cleared browser re-stamps itself on
               its own startup save, and must not look like the newer copy */
            if (!loc || (n(loc) === 0 && remoteN > 0)) { take(d, false, false); return; }
            /* it has moved, and this device holds nothing unsent */
            if (was && !isDirty()) { take(d, true, false); return; }
            /* both have moved. The Ledger asks; a room has no box to ask
               with, so the two are put together where the room allows it
               (see "putting two copies together"), and otherwise what is
               here is kept as a restore point and the cloud's is taken —
               nothing is lost either way, and the note says where the other
               copy went. */
            if (was) { if (!mergeIn(d)) take(d, true, true); return; }
            /* Never synced under the two keys, which is every device the
               first time this build opens: the old rule, once. After this
               exchange the device has a `-seen` and never comes here again. */
            var ts = stampDate();
            if (!ts || (remoteStamp && new Date(remoteStamp) > ts)) take(d, true, false);
            else { set('synced'); push(); }
          })
          .catch(function (e) { readFailed(e.message); });
      }

      /* A failed read holds every upload, on purpose — never write over a
         cloud that could not be read. What was missing was anything trying
         again: one dropped connection at startup left the room unsynced for
         the rest of the session, with its changes piling up unsent. Spaced
         as the Ledger's are. */
      function readFailed(msg) {
        set('error', msg + ' \u2014 nothing is uploaded until a read succeeds');
        if (readTries++ >= 6) return;
        clearTimeout(readRetry);
        readRetry = setTimeout(download, readTries < 3 ? 2000 : 20000);
      }

      /* A restore point in the Ledger, which keeps every room's store in
         each one. */
      function keepHere(why) {
        try {
          var L = Hub.api('ledger');
          if (L && typeof L.snapshot === 'function') { L.snapshot(why); return true; }
        } catch (e) { console.error(e); }
        return false;
      }
      /* The one road in for the cloud's copy. `keep` keeps what is here
         first; `clash` says it held changes of its own, which are not
         replaced unless they could be kept. */
      function take(d, keep, clash) {
        var kept = keep && keepHere('before ' + NAME + ' took the cloud copy');
        if (clash && !kept) {
          /* held as an unread cloud is held, or the next upload — which
             now knows the cloud's date — would go straight over it */
          seen = false; warned = true;
          set('error', 'this device and the cloud have both changed, and no restore ' +
              'point could be kept \u2014 nothing was replaced or sent');
          return;
        }
        var ok = false;
        applying = true;
        try { ok = api.applyState(d) !== false; } catch (e) { console.error(e); }
        applying = false;
        if (!ok) { set('error', 'the cloud copy could not be read \u2014 nothing was replaced'); return; }
        var loc = local(), said = body(d);
        lastBody = loc ? body(loc) : said;
        setSeen(remoteStamp, said); setDirty(false);
        setStamp(remoteStamp || new Date().toISOString());
        set('synced', 'took the cloud copy');
        if (clash) Hub.note(NAME + ' \u2014 this device and the cloud had both changed. The cloud\u2019s ' +
          'copy is on screen; this device\u2019s is a restore point in the Ledger\u2019s cloud panel.', 12000);
      }

      /* ── putting two copies together ─────────────────────────────────
         When this device and the cloud have both changed, a room used to keep
         what is here as a restore point and take the cloud's copy whole — so
         a card stamped in Pocket while the desk held an unsent change undid
         that change on the desk. Mark asked for the two to be put together
         instead (2026-10-11), for the Semaphore, whose changes from the phone
         are small and nearly always somewhere else on the board.

         Three copies decide it: this device's, the cloud's, and what the
         cloud said at the last exchange — which side changed a piece is the
         side whose piece differs from that. Only a fingerprint of the last
         exchange is kept (`-base`), not a third copy of the board, because
         `localStorage` is five megabytes shared with everything else: a hash
         of every piece, and the order of every list of things with ids, each
         id kept as a short hash of itself since the ids are most of it. It is
         used only while it is the fingerprint of the copy `-sum` names, so a
         stale one can never decide anything. The pieces are every key of
         every object, every member of a list whose members all have ids (an
         arena, a type) and, one list further in, each member whole (a lead, a
         link, a date). Where both sides changed the very same piece the
         cloud's wins, as it always did, and this device's whole copy is
         still a restore point in the Ledger. Tried against a stand-in cloud,
         with Pocket's writes and the desk's in the same arena and in others. */
      function canon(x) {
        if (x === null || typeof x !== 'object') return JSON.stringify(x);
        if (Array.isArray(x)) return '[' + x.map(function (v) { return v === undefined ? 'null' : canon(v); }).join(',') + ']';
        return '{' + Object.keys(x).sort().filter(function (k) { return x[k] !== undefined; })
          .map(function (k) { return JSON.stringify(k) + ':' + canon(x[k]); }).join(',') + '}';
      }
      function H(x) { return x === undefined ? '-' : sum(canon(x)).split('.')[0]; }
      function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
      function isIdList(x) {
        if (!Array.isArray(x)) return false;
        var seen = new Set();
        for (var i = 0; i < x.length; i++) {
          var e = x[i];
          if (!isObj(e) || typeof e.id !== 'string' || !e.id || seen.has(e.id)) return false;
          seen.add(e.id);
        }
        return true;
      }
      function sid(id) { return sum(id).split('.')[0]; }
      function fpOf(x, deep) {
        if (isIdList(x)) return { h: H(x), a: x.map(function (e) { return [sid(e.id), deep ? H(e) : fpOf(e, true)]; }) };
        if (isObj(x)) {
          var k = {};
          Object.keys(x).forEach(function (n) { k[n] = fpOf(x[n], deep); });
          return { h: H(x), k: k };
        }
        return H(x);
      }
      function keepBase(said) {
        if (!spec.merge) return;
        try { localStorage.setItem(BASE, JSON.stringify({ s: sum(said), t: fpOf(JSON.parse(said), false) })); }
        catch (e) { try { localStorage.removeItem(BASE); } catch (e2) {} }
      }
      function readBase() {
        try { return JSON.parse(localStorage.getItem(BASE) || 'null'); } catch (e) { return null; }
      }
      function own(o, k) { return o && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined; }
      /* one piece, three ways: the base's fingerprint `f`, this device's `a`,
         the cloud's `b`; undefined is a piece that is not there */
      function merge3(f, a, b, path, out) {
        var ha = H(a), hb = H(b);
        if (ha === hb) return a;
        var h0 = f === undefined ? '-' : typeof f === 'string' ? f : f.h;
        if (ha === h0) return b;
        if (hb === h0) return a;
        if (isObj(a) && isObj(b) && (f === undefined || isObj(f) && f.k))
          return mergeKeys(f ? f.k : {}, a, b, path, out);
        if (isIdList(a) && isIdList(b) && (f === undefined || isObj(f) && f.a))
          return mergeList(f ? f.a : [], a, b, path, out);
        out.push(path);
        return b;
      }
      function mergeKeys(fk, a, b, path, out) {
        var r = {}, keys = Object.keys(b);
        Object.keys(a).concat(Object.keys(fk)).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); });
        keys.forEach(function (k) {
          var v = merge3(own(fk, k), own(a, k), own(b, k), path.concat(k), out);
          if (v !== undefined) r[k] = v;
        });
        return r;
      }
      /* A list keeps the order of the side that moved things in it — the
         cloud's when both did, or neither — and a member only one side has
         goes in after the one it followed there. */
      function mergeList(fa, a, b, path, out) {
        var base = new Map(fa), A = new Map(), B = new Map(), ids = [];
        a.forEach(function (e) { A.set(e.id, e); });
        b.forEach(function (e) { B.set(e.id, e); });
        /* a member neither side has any longer is gone from both */
        a.map(function (e) { return e.id; }).concat(b.map(function (e) { return e.id; }))
          .forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
        var got = new Map();
        ids.forEach(function (id) {
          var v = merge3(base.get(sid(id)), A.get(id), B.get(id), path.concat(id), out);
          if (v !== undefined) got.set(id, v);
        });
        var was = fa.map(function (p) { return p[0]; });
        function moved(list) {
          var now = list.map(function (e) { return sid(e.id); }).filter(function (k) { return base.has(k); });
          return now.join('\n') !== was.filter(function (k) { return now.indexOf(k) >= 0; }).join('\n');
        }
        var first = moved(a) && !moved(b) ? a : b, second = first === a ? b : a;
        var seq = first.map(function (e) { return e.id; }).filter(function (id) { return got.has(id); });
        second.forEach(function (e, i) {
          if (!got.has(e.id) || seq.indexOf(e.id) >= 0) return;
          var at = 0;
          for (var j = i - 1; j >= 0; j--) { var k = seq.indexOf(second[j].id); if (k >= 0) { at = k + 1; break; } }
          seq.splice(at, 0, e.id);
        });
        return seq.map(function (id) { return got.get(id); });
      }
      function bare(s) {
        var o = {};
        Object.keys(s || {}).forEach(function (k) { if (UI.indexOf(k) < 0) o[k] = s[k]; });
        return o;
      }
      /* Both have moved, and the room can be merged: put the two together,
         keep a restore point of what was here, and send the result. False
         when it cannot be done, and the old road is taken instead. */
      function mergeIn(d) {
        if (!spec.merge) return false;
        var base = readBase(), loc = local();
        if (!base || !base.t || base.s !== seenSum() || !loc) return false;
        var clash = [];
        var mine = bare(loc), theirs = bare(d);
        var merged = merge3(base.t, mine, theirs, [], clash);
        if (!isObj(merged)) return false;
        UI.forEach(function (k) { if (loc[k] !== undefined) merged[k] = loc[k]; });
        var kept = keepHere('before ' + NAME + ' put this device\u2019s copy and the cloud\u2019s together');
        if (clash.length && !kept) return false;
        var ok = false;
        applying = true;
        try { ok = api.applyState(merged) !== false; } catch (e) { console.error(e); }
        applying = false;
        if (!ok) return false;
        /* the cloud still holds its own copy until the push lands */
        var said = body(d);
        lastBody = said;
        setSeen(remoteStamp, said);
        setDirty(true);
        setStamp(new Date().toISOString());
        var where = [];
        clash.forEach(function (p) {
          var nm = p[0];
          if (p[0] === THINGS && p.length > 1) {
            var it = ((d && d[THINGS]) || []).concat(loc[THINGS] || [])
              .filter(function (x) { return x && x.id === p[1]; })[0];
            nm = (it && it.name) || THINGS;
          }
          if (where.indexOf(nm) < 0) where.push(nm);
        });
        Hub.note(clash.length
          ? NAME + ' \u2014 this device and the cloud had both changed, and the two are put together, except where ' +
            'both changed the same thing (' + where.join(', ') + '): there the cloud\u2019s is on screen, and this ' +
            'device\u2019s copy is a restore point in the Ledger\u2019s cloud panel.'
          : NAME + ' \u2014 this device and the cloud had both changed, in different places, so the two are put ' +
            'together and nothing is lost.', 12000);
        push();
        return true;
      }

      /* Has the cloud's row moved since this session last read or wrote
         it? `err` is set when it could not be asked. One small request for
         a date, asked before every upload and on coming back to the page:
         a tab left open overnight otherwise sends last evening's copy over
         everything the other machine did since. */
      function peek(cb) {
        client.from('app_state').select('updated_at').eq('id', ROW).single()
          .then(function (res) {
            if (res && res.error) {
              if (res.error.code === 'PGRST116') { cb(!!remoteStamp); return; }
              cb(false, res.error.message); return;
            }
            cb(!sameStamp(res.data && res.data.updated_at, remoteStamp));
          })
          .catch(function (e) { cb(false, e.message); });
      }
      var lookedAt = 0;
      function lookAgain() {
        if (!client || !seen || timer || applying) return;
        if (Date.now() - lookedAt < 30000) return;
        lookedAt = Date.now();
        peek(function (moved) { if (moved) download(); });
      }

      /* Every upload keeps a copy in `app_state_history` — the table the
         Ledger's cloud panel sets up and lists, shared by all four stores
         and told apart by `row_id`. One row in `app_state` is one row: the
         last word wins even when the last word was a mistake, and this is
         the only way back from one. Silent when the table is not there,
         and it gives up asking after the first refusal: the upload itself
         succeeded, and a missing history table must never read as a
         broken sync. */
      var histOk = true;
      function history(iso, blob, count) {
        if (!client || !histOk) return;
        try {
          client.from('app_state_history')
            .insert({ row_id: ROW, data: blob, n: count, saved_at: iso })
            .then(function (res) { if (res && res.error) histOk = false; })
            .catch(function () { histOk = false; });
        } catch (e) { histOk = false; }
      }

      function push() {
        if (!client) return;
        clearTimeout(timer); timer = null;
        if (cfg && cfg.uploadDisabled) { set('synced', 'safe mode \u2014 download only'); return; }
        if (!seen) {
          if (!warned) { warned = true; set('error', 'cloud unread \u2014 uploads held'); }
          return;
        }
        var loc = local();
        if (!loc) return;
        var b = body(loc);
        /* nothing the cloud has not already got */
        if (b === lastBody) { setSeen(remoteStamp); setDirty(false); set('synced'); return; }
        if (remoteN > 0 && n(loc) === 0) {
          set('error', 'upload held \u2014 this device has no ' + THINGS +
              ' but the cloud has ' + remoteN + '. The cloud copy is untouched.');
          return;
        }
        set('syncing', 'writing');
        peek(function (moved, err) {
          if (err) { pushFailed(err); return; }
          if (moved) { download(); return; }   /* read it first; the cases above decide */
          var iso = new Date().toISOString();
          client.from('app_state').upsert({ id: ROW, data: loc, updated_at: iso })
            .then(function (res) {
              if (res && res.error) { pushFailed(res.error.message); return; }
              pushTries = 0;
              remoteN = n(loc); remoteStamp = iso; lastBody = b;
              setSeen(iso, b); setStamp(iso);
              /* a change made while this was on the wire is not in it, and
                 the flag is its only memory if the page goes first */
              if (body(local()) === b) setDirty(false);
              set('synced'); history(iso, loc, remoteN);
            })
            .catch(function (e) { pushFailed(e.message); });
        });
      }
      /* The flag outlives these five tries, so even a total failure is
         only a delay until the next open. Spaced as the Ledger's are, and
         for its reason: the last tries reach past the minute the login
         library sits out after a renewal that could not get through. */
      function pushFailed(msg) {
        set('error', msg);
        if (pushTries++ >= 5) return;
        clearTimeout(pushRetry);
        pushRetry = setTimeout(function () { if (client && isDirty()) push(); },
          pushTries <= 2 ? pushTries * 4000 : 30000);
      }

      Hub.on(ROOM + ':saved', function () {
        if (applying) return;
        setStamp(new Date().toISOString());
        /* only where the room was looking has moved: nothing is owed */
        if (lastBody !== null && body(local()) === lastBody) { setDirty(false); return; }
        setDirty(true);
        if (!client) { start(); return; }   /* a save is as good a moment as any to try again */
        clearTimeout(timer);
        timer = setTimeout(push, 1200);
      });

      /* That 1.2 seconds of grace after the last change is longer than it
         takes to shut a laptop, and nothing used to flush it — so the last
         edit of a session was the one most likely never to leave the
         machine, while the local save made that machine look perfectly
         right. Hiding the page is the last moment we are certainly still
         running. Found in the Ledger's own sync on 2026-09-02 and fixed
         here in the same hour, because this is the same debounce. */
      function flush() {
        if (!timer) return;
        clearTimeout(timer); timer = null;
        push();
      }
      realWinOn('pagehide', flush);
      try {
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'hidden') flush();
          else lookAgain();
        });
      } catch (e) {}
      realWinOn('focus', lookAgain);

      /* the Ledger may be connected in another tab, or in this one after we
         have already given up on finding a config */
      realWinOn('storage', function (e) {
        if (e && e.key && e.key !== CFG) return;
        var c = readCfg();
        if (!c || !c.url || !c.key) return;
        if (client && cfg && c.url === cfg.url && c.key === cfg.key) return;
        client = null; seen = false; tries = 0; remoteStamp = null; lastBody = null;
        start();
      });

      if (chip) chip.addEventListener('click', function () {
        if (client) { readTries = 0; download(); } else { tries = 0; start(); }
      });

      /* Logging in starts every room at once rather than at its next
         five-second look; logging out stops it where it stands. Unsent work
         stays marked dirty on disk, and goes at the next login. */
      Hub.on('cloud:session', function (on) {
        clearTimeout(timer); timer = null;
        clearTimeout(readRetry); clearTimeout(pushRetry);
        client = null; seen = false; remoteStamp = null; lastBody = null;
        readTries = 0; pushTries = 0; tries = 0;
        if (on) start();
        else { set('login', NOT_IN); schedule(); }
      });

      paint();
      start();
    })();
  }

  roomCloud({ room: 'semaphore', name: 'Semaphore', row: 'semaphore',
              key: 'semaphore.v1', things: 'arenas', ui: ['ui'], merge: true,
              pane: 'pane-semaphore', chip: 'semcloud' });

  roomCloud({ room: 'notes', name: 'Notes', row: 'notes',
              key: 'notes.v1', things: 'notes', ui: ['view'],
              pane: 'pane-notes', chip: 'ntcloud' });

  /* The Atlas is the odd one for its key alone: it has always kept its
     edits through the Hub's storage shim, which writes them under
     `hub.storage.` — so that prefix is part of the name here rather than
     the room being moved off a key its own code has used since it was
     written. Everything else about it is the same as the other two. */
  roomCloud({ room: 'atlas', name: 'Atlas', row: 'atlas',
              key: 'hub.storage.atlas-edits-v1', things: 'edits',
              pane: 'pane-atlas', chip: 'atcloud' });

  /* ── the agents' inboxes: what the scheduled agents found ─────── */

  /* A task running in the cloud reads the programmes' own pages and leaves
     what it found in a second table, `semaphore_inbox`, beside the one the
     rooms sync through. It never touches `app_state`: it reaches the
     database through a small gatekeeper of its own that can do nothing but
     read a trimmed copy of the board and add rows here, so a wrong reading
     on a website can never become a change to the board.

     This lives in the bridge for the reason every other cloud call does —
     the Ledger's `pj-cloud-config` is the one connection this app has, and a
     room does not open a connection of its own. What the room is given is
     three verbs and no Supabase at all.

     Nothing is cached. The list is small, it is read when the view is opened,
     and a second device accepting a finding must not leave this one holding a
     copy that says otherwise. `decide` names the status it expects to find —
     `eq('status','new')` — so the same finding cannot be accepted twice from
     two tabs: the second update matches no row and says so. */
  /* One shape for every agent's inbox: the Atlas's people-agent leaves its
     findings in `atlas_inbox` on exactly the same terms, so the same three
     verbs serve both, each over its own table and columns. */
  function agentInbox(TABLE, COLS, LOG) {
    var CFG = 'pj-cloud-config';
    var client = null;

    /* Asks nothing while nobody is logged in; the inbox, like the rest
       of the cloud, answers only a logged-in Mark. The token is the
       Ledger's, for the reason given at `ledgerToken`. */
    function open() {
      var L = Hub.api('ledger');
      if (!L || typeof L.signedIn !== 'function' || !L.signedIn()) return null;
      if (client) return client;
      var cfg;
      try { cfg = JSON.parse(localStorage.getItem(CFG) || 'null'); } catch (e) { cfg = null; }
      if (!cfg || !cfg.url || !cfg.key || !window.supabase) return null;
      try {
        client = window.supabase.createClient(cfg.url, cfg.key, { accessToken: ledgerToken });
      } catch (e) { client = null; }
      return client;
    }
    function none() {
      var L = Hub.api('ledger');
      return (L && typeof L.signedIn === 'function' && !L.signedIn())
        ? 'not logged in' : 'no cloud connection';
    }

    /* The oldest finding first: the order the agent found them in is the
       order they are worth reading, and a morning's batch stays together. */
    function list(cb) {
      var c = open();
      if (!c) { cb(null, none()); return; }
      c.from(TABLE)
        .select(COLS)
        .eq('status', 'new')
        .order('created_at', { ascending: true })
        .limit(200)
        .then(function (res) {
          if (res && res.error) { cb(null, res.error.message); return; }
          cb((res && res.data) || [], null);
        })
        .catch(function (e) { cb(null, e.message); });
    }

    function decide(id, status, cb) {
      var c = open();
      if (!c) { cb(none()); return; }
      c.from(TABLE)
        .update({ status: status, decided_at: new Date().toISOString() })
        .eq('id', id).eq('status', 'new').select('id')
        .then(function (res) {
          if (res && res.error) { cb(res.error.message); return; }
          if (!res || !res.data || !res.data.length) {
            cb('already answered somewhere else'); return;
          }
          cb(null);
        })
        .catch(function (e) { cb(e.message); });
    }

    /* Which arenas the agent has looked at since a given moment, out of the
       log it keeps of its own rounds. The Semaphore reads it to put out an
       "ask the agent" once the agent has been. The log is readable only once
       the policy in `supabase/1-semaphore-inbox.sql` has been run; until
       then this answers with the error and the asks simply stand. */
    function visits(since, cb) {
      var c = open();
      if (!c || !LOG) { cb(null, c ? 'no log' : none()); return; }
      c.from(LOG)
        .select('arena_id,checked_at')
        .gte('checked_at', since)
        .order('checked_at', { ascending: false })
        .limit(500)
        .then(function (res) {
          if (res && res.error) { cb(null, res.error.message); return; }
          cb((res && res.data) || [], null);
        })
        .catch(function (e) { cb(null, e.message); });
    }

    var api = {
      ready: function () { return !!open(); },
      list: list,
      decide: decide
    };
    if (LOG) api.visits = visits;
    return api;
  }
  Hub.expose('semaphore-inbox', agentInbox('semaphore_inbox',
    'id,created_at,run,kind,arena_id,arena_name,date_kind,label,call,role,gran,' +
    'start_date,end_date,grade,replaces_date_id,url,source_url,evidence,note',
    'semaphore_agent_log'));
  Hub.expose('atlas-inbox', agentInbox('atlas_inbox',
    'id,created_at,run,kind,person,grp,summary,detail,as_of,as_of_gran,url,source_url,evidence'));

  /* ── open where we left off ───────────────────────────────────────── */

  var start = order[0];
  try {
    var saved = localStorage.getItem('hub.room');
    if (saved && Hub.pane(saved)) start = saved;
  } catch (e) {}
  moveTo(start, true);
})();


/* ── the weekly Excel: every lead, and every closed todo ─────────────────
   Mark asked on 2026-10-14 for one Excel file he can bring up to date once a
   week: every lead on its own row — arena, project, coordinator, contact,
   where the contact has got to, its links and its updates — and beside them
   every todo closed in the Ledger. The leads are the Semaphore's and the
   todos the Ledger's, so it is written here, where both may be asked.

   Writing the file again is the update. Where the browser lets a page keep
   hold of a file (Chrome and Edge on the desk), the first press asks where
   to save it and every later press writes over that same file, so it stays
   one file in one place — in OneDrive, if that is where it was put. Elsewhere
   (Safari, the iPad) each press downloads a fresh copy under the same name.
   ⌥ (Alt) with the press asks for the place again.

   What has changed since the last export is marked rather than kept apart:
   a lead that is new or has changed, an update and a closed todo that the
   last file did not hold, are filled pale yellow and say "new" or "changed"
   in the first column. The fingerprints that tell are kept on this device
   (`leads-excel-v1`), only once the file has been written.

   No library: an .xlsx is a zip of a few XML files, and the zip is written
   here without compression, which Excel reads as readily. A library from a
   CDN would not load from a copy on disk without a network. */
(function () {
  'use strict';
  if (typeof Hub === 'undefined' || !Hub.on) return;

  var NAME = 'Leads and closed todos.xlsx';
  var SEEN = 'leads-excel-v1';
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function iso(d) {
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function isDay(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s); }
  function sayDay(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    return m ? (+m[3]) + ' ' + MON[+m[2] - 1] + ' ' + m[1] : '';
  }
  /* FNV-1a over a string: enough to tell whether a lead has changed */
  function sum(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36);
  }

  /* ── the zip ── */
  var CRC = (function () {
    var t = [];
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(b) {
    var c = 0xffffffff;
    for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function zip(files) {
    var enc = new TextEncoder(), parts = [], dir = [], at = 0;
    function head(sig, n) { var v = new DataView(new ArrayBuffer(n)); v.setUint32(0, sig, true); return v; }
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data);
      var h = head(0x04034b50, 30);
      h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, 0, true); h.setUint16(12, 0x21, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
      h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      var d = head(0x02014b50, 46);
      d.setUint16(4, 20, true); d.setUint16(6, 20, true); d.setUint16(8, 0x0800, true);
      d.setUint16(10, 0, true); d.setUint16(12, 0, true); d.setUint16(14, 0x21, true);
      d.setUint32(16, crc, true); d.setUint32(20, data.length, true); d.setUint32(24, data.length, true);
      d.setUint16(28, name.length, true); d.setUint32(42, at, true);
      dir.push(new Uint8Array(d.buffer), name);
      at += 30 + name.length + data.length;
    });
    var size = dir.reduce(function (n, p) { return n + p.length; }, 0);
    var e = head(0x06054b50, 22);
    e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, size, true); e.setUint32(16, at, true);
    return new Blob(parts.concat(dir, [new Uint8Array(e.buffer)]),
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /* ── the workbook ──
     Styles by number, each in a plain and a yellow ("new") version, the
     yellow one always the next number up. */
  var ST = { head: 1, text: 2, date: 4, num: 6, title: 8 };
  var STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="d mmm yyyy"/></numFmts>' +
    '<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="13"/><name val="Calibri"/></font></fonts>' +
    '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF5B4A2E"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2B3"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="2"><border/><border><bottom style="thin"><color rgb="FFD9D2C3"/></bottom></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="9">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
      '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" horizontal="left"/></xf>' +
      '<xf numFmtId="164" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" horizontal="left"/></xf>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" horizontal="center"/></xf>' +
      '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" horizontal="center"/></xf>' +
      '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  /* Text Excel can hold: no control characters, and no more than a cell takes */
  function xt(s) {
    s = String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');
    if (s.length > 32000) s = s.slice(0, 32000) + '…';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function col(i) { var s = ''; i++; while (i) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; } return s; }
  function serial(day) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
    return (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 864e5;
  }
  /* One cell: a day is a real date, so the sheet sorts and filters by it */
  function cell(ref, v, kind, hl) {
    if (v === '' || v == null || (kind === 'num' && !v)) return hl ? '<c r="' + ref + '" s="' + (ST.text + 1) + '"/>' : '';
    if (kind === 'date' && isDay(v)) return '<c r="' + ref + '" s="' + (ST.date + (hl ? 1 : 0)) + '"><v>' + serial(v) + '</v></c>';
    if (kind === 'num') return '<c r="' + ref + '" s="' + (ST.num + (hl ? 1 : 0)) + '"><v>' + (+v) + '</v></c>';
    return '<c r="' + ref + '" t="inlineStr" s="' + (ST.text + (hl ? 1 : 0)) + '"><is><t xml:space="preserve">' + xt(v) + '</t></is></c>';
  }
  /* A sheet of one table: a header row frozen at the top with a filter on
     it, and a row per record, filled yellow where `hl` says it is new. */
  function sheet(cols, rows) {
    var last = col(cols.length - 1), n = rows.length + 1;
    var x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/><cols>' +
      cols.map(function (c, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + c.w + '" customWidth="1"/>'; }).join('') +
      '</cols><sheetData><row r="1" ht="22" customHeight="1">' +
      cols.map(function (c, i) { return '<c r="' + col(i) + '1" t="inlineStr" s="' + ST.head + '"><is><t>' + xt(c.h) + '</t></is></c>'; }).join('') +
      '</row>';
    rows.forEach(function (r, ri) {
      x += '<row r="' + (ri + 2) + '">' + cols.map(function (c, i) {
        return cell(col(i) + (ri + 2), r.v[i], c.k, r.hl);
      }).join('') + '</row>';
    });
    return x + '</sheetData><autoFilter ref="A1:' + last + n + '"/>' +
      '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/></worksheet>';
  }
  /* The front sheet: what the file is, when it was written, what yellow means */
  function about(lines) {
    var x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<cols><col min="1" max="1" width="30" customWidth="1"/><col min="2" max="2" width="70" customWidth="1"/></cols><sheetData>';
    lines.forEach(function (l, i) {
      var r = i + 1;
      x += '<row r="' + r + '">' +
        (l[0] ? '<c r="A' + r + '" t="inlineStr" s="' + (i ? 0 : ST.title) + '"><is><t xml:space="preserve">' + xt(l[0]) + '</t></is></c>' : '') +
        (l[1] ? '<c r="B' + r + '" t="inlineStr" s="' + (l[2] ? ST.text + 1 : 0) + '"><is><t xml:space="preserve">' + xt(l[1]) + '</t></is></c>' : '') +
        '</row>';
    });
    return x + '</sheetData></worksheet>';
  }
  function book(sheets) {
    var M = 'http://schemas.openxmlformats.org/', R = M + 'officeDocument/2006/relationships';
    var files = [
      { name: '[Content_Types].xml', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="' + M + 'package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets.map(function (s, i) {
          return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
        }).join('') + '</Types>' },
      { name: '_rels/.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="' + M + 'package/2006/relationships">' +
        '<Relationship Id="rId1" Type="' + R + '/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="' + M + 'spreadsheetml/2006/main" xmlns:r="' + R + '"><sheets>' +
        sheets.map(function (s, i) { return '<sheet name="' + xt(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') +
        '</sheets><definedNames>' +
        sheets.map(function (s, i) {
          return s.filter ? '<definedName name="_xlnm._FilterDatabase" localSheetId="' + i + '" hidden="1">\'' +
            xt(s.name) + '\'!' + s.filter + '</definedName>' : '';
        }).join('') + '</definedNames></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="' + M + 'package/2006/relationships">' +
        sheets.map(function (s, i) {
          return '<Relationship Id="rId' + (i + 1) + '" Type="' + R + '/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
        }).join('') +
        '<Relationship Id="rId' + (sheets.length + 1) + '" Type="' + R + '/styles" Target="styles.xml"/></Relationships>' },
      { name: 'xl/styles.xml', text: STYLES }
    ];
    sheets.forEach(function (s, i) { files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', text: s.xml }); });
    return zip(files);
  }
  function table(name, cols, rows) {
    return { name: name, xml: sheet(cols, rows), filter: '$A$1:$' + col(cols.length - 1) + '$' + (rows.length + 1) };
  }

  /* ── what goes in it ── */
  function read() {
    var S = Hub.api('semaphore'), L = Hub.api('ledger');
    var leads = (S && S.allLeads) ? S.allLeads() : null;
    if (!leads) return null;
    var todos = [];
    var projects = (L && L.projects) ? L.projects() : {}, calls = (L && L.calls) ? L.calls() : {};
    Object.keys(projects || {}).forEach(function (pid) {
      var p = projects[pid], c = p && p.callId && calls[p.callId];
      (p && p.todos || []).forEach(function (t) {
        if (!t || !t.done) return;
        todos.push({ id: t.id, doneAt: isDay(t.doneAt) ? t.doneAt.slice(0, 10) : '',
          project: p.name || '', call: (c && c.name) || '', text: t.text || '',
          deadline: t.deadline || t.dueDate || '',
          updates: (t.subStamps || []).map(function (u) { return (u.stamp ? u.stamp + ' — ' : '') + (u.text || ''); }).reverse().join('\n'),
          checklist: (t.checklist || []).map(function (ci) { return (ci.done ? '✓ ' : '○ ') + (ci.text || ''); }).join('\n') });
      });
    });
    return { leads: leads, todos: todos };
  }
  /* Furthest along first, as a report is read: Talking, then Contacted with
     both paths over one, then Spotted, each by its day; then the closed
     leads, the latest closed first. */
  var RANK = { talking: 0, contacted: 1, spotted: 4 }, KRANK = { both: 0, researchers: 1, lead: 2 };
  function rank(l) { return l.doneAt ? 9 : RANK[l.stage] + (l.stage === 'contacted' ? KRANK[l.kind] || 0 : 0); }
  function order(a, b) {
    var d = rank(a) - rank(b); if (d) return d;
    if (a.doneAt || b.doneAt) return (b.doneAt || '').localeCompare(a.doneAt || '');
    if (!!a.due !== !!b.due) return a.due ? -1 : 1;
    if (a.due !== b.due) return a.due < b.due ? -1 : 1;
    return a.name.localeCompare(b.name);
  }
  function upKey(l, u) { return l.aid + '|' + l.id + '|' + sum((u.at || u.when) + '|' + u.text); }

  function build(data, seen) {
    var today = iso(new Date()), was = seen || null;
    var next = { at: today, leads: {}, ups: {}, todos: {} };
    var leads = data.leads.slice().sort(order);
    var leadRows = [], upRows = [], nNew = 0;
    leads.forEach(function (l) {
      var fp = sum(JSON.stringify(l));
      /* by arena and lead together: a lead copied with its arena keeps its id */
      var key = l.aid + '|' + l.id;
      next.leads[key] = fp;
      var mark = !was ? '' : !was.leads[key] ? 'new' : was.leads[key] !== fp ? 'changed' : '';
      if (mark) nNew++;
      var ups = l.updates.slice().reverse();
      ups.forEach(function (u) {
        var k = upKey(l, u); next.ups[k] = 1;
        var fresh = !!was && !was.ups[k];
        upRows.push({ hl: fresh, at: u.at, v: [fresh ? 'new' : '', isDay(u.at) ? u.at : u.when, l.arena, l.name, u.text] });
      });
      leadRows.push({ hl: !!mark, v: [mark, l.arena, l.type, l.project || l.name, l.coordinator, l.contact, l.match,
        l.doneAt ? 'Closed — ' + l.where.toLowerCase() : l.where, l.score || '', l.doneAt ? '' : (l.due || ''),
        l.doneAt || '', l.ended,
        l.links.map(function (k) { return k.url && k.url !== k.name ? k.name + ' — ' + k.url : k.name; }).join('\n'),
        ups.map(function (u) { return (isDay(u.at) ? sayDay(u.at) : u.when) + ' — ' + u.text; }).join('\n'),
        ups.length && isDay(ups[0].at) ? ups[0].at : (ups.length ? ups[0].when : '')] });
    });
    upRows.sort(function (a, b) { return (b.at || '').localeCompare(a.at || ''); });
    var todos = data.todos.slice().sort(function (a, b) {
      if (!!a.doneAt !== !!b.doneAt) return a.doneAt ? -1 : 1;
      return (b.doneAt || '').localeCompare(a.doneAt || '');
    });
    var nTodo = 0;
    var todoRows = todos.map(function (t) {
      next.todos[t.id] = 1;
      var fresh = !!was && !was.todos[t.id];
      if (fresh) nTodo++;
      return { hl: fresh, v: [fresh ? 'new' : '', t.doneAt, t.project, t.call, t.text, t.deadline, t.updates, t.checklist] };
    });
    var open = data.leads.filter(function (l) { return !l.doneAt; }).length;
    var front = [
      ['Leads and closed todos', ''],
      ['', ''],
      ['Written', sayDay(today)],
      ['Previous export', was ? sayDay(was.at) : 'none — this is the first, so nothing is marked new'],
      ['Leads', open + ' open, ' + (data.leads.length - open) + ' closed'],
      ['Closed todos', String(todos.length)],
      ['', ''],
      ['Since the previous export', was ? nNew + ' lead' + (nNew === 1 ? '' : 's') + ' new or changed, ' +
        nTodo + ' todo' + (nTodo === 1 ? '' : 's') + ' newly closed' : ''],
      ['', 'Rows in yellow are new or changed since the previous export.', true],
      ['', ''],
      ['', 'Written by One App. Each export replaces the whole file, so changes made in it are overwritten next time.']
    ];
    var wb = book([
      { name: 'About', xml: about(front) },
      table('Leads', [
        { h: 'Since last', w: 10 }, { h: 'Arena', w: 22 }, { h: 'Type', w: 14 }, { h: 'Project', w: 34 },
        { h: 'Coordinator', w: 24 }, { h: 'Main contact', w: 22 }, { h: 'Match', w: 30 },
        { h: 'Where we are', w: 30 }, { h: 'Score', w: 7, k: 'num' }, { h: 'Next date', w: 13, k: 'date' },
        { h: 'Closed on', w: 13, k: 'date' }, { h: 'How it ended', w: 17 }, { h: 'Links', w: 40 },
        { h: 'Updates, newest first', w: 60 }, { h: 'Last update', w: 13, k: 'date' }], leadRows),
      table('Lead updates', [
        { h: 'Since last', w: 10 }, { h: 'Date', w: 13, k: 'date' }, { h: 'Arena', w: 22 },
        { h: 'Lead', w: 34 }, { h: 'Update', w: 80 }], upRows),
      table('Closed todos', [
        { h: 'Since last', w: 10 }, { h: 'Closed on', w: 13, k: 'date' }, { h: 'Project', w: 30 },
        { h: 'Call', w: 18 }, { h: 'Todo', w: 50 }, { h: 'Deadline', w: 13, k: 'date' },
        { h: 'Updates', w: 50 }, { h: 'Checklist', w: 40 }], todoRows)
    ]);
    return { blob: wb, next: next };
  }

  /* ── where it goes ──
     The file a page may write again is a handle the browser hands over once
     and lets be kept in IndexedDB (localStorage takes only text). */
  function db(fn) {
    try {
      var rq = indexedDB.open('one-app-excel', 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore('h'); };
      rq.onsuccess = function () { fn(rq.result); };
      rq.onerror = function () { fn(null); };
    } catch (e) { fn(null); }
  }
  function getHandle(cb) {
    db(function (d) {
      if (!d) return cb(null);
      try {
        var g = d.transaction('h').objectStore('h').get('file');
        g.onsuccess = function () { cb(g.result || null); };
        g.onerror = function () { cb(null); };
      } catch (e) { cb(null); }
    });
  }
  function putHandle(h) {
    db(function (d) {
      if (!d) return;
      try { d.transaction('h', 'readwrite').objectStore('h').put(h, 'file'); } catch (e) {}
    });
  }
  function download(blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = NAME;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }
  function write(h, blob) {
    return h.createWritable().then(function (w) {
      return w.write(blob).then(function () { return w.close(); });
    });
  }
  function pick() {
    return window.showSaveFilePicker({ suggestedName: NAME, types: [{ description: 'Excel workbook',
      accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }] })
      .then(function (h) { putHandle(h); return h; });
  }
  function done(out, where) {
    try { localStorage.setItem(SEEN, JSON.stringify(out.next)); } catch (e) {}
    Hub.note(where);
  }

  Hub.on('leads:excel', function (o) {
    var data;
    try { data = read(); } catch (e) { console.error(e); }
    if (!data) { Hub.note('The leads could not be read — is the Semaphore running?'); return; }
    var seen = null;
    try { seen = JSON.parse(localStorage.getItem(SEEN) || 'null'); } catch (e) {}
    var out;
    try { out = build(data, seen && seen.leads ? seen : null); }
    catch (e) { console.error(e); Hub.note('The Excel could not be written — see the console'); return; }
    if (typeof window.showSaveFilePicker !== 'function') {
      download(out.blob); done(out, 'Excel downloaded as “' + NAME + '”'); return;
    }
    var fresh = o && o.fresh;
    getHandle(function (h) {
      var go = (h && !fresh)
        ? h.requestPermission({ mode: 'readwrite' }).then(function (p) {
            if (p !== 'granted') throw new Error('not allowed');
            return write(h, out.blob).then(function () { return h; });
          }).catch(function (e) {
            /* moved, renamed or deleted since: ask where it is to go now */
            if (e && e.name === 'NotFoundError') return pick().then(function (n) { return write(n, out.blob).then(function () { return n; }); });
            throw e;
          })
        : pick().then(function (n) { return write(n, out.blob).then(function () { return n; }); });
      go.then(function (n) { done(out, 'Excel updated — “' + n.name + '”'); })
        .catch(function (e) {
          if (e && e.name === 'AbortError') return;
          console.error(e);
          /* Excel on Windows holds an open file shut to everyone else */
          Hub.note(e && e.name === 'NoModificationAllowedError'
            ? 'The Excel is open somewhere — close it and press again'
            : 'The Excel could not be written there — Alt-click (⌥-click) Excel to choose another place');
        });
    });
  });
})();

/* ── on the iPad, links open in DuckDuckGo ────────────────────────────
   Mark's browser on the iPad is DuckDuckGo, and he asked on 2026-10-10 for
   the app's links to open there. A home-screen web app does not follow the
   iPad's default-browser setting: a link it opens lands in Safari's sheet
   whatever is chosen. DuckDuckGo answers an address of its own,
   `ddgQuickLink://` followed by what to open, so every web link is handed
   over in that form instead. The link goes without its `https://`: the
   browser reads the first word after the `//` as the address's host and
   drops the colon behind it, so `https://site` arrived as `https//site`,
   which DuckDuckGo would search for rather than open; a bare `site/page`
   it opens, over https.

   It sits apart from the bridge above because that one stops at once when
   the Atlas is missing, and links must open whichever rooms came up. It
   listens on the window, in the capture phase, because half the app's links
   stop their click from rising (a link on a card must not also open the
   card), and a listener further down would never hear those. It only
   prevents the browser's own opening and lets the click go on, so whatever
   a room does on a link's press — stamping a pinned link, for one — still
   happens. Two rooms open links themselves with window.open (the Ledger's
   and the Notes room's rich text), so that is routed the same way, once:
   the press already handed over is not handed over twice.

   Links being edited inside a text are left alone, as the browser leaves
   them; mail addresses are not web links and keep going to Mail. The desk
   is untouched: a Mac reports no touch points, an iPad reports five while
   calling itself a Mac. */
(function () {
  'use strict';
  var ua = navigator.userAgent || '';
  var iPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (!iPad) return;

  var handed = '', handedAt = 0;
  function web(href) { return /^https?:\/\//i.test(String(href || '')); }
  function hand(url) {
    var now = Date.now();
    if (url === handed && now - handedAt < 1000) return;
    handed = url; handedAt = now;
    location.href = 'ddgQuickLink://' + url.replace(/^https?:\/\//i, '');
  }

  window.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || a.isContentEditable || !web(a.href)) return;
    e.preventDefault();
    hand(a.href);
  }, true);

  var open = window.open;
  window.open = function (url) {
    if (web(url)) { hand(String(url)); return null; }
    return open.apply(window, arguments);
  };
})();
