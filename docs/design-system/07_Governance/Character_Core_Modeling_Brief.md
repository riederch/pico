# Auftrag: PICO Character Core als 3D-Modell

**Stand:** 2026-08-02
**Architektur:** ADR 0124
**Abnahmegrundlage:** `Character_Geometry_Measurements.md`
**Verbindliche Designautorität:** `Character_Standard_v3.2.1.md`

## Was beauftragt wird

Ein 3D-Modell des PICO Character Core plus ein Satz gerenderter Ansichten
daraus. Das Modell wird **nicht aus den Referenzen rekonstruiert** — das ist
nachweislich nicht möglich, weil eine einzelne Ansicht die Tiefe nicht
bestimmt. Es wird **an ihnen geprüft**. Damit ist das Modell selbst eine
Character-Entscheidung und braucht eine Freigabe, keine bloße Abnahme.

## Zwei Stufen mit einer Abnahme dazwischen

1. **Das Mesh.** Die eigentliche Arbeit.
2. **Die Rendersätze.** Nach Freigabe des Meshes; danach Stunden, nicht Tage.

Die Rendersätze werden erst erzeugt, wenn das Mesh freigegeben ist. Sonst
entstehen sechs Sätze eines Modells, das nachgebessert werden muss, und sie
sind anschließend alle ungültig.

## Stufe 1: das Mesh

### Umfang

Der Character Core nach ADR 0124: Silhouette, Proportionen, Kopf, Visierfläche,
Torso, Arme und Hände, Seitenmodule, Brustkern als Bauteil, Schwebeform,
Antenne. Dazu ein benannter Montagepunkt am Kopf für ein späteres, prozedural
erzeugtes Kopfmodul.

**Nicht** Bestandteil: Haare, Kleidung, Kontextzubehör, das Hologramm-Panel aus
der Referenz, Gesichtszüge. Augen und Mundlinie werden **nicht modelliert** —
sie sind eine Zeichnung, die zur Laufzeit auf das Visier gelegt wird.

### Materialzonen

Das Modell trennt fünf Zonen sauber, weil sie zur Laufzeit einzeln eingefärbt
werden:

1. **Schale** — helle Keramikflächen
2. **Gesichtsdisplay** — die dunkle Visierfläche
3. **Zierteile** — nichtleuchtende Metall- und Rahmenteile
4. **Statusleuchten** — Augenzone, Mundzone, Brustkern, Antennenkugel,
   Unterseiten-Glow, Schwebering
5. **Kopfmodul** — vorerst leer, für das spätere Haarmodul

Die Statuslichtgruppe ist untrennbar: Alle ihre Teile tragen in einer
Darstellung exakt dieselbe Farbe. Das ist Regel aus
`Status_Light_Hotfix_v3.2.1.md` und nicht verhandelbar.

### Formvorgaben

Die Zahlen stehen in `Character_Geometry_Measurements.md`. Die drei, die am
häufigsten falsch gemacht werden:

- **Der Hals existiert.** Engste Stelle 0,52 Kopfbreiten bei y −0,363. Kopf und
  Rumpf sind keine verschmolzene Masse.
- **Der Kopf ist unten breiter.** Breiteste Stelle bei y −0,062, also unterhalb
  der Kopfmitte.
- **Der Rumpf ist oben breit** und läuft nach unten spitz zu, nicht umgekehrt.

Die Seitenmodule sind **Bauteile**, keine Umrissbeiträge. Sie dürfen nicht
kleingerechnet werden, nur weil das die Silhouettendeckung verbessert.

### Tiefe

Die Tiefe ist aus keiner vorhandenen Referenz ableitbar. Sie wird vom
Modellierer gesetzt und wird damit Character. Sie gehört ausdrücklich in die
Freigabeentscheidung.

### Abgabeformat

- **Normativ:** glTF 2.0 binär (`.glb`), mit benannten Materialzonen
- **Autorenquelle:** `.blend` oder gleichwertig, wird nicht gepinnt
- Y oben, Maßstab in Kopfbreiten wie in der Messkonvention, Ursprung Kopfmitte

### Abnahme

Kerndeckung der Silhouette gegen die Referenz, gemessen nach dem Protokoll in
`Character_Geometry_Measurements.md`, aus der Referenzkamera. Die Messung ist
notwendig, nicht hinreichend: Sie fängt verdrehte Proportionen, fehlende Taille
und falschen Maßstab. Über Tiefe, Kanten und Bauteilcharakter entscheidet der
Blick des Eigentümers.

## Stufe 2: die Rendersätze

### Posen

Drei, jede als eigener Rendersatz:

| Pose | Arme | Deckt ab |
|---|---|---|
| **neutral** | entspannt unten, wie die Referenz | idle, listening, thinking, warning, blocked, success, offline |
| **interagierend** | ein Arm auf Brusthöhe nach vorn | working, Werkzeug- und Panelbezug |
| **offen** | beide Arme leicht auswärts | Begrüßung, Onboarding, Leerzustände |

Mehr Posen braucht es nicht: Sieben der acht Avatar-Zustände unterscheiden sich
nur in Statusfarbe und Gesichtszeichnung, und beides entsteht zur Laufzeit.

### Kameras

Zwei, für jede Pose:

- **Referenzblick** — visuell gegen `PICO_Basis_Avatar.png` abgeglichen, bis das
  Rendering sitzt. Kein Rechenwert: Ein numerischer Sweep findet ihn nicht, weil
  Gierwinkel und Formfehler sich gegenseitig kompensieren. Dieser Blick trägt
  die Kontinuität zum bereits ausgelieferten Add-on-Icon.
- **Frontal** — für Icons und kleine Avatare, wo ein Dreiviertelblick bei 32 px
  unruhig wirkt.

Beide Kameras werden **als Zahlen mitgeliefert**: Position, Zielpunkt,
Öffnungswinkel. Ohne sie lässt sich eine später ergänzte Pose nicht mit
identischer Kamera nachrendern.

### Auflösung

**2048 px** Ganzfigurhöhe. Die Figur ist 1,92 Kopfbreiten hoch, der Kopf kommt
damit auf 1067 px — genug für jeden Zuschnitt bis zum 1024-px-App-Icon, ohne
hochzurechnen.

### Was ein Rendersatz enthält

- **Farbe mit Alpha.** Die Figur ist freigestellt. **Kein eingebackener
  Hintergrund** — Hintergründe entstehen zur Laufzeit.
- **Indizierte Zonenkarte** über die fünf Materialzonen, pixelgenau deckungs-
  gleich mit dem Farbbild.
- **Displayprojektion:** Lage und Orientierung des Visiers im Bildkoordinaten-
  system. Ohne sie kann die Laufzeit das Gesicht nicht deckungsgleich über
  Posen und Kameras platzieren.
- **Bauteilebenen** mit je eigenem Alpha und Drehpunkt: Kopf, Rumpf, linker Arm,
  rechter Arm, Antenne. Sie erlauben kleine Bewegung ohne neuen Render.
- **Metadaten:** Hash des Quell-Meshes, Pose, Kameraparameter, Auflösung.

### Umfang

3 Posen × 2 Kameras = **6 Rendersätze**, zusammen etwa 25 bis 30 MB.

## Was ausdrücklich nicht beauftragt ist

- Echtzeit-Rendering im Produkt
- Animationssequenzen
- Haarmodul oder Frisuren
- Kontextzubehör, Helme, Werkzeuge
- Gesichtszüge als Geometrie
- Ein neuer Charakter oder eine Neuinterpretation der Figur

## Was danach im Repository passiert

Mesh und Rendersätze werden als Character-Assets registriert, mit Prüfsumme,
Ableitungsquelle und Zweckbindung. Ein Bake ersetzt bei Neuauflage seinen
Vorgänger; die Registry pinnt den Hash, die Historie trägt die Nachweisbarkeit.

Die Freigabe erteilt der Eigentümer. Produkt- oder UI-Arbeit darf sie nicht
erteilen — das steht so im Character-Standard und gilt hier unverändert.
