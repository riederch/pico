# Pico Core

![Pico Hero](../docs/assets/pico-readme-hero.png)

**Pico Core bringt die Grundlage eines persönlichen AI-Companions in Home Assistant.**

Pico ist als **local-first persönlicher Assistent** gedacht, der nicht einfach nur antwortet, sondern langfristig Geräte, Kontext, Ereignisse und Alltagsabläufe verstehen und sinnvoll unterstützen kann.  
Dabei stehen **Datensouveränität, Transparenz und klare Grenzen** im Mittelpunkt: AI darf unterstützen, aber Kontrolle, Bestätigung und Nachvollziehbarkeit bleiben beim Nutzer.

## Was ist Pico Core?

Pico Core ist das technische Fundament des Pico-Projekts innerhalb von Home Assistant.  
Es schafft die Basis für einen zukünftigen persönlichen Assistenten, der lokal betrieben werden kann und sich schrittweise zu einem vertrauenswürdigen Companion für Zuhause, Geräte und digitale Abläufe weiterentwickelt.

![Pico Konzept](../docs/assets/pico-design-concept.png)

## Warum Home Assistant?

Home Assistant ist ein idealer Startpunkt für Pico, weil hier bereits viele relevante Informationen zusammenlaufen:

- Geräte und Sensoren
- Zustände und Ereignisse
- Automationen und Routinen
- lokale Infrastruktur und Services

Dadurch entsteht eine natürliche Umgebung für einen Assistenten, der nicht losgelöst arbeitet, sondern den tatsächlichen Kontext des Nutzers verstehen soll.

## Was Pico Core heute bereits mitbringt

Die aktuelle Foundation-Version liefert bereits die erste lauffähige technische Basis:

- eine lokale HTTP API
- einen Realtime-WebSocket-Endpunkt
- SQLite-basierte Event-Speicherung
- einen Health-Check für die Add-on-Überwachung
- die erste Packaging- und Update-Basis für spätere Pico-Funktionen

## Projektvision

Pico soll langfristig **mehr als ein Chatbot** werden.  
Ziel ist ein persönlicher AI-Companion, der:

- lokal und datensparsam arbeitet
- Kontext über Geräte und Ereignisse hinweg versteht
- nachvollziehbar und kontrollierbar bleibt
- schrittweise mit weiteren Fähigkeiten erweitert werden kann

Dabei ist wichtig: Pico soll nicht einfach unkontrolliert handeln, sondern sich in ein Modell einfügen, bei dem **Vorschläge, Regeln, Bestätigung und Auditierbarkeit** sauber zusammenspielen.

## Technische Einstiegspunkte

- **HTTP API:** Port `3100`
- **WebSocket:** `/ws`
- **Health Endpoint:** `/health`
- **Event API:** `/api/events`

## Aktueller Entwicklungsstand

Pico Core befindet sich aktuell in der **Foundation-Phase**.  
Die bestehende Version eignet sich bereits, um das Add-on, den Update-Weg, die API-Oberfläche und das Event-Modell zu testen.

Für den produktiven Einsatz fehlen derzeit noch unter anderem:

- Authentifizierung und Berechtigungen
- policy-gesteuerte Tool-Ausführung
- Migrations- und Backup-/Rollback-Konzepte
- verschlüsselte Datendomänen
- die eigentliche Companion-Oberfläche
