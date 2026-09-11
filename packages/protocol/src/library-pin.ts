/**
 * ADR 0136 BR6 - what a library is pinned at, and what the pin actually
 * covers.
 *
 * A Pico Library is **attached, not held**. Pico reads it where it lies
 * (ADR 0133: derive from the source until the medium is known), and what Pico
 * concludes is an ordinary memory item under ordinary custody carrying the
 * revision it was read at. The pin is therefore not an integrity nicety - it is
 * the correction point ADR 0133 requires of any cache, and it is the only way a
 * derived sentence can ever be traced back to the bytes it came from.
 *
 * **Two pin kinds, because there are two ways to be a library.** A frozen
 * corpus - a port-code table, a static lexicon - is pinned by the hash of its
 * content. A tracked one - a git working copy of a knowledge base - is pinned
 * by a commit id. They are not interchangeable and comparing one to the other
 * is a category error rather than a mismatch, which is why
 * `verifyPicoLibraryPin` throws for it instead of answering `differs`.
 *
 * **The load-bearing question is whether the pin covers the content at all.**
 * A commit id looks like it pins bytes and under git-LFS it pins a *pointer*:
 * the bytes live somewhere else, with its own availability and its own
 * retention, and that somewhere else can change or vanish while the commit id
 * stays exactly the same. A library whose commit does not cover its content is
 * still usable - it is not a fault - but a derived item that claimed the commit
 * as its provenance would be claiming more than the commit can carry.
 *
 * So the question is **asked rather than assumed**, and it is asked of the
 * working copy rather than of the library. `picoLibraryPinCoversContent`
 * cannot answer for a commit pin without being handed the `.gitattributes` it
 * read, and a supplier has no parameter anywhere here through which it could
 * declare its own coverage - the construction ADR 0117 X1 uses for
 * `picoReaderCapabilities`, ADR 0136 BR3 for an origin class and ADR 0139 AC2
 * for an argument's origin. A supplier asserting that its own content is
 * verified is the laundering step, not a convenience.
 */
import { hexOfBytesPattern } from './canonical-bytes.js';

export const picoLibraryPinKinds = ['content_hash', 'commit'] as const;

export type PicoLibraryPinKind = typeof picoLibraryPinKinds[number];

/**
 * A frozen library is pinned by SHA-256 over its content; a tracked one by a
 * git commit id. Both are lowercase hex and the lengths differ, but the kind
 * decides - a SHA-256 git repository produces 64-hex commit ids too, and
 * guessing the kind from the length would silently mistake one for the other on
 * exactly the repositories most likely to be careful.
 */
const contentHashPattern = hexOfBytesPattern(32);
/**
 * What a git commit id looks like, in one place because two things pin one:
 * a tracked library here, and a Pico Depot under ADR 0143 DP1. Two copies of
 * this would be two places for it to be wrong about the same fact.
 */
/**
 * ADR 0136. Ein Git-Commit, in beiden Laengen, die Git kennt.
 *
 * Zusammengesetzt aus der einen Form statt sie zweimal hinzuschreiben (Befund
 * B142): zwanzig Bytes fuer SHA-1, zweiunddreissig fuer SHA-256. Dass beide
 * Laengen gelten, ist die Aussage dieses Musters - dass es Hex ist, ist es
 * nicht.
 */
export const picoGitCommitPattern = new RegExp(
  `^(?:${hexOfBytesPattern(20).source.slice(1, -1)}|${hexOfBytesPattern(32).source.slice(1, -1)})$`,
  'u',
);

export interface PicoLibraryPin {
  kind: PicoLibraryPinKind;
  value: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parsePicoLibraryPin(value: unknown): PicoLibraryPin {
  const record = isRecord(value) ? value : undefined;
  if (record === undefined) {
    throw new Error('invalid_pico_library_pin');
  }
  const keys = Object.keys(record).sort();
  if (keys.length !== 2 || keys[0] !== 'kind' || keys[1] !== 'value') {
    throw new Error('invalid_pico_library_pin');
  }
  if (typeof record.kind !== 'string'
    || !(picoLibraryPinKinds as readonly string[]).includes(record.kind)) {
    throw new Error('pico_library_pin_kind_not_listed');
  }
  if (typeof record.value !== 'string') {
    throw new Error('invalid_pico_library_pin');
  }
  const pattern = record.kind === 'content_hash' ? contentHashPattern : picoGitCommitPattern;
  if (!pattern.test(record.value)) {
    throw new Error('invalid_pico_library_pin_value');
  }
  return Object.freeze({
    kind: record.kind as PicoLibraryPinKind,
    value: record.value,
  });
}

/**
 * ADR 0136 BR6. Whether a pin covers the bytes, asked of the working copy.
 *
 * A content hash covers its content by construction - the hash *is* the
 * content, so there is nothing to look up and nothing that could drift.
 *
 * A commit id is the interesting case and the reason this function exists. It
 * covers the content **only if nothing in the working copy is filtered through
 * git-LFS**, because an LFS-managed path is stored as a pointer: the commit
 * pins the pointer, and the bytes come from a server with its own availability
 * and its own retention policy.
 *
 * `gitAttributes` is **required** for a commit pin and an empty string is a
 * valid answer - a repository with no `.gitattributes` has nothing filtered.
 * What is not valid is not looking. Omitting it throws rather than defaulting
 * to `true`, because the default that reads as safe is the one that quietly
 * claims coverage nobody checked, and BR6 asks the question *first*.
 */
export function picoLibraryPinCoversContent(input: {
  pin: PicoLibraryPin;
  gitAttributes?: string;
}): boolean {
  if (input.pin.kind === 'content_hash') {
    return true;
  }
  if (typeof input.gitAttributes !== 'string') {
    throw new Error('pico_library_pin_coverage_not_asked');
  }
  return picoLibraryPointerPaths(input.gitAttributes).length === 0;
}

/**
 * The paths a commit pins as pointers rather than as bytes. Returned rather
 * than counted, so a surface can name what is not covered instead of reporting
 * an unexplained "partly pinned".
 */
export function picoLibraryPointerPaths(gitAttributes: string): readonly string[] {
  const paths: string[] = [];
  for (const rawLine of gitAttributes.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const parts = line.split(/\s+/u);
    const pattern = parts[0];
    if (pattern === undefined) {
      continue;
    }
    // `filter=lfs` is the attribute that redirects content; `diff` and `merge`
    // are set alongside it and mean nothing on their own.
    if (parts.slice(1).some((attribute) => attribute === 'filter=lfs')) {
      paths.push(pattern);
    }
  }
  return Object.freeze(paths);
}

/**
 * ADR 0136 BR6. What a pin comparison may answer, and what it may not.
 *
 * There is no third outcome and deliberately no repair. A library whose pin
 * does not match is a library reporting that it is not the thing that was
 * derived from - substituting a nearby revision would produce answers that
 * cite a commit they did not come from, which is worse than no answer because
 * it is indistinguishable from a correct one.
 */
export type PicoLibraryPinVerification =
  | { status: 'matches'; pin: PicoLibraryPin }
  | { status: 'differs'; expected: PicoLibraryPin; actual: PicoLibraryPin };

export function verifyPicoLibraryPin(input: {
  expected: PicoLibraryPin;
  actual: PicoLibraryPin;
}): PicoLibraryPinVerification {
  if (input.expected.kind !== input.actual.kind) {
    // Not a mismatch - a question that was not asked. A frozen corpus and a
    // tracked working copy are pinned by different facts, and reporting
    // `differs` would suggest re-pinning would fix it.
    throw new Error('pico_library_pin_kind_mismatch');
  }
  if (input.expected.value !== input.actual.value) {
    return Object.freeze({
      status: 'differs' as const,
      expected: input.expected,
      actual: input.actual,
    });
  }
  return Object.freeze({ status: 'matches' as const, pin: input.expected });
}

/**
 * ADR 0136 BR6 and ADR 0133. What a derived memory item carries about where it
 * came from.
 *
 * This is provenance, not storage: it lives on the item it describes, so a
 * domain shred reaches it for free, the retention sweep reaches it for free,
 * and ADR 0119 Q5's memory ceiling counts it exactly once. A table of its own
 * would have needed a place in the shred cascade, the backup exclusions, the
 * boot reconciliation and the Q5 ceilings - ADR 0127's five questions - for a
 * fact that has no life apart from the item it is a fact about.
 *
 * Neither field may be omitted. A derivation without a pin is a quotation
 * without a source, and a derivation whose content coverage was never
 * determined is one claiming more than its pin can carry - the same refusal
 * ADR 0136 BR4 makes for a value built without its confidence.
 */
export interface PicoLibraryDerivation {
  /** ADR 0137 IN1. Which instance it was read from. */
  supplierIdentifier: string;
  /** The revision it was read at. */
  pin: PicoLibraryPin;
  /**
   * Whether that pin covers the bytes. Computed by
   * `picoLibraryPinCoversContent` from what the core read, never supplied.
   */
  pinCoversContent: boolean;
}

export function buildPicoLibraryDerivation(input: {
  supplierIdentifier: string;
  pin: PicoLibraryPin;
  pinCoversContent: boolean;
}): PicoLibraryDerivation {
  if (typeof input.supplierIdentifier !== 'string' || input.supplierIdentifier === '') {
    throw new Error('pico_library_derivation_needs_supplier');
  }
  if (!isRecord(input.pin)) {
    throw new Error('pico_library_derivation_needs_pin');
  }
  if (typeof input.pinCoversContent !== 'boolean') {
    // Not a field with a default. An unasked question and a negative answer are
    // different facts, and only one of them is honest about what is known.
    throw new Error('pico_library_derivation_needs_content_coverage');
  }
  return Object.freeze({
    supplierIdentifier: input.supplierIdentifier,
    pin: parsePicoLibraryPin(input.pin),
    pinCoversContent: input.pinCoversContent,
  });
}
