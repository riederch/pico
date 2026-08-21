import {
  parsePicoModelProviderEntry,
  picoModelProviderEntrySchema,
  type PicoModelProviderClass,
  type PicoModelProviderEntry,
} from '@pico/protocol/model-provider';

/**
 * ADR 0142 PE2 - the thing that makes an entry an observation.
 *
 * An entry is measured rather than asked, so something has to do the
 * measuring. This is that something: it talks to one host, watches what it
 * actually does, and hands back an entry plus everything it saw that the entry
 * has no field for.
 *
 * **It measures and never decides.** The class is a person's judgement about
 * their own premises (ADR 0048), the allowance follows a credential (ADR 0151
 * PV1), and neither is observable from here - so both arrive as parameters and
 * this module refuses to guess either. What it produces is a candidate that
 * still has to pass `parsePicoModelProviderEntry`, which is where the refusals
 * live; a measurer that wrote entries directly would be a second contract.
 *
 * **What it cannot see is reported rather than omitted.** A host that answers
 * an unauthenticated request has told us its reach is unauthenticated, and
 * that is a finding under ADR 0142 PE5 - it narrows the allowance rather than
 * disqualifying the entry, and the person reading the run should be told in
 * words rather than by an absent field.
 */

/**
 * The dialect this adapter speaks, which is one implementation's HTTP API.
 *
 * **The name stays out of the type**, for ADR 0036's reason one layer over:
 * Pico must not become architecturally dependent on a protocol, and the
 * fastest way to acquire that dependency is to let a vendor's name into the
 * shapes the core passes around. A second implementation gets a second
 * adapter; nothing above this file learns which one answered.
 */
export interface PicoModelProviderCatalogEntry {
  name: string;
  digest: string;
  size?: number;
  details?: { parameter_size?: string; quantization_level?: string };
}

export interface PicoModelProviderGenerationTimings {
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
  total_duration?: number;
}

export interface PicoModelProviderContextObservation {
  /** What `num_ctx` was set to for this run. */
  requestedContextTokens: number;
  promptTokens: number;
  generationTokensPerSecond: number;
  promptTokensPerSecond: number;
  /**
   * Whether the host kept the whole deployment on the accelerator during this
   * step, as `/api/ps` reports it.
   *
   * **Kept because it is cheap and honest, not because it detects anything.**
   * It was added to catch the moment the KV cache stops fitting beside the
   * weights; on the measured host it never moves, because `size_vram` tracks
   * the weights and not the cache. The thing it was meant to find is found by
   * `windowCost` instead, with a stopwatch.
   */
  fullyOnAccelerator: boolean | null;
}

export interface PicoModelProviderMeasurementReport {
  reach: string;
  serverVersion: string | null;
  model: { identifier: string; digestHex: string; parameterSize: string | null; quantization: string | null };
  /** What the model says about itself. Never enters the entry (PE2). */
  nominalContextTokens: number | null;
  capabilities: readonly string[];
  contextSteps: readonly PicoModelProviderContextObservation[];
  coldLoadMs: number | null;
  reloadMs: number | null;
  keepAliveMs: number;
  concurrentJobs: number | null;
  /** Bytes resident on the accelerator while loaded, if the host says. */
  residentBytes: number | null;
  /**
   * The narrowest measured context at which part of the deployment was pushed
   * off the accelerator. Null when every step stayed resident - which is not
   * proof that no such width exists, only that none was measured.
   */
  spilledFromTokens: number | null;
  /**
   * ADR 0142's slope, measured the way it actually behaves.
   *
   * **The declared window costs throughput even when nothing uses it.** With
   * the prompt held constant, the measured host generates 18.0 tok/s at a
   * declared 8192 and 9.5 at 32768 - the same work, the same prompt, a
   * different `num_ctx`. So the width in an entry is not only a ceiling on
   * what fits; it is a price every job pays, including the short ones.
   *
   * That reframes ADR 0142's reasoning without contradicting its number: it
   * reads the fall as a function of *actual* context, and it is a function of
   * the *declared* one. Null when the model declares no wider window to
   * compare against.
   */
  windowCost: {
    atServedTokens: number;
    servedTokensPerSecond: number;
    atNominalTokens: number;
    nominalTokensPerSecond: number;
  } | null;
  /**
   * The widest declared window that costs nothing, found by walking upward
   * until throughput drops.
   *
   * **This is the number an entry should state, and it is not the number
   * anybody guesses.** On the measured host it is 12288 where ADR 0142 states
   * 8192 - half again the window, for free, left on the table because the
   * figure was reasoned from the card's nominal size rather than walked. The
   * usable budget turned out to be about a gigabyte smaller than the card:
   * compute buffers and the driver's own context are not in any spec sheet.
   */
  widestFreeWindowTokens: number | null;
  widestFreeWindowTokensPerSecond: number | null;
  /** What the model's own metadata implies one token of KV cache costs. */
  kvBytesPerToken: number | null;
  /**
   * ADR 0142 PE5. True when a request carrying no credential was answered.
   *
   * **Measured rather than assumed since 2026-08-21.** It was the constant
   * `true` for as long as the measurer had no way to authenticate, where it
   * restated the run having got as far as reading it. A measurer that sends a
   * credential cannot say that any more, so this is now one deliberate bare
   * request. `null` is the third answer: the host said something that is
   * neither a refusal nor an answer, and PE5 went unmeasured.
   */
  answeredWithoutCredential: boolean | null;
  /**
   * ADR 0151 PV5, and the hole PV5 alone does not close.
   *
   * **The parser can check that a transport protects a credential. It cannot
   * check that the far side reads one.** An entry pointed at a proxy that
   * answers any bearer - or none - passes every rule in the tree and still
   * says "this provider proved who it is" when nothing was proved.
   *
   * A measurement can tell, and it costs one request: send a credential that
   * cannot be right and see whether the host refuses it. `false` here means a
   * credential on this entry would be decoration.
   */
  refusesAWrongCredential: boolean | null;
  notes: readonly string[];
}

export interface PicoModelProviderMeasureOptions {
  reach: string;
  model: string;
  /** ADR 0048. A person's judgement, never a measurement. */
  providerClass: PicoModelProviderClass;
  entryId: string;
  /**
   * ADR 0151 PV1. The secret a job on this entry would send, if the host reads
   * one.
   *
   * **The plain secret rather than a reference, and only for the length of one
   * measurement.** Custody lives where ADR 0138 CO1 put it - sealed under its
   * own key domain in `ModelProviderCredentialCrypto` - and the caller opens
   * it there and hands it here. The measurer holds no store, writes nothing
   * and outlives no run, which is what makes taking the secret itself the
   * smaller surface rather than the larger one.
   *
   * Absent measures an open host, which is what every measurement did before
   * one was secured.
   */
  credential?: string;
  /** Contexts to measure generation at, in tokens. */
  contextSteps?: readonly number[];
  /** ADR 0142 PE4. Unloading first is the only way to observe a cold load. */
  measureColdLoad?: boolean;
  /** Two jobs at once, to see whether the second waits (PE3). */
  measureConcurrency?: boolean;
  keepAliveSeconds?: number;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  log?: (line: string) => void;
}

const nanosecondsPerSecond = 1_000_000_000;
const nanosecondsPerMillisecond = 1_000_000;

function rate(count: number | undefined, durationNs: number | undefined): number | null {
  if (typeof count !== 'number' || typeof durationNs !== 'number' || durationNs <= 0) {
    return null;
  }
  return (count * nanosecondsPerSecond) / durationNs;
}

/**
 * A prompt long enough to put roughly `tokens` in the context window, and a
 * task long enough that the answer is worth timing.
 *
 * **The instruction is the load-bearing half, and the first version of this
 * got it wrong.** It ended with "answer with the single word: ok", the model
 * obliged in two tokens, and the resulting figure - 32 tok/s against ADR
 * 0142's 17.8 on the same host - was per-token overhead wearing the shape of a
 * generation rate. `num_predict` is a ceiling, never a target: a model that is
 * finished stops, and a rate over two tokens measures the stopping.
 *
 * Four characters per token is the conventional English approximation and it
 * is wrong in both directions for any particular text - which is why the
 * report carries the `prompt_eval_count` the **host** returned rather than
 * this estimate. The padding decides how much work the run does; the host
 * decides what the number is.
 */
function paddingPrompt(tokens: number): string {
  const filler = 'The quick brown fox jumps over the lazy dog. ';
  const target = tokens * 4;
  let text = '';
  while (text.length < target) {
    text += filler;
  }
  return `${text}\n\nWrite a long, detailed commentary on the text above. `
    + 'Keep writing continuously and do not stop early.';
}

/**
 * ADR 0142 PE2. Below this many generated tokens, a rate is not a rate.
 *
 * Startup cost is amortised over the answer, so a handful of tokens reports
 * the overhead rather than the throughput. A step that lands here is dropped
 * with a note rather than averaged in, because a wrong number in an entry is
 * worse than a missing one - PE2 exists to keep entries observational.
 */
const minGenerationTokens = 32;

export class PicoModelProviderMeasurer {
  private readonly call: typeof globalThis.fetch;

  private readonly reach: string;

  private readonly log: (line: string) => void;

  private readonly now: () => number;

  public constructor(private readonly options: PicoModelProviderMeasureOptions) {
    this.call = options.fetch ?? globalThis.fetch;
    this.reach = options.reach.replace(/\/+$/u, '');
    this.log = options.log ?? (() => {});
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * ADR 0151 PV1. Every probe carries what a job would carry.
   *
   * **A measurement of a path no job takes measures nothing.** Once a host
   * reads a credential, an unauthenticated measurer observes exactly one
   * thing - 401 at the first endpoint it touches - and that is not a fact
   * about the deployment's window, its throughput or its lanes. So the secret
   * rides on every request here, in the header `PicoModelRuntime.dispatch`
   * uses, and the capacity in the report is capacity on the path the work will
   * actually run on.
   *
   * The two probes that ask *about* credentials are deliberately outside this:
   * one sends a credential that cannot be right, the other sends none, and
   * both would be answering their own question if they came through here.
   */
  private headers(extra?: Record<string, string>): Record<string, string> {
    const credential = this.options.credential;
    return {
      ...extra,
      ...(credential === undefined ? {} : { authorization: `Bearer ${credential}` }),
    };
  }

  private async get(path: string): Promise<unknown> {
    const response = await this.call(`${this.reach}${path}`, {
      method: 'GET',
      headers: this.headers(),
    });
    if (!response.ok) {
      throw new Error(`pico_model_provider_probe_failed:${path}:${response.status}`);
    }
    return await response.json();
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const response = await this.call(`${this.reach}${path}`, {
      method: 'POST',
      headers: this.headers({ 'content-type': 'application/json' }),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`pico_model_provider_probe_failed:${path}:${response.status}`);
    }
    return await response.json();
  }

  private async generate(input: {
    prompt: string;
    contextTokens?: number;
    keepAlive: string | number;
    predict?: number;
  }): Promise<PicoModelProviderGenerationTimings> {
    return await this.post('/api/generate', {
      model: this.options.model,
      prompt: input.prompt,
      stream: false,
      keep_alive: input.keepAlive,
      options: {
        ...(input.contextTokens === undefined ? {} : { num_ctx: input.contextTokens }),
        num_predict: input.predict ?? 64,
        temperature: 0,
      },
    }) as PicoModelProviderGenerationTimings;
  }

  /** Every model the host currently holds on the accelerator. */
  private async resident(): Promise<Array<{ name: string; sizeVram: number }>> {
    const loaded = await this.get('/api/ps') as {
      models?: Array<{ name?: string; size_vram?: number }>;
    };
    return (loaded.models ?? [])
      .filter((model): model is { name: string; size_vram?: number } => typeof model.name === 'string')
      .map((model) => ({ name: model.name, sizeVram: model.size_vram ?? 0 }));
  }

  /**
   * ADR 0142 PE1. **A deployment sharing its accelerator with another model is
   * a different deployment**, and measuring it produces numbers about the pair.
   *
   * This is not hypothetical and it is not subtle. Measuring three models in a
   * row with a five-minute keep-alive left the first still resident while the
   * second loaded, and a 14B model reported 3.4 tok/s at a narrow window and
   * 28.2 at a wide one - faster with more work, which is impossible and was
   * the tell. The card had been shared for the first figure and not for the
   * second.
   *
   * So the run takes the card before it measures, and looks again afterwards:
   * a model that appeared in between belongs to somebody else using the host,
   * and the numbers are theirs as much as ours.
   */
  private async takeTheAccelerator(notes: string[]): Promise<void> {
    const others = (await this.resident()).filter((model) => model.name !== this.options.model);
    for (const model of others) {
      this.log(`evicting ${model.name}, which is holding the accelerator`);
      // No prompt: this is an unload, not a generation.
      await this.post('/api/generate', { model: model.name, keep_alive: 0 });
      notes.push(
        `${model.name} was resident when this run started and was evicted, because `
        + 'a deployment sharing its accelerator is a different deployment.',
      );
    }
    const left = (await this.resident()).filter((model) => model.name !== this.options.model);
    if (left.length > 0) {
      notes.push(
        `${left.map((model) => model.name).join(', ')} would not release the accelerator; `
        + 'every figure below is about the pair rather than about this deployment.',
      );
    }
  }

  /**
   * ADR 0142 PE5, asked instead of assumed.
   *
   * **One deliberate bare request, at the cheapest endpoint on the host.** It
   * reads in both directions: an open host answers it, a secured one refuses
   * it, so the same probe carries PE5's finding whether or not this
   * measurement was authenticated - where the old constant could only ever
   * describe the open case it was written in.
   *
   * The note it can push is the one that matters most on a host somebody has
   * just put a proxy in front of. A credential sent to a host that also
   * answers without one distinguishes this Home from nobody, and ADR 0151 PV1
   * spends that proof on retrieved memory - somebody else's remembered words,
   * on the strength of a lock the door does not have.
   */
  private async answersWithoutACredential(notes: string[]): Promise<boolean | null> {
    let answered: boolean | null;
    try {
      const probed = await this.call(`${this.reach}/api/version`, { method: 'GET' });
      if (probed.status === 401 || probed.status === 403) {
        answered = false;
      } else if (probed.ok) {
        answered = true;
      } else {
        answered = null;
        notes.push(
          `a request carrying no credential answered ${probed.status}, which is neither a `
          + 'refusal nor an answer, so ADR 0142 PE5 went unmeasured on this run.',
        );
      }
    } catch {
      // Unreachable without a credential where it was reachable with one is
      // not a thing a network does; it is a thing that could not be told.
      answered = null;
    }
    if (answered === true && this.options.credential !== undefined) {
      notes.push(
        'this host answers a request carrying no credential at all, so the credential '
        + 'this measurement sent distinguishes it from nobody who can reach the port. '
        + 'ADR 0151 PV1 spends that proof on retrieved memory, and there is none here to spend.',
      );
    }
    this.log(answered === null
      ? 'could not tell whether a bare request is answered'
      : answered
        ? 'a request carrying no credential is answered'
        : 'a request carrying no credential is refused');
    return answered;
  }

  public async measure(): Promise<PicoModelProviderMeasurementReport> {
    const notes: string[] = [];
    const keepAliveSeconds = this.options.keepAliveSeconds ?? 300;
    const steps = this.options.contextSteps ?? [4096, 8192];

    const version = await this.get('/api/version') as { version?: string };
    this.log(`reachable, server version ${version.version ?? 'unknown'}`);
    const answeredWithoutCredential = await this.answersWithoutACredential(notes);

    await this.takeTheAccelerator(notes);

    const tags = await this.get('/api/tags') as { models?: PicoModelProviderCatalogEntry[] };
    const summary = (tags.models ?? []).find((entry) => entry.name === this.options.model);
    if (summary === undefined) {
      throw new Error(`pico_model_provider_model_not_served:${this.options.model}`);
    }
    // PE6. The tag is what a person types; the digest is what was measured.
    const digestHex = summary.digest.replace(/^sha256:/u, '').toLowerCase();

    const shown = await this.post('/api/show', { model: this.options.model }) as {
      capabilities?: string[];
      model_info?: Record<string, unknown>;
      details?: { parameter_size?: string; quantization_level?: string };
    };
    const info = shown.model_info ?? {};
    const architectureValue = (suffix: string): number | null => {
      const key = Object.keys(info).find((name) => name.endsWith(suffix));
      const value = key === undefined ? undefined : info[key];
      return typeof value === 'number' ? value : null;
    };
    // Two entries per token, one key and one value, over every block, and
    // `q8_0` is a byte an element. The arithmetic is here because it explains
    // the probe below rather than replacing it: a number that agrees with a
    // measurement is worth more than either alone.
    const blocks = architectureValue('.block_count');
    const kvHeads = architectureValue('.attention.head_count_kv');
    const keyLength = architectureValue('.attention.key_length');
    const valueLength = architectureValue('.attention.value_length');
    const kvBytesPerToken = blocks === null || kvHeads === null
      || keyLength === null || valueLength === null
      ? null
      : blocks * kvHeads * (keyLength + valueLength);
    const contextKey = Object.keys(shown.model_info ?? {})
      .find((key) => key.endsWith('.context_length'));
    const nominalContextTokens = contextKey === undefined
      ? null
      : Number((shown.model_info ?? {})[contextKey]);
    if (nominalContextTokens !== null) {
      // Recorded in the report and refused by the entry. This is PE2's whole
      // point standing next to its own counter-example.
      notes.push(
        `the model declares ${nominalContextTokens} tokens of context; the entry `
        + 'states what this host was measured serving.',
      );
    }

    let coldLoadMs: number | null = null;
    let reloadMs: number | null = null;
    if (this.options.measureColdLoad === true) {
      // **Three states, and only two of them are visible from here.** The
      // model is resident, or evicted with its weights in the host page cache,
      // or evicted with a cold disk. A request while it is resident reports a
      // load of a few hundred milliseconds, which is not a load at all - the
      // first version of this recorded that as the reload figure and produced
      // 0.3 s where ADR 0142 measured 8.
      //
      // So both figures here are post-eviction loads: the first after this
      // run's own eviction, the second after a second one. Neither can reach
      // the disk-cold case, because dropping the host's page cache needs root
      // on somebody else's machine. That is stated in the notes rather than
      // guessed at.
      this.log('evicting the model to observe a load');
      await this.generate({ prompt: 'ok', keepAlive: 0, predict: 1 });
      const first = await this.generate({ prompt: 'ok', keepAlive: keepAliveSeconds, predict: 1 });
      coldLoadMs = typeof first.load_duration === 'number'
        ? first.load_duration / nanosecondsPerMillisecond
        : null;

      await this.generate({ prompt: 'ok', keepAlive: 0, predict: 1 });
      const second = await this.generate({ prompt: 'ok', keepAlive: keepAliveSeconds, predict: 1 });
      reloadMs = typeof second.load_duration === 'number'
        ? second.load_duration / nanosecondsPerMillisecond
        : null;

      this.log(
        `load after eviction ${coldLoadMs === null ? 'not reported' : `${Math.round(coldLoadMs)} ms`}`
        + `, again ${reloadMs === null ? 'not reported' : `${Math.round(reloadMs)} ms`}`,
      );
      notes.push(
        'both load figures were taken after evicting the model from the accelerator, '
        + 'with the weights still in the host page cache. A host that has just booted '
        + 'reads them from disk and is slower - ADR 0142 measured 31 s that way. These '
        + 'are the floor of a load, not its worst case, and ADR 0118 O2\'s absence '
        + 'threshold has to clear the worst case rather than this one.',
      );
      notes.push(
        'a request while the model is still resident reports a few hundred milliseconds. '
        + 'That is not a reload and is deliberately not recorded as one.',
      );
    } else {
      notes.push(
        'no load was measured, because observing one means evicting the model '
        + 'somebody else may be using. Run with --cold to include it.',
      );
    }

    const contextSteps: PicoModelProviderContextObservation[] = [];
    let spilledFromTokens: number | null = null;
    for (const step of steps) {
      this.log(`measuring generation at ${step} tokens of context`);
      const timings = await this.generate({
        prompt: paddingPrompt(step - 256),
        contextTokens: step,
        keepAlive: keepAliveSeconds,
      });
      const generationRate = rate(timings.eval_count, timings.eval_duration);
      const promptRate = rate(timings.prompt_eval_count, timings.prompt_eval_duration);
      if (generationRate === null || promptRate === null) {
        notes.push(`the host reported no usable timings at ${step} tokens; step skipped.`);
        continue;
      }
      if ((timings.eval_count ?? 0) < minGenerationTokens) {
        notes.push(
          `at ${step} tokens the model stopped after ${timings.eval_count ?? 0} tokens, `
          + `which is below the ${minGenerationTokens}-token floor; step dropped rather `
          + 'than reported, because a rate over a handful of tokens is startup cost.',
        );
        continue;
      }
      // Read straight after the step, while this width's cache is the one
      // resident. Asking later would ask about whatever ran last.
      const loaded = await this.get('/api/ps') as {
        models?: Array<{ name?: string; size?: number; size_vram?: number }>;
      };
      const entryNow = (loaded.models ?? []).find((model) => model.name === this.options.model);
      const fullyOnAccelerator = typeof entryNow?.size === 'number'
        && typeof entryNow.size_vram === 'number'
        ? entryNow.size_vram >= entryNow.size
        : null;
      if (fullyOnAccelerator === false && spilledFromTokens === null) {
        spilledFromTokens = step;
        notes.push(
          `at ${step} tokens the host kept part of the deployment off the `
          + 'accelerator.',
        );
      }

      contextSteps.push(Object.freeze({
        requestedContextTokens: step,
        promptTokens: timings.prompt_eval_count ?? 0,
        generationTokensPerSecond: generationRate,
        promptTokensPerSecond: promptRate,
        fullyOnAccelerator,
      }));
      this.log(
        `  ${generationRate.toFixed(1)} tok/s generation, `
        + `${promptRate.toFixed(0)} tok/s prompt, over ${timings.prompt_eval_count ?? 0} prompt tokens`,
      );
    }

    // **What the declared window costs, at a constant prompt.** Two runs of
    // identical work, one at the width this entry will state and one at the
    // width the model advertises. The difference is what a Pico would pay for
    // declaring a window it rarely fills - and on the measured host it is
    // roughly half the throughput, which is not a rounding error.
    let windowCost: PicoModelProviderMeasurementReport['windowCost'] = null;
    let widestFreeWindowTokens: number | null = null;
    let widestFreeWindowTokensPerSecond: number | null = null;
    const servedTokens = contextSteps.reduce(
      (widest, step) => Math.max(widest, step.requestedContextTokens),
      0,
    );
    if (nominalContextTokens !== null && servedTokens > 0 && nominalContextTokens > servedTokens) {
      const prompt = paddingPrompt(2_048);
      const at = async (window: number): Promise<number | null> => {
        // Warmed first, because changing the window reloads the model and the
        // reload would land inside the figure.
        await this.generate({ prompt, contextTokens: window, keepAlive: keepAliveSeconds, predict: 128 });
        const timings = await this.generate({
          prompt, contextTokens: window, keepAlive: keepAliveSeconds, predict: 128,
        });
        return (timings.eval_count ?? 0) < minGenerationTokens
          ? null
          : rate(timings.eval_count, timings.eval_duration);
      };
      this.log(`pricing the declared window: ${servedTokens} against ${nominalContextTokens}`);
      const served = await at(servedTokens);
      const nominal = await at(nominalContextTokens);

      // **Walk up until it costs something.** A ladder rather than a search,
      // because each rung is two generations and a reload, and six rungs of a
      // known shape beat a bisection that spends its budget proving the same
      // knee to another decimal.
      if (served !== null) {
        widestFreeWindowTokens = servedTokens;
        widestFreeWindowTokensPerSecond = served;
        const rungs: number[] = [];
        for (let width = servedTokens * 2; width <= nominalContextTokens; width *= 2) {
          rungs.push(width);
        }
        if (nominal !== null && nominal >= served * 0.95) {
          // Free all the way up; nothing between can cost anything.
          widestFreeWindowTokens = nominalContextTokens;
          widestFreeWindowTokensPerSecond = nominal;
        } else {
          for (const width of rungs.slice(0, 5)) {
            const here = await at(width);
            if (here === null || here < served * 0.95) {
              // Halfway back, once, because the rungs double and the knee is
              // usually nearer the last free rung than the first costly one.
              const between = Math.round((widestFreeWindowTokens + width) / 2 / 1024) * 1024;
              if (between > widestFreeWindowTokens) {
                const mid = await at(between);
                if (mid !== null && mid >= served * 0.95) {
                  widestFreeWindowTokens = between;
                  widestFreeWindowTokensPerSecond = mid;
                }
              }
              break;
            }
            widestFreeWindowTokens = width;
            widestFreeWindowTokensPerSecond = here;
          }
        }
        this.log(
          `widest window that costs nothing: ${widestFreeWindowTokens} tokens at `
          + `${widestFreeWindowTokensPerSecond?.toFixed(1)} tok/s`,
        );
        if (widestFreeWindowTokens > servedTokens) {
          notes.push(
            `${widestFreeWindowTokens} tokens of declared window cost the same as `
            + `${servedTokens}. A narrower entry would leave that free.`,
          );
        }
      }
      if (served !== null && nominal !== null) {
        windowCost = Object.freeze({
          atServedTokens: servedTokens,
          servedTokensPerSecond: served,
          atNominalTokens: nominalContextTokens,
          nominalTokensPerSecond: nominal,
        });
        this.log(
          `  ${served.toFixed(1)} tok/s at ${servedTokens}, `
          + `${nominal.toFixed(1)} tok/s at ${nominalContextTokens} - same prompt`,
        );
        notes.push(
          `declaring ${nominalContextTokens} tokens instead of ${servedTokens} costs `
          + `${(100 - (nominal / served) * 100).toFixed(0)}% of generation throughput on an `
          + 'identical prompt. The width is a price every job pays, not only a ceiling.',
        );
      }
    }

    let concurrentJobs: number | null = null;
    if (this.options.measureConcurrency !== false) {
      // At a stated context rather than the host's default, so the two jobs
      // are comparable to each other and to the steps above. A probe whose
      // window nobody set is a probe measuring a setting nobody read.
      // **At the width the entry will state.** A lane count taken at 2048 and
      // printed beside a context of 8192 is two measurements of two different
      // deployments. And the first reading has to be thrown away: changing
      // `num_ctx` makes the host reload, so an unwarmed baseline carries a
      // load the pair after it does not - which read as two lanes on a host
      // that has one.
      const laneContext = steps.reduce((widest, step) => Math.max(widest, step), 0);
      const lane = {
        prompt: paddingPrompt(laneContext - 256),
        contextTokens: laneContext,
        predict: 192,
      };
      this.log(`warming at ${laneContext} tokens, because changing the window reloads`);
      await this.generate({ ...lane, keepAlive: keepAliveSeconds });

      // **The baseline is measured alone, and the first version was not.** It
      // compared the wall clock against the average of the two jobs' own
      // `total_duration`, which on a queueing host includes the wait - so a
      // serialised second job inflated the very baseline that was supposed to
      // expose it, and one lane read as two.
      this.log('timing one job alone, to have something to compare against');
      const soloStartedAt = this.now();
      const solo = await this.generate({ ...lane, keepAlive: keepAliveSeconds });
      const soloMs = this.now() - soloStartedAt;

      if ((solo.eval_count ?? 0) < minGenerationTokens) {
        notes.push(
          'the lane probe generated too little to time; concurrency not measured.',
        );
      } else {
        this.log('submitting two jobs at once to see whether the second waits');
        const startedAt = this.now();
        await Promise.all([
          this.generate({ ...lane, keepAlive: keepAliveSeconds }),
          this.generate({ ...lane, keepAlive: keepAliveSeconds }),
        ]);
        const wallMs = this.now() - startedAt;
        // One lane means two jobs take about twice one job. Read
        // conservatively: two lanes only when the pair came in nearer one job
        // than two.
        concurrentJobs = wallMs > soloMs * 1.5 ? 1 : 2;
        this.log(
          `  one job ${Math.round(soloMs)} ms, two together ${Math.round(wallMs)} ms `
          + `-> ${concurrentJobs} lane${concurrentJobs === 1 ? '' : 's'}`,
        );
      }
    }

    // Deliberately wrong, deliberately harmless: a value no operator would
    // have issued, sent to the cheapest endpoint on the host.
    let refusesAWrongCredential: boolean | null = null;
    try {
      const probed = await this.call(`${this.reach}/api/version`, {
        method: 'GET',
        headers: { authorization: 'Bearer pico-measurement-probe-not-a-credential' },
      });
      refusesAWrongCredential = probed.status === 401 || probed.status === 403;
      if (refusesAWrongCredential === false) {
        notes.push(
          'this host answered a credential that cannot be right, so it checks '
          + 'none. A `credentialRef` on this entry would say a provider proved '
          + 'who it is when nothing was proved - ADR 0151 PV5 checks the '
          + 'transport, and only a measurement can check the far side.',
        );
      }
    } catch {
      refusesAWrongCredential = null;
    }

    const running = await this.resident();
    const residentBytes = running.find((entry) => entry.name === this.options.model)?.sizeVram ?? null;
    const intruders = running.filter((entry) => entry.name !== this.options.model);
    if (intruders.length > 0) {
      notes.push(
        `${intruders.map((entry) => entry.name).join(', ')} became resident during this run. `
        + 'Somebody else is using the host, and these figures are about a shared card.',
      );
    }

    return Object.freeze({
      reach: this.reach,
      serverVersion: version.version ?? null,
      model: {
        identifier: this.options.model,
        digestHex,
        parameterSize: summary.details?.parameter_size ?? shown.details?.parameter_size ?? null,
        quantization: summary.details?.quantization_level ?? shown.details?.quantization_level ?? null,
      },
      nominalContextTokens,
      capabilities: Object.freeze([...(shown.capabilities ?? [])]),
      contextSteps: Object.freeze(contextSteps),
      coldLoadMs,
      reloadMs,
      keepAliveMs: keepAliveSeconds * 1_000,
      concurrentJobs,
      residentBytes,
      spilledFromTokens,
      kvBytesPerToken,
      windowCost,
      widestFreeWindowTokens,
      widestFreeWindowTokensPerSecond,
      answeredWithoutCredential,
      refusesAWrongCredential,
      notes: Object.freeze(notes),
    });
  }
}

/**
 * ADR 0142 PE2. The report, narrowed to what an entry may hold.
 *
 * **The slowest measured step wins, not the fastest.** Generation falls with
 * context on a slope with no runtime-detectable cliff, so an entry quoting the
 * 4k figure would be describing the best case of a deployment that will not
 * stay in it. ADR 0119 Q5's posture, one layer over: state the bound that
 * holds, not the one that flatters.
 *
 * The context the entry states is the largest step that was actually measured,
 * for the same reason PE2 exists - a step nobody ran is a number nobody saw.
 */
export function picoModelProviderEntryFromMeasurement(
  report: PicoModelProviderMeasurementReport,
  input: { entryId: string; providerClass: PicoModelProviderClass; measuredAt: string },
): PicoModelProviderEntry {
  if (report.contextSteps.length === 0) {
    throw new Error('pico_model_provider_measured_no_context_step');
  }
  if (report.coldLoadMs === null || report.reloadMs === null) {
    throw new Error('pico_model_provider_measured_no_residency');
  }
  // **A width that spilled is not a width this host serves.** The step is a
  // true observation and belongs in the report; what it observed is the
  // deployment failing to fit, and an entry stating it would promise a context
  // ADR 0118 O2 would then find slow rather than absent.
  const resident = report.contextSteps.filter((step) => step.fullyOnAccelerator !== false);
  if (resident.length === 0) {
    throw new Error('pico_model_provider_measured_no_resident_context_step');
  }
  const served = resident.reduce(
    (widest, step) => (step.requestedContextTokens > widest.requestedContextTokens ? step : widest),
  );
  const slowest = resident.reduce(
    (worst, step) => (step.generationTokensPerSecond < worst.generationTokensPerSecond ? step : worst),
  );
  const slowestPrompt = resident.reduce(
    (worst, step) => (step.promptTokensPerSecond < worst.promptTokensPerSecond ? step : worst),
  );

  // **The widest window that costs nothing, when one was found.** Otherwise
  // the widest step that stayed resident. ADR 0142 reasoned 8192 from the
  // card's nominal size; walking it found 12288 at the same speed, and the
  // entry that states 8192 is leaving half a window unused for no reason a
  // measurement supports.
  const contextTokens = report.widestFreeWindowTokens ?? served.requestedContextTokens;
  const atThatWidth = report.widestFreeWindowTokensPerSecond;

  return parsePicoModelProviderEntry({
    schema: picoModelProviderEntrySchema,
    entryId: input.entryId,
    providerClass: input.providerClass,
    reach: report.reach,
    model: { identifier: report.model.identifier, digestHex: report.model.digestHex },
    measurement: {
      measuredAt: input.measuredAt,
      capacity: {
        contextTokens,
        generationTokensPerSecond: Number(
          Math.min(slowest.generationTokensPerSecond, atThatWidth ?? Infinity).toFixed(2),
        ),
        promptTokensPerSecond: Number(slowestPrompt.promptTokensPerSecond.toFixed(2)),
        concurrentJobs: report.concurrentJobs ?? 1,
      },
      residency: {
        coldLoadMs: Math.max(1, Math.round(report.coldLoadMs)),
        reloadMs: Math.max(1, Math.round(Math.min(report.reloadMs, report.coldLoadMs))),
        keepAliveMs: report.keepAliveMs,
      },
    },
    /**
     * ADR 0151 PV1. The narrower allowance, whatever the measurement found.
     *
     * **A measurement can now prove the far side reads a credential, and it
     * still grants nothing.** The sentence here used to be "no credential was
     * sent, so this is what the entry carries", which stopped being the reason
     * the moment the measurer could authenticate. The reason was never the
     * absence: PV1 spends a proof on somebody else's remembered words, and
     * that is a person's decision through ADR 0152's surface. What a
     * measurement contributes is `refusesAWrongCredential` and
     * `answeredWithoutCredential` - the two findings that make the decision an
     * informed one instead of a hopeful one.
     */
    carries: 'live_turn',
  });
}
