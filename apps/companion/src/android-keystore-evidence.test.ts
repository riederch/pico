/**
 * ADR 0131 A3. Die Belege, die von Android in den Kern übergehen.
 *
 * Der Ausgangspunkt jedes Tests hier ist **das, was tatsächlich gemessen
 * wurde**: ein Galaxy A55, Android 16, Patchstand 2026-07-05, gelesen mit
 * `tools/android-runtime-probe/apk/run-keystore-probe.sh` am 2026-08-21.
 * Ein erfundener Beleg würde die Prüfungen genauso bestehen und nichts
 * darüber sagen, ob die Form die richtige ist.
 */
import { describe, expect, it } from 'vitest';
import {
  parsePicoCompanionAndroidKeystoreEvidence,
  requirePicoCompanionAndroidKeystoreLevel,
  type PicoCompanionAndroidKeystoreEvidence,
} from './platform-secrets.js';

const measuredOnTheGalaxyA55: PicoCompanionAndroidKeystoreEvidence = {
  platform: 'android',
  keyInfoLevel: 'trusted_environment',
  attestedKeyLevel: 'trusted_environment',
  attestationLevel: 'trusted_environment',
  attestationRoot: 'google_ec_key_attestation_ca1',
  challengeMatches: true,
  verifiedBootState: 'verified',
  deviceLocked: true,
  osPatchLevel: '202607',
  bootPatchLevel: '20260705',
};

describe('the Android keystore verdict', () => {
  it('accepts what the phone actually reported', () => {
    expect(requirePicoCompanionAndroidKeystoreLevel(measuredOnTheGalaxyA55))
      .toBe('trusted_environment');
  });

  it('accepts StrongBox, which this phone does not have', () => {
    // Das Telefon wirft `StrongBoxUnavailableException`. Ein Gerät mit
    // sicherem Element ist besser und nicht anders - der Wert muss durch,
    // sonst wäre die Liste eine Liste mit einem Eintrag.
    expect(requirePicoCompanionAndroidKeystoreLevel({
      ...measuredOnTheGalaxyA55,
      keyInfoLevel: 'strongbox',
      attestedKeyLevel: 'strongbox',
      attestationLevel: 'strongbox',
    })).toBe('strongbox');
  });

  it('accepts the older RSA root, which most phones still chain to', () => {
    expect(requirePicoCompanionAndroidKeystoreLevel({
      ...measuredOnTheGalaxyA55,
      attestationRoot: 'google_rsa_f92009e853b6b045',
    })).toBe('trusted_environment');
  });

  it('refuses a chain that reached no pinned root', () => {
    expect(() => requirePicoCompanionAndroidKeystoreLevel({
      ...measuredOnTheGalaxyA55,
      attestationRoot: 'none',
    })).toThrow('platform_keystore_attestation_unrooted');
  });

  it('refuses a root nobody pinned, however plausible its name', () => {
    expect(() => requirePicoCompanionAndroidKeystoreLevel({
      ...measuredOnTheGalaxyA55,
      attestationRoot: 'google_ec_key_attestation_ca2',
    })).toThrow('platform_keystore_attestation_unrooted');
  });

  it('refuses a chain whose challenge came back changed', () => {
    // Eine echte Kette von einem echten Telefon, nur über einen anderen
    // Schlüssel als den, um den gefragt wurde. Das ist der Wiedereinspiel-
    // fall, und er sieht bis auf dieses eine Feld tadellos aus.
    expect(() => requirePicoCompanionAndroidKeystoreLevel({
      ...measuredOnTheGalaxyA55,
      challengeMatches: false,
    })).toThrow('platform_keystore_attestation_challenge_mismatch');
  });

  it('refuses software by its own name, not as an unknown value', () => {
    expect(() => requirePicoCompanionAndroidKeystoreLevel({
      ...measuredOnTheGalaxyA55,
      keyInfoLevel: 'software',
      attestedKeyLevel: 'software',
      attestationLevel: 'software',
    })).toThrow('platform_keystore_software_refused');
  });

  it('tells an unknown level apart from a refused one', () => {
    expect(() => requirePicoCompanionAndroidKeystoreLevel({
      ...measuredOnTheGalaxyA55,
      keyInfoLevel: 'trusted_environment_v2',
      attestedKeyLevel: 'trusted_environment_v2',
      attestationLevel: 'trusted_environment_v2',
    })).toThrow('platform_keystore_level_unknown');
  });

  it('refuses an attestation produced in software about a TEE key', () => {
    // Der Grund, warum `attestationLevel` ein eigenes Feld ist. Wer die
    // Aussage macht, entscheidet mit, was sie wert ist.
    expect(() => requirePicoCompanionAndroidKeystoreLevel({
      ...measuredOnTheGalaxyA55,
      attestationLevel: 'software',
    })).toThrow('platform_keystore_software_refused');
  });

  it('refuses two sources that disagree instead of believing the weaker', () => {
    expect(() => requirePicoCompanionAndroidKeystoreLevel({
      ...measuredOnTheGalaxyA55,
      keyInfoLevel: 'strongbox',
    })).toThrow('platform_keystore_evidence_disagrees');
  });

  it('refuses them the same way round', () => {
    expect(() => requirePicoCompanionAndroidKeystoreLevel({
      ...measuredOnTheGalaxyA55,
      attestedKeyLevel: 'strongbox',
    })).toThrow('platform_keystore_evidence_disagrees');
  });

  it('checks the root before it reads what the extension says', () => {
    // Die Reihenfolge ist die Aussage: eine Erweiterung ohne geprüfte Kette
    // ist unsignierter Text, und ihr Inhalt darf keine Rolle spielen - auch
    // dann nicht, wenn er der schlechtere von zwei Gründen wäre.
    expect(() => requirePicoCompanionAndroidKeystoreLevel({
      ...measuredOnTheGalaxyA55,
      attestationRoot: 'none',
      keyInfoLevel: 'software',
      attestedKeyLevel: 'software',
      attestationLevel: 'software',
      challengeMatches: false,
    })).toThrow('platform_keystore_attestation_unrooted');
  });

  it('does not judge an unlocked bootloader, and says so by accepting it', () => {
    // Bewusst offen gelassen, nicht vergessen: die Attestierung sagt hier
    // ehrlich `unverified`, und ob pico auf so einem Gerät läuft, ist eine
    // Produktentscheidung. Dieser Test hält fest, welche Antwort heute gilt,
    // damit ein Wechsel auffällt statt zu passieren.
    expect(requirePicoCompanionAndroidKeystoreLevel({
      ...measuredOnTheGalaxyA55,
      verifiedBootState: 'unverified',
      deviceLocked: false,
    })).toBe('trusted_environment');
  });
});

describe('reading the evidence off the wire', () => {
  it('reads back what the phone reported', () => {
    expect(parsePicoCompanionAndroidKeystoreEvidence(
      JSON.parse(JSON.stringify(measuredOnTheGalaxyA55)),
    )).toEqual(measuredOnTheGalaxyA55);
  });

  it.each([
    'keyInfoLevel',
    'attestedKeyLevel',
    'attestationLevel',
    'attestationRoot',
    'challengeMatches',
    'verifiedBootState',
    'deviceLocked',
    'osPatchLevel',
    'bootPatchLevel',
  ])('refuses evidence with no %s rather than reading it as fine', (field) => {
    const missing: Record<string, unknown> = { ...measuredOnTheGalaxyA55 };
    delete missing[field];
    expect(() => parsePicoCompanionAndroidKeystoreEvidence(missing))
      .toThrow('platform_keystore_evidence_malformed');
  });

  it('refuses a truthy string where a flag belongs', () => {
    // `"false"` ist wahr, und genau daran stirbt so etwas.
    expect(() => parsePicoCompanionAndroidKeystoreEvidence({
      ...measuredOnTheGalaxyA55,
      challengeMatches: 'false',
    })).toThrow('platform_keystore_evidence_malformed');
  });

  it('refuses an empty string where a value belongs', () => {
    expect(() => parsePicoCompanionAndroidKeystoreEvidence({
      ...measuredOnTheGalaxyA55,
      attestationRoot: '',
    })).toThrow('platform_keystore_evidence_malformed');
  });

  it.each([null, undefined, 'android', 42, []])(
    'refuses %s, which is not evidence at all',
    (nonsense) => {
      expect(() => parsePicoCompanionAndroidKeystoreEvidence(nonsense))
        .toThrow('platform_keystore_evidence_malformed');
    },
  );

  it('refuses evidence that does not say it is from Android', () => {
    expect(() => parsePicoCompanionAndroidKeystoreEvidence({
      ...measuredOnTheGalaxyA55,
      platform: 'linux',
    })).toThrow('platform_keystore_evidence_malformed');
  });
});
