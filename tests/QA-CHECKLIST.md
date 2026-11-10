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
    it with the arrow keys, edit it with Enter and delete it with Delete.

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

- Each icon-only button has an accessible name; labels are tied to inputs.
- Buttons work by keyboard, focus is visible, and any dialog restores focus.
- Processing progress and success/error messages are announced through a live
  region; disabled actions explain what is required when that is not evident.
- Reorder works without dragging. Pointer placement does not block normal page
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
  works on its own state (`sameRelease`) and otherwise reloads into the new
  release, once, with a notice when a file had been chosen; a reload that does
  not help says so. (2) When the editor could not be fetched, the notice was
  the browser's own text, it also appeared on a mere hover, the picker kept
  its file (so choosing it again did nothing), and trying again cannot work in
  Chromium, which never fetches a module twice in a page (probed in three
  engines). The notice now says to check the connection and reload, warm-ups
  fail silently, and the picker is emptied. (3) On the batch page, Choose PDFs
  pressed before the editor had arrived opened the workspace but could not
  open the picker later; the shell now opens a picker of its own at once and
  hands the files over. (4) Module headers and the README described the
  layout from before the split. Landing tests, in three engines: a skewed
  release reloads once and then adds a PDF to the open document; a warm-up
  reloads without a notice and a second mismatch asks for a reload by hand;
  a refused editor gives the notice and an empty picker; the batch picker
  opens while the editor is held back. Each fails with its fix taken out.
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
