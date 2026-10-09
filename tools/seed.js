/* seed.js — put a scratch dataset into a throwaway copy of the app, so that
   there is something on screen to look at.

   The app keeps everything in localStorage and nothing on disk, which means
   a fresh browser opens an empty ledger and an empty board. That is fine
   for the person using it and useless for anyone trying to see whether a
   change looks right: an empty horizon has no lanes, no markers, no effort
   strip and no legend, so most of the room cannot be photographed at all.
   This writes a plausible few weeks of work into a browser that has none.

       node tools/seed.js one-app/index.html               screenshots into a temp folder
       node tools/seed.js one-app/index.html out/          ... into out/ instead
       node tools/seed.js one-app/index.html out/ 430x820  ... at phone width

   The screenshots go somewhere outside this tree unless you name a folder,
   because this folder is the live app and nothing that is not the app
   belongs in it. The path is printed at the end of every run.

   and, from any other script that already has a Playwright page open:

       const seed = require('./tools/seed.js');
       await seed.all(page);          // every room that holds data, then a reload
       await seed.ledger(page);       // just the journal

   ══ THE ONE HAZARD ══════════════════════════════════════════════════
   localStorage is keyed by `file://` as a whole — that is what lets the
   app find its data at any local path, and it also means every copy of
   this app on a machine shares one journal. So a seed that ran in YOUR
   Chrome would not create a sandbox; it would overwrite the real ledger
   and the real board.

   Two things stop that. This file drives its own headless Chromium with a
   throwaway profile that shares nothing with an installed browser, and
   `all()` refuses to write into any browser already holding a journal. Do
   not defeat either. Do not open it, or anything it writes, in your own
   browser. Everything it makes lives in the temporary profile and dies
   with the process.
   ═══════════════════════════════════════════════════════════════════ */

const path = require('path');
const fs = require('fs');
const os = require('os');

/* ── Dates ──
   Every date is relative to the day the seed runs, because the horizon
   only ever draws from this Monday forward and a fixed date would sail
   off the window within a week of being written. */
function iso(offset) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + (offset || 0));
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

const stamp = () => new Date().toISOString();

/* ── The scratch journal ──
   Chosen so that every part of the board has something to draw rather
   than to look like a real week: one day that is comfortably full, one
   that is over-committed and therefore amber, a couple of overdue todos
   so the beam grows its overdue button, todos with no planned date so the
   effort strip's Unplanned chip appears, two checklists for the cue, and
   two deadlines far enough from their planned dates to draw a runway.

   Categories are spread across the nine so that a day's summary line has
   more than one kind of work to split, and one todo is left without one
   on purpose, so the untagged remainder that line names has something to
   name. */
function journal() {
  const call = (id, name, title, color, order, marks) => ({
    id, name, title, color, solo: false, links: [], markers: marks,
    rows: [], order, created: stamp()
  });
  const mark = (id, name, at, endAt) => ({
    id, name, date: iso(at), endDate: endAt == null ? '' : iso(endAt),
    color: '', hard: true
  });
  const chk = (id, text, done, focus) => ({
    id, text, done: !!done, doneAt: done ? iso(-1) : null,
    focus: !!focus, log: []
  });
  const todo = (id, text, o) => {
    o = o || {};
    return {
      id, text, done: false, doneAt: null,
      dueDate: o.due == null ? '' : iso(o.due),
      deadline: o.dl == null ? '' : iso(o.dl),
      effort: o.effort || 0,
      category: o.cat || '',
      subStamps: o.notes || [], checklist: o.chk || [],
      created: stamp(), edited: stamp()
    };
  };

  const calls = [
    call('c-itea', 'ITEA', 'ITEA Call 2026 — AI for Industry', '#c9a84c', 0,
      [mark('m-itea-1', 'Project outline', 6), mark('m-itea-2', 'Full proposal', 41)]),
    call('c-chips', 'Chips JU', 'Chips Joint Undertaking 2026', '#7fb0d8', 1,
      [mark('m-chips-1', 'Call opens', 13), mark('m-chips-2', 'Deadline', 58)]),
    call('c-heu', 'Horizon EU', 'Horizon Europe — Cluster 4', '#c07fa8', 2,
      [mark('m-heu-1', 'Info day', 2), mark('m-heu-2', 'Stage 1 deadline', 27)]),
    call('c-nwo', 'NWO', 'NWO Open Technology Programme', '#7fc0a0', 3,
      [mark('m-nwo-1', 'Intention to submit', 19, 23)])
  ];

  const projects = [
    { id: 'p-itea-1', callId: 'c-itea', name: 'Predictive Maintenance', order: 0, todos: [
        todo('t1', 'Draft the impact section and circulate it', { cat: 'writing', due: 0, effort: 45,
          chk: [chk('k1', 'Pull last year’s figures', 1), chk('k2', 'Write the two paragraphs', 0, 1)] }),
        todo('t2', 'Confirm the consortium letter with TNO', { cat: 'consortium', due: 1, effort: 480 }),
        todo('t3', 'Rewrite the work package table', { cat: 'writing', due: 2, effort: 240, dl: 6 }),
        todo('t4', 'Chase the budget sign-off', { cat: 'budget', due: -2, effort: 30 }),
        todo('t5', 'Read the evaluation criteria properly', { cat: 'reading', effort: 60 })
      ] },
    { id: 'p-itea-2', callId: 'c-itea', name: 'Edge Analytics', order: 1, todos: [
        todo('t6', 'Ask Marloes whether she is joining', { cat: 'consortium', due: 2, effort: 20 }),
        todo('t7', 'Sketch the demonstrator', { cat: 'planning', due: 9, effort: 180 })
      ] },
    { id: 'p-chips-1', callId: 'c-chips', name: 'Photonic Interconnect', order: 2, todos: [
        todo('t8', 'Map the partner list against the topic', { cat: 'consortium', due: 2, effort: 120 }),
        todo('t9', 'Book the kick-off room', { cat: 'admin', due: 3, effort: 10 }),
        todo('t10', 'Second draft of the excellence section', { cat: 'writing', due: 8, effort: 240, dl: 13,
          chk: [chk('k3', 'Objectives', 1), chk('k4', 'Methodology', 1), chk('k5', 'Beyond state of the art', 0)] }),
        todo('t11', 'Find the 2024 evaluation summary', { cat: 'reading', effort: 20 })
      ] },
    { id: 'p-chips-2', callId: 'c-chips', name: 'Thermal Modelling', order: 3, todos: [
        todo('t12', 'Reply to the coordinator', { cat: 'consortium', due: 1, effort: 20 }),
        todo('t13', 'Check the TRL claim', { cat: 'projdev', due: 10, effort: 90 })
      ] },
    { id: 'p-heu-1', callId: 'c-heu', name: 'Trustworthy Autonomy', order: 4, todos: [
        todo('t14', 'Prepare three slides for the info day', { cat: 'meeting', due: 2, effort: 180 }),
        todo('t15', 'Summarise the topic text for the group', { cat: 'reading', due: 4, effort: 60 }),
        todo('t16', 'Decide stage 1 or stage 2', { cat: 'planning', due: 15, effort: 45 })
      ] },
    { id: 'p-heu-2', callId: 'c-heu', name: 'Human-Centred AI', order: 5, todos: [
        todo('t17', 'Ask about the ethics annex', { cat: 'projdev', due: -4, effort: 30 }),
        todo('t18', 'Draft the dissemination plan', { cat: 'writing', due: 11, effort: 240 })
      ] },
    { id: 'p-nwo-1', callId: 'c-nwo', name: 'Formal Methods at Scale', order: 6, todos: [
        todo('t19', 'Write the one-page intention', { cat: 'writing', due: 5, effort: 120 }),
        todo('t20', 'Line up the two referees', { cat: 'consortium', due: 16, effort: 30 })
      ] },
    { id: 'p-nwo-2', callId: 'c-nwo', name: 'Verified Compilers', order: 7, todos: [
        todo('t21', 'Read the call conditions', { cat: 'reading', due: 3, effort: 45 }),
        todo('t22', 'Ask the department about matching funds', { cat: 'budget', due: 17, effort: 60 })
      ] }
  ];

  /* The permanent General bucket already exists; these join it rather than
     replacing it, so the seed does not have to know its id. */
  const loose = [
    todo('t23', 'Renew the library access', { cat: 'admin', due: 4, effort: 10 }),
    todo('t24', 'Tidy the shared drive', { effort: 90 })
  ];

  return { calls, projects, loose };
}

/* ── The guard ──
   The check that matters, and it cannot simply ask whether the storage
   keys exist: the Ledger writes its journal during boot, because creating
   the permanent General bucket is itself a save. So every browser that has
   ever opened the app holds a `pj-journal-v3`, including a brand new one.

   What it asks instead is whether there is any WORK in there — a call, a
   project that is not the inbox, a todo, a notebook, or a board. A browser
   with none of those has nothing to lose. A browser with one of them is
   somebody's ledger and this stops dead. */
async function assertBlank(page) {
  const held = await page.evaluate(() => {
    const found = [];
    const read = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); }
                        catch (e) { return '?'; } };
    const j = read('pj-journal-v3');
    if (j === '?') found.push('an unreadable pj-journal-v3');
    else if (j) {
      const projects = j.projects || {}, calls = j.calls || {};
      const named = Object.keys(projects).filter(k => projects[k] && projects[k].callId);
      const todos = Object.keys(projects)
        .reduce((n, k) => n + (((projects[k] || {}).todos) || []).length, 0);
      /* The Horizon programme is made by the app on its very first load
         and is there in an untouched browser too, so it is not work
         somebody has done and does not count against blankness. */
      const written = Object.keys(calls).filter(k => k !== '__horizon__');
      if (written.length) found.push(written.length + ' call(s)');
      if (named.length) found.push(named.length + ' project(s)');
      if (todos) found.push(todos + ' todo(s)');
      if ((j.books || []).length) found.push((j.books || []).length + ' notebook(s)');
    }
    if (localStorage.getItem('pj-projects-v1')) found.push('a legacy v1 ledger');
    const nt = read('notes.v1');
    if (nt === '?') found.push('an unreadable notes.v1');
    else if (nt && (nt.notes || []).length) found.push((nt.notes || []).length + ' note(s)');
    const s = read('semaphore.v1');
    if (s && (s.arenas || []).length) found.push((s.arenas || []).length + ' arena(s)');
    return found;
  });
  if (held.length) throw new Error(
    'refusing to seed: this browser already holds ' + held.join(', ') +
    '. seed.js is only ever for an empty throwaway profile — never a ' +
    'browser that has the real journal in it.');
}

/* ── The Ledger ──
   Written through Hub.api rather than into localStorage, so the app's own
   writer decides the storage shape and this file never has to know it. */
async function ledger(page) {
  const n = await page.evaluate(data => {
    const api = window.Hub && window.Hub.api('ledger');
    if (!api) throw new Error('the ledger has not started');
    const projects = api.projects(), calls = api.calls();
    const now = new Date().toISOString();

    data.calls.forEach(c => { calls[c.id] = c; });
    data.projects.forEach(p => {
      projects[p.id] = {
        id: p.id, callId: p.callId, name: p.name, desc: '',
        industrial: false, coordinator: '', partners: [], positions: [],
        links: [], rows: [], todos: p.todos, tracker: null,
        order: p.order, archived: false, created: now
      };
    });
    /* Whatever the inbox is called this week, it is the one project with
       no call — ask the app for it instead of naming it. */
    const inbox = Object.keys(projects).map(k => projects[k])
      .filter(p => !p.callId)[0];
    if (inbox) inbox.todos = (inbox.todos || []).concat(data.loose);

    api.save();
    return Object.keys(projects).length;
  }, journal());
  return n;
}

/* ── The Notes room ──
   Enough notes, tagged unevenly enough, that the shelf has something to
   compute: five or six tags earn a book, a couple more earn pages inside
   them, and `EU` sits on nearly every note so the footnote that explains
   why it earns nothing has something to say.

   Titles are the register the room is for — general memory in three
   words, not project bookkeeping.

   Unlike the two rooms above, this one is written straight to its key
   rather than through Hub.api: the room exposes no writer, having never
   needed one, and inventing an API only a seed would call would be worse
   than knowing one documented shape. The reload at the end of all() is
   what proves the room's own reader accepts what was written. */
function notebook() {
  const now = Date.now(), day = 864e5;
  /* [title, tags, body] — EU is left off four of them on purpose, so the
     near-universal tag is near-universal and not actually universal */
  const rows = [
    ['Lump sum maths',      ['EU', 'Horizon Europe', 'finance'],            'Travel sits in the unit costs, not on top of them.'],
    ['Lump sum trap',       ['EU', 'Horizon Europe', 'finance', 'insight'], 'The audit risk moves onto the reporting narrative.'],
    ['Overhead rule',       ['EU', 'finance'],                              'Calculated on direct costs minus subcontracting.'],
    ['Person-month drift',  ['EU', 'finance', 'process'],                   'The portal rounds them oddly; check the table by hand.'],
    ['Co-funding gap',      ['EU', 'finance', 'Chips JU'],                  'Three ways to close it, none of them quick.'],
    ['Matching funds',      ['EU', 'finance', 'TU/e'],                      'Ask the department before promising anything.'],
    ['Budget basics',       ['EU', 'finance', 'writing'],                   'The budget follows the story, never the reverse.'],
    ['Audit habits',        ['EU', 'finance', 'process'],                   'Keep the narrative and the numbers in one folder.'],
    ['Portal quirks',       ['EU', 'process'],                              'The portal and the template disagree; the portal wins.'],
    ['Submission steps',    ['EU', 'process', 'Horizon Europe'],            'The deadline that matters is internal, three weeks earlier.'],
    ['Two-stage timing',    ['EU', 'process', 'Horizon Europe', 'insight'], 'Nine months between stages. Plan for the drift.'],
    ['Amendment rules',     ['EU', 'process'],                              'Easier before the consortium agreement is signed.'],
    ['Reporting quirks',    ['EU', 'process', 'finance'],                   'Periodic reports want the story, not the spreadsheet.'],
    ['Time-writing basics', ['EU', 'process', 'TU/e'],                      'Monthly, not at the end. Nobody remembers March in October.'],
    ['Ethics rubric',       ['EU', 'writing', 'process'],                   'The self-assessment is longer than it looks.'],
    ['Data plan folklore',  ['EU', 'writing'],                              'A DMP nobody reads is still a DMP that must exist.'],
    ['Impact section',      ['EU', 'writing', 'Horizon Europe'],            'Half the reviewers read only this. Front-load it.'],
    ['Excellence section',  ['EU', 'writing', 'Horizon Europe'],            'Objectives first, then how, then why it is beyond the art.'],
    ['Risk table',          ['EU', 'writing'],                              'Keep it under a page or it reads as a risk in itself.'],
    ['Gantt assumptions',   ['EU', 'writing', 'process'],                   'Written down nowhere, argued about every time.'],
    ['Work package shape',  ['EU', 'writing', 'Chips JU'],                  'Six is plenty. Nine is a management section.'],
    ['Reviewer folklore',   ['EU', 'evaluation', 'insight'],                'They liked the ambition and not the management structure.'],
    ['Rebuttal habits',     ['EU', 'evaluation', 'writing'],                'Answer the panel, not the sentence.'],
    ['Resubmission rule',   ['EU', 'evaluation', 'insight'],                'Change something real or the same panel says the same thing.'],
    ['Seal of Excellence',  ['EU', 'evaluation', 'calls'],                  'Worth having, rarely worth planning around.'],
    ['Evaluation steps',    ['EU', 'evaluation', 'process'],                'Thresholds first, then the ranked list, then the budget line.'],
    ['Info day habits',     ['EU', 'calls', 'insight'],                     'They post the recording about two weeks late.'],
    ['Call text reading',   ['EU', 'calls', 'writing'],                     'The scope paragraph is the one that decides eligibility.'],
    ['Cluster 4 notes',     ['EU', 'calls', 'Horizon Europe'],              'Digital and industry; the topics move year to year.'],
    ['Chips JU basics',     ['EU', 'calls', 'Chips JU'],                    'Two funding routes and they are not interchangeable.'],
    ['Chips JU timing',     ['EU', 'Chips JU', 'process'],                  'The national part runs on its own clock.'],
    ['ITEA shape',          ['EU', 'ITEA', 'calls'],                        'Bottom-up, industry-led, and the labelling step is real.'],
    ['ITEA partners',       ['EU', 'ITEA', 'consortium'],                   'The national funding decides who can actually join.'],
    ['ITEA timing',         ['EU', 'ITEA', 'process'],                      'PO in autumn, FPP in spring, labelling after.'],
    ['LOI etiquette',       ['consortium', 'process'],                      'Ask early, chase twice, never assume.'],
    ['Coordinator load',    ['consortium', 'insight'],                      'Coordinating costs about a day a week. Budget for it.'],
    ['Advisory boards',     ['consortium', 'idea'],                         'Three names, one of them outside the usual circle.'],
    ['Kickoff logistics',   ['process', 'meeting'],                         'Rooms, badges, dinner. Book the dinner first.']
  ];
  return {
    v: 1, shelf: [], mode: 'all',
    notes: rows.map((r, i) => ({
      id: 'seed-nt-' + i,
      title: r[0],
      body: '<p>' + r[2] + '</p>',
      tags: r[1],
      refs: [],
      created: now - (rows.length - i) * 3 * day,
      edited: now - (rows.length - i) * day
    }))
  };
}

async function notes(page) {
  return page.evaluate(data => {
    localStorage.setItem('notes.v1', JSON.stringify(data));
    localStorage.setItem('notes.v1-ts', String(Date.now()));
    return data.notes.length;
  }, notebook());
}

/* ── The Semaphore ──
   The room already carries an example set behind its own button, and a
   hand-written board here would be a second one to keep in step with it.
   Press theirs, then repeat the arenas until the board is long enough to
   scroll, which is the only way to photograph a sticky header. */
async function semaphore(page, copies) {
  await page.evaluate(() => window.Hub.go('semaphore'));
  await page.waitForTimeout(500);
  const pressed = await page.evaluate(() => {
    const b = document.querySelector('#pane-semaphore [data-act="seed"]');
    if (!b) return false;
    b.click();
    return true;
  });
  if (!pressed) return 0;
  await page.waitForTimeout(700);
  return page.evaluate(k => {
    const api = window.Hub.api('semaphore'), S = api.state();
    const base = S.arenas.slice();
    for (let i = 0; i < k; i++) for (const a of base) {
      const c = JSON.parse(JSON.stringify(a));
      c.id = 'seed' + i + '_' + a.id;
      c.name = a.name + ' ' + (i + 2);
      S.arenas.push(c);
    }
    api.save(); api.renderAll();
    return S.arenas.length;
  }, copies == null ? 3 : copies);
}

/* Both rooms, then a reload — so what ends up on screen has been through
   the app's own reader and not merely through its writer. A seed that only
   ever renders the objects it just handed over cannot tell you that they
   would survive being saved. */
async function all(page, opts) {
  opts = opts || {};
  if (!opts.force) await assertBlank(page);
  const arenas = await semaphore(page, opts.copies);
  await page.evaluate(() => window.Hub.go('ledger'));
  await page.waitForTimeout(400);
  const projects = await ledger(page);
  const noteCount = await notes(page);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1400);
  return { projects, arenas, notes: noteCount };
}

module.exports = { all, ledger, semaphore, notes, assertBlank, journal, notebook, iso };

/* ── Run on its own: seed a copy of the app and photograph it ── */
if (require.main === module) (async () => {
  const { chromium } = require('playwright');
  const target = path.resolve(process.argv[2] || 'one-app/index.html');
  const outDir = path.resolve(process.argv[3] ||
    path.join(os.tmpdir(), 'one-app-shots'));
  const size = /^(\d+)x(\d+)$/.exec(process.argv[4] || '1440x900');
  if (!size) { console.error('viewport must be WIDTHxHEIGHT, e.g. 1440x900'); process.exit(1); }
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: +size[1], height: +size[2] } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + String(e).slice(0, 300)));
  page.on('console', m => {
    /* the font and Supabase CDNs are unreachable offline and say so on
       every run; they are not this app's errors */
    if (m.type() === 'error' && !/ERR_(TUNNEL|NAME|INTERNET)|Failed to load resource/.test(m.text()))
      errs.push(m.text().slice(0, 200));
  });

  await page.goto('file://' + target, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const counts = await all(page);

  const shot = async (name, pid, before) => {
    await page.evaluate(id => window.Hub.go(id), pid);
    await page.waitForTimeout(700);
    if (before) { await page.evaluate(before); await page.waitForTimeout(700); }
    await page.screenshot({ path: path.join(outDir, name + '.png') });
  };
  await shot('ledger-horizon', 'ledger');
  await shot('ledger-timeline', 'ledger', () => window.Hub.api('ledger').PL.flip());
  await page.evaluate(() => window.Hub.api('ledger').PL.home());
  await shot('semaphore-board', 'semaphore');
  await shot('semaphore-scrolled', 'semaphore',
    () => { document.querySelector('#pane-semaphore #semscroll').scrollTop = 650; });
  await shot('callboard', 'callboard');
  await shot('atlas', 'atlas');
  await shot('notes', 'notes');
  await shot('notes-book', 'notes', () => {
    var b = document.querySelector('#pane-notes #nt-books .nt-b');
    if (b) b.click();
  });

  console.log(JSON.stringify({
    seeded: counts,
    viewport: size[1] + 'x' + size[2],
    into: outDir,
    shots: fs.readdirSync(outDir).filter(f => f.endsWith('.png')).sort(),
    errors: [...new Set(errs)]
  }, null, 1));
  await browser.close();
})();
