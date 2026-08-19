/**
 * ADR 0131 A5, first vertical: this phone asks an existing Home to let it in.
 *
 * The ceremony is not here. `runPicoCompanionAskingDeviceExchange` is the
 * shell-free core's, and this file is what ADR 0113 calls a shell: it owns
 * three verbs - put a code in front of a person, take one back, say where in
 * the walk they are - and nothing else. That split is the whole reason this
 * file is short.
 *
 * The surface is an Android Activity in the same process, reached over an
 * AF_UNIX socket in the app's private directory. Not a localhost TCP port:
 * on Android every app can reach 127.0.0.1, so a port would offer this
 * ceremony to every other app on the phone. The socket lives where only this
 * app's UID can open it, which is the same argument the custody socket makes
 * one process over.
 */
import { existsSync, mkdirSync, readFileSync, realpathSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  acceptPicoCompanionEnrolment,
  offerPicoCompanionEnrolment,
} from '@pico/companion/enrolment';
import {
  picoCompanionEnrolmentReadPrefix,
  runPicoCompanionAskingDeviceExchange,
} from '@pico/companion/enrolment-steps';

const stage = dirname(fileURLToPath(import.meta.url));
const files = dirname(stage);
const requireFromVault = createRequire(
  realpathSync(join(stage, 'node_modules/@pico/vault/package.json')),
);
const sodium = (await import(requireFromVault.resolve('libsodium-wrappers-sumo'))).default;
await sodium.ready;

/**
 * A runtime self-test, run before anything else, because the answer decides
 * whether the shell-free core can be trusted on this runtime at all.
 *
 * `decodeCanonicalElements` hands `TextDecoder` a **subarray** - a view into
 * a larger buffer - and the canonical decoder reads it with `fatal: true`.
 * If a runtime decodes the whole underlying buffer instead of the view, the
 * bytes after the element turn into invalid sequences and a perfectly good
 * code is refused as malformed. That is exactly the refusal a grant scanned
 * on this phone produced.
 */
{
  const backing = new Uint8Array(32);
  const text = new TextEncoder().encode('pico');
  backing.set(text, 4);
  const view = backing.subarray(4, 4 + text.length);
  const attempt = (what) => {
    try {
      return { ok: what() };
    } catch (error) {
      return { threw: String(error && (error.code || error.message)) };
    }
  };
  /**
   * Can this runtime's `fetch` reach the Home at all? A Link client that
   * cannot is indistinguishable, from the outside, from a Home that will not
   * answer - and the confirmation loop spent two minutes on exactly that
   * confusion before it learned to say what it heard.
   */
  let reach = 'not tried';
  try {
    const portFile = join(stage, 'lab-port.txt');
    if (existsSync(portFile)) {
      const port = readFileSync(portFile, 'utf8').trim();
      const answer = await fetch(`http://127.0.0.1:${port}/api/home/link`, { method: 'GET' })
        .then((response) => `status ${response.status}`)
        .catch((error) => `threw ${error?.message} (${error?.cause?.code ?? error?.cause ?? 'no cause'})`);
      reach = `${port}: ${answer}`;
    }
  } catch (error) {
    reach = `probe failed: ${error?.message}`;
  }
  process.stdout.write(`${JSON.stringify({
    step: 'runtime_selftest',
    fetchToHome: reach,
    hasFetch: typeof fetch === 'function',
    node: process.version,
    hasIntl: typeof Intl !== 'undefined' && typeof Intl.Collator === 'function',
    fatalOnView: attempt(() => new TextDecoder('utf-8', { fatal: true }).decode(view)),
    fatalOnCopy: attempt(() => new TextDecoder('utf-8', { fatal: true }).decode(view.slice())),
    plainDecoder: attempt(() => new TextDecoder().decode(view)),
    bufferToString: attempt(() => Buffer.from(view).toString('utf8')),
  })}\n`);
}

const socketPath = join(files, 'ui.sock');
if (existsSync(socketPath)) {
  unlinkSync(socketPath);
}
mkdirSync(join(files, 'vault'), { recursive: true });

/**
 * One surface at a time, and the answer belongs to the question that is
 * open. A second connection would be a second person answering, which this
 * ceremony has no meaning for.
 */
let speak = null;
let pendingAnswer = null;
/**
 * Android recreates an Activity whenever it likes - a rotation, a moment of
 * memory pressure, the app coming back to the foreground. The surface says
 * `begin` each time it connects, so `begin` has to mean "I am here, tell me
 * where we are" rather than "start over". It meant the second one once, which
 * asked a person for a passphrase they had already chosen and orphaned the
 * question the walk was actually waiting on.
 */
let walking = false;
let lastQuestion = null;

const send = (message) => {
  if (speak !== null) {
    speak.write(`${JSON.stringify(message)}\n`);
  }
};

const ask = async (kind, step, extra = {}) => await new Promise((resolve) => {
  pendingAnswer = resolve;
  lastQuestion = { v: 'ask', kind, step, ...extra };
  send(lastQuestion);
});

const surface = {
  showCode: async (step, code) => {
    send({ v: 'show', step, code });
  },
  readCode: async (step, showing) => await ask('code', step, {
    // The surface is told which prefix this step expects, so a camera can
    // refuse a code from an earlier step instead of handing it on.
    prefix: picoCompanionEnrolmentReadPrefix(step),
    ...(showing === undefined ? {} : { showing }),
  }),
  announce: async (step) => {
    send({ v: 'say', step });
  },
};

createServer((connection) => {
  if (speak !== null) {
    connection.end();
    return;
  }
  speak = connection;
  let buffered = '';
  connection.on('data', (chunk) => {
    buffered += chunk.toString('utf8');
    let newline = buffered.indexOf('\n');
    while (newline >= 0) {
      const line = buffered.slice(0, newline);
      buffered = buffered.slice(newline + 1);
      newline = buffered.indexOf('\n');
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      if (parsed.v === 'value' && pendingAnswer !== null) {
        const answer = pendingAnswer;
        pendingAnswer = null;
        const value = String(parsed.text ?? '');
        /**
         * Length and both ends, never the middle: enough to tell a code that
         * arrived whole from one that was cut, reordered or re-encoded, and
         * not enough to be a copy of it in a log.
         */
        if (lastQuestion?.kind === 'code') {
          // A checksum as well as the ends: a code can arrive the right
          // length with the right head and tail and still be wrong in the
          // middle, which is the one shape the eye cannot catch.
          let sum = 0;
          for (let index = 0; index < value.length; index += 1) {
            sum = (sum * 31 + value.charCodeAt(index)) >>> 0;
          }
          process.stdout.write(`${JSON.stringify({
            step: 'answered',
            of: lastQuestion.step,
            length: value.length,
            checksum: sum,
            head: value.slice(0, 24),
            tail: value.slice(-12),
          })}\n`);
        }
        answer(value);
      }
      if (parsed.v === 'begin') {
        if (walking) {
          // A surface that came back. Show it the question that is open,
          // rather than a ceremony that never stopped.
          if (lastQuestion !== null) {
            send(lastQuestion);
          }
        } else {
          walking = true;
          void walkTheJoin();
        }
      }
    }
  });
  connection.on('close', () => {
    speak = null;
  });
}).listen(socketPath, () => {
  process.stdout.write(JSON.stringify({ step: 'ui_socket_listening', socketPath }) + '\n');
});

async function walkTheJoin() {
  try {
    const passphrase = await ask('secret', 'passphrase');
    const daemonSocketPath = join(files, 'vault', 'run', 'daemon.sock');

    let offered = null;
    await runPicoCompanionAskingDeviceExchange({
      surface,
      offer: async () => {
        offered = await offerPicoCompanionEnrolment({
          socketPath: daemonSocketPath,
          passphrase,
        });
        return offered;
      },
      accept: async (grantCode, madeOffer) => {
        /**
         * The same checks the parser makes, one at a time, in the runtime
         * that is refusing. The desktop accepts this exact string - same
         * build, same bytes, same checksum - so whatever fails here is a
         * fact about the embedded runtime rather than about the code, and a
         * refusal that names only "body" cannot say which.
         */
        try {
          const { picoDeviceEnrolmentGrantPrefix } =
            await import('@pico/protocol/device-enrolment');
          // The built file directly: these helpers are internal to the
          // protocol and have no public subpath, which is right - a
          // diagnostic is the one caller that may reach past that.
          const { decodeBase64Url, encodeBase64Url, picoBase64UrlPattern } =
            await import(new URL(
              './node_modules/@pico/protocol/dist/canonical-transport.js',
              import.meta.url,
            ).href);
          const body = grantCode.slice(picoDeviceEnrolmentGrantPrefix.length);
          const decoded = decodeBase64Url(body, 'diagnostic');
          const { parsePicoDeviceEnrolmentGrant } =
            await import('@pico/protocol/device-enrolment');
          let where = 'parsed';
          try {
            parsePicoDeviceEnrolmentGrant(grantCode);
          } catch (refused) {
            // The stack, not the message: the message is the same word for
            // three different checks, and which one it is decides whether
            // this is data, code or runtime.
            where = String(refused && refused.stack).split('\n').slice(0, 3).join(' | ');
          }
          process.stdout.write(`${JSON.stringify({
            step: 'grant_checks',
            bodyLength: body.length,
            lengthModFour: body.length % 4,
            charset: picoBase64UrlPattern.test(body),
            decodedBytes: decoded.byteLength,
            reEncodes: encodeBase64Url(decoded) === body,
            where,
          })}\n`);
        } catch (diagnosticFailed) {
          process.stdout.write(`${JSON.stringify({
            step: 'grant_checks_failed',
            reason: String(diagnosticFailed && diagnosticFailed.message),
          })}\n`);
        }
        return await acceptPicoCompanionEnrolment({
        socketPath: daemonSocketPath,
        passphrase,
        grantCode,
        profilePath: join(files, 'profile.json'),
        sodium,
        /**
         * ADR 0099, and the reason this is not a stub. The signature this
         * ceremony raises must be answered by the person on the device that
         * holds the key - so the statement goes on screen and the walk waits
         * for a tap. Answering it in code would keep the ceremony working and
         * remove the only thing it is for.
         */
        decisions: {
          decideApproval: async (approval) => await ask('approval', 'approval', {
            statement: approval.statement,
          }) === 'yes',
        },
        device: madeOffer.device,
        });
      },
      outcome: 'joined',
    });
    send({ v: 'done', step: 'joined' });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    // To the log as well as to the surface: a failure a person sees and a
    // failure anybody can diagnose are not automatically the same event.
    process.stdout.write(`${JSON.stringify({ step: 'failed', reason })}\n`);
    send({ v: 'failed', reason });
  }
}
