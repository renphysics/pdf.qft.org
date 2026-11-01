# QFT PDF release checks

This is a focused manual acceptance plan for the browser-local PDF editor. The
source review does not replace the owner’s browser verification.

## Required working journeys

1. **First visit:** Open the supplied sample from the landing page. Its first page,
   page count, filename, and thumbnails appear. A new visitor can also reach the
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
- Not checked here: Adobe Acrobat and Apple Preview. Please open a download with
  Chinese and Korean text in both before relying on it.

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

