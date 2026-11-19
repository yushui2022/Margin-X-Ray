import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { createConsumerOffers } from "../server/consumer-offers.mjs";

const gtin = "036000291452";
async function start(t, options) {
  const api = createConsumerOffers({ clientId: "", clientSecret: "", ...options });
  const server = http.createServer((req, res) => { void api.handle(req, res); });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/consumer-offers`;
  return (payload = { gtin, market: "US" }, extra = {}) => fetch(url, { method: "POST", body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" }, ...extra });
}

const app = { clientId: "fixture-client", clientSecret: "fixture-secret" };
const tokenResponse = (token = "fixture-token") => Response.json({ access_token: token, expires_in: 7200, token_type: "Application Access Token" });
function item(id, extra = {}) {
  return { itemId: String(id), title: "Fictional item", itemWebUrl: "https://www.ebay.com/itm/" + id, seller: { username: "example" },
    conditionId: "1000", buyingOptions: ["FIXED_PRICE"], price: { currency: "USD", value: "12.45" }, ...extra };
}

test("offer lookup validates market and barcode before returning a clear unconfigured status without contacting eBay", async t => {
  const request = await start(t, { fetchImpl: () => assert.fail("No credentials") });
  assert.equal((await request({ gtin: "036000291453", market: "US" })).status, 400);
  assert.equal((await request({ gtin: "00000000", market: "US" })).status, 400);
  assert.equal((await request({ gtin, market: ["US"] })).status, 400);
  assert.equal((await request({ gtin, market: "UK" })).status, 400);
  assert.equal((await request(undefined, { method: "GET", body: undefined })).status, 405);
  assert.equal((await request(undefined, { headers: { Origin: "https://other.test", "Content-Type": "application/json" } })).status, 403);
  assert.equal((await request(undefined, { headers: { "Content-Type": "text/plain" } })).status, 415);
  const info = await (await request()).json();
  assert.deepEqual([info.status, info.offers, info.observedAt], ["not-configured", [], null]);
});

test("exact GTIN search uses marketplace + delivery, safe seller links and only fixed brand-new offers", async t => {
  const calls = [];
  const fetchImpl = async (raw, init) => {
    const url = new URL(raw);
    calls.push(url);
    assert.equal(url.origin, "https://api.ebay.com");
    assert.equal(init.redirect, "error");
    if (url.pathname === "/identity/v1/oauth2/token") {
      assert.equal(init.method, "POST");
      assert.equal(init.headers.Authorization, "Basic " + Buffer.from("fixture-client:fixture-secret").toString("base64"));
      assert.equal(init.body.get("grant_type"), "client_credentials");
      assert.equal(init.body.get("scope"), "https://api.ebay.com/oauth/api_scope");
      return tokenResponse();
    }
    assert.equal(url.pathname, "/buy/browse/v1/item_summary/search");
    assert.equal(url.searchParams.get("gtin"), gtin);
    assert.equal(url.searchParams.has("q"), false);
    assert.equal(url.searchParams.get("filter"), "conditionIds:{1000},buyingOptions:{FIXED_PRICE},deliveryCountry:US");
    assert.equal(init.headers["X-EBAY-C-MARKETPLACE-ID"], "EBAY_US");
    assert.equal(init.headers.Authorization, "Bearer fixture-token");
    return Response.json({ total: 9, itemSummaries: [
      item(18, { shippingOptions: [{ shippingCostType: "FIXED", shippingCost: { value: "0.00", currency: "USD" } }] }), item(19),
      item(20, { conditionId: "1500" }), item(21, { buyingOptions: ["AUCTION"] }), item(22, { priceDisplayCondition: "ONLY_SHOW_WHEN_ADDED_IN_CART" }),
      item(23, { itemWebUrl: "https://unknown.example/product/secret" }), item(24, { itemGroupType: "SELLER_DEFINED_VARIATIONS" }),
      item(25, { price: { value: "", currency: "USD" } }), item(26, { price: { value: "9.00", currency: "EUR" } }),
    ] });
  };
  const request = await start(t, { ...app, fetchImpl });
  const ready = await (await request()).json();
  assert.equal(ready.status, "ready");
  assert.deepEqual(ready.offers.map(row => [row.amount, row.shipping]), [[12.45, 0], [12.45, null]]);
  assert.equal(ready.offers[0].seller, "example");
  assert.equal(ready.offers[0].url, "https://www.ebay.com/itm/18");
  assert.deepEqual(await (await request()).json(), ready);
  assert.equal(calls.length, 2);
  assert.doesNotMatch(JSON.stringify(ready), /fixture-token|fixture-secret/);
});

test("UK requests use EBAY_GB, normalize a zero-padded retail barcode and refresh one rejected token", async t => {
  let tokens = 0, lookups = 0;
  const request = await start(t, { ...app, fetchImpl: async (raw, init) => {
    const url = new URL(raw);
    if (url.pathname.includes("oauth2")) return tokenResponse("token-" + ++tokens);
    lookups++;
    assert.equal(url.searchParams.get("gtin"), "0036000291452");
    assert.match(url.searchParams.get("filter"), /deliveryCountry:GB/);
    assert.equal(init.headers["X-EBAY-C-MARKETPLACE-ID"], "EBAY_GB");
    return lookups === 1 ? new Response(null, { status: 401 }) : Response.json({ total: 0 });
  } });
  const response = await request({ gtin: "00" + gtin, market: "GB" });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.offers, []);
  assert.equal(result.status, "ready");
  assert.deepEqual([tokens, lookups], [2, 2]);
});

test("simultaneous searches reuse requests; upstream failure is separate from no matching listings", async t => {
  let count = 0;
  let unblock;
  const gate = new Promise(resolve => { unblock = resolve; });
  const request = await start(t, { ...app, dailyLimit: 1, fetchImpl: async raw => {
    if (new URL(raw).pathname.includes("oauth2")) return tokenResponse();
    count++; await gate; return Response.json({ error: "upstream secret" }, { status: 503 });
  } });
  const done = [request(), request()];
  const poll = Date.now();
  while (!count && Date.now() - poll < 1000) await new Promise(resolve => setTimeout(resolve, 10));
  unblock();
  const results = await Promise.all(done);
  assert.equal(count, 1);
  for (const res of results) {
    assert.equal(res.status, 503);
    assert.doesNotMatch(await res.text(), /upstream secret|fixture-/);
  }
  assert.equal((await request({ gtin, market: "GB" })).status, 429);
});
