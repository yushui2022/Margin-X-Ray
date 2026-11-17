# Product problem ranking: higher is worse

The user clarified the intended meaning: the top KOLs should be those whose
products repeatedly have documented problems. A confidence score, inverse
confidence, missing evidence or disagreement votes cannot measure that construct.
The public Onion Score now uses `product-issues-v1` and sorts descending. One
score remains visible per row and report. Higher values select increasingly
rotten icons: Fresh [0,20), Spotted [20,40), Bruised [40,60), Spoiled [60,80),
Rotten [80,100]. Pending research has no number, band judgment or global rank.

## Evidence audit and material limit

Reviewed the existing product source excerpts, access limitations, confidence
assessments, coverage rules and local research for problem records. The accepted
records document public captions, creator/brand relationships, reference prices
and unresolved listing conflicts. There is no completed comparable product-issue
sample with verified findings and a denominator. This audit did not conduct new
web investigations or conclude that any creator has no problematic products.

Consequently, `creator-issue-reviews.json` contains no accepted reviews. All 500
real profiles are pending and unranked. The old twelve confidence totals have
been removed from public scoring, not inverted or relabeled. The default directory
is alphabetical until eligible scores exist; its visible notice explains that it
is research inventory, not an ordered list of problematic KOLs. The data gap blocks
publishing actual problem rankings. It cannot be solved through layout or arithmetic.

## Methodology

The versioned rubric defines a 2025-11-18 through 2026-11-17 review window and a
minimum of three distinct products per creator, with a completed review, explicit
selection method, creator-to-product sources, dated primary findings and severity
assessments. Every reviewed product needs an explicit outcome; unresolved outcomes
keep the entire sample pending. The minimum, period, weights and severity factors
are editorial choices, not statistical calibration. A consistent and documented
sampling process remains a research responsibility.

Frequency = 70 × affected products / reviewed products.
Severity = 30 × sum of each product's highest confirmed severity / reviewed products.
Minor, moderate, serious and critical factors are 0.25, 0.5, 0.75 and 1. Each
component rounds to one decimal before an exact tenths sum. Multiple articles or
incidents for one product do not multiply its contribution. Higher frequency or
severity increases the score for a fixed sample. A reviewed zero is valid, whereas
missing, alleged, disputed, undersized, duplicated-product, out-of-window or
incompletely sourced reviews cannot produce a score.

Acceptable evidence includes regulator findings, official recalls, final rulings,
attributable test reports and documented seller admissions/resolutions. Source
URLs and dates are structurally validated; that validation does not independently
establish truth. Human source review and exact product/variant/creator linkage are
required before admitting records. The score describes the reviewed sample, not
a population failure rate, creator intent or a guarantee that low-scoring products
are safe. Source confidence governs evidence admission; it is not a risk score.

Default sorting is highest problem score first, with shared competition ranks for
ties and stable name/handle display ties. Pending follows eligible zero in both
sort directions. Filtering never changes global rank. Existing `evidence-v3`
coverage calculations, sourced records and real feedback storage are preserved;
feedback remains about coverage and does not influence product-problem scores.
The separate fictional high-is-clear examples are now explicitly titled
“Transparency examples” to avoid opposite meanings for “Onion Score”.

## Visual and interaction review

Used `frontend-self-review.md`. Before screenshots at 1440/375 were captured as
`problem-score-before-1440.png` and `problem-score-before-375.png` in session
artifacts. After screenshots cover both directory widths and the expanded report
methodology. Inspection found that the existing mobile rule hid the score-direction
caption. The refinement shows “Higher score. More product problems.” on mobile too.
The neutral state and no-rank notice are visible; empty research does not look like
a Fresh/zero verdict. Screenshots use real pending data, not synthetic allegations.

| Dimension | First revision | Final |
| --- | ---: | ---: |
| Task access & hierarchy | 8.0 | 8.0 |
| Brand & visual composition | 9.0 | 9.0 |
| Readability & information density | 8.5 | 9.0 |
| Interaction & feedback | 9.0 | 9.0 |
| Responsive behavior & accessibility | 8.5 | 9.0 |

These scores are subjective judgments. Task access remains below the 9 target:
there are no source-qualified real problem rankings yet. That is an evidence gap,
not a request for approval or a reason to invent ratings. The scoring direction,
eligibility handling and interface are implemented and reviewable.

## Validation

Typecheck, build and 71 unit/API tests passed. Tests cover frequency/severity,
component reconciliation, repeated-problem deduplication, exact band boundaries,
reviewed zero versus unknown, invalid/incomplete/disputed sources, the complete
500-profile pending state, and both sort directions. Original coverage and shared
feedback tests continue to pass.

Browser checks used a temporary SQLite database. Real data rendered only pending,
unranked values. A separate in-memory esbuild fixture, supplied only to one test
page's app.js response, exercised eligible 100.0/30.8/0.0 scores, high-first and
low-first ordering, Rotten/Fresh illustrations, source calculations and vote
independence. No fixture was saved into real research, served on the user's live
port or included in screenshots. Search, pagination, report routing, keyboard
voting, switching/withdrawal, persistence, failure/retry and one-score rendering
passed. Directory/report layouts, expanded scale and formula were checked at
320/375/768/1024/1440 with no horizontal overflow and at least 44×44px vote targets.
Final mobile-caption refinement was followed by another build and browser check.
Testing is limited to Chromium; no independent calibration or user study is claimed.
