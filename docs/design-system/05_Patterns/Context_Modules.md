# Kontextmodule

Ein Kontext verändert Fachsprache, Symbole und Akzentfarbe, nicht die Grundstruktur der App.

| Kontext | Typische Inhalte |
|---|---|
| Technik | Prozesse, Geräte, Diagnostik |
| Wasser und Infrastruktur | Pegel, Leitungen, Durchfluss |
| Feuerwehr | Einsatz, Standort, Kommunikation |
| Organisation | Aufgaben, Kalender, Strukturen |
| Smart Home | Räume, Geräte, Sensoren |
| Kommunikation | Funk, Audio, Nachrichten |
| Energie | Leistung, Verbrauch, Batterie |
| Nacht / Fokus | reduzierte Helligkeit, minimale Ablenkung |

Feuerwehr-Rot und Energie-Amber sind Kontextfarben und dürfen den Status eines arbeitenden PICO nicht ersetzen.

## Wer den Kontext wählt

Der Kontext ist eine Einstellung des einzelnen PICO, keine Wirtskonfiguration
(ADR 0104). Zwei PICOs im selben Pico Home können verschiedenen Bereichen
dienen — eines der Feuerwehr, eines dem Haus —, also kann die Antwort sich
zwischen zwei Personen im selben Home unterscheiden, und genau das ist die
Testfrage aus ADR 0104.

`Color_System.md` nennt die Kontextfarbe „fachlicher Anwendungsbereich"; Nacht
/ Fokus ist streng genommen keiner, sondern eine Bedingung. Es bleibt hier
gelistet, weil die Achse sich über das definiert, was sie verändert —
Fachsprache, Symbole, Akzentfarbe —, und das trifft auf Nacht / Fokus zu. Die
Spannung ist bekannt und wird nicht durch Verschieben aufgelöst.

Stand 2026-08-09 liest noch keine Fläche die Kontexttokens.
