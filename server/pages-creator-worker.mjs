import { selectCreatorAvatar } from "./pages-creator-avatar.mjs";
import { searchLiveCreators, suggestionQuery, liveProfileFallback } from "./creator-live-suggestions.mjs";
import { ensureWorkerStandards, edgeTikHubFetch } from "./creator-worker-standards.mjs";
import { lookupVideo } from "./video-lookup.mjs";
import { completeShoppingCheck } from "./shopping-check.mjs";
import { compareTikTokShopOffers } from "./shop-web.mjs";

const origin = "https://yushui2022.github.io";
const dailyLimit = 60;
const dailySuggestions = 360;
const minute = 60_000;
const problem = (code, message) => ({ code, message });

function json(request, data, status = 200, retry = 0) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", Vary: "Origin",
  };
  if (request.headers.get("Origin") === origin) headers["Access-Control-Allow-Origin"] = origin;
  if (retry) headers["Retry-After"] = String(retry);
  return new Response(JSON.stringify(data), { status, headers });
}

async function measure(handle, token, identity) {
  const profileUrl = "https://www.tiktok.com/@" + handle;
  const signal = AbortSignal.timeout(identity ? 26_000 : 60_000);
  let remaining = 38;
  const fetchImpl = (url, options) => {
    if (url.origin !== "https://api.tikhub.io" || remaining-- <= 0) throw new Error("Source budget exhausted");
    return edgeTikHubFetch(url, options).then(response => {
      if (!response.ok) console.warn("creator.lookup.upstream", url.pathname, response.status);
      return response;
    });
  };
  const profileFallback = identity ? {
    ...liveProfileFallback,
    findUser: (hub, who) => who === identity.handle ? {
      uniqueId: who, nickname: identity.name, secUid: identity.secUid, avatarMedium: identity.avatar,
      signature: identity.bio, awemeCount: identity.postCount,
    } : liveProfileFallback.findUser(hub, who),
  } : liveProfileFallback;
  const data = await lookupVideo(profileUrl, { market: "US", tikhubOnly: true, token, fetchImpl, signal, profileFallback });
  const report = await completeShoppingCheck({ ...data, listedProducts:data.listedProducts ?? [], market: "US", scope: "tiktok-shop", steps: [{stage:"source", status:data.status, message:data.message}] },
    { kind: "profile", market: "US" }, {
      signal,
      compare: (product, options) => compareTikTokShopOffers(product, { ...options, token, fetchImpl }),
    });
  const products = report.commerce.map((p, i) => {
    const checked = report.checks.find(c => c.productIndex === i);
    const scored = report.shopOnion.items.find(c => c.productIndex === i);
    const v = checked ? p.variants[checked.variantIndex] : null;
    const url = new URL(p.listingUrl);
    if (v?.skuId) url.searchParams.set("sku_id", v.skuId);
    return { productId: p.productId, name: p.name, url: url.href, sourceUrl: p.sourceUrl,
      variant: v?.variant || null, price: v?.price ?? null, currency: v?.currency ?? null,
      comparison: scored ? { price: scored.peerPrice, currency: scored.currency, basis: scored.basis,
        shopCount: scored.peerCount, score: scored.score, url: scored.peerUrl || null } : null };
  });
  const status = report.checks.some(c => c.status === "unavailable") || data.status === "partial"
    || report.commerce.some(p => p.detailStatus === "unavailable") ? "partial"
    : products.some(p => p.price > 0) ? "priced" : products.length ? "identified" : report.status;
  return { handle, profileUrl, observedAt: new Date().toISOString(), status, bio: data.video.caption, name: data.displayName || handle, avatar: selectCreatorAvatar({avatarMedium: data.profileAvatar}),
    sample: data.sample, posts: data.sampledPosts.map(({ url, caption }) => ({ url, caption })),
    products, score: report.shopOnion.score };
}

const existing = (db, handle) => db.prepare("SELECT * FROM creator_live_cache WHERE handle = ?").bind(handle).first();

function stored(request, row, now) {
  if (row?.payload && row.expires_at > now) return json(request, JSON.parse(row.payload), row.http_status);
  if (row?.lease_until > now) return json(request, problem("busy", "This creator is being checked. Try again shortly."), 429, 5);
  return null;
}

function profileOnly(identity) {
  return { handle:identity.handle, name:identity.name, avatar:identity.avatar, profileUrl:"https://www.tiktok.com/@" + identity.handle,
    observedAt:identity.observedAt, status:"partial", bio:identity.bio || "", sample:{checked:0, limit:5}, posts:[], products:[], score:null };
}

async function knownIdentity(db, handle, now) {
  const record = await existing(db, "identity:v1:" + handle);
  if (!record?.payload || record.expires_at <= now) return null;
  const value = JSON.parse(record.payload);
  return value.handle === handle ? value : null;
}

function writeIdentity(db, identity, now) {
  return db.prepare(`INSERT INTO creator_live_cache (handle,payload,http_status,expires_at)
    VALUES (?, ?, 200, ?) ON CONFLICT(handle) DO UPDATE SET payload=excluded.payload, expires_at=excluded.expires_at`)
    .bind("identity:v1:" + identity.handle, JSON.stringify({...identity,observedAt:new Date(now).toISOString()}), now + 2*60*minute);
}

export function createCreatorWorker(lookup = measure, suggest = searchLiveCreators) {
  return { async fetch(request, env) {
    const url = new URL(request.url);
    const caller = request.headers.get("Origin");
    if (caller && caller !== origin && caller !== url.origin)
      return json(request, problem("inaccessible", "This search origin is unavailable."), 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: {
      "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400", Vary: "Origin",
    } });
    if (request.method !== "GET") return json(request, problem("invalid_handle", "Use GET to look up a creator."), 405);
    const isSuggestion = url.pathname === "/api/creator-suggestions";
    if (!isSuggestion && !url.pathname.startsWith("/api/creators/")) return json(request, problem("not_found", "Unknown endpoint."), 404);
    const handle = isSuggestion ? suggestionQuery(url.searchParams.get("q")) : url.pathname.slice("/api/creators/".length).toLowerCase();
    if (isSuggestion ? !handle || [...url.searchParams.keys()].join(",") !== "q"
      : url.search || !/^[a-z0-9_][a-z0-9_.]{0,23}$/.test(handle) || handle.endsWith("."))
      return json(request, problem("invalid_handle", isSuggestion ? "Type 2–48 characters to search." : "Enter a valid TikTok username."), 400);
    const key = (isSuggestion ? "suggest:v3:" : "report:v2:") + handle;
    const unavailable = problem("unavailable", "The live TikTok lookup is temporarily unavailable. Please try again.");
    const db = env.CREATOR_CACHE;
    if (!db || !env.TIKHUB_TOKEN) return json(request, unavailable, 503, 30);
    try {
      const now = Date.now(), day = new Date(now).toISOString().slice(0, 10);
      ensureWorkerStandards();
      const budgetKey = isSuggestion ? "suggest:" + day : day;
      const cached = stored(request, await existing(db, key), now);
      if (cached) return cached;
      const identity = !isSuggestion && await knownIdentity(db, handle, now);
      const lease = crypto.randomUUID();
      const [reservation] = await db.batch([
        db.prepare(`INSERT INTO creator_live_cache (handle, lease_id, lease_until)
          SELECT ?, ?, ? WHERE COALESCE((SELECT used FROM creator_live_budget WHERE day = ?), 0) < ?
          ON CONFLICT(handle) DO UPDATE SET lease_id = excluded.lease_id, lease_until = excluded.lease_until
          WHERE creator_live_cache.lease_until <= ? AND creator_live_cache.expires_at <= ?`)
          .bind(key, lease, now + 2 * minute, budgetKey, isSuggestion ? dailySuggestions : dailyLimit, now, now),
        db.prepare(`INSERT INTO creator_live_budget(day, used)
          SELECT ?, 1 WHERE EXISTS(SELECT 1 FROM creator_live_cache WHERE handle = ? AND lease_id = ?)
          ON CONFLICT(day) DO UPDATE SET used = used + 1`).bind(budgetKey, key, lease),
      ]);
      if (!reservation.meta.changes) {
        const other = stored(request, await existing(db, key), Date.now());
        return other || (identity ? json(request, profileOnly(identity)) : null) || json(request, problem("rate_limited", "Today's live lookup allowance has been used. Try again tomorrow."), 429,
          Math.ceil((Date.parse(day + "T00:00:00Z") + 86_400_000 - now) / 1000));
      }
      let result, status = 200, ttl = 6 * 60 * minute;
      const writes = [];
      try {
        if (isSuggestion) {
          const found = await suggest(handle, env.TIKHUB_TOKEN, undefined, true);
          for (const entry of found.identities ?? found.creators) writes.push(writeIdentity(db, entry, now));
          result = {creators:found.creators}; ttl = 30 * minute;
        } else result = await lookup(handle, env.TIKHUB_TOKEN, identity);
        if (result.status === "partial") ttl = 5 * minute;
      } catch (err) {
        const detail = String(err?.message || "").replaceAll(env.TIKHUB_TOKEN, "[redacted]").replace(/https?:\/\/[^ ]+/gi,"[url]").slice(0,140);
        console.warn("creator.lookup.failed", isSuggestion ? "suggest" : "profile", err?.name, err?.status, err?.upstreamStatus, detail);
        if (err.privateProfile) { status = 403; result = problem("inaccessible", "This TikTok account is private."); }
        else if (identity) { result = profileOnly(identity); }
        else if (err.status === 404) { status = 404; result = problem("not_found", "TikTok could not find a public account with this username."); }
        else { status = 503; result = unavailable; }
        ttl = status === 503 ? minute : status === 200 ? 3 * minute : 15 * minute;
      }
      writes.push(db.prepare(`UPDATE creator_live_cache SET http_status = ?, payload = ?, expires_at = ?, lease_until = 0,
        lease_id = NULL WHERE handle = ? AND lease_id = ?`)
        .bind(status, JSON.stringify(result), Date.now() + ttl, key, lease));
      await db.batch(writes);
      return json(request, result, status);
    } catch (error) { console.warn("creator.lookup.storage", error?.name); return json(request, unavailable, 503, 30); }
  } };
}

export default createCreatorWorker();
