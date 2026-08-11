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
