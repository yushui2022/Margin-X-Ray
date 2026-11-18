# Creator index and price archive

The directory and archive share a search area and collection navigation. The
featured receipt displays the Nimya cream record, including its observed price,
market and collection date. Users can search 21 records by product, variant or
creator and filter them by currency. A product page opens its recorded sources
alongside the price, purchase conditions and financial evidence.

## Visual review

At baseline the desktop sidebar offered creator shortcuts. Product names and
prices required opening a report. The first revision put a dated price on the
homepage. Its mobile receipt and repeated directory heading consumed space.
Opening the featured cream also left a neighboring product in the first desktop
column. The final revision shortened the mobile receipt, consolidated directory
controls and gave each product its own page. On mobile the observed price comes
before the expanded source documents.

| Project rubric | Baseline | First revision | Final |
| --- | ---: | ---: | ---: |
| Task access and hierarchy | 8 | 8.5 | 9 |
| Brand and visual composition | 8.5 | 9 | 9 |
| Readability and density | 8.5 | 8 | 9 |
| Interaction and feedback | 9 | 8.5 | 9 |
| Responsive behavior and accessibility | 9 | 8.5 | 9 |

These scores are the author's design judgments for this browsing task. Mobile
allocates more vertical space to a concrete price before the first creator row.
Screenshots cover the [desktop directory](index-directory-1440.png), [mobile
directory](index-directory-375.png), [desktop archive](index-archive-1440.png),
[mobile archive](index-archive-375.png), [desktop product](index-report-1440.png)
and [mobile product](index-report-375.png).

## Checks

Chromium checks covered the directory, archive and product pages at 320, 375,
768, 1024 and 1440px. Verified all 21 product pages against the stored variants,
purchase conditions and source URLs. Tested currency filtering with variant and
creator search, zero results, refresh and Back with focus restored. Directory
filters, examples, pagination and persistent votes passed using a temporary
SQLite database. Typecheck, build and 71 tests passed.
