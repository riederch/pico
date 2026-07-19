# Pico Entwicklungsfortschritt

## Metadaten

| Feld | Wert |
| --- | --- |
| Letzte Aktualisierung | 2026-07-19 |
| Analysierter Branch | main |
| Analysierter Commit | 3e216152aec532f053c0fcef51b27ed63bcdbf6b |
| Hinweis | Alle Prozentangaben sind Schätzungen auf Basis des Repository-Stands. |

## Gesamtstatus

- Geschätzter Gesamtfortschritt: ca. 42 %.
- Aktueller Entwicklungsschwerpunkt: Foundation-Runtime, Pico-Home-Claim-/Founding-/Restore-/Membership-Slice und Identity/Vault/Protocol-Gates.
- Wichtigste Fortschritte: Pico Home kann sealed Claims gründen, Claim-/Membership-State wiederherstellen und den Home Host Pico als aktives Mitglied projizieren.
- Wichtigste offene Arbeiten: signierte Membership Credentials, Membership-Lifecycle, Operator-Konsolidierung, Pico Link/Relay-Runtime, Companion-UX und Policy/Action-Ausführung.
- Relevante Risiken: Pending Claims sind noch pro Prozess, Legacy-Claims haben keine Founding-/Membership-Evidence und echte Protected-Display-/Home-Assistant-Installation bleibt offen.

## Fortschritt der Pico-Hauptkomponenten

| Pico-Komponente | Fortschritt | Status | Aktueller Stand | Wichtigster nächster Schritt |
| --------------- | ----------: | ------ | --------------- | ---------------------------- |
| Pico Core<br>Lokaler Foundation-Service für APIs, Events, Memory und Home-Betrieb. | 65 % | In Arbeit | Foundation-Service mit HTTP/WebSocket, SQLite, Auth, Memory, Retention, Dashboard und Home-Claim/Founding/Membership-Projektion ist lokal nutzbar. | Signierte Mitgliedschaft, Operator-Konsolidierung und produktionsreife Berechtigungen anbinden. |
| Pico Surfaces<br>Benutzeroberflächen für Diagnose, Companion-Interaktion und Alltagsflows. | 38 % | Teilweise implementiert | Das Foundation Web Dashboard bedient lokale Diagnose-, Auth- und Memory-Flows. | Zur ersten clientnahen Companion-Oberfläche ausbauen. |
| Pico Protocol<br>Gemeinsame Typen, kanonische Bytes und Kompatibilitätsgrenzen. | 62 % | In Arbeit | Eventtypen, Payloads, Capabilities, Fixture-Gates und Identity/Home/Vault-Bytes inklusive Claim-/Founding-Records sind testgebunden. | Membership-Runtime-Schemas und Conformance-Runner ergänzen. |
| Pico Sync<br>Grundlage für Replikation, Versionierung und Konfliktabgleich. | 30 % | Teilweise implementiert | Lamport-Clock und Version-Vector-Helfer sind vorhanden. | Replikationsprotokoll und reale Client-/Vault-Synchronisation bauen. |
| Pico Identity<br>Identitäts-, Key- und Signaturprüfung für Picos und Devices. | 46 % | Teilweise implementiert | Signaturprüfung und Lifecycle-Projektion sind als Paket umgesetzt und im Home Claim erstmals konsumiert. | Persistenz, Freshness und Membership-Anbindung ergänzen. |
| Pico Vault<br>Lokale Schlüssel-Custody für Person-/Device-Keys und Signaturen. | 48 % | Teilweise implementiert | Encrypted-Keyfile-Runtime mit Person-Key-Custody, Signatur und Unwrap existiert. | Platform-Keystore, Daemon/IPC und Home-Claim-Integration bauen. |
| Pico Home<br>Lokale Host-Instanz, die Picos aufnimmt, betreibt und verwaltet. | 56 % | In Arbeit | Setup Mode, sealed Claim, Founding Record, Restore-Reconciliation, Membership-Projektion und Reset-Audit existieren als schmaler Runtime-Slice. | Signierte Membership Credentials, Lifecycle/Eviction und Operator-Konsolidierung umsetzen. |
| Pico Link<br>Geplanter Transport für sichere Kommunikation zwischen Picos und Homes. | 14 % | Konzipiert | Architektur und draft-only Fixtures sind vorhanden, aber keine Transport- oder Relay-Runtime. | Minimales Transport-/Envelope-Runtime erst nach Sicherheitsgates starten. |

## Pico Core

Lokaler Foundation-Service für APIs, Events, Memory, Auth und Pico-Home-Betrieb.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Architektur | 68 % | In Arbeit | Core ist als Fastify/SQLite-Foundation-Service mit klaren Store-, Setup-, Claim-, Membership- und API-Grenzen strukturiert. |
| Kernfunktionen | 66 % | In Arbeit | Events, Realtime, Memory, Retention, Crypto-Shred, Systemdiagnose und Home-Claim-/Founding-/Membership-Restore-Slice funktionieren lokal. |
| Datenhaltung | 71 % | In Arbeit | SQLite-Migrationen, Event Store, Memory Store, Key Stores, Operator Store, Claim-/Founding-/Membership-Projektionen sind vorhanden. |
| Schnittstellen | 63 % | Teilweise implementiert | Lokale HTTP/WebSocket-APIs inklusive Setup-Bundle und zweistufigem sealed Home Claim existieren, aber noch keine signierte Membership-API. |
| Sicherheit und Berechtigungen | 62 % | In Arbeit | Operator-Sessions, Access Classes, Move-In-Code, Host-Key-Pfadtrennung, Claimant-Prüfung, Host-Gegensignatur, Boot-Custody-Checks und Membership-Readership-Seam existieren. |
| Tests | 86 % | Weitgehend fertig | Core hat eine breite Unit- und API-Testbasis mit 211 Tests. |
| Installation und Betrieb | 58 % | Teilweise implementiert | Dockerfile, CI-Smokes, Add-on-Metadaten, Host-Key-Backup-Ausschluss und restore-geschlossener Boot existieren, reale HA-Validierung bleibt offen. |

## Pico Surfaces

Benutzeroberflächen für Diagnose, Companion-Interaktion und Alltagsflows.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Benutzeroberfläche | 38 % | Teilweise implementiert | Das Web Dashboard zeigt Foundation-Status, Events, Auth, Retention, Shred und Memory-Reader-Flächen. |
| Integration mit Pico Core | 45 % | Teilweise implementiert | API- und WebSocket-Helfer nutzen Core-Endpunkte inklusive Ingress-Prefix-Unterstützung. |
| Sicherheit und Berechtigungen | 35 % | Teilweise implementiert | Dashboard nutzt Bearer-Session oder Foundation-Token, bleibt aber ein Admin-/Diagnosewerkzeug. |
| Tests | 60 % | In Arbeit | Web hat 34 Tests für Rendering, API-Helfer, Credentials und WebSocket-URLs. |
| Produktumfang | 15 % | Konzipiert | Companion-UX, Voice, Avatar-Zustände, mobile Oberflächen und Alltagsflows fehlen. |

## Pico Protocol

Gemeinsames Paket für Protocol-Typen, canonical bytes und Kompatibilitätsgrenzen.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Foundation-Typen | 70 % | In Arbeit | Eventtypen, Payload-Vokabular, Capabilities, Realtime-Formate sowie Home-Claim- und Founding-Record-Typen sind als Runtime-Exports vorhanden. |
| Kanonische Bytes und Vektoren | 71 % | In Arbeit | Memory-AD, Identity, Home und Vault haben autoritative Vektoren und Builder für abgegrenzte Gates. |
| Draft-Fixtures | 35 % | Konzipiert | Pico Link, Pico Home Link und Model Delegation besitzen draft-only Fixtures ohne Runtime- oder Kompatibilitätsanspruch. |
| Validierung und Conformance | 50 % | Teilweise implementiert | Protocol-Tests binden Docs, Payloads, setup-/claim-/foundingbezogene Typen und Fixtures, ein eigenständiger Conformance-Runner fehlt. |
| Tests | 76 % | Weitgehend fertig | Protocol hat 41 Tests für Exportlisten, Payloads, Docs und Fixture-Bytegleichheit. |

## Pico Sync

Grundlage für lokale Replikation, Versionierung und Konfliktabgleich.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Kernfunktionen | 45 % | Teilweise implementiert | LamportClock sowie Merge- und Update-Helfer für Version Vectors sind implementiert. |
| Kommunikation | 10 % | Konzipiert | Es gibt noch kein Replikations-, Transport- oder Konfliktauflösungsprotokoll. |
| Integration mit anderen Pico-Komponenten | 20 % | Teilweise implementiert | Core nutzt Lamport-Grundlagen, aber keine echte Client-, Vault- oder Multi-Node-Synchronisation. |
| Tests | 60 % | In Arbeit | Sync hat 11 Tests für Clock- und Version-Vector-Verhalten. |

## Pico Identity

Identitäts- und Signaturbausteine für Pico-, Device- und Lifecycle-Authority.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Architektur | 55 % | In Arbeit | Identity-Key-Rollen, Delegation, Revocation und Lifecycle-Projektion sind abgegrenzt. |
| Kernfunktionen | 55 % | Teilweise implementiert | Ed25519-Signaturprüfung, Fingerprints, Possession, Delegation und Revocation werden lokal geprüft. |
| Sicherheit und Berechtigungen | 45 % | Teilweise implementiert | Verifier fail-closed und Lifecycle-Reconciliation existieren, Freshness und Recovery fehlen. |
| Integration mit anderen Pico-Komponenten | 35 % | Teilweise implementiert | Core/Home verwenden Identity-Verifikation im Claim-Pfad, aber noch nicht als vollständiges Autoritätsmodell. |
| Tests | 65 % | In Arbeit | Identity hat 13 Tests plus Fixture-Bindung für Verifikation und Lifecycle. |

## Pico Vault

Lokale Key-Custody-Runtime für Person- und Device-Keys.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Kernfunktionen | 60 % | In Arbeit | Vault kann Person-Keyfiles erzeugen, öffnen, signieren, versiegelte Boxen öffnen und verschlüsselt exportieren. |
| Datenhaltung | 50 % | Teilweise implementiert | Keyfiles sind verschlüsselt und mit Datei-/Pfadschutz getestet, aber noch kein dauerhafter Vault-Dienst. |
| Sicherheit und Berechtigungen | 50 % | Teilweise implementiert | Argon2id, XChaCha20-Poly1305, Rollenchecks, Auto-Lock und Pfadtrennung sind vorhanden. |
| Integration mit anderen Pico-Komponenten | 25 % | Teilweise implementiert | Vault ist Paket-Runtime, aber noch nicht in Home Claim, Membership oder Client-UX eingebunden. |
| Installation und Betrieb | 10 % | Konzipiert | Platform-Keystore, Daemon/IPC, Recovery und Approval-UX fehlen. |
| Tests | 65 % | In Arbeit | Vault hat 6 real-crypto Tests für Keyfile, Rollen, Locking und Pfadgrenzen. |

## Pico Home

Lokale Host-Instanz für Claim, Mitgliedschaft, Betrieb und Verwaltung eines Pico Homes.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Architektur | 60 % | In Arbeit | Home Host, Move-In-Code, Claim State, Founding Record, Membership-Projektion, Restore-Reconciliation und Continuity sind abgegrenzt. |
| Kernfunktionen | 56 % | In Arbeit | Setup Mode, Move-In-Code, Host-Key-Custody, zweistufiger sealed Claim, Founding Record, Membership-Projektion, Restore-Reconciliation, Legacy-Claim und Reset-Audit funktionieren. |
| Schnittstellen | 50 % | Teilweise implementiert | `POST /api/home/claim` unterstützt Legacy-Claim und sealed Claim mit `foundingAcceptance`-Abschluss. |
| Datenhaltung | 55 % | Teilweise implementiert | Claim-State, Founding Record und die aktive Home-Host-Membership-Projektion werden persistiert und aus Founding Evidence rekonstruiert. |
| Sicherheit und Berechtigungen | 56 % | Teilweise implementiert | Move-In-Code, Setup-Nonce, Host-Key-Sealed-Open, Claimant-Signaturprüfung, Host-Gegensignatur, Boot-Custody-Checks und Membership-Readership-Seam sind implementiert. |
| Tests | 74 % | In Arbeit | Core deckt Setup, Legacy-Claim, sealed Claim, Founding-Abschluss, Membership-Projektion, Restore-Reconciliation, Tamper-Rejects, Reset und Store-Grenzen ab. |
| Installation und Betrieb | 47 % | Teilweise implementiert | Host-Key-Pfad, Backup-Ausschluss, restore-geschlossener Boot und Reset-Marker existieren, echte First-Boot-/HA-Validierung fehlt. |

## Pico Link

Geplanter Transport für sichere Kommunikation zwischen Picos, Homes und Relays.

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
- ADR 0080 M2 ist weitgehend als schmaler Runtime-Slice umgesetzt; M3 hat mit `pico_home_membership` und `HomeMembershipReadership` eine erste Projektion, aber keine signierten Member Credentials, Lifecycle-/Eviction-Runtime oder Operator-Konsolidierung.
- Die ADRs sind hilfreich für Richtung und Sicherheitsreihenfolge, gelten aber nicht als Nachweis fertiger Produktfunktionen.

## Änderungen seit der letzten Aktualisierung

- Migration `0014_pico_home_membership` persistiert die aktive `home_host`-Mitgliedschaft des gründenden Pico.
- `POST /api/home/claim` projiziert beim sealed Founding-Abschluss die Home-Host-Membership und Home Reset löscht sie wieder.
- `EventStore.open()` rekonstruiert stale Claim-State und Membership-Projektion aus aktuellem `pico.home.founding-record.v1`.
- `HomeMembershipReadership` verlangt verifizierte Pico-Identität, aktive Home Membership und expliziten Domain-Grant; Membership allein liest keinen Content.
- Tests decken Migration, Store, API und Readership-Seam ab; Core steht bei 211 Tests.

## Nächste Schwerpunkte

1. Signierte Home Membership Credentials inklusive Lifecycle/Eviction speichern und verifizieren.
2. Identity-bound Sessions und Principal-Mapping für Home Host Pico und Home Member Pico anbinden.
3. Explizite Domain-Read-Grants und Envelope-Issuance für Mitgliederdomains vorbereiten.
4. Operator-Konsolidierung unter dem Home Host Pico praktisch umsetzen.
5. Protected-Display-/Setup-UX und echten Home-Assistant-First-Boot-Pfad validieren.

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
