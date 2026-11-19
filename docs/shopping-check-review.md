# Shopping check

The landing page now accepts a TikTok post, creator, product name or listing. A post opens evidence for the specific video and lets the shopper choose the product. Consumer prices and delivery terms occupy the first comparison card. Supplier order quantities, the quality review and community feedback remain available in their respective views.

## Visual review

| Fixed project dimension | Previous home | First shopping build | Revised shopping build |
| --- | ---: | ---: | ---: |
| Task access and hierarchy | 6 | 8 | 9 |
| Brand and composition | 8 | 8 | 9 |
| Readability and density | 7 | 8 | 9 |
| Interaction and feedback | 7 | 8 | 9 |
| Responsive behavior and accessibility | 8 | 8 | 9 |
| Weighted result | 7.2 | 8.0 | 9.0 |

These are the author's design judgments for the local browser flows. The original page led with the directory and a supplier multiple. In the first shopping build the featured model number wrapped in the middle, the browse link occupied a second row on mobile and the product summary repeated the delivery explanation. The revised home gives a merchant-specific difference, places the browse link beside its heading and links a measured creator index to its sample. Each tested width keeps the price button and form usable.

| View | Desktop | Mobile |
| --- | --- | --- |
| Original home | [1440px](shopping-before-1440.png) | [375px](shopping-before-375.png) |
| Shopping home | [1440px](shopping-home-1440.png) | [375px](shopping-home-375.png) |
| Matched retail offers | [1440px](shopping-comparison-1440.png) | [375px](shopping-comparison-375.png) |

## Verification

- Used Chromium at 320, 375, 768, 1024 and 1440px for home, product search and results, matched and missing retail offers, expanded sources, and the shopper's checkout calculator. No horizontal overflow appeared on the paths tested. Verified cheaper, equal and more expensive checkout totals and invalidation of the result after edits.
- Entered Mrwhosetheboss's original TikTok video and checked its public caption, account, product-selection action, delivered price difference, both retailer links and original evidence. A NASA post recovered its actual caption and showed an unidentified product. Video and marketplace provider failure and throttling paths have fixture coverage.
- A product link for a different market exposes its historical listing alongside the dated, separately labeled comparison. An archived wrong-shade URL retains the requested variant and opens listing lookup. Coverage dates, stock, variant, quantity and consumer attribution affect eligibility independently. One comparable product can produce a shopping result before the creator has enough observations for an index.
- Searched for Feastables by name, opened its pack-specific record, then its separate supplier quote. Checked two checkout totals manually with a destination and explicit variant confirmation. Opening a listing by barcode works through a marketplace link when service credentials are absent. Live eBay results and the optional TikHub fallback were tested with provider fixtures. TikTok's public post path was tested against the real service.
- Checked the first scored sample against three single-item deliveries to Oregon. Both Bare lip kit formulas cost $43.95 delivered from the brand and $35 from Ulta. Kylash mascara costs $33.95 and $31.95 respectively. The median premium is 25.6%, corresponding to 20.4/100 on this sample. The dated retailer records and selection rule appear in the [comparison evidence](../research/retail-comparisons.json). The [mobile receipt](shopping-founder-375.png) shows the delivery charge beside the item amount.
- The creator profile, filtering, pagination, keyboard navigation, persisted votes and historical quality evidence have additional browser checks in the [creator shopping review](creator-shopping-review.md). All test votes used isolated SQLite storage. Device checks used viewport emulation. Recorded prices depend on the observation date and stated destination.

The featured image shows the Platinum Silver model from [the retailer's product page](https://www.johnlewis.com/sony-wf-1000xm6-noise-cancelling-true-wireless-bluetooth-sweat-weather-resistant-in-ear-headphones-with-mic-remote/silver/p114867788). The image illustrates the SKU selected for comparison. The original post supplies evidence for the model line.
