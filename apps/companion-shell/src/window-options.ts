import type { BrowserWindowConstructorOptions } from 'electron';
import { picoTokens } from './pico-design-tokens.generated.js';

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
    // Matches the renderer body background so the first paint carries no flash
    // of a different color; read from the generated tokens instead of copied.
    backgroundColor: picoTokens.color.background.deep,
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
