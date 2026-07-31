# Farbsystem

## Drei getrennte Ebenen

1. **Markenfarbe:** primäre Interaktion und Fokus.
2. **Statusfarbe:** Systemzustand und PICO-Statuslichtgruppe.
3. **Kontextfarbe:** fachlicher Anwendungsbereich.

## Verbindliche Regeln

- Kontextfarbe überschreibt niemals Statusfarbe.
- Rot wird nicht automatisch für Feuerwehraktionen verwendet.
- Farbe allein reicht nie als Statusinformation aus.
- Große Flächen bleiben neutral; Akzentfarben werden sparsam eingesetzt.
- Glow bleibt auf PICO, Fokus und kurzzeitige Statusrückmeldung begrenzt.

Die kanonischen technischen Werte stehen DTCG-2025.10-konform in
`tokens/pico.tokens.json`. CSS, SCSS und TypeScript werden deterministisch
daraus erzeugt und nicht separat gepflegt.
