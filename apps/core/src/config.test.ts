import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('Core config', () => {
  it('loads defaults when environment values are absent', () => {
    const config = loadConfig({});

    expect(config).toEqual({
      host: '127.0.0.1',
      port: 3100,
      linkIntake: undefined,
      databasePath: 'apps/core/data/pico.sqlite',
      backupDirectory: 'apps/core/data/backups',
      keyStorePath: 'apps/core/data/keys',
      homeHostKeyStorePath: 'apps/core/data/home-host-keys',
      recoveryAnchorPath: 'apps/core/data/recovery-anchor/anchor.json',
      depotRoot: 'apps/core/data/depots',
      supplierScratchRoot: 'apps/core/data/scratch',
      linkRelayOperator: 'unconfigured.relay.invalid',
      linkRelaySweepIntervalMs: 2 * 60 * 1_000,
      depotFetchIntervalMs: 6 * 60 * 60 * 1_000,
      memoryEncryption: false,
      deviceId: 'pico-core',
      webRootPath: expect.stringContaining('/apps/web'),
      wsAllowedOrigins: [],
      foundationToken: undefined,
      foundationAccessMode: 'loopback-dev',
    });
  });

  it('loads explicit environment values', () => {
    const config = loadConfig({
      PICO_HOST: '127.0.0.1',
      PICO_PORT: '4100',
      PICO_LINK_INTAKE_HOST: '0.0.0.0',
      PICO_LINK_INTAKE_PORT: '4101',
      PICO_DATABASE_PATH: '/tmp/pico.sqlite',
      PICO_BACKUP_DIRECTORY: '/tmp/pico-backups',
      PICO_KEY_STORE_PATH: '/tmp/pico-keys',
      PICO_HOME_HOST_KEY_STORE_PATH: '/tmp/pico-home-host-keys',
      PICO_RECOVERY_ANCHOR_PATH: '/tmp/pico-recovery-anchor/anchor.json',
      PICO_DEPOT_ROOT: '/tmp/pico-depots',
      PICO_SUPPLIER_SCRATCH_ROOT: '/tmp/pico-scratch',
      PICO_LINK_RELAY_OPERATOR: 'relay.example.invalid',
      PICO_DEPOT_FETCH_INTERVAL_MS: '900000',
      PICO_MEMORY_ENCRYPTION: 'true',
      PICO_DEVICE_ID: 'test-core',
      PICO_WEB_ROOT: '/tmp/pico-web',
      PICO_WS_ALLOWED_ORIGINS: 'https://dev.example.test, http://localhost:5173/',
      PICO_FOUNDATION_TOKEN: 'dev-token',
      PICO_FOUNDATION_ACCESS_MODE: 'loopback-dev',
    });

    expect(config).toEqual({
      host: '127.0.0.1',
      port: 4100,
      linkIntake: {
        host: '0.0.0.0',
        port: 4101,
      },
      databasePath: '/tmp/pico.sqlite',
      backupDirectory: '/tmp/pico-backups',
      keyStorePath: '/tmp/pico-keys',
      homeHostKeyStorePath: '/tmp/pico-home-host-keys',
      recoveryAnchorPath: '/tmp/pico-recovery-anchor/anchor.json',
      depotRoot: '/tmp/pico-depots',
      supplierScratchRoot: '/tmp/pico-scratch',
      linkRelayOperator: 'relay.example.invalid',
      linkRelaySweepIntervalMs: 2 * 60 * 1_000,
      depotFetchIntervalMs: 900_000,
      memoryEncryption: true,
      deviceId: 'test-core',
      webRootPath: '/tmp/pico-web',
      wsAllowedOrigins: ['https://dev.example.test', 'http://localhost:5173'],
      foundationToken: 'dev-token',
      foundationAccessMode: 'loopback-dev',
    });
  });

  it('derives direct-token mode for non-loopback access with a token', () => {
    const config = loadConfig({
      PICO_HOST: '0.0.0.0',
      PICO_FOUNDATION_TOKEN: 'dev-token',
    });

    expect(config.foundationAccessMode).toBe('direct-token');
  });

  it('rejects non-loopback access without a token or explicit mode', () => {
    expect(() => loadConfig({ PICO_HOST: '0.0.0.0' })).toThrow(
      'PICO_FOUNDATION_ACCESS_MODE must be set when PICO_HOST is not loopback and PICO_FOUNDATION_TOKEN is not configured.',
    );
  });

  it('rejects invalid foundation access modes and names both sets', () => {
    for (const mode of ['public', 'unsafe-trusted-local']) {
      expect(() => loadConfig({ PICO_FOUNDATION_ACCESS_MODE: mode })).toThrow(
        'PICO_FOUNDATION_ACCESS_MODE must be one of: loopback-dev, direct-token, '
        + 'trusted-proxy (also accepted: ha-ingress).',
      );
    }
  });

  it('rejects loopback-dev mode on non-loopback hosts', () => {
    expect(() => loadConfig({
      PICO_HOST: '0.0.0.0',
      PICO_FOUNDATION_ACCESS_MODE: 'loopback-dev',
    })).toThrow('PICO_FOUNDATION_ACCESS_MODE=loopback-dev requires PICO_HOST to be a loopback host.');
  });

  it('rejects direct-token mode without a foundation token', () => {
    expect(() => loadConfig({
      PICO_HOST: '0.0.0.0',
      PICO_FOUNDATION_ACCESS_MODE: 'direct-token',
    })).toThrow('PICO_FOUNDATION_ACCESS_MODE=direct-token requires PICO_FOUNDATION_TOKEN.');
  });

  it('accepts explicit trusted-proxy mode for non-loopback hosts', () => {
    const config = loadConfig({
      PICO_HOST: '0.0.0.0',
      PICO_FOUNDATION_ACCESS_MODE: 'trusted-proxy',
    });
    expect(config.foundationAccessMode).toBe('trusted-proxy');
    // Nothing to say: the current name was used.
    expect(config.foundationAccessModeAlias).toBeUndefined();
  });

  describe('ADR 0128 H5 the former name keeps working', () => {
    it('resolves ha-ingress to trusted-proxy and records what was configured', () => {
      // ADR 0122: this value ships in an installed config and sits in people's
      // container environments. A rename that refused it would turn an update
      // into an outage, so it resolves and the boot log says so once.
      const config = loadConfig({
        PICO_HOST: '0.0.0.0',
        PICO_FOUNDATION_ACCESS_MODE: 'ha-ingress',
      });
      expect(config.foundationAccessMode).toBe('trusted-proxy');
      expect(config.foundationAccessModeAlias).toBe('ha-ingress');
    });

    it('puts the former name through the same rules, not a parallel set', () => {
      // The old spelling must not become a way around a check. Both of these
      // are refused for the current name too.
      expect(() => loadConfig({
        PICO_HOST: '0.0.0.0',
        PICO_FOUNDATION_ACCESS_MODE: 'HA-INGRESS',
      })).toThrow('PICO_FOUNDATION_ACCESS_MODE must be one of');
      expect(loadConfig({
        PICO_HOST: '0.0.0.0',
        PICO_LINK_INTAKE_HOST: '0.0.0.0',
        PICO_LINK_INTAKE_PORT: '3101',
        PICO_FOUNDATION_ACCESS_MODE: 'ha-ingress',
      }).linkIntake).toEqual({ host: '0.0.0.0', port: 3101 });
    });
  });

  it('leaves the relay unset when no operator endpoint is configured', () => {
    // ADR 0149. A Home with no relay is the ordinary state until somebody
    // chooses one, and absent has to stay absent rather than becoming a
    // default that points somewhere.
    const config = loadConfig({});
    expect(config.linkRelayBaseUrl).toBeUndefined();
    expect(config.linkRelayAccountId).toBeUndefined();
    expect(config.linkRelayOperator).toBe('unconfigured.relay.invalid');
  });

  it('reads the relay endpoint and account when both are configured', () => {
    const config = loadConfig({
      PICO_LINK_RELAY_OPERATOR: 'relay.example.invalid',
      PICO_LINK_RELAY_BASE_URL: 'https://relay.example.invalid',
      PICO_LINK_RELAY_ACCOUNT_ID: 'a'.repeat(32),
    });
    expect(config.linkRelayOperator).toBe('relay.example.invalid');
    expect(config.linkRelayBaseUrl).toBe('https://relay.example.invalid');
    expect(config.linkRelayAccountId).toBe('a'.repeat(32));
  });

  it('rejects a depot sweep interval that is not a positive integer', () => {
    // ADR 0143 DP8 gives a task interval a floor for a reason; a setting that
    // accepted '0' or 'soon' would put the refusal somewhere further in.
    for (const value of ['0', '-1', '1.5', 'soon', '   ']) {
      expect(() => loadConfig({ PICO_DEPOT_FETCH_INTERVAL_MS: value }))
        .toThrow('PICO_DEPOT_FETCH_INTERVAL_MS must be a positive integer.');
    }
  });

  it('rejects invalid ports', () => {
    for (const port of ['0', '65536', '3100abc', '1.5', '-1', '   ']) {
      expect(() => loadConfig({ PICO_PORT: port })).toThrow('PICO_PORT must be an integer from 1 to 65535.');
      expect(() => loadConfig({
        PICO_LINK_INTAKE_HOST: '127.0.0.1',
        PICO_LINK_INTAKE_PORT: port,
      })).toThrow('PICO_LINK_INTAKE_PORT must be an integer from 1 to 65535.');
    }
  });

  it('requires the restricted Link listener binding as an explicit pair on a distinct port', () => {
    expect(() => loadConfig({ PICO_LINK_INTAKE_HOST: '127.0.0.1' })).toThrow(
      'PICO_LINK_INTAKE_HOST and PICO_LINK_INTAKE_PORT must be provided together.',
    );
    expect(() => loadConfig({ PICO_LINK_INTAKE_PORT: '4101' })).toThrow(
      'PICO_LINK_INTAKE_HOST and PICO_LINK_INTAKE_PORT must be provided together.',
    );
    expect(() => loadConfig({
      PICO_LINK_INTAKE_HOST: '127.0.0.1',
      PICO_LINK_INTAKE_PORT: '3100',
    })).toThrow('PICO_LINK_INTAKE_PORT must differ from PICO_PORT.');
  });

  it('refuses a restricted Link listener beside a directly exposed Foundation listener', () => {
    expect(() => loadConfig({
      PICO_HOST: '0.0.0.0',
      PICO_FOUNDATION_ACCESS_MODE: 'direct-token',
      PICO_FOUNDATION_TOKEN: 'dev-token',
      PICO_LINK_INTAKE_HOST: '0.0.0.0',
      PICO_LINK_INTAKE_PORT: '3101',
    })).toThrow(
      'PICO_LINK_INTAKE_HOST/PICO_LINK_INTAKE_PORT cannot be combined with '
      + 'PICO_FOUNDATION_ACCESS_MODE=direct-token; keep the Foundation listener local.',
    );
  });

  it('rejects blank string settings', () => {
    for (const name of ['PICO_HOST', 'PICO_DATABASE_PATH', 'PICO_BACKUP_DIRECTORY', 'PICO_KEY_STORE_PATH', 'PICO_HOME_HOST_KEY_STORE_PATH', 'PICO_RECOVERY_ANCHOR_PATH', 'PICO_DEPOT_ROOT', 'PICO_SUPPLIER_SCRATCH_ROOT', 'PICO_LINK_RELAY_OPERATOR', 'PICO_DEVICE_ID', 'PICO_WEB_ROOT']) {
      expect(() => loadConfig({ [name]: '   ' })).toThrow(`${name} must be a non-empty string.`);
    }
    expect(() => loadConfig({
      PICO_LINK_INTAKE_HOST: '   ',
      PICO_LINK_INTAKE_PORT: '3101',
    })).toThrow('PICO_LINK_INTAKE_HOST must be a non-empty string when provided.');
  });

  it('rejects a blank foundation token when provided', () => {
    expect(() => loadConfig({ PICO_FOUNDATION_TOKEN: '   ' })).toThrow('PICO_FOUNDATION_TOKEN must be a non-empty string when provided.');
  });

  it('rejects a blank foundation access mode when provided', () => {
    expect(() => loadConfig({ PICO_FOUNDATION_ACCESS_MODE: '   ' })).toThrow('PICO_FOUNDATION_ACCESS_MODE must be a non-empty string when provided.');
  });

  it('rejects invalid WebSocket allowed origins', () => {
    for (const origins of ['ws://dev.example.test', 'https://dev.example.test/path', 'not-a-url']) {
      expect(() => loadConfig({ PICO_WS_ALLOWED_ORIGINS: origins })).toThrow('PICO_WS_ALLOWED_ORIGINS must contain comma-separated http(s) origins.');
    }
  });
});
