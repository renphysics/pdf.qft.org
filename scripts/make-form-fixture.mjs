// Writes tests/fixtures/form-fields.pdf: a two-page form with every kind of
// field Fill form handles. Page 2 is turned (/Rotate 90) and repeats the name
// field. Run: node scripts/make-form-fixture.mjs
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { PDFCheckBox, PDFDocument, PDFHexString, PDFName, PDFRadioGroup, PDFString, StandardFonts, degrees, rgb } = require('@cantoo/pdf-lib');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const doc = await PDFDocument.create();
doc.setTitle('Membership form');
doc.setCreationDate(new Date('2026-01-01T00:00:00Z'));
doc.setModificationDate(new Date('2026-01-01T00:00:00Z'));
const font = await doc.embedFont(StandardFonts.Helvetica);
const form = doc.getForm();
const tooltip = (field, text) => field.acroField.dict.set(PDFName.of('TU'), PDFHexString.fromText(text));
const label = (page, text, x, y) => page.drawText(text, { x, y, size: 11, font, color: rgb(0.2, 0.2, 0.2) });

const first = doc.addPage([612, 792]);
first.drawText('Membership form', { x: 72, y: 730, size: 20, font });

label(first, 'Full name', 72, 696);
const name = form.createTextField('applicant.name');
tooltip(name, 'Full name');
name.addToPage(first, { x: 180, y: 690, width: 300, height: 22 });

label(first, 'Address', 72, 656);
const address = form.createTextField('applicant.address');
tooltip(address, 'Address');
address.enableMultiline();
address.addToPage(first, { x: 180, y: 600, width: 300, height: 66 });

label(first, 'Postcode', 72, 566);
const postcode = form.createTextField('applicant.postcode');
tooltip(postcode, 'Postcode');
postcode.setMaxLength(5);
postcode.enableCombing();
postcode.addToPage(first, { x: 180, y: 560, width: 110, height: 22 });

label(first, 'Email', 72, 526);
const email = form.createTextField('applicant.email');
tooltip(email, 'Email');
email.enableRequired();
email.addToPage(first, { x: 180, y: 520, width: 300, height: 22 });
// A fixed size (the others are automatic, size 0).
email.setFontSize(11);

label(first, 'Existing member', 72, 491);
form.createCheckBox('member').addToPage(first, { x: 180, y: 486, width: 16, height: 16 });

label(first, 'Plan', 72, 456);
const plan = form.createRadioGroup('plan');
tooltip(plan, 'Plan');
['Basic', 'Plus', 'Pro'].forEach((option, index) => {
  plan.addOptionToPage(option, first, { x: 180 + index * 80, y: 451, width: 16, height: 16 });
  label(first, option, 202 + index * 80, 455);
});

label(first, 'Country', 72, 416);
const country = form.createDropdown('country');
tooltip(country, 'Country');
country.addOptions(['Germany', 'Japan', 'United States', 'China']);
country.addToPage(first, { x: 180, y: 410, width: 200, height: 22 });

label(first, 'Interests', 72, 376);
const interests = form.createOptionList('interests');
tooltip(interests, 'Interests');
interests.addOptions(['Music', 'Sport', 'Travel', 'Books']);
interests.enableMultiselect();
interests.addToPage(first, { x: 180, y: 300, width: 200, height: 82 });

label(first, 'Reference', 72, 266);
const reference = form.createTextField('reference');
tooltip(reference, 'Reference');
reference.setText('QFT-1001');
reference.enableReadOnly();
reference.addToPage(first, { x: 180, y: 260, width: 150, height: 22 });

// Page 2 is stored upright and shown turned: fields keep their place on the paper.
const second = doc.addPage([612, 792]);
second.setRotation(degrees(90));
label(second, 'Comments', 72, 540);
const comments = form.createTextField('comments');
tooltip(comments, 'Comments');
comments.enableMultiline();
comments.addToPage(second, { x: 72, y: 400, width: 400, height: 120 });
label(second, 'I agree to the terms', 100, 365);
const agree = form.createCheckBox('agree');
tooltip(agree, 'I agree to the terms');
agree.enableRequired();
agree.addToPage(second, { x: 72, y: 360, width: 16, height: 16 });
label(second, 'Date', 72, 330);
const date = form.createTextField('date');
tooltip(date, 'Date (DD/MM/YYYY)');
date.addToPage(second, { x: 120, y: 320, width: 150, height: 22 });
label(second, 'Name again', 300, 330);
name.addToPage(second, { x: 380, y: 320, width: 200, height: 22 });

// Default appearances as Acrobat and LibreOffice write them: Helvetica at an
// automatic size (0), with the form's shared fonts /Helv and /ZaDb.
for (const field of form.getFields()) {
  const button = field instanceof PDFCheckBox || field instanceof PDFRadioGroup;
  const size = field.getName() === 'applicant.email' ? 11 : 0;
  field.acroField.setDefaultAppearance(button ? '/ZaDb 0 Tf 0 g' : `/Helv ${size} Tf 0 g`);
}
const acroForm = doc.catalog.lookup(PDFName.of('AcroForm'));
acroForm.set(PDFName.of('DA'), PDFString.of('/Helv 0 Tf 0 g'));
acroForm.set(
  PDFName.of('DR'),
  doc.context.obj({
    Font: {
      Helv: { Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica', Encoding: 'WinAnsiEncoding' },
      ZaDb: { Type: 'Font', Subtype: 'Type1', BaseFont: 'ZapfDingbats' },
    },
  }),
);

const bytes = await doc.save({ useObjectStreams: false, updateFieldAppearances: false });
await writeFile(path.join(root, 'tests/fixtures/form-fields.pdf'), bytes);
console.log(`Wrote tests/fixtures/form-fields.pdf (${bytes.length} bytes).`);
