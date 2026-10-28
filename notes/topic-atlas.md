The Topic Atlas is Mark's own page for ranking the Horizon Europe topics
for a researcher's keywords, built outside this repository (its build
scripts are not here) and brought in on 2026-10-21 as `topic-atlas/`.

- He moved it into the repository so that Mark's Place could search with
  the same concept libraries without a second copy that drifts: the two
  libraries are `topic-atlas/library.js`, read by both pages. A rebuilt
  Topic Atlas must write them there and leave them out of its page's
  `ta-data` line, or the pages part ways again
- He wants it, and the search Mark's Place takes from it, to stay a plain
  program: no Claude reading the texts, at build or in use. Its semantics
  are the libraries' names and links, applied mechanically
- Everything in it is public: the work programme's topics, the Portal's
  updates on them, and the libraries (the methods one is the Atlas's own,
  already in `one-app/data/atlas-graph.js`)
- **Which topic names which concept is fixed in the page, not worked out
  in use.** Each topic in the `ta-data` line carries its concept hits, as
  the build found them. A name added to `library.js` lets a keyword find
  that concept at once (and Mark's Place reads its entries with it live),
  but no topic lands on it until the hits for that name are added to
  `ta-data` too, and the concept's count in `stats.df` with them. With no
  build here, that is done by matching the new names only — longest name
  at a word wins, the three spellings Mark's Place uses — and adding just
  the hits that are new. Matched that way, every concept's names give back
  99% of the build's own hits; recomputing all of them would still move
  the remaining 1%, so existing hits are never recomputed
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
