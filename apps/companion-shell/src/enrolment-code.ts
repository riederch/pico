import QRCode from 'qrcode';
import type { PicoCompanionDeviceCode } from './contract.js';

/**
 * ADR 0130 E3. A code this device holds up for another one to read.
 *
 * **In the main process, and lazily.** The encoder is a dependency the tray
 * has no use for, and ADR 0113 C3's budget is what a barrel import broke
 * once; it is imported where a code is actually being shown. The page gets
 * the matrix rather than the encoder, which also keeps one implementation of
 * the thing a camera has to agree with.
 *
 * Error correction M, the level this tree already prints a Recovery Card at.
 * The grant is the largest of the three at about 1,080 characters, which is a
 * version-27 code - `packages/protocol/src/device-enrolment.ts` carries that
 * measurement and the format that made it fit.
 */
export function picoCompanionDeviceCode(text: string): PicoCompanionDeviceCode {
  const code = QRCode.create([{ data: Buffer.from(text, 'utf8'), mode: 'byte' }], {
    errorCorrectionLevel: 'M',
  });
  return {
    text,
    qr: {
      size: code.modules.size,
      modules: Array.from(code.modules.data, (module) => module === 1),
    },
  };
}
