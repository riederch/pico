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

## Character-Feinschliff nach Low-Quality-Drafts

Die 28 bewusst groben Entwuerfe liegen getrennt vom Character-Core unter
`tools/character-modeling/prototype/pico-character-feature-drafts-v0.blend`.
Ihre Inventur und Quellen stehen in `tools/character-modeling/FEATURE_DRAFTS.md`.
Sie sind `diagnostic_low_quality`, keine Character-Freigabe. Jeder Punkt unten
bleibt offen, bis der jeweilige Entwurf gegen Urdesign, Character-Standard und
die genannten ADR-Regeln im Detail nachgezogen und vom Eigentuemer abgenommen
ist.

### 1. Haarstil 3: breiter transparenter Konzept-Schweif

- [ ] Die Ansatzscheibe liegt tangential und flach auf der lokalen Kopfkrone,
  nicht senkrecht wie eine Finne.
- [ ] Die Ansatzscheibe ist niedrig, oval und sichtbar in die Kopfschale
  eingebettet, ohne schwebenden Spalt.
- [ ] Die Ansatzscheibe verwendet die helle Chassis-Oberflaeche; persoenliche
  Haarfarbe beginnt erst am hinteren Rand der Fassung.
- [ ] Unter der Fassung existiert genau ein dunkler mechanischer Wurzelkragen
  mit genau einem Montagepunkt.
- [ ] Bei aktivem Schweif ist keine Antenne vorhanden.
- [ ] Das Haar ist ein einziges breites geschlossenes Lichtleiterband, keine
  Gruppe natuerlicher Straehnen.
- [ ] Das Band steigt vom Ansatz zuerst rund nach oben und hinten.
- [ ] Der obere Bogen ist kuerzer, voller und staerker gerundet als der bisherige
  lange umgedrehte J-Verlauf.
- [ ] Nach dem Bogen faellt das Band hinter dem Kopf ab, ohne bis unter den Kopf
  zu reichen.
- [ ] Die Spitze schwingt nach aussen und oben und endet abgerundet statt
  abgeschnitten.
- [ ] Die Breite ist am Ansatz und im oberen Bogen gross und verjuengt sich
  kontrolliert zur Spitze.
- [ ] Eine sanfte Drehung zeigt abwechselnd Aussenflaeche, dunklere Innenseite
  und farbige Reflexion, ohne einen zweiten Haarast zu erzeugen.
- [ ] Die persoenliche Huelle bleibt leicht transparent, glaesern und nicht frei
  emissiv.
- [ ] `hue`, `chroma` und `translucency` veraendern die Huelle sichtbar und
  reproduzierbar innerhalb des PAS-Korridors.
- [ ] Der dunkle innere Traeger folgt Ansatz und Haar als eine durchgehende
  Struktur.
- [ ] Die schmale Statuskante bleibt geometrisch und materiell von der
  persoenlichen Haarfarbe getrennt.
- [ ] Die Statuskante verwendet exakt dieselbe aktuelle Statusfarbe wie Augen,
  Mund, Brustkern, Unterseite und Schwebering.
- [ ] Die acht PAS-Segmente lesen sich nur als flache Lichtleiter-Uebergaenge,
  nicht als Perlenkette oder acht getrennte Haarteile.
- [ ] Die seitliche Scheitelfuge bleibt vollstaendig in der gemeinsamen
  Wurzelzone und endet vor dem eigentlichen Band.
- [ ] Ansatz, Haar, Kopf, Visier und Seitenmodul bleiben in allen gueltigen
  Parameterextremen kollisionsfrei.
- [ ] Silhouette, Laenge, Bogen, Drehung und Spitze werden nochmals direkt gegen
  `docs/assets/pico-design-concept.png` abgenommen.

### 2. Haarstil 2: erhoehte Krone

- [ ] Auch Haarstil 2 beginnt auf einer flachen, tangentialen und niedrigen
  Ansatzscheibe.
- [ ] Genau ein gemeinsamer Wurzelkragen verbindet alle sichtbaren Lamellen.
- [ ] Der dunkle innere Traeger bleibt ueber die gesamte Krone zusammenhaengend.
- [ ] Drei bis vier breite Kronenblaetter erzeugen einen technischen Schopf,
  keine Hoerner, Ohren oder natuerlichen Haarstraehnen.
- [ ] Das mittlere Blatt ist am hoechsten; seitliche und hintere Blaetter ordnen
  sich der gemeinsamen Kronensilhouette unter.
- [ ] Alle Blaetter wachsen entlang des Kronenbogens und faechern nicht flach
  seitlich wie Pflanzenblaetter aus.
- [ ] `lift` bestimmt sichtbar die Hoehe, ohne den sicheren Kopfraum zu verlassen.
- [ ] `crownBias` verschiebt das Formgewicht sichtbar zwischen kompakter Krone
  und rueckwaertigem Fluss.
- [ ] `width` und `taper` veraendern Breite und Spitzen, ohne die gemeinsame
  Wurzel aufzubrechen.
- [ ] Eine Scheitelfuge bleibt ein Formdetail derselben Krone und endet vor den
  einzelnen Lamellen.
- [ ] Persoenliche Huelle, mechanischer Traeger und Statusakzent verwenden die
  drei getrennten PAS-Materialgruppen.
- [ ] Haarstil 2 wird aus Referenzblick, frontal, seitlich und von oben gegen
  Urdesign und sichere Montagehuelle abgenommen.

### 3. Uebrige Kopfidentitaeten und PAS-Geometriemerkmale

- [ ] Die Standardantenne bleibt geometrisch unveraendert und gegenseitig
  exklusiv zu jedem prozeduralen Kopfmodul.
- [ ] Der kompakte ungeteilte Schopf besitzt bei `partDepth = 0` keine sichtbare
  oder topologische Trennung.
- [ ] Der Mittelscheitel liegt mittig in einer gemeinsamen Wurzelzone und teilt
  das Modul nicht in zwei Frisuren.
- [ ] Linker und rechter Seitenscheitel reagieren spiegelbildlich auf
  `partOffset`, ohne einen zweiten Hauptpfad zu erzeugen.
- [ ] Der flache Seitensweep bleibt kopfnah, folgt der Krone und zeigt die
  laterale Richtung ohne Antennen- oder Hornsilhouette.
- [ ] Der kurze rueckwaertige Fluss bildet die nachvollziehbare Zwischenform
  zwischen kompakter Krone und langem Schweif.
- [ ] `anchor` verschiebt den gemeinsamen Ansatz nur entlang des sicheren
  Kronenbogens.
- [ ] `side` verschiebt und richtet das Modul lateral aus, ohne die Montagezone
  zu verlassen.
- [ ] `length` veraendert die Gesamtausdehnung kontinuierlich und ohne Sprung
  zwischen den diagnostischen Familien.
- [ ] `sweep` erzeugt den Vorwaerts-/Rueckwaertsverlauf entlang derselben
  Hauptleitkurve.
- [ ] `curl` veraendert nur die Endkruemmung und erzeugt keinen zweiten Ast.
- [ ] `twist` dreht den Parallel-Transport-Frame ohne Rollsprung oder
  Selbstschnitt.
- [ ] Drei Segmente bleiben als breite Lamellen lesbar und zusammenhaengend.
- [ ] Neun Segmente bleiben als breite Lamellen lesbar und unter dem LOD-Budget.
- [ ] Minimale und maximale Breite bleiben erkennbar Pico und kollisionsfrei.
- [ ] Minimale und maximale Verjuengung erzeugen keine Nullflaeche oder stumpfe
  ungeschlossene Endkappe.
- [ ] Starke Asymmetrie bleibt ein Modul an einem Mount und kein zweites
  Seitenaccessoire.
- [ ] `rootSpread` veraendert die gemeinsame Wurzelbreite im gesamten gueltigen
  Bereich sichtbar und sicher.
- [ ] Der Generator nutzt eine Hauptleitkurve mit fester Sampling-Reihenfolge
  und stabiler Frame-Bildung.
- [ ] LOD0, LOD1 und LOD2 bewahren Silhouette, Segmentzahl und Scheitelposition.

### 4. Character Core und Materialzonen

- [ ] Kopf-, Visier- und Torsoverhaeltnis bleiben gegen die verbindliche
  Character-Referenz gemessen.
- [ ] Der Hals bleibt als schmale eigenstaendige Verbindung sichtbar.
- [ ] Der Kopf bleibt unterhalb seiner Mitte am breitesten.
- [ ] Der Torso bleibt oben breit und laeuft nach unten weich spitz zu.
- [ ] Kopf und Torso besitzen keine ungewollten verschmolzenen Uebergaenge.
- [ ] Die Visierflaeche bleibt glatt und frei von modellierten Gesichtszuegen.
- [ ] Arme behalten die organisch-technische Gliederung des Konzepts.
- [ ] Haende und Finger werden gegen Konzept und Bewegungsraum finalisiert.
- [ ] Seitenmodule bleiben erkennbare Bauteile und werden nicht fuer eine bessere
  Umrissmessung verkleinert.
- [ ] Brustkern bleibt ein eigenstaendiges Bauteil mit Statuszone.
- [ ] Unterseiten-Glow und Schwebeform bleiben klar vom Torso getrennt.
- [ ] Der Kopf-Mount besitzt dokumentierte Achsen, sichere Huelle und stabile
  Transformationswerte.
- [ ] Die Tiefe aller Kernbauteile wird als ausdrueckliche Character-Entscheidung
  aus Referenz-, Seiten-, Rueck- und Topansicht abgenommen.
- [ ] Die Ganzfigur misst einschliesslich Leuchtelementen 1,92 Kopfbreiten von
  y `+0,562` bis `-1,363`.
- [ ] Die reine Schalengeometrie misst 1,68 Kopfbreiten von y `+0,562` bis
  `-1,10`.
- [ ] Das Kopfprofil misst bei y `+0,368` die Breite `0,151`.
- [ ] Das Kopfprofil misst bei y `+0,315` die Breite `0,489`.
- [ ] Das Kopfprofil misst bei y `+0,261` die Breite `0,645`.
- [ ] Das Kopfprofil misst bei y `+0,207` die Breite `0,742`.
- [ ] Das Kopfprofil misst bei y `+0,153` die Breite `0,812`.
- [ ] Das Kopfprofil misst bei y `+0,099` die Breite `0,860`.
- [ ] Das Kopfprofil misst bei y `+0,046` die Breite `0,946`.
- [ ] Das Kopfprofil misst bei y `-0,008` die Breite `0,978`.
- [ ] Das Kopfprofil erreicht bei y `-0,062` die normierte Maximalbreite
  `1,000`.
- [ ] Das Kopfprofil misst bei y `-0,116` die Breite `0,968`.
- [ ] Das Kopfprofil misst bei y `-0,169` die Breite `0,914`.
- [ ] Das Kopfprofil misst bei y `-0,223` die Breite `0,823`.
- [ ] Das Kopfprofil misst bei y `-0,277` die Breite `0,742`.
- [ ] Das Kopfprofil misst bei y `-0,331` die Breite `0,613`.
- [ ] Das Kopfprofil misst bei y `-0,384` die Breite `0,559`.
- [ ] Der Hals erreicht bei y `-0,363` die gemessene Engstelle `0,516`.
- [ ] Der Rumpfkern misst bei y `-0,358` die Breite `0,527`.
- [ ] Der Rumpfkern misst bei y `-0,401` die Breite `0,608`.
- [ ] Der Rumpfkern misst bei y `-0,444` die Breite `0,683`.
- [ ] Die rumpfnahen Werte zwischen y `-0,487` und `-0,702` werden nur als
  grobe armverfaelschte Schranke verwendet, nicht als Formziel.
- [ ] Der Rumpfkern misst bei y `-0,745` die Breite `0,731`.
- [ ] Der Rumpfkern misst bei y `-0,788` die Breite `0,704`.
- [ ] Der Rumpfkern misst bei y `-0,831` die Breite `0,672`.
- [ ] Der Rumpfkern misst bei y `-0,874` die Breite `0,624`.
- [ ] Der Rumpfkern misst bei y `-0,917` die Breite `0,570`.
- [ ] Der Rumpfkern misst bei y `-0,960` die Breite `0,511`.
- [ ] Der Rumpfkern misst bei y `-1,003` die Breite `0,435`.
- [ ] Der Rumpfkern misst bei y `-1,046` die Breite `0,333`.
- [ ] Der Rumpfkern misst bei y `-1,089` die Breite `0,177`.
- [ ] Der linke Arm liegt bei y `-0,438` zwischen x `-0,43` und `-0,38`.
- [ ] Der linke Arm liegt bei y `-0,492` zwischen x `-0,51` und `-0,44`.
- [ ] Der linke Arm liegt bei y `-0,546` zwischen x `-0,56` und `-0,46`.
- [ ] Der linke Arm liegt bei y `-0,653` zwischen x `-0,65` und `-0,47`.
- [ ] Der linke Arm liegt bei y `-0,761` zwischen x `-0,69` und `-0,62`.
- [ ] Der linke Arm liegt bei y `-0,868` zwischen x `-0,71` und `-0,67`.
- [ ] Die Armdicke verjuengt sich von etwa `0,07` an der Schulter auf `0,04`
  an der Hand.
- [ ] Die rechte Koerperhaelfte wird nicht blind aus dem verdeckten
  Dreiviertelblick gespiegelt, sondern als Character-Entscheidung abgenommen.
- [ ] Die Antennenkugel endet bei y `+0,562` und bleibt unter `0,10` breit.
- [ ] Das Visier liegt zwischen x `-0,366` und `+0,323` sowie y `+0,218` und
  `-0,288` und misst damit `0,689 × 0,506`.
- [ ] Das linke Auge liegt bei x `-0,274` und misst `0,118 × 0,177`.
- [ ] Das rechte Auge liegt bei x `+0,059` und misst `0,118 × 0,177`.
- [ ] Der Brustkern liegt bei `(0; -0,669)` und besitzt den Radius `0,151`.
- [ ] Der Schwebering liegt mittig bei y `-1,245` und misst `0,731` in der
  Breite.
- [ ] Die Referenzkamera bleibt ein visuell abgeglichener Dreiviertelblick nach
  rechts aus Betrachtersicht und wird nicht aus der Silhouette errechnet.
- [ ] Hologramm-Panel, Titelzeile, Leuchteffekte und Arme werden bei den jeweils
  dafuer definierten Kernmessungen ausgeschlossen.
- [ ] Schale, Gesichtsdisplay, Zierteile, Statusleuchten und Kopfmodul bleiben
  als fuenf getrennte Materialzonen exportierbar.
- [ ] Die Schale bleibt hell, glaenzend und keramisch innerhalb des
  Appearance-Korridors.
- [ ] Das Gesichtsdisplay bleibt dunkel und reflektierend innerhalb seines
  Appearance-Korridors.
- [ ] Trim bleibt metallisch, dunkel und nicht emissiv.
- [ ] `shell.hue` bildet den gesamten Farbwinkel nur innerhalb des hellen
  Keramikkorridors ab.
- [ ] `shell.chroma` reicht reproduzierbar von neutral bis zur erlaubten
  subtilen Farbstaerke, niemals bis zur Vollsaettigung.
- [ ] `shell.lightness` bleibt ueber den gesamten Wertebereich zwischen den
  festgelegten hellen OKLCH-Endpunkten.
- [ ] `shell.gloss` bildet den festgelegten Glanzkorridor ab, ohne den
  keramisch-technischen Charakter zu verlieren.
- [ ] `face.hue` beeinflusst nur den dunklen Display-Unterton und wird nie als
  Hautfarbe interpretiert.
- [ ] `face.tint` bleibt innerhalb des engen dunklen Display-Korridors.
- [ ] `face.blackLevel` haelt das Display an beiden Endpunkten eindeutig dunkel.
- [ ] `face.reflectivity` veraendert nur den kontrollierten Reflexionsanteil und
  macht die Flaeche weder matt tot noch spiegelnd unlesbar.
- [ ] `trim.hue` faerbt nur die nichtleuchtenden Zier- und Metallteile.
- [ ] `trim.chroma` bleibt innerhalb des begrenzten Trim-Korridors.
- [ ] `trim.metalness` bildet den festgelegten Metallbereich ab und erzeugt
  keine Emission.
- [ ] Gamut-Mapping und Rundung sind deterministisch und veraendern die
  Profilsemantik nicht zwischen Renderern.
- [ ] Das normative `.glb` verwendet Y als Hochachse, Kopfbreiten als Massstab
  und die Kopfmitte als Ursprung.
- [ ] Alle fuenf Materialzonen besitzen stabile, benannte Exportzuordnungen.

### 5. Status, Gesicht und Laufzeitzustaende

- [ ] Augen bleiben pupillenlose gezeichnete Leuchtformen auf dem Visier.
- [ ] Die Mundlinie bleibt eine gezeichnete Leuchtform auf dem Visier.
- [ ] `idle` besitzt eine ruhige neutrale Gesichtszeichnung.
- [ ] `listening` ist ohne reine Farbcodierung als zuhoerend erkennbar.
- [ ] `thinking` ist ohne reine Farbcodierung als analysierend erkennbar.
- [ ] `speaking` besitzt eine klar lesbare, ruhige Mundbewegungsbasis.
- [ ] `waiting for confirmation` macht die offene Entscheidung sichtbar.
- [ ] `executing` beziehungsweise `working` zeigt Aktivitaet ohne Autoritaet zu
  behaupten.
- [ ] `warning` bleibt von offener Bestaetigung, Blockierung und Fehler
  unterscheidbar.
- [ ] `blocked by policy` zeigt den Stopp deutlich und freundlich unverfaelscht.
- [ ] `error` bleibt von `blocked by policy` unterscheidbar.
- [ ] `success` ist durch Farbe plus Form/Symbol lesbar.
- [ ] `offline/degraded` bleibt auch ohne Animation erkennbar.
- [ ] Augen, Mund, Brustkern, Kopfakzent, Unterseiten-Glow und Schwebering tragen
  in jeder Darstellung exakt dieselbe Statusfarbe.
- [ ] Status ist immer Farbe plus Form/Symbol plus Text und nie Farbe allein.
- [ ] Kontextfarben koennen kein Element der Statuslichtgruppe umfaerben.
- [ ] Vor einer riskanten Ausfuehrung macht die Darstellung die Risikoklasse
  sichtbar, ohne eine erteilte Freigabe vorzutäuschen.
- [ ] Die Avatar-Darstellung zeigt Absicht, Stimmung, Zustand und Fortschritt,
  entscheidet aber keine Berechtigung und fuehrt keine Aktion selbst aus.

### 6. Posen, Bewegung und Darstellungstiers

- [ ] Die neutrale Pose deckt die sieben status-/gesichtsgetriebenen Zustaende
  ohne neuen Bake ab.
- [ ] Die interagierende Pose fuehrt einen Arm sauber auf Brusthoehe nach vorn.
- [ ] Die offene Pose fuehrt beide Arme leicht nach aussen, ohne die Silhouette zu
  brechen.
- [ ] Referenz- und Frontkamera werden als feste Zahlen mitgeliefert.
- [ ] Referenz- und Frontkamera werden fuer jede der drei Posen verwendet, also
  genau sechs Rendersaetze erzeugt.
- [ ] Jeder Ganzfigur-Rendersatz besitzt exakt 2048 Pixel Figurenhoehe.
- [ ] Jede Pose besitzt Farbe mit Alpha, fuenfzonige Karte,
  Displayprojektion, Bauteilebenen und Metadaten.
- [ ] Kopf, Rumpf, linker Arm, rechter Arm und Antenne besitzen fuer Composite
  korrekte Alphaebenen und Drehpunkte.
- [ ] Der freigestellte Farbrender enthaelt keinen eingebackenen Hintergrund.
- [ ] Die fuenfzonige Karte ist pixelgenau deckungsgleich zum Farbrender.
- [ ] Die Displayprojektion nennt Lage und Orientierung des Visiers im
  Bildkoordinatensystem.
- [ ] Die Metadaten nennen Quell-Mesh-Hash, Pose, Kamera und Aufloesung.
- [ ] Die sechs Rendersaetze bleiben zusammen im vorgesehenen Umfang von etwa
  25 bis 30 MB.
- [ ] Static, Composite und Realtime stammen nachweislich aus demselben Mesh.
- [ ] Kleine Flaechen verwenden freigegebene Zuschnitte statt neuer vereinfachter
  Geometrie.
- [ ] Die minimale Schwebewegung bleibt ruhig und langsam.
- [ ] Blinzeln bleibt sanft und nicht hektisch.
- [ ] Statusuebergaenge werden weich ueberblendet.
- [ ] Reduced Motion entfernt Schweben, permanentes Pulsieren und Parallax
  vollstaendig, ohne Zustandsinformation zu verlieren.
- [ ] Sekundaerbewegung von Haar, Antenne und Modulen darf die gespeicherte
  Appearance nicht veraendern.
- [ ] Schatten, Post-Processing, Simulationsrate, Aufloesung, FPS und Effekte
  duerfen sinken, ohne Familie, Grundfarben, Proportionen oder Mounts zu
  veraendern.

### 7. Kontextzubehoer

- [ ] Technik erhaelt ein Panel-/Diagnostikmotiv ausserhalb des Character Core.
- [ ] Wasser und Infrastruktur erhaelt ein Tropfen-, Leitungs- oder Flussmotiv.
- [ ] Feuerwehr erhaelt ein Helmmotiv; Rot bleibt ausschliesslich Kontextakzent.
- [ ] Organisation erhaelt ein Dokument-, Aufgaben- oder Dashboardmotiv.
- [ ] Smart Home erhaelt ein Haus-, Raum-, Geraete- oder Sensormotiv.
- [ ] Kommunikation erhaelt ein Funk-, Audio- oder Nachrichtenmotiv.
- [ ] Energie erhaelt ein Leistungs-, Verbrauchs- oder Batteriemotiv; Amber
  bleibt ausschliesslich Kontextakzent.
- [ ] Nacht / Fokus reduziert Helligkeit und Ablenkung, ohne eine neue
  Appearance-Identitaet zu erzeugen.
- [ ] Jedes Kontextobjekt bleibt bei kleinen Avataren ausserhalb der Figur.
- [ ] Kein Kontextobjekt ersetzt Kopfidentitaet, Visier, Brustkern, Rig oder
  Statuslichtgruppe.

### 8. Origin-Marker und Kleidung

- [ ] `origin_light` bleibt ein winziger optionaler Glint in Brustkern oder
  Antennenlicht.
- [ ] Der Origin-Glint bleibt dekorativ, subtil und vom Eigentuemer ausblendbar.
- [ ] Der Origin-Glint liest sich nicht als Krone, Rang, Trust- oder
  Administratorzeichen.
- [ ] Ein optionaler First-Spark-Puls bleibt kurz und nur Teil der Idle-Animation.
- [ ] Der Marker erzeugt keine DRM-, Aktivierungs- oder versteckte
  Anti-Fork-Logik.
- [ ] Der Custom-Clothing-Fallback bleibt sichtbar, wenn ein Custom Asset fehlt,
  abgelehnt oder ungueltig ist.
- [ ] Kleidung ersetzt niemals Character Core, Visier, Statuslichtgruppe oder
  Rig.
- [ ] Primaer- und Sekundaerfarbton des Kleidungsfallbacks bleiben semantisch
  stabil und getrennt von Status.

### 9. Freigabe und Nachweis

- [ ] Der normative Character Core wird als hash-gepinnter GLB-Character-Asset
  registriert; die `.blend` bleibt Autorenquelle.
- [ ] Jeder spaetere Generator wird mit Version, Parameterdomain und Golden-
  Geometrie registriert, nicht durch Einzelbildfreigaben ersetzt.
- [ ] Kein Draft verlaesst `diagnostic`, bevor Character Design v3.3.0 oder eine
  spaetere ausdrueckliche Character-Entscheidung ihn annimmt.
- [ ] Silhouette, Proportionen, Materialitaet und Identitaetsmodule bestehen die
  Character-QA und die dokumentierte Messung.
- [ ] Ein Bake bleibt ersetzbarer Cache und wird nie Quelle fuer eine weitere
  Ableitung, die das Mesh bedienen kann.
- [ ] Jede niedrigere Darstellungsstufe nennt Quell-Mesh, Pose, Kamera, Groesse
  und Ableitung und kann nicht zu einer zweiten Character-Autoritaet werden.
