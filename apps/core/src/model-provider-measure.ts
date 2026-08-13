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

/** Ollama's native API, which is what the measured host speaks. */
export interface PicoOllamaModelSummary {
  name: string;
  digest: string;
  size?: number;
  details?: { parameter_size?: string; quantization_level?: string };
}

export interface PicoOllamaGenerateTimings {
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
  /** ADR 0142 PE5. True when a request carrying no credential was answered. */
  answeredWithoutCredential: boolean;
  notes: readonly string[];
}

export interface PicoModelProviderMeasureOptions {
  reach: string;
  model: string;
  /** ADR 0048. A person's judgement, never a measurement. */
  providerClass: PicoModelProviderClass;
  entryId: string;
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

  private async get(path: string): Promise<unknown> {
    const response = await this.call(`${this.reach}${path}`, { method: 'GET' });
    if (!response.ok) {
      throw new Error(`pico_model_provider_probe_failed:${path}:${response.status}`);
    }
    return await response.json();
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const response = await this.call(`${this.reach}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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
  }): Promise<PicoOllamaGenerateTimings> {
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
    }) as PicoOllamaGenerateTimings;
  }

  public async measure(): Promise<PicoModelProviderMeasurementReport> {
    const notes: string[] = [];
    const keepAliveSeconds = this.options.keepAliveSeconds ?? 300;
    const steps = this.options.contextSteps ?? [4096, 8192];

    const version = await this.get('/api/version') as { version?: string };
    // ADR 0142 PE5. Nothing above sent a credential, and the host answered.
    // That is the finding, and it is the whole of what PE5 can observe.
    const answeredWithoutCredential = true;
    this.log(`reachable, server version ${version.version ?? 'unknown'}`);

    const tags = await this.get('/api/tags') as { models?: PicoOllamaModelSummary[] };
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
      contextSteps.push(Object.freeze({
        requestedContextTokens: step,
        promptTokens: timings.prompt_eval_count ?? 0,
        generationTokensPerSecond: generationRate,
        promptTokensPerSecond: promptRate,
      }));
      this.log(
        `  ${generationRate.toFixed(1)} tok/s generation, `
        + `${promptRate.toFixed(0)} tok/s prompt, over ${timings.prompt_eval_count ?? 0} prompt tokens`,
      );
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

    const running = await this.get('/api/ps') as { models?: Array<{ name?: string; size_vram?: number }> };
    const residentBytes = (running.models ?? [])
      .find((entry) => entry.name === this.options.model)?.size_vram ?? null;

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
      answeredWithoutCredential,
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
  const served = report.contextSteps.reduce(
    (widest, step) => (step.requestedContextTokens > widest.requestedContextTokens ? step : widest),
  );
  const slowest = report.contextSteps.reduce(
    (worst, step) => (step.generationTokensPerSecond < worst.generationTokensPerSecond ? step : worst),
  );
  const slowestPrompt = report.contextSteps.reduce(
    (worst, step) => (step.promptTokensPerSecond < worst.promptTokensPerSecond ? step : worst),
  );

  return parsePicoModelProviderEntry({
    schema: picoModelProviderEntrySchema,
    entryId: input.entryId,
    providerClass: input.providerClass,
    reach: report.reach,
    model: { identifier: report.model.identifier, digestHex: report.model.digestHex },
    measurement: {
      measuredAt: input.measuredAt,
      capacity: {
        contextTokens: served.requestedContextTokens,
        generationTokensPerSecond: Number(slowest.generationTokensPerSecond.toFixed(2)),
        promptTokensPerSecond: Number(slowestPrompt.promptTokensPerSecond.toFixed(2)),
        concurrentJobs: report.concurrentJobs ?? 1,
      },
      residency: {
        coldLoadMs: Math.max(1, Math.round(report.coldLoadMs)),
        reloadMs: Math.max(1, Math.round(Math.min(report.reloadMs, report.coldLoadMs))),
        keepAliveMs: report.keepAliveMs,
      },
    },
    // ADR 0151 PV1. No credential was sent, so this is what the entry carries.
    // The wider allowance is not something a measurement can grant.
    carries: 'live_turn',
  });
}
