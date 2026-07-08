import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('Core config', () => {
  it('loads defaults when environment values are absent', () => {
    const config = loadConfig({});

    expect(config).toEqual({
      host: '0.0.0.0',
      port: 3100,
      databasePath: 'apps/core/data/pico.sqlite',
      deviceId: 'pico-core',
      webRootPath: expect.stringContaining('/apps/web'),
      wsAllowedOrigins: [],
    });
  });

  it('loads explicit environment values', () => {
    const config = loadConfig({
      PICO_HOST: '127.0.0.1',
      PICO_PORT: '4100',
      PICO_DATABASE_PATH: '/tmp/pico.sqlite',
      PICO_DEVICE_ID: 'test-core',
      PICO_WEB_ROOT: '/tmp/pico-web',
      PICO_WS_ALLOWED_ORIGINS: 'https://dev.example.test, http://localhost:5173/',
    });

    expect(config).toEqual({
      host: '127.0.0.1',
      port: 4100,
      databasePath: '/tmp/pico.sqlite',
      deviceId: 'test-core',
      webRootPath: '/tmp/pico-web',
      wsAllowedOrigins: ['https://dev.example.test', 'http://localhost:5173'],
    });
  });

  it('rejects invalid ports', () => {
    for (const port of ['0', '65536', '3100abc', '1.5', '-1', '   ']) {
      expect(() => loadConfig({ PICO_PORT: port })).toThrow('PICO_PORT must be an integer from 1 to 65535.');
    }
  });

  it('rejects blank string settings', () => {
    for (const name of ['PICO_HOST', 'PICO_DATABASE_PATH', 'PICO_DEVICE_ID', 'PICO_WEB_ROOT']) {
      expect(() => loadConfig({ [name]: '   ' })).toThrow(`${name} must be a non-empty string.`);
    }
  });

  it('rejects invalid WebSocket allowed origins', () => {
    for (const origins of ['ws://dev.example.test', 'https://dev.example.test/path', 'not-a-url']) {
      expect(() => loadConfig({ PICO_WS_ALLOWED_ORIGINS: origins })).toThrow('PICO_WS_ALLOWED_ORIGINS must contain comma-separated http(s) origins.');
    }
  });
});
