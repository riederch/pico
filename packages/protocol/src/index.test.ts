import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
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
  legacyToolPolicyEventTypes,
  messageCreatedRoles,
  payloadPostures,
  picoHomeClaimStates,
  picoEventTypes,
  picoHomeEventTypes,
  protocolCapabilities,
  realtimeMessageType,
  realtimeMessageTypes,
  validateFoundationEventPayload,
} from './index.js';

const repoRootPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('Pico protocol types', () => {
  it('exports runtime event type lists for compatibility checks', () => {
    expect(foundationEventTypes).toEqual([
      'device.registered',
      'device.seen',
      'session.created',
      'message.created',
      'avatar.state_changed',
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
    expect(textFenceAfterHeading(publicSurfaces, '### Product action event types')).toEqual([...actionEventTypes]);
    expect(textFenceAfterHeading(publicSurfaces, '### Legacy tool/policy event types')).toEqual([...legacyToolPolicyEventTypes]);
    expect(textFenceAfterHeading(publicSurfaces, '### Pico Home event direction')).toEqual([...picoHomeEventTypes]);
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
      'protected-payload/v0.1.7/parse-positive/opaque-placeholder',
      'home-membership/v0.1.7/parse-positive/invited-member-placeholder',
      'home-membership/v0.1.7/parse-negative/move-in-code-as-credential',
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
      'canonicalization/v0.1.7/parse-negative/canonical-output-claim',
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
    expect(stringArrayField(suite, 'families')).toEqual(['parse-positive', 'authority-negative', 'privacy-negative']);
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
      'job-envelope/v0.1.7/privacy-negative/forbidden-input-class',
      'context-ref/v0.1.7/privacy-negative/provider-expandable-context',
      'result-envelope/v0.1.7/authority-negative/action-execution-claim',
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
      expect(String(routingValue)).toContain('route_');
      expect(String(routingValue)).not.toContain('pico_');
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
    expect(payload.ciphertext).toBeUndefined();
    expect(payload.signature).toBeUndefined();
    expect(payload.keyEnvelope).toBeUndefined();
    expect(payload.algorithmSuite).toBeUndefined();
    expect(payload.plaintext).toBeUndefined();

    if (fixtureCase === 'plaintext-message-leak') {
      expect(stringField(input, 'messageText')).toContain('plaintext');
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['protected_plaintext_leak']);
    } else {
      expect(input.messageText).toBeUndefined();
    }
  } else if (draftSurface === 'protected-payload') {
    expect(stringField(input, 'schema')).toBe('pico.payload.protected.draft');
    const protection = recordField(input, 'protection');
    expect(stringField(protection, 'mode')).toBe('placeholder');
    expect(stringField(protection, 'algorithmSuite')).toBe('placeholder-only');
    expect(stringArrayField(protection, 'keyEnvelopeRefs')).toEqual([]);
    const claimedSender = recordField(input, 'claimedSender');
    expect(stringField(claimedSender, 'proofStatus')).toBe('unverified-placeholder');
    const body = recordField(input, 'body');
    expect(stringField(body, 'kind')).toBe('opaque-placeholder');
    expect(booleanField(body, 'placeholder')).toBe(true);
    expect(stringField(body, 'protectedContentRef')).toContain('content_placeholder_');
    expect(input.ciphertext).toBeUndefined();
    expect(input.signature).toBeUndefined();
    expect(input.keyEnvelope).toBeUndefined();
    expect(input.plaintext).toBeUndefined();
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
    expect(stringArrayField(expectBlock, 'errors')).toEqual(['compatibility_claim']);
    expect(stringArrayField(input, 'disclaimers')).not.toContain('not L4 conformance');
    expect(stringArrayField(expectBlock, 'requiredDisclaimers')).toContain('not L4 conformance');
  } else if (draftSurface === 'home-membership') {
    expect(stringField(input, 'schema')).toBe('pico.home.membership.credential.draft');
    expect(stringField(input, 'credentialId')).toContain(fixtureCase === 'move-in-code-as-credential' ? 'movein_code_' : 'homecred_placeholder_');
    const issuer = recordField(input, 'issuer');
    expect(stringField(issuer, 'proofStatus')).toBe('unverified-placeholder');
    const subject = recordField(input, 'subject');
    expect(['pico', 'device']).toContain(stringField(subject, 'subjectKind'));
    const membership = recordField(input, 'membership');
    expect(['home_host', 'home_member', 'trusted_device', 'service_placeholder']).toContain(stringField(membership, 'role'));
    for (const scope of stringArrayField(membership, 'scopes')) {
      expect(['host.use', 'packet.receive', 'storage.queue', 'sync.exchange']).toContain(scope);
      expect(scope).not.toContain('domain');
    }
    expect(['invited', 'active', 'revoked', 'expired', 'evicted', 'transferred_or_reissued']).toContain(stringField(membership, 'status'));
    expect(stringField(input, 'signatureStatus')).toBe('absent');
    const authority = recordField(expectBlock, 'authority');
    expect(booleanField(authority, 'credentialVerified')).toBe(false);
    expect(booleanField(authority, 'domainAccessGranted')).toBe(false);

    if (fixtureCase === 'move-in-code-as-credential') {
      expect(input.moveInCode).toBeTruthy();
      expect(booleanField(authority, 'moveInCodeUsed')).toBe(true);
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['move_in_code_boundary']);
    } else {
      expect(input.moveInCode).toBeUndefined();
      expect(booleanField(authority, 'moveInCodeUsed')).toBe(false);
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
    expect(stringArrayField(expectBlock, 'errors')).toEqual(['canonical_output_claim']);
    expect(stringField(canonicalOutput, 'status')).toBe('present');
    expect(stringField(canonicalOutput, 'bytes')).toBeTruthy();
    const canonicalization = recordField(expectBlock, 'canonicalization');
    expect(booleanField(canonicalization, 'canonicalBytesPublished')).toBe(true);
    expect(booleanField(canonicalization, 'hashVectorPublished')).toBe(false);
    expect(booleanField(canonicalization, 'signatureVectorPublished')).toBe(false);
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

    if (fixtureCase === 'vault-read-authority-claim') {
      expect(booleanField(claims, 'trustGrantByDiscovery')).toBe(true);
      expect(booleanField(claims, 'vaultReadAccess')).toBe(true);
      expect(stringArrayField(input, 'authorityClaims')).toContain('vault.read');
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['provider_vault_read_claim']);
      const authority = recordField(expectBlock, 'authority');
      expect(booleanField(authority, 'trustGrant')).toBe(true);
      expect(booleanField(authority, 'vaultReadAccess')).toBe(true);
    } else {
      expect(booleanField(claims, 'trustGrantByDiscovery')).toBe(false);
      expect(booleanField(claims, 'vaultReadAccess')).toBe(false);
      expect(stringField(input, 'trustState')).toBe('trusted-for-non-sensitive');
      for (const inputClass of stringArrayField(input, 'supportedInputClasses')) {
        expect(forbiddenModelDelegationInputClasses()).not.toContain(inputClass);
      }
    }
  } else if (draftSurface === 'job-envelope') {
    expect(stringField(input, 'schema')).toBe('pico.model.job.envelope.draft');
    expect(['model.summarize', 'model.extract', 'model.draft', 'model.compare', 'model.reason', 'model.plan']).toContain(stringField(input, 'jobType'));
    expect(stringField(input, 'toolUseMode')).toBe('none');
    expect(['no_store', 'ephemeral_until_response', 'audit_metadata_only', 'bounded_result_retention'])
      .toContain(stringField(input, 'retentionRequirement'));
    const inputClasses = stringArrayField(input, 'inputClasses');

    if (fixtureCase === 'forbidden-input-class') {
      expect(inputClasses).toContain('domain_content_key');
      expect(stringField(recordField(input, 'inlineContext'), 'syntheticSecretMarker')).toContain('domain_content_key_placeholder');
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['forbidden_input_class']);
      const privacy = recordField(expectBlock, 'privacy');
      expect(stringArrayField(privacy, 'forbiddenInputClasses')).toEqual(['domain_content_key']);
      expect(booleanField(privacy, 'secretMaterial')).toBe(true);
    }
  } else if (draftSurface === 'context-ref') {
    expect(stringField(input, 'schema')).toBe('pico.model.context.ref.draft');
    expect(stringField(input, 'contextRefId')).toContain('context_ref_');
    expect(stringField(input, 'inputClass')).toBe('private_memory_excerpt');
    expect(booleanField(input, 'redactionApplied')).toBe(true);
    expect(booleanField(input, 'allowedForProvider')).toBe(true);

    if (fixtureCase === 'provider-expandable-context') {
      expect(booleanField(input, 'providerExpansionAllowed')).toBe(true);
      expect(stringField(input, 'expansionScope')).toBe('vault:*');
      expect(stringArrayField(expectBlock, 'errors')).toEqual(['context_ref_expansion']);
      const privacy = recordField(expectBlock, 'privacy');
      expect(booleanField(privacy, 'providerExpansionAllowed')).toBe(true);
      expect(booleanField(privacy, 'contextRefScoped')).toBe(false);
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
