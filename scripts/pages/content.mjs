/**
 * Copy for the tool pages that scripts/build-pages.mjs generates from index.html.
 *
 * Keep every claim true to what the app does today (see README, "Supported
 * input"). FAQ answers are also published as FAQPage structured data, so the
 * visible text and the data always match. In answers, [label](tool:id) links to
 * another tool page. Titles stay under 60 characters and descriptions under
 * 160, so search results show them in full (checked by the integrity test).
 */
const OPEN_STEP = ['Open your PDF.', 'Choose a file from your device. It opens right here in your browser.'];

export const PAGES = [
  {
    tool: 'text',
    name: 'Add text to PDF',
    title: 'Add text and images to a PDF for free — QFT PDF',
    description:
      'Place notes, labels, images or highlights anywhere on a PDF page. Choose size, colour and position, then download. Free, and your file stays on your device.',
    eyebrow: 'ADD TEXT & IMAGES',
    heading: ['Add text to a PDF.', 'Make your mark on the page.'],
    intro: 'Place a note, a label, a logo or a highlight exactly where you want it, then download your copy.',
    upload: { text: 'Drop a PDF here to start adding.', meta: 'PDF files · add PNG or JPG images' },
    how: ['How to add text', 'to a PDF.'],
    steps: [
      OPEN_STEP,
      ['Place your text.', 'Click the page where it belongs and type. Drag it into place and choose its size and colour. Images and highlights work the same way.'],
      ['Download your copy.', 'Save the edited PDF. The text you added stays selectable.'],
    ],
    faqs: [
      ['Can I change text after adding it?', 'Yes. Drag it to move it, drag its edge to change where lines wrap, or select it to change the words, size, colour or alignment. Undo and Redo cover every change.'],
      ['Can I edit the text that is already in my PDF?', 'No. QFT PDF adds new text, images and highlights on top of the page; it does not rewrite existing paragraphs.'],
      ['Which languages can I type?', 'Latin-script languages and Chinese, as well as Japanese kana and Korean Hangul. Only the characters you use are embedded, so Chinese text adds kilobytes, not megabytes. The Chinese font (16 MB) downloads once, the first time you type it.'],
      ['What images can I add?', 'PNG or JPG files up to 15 MB and 30 megapixels. They keep their original proportions.'],
      ['Can a highlight hide information?', 'No. Highlights are translucent marks, not secure redaction; the text underneath is still there.'],
    ],
  },
  {
    tool: 'signature',
    name: 'Sign PDF',
    title: 'Sign a PDF for free, in your browser — QFT PDF',
    description:
      'Draw, type or upload your signature and place it on one page or every page of a PDF. Free, no sign-up, and your PDF and signature stay on your device.',
    eyebrow: 'SIGN PDF',
    heading: ['Sign a PDF.', 'Your signature, right where it belongs.'],
    intro: 'Draw your signature, type your name, or use a picture of it, then place it on the page and download.',
    upload: { text: 'Drop a PDF here to sign it.', cta: 'Choose a PDF to sign' },
    how: ['How to sign', 'a PDF.'],
    steps: [
      OPEN_STEP,
      ['Make your signature.', 'Draw it with a mouse, finger or pen, type your name in a handwriting style, or upload a picture of it.'],
      ['Place it and download.', 'Click the page where it belongs, or add it to every page. Drag it into place, resize it, then save your copy.'],
    ],
    faqs: [
      ['Is my signature uploaded?', 'No. It is made and placed in your browser. It stays on this device only if you choose “Keep it on this device”, and you can remove it any time.'],
      ['Is this a legally binding signature?', 'It is an electronic signature: a picture of your signature on the page. Many everyday documents accept one, but some require a certificate-based digital signature, which QFT PDF does not create. Check what the recipient needs.'],
      ['Can I sign every page at once?', 'Yes. Add your signature to every page in one step, or place it once and copy it to the same spot on all pages. The PDF stores the picture only once.'],
      ['Can I use a photo of my signature?', 'Yes. Upload a PNG or JPG of your signature on light paper; QFT PDF can make the paper transparent so only the ink shows.'],
    ],
  },
  {
    tool: 'watermark',
    name: 'Add watermark to PDF',
    title: 'Add a watermark to a PDF for free — QFT PDF',
    description:
      'Stamp DRAFT, CONFIDENTIAL or any text across your PDF pages and choose its size, colour, angle and opacity. Free, and your file stays on your device.',
    eyebrow: 'WATERMARK',
    heading: ['Add a watermark to a PDF.', 'As bold or as subtle as you like.'],
    intro: 'Stamp DRAFT, CONFIDENTIAL or your own words across every page, or only the pages you choose.',
    upload: { text: 'Drop a PDF here to add a watermark.' },
    how: ['How to watermark', 'a PDF.'],
    steps: [
      OPEN_STEP,
      ['Design the watermark.', 'Turn it on and type your text. Its size, colour, opacity, angle and position change on the page as you set them.'],
      ['Download.', 'Show it on every page or only the pages you choose, then save your copy.'],
    ],
    faqs: [
      ['Can I watermark only some pages?', 'Yes. Type the pages it belongs on, such as 1-3, 5, or use the pages you select in the page strip.'],
      ['Can I watermark many PDFs at once?', 'Yes. [Batch & presets](tool:batch) applies the same watermark to several PDFs and downloads them together.'],
      ['Is my PDF uploaded?', 'No. The watermark is added in your browser and the file never leaves your device.'],
      ['Can someone remove the watermark?', 'It becomes part of the page, but like any visible watermark it is a label, not copy protection.'],
    ],
    batchShortcut: true,
  },
  {
    tool: 'footer',
    name: 'Add header and footer to PDF',
    title: 'Add headers and footers to a PDF — QFT PDF',
    description:
      'Put a title, your name or a page count at the top and bottom of every PDF page, aligned left, centre or right. Free, and your file stays on your device.',
    eyebrow: 'HEADERS & FOOTERS',
    heading: ['Add headers and footers to a PDF.', 'The same details on every page.'],
    intro: 'Add a title, your name, a date or page numbers to the top and bottom of every page.',
    upload: { text: 'Drop a PDF here to add headers and footers.' },
    how: ['How to add headers', 'and footers.'],
    steps: [
      OPEN_STEP,
      ['Fill in the six positions.', 'Type text for the left, centre or right of the header and footer, then choose the size, colour and margin.'],
      ['Check and download.', 'Your text appears on the pages as you type. Show it on every page or only some, then save your copy.'],
    ],
    faqs: [
      ['Can I include page numbers?', 'Yes. Type {page} and {total} anywhere, for example Page {page} of {total}.'],
      ['Can I add headers and footers to many PDFs?', 'Yes. [Batch & presets](tool:batch) applies the same headers and footers to several PDFs and numbers each file separately.'],
      ['Is my PDF uploaded?', 'No. Everything happens in your browser and the file never leaves your device.'],
    ],
    batchShortcut: true,
  },
  {
    tool: 'numbers',
    name: 'Add page numbers to PDF',
    title: 'Add page numbers to a PDF for free — QFT PDF',
    description:
      'Number your PDF pages: choose the format, starting number, position, size and colour, then download. Free, and your file stays on your device.',
    eyebrow: 'PAGE NUMBERS',
    heading: ['Add page numbers to a PDF.', 'A little order goes a long way.'],
    intro: 'Number every page, or only the pages you choose, in the format and position you like.',
    upload: { text: 'Drop a PDF here to number its pages.' },
    how: ['How to number', 'PDF pages.'],
    steps: [
      OPEN_STEP,
      ['Choose the format.', 'Use {page} and {total}, for example Page {page} of {total}, then pick the starting number and position.'],
      ['Download.', 'Numbers update as you work and follow the final page order, even if you rearrange pages afterwards.'],
    ],
    faqs: [
      ['Can I start from a number other than 1?', 'Yes. Set any starting number, for example 5 for a document that continues an earlier one.'],
      ['Where can the numbers go?', 'At the bottom left, centre or right of the page, with your choice of size, colour and margin.'],
      ['Can I number several PDFs at once?', 'Yes. [Batch & presets](tool:batch) numbers each file separately, starting again for every PDF.'],
      ['Is my PDF uploaded?', 'No. Numbering happens in your browser and the file never leaves your device.'],
    ],
    batchShortcut: true,
  },
  {
    tool: 'pages',
    name: 'Organize PDF',
    title: 'Reorder, rotate and extract PDF pages — QFT PDF',
    description:
      'Drag PDF pages into a new order, rotate them, remove the ones you do not need, or download only the pages you select. Free and private, in your browser.',
    eyebrow: 'ORGANIZE & EXTRACT',
    heading: ['Organize PDF pages.', 'Reorder, rotate, extract.'],
    intro: 'Put pages in the right order, turn them the right way up, and keep only what you need.',
    upload: { text: 'Drop a PDF here to organize its pages.' },
    how: ['How to organize', 'PDF pages.'],
    steps: [
      OPEN_STEP,
      ['Arrange the pages.', 'Drag pages in the page strip or use the Move buttons. Select pages to rotate or remove them.'],
      ['Download.', 'Save the whole document, or only the selected pages as a new PDF.'],
    ],
    faqs: [
      ['Can I extract pages into a new PDF?', 'Yes. Select the pages, or type a range such as 1-3, 5, and choose Download selected pages.'],
      ['Can I reorder pages without dragging?', 'Yes. Move earlier and Move later buttons work with the keyboard and on touch screens.'],
      ['Can I combine pages from several PDFs?', 'Yes. Use Add PDF to bring in more files and arrange all the pages together, or start with [Merge PDF](tool:merge).'],
      ['Is my PDF uploaded?', 'No. Pages are rearranged in your browser and the file never leaves your device.'],
    ],
  },
  {
    tool: 'delete',
    name: 'Delete PDF pages',
    title: 'Delete pages from a PDF for free — QFT PDF',
    description:
      'Remove unwanted pages from a PDF: tick them in the page strip or type ranges like 2, 4-6, then download the rest. Free, and your file stays on your device.',
    eyebrow: 'DELETE PAGES',
    heading: ['Delete pages from a PDF.', 'Keep only what you need.'],
    intro: 'Tick the pages you don’t need, or type their numbers, and download a tidier copy.',
    upload: { text: 'Drop a PDF here to remove pages.' },
    how: ['How to delete', 'PDF pages.'],
    steps: [
      OPEN_STEP,
      ['Mark the pages.', 'Tick pages in the page strip, or type numbers and ranges such as 2, 4-6.'],
      ['Delete and download.', 'Remove the marked pages, check the preview, then save your copy.'],
    ],
    faqs: [
      ['Can I undo a deletion?', 'Yes. Undo brings pages back until you download, and your original file is never changed.'],
      ['Can I delete every page?', 'No. At least one page has to remain in the document.'],
      ['Is my PDF uploaded?', 'No. Pages are removed in your browser and the file never leaves your device.'],
    ],
  },
  {
    tool: 'crop',
    name: 'Crop PDF',
    title: 'Crop PDF pages for free, in your browser — QFT PDF',
    description:
      'Trim PDF margins by drawing the area to keep or entering percentages, on one page or all of them. Text stays selectable. Free and private, in your browser.',
    eyebrow: 'CROP PDF',
    heading: ['Crop PDF pages.', 'A little less around the edges.'],
    intro: 'Draw the area to keep, or set exact margins, and crop one page or the whole document.',
    upload: { text: 'Drop a PDF here to crop its pages.' },
    how: ['How to crop', 'a PDF.'],
    steps: [
      OPEN_STEP,
      ['Choose the area.', 'Drag a rectangle on the preview, or enter top, bottom, left and right margins in percent.'],
      ['Crop and download.', 'Crop the current page, selected pages or every page, then save your copy.'],
    ],
    faqs: [
      ['Does cropping delete the hidden content?', 'No. Cropping changes the visible page area; content outside it is hidden, not removed, so it is not a secure way to redact.'],
      ['Will the text stay sharp and selectable?', 'Yes. Cropping keeps text and vector graphics at their original quality.'],
      ['Can I undo a crop?', 'Yes. Use Undo, or Restore original crop to bring back the original page boundaries.'],
      ['Can I crop many PDFs the same way?', 'Yes. [Batch & presets](tool:batch) applies the same crop margins to several PDFs.'],
    ],
    batchShortcut: true,
  },
  {
    tool: 'merge',
    name: 'Merge PDF',
    title: 'Merge PDF files for free, in your browser — QFT PDF',
    description:
      'Combine several PDFs into one file, then reorder, rotate or remove pages before you download. Free, no sign-up, and your files stay on your device.',
    eyebrow: 'MERGE PDF',
    heading: ['Merge PDF files.', 'One document, all in order.'],
    intro: 'Combine several PDFs into one document. Arrange the pages, then download a single file.',
    upload: {
      heading: 'Start with your PDFs.',
      text: 'Drop two or more PDFs here.',
      cta: 'Choose PDFs to merge',
      meta: 'Select several files at once · no fixed size or page limit',
    },
    how: ['How to merge', 'PDF files.'],
    steps: [
      ['Choose your PDFs.', 'Select two or more files at once. You can add more later with Add PDF.'],
      ['Put pages in order.', 'Drag pages in the page strip or use the Move buttons. Rotate or remove any page.'],
      ['Download one PDF.', 'Save the combined document. Your original files stay untouched.'],
    ],
    faqs: [
      ['Is merging PDFs free?', 'Yes. There is no sign-up and no fixed limit on file size or page count; very large files depend on your device’s memory.'],
      ['Are my files uploaded?', 'No. The PDFs are combined in your browser and never sent to a server.'],
      ['Can I merge PDFs with fillable form fields?', 'Not yet. Rather than silently losing the fields, QFT PDF asks you to save a flattened copy in your PDF reader first.'],
      ['What about password-protected PDFs?', 'Add them as usual and enter each password when asked. The merged PDF is protected with the first password you entered; change it in [Protect PDF](tool:protect) or remove it in [Unlock PDF](tool:unlock).'],
    ],
  },
  {
    tool: 'split',
    name: 'Split PDF',
    title: 'Split a PDF into separate files for free — QFT PDF',
    description:
      'Split a PDF by page, every few pages or custom ranges like 1-3; 4-6. Download each part or all of them in a ZIP. Free, and your file stays on your device.',
    eyebrow: 'SPLIT PDF',
    heading: ['Split a PDF.', 'Exactly where you want.'],
    intro: 'Separate a document into single pages, equal parts or custom groups, and download them together.',
    upload: { text: 'Drop a PDF here to split it.', cta: 'Choose a PDF to split' },
    how: ['How to split', 'a PDF.'],
    steps: [
      OPEN_STEP,
      ['Choose how to split.', 'Every page, every N pages, or custom groups. In groups, a semicolon starts a new PDF: 1-3; 4, 6; 7-9.'],
      ['Download the parts.', 'Save each PDF on its own, or all of them in one ZIP.'],
    ],
    faqs: [
      ['Do my other edits carry over?', 'Yes. Text, page numbers, crops and other edits appear in every part, exactly as previewed.'],
      ['Can I split a PDF that has fillable form fields?', 'Not yet. Rather than silently losing the fields, QFT PDF asks you to save a flattened copy in your PDF reader first.'],
      ['Is there a page limit?', 'No fixed limit. Very large documents depend on your device’s memory.'],
      ['Is my PDF uploaded?', 'No. The parts are created in your browser and never leave your device.'],
    ],
  },
  {
    tool: 'protect',
    name: 'Protect PDF',
    title: 'Password-protect a PDF for free — QFT PDF',
    description:
      'Add a password to a PDF with AES-256 encryption, so only people who know it can open the file. Free, and your PDF and password stay on your device.',
    eyebrow: 'PROTECT PDF',
    heading: ['Password-protect a PDF.', 'Keep it for the right eyes.'],
    intro: 'Choose a password, and anyone who opens your PDF will need it. The encryption happens right here in your browser.',
    upload: { text: 'Drop a PDF here to protect it.', cta: 'Choose a PDF to protect' },
    how: ['How to password-protect', 'a PDF.'],
    steps: [
      OPEN_STEP,
      ['Choose a password.', 'Type it in Protect PDF. Show password lets you check what you typed.'],
      ['Download the protected PDF.', 'Your copy is encrypted with AES-256 and opens only with the password. Your original file is unchanged.'],
    ],
    faqs: [
      ['How strong is the protection?', 'The PDF is encrypted with AES-256, the strongest encryption PDF readers support. As with any password, a long one that is hard to guess protects best.'],
      ['What if I forget the password?', 'QFT PDF doesn’t keep it and can’t recover it, so store it somewhere safe. Your original, unprotected file is unchanged.'],
      ['Is my password sent anywhere?', 'No. The PDF is encrypted in your browser, and neither the file nor the password leaves your device.'],
      ['Can I edit the PDF before protecting it?', 'Yes. Add text, page numbers or a watermark, or reorder and remove pages, then download it protected. Split parts and downloaded page selections get the same password.'],
      ['Will it open in other PDF readers?', 'Yes. Current PDF readers, including Adobe Acrobat and web browsers, ask for the password and then open it.'],
    ],
  },
  {
    tool: 'unlock',
    name: 'Unlock PDF',
    title: 'Remove a password from a PDF — QFT PDF',
    description:
      'Know the password? Open your protected PDF and download a copy that opens without it, and without printing or copying limits. Free and private.',
    eyebrow: 'UNLOCK PDF',
    heading: ['Unlock a PDF.', 'Leave the password behind.'],
    intro: 'Open a password-protected PDF with its password, then download a copy that opens without one.',
    upload: { text: 'Drop a protected PDF here to unlock it.', cta: 'Choose a PDF to unlock' },
    how: ['How to remove a password', 'from a PDF.'],
    steps: [
      ['Open your PDF.', 'Choose the protected file and enter its password. It is used only on your device.'],
      ['Check the result.', 'Unlock PDF confirms that your download will open without a password. Edit the PDF too, if you like.'],
      ['Download the unlocked copy.', 'Save a copy that opens without a password. Your original file is unchanged.'],
    ],
    faqs: [
      ['Can QFT PDF unlock a PDF without its password?', 'Only when the PDF opens without a password and just limits printing, copying or changes. A PDF that needs a password to open can’t be unlocked without it.'],
      ['Is my password sent anywhere?', 'No. The PDF is decrypted in your browser, and the password is used only to open it. It isn’t stored.'],
      ['Can I edit a protected PDF and keep its password?', 'Yes. Open it in any QFT PDF tool and enter its password. Your download keeps the same password unless you remove it here or change it in [Protect PDF](tool:protect).'],
      ['Which kinds of protection are supported?', 'Passwords with AES-256, AES-128 or RC4 encryption. PDFs protected with a certificate can’t be opened.'],
    ],
  },
  {
    tool: 'batch',
    name: 'Batch edit PDFs',
    title: 'Batch watermark, number and crop PDFs — QFT PDF',
    description:
      'Apply the same watermark, headers and footers, page numbers or crop to many PDFs at once, save it as a preset, and download a ZIP. Free and private.',
    eyebrow: 'BATCH & PRESETS',
    heading: ['Batch-edit PDFs.', 'One setup. Every PDF.'],
    intro: 'Apply a saved combination of edits to a whole stack of PDFs, then download them together.',
    upload: {
      heading: 'Start with your PDFs.',
      text: 'Drop several PDFs here to start a batch.',
      cta: 'Choose PDFs',
      meta: 'Files are processed one at a time, on your device',
    },
    how: ['How to batch-edit', 'PDFs.'],
    steps: [
      ['Set up your edits.', 'Start from a ready-made preset or your own: watermark, headers and footers, page numbers and crop.'],
      ['Add your PDFs.', 'Choose or drop as many files as you need. Each one stays a separate document.'],
      ['Process and download.', 'Download the files one by one, or all of them in a ZIP.'],
    ],
    faqs: [
      ['Are my presets saved?', 'Yes, in this browser. Presets keep only your settings and text; PDFs are never saved.'],
      ['What happens if one file fails?', 'The others still finish. The file that could not be processed shows the reason.'],
      ['Do page numbers restart for each file?', 'Yes. Each PDF is numbered on its own, starting from your chosen number.'],
      ['Is anything uploaded?', 'No. Every file is processed in your browser and never leaves your device.'],
    ],
    sample: false,
  },
];
