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

1. **Update-/Release-Integritaets-Threat-Model (ADR-wuerdig, hoechste
   Prioritaet).** Der Update-Kanal ist der einzige Pfad, der alle
   anderen Grenzen gleichzeitig aushebelt. Zu entscheiden:
   Image-/Release-Signierung und Provenance mit bestehenden Werkzeugen
   (ADR 0016: keine eigene Krypto), Downgrade-Schutz beim Update,
   non-root Container, AppArmor-Profil fuers Add-on. ADR 0005 nennt die
   Luecken bereits als fehlend.
2. **Key-Hygiene zur Laufzeit (ehrlicher kleiner ADR).** Node kann kein
   mlock; GC-Kopien, Swap und Core-Dumps sind ungeregelt. Festhalten,
   was memzero, 0600/0700 und die Prozessgrenze (ADR 0097) leisten und
   was Residuum bleibt; billige Mitigationen: Core-Dumps aus,
   verschluesselter Swap als Anforderung ans Pico-Home-Image (ADR 0027).
3. **Audit-Integritaet (Absatz-Entscheidung vor Action History).** Die
   `auth.*`-Records sind append-only, aber nicht manipulationsevident.
   Vor dem Bau von ADR 0011s Produkt-Audit entscheiden, ob
   Hash-Chaining oder signierte Checkpoints noetig sind.
4. **Mechanik-Rest.** HTTP-Security-Header auf der Foundation-Flaeche
   (CSP `default-src 'self'`, `X-Content-Type-Options`,
   `frame-ancestors` - beruehrt `app.ts`, wartet auf den
   U4-Abschluss) und CI-Supply-Chain (Actions auf Commit-SHAs pinnen,
   Dependency-Audit-/Provenance-Gate neben `release:verify`).
5. **TPM-Plattform-Anker** als explizites Gate in ADR 0027 heben statt
   verstreuter Fussnoten (R6-Rollback- und
   Matching-Backup-Residuum).

Naechster Code-Block der Initiative ist Gate W1 (Einstieg in
`.agent-context.md`) - nach ADR 0115 U4, wegen der
`app.ts`-Ueberschneidung.

