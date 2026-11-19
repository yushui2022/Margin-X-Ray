import { validGtin } from "./creator-source-checks.mjs";
import { readShoppingRequest, sendJson, ShoppingError } from "./shopping-http.mjs";

const endpoint = "https://api.ebay.com";
const markets = { US: { id: "EBAY_US", currency: "USD" }, GB: { id: "EBAY_GB", currency: "GBP" } };
const unavailable = () => new ShoppingError(503, "Live marketplace search is temporarily unavailable. You can still compare two listings yourself.");

async function json(response, limit) {
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw unavailable();
  }
  const chunks = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw unavailable(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function money(record, currency) {
  if (record?.currency !== currency || typeof record.value !== "string" || !/^\d+(?:\.\d+)?$/.test(record.value)) return null;
  const value = Number(record.value);
  return Number.isFinite(value) ? value : null;
}

function sellerCandidates(items, currency) {
  const offers = new Map();
  for (const item of items.slice(0, 10)) {
    // Search groups may quote the cheapest variant. Restricted advertised
    // prices may be visible only at a later stage of the purchase flow.
    if (!item || item.itemGroupType || item.priceDisplayCondition || item.conditionId !== "1000" ||
      !item.buyingOptions?.includes("FIXED_PRICE") || !item.title?.trim()) continue;
    const url = URL.parse(item.itemWebUrl);
    if (!url || url.protocol !== "https:" || url.username || url.password || url.port ||
      !/^(?:www\.)?ebay\.(?:com|co\.uk)$/.test(url.hostname) || !/^\/itm\/(?:[^/]+\/)?\d+\/?$/.test(url.pathname)) continue;
    const amount = money(item.price, currency);
    if (amount === null || amount <= 0 || !item.itemId || offers.has(item.itemId)) continue;
    const shipping = item.shippingOptions?.filter(option => option?.shippingCostType === "FIXED")
      .map(option => money(option.shippingCost, currency)).filter(value => value !== null) ?? [];
    offers.set(item.itemId, {
      title: item.title.trim().slice(0, 200), url: url.href, seller: String(item.seller?.username ?? "").slice(0, 100),
      amount, currency, shipping: shipping.length ? Math.min(...shipping) : null,
    });
  }
  return [...offers.values()];
}

export function createConsumerOffers({
  clientId = process.env.EBAY_CLIENT_ID, clientSecret = process.env.EBAY_CLIENT_SECRET,
  fetchImpl = fetch, now = Date.now, dailyLimit = 150,
} = {}) {
  const cache = new Map(), active = new Map();
  let calls = [], token, pendingToken;

  async function accessToken() {
    if (token && token.expires > now()) return token.value;
    if (!pendingToken) {
      pendingToken = (async () => {
        const res = await fetchImpl(endpoint + "/identity/v1/oauth2/token", { method: "POST", redirect: "error",
          signal: AbortSignal.timeout(3500), headers: {
            Authorization: "Basic " + Buffer.from(clientId + ":" + clientSecret).toString("base64"),
            "Content-Type": "application/x-www-form-urlencoded",
          }, body: new URLSearchParams({ grant_type: "client_credentials", scope: "https://api.ebay.com/oauth/api_scope" }) });
        const data = await json(res, 16384);
        if (typeof data.access_token !== "string" || !data.access_token || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw unavailable();
        token = { value: data.access_token, expires: now() + Math.max(0, data.expires_in - 60) * 1000 };
        return token.value;
      })().finally(() => { pendingToken = undefined; });
    }
    return pendingToken;
  }

  async function browse(gtin, market) {
    const url = new URL("/buy/browse/v1/item_summary/search", endpoint);
    url.search = new URLSearchParams({ gtin, filter: "conditionIds:{1000},buyingOptions:{FIXED_PRICE},deliveryCountry:" + market, limit: "10" });
    let data;
    for (let attempt = 0; attempt < 2; attempt++) {
      const credential = await accessToken();
      const res = await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(5500),
        headers: { Authorization: "Bearer " + credential, "X-EBAY-C-MARKETPLACE-ID": markets[market].id, Accept: "application/json" } });
      if (res.status === 401 && attempt === 0) {
        await res.body?.cancel();
        if (token?.value === credential) token = undefined;
        continue;
      }
      data = await json(res, 256 * 1024);
      break;
    }
    if (!data || data.errors?.length || (!Array.isArray(data.itemSummaries) && data.total !== 0)) throw unavailable();
    const offers = sellerCandidates(data.itemSummaries ?? [], markets[market].currency);
    return { status: "ready", gtin, market, observedAt: new Date(now()).toISOString(), offers,
      message: offers.length
        ? "New, fixed-price eBay listings returned for this barcode. Confirm model, pack size, seller, delivery to your address and tax before comparing totals."
        : "This barcode search returned no eligible, individually priced listings in this market." };
  }

  return { async handle(req, res) {
    if (req.url?.split("?")[0] !== "/api/consumer-offers") return false;
    try {
      const input = await readShoppingRequest(req, res);
      let gtin = typeof input?.gtin === "string" ? input.gtin.trim() : "";
      const market = input?.market;
      if (!validGtin(gtin) || (gtin.length === 14 && gtin[0] !== "0") || typeof market !== "string" || !Object.hasOwn(markets, market)) {
        throw new ShoppingError(400, "Enter a valid retail UPC or EAN and choose the US or UK market.");
      }
      if (gtin.length === 14) gtin = gtin.slice(1);
      if (!clientId || !clientSecret) {
        sendJson(res, 200, { status: "not-configured", gtin, market, observedAt: null, offers: [],
          message: "Live eBay lookup is not configured on this server. You can compare two retailer listings manually." });
        return true;
      }
      const key = market + "/" + gtin;
      const time = now();
      const cached = cache.get(key);
      if (cached?.expires > time) { sendJson(res, 200, cached.result); return true; }
      let job = active.get(key);
      if (!job) {
        calls = calls.filter(call => call.time > time - 86_400_000);
        const client = req.socket.remoteAddress;
        if (active.size >= 4 || calls.length >= dailyLimit || calls.filter(call => call.client === client && call.time > time - 600_000).length >= 12) {
          throw new ShoppingError(429, "The live offer search limit has been reached. Try again later.");
        }
        calls.push({ time, client });
        job = browse(gtin, market).then(result => {
          if (cache.size >= 300) cache.delete(cache.keys().next().value);
          cache.set(key, { result, expires: now() + 10 * 60_000 });
          return result;
        }).finally(() => active.delete(key));
        active.set(key, job);
      }
      sendJson(res, 200, await job);
    } catch (error) {
      const safe = error instanceof ShoppingError ? error : unavailable();
      sendJson(res, safe.status, { error: safe.message });
    }
    return true;
  } };
}
