import { picoDisplayDate } from '@pico/protocol/when-display';
import {
  picoCompanionEnrolmentStepLine,
  picoCompanionFoundingStepLine,
} from '@pico/companion/enrolment-steps';
import { picoDisplayFingerprint } from '@pico/protocol/fingerprint-display';
import { tmpdir } from 'node:os';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { picoPresenceAffordances } from '@pico/protocol/presence';
import {
  picoHomeContinuityReasonCategories,
  picoIdentityRevocationReasonCategories,
} from '@pico/protocol';
import {
  picoCompanionDeviceRevocationReasons,
  picoCompanionMachineOnlyRevocationReasons,
} from '@pico/companion/device-lifecycle';
import {
  picoCompanionFirstRunChoiceLines,
  picoCompanionFoundingDelegationDays,
  picoCompanionFoundingDelegationValidUntil,
  parsePicoCompanionFirstRunScanSource,
  parsePicoCompanionPresentation,
  parsePicoCompanionRecoveryCardSetupInput,
  picoCompanionIdlePresentation,
  picoCompanionIpcChannels,
  picoCompanionPresentationSymbol,
  picoCompanionRelayLines,
  picoCompanionRelayAccountIssued,
  parsePicoCompanionRelays,
  picoCompanionRelayRevocationLine,
  picoCompanionDeviceLines,
  parsePicoCompanionDevices,
  picoCompanionDeviceAuthorityEndedLine,
  picoCompanionDeviceAuthorityLines,
  picoCompanionDeviceAuthorityRenewedLine,
  picoCompanionDeviceAuthoritySummary,
  picoCompanionDeviceAuthorityUnavailable,
  picoCompanionDeviceRevocationReasonLines,
  picoCompanionEnrolmentValidUntil,
  picoCompanionHomeMemberAdmittedLine,
  picoCompanionHomeMemberLines,
  picoCompanionHomeMembersSummary,
  picoCompanionHostRotationLine,
  picoCompanionHostRotationReasonLines,
  picoCompanionHostRotationWarning,
  picoCompanionMembershipEndedLine,
  picoCompanionMembershipEndingLines,
  parsePicoCompanionHomeMembers,
  parsePicoCompanionDeviceAuthority,
  type PicoCompanionDeviceAuthorityView,
  picoCompanionViewReads,
  picoCompanionWindowViewLines,
  picoCompanionWindowViews,
  picoCompanionPresentationTakesTheWindow,
  picoCompanionSupplierLines,
  parsePicoCompanionSuppliers,
  picoCompanionDepotLines,
  parsePicoCompanionDepots,
  parsePicoCompanionUnattendedFetching,
  picoCompanionUnattendedFetchingLine,
  picoCompanionProviderProvesItself,
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
    expect(() => parsePicoCompanionPresentation({ ...valid, socketPath: join(tmpdir(), 'vault.sock') }))
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

  it('refuses a sign that is not the one its severity stands for', () => {
    const valid = picoCompanionIdlePresentation(new Date('2026-09-21T12:00:00Z'));
    // Every severity has exactly one sign, and every other sign is refused -
    // including the two that are weaker than the state they would stand for.
    const table = [
      { severity: 'active', symbol: '\u25cf' },
      { severity: 'warning', symbol: '!' },
      { severity: 'blocked', symbol: '\u00d7' },
    ] as const;
    for (const row of table) {
      expect(picoCompanionPresentationSymbol(row.severity)).toBe(row.symbol);
      expect(parsePicoCompanionPresentation({ ...valid, ...row }).symbol)
        .toBe(row.symbol);
      for (const wrong of ['\u25cf', '!', '\u00d7'].filter((s) => s !== row.symbol)) {
        expect(() => parsePicoCompanionPresentation({
          ...valid,
          severity: row.severity,
          symbol: wrong,
        })).toThrow('invalid_companion_presentation_symbol_binding');
      }
    }
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

/**
 * ADR 0151 PV1 - measuring a machine that will not answer without a credential.
 *
 * **The drift TypeScript cannot see.** The renderer declares the bridge it
 * expects and the preload implements one; they are two closed lists over one
 * subject and nothing type-checks the pair, which is the same reason the
 * channel names above are held by a text comparison rather than by memory. An
 * argument added on one side and forgotten on the other would leave the window
 * asking for a credential and the main process measuring without one.
 */
describe('ADR 0151 PV1 - the credential a measurement needs never crosses the window', () => {
  it('forwards the decision to ask, and never the secret', () => {
    const preload = readFileSync(join(import.meta.dirname, 'preload.cts'), 'utf8');
    // A boolean, not a credential: what crosses is that the person said this
    // machine asks Pico to prove itself.
    expect(preload).toContain('{ reach, model, provesItself }');

    const renderer = readFileSync(join(import.meta.dirname, 'renderer.ts'), 'utf8');
    expect(renderer).toContain('askModelProviderMeasurement(reach, model, measureProof.checked)');
    // **The window holds no input a credential could be typed into.** The
    // widening's does not either, and for the same reason: a renderer is the
    // one process here that a page could be persuaded to read.
    expect(renderer).not.toContain("requireInput('measure-credential')");
    expect(renderer).not.toContain("requireInput('measure-secret')");

    const main = readFileSync(join(import.meta.dirname, 'main.ts'), 'utf8');
    // Asked for in the same secure input a widening uses, one hop further in.
    expect(main).toContain('record.provesItself === true');
    expect(main).toContain('Nothing about it can be measured without one.');
  });

  it('says what happens next rather than naming a mechanism', () => {
    // ADR 0152. The sentence is a consequence: what this machine does, and
    // what Pico will do about it. A bearer, a header or a proxy are true and
    // none of them are what somebody is agreeing to.
    expect(picoCompanionProviderProvesItself).toContain('will not answer');
    expect(picoCompanionProviderProvesItself).toContain('seals it');
    for (const mechanism of ['bearer', 'header', 'proxy', 'token', 'TLS']) {
      expect(picoCompanionProviderProvesItself.toLowerCase())
        .not.toContain(mechanism.toLowerCase());
    }
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
    // Rendered in the main process, in the reader's own day. The window used
    // to cut the ISO string, which is the UTC day wearing no label.
    lastSeenDisplay: picoDisplayDate('2026-08-16T12:00:00.000Z'),
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
    expect(picoCompanionViewReads.now)
      .toEqual(['getRecalls', 'getAnsweredReads', 'getPendingActions']);
    expect(picoCompanionViewReads.settings).toEqual([
      'getModelProviders', 'getSuppliers', 'getDepots', 'getDevices', 'getRelays',
      'getModuleConsent',
    ]);
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

  it('stellt ein Angebot nur, wenn das Modul es stellt', () => {
    /**
     * ADR 0143 DP1. Das Zustandswort kommt aus dem Depot-Modul, weil dort die
     * Reihenfolge steht, in der ein Grund eine Folge überholt: ein
     * unerreichbares Depot zeigt kein Angebot, denn das Annehmen plante einen
     * Fetch, der nicht gelingen kann. Die Fläche entscheidet das nicht noch
     * einmal - sie liest das Wort.
     */
    const offering = {
      ...depot, mayFetch: true, state: 'offered', offeredCommit: 'b'.repeat(40),
    };
    expect(picoCompanionDepotLines([offering])[0]?.offer?.acceptedCommit)
      .toBe('b'.repeat(40));

    for (const state of ['running', 'unreachable', 'not_materialised', 'never_fetched']) {
      expect(picoCompanionDepotLines([{ ...offering, state }])[0]?.offer, state)
        .toBeUndefined();
    }
    // Und ohne Wort gar nichts: eine ältere Fassung des Homes, die keinen
    // Zustand mitschickt, darf keine Frage erfinden.
    expect(picoCompanionDepotLines([{ ...depot, offeredCommit: 'b'.repeat(40) }])[0]?.offer)
      .toBeUndefined();
  });

  it('nennt beide Enden und sagt, dass bis dahin nichts geschieht', () => {
    // Ein Angebot ändert nichts. Der Satz muss das sagen, sonst liest ihn
    // jemand als Meldung darüber, dass sich etwas geändert *hat*.
    const [line] = picoCompanionDepotLines([{
      ...depot, mayFetch: true, state: 'offered', offeredCommit: 'b'.repeat(40),
    }]);
    expect(line?.offer?.detail).toContain('bbbbbbbbbbbb');
    expect(line?.offer?.detail).toContain('keeps running aaaaaaaaaaaa');
    expect(line?.offer?.acceptActionLabel).toContain('bbbbbbbbbbbb');
    // In den Worten nie der volle Commit - eine Zeile, die 40 Zeichen trägt,
    // ist keine. Im `acceptedCommit` schon: das ist nicht, was jemand liest,
    // sondern das, wozu er zusagt, und eine gekürzte Zusage wäre keine.
    expect(line?.offer?.detail).not.toContain('b'.repeat(40));
    expect(line?.offer?.acceptActionLabel).not.toContain('b'.repeat(40));
    expect(line?.offer?.acceptedCommit).toBe('b'.repeat(40));
  });

  it('sagt beim Abschalten, was an die Stelle tritt, statt „verboten"', () => {
    /**
     * ADR 0140 RL4. Abwesend ist nicht `deny`: die Zustimmung sagt weiter,
     * dass ein Depot-Fetch stattfinden darf - er braucht dann wieder jemanden,
     * der gefragt werden kann. Ein Satz, der „verboten" sagte, beschriebe
     * einen Zustand, den es nicht gibt.
     */
    const off = picoCompanionUnattendedFetchingLine({
      effectName: 'depot.fetch', privacyDomain: 'private',
    });
    expect(off.allowing).toBe(false);
    expect(off.detail).toContain('while you are here');
    expect(off.detail).not.toMatch(/forbidden|not allowed|denied/iu);
    // Und er sagt, warum ein planmäßiger Lauf dann nichts tut - sonst liest
    // sich „ungefragt holen" an der Zeile darunter als Zusage.
    expect(off.detail).toContain('nobody to ask');

    const on = picoCompanionUnattendedFetchingLine({
      effectName: 'depot.fetch', privacyDomain: 'private', decision: 'allow',
    });
    expect(on.allowing).toBe(true);
    // Die Grenze reist mit: geholt wird der angenommene Commit, ein neuerer
    // wartet (ADR 0143 DP1).
    expect(on.detail).toContain('you accepted');
    expect(on.detail).toContain('newer one still waits');
    expect(on.actionLabel).not.toBe(off.actionLabel);
  });

  it('behandelt eine Regel, die nicht `allow` ist, wie keine', () => {
    // `require_approval` und `deny` sind Verschärfungen. Für die Frage „darf
    // ein Lauf ohne dich handeln?" ist beides ein Nein, und ein Schalter, der
    // bei `deny` „an" zeigte, wäre schlicht falsch.
    for (const decision of ['require_approval', 'deny'] as const) {
      expect(picoCompanionUnattendedFetchingLine({
        effectName: 'depot.fetch', privacyDomain: 'private', decision,
      }).allowing, decision).toBe(false);
    }
  });

  it('weist einen Lesevorgang zurück, der keine Domäne nennt', () => {
    // Ohne Domäne könnte das Fenster nur eine erfinden - und wäre damit die
    // zweite Stelle, an der steht, wo dieser Home entscheidet.
    expect(() => parsePicoCompanionUnattendedFetching({ depots: [] }))
      .toThrow('invalid_pico_companion_unattended_fetching');
    expect(() => parsePicoCompanionUnattendedFetching({
      unattendedFetching: { effectName: 'depot.fetch' },
    })).toThrow('invalid_pico_companion_unattended_fetching');
    expect(() => parsePicoCompanionUnattendedFetching({
      unattendedFetching: { effectName: 'depot.fetch', privacyDomain: 'private', decision: 'ja' },
    })).toThrow('invalid_pico_companion_unattended_fetching');
  });

  it('liest die Depotliste aus dem Lesevorgang, in dem sie jetzt steckt', () => {
    // Der Home antwortet mit beidem in einem Zug. Eine Liste, die daneben
    // nochmal reiste, wäre eine Wahrheit, die zweimal geschrieben wird.
    expect(parsePicoCompanionDepots({ depots: [depot] })).toHaveLength(1);
  });

  it('refuses a depot row that is missing what a line needs', () => {
    expect(() => parsePicoCompanionDepots([{ remote: 'x' }]))
      .toThrow('invalid_pico_companion_depot');
  });
});

describe('ADR 0130 E2 - the two situations a device with no Home can be in', () => {
  it('offers restoring first, whatever else it offers', () => {
    // Every situation that happens is offered; restoring comes first because
    // a person who already has a Pico is the one for whom the wrong choice
    // costs an identity they cannot get back to. ADR 0130 E3 added joining as
    // a third - the assertion is the order and the distinctness, not a count
    // that has to be edited every time a real situation is admitted.
    const choices = picoCompanionFirstRunChoiceLines().map((line) => line.choice);
    expect(choices[0]).toBe('restore');
    expect(new Set(choices).size).toBe(choices.length);
    expect(choices).toContain('found');
  });

  it('says what each one does to a Home, not what this codebase calls it', () => {
    const [restore, found] = picoCompanionFirstRunChoiceLines();
    expect(restore?.actionLabel).toBe('I have a Recovery Card');
    expect(found?.actionLabel).toBe('This Home is new');
    for (const line of picoCompanionFirstRunChoiceLines()) {
      expect(line.actionLabel.toLowerCase()).not.toContain('restore');
      expect(line.actionLabel.toLowerCase()).not.toContain('found');
    }
  });

  it('warns that restoring runs an objection window and founding takes a Home', () => {
    // The expensive halves, said before either happens: replacing devices is
    // stoppable and founding is not.
    const [restore, found] = picoCompanionFirstRunChoiceLines();
    expect(restore?.detail).toContain('objection window');
    expect(found?.detail).toContain('new identity');
    expect(found?.detail).toContain('one-time code');
  });

  it('words the ceremony\u2019s three moments for a window, not for a terminal', () => {
    /**
     * The CLI says "on the terminal holding the unlock", which is true there
     * and false here: a person in the Client has no terminal to look at, and
     * sending them to find one is the defect this function exists to avoid.
     */
    const steps = ['device_delegation', 'home_claim', 'founding_acceptance'] as const;
    const seen = steps.map((step) => picoCompanionFoundingStepLine(step));
    for (const line of seen) {
      expect(line.title).not.toBe('');
      expect(line.body.toLowerCase()).not.toContain('terminal');
      expect(line.title.toLowerCase()).toContain('approve');
    }
    expect(new Set(seen.map((line) => line.title)).size).toBe(3);
    expect(seen[2]?.body).toContain('last approval');
  });

  it('pins how long this device\u2019s first delegation is good for', () => {
    // Not asked, because a first run that opened with "how many days?" asks
    // somebody to decide a thing they have no way to have an opinion about.
    expect(picoCompanionFoundingDelegationValidUntil(new Date('2026-01-01T00:00:00.000Z')))
      .toBe('2027-01-01T00:00:00.000Z');
    expect(picoCompanionFoundingDelegationDays).toBe(365);
  });
});

describe('ADR 0130 E3 - which devices your Home answers to', () => {
  const view = (
    devices: readonly {
      delegationId: string;
      status: 'active' | 'not_yet_valid' | 'expired' | 'revoked';
      isThisDevice?: boolean;
      validUntil?: string;
      /**
       * What the main process counted before the row crossed. Given here
       * rather than derived from a `now` the test passes in, because that is
       * the shape the window sees: a number it was handed. The counting
       * itself is `picoCalendarDaysUntil`, tested where it lives.
       */
      daysRemaining?: number;
    }[],
    mayEndAuthority = true,
  ): PicoCompanionDeviceAuthorityView => ({
    mayEndAuthority,
    devices: devices.map((device, index) => ({
      // The shape a real one has, so "the sentence never shows the record's
      // id" is asserted against something that could actually appear in it.
      delegationId: `delegation_${device.delegationId.repeat(32)}`,
      presenceId: `device-${index}`,
      deviceSigningKeyFingerprintHex: `${index}`.repeat(64),
      status: device.status,
      validUntil: device.validUntil ?? '2027-01-01T00:00:00.000Z',
      validUntilDisplay: picoDisplayDate(
        device.validUntil ?? '2027-01-01T00:00:00.000Z',
      ),
      // Far enough away not to warn unless a test says otherwise.
      daysRemaining: device.daysRemaining ?? 365,
      isThisDevice: device.isThisDevice ?? false,
    })),
  });

  it('offers the reasons a person has, and names the ones it does not', () => {
    /**
     * ADR 0117 X1 over two closed lists. The protocol has five revocation
     * categories, a person is offered three, and the other two are named in
     * `device-lifecycle.ts` with why. A sixth category would otherwise appear
     * in neither and be silently unavailable - the drift this asserts against.
     */
    const offered = picoCompanionDeviceRevocationReasonLines().map((line) => line.reason);
    expect(offered).toEqual(['lost_device', 'suspected_compromise', 'device_retired']);
    /**
     * And the window's list is the companion's list. They are separate
     * because one carries sentences and the other is typed against the
     * protocol, which is two jobs - but a person offered a reason the
     * ceremony then refuses would be the drift that split buys.
     */
    expect(offered).toEqual([...picoCompanionDeviceRevocationReasons]);
    const machineOnly = Object.keys(picoCompanionMachineOnlyRevocationReasons);
    for (const category of picoIdentityRevocationReasonCategories) {
      expect(
        (offered as readonly string[]).includes(category)
        || machineOnly.includes(category),
      ).toBe(true);
    }
    expect(offered.length + machineOnly.length)
      .toBe(picoIdentityRevocationReasonCategories.length);
    // And each offered reason says something a person would say about a
    // machine, rather than repeating the protocol's word back at them.
    for (const line of picoCompanionDeviceRevocationReasonLines()) {
      expect(line.label).not.toContain('_');
      expect(line.label.startsWith('I ') || line.label.startsWith('Somebody')).toBe(true);
    }
  });

  it('says what each status means for the person, not for the record', () => {
    const lines = picoCompanionDeviceAuthorityLines(view([
      { delegationId: 'a', status: 'active', isThisDevice: true },
      { delegationId: 'b', status: 'expired', validUntil: '2026-05-01T00:00:00.000Z' },
      { delegationId: 'c', status: 'revoked' },
      { delegationId: 'd', status: 'not_yet_valid' },
    ]));
    expect(lines[0]?.headline).toBe('This device');
    expect(lines[1]?.headline).toBe('Another of your devices');
    /**
     * **Der Tag durch dieselbe Regel gelesen, die ihn schreibt.** Ein
     * abgeschriebenes `2027-01-01` ist das UTC-Datum ohne Etikett - genau das,
     * wovor `when-display.ts` warnt -, und westlich von UTC ist der Kalendertag
     * der Leserin ein anderer. Unter `TZ=Pacific/Niue` fiel diese Zeile um
     * (gemessen am 2026-08-27). Ein Test, der eine Regel nachbaut, prüft seine
     * eigene Nachbildung.
     */
    expect(lines[0]?.detail)
      .toBe(`It can act as you until ${picoDisplayDate('2027-01-01T00:00:00.000Z')}.`);
    // Wie oben: der Kalendertag der Leserin, nicht der von UTC.
    expect(lines[1]?.detail)
      .toContain(`ran out on ${picoDisplayDate('2026-05-01T00:00:00.000Z')}`);
    expect(lines[2]?.detail).toContain('You ended its authority');
    expect(lines[3]?.detail).toContain('cannot act as you yet');
    // Nothing anybody can end but the one that is still active.
    expect(lines.map((line) => line.endLabel !== null)).toEqual([true, false, false, false]);
    for (const line of lines) {
      expect(line.detail).not.toContain(line.delegationId);
    }
  });

  it('warns before an authority runs out, and says why it cannot wait', () => {
    /**
     * ADR 0104 pins a year, and renewal needs the delegation *active* - the
     * ceremony wants it and so does the Link request that carries it. A
     * device that lets its authority lapse cannot renew itself, which is why
     * this is a sentence rather than a colour.
     */
    const soon = picoCompanionDeviceAuthorityLines(view([
      { delegationId: 'a', status: 'active', validUntil: '2027-01-10T00:00:00.000Z', isThisDevice: true, daysRemaining: 9 },
      { delegationId: 'b', status: 'active', validUntil: '2027-01-10T00:00:00.000Z', daysRemaining: 9 },
      { delegationId: 'c', status: 'active', validUntil: '2027-06-01T00:00:00.000Z', daysRemaining: 151 },
    ]));
    expect(soon[0]?.expiryWarning).toContain('in 9 days');
    expect(soon[0]?.expiryWarning).toContain('cannot renew itself');
    // Another device is a different answer, and it is said rather than left
    // as a control that is missing: the ceremony needs that device's own key.
    expect(soon[1]?.expiryWarning).toContain('two screens');
    expect(soon[1]?.renewLabel).toBeNull();
    // A year away is not a warning.
    expect(soon[2]?.expiryWarning).toBeNull();

    const lapsed = picoCompanionDeviceAuthorityLines(view([
      { delegationId: 'a', status: 'active', isThisDevice: true, validUntil: '2027-01-01T00:00:00.000Z', daysRemaining: 0 },
    ]));
    expect(lapsed[0]?.expiryWarning).toContain('today');

    // Nothing to warn about on a row that already ended.
    expect(picoCompanionDeviceAuthorityLines(view([
      { delegationId: 'a', status: 'revoked' },
    ]))[0]?.expiryWarning).toBeNull();
  });

  it('offers the other renewal exactly where this device cannot renew itself', () => {
    /**
     * ADR 0130 E3. The device holding the identity key renews itself; one
     * that does not has to ask the device that added it, over the same three
     * codes. Measured against a running Home, that is the only path that
     * keeps such a device working - one whose year ran out can never be
     * enrolled again, and cannot make new keys without being wiped.
     */
    const delegated = picoCompanionDeviceAuthorityLines(view([
      { delegationId: 'a', status: 'active', isThisDevice: true },
      { delegationId: 'b', status: 'active' },
    ], false));
    expect(delegated[0]?.renewFromOtherDeviceLabel).toContain('your other one');
    expect(delegated[0]?.renewLabel).toBeNull();
    // Never on somebody else's row: that device asks for itself.
    expect(delegated[1]?.renewFromOtherDeviceLabel).toBeNull();

    // And never where this device can simply renew itself.
    const founder = picoCompanionDeviceAuthorityLines(view([
      { delegationId: 'a', status: 'active', isThisDevice: true },
    ]));
    expect(founder[0]?.renewFromOtherDeviceLabel).toBeNull();
    expect(founder[0]?.renewLabel).not.toBeNull();

    // The warning on another device now names the walk instead of a gap.
    const soon = picoCompanionDeviceAuthorityLines(view([
      { delegationId: 'b', status: 'active', validUntil: '2027-01-10T00:00:00.000Z', daysRemaining: 9 },
    ]));
    expect(soon[0]?.expiryWarning).toContain('holding the two screens up');
    expect(soon[0]?.expiryWarning).not.toContain('cannot do that yet');
  });

  it('offers renewal only where it can be done', () => {
    const own = picoCompanionDeviceAuthorityLines(view([
      { delegationId: 'a', status: 'active', isThisDevice: true },
      { delegationId: 'b', status: 'active' },
      { delegationId: 'c', status: 'expired', isThisDevice: true },
    ]));
    expect(own[0]?.renewLabel).toBe('Keep it working for another year');
    expect(own[1]?.renewLabel).toBeNull();
    expect(own[2]?.renewLabel).toBeNull();
    // And nowhere at all on a device that holds no identity key.
    expect(picoCompanionDeviceAuthorityLines(view([
      { delegationId: 'a', status: 'active', isThisDevice: true },
    ], false))[0]?.renewLabel).toBeNull();
    expect(picoCompanionDeviceAuthorityRenewedLine({
      validUntilDisplay: picoDisplayDate('2028-01-01T12:00:00.000Z'),
    })).toContain(picoDisplayDate('2028-01-01T12:00:00.000Z'));
  });

  it('warns on the two rows that lock somebody out, and on no others', () => {
    const only = picoCompanionDeviceAuthorityLines(view([
      { delegationId: 'a', status: 'active', isThisDevice: true },
    ]));
    expect(only[0]?.endWarning).toContain('only device');
    expect(only[0]?.endWarning).toContain('Recovery Card');

    const two = picoCompanionDeviceAuthorityLines(view([
      { delegationId: 'a', status: 'active', isThisDevice: true },
      { delegationId: 'b', status: 'active' },
    ]));
    expect(two[0]?.endWarning).toContain('device you are using');
    /**
     * The row a warning would be noise on. A caution under every control is
     * how a person learns to press through all of them, including the two
     * above.
     */
    expect(two[1]?.endWarning).toBeNull();
  });

  it('says once, at the top, when this device cannot end anything', () => {
    const summary = picoCompanionDeviceAuthoritySummary(view([
      { delegationId: 'a', status: 'active', isThisDevice: true },
      { delegationId: 'b', status: 'active' },
    ], false));
    expect(summary).toContain('Your Home answers to 2 devices.');
    // The fact and where the key is, rather than a permission error.
    expect(summary).toContain('identity key');
    expect(summary).toContain('founded your Home');
    expect(picoCompanionDeviceAuthoritySummary(view([
      { delegationId: 'a', status: 'active' },
      { delegationId: 'b', status: 'revoked' },
    ]))).toBe('Your Home answers to one device.');
    // No control anywhere below it, rather than controls that fail at the vault.
    expect(picoCompanionDeviceAuthorityLines(view([
      { delegationId: 'a', status: 'active' },
    ], false)).map((line) => line.endLabel)).toEqual([null]);
  });

  it('tells a count it does not have apart from a count of none', () => {
    // ADR 0118 O4, on the one row where being wrong is worst.
    expect(picoCompanionDeviceAuthorityEndedLine({
      endedThisDevice: true,
      activeDevicesLeft: null,
    })).toContain('can no longer ask your Home');
    expect(picoCompanionDeviceAuthorityEndedLine({
      endedThisDevice: false,
      activeDevicesLeft: null,
    })).toContain('could not ask your Home');
    expect(picoCompanionDeviceAuthorityEndedLine({
      endedThisDevice: false,
      activeDevicesLeft: 0,
    })).toContain('Recovery Card');
    expect(picoCompanionDeviceAuthorityEndedLine({
      endedThisDevice: false,
      activeDevicesLeft: 1,
    })).toBe('Ended. Your Home answers to one device now.');
    expect(picoCompanionDeviceAuthorityEndedLine({
      endedThisDevice: true,
      activeDevicesLeft: 2,
    })).toContain('it was this one');
    // A missing count never reads as none.
    expect(picoCompanionDeviceAuthorityEndedLine({
      endedThisDevice: true,
      activeDevicesLeft: null,
    })).not.toContain('no device');
  });

  it('refuses an authority answer it cannot read, rather than showing none', () => {
    expect(() => parsePicoCompanionDeviceAuthority({ devices: [] }))
      .toThrow('invalid_pico_companion_device_authority');
    expect(() => parsePicoCompanionDeviceAuthority({
      mayEndAuthority: true,
      devices: [{
        delegationId: 'a',
        presenceId: 'device-a',
        deviceSigningKeyFingerprintHex: 'ff',
        status: 'retired',
        validUntil: '2027-01-01T00:00:00.000Z',
        validUntilDisplay: picoDisplayDate('2027-01-01T00:00:00.000Z'),
        daysRemaining: 365,
        isThisDevice: false,
      }],
    })).toThrow('invalid_pico_companion_device_authority_row');
    expect(parsePicoCompanionDeviceAuthority({
      mayEndAuthority: false,
      devices: [{
        delegationId: 'a',
        presenceId: 'device-a',
        deviceSigningKeyFingerprintHex: 'ff',
        status: 'active',
        validUntil: '2027-01-01T00:00:00.000Z',
        validUntilDisplay: picoDisplayDate('2027-01-01T00:00:00.000Z'),
        daysRemaining: 365,
        isThisDevice: true,
      }],
    }).devices).toHaveLength(1);
    // The sentence for a read that did not come back says which question went
    // unanswered, and never that there is no authority.
    expect(picoCompanionDeviceAuthorityUnavailable).toContain('could not ask');
    expect(picoCompanionDeviceAuthorityUnavailable).not.toContain('no ');
  });
});

describe('ADR 0130 E3 - the words two devices are held up by', () => {
  const steps = [
    'read_offer', 'show_grant', 'read_acceptance', 'added',
    'show_offer', 'read_grant', 'show_acceptance', 'waiting', 'joined',
  ] as const;

  it('says which screen to look at, and never what the record is called', () => {
    const lines = steps.map((step) => picoCompanionEnrolmentStepLine(step));
    for (const line of lines) {
      expect(line.title).not.toBe('');
      expect(line.body).not.toBe('');
      for (const word of ['delegation', 'activation', 'evidence', 'ceremony', 'QR']) {
        expect(`${line.title} ${line.body}`.toLowerCase()).not.toContain(word.toLowerCase());
      }
    }
    // Nine moments, nine sentences: a repeated title is a person who cannot
    // tell whether anything happened.
    expect(new Set(lines.map((line) => line.title)).size).toBe(steps.length);
  });

  it('tells showing apart from reading, in the first words of each', () => {
    expect(picoCompanionEnrolmentStepLine('show_offer').title).toMatch(/^Show/u);
    expect(picoCompanionEnrolmentStepLine('show_acceptance').title).toMatch(/^Show/u);
    expect(picoCompanionEnrolmentStepLine('read_offer').title).toMatch(/^Read/u);
    expect(picoCompanionEnrolmentStepLine('read_grant').title).toMatch(/^Read/u);
    // And the two that end it say what is true afterwards rather than "done".
    expect(picoCompanionEnrolmentStepLine('added').body).toContain('keeps working');
    expect(picoCompanionEnrolmentStepLine('joined').body).toContain('keeps working');
  });

  it('offers joining as a third thing, not as a kind of restoring', () => {
    /**
     * The distinction the surface exists to make. Restoring replaces every
     * device with this one and runs an objection window; joining adds one and
     * leaves the others alone. A person who picked the wrong one would have
     * cut off the machine in their other hand.
     */
    const lines = picoCompanionFirstRunChoiceLines();
    expect(lines.map((line) => line.choice)).toEqual(['restore', 'found', 'join']);
    const join = lines[2]!;
    expect(join.detail).toContain('every device you already have keeps working');
    expect(join.actionLabel.toLowerCase()).not.toContain('recovery');
    expect(join.actionLabel.toLowerCase()).not.toContain('found');
    expect(new Set(lines.map((line) => line.actionLabel)).size).toBe(3);
  });

  it('pins a later device to the same year as the first one', () => {
    expect(picoCompanionEnrolmentValidUntil(new Date('2026-01-01T00:00:00.000Z')))
      .toBe('2027-01-01T00:00:00.000Z');
  });

  it('carries a code only on the two kinds that are about a code', () => {
    const qr = { size: 21, modules: Array.from({ length: 441 }, () => false) };
    const base = {
      severity: 'active' as const,
      symbol: '\u25cf' as const,
      decision: 'none' as const,
      title: 'Hold this up',
      body: 'The other device reads it.',
      observedAt: '2026-08-18T10:00:00.000Z',
    };
    expect(parsePicoCompanionPresentation({
      ...base, kind: 'device_code', code: { text: 'pico-device-offer-v1:AAAA', qr },
    }).code?.qr.size).toBe(21);
    // A matrix riding along on an alarm would be a second thing to draw that
    // nobody declared the meaning of.
    expect(() => parsePicoCompanionPresentation({
      ...base, kind: 'idle', code: { text: 'pico-device-offer-v1:AAAA', qr },
    })).toThrow('invalid_companion_presentation_code');
    // And the kind that is about a code must carry one.
    expect(() => parsePicoCompanionPresentation({ ...base, kind: 'device_code' }))
      .toThrow('invalid_companion_presentation_code');
    // A matrix whose modules do not fill it is not a code.
    expect(() => parsePicoCompanionPresentation({
      ...base,
      kind: 'device_code',
      code: { text: 'pico-device-offer-v1:AAAA', qr: { size: 21, modules: [true] } },
    })).toThrow('invalid_companion_presentation_code');
  });
});

describe('ADR 0130 E4 - the Home itself', () => {
  /**
   * What the main process does before a row crosses: the day a person reads
   * is derived from the instant, by the one rule, after any override the test
   * made. Deriving it in the literal above would let a test set `validUntil`
   * to one day and leave the display on another - a fixture that cannot
   * happen in the product is a test of nothing.
   */
  const rendered = <T extends { validUntil: string | null }>(row: T) => ({
    ...row,
    validUntilDisplay: row.validUntil === null
      ? null
      : picoDisplayDate(row.validUntil),
  });

  const member = (over: Partial<{
    membershipId: string;
    credentialId: string | null;
    picoIdentityFingerprintHex: string;
    picoIdentityDisplay: string;
    role: string;
    status: string;
    validUntil: string | null;
    isThisIdentity: boolean;
  }> = {}) => rendered({
    membershipId: 'member:home_1:ab',
    credentialId: `membership_${'a'.repeat(32)}`,
    picoIdentityFingerprintHex: 'ab'.repeat(32),
    // Shortened in the main process before it crosses, by the rule the core
    // owns - the window can no longer decide this for itself.
    picoIdentityDisplay: picoDisplayFingerprint('ab'.repeat(32)),
    role: 'home_member',
    status: 'active',
    validUntil: '2027-01-01T00:00:00.000Z',
    isThisIdentity: false,
    ...over,
  });

  it('offers every reason a Home\u2019s keys change, because all three are a person\u2019s', () => {
    /**
     * Unlike the revocation categories, none of ADR 0114's continuity reasons
     * belongs to machinery: new keys, a Home that moved, and a Home restored
     * from a backup are three situations somebody knows they are in.
     */
    expect(picoCompanionHostRotationReasonLines().map((line) => line.reason))
      .toEqual([...picoHomeContinuityReasonCategories]);
    for (const line of picoCompanionHostRotationReasonLines()) {
      expect(line.label).not.toContain('_');
      expect(line.label.toLowerCase()).not.toContain('host key');
    }
  });

  it('says what a rotation costs before it happens, and names the card', () => {
    expect(picoCompanionHostRotationWarning).toContain('Recovery Card');
    expect(picoCompanionHostRotationWarning).toContain('stops working');
    // And afterwards, in both outcomes, because a rotation this device could
    // not follow is not a rotation that did not happen.
    const followed = picoCompanionHostRotationLine({
      // Already shortened by the caller, and by the one rule the core owns -
      // this window and the notification about the same rotation used to
      // spell one key two ways.
      hostSigningKeyDisplay: picoDisplayFingerprint('cd'.repeat(32)),
      retiredHostSigningKeyFingerprintHex: 'ef'.repeat(32),
      repinned: true,
    });
    expect(followed.body).toContain('cdcdcdcd…cdcdcdcd');
    expect(followed.body).toContain('Recovery Card');
    const stranded = picoCompanionHostRotationLine({
      hostSigningKeyDisplay: picoDisplayFingerprint('ef'.repeat(32)),
      retiredHostSigningKeyFingerprintHex: 'ef'.repeat(32),
      repinned: false,
    });
    expect(stranded.body).toContain('could not follow');
    expect(stranded.body).not.toContain('did not');
  });

  it('says who lives here in what that means, not in credential fields', () => {
    const lines = picoCompanionHomeMemberLines([
      member({ isThisIdentity: true, role: 'home_host', validUntil: null, credentialId: null }),
      member(),
      member({ status: 'revoked' }),
      member({ validUntil: null }),
    ]);
    expect(lines[0]?.headline).toBe('You');
    expect(lines[0]?.detail).toContain('does not end');
    expect(lines[1]?.headline).toBe(`Another Pico (${picoDisplayFingerprint('ab'.repeat(32))})`);
    // Wie oben: der Kalendertag der Leserin, nicht der von UTC.
    expect(lines[1]?.detail)
      .toBe(`Lives here until ${picoDisplayDate('2027-01-01T00:00:00.000Z')}.`);
    // Five of the six statuses mean the same thing to somebody reading a list.
    expect(lines[2]?.detail).toContain('No longer lives here');
    expect(lines[3]?.detail).toContain('no end date');
  });

  it('counts the others, and says so when there are none', () => {
    expect(picoCompanionHomeMembersSummary([
      member({ isThisIdentity: true, validUntil: null, credentialId: null }),
    ])).toContain('Yours alone');
    expect(picoCompanionHomeMembersSummary([
      member({ isThisIdentity: true, validUntil: null, credentialId: null }),
      member(),
    ])).toBe('One other Pico may use this Home.');
    // A revoked row is not one of them.
    expect(picoCompanionHomeMembersSummary([
      member({ isThisIdentity: true, validUntil: null, credentialId: null }),
      member({ status: 'revoked' }),
    ])).toContain('Yours alone');
  });

  it('offers ending only on the rows something can end', () => {
    const lines = picoCompanionHomeMemberLines([
      member({ isThisIdentity: true, role: 'home_host', validUntil: null, credentialId: null }),
      member(),
      member({ status: 'revoked' }),
    ]);
    /**
     * The founder's row is the founding record, so there is nothing to end -
     * and a Home whose owner removed themselves would answer to nobody. A row
     * that has already ended gets no second control either.
     */
    expect(lines.map((line) => line.endLabel !== null)).toEqual([false, true, false]);
    expect(lines[1]?.credentialId).toBe(`membership_${'a'.repeat(32)}`);
  });

  it('asks why a membership ends, in two acts that are not the same', () => {
    const endings = picoCompanionMembershipEndingLines();
    expect(endings.map((line) => line.ending)).toEqual(['removed', 'security']);
    for (const line of endings) {
      // The vocabulary's words are the record's, not the person's.
      expect(line.label.toLowerCase()).not.toContain('revok');
      expect(line.label.toLowerCase()).not.toContain('evict');
    }
    // And the answer says which one it was, because the Home keeps that.
    expect(picoCompanionMembershipEndedLine({ status: 'evicted' }))
      .toContain('security matter');
    expect(picoCompanionMembershipEndedLine({ status: 'revoked' }))
      .toContain('Nothing was sent to them');
    expect(picoCompanionMembershipEndedLine({ status: 'revoked' }))
      .not.toBe(picoCompanionMembershipEndedLine({ status: 'evicted' }));
  });

  it('tells the person that nothing reached the Pico they admitted', () => {
    /**
     * A membership is given, not accepted: the subject signs nothing and
     * learns nothing from this. Somebody who was not told would wait for a
     * confirmation that is never coming.
     */
    const line = picoCompanionHomeMemberAdmittedLine({
      picoIdentityDisplay: picoDisplayFingerprint('ab'.repeat(32)),
      validUntilDisplay: picoDisplayDate('2027-01-01T12:00:00.000Z'),
    });
    expect(line).toContain('Nothing was sent to them');
    expect(line).toContain('tell them yourself');
    expect(line).toContain(picoDisplayDate('2027-01-01T12:00:00.000Z'));
  });

  it('refuses a member row that arrives without its rendered name', () => {
    /**
     * The window cannot shorten a fingerprint - it resolves relative paths
     * only, so it cannot reach the rule, and inventing a second one is how
     * one key came to have two names on one desktop. So the rendered form
     * arrives beside the hex, and a row without it is refused here rather
     * than filled in: a default would put the decision back in the window,
     * quietly, in the one place ADR 0113 C2 says it must not live.
     */
    const { picoIdentityDisplay: _omitted, ...withoutTheName } = member();
    expect(() => parsePicoCompanionHomeMembers([withoutTheName]))
      .toThrow('invalid_pico_companion_home_member');
    expect(parsePicoCompanionHomeMembers([member()])[0]?.picoIdentityDisplay)
      .toBe(picoDisplayFingerprint('ab'.repeat(32)));
  });

  it('reads a Home\u2019s own place in itself as endless, not as missing', () => {
    // ADR 0117 X1 the other way round: `null` here is a fact the Home states,
    // and a parser that refused it would refuse every founded Home.
    expect(parsePicoCompanionHomeMembers([member({ validUntil: null })])[0]?.validUntil)
      .toBeNull();
    expect(() => parsePicoCompanionHomeMembers([{ ...member(), validUntil: 7 }]))
      .toThrow('invalid_pico_companion_home_member');
    expect(() => parsePicoCompanionHomeMembers({}))
      .toThrow('invalid_pico_companion_home_members');
  });
});
