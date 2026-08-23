import { describe, expect, it } from 'vitest';
import { picoPresenceSchema } from '@pico/protocol/presence';
import {
  announcePicoCompanionPresence,
  picoCompanionAnnouncement,
  picoCompanionPresenceId,
} from './presence.js';
import type { PicoCompanionProfile } from './profile.js';

/**
 * ADR 0126 P2/P5. The desktop companion saying it is here - and the property
 * everything else rests on: an affordance is a fact, so it is observed.
 */
const profile = {
  device: { signingKeyFingerprintHex: 'ab'.repeat(32) },
} as unknown as PicoCompanionProfile;

const probe = (over: Partial<{ camera: boolean; printer: boolean }> = {}) => ({
  canScanWithCamera: () => over.camera ?? false,
  canPrint: () => over.printer ?? false,
});

describe('ADR 0126 P2 - what the companion declares', () => {
  it('declares only what the shell always offers when the machine offers nothing', () => {
    // A window, a notification and a field the renderer never sees are
    // properties of this shell rather than of the hardware.
    expect(picoCompanionAnnouncement({ profile, probe: probe() })).toEqual({
      schema: picoPresenceSchema,
      presenceId: picoCompanionPresenceId(profile),
      presenceType: 'desktop_companion',
      affordances: ['display', 'notification', 'secure_input'],
    });
  });

  it('adds a camera and a printer only when the machine has them', () => {
    /**
     * The whole reason there is a probe rather than a constant list.
     * Declaring `camera` on a machine with no camera would put a false
     * statement in the one field ADR 0126 insists is a statement of fact - and
     * the Core plans against those, so the lie returns as a plan that cannot
     * run.
     */
    expect(picoCompanionAnnouncement({ profile, probe: probe({ camera: true }) }).affordances)
      .toEqual(['camera', 'display', 'notification', 'secure_input']);
    expect(picoCompanionAnnouncement({ profile, probe: probe({ printer: true }) }).affordances)
      .toEqual(['display', 'notification', 'printer', 'secure_input']);
    expect(picoCompanionAnnouncement({
      profile,
      probe: probe({ camera: true, printer: true }),
    }).affordances).toEqual(['camera', 'display', 'notification', 'printer', 'secure_input']);
  });

  it('declares nothing about a sensor it does not have', () => {
    // `location` and `microphone` have no path in this runtime at all, and
    // ADR 0124's composite tier has no assets - declaring a tier nothing can
    // render is the same false fact one layer up.
    const every = picoCompanionAnnouncement({
      profile,
      probe: probe({ camera: true, printer: true }),
    }).affordances;
    expect(every).not.toContain('location');
    expect(every).not.toContain('microphone');
    expect(every).not.toContain('composite_tier');
  });

  it('names the device from what the Home already knows', () => {
    // Derived rather than generated and stored: a generated id is a second
    // identity for the device to lose, and losing it would make one machine
    // look like two.
    expect(picoCompanionPresenceId(profile)).toBe(`device-${'ab'.repeat(12)}`);
    /**
     * **Aus dem Signaturschlüssel und aus sonst nichts.** Hier stand bis zum
     * 2026-08-22 `expect(id(profile)).toBe(id(profile))` - eine Zeile, die
     * nicht fallen kann, solange die darüber hält, weil die den Wert exakt
     * festnagelt. Sie sah nach Sorgfalt aus und trug nichts.
     *
     * Was der Satz oben behauptet, ist etwas anderes: die Kennung ist
     * *abgeleitet*, nicht erzeugt. Also müssen zwei Profile, die sich in allem
     * außer dem Signaturschlüssel unterscheiden, dieselbe Kennung ergeben -
     * sonst hinge an ihr etwas, das ein Gerät wechseln kann, ohne ein anderes
     * zu werden.
     */
    const elsewhere = {
      device: {
        signingKeyFingerprintHex: 'ab'.repeat(32),
        keyAgreementKeyFingerprintHex: 'cd'.repeat(32),
        delegationId: 'delegation_somewhere_else',
      },
      identity: { keyFingerprintHex: 'ef'.repeat(32) },
      coreUrl: 'http://127.0.0.1:9999',
    } as unknown as PicoCompanionProfile;
    expect(picoCompanionPresenceId(elsewhere)).toBe(picoCompanionPresenceId(profile));
  });
});

describe('ADR 0126 P2 - announcing', () => {
  it('sends the announcement and reports the Home\'s refusal as itself', async () => {
    const sent: Array<{ operation: string; args: unknown }> = [];
    const client = {
      request: async (operation: string, args: unknown) => {
        sent.push({ operation, args });
        return { outcome: 'ok' as const, result: {} };
      },
    };
    expect(await announcePicoCompanionPresence({
      livingDeviceLinkClient: client as never,
      profile,
      probe: probe({ printer: true }),
    })).toEqual({ ok: true });
    expect(sent[0]?.operation).toBe('home.presence.announce');
    expect((sent[0]?.args as { affordances: string[] }).affordances).toContain('printer');

    const refusing = {
      request: async () => ({
        outcome: 'invalid_arguments' as const,
        result: { refusal: 'presence_quota_reached' },
      }),
    };
    expect(await announcePicoCompanionPresence({
      livingDeviceLinkClient: refusing as never,
      profile,
      probe: probe(),
    })).toEqual({ ok: false, refusal: 'presence_quota_reached' });
  });

  it('rebuilds the affordances on every announcement', async () => {
    // A printer unplugged an hour ago is a fact that changed, and a presence
    // repeating its first answer would keep the Home planning against a
    // machine that has moved on.
    let printer = true;
    const sent: Array<string[]> = [];
    const client = {
      request: async (_operation: string, args: unknown) => {
        sent.push((args as { affordances: string[] }).affordances);
        return { outcome: 'ok' as const, result: {} };
      },
    };
    const live = { canScanWithCamera: () => false, canPrint: () => printer };
    await announcePicoCompanionPresence({ livingDeviceLinkClient: client as never, profile, probe: live });
    printer = false;
    await announcePicoCompanionPresence({ livingDeviceLinkClient: client as never, profile, probe: live });

    expect(sent[0]).toContain('printer');
    expect(sent[1]).not.toContain('printer');
  });
});
