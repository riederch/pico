export interface CoreConfig {
  host: string;
  port: number;
  databasePath: string;
  deviceId: string;
}

export function loadConfig(): CoreConfig {
  return {
    host: process.env.PICO_HOST ?? '0.0.0.0',
    port: Number.parseInt(process.env.PICO_PORT ?? '3100', 10),
    databasePath: process.env.PICO_DATABASE_PATH ?? 'apps/core/data/pico.sqlite',
    deviceId: process.env.PICO_DEVICE_ID ?? 'pico-core',
  };
}
