/**
 * ADR 0129 SR5 - der Port bekommt sein anderes Ende, auf einem echten Telefon.
 *
 * SR5 erklärte die Erfassung für unimplementiert und gab dafür einen Grund an,
 * der ein Zustand der Welt war: *„whoever fills this port is a mobile runtime
 * that does not exist, and an adapter that cannot be run against a real device
 * would be code nobody can verify."* Die Laufzeit gibt es seit ADR 0131 A5, und
 * sie tut seit dem 2026-08-26 echte Produktarbeit. Dies ist der Adapter.
 *
 * **Kein Betriebssystem-Standort-API in diesem Prozess.** Das ist SR5s
 * tragender Satz, und er wird hier nicht durch Disziplin eingehalten, sondern
 * durch die Bauform: Java liest den Standort und schreibt ihn zeilenweise in
 * eine Datei, Node liest die Datei. Der Übergang vom Betriebssystem nach Pico
 * ist damit genau eine Stelle, und sie liegt außerhalb dieses Skripts.
 *
 * **Was hier nicht entschieden wird**, obwohl es naheliegt: ob überhaupt
 * gemessen werden darf, und in welchem Raum die Messungen liegen. Das erste
 * ist eine dauerhafte Entscheidung über das Leben einer Person (SR6) und
 * gehört nicht in einen Sensoradapter; das zweite ist die einzige Custody, die
 * eine Beobachtung trägt, und der Home nennt sie. Dieses Skript reicht
 * Messungen weiter und behauptet nichts über sie.
 *
 * **Bewegungsarten fehlen, und das steht hier statt nirgends.** Eine
 * Aktivitätserkennung kommt bei Android aus den Play-Diensten, die diese
 * handgebaute APK nicht hat. `readMobilitySamples` gibt deshalb nichts zurück -
 * leer, nicht erfunden. Der Port hält die beiden Hälften ausdrücklich
 * getrennt, damit die ärmere nicht mit der reicheren verschwindet.
 */
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createPicoCompanionAutomaticVaultUnlock,
  defaultPicoCompanionPlatformUnlockPath,
} from '@pico/companion/platform-unlock';
import { createPicoCompanionLinkClient } from '@pico/companion/recovery-controller';
import { keepPicoCompanionDerivedObservation } from '@pico/companion/observations';
import { condensePicoCompanionObservations } from '@pico/companion/observation-condensation';
import { parsePicoLocationFix } from '@pico/protocol/spatial-recall';
import { connectPicoVaultDaemonClient } from '@pico/vault-daemon/client';
import { connectPicoAndroidKeystorePort } from './keystore-port.mjs';

const stage = dirname(fileURLToPath(import.meta.url));
const files = dirname(stage);
const say = (fields) => process.stdout.write(`${JSON.stringify(fields)}\n`);

/** Wohin Java schreibt, was das System gemessen hat. Eine Zeile je Messung. */
const takenPath = join(files, 'fixes.jsonl');

async function connectDaemon(socketPath) {
  let refused;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      return await connectPicoVaultDaemonClient({ socketPath });
    } catch (failed) {
      refused = failed;
      await new Promise((resolve) => { setTimeout(resolve, 500); });
    }
  }
  throw refused;
}

/**
 * Der Port aus `@pico/module-spatial-recall/ports`, hier gefüllt.
 *
 * `readLocationFixes` gibt **geparste** Messungen zurück, nicht rohe: der Port
 * verlangt das ausdrücklich, weil genau hier eine Ablesung entweder zu einer
 * brauchbaren Position wird - drei Werte, Genauigkeit dabei - oder abgelehnt.
 * Ein Port, der Rohes zurückgäbe, verschöbe diese Entscheidung in die
 * Ableitung und ließe den Adapter ihr alles reichen.
 */
const androidCapturePorts = {
  readLocationFixes: async (sinceIso) => {
    let lines;
    try {
      lines = readFileSync(takenPath, 'utf8').split('\n').filter((line) => line.trim() !== '');
    } catch {
      // Keine Datei heißt: nichts gemessen. Das ist eine Antwort, kein Fehler.
      return [];
    }
    const since = Date.parse(sinceIso);
    const fixes = [];
    for (const line of lines) {
      let parsed;
      try {
        parsed = parsePicoLocationFix(JSON.parse(line));
      } catch {
        // Eine Zeile, die keine Messung ist, wird übergangen und nicht
        // geraten. Sie hier durchzulassen hiesse, die Grenze zu verschieben.
        continue;
      }
      if (Date.parse(parsed.at) >= since) {
        fixes.push(parsed);
      }
    }
    return fixes.sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
  },
  readMobilitySamples: async () => [],
};

try {
  const profilePath = join(files, 'profile.json');
  const profile = JSON.parse(readFileSync(profilePath, 'utf8'));
  const requireFromVault = createRequire(
    realpathSync(join(stage, 'node_modules/@pico/vault/package.json')),
  );
  const sodium = (await import(requireFromVault.resolve('libsodium-wrappers-sumo'))).default;
  await sodium.ready;

  // Alles, was der Puffer noch halten darf (ADR 0129 SR2: 48 Stunden).
  const since = new Date(Date.now() - 48 * 60 * 60 * 1_000).toISOString();
  const fixes = await androidCapturePorts.readLocationFixes(since);
  const mobility = await androidCapturePorts.readMobilitySamples(since);
  if (fixes.length === 0 && mobility.length === 0) {
    say({ step: 'nothing_measured' });
  } else {
    const socketPath = join(files, 'vault', 'run', 'daemon.sock');
    await (await connectDaemon(socketPath)).close();
    const keystore = await connectPicoAndroidKeystorePort(join(files, 'keystore-capture.sock'));
    const automatic = createPicoCompanionAutomaticVaultUnlock({
      path: defaultPicoCompanionPlatformUnlockPath(profilePath),
      profile,
      socketPath,
      secrets: keystore,
    });
    await automatic.ensureUnlocked();

    const daemonClient = await connectDaemon(socketPath);
    await daemonClient.hello();
    try {
      const linkClient = await createPicoCompanionLinkClient({ profile, daemonClient, sodium });

      /**
       * **ADR 0126 P3, seit dem 2026-09-03: verdichtet wird hier, nicht dort.**
       *
       * Bis dahin gingen die Messungen selbst an den Home, der sie pufferte.
       * P3s andere Hälfte dreht das um: der Puffer liegt auf diesem Gerät, die
       * Ableitung auch, und was die Zustandsgrenze überquert, ist eine
       * Erinnerung. Der Home sieht die Messungen nie.
       *
       * **Nichts abgeleitet heisst nichts verbraucht.** Die Datei bleibt
       * stehen, bis eine Ableitung entstanden *und* angekommen ist - dieselbe
       * Reihenfolge wie vorher und aus demselben Grund: Wiederholung ist der
       * laute Fehlschlag, Verlust der leise.
       *
       * **Und heute leitet das hier nichts ab**, gemessen und nicht vermutet:
       * `readMobilitySamples` gibt leer zurück, weil Bewegungsarten bei
       * Android aus den Play-Diensten kommen, die diese Sonde nicht hat. Ohne
       * den Übergang von fahrend zu gehend hat ein Parkplatz kein Merkmal.
       * Der Weg steht trotzdem: bis dahin sammelte der Home Rohstandorte, aus
       * denen nichts entstand.
       */
      const derived = condensePicoCompanionObservations({
        locationFixes: fixes,
        mobilitySamples: mobility,
      });
      if (derived === undefined) {
        say({ step: 'nothing_derived', held: fixes.length + mobility.length });
      } else {
        const kept = await keepPicoCompanionDerivedObservation({ linkClient, derived });
        /**
         * Nur die Messungen bis zum Übergang, aus dem die Ableitung ihren
         * Schluss zog. Was danach gemessen wurde, gehört zur nächsten Fahrt.
         */
        if (kept.crossed) {
          const consumedThrough = Date.parse(derived.consumedThrough);
          const kept_ = readFileSync(takenPath, 'utf8').split('\n')
            .filter((line) => {
              if (line.trim() === '') {
                return false;
              }
              try {
                return Date.parse(JSON.parse(line).at) > consumedThrough;
              } catch {
                // Eine Zeile, die keine Messung ist, wird nicht aufbewahrt -
                // sie war auch keine Eingabe.
                return false;
              }
            });
          writeFileSync(takenPath, kept_.length === 0 ? '' : `${kept_.join('\n')}\n`, 'utf8');
        }
        say({
          step: 'derived_kept',
          crossed: kept.crossed,
          memoryItemId: kept.memoryItemId,
          from: fixes.length + mobility.length,
        });
      }
    } finally {
      await daemonClient.close();
    }
  }
} catch (failed) {
  say({ step: 'capture_failed', reason: String(failed && failed.message) });
}
