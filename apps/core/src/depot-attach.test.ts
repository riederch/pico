import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { picoDepotModuleManifest } from '@pico/module-depot/manifest';
import { PicoDepotWorkspace } from './depot-workspace.js';
import { EventStore } from './event-store.js';
import { openPicoHomeWithDevice, sendPicoLinkDirectRequest } from './test-claimed-home.js';

/**
 * ADR 0143 DP1 with ADR 0138 CO3/CO4, from the device the person holds.
 *
 * The Foundation route has attached depots since 2026-08-11 and refuses an
 * operator session, because whose corpus this is is not administration's to
 * answer. Until now that left the person's own device unable to answer it
 * either - and `setPicoDepotReach` had no caller at all, so an attached depot
 * could never be fetched from.
 */
const dirs: string[] = [];
const apps: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  for (const app of apps.splice(0)) {
    await app.close();
  }
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const commit = 'a'.repeat(40);

async function claimedHome() {
  const dir = mkdtempSync(join(tmpdir(), 'pico-depot-attach-'));
  dirs.push(dir);
  const databasePath = join(dir, 'pico.sqlite');
  const logLines: string[] = [];
  const app = await buildApp({
    host: '127.0.0.1',
    port: 0,
    databasePath,
    deviceId: 'pico-core',
    logDestination: new Writable({
      write(chunk: Buffer, _encoding, callback) {
        logLines.push(chunk.toString('utf8'));
        callback();
      },
    }),
  } as never) as unknown as {
    inject(request: { method: string; url: string }): Promise<{ json(): unknown }>;
    close(): Promise<void>;
  };
  apps.push(app);

  const moveInCode = logLines
    .map((line) => JSON.parse(line) as { picoHomeMoveInCode?: string })
    .find((line) => typeof line.picoHomeMoveInCode === 'string')!.picoHomeMoveInCode!;
  const setup = (await app.inject({ method: 'GET', url: '/api/home/setup' })).json() as {
    host: { signingKeyFingerprintHex: string; keyAgreementPublicKeyHex: string };
  };
  const { device, sealedClaim } = await openPicoHomeWithDevice(app as never, {
    moveInCode,
    idSuffix: 'depot_attach',
  });
  const send = async (operation: string, args: Record<string, unknown>) =>
    await sendPicoLinkDirectRequest(app as never, {
      operation: operation as never,
      args,
      sender: device,
      identityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
      hostSigningKeyFingerprintHex: setup.host.signingKeyFingerprintHex,
      hostKeyAgreementPublicKeyHex: setup.host.keyAgreementPublicKeyHex,
    });
  return { app, send, databasePath };
}

const remote = 'https://example.invalid/corpus.git';
const newer = 'b'.repeat(40);

/**
 * Was ein Fetch gelernt hat, ohne einen Fetch: die Zeile bekommt ihr Angebot
 * über dieselbe eine Tür, die das Produkt benutzt, und die Arbeitskopie wird
 * angelegt, weil `materialised` eine Tatsache über das Dateisystem ist, die
 * der Kern liest und dem Modul reicht.
 */
const aFetchSaw = async (databasePath: string, offeredCommit: string) => {
  mkdirSync(
    join(PicoDepotWorkspace.defaultRoot(databasePath), PicoDepotWorkspace.directoryName(remote)),
    { recursive: true },
  );
  const store = await EventStore.open(databasePath, {});
  store.recordPicoDepotFetchOutcome({
    remote,
    at: '2026-08-25T10:00:00.000Z',
    offeredCommit,
  } as never);
  store.close();
};

describe('ADR 0143 DP1 - attaching from the person\'s own device', () => {
  it('attaches at a commit and reaches nothing', async () => {
    const { send } = await claimedHome();
    const attached = await send('home.depot.attach', {
      remote: 'https://example.invalid/corpus.git',
      commit,
    });
    expect(attached.response.outcome).toBe('ok');
    // Attaching says this material may be here. It does not say Pico may go
    // and get it, and the answer says so rather than leaving it to be assumed.
    expect(attached.result).toMatchObject({ mayFetch: false, mayFetchUnasked: false });

    const listed = (await send('home.depots.read', {})).result as {
      depots: Array<Record<string, unknown>>;
    };
    expect(listed.depots).toEqual([{
      remote: 'https://example.invalid/corpus.git',
      commit,
      mayFetch: false,
      mayFetchUnasked: false,
      acceptedAt: expect.any(String),
      // ADR 0143 DP1: das Zustandswort des Moduls, das bis zum 2026-08-25
      // nirgendwo ankam. Nichts darf geholt werden, also ist auch nichts
      // geholt worden - und das erklärt alles andere.
      state: 'never_fetched',
    }]);
  });

  it('refuses a request to follow a ref as the thing it is', async () => {
    /**
     * ADR 0143 DP1: there is nowhere in a depot record to write a branch, a
     * tag or a channel, so "track main" is not a configuration this system can
     * express. A caller reaching for one is told that rather than told its
     * request was malformed - it is not a typo.
     */
    const { send } = await claimedHome();
    const following = await send('home.depot.attach', {
      remote: 'https://example.invalid/corpus.git',
      commit,
      branch: 'main',
    });
    expect(following.response.outcome).toBe('invalid_arguments');
    expect(following.result.refusal).toBe('pico_depot_cannot_follow_a_ref');

    // And a commit that is not one is its own refusal: a depot pinned to
    // something that can change under it is a different mistake from a
    // request to track something.
    expect((await send('home.depot.attach', {
      remote: 'https://example.invalid/corpus.git',
      commit: 'main',
    })).result.refusal).toBe('invalid_pico_depot_commit');
  });

  it('takes the two fetch decisions separately, and refuses the pair that hides one', async () => {
    const { send } = await claimedHome();
    await send('home.depot.attach', { remote: 'https://example.invalid/corpus.git', commit });

    expect((await send('home.depot.reach.decide', {
      remote: 'https://example.invalid/corpus.git',
      mayFetch: false,
      mayFetchUnasked: true,
    })).result.refusal).toBe('unasked_needs_fetching');

    expect((await send('home.depot.reach.decide', {
      remote: 'https://example.invalid/corpus.git',
      mayFetch: true,
      mayFetchUnasked: false,
    })).response.outcome).toBe('ok');

    const listed = (await send('home.depots.read', {})).result as {
      depots: Array<Record<string, unknown>>;
    };
    expect(listed.depots[0]).toMatchObject({ mayFetch: true, mayFetchUnasked: false });
  });

  it('refuses a decision about a depot nobody attached', async () => {
    const { send } = await claimedHome();
    expect((await send('home.depot.reach.decide', {
      remote: 'https://example.invalid/never.git',
      mayFetch: true,
      mayFetchUnasked: false,
    })).result.refusal).toBe('not_attached');
  });

  it('records the decision, content-free', async () => {
    const { app, send } = await claimedHome();
    await send('home.depot.attach', { remote: 'https://example.invalid/corpus.git', commit });
    await send('home.depot.reach.decide', {
      remote: 'https://example.invalid/corpus.git',
      mayFetch: true,
      mayFetchUnasked: true,
    });

    const events = (await app.inject({
      method: 'GET',
      url: '/api/events/tail?limit=40',
    })).json() as { events: Array<{ type: string; payload: Record<string, unknown> }> };
    const changed = events.events.filter(
      (event) => event.type === 'home.supplier_attachment_changed',
    );
    expect(changed).toHaveLength(1);
    expect(changed[0]?.payload).toEqual({
      identifier: 'https://example.invalid/corpus.git',
      mayReachOutside: true,
      mayReachUnasked: true,
    });
  });
});

describe('ADR 0143 DP1 - ein neuerer Commit wartet auf eine Person', () => {
  /**
   * Der Befund, aus dem das kam (Roadmap B22, 2026-08-25): der Fetch schrieb
   * das Angebot, `picoDepotState` konnte `offered` sagen, `acceptPicoDepotOffer`
   * war gebaut - und keine Operation erreichte eines davon. DP1s Zusage war
   * wahr über eine Datenbankzeile und nicht über ein Pico.
   */
  const offering = async () => {
    const home = await claimedHome();
    await home.send('home.depot.attach', { remote, commit });
    await home.send('home.depot.reach.decide', {
      remote, mayFetch: true, mayFetchUnasked: false,
    });
    await aFetchSaw(home.databasePath, newer);
    return home;
  };

  it('zeigt das Angebot und nimmt es an, wenn die Person seinen Commit nennt', async () => {
    const { send } = await offering();

    const before = ((await send('home.depots.read', {})).result as {
      depots: Array<Record<string, unknown>>;
    }).depots[0]!;
    expect(before.state).toBe('offered');
    expect(before.offeredCommit).toBe(newer);
    // Und der Pin steht noch da, wo er stand: ein Angebot ändert nichts.
    expect(before.commit).toBe(commit);

    const accepted = await send('home.depot.offer.accept', { remote, acceptedCommit: newer });
    expect(accepted.response.outcome).toBe('ok');
    expect(accepted.result).toEqual({ remote, commit: newer });

    const after = ((await send('home.depots.read', {})).result as {
      depots: Array<Record<string, unknown>>;
    }).depots[0]!;
    expect(after.commit).toBe(newer);
    // Ein angenommenes Angebot ist keins mehr. Bliebe es stehen, sagte die
    // Fläche „es gibt etwas Neues" über genau das, was gerade läuft.
    expect(after.state).toBe('running');
    expect(after.offeredCommit).toBeUndefined();
  });

  it('lehnt einen anderen Commit ab, statt das Neueste zu nehmen', async () => {
    /**
     * Der Unterschied zwischen „ich habe zugestimmt, diesen Code auszuführen"
     * und „ich habe zugestimmt, auszuführen, was gerade das Neueste war". Ein
     * Fetch, der zwischen der Frage und der Antwort landet, wird hier durch
     * Vergleich gefangen und nicht durch Reihenfolge geglaubt.
     */
    const { send, databasePath } = await offering();
    await aFetchSaw(databasePath, 'c'.repeat(40));

    const stale = await send('home.depot.offer.accept', { remote, acceptedCommit: newer });
    expect(stale.response.outcome).toBe('invalid_arguments');
    expect(stale.result.refusal).toBe('pico_depot_acceptance_mismatch');

    const after = ((await send('home.depots.read', {})).result as {
      depots: Array<Record<string, unknown>>;
    }).depots[0]!;
    expect(after.commit).toBe(commit);
  });

  it('antwortet ohne Angebot wie über ein Depot, das es nicht gibt', async () => {
    // ADR 0077 C4. Beide Male gibt es nichts anzunehmen, und ein Nein, das die
    // beiden Fälle unterscheidet, beantwortet die Frage „gibt es dieses Depot?".
    const { send } = await claimedHome();
    await send('home.depot.attach', { remote, commit });

    const noOffer = await send('home.depot.offer.accept', { remote, acceptedCommit: newer });
    const noDepot = await send('home.depot.offer.accept', {
      remote: 'https://example.invalid/never.git', acceptedCommit: newer,
    });
    expect(noOffer.result).toEqual(noDepot.result);
    expect(noOffer.result.refusal).toBe('no_offer_standing');
  });
});

/**
 * ADR 0140 RL4, Roadmap-Befund B22. Die Tabelle gab es seit dem 2026-08-11,
 * und niemand konnte sie erreichen: `setPicoRuleDecision` hatte außerhalb
 * seiner Tests keinen Aufrufer, `picoRuleDecisions` trug den Kommentar „for a
 * surface that shows them" neben einer Fläche, die es nicht gab, und
 * `home.rule_decision_changed` stand in beiden geschlossenen Ereignislisten,
 * ohne dass irgendetwas es anhängte.
 *
 * Der eine Leser einer Regel im ganzen Produkt ist der Depot-Sweep. Ohne
 * stehende Regel muss jeder Pfad einen Menschen finden - und ein planmäßiger
 * Lauf hat keinen.
 */
/**
 * Was die Person dem Depot-Modul zugesagt hat, in den Worten des Manifests -
 * eine Regel gilt nur über einen Effekt, dem jemand zugestimmt hat.
 */
const agreedToDepotEffects = async (databasePath: string) => {
  const store = await EventStore.open(databasePath, {});
  store.setPicoModuleActivation({
    changes: [{ identifier: 'depot', active: true, effects: picoDepotModuleManifest.effects }],
    decidedAt: '2026-08-25T08:00:00.000Z',
  } as never);
  store.close();
};

describe('ADR 0140 RL4 - was Pico ohne dich tun darf', () => {
  it('sagt beim Lesen, in welcher Domäne der Home das entscheidet', async () => {
    const { send } = await claimedHome();
    const read = (await send('home.depots.read', {})).result as {
      unattendedFetching: { effectName: string; privacyDomain: string; decision?: string };
    };
    // Die Domäne kommt vom Home. Ein Fenster, das sie mitschriebe, wäre die
    // zweite Stelle, an der sie steht - und die, die abweichen kann.
    expect(read.unattendedFetching.effectName).toBe('depot.fetch');
    expect(read.unattendedFetching.privacyDomain).toBe('private');
    // Nichts steht: abwesend ist nicht `deny`, sondern gar keine Regel.
    expect(read.unattendedFetching.decision).toBeUndefined();
  });

  it('zeichnet eine Regel auf, zeigt sie und nimmt sie wieder zurück', async () => {
    const { send, databasePath } = await claimedHome();
    await agreedToDepotEffects(databasePath);

    expect((await send('home.rule.decide', {
      effectName: 'depot.fetch', privacyDomain: 'private', decision: 'allow',
    })).response.outcome).toBe('ok');

    /**
     * Gesehen wird die Regel dort, wo sie wirkt - **es gibt keine allgemeine
     * Regelliste**, und das ist die Lehre desselben Tages: ADR 0138 CO1 hält
     * fest, dass ein zweiter ungenutzter Mechanismus schlechter ist als eine
     * benannte Lücke. Ein Vorgang, den kein Fenster liest, wäre genau das.
     */
    const standing = (await send('home.depots.read', {})).result as {
      unattendedFetching: { decision?: string };
    };
    expect(standing.unattendedFetching.decision).toBe('allow');

    expect((await send('home.rule.forget', {
      effectName: 'depot.fetch', privacyDomain: 'private',
    })).response.outcome).toBe('ok');

    // Zurückgenommen heißt: wieder keine Regel, nicht `deny`.
    const after = (await send('home.depots.read', {})).result as {
      unattendedFetching: { decision?: string };
    };
    expect(after.unattendedFetching.decision).toBeUndefined();
  });

  it('weist eine Regel über einen Effekt zurück, dem niemand zugestimmt hat', async () => {
    /**
     * Eine Regel über etwas, das kein Modul erklärt hat, spricht über nichts -
     * und sie stünde da, bis irgendwann ein Modul den Namen benutzt. Dann
     * gälte eine Entscheidung, die niemand über *diesen* Effekt getroffen hat.
     */
    const { send, databasePath } = await claimedHome();
    await agreedToDepotEffects(databasePath);
    const refused = await send('home.rule.decide', {
      effectName: 'depot.erfunden', privacyDomain: 'private', decision: 'allow',
    });
    expect(refused.response.outcome).toBe('invalid_arguments');
    expect(refused.result.refusal).toBe('effect_not_consented');
  });

  it('weist das Zurücknehmen einer Regel zurück, die nicht steht', async () => {
    // Sonst meldete ein Zurücknehmen Erfolg über etwas, das es nie gab.
    const { send } = await claimedHome();
    const nothing = await send('home.rule.forget', {
      effectName: 'depot.fetch', privacyDomain: 'private',
    });
    expect(nothing.response.outcome).toBe('invalid_arguments');
    expect(nothing.result.refusal).toBe('no_rule');
  });
});
