import { hasExactKeys, isCanonicalHex, isHexOfBytes } from '@pico/protocol/canonical-bytes';
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
  type PicoLinkDirectOperation,
  type PicoLinkDirectRequestSignatureInput,
  type PicoLinkDirectSealedRequest,
  type PicoLinkDirectSealedResponse,
} from '@pico/protocol';
import type { VaultSodium } from '@pico/vault';
import type { PicoVaultDaemonClient } from './client.js';

export const PICO_LINK_DIRECT_CLIENT_REQUEST_LIFETIME_MS = 30_000;

/**
 * Wie lange auf eine Antwort gewartet wird - und warum das keine neue Zahl ist.
 *
 * **Bis zum 2026-08-25 gab es hier gar keine Grenze** (Roadmap-Befund B21).
 * Ein Home, das die Verbindung *ablehnt*, meldet sich sofort und heißt seit
 * dem 2026-08-22 `link_home_did_not_answer`. Ein Home, das *schweigt* -
 * angehalten, überlastet, hinter einer Brücke, die annimmt und nicht
 * weiterreicht -, ließ jeden Aufrufer warten, ohne Ende: auf dem Desktop ein
 * hängender Alarm-Carrier, auf dem Telefon ein Vordergrunddienst, der nicht
 * zurückkommt. Eine Prüfung, die hängt, sagt nie „dein Home antwortet nicht",
 * und genau das ist der Satz, für den sie da ist.
 *
 * Die Voreinstellung ist die Lebensdauer des Umschlags selbst, nicht eine
 * zweite Zahl daneben: länger zu warten hieße, auf die Antwort zu einer
 * Anfrage zu warten, die das Home als abgelaufen zurückweisen würde, wenn es
 * sie erst jetzt in die Hand nähme. Eine Wahrheit, die zweimal geschrieben
 * wird, driftet.
 */
export const picoLinkDirectAnswerBoundMs = (
  operation: PicoLinkDirectOperation,
): number => picoLinkDirectLongAnswers.get(operation)
  ?? PICO_LINK_DIRECT_CLIENT_REQUEST_LIFETIME_MS;

/**
 * Die Operationen, die ihre Arbeit **im Request** tun, mit dem Grund daneben.
 *
 * Der Typ ist `PicoLinkDirectOperation`, nicht `string`: ein Name, der die
 * geschlossene Liste verlässt, scheitert damit an der Typprüfung statt hier
 * als Ausnahme für etwas stehen zu bleiben, das es nicht mehr gibt.
 *
 * Wächst diese Liste, ist das sichtbar - und jeder Eintrag ist ein Hinweis,
 * dass eine Operation lange Arbeit in eine Antwort legt, statt sie
 * anzustoßen und den Fortschritt abfragbar zu machen.
 */
const picoLinkDirectLongAnswers = new Map<PicoLinkDirectOperation, number>([
  [
    /**
     * Eine Depot-Freigabe führt `fetchPicoDepot` im Request aus, und das ruft
     * `git` als externes Programm - mit 120 s Budget je Aufruf und mehreren
     * Aufrufen für Holen und Auschecken. Dreißig Sekunden würden hier eine
     * Freigabe abschneiden, die gerade tut, was die Person wollte.
     */
    'home.action.approval.resolve',
    300_000,
  ],
]);
export const MAX_PICO_LINK_DIRECT_CLIENT_RESPONSE_CHARS = 512 * 1024;

export interface PicoLinkDirectHostPin {
  signingPublicKeyHex: string;
  signingKeyFingerprintHex: string;
  keyAgreementPublicKeyHex: string;
  keyAgreementKeyFingerprintHex: string;
}

export interface PicoLinkDirectSender {
  identityKeyFingerprintHex: string;
  /**
   * ADR 0109: a delegated device authenticates Link without unlocking the
   * identity root. The public identity key may therefore be supplied from the
   * lifecycle ceremony's already verified root session. Older callers may
   * omit it and retain the pre-0109 unlocked-session lookup.
   */
  identityPublicKeyHex?: string;
  deviceSigningKeyFingerprintHex: string;
  deviceKeyAgreementKeyFingerprintHex: string;
  delegationId: string;
}

export interface CreatePicoLinkDirectClientInput {
  sodium: VaultSodium;
  daemonClient: PicoVaultDaemonClient;
  coreUrl: string;
  host: PicoLinkDirectHostPin;
  sender: PicoLinkDirectSender;
  fetch?: typeof fetch;
  now?: () => Date;
}

export interface PicoLinkDirectClient {
  readonly hostSigningKeyFingerprintHex: string;
  readonly hostKeyAgreementKeyFingerprintHex: string;
  readonly sender: Readonly<PicoLinkDirectSender>;
  request(
    operation: PicoLinkDirectOperation,
    args: Record<string, unknown>,
  ): Promise<{ outcome: string; result: Record<string, unknown> }>;
}

/**
 * ADR 0107 D3 client boundary.
 *
 * The URL supplies reachability only. Both host public keys are checked
 * against out-of-band fingerprints before the first request, every request is
 * signed by the unlocked delegated device key, and every response is opened
 * with a fresh per-request X25519 key before its host signature is accepted.
 */
export async function createPicoLinkDirectClient(
  input: CreatePicoLinkDirectClientInput,
): Promise<PicoLinkDirectClient> {
  assertHostPin(input.sodium, input.host);

  const status = await input.daemonClient.status();
  const identity = input.sender.identityPublicKeyHex === undefined
    ? status.sessions.find(
      (session) => session.keyFingerprintHex === input.sender.identityKeyFingerprintHex,
    )
    : undefined;
  const signing = status.sessions.find(
    (session) => session.keyFingerprintHex === input.sender.deviceSigningKeyFingerprintHex,
  );
  if (input.sender.identityPublicKeyHex === undefined && identity?.keyRole !== 'pico_identity') {
    throw new Error('link_identity_key_not_unlocked');
  }
  if (signing?.keyRole !== 'device_signing') {
    throw new Error('link_device_signing_key_not_unlocked');
  }
  if (input.sender.delegationId.trim() === '') {
    throw new Error('invalid_link_delegation_id');
  }

  const senderIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput = {
    suite: picoIdentitySuite,
    keyRole: 'pico_identity',
    publicKeyHex: input.sender.identityPublicKeyHex ?? identity!.publicKeyHex,
  };
  const senderDeviceSigningKeyRecord: PicoIdentityKeyRecordSignatureInput = {
    suite: picoIdentitySuite,
    keyRole: 'device_signing',
    publicKeyHex: signing.publicKeyHex,
  };
  assertKeyRecordFingerprint(
    input.sodium,
    senderIdentityKeyRecord,
    input.sender.identityKeyFingerprintHex,
    'link_identity_key_fingerprint_mismatch',
  );
  assertKeyRecordFingerprint(
    input.sodium,
    senderDeviceSigningKeyRecord,
    input.sender.deviceSigningKeyFingerprintHex,
    'link_device_signing_key_fingerprint_mismatch',
  );

  const requestFetch = input.fetch ?? fetch;
  const now = input.now ?? (() => new Date());
  const linkUrl = new URL(
    '/api/home/link',
    input.coreUrl.endsWith('/') ? input.coreUrl : `${input.coreUrl}/`,
  );

  return {
    hostSigningKeyFingerprintHex: input.host.signingKeyFingerprintHex,
    hostKeyAgreementKeyFingerprintHex:
      input.host.keyAgreementKeyFingerprintHex,
    sender: Object.freeze({ ...input.sender }),
    request: async (operation, args) => {
      const replyKeypair = input.sodium.crypto_box_keypair();
      try {
        const createdAtDate = now();
        const createdAt = createdAtDate.toISOString();
        const expiresAt = new Date(
          createdAtDate.getTime() + PICO_LINK_DIRECT_CLIENT_REQUEST_LIFETIME_MS,
        ).toISOString();
        const request: PicoLinkDirectRequestSignatureInput = {
          suite: picoIdentitySuite,
          requestId: `linkreq_${toHex(input.sodium.randombytes_buf(16))}`,
          operation,
          hostSigningKeyFingerprintHex: input.host.signingKeyFingerprintHex,
          senderIdentityKeyFingerprintHex: input.sender.identityKeyFingerprintHex,
          senderDeviceSigningKeyFingerprintHex: input.sender.deviceSigningKeyFingerprintHex,
          senderDeviceKeyAgreementKeyFingerprintHex:
            input.sender.deviceKeyAgreementKeyFingerprintHex,
          senderDelegationId: input.sender.delegationId,
          replyPublicKeyHex: toHex(replyKeypair.publicKey),
          argumentsDigestHex: picoLinkDirectPayloadDigestHex(input.sodium, args),
          createdAt,
          expiresAt,
        };
        // Build locally as well as in the daemon. This rejects malformed fields
        // before any IPC request and pins the exact bytes the response belongs
        // to; the daemon independently rebuilds the same bytes before signing.
        buildPicoLinkDirectRequestSignatureInput(request);
        const signed = await input.daemonClient.sign({
          keyFingerprintHex: input.sender.deviceSigningKeyFingerprintHex,
          label: picoLinkDirectRequestSignatureInputLabel,
          fields: request as unknown as Record<string, unknown>,
        });
        if (signed.keyRole !== 'device_signing'
          || signed.keyFingerprintHex !== input.sender.deviceSigningKeyFingerprintHex) {
          throw new Error('link_request_signer_mismatch');
        }

        const sealedRequest: PicoLinkDirectSealedRequest = {
          schema: picoLinkDirectRequestEnvelopeSchema,
          request,
          senderIdentityKeyRecord,
          senderDeviceSigningKeyRecord,
          arguments: args,
          senderSignatureHex: signed.signatureHex,
        };
        const envelope = {
          schema: picoLinkDirectRequestEnvelopeSchema,
          sealedRequestHex: toHex(input.sodium.crypto_box_seal(
            new TextEncoder().encode(JSON.stringify(sealedRequest)),
            fromHex(input.host.keyAgreementPublicKeyHex, 32, 'invalid_host_agreement_public_key'),
          )),
        };

        /**
         * ADR 0131 A7. Ein Home, das nicht antwortet, bekommt hier einen
         * Namen - so wie jeder andere Fehlschlag in dieser Datei einen hat.
         *
         * **Bis zum 2026-08-22 war er der einzige ohne.** Elf Ablehnungen
         * heißen `link_rejected`, `link_invalid_response`,
         * `link_response_unreadable` und so fort; nur das `fetch` selbst warf
         * durch, was die Plattform gerade sagte - `fetch failed`,
         * `ECONNREFUSED`, ein `AbortError`. Auf einem Telefon ist das der
         * häufigste Fehlschlag überhaupt, weil es das Haus verlässt, und A7
         * verlangt genau dafür einen Satz statt eines Symptoms: "nichts wartet"
         * und "niemand hat nachgesehen" sind verschiedene Auskünfte.
         *
         * Der Grund reist mit, damit eine Diagnose möglich bleibt. Er ist
         * nicht der Satz für eine Person - den wählt
         * `picoCompanionEnrolmentRefusalLine` am Namen davor.
         */
        let response;
        /**
         * Ein Signal statt einer Hoffnung. Es deckt auch das Lesen des
         * Rumpfes: ein Home, das Kopfzeilen schickt und dann verstummt, ist
         * dasselbe Schweigen einen Schritt später.
         *
         * Ein eigener Controller statt `AbortSignal.timeout`, aus zwei
         * Gründen: der Wecker wird nach der Antwort **gelöscht** - sonst hinge
         * an jeder erledigten Anfrage noch dreißig Sekunden ein Timer im
         * Daemon -, und eine gestellte Uhr kann ihn stellen, sodass ein Test
         * die Grenze selbst prüfen kann statt nur, dass irgendwann etwas
         * geschieht.
         */
        const silence = new AbortController();
        const givingUp = setTimeout(() => {
          silence.abort(Object.assign(
            new Error('link_home_timed_out'),
            { name: 'TimeoutError' },
          ));
        }, picoLinkDirectAnswerBoundMs(operation));
        const noAnswerFrom = (failed: unknown): Error => {
          // `timed_out` ist eine eigene Auskunft: „es hat zu lange geschwiegen"
          // ist etwas anderes als „es hat abgelehnt", und beide sind etwas
          // anderes als „niemand hat nachgesehen".
          const cause = failed instanceof Error && failed.name === 'TimeoutError'
            ? 'timed_out'
            : failed instanceof Error
              ? (failed.cause as { code?: string } | undefined)?.code ?? failed.message
              : String(failed);
          return new Error(`link_home_did_not_answer:${cause}`);
        };
        let responseText;
        try {
          try {
            response = await requestFetch(linkUrl, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(envelope),
              signal: silence.signal,
            });
          } catch (noAnswer) {
            throw noAnswerFrom(noAnswer);
          }
          try {
            responseText = await readBoundedResponseText(response);
          } catch (noAnswer) {
            /**
             * Nur das Schweigen wird hier umbenannt. `link_response_too_large`
             * ist eine eigene Auskunft und keine ausbleibende Antwort - sie
             * durchzureichen wäre der Fehler, den diese Zeile verhindert: ein
             * Home, das zu viel sagt, als eines auszugeben, das nichts sagt.
             */
            if (!(noAnswer instanceof Error) || noAnswer.name === 'TimeoutError') {
              throw noAnswerFrom(noAnswer);
            }
            throw noAnswer;
          }
        } finally {
          /**
           * **Erst wenn der Rumpf gelesen ist**, nicht wenn die Kopfzeilen da
           * sind. Der erste Anlauf löschte den Wecker im `finally` des `fetch`
           * - und ein Home, das Kopfzeilen schickt und dann verstummt, hing
           * wieder für immer, während der Kommentar daneben behauptete, genau
           * dieser Fall sei gedeckt. Was danach kommt - Öffnen, Signatur
           * prüfen - ist eigene Arbeit und wartet auf niemanden.
           */
          clearTimeout(givingUp);
        }
        let parsed: unknown;
        try {
          parsed = responseText === '' ? {} : JSON.parse(responseText);
        } catch {
          throw new Error(`link_invalid_response:${response.status}`);
        }
        if (!response.ok) {
          const reason = isRecord(parsed) && typeof parsed.error === 'string'
            ? parsed.error
            : 'intake_rejected';
          throw new Error(`link_rejected:${response.status}:${reason}`);
        }
        if (!isRecord(parsed)
          || parsed.schema !== picoLinkDirectResponseEnvelopeSchema
          || typeof parsed.sealedResponseHex !== 'string') {
          throw new Error('link_invalid_response_envelope');
        }

        let opened: unknown;
        try {
          opened = JSON.parse(new TextDecoder().decode(
            input.sodium.crypto_box_seal_open(
              fromHex(parsed.sealedResponseHex, undefined, 'link_response_unreadable'),
              replyKeypair.publicKey,
              replyKeypair.privateKey,
            ),
          ));
        } catch {
          throw new Error('link_response_unreadable');
        }
        if (!isRecord(opened)
          || opened.schema !== picoLinkDirectResponseEnvelopeSchema
          || !isRecord(opened.response)
          || !isRecord(opened.result)
          || typeof opened.hostSignatureHex !== 'string'
          || !hasExactKeys(opened, ['schema', 'response', 'result', 'hostSignatureHex'])) {
          throw new Error('link_invalid_response_payload');
        }

        const sealedResponse = opened as unknown as PicoLinkDirectSealedResponse;
        let signatureInput: Uint8Array;
        try {
          signatureInput = buildPicoLinkDirectResponseSignatureInput(sealedResponse.response);
        } catch {
          throw new Error('link_invalid_response_payload');
        }
        if (sealedResponse.response.requestId !== request.requestId
          || sealedResponse.response.operation !== request.operation
          || sealedResponse.response.hostSigningKeyFingerprintHex
            !== input.host.signingKeyFingerprintHex
          || sealedResponse.response.resultDigestHex
            !== picoLinkDirectPayloadDigestHex(input.sodium, sealedResponse.result)) {
          throw new Error('link_response_binding_mismatch');
        }
        let signatureValid = false;
        try {
          signatureValid = input.sodium.crypto_sign_verify_detached(
            fromHex(sealedResponse.hostSignatureHex, 64, 'link_invalid_host_signature'),
            signatureInput,
            fromHex(input.host.signingPublicKeyHex, 32, 'invalid_host_signing_public_key'),
          );
        } catch {
          signatureValid = false;
        }
        if (!signatureValid) {
          throw new Error('link_invalid_host_signature');
        }

        return {
          outcome: sealedResponse.response.outcome,
          result: sealedResponse.result,
        };
      } finally {
        input.sodium.memzero(replyKeypair.privateKey);
      }
    },
  };
}

function assertHostPin(sodium: VaultSodium, host: PicoLinkDirectHostPin): void {
  const signingRecord: PicoIdentityKeyRecordSignatureInput = {
    suite: picoIdentitySuite,
    keyRole: 'home_host_signing',
    publicKeyHex: host.signingPublicKeyHex,
  };
  const agreementRecord: PicoIdentityKeyRecordSignatureInput = {
    suite: picoIdentitySuite,
    keyRole: 'home_host_key_agreement',
    publicKeyHex: host.keyAgreementPublicKeyHex,
  };
  assertKeyRecordFingerprint(
    sodium,
    signingRecord,
    host.signingKeyFingerprintHex,
    'host_key_fingerprint_mismatch',
  );
  assertKeyRecordFingerprint(
    sodium,
    agreementRecord,
    host.keyAgreementKeyFingerprintHex,
    'host_key_fingerprint_mismatch',
  );
}

function assertKeyRecordFingerprint(
  sodium: VaultSodium,
  record: PicoIdentityKeyRecordSignatureInput,
  expected: string,
  reason: string,
): void {
  const actual = toHex(sodium.crypto_generichash(
    32,
    buildPicoIdentityKeyRecordSignatureInput(record),
    null,
  ));
  if (actual !== expected) {
    throw new Error(reason);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

function fromHex(value: string, bytes: number | undefined, reason: string): Uint8Array {
  if (!isCanonicalHex(value) || (bytes !== undefined && !isHexOfBytes(value, bytes))) {
    throw new Error(reason);
  }
  return Uint8Array.from(Buffer.from(value, 'hex'));
}

export async function readBoundedResponseText(
  response: Response,
  maxChars: number = MAX_PICO_LINK_DIRECT_CLIENT_RESPONSE_CHARS,
): Promise<string> {
  const statedLength = response.headers.get('content-length');
  if (statedLength !== null
    && Number.isSafeInteger(Number(statedLength))
    && Number(statedLength) > maxChars) {
    await response.body?.cancel();
    throw new Error('link_response_too_large');
  }
  if (response.body === null) {
    return '';
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) {
        break;
      }
      length += next.value.byteLength;
      if (length > maxChars) {
        await reader.cancel();
        throw new Error('link_response_too_large');
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
}
