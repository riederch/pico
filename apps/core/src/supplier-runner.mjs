/**
 * ADR 0136 BR2 with ADR 0143 DP3 - the child side of the supplier boundary.
 *
 * **Pico ships this file, not the depot.** DP3 says a depot names an entry
 * point and Pico supplies the runtime; this is what "supplies the runtime"
 * means in practice - Pico starts the process, Pico owns the loop, and the
 * depot contributes a module that answers questions.
 *
 * That split is why a bridge never imports anything of Pico's. The contract is
 * the **wire form** - length-prefixed UTF-8 JSON with a versioned family label,
 * ADR 0097's shape - and a third party reproduces it from the specification
 * rather than by linking against a package. Which is the whole reason ADR 0134
 * calls the supplier protocol the first identity this tree keeps: an identity
 * you can only hold if it is written down rather than imported.
 *
 * A supplier module therefore exports one function and touches no socket:
 *
 * ```js
 * export default async function handle(request) { return { ... }; }
 * ```
 *
 * It cannot start anything, because nothing here calls it unless a frame
 * arrived, and there is no inbound family (`supplier-transport.ts`). If it
 * throws, the error becomes a refusal on the wire and the process stays up:
 * a supplier that crashed the boundary on a bad answer would make one bad
 * answer indistinguishable from a compromised process.
 */
const FRAME_LENGTH_PREFIX_BYTES = 4;
const MAX_FRAME_BYTES = 128 * 1024;
const RESPONSE_FAMILY = 'pico.supplier.response.v1';

const entryPoint = process.argv[2];
if (typeof entryPoint !== 'string' || entryPoint === '') {
  process.stderr.write('pico_supplier_runner_needs_an_entry_point\n');
  process.exit(2);
}

let handle;
try {
  const module = await import(entryPoint);
  handle = typeof module.default === 'function' ? module.default : undefined;
} catch (error) {
  process.stderr.write(`pico_supplier_entry_point_unloadable: ${error.message}\n`);
  process.exit(2);
}
if (handle === undefined) {
  // Named rather than silently answering nothing: a module that exports no
  // handler is a supplier that would report `unreachable` forever, and the
  // author would have no way to tell that from a broken socket.
  process.stderr.write('pico_supplier_entry_point_exports_no_handler\n');
  process.exit(2);
}

function writeFrame(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  if (body.byteLength > MAX_FRAME_BYTES) {
    // The supplier answered with more than one answer's worth. Refused here
    // rather than sent, because the parent would only be able to drop the
    // connection and would not know why.
    const refusal = Buffer.from(JSON.stringify({
      family: RESPONSE_FAMILY,
      requestId: payload.requestId,
      ok: false,
      reason: 'pico_supplier_response_too_large',
    }), 'utf8');
    const frame = Buffer.allocUnsafe(FRAME_LENGTH_PREFIX_BYTES + refusal.byteLength);
    frame.writeUInt32BE(refusal.byteLength, 0);
    refusal.copy(frame, FRAME_LENGTH_PREFIX_BYTES);
    process.stdout.write(frame);
    return;
  }
  const frame = Buffer.allocUnsafe(FRAME_LENGTH_PREFIX_BYTES + body.byteLength);
  frame.writeUInt32BE(body.byteLength, 0);
  body.copy(frame, FRAME_LENGTH_PREFIX_BYTES);
  process.stdout.write(frame);
}

let buffered = Buffer.alloc(0);

async function consume(chunk) {
  buffered = buffered.byteLength === 0 ? chunk : Buffer.concat([buffered, chunk]);
  for (;;) {
    if (buffered.byteLength < FRAME_LENGTH_PREFIX_BYTES) {
      return;
    }
    const bodyLength = buffered.readUInt32BE(0);
    if (bodyLength === 0 || bodyLength > MAX_FRAME_BYTES) {
      // Checked before any body bytes are buffered, so an oversized
      // declaration fails instead of allocating.
      process.stderr.write('pico_supplier_frame_too_large\n');
      process.exit(2);
    }
    if (buffered.byteLength < FRAME_LENGTH_PREFIX_BYTES + bodyLength) {
      return;
    }
    const body = buffered.subarray(FRAME_LENGTH_PREFIX_BYTES, FRAME_LENGTH_PREFIX_BYTES + bodyLength);
    buffered = Buffer.from(buffered.subarray(FRAME_LENGTH_PREFIX_BYTES + bodyLength));

    let request;
    try {
      request = JSON.parse(body.toString('utf8'));
    } catch {
      writeFrame({ family: RESPONSE_FAMILY, requestId: null, ok: false, reason: 'invalid_frame' });
      continue;
    }
    try {
      const result = await handle(request);
      writeFrame({
        family: RESPONSE_FAMILY,
        requestId: request.requestId ?? null,
        ok: true,
        result,
      });
    } catch (error) {
      // A refusal on the wire, and the process stays up. A supplier that took
      // the boundary down on a bad answer would make one bad answer look
      // exactly like a compromised process.
      writeFrame({
        family: RESPONSE_FAMILY,
        requestId: request.requestId ?? null,
        ok: false,
        reason: error instanceof Error ? error.message : 'supplier_failed',
      });
    }
  }
}

// Raw `data` rather than a line reader: frames are length-prefixed binary, and
// splitting on newlines would cut a frame whose JSON contains one.
process.stdin.on('data', (chunk) => {
  void consume(chunk);
});
process.stdin.on('end', () => {
  process.exit(0);
});
