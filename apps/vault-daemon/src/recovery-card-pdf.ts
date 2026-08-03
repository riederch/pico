import {
  buildPicoRecoveryCardPayload,
  buildPicoRecoveryCardV2ScanTransport,
  picoRecoveryCardV2ScanPrefix,
  type PicoRecoveryCardPayload,
} from '@pico/protocol';
import type { PicoVaultRecoveryCard } from '@pico/vault';
import {
  degrees,
  PDFDocument,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import QRCode from 'qrcode';
import { picoTokens } from './pico-design-tokens.generated.js';

const POINTS_PER_MM = 72 / 25.4;

export const PICO_RECOVERY_CARD_PDF_LAYOUT = {
  cardWidthPt: 85.6 * POINTS_PER_MM,
  cardHeightPt: 53.98 * POINTS_PER_MM,
  paperWidthPt: 210 * POINTS_PER_MM,
  paperHeightPt: 297 * POINTS_PER_MM,
  paperCardScale: 0.98,
  qrErrorCorrectionLevel: 'M',
  qrQuietZoneModules: 4,
} as const;

/**
 * The transport contract itself is protocol, not presentation: the scanning
 * side must not import the PDF writer to know what it is reading.
 */
export const PICO_RECOVERY_CARD_V2_QR_PREFIX = picoRecoveryCardV2ScanPrefix;

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
 * V1 preserves its binary canonical QR bytes. V2 wraps the same canonical
 * bytes in a fixed ASCII/base64url transport so commodity Linux camera and
 * USB scanners can return it to Electron Main without a browser renderer ever
 * receiving the secret QR result. Neither form is a second JSON serialization.
 */
export function picoRecoveryCardQrPayload(
  card: PicoVaultRecoveryCard,
): Uint8Array {
  assertRecoveryCard(card);
  const canonical = hexToBytes(card.canonicalPayloadHex);
  if (card.payload.schema === 'pico.recovery.card.v2') {
    return new TextEncoder().encode(
      buildPicoRecoveryCardV2ScanTransport(canonical),
    );
  }
  return canonical;
}

export function createPicoRecoveryCardQrMatrix(
  card: PicoVaultRecoveryCard,
): PicoRecoveryCardQrMatrix {
  const payload = picoRecoveryCardQrPayload(card);
  const code = QRCode.create(
    [{ data: Buffer.from(payload), mode: 'byte' }],
    {
      errorCorrectionLevel:
        PICO_RECOVERY_CARD_PDF_LAYOUT.qrErrorCorrectionLevel,
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
  assertRecoveryCard(card);
  const cardDocument = await createCardPrinterDocument(card, options);
  const cardPrinterPdf = await cardDocument.save({
    addDefaultPage: false,
    useObjectStreams: false,
  });
  const paperDocument = await createPaperPrintableDocument(
    cardPrinterPdf,
    card.payload.issuedAt,
  );
  const paperPrintablePdf = await paperDocument.save({
    addDefaultPage: false,
    useObjectStreams: false,
  });
  return { cardPrinterPdf, paperPrintablePdf };
}

async function createCardPrinterDocument(
  card: PicoVaultRecoveryCard,
  options: PicoRecoveryCardPdfOptions,
): Promise<PDFDocument> {
  const document = await PDFDocument.create();
  setStableMetadata(document, card.payload.issuedAt);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const mono = await document.embedFont(StandardFonts.Courier);
  const front = document.addPage([
    PICO_RECOVERY_CARD_PDF_LAYOUT.cardWidthPt,
    PICO_RECOVERY_CARD_PDF_LAYOUT.cardHeightPt,
  ]);
  const back = document.addPage([
    PICO_RECOVERY_CARD_PDF_LAYOUT.cardWidthPt,
    PICO_RECOVERY_CARD_PDF_LAYOUT.cardHeightPt,
  ]);
  drawFront(front, card.payload, regular, bold, mono);
  drawBack(back, card, regular, bold, mono);
  if (options.specimen === true) {
    drawSpecimen(front, bold);
    drawSpecimen(back, bold);
  }
  return document;
}

async function createPaperPrintableDocument(
  cardPrinterPdf: Uint8Array,
  issuedAt: string,
): Promise<PDFDocument> {
  const document = await PDFDocument.create();
  setStableMetadata(document, issuedAt);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
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

  page.drawText('Pico Recovery Card', {
    x: left,
    y: foldY + height + mm(14),
    font: bold,
    size: 13,
    color: NAVY,
  });
  page.drawText(
    'At 100% / actual size printen. Nicht an Seite anpassen.',
    {
      x: left,
      y: foldY + height + mm(8),
      font: regular,
      size: 8,
      color: SLATE,
    },
  );
  page.drawText(
    'Ausschneiden, an der gemeinsamen Kante falten und laminieren.',
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
  payload: PicoRecoveryCardPayload,
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
  page.drawText('PICO', {
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
  page.drawText('Recovery Card', {
    x: mm(7),
    y: height - mm(28),
    font: regular,
    size: 8,
    color: PALE,
  });
  page.drawText('IDENTITY FINGERPRINT', {
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
  page.drawText(payload.issuedAt.slice(0, 10), {
    x: width - mm(35),
    y: mm(7),
    font: mono,
    size: 6.5,
    color: PALE,
  });
}

function drawBack(
  page: PDFPage,
  card: PicoVaultRecoveryCard,
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
  page.drawText('24-WORT RECOVERY PHRASE', {
    x: mm(6),
    y: height - mm(8),
    font: bold,
    size: 6.5,
    color: NAVY,
  });
  page.drawText('PIN erforderlich', {
    x: mm(6),
    y: height - mm(12),
    font: regular,
    size: 5.5,
    color: SLATE,
  });

  const words = card.recoveryPhrase.trim().split(/\s+/u);
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

  const matrix = createPicoRecoveryCardQrMatrix(card);
  drawQrMatrix(page, matrix, {
    x: width - mm(30),
    y: height - mm(31),
    size: mm(24),
  });
  page.drawText('SCAN', {
    x: width - mm(30),
    y: height - mm(35),
    font: bold,
    size: 4.5,
    color: SLATE,
  });
  page.drawText(
    fitText(card.payload.endpointHint, regular, 4.5, mm(24)),
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

function drawSpecimen(page: PDFPage, bold: PDFFont): void {
  const text = 'SPECIMEN';
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

function assertRecoveryCard(card: PicoVaultRecoveryCard): void {
  if (
    !isRecord(card)
    || !hasExactKeys(card, [
      'payload',
      'recoveryPhrase',
      'canonicalPayloadHex',
    ])
    || !isRecord(card.payload)
    || card.payload.pinProtected !== true
    || typeof card.recoveryPhrase !== 'string'
    || card.recoveryPhrase.trim().split(/\s+/u).length !== 24
    || typeof card.canonicalPayloadHex !== 'string'
    || !/^(?:[0-9a-f]{2})+$/u.test(card.canonicalPayloadHex)
  ) {
    throw new Error('invalid_recovery_card');
  }
  const canonical = buildPicoRecoveryCardPayload(
    card.payload as unknown as PicoRecoveryCardPayload,
  );
  if (
    Buffer.from(canonical).toString('hex')
    !== card.canonicalPayloadHex
  ) {
    throw new Error('recovery_card_payload_mismatch');
  }
}

function setStableMetadata(document: PDFDocument, issuedAt: string): void {
  const timestamp = new Date(issuedAt);
  document.setTitle('Pico Recovery Card');
  document.setAuthor('Pico');
  document.setSubject('Pico identity recovery material');
  document.setCreator('Pico Recovery Card PDF Generator');
  document.setProducer('Pico Recovery Card PDF Generator');
  document.setCreationDate(timestamp);
  document.setModificationDate(timestamp);
  document.setKeywords(['Pico', 'Recovery Card']);
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

function hasExactKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const expected = new Set(keys);
  return Object.keys(record).length === expected.size
    && Object.keys(record).every((key) => expected.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mm(value: number): number {
  return value * POINTS_PER_MM;
}

const NAVY = pdfColor(picoTokens.color.background.deep);
const CYAN = pdfColor(picoTokens.color.brand.primary);
const WHITE = pdfColor(picoTokens.theme.light.color.surface.primary);
const PALE = pdfColor(picoTokens.color.text.secondary);
const PAPER = pdfColor(picoTokens.theme.light.color.background.base);
const SLATE = pdfColor(picoTokens.theme.light.color.text.secondary);
const BLOCKED = pdfColor(picoTokens.color.status.blocked);

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
