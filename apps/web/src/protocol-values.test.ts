import {
  memoryRetentionModes as protocolRetentionModes,
  picoHomeClaimStates as protocolClaimStates,
  realtimeMessageType as protocolRealtimeMessageType,
} from '@pico/protocol';
import { describe, expect, it } from 'vitest';
import {
  memoryRetentionModes,
  picoHomeClaimStates,
  realtimeMessageType,
} from './protocol-values.js';

describe('the dashboard runtime values stay bound to the protocol', () => {
  it('matches the protocol exactly', () => {
    // The dashboard is served as plain ES modules with no bundler and no
    // import map, so a bare `@pico/protocol` specifier fails to resolve in a
    // browser and takes the whole module graph with it. These constants are
    // therefore local - and this is what stops the local copy from becoming a
    // second source of truth.
    expect(realtimeMessageType).toEqual(protocolRealtimeMessageType);
    expect([...memoryRetentionModes]).toEqual([...protocolRetentionModes]);
    expect([...picoHomeClaimStates]).toEqual([...protocolClaimStates]);
  });
});
