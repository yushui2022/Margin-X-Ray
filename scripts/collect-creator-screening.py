"""Collect limited public TikTok creator-embed samples, without login or private APIs.

python3 scripts/collect-creator-screening.py --cache /path/to/dated-cache --observed-at YYYY-MM-DD
Raw responses remain in the external cache. Only public identity, bio, caption,
post URL and provenance fields enter the research artifact. Pattern matches are
triage cues, never proof of a product, paid partnership, ownership or earnings.
"""
import argparse
import concurrent.futures
from datetime import date, datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
SIGNALS = {
    "disclosure-language": r"(?<!\w)#(?:ad|ads|advertisement|sponsored|publi|publicidade|reklam|werbung)(?!\w)|paid partnership|paid promotion|patrocinad[oa]|parceria paga|合作推广|广告",
    "commerce-language": r"\b(?:shop|shopping|store|buy|discount|code|merch|launch|collection|available|affiliate|ambassador|founder|cofounder|gifted|promo|product|products|skincare|makeup|perfume|lipstick|mascara|serum|moisturizer|headphones|sneakers|protein)\b|\b(?:compr[ae]|tienda|descuento|cup[oó]n|loja|comprar|cupom|lançamento|marca|maquiagem|skincare|parfum|belanja|diskon|produk|keranjang|jualan|shopee|tokopedia)\b|购物|商品|同款|品牌|化粧|香水|광고|제품|쇼핑|สินค้า|ช้อป|mỹ phẩm|sản phẩm",
    "outbound-link": r"https?://[^\s]+|\b[a-z0-9][a-z0-9.-]+\.(?:com|shop|store|co|id|io|beauty)\b",
    "account-mention": r"@[\w.]+",
}


def cues(text):
    return [name for name, pattern in SIGNALS.items() if re.search(pattern, text, re.I)]


def public_text(text):
    return re.sub(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", "[contact email omitted]", text or "")


def parse_embed(raw, handle):
    match = re.search(r'<script[^>]*id="__FRONTITY_CONNECT_STATE__"[^>]*>(.*?)</script>', raw.decode("utf-8"), re.S)
    if not match:
        raise ValueError("Public embed state absent; empty response, challenge or unsupported page")
    state = json.loads(match[1])
    page = state.get("source", {}).get("data", {}).get(f"/embed/@{handle}")
    if not page or page.get("isError"):
        raise ValueError("Public embed returned an error or no matching creator page")
    user = page.get("userInfo", {})
    actual = user.get("uniqueId", "").lower()
    if actual != handle.lower():
        raise ValueError(f"Returned handle does not match requested handle: {actual or 'missing'}")
    if user.get("privateAccount"):
        raise ValueError("Public sample unavailable: account marked private")
    posts = []
    for item in page.get("videoList", []):
        if item.get("privateItem") or item.get("authorUniqueId", "").lower() != actual:
            continue
        video_id = str(item.get("id", ""))
        if not re.fullmatch(r"\d+", video_id):
            continue
        caption = public_text(item.get("desc", ""))
        posts.append({"id": video_id, "url": f"https://www.tiktok.com/@{handle}/video/{video_id}",
                      "caption": caption, "publishedAt": None, "triageCues": cues(caption)})
    if len({post['id'] for post in posts}) != len(posts):
        raise ValueError("Duplicate post IDs in embed sample")
    bio = public_text(user.get("signature", ""))
    return {"status": "sampled", "platformHandle": actual, "platformName": user.get("nickname", ""),
            "platformVerified": bool(user.get("verified")), "bio": bio, "bioCues": cues(bio), "posts": posts}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cache', required=True, type=Path)
    parser.add_argument('--observed-at', required=True)
    parser.add_argument('--limit', type=int, default=500)
    parser.add_argument('--retry-unavailable', action='store_true')
    args = parser.parse_args()
    observed = date.fromisoformat(args.observed_at).isoformat()
    args.cache.mkdir(parents=True, exist_ok=True)
    profiles = json.loads((ROOT / 'assets/creators/sources.json').read_text())[:args.limit]

    def collect(profile):
        handle = profile['handle']
        url = f'https://www.tiktok.com/embed/@{handle}'
        meta_path = args.cache / f'{handle}.json'
        if meta_path.exists():
            cached = json.loads(meta_path.read_text())
            if cached['observedAt'] != observed:
                raise ValueError('Use a new cache directory for a different observation date')
            if not args.retry_unavailable or cached['status'] == 'sampled':
                return cached
        record = {"handle": handle, "observedAt": observed, "retrievedAt": datetime.now(timezone.utc).isoformat(),
                  "sourceUrl": url, "access": "Direct public TikTok creator embed; caption metadata only",
                  "sha256": None, "httpStatus": None, "status": "unavailable", "platformHandle": None,
                  "platformName": None, "platformVerified": None, "bio": "", "bioCues": [], "posts": [], "error": None}
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(request, timeout=30) as response:
                raw = response.read()
                record['httpStatus'] = response.status
            (args.cache / f'{handle}.html').write_bytes(raw)
            record['sha256'] = hashlib.sha256(raw).hexdigest()
            record.update(parse_embed(raw, handle))
        except urllib.error.HTTPError as error:
            record.update(httpStatus=error.code, error=f'HTTP {error.code}; no usable public sample')
        except Exception as error:
            record['error'] = str(error)
        meta_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
        return record

    records = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for record in pool.map(collect, profiles):
            records.append(record)
            if len(records) % 50 == 0:
                print(json.dumps({'processed': len(records), 'sampled': sum(r['status'] == 'sampled' for r in records),
                                  'posts': sum(len(r['posts']) for r in records)}), flush=True)
    output = {"observedAt": observed,
              "scope": "One public TikTok creator-embed sample per account. Platform-selected posts, not a complete or representative promotion history. Captions and biographies were retrieved; videos, audio, images, Shop anchors and checkout offers were not reviewed. Empty captions and unavailable samples cannot establish absence of products or advertising.",
              "triageMethod": "Literal multilingual keyword, URL and mention cues support follow-up only. A cue is not a verified product or commercial relationship. Publication dates are unknown where the embed supplies no timestamp.",
              "creators": records}
    destination = ROOT / 'research/creator-screening.json' if len(records) == 500 else args.cache / 'sample.json'
    destination.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'output': str(destination), 'attempted': len(records),
                      'sampled': sum(r['status'] == 'sampled' for r in records),
                      'posts': sum(len(r['posts']) for r in records),
                      'withCues': sum(bool(r['bioCues']) or any(p['triageCues'] for p in r['posts']) for r in records)}))


if __name__ == '__main__':
    main()
