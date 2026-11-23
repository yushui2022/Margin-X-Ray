import { PRODUCT_ARCHIVE, PRODUCT_OBSERVATION, money } from "./creator-products";
import { PUBLIC_CREATORS } from "../shared/creator-directory";

type Record = (typeof PRODUCT_ARCHIVE)[number];
const profiles = new Map(PUBLIC_CREATORS.map(profile => [profile.handle, profile]));

function el<K extends keyof HTMLElementTagNameMap>(tag: K, css: string, text?: string) {
  const element = document.createElement(tag);
  element.className = css;
  if (text !== undefined) element.textContent = text;
  return element;
}

function recordHref(product: Record) {
  return `#creator/${encodeURIComponent(`@${product.handle}`)}/products/${encodeURIComponent(product.id)}`;
}

/** The featured receipt uses the same observed facts as its source card. */
export function priceReceipt() {
  const product = PRODUCT_ARCHIVE.find(item => item.id === "nimya-cream") ?? PRODUCT_ARCHIVE[0];
  const stage = el("aside", "receipt-stage");
  if (!product) return stage;
  const link = el("a", "price-receipt");
  link.href = recordHref(product);
  const byline = el("div", "receipt-byline");
  const stamp = el("img", "archive-stamp");
  stamp.src = "assets/mascot/onion-date-stamp.webp"; stamp.alt = "";
  stamp.width = 24; stamp.height = 25;
  const date = el("time", "", new Intl.DateTimeFormat("en-US", {year:"numeric", month:"short", day:"numeric", timeZone:"UTC"}).format(new Date(PRODUCT_OBSERVATION)));
  date.dateTime = PRODUCT_OBSERVATION;
  byline.append(stamp, el("span", "", "Price on record"), date);
  const subject = el("div", "receipt-subject");
  subject.append(el("h2", "", product.name));
  const facts = el("div", "receipt-amount");
  facts.append(el("strong", "", money(product.price.amount, product.price.currency)), el("span", "", product.price.market));
  const foot = el("div", "receipt-foot");
  foot.append(el("span", "", `@${product.handle}`), el("b", "", "View sources →"));
  link.append(byline, subject, facts, foot);
  stage.append(link);
  return stage;
}

export function priceArchive() {
  const section = el("section", "archive-panel");
  section.setAttribute("aria-label", "Price archive");
  const tools = el("div", "archive-controls");
  const label = el("label", "", "Currency ");
  const select = el("select", "");
  select.add(new Option("All currencies", "all"));
  for (const currency of new Set(PRODUCT_ARCHIVE.map(item => item.price.currency))) select.add(new Option(currency, currency));
  label.append(select);
  const count = el("span", "");
  count.setAttribute("role", "status");
  tools.append(count, label);
  const grid = el("div", "archive-grid");
  const columns = el("div", "archive-columns");
  columns.setAttribute("aria-hidden", "true");
  columns.append(...["Creator", "Product & variant", "Recorded price"].map(label => el("span", "", label)));
  const empty = el("p", "archive-empty", "No matching prices. Try another product, creator or currency.");
  section.append(tools, columns, grid, empty);
  function update(query: string, currency: string) {
    select.value = currency;
    const term = query.trim().toLowerCase().replace(/^@/, "");
    const records = PRODUCT_ARCHIVE.filter(item => (currency === "all" || item.price.currency === currency) &&
      [item.name, item.variant, item.handle, profiles.get(item.handle)?.name].some(field => field?.toLowerCase().includes(term)));
    count.textContent = `${records.length} of ${PRODUCT_ARCHIVE.length} price records`;
    empty.hidden = records.length > 0;
    columns.hidden = records.length === 0;
    grid.replaceChildren(...records.map(product => {
      const link = el("a", "archive-record");
      link.href = recordHref(product);
      const owner = el("div", "archive-owner");
      const profile = profiles.get(product.handle);
      if (profile) {
        const img = el("img", "");
        img.src = profile.image; img.alt = ""; img.width = img.height = 32;
        owner.append(img);
      }
      owner.append(el("span", "", `@${product.handle}`));
      const foot = el("div", "archive-record-foot");
      foot.append(el("strong", "", money(product.price.amount, product.price.currency)), el("span", "", `${product.sources.length} ${product.sources.length === 1 ? "source" : "sources"} →`));
      const subject = el("div", "archive-record-subject");
      subject.append(el("h3", "", product.name), el("p", "", product.variant));
      link.append(owner, subject, foot);
      return link;
    }));
  }
  return { section, select, count, update };
}
