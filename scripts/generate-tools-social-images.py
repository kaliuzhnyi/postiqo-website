"""Render the public tools' branded 1200 x 630 sharing cards with Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]


def font(size, weight=800):
    face = ImageFont.truetype(str(ROOT / 'assets/fonts/Nunito-VariableFont_wght.ttf'), size)
    face.set_variation_by_axes([weight])
    return face


for slug, label, lines, items, accent in [
    ('tools', 'FREE TOOLS FROM POSTIQO', ['Small tools.', 'A little less', 'guesswork.'], ['Car payment calculator', 'VIN decoder'], '#0868cb'),
    ('car-payment-calculator', 'FREE CAR PAYMENT CALCULATOR', ['Your next car.', 'Run the', 'numbers.'], ['Monthly / Bi-weekly / Weekly', 'Canadian tax presets'], '#0868cb'),
    ('vin-decoder', 'FREE VIN DECODER', ['17 characters.', 'A clearer', 'picture.'], ['Vehicle identity & specs', 'Powered by NHTSA data'], '#08756b'),
]:
    img = Image.new('RGB', (1200, 630), '#eff8f3' if slug == 'vin-decoder' else '#f2f7fc')
    draw = ImageDraw.Draw(img)
    draw.text((65, 38), 'postiqo', font=font(40, 900), fill='#18354d')
    draw.text((65, 135), label, font=font(16), fill=accent)
    for i, line in enumerate(lines):
        draw.text((60, 185 + i * 80), line, font=font(67, 900), fill=accent if i == 2 else '#18354d')
    for i, item in enumerate(items):
        y = 210 + i * 135
        draw.rounded_rectangle((770, y, 1135, y + 108), radius=19, fill='white', outline='#d6e3ed', width=2)
        draw.rounded_rectangle((792, y + 24, 799, y + 84), radius=3, fill=accent)
        draw.text((820, y + 40), item, font=font(20, 750), fill='#18354d')
    draw.text((65, 473), 'Free to use. No account needed.', font=font(24, 600), fill='#52697c')
    draw.line((65, 541, 1135, 541), fill='#d6e3ed', width=2)
    path = '/tools/' + (slug + '/' if slug != 'tools' else '')
    draw.text((65, 561), 'postiqo.io' + path, font=font(19, 650), fill='#18354d')
    img.save(ROOT / f'public/og-{slug}.png', optimize=True)
    print(f'Created og-{slug}.png')
