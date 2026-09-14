import {
  buildPicoHomeContinuitySignatureInput,
  picoHomeSignatureInputLabels,
  buildPicoHomeDeviceActivationSignatureInput,
  buildPicoHomeDeviceRecoveryClaimSignatureInput,
  buildPicoHomeDeviceRecoveryPrepareSignatureInput,
  buildPicoIdentityDelegationSignatureInput,
  buildPicoIdentityRevocationSignatureInput,
  picoHomeDeviceLifecycleCanonicalLabels,
  picoHomeDeviceRecoveryCanonicalLabels,
  picoHomeDeviceRecoveryTiming,
  picoIdentitySignatureInputLabels,
  picoIdentitySuite,
  type PicoHomeDeviceActivationSignatureInput,
  type PicoHomeDeviceRecoveryClaimSignatureInput,
  type PicoHomeDeviceRecoveryPrepareSignatureInput,
  type PicoHomeContinuitySignatureInput,
  type PicoHomeMembershipSignatureInput,
  type PicoIdentityDelegationSignatureInput,
  type PicoIdentityRevocationSignatureInput,
  picoVaultPersonKeyRoles,
} from '@pico/protocol';
import { describe, expect, it } from 'vitest';
import {
  buildPicoVaultSignatureInputFromFields,
  renderPicoVaultApprovalStatement,
} from './sign-rendering.js';
import { picoDisplayFingerprint } from '@pico/protocol/fingerprint-display';
import { picoDisplayDate } from '@pico/protocol/when-display';
import { picoVaultCanSignLabel, picoVaultSignableLabels } from '@pico/vault';
import {
  picoVaultDaemonSignatureNeedsApproval,
} from './protocol.js';

/**
 * Derived here too, and that is the point of the change it pins. A literal
 * `48` in the fixture would agree with a literal `48` in the renderer while
 * both disagreed with the delay the ceremony enforces - which is the only one
 * of the three a person is actually subject to.
 */
const vetoHours = picoHomeDeviceRecoveryTiming.vetoDelayMs / (60 * 60 * 1_000);

describe('ADR 0109 device lifecycle approval rendering', () => {
  it('shows the exact device target, scopes, validity and delegation action', () => {
    const delegation: PicoIdentityDelegationSignatureInput = {
      suite: picoIdentitySuite,
      delegationId: 'delegation_render_device_0001',
      issuerIdentityKeyFingerprintHex: '11'.repeat(32),
      subjectSigningKeyFingerprintHex: '22'.repeat(32),
      subjectKeyAgreementKeyFingerprintHex: '33'.repeat(32),
      scopes: ['surface_session', 'decrypt_domain'],
      validFrom: '2026-07-30T12:00:00.000Z',
      validUntil: '2027-07-30T12:00:00.000Z',
      lifecycleOrder: 'seq:0000000000000002',
    };

    expect(buildPicoVaultSignatureInputFromFields(
      picoIdentitySignatureInputLabels.delegation,
      delegation,
    )).toEqual(buildPicoIdentityDelegationSignatureInput(delegation));
    expect(renderPicoVaultApprovalStatement(
      picoIdentitySignatureInputLabels.delegation,
      delegation,
    )).toBe(
      'Create device authority: delegate surface_session, decrypt_domain '
      + 'to device keys 22222222…22222222 and 33333333…33333333 '
      // Asserted through the rule rather than as a literal, because the answer
      // is the reader's own day: a fixture pinned to `2027-07-30` passes in
      // Vienna and fails in Auckland, which would make this test a statement
      // about the machine running it.
      + `from ${picoDisplayDate(delegation.validFrom)} `
      + `until ${picoDisplayDate(delegation.validUntil)}.`,
    );
  });

  it('renders the revocation action with an explicit last-remote-path warning', () => {
    const revocation: PicoIdentityRevocationSignatureInput = {
      suite: picoIdentitySuite,
      revocationId: 'revocation_render_device_0001',
      issuerIdentityKeyFingerprintHex: '11'.repeat(32),
      subjectKind: 'delegation',
      subjectRef: 'delegation_render_device_0001',
      reasonCategory: 'device_retired',
      revokedAt: '2026-07-30T12:05:00.000Z',
      lifecycleOrder: 'seq:0000000000000003',
    };

    expect(buildPicoVaultSignatureInputFromFields(
      picoIdentitySignatureInputLabels.revocation,
      revocation,
    )).toEqual(buildPicoIdentityRevocationSignatureInput(revocation));
    expect(renderPicoVaultApprovalStatement(
      picoIdentitySignatureInputLabels.revocation,
      revocation,
    )).toBe(
      'Revoke delegation delegation_render_device_0001 (device_retired). '
      + 'Warning: this may close the last remote device path.',
    );
  });

  it('renders the host-key rotation with its whole consequence (ADR 0115)', () => {
    const continuity: PicoHomeContinuitySignatureInput = {
      suite: picoIdentitySuite,
      continuityId: 'hostrot_render_0001',
      homeId: 'home_render_0001',
      outgoingHostSigningKeyFingerprintHex: '44'.repeat(32),
      outgoingHostKeyAgreementKeyFingerprintHex: '55'.repeat(32),
      incomingHostSigningKeyFingerprintHex: '66'.repeat(32),
      incomingHostKeyAgreementKeyFingerprintHex: '77'.repeat(32),
      homeHostPicoIdentityFingerprintHex: '88'.repeat(32),
      reasonCategory: 'host_key_rotated',
      changedAt: '2026-08-02T10:00:00.000Z',
      lifecycleOrder: 'seq:0000000000000002',
    };

    expect(buildPicoVaultSignatureInputFromFields(
      picoHomeSignatureInputLabels.continuity,
      continuity,
    )).toEqual(buildPicoHomeContinuitySignatureInput(continuity));
    // The acceptance is the one signature a stolen host disk cannot produce,
    // so the sentence it approves must carry everything it retires.
    expect(renderPicoVaultApprovalStatement(
      picoHomeSignatureInputLabels.continuity,
      continuity,
    )).toBe(
      'Rotate the host keys of Home home_render_0001 (host_key_rotated): '
      + 'retire 44444444…44444444 and accept 66666666…66666666 as the only host key. '
      + 'Every printed Recovery Card becomes stale and must be re-issued.',
    );
  });

  it('builds target activation bytes but exposes no approval renderer', () => {
    const activation: PicoHomeDeviceActivationSignatureInput = {
      suite: picoIdentitySuite,
      activationId: 'activation_render_device_0001',
      action: 'enroll',
      homeId: 'home_render_device_0001',
      hostSigningKeyFingerprintHex: '11'.repeat(32),
      picoIdentityFingerprintHex: '22'.repeat(32),
      sponsorDelegationId: 'delegation_render_sponsor_0001',
      sponsorDeviceSigningKeyFingerprintHex: '33'.repeat(32),
      sponsorDeviceKeyAgreementKeyFingerprintHex: '44'.repeat(32),
      targetDelegationId: 'delegation_render_target_0001',
      targetDeviceSigningKeyFingerprintHex: '55'.repeat(32),
      targetDeviceKeyAgreementKeyFingerprintHex: '66'.repeat(32),
      lifecycleEvidenceDigestHex: '77'.repeat(32),
      observedLifecycleOrder: 'seq:0000000000000001',
      createdAt: '2026-07-30T12:00:00.000Z',
      expiresAt: '2026-07-30T12:04:00.000Z',
    };

    expect(buildPicoVaultSignatureInputFromFields(
      picoHomeDeviceLifecycleCanonicalLabels.activation,
      activation,
    )).toEqual(buildPicoHomeDeviceActivationSignatureInput(activation));
    expect(renderPicoVaultApprovalStatement(
      picoHomeDeviceLifecycleCanonicalLabels.activation,
      activation,
    )).toBeUndefined();
  });

  it('renders root recovery while keeping the target co-signature exempt', () => {
    const prepare: PicoHomeDeviceRecoveryPrepareSignatureInput = {
      suite: picoIdentitySuite,
      preparationId: 'prepare_render_0001',
      homeId: 'home_render_recovery_0001',
      hostSigningKeyFingerprintHex: '11'.repeat(32),
      hostKeyAgreementKeyFingerprintHex: '22'.repeat(32),
      picoIdentityFingerprintHex: '33'.repeat(32),
      targetDelegationId: 'delegation_render_recovery_0001',
      targetDeviceSigningKeyFingerprintHex: '44'.repeat(32),
      targetDeviceKeyAgreementKeyFingerprintHex: '55'.repeat(32),
      createdAt: '2026-07-31T09:59:00.000Z',
      expiresAt: '2026-07-31T10:04:00.000Z',
    };
    const claim: PicoHomeDeviceRecoveryClaimSignatureInput = {
      suite: picoIdentitySuite,
      recoveryId: 'recovery_render_0001',
      homeId: 'home_render_recovery_0001',
      hostSigningKeyFingerprintHex: '11'.repeat(32),
      hostKeyAgreementKeyFingerprintHex: '22'.repeat(32),
      picoIdentityFingerprintHex: '33'.repeat(32),
      targetDelegationId: 'delegation_render_recovery_0001',
      targetDeviceSigningKeyFingerprintHex: '44'.repeat(32),
      targetDeviceKeyAgreementKeyFingerprintHex: '55'.repeat(32),
      evidenceDigestHex: '66'.repeat(32),
      observedLifecycleOrder: 'seq:0000000000000007',
      createdAt: '2026-07-31T10:00:00.000Z',
      expiresAt: '2026-07-31T10:05:00.000Z',
    };

    expect(buildPicoVaultSignatureInputFromFields(
      picoHomeDeviceRecoveryCanonicalLabels.prepare,
      prepare,
    )).toEqual(
      buildPicoHomeDeviceRecoveryPrepareSignatureInput(prepare),
    );
    expect(renderPicoVaultApprovalStatement(
      picoHomeDeviceRecoveryCanonicalLabels.prepare,
      prepare,
    )).toBe(
      'Prepare recovery of identity 33333333…33333333 in Home '
      + 'home_render_recovery_0001 for target 44444444…44444444 by reading '
      + 'the current device-replacement head. This does not start the '
      + `${vetoHours}-hour veto delay.`,
    );
    expect(picoVaultCanSignLabel(
      'pico_identity',
      picoHomeDeviceRecoveryCanonicalLabels.prepare,
    )).toBe(true);
    expect(picoVaultCanSignLabel(
      'device_signing',
      picoHomeDeviceRecoveryCanonicalLabels.prepare,
    )).toBe(false);
    expect(picoVaultDaemonSignatureNeedsApproval(
      picoHomeDeviceRecoveryCanonicalLabels.prepare,
      'pico_identity',
    )).toBe(true);

    expect(buildPicoVaultSignatureInputFromFields(
      picoHomeDeviceRecoveryCanonicalLabels.claim,
      claim,
    )).toEqual(
      buildPicoHomeDeviceRecoveryClaimSignatureInput(claim),
    );
    expect(renderPicoVaultApprovalStatement(
      picoHomeDeviceRecoveryCanonicalLabels.claim,
      claim,
    )).toBe(
      'Recover identity 33333333…33333333 into Home '
      + 'home_render_recovery_0001 by replacing the complete device set '
      + `with target 44444444…44444444. The ${vetoHours}-hour veto delay starts only `
      + 'after the Home accepts this claim.',
    );
    expect(picoVaultCanSignLabel(
      'pico_identity',
      picoHomeDeviceRecoveryCanonicalLabels.claim,
    )).toBe(true);
    expect(picoVaultCanSignLabel(
      'device_signing',
      picoHomeDeviceRecoveryCanonicalLabels.claim,
    )).toBe(true);
    expect(picoVaultDaemonSignatureNeedsApproval(
      picoHomeDeviceRecoveryCanonicalLabels.claim,
      'pico_identity',
    )).toBe(true);
    expect(picoVaultDaemonSignatureNeedsApproval(
      picoHomeDeviceRecoveryCanonicalLabels.claim,
      'device_signing',
    )).toBe(false);
  });
});

describe('ADR 0079 I5 - the sentence names a key the way the rest of Pico does', () => {
  const membership = (subject: string): PicoHomeMembershipSignatureInput => ({
    suite: picoIdentitySuite,
    credentialId: 'membership_render_0001',
    homeId: 'home_render_membership_0001',
    issuerPicoIdentityFingerprintHex: '11'.repeat(32),
    subjectPicoIdentityFingerprintHex: subject,
    hostSigningKeyFingerprintHex: '22'.repeat(32),
    role: 'home_member',
    scopes: ['host.use'],
    validFrom: '2026-08-01T10:00:00.000Z',
    validUntil: '2027-08-01T10:00:00.000Z',
    lifecycleOrder: 'seq:0000000000000004',
  });

  it('spells the subject with the shared rule, not one of its own', () => {
    /**
     * Asserted against the imported rule rather than a literal, deliberately.
     * A literal here would pass just as well if this file grew a private
     * `short()` again - which is exactly what it had until 2026-08-20, and
     * what made one identity arrive under two names in a single approval
     * body: the sentence from here, and the signing key the companion shell
     * appends to it before showing the two together.
     */
    const subject = `${'9f8e7d6c'}${'0'.repeat(48)}${'5b4a3c2d'}`;
    const statement = renderPicoVaultApprovalStatement(
      picoHomeSignatureInputLabels.membership,
      membership(subject),
    );

    expect(statement).toContain(picoDisplayFingerprint(subject));
    expect(statement).not.toContain(subject.slice(0, 12));
  });

  it('keeps two ground-prefix keys apart in the sentence a person approves', () => {
    /**
     * The property the twelve-character prefix did not have. ADR 0079's own
     * threat table names grinding a key whose truncated fingerprint matches a
     * target's *display prefix*; under the old rule the two statements below
     * were character-identical, so approving the wrong one looked exactly
     * like approving the right one.
     */
    const ground = '9f8e7d6c';
    const genuine = `${ground}${'0'.repeat(48)}${'5b4a3c2d'}`;
    const forged = `${ground}${'0'.repeat(48)}${'11223344'}`;

    expect(genuine.slice(0, 12)).toBe(forged.slice(0, 12));
    expect(renderPicoVaultApprovalStatement(
      picoHomeSignatureInputLabels.membership,
      membership(genuine),
    )).not.toBe(renderPicoVaultApprovalStatement(
      picoHomeSignatureInputLabels.membership,
      membership(forged),
    ));
  });
});

describe('ADR 0106 - a deadline in the sentence is in the reader\'s own day', () => {
  it('renders validity through the product rule, not as the ISO string', () => {
    /**
     * Eleven instants reached a person raw until 2026-08-20, five of them in
     * this file. `until 2027-08-01T10:00:00.000Z` is a timezone, a precision
     * and a punctuation style nobody asked for, in the one string somebody is
     * supposed to check - and the companion window that confirms the same
     * ceremony afterwards had already been saying `2027-08-01` for a day.
     *
     * Neither call can throw: the builder runs first and refuses anything
     * that is not a canonical instant, which is pinned in the second
     * assertion so that the guarantee is a test rather than a belief.
     */
    const membership: PicoHomeMembershipSignatureInput = {
      suite: picoIdentitySuite,
      credentialId: 'membership_render_0002',
      homeId: 'home_render_membership_0002',
      issuerPicoIdentityFingerprintHex: '11'.repeat(32),
      subjectPicoIdentityFingerprintHex: '22'.repeat(32),
      hostSigningKeyFingerprintHex: '33'.repeat(32),
      role: 'home_member',
      scopes: ['host.use'],
      validFrom: '2026-08-01T10:00:00.000Z',
      validUntil: '2027-08-01T10:00:00.000Z',
      lifecycleOrder: 'seq:0000000000000005',
    };
    const statement = renderPicoVaultApprovalStatement(
      picoHomeSignatureInputLabels.membership,
      membership,
    );

    expect(statement).toContain(picoDisplayDate(membership.validUntil));
    expect(statement).not.toContain(membership.validUntil);

    expect(() => buildPicoVaultSignatureInputFromFields(
      picoHomeSignatureInputLabels.membership,
      { ...membership, validUntil: '2027-08-01T10:00:00Z' },
    )).toThrow();
  });
});

describe('ADR 0106 - the sentence names the delay the ceremony enforces', () => {
  it('speaks the veto delay from the constant, not from a number beside it', () => {
    /**
     * Two sentences said "48-hour" as a literal until 2026-08-20, in the same
     * app as the code that refuses a claim whose `effectiveAt - acceptedAt` is
     * not exactly `picoHomeDeviceRecoveryTiming.vetoDelayMs`. The constant's
     * own doc comment asks for exactly this - "without copying magic numbers"
     * - and a number inside an approval statement that no record supplies is
     * the one part of it nobody would think to check.
     */
    const claim: PicoHomeDeviceRecoveryClaimSignatureInput = {
      suite: picoIdentitySuite,
      recoveryId: 'recovery_render_0002',
      homeId: 'home_render_recovery_0002',
      hostSigningKeyFingerprintHex: '11'.repeat(32),
      hostKeyAgreementKeyFingerprintHex: '22'.repeat(32),
      picoIdentityFingerprintHex: '33'.repeat(32),
      targetDelegationId: 'delegation_render_recovery_0002',
      targetDeviceSigningKeyFingerprintHex: '44'.repeat(32),
      targetDeviceKeyAgreementKeyFingerprintHex: '55'.repeat(32),
      evidenceDigestHex: '66'.repeat(32),
      observedLifecycleOrder: 'seq:0000000000000008',
      createdAt: '2026-07-31T10:00:00.000Z',
      expiresAt: '2026-07-31T10:05:00.000Z',
    };
    const statement = renderPicoVaultApprovalStatement(
      picoHomeDeviceRecoveryCanonicalLabels.claim,
      claim,
    );

    expect(statement).toContain(
      `${picoHomeDeviceRecoveryTiming.vetoDelayMs / (60 * 60 * 1_000)}-hour veto delay`,
    );
    // And the delay is the one the ceremony holds a person to, not a rounder
    // number that happens to sit near it.
    expect(picoHomeDeviceRecoveryTiming.vetoDelayMs).toBe(48 * 60 * 60 * 1_000);
  });
});

describe('ADR 0099 - jedes gefragte Etikett hat auch einen Satz (B174)', () => {
  /**
   * Befund B174. Drei Tabellen entscheiden gemeinsam, ob eine Zeremonie
   * durchgeht, und bis zum 2026-09-14 hielt sie niemand gegeneinander:
   *
   * 1. wer welches Etikett unterschreiben darf (`picoVaultSignableLabels`),
   * 2. was davon die Zustimmung der Person braucht
   *    (`picoVaultDaemonSignatureNeedsApproval`),
   * 3. wofuer es Bytes und einen Satz gibt (`sign-rendering.ts`).
   *
   * Wer ein Etikett in eine Rollenmenge aufnimmt, ohne beides zu schreiben,
   * erfaehrt es sonst erst, wenn eine Person vor einer Zeremonie steht, die
   * sich nicht erklaeren laesst.
   *
   * **Eine Vertagung steht hier, statt daneben.** ADR 0114s Wurzelrotation ist
   * im Protokoll und im Home fertig und im Vault-Daemon nicht (Befund B79); das
   * Etikett steht bereits in beiden Rollenmengen, Bauer und Zeichner fehlen.
   * Der Eintrag faellt an dem Tag, an dem das nachgeholt wird - und dann
   * gehoert er weg, nicht erweitert.
   */
  const vertagt = new Map<string, string>([
    [picoIdentitySignatureInputLabels.rotation,
      'ADR 0114 mit Befund B79: die Wurzelrotation ist im Vault-Daemon vertagt. Die '
      + 'Rollenmengen nennen sie bereits, `buildersByLabel` und `renderersByLabel` nicht, '
      + 'also antwortet der Daemon `unknown_signature_input_label`. Das ist der '
      + 'eingetragene Stand und keine Ueberraschung.'],
  ]);

  it('renders a statement for every label a role may sign and approval gates', () => {
    // Die Felder sind leer, und das genuegt: geprueft wird, ob ein Zeichner
    // *existiert*, nicht was er schreibt. Ein fehlender antwortet `undefined`,
    // egal womit man ihn fuettert; einer, der leere Felder ablehnt, wirft - und
    // ist damit vorhanden.
    const ohneSatz = new Set<string>();
    for (const keyRole of picoVaultPersonKeyRoles) {
      for (const label of picoVaultSignableLabels(keyRole)) {
        if (!picoVaultDaemonSignatureNeedsApproval(label, keyRole)) {
          continue;
        }
        try {
          if (renderPicoVaultApprovalStatement(label, {}) === undefined) {
            ohneSatz.add(label);
          }
        } catch {
          continue;
        }
      }
    }

    expect([...ohneSatz].filter((label) => !vertagt.has(label))).toEqual([]);
    // Und die Vertagung ist noch eine: ein Grund, der seinen Gegenstand
    // ueberlebt, liest sich wie ein Urteil ueber heute.
    for (const label of vertagt.keys()) {
      expect(ohneSatz.has(label)).toBe(true);
    }
  });

  it('leaves no signable label without bytes either', () => {
    // Die andere Haelfte desselben Dreiklangs: ohne Bauer gibt es keine Bytes,
    // und der Daemon antwortet `unknown_signature_input_label` auf ein Etikett,
    // das seine Rollenmenge ausdruecklich erlaubt - eine Tuer, die aufgeht und
    // dahinter eine Wand hat.
    const ohneBytes = new Set<string>();
    for (const keyRole of picoVaultPersonKeyRoles) {
      for (const label of picoVaultSignableLabels(keyRole)) {
        expect(picoVaultCanSignLabel(keyRole, label)).toBe(true);
        try {
          if (buildPicoVaultSignatureInputFromFields(label, {}) === undefined) {
            ohneBytes.add(label);
          }
        } catch {
          // Ein Bauer, der leere Felder ablehnt, ist ein vorhandener Bauer.
          continue;
        }
      }
    }

    expect([...ohneBytes].filter((label) => !vertagt.has(label))).toEqual([]);
  });
});
