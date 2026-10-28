/* The Brokerage Semaphore — the room's own furniture. Plain HTML; Hub puts it in the
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
  <!-- Venues and Leads, the room's two pages, a matched pair either side
       of the middle (Mark, 2026-10-25): the same height, shape and type,
       each in its own colour with its own mark, because they are two
       different things. Venues is where the brokerage is followed, in
       Arising, Active, Dying and Limbo, each on one strip of time; it was
       the Now page until 2026-10-15, and is still "now" in the code. Leads
       is the work the venues turned up, its ruit drawn small in front of
       the word (Mark, 2026-10-12). -->
  <div class="pair">
    <button class="venuesbtn" id="venuesBtn" data-act="setView" data-v="now"
            title="The venues you follow, by where each stands"><i class="vbr" aria-hidden="true"></i>Venues</button>
    <button class="leadsbtn" id="leadsBtn" data-act="setView" data-v="leads"
            title="Every lead you are pursuing, in the step it has reached"><i class="lbr" aria-hidden="true"><i></i></i>Leads</button>
  </div>
  <div class="grow"></div>
  <div class="actions">
    <!-- Whether this room's half of the cloud is up stays in sight, as the
         Ledger's does beside its own menu. Carrying the board by hand is
         the Ledger's job, once, for the whole app: its Export writes this
         board out beside the journal and its Import reads it back. -->
    <button class="oa-cloudchip" id="semcloud" type="button" data-state="waiting"
            title="Cloud sync">
      <i aria-hidden="true"></i><span>cloud</span>
    </button>
    <!-- Everything else, now and then wanted, under one menu (Mark,
         2026-10-25), the search that stood beside it gone: the types, kept
         in one place; a new venue or arena; and ChatGPT's search for
         brokerage (2026-10-22; the calls went to the Call Board's own
         button on 2026-10-25), a file of the board and the instructions for
         ChatGPT's deep research, and its answer read back as a list of
         changes, each new or changed venue checked in its card. -->
    <div class="semmore">
      <button class="semmorebtn" id="semMoreBtn" data-act="semMenu" aria-haspopup="true" aria-expanded="false"
              aria-label="More" title="Types, a new venue or arena, ChatGPT"><svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2.4"/><circle cx="12" cy="12" r="2.4"/><circle cx="12" cy="19" r="2.4"/></svg></button>
    </div>
  </div>
</header>

<main id="now"></main>
<main id="wall" hidden></main>

</div><!-- /#semscroll -->

<!-- Back from a venue's site: what did it give? (see "the visit question") -->
<div id="vbar" hidden></div>

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
    <p class="sub">Drag a type by its grip to reorder — the order here is the order of the groups on Venues and in Mark’s Place — or drop it onto another type to merge the two. Open a type to see its arenas in your own order — the order they stand in on the Call Board — and drag one up or down to reorder it, or onto another type to move it there. Rename in place; the dot is the type's colour. A type can be removed once it holds no arenas.</p>
    <div id="tylist"></div>
    <div class="taddrow" style="margin-top:10px">
      <input type="text" id="tyNew" placeholder="New type name">
      <button class="btn" data-act="addType">Add</button>
    </div>
    <div class="mbtns"><button class="btn primary" data-act="closeModals">Done</button></div>
  </div>
</div>

<!-- ChatGPT's search: the file out, the answer in (see "ChatGPT's search"
     in semaphore.js), for brokerage from here and for calls from the Call
     Board, which borrows this box. What differs between the two searches
     is written for each, and the one opened is shown. Nothing reaches the
     board before Put on the board. -->
<div class="modal" id="gptModal">
  <div class="mbox">
    <h2 data-gk="venues">ChatGPT's search for brokerage</h2>
    <h2 data-gk="calls" hidden>ChatGPT's search for calls</h2>
    <p class="sub" data-gk="venues"><b>1.</b> Write the file: every arena with its brokerage and links, and its call dates to go by; every venue; and the instructions. Your leads, visits and notes stay out. Give the file to ChatGPT with deep research on, and ask it to do what the file says.</p>
    <p class="sub" data-gk="calls" hidden><b>1.</b> Write the file: every arena with its call dates and links, and the instructions. Brokerage is the Brokerage Semaphore's own search. Give the file to ChatGPT with deep research on, and ask it to do what the file says.</p>
    <div class="gptrow"><button class="btn primary" data-act="gptWrite">Write the file for ChatGPT</button></div>
    <p class="sub" data-gk="venues"><b>2.</b> Paste what ChatGPT gave back, or choose its file. Nothing changes until you press Put on the board. Then each new venue, and each venue it changed, is put to you in its card, one at a time.</p>
    <p class="sub" data-gk="calls" hidden><b>2.</b> Paste what ChatGPT gave back, or choose its file. Nothing changes until you press Put on the board. Then new and corrected call dates go straight on and glow on the Call Board until you press Seen, and each new arena it suggests is put to you there in turn.</p>
    <textarea id="gptText" placeholder="Paste ChatGPT's answer here"></textarea>
    <div class="gptrow"><label class="btn">Choose its file<input type="file" id="gptFile" accept=".json,.txt,.md,application/json,text/plain" hidden></label></div>
    <div id="gptSaid"></div>
    <div class="mbtns">
      <span style="flex:1"></span>
      <button class="btn" data-act="closeModals">Close</button>
      <button class="btn primary" id="gptPut" data-act="gptPut" disabled>Put on the board</button>
    </div>
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

<!-- The header's menu, here and not in the header: the app's bar is one
     height and cuts off whatever hangs below it (see semMenu). -->
  <div class="semmenu" id="semMenu" role="menu" hidden>
    <button role="menuitem" data-act="vNew">+ Venue</button>
    <button role="menuitem" data-act="addArena">+ Arena</button>
    <button role="menuitem" data-act="openTypes">Types</button>
    <i class="semsep" aria-hidden="true"></i>
    <button role="menuitem" data-act="openGpt"
            title="Write a file for ChatGPT to search the web for brokerage events and partner-search tools, and read its answer back">ChatGPT's search for brokerage</button>
  </div>

<div id="tip"></div>



`);
