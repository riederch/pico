# TODO

Offene, noch nicht entschiedene Vorhaben. Architekturentscheidungen gehoeren in
ADRs, Arbeitsstand in `.agent-context.md`, Fortschritt in `progress.md`.

## Ein Modellanbieter kommt nur per Skript in ein Home - geschlossen am 2026-08-17

**Gefunden am 2026-08-17, beim Nachgehen der Lieferanten-Kette.**

`PicoModelProviderRegistry.put()` ist der einzige Weg, wie ein
Modellanbieter-Eintrag entsteht, und hat keinen Aufrufer ausserhalb
seiner Tests. Jede Route zu Modellanbietern arbeitet an einem bereits
vorhandenen Eintrag (`:entryId/decision`, `:entryId/narrowing`). Das
Register ist auf jedem echten Home leer.

Das ist kein versteckter Defekt: `scripts/measure-model-provider.ts`
sagt es selbst - *"a development tool rather than a product surface ...
the measurement belongs to the settings flow ADR 0152 shapes and nobody
has built"*, und *"It writes nothing"*. Das Skript misst einen Host und
druckt einen Kandidaten-Eintrag, der bereits durch
`parsePicoModelProviderEntry` gegangen ist.

**Was daran haengt.** Alles, was ein Modell will, endet vorher:

- `pickPicoDepotIntakeEntry` verweigert mit `no_decided_entry`, also
  werden ADR 0136 BR1s Bibliotheks-Lesevorgaenge nie eingereiht - auch
  jetzt nicht, wo ein Lieferant angehaengt werden kann.
- Die Modellanbieter-Liste im Companion ist immer leer, ihr Abschnitt
  also immer verborgen (ADR 0152).
- Rueckfragen an die eigene Erinnerung (ADR 0116 W1) haben keinen
  Anbieter, gegen den sie laufen koennten.

**Was zu entscheiden ist.** Die Messung greift nach aussen und dauert;
sie ist damit keine Fensteroperation, sondern etwas, das das Home tut,
waehrend die Person zusieht. Offen ist, wer sie ausloest, woher die
Adresse kommt (die Person tippt sie, wie beim Depot), und ob ein
gemessener Eintrag schon eine Entscheidung ist oder erst einen
Kandidaten erzeugt, ueber den ADR 0152 dann fragt.

**Der CLI-Pfad steht quer zur Entscheidung vom 2026-08-16**, dass jede
Konfiguration ueber den Pico Client laeuft - so wie es beim Home mit dem
Move-in-Code und beim Relay mit dem Claim-Code geloest wurde.

**Umgesetzt.** `home.model.provider.measure.ask` misst einen Host, den die
Person im Companion benennt, und legt einen *unentschiedenen* Eintrag an.
Die Antwort kommt, wenn die Arbeit beginnt - Messen dauert Minuten. Der
Verlauf reist mit `home.model.providers.read` mit, weil ADR 0119 Q4s
Fremden-Budget sechzig Anfragen pro Minute geteilt ist.

ADR 0048s Erklaerung ist Vorbedingung, nicht Auswahlfeld: eine getippte
Adresse ist `declared_own_host` oder nichts, denn die anderen fuenf Klassen
beschreiben Laufzeiten, die Pico selbst betreibt. Verweigert wird in Worten,
nicht durch einen ausgegrauten Knopf.

Die ganze Kette laeuft jetzt live durch, in neun Schritten und nur ueber die
Oberflaeche: `apps/core/src/whole-chain.test.ts`. Dabei fiel ein fuenfter
Befund an - der Einsprungpunkt des mitgelieferten Lieferanten wurde ueber
`process.cwd()` aufgeloest und traf nur, weil das Image `WORKDIR /app` setzt.

## Eine Person kann kein einzelnes Erinnerungsstueck loeschen - offen

**Gefunden am 2026-08-17 vom neuen `store:check`.**

`MemoryStore.deleteInDomain` hat keinen Aufrufer ausserhalb der Tests. Die
beiden Enden gibt es: die Aufbewahrung loescht nach Richtlinie
(`enforceTombstone`, ADR 0074), und ein Domaenen-Schredder nimmt alles
(ADR 0071/0072). Die Mitte fehlt - "loesch genau das hier".

**Was fehlt, ist eine Oberflaeche, nicht die Methode.** Nichts im Companion
listet die Erinnerungen einer Person auf; es gibt die Rueckfrage-Antworten
(ADR 0116 W5) und die Modell-Lesevorgaenge, aber keine Ansicht, aus der
heraus man ein einzelnes Stueck loeschen koennte. Zu entscheiden ist also
zuerst, *woraus* geloescht wird - und das ist eine Produktfrage.

Bis dahin steht die Methode als begruendete Ausnahme in
`scripts/check-store-writers.mjs`, damit die Abwesenheit sichtbar bleibt,
statt eine tote Methode zu sein, die niemand bemerkt.

## Auslieferbare Pakete - umgesetzt am 2026-08-16

**Entschieden und gebaut als ADR 0153.** Drei Auslieferungen, benannt nach
dem, was eine Person bekommt:

| Auslieferung | Was es ist | Updateweg |
|---|---|---|
| Pico Home | Home-Assistant-App `pico_home`, Image `ghcr.io/riederch/pico/home` | Supervisor |
| Pico Relay | Container `ghcr.io/riederch/pico/relay` | Container-Verwaltung |
| Pico Client | `pico-companion_<version>_amd64.deb` als Release-Asset | Paketverwaltung |

Der urspruengliche Auftrag verlangte, `pico_core` waehrend des Aufbaus stehen
zu lassen und spaeter getrennt zu entfernen. Der Nutzer hat das am 2026-08-16
umentschieden: entfernt und ersetzt, weil noch nichts produktiv ist. Ein
Slugwechsel ist kein Update - der Supervisor sieht eine andere App mit eigenem
`/data` - und genau deshalb ist er nur so lange bezahlbar, wie kein Zuhause
auf Dauer gegruendet ist. Die Laufzeit heisst weiterhin Pico Core: `apps/core`,
`@pico/core`, `pico-home-core`. Umbenannt wurde die Produkthuelle, nicht der
Prozess.

Eine Version fuer alle drei, aus einem Tag (PK4). Der Preis steht in
`docs/release/versioning.md`: ein reiner Client-Fix hebt auch die Version des
Zuhauses. Die Wire-Kompatibilitaet haengt weiterhin allein an
`picoProtocolVersion`.

### Geschlossen am 2026-08-16: wie ein Betreiber einen Relay-Account anlegt

**Als ADR 0154, und mit keiner der drei Formen, die hier standen.** Der Nutzer
hat jeden CLI-Pfad ausgeschlossen: jede Konfiguration laeuft ueber den Pico
Client.

Der Move-In Code liess sich nicht kopieren - er endet in einem beidseitig
signierten Gruendungsdatensatz, und ADR 0149 RS2 verbietet dem Relay jede
Identitaet, Delegation und Signatur. Kopierbar war der *andere* Code des
Zuhauses: der Foundation-Operator-Bootstrap-Code, der ausdruecklich keine
Pico-Identitaet ist. Ein unbeanspruchter Relay schreibt einen einmaligen
Claim-Code in sein Log, der Client tauscht ihn gegen das Betreiber-Credential
und verwahrt es im Keystore des Desktops.

Vier Dinge sind dabei mitgekommen, die vorher fehlten: Konten lassen sich
sperren, der Relay speichert Credentials nur noch als Digest, die Quota
begrenzt jetzt beide Achsen statt nur der Mailboxzahl, und der Admin-Port hat
eine Rate-Grenze mit getrennten Budgets - damit wer haemmert nicht den
Betreiber aus seinem eigenen Relay aussperrt.

### Offen: was diese Arbeit nicht enthaelt

- **Echte Home-Assistant-Validierung.** Der Container-Smoke prueft den
  Supervisor nicht. Ingress, Optionsvalidierung und ein Update von A auf B auf
  einer echten Installation bleiben Handarbeit.
- **Windows- und macOS-Client.** Braucht Runner der jeweiligen Plattform und
  Signaturzertifikate auf eine Rechtsperson - Nachbarschaft von ADR 0111 L3.
- **Android.** ADR 0131, und das ist keine Paketierung, sondern eine eigene
  Implementierung des Vault-Vertrauenspfads.
- **Eigenstaendige Pico Surfaces.** Weiterhin erst, wenn eine Zielplattform
  feststeht. Ein losgeloestes Demo-Paket ohne festgelegte Vault-Verbindung
  zaehlt nicht als belastbarer Produktpfad.
- **Ein Weg zwischen zwei Zuhausen.** Diese Umbenennung war bezahlbar, weil
  nichts gegruendet ist. Sie schafft keinen Export/Import-Pfad - der naechste
  Umzug, etwa auf das Appliance-Image aus ADR 0027, braucht einen.
- **Unbeaufsichtigte automatische Updates** bleiben aus, bis Herkunft,
  Integritaet, Gesundheitstest, Datensicherung, Rollback und
  Updateaufzeichnung durchgaengig abgesichert sind.

## Companion-Ressourcenbedarf ohne Electron - gemessen am 2026-08-16

**Die Messung liegt vor.** `pnpm companion:measure-headless` startet denselben
Companion-Kern ohne Electron, misst PSS, privaten Speicher, Leerlauf-CPU und
Wakeups und schreibt den Bericht nach
`apps/companion-shell/out/headless-core-memory-linux.json`.

Der tragende Teil ist die **Kontrollmessung**. Ohne sie liest sich die
Tray-Zahl als "222,7 MB sparen", und das ist falsch: ein Headless-Produkt
zahlt weiterhin fuer eine JavaScript-Laufzeit.

| Gemessen (PSS, Median aus drei Laeufen) | |
|---|---|
| Nacktes Node, im Leerlauf | **31,1 MB** |
| Node + Companion-Kern geladen | **50,7 MB** |
| Nur `libsodium-wrappers-sumo` | 46,4 MB |
| Paketierter Tray, sieben Prozesse (2026-08-14) | **222,7 MB** |

Daraus:

- **Electron kostet 172,0 MB** - 77 Prozent des Trays.
- **Pico-eigenes JavaScript kostet 4,3 MB.**
- **`libsodium` kostet 15,3 MB**, also mehr als das Dreifache des gesamten
  uebrigen Pico-Codes.
- **Ein Headless-Produkt zahlt weiterhin 50,7 MB.**
- Leerlauf-CPU und Wakeups sind in allen Varianten **null** ueber ein
  Fuenf-Sekunden-Fenster. Fuer den Tray ist das nicht gemessen; die
  CPU-Frage ist damit fuer den Kern beantwortet und fuer Chromium offen.

### Der Importumfang ist geprueft, und es gibt nichts zu holen

Der zweite Teil des Auftrags war, den statischen Importumfang auf unnoetig
frueh geladene Module zu pruefen. Es gibt genau einen schweren Kandidaten,
`libsodium-wrappers-sumo`, das `main.ts` auf oberster Ebene importiert - und
er laesst sich nicht verschieben:

- `sodium` importiert und `sodium` importiert **plus** `await ready` messen
  identisch (46,4 MB). Die Kosten stecken im Modul, nicht in der
  Initialisierung, ein spaeteres `await` bringt also nichts.
- `startServiceCore` wartet in seiner ersten Zeile auf `sodium.ready`. Nicht
  importieren ginge nur, wenn der Tray ohne laufenden Kern nuetzlich waere.

### Was das entscheidet: nichts

ADR 0113 hat Electron aus Gruenden gewaehlt, die nicht Speicher heissen - ein
shell-freier Kern mit einer Schale darueber, ein Produktpfad, keine zweite
Vertrauensgrenze. 172 MB heben das nicht auf. Was die Messung beseitigt, ist
die Moeglichkeit, in beide Richtungen aus einer Zahl zu argumentieren, die
niemand erhoben hat.

Wer die Frage spaeter wieder aufmacht, hat jetzt drei Groessen statt einer:
was Chromium kostet, was ohne es bliebe, und dass der Loewenanteil des Rests
eine Kryptobibliothek ist, die jede Form von Pico braucht.

## Lizenzbedingungen: anwaltliche Durchsicht

Die Bedingungen sind geaendert und als ADR 0111 dokumentiert: betriebliche
Eigennutzung auf einem selbst betriebenen Pico Home ist erlaubt, kommerzielles
Pico-Hosting bleibt beim designierten Pico Rights Holder.

Offen ist nur noch Gate L3 aus ADR 0111: **anwaltliche Durchsicht der
Formulierungen.** Die zwei Stellen mit dem meisten Gewicht sind

- die Definition "self-operated Pico Home" (Key-Custody plus Betrieb statt
  Hardwarebesitz) und
- die Abgrenzung bezahlte Wartung gegen Betrieb durch Dritte.

Bis dahin keine Aussenkommunikation, die die neue Erlaubnis als rechtlich
geprueft darstellt.

**Daran haengt die Repository-Sichtbarkeit, entschieden am 2026-08-09.** Ein
oeffentliches Repository *ist* diese Aussenkommunikation: README,
`COMMERCIAL.md` und `LICENSE-FAQ.md` tragen die Erlaubnis zur betrieblichen
Eigennutzung und den Hosting-Vorbehalt, und oeffentlich ist unumkehrbar. Die
Sichtbarkeit bleibt deshalb, wie sie ist, bis L3 erledigt ist *und* der
Entschluss gefallen ist, fremde Nutzer einzuladen.

Damit bleibt auch ADR 0122 Y2 offen: GitHub speichert fuer nutzereigene
private Repositories keine Build-Attestation. Das ist bewusst getragen, weil
Provenance erst dann traegt, wenn es einen fremden Konsumenten gibt - denselben
Moment, den L3 ohnehin absteckt. Der Workflow laesst die Attestation aus und
nennt die Auslassung; `supply:check` verweigert eine stille.

Eine Veroeffentlichung waere aus Geheimnissicht unbedenklich: 716 Commits ohne
Schluesselmaterial, Tokens oder verdaechtige Dateien, geprueft am 2026-08-09,
und die beiden Recovery-Card-PDFs sind namentlich in `.gitignore` und in
keinem Commit. Getrennt davon zu pruefen ist, ob die Rechteinhaberschaft aus
`COMMERCIAL.md` und die Marke aus `TRADEMARK.md` bei einer Privatperson oder
einer Organisation liegen sollen - das haengt nicht an der Attestation.

## Mehrere gleichzeitige Praesenzen einer PICO-Identitaet — entschieden

**Am 2026-08-09 als ADR 0126 geschrieben.** Die vier Punkte, die hier vor dem
Schreiben zu klaeren waren, sind beantwortet: Praesenz ist eine zweite Achse
neben den ADR-0015-Knotenrollen (die Rolle wird Eigenschaft einer Praesenz,
ADR 0015 bleibt unveraendert), was eine Praesenz deklariert heisst
**Affordance** und ist von ADR 0036s Capability getrennt (`riskClass` und
`requiresConfirmation` bleiben an der Handlung), die Nummer ist vergeben, und
ADR 0113s Companion wird ueber eine Statusnotiz als erste Praesenz benannt
statt umgeschrieben. Der Auftrag unten bleibt als Quelle stehen; abgewichen
wurde nur beim Namen `PresenceCapability`, und das steht in der ADR unter den
verworfenen Alternativen.

Offen sind jetzt Implementierungs-Gates in der ADR, keine Vorfragen mehr.
**P2, P6 und die haelfte von P3 sind am 2026-08-16 implementiert.** Registry,
Lease, berechneter Verbindungszustand, geschlossenes Affordance-Vokabular,
`presence:check` im Gate, Abschaltbarkeit je Affordance oder ganzer Praesenz -
und die Zustandsgrenze als Tuer: `crossPicoStateBoundary` schreibt Memory Item
und Protokoll in einem Zug, und `home.recall.keep` geht seitdem hindurch.

**Offen aus P3 bleibt der Umzug des Beobachtungspuffers**, vom Nutzer am
2026-08-16 bewusst zurueckgestellt. Der Grund steht in den Zahlen:
`appendPicoObservations` hat ausser Tests keinen Aufrufer, der Core haelt also
gar keine Rohmessungen, und die einzige existierende Praesenz ist ein Desktop
ohne Standortsensor. Der Umzug wartet auf ADR 0131s Android-Laufzeit; die
Kreuzungsart `derived_observation` ist schon deklariert, damit das Telefon
durch dieselbe Tuer geht.

**P4** blockiert weiterhin am fehlenden Action Runner, **P5** ist erledigt.

P3 bleibt der Punkt mit der Entscheidung darin: ein Telefon in der Tiefgarage
hat kein Zuhause, also funktioniert "wo habe ich geparkt" ausgerechnet offline
nicht. Entweder bekommt eine Praesenz lokalen Puffer plus lokale Ableitung,
oder die Erfassung bleibt eine Heimnetzfunktion.

### Urspruenglicher Arbeitsauftrag

Arbeitsauftrag liegt als `docs/development/briefs/multi-presence.md` vor
(Stand 2026-08-02). Ziel ist eine Architektur, in der eine PICO-Identitaet
gleichzeitig ueber mehrere Geraete und Laufzeitumgebungen praesent ist:
Mobilgeraet, Desktop, stationaere Installation, eingebettetes System,
Fahrzeug, verkoerperte Robotik. Leitsatz: eine Praesenz ist keine eigene
PICO-Persoenlichkeit und erhaelt durch ihre Hardwareform keine zusaetzliche
Autoritaet.

Der Auftrag ist ausdruecklich ADR- und Architekturarbeit; eine vollstaendige
Praesenzorchestrierung ist nicht gefordert. Verlangt sind unter anderem:
Trennung von Identitaet und Praesenz, Trennung von dauerhaftem und lokalem
Zustand, Capabilities statt Geraetetypen, eine Adaptergrenze, Ausschluss
sicherheitskritischer Echtzeitsteuerung aus dem Core, Praesenz-Registry mit
Heartbeat, Uebergabe/Idempotenz/Ownership sowie Datenminimierung fuer
Sensorpraesenzen.

Vor dem Schreiben zu entscheiden war (alles beantwortet, siehe oben):

- **Terminologie gegen ADR 0015.** Dort stehen bereits Full Client, Light
  Client, Relay Server und Core Host als Knotenrollen. Der Auftrag verbietet
  eine parallele, widerspruechliche Begriffswelt. Zu klaeren ist, ob
  "Praesenz" die Knotenrollen ersetzt, verfeinert oder quer dazu steht.
- **Capability-Begriff gegen ADR 0036.** Dort sind Capabilities, Connectors
  und die MCP-Grenze bereits belegt. Die `PresenceCapability` des Auftrags
  (mit `riskClass` und `requiresConfirmation`) muss darauf aufbauen statt
  denselben Namen zweimal zu vergeben. Auch ADR 0010 (Tool-Policy und
  Executor) und ADR 0048 (Model-Capability-Delegation) sind zu pruefen.
- **ADR-Nummer 0126.** Vergeben und geschrieben. 0124 ist an die Character-Architektur vergeben, 0125
  an PAS.
- **Verhaeltnis zu ADR 0113.** Der Companion ist heute eine einzelne
  Desktop-Praesenz. Ob C1/C2 rueckwirkend als Praesenz beschrieben wird oder
  erst kuenftige Blocks, ist eine bewusste Entscheidung.
- **Darf eine Praesenz eigenen dauerhaften Zustand halten?** Das ist die
  Frage, die den Auftrag von einer Aufraeumarbeit zu einer Vorbedingung
  macht. `pico_observation` (ADR 0129 SR2) liegt im Core: Migration,
  Q5-Obergrenze, Shred-Kaskade. Die Ableitung SR1/SR4 sind reine Funktionen,
  aber die *Erfassung* schreibt ins Home. Ein Telefon in der Tiefgarage hat
  kein Home - "wo habe ich geparkt" funktioniert damit ausgerechnet offline
  nicht, also genau dort, wo Issue #3 es verlangt. Entweder bekommt eine
  Praesenz lokalen Puffer plus lokale Ableitung, oder die Erfassung bleibt
  eine Heimnetzfunktion und Issue #3 bleibt unerfuellt.

Seit 2026-08-09 ist dieser Auftrag terminiert: `docs/development/`
`roadmap-to-first-client.md` fuehrt ihn als Phase 3 und macht Phase 6
(Nuetzlichkeit auf dem Telefon) davon abhaengig.

Beruehrt ausserdem: ADR 0104 (Einstellungen gehoeren nach Pico), ADR 0117
(Origin-bewusster Datenfluss), ADR 0118 (Offline-Degradation) und
`implementation-status.md` als Index.

## Zentraler PICO-Generator aus Parametern

Ziel ist ein Generator, der PICO aus Parametern erzeugt und fuer alle
Oberflaechen zustaendig ist, von der Recovery-Card-PDF bis zur App. Heute ist
jede PICO-Darstellung im Repository ein Zuschnitt **desselben einen
Renderings** mit 303x347 Pixeln. Daher stammen zwei bekannte Grenzen: die
Aufloesungsdecke und die acht Avatar-Zustaende ohne ein einziges Asset.

**Entschieden am 2026-08-02: extern modellieren.** Das Modell entsteht in
einem Modellierwerkzeug ausserhalb des Repositories; die Silhouettenmessung
wird damit vom Iterationswerkzeug zur Abnahmepruefung. Die Architektur steht
als ADR 0124.

### Was vorliegt

**Korrigiert am 2026-08-16: das Messinstrument liegt seit dem 2026-08-02 im
Repository.** Dieser Absatz forderte weiterhin einen Umzug, der laenger unten
im selben Abschnitt schon als erledigt steht - `tools/character-silhouette/`
mit `measure.mjs`, aufrufbar als `pnpm character:measure` (Commit `991df82`).
Zwei Absaetze ueber dieselbe Sache, die auseinandergelaufen sind.

Nur der Wegwerf-Prototyp liegt weiterhin unversioniert in
`~/Downloads/pico-sdf-prototyp/`, und darf das:

- `pico-sdf3.mjs`: PICO als Signed Distance Field, CPU-Raymarching, rund 200
  Zeilen ohne Abhaengigkeiten. Weiche Schatten, Verdeckungsverschattung,
  GGX-Glanz, Naeherung fuer Streuung, Umgebungsspiegelung.
- Stand: **96,7 Prozent Kerndeckung** (Kopf, Hals, Rumpf ohne Arme).

### Befunde, die nicht verlorengehen duerfen

- **Silhouette ist notwendig, nicht hinreichend.** Die Deckung stieg von 82 auf
  96,7 Prozent, waehrend die 3D-Form schlechter wurde: sichtbare Kante zwischen
  Kopfkugel und Kalotte, auf Umrisspassung geschrumpfte Seitenmodule,
  ungepruefte Tiefe. Eine einzelne Ansicht unterbestimmt ein 3D-Modell.
- **Das 3D-Modell ist eine neue Character-Entscheidung**, keine Ableitung. Es
  laesst sich an den Referenzen pruefen, nicht aus ihnen rekonstruieren.
  Freigabe auf v3.3.0-Ebene mit der Generatorklasse aus dem PAS-Auftrag.
- **Mimik ist billig.** PICOs Gesicht ist ein dunkles Display; Augen und Mund
  sind gezeichnete Leuchtformen, keine verformte Geometrie. Fuenf Zustaende
  unterscheiden sich um sechs Zahlen. Laeuft zur Laufzeit als 2D in Canvas,
  SVG oder PDF, ganz ohne den 3D-Generator.
- **Gestik ist teuer.** Sie bewegt Geometrie und braucht gebackene Bildfolgen.
  Also ein kurierter, endlicher Satz, kein frei animierbares Modell.
- **Offline erzeugen, nicht zur Laufzeit rendern.** Drei Gruende: das
  Tray-RSS-Budget aus ADR 0113 C3, GPU-Ausgabe ist ueber Treiber hinweg nicht
  bit-deterministisch und traegt damit keine Golden Hashes, und HA laeuft oft
  ohne brauchbare GPU (ADR 0118, 0119).
- **Determinismus-Fallstrick:** `Math.sin`, `Math.cos` und `Math.pow` sind in
  JavaScript nicht bit-identisch ueber Engines hinweg. Golden Hashes muessen
  die quantisierte Ausgabe hashen, nicht die Gleitkommazwischenwerte.
- Messzeiten einkernig, unoptimiert: 256 px rund 1,6 s, 512 px rund 7,8 s,
  Laufzeit-Mimik im Mikrosekundenbereich.

### Vor der Uebergabe an eine frische Sitzung

Geplant ist, das Repository in einen Webchat einzuspielen und dort zu
arbeiten. Diese Sitzung ist dort nicht dabei, also existiert nur, was im
Repository liegt. Offen sind daher:

Erledigt am 2026-08-02: Architektur als ADR 0124, Messwerte und Messprotokoll
als `Character_Geometry_Measurements.md`, Beauftragung als
`Character_Core_Modeling_Brief.md`, Messinstrument als
`tools/character-silhouette/`, Einstiegspunkt in `.agent-context.md` und der
Root-Aufruf `pnpm character:measure`. Der zuvor blockierende ADR-0113-C3-Block
ist mit Runtime-Commit `842b7f8` abgeschlossen und `release:verify` wieder
gruen.

### Verhaeltnis zum PAS-Auftrag

`docs/development/briefs/parametric-appearance-system.md` (Fassung 1.2)
setzte einen Character Core voraus, den es geometrisch nicht gab: Die
Kollisionstests in Abschnitt 13.3 pruefen gegen Visier, Seitenmodule und
Schulterraum. ADR 0124 liefert diese Volumina jetzt. PAS parametrisiert Haar
und Materialfarben, nicht PICO, und kommt deshalb **nach** dem Core.

**Die Preset-Frage ist am 2026-08-09 geschlossen, weil sie falsch gestellt
war.** Sie unterstellte eine gemeinsame Achse und berief sich auf eine Liste
(Standard, Technical, Soft, Focus, Night, Work, Home, Firefighter, Water),
die aus zwei verschiedenen Achsen zusammengesetzt ist: sechs davon sind
umbenannte oder aufgespaltene Kontexttokens (`technology`,
`waterInfrastructure`, `fireDepartment`, `organization`, `smartHome`,
`nightFocus` - Letzteres in der Liste faelschlich in Night und Focus
geteilt), `communication` und `energy` fehlen ganz, und Standard/Soft
stammen aus ADR 0013s Style-Varianten. Appearance ersetzt nichts und ist
keine vierte Achse: `appearance-profile-v1.ts` haelt ausdruecklich fest,
dass das Profil weder Statusfarbe noch Kontextausruestung ausdruecken kann.
Die vier Achsen und ihre Vorrangregel stehen jetzt in ADR 0125.

Offen bleiben daraus zwei kleinere Luecken, beide stromaufwaerts:

- **Die Kontextachse war nie unbeschrieben - sie war nur nicht verlinkt.**
  Korrigiert am 2026-08-09: `Color_System.md` definiert die Achse,
  `Context_Modules.md` sagt, was ein Kontext veraendert, und listet alle
  acht samt `Nacht / Fokus`, `Context_Icon_System.md` zaehlt sie auf,
  `PICO_Product_Design_System_v1.0.md` traegt die Werte. Nur die Tokens
  zeigten auf nichts davon. ADR 0135 D2 hat den Zeiger ergaenzt und
  festgehalten, dass der Kontext eine Pico-Einstellung nach ADR 0104 ist
  und dass noch keine Flaeche die Tokens liest.
- **Die Style-Variante ist keine Achse.** `neutral/technical/soft` steht in
  ADR 0013 unter "Design basis image" - in einer Liste dessen, was das
  Ursprungsbild "shows the intent for", neben context modes, modularen
  Elementen und Multi-Surface-Darstellung. Nie entschieden. Der Nachbar in
  derselben Liste *wurde* realisiert, als die acht Kontexttokens; so sieht
  Realisierung aus, und hier hat sie nie stattgefunden. Als Nicht-Achse
  festgehalten in ADR 0135 D3.

ADR-Nummern zu diesem Abschnitt: **0124** ist die Architektur (autorierter
Character Core und gestufte Darstellung, angelegt 2026-08-02), **0125** ist
PAS, **0126** ist Multi-Presence.

**Die freie Nummer steht nicht hier, sondern in `docs/architecture/`.** Diese
Datei hat sie bis 2026-08-16 als "0136" gefuehrt, waehrend dort schon 0152
lag - sechzehn ADRs lang zeigte ausgerechnet der Satz, der stille Kollisionen
verhindern sollte, auf die falsche Zahl. Eine von Hand gepflegte Zweitliste
neben einem Verzeichnis, das die Wahrheit ohnehin traegt, geht auseinander;
die Frage ist nur, wann es jemand merkt.

Die naechste freie Nummer ist deshalb die hoechste im Verzeichnis plus eins:

```
ls docs/architecture/ | grep -oE '^0[0-9]{3}' | sort -n | tail -1
```

Am 2026-08-16 sind das 0001 bis 0152 luecklos, naechste frei also **0153**.
Beansprucht wird eine Nummer, indem die Datei angelegt wird - nicht, indem sie
hier eingetragen wird.

## Security-Initiative: Backlog abgearbeitet

Der offene Backlog der Initiative ist vollstaendig ueberfuehrt: ADRs
0118-0123 sind entschieden, die Appliance-Plattform-Anforderungen sind
als Gates IM1-IM3 in ADR 0027 gehoben, und der Mechanik-Rest
(HTTP-Security-Header samt Umzug der Dashboard-Styles nach
`apps/web/styles.css`) ist implementiert. Offene Arbeit sind jetzt
Implementierungs-Gates in den ADRs selbst (W, X, O, Q, N, J, Y, Z,
IM), nicht mehr unentschiedene Vorhaben; Einstieg und Reihenfolge
stehen in `.agent-context.md`.
