# Creator suggestions after input and focus changes

On the published homepage, typing `tomsun` directly returned six TikTok accounts. At 375 and 815 px, Chrome hit testing found the first result under the pointer. The same query left a focused field and a hidden popup when committed through an input method. Chrome emitted two composing input events followed by `compositionend`, with no ordinary input event. Dispatching window blur and focus events while the field retained focus also reproduced the empty space below the search box.

| Project rubric | Before | After | Evidence |
| --- | ---: | ---: | --- |
| Task access and hierarchy | 6 | 9 | Committing the query through Chrome’s input-method interface now displays the candidates beneath the field. |
| Brand and visual composition | 9 | 9 | The picker remains aligned with the text field and displays the existing account portraits and names. |
| Readability and information density | 8 | 9 | Each result shows a display name and handle. The picker also provides feedback when the remote lookup fails or has no results. |
| Interaction and feedback | 5 | 9 | After returning window focus the choices remain visible. Clicking outside or tabbing away dismisses them. Escape closes the menu, and clicking the input or pressing Arrow Down reopens it. |
| Responsive behavior and accessibility | 7 | 9 | At all six widths the first choice passed pointer hit testing. Keyboard and pointer selection both opened the saved creator in place. |
| Weighted design judgment | 6.9 | 9.0 | Internal review of the account-suggestion path. |

Chrome checks ran at 320, 375, 768, 815, 1024 and 1440 px. Each browser session made one request for the committed query and received six real results. All six portraits decoded to 168 px at both screenshot widths. There was no horizontal overflow. For release-preview checks the browser loaded local build files under the permitted Pages origin and contacted the live suggestions service. Chrome’s input-method protocol drove composition. Blur and focus events represented switching windows. These checks cover that event sequence and do not certify every keyboard or native input method.

| Viewport | Issue reproduced | Revised picker |
| --- | --- | --- |
| 375 px | [Hidden after focus change](before-375.png) | [TikTok suggestions](after-375.png) |
| 815 px | [Hidden after focus change](before-815.png) | [TikTok suggestions](after-815.png) |

The [focused regression check](check-ime.cjs) exercises composition, focus, dismissal, reopening and selection with a saved account that can be checked independently of live TikTok suggestions.

The same six-width checks passed on the published site. The six portraits decoded in Chrome at 168 px. Simulated empty and unavailable provider responses exercised the direct handle option, retry and saved matches during an outage. [Pages deployment](https://github.com/yushui2022/Margin-X-Ray/actions/runs/45116475256)
