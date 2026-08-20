import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * ADR 0153 PK3 with ADR 0154 - the relay as the thing an operator installs.
 *
 * **`main.ts` had no test.** Every other file here is exercised against a real
 * listener on a real port, which is the right shape and covers the routes. It
 * does not cover the assembly: reading the configuration, refusing without an
 * operator hostname, opening three listeners on three ports, minting the claim
 * code at boot, printing it where an operator will find it, and shutting the
 * whole thing down on a signal. That is the deliverable, and it was the one
 * part nothing ran.
 *
 * So this spawns the built entry point and drives it over HTTP, the way the
 * companion-shell tests spawn a real Electron and a real `.deb`. It walks what
 * an operator actually does, in order: claim the relay, issue an account, take
 * a mailbox, deliver into it without a credential, collect with one,
 * acknowledge, and revoke - checking at each step the thing that step exists
 * to guarantee.
 */

/** `stdio: ['ignore', 'pipe', 'pipe']` gives no stdin, so this is the shape. */
type SpawnedRelay = ChildProcessByStdio<null, Readable, Readable>;

const started: SpawnedRelay[] = [];
const dirs: string[] = [];

afterEach(async () => {
  for (const child of started.splice(0)) {
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      child.once('exit', resolve);
      setTimeout(resolve, 4_000);
    });
  }
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A port nobody else in this suite uses, derived from the worker id. */
const basePort = 14_200 + (Number(process.env.VITEST_WORKER_ID ?? '1') * 10);

interface StartedRelay {
  mailboxPort: number;
  healthPort: number;
  operatorPort: number;
  lines: () => readonly Record<string, unknown>[];
  /** The first line carrying this event, or a failure holding the whole log. */
  waitFor: (event: string) => Promise<Record<string, unknown>>;
  /** SIGTERM and wait, so the next process can have these ports and database. */
  stop: () => Promise<void>;
}

interface RunningRelay extends StartedRelay {
  claimCode: string;
}

/**
 * A relay against a database path the caller chooses, so a test can start a
 * second process against the first one's database - which is the only way to
 * observe what a relay says about itself on a boot that is not its first.
 */
function spawnRelay(databasePath: string, overrides: Record<string, string> = {}): StartedRelay {
  const mailboxPort = basePort;
  const healthPort = basePort + 1;
  const operatorPort = basePort + 2;

  const child = spawn(process.execPath, [join(import.meta.dirname, '..', 'dist', 'main.js')], {
    env: {
      ...process.env,
      PICO_RELAY_OPERATOR: 'relay.example.test',
      PICO_RELAY_HOST: '127.0.0.1',
      PICO_RELAY_PORT: String(mailboxPort),
      PICO_RELAY_HEALTH_PORT: String(healthPort),
      PICO_RELAY_OPERATOR_PORT: String(operatorPort),
      PICO_RELAY_DATABASE_PATH: databasePath,
      ...overrides,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  started.push(child);

  const lines: Record<string, unknown>[] = [];
  let buffered = '';
  child.stdout.on('data', (chunk: Buffer) => {
    buffered += chunk.toString('utf8');
    const parts = buffered.split('\n');
    buffered = parts.pop() ?? '';
    for (const part of parts) {
      if (part.trim() === '') {
        continue;
      }
      lines.push(JSON.parse(part) as Record<string, unknown>);
    }
  });

  return {
    mailboxPort,
    healthPort,
    operatorPort,
    lines: () => lines,
    waitFor: async (event: string): Promise<Record<string, unknown>> => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const found = lines.find((line) => line.event === event);
        if (found !== undefined) {
          return found;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      // The log rather than the event name alone: a relay that logged
      // something else says what it did instead, which is the finding.
      throw new Error(`relay never logged ${event}: ${JSON.stringify(lines)}`);
    },
    stop: async (): Promise<void> => {
      const index = started.indexOf(child);
      if (index >= 0) {
        started.splice(index, 1);
      }
      child.kill('SIGTERM');
      await new Promise((resolve) => {
        child.once('exit', resolve);
        setTimeout(resolve, 5_000);
      });
    },
  };
}

async function startRelay(overrides: Record<string, string> = {}): Promise<RunningRelay> {
  const dir = mkdtempSync(join(tmpdir(), 'pico-relay-process-'));
  dirs.push(dir);
  const relay = spawnRelay(join(dir, 'relay.sqlite'), overrides);
  const unclaimed = await relay.waitFor('relay_unclaimed');
  return { ...relay, claimCode: unclaimed.claimCode as string };
}

const post = async (port: number, path: string, body: unknown, headers: Record<string, string> = {}) => {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
};

/** ADR 0147 RY6. An expiry only lands if it sits on the fifteen-minute grid. */
function onTheBucket(hoursAhead: number): string {
  const bucketMs = 15 * 60 * 1_000;
  const wanted = Date.now() + (hoursAhead * 60 * 60 * 1_000);
  return new Date((Math.floor(wanted / bucketMs) + 1) * bucketMs).toISOString();
}

const hex32 = () => Array.from({ length: 32 }, () =>
  '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');

describe('the relay process an operator installs', () => {
  it('walks claim, account, mailbox, delivery, collection and revocation', async () => {
    const relay = await startRelay();

    // The health port answers, and it is the one a container probes.
    const health = await fetch(`http://127.0.0.1:${relay.healthPort}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok' });

    // ADR 0155 HR2. There is no `/data/options.json` on a build machine, so
    // this is the plain container path saying so out loud. The Home Assistant
    // half is a unit test; what belongs here is that the detection runs at all.
    expect((await relay.waitFor('relay_listening')).platform).toBe('container');

    /**
     * ADR 0154. The claim code is printed once, at boot, on stdout - which is
     * where an operator reading `docker logs` will find it, and the only place
     * it exists.
     */
    const claimed = await post(relay.operatorPort, '/operator/claim', {
      claimCode: relay.claimCode,
    });
    expect(claimed.status).toBe(200);
    expect(claimed.body.operator).toBe('relay.example.test');
    const operatorCredential = claimed.body.credential as string;
    expect(operatorCredential).toMatch(/^[0-9a-f]{32}$/u);

    // Single use. A code that still worked would be a second key to the relay
    // sitting in a log file.
    expect((await post(relay.operatorPort, '/operator/claim', {
      claimCode: relay.claimCode,
    })).body.refusal).toBe('already_claimed');

    // ADR 0154 RO3. The relay generates the account credential and hands it
    // back exactly once.
    const created = await post(relay.operatorPort, '/operator/accounts/create', {
      mailboxQuota: 4,
      maxCapacity: 16,
    }, { 'x-pico-relay-operator': operatorCredential });
    const accountCredential = created.body.credential as string;
    const accountRef = (created.body.account as { accountRef: string }).accountRef;
    expect(accountCredential).toMatch(/^[0-9a-f]{32}$/u);

    /**
     * And never again. **Trying to falsify this found that the defect cannot
     * be built**: the store keys accounts by `account_digest` and never holds
     * the credential, so a route that wanted to leak one would have nothing to
     * read. The assertion stays because it is cheap and it is what a future
     * caching layer would break first; the guarantee itself is structural.
     */
    const listed = await post(relay.operatorPort, '/operator/accounts/list', {},
      { 'x-pico-relay-operator': operatorCredential });
    expect(JSON.stringify(listed.body)).not.toContain(accountCredential);
    expect(listed.body.accounts).toMatchObject([{ accountRef, status: 'active' }]);

    const mailbox = hex32();
    const tag = hex32();
    const expiresAt = onTheBucket(1);

    expect((await post(relay.mailboxPort, '/relay/register', { mailbox, capacity: 8 },
      { 'x-pico-relay-account': accountCredential })).body).toEqual({ registered: true });

    /**
     * ADR 0149 RS3 with ADR 0147 RY1. **Delivered with no credential at all.**
     * There is nothing on a packet to authenticate, and attaching an account
     * anyway would tell the operator which of its customers is talking to
     * which mailbox - the graph the envelope was shaped to avoid.
     */
    expect((await post(relay.mailboxPort, '/relay/deliver', {
      schema: 'pico.link.packet.v1',
      to: `${mailbox}@relay.example.test`,
      tag,
      expiresAt,
      payload: 'aGVsbG8gcGljbw==',
    })).body).toEqual({ outcome: 'accepted' });

    const collected = await post(relay.mailboxPort, '/relay/collect', { mailbox },
      { 'x-pico-relay-account': accountCredential });
    expect(collected.body.packets).toEqual([{
      tag,
      expiresAt,
      // Opaque here and only here: the relay carries bytes it cannot read.
      payload: 'aGVsbG8gcGljbw==',
    }]);

    // ADR 0149 RS5. Collecting removes nothing; acknowledging does.
    expect((await post(relay.mailboxPort, '/relay/acknowledge', { mailbox, tags: [tag] },
      { 'x-pico-relay-account': accountCredential })).body).toEqual({ removed: 1 });
    expect((await post(relay.mailboxPort, '/relay/collect', { mailbox },
      { 'x-pico-relay-account': accountCredential })).body.packets).toEqual([]);

    /**
     * ADR 0154 RO5. Revocation says what ended, because nothing else can
     * observe it: the mailboxes and the packets are gone by the time anybody
     * could look.
     */
    for (const _ of [0, 1, 2]) {
      await post(relay.mailboxPort, '/relay/deliver', {
        schema: 'pico.link.packet.v1',
        to: `${mailbox}@relay.example.test`,
        tag: hex32(),
        expiresAt,
        payload: 'aGk=',
      });
    }
    expect((await post(relay.operatorPort, '/operator/accounts/revoke', { accountRef },
      { 'x-pico-relay-operator': operatorCredential })).body).toMatchObject({
      accountRef,
      status: 'revoked',
      mailboxesEnded: 1,
      packetsDropped: 3,
    });

    // The credential stops working, and the mailbox is not theirs any more.
    expect((await post(relay.mailboxPort, '/relay/collect', { mailbox },
      { 'x-pico-relay-account': accountCredential })).body.refusal).toBe('mailbox_not_yours');
  }, 60_000);

  it('says it holds no accounts only once somebody has claimed it', async () => {
    /**
     * ADR 0153 PK7 after ADR 0154. **A relay has two empty states, and they
     * are not the same sentence.**
     *
     * PK7 asks that a relay with no accounts say so rather than look broken.
     * ADR 0154 then put a claim in front of provisioning, so the boot log of a
     * relay nobody has claimed says *that* instead - accounts are not what
     * stands between it and being useful yet. The unprovisioned line moved to
     * the boot after the claim, and nothing ran that boot: the container smoke
     * test in CI was grepping the first one for it, which is a check that
     * could not pass and read as a broken image for two days.
     */
    const dir = mkdtempSync(join(tmpdir(), 'pico-relay-claimed-'));
    dirs.push(dir);
    const databasePath = join(dir, 'relay.sqlite');

    const first = spawnRelay(databasePath);
    const unclaimed = await first.waitFor('relay_unclaimed');
    expect(first.lines().map((line) => line.event)).not.toContain('relay_accounts_unprovisioned');
    expect((await post(first.operatorPort, '/operator/claim', {
      claimCode: unclaimed.claimCode as string,
    })).status).toBe(200);
    await first.stop();

    const second = spawnRelay(databasePath);
    const message = String((await second.waitFor('relay_accounts_unprovisioned')).message);
    // Named as the door names it, because that is what the operator will see
    // in the refusal they are trying to explain.
    expect(message).toContain('unknown_account');

    /**
     * And no second claim code. The check costs one line and it is the one
     * that would catch a database the container never actually kept: a relay
     * that forgot the claim would mint another key to itself here, in a log.
     */
    expect(second.lines().map((line) => line.event)).not.toContain('relay_unclaimed');
    await second.stop();
  }, 60_000);

  it('spends the unauthenticated budget before the operator’s', async () => {
    /**
     * ADR 0154 RO9. The bucket does not exist to make a 128-bit credential
     * harder to guess - the entropy ends that argument. It exists so a port
     * somebody deliberately exposed cannot be turned into a load generator.
     */
    const relay = await startRelay();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 14; attempt += 1) {
      statuses.push((await post(relay.operatorPort, '/operator/claim',
        { claimCode: 'not-the-code' })).status);
    }
    expect(statuses.filter((status) => status === 429).length).toBeGreaterThan(0);
    // And the refusals before the limit are about the code, not the budget.
    expect(statuses[0]).not.toBe(429);
  }, 60_000);

  it('refuses to start without the hostname senders resolve to', async () => {
    /**
     * ADR 0147 RY3. A sender derives the operator from the address it is
     * given, so a relay that did not know its own hostname would hand out
     * addresses nobody can reach. Refusing at boot is the only moment that
     * fact is cheap to fix.
     */
    const dir = mkdtempSync(join(tmpdir(), 'pico-relay-nohost-'));
    dirs.push(dir);
    const child = spawn(process.execPath, [join(import.meta.dirname, '..', 'dist', 'main.js')], {
      env: {
        ...process.env,
        PICO_RELAY_OPERATOR: '',
        PICO_RELAY_DATABASE_PATH: join(dir, 'relay.sqlite'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    started.push(child);

    /**
     * **On stdout, and that is the design rather than an oversight.** This
     * file emits one line of JSON per event on stdout because a relay's log is
     * an operator's - and a failure that went to a second stream would be the
     * one line missing from the record they actually read. The first version
     * of this test watched stderr, found it empty, and nearly reported a relay
     * that dies silently.
     */
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString('utf8'); });
    const code = await new Promise<number | null>((resolve) => {
      child.once('exit', resolve);
      setTimeout(() => resolve(null), 10_000);
    });
    expect(code).not.toBe(0);
    const failure = output.split('\n').filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((line) => line.event === 'relay_startup_failed');
    expect(failure).toBeDefined();
    // The variable by name, and why it cannot be guessed.
    expect(String(failure?.error)).toContain('PICO_RELAY_OPERATOR');
    expect(String(failure?.error)).toContain('hostname senders resolve');
  }, 30_000);
});
