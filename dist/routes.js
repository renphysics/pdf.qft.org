/**
 * Public addresses of the tool pages. scripts/build-pages.mjs generates one page
 * per address from index.html, and the app shows the matching address while a
 * tool is in use. Keep slugs stable: people bookmark them and search engines
 * index them. Editor tools without their own page share their card's address.
 */
export const TOOL_PAGES = Object.freeze({
  text: 'add-text-to-pdf',
  image: 'add-text-to-pdf',
  highlight: 'add-text-to-pdf',
  watermark: 'add-watermark-to-pdf',
  footer: 'add-header-and-footer-to-pdf',
  numbers: 'add-page-numbers-to-pdf',
  pages: 'organize-pdf',
  delete: 'delete-pages-from-pdf',
  crop: 'crop-pdf',
  merge: 'merge-pdf',
  split: 'split-pdf',
  batch: 'batch-edit-pdf',
});
