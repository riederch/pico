# TODO

Offene, noch nicht entschiedene Vorhaben. Architekturentscheidungen gehoeren in
ADRs, Arbeitsstand in `.agent-context.md`, Fortschritt in `progress.md`.

## Home-Assistant-App als Pico Home benennen

Die sichtbare Home-Assistant-App heisst derzeit `Pico Core`. Sie soll fuer
Menschen als `Pico Home` auftreten, weil Core die darin laufende Software und
nicht die eigenstaendige Produktrolle bezeichnet.

Der Auftrag umfasst:

- sichtbaren App-Namen und Paneltitel in `pico_core/config.yaml`,
- Home-Assistant-Dokumentation, Installationshinweise und sichtbare Wortmarken,
- alle Checks und Release-Stellen, die den sichtbaren Namen fest voraussetzen.

Interne Bezeichnungen wie das Paket `@pico/core`, der Dienst, das Container-
Image und der bestehende Slug `pico_core` werden nicht allein wegen der
Produktbenennung geaendert. Falls eine solche technische Umbenennung noetig
wird, muss sie als eigener, upgrade-kompatibler Schritt erfolgen. Eine
bestehende Home-Assistant-Installation darf weder als zweite App erscheinen
noch ihre Daten oder Update-Verbindung verlieren.

## Installierbarer und updatefaehiger Alpha-Stand

Fuer Pico soll ein bewusst kleiner, installierbarer Stand entstehen, der auf
jeder bereits sinnvoll abgrenzbaren Plattform sichtbar meldet: Pico laeuft und
welche Version installiert ist. Ziel ist noch kein fertiges Produkt, sondern
ein belastbarer Installations- und Updatepfad, auf dem spaetere Funktionen
aufbauen koennen.

Der erste Umfang ist:

- **Pico Home:** die bestehende Home-Assistant-App verwenden und sichtbar als
  `Pico Home` benennen. Eine echte Home-Assistant-Installation sowie ein
  Update von Version A auf Version B muessen Daten, App-Identitaet und
  Updateverbindung erhalten.
- **Pico Relay:** als eigenstaendigen OCI-Container mit ausfuehrbarem
  Startpfad, dauerhaftem SQLite-Datentraeger und einem fuer den Betrieb
  geeigneten Gesundheitssignal ausliefern. Pico Relay wird keine
  Home-Assistant-App, weil es unabhaengig von einem einzelnen Pico Home
  erreichbar sein muss.
- **Pico Client fuer Linux:** das vorhandene Debian-Paket als gemeinsamen
  Installer fuer Vault, Companion-Hintergrunddienst und Bedienoberflaeche
  weiterverwenden. Nach Installation und automatischem Start muss der Client
  seinen laufenden Zustand und seine Version ohne Terminal anzeigen.
- **Eigenstaendige Pico Surfaces:** erst paketieren, sobald die erste
  Zielplattform wie Smartwatch oder kleines Home-Display festgelegt ist. Ein
  losgeloestes Demo-Paket ohne festgelegte Vault-Verbindung zaehlt nicht als
  belastbarer Produktpfad.

Updates laufen ueber den nativen Plattformweg: Home Assistant fuer Pico Home,
Container-Verwaltung fuer Pico Relay und die Paketverwaltung beziehungsweise
ein spaeterer signierter Desktop-Updater fuer den Linux-Client. Der erste
Meilenstein prueft kontrollierte Updates von Version A auf Version B.
Unbeaufsichtigte automatische Updates bleiben deaktiviert, bis Herkunft und
Integritaet des Artefakts, Gesundheitstest, Datensicherung, Rollback und
Updateaufzeichnung durchgaengig abgesichert sind.

Nicht Teil dieses Alpha-Meilensteins sind ein oeffentlicher Relay-Betrieb,
oeffentliche Kompatibilitaetsversprechen, neue Produktfunktionen oder getrennte
Installer fuer Vault und die Desktop-Oberflaeche.

## Companion-Ressourcenbedarf ohne Electron messen

Ziel ist ausschliesslich weniger RAM- und CPU-Verbrauch; eine native
Produktform ist kein Selbstzweck. Die Linux-Tray-Messung vom 2026-08-14 liegt
bei 222.669.824 Byte PSS und 95.821.824 Byte `Private_Dirty +
Private_Hugetlb` ueber sieben Electron-Prozesse. Davon entfallen 110.164.992
Byte PSS auf GPU-, Utility- und weitere Chromium-Prozesse; wie viel des
112.504.832-Byte-Browserprozesses der Pico-/Node-Kern allein benoetigt, ist
nicht getrennt gemessen. Fuer CPU gibt es noch keine belastbare
Leerlaufmessung.

Vor einer Portierungsentscheidung einen reproduzierbaren Headless-Benchmark
ausfuehren: denselben Companion-Core und Vault-Pfad ohne Electron starten und
PSS, privaten Speicher, Leerlauf-CPU sowie Wakeups gegen den paketierten
Tray-Betrieb vergleichen. Zuerst ausserdem den statischen Importumfang auf
weitere unnoetig frueh geladene Module pruefen.

Nur wenn diese Messung eine fuer das Produkt relevante Einsparung zeigt, eine
native oder leichtere Shell bewerten. Der bewaehrte TypeScript-Vertrauenspfad
bleibt dabei zunaechst erhalten. Eine vollstaendige Neuimplementierung von
Vault, kanonischen Formen, Zeremonien oder Kryptographie ist nicht Teil dieses
TODOs und braeuchte eine eigene Architekturentscheidung.

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

Offen sind jetzt Implementierungs-Gates in der ADR, keine Vorfragen mehr:
P2 Registry, P3 die Zustandsgrenze samt Umzug des Beobachtungspuffers,
P4 blockiert am fehlenden Action Runner, P5 Statusnotiz, P6 Abschaltbarkeit.

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

ADR-Nummern sind vergeben: **0124** ist die Architektur (autorierter
Character Core und gestufte Darstellung, angelegt 2026-08-02), **0125** ist
PAS, **0126** ist Multi-Presence. Weiter vergeben: **0130** Desktop-
Bedienflaeche, **0131** Android als Vollclient, **0132** Recovery-Card-
Generator, **0133** Ableitungsgrundsatz, **0134** Formatrevision vor dem
Freeze, **0135** Design-System-Lesbarkeit. Naechste freie Nummer: **0136** -
vor dem Schreiben hier beanspruchen, sonst kollidieren zwei parallele
Sitzungen still.

## Security-Initiative: Backlog abgearbeitet

Der offene Backlog der Initiative ist vollstaendig ueberfuehrt: ADRs
0118-0123 sind entschieden, die Appliance-Plattform-Anforderungen sind
als Gates IM1-IM3 in ADR 0027 gehoben, und der Mechanik-Rest
(HTTP-Security-Header samt Umzug der Dashboard-Styles nach
`apps/web/styles.css`) ist implementiert. Offene Arbeit sind jetzt
Implementierungs-Gates in den ADRs selbst (W, X, O, Q, N, J, Y, Z,
IM), nicht mehr unentschiedene Vorhaben; Einstieg und Reihenfolge
stehen in `.agent-context.md`.
