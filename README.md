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
and can also be run manually. It uses pinned action revisions, restores the
verified font asset, checks local resource paths and notices, and uploads only
the static website. No server, API keys, or external document-processing service
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

## Development

The application uses plain ES modules, HTML, and CSS. Runtime assets are pinned
in `dist/assets/vendor/versions.json`. The package manifest and lockfile provide
the dependencies needed to run the PDF regression tests; they are not served
to visitors. `private: true` prevents accidental npm publication and does not
change the project's MIT license.

```sh
npm ci --ignore-scripts
npm test
```

The tests require Node.js 22.13 or newer and Python 3. `npm run check` validates
the static distribution without installing dependencies. The PDF tests inspect
exported text, geometry, numbering and ZIP contents independently. Set `PYTHON`
if Python 3 has another executable name on your machine.

The editor keeps PDFs, edits, and generated files in tab memory. Saved presets
store only settings and entered preset text in this browser's localStorage.
Download creates a new file; originals are not overwritten. There is no upload
endpoint, analytics script, sign-in, or billing integration. Ordinary website
requests are still handled by the hosting platform.

## Supported input

- Unencrypted PDFs with no fixed per-file or combined PDF byte-size limit.
- No fixed page-count limit; thumbnails render near the visible portion of the page strip.
- Practical file capacity depends on available browser memory and device performance; very large documents may be slow or fail to open.
- PNG/JPEG annotations up to 15 MB and 30 megapixels.
- Latin and Chinese text with embedded Noto fonts.
- Single-source form-preserving editing where the complete source page set is retained.

Existing paragraphs are not rewritten. Highlighting is not secure redaction.
Existing digital signatures may be invalidated by changes. Merging, duplicating,
or subsetting pages from interactive-form PDFs is intentionally rejected to
avoid silently dropping fields. Chinese text adds approximately 14 MB to output,
because the complete CJK font is embedded for compatibility.

## Validation

tests/engine.test.mjs exercises exported output with independent PDF.js text
and geometry checks: cropping, rotation, numbering, annotation types, Unicode,
merge/extract/reorder, encrypted-file rejection, and form handling. It uses the development dependencies installed by `npm ci`.

`scripts/create-sample.py` optionally regenerates the original three-page sample
and test fixtures. It requires Python `reportlab` and `pypdf`, plus
`QFT_SAMPLE_FONT_DIR` pointing to a directory with NotoSans-Regular.ttf,
NotoSans-Bold.ttf, and NotoSerif-Regular.ttf. The ready-to-use sample and fixtures
are included. Disposable PDF/PNG test output is excluded from Git.

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
tool selector and direct page navigation. Responsive checks cover 320px and
390px layouts without document-wide overflow.

`node tests/workflows.test.mjs` verifies split planning including 350 pages,
preserved geometry/text/numbering, all-page presets, per-file numbering reset,
immutable source files, form rejection, cancellation, filename handling, and
ZIP contents/CRC using an independent Python reader.
