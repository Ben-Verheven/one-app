/* ══════════════════════════════════════════════════════════════════════
   notes.view.js — the Notes room's furniture.

   Only the standing furniture is here: the bar, the shelf column, the
   book area and the popup's empty housing. Everything that changes with
   the data — the shelf's entries, the open book, the note panels — is
   written by notes.js at run time, because furniture that restates the
   data goes stale the moment the data moves.

   Exactly two backticks live in this file, the pair around the markup,
   and no dollar-brace anywhere: the markup travels as one template
   literal and a third backtick would end it early, taking the rest of
   the room with it silently.
   ══════════════════════════════════════════════════════════════════ */
Hub.markup('notes', `
<div class="nt-room">

  <header class="nt-bar">
    <input id="nt-search" type="search" placeholder="Search the notes"
           autocomplete="off" spellcheck="false"
           oninput="NT.search(this.value)">
    <span class="seg nt-seg" role="group" aria-label="How to find a note"
          title="Two ways to a note: the shelf the tags build by themselves, or picking the tags yourself, one after another">
      <button id="nt-view-shelf" onclick="NT.view('shelf')">shelf</button>
      <button id="nt-view-tags" onclick="NT.view('tags')">tags</button>
    </span>
    <span id="nt-count" class="nt-count"></span>
    <!-- Carrying files by hand is the Ledger's job, once, for the whole
         app. What is left here is the one thing this room can answer for
         itself — whether its half of the cloud is up. Same chip, same
         states and same connection as the one in Semaphore's bar. -->
    <button class="oa-cloudchip" id="ntcloud" type="button" data-state="waiting"
            title="Cloud sync">
      <i aria-hidden="true"></i><span>cloud</span>
    </button>
  </header>

  <div class="nt-main">
    <nav id="nt-shelf" class="nt-shelf" aria-label="The shelf">
      <!-- Writing a note is the one thing this room is for, so it stands
           at the head of the column the eye lands on first rather than as
           the first of five same-looking controls in the bar. It is the
           room's own mark and nothing else: no border, no fill, no word.
           The word is in the title and the aria-label, which is where the
           only copy of it lives — see .nt-new in notes.css. -->
      <button id="nt-new" class="nt-new" onclick="NT.newNote()"
              title="Write a note" aria-label="Write a note">
        <span class="nt-nut" aria-hidden="true"></span></button>
      <div id="nt-shelf-h" class="nt-shelf-h">The shelf</div>
      <input id="nt-make" class="nt-make" type="text" autocomplete="off"
             spellcheck="false" placeholder="make a book from a tag…"
             aria-label="Make a book from a tag"
             oninput="NT.makeSuggest()" onkeydown="NT.makeKey(event)"
             onfocus="NT.makeSuggest()">
      <div id="nt-books-wrap" class="nt-books-wrap"></div>
    </nav>
    <section id="nt-book" class="nt-book"></section>
  </div>

  <div id="nt-pop" class="nt-pop" hidden></div>

</div>
`);
