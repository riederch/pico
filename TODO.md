# TODO

Offene, noch nicht entschiedene Vorhaben. Architekturentscheidungen gehoeren in
ADRs, Arbeitsstand in `.agent-context.md`, Fortschritt in `progress.md`.

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

## Mehrere gleichzeitige Praesenzen einer PICO-Identitaet

Arbeitsauftrag liegt vor (`PICO_Multi_Presence_ADR_Arbeitsauftrag.md`, Stand
2026-08-02). Ziel ist eine Architektur, in der eine PICO-Identitaet
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

Vor dem Schreiben zu entscheiden:

- **Terminologie gegen ADR 0015.** Dort stehen bereits Full Client, Light
  Client, Relay Server und Core Host als Knotenrollen. Der Auftrag verbietet
  eine parallele, widerspruechliche Begriffswelt. Zu klaeren ist, ob
  "Praesenz" die Knotenrollen ersetzt, verfeinert oder quer dazu steht.
- **Capability-Begriff gegen ADR 0036.** Dort sind Capabilities, Connectors
  und die MCP-Grenze bereits belegt. Die `PresenceCapability` des Auftrags
  (mit `riskClass` und `requiresConfirmation`) muss darauf aufbauen statt
  denselben Namen zweimal zu vergeben. Auch ADR 0010 (Tool-Policy und
  Executor) und ADR 0048 (Model-Capability-Delegation) sind zu pruefen.
- **ADR-Nummer 0126.** 0124 ist an die Character-Architektur vergeben, 0125
  an PAS.
- **Verhaeltnis zu ADR 0113.** Der Companion ist heute eine einzelne
  Desktop-Praesenz. Ob C1/C2 rueckwirkend als Praesenz beschrieben wird oder
  erst kuenftige Blocks, ist eine bewusste Entscheidung.

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

Wegwerf-Prototyp und Messinstrument liegen bislang nur in
`~/Downloads/pico-sdf-prototyp/`, also unversioniert. Der Prototyp darf dort
bleiben, das Messinstrument nicht: Es ist die Abnahmepruefung fuer das extern
modellierte Modell und gehoert nach `tools/`. Ablehnen wuerde der Asset-Gate
nur die gerenderten Bilder, nicht die Skripte.

- `pico-sdf3.mjs`: PICO als Signed Distance Field, CPU-Raymarching, rund 200
  Zeilen ohne Abhaengigkeiten. Weiche Schatten, Verdeckungsverschattung,
  GGX-Glanz, Naeherung fuer Streuung, Umgebungsspiegelung.
- `measure.py`: legt erzeugte und gemessene Silhouette uebereinander, normiert
  auf Kopfbreite und Kopfmitte, kamera- und aufloesungsunabhaengig. Das ist
  Schritt 2 des Character-Freigabeprozesses als Messung.
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
`tools/character-silhouette/`, Einstiegspunkt in `.agent-context.md`.

Offen bleibt nur noch:

- **`character:measure` als Skript in `package.json`.** Nicht ergaenzt, weil
  die Datei derzeit die unfertigen ADR-0113-C3-Aenderungen traegt und ein
  Commit sie mitnehmen wuerde. Nachziehen, sobald C3 abgeschlossen ist.
- **Der C3-Block selbst.** Solange er offen im Baum liegt, ist
  `release:verify` rot, und eine frische Sitzung wuerde fremde Fehler
  diagnostizieren.

### Verhaeltnis zum PAS-Auftrag

`PICO_Parametric_Appearance_System_Coding_Agent_Brief_v1.0.md` (Fassung 1.1)
setzt einen Character Core voraus, den es geometrisch nicht gibt: Die
Kollisionstests in Abschnitt 13.3 pruefen gegen Visier, Seitenmodule und
Schulterraum, also gegen Volumina ohne Repraesentation. PAS parametrisiert
Haar und Materialfarben, nicht PICO. Der Core gehoert deshalb **vor** PAS.

Offen zu entscheiden ist ausserdem, wie sich Appearance zu den Style-Presets
aus ADR 0013 verhaelt (Standard, Technical, Soft, Focus, Night, Work, Home,
Firefighter, Water). Das Design-System kennt nur die Kontextachse mit acht
Kontexten; die Preset-Achse steht nirgends. Ersetzt Appearance sie, oder ist
es eine vierte Achse?

ADR-Nummern sind vergeben: **0124** ist die Architektur (autorierter
Character Core und gestufte Darstellung, angelegt 2026-08-02), **0125** ist
PAS, **0126** ist Multi-Presence.

## Security-Initiative: Backlog abgearbeitet

Der offene Backlog der Initiative ist vollstaendig ueberfuehrt: ADRs
0118-0123 sind entschieden, die Appliance-Plattform-Anforderungen sind
als Gates IM1-IM3 in ADR 0027 gehoben, und der Mechanik-Rest
(HTTP-Security-Header samt Umzug der Dashboard-Styles nach
`apps/web/styles.css`) ist implementiert. Offene Arbeit sind jetzt
Implementierungs-Gates in den ADRs selbst (W, X, O, Q, N, J, Y, Z,
IM), nicht mehr unentschiedene Vorhaben; Einstieg und Reihenfolge
stehen in `.agent-context.md`.
