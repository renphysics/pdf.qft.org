/**
 * The first module of a Chinese page (scripts/build-pages.mjs puts it before
 * app.js): it hands i18n.js the Chinese catalog. A page runs its modules in the
 * order it lists them, and all of them before it has loaded; so app.js, and
 * every module it imports, finds the catalog there, and the page's buttons work
 * once it has loaded, as on an English page (i18n.js, useCatalog).
 */
import * as catalog from './i18n-zh.js';
import { useCatalog } from './i18n.js';

useCatalog(catalog);
