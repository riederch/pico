import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sodium from 'libsodium-wrappers-sumo';
import { beforeAll, describe, expect, it } from 'vitest';
import type {
  ActionHistoryEventPayload,
  ActionRequestedPayload,
  AuditEventCreatedPayload,
  AvatarStateChangedPayload,
  PicoEvent,
  PicoHomeMembership,
  PicoRealtimeMessage,
  PicoRealtimeTicketResponse,
  PayloadPosture,
  PicoRulesDecisionCreatedPayload,
  PolicyDecisionCreatedPayload,
  ToolCallRequestedPayload,
} from './index.js';
import {
  actionEventTypes,
  avatarIntensities,
  avatarModes,
  avatarStates,
  avatarStatusColors,
  deviceSeenStatuses,
  foundationEventTypes,
  serverSynthesizedFoundationEventTypes,
  legacyToolPolicyEventTypes,
  messageCreatedRoles,
  payloadPostures,
  writablePayloadPostures,
  memoryItemDeletionStates,
  referenceTargetResolutionStates,
  memoryContentPostures,
  memoryDomainCustodyClasses,
  memoryRetentionModes,
  picoIdentityDelegationScopes,
  picoIdentityKeyRoles,
  picoIdentityRevocationReasonCategories,
  picoIdentitySignatureInputFamilies,
  picoIdentitySignatureInputLabels,
  picoIdentitySuite,
  picoHomeContinuityReasonCategories,
  picoHomeClaimEnvelopeSchema,
  picoHomeSealedClaimPayloadSchema,
  picoHomeMembershipLifecycleReasonCategories,
  picoHomeMembershipRoles,
  picoHomeMembershipScopes,
  picoHomeMembershipStatuses,
  picoHomeSignatureInputFamilies,
  picoHomeSignatureInputLabels,
  picoVaultAeadAlgorithms,
  picoVaultArgon2idModerateParams,
  picoVaultKdfAlgorithms,
  picoVaultKdfProfiles,
  picoVaultKeyfileFormat,
  picoVaultPersonKeyRoles,
  buildPicoHomeClaimResponseSignatureInput,
  buildPicoHomeClaimSignatureInput,
  buildPicoHomeContinuitySignatureInput,
  buildPicoHomeFoundingSignatureInput,
  buildPicoHomeMembershipLifecycleSignatureInput,
  buildPicoHomeMembershipSignatureInput,
  buildPicoIdentityDelegationSignatureInput,
  buildPicoIdentityKeyRecordSignatureInput,
  buildPicoIdentityPossessionSignatureInput,
  buildPicoIdentityRevocationSignatureInput,
  buildPicoVaultKeyfileHeaderAad,
  picoHomeClaimStates,
  picoEventTypes,
  picoHomeEventTypes,
  protocolCapabilities,
  realtimeMessageType,
  realtimeMessageTypes,
  validateFoundationEventPayload,
} from './index.js';

const repoRootPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

beforeAll(async () => {
  await sodium.ready;
});

describe('Pico protocol types', () => {
  it('exports runtime event type lists for compatibility checks', () => {
    expect(foundationEventTypes).toEqual([
      'device.registered',
      'device.seen',
      'session.created',
      'message.created',
      'avatar.state_changed',
      'memory.recorded',
      'memory.tombstone',
      'memory.domain_shredded',
      'auth.operator_bootstrapped',
      'auth.credential_changed',
      'auth.operator_reset',
      'auth.sessions_revoked',
      'home.claimed',
      'home.reset',
    ]);
    expect(serverSynthesizedFoundationEventTypes).toEqual([
      'memory.domain_shredded',
      'auth.operator_bootstrapped',
      'auth.credential_changed',
      'auth.operator_reset',
      'auth.sessions_revoked',
      'home.claimed',
      'home.reset',
    ]);

    expect(actionEventTypes).toContain('action.requested');
    expect(actionEventTypes).toContain('pico_rules.decision_created');
    expect(legacyToolPolicyEventTypes).toContain('tool.call_requested');
    expect(legacyToolPolicyEventTypes).toContain('policy.decision_created');
    expect(picoHomeEventTypes).toContain('pico_home.claim_requested');

    expect(picoEventTypes).toEqual([
      ...foundationEventTypes,
      ...actionEventTypes,
      ...legacyToolPolicyEventTypes,
      ...picoHomeEventTypes,
    ]);

    expect(protocolCapabilities).toEqual({
      'pico.core.events.v1': true,
      'pico.core.websocket.v1': true,
      'pico.avatar_state.v1': true,
      'pico.home.setup.v1': true,
    });
  });

  it('exports runtime payload value lists for foundation payload validation', () => {
    expect(deviceSeenStatuses).toEqual(['online', 'offline']);
    expect(messageCreatedRoles).toEqual(['user', 'assistant', 'system', 'tool']);
    expect(avatarModes).toEqual(['everyday', 'technical', 'wwg', 'firefighter', 'security', 'organization', 'smart_home']);
    expect(avatarStates).toEqual(['idle', 'listening', 'thinking', 'working', 'unsure', 'warning', 'confirmation_required', 'blocked', 'success', 'sleeping']);
    expect(avatarIntensities).toEqual(['low', 'normal', 'high']);
    expect(avatarStatusColors).toEqual(['neutral', 'blue', 'green', 'yellow', 'red', 'violet']);
  });

  it('validates strict writable Foundation event payloads', () => {
    expect(validateFoundationEventPayload('device.registered', {})).toEqual({ ok: true, payload: {} });
    expect(validateFoundationEventPayload('device.seen', { status: 'online' })).toEqual({ ok: true, payload: { status: 'online' } });
    expect(validateFoundationEventPayload('session.created', {})).toEqual({ ok: true, payload: {} });
    expect(validateFoundationEventPayload('message.created', { role: 'user', text: 'Hallo Pico' })).toEqual({
      ok: true,
      payload: { role: 'user', text: 'Hallo Pico' },
    });
    expect(validateFoundationEventPayload('avatar.state_changed', {
      mode: 'everyday',
      state: 'thinking',
      intensity: 'normal',
      statusColor: 'violet',
      message: 'Thinking',
    })).toEqual({
      ok: true,
      payload: {
        mode: 'everyday',
        state: 'thinking',
        intensity: 'normal',
        statusColor: 'violet',
        message: 'Thinking',
      },
    });
    expect(validateFoundationEventPayload('memory.recorded', { memoryItemId: 'mem-1', privacyDomain: 'domain-private', contentType: 'text/markdown', summary: 'a note' })).toEqual({
      ok: true,
      payload: { memoryItemId: 'mem-1', privacyDomain: 'domain-private', contentType: 'text/markdown', summary: 'a note' },
    });
    expect(validateFoundationEventPayload('memory.recorded', { memoryItemId: 'mem-1', privacyDomain: 'domain-private' })).toEqual({
      ok: false,
      error: 'memory.recorded payload requires memoryItemId, privacyDomain and contentType.',
    });
    expect(validateFoundationEventPayload('memory.recorded', { memoryItemId: 'mem-1', privacyDomain: 'domain-private', contentType: 'text/markdown', content: 'secret' })).toEqual({
      ok: false,
      error: 'memory.recorded payload has unexpected field: content.',
    });
    expect(validateFoundationEventPayload('memory.tombstone', { memoryItemId: 'mem-1', privacyDomain: 'domain-private' })).toEqual({
      ok: true,
      payload: { memoryItemId: 'mem-1', privacyDomain: 'domain-private' },
    });
    expect(validateFoundationEventPayload('memory.tombstone', { memoryItemId: 'mem-1', privacyDomain: 'domain-private', reason: 'user request' })).toEqual({
      ok: true,
      payload: { memoryItemId: 'mem-1', privacyDomain: 'domain-private', reason: 'user request' },
    });
    expect(validateFoundationEventPayload('memory.tombstone', { memoryItemId: 'mem-1' })).toEqual({
      ok: false,
      error: 'memory.tombstone payload requires memoryItemId and privacyDomain.',
    });
    expect(validateFoundationEventPayload('memory.tombstone', { memoryItemId: 'mem-1', privacyDomain: 'domain-private', content: 'secret' })).toEqual({
      ok: false,
      error: 'memory.tombstone payload has unexpected field: content.',
    });
    expect(validateFoundationEventPayload('memory.domain_shredded', { privacyDomain: 'domain-private', removedKeyVersions: 2 })).toEqual({
      ok: true,
      payload: { privacyDomain: 'domain-private', removedKeyVersions: 2 },
    });
    expect(validateFoundationEventPayload('memory.domain_shredded', { privacyDomain: 'domain-private', removedKeyVersions: 1, reason: 'device loss' })).toEqual({
      ok: true,
      payload: { privacyDomain: 'domain-private', removedKeyVersions: 1, reason: 'device loss' },
    });
    expect(validateFoundationEventPayload('memory.domain_shredded', { privacyDomain: 'domain-private', removedKeyVersions: -1 })).toEqual({
      ok: false,
      error: 'memory.domain_shredded removedKeyVersions must be a non-negative integer.',
    });
    expect(validateFoundationEventPayload('memory.domain_shredded', { privacyDomain: 'domain-private', removedKeyVersions: 1, content: 'secret' })).toEqual({
      ok: false,
      error: 'memory.domain_shredded payload has unexpected field: content.',
    });
  });

  it('keeps operator audit payloads content-free and credential-free (ADR 0076)', () => {
    expect(validateFoundationEventPayload('auth.operator_bootstrapped', {})).toEqual({ ok: true, payload: {} });
    expect(validateFoundationEventPayload('auth.credential_changed', {})).toEqual({ ok: true, payload: {} });
    expect(validateFoundationEventPayload('auth.operator_reset', {})).toEqual({ ok: true, payload: {} });
    expect(validateFoundationEventPayload('auth.operator_reset', { reason: 'local reset marker' })).toEqual({
      ok: true,
      payload: { reason: 'local reset marker' },
    });
    expect(validateFoundationEventPayload('auth.sessions_revoked', { revokedSessions: 3 })).toEqual({
      ok: true,
      payload: { revokedSessions: 3 },
    });

    // Nothing about the credential, the session or the person may ride along.
    expect(validateFoundationEventPayload('auth.operator_bootstrapped', { passphrase: 'hunter2' })).toEqual({
      ok: false,
      error: 'auth.operator_bootstrapped payload has unexpected field: passphrase.',
    });
    expect(validateFoundationEventPayload('auth.credential_changed', { verifier: '$argon2id$...' })).toEqual({
      ok: false,
      error: 'auth.credential_changed payload has unexpected field: verifier.',
    });
    expect(validateFoundationEventPayload('auth.sessions_revoked', { revokedSessions: 1, session: 'abc' })).toEqual({
      ok: false,
      error: 'auth.sessions_revoked payload has unexpected field: session.',
    });
    expect(validateFoundationEventPayload('auth.sessions_revoked', { revokedSessions: -1 })).toEqual({
      ok: false,
      error: 'auth.sessions_revoked revokedSessions must be a non-negative integer.',
    });
  });

  it('keeps Pico Home setup audit payloads content-free (ADR 0080 H10)', () => {
    expect(validateFoundationEventPayload('home.claimed', {})).toEqual({ ok: true, payload: {} });
    expect(validateFoundationEventPayload('home.reset', {})).toEqual({ ok: true, payload: {} });
    expect(validateFoundationEventPayload('home.claimed', { moveInCode: 'secret' })).toEqual({
      ok: false,
      error: 'home.claimed payload has unexpected field: moveInCode.',
    });
    expect(validateFoundationEventPayload('home.reset', { hostPrivateKey: 'secret' })).toEqual({
      ok: false,
      error: 'home.reset payload has unexpected field: hostPrivateKey.',
    });
  });

  it('rejects unexpected Foundation event payload fields', () => {
    expect(validateFoundationEventPayload('device.registered', { label: 'dev laptop' })).toEqual({
      ok: false,
      error: 'device.registered payload has unexpected field: label.',
    });
    expect(validateFoundationEventPayload('message.created', { role: 'user', text: 'Hallo Pico', memory: 'secret' })).toEqual({
      ok: false,
      error: 'message.created payload has unexpected field: memory.',
    });
    expect(validateFoundationEventPayload('avatar.state_changed', {
      mode: 'everyday',
      state: 'thinking',
      intensity: 'normal',
      statusColor: 'violet',
      privateNote: 'hidden',
    })).toEqual({
      ok: false,
      error: 'avatar.state_changed payload has unexpected field: privateNote.',
    });
  });

  it('exports reserved payload posture values for privacy and deletion planning', () => {
    expect(payloadPostures).toEqual(['inline_operational', 'inline_test', 'reference_only', 'summary_only', 'redacted']);
  });

  it('exports the writable payload posture subset for the current event write path', () => {
    expect(writablePayloadPostures).toEqual(['inline_operational', 'inline_test']);
    for (const posture of writablePayloadPostures) {
      expect(payloadPostures).toContain(posture);
    }
  });

  it('exports reserved deleteable memory and reference target vocabulary', () => {
    expect(memoryItemDeletionStates).toEqual(['active', 'deleted', 'tombstoned']);
    expect(referenceTargetResolutionStates).toEqual(['resolvable', 'deleted', 'unknown']);
    expect(memoryContentPostures).toEqual(['plaintext_foundation', 'domain_encrypted']);
    expect(memoryDomainCustodyClasses).toEqual(['host_custody', 'reader_custody']);
    expect(memoryRetentionModes).toEqual(['keep_until_deleted', 'delete_after_max_age']);
  });

  it('exports ADR 0079 identity signature-input vocabulary', () => {
    expect(picoIdentitySuite).toBe('pico.suite.id.v1');
    expect(picoIdentitySignatureInputFamilies).toEqual(['keyrecord', 'possession', 'delegation', 'revocation']);
    expect(picoIdentitySignatureInputLabels).toEqual({
      keyrecord: 'pico.id.keyrecord.v1',
      possession: 'pico.id.possession.v1',
      delegation: 'pico.id.delegation.v1',
      revocation: 'pico.id.revocation.v1',
    });
    expect(picoIdentityKeyRoles).toEqual([
      'pico_identity',
      'device_signing',
      'device_key_agreement',
      'home_host_signing',
      'home_host_key_agreement',
    ]);
    expect(picoIdentityDelegationScopes).toEqual([
      'sign_history',
      'verify_history',
      'sync_exchange',
      'decrypt_domain',
      'receive_key_envelope',
      'surface_session',
      'home_membership',
    ]);
    expect(picoIdentityRevocationReasonCategories).toEqual([
      'lost_device',
      'suspected_compromise',
      'device_retired',
      'key_rotated',
      'membership_removed',
    ]);
  });

  it('exports ADR 0080 Pico Home signature-input vocabulary', () => {
    expect(picoHomeSignatureInputFamilies).toEqual([
      'claim',
      'claimResponse',
      'founding',
      'membership',
      'membershipLifecycle',
      'continuity',
    ]);
    expect(picoHomeSignatureInputLabels).toEqual({
      claim: 'pico.home.claim.v1',
      claimResponse: 'pico.home.claim-response.v1',
      founding: 'pico.home.founding.v1',
      membership: 'pico.home.membership.v1',
      membershipLifecycle: 'pico.home.membership-lifecycle.v1',
      continuity: 'pico.home.continuity.v1',
    });
    expect(picoHomeClaimEnvelopeSchema).toBe('pico.home.claim-envelope.v1');
    expect(picoHomeSealedClaimPayloadSchema).toBe('pico.home.claim-payload.v1');
    expect(picoHomeMembershipRoles).toEqual(['home_host', 'home_member']);
    expect(picoHomeMembershipScopes).toEqual([
      'host.use',
      'packet.receive',
      'storage.queue',
      'sync.exchange',
    ]);
    expect(picoHomeMembershipStatuses).toEqual([
      'invited',
      'active',
      'revoked',
      'expired',
      'evicted',
      'transferred_or_reissued',
    ]);
    expect(picoHomeMembershipLifecycleReasonCategories).toEqual([
      'invite_accepted',
      'invite_expired',
      'member_removed',
      'host_reset',
      'membership_reissued',
      'security_review',
    ]);
    expect(picoHomeContinuityReasonCategories).toEqual([
      'host_key_rotated',
      'host_migrated',
      'host_restored',
    ]);
  });

  it('exports ADR 0081 Vault keyfile vocabulary', () => {
    expect(picoVaultKeyfileFormat).toBe('pico.vault.keyfile.v1');
    expect(picoVaultPersonKeyRoles).toEqual([
      'pico_identity',
      'device_signing',
      'device_key_agreement',
    ]);
    expect(picoVaultKdfAlgorithms).toEqual(['argon2id']);
    expect(picoVaultKdfProfiles).toEqual(['moderate']);
    expect(picoVaultAeadAlgorithms).toEqual(['xchacha20poly1305-ietf']);
    expect(picoVaultArgon2idModerateParams).toEqual({
      opsLimit: 3,
      memLimitBytes: 268_435_456,
    });
  });

  it('exports runtime realtime message type lists for websocket compatibility checks', () => {
    expect(realtimeMessageType).toEqual({
      coreConnected: 'pico.core.connected',
      eventCreated: 'pico.event.created',
    });

    expect(realtimeMessageTypes).toEqual([
      realtimeMessageType.coreConnected,
      realtimeMessageType.eventCreated,
    ]);
  });

  it('exports runtime Pico Home claim state lists for foundation status compatibility checks', () => {
    expect(picoHomeClaimStates).toEqual(['unclaimed', 'claimed']);
  });

  it('keeps public protocol event docs aligned with runtime event type lists', () => {
    const publicSurfaces = readRepoFile('docs/protocol/public-surfaces.md');

    expect(textFenceAfterHeading(publicSurfaces, '### Foundation event types')).toEqual([...foundationEventTypes]);
    expect(textFenceAfterHeading(publicSurfaces, 'Server-synthesized foundation event types')).toEqual([
      ...serverSynthesizedFoundationEventTypes,
    ]);
    expect(textFenceAfterHeading(publicSurfaces, '### Product action event types')).toEqual([...actionEventTypes]);
    expect(textFenceAfterHeading(publicSurfaces, '### Legacy tool/policy event types')).toEqual([...legacyToolPolicyEventTypes]);
    expect(textFenceAfterHeading(publicSurfaces, '### Pico Home event direction')).toEqual([...picoHomeEventTypes]);
    expect(textFenceAfterHeading(publicSurfaces, '### Reserved memory item deletion states')).toEqual([...memoryItemDeletionStates]);
    expect(textFenceAfterHeading(publicSurfaces, '### Reserved reference target resolution states')).toEqual([...referenceTargetResolutionStates]);
    expect(textFenceAfterHeading(publicSurfaces, '### Reserved memory content postures')).toEqual([...memoryContentPostures]);
    expect(textFenceAfterHeading(publicSurfaces, '### Reserved memory retention modes')).toEqual([...memoryRetentionModes]);
  });

  it('keeps public protocol capability docs aligned with runtime capability names', () => {
    const publicSurfaces = readRepoFile('docs/protocol/public-surfaces.md');

    expect(textFenceAfterHeading(publicSurfaces, '### Current runtime capability flags')).toEqual(Object.keys(protocolCapabilities));
  });

  it('keeps public protocol websocket message docs aligned with runtime message type lists', () => {
    const publicSurfaces = readRepoFile('docs/protocol/public-surfaces.md');

    expect(textFenceAfterHeading(publicSurfaces, '### Current `WS /ws` message types')).toEqual([...realtimeMessageTypes]);
  });

  it('keeps public protocol payload value docs aligned with runtime payload value lists', () => {
    const publicSurfaces = readRepoFile('docs/protocol/public-surfaces.md');

    expect(textFenceAfterHeading(publicSurfaces, '#### `message.created.payload.role`')).toEqual([...messageCreatedRoles]);
    expect(textFenceAfterHeading(publicSurfaces, '#### `avatar.state_changed.payload.mode`')).toEqual([...avatarModes]);
    expect(textFenceAfterHeading(publicSurfaces, '#### `avatar.state_changed.payload.state`')).toEqual([...avatarStates]);
    expect(textFenceAfterHeading(publicSurfaces, '#### `avatar.state_changed.payload.intensity`')).toEqual([...avatarIntensities]);
    expect(textFenceAfterHeading(publicSurfaces, '#### `avatar.state_changed.payload.statusColor`')).toEqual([...avatarStatusColors]);
  });

  it('keeps reserved payload posture docs aligned with runtime value lists', () => {
    const publicSurfaces = readRepoFile('docs/protocol/public-surfaces.md');

    expect(textFenceAfterHeading(publicSurfaces, '### Reserved payload posture direction')).toEqual([...payloadPostures]);
  });

  it('keeps public protocol claim-state docs aligned with runtime claim-state value lists', () => {
    const publicSurfaces = readRepoFile('docs/protocol/public-surfaces.md');

    expect(textFenceAfterHeading(publicSurfaces, '### Current Pico Home claim-state values')).toEqual([...picoHomeClaimStates]);
  });

  it('keeps compatibility level event docs aligned with runtime event type lists', () => {
    const compatibilityLevels = readRepoFile('docs/protocol/compatibility-levels.md');

    expect(textFenceAfterHeading(compatibilityLevels, '## L1 - Foundation event compatibility')).toEqual([...foundationEventTypes]);
  });

  it('keeps seed conformance fixtures aligned with current Foundation semantics', () => {
    const currentVersion = stringField(readRepoJsonObject('package.json'), 'version');
    const suite = readRepoJsonObject('docs/protocol/fixtures/suite.json');
    const fixturePaths = stringArrayField(suite, 'fixtures');

    expect(stringField(suite, 'schema')).toBe('pico.conformance.suite');
    expect(numberField(suite, 'schemaVersion')).toBe(1);
    expect(stringField(suite, 'suiteId')).toBe('pico.foundation.v0_1_7.seed');
    expect(stringField(suite, 'suiteVersion')).toBe(currentVersion);
    expect(stringField(suite, 'stage')).toBe('fixture_data');
    expect(stringField(suite, 'protocolVersion')).toBe(currentVersion);
    expect(stringArrayField(suite, 'surfaces')).toEqual(['foundation-events', 'foundation-realtime']);
    expect(stringArrayField(suite, 'families')).toEqual(['parse-positive', 'parse-negative']);
    const runner = recordField(suite, 'runner');
    expect(booleanField(runner, 'required')).toBe(false);
    expect(stringField(runner, 'status')).toBe('none');
    expect(stringField(suite, 'compatibilityLevel')).toBe('experimental-l1-seed');
    expect(stringField(suite, 'disclaimer')).toBe('Fixtures are technical examples and grant no commercial permission.');
    expect(stringField(suite, 'notes')).toContain('not a published conformance suite or L4 compatibility basis');
    expect(fixturePaths).toEqual([
      'foundation-events/v0.1.7/parse-positive/device-registered-marker',
      'foundation-events/v0.1.7/parse-positive/device-seen-online',
      'foundation-events/v0.1.7/parse-positive/session-created-marker',
      'foundation-events/v0.1.7/parse-positive/message-created-minimal',
      'foundation-events/v0.1.7/parse-positive/avatar-state-changed-thinking',
      'foundation-events/v0.1.7/parse-negative/action-requested-reserved',
      'foundation-events/v0.1.7/parse-negative/device-registered-unexpected-field',
      'foundation-events/v0.1.7/parse-negative/device-seen-invalid-status',
      'foundation-events/v0.1.7/parse-negative/device-seen-unexpected-field',
      'foundation-events/v0.1.7/parse-negative/message-created-invalid-role',
      'foundation-events/v0.1.7/parse-negative/message-created-empty-text',
      'foundation-events/v0.1.7/parse-negative/message-created-unexpected-field',
      'foundation-events/v0.1.7/parse-negative/avatar-state-invalid-status-color',
      'foundation-events/v0.1.7/parse-negative/avatar-state-empty-message',
      'foundation-events/v0.1.7/parse-negative/avatar-state-unexpected-field',
      'foundation-events/v0.1.7/parse-negative/session-created-unexpected-field',
      'foundation-realtime/v0.1.7/parse-positive/core-connected',
      'foundation-realtime/v0.1.7/parse-positive/event-created-message',
      'foundation-realtime/v0.1.7/parse-positive/event-created-avatar-state',
      'foundation-realtime/v0.1.7/parse-positive/event-created-device-registered',
      'foundation-realtime/v0.1.7/parse-positive/event-created-device-seen',
      'foundation-realtime/v0.1.7/parse-positive/event-created-session-created',
      'foundation-realtime/v0.1.7/parse-negative/core-connected-missing-device-id',
      'foundation-realtime/v0.1.7/parse-negative/event-created-missing-event',
      'foundation-realtime/v0.1.7/parse-negative/event-created-reserved-event-type',
      'foundation-realtime/v0.1.7/parse-negative/event-created-invalid-payload',
      'foundation-realtime/v0.1.7/parse-negative/pico-link-packet-not-foundation-realtime',
    ]);
    expect([...fixturePaths].sort()).toEqual(listFixtureDirectories('docs/protocol/fixtures')
      .filter((fixturePath) => !fixturePath.startsWith('pico-link/draft/'))
      .filter((fixturePath) => !fixturePath.startsWith('model-delegation/draft/'))
      .filter((fixturePath) => !fixturePath.startsWith('memory-content-ad/'))
      .filter((fixturePath) => !fixturePath.startsWith('identity-signature-input/'))
      .filter((fixturePath) => !fixturePath.startsWith('identity-signature-verification/'))
      .filter((fixturePath) => !fixturePath.startsWith('identity-lifecycle/'))
      .filter((fixturePath) => !fixturePath.startsWith('home-signature-input/'))
      .filter((fixturePath) => !fixturePath.startsWith('vault-keyfile/'))
      .sort());
    expect(textFenceAfterHeading(readRepoFile('docs/protocol/fixtures/README.md'), '## Current Foundation fixtures')).toEqual([
      'suite.json',
      ...fixturePaths.map((fixturePath) => `${fixturePath}/`),
    ]);
    expectCurrentFixtureCounts(readRepoFile('docs/protocol/conformance-fixtures.md'), fixturePaths);

    for (const fixturePath of fixturePaths) {
      const [fixtureSurface, fixtureVersion, fixtureFamily, fixtureCase] = fixturePathParts(fixturePath);
      const fixture = readRepoJsonObject(`docs/protocol/fixtures/${fixturePath}/fixture.json`);
      const source = recordField(fixture, 'source');
      const expectBlock = recordField(fixture, 'expect');
      const input = readRepoJsonObject(`docs/protocol/fixtures/${fixturePath}/${stringField(source, 'file')}`);
      const inputType = stringField(input, 'type');
      const capabilitiesRequired = stringArrayField(fixture, 'capabilitiesRequired');

      expect(stringField(fixture, 'schema')).toBe('pico.conformance.fixture');
      expect(numberField(fixture, 'schemaVersion')).toBe(1);
      expect(stringField(fixture, 'fixtureId')).toBe(`${fixtureSurface}.${fixtureVersion.replaceAll('.', '_')}.${fixtureFamily}.${fixtureCase}`);
      expect(stringField(fixture, 'stage')).toBe('fixture_data');
      const surface = stringField(fixture, 'surface');
      expect(surface).toBe(fixtureSurface);
      expect(stringArrayField(suite, 'surfaces')).toContain(surface);
      expect(fixtureVersion).toBe(`v${currentVersion}`);
      expect(stringField(fixture, 'protocolVersion')).toBe(currentVersion);
      expect(stringField(fixture, 'case')).toBeTruthy();
      expect(stringField(fixture, 'notes')).toBeTruthy();
      expect(stringField(source, 'encoding')).toBe('json');
      expect(stringField(source, 'file')).toBe('input.json');

      for (const capability of capabilitiesRequired) {
        expect(Object.keys(protocolCapabilities)).toContain(capability);
      }
      expectFixtureCapabilitiesForInput(input, surface, capabilitiesRequired);

      const family = stringField(fixture, 'family');
      expect(family).toBe(fixtureFamily);
      expect(stringArrayField(suite, 'families')).toContain(family);

      if (surface === 'foundation-events') {
        expect(capabilitiesRequired).toContain('pico.core.events.v1');
        expectCurrentFoundationEventFixture(input, inputType, expectBlock, family);
      } else if (surface === 'foundation-realtime') {
        expect(capabilitiesRequired).toContain('pico.core.websocket.v1');
        expectCurrentFoundationRealtimeFixture(input, inputType, expectBlock, family);
      } else {
        throw new Error(`Unexpected fixture surface: ${surface}`);
      }
    }
  });

  it('keeps memory-content AD vectors byte-exact and aligned with ADR 0073', () => {
    const currentVersion = stringField(readRepoJsonObject('package.json'), 'version');
    const suite = readRepoJsonObject('docs/protocol/fixtures/memory-content-ad/suite.json');
    const fixturePaths = stringArrayField(suite, 'fixtures');
    const adrNoWhitespace = readRepoFile(
      'docs/architecture/0073-memory-content-ad-canonicalization-and-test-vectors.md',
    ).replace(/\s+/g, '');

    expect(stringField(suite, 'schema')).toBe('pico.mem-ad.vector.suite');
    expect(numberField(suite, 'schemaVersion')).toBe(1);
    expect(stringField(suite, 'suiteId')).toBe('pico.memory-content-ad.pico_suite_mem_v1');
    expect(stringField(suite, 'suiteVersion')).toBe(currentVersion);
    expect(stringField(suite, 'stage')).toBe('fixture_data');
    expect(stringField(suite, 'suite')).toBe('pico.suite.mem.v1');
    expect(stringField(suite, 'surface')).toBe('memory-content-ad');
    expect(stringArrayField(suite, 'families')).toEqual(['canonicalization-positive', 'canonicalization-negative']);
    const runner = recordField(suite, 'runner');
    expect(booleanField(runner, 'required')).toBe(false);
    expect(stringField(runner, 'status')).toBe('none');
    expect(stringField(suite, 'compatibilityLevel')).toBe('authoritative-ad-vectors');
    expect(stringField(suite, 'disclaimer')).toContain('no commercial permission');

    expect([...fixturePaths].sort()).toEqual(
      listFixtureDirectories('docs/protocol/fixtures/memory-content-ad').sort(),
    );
    expect(textFenceAfterHeading(readRepoFile('docs/protocol/fixtures/README.md'), '## Current memory-content AD fixtures')).toEqual([
      'memory-content-ad/suite.json',
      ...fixturePaths.map((fixturePath) => `memory-content-ad/${fixturePath}/`),
    ]);

    const acceptedHexByCase = new Map<string, string>();
    const relationships: { caseName: string; mustDifferFrom?: string; pairsWith?: string }[] = [];

    for (const fixturePath of fixturePaths) {
      const parts = fixturePath.split('/');
      expect(parts.length).toBe(3);
      const [suiteSegment, family, caseName] = parts;
      expect(suiteSegment).toBe('pico.suite.mem.v1');
      expect(stringArrayField(suite, 'families')).toContain(family);

      const base = `docs/protocol/fixtures/memory-content-ad/${fixturePath}`;
      const fixture = readRepoJsonObject(`${base}/fixture.json`);
      const source = recordField(fixture, 'source');
      const input = readRepoJsonObject(`${base}/input.json`);
      const expectBlock = recordField(fixture, 'expect');

      expect(stringField(fixture, 'schema')).toBe('pico.mem-ad.vector');
      expect(numberField(fixture, 'schemaVersion')).toBe(1);
      expect(stringField(fixture, 'fixtureId')).toBe(`memory-content-ad.pico_suite_mem_v1.${family}.${caseName}`);
      expect(stringField(fixture, 'stage')).toBe('fixture_data');
      expect(stringField(fixture, 'suite')).toBe('pico.suite.mem.v1');
      expect(stringField(fixture, 'surface')).toBe('memory-content-ad');
      expect(stringField(fixture, 'family')).toBe(family);
      expect(stringField(fixture, 'adr')).toBe('0073');
      expect(stringField(fixture, 'case')).toBeTruthy();
      expect(stringField(fixture, 'notes')).toBeTruthy();
      expect(stringField(source, 'encoding')).toBe('fields');
      expect(stringField(source, 'file')).toBe('input.json');

      const adFamily = stringField(fixture, 'adFamily');
      expect(['content', 'dek-wrap']).toContain(adFamily);
      const construction = adFamily === 'content' ? 'pico.mem.ad.content.v1' : 'pico.mem.ad.dek-wrap.v1';
      expect(stringField(fixture, 'construction')).toBe(construction);
      expect(stringField(input, 'adFamily')).toBe(adFamily);
      expect(stringField(input, 'construction')).toBe(construction);
      const fields = recordField(input, 'fields');

      const build = stringField(expectBlock, 'build');
      if (build === 'accept') {
        const recomputed = buildMemoryContentAd(adFamily, fields);
        const hex = recomputed.toString('hex');
        expect(hex).toBe(stringField(expectBlock, 'canonicalAdHex'));
        expect(recomputed.length).toBe(numberField(expectBlock, 'canonicalAdLen'));
        // Tie the fixture to the independently reviewed ADR: its bytes must be published there.
        expect(adrNoWhitespace).toContain(hex);
        acceptedHexByCase.set(caseName, hex);
        relationships.push({
          caseName,
          mustDifferFrom: optionalStringField(expectBlock, 'mustDifferFrom'),
          pairsWith: optionalStringField(expectBlock, 'pairsWith'),
        });
      } else {
        expect(build).toBe('reject');
        expect(stringField(expectBlock, 'errorCategory')).toBe('canonicalization_error');
        const reason = stringField(expectBlock, 'reason');
        expect(['empty_field', 'invalid_field_charset', 'field_too_long']).toContain(reason);
        expect(() => buildMemoryContentAd(adFamily, fields)).toThrow(reason);
      }
    }

    // Bind-difference and injectivity: referenced cases exist and produce different bytes.
    for (const { caseName, mustDifferFrom, pairsWith } of relationships) {
      for (const other of [mustDifferFrom, pairsWith]) {
        if (other === undefined) {
          continue;
        }
        expect(acceptedHexByCase.has(other)).toBe(true);
        expect(acceptedHexByCase.get(caseName)).not.toBe(acceptedHexByCase.get(other));
      }
    }
  });

  it('keeps Pico identity signature-input vectors byte-exact and aligned with ADR 0079 G1', () => {
    const currentVersion = stringField(readRepoJsonObject('package.json'), 'version');
    const suite = readRepoJsonObject('docs/protocol/fixtures/identity-signature-input/suite.json');
    const fixturePaths = stringArrayField(suite, 'fixtures');
    const adrNoWhitespace = readRepoFile(
      'docs/architecture/0079-pico-identity-and-device-key-threat-model-and-primitive-direction.md',
    ).replace(/\s+/g, '');

    expect(stringField(suite, 'schema')).toBe('pico.identity.signature-input.vector.suite');
    expect(numberField(suite, 'schemaVersion')).toBe(1);
    expect(stringField(suite, 'suiteId')).toBe('pico.identity-signature-input.pico_suite_id_v1');
    expect(stringField(suite, 'suiteVersion')).toBe(currentVersion);
    expect(stringField(suite, 'stage')).toBe('fixture_data');
    expect(stringField(suite, 'suite')).toBe(picoIdentitySuite);
    expect(stringField(suite, 'surface')).toBe('identity-signature-input');
    expect(stringArrayField(suite, 'families')).toEqual(['canonicalization-positive', 'canonicalization-negative']);
    const runner = recordField(suite, 'runner');
    expect(booleanField(runner, 'required')).toBe(false);
    expect(stringField(runner, 'status')).toBe('none');
    expect(stringField(suite, 'compatibilityLevel')).toBe('authoritative-signature-input-vectors');
    expect(stringField(suite, 'disclaimer')).toContain('no signature verification');
    expect(stringField(suite, 'disclaimer')).toContain('no commercial permission');

    expect([...fixturePaths].sort()).toEqual(
      listFixtureDirectories('docs/protocol/fixtures/identity-signature-input').sort(),
    );
    expect(textFenceAfterHeading(readRepoFile('docs/protocol/fixtures/README.md'), '## Current identity signature-input fixtures')).toEqual([
      'identity-signature-input/suite.json',
      ...fixturePaths.map((fixturePath) => `identity-signature-input/${fixturePath}/`),
    ]);

    const acceptedHexByCase = new Map<string, string>();
    const acceptedFingerprintByCase = new Map<string, string>();
    const relationships: {
      caseName: string;
      mustDifferFrom?: string;
      fingerprintMustDifferFrom?: string;
      mustMatch?: string;
    }[] = [];

    for (const fixturePath of fixturePaths) {
      const parts = fixturePath.split('/');
      expect(parts.length).toBe(3);
      const [suiteSegment, family, caseName] = parts;
      expect(suiteSegment).toBe(picoIdentitySuite);
      expect(stringArrayField(suite, 'families')).toContain(family);

      const base = `docs/protocol/fixtures/identity-signature-input/${fixturePath}`;
      const fixture = readRepoJsonObject(`${base}/fixture.json`);
      const source = recordField(fixture, 'source');
      const input = readRepoJsonObject(`${base}/input.json`);
      const expectBlock = recordField(fixture, 'expect');
      const identityFamily = stringField(fixture, 'identityFamily');

      expect(stringField(fixture, 'schema')).toBe('pico.identity.signature-input.vector');
      expect(numberField(fixture, 'schemaVersion')).toBe(1);
      expect(stringField(fixture, 'fixtureId')).toBe(`identity-signature-input.pico_suite_id_v1.${family}.${caseName}`);
      expect(stringField(fixture, 'stage')).toBe('fixture_data');
      expect(stringField(fixture, 'suite')).toBe(picoIdentitySuite);
      expect(stringField(fixture, 'surface')).toBe('identity-signature-input');
      expect(stringField(fixture, 'family')).toBe(family);
      expect(stringField(fixture, 'adr')).toBe('0079');
      expect(stringField(fixture, 'case')).toBeTruthy();
      expect(stringField(fixture, 'notes')).toBeTruthy();
      expect(stringField(source, 'encoding')).toBe('fields');
      expect(stringField(source, 'file')).toBe('input.json');
      expect(picoIdentitySignatureInputFamilies).toContain(identityFamily as typeof picoIdentitySignatureInputFamilies[number]);

      const construction = picoIdentitySignatureInputLabels[identityFamily as keyof typeof picoIdentitySignatureInputLabels];
      expect(stringField(fixture, 'construction')).toBe(construction);
      expect(stringField(input, 'identityFamily')).toBe(identityFamily);
      const inputConstruction = stringField(input, 'construction');
      const fields = recordField(input, 'fields');
      const build = stringField(expectBlock, 'build');

      if (inputConstruction !== construction) {
        expect(build).toBe('reject');
        expect(stringField(expectBlock, 'reason')).toBe('cross_family_label_confusion');
        continue;
      }

      if (build === 'accept') {
        const recomputed = buildPicoIdentityVector(identityFamily, fields);
        const hex = Buffer.from(recomputed).toString('hex');
        expect(hex).toBe(stringField(expectBlock, 'signatureInputHex'));
        expect(recomputed.length).toBe(numberField(expectBlock, 'signatureInputLen'));
        expect(adrNoWhitespace).toContain(hex);
        acceptedHexByCase.set(caseName, hex);

        const fingerprintDigestHex = optionalStringField(expectBlock, 'fingerprintDigestHex');
        if (fingerprintDigestHex !== undefined) {
          const recomputedFingerprint = blake2b256Hex(recomputed);
          expect(recomputedFingerprint).toBe(fingerprintDigestHex);
          expect(adrNoWhitespace).toContain(fingerprintDigestHex);
          acceptedFingerprintByCase.set(caseName, fingerprintDigestHex);
        }

        relationships.push({
          caseName,
          mustDifferFrom: optionalStringField(expectBlock, 'mustDifferFrom'),
          fingerprintMustDifferFrom: optionalStringField(expectBlock, 'fingerprintMustDifferFrom'),
          mustMatch: optionalStringField(expectBlock, 'mustMatch'),
        });
      } else {
        expect(build).toBe('reject');
        expect(stringField(expectBlock, 'errorCategory')).toBe('canonicalization_error');
        const reason = stringField(expectBlock, 'reason');
        expect([
          'cross_family_label_confusion',
          'duplicate_scope',
          'field_reordering',
          'invalid_field_charset',
          'invalid_fingerprint_length',
          'invalid_lifecycle_order',
          'invalid_public_key_length',
          'invalid_scope',
          'invalid_validity_bounds',
        ]).toContain(reason);
        expect(() => buildPicoIdentityVector(identityFamily, fields)).toThrow(reason);
      }
    }

    for (const { caseName, mustDifferFrom, fingerprintMustDifferFrom, mustMatch } of relationships) {
      if (mustDifferFrom !== undefined) {
        expect(acceptedHexByCase.has(mustDifferFrom)).toBe(true);
        expect(acceptedHexByCase.get(caseName)).not.toBe(acceptedHexByCase.get(mustDifferFrom));
      }
      if (fingerprintMustDifferFrom !== undefined) {
        expect(acceptedFingerprintByCase.has(fingerprintMustDifferFrom)).toBe(true);
        expect(acceptedFingerprintByCase.get(caseName)).not.toBe(acceptedFingerprintByCase.get(fingerprintMustDifferFrom));
      }
      if (mustMatch !== undefined) {
        expect(acceptedHexByCase.has(mustMatch)).toBe(true);
        expect(acceptedHexByCase.get(caseName)).toBe(acceptedHexByCase.get(mustMatch));
      }
    }
  });

  it('keeps Pico Home signature-input vectors byte-exact and aligned with ADR 0080 M1', () => {
    const currentVersion = stringField(readRepoJsonObject('package.json'), 'version');
    const suite = readRepoJsonObject('docs/protocol/fixtures/home-signature-input/suite.json');
    const fixturePaths = stringArrayField(suite, 'fixtures');
    const adrNoWhitespace = readRepoFile(
      'docs/architecture/0080-pico-home-host-key-and-move-in-claim-threat-model-and-ceremony-direction.md',
    ).replace(/\s+/g, '');

    expect(stringField(suite, 'schema')).toBe('pico.home.signature-input.vector.suite');
    expect(numberField(suite, 'schemaVersion')).toBe(1);
    expect(stringField(suite, 'suiteId')).toBe('pico.home-signature-input.pico_suite_id_v1');
    expect(stringField(suite, 'suiteVersion')).toBe(currentVersion);
    expect(stringField(suite, 'stage')).toBe('fixture_data');
    expect(stringField(suite, 'suite')).toBe(picoIdentitySuite);
    expect(stringField(suite, 'surface')).toBe('home-signature-input');
    expect(stringArrayField(suite, 'families')).toEqual(['canonicalization-positive', 'canonicalization-negative']);
    const runner = recordField(suite, 'runner');
    expect(booleanField(runner, 'required')).toBe(false);
    expect(stringField(runner, 'status')).toBe('none');
    expect(stringField(suite, 'compatibilityLevel')).toBe('authoritative-home-signature-input-vectors');
    expect(stringField(suite, 'disclaimer')).toContain('no signature verification');
    expect(stringField(suite, 'disclaimer')).toContain('no runtime claim ceremony');
    expect(stringField(suite, 'disclaimer')).toContain('no commercial permission');

    expect([...fixturePaths].sort()).toEqual(
      listFixtureDirectories('docs/protocol/fixtures/home-signature-input').sort(),
    );
    expect(textFenceAfterHeading(readRepoFile('docs/protocol/fixtures/README.md'), '## Current Pico Home signature-input fixtures')).toEqual([
      'home-signature-input/suite.json',
      ...fixturePaths.map((fixturePath) => `home-signature-input/${fixturePath}/`),
    ]);

    const acceptedHexByCase = new Map<string, string>();
    const acceptedFingerprintByCase = new Map<string, string>();
    const relationships: {
      caseName: string;
      mustDifferFrom?: string;
      fingerprintMustDifferFrom?: string;
      mustMatch?: string;
    }[] = [];

    for (const fixturePath of fixturePaths) {
      const parts = fixturePath.split('/');
      expect(parts.length).toBe(3);
      const [suiteSegment, family, caseName] = parts;
      expect(suiteSegment).toBe(picoIdentitySuite);
      expect(stringArrayField(suite, 'families')).toContain(family);

      const base = `docs/protocol/fixtures/home-signature-input/${fixturePath}`;
      const fixture = readRepoJsonObject(`${base}/fixture.json`);
      const source = recordField(fixture, 'source');
      const input = readRepoJsonObject(`${base}/input.json`);
      const expectBlock = recordField(fixture, 'expect');
      const homeFamily = stringField(fixture, 'homeFamily');

      expect(stringField(fixture, 'schema')).toBe('pico.home.signature-input.vector');
      expect(numberField(fixture, 'schemaVersion')).toBe(1);
      expect(stringField(fixture, 'fixtureId')).toBe(`home-signature-input.pico_suite_id_v1.${family}.${caseName}`);
      expect(stringField(fixture, 'stage')).toBe('fixture_data');
      expect(stringField(fixture, 'suite')).toBe(picoIdentitySuite);
      expect(stringField(fixture, 'surface')).toBe('home-signature-input');
      expect(stringField(fixture, 'family')).toBe(family);
      expect(stringField(fixture, 'adr')).toBe('0080');
      expect(stringField(fixture, 'case')).toBeTruthy();
      expect(stringField(fixture, 'notes')).toBeTruthy();
      expect(stringField(source, 'encoding')).toBe('fields');
      expect(stringField(source, 'file')).toBe('input.json');
      expect(picoHomeSignatureInputFamilies).toContain(homeFamily as typeof picoHomeSignatureInputFamilies[number]);

      const construction = picoHomeSignatureInputLabels[homeFamily as keyof typeof picoHomeSignatureInputLabels];
      expect(stringField(fixture, 'construction')).toBe(construction);
      expect(stringField(input, 'homeFamily')).toBe(homeFamily);
      const inputConstruction = stringField(input, 'construction');
      const fields = recordField(input, 'fields');
      const build = stringField(expectBlock, 'build');

      if (inputConstruction !== construction) {
        expect(build).toBe('reject');
        expect(stringField(expectBlock, 'reason')).toBe('cross_family_label_confusion');
        continue;
      }

      if (build === 'accept') {
        const recomputed = buildPicoHomeVector(homeFamily, fields);
        const hex = Buffer.from(recomputed).toString('hex');
        expect(hex).toBe(stringField(expectBlock, 'signatureInputHex'));
        expect(recomputed.length).toBe(numberField(expectBlock, 'signatureInputLen'));
        expect(adrNoWhitespace).toContain(hex);
        acceptedHexByCase.set(caseName, hex);

        const fingerprintDigestHex = optionalStringField(expectBlock, 'fingerprintDigestHex');
        if (fingerprintDigestHex !== undefined) {
          const recomputedFingerprint = blake2b256Hex(recomputed);
          expect(recomputedFingerprint).toBe(fingerprintDigestHex);
          expect(adrNoWhitespace).toContain(fingerprintDigestHex);
          acceptedFingerprintByCase.set(caseName, fingerprintDigestHex);
        }

        relationships.push({
          caseName,
          mustDifferFrom: optionalStringField(expectBlock, 'mustDifferFrom'),
          fingerprintMustDifferFrom: optionalStringField(expectBlock, 'fingerprintMustDifferFrom'),
          mustMatch: optionalStringField(expectBlock, 'mustMatch'),
        });
      } else {
        expect(build).toBe('reject');
        expect(stringField(expectBlock, 'errorCategory')).toBe('canonicalization_error');
        const reason = stringField(expectBlock, 'reason');
        expect([
          'cross_family_label_confusion',
          'duplicate_scope',
          'field_reordering',
          'invalid_field_charset',
          'invalid_fingerprint_length',
          'invalid_lifecycle_order',
          'invalid_membership_role',
          'invalid_membership_scope',
          'invalid_membership_status',
          'invalid_nonce_length',
          'invalid_reason_category',
          'invalid_validity_bounds',
          'missing_field',
        ]).toContain(reason);
        expect(() => buildPicoHomeVector(homeFamily, fields)).toThrow(reason);
      }
    }

    for (const { caseName, mustDifferFrom, fingerprintMustDifferFrom, mustMatch } of relationships) {
      if (mustDifferFrom !== undefined) {
        expect(acceptedHexByCase.has(mustDifferFrom)).toBe(true);
        expect(acceptedHexByCase.get(caseName)).not.toBe(acceptedHexByCase.get(mustDifferFrom));
      }
      if (fingerprintMustDifferFrom !== undefined) {
        expect(acceptedFingerprintByCase.has(fingerprintMustDifferFrom)).toBe(true);
        expect(acceptedFingerprintByCase.get(caseName)).not.toBe(acceptedFingerprintByCase.get(fingerprintMustDifferFrom));
      }
      if (mustMatch !== undefined) {
        expect(acceptedHexByCase.has(mustMatch)).toBe(true);
        expect(acceptedHexByCase.get(caseName)).toBe(acceptedHexByCase.get(mustMatch));
      }
    }
  });

  it('keeps Pico Vault keyfile header-AAD vectors byte-exact and aligned with ADR 0081 P1', () => {
    const currentVersion = stringField(readRepoJsonObject('package.json'), 'version');
    const suite = readRepoJsonObject('docs/protocol/fixtures/vault-keyfile/suite.json');
    const fixturePaths = stringArrayField(suite, 'fixtures');
    const adrNoWhitespace = readRepoFile(
      'docs/architecture/0081-pico-vault-person-role-key-custody-threat-model-and-direction.md',
    ).replace(/\s+/g, '');

    expect(stringField(suite, 'schema')).toBe('pico.vault.keyfile.vector.suite');
    expect(numberField(suite, 'schemaVersion')).toBe(1);
    expect(stringField(suite, 'suiteId')).toBe('pico.vault-keyfile.pico_vault_keyfile_v1');
    expect(stringField(suite, 'suiteVersion')).toBe(currentVersion);
    expect(stringField(suite, 'stage')).toBe('fixture_data');
    expect(stringField(suite, 'format')).toBe(picoVaultKeyfileFormat);
    expect(stringField(suite, 'surface')).toBe('vault-keyfile');
    expect(stringArrayField(suite, 'families')).toEqual([
      'canonicalization-positive',
      'canonicalization-negative',
      'open-negative',
    ]);
    const runner = recordField(suite, 'runner');
    expect(booleanField(runner, 'required')).toBe(false);
    expect(stringField(runner, 'status')).toBe('none');
    expect(stringField(suite, 'compatibilityLevel')).toBe('authoritative-keyfile-header-aad-vectors');
    expect(stringField(suite, 'disclaimer')).toContain('No private keys');
    expect(stringField(suite, 'disclaimer')).toContain('no unlock runtime');
    expect(stringField(suite, 'disclaimer')).toContain('no commercial permission');

    expect([...fixturePaths].sort()).toEqual(
      listFixtureDirectories('docs/protocol/fixtures/vault-keyfile').sort(),
    );
    expect(textFenceAfterHeading(readRepoFile('docs/protocol/fixtures/README.md'), '## Current Vault keyfile fixtures')).toEqual([
      'vault-keyfile/suite.json',
      ...fixturePaths.map((fixturePath) => `vault-keyfile/${fixturePath}/`),
    ]);

    const acceptedHexByCase = new Map<string, string>();
    const relationships: { caseName: string; mustDifferFrom?: string }[] = [];

    for (const fixturePath of fixturePaths) {
      const parts = fixturePath.split('/');
      expect(parts.length).toBe(3);
      const [formatSegment, family, caseName] = parts;
      expect(formatSegment).toBe(picoVaultKeyfileFormat);
      expect(stringArrayField(suite, 'families')).toContain(family);

      const base = `docs/protocol/fixtures/vault-keyfile/${fixturePath}`;
      const fixture = readRepoJsonObject(`${base}/fixture.json`);
      const source = recordField(fixture, 'source');
      const input = readRepoJsonObject(`${base}/input.json`);
      const expectBlock = recordField(fixture, 'expect');

      expect(stringField(fixture, 'schema')).toBe('pico.vault.keyfile.vector');
      expect(numberField(fixture, 'schemaVersion')).toBe(1);
      expect(stringField(fixture, 'fixtureId')).toBe(`vault-keyfile.pico_vault_keyfile_v1.${family}.${caseName}`);
      expect(stringField(fixture, 'stage')).toBe('fixture_data');
      expect(stringField(fixture, 'format')).toBe(picoVaultKeyfileFormat);
      expect(stringField(fixture, 'surface')).toBe('vault-keyfile');
      expect(stringField(fixture, 'family')).toBe(family);
      expect(stringField(fixture, 'construction')).toBe(picoVaultKeyfileFormat);
      expect(stringField(fixture, 'adr')).toBe('0081');
      expect(stringField(fixture, 'case')).toBeTruthy();
      expect(stringField(fixture, 'notes')).toContain('no private keys');
      expect(stringField(source, 'encoding')).toBe('fields');
      expect(stringField(source, 'file')).toBe('input.json');
      expect(stringField(input, 'construction')).toBe(stringField(recordField(input, 'header'), 'format'));

      const fields = recordField(input, 'header');
      const build = stringField(expectBlock, 'build');

      if (build === 'accept') {
        const recomputed = buildPicoVaultHeaderAadVector(fields);
        const hex = Buffer.from(recomputed).toString('hex');
        expect(hex).toBe(stringField(expectBlock, 'headerAadHex'));
        expect(recomputed.length).toBe(numberField(expectBlock, 'headerAadLen'));
        expect(adrNoWhitespace).toContain(hex);
        acceptedHexByCase.set(caseName, hex);
        relationships.push({
          caseName,
          mustDifferFrom: optionalStringField(expectBlock, 'mustDifferFrom'),
        });

        if (family === 'open-negative') {
          const encryptedPayload = recordField(input, 'encryptedPayload');
          expect(stringField(encryptedPayload, 'encoding')).toBe('hex');
          expect(stringField(encryptedPayload, 'containsPrivateKeys')).toBe('no');
          expect(stringField(expectBlock, 'open')).toBe('reject');
          expect(['authentication_error', 'malformed_ciphertext']).toContain(stringField(expectBlock, 'errorCategory'));
          expect(['wrong_passphrase', 'truncated_ciphertext']).toContain(stringField(expectBlock, 'reason'));
        }
      } else {
        expect(build).toBe('reject');
        expect(stringField(expectBlock, 'errorCategory')).toBe('canonicalization_error');
        const reason = stringField(expectBlock, 'reason');
        expect([
          'field_reordering',
          'invalid_aead_nonce_length',
          'invalid_fingerprint_length',
          'invalid_kdf_algorithm',
          'invalid_kdf_profile',
          'invalid_kdf_salt_length',
          'invalid_vault_key_role',
          'kdf_parameter_downgrade',
          'wrong_keyfile_label',
        ]).toContain(reason);
        expect(() => buildPicoVaultHeaderAadVector(fields)).toThrow(reason);
      }
    }

    for (const { caseName, mustDifferFrom } of relationships) {
      if (mustDifferFrom === undefined) {
        continue;
      }
      expect(acceptedHexByCase.has(mustDifferFrom)).toBe(true);
      expect(acceptedHexByCase.get(caseName)).not.toBe(acceptedHexByCase.get(mustDifferFrom));
    }
  });

  it('keeps draft Pico Link fixtures staged below runtime and compatibility claims', () => {
    const currentVersion = stringField(readRepoJsonObject('package.json'), 'version');
    const foundationSuite = readRepoJsonObject('docs/protocol/fixtures/suite.json');
    const suite = readRepoJsonObject('docs/protocol/fixtures/pico-link/draft/suite.json');
    const fixturePaths = stringArrayField(suite, 'fixtures');

    expect(stringArrayField(foundationSuite, 'fixtures').some((fixturePath) => fixturePath.startsWith('pico-link/draft/'))).toBe(false);
    expect(stringField(suite, 'schema')).toBe('pico.draft.fixture.suite');
    expect(numberField(suite, 'schemaVersion')).toBe(1);
    expect(stringField(suite, 'suiteId')).toBe('pico.pico-link.draft.v0_1_7');
    expect(stringField(suite, 'suiteVersion')).toBe(currentVersion);
    expect(stringField(suite, 'stage')).toBe('fixture_data');
    expect(stringField(suite, 'protocolVersion')).toBe(currentVersion);
    expect(stringArrayField(suite, 'surfaces')).toEqual(['pico-link', 'pico-home-link', 'canonicalization', 'compatibility-claims']);
    expect(stringArrayField(suite, 'families')).toEqual(['parse-positive', 'parse-negative']);
    const runner = recordField(suite, 'runner');
    expect(booleanField(runner, 'required')).toBe(false);
    expect(stringField(runner, 'status')).toBe('none');
    expect(stringField(suite, 'compatibilityLevel')).toBe('draft-only');
    expect(stringField(suite, 'disclaimer')).toContain('No production security guarantee');
    expect(stringField(suite, 'disclaimer')).toContain('no L4 compatibility basis');
    expect(stringField(suite, 'disclaimer')).toContain('no commercial permission');
    expect(stringField(suite, 'notes')).toContain('not a runner');
    expect(stringField(suite, 'notes')).toContain('not a published conformance suite');
    expect(fixturePaths).toEqual([
      'packet-envelope/v0.1.7/parse-positive/minimal-route-placeholder',
      'packet-envelope/v0.1.7/parse-negative/plaintext-message-leak',
      'packet-envelope/v0.1.7/parse-negative/pico-id-in-routing',
      'packet-envelope/v0.1.7/parse-negative/payload-crypto-claim',
      'packet-envelope/v0.1.7/parse-negative/relay-metadata-leak',
      'protected-payload/v0.1.7/parse-positive/opaque-placeholder',
      'protected-payload/v0.1.7/parse-negative/plaintext-in-protected-body',
      'protected-payload/v0.1.7/parse-negative/real-encryption-claim',
      'protected-payload/v0.1.7/parse-negative/embedded-key-material',
      'protected-payload/v0.1.7/parse-negative/verified-sender-authority-claim',
      'home-host-key/v0.1.7/parse-positive/host-public-key-placeholder',
      'home-host-key/v0.1.7/parse-negative/resident-signing-authority-claim',
      'home-host-key/v0.1.7/parse-negative/domain-decryption-authority-claim',
      'home-host-key/v0.1.7/parse-negative/move-in-code-as-host-key',
      'home-membership/v0.1.7/parse-positive/invited-member-placeholder',
      'home-membership/v0.1.7/parse-negative/move-in-code-as-credential',
      'home-membership/v0.1.7/parse-negative/membership-grants-domain-access',
      'home-membership/v0.1.7/parse-negative/expired-credential-as-active',
      'home-membership/v0.1.7/parse-negative/verified-issuer-claim',
      'home-residency/v0.1.7/parse-positive/resident-status-placeholder',
      'home-residency/v0.1.7/parse-negative/eviction-as-identity-destruction',
      'home-residency/v0.1.7/parse-negative/host-cleanup-as-global-deletion',
      'home-residency/v0.1.7/parse-negative/eviction-grants-domain-key-access',
      'identity-key/v0.1.7/parse-positive/identity-public-key-placeholder',
      'identity-key/v0.1.7/parse-negative/private-key-material-in-record',
      'identity-key/v0.1.7/parse-negative/verified-root-authority-claim',
      'identity-key/v0.1.7/parse-negative/relay-routing-key-as-identity',
      'device-credential/v0.1.7/parse-positive/vault-device-placeholder',
      'device-credential/v0.1.7/parse-negative/bearer-token-as-device-credential',
      'device-credential/v0.1.7/parse-negative/domain-key-access-claim',
      'lost-device/v0.1.7/parse-positive/revoke-device-placeholder',
      'lost-device/v0.1.7/parse-negative/stale-backup-reactivation',
      'lost-device/v0.1.7/parse-negative/identity-replacement-claim',
      'lost-device/v0.1.7/parse-negative/domain-rotation-proof-claim',
      'revocation-record/v0.1.7/parse-positive/device-revocation-record-placeholder',
      'revocation-record/v0.1.7/parse-negative/stale-record-current-claim',
      'revocation-record/v0.1.7/parse-negative/registry-authority-escalation',
      'revocation-record/v0.1.7/parse-negative/domain-key-material-in-record',
      'key-envelope-rotation/v0.1.7/parse-positive/domain-rotation-plan-placeholder',
      'key-envelope-rotation/v0.1.7/parse-negative/plaintext-domain-key-in-plan',
      'key-envelope-rotation/v0.1.7/parse-negative/completed-rotation-without-records',
      'key-envelope-rotation/v0.1.7/parse-negative/historical-plaintext-erasure-claim',
      'signed-event-segment/v0.1.7/parse-positive/signed-segment-placeholder',
      'signed-event-segment/v0.1.7/parse-negative/verified-signature-claim',
      'signed-event-segment/v0.1.7/parse-negative/host-resident-authorship-forgery',
      'signed-event-segment/v0.1.7/parse-negative/history-rewrite-claim',
      'replica-manifest/v0.1.7/parse-positive/replica-manifest-placeholder',
      'replica-manifest/v0.1.7/parse-negative/plaintext-in-manifest',
      'replica-manifest/v0.1.7/parse-negative/verified-completeness-claim',
      'replica-manifest/v0.1.7/parse-negative/verified-signature-claim',
      'canonicalization/v0.1.7/parse-positive/parse-only-placeholder',
      'canonicalization/v0.1.7/parse-negative/canonical-output-claim',
      'compatibility-claims/v0.1.7/parse-positive/draft-only-claim-placeholder',
      'compatibility-claims/v0.1.7/parse-negative/l4-claim-without-runner',
    ]);
    expect([...fixturePaths].sort()).toEqual(listFixtureDirectories('docs/protocol/fixtures/pico-link/draft').sort());
    expect(textFenceAfterHeading(readRepoFile('docs/protocol/fixtures/README.md'), '## Current draft Pico Link fixtures')).toEqual([
      'pico-link/draft/suite.json',
      ...fixturePaths.map((fixturePath) => `pico-link/draft/${fixturePath}/`),
    ]);

    for (const fixturePath of fixturePaths) {
      const [draftSurface, fixtureVersion, fixtureFamily, fixtureCase] = fixturePathParts(fixturePath);
      const fixture = readRepoJsonObject(`docs/protocol/fixtures/pico-link/draft/${fixturePath}/fixture.json`);
      const source = recordField(fixture, 'source');
      const expectBlock = recordField(fixture, 'expect');
      const runnerBlock = recordField(fixture, 'runner');
      const claims = recordField(fixture, 'claims');
      const input = readRepoJsonObject(`docs/protocol/fixtures/pico-link/draft/${fixturePath}/${stringField(source, 'file')}`);

      expect(stringField(fixture, 'schema')).toBe('pico.draft.fixture');
      expect(numberField(fixture, 'schemaVersion')).toBe(1);
      expect(stringField(fixture, 'stage')).toBe('fixture_data');
      expect(stringField(fixture, 'compatibilityLevel')).toBe('draft-only');
      expect(stringField(fixture, 'draftSurface')).toBe(draftSurface);
      expect(fixtureVersion).toBe(`v${currentVersion}`);
      expect(stringField(fixture, 'protocolVersion')).toBe(currentVersion);
      expect(stringField(fixture, 'family')).toBe(fixtureFamily);
      expect(stringArrayField(suite, 'families')).toContain(fixtureFamily);
      expect(stringField(fixture, 'case')).toBeTruthy();
      expect(stringField(fixture, 'notes')).toContain('Draft-only');
      expect(stringField(source, 'encoding')).toBe('json');
      expect(stringField(source, 'file')).toBe('input.json');
      expect(booleanField(runnerBlock, 'required')).toBe(false);
      expect(stringField(runnerBlock, 'status')).toBe('none');
      expectDraftClaimsRemainFalse(claims);

      if (fixtureFamily === 'parse-positive') {
        expect(stringField(expectBlock, 'parse')).toBe('accept');
        expect(stringArrayField(expectBlock, 'errors')).toEqual([]);
      } else if (fixtureFamily === 'parse-negative') {
        expect(stringField(expectBlock, 'parse')).toBe('reject');
        expect(booleanField(expectBlock, 'preserveSemantics')).toBe(false);
      } else {
        throw new Error(`Unexpected draft fixture family: ${fixtureFamily}`);
      }

      expectDraftFixtureBoundary(draftSurface, fixtureCase, input, expectBlock);
    }
  });

  it('keeps draft Model Delegation fixtures staged below runtime, trust and model-quality claims', () => {
    const currentVersion = stringField(readRepoJsonObject('package.json'), 'version');
    const foundationSuite = readRepoJsonObject('docs/protocol/fixtures/suite.json');
    const picoLinkSuite = readRepoJsonObject('docs/protocol/fixtures/pico-link/draft/suite.json');
    const suite = readRepoJsonObject('docs/protocol/fixtures/model-delegation/draft/suite.json');
    const fixturePaths = stringArrayField(suite, 'fixtures');

    expect(stringArrayField(foundationSuite, 'fixtures').some((fixturePath) => fixturePath.startsWith('model-delegation/draft/'))).toBe(false);
    expect(stringArrayField(picoLinkSuite, 'fixtures').some((fixturePath) => fixturePath.startsWith('model-delegation/'))).toBe(false);
    expect(stringField(suite, 'schema')).toBe('pico.model-delegation.draft.fixture.suite');
    expect(numberField(suite, 'schemaVersion')).toBe(1);
    expect(stringField(suite, 'suiteId')).toBe('pico.model-delegation.draft.v0_1_7');
    expect(stringField(suite, 'suiteVersion')).toBe(currentVersion);
    expect(stringField(suite, 'stage')).toBe('fixture_data');
    expect(stringField(suite, 'protocolVersion')).toBe(currentVersion);
    expect(stringArrayField(suite, 'surfaces')).toEqual([
      'model-provider-registry',
      'model-job-envelope',
      'model-context-ref',
      'model-result-envelope',
    ]);
    expect(stringArrayField(suite, 'families')).toEqual(['parse-positive', 'authority-negative', 'privacy-negative', 'provenance-negative']);
    const runner = recordField(suite, 'runner');
    expect(booleanField(runner, 'required')).toBe(false);
    expect(stringField(runner, 'status')).toBe('none');
    expect(stringField(suite, 'compatibilityLevel')).toBe('draft-only');
    expect(stringField(suite, 'disclaimer')).toContain('No runtime execution');
    expect(stringField(suite, 'disclaimer')).toContain('no model-quality guarantee');
    expect(stringField(suite, 'disclaimer')).toContain('no provider trust proof');
    expect(stringField(suite, 'disclaimer')).toContain('no privacy enforcement');
    expect(stringField(suite, 'disclaimer')).toContain('no L4 compatibility basis');
    expect(stringField(suite, 'disclaimer')).toContain('no commercial permission');
    expect(stringField(suite, 'notes')).toContain('not a runner');
    expect(stringField(suite, 'notes')).toContain('not a provider registry');
    expect(stringField(suite, 'notes')).toContain('not model-quality evidence');
    expect(fixturePaths).toEqual([
      'provider-registry/v0.1.7/parse-positive/local-summarizer-placeholder',
      'provider-registry/v0.1.7/authority-negative/vault-read-authority-claim',
      'provider-registry/v0.1.7/authority-negative/trust-grant-by-discovery',
      'provider-registry/v0.1.7/authority-negative/revoked-provider-usable',
      'provider-registry/v0.1.7/authority-negative/tool-execution-by-advertisement',
      'job-envelope/v0.1.7/parse-positive/scoped-summarize-placeholder',
      'job-envelope/v0.1.7/privacy-negative/forbidden-input-class',
      'job-envelope/v0.1.7/authority-negative/durable-access-claim',
      'job-envelope/v0.1.7/authority-negative/missing-policy-consent',
      'job-envelope/v0.1.7/privacy-negative/unsafe-provider-retention',
      'context-ref/v0.1.7/parse-positive/bounded-excerpt-placeholder',
      'context-ref/v0.1.7/privacy-negative/provider-expandable-context',
      'context-ref/v0.1.7/authority-negative/provider-read-through-context-ref',
      'context-ref/v0.1.7/privacy-negative/unscoped-context-ref',
      'context-ref/v0.1.7/privacy-negative/secret-material-in-context-ref',
      'result-envelope/v0.1.7/parse-positive/proposal-provenance-placeholder',
      'result-envelope/v0.1.7/authority-negative/action-execution-claim',
      'result-envelope/v0.1.7/authority-negative/model-correctness-claim',
      'result-envelope/v0.1.7/provenance-negative/result-job-mismatch',
      'result-envelope/v0.1.7/provenance-negative/result-provider-mismatch',
    ]);
    expect([...fixturePaths].sort()).toEqual(listFixtureDirectories('docs/protocol/fixtures/model-delegation/draft').sort());
    expect(textFenceAfterHeading(readRepoFile('docs/protocol/fixtures/README.md'), '## Current draft Model Delegation fixtures')).toEqual([
      'model-delegation/draft/suite.json',
      ...fixturePaths.map((fixturePath) => `model-delegation/draft/${fixturePath}/`),
    ]);

    for (const fixturePath of fixturePaths) {
      const [draftSurface, fixtureVersion, fixtureFamily, fixtureCase] = fixturePathParts(fixturePath);
      const fixture = readRepoJsonObject(`docs/protocol/fixtures/model-delegation/draft/${fixturePath}/fixture.json`);
      const source = recordField(fixture, 'source');
      const expectBlock = recordField(fixture, 'expect');
      const runnerBlock = recordField(fixture, 'runner');
      const claims = recordField(fixture, 'claims');
      const input = readRepoJsonObject(`docs/protocol/fixtures/model-delegation/draft/${fixturePath}/${stringField(source, 'file')}`);

      expect(stringField(fixture, 'schema')).toBe('pico.model-delegation.fixture.draft');
      expect(numberField(fixture, 'schemaVersion')).toBe(1);
      expect(stringField(fixture, 'fixtureId')).toBe(`model-delegation.${draftSurface}.${fixtureVersion.replaceAll('.', '_')}.${fixtureFamily}.${fixtureCase}`);
      expect(stringField(fixture, 'fixtureStage')).toBe('draft');
      expect(stringField(fixture, 'stage')).toBe('fixture_data');
      expect(stringField(fixture, 'surface')).toBe(modelDelegationSurfaceForPath(draftSurface));
      expect(stringArrayField(suite, 'surfaces')).toContain(stringField(fixture, 'surface'));
      expect(fixtureVersion).toBe(`v${currentVersion}`);
      expect(stringField(fixture, 'protocolVersion')).toBe(currentVersion);
      expect(stringField(fixture, 'compatibilityLevel')).toBe('draft-only');
      expect(stringField(fixture, 'family')).toBe(fixtureFamily);
      expect(stringArrayField(suite, 'families')).toContain(fixtureFamily);
      expect(stringField(fixture, 'case')).toBeTruthy();
      expect(stringField(fixture, 'notes')).toContain('Draft-only');
      expect(stringField(source, 'encoding')).toBe('json');
      expect(stringField(source, 'file')).toBe('input.json');
      expect(booleanField(runnerBlock, 'required')).toBe(false);
      expect(stringField(runnerBlock, 'status')).toBe('none');
      expectModelDelegationClaimsRemainNonAuthoritative(claims);
      expectRequiredModelDelegationDisclaimers(fixture);

      if (fixtureFamily === 'parse-positive') {
        expect(stringField(expectBlock, 'status')).toBe('accept');
        expect(stringArrayField(expectBlock, 'errors')).toEqual([]);
      } else if (fixtureFamily.endsWith('-negative')) {
        expect(stringField(expectBlock, 'status')).toBe('reject');
        expect(stringArrayField(expectBlock, 'errors').length).toBeGreaterThan(0);
      } else {
        throw new Error(`Unexpected model-delegation draft fixture family: ${fixtureFamily}`);
      }

      expectModelDelegationDraftFixtureBoundary(draftSurface, fixtureCase, input, expectBlock);
    }
  });

  it('keeps architecture wire event examples aligned with known protocol event types', () => {
    const terminology = readRepoFile('docs/architecture/0026-product-terminology-and-naming.md');
    const examples = textFenceAfterHeading(terminology, '## Wire naming rule');
    const knownTypes = new Set<string>(picoEventTypes);

    expect(examples).toEqual([
      'action.requested',
      'pico_rules.decision_created',
      'action_runner.action_started',
      'action_history.event_created',
      'pico_home.claim_requested',
      'pico_home.invite_created',
    ]);

    for (const example of examples) {
      expect(knownTypes.has(example)).toBe(true);
    }
  });

  it('accepts a minimal message event shape', () => {
    const event: PicoEvent<{ role: 'user'; text: string }> = {
      eventId: 'evt-1',
      deviceId: 'desktop-dev',
      lamport: 1,
      wallTime: '2026-07-02T20:00:00.000Z',
      type: 'message.created',
      stream: 'session:test',
      payload: {
        role: 'user',
        text: 'Hallo Pico',
      },
    };

    expect(event.type).toBe('message.created');
    expect(event.payload.text).toBe('Hallo Pico');
  });

  it('accepts current websocket realtime message shapes', () => {
    const connected: PicoRealtimeMessage = {
      type: realtimeMessageType.coreConnected,
      deviceId: 'test-core',
    };
    const eventCreated: PicoRealtimeMessage = {
      type: realtimeMessageType.eventCreated,
      event: {
        eventId: 'evt-1',
        deviceId: 'desktop-dev',
        lamport: 1,
        wallTime: '2026-07-02T20:00:00.000Z',
        type: 'message.created',
        stream: 'session:test',
        payload: { role: 'user', text: 'Hallo Pico' },
      },
    };

    expect(connected.type).toBe('pico.core.connected');
    expect(eventCreated.event.type).toBe('message.created');
  });

  it('accepts the current realtime ticket response shape', () => {
    const response: PicoRealtimeTicketResponse = {
      ticket: 'ticket-value',
      expiresAt: '2026-07-09T12:00:30.000Z',
    };

    expect(response.ticket).toBe('ticket-value');
  });

  it('accepts an avatar state change payload', () => {
    const payload: AvatarStateChangedPayload = {
      mode: 'everyday',
      state: 'thinking',
      intensity: 'normal',
      statusColor: 'violet',
      message: 'Thinking',
    };

    expect(payload.state).toBe('thinking');
  });

  it('accepts an action payload with product terminology', () => {
    const payload: ActionRequestedPayload = {
      actionName: 'homeassistant.get_entity_state',
      risk: 'read_only',
      input: {
        entityId: 'sensor.pico_status',
      },
    };

    expect(payload.risk).toBe('read_only');
  });

  it('keeps legacy tool payloads available for compatibility', () => {
    const payload: ToolCallRequestedPayload = {
      toolName: 'homeassistant.get_entity_state',
      riskLevel: 'read_only',
      arguments: {
        entityId: 'sensor.pico_status',
      },
    };

    expect(payload.riskLevel).toBe('read_only');
  });

  it('accepts Pico Rules decisions with product terminology', () => {
    const payload: PicoRulesDecisionCreatedPayload = {
      requestedEventId: 'evt-action-request',
      decision: 'require_approval',
      reason: 'External write requires user approval.',
      risk: 'external_write',
      dataSpace: 'home_assistant',
    };

    expect(payload.decision).toBe('require_approval');
  });

  it('keeps legacy policy decisions separate from tool risk classes', () => {
    const payload: PolicyDecisionCreatedPayload = {
      requestedEventId: 'evt-tool-request',
      decision: 'require_confirmation',
      reason: 'External write requires user confirmation.',
      riskLevel: 'external_write',
      dataDomain: 'home_assistant',
    };

    expect(payload.decision).toBe('require_confirmation');
  });

  it('supports product-named action history records', () => {
    const payload: ActionHistoryEventPayload = {
      subjectEventId: 'evt-pico-rules-decision',
      actorDeviceId: 'desktop-dev',
      action: 'pico_rules.decision_created',
      decision: 'deny',
      dataSpace: 'private',
      redaction: 'summary',
      summary: 'Pico Rules result was recorded without storing the original payload.',
    };

    expect(payload.redaction).toBe('summary');
  });

  it('accepts reserved payload posture terminology without changing the current event shape', () => {
    const posture: PayloadPosture = 'reference_only';

    expect(payloadPostures).toContain(posture);
  });

  it('keeps legacy redacted audit records available for compatibility', () => {
    const payload: AuditEventCreatedPayload = {
      subjectEventId: 'evt-policy-decision',
      actorDeviceId: 'desktop-dev',
      action: 'policy.decision_created',
      decision: 'deny',
      dataDomain: 'personal',
      redaction: 'summary',
      summary: 'Policy result was recorded without storing the original payload.',
    };

    expect(payload.redaction).toBe('summary');
  });

  it('accepts Pico Home membership terminology', () => {
    const membership: PicoHomeMembership = {
      picoId: 'pico:alice',
      homeId: 'home:household',
      role: 'home_member',
      status: 'active',
    };

    expect(membership.role).toBe('home_member');
  });
});

function expectCurrentFoundationEventFixture(
  input: Record<string, unknown>,
  inputType: string,
  expectBlock: Record<string, unknown>,
  family: string,
): void {
  const http = recordField(expectBlock, 'http');

  expect(stringField(http, 'method')).toBe('POST');
  expect(stringField(http, 'path')).toBe('/api/events');

  if (family === 'parse-positive') {
    expect(stringField(expectBlock, 'parse')).toBe('accept');
    expect(booleanField(expectBlock, 'preserveSemantics')).toBe(true);
    expect(stringArrayField(expectBlock, 'errors')).toEqual([]);
    expect(numberField(http, 'status')).toBe(201);
    expect(foundationEventTypes).toContain(inputType);

    const validation = validateFoundationEventPayload(
      inputType as typeof foundationEventTypes[number],
      recordField(input, 'payload'),
    );
    expect(validation.ok).toBe(true);
  } else if (family === 'parse-negative') {
    expect(stringField(expectBlock, 'parse')).toBe('reject');
    expect(booleanField(expectBlock, 'preserveSemantics')).toBe(false);
    expect(numberField(http, 'status')).toBe(400);
    expect(picoEventTypes).toContain(inputType);
    expect(stringArrayField(expectBlock, 'errors')).toEqual(['schema_error']);
    const expectedError = stringField(recordField(http, 'body'), 'error');

    if (foundationEventTypes.includes(inputType as typeof foundationEventTypes[number])) {
      const validation = validateFoundationEventPayload(
        inputType as typeof foundationEventTypes[number],
        recordField(input, 'payload'),
      );
      expect(validation.ok).toBe(false);
      if (!validation.ok) {
        expect(expectedError).toBe(validation.error);
      }
    } else {
      expect(foundationEventTypes).not.toContain(inputType);
      expect(expectedError).toBe('This event type is reserved for a later Pico Rules, Action Runner or Pico Home API.');
    }
  } else {
    throw new Error(`Unexpected fixture family: ${family}`);
  }
}

function expectCurrentFoundationRealtimeFixture(
  input: Record<string, unknown>,
  inputType: string,
  expectBlock: Record<string, unknown>,
  family: string,
): void {
  const websocket = recordField(expectBlock, 'websocket');

  expect(stringField(websocket, 'path')).toBe('/ws');
  expect(stringField(websocket, 'messageType')).toBe(inputType);

  if (family === 'parse-positive') {
    expect(stringField(expectBlock, 'parse')).toBe('accept');
    expect(booleanField(expectBlock, 'preserveSemantics')).toBe(true);
    expect(stringArrayField(expectBlock, 'errors')).toEqual([]);
    expect(realtimeMessageTypes).toContain(inputType);

    if (inputType === realtimeMessageType.coreConnected) {
      expect(stringField(input, 'deviceId')).toBeTruthy();
    } else if (inputType === realtimeMessageType.eventCreated) {
      const event = recordField(input, 'event');
      const eventType = stringField(event, 'type');
      expect(foundationEventTypes).toContain(eventType);
      const validation = validateFoundationEventPayload(
        eventType as typeof foundationEventTypes[number],
        recordField(event, 'payload'),
      );
      expect(validation.ok).toBe(true);
    } else {
      throw new Error(`Unexpected realtime fixture message type: ${inputType}`);
    }
  } else if (family === 'parse-negative') {
    expect(stringField(expectBlock, 'parse')).toBe('reject');
    expect(booleanField(expectBlock, 'preserveSemantics')).toBe(false);
    expect(stringArrayField(expectBlock, 'errors')).toEqual(['schema_error']);

    if (inputType === realtimeMessageType.coreConnected) {
      expect(input.deviceId).toBeUndefined();
    } else if (inputType === realtimeMessageType.eventCreated) {
      if (input.event === undefined) {
        return;
      }

      const event = recordField(input, 'event');
      const eventType = stringField(event, 'type');

      if (foundationEventTypes.includes(eventType as typeof foundationEventTypes[number])) {
        const validation = validateFoundationEventPayload(
          eventType as typeof foundationEventTypes[number],
          recordField(event, 'payload'),
        );
        expect(validation.ok).toBe(false);
      } else {
        expect(picoEventTypes).toContain(eventType);
        expect(foundationEventTypes).not.toContain(eventType);
      }
    } else {
      expect(realtimeMessageTypes).not.toContain(inputType);
    }
  } else {
    throw new Error(`Unexpected fixture family: ${family}`);
  }
}

function expectFixtureCapabilitiesForInput(
  input: Record<string, unknown>,
  surface: string,
  capabilitiesRequired: string[],
): void {
  const eventType = fixtureEventType(input, surface);

  if (eventType === 'avatar.state_changed') {
    expect(capabilitiesRequired).toContain('pico.avatar_state.v1');
  }
}

function fixtureEventType(input: Record<string, unknown>, surface: string): string | undefined {
  if (surface === 'foundation-events') {
    return stringField(input, 'type');
  }

  if (surface === 'foundation-realtime' && input.type === realtimeMessageType.eventCreated && input.event !== undefined) {
    return stringField(recordField(input, 'event'), 'type');
  }

  return undefined;
}

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRootPath, path), 'utf8');
}

function listFixtureDirectories(rootPath: string): string[] {
  const fixturesRootPath = resolve(repoRootPath, rootPath);
  const fixtureDirectories: string[] = [];

  collectFixtureDirectories(fixturesRootPath, '', fixtureDirectories);

  return fixtureDirectories;
}

function expectDraftClaimsRemainFalse(claims: Record<string, unknown>): void {
  expect(booleanField(claims, 'productionSecurity')).toBe(false);
  expect(booleanField(claims, 'cryptographyVerified')).toBe(false);
  expect(booleanField(claims, 'homeMembershipVerified')).toBe(false);
  expect(booleanField(claims, 'l4Compatibility')).toBe(false);
  expect(booleanField(claims, 'commercialPermission')).toBe(false);
}

function expectModelDelegationClaimsRemainNonAuthoritative(claims: Record<string, unknown>): void {
  expect(booleanField(claims, 'runtimeExecution')).toBe(false);
  expect(booleanField(claims, 'modelQuality')).toBe(false);
  expect(booleanField(claims, 'providerAuthentication')).toBe(false);
  expect(booleanField(claims, 'privacyGrantEnforcement')).toBe(false);
  expect(booleanField(claims, 'retentionEnforcement')).toBe(false);
  expect(booleanField(claims, 'toolExecution')).toBe(false);
  expect(booleanField(claims, 'productionSecurity')).toBe(false);
  expect(booleanField(claims, 'l4Compatibility')).toBe(false);
  expect(booleanField(claims, 'commercialPermission')).toBe(false);
  expect(stringField(claims, 'compatibility')).toBe('draft-only');
}

function expectRequiredModelDelegationDisclaimers(fixture: Record<string, unknown>): void {
  expect(stringArrayField(fixture, 'disclaimers')).toEqual([
    'draft-only',
    'not production security',
    'not model quality',
    'not runtime execution',
    'not L4 conformance',
    'not commercial permission',
  ]);
}

function expectDraftFixtureBoundary(
  draftSurface: string,
  fixtureCase: string,
  input: Record<string, unknown>,
  expectBlock: Record<string, unknown>,
): void {
  expect(stringField(input, 'fixtureStage')).toBe('draft');

  if (draftSurface === 'packet-envelope') {
    expect(stringField(input, 'schema')).toBe('pico.link.packet.draft');
    expect(Object.keys(input).sort()).toEqual([
      'delivery',
      'extensions',
      'fixtureStage',
      'packetId',
      'payload',
      'routing',
      'schema',
      'schemaVersion',
      ...(fixtureCase === 'plaintext-message-leak' ? ['messageText'] : []),
    ].sort());
    expect(stringField(input, 'packetId')).toContain('pkt_draft_');
    const routing = recordField(input, 'routing');
    expect(Object.keys(routing).sort()).toEqual(['destinationRouteId', 'replyRouteId', 'senderRouteId']);
    for (const routingValue of Object.values(routing)) {
      expect(typeof routingValue).toBe('string');
      if (fixtureCase !== 'pico-id-in-routing') {
        expect(String(routingValue)).toContain('route_');
        expect(String(routingValue)).not.toContain('pico_');
      }
    }
    const delivery = recordField(input, 'delivery');
    expect(['message', 'presence', 'wake_hint', 'system_probe']).toContain(stringField(delivery, 'trafficClass'));
    expect(['low', 'normal']).toContain(stringField(delivery, 'priority'));
    expect(numberField(delivery, 'ttl')).toBeGreaterThan(0);
    expect(stringField(delivery, 'expiresAt')).toBeTruthy();
    const payload = recordField(input, 'payload');
    expect(stringField(payload, 'contentType')).toBe('application/vnd.pico.link.protected-placeholder+json');
    expect(booleanField(payload, 'placeholder')).toBe(true);
    expect(stringField(payload, 'protectedPayloadRef')).toContain('payload_placeholder_');
    if (fixtureCase !== 'payload-crypto-claim') {
      expect(payload.ciphertext).toBeUndefined();
      expect(payload.signature).toBeUndefined();
      expect(payload.keyEnvelope).toBeUndefined();
      expect(payload.algorithmSuite).toBeUndefined();
      expect(payload.plaintext).toBeUndefined();
    }
    const expectPrivacy = recordField(expectBlock, 'privacy');

    if (fixtureCase === 'plaintext-message-leak') {
      expect(stringField(input, 'messageText')).toContain('plaintext');
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['protected_plaintext_leak']);
      expect(booleanField(expectPrivacy, 'relayVisiblePlaintext')).toBe(true);
    } else if (fixtureCase === 'pico-id-in-routing') {
      expect(input.messageText).toBeUndefined();
      expect(stringField(routing, 'senderRouteId')).toContain('pico_');
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['packet_routing_pico_identity']);
      expect(booleanField(expectPrivacy, 'routingIdentityIsPicoIdentity')).toBe(true);
    } else if (fixtureCase === 'payload-crypto-claim') {
      expect(input.messageText).toBeUndefined();
      expect(stringField(payload, 'algorithmSuite')).toBeTruthy();
      expect(stringField(payload, 'ciphertext')).toBeTruthy();
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['packet_payload_crypto_claim']);
      expect(booleanField(expectPrivacy, 'payloadCryptoClaimed')).toBe(true);
    } else if (fixtureCase === 'relay-metadata-leak') {
      expect(input.messageText).toBeUndefined();
      expect(stringField(delivery, 'leakedRelationshipHint')).toContain('relationship_');
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['packet_relay_metadata_leak']);
      expect(booleanField(expectPrivacy, 'relayMetadataLeaked')).toBe(true);
    } else {
      expect(input.messageText).toBeUndefined();
      expect(booleanField(expectPrivacy, 'relayVisiblePlaintext')).toBe(false);
      expect(booleanField(expectPrivacy, 'routingIdentityIsPicoIdentity')).toBe(false);
    }
  } else if (draftSurface === 'protected-payload') {
    expect(stringField(input, 'schema')).toBe('pico.payload.protected.draft');
    expect(input.plaintext).toBeUndefined();
    const protection = recordField(input, 'protection');
    const claimedSender = recordField(input, 'claimedSender');
    const body = recordField(input, 'body');
    const expectPrivacy = recordField(expectBlock, 'privacy');

    if (fixtureCase === 'opaque-placeholder') {
      expect(stringField(protection, 'mode')).toBe('placeholder');
      expect(stringField(protection, 'algorithmSuite')).toBe('placeholder-only');
      expect(stringArrayField(protection, 'keyEnvelopeRefs')).toEqual([]);
      expect(stringField(claimedSender, 'proofStatus')).toBe('unverified-placeholder');
      expect(stringField(body, 'kind')).toBe('opaque-placeholder');
      expect(booleanField(body, 'placeholder')).toBe(true);
      expect(stringField(body, 'protectedContentRef')).toContain('content_placeholder_');
      expect(input.ciphertext).toBeUndefined();
      expect(input.signature).toBeUndefined();
      expect(input.keyEnvelope).toBeUndefined();
      expect(booleanField(expectPrivacy, 'bodyIsOpaquePlaceholder')).toBe(true);
      expect(booleanField(expectPrivacy, 'senderProofVerified')).toBe(false);
      expect(booleanField(expectPrivacy, 'audienceAuthorityVerified')).toBe(false);
    } else if (fixtureCase === 'plaintext-in-protected-body') {
      expect(stringField(body, 'kind')).toBe('plaintext-leak');
      expect(booleanField(body, 'placeholder')).toBe(false);
      expect(stringField(body, 'plaintext')).toContain('plaintext');
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['protected_plaintext_leak']);
      expect(booleanField(expectPrivacy, 'bodyIsOpaquePlaceholder')).toBe(false);
      expect(booleanField(expectPrivacy, 'plaintextLeaked')).toBe(true);
    } else if (fixtureCase === 'real-encryption-claim') {
      expect(stringField(protection, 'mode')).not.toBe('placeholder');
      expect(stringField(protection, 'algorithmSuite')).not.toBe('placeholder-only');
      expect(recordField(input, 'cryptoAuthorityClaim')).toBeTruthy();
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['protected_real_crypto_claim']);
      expect(booleanField(expectPrivacy, 'realCryptoClaimed')).toBe(true);
    } else if (fixtureCase === 'embedded-key-material') {
      expect(recordField(input, 'keyEnvelope')).toBeTruthy();
      expect(stringField(input, 'ciphertext')).toBeTruthy();
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['protected_key_material']);
      expect(booleanField(expectPrivacy, 'keyMaterialEmbedded')).toBe(true);
    } else if (fixtureCase === 'verified-sender-authority-claim') {
      expect(stringField(claimedSender, 'proofStatus')).toBe('verified');
      expect(recordField(input, 'senderAuthorityClaim')).toBeTruthy();
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['protected_sender_authority_claim']);
      expect(booleanField(expectPrivacy, 'senderProofVerified')).toBe(true);
    }
  } else if (draftSurface === 'compatibility-claims') {
    expect(stringField(input, 'schema')).toBe('pico.compatibility.claim.draft');
    const conformance = recordField(input, 'conformance');
    expect(stringField(conformance, 'runner')).toBe('none');
    expect(stringField(conformance, 'result')).toBe('not_tested');
    const security = recordField(input, 'security');
    expect(booleanField(security, 'productionSecurity')).toBe(false);
    expect(booleanField(security, 'cryptographyVerified')).toBe(false);
    expect(booleanField(security, 'homeMembershipVerified')).toBe(false);
    const permission = recordField(input, 'permission');
    expect(stringField(permission, 'commercialPermission')).toBe('not-granted-by-compatibility');

    if (fixtureCase === 'l4-claim-without-runner') {
      expect(stringField(conformance, 'level')).toBe('L4');
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['compatibility_claim']);
      expect(stringArrayField(input, 'disclaimers')).not.toContain('not L4 conformance');
      expect(stringArrayField(expectBlock, 'requiredDisclaimers')).toContain('not L4 conformance');
    } else if (fixtureCase === 'draft-only-claim-placeholder') {
      expect(stringField(conformance, 'level')).not.toBe('L4');
      expect(stringArrayField(input, 'disclaimers')).toContain('draft-only');
      expect(stringArrayField(input, 'disclaimers')).toContain('not L4 conformance');
    }
  } else if (draftSurface === 'home-host-key') {
    expect(stringField(input, 'schema')).toBe('pico.home.host-key.draft');
    const isMoveInCodeCase = fixtureCase === 'move-in-code-as-host-key';
    expect(stringField(input, 'hostKeyRecordId')).toContain(isMoveInCodeCase ? 'movein_code_' : 'homehostkey_placeholder_');
    const home = recordField(input, 'home');
    expect(stringField(home, 'homeIdHint')).toContain('home_placeholder_');
    expect(stringField(home, 'hostKeyRef')).toContain(isMoveInCodeCase ? 'movein_code_' : 'homehostkey_placeholder_');
    expect(['empty-placeholder', 'setup-mode-placeholder', 'claimed-placeholder', 'migrating-placeholder', 'reset-placeholder', 'retired-placeholder', 'unknown-placeholder'])
      .toContain(stringField(home, 'setupState'));
    expect(stringField(home, 'proofStatus')).toBe('unverified-placeholder');
    const host = recordField(input, 'host');
    expect(stringField(host, 'hostPicoIdHint')).toContain('pico_placeholder_');
    expect(stringField(host, 'hostDeviceIdHint')).toContain('device_placeholder_');
    expect(['home_host_pico', 'host_admin_device', 'service_placeholder', 'migration_placeholder']).toContain(stringField(host, 'hostRole'));
    expect(stringField(host, 'proofStatus')).toBe('unverified-placeholder');
    const publicKey = recordField(input, 'publicKey');
    expect(stringField(publicKey, 'keyRef')).toContain(isMoveInCodeCase ? 'movein_code_' : 'homehostkey_placeholder_');
    expect(['absent', 'placeholder-ref-only', 'public-placeholder']).toContain(stringField(publicKey, 'materialStatus'));
    expect(stringField(publicKey, 'format')).toBe('unspecified-placeholder');
    expect(stringField(publicKey, 'algorithm')).toBe('unspecified-placeholder');
    expect(stringField(publicKey, 'fingerprintStatus')).toBe('absent');
    const lifecycle = recordField(input, 'lifecycle');
    expect(['introduced-placeholder', 'active-placeholder', 'rotating-placeholder', 'retired-placeholder', 'revoked-placeholder', 'compromised-placeholder', 'unknown-placeholder'])
      .toContain(stringField(lifecycle, 'status'));
    expect(['not-claimed', 'same-home-not-verified', 'new-home-placeholder', 'manual-review-required'])
      .toContain(stringField(lifecycle, 'resetContinuity'));
    const continuity = recordField(input, 'continuity');
    expect(booleanField(continuity, 'sameHomeClaim')).toBe(false);
    expect(booleanField(continuity, 'memberAcceptanceRequired')).toBe(true);
    expect(stringField(continuity, 'membershipCredentialBinding')).toBe('not-verified');
    expect(booleanField(continuity, 'currentClaim')).toBe(false);
    const authority = recordField(input, 'authority');
    expect(booleanField(authority, 'hostInfrastructure')).toBe(true);
    expect(booleanField(authority, 'membershipIssuanceVerified')).toBe(false);
    const relay = recordField(input, 'relay');
    expect(stringField(relay, 'relayEndpointRef')).toContain('relay_endpoint_placeholder_');
    expect(stringField(relay, 'routingIdentityRef')).toContain('route_placeholder_');
    expect(booleanField(relay, 'relayAuthority')).toBe(false);
    const audit = recordField(input, 'audit');
    expect(stringField(audit, 'payloadPosture')).toBe('metadata-only');
    expect(booleanField(audit, 'userVisible')).toBe(true);
    expect(stringField(input, 'signatureStatus')).toBe('absent');
    const expectHome = recordField(expectBlock, 'home');
    expect(booleanField(expectHome, 'hostKeyVerified')).toBe(false);
    expect(booleanField(expectHome, 'homeContinuityVerified')).toBe(false);
    expect(booleanField(expectHome, 'membershipAuthorityVerified')).toBe(false);
    expect(booleanField(expectHome, 'relayAuthority')).toBe(false);

    if (fixtureCase === 'resident-signing-authority-claim') {
      expect(booleanField(authority, 'residentSigningAuthority')).toBe(true);
      expect(recordField(input, 'residentAuthorityClaim')).toBeTruthy();
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['resident_identity_authority_claim']);
      expect(booleanField(expectHome, 'residentSigningAuthority')).toBe(true);
    } else {
      expect(booleanField(authority, 'residentSigningAuthority')).toBe(false);
      expect(input.residentAuthorityClaim).toBeUndefined();
      expect(booleanField(expectHome, 'residentSigningAuthority')).toBe(false);
    }

    if (fixtureCase === 'domain-decryption-authority-claim') {
      expect(booleanField(authority, 'residentDomainDecryption')).toBe(true);
      const domainAccessClaim = recordField(input, 'domainAccessClaim');
      expect(stringField(domainAccessClaim, 'domainContentKeyRef')).toContain('domainkey_placeholder_');
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['host_domain_decryption_claim']);
      expect(booleanField(expectHome, 'residentDomainDecryption')).toBe(true);
      expect(booleanField(expectHome, 'domainContentKeyExposed')).toBe(true);
    } else {
      expect(booleanField(authority, 'residentDomainDecryption')).toBe(false);
      expect(input.domainAccessClaim).toBeUndefined();
      expect(booleanField(expectHome, 'residentDomainDecryption')).toBe(false);
      expect(booleanField(expectHome, 'domainContentKeyExposed')).toBe(false);
    }

    if (isMoveInCodeCase) {
      expect(booleanField(authority, 'moveInCodeUsed')).toBe(true);
      expect(stringField(input, 'moveInCode')).toContain('MOVE_IN_CODE_PLACEHOLDER');
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['move_in_code_host_key_boundary']);
      expect(booleanField(expectHome, 'moveInCodeUsed')).toBe(true);
    } else {
      expect(booleanField(authority, 'moveInCodeUsed')).toBe(false);
      expect(input.moveInCode).toBeUndefined();
      expect(booleanField(expectHome, 'moveInCodeUsed')).toBe(false);
    }

    expect(booleanField(expectHome, 'runtimeAuthorization')).toBe(fixtureCase !== 'host-public-key-placeholder');
  } else if (draftSurface === 'home-membership') {
    expect(stringField(input, 'schema')).toBe('pico.home.membership.credential.draft');
    expect(stringField(input, 'credentialId')).toContain(fixtureCase === 'move-in-code-as-credential' ? 'movein_code_' : 'homecred_placeholder_');
    const issuer = recordField(input, 'issuer');
    if (fixtureCase !== 'verified-issuer-claim') {
      expect(stringField(issuer, 'proofStatus')).toBe('unverified-placeholder');
    }
    const subject = recordField(input, 'subject');
    expect(['pico', 'device']).toContain(stringField(subject, 'subjectKind'));
    const membership = recordField(input, 'membership');
    expect(['home_host', 'home_member', 'trusted_device', 'service_placeholder']).toContain(stringField(membership, 'role'));
    if (fixtureCase !== 'membership-grants-domain-access') {
      for (const scope of stringArrayField(membership, 'scopes')) {
        expect(['host.use', 'packet.receive', 'storage.queue', 'sync.exchange']).toContain(scope);
        expect(scope).not.toContain('domain');
      }
    }
    expect(['invited', 'active', 'revoked', 'expired', 'evicted', 'transferred_or_reissued']).toContain(stringField(membership, 'status'));
    if (fixtureCase !== 'verified-issuer-claim') {
      expect(stringField(input, 'signatureStatus')).toBe('absent');
    }
    const authority = recordField(expectBlock, 'authority');
    if (fixtureCase !== 'verified-issuer-claim') {
      expect(booleanField(authority, 'credentialVerified')).toBe(false);
    }
    if (fixtureCase !== 'membership-grants-domain-access') {
      expect(booleanField(authority, 'domainAccessGranted')).toBe(false);
    }

    if (fixtureCase === 'move-in-code-as-credential') {
      expect(input.moveInCode).toBeTruthy();
      expect(booleanField(authority, 'moveInCodeUsed')).toBe(true);
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['move_in_code_boundary']);
    } else if (fixtureCase === 'membership-grants-domain-access') {
      expect(input.moveInCode).toBeUndefined();
      expect(stringArrayField(membership, 'scopes')).toContain('domain.read');
      expect(recordField(input, 'domainAccessClaim')).toBeTruthy();
      expect(booleanField(authority, 'domainAccessGranted')).toBe(true);
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['membership_domain_access_claim']);
    } else if (fixtureCase === 'expired-credential-as-active') {
      expect(input.moveInCode).toBeUndefined();
      expect(stringField(membership, 'status')).toBe('active');
      expect(booleanField(membership, 'activeDespiteExpiry')).toBe(true);
      expect(booleanField(authority, 'expiredActiveClaim')).toBe(true);
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['membership_expired_active_claim']);
    } else if (fixtureCase === 'verified-issuer-claim') {
      expect(input.moveInCode).toBeUndefined();
      expect(stringField(issuer, 'proofStatus')).toBe('verified-claim');
      expect(stringField(input, 'signatureStatus')).toBe('verified-claim');
      expect(recordField(input, 'issuerAuthorityClaim')).toBeTruthy();
      expect(booleanField(authority, 'credentialVerified')).toBe(true);
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['membership_verified_issuer_claim']);
    } else {
      expect(input.moveInCode).toBeUndefined();
      expect(booleanField(authority, 'moveInCodeUsed')).toBe(false);
    }
  } else if (draftSurface === 'home-residency') {
    expect(stringField(input, 'schema')).toBe('pico.home.residency-record.draft');
    expect(stringField(input, 'residencyRecordId')).toContain('residency_placeholder_');
    const home = recordField(input, 'home');
    expect(stringField(home, 'homeIdHint')).toContain('home_placeholder_');
    expect(stringField(home, 'homeHostKeyRef')).toContain('homehostkey_placeholder_');
    expect(stringField(home, 'proofStatus')).toBe('unverified-placeholder');
    const actor = recordField(input, 'actor');
    expect(stringField(actor, 'hostPicoIdHint')).toContain('pico_placeholder_');
    expect(stringField(actor, 'hostDeviceIdHint')).toContain('device_placeholder_');
    expect(stringField(actor, 'proofStatus')).toBe('unverified-placeholder');
    const resident = recordField(input, 'resident');
    expect(stringField(resident, 'residentPicoIdHint')).toContain('pico_placeholder_');
    expect(stringArrayField(resident, 'residentDeviceRefs').length).toBeGreaterThan(0);
    expect(stringField(resident, 'membershipCredentialRef')).toContain('homecred_placeholder_');
    expect(stringField(resident, 'proofStatus')).toBe('unverified-placeholder');
    const transition = recordField(input, 'transition');
    expect(['invited', 'active', 'revoked', 'expired', 'evicted', 'transferred_or_reissued', 'unknown'])
      .toContain(stringField(transition, 'previousStatus'));
    expect(['invited', 'active', 'revoked', 'expired', 'evicted', 'transferred_or_reissued', 'unknown'])
      .toContain(stringField(transition, 'newStatus'));
    expect(['host_policy_placeholder', 'member_left_placeholder', 'invite_expired_placeholder', 'host_reset_placeholder', 'membership_reissued_placeholder', 'security_review_placeholder', 'unknown_placeholder'])
      .toContain(stringField(transition, 'reason'));
    const access = recordField(input, 'access');
    expect(booleanField(access, 'futureHostAccess')).toBe(false);
    expect(booleanField(access, 'futureSyncToHome')).toBe(false);
    const domainImpact = recordField(input, 'domainImpact');
    const cleanup = recordField(input, 'cleanup');
    const audit = recordField(input, 'audit');
    expect(stringField(audit, 'payloadPosture')).toBe('metadata-only');
    expect(booleanField(audit, 'userVisible')).toBe(true);
    expect(stringField(input, 'signatureStatus')).toBe('absent');
    const expectResidency = recordField(expectBlock, 'residency');
    expect(booleanField(expectResidency, 'recordVerified')).toBe(false);
    expect(booleanField(expectResidency, 'membershipVerified')).toBe(false);
    expect(booleanField(expectResidency, 'runtimeEnforced')).toBe(false);
    expect(booleanField(expectResidency, 'futureHostAccessDenied')).toBe(true);

    if (fixtureCase === 'eviction-as-identity-destruction') {
      expect(booleanField(transition, 'globalIdentityDestroyed')).toBe(true);
      expect(booleanField(transition, 'relationshipRevokedGlobally')).toBe(true);
      expect(booleanField(transition, 'historyRewritten')).toBe(true);
      expect(booleanField(access, 'residentDevicesDisabledGlobally')).toBe(true);
      expect(recordField(input, 'identityDestructionClaim')).toBeTruthy();
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['eviction_identity_destruction_claim']);
      expect(booleanField(expectResidency, 'identityDestroyed')).toBe(true);
      expect(booleanField(expectResidency, 'historyRewritten')).toBe(true);
    } else {
      expect(booleanField(transition, 'globalIdentityDestroyed')).toBe(false);
      expect(booleanField(transition, 'relationshipRevokedGlobally')).toBe(false);
      expect(booleanField(transition, 'historyRewritten')).toBe(false);
      expect(booleanField(access, 'residentDevicesDisabledGlobally')).toBe(false);
      expect(input.identityDestructionClaim).toBeUndefined();
      expect(booleanField(expectResidency, 'identityDestroyed')).toBe(false);
      expect(booleanField(expectResidency, 'historyRewritten')).toBe(false);
    }

    if (fixtureCase === 'host-cleanup-as-global-deletion') {
      expect(stringField(cleanup, 'hostLocalCiphertextCleanup')).toBe('claimed-global-delete');
      expect(booleanField(cleanup, 'residentBackupsDeleted')).toBe(true);
      expect(booleanField(cleanup, 'auditErased')).toBe(true);
      expect(recordField(input, 'globalDeletionClaim')).toBeTruthy();
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['host_cleanup_global_deletion_claim']);
      expect(booleanField(expectResidency, 'globalDeletionClaim')).toBe(true);
    } else {
      expect(['not-requested', 'planned-placeholder', 'completed-placeholder-unverified', 'not-claimed'])
        .toContain(stringField(cleanup, 'hostLocalCiphertextCleanup'));
      expect(booleanField(cleanup, 'residentBackupsDeleted')).toBe(false);
      expect(booleanField(cleanup, 'auditErased')).toBe(false);
      expect(input.globalDeletionClaim).toBeUndefined();
      expect(booleanField(expectResidency, 'globalDeletionClaim')).toBe(false);
    }

    if (fixtureCase === 'eviction-grants-domain-key-access') {
      expect(booleanField(access, 'residentDomainAccessGranted')).toBe(true);
      expect(stringField(domainImpact, 'sharedDomainKeyRotation')).toBe('claimed-complete');
      expect(stringField(domainImpact, 'domainKeyMaterialStatus')).toBe('present');
      expect(recordField(input, 'domainKeyMaterial')).toBeTruthy();
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['eviction_domain_key_access_claim']);
      expect(booleanField(expectResidency, 'residentDomainAccessGranted')).toBe(true);
      expect(booleanField(expectResidency, 'domainContentKeyExposed')).toBe(true);
    } else {
      expect(booleanField(access, 'residentDomainAccessGranted')).toBe(false);
      expect(['not-required-placeholder', 'evaluate-placeholder', 'required-placeholder', 'not-claimed'])
        .toContain(stringField(domainImpact, 'sharedDomainKeyRotation'));
      expect(['absent', 'placeholder-ref-only']).toContain(stringField(domainImpact, 'domainKeyMaterialStatus'));
      expect(input.domainKeyMaterial).toBeUndefined();
      expect(booleanField(expectResidency, 'residentDomainAccessGranted')).toBe(false);
      expect(booleanField(expectResidency, 'domainContentKeyExposed')).toBe(false);
    }
  } else if (draftSurface === 'identity-key') {
    expect(stringField(input, 'schema')).toBe('pico.identity.key-record.draft');
    expect(stringField(input, 'keyRecordId')).toContain('keyrec_placeholder_');
    const keyRole = stringField(input, 'keyRole');
    expect(['pico_identity', 'device', 'home_host', 'relay_routing_placeholder', 'transport_session_placeholder']).toContain(keyRole);
    const owner = recordField(input, 'owner');
    expect(stringField(owner, 'picoIdHint')).toContain('pico_placeholder_');
    const publicKey = recordField(input, 'publicKey');
    expect(stringField(publicKey, 'keyRef')).toContain(fixtureCase === 'relay-routing-key-as-identity' ? 'relayroutekey_placeholder_' : 'picoidkey_placeholder_');
    const lifecycle = recordField(input, 'lifecycle');
    expect(['introduced-placeholder', 'active-placeholder', 'rotating-placeholder', 'retired-placeholder', 'revoked-placeholder', 'unknown-placeholder'])
      .toContain(stringField(lifecycle, 'status'));
    expect(stringField(lifecycle, 'createdAt')).toBeTruthy();
    const usage = recordField(input, 'usage');
    const binding = recordField(input, 'binding');
    expect(stringArrayField(binding, 'domainRefs')).toEqual([]);
    const verification = recordField(input, 'verification');
    const identity = recordField(expectBlock, 'identity');
    expect(booleanField(identity, 'deviceKeyPossession')).toBe(false);
    expect(booleanField(identity, 'homeMembershipGranted')).toBe(false);
    expect(booleanField(identity, 'domainAccessGranted')).toBe(false);
    expect(booleanField(identity, 'recoveryAuthorityGranted')).toBe(false);

    if (fixtureCase === 'private-key-material-in-record') {
      expect(stringField(publicKey, 'materialStatus')).toBe('private-material-present');
      expect(booleanField(usage, 'privateMaterialExported')).toBe(true);
      expect(recordField(input, 'privateKeyMaterial')).toBeTruthy();
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['private_key_material_boundary']);
      expect(booleanField(identity, 'privateKeyMaterialPresent')).toBe(true);
    } else {
      expect(['absent', 'placeholder-ref-only', 'public-placeholder']).toContain(stringField(publicKey, 'materialStatus'));
      expect(booleanField(usage, 'privateMaterialExported')).toBe(false);
      expect(input.privateKeyMaterial).toBeUndefined();
      expect(booleanField(identity, 'privateKeyMaterialPresent')).toBe(false);
    }

    if (fixtureCase === 'verified-root-authority-claim') {
      expect(stringField(owner, 'proofStatus')).toBe('verified-claim');
      expect(stringField(publicKey, 'format')).toBe('final-format-claim');
      expect(stringField(publicKey, 'algorithm')).toBe('final-algorithm-claim');
      expect(stringField(publicKey, 'fingerprintStatus')).toBe('verified-claim');
      expect(booleanField(usage, 'signingAuthorityGranted')).toBe(true);
      expect(stringField(verification, 'possessionProofStatus')).toBe('verified');
      expect(booleanField(verification, 'issuerVerified')).toBe(true);
      expect(stringField(verification, 'canonicalizationStatus')).toBe('verified');
      expect(stringField(verification, 'trustPathStatus')).toBe('trusted-root-claim');
      expect(recordField(input, 'identityAuthorityClaim')).toBeTruthy();
      expect(stringField(input, 'signatureStatus')).toBe('verified-claim');
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['identity_authority_claim']);
      expect(booleanField(identity, 'keyRecordVerified')).toBe(true);
      expect(booleanField(identity, 'issuerVerified')).toBe(true);
      expect(booleanField(identity, 'possessionVerified')).toBe(true);
      expect(booleanField(identity, 'identityRootControl')).toBe(true);
      expect(booleanField(identity, 'runtimeAuthorization')).toBe(true);
    } else {
      expect(stringField(owner, 'proofStatus')).toBe('unverified-placeholder');
      expect(stringField(publicKey, 'format')).toBe('unspecified-placeholder');
      expect(stringField(publicKey, 'algorithm')).toBe('unspecified-placeholder');
      expect(stringField(publicKey, 'fingerprintStatus')).toBe('absent');
      expect(stringField(verification, 'possessionProofStatus')).toBe('absent');
      expect(booleanField(verification, 'issuerVerified')).toBe(false);
      expect(stringField(verification, 'canonicalizationStatus')).toBe('absent');
      expect(stringField(verification, 'trustPathStatus')).toBe('unverified-placeholder');
      expect(input.identityAuthorityClaim).toBeUndefined();
      expect(stringField(input, 'signatureStatus')).toBe('absent');
      expect(booleanField(identity, 'keyRecordVerified')).toBe(false);
      expect(booleanField(identity, 'issuerVerified')).toBe(false);
      expect(booleanField(identity, 'possessionVerified')).toBe(false);
    }

    if (fixtureCase === 'relay-routing-key-as-identity') {
      expect(keyRole).toBe('relay_routing_placeholder');
      expect(stringArrayField(usage, 'allowedPurposes')).toContain('pico.identity.root');
      expect(booleanField(usage, 'signingAuthorityGranted')).toBe(true);
      expect(stringField(binding, 'transportBinding')).toBe('relay-account-as-pico-identity');
      expect(recordField(input, 'relayIdentityClaim')).toBeTruthy();
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['relay_identity_boundary']);
      expect(booleanField(identity, 'relayIdentityElevated')).toBe(true);
      expect(booleanField(identity, 'identityRootControl')).toBe(true);
      expect(booleanField(identity, 'runtimeAuthorization')).toBe(true);
    } else {
      for (const purpose of stringArrayField(usage, 'allowedPurposes')) {
        expect(['device.delegation', 'credential.verify', 'history.verify', 'manifest.verify', 'membership.verify', 'rotation.verify', 'recovery.verify-placeholder', 'host.identity-placeholder'])
          .toContain(purpose);
      }
      expect(stringField(binding, 'transportBinding')).toBe('none');
      expect(input.relayIdentityClaim).toBeUndefined();
      expect(booleanField(identity, 'relayIdentityElevated')).toBe(false);
      if (fixtureCase !== 'verified-root-authority-claim') {
        expect(booleanField(usage, 'signingAuthorityGranted')).toBe(false);
        expect(booleanField(identity, 'identityRootControl')).toBe(false);
        expect(booleanField(identity, 'runtimeAuthorization')).toBe(false);
      }
    }
  } else if (draftSurface === 'device-credential') {
    expect(stringField(input, 'schema')).toBe('pico.identity.device-credential.draft');
    expect(stringField(input, 'credentialId')).toContain(fixtureCase === 'bearer-token-as-device-credential' ? 'bearer_token_' : 'devcred_placeholder_');
    const issuer = recordField(input, 'issuer');
    expect(stringField(issuer, 'proofStatus')).toBe('unverified-placeholder');
    expect(stringField(issuer, 'picoIdHint')).toContain('pico_placeholder_');
    expect(stringField(issuer, 'identityKeyRef')).toContain('picoidkey_placeholder_');
    const subject = recordField(input, 'subject');
    expect(['pico-vault', 'trusted-device', 'pico-surface', 'browser-session', 'service-placeholder']).toContain(stringField(subject, 'deviceKind'));
    expect(stringField(subject, 'proofStatus')).toBe('unverified-placeholder');
    expect(stringField(subject, 'deviceIdHint')).toContain('device_placeholder_');
    expect(stringField(subject, 'deviceKeyRef')).toContain('devicekey_placeholder_');
    const audience = recordField(input, 'audience');
    expect(stringField(audience, 'protocol')).toBe('pico-link');
    const delegation = recordField(input, 'delegation');
    expect(['pending_activation', 'active', 'retired', 'revoked', 'expired', 'lost', 'compromised', 'superseded']).toContain(stringField(delegation, 'status'));
    const scopes = stringArrayField(delegation, 'scopes');
    const authority = recordField(expectBlock, 'authority');
    expect(booleanField(authority, 'credentialVerified')).toBe(false);
    expect(booleanField(authority, 'identityRootControl')).toBe(false);
    expect(booleanField(authority, 'homeMembershipGranted')).toBe(false);
    expect(booleanField(authority, 'actionAuthorityGranted')).toBe(false);
    expect(booleanField(authority, 'recoveryAuthorityGranted')).toBe(false);
    expect(stringField(input, 'signatureStatus')).toBe('absent');

    if (fixtureCase === 'domain-key-access-claim') {
      expect(scopes).toContain('domain.key.read');
      expect(recordField(input, 'domainAccessClaim')).toBeTruthy();
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['domain_access_claim']);
      expect(booleanField(authority, 'domainAccessGranted')).toBe(true);
    } else {
      for (const scope of scopes) {
        expect(['packet.sign', 'packet.receive', 'history.sign', 'manifest.sign', 'sync.exchange', 'key_envelope.receive', 'surface.session']).toContain(scope);
      }
      expect(input.domainAccessClaim).toBeUndefined();
      expect(booleanField(authority, 'domainAccessGranted')).toBe(false);
    }

    if (fixtureCase === 'bearer-token-as-device-credential') {
      expect(stringField(input, 'bearerToken')).toContain('token_placeholder');
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['bearer_token_boundary']);
      expect(booleanField(authority, 'bearerTokenUsed')).toBe(true);
    } else {
      expect(input.bearerToken).toBeUndefined();
      expect(booleanField(authority, 'bearerTokenUsed')).toBe(false);
    }
  } else if (draftSurface === 'lost-device') {
    expect(stringField(input, 'schema')).toBe('pico.identity.lost-device-revocation.draft');
    expect(stringField(input, 'revocationId')).toContain('devrevoke_placeholder_');
    const actor = recordField(input, 'actor');
    expect(stringField(actor, 'proofStatus')).toBe('unverified-placeholder');
    expect(stringField(actor, 'picoIdHint')).toContain('pico_placeholder_');
    expect(stringField(actor, 'identityKeyRef')).toContain('picoidkey_placeholder_');
    const subject = recordField(input, 'subject');
    expect(['pico-vault', 'trusted-device', 'pico-surface', 'browser-session', 'service-placeholder']).toContain(stringField(subject, 'deviceKind'));
    expect(stringField(subject, 'deviceIdHint')).toContain('device_placeholder_');
    expect(stringField(subject, 'deviceKeyRef')).toContain('devicekey_placeholder_');
    expect(stringField(subject, 'credentialIdRef')).toContain('devcred_placeholder_');
    expect(['active', 'pending_activation', 'retiring', 'unknown']).toContain(stringField(subject, 'stateBefore'));
    expect(['lost', 'revoked', 'compromised', 'superseded']).toContain(stringField(subject, 'stateAfter'));
    const reason = recordField(input, 'reason');
    expect(['lost_device', 'suspected_compromise', 'user_reported_missing', 'device_retired_by_owner']).toContain(stringField(reason, 'category'));
    expect(booleanField(reason, 'userVisible')).toBe(true);
    const revocation = recordField(input, 'revocation');
    expect(stringField(revocation, 'status')).toBe('revoked');
    expect(stringField(revocation, 'revocationRef')).toContain('revocation_placeholder_');
    for (const scope of stringArrayField(revocation, 'appliesToScopes')) {
      expect(['packet.sign', 'packet.receive', 'history.sign', 'manifest.sign', 'sync.exchange', 'key_envelope.receive', 'surface.session']).toContain(scope);
    }
    const domainImpact = recordField(input, 'domainImpact');
    expect(['evaluate', 'not_required_placeholder']).toContain(stringField(domainImpact, 'domainKeyRotationRequired'));
    const backupPolicy = recordField(input, 'backupPolicy');
    const audit = recordField(input, 'audit');
    expect(stringField(audit, 'payloadPosture')).toBe('metadata-only');
    expect(booleanField(audit, 'userVisible')).toBe(true);
    expect(stringField(input, 'signatureStatus')).toBe('absent');
    const lifecycle = recordField(expectBlock, 'lifecycle');
    expect(booleanField(lifecycle, 'credentialVerified')).toBe(false);
    expect(booleanField(lifecycle, 'runtimeEnforced')).toBe(false);

    if (fixtureCase === 'stale-backup-reactivation') {
      expect(booleanField(revocation, 'futureAuthorityBlocked')).toBe(false);
      expect(stringField(backupPolicy, 'staleBackupReactivation')).toBe('accept');
      expect(booleanField(backupPolicy, 'freshnessRequired')).toBe(false);
      expect(recordField(input, 'restoreAttempt')).toBeTruthy();
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['stale_backup_reactivation']);
      expect(booleanField(lifecycle, 'futureDeviceAuthorityBlocked')).toBe(false);
      expect(booleanField(lifecycle, 'staleBackupAccepted')).toBe(true);
    } else {
      expect(booleanField(revocation, 'futureAuthorityBlocked')).toBe(true);
      expect(stringField(backupPolicy, 'staleBackupReactivation')).toBe('reject');
      expect(booleanField(backupPolicy, 'freshnessRequired')).toBe(true);
      expect(input.restoreAttempt).toBeUndefined();
      expect(booleanField(lifecycle, 'futureDeviceAuthorityBlocked')).toBe(true);
      expect(booleanField(lifecycle, 'staleBackupAccepted')).toBe(false);
    }

    if (fixtureCase === 'identity-replacement-claim') {
      expect(booleanField(revocation, 'historicalRecordsRetained')).toBe(false);
      expect(recordField(input, 'identityReplacementClaim')).toBeTruthy();
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['identity_replacement_boundary']);
      expect(booleanField(lifecycle, 'identityRootReplaced')).toBe(true);
      expect(booleanField(lifecycle, 'recoveryAuthorityGranted')).toBe(true);
      expect(booleanField(lifecycle, 'historicalTrustRewritten')).toBe(true);
    } else {
      expect(booleanField(revocation, 'historicalRecordsRetained')).toBe(true);
      expect(input.identityReplacementClaim).toBeUndefined();
      expect(booleanField(lifecycle, 'identityRootReplaced')).toBe(false);
      expect(booleanField(lifecycle, 'recoveryAuthorityGranted')).toBe(false);
      expect(booleanField(lifecycle, 'historicalTrustRewritten')).toBe(false);
    }

    if (fixtureCase === 'domain-rotation-proof-claim') {
      expect(stringField(domainImpact, 'domainKeyRotationStatus')).toBe('complete');
      expect(stringField(domainImpact, 'domainContentKeyRef')).toContain('domainkey_placeholder');
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['domain_rotation_claim']);
      expect(booleanField(lifecycle, 'domainKeyRotationCompleted')).toBe(true);
      expect(booleanField(lifecycle, 'domainContentKeyExposed')).toBe(true);
    } else {
      expect(['not_claimed', 'evaluate', 'required_placeholder', 'not_required_placeholder']).toContain(stringField(domainImpact, 'domainKeyRotationStatus'));
      expect(domainImpact.domainContentKeyRef).toBeUndefined();
      expect(booleanField(lifecycle, 'domainKeyRotationCompleted')).toBe(false);
      expect(booleanField(lifecycle, 'domainContentKeyExposed')).toBe(false);
    }
  } else if (draftSurface === 'revocation-record') {
    expect(stringField(input, 'schema')).toBe('pico.lifecycle.revocation-record.draft');
    expect(stringField(input, 'recordId')).toContain('revrecord_placeholder_');
    const registry = recordField(input, 'registry');
    expect(stringField(registry, 'registryId')).toContain('revreg_placeholder_');
    expect(['pico-local-placeholder', 'home-local-placeholder', 'relay-cache-placeholder', 'test-suite-placeholder']).toContain(stringField(registry, 'scope'));
    const issuer = recordField(input, 'issuer');
    expect(stringField(issuer, 'proofStatus')).toBe('unverified-placeholder');
    expect(stringField(issuer, 'picoIdHint')).toContain('pico_placeholder_');
    expect(stringField(issuer, 'identityKeyRef')).toContain('picoidkey_placeholder_');
    const subject = recordField(input, 'subject');
    expect(['device', 'device_credential', 'home_membership', 'domain_reader', 'relay_routing_identity']).toContain(stringField(subject, 'subjectKind'));
    if (stringField(subject, 'subjectKind') === 'domain_reader') {
      expect(stringField(subject, 'domainIdHint')).toContain('domain_placeholder');
    } else {
      expect(stringField(subject, 'deviceIdHint')).toContain('device_placeholder_');
      expect(stringField(subject, 'deviceKeyRef')).toContain('devicekey_placeholder_');
    }
    expect(stringField(subject, 'credentialIdRef')).toContain('devcred_placeholder_');
    const lifecycle = recordField(input, 'lifecycle');
    expect(['device_revocation', 'device_lost', 'credential_revocation', 'membership_revocation', 'reader_removed', 'routing_identity_retired']).toContain(stringField(lifecycle, 'recordKind'));
    expect(['pending_activation', 'active', 'retiring', 'retired', 'revoked', 'lost', 'compromised', 'superseded', 'expired', 'unknown']).toContain(stringField(lifecycle, 'previousStatus'));
    expect(['pending_activation', 'active', 'retiring', 'retired', 'revoked', 'lost', 'compromised', 'superseded', 'expired', 'unknown']).toContain(stringField(lifecycle, 'newStatus'));
    expect(numberField(lifecycle, 'sequenceHint')).toBeGreaterThan(0);
    for (const scope of stringArrayField(input, 'affectedScopes')) {
      expect(['packet.sign', 'packet.receive', 'history.sign', 'manifest.sign', 'sync.exchange', 'key_envelope.receive', 'surface.session', 'host.use', 'storage.queue']).toContain(scope);
    }
    const freshness = recordField(input, 'freshness');
    const propagation = recordField(input, 'propagation');
    const audit = recordField(input, 'audit');
    expect(stringField(audit, 'payloadPosture')).toBe('metadata-only');
    expect(booleanField(audit, 'userVisible')).toBe(true);
    expect(stringField(input, 'signatureStatus')).toBe('absent');
    const expectLifecycle = recordField(expectBlock, 'lifecycle');
    expect(booleanField(expectLifecycle, 'recordVerified')).toBe(false);
    expect(booleanField(expectLifecycle, 'freshnessVerified')).toBe(false);

    if (fixtureCase === 'stale-record-current-claim') {
      expect(stringField(freshness, 'status')).toBe('claimed-current');
      expect(booleanField(freshness, 'currentClaim')).toBe(true);
      expect(booleanField(freshness, 'staleSnapshotAccepted')).toBe(true);
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['freshness_current_claim']);
      expect(booleanField(expectLifecycle, 'freshnessCurrentClaim')).toBe(true);
      expect(booleanField(expectLifecycle, 'staleRecordAccepted')).toBe(true);
    } else {
      expect(['bounded-placeholder', 'stale-placeholder', 'unknown-placeholder', 'not-evaluated']).toContain(stringField(freshness, 'status'));
      expect(booleanField(freshness, 'currentClaim')).toBe(false);
      expect(freshness.staleSnapshotAccepted).toBeUndefined();
      expect(booleanField(expectLifecycle, 'freshnessCurrentClaim')).toBe(false);
      expect(booleanField(expectLifecycle, 'staleRecordAccepted')).toBe(false);
    }

    if (fixtureCase === 'registry-authority-escalation') {
      expect(stringField(registry, 'authorityStatus')).toBe('authoritative-root-claim');
      expect(booleanField(propagation, 'runtimeEnforced')).toBe(true);
      expect(recordField(input, 'registryAuthorityClaim')).toBeTruthy();
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['registry_authority_boundary']);
      expect(booleanField(expectLifecycle, 'registryAuthoritative')).toBe(true);
      expect(booleanField(expectLifecycle, 'runtimeEnforced')).toBe(true);
      expect(booleanField(expectLifecycle, 'registryAuthorityEscalated')).toBe(true);
      expect(booleanField(expectLifecycle, 'recoveryAuthorityGranted')).toBe(true);
    } else {
      expect(stringField(registry, 'authorityStatus')).toBe('unverified-placeholder');
      expect(booleanField(propagation, 'runtimeEnforced')).toBe(false);
      expect(input.registryAuthorityClaim).toBeUndefined();
      expect(booleanField(expectLifecycle, 'registryAuthoritative')).toBe(false);
      expect(booleanField(expectLifecycle, 'runtimeEnforced')).toBe(false);
      expect(booleanField(expectLifecycle, 'registryAuthorityEscalated')).toBe(false);
      expect(booleanField(expectLifecycle, 'recoveryAuthorityGranted')).toBe(false);
    }

    if (fixtureCase === 'domain-key-material-in-record') {
      expect(stringField(propagation, 'keyEnvelopeRemoval')).toBe('claimed_complete');
      expect(recordField(input, 'domainKeyMaterial')).toBeTruthy();
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['domain_key_material_boundary']);
      expect(booleanField(expectLifecycle, 'domainKeyRotationCompleted')).toBe(true);
      expect(booleanField(expectLifecycle, 'domainContentKeyExposed')).toBe(true);
    } else {
      expect(stringField(propagation, 'keyEnvelopeRemoval')).toBe('not_claimed');
      expect(input.domainKeyMaterial).toBeUndefined();
      expect(booleanField(expectLifecycle, 'domainKeyRotationCompleted')).toBe(false);
      expect(booleanField(expectLifecycle, 'domainContentKeyExposed')).toBe(false);
    }
  } else if (draftSurface === 'key-envelope-rotation') {
    expect(stringField(input, 'schema')).toBe('pico.domain.key-envelope-rotation.draft');
    expect(stringField(input, 'rotationId')).toContain('domrot_placeholder_');
    const issuer = recordField(input, 'issuer');
    expect(stringField(issuer, 'proofStatus')).toBe('unverified-placeholder');
    expect(stringField(issuer, 'picoIdHint')).toContain('pico_placeholder_');
    expect(stringField(issuer, 'identityKeyRef')).toContain('picoidkey_placeholder_');
    const domain = recordField(input, 'domain');
    expect(stringField(domain, 'domainIdHint')).toContain('domain_placeholder');
    expect(['private_space', 'shared_space', 'household_space', 'project_space', 'service_placeholder']).toContain(stringField(domain, 'domainKind'));
    expect(stringField(domain, 'domainKeyRefBefore')).toContain('domainkey_placeholder_');
    expect(stringField(domain, 'domainKeyRefAfter')).toContain('domainkey_placeholder_');
    const trigger = recordField(input, 'trigger');
    expect(['lost_device', 'reader_removed', 'suspected_compromise', 'policy_rotation', 'algorithm_retirement', 'domain_sensitivity_change']).toContain(stringField(trigger, 'category'));
    expect(stringField(trigger, 'revocationRef')).toContain('revocation_placeholder_');
    expect(stringField(trigger, 'revocationRecordRef')).toContain('revrecord_placeholder_');
    const readerSetChange = recordField(input, 'readerSetChange');
    expect(stringArrayField(readerSetChange, 'removedReaderRefs').length).toBeGreaterThan(0);
    expect(booleanField(readerSetChange, 'membershipVerified')).toBe(false);
    const rotationPlan = recordField(input, 'rotationPlan');
    expect(booleanField(rotationPlan, 'futureSecrecyTarget')).toBe(true);
    const keyEnvelopePlan = recordField(input, 'keyEnvelopePlan');
    expect(stringArrayField(keyEnvelopePlan, 'removeEnvelopeRefs').length).toBeGreaterThan(0);
    expect(stringArrayField(keyEnvelopePlan, 'createEnvelopeRefs').length).toBeGreaterThan(0);
    const freshness = recordField(input, 'freshness');
    const audit = recordField(input, 'audit');
    expect(stringField(audit, 'payloadPosture')).toBe('metadata-only');
    expect(booleanField(audit, 'userVisible')).toBe(true);
    expect(stringField(input, 'signatureStatus')).toBe('absent');
    const expectDomain = recordField(expectBlock, 'domain');
    expect(booleanField(expectDomain, 'issuerVerified')).toBe(false);
    expect(booleanField(expectDomain, 'membershipVerified')).toBe(false);
    expect(booleanField(expectDomain, 'domainAccessGranted')).toBe(false);

    if (fixtureCase === 'plaintext-domain-key-in-plan') {
      expect(stringField(domain, 'keyMaterialStatus')).toBe('present');
      expect(stringField(keyEnvelopePlan, 'wrappedKeyMaterialStatus')).toBe('present');
      expect(recordField(input, 'domainKeyMaterial')).toBeTruthy();
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['domain_key_material_boundary']);
      expect(booleanField(expectDomain, 'domainKeyMaterialPresent')).toBe(true);
      expect(booleanField(expectDomain, 'keyEnvelopeMaterialPresent')).toBe(true);
    } else {
      expect(['absent', 'placeholder-ref-only']).toContain(stringField(domain, 'keyMaterialStatus'));
      expect(['absent', 'placeholder-ref-only']).toContain(stringField(keyEnvelopePlan, 'wrappedKeyMaterialStatus'));
      expect(input.domainKeyMaterial).toBeUndefined();
      expect(booleanField(expectDomain, 'domainKeyMaterialPresent')).toBe(false);
      expect(booleanField(expectDomain, 'keyEnvelopeMaterialPresent')).toBe(false);
    }

    if (fixtureCase === 'completed-rotation-without-records') {
      expect(stringField(rotationPlan, 'status')).toBe('complete');
      expect(booleanField(keyEnvelopePlan, 'runtimeEnforced')).toBe(true);
      expect(booleanField(keyEnvelopePlan, 'removalVerified')).toBe(true);
      expect(booleanField(freshness, 'revocationRecordVerified')).toBe(true);
      expect(booleanField(freshness, 'rotationRecordVerified')).toBe(true);
      expect(booleanField(freshness, 'currentClaim')).toBe(true);
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['domain_rotation_completion_claim']);
      expect(booleanField(expectDomain, 'rotationCompleted')).toBe(true);
      expect(booleanField(expectDomain, 'runtimeEnforced')).toBe(true);
    } else {
      expect(['planned-placeholder', 'required-placeholder', 'not-required-placeholder', 'evaluate-placeholder']).toContain(stringField(rotationPlan, 'status'));
      expect(booleanField(keyEnvelopePlan, 'runtimeEnforced')).toBe(false);
      expect(keyEnvelopePlan.removalVerified).toBeUndefined();
      expect(booleanField(freshness, 'revocationRecordVerified')).toBe(false);
      expect(booleanField(freshness, 'rotationRecordVerified')).toBe(false);
      expect(booleanField(freshness, 'currentClaim')).toBe(false);
      expect(booleanField(expectDomain, 'rotationCompleted')).toBe(false);
      expect(booleanField(expectDomain, 'runtimeEnforced')).toBe(false);
    }

    if (fixtureCase === 'historical-plaintext-erasure-claim') {
      expect(booleanField(rotationPlan, 'historicalPlaintextErased')).toBe(true);
      expect(booleanField(rotationPlan, 'retroactiveSecrecyClaim')).toBe(true);
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['historical_erasure_claim']);
      expect(booleanField(expectDomain, 'historicalPlaintextErased')).toBe(true);
      expect(booleanField(expectDomain, 'retroactiveSecrecyClaim')).toBe(true);
    } else {
      expect(booleanField(rotationPlan, 'historicalPlaintextErased')).toBe(false);
      expect(booleanField(rotationPlan, 'retroactiveSecrecyClaim')).toBe(false);
      expect(booleanField(expectDomain, 'historicalPlaintextErased')).toBe(false);
      expect(booleanField(expectDomain, 'retroactiveSecrecyClaim')).toBe(false);
    }
  } else if (draftSurface === 'canonicalization') {
    expect(stringField(input, 'schema')).toBe('pico.canonicalization.case.draft');
    expect(['pico-link-packet', 'pico-link-protected-payload', 'pico-home-membership-credential', 'compatibility-claim', 'foundation-event', 'foundation-realtime'])
      .toContain(stringField(input, 'targetSurface'));
    const expectation = recordField(input, 'expectation');
    expect(['reject', 'parse-only']).toContain(stringField(expectation, 'status'));
    const canonicalOutput = recordField(input, 'canonicalOutput');
    const cryptoVector = recordField(input, 'cryptoVector');
    expect(stringField(cryptoVector, 'hash')).toBe('absent');
    expect(stringField(cryptoVector, 'signature')).toBe('absent');
    const canonicalization = recordField(expectBlock, 'canonicalization');
    expect(booleanField(canonicalization, 'hashVectorPublished')).toBe(false);
    expect(booleanField(canonicalization, 'signatureVectorPublished')).toBe(false);

    if (fixtureCase === 'canonical-output-claim') {
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['canonical_output_claim']);
      expect(stringField(canonicalOutput, 'status')).toBe('present');
      expect(stringField(canonicalOutput, 'bytes')).toBeTruthy();
      expect(booleanField(canonicalization, 'canonicalBytesPublished')).toBe(true);
    } else if (fixtureCase === 'parse-only-placeholder') {
      expect(stringField(expectation, 'status')).toBe('parse-only');
      expect(stringField(canonicalOutput, 'status')).toBe('absent');
      expect(booleanField(canonicalization, 'canonicalBytesPublished')).toBe(false);
    }
  } else if (draftSurface === 'signed-event-segment') {
    expect(stringField(input, 'schema')).toBe('pico.history.segment.draft');
    expect(stringField(input, 'segmentRecordId')).toContain('segment_placeholder_');
    const author = recordField(input, 'author');
    expect(stringField(author, 'picoIdHint')).toContain('pico_placeholder_');
    expect(stringField(author, 'deviceIdHint')).toContain('device_placeholder_');
    const scope = recordField(input, 'scope');
    expect(stringField(scope, 'payloadPosture')).toBe('metadata-only');
    const range = recordField(input, 'range');
    expect(numberField(range, 'firstSequence')).toBeGreaterThan(0);
    expect(numberField(range, 'lastSequence')).toBeGreaterThanOrEqual(numberField(range, 'firstSequence'));
    const integrity = recordField(input, 'integrity');
    const authorship = recordField(input, 'authorship');
    expect(booleanField(authorship, 'hostStored')).toBe(true);
    const audit = recordField(input, 'audit');
    expect(stringField(audit, 'payloadPosture')).toBe('metadata-only');
    expect(booleanField(audit, 'userVisible')).toBe(true);
    const expectSegment = recordField(expectBlock, 'segment');
    expect(booleanField(expectSegment, 'segmentVerified')).toBe(false);
    expect(booleanField(expectSegment, 'authorDelegationVerified')).toBe(false);

    if (fixtureCase === 'signed-segment-placeholder') {
      expect(stringField(input, 'signatureStatus')).toBe('absent');
      expect(stringField(integrity, 'eventsHashStatus')).toBe('absent');
      expect(stringField(integrity, 'canonicalizationStatus')).toBe('absent');
      expect(booleanField(authorship, 'residentSigningAuthority')).toBe(false);
      expect(booleanField(range, 'rewritesPreviousHistory')).toBe(false);
      expect(input.signatureAuthorityClaim).toBeUndefined();
      expect(input.residentAuthorshipClaim).toBeUndefined();
      expect(input.historyRewriteClaim).toBeUndefined();
      expect(booleanField(expectSegment, 'signatureVerified')).toBe(false);
      expect(booleanField(expectSegment, 'residentAuthorshipForged')).toBe(false);
      expect(booleanField(expectSegment, 'historyRewritten')).toBe(false);
    } else if (fixtureCase === 'verified-signature-claim') {
      expect(stringField(input, 'signatureStatus')).toBe('verified-claim');
      expect(stringField(integrity, 'eventsHashStatus')).toBe('verified-claim');
      expect(stringField(integrity, 'canonicalizationStatus')).toBe('verified');
      expect(recordField(input, 'signatureAuthorityClaim')).toBeTruthy();
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['segment_signature_verified_claim']);
      expect(booleanField(expectSegment, 'signatureVerified')).toBe(true);
      expect(booleanField(expectSegment, 'canonicalizationVerified')).toBe(true);
    } else if (fixtureCase === 'host-resident-authorship-forgery') {
      expect(stringField(input, 'signatureStatus')).toBe('absent');
      expect(booleanField(authorship, 'residentSigningAuthority')).toBe(true);
      expect(recordField(input, 'residentAuthorshipClaim')).toBeTruthy();
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['resident_authorship_forgery']);
      expect(booleanField(expectSegment, 'residentAuthorshipForged')).toBe(true);
      expect(booleanField(expectSegment, 'runtimeAuthorization')).toBe(true);
    } else if (fixtureCase === 'history-rewrite-claim') {
      expect(stringField(input, 'signatureStatus')).toBe('absent');
      expect(booleanField(range, 'rewritesPreviousHistory')).toBe(true);
      expect(recordField(input, 'historyRewriteClaim')).toBeTruthy();
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['segment_history_rewrite_claim']);
      expect(booleanField(expectSegment, 'historyRewritten')).toBe(true);
    }
  } else if (draftSurface === 'replica-manifest') {
    expect(stringField(input, 'schema')).toBe('pico.replica.manifest.draft');
    expect(stringField(input, 'replicaRecordId')).toContain('replica_placeholder_');
    const owner = recordField(input, 'owner');
    expect(stringField(owner, 'picoIdHint')).toContain('pico_placeholder_');
    expect(stringField(owner, 'deviceIdHint')).toContain('device_placeholder_');
    const domains = recordArrayField(input, 'domains');
    expect(domains.length).toBeGreaterThan(0);
    const firstDomain = domains[0];
    expect(stringField(firstDomain, 'domainIdHint')).toContain('domain_placeholder_');
    const audit = recordField(input, 'audit');
    expect(stringField(audit, 'payloadPosture')).toBe('metadata-only');
    expect(booleanField(audit, 'userVisible')).toBe(true);
    const expectManifest = recordField(expectBlock, 'manifest');
    expect(booleanField(expectManifest, 'manifestVerified')).toBe(false);

    if (fixtureCase === 'replica-manifest-placeholder') {
      expect(stringField(input, 'signatureStatus')).toBe('absent');
      expect(stringField(firstDomain, 'checkpointStatus')).toBe('absent');
      expect(stringField(firstDomain, 'payloadPosture')).toBe('metadata-only');
      expect(input.signatureAuthorityClaim).toBeUndefined();
      expect(input.completenessAuthorityClaim).toBeUndefined();
      expect(booleanField(expectManifest, 'signatureVerified')).toBe(false);
      expect(booleanField(expectManifest, 'completenessVerified')).toBe(false);
      expect(booleanField(expectManifest, 'plaintextLeaked')).toBe(false);
    } else if (fixtureCase === 'plaintext-in-manifest') {
      expect(stringField(firstDomain, 'payloadPosture')).toBe('plaintext-leak');
      expect(stringField(firstDomain, 'plaintext')).toContain('plaintext');
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['manifest_plaintext_leak']);
      expect(booleanField(expectManifest, 'plaintextLeaked')).toBe(true);
    } else if (fixtureCase === 'verified-completeness-claim') {
      expect(stringField(recordField(input, 'coverage'), 'completenessStatus')).toBe('verified-complete');
      expect(recordField(input, 'completenessAuthorityClaim')).toBeTruthy();
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['manifest_verified_completeness_claim']);
      expect(booleanField(expectManifest, 'completenessVerified')).toBe(true);
    } else if (fixtureCase === 'verified-signature-claim') {
      expect(stringField(input, 'signatureStatus')).toBe('verified-claim');
      expect(stringField(firstDomain, 'checkpointStatus')).toBe('verified');
      expect(recordField(input, 'signatureAuthorityClaim')).toBeTruthy();
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['manifest_signature_verified_claim']);
      expect(booleanField(expectManifest, 'signatureVerified')).toBe(true);
      expect(booleanField(expectManifest, 'checkpointVerified')).toBe(true);
    }
  } else {
    throw new Error(`Unexpected draft surface: ${draftSurface}`);
  }
}

function expectModelDelegationDraftFixtureBoundary(
  draftSurface: string,
  fixtureCase: string,
  input: Record<string, unknown>,
  expectBlock: Record<string, unknown>,
): void {
  expect(stringField(input, 'fixtureStage')).toBe('draft');

  if (draftSurface === 'provider-registry') {
    expect(stringField(input, 'schema')).toBe('pico.model.provider.registry.entry.draft');
    expect([
      'same-device',
      'pico-home',
      'pico-vault',
      'pico-surface',
      'peer-pico',
      'cloud-connector',
      'development-stub',
    ]).toContain(stringField(input, 'providerNodeKind'));
    expect([
      'same-process',
      'same-device',
      'same-home',
      'local-network',
      'peer-home',
      'cloud-mediated',
      'unknown',
    ]).toContain(stringField(input, 'locality'));
    expect([
      'discovered',
      'configured',
      'trusted-for-non-sensitive',
      'trusted-for-scoped-private',
      'trusted-for-shared-space',
      'disabled',
      'revoked',
      'quarantined',
    ]).toContain(stringField(input, 'trustState'));
    for (const jobType of stringArrayField(input, 'supportedJobTypes')) {
      expect(['model.summarize', 'model.extract', 'model.draft', 'model.compare', 'model.reason', 'model.plan']).toContain(jobType);
    }
    for (const toolUseMode of stringArrayField(input, 'toolUseModes')) {
      expect(['none', 'propose_only', 'separate_policy_required', 'not_supported']).toContain(toolUseMode);
    }
    const claims = recordField(input, 'claims');

    if (fixtureCase === 'local-summarizer-placeholder') {
      expect(booleanField(claims, 'trustGrantByDiscovery')).toBe(false);
      expect(booleanField(claims, 'vaultReadAccess')).toBe(false);
      expect(stringField(input, 'trustState')).toBe('trusted-for-non-sensitive');
      for (const inputClass of stringArrayField(input, 'supportedInputClasses')) {
        expect(forbiddenModelDelegationInputClasses()).not.toContain(inputClass);
      }
    } else if (fixtureCase === 'vault-read-authority-claim') {
      expect(booleanField(claims, 'trustGrantByDiscovery')).toBe(true);
      expect(booleanField(claims, 'vaultReadAccess')).toBe(true);
      expect(stringArrayField(input, 'authorityClaims')).toContain('vault.read');
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['provider_vault_read_claim']);
      const authority = recordField(expectBlock, 'authority');
      expect(booleanField(authority, 'trustGrant')).toBe(true);
      expect(booleanField(authority, 'vaultReadAccess')).toBe(true);
    } else if (fixtureCase === 'trust-grant-by-discovery') {
      expect(stringField(input, 'trustState')).toBe('discovered');
      expect(booleanField(claims, 'trustGrantByDiscovery')).toBe(true);
      expect(booleanField(claims, 'vaultReadAccess')).toBe(false);
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['registry_trust_grant_claim']);
      const authority = recordField(expectBlock, 'authority');
      expect(booleanField(authority, 'trustGrant')).toBe(true);
      expect(booleanField(authority, 'trustedByDiscovery')).toBe(true);
    } else if (fixtureCase === 'revoked-provider-usable') {
      expect(stringField(input, 'trustState')).toBe('revoked');
      expect(stringField(input, 'revocationState')).toBe('revoked');
      expect(booleanField(input, 'advertisedAvailable')).toBe(true);
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['revoked_provider_usable']);
      const authority = recordField(expectBlock, 'authority');
      expect(booleanField(authority, 'revoked')).toBe(true);
      expect(booleanField(authority, 'usableAfterRevocation')).toBe(false);
    } else if (fixtureCase === 'tool-execution-by-advertisement') {
      expect(stringArrayField(input, 'toolUseModes')).toContain('separate_policy_required');
      expect(booleanField(input, 'toolExecutionEnabledByDefault')).toBe(true);
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['provider_tool_execution']);
      const authority = recordField(expectBlock, 'authority');
      expect(booleanField(authority, 'toolExecutionByAdvertisement')).toBe(true);
    }
  } else if (draftSurface === 'job-envelope') {
    expect(stringField(input, 'schema')).toBe('pico.model.job.envelope.draft');
    expect(['model.summarize', 'model.extract', 'model.draft', 'model.compare', 'model.reason', 'model.plan']).toContain(stringField(input, 'jobType'));
    expect(stringField(input, 'toolUseMode')).toBe('none');
    const inputClasses = stringArrayField(input, 'inputClasses');

    if (fixtureCase === 'unsafe-provider-retention') {
      expect(stringField(input, 'retentionRequirement')).toBe('provider_default');
    } else {
      expect(['no_store', 'ephemeral_until_response', 'audit_metadata_only', 'bounded_result_retention'])
        .toContain(stringField(input, 'retentionRequirement'));
    }

    if (fixtureCase !== 'forbidden-input-class') {
      for (const inputClass of inputClasses) {
        expect(forbiddenModelDelegationInputClasses()).not.toContain(inputClass);
      }
    }

    if (fixtureCase === 'scoped-summarize-placeholder') {
      expect(stringField(input, 'policyDecisionRef')).toBeTruthy();
      expect(stringField(input, 'consentRef')).toBeTruthy();
      expect(booleanField(input, 'singleJob')).toBe(true);
      expect(booleanField(input, 'durableAccessClaim')).toBe(false);
      expect(stringField(input, 'accessScope')).toBe('single_job');
      const authority = recordField(expectBlock, 'authority');
      expect(booleanField(authority, 'durableAccess')).toBe(false);
      expect(booleanField(authority, 'singleJobOnly')).toBe(true);
      expect(booleanField(authority, 'policyBound')).toBe(true);
      expect(booleanField(authority, 'consentBound')).toBe(true);
    } else if (fixtureCase === 'forbidden-input-class') {
      expect(inputClasses).toContain('domain_content_key');
      expect(stringField(recordField(input, 'inlineContext'), 'syntheticSecretMarker')).toContain('domain_content_key_placeholder');
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['forbidden_input_class']);
      const privacy = recordField(expectBlock, 'privacy');
      expect(stringArrayField(privacy, 'forbiddenInputClasses')).toEqual(['domain_content_key']);
      expect(booleanField(privacy, 'secretMaterial')).toBe(true);
    } else if (fixtureCase === 'durable-access-claim') {
      expect(booleanField(input, 'singleJob')).toBe(false);
      expect(booleanField(input, 'durableAccessClaim')).toBe(true);
      expect(stringField(input, 'accessScope')).toBe('durable_standing');
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['durable_access_claim']);
      const authority = recordField(expectBlock, 'authority');
      expect(booleanField(authority, 'durableAccess')).toBe(true);
      expect(booleanField(authority, 'singleJobOnly')).toBe(false);
    } else if (fixtureCase === 'missing-policy-consent') {
      expect(inputClasses).toContain('private_memory_excerpt');
      expect(stringField(input, 'policyDecisionRef')).toBe('');
      expect(stringField(input, 'consentRef')).toBe('');
      expect(booleanField(input, 'requiredConfirmation')).toBe(true);
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['missing_policy_decision', 'missing_consent']);
      const authority = recordField(expectBlock, 'authority');
      expect(booleanField(authority, 'policyBound')).toBe(false);
      expect(booleanField(authority, 'consentBound')).toBe(false);
    } else if (fixtureCase === 'unsafe-provider-retention') {
      expect(inputClasses).toContain('private_memory_excerpt');
      expect(stringField(input, 'providerRetentionRequest')).toBeTruthy();
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['unsafe_retention_mode']);
      const privacy = recordField(expectBlock, 'privacy');
      expect(stringField(privacy, 'retentionMode')).toBe('provider_default');
      expect(booleanField(privacy, 'unsafeRetention')).toBe(true);
    }
  } else if (draftSurface === 'context-ref') {
    expect(stringField(input, 'schema')).toBe('pico.model.context.ref.draft');
    expect(stringField(input, 'contextRefId')).toContain('context_ref_');
    expect(stringField(input, 'inputClass')).toBe('private_memory_excerpt');
    expect(booleanField(input, 'redactionApplied')).toBe(true);
    expect(booleanField(input, 'allowedForProvider')).toBe(true);

    if (fixtureCase === 'bounded-excerpt-placeholder') {
      expect(stringField(input, 'sourceAccessMode')).toBe('materialized_excerpt');
      expect(booleanField(input, 'providerExpansionAllowed')).toBe(false);
      expect(booleanField(input, 'reusableAcrossJobs')).toBe(false);
      expect(stringField(input, 'expiresAt')).toBeTruthy();
      const privacy = recordField(expectBlock, 'privacy');
      expect(booleanField(privacy, 'providerExpansionAllowed')).toBe(false);
      expect(booleanField(privacy, 'contextRefScoped')).toBe(true);
      expect(booleanField(privacy, 'expires')).toBe(true);
    } else if (fixtureCase === 'provider-expandable-context') {
      expect(booleanField(input, 'providerExpansionAllowed')).toBe(true);
      expect(stringField(input, 'expansionScope')).toBe('vault:*');
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['context_ref_expansion']);
      const privacy = recordField(expectBlock, 'privacy');
      expect(booleanField(privacy, 'providerExpansionAllowed')).toBe(true);
      expect(booleanField(privacy, 'contextRefScoped')).toBe(false);
    } else if (fixtureCase === 'provider-read-through-context-ref') {
      expect(stringField(input, 'sourceAccessMode')).toBe('live_read_through');
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['context_ref_live_source_read']);
      const authority = recordField(expectBlock, 'authority');
      expect(booleanField(authority, 'providerLiveSourceRead')).toBe(true);
      expect(booleanField(authority, 'materializedExcerpt')).toBe(false);
    } else if (fixtureCase === 'unscoped-context-ref') {
      expect(stringField(input, 'expiresAt')).toBe('');
      expect(stringField(input, 'expansionScope')).toBe('unbounded');
      expect(booleanField(input, 'reusableAcrossJobs')).toBe(true);
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['context_ref_unscoped']);
      const privacy = recordField(expectBlock, 'privacy');
      expect(booleanField(privacy, 'contextRefScoped')).toBe(false);
      expect(booleanField(privacy, 'expires')).toBe(false);
    } else if (fixtureCase === 'secret-material-in-context-ref') {
      expect(stringField(recordField(input, 'content'), 'syntheticSecretMarker')).toContain('domain_content_key_placeholder');
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['secret_material']);
      const privacy = recordField(expectBlock, 'privacy');
      expect(booleanField(privacy, 'secretMaterial')).toBe(true);
    }
  } else if (draftSurface === 'result-envelope') {
    expect(stringField(input, 'schema')).toBe('pico.model.result.envelope.draft');
    expect(stringField(input, 'status')).toBe('completed');
    expect(stringField(input, 'resultSchemaRef')).toBe('action_proposal');
    const result = recordField(input, 'result');

    if (fixtureCase === 'action-execution-claim') {
      expect(booleanField(result, 'actionExecuted')).toBe(true);
      expect(booleanField(result, 'toolExecuted')).toBe(true);
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['action_execution_claim']);
      const authority = recordField(expectBlock, 'authority');
      expect(booleanField(authority, 'actionExecuted')).toBe(true);
      expect(booleanField(authority, 'toolExecuted')).toBe(true);
      expect(booleanField(authority, 'resultIsActionApproval')).toBe(false);
    } else if (fixtureCase === 'proposal-provenance-placeholder') {
      expect(booleanField(result, 'actionExecuted')).toBe(false);
      expect(booleanField(result, 'toolExecuted')).toBe(false);
      expect(stringField(input, 'jobId')).toBe(stringField(input, 'requestedJobId'));
      expect(stringField(input, 'providerId')).toBe(stringField(input, 'requestedProviderId'));
      expect(booleanField(recordField(input, 'qualityClaims'), 'modelCorrectnessVerified')).toBe(false);
      const provenance = recordField(expectBlock, 'provenance');
      expect(booleanField(provenance, 'jobMatches')).toBe(true);
      expect(booleanField(provenance, 'providerMatches')).toBe(true);
      expect(booleanField(provenance, 'actionExecuted')).toBe(false);
    } else if (fixtureCase === 'model-correctness-claim') {
      expect(stringField(input, 'jobId')).toBe(stringField(input, 'requestedJobId'));
      expect(stringField(input, 'providerId')).toBe(stringField(input, 'requestedProviderId'));
      expect(booleanField(recordField(input, 'qualityClaims'), 'modelCorrectnessVerified')).toBe(true);
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['model_quality_claim']);
      const quality = recordField(expectBlock, 'quality');
      expect(booleanField(quality, 'modelCorrectnessVerified')).toBe(true);
      expect(booleanField(quality, 'safetyCertified')).toBe(true);
    } else if (fixtureCase === 'result-job-mismatch') {
      expect(stringField(input, 'jobId')).not.toBe(stringField(input, 'requestedJobId'));
      expect(stringField(input, 'providerId')).toBe(stringField(input, 'requestedProviderId'));
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['result_job_mismatch']);
      const provenance = recordField(expectBlock, 'provenance');
      expect(booleanField(provenance, 'jobMatches')).toBe(false);
      expect(booleanField(provenance, 'providerMatches')).toBe(true);
    } else if (fixtureCase === 'result-provider-mismatch') {
      expect(stringField(input, 'jobId')).toBe(stringField(input, 'requestedJobId'));
      expect(stringField(input, 'providerId')).not.toBe(stringField(input, 'requestedProviderId'));
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['result_provider_mismatch']);
      const provenance = recordField(expectBlock, 'provenance');
      expect(booleanField(provenance, 'jobMatches')).toBe(true);
      expect(booleanField(provenance, 'providerMatches')).toBe(false);
    }
  } else {
    throw new Error(`Unexpected model-delegation draft surface: ${draftSurface}`);
  }
}

function modelDelegationSurfaceForPath(pathSurface: string): string {
  if (pathSurface === 'provider-registry') {
    return 'model-provider-registry';
  }

  if (pathSurface === 'job-envelope') {
    return 'model-job-envelope';
  }

  if (pathSurface === 'context-ref') {
    return 'model-context-ref';
  }

  if (pathSurface === 'result-envelope') {
    return 'model-result-envelope';
  }

  throw new Error(`Unexpected model-delegation fixture path surface: ${pathSurface}`);
}

function forbiddenModelDelegationInputClasses(): string[] {
  return [
    'credential_material',
    'key_material',
    'recovery_material',
    'domain_content_key',
    'payment_secret',
    'raw_vault_dump',
  ];
}

function collectFixtureDirectories(directoryPath: string, relativePath: string, fixtureDirectories: string[]): void {
  const entries = readdirSync(directoryPath, { withFileTypes: true });
  const entryNames = new Set(entries.map((entry) => entry.name));

  if (entryNames.has('fixture.json') && entryNames.has('input.json')) {
    fixtureDirectories.push(relativePath);
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      collectFixtureDirectories(
        resolve(directoryPath, entry.name),
        relativePath === '' ? entry.name : `${relativePath}/${entry.name}`,
        fixtureDirectories,
      );
    }
  }
}

function fixturePathParts(path: string): [surface: string, version: string, family: string, fixtureCase: string] {
  const parts = path.split('/');

  if (parts.length !== 4 || parts.some((part) => part.trim() === '')) {
    throw new Error(`Unexpected fixture path shape: ${path}`);
  }

  return parts as [string, string, string, string];
}

function expectCurrentFixtureCounts(markdown: string, fixturePaths: string[]): void {
  const count = (surface: string, family: string): number => fixturePaths.filter((fixturePath) => {
    const [fixtureSurface, , fixtureFamily] = fixturePathParts(fixturePath);
    return fixtureSurface === surface && fixtureFamily === family;
  }).length;

  expect(markdown).toContain(`- ${fixtureCountWord(count('foundation-events', 'parse-positive'))} positive Foundation event append fixtures`);
  expect(markdown).toContain(`- ${fixtureCountWord(count('foundation-events', 'parse-negative'))} negative Foundation event append fixtures`);
  expect(markdown).toContain(`- ${fixtureCountWord(count('foundation-realtime', 'parse-positive'))} positive current Foundation WebSocket message fixtures`);
  expect(markdown).toContain(`- ${fixtureCountWord(count('foundation-realtime', 'parse-negative'))} negative Foundation WebSocket message fixtures`);
}

function fixtureCountWord(count: number): string {
  const words = [
    'zero',
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
    'eleven',
    'twelve',
  ];

  return words[count] ?? String(count);
}

function readRepoJsonObject(path: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readRepoFile(path));
  return asRecord(parsed, path);
}

function recordField(source: Record<string, unknown>, field: string): Record<string, unknown> {
  return asRecord(source[field], field);
}

function stringField(source: Record<string, unknown>, field: string): string {
  const value = source[field];
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string.`);
  }

  return value;
}

function optionalStringField(source: Record<string, unknown>, field: string): string | undefined {
  const value = source[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string when present.`);
  }

  return value;
}

function buildPicoIdentityVector(identityFamily: string, fields: Record<string, unknown>): Uint8Array {
  if (identityFamily === 'keyrecord') {
    return buildPicoIdentityKeyRecordSignatureInput({
      suite: stringField(fields, 'suite'),
      keyRole: stringField(fields, 'keyRole') as typeof picoIdentityKeyRoles[number],
      publicKeyHex: stringField(fields, 'publicKeyHex'),
      ...optionalFieldOrder(fields),
    });
  }

  if (identityFamily === 'possession') {
    return buildPicoIdentityPossessionSignatureInput({
      suite: stringField(fields, 'suite'),
      subjectKeyFingerprintHex: stringField(fields, 'subjectKeyFingerprintHex'),
      verifierNonceHex: stringField(fields, 'verifierNonceHex'),
      verifierContext: stringField(fields, 'verifierContext'),
      ...optionalFieldOrder(fields),
    });
  }

  if (identityFamily === 'delegation') {
    return buildPicoIdentityDelegationSignatureInput({
      suite: stringField(fields, 'suite'),
      delegationId: stringField(fields, 'delegationId'),
      issuerIdentityKeyFingerprintHex: stringField(fields, 'issuerIdentityKeyFingerprintHex'),
      subjectSigningKeyFingerprintHex: stringField(fields, 'subjectSigningKeyFingerprintHex'),
      subjectKeyAgreementKeyFingerprintHex: stringField(fields, 'subjectKeyAgreementKeyFingerprintHex'),
      scopes: stringArrayField(fields, 'scopes') as typeof picoIdentityDelegationScopes[number][],
      validFrom: stringField(fields, 'validFrom'),
      validUntil: stringField(fields, 'validUntil'),
      lifecycleOrder: stringField(fields, 'lifecycleOrder'),
      ...optionalFieldOrder(fields),
    });
  }

  if (identityFamily === 'revocation') {
    return buildPicoIdentityRevocationSignatureInput({
      suite: stringField(fields, 'suite'),
      revocationId: stringField(fields, 'revocationId'),
      issuerIdentityKeyFingerprintHex: stringField(fields, 'issuerIdentityKeyFingerprintHex'),
      subjectKind: stringField(fields, 'subjectKind') as 'delegation' | 'key',
      subjectRef: stringField(fields, 'subjectRef'),
      reasonCategory: stringField(fields, 'reasonCategory') as typeof picoIdentityRevocationReasonCategories[number],
      revokedAt: stringField(fields, 'revokedAt'),
      lifecycleOrder: stringField(fields, 'lifecycleOrder'),
      ...optionalFieldOrder(fields),
    });
  }

  throw new Error(`Unexpected identity signature-input family: ${identityFamily}`);
}

function buildPicoHomeVector(homeFamily: string, fields: Record<string, unknown>): Uint8Array {
  if (homeFamily === 'claim') {
    return buildPicoHomeClaimSignatureInput({
      ...stringProperty(fields, 'suite'),
      ...stringProperty(fields, 'claimId'),
      ...stringProperty(fields, 'hostSigningKeyFingerprintHex'),
      ...stringProperty(fields, 'hostKeyAgreementKeyFingerprintHex'),
      ...stringProperty(fields, 'moveInCode'),
      ...stringProperty(fields, 'claimantIdentityKeyFingerprintHex'),
      ...stringProperty(fields, 'claimantNonceHex'),
      ...stringProperty(fields, 'hostSetupNonceHex'),
      ...optionalFieldOrder(fields),
    } as unknown as Parameters<typeof buildPicoHomeClaimSignatureInput>[0]);
  }

  if (homeFamily === 'claimResponse') {
    return buildPicoHomeClaimResponseSignatureInput({
      ...stringProperty(fields, 'suite'),
      ...stringProperty(fields, 'claimId'),
      ...stringProperty(fields, 'homeId'),
      ...stringProperty(fields, 'hostSigningKeyFingerprintHex'),
      ...stringProperty(fields, 'hostKeyAgreementKeyFingerprintHex'),
      ...stringProperty(fields, 'claimantIdentityKeyFingerprintHex'),
      ...stringProperty(fields, 'claimantNonceHex'),
      ...stringProperty(fields, 'hostNonceHex'),
      ...stringProperty(fields, 'foundingRecordId'),
      ...optionalFieldOrder(fields),
    } as unknown as Parameters<typeof buildPicoHomeClaimResponseSignatureInput>[0]);
  }

  if (homeFamily === 'founding') {
    return buildPicoHomeFoundingSignatureInput({
      ...stringProperty(fields, 'suite'),
      ...stringProperty(fields, 'foundingId'),
      ...stringProperty(fields, 'homeId'),
      ...stringProperty(fields, 'hostSigningKeyFingerprintHex'),
      ...stringProperty(fields, 'hostKeyAgreementKeyFingerprintHex'),
      ...stringProperty(fields, 'homeHostPicoIdentityFingerprintHex'),
      ...stringProperty(fields, 'claimantNonceHex'),
      ...stringProperty(fields, 'hostNonceHex'),
      ...stringProperty(fields, 'foundedAt'),
      ...stringProperty(fields, 'lifecycleOrder'),
      ...optionalFieldOrder(fields),
    } as unknown as Parameters<typeof buildPicoHomeFoundingSignatureInput>[0]);
  }

  if (homeFamily === 'membership') {
    return buildPicoHomeMembershipSignatureInput({
      ...stringProperty(fields, 'suite'),
      ...stringProperty(fields, 'credentialId'),
      ...stringProperty(fields, 'homeId'),
      ...stringProperty(fields, 'issuerPicoIdentityFingerprintHex'),
      ...stringProperty(fields, 'subjectPicoIdentityFingerprintHex'),
      ...stringProperty(fields, 'hostSigningKeyFingerprintHex'),
      ...stringProperty(fields, 'role'),
      ...stringArrayProperty(fields, 'scopes'),
      ...stringProperty(fields, 'validFrom'),
      ...stringProperty(fields, 'validUntil'),
      ...stringProperty(fields, 'lifecycleOrder'),
      ...optionalFieldOrder(fields),
    } as unknown as Parameters<typeof buildPicoHomeMembershipSignatureInput>[0]);
  }

  if (homeFamily === 'membershipLifecycle') {
    return buildPicoHomeMembershipLifecycleSignatureInput({
      ...stringProperty(fields, 'suite'),
      ...stringProperty(fields, 'lifecycleId'),
      ...stringProperty(fields, 'homeId'),
      ...stringProperty(fields, 'credentialId'),
      ...stringProperty(fields, 'issuerPicoIdentityFingerprintHex'),
      ...stringProperty(fields, 'subjectPicoIdentityFingerprintHex'),
      ...stringProperty(fields, 'status'),
      ...stringProperty(fields, 'reasonCategory'),
      ...stringProperty(fields, 'changedAt'),
      ...stringProperty(fields, 'lifecycleOrder'),
      ...optionalFieldOrder(fields),
    } as unknown as Parameters<typeof buildPicoHomeMembershipLifecycleSignatureInput>[0]);
  }

  if (homeFamily === 'continuity') {
    return buildPicoHomeContinuitySignatureInput({
      ...stringProperty(fields, 'suite'),
      ...stringProperty(fields, 'continuityId'),
      ...stringProperty(fields, 'homeId'),
      ...stringProperty(fields, 'outgoingHostSigningKeyFingerprintHex'),
      ...stringProperty(fields, 'outgoingHostKeyAgreementKeyFingerprintHex'),
      ...stringProperty(fields, 'incomingHostSigningKeyFingerprintHex'),
      ...stringProperty(fields, 'incomingHostKeyAgreementKeyFingerprintHex'),
      ...stringProperty(fields, 'homeHostPicoIdentityFingerprintHex'),
      ...stringProperty(fields, 'reasonCategory'),
      ...stringProperty(fields, 'changedAt'),
      ...stringProperty(fields, 'lifecycleOrder'),
      ...optionalFieldOrder(fields),
    } as unknown as Parameters<typeof buildPicoHomeContinuitySignatureInput>[0]);
  }

  throw new Error(`Unexpected Pico Home signature-input family: ${homeFamily}`);
}

function buildPicoVaultHeaderAadVector(fields: Record<string, unknown>): Uint8Array {
  return buildPicoVaultKeyfileHeaderAad({
    format: stringField(fields, 'format'),
    suite: stringField(fields, 'suite'),
    keyRole: stringField(fields, 'keyRole') as typeof picoVaultPersonKeyRoles[number],
    keyFingerprintHex: stringField(fields, 'keyFingerprintHex'),
    kdfAlgorithm: stringField(fields, 'kdfAlgorithm') as typeof picoVaultKdfAlgorithms[number],
    kdfProfile: stringField(fields, 'kdfProfile') as typeof picoVaultKdfProfiles[number],
    kdfOpsLimit: numberField(fields, 'kdfOpsLimit'),
    kdfMemLimitBytes: numberField(fields, 'kdfMemLimitBytes'),
    kdfSaltHex: stringField(fields, 'kdfSaltHex'),
    aeadAlgorithm: stringField(fields, 'aeadAlgorithm') as typeof picoVaultAeadAlgorithms[number],
    aeadNonceHex: stringField(fields, 'aeadNonceHex'),
    ...optionalFieldOrder(fields),
  });
}

function optionalFieldOrder(fields: Record<string, unknown>): Record<string, unknown> {
  return fields.fieldOrder === undefined ? {} : { fieldOrder: fields.fieldOrder };
}

function stringProperty(source: Record<string, unknown>, field: string): Record<string, string> {
  if (!Object.prototype.hasOwnProperty.call(source, field)) {
    return {};
  }

  return { [field]: stringField(source, field) };
}

function stringArrayProperty(source: Record<string, unknown>, field: string): Record<string, string[]> {
  if (!Object.prototype.hasOwnProperty.call(source, field)) {
    return {};
  }

  return { [field]: stringArrayField(source, field) };
}

function blake2b256Hex(input: Uint8Array): string {
  return Buffer.from(sodium.crypto_generichash(32, input, null)).toString('hex');
}

/**
 * Independent re-implementation of the ADR 0073 canonical associated-data
 * construction, written from the ADR prose (not shared with any runtime): each
 * element is U32BE(len) || bytes, the domain-separation label is element 0, the
 * field order is fixed per family, and field values are restricted to the ASCII
 * token charset with a 1..1024-byte length. It rebuilds each fixture's bytes so
 * the published hex cannot silently drift from the construction it claims.
 */
function buildMemoryContentAd(adFamily: string, fields: Record<string, unknown>): Buffer {
  const order = adFamily === 'content'
    ? ['suite', 'memoryItemId', 'privacyDomain', 'contentType']
    : ['suite', 'keyEnvelopeId', 'domainId', 'memoryItemId'];
  const label = adFamily === 'content' ? 'pico.mem.ad.content.v1' : 'pico.mem.ad.dek-wrap.v1';
  const charset = /^[A-Za-z0-9._:/+-]+$/;

  const element = (value: string): Buffer => {
    const bytes = Buffer.from(value, 'utf8');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(bytes.length, 0);
    return Buffer.concat([length, bytes]);
  };

  const parts = [element(label)];
  for (const name of order) {
    const value = stringField(fields, name);
    const bytes = Buffer.from(value, 'utf8');
    if (bytes.length === 0) {
      throw new Error('empty_field');
    }
    if (bytes.length > 1024) {
      throw new Error('field_too_long');
    }
    if (!charset.test(value)) {
      throw new Error('invalid_field_charset');
    }
    parts.push(element(value));
  }

  return Buffer.concat(parts);
}

function numberField(source: Record<string, unknown>, field: string): number {
  const value = source[field];
  if (typeof value !== 'number') {
    throw new Error(`${field} must be a number.`);
  }

  return value;
}

function booleanField(source: Record<string, unknown>, field: string): boolean {
  const value = source[field];
  if (typeof value !== 'boolean') {
    throw new Error(`${field} must be a boolean.`);
  }

  return value;
}

function stringArrayField(source: Record<string, unknown>, field: string): string[] {
  const value = source[field];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${field} must be a string array.`);
  }

  return value;
}

function recordArrayField(source: Record<string, unknown>, field: string): Record<string, unknown>[] {
  const value = source[field];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'object' || item === null || Array.isArray(item))) {
    throw new Error(`${field} must be an object array.`);
  }

  return value as Record<string, unknown>[];
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function textFenceAfterHeading(markdown: string, heading: string): string[] {
  const headingIndex = markdown.indexOf(heading);
  if (headingIndex === -1) {
    throw new Error(`Heading not found: ${heading}`);
  }

  const fenceMatch = /\n```text\n([\s\S]*?)\n```/.exec(markdown.slice(headingIndex));
  if (!fenceMatch) {
    throw new Error(`Text fence not found after heading: ${heading}`);
  }

  return fenceMatch[1]
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}
