import { describe, expect, it } from 'vitest';
import { picoSupplierKinds, picoSupplierMayBeOnOfflineFloor } from './supplier.js';
import {
  buildPicoLibraryDerivation,
  parsePicoLibraryPin,
  picoLibraryPinCoversContent,
  picoLibraryPinKinds,
  picoLibraryPointerPaths,
  verifyPicoLibraryPin,
} from './library-pin.js';

const commit = { kind: 'commit' as const, value: 'a'.repeat(40) };
const otherCommit = { kind: 'commit' as const, value: 'b'.repeat(40) };
const contentHash = { kind: 'content_hash' as const, value: 'c'.repeat(64) };

describe('pico library pin (ADR 0136 BR6)', () => {
  it('keeps two kinds and refuses a third', () => {
    expect([...picoLibraryPinKinds]).toEqual(['content_hash', 'commit']);
    expect(() => parsePicoLibraryPin({ kind: 'tag', value: 'a'.repeat(40) }))
      .toThrow('pico_library_pin_kind_not_listed');
  });

  it('refuses a value that is not the shape its kind is pinned by', () => {
    expect(() => parsePicoLibraryPin({ kind: 'content_hash', value: 'a'.repeat(40) }))
      .toThrow('invalid_pico_library_pin_value');
    expect(() => parsePicoLibraryPin({ kind: 'commit', value: 'main' }))
      .toThrow('invalid_pico_library_pin_value');
    expect(() => parsePicoLibraryPin({ kind: 'commit', value: 'A'.repeat(40) }))
      .toThrow('invalid_pico_library_pin_value');
    // A SHA-256 git repository produces 64-hex commit ids, so the kind decides
    // rather than the length.
    expect(parsePicoLibraryPin({ kind: 'commit', value: 'd'.repeat(64) }).kind).toBe('commit');
  });

  it('refuses an undeclared extra field rather than dropping it', () => {
    expect(() => parsePicoLibraryPin({ ...commit, note: 'from the readme' }))
      .toThrow('invalid_pico_library_pin');
  });
});

describe('what a pin covers (ADR 0136 BR6)', () => {
  it('says a content hash covers its content, because the hash is the content', () => {
    expect(picoLibraryPinCoversContent({ pin: contentHash })).toBe(true);
  });

  it('refuses to answer for a commit without having looked', () => {
    // BR6 asks the question first. Defaulting to true would claim coverage
    // nobody checked, which is the one wrong answer that reads as safe.
    expect(() => picoLibraryPinCoversContent({ pin: commit }))
      .toThrow('pico_library_pin_coverage_not_asked');
  });

  it('treats a repository with nothing filtered as fully pinned', () => {
    expect(picoLibraryPinCoversContent({ pin: commit, gitAttributes: '' })).toBe(true);
    expect(picoLibraryPinCoversContent({
      pin: commit,
      gitAttributes: '* text=auto\n# a comment\n',
    })).toBe(true);
  });

  it('says a commit does not cover content stored as an LFS pointer', () => {
    // The commit pins the pointer; the bytes live on a server with its own
    // availability and its own retention, and can change while the id does not.
    const gitAttributes = [
      '* text=auto',
      '*.pdf filter=lfs diff=lfs merge=lfs -text',
      '# assets/** filter=lfs diff=lfs merge=lfs -text',
      'docs/*.docx filter=lfs diff=lfs merge=lfs -text',
      '',
    ].join('\n');

    expect(picoLibraryPinCoversContent({ pin: commit, gitAttributes })).toBe(false);
    expect(picoLibraryPointerPaths(gitAttributes)).toEqual(['*.pdf', 'docs/*.docx']);
  });

  it('does not mistake diff or merge attributes for content redirection', () => {
    // Only `filter=lfs` redirects content. The others travel with it and mean
    // nothing on their own.
    expect(picoLibraryPointerPaths('*.png diff=lfs merge=lfs -text\n')).toEqual([]);
  });
});

describe('verifying a pin (ADR 0136 BR6)', () => {
  it('matches an identical pin and reports a difference without repairing it', () => {
    expect(verifyPicoLibraryPin({ expected: commit, actual: commit }))
      .toEqual({ status: 'matches', pin: commit });

    const differs = verifyPicoLibraryPin({ expected: commit, actual: otherCommit });
    expect(differs).toEqual({ status: 'differs', expected: commit, actual: otherCommit });
    // There is no substitute, no nearest revision and no repaired pin. An
    // answer citing a commit it did not come from is worse than no answer,
    // because it is indistinguishable from a correct one.
    expect(Object.keys(differs)).toEqual(['status', 'expected', 'actual']);
  });

  it('treats a cross-kind comparison as a category error, not a difference', () => {
    // Reporting `differs` would suggest re-pinning fixes it. A frozen corpus
    // and a tracked working copy are pinned by different facts.
    expect(() => verifyPicoLibraryPin({ expected: commit, actual: contentHash }))
      .toThrow('pico_library_pin_kind_mismatch');
  });
});

describe('a derived item carries the pin it was read at (ADR 0136 BR6)', () => {
  it('builds provenance from a pin and a determined coverage', () => {
    const derivation = buildPicoLibraryDerivation({
      supplierIdentifier: 'rchkb',
      pin: commit,
      pinCoversContent: picoLibraryPinCoversContent({ pin: commit, gitAttributes: '' }),
    });
    expect(derivation).toEqual({
      supplierIdentifier: 'rchkb',
      pin: commit,
      pinCoversContent: true,
    });
    expect(Object.isFrozen(derivation)).toBe(true);
  });

  it('cannot be built without a pin', () => {
    expect(() => buildPicoLibraryDerivation({
      supplierIdentifier: 'rchkb',
      pin: undefined as never,
      pinCoversContent: true,
    })).toThrow('pico_library_derivation_needs_pin');
  });

  it('cannot be built without a determined content coverage', () => {
    // ADR 0136 BR4's idiom: not a value with a default, one nobody measured.
    expect(() => buildPicoLibraryDerivation({
      supplierIdentifier: 'rchkb',
      pin: commit,
      pinCoversContent: undefined as never,
    })).toThrow('pico_library_derivation_needs_content_coverage');
  });

  it('has no field through which a supplier could declare its own coverage', () => {
    // The fifth appearance of ADR 0117 X1's construction. A supplier asserting
    // that its own content is verified is the laundering step.
    const built = buildPicoLibraryDerivation({
      supplierIdentifier: 'rchkb',
      pin: commit,
      pinCoversContent: false,
    });
    expect(Object.keys(built).sort()).toEqual(['pin', 'pinCoversContent', 'supplierIdentifier']);
  });
});

describe('the floor asymmetry (ADR 0136 BR6)', () => {
  it('lets a library be on the floor and never a bridge', () => {
    expect(picoSupplierMayBeOnOfflineFloor('library')).toBe(true);
    expect(picoSupplierMayBeOnOfflineFloor('bridge')).toBe(false);
    // Total over the closed kind list, so a third kind would have to answer.
    for (const kind of picoSupplierKinds) {
      expect(typeof picoSupplierMayBeOnOfflineFloor(kind)).toBe('boolean');
    }
  });
});
