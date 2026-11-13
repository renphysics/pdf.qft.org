// axe-core finds no accessibility violations on the pages, in the editor's
// tools and states, and in the dialogs.
import { createRequire } from 'node:module';
import AxeBuilder from '@axe-core/playwright';
import {
  test,
  expect,
  expectToast,
  fixture,
  openSample,
  ready,
  useTool,
  download,
  previewDifference,
  writeTemporary,
  root,
} from './helpers.mjs';

const { createCanvas } = createRequire(import.meta.url)(`${root}/node_modules/@napi-rs/canvas`);

async function violations(page) {
  const { violations: found } = await new AxeBuilder({ page }).analyze();
  return found.map(
    (violation) =>
      `${violation.id}: ${violation.nodes
        .map((node) => node.target.join(' '))
        .slice(0, 3)
        .join(', ')}`,
  );
}

test('home page, tool pages, licenses and batch', async ({ page }) => {
  for (const address of [
    './',
    'merge-pdf/',
    'protect-pdf/',
    'sign-pdf/',
    'jpg-to-pdf/',
    'pdf-to-jpg/',
    'fill-pdf-form/',
    'edit-pdf-metadata/',
    'draw-on-pdf/',
    'licenses/',
  ]) {
    await page.goto(address);
    expect(await violations(page), address).toEqual([]);
  }
  await page.goto('batch-edit-pdf/');
  await page.locator('[data-action="batch-choose"]').first().click();
  await expect(page.locator('#batch-workspace')).toBeVisible();
  await page.setInputFiles('#batch-file-input', [fixture('rotated-cropped.pdf')]);
  expect(await violations(page), 'batch with a file').toEqual([]);
});

test('every editor tool, with items selected and settings shown', async ({ page }) => {
  await openSample(page, 'add-text-to-pdf/');
  await page.click('[data-action="add-text"]');
  await page.keyboard.type('Accessible note');
  expect(await violations(page), 'typing on the page').toEqual([]);
  await page.keyboard.press('Escape');
  expect(await violations(page), 'text selected').toEqual([]);
  await useTool(page, 'highlight');
  await page.click('[data-action="add-highlight"]');
  expect(await violations(page), 'highlight selected').toEqual([]);
  for (const tool of ['watermark', 'footer', 'numbers']) {
    await useTool(page, tool);
    await expect(page.locator('[data-action="toggle-setting"]')).toHaveAttribute('aria-checked', 'true');
    await page.selectOption('#tool-form [name="scope"]', 'pages');
    expect(await violations(page), `${tool}, on some pages`).toEqual([]);
  }
  for (const tool of [
    'image',
    'pages',
    'delete',
    'crop',
    'margins',
    'resize',
    'merge',
    'split',
    'sheets',
    'jpgtopdf',
    'pdftojpg',
    'protect',
    'unlock',
    'properties',
    'draw',
    'form',
    'signature',
  ]) {
    await useTool(page, tool);
    await ready(page);
    expect(await violations(page), tool).toEqual([]);
  }
  // Sign PDF: typing a signature, the signature ready to place, and a placed one.
  await page.locator('label:has(input[name="signatureMode"][value="type"])').click();
  await page.fill('#tool-form [name="signatureText"]', 'Alex Morgan');
  expect(await violations(page), 'typing a signature').toEqual([]);
  await page.click('[data-action="signature-use"]');
  expect(await violations(page), 'signature ready').toEqual([]);
  await page.click('[data-action="signature-place"]');
  expect(await violations(page), 'signature placed').toEqual([]);
  await page.locator('.tool-sidebar [data-action="help"]').click();
  await expect(page.locator('#info-dialog')).toBeVisible();
  expect(await violations(page), 'help dialog').toEqual([]);
});

test('every slider is named by its label and says its value with its unit', async ({ page }) => {
  // axe is content with a slider inside a label, whatever that label names. The
  // value shown beside the label was once an element that took the label for
  // itself, which left every slider without a name. So each slider is asked for
  // as a screen reader finds it: by role and name.
  const form = page.locator('#tool-form');
  const sliders = async (where, expected) => {
    await expect(form.locator('input[type=range]:visible'), where).toHaveCount(Object.keys(expected).length);
    for (const [name, value] of Object.entries(expected)) {
      const slider = form.getByRole('slider', { name, exact: true });
      await expect(slider, `${where}: one slider named ${name}`).toHaveCount(1);
      await expect(slider, `${where}, ${name}: its value as it is read out`).toHaveAttribute(
        'aria-valuetext',
        value,
      );
      expect(
        await slider.evaluate((input) => input.labels.length === 1 && input.labels[0].control === input),
        `${where}, ${name}: the label is the slider's own`,
      ).toBe(true);
    }
  };
  await openSample(page, 'add-watermark-to-pdf/');
  await sliders('Watermark', { Opacity: '18%', Angle: '-35°' });
  // The value that is read out follows the slider, as the one shown does.
  const opacity = form.getByRole('slider', { name: 'Opacity', exact: true });
  await opacity.focus();
  await page.keyboard.press('ArrowRight');
  await expect(opacity).toHaveAttribute('aria-valuetext', '19%');
  await expect(form.locator('[data-for="opacity"]')).toHaveText('19%');
  await useTool(page, 'highlight');
  await page.click('[data-action="add-highlight"]');
  await sliders('Highlight', { Opacity: /^\d+%$/ });
  await useTool(page, 'draw');
  await sliders('Draw', { 'Line width': /^\d+ pt$/ });
  await useTool(page, 'image');
  const picture = createCanvas(120, 60);
  picture.getContext('2d').fillRect(0, 0, 120, 60);
  await page.locator('.pages-heading [data-action="add-files"]').click();
  await page.setInputFiles('#file-input', await writeTemporary('slider.png', picture.toBuffer('image/png')));
  await expect(page.locator('.edit-layer [data-item-id].selected')).toHaveCount(1);
  await sliders('Add image', { Width: /^\d+%$/, Opacity: '100%' });
  await useTool(page, 'signature');
  await page.locator('label:has(input[name="signatureMode"][value="type"])').click();
  await page.fill('#tool-form [name="signatureText"]', 'Alex Morgan');
  await page.click('[data-action="signature-use"]');
  await page.click('[data-action="signature-place"]');
  await sliders('Sign PDF', { Width: /^\d+%$/ });
});

test('items are resized without dragging: Alt and the arrow keys, and Width and Height for a shape or a highlight', async ({
  page,
  baseURL,
}) => {
  // A handle was the only way to resize a highlight or a drawn shape, and a
  // keyboard, a switch or a voice cannot drag one: a highlight added from the
  // panel could not be made to cover the text it was meant for.
  await openSample(page, 'draw-on-pdf/');
  const item = page.locator('.edit-layer [data-item-id].selected'),
    form = page.locator('#tool-form'),
    // The selected item's box on the page, in CSS pixels: left, top, width, height.
    box = () =>
      item.evaluate((node) => {
        const [, , , , x, y] = node.style.transform
          .match(/matrix\(([^)]+)\)/)[1]
          .split(',')
          .map(Number);
        return [x, y, parseFloat(node.style.width), parseFloat(node.style.height)];
      }),
    // How many presses' worth a length changed by.
    steps = (from, to, step) => Math.round((to - from) / step),
    // Keys sent in one task: all arrive before the page is redrawn.
    burst = (keys) =>
      item.evaluate((node, keys) => {
        for (const [key, modifiers] of keys)
          node.dispatchEvent(
            new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers }),
          );
      }, keys),
    // Keys as a held-down key sends them: each in its own task, 33 ms after the last.
    // Gives how many announcements were made while they came. (The page's timers
    // fire in the order they are due, so a slow machine does not change the count.)
    held = (keys) =>
      item.evaluate(async (node, keys) => {
        const before = window.qaSpoken.length;
        for (const [key, modifiers] of keys) {
          node.dispatchEvent(
            new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers }),
          );
          await new Promise((resolve) => setTimeout(resolve, 33));
        }
        return window.qaSpoken.length - before;
      }, keys),
    said = page.locator('#announce-status'),
    // The size the panel shows, as shares of the page.
    shares = async () => [
      Number(await form.locator('[name="boxWidth"]').inputValue()),
      Number(await form.locator('[name="boxHeight"]').inputValue()),
    ],
    // What was said last is the size the panel shows now.
    sizeSaid = () =>
      expect
        .poll(async () => {
          const [width, height] = await shares(),
            shown = `Width ${width}% of the page, height ${height}%.`,
            heard = await said.textContent();
          return heard === shown || `said "${heard}", shown "${shown}"`;
        })
        .toBe(true),
    sheet = await page.locator('.page-view.current .edit-layer').boundingBox();
  await page.selectOption('#tool-form [name="shape"]', 'rect');
  await page.click('[data-action="add-drawing"]');
  await expect(item).toBeFocused();
  await expect(item).toHaveAttribute('aria-describedby', 'item-help');
  await expect(page.locator('#item-help')).toContainText('with Alt, resize it');
  const start = await box();
  await page.keyboard.press('Alt+ArrowRight');
  await expect.poll(async () => (await box())[2]).toBeGreaterThan(start[2]);
  const step = (await box())[2] - start[2];
  // Quick presses all count, as they do for moving.
  for (let i = 0; i < 4; i++) await page.keyboard.press('Alt+ArrowRight');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Alt+ArrowDown');
  await expect
    .poll(async () => {
      const now = await box();
      return [steps(start[2], now[2], step), steps(start[3], now[3], step)];
    })
    .toEqual([5, 3]);
  await page.keyboard.press('Alt+Shift+ArrowLeft');
  await page.keyboard.press('Alt+ArrowUp');
  await expect
    .poll(async () => {
      const now = await box();
      return [steps(start[2], now[2], step), steps(start[3], now[3], step)];
    })
    .toEqual([-5, 2]);
  // The upper left corner stayed where it was, and a plain arrow key still moves the item, at its new size.
  const first = await box();
  expect(first.slice(0, 2)).toEqual(start.slice(0, 2));
  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => steps(start[1], (await box())[1], step)).toBe(1);
  expect((await box()).slice(2)).toEqual(first.slice(2));
  // Five resizes and a move that arrive before the page is redrawn all count. (The
  // move starts from the size the document holds, not the one drawn.)
  const before = await box();
  await burst([...new Array(5).fill(['ArrowRight', { altKey: true }]), ['ArrowDown', {}]]);
  await expect
    .poll(async () => {
      const now = await box();
      return [steps(before[2], now[2], step), steps(before[1], now[1], step)];
    })
    .toEqual([5, 1]);
  // A key held down resizes some thirty times a second. Nothing is said while the
  // keys keep coming, and the size once, soon after they stop: a screen reader
  // would queue every size on the way.
  await sizeSaid();
  const spoken = await page.evaluate(() => window.qaSpoken.length);
  expect(await held(new Array(8).fill(['ArrowRight', { altKey: true }]))).toBe(0);
  await expect
    .poll(() => page.evaluate((from) => window.qaSpoken.length - from, spoken), { timeout: 3000 })
    .toBe(1);
  await expect.poll(async () => steps(before[2], (await box())[2], step)).toBe(13);
  const resized = await box();
  // The panel shows the size, as shares of the page, and the size said is the one shown.
  await expect
    .poll(async () => {
      const [width, height] = await shares();
      return [
        Math.abs(width - (resized[2] / sheet.width) * 100),
        Math.abs(height - (resized[3] / sheet.height) * 100),
      ].every((difference) => difference < 0.1);
    })
    .toBe(true);
  await sizeSaid();
  expect(await page.evaluate((from) => window.qaSpoken.length - from, spoken)).toBe(1);
  // The keys stop at the page's edge and at the least size: 3 points.
  await burst(new Array(80).fill(['ArrowRight', { altKey: true, shiftKey: true }]));
  await expect.poll(async () => Math.abs((await box())[0] + (await box())[2] - sheet.width)).toBeLessThan(1);
  await burst(new Array(80).fill(['ArrowLeft', { altKey: true, shiftKey: true }]));
  await expect.poll(async () => Math.abs((await box())[2] - 3 * step)).toBeLessThan(0.6);
  expect((await box())[0]).toBe(resized[0]);
  // Width and Height set the size; with no room to the right, or below, the item moves over.
  await form.locator('[name="boxWidth"]').fill('50');
  await form.locator('[name="boxHeight"]').fill('10');
  await expect
    .poll(async () => {
      const now = await box();
      return [Math.round((now[2] / sheet.width) * 100), Math.round((now[3] / sheet.height) * 100)];
    })
    .toEqual([50, 10]);
  await expect(said).toHaveText('Width 50% of the page, height 10%.');
  await form.locator('[name="boxWidth"]').fill('100');
  await expect
    .poll(async () => {
      const now = await box();
      return [Math.round(now[0]), Math.round((now[2] / sheet.width) * 100)];
    })
    .toEqual([0, 100]);
  await item.focus();
  await burst(new Array(40).fill(['ArrowDown', { shiftKey: true }]));
  await expect.poll(async () => (await box())[1]).toBeGreaterThan(sheet.height / 2);
  await form.locator('[name="boxHeight"]').fill('100');
  await expect
    .poll(async () => {
      const now = await box();
      return [Math.round(now[1]), Math.round((now[3] / sheet.height) * 100)];
    })
    .toEqual([0, 100]);
  // The least the fields take is what the item then has: a tenth of a percent.
  await form.locator('[name="boxWidth"]').fill('0.1');
  await expect.poll(async () => Math.abs(((await box())[2] / sheet.width) * 100 - 0.1)).toBeLessThan(0.05);
  await form.locator('[name="boxHeight"]').focus();
  await expect(form.locator('[name="boxWidth"]')).toHaveValue('0.1');
  // One step back undoes the size typed last, by name (sizes typed in quick succession are one
  // step); and the download has the shape as the page shows it.
  await expect(page.locator('#undo-button')).toHaveAttribute('title', 'Undo: Resize drawing');
  await page.click('#undo-button');
  await expect.poll(async () => Math.round(((await box())[2] / sheet.width) * 100)).toBe(100);
  const { bytes } = await download(page, () => page.click('#download-button'));
  expect(await previewDifference(page, bytes, 1, baseURL)).toBeLessThan(0.002);

  // A highlight is made taller and narrower, to fit the text it is for.
  await useTool(page, 'highlight');
  await page.click('[data-action="add-highlight"]');
  await expect(item).toBeFocused();
  const line = await box();
  for (let i = 0; i < 6; i++) await page.keyboard.press('Alt+ArrowDown');
  await page.keyboard.press('Alt+Shift+ArrowLeft');
  await expect
    .poll(async () => {
      const now = await box();
      return [steps(line[2], now[2], step), steps(line[3], now[3], step)];
    })
    .toEqual([-10, 6]);
  await expect(form.locator('[name="boxWidth"]')).toBeVisible();
  await expect(form.locator('[name="boxHeight"]')).toBeVisible();

  // Text has a width only, where its lines wrap: narrower, the line breaks in two.
  await useTool(page, 'text');
  await page.click('[data-action="add-text"]');
  await page.keyboard.type('Words enough to fill a line of their own');
  await page.keyboard.press('Escape');
  await expect(item).toBeFocused();
  const words = await box();
  await page.keyboard.press('Alt+ArrowDown');
  for (let i = 0; i < 12; i++) await page.keyboard.press('Alt+Shift+ArrowLeft');
  await expect.poll(async () => (await box())[2]).toBeLessThan(words[2] - 100 * step);
  await expect.poll(async () => (await box())[3]).toBeGreaterThan(words[3] * 1.5);
  // What is said for text is that width, as a share of the page.
  await expect
    .poll(async () => {
      const heard = /^Width ([\d.]+)% of the page\.$/.exec(await said.textContent());
      return heard ? Math.abs(Number(heard[1]) - ((await box())[2] / sheet.width) * 100) < 0.5 : false;
    })
    .toBe(true);
  // It is said to a tenth of a percent: one point narrower is said as narrower.
  const wide = Number(/[\d.]+/.exec(await said.textContent())[0]);
  await page.keyboard.press('Alt+ArrowLeft');
  await expect
    .poll(async () => {
      const heard = /^Width ([\d.]+)% of the page\.$/.exec(await said.textContent()),
        tenths = heard ? Math.round((wide - Number(heard[1])) * 10) : null;
      return tenths === 1 || tenths === 2 ? 'a tenth or two less' : tenths;
    })
    .toBe('a tenth or two less');
  const textId = await item.getAttribute('data-item-id');

  // A picture keeps its proportions.
  await useTool(page, 'image');
  const picture = createCanvas(120, 60);
  picture.getContext('2d').fillRect(0, 0, 120, 60);
  await page.locator('.pages-heading [data-action="add-files"]').click();
  await page.setInputFiles('#file-input', await writeTemporary('wide.png', picture.toBuffer('image/png')));
  await expect(item).toHaveCount(1);
  await item.focus();
  const small = await box();
  for (let i = 0; i < 3; i++) await page.keyboard.press('Alt+Shift+ArrowRight');
  await expect.poll(async () => steps(small[2], (await box())[2], step)).toBe(30);
  const large = await box();
  expect(Math.abs(large[2] / large[3] - small[2] / small[3])).toBeLessThan(0.01);
  // For a picture the width said is the one its Width slider shows.
  const pictureId = await item.getAttribute('data-item-id'),
    slider = form.locator('[name="width"]');
  await expect
    .poll(async () => Number(await slider.inputValue()))
    .toBe(Math.round((large[2] / sheet.width) * 100));
  await expect(said).toHaveText(`Width ${await slider.inputValue()}% of the page.`);

  // A shape whose page was turned after it was placed: wider is still wider on the screen.
  await useTool(page, 'draw');
  await page.click('[data-action="add-drawing"]');
  const turnedId = await item.getAttribute('data-item-id');
  await useTool(page, 'pages');
  await page.click('[data-action="rotate"]');
  await ready(page);
  await useTool(page, 'draw');
  await page.locator(`.edit-layer [data-item-id="${turnedId}"]`).focus();
  await expect(item).toHaveAttribute('data-item-id', turnedId);
  const turned = await item.boundingBox();
  for (let i = 0; i < 4; i++) await page.keyboard.press('Alt+Shift+ArrowRight');
  await expect.poll(async () => (await item.boundingBox()).width).toBeGreaterThan(turned.width + 20);
  const wider = await item.boundingBox();
  expect(Math.abs(wider.height - turned.height)).toBeLessThan(1);
  expect(Math.abs(wider.x - turned.x)).toBeLessThan(1);
  expect(Math.abs(wider.y - turned.y)).toBeLessThan(1);
  // Its fields and what is said go by the screen as well: the width is the side that lies across.
  const turnedSheet = await page.locator('.page-view.current .edit-layer').boundingBox();
  await expect
    .poll(async () => Math.abs((await shares())[0] - (wider.width / turnedSheet.width) * 100))
    .toBeLessThan(0.2);
  await sizeSaid();
  // The picture on that page: what is said is still what its slider shows.
  await useTool(page, 'image');
  await page.locator(`.edit-layer [data-item-id="${pictureId}"]`).focus();
  await expect(item).toHaveAttribute('data-item-id', pictureId);
  await page.keyboard.press('Alt+ArrowRight');
  await expect(said).toHaveText(/^Width \d+% of the page\.$/);
  await expect
    .poll(async () => `Width ${await slider.inputValue()}% of the page.`)
    .toBe(await said.textContent());
  // And the text: its lines now run down the screen, so its lower edge is where they
  // wrap. What is said is that width, which is the box's height on the screen, not
  // the side that lies across.
  await useTool(page, 'text');
  await page.locator(`.edit-layer [data-item-id="${textId}"]`).focus();
  await expect(item).toHaveAttribute('data-item-id', textId);
  const sideways = await item.boundingBox();
  for (let i = 0; i < 2; i++) await page.keyboard.press('Alt+Shift+ArrowDown');
  await expect.poll(async () => (await item.boundingBox()).height).toBeGreaterThan(sideways.height + 15);
  await expect
    .poll(async () => {
      const heard = /^Width ([\d.]+)% of the page\.$/.exec(await said.textContent()),
        now = await item.boundingBox(),
        down = (now.height / turnedSheet.height) * 100,
        across = (now.width / turnedSheet.width) * 100;
      // (The two sides differ by far more than the allowance, or this would show nothing.)
      return heard && Math.abs(down - across) > 5 ? Math.abs(Number(heard[1]) - down) < 0.5 : false;
    })
    .toBe(true);
});

test('a size that waits to be said gives way to what happens meanwhile', async ({ page }) => {
  // A size is said a moment after the last resize. What is said in that moment is
  // not talked over (the resize was undone, the item deleted), and a size is not
  // said for an item that is no longer the selected one.
  await openSample(page, 'draw-on-pdf/');
  const item = page.locator('.edit-layer [data-item-id].selected'),
    resize = ['ArrowRight', { altKey: true }],
    // Keys in one task, so that the second arrives while the size still waits.
    keys = (list) =>
      item.evaluate((node, list) => {
        for (const [key, modifiers] of list)
          node.dispatchEvent(
            new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers }),
          );
      }, list),
    mark = () => page.evaluate(() => window.qaSpoken.length),
    // What was said since `from`, once a size that waited would have been said. The
    // waiting is done by the page's own timers, which fire in the order they are due.
    since = (from) =>
      page.evaluate(async (from) => {
        for (const wait of [400, 150]) await new Promise((resolve) => setTimeout(resolve, wait));
        return window.qaSpoken.slice(from).map((said) => said.text);
      }, from),
    sizes = (texts) => texts.filter((text) => text.startsWith('Width'));
  await page.selectOption('#tool-form [name="shape"]', 'rect');
  await page.click('[data-action="add-drawing"]');
  await expect(item).toBeFocused();
  const first = await item.getAttribute('data-item-id');
  // A resize and nothing else: the size is said. (So it would be below, if nothing stopped it.)
  let from = await mark();
  await keys([resize]);
  expect(await since(from)).toEqual([expect.stringMatching(/^Width [\d.]+% of the page, height [\d.]+%\.$/)]);
  // Undone at once: what is said is that it was undone.
  from = await mark();
  await keys([resize, ['z', { ctrlKey: true }]]);
  expect(await since(from)).toEqual(['Undone: Resize drawing.']);
  // Deselected at once: nothing is said about an item that is not selected.
  await expect(item).toHaveAttribute('data-item-id', first);
  from = await mark();
  await keys([resize, ['Escape', {}]]);
  expect(sizes(await since(from))).toEqual([]);
  await expect(item).toHaveCount(0);
  // Another item selected at once: the first one's size is not said in its place.
  await page.click('[data-action="add-drawing"]');
  await expect(item).toBeFocused();
  const second = await item.getAttribute('data-item-id');
  expect(second).not.toBe(first);
  from = await mark();
  await page.evaluate(
    ([first, second, [key, modifiers]]) => {
      const node = (id) => document.querySelector(`.edit-layer [data-item-id="${id}"]`);
      node(first).focus();
      node(first).dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers }),
      );
      node(second).focus();
    },
    [first, second, resize],
  );
  expect(sizes(await since(from))).toEqual([]);
  await expect(item).toHaveAttribute('data-item-id', second);
  // Deleted at once: what is said is that it is gone.
  from = await mark();
  await keys([resize, ['Delete', {}]]);
  expect(await since(from)).toEqual(['Rectangle deleted.']);
  // An error said at once: the size does not come after it.
  const box = page.locator(`.edit-layer [data-item-id="${first}"]`);
  await box.focus();
  await expect(item).toHaveAttribute('data-item-id', first);
  from = await mark();
  await box.evaluate(async (node, [key, modifiers]) => {
    const { toast } = await import(
      performance.getEntriesByType('resource').find((entry) => /\/editor-core\.js/.test(entry.name)).name
    );
    node.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers }));
    toast('That did not work.', true);
  }, resize);
  expect(await since(from)).toEqual(['That did not work.']);

  // An item can have focus without being the selected one: Undo of a step about
  // something else leaves it so. A key that acts on it selects it again, and
  // its size is said.
  await useTool(page, 'watermark');
  await expectToast(page, /^Watermark/);
  await useTool(page, 'draw');
  await box.focus();
  await expect(item).toHaveAttribute('data-item-id', first);
  await box.evaluate((node) =>
    node.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }),
    ),
  );
  await expectToast(page, 'Undone: Watermark.');
  await expect(item).toHaveCount(0);
  await expect(box).toBeFocused();
  from = await mark();
  await box.evaluate(
    (node, [key, modifiers]) =>
      node.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers }),
      ),
    resize,
  );
  expect(await since(from)).toEqual([expect.stringMatching(/^Width [\d.]+% of the page, height [\d.]+%\.$/)]);
  await expect(item).toHaveAttribute('data-item-id', first);
});

test('the password prompt, with and without an error', async ({ page }) => {
  await page.goto('./');
  await page.setInputFiles('#file-input', fixture('password-aes128.pdf'));
  await expect(page.locator('#password-dialog')).toBeVisible();
  expect(await violations(page), 'password prompt').toEqual([]);
  await page.fill('#password-input', 'wrong');
  await page.click('#password-submit');
  await expect(page.locator('#password-error')).toBeVisible();
  expect(await violations(page), 'password prompt with an error').toEqual([]);
});

test('switches and segmented controls show their state in forced-colours mode', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Playwright emulates forced colours in Chromium only');
  // Reduced motion too: the switch fades between its colours, and a colour read
  // as the fade starts is still the one it had.
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await openSample(page, 'add-page-numbers-to-pdf/');
  const style = (locator) =>
    locator.evaluate((node) => {
      const computed = getComputedStyle(node);
      return {
        background: computed.backgroundColor,
        border: `${computed.borderTopStyle} ${computed.borderTopWidth}`,
      };
    });
  const track = page.locator('.switch-track');
  await expect(page.locator('[data-action="toggle-setting"]')).toHaveAttribute('aria-checked', 'true');
  const on = await style(track);
  expect(on.border, 'the switch has an outline').toMatch(/^solid [1-9]/);
  await page.click('[data-action="toggle-setting"]');
  await expect(page.locator('[data-action="toggle-setting"]')).toHaveAttribute('aria-checked', 'false');
  const off = await style(track);
  expect(off.background, 'on and off look different').not.toBe(on.background);
  await useTool(page, 'sheets');
  const chosen = await style(page.locator('.segmented input:checked + span'));
  const other = await style(page.locator('.segmented input:not(:checked) + span').first());
  expect(chosen.background, 'the chosen segment looks different').not.toBe(other.background);
});

test('a button that reaches its limit keeps focus; one that disables itself hands focus to its neighbour', async ({
  page,
}) => {
  await openSample(page);
  await useTool(page, 'pages');
  await page.locator('[data-page-open]').nth(1).click();
  await ready(page);
  const earlier = page.locator('[data-action="move-earlier"]'),
    order = () =>
      page
        .locator('#page-list [data-page-id]')
        .evaluateAll((items) => items.map((item) => item.dataset.pageId));
  const before = await order();
  await earlier.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#announce-status')).toContainText('Page moved to position 1.');
  // At the first page the button is unavailable, not disabled: focus stays on it,
  // not on Move later, where one Enter too many would move the page back.
  await expect(earlier).toHaveAttribute('aria-disabled', 'true');
  await expect(earlier).toBeFocused();
  // It looks unavailable in its text, not as a whole: fading the button would
  // fade the focus ring that shows where the keyboard is.
  const look = (locator) =>
    locator.evaluate((button) => {
      const style = getComputedStyle(button);
      return {
        opacity: style.opacity,
        color: style.color,
        ring: style.outlineStyle + ' ' + style.outlineWidth,
      };
    });
  const unavailable = await look(earlier),
    available = await look(page.locator('[data-action="move-later"]'));
  expect(unavailable.opacity).toBe('1');
  expect(unavailable.ring).toBe('solid 3px');
  expect(unavailable.color).not.toBe(available.color);
  const moved = await order();
  expect(moved).toEqual([before[1], before[0], before[2]]);
  await page.keyboard.press('Enter');
  await expect(page.locator('#announce-status')).toContainText('This page is already the first.');
  expect(await order()).toEqual(moved);
  await expect(page.locator('[data-action="move-later"]')).not.toHaveAttribute('aria-disabled', 'true');

  // Delete pages: the button disables itself when the selected pages are gone, and
  // focus goes to the control next to it, not to the first one in the panel.
  await useTool(page, 'delete');
  await page.locator('[data-page-select]').nth(2).check();
  const remove = page.locator('[data-action="delete-pages"]');
  await remove.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#document-info')).toHaveText(/^2 pages/);
  await expect(remove).toBeDisabled();
  await expect(page.locator('[data-action="select-range"]')).toBeFocused();
});
