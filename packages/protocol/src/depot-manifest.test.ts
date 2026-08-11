import { describe, expect, it } from 'vitest';
import { parsePicoSupplierManifest } from './supplier.js';
import {
  parsePicoDepotManifest,
  picoDepotManifestSchema,
  picoDepotSupplierNeedsFromPerson,
  picoDepotSupplierStack,
  picoDepotTopLevelSuppliers,
} from './depot-manifest.js';

const supplier = {
  identifier: 'rchkb',
  kind: 'library' as const,
  slots: ['memory_item' as const],
  coverage: ['knowledge_base'],
  entryPoint: 'suppliers/rchkb/index.js',
  protocolVersion: 1,
};

const manifest = { schema: picoDepotManifestSchema, suppliers: [supplier] };

describe('ADR 0143 DP3 - a depot names an entry point', () => {
  it('parses a manifest and freezes it', () => {
    const parsed = parsePicoDepotManifest(manifest);
    expect(parsed.suppliers).toHaveLength(1);
    expect(parsed.suppliers[0]?.entryPoint).toBe('suppliers/rchkb/index.js');
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.suppliers[0])).toBe(true);
  });

  it('refuses an entry point that is a command line', () => {
    // The interesting failure, and the one this gate exists for. `node ./run.js`
    // has to fail as a path rather than succeed as an instruction.
    for (const entryPoint of [
      'node ./run.js',
      'python3 run.py',
      './run.js --serve',
      'sh -c "node run.js"',
    ]) {
      expect(() => parsePicoDepotManifest({
        ...manifest,
        suppliers: [{ ...supplier, entryPoint }],
      })).toThrow('invalid_pico_depot_entry_point');
    }
  });

  it('refuses an entry point that leaves the depot', () => {
    for (const entryPoint of [
      '../elsewhere/index.js',
      'suppliers/../../index.js',
      '/usr/bin/node',
      '~/index.js',
    ]) {
      expect(() => parsePicoDepotManifest({
        ...manifest,
        suppliers: [{ ...supplier, entryPoint }],
      })).toThrow('invalid_pico_depot_entry_point');
    }
  });

  it('refuses an entry point Pico would have to compile', () => {
    // ADR 0143 DP2 vendors what runs, so a depot ships built code. Compiling a
    // third party's source would be a second runtime by another name.
    for (const entryPoint of ['index.ts', 'index.py', 'index', 'index.wasm']) {
      expect(() => parsePicoDepotManifest({
        ...manifest,
        suppliers: [{ ...supplier, entryPoint }],
      })).toThrow('invalid_pico_depot_entry_point');
    }
    expect(() => parsePicoDepotManifest({
      ...manifest,
      suppliers: [{ ...supplier, entryPoint: 'index.mjs' }],
    })).not.toThrow();
  });
});

describe('ADR 0143 DP3 - a command-shaped field is refused, never ignored', () => {
  it('names the refusal for every field an author would reach for', () => {
    // A field that is quietly dropped is a field an author believes in, and an
    // author who believes `interpreter` works ships a bridge that only runs by
    // accident.
    for (const field of [
      'command', 'cmd', 'exec', 'run', 'args', 'argv',
      'shell', 'interpreter', 'runtime', 'binary', 'env', 'preExec', 'postExec',
    ]) {
      expect(() => parsePicoDepotManifest({
        ...manifest,
        suppliers: [{ ...supplier, [field]: 'python3' }],
      })).toThrow('pico_depot_cannot_name_a_command');
    }
  });

  it('refuses one on the manifest as well as on a supplier', () => {
    expect(() => parsePicoDepotManifest({ ...manifest, runtime: 'python3.12' }))
      .toThrow('pico_depot_cannot_name_a_command');
  });

  it('puts the named refusal ahead of the generic shape error', () => {
    // Both are wrong; only one of them tells the author what they cannot do.
    expect(() => parsePicoDepotManifest({
      ...manifest,
      suppliers: [{ identifier: 'x', command: 'node run.js' }],
    })).toThrow('pico_depot_cannot_name_a_command');
  });
});

describe('ADR 0143 DP3 with ADR 0137 IN5 - a depot may not choose a domain', () => {
  it('refuses a declaration carrying a privacy domain, by name', () => {
    // Not a shape failure. A depot choosing a person's Private Space is what
    // must not be possible, and ADR 0137 IN5 says plainly there is no safe
    // default for that mapping because it is a person's judgement.
    expect(() => parsePicoDepotManifest({
      ...manifest,
      suppliers: [{ ...supplier, privacyDomain: 'privat' }],
    })).toThrow('pico_depot_cannot_choose_a_domain');
  });

  it('leaves exactly the piece the person supplies', () => {
    const declaration = parsePicoDepotManifest(manifest).suppliers[0]!;
    expect(picoDepotSupplierNeedsFromPerson()).toEqual(['privacyDomain']);

    // A declaration is not an attachable manifest until the person's decision
    // is added, and it is attachable the moment it is.
    const { entryPoint: _entryPoint, protocolVersion: _version, ...declared } = declaration;
    expect(() => parsePicoSupplierManifest(declared)).toThrow();
    expect(parsePicoSupplierManifest({ ...declared, privacyDomain: 'privat' }).identifier)
      .toBe('rchkb');
  });
});

describe('ADR 0143 DP3 - what a depot must not be able to say', () => {
  it('refuses a depot that provides nothing', () => {
    expect(() => parsePicoDepotManifest({ ...manifest, suppliers: [] }))
      .toThrow('pico_depot_provides_no_supplier');
  });

  it('refuses two suppliers under one name', () => {
    // Whichever the core attached would be a coin toss, and ADR 0137 IN1 says
    // an identifier is an identity.
    expect(() => parsePicoDepotManifest({
      ...manifest,
      suppliers: [supplier, { ...supplier, entryPoint: 'suppliers/other/index.js' }],
    })).toThrow('duplicate_pico_depot_supplier_identifier');
  });

  it('refuses two suppliers entering one file', () => {
    // One supplier wearing two names, which makes ADR 0137 IN2's coverage
    // question meaningless because the same code answers both.
    expect(() => parsePicoDepotManifest({
      ...manifest,
      suppliers: [supplier, { ...supplier, identifier: 'wwgkb' }],
    })).toThrow('duplicate_pico_depot_entry_point');
  });

  it('refuses an unlisted slot and an identifier that is an address', () => {
    expect(() => parsePicoDepotManifest({
      ...manifest,
      suppliers: [{ ...supplier, slots: ['event'] }],
    })).toThrow('pico_supplier_slot_not_listed');
    expect(() => parsePicoDepotManifest({
      ...manifest,
      suppliers: [{ ...supplier, identifier: 'https://x.invalid' }],
    })).toThrow('invalid_pico_supplier_identifier');
  });

  it('refuses an undeclared extra field rather than dropping it', () => {
    expect(() => parsePicoDepotManifest({ ...manifest, trusted: true }))
      .toThrow('invalid_pico_depot_manifest');
    expect(() => parsePicoDepotManifest({
      ...manifest,
      suppliers: [{ ...supplier, priority: 1 }],
    })).toThrow('invalid_pico_depot_supplier');
  });

  it('refuses a manifest under a schema it does not know', () => {
    expect(() => parsePicoDepotManifest({ ...manifest, schema: 'pico.depot.manifest.v2' }))
      .toThrow('invalid_pico_depot_manifest_schema');
  });
});

const git = {
  identifier: 'gitea-rch',
  kind: 'library' as const,
  slots: ['memory_item' as const],
  coverage: ['transport'],
  entryPoint: 'suppliers/git/index.js',
  protocolVersion: 1,
};

const stacked = {
  schema: picoDepotManifestSchema,
  suppliers: [git, { ...supplier, dependsOn: 'gitea-rch' }],
};

describe('ADR 0143 DP7 - an unknown protocol version is refused', () => {
  it('takes the version this core speaks', () => {
    expect(parsePicoDepotManifest(manifest).suppliers[0]?.protocolVersion).toBe(1);
  });

  it('refuses a version it does not know, rather than adapting to it', () => {
    // No fallback and no subset. The code that decides what an old supplier
    // still supports would live in the core, grow a branch per version, and
    // every branch would be a path through which a supplier selects the core's
    // behaviour.
    for (const protocolVersion of [0, 2, 99, 1.5, '1', undefined]) {
      expect(() => parsePicoDepotManifest({
        ...manifest,
        suppliers: [{ ...supplier, protocolVersion }],
      })).toThrow('pico_supplier_protocol_version_not_supported');
    }
  });
});

describe('ADR 0143 DP5 - suppliers stack inside one depot', () => {
  it('attaches only the top of a stack', () => {
    // The core sees one supplier. The lower layer inherits space, credential
    // and reach decisions from the attachment above it, and never appears as
    // an ADR 0137 instance of its own.
    const parsed = parsePicoDepotManifest(stacked);
    expect(picoDepotTopLevelSuppliers(parsed).map((s) => s.identifier))
      .toEqual(['rchkb']);
  });

  it('hands back the whole stack, top first', () => {
    const parsed = parsePicoDepotManifest(stacked);
    expect(picoDepotSupplierStack(parsed, 'rchkb').map((s) => s.identifier))
      .toEqual(['rchkb', 'gitea-rch']);
  });

  it('has no field in which another depot could be named', () => {
    // Cross-depot stacking is not refused, it is unsayable: `dependsOn` is a
    // bare identifier resolved inside this manifest, so attaching one party
    // cannot silently attach a second.
    const declaration = parsePicoDepotManifest(stacked).suppliers
      .find((s) => s.identifier === 'rchkb')!;
    expect(typeof declaration.dependsOn).toBe('string');
    expect(declaration.dependsOn).not.toContain('/');
    expect(declaration.dependsOn).not.toContain(':');
  });

  it('refuses a dependency this depot does not contain', () => {
    expect(() => parsePicoDepotManifest({
      ...manifest,
      suppliers: [{ ...supplier, dependsOn: 'somewhere-else' }],
    })).toThrow('pico_depot_dependency_not_in_depot');
  });

  it('refuses a dependency that is an address', () => {
    expect(() => parsePicoDepotManifest({
      ...manifest,
      suppliers: [{ ...supplier, dependsOn: 'https://other.invalid/depot.git#git' }],
    })).toThrow('invalid_pico_depot_dependency');
  });

  it('refuses a cycle and a self-dependency', () => {
    expect(() => parsePicoDepotManifest({
      ...manifest,
      suppliers: [{ ...supplier, dependsOn: 'rchkb' }],
    })).toThrow('pico_depot_supplier_depends_on_itself');

    expect(() => parsePicoDepotManifest({
      schema: picoDepotManifestSchema,
      suppliers: [
        { ...git, dependsOn: 'rchkb' },
        { ...supplier, dependsOn: 'gitea-rch' },
      ],
    })).toThrow('pico_depot_dependency_cycle');
  });

  it('leaves an independent supplier top-level', () => {
    const parsed = parsePicoDepotManifest({
      schema: picoDepotManifestSchema,
      suppliers: [git, supplier],
    });
    expect(picoDepotTopLevelSuppliers(parsed).map((s) => s.identifier).sort())
      .toEqual(['gitea-rch', 'rchkb']);
    expect(picoDepotSupplierStack(parsed, 'rchkb').map((s) => s.identifier))
      .toEqual(['rchkb']);
  });
});
