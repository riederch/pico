import {
  buildPicoHomeDeviceActivationSignatureInput,
  type PicoHomeDeviceActivationSignatureInput,
} from './index.js';
import {
  canonicalJson,
  decodeBase64Url,
  encodeBase64Url,
  picoBase64UrlPattern,
} from './canonical-transport.js';

/**
 * ADR 0130 E3 - the three codes two devices show each other to make one of
 * them a device of the same person.
 *
 * **Why there are three, and not one.** ADR 0109 D3 has the identity root
 * sign the delegation and the *target's own key* co-sign a short-lived Home
 * activation, and that activation binds the digest of the whole evidence -
 * including the signed delegation. So the target cannot sign anything before
 * the sponsor has built it, and the sponsor cannot submit anything before the
 * target has signed. Offer, grant, acceptance is the shortest exchange the
 * ceremony admits, and shortening it further would mean weakening what the
 * two signatures cover.
 *
 * **Why they are codes at all.** The user chose camera and code, like the
 * Recovery Card, and the alternative was not a better transport but a worse
 * trust story: a device with no delegation cannot talk to the Home, and
 * ADR 0107 gives Pico Link no device-to-device path on purpose. What crosses
 * here is public keys, one activation to sign, and one signature - never a
 * private key, and never a secret that could be replayed into a second
 * device: the activation names the exact target keys and expires in minutes.
 *
 * The same transport shape as the Recovery Card, deliberately: a prefix, an
 * unpadded base64url body, and a re-encode comparison that refuses a second
 * spelling of the same bytes.
 */

export const picoDeviceEnrolmentOfferSchema = 'pico.device.enrolment.offer.v1' as const;
export const picoDeviceEnrolmentGrantSchema = 'pico.device.enrolment.grant.v1' as const;
export const picoDeviceEnrolmentAcceptanceSchema =
  'pico.device.enrolment.acceptance.v1' as const;

export const picoDeviceEnrolmentOfferPrefix = 'pico-device-offer-v1:' as const;
export const picoDeviceEnrolmentGrantPrefix = 'pico-device-grant-v1:' as const;
export const picoDeviceEnrolmentAcceptancePrefix = 'pico-device-acceptance-v1:' as const;

/** The Recovery Card's budget, for the same reason: a camera has to read it. */
const maxPicoDeviceEnrolmentBytes = 4_096;

const hex64 = /^[0-9a-f]{64}$/u;
const hex128 = /^[0-9a-f]{128}$/u;
const asciiToken = /^[A-Za-z0-9_.:-]{1,128}$/u;

export interface PicoDeviceEnrolmentDeviceKeys {
  signingKeyFingerprintHex: string;
  signingPublicKeyHex: string;
  keyAgreementKeyFingerprintHex: string;
  keyAgreementPublicKeyHex: string;
}

/**
 * What a device with no Home has to say for itself: two public keys, and
 * nothing else. It carries no name, no request and no address - the sponsor
 * already knows which Home this is about, and a device asking to join one it
 * names would be asking a question nobody can check.
 */
export interface PicoDeviceEnrolmentOffer {
  schema: typeof picoDeviceEnrolmentOfferSchema;
  device: PicoDeviceEnrolmentDeviceKeys;
}

/**
 * What the sponsor hands back: the exact activation to sign, and the trust
 * pins the new device needs to reach the Home afterwards.
 *
 * The pins travel here rather than being fetched, for the reason ADR 0115 U4
 * gives: a pin learned from the endpoint it is meant to check is not a pin.
 * This code is the out-of-band channel, and a person watching two of their
 * own screens is what makes it one.
 */
export interface PicoDeviceEnrolmentGrant {
  schema: typeof picoDeviceEnrolmentGrantSchema;
  activation: PicoHomeDeviceActivationSignatureInput;
  home: {
    coreUrl: string;
    homeHostPicoIdentityFingerprintHex: string;
    host: {
      signingPublicKeyHex: string;
      signingKeyFingerprintHex: string;
      keyAgreementPublicKeyHex: string;
      keyAgreementKeyFingerprintHex: string;
    };
    identity: {
      keyFingerprintHex: string;
      publicKeyHex: string;
    };
  };
}

export interface PicoDeviceEnrolmentAcceptance {
  schema: typeof picoDeviceEnrolmentAcceptanceSchema;
  /** The sponsor's own activation id, so an answer cannot be to another question. */
  activationId: string;
  targetSignatureHex: string;
}

export function buildPicoDeviceEnrolmentOffer(
  device: PicoDeviceEnrolmentDeviceKeys,
): string {
  const offer: PicoDeviceEnrolmentOffer = {
    schema: picoDeviceEnrolmentOfferSchema,
    device: assertDeviceKeys(device),
  };
  return encode(picoDeviceEnrolmentOfferPrefix, offer);
}

export function parsePicoDeviceEnrolmentOffer(transport: string): PicoDeviceEnrolmentOffer {
  const record = decode(transport, picoDeviceEnrolmentOfferPrefix, 'offer');
  assertExactKeys(record, ['schema', 'device'], 'offer');
  if (record.schema !== picoDeviceEnrolmentOfferSchema) {
    throw new Error('invalid_pico_device_enrolment_offer_schema');
  }
  return Object.freeze({
    schema: picoDeviceEnrolmentOfferSchema,
    device: assertDeviceKeys(record.device as PicoDeviceEnrolmentDeviceKeys),
  });
}

export function buildPicoDeviceEnrolmentGrant(
  grant: Omit<PicoDeviceEnrolmentGrant, 'schema'>,
): string {
  return encode(picoDeviceEnrolmentGrantPrefix, assertGrant({
    schema: picoDeviceEnrolmentGrantSchema,
    ...grant,
  }));
}

export function parsePicoDeviceEnrolmentGrant(transport: string): PicoDeviceEnrolmentGrant {
  const record = decode(transport, picoDeviceEnrolmentGrantPrefix, 'grant');
  return assertGrant(record as unknown as PicoDeviceEnrolmentGrant);
}

export function buildPicoDeviceEnrolmentAcceptance(
  acceptance: Omit<PicoDeviceEnrolmentAcceptance, 'schema'>,
): string {
  return encode(picoDeviceEnrolmentAcceptancePrefix, assertAcceptance({
    schema: picoDeviceEnrolmentAcceptanceSchema,
    ...acceptance,
  }));
}

export function parsePicoDeviceEnrolmentAcceptance(
  transport: string,
): PicoDeviceEnrolmentAcceptance {
  const record = decode(transport, picoDeviceEnrolmentAcceptancePrefix, 'acceptance');
  return assertAcceptance(record as unknown as PicoDeviceEnrolmentAcceptance);
}

/**
 * What the new device checks before it signs anything.
 *
 * **The load-bearing check is that the activation names this device's keys.**
 * A signature over an activation for somebody else's keys would be this
 * device putting its name on a stranger's enrolment, and it is the one thing
 * a person looking at two screens cannot see for themselves.
 *
 * The rest is consistency the person also cannot check: that the Home the
 * pins describe is the Home the activation is about, and that the four
 * minutes have not run out.
 */
export function assertPicoDeviceEnrolmentGrantIsFor(
  grant: PicoDeviceEnrolmentGrant,
  device: { signingKeyFingerprintHex: string; keyAgreementKeyFingerprintHex: string },
  now: Date,
): void {
  if (grant.activation.targetDeviceSigningKeyFingerprintHex
    !== device.signingKeyFingerprintHex
    || grant.activation.targetDeviceKeyAgreementKeyFingerprintHex
      !== device.keyAgreementKeyFingerprintHex) {
    throw new Error('pico_device_enrolment_grant_is_for_another_device');
  }
  if (grant.activation.picoIdentityFingerprintHex !== grant.home.identity.keyFingerprintHex) {
    throw new Error('pico_device_enrolment_grant_identity_mismatch');
  }
  if (grant.activation.hostSigningKeyFingerprintHex
    !== grant.home.host.signingKeyFingerprintHex) {
    throw new Error('pico_device_enrolment_grant_host_mismatch');
  }
  if (Date.parse(grant.activation.expiresAt) <= now.getTime()) {
    // Said as expiry rather than as a bad code: the four minutes are the
    // ceremony's, and the answer is to start again rather than to look for a
    // mistake.
    throw new Error('pico_device_enrolment_grant_expired');
  }
}

function encode(prefix: string, payload: unknown): string {
  const bytes = new TextEncoder().encode(canonicalJson(payload));
  if (bytes.byteLength > maxPicoDeviceEnrolmentBytes) {
    throw new Error('pico_device_enrolment_code_too_large');
  }
  return `${prefix}${encodeBase64Url(bytes)}`;
}

function decode(transport: string, prefix: string, kind: string): Record<string, unknown> {
  if (typeof transport !== 'string' || !transport.startsWith(prefix)) {
    throw new Error(`invalid_pico_device_enrolment_${kind}_prefix`);
  }
  const body = transport.slice(prefix.length);
  if (body.length === 0 || body.length % 4 === 1
    || !picoBase64UrlPattern.test(body)) {
    throw new Error(`invalid_pico_device_enrolment_${kind}_body`);
  }
  const bytes = decodeBase64Url(body, `invalid_pico_device_enrolment_${kind}_body`);
  if (bytes.byteLength > maxPicoDeviceEnrolmentBytes
    || encodeBase64Url(bytes) !== body) {
    // A second spelling of the same bytes is refused for the Recovery Card's
    // reason: two codes that mean one thing is one code too many.
    throw new Error(`invalid_pico_device_enrolment_${kind}_body`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new Error(`invalid_pico_device_enrolment_${kind}_body`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`invalid_pico_device_enrolment_${kind}_body`);
  }
  return parsed as Record<string, unknown>;
}

function assertExactKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
  kind: string,
): void {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`invalid_pico_device_enrolment_${kind}_fields`);
  }
}

function assertDeviceKeys(device: PicoDeviceEnrolmentDeviceKeys): PicoDeviceEnrolmentDeviceKeys {
  if (typeof device !== 'object' || device === null) {
    throw new Error('invalid_pico_device_enrolment_offer_fields');
  }
  assertExactKeys(device as unknown as Record<string, unknown>, [
    'signingKeyFingerprintHex',
    'signingPublicKeyHex',
    'keyAgreementKeyFingerprintHex',
    'keyAgreementPublicKeyHex',
  ], 'offer');
  for (const value of [
    device.signingKeyFingerprintHex,
    device.signingPublicKeyHex,
    device.keyAgreementKeyFingerprintHex,
    device.keyAgreementPublicKeyHex,
  ]) {
    if (typeof value !== 'string' || !hex64.test(value)) {
      throw new Error('invalid_pico_device_enrolment_offer_keys');
    }
  }
  return Object.freeze({ ...device });
}

function assertGrant(grant: PicoDeviceEnrolmentGrant): PicoDeviceEnrolmentGrant {
  assertExactKeys(grant as unknown as Record<string, unknown>,
    ['schema', 'activation', 'home'], 'grant');
  if (grant.schema !== picoDeviceEnrolmentGrantSchema) {
    throw new Error('invalid_pico_device_enrolment_grant_schema');
  }
  // The activation's own builder is the validator: one definition of what a
  // valid activation is, and it is the one the signature is taken over.
  buildPicoHomeDeviceActivationSignatureInput(grant.activation);

  const home = grant.home;
  if (typeof home !== 'object' || home === null) {
    throw new Error('invalid_pico_device_enrolment_grant_home');
  }
  assertExactKeys(home as unknown as Record<string, unknown>,
    ['coreUrl', 'homeHostPicoIdentityFingerprintHex', 'host', 'identity'], 'grant');
  if (typeof home.coreUrl !== 'string'
    || !(home.coreUrl.startsWith('http://') || home.coreUrl.startsWith('https://'))
    || home.coreUrl.length > 512) {
    throw new Error('invalid_pico_device_enrolment_grant_core_url');
  }
  assertExactKeys(home.host as unknown as Record<string, unknown>, [
    'signingPublicKeyHex',
    'signingKeyFingerprintHex',
    'keyAgreementPublicKeyHex',
    'keyAgreementKeyFingerprintHex',
  ], 'grant');
  assertExactKeys(home.identity as unknown as Record<string, unknown>,
    ['keyFingerprintHex', 'publicKeyHex'], 'grant');
  for (const value of [
    home.homeHostPicoIdentityFingerprintHex,
    home.host.signingPublicKeyHex,
    home.host.signingKeyFingerprintHex,
    home.host.keyAgreementPublicKeyHex,
    home.host.keyAgreementKeyFingerprintHex,
    home.identity.keyFingerprintHex,
    home.identity.publicKeyHex,
  ]) {
    if (typeof value !== 'string' || !hex64.test(value)) {
      throw new Error('invalid_pico_device_enrolment_grant_home');
    }
  }
  return Object.freeze({
    schema: picoDeviceEnrolmentGrantSchema,
    activation: Object.freeze({ ...grant.activation }),
    home: Object.freeze({
      coreUrl: home.coreUrl,
      homeHostPicoIdentityFingerprintHex: home.homeHostPicoIdentityFingerprintHex,
      host: Object.freeze({ ...home.host }),
      identity: Object.freeze({ ...home.identity }),
    }),
  });
}

function assertAcceptance(
  acceptance: PicoDeviceEnrolmentAcceptance,
): PicoDeviceEnrolmentAcceptance {
  assertExactKeys(acceptance as unknown as Record<string, unknown>,
    ['schema', 'activationId', 'targetSignatureHex'], 'acceptance');
  if (acceptance.schema !== picoDeviceEnrolmentAcceptanceSchema) {
    throw new Error('invalid_pico_device_enrolment_acceptance_schema');
  }
  if (typeof acceptance.activationId !== 'string'
    || !asciiToken.test(acceptance.activationId)) {
    throw new Error('invalid_pico_device_enrolment_acceptance_activation');
  }
  if (typeof acceptance.targetSignatureHex !== 'string'
    || !hex128.test(acceptance.targetSignatureHex)) {
    throw new Error('invalid_pico_device_enrolment_acceptance_signature');
  }
  return Object.freeze({ ...acceptance });
}
