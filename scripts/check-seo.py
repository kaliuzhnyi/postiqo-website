"""Check the static site's crawlable pages without a build or third-party packages."""
from collections import Counter
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit
import json
import re
import struct
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'https://postiqo.io'
PAGES = {'/': 'index.html', '/try/': 'try/index.html', '/download/': 'download/index.html'}


class Page(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.elements = []
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        self.elements.append((tag, dict(attrs)))


def text(value):
    return ' '.join(unescape(re.sub('<[^>]+>', ' ', value)).split())


parsed = {}
for route, filename in PAGES.items():
    source = (ROOT / filename).read_text(encoding='utf-8')
    page = Page(source)
    parsed[route] = page
    assert '\u2014' not in source and '\u2013' not in source, f'{filename}: long dash'
    assert len(re.findall(r'<h1\b', source)) == 1, f'{filename}: one H1 required'
    titles = re.findall(r'<title>(.*?)</title>', source)
    assert len(titles) == 1 and 15 < len(text(titles[0])) < 75, f'{filename}: title'
    metas = [(attrs.get('name', attrs.get('property')), attrs.get('content', '')) for tag, attrs in page.elements if tag == 'meta']
    keys = [key for key, _ in metas if key]
    assert len(keys) == len(set(keys)), f'{filename}: duplicate metadata'
    meta = dict(metas)
    assert 80 < len(meta['description']) < 180, f'{filename}: description'
    assert meta['robots'].startswith('index, follow'), f'{filename}: indexing disabled'
    assert 'keywords' not in meta
    for key in ('og:title', 'og:description', 'og:image', 'og:image:alt', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image', 'twitter:image:alt'):
        assert meta.get(key), f'{filename}: missing {key}'
    assert meta['og:url'] == ORIGIN + route
    assert meta['twitter:card'] == 'summary_large_image'
    assert [attrs.get('href') for tag, attrs in page.elements if tag == 'link' and attrs.get('rel') == 'canonical'] == [ORIGIN + route]
    identifiers = [attrs['id'] for _, attrs in page.elements if 'id' in attrs]
    assert not [key for key, count in Counter(identifiers).items() if count > 1], f'{filename}: duplicate IDs'
    for tag, attrs in page.elements:
        if tag == 'img':
            assert 'alt' in attrs, f'{filename}: image alt missing'
        if tag == 'video':
            assert 'autoplay' not in attrs and attrs.get('preload') == 'none', f'{filename}: video downloads eagerly'
        if tag == 'label' and 'for' in attrs:
            assert attrs['for'] in identifiers, f'{filename}: label target missing'
    schemas = [json.loads(block) for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', source, re.S)]
    assert schemas
    if route == '/':
        product = next(item for item in schemas[0]['@graph'] if item.get('@id') == ORIGIN + '/#product')
        assert product['operatingSystem'] == 'Windows'
        assert [item['price'] for item in product['offers']] == ['100.00', '90.00']
        assert all(item['priceCurrency'] == 'CAD' for item in product['offers'])
        assert product['offers'][1]['eligibleQuantity']['minValue'] == 5
        assert 'aggregateRating' not in product and 'review' not in product
        faq = next(item for item in schemas if item.get('@type') == 'FAQPage')
        visible = re.findall(r'<details class="faq-item">(.*?)</details><!-- End Faq item-->', source, re.S)
        assert len(visible) == len(faq['mainEntity']) == 14
        for item, entry in zip(visible, faq['mainEntity']):
            assert text(re.search(r'<h3>(.*?)</h3>', item, re.S)[1]) == entry['name']
            answer = ' '.join(text(p) for p in re.findall(r'<p[^>]*>(.*?)</p>', item, re.S))
            assert answer == entry['acceptedAnswer']['text'], entry['name']
    print(f'PASS {route}: unique metadata, headings, social previews, structured data, and controls')

for route, page in parsed.items():
    for tag, attrs in page.elements:
        references = [attrs[key] for key in ('href', 'src', 'poster') if key in attrs]
        if 'srcset' in attrs:
            references += [part.strip().split()[0] for part in attrs['srcset'].split(',')]
        for value in references:
            if value.startswith(('mailto:', 'tel:', 'data:')):
                continue
            url = urlsplit(urljoin(ORIGIN + route, value))
            if url.netloc != 'postiqo.io':
                continue
            target = unquote(url.path)
            filename = PAGES.get(target, target.lstrip('/'))
            assert (ROOT / filename).is_file(), f'{route}: missing local asset or page {value}'
            if url.fragment and target in parsed:
                ids = {attrs.get('id') for _, attrs in parsed[target].elements}
                assert unquote(url.fragment) in ids, f'{route}: broken section link {value}'

sitemap = ET.parse(ROOT / 'sitemap.xml')
urls = [node.text for node in sitemap.findall('.//{*}loc')]
assert set(urls) == {ORIGIN + route for route in PAGES} and len(urls) == len(PAGES)
assert 'Sitemap: https://postiqo.io/sitemap.xml' in (ROOT / 'robots.txt').read_text()
for filename in ('starter-page.html', 'service-details.html'):
    assert 'noindex' in (ROOT / filename).read_text(encoding='utf-8')
with (ROOT / 'public/og.png').open('rb') as image:
    header = image.read(24)
assert struct.unpack('>II', header[16:24]) == (1200, 630), 'Social image dimensions do not match metadata'
print('PASS sitemap, robots, template exclusions, all internal links/assets, and 1200 x 630 social image')
