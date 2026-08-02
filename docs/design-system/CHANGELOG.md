# Changelog

## 1.0.2 – 2026-08-02

- Kontrastbericht wird aus den Tokens erzeugt und verbindlich geprüft; ein Wert unter Ziel lässt die Generierung fehlschlagen
- Textfarben werden gegen jede Fläche geprüft, auf der sie stehen dürfen, nicht nur gegen den App-Hintergrund
- `text.muted` in Dark und Light Mode korrigiert; beide erreichten auf Karten- und Aktivflächen keine 4,5:1
- `border.strong` als sichtbare Begrenzung von Bedienelementen ergänzt; `border.subtle` bleibt Panel- und Tabellentrenner
- Fokusfarbe für den Light Mode ergänzt; die Dark-Mode-Fokusfarbe erreichte auf hellen Flächen keine 3:1
- Companion Shell an die generierten Tokens gebunden; kopierte Farb-, Radius- und Motion-Literale entfernt
- Foundation-Dashboard: sichtbarer Tastaturfokus für alle Bedienelemente, Zeilenaktionen auf 44 px Zielgröße

## 1.0.1 – 2026-07-31

- Character Design v3.2.1 als oberste Designautorität samt Quellenhash und Asset-Registry verankert
- Originalbitmaps unverändert klassifiziert; gemischte Statuslichtgruppen als diagnostische Negativbeispiele markiert
- DTCG-2025.10-konforme kanonische Tokens und deterministische CSS-, SCSS- und TypeScript-Ausgaben ergänzt
- Light Mode, mobile Navigation und dreifache Statussemantik im Starter korrigiert
- Foundation-Dashboard und Recovery-Card-PDF an generierte Design-Tokens gebunden
- Manifest-, Token-, Asset- und Runtime-Drift als Release-Gate geschlossen

## 1.0.0 – 2026-07-31

- erstes vollständiges PICO Product Design System
- klare Abgrenzung zu PICO Character Design v3.2.1
- Foundations, Tokens, Brand-, Komponenten-, Chat- und Pattern-Regeln
- App-Icon-, Avatar- und Kontext-Icon-System
- Accessibility- und Governance-Dokumentation
- frameworkunabhängiger HTML/CSS-Starter
- Statuslicht-Hotfix v3.2.1 als verbindliche Abhängigkeit dokumentiert
