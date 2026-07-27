# Pico Entwicklungsfortschritt

## Metadaten

| Feld | Wert |
| --- | --- |
| Letzte Aktualisierung | 2026-07-27 |
| Analysierter Branch | main |
| Analysierter Commit | c7cf9fb53570bce11a4ef05fe88d514858addb6d |
| Hinweis | Alle Prozentangaben sind Schätzungen auf Basis des Repository-Stands. |

## Gesamtstatus

- Geschätzter Gesamtfortschritt: ca. 54 %.
- Aktueller Entwicklungsschwerpunkt: Die Reader-Custody- und Home-Authority-Grenzen sind für den ersten Owner-/Writer-Slice geschlossen; als Nächstes fehlen zusätzliche Reader und versionierte KEK-Rotation.
- Wichtigste Fortschritte: ADR 0086 hält Reader-Custody-Klartext und Raw-KEKs aus Foundation heraus. ADR 0087 bindet den lokalen Operator exakt an Home, Founding und Host-Key-Custody und trennt lokale Host-Administration von signierter Home-Authority.
- Wichtigste offene Arbeiten: Multi-Reader-Envelopes und KEK-Rotation, Checkpoint-/Envelope-Transport, Vault-Daemon/IPC, Pico Link sowie Companion-, Recovery- und Installations-UX.
- Relevante Risiken: Ohne externen Checkpoint-Publisher bleibt Reader-Key-Freshness absichtlich nicht verfügbar; Reader-Custody besitzt noch keine sichere Rotation nach Revocation; Protected Display und die reale Home-Assistant-Installation sind weiterhin nicht praktisch validiert.

## Fortschritt der Pico-Hauptkomponenten

| Pico-Komponente | Fortschritt | Status | Aktueller Stand | Wichtigster nächster Schritt |
| --------------- | ----------: | ------ | --------------- | ---------------------------- |
| Pico Core<br>Lokaler Foundation-Service für APIs, Events, Memory und Home-Betrieb. | 80 % | In Arbeit | Core persistiert und prüft opake Reader-Custody-Evidence und Ciphertext-Pakete; Operator-Sessions sind founding-genau gebunden und Home-Routen als signierte Authority-Relays klassifiziert. | Versionierte Multi-Reader-Envelopes und KEK-Rotation prüfen, speichern und reconciliieren. |
| Pico Surfaces<br>Benutzeroberflächen für Diagnose, Companion-Interaktion und Alltagsflows. | 38 % | Teilweise implementiert | Das Foundation Web Dashboard bedient lokale Diagnose-, Auth- und Memory-Flows. | Nach stabiler Reader-/Rotationssemantik eine erste Companion-nahe Oberfläche bauen. |
| Pico Protocol<br>Gemeinsame Typen, kanonische Bytes und Kompatibilitätsgrenzen. | 74 % | In Arbeit | Identity-, Home-, Vault-, Share-v1- und Reader-Custody-Familien sind mit autoritativen Vektoren testgebunden. | Zusätzliche Reader, versionierte KEK-Envelopes und Rotation kanonisch definieren. |
| Pico Sync<br>Grundlage für Replikation, Versionierung und Konfliktabgleich. | 30 % | Teilweise implementiert | Lamport-Clock und Version-Vector-Helfer sind vorhanden. | Authentisierten Checkpoint-/Envelope-Transport und reale Client-/Vault-Synchronisation bauen. |
| Pico Identity<br>Identitäts-, Key- und Signaturprüfung für Picos und Devices. | 66 % | In Arbeit | Lifecycle-Evidence, Reader-Key-Freshness sowie Owner-/Writer-Authority werden signatur- und bindungsgenau geprüft. | Zusätzliche Reader, Rotation und Recovery-Evidence ergänzen. |
| Pico Vault<br>Lokale Schlüssel-Custody für Person-/Device-Keys und Signaturen. | 62 % | In Arbeit | Vault erzeugt und unwrappt Reader-Custody-KEKs transient und verschlüsselt Items mit separaten DEKs, ohne Foundation Schlüsselmaterial zu geben. | Versionierte KEKs an mehrere Reader ausgeben und nach Revocation rotieren; danach Daemon/IPC ergänzen. |
| Pico Home<br>Lokale Host-Instanz, die Picos aufnimmt, betreibt und verwaltet. | 77 % | In Arbeit | Founding, Membership, Grants, Reader Keys, opake Reader-Custody und founding-genaue Operator-/Relay-Grenzen sind implementiert. | Owner-signierte Multi-Reader- und Rotations-Evidence als opakes Authority-Relay hosten. |
| Pico Link<br>Geplanter Transport für sichere Kommunikation zwischen Picos und Homes. | 14 % | Konzipiert | Architektur und draft-only Fixtures sind vorhanden, aber keine Transport- oder Relay-Runtime. | Minimale Transport-/Envelope-Runtime erst nach den Reader-Rotationsgates starten. |

## Pico Core

Lokaler Foundation-Service für APIs, Events, Memory, Auth und Pico-Home-Betrieb.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Architektur | 83 % | In Arbeit | Store-, Session-, Home-Authority-, Reader-Custody- und Relay-Grenzen sind explizit und fail-closed getrennt. |
| Kernfunktionen | 81 % | In Arbeit | Events, Memory, Home-Lifecycle, signierte Share-Envelopes und opake Reader-Custody-Domain-/Writer-/Item-Flows funktionieren lokal. |
| Datenhaltung | 86 % | In Arbeit | Die unveröffentlichte Historie ist in `0001_initial_schema` konsolidiert; `0002` ergänzt die additive Operator-Home-Bindung. |
| Schnittstellen | 79 % | In Arbeit | Lokale APIs unterscheiden Host-Infrastruktur von `home-authority-relay`; Reader-Transport existiert bewusst noch nicht. |
| Sicherheit und Berechtigungen | 88 % | In Arbeit | Exakte Founding-/Host-Key-/Session-Bindung, signierte Authorities, Freshness, Revocation und opake Custody sind fail-closed testgebunden. |
| Tests | 95 % | Weitgehend fertig | Core hat 271 Unit-, Crypto-, Restore-, Authority- und API-Tests. |
| Installation und Betrieb | 61 % | Teilweise implementiert | Zweistufiges Image, CI-Smokes, Add-on-Metadaten, Backup-Ausschlüsse und restore-geschlossener Boot existieren; reale HA-Validierung bleibt offen. |

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

Gemeinsames Paket für Protocol-Typen, kanonische Bytes und Kompatibilitätsgrenzen.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Foundation-Typen | 82 % | In Arbeit | Event-, Identity-, Home-, Share-, Freshness- und Reader-Custody-Typen sind Runtime-Exports. |
| Kanonische Bytes und Vektoren | 90 % | Weitgehend fertig | Memory-AD, Identity, Home, Vault, Share-v1 und vier Reader-Custody-Familien besitzen autoritative positive und negative Vektoren. |
| Draft-Fixtures | 35 % | Konzipiert | Pico Link, Pico Home Link und Model Delegation besitzen draft-only Fixtures ohne Runtime- oder Kompatibilitätsanspruch. |
| Validierung und Conformance | 68 % | In Arbeit | Protocol-Tests binden Runtime-Exports, ADR-Bytes, Docs und Fixture-Suiten; ein eigenständiger Conformance-Runner fehlt. |
| Tests | 88 % | Weitgehend fertig | Protocol hat 46 Runner-Tests für Exportlisten, Payloads, Validierung und Fixture-Bytegleichheit. |

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
| Architektur | 77 % | In Arbeit | Key-Rollen, Delegation, Revocation, Lifecycle, Reader-Key-Freshness und Reader-Custody-Owner-/Writer-Authority sind abgegrenzt. |
| Kernfunktionen | 75 % | In Arbeit | Fingerprints, Possession, Lifecycle, Freshness sowie Owner-/Writer-Signaturen werden kanonisch geprüft. |
| Sicherheit und Berechtigungen | 77 % | In Arbeit | Exakte Home-/Identity-/Device-/Delegation-Bindung, Gültigkeit, Revocation und Rollback-Grenzen sind implementiert. |
| Integration mit anderen Pico-Komponenten | 72 % | In Arbeit | Core, Home und Vault nutzen Identity-Evidence für Sessions, Readership, Reader-Custody und Envelope-Issuance. |
| Tests | 86 % | Weitgehend fertig | Identity hat 17 Tests plus autoritative Signature-, Lifecycle- und Freshness-Fixtures; Core ergänzt Integrations- und Negativfälle. |

## Pico Vault

Lokale Key-Custody-Runtime für Person- und Device-Keys.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Kernfunktionen | 78 % | In Arbeit | Vault erzeugt/öffnet Keyfiles, signiert rollenbegrenzt, verwaltet transiente Reader-Custody-KEKs und verschlüsselt Items mit frischen DEKs und Nonces. |
| Datenhaltung | 55 % | Teilweise implementiert | Keyfiles sind verschlüsselt und Pfade geschützt; dauerhafter Vault-Dienst und versionierte Multi-Reader-Custody fehlen. |
| Sicherheit und Berechtigungen | 76 % | In Arbeit | Argon2id, XChaCha20-Poly1305, Rollen-/Label-Checks, Sealed Boxes, Auto-Lock, Zeroization und strikte Custody-Grenzen sind vorhanden. |
| Integration mit anderen Pico-Komponenten | 55 % | Teilweise implementiert | Vault bedient Claim-, Envelope-, Freshness- und Reader-Custody-Ceremonies kryptographisch, aber noch nicht als Daemon/IPC. |
| Installation und Betrieb | 10 % | Konzipiert | Platform-Keystore, Daemon/IPC, Recovery und Approval-UX fehlen. |
| Tests | 88 % | Weitgehend fertig | Vault hat 11 Real-Crypto-Tests für Keyfiles, Rollen, Envelopes, Freshness, Reader-Custody, Locking und Pfadtrennung. |

## Pico Home

Lokale Host-Instanz für Claim, Mitgliedschaft, Betrieb und Verwaltung eines Pico Homes.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Architektur | 84 % | In Arbeit | Home Host, Claim/Founding, Membership, Grants, Reader-Custody sowie lokale Operator- und signierte Relay-Authority sind abgegrenzt. |
| Kernfunktionen | 82 % | In Arbeit | Home-Lifecycle, Share-Envelopes, opake Reader-Custody und founding-genaue Operator-Bindung funktionieren lokal. |
| Schnittstellen | 80 % | In Arbeit | Home-Routen verlangen ein autorisiertes Relay; Handler prüfen weiterhin Controller-, Owner- oder Writer-Signaturen als eigentliche Authority. |
| Datenhaltung | 83 % | In Arbeit | Authority-Evidence, Reader-Projektionen, opake Custody-Datensätze und Operator-Home-Bindung werden persistiert und reconciliert. |
| Sicherheit und Berechtigungen | 90 % | In Arbeit | Operator, Home Host, Identity, Reader und Registry bleiben getrennt; Claim, Reset, Restore und fehlende Host-Key-Custody schließen fail-closed. |
| Tests | 95 % | Weitgehend fertig | Core deckt Home-Ceremonies, Confused Deputy, Binding, Tamper, Revocation, Restore, Reset und Cross-Key-Swaps ab. |
| Installation und Betrieb | 50 % | Teilweise implementiert | Host-Key-Pfad, Backup-Ausschluss, restore-geschlossener Boot und Reset-Marker existieren; echte First-Boot-/HA-Validierung fehlt. |

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

- Es gibt 87 nummerierte ADRs sowie eine Implementation-Status-Matrix.
- Wichtige Entscheidungen betreffen Foundation-Grenzen, lokale Authentifizierung, Memory-Verschlüsselung, Identity/Vault-Custody, Home Authority, Domain Readership und Reader-Custody.
- ADR 0086 implementiert einen owner-rooted Reader-Custody-Slice mit transientem KEK, exakter Writer-Authority und opaken Item-Paketen.
- ADR 0087 bindet Operator-Credentials und Sessions exakt an Founding und Host-Key-Custody; lokale Host-Infrastruktur bleibt von signierter Home-Governance getrennt.
- Viele Produkt- und Transport-ADRs laufen der Implementierung voraus: Pico Link, Relay, Rules, Action Runner, Companion-UX und große Home-Mitgliedschaftsflüsse sind überwiegend konzipiert.

## Änderungen seit der letzten Aktualisierung

- ADR 0086 ergänzt owner-signierte Domain-/Writer-Authority, versionierte kanonische Bytes und einen vollständig opaken Reader-Custody-Ingestion-/Storage-Pfad.
- Vault hält Reader-Custody-KEKs transient, sealed sie zum Owner Reader Key und verschlüsselt jedes Item mit frischem DEK und Nonces.
- ADR 0087 bindet Operator und Session exakt an Home, Founding und Host-Signing-Key; Claim, Restore, Home Reset und fehlende Key-Custody sind fail-closed.
- Home-Governance-Routen sind jetzt `home-authority-relay`: nur der exakt gebundene Operator oder die aktive Home-Host-Pico-Identität darf signierte Authority weiterreichen; gewöhnliche Mitglieder werden abgewiesen.
- Die Pre-Release-Migrationen sind auf `0001` plus additive `0002` konsolidiert; der vollständige Gate besteht mit 390 Tests: Core 271, Protocol 46, Web 34, Identity 17, Sync 11 und Vault 11.

## Nächste Schwerpunkte

1. In ADR 0088 zusätzliche Reader, exakte Envelope-Authority und versionierte KEK-Rotation nach Revocation festlegen.
2. Vault und Core für KEK `n+1`, Envelopes der verbleibenden Reader und fail-closed Restore-/Rollback-Reconciliation erweitern.
3. Deployment-spezifischen Freshness-/Envelope-Transport und danach reader-seitige Synchronisation implementieren.
4. Vault-Daemon/IPC, Platform-Keystore, Approval-/Recovery-UX sowie Protected-Display-/Home-Assistant-First-Boot praktisch validieren.
5. Pico Link erst auf den stabilen signierten Authority- und Custody-Grenzen aufbauen.

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
