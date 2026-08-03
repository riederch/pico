import { describe, expect, it } from 'vitest';
import {
  rootOwnedPackageProbeEnvironment,
  rootOwnedPackageProbeRequested,
  selectChromiumSandboxProbe,
} from './chromium-sandbox-probe.mjs';

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

function rootOwnedProbe(overrides = {}) {
  return {
    helperExists: () => true,
    inheritedSandboxPath: undefined,
    inspectHelper: () => helper(),
    packagedHelperPath: '/root-owned-extraction/opt/pico-companion/chrome-sandbox',
    rootOwnedPackageProbe: true,
    ...overrides,
  };
}

describe('selectChromiumSandboxProbe', () => {
  it('uses the adjacent helper only from a validated root-owned extraction', () => {
    expect(selectChromiumSandboxProbe(rootOwnedProbe())).toEqual({
      arguments: [],
      environment: {},
      mode: 'root_owned_packaged_setuid_helper',
    });
  });

  it('forces the user-namespace sandbox for an ordinary local extraction', () => {
    expect(selectChromiumSandboxProbe({
      inheritedSandboxPath: undefined,
      rootOwnedPackageProbe: false,
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
    expect(() => selectChromiumSandboxProbe(rootOwnedProbe({
      inspectHelper: () => metadata,
    }))).toThrow();
  });

  it('rejects a relative packaged helper path', () => {
    expect(() => selectChromiumSandboxProbe(rootOwnedProbe({
      packagedHelperPath: 'relative/chrome-sandbox',
    }))).toThrow('must be absolute');
  });

  it('rejects a packaged helper that is absent', () => {
    expect(() => selectChromiumSandboxProbe(rootOwnedProbe({
      helperExists: () => false,
    }))).toThrow('does not exist');
  });

  it('rejects an inherited helper path instead of trusting host configuration', () => {
    expect(() => selectChromiumSandboxProbe({
      inheritedSandboxPath: '/untrusted/chrome-sandbox',
      rootOwnedPackageProbe: false,
    })).toThrow('unvalidated CHROME_DEVEL_SANDBOX');
  });
});

describe('rootOwnedPackageProbeRequested', () => {
  it('accepts only the explicit CI opt-in', () => {
    expect(rootOwnedPackageProbeRequested('1')).toBe(true);
    expect(rootOwnedPackageProbeRequested(undefined)).toBe(false);
  });

  it('reads the process environment only when the value is omitted', () => {
    const previousValue = process.env[rootOwnedPackageProbeEnvironment];
    try {
      process.env[rootOwnedPackageProbeEnvironment] = '1';
      expect(rootOwnedPackageProbeRequested()).toBe(true);
      expect(rootOwnedPackageProbeRequested(undefined)).toBe(false);

      delete process.env[rootOwnedPackageProbeEnvironment];
      expect(rootOwnedPackageProbeRequested()).toBe(false);
    } finally {
      if (previousValue === undefined) {
        delete process.env[rootOwnedPackageProbeEnvironment];
      } else {
        process.env[rootOwnedPackageProbeEnvironment] = previousValue;
      }
    }
  });

  it('rejects ambiguous opt-in values', () => {
    expect(() => rootOwnedPackageProbeRequested('true')).toThrow('must be unset or exactly 1');
  });
});
