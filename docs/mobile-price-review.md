# Mobile creator lookup and price comparison

On the baseline 375px directory, the first creator row began around 720px down the page. Product URLs entered in the directory produced an empty list. The revised home search opens creator reports, routes video links to the scan input and opens product checks. At 375px the first row begins at 561px. The bottom navigation stays within thumb reach. Desktop retains a horizontal header.

The first pass put a multi-supplier receipt above the pack editor. The second pass moved manual entry on the blank price-check page into a disclosure and added direct access to three different evidence states. Sharing an archived check uses the device share sheet when available, with clipboard and selectable URL fallbacks. An edited pack price stays in the calculator. The shared URL opens the recorded observation.

| Design dimension | Baseline | First pass | Final |
| --- | ---: | ---: | ---: |
| Task access and hierarchy | 7 | 8 | 9 |
| Brand and visual composition | 9 | 9 | 9 |
| Readability and density | 8 | 9 | 9 |
| Interaction and feedback | 8 | 8 | 9 |
| Responsive behavior and accessibility | 8 | 9 | 9 |

These are the author's judgments for the paths examined. [Mobile home](mobile-home-375.png) · [Mobile result](mobile-range-375.png) · [Desktop home](mobile-home-1440.png)

## Evidence and checks

On November 18, 2026, public US single-set prices from Ford Hotel Supply, Jean’s Restaurant Supply and East Bay Restaurant Supply were $1.58, $2.33 and $2.99 for Winco MSP-4P. Against the selected $5.82 retail offer, the per-set multiples run from 1.95× to 3.68×. Only one of three reaches 3×. A separate live East Bay retail lookup recovered the same barcode. After confirming the market, unit count and variant, its comparison used the other two suppliers. Each recorded offer includes a source URL and observation date.

The editorial settings in `listing-gap-v2` use a 30-day window around the retail observation and a provisional 3× threshold. Two independent suppliers must both cross the cutoff for a high result, and all further eligible quotes must agree. This gives a result for the collected sample. Provider coverage and accuracy across other product categories still need field measurements.

Chromium checks covered 320, 375, 768, 1024 and 1440px, including keyboard submission, filters, pagination, known and unknown creators, archived and unarchived products, video handoff, source links, individual quote edits, Back and refresh. An isolated SQLite database was used for vote selection, switching, withdrawal, persistence and retry. Testing also covered sharing over a LAN HTTP origin, plus a mock video scan on that origin. Physical iPhone and Android tests remain open. A direct price report now loads about 36 KB of compressed JavaScript in this preview, with the creator research bundle loaded on demand.
