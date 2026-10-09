/* smoke.js — open a copy of the app from disk and ask each room whether it
   started. Run: node tools/smoke.js <path-to-html> [outdir] */
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const target = path.resolve(process.argv[2]);
  const shot = process.argv[3] || null;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => errs.push('PAGEERROR ' + String(e).slice(0, 300)));

  await page.goto('file://' + target, { waitUntil: 'load' });
  await page.waitForTimeout(1500);

  const rooms = ['ledger', 'semaphore', 'callboard', 'atlas', 'notes'];
  const report = { file: path.basename(target), rooms: {}, errors: [] };

  for (const r of rooms) {
    await page.evaluate(id => window.Hub && window.Hub.go(id), r);
    await page.waitForTimeout(700);
    report.rooms[r] = await page.evaluate(id => ({
      registered: !!(window.Hub && window.Hub.pane(id)),
      started:    !!(window.Hub && window.Hub.started(id)),
      failure:    window.Hub ? window.Hub.failure(id) : 'no Hub',
      nodes:      (document.getElementById('pane-' + id) || {}).childElementCount || 0,
      text:       ((document.getElementById('pane-' + id) || {}).innerText || '').replace(/\s+/g, ' ').trim().length
    }), r);
    if (shot) await page.screenshot({ path: path.join(shot, r + '.png') });
  }
  report.errors = [...new Set(errs)];
  console.log(JSON.stringify(report, null, 1));
  await browser.close();
})();
