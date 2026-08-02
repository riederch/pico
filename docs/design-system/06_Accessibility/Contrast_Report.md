# Kontrastbericht

Erzeugt aus `01_Foundations/tokens/pico.tokens.json` durch
`pnpm design-system:generate`. Nicht von Hand bearbeiten.

Die verbindlichen Paare sind Teil des Release-Gates: Ein Verhaeltnis
unterhalb des Ziels laesst die Token-Generierung fehlschlagen. Dieser
Bericht kann daher keinen Wert behaupten, den die Tokens nicht einhalten.

Textfarben werden gegen jede Flaeche geprueft, auf der sie stehen duerfen,
nicht nur gegen den App-Hintergrund. Zielniveau ist WCAG 2.2 AA: 4,5:1 fuer
normalen Text, 3:1 fuer Fokusanzeige und Steuerungsraender.

## Dark Mode

### Verbindlich geprueft

| Vordergrund | Hintergrund | Ziel | Verhaeltnis | Bewertung |
|---|---|---:|---:|---|
| text.primary | background.deep | 4.5:1 | 17.00:1 | AAA |
| text.primary | background.base | 4.5:1 | 15.94:1 | AAA |
| text.primary | surface.primary | 4.5:1 | 14.69:1 | AAA |
| text.primary | surface.secondary | 4.5:1 | 13.08:1 | AAA |
| text.primary | surface.active | 4.5:1 | 11.46:1 | AAA |
| text.secondary | background.deep | 4.5:1 | 9.84:1 | AAA |
| text.secondary | background.base | 4.5:1 | 9.23:1 | AAA |
| text.secondary | surface.primary | 4.5:1 | 8.50:1 | AAA |
| text.secondary | surface.secondary | 4.5:1 | 7.57:1 | AAA |
| text.secondary | surface.active | 4.5:1 | 6.63:1 | AA |
| text.muted | background.deep | 4.5:1 | 6.84:1 | AA |
| text.muted | background.base | 4.5:1 | 6.41:1 | AA |
| text.muted | surface.primary | 4.5:1 | 5.91:1 | AA |
| text.muted | surface.secondary | 4.5:1 | 5.26:1 | AA |
| text.muted | surface.active | 4.5:1 | 4.61:1 | AA |
| brand.focus | background.deep | 3.0:1 | 12.71:1 | erfuellt |
| brand.focus | background.base | 3.0:1 | 11.92:1 | erfuellt |
| brand.focus | surface.primary | 3.0:1 | 10.98:1 | erfuellt |
| brand.focus | surface.secondary | 3.0:1 | 9.78:1 | erfuellt |
| brand.focus | surface.active | 3.0:1 | 8.56:1 | erfuellt |
| border.strong | background.deep | 3.0:1 | 4.65:1 | erfuellt |
| border.strong | background.base | 3.0:1 | 4.36:1 | erfuellt |
| border.strong | surface.primary | 3.0:1 | 4.02:1 | erfuellt |
| border.strong | surface.secondary | 3.0:1 | 3.58:1 | erfuellt |
| border.strong | surface.active | 3.0:1 | 3.13:1 | erfuellt |
| text.onPrimary | brand.primary | 4.5:1 | 10.43:1 | AAA |

### Nachrichtlich, nicht erzwungen

| Vordergrund | Hintergrund | Verhaeltnis |
|---|---|---:|
| status.active | surface.primary | 9.05:1 |
| status.listening | surface.primary | 5.00:1 |
| status.thinking | surface.primary | 4.84:1 |
| status.warning | surface.primary | 9.15:1 |
| status.blocked | surface.primary | 5.12:1 |
| status.success | surface.primary | 10.18:1 |
| border.subtle | surface.primary | 1.69:1 |

## Light Mode

### Verbindlich geprueft

| Vordergrund | Hintergrund | Ziel | Verhaeltnis | Bewertung |
|---|---|---:|---:|---|
| text.primary | background.deep | 4.5:1 | 14.63:1 | AAA |
| text.primary | background.base | 4.5:1 | 15.54:1 | AAA |
| text.primary | surface.primary | 4.5:1 | 16.45:1 | AAA |
| text.primary | surface.secondary | 4.5:1 | 14.80:1 | AAA |
| text.primary | surface.active | 4.5:1 | 13.77:1 | AAA |
| text.secondary | background.deep | 4.5:1 | 7.05:1 | AAA |
| text.secondary | background.base | 4.5:1 | 7.48:1 | AAA |
| text.secondary | surface.primary | 4.5:1 | 7.92:1 | AAA |
| text.secondary | surface.secondary | 4.5:1 | 7.13:1 | AAA |
| text.secondary | surface.active | 4.5:1 | 6.63:1 | AA |
| text.muted | background.deep | 4.5:1 | 4.90:1 | AA |
| text.muted | background.base | 4.5:1 | 5.21:1 | AA |
| text.muted | surface.primary | 4.5:1 | 5.51:1 | AA |
| text.muted | surface.secondary | 4.5:1 | 4.96:1 | AA |
| text.muted | surface.active | 4.5:1 | 4.62:1 | AA |
| brand.focus | background.deep | 3.0:1 | 3.40:1 | erfuellt |
| brand.focus | background.base | 3.0:1 | 3.61:1 | erfuellt |
| brand.focus | surface.primary | 3.0:1 | 3.82:1 | erfuellt |
| brand.focus | surface.secondary | 3.0:1 | 3.44:1 | erfuellt |
| brand.focus | surface.active | 3.0:1 | 3.20:1 | erfuellt |
| border.strong | background.deep | 3.0:1 | 3.30:1 | erfuellt |
| border.strong | background.base | 3.0:1 | 3.51:1 | erfuellt |
| border.strong | surface.primary | 3.0:1 | 3.72:1 | erfuellt |
| border.strong | surface.secondary | 3.0:1 | 3.34:1 | erfuellt |
| border.strong | surface.active | 3.0:1 | 3.11:1 | erfuellt |
| text.onPrimary | brand.primary | 4.5:1 | 10.43:1 | AAA |

### Nachrichtlich, nicht erzwungen

| Vordergrund | Hintergrund | Verhaeltnis |
|---|---|---:|
| status.active | surface.primary | 1.83:1 |
| status.listening | surface.primary | 3.31:1 |
| status.thinking | surface.primary | 3.42:1 |
| status.warning | surface.primary | 1.81:1 |
| status.blocked | surface.primary | 3.23:1 |
| status.success | surface.primary | 1.63:1 |
| border.subtle | surface.primary | 1.85:1 |

## Warum die nachrichtlichen Werte nicht erzwungen werden

Statusfarben gehoeren zur Statuslichtgruppe aus PICO Character Design
v3.2.1. Das Produktsystem darf sie nicht eigenmaechtig fuer eine helle
Flaeche abdunkeln; das waere eine Character-Entscheidung. Statusbedeutung
wird zusaetzlich durch Symbol und Text getragen, und fuer kleinen
Fliesstext ist stets eine gepruefte Textfarbe zu verwenden.

`border.subtle` trennt Panels und Tabellenzeilen; die sichtbare Begrenzung
eines Bedienelements ist `border.strong` und wird verbindlich geprueft.

### Offener Punkt

Im Light Mode erreichen mehrere Statusfarben als Vordergrund auf heller
Flaeche kein Verhaeltnis von 3:1. Solange keine Produktoberflaeche den
Light Mode als Statusflaeche nutzt, bleibt das folgenlos. Vor der ersten
hellen Statusoberflaeche braucht es eine Character-Entscheidung ueber
eigene Status-Vordergrundfarben fuer helle Flaechen.
