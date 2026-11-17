# Preliminary Evidence Score · evidence-v1

Introduced 2026-11-17 after the request to put a score on as many profiles as
possible. All 500 known profiles now display a calculated research-coverage score.
It is separate from the proposed transparency Onion Score used by fictional
examples. The directory's raw `score: null` and `reviewStatus: not-reviewed`
remain the state of the verified transparency review, not the displayed evidence
score. Unknown user-entered handles receive no score.

## Rubric

| Dimension | Points | Basis |
| --- | ---: | --- |
| Public caption sample | 20 | At least one usable caption from a matching public account |
| Selected commercial sources | 30 | 10 per distinct manually selected source URL, capped at three |
| Sourced reference prices | 30 | 15 per accepted priced product record, capped at two |
| Verified financial evidence | 20 reserved | None available; always zero in this version |

The first three dimensions are summed without a default or imputed value. An
unavailable sample earns no sampling points but does not discard independent
external evidence. The current data can reach at most 80/100. A future financial
scoring rule requires verified records and a versioned methodology update; no
financial points are awarded based on text patterns or user assumptions.

The caps and weights are editorial coverage choices, not empirically calibrated
reliability probabilities. Different source URLs about one brand can count, as
can separately priced pack variants. The score does not express the share of all
products or promotions researched. The same evidence may support a selected lead
and a separately matched product price; those represent different collection tasks.

No usable evidence: 0. Initial evidence: 1–29. Partial evidence: 30–59. Broader
evidence: 60–100. There are no S–D creator grades for this metric. Scores are
computed from the dated local data, not live TikTok content. Removing or correcting
records may lower a score; more researcher effort can raise one without any
change in the creator's conduct.

## Interpretation and interface

This is a score of the report's available evidence. A low value means incomplete
research, not dishonesty, undisclosed advertising, a poor product, excessive profit
or zero earnings. No creator trust score or factual profit estimate is produced.
Followers and popularity do not participate in the formula or break score ties.
Keyword cues do not award points. Reference-price access limitations and unresolved
relationships remain visible in Products & earnings.

Directory default order is descending evidence score, with name/handle ties.
Users can sort ascending, by followers, or by name. Reports show four dimension
bars, the exact point sum, observation date, version, source links and unknown
financial evidence. Existing hypothetical calculators cannot change the score.
