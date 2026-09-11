# Externes Review vom 2026-09-09, gegen den Baum gemessen

**Status:** Messung abgeschlossen am 2026-09-10; neun Entscheidungen getroffen; Arbeitspakete geschnitten
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
| R2 | §4 | `main` und Tags serverseitig ungeschützt | **stimmte**, gesetzt am 2026-09-10 | Repository-Konfiguration | P2 (Nutzer) |
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
| R14 | §10.2 | Kommentar zur Regelrichtung falsch | **stimmt**, und breiter | `apps/core/src/action-path.ts:271` „nur verschärfend"; `packages/protocol/src/pico-rules.ts` gibt `recorded ?? derived` zurück und nennt das Gewähren den Zweck; ADR 0140, Notiz 2026-08-25, sagt dasselbe. Nachgemessen stand der zurückgenommene Satz auch im Entscheidungstext von ADR 0140 selbst, 290 Zeilen unter seiner Rücknahme | P7 |
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

- **E1 — Ist das Repository öffentlich?** *Entschieden 2026-09-10:* nein, es
  ist wieder privat und wird nur auf Aufforderung öffentlich gestellt, wenn es
  nötig ist. Damit ist §7 gegenstandslos, bis das geschieht; P3 kommt ohne
  Attestation und SBOM aus; R26 bleibt relevant, weil das Repository jederzeit
  öffentlich werden kann und die Historie mitgeht.
- **E2 — Soll CI das Release veröffentlichen oder als Draft lassen?**
  *Entschieden 2026-09-10:* Draft behalten. Ein Mensch sieht Paket und
  Prüfsumme, bevor jemand es laden kann, und veröffentlicht selbst. P1 schreibt
  den Grund an die Zeile und nimmt nur das Überschreiben heraus.
- **E3 — Was ist eine „released version"?** *Entschieden 2026-09-10:* der
  grüne Tag. Released ist ein Tag `v*`, dessen Lauf grün endete und dessen
  Bilder und Paket unter dem Tag liegen; ob das GitHub-Release aus dem Draft
  heraus ist, ändert daran nichts, und Sicherheitskorrekturen gehen an den
  höchsten solchen Tag. P5 schreibt das in SECURITY.md.
- **E4 — Model-Jobs: klein oder gross?** *Entschieden 2026-09-10:* klein
  jetzt. Der Shred einer Domäne leert jede Jobzeile, deren Kontext die Domäne
  nennt, mit demselben Mechanismus wie `home.recall.forget`; und
  `home.memory.forget` leert zusätzlich die Wörter des Jobs, der das Item
  hervorgebracht hat, lässt aber die Zeile mit dem Zeiger stehen (ADR 0126).
  Gross - Posture und Domänenschlüssel auf der Jobzeile - wird als eigene
  ADR-Frage gestellt, zusammen mit der Q5-Obergrenze für diese Tabelle, die
  ADR 0049 im selben Absatz offen lässt.
- **E5 — Replay-Zustand persistieren?** *Entschieden 2026-09-10:* ja, vor
  dem nächsten Release. Eine Tabelle mit Anfrage-Id und Ablauf, geschrieben im
  selben Moment wie heute die Map, gelesen vor der Signaturprüfung, vom Sweep
  geleert, Obergrenze 1.024. Die Zeile in ADR 0107 und in `progress.md:22`
  wird danach gestrichen. P12 wandert damit in die Gruppe vor dem Release.
- **E6 — Sitzungs-URLs in Commit-Nachrichten weiter schreiben?**
  *Entschieden 2026-09-10:* weglassen ab jetzt. Die Historie bleibt, wie sie
  ist; sie umzuschreiben widerspräche dem, was der Baum sonst hält. Das
  `Co-Authored-By` bleibt, es ist Zuschreibung, keine Adresse.
- **E7 — Gibt es eine reale Pico-Identität, die behalten wird?**
  *Entschieden 2026-09-10:* ja, eine bleibt. Damit ist das Identitätsformat
  ab jetzt eine versionierte externe Schnittstelle: Änderungen an kanonischen
  Bytes brauchen eine neue `suite`-Version und eine Wanderung mit Neusignatur,
  nie einen stillen Umbau. P5 schreibt den Statussatz in ADR 0031.
- **E8 — `.agent-context.md` auf 200 Zeilen kürzen?** *Entschieden
  2026-09-10:* ja, mit Tor. Handoff bleibt, Geschichte fällt (sie steht in der
  Roadmap und in Git), bleibende Erkenntnisse wandern in den Runbook; vor
  jedem Streichen wird geprüft, ob die Zeile anderswo steht. Ein Prüfer hält
  danach die 200 Zeilen aus AGENTS.md:149.
- **E10 — Soll `home.memory.forget` den Austausch mitnehmen?** *Aufgeworfen
  2026-09-10 beim Umsetzen von P11.* E4 sagte ja; ein bestehender Test hält
  seit dem 2026-08-25 das Gegenteil fest, mit Begründung, und das war mir bei
  E4 nicht bekannt. Heute sind es zwei getrennte Handlungen:
  `home.memory.forget` hebt die Erinnerung auf, `home.recall.forget` nimmt den
  Austausch zurück. *Empfohlen:* so lassen. Wer nur die Notiz aufheben wollte,
  soll nicht ungefragt einen Eintrag aus seinem Verlauf verlieren; der Rest ist
  ein Hinweis auf der Fläche, keine zweite Wirkung dieser Operation.
  *Entschieden 2026-09-10:* so lassen. Die beiden Operationen bleiben
  getrennt, und der Rest ist ein Hinweis auf der Fläche, keine zweite Wirkung
  dieser Operation.

- **E12 — Welche Regel ist *die* Regel für einen Domänennamen?**
  *Aufgeworfen 2026-09-11 (Befund B143).* Vier Regeln messen dasselbe Feld und
  beurteilen sieben von zwölf gemessenen Namen verschieden. Der Schreibweg
  eines verschlüsselten Items nimmt `my-domain` und `Domain`, weil der Name
  dort ein Schlüsseldateiname wird; die Protokollregel weist beide ab. Heute
  bricht nichts, weil die Parser mit der strengen Regel keinen Produktaufrufer
  haben. *Empfohlen:* die Zeichenmenge des Schlüsselspeichers als die Regel
  nehmen und sie im Protokoll aussprechen — sie ist die, die heute wirklich
  gilt, und sie ist die engste, die ein Dateiname verträgt. *Alternative:* die
  strenge snake_case-Regel überall durchsetzen; dann ist zu prüfen, ob eine
  bestehende Domäne einen Bindestrich trägt, denn die verlöre ihren Namen.

- **E11 — Traegt „Pico Vault" zwei Begriffe?** *Aufgeworfen 2026-09-10 beim
  Umsetzen von P5; das Review hat es in §9.2 benannt.* Gemessen: ADR 0015
  benutzt das Wort fuer den Knotentyp „voller Client", ADR 0097 fuer den
  Verwahr-Daemon *innerhalb* eines solchen, und beide Lesarten stehen in
  `ReadmeTech.md` - Zeile 131 als Knoten, Zeile 249 als „Full Client", Zeile
  285 als Daemon. Das Review haelt die zweite fuer die saubere. *Empfohlen:*
  nicht im Vorbeigehen aendern. Es ist eine ADR-Vokabel, sie steht in ADR 0015
  im Titel, und ein Umbenennen beruehrt jeden Text, der sie benutzt. Wenn, dann
  als eigene ADR-Entscheidung mit einer Umbenennung in einem Zug.
  *Alternative:* so lassen und in beiden ADRs einen Satz ergaenzen, der sagt,
  welche Lesart wo gilt - billiger, und es schliesst genau die Verwechslung,
  die ein Leser haette.

- **E9 — Wann laufen die Container nicht mehr als root?** *Entschieden
  2026-09-10:* vor produktiven Personendaten, gekoppelt an P9, weil der Grund
  für root das gemountete `/data` ist und nur auf einer echten
  Supervisor-Installation messbar ist. Das nächste Release geht noch als root,
  mit dem Grund im Dockerfile.

## Arbeitspakete

Geschnitten am 2026-09-10 nach den neun Entscheidungen. Jedes Paket ist ein
Commit, trägt einen Beweis (Test mit Pflanzung oder Tor, das über einen
gepflanzten Baum rot wird) und sagt, wann es fertig ist. Reihenfolge: erst,
was falsch ist und Wirkung hat, dann Rest schliessen, dann die Dokumente,
damit sie den Endzustand beschreiben und nicht einen Zwischenstand.

### Vor dem nächsten Release, in dieser Reihenfolge

**P1 — Client-Publish ohne Überschreiben** (R1, E2) — *erledigt 2026-09-10, Befund B127*
- `ci.yml`, Job `client_package`: `--clobber` entfällt. Vor dem Hochladen
  liest der Schritt die Asset-Namen des Releases (`gh release view --json
  assets`) und endet mit Fehler, wenn einer der hochzuladenden Namen schon
  dort liegt. Der Grund für `--draft` steht als Kommentar an der Zeile.
- Die Entscheidung liegt als exportierte Funktion in einem Skript, das die
  JSON-Antwort liest, damit sie gepflanzt werden kann; das Muster ist
  `check-release-monotonic.mjs`.
- Beweis: Test, in dem ein vorhandenes Asset die Veröffentlichung ablehnt und
  ein leeres Release sie zulässt; `split:check` kennt den neuen Schritt.
- Fertig, wenn ein zweiter Lauf auf denselben Tag rot endet, bevor er lädt.

**P4 — Versionstor aus dem Workspace** (R6) — *erledigt 2026-09-10, Befund B128*
- `scripts/check-version.mjs` liest die Manifeste aus den Globs in
  `pnpm-workspace.yaml` statt aus einer Liste; Ausnahmen gäbe es nur mit
  Grund, heute gibt es keine.
- Beweis: Test, der einen Baum mit einem abweichenden Manifest pflanzt und den
  Prüfer rot sieht, sowie einen mit 17 gleichen Manifesten grün.
- Fertig, wenn `packages/gesture` und die vier Module gezählt werden und die
  Schlussmeldung die Zahl aus dem Workspace nennt.

**P7 — Der Kommentar in `action-path.ts`** (R14) — *erledigt 2026-09-10, Befund B129*
- Zeilen 271-273 sagen, was `applyPicoRulesRecordedDecision` tut und was ADR
  0140 seit dem 2026-08-25 festhält: eine Regel wählt unter dem, was der Boden
  übrig lässt, in beide Richtungen; Boden und Reichweite bleiben davor.
- Kein Codeweg ändert sich; Beweis ist die bestehende Testgruppe in
  `pico-rules.test.ts`, die beide Richtungen prüft.

**P12 — Replay-Zustand in einer Tabelle** (R20, E5)
- Wanderung: eine Tabelle mit Anfrage-Id und Ablauf. `PicoLinkDirectIntake`
  fragt und schreibt einen Speicher statt der Map; der Kern verdrahtet SQLite,
  Tests verdrahten dasselbe. Der Sweep leert abgelaufene Zeilen; Obergrenze
  1.024 wie heute, und `store:check` bekommt das Wachstumsende gesagt.
- Beweis: ein Test startet den Eingang innerhalb des Fensters neu und sieht
  dieselbe Anfrage abgelehnt; ein zweiter sieht die Id nach Ablauf frei.
- ADR 0107 bekommt eine Statusnotiz, die Zeile 371 zurücknimmt.
- Fertig, wenn der Satz in `progress.md:22` gestrichen werden kann.

**P11 — Domänen-Shred und Forget erreichen die Jobtabelle** (R19, E4)
- `domain-shred.ts` leert jede Jobzeile, deren `recall_context_json` die
  Domäne nennt, mit demselben Mechanismus wie `forgetRecall`, und stempelt
  `forgotten_at`. `home.memory.forget` leert zusätzlich die Wörter des Jobs,
  aus dem das Item kam; die Zeile und ihr Zeiger bleiben (ADR 0126).
- Beweis: zwei Tests mit Pflanzung, je einer pro Weg, die eine Zeile mit
  Wörtern vorher und ohne nachher sehen.
- ADR 0049 bekommt eine Statusnotiz; die grosse Frage (Posture und
  Domänenschlüssel auf der Jobzeile, Q5-Obergrenze) steht dort als offen.

**P3 — Der ausgelieferte Closure wird auditiert** (R3, E1) — *erledigt 2026-09-10, Befund B132*
- Ein Prüfer läuft `pnpm audit --json` ohne `--prod` und behält nur die
  Hinweise, deren Paket im ausgelieferten Closure liegt (aus
  `workspace-closure.mjs`) oder Electron ist; ab `high` rot. Er steht in
  `ci.yml` neben dem bestehenden Audit, aus demselben Grund wie der: neben
  der Kette, nicht darin.
- Beweis: Test der Filterfunktion über eine aufgezeichnete Audit-Antwort mit
  einem Hinweis im Closure und einem ausserhalb.
- SBOM und Attestation des Pakets bleiben offen, bis das Repository öffentlich
  ist (E1); der Brief nennt das als Rest.

**P6 — `.agent-context.md` auf den Handoff kürzen** (R9, R16, E8) — *erledigt 2026-09-10, Befund B133*
- Zeile für Zeile: Handoff bleibt, Geschichte fällt, wenn sie in der Roadmap
  oder in Git steht, bleibende Erkenntnisse wandern in
  `docs/development/agent-runbook.md`.
- Ein Tor in `verify:gates` hält die 200 Zeilen aus AGENTS.md:149.
- Beweis: 201 Zeilen gepflanzt, Tor rot.

**P5 — Dokumentation abgleichen** (R7, R8, R10, R11, R12, R13, R22, R25, E3, E7) — *erledigt 2026-09-10, Befund B134*
- README: die drei Zahlen werden von `progress:walk` gehalten statt von Hand.
- ReadmeTech: Rules und Runner sind da (Zeilen 111-112), Pico Link ist da
  (155, 163), Pico Vault ist die Verwahrkomponente eines vollen Clients und
  nicht der Knoten (131).
- SECURITY.md: alle Netzflächen mit ihrer Bindung (Pico-Link-Eingang, Relay-
  Mailboxport öffentlich, Relay-Gesundheit und -Betreiber auf Loopback,
  Foundation lokal, Home-Assistant-Ingress) und die Definition aus E3.
- `progress.md`: Momentaufnahme mit Standdatum des Tages; das Journal in Zeile
  23 geht auf einen Absatz zurück, die Befunde stehen in der Roadmap; die Sätze
  zu Replay und Jobtabelle folgen P12 und P11.
- `docs/release/documentation-consistency.md`: Rollen und Umfang von heute.
- `docker/relay.Dockerfile:3`: der Kommentar zeigt auf ADR 0155.
- ADR 0031: Statussatz zu E7, das Identitätsformat ist eine versionierte
  Schnittstelle.
- Beweis: `docs:check` und `progress:walk` grün; für jede geänderte Aussage
  steht die Zeile Code daneben, gegen die sie geprüft wurde.

**P2 — Trust-Root auf GitHub** (R2) — *erledigt 2026-09-10 vom Nutzer, Befund B135*
- Ruleset für `main`: Pflicht-Checks, kein Force-Push, kein Löschen; Tag-Schutz
  für `v*`.
- Im Baum ein Absatz in `docs/release/upgrade-contract.md`, der sagt, was
  serverseitig erwartet wird und was kein Workflow ersetzen kann.

### Vor produktiven Personendaten

**P9 — Eine reale Home-Assistant-Fahrt** (R17)
- Ein Runbook im Baum: Installation, Upgrade, Backup, Restore auf neuem Host,
  Wiederherstellung von der Recovery-Karte, jeweils mit dem erwarteten
  Ergebnis. Gefahren vom Nutzer an einer echten Instanz; das Ergebnis geht in
  die Matrix.

**P10 — Container geben root ab** (R18, E9), gekoppelt an P9
- Ein Startskript bereitet `/data` als root vor und startet den Prozess als
  unprivilegierter Benutzer; `no-new-privileges` im Add-on. Gemessen auf der
  Instanz aus P9, weil der Grund für root dort liegt.

### Später

**P8 — `app.ts` entlang der Vertrauensgrenzen teilen** (R15). Nicht zusammen
mit Sicherheitsänderungen, nicht nach Zeilenzahl, `app.ts` wird am Ende die
Kompositionswurzel.

### Kein Paket

R21 (Sync) bleibt Prüfauftrag; R23 (Meshtastic) ist Konzept und wird so
behandelt; R24 (Zeroization) ist in den ADRs schon so zurückhaltend, wie das
Review es verlangt; R26 (Hygiene) ist mit E6 entschieden.

## Model und Aufwand je Schritt

*Aufwand ist keine Spalte mehr:* der Nutzer hat am 2026-09-10 eine Untergrenze
gesetzt (Opus ab xhigh, Fable ab high), und diese Sitzung liefert das Argument
dafür — meine beiden „medium"-Einstufungen (B124, B125) waren Aufgaben, die ich
für mechanisch hielt und die es nicht waren.

| Schritt | Model | Grund |
|---|---|---|
| 1 Messung | Fable | Jede Behauptung muss gegen den Baum; eine plausible falsche kostet mehr als die Messung |
| 2 Entscheidungen | keines | Nutzer |
| 3 Pakete schneiden | Fable | Reihenfolge und Zuschnitt; die Messung ist im Kontext |
| P1, P4, P7 | Opus | kleine Skripte mit engem Netz |
| P12 | Opus | klein, aber sicherheitsrelevant; Tests entscheiden |
| P11 | Fable | Privacy-Weg mit ADR-Berührung |
| P3 | Fable | Sicherheitsurteil darüber, was der Closure ist |
| P6 | Fable | der Handoff dieser Sitzung; wer kürzt, muss wissen, was trägt |
| P5 | Opus | Breite; jeder Satz muss gegen Code stimmen |
| P2 | Nutzer, dann Opus | ein Absatz |
| P9 | Nutzer, Fable für das Runbook | echte Instanz nötig |
| P10 | Fable | Härtung, gemessen auf der Instanz aus P9 |
| P8 | Fable | grosser Umbau entlang Grenzen |
