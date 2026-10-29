The Topic Atlas was Mark's own page for ranking the Horizon Europe topics
for a researcher's keywords, built outside this repository (its build
scripts are not here) and brought in on 2026-10-21 as `topic-atlas/`.
Since 2026-10-29 its search is the Call Board's Atlas switch, and what is
left in `topic-atlas/` is its four files.

- He moved it into the repository so that Mark's Place could search with
  the same concept libraries without a second copy that drifts:
  `topic-atlas/library.js`, which Mark's Place reads
- **One backbone** (2026-10-29), in Mark's words a clean and smooth one:
  the Call Board's Atlas switch ranks with the Topic Atlas's four files,
  `topics.js` (the page's `ta-data` line until then), `textutil.js` and
  `scorer.js` (inside the page until then) and `library.js`, fetched once
  the Board is built. `topics.js` is the only copy of the topics' texts:
  the Board's own (`data/callboard-descriptions.js`) went, since some of
  its topics carried another topic's text, which the build had set aside
  from the portal, and the Board's reader shows these. Then the page
  itself was retired, its address sending a bookmark to the Board with
  Atlas on: the switch did the same search with current dates and the
  arenas' calls besides, and two places doing one job was not clean.
  Left out with it, as Mark chose for the switch: its Browse view, its
  tuning, the arithmetic, Export CSV and its introduction. A rebuild
  writes the four files here
- He wants it, and the search Mark's Place takes from it, to stay a plain
  program: no Claude reading the texts, at build or in use. Its semantics
  are the libraries' names and links, applied mechanically
- Everything in it is public: the work programme's topics, the Portal's
  updates on them, and the libraries (the methods one is the Atlas's own,
  already in `one-app/data/atlas-graph.js`)
- **Which topic names which concept is fixed in the page, not worked out
  in use.** Each topic in `topics.js` carries its concept hits, as
  the build found them. A name added to `library.js` lets a keyword find
  that concept at once (and Mark's Place reads its entries with it live),
  but no topic lands on it until the hits for that name are added to
  `topics.js` too, and the concept's count in `stats.df` with them. With no
  build here, that is done by matching the new names only — longest name
  at a word wins, the three spellings Mark's Place uses — and adding just
  the hits that are new. Matched that way, every concept's names give back
  99% of the build's own hits; recomputing all of them would still move
  the remaining 1%, so existing hits are never recomputed. The Call Board
  reads an arena's call text, which the build never saw, the same way
- **The researchers' words and the work programme's barely overlap at the
  theory end** (measured 2026-10-28 against all 152 researchers' own
  keywords: 125 of 657 reached no topic before, 66 after). The work
  programme never says model checking, combinatorics, topology, optimal
  transport or stochastic process. What helps is a related link from such
  a concept to the applied concept its own researchers also work on and
  the work programme does name (model checking to software verification,
  information theory to cryptography), each link saying why it holds.
  Mark's condition: no link to a concept most topics name (AI, data
  sharing, participation), and none that only adds noise — topology to
  machine learning was tried and dropped for that. What is still left at
  nothing has no honest landing

See also [partner-watch](partner-watch.md) for how Mark's Place uses it.
