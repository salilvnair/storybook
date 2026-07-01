/**
 * EPUB 3 export — S41.
 *
 * Generates both:
 *   - Reflowable EPUB3 (accessible, text-reflow)
 *   - Fixed-layout EPUB3 (preserves picture-book spread design)
 *
 * The EPUB is built as a ZIP file (epub is just a ZIP with a specific structure).
 * We use Node's built-in streams — no extra dependencies beyond what's already installed.
 *
 * Output: Buffer containing the EPUB ZIP.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';

// We build the EPUB as files in a temp dir then zip them.
// Simple ZIP builder — avoids needing an npm zip library.

const MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

/**
 * Build an EPUB3 from a story record.
 * @param {{ id:string, title:string, author?:string, scenes:Array<{text:string, says?:string, thinks?:string}> }} story
 * @param {{ storyDir:string, layout?:'reflowable'|'fixed' }} opts
 * @returns {Promise<Buffer>} EPUB file as Buffer
 */
export async function buildEpub(story, opts = {}) {
  const { storyDir, layout = 'reflowable' } = opts;
  const { title, author = 'iStorybook', scenes = [], id } = story;
  const isFixed = layout === 'fixed';
  const uid = `urn:uuid:${id || crypto.randomUUID()}`;
  const lang = story.language || 'en';

  // Collect page images
  const pageImages = [];
  if (storyDir && fs.existsSync(storyDir)) {
    for (let i = 0; i < scenes.length; i++) {
      const imgPath = path.join(storyDir, `page-${i + 1}.png`);
      if (fs.existsSync(imgPath)) {
        pageImages.push({ idx: i, path: imgPath, name: `page-${i + 1}.png` });
      }
    }
    const coverPath = path.join(storyDir, 'cover.png');
    if (fs.existsSync(coverPath)) {
      pageImages.unshift({ idx: -1, path: coverPath, name: 'cover.png', isCover: true });
    }
  }

  // ── Build file tree ──────────────────────────────────────────────────────────
  const files = new Map(); // path → string|Buffer

  // mimetype (must be first, uncompressed)
  files.set('mimetype', 'application/epub+zip');

  // META-INF/container.xml
  files.set('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

  // Build spine items + manifest items
  const spineItems = [];
  const manifestItems = [];

  // Cover page
  if (pageImages.find((p) => p.isCover)) {
    const coverImg = pageImages.find((p) => p.isCover);
    const imgData = fs.readFileSync(coverImg.path);
    files.set(`EPUB/images/cover.png`, imgData);
    manifestItems.push(`<item id="cover-img" href="images/cover.png" media-type="image/png" properties="cover-image"/>`);

    const coverHtml = isFixed ? buildFixedPage('Cover', `<img src="../images/cover.png" alt="Cover" style="width:100%;height:100%;object-fit:contain;"/>`, true)
      : `<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${lang}"><head><meta charset="UTF-8"/><title>Cover</title></head><body><img src="../images/cover.png" alt="Cover" style="max-width:100%;"/></body></html>`;
    files.set('EPUB/xhtml/cover.xhtml', coverHtml);
    manifestItems.push(`<item id="cover-page" href="xhtml/cover.xhtml" media-type="application/xhtml+xml"${isFixed ? ' properties="rendition:layout-pre-paginated rendition:orientation-auto rendition:spread-auto"' : ''}/>`);
    spineItems.push(`<itemref idref="cover-page" properties="rendition:page-spread-center"/>`);
  }

  // Story pages
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const img = pageImages.find((p) => p.idx === i);
    const pageId = `page-${i + 1}`;

    if (img) {
      const imgData = fs.readFileSync(img.path);
      files.set(`EPUB/images/${img.name}`, imgData);
      manifestItems.push(`<item id="img-${pageId}" href="images/${img.name}" media-type="image/png"/>`);
    }

    const textContent = [scene.text, scene.says ? `<p class="says">"${scene.says}"</p>` : '', scene.thinks ? `<p class="thinks"><em>${scene.thinks}</em></p>` : ''].filter(Boolean).join('\n');

    const xhtml = isFixed
      ? buildFixedPage(`Page ${i + 1}`, `
        <div class="spread">
          <div class="text-side"><p>${scene.text || ''}</p>${scene.says ? `<p class="says">"${scene.says}"</p>` : ''}${scene.thinks ? `<p class="thinks"><em>${scene.thinks}</em></p>` : ''}</div>
          ${img ? `<div class="art-side"><img src="../images/${img.name}" alt="Illustration"/></div>` : ''}
        </div>`)
      : `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${lang}">
<head>
  <meta charset="UTF-8"/>
  <title>Page ${i + 1}</title>
  <link rel="stylesheet" href="../css/story.css"/>
</head>
<body>
  ${img ? `<figure><img src="../images/${img.name}" alt="Illustration for page ${i + 1}"/></figure>` : ''}
  <section class="scene">
    <p>${(scene.text || '').replace(/\n/g, '</p><p>')}</p>
    ${scene.says ? `<p class="dialogue">&ldquo;${scene.says}&rdquo;</p>` : ''}
    ${scene.thinks ? `<p class="thought"><em>${scene.thinks}</em></p>` : ''}
  </section>
</body>
</html>`;

    files.set(`EPUB/xhtml/${pageId}.xhtml`, xhtml);
    manifestItems.push(`<item id="${pageId}" href="xhtml/${pageId}.xhtml" media-type="application/xhtml+xml"${isFixed ? ' properties="rendition:layout-pre-paginated"' : ''}/>`);
    spineItems.push(`<itemref idref="${pageId}"/>`);
  }

  // CSS
  const css = `
body { font-family: Georgia, serif; font-size: 1.1em; line-height: 1.6; margin: 1em; color: #2d2d2d; }
figure { text-align: center; margin: 0 0 1em; }
figure img { max-width: 100%; height: auto; border-radius: 8px; }
p { margin: 0 0 0.8em; }
.dialogue { font-style: italic; color: #5c3d2e; border-left: 3px solid #e2956a; padding-left: 0.8em; }
.thought { color: #6b7280; font-style: italic; }
/* Fixed layout */
.spread { display: flex; height: 100vh; }
.text-side { flex: 1; padding: 2em; display: flex; flex-direction: column; justify-content: center; background: #fffdf6; }
.art-side { flex: 1; }
.art-side img { width: 100%; height: 100%; object-fit: cover; }
`;
  files.set('EPUB/css/story.css', css);
  manifestItems.push(`<item id="stylesheet" href="css/story.css" media-type="text/css"/>`);

  // Nav document (required for EPUB3)
  const navXhtml = `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}">
<head><meta charset="UTF-8"/><title>Table of Contents</title></head>
<body>
<nav epub:type="toc" id="toc">
  <h1>Contents</h1>
  <ol>
    ${scenes.map((_, i) => `<li><a href="xhtml/page-${i + 1}.xhtml">Page ${i + 1}</a></li>`).join('\n    ')}
  </ol>
</nav>
</body>
</html>`;
  files.set('EPUB/xhtml/nav.xhtml', navXhtml);
  manifestItems.push(`<item id="nav" href="xhtml/nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`);

  // Package document (OPF)
  const fixedMeta = isFixed ? `
    <meta property="rendition:layout">pre-paginated</meta>
    <meta property="rendition:orientation">auto</meta>
    <meta property="rendition:spread">auto</meta>` : '';

  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="uid" xml:lang="${lang}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">${uid}</dc:identifier>
    <dc:title>${escXml(title)}</dc:title>
    <dc:creator>${escXml(author)}</dc:creator>
    <dc:language>${lang}</dc:language>
    <dc:date>${new Date().toISOString().split('T')[0]}</dc:date>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>${fixedMeta}
  </metadata>
  <manifest>
    ${manifestItems.join('\n    ')}
  </manifest>
  <spine${isFixed ? ' page-progression-direction="ltr"' : ''}>
    ${spineItems.join('\n    ')}
  </spine>
</package>`;
  files.set('EPUB/package.opf', opf);

  // Build ZIP buffer
  return buildZip(files);
}

function escXml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildFixedPage(title, bodyContent, isCover = false) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <meta charset="UTF-8"/>
  <title>${escXml(title)}</title>
  <meta name="viewport" content="width=1200, height=900"/>
  <style>
    html, body { margin: 0; padding: 0; width: 1200px; height: 900px; overflow: hidden; }
    .spread { display: flex; width: 100%; height: 100%; }
    .text-side { flex: 1; padding: 2em; background: #fffdf6; font-family: Georgia, serif; font-size: 1.1em; line-height: 1.7; display: flex; flex-direction: column; justify-content: center; }
    .art-side { flex: 1; }
    .art-side img { width: 100%; height: 100%; object-fit: cover; }
  </style>
</head>
<body epub:type="${isCover ? 'cover' : 'bodymatter chapter'}">
  ${bodyContent}
</body>
</html>`;
}

/** Minimal ZIP builder — no external dependency. Uses Node's zlib. */
async function buildZip(files) {
  const { deflateRawSync } = await import('node:zlib');
  const entries = [];
  let offset = 0;

  function str(s) { return Buffer.from(s, 'utf8'); }
  function uint16le(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; }
  function uint32le(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; }

  function crc32(buf) {
    let crc = 0xFFFFFFFF;
    const table = [];
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[i] = c;
    }
    for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  for (const [filePath, content] of files) {
    const nameBytes = str(filePath);
    const dataRaw = typeof content === 'string' ? str(content) : content;
    const isMimetype = filePath === 'mimetype';
    // mimetype must be stored uncompressed
    const compressed = isMimetype ? dataRaw : deflateRawSync(dataRaw, { level: 6 });
    const useCompressed = !isMimetype && compressed.length < dataRaw.length;
    const fileData = useCompressed ? compressed : dataRaw;
    const method = useCompressed ? 8 : 0;
    const crc = crc32(dataRaw);

    const localHeader = Buffer.concat([
      str('PK\x03\x04'),
      uint16le(20), // version needed
      uint16le(0),  // flags
      uint16le(method),
      uint16le(0), uint16le(0), // mod time/date
      uint32le(crc),
      uint32le(fileData.length),
      uint32le(dataRaw.length),
      uint16le(nameBytes.length),
      uint16le(0), // extra length
      nameBytes,
    ]);

    entries.push({ localHeader, fileData, nameBytes, crc, compressedSize: fileData.length, uncompressedSize: dataRaw.length, method, offset });
    offset += localHeader.length + fileData.length;
  }

  // Central directory
  const centralDirs = entries.map((e) => Buffer.concat([
    str('PK\x01\x02'),
    uint16le(20), uint16le(20),
    uint16le(0), uint16le(e.method),
    uint16le(0), uint16le(0),
    uint32le(e.crc),
    uint32le(e.compressedSize),
    uint32le(e.uncompressedSize),
    uint16le(e.nameBytes.length),
    uint16le(0), uint16le(0), uint16le(0), uint16le(0),
    uint32le(0),
    uint32le(e.offset),
    e.nameBytes,
  ]));

  const centralDir = Buffer.concat(centralDirs);
  const eocd = Buffer.concat([
    str('PK\x05\x06'),
    uint16le(0), uint16le(0),
    uint16le(entries.length), uint16le(entries.length),
    uint32le(centralDir.length),
    uint32le(offset),
    uint16le(0),
  ]);

  return Buffer.concat([
    ...entries.map((e) => Buffer.concat([e.localHeader, e.fileData])),
    centralDir,
    eocd,
  ]);
}
