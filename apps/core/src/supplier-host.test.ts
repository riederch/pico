import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPicoLibraryDerivation,
  parsePicoLibraryPin,
  picoLibraryPinCoversContent,
} from '@pico/protocol/library-pin';
import { afterEach, describe, expect, it } from 'vitest';
import { PicoSupplierHost } from './supplier-host.js';

/**
 * ADR 0136 BR2, the half that had to be a process rather than a contract.
 *
 * Everything below runs the **shipped** supplier - `bridges/suppliers/
 * git-library` - in a real child process over real frames. Until now every
 * proof in the supplier strand stood in for a supplier; this one has one.
 *
 * What it deliberately does not do is read anything. A library becomes
 * readable through ADR 0117 X4's quarantined read job, which needs a model
 * delegation runtime that does not exist, so no content crosses a slot here.
 * The two facts that are true about a corpus without reading a byte of it -
 * its condition and its pin - are what cross.
 */
const tempDirs: string[] = [];
const hosts: PicoSupplierHost[] = [];

const shippedEntryPoint = fileURLToPath(
  new URL('../../../bridges/suppliers/git-library/index.js', import.meta.url),
);

afterEach(() => {
  for (const host of hosts.splice(0)) {
    host.close();
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function openHost(entryPoint = shippedEntryPoint): PicoSupplierHost {
  const host = new PicoSupplierHost({ entryPoint, requestTimeoutMs: 10_000 });
  hosts.push(host);
  return host;
}

/** A real working copy, small enough to make in a test. */
function makeWorkingCopy(options: { gitAttributes?: string } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'pico-library-'));
  tempDirs.push(dir);
  writeFileSync(join(dir, 'note.md'), '# a note\n');
  if (options.gitAttributes !== undefined) {
    writeFileSync(join(dir, '.gitattributes'), options.gitAttributes);
  }
  execSync('git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm first', {
    cwd: dir,
    stdio: 'ignore',
  });
  return dir;
}

describe('ADR 0136 BR2 - the supplier runs in its own process', () => {
  it('answers hello with the version this core speaks', async () => {
    const host = openHost();
    expect(await host.hello()).toEqual({ protocolVersion: 1, slots: ['memory_item'] });
    expect(host.ready).toBe(true);
  });

  it('reports a real working copy as ok, with the commit it is on', async () => {
    const host = openHost();
    await host.hello();
    const root = makeWorkingCopy();

    const report = await host.condition({ workingCopy: root });
    expect(report.condition).toBe('ok');

    // ADR 0136 BR6. The pin comes back as data and the *core* decides what it
    // covers - the supplier hands over `.gitattributes` unread, because a
    // supplier answering "my content is verified" is the laundering step.
    const detail = report.detail as { pin: unknown; gitAttributes: string };
    const pin = parsePicoLibraryPin(detail.pin);
    expect(pin.kind).toBe('commit');
    expect(picoLibraryPinCoversContent({ pin, gitAttributes: detail.gitAttributes })).toBe(true);

    // And it is enough to build the provenance a derived item would carry.
    expect(buildPicoLibraryDerivation({
      supplierIdentifier: 'git-library',
      pin,
      pinCoversContent: picoLibraryPinCoversContent({ pin, gitAttributes: detail.gitAttributes }),
    }).pinCoversContent).toBe(true);
  });

  it('says the commit does not cover the content when LFS is in play', async () => {
    // End to end now: the supplier reads the file, the core answers the
    // question, and neither does the other's job.
    const host = openHost();
    await host.hello();
    const root = makeWorkingCopy({ gitAttributes: '*.pdf filter=lfs diff=lfs -text\n' });

    const detail = (await host.condition({ workingCopy: root })).detail as {
      pin: unknown; gitAttributes: string;
    };
    expect(picoLibraryPinCoversContent({
      pin: parsePicoLibraryPin(detail.pin),
      gitAttributes: detail.gitAttributes,
    })).toBe(false);
  });

  it('says not_configured when no path was supplied, and spends nothing', async () => {
    // ADR 0138 CO2. Nothing was attempted, so nothing was disclosed - a state
    // of the system rather than a fault in it.
    const host = openHost();
    await host.hello();
    expect((await host.condition()).condition).toBe('not_configured');
  });

  it('says unreachable for a path that is not there', async () => {
    const host = openHost();
    await host.hello();
    expect((await host.condition({ workingCopy: '/nonexistent/pico/library' })).condition)
      .toBe('unreachable');
  });

  it('says unreachable for a directory that is not a working copy', async () => {
    // Present but unpinnable. Not `ok`, because an answer Pico could not trace
    // back to a revision is one ADR 0133 has no correction point for.
    const host = openHost();
    await host.hello();
    const dir = mkdtempSync(join(tmpdir(), 'pico-not-a-repo-'));
    tempDirs.push(dir);
    expect((await host.condition({ workingCopy: dir })).condition).toBe('unreachable');
  });
});

describe('ADR 0136 BR2 - what the boundary refuses', () => {
  it('refuses a condition the closed list does not have', async () => {
    // A supplier inventing a state gets a refusal rather than a place in the
    // vocabulary (ADR 0138 CO2).
    const dir = mkdtempSync(join(tmpdir(), 'pico-bad-supplier-'));
    tempDirs.push(dir);
    writeFileSync(join(dir, 'index.js'),
      "export default async () => ({ protocolVersion: 1, slots: ['memory_item'], condition: 'fine' });\n");

    const host = openHost(join(dir, 'index.js'));
    await host.hello();
    await expect(host.condition()).rejects.toThrow('invalid_pico_supplier_condition');
  });

  it('refuses a protocol version it does not know, and closes', async () => {
    // ADR 0143 DP7 at runtime. A supplier this core cannot speak to is not one
    // to keep a process open for, and leaving it up would invite a caller to
    // try the next family anyway.
    const dir = mkdtempSync(join(tmpdir(), 'pico-future-supplier-'));
    tempDirs.push(dir);
    writeFileSync(join(dir, 'index.js'),
      "export default async () => ({ protocolVersion: 2, slots: ['memory_item'] });\n");

    const host = openHost(join(dir, 'index.js'));
    await expect(host.hello()).rejects.toThrow('pico_supplier_protocol_version_not_supported');
    expect(host.ready).toBe(false);
  });

  it('turns a thrown supplier error into a refusal and keeps the process up', async () => {
    // One bad answer must not look like a compromised process.
    const dir = mkdtempSync(join(tmpdir(), 'pico-throwing-supplier-'));
    tempDirs.push(dir);
    writeFileSync(join(dir, 'index.js'), [
      "export default async function handle(request) {",
      "  if (request.family === 'pico.supplier.hello.v1') {",
      "    return { protocolVersion: 1, slots: ['memory_item'] };",
      "  }",
      "  throw new Error('supplier_said_no');",
      '}',
      '',
    ].join('\n'));

    const host = openHost(join(dir, 'index.js'));
    await host.hello();
    await expect(host.condition()).rejects.toThrow('supplier_said_no');
    // Still answering, which is the property being asserted.
    expect(await host.hello()).toEqual({ protocolVersion: 1, slots: ['memory_item'] });
  });

  /**
   * Befund B151, die letzten zwei Schulden. Beide Ablehnungen heissen "der
   * Zulieferer ist nicht mehr da" und meinen Verschiedenes: einmal hat *dieses*
   * Home zugemacht, einmal ist der fremde Prozess gegangen. Wer beides
   * gleichsetzt, kann nicht unterscheiden, ob ein Abbruch die eigene
   * Entscheidung war.
   */
  it('refuses once it has closed, rather than starting the supplier again', async () => {
    const host = openHost();
    await host.hello();
    host.close();
    await expect(host.hello()).rejects.toThrow('pico_supplier_closed');
  });

  it('refuses a pending request when the supplier process ends under it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pico-exiting-supplier-'));
    tempDirs.push(dir);
    writeFileSync(join(dir, 'index.js'), [
      'export default async function handle(request) {',
      "  if (request.family === 'pico.supplier.hello.v1') {",
      "    return { protocolVersion: 1, slots: ['memory_item'] };",
      '  }',
      '  // Keine Antwort, sondern Ende - der Fall, den `exit` auffangen muss.',
      '  process.exit(0);',
      '}',
      '',
    ].join('\n'));

    const host = openHost(join(dir, 'index.js'));
    await host.hello();
    await expect(host.condition()).rejects.toThrow('pico_supplier_exited');
  });

  it('gives the supplier no environment to read', async () => {
    // ADR 0143 DP3. The manifest has no `env` field, and the process it starts
    // has no environment either - otherwise the missing field would be a rule
    // about a manifest with a hole underneath it.
    const dir = mkdtempSync(join(tmpdir(), 'pico-env-supplier-'));
    tempDirs.push(dir);
    writeFileSync(join(dir, 'index.js'), [
      "export default async function handle(request) {",
      "  if (request.family === 'pico.supplier.hello.v1') {",
      "    return { protocolVersion: 1, slots: ['memory_item'] };",
      "  }",
      "  return { condition: 'ok', detail: { keys: Object.keys(process.env).sort() } };",
      '}',
      '',
    ].join('\n'));

    process.env.PICO_SUPPLIER_HOST_SECRET = 'must-not-be-visible';
    try {
      const host = openHost(join(dir, 'index.js'));
      await host.hello();
      const detail = (await host.condition()).detail as { keys: string[] };
      expect(detail.keys).toEqual(['PATH']);
    } finally {
      delete process.env.PICO_SUPPLIER_HOST_SECRET;
    }
  });

  it('reports a supplier that never answers as unreachable', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pico-silent-supplier-'));
    tempDirs.push(dir);
    writeFileSync(join(dir, 'index.js'),
      'export default async () => new Promise(() => {});\n');

    const host = new PicoSupplierHost({
      entryPoint: join(dir, 'index.js'),
      requestTimeoutMs: 250,
    });
    hosts.push(host);
    await expect(host.hello()).rejects.toThrow('unreachable');
  });

  it('refuses an entry point that exports no handler', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pico-handlerless-supplier-'));
    tempDirs.push(dir);
    mkdirSync(join(dir, 'sub'), { recursive: true });
    writeFileSync(join(dir, 'sub', 'index.js'), 'export const nothing = 1;\n');

    const host = new PicoSupplierHost({
      entryPoint: join(dir, 'sub', 'index.js'),
      requestTimeoutMs: 2_000,
    });
    hosts.push(host);
    await expect(host.hello()).rejects.toThrow(/unreachable|exited/u);
  });
});

describe('ADR 0136 BR2 - the runner ships with the product', () => {
  it('is present beside the built host, not only beside the source', () => {
    // `tsc` does not copy `.mjs`, so the build step does. Without this the
    // tests would pass from `src` while the built product could not start a
    // single supplier - the failure would show up first in a package, which
    // is the most expensive place to find it.
    const built = fileURLToPath(new URL('../dist/supplier-runner.mjs', import.meta.url));
    expect(existsSync(built)).toBe(true);
  });
});

describe('ADR 0136 BR6 - materializing is Pico knowledge, not a supplier answer', () => {
  it('reports materializing where the supplier said unreachable', async () => {
    // The shipped supplier cannot tell a clone in progress from a damaged
    // repository - checked, not assumed: both have .git/HEAD naming a ref that
    // does not resolve. Only the side that started the fetch knows.
    const host = openHost();
    await host.hello();
    const dir = mkdtempSync(join(tmpdir(), 'pico-not-a-repo-yet-'));
    tempDirs.push(dir);

    expect((await host.condition({ workingCopy: dir })).condition).toBe('unreachable');
    expect((await host.condition({ workingCopy: dir }, { materializing: true })).condition)
      .toBe('materializing');
  });

  it('gives the supplier no way to declare itself patient', async () => {
    // The knowledge is a second argument rather than part of the request, so
    // nothing a supplier returns can produce it.
    const dir = mkdtempSync(join(tmpdir(), 'pico-patient-supplier-'));
    tempDirs.push(dir);
    writeFileSync(join(dir, 'index.js'), [
      "export default async function handle(request) {",
      "  if (request.family === 'pico.supplier.hello.v1') {",
      "    return { protocolVersion: 1, slots: ['memory_item'] };",
      "  }",
      "  return { condition: 'materializing' };",
      '}',
      '',
    ].join('\n'));

    const host = openHost(join(dir, 'index.js'));
    await host.hello();
    // It can *say* it, because the word is in the closed list - what it cannot
    // do is have Pico substitute it, and it cannot turn a real failure into
    // patience either.
    expect((await host.condition()).condition).toBe('materializing');
    expect((await host.condition({}, { materializing: true })).condition)
      .toBe('materializing');
  });

  it('never launders another condition into patience', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pico-budget-supplier-'));
    tempDirs.push(dir);
    writeFileSync(join(dir, 'index.js'), [
      "export default async function handle(request) {",
      "  if (request.family === 'pico.supplier.hello.v1') {",
      "    return { protocolVersion: 1, slots: ['memory_item'] };",
      "  }",
      "  return { condition: 'budget_exhausted' };",
      '}',
      '',
    ].join('\n'));

    const host = openHost(join(dir, 'index.js'));
    await host.hello();
    expect((await host.condition({}, { materializing: true })).condition)
      .toBe('budget_exhausted');
  });
});

describe('ADR 0136 BR1 - the memory_item slot, over a real process', () => {
  it('hands back one bounded excerpt with the revision it was read at', async () => {
    // The sentence `bridges/README.md` carried for weeks - "reading a library
    // is lawful only through ADR 0117 X4's quarantined read job, which needs a
    // model delegation runtime that does not exist" - stops being true here.
    const host = openHost();
    await host.hello();
    const root = makeWorkingCopy();
    const offered = await host.offer({ workingCopy: root, path: 'note.md' });
    expect(offered.condition).toBe('ok');
    const items = offered.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0]!.text).toBe('# a note\n');
    expect((items[0]!.pin as { kind: string }).kind).toBe('commit');
  });

  it('refuses an excerpt over the ceiling rather than trimming it', async () => {
    // ADR 0119 Q5's posture at the supplier: a silently shortened excerpt is a
    // different excerpt, and whatever read it would be answering about
    // something nobody chose.
    const host = openHost();
    await host.hello();
    const root = makeWorkingCopy();
    const offered = await host.offer({ workingCopy: root, path: 'note.md', maxBytes: 2 });
    expect(offered.condition).toBe('out_of_scope');
    expect((offered.detail as { reason: string }).reason).toBe('excerpt_too_large');
  });

  it('refuses a path that leaves the working copy', async () => {
    const host = openHost();
    await host.hello();
    const root = makeWorkingCopy();
    await expect(host.offer({ workingCopy: root, path: '../../etc/passwd' }))
      .rejects.toThrow();
  });

  it('says covered-and-absent rather than nothing', async () => {
    // ADR 0137 IN2: an empty answer that meant both "not here" and "not
    // covered" would be permanently ambiguous.
    const host = openHost();
    await host.hello();
    const root = makeWorkingCopy();
    const offered = await host.offer({ workingCopy: root, path: 'missing.md' });
    expect(offered.condition).toBe('ok');
    expect(offered.items).toEqual([]);
  });
});

/**
 * ADR 0136 BR2 with ADR 0097's framing. What the host does with bytes a
 * supplier should not be sending.
 *
 * The shipped runner cannot produce these - a supplier module exports handlers
 * and never touches the wire - so the rogue runtime below stands in for one
 * that was replaced or subverted. That is the case the framing rules exist
 * for: every one of them is about a process on the other side behaving badly,
 * and none of them could be observed while only well-behaved processes ran.
 */
function rogueRuntime(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'pico-rogue-runtime-'));
  tempDirs.push(dir);
  const path = join(dir, 'runtime.mjs');
  writeFileSync(path, `#!/usr/bin/env node\n${body}\n`, { mode: 0o755 });
  return path;
}

function rogueHost(runtime: string): PicoSupplierHost {
  const host = new PicoSupplierHost({
    entryPoint: shippedEntryPoint,
    execPath: runtime,
    requestTimeoutMs: 1_000,
  });
  hosts.push(host);
  return host;
}

describe('ADR 0097 framing - a supplier that speaks out of turn', () => {
  it('drops an answer belonging to no request rather than interpreting it', async () => {
    // The core is the client in initiative: a frame arriving unasked has no
    // request to belong to. Interpreting one would let a supplier decide when
    // Pico takes something in.
    const host = rogueHost(rogueRuntime(`
      const unasked = JSON.stringify({
        family: 'pico.supplier.response.v1',
        requestId: 'never-asked-for',
        ok: true,
        result: { protocolVersion: 1, slots: [] },
      });
      const body = Buffer.from(unasked, 'utf8');
      const frame = Buffer.allocUnsafe(4 + body.byteLength);
      frame.writeUInt32BE(body.byteLength, 0);
      body.copy(frame, 4);
      process.stdout.write(frame);
      setTimeout(() => {}, 5_000);
    `));

    // The unasked answer is dropped, so `hello` waits and times out rather
    // than resolving with somebody else's frame.
    await expect(host.hello()).rejects.toThrow(/unreachable|timed_out|refused/u);
  });

  it('drops a frame whose family is not the response family', async () => {
    // The rogue answers the *right* request id under the wrong family, so
    // nothing but the family check stands between this and an accepted answer.
    // Every response carries one family; anything else is a supplier speaking
    // out of turn, and there is no inbound family it could be.
    const host = rogueHost(rogueRuntime(`
      let buffered = Buffer.alloc(0);
      process.stdin.on('data', (chunk) => {
        buffered = Buffer.concat([buffered, chunk]);
        if (buffered.byteLength < 4) return;
        const length = buffered.readUInt32BE(0);
        if (buffered.byteLength < 4 + length) return;
        const asked = JSON.parse(buffered.subarray(4, 4 + length).toString('utf8'));
        buffered = buffered.subarray(4 + length);
        const body = Buffer.from(JSON.stringify({
          family: 'pico.supplier.hello.v1',
          requestId: asked.requestId,
          ok: true,
          result: { protocolVersion: 1, slots: [] },
        }), 'utf8');
        const frame = Buffer.allocUnsafe(4 + body.byteLength);
        frame.writeUInt32BE(body.byteLength, 0);
        body.copy(frame, 4);
        process.stdout.write(frame);
      });
      setTimeout(() => {}, 5_000);
    `));

    await expect(host.hello()).rejects.toThrow(/unreachable|timed_out|refused/u);
  });

  it('ends the connection on a declared body it will not allocate', async () => {
    // Checked before the body is buffered: a supplier that declares four
    // gigabytes must not be able to make this process reserve them.
    const host = rogueHost(rogueRuntime(`
      const frame = Buffer.alloc(4);
      frame.writeUInt32BE(4_000_000_000, 0);
      process.stdout.write(frame);
      setTimeout(() => {}, 5_000);
    `));

    // It ends the connection rather than waiting for four gigabytes that will
    // never arrive, so this fails at once instead of at the request timeout -
    // and the elapsed time is the only way to tell those two apart.
    const startedAt = Date.now();
    await expect(host.hello()).rejects.toThrow();
    expect(Date.now() - startedAt).toBeLessThan(900);
  });
});
