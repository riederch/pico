import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Every table says how it stops growing.
 *
 * ADR 0119 Q5 caps eight stores because a personal appliance has a disk and a
 * store that only ever grows will eventually fill it. That decision names the
 * eight; nothing asked the other thirty-nine how *they* stop. Most answer by
 * their own shape - a primary key of `id = 1`, one row per domain, one row per
 * module - and a table with a `DELETE` somewhere answers by being swept. What
 * is left is the interesting set, and this check is the question put to it.
 *
 * **Measured on 2026-08-24 before being written:** of 47 tables, 32 are
 * deleted from somewhere and 15 are not. Four of those fifteen carry a Q5
 * ceiling. Ten of the remaining eleven are bounded by their key. One is not,
 * and it is written into the argument list below rather than hidden by it,
 * because an exemption that pretends is worse than none.
 *
 * The rule is mechanical on purpose. Deciding which tables "grow with use"
 * would be a judgement per table and a check built on it would be guessing;
 * "nothing deletes from this and no ceiling names it" is a fact anybody can
 * re-derive.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const coreRoot = join(repoRoot, 'apps', 'core', 'src');
const errors = [];

/**
 * The ADR 0119 Q5 stores, and the table each one is. Spelled here because
 * `picoDurableStores` names stores and the schema names tables; the two lists
 * are held against each other below, so this mapping cannot rot quietly.
 */
const ceilingTables = new Map([
  ['event_log', 'pico_event'],
  ['memory_item', 'memory_item'],
  ['audit_record', 'pico_audit_record'],
  ['share_envelope', 'pico_share_envelope'],
  ['observation', 'pico_observation'],
  ['supplier_attachment', 'pico_supplier_attachment'],
  ['depot_attachment', 'pico_depot_attachment'],
  ['link_mailbox', 'pico_link_mailbox'],
]);

/** How a table nothing deletes from and no ceiling names stops growing. */
const argued = [
  ['schema_migration', 'one row per migration in a list this repository writes'],
  ['schema_migration_audit', 'one row per run that applied or failed a migration, so it is '
    + 'bounded by that same list rather than by use'],
  ['relay_account', 'one row per account the operator issued out of band, and the operator is '
    + 'the ceiling. A revoked account stays as a row because ADR 0154 RO6 needs the revoked '
    + 'answer to be possible, and nobody but the operator can add one'],
  ['relay_mailbox', '**unbounded in rows, and this entry says so rather than covering it.** '
    + 'A revoked mailbox stays on purpose - ADR 0147 RY4 needs the revoked answer, and '
    + 'forgetting it would turn a deliberate ending into a typo the sender reads as its own '
    + 'mistake. But the account quota counts only the *open* ones, and nothing deletes from '
    + 'this table at all, so one account credential can register and deregister in turn: the '
    + 'quota holds and the table grows. Measured 2026-09-17 (B189) against the real table '
    + 'shape and the relay\'s own rate limit: 234 bytes a row, 19 MB a day, 6.9 GB a year, '
    + 'from a single account. How it should end is a decision, not a cleanup - deleting a '
    + 'revoked mailbox is exactly what RY4 forbids'],
  ['pico_home_claim_state', 'PRIMARY KEY CHECK (id = 1) - one row'],
  ['pico_memory_encryption_decision', 'PRIMARY KEY CHECK (id = 1) - one row'],
  ['pico_link_relay_identity', 'PRIMARY KEY CHECK (id = 1) - one row'],
  ['memory_domain_custody', 'PRIMARY KEY (privacy_domain) - one row per domain'],
  ['pico_module_activation', 'PRIMARY KEY (identifier) over ADR 0127\'s closed module list'],
  ['pico_home_device_recovery', 'one row per recovery ceremony, and ADR 0110 makes each one '
    + 'time-locked, person-initiated and replacing the whole device set'],
  ['pico_identity_root_rotation', 'one row per root rotation, which is the rarest act ADR '
    + '0114 defines'],
  ['pico_model_job_queue', '**unbounded in rows, and this entry says so rather than covering '
    + 'it.** One row per model job. Nothing deletes a row, no Q5 ceiling names the store, and '
    + '`domain-shred.ts` never names the table, so the row count still grows with use. What '
    + 'changed on 2026-08-25 is the half that held words: `home.recall.forget` clears '
    + '`job_json`, `result_json` and `recall_context_json` and stamps `forgotten_at`, so a '
    + 'person can take an exchange back and what is left is a handle without a sentence. The '
    + 'row survives on purpose - it is what `jobKeepingMemoryItem` finds, and deleting it '
    + 'would make a kept memory item unreachable by the only operation that unmakes it, which '
    + 'is `memory-forget.test.ts` planting `kept_memory_item_id = NULL` and watching '
    + '`home.memory.forget` refuse. So the growth that is left is empty rows the person '
    + 'chose, and full rows they have not. Recorded 2026-08-24 in ADR 0049\'s status note and '
    + 'as Roadmap finding B17'],
];

/**
 * Both schemas, not only the Home's.
 *
 * Until 2026-09-17 this read `migrations.ts` alone and said "48 tables", which
 * was the Home's count - the relay keeps four more in its own store, and no
 * check had ever asked them this question. One of them had no answer: B189.
 */
const schemaSources = [
  readFileSync(join(coreRoot, 'migrations.ts'), 'utf8'),
  readFileSync(join(repoRoot, 'apps', 'relay', 'src', 'store.ts'), 'utf8'),
];
const tables = schemaSources
  .flatMap((source) => [...source.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/gu)])
  .map(([, name]) => name);
/**
 * The sources that sweep. The relay's store both declares its tables and
 * empties them, so reading only the Home's would report its swept packet table
 * as growing for ever.
 */
const relayRoot = join(repoRoot, 'apps', 'relay', 'src');
const coreSource = [
  ...readdirSync(coreRoot).map((entry) => [coreRoot, entry]),
  ...readdirSync(relayRoot).map((entry) => [relayRoot, entry]),
]
  .filter(([, entry]) => entry.endsWith('.ts') && !entry.endsWith('.test.ts'))
  .map(([root, entry]) => readFileSync(join(root, entry), 'utf8'))
  .join('\n');

const storagePressure = readFileSync(
  join(repoRoot, 'packages', 'protocol', 'src', 'storage-pressure.ts'),
  'utf8',
);
const storeBlock = /picoDurableStores = \[([\s\S]*?)\] as const;/u.exec(storagePressure);
const durableStores = storeBlock === null
  ? []
  : [...storeBlock[1].matchAll(/^\s*'([a-z_]+)',$/gmu)].map(([, name]) => name);

if (tables.length === 0 || durableStores.length === 0) {
  errors.push(
    'scripts/check-store-ceilings.mjs read no tables or no ceilinged stores, so it compared '
    + 'nothing. A reader that finds neither side is broken, not clean.',
  );
}

/** Both directions on the mapping, so neither list can move without the other. */
for (const store of durableStores) {
  if (!ceilingTables.has(store)) {
    errors.push(
      `${store} carries an ADR 0119 Q5 ceiling and this check does not know which table it `
      + 'is. Name it, so the ceiling and the schema stay one statement.',
    );
  }
}
for (const [store, table] of ceilingTables) {
  if (!durableStores.includes(store)) {
    errors.push(`${store} is mapped to a table here and no longer carries a Q5 ceiling.`);
  }
  if (!tables.includes(table)) {
    errors.push(`${store} is mapped to the table ${table}, which the schema does not create.`);
  }
}

const ceilinged = new Set(ceilingTables.values());
const arguedTables = new Map(argued);
const arguedUsed = new Set();
let swept = 0;
for (const table of tables) {
  if (new RegExp(`DELETE FROM ${table}\\b`, 'u').test(coreSource)) {
    swept += 1;
    continue;
  }
  if (ceilinged.has(table)) {
    continue;
  }
  if (arguedTables.has(table)) {
    arguedUsed.add(table);
    continue;
  }
  errors.push(
    `${table} is created by a migration, nothing deletes from it, and no ADR 0119 Q5 `
    + 'ceiling names it. Say how it stops growing - a key that admits one row, a sweep, or '
    + 'a ceiling - beside the other answers in this check.',
  );
}
for (const [table] of argued) {
  if (arguedUsed.has(table)) {
    continue;
  }
  errors.push(
    `${table} is answered here and no longer needs an answer: it is swept, ceilinged or `
    + 'gone. An argument outliving its subject reads like a judgement about today.',
  );
}

/**
 * **Zweite Frage, seit Befund B170 (2026-09-14): lehnt jede Decke auch ab?**
 *
 * Die Frage oben ist strukturell - *sagt* jede Tabelle, wie sie aufhoert zu
 * wachsen. Sie war nie die ganze: eine Decke, die nur zaehlt, ist eine Zahl
 * ohne Wirkung. Gemessen an dem Tag: von den acht Q5-Ablagen lehnten sechs an
 * ihrer eigenen Schreibstelle ab, **zwei nicht** - `memory_item` und
 * `share_envelope` schrieben an der Decke weiter, und abgelehnt wurde nur das
 * *Ereignis*, das den Vorgang festhaelt. Eine Zeile ohne ihren Eintrag im
 * Protokoll, und eine Ablage, die weiter waechst.
 *
 * Seit der Faltung heisst die Frage ueberall gleich: `hasReachedStoreCeiling`.
 * Zwei Ablagen antworten anders und sind eingetragen - sie werden **nur** von
 * `append` geschrieben, und `append` faellt unter Druck als Ganzes zu.
 */
const refusesThroughAppend = new Map([
  ['event_log', 'Die Anhaengestelle selbst: `mayAppendUnderPicoStoragePressure` laesst unter '
    + 'Druck keinen erschaffenden Schreibvorgang mehr durch (ADR 0119 Q1/Q2).'],
  ['audit_record', 'Wird ausschliesslich innerhalb von `append` gekettet, also endet es mit '
    + 'ihm. Hergestellt am 2026-09-14: mit `audit_record: 2` ist der dritte Anhang '
    + '`refused_storage_pressure`.'],
]);

for (const store of ceilingTables.keys()) {
  if (refusesThroughAppend.has(store)) {
    continue;
  }
  if (!coreSource.includes(`hasReachedStoreCeiling('${store}')`)) {
    errors.push(
      `${store} carries an ADR 0119 Q5 ceiling and nothing refuses at it: no call to `
      + `\`hasReachedStoreCeiling('${store}')\` stands in apps/core/src. A ceiling that only `
      + 'counts is a number, not a bound - the row lands and only the event that records it '
      + 'is refused.',
    );
  }
}

for (const store of refusesThroughAppend.keys()) {
  if (!ceilingTables.has(store)) {
    errors.push(
      `${store} is argued here as refusing through \`append\`, but it no longer carries a `
      + 'Q5 ceiling at all. An argument outliving its subject reads like a judgement about '
      + 'today.',
    );
  }
}

if (errors.length > 0) {
  console.error('Store-ceiling check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Store-ceiling check passed (${tables.length} tables: ${swept} swept, `
  + `${ceilinged.size} under an ADR 0119 Q5 ceiling, ${argued.length} answering by their `
  + 'shape - one of them answering that it does not; of the '
  + `${ceilingTables.size} ceilings, ${ceilingTables.size - refusesThroughAppend.size} refuse `
  + `at their own write site and ${refusesThroughAppend.size} through \`append\`).`,
);
