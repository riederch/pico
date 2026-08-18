import { describe, expect, it } from 'vitest';
import {
  assertPicoDeviceEnrolmentGrantIsFor,
  buildPicoDeviceEnrolmentAcceptance,
  buildPicoDeviceEnrolmentGrant,
  buildPicoDeviceEnrolmentOffer,
  parsePicoDeviceEnrolmentAcceptance,
  parsePicoDeviceEnrolmentGrant,
  parsePicoDeviceEnrolmentOffer,
  picoDeviceEnrolmentGrantPrefix,
  picoDeviceEnrolmentOfferPrefix,
} from './device-enrolment.js';

/**
 * ADR 0130 E3. The three codes, and what each one refuses.
 */
const hex = (seed: string): string => seed.repeat(64).slice(0, 64);

const device = {
  signingKeyFingerprintHex: hex('a1'),
  signingPublicKeyHex: hex('a2'),
  keyAgreementKeyFingerprintHex: hex('a3'),
  keyAgreementPublicKeyHex: hex('a4'),
};

const activation = {
  suite: 'pico.identity.v1',
  activationId: 'device_enrollment_0123456789abcdef',
  action: 'enroll' as const,
  homeId: `home_${hex('b1').slice(0, 32)}`,
  hostSigningKeyFingerprintHex: hex('c1'),
  picoIdentityFingerprintHex: hex('d1'),
  sponsorDelegationId: 'delegation_sponsor0123456789abcd',
  sponsorDeviceSigningKeyFingerprintHex: hex('e1'),
  sponsorDeviceKeyAgreementKeyFingerprintHex: hex('e2'),
  targetDelegationId: 'delegation_target0123456789abcde',
  targetDeviceSigningKeyFingerprintHex: device.signingKeyFingerprintHex,
  targetDeviceKeyAgreementKeyFingerprintHex: device.keyAgreementKeyFingerprintHex,
  lifecycleEvidenceDigestHex: hex('f1'),
  observedLifecycleOrder: 'seq:0000000000000003',
  createdAt: '2026-08-18T10:00:00.000Z',
  expiresAt: '2026-08-18T10:04:00.000Z',
};

const home = {
  coreUrl: 'http://192.168.1.20:3000',
  homeHostPicoIdentityFingerprintHex: hex('d1'),
  host: {
    signingPublicKeyHex: hex('c2'),
    signingKeyFingerprintHex: hex('c1'),
    keyAgreementPublicKeyHex: hex('c3'),
    keyAgreementKeyFingerprintHex: hex('c4'),
  },
  identity: {
    keyFingerprintHex: hex('d1'),
    publicKeyHex: hex('d2'),
  },
};

describe('ADR 0130 E3 - the codes two devices show each other', () => {
  it('carries public keys and nothing else in the offer', () => {
    const code = buildPicoDeviceEnrolmentOffer(device);
    expect(code.startsWith(picoDeviceEnrolmentOfferPrefix)).toBe(true);
    expect(parsePicoDeviceEnrolmentOffer(code).device).toEqual(device);
    /**
     * A device with no Home says two public keys. Anything else it could say
     * - a name, an address, which Home it wants - would be a claim the
     * sponsor cannot check and the person cannot see.
     */
    expect(Object.keys(parsePicoDeviceEnrolmentOffer(code))).toEqual(['schema', 'device']);
  });

  it('refuses a second spelling of the same bytes', () => {
    // The Recovery Card's rule. A tolerant decoder would accept a body whose
    // final unused bits are not zero, which is one code with two spellings.
    const code = buildPicoDeviceEnrolmentOffer(device);
    expect(() => parsePicoDeviceEnrolmentOffer(`${code}=`)).toThrow('offer_body');
    expect(() => parsePicoDeviceEnrolmentOffer(code.replace(picoDeviceEnrolmentOfferPrefix, '')))
      .toThrow('offer_prefix');
    expect(() => parsePicoDeviceEnrolmentOffer(
      `${picoDeviceEnrolmentOfferPrefix}${'A'.repeat(9)}`,
    )).toThrow('offer_body');
  });

  it('validates the activation with the builder the signature is taken over', () => {
    const code = buildPicoDeviceEnrolmentGrant({ activation, home });
    const parsed = parsePicoDeviceEnrolmentGrant(code);
    expect(parsed.activation).toEqual(activation);
    /**
     * The whole grant back, field for field. The format is a fixed element
     * order with a flatten on one side and an unflatten on the other, and a
     * round trip is the only thing that proves those two agree - a field read
     * into the wrong slot would still parse, and would sign the wrong bytes.
     */
    expect(parsed.home).toEqual(home);
    // One definition of a valid activation, not a second one here.
    expect(() => buildPicoDeviceEnrolmentGrant({
      activation: { ...activation, expiresAt: activation.createdAt },
      home,
    })).toThrow();
    expect(() => buildPicoDeviceEnrolmentGrant({
      activation: { ...activation, action: 'revoke' as never },
      home,
    })).toThrow();
  });

  it('refuses a grant that names another device', () => {
    /**
     * The check the person at the two screens cannot make. Signing an
     * activation for somebody else's keys would put this device's name on a
     * stranger's enrolment.
     */
    const grant = parsePicoDeviceEnrolmentGrant(buildPicoDeviceEnrolmentGrant({
      activation,
      home,
    }));
    const now = new Date('2026-08-18T10:01:00.000Z');
    expect(() => assertPicoDeviceEnrolmentGrantIsFor(grant, device, now)).not.toThrow();
    expect(() => assertPicoDeviceEnrolmentGrantIsFor(grant, {
      signingKeyFingerprintHex: hex('99'),
      keyAgreementKeyFingerprintHex: device.keyAgreementKeyFingerprintHex,
    }, now)).toThrow('another_device');
    expect(() => assertPicoDeviceEnrolmentGrantIsFor(grant, {
      signingKeyFingerprintHex: device.signingKeyFingerprintHex,
      keyAgreementKeyFingerprintHex: hex('99'),
    }, now)).toThrow('another_device');
  });

  it('refuses pins that describe a different Home than the activation', () => {
    const identityMismatch = parsePicoDeviceEnrolmentGrant(buildPicoDeviceEnrolmentGrant({
      activation,
      home: { ...home, identity: { ...home.identity, keyFingerprintHex: hex('90') } },
    }));
    expect(() => assertPicoDeviceEnrolmentGrantIsFor(
      identityMismatch,
      device,
      new Date('2026-08-18T10:01:00.000Z'),
    )).toThrow('identity_mismatch');

    const hostMismatch = parsePicoDeviceEnrolmentGrant(buildPicoDeviceEnrolmentGrant({
      activation,
      home: { ...home, host: { ...home.host, signingKeyFingerprintHex: hex('91') } },
    }));
    expect(() => assertPicoDeviceEnrolmentGrantIsFor(
      hostMismatch,
      device,
      new Date('2026-08-18T10:01:00.000Z'),
    )).toThrow('host_mismatch');
  });

  it('refuses a grant whose four minutes have run out', () => {
    const grant = parsePicoDeviceEnrolmentGrant(buildPicoDeviceEnrolmentGrant({
      activation,
      home,
    }));
    expect(() => assertPicoDeviceEnrolmentGrantIsFor(
      grant,
      device,
      new Date('2026-08-18T10:04:00.000Z'),
    )).toThrow('expired');
  });

  it('binds an acceptance to the question it answers', () => {
    const code = buildPicoDeviceEnrolmentAcceptance({
      activationId: activation.activationId,
      targetSignatureHex: 'ab'.repeat(64),
    });
    expect(parsePicoDeviceEnrolmentAcceptance(code)).toEqual({
      schema: 'pico.device.enrolment.acceptance.v1',
      activationId: activation.activationId,
      targetSignatureHex: 'ab'.repeat(64),
    });
    expect(() => buildPicoDeviceEnrolmentAcceptance({
      activationId: activation.activationId,
      targetSignatureHex: 'ab'.repeat(63),
    })).toThrow('acceptance_signature');
  });

  it('stays inside what a camera can read', () => {
    /**
     * The grant is the big one: a whole activation plus the trust pins. The
     * Recovery Card's budget is 4,096 canonical bytes and a camera already
     * reads one of those, so this is measured against the same ceiling rather
     * than against a hope.
     */
    /**
     * Measured, and the measurement is why this format is bytes rather than
     * JSON. As JSON the grant was 2,536 characters: a version-37 QR at error
     * correction L, and it did not fit at level M at all - the level the
     * Recovery Card is printed at. As elements it is 1,079 characters, which
     * is version 27 at M, and the same content.
     *
     * The bounds are tripwires for a field that doubles one of these, not
     * guesses at what a camera can read.
     */
    expect(buildPicoDeviceEnrolmentGrant({ activation, home }).length).toBeLessThan(1_400);
    expect(buildPicoDeviceEnrolmentOffer(device).length).toBeLessThan(300);
    expect(buildPicoDeviceEnrolmentAcceptance({
      activationId: activation.activationId,
      targetSignatureHex: 'ab'.repeat(64),
    }).length).toBeLessThan(250);
  });
});
