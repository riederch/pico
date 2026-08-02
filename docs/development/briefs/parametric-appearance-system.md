# PICO Parametric Appearance System (PAS)

**Implementierungsauftrag für den Coding Agenten**  
**Dokumentversion:** 1.3  
**Datum:** 2026-08-02  
**Zielrepository:** `pico`  
**Empfohlenes Modell:** Codex `gpt-5.6-sol + xhigh`  
**ADR:** `docs/architecture/0125-parametric-appearance-and-version-compatibility.md`  
**Protocol-Spezifikation:** `docs/protocol/appearance-document-v1.md`  
**Package:** `packages/appearance` / `@pico/appearance`

---

## 1. Auftrag

Erweitere PICO um ein kompaktes, deterministisches und versioniertes **Parametric Appearance System**. PICO soll persönliche Erscheinungsmerkmale nicht als fertige Bilder, Texturen oder Meshes speichern und übertragen, sondern als kleine, streng validierte Zahlenprofile.

Das System soll zunächst folgende Bereiche abdecken:

1. **Kopfidentität**
   - Standardantenne oder genau ein prozedurales Neon-Haar-/Kopfmodul;
   - niemals Antenne und Haar gleichzeitig;
   - prozeduraler Scheitel beziehungsweise sichtbare Teilung innerhalb desselben Moduls;
   - einheitliche technische, segmentierte Neon-/Lichtleiterästhetik.
2. **Körperschale**
   - subtile persönliche Körperfarbe innerhalb eines engen hellen Keramik-Korridors;
   - kontrollierter Glanz beziehungsweise Oberflächenfinish;
   - keine frei wählbaren Vollsättigungsfarben.
3. **Gesichtsdisplay**
   - kontrollierbarer dunkler Farbunterton und Reflexionscharakter;
   - weiterhin eindeutig dunkles Display, keine Hautfarbe und keine helle Gesichtsfläche.
4. **Nichtleuchtende Zier- und Metallteile**
   - begrenzte Trim-Farbe und Metallwirkung;
   - keine Veränderung der Statuslichtgruppe.

Das Profil muss klein genug sein, um zwischen Picos übertragen und auf einem Gerät dauerhaft gespeichert zu werden, ohne komplette Bilddateien oder 3D-Assets zu übertragen.

Der erste zusammenhängende Implementierungsblock umfasst:

- Architektur- und Governance-Vertrag;
- TypeScript-Datentypen;
- strikte Validierung;
- kanonischen Binärcodec;
- Cache-Key und Testvektoren;
- Unit-Tests;
- **noch keinen vollständigen Renderer, kein UI und keine Protocol-Synchronisierung**.

Stoppe nach diesem ersten Block mit einem lokalen Commit und einem klaren Handoff. Geometrie, visuelle Diagnosematrix und Produktintegration sind nachgelagerte Milestones.

---

## 2. Verbindlicher Einstieg

Vor Änderungen:

1. `git status --short --branch` ausführen.
2. `git log -3 --oneline` prüfen.
3. `AGENTS.md` und `.agent-context.md` lesen.
4. Folgende Dokumente vollständig lesen:
   - `docs/architecture/0013-visual-design-language.md`
   - `docs/design-system/07_Governance/Character_Standard_v3.2.1.md`
   - `docs/design-system/07_Governance/Status_Light_Hotfix_v3.2.1.md`
   - `docs/design-system/07_Governance/approved-character-assets.json`
5. Die Originalreferenzen ansehen, aber niemals verändern:
   - `docs/design-system/08_Starter_Kit/assets/PICO_Designboard_Original.png`
   - `docs/design-system/08_Starter_Kit/assets/PICO_Basis_Avatar.png`
   - `docs/design-system/08_Starter_Kit/assets/PICO_Regression_15er_v3.2.1.png`
6. Vorhandene fremde oder unklare Änderungen erhalten und nicht in den eigenen Commit aufnehmen.
7. Keine neue Runtime-Abhängigkeit in `apps/web` einführen.
8. `pnpm` ausschließlich über den im Repository vorgesehenen Aufruf verwenden:

```bash
npx pnpm@9.0.0 <script>
```

Wenn im Repository bereits ein Konzept oder eine Teilimplementierung für prozedurale Haare existiert, diese integrieren und weiterentwickeln. Keine parallele zweite Appearance-Architektur anlegen.

---

## 3. Normative Ausgangslage und Versionsentscheidung

### 3.1 Bestehende Character-Regel

PICO Character Design v3.2.1 behandelt die Standardantenne als unveränderliches Character-Element. Das Original-Designboard zeigt zugleich haarähnliche Identitätsmodule, die visuell an die Stelle der Antenne treten.

Für PAS gilt folgende neue Produktentscheidung:

> PICO besitzt jederzeit genau eine Kopfidentität: entweder die Standardantenne oder genau ein prozedurales Haar-/Kopfmodul. Bei aktivem Kopfmodul ist keine Antenne vorhanden.

Diese Entscheidung darf **nicht** still in Character Design v3.2.1 eingearbeitet werden. Sie verlangt eine neue Character-Version, empfohlen:

```text
PICO Character Design v3.3.0
```

Bis diese Version formal angenommen ist, bleiben PAS und alle erzeugten Darstellungen `proposed` beziehungsweise `diagnostic`. Keine Production-Asset- oder Character-Freigabe behaupten.

Repo-Abgleich (2026-08-02): `Status_Light_Hotfix_v3.2.1.md` nennt den freigegebenen leuchtenden Kopfakzent bereits als Alternative zur Antennenkugel. Character Design v3.3.0 muss daher vor allem die Exklusivregel und die Generatorfreigabe formalisieren; die Statuslichtgruppe selbst ist vorbereitet.

### 3.2 Statuslicht bleibt höherrangig

Folgende Elemente bilden weiterhin eine untrennbare Statuslichtgruppe:

- Augen;
- Mundlinie;
- Brustkern;
- Antennenkugel **oder** freigegebener leuchtender Kopfakzent des Haarmoduls;
- Unterseiten-Glow;
- Schwebering.

Alle Elemente dieser Gruppe verwenden in derselben Darstellung exakt dieselbe Statusfarbe.

Das Appearance-Profil enthält daher:

- keine Statusfarbe;
- keine frei einstellbare Emissionsfarbe;
- keine frei einstellbare Emissionsstärke;
- keine Kontextfarbe.

---

## 4. Begriffsmodell

### 4.1 Character Core

Der unveränderliche Character Core umfasst:

- Silhouette und Proportionen;
- Kopf- und Visiergeometrie;
- Torso;
- Arme und Hände;
- Seitenmodule;
- Brustkern als Bauteil;
- Schwebeform;
- Augen- und Mundgeometrie;
- räumlichen hochwertigen Renderingstil.

PAS darf den Character Core nicht neu modellieren.

### 4.2 Appearance

Appearance ist eine dauerhafte, personenbezogene, rein dekorative Einstellung:

- Kopfidentität;
- Körperfarbton und Finish;
- dunkler Display-Unterton;
- nichtleuchtende Trim-Farbe.

Appearance ist kein:

- Status;
- Kontext;
- Kleidungsmodus;
- Rollen- oder Rangsignal;
- Vertrauenssignal;
- Berechtigungsmerkmal;
- Identitätsnachweis.

### 4.3 Context

Context bleibt separat, zum Beispiel:

- Feuerwehr;
- Wasser / WWG;
- Smart Home;
- Technik;
- Organisation.

Context darf Zubehör, Panels, Werkzeuge und Umgebungsakzente ändern, aber nicht das gespeicherte Appearance-Profil.

### 4.4 Status

Status bleibt separat, zum Beispiel:

- active;
- listening;
- thinking;
- warning;
- blocked;
- success;
- offline/degraded.

---

## 5. Ziele

PAS muss:

1. aus wenigen Integerwerten eine große, kontrollierte Variantenzahl ermöglichen;
2. dieselben Profilbytes innerhalb derselben Version dauerhaft gleich interpretieren;
3. ohne Bilder, Texturen, GLB-, OBJ- oder andere Meshdateien im Profil auskommen;
4. den PICO-Charakter trotz Personalisierung sofort erkennbar halten;
5. Antenne und prozedurales Kopfmodul strukturell gegenseitig ausschließen;
6. genau ein Kopfmodul erzeugen, nie mehrere unabhängige Haarstile;
7. einen prozeduralen Scheitel als Formdetail desselben Moduls unterstützen;
8. persönliche Materialfarben strikt von Statuslicht trennen;
9. ausschließlich ganzzahlige kanonische Eingabewerte speichern;
10. untrusted Eingaben mit festen Größen- und Komplexitätsgrenzen verarbeiten;
11. personenspezifische Einstellungen später im Pico-Profil speichern, nicht in Host-Konfiguration oder Umgebungsvariablen;
12. alte Profile durch Versionierung dauerhaft interpretierbar halten.

---

## 6. Nichtziele der ersten Version

Nicht Bestandteil des ersten Implementierungsblocks:

- vollständiger 3D-Renderer;
- WebGL-, Three.js- oder Babylon.js-Integration;
- UI zur Appearance-Auswahl;
- Synchronisierung über Pico Link;
- Persistenzmigrationen;
- natürliche Haarsträhnen;
- Haarphysik oder Stoffsimulation;
- frei importierbare Meshes;
- benutzerdefinierte Texturen oder Shader;
- freie HEX-, RGB- oder CSS-Farbangaben;
- Veränderungen der Augenform, Mundform oder Visierform;
- kontextabhängige Kleidung;
- Freigabe generierter Einzelbilder als Production Assets;
- Geschlechtskategorien oder automatische Geschlechtsableitung.

---

## 7. Zonenmodell

PAS besitzt genau drei personalisierbare Zonen und eine Kopfidentität.

### 7.1 `headIdentity`

Entweder:

- `standard_antenna`; oder
- `procedural_neon_hair`.

Es gibt keinen unabhängigen booleschen Parameter wie `antennaVisible`.

### 7.2 `shell`

Erlaubt:

- subtiler Farbton;
- begrenzte Farbstärke;
- begrenzte Helligkeit;
- Glanzgrad.

Nicht erlaubt:

- dunkle Vollkörpervariante;
- stark gesättigte Vollkörperfarbe;
- Emission;
- Textur-URL;
- Materialklasse außerhalb heller technischer Keramik beziehungsweise Ceramic-Metal-Hybrid.

### 7.3 `face`

Das Gesicht bleibt ein dunkles Display.

Erlaubt:

- subtiler dunkler Farbunterton;
- Black-Level innerhalb eines engen dunklen Korridors;
- Reflexionsstärke.

Nicht erlaubt:

- Hautfarbe;
- helle Gesichtsmaske;
- freie Emission;
- Pupillen;
- menschliche Gesichtsmerkmale;
- Änderung der Displayform.

### 7.4 `trim`

Erlaubt:

- nichtleuchtende Zier- und Metalleinfassungen;
- beispielsweise Seitenmodulrahmen, Gelenkabdeckungen, Kopfmodulträger oder nichtleuchtende Brustkerneinfassung.

Nicht erlaubt:

- Augen;
- Mundlinie;
- Brustkernlicht;
- Antennenlicht;
- Haar-Statusleiter;
- Schwebering;
- Unterseiten-Glow.

---

## 8. Öffentliche TypeScript-Verträge

Implementiere die folgenden logischen Typen in `@pico/appearance`.

```ts
export type PicoHeadIdentityV1 =
  | Readonly<{
      kind: "standard_antenna";
    }>
  | Readonly<{
      kind: "procedural_neon_hair";
      recipe: ProceduralHeadRecipeV2;
    }>;

export interface ProceduralHeadRecipeV2 {
  readonly generatorVersion: 2;

  readonly geometry: Readonly<{
    anchor: number;
    side: number;
    length: number;
    lift: number;
    sweep: number;
    curl: number;
    width: number;
    taper: number;
    twist: number;
    segments: number;

    partOffset: number;
    partDepth: number;
    crownBias: number;
    rootSpread: number;
  }>;

  readonly material: Readonly<{
    hue: number;
    chroma: number;
    translucency: number;
  }>;
}

export interface PicoSurfaceAppearanceV1 {
  readonly surfaceVersion: 1;

  readonly shell: Readonly<{
    hue: number;
    chroma: number;
    lightness: number;
    gloss: number;
  }>;

  readonly face: Readonly<{
    hue: number;
    tint: number;
    blackLevel: number;
    reflectivity: number;
  }>;

  readonly trim: Readonly<{
    hue: number;
    chroma: number;
    metalness: number;
  }>;
}

export interface PicoAppearanceProfileV1 {
  readonly profileVersion: 1;
  readonly headIdentity: PicoHeadIdentityV1;
  readonly surface: PicoSurfaceAppearanceV1;
}
```

Alle Zahlen sind kanonisch ganzzahlig. Externe JSON-Profile mit Fließkommazahlen werden abgelehnt.

Keine optionale Interpretation unbekannter Felder und keine stillen Defaults beim Decodieren fremder Profile.

---

## 9. Kopfmodul: prozedurale Parameter

### 9.1 Wertebereiche

| Feld | Typ | Gültiger Bereich | Bedeutung |
|---|---:|---:|---|
| `generatorVersion` | `uint8` | exakt `2` | Version der Kopfgeometrie |
| `anchor` | `uint8` | `0…255` | Position auf dem sicheren Kronenbogen |
| `side` | `int8` | `-96…96` | Links-/Rechtsausrichtung |
| `length` | `uint8` | `0…255` | Gesamtlänge |
| `lift` | `uint8` | `0…255` | Anhebung über der Kopfschale |
| `sweep` | `int8` | `-64…127` | Verlauf nach vorne/hinten |
| `curl` | `int8` | `-127…127` | Endkrümmung |
| `width` | `uint8` | `0…255` | Grundbreite der Lamellen |
| `taper` | `uint8` | `0…255` | Verjüngung zum Ende |
| `twist` | `int8` | `-127…127` | Drehung entlang der Leitkurve |
| `segments` | `uint8` | `3…9` | Sichtbare Segmente |
| `partOffset` | `int8` | `-96…96` | Position des Scheitels links/rechts |
| `partDepth` | `uint8` | `0…192` | Sichtbarkeit/Tiefe der Scheitelfuge |
| `crownBias` | `int8` | `-96…96` | Formgewicht: kompakte Krone bis rückwärtiger Fluss |
| `rootSpread` | `uint8` | `48…192` | Breite der gemeinsamen Wurzelzone |
| `hue` | `uint16` | `0…359` | persönlicher Materialfarbton |
| `chroma` | `uint8` | `0…255` | begrenzte Materialsättigung |
| `translucency` | `uint8` | `0…255` | optische Dichte/Transparenz |

### 9.2 Bedeutung des Scheitels

Der Scheitel ist **kein zweites Haarmodul** und erzeugt keine unabhängigen Strähnen.

Er ist eine kontrollierte, nicht vollständig trennende Vertiefung oder optische Teilung in der gemeinsamen Wurzelzone des einen Kopfmoduls.

Regeln:

- genau ein mechanischer Wurzelkragen;
- genau ein zusammenhängender innerer Träger;
- Scheitelfuge darf die Moduleinheit nicht topologisch auftrennen;
- keine zwei Zöpfe, zwei Hörner, zwei Antennen oder Tierohren;
- `partDepth = 0` ergibt eine ungeteilte Wurzel;
- zunehmende `partDepth` prägt nur eine stärkere Fuge beziehungsweise Flussaufteilung;
- die Fuge endet vor dem Segmentbereich, bevor zwei unabhängige Moduläste entstehen könnten.

### 9.3 Geometrische Zielwirkung

Aus demselben Generatorraum sollen ohne feste Frisuren-IDs unter anderem entstehen können:

- kompakter technischer Schopf;
- zentraler oder seitlicher Scheitel;
- flacher Sweep;
- erhöhte Krone;
- kurzer rückwärtiger Fluss;
- langer segmentierter Neon-Schweif;
- weiche Schleifenwirkung innerhalb einer zusammenhängenden Leitkurve.

Diese Begriffe sind Diagnosebeschreibungen, keine gespeicherten Style-Enums.

---

## 10. Oberflächenparameter

### 10.1 Shell

Die Schale bleibt hell. Die Werte werden später deterministisch in einen begrenzten OKLCH-Korridor abgebildet.

| Feld | Typ | Bereich | Physikalische/visuelle Abbildung |
|---|---:|---:|---|
| `hue` | `uint16` | `0…359` | OKLCH-Farbwinkel |
| `chroma` | `uint8` | `0…255` | `0.000…0.070` |
| `lightness` | `uint8` | `0…255` | OKLCH-Lichtheit `0.78…0.96` |
| `gloss` | `uint8` | `0…255` | Glanz `0.55…0.95` |

Damit sind subtile Varianten wie kühlweiß, warmweiß, silbrig, leicht blau, leicht violett oder sanft rosé möglich. Stark rote, grüne, schwarze oder hochgesättigte Vollkörperdarstellungen bleiben ausgeschlossen.

### 10.2 Face

Das Display bleibt dunkel.

| Feld | Typ | Bereich | Abbildung |
|---|---:|---:|---|
| `hue` | `uint16` | `0…359` | dunkler Farbunterton |
| `tint` | `uint8` | `0…255` | OKLCH-Chroma `0.000…0.040` |
| `blackLevel` | `uint8` | `0…255` | OKLCH-Lichtheit `0.025…0.110` |
| `reflectivity` | `uint8` | `0…255` | Reflexionsanteil `0.05…0.55` |

`face.hue` ist keine Hautfarbe. Der Wert beeinflusst ausschließlich den dunklen Display-Unterton und gegebenenfalls die Reflexion.

### 10.3 Trim

| Feld | Typ | Bereich | Abbildung |
|---|---:|---:|---|
| `hue` | `uint16` | `0…359` | OKLCH-Farbwinkel |
| `chroma` | `uint8` | `0…255` | `0.000…0.140` |
| `metalness` | `uint8` | `0…255` | Metallanteil `0.35…1.00` |

Trim bleibt nicht emissiv.

### 10.4 Gamut und Rundung

- Keine CSS- oder Browser-Farbauswertung als kanonische Datenquelle.
- Korridor-Mapping und Rundung in der Package-Spezifikation festschreiben.
- Ein Renderer darf gamut mapping durchführen, aber nicht die Profilsemantik verändern.
- Wenn ein kanonischer Resolver implementiert wird, muss dessen Ausgabe durch Golden-Vektoren stabilisiert werden.

---

## 11. Material- und Lichtvertrag des Kopfmoduls

Das Kopfmodul besteht aus drei festen Materialgruppen:

1. **Mechanical Root / Spine**
   - dunkler beziehungsweise trimfarbener mechanischer Träger;
   - nicht emissiv;
   - genau ein Montagepunkt.
2. **Personal Translucent Shell**
   - persönlicher `hue`-, `chroma`- und `translucency`-Wert;
   - transluzent;
   - nicht frei emissiv.
3. **Status Emitter**
   - schmale innere Linie, Kernzone oder definierte Kante;
   - Farbe und Intensität ausschließlich vom aktuellen Status;
   - Teil der globalen Statuslichtgruppe.

Der Neon-Eindruck entsteht aus Lichtleiterhülle, Reflexion, Statuskern und kontrolliertem Bloom. Die persönliche Haarfarbe bleibt Materialfarbe und wird nicht als unabhängige Statusfarbe interpretiert.

---

## 12. Kanonischer Binärcodec

### 12.1 Profilformat

Das kompakte Profil verwendet ein variables, aber längenkanonisches Binärformat.

```text
Standardantenne: 18 Byte
Prozedurales Kopfmodul: 38 Byte
```

### 12.2 Header

| Byte | Inhalt |
|---:|---|
| 0 | `profileVersion`, exakt `1` |
| 1 | `headKind`: `0 = standard_antenna`, `1 = procedural_neon_hair` |
| 2 | `surfaceVersion`, exakt `1` |
| 3 | Flags, in v1 exakt `0` |

### 12.3 Surface-Block, 14 Byte

| Byte relativ zum Block | Inhalt |
|---:|---|
| 0 | `shell.hue` Low Byte |
| 1 | `shell.hue` High Byte |
| 2 | `shell.chroma` |
| 3 | `shell.lightness` |
| 4 | `shell.gloss` |
| 5 | `face.hue` Low Byte |
| 6 | `face.hue` High Byte |
| 7 | `face.tint` |
| 8 | `face.blackLevel` |
| 9 | `face.reflectivity` |
| 10 | `trim.hue` Low Byte |
| 11 | `trim.hue` High Byte |
| 12 | `trim.chroma` |
| 13 | `trim.metalness` |

Der Surface-Block beginnt direkt nach dem vier Byte langen Header.

### 12.4 Head-Block V2, 20 Byte

Der Head-Block folgt nur bei `headKind = 1` auf den Surface-Block.

| Byte relativ zum Block | Inhalt |
|---:|---|
| 0 | `generatorVersion`, exakt `2` |
| 1 | Head-Flags, in v2 exakt `0` |
| 2 | `anchor` |
| 3 | `side` als `int8` |
| 4 | `length` |
| 5 | `lift` |
| 6 | `sweep` als `int8` |
| 7 | `curl` als `int8` |
| 8 | `width` |
| 9 | `taper` |
| 10 | `twist` als `int8` |
| 11 | `segments` |
| 12 | `hue` Low Byte |
| 13 | `hue` High Byte |
| 14 | `chroma` |
| 15 | `translucency` |
| 16 | `partOffset` als `int8` |
| 17 | `partDepth` |
| 18 | `crownBias` als `int8` |
| 19 | `rootSpread` |

### 12.5 Textrepräsentation

```text
pa1_<base64url-ohne-padding>
```

Das Präfix gehört nicht zu den Binärbytes.

`pa1_` bleibt das isolierte Profilformat für genau die 18/38 Profilbytes.
Das portable, versionsübergreifende Appearance-Dokument verwendet zusätzlich
das Envelope-Format `pad1_...` (ADR 0125,
`docs/protocol/appearance-document-v1.md`): es trägt denselben Profilpayload
unverändert als Canonical-Profile-Record plus den verpflichtenden
Compatibility Core und optionale Records. Beide Formate sind nicht
austauschbar und dürfen nicht verwechselt werden.

### 12.6 Codec-Invarianten

Der Codec muss:

- nur exakt 18 oder 38 Byte akzeptieren;
- Länge und `headKind` gegenseitig prüfen;
- unbekannte Versionen ablehnen;
- unbekannte Flags ablehnen;
- reservierte Werte nicht approximieren;
- `hue > 359` ablehnen;
- semantisch ungültige Werte ablehnen;
- keine stillen Clamps durchführen;
- Encode → Decode → Encode byteidentisch halten;
- die Standardantenne ohne leeren oder ignorierten Hair-Block codieren;
- typisierte Fehler ohne vertrauliche Rohdaten liefern.

### 12.7 Umgang mit einer früheren HairRecipeV1

Falls im Repository bereits der frühere 16-Byte-Hair-Codec mit `generatorVersion = 1` implementiert ist:

- V1-Bytes und V1-Bedeutung niemals umdeuten;
- Decoder und Tests erhalten;
- V2 separat ergänzen;
- keine automatische Migration ohne dokumentierten Transformationsvertrag;
- neue PAS-Profile ausschließlich mit V2 erzeugen.

Falls V1 nur als Konzept existiert und nie Teil eines Runtime- oder gespeicherten Vertrags war, muss keine unnötige V1-Runtime implementiert werden. Die Nummer `2` bleibt dennoch bestehen, damit die erweiterte Scheitel-Semantik nicht mit dem älteren 16-Byte-Entwurf verwechselt wird.

Repo-Abgleich (2026-08-02): Im Zielrepository existiert weder Code noch Vertrag noch Dokumentation einer HairRecipeV1. Es gilt der zweite Fall; keine V1-Runtime implementieren.

---

## 13. Validierung

### 13.1 Externe JSON-Validierung

- geschlossene Objektformen;
- keine unbekannten Felder;
- keine fehlenden Pflichtfelder;
- nur Integer;
- keine `NaN`, `Infinity`, Strings oder numerischen Strings;
- exakte Versionswerte;
- exakte Union für `headIdentity`;
- keine separate Antennensichtbarkeit.

### 13.2 Semantische Validierung

- `standard_antenna` besitzt kein Rezept;
- `procedural_neon_hair` besitzt exakt ein V2-Rezept;
- `segments` liegt zwischen 3 und 9;
- `partDepth` kann keine topologische Aufspaltung verlangen;
- Shell bleibt im hellen Korridor;
- Face bleibt im dunklen Korridor;
- Trim ist nicht emissiv;
- keine Statuswerte im Profil;
- keine Context-Werte im Profil.

### 13.3 Geometrische Validierung für den späteren Generator

Der zukünftige Geometriegenerator muss sicherstellen:

- genau ein Wurzelkragen;
- genau eine Hauptleitkurve;
- ein zusammenhängender innerer Träger;
- keine Verzweigung in unabhängige Module;
- keine Antennengeometrie bei Haarmodus;
- keine Kollision mit Visier;
- keine relevante Verdeckung von Augen oder Mund;
- keine Kollision mit Seitenmodulen;
- keine Kollision mit Schulter-/Arm-Sicherheitsvolumen in neutraler Pose;
- keine Ohren-, Horn-, Flügel-, Kronen- oder zweite-Antenne-Wirkung;
- keine natürlichen dünnen Haarsträhnen;
- feste Obergrenzen für Vertices und Indizes.

### 13.4 Ungültige Profile

- fremde ungültige Profile ablehnen;
- nicht still korrigieren;
- optional neutralen PICO mit Standardantenne als rein visuelles Fallback darstellen;
- das ungültige Originalprofil nicht überschreiben;
- Unsupported-Version als eigenen Fehlerzustand behandeln.

---

## 14. Determinismus und Versionierung

### 14.1 Identität

Die Appearance-Identität ist das validierte Profil, nicht ein Screenshot und nicht ein rendererabhängiges Mesh.

### 14.2 Versionsregel

Eine Änderung verlangt eine neue Version, wenn sie für ein gültiges Profil mindestens eines davon ändert:

- Binärbytes;
- Parameterbedeutung;
- kanonisch aufgelöste Materialwerte;
- Geometrie;
- Vertex-/Indexreihenfolge;
- Scheitelwirkung;
- Validitätsbereich.

Innerhalb derselben Version zulässig:

- zusätzliche Tests;
- Dokumentationspräzisierung;
- frühere Ablehnung bereits ungültiger Eingaben;
- interne Refactorings ohne Outputänderung.

### 14.3 Keine Zufallsquelle in V1/V2

- kein Seed;
- keine Zeitwerte;
- keine Geräte-ID;
- keine Plattformzufälligkeit;
- keine GPU-generierte Topologie.

Jede sichtbare Eigenschaft ist explizit durch Profilwerte bestimmt.

---

## 15. Cache und spätere Übertragung

### 15.1 Cache-Key

```text
pico-appearance:pa1:<base64url(profileBytes)>:<rendererVersion>:<lod>
```

Der Cache ist vollständig abgeleitet und darf jederzeit gelöscht werden.

`rendererVersion` ist auf Kleinbuchstaben, Ziffern, Punkt und Bindestrich beschränkt und enthält insbesondere keinen Doppelpunkt, damit die Key-Segmente eindeutig bleiben.

### 15.2 Übertragung

Die 18/38 Byte sind der vollständige **Profilpayload**, nicht die
Übertragungseinheit. Später übertragen wird das portable
Appearance-Dokument (`pad1_`-Envelope nach ADR 0125): kanonischer
Profilpayload plus Compatibility Core plus optionale Custom-Asset-Referenzen
und namespaced Extensions, innerhalb der dort festgelegten Größenlimits.
Der Compatibility Core hält das Dokument auch für Clients lesbar, die die
Profilversion nicht kennen.

Nicht übertragen werden:

- PNG/JPEG/WebP;
- Texturen;
- GLB/OBJ;
- triangulierte Meshes;
- Statusfarbe;
- Kontextausstattung.

### 15.3 Einstellungszuständigkeit

PAS ist eine personenbezogene Pico-Einstellung im Sinn von ADR 0104.

Daher später:

- im Pico-Profil beziehungsweise in Pico-eigener persistenter Einstellung speichern;
- nicht in Add-on-Optionen;
- nicht in Host-Konfigurationsdateien;
- nicht in Umgebungsvariablen;
- nicht als globale Home-Einstellung behandeln.

Im ersten Milestone noch keine Persistenz- oder Protocol-Änderung vornehmen.

---

## 16. Governance-Modell

Das aktuelle Character-Governance-Modell registriert Production Assets einzeln. Ein kontinuierlicher prozeduraler Parameterraum benötigt zusätzlich eine Generatorfreigabe.

### 16.1 Neue Freigabeklasse

```text
procedural_generator
```

Freigegeben werden:

- Generator-ID;
- Generatorversion;
- kompatible Character-Version;
- Spezifikationspfad;
- Implementierungspfad;
- Parameterdomäne;
- Materialvertrag;
- Binärlayout;
- Golden-Testvektoren;
- Invarianten;
- Release-/Manifest-Prüfsumme.

Ein einzelnes gültiges Profil benötigt danach keinen eigenen Asset-Registry-Eintrag.

### 16.2 Registry

Umgesetzt als versionsorientierte Registry nach ADR 0125:

```text
docs/design-system/07_Governance/official-appearance-generators.json
```

Sie führt Generator-ID, Generatorversion, Profile-/Core-Model-Anforderungen,
Status (`proposed`/`approved`/`deprecated`/`withdrawn`), Spezifikations- und
Testvektorpfad, den SHA-256-Pin der normativen Vektordatei, Release- und
Supportstatus, Parameterdomäne und Fallback-Projektionsversion. Der
Head-Generator v2 steht dort `proposed`; die Registry erteilt keine
Character-Freigabe.

### 16.3 Originalreferenzen

- Originalbilder byteidentisch erhalten;
- keine Ersetzung oder Retusche;
- neue Diagnoseboards als Diagnostic Reference kennzeichnen;
- keine Production-Freigabe allein durch einen erfolgreichen Renderer-Test.

### 16.4 Verhältnis zu ADR 0013 und zur Token-Autorität

ADR 0125 muss ausdrücklich festhalten:

1. Die Regel aus ADR 0013, dass jedes Production-Rendering von PICO ein einzeln registriertes `production_asset` verwendet, wird für prozedural erzeugte Darstellungen um die Generatorfreigabe erweitert; dasselbe gilt für Schritt 6 des Character-Freigabeprozesses in `Character_Standard_v3.2.1.md`. Diese Erweiterung wird erst mit der formalen Annahme von Character Design v3.3.0 wirksam; bis dahin ist jede PAS-Darstellung `diagnostic`.
2. Die OKLCH-Korridore sind Konstanten der PAS-Spezifikation und werden durch Golden-Vektoren eingefroren. Appearance-Werte sind Nutzdaten innerhalb dieser Korridore, keine Design-Tokens. Die DTCG-Token-Autorität aus ADR 0013 für Produkt-UI-Farben bleibt unberührt; ein späterer Renderer führt keine Farbliterale in die vom Design-System-Check geprüften Web-Dateien ein.

---

## 17. Repository-Struktur

### 17.1 Dokumentation

Neu anlegen (umgesetzter Stand):

```text
docs/architecture/0125-parametric-appearance-and-version-compatibility.md
docs/protocol/appearance-document-v1.md
docs/protocol/fixtures/appearance-document/v1/suite.json
docs/design-system/07_Governance/official-appearance-generators.json
docs/design-system/07_Governance/parametric-appearance-v1-vectors.json
```

Die normativen Parameterdomänen stehen in diesem Brief, die Envelope-,
Compatibility-Core- und Projektionsregeln in der Protocol-Spezifikation;
ein separates `Parametric_Appearance_System_v1.0.md` ist dadurch nicht
erforderlich.

Später nach formaler Designfreigabe:

```text
docs/design-system/07_Governance/Character_Standard_v3.3.0.md
```

Nach dem Anlegen der Governance-Dateien die Manifest-Dateiliste nachziehen:

```bash
npx pnpm@9.0.0 design-system:manifest
```

`scripts/check-design-system.mjs` vergleicht die vollständige Dateiliste unter `docs/design-system/` samt Hashes mit `manifest.json`; ohne diesen Nachzug schlägt `release:verify` fehl. Dasselbe gilt nach jeder späteren Änderung an den Testvektoren. Unverändert bleiben dabei die Design-System-Version in `VERSION.txt` und die `characterDependency` (`PICO Character Design v3.2.1`); beide werden nicht durch PAS, sondern nur durch eigene Design-System-Korrekturen bewegt.

Nicht vorschnell ändern:

- Design-System-Version;
- Production-Asset-Registry `approved-character-assets.json`;
- Produktclaims;
- README-Marketingtext.

### 17.2 Package

```text
packages/appearance/
  package.json
  tsconfig.json
  src/
    index.ts
    appearance-profile-v1.ts
    appearance-validation-v1.ts
    appearance-codec-v1.ts
    appearance-cache-key-v1.ts
    surface-appearance-v1.ts
    procedural-head-recipe-v2.ts
    procedural-head-validation-v2.ts
    appearance-errors.ts
    appearance-codec-v1.test.ts
    appearance-validation-v1.test.ts
    appearance-cache-key-v1.test.ts
    appearance-vectors-v1.test.ts
```

Repo-Abgleich: Die bestehende Konvention sind co-lokalisierte Tests als `src/*.test.ts` wie in `@pico/protocol`; kein separates `test/`-Verzeichnis anlegen.

### 17.3 Package-Metadaten

```json
{
  "name": "@pico/appearance",
  "version": "0.1.9",
  "private": true,
  "license": "SEE LICENSE IN LICENSE",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "check": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage"
  }
}
```

V1 benötigt keine Runtime-Abhängigkeiten.

Workspace- und Release-Skripte nur so erweitern, wie es die bestehenden Packages verlangen. Konkret verlangt das Repository zwei Nachzüge: `packages/appearance/package.json` in die Paketliste von `scripts/check-version.mjs` aufnehmen (die Version folgt der Root-Version) und den Lockfile per `npx pnpm@9.0.0 install` aktualisieren; auf der aktuellen Maschine braucht der Install zusätzlich `--store-dir /tmp/pico-pnpm-store`.

---

## 18. Empfohlene öffentliche API

```ts
export type AppearanceProfileBytesV1 = Uint8Array;

export class PicoAppearanceValidationError extends Error {
  readonly code:
    | "invalid_shape"
    | "invalid_integer"
    | "out_of_range"
    | "unsupported_version"
    | "unknown_flags"
    | "invalid_length"
    | "head_length_mismatch";
}

export function validatePicoAppearanceProfileV1(
  value: unknown
): PicoAppearanceProfileV1;

export function encodePicoAppearanceProfileV1(
  profile: PicoAppearanceProfileV1
): AppearanceProfileBytesV1;

export function decodePicoAppearanceProfileV1(
  bytes: Uint8Array
): PicoAppearanceProfileV1;

export function formatPicoAppearanceProfileV1(
  profile: PicoAppearanceProfileV1
): string;

export function parsePicoAppearanceProfileV1(
  encoded: string
): PicoAppearanceProfileV1;

export function createPicoAppearanceCacheKeyV1(
  profile: PicoAppearanceProfileV1,
  rendererVersion: string,
  lod: "lod0" | "lod1" | "lod2"
): string;
```

Optionale interne Funktionen:

```ts
export function resolveSurfaceAppearanceV1(
  surface: PicoSurfaceAppearanceV1
): ResolvedSurfaceAppearanceV1;
```

Diese Funktion nur öffentlich machen, wenn ihre numerische Semantik vollständig spezifiziert und durch Golden-Vektoren eingefroren wird.

---

## 19. Testvektoren

Die JSON-Datei `parametric-appearance-v1-vectors.json` enthält mindestens:

### 19.1 Standardantenne

1. neutrales helles Shell-Profil;
2. kühl getönte Shell;
3. warm getönte Shell;
4. dunkelstes erlaubtes Face;
5. hellstes erlaubtes Face;
6. maximale und minimale Trim-Metalness.

### 19.2 Prozedurales Kopfmodul

1. kompakter ungeteilter Schopf;
2. mittiger Scheitel;
3. linker Scheitel;
4. rechter Scheitel;
5. flacher Seitensweep;
6. erhöhte Krone;
7. kurzer rückwärtiger Fluss;
8. langer Neon-Schweif;
9. drei Segmente;
10. neun Segmente;
11. minimale zulässige Breite;
12. maximale zulässige Breite.

Jeder Vektor enthält:

- lesbares JSON-Profil;
- erwartete hexadezimale oder Base64url-Bytes;
- erwartete Länge;
- erwarteten Cache-Key-Anteil;
- bei ungültigen Vektoren den erwarteten Fehlercode.

### 19.3 Ungültige Vektoren

Mindestens:

- falsche Profilversion;
- unbekannte Head-Art;
- unbekannte Flags;
- 17, 19, 37 und 39 Byte;
- Antennenprofil mit angehängtem Head-Block;
- Haarprofil ohne Head-Block;
- `hue = 360`;
- `segments = 2` und `10`;
- `partDepth > 192`;
- `rootSpread < 48` und `> 192`;
- Float statt Integer;
- zusätzliches unbekanntes JSON-Feld;
- Statusfarbe im Profil;
- Context-Feld im Profil.

---

## 20. Unit- und Property-Tests

### 20.1 Codec

- Encode/Decode aller Grenzwerte;
- signed `int8` korrekt;
- Little-Endian für `uint16` explizit testen;
- Roundtrip byteidentisch;
- Format/Parse kanonisch;
- Base64url ohne Padding;
- keine alternativen Textformen akzeptieren, sofern nicht spezifiziert;
- Eingabe-`Uint8Array` nicht mutieren.

### 20.2 Validierung

- geschlossene Shapes;
- discriminated union funktioniert;
- kein darstellbarer Zustand mit Antenne und Haar;
- keine unbekannten Keys;
- keine numerischen Strings;
- keine stillen Clamps;
- typisierte Fehlercodes stabil.

### 20.3 Robustheit

- zufällige Bytearrays von 0 bis mindestens 128 Byte terminieren kontrolliert;
- ungültige Inputs verursachen keine großen Allokationen;
- keine Stack-Rekursion;
- keine Datei- oder Netzwerkzugriffe;
- keine Abhängigkeit von Locale oder Zeitzone.

### 20.4 Property-basierte Tests

Keine neue Dependency nur für Property-Tests einführen. Falls im Repository keine geeignete Bibliothek vorhanden ist, deterministische Schleifentests mit festen Grenzwertkombinationen und einem kleinen lokalen PRNG ausschließlich im Testcode verwenden.

---

## 21. Spätere Geometriearchitektur

Noch nicht im ersten Block implementieren, aber ADR und Governance darauf ausrichten.

### 21.1 Kopfkoordinatensystem

- Ursprung im Kopfmittelpunkt;
- `+Y` nach oben;
- `+Z` nach hinten;
- `+X` nach rechts;
- Kopfbreite `W = 1`;
- analytische konservative Kollisionshülle.

### 21.2 Hauptleitkurve

- eine kubische Bézier- oder äquivalente Hermite-Kurve;
- eine feste Sampling-Reihenfolge;
- `anchor`, `lift`, `sweep`, `curl`, `side` bestimmen Verlauf;
- Parallel-Transport-Frame gegen Roll-Sprünge;
- `twist` entlang der Kurve;
- `segments` erzeugt breite Lamellen.

### 21.3 Scheitelgeometrie

- nur in der gemeinsamen Wurzelzone;
- `partOffset` verschiebt die Fuge;
- `partDepth` bestimmt ihre Stärke;
- `rootSpread` bestimmt die gemeinsame Wurzelbreite;
- `crownBias` bestimmt, wie stark das Volumen nach oben oder hinten fließt;
- niemals zwei unabhängige Hauptkurven.

### 21.4 LOD

| LOD | Zweck | Zielobergrenze |
|---|---|---:|
| `lod0` | Nahdarstellung | ca. 2.500 Vertices |
| `lod1` | Companion/Desktop | ca. 900 Vertices |
| `lod2` | kleine Übersicht | ca. 300 Vertices |

LOD darf weder Silhouette noch Segmentzahl oder Scheitelposition semantisch verändern.

---

## 22. Milestone-Plan

### Milestone A — Architektur, Governance und Kompatibilitätsvertrag

Liefern:

- ADR 0125 im Status `Proposed`;
- ausdrückliche Erweiterungsklausel gegenüber ADR 0013 und dem Character-Freigabeprozess samt Token-Abgrenzung nach Abschnitt 16.4;
- Erweiterung von ADR 0025 um die Appearance-Kompatibilitätsfläche;
- Claim-Qualifier in `docs/protocol/compatibility-levels.md` ohne neue L-Stufen;
- ehrlicher Implementierungsstand in `docs/protocol/public-surfaces.md`;
- Protocol-Spezifikation `docs/protocol/appearance-document-v1.md`;
- neue Generator-Registry im Status `proposed`;
- Antenne-/Kopfmodul-Exklusivität;
- Zonenmodell;
- Parameterdomänen;
- Binärlayout;
- ausdrückliche Nichtfreigabe als Production Character.

### Milestone B — Package, Codecs, Projektion und Conformance

Im selben zusammenhängenden Arbeitsblock wie A liefern:

- `@pico/appearance`;
- öffentliche Typen;
- strikte JSON-Validierung;
- 18-/38-Byte-Profilcodec und Textformat `pa1_...`;
- Compatibility Core V1 mit 24-Byte-Codec;
- deterministische Projektion Profile V1 → Compatibility Core V1;
- Appearance-Dokument-Envelope V1 mit Textformat `pad1_...`;
- Extensions- und Custom-Asset-Referenz-Verträge;
- Capability-/Claim-Typen in `@pico/protocol`;
- Cache-Key;
- Governance- und Protocol-Testvektoren (Conformance Fixtures);
- vollständige Unit-, Vektor- und Robustheitstests;
- Release-Gate erfolgreich.

**Danach stoppen.** Noch keinen Renderer, kein UI, keine Profile-Persistenz
und keine Runtime-Protocol-Änderung. Keine Kleidung in
`PicoAppearanceProfileV1`; Kleidung bleibt vorerst Compatibility-/Custom-
Asset-Fallbackfläche. Bestehende Bytepositionen des 18-/38-Byte-Profils
werden nie umgedeutet, und keine grafische Generatorfreigabe wird
vorgezogen.

### Milestone C — Deterministischer Geometriekern

Erst nach Abnahme:

- Kopfgeometrie V2;
- Scheitelfuge;
- Materialgruppen;
- drei LODs;
- Kollisionstests;
- quantisierte kanonische Buffer;
- Golden-Hashes.

### Milestone D — Diagnose und Character-Freigabe

- dev-only Referenzrenderer;
- 3×5-Diagnosematrix;
- Prüfung gegen das Original-Designboard;
- visuelle Kalibrierung der sicheren Parameterdomäne;
- Character Design v3.3.0;
- Generatorstatus optional `approved`.

### Milestone E — Produktintegration

- personenbezogene Persistenz;
- Companion-Einstellungen;
- Sync der 18/38 Bytes;
- Rendererbindung;
- Migration und Unsupported-Fallback;
- keine Authority-, Trust- oder Policy-Wirkung.

---

## 23. Abnahmekriterien für den ersten Arbeitsblock

Der erste Block ist abgeschlossen, wenn:

1. ADR und Governance den neuen Appearance-Raum widerspruchsfrei beschreiben, einschließlich der Erweiterungsklausel zu ADR 0013 und der Token-Abgrenzung aus Abschnitt 16.4;
2. die Originalreferenzen unverändert sind;
3. die Standardantenne und das Kopfmodul als geschlossene Union modelliert sind;
4. Antenne plus Haar im Typsystem nicht darstellbar ist;
5. genau 18 oder 38 Byte kanonisch codiert werden;
6. Codec-Roundtrips byteidentisch sind;
7. Shell-Farbe nur im hellen Korridor liegt;
8. Face-Farbe nur als dunkler Display-Unterton modelliert ist;
9. Trim nicht emissiv ist;
10. Scheitelparameter Teil desselben Kopfmoduls sind;
11. keine Status- oder Context-Farbe im Profil existiert;
12. ungültige und unbekannte Profile strikt abgelehnt werden;
13. keine neue Runtime-Abhängigkeit benötigt wird;
14. Testvektoren alle Grenzfälle abdecken;
15. der vollständige Gate erfolgreich ist;
16. ein lokaler Commit mit repräsentativer Message existiert;
17. `.agent-context.md` knapp aktualisiert wurde;
18. im Abschluss der konkrete Stoppgrund und der nächste Einstiegspunkt genannt werden.

---

## 24. Verifikation

Zuerst fokussiert:

```bash
npx pnpm@9.0.0 --filter @pico/appearance check
npx pnpm@9.0.0 --filter @pico/appearance test
npx pnpm@9.0.0 --filter @pico/appearance build
```

Danach vollständig:

```bash
npx pnpm@9.0.0 release:verify
```

Zusätzlich:

```bash
git diff --check
```

Falls der lokale Node-/ABI-Stand gemäß `.agent-context.md` einen speziellen PATH benötigt, denselben reproduzierbaren Aufruf wie im Repository-Handoff verwenden.

---

## 25. Commit und Handoff

Empfohlene Commit-Message:

```text
feat(appearance): define parametric pico appearance profile
```

Nicht pushen, sofern der Nutzer das nicht ausdrücklich beauftragt.

Der Abschlussbericht muss enthalten:

- geänderte Dateien;
- implementierte Verträge;
- Test- und Gate-Ergebnis;
- offene Governance-Grenze Character Design v3.3.0;
- Hinweis, dass noch kein Renderer und keine Production-Freigabe existiert;
- nächster Block: deterministischer Geometriekern;
- dafür empfohlene Model-/Effort-Stufe.

---

## 26. Beispielprofile

### 26.1 Neutral mit Standardantenne

```json
{
  "profileVersion": 1,
  "headIdentity": {
    "kind": "standard_antenna"
  },
  "surface": {
    "surfaceVersion": 1,
    "shell": {
      "hue": 210,
      "chroma": 18,
      "lightness": 224,
      "gloss": 214
    },
    "face": {
      "hue": 220,
      "tint": 20,
      "blackLevel": 52,
      "reflectivity": 128
    },
    "trim": {
      "hue": 215,
      "chroma": 36,
      "metalness": 198
    }
  }
}
```

### 26.2 Kompakter Scheitel

```json
{
  "profileVersion": 1,
  "headIdentity": {
    "kind": "procedural_neon_hair",
    "recipe": {
      "generatorVersion": 2,
      "geometry": {
        "anchor": 82,
        "side": 0,
        "length": 54,
        "lift": 174,
        "sweep": 12,
        "curl": 6,
        "width": 118,
        "taper": 204,
        "twist": 4,
        "segments": 4,
        "partOffset": 0,
        "partDepth": 108,
        "crownBias": -48,
        "rootSpread": 126
      },
      "material": {
        "hue": 198,
        "chroma": 138,
        "translucency": 168
      }
    }
  },
  "surface": {
    "surfaceVersion": 1,
    "shell": {
      "hue": 205,
      "chroma": 24,
      "lightness": 226,
      "gloss": 220
    },
    "face": {
      "hue": 225,
      "tint": 26,
      "blackLevel": 46,
      "reflectivity": 142
    },
    "trim": {
      "hue": 210,
      "chroma": 42,
      "metalness": 206
    }
  }
}
```

Erwartete Semantik:

- keine Antenne;
- genau ein zusammenhängendes Kopfmodul;
- sichtbare mittige Scheitelfuge;
- keine Auftrennung in zwei Frisuren;
- persönliche cyanfarbene Lichtleiterhülle;
- aktive Emission folgt ausschließlich dem Status.

### 26.3 Langer violetter Neon-Schweif mit seitlichem Scheitel

```json
{
  "profileVersion": 1,
  "headIdentity": {
    "kind": "procedural_neon_hair",
    "recipe": {
      "generatorVersion": 2,
      "geometry": {
        "anchor": 208,
        "side": 18,
        "length": 230,
        "lift": 188,
        "sweep": 110,
        "curl": 72,
        "width": 112,
        "taper": 216,
        "twist": -20,
        "segments": 8,
        "partOffset": -34,
        "partDepth": 82,
        "crownBias": 62,
        "rootSpread": 146
      },
      "material": {
        "hue": 286,
        "chroma": 156,
        "translucency": 184
      }
    }
  },
  "surface": {
    "surfaceVersion": 1,
    "shell": {
      "hue": 282,
      "chroma": 34,
      "lightness": 218,
      "gloss": 208
    },
    "face": {
      "hue": 258,
      "tint": 34,
      "blackLevel": 42,
      "reflectivity": 150
    },
    "trim": {
      "hue": 286,
      "chroma": 62,
      "metalness": 214
    }
  }
}
```

Erwartete Semantik:

- keine Antenne;
- genau ein mechanisch zusammenhängender Schweif;
- seitliche Scheitelfuge nur in der Wurzelzone;
- helle, subtil violett getönte PICO-Schale;
- dunkles violett-schwarzes Display;
- keine statusfremde Emission.

---

## 27. Zentrale Entscheidungszusammenfassung

> PICO Appearance ist ein kleines, versioniertes Zahlenprofil und kein Bildasset.

> PICO besitzt genau eine Kopfidentität: Standardantenne oder genau ein prozedurales Neon-Haar-/Kopfmodul.

> Der Scheitel ist eine kontrollierte Fuge innerhalb desselben Moduls und keine zweite Frisur.

> Körperfarbe bleibt eine subtile helle Keramiktönung; Gesichtsfarbe bleibt ein dunkler Display-Unterton.

> Persönliche Farben sind Materialeigenschaften. Jede aktive Emission gehört weiterhin zur globalen Statuslichtgruppe.

> Freigegeben wird später der Generator samt sicherem Parameterraum, nicht jede einzelne erzeugte Appearance.

---

## 28. Änderungen

- **1.3 (2026-08-02):** An den Versions- und Kompatibilitätsauftrag
  (`docs/development/briefs/appearance-versioning-and-adr-0025.md`, ADR 0125)
  angeglichen. ADR-Titel und -Pfad auf
  `0125-parametric-appearance-and-version-compatibility.md` umgestellt; die
  Aussage „später nur 18 oder 38 Byte plus äußere Protokollversion
  übertragen" ersetzt: die 18/38 Byte sind der vollständige Profilpayload,
  das portable Appearance-Dokument (`pad1_`) trägt zusätzlich Compatibility
  Core und Envelope; `pa1_` bleibt als isoliertes Profilformat erhalten;
  Registry als `official-appearance-generators.json` umgesetzt; Milestones
  A/B um ADR-0025-, Protocol- und Conformance-Arbeit erweitert. Keine
  Kleidung im Profil V1, keine Bytepositions-Umdeutung, keine vorgezogene
  Generatorfreigabe.

- **1.2 (2026-08-02):** ADR-Nummer von 0124 auf **0125** korrigiert; 0124 ist seit demselben Tag an die Character-Architektur vergeben. Der dort beschlossene autorierte Character Core liefert genau die Volumina, gegen die Abschnitt 13.3 seine Kollisionstests fordert — PAS setzt ADR 0124 damit voraus und kommt nach ihm. Brief ins Repository uebernommen unter `docs/development/briefs/`.

- **1.1 (2026-08-02):** Repo-Abgleich eingearbeitet. Manifest-Nachzug per `design-system:manifest` als Pflichtschritt (17.1); Erweiterungsklausel zu ADR 0013 und Token-Abgrenzung als Pflichtinhalt von ADR 0125 (16.4, 22, 23); co-lokalisierte Teststruktur (17.2); `check-version.mjs`- und Lockfile-Nachzug (17.3); `rendererVersion`-Zeichensatz (15.1); Hinweis auf den bereits im Statuslicht-Hotfix verankerten Kopfakzent (3.1); bestätigt, dass keine HairRecipeV1 existiert (12.7); Zielrepository heißt `pico`.
