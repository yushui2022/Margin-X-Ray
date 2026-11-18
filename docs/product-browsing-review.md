# Finding creator products and their sources

The 500-profile directory contains priced product research for 12 creators.
Previously, finding those records required opening research filters, selecting
the checkbox, opening a report and switching sections. Public captions and leads
then appeared before prices. The checkbox is now beside search. A filtered
result opens that creator's products, with sources beside each price.

## Screenshot review

Measured document positions after fonts loaded in Chromium, with a 920px viewport
height and the filters closed. A smaller position means less scrolling from the
top of the page.

| Viewport | Search, before → after | First creator, before → after |
| --- | ---: | ---: |
| 375px | 728 → 567px | 1111 → 765px |
| 1440px | 514 → 450px | 816 → 630px |

The baseline mobile heading wrapped across three lines and the selected sort label
clipped. The first revision shortened both and moved category and research options
under More filters. Its screenshots exposed three remaining problems. The sort
still said Highest score while everyone was pending, the compact vote buttons
lacked their coverage label, and one-product relationship groups left half the
desktop grid blank. The final revision shows the active name order, labels the
vote and puts cards with their individual relationship labels into one grid.
The desktop screenshot now shows USD and EUR records side by side. On the phone,
the first NikkieTutorials price and its source control fit in the landing viewport.

| Project rubric dimension | Baseline | First revision | Final |
| --- | ---: | ---: | ---: |
| Task access & hierarchy | 7.5 | 8.5 | 9.0 |
| Brand & visual composition | 9.0 | 8.5 | 9.0 |
| Readability & information density | 8.0 | 8.5 | 9.0 |
| Interaction & feedback | 8.0 | 8.5 | 9.0 |
| Responsive behavior & accessibility | 8.0 | 8.5 | 9.0 |

These are design judgments for the tested browsing task. The weighted final
self-review is 9.0/10. Session screenshots are named `research-entry-before-*`,
`research-entry-after-*` and `research-products-after-*`.

## Interaction and data checks

- Checked 320, 375, 768, 1024 and 1440px layouts, expanded filters and source
  disclosures, keyboard activation and at least 44×44px vote targets.
- Combined priced products, category, research state and handle search. Tested
  zero matches, reset, pagination, ordinary reports and fictional examples.
- Reloaded both product and profile-source URLs. Browser Back restored the
  originating result, filters and focus after reloading the report. The score
  section exposes the issue calculation and coverage feedback.
- Compared all 21 rendered product cards across 12 reports with the research
  records for variant, purchase conditions, source URLs and observation date.
- With a temporary SQLite database, verified changing, withdrawing and reloading
  a vote, directory/report synchronization and recovery from an unavailable API.
  A separate in-memory fixture exercised eligible score sorts and reviewed zero.
- Typecheck, build and 71 unit/API tests passed. Browser testing used Chromium.
  Live seller checkouts and the underlying issue-review dataset were outside
  this browsing review.
