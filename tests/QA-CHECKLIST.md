# QFT PDF release checks

This is a focused manual acceptance plan for the browser-local PDF editor. The
source review does not replace the owner’s browser verification.

## Required working journeys

1. **First visit:** Open the supplied sample from the landing page. Its pages (one
   under another), page count, filename, and thumbnails appear. A new visitor can also reach the
   file chooser with the keyboard.
2. **Real file:** Open a PDF from disk and drag/drop another. A document drag must
   not navigate the browser away from the app. Unsupported file types and corrupted
   PDFs show readable errors; a password-protected PDF asks for its password
   (see Passwords below). PDFs above the former 50 MB
   per-file and 100 MB combined caps are not rejected solely for byte size;
   there is no fixed page-count cap. Capacity depends on browser memory.
3. **Add text:** Click the page and type a note; drag it, narrow it with its edge
   handle, and change its text, size and alignment from the panel. Undo and redo
   each step. Export, reopen the export and confirm the text is selectable and
   where the preview showed it. The feature makes no promise to change original text.
4. **Watermark:** Turn on a rotated, translucent watermark; it appears on every
   page as you adjust it. Check the first and last pages of the downloaded PDF and
   verify that content remains legible. Limit it to some pages and confirm the
   other pages stay clear.
5. **Repeated footer:** Type the same footer for every page. Check that the visible
   result agrees with the download. Verify left, center, and right alignment and
   `{page}` / `{total}` substitution.
6. **Page numbers:** Start numbering at a value other than one, reorder pages,
   and export. Numbers follow the output order and the documented start/count
   convention; they do not follow original source page indices.
7. **Organize:** Move a page with keyboard-operable controls, rotate it, remove a
   different page, and export. Reopen the export and verify count, order, and
   orientation. Removing the last remaining page is handled explicitly.
8. **Merge:** Append a second document, including one with a different page size.
   Confirm the file/page list and output preserve both documents in the requested
   order. Repeated filenames do not collide.
9. **Extract:** Select nonconsecutive pages and download only those pages. Verify
   exact order and count rather than checking only that a PDF file is produced.
10. **Undo/redo/reset:** Undo and redo after typing, dragging, a setting change and
    a page deletion. Reset restores the first document and can itself be undone.
    Loading another file must not inherit stale annotations or a stale active page.
11. **Image/highlight:** Place an image and drag a highlight; move and resize both.
    Preview and export agree on dimensions, opacity, and location. Highlighting
    is described as annotation, never as secure redaction.
12. **Keyboard:** Add text with the panel button, finish with Escape, then move
    it with the arrow keys, edit it with Enter and delete it with Delete. Add a
    highlight and a shape the same way and resize them with Alt and the arrow
    keys, and with Width and Height in the panel.

## Geometry and input cases

- Portrait plus landscape pages and different MediaBox dimensions.
- Existing PDF rotation at 90 and 270 degrees, including an additional user turn.
- A CropBox with nonzero origin; marks are positioned inside the visible page.
- English and Chinese text, long lines, empty text, missing font assets, and
  characters outside the supported fonts. Unsupported text produces a useful
  message rather than a corrupt document or silent missing glyphs.
- Zero and full opacity; very small and large sizes; annotations near every edge.
- Rapid tool switching and page switching while previews are rendering. A stale
  asynchronous task must not overwrite the latest page or export state.

## Accessibility and mobile

- Each icon-only button has an accessible name; labels are tied to inputs,
  sliders included (a test finds each slider by role and name).
- Buttons work by keyboard, focus is visible, and any dialog restores focus.
- Processing progress and success/error messages are announced through a live
  region; disabled actions explain what is required when that is not evident.
- Reorder and resize work without dragging. Pointer placement does not block normal page
  scrolling on mobile outside the editing canvas.
- On a phone the page is the first thing under the document bar; tools are in the
  bottom bar and their settings sheet folds away. Tap targets are at least 44 px.
- At a narrow viewport, controls do not cover the page or the download action;
  there is no accidental document-wide horizontal overflow.
- Range sliders have text values or equivalent numeric controls. Color is not
  the sole indicator of selected pages or active tools.

## Public release hygiene

- Main dependencies, workers, fonts, and sample assets load from the site itself.
- No document bytes or filenames are sent to telemetry or a processing endpoint.
- Privacy wording states what is actually implemented; it does not promise an
  absolute absence of all hosting/network logs.
- Third-party license notices are present and reachable.
- Export filenames are useful and safe. Downloaded output is nonempty and opens
  in an independent reader after at least one multi-step editing journey.
- Public URL resolves without requiring the owner’s login. Deployment state and
  audience are verified through the native hosting result.

## Delete / Crop update — 2026-10-30

- Desktop browser: opened sample, set numeric crop margins, applied crop,
  selected page 2 by range, deleted it (3 → 2 pages), and undid (2 → 3).
- Select-all deletion correctly disabled with a keep-one-page explanation.
- Crop rectangle pointer drag updated all four numeric controls and the shaded
  boundary. Every-page scope applied successfully; preview navigation worked.
- PDF engine suite passed independent PDF.js geometry/text assertions for
  native rotations, added rotations, nonzero crop origins, annotation anchors,
  reset, invalid crops, repeated export, and existing editing operations.
- HTTPS export captured successfully after crop + delete. The downloaded PDF
  contained source pages 1 and 3, correct crop dimensions, and searchable text.
  HTTP preview did not emit a download event; HTTPS publication was verified.
- Screenshot: `tests/screenshots/crop-tool.jpg`.

## QFT PDF rebrand and long documents — 2026-10-30

- No fixed PDF byte-size or page-count rejection remains. Browser memory and
  document complexity remain practical limits.
- A generated 350-page PDF opened and navigated to page 350 successfully.
  Only three nearby thumbnails were rendered at the final-page check.
- Offscreen canvases and PDF.js page resources are released; replacement
  thumbnail generations cancel an outstanding thumbnail render task.
- Main header measured 56 px on desktop; editor header measured 48 px, with
  the document toolbar at 58 px. Screenshot: screenshots/qft-pdf-home.jpg.
- QFT PDF branding verified in the header/footer, page title, favicon, sample
  document, help/privacy copy, open-source notices, and generated-PDF producer.
- The sample document's three pages and metadata were checked. The complete
  PDF engine suite passed after the update.

## Batch, Split, and interface update — 2026-10-31

- Existing PDF engine tests and new workflow tests passed. Workflow assertions
  independently inspect PDF text/geometry and ZIP CRC/content.
- Browser: saved a named numbering preset and confirmed it in a fresh page;
  processed two valid PDFs alongside one invalid PDF. Both valid results
  remained downloadable, while the invalid file showed an isolated error.
- Applied crop (5% top) transferred to the batch preset with exactly 5% retained.
- Every-page split created three PDFs from the sample; every two pages created
  two outputs. Custom `1-2; 3` and out-of-range validation were exercised.
- Direct page navigation reached page 3, including the correct canvas label.
- Tool search returned the relevant card. 320px and 390px embedded viewports
  showed no body horizontal overflow across home, batch, and editor views.
- Smaller header, readable input labels, focus rings, pending-change indicator,
  progress/stop controls, and undownloaded-output unload protection reviewed.
- Screenshots: screenshots/qft-batch-workspace.jpg and
  screenshots/qft-responsive-workflows.jpg.

## MIT notices and GitHub Pages migration — 2026-10-31

- Preserved the destination repository's MIT license, copyright 2026 Jie Ren.
  The served application license is byte-identical to the root LICENSE file.
- Verified vendor bundles and font assets against official distributions;
  retained the available dependency notices and recorded upstream provenance.
  Fontkit's pinned-source rebuild matches its published UMD file byte for byte.
- Engine and workflow tests passed without environment-specific runtime paths.
  Static checks cover 52 resource links at both the custom-domain root and the
  GitHub Pages project path.
- The checked-in CJK font chunks reconstruct the original font with verified
  SHA-256 hashes. The deployment workflow restores it before artifact upload.
- Browser preview: the sample loaded under the HTML content security policy,
  every-page split produced three results, and the license page rendered with
  its notice links. Screenshot: screenshots/qft-license-page.jpg.
- This records local acceptance only. Repository Pages settings, DNS, and HTTPS
  must be configured as described in README.md before public-domain acceptance.

## Deploy check: reload after a release — 2026-10-31

- Incident: right after the previous release deployed, a normal reload loaded
  the new index.html but reused the earlier release's cached app.js and
  pdf-engine.js (GitHub Pages caches every file for ten minutes under the same
  URL). The old engine expected pdf-lib from a script tag the new page no longer
  has, so every PDF was reported as "could not be opened as a PDF" until the
  cache expired or the visitor hard-refreshed.
- Fix: the Pages workflow versions asset URLs per release
  (`scripts/stamp-release.mjs`; covered by `tests/release-stamp.test.mjs`).
- Verified with a local server that mimics GitHub Pages caching (max-age=600,
  ETag): open the site, switch to the next build, reload normally, open the
  sample. Original -> previous release reproduced the error; previous release
  -> fixed release, fixed -> later release and original -> fixed all opened
  the sample. After the reload, every versioned file was fetched fresh.
- Manual check after each deploy: in a tab opened before the deploy, reload
  normally (not a hard refresh) and open a PDF.

## Live editing and phone layout — 2026-10-31

- Edits apply at once: the preview renders source pages with PDF.js and draws
  edits as SVG with the export's layout code; the PDF is built only to download,
  extract or split, in a module worker. The Apply buttons, the "Unapplied
  settings" badge and Discard are gone.
- Fidelity: the downloaded PDF rendered by PDF.js matched the editor preview
  pixel for pixel (at most 0.07% of pixels differing, at image edges) on the
  sample and on `tests/fixtures/rotated-cropped.pdf` after notes, highlights, a
  watermark, headers/footers, turning pages before and after placing notes, and
  cropping. `tests/preview.test.mjs` now checks text positions automatically.
- Browser journeys passed in Chromium: click-to-type text, drag and resize text,
  images and highlights, keyboard add/nudge/edit/delete, undo/redo for typing,
  moves, settings, crops, merges and reset, page scope by number, unsupported
  characters and too-long headers reported on the page (and an export error
  jumps to the page), merge/split/extract/crop, back/forward, settings to batch,
  and form PDFs refusing page removal up front.
- A 400-page PDF opened in 0.8 s; a settings change or keystroke reached the
  screen in the next frame (about 33 ms to two painted frames); turning all 400
  pages, moving or deleting one, undo and redo each took about 0.1 s; export took
  1.2 s with no long main-thread tasks.
- axe: no violations in 30 editor states on desktop and iPhone 13 sizes.
  Lighthouse: 100 in every category for the home page and a tool page, mobile
  and desktop. No horizontal overflow from 320 px to 1280 px.
- Phone (iPhone 13): the page starts 113 px from the top, below the document bar
  and page controls; every tap target in the editor is at least 44 px (page
  checkboxes through their 44 px labels).

## pdf-lib replaced by @cantoo/pdf-lib 2.11.1 — 2026-11-01

- Why: upstream pdf-lib's last release (1.17.1) was in November 2021. The fork is
  maintained, keeps the same API, and can open password-protected PDFs and encrypt
  output (not enabled yet; verified separately that it unlocks AES-256 files with
  the right password, rejects a wrong one, and opens owner-password-only files).
- Provenance: the vendored bundle is the official npm UMD (registry integrity
  checked). `scripts/collect-pdf-lib-notices.py` pins its five bundled libraries
  (culori, fflate, html-entities, node-html-better-parser, tslib) to the npm
  releases whose files match the bundle's embedded sources byte for byte, and
  confirms the standard-font metrics decode identically to @pdf-lib/standard-fonts
  1.0.0, so the Adobe notices and text measurements are unchanged.
- Engine changes: removePage now deletes the page object, so reordering a whole
  document registers each page again before re-adding it; @pdf-lib/fontkit subsets
  are offered through encodeStream() (the fork otherwise calls fontkit 2's
  encode()); saves request object streams explicitly. A new engine test embeds
  accented Latin text as a font subset, the path that broke.
- Same results: identical text and positions in exports of the sample, a reordered
  document, a merge, the rotated/cropped fixture and 100/400-page documents; the
  preview still matches downloads pixel for pixel (at most 0.07% of pixels differ);
  editing, merge/split/extract/crop, batch (with an encrypted file isolated as
  before), the export worker in a release-stamped build and its fallback all pass.
- Differences: the fork leaves page dictionaries outside compressed object streams,
  so files grow by about 0.3 KB per page (a 100-page report with a watermark,
  footer and numbers: 78 KB → 110 KB; the 3-page sample: 51 KB → 53 KB). Export
  speed is unchanged (400 pages in about 1 s in the browser).
- Also fixed: arrow-key nudges pressed within one animation frame collapsed into
  one step; they now accumulate (five presses move 5 pt).

## Passwords, Protect PDF and Unlock PDF — 2026-11-01

- Opening: a PDF that needs a password shows a prompt naming the file; an empty
  or wrong password keeps it open with a message under the field; Show password
  reveals what was typed; Cancel (Skip this file when opening several) and Escape
  open nothing; reopening straight after cancelling prompts again. Owner-password
  PDFs open without a prompt and say their limits won't be kept. Checked with
  AES-128, RC4 and AES-256 (Unicode password) files encrypted by pypdf.
- Downloads keep the password the PDF was opened with: the Download button shows
  a lock and its name says so, the file is named `-protected`, and it needs the
  password in another reader. Unlock PDF removes the password (Undo restores it);
  on the Unlock PDF page a file is opened without protection. Protect PDF refuses
  to download until a usable password is typed, and rejects control characters.
- Split parts and extracted pages need the password too. Batch processes
  owner-password PDFs and asks for PDFs needing a password to be unlocked first.
- The same journeys pass in a release-stamped build. axe: no violations in the
  prompt (with and without an error), the Protect and Unlock panels and pages,
  on desktop and iPhone 13. No horizontal overflow from 320 px to 1280 px.
- Library fix: protected files kept strings outside object streams (such as the
  document language) unencrypted, so readers showed garbage; now encrypted, and
  checked with PDF.js. The engine test fails without the fix.

## Smaller Chinese text: @cantoo/fontkit subsets — 2026-11-01

- fontkit is now `@cantoo/fontkit` 2.0.12. Its subsets of Noto Sans CJK SC's CFF
  outlines are valid, so only the glyphs used are embedded: five lines of Chinese,
  Japanese kana and Korean add about 60 KB to a download instead of 13.5 MB, and
  the export takes about 0.4 s instead of 4 s. Korean keeps working.
- Checked in three independent renderers. PDFium (Chrome) and MuPDF draw the subset
  like the whole font; older fontkit's subset failed in both (MuPDF: "unknown file
  format"; PDFium drew almost nothing). PDF.js reads the new subset without warnings
  and warned about the old one; the engine test fails on those warnings.
- Also fixed: with the whole font embedded, digits and spaces in CJK text were far
  too wide in downloads ("1  2  3"). Widths now match the preview (engine test).
- The CJK font's contextual alternates widened spaces in Hangul text, which the
  preview (no ligatures or alternates) did not draw. The export now uses the same
  plain glyphs: preview and download of Chinese, Korean and kana text match pixel
  for pixel (0.000%). Latin text is unchanged (at most 0.002% of pixels).
- The bundle is half the size (387 KB instead of 758 KB). The export worker loads it
  through its CommonJS export; both the worker and the no-worker fallback produce
  the same download.
- Adobe Acrobat and Apple Preview (checked by the site owner, 2026-11-02): a download
  with Simplified and Traditional Chinese, Japanese kana, Korean and mixed text (the
  engine test's `tests/output/cjk-subset-export.pdf`) displays properly in both.
- Known limit: Han characters are drawn with the font's Simplified Chinese shapes (the
  preview and the export use none of its language-specific `locl` forms), so some
  Japanese kanji and Traditional Chinese characters, such as 骨 and 令, look slightly
  different from Japanese or Traditional Chinese typefaces. The font has those shapes;
  using them would need to know each text's language.

## Browser tests in CI — 2026-11-01

- `tests/browser/` (Playwright, Chromium) covers the journeys above: 33 tests, about
  a minute. They run in the Test workflow for pull requests and in the Pages
  workflow before deployment. Projects: `desktop` (1280 px), `phone` (iPhone 13,
  touch) and `release` (a stamped copy served under `/pdf.qft.org/`).
- They found three problems, now fixed: a damaged PDF (a header and no pages) showed
  "Cannot read properties of undefined" instead of the "could not be opened"
  message; on phones the "Use these settings in batch" link and the Show password
  check box were under 44 px tall.
- Downloads are compared with the preview pixel by pixel in the browser (at most
  0.1% of pixels may differ, for anti-aliasing): Latin text, watermarks, headers and
  footers, page numbers, and Chinese, Korean and kana text.

## Sign PDF — 2026-11-01

- Draw (mouse, finger, pen), type (Allura) or upload a signature; uploads get a
  transparent background and are cropped to the ink. Use this signature is disabled
  until there is something to use.
- Click the page to place it, or Add it to page N (scrolled into view) / Add it to
  every page; a placed signature can be copied to the same spot on every page. Undo
  covers each step. Clicking the page before making one explains what to do.
- Downloads store the picture once however many pages carry it (browser and engine
  tests count the image objects).
- Kept in this browser only with "Keep it on this device"; unticking removes it
  (browser test reloads the page to check both).
- axe: no violations while typing a signature, with it ready to place, and placed.
  Phones: 44 px targets and no sideways scrolling with the Sign panel open.
- Known limit: on phones, the 44 px corner handles can cover a small signature; move
  it by dragging its middle or the handles, or resize it with the Width slider.

## JPG to PDF and PDF to JPG — 2026-11-01

- Pictures open as pages on their own or with PDFs (also from the page strip's Add
  button); a photo tagged "turn 90°" (EXIF orientation 6) comes out upright. Page
  size: A4 or Letter (by browser language), turned to suit each picture, or the
  picture's own size; margin none, small or large; changing them is one undo step.
  JPEG data is embedded unchanged (engine test).
- PDF to JPG: JPG or PNG at 72, 150 or 300 dpi; every page (ZIP), the selected pages
  or the current page (one picture). An A4 page at 150 dpi is 1240 x 1753 pixels.
- With Add an image active, a picture added from the page strip is placed on the
  page rather than added as a page.
- axe: the JPG to PDF and PDF to JPG pages and panels have no violations; phones: 44
  px targets and no sideways scrolling with either panel open.

## Continuous scrolling — 2026-11-01

- Pages show one under another and scroll continuously, each fitted to the width
  (a page turned on its side is as wide as the others). The page filling most of the
  view is the current page: the page number, Previous and Next, the page strip, the
  "Add … to page N" buttons, PDF to JPG's current page and Organize's current page
  follow it. Clicking or tapping a page makes it current.
- Every page is edited where it is: click page 2 under page 1 to add text there
  (browser test checks the download). Crop outlines the pages its scope covers; Delete
  pages marks the pages to delete on the stage as in the strip.
- Undo and redo show the page they change; moving, turning or removing the current
  page keeps it (or the page now in its place) in view; zoom, window resizing and
  leaving and returning to the editor keep the reading position. Control and the
  wheel (a touchpad pinch) zoom around the pointer.
- Phones: at Fit each page fits the stage and settles in its middle (CSS scroll
  snapping); zoomed in, pages scroll freely. Swiping does not end typing; a tap does.
- A 400-page document: the first page drawn 0.7 s after choosing it, two to four pages
  kept in the page (the rest are released, with PDF.js's data for them), JavaScript
  heap about 22 MB throughout, frames during scrolling 17 ms (median) and 27 ms (95th
  percentile) in headless Chromium. Pages in view are drawn first; a page being drawn
  out of view gives way when scrolling fast.
- Browser tests: 47 (desktop, phone and release), including `scrolling.spec.mjs`.
- Known limits: the keyboard's Tab reaches items on the pages near the view; go to a
  page with the page number or the strip first (as before, when one page showed at a
  time). Zooming with Control and the wheel was checked in Chromium at first, and since
  in WebKit and Firefox too (below); Safari's touchpad pinch sends its own gesture
  events, which are not handled.

## Safari's engine and Firefox — 2026-11-01

- The browser tests run in Chromium, WebKit (desktop and iPhone) and Firefox
  (desktop), in their own CI jobs for pull requests and all three before deploying.
- What they found: three test assumptions, not app bugs. Firefox drops a control
  character typed into a field, and scrolls a different amount per wheel turn; in
  Playwright's Firefox, mouse moves outside the window are dropped, so the crop drag
  now stays on screen (a diagnostic run showed the drag itself works); crop margins
  are kept to 0.1%, so the crop size check allows up to 1.3 pt.
- The phone swipe test sends touches through Chromium's DevTools protocol and runs
  in Chromium only.
- The zoom test (Control and the wheel, around the pointer) passes in all three.
  Safari's touchpad pinch, which sends its own gesture events, is still not handled.

## Fill form — 2026-11-01

- A PDF with form fields opened from the home page opens in Fill form. Text fields
  (one line, several lines, boxed characters, maximum length), check boxes, radio
  buttons, dropdowns and lists fill in on the page; read-only fields are drawn as they
  are. Tab moves through the fields in reading order and on to the next page; “Go to
  the next empty field” finds what is left; the panel counts filled and required
  fields. Each change is an undo step.
- Other tools and the page strip show the values as PDF.js draws them, as readers will
  show the download.
- Download keeps the fields fillable, with the values and new appearances (Polish and
  Chinese text in the Noto fonts; automatic sizes as PDF.js works them out), or
  flattens them: no fields or widgets remain, the values are page content, and hidden
  fields are not drawn. A flattened form can be combined with other PDFs; without
  flattening, combining is refused with a message pointing to the option.
- A character no font has is reported on its page and field, and Fill form opens at it.
- Engine tests (`tests/forms.test.mjs`) and browser tests (`forms.spec.mjs`), including
  axe and a turned page (/Rotate 90) whose inputs turn with it.
- Known limits: calculations and checks built into a form do not run; XFA-only forms
  are not supported; signature fields stay empty (Sign PDF places a picture of a
  signature). On phones, the page zooms to the field you tap (see the 2026-11-07 section).

## Split and forms; help and FAQs — 2026-11-02

- Split with a PDF that has form fields: the Split panel says “Flatten fields on
  download” is needed, and Create split PDFs shows the same message. With flattening
  on, the parts download with no fields and the answers on their pages (browser test).
  Split's own check in `workflows.js` points to the same option.
- The help dialog (a Forms section, Supported files, Fonts), the Merge PDF and Split
  PDF FAQs and the README no longer say that form PDFs can't be combined or split.

## Copying pages: links, bookmarks and details — 2026-11-02

- Before: copying pages (delete, extract, combine, duplicate, split) used pdf-lib's
  copyPages, which follows links. Extracting the contents page of a 60-page PDF
  gave a one-page file holding the text of the other 59 pages, unreachable but
  readable; links led to those hidden copies, and the title, author, language and
  bookmarks were dropped.
- Now (`copyPagesWithLinks`, `copyDocumentInfo`, `copyBookmarks` in `pdf-engine.js`,
  also used by Split): links and bookmarks to kept pages lead to them, named
  destinations included; links to pages left out are removed; any other reference to
  a page (an annotation's /P, page actions, beads) points at the copy or at nothing.
  Details and language come from the first PDF; combined PDFs keep every PDF's
  bookmarks. The source is restored after each copy, so overlapping Split groups
  each keep their own links.
- `tests/copy.test.mjs`, checked with PDF.js: where each link and bookmark leads
  (explicit, /Dests and /Names destinations, GoTo actions, a shared action, open and
  closed bookmarks, colour and bold), no hidden page objects, the deleted page's
  text absent, details, language and viewer settings kept, source bytes unchanged.
- A real LibreOffice 24.2 PDF (6 pages, contents links, 10 bookmarks): deleting
  chapter 2 used to leave 11 page objects for 5 pages (the deleted chapter still in
  the file, linked from the contents), no title and no bookmarks. Now 5 page
  objects, the title, 8 bookmarks and 8 working links.
- Deleting one page of a 400-page PDF whose first page links to every page: 1.6 MB
  and about 300 ms before, 1.0 MB (the size of the original) and about 270 ms now.
- Known limits: page labels, file attachments, tags and layer settings are not
  carried over to copied pages; content on a hidden layer shows in the copy
  (checked by rendering with PDF.js; the same before this change).

## Modules, blank pages, Properties and Draw — 2026-11-02

- `app.js` (5,261 lines) is split into eight modules, moved verbatim by a script:
  every import resolves to an export, and no module uses a name the original file
  did not have in scope (both checked by scripts); the release script versions
  every module's imports by rule. The Test workflow passed in Chromium, WebKit and
  Firefox on the split alone.
- Organize pages: "Add a blank page after it" adds a page the size and shape the
  current page shows at (a turned page gives a landscape blank page); one undo step.
- Properties: the first PDF's title, author, subject, keywords and language, and
  the app that made it and when; changes and Remove all reach the download (engine
  and browser tests); the XMP copy is removed so PDF.js shows the new title; a
  PDF/A file then stops declaring PDF/A, with its own reason in the message.
- Draw: pen, line, arrow, rectangle and ellipse; strokes over other drawings; tap
  to select; move, resize, colour, width, delete, undo; the add button. The download
  matches the preview (pixel comparison, under 0.2% of pixels) and is vector (engine
  test: paths with round ends and corners, no text or pictures). On the iPhone
  emulation one finger draws and the page does not scroll.
- Known limits: drawings are opaque lines (no fill or transparency); a pen stroke
  is straight segments between points two screen pixels apart; layer settings and
  the other copy limits above still apply.

## Page strip, settings defaults and margins — 2026-11-04

- The page strip no longer has Move earlier/Move later arrows under each thumbnail
  (phones already hid them). Pages move by dragging in the strip, or with Move
  earlier and Move later under Current page in Organize pages.
- Watermark and Page numbers are on when they first open for a document: the
  default watermark and page numbers show at once, as one undo step. Undone or
  switched off, they stay off when the tool opens again. Opening a PDF on Add page
  numbers or Add watermark shows them at once. Headers & footers reads On before
  anything is typed, without counting as an edit (it draws nothing until then).
- The {page}/{total} note gives an example: “Page {page} of {total}” shows as
  “Page 2 of 5”.
- Edge margins for headers, footers and page numbers go from 0 to 100 pt (they
  started at 12 in the panel and batch presets, and 4 in the layout). A number
  typed out of range used to go back silently to the value in use; it is now set
  to the nearest value allowed, with a message.
- Browser tests (`settings.spec.mjs`) for each; the tests that switched these
  settings on now check they start on.

## Duplicated pages, layers, download notes — 2026-11-04

- Duplicated pages: copies of a page shared one list of content streams (pdf-lib
  copies a page's objects once), so text added to one copy, and every page number,
  showed on all copies. It happened whenever a page's content is a list of
  streams, as in every PDF that pdf-lib writes (including pdf.qft.org downloads);
  the sample, one stream per page, did not show it. Now each copy has its own list
  and its own annotations (/P, /Popup, /Parent and /IRT pointing at its own copies).
  Engine test: different text and page numbers on two copies, read back with
  PDF.js; it fails without the fix.
- `/UserUnit`: PDF.js draws such a page that many times larger, so the preview
  showed only part of it, enlarged. The preview now draws it at the editor's scale.
  Browser test with a UserUnit 2 page (canvas pixels); fails without the fix.
- Layers: copied pages (delete, extract, combine, duplicate, split) bring their
  PDF's layer settings, copied with the same object copier as the pages; combined
  PDFs' settings are merged, keeping each one's hidden layers hidden (also when a
  PDF starts every layer off). Engine tests render with PDF.js: the hidden layer's
  square is not drawn in any of these copies.
- Download notes: when pages are copied into a new PDF, the download (and Extract
  and Split) message says if it leaves out page labels (other than plain numbers
  from 1), attached files or accessibility tags; downloading a digitally signed
  PDF says the signature isn't valid in the copy. Long messages stay up longer
  (60 ms per character, at least 5 seconds). Engine and browser tests.
- `npm run check` verifies `scripts/asset-checksums.json` (208 files: sizes and
  SHA-256), and that every file under `dist/assets/vendor` and `dist/assets/fonts`
  is recorded; checked against a stamped release copy too. CI keeps the Playwright
  report, screenshots and traces for 14 days when browser tests fail.
- Known limits: page labels, attachments and tags are still not carried into
  copies (the message says so); a combined PDF's alternate layer configurations
  are the first PDF's only.

## Page order, file bookmarks, two-sided printing — 2026-11-05

- Organize pages, Page order: Reverse puts every page in reverse order; Interleave
  puts a double-sided scan in reading order (fronts first, then backs; "Backs
  scanned from the last sheet", on by default, for a turned-over stack). Each is
  one undo step. Unit test of the order (`interleaveOrder`: even and odd counts,
  every page once); browser test downloads after each and after undo.
- Merge: "Add a bookmark for each file" (on by default, undoable): combining two
  or more PDF files gives each a closed bookmark named after the file (without
  .pdf), leading to its first page, with its own bookmarks under it. Blank pages
  and pictures get none; one file gets none. Engine test with PDF.js (titles,
  pages, counts, off); browser test in Merge.
- Headers & footers and Page numbers: "Swap left and right on even pages" (by
  position in the document) for printing on both sides; also in Batch presets and
  the Batch form, and carried from the editor to Batch. Engine test (text sides on
  three pages, the even page's number at the left margin); browser test of the
  preview and the Batch form. Batch's margin fields now start at 0 too (they
  still said 12).

## Add margins and Pages per sheet — 2026-11-06

- Add margins: top, bottom, left and right in millimetres on every page, the current
  page or selected pages; "A wide right margin for notes" (60 mm); one undo step;
  Remove added margins. The page grows and its content stays put (engine: text at
  the same place on the paper, an item placed before stays on its content, page
  numbers at the new edge, turned pages turn their margins). The margins are blank
  even where the PDF has content: outside its CropBox (engine, PDF.js pixels; fails
  without the clip) and outside an earlier crop. The preview paints them white
  (browser test with a hidden red square; fails without the fill) and matches the
  download (pixel comparison). Download sizes in a browser test.
- Pages per sheet: 2 or 4 to a sheet, A4 or Letter (Letter by default where it is
  usual), margin and gap, border; a summary of sheets and layout in the panel.
  Engine tests with PDF.js: sheet count, size and orientation, reading order, a
  turned and cropped page shown as on screen, hidden layers stay hidden, no pages
  hidden in the file, the details kept, border, password, forms refused until
  flattened (the editor flattens them for the sheets). Browser test: the panel's
  summary, both counts and papers, the file name, the document unchanged.
- Both tools have their own pages (`/add-margins-to-pdf/`, `/pdf-pages-per-sheet/`),
  cards, menu entries and tabs; axe finds no violations in either panel.
- Known limits: links and comments are not on the sheets; margins can make a page
  at most 14,400 points (5 m) on a side.
- Review (four reviewers, one skeptic per finding), fixed before merging: with
  "Flatten fields on download" on, pdf-lib keeps drawing into the stream it made
  for the flattened fields, which the margin clip wrapped, so page numbers and edits
  in the margins vanished from the download (engine test with a text field, both
  ways; fails without the fix); the "crop hid" engine check could not fail (a blue
  square inside the CropBox but outside the content area now must stay hidden);
  margins on picture pages kept their fraction, not their millimetres, when the
  picture layout changed (`rescaledMargins`, unit test); the tablet and phone
  layout tests now include both panels; the preview check waits for the drawing
  and checks the text is drawn before asserting the square is not.

## From the quality evaluation: cache, menu, registry, tests, CI — 2026-11-07

- Fonts outlive deploys: GitHub Pages serves every file with a ten-minute cache
  and a deploy-time ETag, so after each deploy returning visitors downloaded the
  engines and fonts again (13.6 MB compressed for the CJK font). The fonts now
  carry a hash of their bytes in their URL and are kept in Cache Storage
  (`fetchFont`); the release test checks the URLs, and a browser test on the
  stamped site shows the second visit draws accented text with the font's network
  route blocked. The engine bundles (0.9 MB) still re-download: a cache of our own
  for scripts would need `blob:` scripts, which the CSP forbids.
- Looking at the tool menu no longer edits the document: arrowing through
  Watermark and Page numbers used to turn both on silently (two undo steps,
  DRAFT in the download). While an arrow key moved through the menu and it keeps
  focus, their defaults wait until focus leaves it; a notice says what was shown
  and that Undo takes it away. Browser test in three engines.
- One tool registry (`TOOLS` in routes.js) writes the cards, the tool menu and
  the tab bar into index.html (`npm run pages`, checked by `npm test`) and names
  the panels, so a tool's name is the same everywhere ("Organize pages", "Delete
  pages", "Document properties", "Fill form"); keywords on every card and
  every-word matching in the search ("combine", "remove pages", "handout").
- Add image and Highlight downloads are tested: engine assertions on the image
  XObject, the highlight's colour, fill and /Multiply blend at 30% (each fails
  with the drawing removed); the editor's download-matches-preview test adds
  both and compares pixels.
- Forced colours (Windows High Contrast): switches and segmented controls draw
  their state with system colours; checked in Chromium with emulated forced
  colours.
- CI: every job has a timeout; the deploy runs the Test workflow (engines in
  parallel) instead of repeating its steps.
- Prettier is a dev dependency with `.prettierrc`; `npm run check` fails on
  unformatted files; the whole tree was formatted once (`.git-blame-ignore-revs`).
- From the adversarial review of this PR: the panel's switch follows a deferred
  show (it said off while the watermark was on, and clicking it hid the
  watermark); leaving the editor with Back while arrowed onto a tool changes
  nothing; on the Watermark and Page numbers pages the opened message carries
  the notice; the help dialog uses the registry's names. A font is kept in Cache
  Storage only when its bytes hash to the version in its URL, so a captive
  portal's page (a 200 with HTML) is neither drawn with nor kept (release test);
  the release stamp says to run prepare-assets when the CJK font is missing, and
  the release test server runs it first. The comparison test's highlight changes
  a pixel by about 100: the default changes one by at most 60, the comparison's
  tolerance, so a missing highlight passed it, while a darker one made Firefox
  fail on the highlight's own anti-aliased edges (half-covered pixels differing
  from both neighbours by more than 60). The Test workflow's concurrency
  group is keyed by the calling workflow and cancels only pull-request runs, so a
  run of Test on main cannot cancel the tests a deploy waits for.

## The “next” list: lazy editor, panels, forms on phones, CSP, focus, artifacts, tests, dependencies, polish — 2026-11-10

- Edit history (`history.js`) and view recording (`views.js`) left `app.js`, so
  no module imports an entry module back; `app.js` is a landing shell that
  loads `editor.js` when a file is opened, or as soon as a visitor hovers,
  focuses or touches the upload area, a tool card or the sample (a reader never
  downloads it; the help and privacy dialogs and the landing's own buttons need
  no editor), and every page preloads the three modules the shell imports at
  once. A browser test checks the landing fetches nothing but those. The site-integrity
  test checks the module graph and the preload list; the release test checks
  that the dynamic import and the preloads carry the release id, and runs the
  site-integrity suite on a stamped copy, as the Pages workflow does before it
  deploys (its module-graph checks read stamped addresses too: found by
  rehearsing the deploy steps, where they failed). Opening the
  file picker stays synchronous with the click (browsers require it) while the
  editor loads; files dropped or picked before it arrives are opened once it has.
- Review of the lazy editor, each point reproduced before fixing. (1) A page
  loaded before a deploy was given the new release's editor, whose modules
  have other addresses and so were second copies with their own state: Add
  another PDF replaced the document. The shell now checks that the editor
  works on its own state (`sameRelease`) and otherwise does not use it; when
  the visitor then opens something, the page reloads into the new release,
  once, with a notice to try again (`refresh`); a reload that does not help
  says so. (2) When the editor could not be fetched, the notice was
  the browser's own text, it also appeared on a mere hover, the picker kept
  its file (so choosing it again did nothing), and trying again cannot work in
  Chromium, which never fetches a module twice in a page (probed in three
  engines). The notice now says to check the connection and reload, warm-ups
  fail silently, and the picker is emptied. (3) On the batch page, Choose PDFs
  pressed before the editor had arrived opened the workspace but could not
  open the picker later; the shell now opens a picker of its own at once and
  hands the files over. (4) Module headers and the README described the
  layout from before the split. Landing tests, in three engines: with the
  new release's editor arriving while the file picker is open, the page stays
  until the file is chosen, then reloads once with the notice, and afterwards
  opens the file and adds another to it; a warm-up leaves the page and its
  search text alone, the next click on Choose PDF reloads before a picker
  opens, and a second mismatch asks for a reload by hand; a refused editor
  gives the notice and an empty picker; the batch picker opens while the
  editor is held back. Each fails with its fix taken out.
- A second review pass, over the fixes themselves (three reviewers, then
  verifiers). The first version of the reload above was silent on the usual
  path: Choose PDF warms the editor up, so the page reloaded under the open
  file picker without a notice, and a mere hover wiped the search text. It now
  waits for an action, as described. Also from that pass: `expectToast`
  threw when it met a page that was loading, instead of asking again; the
  focus ring of an unavailable Move earlier or Move later was faded with the
  button (it is dimmed in its text and border now, not as a whole); a zoom
  set by hand was remembered until a field got focus in the phone layout, so
  a field focused with the phone on its side stayed small when the phone was
  turned upright; a text field on a turned page was never zoomed to, because
  its height on the screen is its length (it is measured across its line
  now); the size checks in the phone tests allowed no rounding (pages are
  laid out on whole px); one window size of the short-window notice test and
  two phone tests passed without their fixes, and were replaced or tightened;
  a tagged form flattened with nothing typed in it was told that what was
  added is untagged, and is now told so only when answers were typed.
- `tool-panel.js` (2,000 lines) is now the panel's frame (318 lines: the field
  builders, `renderTool`, `fillForm`, the input prologue and the `PANELS`
  registry) plus twelve `panel-*.js` modules, one per tool or family, behind
  one interface (`fields`, `values`, `onInput`, `onSubmit`, `afterRender`,
  `afterFill`, `title`); Fill form's panel is `form-ui.js`. The code moved
  verbatim; the protection queries moved to `editor-core.js` and signature
  placement to `page-items.js`. A scripted check confirmed every named import
  is exported and every call resolves; the site-integrity test checks the
  registry covers exactly the tools with a tab and that each module exports
  `fields()`. Browser suites in Chromium, WebKit and Firefox.
- Dependencies: Dependabot proposes npm and GitHub Actions updates weekly (the
  PDF libraries grouped apart, since their bundles are updated by hand); the
  site-integrity test fails when `package.json` and `versions.json` disagree;
  a monthly workflow compares the bundles with npm and opens or updates one
  issue (`scripts/check-vendored-versions.mjs`, also runnable locally).
- Forms on phones: at Fit, the fixture's fields were 9 px tall (6 px on the
  iPhone 13 project) and the 300% zoom cap could not reach 44 px. A field that
  gets focus now folds the sheet, lays the pages out again and zooms the page
  so the field is 44 px tall (boxes 24 px, with a 44 px `::before` tap area on
  coarse pointers), anchored on the field, then brings it into the top third of
  the view; the zoom buttons step down from there, Fit shows the whole page,
  leaving Fill form restores the zoom, and a refit (the keyboard, a turn)
  re-asserts the size. Phone test (Chromium and WebKit): a tapped field reaches
  44 px inside the stage with the sheet folded, Tab keeps the next field in
  view, a check box toggles from a tap, and Fit returns. Desktop: the zoom stays
  at Fit (forms test guard).
- Review of the above, reproduced in Chromium and WebKit before fixing: every
  box had a 44 px tap area whatever its neighbours, so at Fit a tap on the
  "member" box chose a "plan" radio and, in WebKit, a tap on the e-mail field
  did too; the sheet folded as soon as a box got focus, so on a last page the
  first tap zoomed to the box without ticking it; the zoom also ran for a
  mouse in a narrow window. Now a box's tap area grows by half the gap to its
  nearest neighbour at most (`tapAreas`), the sheet folds with the zoom after
  the tap for boxes and lists, the zoom needs a coarse pointer, and a zoom set
  by hand is not put back. Phone tests: at Fit every field is on top of its
  own surface; the first tap ticks a box 4 to 7 px wide and zooms it to 24 px;
  a tap beside the zoomed box toggles it; leaving Fill form restores the zoom;
  a last-page box is ticked by its first tap; a notice is put away when a
  field is tapped. Desktop test: a 683 px window with a mouse is not zoomed.
  Each new test fails with its fix taken out.
- The content security policy no longer allows inline styles, `data:` or
  `blob:` fonts or `blob:` workers, and forbids frames and media (the app uses
  none of them; the licenses page runs no scripts, and its styles moved from
  an inline block to `licenses/licenses.css`, so the policy `_headers` sends
  for every path holds there too: a review finding, since a host that reads
  `_headers` would have refused the block). Every browser test now fails on a
  policy violation in the document, reported from a `securitypolicyviolation`
  listener through the console; the preview comparison hides the edit layer
  through each element's own style object while the picture is taken, not
  with a style element. `tests/fixtures/hostile-metadata.pdf`
  (made by `scripts/make-hostile-fixture.mjs`) carries HTML and script in its
  title, author, creator, producer, field names, labels, options and bookmark,
  an OpenAction and a `javascript:` link; the hostile test opens it under a
  hostile file name on the Fill form page, adds a hostilely named image, and
  visits Fill form, Document properties, Merge PDFs, Organize pages, Add an
  image, the download name and the batch list: no flag set, nothing injected.
- Focus and announcements: a panel control that disables itself (Delete, once
  the selected pages are gone) hands focus to the nearest enabled control in
  its group, the one before it first, instead of the panel heading, and the
  heading shows a ring when it does get focus; Move earlier and Move later are
  unavailable (`aria-disabled`) at the first and the last page, not disabled,
  so focus stays on the button that reached the end and one Enter too many
  says "This page is already the first" instead of moving the page back (a
  review finding: focus used to go to the opposite button); the page-range hint is a live region, so an out-of-range number is
  announced; the landing scroll respects reduced motion; on touch screens the
  notice's close button has a 44 px tap area around its 28 px drawing; Pages
  per sheet says when a handout leaves a tagged PDF's tags, labels or
  attachments behind (`copyNotes`), like Extract and Delete do. Tests:
  accessibility (focus), settings (the announced range), phone (the tap area),
  margins-sheets (a tagged handout's note), copy (copyNotes).
- Tagged PDFs: when the download keeps a PDF's structure tree, the page
  numbers, headers, footers and watermark it adds are each wrapped in
  `/Artifact <</Type /Pagination /Subtype /PageNum|Header|Footer|Watermark>>
  BDC … EMC`, so screen readers skip them, and the download note says that
  what the user added isn't tagged. Engine test: the four artifacts, one text
  run each, the added text outside them, the note; an untagged PDF gets neither.
- Tests: the seven Node suites are `node:test` tests now (81 named tests where
  there were seven scripts chained with `&&`; 85 with those added since for
  `{date}` and `{filename}`, for the stamped copy and for the one policy); `npm test` runs them in one
  `node --test`, each file in its own process, so a failure is reported by name
  and hides nothing (checked: with pictures not drawn, one test fails and 80
  pass). The conversion was done by a script that wraps each section in a
  test, hoists what later sections use and keeps the number of assertions
  (5 suites), and by hand (release-stamp, whose temporary copy is removed when
  the process ends). Browser tests: `expectToast` waits for a notice instead of
  reading whichever is showing; the two batch clicks that swallowed their
  errors now wait for the batch workspace; the browser's language and time
  zone are fixed (en-US, UTC), with a German case for the A4 default.
- Everyday details: undo steps have names (the tool's, or the action's: Rotate
  pages, Move page, Delete text…), shown by Undo and Redo and in the notice
  after undoing; Delete pages starts with nothing selected unless pages were
  selected on purpose; a download's name says what was done (numbered,
  watermarked, cropped, signed, filled, organized, merged, converted, edited),
  after its first file's name; notices sit in the toolbar's free gap, at its
  real width, or at the foot of the pages where the gap is too narrow (tested
  at 800, 1024, 1280 and 1600 px: no overlap with page navigation, zoom or the
  status line); the privacy sentence shows with the first document only.
  Notices keep their five seconds: shortening them would cost reading time.
- The adversarial review of this section (five reviewers by area, then four
  verifiers who reproduced each finding independently): 28 findings, 27
  confirmed and one that could not be run here (Windows), none refuted, all
  fixed. Beyond those listed under their items above: a tagged PDF is one with
  a structure tree (`/MarkInfo` alone got artifacts and a note about screen
  readers); answers flattened into a tagged PDF are noted as untagged; a
  decomposed file name (as macOS hands it over) in `{filename}` stopped the
  export for Hangul, and is now drawn composed; a handout keeps the notes of
  the export it was made from; Download selected pages is named after the
  first file among those pages; the download's name is made safe by the
  editor (`safeBaseName`), which the hostile test now reads from the link the
  editor clicks instead of from what the browser made of it; `_headers` and
  the pages declare one policy, which the site-integrity suite compares, and
  a browser test opens the licenses page and the editor with it sent as a
  header too; `expectToast` now requires that the notice was shown (the page
  keeps a list of the notices it shows), where it had come to read the text
  of a hidden one; two Node tests that checked nothing when selected by name
  now say they need their file; the hostile names are given to the page as
  bytes, never as files on disk, and the library check runs npm through a
  shell, for Windows.
  Review findings fixed: in a window shorter than the editor (1024 x 500, a
  phone on its side) the notice at the foot of the pages was below the window's
  edge, and now stays inside it; Delete pages still started with page 1
  selected on its own page, after Reset and after Undo, and now starts empty
  there too (tests for each).
- `{date}` and `{filename}` in watermarks, headers, footers and page numbers:
  today's date as 2026-11-10 and the name of the file each page came from,
  without its extension. Engine test: two merged files and a blank page (each
  page its own file's name, the blank page none), a name with `$&` and braces
  in it put in as it is. Workflow test: a batch uses each file's name. Browser
  tests: the preview and the download agree; with the clock at half past noon
  UTC, a browser in Auckland shows the next day's date.
- Remembered settings: Watermark, Headers & footers and Page numbers keep
  their text and options in this browser only while "Remember these settings
  on this device" is ticked. Browser tests: nothing is stored until it is
  ticked; what is stored has neither the switch nor the pages; it follows an
  edit and its Undo; the next PDF starts from it, on every page, with a notice
  that says the saved ones are shown; unticking removes the key; saved headers
  and footers go on when the tool opens, one Undo takes them off and the switch
  then reads off; stored values of the wrong kind, and text that is no JSON,
  are left out; a browser that refuses to store says so and unticks the box.

## The second evaluation’s “now” list: two engine faults, sliders, resizing without a drag, the page selection, tests, PDF.js and Playwright — 2026-11-12

- Page numbers, headers, footers or a watermark on a PDF whose pages share
  their resources made the download many times larger, with no notice. pdf-lib
  names each font and graphics state it draws with in the page's resources and
  takes the dictionaries there for the page's own, so every page ended up with
  the names added for all the others. ReportLab writes such files (one font
  dictionary for every page); so does any PDF with one resources object, or
  with resources on the page tree; copies of one page share theirs too.
  `separatePages` gives a page its own copy of each dictionary an earlier page
  holds. ReportLab reports of 100, 300 and 600 pages with page numbers: 408 KB,
  3.0 MB and 11.8 MB before, 111 KB, 331 KB and 664 KB now (476 KB to start
  with at 600 pages).
- Reverse, Interleave or dragging a page, in a PDF whose pages inherit their
  size, turn, crop or fonts from a node inside the page tree, gave pages that
  were unturned, uncropped and without their fonts, or failed with a library
  message: the pages are put back under the root of the tree. The four
  inheritable attributes are written onto each page first.
  `tests/odd-inputs.test.mjs` writes both kinds of file object by object,
  without a PDF library, and checks the exports with pdf-lib and PDF.js; its
  three tests fail on the engine as it was.
- Sliders had no name: the value shown beside the label was an output element
  inside the label, which HTML lets a label name, so the label named the
  read-out. axe passes a slider inside a label. The value is now a plain element
  kept out of the name, and the slider says its value with the unit. A browser
  test finds every slider by role and name in Watermark, Highlight, Draw, Add
  image and Sign PDF.
- Items can be resized without dragging: Alt and an arrow key moves the right
  or lower edge (Shift for ten points), and a highlight or a drawing has Width
  and Height in its panel, as shares of the page. The edges are those on the
  screen, so a shape placed before its page was turned grows the way the arrow
  points. The size is announced; the panel follows a drag and Undo. Moving with
  the arrow keys starts from the stored size, where a move in the same
  animation frame as a resize put the old size back.
- Organize pages: the first page ticked takes the place of the page a document
  opens with selected (it used to join it, so ticking pages 4 and 5 and pressing
  Remove took page 1 as well), and Rotate, Remove and Download name what they
  act on: “Remove page 1”, “Remove 2 pages”.
- Tests. Every browser test fails on a request to another origin, workers
  included, and `expectToast` requires that a notice was also put into the
  live region for screen readers, the interrupting one for an error. The
  watermark's opacity and colour are read from the exported page, and the
  comparison of download and preview uses a watermark dark enough to be seen.
  The hostile-PDF test covers what is drawn on the page as markup, the panel's
  list of items and the parts of a split. New journeys: files dropped on the
  page and on the batch page, handles on a highlight, text and a picture, a
  page dragged in the strip, a saved batch preset after a reload, the arrow
  keys down and up, Remove with every page selected. 26 breakages, each applied
  alone to a copy, were each caught.
  Two faults came out of writing them: the handle in the middle of a one-line
  highlight's right edge lay under the corner handle below it (handles take the
  pointer from further away than they show), so pulling it sideways halved the
  highlight's height, and the nearest handle is now the one taken; and the
  panel's list of items kept “Text: empty” after text was typed on the page.
- Dependencies. `download()` returns the name the app chose and allows the
  browser either spelling: Playwright 1.65 ships WebKit with libsoup 3.6.6,
  which writes spaces in a download's name as underscores (Linux only; Safari
  does not use libsoup). With that, @playwright/test 1.65.0 and @napi-rs/canvas
  1.1.0. PDF.js 6.5.438, updated by the new `scripts/vendor-pdfjs.mjs`, which
  copies the files from the npm package and brings the checksums, the provenance
  record, the version and the licence along; the site-integrity suite now
  compares the bundle with the installed package on every run. README has the
  section “Updating the libraries” that four files pointed to, in five places.
  Dependabot's Actions updates come in one pull request. (The five Actions
  updates themselves were merged on their own before this; the deploy with all
  five succeeded.)
- Review of the pull request. Five reviewers took one area each and broke the
  code to see which test noticed: 18 findings, none serious, all answered.
  - In the app. Flatten form fields on pages that share their resources named
    every field's appearance on every page (the growth this list set out to
    stop, by another door): the pages get their own resources before the form
    is flattened. A Width or Height typed below 3 points was shown as typed and
    not given: the least is now what the fields take, a tenth of a percent. A
    picture's announced width went by the screen where its Width slider goes
    by the picture, which differ on a turned page: each kind of item is now
    announced in the measure its panel shows, and once the keys rest, not at
    every repeat of a held key. The page that takes the place of the opening
    one is announced, as nothing else told a screen reader that another box
    was cleared. The FAQ said “Download 3 pages” for the range 1-3, 5.
  - One finding was answered by writing the rule down, not by changing it: a
    button that acts on the opening page (“Rotate page 1”) does not make that
    page a choice, and the next page ticked still takes its place. Counting it
    as chosen was tried: Delete pages then opened with page 1 selected for
    deletion (an existing test said so), and Rotate would have turned page 1 a
    second time. A test now holds the rule from both sides.
  - In the tests. The engine fixture shares graphics states and pictures as
    well as fonts, and each page gets a picture: leaving any of the three
    dictionaries shared now fails. The resize test sends keys as a held key
    does, compares what is said with what the panel shows, counts the
    announcements, and covers the page edge, the least size, Height's
    move-over and a turned page. The fixture counts WebSockets with the
    requests to another origin (Playwright reports the page's and its workers'
    in all three browsers; a worker's EventSource it does not report in
    Firefox, so the site-integrity suite keeps EventSource, WebTransport and
    WebRTC out of every shipped script), and pairs a notice with an
    announcement made after it was shown, not an older one of the same text. A
    picture's upper left handle, and PDFs dropped while the batch is open from
    the editor, are covered; boxes are read once the page has settled.
  - In the update script. `npm test` checks the PDF.js records as well as the
    files (the version on the licences page, the provenance record), without
    the network; `npm pack` runs in the temporary folder, where a path with a
    space no longer splits the command; a missing or out-of-step installation
    is named (“run npm ci”).
  - 28 breakages, 25 of them new, each applied alone to a copy, were each
    caught.
- A second pass over that commit, by three reviewers: 8 findings, one of them
  a test that could not fail, the rest small. All fixed.
  - The size that waits to be said gave way to nothing: after Undo, Escape or
    a click on another item it was said all the same, over “Undone: Resize
    drawing.” or for an item no longer selected. It now gives way to whatever
    else is announced, and is said only while its item is still the selected
    one.
  - The held-key test sent its keys in one task, where one delay cannot be
    told from another. It now sends a keydown every 33 ms, as a held key does,
    and fails at a delay of 0, 20 or 5000 ms. Text on a turned page is tested,
    and so are the cases where a waiting size must give way.
  - The update script requires the tarball's SHA-256 to be there and well
    formed (a check takes its value as written, which the README now says),
    shows npm's own error when the tarball cannot be fetched, and runs when it
    is reached through a linked folder, where it did nothing and exited 0. The
    check on shipped scripts sees a prefixed name too
    (`webkitRTCPeerConnection`).
  - A fault the full run turned up, older than this list. In WebKit “any page
    can be edited where it is” failed once: the view had been scrolled to page
    2 and the page number stayed at 1. The view is followed a frame after it
    scrolls, and that is when its position is remembered; the pages are laid
    out again from that position, also from a timer, 120 ms after the stage
    changes size. A layout that fell between a scroll and its frame started
    from the position before the scroll and put the view back. Asked for right
    after a scroll, the layout did so every time, in every browser; left to
    chance, once in 80 runs in WebKit. A layout now starts from where the view
    is, and the current page follows the view. 240 runs in WebKit since,
    without a failure, and a test that asks for the layout right after the
    scroll.
  - 13 breakages, 11 of them new, each caught.
- A third pass, by two reviewers, over the commit with the scroll fix.
  - Nothing found in the scroll fix, after twelve checks in three browsers: the
    reading position through resizing, zoom, the phone layout and its form
    fields, leaving the editor and coming back, and scale factors that give
    scroll offsets with fractions.
  - A resize of an item that has focus without being the selected one was not
    announced. Undo of a step about something else leaves an item so. A key
    that moves or resizes an item now selects it.
  - Two stated behaviours had no test that pinned them: an error announced at
    once silences a size that waits, and a text's width is said to a tenth of
    a percent. Both have one now.
  - One note of the reviewer's is taken up: after a scroll that was not
    followed yet, the current page follows the view by the rule that holds a
    frame later, only once the view has moved more than a hair from where the
    page was made current. A page made current by a click stays current
    through a layout.
  - 4 further breakages, each caught.
- Runs, after the three reviews: Node suites 92 of 92. Browser suites on
  Playwright 1.65 with PDF.js 6.5.438: Chromium 124, WebKit 116 with 3 skipped
  by design, Firefox 106 with 1 skipped by design.

## Resize pages — 2026-11-13

- Resize pages (`/resize-pdf/`): every page, the current page or selected pages
  on A4 or Letter paper, as one undo step; Restore original size. Each page is
  scaled in proportion to fit, in the middle of a sheet that lies the way the
  page does; a page that is that size already is left as it is. Engine tests
  with PDF.js on seven odd pages (small, A4 on its side, square and turned with
  its boxes away from the origin, a long receipt, two in units of two points):
  the sheets' sizes, each word's place and size, boxes at the origin, `/Rotate`
  kept, `/UserUnit` gone. Page numbers, headers, the watermark and items placed
  on the sheet have their own size; an item placed before is scaled with its
  page (engine test; the preview draws every line where the export does, on
  sheets of both papers).
- What points at a page moves with it: highlights, ink, lines, borders and
  dashes, the text size of free text, pop-ups; links to a place on the page, by
  position or by name; bookmarks; named destinations; where the document opens
  (engine test, read back with pdf-lib and PDF.js, with the page kept in place
  and copied). Form fields move with their pages, stay fillable and show what
  was typed; a field's text size is scaled for each widget, since one field can
  be on sheets of two scales; flattened answers go on the sheet (form test;
  browser test: the box to type in lies on its field).
- A resized page stays on its sheet. Crop: the outline is drawn on the sheet
  and crops the page; one that leaves out only blank sheet, or lies on it, is
  refused with a sentence. Add margins: the page is made smaller until the
  margins measure on the sheet what was typed (30 mm in a browser test, measured
  in the preview). Preview and download agree after each (pixel comparison).
- The blank of a sheet stays blank: what the page's own boxes hid, and what a
  crop hid, does not show beside the page (engine: PDF.js pixels; browser:
  canvas pixels). Found while building: both the preview and the download showed
  what a crop had hidden, in the blank beside a resized page. `contentBox` now
  ends at the crop.
- Also fixed, in Add margins: comments, links and fields that lay wholly outside
  what a page showed came into view in its new margins (a link that a crop had
  taken away became a place to click in the blank). They are hidden now (the
  annotation flag Hidden), in margins as on a sheet. One that lies across the
  edge is cut there (see the review below).
- One rule for the usual paper (Letter in the United States, Canada, Mexico and
  the Philippines, by the region in the browser's language): Pages per sheet and
  JPG to PDF had two, which disagreed for French in Canada. The paper is called
  Letter in every tool.
- The tool has its page, card, menu entry and tab; axe finds no violations in
  its panel; the tablet and phone layout tests include it.
- Known limits: a comment without an appearance of its own cannot be cut at the
  edge of what a page shows; rich-text comments keep their own text size; an
  item placed before a page was resized stays within the page as it was; margins
  on a resized picture page do not keep their size when the picture is laid out
  again; batch presets have no paper size.
- 42 breakages, each applied alone to a copy, each caught. Four were not at
  first, and have tests now: a page in larger units whose numbers are A4's,
  hidden content beside a page that is not cropped, a named destination no link
  uses, and the page strip's picture after resizing.
- A review of the preview and the editor, by a reviewer who compared the preview
  with the download in 432 cases (turns, crops, margins, units, both papers)
  and found them the same to the pixel, found eleven other things. Fixed:
  - A comment or field across the edge of what a page shows was cut in the
    preview and whole in the download, in the blank of the sheet or in an added
    margin. The download cuts it now: each appearance is put inside one that
    clips (engine test with two appearances, one turned by its matrix and kept
    by state; green pixels counted and placed).
  - A signature placed before its page was resized, then copied to every page,
    came out stretched (190 points wide for 68, at the same height): the copy
    took what the signature keeps, which is of the page as it was. It takes the
    signature as it lies on the page now. The same held after a crop or a turn.
  - The handles and the outline of an item placed before a resize were scaled
    with the page (a 44 px tap area became 31 px on an A3 page put on A4). They
    keep their size.
  - Fill form offered a box to type in for a field the crop had taken out of
    sight, hanging beside the page; it is not offered now, on a sheet or off.
  - A blank page inserted after a resized page had the sheet's size and not the
    sheet, so margins made it larger while its neighbours stayed. It has it now.
  - Add margins on a sheet refused wide margins on an A3 page with a sentence
    about 5 metres, for a result that is A4. And margins more than 20 times the
    size of a small page, with or without a sheet, were stored before they were
    checked, so the page could not be drawn until Undo. Every new crop is
    checked before any page changes.
  - The summary called a page with Letter's numbers in units of two points "on
    Letter paper already", and said "1 of 3 pages go". A crop refused for one
    page of many did not say which: it names the page and shows it.
  - New tests: a turned page in units of two points, cropped at the top, on
    Letter (two breakages of the preview's arithmetic had passed every test);
    the copied signature and the handles; the field out of sight; the blank
    page; the refusals.
  Not changed, and listed under the limits: an item placed before a resize
  cannot be dragged onto the blank of its sheet; margins on a resized picture
  page.
- A review of the download, by a reviewer who placed a mark on 1,296 pages
  (three sets of boxes, four turns of the file, three in the editor, crops,
  margins, units of one and two points, both papers) and a comment on 384, and
  found each where the geometry says, within 2 pixels. It found five other
  things. Fixed:
  - Comments on a page that was duplicated, or listed twice by its file, moved
    twice when the page went on a sheet (a square 70 points from where its page
    had it), and a duplicate left without a sheet had its comments moved to its
    twin's. A copy of a page shares its comments' rectangles, corner lists and
    border styles with the page, and they were changed where they were. What is
    moved is now written anew for each comment. The same held for a border
    style or a border that two comments of one file share: it was scaled once
    for each. A field that two pages list moves once.
  - On a PDF/A file, a comment out of sight was given the Hidden flag, which
    PDF/A forbids, and the file went on declaring PDF/A. It stops declaring it,
    and the download says why (“comments, links or fields outside the visible
    page were hidden, which PDF/A doesn’t allow”). Add margins did the same
    since the first review above. A PDF/A file resized with nothing out of
    sight is PDF/A still.
  - A link across the edge of what a page shows stayed a place to click in the
    blank of the sheet or the margin: a link has nothing drawn to cut. Its
    rectangle ends at the edge now, and its corner list goes with it.
  - 21 of the reviewer's 39 breakages passed every test: places a link can
    name (a height, a height or an edge of what the page holds), where the
    document opens written as an action, a named place kept in a dictionary or
    in a name tree, a bookmark inside another, a polygon's corners, a callout
    line, the steps of a path, a line's leader lengths, the dashes of a border,
    a field's text size kept two fields up or by the form, the trim, bleed and
    art boxes, the half millimetre within which a page counts as the paper, the
    looks of a comment under the pointer and pressed, a note that keeps its
    size, a comment that only touches the edge, and a page listed twice on two
    papers. Each has a test now. 33 breakages, those and the fixes', each
    applied alone: 33 caught.
  Not changed, and listed under the limits: an action that runs after another,
  or when a page or a field is entered, an article thread and the scale of a
  measuring tool keep a page's old coordinates.
- A review of the words found the pages saying two things at once. Add margins
  said “nothing on it moves or shrinks” and, of a resized page, “the page is
  made smaller”; the hint now says which pages it means, and the page's own
  answer names the exception. The Resize page said “US Letter” once and
  “Letter” everywhere else, used “the size you chose” for a text size and then
  for a paper, and said the file's size does not change (it grows a little).
  It now says which papers there are and that pages added later keep their own
  size, which the panel says too. “These pages have their own size” was said
  of one page. The refusal for a page a file lists twice is in plainer words.
  Six breakages of these sentences, each applied alone, were each caught.

## Odd PDFs through every operation, a page listed twice, the title of an unlocked file — 2026-11-13

- `tests/odd-pdfs.mjs` writes 19 odd but valid PDFs object by object, without
  a PDF library, and `tests/odd-pdfs.test.mjs` takes each through every engine
  operation: unchanged, reorder, delete, duplicate, rotate, crop, margins, resize,
  numbers with a header and a watermark at 30 degrees, added text, pictures,
  highlights and drawings, flatten, fill, fill and flatten, properties, merge,
  two pages per sheet, split, protect and unlock. One suite per operation, a
  test per file: 344 tests in 20 suites, in about 7 seconds, and
  `--test-name-pattern` picks an operation or a file. (Subtests of a test would
  not do: a file's name does not reach a subtest whose test it does not name.)
  Each download is read back with PDF.js (pages, texts and not another page's,
  sizes, turns, units, links, notes, fields, outline, labels, title, a hidden
  layer drawn without its red square) and with pdf-lib (the names in each
  page's resources), and its size must grow with its pages. The writer is the
  one `tests/odd-inputs.test.mjs` uses now too.
- The files are fair: PDF.js, pypdf (strict), PyMuPDF and poppler read each of
  them alike, and agree on every download, checked once by hand with the
  scout's runner. Two candidates were left out because the readers disagree on
  them (a page tree whose /Count is wrong, bytes before the header), and two
  were changed so they agree (a crop that reached past the media on some sides
  only, and text at 45 degrees as a marker, which pdftotext drops).
- The suite catches both faults fixed in the last release: undoing the
  per-page resources fails stamps and annotate on six files (38 /Font names a
  page where 8 is the most), and undoing the inherited attributes fails
  reorder on the three-level page tree.
- A page listed twice in the page tree (Kids [p1 p2 p1]) got every edit twice
  in the download: turned 180 degrees for 90, cropped to 64 % for 80 %, and
  both its pages numbered “Page 1 of 3” and “Page 3 of 3”. The editor showed
  three pages. The engine edited in place when no page index came twice; it
  now asks that no page object comes twice, and copies such a file, as it
  copies a duplicated page, once something is done to its pages or drawn on
  them (see the review below).
- Unlock PDF, and every edit of a protected PDF, dropped the title, author and
  the rest, and the file identifier. pdf-lib 2.11.1 decrypts a cross-reference
  stream, which is never encrypted; a compressed one then cannot be read, and
  the trailer it carries is lost. Every file Protect PDF writes has one, and
  the five password fixtures do not, as pypdf wrote them with tables.
  `restoreTrailer` reads the trailer again
  without decrypting, for encrypted files only. A new engine test protects a
  titled PDF with Protect, unlocks it and reads the title with PDF.js; it also
  checks AES-128 and RC4 files with a cross-reference stream, a wrong
  password, a file without a title and a file that is not encrypted (read
  once).
- 19 breakages, each applied alone, were each caught. One of them, dropping
  the identifier, first got through: the check read it with pdf-lib, which
  found it in the old cross-reference stream that the unlocked copy still
  holds as a loose object. The check now takes PDF.js's fingerprint.
- A review of this section's commit (one reviewer, who ran the outside readers
  again and tried seven breakages of its own), fixed before merging:
  - With the fix above, a file that lists a page twice and has a form could not
    be downloaded at all, even unchanged, and the refusal spoke of combining
    pages; without a form, a new title alone cost it its page labels. Such a
    file is now copied only once something is done to its pages or drawn on
    them. Left alone it is kept as it is, and with a form the refusal says that
    one page is in the file twice (test: both kinds, left alone, turned,
    numbered).
  - What makes a file odd could be lost from the writer with every test still
    passing: the page in units of two points, the object streams, the odd
    syntax. Each such file now has signs its bytes must show, and the unit of
    every page is read back after every operation.
  - A size inherited from a node of the page tree, lost on reordering, got past
    this suite (the older one caught it): every page that inherited a size also
    had a crop inside it. The nested tree has a page now whose crop reaches
    past its inherited size.
  - A protected file with a cross-reference table is read once (checked), and
    the cause of the lost title is stated as narrowly as it is: a compressed
    cross-reference stream.
  - 15 breakages of these fixes, each applied alone, each caught.

## The tool search: one plain sentence where no tool does it — 2026-11-13

- A search for something the site does not do ended at “No tools match”, or
  at cards that do not do it: “word” showed Document properties, Protect PDF
  and Unlock PDF (“keywords”, “password”). Now compress, OCR, redact, editing
  the text already there and Word, Excel or PowerPoint each bring one sentence
  that says the site can’t, and names the nearest tool where one helps; so do
  taking pictures out, bookmarks and digital signatures. The redact sentence
  names none: nothing on the site removes what is under it. The sentences are
  `SEARCH_NOTES` in `routes.js`, which the landing page loads already, so the
  search still needs no other file.
- The sentence takes the place of “No tools match”, or stands above cards that
  match but do not do it (“edit text” shows Add text under it). Its tool names
  are links that work as cards do: the tool’s page, or with a document open,
  the tool in place.
- A search finds a card when each word typed is the start of a word of its
  name, copy, keywords or category: “word” no longer finds “password”, and
  “edit” finds the eight cards under Edit & annotate. “pdf”, “to”, “the” and
  such are left out (“rotate pdf” found nothing), and a word ending in one “s”
  also counts without it (“number pages”, “sheets”). New keywords where a
  plain search found nothing: add, mark, scan, insert, drawing. Measured on
  298 searches (every card name, tab label and keyword, and likely searches),
  after the review below: 100 found nothing before, 8 now (translate, repair,
  compare, extract text and the like), and 43 bring a sentence; 89 show other
  cards than before, and in the 9 that lost a card, none was a match anyone
  wanted (“pen” in “open”, “lock” in “unlock”, “move” in “remove”, “word” in
  “password”, “us” in “just”).
- On a tool page, its own card is not in the grid, so a search for it found
  nothing (and “No tools match” on Crop PDF suggested “crop”). It now says
  “You are on Crop PDF: choose a PDF above.”, in the words of the page’s
  own button (“choose pictures” on JPG to PDF, “choose PDFs to merge” on
  Merge), and with a document open, a link takes the document to the tool.
- A dead end, a sentence or “No tools match”, is said to a screen reader once,
  700 ms after typing stops; cards that match are not said.
- The help and two FAQs say it too: Delete pages often makes a copy smaller,
  by what only the deleted pages used, and compresses nothing; scans in JPG
  to PDF are not searchable.
- Tests. `tests/search.test.mjs` checks which cards searches find, that every
  card is found by its name, tab label, keywords and category, and that each
  sentence links to tools that exist by their names, is one sentence, and
  says “can’t” about nothing a tool offers (a page-size tool may take resize,
  scale, A4, Letter and fit). `tests/browser/search.spec.mjs` covers the five
  dead ends on the home page and a tool page, the sentence above a card, the
  links, the page’s own tool, what is said and when, 320 px and axe. 33
  breakages, each applied alone to a copy, were each caught; one survived at
  first (a dead end said once ever, not once each time), and the test now
  repeats a dead end after an ordinary result.
- Firefox crashes when axe runs on a tool page’s landing with a document open
  (Crop PDF, or Add text after a tool was used), on the code before this
  change too; axe is not run there.
- A review tried over 150 searches and found every sentence true. Fixed:
  - A second search that found nothing, typed straight over the first, was not
    said to a screen reader: “No tools match” reads the same each time, and
    was said only when it was new. Silence then sounded like cards found. Each
    dead end is now its own.
  - A sentence still waiting to be said was said inside the editor, after
    “Your PDF is ready”, when the visitor had opened a file at once. A click
    anywhere else, or a dropped file, drops it.
  - The forms of a word found nothing: merging, merger, splitting, cropping,
    rotation, signing. A card's word now counts with the ending of a verb or a
    noun (-ing, -ed, -er, -or, -ion), whole or still being typed, so the card
    stays while “splitting” is typed past “split”. New keywords: electronic,
    bulk, organise, rearrange, sort, cut; and for Resize pages a3, a5, legal,
    larger, smaller. A sweep of 239 ordinary words through the rule found two
    wrong matches, and they are gone: “filling” found a card by “file” (a
    letter doubles, or a final e goes, not both), and “cutting” found only
    Resize pages, whose card says “nothing cut off”.
  - “merge pdf files”, “sign a document” and “crop pages” found nothing: each
    word has to be on the card, and “files” and “document” are on almost none.
    They count for nothing now, like “pdf”, with “free” and “online”; and Crop,
    Add margins and Merge are found by “pages”.
  - “doc” brought the sentence about Word while “document” was being typed,
    and “merge docs” brought it above Merge. “doc” and “docs” bring it only
    beside another word now (“pdf to doc”, “google docs”).
  - On a tool page a sentence's link to that page's own tool loaded the page
    again and emptied the search; the tool is named there without a link.
  - “pdf size” and “resize pdf file” ended at cards or at nothing; they bring
    the sentence about compressing, with Resize pages under it.
  - The Delete pages answer said “Yes” to a smaller file. A copy is written
    anew, and for 30 pages of plain text it came out larger with one page
    deleted (84,108 bytes for 82,977). It says “Often” now, and why not always.
  - No test read the sentences that say what the site does not do, outside the
    search: an answer changed to “Yes. Resizing compresses the file.” passed
    every suite. A test now reads every page and every sentence the editor
    holds: one that names compressing, OCR, redacting, Word, Excel or
    PowerPoint has to say the site does not do it. The five sentences the
    owner named are kept word for word.
  29 breakages of these fixes, each applied alone, were each caught.
  Left as it is: “annotate” shows the eight cards under Edit & annotate, as
  the filter of that name does.

## First open on a slow connection: the editor and the engines in one wave — 2026-11-13

- Since the editor loads on demand, a visitor who opened a file at once waited
  for it level by level: `editor.js`, then the 19 modules it imports, then the
  10 those import, and only then for pdf-lib and PDF.js, which the editor asked
  for once it had arrived (1.3 s after the click at 1.6 Mbit/s, 4.3 s at
  400 kbit/s). README said the engines start “as soon as a visitor opens the
  file picker”; they did not. Each page now holds two `<template>`s, written by
  `scripts/build-pages.mjs` from the module graph: `warm-editor`, a
  modulepreload link for every module the editor imports that the page does
  not have, and `warm-engines`, links for PDF.js and pdf-lib at the addresses
  the modules load them from. At the first sign of intent `app.js` asks for
  `editor.js` and then puts the links in the page, so everything downloads at
  once. A new module is picked up by `npm run pages`; the site-integrity suite
  fails when the pages were not rebuilt.
- What does not change. A visitor who only reads a page, on the home page or a
  tool page, downloads neither the editor nor an engine, however long they
  stay: there is no warm-up when the page is idle. Under Save-Data, intent
  loads the editor and not the engines. The PDF.js worker is not asked for
  early (WebKit downloads a worker twice whatever the hint), nor are the fonts
  or the sample.
- Measured in Chromium on a Pages-like server (gzip, max-age=600), tool page
  “Add page numbers”, “Try a sample” clicked as soon as the page had loaded,
  from the click to the first page painted, median of 7 runs, before and after
  taken in turn: 6565 → 6286 ms at 1.6 Mbit/s and 150 ms, 24283 → 23679 ms at
  400 kbit/s and 400 ms. The bytes after the click are the same (1.09 MB), so
  most of the wait is still the download itself. Before any intent a page
  asks for the same files as before (9; 10 in Firefox, which also takes the
  touch icon); the templates add 240 bytes to a page and the new code 239 to
  `app.js`, compressed.
- The release script versions the links in both templates, PDF.js and pdf-lib
  with their own ids, and expects each of them, so a page written another way
  stops the deploy.
- New tests: a visitor who only reads the home page or a tool page (an idle
  moment and 3 s later) has asked for nothing of the editor or the engines and
  has no warm-up link in the page; on intent the engines and every module of
  the editor are asked for while `editor.js` is held back and the picker is
  open; under Save-Data the engines wait for the file; on the first open each
  of the editor's modules, PDF.js, its worker and pdf-lib is asked for exactly
  once, in Chromium, WebKit and Firefox and on the stamped release; the
  templates match the module graph and the engines' addresses; stamping fails
  on a page that lost a link. 20 breakages, each applied alone, were each
  caught; one of them, pdf-lib's link with `crossorigin`, only in Chromium and
  Firefox (WebKit still asked for the file once) and by the site-integrity
  suite.
- A review counted the requests itself: a click at once, a hover and a click 8
  seconds later, the keyboard, a tap on a phone, and the stamped copy, in
  Chromium, WebKit and Firefox: 35 scripts, each once, and none before intent.
  It measured again, in turn, 7 runs: 6553 → 6339 ms at 1.6 Mbit/s, close to
  the figure above. Said plainly: a visitor who opens the sample at once waits
  0.2 to 0.3 seconds less out of 6.5 on a fast connection and about 0.6 out of
  24 on a slow one. The engines start much sooner, but the 1.1 MB still has to
  arrive. Two costs it found are accepted and written in the README: on a slow
  connection the console may say a file was “preloaded but not used” within a
  few seconds, and a page left open across a deploy fetches about 150 KB of
  its old release's modules for nothing before it reloads. The README did not
  say that the batch page loads the editor at once; it does now.

## Deploys that do not wait on a package mirror — 2026-11-13

- Every browser job ran `npx playwright install --with-deps`, which fetches the
  browsers' system packages from an Ubuntu mirror. In 36 browser jobs from 10
  to 13 November that step took from 16 seconds to 18 minutes 22 seconds (the
  median 24 to 35 seconds, by engine); 6 took more than 2 minutes, in all three
  engines. One ran a deploy past its time limit: the run showed “cancelled”,
  not “failed”, and that merge went live 1 hour 29 minutes later, with the
  next one. The log of a slow job shows the browser downloaded in 3 seconds
  and the packages at 104 kB/s, so keeping the browsers in a cache would not
  have helped.
- The browser jobs now run in Playwright's own image
  (`mcr.microsoft.com/playwright:v<version>-noble`, Ubuntu 24.04), which holds
  the browsers and their system packages; the install step is gone. A first
  job reads the version from `package-lock.json`, so a Dependabot update of
  Playwright brings its image along. The tag is not pinned by its digest: the
  image is Microsoft's, who published the browsers the jobs downloaded before,
  and the jobs that run it get a read-only token and no secrets. The
  WebKit in the image is the one the jobs installed, file for file (36 of 36).
  A usual run is not expected to be faster (pulling the image is reported to
  take about as long as the install usually did); the long waits go.
- After the deploy, a new job, live, asks the site whether it serves the
  release just built: the home page, a tool page and that release's app.js,
  each with a query no cache has stored. It asks for up to 11 minutes (Pages
  lets caches keep a file for 10), then fails with what it was served. It
  rolls nothing back. `scripts/stamp-release.mjs --github-output` hands it the
  release id; without the flag nothing is written, as test jobs stamp copies
  too.
- README: “What a deploy does” and “When a deploy goes wrong” (a failed or
  cancelled run did not update the site; re-running; reverting a merge;
  Unpublish).
- Tests. `tests/ci.test.mjs` reads the workflows as text: the browser jobs take
  their image from the image job and nothing installs browsers; the image
  job's own script, run on the real lockfile, names the image of the installed
  Playwright, and fails with a message when the lockfile has none; every action
  is pinned to a commit with its version; where the image runs, permissions
  are read-only and no secrets are passed; job outputs are wired at both ends,
  and no jobs wait on each other in a circle. The live check, run against a
  server in the test, passes on the release, waits through the old one, and
  fails on another release, an old tool page, an old app.js under the new
  address, a 404 and a closed port. The release test covers the flag.
  actionlint 1.7.11, with shellcheck, finds nothing in the three workflows.
  37 breakages, each applied alone to the workflows, the check and the stamp:
  36 caught. The one that got through, a ten-second pause between attempts
  however short the wait, changes nothing: a pause is cut to the time left.
- Run on GitHub, by hand, on the branch (Test, run 53): all five jobs passed in
  7 minutes 43 seconds. The image job took 7 seconds; the containers started
  in 26 to 36 seconds; nothing was installed from a mirror. The suites passed
  inside the image: Chromium in 2 min 23 s, Firefox in 3 min 15 s, WebKit in
  6 min 44 s (137 passed, 3 skipped by design, as on this machine). The live
  job has not run: it runs with the first deploy.
- The manual check after each deploy stays (“Deploy check: reload after a
  release”): the live job asks with new addresses, not as a tab opened before
  the deploy does.
- A review read the deploy workflow as the first deploy will run it, and found
  nothing wrong in it. It found, and these are fixed:
  - The release id was a hash of the site's own files, so an update of PDF.js
    or pdf-lib alone kept the id, and the live check passed against the old
    site: on the very deploy (a security update of an engine) where its answer
    matters most. The id now covers the engines and the fonts. That is right
    for visitors too: the modules that name an engine change with it, and
    under one id a browser could keep the module that names the engine before.
  - The failure showed on the run's page as a line ending in “What it
    served:”, with the evidence in the log below. The evidence and “What to
    do: README, "When a deploy goes wrong"” are in the annotation now, and a
    request that failed names its address.
  - The workflow test let the live job be switched off unseen: `|| true` after
    the check, `continue-on-error`, `if: always()`, a time limit on the step,
    another working directory, or a deploy group that cancels a run in
    progress. And a job-level `permissions: write-all # ...`, or
    `{ contents: write }` on one line, was not read at all. Each fails now.
  - Nothing tested an answer that never ends. One does, and the check gives up
    when its time is up.
  - README: a run takes about ten minutes, not seven; re-run only the latest
    run (an older one would put older code back); what “manifest unknown” on a
    Playwright update means.
  18 breakages of these fixes, each applied alone to the workflows, the check
  and the stamp, were each caught (one only after a test was added: a “%” in
  the evidence is written %25 in the annotation). The live job has still not
  run on GitHub.

## Four reviews of the five changes, and the last run — 2026-11-13

- Four reviewers each took one part that no one had reviewed: the Resize
  download, the search with the first open, the workflows with the check after
  a deploy, and every sentence a visitor or the owner reads. What each found
  is in its section above. Together: 40 findings, of which 3 were left as they
  are and say so there (“annotate” and its eight cards; the console's
  “preloaded but not used”; a page left open across a deploy), and 1 is a
  limit now listed (actions, article threads and measuring scales on a resized
  page).
- 86 breakages of the fixes, each applied alone to a copy: 86 caught (33 in
  the Resize download, 29 in the search, 18 in the deploy, 6 in the words).
- The last run on this machine, on the code as committed: `npm test`, 470 of
  470. The browser suites: Chromium 151 passed; WebKit 141 passed, 3 skipped by
  design; Firefox 131 passed, 1 skipped by design. (The search's last change,
  which words name no tool, came after: its own tests ran again in the three
  engines.)
