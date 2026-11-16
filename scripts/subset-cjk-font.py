"""
The common Chinese font: Noto Sans CJK SC cut down to the characters of
GB 2312 (its 6,763 hanzi and 682 other characters), with ASCII, Latin-1,
the CJK and full-width punctuation, and the dashes, quotes and ellipsis of
General Punctuation. 16 MB becomes about 1.4 MB as WOFF2. The editor loads it
first for Chinese text, and the full font only for characters outside it
(pdf-engine.js, preview.js; README, "Fonts").

    python3 scripts/subset-cjk-font.py

Reads dist/assets/fonts/NotoSansCJKsc-Regular.otf (node scripts/prepare-assets.mjs
assembles it) and writes dist/assets/fonts/NotoSansCJKsc-GB2312.woff2. Glyphs
keep the outlines and advance widths of the full font, and the layout
features that are always on (ccmp, mark, mkmk), so text measures and
looks the same with either: the export draws glyphs plain (pdf-engine.js,
PLAIN_GLYPHS), and the preview without kerning or ligatures. Every name record is kept:
the copyright, the version and the licence (SIL Open Font License 1.1, which
names no Reserved Font Name), as licenses/NotoSansCJK-OFL.txt notes.

Made with fontTools 4.68.0 and brotli 1.2.1; the same versions make the same
bytes. After a change, record the file in scripts/asset-checksums.json
(npm test says so).
"""
import pathlib

from fontTools import subset

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'dist/assets/fonts/NotoSansCJKsc-Regular.otf'
TARGET = ROOT / 'dist/assets/fonts/NotoSansCJKsc-GB2312.woff2'


def gb2312():
    """Every character GB 2312 encodes: rows 0xA1-0xF7, cells 0xA1-0xFE, as Python's codec decodes them."""
    found = set()
    for row in range(0xA1, 0xF8):
        for cell in range(0xA1, 0xFF):
            try:
                found.add(bytes([row, cell]).decode('gb2312'))
            except UnicodeDecodeError:
                pass
    return found


def characters():
    chars = gb2312()
    hanzi = sum(1 for char in chars if 0x4E00 <= ord(char) <= 0x9FFF)
    assert (len(chars), hanzi) == (7445, 6763), (len(chars), hanzi)
    ranges = [
        (0x20, 0x7E),  # ASCII
        (0xA0, 0xFF),  # Latin-1: names such as José beside Chinese
        (0x2010, 0x2027),  # dashes, quotes, the ellipsis
        (0x20AC, 0x20AC),  # the euro sign
        (0x2170, 0x217F),  # small roman numerals
        (0x3000, 0x3029),  # CJK symbols and punctuation (not the Hangul tone marks,
        (0x3030, 0x303F),  # which the full font positions as marks)
        (0xFE10, 0xFE1F),  # vertical forms
        (0xFE30, 0xFE4F),  # CJK compatibility forms
        (0xFF00, 0xFFEF),  # full-width and half-width forms
    ]
    for first, last in ranges:
        chars.update(chr(code) for code in range(first, last + 1))
    # What GBK adds to GB 2312's rows of symbols: the euro, the small roman
    # numerals and the vertical forms (above), and these pinyin letters.
    chars.update('ɑḿńňǹɡ')
    return chars


def main():
    options = subset.Options()
    options.flavor = 'woff2'
    # What browsers apply whatever the page asks (the preview turns kerning and
    # ligatures off, .ov-text in studio.css, as the export draws glyphs plain):
    # ccmp joins "——" into one long dash, as the full font does. Not locl: its
    # Japanese, Korean and Traditional forms of the same hanzi would double the
    # file, and neither the export nor a page of this site asks for them.
    options.layout_features = ['ccmp', 'mark', 'mkmk']
    options.name_IDs = ['*']
    options.name_languages = ['*']
    options.name_legacy = True
    options.notdef_outline = True
    font = subset.load_font(str(SOURCE), options)
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=[ord(char) for char in characters()])
    subsetter.subset(font)
    subset.save_font(font, str(TARGET), options)
    print(f'Wrote {TARGET.relative_to(ROOT)}: {font["maxp"].numGlyphs} glyphs, {TARGET.stat().st_size:,} bytes.')


if __name__ == '__main__':
    main()
