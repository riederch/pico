import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { KeyStore } from './key-store.js';
import { SupplierCredentialCrypto } from './supplier-credential-crypto.js';

const dirs: string[] = [];

beforeAll(async () => {
  await sodium.ready;
});

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function open() {
  const dir = mkdtempSync(join(tmpdir(), 'pico-supplier-credential-'));
  dirs.push(dir);
  const keyStore = new KeyStore(join(dir, 'keys'));
  return { crypto: new SupplierCredentialCrypto(sodium, keyStore), keyStore };
}

const at = { supplierIdentifier: 'rchkb', privacyDomain: 'domain-privat' };

describe('ADR 0138 CO1 - a credential at rest', () => {
  it('seals and opens under the scope it was sealed for', () => {
    const { crypto } = open();
    const seal = crypto.seal({ ...at, scope: 'read', secret: 'deploy-token' });
    expect(crypto.open({ seal, ...at, scope: 'read' }))
      .toEqual({ status: 'ok', secret: 'deploy-token' });
  });

  it('never holds the secret in the seal', () => {
    const { crypto } = open();
    const seal = crypto.seal({ ...at, scope: 'read', secret: 'deploy-token' });
    expect(JSON.stringify(seal)).not.toContain('deploy-token');
  });

  it('refuses to open a read credential as read_write', () => {
    // The reason this file exists. The scope is in the associated data, so
    // widening it takes re-encrypting - which takes re-supplying the
    // credential, which takes asking the person again. No column update does
    // it.
    const { crypto } = open();
    const seal = crypto.seal({ ...at, scope: 'read', secret: 'deploy-token' });
    expect(() => crypto.open({ seal, ...at, scope: 'read_write' })).toThrow();
  });

  it('refuses to open one supplier credential as another', () => {
    // The identifier is in the AD too, so a seal cannot be moved between
    // instances - which matters because instances are the plural case.
    const { crypto } = open();
    const seal = crypto.seal({ ...at, scope: 'read', secret: 'deploy-token' });
    expect(() => crypto.open({
      seal,
      supplierIdentifier: 'wwgkb',
      privacyDomain: at.privacyDomain,
      scope: 'read',
    })).toThrow();
  });

  it('refuses to open it in another domain', () => {
    // ADR 0137 IN5: an attachment lands in exactly one Private Space, and the
    // cipher says so rather than trusting the row.
    const { crypto, keyStore } = open();
    const seal = crypto.seal({ ...at, scope: 'read', secret: 'deploy-token' });
    keyStore.createKeyVersion('domain-finanz');
    expect(() => crypto.open({
      seal,
      supplierIdentifier: at.supplierIdentifier,
      privacyDomain: 'domain-finanz',
      scope: 'read',
    })).toThrow();
  });

  it('becomes unreadable when the domain is shredded, and says so', () => {
    // ADR 0072: the credential lives in the domain its supplier attached
    // into, so a domain shred takes it with everything else that domain held.
    // Reported rather than thrown (ADR 0033's honesty limits).
    const { crypto, keyStore } = open();
    const seal = crypto.seal({ ...at, scope: 'read', secret: 'deploy-token' });
    keyStore.shredDomain(at.privacyDomain);
    expect(crypto.open({ seal, ...at, scope: 'read' })).toEqual({ status: 'key_unavailable' });
  });

  it('gives two credentials different ciphertext for the same secret', () => {
    // A fresh DEK and nonce per credential (ADR 0071 R2/R4): equal secrets
    // must not be recognisable as equal from the seals.
    const { crypto } = open();
    const first = crypto.seal({ ...at, scope: 'read', secret: 'same' });
    const second = crypto.seal({
      supplierIdentifier: 'wwgkb',
      privacyDomain: at.privacyDomain,
      scope: 'read',
      secret: 'same',
    });
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(first.nonce).not.toBe(second.nonce);
  });

  it('names its own suite rather than borrowing the memory one', () => {
    const { crypto } = open();
    expect(crypto.seal({ ...at, scope: 'read', secret: 'x' }).suite)
      .toBe('pico.suite.supplier-credential.v1');
  });
});
