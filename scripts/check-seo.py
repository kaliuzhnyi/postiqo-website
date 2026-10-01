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
PUBLISHER = '/products/postiqo-publisher/'
CARDS = '/products/postiqo-cards/'
WEBSITE = '/products/postiqo-website/'
LOCAL_PAGES = '/products/postiqo-pages/'
DEMO = CARDS + 'demo/'
PAGES = {
    '/': 'index.html',
    '/products/': 'products/index.html',
    PUBLISHER: 'products/postiqo-publisher/index.html',
    CARDS: 'products/postiqo-cards/index.html',
    WEBSITE: 'products/postiqo-website/index.html',
    LOCAL_PAGES: 'products/postiqo-pages/index.html',
    '/try/': 'try/index.html',
    '/download/': 'download/index.html',
}


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
all_titles, all_descriptions = [], []
social_images = set()
for route, filename in PAGES.items():
    source = (ROOT / filename).read_text(encoding='utf-8')
    page = Page(source)
    parsed[route] = page
    assert '\u2014' not in source and '\u2013' not in source, f'{filename}: long dash'
    assert not re.search(r'C?\$(?:100|90)(?![\d,.])', source), f'{filename}: outdated Publisher pricing'
    assert len(re.findall(r'<h1\b', source)) == 1, f'{filename}: one H1 required'
    titles = re.findall(r'<title>(.*?)</title>', source)
    assert len(titles) == 1 and 15 < len(text(titles[0])) < 75, f'{filename}: title'
    all_titles.append(text(titles[0]))
    metas = [(attrs.get('name', attrs.get('property')), attrs.get('content', '')) for tag, attrs in page.elements if tag == 'meta']
    keys = [key for key, _ in metas if key]
    assert len(keys) == len(set(keys)), f'{filename}: duplicate metadata'
    meta = dict(metas)
    assert 80 < len(meta['description']) < 180, f'{filename}: description'
    all_descriptions.append(meta['description'])
    assert meta['robots'].startswith('index, follow'), f'{filename}: indexing disabled'
    assert 'keywords' not in meta
    for key in ('og:title', 'og:description', 'og:image', 'og:image:alt', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image', 'twitter:image:alt'):
        assert meta.get(key), f'{filename}: missing {key}'
    assert meta['og:url'] == ORIGIN + route
    assert meta['twitter:card'] == 'summary_large_image'
    for key in ('og:image', 'twitter:image'):
        image_url = urlsplit(meta[key])
        assert image_url.scheme == 'https' and image_url.netloc == 'postiqo.io'
        social_images.add(ROOT / image_url.path.lstrip('/'))
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
    nodes = [node for schema in schemas for node in schema.get('@graph', [schema])]
    for landmark in ('header', 'footer'):
        shared = re.search(r'<' + landmark + r'\b.*?</' + landmark + '>', source, re.S)[0]
        shared_links = {attrs.get('href') for tag, attrs in Page(shared).elements if tag == 'a'}
        assert {PUBLISHER, CARDS, WEBSITE, LOCAL_PAGES} <= shared_links, f'{filename}: incomplete product {landmark}'
    if route.startswith('/products/'):
        breadcrumb = next(node for node in nodes if node.get('@type') == 'BreadcrumbList')
        trail = breadcrumb['itemListElement']
        expected = ['/', '/products/'] + ([route] if route != '/products/' else [])
        assert [item['item'] for item in trail] == [ORIGIN + item for item in expected]
        assert [item['position'] for item in trail] == list(range(1, len(trail) + 1))
    if route in ('/', '/products/'):
        listing = next(node for node in nodes if node.get('@type') == 'ItemList')
        assert [item['item']['url'] for item in listing['itemListElement']] == [ORIGIN + PUBLISHER, ORIGIN + CARDS, ORIGIN + WEBSITE, ORIGIN + LOCAL_PAGES]
        assert [item['position'] for item in listing['itemListElement']] == [1, 2, 3, 4]
        tiles = re.findall(r'<article class="product-tile [^"]+">(.*?)</article>', source, re.S)
        assert len(tiles) == 4, f'{filename}: incomplete product catalog'
        assert f'href="{LOCAL_PAGES}"' in tiles[-1] and 'C$1,000' in text(tiles[-1])
    if route == LOCAL_PAGES:
        service = next(item for item in nodes if item.get('@id') == ORIGIN + LOCAL_PAGES + '#product')
        assert service['@type'] == 'Service' and service['url'] == ORIGIN + LOCAL_PAGES
        assert service['provider']['@id'] == ORIGIN + '/#organization'
        assert 'Starting at C$1,000 CAD' in service['description'] and 'Hosting is free.' in service['description']
        assert 'no Postiqo markup or commission' in service['description']
        assert not any(key in service for key in ('offers', 'aggregateRating', 'review')), 'Pages uses a starting quote, with no invented offers or ratings'
        assert 'Starting at C$1,000' in text(source) and 'Free hosting' in text(source)
        assert 'We add no markup and take no commission.' in text(source)
        headings = [int(tag[1]) for tag, _ in page.elements if re.fullmatch(r'h[1-6]', tag)]
        assert all(next_level <= level + 1 for level, next_level in zip(headings, headings[1:])), 'Pages heading hierarchy skips a level'
        links = {attrs.get('href') for tag, attrs in page.elements if tag == 'a'}
        assert '/?product=pages&request=quote#contact' in links
    if route == WEBSITE:
        service = next(item for item in nodes if item.get('@id') == ORIGIN + WEBSITE + '#product')
        assert service['@type'] == 'Service' and service['url'] == ORIGIN + WEBSITE
        assert service['provider']['@id'] == ORIGIN + '/#organization'
        assert 'C$3,500 CAD' in service['description'] and 'C$299 CAD per month' in service['description']
        assert 'offers' not in service, 'Do not turn setup plus recurring pricing into one fixed Offer'
        assert 'aggregateRating' not in service and 'review' not in service
        assert 'Starting at C$3,500' in text(source)
        assert 'Complex or custom DMS integrations may require additional setup work and will be quoted separately.' in text(source)
        headings = [int(tag[1]) for tag, _ in page.elements if re.fullmatch(r'h[1-6]', tag)]
        assert all(next_level <= level + 1 for level, next_level in zip(headings, headings[1:])), 'Website heading hierarchy skips a level'
        links = {attrs.get('href') for tag, attrs in page.elements if tag == 'a'}
        assert {'/?product=website&request=quote#contact', '/?product=website&request=demo#contact'} <= links
    if route == CARDS:
        product = next(item for item in nodes if item.get('@id') == ORIGIN + CARDS + '#product')
        assert product['url'] == ORIGIN + CARDS
        assert 'two active Postiqo Publisher subscriptions' in product['conditionsOfAccess']
        assert 'not sold separately' in product['conditionsOfAccess']
        assert 'C$298 per month' in product['conditionsOfAccess']
        assert 'offers' not in product, 'Cards must not advertise a standalone free offer'
        assert 'aggregateRating' not in product and 'review' not in product
    if route == PUBLISHER:
        product = next(item for item in nodes if item.get('@id') == ORIGIN + PUBLISHER + '#product')
        assert product['url'] == ORIGIN + PUBLISHER
        assert product['operatingSystem'] == 'Windows'
        assert [item['price'] for item in product['offers']] == ['149.00', '129.00']
        assert all(item['priceCurrency'] == 'CAD' for item in product['offers'])
        assert all(item['url'] == ORIGIN + PUBLISHER + '#pricing' for item in product['offers'])
        assert product['offers'][0]['eligibleQuantity']['minValue'] == 1
        assert product['offers'][0]['eligibleQuantity']['maxValue'] == 4
        assert product['offers'][1]['eligibleQuantity']['minValue'] == 5
        for offer in product['offers']:
            assert offer['priceSpecification']['price'] == offer['price']
            assert offer['priceSpecification']['billingDuration'] == 'P1M'
        assert 'aggregateRating' not in product and 'review' not in product
        faq = next(item for item in schemas if item.get('@type') == 'FAQPage')
        visible = re.findall(r'<details class="faq-item">(.*?)</details><!-- End Faq item-->', source, re.S)
        assert len(visible) == len(faq['mainEntity']) == 16
        for item, entry in zip(visible, faq['mainEntity']):
            assert text(re.search(r'<h3>(.*?)</h3>', item, re.S)[1]) == entry['name']
            answer = ' '.join(text(p) for p in re.findall(r'<p[^>]*>(.*?)</p>', item, re.S))
            assert answer == entry['acceptedAnswer']['text'], entry['name']
    print(f'PASS {route}: unique metadata, headings, social previews, structured data, and controls')

assert len(all_titles) == len(set(all_titles)), 'Repeated titles across pages'
assert len(all_descriptions) == len(set(all_descriptions)), 'Repeated descriptions across pages'

# The fictional vehicle is a usable demo, not an indexable vehicle for sale.
demo_source = (ROOT / 'products/postiqo-cards/demo/index.html').read_text(encoding='utf-8')
demo = Page(demo_source)
parsed[DEMO] = demo
demo_meta = {attrs.get('name', attrs.get('property')): attrs.get('content') for tag, attrs in demo.elements if tag == 'meta'}
assert demo_meta['robots'] == 'noindex, follow'
assert demo_meta['og:url'] == ORIGIN + DEMO
assert 'fictional' in demo_meta['description'].lower()
assert [attrs.get('href') for tag, attrs in demo.elements if tag == 'link' and attrs.get('rel') == 'canonical'] == [ORIGIN + DEMO]
assert len(re.findall(r'<h1\b', demo_source)) == 1
assert not re.search(r'data-vehicle-card|data-endpoint|data-demo-contact|class="demo-|<header|<aside', demo_source)
demo_contacts = {attrs.get('href') for tag, attrs in demo.elements if tag == 'a' and attrs.get('href', '').startswith(('tel:', 'mailto:'))}
site_contacts = {attrs.get('href') for tag, attrs in parsed['/'].elements if tag == 'a'}
assert demo_contacts == {'tel:+14374416585', 'mailto:support@postiqo.io'}
assert demo_contacts <= site_contacts, 'Demo must use the public website contacts'
assert re.search(r'<footer class="footer">Powered by <a href="https://postiqo.io/products/postiqo-cards/"[^>]*>Postiqo Cards</a></footer>', demo_source)
assert len([attrs for tag, attrs in demo.elements if tag == 'img' and attrs.get('alt', '').startswith('2023 Toyota RAV4 XLE AWD - photo')]) == 3
assert '\u2013' not in demo_source and '\u2014' not in demo_source
assert any(tag == 'a' and attrs.get('href') == DEMO for tag, attrs in parsed[CARDS].elements)
print('PASS Cards demo: noindex, self canonical, production layout, local gallery and public dealership contacts')

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
            if filename.endswith('/'):
                filename += 'index.html'
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
for image_path in social_images:
    with image_path.open('rb') as image:
        header = image.read(24)
    assert header[:8] == b'\x89PNG\r\n\x1a\n', f'{image_path}: expected PNG social image'
    assert struct.unpack('>II', header[16:24]) == (1200, 630), f'{image_path}: social image dimensions do not match metadata'
print('PASS sitemap, robots, template exclusions, all internal links/assets, and all 1200 x 630 social images')
