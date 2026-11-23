# Live creator lookup progress

The original homepage showed the account handle under two generic labels. The “Recent posts” state used a thin colored rule and a spinner beside a second description of the same stage. At 375 px, Close wrapped onto a separate row above the account.

| Project review dimension | Before | After | Evidence |
| --- | ---: | ---: | --- |
| Task access and hierarchy | 7 | 9 | The selected account's portrait and name appear beside the task. The main heading identifies what the service is checking. |
| Brand and visual composition | 7 | 9 | The warm paper card and serif task heading carry the price-report typography into the live check. The short toolbar title leaves room for both actions. |
| Readability and information density | 7 | 9 | The selected phase says “Step 2 of 4”. Its description explains what the service looks for in up to five recent posts. The compact labels fit even at 320 px. |
| Interaction and feedback | 8 | 9 | Events drive stage changes. The tracker distinguishes visited, current, pending and skipped stages. Returning to matches, retrying an interruption and closing a live query all work inline. |
| Responsive behavior and accessibility | 8 | 9 | At 375 px the Back and Close buttons share a row and each provides a 44 px high target. The status region announces progress and the active step clears on completion. |
| Weighted review judgment | 7.4 | 9.0 | Internal assessment of this lookup flow. |

| Viewport | Original | Revised |
| --- | --- | --- |
| 375 px | [Original phone view](before-375.png) | [Revised phone view](after-375.png) |
| 815 px | [Original desktop view](before-815.png) | [Revised desktop view](after-815.png) |

Chrome checks covered 320, 375, 768, 815, 1024 and 1440 px. The selected TikTok account was Tomsun, @tomm.y__. The original and revised captures pause at the posts stage by replaying the worker's event format in the browser. The candidate and completed report came from the public service. Its saved result contained three checked posts, zero linked products and an unrated outcome.

The first revised phone capture exposed tight spacing between the step labels and a wrapping toolbar title. After shortening the labels, a second capture confirmed they fit. The test also exposed a stale active-step attribute when a stream ended. The final checks cover that transition, an interruption followed by retry, the skipped shop-price stage, returning to matches via keyboard and closing a lookup with focus restored to the search field.

After deployment, the six-width interaction checks passed through the public Pages URL. A separate unmodified public search and selection returned the cached report for @tomm.y__ directly on the homepage. Local JSON-response checks covered partial access, missing posts, missing links, products without a comparison and products with a comparable offer. The build, type check and 257 automated tests passed. [Published build](https://github.com/yushui2022/Margin-X-Ray/actions/runs/45117382433)
