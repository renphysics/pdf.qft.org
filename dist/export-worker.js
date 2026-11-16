/**
 * Builds the downloaded PDF off the main thread, so the editor stays
 * responsive while a large document is saved. app.js falls back to building
 * on the main thread if this worker cannot start.
 *
 * Message in:  { id, state }            (the editor state, as buildPdf takes it)
 * Messages out: { id, progress }        (0..1, while building)
 *               { id, bytes, notes }    (the finished PDF, its buffer transferred,
 *                                        and notes from buildPdfWithNotes)
 *               { id, error }           ({ message, text, params, pageIndex, itemId })
 *
 * Its address names its page's language (?lang=zh), so it reports in that
 * language (i18n.js); an error keeps its English text and values too.
 */
import { buildPdfWithNotes } from './pdf-engine.js';
import { userError } from './i18n.js';

self.addEventListener('message', async ({ data }) => {
  const { id, state } = data;
  try {
    const { bytes, notes } = await buildPdfWithNotes(state, (progress) => self.postMessage({ id, progress }));
    self.postMessage({ id, bytes, notes }, [bytes.buffer]);
  } catch (error) {
    // The editor reports the error (and logs it) where the user is.
    const shown = error?.message ? error : userError('The PDF could not be created.');
    self.postMessage({
      id,
      error: {
        message: shown.message,
        text: shown.text,
        params: shown.params,
        pageIndex: error?.pageIndex,
        itemId: error?.itemId,
      },
    });
  }
});
self.postMessage({ ready: true });
