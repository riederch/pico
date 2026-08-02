# Legacy-Asset-Register

Diese Bestandsassets entstanden vor der verbindlichen Repository-Integration
von PICO Character Design v3.2.1. Sie bleiben vorübergehend sichtbar, sind aber
keine Character-Referenzen und dürfen nicht als Vorlage für neue Arbeit dienen.

Die verbindliche Liste ist maschinenlesbar und steht in
`legacy-character-assets.json`. Ihre Pfade sind repository-relativ, weil diese
Assets ausserhalb des Design-System-Pakets ausgeliefert werden. Die folgende
Tabelle ist die lesbare Fassung derselben Einträge:

| Pfad | Aktuelle Verwendung | Offene Migration |
|---|---|---|
| `pico_core/icon.svg`, `pico_core/icon.png` | Home-Assistant-Add-on-Icon | durch freigegebenen Character-3.2.1-Kopf-/Visier-Export ersetzen |
| `pico_core/logo.svg`, `pico_core/logo.png` | Home-Assistant-Add-on-Logo | durch freigegebenen Character-3.2.1-Export ersetzen |
| `docs/assets/pico-design-concept.png` | README-Konzeptbild | nur historische Präsentation; Urdesign liegt im Design-System-Paket |
| `docs/assets/pico-ha-icon.png` | Präsentationsasset | nicht als Production-Asset wiederverwenden |
| `docs/assets/pico-readme-hero.png` | README-Hero | bei nächster visueller Revision aus freigegebenen Production-Assets neu zusammensetzen |

## Was der Release-Gate prüft

Ein Prosaregister allein hat nichts verhindert: Bis zur Aufnahme in den Gate
konnte jedes dieser Bilder gegen eine neu gezeichnete Fassung getauscht werden,
ohne dass eine Prüfung anschlug. `scripts/check-design-system.mjs` erzwingt
daher:

- Jedes Bild, das das Repository ausserhalb von `docs/design-system/`
  ausliefert, muss in einer der beiden Registries stehen. Ein unregistriertes
  Bild lässt den Gate fehlschlagen.
- Die Prüfsumme jedes Legacy-Assets ist gepinnt. Ein Austausch ist eine
  Character-Migration mit Registry-Entscheidung, kein Dateitausch.
- Jedes Legacy-Asset muss seine aktuelle Verwendung und seine offene Migration
  benennen.
- Im Character-Asset-Verzeichnis `08_Starter_Kit/assets/` darf kein Bild
  liegen, das `approved-character-assets.json` nicht kennt.
- Kein Pfad darf gleichzeitig als freigegeben und als Legacy geführt werden.

Neue Oberflächen und neue Character-Assets dürfen diesen Legacy-Stand nicht
kopieren. Eine Migration wird erst abgeschlossen behauptet, wenn der Ersatz im
Character-Asset-Register als `production_asset` geführt und auf seinen
konkreten Zweck begrenzt ist.
