# Pico Entwicklungsfortschritt

## Metadaten

| Feld | Wert |
| --- | --- |
| Letzte Aktualisierung | 2026-07-27 |
| Analysierter Branch | main |
| Analysierter Commit | e84ca6c20c038d033fecea3f589c32c0758b48bf |
| Hinweis | Alle Prozentangaben sind Schätzungen auf Basis des Repository-Stands. |

## Gesamtstatus

- Geschätzter Gesamtfortschritt: ca. 51 %.
- Aktueller Entwicklungsschwerpunkt: Reader-Custody-Owner-/Write-Authority und ein Companion-seitig verschlüsselter Datenpfad, der Raw-KEKs und Klartext strukturell aus Foundation fernhält.
- Wichtigste Fortschritte: Die controller-signierte Host-Custody-Envelope-Issuance samt Storage/Reconciliation sowie identity-root-signierte, höchstens fünf Minuten gültige Reader-Key-Freshness-Checkpoints und deren fail-closed Registry-/Sync-Adapter sind implementiert.
- Wichtigste offene Arbeiten: echter Reader-Custody-Vault-/Companion-Pfad, deployment-spezifischer Checkpoint-Publisher/-Transport, Operator-Konsolidierung, Pico Link/Relay, Vault IPC und Companion-UX.
- Relevante Risiken: Ohne injizierten Checkpoint-Transport bleibt die fertige Host-Custody-Issuance absichtlich `freshness_unavailable`; der heutige Foundation-Memory-Write-Pfad nimmt Klartext an und darf nicht für Reader Custody wiederverwendet werden; Protected Display und die reale Home-Assistant-Installation sind weiterhin nicht praktisch validiert.

## Fortschritt der Pico-Hauptkomponenten

| Pico-Komponente | Fortschritt | Status | Aktueller Stand | Wichtigster nächster Schritt |
| --------------- | ----------: | ------ | --------------- | ---------------------------- |
| Pico Core<br>Lokaler Foundation-Service für APIs, Events, Memory und Home-Betrieb. | 76 % | In Arbeit | Zusätzlich zu Foundation, Auth, Memory und Home-Authority existieren nun controller-signierte Host-Custody-Share-Envelopes und ein Core-eigener signaturprüfender Freshness-Adapter. | Getrennten opaken Reader-Custody-Ciphertext-Ingestion-/Storage-Pfad entwerfen und bauen. |
| Pico Surfaces<br>Benutzeroberflächen für Diagnose, Companion-Interaktion und Alltagsflows. | 38 % | Teilweise implementiert | Das Foundation Web Dashboard bedient lokale Diagnose-, Auth- und Memory-Flows. | Zur ersten clientnahen Companion-Oberfläche ausbauen. |
| Pico Protocol<br>Gemeinsame Typen, kanonische Bytes und Kompatibilitätsgrenzen. | 71 % | In Arbeit | Identity-, Home-, Vault-, Share-v1- und Reader-Key-Freshness-Bytes einschließlich positiver und negativer Vektoren sind testgebunden. | Owner-signierte Reader-Custody-Domain-/Item-Pakete kanonisch definieren. |
| Pico Sync<br>Grundlage für Replikation, Versionierung und Konfliktabgleich. | 30 % | Teilweise implementiert | Lamport-Clock und Version-Vector-Helfer sind vorhanden. | Replikationsprotokoll und reale Client-/Vault-Synchronisation bauen. |
| Pico Identity<br>Identitäts-, Key- und Signaturprüfung für Picos und Devices. | 64 % | In Arbeit | Lifecycle-Evidence, Device-Key-Bindungen und identity-root-signierte Current/Revoked-Freshness-Checkpoints werden verifiziert; lokale Evidence ersetzt nie die externe Abfrage. | Reader-Custody-Owner-/Writer-Authority und später Recovery ergänzen. |
| Pico Vault<br>Lokale Schlüssel-Custody für Person-/Device-Keys und Signaturen. | 56 % | Teilweise implementiert | Encrypted-Keyfile-Runtime kann nun zusätzlich Share-Envelopes und Freshness-Checkpoints ausschließlich mit der `pico_identity`-Rolle signieren. | Reader-Custody-Domain-KEKs und Item-Verschlüsselung im Vault/Companion halten; danach Daemon/IPC ergänzen. |
| Pico Home<br>Lokale Host-Instanz, die Picos aufnimmt, betreibt und verwaltet. | 72 % | In Arbeit | Der Authority-Slice umfasst Founding, Membership, Domain Grants, Reader Keys, signierte Host-Custody-Envelopes und verifizierte externe Freshness. | Reader-Custody-Ciphertext hosten, ohne Klartext- oder KEK-Autorität zu erhalten. |
| Pico Link<br>Geplanter Transport für sichere Kommunikation zwischen Picos und Homes. | 14 % | Konzipiert | Architektur und draft-only Fixtures sind vorhanden, aber keine Transport- oder Relay-Runtime. | Minimales Transport-/Envelope-Runtime erst nach Sicherheitsgates starten. |

## Pico Core

Lokaler Foundation-Service für APIs, Events, Memory, Auth und Pico-Home-Betrieb.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Architektur | 78 % | In Arbeit | Core besitzt klare Store-, Home-Authority-, Session-, Domain-Grant-, Reader-Key-, Freshness- und Share-Envelope-Grenzen. |
| Kernfunktionen | 76 % | In Arbeit | Zusätzlich zu Events, Memory und Home-Lifecycle funktionieren zweiphasige Host-Custody-Envelope-Issuance, Signaturfinalisierung und Reconciliation lokal. |
| Datenhaltung | 82 % | In Arbeit | 19 Migrationen decken Events, Memory, Keys, Authority-Evidence, Reader-Key-Projektionen und konfliktfreie signierte Share-Envelopes ab. |
| Schnittstellen | 74 % | In Arbeit | Lokale APIs umfassen nun zusätzlich host-admin-klassifizierte Prepare-/Finalize-/List-Flows für Share-Envelopes; es gibt bewusst keinen Reader-Transport. |
| Sicherheit und Berechtigungen | 82 % | In Arbeit | Controller- und Freshness-Signaturen, exakte Key-/Grant-Bindung, zweifache Authority-Prüfung, Timeout und bounded Anti-Rollback sind fail-closed implementiert. |
| Tests | 93 % | Weitgehend fertig | Core hat eine breite Unit-, Crypto-, Restore- und API-Testbasis mit 263 Tests. |
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
| Foundation-Typen | 80 % | In Arbeit | Event-, Payload-, Realtime-, Claim-, Membership-, Lifecycle-, Domain-Grant-, Share-Envelope- und Freshness-Typen sind Runtime-Exports. |
| Kanonische Bytes und Vektoren | 87 % | Weitgehend fertig | Memory-AD, Identity, Home, Vault, `pico.suite.share.v1` und Reader-Key-Freshness besitzen autoritative positive und negative Vektoren. |
| Draft-Fixtures | 35 % | Konzipiert | Pico Link, Pico Home Link und Model Delegation besitzen draft-only Fixtures ohne Runtime- oder Kompatibilitätsanspruch. |
| Validierung und Conformance | 64 % | In Arbeit | Protocol-Tests binden Runtime-Exports, ADR-Bytes, Docs und alle autoritativen Fixture-Suiten; ein eigenständiger Conformance-Runner fehlt. |
| Tests | 86 % | Weitgehend fertig | Protocol hat 47 Tests für Exportlisten, Payloads, Validierung und Fixture-Bytegleichheit. |

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
| Architektur | 74 % | In Arbeit | Key-Rollen, Delegation, Revocation, Lifecycle, Reader-Key-Bindung und identity-root-signierte externe Freshness sind abgegrenzt. |
| Kernfunktionen | 72 % | In Arbeit | Zusätzlich zu Fingerprints, Possession und Lifecycle-Projektion werden kanonische Reader-Key-Freshness-Signaturen geprüft. |
| Sicherheit und Berechtigungen | 72 % | In Arbeit | Exakte Home-/Identity-/Device-/Delegation-Bindung, fünf Minuten Gültigkeit, Revocation und Rollback-Grenzen sind implementiert. |
| Integration mit anderen Pico-Komponenten | 67 % | In Arbeit | Core/Home nutzen Identity-Evidence für Sessions, Readership, Reader-Key-Auswahl und zweiphasige Envelope-Issuance. |
| Tests | 84 % | Weitgehend fertig | Identity hat 17 Tests plus autoritative Signature-/Lifecycle-/Freshness-Fixtures; Core ergänzt Transport-, Restore- und Negativfälle. |

## Pico Vault

Lokale Key-Custody-Runtime für Person- und Device-Keys.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Kernfunktionen | 70 % | In Arbeit | Vault kann Person-Keyfiles erzeugen/öffnen, rollenbegrenzt signieren, Claim-, Share-Envelope- und Freshness-Familien bedienen, Sealed Boxes öffnen und verschlüsselt exportieren. |
| Datenhaltung | 52 % | Teilweise implementiert | Keyfiles sind verschlüsselt, KDF-Parameter begrenzt und Datei-/Pfadschutz getestet, aber noch kein dauerhafter Vault-Dienst. |
| Sicherheit und Berechtigungen | 68 % | In Arbeit | Argon2id, XChaCha20-Poly1305, Rollen-/Label-Checks, Identity-root-only Envelope/Freshness-Signaturen, Auto-Lock, Zeroization und Pfadtrennung sind vorhanden. |
| Integration mit anderen Pico-Komponenten | 45 % | Teilweise implementiert | Vault kann Claim-, Envelope- und Freshness-Ceremonies kryptographisch bedienen, ist aber noch nicht als Daemon/IPC integriert. |
| Installation und Betrieb | 10 % | Konzipiert | Platform-Keystore, Daemon/IPC, Recovery und Approval-UX fehlen. |
| Tests | 82 % | Weitgehend fertig | Vault hat 10 Real-Crypto-Tests für Keyfile, Rollen, Envelope-/Freshness-Signaturen, KDF-Grenzen, Locking und Pfadtrennung. |

## Pico Home

Lokale Host-Instanz für Claim, Mitgliedschaft, Betrieb und Verwaltung eines Pico Homes.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Architektur | 77 % | In Arbeit | Home Host, Claim/Founding, Membership, Domain Grants, Reader Keys, externe Freshness und Controller-Envelope-Authority sind abgegrenzt. |
| Kernfunktionen | 76 % | In Arbeit | Zusätzlich zu Home-Lifecycle und Domain Readership funktionieren Host-Custody-Envelope-Vorbereitung, Vault-Signaturfinalisierung und Reconciliation. |
| Schnittstellen | 72 % | In Arbeit | Claim-, Membership-, Grant-, Identity-Session- und host-admin-geschützte Envelope-Flows existieren als klassifizierte lokale APIs. |
| Datenhaltung | 78 % | In Arbeit | Authority-Evidence, Reader-Key-Projektionen und signierte Share-Envelopes werden konfliktfrei persistiert und nach Boot/Lifecycle/Shred reconciled. |
| Sicherheit und Berechtigungen | 82 % | In Arbeit | Reads und Envelope-Issuance verlangen getrennte aktive Authorities; Operator, Home Host, Identity, Reader und Registry-/Sync-Transport bleiben getrennt. |
| Tests | 90 % | Weitgehend fertig | Core deckt Home-Ceremonies, Envelope-Tamper, Authority, Freshness, Revocation, Restore, Cross-Key-Swaps und Read-Denials ab. |
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

- Es gibt 85 nummerierte ADRs sowie eine Implementation-Status-Matrix.
- Wichtige getroffene Entscheidungen betreffen Foundation-Grenzen, lokale Authentifizierung, Memory-Verschlüsselung, Identity/Vault-Custody, Home Authority, Domain Readership und Reader-Key-/Envelope-Gates.
- Viele ADRs laufen der Implementierung voraus: Pico Link, Relay, Pico Rules, Action Runner, Action History, Companion-UX und große Home-Mitgliedschaftsflüsse sind überwiegend konzipiert.
- ADR 0080 M2/M3 besitzen Claim/Founding sowie signierte Membership-Credential-, Activation- und Lifecycle/Eviction-Runtime; ADR 0082 schließt Identity Sessions und Domain Read Grants, ADR 0083 die Reader-Key-Registrierung, ADR 0084 die Host-Custody-Envelope-Runtime und ADR 0085 die authentisierte Freshness-Prüfung.
- Die ADRs sind hilfreich für Richtung und Sicherheitsreihenfolge, gelten aber nicht als Nachweis fertiger Produktfunktionen.

## Änderungen seit der letzten Aktualisierung

- ADR 0084 implementiert die zweiphasige Host-Custody-Envelope-Issuance: Core sealed den bestehenden KEK zum exakten Reader Key, ein externer Identity-Vault signiert, Finalisierung prüft alle Authorities erneut.
- Signierte `pico.share.envelope-record.v1`-Datensätze sind konfliktfrei, idempotent, boot-/lifecycle-/shred-reconciled und nur über `host-admin` sichtbar.
- ADR 0085 definiert kanonische identity-root-signierte Current/Revoked-Freshness-Checkpoints; Registry/Sync transportiert sie, erhält aber keine Identity-Authority.
- Core erzwingt exakte Home-/Identity-/Device-/Delegation-Bindung, maximal fünf Minuten Gültigkeit, fünf Sekunden Lookup-Timeout, bounded Anti-Rollback und kein stale-while-error.
- Der vollständige Gate besteht mit 382 Tests: Core 263, Protocol 47, Web 34, Identity 17, Sync 11 und Vault 10.

## Nächste Schwerpunkte

1. In ADR 0086 die owner-signierte Reader-Custody-Domain-/Write-Authority und kanonische verschlüsselte Item-Pakete festlegen.
2. Den Vault-/Companion-Pfad für Reader-Custody-Domain-KEKs, Item-Verschlüsselung und owner-signierte Share-Envelopes bauen.
3. Einen getrennten Core-Pfad zur Ingestion und Speicherung opaker Reader-Custody-Ciphertext-Pakete bauen, ohne Klartext oder Raw-KEK im Foundation-Prozess.
4. Foundation Operator unter Home-Host-Pico-Autorität konsolidieren, ohne eine zweite Root-Autorität zu erzeugen.
5. Checkpoint-/Envelope-Transport, Vault IPC, Protected-Display-/Setup-UX, Home-Assistant-First-Boot und anschließend Pico Link praktisch validieren.

Empfehlung für den nächsten Block:

- Codex: `gpt-5.6-sol + xhigh`
- Erwarteter Umfang: etwa 8–12 Personentage

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
