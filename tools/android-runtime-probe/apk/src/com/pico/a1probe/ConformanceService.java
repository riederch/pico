package com.pico.a1probe;

/**
 * ADR 0131 A1. The conformance probe, in its own process.
 *
 * Its own, because nodejs-mobile hosts one Node instance per process and this
 * must be able to run while a ceremony is in flight - the point of it is to
 * answer "what does *this* runtime provide" without disturbing anything.
 */
public final class ConformanceService extends ProbeService {
  @Override protected String script() { return "stage/conformance.mjs"; }
  @Override protected String log() { return "conformance.log"; }
}
