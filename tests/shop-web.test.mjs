import test from "node:test";
import assert from "node:assert/strict";
import { compareTikTokShopOffers, compareWebOffers, discoverStorefront } from "../server/shop-web.mjs";
import { productItems } from "../server/shop-web-product.mjs";
import { isPublicAddress, publicShopUrl } from "../server/shop-web-read.mjs";

const code = "036000291452",
  otherCode = "049000050103";
const store = "https://brand.com/products/desk-lamp",
  merchant = "https://merchant.com/p/desk-lamp";
const offer = (price = "25.00", more = {}) => ({
  "@type": "Offer",
  price,
  priceCurrency: "USD",
  availability: "https://schema.org/InStock",
  ...more,
});
const product = (data = {}) => ({
  "@type": "Product",
  name: "Studio Z desk lamp",
  gtin12: code,
  brand: { name: "Studio" },
  offers: offer(),
  ...data,
});
const html = (data) => '<script type="application/ld+json">' + JSON.stringify(data) + "</script>";
const rss = (urls) =>
  "<rss><channel>" +
  urls.map((u) => "<item><title>Studio Z desk lamp</title><link>" + u + "</link></item>").join("") +
  "</channel></rss>";
function reader(pages, queryLinks = []) {
  const calls = [];
  async function readPage(url) {
    calls.push(url);
    if (url.startsWith("https://www.bing.com/search?")) return { url, text: rss(queryLinks) };
    if (url.startsWith("https://api.upcitemdb.com/"))
      return { url, text: JSON.stringify({ items: [{ upc: code, offers: [{ price: 0.1, link: merchant }] }] }) };
    if (!(url in pages)) throw Error("Unavailable");
    return { url, text: pages[url] };
  }
  return { readPage, calls };
}
const original = () => productItems({ url: store, text: html(product()) }, "US")[0];

test("rejects local, reserved, synthetic, multicast and transition targets", () => {
  for (const address of [
    "127.2.3.4",
    "10.0.0.7",
    "169.254.169.254",
    "100.64.1.1",
    "198.18.1.3",
    "::1",
    "::ffff:127.0.0.1",
    "fd00::1",
    "fe80::1",
    "2002::1",
    "3fff::1",
  ])
    assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
  for (const url of [
    "https://127.0.0.1",
    "file:///etc/passwd",
    "https://user@brand.com",
    "https://x.internal",
    "https://a.local",
    "https://brand.com:444/",
  ])
    assert.equal(publicShopUrl(url), null);
});

test("checks the merchant PDP for a matching barcode, calculates only item prices", async () => {
  const r = reader({ [merchant]: html(product({ offers: offer("19.91") })) }, [merchant]);
  const result = await compareWebOffers(original(), r);
  assert.equal(result.comparison?.difference, 5.09);
  assert.equal(result.comparison.basis, "item");
  assert.equal(result.comparison.alternativePrice, 19.91);
  assert.equal(result.offers[0].match, "exact");
  assert.equal(r.calls.filter((u) => u === merchant).length, 1);
  const increase = await compareWebOffers(
    original(),
    reader({ [merchant]: html(product({ offers: offer("29.10") })) }),
  );
  assert.equal(increase.comparison.difference, -4.1);
});

test("stock, currencies, requested market, condition and wrong variants gate numerical savings", async () => {
  for (const patch of [
    { offers: offer("10", { availability: "https://schema.org/OutOfStock" }) },
    { offers: offer("10", { priceCurrency: "GBP" }) },
    { offers: offer("10", { itemCondition: "UsedCondition" }) },
    { gtin12: otherCode, offers: offer("10") },
    { offers: offer("10", { priceValidUntil: "2010-01-01" }) },
    { offers: { "@type": "AggregateOffer", lowPrice: "10", priceCurrency: "USD" } },
  ]) {
    const result = await compareWebOffers(original(), reader({ [merchant]: html(product(patch)) }));
    assert.equal(result.comparison, null);
  }
  assert.equal(
    (await compareWebOffers(original(), { ...reader({ [merchant]: html(product()) }), market: "GB" })).comparison,
    null,
  );
  const result = await compareWebOffers(original(), reader({}));
  assert.equal(result.offers.length, 0);
  assert.equal(result.comparison, null);
});

test("a local partner SKU is insufficient, duplicate merchant SKUs yield unique selection IDs", async () => {
  const page = {
    url: store,
    text: html(
      product({
        gtin12: null,
        offers: [offer("18", { sku: "A", name: "Black" }), offer("22", { sku: "A", name: "White" })],
      }),
    ),
  };
  const item = productItems(page, "US")[0];
  assert.equal(item.variants.length, 2);
  assert.notEqual(item.variants[0].skuId, item.variants[1].skuId);
  assert.equal(item.variants[0].skuId, productItems(page, "US")[0].variants[0].skuId);
  const opts = reader({ [merchant]: html(product({ gtin12: null, offers: offer("5", { sku: "A" }) })) }, [
    merchant,
  ]);
  const r = await compareWebOffers(item, opts);
  assert.equal(r.comparison, null);
  assert.equal(r.offers[0].match, "candidate");
});

test("pins a bookmarked variant and does not copy a shared parent GTIN to different offers", () => {
  const row = product({
    offers: [
      offer("10", { url: store + "?variant=11" }),
      offer("20", { url: store + "?variant=22", gtin12: otherCode }),
    ],
  });
  const p = productItems({ url: store + "?variant=22", text: html(row) }, "US");
  assert.equal(p[0].variants.length, 1);
  assert.equal(p[0].variants[0].price, 20);
  const other = productItems({ url: store + "?variant=11", text: html(row) }, "US");
  assert.equal(other[0].variants[0].gtin, null);
});

test("uses only a creator-linked store or a store that links back to the same profile", async () => {
  const home = "https://studio.com/",
    direct = "https://studio.com/products/lamp";
  const link = '<a href="' + direct + '">Shop this lamp</a>';
  const pages = { [home]: link, [direct]: html(product()) };
  const supplied = await discoverStorefront({ urls: [home], market: "US" }, reader(pages));
  assert.equal(supplied.items.length, 1);
  assert.equal(supplied.sources[0].label, "Submitted website");
  const noRelationship = await discoverStorefront({ handle: "studio", market: "US" }, reader(pages, [home]));
  assert.equal(noRelationship.items.length, 0);
  assert.equal(noRelationship.status, "leads");
  pages[home] += '<a href="https://www.tiktok.com/@studio">TikTok</a>';
  const verified = await discoverStorefront({ handle: "studio", market: "US" }, reader(pages, [home]));
  assert.equal(verified.items.length, 1);
});

test("follows a shop link on a creator-provided link-in-bio and reads the selected Shopify price and barcode", async () => {
  const hub = "https://linktr.ee/ourcreator",
    selected = store + "?variant=22";
  const r = reader({
    [hub]: '<a href="' + selected + '">Shop the lamp</a>',
    [selected]: "<html></html>",
    [store + ".oembed"]: JSON.stringify({
      title: "Studio Z lamp",
      offers: [
        { offer_id: 11, title: "White", price: "11.00", currency_code: "USD", in_stock: true },
        { offer_id: 22, title: "Black", price: "24.55", currency_code: "USD", in_stock: true },
      ],
    }),
    [store + ".js"]: JSON.stringify({ vendor: "Studio", variants: [{ id: 22, barcode: code }] }),
  });
  const found = await discoverStorefront({ urls: [hub], handle: "ourcreator", market: "US" }, r);
  assert.equal(found.items[0].variants.length, 1);
  assert.equal(found.items[0].variants[0].price, 24.55);
  assert.equal(found.items[0].variants[0].gtin, code);
});

test("search failure and an unreadable directory do not masquerade as an empty market", async () => {
  const run = await compareWebOffers(original(), {
    readPage: async () => {
      throw Error("down");
    },
  });
  assert.equal(run.status, "unavailable");
  assert.equal(run.comparison, null);
});

test("explicit manufacturer model with the same brand and option can match, a shared default label cannot", async () => {
  const row = original();
  row.brand = "Studio";
  row.model = "LX-810";
  row.name = "Studio desk lamp";
  Object.assign(row.variants[0], { gtin: null, variant: "Blue" });
  const target = { model: "LX-810", color: "Blue", gtin12: null, offers: offer("21") };
  const run = await compareWebOffers(row, reader({ [merchant]: html(product(target)) }, [merchant]));
  assert.equal(run.comparison?.difference, 4);
  row.variants[0].variant = "Single variant";
  target.color = "Single variant";
  assert.equal(
    (await compareWebOffers(row, reader({ [merchant]: html(product(target)) }, [merchant]))).comparison,
    null,
  );
  assert.equal(
    (
      await compareWebOffers(
        original(),
        reader({ [merchant]: html(product({ name: "Studio Z desk lamp 2-pack" })) }),
      )
    ).comparison,
    null,
  );
});

test("only a differently identified TikTok shop can supply an exact competing sku", async () => {
  const item = {
    ...original(),
    listingUrl: "https://shop.tiktok.com/us/pdp/1700000000000000000",
    productId: "1700000000000000000",
    seller: "Studio Official",
    sellerId: "7100000000000000000",
  };
  const altId = "1700000000000000002",
    altSeller = "7100000000000000999";
  const reservedNames = ["Studio US", null, "Studio Official"];
  let details = 0;
  const hub = async (path, query) => {
    if (path.includes("search"))
      return {
        code: 0,
        data: {
          component_data: {
            products: [
              ...reservedNames.map((name, i) => ({
                product_id: "170000000000000000" + i,
                title: "Studio Z lamp",
                seller_info: { shop_name: name },
              })),
              {
                product_id: altId,
                title: "Studio Z desk lamp",
                seller_info: { shop_name: "Different Lighting", seller_id: altSeller },
              },
            ],
          },
        },
      };
    details++;
    assert.equal(query.product_id, altId);
    return {
      product_data: {
        initialData: {
          productInfo: {
            product_id: altId,
            title: "Studio Z desk lamp",
            seller: { name: "Different Lighting", seller_id: altSeller },
            skus: [
              {
                sku_id: "1700000000000000555",
                gtin: code,
                is_available: true,
                price: { sale_price_decimal: "19.99", currency_name: "USD" },
              },
            ],
          },
        },
      },
    };
  };
  const yes = await compareTikTokShopOffers(item, { hub });
  assert.equal(yes.comparison?.difference, 5.01);
  assert.equal(yes.offers[0].seller, "Different Lighting");
  assert.equal(details, 1);
  const expensive = await compareTikTokShopOffers({...item,variants:[{...item.variants[0],price:10}]}, {hub});
  assert.equal(expensive.comparison.difference,-9.99);
  const uncertain = await compareTikTokShopOffers({...item,variants:[{...item.variants[0],available:null}]}, {hub});
  assert.equal(uncertain.comparison,null);
  delete item.sellerId;
  const unverified = await compareTikTokShopOffers(item, { hub });
  assert.equal(unverified.comparison, null);
  assert.equal(unverified.offers[0].match, "candidate");
});

test("scopes server-rendered Shopify product variants to the page handle and selected SKU", async () => {
  const variant = (id) => ({
    id: "gid://shopify/ProductVariant/" + id,
    title: "Color " + id,
    price: { amount: "32.00", currencyCode: "USD" },
    availableForSale: true,
    barcode: code,
  });
  const data = {
    state: {
      loaderData: {
        "routes/products.$handle": {
          product: { handle: "desk-lamp", title: "Studio lamp" },
          allVariants: [variant("11"), variant("22")],
        },
        "routes/recommendations": {
          product: { handle: "desk-lamp", title: "Unrelated" },
          allVariants: [variant("33")],
        },
      },
    },
  };
  const selected = store + "?variant=22";
  const r = reader({ [selected]: "<script>window.__remixContext = " + JSON.stringify(data) + ";</script>" });
  const result = await discoverStorefront({ market: "US", urls: [selected] }, r);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].variants.length, 1);
  assert.equal(result.items[0].variants[0].skuId, "22");
  assert.equal(result.items[0].variants[0].gtin, code);
});

test("known color, speed and opposite accessory choices are excluded even from candidate prices", async () => {
  const item = original();
  item.name = "Studio 3-speed desk fan";
  item.variants[0].variant = "Without stand-Black";
  for (const [name, color] of [
    ["Studio 3-speed desk fan", "with stand Black"],
    ["Studio 2-Speed desk fan", "Black"],
    ["Studio 3-speed desk fan", "White"],
    ["Studio 3-speed desk fan", "Stand+Black"],
  ]) {
    const row = product({ name, color, offers: offer("11") });
    const r = await compareWebOffers(item, reader({ [merchant]: html(row) }, [merchant]));
    assert.equal(r.comparison, null, name + " " + color);
    assert.equal(r.offers.length, 0, name + " " + color);
  }
});

test("tries the publisher's public variant feed when a Shopify-shaped HTML page cannot be read", async () => {
  const r = reader({
    [store + ".oembed"]: JSON.stringify({
      title: "Studio lamp",
      offers: [{ offer_id: "11", title: "Blue", price: "29.50", currency_code: "USD", in_stock: true }],
    }),
    [store + ".js"]: JSON.stringify({ variants: [{ id: 11, barcode: code }] }),
  });
  const found = await discoverStorefront({ urls: [store + "?variant=11"], market: "US" }, r);
  assert.equal(found.items[0].variants[0].price, 29.5);
  assert.equal(found.items[0].variants[0].gtin, code);
  assert.equal(found.sources[0].label, "Public storefront product feed");
});
