# Pico Agent Instructions

Diese Regeln gelten fuer das gesamte Repository. Unterverzeichnisse duerfen sie
durch eigene `AGENTS.md`-Dateien nur fuer ihren Scope verfeinern.

## Projekt und Quellenhierarchie

Pico ist eine local-first Personal AI Companion Foundation. Der aktuelle Fokus
liegt auf belastbarer Foundation-, Security-, Identity-, Home-, Memory- und
Protocol-Arbeit, nicht auf vorschnell behaupteten Produktfeatures.

Bei widerspruechlichen Aussagen gilt diese Reihenfolge:

1. aktueller Code, Tests, Migrationen und live gepruefter Git-Stand
2. `docs/architecture/implementation-status.md` fuer den nachgewiesenen ADR-Stand
3. angenommene ADRs fuer Architektur- und Security-Richtung
4. `progress.md` als periodische Fortschrittsschaetzung
5. `.agent-context.md` als kompakter aktueller Handoff

Ein ADR oder eine Fortschrittsangabe ist kein Implementierungsnachweis. Vor
Statusaussagen immer relevante Runtime, Tests und Konfiguration direkt pruefen.

## Einstieg in einen Lauf

- Zuerst `git status --short --branch` und die letzten Commits pruefen.
- Danach `.agent-context.md` und nur die fuer die Aufgabe relevanten ADRs lesen.
- Bestehende fremde oder unklare Arbeitsbaum-Aenderungen erhalten.
- Paket-, Release- und Betriebsdetails bei Bedarf in
  `docs/development/agent-runbook.md` nachschlagen.

## Arbeitsmodus

- Einen eindeutigen technischen Folgeauftrag als zusammenhaengenden,
  releasefaehigen Milestone fertigstellen; nicht nach jedem kleinen Patch
  abbrechen.
- Rueckfragen nur bei echter Nutzerentscheidung: mehrere fachlich verschiedene
  Architekturwege, Security-/Privacy-Modell, Breaking Contract, Produktumfang,
  rechtliche/kommerzielle Regeln oder fehlende externe Autoritaet.
- Bei ausdruecklicher Anweisung, bis zur naechsten notwendigen Interaktion
  weiterzuarbeiten, sichere zusammenhaengende Follow-ups autonom erledigen.
- Stoppen bei Nutzerentscheidung, Approval-/Umgebungsblocker, erforderlichem
  GitHub-Sync, unerwartetem fremdem Arbeitsbaum oder notwendigem Model-/
  Effort-Wechsel.

## Model und Effort

Vor einem groesseren Schritt das fuer den **konkret naechsten** Block notwendige
Modell plus Effort empfehlen. Die Empfehlung ist keine globale
Projekteinstellung und wird bei jedem neuen Block neu bewertet.

- Codex `gpt-5.6-terra + high`: klar begrenzte Runtime-Arbeit, Tests,
  mechanischer Doku-Nachzug und kleine Reviews.
- Codex `gpt-5.6-sol + xhigh`: paketuebergreifende Implementierung,
  Security-/Authority-Grenzen, Architektur und lange autonome Ketten.
- Claude Code `Sonnet 5 + high`: klar begrenzte Runtime-Arbeit, Tests und
  mechanischer Doku-Nachzug.
- Claude Code `Opus 5 + high/xhigh`: normale Runtime- und Konzeptarbeit,
  paketuebergreifende Implementierung entlang eines entschiedenen Vertrags.
- Claude Code `Fable 5 + xhigh/max`: echte Architektur-Forks und besonders
  heikle Security-/Crypto-Entscheidungen. Fable 5 steht ueber Opus 5.

Hoehere Codex-Stufen als `xhigh` sind derzeit keine Pico-Projektstufen.
Orchestrierung oder Multi-Agent-Workflows nur nach ausdruecklichem Opt-in des
Nutzers; Modell und Effort bleiben davon unabhaengige Achsen.

Der Agent kann die UI-/Runtime-Einstellung nicht selbst pruefen. Fuer groessere
Schritte zaehlt die explizite Angabe des Nutzers im Chat.

## Git und Aenderungsscope

- Abgeschlossene, verifizierte Arbeitsstaende lokal mit repraesentativer Message
  committen.
- Der Nutzer pusht ueber PhpStorm. Push, Pull, Fetch und sonstiger GitHub-Sync
  bleiben beim Nutzer, sofern er nichts anderes explizit beauftragt.
- Unverwandte Aenderungen nicht anfassen oder in den eigenen Commit aufnehmen.
- Keine Breaking Changes an Foundation-API, Protocol-Semantik, JSON-Shapes oder
  Datenmigrationen ohne ausdruecklichen, dokumentierten Milestone.
- Bei Compatibility-, Security- oder Produktclaims die betroffenen ADRs und
  `docs/architecture/implementation-status.md` im selben Milestone pruefen.

## Verifikation

`pnpm` ist der einzige gewollte Node-Paketmanager. Auf der aktuellen
Arbeitsumgebung ist der robuste Aufruf:

```bash
npx pnpm@9.0.0 <script>
```

Bei Codeaenderungen zuerst fokussierte Paketchecks und vor dem lokalen
Milestone-Commit den kompletten Gate ausfuehren:

```bash
npx pnpm@9.0.0 release:verify
```

Dieser Gate umfasst Lizenzkonsistenz, Versionskonsistenz, Build, Typecheck und
alle Tests. Bei reinen internen Agent-Dokumentationsaenderungen genuegen
`git diff --check`, Link-/Strukturpruefung und die direkt betroffenen
Konsistenzchecks; produkt- oder releasebezogene Doku braucht den vollen Gate.

## Dauerhafte Produktinvarianten

- Assistant macht Vorschlaege; Pico Rules/Policy entscheidet; Action Runner
  fuehrt nur freigegebene Aktionen aus; Action History dokumentiert.
- Home-Administration ist keine Domain-Readership. Home Membership allein
  gewaehrt weder Domain Content Keys noch Klartextzugriff.
- Pico Identity, Device, Home Host, Domain Content, Transport und Relay Keys
  bleiben getrennte Rollen. Keine eigene Kryptographie entwickeln.
- Pico Relay und Transport Adapter besitzen keine Identitaets-, Policy-,
  Membership-, Action- oder Decryption-Autoritaet.
- Die Foundation-HTTP-/WebSocket-Flaeche ist lokale Diagnose-/Foundation-
  Infrastruktur, keine oeffentliche Remote-API und kein Pico-Link-Transport.
- Kein Portforwarding oder public Reverse Proxy als Produktmodell empfehlen.
- `apps/web` bleibt frameworkfrei und erhaelt keine Runtime-Abhaengigkeiten.
- Keine REST-Endpunkte allein fuer Dashboard-Komfort einfuehren.
- Reservierte oder draft-only Protocol-Surfaces duerfen keine Runtime-,
  Security-, Conformance- oder Compatibility-Claims erhalten.
- Keine versteckten Automationen und keine Umgehung von Policy, Consent oder
  Audit.

Details und Begruendungen stehen in den jeweiligen ADRs; diese Liste ersetzt sie
nicht.

## Dokumentationsrollen

- `README.md`: nichttechnischer Projektueberblick.
- `ReadmeTech.md`: vollstaendiger technischer README.
- `progress.md`: periodischer Komponentenstatus und Schaetzungen.
- `docs/architecture/implementation-status.md`: ADR-zu-Runtime-Matrix.
- `.agent-context.md`: nur aktueller Handoff, Zielgroesse maximal 200 Zeilen.
- `docs/development/agent-runbook.md`: bedarfsweise Toolchain-/Betriebsdetails.

Keine historische Folge von Testlaeufen oder erledigten Milestones in
`.agent-context.md` fortschreiben. Git-Historie ist der Verlauf; dauerhafte
technische Erkenntnisse gehoeren in ADRs, Tests oder den Runbook.

## Abschluss und Handoff

Im finalen Status immer den konkreten Stoppgrund und den naechsten Einstiegspunkt
nennen. Bei jedem abgeschlossenen Milestone `.agent-context.md` kurz und
handlungsorientiert aktualisieren: aktueller Stand, maximal fuenf relevante
Aenderungen, offene Risiken, genau der naechste Block sowie dessen Model-/
Effort-Empfehlung.
