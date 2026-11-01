// TEMPORARY: records what a crop drag sends in Firefox (removed once understood).
import { test, openSample } from './helpers.mjs';

test('diagnose crop drag', async ({ page, browserName }) => {
  test.skip(browserName !== 'firefox', 'Firefox only');
  await openSample(page, 'crop-pdf/');
  await page.evaluate(() => {
    window.events = [];
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'gotpointercapture', 'lostpointercapture', 'mousedown', 'dragstart'])
      document.addEventListener(type, (event) => {
        if (window.events.length < 40)
          window.events.push([type, event.target.className?.baseVal ?? event.target.className, Math.round(event.clientX), Math.round(event.clientY), event.buttons, event.pointerId, event.defaultPrevented].join(' '));
      }, true);
  });
  const box = await page.locator('.page-view.current').boundingBox();
  const start = [box.x + box.width * 0.1, box.y + box.height * 0.1];
  console.log('viewport', JSON.stringify(page.viewportSize()), 'box', JSON.stringify(box));
  console.log('at start', await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el?.tagName + '.' + (el?.className?.baseVal ?? el?.className); }, start));
  await page.mouse.move(...start);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.4, { steps: 3 });
  await page.mouse.up();
  console.log('events', JSON.stringify(await page.evaluate(() => window.events), null, 1));
  console.log('top field', await page.locator('#tool-form [name="top"]').inputValue());
});
