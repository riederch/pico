export {
  encodePicoVaultDaemonFrame,
  parsePicoVaultDaemonRequest,
  parsePicoVaultDaemonResponse,
  picoVaultDaemonProtocolVersion,
  picoVaultDaemonRequestFamilies,
  picoVaultDaemonResponseFamily,
  MAX_PICO_VAULT_DAEMON_FRAME_BYTES,
  MAX_PICO_VAULT_DAEMON_PASSPHRASE_CHARS,
  MAX_PICO_VAULT_DAEMON_REQUEST_ID_CHARS,
  MAX_PICO_VAULT_DAEMON_SIGNATURE_INPUT_HEX_CHARS,
  PicoVaultDaemonFrameDecoder,
} from './protocol.js';
export type {
  PicoVaultDaemonErrorResponse,
  PicoVaultDaemonHelloRequest,
  PicoVaultDaemonHelloResult,
  PicoVaultDaemonKeyfileDescriptor,
  PicoVaultDaemonLockRequest,
  PicoVaultDaemonLockResult,
  PicoVaultDaemonOkResponse,
  PicoVaultDaemonRequest,
  PicoVaultDaemonResponse,
  PicoVaultDaemonSignRequest,
  PicoVaultDaemonSignResult,
  PicoVaultDaemonStatusRequest,
  PicoVaultDaemonStatusResult,
  PicoVaultDaemonUnlockRequest,
  PicoVaultDaemonUnlockResult,
} from './protocol.js';
export {
  defaultMonotonicNowMs,
  startPicoVaultDaemon,
  PICO_VAULT_DAEMON_IDLE_LOCK_CEILING_MS,
  PICO_VAULT_DAEMON_MAX_UNLOCK_DURATION_CEILING_MS,
} from './daemon.js';
export type { PicoVaultDaemon, PicoVaultDaemonOptions } from './daemon.js';
export { connectPicoVaultDaemonClient } from './client.js';
export type { PicoVaultDaemonClient } from './client.js';
export { parsePicoVaultCliArguments, runPicoVaultCli } from './cli.js';
export type { PicoVaultCliInvocation } from './cli.js';
