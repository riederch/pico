# Pico Entwicklungsfortschritt

## Metadaten

| Feld | Wert |
| --- | --- |
| Standdatum | 2026-07-30 |
| Analysierter Branch | main |
| Analysierter Commit | 6905c3269a02c9c1b2763f9b51889b73515ed304 |
| Hinweis | Alle Prozentangaben sind Schätzungen auf Basis des Repository-Stands. |

## Gesamtstatus

- Geschätzter Gesamtfortschritt: ca. 70 %.
- Nachgewiesener Funktionsumfang: lokale Foundation-APIs und Events, Memory-Verschlüsselung, atomarer Home-Claim mit erstem delegiertem Device, Membership und authentifiziertem späterem Device-Lifecycle, identity-gebundene Sessions, Reader-Key-Registrierung und Freshness, Host- und Reader-Custody, Multi-Reader-Envelopes, revocation-gekoppelte KEK-Rotation, authentifizierter Reader-Sync mit dauerhaftem Floor, begrenztem Lauf, privater Pending-Inbox und privatem Projektionsarchiv sowie ein deploybarer lokaler Vault-Daemon mit CLI, Reader-Zugriff, gerenderten Approvals, daemon-seitigen Ceremonies und einem begrenzten Pico-Link-Direct-Pfad.
- Sicherheitsstand: Foundation Operator, Home Host, Identity Root, Device, Domain Owner, Reader, Writer, Vault und Transport bleiben getrennte Authorities. Raw-KEKs, Raw-DEKs und Reader-Custody-Klartext verlassen Vault nicht. Reader- und Owner-Key-Agreement-Privatschlüssel existieren für den Reader- und Grant-Pfad nicht mehr in Konsumentenprozessen; ein späteres Device kann ohne Identity-Root-Keyfile eingeschrieben, erneuert und widerrufen werden.
- Offene Produkt- und Betriebsflächen: produktseitige Nutzung der Vault-Daemon-Kette, Relay-gestützte Pico-Link-Erreichbarkeit und öffentliche Wire-Kompatibilität, Platform-Keystore, Zero-Device-Recovery, Paketierung/Autostart des Daemons, macOS- und Windows-Transport, Protected Display, reale Home-Assistant-Installation, Companion-UX, Pico Rules und Action Runner.
- Relevante Grenzen: Der Core-Default bleibt ohne injizierten Checkpoint-Transport `freshness_unavailable`; Relay-Cursor besitzen keine Authority; Projection-Consumer müssen ihre Effekte selbst dauerhaft und idempotent annehmen; die Reader-Dateistores setzen einen aktiven Writer voraus; vollständige passende Client- oder Operator-Backups können ohne externen monotonen Anker ihren damaligen Stand wiederherstellen; bereits erhaltene KEK-Versionen sind durch spätere Revocation nicht rückwirkend entziehbar; die Daemon-Grenze schützt nicht gegen Malware, die die Sitzung der Person bereits besitzt. Approval-Sätze werden aus den signierten Feldern gerendert, aber noch nicht auf einem geschützten Produktkanal angezeigt. Pico Link Direct verbirgt weder Source-IP noch Timing oder Ciphertextgröße, seine Replay-Map überlebt keinen Neustart, und nach Widerruf des letzten Devices bleibt der Home-Zugriff bis zu einem eigenen Recovery-Vertrag geschlossen.
- Verifizierter Gate: `pnpm release:verify` besteht mit 550 Tests — Core 322, Protocol 65, Vault-Daemon 71, Web 34, Sync 26, Identity 18 und Vault 14.

## Fortschritt der Pico-Hauptkomponenten

| Pico-Komponente | Fortschritt | Status | Nachgewiesener Stand | Verbleibende Lücken |
| --------------- | ----------: | ------ | ------------------- | ------------------- |
| Pico Core<br>Lokaler Foundation-Service für APIs, Events, Memory und Home-Betrieb. | 87 % | In Arbeit | Core persistiert und reconciliiert signierte Home-, Device-, Reader-, Writer-, Rotation- und opake Item-Evidence; atomare First-Device- und spätere Lifecycle-Übergänge bleiben über Neustarts fail-closed. | Produktionsbetrieb, dauerhafte externe Freshness-Anbindung, automatische Abläufe, vollständige Policy-/Action-Schicht und reale HA-Installation. |
| Pico Surfaces<br>Benutzeroberflächen für Diagnose, Companion-Interaktion und Alltagsflows. | 38 % | Teilweise implementiert | Das frameworkfreie Foundation Web Dashboard bedient lokale Diagnose-, Auth-, Retention-, Shred- und Memory-Flows. | Companion-UX, Voice, reichere Avatar-Zustände, mobile Oberflächen, Consent- und Recovery-Flows. |
| Pico Protocol<br>Gemeinsame Typen, kanonische Bytes und Kompatibilitätsgrenzen. | 86 % | In Arbeit | Identity-, Home-, Vault-, Share-v1-, Reader-Custody-, Sync-, Link-Direct-, First-Device- und Device-Lifecycle-Familien sind mit autoritativen positiven und negativen Vektoren testgebunden. | Eigenständiger Conformance-Runner, veröffentlichte Pico-Link-Semantik, Capability Negotiation und Kompatibilitätszertifizierung. |
| Pico Sync<br>Grundlage für Replikation, Versionierung und Konfliktabgleich. | 72 % | In Arbeit | Opaker Transport, Checkpoint-Adapter, versiegelte Reader-Batches, rollback-sichere Projektion, privater atomarer Client-State, begrenzte Runs, eine dauerhafte Ein-Batch-Pending-Inbox, ein privates Projektionsarchiv mit idempotenten Receipts sowie expliziter Item-Zugriff, ephemerer Katalog und one-shot Reader-Zugriff sind implementiert. | Deployte Netzwerkadapter, Hintergrundorchestrierung, Cross-Process-Koordination, Multi-Node-Betrieb, Retention/Compaction des Archivs und vollständige Recovery-Semantik. |
| Pico Identity<br>Identitäts-, Key- und Signaturprüfung für Picos und Devices. | 76 % | In Arbeit | Key-Rollen, Fingerprints, Possession, Delegation, Widerruf und head-gebundener Lifecycle werden einschließlich First-Device-, Renewal- und Zero-Device-Closure bindungsgenau geprüft. | Zero-Device-Recovery, breitere Key-Rotation, externe Lifecycle-Freshness und langlebige Registry-Transparenz. |
| Pico Vault<br>Lokale Schlüssel-Custody für Person-/Device-Keys und Signaturen. | 88 % | In Arbeit | Vault-Daemons führen Claim-, Domain-, Membership-, Reader-, Rotation- und Device-Lifecycle-Ceremonies mit mehreren hold-gebundenen Sessions, rollenabhängigem Approval und aus signierten Feldern gerenderten Aussagen aus; ein Ziel-Device benötigt dabei kein Root-Keyfile. | Produktseitige Nutzung der Daemon-Kette, Platform-Keystore, Recovery, Paketierung/Autostart, macOS- und Windows-Transport, Protected Display und Betriebshärtung. |
| Pico Home<br>Lokale Host-Instanz, die Picos aufnimmt, betreibt und verwaltet. | 87 % | In Arbeit | Founding bindet das erste delegierte Device atomar; spätere Enrollment-, Replacement-Renewal- und Revocation-Übergänge laufen authentifiziert über Pico Link Direct und werden dauerhaft reconciliiert. | Zero-Device-Recovery, geschützte First-Boot-Anzeige, reale HA-Validierung, Relay-Netzbetrieb und breitere Verwaltungs-UX. |
| Pico Link<br>Transportgrundlage für sichere Kommunikation zwischen Picos und Homes. | 45 % | Teilweise implementiert | Ein isolierbarer Direct-Listener sowie gepinnte, signierte und versiegelte Request-/Response-Envelopes tragen reale Claim-, Home-Authority- und Device-Lifecycle-Ceremonies ohne Foundation-Session. | Relay-Runtime, öffentliche Wire-Schemas und Conformance, Routing, Capability Negotiation, Metadaten-/DoS-Härtung, dauerhafter Replay-Schutz und Produktkanal. |

## Pico Core

Lokaler Foundation-Service für APIs, Events, Memory, Auth und Pico-Home-Betrieb.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Architektur | 89 % | In Arbeit | Store-, Session-, Home-/Device-Authority-, Reader-Custody-, Rotation-, Freshness-, Relay- und Link-Intake-Grenzen sind explizit und fail-closed getrennt. |
| Kernfunktionen | 89 % | In Arbeit | Events, Memory, Home-Lifecycle, First- und Later-Device-Lifecycle, signierte Share-Envelopes sowie opake Domain-/Reader-/Writer-/Rotation-/Item-Flows funktionieren lokal. |
| Datenhaltung | 92 % | In Arbeit | Auf die konsolidierte Basis folgen vier additive Migrationen für Operator-/Home-Bindung, Multi-Reader-Rotation, First-Device-Evidence und spätere Device-Lifecycle-Transitionen. |
| Schnittstellen | 88 % | In Arbeit | Lokale Foundation-APIs bleiben von `home-authority-relay` getrennt; der optionale Pico-Link-Listener exponiert ausschließlich exakt `POST /api/home/link` und teilt nur geprüfte Handler. |
| Sicherheit und Berechtigungen | 95 % | In Arbeit | Exakte Founding-/Host-Key-/Session-/Device-Bindung, signierte Authorities, Freshness, Revocation, Rotation Debt, issuerweite Order und opake Custody sind fail-closed testgebunden. |
| Tests | 97 % | Weitgehend fertig | Core hat 322 Unit-, Crypto-, Restore-, Authority-, Lifecycle- und API-Tests. |
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
| Foundation-Typen | 92 % | In Arbeit | Event-, Identity-, Home-, Share-, Freshness-, Reader-Custody-, Reader-Sync-, Link-Direct- und Device-Lifecycle-Typen sind Runtime-Exports. |
| Kanonische Bytes und Vektoren | 96 % | Weitgehend fertig | Memory-AD, Identity, Home, Vault, Share-v1, Reader-Custody/Sync, Link Direct, First-Device-Founding und Later-Device-Lifecycle besitzen autoritative positive und negative Vektoren. |
| Draft-Fixtures | 35 % | Konzipiert | Pico Home Link und Model Delegation bleiben draft-only ohne Runtime- oder Kompatibilitätsanspruch; Pico Link Direct besitzt dagegen einen bewusst begrenzten Runtime-Vertrag ohne öffentlichen Kompatibilitätsclaim. |
| Validierung und Conformance | 81 % | In Arbeit | Protocol-Tests binden Runtime-Exports, ADR-Bytes, rekursiv kanonische Full-Record-Digests, Docs und Fixture-Suiten; ein eigenständiger Conformance-Runner und ein öffentlicher Link-Vertrag fehlen. |
| Tests | 94 % | Weitgehend fertig | Protocol hat 65 Runner-Tests für Exportlisten, Payloads, Validierung, Lifecycle und Fixture-Bytegleichheit. |

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
| Architektur | 85 % | In Arbeit | Key-Rollen, Delegation, Revocation, issuerweiter Lifecycle, Reader-Key-Freshness und Reader-Custody-Owner-/Reader-/Writer-Authority sind abgegrenzt. |
| Kernfunktionen | 85 % | In Arbeit | Fingerprints, Possession, First-Device- und Later-Device-Lifecycle, Freshness sowie Owner-/Reader-/Writer-Signaturen werden kanonisch geprüft. |
| Sicherheit und Berechtigungen | 89 % | In Arbeit | Exakte Home-/Identity-/Device-/Delegation-/Reader-Key-Bindung, Gültigkeit, Revocation, Replacement, Order-Kollision und Rollback-Grenzen sind implementiert. |
| Integration mit anderen Pico-Komponenten | 86 % | In Arbeit | Core, Home, Vault, Link Direct und Sync nutzen Identity-Evidence für Sessions, Device-Authority, Readership, Checkpoints, Reader-Custody und Envelope-Issuance. |
| Tests | 90 % | Weitgehend fertig | Identity hat 18 Tests plus autoritative Signature-, Lifecycle- und Freshness-Fixtures; Core und Vault-Daemon ergänzen Prozess-, Integrations- und Negativfälle. |

## Pico Vault

Lokale Key-Custody-Runtime für Person- und Device-Keys, bestehend aus der Bibliothek `@pico/vault` und dem lokalen Vault-Daemon mit CLI (`apps/vault-daemon`).

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Kernfunktionen | 95 % | In Arbeit | Vault erzeugt/öffnet Keyfiles, signiert rollenbegrenzt, verwaltet transiente versionierte KEKs, verschlüsselt Items, rotiert nach Revocation, versiegelt Reader-Sync-Batches und bedient Claim-, Domain-, Membership-, Reader- und Device-Lifecycle-Ceremonies über getrennte Daemon-Sessions. |
| Datenhaltung | 72 % | Teilweise implementiert | Rollen-Keyfiles sind verschlüsselt, Pfade geschützt und Foundation-Backups ausgeschlossen; das Vault-Home liegt in einem `0700`-Verzeichnis mit `0600`-Keyfiles und `0600`-Socket, dessen Überlappung mit Foundation-Daten- und Backup-Scopes beim Start fail-closed abgelehnt wird; ein Platform-Keystore fehlt. |
| Sicherheit und Berechtigungen | 95 % | In Arbeit | Argon2id, XChaCha20-Poly1305, Ed25519, X25519 Sealed Boxes, Rollen-/Label-Checks, Auto-Lock, Zeroization und strikte Custody-Grenzen sind vorhanden; der Daemon bindet Approvals an exakt gebaute und gerenderte Signaturfelder, lässt nur eng benannte rollenabhängige Possession-Ausnahmen zu und sperrt bei Disconnect, Idle, Dauer, Suspend, Rollback und Shutdown. Es gibt weder Export noch Unwrap. |
| Integration mit anderen Pico-Komponenten | 92 % | In Arbeit | Vault bedient die implementierten Foundation-, Home-, Identity-, Link-, Reader-, Rotation- und Sync-Ceremonies kryptographisch über reale Daemon-Prozesse; ein späteres Ziel-Device braucht nur seine Device-Keys und den öffentlichen Identity-Key. Item-Verschlüsselung bleibt hybrid. |
| Installation und Betrieb | 45 % | Teilweise implementiert | Ein deploybarer Daemon mit `pico-vault`-CLI, Einzelinstanz-Prüfung, Stale-Socket-Übernahme, Unlock-Throttling und inhaltsfreiem Audit läuft unter Linux im Vordergrund; Platform-Keystore, Recovery, Paketierung/Autostart, macOS- und Windows-Transport fehlen; kein Produktpfad nutzt den Daemon. |
| Tests | 97 % | Weitgehend fertig | Vault hat 14 Real-Crypto-Tests; der Vault-Daemon hat 71 Tests für Custody-Grenze, Wire-Vertrag, Unlock, Reader-Lease, Approval-Rendering, Mehrfach-Sessions sowie reale Claim-, Link-, Reader- und Device-Lifecycle-Ceremonies. |

## Pico Home

Lokale Host-Instanz für Claim, Mitgliedschaft, Betrieb und Verwaltung eines Pico Homes.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Architektur | 91 % | In Arbeit | Home Host, Claim/Founding, Membership, Device-Lifecycle, Grants, Multi-Reader-Custody, Rotation sowie lokale Operator-, Link- und signierte Relay-Authority sind abgegrenzt. |
| Kernfunktionen | 92 % | In Arbeit | Home-Lifecycle, First-Device-Founding, spätere Enrollment-/Renewal-/Revocation-Übergänge, Share-Envelopes, opake Reader-Custody, Rotation Debt und founding-genaue Operator-Bindung funktionieren lokal. |
| Schnittstellen | 90 % | In Arbeit | Home-Routen verlangen ein autorisiertes Relay; Pico Link Direct erreicht dieselben Authority-Handler ausschließlich über signierte und versiegelte Envelopes, nicht über Foundation-Sessions. |
| Datenhaltung | 93 % | In Arbeit | Founding-, Device-Lifecycle-, Host-Receipt-, Authority-, Reader-/Writer-/Rotation- und opake Custody-Evidence werden atomar persistiert und beim Boot kryptographisch reconciliert. |
| Sicherheit und Berechtigungen | 96 % | In Arbeit | Operator, Home Host, Identity Root, Device, Reader, Writer und Transport bleiben getrennt; Claim, Reset, Restore, Lifecycle-Head, Revocation, Rotation Debt und fehlende Host-Key-Custody schließen fail-closed. |
| Tests | 98 % | Weitgehend fertig | Core deckt Home- und Device-Ceremonies, Confused Deputy, Binding, Tamper, atomaren Rollback, Revocation, Rotation, Restore, Reset und Cross-Key-Swaps ab. |
| Installation und Betrieb | 50 % | Teilweise implementiert | Host-Key-Pfad, Backup-Ausschluss, restore-geschlossener Boot und Reset-Marker existieren; echte First-Boot-/HA-Validierung fehlt. |

## Pico Link

Begrenzte Transportgrundlage für sichere Kommunikation zwischen Picos und dem eigenen Home; ein öffentlicher Relay-Vertrag ist nicht implementiert.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Architektur | 58 % | In Arbeit | ADR 0107 trennt Direct-Envelope, Carrier, Foundation-Handler und Relay-Authority; öffentliche Relay-, Routing- und Privacy-Verträge bleiben offen. |
| Kommunikation | 46 % | Teilweise implementiert | Ein optional separater TCP-Listener akzeptiert nur den exakten Link-Intake; der Vault-Client sendet gepinnte, signierte und versiegelte Requests mit ephemeren Reply-Keys. Es gibt keinen Relay-Adapter. |
| Sicherheit und Datenschutz | 57 % | In Arbeit | Host- und Device-Key-Pins, kurze Request-Gültigkeit, bounded Replay, Parser-/Socket-Limits und getrennte Authority-Prüfung sind implementiert; Metadaten, Neustart-Replay, Seal-open-DoS und Rate-Limits bleiben offen. |
| Integration mit anderen Pico-Komponenten | 58 % | In Arbeit | Reale Core-/Vault-/CLI-Prozesse führen Claim, Domain-Authority sowie Enrollment, Renewal und Revocation ohne Foundation-Bearer-Session über Link Direct aus. |
| Tests | 68 % | In Arbeit | Protocol-, Core- und Vault-Daemon-Tests prüfen kanonische Envelopes, Pins, Replay, isolierte Routen, reale Prozessketten, Root-freie Ziel-Devices und fail-closed Lifecycle-Neustarts; öffentliche Conformance fehlt. |

## Architekturentscheidungen und ADRs

- Es gibt 110 nummerierte ADRs sowie eine Implementation-Status-Matrix.
- Wichtige Entscheidungen betreffen Foundation-Grenzen, lokale Authentifizierung, Memory-Verschlüsselung, Identity/Vault-Custody, Home Authority, Domain Readership, Reader-Custody und die lokale Vault-Prozessgrenze.
- ADR 0086 bis 0088 implementieren einen owner-rooted Reader-Custody-Slice mit transientem KEK, exakter Writer-Authority, opaken Item-Paketen, zusätzlichen Readern, expliziten Historienmodi und revocation-gekoppelter KEK-Rotation.
- ADR 0087 bindet Operator-Credentials und Sessions exakt an Founding und Host-Key-Custody; lokale Host-Infrastruktur bleibt von signierter Home-Governance getrennt.
- ADR 0089 bis 0093 implementieren identity-root-signierte Checkpoint-Adapter, reader-adressierte versiegelte Evidence-Batches, rollback-sichere Projektion, einen privaten crash-sicheren Floor, begrenzte Reader-Läufe, eine Ein-Batch-Pending-Inbox mit Stage–Apply–Consume–Ack und ein privates Projektionsarchiv mit idempotenten Receipts.
- ADR 0094 bis 0096 implementieren expliziten Item-Zugriff an den aktuellen Head, einen ephemeren Katalog mit state-gebundenen Selections und einen one-shot Reader-Zugriff mit verifiziertem Vault-Lock in jedem Exit-Pfad.
- ADR 0097 entscheidet die erste Vault-Produktform — CLI plus lokaler Daemon, Linux zuerst — und implementiert die lokale IPC-Authority-Grenze mit privatem Socket, benannten Request-Familien und hold-gebundenem Unlock.
- ADR 0098 bis 0103 implementieren Reader-Zugriff über ein connection-gebundenes Lease, per-Request-Approval, Ceremony-Signierung über den Daemon, daemon-seitige KEK-Familien, Mehrfach-Session-Unlock sowie reale Claim-, Domain-, Membership-, Reader- und Rotation-Ceremonies über getrennte Vault-Prozesse.
- ADR 0104 und 0105 binden Einstellungen an Pico statt Host-Konfiguration und legen den Hintergrund-Companion mit Avatar statt einer CLI als Produktform fest; die CLI bleibt Werkzeug für Setup und Diagnose.
- ADR 0106 rendert Approval-Aussagen aus denselben validierten Feldern, aus denen der Daemon die signierten Bytes baut.
- ADR 0107 implementiert den begrenzten Pico-Link-Direct-Slice mit isoliertem Intake und gepinnten Envelopes; daraus folgt kein Relay-, Public-Exposure- oder Kompatibilitätsclaim.
- ADR 0108 und 0109 implementieren das atomare First-Device-Founding und den authentifizierten späteren Device-Lifecycle mit Enrollment, Replacement-Renewal, Revocation, Neustart-Reconciliation und bewusst geschlossener Zero-Device-Lage.
- Relay, Zero-Device-Recovery, Rules, Action Runner, Companion-UX und breite Produktintegration bleiben überwiegend konzipiert oder nur teilweise implementiert.

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
