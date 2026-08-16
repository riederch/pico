# Agent runbook

Dieser Runbook enthaelt bedarfsweise Entwicklungs- und Betriebsdetails. Er ist
kein Statusdokument, keine Architekturentscheidung und kein Ersatz fuer
`AGENTS.md`, `.agent-context.md`, `progress.md` oder die ADRs.

## Repository und Workspace

Pico ist ein pnpm-/TypeScript-Monorepo. Aktuelle Workspace-Pakete:

- `apps/core` - Fastify-/SQLite-Foundation-Service
- `apps/vault-daemon` - lokaler Vault-Daemon, CLI und Reader-Access-Lease
  (ADR 0097/0098). Die ADR-0098-E2E-Tests starten den gebauten
  `dist/cli.js` als Kindprozess, weil die synchrone Bridge den aufrufenden
  Thread blockiert; ein `pretest`-Build erzwingt das passende `dist/`.
- `apps/companion` - shellfreier Lifecycle-, Alarm- und Host-Pin-Servicekern
- `apps/companion-shell` - Linux-first Electron-Host und Debian-Paketierung
- `apps/web` - frameworkfreier Foundation-Webclient
- `packages/protocol` - gemeinsame Runtime-Typen und canonical-byte Builder
- `packages/sync` - Lamport-/Version-Vector-Grundlagen
- `packages/identity` - lokale Identity-Verifikation und Lifecycle-Projektion
- `packages/vault` - minimale verschluesselte Keyfile-/Custody-Runtime

Das Home-Assistant-Add-on-Paket liegt unter `pico_home/` (ADR 0153; frueher `pico_home/`).

## Paketmanager

Der Lockfile-Vertrag ist `pnpm-lock.yaml` mit `pnpm@9.0.0`.
`package-lock.json` und `yarn.lock` sind unerwuenscht.

Auf Arbeitsumgebungen ohne globales `pnpm`:

```bash
npx pnpm@9.0.0 <script>
```

Falls ein Install benoetigt wird:

```bash
COREPACK_HOME=/tmp/pico-corepack corepack pnpm install \
  --store-dir /tmp/pico-pnpm-store
```

CI und Docker verwenden einen frozen Lockfile. Netzwerk- oder Registry-Fehler in
der Sandbox nicht durch Lockfile- oder Paketmanagerwechsel umgehen; die
notwendige Netzwerkfreigabe anfordern.

## Standardpruefungen

Vollstaendiger Release-Gate:

```bash
npx pnpm@9.0.0 release:verify
```

Enthalten sind:

```text
license:check -> version:check -> addon:check -> product:check ->
surface:check -> design-system:check -> companion:check -> browser:check ->
time:check -> offline:check -> supply:check -> build -> module:check ->
companion:release-check -> check -> test
```

Fokussierte Beispiele:

```bash
npx pnpm@9.0.0 --filter @pico/core check
npx pnpm@9.0.0 --filter @pico/core test
npx pnpm@9.0.0 --filter @pico/core test -- app.test.ts
npx pnpm@9.0.0 --filter @pico/protocol test
npx pnpm@9.0.0 --filter @pico/identity test
npx pnpm@9.0.0 --filter @pico/vault test
npx pnpm@9.0.0 --filter @pico/vault-daemon test
npx pnpm@9.0.0 --filter @pico/web test
npx pnpm@9.0.0 --filter @pico/companion-shell check
npx pnpm@9.0.0 --filter @pico/companion-shell test
npx pnpm@9.0.0 character:measure /path/to/candidate.png --core
```

Vor jedem Commit mindestens:

```bash
git diff --check
git status --short --branch
```

Code-, Protocol-, Release- und produktbezogene Dokumentationsmilestones muessen
den vollen Release-Gate bestehen. Bei einer rein internen Agent-Doku-Aenderung
sind Struktur-, Link- und Diff-Pruefung ausreichend.

## Linux-Companion-Paket

Das installierbare Linux-amd64-Artefakt wird ohne Netzwerkzugriff aus dem
gebauten Workspace, `pnpm-lock.yaml` und dem vorhandenen pnpm-Store erzeugt.
Der Paketpfad baut dazu einen reduzierten Produktions-Workspace auf und fuehrt
einen gefilterten `--offline --frozen-lockfile --prod`-Install mit deaktivierten
Install-Skripten aus. Ein frischer, leerer pnpm-Metadaten-Cache ist Teil jedes
Paketlaufs; ein warmer Runner-Cache ist deshalb keine versteckte Voraussetzung.
Das pnpm-v9-`deploy` wird bewusst nicht verwendet, weil dessen Aufloesung den
Lockfile nicht als alleinige Autoritaet behandelt.

Der Einstieg bleibt:

```bash
npx pnpm@9.0.0 --filter @pico/companion-shell package:linux
```

Debian-Paket und SHA-256-Sidecar liegen danach im ignorierten Verzeichnis
`apps/companion-shell/out/`. Der Release-Check baut das Paket erneut, prueft
Inhalt, XDG-Autostart, interne Links und fehlende Build-/Profildaten, fuehrt in
einer temporaeren `fakeroot`-Installation Install, Upgrade, Remove und Purge
durch und startet das extrahierte Electron real im Tray-only-Modus:

```bash
npx pnpm@9.0.0 --filter @pico/companion-shell verify:linux
```

Der Ressourcen-Probe laeuft aus dem erzeugten Paket. Chromium bevorzugt seinen
direkt neben der Anwendung liegenden `chrome-sandbox`; ein externer Helper kann
diesen Paketbestand nicht ueberschreiben. Der CI-Workflow fordert deshalb mit
`PICO_COMPANION_ROOT_OWNED_PACKAGE_PROBE=1` einen installationsnahen Probe an:
Der Verifier erzeugt atomar ein exaktes temporaeres Verzeichnis, uebergibt es
vor dem privilegierten Entpacken an `root:root` mit Modus `0755` und laesst
`dpkg-deb` dadurch Archiv-Eigentuemer und Setuid-Bit erhalten. Vor dem Start
muessen Extraktionswurzel und angrenzender Helper regulaer, root-eigen und der
Helper exakt `4755` sein. Electron startet ohne `CHROME_DEVEL_SANDBOX`,
`--disable-setuid-sandbox` oder `--no-sandbox` und waehlt damit denselben
Paket-Helper wie nach einer echten Installation. Das privilegierte
Extraktionsverzeichnis wird vor dem normalen Entfernen ueber seinen registrierten
`mkdtemp`-Pfad rekursiv an den aufrufenden Nutzer zurueckgegeben.

**Der Probe-Modus entscheidet ueber das Budget, und die Differenz ist gross.**
Ein lokaler Standardlauf misst im `user_namespace`-Modus rund 17,5 MB hoeher als
der root-eigene Paket-Probe und reisst das PSS-Budget deshalb auch an
unveraendertem HEAD. Das ist **kein** Befund am Code. Wer eine Budgetabweichung
sieht, prueft zuerst das `probe`-Feld im Messbericht, bevor er den Importgraphen
verdaechtigt.

**Und danach `privateBytes`, nicht nur `privateDirtyAndHugetlbBytes`.** Am
2026-08-12 fiel die gegatete Dirty-Summe zwischen zwei Laeufen auf demselben
Host von 105.680.896 auf 65.032.192 Byte, waehrend `privateCleanBytes` um
denselben Betrag stieg und die private Gesamtsumme sich um 4.096 Byte bewegte.
Vierzig Megabyte wechselten die Spalte, ohne dass sich etwas an der Groesse
aenderte. Eine Bewegung in der Dirty-Summe bei flacher Gesamtsumme ist eine
Klassifizierung des Wirts; erst eine Bewegung in beiden ist die Anwendung. Der Modus, gegen den das Budget definiert wurde, ist ein
ausdrueckliches Opt-in - dieselbe Variable, die `.github/workflows/ci.yml`
setzt - und verlangt passwortloses `sudo`, also ein Terminal mit TTY:

```bash
PICO_COMPANION_ROOT_OWNED_PACKAGE_PROBE=1 \
  npx pnpm@9.0.0 companion:release-check
```

Ein normaler lokaler Lauf entpackt weiterhin unprivilegiert. Weil sein im Archiv
korrekter Setuid-Helper dann absichtlich keine Root-Eigentuemerschaft besitzt,
erzwingt der Verifier mit `--disable-setuid-sandbox` ausschliesslich den
User-Namespace-Pfad. Geerbte `CHROME_DEVEL_SANDBOX`-Pfade und vollstaendig
unsandboxed Probes werden in beiden Modi verweigert. Der Gate prueft ausserdem
den root-eigenen `4755`-Helper direkt im Debian-Archiv. Die Renderer-Sandbox wird
separat durch die C2-Window-, Boundary- und Electron-Smoke-Pruefungen gebunden.

Dafuer werden Linux amd64, `dpkg-deb`, `fakeroot` und entweder eine laufende
Display-Session oder `xvfb-run` benoetigt. Der root-eigene CI-Modus benoetigt
ausserdem passwortloses `sudo` fuer die begrenzte Extraktion und Rueckgabe des
exakten temporaeren Verzeichnisses. Der Probe schreibt seinen letzten
Messbericht nach `apps/companion-shell/out/tray-memory-linux-amd64.json`; PSS
und die Summe aus `Private_Dirty` plus `Private_Hugetlb` sind die v2-Gates.
Summiertes RSS, `Private_Clean` und die gesamte private residente Summe bleiben
informativ, weil Shared Pages im RSS mehrfach und Clean Pages je nach aktueller
Dateiseitenteilung unterschiedlich als private klassifiziert werden. Der Bericht
nennt `privateDirtyAndHugetlbBytes` und dessen 110.000.000-Byte-Budget explizit;
Clean, Dirty und Hugetlb werden ausserdem nach den geschlossenen Electron-Rollen
aggregiert. Die von `app.getAppMetrics()` gemeldeten PIDs ergaenzen den
Parent-/Child-Walk, damit ein vom Sandbox-Start umgehaengter App-Prozess nicht
aus der Messung faellt. Der JSON-Bericht wird vor den Budgetassertions
geschrieben und ausgegeben, sodass auch ein fehlgeschlagener CI-Lauf die
entscheidungsfaehige Evidenz enthaelt. Alle temporaeren Paket-, Lifecycle- und
Probe-Verzeichnisse werden auch nach einem Fehlschlag entfernt.

## Container- und Runtime-Smokes

Lokales Core-Image:

```bash
podman build -f docker/home.Dockerfile -t pico-home:local .
podman build -f docker/relay.Dockerfile -t pico-relay:local .
```

Direkte lokale Smokes muessen einen expliziten Access Mode und disposable
Pfade/Ports verwenden. Niemals echte lokale Datenbanken, Host Keys oder
Memory-Key-Stores in Testcontainer einbinden.

Relevante Quellen:

- `docker/home.Dockerfile`
- `docker/relay.Dockerfile`
- `pico_home/config.yaml`
- `pico_home/DOCS.md`
- `.github/workflows/ci.yml`
- `docs/release/backup-before-migration.md`

Echte Home-Assistant-Ingress-/First-Boot-Validierung benoetigt eine passende
Home-Assistant-Umgebung und darf nicht durch einen normalen Container-Smoke als
erledigt behauptet werden.

## Daten, Keys und Backups

- SQLite-Datenbank, Home-Host-Keys, Memory-KEKs und Vault-Keyfiles sind getrennte
  Custody-/Backup-Klassen.
- Fuer Tests nur per Testhelper oder `mktemp` erzeugte Pfade verwenden.
- Keine Keys, Move-In Codes, Bootstrap Codes, Sessions oder Tokens in Commits,
  Fixtures oder dauerhafte Logs uebernehmen.
- Restore- und Migrationstests muessen fail-closed Security-Grenzen erhalten.

Die autoritativen Details stehen in ADR 0070-0084 und
`docs/release/backup-before-migration.md`.

## Dokumentationskonsistenz

Bei README-Aenderungen `docs/release/documentation-consistency.md` befolgen.
Bei Versionsaenderungen `docs/release/versioning.md` befolgen.
Bei ADR-Implementierungsfortschritt die Matrix
`docs/architecture/implementation-status.md` pruefen.

`progress.md` bleibt eine periodische Schaetzung. Prozentwerte, Testzahlen und
naechste Schritte nur nach direkter Repository-Pruefung aktualisieren.

## Bekannte Umgebungsbesonderheiten

- `pnpm` ist moeglicherweise nicht global auf dem `PATH`; `npx pnpm@9.0.0` ist
  der portable Standardweg.
- Die Arbeitsmaschine bringt kein passendes globales Node mit. Node 22.20.0 und
  Hilfsbinaries werden dort unter `/tmp/node-v22.20.0-linux-x64/bin` bzw.
  `/tmp/pico-bin` bereitgestellt und beiden `PATH` vorangestellt. `/tmp` ist
  tmpfs: nach einem Neustart ist das erneut bereitzustellen, und grosse
  Fixtures gehoeren nicht dorthin.
- Sandbox-DNS kann Registry-Aufloesung blockieren; nicht durch unsichere
  Workarounds umgehen.
- Crypto-Tests verwenden `libsodium-wrappers-sumo`. Externe Prozesse wie
  `b2sum` sind kein portabler Testvertrag und koennen in Sandboxes scheitern.
- Testlogs duerfen kurzlebige synthetische Setup-/Bootstrap-Werte ausgeben; sie
  sind keine Fixtures oder persistierbaren Beispielwerte.

Historische erfolgreiche Testlaeufe werden nicht hier protokolliert. Der
aktuelle Handoff nennt nur den zuletzt direkt verifizierten Gate; Git und CI
halten den Verlauf.
