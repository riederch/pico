# Motion Design

## Dauer

- Mikrointeraktionen: 120–180 ms
- Zustandswechsel: 200–400 ms
- Dialoge und größere Panels: 240–360 ms
- ruhige PICO-Pulse: 1,5–3 s

## Easing

Bevorzugt weich und kontrolliert, beispielsweise `cubic-bezier(.2,.8,.2,1)`.

## PICO

- minimale Schwebewegung
- sanftes Blinzeln
- Statusfarben weich überblenden
- keine hektischen oder übertriebenen Reaktionen

## Reduced Motion

Bei `prefers-reduced-motion: reduce` entfallen Schweben, permanentes Pulsieren und Parallax. Zustände bleiben durch Text, Symbol und Farbe verständlich.
