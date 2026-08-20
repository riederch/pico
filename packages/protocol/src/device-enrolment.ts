import {
  buildPicoHomeDeviceActivationSignatureInput,
  type PicoHomeDeviceActivationSignatureInput,
} from './index.js';
import { isPicoHomeCoreUrl } from './home-address.js';
import {
  decodeBase64Url,
  decodeCanonicalElements,
  decodeCanonicalText,
  encodeBase64Url,
  encodeCanonicalElements,
  picoBase64UrlPattern,
  picoBytesToHex,
  picoHexToBytes,
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

/**
 * The longest a code can be as a person meets it: prefix plus base64url.
 *
 * Exported because whoever *reads* one needs a cap, and until 2026-08-20 the
 * desktop's typed-entry field carried 8,192 - a round number belonging to
 * nobody, three thousand characters past anything this parser would accept.
 * A field that stops at the protocol's own limit refuses while the person is
 * still typing; one that stops later hands the refusal to the parser, which
 * can only say the code is malformed.
 */
export const maxPicoDeviceEnrolmentTransportLength =
  picoDeviceEnrolmentAcceptancePrefix.length
  + Math.ceil((maxPicoDeviceEnrolmentBytes * 4) / 3);

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
  const values: Record<string, string> = {};
  flatten(assertDeviceKeys(device), '', values);
  return encode(
    picoDeviceEnrolmentOfferPrefix,
    offerFields,
    values,
    'invalid_pico_device_enrolment_offer_keys',
  );
}

export function parsePicoDeviceEnrolmentOffer(transport: string): PicoDeviceEnrolmentOffer {
  const values = decode(transport, picoDeviceEnrolmentOfferPrefix, offerFields, 'offer');
  return Object.freeze({
    schema: picoDeviceEnrolmentOfferSchema,
    device: assertDeviceKeys(unflatten(values) as unknown as PicoDeviceEnrolmentDeviceKeys),
  });
}

export function buildPicoDeviceEnrolmentGrant(
  grant: Omit<PicoDeviceEnrolmentGrant, 'schema'>,
): string {
  const checked = assertGrant({ schema: picoDeviceEnrolmentGrantSchema, ...grant });
  const values: Record<string, string> = {};
  flatten({ activation: checked.activation, home: checked.home }, '', values);
  return encode(
    picoDeviceEnrolmentGrantPrefix,
    grantFields,
    values,
    'invalid_pico_device_enrolment_grant_fields',
  );
}

export function parsePicoDeviceEnrolmentGrant(transport: string): PicoDeviceEnrolmentGrant {
  const values = decode(transport, picoDeviceEnrolmentGrantPrefix, grantFields, 'grant');
  return assertGrant({
    schema: picoDeviceEnrolmentGrantSchema,
    ...unflatten(values),
  } as unknown as PicoDeviceEnrolmentGrant);
}

export function buildPicoDeviceEnrolmentAcceptance(
  acceptance: Omit<PicoDeviceEnrolmentAcceptance, 'schema'>,
): string {
  const checked = assertAcceptance({
    schema: picoDeviceEnrolmentAcceptanceSchema,
    ...acceptance,
  });
  return encode(
    picoDeviceEnrolmentAcceptancePrefix,
    acceptanceFields,
    {
      activationId: checked.activationId,
      targetSignatureHex: checked.targetSignatureHex,
    },
    'invalid_pico_device_enrolment_acceptance_signature',
  );
}

export function parsePicoDeviceEnrolmentAcceptance(
  transport: string,
): PicoDeviceEnrolmentAcceptance {
  const values = decode(
    transport,
    picoDeviceEnrolmentAcceptancePrefix,
    acceptanceFields,
    'acceptance',
  );
  return assertAcceptance({
    schema: picoDeviceEnrolmentAcceptanceSchema,
    activationId: values.activationId!,
    targetSignatureHex: values.targetSignatureHex!,
  });
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

type ElementKind = 'hex' | 'text';

/**
 * The field order **is** the format, and it is written once per code.
 *
 * Build and parse both read this list, so the two cannot drift into a code
 * one side writes and the other reads as something else - the failure that
 * would otherwise show up as a signature nobody can explain.
 */
const offerFields: readonly (readonly [string, ElementKind])[] = [
  ['signingKeyFingerprintHex', 'hex'],
  ['signingPublicKeyHex', 'hex'],
  ['keyAgreementKeyFingerprintHex', 'hex'],
  ['keyAgreementPublicKeyHex', 'hex'],
];

const grantFields: readonly (readonly [string, ElementKind])[] = [
  ['activation.suite', 'text'],
  ['activation.activationId', 'text'],
  ['activation.action', 'text'],
  ['activation.homeId', 'text'],
  ['activation.hostSigningKeyFingerprintHex', 'hex'],
  ['activation.picoIdentityFingerprintHex', 'hex'],
  ['activation.sponsorDelegationId', 'text'],
  ['activation.sponsorDeviceSigningKeyFingerprintHex', 'hex'],
  ['activation.sponsorDeviceKeyAgreementKeyFingerprintHex', 'hex'],
  ['activation.targetDelegationId', 'text'],
  ['activation.targetDeviceSigningKeyFingerprintHex', 'hex'],
  ['activation.targetDeviceKeyAgreementKeyFingerprintHex', 'hex'],
  ['activation.lifecycleEvidenceDigestHex', 'hex'],
  ['activation.observedLifecycleOrder', 'text'],
  ['activation.createdAt', 'text'],
  ['activation.expiresAt', 'text'],
  ['home.coreUrl', 'text'],
  ['home.homeHostPicoIdentityFingerprintHex', 'hex'],
  ['home.host.signingPublicKeyHex', 'hex'],
  ['home.host.signingKeyFingerprintHex', 'hex'],
  ['home.host.keyAgreementPublicKeyHex', 'hex'],
  ['home.host.keyAgreementKeyFingerprintHex', 'hex'],
  ['home.identity.keyFingerprintHex', 'hex'],
  ['home.identity.publicKeyHex', 'hex'],
];

const acceptanceFields: readonly (readonly [string, ElementKind])[] = [
  ['activationId', 'text'],
  ['targetSignatureHex', 'hex'],
];

const textEncoder = new TextEncoder();

function encode(
  prefix: string,
  fields: readonly (readonly [string, ElementKind])[],
  values: Record<string, string>,
  reason: string,
): string {
  const elements = fields.map(([key, kind]) => {
    const value = values[key];
    if (typeof value !== 'string') {
      throw new Error(reason);
    }
    return kind === 'text' ? textEncoder.encode(value) : picoHexToBytes(value, reason);
  });
  const bytes = encodeCanonicalElements(elements);
  if (bytes.byteLength > maxPicoDeviceEnrolmentBytes) {
    throw new Error('pico_device_enrolment_code_too_large');
  }
  return `${prefix}${encodeBase64Url(bytes)}`;
}

function decode(
  transport: string,
  prefix: string,
  fields: readonly (readonly [string, ElementKind])[],
  kind: string,
): Record<string, string> {
  if (typeof transport !== 'string' || !transport.startsWith(prefix)) {
    throw new Error(`invalid_pico_device_enrolment_${kind}_prefix`);
  }
  const reason = `invalid_pico_device_enrolment_${kind}_body`;
  const body = transport.slice(prefix.length);
  if (body.length === 0 || body.length % 4 === 1 || !picoBase64UrlPattern.test(body)) {
    throw new Error(reason);
  }
  const bytes = decodeBase64Url(body, reason);
  if (bytes.byteLength > maxPicoDeviceEnrolmentBytes || encodeBase64Url(bytes) !== body) {
    // A second spelling of the same bytes is refused for the Recovery Card's
    // reason: two codes that mean one thing is one code too many.
    throw new Error(reason);
  }
  const elements = decodeCanonicalElements(bytes, fields.length, reason);
  const values: Record<string, string> = {};
  for (const [index, [key, elementKind]] of fields.entries()) {
    const element = elements[index]!;
    if (elementKind === 'text') {
      values[key] = decodeCanonicalText(element, reason);
    } else {
      values[key] = picoBytesToHex(element);
    }
  }
  return values;
}

function flatten(value: unknown, prefix: string, into: Record<string, string>): void {
  if (typeof value !== 'object' || value === null) {
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    if (typeof entry === 'object' && entry !== null) {
      flatten(entry, path, into);
    } else if (typeof entry === 'string') {
      into[path] = entry;
    }
  }
}

function unflatten(values: Record<string, string>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(values)) {
    const parts = path.split('.');
    let cursor = output;
    for (const part of parts.slice(0, -1)) {
      cursor[part] ??= {};
      cursor = cursor[part] as Record<string, unknown>;
    }
    cursor[parts[parts.length - 1]!] = value;
  }
  return output;
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
  // The rule lives in `home-address.ts` since 2026-08-20, because this was
  // the strictest of four and the only one a person met three ceremonies
  // after typing the address. It refused `http://exa mple:3000` nowhere - a
  // prefix check cannot see a space - and refuses it here now.
  if (!isPicoHomeCoreUrl(home.coreUrl)) {
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
