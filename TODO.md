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
2. **DoS-/Ressourcen-Posture (ADR-wuerdig).** Event-Log- und
   Memory-Wachstum ohne Quota, Disk-voll-Verhalten unentschieden
   (fail-closed oder fail-open), Argon2-Kosten als CPU-Hebel am Login,
   Sender-Quotas aus ADR 0031 blocked-before-production. Faellig vor
   der Veroeffentlichung des Link-Intake-Ports.
3. **Zeit-Autoritaet (kleiner ADR).** Veto-, Recovery-, Freshness- und
   Expiry-Fenster haengen an der Host-Uhr; ein Angreifer mit
   Uhrenkontrolle kann Veto-Fenster vorspulen. Entscheiden, welche
   Fenster monotone Anker brauchen ("platform monotonic anchors" sind
   in den Sync-ADRs bereits als offen benannt).
4. **Key-Hygiene zur Laufzeit (ehrlicher kleiner ADR).** Node kann kein
   mlock; GC-Kopien, Swap und Core-Dumps sind ungeregelt. Festhalten,
   was memzero, 0600/0700 und die Prozessgrenze (ADR 0097) leisten und
   was Residuum bleibt; billige Mitigationen: Core-Dumps aus,
   verschluesselter Swap als Anforderung ans Pico-Home-Image (ADR 0027).
5. **Audit-Integritaet (Absatz-Entscheidung vor Action History).** Die
   `auth.*`-Records sind append-only, aber nicht manipulationsevident.
   Vor dem Bau von ADR 0011s Produkt-Audit entscheiden, ob
   Hash-Chaining oder signierte Checkpoints noetig sind.
6. **Mechanik-Rest.** HTTP-Security-Header auf der Foundation-Flaeche
   (CSP `default-src 'self'`, `X-Content-Type-Options`,
   `frame-ancestors` - beruehrt `app.ts`, wartet auf den
   U4-Abschluss) und CI-Supply-Chain (Actions auf Commit-SHAs pinnen,
   Dependency-Audit-/Provenance-Gate neben `release:verify`).
7. **TPM-Plattform-Anker** als explizites Gate in ADR 0027 heben statt
   verstreuter Fussnoten (R6-Rollback- und
   Matching-Backup-Residuum).

Naechster Code-Block der Initiative ist Gate W1 (Einstieg in
`.agent-context.md`) - nach ADR 0115 U4, wegen der
`app.ts`-Ueberschneidung.

## Handlungsfaehigkeit ohne Modell und ohne Netz

Die Person muss offline weiter das Noetige tun koennen: ein Foto fuer
spaeter aufnehmen, einen Termin eintragen, eine Notiz oder Erinnerung
setzen, lokal suchen, ein anstehendes Approval entscheiden. Nichts
davon braucht ein Modell, und nichts davon braucht das Internet. Als
Vertrag zugesagt ist diese Trennung bisher nirgends.

Vorhanden ist nur die halbe Antwort. ADR 0003 beschreibt Serverless
Mode als bewusst degradierten Betriebsmodus samt Liste dessen, was ohne
Server bleibt - aber serverbezogen, nicht modellbezogen, und in
`docs/architecture/implementation-status.md` als concept-only gefuehrt.
ADR 0048/0049 halten fest, dass ein Modellprovider nie Memory-Owner,
Policy-Autoritaet oder Executor wird; was Pico tut, wenn *kein*
Provider erreichbar ist, steht dort nicht - `model_provider_health` ist
Vokabular ohne Verhalten. ADR 0009 kennt den Avatarzustand "offline or
degraded" ohne Semantik.

Zu entscheiden (ADR-wuerdig, faellig vor der Companion-UX aus ADR 0117
X5 und vor dem ersten Action Runner):

1. **Der garantierte Kern.** Welche Wege duerfen per Zusage nie ueber
   Modell oder Netz laufen - Aufnahme (Foto, Audio, Notiz), Termin und
   Erinnerung, lokale Suche, Approval-Entscheidung, Recovery-Zugang.
   Das ist eine Zusage, kein Best-Effort: eine Aufnahme darf nicht
   daran scheitern, dass ihre Verschlagwortung nicht laufen kann.
2. **Verhalten des Rests.** Fail-closed und sichtbar statt still
   degradiert, und insbesondere kein stillschweigendes Ausweichen auf
   einen Cloud-Provider, wenn der lokale fehlt.
3. **Nachlauf.** Was beim Wiederverbinden nachgeholt wird
   (Verschlagwortung, Zusammenfassung, Terminvorschlaege), laeuft als
   idempotente Anreicherung ueber die vorhandenen Events und Reference
   Targets (ADR 0014/0068/0069) - nicht als zweite Wahrheit neben dem
   offline Erfassten.
4. **Anzeige.** "Kein Netz" und "kein Modell" sind verschiedene
   Zustaende und muessen fuer die Person unterscheidbar sein; ADR 0009
   braucht dafuer Semantik statt eines Sammelzustands.
5. **Laufende Delegationen.** Was mit einer bereits genehmigten
   proaktiven Delegation (ADR 0037) geschieht, wenn kein Provider
   erreichbar ist - fail-closed oder deterministische Regel laeuft
   weiter.

Randbedingungen, die die Entscheidung mitbestimmen:

- Ein Telefon traegt heute ein Modell der 3B-Klasse (1-2 GB resident,
  NPU-Durchsatz in der Groessenordnung 40-50 Token/s). Das deckt die
  quarantaenisierte Reader-Rolle aus ADR 0117 ab, nicht den Planner.
  Die Begruendung von ADR 0048 ("a phone ... may not be able to run a
  strong local model") ist damit praeziser zu fassen: schwach heisst
  planner-schwach, nicht modelllos.
- Plattform-Inferenz rechnet auf dem Geraet, aber im Herstellerprozess
  (Apple FoundationModels, Android AICore/ML Kit). Seit dem
  `LanguageModel`-Protokoll in iOS 27 kann hinter derselben API auch
  ein Cloud-Provider stehen. Lokalitaet ist aus der Schnittstelle nicht
  mehr ableitbar und muss im Registry-Eintrag nach ADR 0049 geprueft
  statt geglaubt werden.
- Ein Hintergrund-Companion nach ADR 0105 kann unter iOS kein eigenes
  Modell resident halten. Der Herstellerdienst loest das, ein
  eingebetteter Runtime-Pfad nicht; fuer Mobile fehlt die Entscheidung,
  die ADR 0113 fuer Desktop getroffen hat.
- ADR 0083/0085 sind der einzige Ort, an dem fehlende Konnektivitaet
  heute nicht degradiert, sondern verweigert: ohne injizierten
  Checkpoint-Transport bleibt Freshness `unavailable` und die
  Envelope-Ausgabe faellt fail-closed. Das ist gewollt und gehoert als
  benannte Ausnahme in den Vertrag.
