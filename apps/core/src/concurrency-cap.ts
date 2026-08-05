/**
 * Global in-flight and connection caps for the reachable HTTP surfaces
 * (ADR 0119 Q4).
 *
 * The quota bounds how much one relationship may send. This bounds how much may
 * be happening at once regardless of who is asking, so aggregate concurrency
 * stays finite even when every individual request is well-formed and every
 * quota is respected.
 *
 * The two surfaces get **separate** budgets, which is the point rather than a
 * detail. The Link intake forwards into the same Fastify application as the
 * Foundation API, so a single shared counter would let a stranger on the
 * published intake port exhaust the in-flight budget the person's own device
 * depends on - publishing the intake would silently degrade the local UI. With
 * two counters, an intake flood is contained to the intake.
 */

/**
 * Sized to be far above any real client and far below what a socket flood
 * wants. Both are deployment properties; these are the conservative defaults.
 */
export const defaultPicoFoundationMaxConnections = 256;
export const defaultPicoFoundationMaxInFlight = 128;
export const defaultPicoLinkIntakeMaxConnections = 64;
export const defaultPicoLinkIntakeMaxInFlight = 32;

/**
 * Marks a request as having arrived through the Link intake listener, so the
 * Foundation counter can decline to count it a second time. A symbol rather
 * than a header: a header would be forgeable by the caller, and the caller must
 * not get to choose which budget they spend.
 */
export const picoLinkIntakeRequestMark = Symbol.for('pico.link.intake.request');

export class PicoConcurrencyCap {
  private inFlight = 0;

  private rejected = 0;

  public constructor(private readonly maxInFlight: number) {
    if (!Number.isInteger(maxInFlight) || maxInFlight <= 0) {
      throw new Error('invalid_pico_concurrency_cap');
    }
  }

  /** True when the request may proceed; the caller must then call `release`. */
  public acquire(): boolean {
    if (this.inFlight >= this.maxInFlight) {
      this.rejected += 1;
      return false;
    }
    this.inFlight += 1;
    return true;
  }

  public release(): void {
    // Clamped rather than allowed to go negative: a double release would
    // otherwise mint permanent capacity and quietly disable the cap.
    if (this.inFlight > 0) {
      this.inFlight -= 1;
    }
  }

  public inFlightCount(): number {
    return this.inFlight;
  }

  public rejectedCount(): number {
    return this.rejected;
  }
}
