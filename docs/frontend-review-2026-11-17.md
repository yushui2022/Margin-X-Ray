# Frontend review · 2026-11-17

Scope: creator directory, lookup, filters, row readability and voting presentation.
Method: `frontend-self-review.md`; five fixed dimensions with the same weights in
every round. These are agent design judgments for the evaluated tasks, not an
independent audit or a user-research result. Evidence scores were not revised.

| Dimension | Weight | Before | First pass | Final |
| --- | ---: | ---: | ---: | ---: |
| Task access & hierarchy | 25% | 7.0 | 8.2 | 9.0 |
| Brand & visual composition | 20% | 8.5 | 9.0 | 9.0 |
| Readability & density | 15% | 8.0 | 8.6 | 9.0 |
| Interaction & feedback | 20% | 9.0 | 9.0 | 9.0 |
| Responsive behavior & accessibility | 20% | 7.5 | 8.5 | 9.0 |
| Weighted overall | 100% | 8.0 | 8.6 | 9.0 |

## Findings and iterations

Before: at 375px, the directory search began around 1226px down the page and the
first creator around 1463px. A large lookup card and sample-report link preceded
the searchable directory. Filter controls occupied several rows; “Score fair?”
repeated beside every desktop vote pair. Follower metadata used small monospace
text. The warm identity and voting behavior already worked well.

First pass: combined the desktop title and statistics into a masthead; condensed
mobile statistics into four columns; put the mobile handle lookup and preview in
a keyboard-accessible disclosure. Added one explanation of the voting arrows and
removed the repeated desktop prompts. Improved follower text and full-row focus
and hover treatment. The first mobile row moved to about 1001px, still too low.

Second pass and verification fixes: put research filters in a disclosure with an
active-filter count. Shortened the directory title and sort labels, arranged the
mobile heading and sort together, and reduced repetitive result-count text.
Restored focus to the selected category after filtering. Checked both collapsed
and expanded layouts and response to crossing the mobile breakpoint.

## Measured result

Final positions are document coordinates after fonts load, with scroll restored
to the top. Earlier comparison figures were recorded before the edits; all are
approximate CSS pixels at the same 1000px viewport height.

| Width | Search position | First creator position | Horizontal overflow |
| ---: | ---: | ---: | --- |
| 320 | 785 | 1046 | None |
| 375 | 648 | 871 | None |
| 768 | 502 | 725 | None |
| 1024 | 514 | 737 | None |
| 1440 | 514 | 737 | None |

At 375px the first result is about 592px earlier, and directory search about
578px earlier. Desktop composition and readability improved with a smaller
position change (first row approximately 755px → 737px). The 320px layout still
requires more scrolling because headings and controls stack; it remains usable.

## Validation

- Type checking, build and diff whitespace checks passed.
- Actual Chromium interactions: mobile lookup via keyboard and report submission;
  responsive disclosure state; research filters, active count, combined empty
  state/reset, name/handle search, category keyboard focus, example mode, sorting
  and pagination.
- Isolated SQLite/browser test: directory/report vote synchronization, up/down,
  switching and withdrawal, persistence across reload, search and pagination,
  anonymous-session initialization, two-browser totals and failed-request retry.
- 320/375/768/1024/1440 layouts, including expanded controls; voting targets at
  least 44px; no browser page errors. No test votes submitted to the real database.
- Compared before/after desktop and mobile screenshots. Local capture names:
  `self-review-before-{375,1440}.png`, `self-review-round1-*.png`,
  `self-review-round2-*.png`, `self-review-final-{375,768,1440}.png`.

Limits: no independent usability study, Safari/Firefox verification or full
screen-reader audit. This iteration does not resolve existing bundle size, live
creator retrieval or authenticated voting. The 9.0 is scoped to the reviewed
presentation and interactions, not a universal product-quality certification.
