// Regenerates dist/assets/social-card.png (1200x630) and dist/apple-touch-icon.png
// from the HTML templates beside this script. Needs Playwright with Chromium
// (for example `npm install --no-save playwright && npx playwright install chromium`)
// and Python 3 with Pillow, which palette-compresses the card:
//   node scripts/social-card/render.mjs
// The card's serif is Bitstream Charter, falling back to Georgia.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dist = (name) => fileURLToPath(new URL(`../../dist/${name}`, import.meta.url));
const browser = await chromium.launch();
const shoot = async (template, width, height, output) => {
  const page = await (await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })).newPage();
  await page.goto(new URL(template, import.meta.url).href);
  await page.screenshot({ path: output });
};
await shoot('card.html', 1200, 630, dist('assets/social-card.png'));
await shoot('icon.html', 180, 180, dist('apple-touch-icon.png'));
await browser.close();
execFileSync(process.env.PYTHON || 'python3', ['-I', '-c', [
  'import sys',
  'from PIL import Image',
  "card = Image.open(sys.argv[1]).convert('RGB')",
  "card.quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(sys.argv[1], optimize=True)",
  "Image.open(sys.argv[2]).convert('RGB').save(sys.argv[2], optimize=True)",
].join('\n'), dist('assets/social-card.png'), dist('apple-touch-icon.png')], { stdio: 'inherit' });
console.log('Wrote', dist('assets/social-card.png'), 'and', dist('apple-touch-icon.png'));
