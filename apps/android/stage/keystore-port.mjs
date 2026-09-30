/**
 * ADR 0131 A3. Die Node-Seite des Plattform-Keystores.
 *
 * `PicoCompanionAndroidSecretPort` sagt, was der Kern erwartet; hier steht,
 * wie diese Erwartung auf diesem Gerät bedient wird. Der Kern urteilt nicht
 * über die Zertifikatskette - er kann es nicht -, sondern über den Belegsatz,
 * den `KeystorePort.java` schickt, und darüber, ob dessen Quellen einander
 * widersprechen.
 *
 * Die drei Methoden sind asynchron, weil sie es sind: hinter jeder liegt eine
 * Prozessgrenze und der Android-Keystore dahinter. Auf dem Desktop antwortet
 * `safeStorage` im selben Aufruf, hier nicht, und eine Signatur, die das
 * verschweigt, verschiebt das Problem nur nach hinten.
 */
import { existsSync } from 'node:fs';
import { connect } from 'node:net';

/**
 * Eine Verbindung, eine Frage nach der anderen.
 *
 * Der Keystore hat einen Zustand, die Antworten kommen als Zeilen zurück, und
 * zwei gleichzeitig offene Fragen hätten keine Möglichkeit, ihre Antworten
 * auseinanderzuhalten - das Protokoll trägt keine Kennung, weil es sie bei
 * genau einem Frager nicht braucht.
 */
export async function connectPicoAndroidKeystorePort(socketPath, options = {}) {
  const waitMs = options.waitMs ?? 5_000;
  const startedAt = options.now?.() ?? Date.now();
  while (!existsSync(socketPath)) {
    if ((options.now?.() ?? Date.now()) - startedAt > waitMs) {
      throw new Error('android_keystore_port_absent');
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const socket = await new Promise((resolve, reject) => {
    const attempt = connect(socketPath);
    attempt.once('connect', () => resolve(attempt));
    attempt.once('error', reject);
  });
  socket.setEncoding('utf8');

  let buffered = '';
  let waiting = null;
  socket.on('data', (chunk) => {
    buffered += chunk;
    let newline = buffered.indexOf('\n');
    while (newline >= 0) {
      const line = buffered.slice(0, newline);
      buffered = buffered.slice(newline + 1);
      newline = buffered.indexOf('\n');
      const answer = waiting;
      waiting = null;
      answer?.(line);
    }
  });

  let queue = Promise.resolve();
  const ask = async (request) => {
    const run = queue.then(async () => await new Promise((resolve, reject) => {
      waiting = (line) => {
        let parsed;
        try {
          parsed = JSON.parse(line);
        } catch (notJson) {
          reject(new Error('android_keystore_port_unreadable'));
          return;
        }
        // Die Ablehnung trägt den Klassennamen aus Java, und der ist die
        // eigentliche Auskunft: `UserNotAuthenticatedException` heißt "das
        // Gerät ist gesperrt", `KeyPermanentlyInvalidatedException` heißt
        // "die Bildschirmsperre wurde neu gesetzt und der Schlüssel ist
        // fort". Beides als "ging nicht" zu melden wäre die unbrauchbare
        // Hälfte der Wahrheit.
        if (parsed.ok !== true) {
          reject(new Error(`android_keystore_refused:${parsed.refusal ?? 'unnamed'}`));
          return;
        }
        resolve(parsed);
      };
      socket.write(`${JSON.stringify(request)}\n`, (failed) => {
        if (failed) {
          reject(failed);
        }
      });
    }));
    queue = run.then(() => undefined, () => undefined);
    return await run;
  };

  return {
    platform: 'android',
    keystoreEvidence: async () => (await ask({ v: 'evidence' })).evidence,
    encryptString: async (text) => {
      const { sealedBase64 } = await ask({ v: 'seal', text });
      return new Uint8Array(Buffer.from(sealedBase64, 'base64'));
    },
    decryptString: async (sealed) => (await ask({
      v: 'open',
      sealedBase64: Buffer.from(sealed).toString('base64'),
    })).text,
    close: () => { socket.end(); },
  };
}
