"""Rebuild the QR code, print card, and social graphics with Pillow/reportlab."""
from pathlib import Path
import zipfile
from PIL import Image, ImageDraw, ImageFont, ImageOps
from reportlab.graphics.barcode import qrencoder
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'kit'
URL = 'https://esai.3dvr.tech/'
BG = '#14231e'
PAPER = '#f5f3e9'
LIME = '#d3f96b'
MUTED = '#bec9bf'
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

def font(size, bold=False):
  return ImageFont.truetype(BOLD if bold else FONT, size)

qr = qrencoder.QRCode(None, qrencoder.QRErrorCorrectLevel.M)
qr.addData(URL)
qr.make()
count = qr.getModuleCount()
unit = 10
qr_image = Image.new('RGB', ((count + 8) * unit,) * 2, 'white')
d = ImageDraw.Draw(qr_image)
paths = []
for y in range(count):
  for x in range(count):
    if qr.isDark(y, x):
      d.rectangle(((x + 4) * unit, (y + 4) * unit, (x + 5) * unit - 1, (y + 5) * unit - 1), fill='black')
      paths.append(f'M{x+4},{y+4}h1v1h-1z')
qr_image.save(OUT / 'qr-code.png')
(OUT / 'qr-code.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {count+8} {count+8}" shape-rendering="crispEdges"><title>Esai Gamboa portfolio QR code</title><rect width="100%" height="100%" fill="white"/><path d="{"".join(paths)}" fill="black"/></svg>\n')

def text(draw, xy, label, size, color=PAPER, bold=False):
  draw.text(xy, label, font=font(size, bold), fill=color, stroke_width=0)

def paste_qr(image, x, y, size):
  image.paste(qr_image.resize((size, size), Image.Resampling.NEAREST), (x, y))

portrait = Image.open(ROOT / 'portrait.jpg').convert('RGB')

def card(back=False):
  image = Image.new('RGB', (1125, 675), PAPER if back else BG)
  d = ImageDraw.Draw(image)
  if not back:
    text(d, (76, 76), 'EG / AV & LIVE EVENTS', 23, LIME, True)
    text(d, (72, 185), 'Esai', 88, PAPER, True)
    text(d, (72, 285), 'Gamboa', 88, PAPER, True)
    d.line((76, 448, 688, 448), fill='#58665b', width=2)
    text(d, (76, 481), 'BEHIND THE SCENES.', 21)
    text(d, (76, 515), 'PART OF THE SHOW.', 21, LIME)
    paste_qr(image, 756, 188, 278)
    text(d, (781, 490), 'SCAN TO CONNECT', 17, LIME, True)
    text(d, (76, 574), 'esai.3dvr.tech', 19)
  else:
    text(d, (76, 75), 'THE NEXT SHOW STARTS', 32, BG, True)
    text(d, (76, 119), 'WITH A CONNECTION.', 32, BG, True)
    d.line((76, 204, 1049, 204), fill='#abb7a1', width=2)
    text(d, (76, 250), 'Esai Gamboa', 47, BG, True)
    text(d, (76, 324), 'AV & live events', 28, BG)
    text(d, (76, 409), 'Encore / SD Showdown / IATSE Local 122', 23, BG)
    text(d, (76, 481), 'BOOK ESAI DIRECTLY', 21, BG)
    text(d, (76, 521), 'gamboaesai@gmail.com', 26, BG, True)
    text(d, (680, 481), '(858) 463-9753', 24, BG, True)
    text(d, (76, 579), 'esai.3dvr.tech', 20, BG)
  return image

front, back = card(), card(True)
front.save(OUT / 'business-card-front.png', dpi=(300, 300))
back.save(OUT / 'business-card-back.png', dpi=(300, 300))
pdf = canvas.Canvas(str(OUT / 'business-card.pdf'), pagesize=(270, 162))
pdf.setTitle('Esai Gamboa - two-sided business card with 0.125 inch bleed')
for side in (front, back):
  pdf.drawImage(ImageReader(side), 0, 0, width=270, height=162)
  pdf.showPage()
pdf.save()

def square():
  image = Image.new('RGB', (1080, 1080), BG)
  d = ImageDraw.Draw(image)
  text(d, (65, 49), 'EG / AV & LIVE EVENTS', 23, LIME, True)
  image.paste(ImageOps.fit(portrait, (400, 480)), (615, 145))
  text(d, (60, 160), 'Esai', 96, PAPER, True)
  text(d, (60, 275), 'Gamboa', 96, PAPER, True)
  text(d, (65, 447), 'Behind the scenes.', 31)
  text(d, (65, 493), 'Part of the show.', 31, LIME)
  d.line((65, 670, 1015, 670), fill='#58665b', width=2)
  text(d, (65, 714), 'AV & LIVE EVENTS', 30, LIME, True)
  text(d, (65, 768), 'Experience with Encore', 25)
  text(d, (65, 807), 'SD Showdown / IATSE Local 122', 22)
  text(d, (65, 915), 'Explore the portfolio', 29, PAPER, True)
  text(d, (65, 971), 'esai.3dvr.tech', 25)
  paste_qr(image, 775, 754, 240)
  return image

def story():
  image = Image.new('RGB', (1080, 1920), BG)
  d = ImageDraw.Draw(image)
  text(d, (80, 160), 'EG / AV & LIVE EVENTS', 28, LIME, True)
  text(d, (73, 250), 'Esai Gamboa', 99, PAPER, True)
  image.paste(ImageOps.fit(portrait, (920, 760)), (80, 425))
  text(d, (80, 1250), 'Behind the scenes.', 52, PAPER, True)
  text(d, (80, 1325), 'Part of the show.', 52, LIME, True)
  text(d, (80, 1460), 'Experience with Encore', 30)
  text(d, (80, 1507), 'SD Showdown / IATSE Local 122', 26)
  text(d, (80, 1648), 'SCAN TO CONNECT', 26, LIME, True)
  text(d, (80, 1701), 'esai.3dvr.tech', 27)
  paste_qr(image, 738, 1460, 260)
  return image

def landscape():
  image = Image.new('RGB', (1200, 630), BG)
  d = ImageDraw.Draw(image)
  image.paste(ImageOps.fit(portrait, (370, 490)), (760, 70))
  text(d, (65, 65), 'EG / AV & LIVE EVENTS', 22, LIME, True)
  text(d, (59, 140), 'Esai Gamboa', 83, PAPER, True)
  text(d, (65, 272), 'Behind the scenes.', 36)
  text(d, (65, 326), 'Part of the show.', 36, LIME)
  text(d, (65, 463), 'Encore / SD Showdown / IATSE Local 122', 22)
  text(d, (65, 518), 'esai.3dvr.tech', 27, PAPER, True)
  return image

square().save(OUT / 'social-square.png')
story().save(OUT / 'social-story.png')
landscape().save(OUT / 'social-link.png')
with zipfile.ZipFile(OUT / 'esai-marketing-kit.zip', 'w', zipfile.ZIP_DEFLATED) as z:
  for path in sorted(OUT.iterdir()):
    if path.suffix in ('.png', '.svg', '.pdf', '.txt'):
      z.write(path, path.name)
print(f'Generated QR target: {URL}')
