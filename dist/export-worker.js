/**
 * Builds the downloaded PDF off the main thread, so the editor stays
 * responsive while a large document is saved. app.js falls back to building
 * on the main thread if this worker cannot start.
 *
 * Message in:  { id, state }            (the editor state, as buildPdf takes it)
 * Messages out: { id, progress }        (0..1, while building)
 *               { id, bytes, notes }    (the finished PDF, its buffer transferred,
 *                                        and notes from buildPdfWithNotes)
 *               { id, error }           ({ message, pageIndex, itemId })
 */
import { buildPdfWithNotes } from './pdf-engine.js';

self.addEventListener('message', async ({ data }) => {
  const { id, state } = data;
  try {
    const { bytes, notes } = await buildPdfWithNotes(state, (progress) => self.postMessage({ id, progress }));
    self.postMessage({ id, bytes, notes }, [bytes.buffer]);
  } catch (error) {
    // The editor reports the error (and logs it) where the user is.
    self.postMessage({
      id,
      error: {
        message: error?.message || 'The PDF could not be created.',
        pageIndex: error?.pageIndex,
        itemId: error?.itemId,
      },
    });
  }
});
self.postMessage({ ready: true });
