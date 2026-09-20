import { spawnSync } from 'node:child_process';

/**
 * ADR 0027 IM1. The platform-backed substrate for the ADR 0110 R6 anchor.
 *
 * The filesystem anchor is honest about what it is not: it lives outside every
 * restorable Foundation snapshot, but a whole-filesystem rollback takes it with
 * everything else. That residual is named in ADR 0110, and it became
 * load-bearing three times over - recovery consumption (0110), the time floor
 * for objection windows (0120) and the audit checkpoint heads (0121).
 *
 * A monotonic counter the operating system cannot rewind closes it. The counter
 * does not store the anchor; it witnesses the anchor's generation. Each write
 * bumps the counter, and the document records the value it was written at, so a
 * document restored from an earlier generation carries a value the platform has
 * already passed - and says so without needing to know it was restored.
 *
 * The counter is a narrow port on purpose. A TPM is one implementation; a
 * secure element or a platform monotonic service is another, and the anchor
 * must not learn the difference.
 */
export interface PicoPlatformAnchorCounter {
  /** The current value. Never decreases across the life of the platform. */
  read(): number;
  /** Advances by exactly one and returns the new value. */
  increment(): number;
}

export const picoPlatformAnchorSubstrates = ['platform_counter', 'filesystem'] as const;
export type PicoPlatformAnchorSubstrate = typeof picoPlatformAnchorSubstrates[number];

/**
 * ADR 0027 IM1: hardware without a secure element does not become a lesser
 * appliance by silent downgrade. The substrate in use is stated, and when it is
 * the filesystem the reason is stated with it - so "no platform anchor" is
 * something the person was told, not something they were left to infer.
 */
export interface PicoPlatformAnchorStatus {
  substrate: PicoPlatformAnchorSubstrate;
  active: boolean;
  /** Present only when the platform counter is not in use. */
  reason?: string;
}

/**
 * The rollback verdict for a document that claims to have been written at
 * `documentValue` while the platform counter reads `counterValue`.
 *
 * `pending_write` is the crash window and the reason the ordering is what it
 * is. The document is written first and the counter bumped after, so a crash
 * between the two leaves a document one generation ahead of the counter. That
 * direction is safe: the anchor's own rule is already that being ahead costs
 * one re-initiation while being behind resurrects a spent authorization.
 * Writing the counter first would invert it and brick the anchor on any crash.
 */
export const picoPlatformAnchorVerdicts = [
  'consistent',
  'pending_write',
  'rolled_back',
  'foreign_counter',
] as const;
export type PicoPlatformAnchorVerdict = typeof picoPlatformAnchorVerdicts[number];

export function verifyPicoPlatformAnchorGeneration(input: {
  documentValue: number | null;
  counterValue: number;
}): PicoPlatformAnchorVerdict {
  const { documentValue, counterValue } = input;
  if (!Number.isSafeInteger(counterValue) || counterValue < 0) {
    throw new Error('invalid_pico_platform_anchor_counter');
  }
  if (documentValue === null) {
    // A document that never took ownership. Adopting the counter as it stands
    // is correct here and only here: there is no earlier generation to have
    // been rolled back to.
    return 'consistent';
  }
  if (!Number.isSafeInteger(documentValue) || documentValue < 0) {
    throw new Error('invalid_pico_platform_anchor_generation');
  }
  if (documentValue === counterValue) {
    return 'consistent';
  }
  if (documentValue === counterValue + 1) {
    return 'pending_write';
  }
  if (documentValue < counterValue) {
    // The platform witnessed generations this document has never seen. That is
    // exactly the whole-filesystem rollback the counter exists to catch.
    return 'rolled_back';
  }
  // Further ahead than one write can explain: this document was written
  // against a different counter - a cloned image, a replaced secure element, a
  // hand-edited file. Not a rollback, and not something to guess about.
  return 'foreign_counter';
}

export interface PicoTpm2CounterOptions {
  /** NV index holding the counter, as tpm2-tools spells it. */
  nvIndex?: string;
  /** Overrides the TCTI; absent uses whatever the platform default is. */
  tcti?: string;
  /**
   * Injected so the adapter can be exercised against a software TPM without
   * reaching for the machine's real one. Defaults to `spawnSync`.
   */
  run?: PicoTpm2Spawn;
}

export type PicoTpm2Spawn = (
  command: string,
  args: readonly string[],
  options: { env: NodeJS.ProcessEnv; timeout: number; maxBuffer: number },
) => { status: number | null; stdout: Buffer | string; stderr: Buffer | string; error?: Error };

/** The Pico anchor counter's NV index. Owner-readable, owner-writable. */
export const picoTpm2AnchorNvIndex = '0x1500016';
export const picoTpm2CommandTimeoutMs = 10_000;

/**
 * ADR 0027 IM1. The TPM implementation of the counter port, over tpm2-tools.
 *
 * A TPM NV counter of type `nt=1` can only be incremented; there is no write
 * that sets it, and no command that lowers it. That is the entire property this
 * needs, which is why the adapter is this small - the security does not live in
 * this file, it lives in the hardware refusing.
 */
/**
 * What `tpm2_*` gets to see of this process (2026-09-20, finding B227).
 *
 * **The posture is written twice in this tree already** and was missing here.
 * `supplier-host.ts` gives a supplier `{ PATH }` and says why: *"a supplier
 * that could read this process's environment would have the configuration
 * channel the manifest's missing `env` field exists to deny"*. `depot-fetch.ts`
 * repeats it for `git`: *"`git` gets what it needs to run and nothing about
 * this process"*. This adapter handed over `{ ...process.env }` - the whole
 * environment of a Home, which is where `PICO_FOUNDATION_TOKEN` lives, beside
 * every path this Home keeps its keys at.
 *
 * `tpm2_*` is a trusted system binary and does not exfiltrate anything, so
 * nothing was leaking. What was missing is the reason: a child gets what it
 * needs, and the token is not it. The exposure that remains is ordinary - the
 * same user, the same machine - and the rule is cheap enough that arguing
 * about the size of the hole is more expensive than closing it.
 *
 * **The tool's own namespace passes through**, because that is how tpm2-tools
 * is configured (`TPM2TOOLS_TCTI` and its siblings) and an operator who set
 * one meant it. `PATH` passes because the command is resolved through it.
 * Nothing else does.
 */
export function picoTpm2Environment(tcti?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? '' };
  for (const [name, value] of Object.entries(process.env)) {
    if (name.startsWith('TPM2TOOLS_') && value !== undefined) {
      env[name] = value;
    }
  }
  if (tcti !== undefined) {
    env.TPM2TOOLS_TCTI = tcti;
  }
  return env;
}

export function openPicoTpm2AnchorCounter(
  options: PicoTpm2CounterOptions = {},
): PicoPlatformAnchorCounter {
  const nvIndex = options.nvIndex ?? picoTpm2AnchorNvIndex;
  const run = options.run ?? defaultTpm2Spawn;
  const env = picoTpm2Environment(options.tcti);

  const call = (command: string, args: readonly string[]): Buffer => {
    const result = run(command, args, {
      env,
      timeout: picoTpm2CommandTimeoutMs,
      maxBuffer: 64 * 1_024,
    });
    if (result.error !== undefined) {
      throw new Error(`pico_tpm2_unavailable:${command}:${result.error.message}`);
    }
    if (result.status !== 0) {
      const stderr = Buffer.isBuffer(result.stderr)
        ? result.stderr.toString('utf8')
        : String(result.stderr ?? '');
      throw new Error(`pico_tpm2_failed:${command}:${stderr.trim().split('\n').pop() ?? ''}`);
    }
    return Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(String(result.stdout));
  };

  const readValue = (): number => {
    const raw = call('tpm2_nvread', [nvIndex]);
    if (raw.length !== 8) {
      throw new Error(`pico_tpm2_unexpected_counter_width:${raw.length}`);
    }
    const value = raw.readBigUInt64BE(0);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      // Refusing beats silently rounding: a counter compared with `===` after
      // a lossy conversion would call a rollback consistent.
      throw new Error('pico_tpm2_counter_out_of_range');
    }
    return Number(value);
  };

  return {
    read: readValue,
    increment: () => {
      call('tpm2_nvincrement', [nvIndex]);
      return readValue();
    },
  };
}

const defaultTpm2Spawn: PicoTpm2Spawn = (command, args, spawnOptions) => spawnSync(
  command,
  [...args],
  { env: spawnOptions.env, timeout: spawnOptions.timeout, maxBuffer: spawnOptions.maxBuffer },
);
