export function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = "", className = ""): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}

export function link(text: string, url: string, className = "") {
  const a = el("a", text, className);
  a.href = url;
  if (!url.startsWith("#")) {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  }
  return a;
}

export function money(amount: number, currency: string) {
  return new Intl.NumberFormat(currency === "GBP" ? "en-GB" : "en-US", { style: "currency", currency }).format(amount);
}

export function details(label: string, ...content: HTMLElement[]) {
  const box = el("details", "", "shop-disclosure");
  box.append(el("summary", label), ...content);
  return box;
}
