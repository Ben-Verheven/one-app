/* pocket.js — open Pocket in a phone-sized throwaway browser, against a
   fake cloud, and ask whether it logs in and draws every tab.
   Run: node tools/pocket.js [outdir]   (outdir: a screenshot per tab)

   Every Pocket change used to end with a Playwright script written afresh
   in a temporary folder, and each one rebuilt the same three things: a
   board to show, a cloud that refuses a request without a session, and a
   walk through the tabs. This is that script, kept, so the check costs one
   command and the session's time goes on the change instead.

   The board is the desk's own example set, pressed in the Semaphore room
   exactly as seed.js presses it, so it cannot drift from what the desk
   writes. Mark's export never enters the repository, so it cannot be used
   here; a change to the data model still needs the contract check in
   pocket/POCKET.md. So does a change to a write: this runs the reads only,
   and says how many writes Pocket made unasked, which should be none. */
const { chromium } = require('playwright');
const path = require('path');
const seed = require('./seed.js');

const ROOT = path.resolve(__dirname, '..');
const shot = process.argv[2] || null;

/* The cloud as the lock of 2026-10-09 left it: the anon key alone gets an
   empty table, never a refusal, which is exactly the case Pocket has to
   tell apart from "no Semaphore row". */
function fakeCloud(page, rows, said) {
  return page.route(/supabase\.co\/(auth|rest)\/v1\//, (route, req) => {
    const url = req.url(), bearer = (req.headers()['authorization'] || '');
    if (url.includes('/auth/v1/token')) {
      return route.fulfill({ json: { access_token: 'tok', refresh_token: 'ref',
        expires_in: 3600, user: { email: 'test@example.org' } } });
    }
    if (url.includes('/auth/v1/')) return route.fulfill({ json: {} });
    if (req.method() !== 'GET') { said.writes++; return route.fulfill({ status: 201, body: '' }); }
    return route.fulfill({ json: bearer === 'Bearer tok' ? rows : [] });
  });
}

/* What each view holds once drawn: the length of its words. Every tab
   says something even when empty ("Nothing pinned yet"), so a number alone
   proves nothing; it is read against the same tab over an empty cloud. */
async function views(page, shoot) {
  const out = {};
  for (const tab of ['rot', 'dates', 'pins', 'leads']) {
    await page.click('#tabs button[data-tab="' + tab + '"]');
    await page.waitForTimeout(150);
    out[tab] = await page.evaluate(t =>
      document.getElementById('v-' + t).innerText.replace(/\s+/g, ' ').trim().length, tab);
    if (shoot) await page.screenshot({ path: path.join(shot, 'pocket-' + tab + '.png') });
  }
  await page.click('#find');
  await page.waitForTimeout(150);
  out.people = await page.evaluate(() => document.querySelectorAll('#people-list > *').length);
  return out;
}

async function run(browser, name, rows, login, shoot) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 },
                                         deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage();
  const said = { name, errors: [], writes: 0 };
  page.on('console', m => { if (m.type() === 'error') said.errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => said.errors.push('PAGEERROR ' + String(e).slice(0, 300)));
  await fakeCloud(page, rows, said);
  await page.goto('file://' + path.join(ROOT, 'pocket', 'index.html'), { waitUntil: 'load' });
  await page.waitForTimeout(400);
  said.asksLogin = await page.evaluate(() => document.getElementById('setup').classList.contains('up'));
  if (login) {
    await page.fill('#s-email', 'test@example.org');
    await page.fill('#s-pass', 'secret');
    await page.click('#s-save');
    await page.waitForTimeout(800);
    said.stamp = await page.evaluate(() => document.getElementById('stamp').textContent);
    said.views = await views(page, shoot);
  }
  await ctx.close();
  return said;
}

(async () => {
  const browser = await chromium.launch();

  const desk = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await desk.goto('file://' + path.join(ROOT, 'one-app', 'index.html'), { waitUntil: 'load' });
  await desk.waitForTimeout(1200);
  const arenas = await seed.semaphore(desk, 0);
  const board = await desk.evaluate(() => JSON.parse(JSON.stringify(window.Hub.api('semaphore').state())));
  await desk.close();
  /* The example set pins nothing, which would leave Pinned showing only
     its empty message: two brokerage links, on two arenas, are pinned here.
     Only links can be pinned since 2026-10-11, and one link alone says fewer
     words than the message it replaces, which the verdict below would read
     as a tab that drew nothing. */
  if (board.arenas && board.arenas.length) {
    const withLink = board.arenas.filter(a => a.brokerage && (a.brokerage.links || []).length);
    withLink.slice(0, 2).forEach(a => { a.brokerage.links[0].pin = new Date().toISOString(); });
  }

  const report = [
    await run(browser, 'full board', [{ id: 'semaphore', data: board }], true, !!shot),
    await run(browser, 'no row', [], true),
    await run(browser, 'never logged in', [], false)
  ];
  await browser.close();

  /* The verdict is worked out here rather than left to whoever reads the
     numbers: a full board must fill every tab, the empty cloud must say so
     in the stamp, and a phone that never logged in must be asked to. */
  const full = report[0], none = report[1], fresh = report[2];
  const wrong = [];
  if (!arenas) wrong.push('the desk had no example board to press');
  for (const r of report) {
    const errs = r.errors.filter(e => !/net::ERR/.test(e));
    if (errs.length) wrong.push(r.name + ': ' + errs.join(' | '));
    if (r.writes) wrong.push(r.name + ': ' + r.writes + ' write(s) made unasked');
  }
  /* People is Pocket's own copy of the Atlas, the same with or without a
     cloud, so it only has to be there at all. */
  for (const [tab, n] of Object.entries(full.views || {}))
    if (tab === 'people' ? !n : !(n > ((none.views || {})[tab] || 0)))
      wrong.push('full board: ' + tab + ' drew no more than the empty cloud');
  if (!/no Semaphore row/.test(none.stamp || '')) wrong.push('no row: the stamp said "' + none.stamp + '"');
  if (!fresh.asksLogin) wrong.push('never logged in: the login sheet did not open');

  console.log('pocket: ' + arenas + ' arenas; drawn ' + JSON.stringify(full.views));
  if (shot) console.log('screenshots in ' + shot);
  if (wrong.length) { console.log('NOT OK\n  ' + wrong.join('\n  ')); process.exit(1); }
  console.log('ok — every tab drew, the empty cloud and the first login both said so.');
})();
