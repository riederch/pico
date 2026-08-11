import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { picoDurableStores } from '@pico/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { PicoSupplierScratch } from './supplier-scratch.js';

/**
 * ADR 0143 DP8. The scratch area is defined by what it is not, so most of what
 * is asserted here is an absence.
 */
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function scratchRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pico-scratch-'));
  tempDirs.push(dir);
  return dir;
}

describe('ADR 0143 DP8 - a workspace, not a store', () => {
  it('is absent from the durable stores, so it answers none of their questions', () => {
    // No ADR 0119 Q5 ceiling, no place in the shred cascade, no backup
    // exclusion, no Q3 byte-identity obligation. ADR 0129 SR2's five questions
    // are not answered here because there is nothing to answer them about.
    expect((picoDurableStores as readonly string[])).not.toContain('supplier_scratch');
    expect((picoDurableStores as readonly string[]).some((store) => store.includes('scratch')))
      .toBe(false);
  });

  it('creates a directory per attachment and hands back its path', () => {
    const root = scratchRoot();
    const scratch = new PicoSupplierScratch(root);
    const path = scratch.ensure('rchkb');
    expect(path).toBe(join(root, 'rchkb'));
    expect(existsSync(path)).toBe(true);
  });

  it('gives a supplier no way to choose its own directory', () => {
    // An identifier is a person-chosen token under ADR 0137 IN1, and the one
    // thing it must never be is a path. A supplier whose identifier could
    // contain a slash would be a supplier picking a place on the disk.
    const scratch = new PicoSupplierScratch(scratchRoot());
    for (const identifier of ['../elsewhere', '/etc', 'a/b', '..', '', 'RCHKB']) {
      expect(() => scratch.pathFor(identifier))
        .toThrow('invalid_pico_supplier_identifier');
    }
  });

  it('refuses a root that is not one', () => {
    expect(() => new PicoSupplierScratch('   '))
      .toThrow('invalid_pico_supplier_scratch_root');
  });
});

describe('ADR 0143 DP8 - removed with the attachment', () => {
  it('deletes the workspace and everything in it', () => {
    const root = scratchRoot();
    const scratch = new PicoSupplierScratch(root);
    const path = scratch.ensure('rchkb');
    mkdirSync(join(path, 'unpacked'), { recursive: true });
    writeFileSync(join(path, 'unpacked', 'note.md'), 'half a corpus\n');

    scratch.detach('rchkb');
    expect(existsSync(path)).toBe(false);
  });

  it('is quiet about a workspace that was never created', () => {
    const scratch = new PicoSupplierScratch(scratchRoot());
    expect(() => scratch.detach('ghost')).not.toThrow();
  });

  it('removes what no attachment stands behind', () => {
    // The half that makes "removed with the attachment" true rather than
    // intended: a detach interrupted between the row and the files would leave
    // a person's material on disk after they detached the thing that put it
    // there, and they would believe it was gone.
    const root = scratchRoot();
    const scratch = new PicoSupplierScratch(root);
    scratch.ensure('rchkb');
    scratch.ensure('wwgkb');
    writeFileSync(join(root, 'wwgkb', 'left-behind.md'), 'x\n');

    expect(scratch.removeOrphans(['rchkb'])).toEqual(['wwgkb']);
    expect(existsSync(join(root, 'rchkb'))).toBe(true);
    expect(existsSync(join(root, 'wwgkb'))).toBe(false);
  });

  it('removes a directory nothing here could have created', () => {
    // Nothing this class creates can have such a name, so its presence means
    // something else wrote into the root - and leaving it would make the root
    // a place where unaccounted material accumulates.
    const root = scratchRoot();
    const scratch = new PicoSupplierScratch(root);
    mkdirSync(join(root, 'Some Other Thing'), { recursive: true });
    scratch.ensure('rchkb');

    expect(scratch.removeOrphans(['rchkb', 'Some Other Thing']))
      .toEqual(['Some Other Thing']);
    expect(existsSync(join(root, 'rchkb'))).toBe(true);
  });

  it('answers nothing for a root that does not exist yet', () => {
    const scratch = new PicoSupplierScratch(join(scratchRoot(), 'not-created'));
    expect(scratch.removeOrphans(['rchkb'])).toEqual([]);
  });
});
