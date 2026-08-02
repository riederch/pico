# PICO Appearance-Versionierung – Review der eingearbeiteten Änderungen

**Status:** Review-Zusammenfassung  
**Gegenstand:** Umsetzung des parametrischen Appearance-Protokolls, ADR 0025-Anpassung und neue Versionierungsarchitektur

---

## 1. Gesamturteil

Die Änderungen sind umfangreich und größtenteils sauber umgesetzt.

Bereits vorhanden sind unter anderem:

- neues Package `@pico/appearance`;
- `pa1_`-Profilcodec;
- `pad1_`-Dokumenten-Envelope;
- `Compatibility Core V1`;
- deterministische Projektion;
- Custom-Asset-Referenzen;
- namespaced Extensions;
- Capability- und Claim-Verträge;
- Governance-Registry;
- Golden Vectors und Conformance Fixtures;
- Anpassung von ADR 0025;
- neuer ADR 0125.

Die Grundarchitektur ist überzeugend. Der Stand ist jedoch noch nicht vollständig abnahmefähig.

Es bestehen zwei konzeptionelle Blocker sowie mehrere technische Nacharbeiten.

---

## 2. Verifizierter Stand

Folgende Prüfungen wurden erfolgreich durchgeführt:

| Prüfung | Ergebnis |
|---|---|
| TypeScript-Kompilierung der produktiven Appearance-Dateien | bestanden |
| TypeScript-Kompilierung des Appearance-Protocol-Vertrags | bestanden |
| Golden- und Conformance-Vektoren | 209 Assertions bestanden |
| Versionskonsistenz | bestanden |
| Lizenzkonsistenz | bestanden |
| Add-on-Konfiguration | bestanden |
| Design-System-Check | bestanden |
| Companion-Boundary-Checks | bestanden |

Der vollständige `pnpm release:verify` konnte in der Prüfungsumgebung nicht erneut ausgeführt werden, da `pnpm`, die Dependencies und externer Registry-Zugriff fehlten.

Das Repository meldet selbst einen erfolgreichen Gate mit 759 Tests, davon 79 Appearance-Tests. Dieser Gesamtstand konnte nicht unabhängig reproduziert werden.

Das hochgeladene Archiv enthielt kein `.git`-Verzeichnis. Commit, Branch und Arbeitsbaum konnten daher nicht geprüft werden.

---

# 3. Blocker

## 3.1 Custom-Asset-Fallback fehlt im Compatibility Core

### Problem

Der `Compatibility Core` wird derzeit nur aus dem parametrischen Appearance-Profil berechnet.

Custom-Asset-Fallbacks werden dabei nicht berücksichtigt.

Dadurch kann beispielsweise ein Custom-Clothing-Asset einen Fallback wie diesen enthalten:

```json
{
  "clothingFamily": "workwear",
  "primaryHue": 30,
  "secondaryHue": 210
}
```

Der erzeugte Compatibility Core enthält trotzdem:

```json
{
  "clothing": {
    "kind": "none",
    "family": "none",
    "primaryHue": 0,
    "secondaryHue": 0
  }
}
```

### Auswirkung

Ein älterer Client zeigt einen PICO ohne Kleidung, obwohl ein definierter Kleidungsfallback vorhanden ist.

Damit ist die gewünschte Vorwärtskompatibilität für Custom-Kleidung nicht erfüllt.

### Erforderliche Korrektur

Die Projektion muss aus dem vollständigen Dokument erfolgen:

```text
Appearance-Profil
+ Custom Assets
+ deren Fallbacks
→ Compatibility Core
```

Für Custom-Kleidung sollte der Core beispielsweise enthalten:

```json
{
  "kind": "custom_fallback",
  "family": "workwear",
  "primaryHue": 30,
  "secondaryHue": 210
}
```

Zusätzlich sollte für V1 normativ festgelegt werden:

- maximal eine Custom-Clothing-Referenz;
- doppelte Custom-Clothing-Einträge ablehnen;
- Compatibility Core aus deren Fallback ableiten;
- Konsistenzprüfung auf Profil und Custom Assets erweitern;
- positive und negative Golden Vectors ergänzen.

### Hauptsächlich betroffene Dateien

- `packages/appearance/src/appearance-document-v1-validation.ts`
- `packages/appearance/src/compatibility-projection-v1.ts`
- `packages/appearance/src/custom-asset-reference-v1.ts`
- `docs/protocol/appearance-document-v1.md`

---

## 3.2 Langfristige Core-Kompatibilität ist nicht vollständig abgesichert

### Problem

Der aktuelle Decoder erwartet exakt:

```text
Compatibility Core Record
Version 1
```

Eine unbekannte Core-Version wird abgelehnt.

Außerdem lehnt `Compatibility Core V1` unbekannte Haar- und Kleidungsfamilien-IDs ab.

Wenn zukünftige Versionen neue IDs oder einen `Compatibility Core V2` verwenden, kann ein alter Client das Profil nicht mehr rudimentär darstellen.

### Erforderliche normative Regel

`Compatibility Core V1` muss dauerhaft als verpflichtender Legacy-Fallback erhalten bleiben.

Es sollte gelten:

1. Core-V1-Felder und IDs sind eingefroren.
2. Neue Generatoren müssen auf bestehende V1-Familien oder `custom_fallback` projizieren.
3. Neue semantische Familien dürfen nicht einfach durch neue Core-V1-IDs ergänzt werden.
4. Ein zukünftiger Core V2 darf Core V1 nicht ersetzen.
5. Jedes zukünftige offizielle Appearance-Dokument enthält weiterhin Core V1.
6. Reichhaltigere Compatibility-Daten werden als zusätzlicher optionaler Record oder Extension ergänzt.
7. Alte Clients lesen Core V1 und ignorieren neue Detailblöcke.

Zielmodell:

```text
Compatibility Core V1       dauerhaft verpflichtend
Compatibility Detail V2     optional
Canonical Profile V6        vollständige neue Darstellung
```

Nicht zulässig:

```text
Compatibility Core V2 ersetzt V1
```

### Betroffene Dokumente und Dateien

- `docs/architecture/0125-parametric-appearance-and-version-compatibility.md`
- `docs/protocol/appearance-document-v1.md`
- `packages/appearance/src/compatibility-core-v1.ts`

---

# 4. Weitere technische Nacharbeiten

## 4.1 Größenprüfung vor Base64url-Allokation

### Problem

Der Text wird vollständig Base64url-decodiert, bevor das Byte-Limit geprüft wird.

Sehr große fremde Eingaben können dadurch unnötig große Arrays und Speicherallokationen erzeugen.

### Korrektur

Vor dem Decoding muss anhand der Textlänge geprüft werden, ob die maximal erlaubte Binärgröße überschritten werden kann.

Das gilt für:

- `pad1_`;
- `pa1_`;
- alle zukünftigen textkodierten Appearance-Formate.

Betroffene Dateien:

- `packages/appearance/src/base64url.ts`
- `packages/appearance/src/appearance-document-v1-codec.ts`
- `packages/appearance/src/appearance-profile-v1-codec.ts`

---

## 4.2 Kritische namespaced Extensions sind nicht vollständig durchsetzbar

### Problem

Unbekannte kritische Top-Level-Records werden korrekt abgelehnt.

Bei namespaced Extensions kann der Transportdecoder jedoch nicht prüfen, ob die Anwendung eine als `critical` markierte Extension tatsächlich versteht.

### Korrektur

Es sollte eine nachgelagerte Prüfung geben, beispielsweise:

```ts
assertAppearanceDocumentRenderableV1(document, {
  supportedExtensions
});
```

Diese Prüfung muss:

- unbekannte optionale Extensions zulassen;
- unbekannte kritische Extensions ablehnen;
- bekannte kritische Extensions nur mit unterstützter Version akzeptieren.

---

## 4.3 Generator-ID ist im Profil nur implizit

### Problem

Die Dokumentation nennt:

```text
generatorId / generatorVersion
```

Im Profil wird jedoch nur `generatorVersion` übertragen.

Die Generator-ID ist derzeit durch Profiltyp, Head-Kind und Registry implizit.

### Korrektur

Entweder ausdrücklich dokumentieren:

> In Parametric Profile V1 ist die Generator-ID durch Profilfamilie, Head-Kind und Registry festgelegt.

Oder in einer späteren Profilversion eine explizite stabile Generator-ID einführen.

---

## 4.4 Cache-Key berücksichtigt nicht das vollständige Dokument

### Problem

Der aktuelle Cache-Key basiert nur auf:

```text
pa1 profile bytes
+ renderer version
+ LOD
```

Nicht berücksichtigt werden:

- `coreModelVersion`;
- Custom Assets;
- Custom-Asset-Hashes;
- Extensions;
- zukünftige Kleidung oder Module außerhalb Profile V1.

Dadurch können verschiedene PICOs denselben Cache-Key erhalten.

### Korrektur

Entweder den bestehenden Key klar als reinen Profilcache benennen:

```text
createParametricProfileCacheKeyV1
```

Oder zusätzlich einen Dokument-Cache-Key einführen:

```text
hash(canonical pad1 document bytes)
+ renderer version
+ LOD
```

---

## 4.5 Historische Fidelity-Vektoren prüfen noch keine Geometrie

### Aktueller Stand

Die bestehenden Vektoren prüfen zuverlässig:

- Profilbytes;
- Base64url;
- Projektion;
- Compatibility-Core-Bytes;
- Envelope;
- Fehlerfälle.

Noch nicht geprüft werden:

- generierte Vertices;
- Indizes;
- Mount Points;
- Materialzonen;
- Core-Artefakt;
- Referenzrender;
- visuelle Gleichheit alter Generatoren.

### Konsequenz

Die Aussage

> Ein zukünftiger V6-Renderer reproduziert den V4-Generator originalgetreu.

kann erst nach Einführung eines tatsächlichen Geometriegenerators technisch abgesichert werden.

Vor Freigabe des ersten Generators werden benötigt:

- kanonische Geometrieausgaben;
- Transform- und Mount-Point-Daten;
- Materialzonen;
- Core-Artefakt-Hashes;
- Referenzrender oder messbare Geometrievergleiche.

---

# 5. Positiv bewertete Architekturentscheidungen

Folgende Punkte sind bereits gut umgesetzt:

- Protokoll-, Profil-, Core- und Generatorversion sind getrennt.
- Runtime-Zustand und Präsentationsqualität sind nicht Teil der Identität.
- Das alte 18-/38-Byte-Format wurde nicht still verändert.
- Fremde Profilversionen können opaque erhalten bleiben.
- Bekannte Profile mit falschem Compatibility Core werden abgelehnt.
- IDs und Parameter werden strikt geprüft.
- Es gibt keine stillen Werte-Clamps.
- Records sind größenbegrenzt.
- Unbekannte optionale Top-Level-Records werden übersprungen.
- Unbekannte kritische Top-Level-Records werden abgelehnt.
- Custom Assets enthalten keine eingebetteten URLs oder Bilddaten.
- Capability-Namen werden nicht voreilig als Laufzeitfähigkeit advertised.
- ADR 0025 bleibt die übergeordnete Autorität für Kompatibilität und Forks.
- ADR 0125 behauptet keinen bereits vorhandenen Renderer oder Sync.
- Character Design v3.2.1 wurde nicht stillschweigend verändert.
- Der Generatorstatus bleibt korrekt `proposed`.

---

# 6. Abnahmeempfehlung

Der Stand sollte noch nicht endgültig abgenommen werden.

Vor einer Abnahme müssen mindestens diese beiden Blocker behoben werden:

1. Custom-Clothing-Fallback wird in den Compatibility Core übernommen.
2. Compatibility Core V1 wird normativ als dauerhaft verpflichtender Legacy-Fallback eingefroren.

Danach sind die wichtigsten technischen Härtungen:

3. Größenprüfung vor Base64url-Allokation.
4. Durchsetzung kritischer namespaced Extensions.
5. Klarstellung der impliziten Generator-ID.
6. vollständiger Dokument-Cache-Key.
7. spätere Geometrie- und Golden-Render-Vektoren.

---

# 7. Priorisierte Umsetzungsliste

## Muss vor Abnahme

- [ ] Custom-Asset-Fallbacks in Compatibility-Core-Projektion einbeziehen.
- [ ] Maximal eine Custom-Clothing-Referenz für V1 festlegen.
- [ ] Doppelte Custom-Clothing-Einträge validierungsseitig ablehnen.
- [ ] Core V1 dauerhaft verpflichtend und unveränderlich festschreiben.
- [ ] Sicherstellen, dass zukünftige Core-Versionen Core V1 nur ergänzen, nicht ersetzen.
- [ ] Golden Vectors für Custom-Clothing-Fallback ergänzen.

## Sollte kurzfristig folgen

- [ ] Textlängenlimit vor Base64url-Decoding prüfen.
- [ ] Renderability-Prüfung für kritische Extensions ergänzen.
- [ ] Generator-ID-Semantik dokumentieren.
- [ ] Dokumentbasierten Cache-Key ergänzen.
- [ ] Conformance-Dokumentation aktualisieren.

## Später mit dem ersten Generator

- [ ] Geometrie-Golden-Vectors einführen.
- [ ] Mount-Point- und Materialzonen-Vektoren pinnen.
- [ ] Referenzrender und visuelle Regressionstests ergänzen.
- [ ] Rückwärtskompatibilität älterer Generatoren über Golden References absichern.

---

## 8. Schlussbewertung

Die eingearbeitete Lösung ist eine sehr gute Grundlage für ein langfristig versionsstabiles, parametrisches PICO-Appearance-System.

Die wesentliche Architektur ist richtig:

```text
Parametersatz = Identität
lokale Darstellung = abgeleitetes Artefakt
```

Auch die übergeordnete Kompatibilitätsregel ist korrekt:

```text
Neue offizielle PICO-Version rendert ältere Profile originalgetreu.
Ältere PICO-Version rendert neuere Profile über einen stabilen Fallback.
```

Damit diese Garantie dauerhaft gilt, müssen der Custom-Asset-Fallback und die unveränderliche Rolle von Compatibility Core V1 noch verbindlich korrigiert werden.

---

## 9. Repository-Stand

- **2026-08-02:** Review ins Repository uebernommen als
  `docs/development/briefs/appearance-versioning-review.md`. Beide Blocker
  und die Haertungen 4.1-4.4 sind umgesetzt: die Compatibility-Core-
  Projektion laeuft ueber Profil plus Custom-Asset-Referenzen (maximal eine
  Custom-Clothing-Referenz in V1, Fallback wird in den Core projiziert,
  Kleidungs-Konsistenzpruefung wird bei uebersprungenen unbekannten
  Asset-Record-Versionen kontrolliert gelockert), Core V1 ist normativ als
  dauerhaft verpflichtender Legacy-Fallback eingefroren (ADR 0125 und
  `docs/protocol/appearance-document-v1.md`), Base64url prueft die
  Textlaenge vor der Allokation, `assertAppearanceDocumentRenderableV1`
  setzt kritische Extensions durch, die implizite Generator-ID ist
  dokumentiert und `createPicoAppearanceDocumentCacheKeyV1` ergaenzt den
  profilbezogenen Cache-Key. Punkt 4.5 (Geometrie-Golden-Vectors) bleibt
  wie im Review vorgesehen beim ersten Geometriegenerator.
