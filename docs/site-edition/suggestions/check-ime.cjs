// Run with Node, playwright-core and Chrome installed. Pass a Pages URL to check another release.
const assert = require("node:assert/strict");
const { chromium } = require("playwright-core");

async function check() {
  const site = process.argv[2] || "https://yushui2022.github.io/Margin-X-Ray/";
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await page.goto(site + "#shop", { waitUntil: "domcontentloaded" });
    const input = page.locator(".shop-home-lookup input[type=search]");
    const choices = page.locator(".shop-creator-suggestions");
    const portrait = choices.locator('[data-handle="2412ya"] img');

    // Chrome sends composing input events and then compositionend with no ordinary input event.
    const ime = await page.context().newCDPSession(page);
    await input.focus();
    await ime.send("Input.imeSetComposition", { text: "2412ya", selectionStart: 6, selectionEnd: 6 });
    await ime.send("Input.insertText", { text: "2412ya" });
    await portrait.waitFor();
    await page.evaluate(() => {
      window.dispatchEvent(new Event("blur"));
      window.dispatchEvent(new Event("focus"));
    });
    assert.equal(await portrait.isVisible(), true);
    await input.press("Escape");
    assert.equal(await choices.isHidden(), true);
    await input.click();
    await portrait.click();
    await page.locator('.shop-rank-context li[aria-current="true"][data-handle="2412ya"]').waitFor();
    assert.equal(new URL(page.url()).hash, "#shop");
  } finally {
    await browser.close();
  }
}

check().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
