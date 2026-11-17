# Evidence confidence ranking

The user clarified that the onion should follow evidence confidence and the
leaderboard, not agreement votes, and selected an evidence-confidence leaderboard
over a verified-risk leaderboard. `confidence-v1` replaces the old vote-share
index. The index is `100 − confidence`; the default leaderboard is confidence
descending. Rank is an output of the score, never another input. Equal scores
share global competition rank, including the current tie at rank 9. Filters and
other display sorts do not rewrite those ranks.

The versioned methodology assigns 40 points to source reliability, 40 to report
completeness and 20 to reviewed cross-checks. All 21 accepted product records have
explicit source assessments, linked to existing source IDs and preserving access
limitations and unresolved offer conflicts. Assessments used retained excerpts;
no new live source retrieval or video review is claimed. Direct primary, indexed
primary and secondary retrieval receive editorial factors of 1, 0.6 and 0.3.
The weaker relationship/listing provenance counts for each product. Partial
product-line agreement earns 0.5 cross-check credit only with a directly retrieved
creator caption and a separate brand listing; exact independent offer matching
would earn 1, but no current record qualifies. Same-publisher repetition earns 0.

The existing `evidence-v3` coverage score contributes 40% of its total to confidence;
its ten checks, sources and financial gaps remain available. This new score is an
editorial assessment, not a calibrated probability or creator honesty rating.
Weights, provenance judgments and the one-product eligibility minimum are explicit
methodological choices. Changing them requires a versioned methodology update.

Eligibility requires an account-matched usable sample, an accepted priced product
and assessments for every accepted product. Twelve profiles qualify; 488 remain
pending, with a neutral onion and no numeric confidence/index/rank. Incomplete
reviews do not silently receive zero. Report headers now show confidence; original
coverage is visible beneath the headline and in the ten-check breakdown.

NikkieTutorials: 34.7 source + 24.9 completeness + 3.3 cross-check = 62.9 confidence;
index 37.1, rank 1. Mikayla: 57.7 confidence, index 42.3, rank 2. Lady Gaga moves
to rank 5 at 47.3 because her direct caption has a reviewed product-line match.
Follower totals, arbitrary rank percentiles and vote activity earn no points.

Feedback retains its original `evidence-v3` scope and database. Compact controls
say “Coverage vote”; report copy explains the subject and independence of voting.
Static indicators render before any feedback response, and failed requests only
affect voting controls. Existing feedback has not been reinterpreted as votes on
the new confidence formula.

## Design review

Applied the fixed rubric from `frontend-self-review.md`. The earlier screenshots
(`row-final-1440.png` and `row-final-375.png`) provide the baseline layout. The old
vote-driven semantics fail the newly clarified task regardless of visual polish.
Initial implementation retained the prior primary Evidence Score in the report
header and ambiguous “Your take” vote copy. Final refinement promotes confidence
in the report/preview, retains an explicit coverage subtotal, and labels votes by
their original subject.

| Dimension | Initial implementation | Final |
| --- | ---: | ---: |
| Task access & hierarchy | 8.0 | 9.0 |
| Brand & visual composition | 9.0 | 9.0 |
| Readability & information density | 8.5 | 9.0 |
| Interaction & feedback | 8.5 | 9.0 |
| Responsive behavior & accessibility | 9.0 | 9.0 |

These are subjective design judgments for the checked views, not independent
certification. Desktop/mobile board and report screenshots were inspected as
`confidence-board-1440.png`, `confidence-board-375.png`,
`confidence-report-desktop.png` and `confidence-report-mobile.png` in the session
artifact directory. Warm surfaces, the purple onions and compact voting remain.

## Validation

Typecheck, build, diff check and 67 unit/API tests passed. New tests cover component
rounding and reconciliation, source weakest-link behavior, deduplication, missing
research eligibility, all 21 assessments, exact onion boundaries, invalid inputs,
global competition ranks, stable ties and pending-last sorting in both directions.

Chromium interaction checks used a temporary SQLite database. Voting up, switching
down, withdrawing and reloading left confidence, onion and row order unchanged.
A pending profile remained neutral after a down vote. Persisted feedback, keyboard
activation, report/row values, source links, global ranks under search, pagination,
both confidence sorts, failure isolation and retry all passed. Report and directory
layouts, expanded scale and source disclosure were checked at 320/375/768/1024/1440;
there was no horizontal overflow and voting targets remained at least 44×44px.
The final copy refinement was followed by another complete check.

No test votes were written to the real database. Testing was in Chromium; no
independent statistical calibration, user study or cross-browser certification
is claimed. More source collection is needed to rate the other 488 profiles.
