import { creatorPremium, retailComparison } from "../shared/retail-premium";
import { productHref } from "../shared/shopping-links";
import { el, money as amount } from "./shop-dom";
import { CREATOR_SHOP_PRODUCTS, money } from "./creator-products";

export function premiumSummary(handle: string, compact = false) {
  const data = creatorPremium(handle);
  const summary = el("div", undefined, compact ? "creator-premium is-compact" : "creator-premium");
  summary.append(el("span", "Price premium index", "premium-label"));
  const reading = data.value === null ? "Insufficient matches" : `${data.value.toFixed(1)} / 100`;
  summary.append(el("strong", reading));
  const count = data.identified ? `${data.matched} of ${data.identified} product ${data.identified === 1 ? "family" : "families"} eligible` : "No identified product families";
  summary.append(el("small", count));
  if (!compact) {
    const details = el("details", undefined, "premium-method");
    details.append(el("summary", "How the index works"), el("p", `At least ${data.minimum} product families need a documented creator or founder-store price and a matching consumer offer, including delivery and tax. We take the median premium for each family, then the median across families. A positive median of p% gives 100 × p ÷ (100 + p) index points. A median at or below parity gives 0. ${data.version}.`));
    if (data.selection) details.append(el("p", data.selection));
    if (data.medianPremium !== null) details.append(el("p", `Median premium in the eligible sample: ${data.medianPremium.toFixed(1)}%.`));
    if (data.value !== null) {
      const list = el("ul", undefined, "premium-inputs");
      const included = data.includedProductIds.map(id => retailComparison(id)).filter(record => record !== undefined);
      for (const record of included) {
        const a = record.reference, b = record.alternative;
        const entry = el("li");
        const link = el("a", record.name);
        link.href = productHref(record.productId);
        entry.append(link, el("span", `${a.seller} ${amount(a.amount + a.shipping!, record.currency)} · ${b.seller} ${amount(b.amount + b.shipping!, record.currency)} · ${record.premiumPercent!.toFixed(1)}% premium`));
        list.append(entry);
      }
      if (included.length && included.every(record => record.reference.amount === record.alternative.amount) && included.some(record => record.delta !== 0)) {
        details.append(el("p", "The item prices match at both shops for every product in this sample. Standard shipping accounts for the differences in delivered price."));
      }
      details.append(list);
    }
    summary.append(details);
  }
  return summary;
}

/** Archive references keep their seller/creator relationship and original observation date. */
export function creatorShopProducts(handle: string) {
  const section = el("section", undefined, "creator-shop-products");
  const records = CREATOR_SHOP_PRODUCTS.filter(product => product.handle === handle)
    .map(product => ({ product, check: retailComparison(product.id) }))
    .sort((a, b) => (b.product.promotionDate ?? "").localeCompare(a.product.promotionDate ?? "") ||
      (b.check?.reference.observedAt ?? b.product.observedAt).localeCompare(a.check?.reference.observedAt ?? a.product.observedAt) ||
      a.product.name.localeCompare(b.product.name));
  section.append(el("h2", "Choose a product"));
  if (!records.length) {
    section.append(el("p", "No priced product is on file for this creator. Search their public posts for a product mention, or check a specific video or listing."));
    return section;
  }
  const list = el("ul", undefined, "creator-shop-list");
  for (const { product, check } of records) {
    const row = el("li");
    const choice = el("a");
    choice.href = productHref(product.id);
    const facts = el("div", undefined, "creator-shop-product-facts");
    const delivered = check?.status === "delivered" && check.delta !== null;
    facts.append(el("small", product.relationship), el("strong", product.name), el("span", check?.variant ?? product.variant));
    if (product.promotionDate) facts.append(el("small", "Post dated " + product.promotionDate));
    const price = el("div", undefined, "creator-shop-product-price");
    if (delivered) {
      const lowest = check.delta! > 0 ? check.alternative : check.reference;
      price.append(el("span", [lowest.seller, check.market, lowest.observedAt].join(" · ")), el("strong", amount(lowest.amount + lowest.shipping!, check.currency) + " delivered"), el("small", "Compare retailers →"));
    } else if (check) {
      const label = check.status === "item-only" ? "Item price only" : "Recorded item price";
      price.append(el("span", [label, check.market, check.reference.observedAt].join(" · ")), el("strong", amount(check.reference.amount, check.currency)), el("small", "Review price evidence →"));
    } else {
      price.append(el("span", "Archive price · " + product.observedAt), el("strong", money(product.price.amount, product.price.currency)), el("small", "Check this item →"));
    }
    choice.append(facts, price);
    row.append(choice); list.append(row);
  }
  section.append(list);
  return section;
}
