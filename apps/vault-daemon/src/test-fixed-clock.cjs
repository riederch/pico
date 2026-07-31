'use strict';

const RealDate = Date;
const fixedNowMs = Number(process.env.PICO_TEST_NOW_MS);

if (!Number.isFinite(fixedNowMs)) {
  throw new Error('invalid_test_fixed_clock');
}

class FixedDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) {
      super(fixedNowMs);
      return;
    }
    super(...args);
  }

  static now() {
    return fixedNowMs;
  }
}

globalThis.Date = FixedDate;
