import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Funktionen, deren fallengelassenes Versprechen eine falsche Behauptung
 * hinterlässt - und die Aufrufe, die es fallen lassen könnten.
 *
 * **Der Anlass ist eine Änderung von heute** (2026-08-21).
 * `writePicoCompanionPlatformUnlock` war synchron, solange es nur Electrons
 * `safeStorage` bedienen musste. Der Android-Keystore liegt hinter einer
 * Prozessgrenze, also wurde die Funktion `async` - und damit wurde aus jedem
 * ihrer Aufrufe eine Stelle, an der ein vergessenes `await` nichts kaputt
 * macht, was man sieht:
 *
 *     writePicoCompanionPlatformUnlock({ ... });   // Versprechen fällt
 *     platformUnlockBound = true;                  // Behauptung steht
 *
 * Der Journaleintrag sagt dann, die Passphrase sei an den Keystore gebunden,
 * während die Datei noch nicht geschrieben ist und der Fehlschlag als
 * unbehandelte Rejection irgendwo anders auftaucht. Genau die Sorte Lücke,
 * die ein Absturz zwischen beiden Zeilen zu einem Gerät macht, das sich für
 * eingerichtet hält.
 *
 * TypeScript sieht das nicht - ein ignoriertes `Promise<void>` ist gültiges
 * TypeScript -, und dieses Projekt fährt ohne ESLint. Also prüft es dieser
 * Gate.
 *
 * **Was er nicht bewacht**, damit niemand mehr hineinliest, als drinsteht:
 * nur die `export async function`-Namen aus den unten genannten Modulen, nur
 * direkte Aufrufe unter ihrem eigenen Namen. Ein Aufruf über eine Variable,
 * ein Alias beim Import oder eine Methode auf einem Objekt fällt durch das
 * Netz. Die Liste ist die Liste der Stellen, an denen ein stilles Versprechen
 * eine Unwahrheit erzeugt - nicht die aller asynchronen Funktionen.
 */
const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);

/** Module, deren asynchrone Exporte eine Zusicherung tragen. */
const guarded = ['apps/companion/src/platform-unlock.ts'];

/** Wo nach Aufrufen gesucht wird. */
const searched = ['apps/companion/src', 'apps/companion-shell/src', 'packages'];

const names = new Set();
for (const module of guarded) {
  const source = readFileSync(join(root, module), 'utf8');
  for (const found of source.matchAll(/export async function (\w+)\(/g)) {
    names.add(found[1]);
  }
}
if (names.size === 0) {
  process.stderr.write(
    'awaited secrets: keine asynchronen Exporte gefunden - die Liste zeigt ins Leere.\n');
  process.exit(1);
}

const files = [];
const walk = (directory) => {
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === 'dist') {
      continue;
    }
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      walk(path);
    } else if (path.endsWith('.ts') || path.endsWith('.mts')) {
      files.push(path);
    }
  }
};
for (const directory of searched) {
  walk(join(root, directory));
}

const failures = [];
let calls = 0;
for (const path of files) {
  const source = readFileSync(path, 'utf8');
  const lines = source.split('\n');
  for (const name of names) {
    // Der Aufruf, nicht der Import und nicht die Definition: ein `(` dahinter,
    // und kein `function`, `import` oder `,` davor.
    const call = new RegExp(`(^|[^\\w.])${name}\\s*\\(`);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!call.test(line)
        || /^\s*(?:export\s+)?(?:async\s+)?function\s/.test(line)
        || /^\s*(?:import|export)\s/.test(line)
        || line.includes('* ')) {
        continue;
      }
      calls += 1;
      // `await`, `return`, `void` oder `expect(` in derselben Zeile: alle
      // drei ersten behandeln das Versprechen, das vierte ist ein Test, der
      // es bewusst als Wert nimmt.
      if (!/\b(?:await|return|void)\s|expect\(/.test(line)) {
        failures.push(
          `${relative(root, path)}:${index + 1}: ${name} ohne await`);
      }
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    process.stderr.write(`  ${failure}\n`);
  }
  process.stderr.write(
    `\nawaited secrets: ${failures.length} fallengelassene(s) Versprechen.\n`);
  process.exit(1);
}
process.stdout.write(
  `awaited secrets: ${names.size} zusichernde Funktion(en), `
  + `${calls} Aufrufe, jeder behandelt.\n`);
