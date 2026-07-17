import { describe, expect, it } from 'vitest';
import { SessionStore } from './session-store.js';

describe('SessionStore', () => {
  it('issues opaque sessions that validate once and can be revoked', () => {
    const sessions = new SessionStore();
    const session = sessions.issue();

    expect(session.value.length).toBeGreaterThanOrEqual(43);
    expect(sessions.touch(session.value)).toBeDefined();
    expect(sessions.touch('not-a-session')).toBeUndefined();
    expect(sessions.touch(undefined)).toBeUndefined();

    expect(sessions.revoke(session.value)).toBe(true);
    expect(sessions.touch(session.value)).toBeUndefined();
    expect(sessions.revoke(session.value)).toBe(false);
  });

  it('extends the idle window on use but never past the absolute ceiling', () => {
    let nowMs = 1_000;
    const sessions = new SessionStore({
      idleTimeoutMs: 100,
      absoluteTimeoutMs: 250,
      now: () => nowMs,
    });

    const session = sessions.issue();

    // Activity inside the idle window keeps the session alive.
    nowMs += 60;
    expect(sessions.touch(session.value)).toBeDefined();
    nowMs += 60;
    expect(sessions.touch(session.value)).toBeDefined();

    // The absolute ceiling caps the extension: at 1_120 the idle window would
    // reach 1_220, but the session must die at 1_250 regardless of activity.
    nowMs += 60;
    expect(sessions.touch(session.value)?.expiresAtMs).toBe(1_250);

    nowMs = 1_250;
    expect(sessions.touch(session.value)).toBeUndefined();
  });

  it('expires an idle session even while the absolute ceiling is far away', () => {
    let nowMs = 0;
    const sessions = new SessionStore({ idleTimeoutMs: 50, absoluteTimeoutMs: 10_000, now: () => nowMs });
    const session = sessions.issue();

    nowMs = 50;
    expect(sessions.touch(session.value)).toBeUndefined();
  });

  it('revokes every session at once and reports how many were live', () => {
    const sessions = new SessionStore();
    const first = sessions.issue();
    const second = sessions.issue();

    expect(sessions.revokeAll()).toBe(2);
    expect(sessions.touch(first.value)).toBeUndefined();
    expect(sessions.touch(second.value)).toBeUndefined();
    expect(sessions.revokeAll()).toBe(0);
  });

  it('caps concurrent sessions by evicting the oldest', () => {
    let nowMs = 0;
    const sessions = new SessionStore({ maxSessions: 2, now: () => (nowMs += 1) });

    const first = sessions.issue();
    const second = sessions.issue();
    const third = sessions.issue();

    expect(sessions.touch(first.value)).toBeUndefined();
    expect(sessions.touch(second.value)).toBeDefined();
    expect(sessions.touch(third.value)).toBeDefined();
    expect(sessions.size()).toBe(2);
  });

  it('exposes a stable digest for live sessions only, so tickets can be scoped to one', () => {
    const sessions = new SessionStore();
    const session = sessions.issue();

    const digest = sessions.digestOf(session.value);
    expect(digest).toBeDefined();
    expect(digest).not.toContain(session.value);
    expect(sessions.digestOf(session.value)).toBe(digest);

    sessions.revoke(session.value);
    expect(sessions.digestOf(session.value)).toBeUndefined();
  });
});
