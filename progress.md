# Pico Entwicklungsfortschritt

## Metadaten

| Feld | Wert |
| --- | --- |
| Letzte Aktualisierung | 2026-07-27 |
| Analysierter Branch | main |
| Analysierter Commit | 09241027d2c5f1647b078424f9d7f269e0156320 |
| Hinweis | Alle Prozentangaben sind Schätzungen auf Basis des Repository-Stands. |

## Gesamtstatus

- Geschätzter Gesamtfortschritt: ca. 49 %.
- Aktueller Entwicklungsschwerpunkt: mehrprincipalige Home-Authority, Identity-/Reader-Key-Freshness und die Vorbereitung der `pico.suite.share.v1` Envelope-Runtime.
- Wichtigste Fortschritte: Signierte Membership Credentials und Lifecycle/Eviction, possession-bound Identity Sessions, signierte Domain-Read-Grants sowie exakte Reader-Key-Registrierung und fail-closed Freshness-Auswahl sind implementiert.
- Wichtigste offene Arbeiten: authentisierter Registry-/Sync-Freshness-Adapter, controller-signierte Envelope-Issuance/Storage, echter Reader-Custody-Datenpfad, Operator-Konsolidierung, Pico Link/Relay und Companion-UX.
- Relevante Risiken: Ohne externe Freshness-Quelle bleibt Envelope-Auswahl absichtlich gesperrt; Controller-Signaturen dürfen nicht durch Foundation-Autorität ersetzt werden; Protected Display und die reale Home-Assistant-Installation sind weiterhin nicht praktisch validiert.

## Fortschritt der Pico-Hauptkomponenten

| Pico-Komponente | Fortschritt | Status | Aktueller Stand | Wichtigster nächster Schritt |
| --------------- | ----------: | ------ | --------------- | ---------------------------- |
| Pico Core<br>Lokaler Foundation-Service für APIs, Events, Memory und Home-Betrieb. | 73 % | In Arbeit | Foundation-Service mit HTTP/WebSocket, SQLite, Auth, Memory, Retention, Home-Authority, Identity Sessions, Domain Grants und Reader-Key-Projektion ist lokal nutzbar. | Controller-signierte Share-v1-Envelope-Issuance und konfliktfreien Storage bauen. |
| Pico Surfaces<br>Benutzeroberflächen für Diagnose, Companion-Interaktion und Alltagsflows. | 38 % | Teilweise implementiert | Das Foundation Web Dashboard bedient lokale Diagnose-, Auth- und Memory-Flows. | Zur ersten clientnahen Companion-Oberfläche ausbauen. |
| Pico Protocol<br>Gemeinsame Typen, kanonische Bytes und Kompatibilitätsgrenzen. | 68 % | In Arbeit | Identity-, Home-, Vault- und Share-v1-Bytes einschließlich Membership, Domain Grants und Envelope-Bindungen sind testgebunden. | Share-v1-Builder in die signierte Issuance-Runtime integrieren und Conformance ausbauen. |
| Pico Sync<br>Grundlage für Replikation, Versionierung und Konfliktabgleich. | 30 % | Teilweise implementiert | Lamport-Clock und Version-Vector-Helfer sind vorhanden. | Replikationsprotokoll und reale Client-/Vault-Synchronisation bauen. |
| Pico Identity<br>Identitäts-, Key- und Signaturprüfung für Picos und Devices. | 60 % | In Arbeit | Core persistiert verifizierte Lifecycle-Evidence, bindet Signing- und X25519-Device-Keys an Sessions und verlangt externe Freshness für Reader-Key-Auswahl. | Konkreten authentisierten Registry-/Sync-Freshness-Adapter und Recovery ergänzen. |
| Pico Vault<br>Lokale Schlüssel-Custody für Person-/Device-Keys und Signaturen. | 52 % | Teilweise implementiert | Encrypted-Keyfile-Runtime mit rollenbegrenzter Signatur, Claim-Familien, Unwrap, KDF-Grenzen und Auto-Lock existiert. | Daemon/IPC, Platform-Keystore und Controller-Signatur-Ceremony integrieren. |
| Pico Home<br>Lokale Host-Instanz, die Picos aufnimmt, betreibt und verwaltet. | 68 % | In Arbeit | Founding, signierte Membership/Lifecycle-Evidence, Identity Sessions, Domain Grants und Reader-Key-Bindungen bilden einen getesteten Authority-Slice. | Share-v1-Envelopes unter Vault-signierter Controller-Autorität ausstellen und speichern. |
| Pico Link<br>Geplanter Transport für sichere Kommunikation zwischen Picos und Homes. | 14 % | Konzipiert | Architektur und draft-only Fixtures sind vorhanden, aber keine Transport- oder Relay-Runtime. | Minimales Transport-/Envelope-Runtime erst nach Sicherheitsgates starten. |

## Pico Core

Lokaler Foundation-Service für APIs, Events, Memory, Auth und Pico-Home-Betrieb.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Architektur | 75 % | In Arbeit | Core besitzt klare Store-, Home-Authority-, Session-, Domain-Grant-, Reader-Key- und API-Grenzen. |
| Kernfunktionen | 73 % | In Arbeit | Events, Realtime, Memory, Retention, Crypto-Shred, Home-Lifecycle, Identity Sessions und Domain Readership funktionieren lokal. |
| Datenhaltung | 78 % | In Arbeit | 18 Migrationen decken Events, Memory, Keys, Operator, Founding, signierte Membership/Lifecycle-/Grant-Evidence und Reader-Key-Projektionen ab. |
| Schnittstellen | 70 % | In Arbeit | Lokale HTTP/WebSocket-APIs umfassen Setup/Claim, Membership-/Grant-Relay, Identity Challenges/Sessions und geschützte Domain Reads. |
| Sicherheit und Berechtigungen | 76 % | In Arbeit | Typisierte Sessions, dynamische Membership-/Delegation-/Grant-Prüfung, getrennte Authority-Pfade und fail-closed Reader-Key-Freshness sind implementiert. |
| Tests | 91 % | Weitgehend fertig | Core hat eine breite Unit-, Crypto-, Restore- und API-Testbasis mit 249 Tests. |
| Installation und Betrieb | 61 % | Teilweise implementiert | Zweistufiges Image ohne Build-Werkzeuge und ohne lokale Daten, CI-Smokes, Add-on-Metadaten, Host-Key-Backup-Ausschluss und restore-geschlossener Boot existieren, reale HA-Validierung bleibt offen. |

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
| Foundation-Typen | 78 % | In Arbeit | Event-, Payload-, Realtime-, Claim-, Membership-, Lifecycle- und Domain-Grant-Typen sind als Runtime-Exports vorhanden. |
| Kanonische Bytes und Vektoren | 82 % | Weitgehend fertig | Memory-AD, Identity, Home, Vault und `pico.suite.share.v1` besitzen autoritative positive und negative Vektoren. |
| Draft-Fixtures | 35 % | Konzipiert | Pico Link, Pico Home Link und Model Delegation besitzen draft-only Fixtures ohne Runtime- oder Kompatibilitätsanspruch. |
| Validierung und Conformance | 58 % | In Arbeit | Protocol-Tests binden Runtime-Exports, Docs und die autoritativen Fixture-Suiten; ein eigenständiger Conformance-Runner fehlt. |
| Tests | 82 % | Weitgehend fertig | Protocol hat 44 Tests für Exportlisten, Payloads, Validierung und Fixture-Bytegleichheit. |

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
| Architektur | 68 % | In Arbeit | Key-Rollen, Delegation, Revocation, Lifecycle, Reader-Key-Bindung und lokale/externe Freshness-Grenze sind abgegrenzt. |
| Kernfunktionen | 68 % | In Arbeit | Fingerprints, Possession, Ed25519-Signaturen, Delegation, Revocation und deterministische Lifecycle-Projektion werden geprüft. |
| Sicherheit und Berechtigungen | 64 % | In Arbeit | Issuer-/Scope-/Zeitbindung, terminale Identity-Key-Revocation, Restore-Reconciliation und fail-closed Freshness-Auswahl existieren. |
| Integration mit anderen Pico-Komponenten | 58 % | In Arbeit | Core/Home nutzen Identity-Evidence für Sessions, Membership-Readership und Reader-Key-Vorauswahl. |
| Tests | 78 % | Weitgehend fertig | Identity hat 16 Tests plus autoritative Signature-/Lifecycle-Fixtures; Core ergänzt Integrations- und Negativfälle. |

## Pico Vault

Lokale Key-Custody-Runtime für Person- und Device-Keys.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Kernfunktionen | 64 % | In Arbeit | Vault kann Person-Keyfiles erzeugen/öffnen, rollenbegrenzt signieren, Claim-Familien bedienen, Sealed Boxes öffnen und verschlüsselt exportieren. |
| Datenhaltung | 52 % | Teilweise implementiert | Keyfiles sind verschlüsselt, KDF-Parameter begrenzt und Datei-/Pfadschutz getestet, aber noch kein dauerhafter Vault-Dienst. |
| Sicherheit und Berechtigungen | 60 % | In Arbeit | Argon2id, XChaCha20-Poly1305, Rollen-/Label-Checks, Auto-Lock, Zeroization und Pfadtrennung sind vorhanden. |
| Integration mit anderen Pico-Komponenten | 32 % | Teilweise implementiert | Vault kann die Claim-Signaturfamilien bedienen, ist aber noch nicht als Daemon/IPC in Home-, Membership- oder Envelope-Flows integriert. |
| Installation und Betrieb | 10 % | Konzipiert | Platform-Keystore, Daemon/IPC, Recovery und Approval-UX fehlen. |
| Tests | 75 % | In Arbeit | Vault hat 8 Real-Crypto-Tests für Keyfile, Rollen, KDF-Grenzen, Locking und Pfadtrennung. |

## Pico Home

Lokale Host-Instanz für Claim, Mitgliedschaft, Betrieb und Verwaltung eines Pico Homes.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Architektur | 72 % | In Arbeit | Home Host, Claim/Founding, signierte Membership/Lifecycle-Evidence, Identity Sessions, Domain Grants und Reader-Key-Authority sind abgegrenzt. |
| Kernfunktionen | 70 % | In Arbeit | Setup, sealed Claim, Founding, Membership Credentials, Activation, Lifecycle/Eviction, Identity Sessions und Domain Readership funktionieren. |
| Schnittstellen | 65 % | In Arbeit | Claim-, Membership-/Lifecycle-, Domain-Grant- und Identity-Session-Flows existieren als klassifizierte lokale APIs. |
| Datenhaltung | 72 % | In Arbeit | Founding, signierte Membership-/Lifecycle-/Identity-/Grant-Evidence und Reader-Key-Projektionen werden konfliktfrei persistiert und reconciled. |
| Sicherheit und Berechtigungen | 75 % | In Arbeit | Founding ist einzige Ownership-Evidence; Reads verlangen Identity Session, aktive Membership und aktiven signierten Domain Grant; Reader-Key-Auswahl verlangt zusätzlich Freshness. |
| Tests | 85 % | Weitgehend fertig | Core deckt Home-Ceremonies, Authority, Revocation, Restore, Cross-Key-Swaps und nicht-enumerierende Read-Denials ab. |
| Installation und Betrieb | 48 % | Teilweise implementiert | Host-Key-Pfad, Backup-Ausschluss, restore-geschlossener Boot und Reset-Marker existieren, echte First-Boot-/HA-Validierung fehlt. |

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

- Es gibt 83 nummerierte ADRs sowie eine Implementation-Status-Matrix.
- Wichtige getroffene Entscheidungen betreffen Foundation-Grenzen, lokale Authentifizierung, Memory-Verschlüsselung, Identity/Vault-Custody, Home Authority, Domain Readership und Reader-Key-/Envelope-Gates.
- Viele ADRs laufen der Implementierung voraus: Pico Link, Relay, Pico Rules, Action Runner, Action History, Companion-UX und große Home-Mitgliedschaftsflüsse sind überwiegend konzipiert.
- ADR 0080 M2/M3 besitzen Claim/Founding sowie signierte Membership-Credential-, Activation- und Lifecycle/Eviction-Runtime; ADR 0082 schließt Identity Sessions und Domain Read Grants, ADR 0083 die Reader-Key-/Freshness-Voraussetzung.
- Die ADRs sind hilfreich für Richtung und Sicherheitsreihenfolge, gelten aber nicht als Nachweis fertiger Produktfunktionen.

## Änderungen seit der letzten Aktualisierung

- Signierte Home Membership Credentials, Host-Activation und Lifecycle/Eviction werden persistiert, verifiziert, projiziert und nach Restore reconciled.
- Possession-bound Pico Identity Sessions prüfen Delegation/Revocation dynamisch und bilden zusammen mit aktiver Membership und signiertem Domain Grant den Claimed-Home-Read-Pfad.
- Home-Host-Pico-signierte Domain-Read-Grants und Revocations für bestehende `host_custody`-Domains sind konfliktfrei, restore-sicher und content-frei auditiert.
- `pico.suite.share.v1` besitzt kanonische Wrap-/Envelope-Bytes mit Host-, Issuer-, Reader-, Version- und Wrap-Digest-Bindung sowie autoritative Negativvektoren.
- ADR 0083 bindet den echten X25519-Reader-Key an Identity Session und Delegation; Auswahl verlangt externe, höchstens fünf Minuten gültige Freshness. Der vollständige Gate besteht mit 362 Tests.

## Nächste Schwerpunkte

1. Controller-signierte `pico.suite.share.v1` Envelope-Issuance und konfliktfreien Storage zunächst für bestehende `host_custody`-Domains implementieren.
2. Einen konkret authentisierten Registry-/Sync-Adapter für den Reader-Key-Freshness-Vertrag anbinden; ohne ihn bleibt Issuance fail-closed.
3. Danach den echten `reader_custody` Vault-/Companion-Datenpfad bauen, ohne Raw-KEKs durch Foundation zu führen.
4. Foundation Operator unter Home-Host-Pico-Autorität konsolidieren, ohne eine zweite Root-Autorität zu erzeugen.
5. Protected-Display-/Setup-UX, Home-Assistant-First-Boot und anschließend Pico-Link-/Sync-Transport praktisch validieren.

Empfehlung für den nächsten Block:

- Codex: `gpt-5.6-sol + xhigh`
- Erwarteter Umfang: etwa 6–9 Personentage

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
