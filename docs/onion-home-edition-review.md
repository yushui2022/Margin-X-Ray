# Onion Head index landing review

The review follows the five dimensions in frontend-self-review.md on the actual shopping homepage. The desktop reference is 1440 × 900, and the phone reference is 375 × 812.

| Dimension | Before | Observation |
| --- | ---: | --- |
| Task access & hierarchy | 6.5 | The mobile ranking heading started at y=614. The first score at y=762 sat behind the fixed bottom navigation. Lead with a ranked creator and the evidence for their score. |
| Brand & visual composition | 8.5 | The serif, warm paper and onion wordmark already belonged together. The largest product illustration promoted a UK archive listing above the US index. Give this space to a current price receipt. |
| Readability & information density | 7.5 | Three tied creators repeated the same prices. The listing behind those prices was unnamed in the preview. Include the checked product and select different listings for the other previews when available. |
| Interaction & feedback | 8.5 | Lookup and the screenshot picker worked, but opening the first price receipt depended on discovering the whole row was a link. Give the receipt a labeled link. |
| Responsive behavior & accessibility | 8.0 | Desktop had sufficient space for the index at y=552. On a phone, several screens of lookup and archive material stood ahead of the third creator. Move the essential comparison and actions into the first viewport. |

Baseline weighted self-review 7.8/10. Screenshots are in [onion-home-edition](onion-home-edition/).

## First review of the new landing

The featured score, item and two prices appeared in the phone viewport. The inherited link rule made the primary button hard to read. At 320 px the sticky navigation covered the price difference. A general creator link also opened at the top of a multi-product report. The initial self-review for interaction and responsiveness was 8/10 in both cases.

The revision gave the primary link a measured 12.1:1 contrast ratio, tightened the mobile header, placed the match quality above the prices and linked to the actual sampled item. The lookup shortcut centers the form and focuses its field. The second section draws additional creators with different scored listings when available. The UK archive offer remains under the archive heading.

## Final checks

| Dimension | After | Evidence |
| --- | ---: | --- |
| Task access & hierarchy | 9.2 | At 375 px the score starts at y=205, the receipt at y=342 and the full lookup field ends at y=753, above the fixed navigation at y=757. The full-ranking button is the first tab stop after the page heading. |
| Brand & visual composition | 9.0 | The existing wordmark, onion mascot and serif anchor a single score and receipt on warm paper. The original and reference bars use the same zero-based scale. |
| Readability & information density | 9.1 | The creator score, peer-price band, tie count, product variant, price difference, matching basis and reference-shop count all have separate text labels. The supporting previews link two other actual listings. |
| Interaction & feedback | 9.1 | Keyboard entry opened the board. The featured receipt and supporting example both focused the chosen product and exposed its source link. Browser Back returned to the homepage. Invalid handle validation cleared after editing, and a valid handle submitted to the product job route. |
| Responsive behavior & accessibility | 9.0 | Chromium recorded zero horizontal overflow at 320, 375, 768, 1024 and 1440 px. The primary controls each have a 44 px target. At 320 × 568 the difference ends at y=501 and the bottom navigation starts at y=506. The lookup shortcut focused the input above the navigation at every width. |

Weighted final design judgment 9.1/10. The rendered featured example was one of four creators tied at 63 in an edition of 89 rated creators. Its Disney Princess air hockey table was $64.94 against $54.83 at one reference shop. Its $10.11 difference and 18.4% premium are labeled as a similar-item estimate.

The screenshot picker rejected a text file, accepted a PNG, surfaced a simulated 503 response and recovered on retry to manual entry. The Sony archive link opened its product record. These checks used the locally built application and browser-side simulated failures for submission. The price and ranking data came from the saved product receipts. No new votes, live TikHub jobs or audience engagement measurements were part of this review.

[375 px before](onion-home-edition/before-375.png) · [375 px after](onion-home-edition/after-375.png) · [1440 px before](onion-home-edition/before-1440.png) · [1440 px after](onion-home-edition/after-1440.png) · [320 px after](onion-home-edition/after-320.png)

## Edition date and quote time

The masthead now dates the edition using the newest eligible benchmark observation in the index. The featured item's receipt footer also gives its own saved quote time in UTC. The published sample rendered “Nov 19 edition” and “Saved 03:46 UTC” from the edition data and the featured SKU respectively. This identifies the frozen peer quote when a fresh lookup returns a different price. At 320 px the scope line fits on one line and the difference still ends at y=501. At 375 px the lookup input still ends at y=753. The five-width navigation and overflow checks, TypeScript and the build passed again; the after screenshots include both timestamps.
