/**
 * Offline storybook-layout test harness.
 *
 * Builds a PDF with the real picture-book layout using SOLID-COLOUR square
 * images (so you can clearly see image placement) — no LLM or RunPod needed.
 * Open the output and check it against the alignment checklist in
 * plan/tests/sprint2/tests.md.
 *
 *   node server/test/render-sample-pdf.mjs
 *   → writes server/output/sample-layout.pdf
 */
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStorybookPdf } from '../services/pdf.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', 'output');

// ── Minimal solid-colour RGB PNG builder (so images are visible) ──────────────
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function makePng(size, [r, g, b]) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit truecolor
  const row = Buffer.alloc(1 + size * 3);
  for (let x = 0; x < size; x++) { row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = b; }
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}

const cover = makePng(64, [120, 170, 210]);
const sceneImages = [[210, 150, 90], [150, 190, 130], [200, 130, 160], [180, 160, 210], [220, 180, 100]].map(makePng.bind(null, 64));

const story = {
  title: 'The Brave Little Turtle',
  author: 'A Storybook Buddy Tale',
  style: 'cartoon',
  scenes: [
    { index: 1, title: 'A Tiny Turtle', narration: 'Tilly the turtle was very small. But her heart was very big.', says: 'I can do it!' },
    { index: 2, title: 'The Big Pond', narration: 'The pond looked deep and wide today.', says: 'Whoa, so big!' },
    { index: 3, title: 'A Splash', narration: 'Tilly took a deep breath and jumped right in.', says: 'Here I go!' },
    { index: 4, title: 'Swimming', narration: 'Her little legs paddled fast. She was swimming!', says: 'I am doing it!' },
    { index: 5, title: 'Brave Tilly', narration: 'Tilly learned that brave means trying, even when you are scared.', says: 'I am brave!' },
  ],
};

const bytes = await buildStorybookPdf(story, sceneImages, cover);
fs.mkdirSync(OUT_DIR, { recursive: true });
const out = path.join(OUT_DIR, 'sample-layout.pdf');
fs.writeFileSync(out, Buffer.from(bytes));
console.log(`OK → ${out} (${bytes.length} bytes, ${story.scenes.length + 1} pages)`);
