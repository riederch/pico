import {
  assertPicoRelayOperatorCredential,
  picoRelayClaimCodePattern,
  picoRelayOperatorHeader,
  picoRelayOperatorRoutes,
  type PicoRelayAccountSummary,
  type PicoRelayDescription,
} from '@pico/protocol/link-relay-operator';

/**
 * ADR 0154 - administering a relay from the device that claimed it.
 *
 * **Beside the mailbox client rather than inside it**, because the two are
 * different relationships with the same machine: one is a customer with an
 * account, the other is whoever holds the operator credential. A single class
 * doing both would make it easy to hand an administration credential to code
 * that only ever needed to collect packets.
 *
 * Like its neighbour, it holds nothing. The credential arrives per call from
 * the Vault; a client that kept one would be a second place to look for it.
 */
export interface PicoRelayOperatorClientOptions {
  /**
   * Where the administration listener answers - which is not where the mailbox
   * listener answers (ADR 0154 RO1). Two ports, and usually two decisions
   * about what is reachable from where.
   */
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

export const defaultPicoRelayOperatorTimeoutMs = 15_000;

export type PicoRelayOperatorAnswer<TValue> =
  | { ok: true; value: TValue }
  /** The relay refused, by the name it used. Never an exception. */
  | { ok: false; refusal: string };

export interface PicoRelayIssuedAccount {
  account: PicoRelayAccountSummary;
  /**
   * The credential, and the only moment it exists outside the relay.
   *
   * Nothing on the relay keeps it (ADR 0154 RO4), so no route can return it
   * again. A caller that loses it has to revoke the account and issue another
   * - which is the honest cost of a machine that cannot hand keys back.
   */
  credential: string;
}

export class PicoRelayOperatorClient {
  private readonly baseUrl: string;

  private readonly call: typeof globalThis.fetch;

  private readonly timeoutMs: number;

  public constructor(options: PicoRelayOperatorClientOptions) {
    if (typeof options.baseUrl !== 'string' || !/^https?:\/\/[^\s]+$/u.test(options.baseUrl)) {
      throw new Error('invalid_pico_relay_operator_base_url');
    }
    this.baseUrl = options.baseUrl.replace(/\/+$/u, '');
    this.call = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? defaultPicoRelayOperatorTimeoutMs;
  }

  /**
   * ADR 0154 RO2. Trades the one-time code from the relay's log for the
   * operator credential.
   *
   * The credential comes back once. Whatever calls this owes it a home before
   * the answer is discarded.
   */
  public async claim(claimCode: string): Promise<PicoRelayOperatorAnswer<{
    credential: string;
    operator: string;
  }>> {
    if (!picoRelayClaimCodePattern.test(claimCode)) {
      // Refused here rather than sent: the relay would say the same, and a
      // round trip to learn about a typo spends the operator's attention.
      return { ok: false, refusal: 'invalid_claim_code' };
    }
    const answer = await this.post(picoRelayOperatorRoutes.claim, {}, { claimCode });
    if (!answer.accepted) {
      return { ok: false, refusal: refusalOf(answer.body) };
    }
    const credential = answer.body.credential;
    const operator = answer.body.operator;
    if (typeof credential !== 'string' || typeof operator !== 'string') {
      throw new Error('invalid_pico_relay_claim_answer');
    }
    return { ok: true, value: { credential, operator } };
  }

  /** What this relay is, for a client that has just been pointed at one. */
  public async describe(credential: string): Promise<PicoRelayOperatorAnswer<PicoRelayDescription>> {
    const answer = await this.post(picoRelayOperatorRoutes.describe, { credential }, {});
    return answer.accepted
      ? { ok: true, value: answer.body as unknown as PicoRelayDescription }
      : { ok: false, refusal: refusalOf(answer.body) };
  }

  /** ADR 0154 RO3. Asks the relay to issue an account and bound it on both axes. */
  public async createAccount(input: {
    credential: string;
    mailboxQuota: number;
    maxCapacity: number;
  }): Promise<PicoRelayOperatorAnswer<PicoRelayIssuedAccount>> {
    const answer = await this.post(
      picoRelayOperatorRoutes.accountCreate,
      { credential: input.credential },
      { mailboxQuota: input.mailboxQuota, maxCapacity: input.maxCapacity },
    );
    if (!answer.accepted) {
      return { ok: false, refusal: refusalOf(answer.body) };
    }
    const account = answer.body.account;
    const issued = answer.body.credential;
    if (typeof account !== 'object' || account === null || typeof issued !== 'string') {
      throw new Error('invalid_pico_relay_account_answer');
    }
    return {
      ok: true,
      value: Object.freeze({
        account: account as PicoRelayAccountSummary,
        credential: issued,
      }),
    };
  }

  /** ADR 0154 RO5. Ends an account. The row stays; the credential stops. */
  public async revokeAccount(input: {
    credential: string;
    accountRef: string;
  }): Promise<PicoRelayOperatorAnswer<true>> {
    const answer = await this.post(
      picoRelayOperatorRoutes.accountRevoke,
      { credential: input.credential },
      { accountRef: input.accountRef },
    );
    return answer.accepted
      ? { ok: true, value: true }
      : { ok: false, refusal: refusalOf(answer.body) };
  }

  /** What this relay holds, minus the keys it no longer keeps. */
  public async listAccounts(
    credential: string,
  ): Promise<PicoRelayOperatorAnswer<readonly PicoRelayAccountSummary[]>> {
    const answer = await this.post(picoRelayOperatorRoutes.accountList, { credential }, {});
    if (!answer.accepted) {
      return { ok: false, refusal: refusalOf(answer.body) };
    }
    const accounts = answer.body.accounts;
    if (!Array.isArray(accounts)) {
      throw new Error('invalid_pico_relay_account_list');
    }
    return { ok: true, value: Object.freeze(accounts as PicoRelayAccountSummary[]) };
  }

  private async post(
    route: string,
    auth: { credential?: string },
    body: unknown,
  ): Promise<{ accepted: boolean; body: Record<string, unknown> }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.call(`${this.baseUrl}${route}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(auth.credential === undefined
            ? {}
            : { [picoRelayOperatorHeader]: assertPicoRelayOperatorCredential(auth.credential) }),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      let parsed: Record<string, unknown> = {};
      try {
        parsed = await response.json() as Record<string, unknown>;
      } catch {
        parsed = {};
      }
      return { accepted: response.ok, body: parsed };
    } finally {
      clearTimeout(timer);
    }
  }
}

function refusalOf(body: Record<string, unknown>): string {
  const refusal = body.refusal ?? body.error;
  // A relay that refused without saying why is still a refusal; inventing a
  // reason would be worse than naming the silence.
  return typeof refusal === 'string' ? refusal : 'relay_refused_without_reason';
}
