# Pico Entwicklungsfortschritt

## Metadaten

| Feld | Wert |
| --- | --- |
| Standdatum | 2026-08-14 |
| Analysierter Branch | main |
| Analysierter Commit | 6121493 |
| Hinweis | Alle Prozentangaben sind Schätzungen auf Basis des committed Repository-Stands; parallele uncommittete Änderungen sind nicht eingerechnet. |

## Gesamtstatus

- Geschätzter Gesamtfortschritt: ca. 84 %.
- Nachgewiesener Funktionsumfang: lokale Foundation-APIs und Events, verschlüsselter Memory Store, Home- und Device-Lifecycle, Reader-Custody und Reader-Sync, zeitverzögerte Zero-Device-Recovery, Identity-Root- und Home-Host-Key-Rotation, ein lokaler Vault-Daemon mit realen Prozess-Ceremonies, Pico Link Direct sowie ein installierbarer Linux-Electron-Companion. Recovery Card und Founding Record besitzen jeweils genau eine kanonische Form; der Fresh-Vault-Bootstrap stellt den Root wieder her und erzeugt die Device-Keys im Daemon. Zeitgebundene Einträge und Spatial Recall laufen lokal ohne Modell und Netz; für Spatial Recall fehlt weiterhin die mobile Sensor-Runtime.
- Pico Relay ist als eigenständiger, authority-freier Vermittlungsdienst implementiert: beziehungsgebundene Mailboxes, versiegelte Adressübergabe, fünf exakte Routen, Core- und Companion-Collector, dauerhafte Acknowledgements und eng begrenzte Pushes, die ein Gerät nur zum Lesen auffordern. Er transportiert Pico-Link-Pakete unverändert. Das ist eine lokal getestete Runtime, kein betriebener Relay-Operator und kein öffentlicher Kompatibilitätsclaim.
- Zulieferer- und Modellpfad sind als erster zusammenhängender Slice vorhanden: ein gepinntes Depot wird per `git` in eine Core-eigene Arbeitskopie geholt, die Git-Library liefert begrenzte Exzerpte über eine Prozessgrenze, daraus entstehen quarantänierte Modelljobs, und eine gemessene Provider-Runtime arbeitet die Queue mit Kapazitäts-, Digest-, Allowance- und Lane-Grenzen ab. Ein Ergebnis wird nur durch die ausdrückliche Keep-Entscheidung der Person zum Memory-Item und behält dabei Zulieferer, Commit und Pin-Aussage. Kein Provider-Eintrag und kein fremdes Depot wird standardmäßig ausgeliefert oder automatisch angebunden.
- Einstellungsstand: Memory-Verschlüsselung und Relay-Account-Identität liegen dauerhaft in Pico; bestehende Hostwerte werden nur als sichtbar markierte Herkunft übernommen. Das Dashboard zeigt und ändert diese Home-weiten Entscheidungen. Es zeigt außerdem gemessene Provider mit Messdatum sowie gemessener und wirksamer Grenze; eine Verengung darf nie erweitern. Persönliche Provider-Entscheidungen und wartende Reads laufen getrennt über Pico Link zur Companion, damit Host-Administration nicht für Bewohner entscheidet.
- Sicherheitsstand: Foundation Operator, Home Host, Identity Root, Device, Domain Owner, Reader, Writer, Vault, Companion, Transport und Relay bleiben getrennte Authorities. Client-Writes können keine reservierten Rollen oder Origins behaupten; Herkunftslabels werden controllerseitig berechnet, durch Regel- und Approval-Verträge getragen und beim Rendern fremder Inhalte sichtbar gemacht. Provider ohne nachgewiesene Identität dürfen nur den Live-Turn sehen; die breitere Allowance verlangt Credential-Referenz und geschützten Transport. Relay-Pakete nennen außen weder Pico-Identität noch Inhalt, Priorität oder Zweck, bleiben aber durch Timing- und Größenmetadaten beobachtbar.
- Offene Produkt- und Betriebsflächen: terminalfreies Home-Founding und Device-Binding, freigegebener Character Core, Appearance-Renderer/-Persistenz/-Sync, Avatar und Voice, weitere Platform-Keystores, Android sowie macOS-/Windows-Transport, Protected Display, reale Home-Assistant-Installation, betriebener Relay-Operator und breite Alltagsintegration. Pico Rules und der Runner besitzen einen testgebundenen Kernpfad mit `depot.fetch` als erster echter Wirkung; ein Planner-Produktpfad und ein breiter Action Catalog mit realen Ausführern fehlen.
- Produktionsblockierende Grenzen: Supply-Chain-Gates sind vorhanden, eine Attestation wird für dieses private Repository aber nicht gespeichert; digest-verifizierter Deployment-Pfad, Non-root-/AppArmor-Container und produktiver Plattformanker fehlen. Vollständiger Dateisystem-Rollback bleibt ohne externen monotonen Anker nicht lösbar. JavaScript-/WASM-Kopien und Swap liegen außerhalb der Secret-Lifetime-Kontrollen. Der lokale Modellhost ist gemessen, aber nicht als produktiv verwalteter Provider deployt; Inferenz-Runtimes können Klartext außerhalb von Picos Shred-Kontrolle protokollieren. Pico Link Direct besitzt weiterhin keinen neustartfesten Replay-Schutz, und Relay-Metadaten sind nicht anonym.
- Verifizierter Gate: `pnpm release:verify` umfasst 21 Schritte — `license`, `version`, `addon`, `product`, `settings`, `surface`, `design-system`, `companion`, `link`, `relay`, `push`, `browser`, `time`, `offline`, `supply`, `build`, `module`, `supplier`, `companion:release-check`, `check`, `test`. Am analysierten Commit sind 2.182 Tests belegt: Core 917, Protocol 577, Appearance 93, Relay 29, Web 66, Sync 26, Identity 34, Vault 19, Link-Relay-Client 9, Vault-Daemon 110, Companion-Core 135, Companion-Shell 91 sowie Module Kalender 22, Depot 16, Home Assistant 16 und Spatial Recall 22. Der Offline-Boden erzwingt sechs von sechs Familien über 52 erreichbare Module; `module:check` findet vier von vier Module, zwei davon wirkend (Kalender, Depot), und `supplier:check` prüft den ausgelieferten Git-Library-Zulieferer. Der Gate kennt 53 klassifizierte Flächen, zehn kanonische Formen, 61 tatsächlich bediente Routen und 22 klassifizierte Umgebungswerte.
- Linux-Paketstand: Electron 43.4.0, sieben Prozesse und 38 Module in der statischen Tray-Starthülle. Der reale Debian-Lifecycle für Install, Upgrade, Remove und Purge ist grün. Die lokale `user_namespace`-Probe misst 222.669.824 Byte PSS gegen 225.000.000 und 95.821.824 Byte `Private_Dirty + Private_Hugetlb` gegen 110.000.000; beide Gates sind damit auch ohne root-eigenen Paket-Probe erfüllt.

## Fortschritt der Pico-Hauptkomponenten

### Tatsächliche Komponenten

Diese Teile laufen als eigene Programme oder erscheinen auf Geräten und Bildschirmen.

| Pico-Komponente | Wofür ist das da? | Fortschritt | Status | Nachgewiesener Stand | Verbleibende Lücken |
| --------------- | ----------------- | ----------: | ------ | ------------------- | ------------------- |
| Pico Home | Das Gerät oder System zu Hause, auf dem ein oder mehrere Picos betrieben werden. Es stellt Rechenleistung, Speicher und die Verbindung im Heimnetz bereit; auf ihm läuft im Hintergrund die Core-Software. Zuerst ist dafür Home Assistant vorgesehen. Wer das Home verwaltet, darf dadurch nicht automatisch persönliche Inhalte lesen. | 94 % | In Arbeit | Founding, Lifecycle, Recovery, Root-/Host-Rotation, Reader-Custody und Relay-Mailbox-Buch werden dauerhaft und fail-closed reconciliiert. Home-weite Memory- und Relay-Entscheidungen liegen in Pico; Relay-Sweeps und Push-Floor laufen im Core. | Geschützte Produkt-Ceremonies, produktiver Plattformanker, reale HA-Validierung und breitere Verwaltungs-UX. |
| Pico Vault | Der private Kern eines persönlichen Pico. Hier werden Wissen, digitale Schlüssel, der Stand des Datenabgleichs und Sicherungen lokal aufbewahrt. Die Geräte und Bildschirme einer Person greifen von außen darauf zu. | 95 % | In Arbeit | Vault-Daemons führen Claim-, Domain-, Membership-, Reader-, Recovery-, Device-, Root- und Host-Key-Ceremonies mit hold-gebundenen Sessions und signaturgenauen Approvals aus; Linux `safeStorage` hält nur die profilgebundene Unlock-Hülle. | Produktiver Onboarding-Aufruf, weitere Platform-Keystores, eigenständige Daemon-Paketierung/Autostart, macOS-/Windows-Transport, Protected Display und Betriebshärtung. |
| Pico Surfaces | Die Geräte und Bildschirme, über die ein Mensch mit Pico spricht oder Pico bedient. Sie zeigen Antworten und Rückfragen an, nehmen Eingaben entgegen und speichern selbst möglichst wenig. Heute gibt es die Übersicht im Browser und die Linux-App; später sollen etwa Smartwatches und kleine Displays dazukommen. | 69 % | Teilweise implementiert | Das frameworkfreie Dashboard bedient Foundation-Diagnose, Termine, Memory-/Relay-Einstellungen und die gemessene Provider-Ansicht. Die Linux-Companion trägt Erstlauf, Keystore-Sessions, Recovery, Approval, Provider-Entscheidungen und ausdrückliches Keep wartender Reads durch einen sandboxed Renderer. | Freigegebener Character Core, Appearance-Renderer/-Persistenz/-Sync, Voice, Avatar-Zustände, mobile sowie macOS-/Windows-Flächen und breitere Alltagsflows. |
| Pico Relay | Ein optionaler Vermittlungsserver für den Fall, dass sich ein Gerät und ein Pico Home nicht direkt erreichen können. Er bewahrt verschlüsselte Nachrichten vorübergehend auf und leitet sie weiter. Er kann sie nicht lesen und entscheidet nichts für ein Pico. | 76 % | Teilweise implementiert | Ein eigenständiger SQLite-Dienst registriert begrenzte Mailboxes, nimmt versiegelte Pakete an und bietet Abholung, Acknowledgement sowie Deregistrierung über fünf feste POST-Routen. Getrennte Clients, Core-/Companion-Sweeps und Pushes schließen den lokal getesteten Weg. | Real betriebener Operator, produktiver Account-Lifecycle, Deployment/TLS/Monitoring, Abuse-Schutz über Quoten hinaus, festgelegte Tombstone-Aufbewahrung und weitere Metadatenminimierung. |

### Technische Bausteine, Protokolle und Schichten

Diese Teile arbeiten innerhalb der tatsächlichen Komponenten oder unsichtbar im Hintergrund. Sie führen deren Aufgaben aus und legen fest, wie Daten ausgetauscht, abgeglichen und geschützt werden.

| Pico-Komponente | Wofür ist das da? | Fortschritt | Status | Nachgewiesener Stand | Verbleibende Lücken |
| --------------- | ----------------- | ----------: | ------ | ------------------- | ------------------- |
| Pico Core | Die Software, die innerhalb eines Pico Home dessen Aufgaben erledigt. Sie nimmt Anfragen entgegen und koordiniert Speicherung, Hintergrundaufgaben, Regelprüfungen und Verbindungen. Sie ist kein eigenes Pico und besitzt keine persönlichen Inhalte. | 96 % | In Arbeit | Persistiert und reconciliiert Home-, Device-, Reader-, Recovery-, Rotations- und Custody-Evidence; trägt serverkontrollierte Origins, acht Q5-gedeckelte Stores, Provider-/Job-Registry, Depot-Fetch, Library-Intake, Action-Pfad sowie Relay- und Push-Orchestrierung. | Produktionsbetrieb, externe Freshness, attestierter Deployment-Pfad, Planner, breiter Action Catalog, mobile Capture-Runtime und reale HA-Installation. |
| Pico Rules | Prüft vor jeder geplanten Handlung, ob Pico sie ausführen darf, ablehnen muss oder zuerst die Person fragen soll. Die Regeln lesen festgelegte Fakten und Herkunftsangaben, aber nicht den Inhalt fremder Texte. | 84 % | In Arbeit | Drei feste Ergebnisse, geschlossene Eingaben, Ablehnung bei Unbekanntem, dauerhafte Entscheidungen je Handlung und Datenbereich sowie die Trennung von Entscheidung und Ausführung sind implementiert. | Verständliche Regelverwaltung, Vererbung und Zusammensetzung, breitere Kontextregeln, Planner-Anbindung und Bewährung an vielen realen Handlungen. |
| Action Runner | Führt eine zuvor geprüfte und freigegebene Handlung genau so aus, wie sie entschieden wurde. Er darf nichts ergänzen, umdeuten oder durch einen zweiten Versuch an der Entscheidung vorbeiführen. | 75 % | Teilweise implementiert | Aufgezeichnete Anträge und Entscheidungen, begrenzte Ausführungsrechte, anwesende und zeitlich begrenzte Freigaben sowie die nachvollziehbare Action History sind testgebunden. `depot.fetch` ist die erste reale Wirkung. | Breiter Action Catalog, weitere echte Ausführer, vollständige Produktoberfläche, Planner-Anbindung und belastbarer Betrieb über wenige Kernwirkungen hinaus. |
| Pico Bridges und Libraries | Damit kann Pico Informationen aus anderen Systemen oder aus bereitgestellten Dokumentsammlungen verwenden. Eine Bridge fragt ein anderes System ab; eine Library liest eine lokale Sammlung auch ohne Netz. Der Core kontrolliert beides, während fremder Code zur Sicherheit getrennt läuft. | 71 % | Teilweise implementiert | Eine Git Library liefert festgelegte Ausschnitte mit Herkunft und Versionsstand an den geschützten Leseweg. Abruf, Arbeitskopie, getrennte Ausführung und persönliche Zuordnung funktionieren lokal. | Reale Bridges, breitere Dateiformate, einfache Einrichtung, Zugangsdaten-Ceremonies, signierte fremde Quellen und belastbarer Betrieb. |
| Pico Protocol | Die gemeinsamen Spielregeln für alle Pico-Teile. Sie legen fest, wie Nachrichten und Daten aufgebaut sind, damit verschiedene Geräte einander verstehen und fehlerhafte Angaben ablehnen können. Pico Protocol ist selbst kein laufendes Programm. | 96 % | In Arbeit | Identity-, Home-, Vault-, Sync-, Direct-Link-, Relay-Mailbox-, Push-, Recovery- und Rotationsfamilien sind mit positiven und negativen Vektoren testgebunden. Supplier, Depot, Action, Rules, Approval, Model Provider, Model Job/Result und Herkunftsverträge sind Runtime-Subpfade. | Eigenständiger Conformance-Runner, veröffentlichte Pico-Link-Semantik, produktive Capability Negotiation und Kompatibilitätszertifizierung. |
| Pico Sync | Sorgt dafür, dass die Daten eines Pico auf eigenen oder ausdrücklich freigegebenen Geräten auf demselben Stand bleiben. Es überträgt geschützte Änderungen und erkennt fehlende, veraltete oder widersprüchliche Stände. | 72 % | In Arbeit | Opaker Transport, Checkpoint-Adapter, versiegelte Reader-Batches, rollback-sichere Projektion, privater atomarer Client-State, Pending-Inbox, Projektionsarchiv sowie expliziter Item-Zugriff sind implementiert. | Deployte Netzwerkadapter, Hintergrundorchestrierung, Cross-Process-Koordination, Multi-Node-Betrieb, Archiv-Compaction und vollständige Recovery-Semantik. |
| Pico Identity | Prüft, ob ein Pico oder Gerät wirklich das bekannte Gegenüber ist und weiterhin vertraut werden darf. Nach einem Gerätewechsel oder Verlust hilft es, dieses Vertrauen sicher neu aufzubauen. Die geheimen Schlüssel selbst speichert es nicht. | 86 % | In Arbeit | Lifecycle, Recovery und dual signierte Identity-Root-Rotation werden bindungsgenau geprüft; angenommene Rotationen entfernen Vorgänger-Autorität und erzeugen nachverfolgte Rotation Debt. | Personseitige Root-Rotations-Ceremony, erzwungene Recovery-Card-Neuausgabe, externe Freshness und Registry-Transparenz. |
| Pico Link | Der sichere Kommunikationsweg zwischen Picos, Geräten und Pico Homes. Er funktioniert direkt oder benutzt einen Pico Relay als Zwischenstation; Pico Link ist selbst kein Server. Die lokale Webseite des Pico Core ist nicht dieser Verbindungsweg. | 78 % | In Arbeit | Signierte und versiegelte Direct-Anfragen und -Antworten, transportneutrale Relay-Pakete, Adressen und Push-Formate sind implementiert. Core, Vault und Companion verwenden dieselben Authority-Grenzen unabhängig vom Transportweg. | Öffentlicher Wire-/Conformance-Vertrag, Capability Negotiation, vollständige Transport-Fassade, neustartfester Replay-Schutz, Traffic-Analysis-Härtung und breite Produktkanäle. |
| Pico Home Link | Der geregelte Verbindungsweg zwischen einem persönlichen Pico und seinem Pico Home. Darüber kann ein Pico einziehen, seine Zugehörigkeit nachweisen und die Dienste seines Homes verwenden, ohne dass die Home-Verwaltung seine privaten Inhalte lesen darf. | 58 % | In Arbeit | Versiegelte Direct-Anfragen tragen ausgewählte Setup-, Claim-, Authority-, Lifecycle-, Storage-, Provider- und Memory-Abläufe zwischen Vault beziehungsweise Companion und dem eigenen Home. | Eigenständiger öffentlicher Vertrag, vollständige Move-in-, Residency-, Sync- und Routing-Semantik, Capability Negotiation, Conformance und breite Transportadapter. |

## Pico Core

Lokaler Foundation-Service für APIs, Events, Memory, Auth und Pico-Home-Betrieb.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Architektur | 97 % | In Arbeit | Store-, Session-, Home-/Device-, Recovery-, Root-/Host-Rotation-, Custody-, Supplier-, Model-, Action-, Relay- und Link-Grenzen sind explizit; Relay und Transport besitzen keine Identity-, Policy- oder Decryption-Authority. |
| Kernfunktionen | 97 % | In Arbeit | Events, verschlüsseltes Memory, Termine, Beobachtungen und Orte sowie Lifecycle-, Recovery- und Custody-Flows funktionieren lokal. Hinzu kommen gepinnter Depot-Fetch, Library-Intake, Modelljob-Queue/-Runtime, ausdrückliches Keep, Relay-Collection und begrenzte Pushes. Mobile Sensorik, Planner und breite Executor-Integration fehlen. |
| Pico Rules | 84 % | In Arbeit | Entscheidungen lesen eine geschlossene, typisierte Eingabe ohne fremde Prosa, behandeln Unbekanntes als Ablehnung und werden vor der Ausführung dauerhaft je Wirkung und Datenbereich festgehalten. Eine breite, personengerechte Regelsprache und Produktoberfläche fehlen. |
| Action Runner | 75 % | Teilweise implementiert | Der Runner erhält nur den aufgezeichneten Antrag und die aufgezeichnete Entscheidung, führt mit risikobegrenzten Rechten aus und protokolliert Ergebnis und Prüfkette. Presence-gebundene Approvals sowie `depot.fetch` laufen; breite reale Ausführer fehlen. |
| Erweiterungen und Datenquellen | 71 % | Teilweise implementiert | Der Core verwaltet Bridges zu anderen Systemen und Libraries mit bereitgestellten Dokumentsammlungen, führt ihren Code aber aus Sicherheitsgründen getrennt aus. Eine Git Library kann festgelegte Ausschnitte mit Herkunft und Versionsstand in den geschützten Leseweg liefern; reale Bridges, breitere Dateiformate, einfache Einrichtung und signierte fremde Quellen fehlen. |
| Datenhaltung | 98 % | In Arbeit | 18 Migrationen (`0001_initial_schema` bis `0018_pico_link_relay_identity`) bilden Modul-/Rule-Entscheidungen, Supplier/Depot, Relay-Mailboxes und Push-Ledger, Provider-Messungen und personenbezogene Entscheidungen, Modelljobs samt Provenienz sowie Pico-eigene Settings ab. Acht Hochwachstums-Stores besitzen Q5-Obergrenzen; Arbeitskopien und Supplier-Scratch sind reconciliierte Dateiartefakte, keine autoritativen Stores. Alte Entwicklungsdatenbanken mit unbekannten konsolidierten Migrationen werden fail-closed abgewiesen. |
| Schnittstellen | 96 % | In Arbeit | Foundation-, Pico-Link- und Relay-Flächen bleiben getrennt. 61 bediente Routen sind gegen die Flächendokumentation geprüft; persönliche Provider-/Keep-Entscheidungen sind identity-gebunden, Home-weite Mess- und Setting-Flächen host-admin-gebunden. |
| Sicherheit und Berechtigungen | 98 % | In Arbeit | Signierte Authority, Vorprüfungen gegen Status-Orakel, Recovery-Anker, Rotation Debt, serverkontrollierte Origins, geschlossene Rule-Eingaben, presence-gebundene Approvals und fail-closed Ressourcenpfade sind testgebunden. Attestation, verifizierter Deployment-Pfad und Container-Härtung bleiben offen. |
| Tests | 99 % | Weitgehend fertig | Core hat 917 Unit-, Crypto-, Restore-, Authority-, Lifecycle-, Recovery-, Continuity-, Supplier-, Model-, Relay-, Ressourcen-, Zeit-, Audit- und API-Tests. Zeitabhängige Suiten benennen ihre Uhr; lokale Listener und reale Git-/Prozessgrenzen werden mitgeprüft. |
| Installation und Betrieb | 66 % | Teilweise implementiert | Zweistufiges Image, CI-Smokes, App-Metadaten, Backup-Ausschlüsse, Recovery-Anker und restore-geschlossener Boot existieren. Reale HA-Validierung und Appliance-Gates für Plattformanker, Swap und attestationsverifizierten Updater fehlen. |

## Pico Surfaces

Benutzeroberflächen für Diagnose, Companion-Interaktion und Alltagsflows.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Benutzeroberfläche | 71 % | Teilweise implementiert | Das Dashboard zeigt Diagnose, Termine, Herkunftsmarkierung fremder Inhalte, Pico-eigene Memory-/Relay-Einstellungen sowie gemessene Provider mit Datum und Narrowing. Die Companion besitzt Tray-, Recovery-, Approval-, Provider- und Read-Keep-Flächen; drei Zustände unterscheiden unentschieden, abgelehnt und erlaubt. |
| Integration mit Pico Core | 84 % | Teilweise implementiert | Web nutzt lokale Core-Endpunkte. Electron Main verbindet Profil, Vault-Daemon und Companion-Core; Provider- und Read-Flows laufen Renderer–Preload–Main–Runtime–Pico Link, wobei jeder Aufruf den aktuellen Host-Pin und die aktuelle Device-Session verwendet. |
| Sicherheit und Berechtigungen | 82 % | Teilweise implementiert | Dashboard bleibt Admin-/Diagnosewerkzeug. BrowserWindow erzwingt Context Isolation, Sandbox, kein Node und eine ephemere Session; Wire-Antworten werden geparst und fremde Werte nur per `textContent` gerendert. Credential-Referenzen, Keystore-Inhalte und Read-Werte vor der Keep-Entscheidung erreichen den Renderer nicht. Protected Display und weitere Plattformen fehlen. |
| Tests | 97 % | Weitgehend fertig | Web hat 66, Companion-Core 135, Companion-Shell 91 und Appearance 93 Tests. Echte Foundation-/Vault-Prozesspfade, IPC-/Preload-Drift, Renderer-Aufrufe, Debian-Lifecycle, Electron-Smoke und Tray-Ressourcen sind im Gate gebunden. |
| Produktumfang | 59 % | Teilweise implementiert | Hintergrunddienst-Shell, Linux-Keystore-Session-Owner, Recovery-Card-Erstlauf, Termine, Recovery/Approval, Provider-Entscheidung und Read-Keep existieren als installierbarer Linux-Slice. Avatar, Voice, Appearance-Ausführung, mobile und Desktop-Cross-Platform-Flächen fehlen. |

## Pico Protocol

Gemeinsames Paket für Protocol-Typen, kanonische Bytes und Kompatibilitätsgrenzen.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Foundation-Typen | 99 % | Weitgehend fertig | Neben Identity-, Home-, Vault-, Sync-, Recovery-, Appearance-, Observation- und Modulverträgen sind Supplier, Depot, Action, Rules, Approval, Model Provider/Job/Result sowie Link Packet/Mailbox/Delivery/Push als schmale Runtime-Subpfade exportiert. |
| Kanonische Bytes und Vektoren | 99 % | Weitgehend fertig | Alle signierten implementierten Identity-, Home-, Vault-, Direct-Link-, Push-, Recovery- und Rotationsfamilien besitzen autoritative positive und negative Vektoren. Nicht signierte Relay-Carrier werden durch strikte Parser- und Removed-Field-Vektoren gebunden. |
| Draft-Fixtures | 52 % | Konzipiert | Historische Pico-Home-Link- und Model-Delegation-Platzhalter tragen keinen Runtime-Claim; mehrere alte Link-Drafts sind ausdrücklich superseded. ADR 0146 bleibt ein nicht angenommener Sketch ohne Matrixzeile. |
| Validierung und Conformance | 92 % | In Arbeit | Runtime-Exports, geschlossene Felder, rekursive Digests, Origins, Allowances, Limits und Golden Vectors sind testgebunden. Ein eigenständiger Conformance-Runner und ein öffentlicher Pico-Link-Vertrag fehlen. |
| Tests | 99 % | Weitgehend fertig | Protocol hat 577 Tests; Appearance ergänzt 93 Codec-, Projektions-, Fallback-, Vector- und Robustheitstests. |

## Pico Sync

Grundlage für lokale Replikation, Versionierung und Konfliktabgleich.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Kernfunktionen | 84 % | In Arbeit | LamportClock, Version Vectors, opake Mailboxes, idempotente Publikation, striktes Paging, Reader-Custody-Projektion, begrenzte Reader-Läufe, privates Projektionsarchiv sowie Katalog und one-shot Item-Präsentation sind implementiert. |
| Kommunikation | 45 % | Teilweise implementiert | Ein byte-orientierter Transportvertrag und In-Memory-Referenzadapter existieren; der neue Pico-Link-Relay-Slice transportiert Direct-Envelopes, ist aber noch kein produktiver Sync-Netzwerkadapter. |
| Sicherheit und Konfliktbehandlung | 86 % | In Arbeit | Exakte Scope-Pins, Manifest-/Evidence-Prüfung, Replay-Idempotenz sowie Rollback-, Gap-, Fork-, Expiry- und Cross-Scope-Rejection sind implementiert. |
| Integration mit anderen Pico-Komponenten | 74 % | In Arbeit | Vault erzeugt und öffnet reader-adressierte Batches; Sync projiziert erst nach durablem Floor-Commit; Core akzeptiert Freshness über die strukturelle Sync-Source-Grenze. |
| Datenhaltung | 80 % | In Arbeit | Pins, signierter Floor, `verifiedAt` und untrusted Cursor liegen in privatem atomarem State; ein versiegelter Pending-Batch und ein auf 1.000 Records/256 MiB begrenztes Projektionsarchiv sind crash-sicher. |
| Tests | 92 % | Weitgehend fertig | Sync hat 26 Tests für Transport, Paging, Limits, Tamper, Replay, Rollback, Gap, Fork, Expiry, Restore, Pending-/Floor-Recovery, Archiv und Zugriffs-Lebenszyklus. |

## Pico Identity

Identitäts- und Signaturbausteine für Pico-, Device- und Lifecycle-Authority.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Architektur | 92 % | In Arbeit | Key-Rollen, Delegation, Revocation, Lifecycle, Reader-Custody, Recovery und mehrsignierte Root-/Host-Key-Ketten sind abgegrenzt. |
| Kernfunktionen | 93 % | In Arbeit | Fingerprints, Possession, Lifecycle, Recovery, Root-Rotation, Host-Continuity und Owner-/Reader-/Writer-Signaturen werden kanonisch geprüft. |
| Sicherheit und Berechtigungen | 94 % | In Arbeit | Exakte Scope-, Vorgänger-, Nachfolger-, Home-, Device-, Reader- und Order-Bindung mit Veto, Rollback-Schutz und Vorgängerentzug ist implementiert. |
| Integration mit anderen Pico-Komponenten | 94 % | In Arbeit | Core, Home, Vault, Direct Link, Relay-Envelope-Pfade, Sync und Companion nutzen Identity-Evidence; der Relay selbst erhält keine Identity-Authority. |
| Tests | 96 % | Weitgehend fertig | Identity hat 34 Tests plus autoritative Fixtures; Core, Vault-Daemon und Companion ergänzen Prozess-, Integrations- und Negativfälle. |

## Pico Vault

Lokale Key-Custody-Runtime für Person- und Device-Keys, bestehend aus `@pico/vault` und dem lokalen Vault-Daemon mit CLI (`apps/vault-daemon`).

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Kernfunktionen | 97 % | In Arbeit | Vault erzeugt und öffnet Keyfiles, signiert rollenbegrenzt, verwaltet KEKs, verschlüsselt Items und bedient Claim-, Domain-, Membership-, Reader-, Recovery-, Device-, Root- und Host-Key-Ceremonies über getrennte Sessions. |
| Datenhaltung | 84 % | In Arbeit | Verschlüsselte Rollen-Keyfiles, geschützte Pfade, Backup-Trennung und Recovery-Anker existieren; Recovery Cards sind der eng begrenzte absichtliche Export. Linux hält eine private, OS-verschlüsselte und profilgebundene Unlock-Hülle. |
| Sicherheit und Berechtigungen | 97 % | In Arbeit | Argon2id, XChaCha20-Poly1305, Ed25519, X25519 Sealed Boxes, Rollen-/Label-Checks, Auto-Lock, Zeroization und signaturgenaue Approvals sind vorhanden. JS-/WASM-/IPC-String- und Swap-Grenzen bleiben. |
| Integration mit anderen Pico-Komponenten | 98 % | In Arbeit | Vault bedient Foundation-, Home-, Identity-, Link-, Recovery-, Rotation-, Reader- und Sync-Ceremonies über reale Daemon-Prozesse. Die Companion erneuert Device-Sessions und öffnet gerätegebundene Pushes, ohne den Root automatisch zu entsperren. |
| Installation und Betrieb | 62 % | Teilweise implementiert | Daemon und CLI laufen unter Linux; das Companion-Debian-Paket integriert `safeStorage`, libsecret und Kamera-Scan-Abhängigkeiten. Eigenständige Daemon-Paketierung/Autostart sowie macOS-/Windows-Transport fehlen. |
| Tests | 98 % | Weitgehend fertig | Vault hat 19 Real-Crypto-Tests; der Vault-Daemon hat 110 Tests einschließlich Karten-, Bootstrap-, Recovery-, Rotations-, Approval- und realer Prozess-Ceremonies. |

## Pico Home

Lokale Host-Instanz für Claim, Mitgliedschaft, Betrieb und Verwaltung eines Pico Homes.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Architektur | 97 % | In Arbeit | Home Host, Claim, Membership, Lifecycle, Recovery, Root-/Host-Key-Continuity, Custody sowie Operator-, Link- und Relay-Grenzen sind abgegrenzt. Relay-Account und Relay-Erreichbarkeit sind getrennt. |
| Kernfunktionen | 98 % | In Arbeit | Home-/Device-Lifecycle, Recovery, Rotationen, Share-Envelopes, Reader-Custody, Rotation Debt, Mailbox-Austausch, Relay-Collection, Push-Floor und Home-weite Settings funktionieren lokal. |
| Schnittstellen | 97 % | In Arbeit | Home-Routen verlangen autorisierten Transport; Link Direct nutzt signierte, versiegelte Envelopes. Persönliche Provider-/Read-Operationen sind sendergebunden, während der Relay nur Mailbox und Paket-Tag sieht. |
| Datenhaltung | 97 % | In Arbeit | Founding-, Lifecycle-, Recovery-, Rotations-, Reader-/Writer-/KEK-, Mailbox-, Push-, Provider- und Setting-Evidence werden atomar persistiert und beim Boot reconciliiert. |
| Sicherheit und Berechtigungen | 98 % | In Arbeit | Membership gewährt keine Readership; Operator entscheidet keine residentenspezifischen Provider- oder Depotfragen. Falsche Mailbox-/Signaturkombinationen, Replay, Restore und fehlende Key-Custody schließen fail-closed. |
| Tests | 99 % | Weitgehend fertig | Die Core-, Protocol-, Relay-, Client- und Companion-Suiten decken Home-Ceremonies, Relay-Transport, Mailbox-Isolation, Push-Grenzen, Tamper, Rollback, Restore und Confused Deputy ab. |
| Installation und Betrieb | 61 % | Teilweise implementiert | Host-Key-Pfad, Backup-Ausschluss, Recovery-Anker, restore-geschlossener Boot und Relay-Konfigurationsnaht existieren. First-Boot-/HA-Validierung und Appliance-Gates IM1–IM3 fehlen. |

## Pico Relay

Eigenständiger Vermittlungsdienst, der verschlüsselte Pico-Link-Pakete vorübergehend speichert und weitergibt, ohne ihren Inhalt oder die beteiligten Picos zu kennen.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Architektur | 93 % | Weitgehend fertig | Relay-Prozess, Store und Client sind von Core, Vault, Identity und Companion getrennt. Ein Relay-Account ist keine Pico-Identität; der Dienst besitzt keine persönlichen Schlüssel, Regeln, Mitgliedschaften oder Entschlüsselungsrechte. |
| Kernfunktionen | 90 % | Weitgehend fertig | Registrierung, Annahme, Abholung, Acknowledgement und Deregistrierung funktionieren mit Quoten, Mailbox-Kapazitäten, Ablaufzeiten und bleibenden Widerrufsmarken. Abholung löscht erst nach ausdrücklicher Bestätigung. |
| Schnittstellen | 88 % | In Arbeit | Der Server bietet fünf feste POST-Routen; Mailboxen stehen nie in URLs. Der getrennte Relay-Client prüft Antworten und Zeitlimits und wird von Home und Companion verwendet. |
| Datenhaltung | 90 % | Weitgehend fertig | SQLite hält Accounts, begrenzte Mailboxes, Tombstones und verschlüsselte Pakete bis Acknowledgement oder Ablauf. Volle Mailboxes verweigern neue Pakete, statt vorhandene zu verdrängen. |
| Sicherheit und Datenschutz | 84 % | In Arbeit | `relay:check` verhindert Zugriffe auf Pico-Stores und Identitätslogik. Der Relay sieht keine Pico-Identität oder Klartexte; sichtbar bleiben jedoch Account-Gruppierung, Zeitpunkt, Größe und Abholkorrelation. Eine geleakte Adresse kann bis zur Neuausgabe genau ihre Mailbox füllen. |
| Integration mit anderen Pico-Komponenten | 86 % | In Arbeit | Adressübergabe, Relay-Client, Core- und Companion-Collector, beide Sweep-Loops, dauerhafte Acknowledgements und gerätegebundene Pushes laufen lokal zusammen. Ein realer Operator ist nicht angebunden. |
| Installation und Betrieb | 25 % | Frühe Umsetzung | Server und Store laufen lokal und in echten Clienttests, aber ein ausgelieferter Start- und Deploymentpfad fehlt. Ebenso offen sind TLS-Terminierung, Account-Ausgabe und -Widerruf, Monitoring, Betreiberbetrieb und belastbare Aufbewahrungsregeln. |
| Tests | 94 % | Weitgehend fertig | Relay hat 29 Store-/Server-Tests, Link-Relay-Client 9 Tests gegen den echten Server; Core und Companion ergänzen Collector-, Transport-, Sweep-, Restore- und Push-Fälle. Boundary-Gates prüfen die Trennung von Identität und Datenhaltung. |

## Pico Link

Begrenzte Grundlage für sichere Kommunikation zwischen Picos und Homes. Direct ist als lokaler Laufzeitpfad implementiert; Pico Relay kann dieselben versiegelten Pakete vermitteln, bleibt aber eine eigene Komponente. Es besteht kein öffentlicher Kompatibilitätsclaim.

| Bereich | Fortschritt | Status | Kurzbeschreibung |
| --- | ---: | --- | --- |
| Architektur | 89 % | In Arbeit | Direct-Envelope, transportneutrales Relay-Paket, beziehungsgebundene Adresse und Push sind getrennt. Transport und Vermittlung erhalten keine Identity-, Policy-, Membership- oder Decryption-Authority. |
| Kommunikation | 78 % | Teilweise implementiert | Der Direct-Listener trägt signierte und versiegelte Anfragen und Antworten. Dieselben Envelopes können unverändert über den getrennten Relay-Client laufen; öffentliche Transport-Fassade, Capability Negotiation und breite Adapter fehlen. |
| Pico Home Link | 58 % | Teilweise implementiert | Ausgewählte `home.*`-Operationen tragen Setup, Claim, Authority, Lifecycle, Storage, Provider und Memory über Direct. Das ist ein realer Laufzeitpfad zum eigenen Home, aber noch kein veröffentlichter Home-Link-Vertrag oder Kompatibilitätsclaim. |
| Sicherheit und Datenschutz | 85 % | In Arbeit | End-to-end signierte und versiegelte Envelopes binden Gerät, Home, Operation, Antwortschlüssel und Gültigkeit. Kurzlebige Replay-Grenzen existieren; neustartfester Device-Replay-Schutz und Schutz gegen beobachtbare Transportmetadaten bleiben offen. |
| Integration mit anderen Pico-Komponenten | 86 % | In Arbeit | Core, Vault, Identity und Companion führen Authority-Flows über Direct aus und behalten dieselben Grenzen auf dem Relay-Weg. Provider-/Read-Entscheidungen und Push-Anlässe nutzen die sendergebundene Link-Schicht. |
| Tests | 94 % | Weitgehend fertig | Protocol 577 sowie umfangreiche Core-, Vault-Daemon- und Companion-Suiten prüfen Direct, Adressen, Pakete, Pushes, Tamper, Replay und falsche Bindungen. `link:check` verhindert Mailbox-Leaks in URLs, Logs und Fehlern; öffentliche Conformance fehlt. |

## Architekturentscheidungen und ADRs

- Es gibt 152 nummerierte Architekturdateien; die höchste Nummer ist 0152. ADR 0146 ist ausdrücklich ein nicht angenommener Draft-Sketch und besitzt daher keine Zeile in der Implementation-Status-Matrix. Entscheidungstext und Implementierungsstatus bleiben getrennt.
- ADR 0086 bis 0103 sind als Reader-Custody-, Sync- und Vault-Daemon-Slice mit realen Prozess-Ceremonies umgesetzt. ADR 0107 ist für den begrenzten Direct-Slice implementiert; daraus folgt weiterhin kein öffentlicher Wire-Claim.
- ADR 0104 ist teilweise umgesetzt: Memory-Verschlüsselung und Relay-Account-Identität sind Pico-eigene, persistierte Entscheidungen mit sichtbar markierter Host-Vererbung. Deploymentwerte wie Pfade, Bind-Adresse, Port, Relay-Basis-URL und Device-ID bleiben außerhalb; `settings:check` hält alle 22 Umgebungswerte an dieser Klassifikation.
- ADR 0110 bis 0115 tragen Recovery, Companion-Grundform, Root-Rotation und Host-Key-Continuity. Personseitige Root-Rotations-UX, erzwungene Card-Neuausgabe, weitere Plattformen und geschützte Anzeige bleiben offen.
- ADR 0116/0117 sind teilweise umgesetzt: reservierte Rollen, serverseitige Herkunft, strukturierte Kontext- und Read-Job-Verträge, controllerberechnete Argumentlabels, origin-tragende Results, ausdrückliches Keep und die ersten getrennten Darstellungen sind vorhanden. Ein produktiver Planner, ein breiter Tool-Executor und vollständige Fremdinhalt-Darstellung fehlen.
- ADR 0118 bis 0123 liefern Offline-Boden, Ressourcen-, Zeit-, Audit-, Supply-Chain- und Secret-Lifetime-Grenzen. Sechs Offline-Familien, acht Q5-gedeckelte Stores, konservative Zeitfenster und Audit-Kette sind implementiert; produktiver Providerbetrieb, Enrichment, Plattformanker und vollständige Secret-Erasure bleiben offen.
- ADR 0124/0125 definieren Character und Appearance. Der Appearance-Vertrag ist robustheits- und vektorengeprüft; freigegebener Character Core, Renderer, Persistenz und Sync fehlen.
- ADR 0127 bis 0129 sind als Modulgrenze, Home-Assistant-Connector-Vertrag und Spatial-Recall-Infrastruktur umgesetzt. Vier Module werden ausgeliefert; Kalender und Depot deklarieren Wirkungen. Home-Assistant-Transport und mobile Standortquelle sind bewusst nicht implementiert.
- ADR 0134/0135 sind umgesetzt. Formate werden bis zur ersten behaltenen Identität in place revidiert, und öffentliche Flächen sowie kanonische Formen besitzen maschinenlesbare Statusklassen.
- ADR 0136 bis 0138 besitzen Verträge, Custody, Prozessgrenze und einen laufenden Library-Slice. Ableitungen tragen Zulieferer und Pin, mehrere Instanzen bleiben ohne Vorrangordnung, und Reichweite nach außen bleibt bis zur getrennten Entscheidung aus. Allgemeine Bridges, Kostenabrechnung und breite Produktflächen fehlen.
- ADR 0139 bis 0141 sind im Kernpfad umgesetzt: untrusted Requester, geschlossene Pico-Rules-Eingabe, presence-gebundene Approval-Aussage, exakt ausführender Runner und Action History als Sicht über Event-Log plus Audit-Kette. `depot.fetch` ist die erste reale Wirkung; ein breiter Action Catalog und weitere Executor fehlen.
- ADR 0142/0151/0152 bilden den Modell-Provider-Slice: Parser, Messwerkzeug, Registry, personenbezogene Allowance, Job-Queue/-Runtime, Narrowing und Home-/Companion-Flächen sind implementiert. Eine falsche Credential-Probe wird gemessen, weil geschützter Transport allein keine Authentifizierung beweist. Produktiver Provider-Credential-Betrieb, belastbare Worst-Case-Warmup-Aussage und allgemeiner Planner bleiben offen.
- ADR 0143 ist weitgehend als gepinnter Depot-Fetch, Arbeitskopie, Supplier-Scratch, periodischer Action-Antrag, Library-Intake und personenbezogene Attachment-Fläche umgesetzt. Fremd-Depots besitzen weiterhin keine Autorenidentität oder Signatur. ADR 0144 ist nur teilweise umgesetzt: MCP muss hinter einer Bridge liegen, und Library-Code darf kein Netz erreichen; eine MCP-Bridge existiert nicht. ADR 0145 bleibt concept-only.
- ADR 0147 ist auf Vertragsniveau umgesetzt; ADR 0148 und 0150 sind implementiert. ADR 0149 besitzt Relay-Store, HTTP-Server, Client, Transport, Collector und beide Sweep-Loops, bleibt ohne real betriebenen Operator aber teilweise implementiert. Der Relay meldet Annahme, nie Zustellung, und entfernt erst nach Acknowledgement.
- Vollständige Companion-UX, produktiver Relay-/Providerbetrieb, öffentliche Kompatibilität, Planner und breite Action-Ausführung bleiben trotz des hohen Foundation-Reifegrads offen.

## Pflegeanweisung für Aktualisierungen

Wenn der Auftrag "aktualisiere progress.md" lautet, diese Datei anhand des aktuellen Repository-Stands aktualisieren:

1. Branch, Commit, vorhandenen Code, funktionsfähige Abläufe, Tests, Konfiguration, Deployment-Dateien und offene TODOs/Placeholder direkt prüfen.
2. Dokumentation und ADRs nur ergänzend verwenden; ein ADR gilt erst als umgesetzt, wenn passende Implementierung, Integration oder Tests vorhanden sind.
3. Bestehende Struktur, Reihenfolge und kurze Form beibehalten; Prozentwerte nur bei nachvollziehbarem Fortschritt oder neu erkannten Problemen ändern.
4. Die Datei beschreibt ausschließlich den absoluten Zustand am analysierten Commit. Keine Änderungschronik, keine Formulierungen wie "seit der letzten Aktualisierung" und keine Vergleiche mit einem früheren Stand aufnehmen.
5. Keine nächsten Blöcke, nächsten Schritte, Prioritäten, Reihenfolgen, Model-/Effort-Empfehlungen oder handlungsorientierten Einstiegspunkte aufnehmen. Solche Inhalte gehören in `.agent-context.md`.
6. Bestehende Aussagen durch den aktuellen Zustand ersetzen; Git-Historie und Commits bilden den zeitlichen Verlauf.
7. Offene Lücken und Risiken als gegenwärtige Eigenschaften benennen, nicht als Arbeitsplan formulieren.
8. Keine neuen Hauptkomponenten erfinden. Nur Pico-Knotenrollen und unabhängig betriebene Pico-Dienste als Hauptkomponenten führen. Offiziell benannte Protokolle, Entscheidungs- und Ausführungsbausteine in der technischen Übersicht sichtbar machen; ihre Details dürfen unter der tatsächlich ausführenden Komponente bleiben. Ansichten, Register, Zustände und Lieferwege nicht zu Komponenten hochstufen.
9. Fortschritt realistisch bewerten und klar zwischen konzipiert, dokumentiert, prototypisch umgesetzt, implementiert und praktisch funktionsfähig unterscheiden.
10. Ausschließlich `progress.md` verändern.
