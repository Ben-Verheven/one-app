/* Brokerage Semaphore — the room's own furniture. Plain HTML; Hub puts it in the
   pane before the room is mounted. Two characters must not appear
   here, because the markup travels as a template literal: a
   backtick, and a dollar immediately followed by a brace. */
Hub.markup('semaphore', `

<div id="semscroll">

<header class="top">
  <div class="mark">
    <h1><i class="markglyph"></i>Brokerage Semaphore</h1>
  </div>
  <div class="grow"></div>
  <div class="viewseg" id="viewseg">
    <button data-act="setView" data-v="brokerage">Cards</button>
    <button data-act="setView" data-v="board">Board</button>
    <!-- Every arena's dates on one line in time order, brokerage first: the
         phone companion's "Coming up", given the desk's width. -->
    <button data-act="setView" data-v="coming">Coming up</button>
  </div>
  <div class="grow"></div>
  <div class="actions">
    <!-- Search is a button until it is wanted, and only then a box: the
         header keeps its quiet, and a search you have typed keeps the box
         open, so the board never hides arenas without saying why. -->
    <button class="btn ghost" id="searchBtn" data-act="openSearch">Search</button>
    <input id="search" type="search" placeholder="Search\u2026" hidden
           title="Searches arena names, tags, notes, tools, dates and leads">
    <button class="btn primary" data-act="addArena">+ Arena</button>
    <!-- Carrying files by hand is the Ledger's job, once, for the whole app:
         its Export writes this board out beside the journal and its Import
         reads it back. What is left here is the one thing this room can
         answer for itself — whether its half of the cloud is up. -->
    <!-- What the scheduled agent found overnight. It waits in a table of its
         own in the cloud and nothing it says reaches the board until it is
         accepted here, so it is a view of its own rather than a mark on the
         board itself. It sits beside the cloud chip and not in the view
         switcher: the switcher holds ways of looking at the same board, and
         this is an inbox, which looked out of place as a fourth of them. -->
    <button class="btn" id="dispatchBtn" data-act="setView" data-v="dispatch">Dispatches</button>
    <button class="oa-cloudchip" id="semcloud" type="button" data-state="waiting"
            title="Cloud sync">
      <i aria-hidden="true"></i><span>cloud</span>
    </button>
  </div>
</header>

<main id="board"></main>
<main id="wall" hidden></main>
<main id="coming" hidden></main>
<main id="dispatch" hidden></main>
<section id="freezer" aria-label="Freezer" hidden></section>

</div><!-- /#semscroll -->

<div class="scrim" id="cardScrim"></div>
<aside id="card" aria-label="Arena" tabindex="-1"></aside>

<div class="modal" id="quickModal">
  <div class="mbox">
    <h2>Quick add arenas</h2>
    <p class="sub">One per line: <code>Name ; Type ; tag, tag</code> — type and tags optional. Unknown types are created.</p>
    <textarea id="quickText" placeholder="2ZERO ; Partnership ; mobility
Chips JU ; Joint Undertaking ; semiconductors
ITEA 4 ; Programme ; software"></textarea>
    <div class="mbtns">
      <span class="hint" id="quickPrev"></span>
      <span style="flex:1"></span>
      <button class="btn" data-act="closeModals">Cancel</button>
      <button class="btn primary" data-act="quickCreate">Create</button>
    </div>
  </div>
</div>

<div class="modal" id="typesModal">
  <div class="mbox">
    <h2>Arena types</h2>
    <p class="sub">Rename in place — every arena of that type follows. The dot is the type's colour, which its arenas' leads wear everywhere; click it to choose another. Reorder with the arrows; the cards, the board and Pocket all use this order. A type can be removed once no arena uses it.</p>
    <div id="tylist"></div>
    <div class="taddrow" style="margin-top:10px">
      <input type="text" id="tyNew" placeholder="New type name">
      <button class="btn" data-act="addType">Add</button>
    </div>
    <div class="mbtns"><button class="btn primary" data-act="closeModals">Done</button></div>
  </div>
</div>

<!-- Asking, and saying. The room used to borrow the browser's confirm()
     and alert() for both, which put a grey system box with the file's URL
     in it over a board that has an idiom of its own for everything else. -->
<div class="modal" id="askModal" role="alertdialog" aria-modal="true"
     aria-labelledby="askTitle" aria-describedby="askBody">
  <div class="mbox mbox-ask">
    <h2 id="askTitle"></h2>
    <p class="sub" id="askBody"></p>
    <div class="mbtns">
      <span style="flex:1"></span>
      <button class="btn" id="askNo">Cancel</button>
      <button class="btn primary" id="askYes">Yes</button>
    </div>
  </div>
</div>

<div id="tip"></div>



`);
