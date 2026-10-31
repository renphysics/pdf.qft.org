# QFT PDF release checks

This is a focused manual acceptance plan for the browser-local PDF editor. The
source review does not replace the owner’s browser verification.

## Required working journeys

1. **First visit:** Open the supplied sample from the landing page. Its first page,
   page count, filename, and thumbnails appear. A new visitor can also reach the
   file chooser with the keyboard.
2. **Real file:** Open a PDF from disk and drag/drop another. A document drag must
   not navigate the browser away from the app. Unsupported file types, corrupted
   PDFs and encrypted PDFs show readable errors. PDFs above the former 50 MB
   per-file and 100 MB combined caps are not rejected solely for byte size;
   there is no fixed page-count cap. Capacity depends on browser memory.
3. **Add text:** Add a visible text note, place it on the page, edit its text and
   size, then export. Reopen the export and confirm the text is selectable and
   correctly positioned. The feature makes no promise to change original text.
4. **Watermark:** Apply a rotated, translucent watermark to all pages. Check the
   first and last pages of the downloaded PDF and verify that content remains
   legible. Confirm a selected-page operation does not affect other pages.
5. **Repeated footer:** Apply the same footer on every page. Check that the visible
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
10. **Undo/reset:** Undo after a change and after a page deletion. Reset restores
    the documented state. Loading another file must not inherit stale annotations
    or a stale active page.
11. **Image/highlight:** Place an image and a translucent highlight. Preview and
    export agree on dimensions, opacity, and location. Highlighting is described
    as annotation, never as secure redaction.

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
