/* Call Board — the room's own furniture. Plain HTML; Hub puts it in the
   pane before the room is mounted. Two characters must not appear
   here, because the markup travels as a template literal: a
   backtick, and a dollar immediately followed by a brace. */
Hub.markup('callboard', `


<header id="hdr">
  <div class="tabs" id="tabs" role="tablist" aria-label="Clusters"></div>
  <div class="hd-controls" style="padding:10px 20px 11px">
    <div class="search"><input id="q" type="search" placeholder="Search topic ID or title…" aria-label="Search topics"><button class="clr" id="qclr" aria-label="Clear search">✕</button></div>
    <div class="typechips" id="typechips" role="group" aria-label="Filter by type of action"></div>
    <button class="ftchip" id="ftchip" aria-pressed="false" title="Also search Expected Outcome and Scope text">＋ full text</button>
    <div id="pills"></div>
    <span class="count" id="count"></span>
    <!-- what waits to be judged, and a press to begin; while judging, how far
         along (see "judging the finds, one at a time" in callboard.js) -->
    <button class="jpill" id="jpill" hidden></button>
  </div>
  <div class="ovbar" id="ovbar">
    <span class="seglabel">Submission deadline between</span>
    <span class="span-readout" id="spanread"></span>
    <div class="presets" id="presets"></div>
    <span class="seglabel">Topics</span>
    <div class="seg" id="groupseg">
      <button data-v="deadline" aria-pressed="true">By call &amp; deadline</button>
      <button data-v="cluster" aria-pressed="false">By cluster &amp; destination</button>
    </div>
    <span class="seglabel">Timeline</span>
    <div class="seg" id="arrangeseg">
      <button data-v="cluster" aria-pressed="true">By cluster</button>
      <button data-v="chrono" aria-pressed="false">Chronological</button>
    </div>
    <div class="cchips" id="cchips"></div>
  </div>
</header>

<div class="wrap">
  <main class="ledger" id="ledger" aria-label="Topics by destination"></main>
  <aside class="tl-sticky">
    <!-- The chart's title, and beside it the switch that draws the venues
         kept on the board as lanes over the calls (Mark, 2026-10-24). -->
    <div class="tl-title"><span id="tltxt">Calls · chronological</span>
      <button class="bk" id="bkswitch" aria-pressed="false" title="Draw the venues kept on the board over the calls"><span class="sw" aria-hidden="true"><i></i></span>Brokerage</button></div>
    <div class="tl" id="tl"></div>
    <!-- On an arena's tab, which has no list, what a search finds in the
         other tabs stands here, under the chart. -->
    <div class="tlaway" id="tlaway"></div>
    <div class="tl-foot">
      <div class="selcard" id="selcard"></div>
      <div class="famkey" id="famkey"></div>
      <div class="legend">
        <span class="li"><span class="sw"></span>open → deadline</span>
        <span class="li"><span class="sw hatch"></span>stage 1 → stage 2</span>
        <span class="li"><span class="sw tdy"></span>today</span>
        <span class="li" id="legcolour">colour = call series · saturated tone = 2026 call, pale tone = 2027 call</span>
      </div>
      <div class="src">Source: Horizon Europe Work Programme 2026–2027, Parts 4–9 and Part 14, as adopted. Budgets in EUR million, indicative. Openings may shift ±1 month and deadlines up to +2 months at the DG's discretion — confirm on the Funding &amp; Tenders portal before acting.</div>
    </div>
  </aside>
</div>

<!-- A find waiting to be judged: what it is, where it was read, and the
     choice, at the foot of the room while the board shows it in its tab. -->
<div class="jbar" id="jbar" role="region" aria-label="Judging what was found" hidden></div>

<div class="scrim" id="scrim"></div>
<aside class="reader" id="reader" role="dialog" aria-modal="true" aria-labelledby="rdtitle" aria-hidden="true">
  <div class="rd-head">
    <button class="rd-close" id="rdclose" aria-label="Close">✕</button>
    <h2 id="rdtitle"></h2>
    <div class="rd-meta" id="rdmeta"></div>
    <div class="rd-links" id="rdlinks"></div>
  </div>
  <div class="rd-body" id="rdbody"></div>
</aside>



`);
