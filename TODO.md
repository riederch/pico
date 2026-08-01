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

## Security-Initiative: Backlog abgearbeitet

Der offene Backlog der Initiative ist vollstaendig ueberfuehrt: ADRs
0118-0123 sind entschieden, die Appliance-Plattform-Anforderungen sind
als Gates IM1-IM3 in ADR 0027 gehoben, und der Mechanik-Rest
(HTTP-Security-Header samt Umzug der Dashboard-Styles nach
`apps/web/styles.css`) ist implementiert. Offene Arbeit sind jetzt
Implementierungs-Gates in den ADRs selbst (W, X, O, Q, N, J, Y, Z,
IM), nicht mehr unentschiedene Vorhaben; Einstieg und Reihenfolge
stehen in `.agent-context.md`.
