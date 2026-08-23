import { describe, expect, it } from 'vitest';
import type { PicoLinkDirectClient } from '@pico/vault-daemon/link-direct-client';
import { readPicoCompanionDomainReadership } from './home-authority.js';

/**
 * ADR 0082 mit ADR 0130 E4. Die Leseseite der Reader-Custody-Grants.
 */
const domain = (id: string, authorityId: string) => ({
  domainId: id,
  domainAuthorityId: authorityId,
  homeId: 'home_1',
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
