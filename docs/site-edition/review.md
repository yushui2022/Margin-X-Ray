# Onion Head site design review

Reviewed November 23, 2026. The November 19 price observations and the versioned scoring data supplied the examples. The public site uses the saved edition. The upload and scan tools were exercised in the backend-enabled build.

| Project rubric | Before | After | Evidence |
| --- | ---: | ---: | --- |
| Task access and hierarchy · 25% | 7 | 9 | At 375 px the first ranked entry moved from y=693 to y=456. The 812 px viewport shows three entries above the bottom navigation. Creator search stays on the homepage. |
| Brand and visual composition · 20% | 8 | 9 | A new illustration shows the existing onion character comparing receipts. Ranked reports, archive records and source pages share paper backgrounds, aligned headings and a consistent return control. |
| Readability and information density · 15% | 7 | 9 | Each ranked entry pairs its source portrait, creator, product, gap and score. Similar items are identified. Method, benchmark quotes and the concentration of the sample remain available in the edition notes. |
| Interaction and feedback · 20% | 8 | 9 | Filters and the ranked/unrated selection survive Back and reload. Homepage suggestions and featured rows open the same inline comparison. Source links, empty states, editable costs and keyboard selection were exercised. |
| Responsive behavior and accessibility · 20% | 8 | 9 | Ranking and tools were checked at 320, 375, 768, 815, 1024 and 1440 px. Directory and evidence views were checked at five widths. Active navigation has an accessible current state. |
| Weighted design judgment | 7.6 | 9.0 | Internal review of the listed tasks and viewports. |

The first design pass exposed three remaining issues. The narrow search hint clipped before the word “link”, retail records highlighted the shopping tab even though their return link led to the price archive, and an image-size rule also matched the creator portrait. The final pass shortened the hint, aligned the active tab with the destination and limited product image sizing to the actual product photo.

Chrome interaction checks used the edition's real records. Ranked and unrated views contained 89 and 72 accounts respectively. Filtering to Bethanny, opening her report and navigating back restored the filter. The first ranked product showed $64.94 and a $54.83 comparable listing, a $10.11 difference with the exact variant unconfirmed. A manual pack comparison with $20 for two items and $24 for eight produced 3.333× after confirming the match. The build, TypeScript check and all 256 tests passed. Feedback tests used a temporary database.

After the Pages deployment, the public URL passed the ranking and tools checks at six viewport widths and the directory and archive checks at five. At four widths, selecting the homepage suggestion and selecting the featured row opened the same comparison. The source link, product deep link, archive return link and active navigation also passed. [Published build](https://github.com/yushui2022/Margin-X-Ray/actions/runs/45114727215)

| Surface | Before | After |
| --- | --- | --- |
| Homepage, 375 px | [Previous](before-home-375.png) | [Updated](after-home-375.png) |
| Homepage, 1440 px | [Previous](before-home-1440.png) | [Updated](after-home-1440.png) |
| Ranking, 375 px | [Previous](before-ranking-375.png) | [Updated](after-ranking-375.png) |
| Ranking, 815 px | [Previous](before-ranking-815.png) | [Updated](after-ranking-815.png) |
| Ranking, 1440 px | [Previous](before-ranking-1440.png) | [Updated](after-ranking-1440.png) |
| Archive search, 375 px | [Previous](before-search-375.png) | [Updated](after-search-375.png) |
| Retail product, 815 px | [Previous](before-product-815.png) | [Updated](after-product-815.png) |

[Directory, creator and price archive review](creator-and-price-archive.md) · [Tools on mobile](tools-mobile-comparison.webp)

<details>
<summary>Homepage illustration</summary>

Created with ImageGen using the [Onion Head character](../../assets/mascot/onion-boy-side-eye.webp) and [dateline stamp](../../assets/mascot/onion-date-stamp.webp) as references. The [production WebP](../../assets/mascot/onion-price-inspector.webp) is 540 × 360.

One finished small editorial spot illustration for the homepage of Onion Head, a publication that compares prices on TikTok Shop. Transparent background. Use image 1 as the exact character design reference: a young purple onion-headed boy with green sprout, half-lidded sideways eyes, knowing raised eyebrow, peach cheeks and rust-striped shirt / neckerchief. Use the restrained screenprinted, woodcut-like quality and dark plum ink of image 2 as secondary stylistic reference. A witty tight waist-up horizontal composition: this character leans in and compares two curled paper shop receipts side by side, holding a small magnifying glass to one slip, looking genuinely inquisitive and a little skeptical. The two short slips are clearly separate, with just a few big rust and plum horizontal print marks. Distinctive silhouette, clean confident contours, cream paper product newspaper illustration with subtle in-shape ink texture and block shadows, tactile but sophisticated. Character and receipts make one compact flat cutout; use a little muted purple, rust, cream and olive. Asymmetrical arrangement with one curl kicking outward. Humorous and editorial, legible at 220px wide. Keep the character recognizable. Full illustration entirely in frame with minimal transparent padding. No words, no numerals, no legible receipts, no background, no surrounding frame, no labels, no additional floating objects, no backdrop or cast shadow.

</details>
