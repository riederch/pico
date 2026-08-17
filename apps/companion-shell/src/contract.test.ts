import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { picoPresenceAffordances } from '@pico/protocol/presence';
import {
  parsePicoCompanionFirstRunScanSource,
  parsePicoCompanionPresentation,
  parsePicoCompanionRecoveryCardSetupInput,
  picoCompanionIdlePresentation,
  picoCompanionIpcChannels,
  picoCompanionRelayLines,
  picoCompanionRelayAccountIssued,
  parsePicoCompanionRelays,
  picoCompanionRelayRevocationLine,
  picoCompanionDeviceLines,
  parsePicoCompanionDevices,
  picoCompanionViewReads,
  picoCompanionWindowViewLines,
  picoCompanionWindowViews,
  picoCompanionPresentationTakesTheWindow,
  picoCompanionSupplierLines,
  parsePicoCompanionSuppliers,
  picoCompanionDepotLines,
  parsePicoCompanionDepots,
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

describe('ADR 0154 RO5 - what withdrawing a key cost', () => {
  it('says nothing was lost when nothing was', () => {
    expect(picoCompanionRelayRevocationLine({ mailboxesEnded: 0, packetsDropped: 0 }))
      .toBe('That key no longer works. It held no addresses.');
    expect(picoCompanionRelayRevocationLine({ mailboxesEnded: 2, packetsDropped: 0 }))
      .toContain('Nothing was waiting at them.');
  });

  it('names the discarded mail rather than folding it into "done"', () => {
    // The mail this drops has no reader left to notice it: the account that
    // could have collected is the account that just stopped existing. If this
    // sentence does not say so, nothing does.
    const line = picoCompanionRelayRevocationLine({ mailboxesEnded: 1, packetsDropped: 3 });
    expect(line).toContain('one address ended with it');
    expect(line).toContain('3 waiting messages were discarded');
    expect(line).toContain('nobody could have collected them');
  });

  it('counts one of each without reading like a robot', () => {
    const line = picoCompanionRelayRevocationLine({ mailboxesEnded: 1, packetsDropped: 1 });
    expect(line).toContain('one address');
    expect(line).toContain('One waiting message was discarded');
  });
});

describe('ADR 0126 P2/P6 - the words for a person\'s own devices', () => {
  const device = {
    presenceId: 'device-abc',
    presenceType: 'desktop_companion',
    affordances: ['camera', 'display'],
    withheld: [],
    enabled: true,
    connected: true,
    lastSeenAt: '2026-08-16T12:00:00.000Z',
  };

  it('turns a machine fact into what would happen', () => {
    // The registry holds `camera`, which is right for a planner and useless
    // to a person deciding whether to allow it.
    const [line] = picoCompanionDeviceLines([device]);
    expect(line?.offers.map((offer) => offer.headline)).toEqual([
      'It can read a Recovery Card with its camera',
      'It can show you things in a window',
    ]);
  });

  it('says the fact is still true when the person has said no', () => {
    // ADR 0126 keeps the affordance and the switch apart precisely so this
    // sentence can exist.
    const [line] = picoCompanionDeviceLines([{ ...device, withheld: ['camera'] }]);
    expect(line?.offers[0]?.headline)
      .toBe('It can read a Recovery Card with its camera, and you have told Pico not to');
    expect(line?.offers[0]?.actionLabel).toBe('Allow this again');
    expect(line?.offers[1]?.actionLabel).toBe('Do not use this');
  });

  it('tells quiet apart from switched off', () => {
    // ADR 0152 SE5. One absence ends by itself, the other needs somebody.
    expect(picoCompanionDeviceLines([device])[0]?.detail).toBe('Here now.');
    expect(picoCompanionDeviceLines([{ ...device, connected: false }])[0]?.detail)
      .toContain('Not answering right now');
    expect(picoCompanionDeviceLines([{ ...device, enabled: false }])[0]?.detail)
      .toContain('whatever it says it can do');
  });

  it('says what forgetting costs rather than calling it tidying', () => {
    expect(picoCompanionDeviceLines([device])[0]?.forgetLabel)
      .toBe('Forget this device and everything you decided about it');
  });

  it('names a device a person can recognise, and never hides an unknown one', () => {
    expect(picoCompanionDeviceLines([device])[0]?.headline).toBe('A computer');
    expect(picoCompanionDeviceLines([{ ...device, presenceType: 'mobile_companion' }])[0]?.headline)
      .toBe('A phone');
    // Hiding a device whose type this window does not know would hide a
    // device from its owner.
    expect(picoCompanionDeviceLines([{ ...device, presenceType: 'from_the_future' }])[0]?.headline)
      .toBe('A device');
  });

  it('has a sentence for every affordance the protocol declares', () => {
    // A closed map beside a closed vocabulary is the drift this tree names
    // out loud, so it is asserted rather than trusted.
    for (const affordance of picoPresenceAffordances) {
      const [line] = picoCompanionDeviceLines([{ ...device, affordances: [affordance] }]);
      expect(line?.offers[0]?.headline).not.toBe(`It can ${affordance}`);
      expect(line?.offers[0]?.headline.length).toBeGreaterThan(`It can ${affordance}`.length);
    }
  });

  it('refuses a device row that is missing what a line needs', () => {
    expect(() => parsePicoCompanionDevices([{ presenceId: 'x' }]))
      .toThrow('invalid_pico_companion_device');
  });
});

describe('ADR 0113 - the window is an occasion, not a workplace', () => {
  it('asks for nothing a view does not show', () => {
    /**
     * The reason the split was worth building rather than drawing. The window
     * sent six reads on every open, four of them for lists a person answering
     * an approval will never look at.
     */
    expect(picoCompanionViewReads.now).toEqual(['getRecalls', 'getAnsweredReads']);
    expect(picoCompanionViewReads.settings)
      .toEqual(['getModelProviders', 'getSuppliers', 'getDepots', 'getDevices', 'getRelays']);
    for (const read of picoCompanionViewReads.now) {
      expect(picoCompanionViewReads.settings).not.toContain(read);
    }
  });

  it('lets a decision take the window back, and a bad mood not', () => {
    // Somebody may be halfway through a setting when their Vault asks them to
    // approve something, and the approval is why this window exists. A
    // warning about storage is worth showing and not worth interrupting for.
    expect(picoCompanionPresentationTakesTheWindow({
      decision: 'approve_or_deny', severity: 'warning',
    })).toBe(true);
    expect(picoCompanionPresentationTakesTheWindow({
      decision: 'veto_recovery', severity: 'warning',
    })).toBe(true);
    expect(picoCompanionPresentationTakesTheWindow({
      decision: 'none', severity: 'blocked',
    })).toBe(true);
    expect(picoCompanionPresentationTakesTheWindow({
      decision: 'none', severity: 'warning',
    })).toBe(false);
    expect(picoCompanionPresentationTakesTheWindow({
      decision: 'none', severity: 'active',
    })).toBe(false);
  });

  it('names both views and says what is behind each', () => {
    const lines = picoCompanionWindowViewLines();
    expect(lines.map((line) => line.view)).toEqual([...picoCompanionWindowViews]);
    // A label alone is a guess; the detail is what makes the choice readable.
    for (const line of lines) {
      expect(line.label.length).toBeGreaterThan(0);
      expect(line.detail.length).toBeGreaterThan(line.label.length);
    }
  });

  it('has a read list for every view and no orphan reads', () => {
    // Two closed lists over one subject drift, so the pair is asserted.
    expect(Object.keys(picoCompanionViewReads).sort())
      .toEqual([...picoCompanionWindowViews].sort());
  });
});

describe('ADR 0138 CO3/CO4 - the words about money and about who learns', () => {
  const supplier = {
    identifier: 'a-library',
    kind: 'library',
    mayReachOutside: false,
    mayReachUnasked: false,
  };

  it('says an attached supplier that reaches nothing is not broken', () => {
    // Attached says this material may be here; it does not say Pico may go
    // and get it.
    const [line] = picoCompanionSupplierLines([supplier]);
    expect(line?.headline).toBe('a-library is attached and reaches nothing');
    expect(line?.detail).toContain('Nothing it holds costs you anything');
    expect(line?.detail).toContain('nobody learns you asked');
  });

  it('offers no unasked switch while reaching is off', () => {
    // CO4 cannot be granted without CO3 at all, and a greyed-out control
    // invites somebody to wonder what it would have done.
    expect(picoCompanionSupplierLines([supplier])[0]?.unaskedActionLabel).toBeUndefined();
    expect(picoCompanionSupplierLines([{ ...supplier, mayReachOutside: true }])[0]
      ?.unaskedActionLabel).toBe('Let it fetch without being asked');
  });

  it('carries the reason the second decision is a second decision', () => {
    /**
     * ADR 0138 CO4's own sentence, and the one this surface exists to say: an
     * answered question that cost money is visible to the person who asked,
     * and a background sweep is visible to nobody. A single "allow" control
     * would hide exactly that difference behind one word.
     */
    const [off] = picoCompanionSupplierLines([{ ...supplier, mayReachOutside: true }]);
    expect(off?.unaskedDetail).toContain('visible to you');
    expect(off?.unaskedDetail).toContain('visible to nobody');

    const [on] = picoCompanionSupplierLines([
      { ...supplier, mayReachOutside: true, mayReachUnasked: true },
    ]);
    expect(on?.headline).toContain('may do so on its own');
    expect(on?.unaskedDetail).toContain('You will not see those trips');
    expect(on?.unaskedActionLabel).toBe('Only when I ask');
  });

  it('says going out costs something, once it may', () => {
    const [line] = picoCompanionSupplierLines([{ ...supplier, mayReachOutside: true }]);
    expect(line?.detail).toContain('cost money');
    expect(line?.detail).toContain('learns that somebody asked');
  });

  it('refuses a supplier row that is missing what a line needs', () => {
    expect(() => parsePicoCompanionSuppliers([{ identifier: 'x' }]))
      .toThrow('invalid_pico_companion_supplier');
  });
});

describe('ADR 0143 DP1 - a depot asks the same two questions', () => {
  const depot = {
    remote: 'https://example.invalid/corpus.git',
    commit: 'a'.repeat(40),
    mayFetch: false,
    mayFetchUnasked: false,
  };

  it('names the material by where it lives and which revision', () => {
    // A person recognises a commit by its first characters or not at all, and
    // the whole thing crowds the line it is on.
    const [line] = picoCompanionDepotLines([depot]);
    expect(line?.headline).toContain('https://example.invalid/corpus.git at aaaaaaaaaaaa');
    expect(line?.headline).not.toContain('a'.repeat(40));
  });

  it('is identified by the remote, because that is what the decision names', () => {
    // The revision is in the words a person reads; the line's identity is what
    // gets sent back when they press something.
    expect(picoCompanionDepotLines([depot])[0]?.identifier).toBe(depot.remote);
  });

  it('asks the two fetch questions in the words a supplier uses', () => {
    // ADR 0136's supplier holds material and ADR 0143's depot holds what runs
    // - a distinction the tree needs and the money does not.
    const [off] = picoCompanionDepotLines([depot]);
    expect(off?.detail).toContain('nobody learns you asked');
    expect(off?.unaskedActionLabel).toBeUndefined();

    const [on] = picoCompanionDepotLines([{ ...depot, mayFetch: true }]);
    expect(on?.detail).toContain('cost money');
    expect(on?.unaskedDetail).toContain('visible to nobody');
  });

  it('refuses a depot row that is missing what a line needs', () => {
    expect(() => parsePicoCompanionDepots([{ remote: 'x' }]))
      .toThrow('invalid_pico_companion_depot');
  });
});
