import { createServer, type Server } from 'node:http';

/**
 * A model host, small enough to run in a test and real enough to be measured.
 *
 * **A real server rather than a stub `fetch`.** The measurement is a sequence
 * of HTTP calls whose *order* carries meaning - unload, then generate, then ask
 * what is resident - and a stubbed function that answers by URL cannot fail the
 * way a host fails. This one holds state: a model becomes resident when it is
 * generated against and stops being resident when it is unloaded with
 * `keep_alive: 0`, so `/api/ps` answers what actually happened rather than a
 * fixture. That is the difference between testing the measurer and testing a
 * table of expected requests.
 *
 * It lives beside the measurer rather than in a test file because two tests
 * need it - the measurer's own and the Link operation that drives it - and a
 * second copy of a fake host is a second thing to keep honest.
 *
 * Not exported from the package. Nothing ships this.
 */

export interface PicoFakeModelHostOptions {
  /** The tag the host serves. A measurement of any other refuses. */
  model?: string;
  digestHex?: string;
  /**
   * Nanoseconds, the unit the real host reports timings in.
   *
   * `firstLoadNs` is the very first load this host ever performs, which the
   * measurer spends on its context steps; `reloadNs` is every load after that,
   * and it is what the residency figures end up carrying. Named this way after
   * calling the first one `coldLoadNs` and finding it never reached the field
   * with "cold" in its name - the measurer deliberately takes *both* residency
   * figures after an eviction of its own, so neither is the first load.
   */
  firstLoadNs?: number;
  reloadNs?: number;
  evalDurationNs?: number;
  /** Tokens the host claims it generated. Under 32 makes a rate not a rate. */
  evalCount?: number;
  promptEvalCount?: number;
  promptEvalDurationNs?: number;
  /** Bytes the model occupies once resident. */
  sizeVram?: number;
  /** ADR 0151 PV5. Whether a credential that cannot be right is refused. */
  refusesAWrongCredential?: boolean;
  /**
   * A context width the host cannot hold. A run at or above it reports the
   * model spilling off the accelerator, which is what an entry must not claim.
   */
  spillsAboveContextTokens?: number;
  /** Another model already holding the accelerator when measuring starts. */
  residentIntruder?: string;
}

export interface PicoFakeModelHost {
  reach: string;
  /** Paths in the order they were requested, for asserting the sequence. */
  requests: readonly string[];
  close(): Promise<void>;
}

export async function startPicoFakeModelHost(
  options: PicoFakeModelHostOptions = {},
): Promise<PicoFakeModelHost> {
  const model = options.model ?? 'a-model:measured';
  const digestHex = options.digestHex ?? 'a'.repeat(64);
  const sizeVram = options.sizeVram ?? 5_000_000_000;
  const requests: string[] = [];
  // What the host is holding. The intruder starts resident so the measurer's
  // eviction step has something real to evict.
  const resident = new Map<string, number>(
    options.residentIntruder === undefined ? [] : [[options.residentIntruder, sizeVram]],
  );
  let loadsSoFar = 0;

  const server: Server = createServer((request, response) => {
    const path = (request.url ?? '').split('?')[0] ?? '';
    requests.push(path);

    if (options.refusesAWrongCredential === true) {
      const authorization = request.headers.authorization;
      if (typeof authorization === 'string' && authorization !== '') {
        // Exactly what the PV5 probe is looking for: a host that reads a
        // credential refuses one that cannot be right.
        response.writeHead(401).end('{}');
        return;
      }
    }

    const send = (body: unknown): void => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    };

    if (path === '/api/version') {
      send({ version: '0.0.0-fake' });
      return;
    }
    if (path === '/api/tags') {
      send({
        models: [{
          name: model,
          digest: `sha256:${digestHex}`,
          size: sizeVram,
          details: { parameter_size: '7B', quantization_level: 'Q4_K_M' },
        }],
      });
      return;
    }
    if (path === '/api/ps') {
      send({
        models: [...resident].map(([name, bytes]) => ({ name, size_vram: bytes })),
      });
      return;
    }

    let body = '';
    request.on('data', (chunk: Buffer) => { body += chunk.toString('utf8'); });
    request.on('end', () => {
      const sent = ((): Record<string, unknown> => {
        try {
          return JSON.parse(body === '' ? '{}' : body) as Record<string, unknown>;
        } catch {
          return {};
        }
      })();

      if (path === '/api/show') {
        send({
          capabilities: ['completion'],
          details: { parameter_size: '7B', quantization_level: 'Q4_K_M' },
          model_info: {
            'fake.context_length': 32_768,
            'fake.embedding_length': 4_096,
            'fake.block_count': 32,
            'fake.attention.head_count': 32,
            'fake.attention.head_count_kv': 8,
          },
        });
        return;
      }
      if (path !== '/api/generate') {
        response.writeHead(404).end('{}');
        return;
      }

      const requestedModel = typeof sent.model === 'string' ? sent.model : model;
      // A bare unload: no prompt at all. The real host frees the accelerator
      // and reports nothing, so this one does too.
      if (sent.prompt === undefined) {
        resident.delete(requestedModel);
        send({});
        return;
      }

      const wasResident = resident.has(requestedModel);
      resident.set(requestedModel, sizeVram);
      const contextTokens = ((): number => {
        const shape = sent.options as Record<string, unknown> | undefined;
        return typeof shape?.num_ctx === 'number' ? shape.num_ctx : 4_096;
      })();
      // A width the host cannot hold: the weights come off the accelerator,
      // which is what `/api/ps` then reports and what the entry must not claim.
      if (options.spillsAboveContextTokens !== undefined
        && contextTokens >= options.spillsAboveContextTokens) {
        resident.set(requestedModel, Math.floor(sizeVram / 2));
      }
      const loadDurationNs = wasResident
        ? 0
        : (loadsSoFar++ === 0
          ? options.firstLoadNs ?? 3_000_000_000
          : options.reloadNs ?? 1_000_000_000);
      /**
       * `keep_alive: 0` **with** a prompt generates and then releases, which is
       * how the measurer evicts between its two load observations. Treating
       * that as an ordinary generation left the model resident, so the next
       * request reported a load of zero and the entry's residency became 1 ms -
       * a fake host that made the measurer look like it could not time a load.
       */
      if (sent.keep_alive === 0) {
        resident.delete(requestedModel);
      }
      send({
        load_duration: loadDurationNs,
        prompt_eval_count: options.promptEvalCount ?? contextTokens,
        prompt_eval_duration: options.promptEvalDurationNs ?? 500_000_000,
        eval_count: options.evalCount ?? 128,
        eval_duration: options.evalDurationNs ?? 2_000_000_000,
        total_duration: loadDurationNs + 2_500_000_000,
      });
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('pico_fake_model_host_has_no_port');
  }

  return {
    reach: `http://127.0.0.1:${address.port}`,
    requests,
    close: async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}
