import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { KeyStore } from './key-store.js';
import {
  ModelProviderCredentialCrypto,
  picoModelProviderCredentialKeyDomain,
} from './model-provider-credential-crypto.js';

/**
 * ADR 0151 PV1 with ADR 0138 CO1 - a provider credential at rest.
 *
 * The three refusals are the point of having its own associated data. A seal
 * that could be opened for another entry, another resident or another name
 * would be a secret usable in a place its owner never sent it.
 */
const dirs: string[] = [];

beforeAll(async () => {
  await sodium.ready;
});

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function crypto(): { crypto: ModelProviderCredentialCrypto; keyStore: KeyStore } {
  const dir = mkdtempSync(join(tmpdir(), 'pico-provider-credential-'));
  dirs.push(dir);
  const keyStore = new KeyStore(join(dir, 'keys'));
  return { crypto: new ModelProviderCredentialCrypto(sodium, keyStore), keyStore };
}

const sealed = {
  entryId: 'a-measured-host',
  picoIdentityFingerprintHex: 'a'.repeat(64),
  credentialRef: 'a_credential_reference',
};

describe('ADR 0138 CO1 - the secret is not in the record', () => {
  it('round-trips what it sealed', () => {
    const { crypto: subject } = crypto();
    const seal = subject.seal({ ...sealed, secret: 'a-secret-this-test-made-up' });

    expect(JSON.stringify(seal)).not.toContain('a-secret-this-test-made-up');
    expect(subject.open({ seal, ...sealed }))
      .toEqual({ status: 'ok', secret: 'a-secret-this-test-made-up' });
  });

  it('refuses to open a seal as another entry', () => {
    // Two entries can be two machines with two accounts. A seal that travelled
    // between them would send one machine's credential to another.
    const { crypto: subject } = crypto();
    const seal = subject.seal({ ...sealed, secret: 'a-secret' });

    expect(() => subject.open({ seal, ...sealed, entryId: 'another-host' })).toThrow();
  });

  it('refuses to open another resident\'s credential', () => {
    // ADR 0152: two residents may hold two credentials at one provider, and
    // neither may open the other's.
    const { crypto: subject } = crypto();
    const seal = subject.seal({ ...sealed, secret: 'a-secret' });

    expect(() => subject.open({
      seal,
      ...sealed,
      picoIdentityFingerprintHex: 'c'.repeat(64),
    })).toThrow();
  });

  it('refuses a seal re-pointed at a different name', () => {
    // ADR 0151 PV4. The reference a decision names is part of what was sealed,
    // so editing the row to point elsewhere fails to open rather than opening
    // something else.
    const { crypto: subject } = crypto();
    const seal = subject.seal({ ...sealed, secret: 'a-secret' });

    expect(() => subject.open({ seal, ...sealed, credentialRef: 'another_name' })).toThrow();
  });
});

describe('ADR 0072 R6 - a restore holds the seal and not the key', () => {
  it('reports the missing key rather than throwing', () => {
    const { crypto: subject, keyStore } = crypto();
    const seal = subject.seal({ ...sealed, secret: 'a-secret' });

    keyStore.shredDomain(picoModelProviderCredentialKeyDomain, { custodyClass: 'host_custody' });

    // A Home that cannot prove who it is, which is a different thing from a
    // Home that is broken - so it is answered rather than raised.
    expect(subject.open({ seal, ...sealed })).toEqual({ status: 'key_unavailable' });
  });

  it('keeps one key for every credential rather than one per secret', () => {
    // A key version per credential would make the key store grow with every
    // rotation and leave nothing that a single shred reaches.
    const { crypto: subject, keyStore } = crypto();
    subject.seal({ ...sealed, secret: 'first' });
    subject.seal({ ...sealed, entryId: 'another-host', secret: 'second' });

    expect(keyStore.listVersions(picoModelProviderCredentialKeyDomain, {
      custodyClass: 'host_custody',
    })).toEqual([1]);
  });
});
