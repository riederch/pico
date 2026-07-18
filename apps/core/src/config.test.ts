import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('Core config', () => {
  it('loads defaults when environment values are absent', () => {
    const config = loadConfig({});

    expect(config).toEqual({
      host: '127.0.0.1',
      port: 3100,
      databasePath: 'apps/core/data/pico.sqlite',
      backupDirectory: 'apps/core/data/backups',
      keyStorePath: 'apps/core/data/keys',
      homeHostKeyStorePath: 'apps/core/data/home-host-keys',
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
      PICO_DATABASE_PATH: '/tmp/pico.sqlite',
      PICO_BACKUP_DIRECTORY: '/tmp/pico-backups',
      PICO_KEY_STORE_PATH: '/tmp/pico-keys',
      PICO_HOME_HOST_KEY_STORE_PATH: '/tmp/pico-home-host-keys',
      PICO_MEMORY_ENCRYPTION: 'true',
      PICO_DEVICE_ID: 'test-core',
      PICO_WEB_ROOT: '/tmp/pico-web',
      PICO_WS_ALLOWED_ORIGINS: 'https://dev.example.test, http://localhost:5173/',
      PICO_FOUNDATION_TOKEN: 'dev-token',
      PICO_FOUNDATION_ACCESS_MODE: 'direct-token',
    });

    expect(config).toEqual({
      host: '127.0.0.1',
      port: 4100,
      databasePath: '/tmp/pico.sqlite',
      backupDirectory: '/tmp/pico-backups',
      keyStorePath: '/tmp/pico-keys',
      homeHostKeyStorePath: '/tmp/pico-home-host-keys',
      memoryEncryption: true,
      deviceId: 'test-core',
      webRootPath: '/tmp/pico-web',
      wsAllowedOrigins: ['https://dev.example.test', 'http://localhost:5173'],
      foundationToken: 'dev-token',
      foundationAccessMode: 'direct-token',
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

  it('rejects invalid foundation access modes', () => {
    expect(() => loadConfig({ PICO_FOUNDATION_ACCESS_MODE: 'public' })).toThrow(
      'PICO_FOUNDATION_ACCESS_MODE must be one of: loopback-dev, direct-token, ha-ingress, unsafe-trusted-local.',
    );
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

  it('accepts explicit ha-ingress and unsafe trusted-local modes for non-loopback hosts', () => {
    expect(loadConfig({
      PICO_HOST: '0.0.0.0',
      PICO_FOUNDATION_ACCESS_MODE: 'ha-ingress',
    }).foundationAccessMode).toBe('ha-ingress');

    expect(loadConfig({
      PICO_HOST: '0.0.0.0',
      PICO_FOUNDATION_ACCESS_MODE: 'unsafe-trusted-local',
    }).foundationAccessMode).toBe('unsafe-trusted-local');
  });

  it('rejects invalid ports', () => {
    for (const port of ['0', '65536', '3100abc', '1.5', '-1', '   ']) {
      expect(() => loadConfig({ PICO_PORT: port })).toThrow('PICO_PORT must be an integer from 1 to 65535.');
    }
  });

  it('rejects blank string settings', () => {
    for (const name of ['PICO_HOST', 'PICO_DATABASE_PATH', 'PICO_BACKUP_DIRECTORY', 'PICO_KEY_STORE_PATH', 'PICO_HOME_HOST_KEY_STORE_PATH', 'PICO_DEVICE_ID', 'PICO_WEB_ROOT']) {
      expect(() => loadConfig({ [name]: '   ' })).toThrow(`${name} must be a non-empty string.`);
    }
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
