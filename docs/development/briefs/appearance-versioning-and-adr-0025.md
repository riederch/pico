# Implementierungsauftrag: versionsübergreifendes PICO-Appearance-Protokoll und ADR-0025-Erweiterung

**Dokumenttyp:** vollständiger Arbeitsauftrag für den Coding Agenten  
**Dokumentversion:** 2.0  
**Datum:** 2026-08-02  
**Zielrepository:** `pico`  
**Empfohlenes Modell:** Codex `gpt-5.6-sol + xhigh`  
**Primärer neuer ADR:** `docs/architecture/0125-parametric-appearance-and-version-compatibility.md`  
**Bestehender anzupassender ADR:** `docs/architecture/0025-inter-pico-communication-compatibility.md`

---

## 1. Auftrag

Arbeite das bereits konzipierte parametrische PICO-Appearance-System so in das Repository ein, dass PICO-Designs langfristig zwischen offiziellen Versionen, alten Endgeräten und kompatiblen Forks austauschbar bleiben.

Die kanonische PICO-Identität wird nicht als Sprite, Bildfolge, Textur oder vollständiges Mesh übertragen. Sie wird grundsätzlich als kleiner, deterministischer und versionierter Zahlensatz beschrieben. Standardbestandteile wie Schalenfarben, Visiermaterial, Trim, Haare beziehungsweise Kopfmodule und später Standardkleidung werden auf dem Zielgerät aus diesen Parametern rekonstruiert.

Bild-, Textur- oder Meshdaten sind nur für ausdrücklich nichtparametrische Sonderfälle vorgesehen, beispielsweise individuelle Custom-Kleidung. Auch solche Sonderfälle benötigen immer einen parametrischen Fallback.

Der zentrale Kompatibilitätsvertrag lautet:

> Eine neuere offizielle PICO-Laufzeit muss jedes ältere offizielle PICO-Profil originalgetreu darstellen können.

> Eine ältere PICO-Laufzeit muss ein neueres PICO-Profil zumindest als semantisch richtige, vereinfachte PICO-Darstellung anzeigen können.

Beispiel:

```text
PICO-Laufzeit V6 + PICO-Profil V4
→ V4-Design originalgetreu darstellen.

PICO-Laufzeit V4 + PICO-Profil V6
→ mindestens Compatibility-Core-Darstellung mit richtigen Grundfarben,
   ähnlicher Haar-/Kopfmodulfamilie und brauchbarem Kleidungsfallback.
```

Diese Garantie wird nicht als paralleles Kompatibilitätssystem eingeführt. Sie wird als neue öffentliche Kompatibilitätsfläche unter ADR 0025 eingeordnet.

---

## 2. Umfang dieses Milestones

Der Milestone umfasst:

1. Anpassung von ADR 0025 an Appearance-, Animations- und Darstellungsprofile.
2. Erstellung von ADR 0125 für parametrische Appearance und Versionskompatibilität.
3. Präzisierung des vorhandenen Entwicklungsbriefs zum Parametric Appearance System.
4. Definition eines stabilen Appearance-Envelope und Compatibility Core.
5. Implementierung des Foundation-Packages `@pico/appearance`.
6. Strikte Typen, Validierung, kanonische Binärcodierung und Decodierung.
7. Versionierte Generator- und Schema-Registry.
8. Kompatibilitätsprojektion eines vollständigen Profils auf den stabilen Compatibility Core.
9. Capability- und Claim-Verträge im Protocol-Package.
10. Testvektoren und Conformance Fixtures.
11. Aktualisierung der Architektur- und Public-Surface-Dokumentation.
12. Vollständige Tests und Release-Verifikation.

Der Milestone umfasst ausdrücklich **nicht**:

- 3D-Modellierung;
- grafische Kalibrierung konkreter Haare oder Kleidung;
- einen WebGL-/Three.js-/Babylon.js-Renderer;
- Companion- oder Web-UI;
- Laufzeitsynchronisierung zwischen realen Picos;
- Persistenzmigrationen;
- Download oder Speicherung von Custom-Asset-Binärdaten;
- Haarphysik oder Sekundärbewegung;
- Production-Freigabe eines Character-Generators;
- Änderung oder Freigabe von Character Design v3.2.1;
- eine Behauptung, dass die vollständige Appearance-Kompatibilität bereits produktiv implementiert sei.

Stoppe nach dem vollständigen, releasefähigen Vertrags-, Package- und Test-Milestone. Renderer, Sync, Persistenz und grafische Generatorimplementierung sind spätere Blöcke.

---

## 3. Verbindlicher Einstieg

Vor Änderungen:

1. `git status --short --branch` ausführen.
2. `git log -3 --oneline` prüfen.
3. `AGENTS.md` und `.agent-context.md` vollständig lesen.
4. Fremde oder unklare Arbeitsbaumänderungen erhalten.
5. Folgende Dokumente vollständig lesen:
   - `docs/architecture/0025-inter-pico-communication-compatibility.md`
   - `docs/protocol/compatibility-levels.md`
   - `docs/protocol/public-surfaces.md`
   - `docs/architecture/0124-authored-character-core-and-tiered-presentation.md`
   - `docs/development/briefs/parametric-appearance-system.md`
   - `docs/architecture/0013-visual-design-language.md`
   - `docs/design-system/07_Governance/Character_Standard_v3.2.1.md`
   - `docs/design-system/07_Governance/Status_Light_Hotfix_v3.2.1.md`
   - `docs/architecture/implementation-status.md`
6. Prüfen, ob im aktuellen Branch bereits `packages/appearance`, ADR 0125 oder eine andere Appearance-Versionierungsimplementierung existiert. Vorhandene Arbeit integrieren; keine zweite parallele Architektur anlegen.
7. Keine Runtime-Abhängigkeit in `apps/web` einführen.
8. `pnpm` ausschließlich mit dem im Repository vorgesehenen Aufruf verwenden:

```bash
npx pnpm@9.0.0 <script>
```

9. Vor dem großen Block die Model-/Effort-Empfehlung gemäß `AGENTS.md` nennen.

---

## 4. Bestehende Architektur respektieren

### 4.1 ADR 0025 bleibt die übergeordnete Kompatibilitätsautorität

ADR 0025 regelt bereits:

- Kompatibilitätsbehauptungen von offiziellen Implementierungen und Forks;
- semantische Protokollversionierung;
- Capability Negotiation;
- namespaced Extensions;
- sicheres Ignorieren unbekannter optionaler Erweiterungen;
- Conformance Tests;
- das Verbot, bestehende Felder unter derselben Versionsbehauptung inkompatibel umzudeuten.

Appearance erhält darunter eine zusätzliche öffentliche Kompatibilitätsfläche. Es entsteht kein eigenes konkurrierendes L0–L5-System.

### 4.2 ADR 0124 bleibt die Character-Core-Autorität

ADR 0124 definiert:

- das autorisierte glTF-Character-Core-Artefakt;
- die Trennung zwischen authored geometry und parametric appearance;
- statische, composite und realtime Presentation Tiers;
- die Regel, dass alle Tiers vom selben Character Core abstammen;
- die Trennung zwischen Identität und gerätespezifischer Darstellungsqualität.

ADR 0125 darf ADR 0124 nicht neu definieren. Es versioniert die parametrische Appearance auf dem von ADR 0124 festgelegten Core.

### 4.3 Character Design v3.2.1 bleibt unverändert

Keine bestehende Character-Datei stillschweigend umschreiben oder als neue Freigabe interpretieren.

Die vorliegende Arbeit schafft die technische und governance-seitige Versionsbasis. Die spätere Freigabe konkreter prozeduraler Haar-, Kleidungs- oder Materialgeneratoren bleibt eine eigene Character-Entscheidung.

---

## 5. Nicht verhandelbare Produktinvarianten

1. **Parametersatz ist Identität.** Bilder, Bakes, Meshes und LODs sind abgeleitete Darstellungen.
2. **Design und Präsentationsqualität sind getrennt.** Ein schwaches Gerät darf LOD, Schatten, FPS oder Sekundärbewegung reduzieren, aber keine andere Appearance erzeugen.
3. **Neu stellt Alt exakt dar.** Jede neue offizielle Laufzeit enthält eine kompatible Implementierung aller früher veröffentlichten offiziellen Appearance- und Generatorversionen.
4. **Alt stellt Neu sinnvoll dar.** Jedes Profil enthält einen stabilen Compatibility Core, der ohne Kenntnis der neuen Generatoren darstellbar ist.
5. **Keine stillen Migrationen.** Ein V4-PICO bleibt nach einem V6-Softwareupdate ein V4-PICO, bis eine explizite, nachvollziehbare Migration erfolgt.
6. **Veröffentlichte Semantik ist immutable.** Bestehende Versionen, IDs, Wertebereiche und Rundungsregeln werden niemals umgedeutet.
7. **Unbekannte optionale Erweiterungen sind überspringbar.** Sie dürfen das Profil nicht unlesbar machen.
8. **Unbekannte kritische Erweiterungen werden abgelehnt.** Es darf keine scheinbar erfolgreiche, semantisch falsche Darstellung entstehen.
9. **Custom Assets haben Fallbacks.** Ein fehlendes Custom Asset darf nie zu einem unsichtbaren oder kaputten PICO führen.
10. **Forks sind erlaubt, Claims sind präzise.** Ein Fork muss nur die Appearance-Versionen originalgetreu implementieren, für die er ausdrücklich Kompatibilität beansprucht.
11. **Offizielle Versionen sind kumulativ.** Eine offizielle V6-Laufzeit darf die offizielle V4-Darstellung nicht nur approximieren.
12. **Status bleibt getrennt.** Statusfarbe, aktuelle Emotion, Blickrichtung, Mundzustand, Pose und Geste sind keine dauerhafte Appearance-Identität.
13. **Capability-Aushandlung ist Optimierung, keine Voraussetzung.** Ein gespeichertes oder weitergeleitetes Profil muss auch ohne vorherigen Handshake sinnvoll lesbar sein.
14. **Keine versteckte Authority.** Appearance, Kompatibilitätsstufe oder visuelle Ähnlichkeit sind kein Identitäts-, Trust-, Policy- oder Berechtigungsnachweis.

---

## 6. Getrennte Versionsachsen

Keine einzelne globale Zahl wie „PICO V6“ darf alle technischen Bedeutungen vermischen.

Implementiere und dokumentiere mindestens folgende getrennte Achsen:

| Versionsachse | Bedeutung | Teil der Identität |
|---|---|---|
| `appearanceEnvelopeVersion` | Binärer Nachrichtenrahmen und Record-Codierung | nein, Transportvertrag |
| `compatibilityCoreVersion` | dauerhaft verständliche semantische Basisdarstellung | ja |
| `appearanceProfileVersion` | vollständige Parameterstruktur | ja |
| `coreModelVersion` | autorisierter Character Core und Mount-/Materialzonen | ja |
| `generatorId` | konkrete Generatorfamilie | ja |
| `generatorVersion` | exakte visuelle Interpretation der Generatorparameter | ja |
| `animationSchemaVersion` | semantische Laufzeitgesten und Fallback-Intents | nein, Laufzeitzustand |
| `customAssetSchemaVersion` | Struktur externer Asset-Referenzen und Fallbacks | teilweise |
| `rendererVersion` | lokale Renderingimplementierung und Cache-Key | nein |
| `presentationTier` / `lod` | lokale Qualitätsentscheidung | nein |
| Pico-Link-/Protocol-Version | Übertragung und Capability Negotiation | nein, separater Protocol-Vertrag |

### 6.1 Versionsänderung erforderlich

Eine neue Version ist erforderlich, wenn sich für ein bisher gültiges Profil mindestens eines ändert:

- Binärbytes;
- Feldbedeutung;
- Wertebereich;
- Standardwert;
- Rundungsregel;
- Farbabbildung;
- erzeugte Geometrie;
- Materialzonenzuordnung;
- Mount Point;
- sichtbare Generatorausgabe;
- kanonische Vertex-/Indexreihenfolge;
- Compatibility-Core-Projektion;
- Fallback-Semantik.

### 6.2 Innerhalb derselben Version zulässig

- zusätzliche Tests;
- Dokumentationspräzisierungen ohne Bedeutungsänderung;
- Refactorings mit identischer kanonischer Ausgabe;
- bessere Fehlertexte ohne Änderung der Fehlerklasse;
- schnellere Implementierung ohne Outputänderung;
- Ablehnung von Daten, die nach der bestehenden Spezifikation bereits ungültig waren.

---

## 7. Kompatibilitätsmatrix

### 7.1 Offizielle PICO-Laufzeiten

| Empfänger | Profil | Verpflichtung |
|---|---|---|
| neuere offizielle Laufzeit | ältere offizielle Version | originalgetreue Darstellung |
| gleiche offizielle Laufzeit | gleiche Version | vollständige Darstellung |
| ältere offizielle Laufzeit | neuere offizielle Version | Compatibility-Core-Fallback |
| minimale Presence | beliebige neuere Version | generischer PICO plus stabile Basismerkmale |

### 7.2 Forks

Ein Fork darf intern einen anderen Renderer, eine andere Sprache, andere Datenstrukturen oder zusätzliche Generatoren verwenden.

Ein Fork darf nur dann eine Appearance-Kompatibilität behaupten, wenn er:

- die beanspruchte Envelope-Version vollständig liest und schreibt;
- die beanspruchte Compatibility-Core-Version semantisch korrekt interpretiert;
- jede ausdrücklich beanspruchte Profile-, Core- und Generatorversion originalgetreu implementiert;
- unbekannte optionale Extensions sicher ignoriert;
- unbekannte kritische Extensions ablehnt;
- keine bestehenden IDs oder Felder umdeutet;
- die zugehörigen Conformance Tests besteht;
- eigene Erweiterungen in einem eigenen Namespace führt.

Ein Fork muss nicht alle offiziellen historischen Generatoren unterstützen, sofern er diese Unterstützung nicht behauptet. Eine pauschale Aussage wie „voll PICO-kompatibel“ ist ohne präzise Surface-, Versions- und Testangabe unzulässig.

### 7.3 Bedeutung von „originalgetreu“

„Originalgetreu“ bedeutet nicht, dass jeder GPU-Treiber dieselben Pixel liefern muss. Verbindlich sind:

- dieselbe Character-Core-Version;
- dieselbe Generatorsemantik;
- dieselben Parameterwerte;
- dieselben Material- und Zonenentscheidungen;
- dieselbe Grundgeometrie beziehungsweise dieselben kanonisch quantisierten Geometriebuffer;
- dieselbe Haar-/Kopfmodulfamilie;
- dieselben Farben nach festgelegter Mapping- und Rundungsregel;
- dieselben Mount Points und Transformgrenzen;
- dieselbe Identity-Semantik.

Zulässige gerätespezifische Unterschiede:

- Mesh-LOD;
- Renderauflösung;
- Bildrate;
- Antialiasing;
- Schattenqualität;
- Bloom-Qualität;
- Anzahl simulierter Sekundärbewegungssegmente;
- statische statt dynamische Sekundärbewegung;
- statischer oder composite Tier statt realtime Tier.

Diese Unterschiede dürfen die Identität nicht verändern.

---

## 8. Datenmodell

### 8.1 Kanonisches Appearance-Dokument

Definiere ein logisches Dokumentmodell:

```ts
export interface PicoAppearanceDocumentV1 {
  readonly appearanceEnvelopeVersion: 1;
  readonly compatibilityCore: PicoAppearanceCompatibilityCoreV1;
  readonly canonicalProfile: PicoCanonicalAppearanceProfile;
  readonly customAssets: readonly PicoCustomAppearanceAssetReferenceV1[];
  readonly extensions: readonly PicoAppearanceExtensionV1[];
}
```

### 8.2 Vollständiges Profil

Das bestehende `PicoAppearanceProfileV1` aus dem Parametric-Appearance-Brief bleibt das erste vollständige Standardprofil.

Es beschreibt zunächst:

- Standardantenne oder genau ein prozedurales Kopfmodul;
- Shell-Oberfläche;
- dunklen Face-/Visier-Unterton;
- nichtleuchtenden Trim;
- keine Statusfarbe;
- keine Kleidung;
- keine Animation;
- keine Custom-Asset-Binärdaten.

Der bisher spezifizierte 18-/38-Byte-Payload darf nicht still umgebaut oder umgedeutet werden. Er wird als Payload des neuen Envelope verwendet.

### 8.3 Compatibility Core

Der Compatibility Core ist keine zweite vollständige Appearance. Er ist eine kleine, dauerhaft stabile semantische Projektion, die auch ein älterer Renderer interpretieren kann.

Implementiere `PicoAppearanceCompatibilityCoreV1` mindestens mit:

```ts
export interface PicoAppearanceCompatibilityCoreV1 {
  readonly compatibilityCoreVersion: 1;

  readonly shell: Readonly<{
    readonly hue: number;        // 0..359
    readonly chroma: number;     // 0..255, normierte Basissättigung
    readonly lightness: number;  // 0..255, normierte Basishelligkeit
  }>;

  readonly face: Readonly<{
    readonly hue: number;        // 0..359
    readonly blackLevel: number; // 0..255
  }>;

  readonly trim: Readonly<{
    readonly hue: number;        // 0..359
    readonly chroma: number;     // 0..255
  }>;

  readonly head: Readonly<{
    readonly kind: "standard_antenna" | "semantic_head_module";
    readonly family: PicoSemanticHeadFamilyV1;
    readonly primaryHue: number; // 0..359
    readonly length: number;     // 0..255, semantisch normiert
    readonly volume: number;     // 0..255, semantisch normiert
    readonly parting: number;    // int8 -127..127
  }>;

  readonly clothing: Readonly<{
    readonly kind: "none" | "standard" | "custom_fallback";
    readonly family: PicoSemanticClothingFamilyV1;
    readonly primaryHue: number;   // 0..359
    readonly secondaryHue: number; // 0..359
  }>;
}
```

### 8.4 Stabile semantische Kopfmodulfamilien

Definiere eine kleine, absichtlich grobe, dauerhaft stabile Enumeration:

```text
standard_antenna
short_cap
short_segmented
side_swept
top_structured
long_segmented
rear_ribbon
asymmetric
custom_fallback
```

Regeln:

- IDs werden nie wiederverwendet.
- Entfernte IDs bleiben reserviert.
- Neue konkrete Generatoren werden möglichst einer bestehenden Familie zugeordnet.
- Eine neue Familie wird nur ergänzt, wenn keine bestehende semantisch brauchbar ist.
- Die Familie ist ein Fallback, keine vollständige Generatorbeschreibung.

### 8.5 Stabile semantische Kleidungsfamilien

Definiere zunächst:

```text
none
basic_shell
standard_jacket
workwear
formal
protective
ceremonial
custom_fallback
```

Im aktuellen Profil wird `none` verwendet. Die Enumeration wird jetzt angelegt, damit spätere Custom-Kleidung auf alten Clients nicht ohne Fallback bleibt.

### 8.6 Deterministische Projektion

Implementiere:

```ts
export function projectAppearanceProfileV1ToCompatibilityCoreV1(
  profile: PicoAppearanceProfileV1,
): PicoAppearanceCompatibilityCoreV1;
```

Die Projektion muss:

- deterministisch sein;
- ausschließlich ganzzahlige Regeln verwenden;
- dokumentierte Grenzwerte besitzen;
- durch Golden-Vektoren fixiert sein;
- keine Renderer-, Geräte- oder Locale-Abhängigkeit haben;
- bei Standardantenne die stabile Antennenfamilie liefern;
- bei prozeduralem Kopfmodul anhand fester Parametergrenzen eine semantische Familie ableiten;
- für das aktuelle Profil Kleidung auf `none` setzen;
- nie Status- oder Context-Werte übernehmen.

Die konkreten Schwellen für die Familienableitung müssen im Protocol-/Governance-Dokument festgeschrieben und durch Tests eingefroren werden. Keine Heuristik nur im Code verstecken.

---

## 9. Kanonisches Appearance Envelope V1

Implementiere einen kleinen, längenpräfixierten Record-Container. Er muss zukünftige optionale Records überspringen können, ohne den Rest des Dokuments zu verlieren.

### 9.1 Gesamtheader, 8 Byte

| Byte | Inhalt |
|---:|---|
| 0 | Magic `0x50` (`P`) |
| 1 | Magic `0x41` (`A`) |
| 2 | `appearanceEnvelopeVersion`, exakt `1` |
| 3 | Envelope-Flags, in V1 exakt `0` |
| 4–5 | Gesamtlänge als `uint16` Big Endian, inklusive Header |
| 6–7 | Record-Anzahl als `uint16` Big Endian |

### 9.2 Record-Header, 6 Byte

| Byte relativ | Inhalt |
|---:|---|
| 0 | Record Type |
| 1 | Record Flags |
| 2–3 | Record Version als `uint16` Big Endian |
| 4–5 | Payload-Länge als `uint16` Big Endian |

Danach folgen exakt `Payload-Länge` Bytes.

### 9.3 Record Flags

```text
Bit 0: critical
Bit 1..7: in Envelope V1 reserviert und exakt 0
```

Unbekannter optionaler Record (`critical = 0`): sicher überspringen.  
Unbekannter kritischer Record (`critical = 1`): Dokument als unsupported ablehnen.

### 9.4 Record Types V1

| Typ | Name | Kardinalität | Critical |
|---:|---|---:|---:|
| `0x01` | Compatibility Core | exakt 1 | ja |
| `0x02` | Canonical Profile | exakt 1 | ja |
| `0x03` | Custom Asset Reference | 0..n | nein |
| `0x7f` | Namespaced Extension | 0..n | gemäß Extension-Flag |

Andere Typen sind reserviert.

### 9.5 Kanonische Reihenfolge

Beim Encoding:

1. Compatibility Core;
2. Canonical Profile;
3. Custom Asset References, nach kanonischem Asset-Key sortiert;
4. Extensions, lexikografisch nach Namespace, Name und Version sortiert.

Decoder akzeptieren Records in beliebiger Reihenfolge, Encoder erzeugen immer die kanonische Reihenfolge.

Doppelte Pflichtrecords werden abgelehnt.

### 9.6 Größenlimits

- maximale Gesamtlänge V1: `4096` Byte;
- maximale Record-Anzahl: `64`;
- maximale einzelne Extension-Payload: `1024` Byte;
- keine rekursive Record-Verschachtelung;
- keine Datei- oder Netzwerkzugriffe beim Parsen;
- keine großen Vorallokationen anhand untrusted Längen;
- jede Längenaddition overflow-sicher prüfen.

### 9.7 Canonical-Profile-Record

Payload:

| Feld | Typ |
|---|---|
| `profileFamilyId` | `uint16` Big Endian |
| `appearanceProfileVersion` | `uint16` Big Endian |
| `coreModelVersion` | `uint16` Big Endian |
| `payloadLength` | `uint16` Big Endian |
| `payload` | exakt `payloadLength` Byte |

Für das bestehende PAS-Profil:

```text
profileFamilyId = 1  // pico.parametric_appearance
appearanceProfileVersion = 1
payload = bestehender kanonischer 18-/38-Byte-Codec
```

`payloadLength` muss mit Record-Länge und tatsächlicher Länge übereinstimmen.

### 9.8 Compatibility-Core-Binärcodec

Definiere eine feste, dokumentierte V1-Codierung. Verwende ausschließlich Integer, Big Endian für `uint16` und Zweierkomplement für `int8`.

Empfohlene 24-Byte-Payload:

| Byte | Inhalt |
|---:|---|
| 0–1 | `shell.hue` |
| 2 | `shell.chroma` |
| 3 | `shell.lightness` |
| 4–5 | `face.hue` |
| 6 | `face.blackLevel` |
| 7–8 | `trim.hue` |
| 9 | `trim.chroma` |
| 10 | Head Kind ID |
| 11 | Semantic Head Family ID |
| 12–13 | `head.primaryHue` |
| 14 | `head.length` |
| 15 | `head.volume` |
| 16 | `head.parting` als `int8` |
| 17 | Clothing Kind ID |
| 18 | Semantic Clothing Family ID |
| 19–20 | `clothing.primaryHue` |
| 21–22 | `clothing.secondaryHue` |
| 23 | reserviert, exakt `0` |

Die Record-Version ist `1`; sie steht im Record-Header und nicht nochmals im Payload.

### 9.9 Textrepräsentation

Definiere eine kanonische Debug-/Transportdarstellung:

```text
pad1_<base64url-ohne-padding>
```

- `pad1` steht für PICO Appearance Document Envelope V1.
- Decoder akzeptieren nur diese Schreibweise.
- keine alternativen Padding- oder Groß-/Kleinschreibweisen;
- Encode → Decode → Encode muss byteidentisch sein.

Das bestehende reine Profilformat `pa1_...` bleibt für den isolierten `PicoAppearanceProfileV1`-Payload erhalten. Es ist nicht mit dem vollständigen Appearance-Dokument zu verwechseln.

---

## 10. Namespaced Extensions

Implementiere eine V1-Struktur für Namespaced Extensions:

```ts
export interface PicoAppearanceExtensionV1 {
  readonly namespace: string;
  readonly name: string;
  readonly version: number;
  readonly critical: boolean;
  readonly payload: Uint8Array;
}
```

Regeln:

- Namespace und Name sind lowercase ASCII.
- Erlaubtes Muster: `[a-z0-9][a-z0-9.-]{0,62}`.
- Offizielle Namespaces beginnen mit `pico.`.
- Forks verwenden eine eigene kontrollierte Domain oder einen eindeutigen Projektnamespace, beispielsweise `example.fork.`.
- Extensions dürfen keine Core-Felder umdeuten.
- Optionale unbekannte Extensions sind ignorierbar.
- Kritische Extensions müssen vor vollständiger Darstellung verstanden werden.
- Eine kritische Extension darf nicht verwendet werden, um den verpflichtenden Compatibility Core zu umgehen.
- Extension-Payloads werden kanonisch als opaque Bytes gespeichert; ihre eigene Semantik benötigt eine eigene Version.

Beispiel-Capabilities:

```text
pico.appearance.document.v1
pico.appearance.compatibility-core.v1
pico.appearance.profile.parametric.v1
pico.appearance.head-generator.v2
pico.appearance.custom-asset-reference.v1
example.fork.crystal-head-module.v1
```

---

## 11. Custom Assets

Custom Assets sind optionale Ergänzungen, keine Ersatzidentität.

Implementiere zunächst nur Referenz- und Fallbacktypen, nicht Download oder Binärspeicherung.

```ts
export interface PicoCustomAppearanceAssetReferenceV1 {
  readonly customAssetSchemaVersion: 1;
  readonly kind: "custom_clothing";
  readonly sha256: Uint8Array; // exakt 32 Byte
  readonly mediaType: "image/png" | "image/webp";
  readonly fallback: Readonly<{
    readonly clothingFamily: PicoSemanticClothingFamilyV1;
    readonly primaryHue: number;
    readonly secondaryHue: number;
  }>;
}
```

Regeln:

- kein URL-Feld im kanonischen Identitätsrecord;
- keine eingebetteten Bilddaten im Appearance-Dokument;
- Asset über SHA-256 adressieren;
- fehlendes Asset verwendet immer den Fallback;
- ungültiges Asset überschreibt das Profil nicht;
- ein Gerät darf den Download aus Ressourcen-, Privacy- oder Policy-Gründen verweigern;
- Compatibility Core enthält bereits den visuellen Kleidungsfallback;
- ein Custom Asset darf Character Core, Visier, Statuslichtgruppe oder Rig nicht ersetzen.

---

## 12. Historische Generatoren und exakte Rückwärtsdarstellung

### 12.1 Offizielle Generator-Registry

Lege eine maschinenlesbare Registry an, beispielsweise:

```text
docs/design-system/07_Governance/official-appearance-generators.json
```

Sie enthält mindestens:

- Generator-ID;
- Generatorversion;
- zugehörige Appearance-Profile-Version;
- erforderliche Core-Model-Version;
- Status `proposed`, `approved`, `deprecated` oder `withdrawn`;
- Spezifikationspfad;
- Testvektorpfad;
- Hash der normativen Spezifikation beziehungsweise Fixtures;
- früheste Release-Version;
- Supportstatus;
- erlaubte Parameterdomäne;
- Fallback-Projektionsversion.

Die Registry ist keine Character-Freigabe. Im aktuellen Milestone bleiben grafische Generatoren `proposed`, solange keine Character-Freigabe existiert.

### 12.2 Immutability

Ein veröffentlichter und freigegebener Generator wird nicht nachträglich verändert.

Ändert eine Fehlerkorrektur das sichtbare oder kanonisch geometrische Ergebnis, entsteht eine neue Generatorversion.

### 12.3 Neue offizielle Laufzeiten

Jede neue offizielle Laufzeit muss:

- alle früher veröffentlichten offiziellen Profile decodieren;
- alle früher veröffentlichten offiziellen Generatoren ausführen oder verifiziert reimplementieren;
- deren Core-Versionen laden beziehungsweise kompatibel reproduzieren;
- deren Golden-Vektoren bestehen;
- deren Identity-Semantik beibehalten.

Ein älterer Generator darf intern durch eine neue Implementierung ersetzt werden, wenn die Gleichwertigkeit durch die normativen Vektoren nachgewiesen ist.

Nicht zulässig:

```text
V4-Generator nicht mehr verfügbar
→ V4-Profil ungefähr mit V6-Generator darstellen
```

Zulässig:

```text
V4-Implementierung technisch ersetzt
→ neue Implementierung reproduziert V4-Ausgabe innerhalb der festgelegten Toleranz
```

### 12.4 Keine Kettenmigration

Ein V2-Profil wird in einer V6-Laufzeit anhand seiner V2-Spezifikation dargestellt, nicht durch eine verlustreiche Kette:

```text
V2 → V3 → V4 → V5 → V6
```

Explizite Benutzer-Migrationen dürfen angeboten werden, müssen aber:

- das Originalprofil erhalten;
- Quell- und Zielversion speichern;
- Migrationsalgorithmus und Version speichern;
- nachvollziehbar und reversibel sein, soweit kein Custom Asset oder anderer Verlust vorliegt;
- nie still durch ein Softwareupdate erfolgen.

---

## 13. Presentation Quality und Ressourcenanpassung

Die dynamische Qualitätssteuerung ist nicht Teil der Appearance-Identität.

Dokumentiere für spätere Renderer:

```text
Appearance Identity
→ Semantic Runtime State
→ Presentation Budget Controller
→ Static / Composite / Realtime Tier
→ LOD, FPS, Effects, Secondary Motion
```

Ein Gerät darf abhängig von Leistung und freien Ressourcen reduzieren:

1. Schatten und Post-Processing;
2. Sekundärbewegung von Haaren, Antenne und Modulen;
3. Simulationsfrequenz;
4. Mesh-LOD und Renderauflösung;
5. Bildrate;
6. Realtime auf Composite oder Static Tier.

Es darf bei unterstützter Profilversion nicht reduzieren:

- Haar-/Kopfmodulfamilie;
- Grundfarben;
- Core-Proportionen;
- Mount Points;
- Kleidungsfamilie;
- Identitätsmodule;
- semantische Geste oder Emotion ohne passenden Fallback.

Beispiel:

```text
V6-Gerät versteht ein V4-Profil vollständig,
hat aber wenig GPU-Reserve:

zulässig: V4-Profil mit V4-Design in LOD2 und ohne Haarphysik;
nicht zulässig: V4-Haar durch eine einfachere andere Frisur ersetzen.
```

---

## 14. Animation und Laufzeitzustand

Noch keinen Animationsrenderer implementieren. ADR und Protocol-Vertrag müssen die Trennung jedoch vorbereiten.

Dauerhafte Appearance enthält nicht:

- Blickrichtung;
- Blinzeln;
- aktuelle Mundform;
- Emotion;
- Kopfrotation;
- Armstellung;
- aktuelle Geste;
- Statusfarbe.

Spätere Animationen verwenden semantische Intents und Fallbacks, beispielsweise:

```ts
export interface PicoAnimationIntentV1 {
  readonly animationSchemaVersion: 1;
  readonly intent:
    | "idle"
    | "listen"
    | "speak"
    | "greet"
    | "confirm"
    | "decline"
    | "warn"
    | "explain"
    | "point"
    | "think"
    | "celebrate"
    | "comfort";
  readonly preferredClip?: string;
  readonly fallbackIntent: string;
  readonly intensity: number;
}
```

Ein alter Client muss eine unbekannte konkrete Animation auf einen bekannten semantischen Intent reduzieren können. Diese Laufzeitfläche ist in diesem Milestone nur zu dokumentieren, nicht produktiv zu implementieren.

---

## 15. Konkrete Anpassung von ADR 0025

Erweitere `docs/architecture/0025-inter-pico-communication-compatibility.md` präzise und minimal. Die bestehende Entscheidung bleibt erhalten.

### 15.1 Context ergänzen

Appearance-Profile, Animation Intents und Custom-Asset-Fallbacks als weitere Fälle nennen, bei denen ein kompatibler Fork oder eine neue offizielle Version nicht still dieselbe Wire-Semantik anders interpretieren darf.

### 15.2 Compatibility Surfaces ergänzen

Die Tabelle erhält eine zusätzliche Zeile:

| Surface | Meaning | Compatibility requirement |
|---|---|---|
| PICO Appearance / Presentation Profile | Austausch dauerhafter parametrischer Appearance-Identität und semantischer Fallbacks | gleiche Envelope-, Profile-, Compatibility-Core- und Generatorsemantik für die ausdrücklich beanspruchten Versionen |

Klarstellen:

- Appearance-Kompatibilität ist von Pico Link und Pico Home Link getrennt testbar.
- Ein Projekt kann beispielsweise Appearance Core v1 unterstützen, ohne Pico Home Link zu implementieren.
- Die allgemeinen L0–L5-Claim-Stufen bleiben bestehen.

### 15.3 Core Design Rule ergänzen

Normative Ergänzung:

> A modified implementation may render differently internally. If it claims compatibility with a published PICO appearance profile, core model or generator version, it must preserve that version's canonical identity semantics and compatibility fallback behaviour.

### 15.4 Compatibility Requirements ergänzen

Ein kompatibler Appearance-Implementierer muss:

- Pflichtrecords erhalten;
- bekannte Versionen exakt interpretieren;
- Compatibility Core korrekt erzeugen und lesen;
- unbekannte optionale Records überspringen;
- unbekannte kritische Records ablehnen;
- keine Generator-ID wiederverwenden;
- keine Parameterbedeutung ändern;
- Custom-Asset-Fallbacks erhalten;
- Presentation Quality nicht mit Identität verwechseln;
- keine visuelle Ähnlichkeit als Identity- oder Trust-Nachweis behandeln.

### 15.5 Breaking Changes ergänzen

Zusätzliche Beispiele:

- Änderung der Bedeutung eines Appearance-Parameters;
- Änderung der Compatibility-Core-Projektion;
- Änderung der semantischen Familie unter derselben ID;
- Änderung der kanonischen Farb- oder Rundungsregeln;
- Änderung eines freigegebenen Generators unter derselben Version;
- Entfernung historischer offizieller Generatorunterstützung aus einer neuen offiziellen Laufzeit;
- Custom Asset ohne bisherigen Fallback plötzlich verpflichtend machen;
- unbekannte optionale Erweiterung plötzlich als Pflicht behandeln.

### 15.6 Extensions ergänzen

Appearance-Erweiterungen müssen:

- namespaced;
- versioniert;
- längenpräfixiert;
- capability-advertised;
- optional oder ausdrücklich kritisch;
- bei optionalem unbekanntem Typ sicher ignorierbar sein.

Fork-Beispiel ergänzen:

```json
{
  "capabilities": {
    "pico.appearance.document.v1": true,
    "pico.appearance.compatibility-core.v1": true,
    "pico.appearance.profile.parametric.v1": true,
    "example.fork.crystal-head-module.v1": true
  }
}
```

### 15.7 Conformance Tests ergänzen

Appearance-Conformance muss künftig prüfen:

- kanonischen Encode-/Decode-Roundtrip;
- Compatibility-Core-Projektion;
- unbekannte optionale Records;
- unbekannte kritische Records;
- doppelte Pflichtrecords;
- historische offizielle Profile;
- Generator-Golden-Vektoren;
- Custom-Asset-Fallbacks;
- Capability-Claims;
- Downgrade auf Compatibility Core;
- Trennung von Identität und Presentation Tier.

### 15.8 Communication versus Implementation präzisieren

„different rendering“ bleibt intern erlaubt, aber mit folgender Grenze:

- ohne Appearance-Claim darf ein Fork frei gestalten;
- mit Compatibility-Core-Claim muss der semantische Fallback stimmen;
- mit konkretem Generator-Claim muss die kanonische Identität dieser Generatorversion stimmen;
- unterschiedliche Shader, LODs und Renderingtechnologien sind erlaubt, solange die beanspruchte Designidentität erhalten bleibt.

### 15.9 Interaction with other ADRs ergänzen

ADR 0124 und den neuen ADR 0125 aufnehmen.

### 15.10 Non-goals präzisieren

ADR 0025 definiert nicht den konkreten Appearance-Binärcodec oder die Parameterdomänen. Diese liegen in ADR 0125 und der Protocol-Spezifikation.

---

## 16. Anpassung von `compatibility-levels.md`

Keine neuen allgemeinen Level einführen.

Ergänze einen Abschnitt **Compatibility surfaces and claim qualifiers**:

- L0–L5 beschreiben weiterhin den Vertrauens-/Prüfgrad einer Kompatibilitätsbehauptung.
- Der Claim muss zusätzlich die konkrete Surface und Version nennen.
- Appearance ist eine eigene Claim-Surface.
- Ein L4-Claim für Appearance setzt die veröffentlichten Appearance-Conformance Tests voraus.
- Ein L5-Claim bleibt ausdrücklich an Anerkennung durch den Rechteinhaber gebunden.

Beispiele:

```text
Experimental L1 support for PICO Appearance Compatibility Core v1.

L4 conformance-tested PICO Appearance Document v1 and
Parametric Appearance Profile v1 support; Head Generator v2 supported.

PICO-derived custom renderer with no PICO appearance compatibility claim.
```

Unzulässig ohne Nachweis:

```text
Fully PICO-compatible appearance renderer.

Supports every PICO design.
```

Keine Appearance-Fidelity-Skala als Ersatz für L0–L5 einführen. Falls ein diagnostischer Fidelity-Begriff dokumentiert wird, darf er nur das Ergebnis eines einzelnen Renderings beschreiben und keinen Compatibility Claim ersetzen.

---

## 17. Neuer ADR 0125

Erstelle:

```text
docs/architecture/0125-parametric-appearance-and-version-compatibility.md
```

Status zunächst:

```text
Proposed
```

Der ADR muss mindestens enthalten:

1. Context: Warum Parameter statt Sprites/Assets.
2. Scope und Non-goals.
3. Beziehung zu ADR 0025 und ADR 0124.
4. Trennung von authored core, appearance identity, runtime state und presentation quality.
5. Getrennte Versionsachsen.
6. Appearance Envelope V1.
7. Compatibility Core V1.
8. Offizielle kumulative Rückwärtskompatibilität.
9. Vorwärtskompatibilität alter Clients über semantische Fallbacks.
10. Fork-Claims und Namespaces.
11. Historische Generator-Registry und Immutability.
12. Keine stillen Migrationen.
13. Custom Assets mit parametrischem Fallback.
14. Capability Negotiation.
15. Conformance und Golden References.
16. Security- und Resource-Grenzen des Parsers.
17. Konsequenzen und offene Fragen.
18. Gates für spätere Renderer-, Sync- und Character-Arbeit.

Der ADR darf keine grafische Freigabe behaupten.

---

## 18. Protocol-Dokumentation

Erstelle eine ausführbare Spezifikation:

```text
docs/protocol/appearance-document-v1.md
```

Sie enthält:

- exaktes Envelope-Layout;
- Record-Typen;
- Flags;
- Canonical Ordering;
- Größenlimits;
- Compatibility-Core-Layout;
- Canonical-Profile-Record;
- Extension-Regeln;
- Custom-Asset-Referenz;
- Fehlerklassen;
- Capability-Namen;
- Beispiele;
- Golden-Vector-Verweise;
- Claim-Regeln;
- Versionierungsregeln.

Aktualisiere außerdem:

```text
docs/protocol/public-surfaces.md
docs/protocol/compatibility-levels.md
docs/architecture/implementation-status.md
```

`public-surfaces.md` muss ehrlich festhalten, dass die Appearance-Dokumentfläche nach diesem Milestone nur als Package-/Codec-Vertrag implementiert ist und noch nicht als Pico-Link-Runtimefläche synchronisiert wird.

---

## 19. Vorhandenen Appearance-Brief aktualisieren

Aktualisiere:

```text
docs/development/briefs/parametric-appearance-system.md
```

Mindestens:

- Dokumentversion erhöhen;
- ADR-Titel und ADR-Pfad auf den neuen ADR 0125 abstimmen;
- diesen Versions- und Kompatibilitätsvertrag integrieren;
- die Aussage „später nur 18 oder 38 Byte plus äußere Protokollversion übertragen“ ersetzen;
- klarstellen, dass 18/38 Byte der vollständige Profilpayload sind, während das portable Appearance-Dokument zusätzlich Compatibility Core und Envelope enthält;
- bisherigen `pa1_...`-Codec als isoliertes Profilformat erhalten;
- neues `pad1_...`-Dokumentformat ergänzen;
- Milestone A/B um ADR-0025-, Protocol- und Conformance-Arbeit erweitern;
- keine grafische Generatorfreigabe vorziehen;
- keine Kleidung in `PicoAppearanceProfileV1` hineinbrechen; Kleidung bleibt vorerst Compatibility-/Custom-Asset-Fallbackfläche;
- keine bestehenden Bytepositionen des 18-/38-Byte-Profils umdeuten.

---

## 20. Package-Implementierung

### 20.1 Neues Package

Erstelle:

```text
packages/appearance/
```

Name:

```json
{
  "name": "@pico/appearance"
}
```

Keine Runtime-Abhängigkeiten, sofern nicht bereits eine kleine, repositoryweit akzeptierte Standarddependency zwingend nötig ist. Bevorzuge eigenständige TypeScript-Implementierung.

### 20.2 Empfohlene Struktur

```text
packages/appearance/
  package.json
  tsconfig.json
  src/
    index.ts
    appearance-errors.ts
    appearance-profile-v1.ts
    appearance-profile-v1-codec.ts
    appearance-profile-v1-validation.ts
    compatibility-core-v1.ts
    compatibility-core-v1-codec.ts
    compatibility-projection-v1.ts
    appearance-document-v1.ts
    appearance-document-v1-codec.ts
    appearance-document-v1-validation.ts
    appearance-extension-v1.ts
    custom-asset-reference-v1.ts
    official-generator-registry.ts
    appearance-cache-key-v1.ts
    *.test.ts
```

### 20.3 Öffentliche API

Mindestens:

```ts
export function validateAppearanceProfileV1(input: unknown): PicoAppearanceProfileV1;
export function encodeAppearanceProfileV1(profile: PicoAppearanceProfileV1): Uint8Array;
export function decodeAppearanceProfileV1(bytes: Uint8Array): PicoAppearanceProfileV1;
export function formatAppearanceProfileV1(profile: PicoAppearanceProfileV1): string;
export function parseAppearanceProfileV1(value: string): PicoAppearanceProfileV1;

export function projectAppearanceProfileV1ToCompatibilityCoreV1(
  profile: PicoAppearanceProfileV1,
): PicoAppearanceCompatibilityCoreV1;

export function validateAppearanceDocumentV1(input: unknown): PicoAppearanceDocumentV1;
export function encodeAppearanceDocumentV1(document: PicoAppearanceDocumentV1): Uint8Array;
export function decodeAppearanceDocumentV1(bytes: Uint8Array): PicoAppearanceDocumentV1;
export function formatAppearanceDocumentV1(document: PicoAppearanceDocumentV1): string;
export function parseAppearanceDocumentV1(value: string): PicoAppearanceDocumentV1;

export function createAppearanceDocumentV1(
  profile: PicoAppearanceProfileV1,
  options?: Readonly<{
    coreModelVersion?: number;
    customAssets?: readonly PicoCustomAppearanceAssetReferenceV1[];
    extensions?: readonly PicoAppearanceExtensionV1[];
  }>,
): PicoAppearanceDocumentV1;
```

### 20.4 Fehlerklassen

Stabile, typisierte Fehlercodes, mindestens:

```text
invalid_type
invalid_shape
invalid_integer
value_out_of_range
unsupported_profile_version
unsupported_envelope_version
unsupported_compatibility_core_version
unsupported_critical_record
invalid_magic
invalid_length
size_limit_exceeded
duplicate_required_record
missing_required_record
invalid_record_flags
invalid_record_ordering
invalid_namespace
invalid_custom_asset_reference
compatibility_core_mismatch
```

Fehlermeldungen dürfen keine kompletten fremden Rohbytes oder Custom-Asset-Inhalte protokollieren.

### 20.5 Compatibility-Core-Mismatch

Beim Erzeugen eines Dokuments wird der Compatibility Core immer aus dem vollständigen Profil berechnet.

Beim Decodieren eines fremden Dokuments muss geprüft werden, ob der enthaltene Compatibility Core der normativen Projektion entspricht, sofern die vollständige Profilversion lokal verstanden wird.

Bei Abweichung:

- Dokument als inkonsistent ablehnen;
- nicht still einen der beiden Werte bevorzugen;
- eigener Fehler `compatibility_core_mismatch`;
- keine Profilbytes verändern.

Wenn die vollständige Profilversion unbekannt ist, darf der alte Client den Compatibility Core verwenden, ohne dessen Projektion gegen den unbekannten Payload nachrechnen zu können.

---

## 21. Protocol-Package

Ergänze `@pico/protocol` nur um stabile Capability-/Claim-Typen und Konstanten. Keine echte Netzwerkübertragung in diesem Milestone.

Beispiel:

```ts
export const picoAppearanceCapabilities = {
  documentV1: "pico.appearance.document.v1",
  compatibilityCoreV1: "pico.appearance.compatibility-core.v1",
  parametricProfileV1: "pico.appearance.profile.parametric.v1",
  headGeneratorV2: "pico.appearance.head-generator.v2",
  customAssetReferenceV1: "pico.appearance.custom-asset-reference.v1",
} as const;
```

Definiere Capability-Validierung so, dass unbekannte namespaced Capabilities erhalten oder sicher ignoriert werden können, ohne Kernsemantik umzudeuten.

Keine bestehende Foundation-Event-Semantik und insbesondere `avatar.state_changed` in diesem Milestone erweitern. Appearance-Identität ist nicht dasselbe wie der derzeitige Avatar-Laufzeitzustand.

---

## 22. Testvektoren und Fixtures

### 22.1 Governance-Vektoren

Erstelle oder erweitere:

```text
docs/design-system/07_Governance/parametric-appearance-v1-vectors.json
```

Zusätzlich:

```text
docs/protocol/fixtures/appearance-document/v1/
```

### 22.2 Positive Fälle

Mindestens:

1. Standardantenne, neutrales Surface-Profil.
2. Prozedurales Kopfmodul mit mittlerem Scheitel.
3. Prozedurales langes Kopfmodul.
4. Dokument mit Custom-Asset-Referenz und Fallback.
5. Dokument mit unbekannter optionaler Fork-Extension.
6. Records in nichtkanonischer Eingabereihenfolge, danach kanonischer Re-Encode.
7. Compatibility-Core-Projektion jeder relevanten semantischen Familie.
8. Profile-Textformat `pa1_...`.
9. Dokument-Textformat `pad1_...`.

### 22.3 Negative Fälle

Mindestens:

1. falsche Magic;
2. unbekannte Envelope-Version;
3. ungültige Gesamtlänge;
4. Record-Länge über Dateiende;
5. mehr als 4096 Byte;
6. mehr als 64 Records;
7. doppelter Compatibility Core;
8. doppeltes Canonical Profile;
9. fehlender Compatibility Core;
10. fehlendes Canonical Profile;
11. unbekannter kritischer Record;
12. unbekannter optionaler Record wird nicht fälschlich abgelehnt;
13. reservierte Flags gesetzt;
14. ungültige Namespace-Zeichen;
15. Extension-Payload über Limit;
16. Compatibility Core stimmt nicht mit bekanntem Profil überein;
17. Custom Asset ohne Fallback;
18. falsche SHA-256-Länge;
19. unbekannte ID wird nicht als bekannte Familie interpretiert;
20. numerische Strings oder Fließkommazahlen in JSON;
21. nichtkanonisches Base64url;
22. Profilversion und Payload-Länge widersprechen sich.

### 22.4 Property- und Robustheitstests

- deterministische Schleifentests mit festem Test-PRNG, falls keine bestehende Property-Test-Bibliothek vorhanden ist;
- zufällige Bytearrays von 0 bis mindestens 8192 Byte terminieren kontrolliert;
- keine großen Allokationen aus untrusted Längen;
- keine Rekursion;
- Eingabe-`Uint8Array` wird nicht mutiert;
- Encode → Decode → Encode ist byteidentisch;
- Projektion ist deterministisch;
- gleiche Profile erzeugen gleiche Dokumentbytes;
- unbekannte optionale Extensions überleben einen Decode-/Encode-Roundtrip byteidentisch, sofern der Vertrag Roundtrip-Preservation vorsieht;
- kanonische Ausgabe sortiert Records deterministisch.

### 22.5 Historische Versionsfixtures

Aktuell keine erfundene veröffentlichte V0- oder Generator-V1-Runtime implementieren, wenn diese nie veröffentlicht wurde.

Die Infrastruktur muss aber so gestaltet sein, dass ab der ersten veröffentlichten Version deren Fixtures dauerhaft erhalten bleiben. Dokumentiere diese Regel und pinne die jetzt entstehenden V1-/V2-Vektoren als erste historische Basis.

---

## 23. Conformance-Claims

Definiere keine pauschale Boolesche Funktion `isPicoCompatible()`.

Ein Claim braucht mindestens:

```ts
export interface PicoAppearanceCompatibilityClaimV1 {
  readonly surface: "pico.appearance";
  readonly appearanceEnvelopeVersions: readonly number[];
  readonly compatibilityCoreVersions: readonly number[];
  readonly profileVersions: readonly Readonly<{
    readonly familyId: number;
    readonly version: number;
  }>[];
  readonly generatorVersions: readonly Readonly<{
    readonly generatorId: string;
    readonly version: number;
  }>[];
  readonly conformanceLevel: "experimental" | "tested" | "official";
}
```

Dies ist zunächst ein Dokumentations-/Typvertrag. Eine offizielle Zertifizierungslogik wird nicht vorgetäuscht.

Claims müssen konkrete Surfaces und Versionen nennen.

---

## 24. Sicherheits- und Robustheitsregeln

- Alle externen Appearance-Daten sind untrusted.
- Harte Größen- und Record-Limits vor Allokation prüfen.
- Keine URLs automatisch laden.
- Keine Shader, Skripte oder ausführbaren Payloads in Extensions oder Assets.
- Keine Dateipfade aus fremden Profilen verwenden.
- Keine JSON-Prototypvererbung oder unbekannte Keys akzeptieren.
- Keine stillen Clamps bei Identitätsparametern.
- Keine Floating-Point-Werte im kanonischen Profil.
- Keine geräteabhängige Zufallsquelle.
- Keine Zeit, Geräte-ID oder Plattformdaten in die Designidentität einmischen.
- Keine GPU-generierte Topologie als kanonische Quelle.
- Kein Custom Asset erhält Authority, Policy- oder Trust-Bedeutung.
- Ein Compatibility Core ist ein Darstellungsfallback, kein kryptografischer Identitätsnachweis.

---

## 25. Repository-Nachzüge

Prüfe und aktualisiere, soweit für ein neues Workspace-Package erforderlich:

- `pnpm-workspace.yaml`;
- Root-`package.json` nur falls nötig;
- `pnpm-lock.yaml`;
- `scripts/check-version.mjs`;
- TypeScript-Projektkonfiguration;
- Release-/Build-Pipeline;
- `docs/architecture/implementation-status.md`;
- `.agent-context.md`.

Keine unverbundenen Änderungen vornehmen.

---

## 26. Ehrliche Implementierungsstatus-Aussage

Nach diesem Milestone darf behauptet werden:

- Appearance-Dokument V1 ist spezifiziert;
- Compatibility Core V1 ist spezifiziert und codecseitig implementiert;
- Parametric Appearance Profile V1 besitzt einen kanonischen Codec;
- die Projektion Profile V1 → Compatibility Core V1 ist implementiert;
- optionale und kritische Extensions werden korrekt behandelt;
- Capability-Namen und Claim-Struktur sind definiert;
- Conformance Fixtures für den Codec existieren.

Noch nicht behaupten:

- dass Picos Appearance-Profile bereits über Pico Link synchronisieren;
- dass Companion oder Web ein vollständiges PICO rendern;
- dass V6 heute einen realen V4-Character pixel- oder geometriegenau rendert;
- dass ein Generator Character-approved ist;
- dass Custom Assets übertragen werden;
- dass Animation Intent produktiv implementiert ist;
- dass ein Fork offiziell kompatibel zertifiziert werden kann.

---

## 27. Abnahmekriterien

Der Milestone ist abgeschlossen, wenn:

1. ADR 0025 Appearance als eigene Kompatibilitätsfläche enthält.
2. ADR 0125 vollständig und widerspruchsfrei erstellt wurde.
3. `compatibility-levels.md` konkrete Surface-/Versionsclaims verlangt, ohne neue L-Stufen einzuführen.
4. `public-surfaces.md` den ehrlichen Implementierungsstand enthält.
5. Der bestehende Parametric-Appearance-Brief auf das Envelope-/Compatibility-Core-Modell aktualisiert wurde.
6. `@pico/appearance` als Workspace-Package existiert.
7. Der bestehende 18-/38-Byte-Profilcodec erhalten und getestet ist.
8. Appearance Document V1 als kanonischer Record-Container implementiert ist.
9. Compatibility Core V1 exakt codiert, decodiert und validiert wird.
10. Profile V1 deterministisch auf Compatibility Core V1 projiziert wird.
11. Bekannte Profile mit abweichendem Compatibility Core abgelehnt werden.
12. Unbekannte optionale Records sicher übersprungen werden.
13. Unbekannte kritische Records kontrolliert abgelehnt werden.
14. Custom-Asset-Referenzen immer einen Fallback besitzen.
15. Keine Bilder, Texturen oder Meshes in den Standardprofilbytes gespeichert werden.
16. Keine Status-, Runtime- oder Presentation-Quality-Werte Teil der Appearance-Identität sind.
17. Offizielle historische Generatorunterstützung normativ festgeschrieben ist.
18. Fork-Claims konkrete Surface- und Versionsangaben verlangen.
19. Positive, negative und Robustheitsfixtures vollständig bestehen.
20. Keine neue Runtime-Abhängigkeit in `apps/web` entstanden ist.
21. `git diff --check` erfolgreich ist.
22. fokussierte Package-Tests erfolgreich sind.
23. `release:verify` erfolgreich ist.
24. ein lokaler repräsentativer Commit existiert.
25. `.agent-context.md` knapp aktualisiert wurde.
26. Abschlussbericht konkreten Stoppgrund und nächsten Einstiegspunkt nennt.

---

## 28. Verifikation

Fokussiert:

```bash
npx pnpm@9.0.0 --filter @pico/appearance check
npx pnpm@9.0.0 --filter @pico/appearance test
npx pnpm@9.0.0 --filter @pico/appearance build
npx pnpm@9.0.0 --filter @pico/protocol check
npx pnpm@9.0.0 --filter @pico/protocol test
npx pnpm@9.0.0 --filter @pico/protocol build
```

Dokument-/Strukturprüfung:

```bash
git diff --check
```

Vollständig:

```bash
npx pnpm@9.0.0 release:verify
```

Falls `.agent-context.md` einen speziellen Node-PATH oder pnpm-Store vorgibt, exakt diesen reproduzierbaren Aufruf verwenden.

---

## 29. Commit und Handoff

Empfohlene Commit-Message:

```text
feat(appearance): add versioned appearance compatibility contract
```

Nicht pushen, sofern der Nutzer dies nicht ausdrücklich beauftragt.

Der Abschlussbericht muss enthalten:

- geänderte Dateien;
- neue öffentliche Verträge;
- exakte Versionen und Capability-Namen;
- Test- und Gate-Ergebnisse;
- bestätigte Rückwärts-/Vorwärtskompatibilitätsregeln;
- ehrliche noch nicht implementierte Runtimeflächen;
- konkreten Stoppgrund;
- nächsten Block;
- dafür empfohlene Model-/Effort-Stufe.

Empfohlener nächster Block nach Abnahme:

```text
Deterministischer Geometriegenerator und historische Generator-Execution
unter Character-Governance, noch ohne Produkt-UI.
```

---

## 30. Zentrale Entscheidungszusammenfassung

> PICO Appearance ist ein versioniertes Zahlendokument, kein Sprite und kein vollständiges übertragenes Mesh.

> Das vollständige Profil beschreibt die exakte Appearance; der Compatibility Core beschreibt einen dauerhaft lesbaren semantischen Fallback.

> Eine neue offizielle PICO-Laufzeit stellt ältere offizielle Profile mit deren ursprünglicher Generator- und Core-Semantik dar.

> Ein alter Client darf neue Details verlieren, muss aber einen erkennbaren und semantisch passenden PICO darstellen können.

> Forks dürfen eigene Generatoren ergänzen. Sie dürfen nur für die Profile und Generatoren Kompatibilität behaupten, die sie nachweislich korrekt implementieren.

> Gerätequalität, LOD, FPS, Schatten und Sekundärbewegung sind Präsentationsentscheidungen und verändern nicht die PICO-Identität.

> Custom Assets sind optionale Zusätze und besitzen immer einen parametrischen Fallback.

> ADR 0025 bleibt die übergeordnete Kompatibilitätsregel; ADR 0125 konkretisiert diese Regel für Appearance.

---

## 31. Repository-Stand

- **2.1 (2026-08-02):** Arbeitsauftrag ins Repository uebernommen unter
  `docs/development/briefs/appearance-versioning-and-adr-0025.md`. Umgesetzt
  durch ADR 0125, `docs/protocol/appearance-document-v1.md`,
  `@pico/appearance`, die Capability-/Claim-Vertraege in `@pico/protocol`,
  die Governance-Vektoren samt Generator-Registry und die
  Conformance-Fixtures unter `docs/protocol/fixtures/appearance-document/v1/`.
