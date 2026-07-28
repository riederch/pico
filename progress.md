# Pico Entwicklungsfortschritt

## Metadaten

| Feld | Wert |
| --- | --- |
| Standdatum | 2026-07-28 |
| Analysierter Branch | main |
| Analysierter Commit | 5e8c0431ebb1c0e3c4f0978d7bf1841a61a71f18 |
| Hinweis | Alle Prozentangaben sind Schätzungen auf Basis des Repository-Stands. |

## Gesamtstatus

- Geschätzter Gesamtfortschritt: ca. 65 %.
- Nachgewiesener Funktionsumfang: lokale Foundation-APIs und Events, Memory-Verschlüsselung, Home-Claim/Founding/Membership, identity-gebundene Sessions, Reader-Key-Registrierung und Freshness, Host- und Reader-Custody, Multi-Reader-Envelopes, revocation-gekoppelte KEK-Rotation, authentifizierter Reader-Sync mit dauerhaftem Floor, begrenztem Lauf, privater Pending-Inbox und privatem Projektionsarchiv sowie ein deploybarer lokaler Vault-Daemon mit CLI, Reader-Zugriff, Approval und daemon-seitigen Ceremonies.
- Sicherheitsstand: Foundation Operator, Home Host, Identity, Domain Owner, Reader, Writer, Vault und Transport bleiben getrennte Authorities. Raw-KEKs, Raw-DEKs und Reader-Custody-Klartext verlassen Vault nicht. Reader- und Owner-Key-Agreement-Privatschlüssel existieren für den Reader- und Grant-Pfad nicht mehr in Konsumentenprozessen.
- Offene Produkt- und Betriebsflächen: produktseitige Nutzung der Vault-Daemon-Kette, deployte Netzwerkadapter, Platform-Keystore, Recovery, Paketierung/Autostart des Daemons, macOS- und Windows-Transport, Rendering der Approval-Inhalte, Protected Display, reale Home-Assistant-Installation, Companion-UX, Pico Rules, Action Runner und Pico Link.
- Relevante Grenzen: Der Core-Default bleibt ohne injizierten Checkpoint-Transport `freshness_unavailable`; Relay-Cursor besitzen keine Authority; Projection-Consumer müssen ihre Effekte selbst dauerhaft und idempotent annehmen; die Reader-Dateistores setzen einen aktiven Writer voraus; vollständige passende Client- oder Operator-Backups können ohne externen monotonen Anker ihren damaligen Stand wiederherstellen; bereits erhaltene KEK-Versionen sind durch spätere Revocation nicht rückwirkend entziehbar; die Daemon-Grenze schützt nicht gegen Malware, die die Sitzung der Person bereits besitzt, und die Person sieht bei Approvals Familie, Schlüssel und Digest statt eines gerenderten Satzes.
- Verifizierter Gate: `pnpm release:verify` besteht mit 458 Tests — Core 273, Protocol 47, Vault-Daemon 48, Web 34, Sync 26, Identity 17 und Vault 13.

## Fortschritt der Pico-Hauptkomponenten

| Pico-Komponente | Fortschritt | Status | Nachgewiesener Stand | Verbleibende Lücken |
| --------------- | ----------: | ------ | ------------------- | ------------------- |
| Pico Core<br>Lokaler Foundation-Service für APIs, Events, Memory und Home-Betrieb. | 82 % | In Arbeit | Core persistiert und reconciliiert signierte Home-, Reader-, Writer-, Rotation- und opake Item-Evidence; Sessions und Authority-Relays sind founding-genau gebunden. | Produktionsbetrieb, dauerhafte externe Freshness-Anbindung, automatische Abläufe, vollständige Policy-/Action-Schicht und reale HA-Installation. |
| Pico Surfaces<br>Benutzeroberflächen für Diagnose, Companion-Interaktion und Alltagsflows. | 38 % | Teilweise implementiert | Das frameworkfreie Foundation Web Dashboard bedient lokale Diagnose-, Auth-, Retention-, Shred- und Memory-Flows. | Companion-UX, Voice, reichere Avatar-Zustände, mobile Oberflächen, Consent- und Recovery-Flows. |
| Pico Protocol<br>Gemeinsame Typen, kanonische Bytes und Kompatibilitätsgrenzen. | 79 % | In Arbeit | Identity-, Home-, Vault-, Share-v1-, Reader-Custody- und Sync-Manifest-Familien sind mit autoritativen positiven und negativen Vektoren testgebunden. | Eigenständiger Conformance-Runner, veröffentlichte Pico-Link-Semantik, Capability Negotiation und Kompatibilitätszertifizierung. |
| Pico Sync<br>Grundlage für Replikation, Versionierung und Konfliktabgleich. | 72 % | In Arbeit | Opaker Transport, Checkpoint-Adapter, versiegelte Reader-Batches, rollback-sichere Projektion, privater atomarer Client-State, begrenzte Runs, eine dauerhafte Ein-Batch-Pending-Inbox, ein privates Projektionsarchiv mit idempotenten Receipts sowie expliziter Item-Zugriff, ephemerer Katalog und one-shot Reader-Zugriff sind implementiert. | Deployte Netzwerkadapter, Hintergrundorchestrierung, Cross-Process-Koordination, Multi-Node-Betrieb, Retention/Compaction des Archivs und vollständige Recovery-Semantik. |
| Pico Identity<br>Identitäts-, Key- und Signaturprüfung für Picos und Devices. | 68 % | In Arbeit | Key-Rollen, Fingerprints, Possession, Delegation, Lifecycle, Reader-Key-Freshness sowie Owner-/Reader-/Writer-Authority werden bindungsgenau geprüft. | Recovery, breitere Key-Rotation, langlebige Registry-Transparenz und produktionsreife Lifecycle-Verteilung. |
| Pico Vault<br>Lokale Schlüssel-Custody für Person-/Device-Keys und Signaturen. | 82 % | In Arbeit | Vault verwaltet verschlüsselte Rollen-Keyfiles, signiert Checkpoints/Authorities, verteilt versionierte KEKs an exakte Reader, erzeugt Rotationen, versiegelt und öffnet Sync-Batches und läuft zusätzlich als lokaler Daemon mit CLI, privatem Unix-Socket, mehreren hold-gebundenen Sessions, per-Request-Approval sowie daemon-seitigen Domain-, Rotations- und Reader-Grant-Ceremonies. | Produktseitige Nutzung der Daemon-Kette, Platform-Keystore, Recovery, Paketierung/Autostart, macOS- und Windows-Transport, Rendering der Approval-Inhalte und Betriebshärtung. |
| Pico Home<br>Lokale Host-Instanz, die Picos aufnimmt, betreibt und verwaltet. | 79 % | In Arbeit | Founding, Membership, Grants, Reader Keys, opake Multi-Reader-Custody, Rotationen und founding-genaue Operator-/Relay-Grenzen sind implementiert. | Geschützte First-Boot-Anzeige, reale HA-Validierung, Host-Key-Kontinuität, Netzwerkbetrieb und breitere Verwaltungs-UX. |
| Pico Link<br>Geplanter Transport für sichere Kommunikation zwischen Picos und Homes. | 14 % | Konzipiert | Architektur und draft-only Fixtures sind vorhanden; ADR 0089 nutzt bewusst einen engeren generischen Sync-Adapter ohne Pico-Link-Kompatibilitätsclaim. | Transport-/Relay-Runtime, finale Wire-Schemas, Routing, Capability Negotiation, Privacy-Härtung und Conformance. |

## Pico Core

Lokaler Foundation-Service für APIs, Events, Memory, Auth und Pico-Home-Betrieb.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Architektur | 86 % | In Arbeit | Store-, Session-, Home-Authority-, Reader-Custody-, Rotation-, Freshness- und Relay-Grenzen sind explizit und fail-closed getrennt. |
| Kernfunktionen | 84 % | In Arbeit | Events, Memory, Home-Lifecycle, signierte Share-Envelopes sowie opake Domain-/Reader-/Writer-/Rotation-/Item-Flows funktionieren lokal. |
| Datenhaltung | 88 % | In Arbeit | `0001_initial_schema` bildet die konsolidierte unveröffentlichte Basis; `0002_foundation_operator_home_binding` und `0003_reader_custody_multi_reader_rotation` sind additive Migrationen. |
| Schnittstellen | 81 % | In Arbeit | Lokale APIs trennen Host-Infrastruktur von `home-authority-relay`; externe Reader-Kommunikation bleibt außerhalb der Foundation-HTTP-Fläche. |
| Sicherheit und Berechtigungen | 91 % | In Arbeit | Exakte Founding-/Host-Key-/Session-Bindung, signierte Authorities, Freshness, Revocation, Rotation Debt und opake Custody sind fail-closed testgebunden. |
| Tests | 96 % | Weitgehend fertig | Core hat 273 Unit-, Crypto-, Restore-, Authority- und API-Tests. |
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
| Foundation-Typen | 86 % | In Arbeit | Event-, Identity-, Home-, Share-, Freshness-, Reader-Custody- und Reader-Sync-Typen sind Runtime-Exports. |
| Kanonische Bytes und Vektoren | 93 % | Weitgehend fertig | Memory-AD, Identity, Home, Vault, Share-v1 sowie acht Reader-Custody-/Sync-Manifest-Familien besitzen autoritative positive und negative Vektoren. |
| Draft-Fixtures | 35 % | Konzipiert | Pico Link, Pico Home Link und Model Delegation besitzen draft-only Fixtures ohne Runtime- oder Kompatibilitätsanspruch. |
| Validierung und Conformance | 72 % | In Arbeit | Protocol-Tests binden Runtime-Exports, ADR-Bytes, rekursiv kanonische Full-Record-Digests, Docs und Fixture-Suiten; ein eigenständiger Conformance-Runner fehlt. |
| Tests | 90 % | Weitgehend fertig | Protocol hat 47 Runner-Tests für Exportlisten, Payloads, Validierung und Fixture-Bytegleichheit. |

## Pico Sync

Grundlage für lokale Replikation, Versionierung und Konfliktabgleich.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Kernfunktionen | 84 % | In Arbeit | LamportClock, Version Vectors, opake Mailboxes, idempotente Publikation, striktes Paging, Reader-Custody-Projektion, begrenzte explizite Reader-Läufe, ein privates Projektionsarchiv sowie Katalog und one-shot Item-Präsentation sind implementiert. |
| Kommunikation | 45 % | Teilweise implementiert | Ein byte-orientierter Transportvertrag und In-Memory-Referenzadapter existieren; kein Netzwerk- oder öffentlicher Relay-Adapter ist deployt. |
| Sicherheit und Konfliktbehandlung | 86 % | In Arbeit | Exakte Scope-Pins, vollständige Manifest-/Evidence-Prüfung, Replay-Idempotenz sowie Rollback-, Gap-, Fork-, Expiry- und Cross-Scope-Rejection sind implementiert; historisches Expiry-Replay verlangt die exakte Pending-/Floor-/`verifiedAt`-Bindung. |
| Integration mit anderen Pico-Komponenten | 74 % | In Arbeit | Vault erzeugt und öffnet reader-adressierte Batches; Sync projiziert sie erst nach durablem Floor-Commit; Core akzeptiert Freshness über die strukturelle Sync-Source-Grenze; der Reader-Zugriff läuft wahlweise über eine lokale Vault-Session oder über den Vault-Daemon, ohne dass Sync Passphrasen oder Schlüsselbytes sieht. |
| Datenhaltung | 80 % | In Arbeit | Pins, signierter Floor, `verifiedAt` und untrusted Cursor liegen in einem privaten atomaren State; genau ein versiegelter Pending-Batch wird vor Apply dauerhaft gestaged und erst nach Consumer-Ack entfernt; ein auf 1.000 Records und 256 MiB begrenztes privates Archiv hält Reader-versiegelte Projektionen mit minimalen Receipts. |
| Tests | 92 % | Weitgehend fertig | Sync hat 26 Tests für Transport, strikte Seiten, Limits, Abort, falsche Reader, Tamper, Replay, Rollback, Gap, Fork, Expiry, Restore, Floor-/Cursor-Recovery, Pending-Dateirechte, Disk-Full, Crash-Phasen, Archiv-Idempotenz, Katalogbindung und Zugriffs-Lebenszyklus. |

## Pico Identity

Identitäts- und Signaturbausteine für Pico-, Device- und Lifecycle-Authority.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Architektur | 79 % | In Arbeit | Key-Rollen, Delegation, Revocation, Lifecycle, Reader-Key-Freshness und Reader-Custody-Owner-/Reader-/Writer-Authority sind abgegrenzt. |
| Kernfunktionen | 77 % | In Arbeit | Fingerprints, Possession, Lifecycle, Freshness sowie Owner-/Reader-/Writer-Signaturen werden kanonisch geprüft. |
| Sicherheit und Berechtigungen | 80 % | In Arbeit | Exakte Home-/Identity-/Device-/Delegation-/Reader-Key-Bindung, Gültigkeit, Revocation und Rollback-Grenzen sind implementiert. |
| Integration mit anderen Pico-Komponenten | 75 % | In Arbeit | Core, Home, Vault und Sync nutzen Identity-Evidence für Sessions, Readership, Checkpoints, Reader-Custody und Envelope-Issuance. |
| Tests | 86 % | Weitgehend fertig | Identity hat 17 Tests plus autoritative Signature-, Lifecycle- und Freshness-Fixtures; Core ergänzt Integrations- und Negativfälle. |

## Pico Vault

Lokale Key-Custody-Runtime für Person- und Device-Keys, bestehend aus der Bibliothek `@pico/vault` und dem lokalen Vault-Daemon mit CLI (`apps/vault-daemon`).

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Kernfunktionen | 90 % | In Arbeit | Vault erzeugt/öffnet Keyfiles, signiert rollenbegrenzt, verwaltet transiente versionierte KEKs, verschlüsselt Items, rotiert nach Revocation, versiegelt vollständige Reader-Sync-Batches und stellt einen strukturellen Detached-Signer bereit, den ein Ceremony-Konsument statt einer In-Process-Session halten kann. |
| Datenhaltung | 72 % | Teilweise implementiert | Rollen-Keyfiles sind verschlüsselt, Pfade geschützt und Foundation-Backups ausgeschlossen; das Vault-Home liegt in einem `0700`-Verzeichnis mit `0600`-Keyfiles und `0600`-Socket, dessen Überlappung mit Foundation-Daten- und Backup-Scopes beim Start fail-closed abgelehnt wird; ein Platform-Keystore fehlt. |
| Sicherheit und Berechtigungen | 90 % | In Arbeit | Argon2id, XChaCha20-Poly1305, Ed25519, X25519 Sealed Boxes, Rollen-/Label-Checks, Auto-Lock, Zeroization, exakte Rotation-Causes und strikte Custody-Grenzen sind vorhanden; über den Daemon kommen benannte Request-Familien, explizite Schlüsselwahl, per-Request-Approval mit Digest-Bindung und Lock bei Disconnect, Idle, Dauer, Suspend, Rollback und Shutdown hinzu. Es gibt weder eine Export- noch eine Unwrap-Familie. |
| Integration mit anderen Pico-Komponenten | 80 % | In Arbeit | Vault bedient Claim-, Envelope-, Freshness-, Multi-Reader-, Rotation- und Sync-Ceremonies kryptographisch, sowohl als Bibliothek im Konsumentenprozess als auch über den lokalen Daemon; Reader-Zugriff und Reader-Grants laufen ohne Privatschlüssel im Konsumentenprozess, Item-Verschlüsselung noch nicht. |
| Installation und Betrieb | 45 % | Teilweise implementiert | Ein deploybarer Daemon mit `pico-vault`-CLI, Einzelinstanz-Prüfung, Stale-Socket-Übernahme, Unlock-Throttling und inhaltsfreiem Audit läuft unter Linux im Vordergrund; Platform-Keystore, Recovery, Paketierung/Autostart, macOS- und Windows-Transport fehlen; kein Produktpfad nutzt den Daemon. |
| Tests | 93 % | Weitgehend fertig | Vault hat 13 Real-Crypto-Tests für Keyfiles, Rollen, Envelopes, Freshness, Multi-Reader-Custody, Rotation, Sync-Sealing, Locking und Pfadtrennung; der Vault-Daemon hat 48 Tests für Custody-Grenze, Wire-Vertrag, Unlock-Lebenszyklus, Reader-Lease, Approval, Ceremonies und Mehrfach-Sessions. |

## Pico Home

Lokale Host-Instanz für Claim, Mitgliedschaft, Betrieb und Verwaltung eines Pico Homes.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Architektur | 86 % | In Arbeit | Home Host, Claim/Founding, Membership, Grants, Multi-Reader-Custody, Rotation sowie lokale Operator- und signierte Relay-Authority sind abgegrenzt. |
| Kernfunktionen | 85 % | In Arbeit | Home-Lifecycle, Share-Envelopes, opake Reader-Custody, Rotation Debt und founding-genaue Operator-Bindung funktionieren lokal. |
| Schnittstellen | 81 % | In Arbeit | Home-Routen verlangen ein autorisiertes Relay; Handler prüfen Controller-, Owner-, Reader- oder Writer-Signaturen als eigentliche Authority. |
| Datenhaltung | 87 % | In Arbeit | Authority-Evidence, Reader-/Writer-/Rotation-Projektionen, opake Custody-Datensätze und Operator-Home-Bindung werden persistiert und reconciliert. |
| Sicherheit und Berechtigungen | 92 % | In Arbeit | Operator, Home Host, Identity, Reader, Writer und Transport bleiben getrennt; Claim, Reset, Restore, Rotation Debt und fehlende Host-Key-Custody schließen fail-closed. |
| Tests | 96 % | Weitgehend fertig | Core deckt Home-Ceremonies, Confused Deputy, Binding, Tamper, Revocation, Rotation, Restore, Reset und Cross-Key-Swaps ab. |
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

- Es gibt 102 nummerierte ADRs sowie eine Implementation-Status-Matrix.
- Wichtige Entscheidungen betreffen Foundation-Grenzen, lokale Authentifizierung, Memory-Verschlüsselung, Identity/Vault-Custody, Home Authority, Domain Readership, Reader-Custody und die lokale Vault-Prozessgrenze.
- ADR 0086 bis 0088 implementieren einen owner-rooted Reader-Custody-Slice mit transientem KEK, exakter Writer-Authority, opaken Item-Paketen, zusätzlichen Readern, expliziten Historienmodi und revocation-gekoppelter KEK-Rotation.
- ADR 0087 bindet Operator-Credentials und Sessions exakt an Founding und Host-Key-Custody; lokale Host-Infrastruktur bleibt von signierter Home-Governance getrennt.
- ADR 0089 bis 0093 implementieren identity-root-signierte Checkpoint-Adapter, reader-adressierte versiegelte Evidence-Batches, rollback-sichere Projektion, einen privaten crash-sicheren Floor, begrenzte Reader-Läufe, eine Ein-Batch-Pending-Inbox mit Stage–Apply–Consume–Ack und ein privates Projektionsarchiv mit idempotenten Receipts.
- ADR 0094 bis 0096 implementieren expliziten Item-Zugriff an den aktuellen Head, einen ephemeren Katalog mit state-gebundenen Selections und einen one-shot Reader-Zugriff mit verifiziertem Vault-Lock in jedem Exit-Pfad.
- ADR 0097 entscheidet die erste Vault-Produktform — CLI plus lokaler Daemon, Linux zuerst — und implementiert die lokale IPC-Authority-Grenze mit privatem Socket, benannten Request-Familien und hold-gebundenem Unlock.
- ADR 0098 bis 0102 implementieren Reader-Zugriff über ein connection-gebundenes Lease, per-Request-Approval für autoritätsschaffende Signaturen, Ceremony-Signierung über den Daemon, daemon-seitige Domain- und Rotations-Ceremonies sowie Mehrfach-Session-Unlock mit der ersten Zwei-Rollen-Ceremony.
- Pico Link, Relay, Rules, Action Runner, Companion-UX, Recovery und breite Home-Mitgliedschaftsflüsse bleiben überwiegend konzipiert oder nur teilweise implementiert.

## Pflegeanweisung für Aktualisierungen

Wenn der Auftrag "aktualisiere progress.md" lautet, diese Datei anhand des aktuellen Repository-Stands aktualisieren:

1. Branch, Commit, vorhandenen Code, funktionsfähige Abläufe, Tests, Konfiguration, Deployment-Dateien und offene TODOs/Placeholder direkt prüfen.
2. Dokumentation und ADRs nur ergänzend verwenden; ein ADR gilt erst als umgesetzt, wenn passende Implementierung, Integration oder Tests vorhanden sind.
3. Bestehende Struktur, Reihenfolge und kurze Form beibehalten; Prozentwerte nur bei nachvollziehbarem Fortschritt oder neu erkannten Problemen ändern.
4. Die Datei beschreibt ausschließlich den absoluten Zustand am analysierten Commit. Keine Änderungschronik, keine Formulierungen wie "seit der letzten Aktualisierung" und keine Vergleiche mit einem früheren Stand aufnehmen.
5. Keine nächsten Blöcke, nächsten Schritte, Prioritäten, Reihenfolgen, Model-/Effort-Empfehlungen oder handlungsorientierten Einstiegspunkte aufnehmen. Solche Inhalte gehören in `.agent-context.md`.
6. Bestehende Aussagen durch den aktuellen Zustand ersetzen; Git-Historie und Commits bilden den zeitlichen Verlauf.
7. Offene Lücken und Risiken als gegenwärtige Eigenschaften benennen, nicht als Arbeitsplan formulieren.
8. Keine neuen Hauptkomponenten erfinden; technische Themen nur als Unterbereiche von Pico Core, Pico Link, Pico Vault, Pico Home oder klar erkennbaren Pico-Komponenten führen.
9. Fortschritt realistisch bewerten und klar zwischen konzipiert, dokumentiert, prototypisch umgesetzt, implementiert und praktisch funktionsfähig unterscheiden.
10. Ausschließlich `progress.md` verändern.
