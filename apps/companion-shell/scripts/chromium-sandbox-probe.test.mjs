import { describe, expect, it } from 'vitest';
import { selectChromiumSandboxProbe } from './chromium-sandbox-probe.mjs';

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

describe('selectChromiumSandboxProbe', () => {
  it('uses only a validated system setuid helper', () => {
    expect(selectChromiumSandboxProbe({
      helperExists: () => true,
      helperPath: '/validated/chrome-sandbox',
      inheritedSandboxPath: '/untrusted/chrome-sandbox',
      inspectHelper: () => helper(),
    })).toEqual({
      arguments: [],
      environment: {
        CHROME_DEVEL_SANDBOX: '/validated/chrome-sandbox',
      },
      mode: 'system_setuid_helper',
    });
  });

  it('forces the user-namespace sandbox when no system helper exists', () => {
    expect(selectChromiumSandboxProbe({
      helperExists: () => false,
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
    expect(() => selectChromiumSandboxProbe({
      helperExists: () => true,
      inspectHelper: () => metadata,
    })).toThrow();
  });

  it('rejects an inherited helper path instead of trusting host configuration', () => {
    expect(() => selectChromiumSandboxProbe({
      helperExists: () => false,
      inheritedSandboxPath: '/untrusted/chrome-sandbox',
    })).toThrow('unvalidated CHROME_DEVEL_SANDBOX');
  });
});
