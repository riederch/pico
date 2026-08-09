import type {
  PicoLocationFix,
  PicoMobilitySample,
} from '@pico/protocol/spatial-recall';

/**
 * ADR 0129 SR5. Where readings come from, and the one way they may arrive.
 *
 * **No operating-system location API is reachable from the derivation.** That
 * is the load-bearing sentence, and it is checked rather than reviewed:
 * `offline-floor.json` forbids the sensor packages to the `spatial_recall`
 * family specifically, and `scripts/check-offline-floor.mjs` walks the import
 * closure to prove it. Forbidding them everywhere would be wrong - a mobile
 * runtime that captures location has to call one - so the ban is scoped to the
 * code whose whole claim is that it is pure functions over readings somebody
 * hands it.
 *
 * That is the requirement issue #3 states in its own words: the domain logic
 * must not depend on a particular operating-system API. A rule about what
 * parking means should outlive three generations of location plumbing, and it
 * only can if it never learned the plumbing's name.
 *
 * **Unimplemented, deliberately.** Whoever fills this is a mobile runtime that
 * does not exist, and an adapter that cannot be run against a real device
 * would be code nobody can verify. Declaring it now is what keeps the rules
 * above it independent of the API underneath - the same cut ADR 0128 H4 made
 * for the Home Assistant transport.
 */
export interface PicoSpatialCapturePorts {
  /**
   * Readings taken since an instant, oldest first, already parsed.
   *
   * Parsed rather than raw: whoever implements this crosses from the operating
   * system into Pico, and that crossing is where a reading either becomes a
   * usable position - three values, accuracy included - or is refused. A port
   * returning raw sensor output would move that decision into the derivation
   * and leave the adapter free to hand it anything.
   */
  readLocationFixes(sinceIso: string): Promise<readonly PicoLocationFix[]>;

  /**
   * How the person was moving, as the device classified it.
   *
   * Separate from the fixes because a device may have one without the other:
   * an activity classifier can report walking with no position at all, and a
   * port that bundled them would make the poorer signal unavailable whenever
   * the richer one was missing.
   */
  readMobilitySamples(sinceIso: string): Promise<readonly PicoMobilitySample[]>;
}

/**
 * ADR 0129 SR6 will decide what switching capture off means and how the
 * history is erased. This port deliberately has no `start`, `stop` or
 * `setEnabled`: whether Pico may record where a person goes is a durable
 * decision about their life, not a method on a sensor adapter, and putting it
 * here would put consent in the layer least able to enforce it.
 */
