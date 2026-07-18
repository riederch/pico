# Pico Entwicklungsfortschritt

## Metadaten

| Feld | Wert |
| --- | --- |
| Letzte Aktualisierung | 2026-07-18 |
| Analysierter Branch | main |
| Analysierter Commit | 2eba20dbd0ce0ac6e55fcfedcecdd3acea2c36ef |
| Hinweis | Alle Prozentangaben sind Schätzungen auf Basis des Repository-Stands. |

## Gesamtstatus

- Geschätzter Gesamtfortschritt: ca. 35 %.
- Aktueller Entwicklungsschwerpunkt: Foundation-Runtime, lokale Authentifizierung, Memory-Härtung, Identity/Vault/Protocol-Gates.
- Wichtigste Fortschritte: Core-API, Web Dashboard, SQLite-Store, Auth-Sessions, Memory-Verschlüsselung/Retention, Identity/Vault-Runtimes und Home-Signature-Input-Vektoren sind vorhanden.
- Wichtigste offene Arbeiten: Pico Home Claim Flow, Pico Link/Relay-Runtime, Home-Mitgliedschaft, produktionsreife Berechtigungen, Companion-UX und Policy/Action-Ausführung.
- Relevante Risiken: Viele ADRs sind noch Konzept, Placeholder oder Gate; echte Home-Assistant-Installation, Schlüssel-Lifecycle und Ende-zu-Ende-Flows bleiben offen.

## Fortschritt der Pico-Hauptkomponenten

| Pico-Komponente | Fortschritt | Status | Aktueller Stand | Wichtigster nächster Schritt |
| --------------- | ----------: | ------ | --------------- | ---------------------------- |
| Pico Core | 58 % | In Arbeit | Foundation-Service mit HTTP/WebSocket, SQLite, Auth, Memory, Retention und Dashboard-Anbindung ist lokal nutzbar. | Home-Claim, Mitgliedschaft und produktionsreife Berechtigungen anbinden. |
| Pico Surfaces | 38 % | Teilweise implementiert | Das Foundation Web Dashboard bedient lokale Diagnose-, Auth- und Memory-Flows. | Zur ersten clientnahen Companion-Oberfläche ausbauen. |
| Pico Protocol | 58 % | In Arbeit | Eventtypen, Payloads, Fixture-Gates und Identity/Home/Vault-Bytes sind testgebunden. | Conformance-Runner und echte Link/Home-Runtime-Schemas ergänzen. |
| Pico Sync | 30 % | Teilweise implementiert | Lamport-Clock und Version-Vector-Helfer sind vorhanden. | Replikationsprotokoll und reale Client-/Vault-Synchronisation bauen. |
| Pico Identity | 45 % | Teilweise implementiert | Signaturprüfung und Lifecycle-Projektion sind als Paket umgesetzt. | Persistenz, Freshness und Membership-Anbindung ergänzen. |
| Pico Vault | 48 % | Teilweise implementiert | Encrypted-Keyfile-Runtime mit Person-Key-Custody, Signatur und Unwrap existiert. | Platform-Keystore, Daemon/IPC und Home-Claim-Integration bauen. |
| Pico Home | 26 % | Teilweise implementiert | Claim-State-Skeleton und M1-Signature-Input-Vektoren existieren, aber kein Claim-Ablauf. | Setup Mode, Move-In Code, Host-Key-Custody und Claim Endpoint implementieren. |
| Pico Link | 14 % | Konzipiert | Architektur und draft-only Fixtures sind vorhanden, aber keine Transport- oder Relay-Runtime. | Minimales Transport-/Envelope-Runtime erst nach Sicherheitsgates starten. |

## Pico Core

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Architektur | 65 % | In Arbeit | Core ist als Fastify/SQLite-Foundation-Service mit klaren Store- und API-Grenzen strukturiert. |
| Kernfunktionen | 60 % | In Arbeit | Events, Realtime, Memory-Write, Retention, Tombstones, Crypto-Shred und Systemdiagnose funktionieren lokal. |
| Datenhaltung | 65 % | In Arbeit | SQLite-Migrationen, Backup-Pfad, Event Store, Memory Store, Key Store und Operator Store sind vorhanden. |
| Schnittstellen | 55 % | Teilweise implementiert | Lokale HTTP- und WebSocket-APIs sind implementiert, aber noch keine produktionsreife Remote- oder Home-Mitgliedschaftsgrenze. |
| Sicherheit und Berechtigungen | 50 % | In Arbeit | Operator-Bootstrap, Sessions, Access Classes und Static-Token-Begrenzung existieren, ersetzen aber keine Pico-Identity-Authz. |
| Tests | 80 % | Weitgehend fertig | Core hat eine breite Unit- und API-Testbasis mit 191 Tests. |
| Installation und Betrieb | 55 % | Teilweise implementiert | Dockerfile, CI-Smokes und Home-Assistant-Add-on-Metadaten existieren, reale HA-Installationsvalidierung bleibt offen. |

## Pico Surfaces

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Benutzeroberfläche | 38 % | Teilweise implementiert | Das Web Dashboard zeigt Foundation-Status, Events, Auth, Retention, Shred und Memory-Reader-Flächen. |
| Integration mit Pico Core | 45 % | Teilweise implementiert | API- und WebSocket-Helfer nutzen Core-Endpunkte inklusive Ingress-Prefix-Unterstützung. |
| Sicherheit und Berechtigungen | 35 % | Teilweise implementiert | Dashboard nutzt Bearer-Session oder Foundation-Token, bleibt aber ein Admin-/Diagnosewerkzeug. |
| Tests | 60 % | In Arbeit | Web hat 34 Tests für Rendering, API-Helfer, Credentials und WebSocket-URLs. |
| Produktumfang | 15 % | Konzipiert | Companion-UX, Voice, Avatar-Zustände, mobile Oberflächen und Alltagsflows fehlen. |

## Pico Protocol

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Foundation-Typen | 65 % | In Arbeit | Eventtypen, Payload-Vokabular, Realtime-Formate und Response-Typen sind als Runtime-Exports vorhanden. |
| Kanonische Bytes und Vektoren | 70 % | In Arbeit | Memory-AD, Identity, Home und Vault haben autoritative Vektoren und Builder für abgegrenzte Gates. |
| Draft-Fixtures | 35 % | Konzipiert | Pico Link, Pico Home Link und Model Delegation besitzen draft-only Fixtures ohne Runtime- oder Kompatibilitätsanspruch. |
| Validierung und Conformance | 45 % | Teilweise implementiert | Protocol-Tests binden Docs und Fixtures, ein eigenständiger Conformance-Runner fehlt. |
| Tests | 75 % | Weitgehend fertig | Protocol hat 40 Tests für Exportlisten, Payloads, Docs und Fixture-Bytegleichheit. |

## Pico Sync

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Kernfunktionen | 45 % | Teilweise implementiert | LamportClock sowie Merge- und Update-Helfer für Version Vectors sind implementiert. |
| Kommunikation | 10 % | Konzipiert | Es gibt noch kein Replikations-, Transport- oder Konfliktauflösungsprotokoll. |
| Integration mit anderen Pico-Komponenten | 20 % | Teilweise implementiert | Core nutzt Lamport-Grundlagen, aber keine echte Client-, Vault- oder Multi-Node-Synchronisation. |
| Tests | 60 % | In Arbeit | Sync hat 11 Tests für Clock- und Version-Vector-Verhalten. |

## Pico Identity

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Architektur | 55 % | In Arbeit | Identity-Key-Rollen, Delegation, Revocation und Lifecycle-Projektion sind abgegrenzt. |
| Kernfunktionen | 55 % | Teilweise implementiert | Ed25519-Signaturprüfung, Fingerprints, Possession, Delegation und Revocation werden lokal geprüft. |
| Sicherheit und Berechtigungen | 45 % | Teilweise implementiert | Verifier fail-closed und Lifecycle-Reconciliation existieren, Freshness und Recovery fehlen. |
| Integration mit anderen Pico-Komponenten | 30 % | Teilweise implementiert | Protocol/Vault-Vektoren greifen ineinander, aber Core/Home verwenden Identity noch nicht als Autoritätsmodell. |
| Tests | 65 % | In Arbeit | Identity hat 13 Tests plus Fixture-Bindung für Verifikation und Lifecycle. |

## Pico Vault

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Kernfunktionen | 60 % | In Arbeit | Vault kann Person-Keyfiles erzeugen, öffnen, signieren, versiegelte Boxen öffnen und verschlüsselt exportieren. |
| Datenhaltung | 50 % | Teilweise implementiert | Keyfiles sind verschlüsselt und mit Datei-/Pfadschutz getestet, aber noch kein dauerhafter Vault-Dienst. |
| Sicherheit und Berechtigungen | 50 % | Teilweise implementiert | Argon2id, XChaCha20-Poly1305, Rollenchecks, Auto-Lock und Pfadtrennung sind vorhanden. |
| Integration mit anderen Pico-Komponenten | 25 % | Teilweise implementiert | Vault ist Paket-Runtime, aber noch nicht in Home Claim, Membership oder Client-UX eingebunden. |
| Installation und Betrieb | 10 % | Konzipiert | Platform-Keystore, Daemon/IPC, Recovery und Approval-UX fehlen. |
| Tests | 65 % | In Arbeit | Vault hat 6 real-crypto Tests für Keyfile, Rollen, Locking und Pfadgrenzen. |

## Pico Home

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Architektur | 45 % | Konzipiert | Home Host, Move-In Code, Membership und Continuity sind per ADR klarer umrissen. |
| Kernfunktionen | 15 % | Konzipiert | Der Core enthält nur ein internes Claim-State-Skeleton und diagnostische Leseflächen. |
| Schnittstellen | 10 % | Konzipiert | Claim Endpoint, Setup Mode, Signaturen und Membership-APIs fehlen. |
| Datenhaltung | 20 % | Teilweise implementiert | Claim-State-Migration existiert, aber keine persistierte Claim- oder Membership-Runtime. |
| Sicherheit und Berechtigungen | 20 % | Konzipiert | M1-Signature-Input-Bytes sind vorhanden, Host-Key-Custody und Verifikation fehlen. |
| Tests | 35 % | Teilweise implementiert | Protocol-Vektoren decken M1-Bytes ab, aber keine Ende-zu-Ende-Home-Flows. |
| Installation und Betrieb | 35 % | Teilweise implementiert | Home-Assistant-Add-on-Pfad existiert für Core, nicht für First-Boot-Claim oder Membership. |

## Pico Link

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Architektur | 30 % | Konzipiert | Transport-, Relay-, Envelope- und Privacy-Grenzen sind in ADRs beschrieben. |
| Kommunikation | 5 % | Nicht begonnen | Es gibt keine Pico-Link-Transport-, Relay- oder Adapter-Runtime. |
| Sicherheit und Datenschutz | 20 % | Konzipiert | Draft-Fixtures benennen Rejection-Grenzen, aber keine Verschlüsselung oder Signaturprüfung läuft. |
| Integration mit anderen Pico-Komponenten | 5 % | Nicht begonnen | Core, Home, Vault und Identity nutzen Pico Link noch nicht für echte Kommunikation. |
| Tests | 20 % | Konzipiert | Draft-only Fixtures werden im Protocol-Paket geprüft, sind aber keine Kompatibilitäts- oder Runtime-Tests. |

## Architekturentscheidungen und ADRs

- Es gibt 81 nummerierte ADRs sowie eine Implementation-Status-Matrix.
- Wichtige getroffene Entscheidungen betreffen Foundation-Grenzen, lokale Authentifizierung, Memory-Verschlüsselung, Schlüsselrollen, Identity/Vault-Custody, Home Claim Ceremony und draft-only Fixture-Gates.
- Viele ADRs laufen der Implementierung voraus: Pico Link, Relay, Pico Rules, Action Runner, Action History, Companion-UX und große Home-Mitgliedschaftsflüsse sind überwiegend konzipiert.
- Die ADRs sind hilfreich für Richtung und Sicherheitsreihenfolge, gelten aber nicht als Nachweis fertiger Produktfunktionen.

## Änderungen seit der letzten Aktualisierung

> Erstmalige Bestandsaufnahme des aktuellen Repository-Stands.

## Nächste Schwerpunkte

1. Pico Home Claim Flow mit Setup Mode, Move-In Code, Host-Key-Custody, Claim Endpoint und Reset-Audit implementieren.
2. Pico Identity und Pico Vault in Core/Home so anbinden, dass Membership, Freshness und Autorität nicht nur testlokal existieren.
3. Pico Link erst als minimales Envelope-/Transport-Walking-Skeleton bauen, sobald die relevanten Sicherheitsgates erfüllt sind.
4. Home-Assistant-Add-on real installieren und Ingress, Backup/Restore, Datenpfade und Betriebsmodus praktisch validieren.
5. Einen ersten Ende-zu-Ende-Nutzfluss über Surface, Core, Memory, Berechtigungen und Audit herstellen.
