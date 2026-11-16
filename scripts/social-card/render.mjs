// Regenerates the sharing cards (1200x630) and dist/apple-touch-icon.png from the
// HTML templates beside this script. Needs Playwright with Chromium (installed with
// the repository's packages: `npx playwright install chromium`) and Python 3 with
// Pillow, which palette-compresses the cards:
//   node scripts/social-card/render.mjs       dist/assets/social-card.png and the icon
//   node scripts/social-card/render.mjs zh    dist/assets/social-card-zh.png (the zh/ pages)
// The English card's serif is Bitstream Charter, falling back to Georgia. The
// Chinese card's Chinese is drawn in the site's common Chinese font
// (dist/assets/fonts/NotoSansCJKsc-GB2312.woff2), so it looks the same wherever it
// is made.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const dist = (name) => fileURLToPath(new URL(`../../dist/${name}`, import.meta.url));
const chinese = process.argv[2] === 'zh';
const browser = await chromium.launch();
const shoot = async (template, width, height, output) => {
  const page = await (
    await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })
  ).newPage();
  await page.goto(new URL(template, import.meta.url).href);
  if (chinese) {
    const font = (await readFile(dist('assets/fonts/NotoSansCJKsc-GB2312.woff2'))).toString('base64');
    await page.addStyleTag({
      content: `@font-face { font-family: 'QFT CJK'; src: url(data:font/woff2;base64,${font}) format('woff2'); }`,
    });
    await page.evaluate(() => document.fonts.load("92px 'QFT CJK'", '每'));
  }
  await page.screenshot({ path: output });
};
const outputs = chinese
  ? [dist('assets/social-card-zh.png')]
  : [dist('assets/social-card.png'), dist('apple-touch-icon.png')];
if (chinese) await shoot('card-zh.html', 1200, 630, outputs[0]);
else {
  await shoot('card.html', 1200, 630, outputs[0]);
  await shoot('icon.html', 180, 180, outputs[1]);
}
await browser.close();
execFileSync(
  process.env.PYTHON || 'python3',
  [
    '-I',
    '-c',
    [
      'import sys',
      'from PIL import Image',
      "card = Image.open(sys.argv[1]).convert('RGB')",
      'card.quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(sys.argv[1], optimize=True)',
      "if len(sys.argv) > 2: Image.open(sys.argv[2]).convert('RGB').save(sys.argv[2], optimize=True)",
    ].join('\n'),
    ...outputs,
  ],
  { stdio: 'inherit' },
);
console.log('Wrote', outputs.join(' and '));
