/**
 * ADR 0131 A5 - the sponsor a joining phone needs, on this laptop.
 *
 * A phone that asks to be let in needs something to ask: a Home it can reach
 * and a device already in that Home to grant it. This is both, headless -
 * there is no window here, because the desktop's window is not what is being
 * tested. What *is* being tested is that the three codes work when one of the
 * two devices is a phone.
 *
 * Reachability is the part that has to be right rather than convenient. The
 * Foundation API stays on loopback, where it belongs; only the **Link intake**
 * is published (`PICO_LINK_INTAKE_HOST`/`PICO_LINK_INTAKE_PORT`), the route
 * whose access class carries no session and no token because a signature
 * inside the envelope binds sender, audience and arguments together. Putting
 * a token on the Foundation port instead would publish the diagnostics
 * surface, which is the tempting wrong turn the roadmap now warns about.
 *
 * It prints the grant and waits for the acceptance on stdin, so a person can
 * carry codes between two screens the way the ceremony is meant to be walked.
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { networkInterfaces, tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { picoDisplayFingerprint } from '@pico/protocol/fingerprint-display';
import { enrolPicoCompanionDevice } from '@pico/companion/enrolment';
import {
  foundPicoCompanionHome,
  parsePicoHomeSetupAnnouncement,
} from '@pico/companion/founding';
import {
  readPicoCompanionProfile,
  writePicoCompanionProfile,
} from '@pico/companion/profile';
import { createPicoCompanionLinkClient } from '@pico/companion/recovery-controller';
import { openPicoCompanionVaultProductSession } from '@pico/companion/vault-product-session';

/**
 * Run from a staged deploy, the way the phone's side is: this file lives in
 * `tools/`, outside every workspace package, so a bare `@pico/companion`
 * resolves from where it is *copied to* rather than from where it is kept.
 * `run-sponsor-lab.sh` does the copying.
 */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.PICO_LAB_REPO ?? join(here, '..', '..', '..');
const requireFromVault = createRequire(
  realpathSync(join(here, 'node_modules/@pico/vault/package.json')),
);
const sodium = (await import(requireFromVault.resolve('libsodium-wrappers-sumo'))).default;
/** `qrcode` is the vault daemon's dependency - the Recovery Card draws with it. */
const requireFromDaemon = createRequire(
  realpathSync(join(here, 'node_modules/@pico/vault-daemon/package.json')),
);
const CORE = join(repoRoot, 'apps', 'core', 'dist', 'index.js');
const CLI = join(repoRoot, 'apps', 'vault-daemon', 'dist', 'cli.js');
const PASSPHRASE = process.env.PICO_LAB_PASSPHRASE ?? 'a-passphrase-for-the-lab';

/**
 * Was dieses Labor startet, nimmt es auch wieder mit.
 *
 * **Am 2026-08-21 tat es das nicht**, und der Grund war ein fehlender Name:
 * es gab einen Handler für `SIGINT` und keinen für `SIGTERM`. Ein
 * `pkill -f sponsor-lab.mjs` schickt `SIGTERM`, Node beendet sich daraufhin
 * *ohne* die `exit`-Handler zu laufen, und Home und Vault-Daemon liefen
 * weiter. `systemd --user` adoptierte sie, und drei Stunden später lauschte
 * ein Home, von dem niemand mehr wusste, immer noch auf `0.0.0.0` - der
 * Link-Intake bindet im Labor absichtlich auf alle Schnittstellen, damit ein
 * Telefon ihn erreicht, und genau das macht ein vergessenes Labor zu mehr als
 * einer Unordnung.
 *
 * Die Aufräumarbeit liegt hier und nicht in `run-sponsor-lab.sh`, weil das
 * Skript mit `exec` in diesen Prozess übergeht: nach dem `exec` gibt es keine
 * Shell mehr, die ein `trap` ausführen könnte.
 */
/**
 * Die Notiz, an der der nächste Lauf die Reste dieses erkennt.
 *
 * **Ohne Sperre, und das ist eine Entscheidung.** Beenden sich zwei Labore im
 * selben Moment, können ihre Schreibvorgänge einander überholen und eine Zeile
 * stehenlassen, die niemandem mehr gehört. Das heilt sich beim nächsten Start:
 * ein Kind, das nicht mehr läuft, wird übersprungen *und* aus der Notiz
 * genommen. Eine Dateisperre für ein Laborskript wäre mehr Maschinerie als
 * Nutzen - der Schaden eines verlorenen Schreibvorgangs ist eine Zeile zu
 * viel, nicht ein Prozess zu wenig.
 */
const RUNNING = join(tmpdir(), 'pico-sponsor-lab.running');

const children = [];
let stopping = false;
const stop = () => {
  if (stopping) {
    return;
  }
  stopping = true;
  for (const child of children) {
    try {
      child.kill('SIGTERM');
    } catch (alreadyGone) {
      // Ein Kind, das schon tot ist, ist der gewünschte Zustand.
    }
  }
  // Nur die eigenen Zeilen, nicht die Datei: ein zweites Labor darf hier
  // gleichzeitig stehen, und seine Notiz gehört ihm.
  forgetOwnLines();
};
// `SIGTERM` ist der, der gefehlt hat; `SIGHUP` ist das Terminal, das
// weggeht - beides Wege aus diesem Prozess, die vorher niemand aufräumte.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => { stop(); process.exit(0); });
}
process.on('exit', stop);

/**
 * Und die Wege, die kein Handler abfängt.
 *
 * Ein `SIGKILL` auf diesen Prozess lässt sich von innen nicht behandeln -
 * dagegen hilft nur, dass der *nächste* Lauf die Reste des vorigen findet.
 * Deshalb schreibt das Labor die Prozessnummern seiner Kinder auf und liest
 * sie beim Start wieder.
 *
 * Die Nummern allein wären gefährlich, weil das System sie wiederverwendet.
 * Bevor eine beendet wird, muss ihre Kommandozeile noch zu dem passen, was
 * dieses Labor gestartet hätte - sonst trifft es irgendeinen fremden Prozess,
 * der zufällig dieselbe Nummer erbte.
 */
const remember = (child, marker) => {
  children.push(child);
  try {
    // Die eigene Prozessnummer steht mit drin, und das ist der Unterschied
    // zwischen Aufräumen und Sabotage: ohne sie würde ein startendes Labor die
    // Kinder eines **laufenden** beenden, weil es sie für Reste hält.
    appendFileSync(RUNNING, `${process.pid}\t${child.pid}\t${marker}\n`);
  } catch (unwritable) {
    // Ein Labor, das an seiner eigenen Notiz scheitert, soll trotzdem laufen.
  }
};
const notedLines = () => {
  try {
    return readFileSync(RUNNING, 'utf8').split('\n').filter((line) => line !== '');
  } catch (nothingLeftBehind) {
    return [];
  }
};

/** Läuft der Prozess noch, und ist er noch das, was die Notiz behauptet? */
const stillIs = (pid, marker) => {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes(marker);
  } catch (notRunning) {
    return false;
  }
};

const forgetOwnLines = () => {
  const kept = notedLines().filter((line) => line.split('\t')[0] !== String(process.pid));
  try {
    if (kept.length === 0) {
      unlinkSync(RUNNING);
    } else {
      writeFileSync(RUNNING, `${kept.join('\n')}\n`);
    }
  } catch (nothingToRemove) {
    // Auch gut.
  }
};

const sweepPreviousRun = () => {
  const lines = notedLines();
  if (lines.length === 0) {
    return;
  }
  let ended = 0;
  const kept = [];
  for (const line of lines) {
    const [labPid, childPid, marker] = line.split('\t');
    if (marker === undefined || marker === '') {
      continue;
    }
    // **Gehört das noch jemandem?** Lebt das Labor, das dieses Kind gestartet
    // hat, dann ist es kein Rest, sondern fremder Betrieb - und ein Labor, das
    // ein laufendes abräumt, wäre schlimmer als eins, das Reste liegen lässt.
    if (stillIs(labPid, 'sponsor-lab.mjs')) {
      kept.push(line);
      continue;
    }
    if (!stillIs(childPid, marker)) {
      // Schon beendet, oder die Nummer wurde inzwischen neu vergeben.
      continue;
    }
    try {
      process.kill(Number(childPid), 'SIGTERM');
      ended += 1;
    } catch (vanishedMeanwhile) {
      // Zwischen Lesen und Senden beendet - auch gut.
    }
  }
  try {
    if (kept.length === 0) {
      unlinkSync(RUNNING);
    } else {
      writeFileSync(RUNNING, `${kept.join('\n')}\n`);
    }
  } catch (nothingToRemove) {
    // Auch gut.
  }
  if (ended > 0) {
    process.stdout.write(
      `== ${ended} Prozess(e) eines früheren Labors beendet, die niemand mehr `
      + 'aufgeräumt hatte\n');
  }
};
sweepPreviousRun();

const say = (line) => process.stdout.write(`${line}\n`);
const temp = (prefix) => mkdtempSync(join(tmpdir(), prefix));

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitFor(predicate, label, attempts = 600) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timeout:${label}`);
}

/**
 * The address the *phone* can reach, which is not the same question as which
 * address this laptop has.
 *
 * Measured on 2026-08-19 in this lab: the phone had no default route at all -
 * two on-link subnets and nothing else - so the laptop's wifi address was
 * unroutable from it, and the laptop's second interface, despite sharing the
 * phone's /24, sat on a different segment using the same range. Both timed
 * out. That is the network this lab is in, not something the product can fix.
 *
 * So the default is a USB bridge: `adb reverse` forwards a port on the
 * phone's loopback to this process. It is the standard tool for exactly this
 * and it is honest as long as it is *said*: the address the phone dials will
 * be `127.0.0.1`, and on Android loopback is reachable by every app on the
 * device. Fine for a lab, wrong for a deployment - a real one publishes the
 * intake on a LAN both devices are actually on, which is what
 * `PICO_LAB_PHONE_HOST` is for when such a LAN exists.
 */
function reachableAddress(intakePort) {
  const declared = process.env.PICO_LAB_PHONE_HOST;
  if (declared !== undefined && declared !== '') {
    for (const entries of Object.values(networkInterfaces())) {
      for (const entry of entries ?? []) {
        if (entry.family === 'IPv4' && entry.address === declared) {
          return { host: declared, bridged: false };
        }
      }
    }
    throw new Error(`PICO_LAB_PHONE_HOST ${declared} is not an address of this machine.`);
  }
  const reverse = spawnSync('adb', ['reverse', `tcp:${intakePort}`, `tcp:${intakePort}`]);
  if (reverse.status !== 0) {
    throw new Error('adb reverse failed and PICO_LAB_PHONE_HOST was not set; '
      + 'the phone has no way to reach this Home.');
  }
  return { host: '127.0.0.1', bridged: true };
}

async function startHome() {
  const foundationPort = await freePort();
  const intakePort = Number(process.env.PICO_LAB_INTAKE_PORT ?? await freePort());
  const data = temp('pico-lab-core-');
  let output = '';
  const child = spawn(process.execPath, [CORE], {
    env: {
      ...process.env,
      PICO_DATABASE_PATH: join(data, 'pico.sqlite'),
      PICO_BACKUP_DIRECTORY: join(data, 'backups'),
      PICO_KEY_STORE_PATH: join(data, 'keys'),
      PICO_HOME_HOST_KEY_STORE_PATH: join(data, 'home-host-keys'),
      // The diagnostics surface stays where it cannot be reached from the
      // network; only the intake below is published.
      PICO_HOST: '127.0.0.1',
      PICO_PORT: String(foundationPort),
      PICO_FOUNDATION_ACCESS_MODE: 'loopback-dev',
      PICO_LINK_INTAKE_HOST: '0.0.0.0',
      PICO_LINK_INTAKE_PORT: String(intakePort),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  remember(child, CORE);
  /**
   * **Auch auf die Platte, nicht nur in diese Variable** (2026-08-25).
   *
   * Das Home antwortete einem Sponsor mit `500`, der Sponsor starb an der
   * Ausnahme, und mit ihm verschwand die einzige Stelle, an der stand,
   * *warum*: seine Worte lagen in `output` und nirgends sonst. Ein Absturz muss
   * seine Erklärung hinterlassen, sonst kostet jeder Fehlschlag einen zweiten
   * Durchgang, nur um ihn noch einmal zu sehen.
   */
  const homeLog = join(data, 'core.log');
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      output += chunk;
      appendFileSync(homeLog, chunk);
    });
  }
  say(`   the Home writes to ${homeLog}`);
  await waitFor(
    () => output.includes('picoHomeMoveInCode') && output.includes('Server listening at'),
    'core_start',
  );
  const reachable = reachableAddress(intakePort);
  return {
    // The founding device is on this machine and uses loopback; the phone is
    // told the address that means something to *it*.
    foundingUrl: `http://127.0.0.1:${foundationPort}`,
    phoneUrl: `http://${reachable.host}:${intakePort}`,
    bridged: reachable.bridged,
    announcementLine: output.split('\n').find((line) => line.includes('picoHomeMoveInCode')),
  };
}

async function startDaemon() {
  const vaultHomePath = temp('pico-lab-vault-');
  let output = '';
  const child = spawn(process.execPath, [
    CLI, 'daemon',
    '--vault-home', vaultHomePath,
    '--foundation-data', temp('pico-lab-data-'),
    '--foundation-backup', temp('pico-lab-backup-'),
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  remember(child, CLI);
  const daemonLog = join(vaultHomePath, 'daemon.log');
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      output += chunk;
      appendFileSync(daemonLog, chunk);
    });
  }
  say(`   the vault daemon writes to ${daemonLog}`);
  await waitFor(() => output.includes('socketPath'), 'daemon_start');
  return JSON.parse(output.split('\n').find((line) => line.includes('socketPath'))).socketPath;
}

await sodium.ready;

say('== starting a Home (Foundation on loopback, Link intake on the LAN)');
const home = await startHome();
say(`   the phone will reach it at: ${home.phoneUrl}`);
if (home.bridged) {
  say('   (over `adb reverse`, because this phone has no route to this laptop -');
  say('    a deployment publishes the intake on a LAN instead)');
}

say('== starting a Vault daemon for the sponsoring device');
const socketPath = await startDaemon();

say('== founding the Home from this machine');
const profileDirectory = temp('pico-lab-profile-');
mkdirSync(profileDirectory, { recursive: true });
const profilePath = join(profileDirectory, 'profile.json');
await foundPicoCompanionHome({
  socketPath,
  profilePath,
  coreUrl: home.foundingUrl,
  announcement: parsePicoHomeSetupAnnouncement(home.announcementLine),
  passphrase: PASSPHRASE,
  sodium,
  // The lab's own device answers for its own signatures; the ceremony being
  // walked by a person is the phone's, one screen over.
  decisions: { decideApproval: async () => true },
  delegationValidUntil: '2027-01-01T00:00:00.000Z',
});
/**
 * Founding speaks to the Foundation API over loopback, which is right - a
 * move-in code is not something to publish. Afterwards the companion speaks
 * only Link, so the profile is re-pointed at the intake's LAN address.
 *
 * This is not lab scaffolding: it is what the address in a profile *is*
 * for. The grant this device writes carries its own `coreUrl` to the phone,
 * so a loopback address here would hand the phone a Home at 127.0.0.1 - its
 * own - and the join would fail at the first sealed request with nothing to
 * suggest why.
 */
const founded = readPicoCompanionProfile(profilePath);
writePicoCompanionProfile(profilePath, { ...founded, coreUrl: home.phoneUrl });
const profile = readPicoCompanionProfile(profilePath);
say(`   Home ${picoDisplayFingerprint(profile.home.homeHostPicoIdentityFingerprintHex)} founded`);
say(`   profile now points at ${profile.coreUrl}, which is what the grant carries`);

say('');
say('== the Home is up. The phone is not asked for an address: the grant it');
say('   reads carries one, which is why the line above had to be right.');
say('== drop the phone\'s offer code into the inbox below:');

/**
 * Codes arrive as files rather than on stdin. A person carrying a code
 * between two screens is not a stream, and a lab driven from a terminal that
 * comes and goes had stdin closed under it once already - after which the
 * ceremony waits forever with nothing to say.
 */
const inbox = join(profileDirectory, 'inbox');
mkdirSync(inbox, { recursive: true });
/**
 * Where the lab is, in a file rather than in a log line somebody has to
 * parse. `finish-join.sh` reads this; a phone that leaves the USB bus
 * mid-ceremony - which is what this one does - makes that resumability the
 * difference between continuing and founding a second Home.
 */
writeFileSync(join(repoRoot, '.pico-stage', 'lab.json'), `${JSON.stringify({
  intakePort: Number(new URL(home.phoneUrl).port),
  phoneUrl: home.phoneUrl,
  bridged: home.bridged,
  inbox,
}, null, 2)}\n`);
const nextCode = async (name) => {
  const path = join(inbox, `${name}.txt`);
  say(`   waiting for ${path}`);
  for (;;) {
    if (existsSync(path)) {
      const value = readFileSync(path, 'utf8').trim();
      if (value !== '') {
        unlinkSync(path);
        return value;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
};

const offerCode = await nextCode('offer');

/**
 * Unlocked here rather than at startup, because a Vault locks itself when
 * nothing has needed it - and a lab waiting for a person to walk to another
 * screen is exactly nothing needing it. Unlocking at the start looked
 * tidier and produced `link_device_signing_key_not_unlocked` at the moment
 * of granting, which is the daemon keeping the promise ADR 0081 makes about
 * idle locking.
 */
/**
 * All three keys, not only the identity one. A Link client seals with the
 * device key agreement key and signs with the device signing key; unlocking
 * the identity alone gets as far as `link_device_signing_key_not_unlocked`,
 * which is the daemon being right about what it was asked for.
 */
const session = await openPicoCompanionVaultProductSession({
  socketPath,
  unlock: [
    {
      keyRole: 'pico_identity',
      keyFingerprintHex: profile.identity.keyFingerprintHex,
      passphrase: PASSPHRASE,
    },
    {
      keyRole: 'device_signing',
      keyFingerprintHex: profile.device.signingKeyFingerprintHex,
      passphrase: PASSPHRASE,
    },
    {
      keyRole: 'device_key_agreement',
      keyFingerprintHex: profile.device.keyAgreementKeyFingerprintHex,
      passphrase: PASSPHRASE,
    },
  ],
  decisions: { decideApproval: async () => true },
});

say('== granting');
const enrolled = await enrolPicoCompanionDevice({
  profile,
  daemonClient: session.consumerClient,
  livingDeviceLinkClient: await createPicoCompanionLinkClient({
    profile,
    daemonClient: session.consumerClient,
    sodium,
  }),
  sodium,
  offerCode,
  validUntil: '2027-01-01T00:00:00.000Z',
  exchange: async (grantCode) => {
    /**
     * Shown, not printed. A grant is about eleven hundred characters and
     * lives four minutes; the phone reads it with its camera because that is
     * the only way it can be carried, which is what the desktop shell does
     * with the same code and what this lab has to imitate to be a sponsor at
     * all.
     */
    const png = join(profileDirectory, 'grant.png');
    const qrcode = (await import(requireFromDaemon.resolve('qrcode'))).default;
    await qrcode.toFile(png, grantCode, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 1400,
    });
    spawn('xdg-open', [png], { detached: true, stdio: 'ignore' }).unref();
    say('');
    let sum = 0;
    for (let index = 0; index < grantCode.length; index += 1) {
      sum = (sum * 31 + grantCode.charCodeAt(index)) >>> 0;
    }
    say(`== grant: ${grantCode.length} chars, checksum ${sum}`);
    say(`== showing the grant as a QR code: ${png}`);
    say('   hold the phone in front of it; it is ~1100 characters, so give the');
    say('   camera a moment and keep the whole square in view');
    say('');
    say(grantCode);
    say('');
    writeFileSync(join(inbox, 'grant.out'), `${grantCode}\n`);
    return await nextCode('acceptance');
  },
});

say('');
say(`== the phone is in: delegation ${enrolled.delegationId}`);
say(`   its signing key is ${picoDisplayFingerprint(enrolled.targetSigningKeyFingerprintHex)}`);
say('== leaving the Home running; Ctrl-C ends the lab.');
await new Promise(() => {});
