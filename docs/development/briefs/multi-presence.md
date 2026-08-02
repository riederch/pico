# Arbeitsauftrag: PICO für mehrere gleichzeitige Präsenzen offenhalten

## Ziel

Die Architektur von PICO soll so dokumentiert und weiterentwickelt werden, dass eine einzelne PICO-Identität gleichzeitig über mehrere Geräte und Ausführungsumgebungen präsent sein kann.

Mögliche Präsenzklassen umfassen insbesondere:

- mobile Endgeräte
- Desktop- und Laptop-Systeme
- stationäre lokale Installationen
- eingebettete Systeme
- Fahrzeugplattformen
- mobile oder verkörperte Robotiksysteme

Dabei darf keine Bindung an einen bestimmten Hersteller, ein bestimmtes Betriebssystem, eine bestimmte Hardwareform oder ein bestimmtes Robotik-Framework entstehen.

Die Anpassung soll primär auf ADR- und Architekturebene erfolgen. Es ist keine vollständige Implementierung der Präsenzorchestrierung erforderlich, sofern der aktuelle Projektstand dafür noch nicht bereit ist.

---

## Leitprinzip

> Eine PICO-Identität kann mehrere gleichzeitige Präsenzen besitzen.  
> Eine Präsenz ist keine eigenständige PICO-Persönlichkeit und erhält durch ihre Hardwareform keine zusätzliche Autorität.

Alle Präsenzen teilen dieselbe logische Identität und Kontinuität, verfügen jedoch über eigenen lokalen Laufzeit-, Geräte- und Sicherheitszustand.

---

## Begriffe

### PICO-Identität

Die langfristige, geräteunabhängige Entität.

Dazu gehören insbesondere:

- Identität und Persönlichkeit
- Beziehungen und Berechtigungen
- langfristige Erinnerungen
- Richtlinien und Autoritätsgrenzen
- Audit- und Ereignishistorie
- bekannte Fähigkeiten und Präferenzen
- Kontinuität von Gesprächen und Aufgaben

### Präsenz

Eine aktive oder registrierte Ausführung von PICO auf einem konkreten Gerät oder in einer konkreten Laufzeitumgebung.

Eine Präsenz besitzt unter anderem:

- eine eindeutige Presence-ID
- eine Geräte- oder Runtime-ID
- einen Präsenztyp
- einen aktuellen Verbindungsstatus
- lokal verfügbare Fähigkeiten
- lokale Ein- und Ausgabekanäle
- lokalen Sicherheits- und Gerätezustand
- einen begrenzten, kurzlebigen Laufzeitkontext

### Verkörperung

Eine Präsenz mit physischen Sensoren oder Aktoren.

Eine Verkörperung ist eine Spezialisierung einer Präsenz und kein eigener Identitäts- oder Autoritätstyp.

### Capability

Eine typisierte, deklarierte und autorisierte Fähigkeit einer Präsenz.

Beispiele für Capability-Klassen:

- Audioeingabe
- Audioausgabe
- visuelle Ausgabe
- Kamera- oder Sensoreingabe
- Benachrichtigung
- Navigation
- Gestik
- Manipulation
- Umgebungssteuerung
- Fahrzeug- oder Mobilitätsfunktionen

Konkrete Herstellerbefehle, Protokolle und Gerätedetails dürfen nicht Teil der PICO-Core-Domäne sein.

---

## Erforderliche Architekturentscheidungen

### 1. Identität und Präsenz strikt trennen

Die ADRs müssen eindeutig festhalten:

- Eine Geräteinstallation ist nicht automatisch eine eigene PICO-Identität.
- Mehrere Präsenzen dürfen gleichzeitig aktiv sein.
- Eine Präsenz kann vorübergehend offline sein, ohne dass die Identität verloren geht.
- Das Entfernen oder Ersetzen eines Geräts darf keine neue Persönlichkeit erzeugen.
- Gerätewechsel müssen ohne künstlichen Identitätsbruch möglich bleiben.
- Eine Präsenz darf nur den Zustand synchronisieren, für den sie autorisiert ist.

### 2. Dauerhaften und lokalen Zustand trennen

Der persistente PICO-Zustand darf nicht mit gerätespezifischem Laufzeitzustand vermischt werden.

#### Dauerhaft und geräteunabhängig

- Identität
- Beziehungen
- langfristige Erinnerungen
- Richtlinien
- Autoritätsmodell
- bestätigte Präferenzen
- relevante Aufgaben- und Ereignishistorie

#### Lokal und überwiegend kurzlebig

- Akkustand
- Gerätezustand
- aktive Mikrofon- oder Kamerasitzung
- lokale Position
- Körperhaltung
- aktueller Bildschirmzustand
- kurzfristiger Cache
- verfügbare Sensoren und Aktoren
- lokale Sicherheitszustände
- laufende Echtzeitsteuerung

Nur fachlich relevante und ausdrücklich freigegebene Informationen dürfen vom lokalen Präsenzzustand in den dauerhaften Zustand übernommen werden.

### 3. Capabilities statt Gerätetypen verwenden

PICO Core darf Entscheidungen nicht an konkrete Geräteklassen koppeln.

Nicht erwünscht:

```text
if device_type == "robot":
    ...
```

Bevorzugt:

```text
if presence.supports("navigation"):
    ...
```

Geräte melden ihre Fähigkeiten deklarativ. Der Core plant anhand verfügbarer Capabilities, Sicherheitsrichtlinien, Autorisierungen und Kontext.

### 4. Adaptergrenze definieren

Hersteller-, Plattform- und Protokolldetails müssen hinter Adaptern liegen.

Vorgesehene Schichten:

```text
PICO Core
→ semantische Aktion
→ Capability- und Policy-Prüfung
→ Action Runner
→ Presence-Adapter
→ lokale Plattform- oder Gerätesteuerung
```

Der PICO Core darf keine hardwarespezifischen Befehle, Busnachrichten, Gelenkwerte, Motorparameter oder Echtzeit-Regelgrößen erzeugen.

### 5. Sicherheitskritische Steuerung aus dem Core ausschließen

Für verkörperte, mobile oder fahrzeugnahe Präsenzen gilt zwingend:

- Echtzeitregelung bleibt lokal.
- Kollisionsvermeidung bleibt lokal.
- Stabilisierung und Bewegungsregelung bleiben lokal.
- Kraft-, Geschwindigkeits- und Arbeitsraumgrenzen bleiben lokal.
- Not-Aus und sichere Zustände bleiben unabhängig vom PICO Core wirksam.
- Sicherheitskritische Steuerung darf nicht von generativer Ausgabe unmittelbar ausgeführt werden.
- Der Ausfall von Netzwerk, Cloud, Core oder Sprachmodell muss in einen lokal sicheren Zustand führen.
- Eine Präsenz darf nur semantische, typisierte und validierte Aktionen entgegennehmen.
- Sicherheitskritische Funktionen benötigen gesonderte Freigaben und dürfen nicht allein aus der Existenz einer Capability abgeleitet werden.

### 6. Autorität nicht aus der Hardwareform ableiten

Eine Präsenz erhält keine erweiterten Rechte, weil sie:

- stationär installiert ist
- mobil ist
- Sensoren besitzt
- Aktoren besitzt
- physisch verkörpert ist
- in ein Fahrzeug oder eine andere eingebettete Plattform integriert ist

Berechtigungen werden ausschließlich durch das bestehende Autoritäts-, Policy- und Bestätigungsmodell vergeben.

### 7. Gleichzeitige Präsenzen und Übergaben ermöglichen

Die Architektur muss mehrere parallele Präsenzen zulassen.

Dazu sind mindestens folgende Konzepte vorzusehen:

- Presence Registry
- Capability Registry
- Presence Heartbeat oder Lease
- Prioritäts- und Auswahlregeln
- Gesprächs- und Aufgabenübergabe
- Konfliktbehandlung
- Idempotenz
- Ereigniskorrelation
- Ownership für laufende Aktionen
- kontrollierte Übernahme bei Verbindungsverlust

Eine Aktion darf nicht unbeabsichtigt mehrfach ausgeführt werden, nur weil mehrere Präsenzen denselben Kontext erhalten.

### 8. Datenschutz und Datenminimierung berücksichtigen

Präsenzen dürfen nur die Daten erhalten, die für ihre Aufgabe erforderlich sind.

Insbesondere:

- Sensorströme standardmäßig lokal verarbeiten, soweit möglich.
- Rohdaten nicht automatisch dauerhaft speichern.
- Standort-, Audio-, Video- und Umgebungsdaten als besonders schützenswert behandeln.
- Präsenzbezogene Daten mit Herkunft, Zweck und Lebensdauer versehen.
- Synchronisierung und Aufbewahrung nachvollziehbar dokumentieren.
- Benutzerseitige Deaktivierung einzelner Sensoren, Aktoren und Präsenzen ermöglichen.

---

## Vorgeschlagenes Domänenmodell

Das konkrete Modell ist an die bestehende Codebasis anzupassen. Die folgenden Strukturen definieren die erforderliche Semantik.

```ts
type PresenceId = string;
type CapabilityId = string;

interface PicoPresence {
  id: PresenceId;
  runtimeId: string;
  presenceClass: string;
  status: "online" | "degraded" | "offline" | "disabled";
  capabilities: PresenceCapability[];
  securityProfile: string;
  lastSeenAt: string;
}

interface PresenceCapability {
  id: CapabilityId;
  version: string;
  mode: "observe" | "notify" | "act";
  riskClass: "low" | "medium" | "high" | "safety_critical";
  requiresConfirmation: boolean;
  constraints: Record<string, unknown>;
}

interface PresenceActionRequest {
  requestId: string;
  correlationId: string;
  presenceId: PresenceId;
  capabilityId: CapabilityId;
  intent: string;
  parameters: Record<string, unknown>;
  requestedBy: string;
  expiresAt?: string;
}
```

Die Namen sind nicht verbindlich. Verbindlich sind:

- eindeutige Identifikation
- typisierte Capabilities
- Risikoklassifizierung
- Constraints
- Bestätigungsanforderungen
- Korrelation und Idempotenz
- explizite Zielpräsenz

---

## Anpassung der ADRs

### Vorgehen

1. Bestehende ADRs zu Clients, Delegation, Hardware, Sicherheit, Zustand und Fähigkeiten identifizieren.
2. Bestehende Entscheidungen erweitern, wenn die neue Aussage eine direkte Präzisierung darstellt.
3. Einen neuen ADR anlegen, wenn Identität, Präsenz und Verkörperung bisher nicht als eigene Architekturgrenze beschrieben sind.
4. Keine bestehende Entscheidung stillschweigend umdeuten.
5. Widersprüche zwischen alten und neuen ADRs ausdrücklich dokumentieren und auflösen.
6. ADR-Index, Architekturübersicht und Implementation-Status aktualisieren.
7. Nur Nummern und Dateinamen verwenden, die zur tatsächlichen Repository-Struktur passen.

### Neuer oder zu erweiternder ADR

Der ADR sollte mindestens folgende Abschnitte enthalten:

- Status
- Kontext
- Entscheidung
- Begriffsdefinitionen
- Zustandsgrenzen
- Capability- und Adaptermodell
- Autoritätsgrenzen
- Sicherheitsgrenzen
- Synchronisation und Konfliktbehandlung
- Konsequenzen
- Nicht-Ziele
- Migrationshinweise
- offene Implementierungspunkte

### Verbindliche Kernaussage

Der ADR muss sinngemäß festhalten:

> PICO wird als eine geräteunabhängige Identität mit mehreren gleichzeitigen Präsenzen modelliert. Präsenzen stellen lokale Ein- und Ausgaben sowie deklarierte Fähigkeiten bereit. Geräte-, Plattform- und Echtzeitdetails bleiben hinter Adaptern und lokalen Sicherheitssteuerungen. Die physische oder technische Form einer Präsenz verändert weder Identität noch Autorität.

---

## Nicht-Ziele

Diese Anpassung soll derzeit nicht:

- eine bestimmte Roboterplattform auswählen
- eine bestimmte Fahrzeugplattform auswählen
- ein bestimmtes Betriebssystem voraussetzen
- einen Herstelleradapter implementieren
- autonome sicherheitskritische Steuerung ermöglichen
- Low-Level-Motorik oder Echtzeitregelung in PICO Core aufnehmen
- vollständige verteilte Konsistenz garantieren
- sämtliche bestehenden Clients sofort migrieren
- bestehende Sicherheits- oder Bestätigungsregeln umgehen
- eine neue PICO-Identität pro Gerät erzeugen

---

## Erwartete Änderungen im Repository

Mindestens prüfen und gegebenenfalls anpassen:

- ADRs
- ADR-Index
- Architekturübersicht
- Domänenbegriffe und Glossar
- Client- und Runtime-Dokumentation
- Capability- und Delegationsmodell
- Sicherheitsarchitektur
- Zustands- und Persistenzmodell
- Event- und Auditmodell
- Implementation-Status
- technische Roadmap oder TODO-Datei
- relevante Diagramme

Falls bereits ein Konzept für Full Clients, Light Clients, lokale Installationen oder delegierte Fähigkeiten vorhanden ist, muss die neue Präsenzsemantik darauf aufbauen und darf keine parallele, widersprüchliche Terminologie erzeugen.

---

## Qualitätsanforderungen

- Herstellerneutral
- plattformneutral
- transportneutral
- hardwareformneutral
- keine spekulative Produkt-Roadmap
- keine werbliche Sprache
- keine fiktionalen Vergleiche
- keine direkten Low-Level-Aktorbefehle im Core
- klare Trennung zwischen Konzept, geplantem Stand und implementiertem Stand
- bestehende Sicherheitsprinzipien bleiben mindestens erhalten
- neue Begriffe werden eindeutig definiert
- interne Links und ADR-Referenzen sind gültig
- Dokumentationsgeneratoren und Linter laufen erfolgreich

---

## Akzeptanzkriterien

Die Anpassung gilt als abgeschlossen, wenn:

1. Die Architektur ausdrücklich mehrere gleichzeitige Präsenzen einer PICO-Identität erlaubt.
2. Identität und Präsenz eindeutig voneinander getrennt sind.
3. Dauerhafter und lokaler Zustand getrennt beschrieben sind.
4. Gerätefunktionen über deklarierte Capabilities modelliert werden.
5. Hersteller- und Plattformdetails hinter Adaptern liegen.
6. Verkörperte und eingebettete Präsenzen keine implizite Zusatzautorität erhalten.
7. Sicherheitskritische Echtzeitsteuerung ausdrücklich außerhalb des PICO Core liegt.
8. Übergabe, Konflikte, Idempotenz und Aktions-Ownership konzeptionell berücksichtigt sind.
9. Datenschutz und Datenminimierung für Sensorpräsenzen berücksichtigt sind.
10. Keine Bindung an konkrete Hersteller, Produkte oder Frameworks eingeführt wurde.
11. Der tatsächliche Implementierungsstand korrekt gekennzeichnet ist.
12. Dokumentationsprüfungen, Links und vorhandene Tests erfolgreich durchlaufen.

---

## Validierung

Nach der Änderung:

1. Alle angepassten ADRs auf Widersprüche prüfen.
2. Interne Markdown-Links validieren.
3. ADR-Index und Architekturübersicht mit den tatsächlichen Dateien abgleichen.
4. Nach hart codierten Geräte- oder Herstellernamen in neuen Architekturtexten suchen.
5. Nach Low-Level-Steuerbegriffen im PICO-Core-Kontext suchen.
6. Dokumentations-Linter und vorhandene Repository-Checks ausführen.
7. Änderungen in einer kurzen Abschlussnotiz zusammenfassen.

Die Abschlussnotiz soll enthalten:

- geänderte Dateien
- neue oder angepasste Architekturentscheidungen
- bewusst nicht implementierte Punkte
- erkannte Altlasten oder Widersprüche
- ausgeführte Prüfungen und deren Ergebnis
