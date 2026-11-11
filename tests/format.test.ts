import test from "node:test";
import assert from "node:assert/strict";
import {
  formatUsd,
  parsePriceText,
  safeImageUrl,
  truncate,
} from "../src/shared/format";

test("parsePriceText handles common USD formats", () => {
  assert.deepEqual(parsePriceText("$59.90"), {
    amount: 59.9,
    currency: "USD",
    raw: "$59.90",
  });
  assert.equal(parsePriceText("US$1,299.00")?.amount, 1299);
  assert.equal(parsePriceText("59.90 USD")?.currency, "USD");
  assert.equal(parsePriceText("$1,299.99")?.amount, 1299.99);
});

test("parsePriceText handles European decimal commas", () => {
  assert.equal(parsePriceText("€49,99")?.amount, 49.99);
  assert.equal(parsePriceText("€49,99")?.currency, "EUR");
  assert.equal(parsePriceText("1.299,00 €")?.amount, 1299);
});

test("parsePriceText handles CNY and JPY symbols", () => {
  assert.equal(parsePriceText("¥199")?.amount, 199);
  assert.equal(parsePriceText("¥199")?.currency, "CNY");
  assert.equal(parsePriceText("¥1,299 JPY")?.currency, "JPY");
});

test("parsePriceText rejects discounts and invalid values", () => {
  assert.equal(parsePriceText("Save 20%"), null);
  assert.equal(parsePriceText("20% off"), null);
  assert.equal(parsePriceText("$0.00"), null);
  assert.equal(parsePriceText(""), null);
  assert.equal(parsePriceText(null), null);
});

test("parsePriceText can use a default currency for bare numbers", () => {
  assert.equal(parsePriceText("59.90", "USD")?.amount, 59.9);
  assert.equal(parsePriceText("59.90", "USD")?.currency, "USD");
});

test("formatUsd never invents a number", () => {
  assert.equal(formatUsd(59.9), "$59.90");
  assert.equal(formatUsd(0), "$0.00");
  assert.equal(formatUsd(null), "—");
  assert.equal(formatUsd(undefined), "—");
  assert.equal(formatUsd(Number.NaN), "—");
});

test("safeImageUrl only allows http(s) and image data URLs", () => {
  assert.equal(
    safeImageUrl("https://cdn.example.com/product.jpg"),
    "https://cdn.example.com/product.jpg",
  );
  assert.equal(safeImageUrl("javascript:alert(1)"), undefined);
  assert.equal(safeImageUrl("data:text/html;base64,PHNjcmlwdD4="), undefined);
  assert.equal(
    safeImageUrl("data:image/png;base64,iVBORw0KGgo="),
    "data:image/png;base64,iVBORw0KGgo=",
  );
});

test("truncate keeps short text and trims long text", () => {
  assert.equal(truncate("hello", 10), "hello");
  assert.equal(truncate("hello world", 8), "hello w…");
});
