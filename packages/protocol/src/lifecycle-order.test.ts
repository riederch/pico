import { describe, expect, it } from 'vitest';
import {
  assertPicoLifecycleOrder,
  isPicoLifecycleOrder,
  maxPicoLifecycleOrderSequence,
  nextPicoLifecycleOrder,
  picoLifecycleOrderFrom,
  picoLifecycleOrderSequence,
} from './lifecycle-order.js';

/**
 * Befund B137. Was eine Lebenslaufordnung ist, stand zwanzigmal im Baum - zehn
 * Fassungen der Form, die eine zulaesst, und zehn der Form, die eine baut.
 */

describe('what counts as a lifecycle order', () => {
  it('takes `seq:` and exactly sixteen digits, and nothing else', () => {
    expect(isPicoLifecycleOrder('seq:0000000000000001')).toBe(true);
    expect(isPicoLifecycleOrder('seq:9999999999999999')).toBe(true);
    // Fifteen digits sorts below every sibling; seventeen sorts by its first
    // character. The width is the comparison.
    expect(isPicoLifecycleOrder('seq:000000000000001')).toBe(false);
    expect(isPicoLifecycleOrder('seq:00000000000000001')).toBe(false);
    expect(isPicoLifecycleOrder('seq:1')).toBe(false);
    expect(isPicoLifecycleOrder('seq:000000000000000a')).toBe(false);
    expect(isPicoLifecycleOrder('SEQ:0000000000000001')).toBe(false);
    expect(isPicoLifecycleOrder(' seq:0000000000000001')).toBe(false);
    expect(isPicoLifecycleOrder('')).toBe(false);
    expect(isPicoLifecycleOrder(undefined)).toBe(false);
    expect(isPicoLifecycleOrder(1)).toBe(false);
  });

  it('refuses under one name unless a caller chooses another', () => {
    expect(() => assertPicoLifecycleOrder('seq:0000000000000001')).not.toThrow();
    expect(() => assertPicoLifecycleOrder('seq:1')).toThrow('invalid_lifecycle_order');
    expect(() => assertPicoLifecycleOrder('seq:1', 'invalid_sync_lifecycle_order'))
      .toThrow('invalid_sync_lifecycle_order');
  });

  it('reads the sequence as a bigint, because sixteen digits outrun a Number', () => {
    /**
     * The largest order this width allows is 9_999_999_999_999_999 and
     * `Number.MAX_SAFE_INTEGER` stops at 9_007_199_254_740_991. One of the
     * copies this replaces used `Number.parseInt`: exact for every order the
     * tree writes today, silently wrong for the top of the range the format
     * permits.
     */
    expect(picoLifecycleOrderSequence('seq:0000000000000042')).toBe(42n);
    expect(picoLifecycleOrderSequence('seq:9999999999999999'))
      .toBe(maxPicoLifecycleOrderSequence);
    // Der Beleg ist der Rueckweg: die Zahl kommt mit anderen Ziffern zurueck.
    expect(String(Number.parseInt('9999999999999999', 10))).toBe('10000000000000000');
    expect(picoLifecycleOrderSequence('seq:9999999999999999').toString())
      .toBe('9999999999999999');
    expect(() => picoLifecycleOrderSequence('seq:1')).toThrow('invalid_lifecycle_order');
  });

  it('builds one padded to the width, and refuses to run past it', () => {
    expect(picoLifecycleOrderFrom(1n)).toBe('seq:0000000000000001');
    expect(picoLifecycleOrderFrom(0n)).toBe('seq:0000000000000000');
    expect(picoLifecycleOrderFrom(maxPicoLifecycleOrderSequence)).toBe('seq:9999999999999999');
    expect(() => picoLifecycleOrderFrom(maxPicoLifecycleOrderSequence + 1n))
      .toThrow('lifecycle_order_exhausted');
    expect(() => picoLifecycleOrderFrom(-1n)).toThrow('invalid_lifecycle_order');
  });

  it('keeps the built order sortable against its neighbours', () => {
    // The whole reason for the padding: these are compared as strings.
    const orders = [1n, 2n, 9n, 10n, 100n, 1_000_000n].map(picoLifecycleOrderFrom);
    expect([...orders].sort()).toEqual(orders);
  });

  it('counts to the next one, and refuses a current one it cannot read', () => {
    expect(nextPicoLifecycleOrder('seq:0000000000000001')).toBe('seq:0000000000000002');
    expect(nextPicoLifecycleOrder('seq:0000000000000009')).toBe('seq:0000000000000010');
    expect(nextPicoLifecycleOrder('seq:0000000000000001', 5n)).toBe('seq:0000000000000006');
    expect(() => nextPicoLifecycleOrder('seq:9999999999999999'))
      .toThrow('lifecycle_order_exhausted');

    /**
     * **Und ein malformer Vorgaenger ist eine Ablehnung** (Befund B137). Eine
     * der drei Fassungen las `match === null ? 1 : …` und begann die Folge
     * damit stillschweigend neu bei eins - und eins ist der Wert, der unter
     * jedem bereits geschriebenen Datensatz sortiert.
     */
    expect(() => nextPicoLifecycleOrder('nonsense')).toThrow('invalid_lifecycle_order');
    expect(() => nextPicoLifecycleOrder('')).toThrow('invalid_lifecycle_order');
    expect(() => nextPicoLifecycleOrder(undefined)).toThrow('invalid_lifecycle_order');
  });
});
