import {
  buildPicoRecoveryCardScanTransport,
  picoRecoveryCardScanPrefix,
} from '@pico/protocol';
import { picoDisplayDate } from '@pico/protocol/when-display';
import type { PicoVaultRecoveryCard } from '@pico/vault';
import {
  assertPicoRecoveryCard,
  assertPicoRecoveryCardContent,
  picoRecoveryCardContent,
  type PicoRecoveryCardContent,
} from './recovery-card-content.js';
import {
  degrees,
  PDFDocument,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import QRCode, { type QRCodeErrorCorrectionLevel } from 'qrcode';
import {
  picoRecoveryCardDesign,
  type PicoRecoveryCardDesign,
} from './recovery-card-design.js';

const POINTS_PER_MM = 72 / 25.4;

/**
 * ADR 0132 G2. Kept as an export because callers and tests read it, and now
 * derived from the design rather than declared beside it - two copies of the
 * card's dimensions would be two places for them to disagree.
 */
export const PICO_RECOVERY_CARD_PDF_LAYOUT = picoRecoveryCardDesign.geometry;

/**
 * The transport contract itself is protocol, not presentation: the scanning
 * side must not import the PDF writer to know what it is reading.
 */
export const PICO_RECOVERY_CARD_QR_PREFIX = picoRecoveryCardScanPrefix;

export interface PicoRecoveryCardPdfOptions {
  /**
   * Adds a conspicuous watermark to non-secret test/example output. Production
   * cards omit it; callers must opt in explicitly.
   */
  specimen?: boolean;
}

export interface PicoRecoveryCardPdfs {
  cardPrinterPdf: Uint8Array;
  paperPrintablePdf: Uint8Array;
}

export interface PicoRecoveryCardQrMatrix {
  size: number;
  data: Uint8Array;
  payload: Uint8Array;
}

/**
 * The canonical bytes travel in a fixed ASCII/base64url transport so commodity
 * Linux camera and USB scanners can return them to Electron Main without a
 * browser renderer ever receiving the secret QR result. The transport is not a
 * second serialization: it wraps the same canonical bytes.
 */
export function picoRecoveryCardQrPayload(
  card: PicoVaultRecoveryCard,
): Uint8Array {
  assertPicoRecoveryCard(card);
  return new TextEncoder().encode(
    buildPicoRecoveryCardScanTransport(hexToBytes(card.canonicalPayloadHex)),
  );
}

export function createPicoRecoveryCardQrMatrix(
  card: PicoVaultRecoveryCard,
): PicoRecoveryCardQrMatrix {
  return picoRecoveryCardQrMatrixFor(picoRecoveryCardContent(card));
}

/**
 * ADR 0132 G1. The matrix is built from the **content's** bytes, so what is
 * printed and what is scanned are the same array rather than two derivations
 * that happen to agree today.
 */
function picoRecoveryCardQrMatrixFor(
  content: PicoRecoveryCardContent,
): PicoRecoveryCardQrMatrix {
  const payload = content.qrPayload;
  const code = QRCode.create(
    [{ data: Buffer.from(payload), mode: 'byte' }],
    {
      errorCorrectionLevel:
        PICO_RECOVERY_CARD_PDF_LAYOUT
          .qrErrorCorrectionLevel as QRCodeErrorCorrectionLevel,
    },
  );
  return {
    size: code.modules.size,
    data: new Uint8Array(code.modules.data),
    payload,
  };
}

/**
 * Generates both normative print forms from one validated card object:
 *
 * - two exact ID-1 pages for a duplex card printer;
 * - one A4 sheet with the same faces at 98%, sharing a fold edge, with the
 *   lower face rotated by 180 degrees for outward-facing lamination.
 *
 * No PIN parameter exists at this layer, so it cannot be printed, embedded as
 * PDF metadata or accidentally retained alongside the card.
 */
export async function generatePicoRecoveryCardPdfs(
  card: PicoVaultRecoveryCard,
  options: PicoRecoveryCardPdfOptions = {},
): Promise<PicoRecoveryCardPdfs> {
  const content = picoRecoveryCardContent(card);
  // ADR 0132 G5. The last thing checked is the thing that gets laid on paper.
  assertPicoRecoveryCardContent(content, card);
  const design = picoRecoveryCardDesign;
  const cardDocument = await createCardPrinterDocument(content, design, options);
  const cardPrinterPdf = await cardDocument.save({
    addDefaultPage: false,
    useObjectStreams: false,
  });
  const paperDocument = await createPaperPrintableDocument(
    cardPrinterPdf,
    design,
    content.issuedAt,
  );
  const paperPrintablePdf = await paperDocument.save({
    addDefaultPage: false,
    useObjectStreams: false,
  });
  return { cardPrinterPdf, paperPrintablePdf };
}

async function createCardPrinterDocument(
  content: PicoRecoveryCardContent,
  design: PicoRecoveryCardDesign,
  options: PicoRecoveryCardPdfOptions,
): Promise<PDFDocument> {
  const document = await PDFDocument.create();
  setStableMetadata(document, design, content.issuedAt);
  // ADR 0132 G2. The names come from the design; resolving them here is what
  // keeps a caller from handing the generator a font object it did not choose.
  const regular = await document.embedFont(standardFont(design.fonts.regular));
  const bold = await document.embedFont(standardFont(design.fonts.bold));
  const mono = await document.embedFont(standardFont(design.fonts.mono));
  const front = document.addPage([
    PICO_RECOVERY_CARD_PDF_LAYOUT.cardWidthPt,
    PICO_RECOVERY_CARD_PDF_LAYOUT.cardHeightPt,
  ]);
  const back = document.addPage([
    PICO_RECOVERY_CARD_PDF_LAYOUT.cardWidthPt,
    PICO_RECOVERY_CARD_PDF_LAYOUT.cardHeightPt,
  ]);
  drawFront(front, content, design, regular, bold, mono);
  drawBack(back, content, design, regular, bold, mono);
  if (options.specimen === true) {
    drawSpecimen(front, design, bold);
    drawSpecimen(back, design, bold);
  }
  return document;
}

async function createPaperPrintableDocument(
  cardPrinterPdf: Uint8Array,
  design: PicoRecoveryCardDesign,
  issuedAt: string,
): Promise<PDFDocument> {
  const document = await PDFDocument.create();
  setStableMetadata(document, design, issuedAt);
  const regular = await document.embedFont(standardFont(design.fonts.regular));
  const bold = await document.embedFont(standardFont(design.fonts.bold));
  const [front, back] = await document.embedPdf(cardPrinterPdf, [0, 1]);
  const page = document.addPage([
    PICO_RECOVERY_CARD_PDF_LAYOUT.paperWidthPt,
    PICO_RECOVERY_CARD_PDF_LAYOUT.paperHeightPt,
  ]);
  const width =
    PICO_RECOVERY_CARD_PDF_LAYOUT.cardWidthPt
    * PICO_RECOVERY_CARD_PDF_LAYOUT.paperCardScale;
  const height =
    PICO_RECOVERY_CARD_PDF_LAYOUT.cardHeightPt
    * PICO_RECOVERY_CARD_PDF_LAYOUT.paperCardScale;
  const left = (page.getWidth() - width) / 2;
  const foldY = page.getHeight() / 2;

  page.drawText(design.labels.sheetTitle, {
    x: left,
    y: foldY + height + mm(14),
    font: bold,
    size: 13,
    color: NAVY,
  });
  page.drawText(
    design.labels.sheetScaleNotice,
    {
      x: left,
      y: foldY + height + mm(8),
      font: regular,
      size: 8,
      color: SLATE,
    },
  );
  page.drawText(
    design.labels.sheetFoldNotice,
    {
      x: left,
      y: foldY + height + mm(4.5),
      font: regular,
      size: 8,
      color: SLATE,
    },
  );

  page.drawPage(front, { x: left, y: foldY, width, height });
  // With a 180-degree transform the anchor is the upper-right point. This
  // places the back exactly below the fold line without a gap or overlap.
  page.drawPage(back, {
    x: left + width,
    y: foldY,
    width,
    height,
    rotate: degrees(180),
  });
  page.drawLine({
    start: { x: left - mm(8), y: foldY },
    end: { x: left + width + mm(8), y: foldY },
    thickness: 0.4,
    color: SLATE,
    dashArray: [2, 2],
  });
  drawCropMarks(page, left, foldY - height, width, height * 2);
  page.drawText(
    `Endformat: ${(85.6 * PICO_RECOVERY_CARD_PDF_LAYOUT.paperCardScale)
      .toFixed(2)} x ${(53.98 * PICO_RECOVERY_CARD_PDF_LAYOUT.paperCardScale)
      .toFixed(2)} mm je Seite`,
    {
      x: left,
      y: foldY - height - mm(12),
      font: regular,
      size: 7,
      color: SLATE,
    },
  );
  return document;
}

function drawFront(
  page: PDFPage,
  payload: PicoRecoveryCardContent,
  design: PicoRecoveryCardDesign,
  regular: PDFFont,
  bold: PDFFont,
  mono: PDFFont,
): void {
  const width = page.getWidth();
  const height = page.getHeight();
  page.drawRectangle({
    x: 0,
    y: 0,
    width,
    height,
    color: NAVY,
  });
  page.drawCircle({
    x: width - mm(13),
    y: height - mm(11),
    size: mm(6.5),
    color: CYAN,
    opacity: 0.18,
  });
  page.drawText(design.labels.brandMark, {
    x: mm(7),
    y: height - mm(10),
    font: bold,
    size: 9,
    color: CYAN,
  });
  page.drawText(fitText(payload.picoName, bold, 20, width - mm(14)), {
    x: mm(7),
    y: height - mm(22),
    font: bold,
    size: 20,
    color: WHITE,
  });
  page.drawText(design.labels.cardKind, {
    x: mm(7),
    y: height - mm(28),
    font: regular,
    size: 8,
    color: PALE,
  });
  page.drawText(design.labels.fingerprintCaption, {
    x: mm(7),
    y: height - mm(36),
    font: bold,
    size: 4.5,
    color: CYAN,
  });
  page.drawText(payload.identityKeyFingerprintHex, {
    x: mm(7),
    y: height - mm(40.5),
    font: mono,
    size: 4.2,
    color: WHITE,
  });
  page.drawText(
    fitText(payload.homeNameOrId, regular, 7, width - mm(44)),
    {
      x: mm(7),
      y: mm(7),
      font: regular,
      size: 7,
      color: PALE,
    },
  );
  // The day the person printing it was on, not the UTC day - a card stamped
  // `2027-01-01` by somebody who printed it at 00:30 on the second names a
  // date they never experienced. Found by `check-instant-display.mjs` on its
  // first run, in the one place this cut had survived outside the window.
  page.drawText(picoDisplayDate(payload.issuedAt), {
    x: width - mm(35),
    y: mm(7),
    font: mono,
    size: 6.5,
    color: PALE,
  });
}

function drawBack(
  page: PDFPage,
  content: PicoRecoveryCardContent,
  design: PicoRecoveryCardDesign,
  regular: PDFFont,
  bold: PDFFont,
  mono: PDFFont,
): void {
  const width = page.getWidth();
  const height = page.getHeight();
  page.drawRectangle({
    x: 0,
    y: 0,
    width,
    height,
    color: PAPER,
  });
  page.drawText(design.labels.phraseCaption, {
    x: mm(6),
    y: height - mm(8),
    font: bold,
    size: 6.5,
    color: NAVY,
  });
  page.drawText(design.labels.pinNotice, {
    x: mm(6),
    y: height - mm(12),
    font: regular,
    size: 5.5,
    color: SLATE,
  });

  const words = content.recoveryPhrase.trim().split(/\s+/u);
  const columnWidth = mm(16.5);
  for (let index = 0; index < words.length; index += 1) {
    const column = Math.floor(index / 8);
    const row = index % 8;
    page.drawText(
      `${String(index + 1).padStart(2, '0')} ${words[index]}`,
      {
        x: mm(6) + column * columnWidth,
        y: height - mm(17) - row * mm(3.5),
        font: mono,
        size: 4.7,
        color: NAVY,
      },
    );
  }

  const matrix = picoRecoveryCardQrMatrixFor(content);
  drawQrMatrix(page, matrix, {
    x: width - mm(30),
    y: height - mm(31),
    size: mm(24),
  });
  page.drawText(design.labels.scanCaption, {
    x: width - mm(30),
    y: height - mm(35),
    font: bold,
    size: 4.5,
    color: SLATE,
  });
  page.drawText(
    fitText(content.endpointHint, regular, 4.5, mm(24)),
    {
      x: width - mm(30),
      y: height - mm(38),
      font: regular,
      size: 4.5,
      color: SLATE,
    },
  );
  // Deliberately unlabeled: ADR 0110 permits a personal note but never invites
  // the person to destroy PIN separation by writing the PIN on the card.
  page.drawLine({
    start: { x: mm(6), y: mm(7) },
    end: { x: width - mm(6), y: mm(7) },
    thickness: 0.55,
    color: SLATE,
  });
}

function drawQrMatrix(
  page: PDFPage,
  matrix: PicoRecoveryCardQrMatrix,
  bounds: { x: number; y: number; size: number },
): void {
  const quiet = PICO_RECOVERY_CARD_PDF_LAYOUT.qrQuietZoneModules;
  const modules = matrix.size + quiet * 2;
  const moduleSize = bounds.size / modules;
  page.drawRectangle({
    x: bounds.x,
    y: bounds.y,
    width: bounds.size,
    height: bounds.size,
    color: WHITE,
  });
  for (let row = 0; row < matrix.size; row += 1) {
    for (let column = 0; column < matrix.size; column += 1) {
      if (matrix.data[row * matrix.size + column] === 0) {
        continue;
      }
      page.drawRectangle({
        x: bounds.x + (quiet + column) * moduleSize,
        y:
          bounds.y
          + (quiet + matrix.size - row - 1) * moduleSize,
        width: moduleSize,
        height: moduleSize,
        color: NAVY,
        borderWidth: 0,
      });
    }
  }
}

function drawSpecimen(
  page: PDFPage,
  design: PicoRecoveryCardDesign,
  bold: PDFFont,
): void {
  const text = design.labels.specimen;
  const size = 27;
  page.drawText(text, {
    x: (page.getWidth() - bold.widthOfTextAtSize(text, size)) / 2,
    y: page.getHeight() / 2 - size / 2,
    font: bold,
    size,
    color: BLOCKED,
    opacity: 0.34,
    rotate: degrees(18),
  });
}

function drawCropMarks(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const length = mm(5);
  const gap = mm(1.5);
  for (const corner of [
    { x, y },
    { x: x + width, y },
    { x, y: y + height },
    { x: x + width, y: y + height },
  ]) {
    const horizontalDirection = corner.x === x ? -1 : 1;
    const verticalDirection = corner.y === y ? -1 : 1;
    page.drawLine({
      start: {
        x: corner.x + horizontalDirection * gap,
        y: corner.y,
      },
      end: {
        x: corner.x + horizontalDirection * (gap + length),
        y: corner.y,
      },
      thickness: 0.4,
      color: SLATE,
    });
    page.drawLine({
      start: {
        x: corner.x,
        y: corner.y + verticalDirection * gap,
      },
      end: {
        x: corner.x,
        y: corner.y + verticalDirection * (gap + length),
      },
      thickness: 0.4,
      color: SLATE,
    });
  }
}

function setStableMetadata(
  document: PDFDocument,
  design: PicoRecoveryCardDesign,
  issuedAt: string,
): void {
  const timestamp = new Date(issuedAt);
  // Printed nowhere and read by every viewer, so it belongs in the labels
  // rather than in the code that happens to write it.
  document.setTitle(design.labels.documentTitle);
  document.setAuthor(design.labels.documentAuthor);
  document.setSubject(design.labels.documentSubject);
  document.setCreator(design.labels.documentProducer);
  document.setProducer(design.labels.documentProducer);
  document.setCreationDate(timestamp);
  document.setModificationDate(timestamp);
  document.setKeywords([...design.labels.documentKeywords]);
}

/**
 * ADR 0132 G2. Resolves a design's font name against pdf-lib's standard set.
 *
 * Refused rather than defaulted when the name is not one of them: a card drawn
 * in a substituted font is a card whose bytes no longer match the test that
 * nails them, and silently falling back would turn that into a mystery.
 */
function standardFont(name: string): StandardFonts {
  const known = Object.values(StandardFonts) as string[];
  if (!known.includes(name)) {
    throw new Error('invalid_recovery_card_font');
  }
  return name as StandardFonts;
}

function fitText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) {
    return text;
  }
  let shortened = text;
  while (
    shortened.length > 1
    && font.widthOfTextAtSize(`${shortened}…`, size) > maxWidth
  ) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened}…`;
}

function hexToBytes(value: string): Uint8Array {
  return Uint8Array.from(
    value.match(/../gu)?.map((pair) => Number.parseInt(pair, 16)) ?? [],
  );
}

function mm(value: number): number {
  return value * POINTS_PER_MM;
}

const NAVY = pdfColor(picoRecoveryCardDesign.palette.deep);
const CYAN = pdfColor(picoRecoveryCardDesign.palette.brand);
const WHITE = pdfColor(picoRecoveryCardDesign.palette.bright);
const PALE = pdfColor(picoRecoveryCardDesign.palette.muted);
const PAPER = pdfColor(picoRecoveryCardDesign.palette.paper);
const SLATE = pdfColor(picoRecoveryCardDesign.palette.slate);
const BLOCKED = pdfColor(picoRecoveryCardDesign.palette.specimen);

function pdfColor(hex: string) {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/iu.exec(hex);
  if (match === null) {
    throw new Error('invalid_pico_design_color');
  }
  return rgb(
    Number.parseInt(match[1], 16) / 255,
    Number.parseInt(match[2], 16) / 255,
    Number.parseInt(match[3], 16) / 255,
  );
}
