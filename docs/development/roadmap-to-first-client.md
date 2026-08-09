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

Ein Block. **Opus 5 + high.**

## Phase 1 - Linux ohne Terminal installierbar

Erst ab dem Ende dieser Phase ist das Wort "Client" ehrlich: heute laesst sich
ein Home nur ueber `pico-vault` gruenden.

- **E6 Produktpfad-Check** - ein Repo-Skript, das fehlschlaegt, wenn
  produktbezogene Doku eine Person durch `pico-vault` schickt. Haengt an nichts.
  *Sonnet 5 + high.*
- **E1 Erreichbarkeit** - zwei bewiesene Tueren pro Plattform,
  Single-Instance-Aktivierung, stock GNOME ohne AppIndicator-Extension als
  Referenz-Negativtest. *Opus 5 + high.*
- **E2 Founding und Bindung** - `claim-home`, `open-identity-session` und der
  erste Produktionsschreibvorgang von Profil und Keystore-Bindung. Schliesst das
  ADR-0113-Residuum, dass diese Bindung in Produktion niemand schreibt.
  *Opus 5 + xhigh.*

## Phase 2 - Linux betreibbar

**E3 zuerst, und zwar aus einem Android-Grund:** ein Telefon *ist* ein zweites
Geraet. Ohne Enrollment-Flaeche bedeutet "Android dazunehmen" wieder ein
Terminal, und damit waere Phase 4 von Phase 1 abgeschnitten.

- **E3 Device-Lifecycle** - delegate, enroll, renew, revoke, inspect, jeweils
  unter ADR-0099-Approval und ADR-0106-Rendering. *Opus 5 + xhigh.*
- **E4 Home-Kontinuitaet und Membership** - `rotate-host-key`,
  `issue-membership`. *Opus 5 + xhigh.*
- **E5 Domains und Readership** - create/rotate domain, grant reader, publish
  checkpoint. *Opus 5 + xhigh.*

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
