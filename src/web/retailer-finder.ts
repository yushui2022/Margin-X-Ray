import { publicUrl } from "../shared/shopping-links";
import { details, el, link, money } from "./shop-dom";

interface Candidate {
  title: string; url: string; seller: string; amount: number; currency: string; shipping: number | null;
}

export function retailerFinder(signal: AbortSignal, choose: (url: string) => void) {
  const code = el("input");
  code.type = "text"; code.inputMode = "numeric"; code.required = true;
  code.pattern = "(?:[0-9]{8}|[0-9]{12,14})"; code.maxLength = 14;
  const codeLabel = el("label", "Barcode (UPC / EAN / GTIN)"); codeLabel.append(code);
  const market = el("select");
  market.add(new Option("United States", "US")); market.add(new Option("United Kingdom", "GB"));
  const marketLabel = el("label", "Shopping market"); marketLabel.append(market);
  const form = el("form", "", "shop-finder-form");
  const submit = el("button", "Find retail listings", "btn secondary"); submit.type = "submit";
  const message = el("p", "", "shop-small"); message.setAttribute("role", "status");
  const list = el("div");
  const manualSearch = () => {
    const base = market.value === "GB" ? "https://www.ebay.co.uk" : "https://www.ebay.com";
    return link("Open barcode search on eBay ↗", base + "/sch/i.html?" + new URLSearchParams({ _nkw: code.value, LH_BIN: "1", LH_ItemCondition: "1000" }), "shop-action-link");
  };
  form.append(codeLabel, marketLabel, submit);
  let requestNumber = 0;
  function clear() {
    requestNumber++;
    submit.disabled = false;
    message.textContent = "";
    list.replaceChildren();
  }
  form.addEventListener("input", clear);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const version = ++requestNumber;
    submit.disabled = true; list.replaceChildren();
    message.textContent = "Looking up fixed-price retail listings…";
    try {
      const res = await fetch("/api/consumer-offers", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gtin: code.value.trim(), market: market.value }), signal: AbortSignal.any([signal, AbortSignal.timeout(18000)]) });
      const data = await res.json();
      if (signal.aborted || version !== requestNumber) return;
      if (!res.ok) {
        message.textContent = data.error || "Retail search is temporarily unavailable.";
        if (res.status === 429 || res.status >= 500) list.append(manualSearch());
        return;
      }
      if (data.status === "not-configured") {
        message.textContent = "Open the marketplace search and paste a matching retailer’s listing below.";
        list.append(manualSearch()); return;
      }
      const options: Candidate[] = Array.isArray(data.offers) ? data.offers : [];
      message.textContent = options.length ? "Check the variant, pack and delivery at checkout before using a listing." : "No matching retail candidates were returned.";
      for (const item of options) {
        if (!publicUrl(item.url) || !Number.isFinite(item.amount)) continue;
        const row = el("article", "", "shop-finder-result");
        const use = el("button", "Use this listing", "btn secondary"); use.type = "button";
        use.addEventListener("click", () => choose(item.url));
        row.append(link(item.title + " ↗", item.url), el("p", item.seller + " · " + money(item.amount, item.currency) + " listed item price"), use);
        list.append(row);
      }
      if (!options.length) list.append(manualSearch());
    } catch {
      if (signal.aborted || version !== requestNumber) return;
      message.textContent = "Retail search is unavailable. You can still look up the barcode directly.";
      list.append(manualSearch());
    } finally { if (version === requestNumber) submit.disabled = false; }
  });
  const box = details("Find another store by barcode", form, message, list);
  return { box, setCode(value: string, currency?: string) {
    code.value = value;
    if (currency === "GBP" || currency === "USD") market.value = currency === "GBP" ? "GB" : "US";
    clear();
  } };
}
