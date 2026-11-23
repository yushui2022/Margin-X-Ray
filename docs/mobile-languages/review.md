# Language choice and seller samples

The old seller tool described a factory price, 24-hour scan volume and an unlockable supplier report. Its inputs are fixtures. The new seller page labels the prices, activity and suppliers as examples before the first calculation. The inquiry form saves a draft on the device. Shopping receipts still use the recorded shop offers.

The language control follows the first supported device language on first use and remembers an explicit choice. Switching updates the current screen, including accessible labels and newly rendered search feedback. Handles, sourced post text, currency and score values retain their original meaning.

## Interface review

| Project rubric | Before | After | Observation |
| --- | ---: | ---: | --- |
| Task access and hierarchy | 8 | 9 | The sample label and language control are visible before using the calculator. |
| Brand and composition | 9 | 9 | The comparison and calculator use their original layout, colors and mascot. |
| Readability and density | 8 | 9 | The supplier cards describe the sample prices directly. The Chinese search placeholder fits on a phone. |
| Interaction and feedback | 7 | 9 | Switching preserved the typed creator, chosen product, edited retail price and calculated result. Reload kept the selected language. |
| Responsive behavior and accessibility | 8 | 9 | The language control works with the keyboard and has a 44px touch target. A first pass extended 4px past the 320px viewport. Tighter header spacing resolved it. |

These ratings are an internal design assessment of the language and sample UI. Search availability on the physical phone is recorded separately below.

## Verification

- Checked the Pages build in Chrome at 320, 375, 721, 768, 815, 1024 and 1440px. Home, rankings, the creator directory, the price archive, supplier comparisons and the seller tool fit each viewport. At 375px selecting the saved creator `@2412ya` opened the result on the home route.
- Switched a calculator configured for the LED mask and a $41.23 retail price between both languages. The selection, input and $0.78 sample net result survived both switches. The local web build also exercised the scanner view, which the public archive edition routes back to shopping.
- The source build, type check and all 260 automated tests passed. The public Pages deployment is `2f5e4dd`.
- After publication, the installed iPhone 13 app opened the Chinese home page. Tapping English changed the hero and search button, and English persisted after force-quitting and relaunching. Tapping 中文 restored the Chinese screen. The app revalidates its entry HTML on launch and retry; fingerprinted assets use the normal cache.
- On a connected iPhone 13, an uncatalogued search for `epicgarden` displayed the unavailable state. The phone could open GitHub Pages and reach the TikHub API host. Its connection to the project lookup host failed during TLS negotiation before an HTTP response. A Mac request to the project endpoint returned matching accounts. Further backend provisioning was deferred by the owner.

The before and after captures in this directory show the mobile home, seller calculator and desktop seller layout. The iPhone failure capture records the observed search result.
