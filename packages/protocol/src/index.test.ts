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
