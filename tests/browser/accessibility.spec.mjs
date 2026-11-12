// axe-core finds no accessibility violations on the pages, in the editor's
// tools and states, and in the dialogs.
import { createRequire } from 'node:module';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, fixture, openSample, ready, useTool, writeTemporary, root } from './helpers.mjs';

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
