import { readFileSync } from 'node:fs';
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
  foundationEventTypes,
  legacyToolPolicyEventTypes,
  messageCreatedRoles,
  picoHomeClaimStates,
  picoEventTypes,
  picoHomeEventTypes,
  protocolCapabilities,
  realtimeMessageType,
  realtimeMessageTypes,
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
    expect(messageCreatedRoles).toEqual(['user', 'assistant', 'system', 'tool']);
    expect(avatarModes).toEqual(['everyday', 'technical', 'wwg', 'firefighter', 'security', 'organization', 'smart_home']);
    expect(avatarStates).toEqual(['idle', 'listening', 'thinking', 'working', 'unsure', 'warning', 'confirmation_required', 'blocked', 'success', 'sleeping']);
    expect(avatarIntensities).toEqual(['low', 'normal', 'high']);
    expect(avatarStatusColors).toEqual(['neutral', 'blue', 'green', 'yellow', 'red', 'violet']);
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
    expect(fixturePaths).toEqual([
      'foundation-events/v0.1.7/parse-positive/message-created-minimal',
      'foundation-events/v0.1.7/parse-positive/avatar-state-changed-thinking',
      'foundation-events/v0.1.7/parse-negative/action-requested-reserved',
      'foundation-events/v0.1.7/parse-negative/message-created-invalid-role',
      'foundation-realtime/v0.1.7/parse-positive/core-connected',
      'foundation-realtime/v0.1.7/parse-positive/event-created-message',
      'foundation-realtime/v0.1.7/parse-negative/pico-link-packet-not-foundation-realtime',
    ]);

    for (const fixturePath of fixturePaths) {
      const fixture = readRepoJsonObject(`docs/protocol/fixtures/${fixturePath}/fixture.json`);
      const source = recordField(fixture, 'source');
      const expectBlock = recordField(fixture, 'expect');
      const input = readRepoJsonObject(`docs/protocol/fixtures/${fixturePath}/${stringField(source, 'file')}`);
      const inputType = stringField(input, 'type');
      const capabilitiesRequired = stringArrayField(fixture, 'capabilitiesRequired');

      expect(stringField(fixture, 'schema')).toBe('pico.conformance.fixture');
      expect(numberField(fixture, 'schemaVersion')).toBe(1);
      expect(stringField(fixture, 'stage')).toBe('fixture_data');
      const surface = stringField(fixture, 'surface');
      expect(stringArrayField(suite, 'surfaces')).toContain(surface);
      expect(stringField(fixture, 'protocolVersion')).toBe(currentVersion);
      expect(stringField(source, 'encoding')).toBe('json');
      expect(stringField(source, 'file')).toBe('input.json');

      for (const capability of capabilitiesRequired) {
        expect(Object.keys(protocolCapabilities)).toContain(capability);
      }

      const family = stringField(fixture, 'family');
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
    expect(numberField(http, 'status')).toBe(201);
    expect(foundationEventTypes).toContain(inputType);

    const payload = recordField(input, 'payload');
    if (inputType === 'message.created') {
      expect(messageCreatedRoles).toContain(stringField(payload, 'role'));
      expect(stringField(payload, 'text')).toBeTruthy();
    } else if (inputType === 'avatar.state_changed') {
      expect(avatarModes).toContain(stringField(payload, 'mode'));
      expect(avatarStates).toContain(stringField(payload, 'state'));
      expect(avatarIntensities).toContain(stringField(payload, 'intensity'));
      expect(avatarStatusColors).toContain(stringField(payload, 'statusColor'));
    } else {
      throw new Error(`Unexpected positive Foundation event fixture type: ${inputType}`);
    }
  } else if (family === 'parse-negative') {
    expect(stringField(expectBlock, 'parse')).toBe('reject');
    expect(numberField(http, 'status')).toBe(400);
    expect(picoEventTypes).toContain(inputType);
    expect(stringArrayField(expectBlock, 'errors')).toEqual(['schema_error']);

    if (inputType === 'message.created') {
      expect(foundationEventTypes).toContain(inputType);
      expect(messageCreatedRoles).not.toContain(stringField(recordField(input, 'payload'), 'role'));
    } else {
      expect(foundationEventTypes).not.toContain(inputType);
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
    expect(realtimeMessageTypes).toContain(inputType);

    if (inputType === realtimeMessageType.coreConnected) {
      expect(stringField(input, 'deviceId')).toBeTruthy();
    } else if (inputType === realtimeMessageType.eventCreated) {
      const event = recordField(input, 'event');
      const eventType = stringField(event, 'type');
      expect(foundationEventTypes).toContain(eventType);

      if (eventType === 'message.created') {
        expect(messageCreatedRoles).toContain(stringField(recordField(event, 'payload'), 'role'));
      }
    } else {
      throw new Error(`Unexpected realtime fixture message type: ${inputType}`);
    }
  } else if (family === 'parse-negative') {
    expect(stringField(expectBlock, 'parse')).toBe('reject');
    expect(realtimeMessageTypes).not.toContain(inputType);
    expect(stringArrayField(expectBlock, 'errors')).toEqual(['schema_error']);
  } else {
    throw new Error(`Unexpected fixture family: ${family}`);
  }
}

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRootPath, path), 'utf8');
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
