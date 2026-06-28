/**
 * Template-driven PDF renderer (Sprint 4 engine kick-off).
 *
 * Generalises the hard-coded pdf.js: it reads a Template Spec and renders the
 * book accordingly — page kind (spread|single), aspect, which side the text sits,
 * the palette, the card/frame/emphasis colours, the glow. The hard-coded
 * "otter" layout is just the default spec (see DEFAULT_TEMPLATE).
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export const DEFAULT_TEMPLATE = {
  name: 'Classic board-book spread',
  pageKind: 'spread',          // spread | single
  aspect: '2:1',               // 2:1 | 3:2 | 1:1
  textSide: 'left',            // left | right
  imageAspect: '1:1',
  glow: true,
  palette: ['#FCD653', '#F5BF6B', '#F7CCD7', '#FCD9B3', '#CFE0BF', '#E1D2EC', '#FAC7B7', '#CCE6DC'],
  cardColor: '#FFFDED',
  frameColor: '#73523A',
  emphasisColor: '#BC1F1F',
  inkColor: '#2E2426',
  cardRect: { x: 0.13, y: 0.28, w: 0.74, h: 0.44 },
};

function hex(c) {
  const m = String(c).replace('#', '');
  const n = parseInt(m.length === 3 ? m.split('').map((x) => x + x).join('') : m, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
function pdfText(str) {
  return String(str ?? '')
    .replace(/[‘’ʼ′]/g, "'").replace(/[“”″]/g, '"')
    .replace(/…/g, '...').replace(/—/g, '--').replace(/–/g, '-')
    .replace(/[   ]/g, ' ').replace(/[•‣◦]/g, '*').replace(/[✓✔]/g, 'v')
    .replace(/[^\x00-\xFF]/g, '?');
}
function roundedRectPath(w, h, r) {
  return [`M ${r} 0`, `H ${w - r}`, `A ${r} ${r} 0 0 1 ${w} ${r}`, `V ${h - r}`,
    `A ${r} ${r} 0 0 1 ${w - r} ${h}`, `H ${r}`, `A ${r} ${r} 0 0 1 0 ${h - r}`,
    `V ${r}`, `A ${r} ${r} 0 0 1 ${r} 0`, 'Z'].join(' ');
}

const HALVES = { A4: 595.28, Letter: 612, A5: 480 };

export async function buildFromTemplate(spec, story, sceneImages = [], coverImage = '', opts = {}) {
  const t = { ...DEFAULT_TEMPLATE, ...(spec || {}) };
  const half = HALVES[opts.pageSize] || HALVES.A4;
  const H = half;
  const isSpread = t.pageKind === 'spread';
  const W = isSpread ? half * 2 : half;
  const textLeft = t.textSide !== 'right';

  const pdf = await PDFDocument.create();
  pdf.setTitle(story.title || 'Storybook');
  if (story.author) pdf.setAuthor(story.author);

  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const serifItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const ink = hex(t.inkColor);
  const emphasis = hex(t.emphasisColor);
  const card = hex(t.cardColor);
  const frame = hex(t.frameColor);

  const embed = async (b64) => {
    if (!b64) return null;
    try {
      const bytes = Buffer.from(String(b64).replace(/^data:image\/\w+;base64,/, ''), 'base64');
      try { return await pdf.embedPng(bytes); } catch { return await pdf.embedJpg(bytes); }
    } catch { return null; }
  };
  const drawSquare = (page, img, x, side, fallback) => {
    if (!img) { page.drawRectangle({ x, y: 0, width: side, height: side, color: fallback }); return; }
    const s = Math.max(side / img.width, side / img.height);
    const dw = img.width * s, dh = img.height * s;
    page.drawImage(img, { x: x + (side - dw) / 2, y: (side - dh) / 2, width: dw, height: dh });
  };
  const wrap = (text, font, size, maxW) => {
    const words = pdfText(text).split(/\s+/).filter(Boolean);
    const lines = []; let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) > maxW && line) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
    return lines;
  };

  // ── Cover (square page, full-bleed art + title panel) ───────────────────────
  {
    const page = pdf.addPage([H, H]);
    drawSquare(page, await embed(coverImage), 0, H, hex(t.palette[0]));
    const pw = H * 0.84, ph = H * 0.22, px = (H - pw) / 2, py = H * 0.08;
    page.drawSvgPath(roundedRectPath(pw, ph, 20), { x: px, y: py + ph, color: rgb(0, 0, 0), opacity: 0.42 });
    const title = pdfText(story.title || 'My Storybook');
    let ts = 34; while (serifBold.widthOfTextAtSize(title, ts) > pw - 50 && ts > 14) ts -= 1;
    page.drawText(title, { x: px + (pw - serifBold.widthOfTextAtSize(title, ts)) / 2, y: py + ph * 0.52, font: serifBold, size: ts, color: rgb(1, 1, 1) });
    if (story.author) {
      const a = pdfText(story.author);
      page.drawText(a, { x: px + (pw - serifItalic.widthOfTextAtSize(a, 14)) / 2, y: py + ph * 0.2, font: serifItalic, size: 14, color: rgb(0.96, 0.94, 0.9) });
    }
  }

  // ── Scene pages ──────────────────────────────────────────────────────────────
  const scenes = story.scenes || [];
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const page = pdf.addPage([W, H]);
    const accent = hex(t.palette[i % t.palette.length]);
    const img = await embed(sceneImages[i]);

    if (!isSpread) {
      // ── Image page (full-bleed) ──────────────────────────────────────────────
      drawSquare(page, img, 0, W, accent);

      // ── Text page ────────────────────────────────────────────────────────────
      const textPage = pdf.addPage([W, H]);
      textPage.drawRectangle({ x: 0, y: 0, width: W, height: H, color: accent });
      if (t.glow) textPage.drawEllipse({ x: W / 2, y: H / 2, xScale: W * 0.45, yScale: H * 0.35, color: rgb(1, 1, 1), opacity: 0.15 });

      const cardW = W * 0.80, cardH = H * 0.60;
      const cardX = (W - cardW) / 2;
      const cardY = (H - cardH) / 2;
      textPage.drawSvgPath(roundedRectPath(cardW, cardH, 18), { x: cardX, y: cardY + cardH, color: card });
      textPage.drawSvgPath(roundedRectPath(cardW, cardH, 18), { x: cardX, y: cardY + cardH, borderColor: frame, borderWidth: 1.6, opacity: 0 });

      // Scene number
      textPage.drawText(String(i + 1), { x: cardX + 16, y: cardY + 14, font: serif, size: 10, color: hex(t.palette[(i + 2) % t.palette.length]) });

      // Title
      const titleText = pdfText(scene.title || '');
      if (titleText) {
        const titleLines = wrap(titleText, serifBold, 17, cardW - 56);
        let ty = cardY + cardH - 36;
        for (const line of titleLines) {
          textPage.drawText(line, { x: cardX + (cardW - serifBold.widthOfTextAtSize(line, 17)) / 2, y: ty, font: serifBold, size: 17, color: ink });
          ty -= 22;
        }
      }

      // Narration body
      const bodySize = (scene.narration && scene.narration.length > 120) ? 14 : 16;
      const lh = bodySize * 1.5;
      const bodyLines = wrap(scene.narration || '', serif, bodySize, cardW - 56);
      const blockH = bodyLines.length * lh;
      let by = cardY + cardH / 2 + blockH / 2 - bodySize;
      for (const line of bodyLines) {
        textPage.drawText(line, { x: cardX + (cardW - serif.widthOfTextAtSize(line, bodySize)) / 2, y: by, font: serif, size: bodySize, color: ink });
        by -= lh;
      }

      // Says / dialogue
      if (scene.says) {
        const sayLines = wrap(`"${scene.says}"`, serifBold, bodySize - 1, cardW - 56);
        by -= 6;
        for (const line of sayLines) {
          textPage.drawText(line, { x: cardX + (cardW - serifBold.widthOfTextAtSize(line, bodySize - 1)) / 2, y: by, font: serifBold, size: bodySize - 1, color: emphasis });
          by -= lh - 2;
        }
      }
      continue;
    }

    // Spread: colour text page + square art page.
    const textX = textLeft ? 0 : H;
    const imgX = textLeft ? H : 0;
    page.drawRectangle({ x: textX, y: 0, width: H, height: H, color: accent });
    if (t.glow) page.drawEllipse({ x: textX + H / 2, y: H / 2, xScale: H * 0.42, yScale: H * 0.3, color: rgb(1, 1, 1), opacity: 0.18 });
    drawSquare(page, img, imgX, H, accent);

    // Card position/size from the spec's cardRect (0–1 fractions of the square text page).
    const rect = t.cardRect || { x: 0.13, y: 0.28, w: 0.74, h: 0.44 };
    const cardW = rect.w * H, cardH = rect.h * H;
    const cardX = textX + rect.x * H;
    const cardY = H * (1 - rect.y - rect.h); // pdf y is bottom-up; rect.y is from the top
    page.drawSvgPath(roundedRectPath(cardW, cardH, 14), { x: cardX, y: cardY + cardH, color: card });
    page.drawSvgPath(roundedRectPath(cardW, cardH, 14), { x: cardX, y: cardY + cardH, borderColor: frame, borderWidth: 1.6, opacity: 0 });
    page.drawSvgPath(roundedRectPath(cardW - 24, cardH - 24, 10), { x: cardX + 12, y: cardY + cardH - 12, borderColor: frame, borderWidth: 0.7, opacity: 0 });

    const innerW = cardW - 48, cx = cardX + cardW / 2;
    const bodySize = (scene.narration && scene.narration.length > 70) ? 15 : 18;
    const lh = bodySize * 1.45;
    const bodyLines = wrap(scene.narration || scene.title || '', serif, bodySize, innerW);
    const sayLines = scene.says ? wrap(`"${scene.says}"`, serifBold, bodySize - 1, innerW) : [];
    const blockH = bodyLines.length * lh + (sayLines.length ? sayLines.length * (lh - 1) + 8 : 0);
    let y = cardY + cardH / 2 + blockH / 2 - bodySize;
    for (const line of bodyLines) {
      page.drawText(line, { x: cx - serif.widthOfTextAtSize(line, bodySize) / 2, y, font: serif, size: bodySize, color: ink });
      y -= lh;
    }
    if (sayLines.length) {
      y -= 8;
      for (const line of sayLines) {
        page.drawText(line, { x: cx - serifBold.widthOfTextAtSize(line, bodySize - 1) / 2, y, font: serifBold, size: bodySize - 1, color: emphasis });
        y -= lh - 1;
      }
    }
    page.drawText(String(i + 1), { x: textX + 18, y: 14, font: serif, size: 10, color: rgb(0.45, 0.4, 0.35) });
  }

  return pdf.save();
}
