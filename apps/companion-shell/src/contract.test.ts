import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parsePicoCompanionFirstRunScanSource,
  parsePicoCompanionPresentation,
  parsePicoCompanionRecoveryCardSetupInput,
  picoCompanionIdlePresentation,
  picoCompanionIpcChannels,
  picoCompanionRelayLines,
  picoCompanionRelayAccountIssued,
  parsePicoCompanionRelays,
} from './contract.js';

describe('companion renderer presentation contract', () => {
  it('accepts and freezes the bounded display-only shape', () => {
    const state = picoCompanionIdlePresentation(new Date('2026-08-02T12:00:00Z'));
    expect(state).toEqual({
      kind: 'idle',
      severity: 'active',
      symbol: '●',
      decision: 'none',
      title: 'Pico is watching your Home',
      body: 'No pending device recovery was found on the last authenticated check.',
      observedAt: '2026-08-02T12:00:00.000Z',
      // ADR 0118 O4. Always present, never absent: a consumer must not have to
      // tell "no conditions" from "conditions not stated".
      conditions: [],
    });
    expect(Object.isFrozen(state)).toBe(true);
  });

  it('rejects generic, extended and unbounded renderer payloads', () => {
    const valid = picoCompanionIdlePresentation();
    expect(() => parsePicoCompanionPresentation({ ...valid, socketPath: '/tmp/vault.sock' }))
      .toThrow('invalid_companion_presentation_shape');
    expect(() => parsePicoCompanionPresentation({ ...valid, body: 'x'.repeat(4_001) }))
      .toThrow('invalid_companion_presentation_text');
    expect(() => parsePicoCompanionPresentation({ ...valid, severity: 'secret' }))
      .toThrow('invalid_companion_presentation_state');
    expect(() => parsePicoCompanionPresentation({ ...valid, decision: 'sign_anything' }))
      .toThrow('invalid_companion_presentation_state');
    expect(() => parsePicoCompanionPresentation({
      ...valid,
      decision: 'approve_or_deny',
    })).toThrow('invalid_companion_presentation_decision_binding');
    expect(() => parsePicoCompanionPresentation({
      ...valid,
      decision: 'begin_first_run',
    })).toThrow('invalid_companion_presentation_decision_binding');
  });

  it('binds the first-run decision to its own kind and closes the scan sources', () => {
    const firstRun = parsePicoCompanionPresentation({
      ...picoCompanionIdlePresentation(new Date('2026-08-02T12:00:00Z')),
      kind: 'first_run',
      severity: 'warning',
      symbol: '!',
      decision: 'begin_first_run',
    });
    expect(firstRun.kind).toBe('first_run');
    expect(Object.isFrozen(firstRun)).toBe(true);

    expect(parsePicoCompanionFirstRunScanSource('camera')).toBe('camera');
    expect(parsePicoCompanionFirstRunScanSource('typed')).toBe('typed');
    for (const rejected of ['file', '', 'CAMERA', null, 7]) {
      expect(() => parsePicoCompanionFirstRunScanSource(rejected))
        .toThrow('invalid_first_run_scan_source');
    }
  });

  it('accepts only the exact public Recovery Card setup shape', () => {
    expect(parsePicoCompanionRecoveryCardSetupInput({
      picoName: 'Pico',
      homeNameOrId: 'Vienna Home',
      homeId: 'home_vienna',
      form: 'paper',
    })).toEqual({
      picoName: 'Pico',
      homeNameOrId: 'Vienna Home',
      homeId: 'home_vienna',
      form: 'paper',
    });
    expect(() => parsePicoCompanionRecoveryCardSetupInput({
      picoName: 'Pico',
      homeNameOrId: 'Vienna Home',
      homeId: 'home_vienna',
      form: 'pdf_file',
    })).toThrow('invalid_recovery_card_print_form');
    expect(() => parsePicoCompanionRecoveryCardSetupInput({
      picoName: 'Pico',
      homeNameOrId: 'Vienna Home',
      homeId: 'home_vienna',
      form: 'paper',
      pin: 'must-not-cross-the-renderer',
    })).toThrow('invalid_recovery_card_setup_shape');
  });
});

describe('the bridge and the contract are one list', () => {
  it('declares the same channels in the preload as in the contract', () => {
    // **Two closed lists over one subject drift**, which this tree has now
    // learned four times. The preload cannot import the contract - it is a
    // CommonJS bridge loaded before any module graph exists - so the literal
    // is duplicated by necessity and held to the original by this test rather
    // than by whoever remembers.
    const preload = readFileSync(
      join(import.meta.dirname, 'preload.cts'),
      'utf8',
    );
    for (const [name, channel] of Object.entries(picoCompanionIpcChannels)) {
      expect(preload).toContain(`${name}: '${channel}'`);
    }
    const declared = [...preload.matchAll(/^  (\w+): '(pico:[a-z:-]+)',$/gmu)]
      .map(([, name]) => name);
    expect(declared.sort()).toEqual(Object.keys(picoCompanionIpcChannels).sort());
  });
});

describe('ADR 0154 - the words for a relay this person runs', () => {
  const relay = {
    baseUrl: 'https://relay.example:3202',
    operator: 'relay.example',
    claimedAt: '2026-08-16T12:00:00.000Z',
  };

  it('says a relay with no keys is refusing, not broken', () => {
    // An unprovisioned relay is running correctly and turning everybody away.
    // "Something is wrong" would send a person looking at logs for a machine
    // that is doing exactly what it was told.
    const [line] = picoCompanionRelayLines([{ ...relay, accounts: [] }]);
    expect(line?.headline).toBe('You run the relay at relay.example');
    expect(line?.detail).toContain('Nobody can post through it yet');
    expect(line?.detail).not.toContain('error');
  });

  it('counts devices rather than rows, and says what the relay never sees', () => {
    const [line] = picoCompanionRelayLines([{
      ...relay,
      accounts: [
        { accountRef: '0123456789ab', status: 'active', mailboxQuota: 4, maxCapacity: 64, openMailboxes: 2 },
        { accountRef: 'ba9876543210', status: 'revoked', mailboxQuota: 1, maxCapacity: 8, openMailboxes: 0 },
      ],
    }]);
    expect(line?.detail).toContain('One device can post through it');
    expect(line?.detail).toContain('never sees what they send');
    expect(line?.accounts.map((account) => account.revokable)).toEqual([true, false]);
  });

  it('tells a withdrawn key from one that never existed', () => {
    // ADR 0154 RO5. The row is kept so this sentence can exist at all.
    const [line] = picoCompanionRelayLines([{
      ...relay,
      accounts: [
        { accountRef: 'ba9876543210', status: 'revoked', mailboxQuota: 1, maxCapacity: 8, openMailboxes: 0 },
      ],
    }]);
    expect(line?.accounts[0]?.headline).toContain('withdrawn');
    expect(line?.accounts[0]?.detail).toContain('needs a new one');
  });

  it('says an access key is shown once, on the screen that shows it', () => {
    const issued = picoCompanionRelayAccountIssued('f'.repeat(32));
    expect(issued.credential).toBe('f'.repeat(32));
    expect(issued.detail).toContain('shown once');
    expect(issued.detail).toContain('withdraw the key and make another');
  });

  it('keeps absent accounts distinct from no accounts', () => {
    // ADR 0117 X1's construction: a relay this device could not reach is not
    // a relay with nobody on it.
    expect(parsePicoCompanionRelays([relay])[0]?.accounts).toBeUndefined();
    expect(parsePicoCompanionRelays([{ ...relay, accounts: [] }])[0]?.accounts).toEqual([]);
  });

  it('refuses a relay row that is missing what a line needs', () => {
    expect(() => parsePicoCompanionRelays([{ baseUrl: 'https://x', operator: 'x' }]))
      .toThrow('invalid_pico_companion_relay');
    expect(() => parsePicoCompanionRelays([{
      ...relay,
      accounts: [{ accountRef: 'a', status: 'maybe' }],
    }])).toThrow('invalid_pico_companion_relay_account');
  });
});
