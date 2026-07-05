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
  foundationEventTypes,
  legacyToolPolicyEventTypes,
  picoEventTypes,
  picoHomeEventTypes,
} from './index.js';

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
