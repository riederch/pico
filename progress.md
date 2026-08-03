# Pico Entwicklungsfortschritt

## Metadaten

| Feld | Wert |
| --- | --- |
| Standdatum | 2026-08-03 |
| Analysierter Branch | main |
| Analysierter Commit | e51208e4abfd1abb1edabd85a0a5fa968c6f3d91 plus aktueller CI-Testfix |
| Hinweis | Alle Prozentangaben sind Schätzungen auf Basis des Repository-Stands. |

## Gesamtstatus

- Geschätzter Gesamtfortschritt: ca. 76 %.
- Nachgewiesener Funktionsumfang: lokale Foundation-APIs und Events, Memory-Verschlüsselung, Home- und Device-Lifecycle, Reader-Custody und Reader-Sync, zeitverzögerte Zero-Device-Recovery, Identity-Root- und Home-Host-Key-Rotation, ein lokaler Vault-Daemon mit realen Prozess-Ceremonies, Pico Link Direct, ein versionierter und robustheitsgeprüfter Appearance-Dokument-/Fallback-Vertrag sowie ein installierbarer Linux-Electron-Companion, dessen Main-Prozess den shellfreien Lifecycle-/Host-Pin-Servicekern trägt und Recovery-Alarme über Tray, Desktop-Notification und einen isolierten Renderer anzeigt.
- Sicherheitsstand: Foundation Operator, Home Host, Identity Root, Device, Domain Owner, Reader, Writer, Vault, Companion und Transport bleiben getrennte Authorities. Recovery prüft Root- und Zielsignatur vor Membership-/Lifecycle-Zugriff, persistiert Veto, Ablauf und Verbrauch außerhalb des Foundation-Backups und ersetzt die Authority atomar. Root- und Host-Rotation sind mehrsigniert, dauerhaft reconciliert und entfernen Vorgänger-Autorität. Client-Writes dürfen keine `system`-/`tool`-Rollen oder eigene Event-Origin behaupten; nicht zugeordnete Writes werden serverseitig `unattributed` markiert.
- Offene Produkt- und Betriebsflächen: freigegebener Character Core, Appearance-Renderer/-Persistenz/-Sync, Avatar- und Voice-Produktfluss, produktseitige Profileinrichtung und Recovery-Ceremonies, Relay und öffentliche Wire-Kompatibilität, Platform-Keystore, eigenständige Daemon-Paketierung, macOS-/Windows-Transport, Protected Display, reale Home-Assistant-Installation, Pico Rules und Action Runner.
- Produktionsblockierende Grenzen: Origin-Vererbung in Memory und Reader-Custody, Rollen-/Provenienz-Trennung für Modellkontext, origin-aware Action-Planung, Resource-Exhaustion-Reserven, konservative Zeitautorität, manipulationsnachweisbarer Audit-Log und verifizierte Supply Chain sind nicht implementiert. JavaScript-/WASM-Kopien und Swap liegen außerhalb der Secret-Lifetime-Kontrollen; der Linux-Companion deaktiviert Core Dumps nachweislich, Add-on und künftige Vault-/Appliance-Artefakte noch nicht. Vollständiger Dateisystem-Rollback einschließlich Recovery-Anker benötigt weiterhin einen externen monotonen Plattformanker; Pico Link Direct verbirgt keine Metadaten und besitzt keinen neustartfesten Replay-Schutz.
- Verifizierter lokaler Gate: `pnpm release:verify` besteht am analysierten Runtime-Stand mit 786 Tests — Core 370, Protocol 78, Appearance 93, Vault-Daemon 92, Web 34, Sync 26, Identity 34, Vault 18, Companion-Core 18 und Companion-Shell 23. Der echte Linux-Paketgate installiert den Produktionsgraphen offline aus dem eingefrorenen Lockfile unter leerem pnpm-Metadaten-Cache und prüft Debian-Inhalt, XDG-Autostart, interne Links, Install/Upgrade/Remove/Purge ohne Profil- oder Vault-Veränderung, Electron-Currency und null Soft-/Hard-Core-Dump-Limits. Der lokale v2-Tray-Prozesssatz liegt bei 200.540.160 Byte PSS und 95.756.288 Byte `Private_Dirty + Private_Hugetlb` unter den numerisch unveränderten Gates von 225.000.000/110.000.000 Byte; 4.005.888 Byte `Private_Clean`, insgesamt 99.762.176 private residente Byte und 516.456.448 Byte summiertes RSS bleiben informativ. Der root-eigen entpackte v2-GitHub-SUID-Paketgate bestand mit 203.502.592 Byte PSS und 55.300.096 Byte budgetiertem Dirty+Hugetlb; 81.616.896 Byte Clean und 136.916.992 Byte Gesamt-Private blieben informativ. Der nachfolgende Gesamtlauf scheiterte nur, weil ein Sandbox-Unit-Test die absichtlich gesetzte CI-Variable bei explizitem `undefined` übernahm; Helper und Test unterscheiden jetzt ausgelassenen von explizitem Wert und bestehen lokal mit gesetzter wie gelöschter Variable. Die vollständige Runner-Bestätigung dieses Testfixes steht noch aus.

## Fortschritt der Pico-Hauptkomponenten

| Pico-Komponente | Fortschritt | Status | Nachgewiesener Stand | Verbleibende Lücken |
| --------------- | ----------: | ------ | ------------------- | ------------------- |
| Pico Core<br>Lokaler Foundation-Service für APIs, Events, Memory und Home-Betrieb. | 91 % | In Arbeit | Core persistiert und reconciliiert Home-, Device-, Reader-, Recovery-, Identity-Root- und Host-Key-Evidence; Authority-Wechsel und Restore schließen fail-closed. Event-Writes besitzen eine serverkontrollierte erste Origin-Grenze. | Produktionsbetrieb, externe Freshness, vollständige Provenienzfortführung, Resource-/Zeit-/Audit-Härtung, Policy-/Action-Schicht und reale HA-Installation. |
| Pico Surfaces<br>Benutzeroberflächen für Diagnose, Companion-Interaktion und Alltagsflows. | 53 % | Teilweise implementiert | Das frameworkfreie Dashboard bedient Foundation-Diagnose; Electron Main hostet den shellfreien Companion-Core und trägt Tray, kritische Notifications, Wake-/Netz-Checks sowie einen sandboxed Status-/Alarm-Renderer. Appearance-Profil, Dokument, Compatibility Core und Custom-Asset-Fallbacks sind als UI-freier Vertrag implementiert. Ein Debian-Paket installiert die Shell samt XDG-Autostart und besteht Lockfile-, Lifecycle-, Speicher-, Currency- und Core-Dump-Gates. | Freigegebener Character Core, Appearance-Renderer/-Persistenz/-Sync, Voice, produktive Profileinrichtung, Onboarding, Consent-, Recovery-Ceremonies, macOS/Windows und Alltagsflows. |
| Pico Protocol<br>Gemeinsame Typen, kanonische Bytes und Kompatibilitätsgrenzen. | 90 % | In Arbeit | Identity-, Home-, Vault-, Sync-, Link-, Recovery-, Root-Rotation- und Host-Continuity-Familien sind mit positiven und negativen Vektoren testgebunden; Appearance ergänzt Capability-Namen, typisierte Claims und einen byte-exakten, versionierten Dokumentvertrag. | Eigenständiger Conformance-Runner, veröffentlichte Pico-Link-Semantik, produktive Capability Negotiation und Kompatibilitätszertifizierung. |
| Pico Sync<br>Grundlage für Replikation, Versionierung und Konfliktabgleich. | 72 % | In Arbeit | Opaker Transport, Checkpoint-Adapter, versiegelte Reader-Batches, rollback-sichere Projektion, privater atomarer Client-State, begrenzte Runs, eine dauerhafte Ein-Batch-Pending-Inbox, ein privates Projektionsarchiv mit idempotenten Receipts sowie expliziter Item-Zugriff, ephemerer Katalog und one-shot Reader-Zugriff sind implementiert. | Deployte Netzwerkadapter, Hintergrundorchestrierung, Cross-Process-Koordination, Multi-Node-Betrieb, Retention/Compaction des Archivs und vollständige Recovery-Semantik. |
| Pico Identity<br>Identitäts-, Key- und Signaturprüfung für Picos und Devices. | 86 % | In Arbeit | Lifecycle, Recovery und dual signierte Identity-Root-Rotation werden bindungsgenau geprüft; angenommene Rotationen entfernen Vorgänger-Autorität und erzeugen nachverfolgte Rotation Debt. | Personseitige Root-Rotations-Ceremony, erzwungene Recovery-Card-Neuausgabe, externe Freshness und Registry-Transparenz. |
| Pico Vault<br>Lokale Schlüssel-Custody für Person-/Device-Keys und Signaturen. | 93 % | In Arbeit | Vault-Daemons führen Claim-, Domain-, Membership-, Reader-, Recovery-, Device-, Root- und Host-Key-Ceremonies mit hold-gebundenen Sessions und signaturgenau gerenderten Approvals aus. | Produktseitige Nutzung, Platform-Keystore, Paketierung/Autostart, macOS-/Windows-Transport, Protected Display und Betriebshärtung. |
| Pico Home<br>Lokale Host-Instanz, die Picos aufnimmt, betreibt und verwaltet. | 92 % | In Arbeit | Founding, Device-Lifecycle, zeitverzögerte Recovery, Identity-Root-Rotation und dreifach signierte Host-Key-Continuity werden dauerhaft, atomar und fail-closed reconciliiert. | Geschützte Produkt-Ceremonies, TPM-/Plattformanker, reale HA-Validierung, Relay-Netzbetrieb und breitere Verwaltungs-UX. |
| Pico Link<br>Transportgrundlage für sichere Kommunikation zwischen Picos und Homes. | 55 % | Teilweise implementiert | Der isolierbare Direct-Listener trägt Claim-, Lifecycle-, Recovery-, Root-Rotations- und Host-Continuity-Flows; Identity- und Companion-Clients folgen verifizierten Host-Key-Ketten. | Relay-Runtime, öffentliche Wire-Schemas, Routing, Capability Negotiation, Metadaten-/DoS-Härtung, dauerhafter Replay-Schutz und Produktkanal. |

## Pico Core

Lokaler Foundation-Service für APIs, Events, Memory, Auth und Pico-Home-Betrieb.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Architektur | 93 % | In Arbeit | Store-, Session-, Home-/Device-, Recovery-, Root-/Host-Rotation-, Custody-, Freshness-, Relay- und Link-Grenzen sind explizit und fail-closed getrennt. |
| Kernfunktionen | 93 % | In Arbeit | Events, Memory, Home-/Device-Lifecycle, Recovery, Identity-Root-Rotation, Host-Key-Continuity und opake Domain-/Reader-/Writer-/Item-Flows funktionieren lokal. |
| Datenhaltung | 96 % | In Arbeit | Neun Migrationen bilden die konsolidierte Basis, Authority-/Custody-Evidence, Device-Lifecycle, Recovery, Root-/Host-Key-Continuity und serverseitige Event-Origin dauerhaft ab. |
| Schnittstellen | 92 % | In Arbeit | Foundation-APIs bleiben von Relay und Pico Link getrennt; der Link-Listener exponiert nur den exakten Intake und einen eingeschränkten öffentlichen Host-Continuity-Read. Alle Foundation-Antworten tragen eine strikte Self-only-CSP und `nosniff`. |
| Sicherheit und Berechtigungen | 96 % | In Arbeit | Signierte Authority, Vorprüfungen gegen Status-Orakel, Recovery-Anker, Rotation Debt, atomare Authority-Wechsel sowie reservierte Client-Rollen und serverkontrollierte Event-Origin sind testgebunden; Origin-Vererbung sowie Zeit-, Audit-, Ressourcen- und Supply-Chain-Gates bleiben offen. |
| Tests | 98 % | Weitgehend fertig | Core hat 370 Unit-, Crypto-, Restore-, Authority-, Lifecycle-, Recovery-, Continuity- und API-Tests. |
| Installation und Betrieb | 63 % | Teilweise implementiert | Zweistufiges Image, CI-Smokes, Add-on-Metadaten, Backup-Ausschlüsse, Recovery-Anker und restore-geschlossener Boot existieren; reale HA-Validierung sowie die Appliance-Gates für Plattformanker, Swap und attestationsverifizierten Digest-Updater fehlen. |

## Pico Surfaces

Benutzeroberflächen für Diagnose, Companion-Interaktion und Alltagsflows.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Benutzeroberfläche | 52 % | Teilweise implementiert | Das Web Dashboard zeigt Foundation-Diagnose; die Linux-first Electron-Shell besitzt Tray, kritische Notifications und ein Fenster für Status/Alarme. Sie verwendet bewusst nur Designsystem-Statusicons sowie Farbe+Symbol+Text, weil noch kein freigegebenes Character-Asset für diese Companion-Oberfläche existiert. |
| Integration mit Pico Core | 65 % | Teilweise implementiert | Web nutzt lokale Core-Endpunkte; Electron Main verbindet Profil, Vault-Daemon-Socket und den shellfreien Companion-Servicekern, liest Lifecycle-Zustand, aktualisiert verifizierte Host-Pins und prüft bei Start, Wake und Netzwerk-Rückkehr. |
| Sicherheit und Berechtigungen | 59 % | Teilweise implementiert | Dashboard bleibt Admin-/Diagnosewerkzeug. Companion BrowserWindow erzwingt Context Isolation, Chromium-Sandbox, kein Node, keine Navigation/Fenster/Berechtigungen und eine ephemere Session; Preload exportiert vier benannte Methoden, Renderer-Code sieht nur geschlossene gerenderte Zustände unter No-Network-/No-Inline-CSP. Das Paket enthält keine Profile/Buildpfade, startet mit deaktivierten Core Dumps und erzeugt seine Runtime-Closure ohne Netzwerk aus dem eingefrorenen Lockfile statt aus Registry-Metadaten. Kontextrollen-, Prompt- und Approval-UX-Gates fehlen. |
| Tests | 90 % | In Arbeit | Web hat 34, Companion-Core 18, Companion-Shell 23 und Appearance 93 Tests. Die Appearance-Suite bindet Codecs, Projektion, Fallbacks, Golden Vectors und Parser-Robustheit; die Shell-Suite umfasst einen echten Foundation-/Vault-/Recovery-Prozesspfad, Sandbox-/Bridge-Smoke, `/proc`-Parser sowie den realen Debian-Lifecycle- und Tray-Ressourcengate. |
| Produktumfang | 34 % | Teilweise implementiert | Hintergrunddienst-Shell, erster Status-/Alarm-Renderer und installierbares Linux-Paket mit Autostart existieren; Avatar, Voice, produktive Profileinrichtung, Onboarding, Recovery-Entscheidungen, macOS/Windows, mobile Oberflächen und Alltagsflows fehlen. |

## Pico Protocol

Gemeinsames Paket für Protocol-Typen, kanonische Bytes und Kompatibilitätsgrenzen.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Foundation-Typen | 95 % | In Arbeit | Event-Typen einschließlich geschlossener Origin-Klassen und client-schreibbarer Rollen sowie Identity-, Home-, Share-, Freshness-, Custody-, Sync-, Link-, Lifecycle-, Recovery-, Root-Rotation-, Host-Continuity- und Appearance-Claim-Typen sind Runtime-Exports. |
| Kanonische Bytes und Vektoren | 98 % | Weitgehend fertig | Memory-AD sowie alle implementierten Identity-, Home-, Vault-, Sync-, Link-, Recovery- und Rotation-Familien besitzen autoritative positive und negative Vektoren; Appearance ergänzt gepinnte Profile-, Core-, Dokument- und Fallback-Vektoren. |
| Draft-Fixtures | 35 % | Konzipiert | Pico Home Link und Model Delegation bleiben draft-only ohne Runtime- oder Kompatibilitätsanspruch; Pico Link Direct besitzt dagegen einen bewusst begrenzten Runtime-Vertrag ohne öffentlichen Kompatibilitätsclaim. |
| Validierung und Conformance | 86 % | In Arbeit | Protocol- und Appearance-Tests binden Runtime-Exports, ADR-Bytes, rekursiv kanonische Record-Digests, Dokumentgrenzen, Golden Vectors und Fixture-Suiten; ein eigenständiger Conformance-Runner und ein öffentlicher Link-Vertrag fehlen. |
| Tests | 97 % | Weitgehend fertig | Protocol hat 78 Tests für Exportlisten, Payloads, Validierung, Lifecycle, Recovery, Rotation, Continuity, Appearance-Claims und Fixture-Bytegleichheit; Appearance ergänzt 93 Codec-, Projektions-, Fallback-, Vector- und Robustheitstests. |

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
| Architektur | 92 % | In Arbeit | Key-Rollen, Delegation, Revocation, Lifecycle, Reader-Custody, Recovery und mehrsignierte Root-/Host-Key-Ketten sind abgegrenzt. |
| Kernfunktionen | 93 % | In Arbeit | Fingerprints, Possession, Lifecycle, Recovery, Root-Rotation, Host-Continuity und Owner-/Reader-/Writer-Signaturen werden kanonisch geprüft. |
| Sicherheit und Berechtigungen | 94 % | In Arbeit | Exakte Scope-, Vorgänger-, Nachfolger-, Home-, Device-, Reader- und Order-Bindung mit Veto, Rollback-Schutz und Vorgängerentzug ist implementiert. |
| Integration mit anderen Pico-Komponenten | 93 % | In Arbeit | Core, Home, Vault, Link, Sync und Companion nutzen Identity-Evidence für Sessions, Lifecycle, Recovery, Rotation, Continuity, Readership und Envelope-Issuance. |
| Tests | 96 % | Weitgehend fertig | Identity hat 34 Tests plus autoritative Fixtures; Core, Vault-Daemon und Companion ergänzen Prozess-, Integrations- und Negativfälle. |

## Pico Vault

Lokale Key-Custody-Runtime für Person- und Device-Keys, bestehend aus der Bibliothek `@pico/vault` und dem lokalen Vault-Daemon mit CLI (`apps/vault-daemon`).

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Kernfunktionen | 97 % | In Arbeit | Vault erzeugt und öffnet Keyfiles, signiert rollenbegrenzt, verwaltet KEKs, verschlüsselt Items und bedient Claim-, Domain-, Membership-, Reader-, Recovery-, Device-, Root- und Host-Key-Ceremonies über getrennte Sessions. |
| Datenhaltung | 78 % | Teilweise implementiert | Verschlüsselte Rollen-Keyfiles, geschützte Pfade, Backup-Trennung und ein externer Recovery-Anker existieren; Recovery Cards sind der eng begrenzte absichtliche Export. Ein Platform-Keystore fehlt. |
| Sicherheit und Berechtigungen | 96 % | In Arbeit | Argon2id, XChaCha20-Poly1305, Ed25519, X25519 Sealed Boxes, Rollen-/Label-Checks, Auto-Lock, Zeroization und signaturgenaue Approvals sind vorhanden; Secret-Lifetime-Grenzen decken weder JS-/WASM-Kopien noch Core Dumps oder Swap vollständig ab. |
| Integration mit anderen Pico-Komponenten | 96 % | In Arbeit | Vault bedient Foundation-, Home-, Identity-, Link-, Recovery-, Rotation-, Reader- und Sync-Ceremonies über reale Daemon-Prozesse; Recovery-CLI-Wrapper verlangen PIN und geben PDFs mit Modus `0600` aus. |
| Installation und Betrieb | 55 % | Teilweise implementiert | Daemon und `pico-vault`-CLI laufen unter Linux mit Einzelinstanz-, Socket-, Unlock- und Audit-Schutz; Platform-Keystore, Produktintegration, Paketierung/Autostart sowie macOS-/Windows-Transport fehlen. |
| Tests | 98 % | Weitgehend fertig | Vault hat 18 Real-Crypto-Tests; der Vault-Daemon hat 92 Tests einschließlich realer Recovery-, Root-Rotations- und Host-Continuity-Ceremonies. |

## Pico Home

Lokale Host-Instanz für Claim, Mitgliedschaft, Betrieb und Verwaltung eines Pico Homes.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Architektur | 95 % | In Arbeit | Home Host, Claim, Membership, Lifecycle, Recovery, Identity-Root-Rotation, Host-Key-Continuity, Custody sowie lokale Operator-, Link- und Relay-Authority sind abgegrenzt. |
| Kernfunktionen | 96 % | In Arbeit | Home-/Device-Lifecycle, Recovery, Root-Rotation, Host-Key-Continuity, Share-Envelopes, Reader-Custody und Rotation Debt funktionieren lokal. |
| Schnittstellen | 94 % | In Arbeit | Home-Routen verlangen autorisierten Transport; Link Direct nutzt signierte, versiegelte Envelopes, und der eingeschränkte Continuity-Read veröffentlicht nur die verifizierbare Host-Key-Kette. |
| Datenhaltung | 96 % | In Arbeit | Founding-, Lifecycle-, Recovery-, Root-/Host-Rotations-, Reader-/Writer-/KEK- und Custody-Evidence werden atomar persistiert und beim Boot kryptographisch reconciliert. |
| Sicherheit und Berechtigungen | 97 % | In Arbeit | Authorities bleiben getrennt; Recovery, Veto, Reset, Restore, Lifecycle-Heads, Vorgängerentzug, Rotation Debt und fehlende Key-Custody schließen fail-closed. |
| Tests | 98 % | Weitgehend fertig | Core deckt Home-, Device-, Recovery- und Rotations-Ceremonies, Confused Deputy, Tamper, Rollback, Restore, Reset und Cross-Key-Swaps ab. |
| Installation und Betrieb | 55 % | Teilweise implementiert | Host-Key-Pfad, Backup-Ausschluss, Recovery-Anker, restore-geschlossener Boot und Reset-/Re-Seed-Marker existieren; First-Boot-/HA-Validierung sowie die Appliance-Gates IM1-IM3 für Plattformanker, Swap und attestationsverifizierten Digest-Updater fehlen. |

## Pico Link

Begrenzte Transportgrundlage für sichere Kommunikation zwischen Picos und dem eigenen Home; ein öffentlicher Relay-Vertrag ist nicht implementiert.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Architektur | 68 % | In Arbeit | Direct-Envelope, Carrier, Foundation-Handler, Continuity-Read und Relay-Authority sind getrennt; öffentliche Relay-, Routing- und Privacy-Verträge bleiben offen. |
| Kommunikation | 55 % | Teilweise implementiert | Der separate Listener akzeptiert den exakten Link-Intake und eingeschränkten Continuity-Read; Vault-, Identity- und Companion-Clients verwenden gepinnte, signierte und versiegelte Flows. Ein Relay-Adapter fehlt. |
| Sicherheit und Datenschutz | 65 % | In Arbeit | Host-/Device-Pins, verifizierte Host-Key-Ketten, kurze Gültigkeit, begrenzter Replay-Schutz sowie Parser-/Socket-Limits sind implementiert; Metadaten, Neustart-Replay, Seal-open-DoS und Rate-Limits bleiben offen. |
| Integration mit anderen Pico-Komponenten | 70 % | In Arbeit | Core-, Vault-, Identity-, Companion- und CLI-Prozesse führen Claim, Lifecycle, Recovery und Rotationen ohne Foundation-Bearer-Session über Link Direct aus. |
| Tests | 80 % | In Arbeit | Protocol-, Core-, Identity-, Companion- und Vault-Daemon-Tests prüfen Envelopes, Pins, Continuity, Replay, isolierte Routen, reale Prozessketten und fail-closed Neustarts; öffentliche Conformance fehlt. |

## Architekturentscheidungen und ADRs

- Es gibt 125 nummerierte ADRs sowie eine Implementation-Status-Matrix.
- Wichtige Entscheidungen betreffen Foundation-Grenzen, lokale Authentifizierung, Memory-Verschlüsselung, Identity/Vault-Custody, Home Authority, Domain Readership, Recovery, Key-Continuity, Companion-Betrieb und die lokale Vault-Prozessgrenze.
- ADR 0086 bis 0088 implementieren einen owner-rooted Reader-Custody-Slice mit transientem KEK, exakter Writer-Authority, opaken Item-Paketen, zusätzlichen Readern, expliziten Historienmodi und revocation-gekoppelter KEK-Rotation.
- ADR 0087 bindet Operator-Credentials und Sessions exakt an Founding und Host-Key-Custody; lokale Host-Infrastruktur bleibt von signierter Home-Governance getrennt.
- ADR 0089 bis 0093 implementieren identity-root-signierte Checkpoint-Adapter, reader-adressierte versiegelte Evidence-Batches, rollback-sichere Projektion, einen privaten crash-sicheren Floor, begrenzte Reader-Läufe, eine Ein-Batch-Pending-Inbox mit Stage–Apply–Consume–Ack und ein privates Projektionsarchiv mit idempotenten Receipts.
- ADR 0094 bis 0096 implementieren expliziten Item-Zugriff an den aktuellen Head, einen ephemeren Katalog mit state-gebundenen Selections und einen one-shot Reader-Zugriff mit verifiziertem Vault-Lock in jedem Exit-Pfad.
- ADR 0097 entscheidet die erste Vault-Produktform — CLI plus lokaler Daemon, Linux zuerst — und implementiert die lokale IPC-Authority-Grenze mit privatem Socket, benannten Request-Familien und hold-gebundenem Unlock.
- ADR 0098 bis 0103 implementieren Reader-Zugriff über ein connection-gebundenes Lease, per-Request-Approval, Ceremony-Signierung über den Daemon, daemon-seitige KEK-Familien, Mehrfach-Session-Unlock sowie reale Claim-, Domain-, Membership-, Reader- und Rotation-Ceremonies über getrennte Vault-Prozesse.
- ADR 0104 und 0105 binden Einstellungen an Pico statt Host-Konfiguration und legen den Hintergrund-Companion mit Avatar statt einer CLI als Produktform fest; die CLI bleibt Werkzeug für Setup und Diagnose.
- ADR 0106 rendert Approval-Aussagen aus denselben validierten Feldern, aus denen der Daemon die signierten Bytes baut.
- ADR 0107 implementiert den begrenzten Pico-Link-Direct-Slice mit isoliertem Intake und gepinnten Envelopes; daraus folgt kein Relay-, Public-Exposure- oder Kompatibilitätsclaim.
- ADR 0108 und 0109 implementieren das atomare First-Device-Founding und den authentifizierten späteren Device-Lifecycle mit Enrollment, Replacement-Renewal, Revocation und Neustart-Reconciliation.
- ADR 0110 implementiert zeitverzögerte Zero-Device-Recovery mit verpflichtendem PIN, Root-/Zielsignatur, Veto, Ablauf, atomarem Totalersatz und externem Recovery-Anker; kompletter Plattform-Rollback bleibt ohne monotonen Hardware-Anker erkennbar nicht lösbar.
- ADR 0112 und 0113 implementieren Recovery-CLI-Wrapper, den shellfreien Companion-Servicekern sowie Electron C1-C3 mit Tray, kritischen Notifications, Wake-/Netz-Adaptern, enger Preload-Bridge, realem Home-/Recovery-Prozessbeweis und geprüftem Linux-Paket samt Autostart, Ressourcenbudget, Core-Dump-Sperre und Currency-Pflicht; Recovery-Entscheidungsflächen und freigegebene Companion-Character-Assets fehlen.
- ADR 0114 und 0115 implementieren portable Identity-Root-Rotation pro Home sowie dreifach signierte Home-Host-Key-Continuity einschließlich realer Daemon-/Link-Prozesse; personseitige Root-Rotations-UX und geschützte Anzeige fehlen.
- ADR 0116 und 0117 sind produktionsblockierende Verträge für vertrauenswürdige Modellkontexte und origin-aware Actions. ADR 0116 W1 ist implementiert: `system`/`tool` sind am Client-Write-Pfad reserviert, Event-Origin ist serverseitig und nicht zugeordnete Writes werden `unattributed` markiert; W2-W6 und ADR 0117 X1-X5 bleiben offen.
- ADR 0118 bis 0123 dokumentieren Offline-Floor, Resource Exhaustion, konservative Zeit, Audit-Integrität, Supply Chain und Secret Lifetime. Diese Flächen sind überwiegend konzipiert; bestehende Zeroization und die Core-Dump-Sperre des Companion-Pakets decken nur Teile von ADR 0123 ab.
- ADR 0124 legt einen extern autorisierten, hash-gepinnten Character Core mit statischer, Composite- und optionaler Realtime-Darstellung fest; Modell, Bakes und Runtime-Consumer sind noch nicht implementiert.
- ADR 0125 definiert den versionierten Appearance-Kompatibilitätsvertrag. `@pico/appearance` implementiert Profile-/Dokument-Codecs, den eingefrorenen Compatibility Core V1, deterministische Projektion, Custom-Asset-Fallbacks, Parsergrenzen, Cache-Keys und gepinnte Vektoren; Renderer, Persistenz, Pico-Link-Sync, Generatorausführung und Character-Freigabe fehlen.
- Relay, Rules, Action Runner, vollständige Companion-UX und breite Produktintegration bleiben überwiegend konzipiert oder nur teilweise implementiert.

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
