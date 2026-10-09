/* ══════════════════════════════════════════════════════════════════════
   Hub — the only thing the five rooms have in common.

   Each app is inserted verbatim and mounted inside a function that
   receives its own `document`, `window` and `localStorage`. The document
   it sees resolves ids and selectors inside its own pane and nowhere
   else, which is what lets four vanilla apps that all named something
   `.card` live in one page without knowing about each other.
   ══════════════════════════════════════════════════════════════════ */
var Hub = (function () {

  var realDoc = document, realWin = window;
  var panes = {}, apis = {}, active = null;

  /* Events that must sit on the real document to work at all: keys arrive
     wherever focus is, and a drag that leaves the pane still has to hear
     the mouseup. They are gated on the pane being the visible one. */
  var DOC_GUARDED = {
    keydown: 1, keyup: 1, keypress: 1,
    mousemove: 1, mouseup: 1, mouseleave: 1,
    pointermove: 1, pointerup: 1, pointercancel: 1,
    touchmove: 1, touchend: 1, touchcancel: 1,
    dragover: 1, dragend: 1, drop: 1, resize: 1,
    paste: 1, copy: 1, cut: 1, selectionchange: 1
  };
  /* Lifecycle events belong to the page, not to a room. */
  var DOC_OPEN = {
    visibilitychange: 1, DOMContentLoaded: 1, readystatechange: 1,
    fullscreenchange: 1
  };
  /* `focus` is the window coming back to the front, which is the page's
     news: routed to the pane, where a focus event never bubbles, a room
     listening for it heard nothing at all. */
  var WIN_OPEN = {
    load: 1, pagehide: 1, pageshow: 1, beforeunload: 1,
    unload: 1, hashchange: 1, popstate: 1, message: 1,
    online: 1, offline: 1, storage: 1, error: 1, unhandledrejection: 1,
    focus: 1
  };

  function esc(id) {
    return (realWin.CSS && CSS.escape) ? CSS.escape(id)
      : String(id).replace(/[^\w-]/g, function (c) { return '\\' + c; });
  }

  /* ── event plumbing ───────────────────────────────────────────────── */

  function router(pid, root, isWindow) {
    var wrapped = new WeakMap();

    function targetFor(type) {
      /* a window listener that needs gating still belongs on the window —
         resize and friends never fire on the document */
      if (isWindow) return (WIN_OPEN[type] || DOC_GUARDED[type]) ? realWin : root;
      if (DOC_OPEN[type] || DOC_GUARDED[type]) return realDoc;
      return root;
    }
    function guardFor(type, fn) {
      var needsGuard = (targetFor(type) !== root) && DOC_GUARDED[type];
      if (!needsGuard) return fn;
      var byType = wrapped.get(fn);
      if (!byType) { byType = {}; wrapped.set(fn, byType); }
      if (!byType[type]) {
        byType[type] = function (ev) {
          if (active !== pid) return;
          return (typeof fn === 'function') ? fn.call(this, ev)
            : fn.handleEvent && fn.handleEvent(ev);
        };
      }
      return byType[type];
    }
    return {
      add: function (type, fn, opts) {
        if (!fn) return;
        targetFor(type).addEventListener(type, guardFor(type, fn), opts);
      },
      remove: function (type, fn, opts) {
        if (!fn) return;
        targetFor(type).removeEventListener(type, guardFor(type, fn), opts);
      }
    };
  }

  /* ── the scoped document ──────────────────────────────────────────── */

  function paneDocument(pid, root) {
    var route = router(pid, root, false), cache = {};

    var own = {
      /* The room first, then the shell — but never another room. Falling
         all the way back to the page meant that an id one room happened
         to share with another (there was one: `count`) would be answered
         with the other room's element the moment the asking room's own
         copy was not on screen yet, and the room would then write its
         text into a stranger. The shell's own furniture is still reachable
         by id, because the rooms do reach for it. */
      getElementById: function (id) {
        var mine = root.querySelector('#' + esc(id));
        if (mine) return mine;
        var any = realDoc.getElementById(id);
        return (any && !any.closest('.pane')) ? any : null;
      },
      querySelector: function (sel) {
        try { return root.querySelector(sel); } catch (e) { return null; }
      },
      querySelectorAll: function (sel) {
        try { return root.querySelectorAll(sel); } catch (e) { return []; }
      },
      getElementsByClassName: function (c) { return root.getElementsByClassName(c); },
      getElementsByTagName: function (t) {
        return t === 'body' ? [root] : root.getElementsByTagName(t);
      },
      getElementsByName: function (n) {
        return root.querySelectorAll('[name="' + n + '"]');
      },
      addEventListener: route.add,
      removeEventListener: route.remove,
      contains: function (n) { return root.contains(n); },
      __win: null
    };

    return new Proxy(realDoc, {
      get: function (t, k) {
        if (k in own) return own[k];
        if (k === 'body' || k === 'documentElement' || k === 'scrollingElement') return root;
        if (k === 'defaultView') return own.__win;
        var v = t[k];
        if (typeof v === 'function') {
          if (!cache[k]) cache[k] = v.bind(t);
          return cache[k];
        }
        return v;
      },
      set: function (t, k, v) {
        if (k === '__win') { own.__win = v; return true; }
        t[k] = v; return true;
      },
      has: function (t, k) { return (k in own) || (k in t); }
    });
  }

  /* ── the scoped window ────────────────────────────────────────────── */

  function paneWindow(pid, root, doc) {
    var route = router(pid, root, true), cache = {};

    /* Atlas persists its edits through `window.storage`, which only exists
       inside Claude. Backed by localStorage here so the room behaves the
       same on a filesystem. */
    var storage = {
      get: function (k) {
        return Promise.resolve().then(function () {
          var v = realWin.localStorage.getItem('hub.storage.' + k);
          return v === null ? null : { key: k, value: v };
        });
      },
      set: function (k, v) {
        return Promise.resolve().then(function () {
          realWin.localStorage.setItem('hub.storage.' + k, String(v));
          return { key: k, value: String(v) };
        });
      },
      delete: function (k) {
        return Promise.resolve().then(function () {
          realWin.localStorage.removeItem('hub.storage.' + k);
          return { key: k, deleted: true };
        });
      },
      list: function (p) {
        return Promise.resolve().then(function () {
          var out = [], pre = 'hub.storage.' + (p || '');
          for (var i = 0; i < realWin.localStorage.length; i++) {
            var k = realWin.localStorage.key(i);
            if (k.indexOf(pre) === 0) out.push(k.slice('hub.storage.'.length));
          }
          return { keys: out };
        });
      }
    };

    var own = {
      document: doc,
      storage: storage,
      addEventListener: route.add,
      removeEventListener: route.remove,
      /* the page does not scroll any more — the room does */
      scrollTo: function (a, b) {
        if (a && typeof a === 'object') root.scrollTo(a);
        else root.scrollTo(a || 0, b || 0);
      },
      scrollBy: function (a, b) {
        if (a && typeof a === 'object') root.scrollBy(a);
        else root.scrollBy(a || 0, b || 0);
      }
    };

    var proxy = new Proxy(realWin, {
      get: function (t, k) {
        if (k === 'Hub') return Hub;
        if (k in own && own[k] !== null) return own[k];
        if (k === 'innerWidth') return root.clientWidth || t.innerWidth;
        if (k === 'innerHeight') return root.clientHeight || t.innerHeight;
        if (k === 'scrollY' || k === 'pageYOffset') return root.scrollTop || 0;
        if (k === 'scrollX' || k === 'pageXOffset') return root.scrollLeft || 0;
        if (k === 'self' || k === 'window' || k === 'globalThis') return proxy;
        var v = t[k];
        if (typeof v === 'function' && !/^[A-Z]/.test(String(k))) {
          if (!cache[k]) cache[k] = v.bind(t);
          return cache[k];
        }
        return v;
      },
      set: function (t, k, v) { t[k] = v; return true; },
      has: function (t, k) { return (k in own) || (k in t); }
    });

    doc.__win = proxy;   /* document.defaultView points back at the room */
    return proxy;
  }

  /* ── mounting ─────────────────────────────────────────────────────── */

  /* Rooms whose contents are large and which nothing reaches into at
     load are built the first time they are opened rather than with the
     page. The Call Board is the one: several megabytes of Commission
     prose to construct. The other three are reached into at load — the
     Atlas hands over its graph, Semaphore its state, the Ledger its API
     — so they are built then, as before.

     Something does reach into the Board now: a project in the Ledger can
     be written for one of its topics. But never at load — the bridge
     calls Hub.ensure() at the moment somebody asks for a topic, which
     builds the room where it stands without showing it, so the rule this
     list exists for still holds. */
  var LAZY = { callboard: 1 };
  var waiting = {};
  var built = {}, failed = {};

  function build(pid, fn) {
    var p = panes[pid];
    try {
      fn.call(p.win, p.win, p.doc, realWin.localStorage);
      built[pid] = true;
    } catch (e) {
      built[pid] = false;
      failed[pid] = (e && e.message) || String(e);
      console.error('Hub: ' + pid + ' failed to start', e);
      /* A room that did not start is the one thing worth interrupting for,
         and the reason has to be readable without opening a console —
         which on an iPad is not readable at all. So it stays on screen. */
      note(pid + ' did not start \u2014 ' + failed[pid], 60000);
    }
  }

  function ensure(pid) {
    var fn = waiting[pid];
    if (!fn) return;
    delete waiting[pid];
    build(pid, fn);
  }

  /* ── furniture ──────────────────────────────────────────────────── */

  /* A room's markup used to sit in the page, inside its pane, which meant
     the page held all four rooms' furniture and none of it could be
     edited without opening the whole app. It now arrives from the room's
     own view file, ahead of its mount, and lands in the same place. */
  function markup(pid, html) {
    var root = realDoc.getElementById('pane-' + pid);
    if (!root) { console.error('Hub: no pane for ' + pid); return; }
    root.innerHTML = html;
  }

  /* A room showing something over the top of itself cannot cover the
     shell's own marks: the ring and the name are fixed at z-index 250 in
     the page's stacking context, and every pane is a stacking context of
     its own — so nothing inside a room is ever drawn above them, however
     high it goes. A room with a modal open says so here and the shell
     stands aside. It is also what stops a press landing on another room
     while a form is waiting to be answered. */
  function veil(on) {
    realDoc.documentElement.classList.toggle('oa-veiled', !!on);
  }

  function mount(pid, fn) {
    var root = realDoc.getElementById('pane-' + pid);
    if (!root) { console.error('Hub: no pane for ' + pid); return; }
    var doc = paneDocument(pid, root);
    var win = paneWindow(pid, root, doc);
    panes[pid] = { root: root, doc: doc, win: win };
    /* the pane is registered either way, so anything asking whether a
       room exists gets the right answer before it has been built */
    if (LAZY[pid]) waiting[pid] = fn; else build(pid, fn);
  }

  /* ── rooms ────────────────────────────────────────────────────────── */

  function go(pid, silent) {
    if (!panes[pid]) return;
    ensure(pid);
    Object.keys(panes).forEach(function (k) {
      panes[k].root.classList.toggle('on', k === pid);
      panes[k].root.setAttribute('aria-hidden', k === pid ? 'false' : 'true');
    });
    var was = active;
    active = pid;
    if (!silent) {
      try { realWin.localStorage.setItem('hub.room', pid); } catch (e) {}
    }
    /* A listener that throws must not stop the others or the move, but it
       is still a bug, and swallowing it without a word — as `emit` never
       did — hid every one of them. */
    listeners.forEach(function (fn) { try { fn(pid, was); } catch (e) { console.error(e); } });
    /* apps that size themselves off the viewport get a nudge on arrival */
    realWin.dispatchEvent(new Event('resize'));
  }

  var listeners = [];
  function onRoom(fn) { listeners.push(fn); }

  /* a two-line bus, so an app's epilogue can say something happened
     without knowing who is listening */
  var subs = {};
  function on(name, fn) { (subs[name] || (subs[name] = [])).push(fn); }
  function emit(name) {
    var args = [].slice.call(arguments, 1);
    (subs[name] || []).forEach(function (fn) {
      try { fn.apply(null, args); } catch (e) { console.error(e); }
    });
  }

  function note(text, ms) {
    var box = realDoc.getElementById('oa-toasts');
    if (!box) { console.warn('Hub:', text); return; }
    var el = realDoc.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    box.appendChild(el);
    setTimeout(function () { el.remove(); }, ms || 5000);
  }

  var Hub = {
    mount: mount,
    markup: markup,
    veil: veil,
    go: go,
    note: note,
    onRoom: onRoom,
    on: on,
    emit: emit,
    pane: function (id) { return panes[id]; },
    ensure: ensure,
    panes: panes,
    expose: function (id, obj) { apis[id] = obj; },
    api: function (id) { return apis[id] || {}; },
    /* what actually happened at startup, for anything that has to wait on
       a room rather than assume it is there */
    started: function (id) { return !!built[id]; },
    failure: function (id) { return failed[id] || null; },
    active: function () { return active; }
  };
  return Hub;
})();

