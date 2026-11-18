"""Replay the structured-source checks. Usage: python3 scripts/check-issue-sample.py CACHE_DIR

Print a receipt to stdout. An empty cache fetches current official copies. Keep
the original receipt when upstream files change. No output of this script is a
review outcome. The PDF attachment and manual source decisions have separate notes.
"""
import datetime as dt
import hashlib
import html
import io
import json
import re
import sys
import unicodedata
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'research'
sample = json.loads((ROOT / 'issue-screening-sample.json').read_text())
ledger = json.loads((ROOT / 'issue-screening-records.json').read_text())
cache = Path(sys.argv[1])
cache.mkdir(parents=True, exist_ok=True)
files, sources, matches = {}, {}, {}


def download(name, url):
    path = cache / name
    if path.exists():
        data = path.read_bytes()
    else:
        with urllib.request.urlopen(url, timeout=30) as response:
            data = response.read()
        path.write_bytes(data)
    files[name] = {'url': url, 'sha256': hashlib.sha256(data).hexdigest()}
    return data


def fetch(name, source):
    return download(name, ledger['sources'][source]['url'])


def iso(value, fmt):
    return dt.datetime.strptime(value.strip(), fmt).date().isoformat()


def inside(date):
    return sample['windowStart'] <= date <= sample['windowEnd']


def normalize(value):
    value = unicodedata.normalize('NFKD', html.unescape(value).casefold())
    value = ''.join(c for c in value if not unicodedata.combining(c))
    return ' ' + re.sub(r'[^a-z0-9]+', ' ', value).strip() + ' '


def screen(source, rows, date_field):
    # Each row is (event/report date, official record reference, searchable text).
    dates = [row[0] for row in rows if inside(row[0])]
    eligible = [(ref, normalize(text)) for date, ref, text in rows if inside(date)]
    sources[source] = dict(dateField=date_field, totalRows=len(rows), inWindow=len(eligible),
                           firstInWindow=min(dates, default=None), lastInWindow=max(dates, default=None),
                           latestAvailable=max(row[0] for row in rows))
    for product in ledger['products']:
        if source not in ledger['checks'][product['group']]:
            continue
        terms = product['terms'] if source == 'cosmetics' else product['aliases'] + product['terms']
        terms = [(term, normalize(term)) for term in terms]
        hits = []
        for ref, text in eligible:
            words = [term for term, pattern in terms if pattern in text]
            if words:
                hits.append(dict(reference=ref, matched=words))
        matches.setdefault(product['id'], {})[source] = hits


for source, year in [('fda25', 2025), ('fda26', 2026)]:
    root = ET.fromstring(fetch(f'fda-{year}.xml', source))
    screen(source, [(iso(n.findtext('Date'), '%m/%d/%Y'), n.findtext('Url'),
                     ' '.join(n.findtext(f, '') for f in ('Brand', 'Company', 'ProductDescription')))
                    for n in root.findall('recalls')], 'notice date')

index = ET.fromstring(fetch('eu-week-index.xml', 'eu'))
alerts = []
for report in index.findall('weeklyReport'):
    if inside(iso(report.findtext('publicationDate'), '%d/%m/%Y')):
        data = download(report.findtext('reference') + '.xml', report.findtext('URL'))
        root = ET.fromstring(data)
        assert root.findtext('report_date') == report.findtext('publicationDate')
        for alert in root.findall('notifications'):
            alerts.append((iso(alert.findtext('publicationDate'), '%d-%m-%Y'),
                           alert.findtext('reference'), ' '.join(alert.itertext())))
screen('eu', alerts, 'alert publication date in published weekly files')

cpsc = json.loads(fetch('cpsc-window.json', 'cpsc'))
screen('cpsc', [(n['RecallDate'][:10], n['URL'], json.dumps(n, ensure_ascii=False)) for n in cpsc], 'recall date')

for source, name in [('food', 'food-enforcement'), ('cosmetics', 'cosmetic-event')]:
    with zipfile.ZipFile(io.BytesIO(fetch(name + '.zip', source))) as archive:
        data = json.loads(archive.read(archive.namelist()[0]))
    rows = []
    for record in data['results']:
        if source == 'food':
            raw = record.get('recall_initiation_date', '')
            ref = record['recall_number']
            text = record['recalling_firm'] + ' ' + record['product_description']
        else:
            raw = record.get('initial_received_date', '')
            ref = record['report_number']
            text = ' '.join(p.get('product_name', '') for p in record['products'])
        if re.fullmatch(r'\d{8}', raw):
            rows.append((f'{raw[:4]}-{raw[4:6]}-{raw[6:]}', ref, text))
    screen(source, rows, 'recall initiation date' if source == 'food' else 'initial receipt date')
    sources[source]['exportUpdated'] = data['meta']['last_updated']

print(json.dumps(dict(sampleId=sample['id'], files=files, sources=sources, matches=matches), indent=2, ensure_ascii=False))
