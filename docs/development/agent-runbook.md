# Agent runbook

Dieser Runbook enthaelt bedarfsweise Entwicklungs- und Betriebsdetails. Er ist
kein Statusdokument, keine Architekturentscheidung und kein Ersatz fuer
`AGENTS.md`, `.agent-context.md`, `progress.md` oder die ADRs.

## Repository und Workspace

Pico ist ein pnpm-/TypeScript-Monorepo. Aktuelle Workspace-Pakete:

- `apps/core` - Fastify-/SQLite-Foundation-Service
- `apps/web` - frameworkfreier Foundation-Webclient
- `packages/protocol` - gemeinsame Runtime-Typen und canonical-byte Builder
- `packages/sync` - Lamport-/Version-Vector-Grundlagen
- `packages/identity` - lokale Identity-Verifikation und Lifecycle-Projektion
- `packages/vault` - minimale verschluesselte Keyfile-/Custody-Runtime

Das Home-Assistant-Add-on-Paket liegt unter `pico_core/`.

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
license:check -> version:check -> build -> check -> test
```

Fokussierte Beispiele:

```bash
npx pnpm@9.0.0 --filter @pico/core check
npx pnpm@9.0.0 --filter @pico/core test
npx pnpm@9.0.0 --filter @pico/core test -- app.test.ts
npx pnpm@9.0.0 --filter @pico/protocol test
npx pnpm@9.0.0 --filter @pico/identity test
npx pnpm@9.0.0 --filter @pico/vault test
npx pnpm@9.0.0 --filter @pico/web test
```

Vor jedem Commit mindestens:

```bash
git diff --check
git status --short --branch
```

Code-, Protocol-, Release- und produktbezogene Dokumentationsmilestones muessen
den vollen Release-Gate bestehen. Bei einer rein internen Agent-Doku-Aenderung
sind Struktur-, Link- und Diff-Pruefung ausreichend.

## Container- und Runtime-Smokes

Lokales Core-Image:

```bash
podman build -f docker/core.Dockerfile -t pico-core:local .
```

Direkte lokale Smokes muessen einen expliziten Access Mode und disposable
Pfade/Ports verwenden. Niemals echte lokale Datenbanken, Host Keys oder
Memory-Key-Stores in Testcontainer einbinden.

Relevante Quellen:

- `docker/core.Dockerfile`
- `pico_core/config.yaml`
- `pico_core/DOCS.md`
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

Die autoritativen Details stehen in ADR 0070-0081 und
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
- Sandbox-DNS kann Registry-Aufloesung blockieren; nicht durch unsichere
  Workarounds umgehen.
- Crypto-Tests verwenden `libsodium-wrappers-sumo`. Externe Prozesse wie
  `b2sum` sind kein portabler Testvertrag und koennen in Sandboxes scheitern.
- Testlogs duerfen kurzlebige synthetische Setup-/Bootstrap-Werte ausgeben; sie
  sind keine Fixtures oder persistierbaren Beispielwerte.

Historische erfolgreiche Testlaeufe werden nicht hier protokolliert. Der
aktuelle Handoff nennt nur den zuletzt direkt verifizierten Gate; Git und CI
halten den Verlauf.
