/**
 * PDF builder — renders a story into a classic picture-book layout, modelled on
 * board books like "I Love You Like No Otter":
 *
 *   • Every interior page is a LANDSCAPE SPREAD (2:1).
 *       - LEFT half  : a solid warm colour + soft glow + a cream "text card" with
 *                      a decorative frame holding 1–2 short centred serif lines and
 *                      one coloured emphasis line (the spoken bit).
 *       - RIGHT half : a full-bleed SQUARE illustration.
 *   • Cover : the square illustration full-bleed with the title on a soft panel.
 *
 * Images are square (1:1) so they fill the right half edge-to-edge.
 * Uses pdf-lib; text is ASCII-sanitised for the WinAnsi/Latin-1 standard fonts.
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/** Sanitize text for pdf-lib's Latin-1 (WinAnsi) fonts. */
function pdfText(str) {
  return String(str ?? '')
    .replace(/[‘’ʼ′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/…/g, '...')
    .replace(/—/g, '--')
    .replace(/–/g, '-')
    .replace(/[   ]/g, ' ')
    .replace(/[•‣◦]/g, '*')
    .replace(/[✓✔]/g, 'v')
    .replace(/[^\x00-\xFF]/g, '?');
}

// Half-square side per page size (the page is twice this wide).
const HALVES = { A4: 595.28, Letter: 612, A5: 480 };

// Warm storybook palette for the left (text) page — cycled per scene.
const PAGE_PALETTE = [
  { bg: rgb(0.99, 0.84, 0.33) }, // butter yellow
  { bg: rgb(0.96, 0.75, 0.42) }, // amber gold
  { bg: rgb(0.97, 0.80, 0.84) }, // blush pink
  { bg: rgb(0.99, 0.85, 0.70) }, // peach
  { bg: rgb(0.81, 0.87, 0.75) }, // sage green
  { bg: rgb(0.88, 0.83, 0.93) }, // lavender
  { bg: rgb(0.98, 0.78, 0.72) }, // soft coral
  { bg: rgb(0.80, 0.90, 0.86) }, // mint
];

const CARD_CREAM = rgb(1.0, 0.99, 0.92);
const INK = rgb(0.18, 0.14, 0.16);
const EMPHASIS = rgb(0.74, 0.12, 0.12); // warm red for the spoken line
const FRAME = rgb(0.45, 0.32, 0.22); // doodle-frame brown

/** SVG path 'd' for a rounded rectangle, y-down, origin at top-left (0,0). */
function roundedRectPath(w, h, r) {
  return [
    `M ${r} 0`,
    `H ${w - r}`,
    `A ${r} ${r} 0 0 1 ${w} ${r}`,
    `V ${h - r}`,
    `A ${r} ${r} 0 0 1 ${w - r} ${h}`,
    `H ${r}`,
    `A ${r} ${r} 0 0 1 0 ${h - r}`,
    `V ${r}`,
    `A ${r} ${r} 0 0 1 ${r} 0`,
    'Z',
  ].join(' ');
}

export async function buildStorybookPdf(story, sceneImages = [], coverImage = '', opts = {}) {
  const half = HALVES[opts.pageSize] || HALVES.A4;
  const H = half; // page height + right square side
  const W = half * 2; // spread width

  const pdf = await PDFDocument.create();
  pdf.setTitle(story.title || 'Storybook');
  if (story.author) pdf.setAuthor(story.author);
  pdf.setCreator('Storybook — by salilvnair');

  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const serifItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);

  const embed = async (b64) => {
    if (!b64) return null;
    try {
      const bytes = Buffer.from(String(b64).replace(/^data:image\/\w+;base64,/, ''), 'base64');
      try { return await pdf.embedPng(bytes); } catch { return await pdf.embedJpg(bytes); }
    } catch { return null; }
  };

  /** Fill a square H×H region at xLeft with an image (cover-fit, centred, clipped via scaleToFit). */
  const drawSquareImage = (page, img, xLeft, fallbackColor) => {
    if (!img) {
      page.drawRectangle({ x: xLeft, y: 0, width: H, height: H, color: fallbackColor });
      const msg = 'illustration';
      page.drawText(msg, {
        x: xLeft + H / 2 - serif.widthOfTextAtSize(msg, 13) / 2,
        y: H / 2, font: serif, size: 13, color: rgb(0.6, 0.55, 0.5),
      });
      return;
    }
    // Cover-fill the square: scale so the smaller side covers H, centre-crop overflow.
    const iw = img.width;
    const ih = img.height;
    const scale = Math.max(H / iw, H / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    page.drawImage(img, { x: xLeft + (H - dw) / 2, y: (H - dh) / 2, width: dw, height: dh });
  };

  /** Wrap text into lines that fit maxW. */
  const wrap = (text, font, size, maxW) => {
    const words = pdfText(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) > maxW && line) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
    return lines;
  };

  // ── Cover ── square page, full-bleed art with the title on a soft panel ──────
  {
    const page = pdf.addPage([H, H]);
    const accent = PAGE_PALETTE[0].bg;
    const coverImg = await embed(coverImage);
    drawSquareImage(page, coverImg, 0, accent); // fills the whole square page

    // Title panel across the lower portion.
    const panelW = H * 0.84;
    const panelH = H * 0.22;
    const panelX = (H - panelW) / 2;
    const panelY = H * 0.08;
    page.drawSvgPath(roundedRectPath(panelW, panelH, 20), {
      x: panelX, y: panelY + panelH, color: rgb(0, 0, 0), opacity: 0.42,
    });
    const title = pdfText(story.title || 'My Storybook');
    let tSize = 34;
    while (serifBold.widthOfTextAtSize(title, tSize) > panelW - 50 && tSize > 14) tSize -= 1;
    page.drawText(title, {
      x: panelX + (panelW - serifBold.widthOfTextAtSize(title, tSize)) / 2,
      y: panelY + panelH * 0.52,
      font: serifBold, size: tSize, color: rgb(1, 1, 1),
    });
    if (story.author) {
      const a = pdfText(story.author);
      const aSize = 14;
      page.drawText(a, {
        x: panelX + (panelW - serifItalic.widthOfTextAtSize(a, aSize)) / 2,
        y: panelY + panelH * 0.2, font: serifItalic, size: aSize, color: rgb(0.96, 0.94, 0.9),
      });
    }
  }

  // ── Interior spreads ─────────────────────────────────────────────────────────
  const scenes = story.scenes || [];
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const page = pdf.addPage([W, H]);
    const accent = PAGE_PALETTE[i % PAGE_PALETTE.length].bg;

    // LEFT page — solid colour
    page.drawRectangle({ x: 0, y: 0, width: H, height: H, color: accent });

    // Soft glow halo behind the card
    page.drawEllipse({ x: H / 2, y: H / 2, xScale: H * 0.42, yScale: H * 0.30, color: rgb(1, 1, 1), opacity: 0.18 });

    // RIGHT page — full-bleed square illustration
    const sceneImg = await embed(sceneImages[i]);
    drawSquareImage(page, sceneImg, H, accent);

    // ── Text card ──────────────────────────────────────────────────────────────
    const cardW = H * 0.74;
    const cardH = H * 0.44;
    const cardX = (H - cardW) / 2;
    const cardY = (H - cardH) / 2;
    const radius = 14;
    // Cream fill
    page.drawSvgPath(roundedRectPath(cardW, cardH, radius), { x: cardX, y: cardY + cardH, color: CARD_CREAM });
    // Outer + inner decorative frame
    page.drawSvgPath(roundedRectPath(cardW, cardH, radius), {
      x: cardX, y: cardY + cardH, borderColor: FRAME, borderWidth: 1.6, opacity: 0,
    });
    const pad = 12;
    page.drawSvgPath(roundedRectPath(cardW - pad * 2, cardH - pad * 2, radius - 4), {
      x: cardX + pad, y: cardY + cardH - pad, borderColor: FRAME, borderWidth: 0.7, opacity: 0,
    });

    // Card text — narration (centred serif) + spoken line (coloured), vertically centred
    const innerW = cardW - 48;
    const cx = cardX + cardW / 2;
    const bodySize = scene.narration && scene.narration.length > 70 ? 15 : 18;
    const bodyLh = bodySize * 1.45;
    const sayLines = scene.says ? wrap(`"${scene.says}"`, serifBold, bodySize - 1, innerW) : [];
    const bodyLines = wrap(scene.narration || scene.title || '', serif, bodySize, innerW);

    const blockH = bodyLines.length * bodyLh + (sayLines.length ? sayLines.length * (bodyLh - 1) + 8 : 0);
    let y = cardY + cardH / 2 + blockH / 2 - bodySize;

    for (const line of bodyLines) {
      const w = serif.widthOfTextAtSize(line, bodySize);
      page.drawText(line, { x: cx - w / 2, y, font: serif, size: bodySize, color: INK });
      y -= bodyLh;
    }
    if (sayLines.length) {
      y -= 8;
      for (const line of sayLines) {
        const w = serifBold.widthOfTextAtSize(line, bodySize - 1);
        page.drawText(line, { x: cx - w / 2, y, font: serifBold, size: bodySize - 1, color: EMPHASIS });
        y -= bodyLh - 1;
      }
    }

    // Tiny page number, bottom-left of the colour page
    page.drawText(String(i + 1), { x: 18, y: 14, font: serif, size: 10, color: rgb(0.45, 0.4, 0.35) });
  }

  return pdf.save();
}
