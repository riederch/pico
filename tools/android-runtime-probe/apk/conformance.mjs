/**
 * ADR 0131 A1. What the shell-free core needs, asked of the runtime that
 * will actually host it.
 *
 * A1 was called implemented on the strength of 937 fixture tests passing on
 * the phone - under Termux's Node, which has full ICU, a real `process`, and
 * every module a desktop has. The product runs under nodejs-mobile, which
 * has none of that, and the difference cost a day: `TextDecoder` with
 * `fatal: true` throws `ERR_NO_ICU` there, so every enrolment code and every
 * Recovery Card was refused as malformed by a runtime that could not read
 * any of them.
 *
 * This is the check that would have said so in a second. It runs *in* the
 * embedded runtime and exercises the paths a client cannot do without: the
 * canonical transport in both directions, a real enrolment code round trip,
 * a Recovery Card transport, the vault's key derivation, and the platform
 * facilities the core reaches for. Each line is a fact about this runtime,
 * not about a suite.
 *
 * It is a probe rather than a gate for the reason A4's is: it needs hardware
 * this repository cannot assume. What it produces is evidence to record.
 */
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const stage = dirname(fileURLToPath(import.meta.url));
const requireFromVault = createRequire(
  realpathSync(join(stage, 'node_modules/@pico/vault/package.json')),
);

const results = [];
const check = async (name, run) => {
  try {
    const detail = await run();
    results.push({ check: name, ok: true, ...(detail === undefined ? {} : { detail })});
  } catch (error) {
    results.push({
      check: name,
      ok: false,
      because: error instanceof Error ? `${error.message}` : String(error),
    });
  }
};

const same = (left, right, what) => {
  if (left !== right) {
    throw new Error(`${what}: ${String(left)} !== ${String(right)}`);
  }
};

await check('runtime', async () => ({
  node: process.version,
  intl: typeof Intl !== 'undefined' && typeof Intl.Collator === 'function',
  fetch: typeof fetch === 'function',
  webcrypto: typeof globalThis.crypto?.getRandomValues === 'function',
}));

await check('text encoding', () => {
  const text = 'a Home, and a Pico — ünïcode';
  const bytes = new TextEncoder().encode(text);
  same(new TextDecoder().decode(bytes), text, 'round trip');
});

await check('canonical transport', async () => {
  const transport = await import(new URL(
    './node_modules/@pico/protocol/dist/canonical-transport.js', import.meta.url).href);
  const bytes = new TextEncoder().encode('canonical');
  same(transport.decodeCanonicalText(bytes, 'refused'), 'canonical', 'text element');
  let refused = false;
  try {
    transport.decodeCanonicalText(new Uint8Array([0xff, 0xfe]), 'refused');
  } catch {
    refused = true;
  }
  if (!refused) {
    throw new Error('invalid utf-8 was accepted');
  }
  const encoded = transport.encodeCanonicalElements([bytes, new Uint8Array([1, 2, 3])]);
  const elements = transport.decodeCanonicalElements(encoded, 2, 'refused');
  same(elements.length, 2, 'element count');
  same(transport.encodeBase64Url(transport.decodeBase64Url(
    transport.encodeBase64Url(encoded), 'refused')), transport.encodeBase64Url(encoded),
    'base64url round trip');
});

await check('enrolment code round trip', async () => {
  const enrolment = await import('@pico/protocol/device-enrolment');
  const device = {
    signingPublicKeyHex: 'ab'.repeat(32),
    signingKeyFingerprintHex: 'cd'.repeat(32),
    keyAgreementPublicKeyHex: 'ef'.repeat(32),
    keyAgreementKeyFingerprintHex: '12'.repeat(32),
  };
  const offer = enrolment.buildPicoDeviceEnrolmentOffer(device);
  const parsed = enrolment.parsePicoDeviceEnrolmentOffer(offer);
  same(parsed.device.signingKeyFingerprintHex, device.signingKeyFingerprintHex, 'offer');
  return { offerChars: offer.length };
});

await check('recovery card transport', async () => {
  /**
   * The transport layer, not a whole card: a card's payload is its own
   * canonical element list with fields this probe has no business forging.
   * What matters here is that the prefix and the base64url body survive on
   * this runtime - the layer that swallowed a day when `TextDecoder` could
   * not read a text element.
   */
  const protocol = await import('@pico/protocol');
  const transport = await import(new URL(
    './node_modules/@pico/protocol/dist/canonical-transport.js', import.meta.url).href);
  const payload = transport.encodeCanonicalElements([
    new TextEncoder().encode('a card element'),
  ]);
  const built = protocol.buildPicoRecoveryCardScanTransport(payload);
  if (!built.startsWith(protocol.picoRecoveryCardScanPrefix)) {
    throw new Error('the built transport does not carry the prefix');
  }
  let reason = 'accepted';
  try {
    protocol.parsePicoRecoveryCardScanTransport(built);
  } catch (refused) {
    reason = refused instanceof Error ? refused.message : String(refused);
  }
  /**
   * A card this probe made up must be refused - but for its *contents*.
   * A refusal about the prefix, the charset or the length would mean the
   * transport itself is unreadable here, which is the failure worth
   * catching.
   */
  for (const transportLevel of ['prefix', 'charset', 'scan_length']) {
    if (reason.includes(transportLevel)) {
      throw new Error(`refused at the transport layer: ${reason}`);
    }
  }
  return { chars: built.length, refusedWith: reason };
});

await check('libsodium', async () => {
  const sodium = (await import(requireFromVault.resolve('libsodium-wrappers-sumo'))).default;
  await sodium.ready;
  const pair = sodium.crypto_sign_keypair();
  const message = new TextEncoder().encode('signed by a phone');
  const signature = sodium.crypto_sign_detached(message, pair.privateKey);
  if (!sodium.crypto_sign_verify_detached(signature, message, pair.publicKey)) {
    throw new Error('a signature this runtime made does not verify');
  }
});

await check('argon2id at the vault profile', async () => {
  const { createPicoVaultKeyfile } = await import('@pico/vault');
  const sodium = (await import(requireFromVault.resolve('libsodium-wrappers-sumo'))).default;
  await sodium.ready;
  const started = Date.now();
  createPicoVaultKeyfile(sodium, { keyRole: 'device_signing', passphrase: 'a-probe-passphrase' });
  return { ms: Date.now() - started };
});

await check('unix sockets', async () => {
  const net = await import('node:net');
  const path = join(dirname(stage), 'conformance.sock');
  await new Promise((resolve, reject) => {
    const server = net.createServer((connection) => {
      connection.end('ok');
    });
    server.on('error', reject);
    server.listen(path, () => {
      const client = net.connect(path, () => {
        client.on('data', () => {
          client.end();
          server.close(() => resolve());
        });
      });
      client.on('error', reject);
    });
  });
});

await check('stated conditions', async () => {
  /**
   * ADR 0131 A7 - the words a phone would speak, produced by the core on the
   * runtime the phone actually has.
   *
   * A7 says the client must name an unreachable Home rather than present it
   * as a quiet one, and that the condition and its wording live in the
   * shell-free core so a second client inherits them. Until 2026-08-21 that
   * was half true: the rule and its sentences were in the Electron shell's
   * contract and the short labels were in the *window*. An Android surface
   * would have written both again.
   *
   * This asks the moved rule for the two cases that decide whether it is
   * worth anything, on the embedded runtime and not on a desktop.
   */
  const conditions = await import('@pico/companion/conditions');

  const awayFromHome = conditions.picoCompanionConditionsFor({
    online: true,
    homeReachable: false,
  });
  if (awayFromHome.length !== 1 || awayFromHome[0].kind !== 'home_unreachable') {
    throw new Error(`a Home that does not answer produced ${JSON.stringify(awayFromHome)}`);
  }
  if (!awayFromHome[0].label || awayFromHome[0].remedy.length < 20) {
    throw new Error('the condition arrived without words');
  }

  /**
   * And the half that keeps it honest: with the link itself down, this must
   * stay silent, because a refusal must not be an inventory (ADR 0077 C4).
   * Telling somebody their Home is unreachable *and* that they have no
   * network is one fact said twice.
   */
  const linkDown = conditions.picoCompanionConditionsFor({
    online: false,
    homeReachable: false,
  });
  if (linkDown.length !== 1 || linkDown[0].kind !== 'no_network') {
    throw new Error(`a dead link produced ${JSON.stringify(linkDown)}`);
  }

  return {
    label: awayFromHome[0].label,
    remedyChars: awayFromHome[0].remedy.length,
    silentWhenLinkIsDown: true,
  };
});

process.stdout.write(`${results.map((line) => JSON.stringify(line)).join('\n')}\n`);
process.stdout.write(`CONFORMANCE ${results.every((line) => line.ok) ? 'OK' : 'FAILED'}\n`);
