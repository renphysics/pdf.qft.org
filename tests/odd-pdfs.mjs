// Odd but valid PDFs, written object by object without a PDF library, and the
// catalogue of them that tests/odd-pdfs.test.mjs walks through every engine
// operation. Each file is odd in a way real PDFs are: pages that share their
// resources or inherit them from the page tree, boxes and turns that are
// unusual, forms without appearances, layers, object streams, incremental
// updates, odd syntax and odd content. Each is one that PDF.js, pypdf (strict),
// MuPDF and poppler all read the same way, so what the tests expect of it is
// what any reader would show. This file is not a suite: npm test runs
// tests/*.test.mjs only.
import zlib from 'node:zlib';

// Bytes are written as latin1, one byte per character. TextEncoder would turn
// every byte from 0x80 up into two, and break binary streams and the offsets.
const latin1 = (text) => Buffer.from(text, 'latin1');
const bytesOf = (data) => (Buffer.isBuffer(data) ? data : latin1(data ?? ''));

/** A font of the standard fourteen, which readers have without its being embedded. */
export const font = (name) =>
  `<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`;

/** A stream object's body, from ASCII content. */
export const stream = (content) => `<< /Length ${latin1(content).length} >>\nstream\n${content}\nendstream`;

/**
 * A PDF file from labelled objects, numbered from 1 in the order given. Each is
 * [label, body]: the body is a string, or { dict, data } for a stream (data a
 * string or a Buffer; dict without /Length). "@label" in a body becomes a
 * reference to that object. The object labelled 'cat' is the catalog, and the
 * one labelled 'info', if any, the document's details.
 * options: eol, the line ending ('\n' or '\r'); header; prefix and suffix,
 * bytes before the header and after the end; objectStreams, to put the objects
 * that are not streams into one object stream, with a cross-reference stream;
 * lengthRef, to make each stream's /Length an object written after the stream;
 * comments, to put a comment after each object and odd whitespace in between.
 */
export function pdfFile(objects, options = {}) {
  const eol = options.eol ?? '\n';
  const all = [...objects];
  if (options.lengthRef)
    for (const [label, body] of objects)
      if (typeof body === 'object') all.push([`${label}-length`, String(bytesOf(body.data).length)]);
  const numbers = new Map(all.map(([label], index) => [label, index + 1]));
  const resolve = (text) =>
    text.replace(/@([A-Za-z0-9_-]+)/g, (match, label) => {
      if (!numbers.has(label)) throw new Error(`No object labelled ${label}`);
      return `${numbers.get(label)} 0 R`;
    });
  const parts = [];
  let size = 0;
  const put = (chunk) => {
    const buffer = bytesOf(chunk);
    parts.push(buffer);
    size += buffer.length;
  };
  if (options.prefix) put(options.prefix);
  // The comment of four bytes over 0x7F says the file holds binary data.
  put(`${options.header ?? '%PDF-1.7'}${eol}%\xe2\xe3\xcf\xd3${eol}`);
  const offsets = new Map();
  const space = options.comments ? ' \t\f ' : ' ';
  const packed = new Map();
  all.forEach(([label, body], index) => {
    const number = index + 1;
    if (options.objectStreams && typeof body === 'string') {
      packed.set(number, resolve(body));
      return;
    }
    offsets.set(number, size);
    put(`${number}${space}0${space}obj${options.comments ? ` % ${label}` : ''}${eol}`);
    if (typeof body === 'string') put(resolve(body));
    else {
      const data = bytesOf(body.data);
      const length = options.lengthRef ? `@${label}-length` : String(data.length);
      // The keyword stream ends with LF: a CR alone is not allowed there.
      put(resolve(`<< ${body.dict ?? ''} /Length ${length} >>`) + `${eol}stream\n`);
      put(data);
      put(`${eol}endstream`);
    }
    put(`${eol}endobj${eol}`);
    if (options.comments) put(`%after ${label}${eol}${eol}`);
  });
  const count = all.length;
  const trailer = resolve(`/Root @cat${numbers.has('info') ? ' /Info @info' : ''}`);
  if (options.objectStreams) {
    const objectStream = count + 1,
      xref = count + 2;
    let index = '',
      body = '';
    for (const [number, text] of packed) {
      index += `${number} ${latin1(body).length} `;
      body += text + '\n';
    }
    const data = zlib.deflateSync(latin1(index + body));
    offsets.set(objectStream, size);
    put(`${objectStream} 0 obj${eol}<< /Type /ObjStm /N ${packed.size} /First ${latin1(index).length}`);
    put(` /Filter /FlateDecode /Length ${data.length} >>${eol}stream\n`);
    put(data);
    put(`${eol}endstream${eol}endobj${eol}`);
    // One row a number: type 1 (at an offset) or 2 (in the object stream, at an index).
    const start = size;
    offsets.set(xref, start);
    const order = [...packed.keys()];
    const rows = [Buffer.from([0, 0, 0, 0, 0, 0xff, 0xff])];
    for (let number = 1; number <= xref; number++) {
      const row = Buffer.alloc(7);
      if (packed.has(number)) {
        row[0] = 2;
        row.writeUInt32BE(objectStream, 1);
        row.writeUInt16BE(order.indexOf(number), 5);
      } else {
        row[0] = 1;
        row.writeUInt32BE(offsets.get(number), 1);
      }
      rows.push(row);
    }
    const table = zlib.deflateSync(Buffer.concat(rows));
    put(`${xref} 0 obj${eol}<< /Type /XRef /Size ${xref + 1} /W [1 4 2] /Filter /FlateDecode ${trailer}`);
    put(` /Length ${table.length} >>${eol}stream\n`);
    put(table);
    put(`${eol}endstream${eol}endobj${eol}startxref${eol}${start}${eol}%%EOF${eol}`);
  } else {
    // Each row of the table is 20 bytes, its line ending included.
    const end = eol === '\r' ? ' \r' : ' \n';
    let table = `xref${eol}0 ${count + 1}${eol}0000000000 65535 f${end}`;
    for (let number = 1; number <= count; number++)
      table += `${String(offsets.get(number)).padStart(10, '0')} 00000 n${end}`;
    put(
      `${table}trailer${eol}<< /Size ${count + 1} ${trailer} >>${eol}startxref${eol}${size}${eol}%%EOF${eol}`,
    );
  }
  if (options.suffix) put(options.suffix);
  return new Uint8Array(Buffer.concat(parts));
}

/**
 * `bytes` with an incremental update appended, as an app that saves only what
 * changed writes it. `changes` maps object numbers to their new bodies (strings
 * with "N 0 R" references, or { dict, data } for a stream); `free` lists the
 * numbers deleted, whose generation goes up by one; `trailer` holds the trailer's
 * entries other than /Size and /Prev.
 */
export function incrementalUpdate(bytes, { changes, free = [], trailer }) {
  const before = Buffer.from(bytes).toString('latin1');
  const previous = Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(before)[1]);
  const lastSize = Number([...before.matchAll(/\/Size (\d+)/g)].at(-1)[1]);
  const parts = [Buffer.from(bytes)];
  let size = bytes.length;
  const put = (chunk) => {
    const buffer = bytesOf(chunk);
    parts.push(buffer);
    size += buffer.length;
  };
  const offsets = new Map();
  for (const [number, body] of [...changes].sort(([a], [b]) => a - b)) {
    offsets.set(number, size);
    put(`${number} 0 obj\n`);
    if (typeof body === 'string') put(body);
    else {
      const data = bytesOf(body.data);
      put(`<< ${body.dict ?? ''} /Length ${data.length} >>\nstream\n`);
      put(data);
      put('\nendstream');
    }
    put('\nendobj\n');
  }
  // The free entries form a list: object 0 points to the first, the last to 0.
  const freed = [...free].sort((a, b) => a - b);
  let table = `xref\n0 1\n${String(freed[0] ?? 0).padStart(10, '0')} 65535 f \n`;
  freed.forEach((number, index) => {
    table += `${number} 1\n${String(freed[index + 1] ?? 0).padStart(10, '0')} 00001 f \n`;
  });
  for (const [number, offset] of offsets)
    table += `${number} 1\n${String(offset).padStart(10, '0')} 00000 n \n`;
  const highest = Math.max(lastSize - 1, ...offsets.keys(), ...freed);
  const start = size;
  put(
    `${table}trailer\n<< /Size ${highest + 1} ${trailer} /Prev ${previous} >>\nstartxref\n${start}\n%%EOF\n`,
  );
  return new Uint8Array(Buffer.concat(parts));
}

// ---- Pieces ------------------------------------------------------------------------------

const helvetica = font('Helvetica');
const times = font('Times-Roman');
const A = [0, 0, 400, 500];
/** Text at the middle of a box, where a crop of a tenth on each side leaves it. */
const text = (words, box, name = 'F1', size = 14) =>
  `BT /${name} ${size} Tf ${(box[0] + box[2]) / 2 - 50} ${(box[1] + box[3]) / 2} Td (${words}) Tj ET`;
/** What a page shows: its texts, its visible box (CropBox within MediaBox) and its turn. */
const page = (texts, box, rotate = 0, more = {}) => ({ texts, box, rotate, ...more });
const kids = (count, prefix = 'p') =>
  Array.from({ length: count }, (_, index) => `@${prefix}${index + 1}`).join(' ');
const labelled = (objects, label) => objects.find(([name]) => name === label);
/** The number pdfFile gives an object. */
const numberOf = (objects, label) => objects.findIndex(([name]) => name === label) + 1;

/** `count` plain pages under the root, each showing `${prefix}-${number}`. */
function plainPages(prefix, count, { box = A, resources = '/Resources << /Font << /F1 @f1 >> >>' } = {}) {
  const objects = [
    ['cat', '<< /Type /Catalog /Pages @root >>'],
    ['root', `<< /Type /Pages /Kids [${kids(count)}] /Count ${count} >>`],
    ['f1', helvetica],
  ];
  const pages = [];
  for (let number = 1; number <= count; number++) {
    objects.push(
      [
        'p' + number,
        `<< /Type /Page /Parent @root /MediaBox [${box.join(' ')}] ${resources} /Contents @c${number} >>`,
      ],
      ['c' + number, { data: text(`${prefix}-${number}`, box) }],
    );
    pages.push(page([`${prefix}-${number}`], box));
  }
  return { objects, pages };
}

// ---- The files ---------------------------------------------------------------------------

/**
 * Twelve pages, each with a line in Helvetica, a line in Times and a square
 * drawn through a graphics state, whose resources are shared: 'parts', each
 * page's own resources point to one /Font, /ExtGState and /XObject dictionary
 * (ReportLab writes fonts so); 'resources', every page points to one resources
 * object; 'inherited', they are on the root of the page tree. Twelve pages, so
 * that a file which grows with the square of its pages shows it in its size.
 */
function sharing(name, prefix, how, count = 12) {
  const parts = '<< /Font @fonts /ExtGState @states /XObject @pictures >>';
  const objects = [
    ['cat', '<< /Type /Catalog /Pages @root >>'],
    [
      'root',
      `<< /Type /Pages /Kids [${kids(count)}] /Count ${count}${how === 'inherited' ? ' /Resources @res' : ''} >>`,
    ],
    ['fonts', '<< /F1 @f1 /F2 @f2 >>'],
    ['res', parts],
    ['f1', helvetica],
    ['f2', times],
    ['states', '<< /G1 @gs >>'],
    ['pictures', '<< /X1 @square >>'],
    ['gs', '<< /Type /ExtGState /ca 0.5 >>'],
    ['square', { dict: '/Type /XObject /Subtype /Form /BBox [0 0 20 20]', data: '0 0 20 20 re f' }],
  ];
  const resources = { parts: `/Resources ${parts}`, resources: '/Resources @res', inherited: '' }[how];
  const pages = [];
  for (let number = 1; number <= count; number++) {
    const marker = `${prefix}-${number}`;
    objects.push(
      [
        'p' + number,
        `<< /Type /Page /Parent @root /MediaBox [0 0 400 500] ${resources} /Contents @c${number} >>`,
      ],
      [
        'c' + number,
        {
          data: `q /G1 gs 1 0 0 1 340 440 cm /X1 Do Q ${text(marker, A)} BT /F2 10 Tf 40 100 Td (serif) Tj ET`,
        },
      ],
    );
    pages.push(page([marker, 'serif'], A, 0, { family: 'sans-serif' }));
  }
  return { name, odd: `${count} pages that share their resources (${how})`, objects, pages };
}

/** Three levels of page tree; size, crop, turn and fonts inherited from different levels, and overridden. */
function nestedTree() {
  const crop = [20, 30, 280, 380];
  return {
    name: 'nested-tree',
    odd: 'a page tree of three levels; MediaBox, CropBox, Rotate and Resources inherited from different levels, with overrides',
    objects: [
      ['cat', '<< /Type /Catalog /Pages @root >>'],
      [
        'root',
        '<< /Type /Pages /Kids [@A @B] /Count 5 /MediaBox [0 0 600 800] /Resources << /Font << /F1 @f1 >> >> >>',
      ],
      [
        'A',
        `<< /Type /Pages /Parent @root /Kids [@p1 @A2] /Count 4 /Rotate 90 /CropBox [${crop.join(' ')}] >>`,
      ],
      [
        'A2',
        '<< /Type /Pages /Parent @A /Kids [@p2 @p3 @p5] /Count 3 /MediaBox [0 0 300 400] /Resources << /Font << /F1 @f2 >> >> >>',
      ],
      ['B', '<< /Type /Pages /Parent @root /Kids [@p4] /Count 1 >>'],
      ['f1', helvetica],
      ['f2', times],
      ['p1', '<< /Type /Page /Parent @A /Contents @c1 >>'],
      ['p2', '<< /Type /Page /Parent @A2 /Contents @c2 >>'],
      ['p3', '<< /Type /Page /Parent @A2 /Rotate 0 /CropBox [0 0 300 400] /Contents @c3 >>'],
      ['p4', '<< /Type /Page /Parent @B /MediaBox [0 0 200 200] /Rotate 180 /Contents @c4 >>'],
      // Its size is A2's alone: its own crop reaches past it on every side, so
      // with the size of the root it would show 510 by 710 points.
      ['p5', '<< /Type /Page /Parent @A2 /Rotate 0 /CropBox [-10 -10 500 700] /Contents @c5 >>'],
      ['c1', { data: text('NT-1', crop) }],
      ['c2', { data: text('NT-2', crop) }],
      ['c3', { data: text('NT-3', [0, 0, 300, 400]) }],
      ['c4', { data: text('NT-4', [0, 0, 200, 200], 'F1', 10) }],
      ['c5', { data: text('NT-5', [0, 0, 300, 400]) }],
    ],
    pages: [
      page(['NT-1'], crop, 90, { family: 'sans-serif' }),
      page(['NT-2'], crop, 90, { family: 'serif' }),
      page(['NT-3'], [0, 0, 300, 400], 0, { family: 'serif' }),
      page(['NT-5'], [0, 0, 300, 400], 0, { family: 'serif' }),
      page(['NT-4'], [0, 0, 200, 200], 180, { family: 'sans-serif' }),
    ],
    signs: [/\/Type \/Pages \/Parent \d+ 0 R/],
  };
}

function noResources() {
  return {
    name: 'no-resources',
    odd: 'a page without Resources (it draws a square), and one with neither Resources nor Contents',
    objects: [
      ['cat', '<< /Type /Catalog /Pages @root >>'],
      ['root', '<< /Type /Pages /Kids [@p1 @p2 @p3] /Count 3 >>'],
      ['p1', '<< /Type /Page /Parent @root /MediaBox [0 0 400 500] /Contents @c1 >>'],
      ['p2', '<< /Type /Page /Parent @root /MediaBox [0 0 400 500] >>'],
      [
        'p3',
        '<< /Type /Page /Parent @root /MediaBox [0 0 400 500] /Resources << /Font << /F1 @f1 >> >> /Contents @c3 >>',
      ],
      ['f1', helvetica],
      ['c1', { data: '0 0 1 rg 100 100 200 200 re f' }],
      ['c3', { data: text('NR-3', A) }],
    ],
    pages: [page([], A), page([], A), page(['NR-3'], A)],
  };
}

function contentsForms() {
  return {
    name: 'contents-forms',
    odd: 'Contents as one stream, as an array that splits one text object, as an empty array, and as one array that two pages share',
    objects: [
      ['cat', '<< /Type /Catalog /Pages @root >>'],
      [
        'root',
        '<< /Type /Pages /Kids [@p1 @p2 @p3 @p4 @p5] /Count 5 /Resources << /Font << /F1 @f1 >> >> /MediaBox [0 0 400 500] >>',
      ],
      ['f1', helvetica],
      ['p1', '<< /Type /Page /Parent @root /Contents @c1 >>'],
      ['p2', '<< /Type /Page /Parent @root /Contents [@c2a @c2b] >>'],
      ['p3', '<< /Type /Page /Parent @root /Contents [] >>'],
      ['p4', '<< /Type /Page /Parent @root /Contents @shared >>'],
      ['p5', '<< /Type /Page /Parent @root /Contents @shared >>'],
      ['shared', '[@c4a @c4b]'],
      ['c1', { data: text('CF-1', A) }],
      ['c2a', { data: 'BT /F1 14 Tf 150 250 Td' }],
      ['c2b', { data: '(CF-2) Tj ET' }],
      ['c4a', { data: 'BT /F1 14 Tf 150 250 Td' }],
      ['c4b', { data: '(CF-SHARED) Tj ET' }],
    ],
    pages: [
      page(['CF-1'], A),
      page(['CF-2'], A),
      page([], A),
      page(['CF-SHARED'], A),
      page(['CF-SHARED'], A),
    ],
  };
}

function kidsTwice() {
  const { objects } = plainPages('KT', 2);
  labelled(objects, 'root')[1] = '<< /Type /Pages /Kids [@p1 @p2 @p1] /Count 3 >>';
  return {
    name: 'kids-twice',
    odd: 'one page object listed twice in the page tree: three pages, of which the first and the third are one',
    signs: [/\/Kids \[(\d+) 0 R \d+ 0 R \1 0 R\]/],
    objects,
    pages: [page(['KT-1'], A), page(['KT-2'], A), page(['KT-1'], A)],
  };
}

function oddBoxes() {
  const boxes = [
    [100, 200, 500, 700],
    [400, 500, 0, 0],
    [0.5, 0.25, 300.75, 400.125],
  ];
  const upright = (box) => [
    Math.min(box[0], box[2]),
    Math.min(box[1], box[3]),
    Math.max(box[0], box[2]),
    Math.max(box[1], box[3]),
  ];
  const objects = [
    ['cat', '<< /Type /Catalog /Pages @root >>'],
    ['root', '<< /Type /Pages /Kids [@p1 @p2 @p3 @p4 @p5] /Count 5 /Resources << /Font << /F1 @f1 >> >> >>'],
    ['f1', helvetica],
    ['box', '[0 0 350 350]'],
  ];
  boxes.forEach((box, index) =>
    objects.push(
      [
        'p' + (index + 1),
        `<< /Type /Page /Parent @root /MediaBox [${box.join(' ')}] /Contents @c${index + 1} >>`,
      ],
      ['c' + (index + 1), { data: text(`OB-${index + 1}`, upright(box)) }],
    ),
  );
  objects.push(
    ['p4', '<< /Type /Page /Parent @root /MediaBox @box /Contents @c4 >>'],
    ['c4', { data: text('OB-4', [0, 0, 350, 350]) }],
    ['p5', '<< /Type /Page /Parent @root /MediaBox [0 0 300 400] /UserUnit 2 /Contents @c5 >>'],
    ['c5', { data: text('OB-5', [0, 0, 300, 400]) }],
  );
  return {
    name: 'odd-boxes',
    odd: 'a MediaBox away from 0 0, one with its corners reversed, one in real numbers, one that is an object of its own, and a page with UserUnit 2',
    signs: [/\/UserUnit 2/, /\/MediaBox \d+ 0 R/],
    objects,
    pages: [
      ...boxes.map((box, index) => page([`OB-${index + 1}`], upright(box))),
      page(['OB-4'], [0, 0, 350, 350]),
      page(['OB-5'], [0, 0, 300, 400], 0, { userUnit: 2 }),
    ],
  };
}

function cropLarger() {
  // Readers differ on a crop that reaches past the media on some sides only:
  // poppler then takes the media's whole width or height, the others the
  // intersection. Where the crop is wider than the media, they agree.
  return {
    name: 'crop-larger',
    odd: 'a CropBox larger than the MediaBox on every side, and one that reaches past it on three sides',
    objects: [
      ['cat', '<< /Type /Catalog /Pages @root >>'],
      ['root', '<< /Type /Pages /Kids [@p1 @p2] /Count 2 /Resources << /Font << /F1 @f1 >> >> >>'],
      ['f1', helvetica],
      [
        'p1',
        '<< /Type /Page /Parent @root /MediaBox [0 0 400 500] /CropBox [-50 -50 450 550] /Contents @c1 >>',
      ],
      [
        'p2',
        '<< /Type /Page /Parent @root /MediaBox [0 0 400 500] /CropBox [-20 -20 420 400] /Contents @c2 >>',
      ],
      ['c1', { data: text('CL-1', A) }],
      ['c2', { data: text('CL-2', [0, 0, 400, 400]) }],
    ],
    pages: [page(['CL-1'], A), page(['CL-2'], [0, 0, 400, 400])],
  };
}

function oddRotate() {
  const turns = [-90, 450, -180, 360];
  const { objects } = plainPages('OR', 4);
  turns.forEach((turn, index) => {
    const entry = labelled(objects, `p${index + 1}`);
    entry[1] = entry[1].replace('/Type /Page', `/Type /Page /Rotate ${turn}`);
  });
  return {
    name: 'odd-rotate',
    odd: 'Rotate -90, 450, -180 and 360',
    objects,
    pages: turns.map((turn, index) => page([`OR-${index + 1}`], A, ((turn % 360) + 360) % 360)),
  };
}

function formPlain() {
  const box = '/Type /XObject /Subtype /Form /BBox [0 0 16 16]';
  return {
    name: 'form-plain',
    odd: 'text fields without appearances, and NeedAppearances; one field with a widget on each of two pages; a radio group',
    objects: [
      ['cat', '<< /Type /Catalog /Pages @root /AcroForm @form >>'],
      [
        'root',
        '<< /Type /Pages /Kids [@p1 @p2] /Count 2 /Resources << /Font << /F1 @f1 >> >> /MediaBox [0 0 400 500] >>',
      ],
      ['f1', helvetica],
      [
        'form',
        '<< /Fields [@name @shared @choice] /NeedAppearances true /DA (/Helv 0 Tf 0 g) /DR << /Font << /Helv @f1 >> >> >>',
      ],
      ['p1', '<< /Type /Page /Parent @root /Contents @c1 /Annots [@name @w1] >>'],
      ['p2', '<< /Type /Page /Parent @root /Contents @c2 /Annots [@w2 @rA @rB] >>'],
      ['c1', { data: text('FP-1', [0, 300, 400, 500]) }],
      ['c2', { data: text('FP-2', [0, 300, 400, 500]) }],
      [
        'name',
        '<< /Type /Annot /Subtype /Widget /FT /Tx /T (name) /V (Ann) /Rect [40 200 240 224] /P @p1 /F 4 /DA (/Helv 12 Tf 0 g) >>',
      ],
      ['shared', '<< /FT /Tx /T (shared) /V (Both) /DA (/Helv 12 Tf 0 g) /Kids [@w1 @w2] >>'],
      ['w1', '<< /Type /Annot /Subtype /Widget /Parent @shared /Rect [40 100 240 124] /P @p1 /F 4 >>'],
      ['w2', '<< /Type /Annot /Subtype /Widget /Parent @shared /Rect [40 100 240 124] /P @p2 /F 4 >>'],
      ['choice', '<< /FT /Btn /Ff 49152 /T (choice) /V /A /Kids [@rA @rB] >>'],
      [
        'rA',
        '<< /Type /Annot /Subtype /Widget /Parent @choice /Rect [40 200 56 216] /P @p2 /F 4 /AS /A /AP << /N << /A @on /Off @off >> >> >>',
      ],
      [
        'rB',
        '<< /Type /Annot /Subtype /Widget /Parent @choice /Rect [80 200 96 216] /P @p2 /F 4 /AS /Off /AP << /N << /B @on2 /Off @off >> >> >>',
      ],
      ['on', { dict: box, data: '0 g 2 2 12 12 re f' }],
      ['on2', { dict: box, data: '0 g 2 2 12 12 re f' }],
      ['off', { dict: box, data: '' }],
    ],
    pages: [page(['FP-1'], A), page(['FP-2'], A)],
    // The values the fields hold, the text drawn for them on each page when
    // flattened, and the values typed in Fill form.
    fields: { name: 'Ann', shared: 'Both', choice: 'A' },
    drawn: [['Ann', 'Both'], ['Both']],
    fill: { name: 'Filled', shared: 'Again', choice: 'B' },
    drawnFilled: [['Filled', 'Again'], ['Again']],
  };
}

function annotsLinks() {
  return {
    name: 'annots-links',
    odd: 'a note that two pages share; a link to a named destination; a link to the last page',
    objects: [
      ['cat', '<< /Type /Catalog /Pages @root /Names << /Dests @dests >> >>'],
      ['dests', '<< /Names [(chapter-two) [@p2 /XYZ 0 500 0]] >>'],
      [
        'root',
        '<< /Type /Pages /Kids [@p1 @p2 @p3] /Count 3 /Resources << /Font << /F1 @f1 >> >> /MediaBox [0 0 400 500] >>',
      ],
      ['f1', helvetica],
      ['p1', '<< /Type /Page /Parent @root /Contents @c1 /Annots [@note @named @tolast] >>'],
      ['p2', '<< /Type /Page /Parent @root /Contents @c2 /Annots [@note] >>'],
      ['p3', '<< /Type /Page /Parent @root /Contents @c3 >>'],
      [
        'note',
        '<< /Type /Annot /Subtype /Text /Rect [10 450 30 470] /Contents (A shared note) /Open false >>',
      ],
      [
        'named',
        '<< /Type /Annot /Subtype /Link /Rect [40 100 200 130] /Border [0 0 0] /Dest (chapter-two) >>',
      ],
      [
        'tolast',
        '<< /Type /Annot /Subtype /Link /Rect [40 50 200 80] /Border [0 0 0] /A << /S /GoTo /D [@p3 /Fit] >> >>',
      ],
      ['c1', { data: text('AL-1', A) }],
      ['c2', { data: text('AL-2', A) }],
      ['c3', { data: text('AL-3', A) }],
    ],
    pages: [page(['AL-1'], A), page(['AL-2'], A), page(['AL-3'], A)],
    // Each page's links, as the indexes of the pages they lead to, and its notes.
    links: [[1, 2], [], []],
    notes: [1, 1, 0],
  };
}

function outlineLabels() {
  const { objects, pages } = plainPages('OL', 4);
  objects[0] = [
    'cat',
    '<< /Type /Catalog /Pages @root /Outlines @outlines /PageMode /UseOutlines /PageLabels << /Nums [0 << /S /r >> 2 << /S /D /St 1 >>] >> >>',
  ];
  objects.push(
    ['outlines', '<< /Type /Outlines /First @o1 /Last @o2 /Count 2 >>'],
    ['o1', '<< /Title (Intro) /Parent @outlines /Next @o2 /Dest [@p1 /Fit] >>'],
    ['o2', '<< /Title (Main part) /Parent @outlines /Prev @o1 /Dest [@p3 /Fit] >>'],
  );
  return {
    name: 'outline-labels',
    odd: 'an outline, and page labels i, ii, 1, 2',
    objects,
    pages,
    outline: [
      { title: 'Intro', page: 0 },
      { title: 'Main part', page: 2 },
    ],
    labels: ['i', 'ii', '1', '2'],
  };
}

function hiddenLayer() {
  const { objects, pages } = plainPages('HL', 2, {
    resources: '/Resources << /Font << /F1 @f1 >> /Properties << /L1 @layer >> >>',
  });
  objects[0] = [
    'cat',
    '<< /Type /Catalog /Pages @root /OCProperties << /OCGs [@layer] /D << /Order [@layer] /OFF [@layer] >> >> >>',
  ];
  objects.push(['layer', '<< /Type /OCG /Name (Secret) >>']);
  for (const label of ['c1', 'c2']) {
    const entry = labelled(objects, label);
    entry[1] = { data: `${entry[1].data} /OC /L1 BDC 1 0 0 rg 20 20 100 100 re f EMC` };
  }
  return {
    name: 'hidden-layer',
    odd: 'a red square in a layer (optional content) that is off',
    objects,
    pages,
    layerHidden: true,
  };
}

function twoRevisions() {
  const { objects, pages } = plainPages('TR', 3);
  objects.push(['info', '<< /Title (First revision) >>']);
  const number = (label) => numberOf(objects, label);
  const contents = objects.length + 1;
  // The second revision: two pages listed, page 2 with new contents, a new title, page 3 deleted.
  const bytes = incrementalUpdate(pdfFile(objects), {
    changes: new Map([
      [number('root'), `<< /Type /Pages /Kids [${number('p1')} 0 R ${number('p2')} 0 R] /Count 2 >>`],
      [
        number('p2'),
        `<< /Type /Page /Parent ${number('root')} 0 R /MediaBox [0 0 400 500] /Resources << /Font << /F1 ${number('f1')} 0 R >> >> /Contents ${contents} 0 R >>`,
      ],
      [number('info'), '<< /Title (Second revision) >>'],
      [contents, { data: text('TR-2B', A) }],
    ]),
    free: [number('p3')],
    trailer: `/Root ${number('cat')} 0 R /Info ${number('info')} 0 R`,
  });
  return {
    name: 'two-revisions',
    odd: 'an incremental update that deletes the last page and replaces page 2 and the title',
    bytes,
    pages: [pages[0], page(['TR-2B'], A)],
    title: 'Second revision',
  };
}

/** One page each: a Type 3 font, a TrueType font neither embedded nor standard, an inline image, turned text. */
function oddContent() {
  const widths = Array.from({ length: 95 }, () => 600).join(' ');
  const resources = (fonts) => `/Resources << /Font << ${fonts} >> >>`;
  const pixels = Buffer.from([0, 64, 128, 192, 64, 128, 192, 0, 128, 192, 0, 64, 192, 0, 64, 128]);
  return {
    name: 'odd-content',
    odd: 'a Type 3 font; a TrueType font that is neither embedded nor one of the standard fourteen; an inline image with binary data; text at 90, -90 and 45 degrees',
    objects: [
      ['cat', '<< /Type /Catalog /Pages @root >>'],
      ['root', '<< /Type /Pages /Kids [@p1 @p2 @p3 @p4] /Count 4 /MediaBox [0 0 400 500] >>'],
      ['f1', helvetica],
      [
        't3',
        '<< /Type /Font /Subtype /Type3 /FontBBox [0 0 1000 1000] /FontMatrix [0.001 0 0 0.001 0 0] /CharProcs << /square @glyph1 /bar @glyph2 >> /Encoding << /Type /Encoding /Differences [65 /square /bar] >> /FirstChar 65 /LastChar 66 /Widths [1000 600] /Resources << >> >>',
      ],
      ['glyph1', { data: '1000 0 0 0 1000 1000 d1 0 0 1000 1000 re f' }],
      ['glyph2', { data: '600 0 0 0 400 1000 d1 0 0 400 1000 re f' }],
      [
        'tt',
        `<< /Type /Font /Subtype /TrueType /BaseFont /Verdana-Bold /FirstChar 32 /LastChar 126 /Widths [${widths}] /Encoding /WinAnsiEncoding /FontDescriptor @descriptor >>`,
      ],
      [
        'descriptor',
        '<< /Type /FontDescriptor /FontName /Verdana-Bold /Flags 32 /FontBBox [-73 -207 1707 1000] /ItalicAngle 0 /Ascent 1005 /Descent -209 /CapHeight 727 /StemV 150 >>',
      ],
      ['p1', `<< /Type /Page /Parent @root ${resources('/F1 @f1 /T3 @t3')} /Contents @c1 >>`],
      ['p2', `<< /Type /Page /Parent @root ${resources('/F1 @tt')} /Contents @c2 >>`],
      ['p3', `<< /Type /Page /Parent @root ${resources('/F1 @f1')} /Contents @c3 >>`],
      ['p4', `<< /Type /Page /Parent @root ${resources('/F1 @f1')} /Contents @c4 >>`],
      ['c1', { data: `${text('OC-1', A)} BT /T3 24 Tf 60 60 Td (ABAB) Tj ET` }],
      ['c2', { data: text('OC-2', A) }],
      [
        'c3',
        {
          data: Buffer.concat([
            latin1(`${text('OC-3', A)} q 80 0 0 80 20 20 cm BI /W 4 /H 4 /CS /G /BPC 8 ID `),
            pixels,
            latin1(' EI Q'),
          ]),
        },
      ],
      [
        'c4',
        {
          // pdftotext drops text at 45 degrees, so that one is not looked for.
          data: 'BT /F1 14 Tf 0 1 -1 0 200 200 Tm (OC-4u) Tj ET BT /F1 14 Tf 0 -1 1 0 220 300 Tm (OC-4d) Tj ET BT /F1 14 Tf 0.7071 0.7071 -0.7071 0.7071 100 100 Tm (diagonal) Tj ET',
        },
      ],
    ],
    pages: [page(['OC-1'], A), page(['OC-2'], A), page(['OC-3'], A), page(['OC-4u', 'OC-4d'], A)],
  };
}

function nestedPictures() {
  const form = (fonts, pictures) =>
    `/Type /XObject /Subtype /Form /BBox [0 0 400 500] /Resources << /Font << ${fonts} >>${pictures ? ` /XObject << ${pictures} >>` : ''} >>`;
  return {
    name: 'nested-xobjects',
    odd: 'form XObjects inside form XObjects, each with its own resources; the pages themselves have no fonts',
    objects: [
      ['cat', '<< /Type /Catalog /Pages @root >>'],
      ['root', '<< /Type /Pages /Kids [@p1 @p2] /Count 2 /MediaBox [0 0 400 500] >>'],
      ['p1', '<< /Type /Page /Parent @root /Resources << /XObject << /X1 @outer1 >> >> /Contents @c >>'],
      ['p2', '<< /Type /Page /Parent @root /Resources << /XObject << /X1 @outer2 >> >> /Contents @c >>'],
      ['c', { data: 'q /X1 Do Q' }],
      [
        'outer1',
        {
          dict: form('/F9 @f2', '/X2 @inner'),
          data: `${text('NX-1', A, 'F9')} q 1 0 0 1 0 -100 cm /X2 Do Q`,
        },
      ],
      [
        'outer2',
        {
          dict: form('/F9 @f2', '/X2 @inner'),
          data: `${text('NX-2', A, 'F9')} q 1 0 0 1 0 -100 cm /X2 Do Q`,
        },
      ],
      ['inner', { dict: form('/F1 @f1'), data: 'BT /F1 10 Tf 150 200 Td (inner) Tj ET' }],
      ['f1', helvetica],
      ['f2', times],
    ],
    pages: [
      page(['NX-1', 'inner'], A, 0, { family: 'serif' }),
      page(['NX-2', 'inner'], A, 0, { family: 'serif' }),
    ],
  };
}

/**
 * The files, each with what PDF.js shows of it: per page, the texts (and the
 * kind of font of the first), the visible box, the turn and the unit; and,
 * where the file has them, links, notes, fields, an outline, page labels, a
 * title and a hidden layer. `signs` are what makes a file odd, as its bytes
 * show it: the writer cannot lose it unnoticed. `bytes` are the file.
 */
export const catalogue = [
  sharing('shared-parts', 'SP', 'parts'),
  sharing('shared-resources', 'SR', 'resources'),
  sharing('inherited-resources', 'IR', 'inherited'),
  nestedTree(),
  noResources(),
  contentsForms(),
  kidsTwice(),
  oddBoxes(),
  cropLarger(),
  oddRotate(),
  formPlain(),
  annotsLinks(),
  outlineLabels(),
  hiddenLayer(),
  {
    ...plainPages('ST', 3),
    name: 'object-streams',
    odd: 'every object that is not a stream inside an object stream, and a cross-reference stream',
    signs: [/\/Type \/ObjStm/, /\/Type \/XRef/],
    options: { objectStreams: true, header: '%PDF-1.5' },
  },
  twoRevisions(),
  {
    ...plainPages('SX', 3),
    name: 'odd-syntax',
    odd: 'CR line endings only, comments after objects, tabs and form feeds between tokens, every stream Length an object written after the stream, and about 500 bytes after the end',
    // A lone CR after "endobj"; a comment after an object's first line, with odd
    // whitespace in it; a Length that is a reference; the bytes after the end.
    signs: [
      /endobj\r(?!\n)/,
      /\d \t\f 0 \t\f obj % \w+\r/,
      /\/Length \d+ 0 R/,
      /%%EOF\r?\n(trailing bytes ){33}\n$/,
    ],
    options: { eol: '\r', comments: true, lengthRef: true, suffix: `\n${'trailing bytes '.repeat(33)}\n` },
  },
  oddContent(),
  nestedPictures(),
].map(({ objects, options, ...entry }) => ({ ...entry, bytes: entry.bytes ?? pdfFile(objects, options) }));
