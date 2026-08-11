import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EventStore } from './event-store.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function openStore() {
  const dir = mkdtempSync(join(tmpdir(), 'pico-supplier-attachment-'));
  dirs.push(dir);
  return new EventStore(join(dir, 'pico.sqlite'));
}

const rchkb = {
  identifier: 'rchkb',
  kind: 'library',
  slots: ['memory_item'],
  coverage: ['privat'],
  privacyDomain: 'privat',
};

describe('ADR 0137 IN5 - one instance, one Private Space', () => {
  it('attaches a supplier into exactly one domain', () => {
    const store = openStore();
    const attached = store.attachPicoSupplier({
      manifest: rchkb,
      attachedAt: '2026-08-11T09:00:00.000Z',
    });
    expect(attached).toMatchObject({ identifier: 'rchkb', privacyDomain: 'privat' });
    store.close();
  });

  it('parses rather than trusts, so a path is refused at the boundary too', () => {
    // ADR 0137 IN1: working copies move. An identifier that was a path would
    // lose its meaning to a `mv`, and take its derived items' provenance along.
    const store = openStore();
    expect(() => store.attachPicoSupplier({
      manifest: { ...rchkb, identifier: '../rchkb' },
      attachedAt: '2026-08-11T09:00:00.000Z',
    })).toThrow('pico_supplier_identifier_is_not_a_path');
    expect(store.picoSupplierAttachments()).toEqual([]);
    store.close();
  });

  it('refuses a slot the core does not own', () => {
    const store = openStore();
    expect(() => store.attachPicoSupplier({
      manifest: { ...rchkb, slots: ['event'] },
      attachedAt: '2026-08-11T09:00:00.000Z',
    })).toThrow('pico_supplier_slot_not_listed');
    store.close();
  });

  it('holds several instances side by side, each with its own domain', () => {
    // Multiplicity is the normal case: a corpus spanning domains is attached
    // several times rather than once at its root.
    const store = openStore();
    store.attachPicoSupplier({ manifest: rchkb, attachedAt: '2026-08-11T09:00:00.000Z' });
    store.attachPicoSupplier({
      manifest: { ...rchkb, identifier: 'rchkb-finanz', coverage: ['finanz'], privacyDomain: 'finanz' },
      attachedAt: '2026-08-11T09:00:00.000Z',
    });
    expect(store.picoSupplierAttachments().map((a) => `${a.identifier}:${a.privacyDomain}`))
      .toEqual(['rchkb:privat', 'rchkb-finanz:finanz']);
    store.close();
  });

  it('survives a restart', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pico-supplier-attachment-'));
    dirs.push(dir);
    const path = join(dir, 'pico.sqlite');
    const first = new EventStore(path);
    first.attachPicoSupplier({ manifest: rchkb, attachedAt: '2026-08-11T09:00:00.000Z' });
    first.close();
    const second = new EventStore(path);
    expect(second.picoSupplierAttachment('rchkb')?.privacyDomain).toBe('privat');
    second.close();
  });
});

describe('ADR 0138 CO3/CO4 - reaching outside is off, and unasked is a further question', () => {
  it('attaches with both decisions off', () => {
    // Attaching says a supplier exists. It does not say Pico may spend a
    // person's money or tell anyone they asked.
    const store = openStore();
    const attached = store.attachPicoSupplier({
      manifest: rchkb,
      attachedAt: '2026-08-11T09:00:00.000Z',
    });
    expect(attached.mayReachOutside).toBe(false);
    expect(attached.mayReachUnasked).toBe(false);
    store.close();
  });

  it('grants reaching without granting unprompted reaching', () => {
    const store = openStore();
    store.attachPicoSupplier({ manifest: rchkb, attachedAt: '2026-08-11T09:00:00.000Z' });
    store.setPicoSupplierReach({
      identifier: 'rchkb',
      mayReachOutside: true,
      mayReachUnasked: false,
      decidedAt: '2026-08-11T10:00:00.000Z',
    });
    const attached = store.picoSupplierAttachment('rchkb');
    expect(attached).toMatchObject({ mayReachOutside: true, mayReachUnasked: false });
    store.close();
  });

  it('refuses unprompted reaching without reaching at all', () => {
    // They fail differently: an answered question that cost money is visible
    // to the person who asked, a background sweep is visible to nobody.
    const store = openStore();
    store.attachPicoSupplier({ manifest: rchkb, attachedAt: '2026-08-11T09:00:00.000Z' });
    expect(() => store.setPicoSupplierReach({
      identifier: 'rchkb',
      mayReachOutside: false,
      mayReachUnasked: true,
      decidedAt: '2026-08-11T10:00:00.000Z',
    })).toThrow('pico_supplier_unasked_requires_reach');
    store.close();
  });

  it('refuses to decide about a supplier nobody attached', () => {
    const store = openStore();
    expect(() => store.setPicoSupplierReach({
      identifier: 'ghost',
      mayReachOutside: true,
      mayReachUnasked: false,
      decidedAt: '2026-08-11T10:00:00.000Z',
    })).toThrow('pico_supplier_not_attached');
    store.close();
  });

  it('re-attaching does not silently keep a reaching grant it never re-asked for', () => {
    const store = openStore();
    store.attachPicoSupplier({ manifest: rchkb, attachedAt: '2026-08-11T09:00:00.000Z' });
    store.setPicoSupplierReach({
      identifier: 'rchkb',
      mayReachOutside: true,
      mayReachUnasked: true,
      decidedAt: '2026-08-11T10:00:00.000Z',
    });
    store.detachPicoSupplier('rchkb');
    store.attachPicoSupplier({ manifest: rchkb, attachedAt: '2026-08-11T11:00:00.000Z' });
    expect(store.picoSupplierAttachment('rchkb')).toMatchObject({
      mayReachOutside: false,
      mayReachUnasked: false,
    });
    store.close();
  });
});

describe('ADR 0136 - detaching stops derivation and deletes nothing', () => {
  it('removes the attachment and leaves everything else standing', () => {
    // ADR 0129 SR6's distinction: stopping and forgetting are different acts.
    const store = openStore();
    store.attachPicoSupplier({ manifest: rchkb, attachedAt: '2026-08-11T09:00:00.000Z' });
    store.setPicoRuleDecision({
      effectName: 'calendar.raise-entry',
      privacyDomain: 'privat',
      decision: 'allow',
      decidedAt: '2026-08-11T09:00:00.000Z',
    });

    store.detachPicoSupplier('rchkb');

    expect(store.picoSupplierAttachment('rchkb')).toBeUndefined();
    expect(store.picoRuleDecisions()).toHaveLength(1);
    store.close();
  });

  it('is quiet about a supplier that was never attached', () => {
    const store = openStore();
    expect(() => store.detachPicoSupplier('ghost')).not.toThrow();
    store.close();
  });
});

describe('ADR 0138 CO1 - a credential says what it may do, and never appears', () => {
  it('attaches with no credential and says so', () => {
    // CO2's `not_configured` is answerable without anything holding a secret.
    const store = openStore();
    const attached = store.attachPicoSupplier({
      manifest: rchkb,
      attachedAt: '2026-08-11T09:00:00.000Z',
    });
    expect(attached.credentialPresent).toBe(false);
    expect(attached.credentialScope).toBeUndefined();
    store.close();
  });

  it('gives a library read scope and refuses anything wider', () => {
    // A supplier that could write to its source could edit the material it is
    // quoting - a quieter failure than losing the credential, because the
    // quotes would stay accurate about a source changed to agree with them.
    const store = openStore();
    store.attachPicoSupplier({ manifest: rchkb, attachedAt: '2026-08-11T09:00:00.000Z' });
    store.setPicoSupplierCredential({ identifier: 'rchkb', scope: 'read', present: true });
    expect(store.picoSupplierAttachment('rchkb')).toMatchObject({
      credentialScope: 'read',
      credentialPresent: true,
    });

    expect(() => store.setPicoSupplierCredential({
      identifier: 'rchkb',
      scope: 'read_write',
      present: true,
    })).toThrow('pico_library_credential_must_be_read_only');
    store.close();
  });

  it('lets a bridge hold a wider scope, because it is not quoting a source', () => {
    const store = openStore();
    store.attachPicoSupplier({
      manifest: { ...rchkb, identifier: 'ha-zuhause', kind: 'bridge', slots: ['effect'], coverage: ['zuhause'] },
      attachedAt: '2026-08-11T09:00:00.000Z',
    });
    store.setPicoSupplierCredential({ identifier: 'ha-zuhause', scope: 'read_write', present: true });
    expect(store.picoSupplierAttachment('ha-zuhause')?.credentialScope).toBe('read_write');
    store.close();
  });

  it('never returns a secret, because none passes through this path', () => {
    const store = openStore();
    store.attachPicoSupplier({ manifest: rchkb, attachedAt: '2026-08-11T09:00:00.000Z' });
    store.setPicoSupplierCredential({ identifier: 'rchkb', scope: 'read', present: true });
    const attached = store.picoSupplierAttachment('rchkb')!;
    expect(Object.keys(attached)).not.toContain('credential');
    expect(JSON.stringify(attached)).not.toMatch(/secret|token|password/iu);
    store.close();
  });

  it('reads nothing from host configuration', () => {
    // ADR 0104 again: a credential a container rebuild could supply is not
    // under Pico's custody.
    const store = openStore();
    store.attachPicoSupplier({ manifest: rchkb, attachedAt: '2026-08-11T09:00:00.000Z' });
    process.env.PICO_SUPPLIER_RCHKB_TOKEN = 'hunter2';
    try {
      expect(store.picoSupplierAttachment('rchkb')?.credentialPresent).toBe(false);
    } finally {
      delete process.env.PICO_SUPPLIER_RCHKB_TOKEN;
    }
    store.close();
  });

  it('refuses to record a credential for a supplier nobody attached', () => {
    const store = openStore();
    expect(() => store.setPicoSupplierCredential({
      identifier: 'ghost', scope: 'read', present: true,
    })).toThrow('pico_supplier_not_attached');
    store.close();
  });
});
