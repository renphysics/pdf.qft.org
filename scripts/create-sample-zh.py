"""
The Chinese sample, which a page under zh/ opens for 试用示例文档: the three
pages of the English sample (scripts/create-sample.py) in Chinese, with the same
layout, colours and drawing.

    python3 -I scripts/create-sample-zh.py

Needs Python reportlab and fontTools, and two fonts of dist/assets/fonts: Noto
Sans CJK SC (node scripts/prepare-assets.mjs assembles it) and Noto Sans, for the
page numbers. reportlab embeds TrueType outlines only, so the characters on the
pages are cut from Noto Sans CJK SC and its curves turned into TrueType's, within
a thousandth of an em. The repository has no bold Noto Sans CJK: where the English
sample is bold, this one strokes the letters as well as filling them.

Writes dist/assets/sample-zh.pdf, the same bytes each time (reportlab's invariant
mode). After a change, record it in scripts/asset-checksums.json (npm test says so).
"""
import io
import pathlib
import re

from fontTools import subset
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import newTable
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONTS = ROOT / 'dist/assets/fonts'
OUT = ROOT / 'dist/assets/sample-zh.pdf'

W, H = A4
INK = HexColor('#173D32')
MUTED = HexColor('#66766D')
CREAM = HexColor('#FBFAF5')
SAGE = HexColor('#E8EEE4')
LINE = HexColor('#D5DED2')
NUMBER = HexColor('#70836A')

TITLE = '留一点空间给创作'
SUBJECT = '一份用来试用 PDF 编辑工具的示例文档'
CORNER = '一份任你改动的示例'
INTRO = '好的作品，常常从简单的一页开始。这一页交给你：批注、整理，让它更有用一些。'
IDEA = ('想法', '更清楚的文档。', '几处用心的修改，就能让文档更易读、更好认，也更方便分享。')
TRY = '可以试试这些'
THINGS = [
    ('01', '加一条备注', '把有用的想法\n直接写在页面上。'),
    ('02', '打上你的印记', '加上水印，\n或每页都有的页脚。'),
    ('03', '理顺页面', '调整页面顺序，\n再存一份新的。'),
]
FREELY = '这里没有什么怕弄坏的。放心尝试，觉得满意了，就下载一份新的。'
CHECKLIST = ('小小的修改，', '更好的文档。', '用这份示例文档，试试下面五种修改。')
ITEMS = [
    ('加一行文字', '写上你的名字、一句简短的备注，或一条有用的提醒。'),
    ('加上统一的页脚', '给每一页加上相同的标注或网址。'),
    ('试试水印', '加一个淡淡的“草稿”字样，或标明这是你的作品。'),
    ('调整页面', '移动、旋转或删除页面，让内容的顺序更合适。'),
    ('保存你的副本', '预览效果，然后下载编辑后的 PDF。'),
]
NOTES = ('给自己', '留一点空间。', '这一页，留给你想记下的想法、问题和细节。')
REMEMBER = ('记住一件事', '清楚，是一个好的开始。')
NEXT = '笔记和下一步'
FOOTERS = ['项目简介', '修改清单', '你的笔记']


def texts():
    """Every string the pages show, for the font's characters."""
    found = [TITLE, SUBJECT, CORNER, INTRO, TRY, FREELY, NEXT, 'QFT PDF', *IDEA, *CHECKLIST, *NOTES, *REMEMBER, *FOOTERS]
    for number, title, description in THINGS:
        found += [number, title, description]
    for title, description in ITEMS:
        found += [title, description]
    return ''.join(found)


def truetype(source, text):
    """The glyphs of `text` in the CFF font `source`, as a TrueType font's bytes."""
    options = subset.Options()
    options.layout_features = []  # reportlab draws glyphs one by one
    options.name_IDs = ['*']
    options.name_languages = ['*']
    options.name_legacy = True
    options.notdef_outline = True
    font = subset.load_font(str(source), options)
    font.recalcBBoxes = True  # the TrueType glyphs' bounds
    subsetter = subset.Subsetter(options)
    subsetter.populate(text=text.replace('\n', ''))
    subsetter.subset(font)
    order = font.getGlyphOrder()
    outlines = font.getGlyphSet()
    glyf = newTable('glyf')
    glyf.glyphOrder = order
    glyf.glyphs = {}
    for name in order:
        pen = TTGlyphPen(outlines)
        outlines[name].draw(Cu2QuPen(pen, max_err=1.0, reverse_direction=True))
        glyf.glyphs[name] = pen.glyph()
    del font['CFF ']
    if 'VORG' in font:
        del font['VORG']
    font['loca'] = newTable('loca')
    font['glyf'] = glyf
    glyf.compile(font)
    for name, glyph in glyf.glyphs.items():
        font['hmtx'][name] = (font['hmtx'][name][0], getattr(glyph, 'xMin', 0))
    maxp = font['maxp'] = newTable('maxp')
    maxp.tableVersion = 0x00010000
    maxp.maxZones = 1
    for field in ['maxTwilightPoints', 'maxStorage', 'maxFunctionDefs', 'maxInstructionDefs',
                  'maxStackElements', 'maxSizeOfInstructions', 'maxComponentElements']:
        setattr(maxp, field, 0)
    post = font['post']
    post.formatType = 2.0
    post.extraNames = []
    post.mapping = {}
    post.glyphOrder = order
    font.sfntVersion = '\x00\x01\x00\x00'
    data = io.BytesIO()
    font.save(data)
    return data.getvalue()


pdfmetrics.registerFont(TTFont('CJK', io.BytesIO(truetype(FONTS / 'NotoSansCJKsc-Regular.otf', texts()))))
pdfmetrics.registerFont(TTFont('Sans', str(FONTS / 'NotoSans-Regular.ttf')))


def txt(c, x, y, text, size=10, color=INK, font='CJK', bold=False, right=False):
    # (No letter spacing: a reader would take each character for a word.)
    if right:
        x -= pdfmetrics.stringWidth(text, font, size)
    c.saveState()
    c.setFillColor(color)
    c.setStrokeColor(color)
    c.setLineWidth(size * 0.04)
    words = c.beginText(x, y)
    words.setFont(font, size)
    words.setTextRenderMode(2 if bold else 0)
    words.textOut(text)
    c.drawText(words)
    c.restoreState()


# Punctuation that does not begin a line, and that does not end one.
NO_START = set('，。、；：？！）》”’…—')
NO_END = set('（《“‘')


def lines(text, size, width):
    """Chinese wrapped to `width`: between any two characters, Latin words kept whole."""
    result, line = [], ''
    for piece in re.findall(r'[A-Za-z0-9]+|.', text):
        if line and pdfmetrics.stringWidth(line + piece, 'CJK', size) > width and piece not in NO_START and line[-1] not in NO_END:
            result.append(line.rstrip())
            line = piece.lstrip()
        else:
            line += piece
    return result + [line]


def paragraph(c, text, x, y, width, size=10.5, leading=18, color=MUTED):
    for line in lines(text, size, width):
        txt(c, x, y, line, size, color)
        y -= leading
    return y


def base(c, number, label):
    c.setFillColor(CREAM)
    c.rect(0, 0, W, H, stroke=0, fill=1)
    txt(c, 54, H - 58, 'QFT PDF', 13, bold=True)
    txt(c, W - 54, H - 55, CORNER, 7.5, MUTED, right=True)
    c.setStrokeColor(LINE)
    c.setLineWidth(.6)
    c.line(54, 62, W - 54, 62)
    txt(c, 54, 43, label, 8, MUTED)
    txt(c, W - 54, 43, f'{number} / 3', 8, MUTED, font='Sans', right=True)


c = canvas.Canvas(str(OUT), pagesize=A4, pageCompression=1, invariant=1, lang='zh-CN')
# The day it was made, not the year 2000 of reportlab's invariant mode: Document
# properties shows it.
c.setDateFormatter(lambda *_: "D:20261116000000+08'00'")
c.setTitle(f'QFT PDF - {TITLE}')
c.setAuthor('QFT PDF')
c.setCreator('QFT PDF')
c.setSubject(SUBJECT)

# 1 / 项目简介
base(c, 1, FOOTERS[0])
txt(c, 54, 700, '留一点空间', 38)
txt(c, 54, 648, '给创作。', 38)
paragraph(c, INTRO, 56, 604, 400, 10.5, 18)

c.setFillColor(SAGE)
c.roundRect(54, 357, W - 108, 164, 13, stroke=0, fill=1)
txt(c, 76, 493, IDEA[0], 8, MUTED, bold=True)
txt(c, 76, 456, IDEA[1], 21)
paragraph(c, IDEA[2], 76, 426, 277, 9.5, 16)
# The same vector drawing of paper as the English sample's.
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

txt(c, 54, 310, TRY, 8, MUTED, bold=True)
for x, (number, title, description) in zip([54, 221, 388], THINGS):
    txt(c, x, 273, number, 22, NUMBER, font='Sans')
    txt(c, x, 245, title, 10.5, bold=True)
    for i, line in enumerate(description.split('\n')):
        txt(c, x, 224 - i * 15, line, 9, MUTED)
paragraph(c, FREELY, 54, 135, 410, 9.5, 16)
c.showPage()

# 2 / 修改清单
base(c, 2, FOOTERS[1])
txt(c, 54, 707, CHECKLIST[0], 32)
txt(c, 54, 662, CHECKLIST[1], 32)
paragraph(c, CHECKLIST[2], 56, 622, 420, 10, 17)
for i, (title, description) in enumerate(ITEMS):
    top = 575 - i * 88
    c.setFillColor(SAGE if i % 2 == 0 else HexColor('#F1F3EC'))
    c.roundRect(54, top - 64, W - 108, 72, 8, stroke=0, fill=1)
    c.setStrokeColor(HexColor('#92A58B'))
    c.setLineWidth(1)
    c.roundRect(73, top - 24, 17, 17, 3, stroke=1, fill=0)
    txt(c, 107, top - 16, title, 11, bold=True)
    paragraph(c, description, 107, top - 37, 375, 9.5, 14)
c.showPage()

# 3 / 你的笔记
base(c, 3, FOOTERS[2])
txt(c, 54, 707, NOTES[0], 32)
txt(c, 54, 662, NOTES[1], 32)
paragraph(c, NOTES[2], 56, 622, 430, 10, 17)
c.setFillColor(SAGE)
c.roundRect(54, 514, W - 108, 68, 8, stroke=0, fill=1)
txt(c, 73, 558, REMEMBER[0], 8, MUTED, bold=True)
txt(c, 73, 533, REMEMBER[1], 14)
txt(c, 54, 474, NEXT, 8, MUTED, bold=True)
c.setStrokeColor(LINE)
c.setLineWidth(.6)
for y in range(441, 120, -35):
    c.line(54, y, W - 54, y)
c.save()
print(f'Wrote {OUT.relative_to(ROOT)}: {OUT.stat().st_size:,} bytes.')
