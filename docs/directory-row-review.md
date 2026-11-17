# Directory row refinement

Historical layout review. The subsequent confidence-ranking change replaces
vote-derived onions and directory evidence numbers; see `confidence-ranking-review.md`.

Review scope: the crowded evidence/index/voting area identified by the user.
Uses the fixed rubric in `frontend-self-review.md`. These are subjective design
judgments for this task, not independent certification. The previous feature
review was too generous about the directory's density; the user's feedback and
fresh screenshots exposed a cramped stack beside an oversized evidence number.

| Dimension | Before | First revision | Final |
| --- | ---: | ---: | ---: |
| Task access & hierarchy | 8.0 | 9.0 | 9.0 |
| Brand & visual composition | 7.5 | 8.5 | 9.0 |
| Readability & information density | 7.5 | 8.0 | 9.0 |
| Interaction & feedback | 9.0 | 9.0 | 9.0 |
| Responsive behavior & accessibility | 8.5 | 8.0 | 9.0 |

Before: narrow feedback column stacked the onion, index, votes and agreement
percentage. Evidence and onion values had different visual weight. Repeated
agreement text introduced a third number to interpret. Desktop rows measured
155.3px for the first creator at a 1440px viewport.

First revision: evidence, illustrated index and voting became aligned columns.
The onion grew from 42 to 48px wide, both metrics use 26px numbers, and voting uses
one pill with a purple selected state. Mobile separates identity/evidence from
community feedback with a quiet dashed rule. A container query switches based on
actual board width. Inspection found excessive mobile height from a wrapping
denominator, a missing font variable and surplus control padding.

Final refinement fixed those issues, tightened line heights and shortened repeated
research-status copy. Priced product counts and unverified lead states remain
visible; reports retain full research conditions. Compact feedback shows total
votes or “Vote saved”, with live loading/saving/error messages. The full report
still includes its agreement percentage and vote explanation.

At 1440px, the first row measures 124.9px (about 20% shorter). At 375px it measures
213.9px versus 215.3px before: mobile improvement is grouping and legibility,
not a meaningful density gain. Comparable viewport screenshots were inspected:
`row-before-1440.png`, `row-before-375.png`, `row-final-1440.png`, and
`row-final-375.png` in the session artifact directory. Long handles wrap.

Validation: typecheck, build, diff check and all 63 unit/API tests passed. Existing
isolated-database browser checks passed for all five bands plus neutral, early
signals, score isolation, switching and withdrawing votes, refresh persistence,
directory/report synchronization, keyboard activation, search, pagination,
two-browser counts and failure/retry. Voting targets remain at least 44×44px and
there is no horizontal overflow at 320/375/768/1024/1440. Final spacing changes were
followed by another build and directory browser regression. Real-database browser
visits were read-only; test votes used temporary databases.

Testing used Chromium. No independent usability study or cross-browser assessment
was performed. The existing large web bundle was outside this layout refinement.
