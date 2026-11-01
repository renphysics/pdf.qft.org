# QFT PDF

QFT PDF is a static, browser-local PDF toolkit. The application adds text, images,
highlights, watermarks, headers and footers, and page numbers, and can merge,
reorder, rotate, delete, crop, extract, and split PDF pages. Reusable batch
presets apply several edits to separate files in one workflow.

## License

QFT PDF application code is licensed under the [MIT License](LICENSE), copyright
2026 Jie Ren. Third-party libraries, fonts, font metrics, codecs, and color
profiles retain their own licenses; the application license does not replace
those terms. License texts, available upstream notices, and provenance records
ship with the website in [dist/licenses](dist/licenses).
See the [third-party index](dist/licenses/THIRD-PARTY.txt) and the recorded
package hashes and source comparisons in `scripts/*license-provenance.json`.

## GitHub Pages

The included `.github/workflows/pages.yml` publishes `dist/` on pushes to `main`
and can also be run manually. It uses pinned action revisions, installs the test
dependencies, and runs `npm test` (restoring the verified font asset, checking
local resource paths, notices and metadata, then the PDF engine and workflow
suites) before uploading only the static website; a failing test blocks the
deployment. `.github/workflows/test.yml` runs the same checks on pull requests.

Before upload, the workflow also runs `scripts/stamp-release.mjs`, which adds a
version query to every first-party module, stylesheet and PDF engine URL in the
built copy (the committed sources stay unversioned). GitHub Pages lets browsers
cache every file for ten minutes under an unchanging URL, so without this a
normal reload just after a deploy could pair the new page with the previous
release's scripts. First-party files share one release id derived from their
contents; each engine bundle is versioned by its own bytes, so it is downloaded
again only when it changes. `tests/release-stamp.test.mjs` keeps the script in
step with the sources. No server, API keys, or external document-processing service
is needed.

1. Open repository **Settings → Pages**.
2. Set **Build and deployment → Source** to **GitHub Actions**.
3. Run **Deploy QFT PDF to GitHub Pages** from the **Actions** tab if the initial
   run occurred before Pages was enabled.

The site supports both `https://renphysics.github.io/pdf.qft.org/` and the
intended custom domain, `https://pdf.qft.org/`. The canonical URL is already set
to the custom domain. Asset links remain relative so the project URL works
before the domain is connected.

### Connect pdf.qft.org

In **Settings → Pages → Custom domain**, enter `pdf.qft.org` and save. Then add
this record at the DNS provider for `qft.org`:

| Type | Name | Target |
| --- | --- | --- |
| CNAME | `pdf` | `renphysics.github.io` |

The target is the account's GitHub Pages domain, without the repository name.
After GitHub verifies DNS and provisions the certificate, enable **Enforce HTTPS**.
The included `dist/CNAME` documents the intended hostname for alternate static
hosting. GitHub Actions deployments ignore that file, so the Pages custom-domain
setting is still required. This repository does not change your DNS records.

Official documentation: [publishing with Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
and [custom domains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).

### Static hosting and local preview

All runtime libraries and fonts are bundled; visitors do not download scripts
from a third-party CDN. With Node.js 22.13 or newer and Python 3 installed:

```sh
node scripts/prepare-assets.mjs
python3 -m http.server 8000 --directory dist
```

Open `http://localhost:8000/`. For production, serve `dist/` over HTTPS.
GitHub Pages ignores `_headers`; the HTML therefore also provides its content
security policy and referrer policy through supported meta tags. `_headers`
remains available for hosts that support that format.

The large CJK font is stored losslessly as two chunks under `vendor/fonts/` to
stay within the repository upload API's request limit. `prepare-assets.mjs`
verifies both chunks and the complete SHA-256, then reconstructs the original
font at `dist/assets/fonts/NotoSansCJKsc-Regular.otf`. It needs no network access
or package installation. The font's bytes and OFL license are unchanged; the
Pages workflow performs this step automatically.

## Tool pages and addresses

Every tool has its own address, such as `/merge-pdf/` or `/crop-pdf/`, listed in
`dist/routes.js`. Each tool page is a complete copy of the app with its own
title, description, heading, how-to, FAQ and structured data, so search engines
and link previews see real content, and visitors land straight in that tool.

The pages are generated, not edited by hand. `dist/index.html` is the template:
`<!-- page:name -->` comments mark the regions a tool page replaces, and
`scripts/pages/content.mjs` holds each page's copy. After changing either, run:

```sh
npm run pages
```

This rewrites `dist/<slug>/index.html` and `dist/sitemap.xml`. `npm test` fails if
they are out of date, and checks every page's canonical address, metadata and
FAQ data.

Inside a page, the editor and the batch workspace are browser history entries,
so Back and Forward move between views, the address names the tool in use, and
a reload opens that tool's page (documents stay in memory only, so a reload
starts again from the page's landing view).

## The editor

Edits apply as you make them. The editor keeps a description of the document
(its source PDFs, the page list with each page's rotation and crop, the items
placed on pages, and the watermark, header/footer and page-number settings) and
shows it without building a PDF:

- `preview.js` renders each page from its source PDF with PDF.js, turned and
  cropped as the page list says, and draws every edit on top as SVG. It lays
  text out with the export's own code (`layout.js`) and fonts (Helvetica's
  metrics with the metric-compatible Liberation Sans, Noto Sans, Noto Sans CJK),
  so lines break and land exactly where the downloaded PDF puts them.
  `tests/preview.test.mjs` checks this against exported files.
- Pages are shown one under another and scroll continuously, each fitted to
  the width (on phones, each page fits the stage and settles in its middle).
  Only the pages near the view are drawn, and they are released again as they
  leave, so documents with hundreds of pages stay light. The page filling most
  of the view is the current page: the page number, the page strip and the
  tools that work on "this page" follow it. Zoom (the buttons, or Control and
  the wheel) keeps the reading position, and undo shows the page it changes.
- Text, images and highlights can be typed into, dragged and resized right on
  their page, or selected and changed in the panel; with an item selected,
  arrow keys nudge it, Delete removes it and Enter edits text. Watermarks, headers and
  footers, and page numbers update on every page as their settings change.
  Turning, moving and removing pages only changes the page list.
- Every change is one undo step (typing, dragging and sliders merge into one
  step), with redo. Problems the export would report, such as a character the
  fonts cannot draw or a header too long for its page, are shown on the page
  as soon as they appear.
- The PDF is built only to download, extract or split, in a module Web Worker
  (`export-worker.js`) so the page stays responsive; browsers without module
  workers build it on the page instead.

On phones the document comes first: the page fills the screen under a compact
document bar, tools sit in a bottom bar, and each tool's settings open in a
sheet that folds away. Controls are at least 44 px.

## Development

The application uses plain ES modules, HTML, and CSS. Runtime assets are pinned
in `dist/assets/vendor/versions.json`. The landing page loads no PDF engine:
`pdf-engine.js` adds the bundled pdf-lib on first use (and fontkit only for
non-ASCII text), and `preview.js` imports PDF.js when a document opens. Both
start downloading as soon as a visitor opens the file picker, drags a file in,
or opens the sample. The package manifest and lockfile provide
the dependencies needed to run the PDF regression tests; they are not served
to visitors. `private: true` prevents accidental npm publication and does not
change the project's MIT license.

pdf-lib is [`@cantoo/pdf-lib`](https://github.com/cantoo-scribe/pdf-lib), a
maintained fork with the same API (the original project's last release was
1.17.1, in 2021). To update it, copy the new release's `dist/pdf-lib.min.js`
to `dist/assets/vendor/`, update the version in `package.json`,
`dist/assets/vendor/versions.json` and `scripts/asset-checksums.json`, then
regenerate and check its notices and provenance:

```sh
npm pack @cantoo/pdf-lib@<version>    # in an empty directory
python3 scripts/collect-pdf-lib-notices.py --tarball <that .tgz> --cache <empty directory>
```

fontkit is [`@cantoo/fontkit`](https://github.com/cantoo-scribe/fontkit), whose font
subsets work for the CFF outlines of the CJK font (older fontkit's did not, so that
font used to be embedded whole). Update it the same way: copy
`dist/fontkit.umd.min.js`, then run `scripts/collect-fontkit-notices.py` with its
npm tarball. Embedded text uses each glyph's own advance, with no ligatures,
contextual alternates or kerning, exactly as the preview draws it.

The script confirms the bundle is the official npm build and pins every
library inside it to the npm release whose files match the bundle's embedded
sources byte for byte.

```sh
npm ci --ignore-scripts
npm test
```

The tests require Node.js 22.13 or newer and Python 3. `npm run check` validates
the static distribution without installing dependencies. The PDF tests inspect
exported text, geometry, numbering and ZIP contents independently, and check
that the editor preview draws text where the export puts it. Set `PYTHON`
if Python 3 has another executable name on your machine.

The editor keeps PDFs, edits, and generated files in tab memory. Saved presets
store only settings and entered preset text in this browser's localStorage.
Download creates a new file; originals are not overwritten. There is no upload
endpoint, analytics script, sign-in, or billing integration. Ordinary website
requests are still handled by the hosting platform.

## Supported input

- PDFs with no fixed per-file or combined PDF byte-size limit.
- Password-protected PDFs (AES-256, AES-128 and RC4 encryption): see
  [Passwords](#passwords). PDFs protected with a certificate are not supported.
- No fixed page-count limit; pages and thumbnails are drawn near the visible part of the document and the page strip.
- Practical file capacity depends on available browser memory and device performance; very large documents may be slow or fail to open.
- PNG/JPEG annotations up to 15 MB and 30 megapixels.
- Latin and Chinese text with embedded Noto fonts.
- PDF forms (AcroForm): filled in Fill form and kept fillable, or flattened; see
  [Forms](#forms). Forms made only in XFA are not supported.

Existing paragraphs are not rewritten. Highlighting is not secure redaction.
Existing digital signatures may be invalidated by changes. Merging, duplicating,
or subsetting pages from a PDF with form fields needs its fields flattened
first; otherwise it is rejected, rather than silently dropping fields. Chinese, Japanese kana and Korean Hangul use Noto
Sans CJK SC. Only the glyphs used are embedded, so such text typically adds 50–150 KB
to a download. The font itself (16 MB) is downloaded once, the first time such text
is typed, and then comes from the browser cache.

## Validation

tests/engine.test.mjs exercises exported output with independent PDF.js text
and geometry checks: cropping, rotation, numbering, annotation types, Unicode,
merge/extract/reorder, password-protected input and output, and form handling.
tests/forms.test.mjs fills and flattens a two-page form
(`tests/fixtures/form-fields.pdf`, made by `scripts/make-form-fixture.mjs`). They
use the development dependencies installed by `npm ci`.

Browser tests in `tests/browser/` drive the real site with
[Playwright](https://playwright.dev) in Chromium, WebKit (Safari's engine) and
Firefox: opening files and the sample, typing and
dragging text, undo and redo, every tool, downloads that match the preview
(pixels, and line widths for Chinese and Korean text), PDF/A and
password-protected files, signatures, filling forms, JPG to PDF and PDF to
JPG, batch processing, continuous scrolling (the current page, editing any
page, zoom, a 400-page document), phones (layout, 44 px targets, no sideways
scrolling, swiping between pages; an iPhone in Chromium and in WebKit) and axe
accessibility checks. A `release` project stamps a copy of the site and serves
it under `/pdf.qft.org/`, as GitHub Pages does, to check versioned URLs and the
export worker. They run in CI for pull requests (one job per browser) and
before every deployment. Locally:

```sh
npm ci
npx playwright install chromium webkit firefox   # once; installed browsers are tested
npm run test:browser
BROWSERS=webkit npm run test:browser             # one browser
```

`node scripts/serve.mjs` serves `dist/` the same way for a manual look
(<http://127.0.0.1:4173/>).

`scripts/create-sample.py` optionally regenerates the original three-page sample
and test fixtures. It requires Python `reportlab` and `pypdf`, plus
`QFT_SAMPLE_FONT_DIR` pointing to a directory with NotoSans-Regular.ttf,
NotoSans-Bold.ttf, and NotoSerif-Regular.ttf. The ready-to-use sample and fixtures
are included. Disposable PDF/PNG test output is excluded from Git.

`scripts/social-card/render.mjs` regenerates the link-preview image
(`dist/assets/social-card.png`, referenced by the Open Graph tags) and
`dist/apple-touch-icon.png` from the HTML templates beside it. It needs
Playwright with Chromium and Python's Pillow. Keep the card's wording in step
with the page title, description and hero headline.

Browser acceptance journeys and review notes are under tests/.

## Delete Pages and Crop PDF

Delete Pages is available from the home toolkit and editor sidebar. Select
thumbnail checkboxes or enter ranges such as `2, 4-6`; the editor marks pages
for deletion and shows how many will remain. At least one page must remain.
Deletion is undoable and the original source file is untouched.

Crop PDF accepts a pointer-drawn rectangle or numeric margin percentages.
Apply to the current page, selected pages, or every page. Percentages refer
to each page's current visible area; successive crops trim that area further.
Restore original crop restores the source page's original visible boundary
for the chosen scope. Undo reverses individual operations.

Cropping changes the PDF CropBox and preserves selectable text and vectors.
It hides outside content, **not secure redaction**. Existing crop-box offsets,
native and added rotations, mixed sizes, and placed annotations are supported.
Watermarks, headers, footers, and page numbers follow the resulting visible
page bounds. Files continue to be processed entirely in the browser.

## JPG to PDF and PDF to JPG

JPG and PNG files open as pages, alone or with PDFs (`dist/convert.js`,
`imagesToPdf` in `pdf-engine.js`). Each picture becomes a one-page source on A4 or
US Letter (chosen from the browser's language), turned to suit the picture, or at
its own size (96 pixels per inch), with an optional margin; pictures are never
enlarged. JPEG data goes into the PDF unchanged, except that a photo whose EXIF
orientation turns it is saved again upright, since PDF ignores that tag. Changing
the page size or margin lays the picture pages out again as one undo step. With
Add an image, a picture added from the page strip goes on the page instead.

PDF to JPG draws pages with PDF.js from the PDF as it downloads (edits included,
no password) on white, at 72, 150 or 300 dpi (smaller for pages that would exceed
16 million pixels, a browser limit), as JPG or PNG. One page downloads as a picture;
several download as a ZIP. Word, Excel and PowerPoint conversion is not offered: it
would need a server or a very large download.

## Signatures

Sign PDF (`/sign-pdf/`) makes a signature in the browser, as a transparent PNG
(`dist/signature.js`): drawn with a mouse, finger or pen (pointer events, three
times the screen resolution); typed in Allura, a handwriting font bundled from
`@fontsource/allura` (OFL, no Reserved Font Name; drawn on a canvas, never embedded
in PDFs); or uploaded, with the paper made transparent around the ink (anything
clearly lighter than the picture's median brightness fades out). Signatures are
cropped to the ink.

A signature is placed like an image: at a click, near the lower right of the page,
or on every page in one step, and a placed one can be copied to the same spot on
every page. Copies share one bytes object, and the engine embeds each image once
per document, so a signature on 50 pages is stored once. It is kept in
`localStorage` only when "Keep it on this device" is ticked; unticking removes it.
This is a picture of a signature, not a certificate-based digital signature.

## Forms

Fill form (`/fill-pdf-form/`) fills in a PDF's form fields: text (single and
multiple lines, boxed characters, maximum lengths), check boxes, radio buttons,
dropdowns and lists. A PDF with fields opened from the home page opens in it.

- The engine describes the fields when a PDF opens (`formFields` in
  `pdf-engine.js`): each field's kind, label (its tooltip), value and settings,
  and each widget's page and rectangle. Read-only, hidden, button and signature
  fields are not offered for filling.
- While Fill form is open, PDF.js draws the pages without their fields and the
  editor puts inputs over them, turned and cropped with the page; Tab moves
  through them in reading order, on to the next page. In the other tools and
  the page strip, PDF.js draws the fields with the values typed (its annotation
  storage), as readers will show the download.
- Values are part of the document state (`state.formValues`), so each change is
  an undo step. On export they are written to the fields, and changed fields get
  new appearances in a font that has their characters (Helvetica, Noto Sans or
  Noto Sans CJK), with automatic text sizes worked out as PDF.js does; their
  default appearance is kept, so other apps edit them as before.
- “Flatten fields on download” (`state.flattenForms`) makes the visible fields
  part of their pages and removes the form. A flattened form's pages can be
  combined with other PDFs, extracted, deleted or split.
- Calculations and checks built into a form do not run. A form that also has an
  XFA version loses it once fields are filled here.

## Passwords

A PDF that needs a password asks for it when it is opened (also when adding
files); a wrong password keeps the prompt open, and Cancel skips the file.
PDFs with only an owner password, which restrict printing, copying or changes
but open without one, open without asking. The editor then works on an
unencrypted copy in memory: `openPdf` in `pdf-engine.js` decrypts the file once,
drops its old encryption dictionary (its password hashes must not travel with
an unlocked copy), and does not keep the password.

Downloads keep the password the PDF was opened with, so an edited copy is not
silently unprotected. Protect PDF (`/protect-pdf/`) sets or changes it; Unlock
PDF (`/unlock-pdf/`) removes it, and a file opened there is not protected again.
Owner-password restrictions are not carried over. Protected downloads use
AES-256 with the same password as owner password and every permission allowed;
passwords are prepared as PDF 2.0 asks (SASLprep mapping and NFKC). Split parts
and extracted pages are protected the same way. A PDF/A file that is protected
stops declaring PDF/A, which forbids encryption.

Passwords live only in the tab's memory (the editor state and its undo
history). They are never written to presets or browser storage. Batch
processing does not ask for passwords: owner-password PDFs are processed, and a
PDF that needs a password reports that it should be unlocked first.

`@cantoo/pdf-lib` 2.11.1 encrypts stream contents but not the strings in objects
written outside object streams (the catalog's language, page dictionaries,
stream dictionaries), which readers then decrypt into garbage.
`encryptStringsWhenSaving` in `pdf-engine.js` encrypts those strings too; the
engine tests check the result with PDF.js. The password test fixtures are
encrypted by pypdf (`scripts/make-encrypted-fixtures.py`), not by the library
under test.

## Split PDF and saved batch presets

Split the actual edited PDF by individual pages, fixed page intervals, or custom
groups. A semicolon starts a new PDF; commas and ranges choose pages within it
(e.g. `1-3; 4,6; 7-9`). Applied edits, text, crop boxes, rotations, and printed
page numbers are retained. Download individual PDFs or a ZIP. Splitting form
PDFs is rejected to avoid losing interactive fields. Splitting can be cancelled
between output files.

Batch presets combine watermark, headers/footers, page numbers, and percentage
cropping. Crop is applied before repeated content; each file is processed from
its original bytes and numbering restarts per file. Errors are isolated, and
processing can stop after the current file. Output filenames are unique.
Only preset settings and their text are persisted in localStorage; source PDFs
and generated results remain in memory. Storage failures leave the current
preset usable in the tab. No external ZIP library or network service is used.
ZIP32 size/count limits produce a message directing users to individual files.

The home toolkit supports category filters and search. The editor uses a compact
tool selector (a bottom tool bar on phones) and direct page navigation.
Responsive checks cover 320px to 1280px layouts without horizontal overflow.

`node tests/workflows.test.mjs` verifies split planning including 350 pages,
preserved geometry/text/numbering, all-page presets, per-file numbering reset,
immutable source files, form rejection, cancellation, filename handling, and
ZIP contents/CRC using an independent Python reader.
