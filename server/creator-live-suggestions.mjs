import { selectCreatorAvatar } from "./pages-creator-avatar.mjs";
import { edgeTikHubFetch } from "./creator-worker-standards.mjs";
import { hubClient } from "./video-lookup.mjs";

export function suggestionQuery(raw) {
  if (typeof raw !== "string" || /[\u0000-\u001f\u007f/:\\?#]/u.test(raw)) return null;
  const q = raw.normalize("NFKC").trim().replace(/^@/, "").replace(/\s+/gu," ").toLowerCase();
  const n = Array.from(q).length;
  return n >= 2 && n <= 48 && /[\p{L}\p{N}_]/u.test(q) ? q : null;
}

function publicCreator(user) {
  const handle = (user?.unique_id || user?.uniqueId || "").toLowerCase();
  if (!/^[a-z0-9_][a-z0-9_.]{0,23}$/.test(handle) || handle.endsWith(".") ||
      user.private_account === 1 || user.privateAccount === true || user.is_block || user.user_canceled) return null;
  return { handle, name: typeof user.nickname === "string" && user.nickname.trim() ? user.nickname.trim().slice(0,96) : handle,
    avatar: selectCreatorAvatar(user) };
}

export async function searchLiveCreators(q, token, fetchImpl = edgeTikHubFetch, includeIdentities = false) {
  const hub = hubClient({token, fetchImpl, signal: AbortSignal.timeout(17_000)});
  const identities = [];
  function pack(creators) { return includeIdentities ? {creators, identities} : {creators}; }
  function remember(creator, user) {
    const uid = user.sec_uid || user.secUid;
    const bio = typeof user.signature === "string" ? user.signature.slice(0,1000).replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[contact email omitted]") : "";
    identities.push({...creator, secUid:typeof uid === "string" && uid.length <= 256 ? uid : null,
      postCount:Number.isSafeInteger(user.aweme_count) ? user.aweme_count : null, bio});
  }
  try {
    const data = await hub("app/v3/fetch_user_search_result", {keyword:q, offset:"0", count:"10", region:"US"});
    if (!Array.isArray(data.user_list)) throw new Error("Invalid user list");
    const matches = new Map();
    for (const row of data.user_list) {
      const creator = publicCreator(row.user_info);
      if (creator && !matches.has(creator.handle)) {
        matches.set(creator.handle, creator);
        if (includeIdentities) remember(creator,row.user_info);
      }
      if (matches.size >= 6) break;
    }
    if (matches.size || !/^[a-z0-9_][a-z0-9_.]{0,23}$/.test(q) || q.endsWith(".")) return pack([...matches.values()]);
  } catch (error) {
    if (error?.upstreamStatus === 429 || !/^[a-z0-9_][a-z0-9_.]{0,23}$/.test(q) || q.endsWith(".")) throw error;
  }
  try {
    const profile = await hub("web/fetch_user_profile", {uniqueId:q});
    const creator = publicCreator(profile.userInfo?.user);
    if (creator?.handle !== q) return pack([]);
    if (includeIdentities) remember(creator, profile.userInfo.user);
    return pack([creator]);
  } catch (err) {
    if (err.status === 404) return {creators:[]};
    throw err;
  }
}


// App search remains usable when the web profile API returns a challenge. Only
// a returned exact username can establish profile identity or supply a secUid.
export const liveProfileFallback = {
  async findUser(hub, handle) {
    const data = await hub("app/v3/fetch_user_search_result", {keyword: handle, offset: "0", count: "12", region: "US"});
    const user = data.user_list?.map(x => x.user_info).find(x => x?.unique_id?.toLowerCase() === handle);
    if (!user) return null;
    if (Number(user.private_account) > 0 || Number(user.secret) > 0 || user.user_canceled)
      throw Object.assign(new Error("Private account"), { status: 403, privateProfile: true });
    return { uniqueId: handle, secUid: user.sec_uid, signature: user.signature || "", nickname: user.nickname,
      avatarMedium: selectCreatorAvatar(user), awemeCount: user.aweme_count };
  },
  async readFeed(hub, secUid, market) {
    return hub("app/v3/fetch_user_post_videos_v2", {sec_user_id:secUid, max_cursor:"0", count:"5", region:market});
  },
};
