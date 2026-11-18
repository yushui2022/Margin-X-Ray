import { PRICE_CHECK_VERSION, PRICE_WINDOW_DAYS, type assessPrice } from "../shared/price-comparison";
import { HIGH_PRICE_MULTIPLE } from "../shared/product-markup";

type Assessment = ReturnType<typeof assessPrice>;
const titles = {
  high: "High across supplier offers",
  below: "Below the high-gap threshold",
  mixed: "The gap depends on the supplier",
  single: "One comparable supplier",
  pending: "Supplier comparison pending",
};

export function rangeLabel(check: Assessment) {
  if (check.min === undefined || check.max === undefined) return "Pending";
  const format = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return check.min === check.max ? `${format(check.min)}×` : `${format(check.min)}–${format(check.max)}×`;
}

export function supplierRange(check: Assessment, currency: string, unit: string, date: string, retailUrl: string) {
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 4 });
  const panel = document.createElement("section");
  panel.className = "supplier-range";
  panel.dataset.state = check.status;
  const summary = document.createElement("div");
  const title = document.createElement("h2"); title.textContent = titles[check.status];
  const multiple = document.createElement("strong"); multiple.textContent = rangeLabel(check);
  const explanation = document.createElement("p");
  const eligible = check.sources;
  if (eligible.length) {
    const highCount = eligible.filter(row => row.comparison.high).length;
    explanation.textContent = `${highCount} of ${eligible.length} supplier ${eligible.length === 1 ? "offers reaches" : "offers reach"} the provisional ${HIGH_PRICE_MULTIPLE}× threshold.`;
  } else explanation.textContent = check.excluded[0]?.reason ?? "A matched supplier offer with a pack price and item count is needed.";
  summary.append(title, multiple, explanation);
  const evidence = document.createElement("div"); evidence.className = "range-evidence";
  const receipt = document.createElement("a");
  receipt.href = retailUrl; receipt.target = "_blank"; receipt.rel = "noopener noreferrer";
  const price = eligible[0]?.comparison.salePerUnit;
  receipt.textContent = price === undefined ? `Retail listing · ${date} ↗` : `Retail ${money.format(price)} per ${unit} · ${date} ↗`;
  evidence.append(receipt);
  for (const { offer, comparison } of eligible) {
    const row = document.createElement("a"); row.href = offer.url; row.target = "_blank"; row.rel = "noopener noreferrer";
    const name = document.createElement("span"); name.textContent = offer.label;
    const price = document.createElement("b"); price.textContent = `${money.format(comparison.quotePerUnit)} ↗`;
    row.append(name, price); evidence.append(row);
  }
  const method = document.createElement("details");
  const toggle = document.createElement("summary"); toggle.textContent = "How this range is calculated";
  const rule = document.createElement("p");
  rule.textContent = `${PRICE_CHECK_VERSION} divides the retail price per ${unit} by each comparable supplier price per ${unit}. Offers must match the variant, market and currency within ${PRICE_WINDOW_DAYS} days of the retail observation. Each supplier counts once. A high-gap finding requires at least two suppliers and every multiple at or above ${HIGH_PRICE_MULTIPLE}×.`;
  method.append(toggle, rule);
  for (const { offer, comparison } of eligible) {
    const item = document.createElement("p");
    item.textContent = `${offer.label} · ${offer.observedAt} · ${money.format(offer.amount!)} ÷ ${offer.units} = ${money.format(comparison.quotePerUnit)} per ${unit}. ${offer.note}`;
    method.append(item);
  }
  for (const excluded of check.excluded) {
    const item = document.createElement("p"); item.textContent = `${excluded.label} · ${excluded.reason}`; method.append(item);
  }
  panel.append(summary, evidence, method);
  return panel;
}
