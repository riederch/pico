# Agent runbook

Dieser Runbook enthaelt bedarfsweise Entwicklungs- und Betriebsdetails. Er ist
kein Statusdokument, keine Architekturentscheidung und kein Ersatz fuer
`AGENTS.md`, `.agent-context.md`, `progress.md` oder die ADRs.

## Repository und Workspace

Pico ist ein pnpm-/TypeScript-Monorepo. Aktuelle Workspace-Pakete:

- `apps/core` - Fastify-/SQLite-Foundation-Service
- `apps/vault-daemon` - lokaler Vault-Daemon, CLI und Reader-Access-Lease
  (ADR 0097/0098). Die ADR-0098-E2E-Tests starten den gebauten
  `dist/cli.js` als Kindprozess, weil die synchrone Bridge den aufrufenden
  Thread blockiert; ein `pretest`-Build erzwingt das passende `dist/`.
- `apps/companion` - shellfreier Lifecycle-, Alarm- und Host-Pin-Servicekern
- `apps/companion-shell` - Linux-first Electron-Host und Debian-Paketierung
- `apps/web` - frameworkfreier Foundation-Webclient
- `packages/protocol` - gemeinsame Runtime-Typen und canonical-byte Builder
- `packages/sync` - Lamport-/Version-Vector-Grundlagen
- `packages/identity` - lokale Identity-Verifikation und Lifecycle-Projektion
- `packages/vault` - minimale verschluesselte Keyfile-/Custody-Runtime

**Eine Aenderung in `packages/*/src` ist fuer die Tests der abhaengigen App
unsichtbar, bis das Paket gebaut ist.** Die Workspace-Pakete zeigen mit
`exports` auf ihr `dist`-Verzeichnis, also faehrt `apps/vault-daemon` gegen das
dort gebaute `index.js` von `packages/vault` und nicht gegen dessen Quelle unter
`packages/vault/src`. Wer eine
Bibliotheksregel aendert und dann nur die App-Suite laufen laesst, misst den
alten Stand - am 2026-09-11 einmal als falsches Rot erlebt, bei Befund B148.
`pnpm --filter @pico/<paket> build` davor, oder gleich `verify:gates`, das den
Bau als Schritt enthaelt.

Das Home-Assistant-Add-on-Paket liegt unter `pico_home/` (ADR 0153; frueher `pico_home/`).

## Paketmanager

Der Lockfile-Vertrag ist `pnpm-lock.yaml` mit `pnpm@9.0.0`.
`package-lock.json` und `yarn.lock` sind unerwuenscht.

Auf Arbeitsumgebungen ohne globales `pnpm`:

```bash
npx pnpm@9.0.0 <script>
```

Falls ein Install benoetigt wird:

```bash
COREPACK_HOME=/tmp/pico-corepack corepack pnpm install \
  --store-dir /tmp/pico-pnpm-store
```

CI und Docker verwenden einen frozen Lockfile. Netzwerk- oder Registry-Fehler in
der Sandbox nicht durch Lockfile- oder Paketmanagerwechsel umgehen; die
notwendige Netzwerkfreigabe anfordern.

## Standardpruefungen

Vollstaendiger Release-Gate:

```bash
npx pnpm@9.0.0 release:verify
```

Enthalten sind:

```text
license:check -> version:check -> addon:check -> product:check ->
settings:check -> surface:check -> design-system:check -> companion:check ->
fingerprint:check -> instant:check -> link:check -> relay:check ->
push:check -> runtime:check -> wire:check -> browser:check -> time:check ->
offline:check -> supply:check -> build -> module:check -> presence:check ->
docs:check -> supplier:check -> store:check -> reach:check ->
companion:release-check -> check -> test
```

Diese Liste ist eine Kopie und veraltet entsprechend; sie stand am
2026-08-21 auf 18 Schritten, waehrend die Kette 29 hatte. Die Quelle ist
`package.json`:

```bash
node -p "require('./package.json').scripts['release:verify']"
```

### Jedes Gate hat einmal gebissen (Stand 2026-08-21)

Jede Pruefung der Kette wurde einzeln widerlegt: das, was sie verbietet,
wurde gepflanzt, der Exit-Code gelesen, die Datei zurueckgesetzt. Vier
Pruefungen bewachten dabei weniger, als ihre Erfolgsmeldung behauptete, und
sind seitdem korrigiert:

- `license:check` zaehlte zehn Paket-Manifeste auf, der Workspace hatte
  siebzehn. Die Globs kommen jetzt aus `pnpm-workspace.yaml`.
- `time:check` las sechs Korrektheits-Wurzeln und fuenf ihrer Manifeste;
  `@pico/identity` und `@pico/vault` waren ohne Abhaengigkeitspruefung. Die
  Manifeste leiten sich jetzt aus den Wurzeln ab.
- `wire:check` bewachte 72 von 119 Labels, weil es nur skalare Exporte las
  und die meisten Familien in Objekt-Literalen liegen.
- `relay:check` strich Zeichenketten mitsamt den Kommentaren, obwohl sein
  eigener Kommentar nur die Kommentare begruendete.

Vier weitere Pruefungen tragen ihre Sonden im Skript
(`offline:check`, `supplier:check`, `surface:check`, `product:check`); die
uebrigen sind nur hier belegt. Eine Pruefung, die nie widerlegt wurde, kann
gruen sein, weil sie nichts ansieht.

Fokussierte Beispiele:

```bash
npx pnpm@9.0.0 --filter @pico/core check
npx pnpm@9.0.0 --filter @pico/core test
npx pnpm@9.0.0 --filter @pico/core test -- app.test.ts
npx pnpm@9.0.0 --filter @pico/protocol test
npx pnpm@9.0.0 --filter @pico/identity test
npx pnpm@9.0.0 --filter @pico/vault test
npx pnpm@9.0.0 --filter @pico/vault-daemon test
npx pnpm@9.0.0 --filter @pico/web test
npx pnpm@9.0.0 --filter @pico/companion-shell check
npx pnpm@9.0.0 --filter @pico/companion-shell test
npx pnpm@9.0.0 character:measure /path/to/candidate.png --core
```

Vor jedem Commit mindestens:

```bash
git diff --check
git status --short --branch
```

### Eine Transaktion geht man ueber ihren Zweck

Eine `db.transaction(...)` ist im Gutfall **unsichtbar**: beide Schreibvorgaenge
gelingen, und das Ergebnis ist dasselbe wie ohne sie. Am 2026-09-13 sind drei
Transaktionen weggepflanzt worden, und 120 Tests liefen durch (B163). Wer eine
Transaktion pruefen will, muss den **zweiten** Schreibvorgang scheitern lassen:

```ts
db.exec(`
  CREATE TRIGGER planted_second_write_fails
  BEFORE DELETE ON die_zweite_tabelle
  BEGIN SELECT RAISE(ABORT, 'planted_second_write_fails'); END
`);
expect(() => subjekt.methode(...)).toThrow('planted_second_write_fails');
// und dann: der *erste* Schreibvorgang ist zurueckgerollt.
db.exec('DROP TRIGGER planted_second_write_fails');
```

Ein Ausloeser und keine gestellte Methode: eine gestellte Methode prueft die
Einrichtung des Tests, ein Ausloeser einen Widerspruch der Datenbank. Der
Ausloeser muss auf die Anweisung passen, die *im* Schreibblock steht - ein
Ausloeser, der schon das Lesen davor bricht, macht den Test gruen, ohne die
Transaktion je erreicht zu haben (`device-recovery.test.ts` haelt diese
Erfahrung im Kommentar fest).

### Eine Pflanzsonde, die reihenweise misst

Aus Befund B175, weil sie dort dreimal geschrumpft ist und jedes Mal an derselben
Art Fehler. Wer eine Regel ueber viele Stellen pruefen will, indem er sie einzeln
wegpflanzt, braucht drei Vorkehrungen:

1. **Ein Lauf ohne lesbare Zaehlung ist kein Ergebnis, sondern ein Abbruch.**
   Die Sonde muss ihn melden. Sonst meldet ausgerechnet ein kaputter Lauf die
   meisten Funde - am 2026-09-14 waren es acht, die in einen eingecheckten
   Befund gerieten.
2. **Ein Treffer im Text ist keine Erzeugung.** `reason: 'a' | 'b'` sieht aus
   wie `reason: 'a'`, und eine Typvereinigung umzubenennen aendert zur Laufzeit
   nichts.
3. **Wessen Tests ein gebautes Artefakt fahren, braucht zwischen Pflanzung und
   Lauf einen Bau.** Das betrifft `@pico/vault-daemon` (die Tests starten
   `dist/cli.js`) und den Companion-Paketgate.

4. **Rate die Grenzen eines Rumpfes nicht - frag den Uebersetzer.** Wer die
   oeffnende Klammer durch Zaehlen sucht, trifft bei `): { value: string } {`
   die Klammer des *Typs*. Am 2026-09-14 waren so neun von dreizehn gemeldeten
   Funden Artefakte (B177). `ts.createSourceFile(...)` und `node.body.getStart()`
   geben die Stelle genau.
5. **Eine Pflanzung, die nicht stattfand, sieht aus wie Entwarnung.** Bricht
   das Pflanzskript ab, laeuft die Pruefung danach gegen die *unveraenderte*
   Datei und findet nichts - und das liest sich wie „beisst nicht". Am
   2026-09-15 zweimal an einem Nachmittag (B180). Die Sonde muss zeigen, *was*
   sie gepflanzt hat, bevor sie prueft.
6. **Eine mechanische Ersetzung ist keine Messung.** Der Uebersetzer nennt eine
   *Stelle*; `replace` sucht einen *Namen*. Am 2026-09-15 nahm eine Ersetzung
   drei `const domain` weg, wo nur eines tot war - die anderen zwei lasen es
   sechs Zeilen spaeter (B180). Wo eine Zeilennummer vorliegt, wird gegen sie
   geschnitten (`sed -i '<n>s/.../.../'`), nicht gegen den Text.
7. **Eine Baum-weite Aussage wird ueber die Liste der Konfigurationen
   gefuehrt.** `grep -l tsconfig.base */*/tsconfig.json` nennt siebzehn Pakete;
   eine Liste im Kopf nannte neun (B180).
8. **„Genannt" ist nicht „gehalten", und zwar in beide Richtungen.** Ein Test
   kann einen Waechter halten, ohne seine Meldung je zu nennen - ein
   Byte-Vektor-Test tut das. Und ein Wort kann dreimal behauptet werden,
   waehrend der gemeinte Zweig **nie** faellt: wo ein `throw` an einer
   Oder-Kette haengt, trifft ein Test irgendein Glied, und das Wort sieht
   gegangen aus. Am 2026-09-15 traf beides in einer Messung zu (B181). Eine
   Zaehlung ueber Namen beantwortet, *worueber gesprochen wird*; welcher Zweig
   wirklich haengt, beantwortet nur das Ausbauen **dieses Zweigs**.
17. **Ein Messgeraet ist gerichtet.** Am 2026-09-18 zeigte die Zitiergewohnheit
   dieses Baums - eine Datei, die eine Entscheidung umsetzt, nennt ihr ADR im
   Doku-Kommentar -, dass eine `concept-only`-Zeile mit elf zitierenden Dateien
   ein Widerspruch ist (B197). Das Spiegelbild lag nahe und traegt nicht: von
   36 `implemented`-Zeilen haben vier keine Nennung, und keine davon ist ein
   Fund - drei zitieren ihr ADR in den Beschreibungen ihrer Tests, beim vierten
   ist der Beleg ein Dokument. Wer aus einem Widerspruch ein Tor baut, prueft
   zuerst, ob die Gegenrichtung ueberhaupt etwas behauptet.

16. **Ein verjaehrter Satz ist ein richtiger Name mit einem falschen Verb.**
   Am 2026-09-18 waren in einer Runde vier Saetze still falsch geworden, und
   ich habe beide Richtungen vermessen (B195). Nach *Namen* gesucht: 19
   Bezeichner, die ein Kommentar nennt und der Baum nicht fuehrt, und
   **keiner** davon war Verfall - fremde Namen, absichtliche Vergangenheit,
   ein Tippfehler. Nach *Verben* gesucht: 95 Abwesenheitsbehauptungen, und
   genau dort sass der Fund. Ein Name hat zwei Pruefer, den Uebersetzer und
   das Auge; ein Verb hat keinen. Wer nach faulen Saetzen sucht, sucht nach
   `unused`, `nothing calls`, `does not exist` - nicht nach Bezeichnern.

15. **Ein Vertrag, der selbst prueft, wird draussen nicht genannt.** Am
   2026-09-18 wollte ich aus einem Fund die Regel machen: *welcher
   Protokoll-Wortschatz wird ausserhalb seines Pakets nie genannt?* Gemessen
   waren es 42 von 98 - und fast alle gesund (B195). Ein Protokoll verbraucht
   seinen Wortschatz durch den **eigenen Pruefer**; danach reist der *Wert*
   getippt bis ins Dashboard, waehrend der *Name* im Paket bleibt. Ein
   fehlender Name ist also kein Fund. Was einen macht, ist etwas anderes: eine
   **benannte Bedingung, die eingetreten ist** - ein ADR, der eine Vertagung an
   ein Ereignis knuepft, und das Ereignis ist da. Die Sonde findet Kandidaten,
   der Grund steht im ADR.

14. **Wer eine Abwesenheit prueft, nimmt die Erklaerung aus dem Gegenstand.**
   Am 2026-09-18 sollte `surfaces:check` beweisen, dass eine Oberflaeche keinen
   Aufrufer hat, und suchte das Wort in ihrer Schicht - dort steht aber auch
   ihre eigene `export function`, also fand es sich selbst und erklaerte jedes
   Argument fuer veraltet (B194). Was einer ungebauten Flaeche fehlt, ist ein
   *Aufrufer*, nicht ein *Wort*; die erklaerende Datei gehoert aus dem Korpus,
   und zwar benannt, damit ihr Umzug die Frage neu stellt. Das ist B166s
   Zwilling von innen: ein Pruefer, der seinen eigenen Gegenstand mitzaehlt,
   misst sich selbst.

13. **Ein Test, der mit der falschen Meldung faellt, ist ein Fund.** Am
   2026-09-17 habe ich einen Fall fuer erreichbar gehalten und den Test dafuer
   geschrieben; er fiel - aber an einem *anderen* Waechter, den ich nicht
   gesucht hatte (B183). Die Meldung im Fehlschlag zu lesen statt den Test
   zurechtzubiegen, hat die Annahme widerlegt, bevor sie in einen Befund kam.
12. **Eine Sonde zaehlt erst, was sie *nachweislich* geaendert hat.** Am
   2026-09-16 hat mein Pflanzskript `!== KONSTANTE` in einer Zeile gesucht,
   die Ersetzung laufen lassen und den Zaehler erhoeht - auch wenn die
   Ersetzung nicht griff. Bei umbrochenen Bedingungen
   (`|| archive.schema\n  !== KONSTANTE`) steht der linke Operand auf der
   Vorzeile, es wurde nie gepflanzt, und sechs Zweige galten als ungegangen,
   die in Wahrheit einen Halter hatten (B182). `re.subn` gibt die Zahl der
   Ersetzungen zurueck; ist sie null, ist das ein Abbruch. Das ist Regel 5,
   eingebaut ins eigene Werkzeug - die teuerste Stelle dafuer.
11. **Eine Sammelsonde beantwortet eine andere Frage als eine Einzelsonde.**
   Alle Zweige eines Pakets gemeinsam auszubauen sagt nur „haelt irgendetwas
   irgendetwas". Am 2026-09-16 fiel dabei in `@pico/sync` ein Test, waehrend
   einzeln ausgebaut *kein* Zweig einen Halter hat - der Fehlschlag war ein
   Zusammenspiel mehrerer abgeschalteter Glieder (B182). Wer einem Zweig einen
   Halter zuschreiben will, baut genau diesen aus.
10. **Einen einzelnen Zweig baut man mit `&& false` aus, nicht mit `false`.**
   Wer `x.schema !== KONST` durch `false` ersetzt, macht die Konstante
   unbenutzt - und seit dem 2026-09-15 faellt der Bau darueber
   (`noUnusedLocals`), was bei Paketen mit gebautem Artefakt die Messung
   verhindert. `(x.schema !== KONST && false)` laesst Konstante und Verengung
   stehen und ist im `||` trotzdem immer falsch (B182).
9. **Eine Sonde, die Quellen aendert, misst nur Pakete, deren Tests aus den
   Quellen fahren.** Wer ohne Bau pflanzt, misst jedes abhaengige Paket gegen
   ein sauberes `dist` und bekommt eine Null, die nichts bedeutet. Am
   2026-09-15 meldete derselbe Sondenlauf dem Core zweimal verschiedene
   Zahlen, je nachdem ob ein Bau dazwischen lag. Entweder bauen, oder die
   Aussage auf das Paket beschraenken, in dem die Pflanzung liegt.

Und: gegen den **ganzen** Paketlauf pflanzen, nicht gegen die Dateien, die man
vermutet - der Test zu einer Ablehnung steht oft in einer anderen. Eine
Uebersetzung als Schranke davorzusetzen ist dagegen **falsch**: ein unbedingter
`throw` nimmt TypeScript die Verengung (TS18048), und vitest uebersetzt ohnehin
nicht - die Schranke verwirft dann gueltige Messungen.

**Wer ein Tor baut, zaehlt zuerst, wie viele es davon gibt, worueber es
spricht.** Dreimal hat ein Pruefer hier einen Gegenstand gehabt, der schmaler
war als sein Satz - jedes Mal, weil etwas zweimal existiert und er nur eines
davon kannte (B187, B189). Der Baum hat zwei solche Paare: zwei Speicher (das
Schema des Homes und die vier Tabellen des Relays) und zwei Flaechen (der
Zeichner der Schale und `apps/web`). Beide sind heute gedeckt; ein drittes Paar
braechte die Krankheit zurueck.

Nachmessen laesst sich das mit einem Haken an `readFileSync` und `readdirSync`:
ein Tor kann nicht breiter gelesen haben, als es Dateien angefasst hat. Wonach
ein Tor *aussieht*, ist dagegen nichts wert - zwei Tore, die ich nach ihren
Pfad-Zeichenketten fuer eng hielt, lasen quer durch den Baum (B190).

`pnpm index:check` fragt dasselbe fuer Indizes, und der Preis ist schaerfer:
eine Spalte, die niemand liest, kostet Bytes; ein Index, den niemand nutzt,
macht **jeden Schreibvorgang auf seiner Tabelle langsamer** - gemessen am
Ereignisprotokoll ein Drittel. Das Tor baut das echte Schema in eine
Wegwerf-Datenbank, schickt jede vorbereitete Anweisung durch
`EXPLAIN QUERY PLAN` und sammelt ein, welche Indizes die Plaene nennen. Es
laeuft **hinter `pnpm build`**, weil es `dist/migrations.js` faehrt.

Die Anweisungen kommen aus dem **Syntaxbaum**, nicht aus einer Regex: fuenf
Regex-Anlaeufe gaben fuenf verschiedene falsche Antworten, der letzte mit einem
nachweislich falschen Eintrag in der Liste (B188). Wer SQL aus TypeScript
liest, liest `.prepare(...)` als Aufrufausdruck.

`pnpm vocabulary:check` haelt die andere Haelfte derselben Schicht: jeder
geschlossene Wortschatz, den die Datenbank per `CHECK (col IN (...))`
durchsetzt, sagt genau die Woerter einer *exportierten* TypeScript-Liste - oder
ist begruendet, und die Begruendung wird nachgerechnet. Dass die TypeScript-
Seite einen **Namen** haben muss, ist der Punkt: `copies:check` wacht ueber
exportierte Namen, und ein Wortschatz, der nie benannt wird, kann sich beliebig
oft wiederholen, ohne je als Kopie zu gelten (B185).

`pnpm column:check` stellt dieselbe Frage wie `store:check`, eine Ebene tiefer:
hat jede Spalte, die ein Home schreibt, irgendwo einen Frager? Was *fragen*
heisst, ist abgeleitet - der Name steht irgendwo ausserhalb seiner
`CREATE TABLE` und ausserhalb einer Schreibstellung (`INSERT`-Spaltenliste,
`UPDATE ... SET`). Ein Eintrag `beside_json` wird **nachgerechnet**: die Tabelle
muss wirklich eine `*_json`-Spalte tragen. Und das Tor liest sich selbst nicht -
seine Begruendungsliste nennt jede Spalte, die es entschuldigt, und ein Pruefer,
der sich selbst zum Gegenstand zaehlt, findet alles gefragt (B184).

`pnpm transaction:check` haelt die andere Haelfte und stellt zwei Fragen: ob
zwei Schreibvorgaenge auf einem Weg ueberhaupt eine Transaktion haben, und ob
ein Schreibsatz in einer Schleife eine hat. Es fragt den Syntaxbaum und kein
Zeilenfenster - `PICO_WRITE_TRANSACTION_CENSUS=1` zeigt seine Zaehlung. Wo ein
Eintrag `wrapped_by_caller` sagt, rechnet das Tor das nach und nennt sonst die
Aufrufstelle, die aus der Transaktion gefallen ist.

Code-, Protocol-, Release- und produktbezogene Dokumentationsmilestones muessen
den vollen Release-Gate bestehen. Bei einer rein internen Agent-Doku-Aenderung
sind Struktur-, Link- und Diff-Pruefung ausreichend.

## Linux-Companion-Paket

Das installierbare Linux-amd64-Artefakt wird ohne Netzwerkzugriff aus dem
gebauten Workspace, `pnpm-lock.yaml` und dem vorhandenen pnpm-Store erzeugt.
Der Paketpfad baut dazu einen reduzierten Produktions-Workspace auf und fuehrt
einen gefilterten `--offline --frozen-lockfile --prod`-Install mit deaktivierten
Install-Skripten aus. Ein frischer, leerer pnpm-Metadaten-Cache ist Teil jedes
Paketlaufs; ein warmer Runner-Cache ist deshalb keine versteckte Voraussetzung.
Das pnpm-v9-`deploy` wird bewusst nicht verwendet, weil dessen Aufloesung den
Lockfile nicht als alleinige Autoritaet behandelt.

Der Einstieg bleibt:

```bash
npx pnpm@9.0.0 --filter @pico/companion-shell package:linux
```

Debian-Paket und SHA-256-Sidecar liegen danach im ignorierten Verzeichnis
`apps/companion-shell/out/`. Der Release-Check baut das Paket erneut, prueft
Inhalt, XDG-Autostart, interne Links und fehlende Build-/Profildaten, fuehrt in
einer temporaeren `fakeroot`-Installation Install, Upgrade, Remove und Purge
durch und startet das extrahierte Electron real im Tray-only-Modus:

```bash
npx pnpm@9.0.0 --filter @pico/companion-shell verify:linux
```

Der Ressourcen-Probe laeuft aus dem erzeugten Paket. Chromium bevorzugt seinen
direkt neben der Anwendung liegenden `chrome-sandbox`; ein externer Helper kann
diesen Paketbestand nicht ueberschreiben. Der CI-Workflow fordert deshalb mit
`PICO_COMPANION_ROOT_OWNED_PACKAGE_PROBE=1` einen installationsnahen Probe an:
Der Verifier erzeugt atomar ein exaktes temporaeres Verzeichnis, uebergibt es
vor dem privilegierten Entpacken an `root:root` mit Modus `0755` und laesst
`dpkg-deb` dadurch Archiv-Eigentuemer und Setuid-Bit erhalten. Vor dem Start
muessen Extraktionswurzel und angrenzender Helper regulaer, root-eigen und der
Helper exakt `4755` sein. Electron startet ohne `CHROME_DEVEL_SANDBOX`,
`--disable-setuid-sandbox` oder `--no-sandbox` und waehlt damit denselben
Paket-Helper wie nach einer echten Installation. Das privilegierte
Extraktionsverzeichnis wird vor dem normalen Entfernen ueber seinen registrierten
`mkdtemp`-Pfad rekursiv an den aufrufenden Nutzer zurueckgegeben.

**Der Probe-Modus entscheidet ueber das Budget, und die Differenz ist gross.**
Ein lokaler Standardlauf misst im `user_namespace`-Modus rund 17,5 MB hoeher als
der root-eigene Paket-Probe, fuer den das PSS-Budget definiert ist.

Seit 2026-08-18 weiss die Zusicherung das selbst (ADR 0113 C3): im
`user_namespace`-Modus **meldet** sie die PSS-Zahl und behauptet sie nicht,
mit dem Hinweis, wie man die strikte Pruefung zurueckholt
(`PICO_COMPANION_ROOT_OWNED_PACKAGE_PROBE=1`). Vorher riss der lokale Lauf das
Budget an unveraendertem HEAD - und ein Rot, das ueblicherweise nichts bedeutet,
ist ein Rot, das niemand mehr liest; genau das ist hier zweimal passiert.

Nicht gelockert wurde nichts: `Private_Dirty + Private_Hugetlb` wird in **jedem**
Modus strikt gegen 110 MB geprueft, und das ist die Klasse, die den gepackten
Baum misst statt die Seitenteilung des Wirts. Wer trotzdem eine Abweichung
sieht, prueft zuerst das `probe`-Feld im Messbericht, bevor er den Importgraphen
verdaechtigt.

**Und danach `privateBytes`, nicht nur `privateDirtyAndHugetlbBytes`.** Am
2026-08-12 fiel die gegatete Dirty-Summe zwischen zwei Laeufen auf demselben
Host von 105.680.896 auf 65.032.192 Byte, waehrend `privateCleanBytes` um
denselben Betrag stieg und die private Gesamtsumme sich um 4.096 Byte bewegte.
Vierzig Megabyte wechselten die Spalte, ohne dass sich etwas an der Groesse
aenderte. Eine Bewegung in der Dirty-Summe bei flacher Gesamtsumme ist eine
Klassifizierung des Wirts; erst eine Bewegung in beiden ist die Anwendung. Der Modus, gegen den das Budget definiert wurde, ist ein
ausdrueckliches Opt-in - dieselbe Variable, die `.github/workflows/ci.yml`
setzt - und verlangt passwortloses `sudo`, also ein Terminal mit TTY:

```bash
PICO_COMPANION_ROOT_OWNED_PACKAGE_PROBE=1 \
  npx pnpm@9.0.0 companion:release-check
```

Ein normaler lokaler Lauf entpackt weiterhin unprivilegiert. Weil sein im Archiv
korrekter Setuid-Helper dann absichtlich keine Root-Eigentuemerschaft besitzt,
erzwingt der Verifier mit `--disable-setuid-sandbox` ausschliesslich den
User-Namespace-Pfad. Geerbte `CHROME_DEVEL_SANDBOX`-Pfade und vollstaendig
unsandboxed Probes werden in beiden Modi verweigert. Der Gate prueft ausserdem
den root-eigenen `4755`-Helper direkt im Debian-Archiv. Die Renderer-Sandbox wird
separat durch die C2-Window-, Boundary- und Electron-Smoke-Pruefungen gebunden.

Dafuer werden Linux amd64, `dpkg-deb`, `fakeroot` und entweder eine laufende
Display-Session oder `xvfb-run` benoetigt. Der root-eigene CI-Modus benoetigt
ausserdem passwortloses `sudo` fuer die begrenzte Extraktion und Rueckgabe des
exakten temporaeren Verzeichnisses. Der Probe schreibt seinen letzten
Messbericht als `tray-memory-linux-amd64.json` unter `apps/companion-shell/out`,
wo er vor dem ersten Lauf nicht liegt; PSS
und die Summe aus `Private_Dirty` plus `Private_Hugetlb` sind die v2-Gates.
Summiertes RSS, `Private_Clean` und die gesamte private residente Summe bleiben
informativ, weil Shared Pages im RSS mehrfach und Clean Pages je nach aktueller
Dateiseitenteilung unterschiedlich als private klassifiziert werden. Der Bericht
nennt `privateDirtyAndHugetlbBytes` und dessen 110.000.000-Byte-Budget explizit;
Clean, Dirty und Hugetlb werden ausserdem nach den geschlossenen Electron-Rollen
aggregiert. Die von `app.getAppMetrics()` gemeldeten PIDs ergaenzen den
Parent-/Child-Walk, damit ein vom Sandbox-Start umgehaengter App-Prozess nicht
aus der Messung faellt. Der JSON-Bericht wird vor den Budgetassertions
geschrieben und ausgegeben, sodass auch ein fehlgeschlagener CI-Lauf die
entscheidungsfaehige Evidenz enthaelt. Alle temporaeren Paket-, Lifecycle- und
Probe-Verzeichnisse werden auch nach einem Fehlschlag entfernt.

## Container- und Runtime-Smokes

Lokales Core-Image:

```bash
podman build -f docker/home.Dockerfile -t pico-home:local .
podman build -f docker/relay.Dockerfile -t pico-relay:local .
```

Direkte lokale Smokes muessen einen expliziten Access Mode und disposable
Pfade/Ports verwenden. Niemals echte lokale Datenbanken, Host Keys oder
Memory-Key-Stores in Testcontainer einbinden.

Speichermessung ohne Electron (ADR 0113, `TODO.md`):

```bash
npx pnpm@9.0.0 companion:measure-headless
```

Misst nacktes Node als Kontrolle, den Companion-Kern und `libsodium` einzeln,
und vergleicht gegen den zuletzt aufgezeichneten Tray-Bericht. Ohne die
Kontrolle sagt die Tray-Zahl nichts.

Relevante Quellen:

- `docker/home.Dockerfile`
- `docker/relay.Dockerfile`
- `pico_home/config.yaml`
- `pico_home/DOCS.md`
- `.github/workflows/ci.yml`
- `docs/release/backup-before-migration.md`

Echte Home-Assistant-Ingress-/First-Boot-Validierung benoetigt eine passende
Home-Assistant-Umgebung und darf nicht durch einen normalen Container-Smoke als
erledigt behauptet werden.

## Daten, Keys und Backups

- SQLite-Datenbank, Home-Host-Keys, Memory-KEKs und Vault-Keyfiles sind getrennte
  Custody-/Backup-Klassen.
- Fuer Tests nur per Testhelper oder `mktemp` erzeugte Pfade verwenden.
- Keine Keys, Move-In Codes, Bootstrap Codes, Sessions oder Tokens in Commits,
  Fixtures oder dauerhafte Logs uebernehmen.
- Restore- und Migrationstests muessen fail-closed Security-Grenzen erhalten.

Die autoritativen Details stehen in ADR 0070-0084 und
`docs/release/backup-before-migration.md`.

## Dokumentationskonsistenz

Bei README-Aenderungen `docs/release/documentation-consistency.md` befolgen.
Bei Versionsaenderungen `docs/release/versioning.md` befolgen.
Bei ADR-Implementierungsfortschritt die Matrix
`docs/architecture/implementation-status.md` pruefen.

`progress.md` bleibt eine periodische Schaetzung. Prozentwerte, Testzahlen und
naechste Schritte nur nach direkter Repository-Pruefung aktualisieren.

## Bekannte Umgebungsbesonderheiten

- `pnpm` ist moeglicherweise nicht global auf dem `PATH`; `npx pnpm@9.0.0` ist
  der portable Standardweg.
- Die Arbeitsmaschine bringt kein passendes globales Node mit. Node 22.20.0 und
  Hilfsbinaries werden dort unter `/tmp/node-v22.20.0-linux-x64/bin` bzw.
  `/tmp/pico-bin` bereitgestellt und beiden `PATH` vorangestellt. `/tmp` ist
  tmpfs: nach einem Neustart ist das erneut bereitzustellen, und grosse
  Fixtures gehoeren nicht dorthin.
- **Nach vielen Kettenlaeufen in `/tmp` nachsehen** (Befund B172). Es liegt hier
  im Arbeitsspeicher, und liegengebliebene Testverzeichnisse summieren sich
  lautlos: am 2026-09-14 standen dort **2.367 `pico-*`-Verzeichnisse** und die
  Schale meldete mitten in einer Messung ein ueberschrittenes Quota. `tests:check`
  haelt den Fall seitdem fuer Testdateien; der Paketbau laesst aus dem Grund von
  B114 weiter welche liegen. Aufraeumen, ohne `/tmp/pico-pnpm-store` und
  `/tmp/pico-bin` anzufassen:

  ```bash
  find /tmp -maxdepth 1 -mmin +60 -name 'pico-host-options-*' -o \
       -maxdepth 1 -mmin +60 -name 'pico-companion-*' | xargs -r rm -rf
  ```

- Sandbox-DNS kann Registry-Aufloesung blockieren; nicht durch unsichere
  Workarounds umgehen.
- Crypto-Tests verwenden `libsodium-wrappers-sumo`. Externe Prozesse wie
  `b2sum` sind kein portabler Testvertrag und koennen in Sandboxes scheitern.
- Testlogs duerfen kurzlebige synthetische Setup-/Bootstrap-Werte ausgeben; sie
  sind keine Fixtures oder persistierbaren Beispielwerte.
- **Die Zeremonie-Tests nicht neben dem Linux-Paketbau laufen lassen.** Sie
  starten echte Vault-Daemon-Prozesse und leiten Schluessel mit Argon2id ab,
  das absichtlich speicherhart ist. Neben `companion:release-check`, der
  Chromium-Prozesse hochzieht, reissen drei davon auf dieser Maschine die
  20-Sekunden-Grenze; allein laufen dieselben Tests in 1,5-4,6 Sekunden.

  Gemessen statt vermutet: an zwei festgepinnten Kernen - der Form des
  CI-Runners - bleiben sie bei 1,7-4,6 Sekunden und alle 110 Tests bestehen.
  Es ist also **keine** Kernknappheit und kein CI-Risiko, sondern
  Speicherdruck auf einer 16-GB-Maschine, deren `/tmp` im RAM liegt. Die
  Zeitgrenze ist nicht das Problem und gehoert nicht erhoeht.

- **Die Relaisbereitstellung des Nutzers laeuft ueber einen Tunnel auf 443,
  nicht ueber Portweiterleitung.** Das traegt, weil das Relay am oeffentlichen
  Port schlichtes HTTP spricht und der Endpunkt vom Adressnamen getrennt ist -
  `apps/core/src/link-relay-transport.ts` sagt es woertlich: *"Where
  the operator answers. A deployment property, not an address."* Der
  Operator-Name selbst steht bewusst **nicht** in diesem Repository.

  Er ist ausserdem **dauerhaft**: er ist der Teil hinter dem `@` in jeder
  Adresse, die dieses Relay ausgibt, und `apps/relay/src/store.ts` weist jedes
  Paket ab, dessen Adresse einen anderen Operator nennt. Ein spaeterer Wechsel
  toetet alle bereits ausgegebenen Adressen, also wird der Wert einmal gesetzt
  und nicht ausprobiert. (Stand vom 2026-08-20, hierher verschoben am
  2026-09-10 beim Kuerzen von `.agent-context.md`.)

Historische erfolgreiche Testlaeufe werden nicht hier protokolliert. Der
aktuelle Handoff nennt nur den zuletzt direkt verifizierten Gate; Git und CI
halten den Verlauf.
