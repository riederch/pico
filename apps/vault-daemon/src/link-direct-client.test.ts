import {
  buildPicoIdentityKeyRecordSignatureInput,
  buildPicoLinkDirectRequestSignatureInput,
  buildPicoLinkDirectResponseSignatureInput,
  picoIdentitySuite,
  picoLinkDirectPayloadDigestHex,
  picoLinkDirectRequestEnvelopeSchema,
  picoLinkDirectRequestSignatureInputLabel,
  picoLinkDirectResponseEnvelopeSchema,
  type PicoIdentityKeyRecordSignatureInput,
  type PicoLinkDirectRequestSignatureInput,
  type PicoLinkDirectSealedRequest,
  type PicoLinkDirectResponseSignatureInput,
} from '@pico/protocol';
import type { VaultSodium } from '@pico/vault';
import sodium from 'libsodium-wrappers-sumo';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { PicoVaultDaemonClient } from './client.js';
import {
  createPicoLinkDirectClient,
  MAX_PICO_LINK_DIRECT_CLIENT_RESPONSE_CHARS,
  PICO_LINK_DIRECT_CLIENT_REQUEST_LIFETIME_MS,
  picoLinkDirectAnswerBoundMs,
  type PicoLinkDirectHostPin,
  type PicoLinkDirectSender,
} from './link-direct-client.js';

let vaultSodium: VaultSodium;

beforeAll(async () => {
  await sodium.ready;
  vaultSodium = sodium as unknown as VaultSodium;
});

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

function unhex(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, 'hex'));
}

function keyRecord(
  keyRole: PicoIdentityKeyRecordSignatureInput['keyRole'],
  publicKey: Uint8Array,
): PicoIdentityKeyRecordSignatureInput {
  return { suite: picoIdentitySuite, keyRole, publicKeyHex: hex(publicKey) };
}

function fingerprint(record: PicoIdentityKeyRecordSignatureInput): string {
  return hex(sodium.crypto_generichash(
    32,
    buildPicoIdentityKeyRecordSignatureInput(record),
    null,
  ));
}

function fixture() {
  const hostSigning = sodium.crypto_sign_keypair();
  const hostAgreement = sodium.crypto_box_keypair();
  const identity = sodium.crypto_sign_keypair();
  const deviceSigning = sodium.crypto_sign_keypair();
  const deviceAgreement = sodium.crypto_box_keypair();

  const host: PicoLinkDirectHostPin = {
    signingPublicKeyHex: hex(hostSigning.publicKey),
    signingKeyFingerprintHex: fingerprint(keyRecord('home_host_signing', hostSigning.publicKey)),
    keyAgreementPublicKeyHex: hex(hostAgreement.publicKey),
    keyAgreementKeyFingerprintHex: fingerprint(
      keyRecord('home_host_key_agreement', hostAgreement.publicKey),
    ),
  };
  const sender: PicoLinkDirectSender = {
    identityKeyFingerprintHex: fingerprint(keyRecord('pico_identity', identity.publicKey)),
    deviceSigningKeyFingerprintHex: fingerprint(
      keyRecord('device_signing', deviceSigning.publicKey),
    ),
    deviceKeyAgreementKeyFingerprintHex: fingerprint(
      keyRecord('device_key_agreement', deviceAgreement.publicKey),
    ),
    delegationId: 'delegation_link_client_0001',
  };
  const sign = vi.fn(async (input: {
    keyFingerprintHex: string;
    label: string;
    fields: Record<string, unknown>;
  }) => {
    expect(input.label).toBe(picoLinkDirectRequestSignatureInputLabel);
    expect(input.keyFingerprintHex).toBe(sender.deviceSigningKeyFingerprintHex);
    return {
      keyRole: 'device_signing' as const,
      keyFingerprintHex: sender.deviceSigningKeyFingerprintHex,
      signatureHex: hex(sodium.crypto_sign_detached(
        buildPicoLinkDirectRequestSignatureInput(
          input.fields as unknown as PicoLinkDirectRequestSignatureInput,
        ),
        deviceSigning.privateKey,
      )),
    };
  });
  const daemonClient = {
    status: async () => ({
      locked: false,
      keyfiles: [],
      sessions: [
        {
          keyRole: 'pico_identity' as const,
          keyFingerprintHex: sender.identityKeyFingerprintHex,
          publicKeyHex: hex(identity.publicKey),
        },
        {
          keyRole: 'device_signing' as const,
          keyFingerprintHex: sender.deviceSigningKeyFingerprintHex,
          publicKeyHex: hex(deviceSigning.publicKey),
        },
      ],
    }),
    sign,
  } as unknown as PicoVaultDaemonClient;

  return {
    host,
    sender,
    hostSigning,
    hostAgreement,
    deviceSigning,
    daemonClient,
    sign,
  };
}

function answeringFetch(input: {
  host: PicoLinkDirectHostPin;
  hostSigning: { publicKey: Uint8Array; privateKey: Uint8Array };
  hostAgreement: { publicKey: Uint8Array; privateKey: Uint8Array };
  deviceSigning: { publicKey: Uint8Array; privateKey: Uint8Array };
  mutateResponse?: (response: PicoLinkDirectResponseSignatureInput) => void;
  replyKeys?: string[];
}): typeof fetch {
  return (async (_url: URL | RequestInfo, init?: RequestInit) => {
    const envelope = JSON.parse(String(init?.body)) as {
      schema: string;
      sealedRequestHex: string;
    };
    expect(envelope.schema).toBe(picoLinkDirectRequestEnvelopeSchema);
    const opened = JSON.parse(new TextDecoder().decode(sodium.crypto_box_seal_open(
      unhex(envelope.sealedRequestHex),
      input.hostAgreement.publicKey,
      input.hostAgreement.privateKey,
    ))) as PicoLinkDirectSealedRequest;
    expect(opened.schema).toBe(picoLinkDirectRequestEnvelopeSchema);
    expect(sodium.crypto_sign_verify_detached(
      unhex(opened.senderSignatureHex),
      buildPicoLinkDirectRequestSignatureInput(opened.request),
      input.deviceSigning.publicKey,
    )).toBe(true);
    input.replyKeys?.push(opened.request.replyPublicKeyHex);

    const result = { accepted: true, echo: opened.arguments };
    const response: PicoLinkDirectResponseSignatureInput = {
      suite: picoIdentitySuite,
      requestId: opened.request.requestId,
      operation: opened.request.operation,
      hostSigningKeyFingerprintHex: input.host.signingKeyFingerprintHex,
      outcome: 'ok',
      resultDigestHex: picoLinkDirectPayloadDigestHex(sodium, result),
      createdAt: '2026-07-29T12:00:01.000Z',
    };
    input.mutateResponse?.(response);
    const hostSignatureHex = hex(sodium.crypto_sign_detached(
      buildPicoLinkDirectResponseSignatureInput(response),
      input.hostSigning.privateKey,
    ));
    const sealedResponseHex = hex(sodium.crypto_box_seal(
      new TextEncoder().encode(JSON.stringify({
        schema: picoLinkDirectResponseEnvelopeSchema,
        response,
        result,
        hostSignatureHex,
      })),
      unhex(opened.request.replyPublicKeyHex),
    ));

    return new Response(JSON.stringify({
      schema: picoLinkDirectResponseEnvelopeSchema,
      sealedResponseHex,
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

/**
 * Oeffnet die versiegelte Anfrage so, wie das Home es taete - fuer die Faelle,
 * in denen die Attrappe den Antwortschluessel braucht, um etwas Falsches
 * dorthin zu versiegeln.
 */
function openSealedRequest(input: {
  hostAgreement: { publicKey: Uint8Array; privateKey: Uint8Array };
}, init: RequestInit | undefined): PicoLinkDirectSealedRequest {
  const envelope = JSON.parse(String(init?.body)) as { sealedRequestHex: string };
  return JSON.parse(new TextDecoder().decode(sodium.crypto_box_seal_open(
    unhex(envelope.sealedRequestHex),
    input.hostAgreement.publicKey,
    input.hostAgreement.privateKey,
  ))) as PicoLinkDirectSealedRequest;
}

/** Eine 200-Antwort mit genau diesem Rumpf. */
function answering(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Pico Link direct client (ADR 0107 D3)', () => {
  it('pins both host keys and verifies a signed response bound to the request', async () => {
    const f = fixture();
    const replyKeys: string[] = [];
    const client = await createPicoLinkDirectClient({
      sodium: vaultSodium,
      daemonClient: f.daemonClient,
      coreUrl: 'http://carrier.invalid/reachable',
      host: f.host,
      sender: f.sender,
      fetch: answeringFetch({ ...f, replyKeys }),
      now: () => new Date('2026-07-29T12:00:00.000Z'),
    });

    await expect(client.request('home.authority.submit', {
      resource: 'reader_custody_domain',
      record: { domainId: 'family' },
    })).resolves.toEqual({
      outcome: 'ok',
      result: {
        accepted: true,
        echo: {
          resource: 'reader_custody_domain',
          record: { domainId: 'family' },
        },
      },
    });
    await client.request('home.authority.list', { resource: 'home_state' });

    expect(f.sign).toHaveBeenCalledTimes(2);
    expect(replyKeys).toHaveLength(2);
    expect(replyKeys[0]).not.toBe(replyKeys[1]);
  });

  /**
   * Befund B156. Vier Ablehnungen dieser Tuer hatte nie jemand ausgeloest, und
   * es ist die Tuer, an der ein Geraet entscheidet, ob die Antwort seines
   * Homes echt ist. Jede von ihnen sagt etwas anderes: der Umschlag ist keiner,
   * er laesst sich nicht oeffnen, der Inhalt hat die falsche Form, die
   * Unterschrift stimmt nicht. Wer sie zusammenwirft, kann einen Angriff nicht
   * von einem defekten Home unterscheiden.
   */
  it('refuses an envelope that is not a direct-link response', async () => {
    const f = fixture();
    const client = await createPicoLinkDirectClient({
      sodium: vaultSodium,
      daemonClient: f.daemonClient,
      coreUrl: 'http://carrier.invalid/reachable',
      host: f.host,
      sender: f.sender,
      fetch: (async () => answering({
        schema: 'pico.link.something-else.v1',
        sealedResponseHex: '00'.repeat(48),
      })) as typeof fetch,
      now: () => new Date('2026-07-29T12:00:00.000Z'),
    });
    await expect(client.request('home.authority.list', { resource: 'home_state' }))
      .rejects.toThrow('link_invalid_response_envelope');
  });

  it('refuses a sealed response it cannot open', async () => {
    const f = fixture();
    const client = await createPicoLinkDirectClient({
      sodium: vaultSodium,
      daemonClient: f.daemonClient,
      coreUrl: 'http://carrier.invalid/reachable',
      host: f.host,
      sender: f.sender,
      // Richtiger Umschlag, aber versiegelt an jemand anderen.
      fetch: (async () => answering({
        schema: picoLinkDirectResponseEnvelopeSchema,
        sealedResponseHex: hex(sodium.crypto_box_seal(
          new TextEncoder().encode('{}'),
          sodium.crypto_box_keypair().publicKey,
        )),
      })) as typeof fetch,
      now: () => new Date('2026-07-29T12:00:00.000Z'),
    });
    await expect(client.request('home.authority.list', { resource: 'home_state' }))
      .rejects.toThrow('link_response_unreadable');
  });

  it('refuses a payload that opens but is not a response', async () => {
    const f = fixture();
    const client = await createPicoLinkDirectClient({
      sodium: vaultSodium,
      daemonClient: f.daemonClient,
      coreUrl: 'http://carrier.invalid/reachable',
      host: f.host,
      sender: f.sender,
      fetch: (async (_url: URL | RequestInfo, init?: RequestInit) => {
        const opened = openSealedRequest(f, init);
        return answering({
          schema: picoLinkDirectResponseEnvelopeSchema,
          sealedResponseHex: hex(sodium.crypto_box_seal(
            // Oeffenbar, aber ohne `result` und ohne Unterschrift.
            new TextEncoder().encode(JSON.stringify({
              schema: picoLinkDirectResponseEnvelopeSchema,
              response: {},
            })),
            unhex(opened.request.replyPublicKeyHex),
          )),
        });
      }) as typeof fetch,
      now: () => new Date('2026-07-29T12:00:00.000Z'),
    });
    await expect(client.request('home.authority.list', { resource: 'home_state' }))
      .rejects.toThrow('link_invalid_response_payload');
  });

  it('refuses a response signed by a key that is not the pinned host', async () => {
    const f = fixture();
    const stranger = sodium.crypto_sign_keypair();
    const client = await createPicoLinkDirectClient({
      sodium: vaultSodium,
      daemonClient: f.daemonClient,
      coreUrl: 'http://carrier.invalid/reachable',
      host: f.host,
      sender: f.sender,
      // Alles stimmt - Bindung, Digest, Form -, nur die Unterschrift ist von
      // jemand anderem. Das trennt diese Ablehnung von der Bindungspruefung.
      fetch: answeringFetch({ ...f, hostSigning: stranger }),
      now: () => new Date('2026-07-29T12:00:00.000Z'),
    });
    await expect(client.request('home.authority.list', { resource: 'home_state' }))
      .rejects.toThrow('link_invalid_host_signature');
  });

  it('uses a supplied public identity key without requiring the root to be unlocked', async () => {
    const f = fixture();
    const status = await f.daemonClient.status();
    const identity = status.sessions.find((session) => session.keyRole === 'pico_identity')!;
    f.sender.identityPublicKeyHex = identity.publicKeyHex;
    f.daemonClient.status = async () => ({
      ...status,
      sessions: status.sessions.filter((session) => session.keyRole !== 'pico_identity'),
    });
    const client = await createPicoLinkDirectClient({
      sodium: vaultSodium,
      daemonClient: f.daemonClient,
      coreUrl: 'http://carrier.invalid/reachable',
      host: f.host,
      sender: f.sender,
      fetch: answeringFetch(f),
      now: () => new Date('2026-07-29T12:00:00.000Z'),
    });

    await expect(client.request('home.device.lifecycle.read', {}))
      .resolves.toMatchObject({ outcome: 'ok' });
  });

  it('rejects a supplied identity public key that does not match its fingerprint', async () => {
    const f = fixture();
    const other = sodium.crypto_sign_keypair();
    f.sender.identityPublicKeyHex = hex(other.publicKey);

    await expect(createPicoLinkDirectClient({
      sodium: vaultSodium,
      daemonClient: f.daemonClient,
      coreUrl: 'http://carrier.invalid/reachable',
      host: f.host,
      sender: f.sender,
    })).rejects.toThrow('link_identity_key_fingerprint_mismatch');
    expect(f.sign).not.toHaveBeenCalled();
  });

  it('rejects a public key that does not match the pinned host fingerprint before IPC or network', async () => {
    const f = fixture();
    const other = sodium.crypto_sign_keypair();
    const requestFetch = vi.fn();

    await expect(createPicoLinkDirectClient({
      sodium: vaultSodium,
      daemonClient: f.daemonClient,
      coreUrl: 'http://carrier.invalid',
      host: { ...f.host, signingPublicKeyHex: hex(other.publicKey) },
      sender: f.sender,
      fetch: requestFetch,
    })).rejects.toThrow('host_key_fingerprint_mismatch');
    expect(f.sign).not.toHaveBeenCalled();
    expect(requestFetch).not.toHaveBeenCalled();
  });

  it('rejects a response moved to another request even when the host signature is valid', async () => {
    const f = fixture();
    const client = await createPicoLinkDirectClient({
      sodium: vaultSodium,
      daemonClient: f.daemonClient,
      coreUrl: 'http://carrier.invalid',
      host: f.host,
      sender: f.sender,
      fetch: answeringFetch({
        ...f,
        mutateResponse: (response) => {
          response.requestId = 'linkreq_from_another_request';
        },
      }),
      now: () => new Date('2026-07-29T12:00:00.000Z'),
    });

    await expect(client.request('home.setup.read', {}))
      .rejects.toThrow('link_response_binding_mismatch');
  });

  it('surfaces a bare pre-authentication intake refusal without retrying', async () => {
    const f = fixture();
    const requestFetch = vi.fn(async () => new Response(
      JSON.stringify({ error: 'wrong_home' }),
      { status: 400 },
    )) as unknown as typeof fetch;
    const client = await createPicoLinkDirectClient({
      sodium: vaultSodium,
      daemonClient: f.daemonClient,
      coreUrl: 'http://carrier.invalid',
      host: f.host,
      sender: f.sender,
      fetch: requestFetch,
    });

    await expect(client.request('home.setup.read', {}))
      .rejects.toThrow('link_rejected:400:wrong_home');
    expect(requestFetch).toHaveBeenCalledTimes(1);
  });

  /**
   * ADR 0131 A7. Ein Home, das nicht antwortet, war der einzige Fehlschlag in
   * diesem Client ohne Namen - er warf durch, was die Plattform gerade sagte.
   * Auf einem Telefon ist er der häufigste, weil es das Haus verlässt.
   */
  it('names a Home that did not answer, and carries the reason for a diagnosis', async () => {
    const f = fixture();
    const refused = Object.assign(new Error('fetch failed'), {
      cause: { code: 'ECONNREFUSED' },
    });
    const requestFetch = vi.fn(async () => {
      throw refused;
    }) as unknown as typeof fetch;
    const client = await createPicoLinkDirectClient({
      sodium: vaultSodium,
      daemonClient: f.daemonClient,
      coreUrl: 'http://carrier.invalid',
      host: f.host,
      sender: f.sender,
      fetch: requestFetch,
    });

    await expect(client.request('home.setup.read', {}))
      .rejects.toThrow('link_home_did_not_answer:ECONNREFUSED');
  });

  it('gibt ein schweigendes Home auf, statt für immer zu warten', async () => {
    /**
     * Roadmap-Befund B21. Ein Home, das *ablehnt*, meldet sich sofort - der
     * Test darüber. Ein Home, das *schweigt*, ließ jeden Aufrufer hängen: der
     * Alarm-Carrier auf dem Desktop, ein Vordergrunddienst auf dem Telefon.
     * Eine Prüfung, die hängt, sagt nie „dein Home antwortet nicht".
     *
     * Mit gestellter Uhr gemessen, damit die Grenze selbst geprüft wird und
     * nicht nur, dass irgendwann etwas geschieht: eine Sekunde davor wartet
     * die Anfrage noch.
     */
    vi.useFakeTimers();
    try {
      const f = fixture();
      const requestFetch = vi.fn(async (_url: unknown, init: { signal?: AbortSignal }) =>
        await new Promise<never>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(init.signal?.reason as Error);
          });
        })) as unknown as typeof fetch;
      const client = await createPicoLinkDirectClient({
        sodium: vaultSodium,
        daemonClient: f.daemonClient,
        coreUrl: 'http://carrier.invalid',
        host: f.host,
        sender: f.sender,
        fetch: requestFetch,
      });

      const asked = client.request('home.setup.read', {});
      const settled = vi.fn();
      void asked.then(settled, settled);

      await vi.advanceTimersByTimeAsync(PICO_LINK_DIRECT_CLIENT_REQUEST_LIFETIME_MS - 1_000);
      expect(settled).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1_000);
      await expect(asked).rejects.toThrow('link_home_did_not_answer:timed_out');
    } finally {
      vi.useRealTimers();
    }
  });

  it('gibt auch ein Home auf, das Kopfzeilen schickt und dann verstummt', async () => {
    /**
     * Der Fall, der beim ersten Anlauf durchrutschte: der Wecker wurde
     * gelöscht, sobald die Antwort *begann*. Ein Home, das antwortet und den
     * Rumpf nie zu Ende schickt, hing damit wieder für immer - während der
     * Kommentar danebenstand, dieser Fall sei gedeckt.
     */
    vi.useFakeTimers();
    try {
      const f = fixture();
      const requestFetch = vi.fn(async (_url: unknown, init: { signal?: AbortSignal }) => ({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        // Kopfzeilen sofort, Rumpf nie - und der Strom bricht ab, wenn das
        // Signal fällt, wie es ein echtes `fetch` tut.
        body: new ReadableStream({
          start(controller) {
            init.signal?.addEventListener('abort', () => {
              controller.error(init.signal?.reason as Error);
            });
          },
        }),
      })) as unknown as typeof fetch;
      const client = await createPicoLinkDirectClient({
        sodium: vaultSodium,
        daemonClient: f.daemonClient,
        coreUrl: 'http://carrier.invalid',
        host: f.host,
        sender: f.sender,
        fetch: requestFetch,
      });

      const asked = client.request('home.setup.read', {});
      const settled = vi.fn();
      void asked.then(settled, settled);

      await vi.advanceTimersByTimeAsync(PICO_LINK_DIRECT_CLIENT_REQUEST_LIFETIME_MS - 1_000);
      expect(settled).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1_000);
      await expect(asked).rejects.toThrow('link_home_did_not_answer:timed_out');
    } finally {
      vi.useRealTimers();
    }
  });

  it('wartet auf eine Freigabe länger, weil sie ihre Arbeit im Request tut', () => {
    /**
     * `home.action.approval.resolve` führt bei einer Depot-Freigabe
     * `fetchPicoDepot` aus, und das ruft `git` mit 120 s je Aufruf. Dreißig
     * Sekunden schnitten hier eine Freigabe ab, die gerade tut, was die Person
     * wollte - und ein Abschneiden mitten in einer Freigabe sagt der Person
     * nicht, ob sie geschehen ist.
     */
    expect(picoLinkDirectAnswerBoundMs('home.action.approval.resolve'))
      .toBeGreaterThan(2 * 120_000);
    // Und der gewöhnliche Fall ist die Lebensdauer des Umschlags selbst, keine
    // zweite Zahl daneben: länger zu warten hieße, auf die Antwort zu einer
    // Anfrage zu warten, die das Home als abgelaufen zurückwiese.
    expect(picoLinkDirectAnswerBoundMs('home.setup.read'))
      .toBe(PICO_LINK_DIRECT_CLIENT_REQUEST_LIFETIME_MS);
  });

  it('nennt eine zu große Antwort weiterhin zu groß und nicht ausbleibend', async () => {
    // Ein Home, das zu viel sagt, ist nicht eines, das nichts sagt. Der neue
    // Umschlag um den Rumpf darf nur das Schweigen umbenennen.
    const f = fixture();
    const requestFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-length': String(64 * 1024 * 1024) }),
      text: async () => '',
      body: null,
    })) as unknown as typeof fetch;
    const client = await createPicoLinkDirectClient({
      sodium: vaultSodium,
      daemonClient: f.daemonClient,
      coreUrl: 'http://carrier.invalid',
      host: f.host,
      sender: f.sender,
      fetch: requestFetch,
    });

    // Genau, nicht enthalten: `toThrow` prüft auf Teilzeichenkette, und
    // `link_home_did_not_answer:link_response_too_large` enthält den gesuchten
    // Text - die lockere Fassung dieses Tests ließ genau die Umbenennung
    // durch, gegen die er geschrieben ist (gefunden beim Pflanzen, 2026-08-25).
    await expect(client.request('home.setup.read', {}))
      .rejects.toThrow(/^link_response_too_large$/u);
  });

  it('falls back to the message when a transport failure carries no code', async () => {
    // Nicht jede Laufzeit hängt einen `cause.code` an - nodejs-mobile auf dem
    // Telefon meldet manches nur als Text. Ein Name ohne Grund ist immer noch
    // ein Name; ein Name, der bei fehlendem Grund verschwindet, wäre keiner.
    const f = fixture();
    const requestFetch = vi.fn(async () => {
      throw new Error('Failed to fetch');
    }) as unknown as typeof fetch;
    const client = await createPicoLinkDirectClient({
      sodium: vaultSodium,
      daemonClient: f.daemonClient,
      coreUrl: 'http://carrier.invalid',
      host: f.host,
      sender: f.sender,
      fetch: requestFetch,
    });

    await expect(client.request('home.setup.read', {}))
      .rejects.toThrow('link_home_did_not_answer:Failed to fetch');
  });

  it('refuses an oversized carrier response before parsing it', async () => {
    const f = fixture();
    const client = await createPicoLinkDirectClient({
      sodium: vaultSodium,
      daemonClient: f.daemonClient,
      coreUrl: 'http://carrier.invalid',
      host: f.host,
      sender: f.sender,
      fetch: (async () => new Response('x', {
        status: 200,
        headers: {
          'content-length': String(MAX_PICO_LINK_DIRECT_CLIENT_RESPONSE_CHARS + 1),
        },
      })) as typeof fetch,
    });

    await expect(client.request('home.setup.read', {}))
      .rejects.toThrow('link_response_too_large');
  });
});
