# Externes Review vom 2026-09-09, gegen den Baum gemessen

**Status:** Messung abgeschlossen am 2026-09-10; Arbeitspakete als Vorschlag, noch nicht geschnitten
**Gegenstand:** ein externes Repository-Review über `main` bei `a2bcc1a` (2026-09-09), 28 Abschnitte
**Messstand:** `f698dab`, dreizehn Commits nach dem geprüften Stand; keiner davon berührt einen der Punkte, ausser dass `progress.md` weiter gewachsen ist

---

## Methode

Jeder Punkt wurde gegen den Baum gemessen, nicht gegen die Erinnerung: eine
Zeile Code, ein Lauf, ein Vektor. Vier Urteile sind möglich: **stimmt**,
**stimmt teilweise**, **stimmt nicht**, **Ermessen**. Was nur auf GitHub
messbar ist, steht als solches, denn ohne `gh` und ohne Zugang zur
Repository-Konfiguration ist es von hier aus nicht zu sehen.

Eine Prämisse des Reviews ist nachgemessen und nicht bestätigt: *„Das
Repository wurde erst nach dem letzten erfolgreichen CI-Lauf öffentlich."* Die
GitHub-API antwortet ohne Anmeldung auf `riederch/pico` mit **404** und auf ein
bekanntes öffentliches Repository daneben mit 200. Das ist die Antwort für ein
privates Repository. Entweder ist es nicht öffentlich, oder es war es und ist
es nicht mehr. Für vier Punkte (§7, §9.3, §22, §5) hängt die Dringlichkeit an
dieser Frage.

## Übersicht

| Nr | Review | Punkt | Urteil | Beleg | Paket |
|---|---|---|---|---|---|
| R1 | §3 | Client-Artefakte überschreibbar | **stimmt** | `.github/workflows/ci.yml:787` `--clobber`; der Client-Job wartet nur auf `verify` und `suites`, die Monotonieprüfung läuft in den beiden Bild-Jobs (Zeilen 274, 497) | P1 |
| R2 | §4 | `main` und Tags serverseitig ungeschützt | nicht lokal messbar | Repository-Konfiguration | P2 (Nutzer) |
| R3 | §5 | Ausgelieferter Electron-Closure nicht auditiert | **stimmt** | Electron ist devDependency in `apps/companion-shell/package.json`; `package-linux.mjs` paketiert es aus `node_modules`; `pnpm audit --prod` (ci.yml:87) sieht devDependencies nicht | P3 |
| R4 | §6 | `v0.2.1` ist nur Draft | Ermessen | ci.yml:785 erzeugt das Release mit `--draft`; kein ADR begründet das; keine Doku behauptet „shipped" (`progress.md:16` sagt ausdrücklich: nicht nachgewiesen) | E2 |
| R5 | §7 | Provenance-Lücke nach Öffentlichmachen | stimmt als Mechanik, Prämisse unbestätigt | ci.yml:424 attestiert nur bei `repository.private == false`; `progress.md:22` sagt, dass keine Attestation gespeichert wird | E1 |
| R6 | §8 | Versionstor mit fester Liste | **stimmt** | `scripts/check-version.mjs` nennt 12 Manifeste; der Workspace hat 17; `packages/gesture` und alle vier `modules/*` fehlen | P4 |
| R7 | §9.1 | README-Zahl 155 | **stimmt** | README.md:117 „155 … 36 … 86"; Matrix hat 157 Zeilen, 37 implemented, 88 partial; kein Prüfer hält die Zahl | P5 |
| R8 | §9.2 | ReadmeTech veraltet, Vault zu breit | **stimmt** | ReadmeTech.md:111-112 „Pico Rules planned", „Action Runner planned"; :131 „Pico Vault = full Pico node"; :155 „Pico Link is the future … layer" | P5 |
| R9 | §9.3 | `.agent-context.md` zu gross und historisch | **stimmt**, mit einer Ausnahme | 2.235 Zeilen gegen die eigene Regel in AGENTS.md:149 (höchstens 200); „Repository ist privat" (Zeile 86) ist aber richtig, nicht veraltet | P6 |
| R10 | §9.4 | `progress.md` ohne klare Semantik | **stimmt** | Standdatum 2026-08-31 im Kopf, Inhalt bis 2026-09-10; Zeile 23 ist ein Journal von mehreren tausend Wörtern in einem Statusdokument | P5 |
| R11 | §9.5 | Konsistenzdokument veraltet | **stimmt** | `docs/release/documentation-consistency.md` reicht bis ADR 0076 und nennt `.agent-context.md` „compact" | P5 |
| R12 | §9.6 | Relay-Dockerfile-Kommentar veraltet | **stimmt** | `docker/relay.Dockerfile:3` „not a Home Assistant add-on (ADR 0153)"; `pico_relay/config.yaml` existiert unter ADR 0155 | P5 |
| R13 | §9.7, §18, §21 | SECURITY.md nennt nur Pico Link als Netzfläche | **stimmt** | SECURITY.md:48; der Mailbox-Port 3200 des Relays ist die öffentliche Tür (`pico_relay/config.yaml:64`) | P5, E3 |
| R14 | §10.2 | Kommentar zur Regelrichtung falsch | **stimmt** | `apps/core/src/action-path.ts:271` „nur verschärfend"; `packages/protocol/src/pico-rules.ts` gibt `recorded ?? derived` zurück und nennt das Gewähren den Zweck; ADR 0140, Notiz 2026-08-25, sagt dasselbe | P7 |
| R15 | §11 | `app.ts` zu gross | **stimmt** | 415.933 Bytes, 9.820 Zeilen | P8 (später) |
| R16 | §12 | grosse Wahrheitsdokumente | **stimmt** | Matrix 393 KB, Roadmap 362 KB, Agent-Kontext 150 KB | P5, P6 |
| R17 | §13 | HA-Modul sauber; reale Lebenszyklustests fehlen | **stimmt** | `modules/home-assistant/src/manifest.ts:31` connector, :38 keine Effekte; kein Test spricht mit einem echten Supervisor | P9 |
| R18 | §14 | Container laufen als root | **stimmt**, mit Grund | kein `USER` in beiden Dockerfiles; der Grund steht in `docker/home.Dockerfile:52` und `docker/relay.Dockerfile:65` (gemountetes `/data`) | P10 |
| R19 | §15 | Model-Jobs ausserhalb der Privacy-Domänen | **stimmt teilweise**, bekannt | `pico_model_job_queue` hält Frage, Antwort und Kontext im Klartext; `home.recall.forget` leert die Wörter (ADR 0049, Notiz 2026-08-25); Domänen-Shred und Verschlüsselungsentscheidung erreichen die Tabelle nicht, und `progress.md:22` sagt das | P11, E4 |
| R20 | §16 | Replay-Schutz nicht neustartfest | **stimmt**, bekannt | `apps/core/src/link-direct.ts:128` Map im Prozess; ADR 0107, Zeile 371, nennt den Rest: Fenster höchstens 60 Sekunden, nur authentifizierte Anfragen | P12, E5 |
| R21 | §17 | Sync-Seitenstores prüfen | Prüfauftrag | Rollback und Trunkierung sind getestet (`packages/sync/src/index.test.ts:238`, :317, :649); der Rest ist offen | keins jetzt |
| R22 | §18 | Relay-Härtung vor Produktion | stimmt teilweise | drei Ratenbegrenzer an der Mailbox-Tür (`apps/relay/src/server.ts:99-114`), zwei an der Betreibertür; Gesundheits- und Betreiberport auf Loopback (`apps/relay/src/config.ts:35`, :45); TLS ist Sache des Deployments (ADR 0149:442); Metadaten nicht anonym, dokumentiert | P5 |
| R23 | §19 | Meshtastic nur Konzept | **stimmt**, ist so | kein Quellcode, nur Dokumente | keins |
| R24 | §20 | Formatfreeze; Zeroization nicht übertreiben | Ermessen; Doku hält sich schon zurück | ADR 0081:175, 0086:79, 0094:120 sagen „best effort, cannot promise" | E7 |
| R25 | §21 | „latest released version" undefiniert | **stimmt** | SECURITY.md:40 ohne Definition; Tag, GHCR-Bild, Draft und veröffentlichtes Release sind vier verschiedene Dinge | E3 |
| R26 | §22 | Hygiene | gemessen | 575 von 1.435 Commits tragen eine Sitzungs-URL (seit 2026-07-18), 919 ein Co-Authored-By; keine `.env` verfolgt; die Maintainer-Adresse steht nur in `repository.yaml:3` (Pflichtfeld des Add-on-Repositorys); `192.168.1.20` ist ein Beispiel | E6 |

## Was das Review nicht sieht

Drei Dinge, die es als Lücke nennt, stehen im Baum als benannter Rest:
`progress.md:22` sagt seit Wochen, dass Frage und Antwort im Klartext in der
Warteschlange liegen, dass Pico Link Direct keinen neustartfesten
Replay-Schutz hat und dass Relay-Metadaten nicht anonym sind. ADR 0107 nennt
das 60-Sekunden-Fenster, ADR 0049 die Wörter in der Zeile. Das macht die
Punkte nicht kleiner, aber es macht sie zu Entscheidungen statt zu
Entdeckungen: die Frage ist, ob sie jetzt geschlossen werden, nicht ob sie
bekannt sind.

Und eines nennt das Review zu hoch: R20. Was nach einem Neustart erneut
angenommen werden kann, ist eine Anfrage, die schon einmal mit gültigem
Schlüssel signiert war, innerhalb ihrer eigenen Restgültigkeit von höchstens
60 Sekunden. Das ist ein Rest, kein offenes Tor. Ihn zu schliessen ist
trotzdem billig (P12), und deshalb empfohlen.

## Offene Entscheidungen

Jede mit Empfehlung zuerst. Sie stehen hier, damit sie nicht in jeder Antwort
wiederholt werden.

- **E1 — Ist das Repository öffentlich?** Die API sagt nein. *Empfohlen:* auf
  GitHub nachsehen. Ist es öffentlich, gilt R5 und der nächste Tag-Lauf
  attestiert; ist es privat, ist §7 gegenstandslos und R26 weniger dringend.
- **E2 — Soll CI das Release veröffentlichen oder als Draft lassen?** Das
  `--draft` steht ohne Begründung im Workflow. *Empfohlen:* Draft behalten und
  den Grund an die Zeile schreiben (ein Mensch sieht das Paket, bevor es
  jemand laden kann); P1 nimmt nur das Überschreiben heraus.
- **E3 — Was ist eine „released version"?** *Empfohlen:* ein Tag `v*`, dessen
  Lauf grün war und dessen Bilder und Paket unter diesem Tag liegen; ein Draft
  zählt nicht. SECURITY.md sagt es dann so.
- **E4 — Model-Jobs: klein oder gross?** Klein: Domänen-Shred erreicht die
  Tabelle, und `home.memory.forget` leert auch die Wörter des Jobs, aus dem das
  Item kam. Gross: Jobzeilen tragen die Posture der Domäne und liegen
  verschlüsselt. *Empfohlen:* klein jetzt, gross als ADR-Frage danach.
- **E5 — Replay-Zustand persistieren?** *Empfohlen:* ja, vor dem nächsten
  Release; eine Tabelle mit Ablaufspalte, 1.024 Zeilen, vom Sweep geleert.
- **E6 — Sitzungs-URLs in Commit-Nachrichten weiter schreiben?** Ob sie für
  Dritte nutzbar sind, ist von hier nicht prüfbar. *Empfohlen:* weglassen, bis
  das geklärt ist; die Historie bleibt, wie sie ist.
- **E7 — Gibt es eine reale Pico-Identität, die behalten wird?** Wenn ja, ist
  das Identitätsformat eine versionierte Schnittstelle, und das gehört als
  Satz in ADR 0016 oder 0031. *Empfohlen:* Frage beantworten, ein Satz
  genügt.
- **E8 — `.agent-context.md` auf 200 Zeilen kürzen?** Die Geschichte steht in
  der Roadmap und in Git. *Empfohlen:* ja.
- **E9 — Wann laufen die Container nicht mehr als root?** *Empfohlen:* vor
  produktiven Personendaten, nicht vor dem nächsten Release; das Startskript
  bereitet `/data` vor und gibt dann die Rechte ab.

## Arbeitspakete, Vorschlag

Reihenfolge nach Gewicht: erst, was falsch ist und Wirkung hat, dann, was
falsch ist und keine hat, zuletzt Geschmack. Jedes Paket trägt eine Pflanzung
oder einen Test, der beweist, dass die Änderung greift, und wird einzeln
festgeschrieben.

### Vor dem nächsten Release

- **P1 — Client-Publish ohne Überschreiben.** `--clobber` entfernen; vor dem
  Hochladen prüfen, ob unter dem Tag schon ein Asset dieses Namens liegt, und
  dann mit Fehler enden; der Grund für `--draft` an die Zeile (E2). Die
  Entscheidung als Funktion in einem Skript, damit ein Test sie pflanzen kann,
  so wie `check-release-monotonic.mjs` seine Vergleichsfunktion exportiert.
- **P2 — Trust-Root auf GitHub.** Nutzeraufgabe: Ruleset für `main` (Pflicht-
  Checks, kein Force-Push, kein Löschen), Tag-Schutz für `v*`. Im Baum nur ein
  Absatz in `docs/release/upgrade-contract.md`, der sagt, was serverseitig
  erwartet wird und was der Workflow nicht ersetzen kann.
- **P3 — Der ausgelieferte Closure wird auditiert.** Das Paketier-Skript kennt
  den Closure schon (`workspace-closure.mjs`); der Audit läuft über genau
  diesen Closure plus Electron statt über `--prod` allein. SBOM und
  Attestation des Pakets folgen, sobald E1 geklärt ist.
- **P4 — Versionstor aus dem Workspace.** Manifeste aus `pnpm-workspace.yaml`
  ableiten; Pflanzung: ein Manifest auf eine andere Version, das Tor muss rot
  werden.
- **P5 — Dokumentation abgleichen.** README-Zahlen von `progress:walk` halten
  lassen statt von Hand; ReadmeTech (Rules, Runner, Pico Link, Vault-
  Definition); SECURITY.md mit allen Netzflächen und der Definition aus E3;
  `progress.md` als Momentaufnahme mit richtigem Standdatum, das Journal in
  Zeile 23 geht in die Roadmap, wo es schon steht; Konsistenzdokument auf den
  heutigen Umfang; der eine Kommentar im Relay-Dockerfile.
- **P6 — `.agent-context.md` auf den Handoff kürzen** (E8).
- **P7 — Der Kommentar in `action-path.ts`** sagt, was der Code tut.

### Vor produktiven Personendaten

- **P11 — Domänen-Shred und Forget erreichen die Jobtabelle** (E4, klein).
- **P12 — Replay-Zustand in einer Tabelle** (E5).
- **P9 — Eine reale Home-Assistant-Fahrt:** Installation, Upgrade, Backup,
  Restore auf neuem Host, Wiederherstellung von der Recovery-Karte. Ein
  Runbook im Baum, gefahren vom Nutzer an einer echten Instanz, Ergebnis
  in die Matrix.
- **P10 — Container geben root ab** (E9).

### Später

- **P8 — `app.ts` entlang der Vertrauensgrenzen teilen.** Nicht zusammen mit
  Sicherheitsänderungen, und nicht nach Zeilenzahl.

## Model und Aufwand je Schritt

| Schritt | Model | Effort | Grund |
|---|---|---|---|
| 1 Messung | Fable | high | Jede Behauptung muss gegen den Baum; eine plausible falsche kostet mehr als die Messung |
| 2 Entscheidungen | keines | – | Nutzer |
| 3 Pakete schneiden | Fable | medium | Reihenfolge und Zuschnitt; die Messung ist im Kontext |
| P1, P4, P7 | Opus | medium | kleine Skripte mit Pflanzung, mechanisch |
| P2 | Nutzer, dann Opus | low | ein Absatz |
| P3 | Fable | high | Sicherheitsurteil darüber, was der Closure ist |
| P5 | Opus | high | Breite; jeder Satz muss gegen Code stimmen |
| P6 | Fable | medium | der Handoff dieser Sitzung; wer kürzt, muss wissen, was trägt |
| P9 | Nutzer, Fable für das Runbook | medium | echte Instanz nötig |
| P10, P11 | Fable | high | Härtung und Privacy-Entwurf mit ADR-Berührung |
| P12 | Opus | high | klein, aber sicherheitsrelevant; Tests entscheiden |
| P8 | Fable | high | grosser Umbau entlang Grenzen |
