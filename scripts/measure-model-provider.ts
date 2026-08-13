/**
 * ADR 0142 PE2. Measures one host and prints the entry it earned.
 *
 * Run with tsx, because this is a development tool rather than a product
 * surface - ADR 0105 keeps Pico a background companion, and the measurement
 * belongs to the settings flow ADR 0152 shapes and nobody has built:
 *
 *   npx tsx scripts/measure-model-provider.ts \
 *     --reach http://host:11434 --model mistral-small:latest --cold
 *
 * It writes nothing. What it prints is a candidate entry that has already been
 * through `parsePicoModelProviderEntry`, so a run that prints one is a run
 * whose numbers satisfy PE1-PE6 and PV1-PV5.
 */
import {
  PicoModelProviderMeasurer,
  picoModelProviderEntryFromMeasurement,
} from '../apps/core/src/model-provider-measure.js';
import type { PicoModelProviderClass } from '../packages/protocol/src/model-provider.js';

function argument(name: string, fallback?: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    if (fallback === undefined) {
      throw new Error(`missing --${name}`);
    }
    return fallback;
  }
  return value;
}

const reach = argument('reach');
const model = argument('model');
const providerClass = argument('class', 'declared_own_host') as PicoModelProviderClass;
const entryId = argument('id', model.replace(/[^a-z0-9._:-]/gu, '-').toLowerCase());
const steps = argument('steps', '4096,8192').split(',').map((step) => Number(step.trim()));

const measurer = new PicoModelProviderMeasurer({
  reach,
  model,
  providerClass,
  entryId,
  contextSteps: steps,
  measureColdLoad: process.argv.includes('--cold'),
  measureConcurrency: !process.argv.includes('--no-concurrency'),
  log: (line) => console.error(`  ${line}`),
});

console.error(`Measuring ${model} at ${reach}`);
const report = await measurer.measure();

console.error('');
console.error('What was observed:');
console.error(`  server            ${report.serverVersion ?? 'unknown'}`);
console.error(`  model             ${report.model.identifier} (${report.model.parameterSize ?? '?'}, ${report.model.quantization ?? '?'})`);
console.error(`  digest            ${report.model.digestHex}`);
console.error(`  capabilities      ${report.capabilities.join(', ') || 'none reported'}`);
console.error(`  declared context  ${report.nominalContextTokens ?? 'unknown'} tokens`);
for (const step of report.contextSteps) {
  console.error(
    `  at ${String(step.requestedContextTokens).padStart(6)} ctx    `
    + `${step.generationTokensPerSecond.toFixed(1)} tok/s generation, `
    + `${step.promptTokensPerSecond.toFixed(0)} tok/s prompt `
    + `(${step.promptTokens} prompt tokens)`
    + (step.fullyOnAccelerator === false ? '  <- partly off the accelerator' : ''),
  );
}
console.error(`  cold load         ${report.coldLoadMs === null ? 'not measured' : `${Math.round(report.coldLoadMs)} ms`}`);
console.error(`  reload            ${report.reloadMs === null ? 'not measured' : `${Math.round(report.reloadMs)} ms`}`);
console.error(`  lanes             ${report.concurrentJobs ?? 'not measured'}`);
console.error(`  resident          ${report.residentBytes === null ? 'not reported' : `${(report.residentBytes / 1024 ** 3).toFixed(2)} GiB`}`);
console.error(`  KV per token      ${report.kvBytesPerToken === null ? 'unknown' : `${(report.kvBytesPerToken / 1024).toFixed(0)} KiB (q8_0)`}`);
console.error(`  spills from       ${report.spilledFromTokens === null ? 'no measured width' : `${report.spilledFromTokens} tokens`}`);
console.error(`  credential        ${report.answeredWithoutCredential ? 'none sent, and the host answered' : 'required'}`);
for (const note of report.notes) {
  console.error(`  note              ${note}`);
}

console.error('');
try {
  const entry = picoModelProviderEntryFromMeasurement(report, {
    entryId,
    providerClass,
    measuredAt: new Date().toISOString(),
  });
  console.error('The entry this earned:');
  console.log(JSON.stringify(entry, null, 2));
} catch (error) {
  console.error(`No entry: ${(error as Error).message}`);
  process.exitCode = 1;
}
