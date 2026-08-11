import { picoTokens } from './pico-design-tokens.generated.js';

/**
 * ADR 0132 G2/G3/G4 - how the card looks, separated from what it says.
 *
 * The user's decision on 2026-08-09: the card's appearance should be workable
 * without touching anything else. `PicoRecoveryCardContent` is the *what*; this
 * is the *how*, and between them the drawing code holds only arrangement.
 *
 * **Colours come from the design system, not from module constants.** Every
 * entry below resolves through `picoTokens`, so
 * `design-system:check` in `release:verify` already holds them and a token
 * change reaches the card without anyone editing it.
 *
 * **Typography is the one place where the design system and the card still
 * disagree, and the disagreement is written down rather than hidden.** The
 * design system specifies `Inter`; the card draws Helvetica and Courier
 * because `pdf-lib`'s standard fonts need no file and the package ships none.
 * ADR 0132 G2 ends that by embedding an Inter subset - the SIL Open Font
 * License permits it and embedding keeps the output deterministic - which
 * means bringing a binary asset and a licence into a package that has neither.
 * That is an asset decision, not a refactor, so the names below are the
 * current truth and the gate that changes them is named beside them.
 *
 * **`space` and `radius` are deliberately not consumed.** They are screen
 * quantities. A laminated 85.6 mm card carrying 4.2 pt type does not scale out
 * of an 8 pt spacing scale, and pretending it does would make the tokens look
 * consumed while producing worse output. The reason sits here rather than in a
 * commit message, because the next person to notice will otherwise fix it.
 *
 * **There is no depiction field** (G4), and its absence is asserted by a test
 * over this type's keys rather than left as an unused slot. ADR 0013 forbids
 * this card a Character depiction today, so a slot would pre-empt a product
 * decision nobody has taken - and an unused field is one a later caller fills
 * in.
 */
const POINTS_PER_MM = 72 / 25.4;

export interface PicoRecoveryCardPalette {
  /** Front face ground, and the QR's dark modules. */
  deep: string;
  /** The brand mark and the section rule on the front. */
  brand: string;
  /** Front face type, and the QR's quiet ground. */
  bright: string;
  /** Secondary type on the front. */
  muted: string;
  /** Back face ground. */
  paper: string;
  /** Secondary type on the back. */
  slate: string;
  /** The specimen watermark, which is a status colour rather than a brand one. */
  specimen: string;
}

/**
 * Standard PDF font names, resolved by the generator. Strings rather than
 * embedded programs, so this type stays serialisable and a caller cannot hand
 * the generator a font object it did not choose.
 */
export interface PicoRecoveryCardFonts {
  regular: string;
  bold: string;
  mono: string;
}

export interface PicoRecoveryCardLabels {
  /** Front face. */
  brandMark: string;
  cardKind: string;
  fingerprintCaption: string;
  /** Back face. */
  phraseCaption: string;
  pinNotice: string;
  scanCaption: string;
  /** A4 fold sheet. */
  sheetTitle: string;
  sheetScaleNotice: string;
  sheetFoldNotice: string;
  /** Watermark on opt-in specimen output. */
  specimen: string;
  /** PDF metadata, which is printed nowhere and read by every viewer. */
  documentTitle: string;
  documentAuthor: string;
  documentSubject: string;
  documentProducer: string;
  documentKeywords: readonly string[];
}

export interface PicoRecoveryCardGeometry {
  cardWidthPt: number;
  cardHeightPt: number;
  paperWidthPt: number;
  paperHeightPt: number;
  paperCardScale: number;
  qrErrorCorrectionLevel: string;
  qrQuietZoneModules: number;
}

export interface PicoRecoveryCardDesign {
  palette: PicoRecoveryCardPalette;
  fonts: PicoRecoveryCardFonts;
  labels: PicoRecoveryCardLabels;
  geometry: PicoRecoveryCardGeometry;
}

/**
 * ADR 0132 G2. Reproduces today's card byte for byte.
 *
 * That is the acceptance criterion rather than a nice property: the existing
 * PDF test nails the output, so a default that drifted would be caught, and a
 * default that had to be adjusted to make the test pass would mean the split
 * changed the card rather than describing it.
 */
export const picoRecoveryCardDesign: PicoRecoveryCardDesign = Object.freeze({
  palette: Object.freeze({
    deep: picoTokens.color.background.deep,
    brand: picoTokens.color.brand.primary,
    bright: picoTokens.theme.light.color.surface.primary,
    muted: picoTokens.color.text.secondary,
    paper: picoTokens.theme.light.color.background.base,
    slate: picoTokens.theme.light.color.text.secondary,
    specimen: picoTokens.color.status.blocked,
  }),
  // ADR 0132 G2 replaces these with an embedded Inter subset. Until then the
  // design system says one thing and the card draws another, which is stated
  // rather than smoothed over.
  fonts: Object.freeze({
    regular: 'Helvetica',
    bold: 'Helvetica-Bold',
    mono: 'Courier',
  }),
  labels: Object.freeze({
    brandMark: 'PICO',
    cardKind: 'Recovery Card',
    fingerprintCaption: 'IDENTITY FINGERPRINT',
    phraseCaption: '24-WORT RECOVERY PHRASE',
    // ADR 0110 permits a personal note and never invites the person to destroy
    // PIN separation by writing the PIN on the card. This says the PIN is
    // needed; it does not ask for it.
    pinNotice: 'PIN erforderlich',
    scanCaption: 'SCAN',
    sheetTitle: 'Pico Recovery Card',
    // Mixed-language on purpose and fixed as a value rather than as code
    // (G3): "100% / actual size" is what print dialogues say in both
    // languages, and a translated instruction that does not match the button
    // is worse than an untranslated one that does.
    sheetScaleNotice: 'At 100% / actual size printen. Nicht an Seite anpassen.',
    sheetFoldNotice: 'Ausschneiden, an der gemeinsamen Kante falten und laminieren.',
    specimen: 'SPECIMEN',
    documentTitle: 'Pico Recovery Card',
    documentAuthor: 'Pico',
    documentSubject: 'Pico identity recovery material',
    documentProducer: 'Pico Recovery Card PDF Generator',
    documentKeywords: Object.freeze(['Pico', 'Recovery Card']),
  }),
  geometry: Object.freeze({
    cardWidthPt: 85.6 * POINTS_PER_MM,
    cardHeightPt: 53.98 * POINTS_PER_MM,
    paperWidthPt: 210 * POINTS_PER_MM,
    paperHeightPt: 297 * POINTS_PER_MM,
    paperCardScale: 0.98,
    qrErrorCorrectionLevel: 'M',
    qrQuietZoneModules: 4,
  }),
});
