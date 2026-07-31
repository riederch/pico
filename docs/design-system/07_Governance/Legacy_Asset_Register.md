# Legacy-Asset-Register

Diese Bestandsassets entstanden vor der verbindlichen Repository-Integration
von PICO Character Design v3.2.1. Sie bleiben vorübergehend sichtbar, sind aber
keine Character-Referenzen und dürfen nicht als Vorlage für neue Arbeit dienen:

| Pfad | Aktuelle Verwendung | Offene Migration |
|---|---|---|
| `pico_core/icon.svg`, `pico_core/icon.png` | Home-Assistant-Add-on-Icon | durch freigegebenen Character-3.2.1-Kopf-/Visier-Export ersetzen |
| `pico_core/logo.svg`, `pico_core/logo.png` | Home-Assistant-Add-on-Logo | durch freigegebenen Character-3.2.1-Export ersetzen |
| `docs/assets/pico-design-concept.png` | README-Konzeptbild | nur historische Präsentation; Urdesign liegt im Design-System-Paket |
| `docs/assets/pico-ha-icon.png` | Präsentationsasset | nicht als Production-Asset wiederverwenden |
| `docs/assets/pico-readme-hero.png` | README-Hero | bei nächster visueller Revision aus freigegebenen Production-Assets neu zusammensetzen |

Neue Oberflächen und neue Character-Assets dürfen diesen Legacy-Stand nicht
kopieren. Eine Migration wird erst abgeschlossen behauptet, wenn der Ersatz im
Character-Asset-Register als `production_asset` geführt und auf seinen
konkreten Zweck begrenzt ist.
