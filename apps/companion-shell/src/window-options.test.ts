import { describe, expect, it } from 'vitest';
import { picoCompanionWindowOptions } from './window-options.js';

describe('companion BrowserWindow boundary', () => {
  it('pins isolation, sandboxing and the absence of Node integration', () => {
    expect(picoCompanionWindowOptions('/safe/preload.cjs').webPreferences).toMatchObject({
      preload: '/safe/preload.cjs',
      partition: 'pico-companion',
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      devTools: false,
    });
  });
});
