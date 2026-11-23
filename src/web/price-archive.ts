import { PRODUCT_ARCHIVE, PRODUCT_OBSERVATION } from "./creator-products";
import { PUBLIC_CREATORS } from "../shared/creator-directory";
import { retailComparisons, type RetailComparison } from "../shared/retail-premium";
import { productHref } from "../shared/shopping-links";
import { money } from "./shop-dom";

type ArchiveProduct = (typeof PRODUCT_ARCHIVE)[number];
const profiles = new Map(PUBLIC_CREATORS.map(profile => [profile.handle, profile]));
const receiptDate = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

function node<K extends keyof HTMLElementTagNameMap>(tag: K, css: string, text?: string) {
  const element = document.createElement(tag);
  element.className = css;
  if (text !== undefined) element.textContent = text;
  return element;
}

function observedDate(value: string) {
  const date = node("time", "", receiptDate.format(new Date(value)));
  date.dateTime = value;
  return date;
}

function identity(handle: string) {
  const byline = node("div", "pa-identity");
  const creator = profiles.get(handle);
  if (creator?.image) {
    const avatar = node("img", "");
    avatar.src = creator.image;
    avatar.alt = "";
    avatar.width = avatar.height = 32;
    byline.append(avatar);
  }
  const user = node("span", "", "@" + handle);
  user.translate = false;
  byline.append(user);
  return byline;
}

function quote(seller: string, amount: number, currency: string, cheaper: boolean) {
  const tile = node("div", "pa-quote" + (cheaper ? " pa-quote-low" : ""));
  const name = node("span", "", seller);
  name.translate = false;
  tile.append(name, node("b", "", money(amount, currency)));
  return tile;
}

function comparisonCard(row: RetailComparison, featured: boolean) {
  const link = node("a", "pa-pair" + (featured ? " pa-feature" : ""));
  link.href = productHref(row.productId);
  const delivered = row.status === "delivered";
  const verified = delivered || row.status === "item-only";
  const lower = row.delta !== null && row.delta > 0 ? row.alternative : row.reference;
  const heading = node("div", "pa-pair-heading");
  const title = node("h3", "", row.name);
  title.translate = false;
  const variant = node("p", "pa-variant", row.variant);
  variant.translate = false;
  const byline = identity(row.handle);
  const relationship = { "founder-store": "Founder’s brand", "creator-offer": "Creator offer", "retail-reference": "Retail reference" }[row.relation];
  byline.append(node("span", "pa-affiliation", relationship));
  heading.append(byline, title, variant);
  if (row.productId === "arun-sony") {
    const photo = node("img", "pa-product-image");
    photo.src = "assets/products/sony-wf1000xm6-silver.webp";
    photo.alt = "";
    photo.width = photo.height = 74;
    heading.append(photo);
  }
  const result = node("div", "pa-result");
  let resultLabel: string;
  if (!verified) resultLabel = row.status === "stale" ? "Past shop quotes" : "Comparison pending";
  else if (!row.delta) resultLabel = delivered ? "Same delivered price" : "Same item price";
  else if (delivered) resultLabel = row.delta > 0 ? "Delivered savings" : "Delivered price difference";
  else resultLabel = "Item price difference";
  result.append(node("span", "pa-result-label", resultLabel));
  if (verified && row.delta !== null && row.delta !== 0) {
    const store = node("span", "pa-lower-store", lower.seller);
    store.translate = false;
    const destination = node("span", "pa-lower");
    destination.append(node("span", "pa-lower-label", "Less at"), store);
    result.append(node("strong", "pa-difference", money(Math.abs(row.delta), row.currency)), destination);
  }

  const quotes = node("div", "pa-quotes");
  for (const offer of [row.reference, row.alternative]) {
    // assessRetailComparison checks shipping and tax for both offers before returning "delivered".
    const total = delivered ? (Math.round(offer.amount * 100) + Math.round(offer.shipping! * 100)) / 100 : offer.amount;
    quotes.append(quote(offer.seller, total, row.currency, verified && !!row.delta && lower === offer));
  }
  const context = node("div", "pa-pair-context");
  const market = node("span", "pa-market", row.market);
  const scope = !verified ? (row.status === "stale" ? "Dated quotes · recheck before buying" : "Two comparable totals still needed")
    : delivered ? "Tax and standard delivery included" : "Item prices only · delivery unconfirmed";
  context.append(market, node("span", "pa-sep", "·"), node("span", "", scope));
  if (delivered && row.delta !== 0 && row.reference.amount === row.alternative.amount) {
    context.append(node("span", "pa-shipping-note", "Shipping accounts for the difference."));
  }
  const foot = node("div", "pa-pair-foot");
  const dates = node("span", "pa-dates");
  dates.append(observedDate(row.reference.observedAt));
  if (row.reference.observedAt !== row.alternative.observedAt) dates.append(" / ", observedDate(row.alternative.observedAt));
  foot.append(dates, node("b", "", "See both offers →"));
  link.append(heading, result, quotes, context, foot);
  return link;
}

function recordCard(product: ArchiveProduct) {
  const link = node("a", "pa-record archive-record");
  link.href = "#creator/" + encodeURIComponent("@" + product.handle) + "/products/" + encodeURIComponent(product.id);
  const heading = node("div", "pa-record-heading");
  const title = node("h3", "", product.name);
  const variant = node("span", "pa-variant", product.variant);
  title.translate = variant.translate = false;
  heading.append(identity(product.handle), title, variant);
  const price = node("div", "pa-record-price");
  price.append(node("span", "", product.price.market), node("b", "", money(product.price.amount, product.price.currency)),
    node("span", "pa-record-source", product.sources.length + (product.sources.length === 1 ? " source →" : " sources →")));
  link.append(heading, price);
  return link;
}

export function priceArchive() {
  const section = node("section", "price-archive");
  section.setAttribute("aria-label", "Price archive");
  const toolbar = node("div", "pa-toolbar");
  const label = node("label", "pa-filter");
  label.append(node("span", "pa-filter-label", "Currency"));
  const select = node("select", "");
  select.add(new Option("All currencies", "all"));
  const comparisons = retailComparisons();
  // Start with a creator-linked brand store whose retail and delivery charges are documented.
  const featured = comparisons.find(row => row.productId === "kylie-matte" && row.status === "delivered");
  if (featured) comparisons.unshift(...comparisons.splice(comparisons.indexOf(featured), 1));
  for (const currency of new Set([...PRODUCT_ARCHIVE.map(item => item.price.currency), ...comparisons.map(row => row.currency)])) {
    select.add(new Option(currency, currency));
  }
  label.append(select);
  const count = node("nav", "pa-count");
  count.setAttribute("aria-label", "Jump to archive results");
  toolbar.append(count, label);

  const paired = node("section", "pa-comparisons");
  const pairs = node("div", "pa-pairs");
  const comparedTitle = node("h2", "pa-section-title", "Shop comparisons");
  comparedTitle.id = "archive-comparison-title";
  paired.append(comparedTitle, pairs);
  const history = node("section", "pa-history");
  const header = node("header", "pa-history-heading");
  const recordsTitle = node("h2", "pa-section-title", "Recorded item prices");
  recordsTitle.id = "archive-records-title";
  header.append(recordsTitle, observedDate(PRODUCT_OBSERVATION));
  const note = node("p", "pa-history-note", "Single listing prices. Shipping and cross-shop savings are unconfirmed.");
  const list = node("div", "pa-records");
  history.append(header, note, list);
  const empty = node("p", "pa-empty", "No matching prices. Try another product, creator or currency.");
  section.append(toolbar, paired, history, empty);

  function jumpTo(heading: HTMLHeadingElement) {
    const button = node("button", "pa-jump");
    button.type = "button";
    button.setAttribute("aria-controls", heading.id);
    heading.tabIndex = -1;
    button.addEventListener("click", () => {
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({ block: "start" });
    });
    return button;
  }
  const jumpToChecks = jumpTo(comparedTitle);
  const jumpToRecords = jumpTo(recordsTitle);
  const announcements = node("span", "pa-announcement");
  announcements.setAttribute("role", "status");
  toolbar.append(announcements);
  count.append(jumpToChecks, node("span", "pa-sep", "·"), jumpToRecords);

  function update(query: string, currency: string) {
    select.value = currency;
    const term = query.trim().toLowerCase().replace(/^@/, "");
    const matches = (code: string, handle: string, fields: string[]) => (currency === "all" || code === currency) &&
      [handle, profiles.get(handle)?.name, ...fields].some(field => field?.toLowerCase().includes(term));
    const checks = comparisons.filter(row => matches(row.currency, row.handle,
      [row.name, row.variant, row.market, row.reference.seller, row.alternative.seller]));
    const records = PRODUCT_ARCHIVE.filter(item => matches(item.price.currency, item.handle, [item.name, item.variant, item.price.market]));
    const checksLabel = checks.length === 1 ? "comparison" : "comparisons";
    const recordsLabel = records.length === 1 ? "record" : "records";
    jumpToChecks.replaceChildren(node("b", "", String(checks.length)), " ", node("span", "", checksLabel));
    jumpToRecords.replaceChildren(node("b", "", String(records.length)), " ", node("span", "", recordsLabel));
    jumpToChecks.disabled = !checks.length;
    jumpToRecords.disabled = !records.length;
    announcements.replaceChildren(String(checks.length) + " ", node("span", "", checksLabel), " · " + records.length + " ", node("span", "", recordsLabel));
    empty.hidden = !!(checks.length || records.length);
    paired.hidden = !checks.length;
    history.hidden = !records.length;
    pairs.replaceChildren(...checks.map((row, index) => comparisonCard(row, index === 0)));
    list.replaceChildren(...records.map(recordCard));
  }
  return { section, select, count, update };
}
