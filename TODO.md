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

Beansprucht wird eine Nummer, indem die Datei angelegt wird - nicht, indem sie
hier eingetragen wird.

**Hier steht deshalb keine Zahl mehr.** Die vorige lautete "0001 bis 0152
luecklos, naechste frei also 0153", war am Tag ihrer Korrektur richtig und
vierundzwanzig Stunden spaeter falsch, weil 0153 und 0154 entstanden. Der
Absatz darueber erklaert genau das an einem Beispiel ueber sechzehn ADRs -
und schrieb im naechsten Satz die naechste Zahl hin, die verrotten sollte.
Der Befehl oben beantwortet die Frage in dem Moment, in dem sie gestellt
wird; eine Zahl in Prosa beantwortet sie fuer den Tag, an dem sie getippt
wurde.
