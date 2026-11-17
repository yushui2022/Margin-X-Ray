# One Onion Score, higher is fresher

Historical review. The subsequent user clarification makes higher scores worse
and requires actual documented product problems. See `product-problem-ranking-review.md`;
the confidence totals and high-is-fresh bands below are no longer public ratings.

The user identified the redundant confidence and inverse-index columns and asked
for one score with higher values meaning fresher onions. The directory now shows
the confidence total directly as **Onion Score**, next to its illustration, band
and global rank. The old numeric column and mini-bars are removed. Report headers
use the same illustrated score once; the explanatory section no longer repeats
the total or shows its complement. Detailed component and coverage calculations
remain available for auditing. Confidence-v1 weights, eligibility and actual
totals are unchanged.

Bands follow the displayed score: Fresh [80,100], Spotted [60,80), Bruised [40,60),
Spoiled [20,40), Rotten [0,20). Boundary scores enter the higher band. Pending
research stays neutral and unranked. Default sorting remains highest score first.
Nikkie displays 62.9, Spotted, #1; there is no complementary 37.1 metric.

Applied the fixed frontend rubric. Baseline screenshots were captured at 1440 and
375 pixels before editing (`single-score-before-1440.png` and
`single-score-before-375.png`). The main defect was two numbers conveying one
fact in opposite directions. The report compounded it by repeating the total in
its confidence summary and showing a separate illustration below the header.

| Dimension | Before | Final |
| --- | ---: | ---: |
| Task access & hierarchy | 8.0 | 9.0 |
| Brand & visual composition | 9.0 | 9.0 |
| Readability & information density | 7.5 | 9.0 |
| Interaction & feedback | 9.0 | 9.0 |
| Responsive behavior & accessibility | 9.0 | 9.0 |

Scores are subjective design judgments, not certification. Actual desktop/mobile
directory screenshots and the report header were inspected. The remaining score
and illustration align, identity has more space, and mobile retains the clear
identity/score-and-feedback grouping. The report header includes “Out of 100 ·
Higher is fresher”; the expanded scale states the new ascending ranges.

Validation: typecheck, build and 67 unit/API tests passed. Updated unit checks
cover every ascending boundary, displayed rounding, neutral/invalid input and
equality between the Onion Score and confidence total for all rated profiles.
Isolated-database browser checks assert exactly one score indicator per row and
report, no complementary metric, correct report calculation/source links, stable
rank and score through votes, switching, withdrawal, refresh and feedback failure,
pending states, search, sorting and pagination. Directory/report layouts and
expanded explanations pass at 320/375/768/1024/1440, with at least 44px voting
targets and no horizontal overflow. Real votes were not modified by testing.
Chromium only; no independent user study or cross-browser certification.
