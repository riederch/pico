import { describe, expect, it } from 'vitest';
import { decidePicoCompanionSupplierReach } from './suppliers.js';

describe('ADR 0138 CO4 - switching off takes the unasked permission with it', () => {
  it('never sends unasked without reaching', async () => {
    // The database refuses the pair, and more to the point: somebody
    // switching off "may fetch" has plainly not meant "but keep doing it
    // unprompted". The caller does not get to send that by forgetting.
    const sent: Array<Record<string, unknown>> = [];
    const client = {
      request: async (_operation: string, args: unknown) => {
        sent.push(args as Record<string, unknown>);
        return { outcome: 'ok' as const, result: {} };
      },
    };
    await decidePicoCompanionSupplierReach({
      livingDeviceLinkClient: client as never,
      identifier: 'a-library',
      mayReachOutside: false,
      mayReachUnasked: true,
    });
    expect(sent[0]).toEqual({
      identifier: 'a-library',
      mayReachOutside: false,
      mayReachUnasked: false,
    });
  });

  it('carries the Home\'s refusal as itself', async () => {
    const client = {
      request: async () => ({
        outcome: 'invalid_arguments' as const,
        result: { refusal: 'not_attached' },
      }),
    };
    await expect(decidePicoCompanionSupplierReach({
      livingDeviceLinkClient: client as never,
      identifier: 'gone',
      mayReachOutside: true,
      mayReachUnasked: false,
    })).rejects.toThrow('not_attached');
  });
});
