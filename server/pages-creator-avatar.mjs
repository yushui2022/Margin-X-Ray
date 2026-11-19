const cdnHost = /(?:^|\.)(?:tiktokcdn(?:-us|-eu|-in)?\.com|tiktokv\.com|byteoversea\.com|ibytedtos\.com|byteimg\.com|akamaized\.net)$/i;
const supported = /^(?:jpe?g|png|webp|gif|avif)$/i;

export function selectCreatorAvatar(user) {
  let unknown = null;
  for (const field of [user.avatar_168x168, user.avatar_thumb, user.avatarThumb, user.avatar_300x300,
    user.avatar_medium, user.avatarMedium, user.avatar_larger, user.avatarLarger]) {
    const values = typeof field === "string" ? [field] : field?.url_list ?? field?.urlList;
    if (!Array.isArray(values)) continue;
    for (const value of values) {
      if (typeof value !== "string") continue;
      let url;
      try { url = new URL(value); } catch { continue; }
      if (url.protocol !== "https:" || url.username || url.password || url.port || !cdnHost.test(url.hostname)) continue;
      const format = (url.searchParams.get("format") || url.searchParams.get("image_format") ||
        /\.(\w+)$/.exec(url.pathname)?.[1] || "").replace(/^image\//i, "");
      if (supported.test(format)) return value;
      if (!unknown && !/^(?:heic|heif|heics|heifs|svg|bmp|tiff?)$/i.test(format)) unknown = value;
    }
  }
  return unknown;
}
