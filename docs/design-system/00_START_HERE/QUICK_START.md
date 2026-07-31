# Quick Start

## Für Designer

- Dark Mode ist die primäre Markenreferenz.
- PICO bleibt detaillierter und leuchtstärker als die UI.
- Nutze große ruhige Flächen, abgerundete Formen und klare Typografie.
- Trenne Statusfarben strikt von Kontextfarben.
- Verwende PICO gezielt bei Assistenz, Onboarding, Empty States und Statuskommunikation.
- Verwende für ausgelieferte Character-Darstellungen ausschließlich registrierte Production-Assets; Referenzboards sind keine App-Assets.

## Für Entwickler

- Ändere ausschließlich `01_Foundations/tokens/pico.tokens.json` und erzeuge die Plattformausgaben über `pnpm design-system:generate`.
- Importiere danach die generierte Datei `01_Foundations/tokens/pico.tokens.css` oder die gleichwertige SCSS-/TypeScript-Ausgabe.
- Nutze die Beispielkomponenten aus `08_Starter_Kit/styles/pico-components.css` als Ausgangspunkt.
- Implementiere sichtbare Fokuszustände, reduzierte Bewegung und semantische Statusmeldungen.
- Verlasse dich nie ausschließlich auf Farbe.

## Für Content und UX

- PICO spricht sachlich, freundlich und lösungsorientiert.
- Warnungen erklären Ursache und nächste Handlung.
- Fehlertexte vermeiden Schuldzuweisungen.
- Bestätigungen bleiben kurz und konkret.
