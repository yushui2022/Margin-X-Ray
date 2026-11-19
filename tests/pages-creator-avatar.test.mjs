import assert from "node:assert/strict";
import test from "node:test";
import { selectCreatorAvatar } from "../server/pages-creator-avatar.mjs";

const base = "https://p16-common-sign.tiktokcdn-eu.com/tos/profile~tplv-tiktokx-cropcenter-q:168:168:q70";

test("takes the actual signed JPEG fallback after HEIC variants in a TikHub avatar list", () => {
  const jpeg = base + ".jpeg?x-signature=second%2Bvariant";
  assert.equal(selectCreatorAvatar({
    avatar_168x168: { url_list: [base + ".heic?x-signature=first", base + ".HEIC", jpeg] },
    avatar_medium: { url_list: [base + ".jpg?x-signature=large"] },
  }), jpeg);
  assert.equal(selectCreatorAvatar({ avatar_thumb: { url_list: [base + ".heic"] } }), null);
});

test("prefers known formats across fields and ignores non-CDN URLs", () => {
  const webp = base + ".image?format=webp&x-signature=test";
  assert.equal(selectCreatorAvatar({
    avatar_thumb: { url_list: ["https://tiktokcdn.com.evil.test/av.jpg", base + ".image"] },
    avatarMedium: { urlList: [webp] },
  }), webp);
  assert.equal(selectCreatorAvatar({ avatarThumb: "https://name:password@p16.tiktokcdn.com/file.jpg" }), null);
  assert.equal(selectCreatorAvatar({ avatar_medium: base + ".image" }), base + ".image");
});
