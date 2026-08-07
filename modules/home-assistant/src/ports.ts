import type { PicoHomeAssistantEntityState } from '@pico/protocol/home-assistant';

/**
 * ADR 0128 H4. What this module needs from a runtime, and does not have.
 *
 * The port is declared and unimplemented, deliberately. ADR 0128 H4 keeps a
 * Supervisor client out of `apps/core` and H3 keeps every direct route out of
 * the process away from a module, so whoever implements this is a capability
 * package - and one that cannot be run against a real Home Assistant would be
 * code nobody can verify.
 *
 * Declaring it now is not ceremony: it is what keeps the rules above it
 * independent of the API underneath, which is the same cut ADR 0129 made for
 * sensors and the reason that module was buildable years before a phone.
 */
export interface PicoHomeAssistantPorts {
  /**
   * Every entity the Home is allowed to see, already parsed.
   *
   * Parsed rather than raw: whoever implements this crosses the threshold, and
   * the threshold is where unbounded foreign text stops. A port returning raw
   * JSON would move the parse into the module and leave the transport free to
   * hand it anything.
   */
  readEntityStates(): Promise<readonly PicoHomeAssistantEntityState[]>;
}
