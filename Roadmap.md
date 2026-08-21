# Pico Roadmap

Dieses Dokument beantwortet für jeden Ast des Baums vier Fragen, und zwar in
dieser Richtung:

> **Warum existiert dieser Code?** → **Welche Anforderung verlangt ihn?** →
> **Welche Architekturentscheidung erklärt seine Form?** → **Welche Tests
> beweisen das gewünschte Verhalten?**

Es besitzt außerdem die **Reihenfolge**: Phasen, ihre Abhängigkeiten und die
terminierten Fixpunkte. Der nachgewiesene Gegenwartsstand steht nicht hier,
sondern in `progress.md`; die Entscheidungen stehen in den ADRs; die nächste
Handlung *heute* steht in `.agent-context.md`.

## Metadaten

| Feld | Wert |
| --- | --- |
| Standdatum | 2026-08-21 |
| Analysierter Commit | b9f561c |
| Wurzel | ADR 0008 (entschieden) und `README.md` (nach außen gesagt) |
| Anforderungsschicht | rekonstruiert, siehe Warnung unten; A14 und A15 am 2026-08-21 gehoben |

**Die Anforderungsschicht ist der einzige erfundene Teil dieses Baums.** Sie
stand nirgends geschrieben: `docs/` hat `architecture`, `assets`,
`design-system`, `development`, `protocol` und `release` — kein
Anforderungsverzeichnis. Die fünfzehn Sätze in A1–A15 sind aus den normativen
Bestandteilen der Wurzel abgeleitet und mit ihnen belegt, aber sie sind **keine
getroffene Entscheidung**. Wer sie als solche zitiert, zitiert eine Lesart.

## Der Baum

### Wie er zu lesen ist

Ein Knoten ist kein Etikett, sondern eine Antwort. Ein Ast liest sich von unten
nach oben — vom Code zur Anforderung — und von oben nach unten, wenn man wissen
will, was aus einer Entscheidung geworden ist.

Wo eine Ebene mehr als etwa sieben Geschwister trägt, sind sie zu einer Gruppe
zusammengefasst; gruppiert wird nach der gemeinsamen Frage, die die Kinder
beantworten, nicht nach Nummernbereich. Eine Gruppe von eins gibt es nicht.

**Nicht jeder Ast braucht ein ADR.** Wo keine Architekturentscheidung nötig war,
geht es von der Anforderung direkt zur Implementierung — der Ast sagt dann, dass
und warum keine nötig war. Der Befund ist nicht „Anforderung ohne ADR", sondern
„Anforderung ohne nachvollziehbare technische Ableitung", und nachvollziehbar
heißt: Datei und Evidenzblatt sind benannt.

**Evidenzblätter nennen Namen, keine Zahlen.** Ein Blatt sagt, *worauf* sich eine
Implementierungsbehauptung stützt — welches Gate, welcher Test. Wie viele Tests
grün sind, steht in `progress.md` und driftet dort unter Aufsicht.

### Wurzel

```
Pico
├─ ADR 0008 — Produktvision und Persona (entschieden)
│    Kernregel: Pico denkt und schlägt vor · die Policy entscheidet ·
│    der Executor führt aus · die Person bestätigt Risiko ·
│    das Audit-Log hält fest, was geschehen ist
│    Persona: hilfreich, aber nicht blind gehorsam · lokal zuerst ·
│    durchsichtig · vorsichtig · erklärungsfähig ·
│    täuscht keine Autorität vor, die es nicht hat
└─ README.md — dieselbe Wurzel nach außen
     Prämisse: „Personal AI should help people without taking away their
     control over their own data and decisions."
     Kernidee: Pico may suggest · Pico Rules decide · the Action Runner acts
     only after approval · Action History records what happened
     zehn Verbote („What Pico is not") und rund zwanzig Grenzaussagen
     („Current concept boundaries")
```

Die beiden Fassungen der Kernregel unterscheiden sich in der Zahl der Klauseln,
nicht in der Sache: das README faltet „the user confirms risk" in „acts only
after approval". Das ist eine Verdichtung, kein Widerspruch.

**Aspirativ und deshalb nicht in der Anforderungsschicht:** READMEs Abschnitt
„What Pico should become" ist eine Wunschliste — Meshtastic-Adapter, Uhren und
kleine Displays, Sprache, Avatar, plattformübergreifende Homes. Diese Sätze sind
Teil der Wurzel, aber sie verlangen nichts; sie stehen unter *Zukunft* oder
ausdrücklich außerhalb dieses Baums. Sie in Anforderungen zu übersetzen hieße,
eine Spezifikation zu rekonstruieren, die niemand beschlossen hat.

### A1 — Ein Pico gehört der Person, nicht dem Gerät, nicht dem Haus, nicht einem Anbieter

*Wurzelbeleg: die Prämisse; „not a cloud-only personal data silo"; „hosting is
not ownership over resident Pico identities or private data"; „relationships
belong to Picos, not Homes".*

```
A1
├─ Identität und Geräteschlüssel — was ein Pico ist und wie ein Gerät sich beweist
│  ├─ ADR 0079  Fingerabdrücke binden Suite, Rolle und Schlüssel, volle Länge
│  │    Form:   Vergleiche über volle Digests; die Darstellung entscheiden die
│  │            Oberflächen, die sie zeigen (I5)
│  │    Code:   packages/protocol/src/index.ts (32 buildPico*SignatureInput),
│  │            packages/protocol/src/fingerprint-display.ts
│  │    Beweis: check-fingerprint-display.mjs (widerlegt 2026-08-21 gegen
│  │            substring, benannte Auslassungspunkte, Doc-Kommentar),
│  │            check-wire-labels.mjs (129 Labels), fingerprint-display.test.ts
│  ├─ ADR 0108  Das erste delegierte Gerät wird mit dem Home gegründet
│  ├─ ADR 0109  Authentifizierter Gerätelebenszyklus über Pico Link
│  └─ ADR 0126  Eine Identität, viele Präsenzen
│       Beweis: check-presence-affordances.mjs (8 Affordances, keine trägt
│               Policy) — widerlegt gegen Policy-Namen und offenes Vokabular
├─ Was ein Pico und ein Home überhaupt sind
│  │  Gruppe: die Begriffe, auf denen alles andere steht.
│  ├─ ADR 0001  Pico-Fundament
│  ├─ ADR 0015  Vollclients, Leichtclients und Relay — die Knotenrollen
│  ├─ ADR 0026  Produktterminologie und Benennung
│  └─ ADR 0080  Home-Host-Key und Move-In-Claim: Bedrohungsmodell und Zeremonie
│       Code:   packages/protocol/src/index.ts (Claim- und Founding-Familien)
│       Beweis: apps/vault-daemon/src/claim-ceremony.test.ts,
│               founding-bootstrap.test.ts
├─ Custody — wo private Schlüssel liegen und wer sie bewegen darf
│  │  Gruppe, weil neun ADRs dieselbe Frage beantworten: der Schlüssel
│  │  verlässt den Vault nie, und jede Zeremonie fragt zuerst.
│  ├─ ADR 0081  Vault-exklusive Custody der Person-Rollen-Schlüssel
│  ├─ ADR 0097  Deployable Vault-Prozess und lokale IPC-Autoritätsgrenze
│  ├─ ADR 0099  Hold-Channel-Approval für autoritätsschaffende Signaturen
│  ├─ ADR 0100/0101/0102  Zeremonien über den Daemon, zwei Rollen, KEK
│  ├─ ADR 0103  Personseitiger Zeremonien-Client
│  └─ ADR 0123  Laufzeit-Schlüsselhygiene
│       Code:   packages/vault/src/index.ts, apps/vault-daemon/src/
│       Beweis: apps/vault-daemon/src/*.test.ts mit echten Prozessgrenzen;
│               check-runtime-floor.mjs (6 Pakete ohne ICU)
└─ Clients — dieselbe Person auf mehreren Geräten
   ├─ ADR 0130  Jeder Desktop arbeitet über den Companion
   │    Beweis: check-companion-boundary.mjs (Tray-Hülle 63 Module,
   │            schalenfreier Kern 66, 56 IPC-Kanäle beidseitig gleich benannt,
   │            15 Feldgrenzen als Namen)
   └─ ADR 0131  Android ist ein vollwertiger Client, keine Oberfläche
```

### A2 — Wer ein Home betreibt, stellt Infrastruktur und erwirbt kein Leserecht

*Wurzelbeleg: „the Home Host Pico may invite or remove Home Member Picos … but
must not decrypt, impersonate, rewrite or own them"; „personal context should
remain private unless a clear purpose and policy allow otherwise"; „the current
Foundation HTTP API is a trusted local diagnostics … interface".*

```
A2
├─ Inhalt liegt verschlüsselt — auch vor dem, der die Maschine besitzt
│  ├─ ADR 0070/0071/0072  Memory-Verschlüsselung, Bedrohungsmodell, Schlüsselablage
│  ├─ ADR 0073  AD-Kanonisierung und Testvektoren  (implementiert)
│  └─ ADR 0074  Aufbewahrung und Ablaufl schung
├─ Leserschaft ist eine eigene Autorität — Mitgliedschaft gewährt sie nicht
│  │  Gruppe, weil fünfzehn ADRs eine Frage beantworten: wie kommt Inhalt zu
│  │  genau einem berechtigten Leser, ohne dass der Host ihn sieht.
│  ├─ ADR 0078  Bedrohungsmodell Domain-Leserschaft
│  ├─ ADR 0082–0085  Identitätsgebundene Sessions, Reader-Key-Frische, Share Envelopes
│  ├─ ADR 0086–0093  Reader-Custody, KEK-Rotation, Sync-Transport, durabler Boden
│  └─ ADR 0094–0096  Expliziter Item-Zugriff, ephemerer Katalog, Lock-Lebenszyklus
│       Code:   packages/vault/src/index.ts, packages/sync/src/index.ts
│       Beweis: packages/sync/src/index.test.ts — enthält den Test, der den
│               abgelaufenen Batch gegen die erweiterte Jahresform verteidigt
│               (2026-08-20); check-store-writers.mjs (11 Stores, 47 Schreiber)
├─ Der Speicher selbst — was ein Home hält und was es davon löschen kann
│  ├─ ADR 0067  Payload-Haltung, Referenzziele und Tombstones
│  ├─ ADR 0068  Referenzziele und löschbarer Memory Store
│  └─ ADR 0069  Memory-Items aufzeichnen, Ereignisse nur als Referenz
│       Beweis: check-store-writers.mjs, apps/core/src/event-store.test.ts
├─ Wer am Home angemeldet ist — und was das nicht mitbringt
│  ├─ ADR 0075  Lokale Authentifizierung, Session und Mitgliedschaft
│  ├─ ADR 0076  Operator-Credential, Session und Bootstrap
│  ├─ ADR 0077  Memory-Content-Read-API und Domain-Readership-Naht
│  └─ ADR 0098  Reader-Access-Lease über den Vault-Daemon
│       Beweis: apps/core/src/app.test.ts, apps/vault-daemon/src/reader-access.test.ts
└─ Verwaltung und Bewohner sind getrennte Autoritäten
   ├─ ADR 0128  Home Assistant ist ein Host, kein Rahmen
   │    Beweis: check-modules.mjs — widerlegt gegen Speichermechanik in einem
   │            Modul und gegen einen Griff nach der Welt
   ├─ ADR 0024  Server-Bootstrap, Mandantenfähigkeit und Eviction
   ├─ ADR 0039/0040  WebSocket-Ticket-Grenze, HA-Ingress und Add-on-Token
   ├─ ADR 0087  Foundation-Operator und Home Host zusammengeführt und abgegrenzt
   ├─ ADR 0030/0038/0041  Foundation-API als lokale Diagnosefläche
   └─ ADR 0104  Einstellungen gehören Pico, nicht der Host-Konfiguration
        Beweis: check-settings-boundary.mjs — beidseitig widerlegt: eine
                unklassifizierte Variable, die der Parser liest, und eine
                klassifizierte, die er nicht mehr liest
```

### A3 — Pico erfindet keine Kryptografie und hält die Schlüsselrollen getrennt

*Wurzelbeleg: „not a project that invents its own cryptography"; „Pico identity,
device, Home, transport and domain keys are separate roles".*

```
A3
├─ ADR 0016  Kryptografie-Grenzen und Nicht-Ziele
├─ ADR 0034  Kanonisierung, Signatureingaben und Testvektoren   ⚠ Befund B3
├─ ADR 0029/0031/0032  Identitäts-, Relay- und Envelope-Richtung
├─ ADR 0133  Aus der Quelle ableiten, bis das Medium bekannt ist
├─ ADR 0134  Formate werden in place revidiert, bis zur ersten behaltenen Identität
└─ ADR 0033  Schlüssellebenszyklus, Rotation, Widerruf, Wiederherstellung
     Code:   packages/protocol/src/index.ts, packages/identity/src/index.ts
     Beweis: 5 Vektor-Testdateien im Protokoll, positive und negative;
             check-wire-labels.mjs
```

### A4 — Ein Identitätsverlust ist heilbar, und niemand Drittes entscheidet darüber

*Wurzelbeleg: „exit rights … as product features"; ADR 0008s Nicht-Ziel, keine
fremde Instanz über die Identität entscheiden zu lassen.*

```
A4
├─ ADR 0110  Recovery Card und zeitverzögerte Zero-Device-Recovery
├─ ADR 0112  Recovery-Produktflächen im Hintergrund-Companion
├─ ADR 0132  Die Recovery Card rendert aus Daten, ihre Hälften widersprechen sich nicht
├─ ADR 0114  Identitätswurzel-Rotation mit Beziehungskontinuität
└─ ADR 0115  Host-Key-Rotation mit signierter Kontinuität   (implementiert)
     Code:   apps/vault-daemon/src/recovery-card-*.ts, apps/companion/src/recovery-*.ts
     Beweis: recovery-card-entry.test.ts (die getippte Karte, seit 2026-08-19),
             card-pin.test.ts (das PIN-Alphabet aus dem Datensatz, 2026-08-21),
             check-instant-rules.mjs (die 48-Stunden-Frist wird aus der
             Konstante gesprochen, nicht daneben geschrieben)
```

### A5 — Ein Pico arbeitet ohne Netz und ohne Modell weiter

*Wurzelbeleg: „run locally where practical"; Persona „local-first".*

```
A5
├─ ADR 0118  Offline- und modellfreier Degradationsvertrag
│    Beweis: check-offline-floor.mjs — 6 von 6 Familien über 56 erreichbare
│            Module, mit eigenen Sonden im Skript
├─ ADR 0120  Zeitautorität und konservative Fensterauswertung
│    Form:   Zeit kommt nie aus dem Netz; Fenster werden konservativ gelesen
│    Beweis: check-time-authority.mjs (170 Quellen, 6 Wurzeln, 7 Manifeste) —
│            widerlegt 2026-08-21, dabei zwei ungedeckte Manifeste gefunden
├─ ADR 0119  Ressourcenerschöpfung und DoS-Haltung
└─ ADR 0129  Spatial Recall: Beobachtungen sind keine Erinnerungen   ⚠ Befund B4
```

### A6 — Pico schlägt vor, die Regeln entscheiden, der Runner handelt erst nach Freigabe

*Wurzelbeleg: die Kernidee beider Wurzelfassungen; „not a background automation
layer without clear confirmation"; „not a replacement for explicit user
approval".*

```
A6
├─ ADR 0139  Jede Handlung wird von jemandem beantragt, dem Pico nicht traut
├─ ADR 0140  Pico Rules entscheiden aus geschlossener Eingabe
├─ ADR 0141  Der Runner führt aus, was entschieden wurde; History ist eine Sicht
├─ ADR 0099  Approval über einen Hold-Channel  (auch A1)
├─ ADR 0106  Approval-Rendering aus den signierten Bytes
│    Warum:  der Satz, den eine Person freigibt, wird aus denselben geprüften
│            Feldern gerendert wie die signierten Bytes
│    Beweis: sign-rendering.test.ts — behauptet gegen die importierten Regeln
│            statt gegen Literale, damit keine Kopie mit sich selbst übereinstimmt
├─ ADR 0127  Module: verpflichtende Auslieferung, eigener Code, deklarierte Wirkungen
│    Warum:  ein Modul sagt, was es verursachen kann, und der Core entscheidet,
│            ob er es verursacht
│    Code:   modules/calendar, modules/depot, modules/home-assistant,
│            modules/spatial-recall
│    Beweis: check-modules.mjs (4 von 4 Modulen, 2 wirkungstragend)
├─ ADR 0010  Tool-Policy und Executor-Modell  (Substanz in 0139–0141 überführt)
├─ ADR 0037  Proaktive Delegation und Beschaffung  (konzeptionell)
└─ ADR 0105  Pico läuft als Hintergrund-Companion, nicht als CLI
     Beweis: check-product-path.mjs (12 produktbezogene Dokumente schicken
             niemanden durch die CLI), eigene Sonden im Skript
```

### A7 — Was geschehen ist, bleibt nachweisbar

*Wurzelbeleg: „Action History records what happened"; „auditability … as product
features"; Persona „transparent about actions".*

```
A7
├─ ADR 0014  Löschbarkeit und Append-only-Ereignisse
├─ ADR 0121  Manipulationsevidente Audit-Records und verankerte Checkpoints
├─ ADR 0011  Privatsphäre-, Sicherheits- und Audit-Modell  (vor Produktion blockiert)
└─ ADR 0141  Action History als Sicht über Ereignislog und Audit-Kette  (auch A6)
     Code:   apps/core/src/event-store.ts
     Beweis: apps/core/src/*.test.ts (Audit-Kette, Restore, Rollback)
```

Diese Anforderung wäre bei acht Sätzen verlorengegangen: ADR 0008s Kernregel hat
fünf Klauseln, und die fünfte ist diese. Sie ist der Grund, warum die Schicht
dreizehn Sätze hat und nicht acht. A14 und A15 kamen am 2026-08-21 dazu,
gehoben aus ADR 0122 und ADR 0125 - siehe Befund B1 und B2.

### A8 — Pico täuscht keine Autorität vor, die es nicht hat

*Wurzelbeleg: ADR 0008, wörtlich: „Pico must not pretend to have authority it
does not have."*

Diese Anforderung hat **kein eigenes ADR** und braucht keins. Sie ist eine Regel
über Sprache, und sie wird dort durchgesetzt, wo gesprochen wird — was sie
nachvollziehbar macht, sind Gates, nicht Entscheidungen.

```
A8
├─ ADR 0135  Eine Spezifikation, die ein Konsument nicht lesen kann, ist keine
│    Beweis: check-surface-classes.mjs (76 Flächen, 10 kanonische Formen) —
│            eigene Sonden im Skript
└─ direkte Umsetzung, ohne Architekturentscheidung
```
A8
└─ direkte Umsetzung, ohne Architekturentscheidung
     Warum:  eine Ablehnung, eine Frist und ein Schlüssel müssen sagen, was
             wahr ist, in der Sprache der Fläche, die sie zeigt
     Code:   packages/protocol/src/fingerprint-display.ts,
             packages/protocol/src/when-display.ts,
             packages/protocol/src/instant.ts
     Beweis: check-fingerprint-display.mjs · check-instant-rules.mjs
             (roher Instant, UTC-Schnitt, Tage in Blöcken, gesprochene
             Zeitspanne als Literal, eigene Kanonizitätsregel) —
             alle fünf Formen gepflanzt und gefangen
```

### A9 — Fremder Inhalt wird gezeigt, nie befolgt

*Wurzelbeleg: „not an uncontrolled chatbot with system access"; „not a tool
protocol wrapper that lets MCP or any connector bypass Pico's policy and audit
model"; „capabilities are evaluated above connector protocols".*

```
A9
├─ ADR 0116  Untrusted Content und selbstreplizierende Prompts
├─ ADR 0117  Planner-Reader-Split und herkunftsbewusste Datenflusspolitik
├─ Zulieferer — fremde Quellen laufen hinter einer Prozessgrenze
│  │  Gruppe: dieselbe Frage in drei Schnitten — wer darf liefern, was zählt
│  │  als Abdeckung, was kostet das Hinausgreifen.
│  ├─ ADR 0136  Bridges und Libraries: der Slot ist der Vertrag
│  ├─ ADR 0137  Zulieferer sind Instanzen
│  ├─ ADR 0138  Hinausgreifen kostet etwas und ist aus, bis jemand zustimmt
│  └─ ADR 0144  MCP ist der Transport einer Bridge, kein Katalog
│       Beweis: check-suppliers.mjs (3 Slots, bridges/ außerhalb des
│               Workspace) — eigene Sonden im Skript
├─ ADR 0036  Capabilities, Konnektoren und die MCP-Grenze  (konzeptionell)
├─ ADR 0143  Ein Depot liefert aus, was es ausführt; ein neuer Commit ist eine
│            neue Entscheidung
│    Beweis: check-suppliers.mjs, modules/depot/src/depot.test.ts
└─ Modellpfad — ein Provider sagt, was er nachweislich kann
   ├─ ADR 0142  Ein Provider-Eintrag sagt, was ein Host gemessen wurde zu leisten
   ├─ ADR 0151  Ein Provider beweist, wer er ist, oder sieht nur den Live-Turn
   └─ ADR 0152  Einstellungen nennen die Folge
```

### A10 — Ein Home ist kein öffentlicher Server; Erreichbarkeit kostet keinen offenen Port

*Wurzelbeleg: „not a public home server that requires exposing local Pico Home
APIs to the internet"; „external reachability should use Pico Link transports …
instead of port forwarding into the home network".*

```
A10
├─ ADR 0107  Pico Link Direct: versiegelte Umschläge zum eigenen Home
├─ ADR 0130 E1  Erreichbarkeit als Produktfakt am gepackten Paket bewiesen
└─ ADR 0155  Ein Relay darf unter einem Supervisor laufen, und nur sein Port wird
             weitergereicht   (implementiert)
     Beweis: check-addon-config.mjs (2 Add-ons) — widerlegt gegen einen Slug,
             der nicht zu seinem Verzeichnis passt
```

### A11 — Was Pico vermittelt, erfährt der Vermittler nicht, und kein Vermittler ist gesetzt

*Wurzelbeleg: „Pico Relays transport encrypted packets but do not own Pico
identity, memory, relationships, actions or authority"; „not a project that binds
its core protocol to one relay provider or one radio transport".*

```
A11
├─ ADR 0028  Pico Link, Transportfassade und Relay-Netz
├─ Mailbox und Zustellung — was ein Vermittler wissen muss und nicht mehr
│  ├─ ADR 0147  Eine Mailbox ist eine Beziehung; dem Relay wird wohin gesagt, nicht warum
│  ├─ ADR 0148  Eine Mailbox lebt so lange wie ihre Delegation   (implementiert)
│  ├─ ADR 0149  Ein Relay hält Mailboxes für Accounts
│  └─ ADR 0150  Ein Push sagt „frag mich", nie „hier ist"   (implementiert)
│       Beweis: check-link-seal.mjs (168 Dateien; keine Mailbox-Adresse
│               erreicht Log, Fehler oder URL) · check-push-boundary.mjs ·
│               check-push-lifetime.mjs (beide Enden einig) ·
│               check-relay-boundary.mjs (16 Dateien) — 2026-08-21 verschärft,
│               nachdem Zeichenketten daran vorbeiliefen
├─ ADR 0025  Kompatibilität der Kommunikation zwischen Picos und Homes
└─ Die Draft-Platzhalter — reservierte Formen ohne Laufzeitanspruch
   │  Gruppe, weil fünfundzwanzig ADRs dieselbe Rolle haben: sie halten eine
   │  Form frei, tragen aber keinen Kompatibilitätsanspruch. Vier sind
   │  ausdrücklich superseded (0043, 0044, 0063, 0065).
   ├─ ADR 0042–0047  Pico-Link-Draft-Schema, Envelope, Payload, Rückweisungen
   ├─ ADR 0050–0066  Device-Credential, Widerruf, Rotation, Identitätsschlüssel,
   │                 Home-Host-Key, Residenz, Modell-Delegation, Replica-Manifest
   └─ ADR 0048/0049  Modell-Capability-Delegation und Provider-Registry
        Beweis: docs/protocol/fixtures/, check-surface-classes.mjs
└─ ADR 0154  Ein Relay wird aus einer Logzeile beansprucht   (implementiert)
```

### A12 — Kontext wird geteilt, wenn es einen Zweck gibt: begrenzt, sichtbar, widerrufbar

*Wurzelbeleg: „not a hidden surveillance or control tool"; „not a global human
scoring or reputation system"; „Context Sharing and location sharing must be
scoped, visible, revocable and minimally precise"; „service and emergency
disclosures must be role-, context-, purpose- and necessity-bound".*

```
A12
├─ ADR 0126  Eine Identität, viele Präsenzen  (auch A1)
│    Beweis: check-presence-affordances.mjs — eine Affordance ist eine Tatsache
│            über ein Gerät, keine Erlaubnis
├─ ADR 0018  Präsenz, Kontext und Standort  (konzeptionell)
├─ ADR 0020  Kontextueller Dienst und Notfallzugriff  (konzeptionell)
├─ Zusammenleben — entschieden als Richtung, nicht als Code
│  │  Gruppe: elf ADRs beantworten dieselbe Frage — was Picos untereinander und
│  │  gegenüber Dritten dürfen. Alle konzeptionell; kein Beweisblatt, weil es
│  │  nichts zu beweisen gibt.
│  ├─ ADR 0002/0003/0004  Peer-Vertrauen, Familienserver, Eltern-Kind-Modell
│  ├─ ADR 0017  Kontextuelle Interaktionssicherheit und Vertrauenssignale
│  ├─ ADR 0019  Home-Assistant-Bedrohungsmodell
│  ├─ ADR 0021  Privates Verhalten, rechtliches Risiko und Schaden
│  ├─ ADR 0022/0023  Geteilte Verpflichtungen, Ton und Selbstbindung
│  └─ ADR 0035  Pico als digitaler Begleiter und Twin
└─ ADR 0129  Spatial Recall  (auch A5)   ⚠ Befund B4
```

Vier der fünf Wurzelaussagen dieser Anforderung ruhen auf ADRs, die
`concept-only` sind. Das ist kein Befund über den Code — es ist die ehrliche
Lage: die Grenzen sind gezogen, das Subjekt fehlt.

### A13 — Eine Oberfläche behält so wenig wie möglich

*Wurzelbeleg: „Pico Vaults own knowledge and backups; Pico Surfaces are
interaction surfaces"; ADR 0008s Design-Regel — Companion an der Oberfläche,
kontrolliertes verteiltes System in der Ausführung.*

```
A13
├─ ADR 0113  Electron-Schale über einem schalenfreien Companion-Kern
│    Form:   C2 — das Fenster bekommt bereits gerenderten Zustand; es
│            entscheidet keine Darstellung, weil es keine Regel erreichen kann
│    Beweis: check-browser-modules.mjs — der Renderer erreicht 3 Module, jedes
│            über einen relativen Pfad; check-companion-boundary.mjs
├─ ADR 0095  Ephemerer Reader-Item-Katalog und lokale Präsentationsübergabe
└─ ADR 0123  Laufzeit-Schlüsselhygiene  (auch A1)
```

### A14 — Was ankommt, ist nachweisbar das, was gebaut wurde

*Wurzelbeleg: „a Pico release is trustworthy exactly as far as the repository
commit that produced it, and what a person installs must be checkable against
that commit" — als Grenzaussage aufgenommen am 2026-08-21, gehoben aus ADR
0122s eigener Entscheidung (Befund B1).*

Der Satz war entschieden und stand nur nicht an der Wurzel. Sechs ADRs und fünf
Gates hingen unter einer Frage, die niemand gestellt hatte.

```
A14
├─ ADR 0005  Release- und Update-Plattform
├─ ADR 0006  Test- und Release-Gates
├─ ADR 0007  Home-Assistant-Add-on-Releasestruktur
├─ ADR 0027  Eigenes Pico-Home-Image und First-Boot
├─ ADR 0122  Update- und Release-Integrität
└─ ADR 0153  Was ausgeliefert wird, ist ein Pico Home
     Beweis: check-license.mjs (18 Manifeste) · check-version.mjs ·
             check-workflow-pinning.mjs (25 Action-Referenzen, jede eine SHA) ·
             check-release-tag.mjs · check-release-monotonic.mjs
```

### A15 — Ein Pico bleibt es selbst, auch wenn sich Laufzeit und Gerät ändern

*Wurzelbeleg: „a Pico's appearance is a versioned parametric description rather
than transferred assets, so it stays recognisable across runtimes, devices and
permitted forks" — aufgenommen am 2026-08-21, gehoben aus ADR 0125 (Befund B2).*

Das ist Interoperabilität, nicht Aussehen. ADR 0125 sagt es selbst: Sprites,
Texturen oder Meshes zu übertragen bände die Identität an eine
Renderer-Generation und ein Geräteklasse, und jede Aktualisierung ließe alte
Entwürfe stranden.

```
A15
└─ ADR 0125  Parametrische Appearance und Versionskompatibilität
     Warum:  eine Erscheinung muss Zeit und Heterogenität überleben - neuere
             Laufzeiten, Geräte, die nie aktualisieren, und erlaubte Forks
     Code:   packages/appearance/src/, packages/gesture/src/
     Fläche: docs/protocol/appearance-document-v1.md,
             docs/protocol/fixtures/appearance-document
     Beweis: appearance-*.test.ts, gesture-pose-v1.test.ts,
             check-wire-labels.mjs (die Appearance-Capabilities sind Teil der
             129 einmal geschriebenen Labels), check-surface-classes.mjs
```

### Ein Ast, der aspirativ bleibt

Er steht hier, damit der Baum vollständig ist und die Lage sichtbar statt
weggelassen: Code und Tests ohne Auftrag sind kein Fehler, aber sie sind auch
keine Anforderung.

```
Gestalt — wie Pico aussieht und sich bewegt        aspirativ (Befund B2)
├─ ADR 0009  Avatar- und Interaktionsmodell
├─ ADR 0013  Visuelle Designsprache
└─ ADR 0124  Autorisierter Character Core  (nicht implementiert)
     Warum:  READMEs Wunschliste nennt „text, voice, avatar"; normativ sagt
             die Wurzel über Gestalt nichts, und das ist nach der Entscheidung
             vom 2026-08-21 so gewollt
     Code:   tools/character-modeling/
     Beweis: check-design-system.mjs (1.1.0 / Character 3.2.1)
```

### Aufzeichnungen ohne Ast

Diese entscheiden nichts über den Code und hängen deshalb an keiner Anforderung.
Sie stehen hier, damit die Zählung aufgeht: **152 der 154 ADRs mit Matrixzeile
sind einem Ast zugeordnet**, diese zwei nicht.

- **ADR 0012 — Roadmap von der Foundation zum Companion** (informational). Eine
  Roadmap als ADR. Sie ist die Vorgängerin dessen, was jetzt hier steht; die
  Reihenfolge selbst wohnt in diesem Dokument.
- **ADR 0111 — Selbstbetrieb und reserviertes kommerzielles Hosting**
  (informational). Eine Lizenz- und Geschäftsaussage, keine technische.

Ohne Matrixzeile und ausdrücklich nicht angenommen: **ADR 0146, 0156 und 0157**
sind Skizzen. Sie tragen keinen Umsetzungsanspruch und stehen deshalb in keinem
Ast — eine Skizze in einen Baum zu hängen behauptet eine Entscheidung.

## Vergangenheit

Was zugegangen ist, mit dem Datum und dem, was es geschlossen hat. Quelle sind
die Gate-Texte der ADRs, nicht die Git-Historie.

- **Reader-Custody und Sync** (ADR 0086–0096, 0098) — von der Autoritätsgrenze
  bis zum ephemeren Item-Zugriff, mit echten Prozess-Zeremonien.
- **Approval und Rendering** (ADR 0099, 0106) — der Satz, den eine Person
  freigibt, wird aus den signierten Feldern gerendert.
- **E6 Produktpfad** (ADR 0130) — kein produktbezogenes Dokument schickt jemanden
  durch die CLI.
- **E1 Erreichbarkeit, 2026-08-18** — die Türen am gepackten `.deb` bewiesen,
  mit einem gebauten Negativtest statt einer Annahme.
- **E2 Gründung und Bindung, 2026-08-18** — ein Home entsteht aus dem Fenster;
  die Keystore-Bindung wird erstmals in Produktion geschrieben.
- **E3 Gerätelebenszyklus, 2026-08-18** — delegate, enroll, renew, revoke,
  inspect. Enrollment über drei Codes und Kamera oder Tastatur; Erneuerung in
  beiden Fällen. Gemessen und deshalb gebaut: ein Gerät, dessen Jahr abläuft,
  kann nie wieder angemeldet werden.
- **E4 Home-Kontinuität und Mitgliedschaft, 2026-08-18** — Rotation endet mit dem
  Repin des auslösenden Geräts; eine Mitgliedschaft lässt sich beenden.
- **Phase 4, Android-Fundament, durchgelaufen 2026-08-19** — nodejs-mobile
  v18.20.4 trägt den schalenfreien Kern auf einem Galaxy A55, 937 Fixture-Tests
  grün auf dem Gerät; eigener Custody-Prozess entschieden (1,639 ms pro
  Signatur-IPC); Erreichbarkeitskadenz vermessen; Keystore-Tranche auf
  gemessener Evidenz analysiert.
- **A5s gemeinsame Regeln aus der Schale geholt, 2026-08-20/21** — wie ein
  Schlüssel, ein Zeitpunkt und eine Zeitspanne einer Person gesagt werden, ist je
  eine produktweit geprüfte Regel; Feldgrenzen im Client sind Namen statt Zahlen.
- **Jedes Gate hat einmal gebissen, 2026-08-21** — siehe
  `docs/development/agent-runbook.md`.

## Gegenwart

Der nachgewiesene Stand steht in **`progress.md`** und wird hier nicht
wiederholt. Was hier steht, ist die Position im Pfad:

**Phase 1 und 2 sind durch, Phase 4 ist durchgelaufen. Offen sind Phase 3
(die Zustandsgrenze), Phase 5 (Android-Ceremonies) und Phase 6 (die erste echte
Nützlichkeit).** Der Linux-Client ist ohne Terminal installierbar und bedienbar;
das Telefon trägt den Kern, aber noch keine ausgelieferte Fläche.

## Zukunft

Zielmarke, vom Nutzer am 2026-08-09 festgelegt: **nützlich im Alltag** — ein
Linux- und ein Android-Client, ohne Terminal installierbar und bedienbar, die
mindestens Termine und Spatial Recall tragen. Der sprechende Companion liegt
bewusst dahinter.

### Fixpunkt: Electron 44, vor dem 2026-08-25

Terminiert und nicht verhandelbar. `apps/companion-shell/electron-support.json`
läuft am 2026-08-25 ab und blockiert danach `release:verify`. Die Pin-Policy
erzwingt dann Electron 44, und ein Bump öffnet die ADR-0113-C3-Fläche wieder:
Paketierung, Sandbox-Probe und Speicherbudget sind neu nachzuweisen.

Am 2026-08-18 vorab gemessen: `44.0.0-beta.5` gepackt und im selben
`user_namespace`-Modus gemessen ergibt `Private_Dirty + Private_Hugetlb` von
99.635.200 gegen 100.339.712 bei 43.4.0 — also gefallen, bei einem Budget von
110.000.000. `verify:linux` lief auf der Beta mit Exit 0 durch. Eine Beta ist
nicht das Release; die Aussage ist „wahrscheinlich billig", nicht „erledigt".

### Phase 3 — die Zustandsgrenze (ADR 0126 P3)

Der Angelpunkt. Die Übergabe von präsenzlokalem in dauerhaften Zustand als
ausdrücklicher, auditierter Schritt, mit den fünf Stellen aus ADR 0129 an der
Grenze statt am Store. Praktisch zieht das den Beobachtungspuffer aus dem Core
ins Gerät — womit das Home keine Rohstandorte mehr sieht und Phase 6 offline
antworten kann.

**Verweist auf Befund B4.** Ein bis zwei Blöcke.

### Phase 5 — Android-Ceremonies (ADR 0131 A5, A3)

Die Vertikalen aus Phase 1 und 2 auf Android, in derselben Reihenfolge. Am
2026-08-19 vorab vermessen: E2, E3 und E4 sind zusammen rund 1.500 Zeilen Kern,
die A1 auf dem Telefon bereits ausgeführt hat. Was Android wirklich bauen muss,
ist Plattformarbeit — Kamera- und Tipperfassung der drei Codes, Präsentation,
Secure Input, A3-Bindung. Die Zeremonienlogik ist nicht der Preis.

**Die Gradle-Frage ist am 2026-08-21 gemessen worden, und sie war falsch
gestellt.** Hier stand, eine Compose-Oberfläche heiße Gradle-Wrapper und
hunderte Megabyte neben PhpStorm und Blender auf 16 GB. Gemessen:

- **Platte ist nicht der Engpass** — `/home` hat 123 GB frei, und SDK (3,7 GB)
  und NDK (2,1 GB) liegen längst da. Der Satz hat Platte mit Speicher verwechselt.
- **Speicher ist einer** — 14 GB gesamt, **2,9 GB verfügbar**, während PhpStorm
  2,7 GB und Chromium 1,8 GB halten und Blender gar nicht läuft. Gradle und
  Kotlin bauen als langlebige Daemons, und keiner von beiden ist installiert.
- **Und die Frage ist für Phase 5 gegenstandslos.** Der handgebaute Pfad trägt
  schon eine echte Zeremonie: `JoinActivity` mit 338 Zeilen einfacher
  `android.widget`-Views, `ScanActivity` mit 442 Zeilen auf
  `android.hardware.camera2` statt CameraX, die biometrische Bindung über
  Framework-API — und **null** Vorkommen von `androidx` oder `kotlin` im ganzen
  APK-Quellbaum. Die gesamte UI-Kette baut in **einer Sekunde**
  (`javac` 0,3 s, `d8` 0,6 s).

Die Entscheidung heißt also nicht „kann diese Maschine Gradle tragen", sondern
„braucht die Android-Fläche überhaupt Compose". Für die drei Verben, die diese
Phase schuldet, sagt der Befund: nein. Umkippen würde es eine echte
AndroidX-Abhängigkeit — die zwei üblichen Kandidaten, Kamera und
Biometrie-Dialog, beantwortet das Framework bei diesem `minSdkVersion` selbst.

Wie ein Telefon das Home erreicht: **nicht** über den Foundation-Port, der per
Default an `127.0.0.1` bindet. Der Weg ist der eigene Link-Intake-Listener
(`PICO_LINK_INTAKE_HOST` und `PICO_LINK_INTAKE_PORT`, nur zusammen gültig); der
Companion postet versiegelte Umschläge an `${coreUrl}/api/home/link`, und diese
Route trägt die Zugriffsklasse `link-intake` — weder Session noch Token, weil die
Authentifizierung im Umschlag sitzt.

### Phase 6 — die erste echte Nützlichkeit

Hängt vollständig an Phase 3.

- **ADR 0129 SR5-Erfassung** auf dem Telefon — der Sensoradapter hinter dem Port,
  der seit SR5 deklariert und leer ist.
- **Termine auf dem Telefon** — `home.time_bound_entries.read` und die
  Quittierung über die vorhandene Link-Operation.

Das ist der Punkt, an dem jemand das Ding vermissen würde, wenn man es wegnimmt.
Die Zielmarke endet hier.

### Aus der Prüfung entstanden

- **Ein Schreibweg für Reader-Custody-Inhalt** — ohne ihn bleiben fünfzehn
  implementierte ADRs ein Ast ohne Subjekt. *Verweist auf Befund B5.*

### Außerhalb dieser Roadmap

Der sprechende Companion: die erste Requesting-Seite, ADR 0116 W4/W5, ADR 0117
X3–X5, die Modell-Delegation aus ADR 0048/0049 — und die Avatar-Assets über
ADR 0124, die ADR 0112 S4 entsperren. Nichts davon ist heute prüfbar, weil kein
Modell-Provider existiert.

Ebenfalls außerhalb: iOS, macOS (blockiert mangels Testgerät, ADR 0130 E8),
Windows (ADR 0130 E7) und ADR 0027 IM1–IM3, die ein Image brauchen, das es nicht
gibt. Dazu READMEs aspirative Liste: Meshtastic und andere schmalbandige
Transporte, Uhren und kleine Displays, plattformübergreifende Home-Pakete.

## Was die Prüfung ergab

Durchgeführt am 2026-08-21 auf `b9f561c`. Die Befunde sind datierte
Beobachtungen; sie bleiben wahr, auch nachdem die Arbeit getan ist.

**B1 — Auslieferungsintegrität hat sechs ADRs und keine Wurzelaussage.**
ADR 0005, 0006, 0007, 0027, 0122 und 0153 entscheiden, wie das Gebaute bei einer
Person ankommt. Weder ADR 0008 noch das README sagt darüber etwas Normatives:
das README nennt Home Assistant als ersten Verpackungsweg, aber keine
Eigenschaft, die die Auslieferung haben muss. Sechs ADRs mit fünf Gates darunter
beantworteten damit eine Frage, die die Wurzel nicht stellte.
**Entschieden am 2026-08-21**: ADR 0122s eigener Satz ist an die Wurzel gehoben
und trägt jetzt als A14 den Ast, statt dass der Ast in der Luft hängt.

**B2 — Der Gestalt-Strang ruht allein auf der Wunschliste.**
ADR 0009, 0013, 0124 und 0125 tragen zwei Pakete mit Tests
(`packages/appearance`, `packages/gesture`), einen Betrachter und ein
Design-System-Gate. Ihre einzige Wurzelgrundlage ist READMEs aspirativer Satz
„interact through text, voice, avatar" — normativ sagt die Wurzel über Gestalt
nichts. Das ist der Fall, den Frage 1 und Frage 2 unterscheiden: der lokale Zweck
ist klar, der Auftrag fehlt.

**Entschieden am 2026-08-21, und der Strang zerfiel dabei in zwei.** ADR 0125
entscheidet Interoperabilität, nicht Aussehen - eine Erscheinung muss neuere
Laufzeiten, nie aktualisierte Geräte und erlaubte Forks überleben, weshalb sie
eine versionierte parametrische Beschreibung ist und keine übertragenen Assets.
Das ist requirement-fähig und hat eine veröffentlichte Protokollfläche mit
Fixtures; es steht jetzt unter A15. ADR 0009, 0013 und 0124 bleiben
ausdrücklich aspirativ - Vorarbeit ohne Auftrag, was ehrlich ist, solange
nichts davon ausliefert.

**B3 — ADR 0034s Matrixzeile behauptet, was der Baum widerlegt.**
Die Zeile sagt: „crypto canonicalization, signature inputs, cryptographic vectors
and a compatibility runner are missing." Gemessen am selben Commit: **32
`buildPico*SignatureInput`-Builder** im Protokoll, fünf Vektor-Testdateien, und
`progress.md` sagt für dieselben Familien „autoritative positive und negative
Vektoren". Genau eines der vier genannten Dinge fehlt wirklich — der
Conformance-Runner. Der Status `concept-only` war damit für drei Viertel der
Zeile falsch. **Korrigiert am 2026-08-21**: die Zeile steht auf `partially
implemented`, nennt die Builder und die Fixture-Familien und lässt als Lücke
genau das übrig, was `docs/protocol/conformance-fixtures.md` selbst benennt.

**B4 — Spatial Recall ist ein Ast, der in Stücken existiert.**
ADR 0129 ist entschieden, `modules/spatial-recall` existiert mit Tests, und die
Ableitung ist eine reine Funktion. Die Erfassung schreibt aber in den Core:
`pico_observation` ist eine Core-Tabelle mit Migration und Shred-Kaskade. Damit
erfüllt der Ast Anforderung A5 nicht — „wo habe ich geparkt" funktioniert
ausgerechnet in der Tiefgarage nicht. Kette vorhanden von der Anforderung bis
zum ADR und vom ADR bis zum Code; unterbrochen zwischen Code und Anforderung.

**Der Bruch ist bekannt und zurückgestellt, nicht übersehen** — die erste
Fassung dieses Befunds ließ das offen und las sich damit wie ein Vorwurf.
ADR 0126 P3 hält fest: die Übergabe existiert als Tür, beide Keeps gehen
hindurch, und der SR2-Puffer bleibt, wo er ist, **bis eine Laufzeit mit Sensor
existiert** — vom Nutzer so entschieden. Der Grund gilt weiter: ADR 0129s
SR5-Port ist deklariert und leer, und Android hat bislang eine Laborfläche.

Was der Baum trotzdem beiträgt, ist die Übersetzung. Matrix und ADR sagen „ein
Gate ist halb zurückgestellt"; der Baum sagt, was die Zurückstellung **kostet**
— eine Anforderung, die dieser Ast nicht bedient. Das sind zwei verschiedene
Aussagen, und die zweite verschwindet in einer Statuszeile.

**B5 — Fünfzehn implementierte ADRs haben kein Subjekt.**
ADR 0078 und 0082–0096 sind implementiert und mit echten Prozesstests belegt.
Am 2026-08-18 vor dem Bauen von ADR 0130 E5 gemessen: nichts im Produkt schreibt
Reader-Custody-Inhalt, und kein Companion stellt je ein Share Envelope aus oder
empfängt eines. Der größte zusammenhängende Ast des Baums ist vollständig gebaut
und hat nichts zu tragen. Das ist kein Fehler — es ist eine Reihenfolgefolge, und
sie ist in ADR 0130 E5 bereits argumentiert. Hier steht sie, weil ein Baum sie
zeigt und eine Statusmatrix sie nicht zeigen kann: dort sind es fünfzehn grüne
Zeilen.

**B6 — Der Baum selbst war unvollständig, und das fand erst die Gegenprobe.**
Der Baum wurde von oben gebaut und las sich vollständig. Sechs echte Dateien aus
verschiedenen Ästen wurden anschließend von unten gelesen — die vier Fragen
gestellt, ohne in den Baum zu sehen. `modules/calendar/src/calendar.ts` fiel
sofort durch: der Baum konnte nicht sagen, welche Anforderung ein Modul verlangt.
Mechanisch nachgezählt waren es **sechzig** ADRs, die nirgends vorkamen,
darunter die Modulgrenze (ADR 0127/0128), die Move-In-Zeremonie (ADR 0080) und
die Foundation-Authentifizierung (ADR 0075–0077). Alle sind jetzt als Gruppen
unter ihrem Ast eingeordnet; die Zählung geht auf.

Das ist derselbe Handgriff, mit dem am Vortag die Gates widerlegt wurden, und
dieselbe Lehre: **ein Dokument, das niemand von der falschen Seite gelesen hat,
kann vollständig aussehen, weil es nur von der richtigen gelesen wurde.**

**B7 — Ein Produktbegriff hatte drei Namen, und die Prüfung sah keinen davon.**
ADR 0026 bildet ADR 0015s `Full Client` auf **Pico Vault** ab; das ausgelieferte
Artefakt heißt `pico-companion_<version>_amd64.deb`; das README nennt es **Pico
Client**; ADR 0105 nennt die Betriebsart **Companion**. Drei Namen für ein
Objekt, und ein Leser des README trifft zwei davon vier Abschnitte auseinander.
Das ist Befundart 4 in Reinform — zwei Dokumente, die dieselbe Frage verschieden
beantworten — und es steht seit dem ersten ausgelieferten Paket so da.

Gefunden hat es nicht die Prüfung, sondern eine Frage des Eigentümers, gestellt
während an ADR 0131 A7 gebaut wurde. **Warum die Prüfung es nicht fand, ist der
eigentliche Befund über den Baum:** ADR 0015 und ADR 0026 wurden in Gruppen
einsortiert — „Was ein Pico und ein Home überhaupt sind" —, und eine Gruppe wird
als Ganzes gegen ihre Anforderung gehalten, nicht Aussage für Aussage. Die
Gruppierung, die den Baum lesbar macht, macht ihn an derselben Stelle blind. Was
in einer Gruppe steckt, wird nicht mehr einzeln befragt.

Behoben am 2026-08-21 in der Richtung „das Vokabular folgt dem Baum": Pico Vault
ist die Schlüsselverwahrung, Pico Client der Vollclient, Companion die
Betriebsart. Die Statusnotiz an ADR 0026 trägt die Entscheidung; die Tabelle
darunter bleibt als Aufzeichnung stehen.

**Was die Prüfung nicht fand.** Kein einziges ADR mit Status „implemented" hat
eine leere oder dünne Evidenzspalte — 0 von 154. Befundart 3 ist damit sauber.
Vier Zeilen mit `concept-only`/`reserved` nennen Code in der Evidenzspalte;
drei davon sagen im Text selbst, dass es um reservierte Typen oder um
Mechanismen geht, auf denen sie aufbauen würden (ADR 0010, 0017, 0145). Der
vierte ist B3.

## Pflegeanweisung für Aktualisierungen

Wenn der Auftrag „aktualisiere die Roadmap" lautet:

1. **Dieses Dokument besitzt die Reihenfolge**: Phasen, ihre Abhängigkeiten und
   terminierte Fixpunkte. Der nachgewiesene Gegenwartsstand gehört in
   `progress.md`, die Entscheidungen in die ADRs, die nächste Handlung *heute* in
   `.agent-context.md`. Keine Zahl, die `progress.md` besitzt, wird hier
   wiederholt.
2. **Der Baum wird gegen den Code geprüft, nicht fortgeschrieben.** Ein Ast gilt
   erst als geändert, wenn seine vier Antworten am Code nachgesehen wurden.
3. **Evidenzblätter nennen Namen, keine Zahlen** — welches Gate, welcher Test.
   Zählstände driften.
4. Die Anforderungsschicht bleibt als Rekonstruktion markiert. Wird eine
   Anforderung zur Entscheidung, zieht sie in ein ADR und der Baum zeigt dorthin.
5. Ein Befund ist eine **datierte Beobachtung** und wird nicht gelöscht, wenn die
   Arbeit getan ist; Zukunftspunkte verweisen auf ihn zurück.
6. Ein Ast ohne ADR ist zulässig, wenn er sagt, warum keine
   Architekturentscheidung nötig war, und Datei und Evidenzblatt benennt.
7. Mehr als etwa sieben Geschwister auf einer Ebene werden gruppiert; keine
   Gruppe von eins; höchstens eine Verschachtelungsebene. **Eine Gruppe wird als
   Ganzes gegen ihre Anforderung gehalten** — was in einer steckt, wird nicht
   mehr einzeln befragt. Das ist der Preis der Lesbarkeit und der Grund für
   Befund B7; wo eine Gruppe Begriffe oder Verträge enthält, lohnt der
   Einzelblick trotzdem.
8. Aspirative Wurzelaussagen werden benannt, nicht in Anforderungen übersetzt.
