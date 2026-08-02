import type { BrowserWindowConstructorOptions } from 'electron';

/** Exported separately so the security boundary is executable test material. */
export function picoCompanionWindowOptions(
  preloadPath: string,
): BrowserWindowConstructorOptions {
  return {
    width: 560,
    height: 640,
    minWidth: 420,
    minHeight: 520,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#04101C',
    title: 'Pico',
    webPreferences: {
      preload: preloadPath,
      partition: 'pico-companion',
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      devTools: false,
    },
  };
}
