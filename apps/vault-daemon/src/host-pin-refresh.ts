import { isHexOfBytes } from '@pico/protocol/canonical-bytes';
import {
  picoHomeContinuityChainSchema,
  picoIdentitySuite,
  type PicoHomeContinuityChainResponse,
  type PicoHomeContinuityRecord,
} from '@pico/protocol';
import {
  followPicoHomeContinuityChain,
  verifyPicoIdentityKeyRecordFingerprint,
  type IdentityVerificationSodium,
  type PicoHomeContinuityChainFollowResult,
} from '@pico/identity';
import type { VaultSodium } from '@pico/vault';
import {
  PICO_LINK_DIRECT_CLIENT_REQUEST_LIFETIME_MS,
  readBoundedResponseText,
  type PicoLinkDirectHostPin,
} from './link-direct-client.js';

/**
 * ADR 0115 U4: the client half of host-key rotation, for every device beyond
 * the one that accepted it.
 *
 * A stranded client cannot use the sealed channel at all - it seals to an
 * agreement key whose private half was deleted at the custody swap, and it
 * pins an audience the intake refuses before any dispatch. So the chain is
 * read unsealed and trusted for nothing: every link is verified from the pin
 * this client already holds, every acceptance is bound to the pinned Home
 * Host Pico fingerprint (without that pin, a thief of a copied host disk
 * forges the entire continuation), and the served head bundle counts only if
 * both public keys hash to the fingerprints the verified chain head names.
 *
 * This needs no unlocked vault and no daemon session: it is public-key
 * verification and nothing else, which is what lets a stranded client heal
 * itself.
 */

export const PICO_HOME_CONTINUITY_READ_PATH = '/api/home/link/continuity';
/** ~350 rotations; far beyond any honest chain, small enough to stay abuse-proof. */
export const MAX_PICO_HOME_CONTINUITY_CHAIN_RESPONSE_CHARS = 1024 * 1024;

export interface RefreshPicoHomeHostPinsInput {
  coreUrl: string;
  pinnedHostSigningKeyFingerprintHex: string;
  pinnedHostKeyAgreementKeyFingerprintHex: string;
  pinnedHomeHostPicoIdentityFingerprintHex: string;
  fetch?: typeof fetch;
}

export type PicoHomeHostPinRefreshResult =
  | {
    status: 'repinned';
    head: PicoLinkDirectHostPin;
    followedLinks: number;
    halt?: PicoHomeContinuityChainFollowResult['halt'];
  }
  | {
    status: 'current';
    head: PicoLinkDirectHostPin;
    halt?: PicoHomeContinuityChainFollowResult['halt'];
  }
  | {
    status: 'unverified';
    reason: 'head_bundle_mismatch';
    halt?: PicoHomeContinuityChainFollowResult['halt'];
  };

/**
 * Fetches the unsealed chain. Throws on transport and shape failures - those
 * are availability problems, not verification verdicts; the verification
 * verdicts live in {@link refreshPicoHomeHostPins}.
 */
/**
 * „Es hat zu lange geschwiegen" ist eine andere Auskunft als „niemand hat
 * nachgesehen", und beide sind andere als „es hat abgelehnt". Der Grund reist
 * mit, damit eine Diagnose moeglich bleibt.
 */
function timedOutOr(failed: unknown): Error {
  if (failed instanceof Error && failed.name === 'TimeoutError') {
    return new Error('continuity_read_timed_out');
  }
  const cause = failed instanceof Error
    ? (failed.cause as { code?: string } | undefined)?.code ?? failed.message
    : String(failed);
  return new Error(`continuity_read_unreachable:${cause}`);
}

export async function fetchPicoHomeContinuityChain(input: {
  coreUrl: string;
  fetch?: typeof fetch;
}): Promise<PicoHomeContinuityChainResponse> {
  const requestFetch = input.fetch ?? fetch;
  const url = new URL(
    PICO_HOME_CONTINUITY_READ_PATH,
    input.coreUrl.endsWith('/') ? input.coreUrl : `${input.coreUrl}/`,
  );

  /**
   * ADR 0131 A7, und die Form ist die von `link-direct-client.ts` (Befund
   * B160/B161, Entscheidung des Nutzers am 2026-09-13).
   *
   * **Warum hier besonders.** Dieser Lesevorgang laeuft ueber
   * `refreshPicoHomeHostPins` im **ersten Lauf** eines Companions. Ein Home,
   * das schweigt - angehalten, ueberlastet, hinter einer Bruecke, die annimmt
   * und nicht weiterreicht -, liess den ersten Lauf ohne Ende und ohne Satz
   * warten. Das ist der Moment, in dem ein Mensch am wenigsten Zusammenhang
   * hat, um zu verstehen, was nicht geschieht.
   *
   * Ein eigener Controller statt `AbortSignal.timeout`, aus denselben zwei
   * Gruenden wie dort: der Wecker wird geloescht, sobald der Rumpf gelesen ist
   * - sonst haengt an jeder erledigten Anfrage noch dreissig Sekunden ein
   * Timer im Daemon -, und eine gestellte Uhr kann ihn stellen.
   *
   * **Erst nach dem Rumpf**, nicht nach den Kopfzeilen: ein Home, das
   * Kopfzeilen schickt und dann verstummt, ist dasselbe Schweigen einen
   * Schritt spaeter. Genau daran ist der erste Anlauf desselben Musters in
   * `link-direct-client.ts` gescheitert.
   *
   * Die dreissig Sekunden sind die dortigen: derselbe Gespraechspartner,
   * derselbe wartende Mensch.
   */
  const silence = new AbortController();
  const givingUp = setTimeout(() => {
    silence.abort(Object.assign(
      new Error('continuity_read_timed_out'),
      { name: 'TimeoutError' },
    ));
  }, PICO_LINK_DIRECT_CLIENT_REQUEST_LIFETIME_MS);

  let response: Response;
  let text: string;
  try {
    try {
      response = await requestFetch(url, { signal: silence.signal });
    } catch (noAnswer) {
      throw timedOutOr(noAnswer);
    }
    try {
      text = await readBoundedResponseText(
        response,
        MAX_PICO_HOME_CONTINUITY_CHAIN_RESPONSE_CHARS,
      );
    } catch (noAnswer) {
      // Nur das Schweigen wird umbenannt. Eine zu grosse Antwort ist eine
      // eigene Auskunft und keine ausbleibende.
      if (noAnswer instanceof Error && noAnswer.name !== 'TimeoutError') {
        throw noAnswer;
      }
      throw timedOutOr(noAnswer);
    }
  } finally {
    clearTimeout(givingUp);
  }

  if (!response.ok) {
    throw new Error(`continuity_read_rejected:${response.status}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('continuity_read_unparseable');
  }
  if (!isRecord(parsed)
    || parsed.schema !== picoHomeContinuityChainSchema
    || !Array.isArray(parsed.records)
    || !isRecord(parsed.head)
    || parsed.head.suite !== picoIdentitySuite
    || !isHex64(parsed.head.signingPublicKeyHex)
    || !isHex64(parsed.head.signingKeyFingerprintHex)
    || !isHex64(parsed.head.keyAgreementPublicKeyHex)
    || !isHex64(parsed.head.keyAgreementKeyFingerprintHex)) {
    throw new Error('continuity_read_malformed');
  }
  return parsed as unknown as PicoHomeContinuityChainResponse;
}

/**
 * The full client-side verification: fetch, follow from the own pin, bind
 * the served head bundle to the proven head. Re-pinning is only ever offered
 * on `repinned`; `unverified` means the endpoint claims a head the chain
 * walk could not prove, and a client that cannot prove stays on its pin -
 * fail closed, loudly, at the caller's surface.
 */
export async function refreshPicoHomeHostPins(
  sodium: VaultSodium,
  input: RefreshPicoHomeHostPinsInput,
): Promise<PicoHomeHostPinRefreshResult> {
  const verificationSodium = sodium as unknown as IdentityVerificationSodium;
  const chain = await fetchPicoHomeContinuityChain({
    coreUrl: input.coreUrl,
    ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
  });
  const followed = followPicoHomeContinuityChain(verificationSodium, {
    records: chain.records as readonly PicoHomeContinuityRecord[],
    pinnedHostSigningKeyFingerprintHex: input.pinnedHostSigningKeyFingerprintHex,
    pinnedHostKeyAgreementKeyFingerprintHex:
      input.pinnedHostKeyAgreementKeyFingerprintHex,
    pinnedHomeHostPicoIdentityFingerprintHex:
      input.pinnedHomeHostPicoIdentityFingerprintHex,
  });

  // The chain proves fingerprints; only the bundle carries the agreement
  // public key (X25519 keys cannot sign, so no record embeds one). The hash
  // binding is what turns the unsealed bundle into proven material.
  const head = chain.head;
  const bundleMatchesProvenHead =
    head.signingKeyFingerprintHex === followed.head.hostSigningKeyFingerprintHex
    && head.keyAgreementKeyFingerprintHex
      === followed.head.hostKeyAgreementKeyFingerprintHex
    && verifyPicoIdentityKeyRecordFingerprint(verificationSodium, {
      keyRecord: {
        suite: picoIdentitySuite,
        keyRole: 'home_host_signing',
        publicKeyHex: head.signingPublicKeyHex,
      },
      expectedFingerprintHex: followed.head.hostSigningKeyFingerprintHex,
    })
    && verifyPicoIdentityKeyRecordFingerprint(verificationSodium, {
      keyRecord: {
        suite: picoIdentitySuite,
        keyRole: 'home_host_key_agreement',
        publicKeyHex: head.keyAgreementPublicKeyHex,
      },
      expectedFingerprintHex: followed.head.hostKeyAgreementKeyFingerprintHex,
    });
  const halt = followed.halt === undefined ? {} : { halt: followed.halt };

  if (!bundleMatchesProvenHead) {
    return { status: 'unverified', reason: 'head_bundle_mismatch', ...halt };
  }

  const provenHead: PicoLinkDirectHostPin = {
    signingPublicKeyHex: head.signingPublicKeyHex,
    signingKeyFingerprintHex: head.signingKeyFingerprintHex,
    keyAgreementPublicKeyHex: head.keyAgreementPublicKeyHex,
    keyAgreementKeyFingerprintHex: head.keyAgreementKeyFingerprintHex,
  };
  return followed.rotated
    ? {
      status: 'repinned',
      head: provenHead,
      followedLinks: followed.followedLinks,
      ...halt,
    }
    : { status: 'current', head: provenHead, ...halt };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHex64(value: unknown): value is string {
  return typeof value === 'string' && isHexOfBytes(value, 32);
}
