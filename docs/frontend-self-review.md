# Frontend self-review: target 9/10

This is a project-specific prompt, written for Onion Head. It is not a recovered
copy of the unspecified prompt the user saw. It adapts the generate → critique →
refine pattern commonly called Self-Refine / rubric-based self-critique.

Context: the user's supplied “从 Demo 到企业级质感：前端升级执行指南” and
“SkuMotion前端优化完整指南”; established warm paper, rust-red actions, Fraunces
headings, purple onion mascot, compact creator ratings and real evidence sources.
Background: https://arxiv.org/abs/2303.17651 (Self-Refine). This workflow is our
adaptation; the paper does not certify a frontend quality threshold.

## Reusable prompt

Act as the product designer, frontend implementer and critical reviewer for this
existing application. Carry the authorized change through implementation and
verification. Use independent judgment for routine design choices.

1. Inspect the actual app, repository instructions and existing user-approved
   behavior. Capture comparable desktop and mobile screenshots before editing.
2. Score the current experience on the fixed rubric below. Record concrete defects
   with a location, user consequence and proposed improvement. Do not create an
   artificially low baseline to make improvement look larger.
3. Fix the most consequential weaknesses. Prefer hierarchy, space, alignment,
   readable text, clear state and predictable interactions over decoration.
4. Build and examine the real rendered result. Check search, filters, pagination,
   report navigation, source disclosure, up/down selection, switching, withdrawal,
   persistence and failure recovery whenever affected. Use an isolated database
   for test votes; never seed fabricated popularity into the real app.
5. Re-score against the same rubric. If a dimension remains below 9, implement a
   specific improvement and recheck the affected scenario. Do not rewrite the
   rubric or increase scores without new evidence. Repeat while concrete issues
   remain fixable within the task. If blocked, state the blocker and actual score.
6. Deliver the working page, a concise change list, actual validation and any
   meaningful limits. Do not present self-review as a user study, external audit
   or proof of universal 9/10 quality.

## Fixed rubric

| Dimension | Weight | Evidence for a strong result |
| --- | ---: | --- |
| Task access & hierarchy | 25% | Search and real creator rows are easy to reach; secondary lookup does not dominate mobile |
| Brand & visual composition | 20% | Existing identity is recognizable; consistent type, color, spacing and alignment |
| Readability & information density | 15% | Names, decimal scores, evidence and votes remain legible without repetitive instructions |
| Interaction & feedback | 20% | Clear controls, current selections, real persistence, retry and keyboard operation |
| Responsive behavior & accessibility | 20% | No accidental horizontal scroll at 320/375/768/1024/1440; visible focus; 44px voting targets |

Anchors: 5 = obstructive gaps; 7 = usable but obvious friction; 8 = solid with
specific remaining weaknesses; 9 = polished for the evaluated tasks and viewports;
10 = exceptional, with independent evidence beyond a single agent's review.
Overall = weighted mean. Keep scores to one decimal at most.

Hard failures cannot be averaged away: lost votes, invented data, mismatched score
totals, inaccessible primary controls, broken routes or horizontal overflow.
Record each review round in a short task-specific note under `docs/`, including
measured results and the limits of testing. The design score never enters the
creator evidence score or public product UI.
