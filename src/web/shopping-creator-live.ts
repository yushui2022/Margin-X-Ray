import { publicUrl, tiktokListing } from "../shared/shopping-links";
import { el, link, money } from "./shop-dom";

interface LiveProduct {
  productId: string;
  name: string;
  url: string;
  sourceUrl: string;
  variant: string | null;
  price: number | null;
  currency: string | null;
  comparison: {
    price: number;
    currency: string;
    basis: "exact" | "similar";
    shopCount: number;
    score: number | null;
  } | null;
}

interface LiveCreator {
  handle: string;
  name?: string;
  avatar?: string;
  profileUrl: string;
  observedAt: string;
  status: "priced" | "identified" | "no_evidence" | "partial";
  bio: string;
  sample: { checked: number; limit: number };
  posts: { url: string; caption: string }[];
  products: LiveProduct[];
  score: number | null;
}

function sourcePost(raw: string, handle: string) {
  const url = publicUrl(raw);
  if (!url || url.protocol !== "https:" || !/^(?:(?:www|m)\.)?tiktok\.com$/.test(url.hostname)) return;
  const author = /^\/@([\w.]+)\/(?:video|photo)\/\d+\/?$/.exec(url.pathname)?.[1];
  if (author?.toLowerCase() === handle) return url.href;
}

function hasPrice(price: number | null, currency: string | null): price is number {
  return price !== null && Number.isFinite(price) && price > 0 && Boolean(currency && /^[A-Z]{3}$/.test(currency));
}

function hasScore(score: number | null): score is number {
  return score !== null && Number.isFinite(score) && score >= 0 && score <= 100;
}

function comparable(product: LiveProduct) {
  const peer = product.comparison;
  return peer && peer.shopCount > 0 && ["exact","similar"].includes(peer.basis)
    && hasPrice(peer.price, peer.currency) && hasPrice(product.price, product.currency)
    && peer.currency === product.currency ? peer : null;
}

function productCard(product: LiveProduct, handle: string) {
  const card = el("article", "", "shop-receipt shop-live-product");
  card.append(el("h3", product.name || "Linked TikTok Shop product"));
  if (product.variant) card.append(el("p", product.variant, "shop-small"));
  if (hasPrice(product.price, product.currency)) {
    const price = el("div", "", "shop-live-price");
    price.append(el("span", "Original shop"), el("strong", money(product.price, product.currency!)));
    card.append(price);
    const peer = comparable(product);
    if (peer) {
      const basis = peer.basis === "exact" ? "Verified same item" : "Similar-item estimate";
      const shops = peer.shopCount + (peer.shopCount === 1 ? " other shop" : " other shops");
      card.append(el("p", basis + " · " + money(peer.price, peer.currency) + " · " + shops));
      const gap = Math.round(product.price * 100) - Math.round(peer.price * 100);
      if (gap > 0 && peer.basis === "exact") card.append(el("p", "Switch shops and save " + money(gap / 100, peer.currency) + " on the item."));
      else if (gap) card.append(el("p", "The original item price is " + money(Math.abs(gap) / 100, peer.currency) + (gap > 0 ? " higher." : " lower.")));
      else card.append(el("p", "Both item prices match."));
      if (hasScore(peer.score)) card.append(el("p", (peer.basis === "similar" ? "Reference item score" : "Item score") + " · " + peer.score + "/100", "shop-small"));
    } else card.append(el("p", "A price score needs a comparable offer from another shop.", "shop-small"));
  } else card.append(el("p", "The listing has no confirmed item price in this check.", "shop-small"));
  const sources = el("div", "", "shop-live-links");
  const url = publicUrl(product.url);
  if (url && url.protocol === "https:" && tiktokListing(url)) sources.append(link("Open shop listing ↗", url.href, "shop-source-link"));
  const post = sourcePost(product.sourceUrl, handle);
  if (post) sources.append(link("Original TikTok post ↗", post, "shop-source-link"));
  if (sources.childElementCount) card.append(sources);
  return card;
}

function creatorReport(data: LiveCreator) {
  const body = document.createDocumentFragment();
  const handle = data.handle.toLowerCase();
  const meta = el("div", "", "shop-byline");
  if (data.avatar?.startsWith("https://")) {
    const avatar = el("img", "", "shop-avatar");
    avatar.alt = "";
    avatar.width = avatar.height = 40;
    avatar.referrerPolicy = "no-referrer";
    avatar.src = data.avatar;
    meta.append(avatar);
  }
  if (data.name && data.name.toLowerCase() !== handle) meta.append(el("strong", data.name));
  meta.append(link("@" + handle + " on TikTok ↗", "https://www.tiktok.com/@" + encodeURIComponent(handle)));
  const checked = new Date(data.observedAt);
  if (Number.isFinite(checked.getTime())) {
    const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
    const time = el("time", "Checked " + date.format(checked) + " UTC", "shop-small");
    time.dateTime = data.observedAt;
    meta.append(time);
  }
  body.append(meta);
  if (data.bio) body.append(el("p", data.bio, "shop-lede"));
  const stats = el("div", "", "shop-sample");
  const score = hasScore(data.score) && data.products.some(product => comparable(product)) ? data.score + "/100" : "Unrated";
  for (const [value, label] of [[String(data.sample.checked), "Posts checked"], [String(data.products.length), "Linked products"], [score, "Onion Index"]]) {
    const stat = el("div");
    stat.append(el("strong", value), el("span", label));
    stats.append(stat);
  }
  body.append(stats);
  if (data.products.length) {
    body.append(el("h2", "Linked products"), ...data.products.map(product => productCard(product, handle)));
  } else {
    const finding = data.sample.checked > 0 ? "No TikTok Shop product link was found in the posts checked."
      : data.status === "partial" ? "Account found. Recent posts could not be verified in this check." : "No public posts were returned for this account.";
    body.append(el("p", finding));
  }
  if (data.posts.length) {
    const list = el("ol", "", "shop-sampled-posts");
    for (const post of data.posts) {
      const url = sourcePost(post.url, handle);
      if (!url) continue;
      const row = el("li");
      row.append(link(post.caption || "Open TikTok post ↗", url, "shop-source-link"));
      list.append(row);
    }
    if (list.childElementCount) body.append(el("h2", "Posts checked"), list);
  }
  return body;
}

export function liveCreatorPage(handle: string, endpoint: string, signal: AbortSignal): HTMLElement {
  const main = el("section", "", "shop-page shop-narrow");
  const status = el("p", "", "shop-progress");
  status.setAttribute("role", "status");
  const results = el("div");
  const retry = el("button", "Retry lookup", "btn ghost");
  retry.type = "button";
  retry.hidden = true;
  main.append(link("← Search creators", "#shop", "shop-back"), el("p", "TikTok creator lookup", "shop-kicker"),
    el("h1", "@" + handle), status, results, retry);

  async function lookup() {
    if (signal.aborted || retry.disabled) return;
    retry.disabled = true;
    status.classList.add("is-working");
    status.textContent = "Checking this TikTok profile and its recent posts…";
    results.setAttribute("aria-busy", "true");
    try {
      const response = await fetch(endpoint.replace(/\/$/, "") + "/api/creators/" + encodeURIComponent(handle), {
        signal, credentials: "omit", headers: { Accept: "application/json" },
      });
      if (signal.aborted) return;
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        if (signal.aborted) return;
        const code = error?.code;
        if (code === "not_found") status.textContent = "No public TikTok profile was found for @" + handle + ". Check the spelling and search again.";
        else if (code === "inaccessible") status.textContent = "TikTok could not return public posts from this account.";
        else if (code === "invalid_handle") status.textContent = "This username could not be checked. Enter the account’s exact TikTok username.";
        else if (code === "busy") status.textContent = "A check for this creator is already running. Try again shortly.";
        else if (code === "rate_limited" || response.status === 429) status.textContent = "The live lookup limit has been reached. Please try again later.";
        else status.textContent = "The lookup service could not finish this check. Please try again.";
        retry.hidden = code === "invalid_handle" || code === "not_found";
        return;
      }
      const data: LiveCreator = await response.json();
      if (signal.aborted) return;
      if (data?.handle?.toLowerCase() !== handle.toLowerCase() || !Array.isArray(data.products) || !Array.isArray(data.posts)
        || !Number.isInteger(data.sample?.checked)) throw new Error("Incomplete creator response");
      results.replaceChildren(creatorReport(data));
      const partial = data.status === "partial";
      status.textContent = partial ? "Partial check. Some posts or shop details could not be retrieved." : "Creator lookup complete.";
      retry.hidden = !partial;
    } catch {
      if (!signal.aborted) {
        status.textContent = "Couldn’t load the live creator check. Check your connection and try again.";
        retry.hidden = false;
      }
    } finally {
      retry.disabled = false;
      status.classList.remove("is-working");
      results.setAttribute("aria-busy", "false");
    }
  }
  retry.addEventListener("click", lookup, { signal });
  void lookup();
  return main;
}
