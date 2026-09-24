import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A Home reset is a decision about every table, not about the ten somebody
 * remembered.
 *
 * **The occasion** (2026-09-20, finding B236). `resetPicoHome` clears nine
 * tables and rewrites one, and the schema has **48**. The list is
 * hand-written, so the forty-ninth table is outside the reset by default and
 * nobody learns it - the same shape `check-store-ceilings.mjs` was written
 * for ("every table says how it stops growing"), asked about a different act.
 *
 * A reset is not a deletion of the person: it un-homes a machine. Memories,
 * the log, the audit chain, model and depot state all stay on purpose, and
 * saying so is cheap. What is not cheap is finding out years later that a
 * table which should have gone stayed, because nobody had to say either way.
 *
 * **The arguments are checked against the object where they can be.** The one
 * that carries weight is `pico_home_device_recovery`: a pending recovery
 * survives a reset, and that is safe because every row carries the `home_id`
 * it belongs to, while the reset clears the claim state and the founding
 * record - so a surviving recovery names a Home that no longer exists. That
 * reasoning is only true while the column is there, so the column is what the
 * entry watches.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const storePath = join('apps', 'core', 'src', 'event-store.ts');
const schemaPath = join('apps', 'core', 'src', 'migrations.ts');
const store = readFileSync(join(repoRoot, storePath), 'utf8');
const schema = readFileSync(join(repoRoot, schemaPath), 'utf8');

const start = store.indexOf('public resetPicoHome');
const body = start === -1 ? '' : store.slice(start, store.indexOf('\n  public ', start + 10));
const touched = new Set(
  [...body.matchAll(/(?:DELETE FROM|UPDATE)\s+([a-z_]+)/gu)].map(([, table]) => table),
);
const tables = [...new Set(
  [...schema.matchAll(/CREATE TABLE(?: IF NOT EXISTS)? ([a-z_]+)/gu)].map(([, table]) => table),
)];

/**
 * What a reset leaves standing, by family, and why.
 *
 * `requires` is a word the schema must still carry, so an argument that stops
 * describing its subject fails rather than outliving it.
 */
const surviving = [
  {
    prefix: 'memory_',
    why: 'a reset un-homes a machine; it does not forget a person. Memory items, their domain '
      + 'custody, their key envelopes and their retention policies are what the person kept, and '
      + 'ADR 0070 gives deletion its own path with its own confirmation',
  },
  {
    prefix: 'pico_model_',
    why: 'model providers, their consent and the job queue describe the machine\'s own '
      + 'arrangements, not the Home\'s identity. A reset that dropped a provider decision would '
      + 'silently undo something a person chose (ADR 0049/0104)',
  },
  {
    prefix: 'pico_depot_',
    why: 'a depot attachment is a decision about where code comes from (ADR 0143), made by a '
      + 'person on this machine and unrelated to which Home claims it',
  },
  {
    prefix: 'pico_supplier_',
    why: 'the same for a supplier attachment (ADR 0137): what is attached to this machine '
      + 'outlives who the machine belongs to',
  },
  {
    prefix: 'schema_migration',
    why: 'the schema\'s own history. Clearing it would make the runner re-apply migrations a '
      + 'database already carries, which is the one thing ADR 0122 Y6 exists to prevent',
  },
  {
    table: 'pico_event',
    why: 'ADR 0014. The log is append-only and the reset writes `home.reset` into it. A reset '
      + 'that erased the log would erase the record of itself',
  },
  {
    table: 'pico_audit_record',
    requires: 'UNIQUE (writer_id, chain_position)',
    why: 'ADR 0121. The chain over the log, and it cannot be cut without breaking what it '
      + 'proves. Its own uniqueness is what stops a writer forking it',
  },
  {
    table: 'pico_home_device_recovery',
    requires: 'home_id',
    why: 'ADR 0110/0112. A pending recovery survives, and that is safe because every row names '
      + 'the `home_id` it belongs to while the reset clears the claim state and the founding '
      + 'record: what survives points at a Home that no longer exists. It also keeps the '
      + 'evidence that a recovery was already spent, which is what the anchor is for',
  },
  {
    table: 'pico_home_host_continuity',
    why: 'ADR 0080 H5. The continuity of a host identity that the reset has just removed the '
      + 'keys for. The rows describe what happened, and a reset is not a reason to forget that '
      + 'it happened',
  },
  {
    table: 'pico_home_membership_credential',
    why: 'the memberships are cleared and these are their credentials, so what stays are rows '
      + 'nothing can resolve. Kept rather than swept because a credential row is evidence of an '
      + 'issuance and the reset is not an erasure of history',
  },
  {
    table: 'pico_home_membership_lifecycle',
    why: 'the same, for the transitions those memberships went through',
  },
  {
    table: 'pico_identity_root_rotation',
    why: 'ADR 0114. A root rotation belongs to a Pico identity, which is the person\'s, not to '
      + 'the Home that happened to witness it',
  },
  {
    table: 'pico_link_direct_seen_request',
    why: 'ADR 0107 D2. Replay protection. Clearing it would make every request inside its '
      + 'remaining validity window repeatable across a reset, which is the exact hole the table '
      + 'was added to close',
  },
  {
    table: 'pico_link_mailbox',
    why: 'the per-device mailbox addresses a Home hands out. They name devices, and the devices '
      + 'are not what a reset is about',
  },
  {
    table: 'pico_link_push_ledger',
    why: 'what was already pushed. Clearing it would let a Home push the same occasion again '
      + 'after a reset, to somebody who already heard it',
  },
  {
    table: 'pico_link_relay_identity',
    why: 'ADR 0147. The relay account this machine holds, which is an arrangement with an '
      + 'operator rather than a fact about the Home',
  },
  {
    table: 'foundation_operator',
    why: 'the operator rows are not deleted here; the reset unbinds them from the Home '
      + '(`operators.clearHomeBinding()`) and revokes every session, which is a different act '
      + 'and the one ADR 0075 describes',
  },
  {
    table: 'pico_memory_encryption_decision',
    why: 'ADR 0104 S3. The person decided whether memory content is encrypted, and a Home reset '
      + 'is not that person changing their mind',
  },
  {
    prefix: 'pico_module_',
    why: 'which modules are on and what they may capture (ADR 0127/0129) - decisions about this '
      + 'machine, kept for the same reason the model providers are',
  },
  {
    table: 'pico_rule_decision',
    why: 'ADR 0102. What a person decided a rule should do. It is the person\'s answer, not the '
      + 'Home\'s, and a reset that discarded it would ask them all over again',
  },
  {
    prefix: 'pico_presence_',
    why: 'ADR 0126. Which presence switches this machine offers and how they stand. A switch is '
      + 'a thing in a room rather than a fact about who claims the Home',
  },
  {
    table: 'pico_presence',
    why: 'the presence registry itself, for the same reason: it describes devices that are here, '
      + 'and a reset does not send them away',
  },
  {
    table: 'pico_parking_decision',
    requires: 'memory_item_id',
    why: 'ADR 0129 SR4. The person\'s own word about a place, and it stays for the reason '
      + 'their memories do: a reset un-homes a machine, it does not delete the person. The '
      + 'row names the `memory_item_id` it is about, and that item survives a reset like '
      + 'every other memory - so what stays is a statement with its subject still there, not '
      + 'an orphan. One row per person, replaced on the next decision, so nothing accumulates '
      + 'across the reset either. A domain shred is the act that reaches it: since 2026-09-24 '
      + 'the row carries its `privacy_domain` and the shred cascade deletes it, because the '
      + 'transition in it is by itself a statement about when somebody drove',
  },
  {
    table: 'pico_observation',
    why: 'ADR 0129. The observation buffer is pruned to its window at every boot, so a reset '
      + 'needs no opinion about it',
  },
  {
    prefix: 'pico_reader_custody_',
    why: 'ADR 0086/0088. Reader custody is opaque storage this Home holds for somebody else\'s '
      + 'readers - items, grants, their lifecycles and the KEK rotations over them. A reset '
      + 'un-homes this machine and does not make another party\'s material its to drop',
  },
];

const errors = [];
if (body === '' || touched.size === 0) {
  errors.push(
    `${storePath}: resetPicoHome could not be read, or it touches no table. A reset that clears `
    + 'nothing is either gone or this reader is, and a check with no subject passes by having '
    + 'nothing to say.',
  );
}
if (tables.length === 0) {
  errors.push(`${schemaPath}: no CREATE TABLE was found, so there is nothing to decide about.`);
}

const used = new Set();
let argued = 0;
for (const table of tables) {
  if (touched.has(table)) continue;
  const entry = surviving.find((one) => (one.table === undefined
    ? table.startsWith(one.prefix)
    : one.table === table));
  if (entry === undefined) {
    errors.push(
      `${table} is in the schema and a Home reset neither clears nor rewrites it, and nothing `
      + 'says whether that is right. A reset is a decision about every table; say what this one '
      + 'is for.',
    );
    continue;
  }
  used.add(entry.table ?? entry.prefix);
  if (entry.requires !== undefined && !schema.includes(entry.requires)) {
    errors.push(
      `${table} survives a reset because of \`${entry.requires}\`, which the schema no longer `
      + 'says. The argument outlived what it described.',
    );
    continue;
  }
  argued += 1;
}
for (const entry of surviving) {
  const key = entry.table ?? entry.prefix;
  if (!used.has(key)) {
    errors.push(`${key} is argued as surviving a reset and the schema has no such table any more`);
  }
}
for (const table of touched) {
  if (!tables.includes(table)) {
    errors.push(`resetPicoHome touches ${table} and the schema declares no such table`);
  }
}

if (errors.length > 0) {
  console.error('Home reset check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Home reset check passed (${tables.length} tables; ${touched.size} cleared or rewritten by a `
  + `Home reset, ${argued} argued to survive it - a reset un-homes a machine rather than `
  + 'forgetting a person, and every table says which of the two it is).',
);
