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
  picoEventTypes,
  picoHomeEventTypes,
  protocolCapabilities,
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

  it('keeps public protocol payload value docs aligned with runtime payload value lists', () => {
    const publicSurfaces = readRepoFile('docs/protocol/public-surfaces.md');

    expect(textFenceAfterHeading(publicSurfaces, '#### `message.created.payload.role`')).toEqual([...messageCreatedRoles]);
    expect(textFenceAfterHeading(publicSurfaces, '#### `avatar.state_changed.payload.mode`')).toEqual([...avatarModes]);
    expect(textFenceAfterHeading(publicSurfaces, '#### `avatar.state_changed.payload.state`')).toEqual([...avatarStates]);
    expect(textFenceAfterHeading(publicSurfaces, '#### `avatar.state_changed.payload.intensity`')).toEqual([...avatarIntensities]);
    expect(textFenceAfterHeading(publicSurfaces, '#### `avatar.state_changed.payload.statusColor`')).toEqual([...avatarStatusColors]);
  });

  it('keeps compatibility level event docs aligned with runtime event type lists', () => {
    const compatibilityLevels = readRepoFile('docs/protocol/compatibility-levels.md');

    expect(textFenceAfterHeading(compatibilityLevels, '## L1 - Foundation event compatibility')).toEqual([...foundationEventTypes]);
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

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRootPath, path), 'utf8');
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
