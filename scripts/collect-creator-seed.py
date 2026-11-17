"""Build a sourced launch roster from public directory ranking pages.

Usage: python3 scripts/collect-creator-seed.py --cache /path/to/cache --observed-at YYYY-MM-DD
Requires Pillow for local portrait conversion. No private APIs or credentials.
Existing profiles are retained; fetched rows fill the roster to 500 accounts.
"""
import argparse
import concurrent.futures
from datetime import date
import hashlib
import html
import io
import json
from pathlib import Path
import re
import urllib.request
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://famadex.com"
TARGET = 500


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=35) as response:
        return response.read()


def text(raw):
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", raw)).split())


def parse_rows(content, url):
    rows = []
    for row in re.findall(r'<tr>\s*<td class="cel-rang">.*?</tr>', content, re.S):
        def match(pattern):
            found = re.search(pattern, row, re.S)
            if not found:
                raise ValueError(f"Missing field {pattern} on {url}")
            return html.unescape(found.group(1)).strip()
        handle = match(r'@([a-zA-Z0-9_.]+)\s*·').lower()
        if not re.fullmatch(r'[a-zA-Z0-9_][a-zA-Z0-9_.]{0,23}', handle) or handle.endswith('.'):
            continue
        name = text(match(r'<a class="nom"[^>]*>.*?<b>(.*?)</b>'))
        role = text(match(r'@[a-zA-Z0-9_.]+\s*·\s*(.*?)</span>'))
        followers = match(r'class="nb cel-chiffre"><b>(.*?)</b>')
        number = re.fullmatch(r'([\d.,]+)([KMB]?)', followers)
        if not number:
            raise ValueError(f"Unrecognized follower label: {followers}")
        amount = round(float(number[1].replace(',', '')) * {'': 1, 'K': 1000, 'M': 1000000, 'B': 1000000000}[number[2]])
        country = re.search(r'src="/drapeaux/[^"]+"[^>]*alt="([^"]+)"', row)
        rows.append({
            "handle": handle, "name": name, "sourceCategory": role,
            "country": html.unescape(country[1]) if country else None,
            "followers": amount, "followersLabel": followers,
            "sourceRank": int(match(r'class="rang">(\d+)</b>')),
            "profileSource": BASE + match(r'<a class="nom" href="([^"]+)"'),
            "imageUrl": match(r'<img class="avatar" src="([^"]+)"'),
            "rankingSource": url,
            "extract": f"{name} | @{handle} | {role} | {followers} followers",
        })
    if not rows:
        raise ValueError(f"No public ranking rows on {url}")
    return rows


def category(role):
    # Only map explicit source labels. Generic roles do not establish a niche.
    return {
        "Musician": "Music", "Singer": "Music", "Music": "Music",
        "Comedian": "Entertainment", "Humorist": "Entertainment",
        "Actor": "Entertainment", "Actress": "Entertainment",
        "Athlete": "Sports", "Sportsperson": "Sports",
        "Beauty": "Beauty", "Fashion": "Style", "Food": "Food",
        "Technology": "Tech", "Fitness": "Fitness",
    }.get(role, "Uncategorized")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cache', required=True, type=Path)
    parser.add_argument('--observed-at', required=True, help='Date these HTML snapshots were fetched; use a fresh cache for a new collection')
    args = parser.parse_args()
    observed = date.fromisoformat(args.observed_at).isoformat()
    args.cache.mkdir(parents=True, exist_ok=True)
    source_file = ROOT / 'assets/creators/sources.json'
    existing = json.loads(source_file.read_text())
    # Re-runs keep the four manually researched profiles, not an obsolete seed.
    retained = [row for row in existing if row.get('collection') != 'launch-seed']
    manifest = []
    candidates = []

    def page(page_number):
        url = f'{BASE}/en/ranking/tiktok/people/?page={page_number}'
        path = args.cache / f'famadex-page-{page_number}.html'
        raw = path.read_bytes() if path.exists() else fetch(url)
        if not path.exists():
            path.write_bytes(raw)
        content = raw.decode()
        rows = parse_rows(content, url)
        return rows, {"url": url, "observedAt": observed, "sha256": hashlib.sha256(raw).hexdigest(), "rows": len(rows)}

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for rows, entry in pool.map(page, range(1, 26)):
            candidates.extend(rows)
            manifest.append(entry)
    unique = {row['handle']: row for row in candidates}
    existing_handles = {row['handle'] for row in retained}
    selected = [row for row in sorted(unique.values(), key=lambda row: row['sourceRank']) if row['handle'] not in existing_handles]
    if len(selected) < TARGET - len(retained):
        raise ValueError(f"Only {len(selected)} unique candidates; do not pad with invented accounts")
    selected = selected[:TARGET - len(retained)]
    records = []
    for row in selected:
        initials = ''.join(word[0] for word in row['name'].split()[:2]).upper() or row['handle'][:2].upper()
        records.append({
            "handle": row['handle'], "name": row['name'], "category": category(row['sourceCategory']),
            "initials": initials, "source": row['rankingSource'], "profileSource": row['profileSource'],
            "imageUrl": row['imageUrl'], "image": f"assets/creators/{row['handle']}.webp",
            "retrievedAt": observed,
            "note": "Portrait and account association from the Famadex public directory. Not independently verified as the current TikTok avatar.",
            "collection": "launch-seed", "sourceCategory": row['sourceCategory'], "country": row['country'],
            "followers": row['followers'], "followersLabel": row['followersLabel'],
            "followersSource": row['rankingSource'], "followersObservedAt": observed,
            "followersNote": "Rounded directory snapshot; underlying profile measurement date is not supplied. Not a live TikTok count.",
            "sourceRank": row['sourceRank'], "score": None, "reviewStatus": "not-reviewed",
        })

    def portrait(record):
        path = ROOT / record['image']
        if path.exists():
            with Image.open(path) as image:
                image.verify()
            return record['handle']
        data = fetch(record['imageUrl'])
        with Image.open(io.BytesIO(data)) as original:
            image = ImageOps.fit(original.convert('RGB'), (96, 96), method=Image.Resampling.LANCZOS)
            image.save(path, 'WEBP', quality=85)
        return record['handle']

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        downloaded = list(pool.map(portrait, records))
    for record in retained:
        evidence = unique.get(record['handle'])
        record.update({"collection": "researched", "score": None, "reviewStatus": "not-reviewed"})
        record.update({
            "followers": evidence['followers'] if evidence else None,
            "followersLabel": evidence['followersLabel'] if evidence else None,
            "followersSource": evidence['rankingSource'] if evidence else None,
            "followersObservedAt": observed if evidence else None,
            "followersNote": "Rounded directory snapshot; not a live TikTok count." if evidence else "Follower count not collected.",
            "sourceCategory": evidence['sourceCategory'] if evidence else None,
            "country": evidence['country'] if evidence else None,
            "sourceRank": evidence['sourceRank'] if evidence else None,
            "profileSource": record.get('profileSource', record['source']),
        })
    output = sorted(retained + records, key=lambda row: (-(row.get('followers') or 0), row['handle']))
    assert len(output) == TARGET and len({row['handle'] for row in output}) == TARGET
    source_file.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
    (ROOT / 'research/creator-seed-evidence.json').write_text(json.dumps({
        "observedAt": observed, "source": "Famadex public TikTok people ranking",
        "selection": "Retain four researched profiles; fill to 500 using unique accounts in source-rank order. This is a launch roster, not a claim to be the definitive global top 500.",
        "pages": manifest, "rows": [row for row in candidates if row['handle'] in {record['handle'] for record in output}],
    }, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({"profiles": len(output), "portraits": len(downloaded), "sourceRows": len(candidates), "uniqueSourceHandles": len(unique), "categories": sorted({row['sourceCategory'] for row in candidates}), "minFollowers": min(row['followers'] for row in records)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
