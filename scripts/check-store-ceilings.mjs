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
  ['pico_home_claim_state', 'PRIMARY KEY CHECK (id = 1) - one row'],
  ['pico_memory_encryption_decision', 'PRIMARY KEY CHECK (id = 1) - one row'],
  ['pico_link_relay_identity', 'PRIMARY KEY CHECK (id = 1) - one row'],
  ['memory_domain_custody', 'PRIMARY KEY (privacy_domain) - one row per domain'],
  ['pico_module_activation', 'PRIMARY KEY (identifier) over ADR 0127\'s closed module list'],
  ['pico_rule_decision', 'PRIMARY KEY (effect_name, privacy_domain) - bounded by the effect '
    + 'catalogue times the domains, not by how often a rule is asked'],
  ['pico_home_device_recovery', 'one row per recovery ceremony, and ADR 0110 makes each one '
    + 'time-locked, person-initiated and replacing the whole device set'],
  ['pico_identity_root_rotation', 'one row per root rotation, which is the rarest act ADR '
    + '0114 defines'],
  ['pico_model_job_queue', '**unbounded, and this entry says so rather than covering it.** '
    + 'One row per model job, holding the person\'s question (`job_json`), the answer '
    + '(`result_json`) and the recall context, all as plain text. Nothing deletes a row, no '
    + 'Q5 ceiling names the store, `home.memory.forget` clears only the pointer to the kept '
    + 'item, `domain-shred.ts` never names the table, and the ADR 0072 encryption posture a '
    + 'memory item carries does not exist here. Recorded 2026-08-24 in ADR 0049\'s status '
    + 'note and as Roadmap finding B17. This is the recall history the person is shown - '
    + '`recallsFor` returns the question and the answer, `home.recall.read` serves it - and '
    + 'the closed operation list has no `home.recall.forget`, so bounding it is a missing '
    + 'operation rather than a wiring job'],
];

const migrations = readFileSync(join(coreRoot, 'migrations.ts'), 'utf8');
const tables = [...migrations.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/gu)]
  .map(([, name]) => name);
const coreSource = readdirSync(coreRoot)
  .filter((entry) => entry.endsWith('.ts') && !entry.endsWith('.test.ts'))
  .map((entry) => readFileSync(join(coreRoot, entry), 'utf8'))
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
  + 'shape - one of them answering that it does not).',
);
