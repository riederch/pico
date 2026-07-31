# Verbindliche Charakterreferenz

**PICO Character Design v3.2.1 ist die oberste und unveränderliche
Designautorität.** Das PICO Product Design System, jede Produktoberfläche,
jedes Icon, jede Illustration und jedes generierte Artefakt ordnet sich ihm
unter. UI-, Marketing- oder technische Anforderungen dürfen den Charakter
nicht neu interpretieren.

## Verbindliche Quelle

Das Urdesign stammt aus dem Archiv
`PICO_Product_Design_System_v1.0.zip`. Name und SHA-256 des geprüften Archivs
stehen in `SOURCE.md`; die drei Originalbilder unter
`08_Starter_Kit/assets/` bleiben byteidentisch. Ihre Rollen und Prüfsummen
stehen maschinenlesbar in `approved-character-assets.json`.

Innerhalb von Character Design v3.2.1 gilt folgende Reihenfolge:

1. `Status_Light_Hotfix_v3.2.1.md` entscheidet Statuslicht und
   Kontexttrennung.
2. `PICO_Designboard_Original.png` entscheidet visuelle Herkunft,
   Silhouette, Proportionen, Geometrie, Materialität und Identitätsmodule.
3. `PICO_Basis_Avatar.png` ist die kanonische neutrale Ganzkörperreferenz.
4. `PICO_Regression_15er_v3.2.1.png` ist ein diagnostisches Vergleichsboard,
   kein Katalog freigegebener Produktionsassets. Wo einzelne Felder dem
   Statuslicht-Hotfix widersprechen, sind sie Negativbeispiele.

Die schriftliche Regel mit höherem Rang entscheidet einen Widerspruch; ein
einzelnes Pixelbeispiel darf die Character-Regel nicht stillschweigend ändern.

## Unverändert bleiben

- kanonische PICO-Silhouette und das Verhältnis von Kopf, Visier und Torso
- Kopf, Visier, Torso, Arme, Hände, Schwebeform und Antennenelement
- glänzende helle Schale, dunkles Gesichtsdisplay und räumlicher Renderingstil
- Augenform ohne Pupillen, Mundlinie, Brustkern und Statuslichtgruppe
- freigegebene Identitätsmodule, Zustands- und Gestenlogik
- der im Urdesign sichtbare Detailkorridor: PICO bleibt detaillierter als die UI

## Freigabeklassen

- **Character reference:** verbindliche Quelle zur Ableitung und Prüfung;
  nicht automatisch ein auslieferbares Einzelasset.
- **Diagnostic reference:** Vergleichs- oder Regressionstafel; einzelne Felder
  können bewusst zeigen, was nach einer höherrangigen Regel abzulehnen ist.
- **Production asset:** einzeln exportiertes, zweckgebundenes Asset mit
  Prüfsumme und ausdrücklicher Character-Freigabe.

Das Originalpaket enthält Reference- und Diagnostic-Assets, aber noch keinen
vollständigen Satz kleiner Production-Assets. Ein Referenzboard wird nicht
durch Umbenennung zum App-Icon oder Chatavatar.

## Character-Freigabeprozess

Ein neues oder ersetzendes Character-Asset ist erst freigegeben, wenn im selben
Milestone:

1. seine Ableitung auf eine registrierte Character-Referenz zurückgeführt ist;
2. Silhouette, Proportionen, Materialität und Identitätsmodule gegen das
   Urdesign geprüft wurden;
3. bei einem Statusasset die gesamte Statuslichtgruppe exakt denselben Status
   trägt und Kontextfarben ausschließlich außerhalb dieser Gruppe liegen;
4. vorgesehene Oberfläche, Zustand, Größe und erlaubte Zuschnitte benannt sind;
5. die QA-Checkliste bestanden ist; und
6. Pfad, SHA-256, Ableitungsquelle und Freigabeklasse in
   `approved-character-assets.json` aufgenommen wurden.

Product- oder UI-Arbeit allein darf keine Character-Freigabe erteilen. Ohne
diesen Registry-Eintrag bleibt ein Kandidat Reference, Diagnostic oder Legacy,
niemals Production.
