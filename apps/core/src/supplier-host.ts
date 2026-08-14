import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  MAX_PICO_SUPPLIER_FRAME_BYTES,
  assertPicoSupplierProtocolVersion,
  picoSupplierRequestFamilies,
  picoSupplierResponseFamily,
  type PicoSupplierRequestFamily,
} from '@pico/protocol/supplier-transport';
import {
  assertPicoSupplierCondition,
  picoSupplierConditionWhileMaterializing,
  type PicoSupplierCondition,
} from '@pico/protocol/supplier-condition';

/**
 * ADR 0136 BR2, the half the contract could not carry - the process itself.
 *
 * `supplier-transport.ts` closed the families and `supplier:check` held the
 * import hull; what neither could do is *be* the boundary. This starts a
 * supplier in its own process and speaks to it over length-prefixed frames,
 * which is ADR 0097's shape and the one ADR 0100 already proved against real
 * ceremonies.
 *
 * **The core spawning a child is not the thing DP4 forbids.** That rule keeps
 * `node:child_process` out of *supplier* code, because a bridge that spawns has
 * walked around ADR 0143 DP3's missing command field. Pico starting Pico's own
 * runner with Pico's own executable is the opposite: it is what "Pico supplies
 * the runtime" means, and it is why the manifest never needed a runtime field.
 *
 * Three properties are load-bearing and none of them is a comment.
 *
 * **The core is the client, in initiative.** Requests only ever leave here; a
 * frame arriving unasked has no request to belong to and is dropped with the
 * connection. A supplier cannot notify, push or schedule, which is what makes
 * ADR 0138 CO4's "may Pico reach it without being asked" a decision about
 * *Pico's* schedule rather than a hope about the supplier's manners.
 *
 * **The version is checked at `hello` and refused, never negotiated**
 * (ADR 0143 DP7). A supplier whose version this core does not know never gets a
 * second request.
 *
 * **Nothing here interprets a result.** The host returns what came back; the
 * class on it is assigned at ADR 0136 BR3's threshold by code that has no
 * parameter for a supplier's opinion. Putting interpretation here would have
 * put it inside the boundary it exists to draw.
 *
 * The one exception proves the rule rather than bending it. `condition` takes
 * a second argument for what **Pico** knows and the supplier cannot - whether
 * a working copy is still arriving - and applies ADR 0136 BR6's substitution
 * with it. That is not interpretation of the supplier's answer; it is a fact
 * from the other side of the boundary, kept in a separate parameter precisely
 * so a supplier can never declare itself patient.
 */
export interface PicoSupplierHello {
  protocolVersion: number;
  slots: readonly string[];
}

export interface PicoSupplierConditionReport {
  condition: PicoSupplierCondition;
  /** Whatever the supplier said beside the condition. Never interpreted here. */
  detail?: unknown;
}

export type PicoSupplierAnswerEnvelope =
  | { status: 'ok'; result: unknown }
  | { status: 'refused'; reason: string };

export interface PicoSupplierHostOptions {
  /** Absolute path to the supplier's entry point (ADR 0143 DP3). */
  entryPoint: string;
  /** Node executable. Defaults to the one running this process. */
  execPath?: string;
  /** How long one request may take before the supplier is treated as gone. */
  requestTimeoutMs?: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const FRAME_LENGTH_PREFIX_BYTES = 4;

function runnerPath(): string {
  return fileURLToPath(new URL('./supplier-runner.mjs', import.meta.url));
}

function encodeFrame(payload: Record<string, unknown>): Buffer {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  if (body.byteLength > MAX_PICO_SUPPLIER_FRAME_BYTES) {
    throw new Error('pico_supplier_frame_too_large');
  }
  const frame = Buffer.allocUnsafe(FRAME_LENGTH_PREFIX_BYTES + body.byteLength);
  frame.writeUInt32BE(body.byteLength, 0);
  body.copy(frame, FRAME_LENGTH_PREFIX_BYTES);
  return frame;
}

export class PicoSupplierHost {
  #child: ChildProcessWithoutNullStreams | undefined;

  #buffered: Buffer = Buffer.alloc(0);

  #pending = new Map<string, {
    resolve: (value: PicoSupplierAnswerEnvelope) => void;
    timer: NodeJS.Timeout;
  }>();

  #closed = false;

  #helloSeen = false;

  public constructor(private readonly options: PicoSupplierHostOptions) {}

  /**
   * ADR 0143 DP7. The first request and the only one whose answer decides
   * whether there is a second: an unknown protocol version ends the connection
   * rather than starting a translation layer.
   */
  public async hello(): Promise<PicoSupplierHello> {
    const answer = await this.#request(picoSupplierRequestFamilies.hello, {});
    if (answer.status !== 'ok') {
      throw new Error(answer.reason);
    }
    const result = answer.result as { protocolVersion?: unknown; slots?: unknown };
    try {
      assertPicoSupplierProtocolVersion(result?.protocolVersion);
    } catch (error) {
      // Closed here rather than left running. A supplier this core cannot speak
      // to is not a supplier to keep a process open for, and leaving it up
      // would invite a caller to try the next family anyway.
      this.close();
      throw error;
    }
    if (!Array.isArray(result?.slots)) {
      this.close();
      throw new Error('invalid_pico_supplier_hello');
    }
    this.#helloSeen = true;
    return Object.freeze({
      protocolVersion: result.protocolVersion as number,
      slots: Object.freeze([...(result.slots as string[])]),
    });
  }

  /**
   * ADR 0138 CO2. What state the supplier is in, asked without asking it to do
   * anything - so `not_configured` costs neither money nor disclosure.
   *
   * The condition is asserted against the closed list, so a supplier inventing
   * a state gets a refusal rather than a place in the vocabulary.
   */
  public async condition(
    payload: Record<string, unknown> = {},
    knowledge: { materializing?: boolean } = {},
  ): Promise<PicoSupplierConditionReport> {
    const answer = await this.#request(picoSupplierRequestFamilies.condition, payload);
    if (answer.status !== 'ok') {
      throw new Error(answer.reason);
    }
    const result = answer.result as { condition?: unknown; detail?: unknown };
    return Object.freeze({
      // ADR 0136 BR6. The supplier answers what it can see; whether a working
      // copy is still arriving is something only the side that started the
      // fetch knows, so it arrives here as *knowledge* rather than as part of
      // the request - a supplier must not be able to declare itself patient.
      condition: picoSupplierConditionWhileMaterializing(
        assertPicoSupplierCondition(result?.condition),
        knowledge.materializing === true,
      ),
      ...(result?.detail === undefined ? {} : { detail: result.detail }),
    });
  }
  /**
   * ADR 0136 BR1's `memory_item` slot. One bounded excerpt, never a corpus.
   *
   * The core asks for a path and a ceiling; what comes back is text the
   * supplier read from disk, with the revision it was read at. Whether that
   * text may then reach a model is not asked here - it is ADR 0117 X4's job
   * and ADR 0151's allowance, both of which happen after this returns.
   */
  public async offer(payload: {
    workingCopy: string;
    path: string;
    maxBytes?: number;
  }): Promise<Record<string, unknown>> {
    const answer = await this.#request(picoSupplierRequestFamilies.offer, payload);
    if (answer.status !== 'ok') {
      // A refused frame is not an empty answer. ADR 0137 IN2 again: the caller
      // has to be able to tell "the supplier would not" from "there is none".
      throw new Error(answer.reason);
    }
    return answer.result as Record<string, unknown>;
  }


  /** Whether `hello` has been answered acceptably. */
  public get ready(): boolean {
    return this.#helloSeen && !this.#closed;
  }

  public close(): void {
    this.#closed = true;
    for (const [, waiter] of this.#pending) {
      clearTimeout(waiter.timer);
      waiter.resolve({ status: 'refused', reason: 'pico_supplier_closed' });
    }
    this.#pending.clear();
    this.#child?.kill('SIGKILL');
    this.#child = undefined;
  }

  #ensureChild(): ChildProcessWithoutNullStreams {
    if (this.#closed) {
      throw new Error('pico_supplier_closed');
    }
    if (this.#child !== undefined) {
      return this.#child;
    }
    const child = spawn(
      this.options.execPath ?? process.execPath,
      [runnerPath(), this.options.entryPoint],
      {
        // ADR 0143 DP3. The environment is not the depot's to shape, so the
        // child gets nothing beyond what Node needs to start. A supplier that
        // could read this process's environment would have the configuration
        // channel the manifest's missing `env` field exists to deny.
        env: { PATH: process.env.PATH ?? '' },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    ) as ChildProcessWithoutNullStreams;

    child.stdout.on('data', (chunk: Buffer) => {
      this.#consume(chunk);
    });
    child.on('exit', () => {
      if (!this.#closed) {
        for (const [, waiter] of this.#pending) {
          clearTimeout(waiter.timer);
          waiter.resolve({ status: 'refused', reason: 'pico_supplier_exited' });
        }
        this.#pending.clear();
        this.#child = undefined;
      }
    });
    this.#child = child;
    return child;
  }

  #consume(chunk: Buffer): void {
    this.#buffered = this.#buffered.byteLength === 0
      ? chunk
      : Buffer.concat([this.#buffered, chunk]);
    for (;;) {
      if (this.#buffered.byteLength < FRAME_LENGTH_PREFIX_BYTES) {
        return;
      }
      const bodyLength = this.#buffered.readUInt32BE(0);
      if (bodyLength === 0 || bodyLength > MAX_PICO_SUPPLIER_FRAME_BYTES) {
        // Checked before the body is buffered, so an oversized declaration
        // fails instead of allocating.
        this.close();
        return;
      }
      if (this.#buffered.byteLength < FRAME_LENGTH_PREFIX_BYTES + bodyLength) {
        return;
      }
      const body = this.#buffered.subarray(
        FRAME_LENGTH_PREFIX_BYTES,
        FRAME_LENGTH_PREFIX_BYTES + bodyLength,
      );
      this.#buffered = Buffer.from(
        this.#buffered.subarray(FRAME_LENGTH_PREFIX_BYTES + bodyLength),
      );
      this.#deliver(body);
    }
  }

  #deliver(body: Buffer): void {
    let frame: { family?: unknown; requestId?: unknown; ok?: unknown; result?: unknown; reason?: unknown };
    try {
      frame = JSON.parse(body.toString('utf8'));
    } catch {
      return;
    }
    if (frame.family !== picoSupplierResponseFamily) {
      // Every response carries one family. Anything else is a supplier
      // speaking out of turn, and there is no inbound family it could be.
      return;
    }
    const waiter = typeof frame.requestId === 'string'
      ? this.#pending.get(frame.requestId)
      : undefined;
    if (waiter === undefined) {
      // A frame belonging to no request. Dropped rather than interpreted: the
      // core is the client here, and an unasked answer is not one.
      return;
    }
    this.#pending.delete(frame.requestId as string);
    clearTimeout(waiter.timer);
    waiter.resolve(frame.ok === true
      ? { status: 'ok', result: frame.result }
      : {
        status: 'refused',
        reason: typeof frame.reason === 'string' ? frame.reason : 'supplier_refused',
      });
  }

  async #request(
    family: PicoSupplierRequestFamily,
    payload: Record<string, unknown>,
  ): Promise<PicoSupplierAnswerEnvelope> {
    const child = this.#ensureChild();
    const requestId = randomBytes(8).toString('hex');
    const frame = encodeFrame({ family, requestId, ...payload });

    return new Promise<PicoSupplierAnswerEnvelope>((resolve) => {
      const timer = setTimeout(() => {
        this.#pending.delete(requestId);
        // ADR 0138 CO2. A supplier that did not answer is `unreachable` from
        // the caller's side, and the caller decides what that costs.
        resolve({ status: 'refused', reason: 'unreachable' });
      }, this.options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
      timer.unref?.();
      this.#pending.set(requestId, { resolve, timer });
      child.stdin.write(frame);
    });
  }
}
