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

See also [partner-watch](partner-watch.md) for how Mark's Place uses it.
