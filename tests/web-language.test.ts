import assert from "node:assert/strict";
import test from "node:test";
import { preferredLanguage } from "../src/web/language";
import { translateChinese as zh } from "../src/web/i18n-zh";

test("explicit language choice wins over the phone language", () => {
  assert.equal(preferredLanguage("en", ["zh-CN"]), "en");
  assert.equal(preferredLanguage("zh-Hans", ["en-GB"]), "zh-Hans");
  assert.equal(preferredLanguage(null, ["ja-JP", "zh-Hans-CN", "en-US"]), "zh-Hans");
  assert.equal(preferredLanguage(null, ["de-DE"]), "en");
});

test("creator progress and seller samples can be read in Chinese", () => {
  assert.equal(zh("Search creators"), "搜索博主");
  assert.equal(zh(" Step 2 of 4 "), " 第 2 步，共 4 步 ");
  assert.equal(zh("Save"), "保存");
  assert.equal(zh("Switch shops and save "), "换家店可省 ");
  assert.equal(zh("Example suppliers"), "供应商示例");
  assert.match(zh("Fictional supplier profiles"), /虚构/);
});

test("unrecognized source text and price values pass through unchanged", () => {
  for (const text of ["@2412ya", "$64.94", "Disney Wooden Electronic Air Hockey Table", "My  family’s $10 find!"]) {
    assert.equal(zh(text), text);
  }
});
