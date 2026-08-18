# Roadmap zum ersten funktionierenden Client

Sequenzierung, kein Architekturdokument. Entscheidungen stehen in den ADRs, der
nachgewiesene Stand in `docs/architecture/implementation-status.md`, der
Einstieg in `.agent-context.md`. Diese Datei sagt nur, **in welcher Reihenfolge**
und **warum in dieser**.

Zielmarke, vom Nutzer am 2026-08-09 festgelegt: **nuetzlich im Alltag** - ein
Linux- und ein Android-Client, die ohne Terminal installierbar und bedienbar
sind und mindestens Termine und Spatial Recall tragen. Der sprechende Companion
(Modellpfad, Avatar-Assets) liegt bewusst dahinter.

## Zwei Befunde, die die Reihenfolge bestimmen

**Link Direct erreicht nur das eigene Home, direkt.** ADR 0107 schliesst Relay,
Discovery und Streaming ausdruecklich aus, und Portforwarding ist als
Produktmodell verboten. Fuer einen Desktop ist das folgenlos - er steht zuhause.
Fuer ein Telefon heisst es: ausserhalb des Heimnetzes gibt es kein Home, also
keinen Lifecycle-Read, keinen Alarm und keine Ceremony. Entschieden am
2026-08-09: Android v1 wird ein **Zuhause-Client** mit ausgesprochener Grenze
(ADR 0131 A7); das Relay bleibt ein eigenes Vorhaben ausserhalb dieses Pfads.

**Der Beobachtungsspeicher liegt im Core, nicht im Geraet.** `pico_observation`
ist eine Core-Tabelle mit Migration, Q5-Obergrenze und Shred-Kaskade; die
Ableitung (ADR 0129 SR1/SR4) sind reine Funktionen, aber die Erfassung schreibt
ins Home. Ein Telefon in der Tiefgarage hat kein Home - damit funktioniert
"wo habe ich geparkt" ausgerechnet dort nicht, wo Issue #3 es verlangt hat:
offline. Ob ein Geraet eigenen dauerhaften Zustand haben darf, ist deshalb kein
Randthema, sondern die Vorbedingung der Nuetzlichkeitsphase. Sie gehoert in
ADR 0126 (Multi-Presence), dessen Nummer reserviert und dessen Brief seit
2026-08-02 vorliegt.

## Fixpunkt: Electron 44, vor dem 2026-08-25

Nicht verhandelbar und terminiert. `apps/companion-shell/electron-support.json`
laeuft am 2026-08-25 ab und blockiert danach `release:verify`. Die Pin-Policy
erzwingt dann Electron 44, und ein Bump macht die ADR-0113-C3-Flaeche wieder
auf: Paketierung, Sandbox-Probe und Speicherbudget sind neu nachzuweisen. Bei
818.752 Byte protokollierter Reserve ist ein Chromium-Sprung ein reales Risiko.

**Am 2026-08-18 vorab gemessen, und das Risiko ist nicht da.** Der Pin laesst
sich nicht bewegen (Registry: `latest` 43.4.0, `beta` 44.0.0-beta.5), aber der
teure Teil liess sich vorziehen: `44.0.0-beta.5` gepackt und im selben
`user_namespace`-Modus auf demselben Host gemessen ergibt
`Private_Dirty + Private_Hugetlb` **99.635.200** gegen 100.339.712 bei 43.4.0 -
also *gefallen*, bei einem Budget von 110.000.000. PSS steigt um 3,6 MB, was in
dem Band liegt, das ADR 0113 als Spaltenwechsel statt Wachstum protokolliert.
`verify:linux` lief auf der Beta mit Exit 0 durch, inklusive Paketierung,
Debian-Lebenszyklus, Sandbox-Probe und dem strikten Private-Budget. Eine Beta
ist nicht das Release - die Aussage ist "wahrscheinlich billig", nicht
"erledigt".

Ein Block. **Opus 5 + high.**

## Phase 1 - Linux ohne Terminal installierbar

Seit 2026-08-18 ist das Wort "Client" fuer Linux ehrlich: ein Home laesst sich
aus dem Client gruenden (E2) und der Client ist ohne Tray erreichbar (E1).

- **E6 Produktpfad-Check (erledigt)** - ein Repo-Skript, das fehlschlaegt, wenn
  produktbezogene Doku eine Person durch `pico-vault` schickt. Haengt an nichts.
- **E1 Erreichbarkeit (erledigt 2026-08-18)** - die produktseitigen Tuer-Fakten
  am gepackten `.deb` bewiesen: der Desktop-Eintrag fuehrt ueber die
  Launcher-Kette zum Prozess mit dem Single-Instance-Lock und ein zweiter
  Start hebt den ersten, die Notification traegt eine Aktion, die das Fenster
  oeffnet. Die Tray-Tuer ist prozessseitig prinzipiell nicht beweisbar -
  Electron nimmt ein Icon auch auf einem Bus ohne Host an - und wird auf der
  Session gemessen. Der Referenz-Negativtest ist gebaut statt abgewartet:
  `dbus-run-session` gibt einen privaten Bus, der nichts besitzt - dieselbe
  Abwesenheit wie stock GNOME -, und die Zwei-Tueren-Regel laeuft gegen genau
  diese Gestalt.
- **E2 Founding und Bindung (erledigt 2026-08-18)** - `claim-home`,
  `open-identity-session` und der erste Produktionsschreibvorgang von Profil und
  Keystore-Bindung. Schliesst das ADR-0113-Residuum, dass diese Bindung in
  Produktion niemand schreibt. Die Bindung war die Luecke: Gruenden schrieb nur
  das Profil, Wiederherstellen siegelte zusaetzlich - dieselbe Person waere je
  nach Tuer bei jedem Start nach der Passphrase gefragt worden oder nie.

## Phase 2 - Linux betreibbar

**E3 zuerst, und zwar aus einem Android-Grund:** ein Telefon *ist* ein zweites
Geraet. Ohne Enrollment-Flaeche bedeutet "Android dazunehmen" wieder ein
Terminal, und damit waere Phase 4 von Phase 1 abgeschnitten.

- **E3 Device-Lifecycle (erledigt 2026-08-18)** - delegate, enroll,
  renew, revoke, inspect, jeweils unter ADR-0099-Approval und
  ADR-0106-Rendering. *Inspect und Revoke stehen*: die Liste, welchen Geraeten
  das Home noch antwortet, und das Beenden einer Berechtigung - gegen ein
  echtes Home und einen echten Daemon bewiesen, ohne CLI im Weg. Der Read lief
  laengst und wurde weggeworfen: ADR 0112s Alarm-Carrier fragt denselben
  Endpunkt im Takt ab und behaelt drei Felder daraus. Die Zeilen verbinden sich
  mit ADR 0126s Praesenzen ueber die Id, die beide Seiten aus dem
  Device-Signing-Key ableiten - eine Geraeteliste mit zwei Fakten statt zweier
  Listen ueber dasselbe Subjekt. **Enrollment steht seit demselben Tag**: der
  Nutzer hat den Austausch entschieden - Kamera und Code wie bei der Recovery
  Card -, und drei Codes sind das Minimum, das die Zeremonie zulaesst
  (Identitaetswurzel signiert die Delegation, das Zielgeraet gegensigniert eine
  vier Minuten gueltige Aktivierung ueber deren Digest, der Sponsor reicht
  ein). Das neue Geraet schreibt sein Profil nicht auf die eigene Signatur hin,
  sondern wartet, bis das Home es als eines der seinen beantwortet. Flaechen auf
  beiden Seiten: eine dritte Erstlauf-Wahl, die ausdruecklich keine Art von
  Wiederherstellen ist, und "Add another device" in den Einstellungen.
  *Opus 5 + xhigh.*
- **E4 Home-Kontinuitaet und Membership (erledigt 2026-08-18)** -
  `rotate-host-key` und `issue-membership` als Produktflaechen. Die Rotation
  endet sofort mit dem ADR-0115-U4-Repin: das Geraet, das sie ausgeloest hat,
  steht daneben, und auf einem vom eigenen Home zurueckgezogenen Schluessel
  sitzenzubleiben laesst den naechsten gewoehnlichen Read wie einen Angriff
  aussehen. Bewiesen ist, dass es eine Rotation ist und kein Protokolleintrag
  darueber: die alten Pins antworten danach nicht mehr, gemessen gegen
  denselben Aufruf davor. Nebenbefund: Mitgliedschaften waren ueber Link
  **nur schreibbar** - wer jemanden aufnehmen konnte, konnte nicht sehen, wer
  drin ist. Sichtbar geworden und nicht in diesem Gate: eine Mitgliedschaft zu
  beenden gibt es nirgends, auch nicht im Werkzeug. *Opus 5 + xhigh.*
- **E5 Domains und Readership (gemessen, bewusst nicht gebaut)** -
  create/rotate domain, grant reader, publish checkpoint. Am 2026-08-18 vor
  dem Bauen gemessen: **nichts im Produkt schreibt Reader-Custody-Inhalt** -
  der gewoehnliche Speicherweg lehnt ihn namentlich ab, den Paketweg ruft
  ausserhalb von Tests niemand auf - und kein Companion stellt je ein Share
  Envelope aus oder empfaengt eines. Die vier Zeremonien waeren damit
  Bedienelemente, deren Wirkung niemand beobachten kann. Ausserdem muesste
  zuerst ein Custody-Speicher auf das Geraet: der signierte Domain-Record und
  jede Rotation sind Eingaben, die das Werkzeug aus Dateien liest. **Das
  Subjekt fehlt, nicht die Verdrahtung** - was E5 lohnend macht, ist ein
  Schreibweg. Stattdessen gebaut wurde, was derselbe Gang als sichtbar
  fehlend gefunden hat: **eine Mitgliedschaft beenden**. *Opus 5 + xhigh.*

E4 und E5 duerfen nach hinten rutschen oder neben Phase 4 laufen; E3 nicht.

## Phase 3 - ADR 0126 P3: die Zustandsgrenze

Die Entscheidung ist seit 2026-08-09 getroffen und steht als ADR 0126: eine
Praesenz haelt lokalen, kurzlebigen Zustand - **einschliesslich der lokalen
Position** -, und nur ausdruecklich freigegebene Information wird dauerhaft.
Die beiden Begriffsfragen aus dem Brief sind mitentschieden: Praesenz ist eine
zweite Achse neben den ADR-0015-Knotenrollen, und was eine Praesenz deklariert
heisst Affordance und bleibt von ADR 0036s Capability getrennt.

Was bleibt, ist Gate P3 und damit der Angelpunkt der Roadmap: die Uebergabe
von praesenzlokalem in dauerhaften Zustand als ausdruecklicher, auditierter
Schritt, mit den fuenf Stellen aus ADR 0129 an der Grenze statt am Store.
Praktisch zieht das den Beobachtungspuffer aus dem Core ins Geraet - womit das
Home ueberhaupt keine Rohstandorte mehr sieht und Phase 6 offline antworten
kann.

Ein bis zwei Bloecke. **Fable 5 + xhigh** - der Umzug eines Stores mit
Custody- und Datenschutzfolgen.

## Phase 4 - Android-Fundament

Startet nach E3. Alles hier faellt unter ADR 0131.

- **A1 Runtime und Primitive** - der JavaScript-Runtime, der den shellfreien
  Kern traegt, plus ein gepruefter libsodium-Build; die vorhandenen
  Fixture-Suiten muessen on-device gruen sein. *Opus 5 + xhigh.*
- **A2 Prozess- und Autoritaetsgrenze** - eigener Custody-Prozess ueber einen
  app-privaten AF_UNIX-Socket, oder eine In-Process-Naht ueber dieselben
  Request-Familien. Die ADR-0099-Bindung ueberlebt in beiden Faellen.
  *Fable 5 + xhigh.*
- **A3 Keystore-Tranche** - Android Keystore und BiometricPrompt als
  ADR-0081-P3-Aequivalent, kanonisches Keyfile-Format unveraendert.
  *Opus 5 + xhigh.*
- **A4 Erreichbarkeit gemessen** - Foreground Service, Pruefintervall,
  Alarmlautstaerke mit und ohne die restringierte Full-Screen-Permission,
  Battery-Optimization und mindestens ein Hersteller-Taskkiller, auf echter
  Hardware. Vorher gilt keine ADR-0112-Zusage fuer Android. *Opus 5 + high.*

Ergebnis: eine App, die einen Vault haelt, sich als delegiertes Geraet an einem
bestehenden Home anmeldet und den Alarm traegt - im Heimnetz.

## Phase 5 - Android-Ceremonies

**A5**: die Vertikalen aus Phase 1 und 2 auf Android, in derselben Reihenfolge.
Der shellfreie Kern traegt sie bereits; was hier entsteht, sind Flaeche und
Adapter. Genau dafuer wurde die ADR-0113-Grenze bezahlt - wenn diese Phase teuer
wird, ist die Grenze verletzt worden und das ist der Befund, nicht der Aufwand.

## Phase 6 - die erste echte Nuetzlichkeit

Haengt vollstaendig an Phase 3.

- **ADR 0129 SR5-Erfassung** auf dem Telefon - der Sensoradapter hinter dem
  Port, der seit SR5 deklariert und leer ist. Damit funktioniert Issue #3.
- **Termine auf dem Telefon** - `home.time_bound_entries.read` und die
  Quittierung ueber die vorhandene Link-Operation.

Das ist der Punkt, an dem jemand das Ding vermissen wuerde, wenn man es wegnimmt.
Die Zielmarke dieser Roadmap endet hier.

## Danach, ausserhalb dieser Roadmap

Der sprechende Companion: die erste Requesting-Seite, ADR 0116 W4/W5, ADR 0117
X3-X5, die Modell-Delegation aus ADR 0048/0049 - und die Avatar-Assets ueber
ADR 0124, die ADR 0112 S4 entsperren. Nichts davon ist heute pruefbar, weil kein
Modell-Provider existiert.

Ebenfalls ausserhalb: das Relay (ADR 0028 und die Draft-Fixtures 0042-0066),
iOS, macOS (blockiert mangels Testgeraet, ADR 0130 E8) und ADR 0027 IM1-IM3, die
ein Image brauchen, das es nicht gibt.

## Was diese Roadmap nicht ist

Keine Kalenderschaetzung. Die Bloeckangaben sind Arbeitseinheiten im Sinn von
`AGENTS.md`, keine Zeitraeume; eine belastbare Geschwindigkeitsangabe gibt es
nicht. Und keine Statusaussage: eine Phase gilt erst als erledigt, wenn die
Statusmatrix es mit Code-Refs sagt.
