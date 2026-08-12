import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildPicoIdentityDelegationSignatureInput,
  buildPicoIdentityKeyRecordSignatureInput,
  picoIdentitySuite,
  type PicoIdentityDelegationSignatureInput,
  type PicoIdentityKeyRecordSignatureInput,
} from '@pico/protocol';
import Database from 'better-sqlite3';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EventStore } from './event-store.js';

/**
 * ADR 0148 EX2/EX3/EX5. The Home's mailbox book.
 *
 * The load-bearing test is the last one: a mailbox stops being honoured when
 * its delegation stops being active, with **nothing having run in between**.
 * That is the whole reason EX3 derives instead of remembering - a status
 * column would need something to update it, and that something is what gets
 * forgotten.
 */
const tempDirs: string[] = [];
const stores: EventStore[] = [];

let identity: { publicKey: Uint8Array; privateKey: Uint8Array };
let signing: { publicKey: Uint8Array; privateKey: Uint8Array };
let agreement: { publicKey: Uint8Array; privateKey: Uint8Array };
let identityKeyRecord: PicoIdentityKeyRecordSignatureInput;
let agreementKeyRecord: PicoIdentityKeyRecordSignatureInput;
let identityFingerprint: string;
let signingFingerprint: string;
let agreementFingerprint: string;

const operator = 'relay.example.invalid';
const homeInbound = `${'1'.repeat(32)}@${operator}`;
const deviceInbound = `${'2'.repeat(32)}@${operator}`;

/** The delegation is valid across 2026 and not into 2027. */
const HOME_ID = 'home_link_mailbox_test';
const DELEGATION_ID = 'delegation_link_mailbox_test_0001';
const WHILE_ACTIVE = '2026-06-01T00:00:00.000Z';
const AFTER_EXPIRY = '2027-06-01T00:00:00.000Z';

beforeAll(async () => {
  await sodium.ready;
  identity = sodium.crypto_sign_keypair();
  signing = sodium.crypto_sign_keypair();
  agreement = sodium.crypto_box_keypair();
  identityKeyRecord = keyRecord('pico_identity', identity.publicKey);
  agreementKeyRecord = keyRecord('device_key_agreement', agreement.publicKey);
  identityFingerprint = fingerprint(identityKeyRecord);
  signingFingerprint = fingerprint(keyRecord('device_signing', signing.publicKey));
  agreementFingerprint = fingerprint(keyRecord('device_key_agreement', agreement.publicKey));
});

afterEach(() => {
  for (const store of stores.splice(0)) {
    try {
      store.close();
    } catch {
      // Already closed by the test that opened it.
    }
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function openStore(
  options: Parameters<typeof EventStore.open>[1] = {},
): Promise<EventStore> {
  const dir = mkdtempSync(join(tmpdir(), 'pico-link-mailbox-'));
  tempDirs.push(dir);
  const store = await EventStore.open(join(dir, 'pico.sqlite'), options);
  stores.push(store);
  return store;
}

/**
 * ADR 0083. A reader key registers only into a claimed Home the identity is a
 * member of, so the EX3 test has to be one. Written straight into the schema
 * rather than through the ceremonies, because what is under test here is the
 * mailbox derivation and not the founding.
 */
async function openClaimedStore(): Promise<EventStore> {
  const dir = mkdtempSync(join(tmpdir(), 'pico-link-mailbox-claimed-'));
  tempDirs.push(dir);
  const databasePath = join(dir, 'pico.sqlite');
  (await EventStore.open(databasePath, {})).close();

  const db = new Database(databasePath);
  db.prepare(`
    UPDATE pico_home_claim_state
    SET state = 'claimed',
        host_admin_pico_id = 'pico_link_mailbox_admin',
        home_id = ?,
        host_signing_key_fingerprint_hex = ?,
        host_key_agreement_key_fingerprint_hex = ?,
        claimed_at = ?,
        updated_at = ?
    WHERE id = 1
  `).run(HOME_ID, '1'.repeat(64), '2'.repeat(64), WHILE_ACTIVE, WHILE_ACTIVE);
  db.prepare(`
    INSERT INTO pico_home_membership (
      membership_id, home_id, pico_identity_fingerprint_hex, role, status,
      scopes_json, source, source_ref, valid_from, valid_until, created_at, updated_at
    ) VALUES (?, ?, ?, 'home_member', 'active', ?, 'membership_credential', ?, ?, NULL, ?, ?)
  `).run(
    'membership_link_mailbox_test',
    HOME_ID,
    identityFingerprint,
    '["memory_read"]',
    'credential_link_mailbox_test',
    '2026-01-01T00:00:00.000Z',
    WHILE_ACTIVE,
    WHILE_ACTIVE,
  );
  db.close();

  const store = await EventStore.open(databasePath, {});
  stores.push(store);
  return store;
}

function principal(over: Partial<{
  picoIdentityFingerprintHex: string;
  deviceSigningKeyFingerprintHex: string;
  deviceKeyAgreementKeyFingerprintHex: string;
  delegationId: string;
}> = {}) {
  return {
    picoIdentityFingerprintHex: identityFingerprint,
    deviceSigningKeyFingerprintHex: signingFingerprint,
    deviceKeyAgreementKeyFingerprintHex: agreementFingerprint,
    delegationId: DELEGATION_ID,
    ...over,
  };
}

function exchange(store: EventStore, over: Partial<{
  homeInbound: string;
  deviceInbound: string;
  principal: ReturnType<typeof principal>;
}> = {}) {
  return store.exchangePicoLinkMailbox({
    principal: over.principal ?? principal(),
    homeInbound: over.homeInbound ?? homeInbound,
    deviceInbound: over.deviceInbound ?? deviceInbound,
    exchangedAt: WHILE_ACTIVE,
  });
}

describe('ADR 0148 EX5 - one row per device', () => {
  it('records both directions and the delegation they were proved by', async () => {
    const store = await openStore();
    const record = exchange(store);
    expect(record).toEqual({
      deviceSigningKeyFingerprintHex: signingFingerprint,
      picoIdentityFingerprintHex: identityFingerprint,
      deviceKeyAgreementKeyFingerprintHex: agreementFingerprint,
      delegationId: DELEGATION_ID,
      homeInbound,
      deviceInbound,
      exchangedAt: WHILE_ACTIVE,
    });
    store.close();
  });

  it('replaces on re-exchange rather than adding, which is the rotation', async () => {
    // ADR 0148 EX4: rotation, first run and the flooded-mailbox remedy are one
    // code path, so running the exchange twice leaves one entry.
    const store = await openStore();
    exchange(store);
    const rotated = exchange(store, {
      homeInbound: `${'3'.repeat(32)}@${operator}`,
      deviceInbound: `${'4'.repeat(32)}@${operator}`,
    });
    expect(store.picoLinkMailboxes()).toHaveLength(1);
    expect(rotated.homeInbound).toBe(`${'3'.repeat(32)}@${operator}`);
    store.close();
  });

  it('refuses two devices behind one of our mailboxes', async () => {
    // ADR 0147 RY2, held by the table rather than by this method, so a second
    // write path cannot get around it.
    const store = await openStore();
    exchange(store);
    expect(() => exchange(store, {
      principal: principal({ deviceSigningKeyFingerprintHex: 'f'.repeat(64) }),
      deviceInbound: `${'5'.repeat(32)}@${operator}`,
    })).toThrow('pico_link_inbound_shared_between_peers');
    store.close();
  });

  it('refuses two devices behind one of theirs, which is a redirection', async () => {
    const store = await openStore();
    exchange(store);
    expect(() => exchange(store, {
      principal: principal({ deviceSigningKeyFingerprintHex: 'f'.repeat(64) }),
      homeInbound: `${'5'.repeat(32)}@${operator}`,
    })).toThrow('pico_link_outbound_shared_between_peers');
    store.close();
  });

  it('refuses an entry that points at itself', async () => {
    const store = await openStore();
    expect(() => exchange(store, { deviceInbound: homeInbound }))
      .toThrow('pico_link_mailbox_points_at_itself');
    store.close();
  });

  it('refuses an address that is not one', async () => {
    const store = await openStore();
    expect(() => exchange(store, { deviceInbound: 'device-1' }))
      .toThrow('invalid_pico_link_address');
    store.close();
  });

  it('answers the ADR 0119 Q5 ceiling, and lets a rotation through it', async () => {
    const store = await openStore({ storeCeilingRows: { link_mailbox: 1 } });
    exchange(store);
    expect(() => exchange(store, {
      principal: principal({ deviceSigningKeyFingerprintHex: 'f'.repeat(64) }),
      homeInbound: `${'5'.repeat(32)}@${operator}`,
      deviceInbound: `${'6'.repeat(32)}@${operator}`,
    })).toThrow('pico_link_mailbox_store_ceiling_reached');

    // A device already in the book rotates at the ceiling, because refusing
    // would leave a person unable to replace a flooded mailbox at exactly the
    // moment they need to.
    expect(() => exchange(store, {
      homeInbound: `${'7'.repeat(32)}@${operator}`,
      deviceInbound: `${'8'.repeat(32)}@${operator}`,
    })).not.toThrow();
    store.close();
  });
});

describe('ADR 0148 EX3 - life is the delegation life', () => {
  it('honours nothing for a device with no delegation at all', async () => {
    const store = await openStore();
    exchange(store);
    expect(store.picoLinkMailboxes()).toHaveLength(1);
    expect(store.honouredPicoLinkMailboxes(sodium, WHILE_ACTIVE)).toHaveLength(0);
    store.close();
  });

  it('stops honouring a mailbox when the delegation stops, with nothing run in between', async () => {
    // **The gate.** No revocation hook, no status column, no sweep: the same
    // two calls against the same untouched row give different answers, because
    // the answer is derived from the delegation and not remembered beside it.
    const store = await openClaimedStore();
    recordDelegation(store);
    exchange(store);

    expect(store.honouredPicoLinkMailboxes(sodium, WHILE_ACTIVE)).toHaveLength(1);
    expect(store.honouredPicoLinkMailboxes(sodium, AFTER_EXPIRY)).toHaveLength(0);

    // And the row is still there. Not honoured is not deleted: ADR 0147 RY4's
    // explicit revocation is a different act from a device going inactive.
    expect(store.picoLinkMailboxes()).toHaveLength(1);
    store.close();
  });
});

function keyRecord(
  keyRole: PicoIdentityKeyRecordSignatureInput['keyRole'],
  publicKey: Uint8Array,
): PicoIdentityKeyRecordSignatureInput {
  return { suite: picoIdentitySuite, keyRole, publicKeyHex: Buffer.from(publicKey).toString('hex') };
}

function fingerprint(record: PicoIdentityKeyRecordSignatureInput): string {
  return Buffer.from(sodium.crypto_generichash(
    32,
    buildPicoIdentityKeyRecordSignatureInput(record),
    null,
  )).toString('hex');
}

function recordDelegation(store: EventStore): void {
  const record: PicoIdentityDelegationSignatureInput = {
    suite: picoIdentitySuite,
    delegationId: DELEGATION_ID,
    issuerIdentityKeyFingerprintHex: identityFingerprint,
    subjectSigningKeyFingerprintHex: signingFingerprint,
    subjectKeyAgreementKeyFingerprintHex: agreementFingerprint,
    scopes: ['surface_session'],
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: '2027-01-01T00:00:00.000Z',
    lifecycleOrder: 'seq:0000000000000001',
  };
  const registered = () => store.registerPicoIdentityReaderKey({
    sodium,
    picoIdentityFingerprintHex: identityFingerprint,
    deviceSigningKeyFingerprintHex: signingFingerprint,
    delegationId: DELEGATION_ID,
    deviceKeyAgreementKeyRecord: agreementKeyRecord,
    at: WHILE_ACTIVE,
  });
  const recorded = store.recordPicoIdentityLifecycleEvidence({
    sodium,
    identityKeyRecord,
    delegation: {
      record,
      signatureHex: Buffer.from(sodium.crypto_sign_detached(
        buildPicoIdentityDelegationSignatureInput(record),
        identity.privateKey,
      )).toString('hex'),
    },
    revocations: [],
  });
  if (!recorded.ok) {
    throw new Error(`link mailbox fixture delegation failed: ${recorded.reason}`);
  }
  // ADR 0083. `hasActivePicoIdentityDelegation` reads the registered reader
  // key, so a delegation without one is not active - which is why the test
  // above, with no delegation at all, honours nothing.
  const key = registered();
  if (!key.ok) {
    throw new Error('link mailbox fixture reader key failed');
  }
}
