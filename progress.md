# Pico Entwicklungsfortschritt

## Metadaten

| Feld | Wert |
| --- | --- |
| Letzte Aktualisierung | 2026-07-18 |
| Analysierter Branch | main |
| Analysierter Commit | d48c3f8452998704eccf6ed6ff15f38a979c8629 |
| Hinweis | Alle Prozentangaben sind Schätzungen auf Basis des Repository-Stands. |

## Gesamtstatus

- Geschätzter Gesamtfortschritt: ca. 38 %.
- Aktueller Entwicklungsschwerpunkt: Foundation-Runtime, Pico-Home-Setup-Grundlagen, lokale Authentifizierung und Identity/Vault/Protocol-Gates.
- Wichtigste Fortschritte: Pico Home hat Setup Mode, Move-In-Code, Host-Key-Custody, Claim Endpoint, Reset-Marker und Audit-Events als ersten Runtime-Slice.
- Wichtigste offene Arbeiten: signierter/sealed Home Claim, Membership, Pico Link/Relay-Runtime, produktionsreife Berechtigungen, Companion-UX und Policy/Action-Ausführung.
- Relevante Risiken: Der aktuelle Home-Claim ist noch keine vollständige Claim Ceremony und keine Pico-Home-Link-Kompatibilität; echte Home-Assistant-Installation bleibt offen.

## Fortschritt der Pico-Hauptkomponenten

| Pico-Komponente | Fortschritt | Status | Aktueller Stand | Wichtigster nächster Schritt |
| --------------- | ----------: | ------ | --------------- | ---------------------------- |
| Pico Core | 61 % | In Arbeit | Foundation-Service mit HTTP/WebSocket, SQLite, Auth, Memory, Retention, Dashboard und Home-Setup-Slice ist lokal nutzbar. | signierten Home-Claim, Mitgliedschaft und produktionsreife Berechtigungen anbinden. |
| Pico Surfaces | 38 % | Teilweise implementiert | Das Foundation Web Dashboard bedient lokale Diagnose-, Auth- und Memory-Flows. | Zur ersten clientnahen Companion-Oberfläche ausbauen. |
| Pico Protocol | 60 % | In Arbeit | Eventtypen, Payloads, Capabilities, Fixture-Gates und Identity/Home/Vault-Bytes sind testgebunden. | Conformance-Runner und echte Link/Home-Runtime-Schemas ergänzen. |
| Pico Sync | 30 % | Teilweise implementiert | Lamport-Clock und Version-Vector-Helfer sind vorhanden. | Replikationsprotokoll und reale Client-/Vault-Synchronisation bauen. |
| Pico Identity | 45 % | Teilweise implementiert | Signaturprüfung und Lifecycle-Projektion sind als Paket umgesetzt. | Persistenz, Freshness und Membership-Anbindung ergänzen. |
| Pico Vault | 48 % | Teilweise implementiert | Encrypted-Keyfile-Runtime mit Person-Key-Custody, Signatur und Unwrap existiert. | Platform-Keystore, Daemon/IPC und Home-Claim-Integration bauen. |
| Pico Home | 36 % | In Arbeit | Setup Mode, Move-In-Code, Host-Key-Custody, lokaler Claim und Reset-Audit existieren als M2-Teilslice. | Claim signieren/versiegeln, Vault/Identity anbinden und Membership persistieren. |
| Pico Link | 14 % | Konzipiert | Architektur und draft-only Fixtures sind vorhanden, aber keine Transport- oder Relay-Runtime. | Minimales Transport-/Envelope-Runtime erst nach Sicherheitsgates starten. |

## Pico Core

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Architektur | 66 % | In Arbeit | Core ist als Fastify/SQLite-Foundation-Service mit klaren Store-, Setup- und API-Grenzen strukturiert. |
| Kernfunktionen | 62 % | In Arbeit | Events, Realtime, Memory, Retention, Crypto-Shred, Systemdiagnose und Home-Setup funktionieren lokal. |
| Datenhaltung | 67 % | In Arbeit | SQLite-Migrationen, Event Store, Memory Store, Key Stores, Operator Store und Home-Claim-Metadaten sind vorhanden. |
| Schnittstellen | 58 % | Teilweise implementiert | Lokale HTTP/WebSocket-APIs inklusive Home-Setup/Claim existieren, aber noch keine produktionsreife Remote- oder Membership-Grenze. |
| Sicherheit und Berechtigungen | 53 % | In Arbeit | Operator-Sessions, Access Classes, Move-In-Code und Host-Key-Pfadtrennung existieren, ersetzen aber keine Pico-Identity-Authz. |
| Tests | 82 % | Weitgehend fertig | Core hat eine breite Unit- und API-Testbasis mit 201 Tests. |
| Installation und Betrieb | 57 % | Teilweise implementiert | Dockerfile, CI-Smokes, Add-on-Metadaten und Host-Key-Backup-Ausschluss existieren, reale HA-Installationsvalidierung bleibt offen. |

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
| Foundation-Typen | 67 % | In Arbeit | Eventtypen, Payload-Vokabular, Capabilities, Realtime-Formate und Response-Typen sind als Runtime-Exports vorhanden. |
| Kanonische Bytes und Vektoren | 70 % | In Arbeit | Memory-AD, Identity, Home und Vault haben autoritative Vektoren und Builder für abgegrenzte Gates. |
| Draft-Fixtures | 35 % | Konzipiert | Pico Link, Pico Home Link und Model Delegation besitzen draft-only Fixtures ohne Runtime- oder Kompatibilitätsanspruch. |
| Validierung und Conformance | 47 % | Teilweise implementiert | Protocol-Tests binden Docs, Payloads, setupbezogene Audit-Events und Fixtures, ein eigenständiger Conformance-Runner fehlt. |
| Tests | 76 % | Weitgehend fertig | Protocol hat 41 Tests für Exportlisten, Payloads, Docs und Fixture-Bytegleichheit. |

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
| Architektur | 50 % | In Arbeit | Home Host, Move-In-Code, Claim State, Membership und Continuity sind abgegrenzt und der erste Runtime-Slice existiert. |
| Kernfunktionen | 35 % | In Arbeit | Setup Mode, per-Prozess-Move-In-Code, Host-Key-Custody, lokaler Claim und Reset-Audit funktionieren. |
| Schnittstellen | 30 % | Teilweise implementiert | `GET /api/home/setup` und `POST /api/home/claim` existieren nur im unclaimed Zustand; Signaturen und Membership fehlen. |
| Datenhaltung | 35 % | Teilweise implementiert | Claim-State-Metadaten speichern Home-ID und Host-Key-Fingerprints, aber keine Membership-Records. |
| Sicherheit und Berechtigungen | 32 % | Teilweise implementiert | Move-In-Code ist digest-only/single-use und Host-Keys sind getrennt gespeichert; sealed Claim und Verifikation fehlen. |
| Tests | 50 % | In Arbeit | Core deckt Setup, Claim, Reset und Store-Grenzen ab; Vault/Identity-Ende-zu-Ende-Claim fehlt. |
| Installation und Betrieb | 45 % | Teilweise implementiert | Host-Key-Pfad, Backup-Ausschluss und Reset-Marker existieren, echte First-Boot-/HA-Validierung fehlt. |

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
- ADR 0080 M2 ist nur teilweise umgesetzt: Host-Setup-Grundlagen existieren, die signierte/sealed Claim Ceremony und Membership-Runtime fehlen.
- Die ADRs sind hilfreich für Richtung und Sicherheitsreihenfolge, gelten aber nicht als Nachweis fertiger Produktfunktionen.

## Änderungen seit der letzten Aktualisierung

- Pico Home besitzt jetzt Setup Mode, lokalen Move-In-Code, Host-Key-Custody, Claim Endpoint und lokalen Reset-Marker.
- Core speichert Home-Claim-Metadaten mit Home-ID und Host-Key-Fingerprints und schreibt `home.claimed`/`home.reset` nur serverseitig mit leerem Payload.
- Protocol exportiert `home.claimed`, `home.reset`, `pico.home.setup.v1` und Home-Setup-/Claim-Response-Typen.
- Add-on-/Core-Konfiguration trennt Home-Host-Keys von Datenbank, Memory-Key-Store und Backups.
- Tests wurden für Core-Setup/Claim/Reset, Store-Migrationen und Protocol-Payload-Grenzen erweitert.

## Nächste Schwerpunkte

1. Claim Ceremony mit Sealed-Box-Payload, Host-/Claimant-Signaturen und Founding Record auf Basis von Vault/Identity umsetzen.
2. Home Membership persistieren und in den bestehenden Readership-/Berechtigungs-Seam integrieren.
3. Home-Assistant-Add-on real installieren und Ingress, Backup/Restore, Datenpfade und Betriebsmodus praktisch validieren.
4. Pico Link erst als minimales Envelope-/Transport-Walking-Skeleton bauen, sobald die relevanten Sicherheitsgates erfüllt sind.
5. Einen ersten Ende-zu-Ende-Nutzfluss über Surface, Core, Memory, Berechtigungen und Audit herstellen.

## Pflegeanweisung für Aktualisierungen

Wenn der Auftrag "aktualisiere progress.md" lautet, diese Datei anhand des aktuellen Repository-Stands aktualisieren:

1. Branch, Commit, vorhandenen Code, funktionsfähige Abläufe, Tests, Konfiguration, Deployment-Dateien und offene TODOs/Placeholder direkt prüfen.
2. Dokumentation und ADRs nur ergänzend verwenden; ein ADR gilt erst als umgesetzt, wenn passende Implementierung, Integration oder Tests vorhanden sind.
3. Bestehende Struktur, Reihenfolge und kurze Form beibehalten; Prozentwerte nur bei nachvollziehbarem Fortschritt oder neu erkannten Problemen ändern.
4. Bei späteren Aktualisierungen bevorzugt nur relevante Änderungen seit dem zuletzt analysierten Commit prüfen und den Diff klein halten.
5. "Änderungen seit der letzten Aktualisierung" auf höchstens fünf wesentliche Fortschritte beschränken und erledigte nächste Schritte entfernen.
6. Keine neuen Hauptkomponenten erfinden; technische Themen nur als Unterbereiche von Pico Core, Pico Link, Pico Vault, Pico Home oder klar erkennbaren Pico-Komponenten führen.
7. Fortschritt realistisch bewerten und klar zwischen konzipiert, dokumentiert, prototypisch umgesetzt, implementiert und praktisch funktionsfähig unterscheiden.
8. Ausschließlich `progress.md` verändern.
