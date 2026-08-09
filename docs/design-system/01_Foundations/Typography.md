# Typografie

## Was hier bindet und was nicht

Nach ADR 0135 bindet nur, was eine Fläche lesen kann. Deshalb ist auf dieser
Seite ausgewiesen, was ein Token ist und was Anleitung für Menschen bleibt.

| Aussage | Form |
| --- | --- |
| Schriftfamilie samt Fallback-Reihenfolge | **Token** `typography.fontFamily.sans` |
| Größen, Zeilenhöhen und die Regeln unten | Anleitung für Menschen, kein Token |

Die Größenangaben stehen als Minimum und Spanne — „mindestens 15 px, bevorzugt
16", „1,45–1,6". Eine Spanne als einen Tokenwert zu schreiben wäre eine
Entscheidung, die niemand getroffen hat; sie bleibt deshalb Anleitung, bis
jemand sie trifft.

**Für Druck gibt es keine Angaben.** Die Werte hier sind Bildschirmwerte: ein
15-px-Minimum ist auf einer laminierten 85,6-mm-Karte keine sinnvolle Grenze.
Eine Drucktypografie ist offen und ausdrücklich nicht aus diesen Zahlen
abzuleiten (ADR 0135 D1).

## Schriftfamilie

Primär: `Inter`, danach systemnahe Sans-Serif-Fallbacks. Dieses Paket enthält keine Fontdateien.

```css
font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
```

Als Token liegt derselbe Stapel in
`01_Foundations/tokens/pico.tokens.json` unter `typography.fontFamily.sans`.
CSS und SCSS erhalten ihn zusammengesetzt als `--pico-font-sans`; die
TypeScript-Ausgabe behält die Liste, weil eine Fläche ohne CSS die erste
verfügbare Familie auswählen muss und keinen fertigen Deklarationswert
gebrauchen kann.

## Regeln

- Body-Text mindestens 15 px, bevorzugt 16 px.
- Normale Textzeilen 1,45–1,6 Zeilenhöhe.
- Labels nie ausschließlich über Placeholder vermitteln.
- Versalien nur für kurze technische Labels.
- Zahlenwerte in Tabellen dürfen tabellarische Ziffern verwenden.
- Statusbegriffe sind kurz, eindeutig und konsistent.
