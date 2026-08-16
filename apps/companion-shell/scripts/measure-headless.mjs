import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

/**
 * The measurement `TODO.md` asks for before anybody decides whether to leave
 * Electron: what the Pico core costs on its own, separated from what Chromium
 * costs around it.
 *
 * **The control is the load-bearing part.** The recorded tray figure is 222.7
 * MB PSS over seven processes, and the obvious conclusion - "drop Electron and
 * save 222 MB" - is wrong in a way nobody notices, because a headless product
 * still pays for a JavaScript runtime. So this measures three things and the
 * arithmetic between them:
 *
 *   bare Node, idle            the floor any Node-based product pays
 *   + the companion core       what Pico's own module graph adds
 *   the packaged tray          from the release measurement, same machine
 *
 * `tray - core` is what leaving Electron could save. `core - bare` is what
 * would still be there afterwards. Neither number exists without the other
 * two, which is why the earlier note in `TODO.md` could not answer the
 * question it asked: it had only the total.
 *
 * **This decides nothing.** ADR 0113 chose Electron for reasons that are not
 * memory - a shell-free core with a shell over it, one product path, no second
 * trust boundary - and a saving does not overrule them. What it removes is the
 * option of arguing either way from a figure nobody measured.
 */

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = join(dirname(scriptPath), '..');

/** How long the process is left alone before it is weighed. */
const SETTLE_MS = 3_000;
/** The window over which idle CPU and wakeups are counted. */
const IDLE_WINDOW_MS = 5_000;
/**
 * Repeats, because one sample of a resident set is one sample. The reported
 * figure is the median, and the spread is reported beside it - a measurement
 * whose spread is hidden is a claim.
 */
const SAMPLES = 3;

export async function measurePicoHeadlessCore() {
  if (process.platform !== 'linux') {
    throw new Error('headless_measurement_is_linux_only');
  }
  if (!existsSync(join(appRoot, 'dist', 'runtime.js'))) {
    throw new Error('build_the_companion_shell_first');
  }

  const variants = [];
  for (const variant of ['bare', 'core', 'sodium', 'sodium-import']) {
    const runs = [];
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      runs.push(await measureVariant(variant));
    }
    variants.push({ variant, ...summarise(runs) });
  }

  const bare = variants.find((entry) => entry.variant === 'bare');
  const core = variants.find((entry) => entry.variant === 'core');
  const sodium = variants.find((entry) => entry.variant === 'sodium');
  const sodiumImport = variants.find((entry) => entry.variant === 'sodium-import');
  const tray = readTrayReport();

  const report = {
    schema: 'pico.companion.headless-core-memory.v1',
    measuredAt: new Date().toISOString(),
    platform: 'linux',
    architecture: process.arch,
    nodeVersion: process.version,
    samples: SAMPLES,
    idleWindowMs: IDLE_WINDOW_MS,
    variants,
    tray: tray === undefined ? null : {
      source: 'apps/companion-shell/out/tray-memory-linux-amd64.json',
      measuredAt: tray.measuredAt,
      electronVersion: tray.electronVersion,
      processCount: tray.processCount,
      proportionalBytes: tray.proportionalBytes,
      privateBytes: tray.privateBytes,
      browserProportionalBytes: tray.processMemoryByRole
        ?.find((role) => role.role === 'browser')?.proportionalBytes ?? null,
    },
    /**
     * The two differences the decision would rest on, stated rather than left
     * to whoever reads the table.
     */
    arithmetic: tray === undefined ? null : {
      picoCoreOwnCostBytes: core.proportionalBytes.median - bare.proportionalBytes.median,
      electronCostBytes: tray.proportionalBytes - core.proportionalBytes.median,
      // What a headless product would still cost, which is the number the
      // "save 222 MB" reading forgets.
      headlessFloorBytes: core.proportionalBytes.median,
      /**
       * The one module the tray loads eagerly and could not obviously need
       * before a window exists. Weighed on its own so the answer is a
       * subtraction rather than an opinion.
       */
      sodiumOwnCostBytes: sodium.proportionalBytes.median - bare.proportionalBytes.median,
      /**
       * What awaiting `sodium.ready` costs beyond importing the module.
       *
       * The number that decides whether anything can be done: if it is near
       * zero, the cost is the module rather than its initialisation, so
       * deferring the await buys nothing and only not importing it would help
       * - which the tray cannot do, since `startServiceCore` awaits it on its
       * first line.
       */
      sodiumReadyCostBytes:
        sodium.proportionalBytes.median - sodiumImport.proportionalBytes.median,
      /** Pico's own JavaScript, once its heaviest dependency is subtracted. */
      picoOwnJavaScriptBytes:
        core.proportionalBytes.median - sodium.proportionalBytes.median,
    },
  };

  return report;
}

async function measureVariant(variant) {
  const child = spawn(
    process.execPath,
    [join(appRoot, 'scripts', 'measure-headless-core.mjs'), variant],
    { cwd: appRoot, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  try {
    const pid = await new Promise((resolve, reject) => {
      let seen = '';
      const failed = setTimeout(() => reject(new Error(`variant_never_became_ready:${variant}`)), 30_000);
      child.stdout.on('data', (chunk) => {
        seen += String(chunk);
        const match = /^ready (\d+)$/m.exec(seen);
        if (match !== null) {
          clearTimeout(failed);
          resolve(Number(match[1]));
        }
      });
      child.on('exit', (code) => {
        clearTimeout(failed);
        reject(new Error(`variant_exited:${variant}:${String(code)}`));
      });
    });

    await wait(SETTLE_MS);
    const before = readCounters(pid);
    await wait(IDLE_WINDOW_MS);
    const after = readCounters(pid);
    const memory = readMemory(pid);

    const clockTicks = 100; // Linux USER_HZ; sysconf(_SC_CLK_TCK) is 100 everywhere this runs.
    return {
      ...memory,
      idleCpuSeconds: (after.cpuTicks - before.cpuTicks) / clockTicks,
      // Per second of wall clock, so a longer window does not read as a
      // busier process.
      wakeupsPerSecond:
        (after.contextSwitches - before.contextSwitches) / (IDLE_WINDOW_MS / 1_000),
    };
  } finally {
    child.kill('SIGTERM');
  }
}

function readMemory(pid) {
  const rollup = readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8');
  const kiB = (name) => Number(new RegExp(`^${name}:\\s+(\\d+)\\s+kB$`, 'm').exec(rollup)?.[1] ?? 0);
  return {
    proportionalBytes: kiB('Pss') * 1_024,
    privateBytes: (kiB('Private_Clean') + kiB('Private_Dirty') + kiB('Private_Hugetlb')) * 1_024,
    rssBytes: kiB('Rss') * 1_024,
  };
}

function readCounters(pid) {
  const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
  // Fields after the comm field, which may itself contain spaces.
  const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
  const status = readFileSync(`/proc/${pid}/status`, 'utf8');
  const switches = (name) => Number(new RegExp(`^${name}:\\s+(\\d+)$`, 'm').exec(status)?.[1] ?? 0);
  return {
    // utime + stime, in clock ticks.
    cpuTicks: Number(fields[11]) + Number(fields[12]),
    contextSwitches:
      switches('voluntary_ctxt_switches') + switches('nonvoluntary_ctxt_switches'),
  };
}

function summarise(runs) {
  const of = (key) => {
    const values = runs.map((run) => run[key]).sort((left, right) => left - right);
    return {
      median: values[Math.floor(values.length / 2)],
      min: values[0],
      max: values[values.length - 1],
    };
  };
  return {
    proportionalBytes: of('proportionalBytes'),
    privateBytes: of('privateBytes'),
    rssBytes: of('rssBytes'),
    idleCpuSeconds: of('idleCpuSeconds'),
    wakeupsPerSecond: of('wakeupsPerSecond'),
  };
}

function readTrayReport() {
  const path = join(appRoot, 'out', 'tray-memory-linux-amd64.json');
  if (!existsSync(path)) {
    // Absent rather than zero. A comparison with a side missing is a
    // comparison that has not happened, and reporting nought would make it
    // look like Electron cost nothing.
    return undefined;
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

if (process.argv[1] === scriptPath) {
  const report = await measurePicoHeadlessCore();
  writeFileSync(
    join(appRoot, 'out', 'headless-core-memory-linux.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  const mb = (bytes) => `${(bytes / 1_000_000).toFixed(1)} MB`;
  for (const variant of report.variants) {
    process.stdout.write(
      `${variant.variant.padEnd(5)} PSS ${mb(variant.proportionalBytes.median)} `
      + `(${mb(variant.proportionalBytes.min)}-${mb(variant.proportionalBytes.max)}), `
      + `private ${mb(variant.privateBytes.median)}, `
      + `idle CPU ${variant.idleCpuSeconds.median.toFixed(3)} s per `
      + `${report.idleWindowMs / 1_000} s, `
      + `${variant.wakeupsPerSecond.median.toFixed(1)} wakeups/s\n`,
    );
  }
  if (report.tray !== null) {
    process.stdout.write(
      `tray  PSS ${mb(report.tray.proportionalBytes)} over ${report.tray.processCount} processes, `
      + `measured ${report.tray.measuredAt.slice(0, 10)}\n`,
    );
    process.stdout.write(
      `\nPico's own core costs ${mb(report.arithmetic.picoCoreOwnCostBytes)} above bare Node.\n`
      + `Of which libsodium alone is ${mb(report.arithmetic.sodiumOwnCostBytes)} `
      + `(${mb(report.arithmetic.sodiumReadyCostBytes)} of that is awaiting ready, `
      + `so the cost is the module).\n`
      + `Pico's own JavaScript is ${mb(report.arithmetic.picoOwnJavaScriptBytes)}.\n`
      + `Electron costs ${mb(report.arithmetic.electronCostBytes)} above that.\n`
      + `A headless product would still pay ${mb(report.arithmetic.headlessFloorBytes)}.\n`,
    );
  } else {
    process.stdout.write('\nNo tray measurement on disk; run `pnpm --filter @pico/companion-shell verify:linux` first.\n');
  }
}
