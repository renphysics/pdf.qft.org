// Writes tests/fixtures/hostile-metadata.pdf: a PDF with HTML and JavaScript in
// every string the editor may show (title, author, subject, keywords, creator,
// producer, a bookmark, field names, labels and options) plus an OpenAction
// that runs JavaScript and a link to a javascript: address. The browser test
// (tests/browser/hostile.spec.mjs) opens it in every panel that shows those
// strings and checks that nothing runs and nothing is injected.
// Run: node scripts/make-hostile-fixture.mjs
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { PDFDocument, PDFHexString, PDFName, PDFString, StandardFonts, rgb } = require('@cantoo/pdf-lib');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Each payload sets its own flag when it runs, so a test can name what leaked.
const payload = (flag) => `<img src=x onerror="window.__xss${flag}=1">`;
const scripted = (flag) => `<script data-xss="${flag}">window.__xss${flag}=1</script>`;

const doc = await PDFDocument.create();
doc.setTitle(payload('Title'));
doc.setAuthor(scripted('Author'));
doc.setSubject(payload('Subject'));
doc.setKeywords([payload('Keywords'), '"onmouseover="window.__xssKeywords2=1']);
doc.setCreator(payload('Creator'));
doc.setProducer(scripted('Producer'));
doc.setCreationDate(new Date('2026-01-01T00:00:00Z'));
doc.setModificationDate(new Date('2026-01-01T00:00:00Z'));
const font = await doc.embedFont(StandardFonts.Helvetica);
const form = doc.getForm();
const tooltip = (field, text) => field.acroField.dict.set(PDFName.of('TU'), PDFHexString.fromText(text));

const page = doc.addPage([612, 792]);
page.drawText('Hostile strings', { x: 72, y: 730, size: 20, font });
page.drawText('Nothing in this file may run or be injected.', {
  x: 72,
  y: 700,
  size: 11,
  font,
  color: rgb(0.2, 0.2, 0.2),
});

const name = form.createTextField(payload('FieldName'));
tooltip(name, scripted('FieldLabel'));
name.setText(payload('FieldValue'));
name.addToPage(page, { x: 180, y: 640, width: 300, height: 22 });

const choice = form.createDropdown('choice');
tooltip(choice, payload('ChoiceLabel'));
choice.addOptions([payload('Option'), scripted('Option2'), 'plain']);
choice.addToPage(page, { x: 180, y: 600, width: 300, height: 22 });

const list = form.createOptionList('list');
tooltip(list, 'List');
list.addOptions([payload('ListOption'), 'plain']);
list.addToPage(page, { x: 180, y: 520, width: 300, height: 60 });

const box = form.createCheckBox(scripted('BoxName'));
tooltip(box, payload('BoxLabel'));
box.addToPage(page, { x: 180, y: 480, width: 16, height: 16 });

// A link to a javascript: address, and an action that runs when the PDF opens.
page.node.addAnnot(
  doc.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [72, 440, 300, 460],
    Border: [0, 0, 0],
    A: { Type: 'Action', S: 'URI', URI: PDFString.of('javascript:window.__xssLink=1') },
  }),
);
doc.catalog.set(
  PDFName.of('OpenAction'),
  doc.context.obj({ Type: 'Action', S: 'JavaScript', JS: PDFString.of('window.__xssOpenAction=1') }),
);
// A bookmark whose title is a payload.
const outline = doc.context.obj({ Type: 'Outlines', Count: 1 });
const outlineRef = doc.context.register(outline);
const item = doc.context.obj({
  Title: PDFHexString.fromText(payload('Bookmark')),
  Parent: outlineRef,
  Dest: [page.ref, PDFName.of('Fit')],
});
const itemRef = doc.context.register(item);
outline.set(PDFName.of('First'), itemRef);
outline.set(PDFName.of('Last'), itemRef);
doc.catalog.set(PDFName.of('Outlines'), outlineRef);

const bytes = await doc.save({ useObjectStreams: false });
await writeFile(path.join(root, 'tests/fixtures/hostile-metadata.pdf'), bytes);
console.log(`Wrote tests/fixtures/hostile-metadata.pdf (${bytes.length} bytes).`);
