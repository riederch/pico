# TODO

Offene, noch nicht entschiedene Vorhaben. Architekturentscheidungen gehoeren in
ADRs, Arbeitsstand in `.agent-context.md`, Fortschritt in `progress.md`.

## Lizenzbedingungen: anwaltliche Durchsicht

Die Bedingungen sind geaendert und als ADR 0111 dokumentiert: betriebliche
Eigennutzung auf einem selbst betriebenen Pico Home ist erlaubt, kommerzielles
Pico-Hosting bleibt beim designierten Pico Rights Holder.

Offen ist nur noch Gate L3 aus ADR 0111: **anwaltliche Durchsicht der
Formulierungen.** Die zwei Stellen mit dem meisten Gewicht sind

- die Definition "self-operated Pico Home" (Key-Custody plus Betrieb statt
  Hardwarebesitz) und
- die Abgrenzung bezahlte Wartung gegen Betrieb durch Dritte.

Bis dahin keine Aussenkommunikation, die die neue Erlaubnis als rechtlich
geprueft darstellt.

## Mehrere gleichzeitige Praesenzen einer PICO-Identitaet

Arbeitsauftrag liegt vor (`PICO_Multi_Presence_ADR_Arbeitsauftrag.md`, Stand
2026-08-02). Ziel ist eine Architektur, in der eine PICO-Identitaet
gleichzeitig ueber mehrere Geraete und Laufzeitumgebungen praesent ist:
Mobilgeraet, Desktop, stationaere Installation, eingebettetes System,
Fahrzeug, verkoerperte Robotik. Leitsatz: eine Praesenz ist keine eigene
PICO-Persoenlichkeit und erhaelt durch ihre Hardwareform keine zusaetzliche
Autoritaet.

Der Auftrag ist ausdruecklich ADR- und Architekturarbeit; eine vollstaendige
Praesenzorchestrierung ist nicht gefordert. Verlangt sind unter anderem:
Trennung von Identitaet und Praesenz, Trennung von dauerhaftem und lokalem
Zustand, Capabilities statt Geraetetypen, eine Adaptergrenze, Ausschluss
sicherheitskritischer Echtzeitsteuerung aus dem Core, Praesenz-Registry mit
Heartbeat, Uebergabe/Idempotenz/Ownership sowie Datenminimierung fuer
Sensorpraesenzen.

Vor dem Schreiben zu entscheiden:

- **Terminologie gegen ADR 0015.** Dort stehen bereits Full Client, Light
  Client, Relay Server und Core Host als Knotenrollen. Der Auftrag verbietet
  eine parallele, widerspruechliche Begriffswelt. Zu klaeren ist, ob
  "Praesenz" die Knotenrollen ersetzt, verfeinert oder quer dazu steht.
- **Capability-Begriff gegen ADR 0036.** Dort sind Capabilities, Connectors
  und die MCP-Grenze bereits belegt. Die `PresenceCapability` des Auftrags
  (mit `riskClass` und `requiresConfirmation`) muss darauf aufbauen statt
  denselben Namen zweimal zu vergeben. Auch ADR 0010 (Tool-Policy und
  Executor) und ADR 0048 (Model-Capability-Delegation) sind zu pruefen.
- **ADR-Nummer.** Die naechste freie Nummer ist 0124, die der
  PAS-Arbeitsauftrag ebenfalls beansprucht. Wer zuerst schreibt, nimmt 0124;
  der andere Block nimmt 0125. Nicht doppelt vergeben.
- **Verhaeltnis zu ADR 0113.** Der Companion ist heute eine einzelne
  Desktop-Praesenz. Ob C1/C2 rueckwirkend als Praesenz beschrieben wird oder
  erst kuenftige Blocks, ist eine bewusste Entscheidung.

Beruehrt ausserdem: ADR 0104 (Einstellungen gehoeren nach Pico), ADR 0117
(Origin-bewusster Datenfluss), ADR 0118 (Offline-Degradation) und
`implementation-status.md` als Index.

## Security-Initiative: Backlog abgearbeitet

Der offene Backlog der Initiative ist vollstaendig ueberfuehrt: ADRs
0118-0123 sind entschieden, die Appliance-Plattform-Anforderungen sind
als Gates IM1-IM3 in ADR 0027 gehoben, und der Mechanik-Rest
(HTTP-Security-Header samt Umzug der Dashboard-Styles nach
`apps/web/styles.css`) ist implementiert. Offene Arbeit sind jetzt
Implementierungs-Gates in den ADRs selbst (W, X, O, Q, N, J, Y, Z,
IM), nicht mehr unentschiedene Vorhaben; Einstieg und Reihenfolge
stehen in `.agent-context.md`.
