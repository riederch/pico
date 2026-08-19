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
import { existsSync, mkdirSync, realpathSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  acceptPicoCompanionEnrolment,
  offerPicoCompanionEnrolment,
} from '@pico/companion/enrolment';
import { runPicoCompanionAskingDeviceExchange } from '@pico/companion/enrolment-steps';

const stage = dirname(fileURLToPath(import.meta.url));
const files = dirname(stage);
const requireFromVault = createRequire(
  realpathSync(join(stage, 'node_modules/@pico/vault/package.json')),
);
const sodium = (await import(requireFromVault.resolve('libsodium-wrappers-sumo'))).default;
await sodium.ready;

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

const send = (message) => {
  if (speak !== null) {
    speak.write(`${JSON.stringify(message)}\n`);
  }
};

const ask = async (kind, step, extra = {}) => await new Promise((resolve) => {
  pendingAnswer = resolve;
  send({ v: 'ask', kind, step, ...extra });
});

const surface = {
  showCode: async (step, code) => {
    send({ v: 'show', step, code });
  },
  readCode: async (step, showing) => await ask('code', step, {
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
        answer(String(parsed.text ?? ''));
      }
      if (parsed.v === 'begin') {
        void walkTheJoin();
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
      accept: async (grantCode, madeOffer) => await acceptPicoCompanionEnrolment({
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
      }),
      outcome: 'joined',
    });
    send({ v: 'done', step: 'joined' });
  } catch (error) {
    send({ v: 'failed', reason: error instanceof Error ? error.message : String(error) });
  }
}
