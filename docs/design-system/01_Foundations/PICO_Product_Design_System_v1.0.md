# PICO Product Design System v1.0

Repository-Patchstand: **1.0.1**. PICO Character Design v3.2.1 bleibt
unverändert die oberste Designautorität.

## 1. Systemarchitektur

Das Gesamtsystem besteht aus zwei voneinander getrennten Standards:

1. **PICO Character Design v3.2.1** – unveränderlicher Charakterstandard.
2. **PICO Product Design System v1.1.0** – abgeleiteter Produkt-, UI- und Interaktionsstandard.

Das Product Design System verweist auf den Character Standard, darf ihn aber nicht überschreiben.

Das Urdesign und seine unveränderten Originalreferenzen sind über `SOURCE.md`
und `07_Governance/approved-character-assets.json` hashgebunden. Nur ein dort
zweckgebunden registriertes `production_asset` darf als Character-Darstellung
ausgeliefert werden.

## 2. Leitidee

> Ruhige digitale Umgebung, klare Informationen und gezielte Lichtakzente – mit PICO als persönlichem, emotionalem Anker.

Die Oberfläche wirkt modern, freundlich und technisch kompetent, aber nicht wie ein überladenes Science-Fiction-Kontrollzentrum. Diese Product-Sprache wird aus Character Design v3.2.1 abgeleitet und verändert PICO selbst nicht.

## 3. Designprinzipien

### 3.1 PICO bleibt der visuelle Anker

PICO besitzt den höchsten Detailgrad und die stärkste räumliche Lichtwirkung. UI-Komponenten bleiben flacher, ruhiger und funktionaler.

### 3.2 Funktion vor Dekoration

Jede Linie, Farbe und Animation benötigt eine funktionale Bedeutung. Dekorative Datenlinien, unnötige Hologramme und permanente Neonrahmen sind ausgeschlossen.

### 3.3 Große, ruhige Grundformen

Die UI übernimmt PICOs Formensprache durch Kreise, weiche Ovale, stark abgerundete Rechtecke und großzügige Innenabstände.

### 3.4 Farbe trägt Bedeutung

Markenfarbe, Statusfarbe und Kontextfarbe sind getrennte Ebenen. Kontextfarben dürfen Systemstatus niemals überschreiben.

### 3.5 PICO wird gezielt eingesetzt

PICO erscheint bei Assistenz, Onboarding, Empty States, Hilfestellungen, Statusmeldungen und Bestätigungen. In normalen Tabellen, Formularen und Listen wird nicht überall eine PICO-Figur wiederholt.

## 4. Farbarchitektur

Die Tabellen in diesem Dokument erklären Semantik. Maschinenautorität ist
`tokens/pico.tokens.json` im DTCG-2025.10-Format; CSS, SCSS, TypeScript und
Repository-Integrationen werden daraus erzeugt.

### 4.1 Neutrale Grundfarben

| Token | Wert | Verwendung |
|---|---:|---|
| `pico-bg-deep` | `#04101C` | tiefster Hintergrund |
| `pico-bg-base` | `#071827` | App-Hintergrund |
| `pico-surface-1` | `#0C2032` | Karten, Navigation |
| `pico-surface-2` | `#112A3E` | hervorgehobene Flächen |
| `pico-surface-3` | `#17344A` | Hover und Auswahl |
| `pico-border` | `#27475D` | dezente Konturen |
| `pico-text-primary` | `#E8F3FA` | Haupttext |
| `pico-text-secondary` | `#A7BDCB` | Sekundärtext |
| `pico-text-muted` | `#718999` | Hilfstext |
| `pico-text-disabled` | `#536876` | deaktivierte Inhalte |

### 4.2 Marken- und Interaktionsfarben

| Token | Wert | Verwendung |
|---|---:|---|
| `pico-primary` | `#2CCFFF` | primäre Interaktion |
| `pico-primary-strong` | `#15AEE8` | aktiv, gedrückt |
| `pico-primary-soft` | `#123E55` | Auswahlhintergrund |
| `pico-focus` | `#72E1FF` | Fokusrahmen |

### 4.3 Statusfarben

| Status | Wert |
|---|---:|
| neutral / aktiv | `#2CCFFF` |
| zuhören | `#348CFF` |
| denken / Fokus | `#9A70FF` |
| Warnung | `#FFB13B` |
| blockiert / Fehler | `#FF4E5D` |
| Erfolg | `#59E579` |

### 4.4 Kontextfarben

| Kontext | Akzent |
|---|---:|
| Technik | `#358DFF` |
| Wasser und Infrastruktur | `#26D3D0` |
| Feuerwehr | `#E84B42` |
| Organisation | `#49CDB1` |
| Smart Home | `#FF963D` |
| Kommunikation | `#29CFF2` |
| Energie | `#F5A62E` |
| Nacht / Fokus | `#8767E8` |

Kontextfarben werden nur auf Panels, Symbole, Werkzeuge, Diagramme und dezente Umgebungsakzente angewendet.

## 5. Statuslichtregel v3.2.1

Bei PICO bilden Augen, Mundlinie, Brustkern, leuchtender Kopfakzent, Unterseiten-Glow und Schwebering eine untrennbare Statuslichtgruppe. Innerhalb einer Darstellung verwenden alle Elemente exakt dieselbe Statusfarbe. Kontextfarben dürfen diese Gruppe niemals umfärben.

## 6. Typografie

Primärschrift ist **Inter**, alternativ eine gleichwertige systemnahe Sans-Serif. Fontdateien sind nicht Bestandteil des Pakets.

| Stil | Größe | Gewicht |
|---|---:|---:|
| Display | 32–40 px | 600 |
| Heading 1 | 28 px | 600 |
| Heading 2 | 22 px | 600 |
| Heading 3 | 18 px | 600 |
| Body Large | 17 px | 400 |
| Body | 15–16 px | 400 |
| Label | 13–14 px | 500 |
| Caption | 12 px | 400 |

Fließtext wird nicht in Versalien gesetzt. Zeilenlängen liegen möglichst zwischen 45 und 75 Zeichen.

## 7. Raster und Abstände

Das System nutzt ein 4-Pixel-Raster. Kernabstände sind 4, 8, 12, 16, 24, 32, 48 und 64 px. Mobile Seitenränder beginnen bei 16 px, Tablet bei 24 px, Desktop bei 32–48 px.

## 8. Rundungen

| Element | Radius |
|---|---:|
| Chips | 10 px |
| Buttons | 12–14 px |
| Eingaben | 14 px |
| Chatnachrichten | 18–22 px |
| Karten | 20 px |
| Dialoge | 24 px |
| Illustrationsflächen | 28–32 px |

## 9. Tiefenwirkung

- Hintergrund: ruhig, dunkel, ohne harte Muster.
- Funktionsflächen: leichte Helligkeitsdifferenz, 1-px-Kontur, geringer Schatten.
- Aktive Inhalte: PICO, primäre Aktion und relevante Statusmeldungen.
- Starke 3D- und Glanzeffekte bleiben PICO vorbehalten.

## 10. App-Icon-System

Das Haupt-App-Icon zeigt ein für Plattform und Größe registriertes Character-Production-Asset, vorzugsweise als freigegebenen Kopf- beziehungsweise Visier-Zuschnitt mit zwei vertikalen Augen auf dunkelblauem Hintergrund. Es enthält keine Ganzkörperpose, kein Panel und keinen Text. Familienicons nutzen denselben freigegebenen PICO-Kopfausschnitt und ein kleines Kontextzeichen rechts unten, maximal etwa ein Viertel der Iconfläche. Der Zuschnitt reduziert die Komposition; PICOs Geometrie wird nicht vereinfacht oder neu gezeichnet.

## 11. Avatare

| Größe | Verwendung |
|---|---|
| 24 px | kompakte Listen |
| 32 px | Benachrichtigungen |
| 40 px | Standard-Chatavatar |
| 64 px | Dialog und Assistenzbereich |
| 96 px | Onboarding und Status |
| 160 px+ | Empty States |

Unter 40 px werden nur Kopf, Visier, Augen und Kopfschale eines dafür
freigegebenen Production-Assets verwendet. Product-Code färbt oder zeichnet den
Character nicht selbst um.

## 12. Chat

PICO-Nachrichten verwenden dunkle bläuliche Flächen, Avatar links, helle Typografie und optionale Aktionen unterhalb. Nutzernachrichten bleiben neutral und rechtsbündig. Denk-, Hör- und Arbeitszustände werden durch PICO-Status, Symbol, Text und zurückhaltende Animation dargestellt.

## 13. Komponenten

- Primärbutton: Cyan, hoher Kontrast, klarer Verbtext.
- Sekundärbutton: dunkle Fläche, dezente Kontur.
- Destruktive Aktionen: Rot nur für tatsächlich kritische oder dauerhafte Aktionen.
- Eingaben: sichtbare Labels, Cyan-Fokus, konkrete Fehlermeldungen.
- Karten: ein Hauptinhalt, maximal zwei Aktionen.
- Panels: ein Hauptsymbol, maximal drei unterstützende Informationen.

## 14. Navigation

Mobil wird eine Bottom Navigation mit vier bis fünf Hauptzielen empfohlen. Desktop verwendet eine kompakte Seitenleiste. Der globale PICO-Assistent ist von normaler Navigation getrennt und erscheint als dezenter Kopf- oder Visieravatar.

## 15. Muster

### Empty States

Ein PICO, eine klare Pose, maximal ein Kontextobjekt, kurze Überschrift, Erklärung und eine primäre Aktion.

### Onboarding

Derselbe PICO in allen Schritten, überwiegend neutraler Status, pro Schritt eine Handgeste und höchstens ein Kontextobjekt.

### Warnung, Fehler, Erfolg

Status wird immer durch Farbe, Symbol, Text und passende Handlung vermittelt. PICO bleibt hilfreich und niemals aggressiv.

## 16. Motion

- Schweben: langsam, geringe Amplitude.
- Augen: sanftes Blinzeln, keine Pupillen.
- Statuswechsel: 200–400 ms, weiche Überblendung.
- Panels: 4–8 px Bewegung, geringe Skalierung, Transparenz.
- Bei reduzierter Bewegung entfallen Schweben und permanentes Pulsieren.

## 17. Responsive Design

Mobil einspaltig, Tablet flexibel zweispaltig, Desktop mit optionalem Assistenzbereich. PICO-Illustrationen werden auf kleinen Flächen reduziert, nicht neu gestaltet.

## 18. Light Mode

Der Light Mode ist keine Invertierung. Er verwendet bläulich-helle Hintergründe, weiße Flächen, dunkles Marine für Text, weniger Glow und klarere Konturen. Dark Mode bleibt die primäre Markenreferenz.

## 19. Barrierefreiheit

Ziel ist WCAG 2.2 AA. Textkontrast mindestens 4,5:1, große Texte 3:1, Interaktionsflächen etwa 44 × 44 px, sichtbare Tastaturfokussierung, vollständige Screenreader-Unterstützung und reduzierte Bewegung. PICO-Ausdruck ist ergänzend und niemals alleinige Informationsquelle.

## 20. Governance

UI-Versionen ändern den Character Standard nicht. Änderungen werden semantisch
versioniert. Vor Freigabe ist die QA-Checkliste durchzuführen; Character-Assets
brauchen zusätzlich den Registry-Eintrag des Character-Freigabeprozesses.
