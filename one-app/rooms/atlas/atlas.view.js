/* Researcher Atlas — the room's own furniture. Plain HTML; Hub puts it in the
   pane before the room is mounted. Two characters must not appear
   here, because the markup travels as a template literal: a
   backtick, and a dollar immediately followed by a brace. */
Hub.markup('atlas', `

<div id="app">
  <header>
    <div class="wordmark">Atlas<small>Researcher atlas · Mathematics &amp; Computer Science</small></div>
    <nav>
      <button id="tab-search" class="on">Search</button>
      <button id="tab-browse">Browse</button>
      <button id="tab-walk">Map &amp; walk</button>
      <!-- What the scheduled agent found about people on the web, waiting
           for a yes or a no. The count is filled in once the cloud answers. -->
      <button id="tab-news">News<span class="an-badge" id="newsBadge" hidden></span></button>
    </nav>
    <div class="spacer"></div>
    <button id="editToggle" class="hbtn" title="Toggle graph editing"><span class="dot" style="background:var(--danger)"></span>&nbsp;Edit graph</button>
    <button id="aboutBtn" class="hbtn">About</button>
    <!-- The graph itself is a generated file and never changes here; what
         this room has of its own is the edit list, and this says whether
         that half of the cloud is up. Same chip, same states and same
         connection as the ones in Semaphore's and Notes' bars. -->
    <button class="oa-cloudchip" id="atcloud" type="button" data-state="waiting"
            title="Cloud sync">
      <i aria-hidden="true"></i><span>cloud</span>
    </button>
  </header>
  <div id="body">
    <aside id="rail"></aside>
    <button id="railOpen" class="railopen" type="button" title="Show the settings" aria-label="Show the settings"></button>
    <div id="main"></div>
  </div>
</div>

<div id="dossier"><button class="dclose" id="dclose">✕</button><div id="dhead"></div><div id="dbody"></div></div>
<div id="modal"><div id="modalbox"></div></div>
<div id="toast"></div>





`);
