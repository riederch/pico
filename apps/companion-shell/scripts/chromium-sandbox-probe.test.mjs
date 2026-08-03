import { describe, expect, it } from 'vitest';
import { selectChromiumSandboxProbe } from './chromium-sandbox-probe.mjs';

const expectedHelperSha256 = 'a'.repeat(64);

function helper(overrides = {}) {
  return {
    gid: 0,
    isFile: () => true,
    isSymbolicLink: () => false,
    mode: 0o104755,
    uid: 0,
    ...overrides,
  };
}

function configuredHelper(overrides = {}) {
  return {
    expectedHelperSha256,
    hashHelper: () => expectedHelperSha256,
    helperExists: () => true,
    helperPath: '/validated/chrome-sandbox',
    inheritedSandboxPath: undefined,
    inspectHelper: () => helper(),
    ...overrides,
  };
}

describe('selectChromiumSandboxProbe', () => {
  it('uses only a byte-identical validated setuid helper', () => {
    expect(selectChromiumSandboxProbe(configuredHelper())).toEqual({
      arguments: [],
      environment: {
        CHROME_DEVEL_SANDBOX: '/validated/chrome-sandbox',
      },
      mode: 'installed_exact_setuid_helper',
    });
  });

  it('forces the user-namespace sandbox when no helper is configured', () => {
    expect(selectChromiumSandboxProbe({
      helperPath: null,
      inheritedSandboxPath: undefined,
    })).toEqual({
      arguments: ['--disable-setuid-sandbox'],
      environment: {},
      mode: 'user_namespace',
    });
  });

  it.each([
    ['a symlink', helper({ isFile: () => false, isSymbolicLink: () => true })],
    ['a non-root owner', helper({ uid: 1000 })],
    ['a non-setuid mode', helper({ mode: 0o100755 })],
  ])('rejects %s', (_description, metadata) => {
    expect(() => selectChromiumSandboxProbe(configuredHelper({
      inspectHelper: () => metadata,
    }))).toThrow();
  });

  it('rejects a relative configured helper path', () => {
    expect(() => selectChromiumSandboxProbe(configuredHelper({
      helperPath: 'relative/chrome-sandbox',
    }))).toThrow('must be absolute');
  });

  it('rejects a configured helper that is absent', () => {
    expect(() => selectChromiumSandboxProbe(configuredHelper({
      helperExists: () => false,
    }))).toThrow('does not exist');
  });

  it('rejects a helper from a different Electron distribution', () => {
    expect(() => selectChromiumSandboxProbe(configuredHelper({
      hashHelper: () => 'b'.repeat(64),
    }))).toThrow('differs from the packaged Electron helper');
  });

  it('rejects an inherited helper path instead of trusting host configuration', () => {
    expect(() => selectChromiumSandboxProbe({
      helperPath: null,
      inheritedSandboxPath: '/untrusted/chrome-sandbox',
    })).toThrow('unvalidated CHROME_DEVEL_SANDBOX');
  });
});
