// Form fields: described when a PDF opens, filled on export (kept fillable or
// flattened), and flattened forms combine with other pages.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const runtime = path.resolve(here, '../node_modules');
globalThis.PDFLib = require(path.join(runtime, '@cantoo/pdf-lib'));
globalThis.fontkit = require(path.join(runtime, '@cantoo/fontkit'));
const { DOMMatrix, ImageData, Path2D } = require(path.join(runtime, '@napi-rs/canvas'));
Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (String(url).startsWith('file:')) {
    try {
      return new Response(await readFile(new URL(url)));
    } catch {
      return new Response('', { status: 404 });
    }
  }
  return nativeFetch(url, options);
};
const { openPdf, buildPdf, buildPdfWithNotes } = await import('../dist/pdf-engine.js');
const pdfjs = await import(pathToFileURL(path.join(runtime, 'pdfjs-dist/legacy/build/pdf.mjs')));
const { PDFDocument, PDFName, PDFNumber } = globalThis.PDFLib;
const outputDir = path.join(here, 'output');
await mkdir(outputDir, { recursive: true });

const formBytes = new Uint8Array(await readFile(path.join(here, 'fixtures/form-fields.pdf')));
const otherBytes = await (async () => {
  const doc = await PDFDocument.create();
  doc.addPage([300, 300]).drawText('Other page', { x: 40, y: 150, size: 18 });
  return doc.save();
})();

/** Each page's text, as PDF.js reads it. */
async function pageTexts(bytes) {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  const pages = [];
  for (let number = 1; number <= doc.numPages; number++) {
    const content = await (await doc.getPage(number)).getTextContent();
    pages.push(content.items.map((item) => item.str).join(' '));
  }
  await doc.loadingTask.destroy();
  return pages;
}
const state = (extra = {}, sources = [{ id: 'form', bytes: formBytes }]) => ({
  sources,
  pages: [
    { id: 'p1', sourceId: 'form', index: 0 },
    { id: 'p2', sourceId: 'form', index: 1 },
  ],
  ...extra,
});
const values = {
  'applicant.name': 'Zoë Łukasz',
  'applicant.address': '12 Harbour Road\nKingston',
  'applicant.postcode': '1234567',
  'applicant.email': 'zoe@example.org',
  member: true,
  plan: 'Plus',
  country: 'Japan',
  interests: ['Music', 'Travel'],
  reference: 'changed',
  comments: 'Thank you 谢谢',
  agree: true,
  date: '01/11/2026',
};
await test('reading: fields with their widgets, pages, labels, settings and PDF.js IDs', async () => {
  // ---- Reading ---------------------------------------------------------------------

  const opened = await openPdf(formBytes);
  assert.equal(opened.hasForm, true);
  assert.equal(opened.form.xfa, false);
  assert.equal(opened.form.scripts, false);
  assert.equal(opened.form.count, 12);
  const byName = Object.fromEntries(opened.form.fields.map((field) => [field.name, field]));
  assert.deepEqual(Object.keys(byName).sort(), Object.keys(values).sort());
  assert.equal(byName['applicant.name'].kind, 'text');
  assert.equal(byName['applicant.name'].label, 'Full name', 'the tooltip names a field');
  assert.deepEqual(
    byName['applicant.name'].widgets.map((widget) => widget.pageIndex),
    [0, 1],
    'a field shown on two pages',
  );
  assert.match(byName['applicant.name'].widgets[0].id, /^\d+R\d*$/, 'widget IDs as PDF.js names them');
  assert.deepEqual(
    byName['applicant.name'].widgets[0].rect,
    [179.5, 689.5, 301, 23],
    'the rectangle as stored (pdf-lib adds half its border)',
  );
  assert.equal(byName['applicant.address'].multiline, true);
  assert.deepEqual([byName['applicant.postcode'].maxLength, byName['applicant.postcode'].comb], [5, true]);
  assert.deepEqual([byName['applicant.email'].required, byName['applicant.email'].fontSize], [true, 11]);
  assert.equal(byName['applicant.name'].fontSize, 0, 'automatic text size');
  assert.deepEqual([byName.member.kind, byName.member.value], ['checkbox', false]);
  assert.deepEqual(byName.plan.options, ['Basic', 'Plus', 'Pro']);
  assert.deepEqual(
    byName.plan.widgets.map((widget) => widget.option),
    ['Basic', 'Plus', 'Pro'],
  );
  assert.deepEqual(
    [byName.country.kind, byName.country.options.length, byName.country.value],
    ['dropdown', 4, ''],
  );
  assert.deepEqual(
    [byName.interests.kind, byName.interests.multiple, byName.interests.value],
    ['list', true, []],
  );
  assert.deepEqual([byName.reference.readOnly, byName.reference.value], [true, 'QFT-1001']);
  assert.equal(byName.date.label, 'Date (DD/MM/YYYY)');
  assert.equal(byName.agree.required, true);
  assert.equal((await openPdf(otherBytes)).form, null, 'no form');
});

await test('filling: values written, fields kept fillable with their default appearances; other values untouched', async () => {
  // ---- Filling, fields kept --------------------------------------------------------

  const filled = await buildPdf(state({ formValues: { form: values } }));
  await writeFile(path.join(outputDir, 'form-filled.pdf'), filled);
  {
    const doc = await PDFDocument.load(filled);
    const form = doc.getForm();
    assert.equal(form.getFields().length, 12, 'the form is kept');
    assert.equal(form.getTextField('applicant.name').getText(), 'Zoë Łukasz');
    assert.equal(form.getTextField('applicant.address').getText(), '12 Harbour Road\nKingston');
    assert.equal(
      form.getTextField('applicant.postcode').getText(),
      '12345',
      'cut to the field’s 5 characters',
    );
    assert.equal(form.getCheckBox('member').isChecked(), true);
    assert.equal(form.getRadioGroup('plan').getSelected(), 'Plus');
    assert.deepEqual(form.getDropdown('country').getSelected(), ['Japan']);
    assert.deepEqual(form.getOptionList('interests').getSelected(), ['Music', 'Travel']);
    assert.equal(form.getTextField('reference').getText(), 'QFT-1001', 'read-only fields are not changed');
    assert.equal(form.getTextField('comments').getText(), 'Thank you 谢谢');
    assert.equal(
      form.getTextField('applicant.name').acroField.getDefaultAppearance(),
      '/Helv 0 Tf 0 g',
      'automatic size kept for readers',
    );
    // Changed fields look changed in every reader: their appearance draws the new text.
    const appearance = (name) => {
      const stream = doc.context.lookup(
        form.getTextField(name).acroField.getWidgets()[0].getNormalAppearance(),
      );
      return new TextDecoder('latin1').decode(PDFLib.decodePDFRawStream(stream).decode());
    };
    const shows = (text) => `<${Buffer.from(text, 'latin1').toString('hex').toUpperCase()}> Tj`;
    assert.ok(
      appearance('applicant.email').includes(shows('zoe@example.org')),
      appearance('applicant.email'),
    );
    assert.ok(appearance('applicant.address').includes(shows('Kingston')), 'each line of a multiline field');
    // Check boxes and radio buttons show their own on and off looks.
    const plus = form.getRadioGroup('plan').acroField.getWidgets()[1];
    assert.equal(
      plus.getAppearanceState()?.decodeText(),
      form.getRadioGroup('plan').acroField.getWidgets()[1].getOnValue().decodeText(),
    );
  }
  // A value only changes what was changed.
  const untouched = await buildPdf(state({ formValues: { form: { 'applicant.email': 'a@b.c' } } }));
  assert.equal(
    (await PDFDocument.load(untouched)).getForm().getTextField('applicant.name').getText(),
    undefined,
  );
});

await test('flattening: no fields or widgets left; values drawn on their pages (Latin, Polish, Chinese)', async () => {
  // ---- Flattening ------------------------------------------------------------------

  const flat = await buildPdfWithNotes(state({ formValues: { form: values }, flattenForms: true }));
  await writeFile(path.join(outputDir, 'form-flattened.pdf'), flat.bytes);
  {
    const doc = await PDFDocument.load(flat.bytes);
    assert.equal(doc.getForm().getFields().length, 0, 'no fields after flattening');
    for (const page of doc.getPages()) {
      const annots = page.node.Annots();
      const widgets = annots
        ? annots
            .asArray()
            .filter(
              (ref) => doc.context.lookup(ref)?.lookup?.(PDFName.of('Subtype')) === PDFName.of('Widget'),
            )
        : [];
      assert.equal(widgets.length, 0, 'no widgets left on the page');
    }
    const [first, second] = await pageTexts(flat.bytes);
    for (const text of ['Zoë Łukasz', '12 Harbour Road', 'Kingston', 'zoe@example.org', 'QFT-1001', 'Japan'])
      assert.ok(first.includes(text), `page 1 shows ${text}: ${first}`);
    for (const text of ['Thank you 谢谢', '01/11/2026', 'Zoë Łukasz'])
      assert.ok(second.includes(text), `page 2 shows ${text}: ${second}`);
  }
});

await test('a form on pages put on sheets: its fields move with their pages, stay fillable and show what was typed; flattened, the answers are on the sheet', async () => {
  // The first page (Letter) on A4; the second, turned on its side, stays as it is.
  const A4 = [595.28, 841.89],
    scale = A4[0] / 612,
    up = (A4[1] - 792 * scale) / 2;
  const sheets = (extra) => ({
    ...state(extra),
    pages: [
      { id: 'p1', sourceId: 'form', index: 0, paper: 'a4' },
      { id: 'p2', sourceId: 'form', index: 1 },
    ],
  });
  const close = (actual, expected, message) =>
    assert.ok(Math.abs(actual - expected) < 0.01, `${message}: expected ${expected}, got ${actual}`);
  const resized = await buildPdf(sheets({ formValues: { form: values } }));
  const source = (await PDFDocument.load(formBytes)).getForm();
  {
    const doc = await PDFDocument.load(resized);
    const form = doc.getForm();
    assert.equal(form.getFields().length, 12, 'the form is kept');
    assert.equal(form.getTextField('applicant.email').getText(), 'zoe@example.org', 'with what was typed');
    assert.deepEqual(Object.values(doc.getPage(0).getMediaBox()), [0, 0, ...A4], 'the first page is on A4');
    const email = form.getTextField('applicant.email').acroField,
      [widget] = email.getWidgets(),
      box = widget.getRectangle(),
      was = source.getTextField('applicant.email').acroField.getWidgets()[0].getRectangle();
    close(box.x, was.x * scale, 'the field’s left edge');
    close(box.y, up + was.y * scale, 'its lower edge');
    close(box.width, was.width * scale, 'its width');
    close(box.height, was.height * scale, 'its height');
    // The text size a reader types with is the widget's own now: its field's is for every widget.
    assert.equal(
      widget.dict.lookup(PDFName.of('DA')).decodeText(),
      `/Helv ${Math.round(11 * scale * 1000) / 1000} Tf 0 g`,
      'a reader types in it at the page’s scale',
    );
    assert.equal(email.getDefaultAppearance(), '/Helv 11 Tf 0 g', 'the field keeps its own size');
    // One field with a widget on each page: only the one on the sheet moved.
    const [onSheet, other] = form.getTextField('applicant.name').acroField.getWidgets(),
      [first, second] = source.getTextField('applicant.name').acroField.getWidgets();
    close(
      onSheet.getRectangle().y,
      up + first.getRectangle().y * scale,
      'the shared field’s widget on the sheet',
    );
    close(other.getRectangle().y, second.getRectangle().y, 'and its widget on the page that stayed');
    assert.equal(
      onSheet.dict.lookup(PDFName.of('DA')),
      undefined,
      'a size left to the reader (0) needs no copy',
    );
  }
  {
    // PDF.js shows the answer in the field, where the field is on the sheet.
    const doc = await pdfjs.getDocument({ data: resized.slice(), verbosity: 0 }).promise;
    const annotations = await (await doc.getPage(1)).getAnnotations();
    const email = annotations.find((annotation) => annotation.fieldName === 'applicant.email');
    assert.equal(email.fieldValue, 'zoe@example.org');
    const was = source.getTextField('applicant.email').acroField.getWidgets()[0].getRectangle();
    close(email.rect[1], up + was.y * scale, 'PDF.js: the field on the sheet');
    await doc.loadingTask.destroy();
  }
  // Flattened: the answers are page content, and go on the sheet with the page.
  const words = async (bytes) => {
    const doc = await pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
    const page = await doc.getPage(1);
    const items = (await page.getTextContent()).items.filter((item) => item.str.includes('zoe@example.org'));
    await doc.loadingTask.destroy();
    return items.map((item) => [
      item.transform[4],
      item.transform[5],
      Math.hypot(item.transform[0], item.transform[1]),
    ]);
  };
  const flat = { formValues: { form: values }, flattenForms: true };
  const [[x, y, size]] = await words(await buildPdf(state(flat)));
  const [[sheetX, sheetY, sheetSize]] = await words(await buildPdf(sheets(flat)));
  close(sheetX, x * scale, 'the flattened answer, across');
  close(sheetY, up + y * scale, 'up');
  close(sheetSize, size * scale, 'and at the page’s scale');
  assert.equal((await PDFDocument.load(await buildPdf(sheets(flat)))).getForm().getFields().length, 0);
});

await test('a flattened form combines with other PDFs', async () => {
  // Flattening lets a form's pages be combined with other PDFs and extracted.
  const combinedState = {
    sources: [
      { id: 'form', bytes: formBytes },
      { id: 'other', bytes: otherBytes },
    ],
    pages: [
      { id: 'p2', sourceId: 'form', index: 1 },
      { id: 'o1', sourceId: 'other', index: 0 },
    ],
    formValues: { form: { comments: 'Combined' } },
  };
  await assert.rejects(buildPdf(combinedState), /Flatten fields/);
  const combined = await buildPdf({ ...combinedState, flattenForms: true });
  assert.equal((await PDFDocument.load(combined)).getPageCount(), 2);
  const combinedText = await pageTexts(combined);
  assert.ok(combinedText[0].includes('Combined'));
  assert.ok(combinedText[1].includes('Other page'));
});

await test('hidden fields are not drawn or offered; fields without appearances are drawn', async () => {
  // Hidden fields are not drawn when flattening, and are not offered for filling.
  {
    const doc = await PDFDocument.load(formBytes);
    const form = doc.getForm();
    form.getTextField('date').setText('HIDDEN-VALUE');
    form.getTextField('date').acroField.getWidgets()[0].dict.set(PDFName.of('F'), PDFNumber.of(2));
    // A field without an appearance (as when a form asks readers to draw them) still flattens with its value.
    form.getTextField('applicant.address').setText('No appearance yet');
    form.getTextField('applicant.address').acroField.getWidgets()[0].dict.delete(PDFName.of('AP'));
    const variant = await doc.save({ updateFieldAppearances: false });
    const described = await openPdf(variant);
    assert.equal(
      described.form.fields.some((field) => field.name === 'date'),
      false,
    );
    assert.equal(described.form.count, 12);
    const variantState = {
      sources: [{ id: 'form', bytes: variant }],
      pages: [
        { id: 'a', sourceId: 'form', index: 0 },
        { id: 'b', sourceId: 'form', index: 1 },
      ],
      flattenForms: true,
    };
    const [first, second] = await pageTexts(await buildPdf(variantState));
    assert.ok(!second.includes('HIDDEN-VALUE'), 'a hidden field is not drawn');
    assert.ok(first.includes('No appearance yet'), 'a field without an appearance gets one');
  }
});

await test('a character no font has is reported on the field’s page', async () => {
  // Characters no font has are reported on the field's page.
  await assert.rejects(buildPdf(state({ formValues: { form: { comments: 'Unicorn 🦄' } } })), (error) => {
    assert.match(error.message, /^Page 2: “Comments”: The available font cannot display/);
    assert.deepEqual([error.pageIndex, error.itemId], [1, 'form:comments']);
    return true;
  });
});
