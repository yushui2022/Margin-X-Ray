# Preliminary Evidence Score · evidence-v2

Updated 2026-11-17. All 500 known profiles display a calculated research-coverage
score. It is separate from the fictional transparency Onion Score. Raw roster
`score: null` and `reviewStatus: not-reviewed` still describe the unassigned
verified transparency rating. Unknown handles receive no score.

## Ten checks, 100 possible points

| Group | Check | Maximum | Rule |
| --- | --- | ---: | --- |
| Public sample | Account-matched sample | 10 | Returned handle matches; at least one non-empty caption |
| Public sample | Caption sample depth | 10 | 1 per distinct non-empty caption ID, capped at 10; matched account required |
| Commercial trail | Selected commercial leads | 15 | 5 per distinct manually selected source URL, capped at 3 |
| Commercial trail | Product-to-post links | 10 | 5 per distinct TikTok post linked to an accepted sourced product, capped at 2 |
| Product & price | Sourced product records | 10 | 5 per named product record with a resolvable source, capped at 2 |
| Product & price | Variant documentation | 10 | 5 per sourced product with a variant description, capped at 2 |
| Product & price | Reference price & currency | 10 | 5 per sourced product with a positive finite amount and three-letter currency, capped at 2 |
| Product & price | Market & offer notes | 5 | Once, for a sourced priced record with market and condition notes |
| Financial evidence | Compensation records | 10 reserved | No qualifying records; always zero in this version |
| Financial evidence | Costs & profit records | 10 reserved | No qualifying records; always zero in this version |

Group weights: 20 + 25 + 35 + 20 = 100. Financial points require reviewed primary
records and a versioned rule update. Current maximum is 80. Unknown earnings are
not zero earnings. Calculator inputs, follower counts and keyword cues add no points.

Product IDs, caption IDs, selected URLs and linked post URLs are deduplicated
within their respective checks. Two variants linked to one post earn linkage
points only once. Separately sourced variants can count as different products.
Independent commercial and product evidence can earn points even if TikTok sample
access fails. Sampling requires an identity match and usable captions; blank
captions and duplicate IDs do not increase depth.

## What the checks establish

This is documentation coverage, not a creator trust or product-quality rating.
“Collected” means the rubric's capped criterion has been met; “Partial” means some
points are supported; “Missing evidence” means this dataset cannot award points.
Full points do not mean a complete promotion history or a fully verified offer.

The same product can earn points for its name, variant, reference price and
context. These are separate documentation fields, not independent corroboration.
Condition notes can explicitly state that stock, shipping, tax or returns remain
unknown. Their presence does not verify those terms. Product-linked posts can
identify a line without matching the exact shade, pack or quoted reference price.
Each check links supporting sources; all extracts and access qualifications remain
in Products & earnings. Source lists can include multiple references supporting
the product record, rather than a one-to-one field-level attribution.

Weights and caps are editorial choices, not calibrated confidence probabilities.
Platform-selected captions are not a representative sample. Indexed references can
be stale. Company revenue, margins or founder status do not establish personal
profit, sole ownership or current distributions.

Coverage labels: no usable evidence (0), initial (1–29), partial (30–59), broader
(60–100). They measure research collected, not behavior. More work can raise a
score; corrections or removals can lower it. Default order is descending score,
then name and handle, without follower tie-breaking.

## Version change

V1 used four coarse checks: public sample 20; selected URLs 10 each up to 30;
accepted priced products 15 each up to 30; financial evidence 20 reserved. V2
replaces those rules with ten checks, finer caption depth and explicit product
documentation and post linkage. Scores across versions are not directly comparable;
a changed score can reflect the rubric alone, with no new research or change in
creator conduct. No new source collection was performed for this revision.

The UI shows the version and observation date, group totals, all ten point values,
expandable calculations, sources and next research steps. Directory mini-bars use
the same four group colors. The financial group remains visibly incomplete.
