/* ═══════════════════════════════════════════════════════════════════════
   Boot check — the price of loading the rooms as separate files.

   In one file, a typo took the whole app down and you knew at once. In
   twelve, a file that fails to parse takes only its own room down, and
   the app comes up looking healthy with one room quietly missing. So the
   shell counts the rooms that registered and says which did not.

   This is the only file in the tree that did not come out of the single
   file. Delete it and nothing else changes.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  var EXPECT = ['ledger', 'semaphore', 'callboard', 'atlas', 'notes'];

  function check() {
    var absent = EXPECT.filter(function (r) { return !Hub.pane(r); });
    if (!absent.length) return;
    absent.forEach(function (r) {
      Hub.note(r + ' did not load — check rooms/' + r + '/ in the console', 60000);
      console.error('Hub: ' + r + ' never registered. Its view or its script '
        + 'failed to parse, or index.html does not list it.');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', check);
  } else {
    check();
  }
})();
