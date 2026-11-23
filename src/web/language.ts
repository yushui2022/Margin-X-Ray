type Language = "en" | "zh-Hans";
type Copy = { english: string; shown: string };

const preference = "onion-head.language";
const textCopies = new WeakMap<Text, Copy>();
const attributeCopies = new WeakMap<Element, Map<string, Copy>>();
const attributes = ["aria-label", "aria-description", "aria-valuetext", "placeholder", "title", "alt"];
// These nodes contain verbatim identities, listings and captions. The surrounding
// interface and its accessible action labels can still be localized.
const sourceContent = [
  '[translate="no"]', "script", "style", "code", "textarea", "svg", "[contenteditable=true]",
  ".shop-creator-name", ".shop-archive-identity", ".shop-archive-product", ".shop-archive-post",
  ".shop-rank-identity", ".shop-inline-item", ".edition-name", ".edition-product > strong",
  ".lookup-account", ".creator-report-name", ".shop-sampled-posts a", ".creator-caption",
  ".creator-identity strong", ".shop-live-product > h3", ".shop-live-product > h3 + .shop-small",
  ".shop-byline + .shop-lede", ".scored-receipt-product h3",
].join(",");

let language: Language = "en";
let translateZh: ((english: string) => string) | undefined;
export function uiText(english: string): string {
  return language === "zh-Hans" && translateZh ? translateZh(english) : english;
}

export function preferredLanguage(saved: string | null, languages: readonly string[]): Language {
  if (saved === "en" || saved === "zh-Hans") return saved;
  for (const tag of languages) {
    if (/^zh(?:-|$)/i.test(tag)) return "zh-Hans";
    if (/^en(?:-|$)/i.test(tag)) return "en";
  }
  return "en";
}

function updateText(node: Text) {
  const current = node.data;
  const copy = textCopies.get(node);
  const english = copy?.shown === current ? copy.english : current;
  const shown = uiText(english);
  if (shown !== english) textCopies.set(node, {english, shown});
  else textCopies.delete(node);
  if (current === shown) return;
  // An option without a value submits its text. Freeze the original value so
  // switching languages never changes the product, currency or sort selection.
  const parent = node.parentElement;
  if (parent instanceof HTMLOptionElement && !parent.hasAttribute("value")) parent.setAttribute("value", parent.value);
  node.data = shown;
}

function updateAttribute(element: Element, key: string) {
  const current = element.getAttribute(key);
  if (current === null) { attributeCopies.get(element)?.delete(key); return; }
  const copy = attributeCopies.get(element)?.get(key);
  const english = copy?.shown === current ? copy.english : current;
  const shown = uiText(english);
  if (shown !== english) {
    let records = attributeCopies.get(element);
    if (!records) { records = new Map(); attributeCopies.set(element, records); }
    records.set(key, {english, shown});
  } else attributeCopies.get(element)?.delete(key);
  if (current !== shown) element.setAttribute(key, shown);
}

function updateTree(node: Node) {
  if (node instanceof Text) { if (!node.parentElement?.closest(sourceContent)) updateText(node); return; }
  if (!(node instanceof Element) || node.closest(sourceContent)) return;
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: item => item instanceof Element && item.matches(sourceContent) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  do {
    const item = walker.currentNode;
    if (item instanceof Text) updateText(item);
    else if (item instanceof Element) for (const key of attributes) if (item.hasAttribute(key)) updateAttribute(item, key);
  } while (walker.nextNode());
}

export function initLanguage(button: HTMLButtonElement) {
  let requested: Language = "en";
  const title = document.querySelector("title")!;
  async function select(next: Language) {
    requested = next;
    const toChinese = next === "en";
    button.lang = toChinese ? "zh-Hans" : "en";
    button.querySelector("span")!.textContent = toChinese ? "中文" : "English";
    button.setAttribute("aria-label", toChinese ? "切换到简体中文 · Switch to Simplified Chinese" : "Switch to English · 切换到英语");
    if (!toChinese && !translateZh) {
      try { translateZh = (await import("./i18n-zh")).translateChinese; }
      catch { if (requested === next) void select("en"); return; }
    }
    if (requested !== next || language === next) return;
    language = next;
    document.documentElement.lang = next;
    updateTree(title);
    updateTree(document.body);
  }
  const observer = new MutationObserver(changes => {
    if (!translateZh) return;
    for (const change of changes) {
      if (change.type === "childList") {
        for (const child of change.addedNodes) updateTree(child);
      } else if (change.type === "characterData") updateTree(change.target);
      else if (change.target instanceof Element && change.attributeName && !change.target.closest(sourceContent))
        updateAttribute(change.target, change.attributeName);
    }
  });
  observer.observe(document.body, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:attributes});
  observer.observe(title, {subtree:true, childList:true, characterData:true});
  button.addEventListener("click", () => {
    const next = requested === "en" ? "zh-Hans" : "en";
    localStorage.setItem(preference, next);
    void select(next);
  });
  void select(preferredLanguage(localStorage.getItem(preference), navigator.languages));
}
