"""Regenerate the six typographic social previews. Requires Pillow; no site build step."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FONT = ROOT / 'assets/fonts/Nunito-VariableFont_wght.ttf'
INK, MUTED, BLUE, TEAL = '#18354d', '#52697c', '#0868cb', '#08756b'
PURPLE = '#7350b5'


def font(size, weight=700):
    face = ImageFont.truetype(str(FONT), size)
    face.set_variation_by_axes([weight])
    return face


def panel(draw, x, y, name, detail, accent, height=128):
    draw.rounded_rectangle((x, y, x + 337, y + height), 19, fill='white', outline='#d6e3ed', width=2)
    draw.rounded_rectangle((x + 23, y + 27, x + 29, y + height - 29), 3, fill=accent)
    title_y, detail_y = (12, 48) if height == 90 else (22, 61) if height == 104 else (27, 68)
    for value, size, weight, offset, colour in [(name, 25, 850, title_y, INK), (detail, 18, 550, detail_y, MUTED)]:
        face = font(size, weight)
        while draw.textlength(value, font=face) > 265:
            size -= 1
            face = font(size, weight)
        draw.text((x + 48, y + offset), value, font=face, fill=colour)


variants = {
    'home': ('SOFTWARE FOR CAR DEALERSHIPS', ['Less admin.', 'More time', 'with buyers.'], 'Vehicle listings. QR cards. Websites for your business.', BLUE),
    'products': ('MEET THE POSTIQO PRODUCTS', ['Your business.', 'More ways', 'to connect.'], 'Publisher / Digital Cards / Website / Pages', BLUE),
    'publisher': ('POSTIQO PUBLISHER', ['Automate car', 'listings. Get back', 'to selling.'], 'Craigslist + Digital Cards included with 2+ accounts', BLUE),
    'cards': ('POSTIQO CARDS', ['Print once.', 'Keep the', 'price current.'], 'Digital vehicle window stickers with QR codes', TEAL),
    'website': ('POSTIQO WEBSITE', ['Keep your DMS.', 'Upgrade your', 'website.'], 'Custom dealership websites. Connected to your inventory.', BLUE),
    'pages': ('POSTIQO PAGES', ['Your business.', 'A place', 'online.'], 'Simple websites. Free hosting. Your domain at cost.', PURPLE),
}
for slug, (eyebrow, lines, caption, accent) in variants.items():
    background = '#f5effb' if slug == 'pages' else '#eff8f3' if slug == 'cards' else '#f2f7fc'
    image = Image.new('RGB', (1200, 630), background)
    draw = ImageDraw.Draw(image)
    draw.text((65, 37), 'postiqo', font=font(40, 900), fill=INK)
    draw.text((65, 130), eyebrow, font=font(16, 800), fill=accent)
    for index, line in enumerate(lines):
        draw.text((60, 180 + index * 80), line, font=font(68, 900), fill=accent if index == 2 else INK)
    draw.text((65, 473), caption, font=font(22, 550), fill=MUTED)
    if slug == 'cards':
        panel(draw, 797, 190, 'Scan. Explore. Connect.', 'Price, photos and dealer contacts', TEAL)
        panel(draw, 797, 342, 'Included with your team', '2+ active Publisher subscriptions', TEAL)
    elif slug == 'publisher':
        panel(draw, 797, 190, 'Postiqo Publisher', 'Publish, update, renew, remove', BLUE)
        panel(draw, 797, 342, 'C$149 / account / month', 'C$129 per account with 5+ accounts', BLUE)
    elif slug == 'website':
        panel(draw, 797, 190, 'Your DMS stays.', 'Your inventory stays connected.', BLUE)
        panel(draw, 797, 342, 'Starting at C$3,500 setup', '+ C$299/month managed service', BLUE)
    elif slug == 'pages':
        panel(draw, 797, 190, 'Built for local business', 'One landing page or a few pages.', PURPLE)
        panel(draw, 797, 342, 'Starting at C$1,000', 'Free hosting. Domain at cost.', PURPLE)
    else:
        panel(draw, 797, 130, 'Postiqo Publisher', 'Your listings, automated.', BLUE, height=90)
        panel(draw, 797, 230, 'Postiqo Digital Cards', 'Your lot, connected.', TEAL, height=90)
        panel(draw, 797, 330, 'Postiqo Website', 'Your website, upgraded.', BLUE, height=90)
        panel(draw, 797, 430, 'Postiqo Pages', 'Your local business, online.', PURPLE, height=90)
    draw.line((65, 541, 1135, 541), fill='#d6e3ed', width=2)
    suffix = f'/products/postiqo-{slug}/' if slug in ('website', 'pages') else '/products/' if slug == 'products' else ''
    draw.text((65, 561), 'postiqo.io' + suffix, font=font(18, 650), fill=INK)
    if slug == 'cards':
        draw.text((520, 561), 'No additional Cards fees. Not sold separately.', font=font(18, 600), fill=MUTED)
    image.save(ROOT / f'public/og-{slug}.png', optimize=True)
    print(f'Created public/og-{slug}.png (1200 x 630)')
