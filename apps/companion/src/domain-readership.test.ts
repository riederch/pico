import { describe, expect, it } from 'vitest';
import type { PicoLinkDirectClient } from '@pico/vault-daemon/link-direct-client';
import {
  readPicoCompanionDomainReadership,
  revokePicoCompanionDomainReader,
} from './home-authority.js';
import type { PicoVaultDaemonClient } from '@pico/vault-daemon/client';

/**
 * ADR 0082 mit ADR 0130 E4. Die Leseseite der Reader-Custody-Grants.
 */
const domain = (id: string, authorityId: string) => ({
  domainId: id,
  domainAuthorityId: authorityId,
  homeId: 'home_1',
  hostSigningKeyFingerprintHex: '11'.repeat(32),
  ownerIdentityKeyFingerprintHex: 'aa'.repeat(32),
  ownerReaderKeyFingerprintHex: 'bb'.repeat(32),
  kekVersion: 1,
  authorizedAt: '2026-08-22T00:00:00.000Z',
  lifecycleOrder: 'seq:0000000000000001',
  receivedAt: '2026-08-22T00:00:00.000Z',
});

const grant = (over: Record<string, unknown> = {}) => ({
  readerGrantId: 'reader_grant_1',
  domainAuthorityId: 'authority_privat',
  domainId: 'domain-privat',
  readerIdentityKeyFingerprintHex: 'cc'.repeat(32),
  readerDeviceSigningKeyFingerprintHex: 'dd'.repeat(32),
  readerKeyFingerprintHex: 'ee'.repeat(32),
  readerDelegationId: 'delegation_reader',
  accessMode: 'forward_only',
  firstKekVersion: 1,
  envelopeKekVersions: [1],
  status: 'active',
  validFrom: '2026-08-22T00:00:00.000Z',
  validUntil: '2027-08-22T00:00:00.000Z',
  ...over,
});

function answering(
  by: { domains?: unknown; readerGrants?: unknown },
  seen?: string[],
): PicoLinkDirectClient {
  return {
    request: async (operation: string, args: unknown) => {
      const resource = (args as { resource: string }).resource;
      seen?.push(`${operation}:${resource}`);
      if (resource === 'reader_custody_domains') {
        return { outcome: 'ok', result: { domains: by.domains ?? [] } };
      }
      if (resource === 'reader_custody_reader_grants') {
        return { outcome: 'ok', result: { readerGrants: by.readerGrants ?? [] } };
      }
      return { outcome: 'ok', result: {} };
    },
  } as unknown as PicoLinkDirectClient;
}

describe('wer welche Domäne lesen darf, vom Gerät der Person aus', () => {
  it('nennt eine Domäne, die niemand liest - das ist der Grund für die Ansicht', async () => {
    /**
     * Ein Grant trägt seine Domäne mit sich, also beantworteten die Grants
     * allein "wer liest was". Was sie verschweigen, ist "welche Domäne liest
     * niemand" - und genau das ist die beruhigende Hälfte.
     */
    const view = await readPicoCompanionDomainReadership({
      livingDeviceLinkClient: answering({
        domains: [domain('domain-privat', 'authority_privat'),
          domain('domain-finanz', 'authority_finanz')],
        readerGrants: [grant()],
      }),
    });
    expect(view).toHaveLength(2);
    expect(view[0]?.readers).toHaveLength(1);
    expect(view[1]?.domainId).toBe('domain-finanz');
    expect(view[1]?.readers).toEqual([]);
  });

  it('fragt beide Ressourcen, weil eine allein die Frage nicht beantwortet', async () => {
    const seen: string[] = [];
    await readPicoCompanionDomainReadership({
      livingDeviceLinkClient: answering({ domains: [], readerGrants: [] }, seen),
    });
    expect(seen).toEqual([
      'home.authority.list:reader_custody_domains',
      'home.authority.list:reader_custody_reader_grants',
    ]);
  });

  it('ordnet mehrere Leser derselben Domäne zu', async () => {
    const view = await readPicoCompanionDomainReadership({
      livingDeviceLinkClient: answering({
        domains: [domain('domain-privat', 'authority_privat')],
        readerGrants: [
          grant(),
          grant({ readerGrantId: 'reader_grant_2', readerIdentityKeyFingerprintHex: 'ff'.repeat(32) }),
        ],
      }),
    });
    expect(view[0]?.readers.map((r) => r.readerGrantId))
      .toEqual(['reader_grant_1', 'reader_grant_2']);
  });

  it('zeigt einen widerrufenen Grant, statt ihn zu verschweigen', async () => {
    // Ein Zugang, der einmal bestand, ist eine Auskunft über die
    // Vergangenheit - und die Frage "wer konnte das lesen" ist eine andere als
    // "wer kann es jetzt".
    const view = await readPicoCompanionDomainReadership({
      livingDeviceLinkClient: answering({
        domains: [domain('domain-privat', 'authority_privat')],
        readerGrants: [grant({ status: 'revoked' })],
      }),
    });
    expect(view[0]?.readers[0]?.status).toBe('revoked');
  });

  it('nennt die Ablehnung des Homes beim Namen', async () => {
    const refusing = {
      request: async () => ({ outcome: 'sender_is_not_home_authority', result: {} }),
    } as unknown as PicoLinkDirectClient;
    await expect(readPicoCompanionDomainReadership({ livingDeviceLinkClient: refusing }))
      .rejects.toThrow('domain_readership_read_rejected:sender_is_not_home_authority');
  });

  it('weist eine Antwort zurück, der ein Feld fehlt, statt sie zu raten', async () => {
    await expect(readPicoCompanionDomainReadership({
      livingDeviceLinkClient: answering({
        domains: [domain('domain-privat', 'authority_privat')],
        readerGrants: [grant({ validUntil: undefined })],
      }),
    })).rejects.toThrow('invalid_pico_companion_domain_readership');
  });
});

describe('einen Lesezugang beenden, vom Gerät aus, das ihn vergeben hat', () => {
  const owner = 'aa'.repeat(32);
  const readership = {
    domainId: 'domain-privat',
    domainAuthorityId: 'authority_privat',
    homeId: 'home_1',
    hostSigningKeyFingerprintHex: '11'.repeat(32),
    ownerIdentityKeyFingerprintHex: owner,
    readers: [],
  };
  const reader = {
    readerGrantId: 'reader_grant_1',
    readerIdentityKeyFingerprintHex: 'cc'.repeat(32),
    readerKeyFingerprintHex: 'ee'.repeat(32),
    accessMode: 'forward_only' as const,
    status: 'active' as const,
    validUntil: '2027-08-22T00:00:00.000Z',
  };
  const sodium = { randombytes_buf: () => new Uint8Array(16) } as never;
  const profile = { coreUrl: 'http://127.0.0.1:8321' } as never;

  function daemon(over: { keyRole?: string } = {}) {
    const signed: Record<string, unknown>[] = [];
    return {
      signed,
      client: {
        status: async () => ({
          locked: false,
          sessions: [{
            keyRole: over.keyRole ?? 'pico_identity',
            keyFingerprintHex: owner,
            publicKeyHex: 'bb'.repeat(32),
          }],
          keyfiles: [],
        }),
        sign: async (input: Record<string, unknown>) => {
          signed.push(input);
          return { signatureHex: 'cd'.repeat(64) };
        },
      } as unknown as PicoVaultDaemonClient,
    };
  }

  function link(seen: Record<string, unknown>[]) {
    return {
      request: async (operation: string, args: unknown) => {
        seen.push({ operation, args });
        return { outcome: 'ok', result: {} };
      },
    } as unknown as PicoLinkDirectClient;
  }

  it('trägt den Host-Schlüssel der Domäne, nicht den des Profils', async () => {
    /**
     * Nach einer Host-Schlüssel-Rotation (ADR 0115) sind das zwei
     * verschiedene, und die Aussage gehört zu dem, unter dem die Domäne
     * autorisiert wurde. Wer ihn aus dem Profil nähme, unterschriebe nach
     * jeder Rotation etwas Falsches - und zwar leise, weil vorher alles
     * stimmte.
     */
    const { client, signed } = daemon();
    const seen: Record<string, unknown>[] = [];
    await revokePicoCompanionDomainReader({
      profile,
      daemonClient: client,
      livingDeviceLinkClient: link(seen),
      sodium,
      domain: readership,
      reader,
      reasonCategory: 'reader_removed',
      now: () => new Date('2026-08-22T10:00:00.000Z'),
    });
    const fields = signed[0]?.fields as Record<string, unknown>;
    expect(fields.hostSigningKeyFingerprintHex).toBe('11'.repeat(32));
  });

  it('lässt den Daemon unterschreiben, unter dem kanonischen Label', async () => {
    // Der Schlüssel liegt im Vault, nicht in diesem Prozess - und ADR 0106
    // zeigt der Person den Satz, den sie unterschreibt.
    const { client, signed } = daemon();
    await revokePicoCompanionDomainReader({
      profile,
      daemonClient: client,
      livingDeviceLinkClient: link([]),
      sodium,
      domain: readership,
      reader,
      reasonCategory: 'security_review',
    });
    expect(signed[0]?.label).toBe('pico.mem.reader-grant-lifecycle.v1');
    expect(signed[0]?.keyFingerprintHex).toBe(owner);
  });

  it('schickt die Aussage über dieselbe Operation wie das Vergeben', async () => {
    const seen: Record<string, unknown>[] = [];
    await revokePicoCompanionDomainReader({
      profile,
      daemonClient: daemon().client,
      livingDeviceLinkClient: link(seen),
      sodium,
      domain: readership,
      reader,
      reasonCategory: 'device_retired',
    });
    expect(seen[0]?.operation).toBe('home.authority.submit');
    expect((seen[0]?.args as { resource: string }).resource)
      .toBe('reader_custody_reader_grant_lifecycle');
  });

  it('nennt einen gesperrten Vault beim Namen, statt ihn als Ablehnung zu zeigen', async () => {
    await expect(revokePicoCompanionDomainReader({
      profile,
      daemonClient: daemon({ keyRole: 'device_signing' }).client,
      livingDeviceLinkClient: link([]),
      sodium,
      domain: readership,
      reader,
      reasonCategory: 'reader_removed',
    })).rejects.toThrow('domain_owner_identity_not_unlocked');
  });

  it('nennt die Ablehnung des Homes im Vokabular aller Zeremonien', async () => {
    /**
     * Die erste Fassung erfand hier einen eigenen Namen
     * (`domain_reader_revocation_rejected:…`). Seit der Widerruf über
     * `picoFoundationRequest` läuft wie jede andere Zeremonie, gilt deren
     * Vokabular - ein Aufrufer, der beide kennen müsste, wäre der Preis für
     * einen Namen, den nur eine Stelle spricht.
     */
    const refusing = {
      request: async () => ({ outcome: 'foundation_rejected', result: {} }),
    } as unknown as PicoLinkDirectClient;
    await expect(revokePicoCompanionDomainReader({
      profile,
      daemonClient: daemon().client,
      livingDeviceLinkClient: refusing,
      sodium,
      domain: readership,
      reader,
      reasonCategory: 'reader_removed',
    })).rejects.toThrow('foundation_rejected');
  });
});
