import { delay } from "./shopping-delay.mjs";

const TIKHUB = "https://api.tikhub.io/api/v1/tiktok/web/";
const TIKTOK = "https://www.tiktok.com";
const SAMPLE_SIZE = 15;
const BYTE_LIMIT = 4 * 1024 * 1024;

class SourceError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const unavailable = () => new SourceError("SOURCE_UNAVAILABLE", "The public data source is temporarily unavailable.");
const inaccessible = () => new SourceError("PROFILE_INACCESSIBLE", "A public profile is unavailable for this handle.");
const privateProfile = () => new SourceError("PRIVATE_PROFILE", "This account is marked private.");

async function boundedText(response) {
  if (!response.body) throw unavailable();
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > BYTE_LIMIT) {
        await reader.cancel();
        throw unavailable();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new Blob(chunks).text();
}

// Keep all upstream hosts fixed. A redirect (including a platform login page)
// must never carry the API token, or count as evidence of a creator profile.
async function request(url, { fetchImpl, signal, headers, isEmbed = false }) {
  for (let attempt = 0; attempt < 2; attempt++) {
    signal.throwIfAborted();
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(6500)]);
    let retryAfter = 250;
    try {
      const response = await fetchImpl(url, { headers, signal: deadline, redirect: "manual" });
      if (response.ok) return await boundedText(response);
      await response.body?.cancel();
      if (isEmbed && [400, 404, 410].includes(response.status)) throw inaccessible();
      if (![408, 429, 500, 502, 503, 504].includes(response.status)) throw unavailable();
      const rawRetry = response.headers.get("retry-after");
      if (rawRetry) {
        const waitMs = /^\d+$/.test(rawRetry) ? Number(rawRetry) * 1000 : Date.parse(rawRetry) - Date.now();
        if (waitMs > 1500) throw unavailable();
        if (Number.isFinite(waitMs)) retryAfter = Math.max(250, waitMs);
      }
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof SourceError) throw error;
    }
    if (!attempt) await delay(retryAfter, signal);
  }
  throw unavailable();
}

function publicText(value, limit) {
  if (typeof value !== "string") return "";
  // Keep stored evidence consistent with the original public embed collection.
  return value.slice(0, limit + 256).replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[contact email omitted]").trim().slice(0, limit);
}

function integer(value) {
  if (typeof value !== "number" && !(typeof value === "string" && /^\d+$/.test(value))) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function profileFrom(user, stats, handle) {
  if (typeof user?.uniqueId !== "string" || user.uniqueId.toLowerCase() !== handle) throw unavailable();
  if (user.privateAccount === true) throw privateProfile();
  return {
    handle, name: publicText(user.nickname, 100) || handle, bio: publicText(user.signature, 1000),
    followers: integer(stats?.followerCount ?? user.followerCount), url: `${TIKTOK}/@${handle}`,
  };
}

function normalizePosts(items, handle, secUid) {
  if (!Array.isArray(items)) throw unavailable();
  const posts = new Map();
  for (const item of items) {
    if (posts.size === SAMPLE_SIZE) break;
    if (!item || item.privateItem || item.isPrivate) continue;
    const author = item.author?.uniqueId ?? item.authorUniqueId ?? item.author;
    if (typeof author !== "string" || author.toLowerCase() !== handle) continue;
    if (secUid && item.author?.secUid && item.author.secUid !== secUid) continue;
    // Numeric 64-bit IDs parsed as JS numbers lose precision; never construct a link from one.
    const id = Number.isSafeInteger(item.id) ? String(item.id) : item.id;
    if (typeof id !== "string" || !/^\d{1,24}$/.test(id) || posts.has(id)) continue;
    const seconds = integer(item.createTime);
    const publishedAt = seconds > 0 && seconds <= Math.floor(Date.now() / 1000) ? new Date(seconds * 1000).toISOString() : null;
    posts.set(id, { id, caption: publicText(item.desc, 3000), url: `${TIKTOK}/@${handle}/video/${id}`, publishedAt });
  }
  return [...posts.values()];
}

function postSample(items, handle, secUid) {
  const posts = normalizePosts(items, handle, secUid);
  if (items.length && !posts.length) return partialSample("No returned post could be matched to this public account.");
  return { posts, warnings: [] };
}

function partialSample(message) {
  return { posts: [], postsUnavailable: true, warnings: [message] };
}

function parseJson(text) {
  try { return JSON.parse(text); }
  catch { throw unavailable(); }
}

async function tikHub(path, params, context) {
  const url = new URL(path, TIKHUB);
  url.search = new URLSearchParams(params).toString();
  const raw = await request(url, { ...context, headers: { Accept: "application/json", Authorization: `Bearer ${context.token}` } });
  const envelope = parseJson(raw);
  if (envelope?.code !== 200 || !envelope.data) throw unavailable();
  const data = envelope.data;
  if ([data.statusCode, data.status_code].some(code => code != null && Number(code) !== 0)) throw unavailable();
  return data;
}

async function embed(handle, context) {
  const url = `${TIKTOK}/embed/@${handle}`;
  const html = await request(url, { ...context, isEmbed: true, headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0" } });
  const script = html.match(/<script\b[^>]*\bid=["']__FRONTITY_CONNECT_STATE__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!script) throw unavailable();
  const page = parseJson(script[1])?.source?.data?.[`/embed/@${handle}`];
  if (page?.isError) throw inaccessible();
  const profile = profileFrom(page?.userInfo, undefined, handle);
  const sample = Array.isArray(page.videoList)
    ? postSample(page.videoList, handle)
    : partialSample("TikTok returned the profile without a public post sample.");
  return { profile, ...sample, provider: "TikTok public embed" };
}

/** Read one account-matched sample on the server. No upstream response body is relayed. */
export async function collectCreator(handle, { token = process.env.TIKHUB_TOKEN, fetchImpl = globalThis.fetch, signal } = {}) {
  if (typeof handle !== "string" || !/^[a-z\d_][a-z\d_.]{0,23}$/i.test(handle) || handle.endsWith(".")) {
    throw new SourceError("INVALID_HANDLE", "Enter a valid TikTok handle.");
  }
  handle = handle.toLowerCase();
  const budget = AbortSignal.timeout(26000);
  const context = { token: token?.trim(), fetchImpl, signal: signal ? AbortSignal.any([budget, signal]) : budget };
  const observedAt = new Date().toISOString().slice(0, 10);
  let profile;
  try {
    if (context.token) {
      try {
        const data = await tikHub("fetch_user_profile", { uniqueId: handle }, context);
        const info = data.userInfo ?? data;
        profile = profileFrom(info.user, info.stats, handle);
        const secUid = info.user.secUid;
        if (typeof secUid !== "string" || !secUid || secUid.length > 256) throw unavailable();
        const page = await tikHub("fetch_user_post", { secUid, cursor: "0", count: String(SAMPLE_SIZE) }, context);
        const sample = postSample(page.itemList, handle, secUid);
        if (!sample.postsUnavailable) return { profile, ...sample, provider: "TikHub", observedAt };
      } catch (error) {
        signal?.throwIfAborted();
        if (error.code === "PRIVATE_PROFILE") throw error;
      }
    }
    try {
      const sample = await embed(handle, context);
      if (context.token) sample.warnings.unshift(profile ? "TikHub supplied the profile. Post sampling used the public TikTok embed." : "TikHub was unavailable. This sample comes from the public TikTok embed.");
      if (profile) return { ...sample, profile, provider: "TikHub + TikTok public embed", observedAt };
      return { ...sample, observedAt };
    } catch (error) {
      signal?.throwIfAborted();
      if (!profile || error.code === "PRIVATE_PROFILE") throw error;
      return { profile, ...partialSample("The public post sample could not be retrieved. Only the profile was collected."), provider: "TikHub", observedAt };
    }
  } catch (error) {
    signal?.throwIfAborted();
    if (error.code === "PRIVATE_PROFILE") throw inaccessible();
    if (error instanceof SourceError) throw error;
    throw unavailable();
  }
}
