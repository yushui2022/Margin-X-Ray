# Preliminary Evidence Score · evidence-v3

Updated 2026-11-17. All 500 known profiles display a calculated research-coverage
score. It is separate from the fictional transparency Onion Score. Raw roster
`score: null` and `reviewStatus: not-reviewed` still describe the unassigned
verified transparency rating. Unknown handles receive no score.

## Ten checks, 100 possible points

| Group | Check | Maximum | Rule |
| --- | --- | ---: | --- |
| Public sample | Account-matched sample | 10 | Returned handle matches; at least one non-empty caption |
| Public sample | Caption sample depth | 10 | Proportional to 20 distinct non-empty caption IDs; matched account required |
| Commercial trail | Selected commercial leads | 15 | Proportional to 4 distinct manually selected source URLs |
| Commercial trail | Product-to-post links | 10 | Proportional to 3 distinct TikTok posts linked to accepted sourced products |
| Product & price | Sourced product records | 10 | Proportional to 3 named product records with resolvable sources |
| Product & price | Variant documentation | 10 | Proportional to 3 sourced products with variant descriptions |
| Product & price | Reference price & currency | 10 | Proportional to 3 sourced products with positive finite amounts and three-letter currencies |
| Product & price | Market & offer notes | 5 | Proportional to 3 sourced priced records with market and condition notes |
| Financial evidence | Compensation records | 10 reserved | No qualifying records; always zero in this version |
| Financial evidence | Costs & profit records | 10 reserved | No qualifying records; always zero in this version |

Group weights: 20 + 25 + 35 + 20 = 100. Financial points require reviewed primary
records and a versioned rule update. Current maximum is 80. Unknown earnings are
not zero earnings. Calculator inputs, follower counts, keyword cues and votes add no points.

For each proportional check: `round(10 × maximum × min(count, target) / target) / 10`.
Round each check to a tenth, then sum in integer tenths so every displayed check and
group reconciles exactly with the total. One selected URL earns 3.8, two earn 7.5,
three earn 11.3, and four or more earn 15.0. One sourced product earns 3.3 and two
earn 6.7 in the product check. No random offsets, follower adjustments or invented
precision are added. Tenths express this editorial calculation, not confidence.
Equal evidence still receives equal scores. Targets are in `creator-score-rubric.json`.

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

Coverage labels: no usable evidence (0), initial (>0 to <30), partial (30 to <60), broader
(60–100). They measure research collected, not behavior. More work can raise a
score; corrections or removals can lower it. Default order is descending score,
then name and handle, without follower tie-breaking.

## Version change

V1 used four coarse checks: public sample 20; selected URLs 10 each up to 30;
accepted priced products 15 each up to 30; financial evidence 20 reserved. V2
introduced ten checks, but most still moved in five-point increments. V3 retains
the same ten checks and group weights, expands collection targets and uses
proportional tenths for finer progress. Scores across versions are not directly comparable;
a changed score can reflect the rubric alone, with no new research or change in
creator conduct. No new source collection was performed for this revision.

The UI shows the version and observation date, group totals, all ten point values,
expandable calculations, sources and next research steps. Directory mini-bars use
the same four group colors. The financial group remains visibly incomplete.

## Community feedback

Directory rows and reports offer “↑ Seems fair” and “↓ Needs review” on the score's reasoning.
The two buttons are mutually exclusive; clicking the selected button removes the
choice. Counts and agreement percentage come from the shared server, starting at
zero without seeded or simulated votes. Requests are idempotent, and the UI waits
for confirmation before changing totals. After an uncertain request, Retry reads
the authoritative state before another vote is allowed.

SQLite persists one choice per anonymous browser cookie, creator and rubric version.
Votes are separate from evidence points and do not claim unique authenticated people.
Changing browsers or clearing cookies permits another choice. A new rubric version
starts a new tally; votes within a version apply to that version's evolving report.
The UI refreshes counts when opening/reloading a report, voting or retrying; it does
not stream updates from other visitors. There is no moderation inbox or automatic
research job. “Needs review” records a signal for future review.

Compact directory controls are sibling elements of the report link, so voting
does not navigate and no buttons are nested inside links. They share the report's
API, selection rules and error recovery. The client establishes the anonymous
cookie before concurrent row reads to avoid competing first-visit sessions.

### Rotten Onion Index

This separate community metric is `round(down / (up + down) × 1000) / 10`.
Higher values mean a greater share of “Needs review” responses to this score.
It is not computed as `100 - Evidence Score`, because limited research is not
evidence of wrongdoing. It does not change evidence points, sorting or vote data.

The displayed rounded value selects the illustration: Fresh [0,20), Spotted
[20,40), Bruised [40,60), Spoiled [60,80), Rotten [80,100]. The UI calls these
visual states of the index, not a verified rating of the person. They use different
sprouts, expressions, patches and colors in six local SVGs (including gray unrated).
Zero votes, failed requests and invalid counts have no numeric index. Loading and
unavailable states are distinct from a confirmed empty tally. One vote can produce
0.0 or 100.0; fewer than five votes get an Early label. That threshold is a UI cue,
not a statistical confidence guarantee. All counts remain anonymous browser votes.
