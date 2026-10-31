"""Generate QFT PDF's original sample document and geometry test fixtures."""
from pathlib import Path
import os
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, Color
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import simpleSplit
from pypdf import PdfReader, PdfWriter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist/assets/sample.pdf'
FIXTURES = ROOT / 'tests/fixtures'
TMP = ROOT / 'tmp/pdfs'
for directory in [OUT.parent, FIXTURES, TMP]:
    directory.mkdir(parents=True, exist_ok=True)
font_directory = os.environ.get('QFT_SAMPLE_FONT_DIR')
if not font_directory and os.environ.get('CODEX_PRIMARY_RUNTIME_ROOT'):
    font_directory = str(Path(os.environ['CODEX_PRIMARY_RUNTIME_ROOT']) / 'dependencies/native/libreoffice-headless/libreoffice/share/fonts/truetype')
if not font_directory:
    raise SystemExit('Set QFT_SAMPLE_FONT_DIR to a folder containing NotoSans-Regular.ttf, NotoSans-Bold.ttf and NotoSerif-Regular.ttf.')
FONTS = Path(font_directory)
for name, filename in [('Sans', 'NotoSans-Regular.ttf'), ('SansBold', 'NotoSans-Bold.ttf'), ('Serif', 'NotoSerif-Regular.ttf')]:
    pdfmetrics.registerFont(TTFont(name, str(FONTS / filename)))

W, H = A4
INK = HexColor('#173D32')
MUTED = HexColor('#66766D')
CREAM = HexColor('#FBFAF5')
SAGE = HexColor('#E8EEE4')
LINE = HexColor('#D5DED2')

def txt(c, x, y, text, font='Sans', size=10, color=INK):
    c.setFillColor(color)
    c.setFont(font, size)
    c.drawString(x, y, text)

def paragraph(c, text, x, y, width, size=11, leading=17, color=MUTED):
    for line in simpleSplit(text, 'Sans', size, width):
        txt(c, x, y, line, size=size, color=color)
        y -= leading
    return y

def base(c, number, label):
    c.setFillColor(CREAM)
    c.rect(0, 0, W, H, stroke=0, fill=1)
    txt(c, 54, H - 58, 'QFT PDF', 'SansBold', 13)
    txt(c, W - 205, H - 55, 'A SAMPLE TO MAKE YOUR OWN', size=7, color=MUTED)
    c.setStrokeColor(LINE)
    c.setLineWidth(.6)
    c.line(54, 62, W - 54, 62)
    txt(c, 54, 43, label, size=8, color=MUTED)
    c.setFont('Sans', 8)
    c.setFillColor(MUTED)
    c.drawRightString(W - 54, 43, f'{number} / 3')

c = canvas.Canvas(str(OUT), pagesize=A4, pageCompression=1)
c.setTitle('QFT PDF - A little room to create')
c.setAuthor('QFT PDF')
c.setSubject('A sample document for trying PDF editing tools')

# 1 / Project brief
base(c, 1, 'PROJECT BRIEF')
txt(c, 54, 704, 'A little room', 'Serif', 43)
txt(c, 54, 649, 'to create.', 'Serif', 43)
paragraph(c, 'Good work often starts with a simple page. This one is yours to annotate, arrange, and make a little more useful.', 57, 606, 400, 11, 18)

c.setFillColor(SAGE)
c.roundRect(54, 357, W - 108, 164, 13, stroke=0, fill=1)
txt(c, 76, 493, 'THE IDEA', 'SansBold', 8, MUTED)
txt(c, 76, 454, 'A clearer document.', 'Serif', 23)
paragraph(c, 'A few thoughtful changes can make a document easier to read, recognize, and share.', 76, 425, 277, 10, 16)
# Original vector paper illustration.
c.saveState()
c.translate(427, 405)
c.rotate(-12)
c.setFillColor(HexColor('#C8D6C3'))
c.roundRect(-38, -5, 65, 89, 4, stroke=0, fill=1)
c.rotate(17)
c.setFillColor(CREAM)
c.roundRect(-26, -4, 65, 89, 4, stroke=0, fill=1)
c.setStrokeColor(HexColor('#A6B8A1'))
c.setLineWidth(2)
for y in [61, 48, 35, 22]:
    c.line(-14, y, 24 if y != 22 else 11, y)
c.restoreState()

txt(c, 54, 310, 'A FEW THINGS TO TRY', 'SansBold', 8, MUTED)
for x, num, title, desc in [
    (54, '01', 'Add a note', 'Put a useful thought\nright on the page.'),
    (221, '02', 'Make it yours', 'Add a watermark\nor recurring footer.'),
    (388, '03', 'Find the flow', 'Reorder pages, then\nsave a fresh copy.'),
]:
    txt(c, x, 273, num, 'Serif', 22, HexColor('#70836A'))
    txt(c, x, 244, title, 'SansBold', 10)
    for i, line in enumerate(desc.split('\n')):
        txt(c, x, 223 - i * 15, line, size=9, color=MUTED)
paragraph(c, 'Nothing precious here. Experiment freely, and download a new copy when it feels right.', 54, 135, 410, 10, 16)
c.showPage()

# 2 / Checklist
base(c, 2, 'WORKFLOW CHECKLIST')
txt(c, 54, 711, 'Small changes.', 'Serif', 35)
txt(c, 54, 665, 'A better document.', 'Serif', 35)
paragraph(c, 'Try these five edits with the sample document.', 56, 624, 420, 10, 17)
items = [
    ('Add a line of text', 'Place your name, a short note, or a useful reminder.'),
    ('Repeat a footer', 'Give every page a common label or a website address.'),
    ('Try a watermark', 'Use a subtle draft label or identify your own work.'),
    ('Reorder a page', 'Move, rotate, or remove a page to get the right flow.'),
    ('Save your own copy', 'Preview the result and download the edited PDF.'),
]
for i, (title, desc) in enumerate(items):
    top = 575 - i * 88
    c.setFillColor(SAGE if i % 2 == 0 else HexColor('#F1F3EC'))
    c.roundRect(54, top - 64, W - 108, 72, 8, stroke=0, fill=1)
    c.setStrokeColor(HexColor('#92A58B'))
    c.setLineWidth(1)
    c.roundRect(73, top - 24, 17, 17, 3, stroke=1, fill=0)
    txt(c, 107, top - 15, title, 'SansBold', 11)
    paragraph(c, desc, 107, top - 36, 375, 9, 14)
c.showPage()

# 3 / Notes
base(c, 3, 'YOUR NOTES')
txt(c, 54, 711, 'Leave yourself', 'Serif', 35)
txt(c, 54, 665, 'a little space.', 'Serif', 35)
paragraph(c, 'A page for the ideas, questions, and details you want to keep.', 56, 624, 430, 10, 17)
c.setFillColor(SAGE)
c.roundRect(54, 514, W - 108, 68, 8, stroke=0, fill=1)
txt(c, 73, 558, 'ONE THING TO REMEMBER', 'SansBold', 8, MUTED)
txt(c, 73, 535, 'Clarity is a good place to begin.', 'Serif', 15)
txt(c, 54, 474, 'NOTES & NEXT STEPS', 'SansBold', 8, MUTED)
c.setStrokeColor(LINE)
c.setLineWidth(.6)
for y in range(441, 120, -35):
    c.line(54, y, W - 54, y)
c.save()

# Geometry fixture: four crop offsets and cardinal orientations.
raw = TMP / 'geometry-raw.pdf'
t = canvas.Canvas(str(raw), pagesize=(600, 800), pageCompression=1)
for angle in [0, 90, 180, 270]:
    t.setFillColor(HexColor('#F8F8F2'))
    t.rect(0, 0, 600, 800, stroke=0, fill=1)
    t.setStrokeColor(INK)
    t.rect(40, 55, 520, 690, stroke=1, fill=0)
    txt(t, 55, 720, f'ROTATION {angle}', 'SansBold', 17)
    txt(t, 55, 695, 'Cropped to (30, 40) - (570, 760)', size=11)
    txt(t, 55, 70, 'BOTTOM LEFT', size=10)
    txt(t, 420, 720, 'TOP RIGHT', size=10)
    t.showPage()
t.save()
reader = PdfReader(raw)
writer = PdfWriter()
for angle, page in zip([0, 90, 180, 270], reader.pages):
    page.cropbox.lower_left = (30, 40)
    page.cropbox.upper_right = (570, 760)
    if angle:
        page.rotate(angle)
    writer.add_page(page)
with (FIXTURES / 'rotated-cropped.pdf').open('wb') as stream:
    writer.write(stream)
locked = PdfWriter()
locked.add_page(PdfReader(OUT).pages[0])
locked.encrypt('folio-test')
with (FIXTURES / 'encrypted.pdf').open('wb') as stream:
    locked.write(stream)
print(f'Created {OUT}: {len(PdfReader(OUT).pages)} pages, {OUT.stat().st_size} bytes')
print('Created rotated-cropped.pdf and encrypted.pdf test fixtures.')
