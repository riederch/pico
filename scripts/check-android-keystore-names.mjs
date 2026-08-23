import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Zwei Sprachen, eine Regel: die Namen, mit denen Android und der Kern über
 * denselben Keystore reden, müssen dieselben sein.
 *
 * ADR 0131 A3 verlangt, dass der Plattformcode urteilt und ein **Verdikt mit
 * seinen Belegen** in den schalenfreien Kern gibt. Das heißt zwangsläufig,
 * dass die Namen zweimal geschrieben stehen - einmal in
 * `KeystoreEvidence.java`, einmal in `apps/companion/src/platform-secrets.ts`
 * -, denn Java und TypeScript teilen keine Konstante. Eine Wahrheit, die
 * zweimal geschrieben steht, driftet, und diese hier driftete bereits, bevor
 * sie zum ersten Mal zusammengeführt wurde: die Sonde nannte die EC-Wurzel
 * `google_ec_ca1` und gab `KeyInfo.getSecurityLevel()` als *Zahl* aus, während
 * der Kern `google_ec_key_attestation_ca1` und `trusted_environment` erwartete.
 *
 * Das ist die Art Bruch, die nicht knallt. Der Kern lehnt mit
 * `platform_keystore_attestation_unrooted` ab - was heißt "die Kette erreichte
 * keine gepinnte Wurzel" -, und die Kette hatte sie erreicht. Ein Telefon mit
 * einwandfreier Hardware bekäme die Ablehnung, die für gefälschte gedacht ist,
 * und niemand käme auf den Namen als Ursache.
 *
 * Geprüft wird die **Gleichheit der Mengen**, in beide Richtungen. Ein Name,
 * den nur der Kern kennt, ist eine Regel ohne Anwender; ein Name, den nur die
 * Sonde kennt, ist ein Gerät, das durchfällt, obwohl es bestanden hat.
 */
const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);

const core = readFileSync(
  join(root, 'apps/companion/src/platform-secrets.ts'), 'utf8');
const probe = readFileSync(
  join(root, 'tools/android-runtime-probe/apk/src/com/pico/a1probe/KeystoreEvidence.java'),
  'utf8');

const failures = [];

/** Die Einträge einer `as const`-Liste im Kern. */
const coreList = (name) => {
  const found = core.match(
    new RegExp(`export const ${name} = \\[([^\\]]*)\\] as const;`));
  if (found === null) {
    failures.push(`${name} steht nicht mehr in platform-secrets.ts`);
    return null;
  }
  return new Set([...found[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
};

/**
 * Die Zeichenketten, die `pinnedRootVerdict` zurückgeben kann - ohne `none`
 * und `unreadable`, die keine Wurzeln sind, sondern deren Abwesenheit.
 */
const probeRoots = () => {
  const body = probe.match(
    /static String pinnedRootVerdict\(Certificate root\) \{([\s\S]*?)\n  \}/);
  if (body === null) {
    failures.push('pinnedRootVerdict steht nicht mehr in KeystoreEvidence.java');
    return null;
  }
  return new Set([...body[1].matchAll(/"([a-z0-9_]+)"/g)]
    .map((m) => m[1])
    .filter((name) => name !== 'none' && name !== 'unreadable'));
};

/** Die Namen, die `securityLevelName` vergibt - ohne den `unknown_`-Zweig. */
const probeLevels = () => {
  const body = probe.match(
    /static String securityLevelName\(long value\) \{([\s\S]*?)\n  \}/);
  if (body === null) {
    failures.push('securityLevelName steht nicht mehr in KeystoreEvidence.java');
    return null;
  }
  return new Set([...body[1].matchAll(/return "([a-z_]+)";/g)].map((m) => m[1]));
};

const compare = (what, fromCore, fromProbe, alsoInProbe = []) => {
  if (fromCore === null || fromProbe === null) {
    return;
  }
  const allowed = new Set([...fromCore, ...alsoInProbe]);
  for (const name of fromCore) {
    if (!fromProbe.has(name)) {
      failures.push(`${what}: der Kern kennt "${name}", die Sonde vergibt ihn nie`);
    }
  }
  for (const name of fromProbe) {
    if (!allowed.has(name)) {
      failures.push(`${what}: die Sonde vergibt "${name}", der Kern kennt ihn nicht`);
    }
  }
};

compare('Attestierungswurzeln',
  coreList('picoCompanionAndroidAttestationRoots'), probeRoots());

/**
 * **Und die Wurzeln selbst, nicht nur ihre Namen** (2026-08-22).
 *
 * Bis hierher vergleicht dieser Prüfer Namen. Die Bytes daneben - zwei
 * base64-kodierte Zertifikate im Java-Array - prüfte nichts, und die ADR sagt
 * über sie: ein falsches Zeichen verschiebt den Digest. Ein gekipptes Byte
 * hätte also grün ergeben und auf dem Telefon `unrooted` - genau die stille
 * Sorte Bruch, für die dieser Prüfer überhaupt existiert, eine Ebene tiefer.
 *
 * Die erwarteten Digests stammen aus Googles autoritativer Liste
 * (`https://android.googleapis.com/attestation/root`), am 2026-08-22 abgerufen
 * und mit den gepinnten Bytes verglichen: beide byte-identisch, und die Liste
 * enthält genau diese zwei - nichts gepinnt, was Google nicht publiziert,
 * nichts publiziert, was hier fehlt.
 *
 * **Die Reihenfolge wird mitgeprüft, und das ist kein Beiwerk.**
 * `pinnedRootVerdict` benennt die Wurzel über ihren *Index* - `i == 0` heißt
 * EC. Wer die beiden Einträge vertauscht, bekommt für jedes Telefon den
 * falschen Wurzelnamen zurück, und der Namensvergleich oben merkt davon
 * nichts, weil beide Namen weiterhin vorkommen.
 */
const pinnedRootDigests = [
  ['google_ec_key_attestation_ca1',
    '6d9db4ce6c5c0b293166d08986e05774a8776ceb525d9e4329520de12ba4bcc0'],
  ['google_rsa_f92009e853b6b045',
    'cedb1cb6dc896ae5ec797348bce9286753c2b38ee71ce0fbe34a9a1248800dfc'],
];
const pinnedBytes = (() => {
  const found = probe.match(
    /PINNED_ATTESTATION_ROOTS = \{([\s\S]*?)\n  \};/);
  if (found === null) {
    failures.push('PINNED_ATTESTATION_ROOTS steht nicht mehr in KeystoreEvidence.java');
    return [];
  }
  return found[1].split(/,\s*\n/)
    .map((chunk) => [...chunk.matchAll(/"([^"]*)"/g)].map((m) => m[1]).join(''))
    .filter((entry) => entry !== '');
})();
if (pinnedBytes.length !== pinnedRootDigests.length) {
  failures.push(
    `Wurzelbytes: ${pinnedBytes.length} gepinnt, ${pinnedRootDigests.length} erwartet`);
} else {
  for (const [index, [name, expected]] of pinnedRootDigests.entries()) {
    const actual = createHash('sha256')
      .update(Buffer.from(pinnedBytes[index], 'base64'))
      .digest('hex');
    if (actual !== expected) {
      failures.push(
        `Wurzelbytes: Eintrag ${index} soll ${name} sein (sha256 ${expected.slice(0, 12)}…), `
        + `ist aber sha256 ${actual.slice(0, 12)}… - vertauscht oder verändert`);
    }
  }
}
// `software` gehört dazu: der Kern *kennt* es und lehnt es namentlich ab.
// Ein Niveau, das die Sonde vergibt und der Kern nicht einmal ablehnen kann,
// wäre der Fehler - nicht eins, das er ablehnt.
compare('Sicherheitsniveaus',
  coreList('picoCompanionAndroidKeystoreLevels'), probeLevels(), ['software']);

/**
 * Und der Beleg selbst: jedes Feld, das der Kern verlangt, muss die Sonde
 * schreiben. Der Kern lehnt ein fehlendes Feld ab, statt es als "in Ordnung"
 * zu lesen - richtig, aber die Ablehnung käme erst auf einem Telefon.
 */
const evidenceFields = [...core.matchAll(
  /^\s{4}(\w+): (?:text|flag)\('(\w+)'\),$/gm)].map((m) => m[2]);
if (evidenceFields.length === 0) {
  failures.push('parsePicoCompanionAndroidKeystoreEvidence liest keine Felder mehr');
}
const written = probe.match(
  /public static String json\(String keyInfoLevel[^)]*\) \{([\s\S]*?)\n  \}/);
if (written === null) {
  failures.push('KeystoreEvidence.json steht nicht mehr in KeystoreEvidence.java');
} else {
  for (const field of evidenceFields) {
    if (!written[1].includes(`\\"${field}\\"`)) {
      failures.push(`Beleg: der Kern liest "${field}", die Sonde schreibt es nicht`);
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    process.stderr.write(`  ${failure}\n`);
  }
  process.stderr.write(
    `\nandroid keystore names: ${failures.length} Abweichung(en) zwischen `
    + 'Kern und Sonde.\n');
  process.exit(1);
}
process.stdout.write(
  `android keystore names: ${evidenceFields.length} Belegfelder, `
  + `${pinnedBytes.length} Wurzeln mit geprüften Bytes und Reihenfolge, `
  + 'Wurzeln und Niveaus in beiden Sprachen gleich.\n');
