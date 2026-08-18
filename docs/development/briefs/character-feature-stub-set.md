# Arbeitsauftrag: vollständiger Character-Feature-Stub-Satz

**Stand:** 2026-08-18

**Status:** bereit zur Umsetzung

**Empfohlenes Modell:** Codex `gpt-5.6-sol + xhigh`

**Ziel:** Für jede der 28 inventarisierten visuellen Merkmalsgruppen existiert
ein einzeln sichtbarer, bewusst einfacher und maschinell prüfbarer Stub.

## 1. Ergebnis dieses Arbeitspakets

Am Ende gibt es genau einen zusammenhängenden Diagnose-Milestone:

- eine reproduzierbar erzeugte Blender-Datei mit exakt 28 Feature-Stubs;
- einen gemeinsamen, nur einmal eingebundenen Character Core als geometrische
  Grundlage;
- für jede Merkmalsgruppe eine separat ein- und ausblendbare Collection;
- eine Einzelvorschau je Stub sowie drei Übersichtstafeln;
- einen maschinenlesbaren Manifestvertrag und einen Blender-Validator;
- keine Detailausarbeitung und keine Character- oder Production-Freigabe.

Der Auftrag wird als Ganzes fertiggestellt. Nicht nach Kopfmodulen, Core,
Zuständen oder Kontexten einzeln committen. Der gewünschte Zwischenstand ist:
**Jede bekannte Gruppe ist einmal als Stub vorhanden; Feinschliff kann danach
gruppeweise erfolgen.**

## 2. Ausgangslage

Die Inventur in
`tools/character-modeling/FEATURE_DRAFTS.md` umfasst 28 Gruppen. Die Datei
`prototype/pico-character-feature-drafts-v0.blend` zeigt bereits primitive
Skizzen auf drei Tafeln. Diese Skizzen beweisen Inventar und grobe Lesbarkeit,
sind aber noch kein Stub-Vertrag:

- die Mini-Picos sind eigenständige Tafelfiguren statt Ableitungen aus dem
  gemeinsamen Character Core;
- eine Gruppe ist noch nicht als stabile, einzeln adressierbare Einheit für
  spätere Verfeinerung definiert;
- Geometrie, Materialzustand, Pose, Darstellung und Bewegung werden noch nicht
  als verschiedene Stub-Arten unterschieden;
- es gibt noch kein maschinenlesbares Manifest, aus dem Generator und
  Validator dieselbe Reihenfolge beziehen;
- die Tafeln besitzen keine isolierte Vorschau pro Gruppe.

Die vorhandene Draft-Datei bleibt als Wegskizze erhalten. Sie wird nicht zum
Stub-Satz umbenannt und nicht zur Quelle weiterer Character-Geometrie erklärt.

## 3. Verbindliche Quellen und Rangfolge

Bei Widerspruch gilt:

1. `docs/design-system/07_Governance/Character_Standard_v3.2.1.md` samt
   `Status_Light_Hotfix_v3.2.1.md`;
2. die registrierten Originalreferenzen, insbesondere
   `docs/assets/pico-design-concept.png` und
   `PICO_Designboard_Original.png`;
3. ADR 0009, 0013, 0124, 0125, 0133 und 0135;
4. `Character_Core_Modeling_Brief.md`,
   `Character_Geometry_Measurements.md`, `Context_Modules.md` und der
   PAS-Auftrag;
5. `tools/character-modeling/FEATURE_DRAFTS.md` für die vollständige
   Gruppenreihenfolge;
6. `TODO.md` für den späteren Feinschliff.

Die vorhandene Datei `pico-character-core-v0.blend` und ihre Kopfrezepte sind
diagnostische Autorenarbeit, keine freigegebene Character-Autorität. Der neue
Stub-Satz darf von ihr ableiten, erbt aber ausdrücklich ihren unfreigegebenen
Status.

## 4. Was hier „Stub“ bedeutet

Ein Stub ist die billigste sicht- und prüfbare Darstellung der späteren
Funktion. Er beweist Existenz, Zuordnung und harte Grenzen, nicht Qualität.

### 4.1 Erlaubte Stub-Arten

| Art | Verwendung | Mindestinhalt |
|---|---|---|
| `geometry` | Kopfmodule, Zubehör, Kleidung | einfache geschlossene Primitive oder grobe Kurvenform |
| `core_reference` | Character Core | eine Instanz der gemeinsam eingebundenen Core-Collection |
| `material_state` | Materialzonen und Status | gemeinsame Figur oder Swatches plus eindeutig zugeordnete Materialien |
| `display_state` | Augen, Mund und Avatarzustände | Laufzeitzeichnung vor dem Visier, keine modellierten Gesichtszüge |
| `pose` | neutral, interagierend, offen | grobe Transformationspose der vorhandenen Bauteile |
| `presentation` | Static, Composite, Realtime | drei Ableitungen derselben Quellfigur, keine neue Geometrie |
| `motion` | Schweben, Puls, Reduced Motion | kurze Diagnoseaktion plus vollständig statische Alternative |

Damit erhält jede Merkmalsgruppe einen Stub, ohne abstrakte Laufzeitmerkmale
fälschlich in ein eigenes Mesh umzudeuten.

### 4.2 Qualitätsgrenze

Ein Stub muss:

- bei 512 px verständlich sein;
- die richtige Gruppe und ihre wichtigste harte Grenze zeigen;
- benannt, einzeln sichtbar und deterministisch neu erzeugbar sein;
- grobe Kollisionen mit Kopf, Visier und Character Core vermeiden;
- ausschließlich Diagnosematerialien und einfache Geometrie verwenden.

Ein Stub muss noch nicht:

- die Feinschliffpunkte aus `TODO.md` erfüllen;
- exakte Silhouette, Materialkalibrierung, UVs oder Texturen besitzen;
- final geriggt, optimiert, retopologisiert oder animiert sein;
- alle PAS-Parameter kontinuierlich interpolieren;
- eine Production-Asset-, Character-v3.3.0- oder Kompatibilitätsfreigabe
  erhalten.

## 5. Zielartefakte

Folgende Dateien werden im selben Milestone angelegt oder aktualisiert:

```text
tools/character-modeling/feature-stub-manifest-v0.json
tools/character-modeling/create_pico_feature_stubs.py
tools/character-modeling/validate_feature_stubs.py
tools/character-modeling/prototype/pico-character-feature-stubs-v0.blend
tools/character-modeling/README.md
tools/character-modeling/FEATURE_DRAFTS.md
.agent-context.md
```

Generierte Vorschauen bleiben außerhalb des Repositorys:

```text
/tmp/pico-character-feature-stubs/individual/01-hair-style-3-concept-tail.png
...
/tmp/pico-character-feature-stubs/individual/28-custom-clothing-fallback.png
/tmp/pico-character-feature-stubs/pico-feature-stubs-01-head.png
/tmp/pico-character-feature-stubs/pico-feature-stubs-02-runtime.png
/tmp/pico-character-feature-stubs/pico-feature-stubs-03-context.png
```

Keine GLBs werden in diesem Milestone exportiert. Nicht jede Gruppe ist
Geometrie, und ein Satz scheinbar fertiger GLBs würde eine Produktintegration
behaupten, die nicht existiert.

## 6. Gemeinsamer Blender-Vertrag

### 6.1 Eine geometrische Quelle

`pico-character-feature-stubs-v0.blend` bindet die Collection
`PICO_CHARACTER_CORE` aus `pico-character-core-v0.blend` genau einmal über
einen relativen Blender-Library-Pfad ein. Die 28 Gruppen verwenden
Collection-Instanzen davon. Sie kopieren Kopf, Visier, Torso oder Arme nicht
als 28 lokale Figuren.

Am Root werden gespeichert:

```text
pico_status = diagnostic_stub
pico_character_approved = false
pico_stub_schema = pico.character.feature-stubs.v0
pico_stub_count = 28
pico_source_core_collection = PICO_CHARACTER_CORE
pico_source_core_sha256 = <SHA-256 der eingebundenen Blend-Datei>
pico_source_manifest_sha256 = <SHA-256 des Manifestes>
```

Die Hashes sind Nachweise des Eingangs, keine Production-Registrierung.

### 6.2 Collection-Schema

Die Root-Collection heißt `PICO_CHARACTER_FEATURE_STUBS`. Darunter liegen
genau drei Seiten und genau 28 Stub-Collections:

```text
STUB_PAGE_01_HEAD_IDENTITY
STUB_PAGE_02_CHARACTER_RUNTIME
STUB_PAGE_03_CONTEXT_PRESENTATION

STUB_01_hair_style_3_concept_tail
...
STUB_28_custom_clothing_fallback
```

Jede Stub-Collection besitzt:

```text
pico_stub_order = 1..28
pico_stub_slug = <Manifestwert>
pico_stub_kind = geometry|core_reference|material_state|display_state|pose|presentation|motion
pico_status = diagnostic_stub
pico_character_approved = false
pico_stub_complete = true
pico_refinement_source = TODO.md#character-feinschliff-nach-low-quality-drafts
```

`pico_stub_complete` bedeutet nur, dass der vereinbarte einfache Stub
vollständig ist. Es schließt keinen Feinschliffpunkt.

### 6.3 Manifest als einzige Inventarquelle

`feature-stub-manifest-v0.json` enthält Schema, Status und die 28 Datensätze in
Reihenfolge. Jeder Datensatz nennt:

- `order`, `slug`, `page` und `kind`;
- einen kurzen nichttechnischen Zweck;
- die minimale sichtbare Aussage;
- erforderliche Rollen und Untervarianten;
- den passenden Abschnitt in `TODO.md`;
- die maßgeblichen ADR-/Governance-Quellen.

Generator und Validator lesen dieses Manifest. Keine zweite Python-Liste mit
28 Slugs anlegen. Der Validator prüft zusätzlich, dass
`FEATURE_DRAFTS.md` dieselben Slugs in derselben Reihenfolge dokumentiert.

## 7. Die 28 verpflichtenden Stubs

Die Reihenfolge ist Teil des Vertrags. Stil 3 bleibt zuerst, Stil 2 bleibt
zweiter; der übrige Satz folgt der bestehenden Inventur.

### 7.1 Kopfidentität und PAS-Geometrie

| # | Slug / Art | Einfacher Stub und harte Mindestgrenze |
|---:|---|---|
| 1 | `hair_style_3_concept_tail` / `geometry` | Flache helle Ansatzscheibe, genau ein dunkler Träger, ein breites transparentes Band und eine getrennte Statuskante. Das Band steigt bogenförmig, fällt kurz ab und endet nach außen/oben. Keine Antenne und keine Strähnengruppe. |
| 2 | `hair_style_2_raised_crown` / `geometry` | Flache gemeinsame Ansatzscheibe, ein Träger und drei grobe breite Kronenlamellen. Mittlere Lamelle am höchsten; keine Hörner, Ohren oder Antenne. |
| 3 | `standard_antenna` / `geometry` | Unveränderte diagnostische Standardantenne als einzige sichtbare Kopfidentität. Kein Haarmodul. |
| 4 | `hair_compact_unparted` / `geometry` | Ein niedriger kompakter Schopf auf einer gemeinsamen Wurzel, ohne sichtbare Fuge. |
| 5 | `hair_centre_part` / `geometry` | Derselbe kompakte Schopf mit einer kurzen mittigen Fuge ausschließlich in der Wurzelzone. |
| 6 | `hair_side_part` / `geometry` | Zwei beschriftete Untervarianten `left` und `right`; gespiegelt versetzte Fuge, weiterhin je genau ein Modul. |
| 7 | `hair_flat_side_sweep` / `geometry` | Ein breites, kopfnahes Band, das seitlich entlang der Krone fließt und weder Horn noch Antenne liest. |
| 8 | `hair_short_rear_flow` / `geometry` | Ein kurzes rückwärts gerichtetes Band zwischen kompakter Krone und langem Schweif. |
| 9 | `hair_segment_corridor` / `geometry` | Zwei Untervarianten mit exakt drei beziehungsweise neun breiten Segmentmarken auf je einem zusammenhängenden Träger. Keine Perlenkette. |
| 10 | `hair_width_taper_corridor` / `geometry` | Zwei Untervarianten für schmal und breit; beide verjüngen sich sichtbar und besitzen eine geschlossene, abgerundete Spitze. |
| 11 | `hair_twist_curl_asymmetry` / `geometry` | Drei beschriftete Untervarianten für Twist, Endkrümmung und seitlichen Versatz; jede bleibt eine einzige Leitkurve. |

Für jeden Haarstub gelten zusätzlich drei einfache Materialrollen:
`mechanical_root_or_spine`, `personal_translucent_shell` und
`status_emitter`. Persönliche Farbe und Statusmaterial dürfen nie dieselbe
Materialinstanz sein.

### 7.2 Character, Zustand und Darstellung

| # | Slug / Art | Einfacher Stub und harte Mindestgrenze |
|---:|---|---|
| 12 | `character_core` / `core_reference` | Eine Instanz des gemeinsam eingebundenen `PICO_CHARACTER_CORE`; Kopf, Visier, Hals, Torso, Arme, Hände, Seitenmodule, Brustkern, Schwebeform und Antenne sind sichtbar. Keine lokale Neumodellierung. |
| 13 | `material_zones` / `material_state` | Dieselbe Core-Instanz plus fünf beschriftete Materialswatches: Schale, Display, Trim, Status und Kopfmodul. Zusätzliche Endpunkt-Swatches zeigen Shell hell, Face dunkel und Trim nicht emissiv. |
| 14 | `status_light_group` / `material_state` | Augen, Mundlinie, Brustkern, Antennenkugel oder Kopfakzent, Unterseiten-Glow und Schwebering sind sichtbar und referenzieren exakt ein gemeinsames Statusmaterial. |
| 15 | `face_and_avatar_states` / `display_state` | Elf beschriftete Visierzeichnungen: `idle`, `listening`, `thinking`, `speaking`, `waiting`, `executing`, `warning`, `blocked`, `error`, `success`, `offline`. Nur Augen- und Mundzeichnung ändern sich; das Core-Mesh bleibt gleich. |
| 16 | `pose_set` / `pose` | Drei grobe Ganzkörperposen: neutral, ein Arm interagierend auf Brusthöhe, beide Arme offen. Jede benennt Armstellung und Quelle. |
| 17 | `origin_light` / `material_state` | `off` und `on` als zwei Zustände derselben Figur; `on` zeigt nur einen winzigen Brust- oder Antennenglanz. Kein Badge, keine Krone. |
| 18 | `presentation_tiers` / `presentation` | Static, Composite und Realtime zeigen dieselbe Quell-Core-ID. Static ist ein Render, Composite eine grobe Ebenenzerlegung, Realtime die Core-Instanz. |
| 19 | `motion_and_reduced_motion` / `motion` | Eine kurze Diagnoseaktion für ruhiges Schweben, Blinzeln und Statusüberblendung sowie eine zweite Variante ohne dauerhafte Keyframes oder Parallax. |

Der Zustandsstub darf Farbe zur Lesbarkeit verwenden, muss aber zusätzlich
Form und Beschriftung zeigen. Er ist keine Aussage, dass ein Runtime-Consumer
oder `avatar.state_changed` bereits implementiert sei.

### 7.3 Kontext und Kleidung

Alle Kontextstubs zeigen links dieselbe Character-Core-Instanz im normalen
cyan-blauen Arbeitsstatus und rechts das einfache Kontextobjekt. Nur das
Kontextobjekt verwendet die Kontextfarbe.

| # | Slug / Art | Einfacher Stub und harte Mindestgrenze |
|---:|---|---|
| 20 | `context_technology` / `geometry` | Grobes Panel mit drei Diagnosepunkten oder ein einfacher Werkzeugarm außerhalb des Core. |
| 21 | `context_water_infrastructure` / `geometry` | Ein Tropfen und ein kurzes Rohr-/Flussstück außerhalb des Core. |
| 22 | `context_fire_department` / `geometry` | Einfacher Helm oder Einsatzpanel in Rot; sämtliche Pico-Statuslichter bleiben cyan-blau. |
| 23 | `context_organization` / `geometry` | Dokument- oder Dashboardtafel mit wenigen Linien außerhalb des Core. |
| 24 | `context_smart_home` / `geometry` | Hausumriss plus ein Geräte-/Sensorpunkt außerhalb des Core. |
| 25 | `context_communication` / `geometry` | Funkmast, Audiowelle oder Nachrichtensymbol außerhalb des Core. |
| 26 | `context_energy` / `geometry` | Batterie-/Leistungssymbol in Amber; sämtliche Pico-Statuslichter bleiben cyan-blau. |
| 27 | `context_night_focus` / `presentation` | Gedimmte Umgebung und reduziertes Kontextobjekt; Core-Materialien, Kopfidentität und Statusbedeutung bleiben unverändert. |
| 28 | `custom_clothing_fallback` / `geometry` | Ein grobes Workwear-Oberteil über dem Torso. Es lässt Kopf, Visier, Statusgruppe, Rig und Core-Geometrie bestehen und besitzt zwei nichtleuchtende Farbzonen. |

## 8. Umsetzungsschritte

### Schritt A: Manifest und gemeinsamer Szenenrahmen

1. Manifest aus der bestehenden 28er-Inventur anlegen.
2. Generator liest ausschließlich dieses Manifest.
3. Neue Blender-Datei mit Root, drei Seiten, Kameras und Licht aufbauen.
4. `PICO_CHARACTER_CORE` relativ verlinken und genau eine gemeinsame
   Instanzquelle anlegen.
5. Quell- und Manifest-Hash als Metadaten speichern.

### Schritt B: Kopfgruppen 1 bis 11

1. Vorhandene Geometrie aus den Drafts und den zwei diagnostischen Kopf-
   rezepten wiederverwenden, aber in den neuen Collection-Vertrag überführen.
2. Fehlende Gruppen 4 bis 11 als niedrig aufgelöste Kurven-/Primitivstubs
   ergänzen.
3. Antennenexklusivität, eine Wurzel und getrennte Materialrollen sichtbar
   halten.
4. Noch keine kontinuierliche PAS-Interpolation oder Golden-Geometrie bauen.

### Schritt C: Character-/Runtime-Gruppen 12 bis 19

1. Core nicht kopieren, sondern instanzieren.
2. Materialzonen als Zuordnungsdemonstrator ergänzen.
3. Vollständige sechsteilige Statusgruppe an ein Material binden.
4. Elf Displayzustände, drei Posen, Origin on/off, drei Tiers und
   Normal-/Reduced-Motion anlegen.
5. Zustände und Tiers nicht als eigenständige Character-Geometrie speichern.

### Schritt D: Kontext-/Kleidungsgruppen 20 bis 28

1. Jedes Zubehör aus wenigen Primitivelementen bauen.
2. Zubehör räumlich außerhalb des Core halten.
3. Feuerwehr-Rot und Energie-Amber ausschließlich am Zubehör verwenden.
4. Nacht/Fokus als Präsentationsstub statt als dunkle neue Pico-Identität
   umsetzen.
5. Kleidung überlagert den Core und ersetzt keinen seiner Bestandteile.

### Schritt E: Vorschauen und gespeicherter Checkpoint

1. Für alle 28 Gruppen dieselbe isolierte 512-px-Kamera verwenden.
2. Pro Gruppe genau ein Einzelbild rendern.
3. Drei Kontaktbögen in der bestehenden 11/8/9-Aufteilung rendern.
4. Blender-Datei erst nach erfolgreichem Validator unter `prototype/`
   ablegen.
5. Vorschauen nur unter `/tmp` behalten.

## 9. Maschinenprüfbare Abnahme

`validate_feature_stubs.py` öffnet den gespeicherten Repository-Checkpoint und
prüft mindestens:

1. Root-Schema, Diagnose-Status und `pico_character_approved = false`;
2. Manifest-Hash, Core-Datei-Hash und relative Library-Quelle;
3. exakt 28 Stub-Collections in Manifestreihenfolge und 11/8/9 Seitenumfang;
4. vollständige Pflichtproperties jeder Stub-Collection;
5. genau eine gemeinsame Core-Library und keine 28 lokalen Core-Kopien;
6. Typ und erforderliche Rollen/Untervarianten aus jedem Manifestdatensatz;
7. bei 1 und 2 eine flache Ansatzplatte, gemeinsamen Träger, persönliche
   Hülle und getrennten Statusakzent;
8. Standardantenne und Haar in den Gruppen 1 bis 11 gegenseitig exklusiv;
9. drei/neun Segmente sowie die verlangten Endpunktvarianten in 6, 9, 10 und
   11;
10. alle sechs Statusbereiche auf exakt demselben Statusmaterial;
11. die elf Zustandsnamen vollständig und ohne Core-Mesh-Variation;
12. drei Posen, drei Tiers und zwei Motion-Modi;
13. identische Core-Quell-ID in Static, Composite und Realtime;
14. Kontext- und Statusmaterial in 20 bis 27 niemals identisch;
15. Clothing-Fallback ersetzt keine geschützte Core-Rolle;
16. 28 Einzelbilder und drei Kontaktbögen mit nichtleeren Dateien;
17. Slugs und Reihenfolge stimmen mit `FEATURE_DRAFTS.md` überein.

Zusätzlich wird ein negativer Prüflauf durchgeführt: Mindestens je eine
gezielt falsche Antennen-/Haar-Kombination, gemischte Statusfarbe, fehlende
Collection und Kontextfärbung der Augen muss den Validator scheitern lassen.
Die Mutationen werden nicht committed; im Handoff wird nur festgehalten, dass
sie gebissen haben.

## 10. Sichtprüfung

Der Umsetzer prüft alle Einzelbilder und Kontaktbögen selbst. Die Sichtprüfung
fragt nur:

- Ist jede Gruppe ohne Collection-Namen grob erkennbar?
- Sind Haarstil 3 und Haarstil 2 klar verschieden?
- Ist die Antenne bei Haarstubs verschwunden?
- Sind Core, Visier und Gesicht in allen Kontexten unverändert erkennbar?
- Bleiben Feuerwehr-Rot und Energie-Amber außerhalb der Statusgruppe?
- Sind Zustände, Posen und Tiers als unterschiedliche Arten lesbar?
- Ist Reduced Motion sichtbar vollständig ruhig?
- Bleibt Kleidung eine Auflage und nicht ein Ersatzkörper?

Keine Silhouettenkorrektur-Schleife beginnen. Sichtbare Detailmängel werden
als Verweis auf den bestehenden `TODO.md`-Abschnitt dokumentiert und bewusst
stehen gelassen.

## 11. Verifikation

Während der Umsetzung zuerst fokussiert:

```bash
python3 -m py_compile \
  tools/character-modeling/create_pico_feature_stubs.py \
  tools/character-modeling/validate_feature_stubs.py

"$PICO_BLENDER" --background -noaudio --factory-startup --disable-autoexec \
  --python-exit-code 1 \
  --python tools/character-modeling/create_pico_feature_stubs.py

"$PICO_BLENDER" \
  tools/character-modeling/prototype/pico-character-feature-stubs-v0.blend \
  --background -noaudio --disable-autoexec --python-exit-code 1 \
  --python tools/character-modeling/validate_feature_stubs.py

git diff --check
```

Vor dem Milestone-Commit vollständig:

```bash
npx pnpm@9.0.0 release:verify
```

Blender 5.2 kann auf dieser Maschine nach abgeschlossener Arbeit in der
PulseAudio-Beendigung hängen. Generator und Validator müssen deshalb nach
ihren finalen `PICO_FEATURE_STUB_*`-Statuszeilen stdout/stderr leeren und
kontrolliert beenden, wie die vorhandenen Character-Skripte.

## 12. Nichtziele und Verbote

In diesem Milestone ausdrücklich nicht:

- Detailfeinschliff irgendeiner Gruppe;
- Häkchen im Abschnitt `Character-Feinschliff nach Low-Quality-Drafts` setzen;
- Character Design v3.3.0 erfinden oder annehmen;
- `approved-character-assets.json` um einen Production-Eintrag erweitern;
- normative GLBs, Produkticons oder App-Assets ersetzen;
- Kopfmodule in `pico-character-core-v0.blend` zurückkopieren;
- natürliche Haarsträhnen, Haarphysik, Stoffsimulation oder freie Shader
  einführen;
- Status, Kontext, Appearance und Origin-Marker zusammenlegen;
- `neutral/technical/soft` als neue Style-Achse wiederbeleben;
- einen Runtime-, Synchronisations- oder Kompatibilitätsclaim aus der Existenz
  eines Blender-Stubs ableiten;
- Produktcode oder Runtime-Abhängigkeiten für die Stubs ergänzen.

## 13. Fertig-Definition

Der Auftrag ist erst fertig, wenn gleichzeitig gilt:

- Manifest enthält genau 28 Datensätze in der festgelegten Reihenfolge;
- jede Gruppe hat einen sichtbaren Stub der richtigen Art;
- alle Gruppen sind einzeln anwählbar und renderbar;
- die gemeinsame Core-Quelle wird nur einmal eingebunden;
- Validator und vier Negativmutationen bestehen beziehungsweise scheitern wie
  erwartet;
- 28 Einzelbilder und drei Kontaktbögen wurden angesehen;
- der Repository-Checkpoint wurde aus demselben validierten Lauf kopiert;
- `release:verify` ist grün;
- `.agent-context.md` nennt Status, Artefakte, offene Risiken und den danach
  ersten Feinschliffblock;
- nur die Dateien dieses Arbeitspakets sind im Commit.

## 14. Commit und Handoff

Empfohlene Commit-Message:

```text
feat(character): build complete feature stub set
```

Im Abschluss ausdrücklich melden:

- Anzahl und Arten der erzeugten Stubs;
- Pfad zur `.blend` und zu den drei Kontaktbögen;
- Ergebnis des Validators und der Negativmutationen;
- Ergebnis von `release:verify`;
- dass alle Stubs diagnostisch und unfreigegeben bleiben;
- dass keine Feinschliffaufgabe als erledigt markiert wurde.

Nach diesem Milestone beginnt der Feinschliff weiterhin in der vom Eigentümer
festgelegten Reihenfolge: zuerst `hair_style_3_concept_tail`, danach
`hair_style_2_raised_crown`, anschließend die übrigen Gruppen. Für den
vollständigen Stub-Milestone gilt `gpt-5.6-sol + xhigh`; für die anschließende
visuelle Einzelverfeinerung genügt normalerweise `gpt-5.6-terra + high`.
