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

## Security-Initiative: offener Backlog

ADR 0116 und ADR 0117 sind entschieden (Gates W1-W6 und X1-X5, alle
offen); `SECURITY.md` existiert seit 2026-08-01. Dieser Backlog sammelt
die noch nicht entschiedenen Folge-Themen der Initiative, priorisiert:

1. **Mechanik-Rest.** HTTP-Security-Header auf der Foundation-Flaeche
   (CSP `default-src 'self'`, `X-Content-Type-Options`,
   `frame-ancestors` - beruehrt `app.ts`, wartet auf den
   U4-Abschluss). Die CI-Supply-Chain-Haelfte ist mit ADR 0122
   entschieden (Gates Y1/Y4) und hier gestrichen.
2. **TPM-Plattform-Anker** als explizites Gate in ADR 0027 heben statt
   verstreuter Fussnoten (R6-Rollback- und
   Matching-Backup-Residuum).

Naechster Code-Block der Initiative ist Gate W1 (Einstieg in
`.agent-context.md`) - nach ADR 0115 U4, wegen der
`app.ts`-Ueberschneidung.

