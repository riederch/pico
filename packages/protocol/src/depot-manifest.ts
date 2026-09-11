import { assertExactKeys } from './canonical-bytes.js';
import { assertPicoSupplierProtocolVersion } from './supplier-transport.js';
import {
  assertPicoSupplierDeclaration,
  picoSupplierIdentifierPattern,
  type PicoSupplierKind,
  type PicoSupplierSlot,
} from './supplier.js';

/**
 * ADR 0143 DP3 - a depot names an entry point, and there is no field for a
 * command.
 *
 * This is the decision the rest of ADR 0143 rests on, and it is the user's:
 * a depot's manifest names a **file to enter**, and Pico calls it with a
 * runtime Pico already ships. It does not name a command line, an interpreter,
 * an argument vector or a shell string.
 *
 * The difference is where the authority sits. A field that can hold
 * `python3 ./run.py` can hold anything, and every guard after it is a guard on
 * a decision that was already made somewhere else. An entry point makes the
 * manifest a place where *here is my code* can be written, and leaves Pico
 * deciding what runs it.
 *
 * **A command-shaped field is refused by name rather than ignored**, which is
 * this gate's own rule about itself: a field that is quietly dropped is a field
 * an author believes in, and an author who believes `interpreter` works will
 * ship a bridge that only runs by accident. So the parser names the refusal.
 *
 * **A consequence is decided with it: a bridge is written in the runtime Pico
 * brings.** There is no Python bridge, no Go bridge and no compiled bridge,
 * because there is no field in which a second runtime could be requested. That
 * is a narrowing, and the narrowing is the point - it is also what keeps
 * ADR 0136 BR2's process boundary describable, since the process on the far
 * side of the socket is one Pico started with an executable it chose.
 *
 * **A depot declares what it provides; a person decides where it lands.**
 * There is no `privacyDomain` here, and its absence is a rule rather than an
 * oversight: ADR 0137 IN5 puts an instance in exactly one ADR 0075 Private
 * Space and says plainly that there is no safe default for that mapping,
 * because it is a person's judgement about their own life. A depot that could
 * name a domain would be a third party choosing a privacy boundary at
 * attachment time, silently, for material it has not seen.
 */
export const picoDepotManifestSchema = 'pico.depot.manifest.v1' as const;

/**
 * A path inside the depot, and nothing else. Relative, no traversal, no
 * absolute root, no home expansion, no whitespace - whitespace because that is
 * how a command line looks, and `node ./run.js` should fail as a path rather
 * than succeed as an instruction.
 *
 * `.js` and `.mjs` only. ADR 0143 DP2 vendors what runs, so a depot ships built
 * code; requiring a source extension would mean Pico compiling a third party's
 * TypeScript, which is a second runtime by another name.
 */
export const picoDepotEntryPointPattern =
  /^(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*\.m?js$/u;

export const maxPicoDepotEntryPointChars = 256;

export const maxPicoDepotSuppliers = 64;

/**
 * The names an author reaches for when they want to run something. Refused
 * under one error that says what is wrong rather than under a shape failure,
 * because these are not typos.
 *
 * **A process launch has three parts - the program, its arguments and its
 * environment - and all three are absent here.** Removing only the program
 * would leave two thirds of a spawn configurable by a third party, and `env`
 * in particular is the one that looks harmless: it is also how configuration,
 * and eventually a secret, would reach supplier code outside the single
 * custody path ADR 0138 CO1 allows and outside ADR 0104's refusal to put a
 * per-Pico decision in host configuration.
 */
const commandShapedFields = [
  'command',
  'cmd',
  'exec',
  'run',
  'args',
  'argv',
  'shell',
  'interpreter',
  'runtime',
  'binary',
  'env',
  'preExec',
  'postExec',
];

export interface PicoDepotSupplierDeclaration {
  /** ADR 0137 IN1. A person-facing token, never a path and never an address. */
  identifier: string;
  kind: PicoSupplierKind;
  /** ADR 0136 BR1. Which core shapes it fills. */
  slots: readonly PicoSupplierSlot[];
  /** ADR 0137 IN2. What it claims to cover. */
  coverage: readonly string[];
  /** ADR 0143 DP3. A file inside the depot. Pico supplies the runtime. */
  entryPoint: string;
  /**
   * ADR 0143 DP7. The slot-contract version this supplier speaks. An unknown
   * one is refused here rather than negotiated later.
   */
  protocolVersion: number;
  /**
   * ADR 0143 DP5. Another supplier **in this depot** that this one sits on.
   *
   * A bare identifier and never a remote, which is the whole cross-depot
   * refusal: there is no field in which another depot could be named, so
   * attaching one party cannot silently attach a second. Absent means this
   * supplier stands on its own.
   */
  dependsOn?: string;
}

export interface PicoDepotManifest {
  schema: typeof picoDepotManifestSchema;
  suppliers: readonly PicoDepotSupplierDeclaration[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertNoCommandShapedField(record: Record<string, unknown>): void {
  for (const field of commandShapedFields) {
    if (field in record) {
      throw new Error('pico_depot_cannot_name_a_command');
    }
  }
}


function parseSupplierDeclaration(value: unknown): PicoDepotSupplierDeclaration {
  const record = isRecord(value) ? value : undefined;
  if (record === undefined) {
    throw new Error('invalid_pico_depot_supplier');
  }
  // Before the shape check, so the useful error wins over the generic one.
  assertNoCommandShapedField(record);
  if ('privacyDomain' in record) {
    // ADR 0137 IN5. Not a shape failure: a depot choosing a person's Private
    // Space is the thing that must not be possible, and saying so is the only
    // way an author learns that this is the person's decision.
    throw new Error('pico_depot_cannot_choose_a_domain');
  }
  const optional = 'dependsOn' in record ? ['dependsOn'] : [];
  assertExactKeys(
    record,
    ['identifier', 'kind', 'slots', 'coverage', 'entryPoint', 'protocolVersion', ...optional],
    'invalid_pico_depot_supplier',
  );

  // ADR 0136 BR1 and ADR 0137 IN1/IN2, and not a second copy of them: what a
  // supplier declares is the same here as standalone, so it is asked in the
  // same place. What follows is what only a depot's supplier declares.
  const declared = assertPicoSupplierDeclaration(record);

  if (typeof record.entryPoint !== 'string'
    || record.entryPoint.length > maxPicoDepotEntryPointChars
    || !picoDepotEntryPointPattern.test(record.entryPoint)) {
    // Its own error, because the interesting failure is a value that *is* a
    // command line: `node ./run.js` has to fail as a path rather than succeed
    // as an instruction.
    throw new Error('invalid_pico_depot_entry_point');
  }

  // ADR 0143 DP7. Refused here rather than carried and negotiated later.
  assertPicoSupplierProtocolVersion(record.protocolVersion);

  if (record.dependsOn !== undefined) {
    if (typeof record.dependsOn !== 'string'
      || !picoSupplierIdentifierPattern.test(record.dependsOn)) {
      throw new Error('invalid_pico_depot_dependency');
    }
    if (record.dependsOn === record.identifier) {
      throw new Error('pico_depot_supplier_depends_on_itself');
    }
  }

  return Object.freeze({
    ...declared,
    entryPoint: record.entryPoint,
    protocolVersion: record.protocolVersion as number,
    ...(record.dependsOn === undefined
      ? {}
      : { dependsOn: record.dependsOn as string }),
  });
}

/**
 * ADR 0143 DP3. Refuses rather than repairing, for ADR 0117 X2's reason: a
 * manifest that half-parsed is one nobody declared.
 */
export function parsePicoDepotManifest(value: unknown): PicoDepotManifest {
  const record = isRecord(value) ? value : undefined;
  if (record === undefined) {
    throw new Error('invalid_pico_depot_manifest');
  }
  assertNoCommandShapedField(record);
  assertExactKeys(record, ['schema', 'suppliers'], 'invalid_pico_depot_manifest');

  if (record.schema !== picoDepotManifestSchema) {
    throw new Error('invalid_pico_depot_manifest_schema');
  }
  if (!Array.isArray(record.suppliers) || record.suppliers.length === 0) {
    // A depot that provides nothing is not a depot. Absent is not empty, and
    // empty is not a delivery.
    throw new Error('pico_depot_provides_no_supplier');
  }
  if (record.suppliers.length > maxPicoDepotSuppliers) {
    throw new Error('pico_depot_provides_too_many_suppliers');
  }

  const suppliers = (record.suppliers as unknown[]).map(parseSupplierDeclaration);
  const identifiers = new Set(suppliers.map((supplier) => supplier.identifier));
  if (identifiers.size !== suppliers.length) {
    // Two suppliers under one name inside one depot: whichever the core
    // attached would be a coin toss, and ADR 0137 IN1 says an identifier is an
    // identity.
    throw new Error('duplicate_pico_depot_supplier_identifier');
  }
  // ADR 0143 DP5. A dependency names a supplier in *this* depot, so an
  // unresolvable one is a manifest describing a stack it does not contain -
  // and the only way it could resolve elsewhere is a field that does not exist.
  for (const supplier of suppliers) {
    if (supplier.dependsOn !== undefined && !identifiers.has(supplier.dependsOn)) {
      throw new Error('pico_depot_dependency_not_in_depot');
    }
  }
  for (const supplier of suppliers) {
    const seen = new Set<string>([supplier.identifier]);
    let next = supplier.dependsOn;
    while (next !== undefined) {
      if (seen.has(next)) {
        throw new Error('pico_depot_dependency_cycle');
      }
      seen.add(next);
      next = suppliers.find((other) => other.identifier === next)?.dependsOn;
    }
  }

  const entryPoints = new Set(suppliers.map((supplier) => supplier.entryPoint));
  if (entryPoints.size !== suppliers.length) {
    // Two suppliers entering one file is one supplier wearing two names, and
    // ADR 0137 IN2's coverage question becomes meaningless if the same code
    // answers both.
    throw new Error('duplicate_pico_depot_entry_point');
  }

  return Object.freeze({
    schema: picoDepotManifestSchema,
    suppliers: Object.freeze(suppliers),
  });
}

/**
 * ADR 0143 DP5. The suppliers a person attaches, which is not all of them.
 *
 * A supplier may sit on another **in the same depot** - a git supplier
 * underneath doing transport and pin verification, a knowledge-base supplier
 * above it doing extraction. Only the top one is attached. The lower one is
 * not separately configured, does not appear as an ADR 0137 instance, and
 * inherits the Private Space, the credential and the ADR 0138 CO3/CO4 reach
 * decisions of the attachment above it - ADR 0127's activation shell applied
 * one level down, because the person made one decision about one thing and the
 * composition beneath it is the author's business.
 *
 * **Stacking across depots is not refused here; it is unsayable.** `dependsOn`
 * is a bare identifier resolved inside this manifest, so there is no field in
 * which a second depot could be named. Attaching one party therefore cannot
 * silently attach a second, which is the supply-chain move ADR 0143 exists to
 * prevent.
 */
export function picoDepotTopLevelSuppliers(
  manifest: PicoDepotManifest,
): readonly PicoDepotSupplierDeclaration[] {
  const depended = new Set(
    manifest.suppliers
      .map((supplier) => supplier.dependsOn)
      .filter((identifier): identifier is string => identifier !== undefined),
  );
  return Object.freeze(
    manifest.suppliers.filter((supplier) => !depended.has(supplier.identifier)),
  );
}

/**
 * ADR 0143 DP5. The stack under one attached supplier, top first.
 *
 * Returned as a list rather than walked by a caller, because the core sees
 * **one** supplier and everything below it is composition - a caller assembling
 * this itself would be a caller deciding what the stack is.
 */
export function picoDepotSupplierStack(
  manifest: PicoDepotManifest,
  identifier: string,
): readonly PicoDepotSupplierDeclaration[] {
  const byIdentifier = new Map(
    manifest.suppliers.map((supplier) => [supplier.identifier, supplier]),
  );
  const stack: PicoDepotSupplierDeclaration[] = [];
  const seen = new Set<string>();
  let current = byIdentifier.get(identifier);
  if (current === undefined) {
    throw new Error('pico_depot_supplier_not_declared');
  }
  while (current !== undefined) {
    if (seen.has(current.identifier)) {
      // Unreachable through `parsePicoDepotManifest`, which refuses a cycle.
      // Kept because this function is exported and a hand-built manifest is a
      // caller's mistake rather than a reason to loop forever.
      throw new Error('pico_depot_dependency_cycle');
    }
    seen.add(current.identifier);
    stack.push(current);
    current = current.dependsOn === undefined
      ? undefined
      : byIdentifier.get(current.dependsOn);
  }
  return Object.freeze(stack);
}

/**
 * ADR 0143 DP3 with ADR 0137 IN5. What a person still has to decide before a
 * declared supplier becomes an attached one.
 *
 * Exists so the gap is a value rather than a comment: a declaration is not a
 * manifest `attachPicoSupplier` accepts, and the missing piece is exactly the
 * one a depot may not supply.
 */
export function picoDepotSupplierNeedsFromPerson(): readonly string[] {
  return Object.freeze(['privacyDomain']);
}
