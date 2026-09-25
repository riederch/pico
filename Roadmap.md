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
        Code:   apps/companion/src/enrolment-steps.ts (die Sätze des Walks
                und der Ablehnungen), vault-passphrase-prompt.ts (die fünf
                Absichten einer Passphrase-Frage), platform-secrets.ts und
                platform-unlock.ts (Android-Keystore-Verdikt und der zweite
                Anschluss des automatischen Unlocks),
                tools/android-runtime-probe/apk/ (Fläche, noch Laborartefakt,
                mit KeystorePort.java und KeystoreEvidence.java)
        Beweis: enrolment-step-lines.test.ts, enrolment-refusal-line.test.ts,
                vault-passphrase-prompt.test.ts, android-keystore-evidence.test.ts,
                der Android-Teil von platform-unlock.test.ts;
                check-android-keystore-names.mjs (Kern und Sonde, 9 Belegfelder),
                check-one-voice.mjs (ein Moment, eine Stimme),
                check-awaited-secrets.mjs (kein fallengelassenes Versprechen);
                der volle Beitritt auf einem Galaxy A55 gegen ein echtes Home,
                Passphrase im TEE versiegelt und nach Prozesstod wieder geöffnet
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
│               check-constant-copies.mjs (beide Enden einig) ·
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
das Telefon trägt den Kern und ist am 2026-08-21 vollständig in ein echtes
Home eingezogen — drei Codes, zwei Geräte, die Sätze aus dem Kern —, aber die
Fläche ist ein Laborartefakt und keine ausgelieferte App.

## Siebzehn Entscheidungen, 2026-09-22

Alle offenen Punkte aus `.agent-context.md` sind an diesem Tag vom Nutzer
entschieden worden, in vier Durchgängen mit vorgelegter Messung. Sie stehen
hier, weil hier die Begründungen stehen; der Handoff trägt nur noch die
Reihenfolge.

**Zwei Vorlagen musste ich dabei berichtigen, beide zu meinen Lasten.**

*Erstens:* Ich hatte bei der Lamport-Frage „braucht eine Migration" als Kosten
geführt. Pico ist im vollständigen Entwicklungsmodus — eine Schemaänderung wird
in die konsolidierte Grundlinie gefaltet und die Datenbank neu angelegt.
`migrations.ts` sagt das selbst und hat zwei solche Faltungen hinter sich.
„Braucht eine Migration" ist hier kein Argument.

*Zweitens, und schwerer:* Ich hatte empfohlen, beim Löschen alle drei Verweise
mitzunehmen. Nachgemessen ist `kept_memory_item_id` der **Nachschlageschlüssel
der Vergessens-Tür**: `home.memory.forget` findet damit die Domäne des Stücks
und weist sonst mit `not_kept_by_you` ab. Wer den Rückruf vergisst, hätte
danach sein Erinnerungsstück nicht mehr vergessen können — die eine Löschung
hätte die andere weggenommen. `domain-shred.ts` schreibt genau dafür seine
Begründung hin. Die Entscheidung wurde mit dieser Messung noch einmal
vorgelegt und geändert.

### Was entschieden ist

| # | Frage | Entschieden |
|---|---|---|
| 1 | Wurzelrotation | `rotationBootstrap` als dritte Zeile derselben Tabelle |
| 5 | Push ohne Empfänger | Senden abschalten, bis der Empfang steht |
| 6 | Drei primärblaue Knöpfe | eine bleibt primär, zwei werden leiser |
| 7 | Postfachbuch | behalten; verdrahtet wird es mit der Empfangsseite |
| 8 | Zehn Suite-Vergleiche | entfernen |
| 9 | Zustimmungszeitpunkt | zeigen |
| 10 | `synchronous` | `FULL` in beiden Stores |
| 11 | `relay_mailbox` | zweite Quote über alle Zeilen eines Kontos |
| 12 | Web-Banner | volle Satztabelle wie in der Schale |
| 13 | Reader-Custody-Ende | host-lokale Zerstörung bauen — **erledigt 2026-09-24** |
| 14 | Modul-Oberflächen | `spatial-recall` zuerst, an der Ableitung — **über Pico Link**, entschieden am 2026-09-24 |
| 15 | `staticTokenCeiling` | Konstante entfernen |
| 16 | Depot-Adresse | wirksame Adresse messen, bei Abweichung ablehnen |
| 18 | Zweiter Kern | `UNIQUE (device_id, lamport)` |
| 19 | Link-Eingang | 404 und 405 zusammenlegen wie im Relay |
| 20 | Löschung | `source_ref` leeren; `kept_*` und die drei Zeitpunkte bleiben |
| — | Schlüsselexport (B255) | jetzt bauen |

**Der Schlüsselexport, am 2026-09-24 auf Fable analysiert und in zwei
Gabeln entschieden.** ADR 0158 wurde gegen den Baum gemessen statt gelesen:
`key-store.ts`, `memory-content-crypto.ts`, `share-envelope.ts`, die
Keyfile-Konstruktion in `packages/vault`, `argued-routes.mjs`. **Gabel A —
wo versiegelt wird:** auf dem Gerät. Der Entwurf ließ das Home unter einer
Passphrase versiegeln, die in der Anfrage reist; die ganze Konstruktion lebt
aber in `packages/vault`, der Kern hat keinen KDF-Pfad, und eine getippte
Passphrase läge im Klartext in einem Prozess, den ADR 0081 aus genau dem
heraushält. **Gabel B — was der Export enthält:** nach Leserschaft je Domäne
(ADR 0077), nicht der ganze Speicher — sonst würde Home-Verwaltung zu
Domänen-Leserschaft. Acht Korrekturen daneben, keine davon eine Gabel; die
schwerste: Versionsnummern sind über Shred-Generationen nicht eindeutig
(`nextVersion` beginnt nach dem Shred wieder bei `v1`), also identifiziert der
Import Schlüssel per Digest und kennt *conflicting*. Die Gates KE1–KE6 sind
umgeschrieben; gebaut ist nichts.

**Eine Nachentscheidung am 2026-09-24: woher die Parkantwort kommt.** Punkt 14
sagte „`spatial-recall` zuerst, an der Ableitung" und liess offen, *wo* die
Antwort gegeben wird. Gemessen ergab sich, dass der versprochene Satz
(*„Companion: answering where the vehicle was left, offline"*) eine Quelle auf
dem Geraet braeuchte — entweder eigene Messungen, deren Erfassung der Nutzer
zurueckgestellt hat, oder eine Kopie der letzten Ableitung neben der
Domaenen-Custody und ausserhalb des Shred-Pfads. Vorgelegt und entschieden:
**ueber Pico Link fragen** (`home.parking.ask`, `home.parking.decide`), und die
Manifest-Saetze berichtigen. Die beiden ersten sagten `Foundation API`, was
zweimal falsch war: gebaut war keiner, und die Foundation-Flaeche ist lokale
Diagnose und kein Produktweg. Der dritte Satz ist **entfernt statt erfuellt**.

### Drei Dinge, die aus den Antworten folgen

**5 und 7 sind dieselbe Arbeit.** Das Postfachbuch ist kein Regelmodell,
sondern der Postfachspeicher der Empfangsseite (`issue`/`read`/`write`/`clear`/
`exchange`); der Sweep nimmt die Postfachadresse als Parameter, und das Buch
liefert sie. Buch, Sweep und `handlePush` sind drei Teile eines Weges, und
keiner läuft. „Senden abschalten" ist damit eine **vorübergehende Maßnahme mit
benannter Bedingung**, kein Rückbau — und „das Buch verdrahten" ist keine
eigene Aufgabe, sondern fällt an, wenn die Empfangsseite gebaut wird.

**12 baut die Drift, gegen die es `one-voice:check` gibt**, und ist trotzdem
richtig: Worte für Menschen sind keine Prüfung. Die Entscheidung kommt mit
einer Pflicht — das Tor muss die Dashboard-Tabelle mitlesen, sonst steht die
zweite Wahrheit ohne Netz.

**15 beseitigt die zweite Wahrheit, nicht die Fragilität.** Die Grenze wird
weiterhin von der Reihenfolge einer `if`-Kette gezogen; ohne die Konstante
steht nur nichts Falsches mehr daneben. Der Ersatz ist ein **Gang** statt einer
Konstante: ein statisches Token gegen je eine Route jeder Klasse. Das prüft
Verhalten, und genau das konnte die Konstante nie.

### Reihenfolge

Der Schlüsselexport steht an zweiter Stelle, nicht am Ende, und der Grund ist
nicht seine Größe: er ist der einzige Posten, bei dem **Warten Kosten
anhäuft**. Seit B254 versiegelt jeder Schreibweg; jeder Tag mit eingeschalteter
Verschlüsselung und ohne Export ist ein Tag, an dem jemand Erinnerungen
verlieren kann, die er nicht schützen konnte. Alle anderen Punkte stehen still.
Dass er groß ist, spricht dabei für früh: Befund 13 erbt danach seine
Begründung (ADR 0033 — nur Domänen-KEKs, zwei bewusste Artefakte), wird also
billiger.

1. **15, 8, 6, 20, 5, 19** und die Browser-Frist — sechs kleine, unabhängig
2. **Schlüsselexport** — auf Fable analysiert (2026-09-24), **gebaut am
   2026-09-25** (B270); damit sind alle sieben Blöcke abgearbeitet
3. **18, 10** — Store-Integrität, liegt neben der Schlüsselarbeit
4. **16, 11** — die zwei Grenzen nach außen
5. **9, 12** — ein Oberflächendurchgang samt `one-voice:check`; erledigt am
   2026-09-23, und dabei fielen B256 und B257 an
6. **13** — nach dem Export; **erledigt am 2026-09-24** (B264 bis B268),
   vorgezogen, weil ADR 0158 als Entwurf genuegte. Der Bedienweg im Fenster
   kam am selben Tag dazu: von zwei vorgelegten Flächen hat der Nutzer die
   Raum-Fläche gewählt, weil ein Parkabschnitt heute nur „Ich weiß nicht"
   zeigen könnte — die Erfassung auf dem Client ist zurückgestellt
7. **1, 14** — die zwei Verdrahtungen, beide erledigt. **1** am 2026-09-23
   (`rotationBootstrap`, dabei B259 und B260); **14** am 2026-09-24, nachdem
   der Nutzer den Weg entschieden hatte (B261 bis B263)

## Zukunft

Zielmarke, vom Nutzer am 2026-08-09 festgelegt: **nützlich im Alltag** — ein
Linux- und ein Android-Client, ohne Terminal installierbar und bedienbar, die
mindestens Termine und Spatial Recall tragen. Der sprechende Companion liegt
bewusst dahinter.

### Fixpunkt: Electron 44, vor dem 2026-08-25 — erledigt; der nächste ist der 2026-10-20

Terminiert und nicht verhandelbar. `apps/companion-shell/electron-support.json`
läuft am 2026-08-25 ab und blockiert danach `release:verify`. Die Pin-Policy
erzwingt dann Electron 44, und ein Bump öffnet die ADR-0113-C3-Fläche wieder:
Paketierung, Sandbox-Probe und Speicherbudget sind neu nachzuweisen.

Am 2026-08-18 vorab gemessen: `44.0.0-beta.5` gepackt und im selben
`user_namespace`-Modus gemessen ergibt `Private_Dirty + Private_Hugetlb` von
99.635.200 gegen 100.339.712 bei 43.4.0 — also gefallen, bei einem Budget von
110.000.000. `verify:linux` lief auf der Beta mit Exit 0 durch. Eine Beta ist
nicht das Release; die Aussage ist „wahrscheinlich billig", nicht „erledigt".

**Erledigt am 2026-08-25, und die Vorabmessung war richtungsfalsch.** Electron
44.0.0 erschien an seinem Termin (Chromium 152, Node 24.18.1); Pin und Beleg
stehen darauf, die unterstützten Hauptversionen sind 42–44, und die nächste
Frist ist der 2026-10-20, das geplante Datum von Electron 45. `release:verify`
Exit 0 mit 2.838 Tests, Paketgate eingeschlossen.

Der Speicher ist **gestiegen statt gefallen**: 101.244.928 Byte
`Private_Dirty + Private_Hugetlb` gegen 110.000.000, wo dasselbe Paket auf
43.4.1 heute zwischen 99.893.248 und 100.892.672 lag. Der PSS-Wert der
`user_namespace`-Probe geht von rund 222–223 MB auf 226.916.352 Byte. Beides
hält, und beides widerlegt das „wahrscheinlich billig" der Beta — weshalb der
Absatz darüber es als Vermutung geschrieben hat und nicht als Ergebnis.

Die nächste Frist trägt dieselbe Form: der Beleg läuft am 2026-10-20 ab und
blockiert danach die Kette.

### Phase 3 — die Zustandsgrenze (ADR 0126 P3)

Der Angelpunkt. Die Übergabe von präsenzlokalem in dauerhaften Zustand als
ausdrücklicher, auditierter Schritt, mit den fünf Stellen aus ADR 0129 an der
Grenze statt am Store. Praktisch zieht das den Beobachtungspuffer aus dem Core
ins Gerät — womit das Home keine Rohstandorte mehr sieht und Phase 6 offline
antworten kann.

**Am 2026-08-22 nachgemessen, und die Zeile war zu optimistisch.** "Ein bis
zwei Blöcke" las sich wie Arbeit, die anliegt. Was tatsächlich gilt:

- **Die Tür steht.** ADR 0126 P3 ist zur Hälfte umgesetzt, und beide Keeps
  gehen durch `crossPicoStateBoundary`. ADR 0129 meldet SR1-SR6 als
  implementiert.
- **Was fehlt, ist die zurückgestellte Hälfte**: den Beobachtungspuffer aus
  `apps/core/src/observation-condensation.ts` ins Gerät zu ziehen, und dafür
  braucht es eine Erfassung auf einem Gerät. Genau das ist **Befund B4**, und
  genau das hat der Nutzer vertagt.

**Was sich seitdem geändert hat, und zwar heute:** die Begründung für die
Vertagung war "es gibt keine mobile Laufzeit". Die gibt es seit Phase 5 - ein
Android-Client, der zweimal an einem Tag einem echten Home beigetreten ist.
Was jetzt fehlt, ist ein Erfassungs-Adapter darauf; die Fläche deklariert nicht
einmal eine Standortberechtigung. Damit war die offene Frage keine technische
mehr, sondern die alte Produktfrage ohne ihren technischen Vorwand.

**Am 2026-08-22 gestellt und beantwortet: vertagt lassen.** Phase 3 blieb
damit zu, und Phase 6 hing weiter daran - aber die Vertagung stand auf einer
Entscheidung von jenem Tag statt auf einer Tatsache von gestern. Wer diese
Zeile das nächste Mal liest, muss die Frage nicht erneut aufmachen, um zu
erfahren, ob sie schon gestellt wurde.

**Am 2026-09-03 vom Nutzer aufgemacht — und die Vermessung davor hat den
Auftrag verschoben.** Vier Dinge wurden gemessen, bevor eine Zeile entstand:

1. **Die Voraussetzung ist erfüllt.** Die Vertagung stand auf „es gibt keine
   Erfassung auf einem Gerät"; die gibt es seit dem 2026-08-26.
2. **Die Übergangsart existierte schon.** `derived_observation` steht seit dem
   2026-08-18 im geschlossenen Vokabular von ADR 0126 P3 — *„Declared here and
   unused until a presence with a sensor exists."* Phase 3 brauchte **keine
   ADR-Änderung**, nur ihre Benutzung.
3. **Es fehlte genau eine Tür.** `home.observations.submit` trägt nur
   Rohmessungen; für eine *abgeleitete* Erinnerung gab es keine Operation.
4. **Und die Zeile, die alles verschiebt**, ausgeführt statt gelesen:
   `picoDeriveParkingCandidate` gibt ohne Bewegungsarten `undefined` zurück,
   und `readMobilitySamples` der handgebauten Sonde liefert eine leere Liste.
   **Der Home sammelte also Rohstandorte, aus denen nichts entsteht.**

Punkt 4 ist der Grund, es trotzdem zu bauen, und nicht der Grund, es zu
lassen: Phase 3 nimmt dem Home eine Datenkenntnis, die ihm heute nichts
einbringt. Der Datenschutzgewinn ist sofort da, die Funktion kommt, wenn die
zweite Eingabehälfte existiert.

**Was gebaut ist.** Die Verdichtung liegt auf der Geräteseite
(`apps/companion/src/observation-condensation.ts`), sie nennt keine Domäne —
die ist die einzige Custody, die eine Beobachtung trägt, und der Home nennt
sie —, und die 55. Operation `home.observation.derived.keep` führt das
Ergebnis über `crossPicoStateBoundary` mit der Art `derived_observation`. Der
Ort hängt als Kernspalte am Eintrag (ADR 0129 SR3).

**Und das Gehen hat zwei Dinge gefunden, die das Schreiben nicht fand.**

- **Die kanonische Form der Link-Argumente trägt keine Fließkommazahlen.** Der
  Ort reist deshalb als Text — dieselbe Wand, die der Puffer-Weg am 2026-08-26
  gefunden hat, eine Verdichtung später. Gefunden vom Durchlauf gegen ein
  laufendes Home, nicht vom Lesen.
- **Ein zweites Angebot derselben Ableitung stürzte ab.** Ein Gerät, dessen
  Verbindung nach dem Übergang abbrach, bekam einen Fehler für etwas, das
  längst angekommen war — und behielte seine Messungen im Klartext, also genau
  den leisen Verlust, den ADR 0129 SR5 vermeiden will. Jetzt antwortet der
  Home „schon da", und nur „gerade angekommen" erlaubt dem Gerät, zu leeren.

**Bewiesen, und was nicht.** Der Durchlauf steht gegen echte Prozesse: das
Gerät verdichtet, der Home nimmt an, die Aufzeichnung `home.state_crossed`
steht da und ist inhaltsfrei — Art, Raum, Quellenzahl, nie was. `pnpm
link:walk` zählt **53 von 55**. Auf einem echten Telefon ist nichts davon
gelaufen: **es hing keines an** (`adb devices` leer), und das steht hier statt
zu fehlen. Der letzte Schritt ist ein Gerät und `capture.mjs`, das statt der
Messungen ihr Ergebnis abgibt.

### Phase 5 — Android-Ceremonies (ADR 0131 A5, A3) — abgeschlossen am 2026-08-25

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

**Stand am 2026-08-21: die erste Vertikale läuft, die Sprache gehört dem
Kern, das Urteil über die Hardware auch.** Der volle Beitritt lief auf einem
Galaxy A55 gegen ein echtes Home, und dabei fielen zwei Dinge auf, die kein
Vertrag gefangen hätte:

- Der **letzte Bildschirm** gehörte noch der Fläche. `join.mjs` schickte am
  Ende ein eigenes Verb `done`, außerhalb von
  `PicoCompanionEnrolmentSurface`, und die Activity schrieb dafür eigene
  Worte — während alle Schritte davor schon die des Kerns zeigten. `done` ist
  eine Anzeigeform, kein zweiter Moment, und genau deshalb stand es nicht in
  der Schnittstelle.
- Der **Keystore-Beleg** war schon auseinandergedriftet, bevor die beiden
  Hälften sich je begegnet waren: `google_ec_ca1` in der Sonde gegen
  `google_ec_key_attestation_ca1` im Kern, und ein Sicherheitsniveau als Zahl
  gegen dasselbe als Name. Ein Telefon mit einwandfreier Hardware hätte die
  Ablehnung bekommen, die für gefälschte gedacht ist.

**Stand am 2026-08-22: die Passphrase liegt im TEE, und die Sprache gehört
dem Kern bis in die Ablehnung.** Was am Vortag offen war, ist beides zu:

- **Der Keystore trägt jetzt das Entsperrgeheimnis.** Ein Java-Anschluss über
  AF_UNIX versiegelt die Passphrase mit einem TEE-Schlüssel; der Kern urteilt
  über den Beleg, nicht über die Kette. Am Gerät nachgewiesen, inklusive
  Prozesstod: ein zweiter Prozess öffnete das Versiegelte, und der
  Vault-Daemon nahm die Passphrase an, die niemand getippt hat.
- **Zwei der drei Momente sind umgezogen.** Bei der Passphrase standen sechs
  Schreibweisen für einen Moment, fünf davon im Electron-Hauptprozess allein;
  bei der Ablehnung stand ein Satz für achtzehn, in zwei Schreibweisen. Beide
  Male dieselbe Frage — wem gehören die Worte — und beide Male derselbe Ort.
  `check-one-voice.mjs` hält es, und bewacht dabei auch die elf Schrittsätze,
  die bisher keinen Wächter hatten.

Offen bleibt der dritte Moment, **absichtlich**: die ADR-0106-Zustimmung
schreibt die Fläche selbst, weil der Kern den *Satz* liefert, den eine Person
unterschreibt, und die Frage darüber auf einem Telefon eine Schaltfläche hat
und im Fenster keine.

**Was hier bis zum 2026-08-22 als Phase-5-Rest stand, gehört nicht hierher.**
„E3s zweite Hälfte: das Telefon als Sponsor" liest sich wie fehlende
Android-Arbeit und ist keine. Gemessen am Kern: `enrollPicoHomeDevice`
unterschreibt die Delegation mit `keyRole: 'pico_identity'`, also mit der
Identitätswurzel — und der Vault eines beigetretenen Geräts hält genau zwei
Rollen, `device_signing` und `device_key_agreement`; der Kern erzwingt das
selbst und nennt alles andere `vault_is_not_new`.

Ein Telefon kann also nicht sponsern, weil ihm nichts an Fläche fehlt, sondern
weil Autorität zu schaffen heißt, mit der Wurzel zu unterschreiben. Das ist
**ADR 0131 A6**, und A6 ist geschlossen — mit drei datierten Bedingungen zum
Wiederöffnen, von denen keine „Android-Arbeit" heißt. Die Zeile ist damit
keine Aufgabe dieser Phase, sondern eine Folge einer Entscheidung, die
woanders getroffen wurde.

**Abgeschlossen am 2026-08-25.** Was diese Phase führte, ist zu: die
Gradle-Frage war falsch gestellt, die erste Vertikale läuft, Keystore und
Passphrase liegen im TEE, die Sprache gehört bis in die Ablehnungen dem Kern,
A6 ist geschlossen und keine Android-Arbeit — und A7 hat heute seine laufende
Hälfte bekommen: ein periodischer Dienst entsiegelt, liest authentifiziert
beim Home und zeigt den Satz, den der Kern dazu schreibt. Antwortendes,
stummes und totes Home sind am Gerät unterschieden (A34, RZCW300DTEX).

Was **nicht** zu ist und auch nie zu dieser Phase gehörte: ein ausgelieferter
Android-Client. Das Artefakt bleibt ein Laborartefakt; was es beweist, ist,
dass die Zeremonien und die Sprache dort tragen, nicht dass jemand die App
bekommt.

Wie ein Telefon das Home erreicht: **nicht** über den Foundation-Port, der per
Default an `127.0.0.1` bindet. Der Weg ist der eigene Link-Intake-Listener
(`PICO_LINK_INTAKE_HOST` und `PICO_LINK_INTAKE_PORT`, nur zusammen gültig); der
Companion postet versiegelte Umschläge an `${coreUrl}/api/home/link`, und diese
Route trägt die Zugriffsklasse `link-intake` — weder Session noch Token, weil die
Authentifizierung im Umschlag sitzt.

### Offene Entscheidungen (Stand 2026-09-01: alle vier beantwortet)

Vier Fragen kamen aus den Durchläufen der Woche zum 2026-08-29 und konnten
**nicht in einem Patch beantwortet werden**, weil jede eine Regel verschob
statt eine Zeile. Sie standen hier zusammen, weil sie einzeln in ihren
Befunden liegen und niemand sie dort nebeneinander sieht. Am 2026-09-01 hat
der Nutzer sie einzeln entschieden; jede ist gebaut, gepflanzt und gemessen.
Der Abschnitt bleibt stehen, weil eine beantwortete Frage samt ihrer Antwort
mehr wert ist als eine gelöschte.

- ~~**Darf eine wartende Frage sagen, woran sie hängt?**~~ — **beantwortet am
  2026-09-01**: ja, als Daten und nicht als Satz. Die Argumente stehen
  beschriftet neben dem zugesagten Satz, mit ihrer Herkunftsklasse, nie
  hineininterpoliert — die Gestalt, die ADR 0141 RN3 für die
  Zustimmungsaussage schon entschieden hatte. Gebaut, gepflanzt, und der
  Durchlauf liest zwei Depots mit demselben Satz und zwei `remote`.

- ~~**Wer darf ein Depot nach etwas Neuerem fragen?**~~ — **beantwortet am
  2026-09-01**: wer *jetzt holen* drückt, fragt mit; der planmässige Lauf
  bleibt eine Instandsetzung. Gebaut, gepflanzt, 51 von 54 Link-Türen.

- ~~**Darf das eigene Modell die eigenen Notizen sehen?**~~ — **beantwortet am
  2026-09-01**: PV4 nimmt einen erklärten eigenen Host aus, weil ein Zugang
  beantwortet, wer am anderen Ende ist, und diese Klasse kein anderes Ende hat.
  Gebaut, gemessen, 50 von 54 Link-Türen. Befund B39 trägt die Begründung und
  das, was die Regel kostete, solange sie ausnahmslos war.

- ~~**Wie schnell wird eine Frage losgeschickt?**~~ — **beantwortet am
  2026-09-01**: beim Einreihen fegen, entprellt über eine Sekunde, Zeitgeber
  bleibt als Netz. Gebaut und mit einem Takt von einer Stunde bewiesen.

**Was sie gekostet haben.** B39 öffnete den Rückrufweg, B42 die Antwortzeit,
B38 die einundfünfzigste Link-Tür. B37 war die billigste — und die einzige,
die etwas anderes freilegte als sich selbst: der eine neue Import, den sie
brauchte, kippte die Auswertungsreihenfolge des Protokollpakets und brachte
einen seit Langem im Code beschriebenen Zyklus zu Fall (Befund B49).

### Phase 6 — die erste echte Nützlichkeit

Hängt vollständig an Phase 3.

- ~~**ADR 0129 SR5-Erfassung** auf dem Telefon~~ — **erledigt am 2026-08-26, am
  Gerät bewiesen.** Der Port war deklariert und leer, mit einem Grund, der ein
  Zustand der Welt war: „wer ihn füllt, ist eine mobile Laufzeit, die es nicht
  gibt". Es gibt sie. `home.observations.submit` ist die 51. Operation, und der
  Home behält beide Entscheidungen, die zählen: **ob** aufgeschrieben werden
  darf (SR6) und **in welchem Raum** es liegt — die Domäne reist nicht mit,
  weil ein Absender, der seine eigene nennen dürfte, seine Messungen in den
  Raum eines anderen legte.

  SR5s tragender Satz gilt weiter, jetzt als Bauform: Java misst und schreibt
  eine Zeile, Node liest eine Datei. `capture.mjs` könnte gar kein
  Standort-API erreichen.

  In dieser Reihenfolge gemessen: mit ausgeschalteter Erfassung lehnt das Home
  mit `capture_not_consented` ab und der Puffer bleibt leer; nach dem
  Einschalten kamen sieben echte `LocationManager`-Fixes an. Die lokale Datei
  wird erst geleert, wenn das Home **alle** hat.

  **Eine Grenze, die erst der Wagen zeigte:** die kanonische Form der
  Link-Argumente lässt nur ganze Zahlen zu — damit zwei Implementierungen
  dieselben Bytes hashen —, und Koordinaten sind Fließkomma. Die Übergabe
  spricht deshalb die Sprache des Puffers.

  **Was noch fehlt, ist kleiner und heißt jetzt anders**: die Ableitung hat
  weiter keinen Aufrufer, aber nicht mangels Messungen. Es fehlt ihre zweite
  Eingabehälfte — Bewegungsarten kommen aus den Play-Diensten, die diese
  handgebaute Sonde nicht hat, und ohne den Übergang von „fahrend" zu „gehend"
  hat ein Parkplatz kein Merkmal.
- ~~**Termine auf dem Telefon**~~ — **erledigt am 2026-08-26, am Gerät
  bewiesen.** `entries.mjs` fragt `home.time_bound_entries.read` über den
  authentifizierten Link, `renderPicoCompanionDueEntries` schreibt den Satz,
  und der Bildschirm zeigt ihn an, ohne etwas zusammenzusetzen. Gemessen auf
  einem A34: null fällige Einträge ergeben eine leere Fläche, ein fälliger
  ergibt *„Something you asked for is due — The oldest was due at 2026-08-26
  07:30. Open your Pico Home to see what it is — this device was not given the
  words, only that an entry is waiting."* Der Titel fehlt, weil dieses Gerät
  die Domäne nicht lesen darf; die Fläche sagt das, statt einen Platzhalter zu
  zeigen.

  **Die Quittung kommt vom Knopf, nicht vom Schreiben der Datei.** ADR 0118 O1
  sagt, nur ein Gerät kann sagen, dass es jemanden erreicht hat — und eine
  geschriebene Datei ist kein gesehener Satz. Wer nichts drückt, bekommt den
  Eintrag wieder. Ganzer Kreis am Gerät gelaufen: fällig → angezeigt →
  quittiert → beim nächsten Lesen nichts mehr fällig.

  **Der Satz gehört jetzt dem schalenfreien Kern.** Er stand im
  Electron-Adapter, was richtig war, solange es eine Fläche gab; ab der zweiten
  ist es die Drift, die `check-one-voice` beim Beitritt gemessen hat. Beide
  Flächen lesen dieselbe Funktion.

Das ist der Punkt, an dem jemand das Ding vermissen würde, wenn man es wegnimmt.
Die Zielmarke endet hier.

**B23 — Ein Dienst lief einmal je Prozess, und der Bildschirm zeigte Vorgestern
(2026-08-26).** Beim Messen dreimal darüber gestolpert, dann auf dem Telefon
gesehen, warum es zählt: über dem eben gelesenen Termin stand *„Home not
reached — Your Home is not answering"*. Beide Sätze über dasselbe Home, einer
von 09:02 und einer von 09:09, und nichts, das den alten zurücknimmt.

Die Ursache sitzt in `ProbeService`: `nodejs-mobile` hält eine Node-Instanz je
Prozess, also darf ein Skript je Prozess einmal laufen — das ist der
`started`-Wächter. Zusammen mit `START_STICKY` hieß das, dass der Dienst seinen
Lauf überlebt und **jeder spätere Start stillschweigend wirkungslos** ist. Die
Datei von damals bleibt liegen und liest sich wie heute. Dieselbe Verwechslung,
die ADR 0118 O4 verbietet, eine Ebene tiefer: hier hatte jemand nachgesehen,
und die Antwort war von gestern.

Ein Lauf ist jetzt ein Lauf: kehrt das Skript zurück, endet der Prozess, und
der nächste Start bekommt einen frischen. Wer wohnen bleibt, sagt es —
`CustodyService`, weil der Vault-Daemon nie zurückkehrt, und `JoinService` und
`ClientService`, weil sie sich den Prozess mit der Fläche teilen und ein
`System.exit` dort das Fenster mitten in einer Zeremonie mitnähme.

**B279 — ein hängender Notifier hätte den Wiederherstellungsalarm beendet
(2026-09-25).** Aus B273 die offene Frage: was schläft im Companion still ein,
wenn ein Aufruf nie zurückkehrt? Gemessen wurde, was einen Auftrag festhalten
kann — jede ausgehende Anfrage und jeder Start eines anderen Programms, mit dem
Typprüfer statt über die Schreibweise.

**Die Anfragen halten**: alle elf tragen ein `signal` mit Frist, auch die zwei,
die es von außen nicht zeigen — `probeStatus` setzt seine eigene. **Die
Programmstarts nicht alle.** `notify-send` lief ohne Frist, und es spricht über
den Sitzungsbus mit dem Benachrichtigungsdienst; ein Bus, auf dem niemand
antwortet, ist ein Aufruf, der nie endet. Der Alarmträger wartet jede
Benachrichtigung ab, bevor er die nächste Prüfung plant. Ein hängender Bus
hätte also den Alarm für eine laufende Wiederherstellung für immer beendet,
ohne ein Wort — den Alarm, der einer Person sagt, dass ihr Konto gerade
wiederhergestellt wird, solange sie es noch aufhalten kann. Der Adapter ist
heute exportiert und nicht verdrahtet, die Schale benachrichtigt über
Electron; die Lücke wartete auf den ersten Linux-Weg. Daneben `lp` für die
Wiederherstellungskarte: CUPS, das nicht antwortet, ließ die Person vor dem
empfindlichsten Schritt des Produkts ohne Antwort.

Beide enden jetzt nach einer Frist, und ein Test lässt einen Notifier hängen:
nach 300 ms ist es ein gezählter Fehlschlag; ohne Frist läuft der Test in die
Zeitgrenze.

**Das Netz steht in `children:check`**, der dieselben Starts schon wegen ihrer
Umgebung liest: jeder Start trägt `timeout` oder `signal`, oder er ist
begründet, mit einer Phrase, die seine Datei noch sagen muss. Begründet sind
zwei: der Lieferant, ein langlebiger Prozess, bei dem jede Anfrage ihre Frist
hat, und die Probe der Schale, deren zweite Kopie nach fünfzehn Sekunden
beendet wird. Drei Pflanzungen beißen.

**Ohne Befund daneben gemessen:** das Löschen der übrigen entpackten
Schlüssel — der Tresor-Dienst nullt seinen Antwortschlüssel im `finally`, und
der Companion hält seinen absichtlich als Hex im Antwortbuch, damit eine
Antwort einen Neustart übersteht; eine genullte Byte-Kopie daneben gewönne
nichts. Und die Speicherstrukturen an fremden Eingängen: das Relay begrenzt
seine Töpfe mit fester Decke ohne Verdrängung, das Home seine Tickets auf 128.

**B278 — jede gelesene Erinnerung ließ den Domänenschlüssel liegen
(2026-09-25).** Nach B277 die Frage an dieselbe Kryptographie von der anderen
Seite: wird jeder Schlüssel, den das Produkt lädt oder entpackt, nach Gebrauch
gelöscht — auch auf dem Weg, auf dem etwas wirft? Der Tresor tut es überall,
das Home bei seinen Host-Schlüsseln auch.

**Gemessen über jedes `loadKeyVersion`: zehn Stellen.** Der Export, der
Vergleich beim Import, das Schreddern und der Share-Umschlag löschten den
geladenen Domänenschlüssel. **Die drei Wege, die am häufigsten laufen, taten es
nie**: der Inhalt jeder Erinnerung, geschrieben und gelesen, und die
Zugangsdaten für Modellanbieter und Lieferanten. Jedes Lesen einer Erinnerung
lud den Schlüssel zur ganzen Domäne frisch von der Platte, entpackte einen
Datenschlüssel und überließ beide dem Garbage Collector — der Speicher
freigibt, ohne ihn zu überschreiben. Dieselbe Datei löschte den Schlüssel
beim Schreddern mit `kek.fill(0)`, zwanzig Zeilen tiefer.

Jetzt werden Domänenschlüssel, Datenschlüssel und die Bytes einer
Zugangsangabe im `finally` genullt. Ein Test hält jeden geladenen Schlüssel
fest und sieht nach dem Schreiben, dem Lesen und einem abgewiesenen Öffnen
nach: nur Nullen. Gegen die alten Fassungen fällt er dreimal.

**Der Prüfer fand danach eine vierte Stelle, die die Messung für sauber
hielt**: der Vergleich beim Import löschte den Schlüssel, aber nach dem Hash
statt im `finally` — wirft der Hash, bleibt er liegen. Jetzt im `finally`.

**Das Netz, `zeroing:check`**, liest mit dem Syntaxbaum: das Ergebnis jedes
`loadKeyVersion` gehört einem Namen, und derselbe Name wird in einem
`finally` derselben Funktion genullt. Die Datenschlüssel hält er nicht — sie
tragen keinen Namen, an dem ein Leser sie erkennt —, und der Kopf sagt das.
Vier Pflanzungen beißen: eine alte Fassung, `fill(1)`, ein Laden ohne Namen und
ein blinder Leser. Die Kette hat jetzt 76 Schritte.

**Eine Grenze, die bleibt:** eine Zeichenkette lässt sich in JavaScript nicht
nullen. Die entschlüsselte Zugangsangabe verlässt die Klasse als String, weil
der Aufrufer genau das braucht; genullt werden die Bytes, aus denen sie wurde.

**B277 — eine Schlüsselableitung, zweimal geschrieben (2026-09-25).** B276
fand eine Abschrift, weil nach Dateischreibern gesucht wurde. Die allgemeine
Frage dahinter: welcher Funktionskörper steht im Produkt zweimal? Gemessen mit
dem Syntaxbaum über jede Funktion, Körper ohne Kommentare und Leerraum
verglichen, ab 200 Zeichen: 2.051 Körper, vier Gruppen.

**Die heikelste war Kryptographie.** Die Exportdatei aus ADR 0158 leitete ihren
Dateischlüssel mit einer eigenen Funktion ab, Byte für Byte die des Keyfiles.
Beide nehmen die Kosten von Argon2id aus dem Kopf der Datei, die gerade
geöffnet wird — beim Import eine Datei von außen. Nachgemessen statt geglaubt:
die Grenze hält auf beiden Wegen, weil der AAD-Bauer im Protokoll mit
`kdfParameterBytes` vor jeder Ableitung läuft, beim Keyfile im Parser, den
`openPicoVaultKeyfile` immer durchläuft, beim Export direkt davor. Mein erster
Kommentar dazu behauptete *„every caller runs it first"* — beim Keyfile steht
die Ableitung vor dem AAD-Aufruf; gehalten wird sie vom Parser. Der Kommentar
sagt jetzt, wo. Eine KDF, die zweimal steht, lässt sich einmal ändern; jetzt
steht sie einmal.

Die zwei anderen: der Bürge einer Gerätezeremonie, im Companion für Beitritt
und Gerätelebenslauf je einmal ausgeschrieben, und die Sitzungssuche in zwei
Zeremonien des Tresor-Dienstes. Beide stehen jetzt einmal, in `profile.ts` und
`protocol.ts`, die ihre Aufrufer schon importierten. Die vierte Gruppe,
`narrowToOwner` in Home und Relay, ist das Modulpaar, das `copies:check` schon
als Spiegel hält.

**Das Netz ist die dritte Gestalt in `copies:check`**, der Konstanten (B69)
und ausgeschriebene Listen (B70) schon so hält: ein Funktionskörper ab 200
Zeichen steht einmal, oder beide Stellen liegen in einem gespiegelten
Modulpaar. Darunter hält der Schritt nichts, und er sagt das. Vier Pflanzungen
beißen: jede der drei Abschriften zurück und ein blinder Leser.

**B276 — dreimal derselbe Schreiber im Companion (2026-09-25).** Nach B275
die Frage eine Stufe weiter: welche Umbenennung setzt einen Zustand in Kraft,
ohne dass das Verzeichnis danach auf der Platte steht? Gemessen über jedes
`renameSync` im Produkt.

**Ohne Befund, und warum:** Die Beförderung des Rotationspaars im Home
synchronisiert nicht, braucht es aber nicht — geht das Umbenennen verloren,
liegt das Paar noch da, und `completeInterruptedRotation` setzt es beim Start
gegen den bewiesenen Kettenkopf in Kraft; seit B275 steht sein Inhalt sicher.
Das Zurückspielen einer Sicherung synchronisiert seine Kopie nicht, hat aber
keinen Produktaufrufer, was `capability:check` schon festhält. Die Sicherung
selbst schreibt die Backup-API von SQLite, die ihr Ziel mit einem
synchronisierten Commit abschließt. Daneben gemessen und sauber: das Home
schwärzt das Ticket in URLs, bevor Fastify sie loggt, und das Relay loggt nur
eigene Ereignisse ohne Anfragedaten.

**Der Befund ist eine Abschrift, keine Lücke.** Der Beziehungsspeicher der
Relays und die Plattform-Entsperrung schrieben Zwischendatei, Modus, fsync,
Umbenennen und Verzeichnis-fsync Zeile für Zeile so, wie
`writePicoCompanionFileAtomically` es im selben Paket tut. Richtig, beide —
aber B121 ist genau das, was aus einer Abschrift neben der richtigen wird: eine
Datei im selben Verzeichnis, die es nicht so machte. Beide rufen jetzt den
gemeinsamen Schreiber.

**Das Netz** steht wieder in `mode:check`, bei denselben Stellen: wer
`renameSync` oder `linkSync` ruft, ist ein bekannter Schreiber, mit dem Grund,
warum er nicht den gemeinsamen seines Pakets nimmt oder selbst dieser ist.
Sieben sind es. Zwei Pflanzungen beißen: die alte Abschrift zurück und ein
Argument für einen Schreiber, der nichts mehr veröffentlicht.

**B275 — die Schlüssel standen zuletzt auf der Platte (2026-09-25).**
Gemessen wurde, welche Dateien das Produkt anlegt, ohne sie zu
synchronisieren. Der Baum kennt die Klasse genau: `atomic-file.ts` im Companion
(B121) und der Wiederherstellungsanker im Home (B214) schreiben eine
Zwischendatei, synchronisieren sie und benennen um. **Ausgerechnet die
Schlüssel fehlten** — das eine, was sich nicht neu ableiten lässt.

Die Domänenschlüssel des Homes, das Host-Schlüsselpaar samt dem für die
Rotation und die Schlüsseldatei des Tresors wurden mit einem nackten
`writeFileSync` angelegt. SQLite synchronisiert seine eigenen Commits, also
war die Reihenfolge auf der Platte verkehrt: die unter einem neuen Schlüssel
verschlüsselten Zeilen erreichten sie, der Schlüssel selbst lag vielleicht noch
im Seitencache. Nach einem Stromausfall kann eine neue Datei leer
zurückkommen — der klassische Fall auf ext4 — unter Zeilen, die stehen. Eine
Domäne mit leerem Schlüssel liest niemand mehr. Ein leeres Host-Schlüsselpaar
weist `load` als ungültig ab, und das Home startet nicht. Und eine leere
Schlüsseldatei im Tresor nimmt, wie ein Kommentar im Dienst selbst sagt, den
ganzen Tresor mit, weil er jede Datei im Verzeichnis liest. Das Paar für die
Rotation sagte über sich *„Staging is durable"*.

**Jetzt: angelegt, nie ersetzt, und auf der Platte, bevor jemand davon
erfährt.** Die Zwischendatei wird synchronisiert und mit `link` veröffentlicht,
nicht mit `rename` — `link` scheitert an einem vorhandenen Namen atomar wie
vorher `wx`, `rename` ersetzte ihn. Danach das Verzeichnis. Im Home steht das
in `durable-file.ts`, im Tresor-Paket ein zweites Mal, weil es das Home nicht
importieren darf.

**Die Zwischendatei hat einen festen Namen, und das ist eine
Sicherheitseigenschaft.** Ein Absturz zwischen Schreiben und Veröffentlichen
lässt eine Kopie des Schlüssels unter diesem Namen liegen. Mit zufälligem
Namen hätte `shredDomain` den Schlüssel vernichtet und seine Kopie daneben
stehen lassen. So nimmt das Schreddern sie mit — auch die einer Version, deren
Anlage nie fertig wurde und die darum in keiner Versionsliste steht. Das
Verwerfen einer Rotation und das Zurücksetzen tun dasselbe, und die vier
Rücknahmen im Tresor-Dienst ebenso. Die Frische-Prüfung des Tresors zählt eine
unveröffentlichte Zwischendatei nicht mit, sonst sperrte ein Absturz beim
ersten Schlüssel jede weitere Einrichtung.

**Die Netze:** Acht Tests halten die Reihenfolge — Datei und Verzeichnis
synchronisiert, bevor die Version herausgegeben wird —, das Nie-Ersetzen und
das Schreddern der Zwischendatei. Und `mode:check`, der dieselben Stellen schon
wegen der Rechte las, fragt jetzt auch das: eine Quelldatei, die Dateien
anlegt, synchronisiert sie oder ist begründet. Begründet ist eine, die
Wiederherstellungskarte als PDF. Sieben Pflanzungen beißen, darunter `rename`
statt `link` und ein Schreddern, das die Zwischendateien übersieht.

**Vorher gemessen, ohne Befund:** die IPC-Grenze des Companion. Alle 40 Wege,
die vom Fenster ein Argument annehmen, prüfen zuerst den Absender und dann das
Argument — durch einen Parser, eine Typprüfung oder über `?.`, das auch `null`
und Zahlen übersteht.

**B274 — vier Bytes eines Lieferanten hätten das Home beendet (2026-09-25).**
B273 hatte die asynchrone Hälfte gemessen: eine Ablehnung, die niemand fängt.
Die synchrone Schwester ist eine Ausnahme in einem Rückruf, den ein Zeitgeber
oder ein Ereignis aufruft — auch sie beendet einen Node-Prozess. Gemessen
wurden darum alle Zeitgeber und alle Lauscher auf fremden Bytes in Home,
Tresor-Dienst und Relay.

**Die Zeitgeber halten.** Der Aufräumlauf des Homes steht ganz im `try`, der
Keepalive der WebSockets pingt nur offene Sockets. Der Aufräumlauf des
Tresor-Dienstes würde bei einem Fehler den Dienst beenden, aber das ist die
sichere Richtung: ein toter Dienst hält keine entsperrten Schlüssel. Die
Companion-Schleifen stellen sich im `finally` neu oder laufen als Intervall
unabhängig vom einzelnen Durchlauf; dort schläft nichts ein.

**Ein Lauscher hielt nicht: der Leser der Lieferanten-Antworten.** Er parste
ein Frame mit `JSON.parse` und ging von dort direkt zu `frame.family`. `null`
ist gültiges JSON, und für `null` ist dieser Zugriff ein TypeError — im
`data`-Lauscher auf der Standardausgabe des Lieferanten, also eine nicht
gefangene Ausnahme, und das Home endet. Ein Lieferant kommt aus einem Depot,
ist also fremder Code, und vier Bytes Inhalt genügten. Die Nachbarn hatten die
Formen schon: ein Frame der falschen Familie und eine unerbetene Antwort
wurden verworfen, nur ein Frame, das gar kein Objekt ist, nicht.

Jetzt ist, was kein Objekt ist, kein Frame und wird verworfen wie eines der
falschen Familie. Ein Test schickt `null`, eine Zahl, eine Zeichenkette und
ein Array; zurückgepflanzt meldet vitest genau den TypeError als nicht
gefangene Ausnahme.

**Kein eigener Prüfer, und das ist gemessen.** Alle anderen Lauscher auf
fremden Bytes stehen im `try` oder reichen an einen Fänger weiter: der
Frameleser des Tresor-Dienstes (B75), sein Client, das Relay über `handle()`
mit `.catch` und der Link-Eingang des Homes über Fastify. Ein Netz über die
Form der Lauscher bestünde aus einer Regel und fünf Begründungen. Die 71
Stellen, an denen `JSON.parse` sofort einen Typ bekommt, lesen fast alle die
eigene Datenbank des Homes, die das Home selbst geschrieben hat.

**B273 — ein Termin, der nicht markiert werden konnte, hätte das Home beendet
(2026-09-25).** Pico läuft als Hintergrunddienst, und unter Node 22 beendet
eine unbehandelte abgelehnte Promise den Prozess. Gemessen wurde darum, welche
Promise der Baum wegwirft, ohne ihre Ablehnung zu behandeln. Gelesen hat der
Typprüfer, nicht ein Muster: die erste Zählung über die Schreibweise fand 509
Stellen, weil sie `void` als Rückgabetyp nicht vom `void`-Operator
unterscheiden kann. Mit Typen blieben ohne Ablehnungszweig drei Stellen im
Home und drei im Tresor-Dienst, im Relay und in den Paketen keine.

**Der Zeitgeber des Terminplaners warf seinen Tick weg**: `void tick()`. Der
Tick liest und markiert im Speicher außerhalb seines `try` — das `try` fängt
nur die Ankündigung. Ein `UPDATE`, das nicht durchgeht, etwa bei voller Platte,
wurde so zur unbehandelten Ablehnung, und eine einzige nicht markierbare
Erinnerung hätte das ganze Home mitgenommen, samt Link und Gedächtnis. Nach
dem Neustart wäre derselbe Termin fällig gewesen und dasselbe passiert. Und
hätte der Prozess überlebt, hätte nichts den Zeitgeber neu gestellt: jeder
spätere Termin wäre ohne ein Wort unangekündigt geblieben, das eine Ergebnis,
gegen das diese Familie gebaut ist. Der bestehende Test konnte es nicht sehen,
weil er `tick()` selbst abwartet — der eine Aufrufer, der die Ablehnung immer
bekommt.

Jetzt meldet der Planer einen gescheiterten Tick über ein **Pflichtfeld**
`reportFailure` ins Log des Homes und versucht es nach einer Minute wieder.
Gestoppt mitten in einer Ankündigung, lässt er den Speicher in Ruhe, weil der
`onClose`-Haken ihn gleich danach schließt. Zwei Tests fahren den Weg über den
Zeitgeber; zurückgepflanzt meldet vitest genau die unbehandelte Ablehnung.

Dazu der Dienstbefehl des Tresors: `void daemon.close().then(resolve)` beim
Signal. Ein Schließen, das scheitert — die letzte Audit-Zeile bei voller
Platte —, gab einen rohen Stapel statt der Fehlerzeile, und die umgebende
Promise wurde nie fertig. Jetzt geht die Ablehnung dorthin, wohin die Fehler
des Befehls gehen.

**Das Netz, `floating:check`**, läuft nach dem Bau mit dem Typprüfer über
Home, Tresor-Dienst, Relay und alle Pakete: jede verworfene Promise hat
`.catch` oder `.then(ok, fehler)`, auch vor einem `.finally`, oder ist
begründet. Begründet sind vier, darunter der periodische Planer, dessen Tick
außerhalb des `try` nur Speicher im Prozess berührt. Fünf Pflanzungen beißen:
B273 zurück, ein `then` mit nur einem Arm, ein veraltetes Argument, eine
nackte Anweisung im Relay und ein blinder Leser.

**Nicht im Netz ist der Companion, und das ist gemessen**: Electron 44 warnt
bei einer unbehandelten Ablehnung im Hauptprozess nur und läuft weiter. Dort
ist die Frage nicht der Prozess, sondern das stille Einschlafen, und die ist
eine eigene Messung. Zwei weitere Kandidaten dieser Runde trugen keinen
Befund: Die Lesewege des Fensters liefern bei einem Fehler dieselbe leere
Liste wie bei „keine", aber auch die Fehlerzweige des Renderers blenden nur
aus, wie ADR 0118 O4 es begründet. Und die Grabsteine, die beim Start
durchgesetzt werden, haben genau zwei Schreiber, beide in der gelesenen Form.

**B272 — sechs Standardzweige waren der letzte bekannte Fall (2026-09-25).**
Aus B271 die nächste Frage: wo verzweigt der Baum sonst über eine geschlossene
Menge, ohne dass ein fehlender Fall den Bau bricht? Gemessen über alle
`switch`-Anweisungen im Produktcode — und es sind nur 22.

**Die tückischere Form fand sich nicht beim Schweigen, sondern bei den
Sätzen.** Sechs Standardzweige fingen nicht das Unbekannte auf, sie **waren**
der letzte bekannte Fall: `case 'revoked': default:` vor dem Satz *„You ended
its authority"*, `case 'recovery_card': default:` vor *„Enter the Vault
passphrase"*, und so weiter bei den Gründungs- und Beitrittsschritten, beim
Leser des Einrichtungsjournals und beim Leserstatus. Ein neuer Wert in einer
dieser Mengen hätte einer Person den Satz eines anderen Zustands gezeigt —
beim Gerätestatus eine Handlung, die sie nie getan hat —, und der Bau hätte
nichts gesagt. Zur Laufzeit waren die Leser dicht; die Lücke lag zwischen
zwei Änderungen am selben Typ.

Jeder der sechs heißt jetzt den letzten Fall beim Namen, und weil jeder am
Ende einer Funktion mit Rückgabetyp steht, hält der Compiler die
Vollständigkeit (TS2366). Dazu der CLI-Verteiler des Tresors, derselbe Fall
wie B271 eine Tür weiter: ein neuer Befehl ohne Fall hätte ohne Wirkung mit 0
geendet. Vier Pflanzungen — ein neuer Status, Zweck, Schritt, Befehl — brechen
jeweils an der Satzstelle.

**Das Netz, `switch:check`**, kann keine Typen lesen und fragt darum, was es
fragen kann: jeder Standardzweig ist erschöpfend oder begründet, und ein
`switch` ohne Standardzweig muss das Letzte in einer Funktion sein, die etwas
zurückgibt — sonst fällt ein fehlender Fall still durch. B271 selbst,
zurückgepflanzt, wird gefangen. Zehn offene Standardzweige sind begründet,
jeder mit Eingaben von außen: Pfade, Dateiendungen, Ablehnungscodes.

**Und die erste Messung war selbst zu eng**: ihr Muster verlangte einen
Ausdruck ohne Klammern und fand 21. Der Prüfer zählt die Klammern und fand den
22. — `switch (extname(filePath))`. Dieselbe Lehre wie B188, im Kleinen.

**B271 — eine Familie, die gelesen und nicht verteilt wird, bekam keine
Antwort (2026-09-25).** B259 hatte notiert, dass kein Tor die Anfragefamilien
des Vault-Daemons kennt, und ein Tor über ihre Schreibweise vorgeschlagen.
Nachgemessen war die Schreibweise nicht das Problem: jeder der 23 Namen steht
genau einmal, in `protocol.ts`, und die Tests nennen nur absichtlich falsche.
Jede Familie hat einen Lesefall und einen Verteilerfall.

**Die Lücke war eine andere, und sie war still.** Der Verteiler im Daemon hatte
keinen Standardzweig und keine `never`-Prüfung. Eine Familie, die gelesen und
für die niemand einen Verteilerfall schreibt, übersetzte sich, fiel durch den
`switch` und bekam **keine Antwort** — der Client wartete bis zu seiner Frist
und meldete einen Zeitablauf, wo ein fehlender Fall die Ursache war. Das Home
hält seine Link-Operationen seit ADR 0107 genau so fest; der Daemon hatte die
Sicherung nicht.

Zwei Richtungen, zwei Netze. **Verteilt:** ein `never` im Standardzweig macht
aus dem Schweigen einen Übersetzungsfehler — gepflanzt, der Bau bricht. **Gelesen:**
der Leser verzweigt über eine Zeichenkette, und dort hilft kein Typ; ein Test
schickt jede deklarierte Familie leer hinein, und nur ein fehlender Lesefall
antwortet `unknown_request_family` — gepflanzt, der Test fällt.

Die Lehre ist die von B269 in anderer Gestalt: **die Notiz beschrieb, was ich
vermutete, und die Messung fand, was da war.** Ein Tor über Schreibweisen wäre
grün gewesen und hätte die eine Stelle nicht gesehen, an der der Daemon
schweigt.

**B270 — der Schlüsselexport ist gebaut, und der Bau hat den Entwurf zweimal
berichtigt, wo er sich auf etwas Falsches verließ (2026-09-25).** ADR 0158
KE1–KE6, Gabel A (auf dem Gerät versiegeln) und Gabel B (Leserschaft je
Domäne), gegangen gegen ein echtes, verschlüsseltes Home: exportieren, den
Schlüsselspeicher verlieren, zurückbringen, die Erinnerung wieder lesen.
Damit ist B255s Satz — *eine Person kann den Verlust nicht verhindern, nur
erleiden* — nicht mehr wahr.

**Erste Berichtigung: ein Zeitpunkt, den der Falsche unterschreibt.** Der
Entwurf wies eine Domäne ab, die nach dem Exportzeitpunkt geschreddert wurde.
Dieser Zeitpunkt steht im Importsatz — und den unterschreibt der
Importierende. Wer eine alte Datei hat, behauptet einen späteren. Ersetzt
durch Digests: ein Shred schreibt jetzt auf, welche Schlüssel er zerstört hat.

**Zweite Berichtigung, an der ersten.** Beim Durchdenken des nächsten Falls
fiel die Digest-Regel selbst: exportieren, Schlüsselspeicher verlieren, etwas
Neues schreiben (ein neues `v1` entsteht), schreddern — der Shred sieht und
verzeichnet nur den *neuen* Schlüssel, und die alte Datei käme zurück. Der
Export schreibt darum auf, welche Digests er herausgab; was **vor** einem
Shred herausging, kommt nicht wieder. Beide Quellen stehen im eigenen
Protokoll des Homes, in seiner eigenen Einfügereihenfolge.

**Und eine Wache, die nie beißen konnte.** Der Schlüsselspeicher hält auch
`pico-model-provider-credentials`. Ich hatte ihn im Export ausgefiltert; die
Begehung zeigte, dass ein Lesezugang auf diesen Namen gar nicht erst
angenommen wird (`domain_is_not_host_custody`). Die Leserschaft hält die
Grenze schon. Der Filter ist weg — dieselbe Lehre wie B269, eine Ebene tiefer:
zwei Stellen für eine Regel, und die zweite hat keinen Gegenstand.

**Eine Falle, die bleibt und jetzt gesagt wird.** Wer nach dem Verlust etwas
Neues schreibt, *bevor* er zurückbringt, gibt der Domäne ein neues `v1`; der
alte Schlüssel kollidiert, und die alten Erinnerungen bleiben unlesbar. Zwei
Generationen unter einem Namen gehen nicht. Das Fenster sagt diesen Fall als
das, was er meist ist.

Offen: KE1s Modulgrenzen-Prüfung ist noch kein Tor, und die Begehung kennt
einen Leser, nicht zwei.

**B269 — beinahe ein zweiter Prüfer über ein Subjekt, das schon einen hatte
(2026-09-24).** Aus B268 folgte die Aufgabe: die zwei Listen gegeneinander
halten. Ich habe dafür ein Tor gebaut, `catalog:check`, mit drei Regeln — und
es war grün. Dann fiel `capability:check` über die neue Exportfunktion und
fragte, wer sie aufruft. Beim Suchen nach einem Aufrufer fand ich den Test, den
es längst gibt.

**`sign-rendering.test.ts` hält seit Befund B174 (2026-09-14) denselben
Dreiklang** — und zwei meiner drei Regeln waren seine. Was fehlte, war genau
eine Richtung: beide vorhandenen Fälle gehen von der *Rollenmenge* aus und
fragen nach Bytes und Satz. B268 fiel andersherum — ein Bauer, den **keine**
Rolle unterschreiben darf.

Das zweite Tor ist wieder weg; der dritte Fall steht jetzt neben den zwei
anderen, in einer Datei. **Eine Wahrheit, zweimal geschrieben, driftet** — und
zwei Prüfer über einen Dreiklang wären genau das gewesen, mit dem Zusatz, dass
der jüngere seine Herkunft vergisst und der ältere sie behält.

**Was das über `capability:check` sagt.** Es hat hier nicht gefunden, wofür es
geschrieben wurde. Es hat gefragt *wer ruft das auf*, und die Antwort war ein
Test, den ich nicht kannte. Ein Prüfer, der nach Aufrufern fragt, ist
nebenbei ein Verzeichnis dessen, was es schon gibt.

**B268 — ein Tor sagte ja, und der laufende Vault sagte nein (2026-09-24).**
Der Knopf, der einen gehosteten Raum beendet (Nutzerentscheidung, zwei Flächen
vorgelegt, eine gewählt), war gebaut und `verify:gates` grün — und der erste
Durchlauf gegen echte Prozesse endete auf `unknown_signature_input_label`.

Der Grund: **zwei Listen über dasselbe Subjekt.** `sign-rendering.ts` sagt, was
der Daemon *bauen und zeigen* kann; `signableLabelsByKeyRole` in
`packages/vault` sagt, was eine Schlüsselrolle *unterschreiben darf*.
`label:check` liest die erste. Ich hatte die erste ergänzt und die zweite
übersehen.

**Das ist nicht neu, und der Kommentar an genau dieser Stelle sagt es schon.**
Befund B36 lag vier Monate so: `grantPicoCompanionDomainRead` wurde am
2026-08-16 ausgeliefert, jeder Druck endete auf demselben Namen, *„und kein Test
hat es gemerkt, weil sie alle über einen Stellvertreter unterschreiben."*
Beide Male gefunden hat es ein Durchlauf gegen einen echten Daemon.

**Gebaut am selben Tag, und an der Stelle, an der schon einer stand** (B269):
`sign-rendering.test.ts` hielt seit B174 zwei der drei Richtungen; die dritte —
ein Bauer, den keine Rolle unterschreiben darf — steht jetzt daneben. Eine
Pflanzung stellt B268 nach und fällt.

**B267 — ein Kommentar, der `.sign(` erklärt, meldete sich als Signieraufruf
(2026-09-24).** Nach dem Falten der Rollenprüfung (B265) hielt
`check-signature-labels.mjs` die Weiterleitung für eine Signierstelle, deren
Etikett es nicht auflösen kann — richtig, denn sie reicht `label` durch. Der
Prüfer erkennt eine Weiterleitung genau daran, dass `.sign(` einen **blossen
Bezeichner** bekommt; meine erste Fassung baute das Objekt an Ort und Stelle
zusammen. Umgestellt, und die zwölf Aufrufe durch zwei Weiterleiter werden
wieder an ihren Aufrufstellen beurteilt.

**Und dabei fiel ein zweiter Fehler auf, diesmal im Prüfer.** Der Kommentar,
der die Umstellung erklärt, enthält `.sign(` in Anführungszeichen — und wurde
mitgezählt: die Datei hielt angeblich **zwei** Aufrufe ohne Etikett, von denen
einer Prosa war. `blankStringsAndComments` gibt es in diesem Skript seit jeher,
`callSpan` liest darauf, und die Suche selbst lief trotzdem auf dem Rohtext.

**Dieselbe Lehre wie B188** — *eine Regex ist kein Leser von Quelltext* —, mit
einem Zusatz: wer beide Fassungen hat, muss auch beide benutzen. Zwei
Pflanzungen belegen den Unterschied: ein echter Aufruf ohne Etikett fällt
weiterhin, ein Kommentar darüber nicht mehr.

**B266 — was fehlte, war eine Tür, und die Maschine dahinter stand schon
(2026-09-24).** Entscheidung 13, ADR 0078 K9, Befund B192. Ein
Reader-Custody-Raum ließ sich anlegen, beschreiben, öffnen, schließen und
umschließen — aber nicht beenden. `dropDomain` räumt seit jeher alles zu einem
Raum weg, wenn ein Satz seine Prüfung nicht mehr besteht: **Reparatur, keine
Wahl.** Was fehlte, war die unterschriebene Aussage davor, die aus dem Griff
eine Entscheidung macht.

Gebaut als sechste Autoritätsressource neben den fünf vorhandenen, mit einem
eigenen kanonischen Label, einem eigenen Ereignis und einem eigenen Satz. **Der
Name ist die halbe Arbeit:** `memory.reader_custody_discarded`, nicht
`memory.domain_shredded`. K9 sagt, warum — der Host-Schredder zerstört
Schlüssel und macht damit jede Sicherung dunkel; hier liegen die Schlüssel bei
den Lesern, und das Home wirft nur weg, was es selbst hält. Denselben Namen zu
nehmen wäre die Überbehauptung, die ADR 0070 verhindern soll.

Was der Daemon beim Unterschreiben zeigt, nennt die Grenze mit: *„Readers keep
their keys; copies elsewhere are untouched."* Wer das unterschreibt, hat es
gelesen.

**Eine Stelle ist bewusst milder als ihre Geschwister.** Die fünf anderen
verlangen einen gültigen Domänensatz, weil sie etwas hinzufügen; diese nimmt
nur weg — und ein Raum, dessen Eigentümer kein Mitglied mehr ist, ist genau
der, den loswerden zu können am meisten zählt.

**B265 — dieselbe Rollenprüfung zweimal, am Tag ihrer Entstehung gefangen
(2026-09-24).** Die neue Zeremonie prüfte nach dem Unterschreiben, dass der
Vault wirklich die Wurzel genommen hat — genau wie der Nachbar in
`reader-custody.ts`, Wort für Wort. `refusal:check` weist das ab: *eine Regel,
zweimal in einem Paket gegangen, driftet in die Richtung, in die niemand
schaut.* Beide teilen sich jetzt `signPicoCompanionWithIdentityRoot`.

Bemerkenswert ist der Zeitpunkt: die Kopie war keine Stunde alt. Ein Tor, das
Duplikate erst nach Monaten findet, findet Drift; dieses hier hat sie
verhindert.

**B264 — ein grünes Tor aus dem falschen Grund, und die Umbenennung beim
Import war schuld (2026-09-24).** Beim Bau von Entscheidung 13 bekam die
Companion-Zeremonie denselben Namen wie die Link-Anfrage darunter, und der
Aufrufer importierte die untere per `as` unter einem anderen. `capability:check`
vergleicht Namen: die Importzeile nannte *beide* Namen, also galten beide als
erreicht — obwohl die obere keinen Aufrufer hatte.

Aufgefallen ist es nicht am Tor, sondern an der Frage, warum es plötzlich grün
war. Gegengeprobt: die Zeremonie umbenannt, und das Tor fiel sofort mit genau
dem Satz, den es hätte sagen müssen. Danach hat sie einen wirklichen Aufrufer
in der Schale bekommen, neben ihren fünf Geschwistern.

**Die Lehre ist die von B188 in einer neuen Gestalt** — *eine Regex ist kein
Leser von Quelltext*: ein Prüfer, der Namen zählt, zählt auch die, die nur in
einer Umbenennung vorkommen. Aufgeschrieben, nicht gebaut: den Prüfer die
Importform lesen zu lassen wäre richtig, und er müsste dafür die
Aliasschreibweise verstehen.

**B263 — `JSON.parse("null")` ist gueltiges JSON und `typeof null` ist
`object` (2026-09-24).** `refusal:check` verlangte eine Begehung fuer
`invalid_pico_parking_answer` — den Namen, den das Geraet einem Home gibt, das
falsch antwortet. Die Begehung fand sofort einen echten Fehler: ein Ort, der
als `"null"` ankommt, erzeugte `TypeError: Cannot read properties of null`
statt der benannten Ablehnung.

Die Stelle traegt einen **Ort einer Person**, und was dort nicht abgewiesen
wird, erscheint als Punkt auf einer Karte — ein erfundener sieht aus wie ein
gemessener. Der Leser prueft jetzt auf Objekt, nicht-`null` und nicht-Array,
bevor er Felder anfasst.

**B262 — der Schredder haette eine Aussage darueber stehen lassen, wann jemand
gefahren ist (2026-09-24).** Beim Bau von Entscheidung 14 fiel eine Tabelle an:
`pico_parking_decision` haelt, was eine Person ueber einen abgeleiteten Parkort
gesagt hat. Die erste Fassung war nach Identitaet **und Uebergang**
geschluesselt — fachlich naheliegend, und `ceiling:check` wies sie zurueck: so
waechst sie mit jeder Fahrt, ueber die jemand je entschieden hat.

Das Tor hat damit nicht nur einen Deckel erzwungen, sondern die bessere Form.
Gelesen wird immer nur die **juengste** Ableitung; eine Entscheidung ueber eine
aeltere wird nie wieder gefragt. Sie aufzuheben hiesse, eine Liste davon zu
fuehren, wo das Auto einer Person an welchem Tag stand. Jetzt: **eine Zeile je
Person**, die die naechste Antwort ersetzt.

**Und dann fehlte immer noch der Schredder.** `reset:check` verlangte eine
Aussage darueber, was ein Home-Reset mit der Tabelle tut, und beim Aufschreiben
der Begruendung zeigte sich, dass `domain-shred.ts` sie gar nicht kannte. Ein
zerstoerter Domaenenschluessel macht `source_transition_at` nicht unlesbar —
und das ist fuer sich schon eine Aussage darueber, wann jemand gefahren ist.
**Dieselbe Form wie B251**, eine Tabelle weiter: geloescht war der Inhalt,
nicht der Umstand. Die Zeile traegt jetzt ihren Raum, und die Kaskade hat einen
vierten Port.

**B261 — "die juengste Ableitung" hiess "die zuletzt geschriebene Zeile"
(2026-09-24).** Die Pflanzung gegen die Auswahl biss zuerst nicht, und der
Grund war, dass die Begehung den Fall nicht herstellte, fuer den die Auswahl da
ist. `picoPlacedMemoryItems` sortiert nach `created_at`; genommen wurde die
erste passende Zeile.

Der Fall ist keiner aus dem Lehrbuch: ein Telefon, dessen Verbindung abriss,
gibt gepufferte Messungen ab, sobald es wieder kann — und dann kommt die
**aeltere** Ableitung nach der neueren an. Wer "die juengste" als "die zuletzt
geschriebene Zeile" liest, schickt eine Person zum Parkplatz von vorgestern.
Verglichen wird jetzt `parkedAt`, also wann das Fahrzeug zur Ruhe kam, und die
Begehung reicht eine aeltere Fahrt nach, damit die Pflanzung etwas zu fangen
hat.

Danebenlag dieselbe Lehre ein zweites Mal: eine Pflanzung, die den Leser nur
nach Identitaet suchen liess, kam durch, weil der Weg nur **eine** Fahrt
kannte. Jetzt faehrt er zweimal — und ein Nein von vorgestern faellt nicht mehr
auf die Ableitung von heute.

**B260 — eine Aufraeumung, die genau die Datei nicht erreichen konnte, fuer
die sie da war (2026-09-23).** Beim Bau von `rotationBootstrap` (Entscheidung 1)
hat eine Pflanzung nicht gebissen: die Aufraeumung im Fangblock zu entfernen
aenderte nichts. Nachgemessen war der Grund kein Testfehler, sondern die
Reihenfolge zweier Zeilen — und sie stand so in **allen drei** Bootstraps:

```
writePicoVaultKeyfile(path, created.keyfile);
paths.push(path);
```

`writePicoVaultKeyfile` ist `writeFileSync` mit `wx`, kein atomares Umbenennen.
Ein Schreiben, das unterwegs stirbt, laesst eine Datei zurueck — und `paths`
lernt den Pfad erst, wenn das Schreiben gelungen ist. Die Aufraeumung sah also
jede Datei ausser der einen, die uebrig blieb.

Bei den Zwillingen faellt das nur beim **letzten** der drei bzw. zwei
Keyfiles an; bei der Rotation, die genau eine Datei schreibt, war die
Aufraeumung damit vollstaendig gegenstandslos. Und die Folgen sind dort am
groessten: eine halb geschriebene Wurzel zaehlt als zweite Wurzel und sperrt
eine Person aus, je wieder eine echte anzulegen — ein misslungener Wechsel, der
den Wechsel unmoeglich macht. `#listKeyfiles` liest ausserdem *jede* Datei im
Verzeichnis, also nimmt ein unlesbarer Rest den ganzen Tresor mit.

Die zwei Zeilen sind in allen drei getauscht. Ein zerrissenes Schreiben braucht
eine volle Platte und ist im Test nicht herstellbar; begangen wird darum die
Eigenschaft, auf die es ankommt — nach einem gescheiterten Schreiben ist der
Tresor unveraendert und oeffnet noch —, ueber ein schreibgeschuetztes
Schluesselverzeichnis, das den Fangblock wirklich erreicht.

**B259 — kein Tor kennt die Wire-Labels des Vault-Daemons (2026-09-23).**
Gemessen beim Anlegen von `pico.vault.daemon.rotation.bootstrap.v1`: `wire:check`
zaehlte danach unveraendert 137 Labels. Es liest Deklarationen ausschliesslich
aus `packages/protocol/src`, und `apps/vault-daemon/src/protocol.ts` steht bei
ihm in der Liste der Dateien, die ein Label ausschreiben *duerfen* — aus einem
guten Grund, aber der Nebeneffekt ist, dass die Familienliste des Daemons
niemandem gehoert. `refusal:check` sieht die Ablehnungen des Daemons ebenfalls
nicht als deklariert: sein Muster liest `reason: 'a' | 'b'`, und der Daemon
antwortet mit einem Literal an `#respondError`. Die geworfenen Ablehnungen
zaehlt es (1.035 auf 1.038), die Namen nicht.

Kein Fehler, aber eine unbewachte Flaeche: 24 Anfragefamilien ueber einen
Socket, jede mit einer Version im Namen, und nichts haelt sie darauf, einmal
geschrieben und in der Version zu stehen, die der Daemon kennt. Notiert, nicht
gebaut. **Am 2026-09-25 nachgemessen und anders gebaut als notiert** (B271).

**B258 — ein Test, der eine entsperrte Sitzung ueber Minuten haelt, misst die
Geschwindigkeit der Maschine mit (2026-09-23).** `display-zone:check` fiel in
`Pacific/Kiritimati` mit `link_device_signing_key_not_unlocked` aus
`claim-ceremony.test.ts`. Allein laufend geht derselbe Fall in derselben Zone
in 10,8 s durch, und der zweite volle Lauf war gruen — also kein Zonenfehler.

Die Ursache ist gemessen und liegt im Produkt, wo sie richtig ist: der Daemon
schliesst eine Sitzung nach fuenf Minuten Leerlauf
(`PICO_VAULT_DAEMON_IDLE_LOCK_CEILING_MS`, `nowMs - lastUsedAtMs`). Der Fall
entsperrt die Wurzel des lebenden Tresors am Anfang, laeuft dann durch eine
ganze Wiederherstellungszeremonie, haelt den Kern an und startet ihn neu — und
greift erst danach wieder zum Signierschluessel. Unter vier Forks reicht das
ueber die fuenf Minuten.

Das Produkt verhaelt sich richtig; die Annahme des Tests ist falsch. Was ein
echtes Geraet tut, steht im Companion: `ensureUnlocked()` vor jedem Aufruf.

**Gebaut am 2026-09-23, in derselben Form.** `startApprover` traegt ein, was es
entsperrt hat; `createRecoveryLinkClient` fragt vorher nach und stellt her, was
fehlt. **Den ganzen Tresor, nicht den einen Schluessel** — der Leerlauf ist je
Sitzung, und welche als naechste gebraucht wird, weiss der Aufrufer nicht. Die
erste Fassung stellte nur den Signierschluessel wieder her und fiel eine Zeile
spaeter in der Wiederherstellungszeremonie um, die Identitaet und
Schluesselvereinbarung braucht.

Belegt statt abgewartet: `daemonClient.lock()` unmittelbar davor stellt den
Leerlauf deterministisch nach. Ohne die Wiederherstellung wirft derselbe Fall
genau `link_device_signing_key_not_unlocked` — die Meldung aus dem Ausfall —,
mit ihr laeuft er durch.

**B257 — die Zeichnung stand im Zeichner, wo sie ihre eigene Regel nicht
erreichen kann (2026-09-23).** Nutzerentscheidung 9 sollte unter einem Modul,
das jetzt etwas anderes will, den Tag der frueheren Zusage zeigen. Der erste
Bau legte `picoDisplayDate` in den Vertrag — `check-constant-copies.mjs` wies
das ab, weil ein Wertimport dort den Modulgraphen des Protokolls in den
Renderer zoege. Der zweite Bau schob den Aufruf in den Zeichner, und
`browser:check` wies auch das ab, aus demselben Grund eine Ebene tiefer: ein
blosser Spezifizierer loest im Browser nicht auf.

Zwei Pruefer, ein Satz — und der stand schon seit dem 2026-08-20 im Baum, in
`rendered-rows.ts`: *das Fenster bekommt gezeichneten Darstellungszustand, und
ein auf einen Kalendertag gekuerzter Instant ist eine Zeichnung.* Fuenf
Zeilenarten wurden dort bereits auf dem Weg hinueber gezeichnet; die sechste
fehlte. Jetzt zeichnet der Hauptprozess auch die Zustimmung, und der rohe
Instant ueberquert die IPC-Naht gar nicht mehr — was das Fenster nicht bekommt,
kann es auch nicht versehentlich zeigen.

Nebenbei faellt damit die letzte offene Frage aus `column:check`:
`pico_module_effect_consent.consented_at` wurde seit jeher geschrieben und von
nichts gelesen. **27 argumentierte Spalten, 0 offene Fragen.**

**B256 — dieselbe Ablehnung erreichte eine Person auf zwei Arten, je
nachdem, ob sie gelesen oder geschrieben hatte (2026-09-23).** Nutzer-
entscheidung 12 verlangte fuer das Dashboard dieselbe volle Satztabelle wie in
der Schale. Beim Verdrahten stellte sich heraus, dass die Flaeche selbst schon
zweigeteilt war: **12 Schreibaufrufe** liefen ueber `describeFailure` und
bekamen einen Satz, **9 Leseaufrufe** ueber `fetchJson` endeten auf
`… endpoint returned HTTP 401.` und warfen den Grund weg, den das Home
mitgeschickt hatte.

Gefunden hat das nicht der Blick, sondern ein Test, der es fuer selbst-
verstaendlich hielt: derselbe Name `no_founding_record`, einmal beim Speichern
und einmal beim Lesen, und nur einer der beiden Wege kannte den Satz dazu.
Wer eine Aufbewahrungsregel *anlegte*, erfuhr, dass dieses Home noch nicht
gegruendet ist; wer dieselbe Liste *ansah*, bekam eine Zahl. Beide Male
antwortete das Home dasselbe.

Beide Pfade haengen jetzt an derselben Tabelle. Der Rueckfall ist selbst ein
Satz, damit ein Name, den noch niemand aufgeschrieben hat, nicht als Name nach
aussen dringt, und `one-voice:check` haelt die Tabelle gegen die der Schale:
**eine geteilte Ablehnung muss in beiden Flaechen denselben Satz haben.** Die
erste Fassung dieser Regel fragte nur, ob beide die Schuld gleich zuweisen —
eine Pflanzung mit zwei verschiedenen Saetzen kam damit durch, und die Regel
verlangt seither Satzgleichheit.

**B255 — die gefaehrlichste Frage dieser Session, und die Antwort war
viermal ja (2026-09-22).** B254 hat die Inhaltshaltung verschoben, und das
warf sofort eine Betriebsfrage auf: eine SQLite-Sicherung bringt die Datenbank,
der Schluesselspeicher liegt daneben. Gemessen, Schritt fuer Schritt:

**Der Domaenenschluessel ist `randomBytes` auf der Platte**, nicht aus der
Identitaetswurzel abgeleitet — keine Recovery Card bringt ihn zurueck.

**`pico_home/config.yaml` schliesst `keys/**` ausdruecklich aus der
Add-on-Sicherung aus.** Eine Sicherung nimmt also genau das nicht mit, was sie
lesbar macht.

Das klingt nach einem Fund und ist keiner. **Vier Stellen sagen es, und zwar
besser als ich es gefunden haette:**

*ADR 0072 R6* macht es zur Regel — *„KEKs must never live in the SQLite
database file and never in the same backup artifact as the ciphertext they
protect. Without R6, crypto-shredding is a false promise."*

*ADR 0072 Punkt 5* nennt die Folge beim Namen: *„Restoring a database backup
without the key store leaves every `domain_encrypted` item permanently
unreadable. **That is the designed behaviour, not a failure mode**."*

*Die Statusmatrix* haelt die Minderung, auf die jener Punkt zeigt, ehrlich als
unfertig: *„the passphrase-protected key export and TPM/keystore anchor remain
future work."* Kein verstecktes Loch.

*Der Betreibervertrag* sagt es dem Menschen, der es im Ernstfall braucht, und
nennt es *„the largest operational hazard in the current design"*.

**Nichts zu beheben.** Das gehoert genauso aufgeschrieben wie ein Defekt: eine
Frage, die nach einem schweren Fund aussah, viermal gemessen und viermal
beantwortet.

**Eine Zeile ist trotzdem faellig geworden, und zwar durch B254 selbst.** Der
Betreibervertrag sagte *welche* Erinnerung unlesbar wird (`domain_encrypted`),
aber nicht **wie viel** das ist — und das hat sich heute geaendert. Vorher
versiegelte nur der HTTP-Weg; was ueber eine Kreuzung behalten wurde, blieb
Klartext und ueberlebte eine schluessellose Wiederherstellung *aus Versehen*.
Jetzt versiegelt jeder Weg. Die Gefahr ist dieselbe; der Anteil an der
Erinnerung eines Menschen, den sie betrifft, ist groesser. Das steht jetzt
dort.

**B254 — die Datei, die Material abweist, das ein Shred nicht erreicht,
schrieb selbst welches (2026-09-22).**

**Zwei Negative zuerst, und das zweite hat mich fast einen Fehlbefund
gekostet.** Der Beobachtungspuffer ist dicht: `privacy_domain TEXT NOT NULL`,
ein einziger Schreiber, eine Spalte — kein zweiter Ort wie bei B253. Und:
dass ein Krypto-Shred unverschluesselten Inhalt **nicht** erreicht, ist kein
Defekt, sondern die entschiedene Lage. ADR 0070/0071 sagen es woertlich —
*„content is plaintext at rest today"*, `domain_encrypted` steht hinter einem
standardmaessig **ausgeschalteten** `PICO_MEMORY_ENCRYPTION` —, und die
Shred-Route weist ohne Krypto-Anbieter ab, mit genau dem richtigen Satz:
*„Content is plaintext at rest, so destroying keys would protect nothing."*
Ich hatte das schon gemessen und haette es fast als Fund geschrieben.

**Der Fund liegt eine Ebene tiefer: die Verweigerung haengt am Store, die
Haltung aber am einzelnen Stueck.** Vier Wege schreiben in den
Erinnerungsspeicher. Einer — der HTTP-Weg in `app.ts` — setzt
`contentPosture: 'domain_encrypted'`, wenn ein Krypto-Anbieter da ist. Zwei
sind Modul-Oberflaechen ohne Aufrufer (offene Entscheidung 14). Der vierte,
`state-crossing.ts`, setzt sie **gar nicht** — und er ist der lebende Weg, auf
dem ein Mensch eine Rueckrufantwort *behaelt*.

Dieselbe Datei weist eine Kreuzung ohne Domaene ab und begruendet es so:

> *the first of ADR 0129's five places, asked at the boundary: a shred […]
> material a shred could not reach. Refusing here is cheaper than discovering
> it during a deletion somebody was relying on.*

Und schreibt danach Material, das ein Shred nicht erreicht.

**Gemessen bei eingeschalteter Verschluesselung**, mit dem echten
Kreuzungsaufruf: die Haltung kam als `plaintext_foundation` heraus, und nach
einem Krypto-Shred derselben Domaene gab die API die behaltene Antwort weiter
heraus. Die Verweigerung an der Route war passiert — der Store *hatte* einen
Schluessel —, und das Stueck lag trotzdem im Klartext.

**Behoben, wo die Antwort bekannt ist.** Dieselbe Bedingung an vier Stellen zu
wiederholen ist die Drift, die dieser Baum immer wieder findet. Jetzt steht sie
einmal, im Store: ohne Anbieter `plaintext_foundation`, mit Anbieter
`domain_encrypted`. Ein neuer Schreibweg kann sie nicht mehr falsch treffen,
weil er sie nicht mehr trifft.

**Was die Aenderung sichtbar gemacht hat.** Zwei Wiederherstellungstests
fielen: sie stellten in einen Store **ohne** Krypto wieder her, waehrend der
Schluesselordner unberuehrt danebenlag. Mit Klartext ging das durch. Beide
fragen, ob Moduldaten und Konnektor-Stuecke die Sicherung des Kerns mitfahren
— nicht, ob sie einen Schluesselverlust ueberleben —, also bekommen sie
denselben Schluesselordner zurueck, den eine echte Wiederherstellung auch
mitbraechte.

**Eine Pflanzung, ein Biss.** Die Haltung faellt wieder auf Klartext zurueck →
der Gang faellt, und zwar an der Stelle, die sagt, was ein Shred bedeutet.

**B253 — der Shred suchte die Domaene an zwei von drei Orten (2026-09-22).**
B252 hat gefragt, ob beide Vergessenswege dieselben Spalten leeren. Sie tun es.
Die Frage darunter war eine andere: `forgetDomainRecalls` **findet** seine
Zeilen ueber ein JSON-Feld — und eine Domaene kann in dieser Zeile an drei
Orten stehen.

```sql
WHERE forgotten_at IS NULL
  AND (json_extract(recall_context_json, '$.privacyDomain') = ?
       OR kept_privacy_domain = ?)
```

Ein Rueckruf nennt sie im `recallContext`. Ein Job, dessen Antwort behalten
wurde, in `kept_privacy_domain`. Ein **Bibliotheks-Lesejob** in keinem von
beiden: `picoLibraryContextRef` legt sie als `privacyDomain` an die Referenz
*im Job selbst*, also nach `job_json`.

**Gemessen mit dem echten Bauer**, nicht mit einem nachgebauten Objekt — denn
*wo* die Domaene landet, ist genau die Frage, und ein Nachbau haette sie
beantwortet statt sie zu stellen:

| | |
|---|---|
| `json_extract(job_json, '$.references[0].privacyDomain')` | `domain-private` |
| vom Shred erreichte Zeilen | **0** |
| Frage der Person steht noch in `job_json` | **ja** |
| Auszug aus dem Depot steht noch darin | **ja** |

Eine Zeile, die den geschredderten Raum ausdruecklich nennt, ueberlebt seinen
Shred. Das ist derselbe Befund wie **B17**, durch eine zweite Tuer: dort war
die Tabelle gar nicht erreicht, hier ist sie erreicht und eine Jobart nicht.
Und ein Shred ist der Akt, bei dem das am meisten wiegt — er zerstoert die
Schluessel einer Domaene, damit ihr Inhalt unlesbar wird, und hier bleibt eine
Kopie derselben Worte im Klartext stehen.

**Der Gang geht ueber `picoModelJobKinds`, nicht ueber eine Liste im Test.**
Eine dritte Jobart soll diesen Test *erweitern* statt an ihm vorbeizugehen —
genau das ist hier passiert, als die zweite dazukam.

**Die Testvorlage war nur stimmig, solange niemand in die Referenzen sah.**
`job()` schrieb `privacyDomain: 'household'` in **jede** Referenz, auch in den
Job, dessen Rueckrufkontext `private` sagte. Mit dem Fix erreichte der Shred
ihn zu Recht, und vier Tests fielen. Die Vorlage nimmt die Domaene jetzt als
Parameter: ein Job mit Haushaltsmaterial, der sich privat nennt, ist keine
Lage, die es gibt.

**Zwei Pflanzungen, beide Richtungen.** Der dritte Ort faellt wieder aus dem
Shred → der Gang faellt. Der Shred greift jede Domaene statt der genannten →
vier Tests fallen, darunter *„laesst die andere unberuehrt"*. Bei einem
Loeschen sind Luecke und Uebergriff zwei Fehler, und beide muessen beissen.

**B252 — drei Tabellen halten Personeninhalt, und das Netz kannte eine
(2026-09-22).** B251 hat `memory_item` Spalte fuer Spalte entschieden.
`domain-shred.ts` sagt selbst, dass ein Shred **drei** Dinge erreichen muss,
und nennt sie: den Erinnerungsspeicher, den Beobachtungspuffer (ADR 0129 SR2)
und die Modelljob-Warteschlange (ADR 0049 mit ADR 0071, seit B17 und einem
externen Review am 2026-09-09).

**Zwei Gestalten, und der Unterschied ist die Sache selbst.**

`clears` — die Zeile bleibt stehen, einzelne Spalten werden geleert. Dann ist
*jede* Spalte eine Entscheidung. Das gilt fuer `memory_item` und fuer
`pico_model_job_queue`, deren `forgetRecall` seit B17 drei Spalten leert: die
Frage, die Antwort und das erinnerte Material. Die uebrigen **fuenfzehn** waren
unentschieden; sie sind es jetzt.

`deletes` — die Zeile verschwindet. Der Beobachtungspuffer wird ganz geloescht,
und der Kommentar sagt warum: fuer Daten, die ihr Fenster nicht ueberleben
sollen, ist Entfernen staerker als Unlesbarmachen, weil nichts uebrigbleibt,
was spaeter entschluesselt werden koennte. Das ist von Bauart vollstaendig und
braucht keine Spaltenliste — gefragt wird nur, ob es wirklich ein `DELETE` ist.
**Ein `UPDATE`, das sich als Loeschen ausgibt, ist genau der Unterschied, um
den es hier geht.**

**Gemessen: 42 Spalten ueber drei Tabellen**, 7 vom Vergessenspfad geleert, 35
begruendet behalten. Geleert heisst dabei auf `NULL` oder auf ein leeres
Literal — `job_json = '{}'` ist ein Leeren, `forgotten_at = ?` ist ein
Schreiben und muss begruendet sein.

⚠ **Sechs Spalten tragen eine offene Frage**, vier aus B251 und zwei neue:
`kept_memory_item_id` und `kept_privacy_domain` sagen, dass eine Antwort
behalten wurde und welche. Der Verweis bleibt, auch wenn die Worte gehen —
dieselbe Lage wie `source_ref`. Das entscheidet ein Mensch; die Frage steht im
Handoff.

**Fuenf Pflanzungen, fuenf Bisse.** Der Vergessenspfad laesst das erinnerte
Material stehen → genannt. Eine neue Spalte in der Warteschlange → nicht
klassifiziert. Der Puffer wird geleert statt geloescht → **zwei** Meldungen,
kein `DELETE` und ein `UPDATE`, wo keines sein darf. Die genannte Methode
verschwindet → der Pfad wurde gegen nichts verglichen.

**Und ein anderes Tor hat mich sofort gefangen.** `column:check` haelt, dass
jede Spalte von irgendeiner Abfrage gelesen wird oder begruendet ist — und
zaehlte die Begruendungsliste meines neuen Pruefers als Abfrage, also meldete
es einen Eintrag zu Unrecht als ueberfluessig. Sein Kopfkommentar hatte das
Argument seit jeher, nur fuer sich selbst: *ein Pruefer, der sich selbst
liest, findet jede Spalte „abgefragt"*. Das gilt fuer **jedes** Tor: ein
Pruefer nennt eine Spalte, um ueber sie zu urteilen, nie um sie zu lesen.
Gemessen, bevor es geaendert wurde — der Ausschluss aller `check-*.mjs` laesst
jedes Urteil dort unveraendert: 437 Spalten, 409 gelesen, 28 begruendet.

Und die erste Pflanzung traf zuerst daneben: derselbe `SET`-Satz steht in
**beiden** Vergessenswegen, und ein Ersetzen ueber die ganze Datei aenderte
auch den, den dieser Pruefer gar nicht liest. Er liest den Text **dieser
Methode** — das war schon in B251 so gebaut, und die Pflanzung musste sich
danach richten.

**B251 — geloescht war der Inhalt, nicht der Ort (2026-09-22).** Ein
Erinnerungsstueck wird geloescht, und seine Zeile bleibt absichtlich stehen:
der Store soll weiterhin sagen koennen, was aus einer Referenz wurde. Geleert
wurde davon genau **eine** Spalte, `content`.

**Gemessen an einem laufenden Store**, nicht gelesen: Stueck anlegen, Ort
setzen, loeschen, in die Zeile und in die Datei sehen.

| | nach dem Loeschen |
|---|---|
| `content` | `NULL`, und die Bytes sind aus der Datei weg |
| `latitude_deg` / `longitude_deg` / `accuracy_m` | **stehen noch da** |
| `picoMemoryItemPlace('mem_x')` | **antwortet mit den Koordinaten** |

Der Ort war also nicht nur in der Datei liegengeblieben — er war ueber die
**oeffentliche API des Produkts** weiter abrufbar. Eine Person loescht, was sie
aufgeschrieben hat, und wo sie war, bleibt.

**Niemand hat etwas falsch gemacht, und das ist der Punkt.** ADR 0129 SR3 hat
die drei Spalten spaeter dazugestellt und in seinem eigenen Satz behauptet,
ein Ort werde *„von den Pfaden regiert, die ein Erinnerungsstueck ohnehin
regieren"*. Zwei der vier Pfade taten es: der Schreiber verlangt
`deletion_state = 'active'`, der raeumliche Abruf auch. Der direkte Leser und
der Loeschpfad nicht. Eine Spalte kam dazu, und der Pfad, der sie haette
kennen muessen, liegt in einer anderen Datei.

**Behoben, und der Byte-Nachweis gehoert dazu.** Die Loeschung nullt jetzt die
drei Spalten, und ein Test sucht die Koordinate als IEEE-754-Doppel in der
Datei — sie ist weg, weil `secure_delete` (B245) sie aus der Seite nimmt. Der
Leser filtert zusaetzlich nach dem Zustand; das ist Tiefenverteidigung, und sie
ist **eigens gegangen**: die erste Pflanzung dagegen blieb gruen, weil die
Loeschung sie zudeckt. Der Test schreibt deshalb direkt eine Zeile, wie sie aus
einer anderswo wiederhergestellten Datenbank kaeme — genau der Fall, den der
Kommentar am Leser selbst nennt.

**Das Netz, das es gefangen haette:** `forget:check`, Kettenschritt **73**.
Jede der 24 Spalten von `memory_item` ist entweder beim Loeschen geleert (4)
oder ausdruecklich als behalten begruendet (20). Eine **neue** Spalte zwingt zu
einer Entscheidung, statt stillschweigend zu bleiben. Gelesen wird der Text
*dieser Methode*, nicht der Datei: eine andere Methode, die dieselbe Spalte
nullt, beweist nichts ueber diesen Pfad, und `WHERE latitude_deg IS NOT NULL`
ist kein Leeren.

⚠ **Vier Spalten tragen eine offene Frage, keine Entscheidung** —
`source_ref`, `due_at`, `raised_at`, `announced_at`. Eine Herkunftsreferenz
kann verraten, was jemand gelesen hat; ein Faelligkeitszeitpunkt ist ein
Zeitpunkt, den eine Person gesetzt hat. Sie bleiben heute, und ob das richtig
ist, entscheidet ein Mensch. Die Frage steht im Handoff.

**Sechs Pflanzungen, sechs Bisse.** Loeschung nullt den Ort nicht mehr → zwei
Tests. `secure_delete` weg → der Byte-Nachweis. Der Leserfilter weg → erst
nach dem eigenen Test dafuer. Eine neue Spalte → nicht klassifiziert. Eine
Spalte geleert *und* als behalten begruendet → beides kann nicht stimmen. Eine
Begruendung fuer eine Spalte, die es nicht gibt → beschreibt nichts.

Und der Leser des Tors hat mich zuerst belogen: sein Tabellenende verlangte
eine eigene Zeile fuer `);`, `memory_item` endet aber mit
`accuracy_m REAL NULL);` — er lief in die naechste Tabelle und meldete deren
sechs Spalten als unklassifiziert.

**B250 — eine Entscheidung, die nicht mehr gilt, hat trotzdem eine Datei
(2026-09-21).** Dritte Begruendungsmenge nach B248 und B249. `citations:check`
haelt seit B223, dass jede zitierte ADR-Nummer ein Dokument hat und jedes
genannte Etikett darin vorkommt. Eine **abgeloeste** Entscheidung hat beides.

**Ein Negativ vorweg, und es kostete Zeit.** Ich habe zuerst die ADRs selbst
nach einem Zustand durchsucht: es gibt keinen. Der `## Status`-Abschnitt ist
freie Prosa mit datierten Notizen, aus der sich nichts ableiten laesst. Der
einzige maschinenlesbare Zustand ueber eine Entscheidung steht in der
**Statusmatrix** — und dort stehen vier Zeilen auf `superseded`: 0043, 0044,
0063, 0065.

**Zwei Saetze, beide heute wahr, beide von nichts gehalten.**

*Keine der vier wird von einer Quelle zitiert.* Ein Zitat in Produktcode liest
sich als aktuell: „ADR 0063" neben einer Zeile hiesse, diese Zeile folge einer
Regel, die seit dem 2026-08-08 nicht mehr gilt — und bei dieser einen zeigt die
alte Kernregel sogar *in die andere Richtung*, sie wuerde die Huelle
zurueckweisen, die das Produkt heute verschickt. **Dokumente sind ausgenommen**,
und das ist keine Bequemlichkeit: dieses Repository schreibt seine Historie
absichtlich in die Prosa, und die Konformitaetsfixtures *muessen* sagen, was
sie einmal waren. Dieselbe Trennung, die `docs:check` fuer entfernte
Link-Operationen schon macht.

*Jede der vier nennt einen Nachfolger, der existiert und selbst nicht abgeloest
ist.* Eine Abloesung ohne Nachfolger waere eine Entscheidung, die aufgehoert
hat zu gelten, ohne dass etwas an ihre Stelle trat — ein Loch, keine Abloesung,
und ein Leser haette nirgendwohin zu gehen.

**Der Pruefer nennt die vier Nummern nicht.** Er faengt zuerst seinen eigenen
Kommentar, weil die Regel fuer jede Quelle gilt und er eine ist. Ich haette ihn
als Ausnahme eintragen koennen; stattdessen stehen die Nummern jetzt hier, wo
Historie hingehoert. Eine Regel mit einer Ausnahme fuer sich selbst ist
schwaecher als eine ohne.

**Vier Pflanzungen, vier Bisse.** Produktcode zitiert eine abgeloeste
Entscheidung → genannt, samt Nachfolger. Eine Abloesung verliert ihren
Nachfolgersatz → genannt. Der Nachfolger wird selbst abgeloest → die Kette
endet nicht bei etwas, das gilt. Der Nachfolger hat gar keine Zeile → genannt.

**B249 — vierundzwanzig Routen sind begruendet, und die Begruendungen waren
Erinnerungen (2026-09-21).** Fortsetzung von B248 auf die zweite grosse
Begruendungsmenge. 62 Foundation-Routen, 38 mit Aufrufer, **24 argumentiert
ohne einen** — in 17 Eintraegen, weil einige ganze Praefixe decken.

**Jeder Satz behauptet etwas Nachrechenbares.** Acht nennen eine **Tuer in
Gebrauch**: eine Link-Operation, die diese Route ersetzt —
`home.depot.attach`, `home.claim.submit`, `home.model.read.keep`,
`home.model.providers.read`, `home.time_bound_entry.acknowledge`,
`home.domain.read-grant.submit` und die beiden Modellanbieter-Entscheidungen.
Vier nennen einen **Nachbarn**, der bedient wird: `/api/events/tail`, die
Raumliste, die Aufbewahrungsliste, `DELETE /api/auth/sessions`. Drei
behaupten eine **Abwesenheit** — fuer diese Familie gebe es ueberhaupt keine
Tuer.

**Alles stimmt heute**, und das ist wieder das Negativ: alle acht Tueren sind
im Protokoll erklaert, alle vier Nachbarn werden bedient, keine der drei
Abwesenheiten ist inzwischen eine Anwesenheit.

**Der Fund ist die Richtung, in der jeder dieser Saetze bricht.** Verschwindet
eine genannte Tuer, ist die Route nicht mehr *ersetzt*, sondern *verwaist* —
und das Tor bliebe gruen, weil sie auf der Liste steht. Die
Abwesenheitsbehauptungen sind dabei die leisesten: sie brechen, wenn jemand
etwas **hinzufuegt**, und niemand, der eine Link-Operation ergaenzt, denkt an
eine Routenliste.

**Und dieselbe blinde Stelle wie B242.** `docs:check` prueft seit jeher, dass
ein genannter Operationsname im Protokoll steht — aber nur in **Markdown**.
Diese Liste ist ein Skript und lag ausserhalb des Korpus. Derselbe Name wird
in einem Dokument geprueft und in einem Pruefer nicht.

Jeder Eintrag traegt jetzt die eine Bedingung, auf der sein Satz ruht, und das
Flaechentor rechnet sie nach. **Zwei** tragen keine maschinelle — der
Foundation-Transport der Aufzeichnungen, dessen Satz den Weg des Fensters
ueber eine Autoritaetsressource nennt, ohne zu sagen welche (und dieser
Pruefer raet nicht), und `GET /api/auth/session`, wo die Abwesenheit eines
Aufrufers selbst die Behauptung ist. Beide sagen das ausdruecklich, statt es
zu verschweigen; ein neuer Eintrag ganz ohne Bedingung wird abgewiesen.

**Vier Pflanzungen, vier Bisse.** `home.depot.attach` aus dem Protokoll
genommen → die Tuer in Gebrauch gibt es nicht. Der genannte Nachbar
umbenannt → wird nicht bedient. Eine erfundene Umschlag-Operation
**hinzugefuegt** → die behauptete Abwesenheit ist keine mehr (ihr Name steht
hier ohne Backticks, weil `docs:check` ihn sonst zu Recht als Tuer liest, die
jemand suchen geht — dieselbe Selbstprobe wie bei B243). Ein Eintrag ohne Bedingung →
abgewiesen.

**B248 — eine Begruendung ist ein Satz, und ein Satz driftet (2026-09-21).**
Fortsetzung von B247, eine Ebene breiter. Acht Konstanten stehen in diesem
Baum zweimal, jede mit einem Grund daneben. Die Gruende sind Prosa — gelesen
von Menschen, gehalten von niemandem.

**Einer stand falsch da.** Der Grund fuer `picoCompanionConditionKinds` sagte,
`contract.ts` halte *genau einen* Import, und der sei typ-only. Gemessen:
**vier** Imports. Alle vier sind `import type`, die tragende Haelfte stimmt
also — aber die Zahl war seit irgendwann falsch, und ein falscher Satz in
einer Begruendung ist so viel wert wie gar keiner. Er ist jetzt das, was
wirklich gilt: *jeder* Import dieser Datei ist typ-only.

**Die anderen sieben stimmen**, und das ist das Negativ dieses Befunds: das
Dashboard importiert aus `@pico/protocol` nur typ-only (zwei Stellen, beide
`import type`, also nicht emittiert und im Browser nie aufgeloest); Push-Praeger
und Push-Ehrer importieren einander nicht; beide Token-Dateien tragen die Marke
ihres Erzeugers, und der Erzeuger nennt beide.

**Der Fund ist, dass keiner der acht Saetze geprueft wurde.** Jeder von ihnen
behauptet etwas ueber den Baum, das sich nachrechnen laesst — und keiner wurde
nachgerechnet. Neben jedem Grund steht jetzt die **eine Bedingung, die ihn
traegt**, in einer Form, die das Tor selbst pruefen kann. Die Prosa bleibt
fuer einen Menschen; die Bedingung ist fuer die Kette. Ein neuer Eintrag ohne
Bedingung wird abgewiesen.

**Drei Gestalten reichen fuer alle acht.** `typeOnlyBareImports`: aus einem
fremden Paket darf nur typ-only importiert werden — das ist die Eigenschaft,
die `contract.ts` rendererseitig und `apps/web` als blanke ES-Module
auslieferbar haelt, denn ein Typimport wird nicht emittiert.
`noMutualImport`: die beiden Seiten duerfen einander nicht importieren.
`generatedBoth`: beide Dateien tragen die Marke ihres Erzeugers, und der
Erzeuger nennt beide Pfade — dann stimmt „kein Mensch tippt sie".

**Fuenf Pflanzungen, fuenf Bisse.** Ein Wertimport in `contract.ts` → genannt.
Ein Wertimport im Dashboard → genannt. Die Push-Seiten importieren einander →
genannt. Eine Token-Datei verliert ihre Erzeugermarke → genannt. Ein Eintrag
ohne Bedingung → abgewiesen.

**B247 — eine Regel, die ihre eigene Praemisse nicht prueft (2026-09-21).**
`narrowToOwner` steht zweimal, in `apps/core` und in `apps/relay`, und das ist
begruendet: `check-constant-copies.mjs` fuehrt das Paar und haelt beide
Fassungen Zeichen fuer Zeichen aneinander. Die Fehlermeldung nennt auch das
Argument dahinter:

> Eine Fassung ist geprueft und die andere nicht; solange sie gleich sind,
> gilt der Beweis fuer beide.

Das ist zwei Aussagen. Geprueft wurde davon nur die zweite.

**Die erste stimmt heute.** `apps/core/src/database-file-mode.test.ts` ruft
`narrowToOwner` in drei Faellen: es haelt Datenbank und Begleitdateien beim
Eigentuemer, es verengt nur und weitet nie, und es nimmt jedem anderen das
Lesen. Ein Export, drei Faelle, alle gegangen. Wieder ein Negativ am Bestand.

**Aber das Tor haelt die beiden Dateien nur gegeneinander.** Verschwaende der
Test — geloescht, umbenannt, oder nur noch importierend statt rufend —, blieben
zwei identische Kopien **ungepruefeten** Codes, und dieser Schritt bliebe
gruen, weil beide Kopien ja weiterhin gleich sind. Das Argument waere dann
falsch, und es stuende weiterhin in der Fehlermeldung eines gruenen Tors. Ein
Pruefer ohne Gegenstand (B166), mit einem Argument davor.

Gefragt wird jetzt beides: dass die Fassungen gleich sind, **und** dass jeder
Export der bewiesenen Fassung von einem Test daneben wirklich **gerufen**
wird. Ein Import allein genuegt nicht — ein Modul zu importieren beweist
nichts ueber seine Funktionen, und genau diese Spielart war der leiseste der
vier Faelle.

**Vier Pflanzungen, und die erste hat wieder Regel 22 vorgefuehrt.** Den Test
nur von der Platte genommen → *nichts*, denn `git ls-files` nennt ihn
weiterhin, und der Leser stuerzte beim Lesen ab statt zu melden. Aus dem Index
genommen → genannt. Der Absturz ist jetzt eine Meldung: ein Indexeintrag ohne
Datei ist ein fehlender Beweis, und das gehoert gesagt statt als Stapelabzug
ausgeworfen. Danach: Test ruft nicht mehr, nur noch importieren → genannt. Ein
zweiter Export, den niemand ruft → genannt. Die Spiegelung driftet
(`0o600` gegen `0o640`) → die alte Regel greift weiter.

**B246 — dasselbe nochmal, eine Schicht tiefer: die Rechte jeder Datei, die
dieses Produkt anlegt (2026-09-21).** Direkte Fortsetzung von B245, und sie
hat einen aelteren Beweis hinter sich. B117 hat am 2026-09-10 *gemessen*, was
ein Home gegen ein bestehendes Datenverzeichnis zuruecklaesst:

```
755 data
644 data/pico.sqlite
644 data/pico.sqlite-wal
700 data/home-host-keys
600 data/home-host-keys/home_host_signing.key.json
```

Die Schluessel sorgfaeltig, die Datenbank, fuer die es sie gibt, fuer jeden auf
der Maschine lesbar. Und bei *nicht* vorhandenem Verzeichnis kam `700` heraus —
aber nur, weil ein `mkdirSync(..., { mode: 0o700 })` fuer den Key-Store das
Elternverzeichnis zufaellig mit anlegte. Ein Schutz, der aus Versehen haelt,
haelt bis jemand anders installiert.

**Der Bestand ist heute lueckenlos**, und das ist wieder das Negativ vorweg:
**31** Anlagestellen, 20 Verzeichnisse `0o700` und 11 Dateien `0o600`; drei
Schreibvorgaenge gehen in einen Deskriptor, den sein eigenes `openSync` schon
verengt hat; dreizehn `openSync` koennen mit ihren Flags gar nichts anlegen.
Kein einziger offener Fall.

Gehalten hat es niemand. Der **naechste** Ort, an dem dieses Produkt eine Datei
anlegt, bekommt seine Rechte von der umask des Dienstes — und niemand merkt es,
weil keine API danach fragt. `mode:check`, Kettenschritt **72**.

**Meine erste Messung war falsch, und zwar auf die inzwischen vertraute Art.**
Sie suchte nach `mode:` und meldete neun Stellen ohne Modus — darunter drei in
`packages/sync`, die den Modus als **dritten positionellen Parameter** an
`openSync` uebergeben, und sechs `fsync`-Helfer im Companion, die mit
`'r' | 'r+'` ueberhaupt nichts anlegen. Alle neun waren in Ordnung. Ein Leser,
der eine Gestalt kennt, findet die anderen nicht (B188, zum vierten Mal in
dieser Session).

**Und eine Pflanzung hat den fertigen Leser nochmal korrigiert.** Ich loese
einen Flag-Bezeichner ueber die Parameterannotation der umgebenden Funktion
auf und fragte dann, ob deren *Text* ein `w`, `a` oder `x` enthaelt. Die
Pflanzung setzte `flags: string` — und „string" enthaelt keines dieser
Zeichen, also galt der Aufruf als reiner Leser und kam durch. Gefragt wird
jetzt nach der **Gestalt** der Annotation: nur eine Vereinigung von
Zeichenkettenliteralen sagt etwas, alles andere ist unentscheidbar und wird
gemeldet.

**Fuenf Pflanzungen, fuenf Bisse.** Key-Store ohne Modus → genannt. Ein
Verzeichnis `0o755` → genannt. Der dritte positionelle Modus faellt aus
`openSync` → genannt. Ein `fsync`-Helfer bekommt `'w'` in die Annotation →
genannt. Die Annotation wird `string` → gemeldet als unentscheidbar (erst in
der zweiten Fassung).

**B245 — ein Beweis von damals gilt nicht fuer eine Datei von morgen
(2026-09-21).** `secure_delete = ON` steht in beiden schreibenden Stores, und
es steht dort, weil es **gemessen** wurde: sechzig Eintraege mit einem
eindeutigen Satz, alle geloescht, der Store geschlossen — und der Satz stand
**einundsechzigmal** noch in der Datei. Nur ein `VACUUM` bekam ihn heraus, und
keiner laeuft hier je. Das ist der Unterschied zwischen „geloescht" und „nicht
mehr aufgelistet", an den Erinnerungen einer Person.

Gehalten hat das niemand.

**Vier Negative auf dem Weg dorthin**, und sie sagen etwas Gutes ueber diesen
Baum. Die Kapazitaet eines Postfachs zaehlt nur *lebende* Pakete
(`prunePicoLinkQueue` laeuft vor der Entscheidung), also kann ein Fach nicht
mit Abgelaufenem verstopfen. Eine Untergrenze fuer die Paketlebensdauer waere
sogar falsch: sie wuerde ein echtes Paket abweisen, das kurz vor einer
Viertelstundengrenze losgeschickt wurde. `sqlite-backup.ts` oeffnet zweimal
`readonly` und sichert ueber die Backup-API, die nur lebende Seiten kopiert —
geloeschte Bytes reisen dort nicht mit. Und das Relay setzt `foreign_keys`
nicht, was richtig ist: sein Schema kennt kein `REFERENCES`, und ein Pragma
ohne Gegenstand ist ein Pruefer ohne Gegenstand (B166) — der Home-Store sagt
das in seinem eigenen Kommentar.

**Der Fund ist also nicht, dass etwas falsch steht, sondern dass ein bewiesenes
Ergebnis von nichts getragen wird.** Ein dritter Store, oder eine Umstellung im
Konstruktor, und der Beweis von damals gilt fuer die neue Datei nicht — ohne
dass ein Test faellt, denn keine API sagt, ob ein geloeschtes Byte noch
dasteht. Genau die Art Eigenschaft, die ein Tor braucht: wahr, wichtig und von
innen unsichtbar.

`pragma:check`, Kettenschritt **71**. Drei Pragmas, jedes mit eigenem Grund:
`secure_delete` ist die Aussage oben; `journal_mode = WAL` ist die
Haltbarkeitsseite; `foreign_keys` wird **nur dort verlangt, wo ein Schema
ueberhaupt ein `REFERENCES` erklaert**.

**Die Reihenfolge ist Teil der Regel**, und das ist der Teil, den ein Blick auf
die Datei nicht sieht: ein Pragma wirkt ab dem Moment, in dem es gesetzt wird.
Stuende `secure_delete` hinter den Migrationen, waeren deren Loeschungen nicht
gedeckt. Gelesen wird deshalb die **Anweisungsreihenfolge im Block**, nicht die
Zeilennummer in der Datei.

**Fuenf Pflanzungen, fuenf Bisse — und die dritte hat mich korrigiert.** Pragma
weg → genannt. `journal_mode = DELETE` → genannt. Pragma in eine andere Methode
verschoben → genannt, aber als *fehlend*: die Reihenfolgenregel war damit gar
nicht gegangen. Erst die Pflanzung, die es *im Konstruktor* hinter das Schema
schiebt, trifft sie: „sets `secure_delete` after `this.db.exec` on line 102".
Ein dritter Store ohne alles → zwei Meldungen.

**B244 — das Paket war nach oben begrenzt und nach unten gar nicht
(2026-09-21).** Das Relay speichert vier Dinge ueber eine Nachricht: Postfach,
Tag, Ablauf, Nutzinhalt. Ueber die letzte Spalte steht in seinem eigenen
Schema:

> The payload is ciphertext this relay has no key for and no reason to have
> one.

Das ist eine Aussage ueber den **Inhalt**. Was an der Tuer geprueft wurde, war
die **Kodierung**: Base64, nicht leer, Laenge durch vier, und eine Obergrenze
von 64 KiB. Vier Zeichen Base64 sind drei Byte, und drei Byte sind keine
versiegelte Huelle. Der Satz im Schema hatte an der Tuer niemanden, der ihn
haelt.

**Drei Negative vorher.** Das Relay-Schema selbst ist sauber — es traegt keine
Identitaet, und dass die Adressen nicht versiegelt sind, ist seit B120
ausdruecklich so entschieden. `relay:check` haelt, dass das Relay keinen
Pico-Store erreicht und keine Identitaet nennt. `authority:check` haelt zwoelf
Autoritaetsressourcen. Da war nichts.

**Die Grenze ist ableitbar, nicht geschaetzt.** ADR 0107 versiegelt mit
`crypto_box_seal`: 32 Byte fluechtiger oeffentlicher Schluessel und 16 Byte
Authentifizierungsmerkmal liegen vor dem Chiffrat, zusammen **48**. Eine
Huelle mit auch nur einem Byte Klartext misst also mindestens **49**. Ueber
den *Inhalt* der Huelle weiss diese Schicht nichts und soll nichts wissen —
aber die *Konstruktion* hat einen Boden, und der ist nachrechenbar. Was
beweisbar keine Huelle ist, gehoert an der Tuer abgewiesen statt im Fach eines
Menschen abgelegt.

`@pico/protocol` haengt nicht an libsodium, also nennt es die Zahl und ein
Test dort, wo libsodium liegt, bindet sie — und zwar nicht an eine zweite
Zahl, sondern an die Versiegelung selbst: was `crypto_box_seal` aus null Byte
macht, *ist* der Aufschlag.

**Die Reichweite war die eigentliche Ueberraschung, und ich habe sie zuerst
falsch gemessen.** Der erste Lauf meldete 14 Faelle in zwei Dateien. Er lief
gegen einen **alten Build** von `@pico/protocol`: die Geschwisterpakete ziehen
`dist`, nicht die Quelle, also sah nur das Protokollpaket selbst die neue
Grenze. Nach `pnpm --filter @pico/protocol build` kamen 21 weitere Faelle
dazu. Zusammen **neun Testdateien in vier Paketen** — und **null
Produktstellen**.

Das ist der Befund hinter dem Befund: das Produkt baut immer eine echte
Huelle. Nur die Fixtures taten so, als gaebe es ein Paket mit
`payload: 'AAAA'` — drei Byte. Fuenfunddreissig Faelle sprachen ueber ein
Paket, das dieses Produkt nie bauen kann. Keiner von ihnen war dadurch
falsch, aber alle waren ungenauer als noetig. Die Fixtures rechnen den
kleinsten moeglichen Nutzinhalt jetzt aus der Konstante, statt ihn zu tippen.

**Und die Lehre ueber das Messen selbst:** wer die Reichweite einer Aenderung
paketuebergreifend misst, misst gegen `dist`. Ohne Bau des geaenderten Pakets
ist die Zahl zu klein — dieselbe Blindheit wie ein Tor, das `git ls-files`
liest, bevor die Datei gestaged ist.

**Warum das kein Vertragsbruch ist.** Die Regel weist nur zurueck, was das
Protokoll nie erzeugen konnte, wie schon bei B240. Und `store.ts` haelt selbst
fest, dass **nie ein Relay veroeffentlicht wurde** — es gibt keinen
Gegenueber, der etwas anderes schickt.

**Drei Pflanzungen, drei Bisse.** Die Untergrenze faellt weg → der Grenztest
faellt. Der Aufschlag wird als 47 genannt → die Bindung an libsodium faellt,
beide Faelle. Die Untergrenze um eins zu niedrig → *beide* Netze fallen, weil
48 Byte eine Huelle ohne Klartext waeren.

**B243 — derselbe fehlende Bindestrich, drei Jahre spaeter im dritten Leser
(2026-09-21).** Aufgefallen an zwei Zahlen, die nebeneinander stehen:
`progress.md` nennt **55** Pico-Link-Operationen, `docs:check` meldete **57**
verschiedene Namen in Dokumenten, davon 3 als abwesend begruendet — also 54.
Eine Operation, die das Protokoll erklaert, nannte kein Dokument.

Sie wird genannt, in dreien sogar. Der Pruefer konnte sie nur nicht lesen:

```js
/`(home(?:\.[a-z][a-z0-9_]*){2,})`/gu
```

Keine Bindestriche. Genau eine der 55 traegt einen —
`home.domain.read-grant.submit`.

**Das ist Befund B13, wortgleich.** Am 2026-08-24 stand dort
`[a-z][a-z0-9_.]*`, ebenfalls ohne Bindestrich, in
`check-link-reachability.mjs`; zwei Pruefer zaehlten dieselbe Liste und kamen
auf 45 und 46. Behoben wurde damals nicht der Bindestrich, sondern dass die
Liste zweimal gelesen wird: `scripts/link-operations.mjs` liest sie einmal.
Das war richtig — und es hat die andere Seite nicht erreicht. Die **Leseseite**
wurde geteilt, die **Prosaseite** blieb jedem Pruefer selbst ueberlassen, und
`check-docs-structure.mjs`, spaeter geschrieben, hat denselben Fehler neu
gemacht.

**Was dadurch nicht galt.** Die Regel dort lautet: nennt ein Dokument eine
Operation, die das Protokoll nicht hat, ist das ein Fehler, denn ein Dokument
wird als aktueller Stand gelesen. Mit der engen Zeichenklasse galt sie fuer
keinen Namen mit Bindestrich — weder fuer den echten noch fuer einen
Tippfehler darin.

**Die Gegenprobe.** Ein Dokument nennt eine Operation, die es nicht gibt —
derselbe Name wie oben, mit vertauschten Buchstaben in „grant". Alte Regex:
*passed*. Neue: *failed*. (Er steht hier ohne Backticks, weil das Tor ihn
sonst zu Recht als Tuer liest, die jemand suchen geht — die Regel, um die es
geht, greift also auch in diesem Absatz.)

**Die Lehre von B13, eine Ebene weiter genommen.** Ein Muster steht jetzt
neben der Liste, in `link-operations.mjs`, und `readPicoLinkDirectOperations`
**haelt jeden erklaerten Namen dagegen** und wirft, bevor irgendein Pruefer
mit einer Menge weiterarbeitet, die kleiner ist als die Wahrheit. Ein Leser,
der seine eigene Liste nicht buchstabieren kann, ist kaputt — und das laesst
sich fragen, statt es zu glauben. Ein vierter Leser kann den Fehler nicht mehr
neu machen, ohne dass es beim ersten Lauf auffaellt.

**Die Zahlen treffen sich.** 262 → **265** Erwaehnungen, 57 → **58**
verschiedene Namen, davon 3 begruendet abwesend: **55**. Genau die Zahl, die
das Protokoll erklaert und `progress.md` nennt. Zwei Zaehlungen derselben
Sache, die sich vorher um eins widersprachen, sind jetzt dieselbe Zahl — und
das war die ganze Warnung, vier Zeilen auseinander auf demselben Bildschirm,
genau wie bei B13.

**Zwei Pflanzungen, zwei Bisse.** Der Bindestrich faellt wieder aus dem Muster
→ der geteilte Leser wirft, und zwar in *jedem* Pruefer, der ihn benutzt. Ein
Dokument nennt eine erfundene Operation mit Bindestrich → das Dokumenttor
nennt sie.

**B242 — der Pruefer der Testdisziplin hat sich die Endung ausgedacht, und
vier Dateien fielen hindurch (2026-09-21).** Aufgefallen beim Nachfuehren von
B241: `tests:check` meldete **267** Testdateien, der Lauf fuhr **271**. Zwei
Zahlen fuer dasselbe Wort, und die vom Tor war die kleinere.

Die vier sind `apps/companion-shell/scripts/*.test.mjs` — Chromium-Sandbox,
Erreichbarkeit, Tray-Speicherbudget, Workspace-Abschluss. Vitest laeuft hier
ohne eigene Konfiguration und nimmt darum sein Standardmuster
`**/*.{test,spec}.?(c|m)[jt]s?(x)`. Der Pruefer stand auf
`path.endsWith('.test.ts')` — eine Endung, die er sich ausgedacht hat.

**Was dadurch nicht galt.** Fuer diese vier prueft niemand, ob ein `.only`
eingecheckt ist, ob ein Fall ueberhaupt etwas behauptet, ob ein `expect` einen
Matcher traegt, oder ob ein angelegtes Temp-Verzeichnis wieder verschwindet.
Das erste davon ist das schlimmste: ein `.only` legt **jeden anderen Fall
derselben Datei** still, und der Bericht bleibt gruen.

**Gemessen, nicht vermutet.** Alle vier sind heute sauber: 43 Faelle, 67
`expect`, kein `.only`, kein Temp-Verzeichnis. Der Defekt war der blinde
Fleck, nicht sein Inhalt.

**Die Gegenprobe ist der eigentliche Beweis.** Mit der alten Fassung und einem
gepflanzten `.only` in einer der vier: *Test-substance check passed (267 test
files)*. Mit der neuen Fassung, dieselbe Pflanzung: *failed*. Das Tor war
gruen, waehrend in einer Datei, die der Lauf ausfuehrt, jeder andere Fall
stillgelegt war.

**Die Wurzel ist dieselbe wie ueberall hier: abgeleitet statt abgeschrieben.**
Jetzt steht das Muster des Laeufers im Pruefer, nicht eine Endung — 271 gegen
271. Aber das ist wieder eine Abschrift, und eine Abschrift darf nicht still
veralten. Also nennt der Pruefer die Annahme, auf der sie steht, und schlaegt
an, wenn sie faellt: setzte irgendeine `vitest.config.*` oder
`vitest.workspace.*` ein eigenes `include`, waere das Muster falsch, und genau
dieser Befund wuerde sich wiederholen. Der Korrekturpunkt liegt jetzt eine
Ebene hoeher (ADR 0133).

**Und die Helfererkennung ist mitgezogen.** Sie lief ueber `*.ts`; ein
behauptender Helfer in einer `.test.mjs` waere unbekannt gewesen, und die
Faelle, die ihn rufen, haetten als behauptungslos gegolten — ein *falscher*
Alarm statt eines stillen Lochs, aber aus demselben Grund.

**Vier Pflanzungen, vier Bisse, alle in einer `.mjs`:** eingechecktes `.only`,
ein Fall ohne Behauptung, ein Temp-Verzeichnis ohne Aufraeumen, und ein
`include` in einer Laeufer-Konfiguration.

**Was die Zahlen angeht:** 267 → **271** Dateien, 3.005 → **3.049** Faelle,
9.390 → **9.457** Erwartungsausdruecke. Nichts davon ist neu geschrieben
worden; es war die ganze Zeit da und wurde nicht gezaehlt.

**B241 — die Grenze vor 67 Tueren ist nie gegangen worden, und sie hat es
selbst dazugesagt (2026-09-21).** Die IPC-Kanaele der Schale sind gut
gehalten: 68, auf beiden Seiten gleich benannt, 68 vom Hauptprozess
beantwortet, 68 vom Fenster gerufen. Da war nichts zu holen.

Der Fund stand im Kopfkommentar des Tors, das sie haelt:

> **Was diese Regel nicht kann.** `main.ts` wird von keinem Test ausgefuehrt
> […] Diese Pruefung haelt deshalb fest, dass die Zeile *dasteht*, nicht dass
> sie laeuft. Das ist weniger, als ein Gang waere, und es steht hier, statt
> dass jemand es fuer einen Gang haelt.

Das ist die ehrliche Bauart dieses Projekts — und es ist eine offene Rechnung.
`assertRendererSender` ist die Grenze aus ADR 0113 C2: sie entscheidet, ob ein
IPC-Aufruf vom eigenen Fenster kommt. Sie steht vor **67**
`ipcMain`-Registrierungen. Kein Test hat sie je ausgefuehrt. Eine
Sicherheitsgrenze, die niemand geht, ist eine Behauptung.

**Ein Negativ vorweg, und es ist ein gutes.** Ueber den Syntaxbaum gezaehlt:
67 Registrierungen, **67** rufen die Pruefung, und zwar als *erste* Anweisung.
Keine offene Tuer. Aber auch das hielt nichts fest — die 68. haette sie
vergessen duerfen, und eine einzige ungeschuetzte Registrierung ist die ganze
Grenze.

**Jetzt hat sie einen Gegenstand.** Die Entscheidung steht in
`renderer-sender.ts` statt in `main.ts`, das kein Test ausfuehren kann (es
zieht Electron beim Import). Kein Electron darin, also kann ein Test ihr acht
fremde Absender hinhalten: ein fremder Frame in unserem Fenster, unsere Adresse
aus fremden WebContents, beides fremd, gar kein Frame, ein abgeraeumter Frame,
ein Frame ohne Adresse, gar kein Absender, und eine Adresse, die unsere nur
praefixiert. Beide Haelften einzeln, weil jede allein erreichbar ist: ein
zweiter Frame teilt die WebContents, und ein anderes Fenster laesst sich auf
dieselbe Datei-URL richten.

**Eine fail-open Form, nicht erreichbar, trotzdem falsch.** Verglichen wurde
gegen `window?.webContents` — ohne Fenster also gegen `undefined`, und ein
Ereignis ohne `sender` haette das getroffen. Electron setzt die Eigenschaft
immer, es war also keine Tuer, durch die jemand gehen konnte. Aber sie war
durch den *Besucher* zu und nicht durch das Schloss, und das ist bei einer
Grenze der falsche Grund. Ohne Fenster wird jetzt ausdruecklich niemand
beantwortet.

**Was ein Gang nicht sehen kann, prueft das Tor weiter** — und praeziser als
vorher. Die Spurzeile muss die Anweisung *unmittelbar vor* dem Wurf sein.
Meine erste Fassung verglich Zeichenpositionen, und die Pflanzung ging
hindurch: ein `trace(...)` in einem toten Zweig steht auch „vorher". Der
Syntaxbaum fragt jetzt nach der Reihenfolge im Block. Dieselbe Lehre wie
B188, zum dritten Mal in dieser Session.

Dazu neu: **jede** `ipcMain`-Registrierung muss die Pruefung als erste
Anweisung rufen. Auch das ueber den Baum, denn ein Handler, der erst nach
einer Bedingung prueft, hat schon gehandelt, und ein Muster ueber die naechste
Zeile saehe keinen Unterschied.

**Fuenf Pflanzungen, fuenf Bisse.** Nur noch die Adresse pruefen → Gang faellt.
Die Spur traegt die Adresse des Absenders → Gang *und* Tor fallen. Spur in
einen toten Zweig → Tor faellt (erst in der zweiten Fassung). Eine 68. Tuer
ohne Grenze → Tor nennt sie. Die Grenze eine Bedingung nach hinten geschoben →
Tor nennt den Kanal.

**B240 — die Woerter sind in den Kern gezogen, der Verstand darueber blieb
zurueck (2026-09-21).** `conditions` ist das fuenfte Feld eines
Darstellungszustands, und laut Vertrag unabhaengig von `kind`: mehrere duerfen
zugleich gelten. Fuenf Bedingungen gibt es — `no_network`, `home_unreachable`,
`no_model`, `storage_reserved`, `storage_exhausted`.

**Zwei Negative zuerst.** Die Namen stehen an zwei Stellen — im shell-freien
Kern (`apps/companion/src/conditions.ts`) und nochmal im Vertrag, weil der im
Renderer laedt, wo ein blosser Specifier nicht aufloest. Das ist keine Drift,
sondern die ausdrueckliche Anordnung dieses Projekts: die Kopie ist durch
`condition-vocabulary.test.ts` an die Quelle gebunden, sogar in der
Reihenfolge. Und der Zeichner verzweigt nicht nach Bedingung — jede bekommt
dieselbe Zeile, Etikett und Abhilfe kommen fertig gerendert an (ADR 0113 C2).
Beides war in Ordnung.

**Der Fund liegt bei der Regel, die *nicht* mitgezogen ist.** Der Erzeuger
schliesst zwei Kombinationen aus:

```ts
if (input.homeReachable === false && input.online !== false) { ... }
...
if (input.storage === 'reserved') { ... } else if (input.storage === 'exhausted') { ... }
```

Beide mit demselben Argument, und sein Kommentar sagt es fuer die erste
woertlich: ohne Netz ist das unerreichbare Home *„the same fact told twice"*,
und eine Absage darf keine Inventur sein (ADR 0077 C4). Der Vertrag aber wies
nur **eine** der beiden ab:

```ts
if (seen.has('storage_reserved') && seen.has('storage_exhausted')) throw ...
```

Gemessen an einem laufenden Parser: `storage_reserved` + `storage_exhausted`
→ abgewiesen. `no_network` + `home_unreachable` → **angenommen**.

**Warum das mehr ist als eine fehlende Zeile.** Am 2026-08-21 sind die Worte
absichtlich aus der Shell in den Kern gezogen, damit ein zweiter Client sie
*erbt statt sie neu zu erfinden* (ADR 0131 A7) — der Kommentar dort nennt
genau den Fall: „two clients telling one person two different things about the
same silence". Mitgezogen sind die Etiketten und die Abhilfen. Nicht
mitgezogen ist die Regel, welche davon ueberhaupt zusammen wahr sein koennen.
Ein Client, der seine Bedingungen selbst zusammenstellt, erbte die Woerter und
nicht den Verstand — und die Grenze, an der er ankommt, haette ihn
durchgelassen. Eine Person haette den Netzausfall zweimal gelesen, in
verschiedenen Worten.

**Die Leitern stehen jetzt neben den Namen**, als
`picoCompanionExclusiveConditions` im Kern, mit dem Grund je Paar; im Vertrag
restated wie die Namen und durch denselben Test gebunden; und die Grenze weist
beide ab, in jeder Reihenfolge.

**Kein neues Tor dazu.** Die Bindung tut die Arbeit, und ein Tor daneben waere
die zweite Wahrheit, gegen die dieser Befund gerade angeht. Dieselbe
Entscheidung wie bei B239, wo der Compiler die Gegenrichtung schon sieht.

**Der Erzeuger wird jetzt ganz gegangen, nicht behauptet.** Sein Eingaberaum
ist klein — drei Tristates und vier Speicherlagen, **108** Kombinationen. Der
Test geht alle, prueft dass keine ein verbotenes Paar baut, und laesst jede
gebaute Liste zusaetzlich durch den Vertrag laufen: was der Erzeuger baut,
muss die Grenze auch annehmen.

**Drei Pflanzungen, drei Bisse, jede an der richtigen Stelle.** Die Grenze
wieder auf die Speicherleiter verkuerzt → nur der Grenztest faellt. Die Kopie
von der Quelle weggedreht → Bindungstest *und* Erzeugerlauf fallen. Dem
Erzeuger seine eigene Regel genommen (`&& input.online !== false` entfernt) →
nur der Erzeugerlauf faellt.

**B239 — eine Entscheidung reisst das Fenster an sich, und niemand hielt fest,
dass es dann auch etwas anzubieten hat (2026-09-21).** `decision` ist das
vierte Feld eines Darstellungszustands. Vier Werte sind echte Entscheidungen,
je an genau einen Zustand gebunden (`assertDecisionKind`), der fuenfte heisst
`none`. Und eine Entscheidung ist kein Hinweis:

```ts
picoCompanionPresentationTakesTheWindow(p)
  => p.decision !== 'none' || p.severity === 'blocked'
```

Sie **nimmt der Person das Fenster** — mitten in dem, was sie gerade tat. Der
Kommentar daneben sagt warum, und er hat recht: etwas, das auf eine Antwort
wartet, ist das wert.

**Dann muss es aber auch eine Antwort entgegennehmen.** Gemessen: alle vier
Entscheidungen steuern heute ein Element, und an jedem haengt ein Handler —
zwei direkt (`veto`, `approve`/`deny`), zwei ueber Abschnitte
(`recovery-card-form`, `first-run`), deren Knoepfe darin haengen. Nichts davon
war kaputt. Aber nichts **haelt** es: TypeScript kennt das Fenster nicht, das
Fenster kennt keinen Typ, und zwischen der Menge und dem HTML liegt nichts. Ein
fuenfter Wert in der Union, und eine Person steht vor einem Fenster, das ihr
etwas abverlangt und nichts anbietet, worauf sie druecken kann. Kein Test faellt
dabei.

`check-companion-boundary.mjs` haelt die **Gegenrichtung** — jedes Element, das
das Skript verlangt, steht im HTML — und sagt von sich selbst, wo es aufhoert.
Neu ist `decision:check`, Kettenschritt **70**.

**Was TypeScript doch sieht, und wofuer hier nichts gebaut wurde.** Ein
Vergleich gegen eine Zeichenkette, die keine Entscheidung ist
(`decision !== 'approve_or_denny'`), ist ein Typfehler — der Knopf waere fuer
immer versteckt, aber der Compiler sagt es. Diese Richtung braucht kein Tor,
und ein Tor, das sie nochmal prueft, waere eine zweite Wahrheit.

**Der Leser musste dreimal tiefer, als es aussah.**

*Erstens*, in den Behaelter: zwei Entscheidungen zeigen keinen Knopf, sondern
einen Abschnitt. Ein Abschnitt traegt keinen Handler; seine Knoepfe tun es.
Geprueft wird der Teilbaum im HTML.

*Zweitens*, durch die Schleife: zwei Knoepfe haengen nicht einzeln am Handler,
sondern ueber

```ts
for (const [button, source] of [[joinCamera, 'camera'], [joinTyped, 'typed']])
  button.addEventListener(...)
```

Eine Suche nach `joinCamera.addEventListener` findet nichts und haette sie als
tote Knoepfe gemeldet.

*Drittens* — und das war mein eigener Fehler, gefunden durch die Pflanzung:
Ich loeste die Schleife zuerst in einer **Tabelle nach Namen** auf. `renderer.ts`
hat **zwei** solche Schleifen, und beide nennen ihre Bindung `button`. Die
zweite ueberschrieb die erste, `joinCamera`/`joinTyped` gingen still verloren,
und der Pruefer zaehlte *eine* aufgeloeste Bindung statt zwei. Aufgefallen ist
es nur, weil eine Pflanzung fiel, die haette halten muessen. Ein Name ist kein
Bezeichner — er ist einer **je Geltungsbereich**, und aufgeloest wird an der
Verwendungsstelle, nicht in einer Tabelle. Dieselbe Lehre wie B234/B235, eine
Ebene tiefer.

**Fuenf Pflanzungen.** Eine fuenfte Entscheidung ohne Element → Tor nennt sie.
Handler am Veto weg → Tor nennt den toten Knopf. Die direkten Handler des
Abschnitts weg, Schleife bleibt → Tor **haelt**, denn die Schleife traegt.
Danach auch die Schleife weg → Tor schlaegt an. Und die Bindungstabelle gegen
die Verwendungsstelle: nur die zweite Fassung zaehlt beide Schleifen.

**B238 — das Zeichen ist eine Sicht auf die Schwere, und es stand 43-mal
daneben (2026-09-21).** Ein Darstellungszustand des Companions trägt vier
Dinge, die zusammen entscheiden, was ein Mensch sieht: `kind`, `severity`,
`symbol` und `decision`. Der Vertrag band davon **zwei** Paare — `kind` an
`decision` (`assertDecisionKind`), und beide gegen ihre erlaubte Menge. Schwere
und Zeichen waren zwei unabhängige Mengen:

```ts
const severities = new Set([...]);
const symbols = new Set(['●', '!', '×']);
```

Jede für sich geprüft, keine gegen die andere. Also durfte `severity: 'blocked'`
mit `symbol: '!'` zusammenstehen, und niemand hätte es bemerkt.

**Drei Fragen vorher waren Negative, und das gehört dazu.** Die deklarierten
Zustände (`PicoCompanionPresentationKind`, 17) und die Menge, gegen die zur
Laufzeit geprüft wird, stimmen exakt überein. Jeder der 17 wird auch wirklich
irgendwo erzeugt — keiner ist ein Zustand, den ein Mensch nie erreicht. Und die
*Schwere* eines Zustands darf sehr wohl wechseln: `first_run` steht als
`warning`, wenn es noch zu tun ist, als `active`, während es läuft, und als
`blocked`, wenn es scheiterte. Das ist kein Drift, sondern die Lage.

**Was nicht wechseln darf, ist das Zeichen zur Schwere.** Gemessen über den
Syntaxbaum: **43 Paarungen** schreiben beide Felder von Hand nebeneinander
(Zweige einzeln gezählt) — 17 `active ●`, 14 `warning !`, 12 `blocked ×`. Alle
43 sind heute einig. Das ist kein Verdienst der Bauart, sondern Glück, das
43-mal gehalten hat.

Damit ist es genau der Fall aus **ADR 0133**: eine abgeflachte Darstellung ist
ein Cache, nie eine Autorität. Das Zeichen ist die abgeflachte Schwere. Der ADR
verlangt für frühes Materialisieren vier Angaben, und die fehlende war der
**Korrekturpunkt**.

**Zwei Netze, weil eines am falschen Ort greift.** Der Vertrag hat jetzt eine
Ableitungstabelle (`picoCompanionPresentationSymbol`), und der Prüfer weist ein
Zeichen zurück, das nicht zu seiner Schwere gehört
(`invalid_companion_presentation_symbol_binding`). Aber der Vertrag prüft erst,
wenn der Zustand einem Menschen *gezeigt* werden soll — eine Zurückweisung in
genau dem Moment, in dem jemand etwas erfahren muss, ist keine Rettung. Also
zusätzlich `symbol:check` (`scripts/check-presentation-symbols.mjs`), das
dieselbe Tabelle an den Bauplatz hält, bevor irgendetwas läuft. Kettenschritt
**69**.

**Der Leser ist ein Leser, keine Regex** (B188). Drei Stellen entscheiden
Schwere und Zeichen in *Zweigen* — `approved ? 'active' : 'blocked'` neben
`approved ? '●' : '×'`. Dort ist die Drift am wahrscheinlichsten: dieselbe
Bedingung steht zweimal da, und wer einen Zweig dreht, dreht den anderen leicht
nicht mit. Ein zeilenweiser Blick hatte diese drei zunächst als
„nicht entscheidbar" übersprungen — also genau dort weggesehen, wo es brennt.
Der Prüfer zerlegt sie jetzt und hält Zweig gegen Zweig, samt der Bedingung
selbst: entscheiden beide an *verschiedenen* Bedingungen, gibt es einen Fall,
in dem sie nicht dasselbe meinen, und auch das schlägt an. Nebenbei zeigte
dasselbe: eine Zeilensuche zählte 33 Paarungen, der Syntaxbaum 43 — mehrzeilige
Stellen und `'\u25cf'` als Escape fallen durch jedes Muster.

**Vier Pflanzungen, vier Bisse.** Die Vertragsbindung entfernt → der Vertrags-
test fällt. Eine einzeilige Fehlpaarung (`blocked ×` → `blocked !`) → Tor
schlägt an. Ein *einzelner* Zweig gedreht → Tor nennt den Zweig
(„im Zweig `approved : `"). Zeichen an eine andere Bedingung gehängt
(`rotated.repinned` gegen `rotated.rekeyed`) → Tor nennt beide Bedingungen.

Genau **eine** Stelle bleibt unentscheidbar: der Vertragstest selbst, der die
falschen Paare absichtlich durchprobiert. Der Prüfer nennt sie, statt sie
stillschweigend als geprüft zu zählen (B166).

**B237 — acht Zahlen in dem Dokument, aus dem ein Leser den Stand nimmt
(2026-09-20).** `progress.md` ist laut `AGENTS.md` die periodische
Fortschrittsschätzung — und die Stelle, an der jemand nachsieht, wie es steht.
Diese Session hat siebzehn Tore gebaut und das Dokument nie nachgeführt.

Gemessen mit seinem eigenen Werkzeug, `pnpm progress:walk`: **fünf von achtzehn
Behauptungen wichen ab.**

| | sagte | gemessen |
|---|---|---|
| Schritte in `release:verify` | 56 | **68** |
| klassifizierte Flächen | 84 | 85 |
| bediente HTTP-Routen | 61 | 62 |
| Routen mit Aufrufer | 37 | 38 |
| exportierte Fähigkeiten | 443 | 447 |

Drei davon sind Folgen dieser Session: B235 hat die Leser berichtigt, die
Flächen und Routen zählen, und die zwölf neuen Kettenschritte sind meine. Die
Drift ist also kein Versäumnis der Bauart — `progress:walk` steht
**absichtlich** außerhalb der Kette, und sein eigener Kommentar sagt warum: es
liest **Prosa**, und ein Muster über Prosa greift irgendwann daneben; ein Tor,
das zweimal danebengreift, wird überlesen. Ein periodischer Stand, der
periodisch nachgeführt wird, ist genau das Richtige.

**Der Fund liegt bei den Zahlen, die es nicht kannte.** Drei weitere standen im
Dokument und in keinem Muster: 265 Testdateien, 2.979 Fälle, 9.304
Erwartungsausdrücke — richtig sind **266, 2.996 und 9.360**. Sie waren nie
falsch gemeldet worden, weil sie nie gefragt worden waren.

Das Werkzeug kennt sie jetzt, und zwar ohne seinen eigenen Grundsatz zu
brechen: es prüft weiterhin keine *ausgeführten* Testzahlen (dafür braucht es
einen vollen Lauf), aber `tests:check` zählt diese drei **statisch** und druckt
sie ohnehin in seiner Erfolgszeile. Was ein Tor druckt, gehört gehalten.

Und der Absatz über die Walks, den es auch nicht prüft, war ebenfalls alt:
*„35 der 61 Routen"* heißt jetzt 35 der 63, `GET /api/home/link/continuity`
wird nicht mehr von außerhalb `app.ts` beantwortet (sie war nur unsichtbar,
B235), dafür `/health` (B217), und von den 27 ungegangenen sind 23 argumentiert
und vier haben einen Aufrufer, den das Szenario nicht fährt (B232).

**Bemerkenswert an dem Werkzeug**: es hat die drei neuen Behauptungen mit `?`
gemeldet, bevor es `tests:check` mitfuhr — *„im Torlauf nicht gefunden"*, nicht
stillschweigend als richtig gezählt. Genau das verspricht sein Kommentar, und
genau daran hat man gesehen, dass die Regel noch fehlte.

Zwei Pflanzungen, zwei Bisse: eine der neuen Zahlen verstellt, und die
Kettenlänge verstellt.

**B236 — ein Zurücksetzen ist eine Entscheidung über 48 Tabellen, und stand
als Liste von zehn da (2026-09-20).** Ein Home-Reset ist ein handfester,
unwiderruflicher Akt: er entfernt die Host-Identitätsschlüssel, setzt den
Anspruchszustand zurück, löscht Mitgliedschaften, Widerrufe, Delegationen,
Lesezugänge und Umschläge, entbindet den Betreiber und widerruft jede Sitzung.

Gemessen: `resetPicoHome` räumt **neun** Tabellen und schreibt eine um. Das
Schema hat **48**. Die Liste ist von Hand geschrieben — also steht die
neunundvierzigste Tabelle per Vorgabe außerhalb des Resets, und niemand erfährt
es. Das ist genau die Krankheit, für die `check-store-ceilings.mjs` geschrieben
wurde (*„every table says how it stops growing"*), an einem anderen Akt gefragt.

**Ein Reset vergisst keine Person, er nimmt einer Maschine ihr Zuhause.** Die
38 Überlebenden sind fast alle offensichtlich richtig — Erinnerungen, das
Log, die Auditkette, Modell- und Depot-Entscheidungen, der Beobachtungspuffer,
die Wiederholungssperre. Das hinzuschreiben kostet nichts; teuer wäre, in ein
paar Jahren zu merken, dass eine Tabelle geblieben ist, die hätte gehen
müssen, weil niemand sich äußern musste.

**Die eine, die Gewicht hat, ist `pico_home_device_recovery`.** Eine schwebende
Geräte-Wiederherstellung überlebt ein Zurücksetzen. Das ist sicher — aber nicht
von selbst, sondern weil jede Zeile das `home_id` trägt, zu dem sie gehört,
während der Reset den Anspruchszustand und den Gründungssatz räumt: was
überlebt, zeigt auf ein Home, das es nicht mehr gibt. Diese Begründung gilt
genau so lange wie die Spalte, und deshalb ist die Spalte das, was der Eintrag
bewacht.

Drei Pflanzungen, drei Bisse: eine neue Tabelle ohne Entscheidung, die Spalte
`home_id` umbenannt (*„the argument outlived what it described"*), und ein
Reset, der eine Tabelle räumt, die es nicht gibt.

**B235 — acht Türen ohne Schloss, und ein Leser, der eine davon nie sah
(2026-09-20).** Zweiundsechzig klassifizierte Foundation-Routen, und **acht**
erreicht ein Fremder ohne jedes Zugangsmittel: vier `public`, drei
`setup-bootstrap`, eine `link-intake`. Klein und absichtlich — und nichts hielt
die Menge zusammen.

**Meine erste Zählung sagte sieben**, weil mein Muster nur Zeichenketten nahm.
Die achte steht als Konstante: `accessClasses.register('GET',
PICO_LINK_CONTINUITY_READ_PATH, 'public')`. Ausgerechnet die eine öffentliche
Route, die *nicht* unter `/api/auth/` liegt — die interessante also.

Und damit war die Spur gelegt, denn **ich war nicht der erste Leser mit diesem
Muster.** `check-surface-classes.mjs` liest Registrierungen genauso, und
`measure-route-walk.mjs` liest bediente Routen als `app.get('…'` mit der
Zeichenkette direkt hinter der Klammer. Gemessen, was ihnen entging:

| Leser | sah | sieht jetzt | fehlte |
|---|---|---|---|
| Registrierungen | 60 | 62 | beide Link-Pfade, als Konstante |
| bediente Routen | 59 | 63 | zwei als Konstante, **zwei nur wegen eines Zeilenumbruchs** |

Die zwei Reader-Custody-Routen standen als `app.post(\n  '/api/…'` — der Pfad
beginnt in der nächsten Zeile, und das Muster verlangte ihn hinter der Klammer.
Sie sind nie gezählt worden, seit es die Messung gibt.

**Und dann fiel ein echter Fund heraus.** Mit dem berichtigten Leser meldet
`surface:check`:

> `GET /api/home/link/continuity` (public) is served and appears nowhere in
> this document.

Eine **öffentliche** Route, die ADR 0134 Pflicht 4 nie klassifiziert hat — nicht
weil jemand sie vergaß, sondern weil ihr Prüfer sie nicht sehen konnte. Sie
steht jetzt in `public-surfaces.md`, mit ihrem Grund (ADR 0115 U4: ein Gerät,
das sein Home verloren hat, kann nichts beweisen, weil das Beweismittel genau
das Verlorene ist) und mit dem Satz, warum sie so lange fehlte.

Alle drei Leser teilen sich jetzt `scripts/registered-routes.mjs`, das den
Syntaxbaum fragt und einen Bezeichner nachschlägt — und was es **nicht**
auflösen kann, meldet es, statt es zu überspringen. Der Eingangspfad stand
nebenbei dreimal (einmal Konstante, zweimal Literal), während sein Geschwister
in derselben Datei viermal als Konstante steht; jetzt beide.

Fünf Pflanzungen, fünf Bisse: eine öffentliche Route ohne Anmeldezweck, eine
`setup-bootstrap`-Route ohne Begrenzung im Haken, ein Eingangspfad, der vom
Lauscher wegdriftet, eine Registrierung aus einem Ausdruck, den kein Leser
auflösen kann — und zur Gegenprobe eine Route mit Zeilenumbruch, die der neue
Leser sieht und der alte nicht sah.

**B234 — eine Suche, die nach dem falschen Wort fragte (2026-09-20).**
B233 stand auf zwei Suchen: `buildApp` in den Tests des Daemons, `@pico/core`
in seinen Quellen. Beide fanden nichts, beide waren wahr, und beide fragten das
Falsche. **Dieses Haus fährt einen Nachbarn nicht durch einen Import, sondern
durch einen Prozessstart auf seinen gebauten Einstiegspunkt** — und danach hat
keine meiner Suchen gefragt.

`apps/vault-daemon/src/claim-ceremony.test.ts` sind **2.459 Zeilen**, die genau
das tun. Der Daemon und ein echtes Home sind einander oft begegnet. Der
zentrale Satz von B233 ist falsch und steht dort jetzt berichtigt.

Das ist Regel 17 an mir selbst: *ein Messgerät ist gerichtet.* Ich habe nach
der Redewendung gesucht, die ich gebaut hätte, und nicht nach der, die dasteht.

**Richtig gemessen sind es sechs Kopplungen über einen Pfad**, in drei Paketen:

| von | startet | erklärt? |
|---|---|---|
| `apps/companion-shell` | `vault-daemon/dist/cli.js` | ja |
| `apps/companion-shell` | `core/dist/index.js` | ja |
| `apps/companion-shell` | `core/dist/test-model-provider-host.js` | ja |
| `apps/companion-shell` | `relay/dist/main.js` | **nein** |
| `apps/vault-daemon` | `core/dist/index.js` | ja |
| `apps/web` | `core/dist/index.js` | **nein** |

Zwei Paare starten einander, ohne dass ein Manifest sie je erwähnt. Wer den
Einstiegspunkt des Relays umbenennt, bricht einen Test in einem Paket, dessen
Manifest das Relay nicht kennt — und erfährt es als *„cannot find module"*.

`neighbour:check` hält das jetzt: jeder gestartete Pfad muss eine Quelle haben,
die dieses Repository führt (dieselbe Regel, die `check-addon-config.mjs` auf
das `CMD` eines Containers anwendet, an die Stelle gebracht, wo Tests dasselbe
tun), und jede Kopplung ist erklärt oder begründet. Die beiden Begründungen
ruhen **nicht** auf ihrem eigenen Wort: sie ruhen darauf, dass die Kette baut,
bevor sie testet, und das liest das Tor aus `package.json`. Verschwindet
`pnpm build` aus `verify:gates`, fallen sie.

Eine erklärte Abhängigkeit wäre die andere Lösung, und sie wäre hier
Dekoration: `apps/companion-shell` führt `@pico/core` schon als
Dev-Abhängigkeit und importiert sie nirgends — und gemessen hält die
Baureihenfolge auch ohne sie, weil sie über `@pico/vault-daemon` kommt.

Vier Pflanzungen, vier Bisse: ein umgezogener Einstiegspunkt, eine entfernte
Erklärung, ein Pfad ins Leere, und `pnpm build` aus der Kette genommen.

**B233 — zwei Prozesse, die miteinander reden und sich nie begegnet sind
(2026-09-20).** B232 hinterließ drei Routen, die `route:walk` als ungegangen
meldete, obwohl sie einen Aufrufer haben. Der Aufrufer ist der **Vault-Daemon**
— die Komponente, die Personenschlüssel hält. Also die Frage: wird die je gegen
ein echtes Home gefahren?

Gemessen: **kein Test dieses Baums baut ein Home und fährt den Daemon.** Nicht
einer. `apps/vault-daemon` führt `@pico/core` als Dev-Abhängigkeit im Manifest,
und **keine Zeile importiert sie**.

> **Berichtigt am 2026-09-20, noch am selben Tag (B234).** Der fettgedruckte
> Satz ist falsch. Ich habe nach `buildApp` und nach `@pico/core` gesucht —
> beide Suchen waren wahr und beide fragten das Falsche. Dieses Haus fährt
> einen Nachbarn, indem es **seinen gebauten Einstiegspunkt per Pfad startet**,
> und `apps/vault-daemon/src/claim-ceremony.test.ts` tut das auf 2.459 Zeilen,
> seit langem. Die beiden sind einander oft begegnet. Was von B233 steht,
> steht unten; was fällt, fällt hier.

**Sie war auch nicht benutzbar, und mein erster fehlgeschlagener Lauf hat das
bewiesen statt vermutet.** `main` des Kernpakets zeigt auf
`dist/index.js` — den Einstiegspunkt, der ein Home *startet* und nichts
exportiert. Der Import lieferte `buildApp is not a function` und hinterließ:

    apps/vault-daemon/apps/core/data/pico.sqlite
    apps/vault-daemon/apps/core/data/home-host-keys/home_host_signing.key.json
    apps/vault-daemon/apps/core/data/home-host-keys/home_host_key_agreement.key.json

Ein Import hat ein Home hochgefahren und **Hostschlüssel erzeugt**, im
Verzeichnis eines fremden Pakets. Entfernt; sie waren ungetrackt und ganz aus
diesem Lauf.

**Das Relay hat diese Trennung, der Kern hatte sie nicht.** ADR 0153 PK2 gab
dem Relay ein `main.ts`, das läuft, und ein `index.ts`, das nur exportiert —
deshalb kann der Kern in seinen Tests ein echtes Relay fahren
(`link-push-sweep.test.ts`), und niemand ein echtes Home. Eine Richtung
gebaut, die andere nicht.

`@pico/core` bekommt jetzt eine Tür: ein `exports`-Feld mit `./app` neben dem
bisherigen Wurzeleintrag. Was läuft, bleibt unangetastet — der Container ruft
`node apps/core/dist/index.js` über den Pfad, nicht über den Paketnamen. Ob der
Kern das ganze Muster des Relays bekommen sollte (ein Fass und ein Läufer), ist
die größere Frage und steht hier, statt im Alleingang beantwortet zu werden.

Das Netz ist die erste Begegnung selbst: ein echtes Home über `buildApp`, der
echte `picoFoundationRequest` des Daemons, und dazwischen der **Vertrag** —
`/api/system/status` liefert ein Objekt mit `service`, und die beiden
Autoritätsrouten liefern wortwörtlich
`foundation_rejected:401:Current Pico Home authority relay session is required.`
Benennt das Home seine Ablehnung um, fällt es hier; ändert es seinen
Dienstnamen, auch. Beides gepflanzt, beides gebissen — die zweite Pflanzung erst
im zweiten Anlauf, weil ich den Dienstnamen an einer von drei Stellen geändert
hatte und nicht an der, die diese Route schickt.

**B232 — zwei benachbarte Fragen und ein Satz, der sie verwischt
(2026-09-20).** `route:walk` fährt ein echtes Home gegen einen anderen Prozess
und zählt, welche Foundation-Routen dabei je erfolgreich geantwortet haben.
Gemessen heute: **34 von 60** — B43 hielt 26 von 61, es ist also gewachsen.
Fünfundzwanzig blieben ungegangen, und der Lauf schloss mit:

> 25 did not, and `check-surface-classes` says which of them are argued

Das stimmt nur ungefähr, und ich bin selbst darauf hereingefallen. Jener
Prüfer argumentiert Routen **ohne Aufrufer im Produkt**; dieser Lauf zählt
Routen, die **in seinem Szenario** niemand erreicht hat. Zwei benachbarte
Fragen — eine Route mit einem Aufrufer, den das Szenario nicht fährt, steht in
der einen Menge und nicht in der anderen.

**Wie oft ich die Schnittmenge falsch hatte, gehört dazu**: erst 3
argumentierte (mein Muster fand nur die drei exakten Einträge und keinen der
zwölf Präfixe), dann 20 (Präfixe dazu, aber ohne die Methodenregel), und
richtig sind **22** — was erst herauskam, als der Lauf die Liste des Prüfers
**selbst liest** statt sie nachzubauen. Regel 18s Zwilling: wer eine Menge
nachbaut, misst seinen Nachbau.

Dafür liegt die Liste jetzt in `scripts/argued-routes.mjs`, die beide
importieren. In den Prüfer hineinzuimportieren ging nicht: er endet auf
`process.exit(1)`, und ein Messgerät, das beim Lesen einer Liste das Programm
beendet, ist keines.

Der Lauf sagt den Unterschied jetzt selbst: *25 ungegangen, 22 davon ohne
Aufrufer argumentiert, 3 dort nicht argumentiert.* Die drei sind
`GET`/`POST /api/home/reader-custody/kek-rotations` und
`POST /api/home/membership-lifecycle`.

Regel 22 hat sich dabei zum dritten Mal gemeldet: `docs:check` sah die neue
Datei erst, als sie gestaged war.

**Und die Pflanzung hat meine Beschriftung berichtigt, nicht das Werkzeug.**
Ich hatte den zweiten Korb „hat einen Aufrufer im Produkt" genannt. Nimmt man
der Liste ein Argument, fällt `surface:check` — und dieselben Routen landen in
demselben Korb, ohne dass ein Aufrufer existiert. Der Satz war nur wahr,
solange das andere Tor grün ist, und genau so steht er jetzt da.

**B231 — die Schwärzung lief immer und behauptete sie nie (2026-09-20).**
Eine URL ist der Teil einer Anfrage, der aufgeschrieben wird — von diesem Home
selbst und von allem dazwischen. Die Foundation weiß das: ihr
Protokoll-Serialisierer schneidet `ticket` aus der aufgezeichneten Adresse,
weil eine Eintrittskarte ein Zugangsmittel ist.

Am **laufenden** Home gemessen, mit einer Senke als Protokollziel und einem
Blick hinein:

    /api/system/version?ticket=%5Bredacted%5D&limit=5

Das Geheimnis steht in keiner Zeile. Die Schwärzung greift also — sie ist nur
nie **behauptet** worden. Die Suiten reichen eine Senke durch und sehen nicht
hin, und `redactTicketQueryValue` war schon einmal Gegenstand eines Befundes
(B175-Familie), weil sich ihr Fehlschlag nicht messen lässt: sie sitzt im
Protokollpfad, und dort verträgt nichts einen Fehler.

Und nichts brachte den **nächsten** Parameter dazu, sich derselben Frage zu
stellen.

`query:check` zählt jetzt jeden Abfrageparameter, den ausgeliefertes Produkt
liest, und verlangt zu jedem ein Urteil: trägt er ein Zugangsmittel, muss der
Serialisierer ihn herausschneiden; trägt er keines, darf er es **nicht** — eine
Begründung, die „nichts Geheimes" sagt, während der Code schwärzt, sind zwei
Leser, die sich in einer Datei widersprechen.

**Und der Syntaxbaum hat sofort einen gefunden, den meine Regex übersah.** Ich
hatte drei gezählt (`ticket`, `limit`, `domainAuthorityId`); es sind **vier**.
`after` — der Blätter-Cursor — stand in einer Typliste, die mein Muster nicht
traf. B188s Satz, diesmal zu meinen Gunsten: eine Regex ist kein Leser von
Quelltext.

Zwei Pflanzungen, zwei Bisse, und jede fiel bei dem Netz, das für sie gebaut
ist. Den Aufruf der Schwärzung entfernt: der **Test** fällt (`expected … not to
contain 'ein-geheimnis'`), das Tor bleibt grün — es liest die Quelle des
Serialisierers, und die Funktion steht ja noch da. Einen `accessToken`-Parameter
eingefügt: das **Tor** fällt, der Test kennt ihn nicht. Das steht so im Tor,
damit niemand es für den ganzen Schutz hält.

**B230 — was die Suite nie sieht, weil sie immer leer anfängt
(2026-09-20).** Jeder Test dieses Baums migriert eine **frische** Datenbank.
Und SQLite ist mit einer leeren Tabelle nachsichtiger als mit einer vollen.
Gemessen an der mitgelieferten Fassung (3.49.2), dieselbe Anweisung zweimal:

| | leere Tabelle | eine Zeile |
|---|---|---|
| `ADD COLUMN a TEXT NOT NULL` | **angenommen** | *„Cannot add a NOT NULL column with default value NULL"* |
| `ADD COLUMN c TEXT DEFAULT CURRENT_TIMESTAMP` | **angenommen** | *„Cannot add a column with non-constant default"* |

Damit ist eine ganze Klasse von Migrationsfehlern hier unsichtbar und nur dort
sichtbar, wo etwas drinsteht — also auf dem Home einer Person, in dem Moment,
in dem sie aktualisiert.

**Gemessen statt gefolgert:** mit `NOT NULL` ohne Vorgabe an einer echten
Migration läuft `migrations.test.ts` durch — **elf Tests, alle grün**. Die
Suite, die es für Migrationen gibt, sieht den Fehler nicht.

Die zwanzig Spaltenerweiterungen im heutigen Schema sind **alle sicher**. Das
ist der Zustand, den dieses Tor halten soll, und kein Problem, das es gefunden
hat.

**Das Messgerät ist SQLite, nicht ein Leser von SQL** — dieselbe Wahl wie bei
`index:check`. Jede Erweiterung wird gegen eine Probetabelle mit **einer Zeile**
noch einmal gefahren, und die Datenbank entscheidet. Eine Klausel, an die ich
nicht gedacht habe, wird von dem beurteilt, was sie am Tag der Aktualisierung
beurteilt.

Drei Pflanzungen, drei Bisse, jede mit SQLites eigener Meldung: `NOT NULL` ohne
Vorgabe, ein nicht konstanter Vorgabewert, und eine `UNIQUE`-Spalte — die
letzte ist der Gegenfall, den SQLite auch leer ablehnt und die Suite also schon
fängt.

**B229 — die fünfte Schranke, und vier Verdachte, die keine waren
(2026-09-20).** B219 hat jedem Lauscher vier Schranken abverlangt:
Kopfzeilenfrist, Empfangsfrist, Keep-Alive, Verbindungszahl. Sie bemessen
**wann** und **wie viele gleichzeitig**. Was sie nicht bemessen, ist **wie
groß** — und ohne das sind die vier ein Versprechen über die Uhr und keines
über den Speicher.

Gemessen, bevor die Regel geschrieben wurde: **jede** lauschende Fläche dieses
Baums hat schon eine. Die Foundation über Fastifys `bodyLimit`
(`MAX_PAYLOAD_BYTES + 8 KiB`), der Link-Eingang über eine Routengrenze aus der
Umschlaggröße selbst, die beiden Relay-Ports über Konstanten in ihren
Behandlern (128 KiB und 4 KiB), der Vault-Daemon über eine Rahmengröße. Fünf
Flächen, fünf Grenzen, und nichts hielt sie zusammen.

**Drei Formen zählen**, weil die Rahmen sich unterscheiden und eine Regel über
Schreibweisen keine Regel wäre: eine Option namens `bodyLimit`, eine Konstante,
deren Name Bytes sagt, oder ein begründeter Lauscher, der gar keinen Rumpf
liest. Der Gesundheitslauscher des Relays ist der dritte Fall — er beantwortet
GET und weist alles andere ab, sein Bound ist die Methode.

Und einer ist der interessante: **der Link-Eingang bemisst selbst nichts.** Er
reicht an die Foundation weiter, und die Route dort setzt die Grenze. Das ist
richtig so, also zeigt die Begründung auf jene Datei — und das Tor **geht
nachsehen**, statt den Satz zu glauben. Nimmt man der Route ihre Grenze, fällt
der Eingang.

Drei Pflanzungen, drei Bisse — beim zweiten Anlauf für eine davon: mein erster
Schnitt hängte `+ 0` an den Ausdruck, und eine Teilstringprüfung sieht einen
Zusatz nicht. Eine echte Drift ist eine Umbenennung oder eine Entfernung, und
so gepflanzt fällt sie.

**Vier Verdachte dieser Runde waren keine**, und das gehört aufgeschrieben,
damit sie niemand ein zweites Mal misst:

1. **Die Protokollversion** wird angekündigt und nirgends verglichen — aber ADR
   0032s `protocolVersion`-Beispiel steht ausdrücklich unter *„Future
   compatibility claims"*, und ADR 0134 sagt, dass Formate sich bis zur ersten
   behaltenen Identität in place ändern. Angekündigt und nicht verglichen ist
   hier die ehrliche Lage, nicht die Lücke.
2. **Die Sweeps überlappen sich nicht** — ihr Taktgeber rearmiert nach dem Ende
   statt auf einem Raster und sagt das in seinem eigenen Kommentar.
3. **Der Aufbewahrungs-Sweep läuft synchron**, ein `setInterval` kann ihn also
   nicht doppelt starten.
4. **Das Rechtefenster am Daemon-Socket**, das ich für einen Fund hielt: der
   Socket entsteht mit der Umask und wird erst danach auf `0600` gesetzt — aber
   er liegt in `<vaultHome>/run`, und dieses Verzeichnis wird **im
   Konstruktor**, vor `listen()`, auf `0700` und den eigenen Nutzer geprüft
   (`vault_home_permissions`). Ohne Durchgangsrecht am Verzeichnis nützt ein
   kurz offener Socket niemandem. Das `chmod` danach ist Gürtel zum Hosenträger.

**B228 — ein Recht, das nichts einlösen konnte (2026-09-20).**
`AndroidManifest.xml` ist das Versprechen der Sonde über sich selbst, und es
steht zwangsläufig zweimal: einmal als Liste von Komponenten und
Berechtigungen, einmal als das Java, das sie benutzt.

Gemessen: **vierzehn** Komponenten erklärt, **vierzehn** konkrete
Komponentenklassen, Name für Name — die eine Hälfte stimmt. Und **elf**
Berechtigungen, von denen eine nichts einlösen konnte:
`RECEIVE_BOOT_COMPLETED`. Es gibt keinen `<receiver>` im Manifest und keinen
`BroadcastReceiver` in den Quellen. Nichts hätte den Rundruf je empfangen
können.

Eine Messsonde ist nicht das ausgelieferte Produkt, und kaputt war dadurch
nichts. Aber ein Produkt, dessen These Zurückhaltung ist, fragt Android nicht
nach einem Recht, mit dem es nichts zu tun hat — und das Manifest ist genau
die Stelle, an der diese Zurückhaltung für jeden sichtbar ist, der das Ding
installiert. Die Zeile ist weg, ihr Grund steht an ihrer Stelle.

`manifest:check` hält jetzt beide Hälften, und **jede Berechtigung nennt ihren
Beleg samt Korpus**: `startForeground` im Java, `foregroundServiceType` im
Manifest, und so weiter. Verschwindet der Beleg, fällt die Berechtigung.

**Vier Pflanzungen, und drei haben beim ersten Anlauf nicht gebissen** — die
zweite Runde hintereinander, in der das der eigentliche Ertrag ist:

1. Die Pflanzung gegen eine fehlende Komponente **war selbst kaputt**: mein
   Muster nahm ein einzeiliges, selbstschließendes Tag an, und die Dienste
   stehen über vier Zeilen mit einem `<property>` darin. Sie hat nichts
   entfernt, und ein Tor, dem man nichts wegnimmt, meldet zu Recht grün.
2. Der Beleg für `USE_FULL_SCREEN_INTENT` überlebte das Umbenennen im Java,
   weil mein Korpus **alles** war, worin die Sonde geschrieben ist — und
   `run-reachability-probe.sh` nennt dasselbe Wort, während es einen App-Op
   schaltet. **Ein Skript, das ein Recht gewährt, ist keine Benutzung davon.**
   Jetzt sagt jeder Eintrag, in welchem Korpus sein Beleg zu stehen hat.
3. Und eine neue Komponentenklasse ging durch, bis ich sie stagte — Regel 22
   aus B223, eine Runde später am eigenen Werkzeug bestätigt: ein Tor, das
   `git ls-files` liest, sieht nur, was im Baum steht.

**B227 — dieselbe Haltung, zweimal begründet, einmal vergessen
(2026-09-20).** Dieser Baum startet an sechs Stellen ein fremdes Programm, und
an zweien steht die Haltung dazu ausgeschrieben. `supplier-host.ts` gibt einem
Lieferanten `{ PATH }`: *„a supplier that could read this process's environment
would have the configuration channel the manifest's missing `env` field exists
to deny"*. `depot-fetch.ts` wiederholt es für `git`: *„`git` gets what it needs
to run and nothing about this process"*. Beide nennen ADR 0143 DP3.

Die dritte Stelle im Kern — der TPM-Anschluss, der den Plattform-Anker zählt —
reichte `{ ...process.env }` durch. Das ist die ganze Umgebung eines Homes, und
darin steht `PICO_FOUNDATION_TOKEN` neben jedem Pfad, an dem dieses Home seine
Schlüssel hält.

**Geleckt ist auch hier nichts**, und das gehört hingeschrieben: `tpm2_*` ist
ein vertrautes Systemprogramm auf derselben Maschine unter demselben Nutzer.
Was fehlte, ist der Grund. Ein Kind bekommt, was es braucht, und der Token ist
es nicht. Jetzt bekommt es `PATH` und den **eigenen Namensraum des Werkzeugs**
(`TPM2TOOLS_*`), weil eine Betreiberin, die dort etwas gesetzt hat, es so
meinte — und sonst nichts.

**Drei Pflanzungen, und die erste hat zweimal nicht gebissen.** Das ist der
eigentliche Ertrag dieser Runde:

1. Beim ersten Anlauf verglich mein Tor die Umgebung als **Text** und kannte
   `process.env` und `{...process.env}`. Die Pflanzung schrieb
   `{ ...process.env, TPM2TOOLS_TCTI: tcti }` — eine Streuung mit Beiwerk, und
   genau die Schreibweise, von der der Befund ausging. Sie ging durch. Jetzt
   fragt es den Syntaxbaum: eine Streuung ist eine Streuung, egal wie viele
   Eigenschaften daneben stehen.
2. Die zweite Begründung hing am Programmnamen `notify-send` — der steht auch
   in der Prosa darüber, also überlebte er das Umbenennen. Jetzt hängt sie am
   Argument der Anrufung selbst.
3. Und die Pflanzung ging **immer noch** durch, weil sie eine Funktion früher
   sitzt: der Zähler baut die Umgebung und reicht sie hinunter, am `spawnSync`
   steht nur ein Bezeichner. Das kann ein Leser des Aufrufs nicht sehen, und
   das Tor sagt es jetzt selbst. Gefangen wird dieser Fall vom **Test**, der
   dem Zähler sein `run` unterschiebt und fragt, was das Kind wirklich bekam.

Zwei Netze, zwei Fragen. `children:check` hält die Form an jeder Startstelle —
drei bauen dem Kind eine eigene Umgebung, drei reichen die Sitzung der Person
weiter und sagen warum (Benachrichtigung braucht den Bus, Drucken die
CUPS-Konfiguration, und eine Hülle, die sich selbst neu startet, misst genau
die Umgebung, mit der sie startete). Der Test hält den Inhalt dort, wo die
Umgebung eine Etage höher entsteht.

**B226 — die Liste, vor der die Datei sechs Zeilen vorher warnt
(2026-09-20).** Beide Container-Abbilder bauen den ganzen Workspace und
installieren danach die Produktionsabhängigkeiten neu, bevor die Laufzeitstufe
`/app` kopiert. Der Grund steht im Kommentar: *„the TypeScript compiler, vitest
and tsx are build tools and must not ship in a published image"*. Gut gedacht
und gut geschrieben.

Sechs Zeilen darüber steht in derselben Datei die Warnung, warum der Bau den
ganzen Workspace auf einmal installiert statt einzelner Manifeste: *„that list
silently drifts whenever a workspace package is added, which is exactly how
packages/identity and packages/vault once went missing from the image"*.

Und dann schrieb sie eine Liste:

    RUN rm -rf node_modules apps/*/node_modules packages/*/node_modules

`pnpm-workspace.yaml` erklärt **drei** Wurzeln. Die dritte, `modules`, wurde
nicht gefegt — vier Paketverzeichnisse überlebten die Bereinigung und fuhren
mit ins Abbild.

**Geleckt ist nichts**, und das gehört genauso hingeschrieben wie der Fund: die
vier Module haben heute **keine** Dev-Abhängigkeiten, es waren 32 kB
Workspace-Verknüpfungen auf Pakete, die ohnehin mitfahren. Genau das ist der
Punkt — die Regel hielt, weil noch niemand eine hinzugefügt hatte.

Der Griff ist jetzt eine **Form statt einer Liste**: `*/*/node_modules` trifft
jede Wurzel. Und `purge:check` hält beides zusammen — jede in
`pnpm-workspace.yaml` erklärte Wurzel muss von jedem veröffentlichten Abbild
gefegt werden, vor einer Neuinstallation nur mit Produktionsabhängigkeiten, und
beides vor dem `COPY --from=build`. Ein Platzhalter, der eine Wurzel deckt,
zählt als Deckung: geprüft wird die Form, nicht die Schreibweise.

Vier Pflanzungen, und die vierte ist die interessante. Die alte Liste
zurückgesetzt: fällt. Die Bereinigung ganz entfernt: fällt. Eine vierte Wurzel
in den Workspace gesetzt: **bleibt grün** — weil die Form sie mitnimmt, was die
ganze Änderung ist. Erst die Kombination aus alter Liste *und* neuer Wurzel
fällt, und dann zweimal, einmal je ungedeckter Wurzel.

**Was dabei gemessen wurde und offen bleibt.** `COPY --from=build /app /app`
nimmt die ganze Baustufe mit: alle Quellen, **269 Testdateien**, `docs/`
(16 MB) und `tools/`. Kein Geheimnis — `.dockerignore` hält Datenverzeichnis,
Recovery-Card-PDFs, `.env` und `.git` draußen, und zwei Befunde haben daran
schon gearbeitet (B91). Aber der Satz, der die Bauwerkzeuge aus dem Abbild
hält, gilt für die Testsuiten genauso, und für sie hat ihn niemand gesagt.
`closure:check` stellt diese Frage für das Debian-Paket; für das Abbild stellt
sie keiner. Das ist eine Paketierungsentscheidung und kein Messfehler, also
steht sie hier und nicht in einem Alleingang.

**B225 — ein Wächter, der auf halbem Weg stehen bleibt (2026-09-20).**
`isPicoWallClockPlausible` steht im Protokoll und sagt in seinem eigenen
Kommentar, wofür es da ist: *„deletion under ADR 0070's crypto-shredding is not
recoverable, so a wall clock jumped forward would expire items that had years
left. Being able to run is not permission to act on nonsense."* Gemessen: **ein
einziger Aufrufer**, der Aufbewahrungs-Sweeper.

Und in derselben Funktion, drei Zeilen darüber, steht eine zweite Löschung, die
dieselbe Uhr liest:

    const prunedPushes = store.prunePicoLinkPushLedger(now - 24 h);   // fragt nicht
    const result = retentionSweeper.sweep();                          // fragt

Eine dritte läuft beim Start: `prunePicoObservations()` löscht alles, was älter
ist als 48 Stunden. Auch ungefragt. Eine Uhr, die ein Jahr vorgestellt ist,
leert damit ein Register mit Tageshorizont und einen Puffer mit
Zweitagefenster — vollständig, und nichts davon kommt zurück. Das Kriterium im
Kommentar der Funktion, *„work that cannot be undone"*, trifft auf alle drei zu;
gefragt hat nur eine.

Die Frage steht jetzt **bei der Löschung statt beim Aufrufer**, so wie
`sweep()` sie auch selbst stellt: ein zweiter Aufrufer erbt die Antwort, statt
sich an sie erinnern zu müssen. Ohne Anker gibt es keinen Boden, und „kein
Boden ist kein Beweis für Unsinn" — dann wird gelöscht wie zuvor, weil eine
fehlende Datei keine Aufbewahrungsstörung werden darf.

Gepflanzt und gebissen: je eine der beiden Fragen wieder entfernt, beide Male
`expected 1 to be +0`.

**Und ein Fehler von mir, der fast durchgegangen wäre.** Der erste Entwurf des
Tests prüfte beide Löschungen auf **leeren** Tabellen — null gelöscht, egal ob
verweigert oder nichts da. Ein Test ohne Gegenstand, genau die Krankheit, die
B166 benannt hat, und er wäre grün geblieben, während die Regel wieder
verschwindet. Jetzt bekommt jede Tabelle eine fällige Zeile: auf der
unglaubhaften Uhr bleiben beide stehen, auf der glaubhaften fallen beide.

**B224 — zwei öffentliche Türen, zwei Antworten, und nur eine hat es
aufgeschrieben (2026-09-20).** Das Relay beantwortet auf seinem öffentlichen
Port eine unbekannte Route **genau wie** eine falsche Methode. ADR 0149 sagt
warum — *„telling them apart is a map of the relay's own surface"* —, der
Kommentar im Quelltext wiederholt es, und die CI vergleicht die beiden
Antworten Byte für Byte (`/nothing-here` gegen `/health`).

Der Link-Eingang eines Homes entscheidet es andersherum. Gemessen:

| Anfrage | Antwort |
|---|---|
| ein Pfad, den er nicht bedient | `404 {"error":"Not found."}` |
| ein Pfad, den er bedient, falsche Methode | `405 {"error":"Method not allowed."}` + `allow: POST` |

Eine einzige Anfrage je Pfad trennt also die zwei bedienten Ziele von allem
anderen, und die `allow`-Kopfzeile nennt die Methode gleich dazu. Wer den Port
anspricht, erfährt in einem Zug: *hier läuft ein Pico Home, und es hört auf
diesen beiden Pfaden.* Das ist genau der Satz, den PK3 beim Relay verhindern
soll.

**Beides ist Absicht — aber nur eine der beiden Absichten steht in einem
Entscheidungsdokument.** ADR 0149 argumentiert für das Relay; für den Eingang
sagt kein ADR etwas, und ADR 0107 (sein eigenes) schweigt zu Statuscodes. Die
Home-Seite steht ausschließlich in zwei Testzeilen — `expect(refused.status)
.toBe(405)` und `expect(refused.headers.get('allow')).toBe('POST')`. Eine
Entscheidung, die nur in einem Test steht, ist eine Entscheidung, die niemand
getroffen hat; sie ist nur nicht mehr zu ändern, ohne dass etwas rot wird. Das
ist immerhin die bessere Hälfte.

Das Netz ist wieder ein Test, der **beschreibt und nicht billigt** (wie B222,
in der Form des `connectionTimeout`-Tests): er spricht aus, was ein Fremder
lernt, und fällt, sobald jemand die beiden Antworten zusammenlegt. Gepflanzt:
den Eingang auf die Relay-Antwort umgestellt — `expected 404 to be 405`.

Ich habe die Verhaltensänderung **nicht** vorgenommen. Sie ist konservativ
(sie verrät weniger) und wendet nur ein Argument an, das dieses Haus schon
geschrieben hat, aber sie nimmt einer falsch konfigurierten Gegenstelle den
einzigen Hinweis, den sie bekommt, und öffentliche Flächen sind nicht der Ort
für einen Alleingang. Sie steht als Entscheidung 19 im Handoff, mit
Empfehlung.

**B223 — ein Versprechen, das niemand gegeben hat (2026-09-19).** Dieser Baum
argumentiert in Zitaten: `ADR 0119 Q4`, `ADR 0104 S5`, `ADR 0121 J1`,
`ADR 0153 PK3`. Die Nummer sagt, welches Dokument gemeint ist; die **Marke**
sagt, welches Tor darin — und die Marke ist die tragende Hälfte, denn sie
benennt das Versprechen, das eine Zeile Code gerade hält. Gehalten hat die
beiden nichts.

Gemessen: **11 398 Zitate** in 898 Quellen und Dokumenten, davon **4 811 mit
Marke**. Die Nummern waren alle in Ordnung — 157 Entscheidungsdokumente, jede
zitierte Nummer eine Datei. Von den Marken war **eine** falsch, und sie stand
an der einzigen Stelle, an der es weh tut:

    Crypto-shred a domain: … including copies in backups (ADR 0072 <Marke>, …)

und die Marke war ein `R5`. ADR 0072 hat kein R5. Es trägt **genau eine** Marke, `R6`, und die hat es von
ADR 0071 geerbt; seine eigene Schredder-Entscheidung ist Punkt 4 einer
nummerierten Liste. Der Satz zitierte also ein Tor, das niemand aufgestellt
hat — und zwar für die Behauptung, dass Schreddern **bis in die Sicherungen**
reicht. Das ist wörtlich R6s Eigenschaft: *„destroying a key that every data
backup still contains destroys nothing."* Berichtigt auf R6, mit dem Hinweis im
Kommentar, was dort stand und warum R6 die richtige Marke ist.

**Die Dokumente waren sauber** — 1 159 Zitate mit Marke, alle auflösbar. Der
einzige Fund lag im Quelltext, wo die Zitate von Hand entstehen und kein
Lektorat über sie läuft.

`citations:check` liest beide Korpora, löst die zusammengezogenen Schreibweisen
auf (`ADR 0119 Q1/Q2`, `ADR 0071/0072`, `PK2/3` mit geliehenen Buchstaben) und
prüft zweierlei: jede Nummer ist ein Dokument, und jede Marke ist ein Wort, das
dieses Dokument trägt. Gepflanzt und gebissen in beide Richtungen — eine Marke
im Quelltext verdreht, eine Nummer erfunden, und die Marke aus dem ADR
entfernt: der dritte Schnitt meldet sich aus `Roadmap.md`, also von der
zitierenden Seite, was genau der Punkt ist.

Und es hat seinen eigenen Autor **zweimal** gefasst. Erst diesen Absatz, der
die falsche Marke wörtlich zitierte, in genau der Schreibweise, die das Tor
liest — deshalb steht die Zeile oben mit `<Marke>` statt mit ihr. Dann seinen
eigenen Kopfkommentar, der dasselbe Beispiel nennt.

**Der zweite Fang ist der lehrreiche, weil er erst später kam.** Beim Schreiben
lief das Tor grün, obwohl der Kommentar schon dastand: sein Korpus ist
`git ls-files`, und ein ungetracktes Skript steht nicht darin. Es hat sich
selbst erst gesehen, als es committet war — **ein Tor dieser Bauart ist blind
für sich selbst, bis es im Baum steht.** Das ist Regel 22 fürs Handbuch und die
dritte Fassung derselben Lehre: B166 (ein Prüfer ohne Gegenstand), B215 (ein
Tor, grün und kaputt), Regel 14 (wer eine Abwesenheit prüft, nimmt die
Erklärung aus dem Gegenstand).

Was das Tor **nicht** kann, gehört dazu: es weiß nicht, ob eine Marke noch
dasselbe sagt wie beim Zitieren. Es weiß, dass das Dokument sie überhaupt
führt — und das hat gereicht, um die eine zu finden, die es nicht tat.

**B222 — zwei Zähler, ein Baum, und nur einer verträgt eine zweite Hand
(2026-09-19).** Nichts hindert einen zweiten Pico-Kern daran, dieselbe
`pico.sqlite` zu öffnen. Der Vault-Daemon kennt diese Frage und beantwortet sie
(`daemon_already_running`), der Home nicht: gemessen, zwei `EventStore` auf
derselben Datei, beide öffnen ohne ein Wort.

Was dann geschieht, hängt daran, **wann** ein Zähler seinen Stand liest.

Die **Auditkette** liest ihren Kopf bei *jedem* Anhängen — `SELECT …
chain_position DESC LIMIT 1` vor jedem Satz. Zwei Prozesse verschränken ihre
Positionen also sauber, und `UNIQUE (writer_id, chain_position)` steht
zusätzlich im Schema, mit einem Kommentar, der genau diesen Fall benennt:
*„so no writer can fork its own sequence and keep both branches"*. Gemessen:
zwei Homes, ein geketteter Ereignistyp, beide Schreibvorgänge gehen durch, die
Kette bleibt eine.

Die **Lamport-Uhr** liest ihren Stand **einmal**, beim Start:
`new LamportClock(store.maxLamport())`. Danach nie wieder. Gemessen: beide
Homes vergeben `lamport = 2`, und `pico_event` nimmt beide — es gibt keine
Eindeutigkeit über `(device_id, lamport)`. Zwei verschiedene Ereignisse
desselben Geräts stehen an derselben logischen Stelle, und der Index
`(lamport, wall_time, event_id)` bricht den Gleichstand nach Wanduhr auf: eine
Reihenfolge, die es gibt, aber keine, die jemand gemeint hat.

**Wie weit trägt der Schutz, den es gibt?** 37 Foundation-Ereignistypen, **26**
davon in der Auditkette (`auth.` und `home.`), **elf nicht** — darunter
`memory.recorded`, also die Erinnerungen selbst. Für diese elf gibt es
überhaupt keine zweite Meinung im Schema.

Das Netz ist hier ein **Test, der beschreibt und nicht billigt** — dieselbe
Form wie der `connectionTimeout`-Test in `app.test.ts`, der eine Auslassung
festhält, *„damit die Auslassung eine Entscheidung bleibt und kein Vergessen"*.
Gepflanzt: eine Ablehnung doppelter `(device_id, lamport)` in `append`
eingesetzt — der Test fällt sofort mit `expected 'refused_storage_pressure' to
be 'inserted'`. Er hat also Zähne: wer die Eigenschaft ändert, muss ihn
bewusst umschreiben.

Die Entscheidung selbst gehört nicht mir und steht als Punkt 18 im Handoff.
Empfohlen ist `UNIQUE (device_id, lamport)` — dieselbe Form, mit der die
Auditkette das Problem schon gelöst hat, und sie fällt am Speicher statt in der
Anwendung. Eine Instanzsperre wäre für eine Betreiberin klarer, verböte aber
auch den zweiten, nur lesenden Prozess.

**B221 — vier Abbrüche, drei falsche Erklärungen, und die Messung war ein
Einzeiler (2026-09-19).** Seit dem 2026-09-18 wird `pnpm prepush` auf dieser
Maschine abgebrochen. Ich habe die Ursache **dreimal** behauptet und dreimal
falsch: nicht `shift-clock.mjs`, nicht der freie Arbeitsspeicher, nicht der
Swap-Stand. Danach habe ich aufgehört zu erklären und nur noch gezählt — „zwei
von vier", „drei von sieben", jedes Mal mit einem vorsichtigeren Satz daneben.
Vorsichtig war richtig; **messen** wäre besser gewesen.

Zwei Zeilen haben es entschieden.

`journalctl -k --since "3 days ago" | grep -c 'out of memory\|oom-kill'` sagt
**null**. Der Linux-OOM-Killer hat auf dieser Maschine in drei Tagen nichts
getötet. Was die Läufe beendet, ist die **Aufsicht über die Hintergrundaufgaben
des Agenten**, die bei knappem Speicher eingreift — sie sagt es sogar selbst,
und ich habe zwei Tage lang „Speichermangel" gelesen und „Kernel" verstanden.

Und der letzte abgebrochene Lauf hinterließ **24 Byte** Ausgabe. Er starb,
bevor der erste Schritt seine Überschrift schreiben konnte. Damit fällt auch
der letzte Satz, den ich noch für gemessen hielt: die Abbrüche gehören keinem
Schritt, weil sie oft gar keinen erreichen.

**Der Druck ist trotzdem echt, und jetzt ist er eine Zahl.** Eine Stichprobe
alle zwei Sekunden über einen vollen Suitenlauf:

| | vitest-Prozesse | vitest-RSS | belegt gesamt | Dauer |
|---|---|---|---|---|
| ungebremst | 17 | 3,3 GB | **14,6 von 15,3 GB** | 399 s |
| auf vier gebremst | 6 | 1,6 GB | 14,0 GB | **396 s** |

Die Hälfte des Speichers, und **dieselbe Zeit**. Sechzehn Arbeiter bringen hier
nichts, weil `--workspace-concurrency=1` die Pakete ohnehin nacheinander fährt
und die meisten zu wenige Testdateien haben, um sechzehn zu beschäftigen.
Parallelität in der falschen Richtung, bezahlt mit 1,7 GB.

Die Grenze steht in `prepush.mjs`, in der Umgebung der Kindprozesse — nicht in
siebzehn Paketen und nicht in `package.json`: wie viel von *dieser* Maschine ein
Prüflauf nehmen darf, ist eine Eigenschaft der Maschine, und ein fremder Läufer
ist eine andere.

**Nachtrag, dieselbe Stunde: die Grenze allein reicht nicht.** Der fünfte
Abbruch kam mit ihr. Gemessen, warum: vor jedem Lauf sind schon **11,6 von
15,3 GB** belegt — PhpStorm 2,4, Android Studio 1,7, Chromium 1,1, die
Agentenprozesse gut ein GB. Es bleiben 3,7 GB, und die Suiten brauchen auch
gebremst 2,4. Der Unterschied liegt nicht am Verbrauch, sondern **am Ort**:
vier Läufe im Vordergrund sind durchgelaufen, fünf im Hintergrund wurden
gestoppt. Die ganze Kette danach im Vordergrund, grün: 144 s, 378 s, 399 s,
561 s. Damit ist auch die Arbeitergrenze nicht überflüssig — sie halbiert den
Speicher zum Nulltarif —, sie war nur nie die Ursache.

**Die Lehre ist unbequemer als der Fund.** Dieses Programm besteht darauf, dass
eine Eigenschaft erst dann wahr ist, wenn sie gemessen wurde — und ich habe die
Regel an allem angewandt außer an meinem eigenen Werkzeug. Vier Fassungen eines
Kommentars, jede vorsichtiger als die vorige, keine davon eine Messung. Regel 21
fürs Handbuch: **wer eine Zahl über sein eigenes Werkzeug viermal berichtigt,
hat dreimal nicht gemessen.** Ein Zähler ist keine Ursache.

**B220 — drei dokumentierte Knöpfe, die es nie gab (2026-09-19).** ADR 0104 S2
macht eine Einstellung einer Person in der Umgebung zu einem Defekt, und
`settings:check` hält die Klassifikation dagegen: jede `PICO_*`-Variable muss
in S5 einsortiert sein, und jede Zeile in S5 muss noch gelesen werden. Die
zweite Richtung ist die interessante — *„a stale row is a classification of
something that is gone; it reads as knowledge and is furniture"*, sagt der
Prüfer über sich selbst.

Er hat sich nicht daran gehalten, und zwar aus dem Grund, der in diesem Baum
schon einen eigenen Satz hat: **eine Regex ist kein Leser von Quelltext**
(B188). Beide Hälften suchten `\bPICO_[A-Z0-9_]+\b` im *Text* einer Datei.
Also zählte `PICO_RELAY_REQUEST_TIMEOUT_MS` als Umgebungseintrag — obwohl es
eine exportierte Konstante in `apps/relay/src/server.ts` ist, die keine
Bereitstellung setzen kann.

Gemessen, über den Syntaxbaum: das Relay liest **neun** Variablen aus der
Umgebung, die ADR nennt **zwölf**. Die drei zusätzlichen sind Zeitschranken —
genau die, die B219 gestern als Schranken vermessen hat. Seit dem 2026-08-24
verspricht das Dokument drei Knöpfe, die niemand drehen kann. Das ist das
Spiegelbild eines undokumentierten Knopfes und liest sich genauso wie Wissen.

Und die Prüfung hatte dasselbe Loch noch einmal, eine Schicht weiter draußen.
Ihre grüne Zeile sagte *„22 Home- und 12 Relay-Einträge, jeder klassifiziert"* —
wahr, und es liest sich, als wären das alle. Gemessen sind es **37**: 23 im
Kern, 9 im Relay und **fünf**, die nirgends klassifiziert waren —
`PICO_COMPANION_PROFILE`, `PICO_VAULT_HOME`, `PICO_FOUNDATION_DATA_PATH`,
`PICO_FOUNDATION_BACKUP_PATH` und `PICO_COMPANION_RELEASE_PROBE`. Das ist
derselbe Satz, den die ADR am 2026-08-24 schon einmal über sich selbst
geschrieben hat, diesmal über den Nachfolger dieser Korrektur.

Vier sind Orte auf einer Platte. Der fünfte bekommt ein eigenes Wort: ein
**Sondenschalter**. `PICO_COMPANION_RELEASE_PROBE` macht die Hülle für eine
Messung zum Instrument, und ihn einen Bereitstellungsparameter zu nennen würde
nahelegen, dass eine Betreiberin ihn in einem laufenden Haushalt setzt. Soll
sie nicht.

Der Prüfer liest jetzt **jede ausgelieferte Quelle** statt zweier benannter
Verzeichnisse, und die dritte Gruppe ist durch Ausschluss definiert — eine neue
App liegt an dem Tag darin, an dem sie geschrieben wird. Drei Schreibweisen
zählen als Lesen: `env.NAME`, `env['NAME']` und ein Helfer, der Umgebung und
Namen als Argumente nimmt.

Gepflanzt und gebissen: eine Zeile in die Klassifikation gesetzt, die niemand
liest; **dieselbe Zeile noch einmal, zusammen mit einer gleichnamigen Konstanten
im Relay** — was die alte Regex gerettet hätte und der Syntaxbaum nicht; und
eine echte `env`-Lesung in den Companion gesetzt, die niemand einsortiert hat.

Offen gelassen, weil es eine Produktfrage ist und keine Messung: ob die drei
Zeitschranken des Relays *werden* sollen, was sie zu sein versprachen. Heute
sagt das Dokument, was ist.

**B219 — ein Befund, dessen Gegenstand unter ihm weitergewachsen ist
(2026-09-19).** B78 hat am 2026-09-07 die Empfangsfristen der lauschenden
Flächen vermessen und dabei die schärfste Form dieser Krankheit gefunden: die
Foundation-Fläche hatte **keine** Empfangsfrist, nicht weil eine fehlte,
sondern weil Fastify `requestTimeout` auf `0` setzt. Wer den Rahmen nimmt,
verliert eine Grenze, die die Laufzeit mitbringt. Die Tabelle in B78 hatte
**drei Zeilen**, weil der Baum drei lauschende HTTP-Flächen hatte.

Er hat jetzt **sieben Lauscher**. ADR 0154 hat dem Relay zwei weitere gegeben
(Gesundheit, Betreiber), ADR 0110 dem Vault-Daemon einen Socket, und eine
Testvorrichtung öffnet einen eigenen. Der Test, den B78 hinterlassen hat, liest
die Werte am *laufenden* Foundation-Server ab — und weiss von den anderen
sechs nichts. Der Befund ist nicht gealtert, sein **Gegenstand** ist gewachsen.

Gemessen, Datei für Datei über den Syntaxbaum: fünf setzen alle vier Schranken,
zwei nicht. Und beide zu Recht — es ist heute kein Loch im Baum, sondern eine
Eigenschaft, die durch Aufmerksamkeit gilt und nicht durch Bauart. Genau das
war auch B94s Satz über `no-store`, und dort war die siebzehnte Antwort die
gefährliche.

**Welche Schranken einer schuldet, sagt sein Import und nicht sein Name.**
`createServer` aus `node:http` ist eine Anfragefläche und schuldet vier;
derselbe Name aus `node:net` ist ein Strom und schuldet eine Verbindungsgrenze
plus etwas, das ein Gespräch beendet, das nie anfängt. Der Vault-Daemon ist der
zweite Fall: AF_UNIX auf `0600`, `maxConnections = 16`, und ein
`HELLO_TIMEOUT_MS`, das den Socket zerstört, wenn kein Hallo kommt. Danach
bleibt eine Verbindung **absichtlich** offen, weil eine Lease und eine
entsperrte Sitzung an genau einer hängen.

**Eine begründete Ausnahme wird am Gegenstand geprüft, nicht geglaubt** (Regel
14). Der Daemon-Eintrag nennt `HELLO_TIMEOUT_MS` als das, was in der Datei
stehen bleiben muss; die Testvorrichtung ist ausgenommen, solange **keine
ausgelieferte Quelle sie importiert** — was das Tor selbst nachsieht, statt es
ihrem Kommentar zu glauben.

Und dieser Kommentar war falsch. Er sagte *„Nothing ships this"*. Gemessen:
`tsc` baut die Datei nach `apps/core/dist`, und `docker/home.Dockerfile` kopiert
den ganzen Bau ins Abbild — sie **wird** ausgeliefert. Harmlos ist sie, weil
nichts sie importiert und also nichts sie startet; das ist ein anderer Satz,
und seit heute eine Regel statt einer Gewohnheit.

Gepflanzt und gebissen: zwei Schranken aus dem Gesundheitslauscher des Relays
genommen, `HELLO_TIMEOUT_MS` im Daemon umbenannt, und `app.ts` die
Testvorrichtung importieren lassen.

**B218 — neun Wörter und dreizehn Adressen, die erst beim Tag falsch werden
(2026-09-19).** Die Container-Rauchtests sind die einzige Stelle, an der
irgendetwas die gebauten Abbilder wirklich fährt. Sie entscheiden, was sie
gesehen haben, indem sie ihre Ausgabe nach Zeichenketten durchsuchen: ein
Dashboard-Titel, ein Dienstname, drei Ereignisse aus dem Startprotokoll. Jede
davon ist eine Wahrheit, zweimal geschrieben — einmal in
`.github/workflows/ci.yml`, einmal in einer Quelldatei —, und nichts hat die
beiden je zusammengehalten.

Es ist schon einmal schiefgegangen, und der Arbeitsablauf sagt es im eigenen
Kommentar: eine Zeile, auf die der Job wartete, wanderte auf einen späteren
Start, *„which is a check that could not pass and read as a broken image for
two days"*.

**Seit dem 2026-09-18 ist es schlimmer, durch meine eigene Änderung.** Der Job
läuft nicht mehr bei jedem Push, sondern auf einen Release-Tag und auf einen
Knopf (B211/B212). Eine abgedriftete Zeichenkette fiel früher beim nächsten
Push auf, während derjenige, der umbenannt hatte, noch hinsah. Jetzt fällt sie
am Tag auf — auf dem einen Job, den niemand billig noch einmal fährt.

Gemessen: **neun** Suchen nach Zeichenketten und **dreizehn** Adressen, die der
Job anruft. Alle stimmen heute; der Fund ist nicht eine Abweichung, sondern
dass es keine gab, die eine hätte finden können.

`smoke:check` liest beides **aus dem Arbeitsablauf heraus statt aus einer Liste
daneben** — eine Liste hier wäre die dritte Abschrift derselben Wahrheit. Eine
Suchform, die der Leser nicht versteht, **fällt**, statt übersprungen zu
werden: ein Wortschatz, der still wächst, hört auf, einer zu sein. Vier der
neun stehen wörtlich in einer ausgelieferten Quelle, fünf über jedes Wort, das
sie nennen (`"service":"pico-home-core"` steht im Quelltext als
`service: 'pico-home-core'`, und eine Prüfung auf die JSON-Schreibweise wäre
eine Prüfung auf nichts).

Die zweite Hälfte hat sich bezahlt gemacht, wie schon bei B216: `/operator/claim`
steht in **keiner** App, sondern in `packages/protocol` — wer nur in `apps/`
gesucht hätte, hätte die Route für verschwunden gehalten. Und `/nothing-here`
ist der umgekehrte Fall und **geprüft statt geglaubt**: der Job ruft sie an,
*damit* sie wie nichts antwortet (ADR 0153 PK3), also muss sie abwesend
bleiben. Baut jemand eine Route dieses Namens, hört der Vergleich zwischen
unbekannter Route und `/health` auf, etwas zu beweisen — und fällt hier, statt
dort durchzugehen.

Gepflanzt und gebissen: ein Ereignis im Arbeitsablauf umbenannt, eine Adresse
auf eine nicht bediente gelegt, eine Suchform in ein `$(printf …)` gepackt.

**Was dieses Tor nicht hält**, gehört dazugesagt. Die Rauchtests behaupten
mehr: einen Statuscode 401 ohne Token, `b.status === 'ok'` aus der
Gesundheitsantwort des Relays, `typeof body.credential === 'string'` aus der
Übernahme. Feldnamen wie `status` und `credential` kommen in diesem Baum
hundertfach vor; eine Regel darüber könnte nie fallen, und eine Prüfung, die
nicht fallen kann, ist schlechter als keine — das ist B166s Satz, und er gilt
auch für die Regeln, die ich *nicht* schreibe.

**B217 — dasselbe Argument stand schon im Haus, eine Tuer weiter
(2026-09-18).** `pico_home/config.yaml` richtet den Wachhund des Supervisors
auf `http://[HOST]:[PORT:3100]/health`. Diese eine Route entscheidet also, ob
das Add-on weiterlaufen darf. Sie sah so aus:

    app.get('/health', async () => ({ ok: true, service: 'pico-home-core', deviceId }));

Eine Konstante. Sie beantwortet genau eine Frage — *laeuft der Prozess?* — und
das ist die Frage, deren Antwort man schon hat, wenn man die Verbindung
aufbauen konnte. Ein Home, dessen Lauscher steht und dessen Speicher weg,
schreibgeschuetzt oder geschlossen ist, sagt `ok: true`, und der Wachhund
schweigt.

Die zweite Haelfte ist die schlimmere. Der Haken, der das Gleichzeitigkeitsbudget
der Foundation-API zieht, ist **ohne Routenfilter** gesetzt, also zog `/health`
daraus mit. Gemessen mit einem Budget von eins und einer gehaltenen Anfrage:
`/health` antwortet **503**. Auf einem echten Home heisst das, dass gewoehnlicher
Verkehr den Platz ausgibt, von dem die Neustart-Entscheidung des Supervisors
abhaengt — je beschaeftigter ein Home, desto wahrscheinlicher der Neustart. Das
ist die Umkehrung dessen, wofuer ein Wachhund da ist.

**Beides war in diesem Repository schon entschieden — vom Relay.**
`apps/relay/src/health.ts` steht seit ADR 0153 da und sagt es wortwoertlich:
*„It asks the store rather than the event loop. A health check that answers
because the process is running answers yes to the one failure that matters
here."* Und es hat einen **eigenen Lauscher** auf einem eigenen Port mit
`maxConnections = 16`. Dazu sagt `concurrency-cap.ts` im Kern schon das
Trennargument: zwei Flaechen, zwei Zaehler, damit die eine die andere nicht
aushungert. Beide Saetze hatten den Wachhund nur nie als dritte Flaeche
gesehen.

Gebaut: `apps/core/src/health.ts`, mit der Route, ihrer Sonde und ihrem eigenen
Deckel an einem Ort — das erste Stueck von P8, das nicht aus einer Zerlegung
kam, sondern aus einer Frage. `EventStore.probe()` liest eine Tabelle, die klein
bleibt (`pico_home_founding_record`, ein Satz pro Home); `COUNT(*)` auf dem
Ereignislog waere die falsche Form gewesen, weil eine Pruefung, deren Kosten mit
den Daten wachsen, eine Pruefung ist, die man irgendwann abstellt. Der grosse
Deckel laesst `PICO_HEALTH_PATH` durch, weil die Route ihren eigenen hat: ganz
ohne Schranke waere sie der einzige unbegrenzte Pfad auf einer erreichbaren
Flaeche.

Drei Netze, fuenf Pflanzungen, alle gebissen. Ohne die Ausnahme im grossen
Deckel faellt der Wachhund-Test mit `expected 503 to be 200`; mit einer Sonde,
die nichts fragt, faellt er mit `expected 200 to be 503`; mit einer `probe()`,
die nur `return` sagt, faellt der Store-Test. Dazu die neue Regel in
`addon:check`: der Pfad in `watchdog:` kommt aus der **Konstanten**, die die
Route registriert, ueber den Syntaxbaum gelesen — ein umbenanntes `/health`
haette sonst in der YAML weitergestanden, der Wachhund haette 404 gelesen und
ein gesundes Home im Kreis neu gestartet. Der Port dazu muss in `ports:`
erklaert sein.

Und ein verjaehrter Satz, gefunden von Regel 19: `measure-route-walk.mjs`
erklaerte, `/health` komme „aus einem Plugin". Es stand die ganze Zeit als
`app.get` in `app.ts`, wo `servedRoutes()` es fand. Seit heute stimmt der Satz —
aus einem anderen Grund, und das ist kein Grund, ihn stehen zu lassen.

**Was die Sonde nicht sieht**, gehoert dazugesagt: eine Seite, die sie nie
anfasst, kann verdorben sein, und keine bezahlbare Sonde saehe alle. Sie sieht,
was ein Wachhund sehen soll — eine Datenbank, die nicht mehr antwortet.

**B216 — drei Nachbarn waren entschieden, sieben fuhren einfach mit
(2026-09-18).** `pico_home/config.yaml` schließt drei Verzeichnisse von den
Sicherungen des Supervisors aus und schreibt zu jedem hin, warum: die beiden
Schlüsselspeicher (ADR 0072 R6) und den Wiederherstellungsanker (ADR 0110 R6).
Drei gute Sätze. Die Frage, die keiner von ihnen beantwortet, ist: **wie viele
gibt es zu entscheiden?**

Gemessen: zehn. Der Kern legt neben seine Datenbank die beiden
Schlüsselspeicher, den Anker, sein eigenes Sicherungsverzeichnis, die
Depot-Arbeitskopien, den Lieferanten-Kratzplatz und drei Markendateien. Drei
davon waren entschieden. Die anderen **sieben fuhren in jeder Sicherung mit**,
nicht weil jemand das wollte, sondern weil nie jemand nachgesehen hat.

Die schärfste Hälfte sind die drei Marken. `home-reset`,
`recovery-anchor-reseed` und `operator-reset` sind Dateien, die eine Person von
Hand anlegt, damit der nächste Start **einmal** etwas tut — den Home
zurücksetzen, den Anker neu säen, die Betreiberkennung vergessen. Der Code sagt
den Grund selbst: *„consumed on read so a reset happens once rather than on
every restart"*. Eine Marke, die in eine Sicherung wandert, kommt beim
Zurückspielen zurück, und der einmalige Akt geschieht ein zweites Mal, auf
einem Start, den niemand damit verbunden hat. Das ist wörtlich die Begründung,
die für `recovery-anchor` ein Verzeichnis weiter schon dasteht — sie galt nur
nie für die Nachbarn.

Die anderen vier sind leiser und nicht falsch: `backups` sind ganze Kopien der
Datenbank (heute keine, weil keine Migration `requiresBackup` trägt, und nichts
räumt sie je auf), `depots` sind nachladbare fremde Historie, `scratch` sagt es
im Namen. Alle drei hätten die Sicherung wachsen lassen mit Dingen, die das
Zurückspielen nicht braucht.

**Das Messgerät fragt zweimal, und die zweite Frage hat sich sofort bezahlt
gemacht.** `check-data-neighbours.mjs` lädt für jedes Add-on die Konfiguration
mit dem Datenpfad, den sein Dockerfile setzt, und liest zurück, was das Produkt
unter `/data` legt. Dann liest es dieselbe Menge noch einmal aus dem
Syntaxbaum: jedes `join(dirname(…databasePath), …)` der App, über den AST und
nicht über eine Regex (B188). Die beiden waren beim ersten Lauf **uneins** —
das Relay baut seine `operator-reset`-Marke im Einstiegspunkt zusammen, also
kennt keine geladene Konfiguration sie, und eine Prüfung, die nur das Produkt
fragt, hätte dieses Add-on für vollständig erklärt. `pico_relay/config.yaml`
hatte überhaupt keine Ausschlussliste.

Gepflanzt und gebissen: `depots` aus der Liste genommen (der Nachbar ist
unentschieden), einen neuen `join(dirname(databasePath), 'stray')` in den
Quelltext gesetzt (die Quelle nennt etwas, das das Produkt nicht nennt), und
`PICO_DATABASE_PATH` im Dockerfile umbenannt (wo die Daten liegen, ist
unbekannt). Dazu ein vierter Schnitt am Produkt: das `rmSync` der Relay-Marke
entfernt — der neue Prozesstest fällt beim dritten Start, weil die Marke ein
zweites Mal gilt.

Mitgenommen, weil es dazugehört: die Relay-Marke heißt jetzt
`picoRelayOperatorResetMarkerPath` statt eines `join` mitten im Einstieg, und
der Fluchtweg aus einer verlorenen Betreiberkennung (ADR 0154 RO8) wird zum
ersten Mal gegangen — drei Starts gegen dieselbe Datenbank: claimen, Marke
legen, neu claimen, und der dritte Start behält, was der zweite gesetzt hat.
`pico_home/DOCS.md` und `docs/release/upgrade-contract.md` sagten beide noch
die alte, kürzere Wahrheit über `backup_exclude`; Regel 19 hat sie gefunden.

**Regel 20 für das Handbuch: wer misst, was ein Programm neben seine Daten
legt, fragt den Lauf *und* den Quelltext.** Der Lauf kennt nur, was durch eine
Konfiguration geht; der Quelltext kennt auch, was ein Einstiegspunkt sich
selbst zusammenbaut. Hier war genau ein Pfad nur im zweiten sichtbar, und es
war der eines ganzen Add-ons.

**B215 — ein Tor, das grün war, weil es nie etwas zu sagen hatte
(2026-09-18).** B214 endete an `narrowToOwner`, dem geprüften Helfer für
Dateirechte. Beim Hinsehen fiel auf: **er steht zweimal im Baum.**
`database-file-mode.ts` liegt in `apps/core/src` und in `apps/relay/src`, mit
Zeichen für Zeichen **identischem Code** und je eigenem Kommentar — der Kern
zitiert ADR 0071, das Relay seinen eigenen gegangenen Fall aus B120.

**Die Doppelung ist gewollt**: zwei Anwendungen, keine gemeinsame Abhängigkeit,
und ein Dateirechte-Helfer gehört nicht ins Protokoll. **Die Prüfung war es
nicht.** Drei Tests halten die Kernfassung — verengt nur, weitet nie, nimmt
auch `-wal` und `-shm` mit —, und die Relay-Fassung hatte **keinen einzigen**.
Genau B213s Gestalt: eine Abschrift, die das Verhalten trägt und den Beweis
nicht.

**Gebaut: die Gleichheit halten, statt 81 Zeilen Test abzuschreiben.** Solange
beide Fassungen denselben Code tragen, gilt der Beweis der einen für die
andere; läuft eine fort, fällt der Schritt und sagt, welche. Kommentare bleiben
ausgenommen — jede Fassung soll ihren eigenen Fall erzählen.

**Und jetzt der Teil, der diesen Befund verdient.** Die erste Fassung der Regel
war **grün und kaputt.** Sie schrieb in eine Liste namens `failures`, die es in
diesem Skript nicht gibt — es heißt `errors` —, und sie stand hinter dem
`process.exit`, das die Meldungen ausgibt. Solange die beiden Dateien
übereinstimmten, lief sie durch und meldete „bestanden". Erst die Pflanzung
brachte es heraus, und auch da nicht als Meldung, sondern als
`ReferenceError: failures is not defined`.

Ein Tor, dessen Fehlerweg nie gegangen wurde, ist kein Tor. Es ist eine Zeile,
die „bestanden" sagt, weil sie nichts zu sagen hatte — **B166 in meiner eigenen
Arbeit, eine Stunde nachdem ich denselben Satz über fremde geschrieben habe.**

**Die Lehre ist nicht neu, sondern bezahlt:** die Pflanzung ist nicht die
Zeremonie am Ende, sondern der einzige Beweis, dass ein Prüfer überhaupt
spricht. Ein grüner Lauf beweist von einem neuen Tor **gar nichts** — er
beweist nur, dass der Gegenstand heute in Ordnung ist, und das war er auch
vorher schon.

**Nachgetragen, weil der Baum es besser gesagt hat als ich.** Die Frage, ob ein
Tor wie dieses nicht maschinell zu fangen wäre, führt zu
`check-vacuous-gates.mjs` — und das benennt die Grenze selbst: *„A check that
reads a file it names and dies because the file is not there fails closed …
and this cannot tell that apart from a guard. Proving that a check guards
rather than crashes is **the job of the plant beside it**, in the check's own
file."* Mein kaputtes Tor wäre also dort durchgelaufen, und das ist kein
Versäumnis jenes Prüfers, sondern seine ausgesprochene Arbeitsteilung. Die
Praxis, jedes Tor zu pflanzen, **ist** die entworfene Antwort auf genau diese
Lücke — und ich hätte sie hier beinahe übersprungen.

**B214 — derselbe Fehler wie B121, im Kern statt im Companion (2026-09-18).**
B213 legte vier Abschriften der atomaren Schreibfolge zusammen und endete mit
dem Satz, eine Abschrift sei gefährlich, wenn sie die **Prüfung** nicht miterbt.
Die naheliegende Anschlussfrage: wo steht diese Folge sonst noch?

**Gemessen über Kern, Relay und Vault-Daemon: zwei Stellen.**
`sqlite-backup.ts` ist gedeckt — sie ruft `narrowToOwner`, den geprüften Helfer
aus `database-file-mode.ts`. Die andere ist `recovery-anchor.ts`, und dort
**fehlte die Verengung ganz.**

**Was das heißt, und es ist B121s Messung wörtlich:** `mode` in `writeFileSync`
gilt **nur beim Anlegen**. Öffnet es eine `.tmp` von einem abgestürzten
Vorlauf, bleiben deren Rechte stehen, und das Umbenennen trägt sie auf das
Ziel. Unter `umask 022` wäre das eine `0644`-Datei.

**Und es ist nicht irgendeine Datei.** Der Wiederherstellungsanker hält den
Zeitboden der Einspruchsfenster (ADR 0120 N2, gegangen in B206), den
Plattformzählerstand gegen Rückrollen (B200/B201) und die Auditprüfpunkte.

**Was den Fall heute auffing** — und warum das kein Grund ist, ihn zu lassen:
das Verzeichnis wird `0700` angelegt. Aber `mkdirSync`s `mode` gilt ebenfalls
nur beim Anlegen, und zwei Zeilen neben dem Helfer steht der Satz dazu: *„a
protection that holds by accident holds until somebody installs the thing
differently, mounts a volume, or restores a backup."* Genau diese drei Fälle
sind die, in denen ein Verzeichnis schon existiert.

**Kein Test prüfte die Rechte des Ankers.** Null Zusicherungen über seinen
Modus in beiden Ankertestdateien.

**Getan: `narrowToOwner(temporaryPath)` vor dem fsync**, also der geprüfte
Helfer statt eines eigenen `chmodSync` — B213s Lehre an der Stelle angewandt,
die sie gefunden hat. Dazu ein Test, der eine **offene Zwischendatei hinlegt**,
bevor der Anker schreibt; ein Test, der nur „die Datei ist 0600" prüft, bestünde
auch ohne die Verengung, und genau das hat B121 an der eigenen Pflanzung
gemessen.

**Zwei Pflanzungen, und die zweite ist die ehrlichere Auskunft.** Ohne die
Verengung fällt der Test mit `420` gegen `384` — `0o644` gegen `0o600`. Verengt
man dagegen **nach** dem Umbenennen statt davor, besteht er: das Ergebnis
stimmt, und mein Test sieht das kurze Fenster nicht, in dem das Ziel schon
offen dasteht. Die Reihenfolge ist trotzdem die strengere Wahl, und sie steht
im Kommentar - ein Netz, das eine Ordnung nicht prüfen kann, ist ein Grund, sie
aufzuschreiben, und keiner, sie beliebig zu lassen.

**Die Lehre**, und sie schließt an B207 an: dort trug die **Reihenfolge** zweier
Prüfungen die Sicherheit, hier trägt sie ein Verzeichnis, das zufällig eng
angelegt wurde. Beide Male hält etwas, und beide Male hält es aus einem Grund,
den niemand gewählt hat. **Eine Verteidigung, die man nicht benennen kann, ist
noch keine.**

**B213 — fünf Abschriften einer Folge, und nur das Original war geprüft
(2026-09-18).** B203 fand Bytes, die eine Löschung in der SQLite des Homes
überlebten. Dieselbe Frage einen Prozess weiter: **was schreibt und löscht der
Companion, und was hält das?**

**Das Löschen ist vier schlichte `unlinkSync`** — Postfachbuch, Erholungsstand,
Erstlaufjournal, offene Antworten. Kein Überschreiben, was auf einem modernen
Dateisystem auch nichts brächte; ADR 0072 hedged für die Schlüsseldateien
ehrlich mit *„best-effort file and directory sync"*. Hier ist kein Fund.

**Beim Schreiben stand einer.** Befund B121 hat am 2026-09-10
`writePicoCompanionFileAtomically` gebaut, und sein Kommentar erklärt die
teuerste Zeile darin: `chmodSync` neben dem `mode`. Der Grund ist nicht die
umask — *„gemessen stimmt sie für diesen Wert nicht"* —, sondern dass `mode`
**nur beim Anlegen** gilt. Nach einem Absturz liegt eine `.tmp` von vorher da,
`writeFileSync` öffnet sie, lässt ihre Rechte wie sie sind, und das Umbenennen
trägt sie auf das Ziel. Aufgefallen ist das, weil die Pflanzung *„`chmodSync`
weg"* zuerst **nicht feuerte.**

**Gemessen: die Folge stand fünfmal im Baum.** Zwei Dateien benutzen den
Helfer (`profile.ts`, `reader-custody-space.ts`), vier schreiben sie von
Hand - und zwar Zeile für Zeile dieselbe: `mkdir 0700`, `.tmp` mit `0600`,
`chmodSync`, fsync, umbenennen, Verzeichnis-fsync. Kein Abschriftfehler; alle
vier hatten das `chmodSync`.

**Der Fund ist, was sie hielt.** Nur der Test des Helfers kennt den Fall der
liegengebliebenen Zwischendatei:

| Datei | Faelle mit `.tmp` im Test |
|---|---|
| `atomic-file.test.ts` | **6** |
| `link-mailbox`, `pending-reply` | 1 |
| `recovery-state`, `first-run-journal`, `profile`, `reader-custody-space` | 0 |

Die vier Handfassungen haben Moduszusicherungen — aber die **leichte**: „die
geschriebene Datei ist 0600". Genau die besteht auch ohne `chmodSync`, und
genau das hat B121 an der eigenen Pflanzung gemessen. Die teure Eigenschaft
stand also viermal von Hand da und war von **nichts** gehalten; der Test, der
sie hält, prüfte eine Implementierung, die diese vier nicht benutzten.

**Getan: die vier benutzen jetzt den Helfer.** 48 Zeilen weniger, 8 mehr, die
vierzig Tests der betroffenen Suiten unverändert grün, und `noUnusedLocals`
hat beim Aufräumen jede tote Einfuhr benannt - das Werkzeug aus B178 bis B180
an genau der Stelle, für die es da ist.

**Was das kauft, gemessen:** die Pflanzung *„`chmodSync` aus dem Helfer"* lässt
weiterhin genau einen Test fallen. Die Zahl ändert sich nicht - **die Zahl der
Schreiber hinter diesem Test ändert sich**, von zwei auf sechs. Ein Netz wird
nicht dadurch besser, dass mehr Tests fallen, sondern dadurch, dass mehr Code
dahinter liegt.

**Die Lehre.** Eine Abschrift ist nicht dann gefährlich, wenn sie falsch ist -
diese vier waren richtig -, sondern wenn sie **die Prüfung nicht miterbt**. Der
Helfer trug seinen Beweis; die Abschriften trugen nur das Verhalten. Das ist
*„eine Wahrheit, zweimal geschrieben, driftet"* mit einem Zusatz: sie driftet
auch dann, wenn beide Fassungen heute stimmen, weil nur eine gehalten wird.

**B212 — der erste verjährte Satz, den ich selbst erzeugt habe (2026-09-18).**
Diese Runde hat sieben Sätze berichtigt, die einmal wahr waren und es
irgendwann nicht mehr waren. Alle sieben stammten von früher. Dann habe ich den
CI-Auslöser umgestellt — und damit selbst einen achten erzeugt.

**Die Änderung**: auf Nutzerentscheidung läuft der Ablauf nicht mehr bei jedem
Push und bei jedem Pull Request, sondern auf Knopfdruck und bei `v*`-Tags.
Vorher waren das sieben bezahlte Jobs je Push.

**Die Jagd danach, sofort und mit demselben Werkzeug wie den ganzen Tag**: alle
verzeichneten Markdown-Dateien nach Sätzen durchsucht, die den alten Auslöser
behaupten. Genau einer, in ADR 0122: *„CI builds on every push to `main` and on
`v*` tags."* Berichtigt, mit der Geschichte daneben statt an ihrer Stelle.

**Und einer, den ich stehengelassen habe.** Die Matrixzeile zu 0122 sagt, der
Ablauf melde eine übersprungene Attestierung in der Zusammenfassung, *„rather
than failing every push"*. Das beschreibt, was er tut, **wenn** er läuft, nicht
**wann** — daran ist nichts falsch geworden. Einen Satz zu berichtigen, der
stimmt, ist keine Sorgfalt, sondern Rauschen.

**Warum das eine Nummer wert ist**, obwohl es eine Zeile ist: es ist der erste
Fall in dieser Reihe, in dem der verjährte Satz **nicht geerbt, sondern erzeugt**
wurde — und zwar von jemandem, der den ganzen Tag nichts anderes getan hat, als
solche Sätze zu suchen. Das ist keine Nachlässigkeit, sondern die Normalform:
wer etwas ändert, erzeugt Sätze, die nicht mitkommen, und merkt es nicht,
**weil er gerade woanders hinsieht**.

Die Folgerung ist billig und gehört ins Runbook: **nach einer Änderung an einer
Einrichtung sofort die Sätze über sie suchen** — nicht irgendwann, sondern in
derselben Runde, solange man noch weiß, was man geändert hat. Eine Stunde später
wäre dieser Satz Teil des Bestandes gewesen, und jemand hätte ihn in drei
Wochen als Fund aufgeschrieben.

**B211 — dieselbe Krankheit, eine Datei weiter (2026-09-18).** Regel 18 hat
diese Runde viermal gespart und einmal etwas gefunden. Die Frage war: **jedes
Tor dieses Baums liest `.ts` — was steht in den anderen Sprachen?**

**Gemessen: 19 Java-Dateien unter `tools/android-runtime-probe`**, und von den
Toren lesen vierundzwanzig `.ts`, fünf `.mjs`, keines etwas unter `tools/`.
Vierzehn protokollförmige Zeichenketten stehen im Java, und keine davon kennt
das TypeScript.

**Die meisten zu Recht.** `pico_unlock_secret_v1` ist ein Keystore-Alias, den
ADR 0131 beschreibt und der in Java gehört; `pico_a1`, `pico_probe_tee` und die
übrigen sind Namen der Sonde selbst. Und für die Namen, die **beide** Sprachen
kennen müssen — Sicherheitsniveaus und Attestierungswurzeln — gibt es längst
ein Tor, `check-android-keystore-names.mjs`, geboren aus einem echten
Auseinanderlaufen: die Sonde nannte die EC-Wurzel `google_ec_ca1`, der Kern
erwartete `google_ec_key_attestation_ca1`, und die Ablehnung dafür heißt
`platform_keystore_attestation_unrooted` — *„die Kette erreichte keine gepinnte
Wurzel"*, obwohl sie es hatte.

**Aber dieses Tor liest ein Dateipaar, und daneben liegt ein zweites.** Über
denselben AF_UNIX-Socket, den ADR 0131 A3 beschreibt, reden `KeystorePort.java`
und `apk/keystore-port.mjs` in **drei Verben**: `evidence`, `seal`, `open`. Der
Java-Server beantwortet sie in einer `equals`-Kette, das Modul schickt sie als
Zeichenketten — zwei Sprachen, ein Vokabular, **und kein Prüfer las eine der
beiden Dateien.**

Der Kopf des Nachbartors sagt den Satz selbst: *„Eine Wahrheit, die zweimal
geschrieben steht, driftet."* Eine Datei weiter stand dieselbe Wahrheit
ungeschützt.

**Gemessen stimmen sie heute überein**, und das ist der Punkt: das ist der
Zeitpunkt, an dem man ein Tor baut, und nicht der, an dem man eines braucht.
Die Erweiterung steht im selben Tor statt in einem neuen, weil es dieselbe
Regel ist — verglichen wird die **Menge**, in beide Richtungen: ein Verb, das
nur der Server kennt, ist eine Tür, die niemand öffnet; eines, das nur der
Klient schickt, ist eine Frage ohne Antwort.

Drei Pflanzungen, drei Meldungen: ein umbenanntes Verb beim Klienten, eines
beim Server, und ein Port, der ganz anders heißt — den fängt die Wache gegen
den leeren Vergleich, denn *„entweder heißt der Port anders, oder dieser
Vergleich lief über nichts"* (B166s Idiom).

**Was ich gemessen und nicht gebaut habe.** Die Java-Seite nennt sechs
Ablehnungen — `sealed_too_short`, `unexpected_iv_length`, `witness_key_absent`
und drei Feldfehler —, die der Klient nie erwähnt; er hat stattdessen ein
`unnamed`. Das ist **keine** Drift derselben Art: eine Ablehnung reist vom
Server zum Klienten, und ein Klient, der sie durchreicht statt sie zu kennen,
ist eine vertretbare Bauart. Sie zu erzwingen hieße, eine Liste zu fordern, wo
eine Durchreiche genügt. Aufgeschrieben, damit die nächste Runde sie nicht für
eine Lücke hält.

**Die Lehre**, und sie ist Regel 18 von der anderen Seite: das Verzeichnis
sagte mir viermal, dass meine Vermutung schon eine Nummer hat. Beim fünften Mal
sagte es nichts — **und genau dort lag etwas.** Ein gepflegtes Verzeichnis ist
kein Grund, nicht zu suchen; es ist der Filter, der die Suche bezahlbar macht.

**B210 — ein Messgerät gebaut, widerlegt und weggelegt (2026-09-18).** Dieser
Befund hat wenig über den Baum zu sagen und viel über das Suchen darin. Er
steht hier, weil das Weglegen sonst niemand aufschreibt.

**Das Negativ zuerst, denn es ist demonstriert.** Ein Relay wird von jemand
anderem betrieben; was seine Protokolle tragen, ist deshalb keine Feinheit.
Gemessen: das Relay schreibt **zehn** Zeilen — sechs beim Starten und Beenden,
vier im Betrieb —, und keine trägt eine Mailboxadresse. Die Anfragebehandlung
reicht ausdrücklich **nur einen snake_case-Namen** durch, mit dem Grund
daneben: *„eine freie Fehlermeldung trägt Pfade, Adressen und Werte."*
Gepflanzt: eine Mailboxadresse in genau diese Zeile fällt mit Datei, Zeile und
Senkenklasse — *„a relay mailbox address must not reach a logger handed in as a
function."*

**Dreimal hatte der Baum meine Vermutung schon beantwortet.** Ich hielt die
Senkenform `options.log?.(` für unbewacht — Befund **B81** hat sie nachgetragen
und nennt dabei genau meine drei Beispiele. Ich hielt die Adressregel für
ungesagt — sie ist ADR 0148 EX4. Ich hielt das Durchreichen freier
Fehlermeldungen für unbemerkt — der Kommentar an der Stelle verbietet es und
begründet es. Jede dieser Vermutungen kostete mehrere Messungen, die ein Blick
ins Verzeichnis erspart hätte. Daraus **Runbook-Regel 18**.

**Und dann das Gerät, das ich gebaut habe, um genau das zu vermeiden.** Die
Frage klang gut: *welche Produktdateien hat noch nie ein Befund genannt?* Das
wäre eine Karte der blinden Flecken. Gemessen: **131 von 262.** Einmal
verfeinert — zählt auch, wenn die Datei selbst eine Befundnummer zitiert, denn
dieser Baum schreibt sie hinein — blieben **119**.

**Die ersten beiden Stichproben haben es widerlegt.**
`apps/companion/src/atomic-file.ts` steht auf der Liste und ist der Gegenstand
von Befund B121, was die Datei in ihrem eigenen Kopf sagt — nur nennt der
Befund `profile.ts` und das Verhalten, nicht ihren Namen.
`packages/gesture` steht mit vier Dateien darauf, und `Roadmap.md` nennt das
Paket **achtmal**, ADR 0124 führt es als `not implemented`, zwei Torskripte
tragen eine Notiz dazu.

**Also ist „nie genannt" hier kein Ersatz für „nie gemessen".** Befunde in
diesem Baum benennen **Verhalten und Pakete**, nicht Dateien — das ist gute
Prosa und ein schlechtes Merkmal. Die 119 sind eine Obergrenze, aus der man
einzelne Spuren ziehen kann, und keine Liste von Lücken. Ich habe sie nicht
weiter ausgebeutet.

**Die Lehre**, und sie ist die unbequeme Schwester von Regel 17: ein
Messgerät, das in eine Richtung nichts beweist, ist gerichtet; eines, dessen
**erste zwei Stichproben** es widerlegen, ist kaputt. Der Unterschied ist, ob
man die Stichprobe zieht. Eine Liste mit 119 Einträgen sieht wie Arbeit aus,
und genau deshalb wäre sie hier ein Befund geworden, den niemand geprüft hätte.

**B209 — der Satz nannte einen Ort, an dem niemand nachgesehen hatte
(2026-09-18).** B208 maß die Umgebung **eines** externen Programms. Die Frage
gilt für alle: was startet dieses Produkt, und was gibt es mit?

**Fünf Aufrufe, und sie zerfallen sauber.**

| Aufruf | Programm | Umgebung |
|---|---|---|
| `depot-fetch.ts` | `git` | verengt, mit Satz (B208) |
| `supplier-host.ts` | Node-Runner | **nur `PATH`**, mit ADR 0143 DP3 daneben |
| `linux-print.ts` | `lp` | vollständig geerbt |
| `notify.ts` | `notify-send` | vollständig geerbt |
| `main.ts` | sich selbst | geerbt, absichtlich |

Das Erben ist bei den beiden Desktop-Integrationen **richtig** — `notify-send`
braucht den Sitzungsbus, `lp` die Druckerkonfiguration. Nur steht es nirgends,
während die beiden anderen ihre Verengung ausdrücklich begründen.

**Und beim Drucken hängt daran etwas.** Wohin die Wiederherstellungskarte geht,
entscheidet genau diese geerbte Umgebung: `PRINTER`, `LPDEST`, `CUPS_SERVER`.
Der Weg gab aber die **feste Zeichenkette** `'default printer'` zurück, und
`stdout` stand auf `'ignore'` — der Bericht von `lp`, in dem das Ziel steht,
wurde weggeworfen.

Diese Zeichenkette erreicht eine Person:

> *Pico sent the folded A4 card for … to the **default printer**. Print and
> laminate it now, keep the Card PIN elsewhere, and never photograph the secret
> side.*

**Der sorgfältigste Satz dieses Produkts, und das ungeprüfte Wort steht mitten
darin.** Daneben drei Warnungen, die jemand durchdacht hat — und ein bestimmter
Artikel, der Wissen behauptet, das niemand hatte.

**Gemessen statt vermutet.** `lp`s Handbuch führt `-s` als *„Do not report the
resulting job IDs (silent mode)"* — der Bericht ist also voreingestellt an, und
eine CUPS-Auftragskennung trägt das Ziel im Namen. Daneben nennt `lpstat -d`
das Ziel, ohne zu drucken; auf dieser Maschine sagt es „keine
systemvoreingestellten Ziele".

**Getan:** `stdout` wird gelesen, das Ziel aus der Auftragskennung genommen —
von hinten getrennt, weil ein Druckername Bindestriche tragen darf — und was
sich **nicht** lesen lässt, wird nicht geraten: dann sagt der Satz, das System
habe gewählt, und nennt kein Ziel. Zwei Pflanzungen: die feste Zeichenkette
zurück, und ein Muster, das statt zu verweigern einen Namen erfindet.

**Die Lehre ist B196 in einem Satz für Menschen.** Dort war ein verjährter Satz
ein richtiger Name mit einem falschen Verb; hier ist es ein richtiges
Hauptwort — „printer" stimmt — mit einem **bestimmten Artikel**, der eine
Tatsache behauptet. Und die unbequeme Hälfte: Sorgfalt im *Inhalt* ist nicht
Sorgfalt in den *Tatsachen*. Wer drei Warnungen über die Geheimseite schreibt,
hat damit nicht nachgesehen, wohin das Blatt geht.

**B208 — die Adresse, die ein Depot nennt, ist nicht die, von der geholt wird
(2026-09-18).** Ein Depot ist die einzige Wirkung in diesem Baum, die **Code
installiert** (ADR 0139 AC1). Beide Reichweitenentscheidungen stehen
voreingestellt auf aus, der Abruf ist `execFileSync` ohne Shell, holt einen
Commit statt eines Zweignamens, hat eine Zeitgrenze — und eine ausdrücklich
verengte Umgebung:

    PATH, HOME, GIT_TERMINAL_PROMPT=0, GIT_CONFIG_NOSYSTEM=1, GIT_ADVICE=0

Der Kommentar daneben sagt, `git` bekomme *„what it needs to run and nothing
about this process"*.

**Auch die Adresse ist begrenzt**, und gut begründet: `picoDepotRemotePattern`
lässt nur `https://`, `ssh://`, `file://` und `git@` zu. Damit ist `ext::`
ausgeschlossen — der git-Transport, der einen Befehl ausführt. Und ein blanker
Pfad ist ausdrücklich verboten, mit diesem Satz: *„a remote is an **address** …
pretending otherwise would let a rename silently redirect what executes."*

**Genau das tut `HOME`.** `GIT_CONFIG_NOSYSTEM=1` schneidet `/etc/gitconfig`
ab; die **globale** Konfiguration unter `$HOME` nicht, und `GIT_CONFIG_GLOBAL`
kommt im ganzen Baum nicht vor. Gemessen, nicht vermutet:

| Umgebung | angesteuerte Adresse |
|---|---|
| wie der Abrufer (mit `HOME`) | `https://umgeleitet.example/repo` |
| ohne `HOME` | `https://gewollt.example/repo` |
| mit `GIT_CONFIG_GLOBAL=/dev/null` | `https://gewollt.example/repo` |

Eine `~/.gitconfig` mit `[url "…"] insteadOf = …` leitet also um, wovon der
Kommentar im Protokoll sagt, es dürfe nicht umgeleitet werden. Die Pinnung auf
einen Commit bleibt wirksam — es wird kein *anderer* Commit geholt —, aber
*von wem* die Bytes kommen, entscheidet eine Datei außerhalb des Records.

**Wer schreibt diese Datei?** Der Betreiber, oder was als dieser Benutzer
läuft. Das ist kein Ausbruch eines Depots und keine Rechteausweitung; es ist
der Unterschied zwischen *„die Adresse, die eine Person genehmigt hat"* und
*„die Adresse, von der geholt wurde"* — und ADR 0143s ganzes Argument handelt
davon.

**Zwei Abhilfen, beide gemessen.** `git ls-remote --get-url <adresse>` druckt
die umgeschriebene Adresse **ohne das Netz anzufassen**; damit lässt sich vor
jedem Abruf vergleichen. `GIT_CONFIG_GLOBAL=/dev/null` schaltet die
Umschreibung ganz ab, nimmt aber `http.proxy` und `credential.helper` mit —
also einen privaten Depot-Zugang hinter einem Proxy.

**Nicht entschieden, weil es eine Produktentscheidung ist.** Wer `insteadOf`
absichtlich benutzt — `git@github.com:` statt `https://github.com/` ist ein
verbreiteter Aufbau —, würde von einer Ablehnung getroffen. Die Frage liegt als
Entscheidung 16 in `.agent-context.md`.

**Die Lehre**, und sie ist die dritte dieser Art in einer Runde: **eine
Zusicherung endet an der Grenze des Prozesses, den man kennt.** Das Muster
prüft die Adresse, die *ankommt*; die Umgebung entscheidet, was daraus *wird*.
Zwischen beiden liegt ein Programm, das dieser Baum nicht geschrieben hat, und
dessen Konfiguration er halb abgeschnitten hat — die Hälfte, an die jemand
gedacht hat.

**B207 — Tiefe ist Tiefe nur in der richtigen Reihenfolge (2026-09-18).** Der
Vault-Daemon hält die Schlüssel und hat absichtlich keine Netzfläche (ADR
0097). Die erste Frage an so etwas ist, **wer sich verbinden darf** — und die
zweite, ob zwischen dem Binden des Sockets und seiner Verengung eine Lücke
klafft.

**Zwei Schichten, gemessen:** das Vault-Verzeichnis muss genau `0700` sein und
dem laufenden Benutzer gehören, sonst startet der Daemon nicht
(`vault_home_permissions`); der Socket wird zusätzlich auf `0600` gesetzt.

**Die klassische Lücke ist die umask.** `listen()` legt den Socket mit den
Rechten an, die die umask des Prozesses übriglässt — bei `022` wäre er kurz für
alle erreichbar, bis `chmodSync` greift. Hier ist sie **konstruktiv
geschlossen**, und zwar durch die Reihenfolge: `#assertCustodyLayout` läuft im
**Konstruktor**, legt die Verzeichnisse mit `0700` an und prüft jedes einzeln;
`listen()` bindet danach *innerhalb* eines bereits geprüften Verzeichnisses. Ein
kurz zu offener Socket in einem Verzeichnis, das Fremde nicht betreten dürfen,
ist unerreichbar.

**Und die Gegenstelle kann nichts erschöpfen:** sechzehn Verbindungen, 128 KB
je Rahmen, ein Hello-Zeitgeber, fünf Fehlversuche bis zur Sperre, eine
Leerlaufsperre nach fünf Minuten, ein Deckel auf die Signaturbeschriftung.

**Ein Negativbefund**, der dritte dieser Runde. Aufgeschrieben, damit ihn
niemand noch einmal geht.

**Die Lehre ist übertragbar und steht nirgends als Satz.** Dieselben zwei
Prüfungen in umgekehrter Folge — erst binden, dann das Verzeichnis prüfen —
ließen ein Fenster, in dem ein fremder Prozess sich verbindet. Dass die Prüfung
im Konstruktor steht und nicht in `listen()`, ist der ganze Unterschied.
**Verteidigung in der Tiefe ist keine Menge von Schichten, sondern eine
Folge** — und welche Folge es ist, sieht man einer Datei nicht an, in der die
eine Prüfung siebenhundert Zeilen vor der anderen steht.

**B206 — zwei Arten Frist, und jede hat ihre eigene Regel (2026-09-18).** Nach
den Voreinstellungen ein anderes Thema, und zwar eines mit einem echten
Angreifer: **kann jemand eine Einspruchsfrist verkürzen, indem er die Uhr
vorstellt?** ADR 0120 N2 sagt nein und begründet es; gegangen ist die Frage
noch niemand.

**Der Baum unterscheidet zwei Arten von Frist, und das ist der Grund, warum
die Frage überhaupt prüfbar ist.**

| Art | Was ihr Ablauf tut | Regel |
|---|---|---|
| Einspruchsfenster | **erlaubt** etwas | `hasPicoObjectionWindowElapsed`: Wanduhr **und** dauerhafter Boden müssen vorbei sein |
| Expositionsfenster | **verbietet** etwas | `hasPicoExposureWindowElapsed`: die **früheste** der beiden Uhren gewinnt |

Beide Regeln zeigen in die sichere Richtung ihrer Art, und die erste ist
zusätzlich vorsichtig: ohne Boden gilt das Fenster als **nicht** abgelaufen.

**Die beiden Aufrufstellen der Einspruchsregel sind genau die zwei Übergänge,
bei denen Warten etwas freigibt** — eine Gerätewiederherstellung wird wirksam,
und eine Wurzelrotation wird wirksam. Beide verankert, beide mit einem Satz
daneben, der sagt warum. Expositionsfenster nutzen Sitzungen und
Freigabeumschläge.

**Und die Gegenprobe, die den Befund erst zu einem macht:** gibt es ein
Fenster, das *keine* der beiden Regeln benutzt? Sieben blanke Vergleiche eines
Zeitpunkts gegen die Gegenwart stehen im Core, und einzeln gegangen ist keiner
davon ein Fenster in diesem Sinn — es sind Gültigkeitsprüfungen, die bei
Ablauf **verweigern**: eine Delegation vor ihrer Gültigkeit, ein Anspruch nach
seinem Ende, ein Anker-Eintrag über seiner Frist. Auch der unauffälligste,
`validUntil > completionExpiresAt`, verlangt bloß, dass eine Delegation den
Abschluss überlebt.

**Also ein Negativbefund**, der zweite dieser Art nach B199. Aufgeschrieben,
damit ihn niemand noch einmal geht, und mit den vierzehn Fristkonstanten
daneben, die die Suche eingegrenzt haben.

**Die Lehre steckt nicht im Ergebnis, sondern darin, dass es eines gibt.** Ein
einziges `hasElapsed` hätte diese Prüfung unmöglich gemacht — man kann nicht
fragen, ob ein Fenster die richtige Regel benutzt, wenn es nur eine gibt. Zwei
Wörter für zwei Dinge sind das, was einen Baum prüfbar macht: **ein Vokabular
mit einem Wort hat keine Fehler, es hat nur keine Unterscheidung.** Das ist
B185 von der anderen Seite gelesen.

**B205 — die schlafende Sicherung (2026-09-18).** B203 ließ die lebende
Datenbank wirklich vergessen. Damit rückt die Frage nach, die ADR 0070 als
Restrisiko benennt: *„backups may retain plaintext"*. **Welche Sicherungen?**

**Gemessen: keine.** `createSqliteBackup` ist vollständig gebaut und geprüft,
schreibt nach `<data>/backups` und wird **nie ausgelöst**. Eine Sicherung
entsteht nur, wenn eine *ausstehende* Wanderung `requiresBackup: true` trägt —
und von sechsundzwanzig tut das **keine**. Der Satz des ADR beschreibt heute
ein Risiko, das es nicht gibt.

**Das Interessante ist, was beim ersten Gebrauch passiert.** Wer die erste
Wanderung mit `requiresBackup: true` schreibt, legt damit eine vollständige
Kopie der Datenbank an — auf einem Home ohne eingeschaltete Verschlüsselung
als Klartext, und `nextAvailableBackupPath` sucht den nächsten freien Namen,
also **häufen sie sich**. Im ganzen Baum gibt es keine Stelle, die eine `.bak`
je wieder wegnimmt.

Seit B203 wiegt das schwerer als vorher: die lebende Datei überschreibt jetzt,
was sie löscht, also wäre diese Kopie **der einzige Ort, an dem Gelöschtes
überlebt**.

**Zwei benachbarte Sätze sind dabei ehrlich und bleiben es.** ADR 0119 Q5 nimmt
„backup sizing, off-host retention or storage provisioning" ausdrücklich aus
seinem Umfang, und ADR 0072 hält das Schlüsselmaterial aus jeder
Datenbanksicherung heraus — auf einem verschlüsselten Home ist eine `.bak`
darum Chiffretext ohne Schlüssel. Beides ist gewollt. Ungewollt ist nur, dass
die Kopie **leise** entsteht.

**Gebaut: ein Tor über null Fällen**, in der Bauart von
`check-product-path.mjs`, das seinen eigenen Kommentar dafür hat — *„today no
document contains one, so this starts green and stays useful by refusing the
first regression"*. Wer eine Sicherung verlangt, trägt in
`check-migration-immutability.mjs` ein, **wer die Kopie wieder wegnimmt**. Ein
Satz, den sonst niemand zu schreiben hätte, und der genau dann fällig wird,
wenn er etwas kostet.

Zwei Pflanzungen: die jüngste, nicht ausgelieferte Wanderung verlangt eine
Sicherung — die Regel bellt allein; ein Argument für eine Wanderung, die es
nicht gibt — sie bellt in die Gegenrichtung. (Auf einer *ausgelieferten*
Wanderung feuern zwei Netze zugleich, weil sich dann auch ihr Rumpf geändert
hat. Schön zu sehen, aber die schwächere Probe.)

**B204 — eine Regel, die durch die Gestalt einer Zeile gilt (2026-09-18).**
B195 schrieb, ADR 0118 O2s Verbot, bei einem Fehlschlag auf eine andere
Anbieterklasse auszuweichen, gelte nur durch die **Abwesenheit von Code**:
`model-runtime.ts` setzt es um, indem dort nichts steht, was einen zweiten
Anbieter wählte. Das ist die Art Zusicherung, die still fällt, sobald jemand
die Abwesenheit füllt.

**Nachgemessen gilt sie stärker, und anders.** Die Warteschlange schreibt
`entry_id` in die Auftragszeile, und **keines der fünf `UPDATE` dieser Datei
fasst es an** — sie betreffen Versuche, Abschluss, den behaltenen Eintrag und
das Vergessen. Ein Auftrag ist damit dauerhaft an den Anbieter gebunden, für
den er eingestellt wurde. Ausweichen wäre kein Wiederholungsversuch, sondern
ein **neuer Auftrag**, und der ist eine andere Handlung mit eigener Zustimmung.

Das ist der Unterschied zwischen „hier steht nichts" und „hier kann nichts
stehen": das erste ist eine Lücke, die jemand füllt, das zweite eine Gestalt,
die jemand brechen müsste.

**Gebaut: das Netz, das die Gestalt behauptet.** Ein Test geht **jeden
verändernden Weg der Warteschlange** ab — einstellen, Versuch verbuchen,
abschließen, vergessen — und hält danach dieselbe Bindung. Er fällt an dem Tag,
an dem ein sechstes `UPDATE` sie mitnimmt. Zwei Pflanzungen, beide gesehen: das
Verbuchen eines Versuchs verschiebt die Bindung, und das Vergessen tut es.

Und wieder fiel die erste Fassung mit der **falschen Meldung**:
`pico_model_job_library_read_without_derivation`, weil meiner Vorrichtung die
Herkunftsangabe fehlte — der Auftrag wurde abgelehnt, bevor die Bindung
überhaupt entstand, und der Test hätte eine leere Tabelle geprüft. Regel 13,
zum dritten Mal in dieser Runde an meiner eigenen Arbeit.

**Die Lehre**, und sie ist die freundliche Hälfte von B195: nicht jede Regel,
die kein `if` hat, ist ungeschützt. Manche stehen im **Datenmodell**, und das
ist der bessere Ort — nur muss jemand einmal hinsehen und es aufschreiben,
sonst ist der Unterschied zur echten Lücke von außen nicht zu sehen.

**B203 — was gelöscht ist, stand noch in der Datei (2026-09-18).** B200 und
B201 fanden zwei Zusicherungen an Übersetzungsschaltern einer fremden
Bibliothek. Der dritte Schalter, den niemand setzt, ist `secure_delete` — aus,
also werden die Bytes einer freigewordenen Zelle nicht überschrieben. Für ein
Produkt, dessen ganze Geschichte Löschen ist, ist das keine Feinheit.

**Gemessen am Produktweg, nicht an SQLite:** sechzig Gedächtniseinträge mit
einem erkennbaren Satz angelegt, alle über `deleteInDomain` gelöscht, den Store
geschlossen — **der Satz stand einundsechzigmal in der geschlossenen Datei.**
Erst ein `VACUUM` räumte ihn weg, und **niemand im Produkt führt je eines aus.**

**Dreimal habe ich vorher die falsche Frage gemessen** und jedes Mal null
Treffer bekommen (Regel 11, in Serie). Kleine Einträge leben und sterben in der
WAL, und ein Checkpoint schreibt die Seite ohnehin neu; auch achtzig Nachbarn
auf derselben Seite ändern daran nichts. Erst große Inhalte auf eigenen Seiten,
gelesen an der **geschlossenen** Datei — so, wie eine gestohlene Platte sie
zeigt —, beantworten die Frage. Die ersten drei Messungen sagten „SQLite
schreibt Seiten neu", nicht „dieses Haus vergisst".

**Der Mechanismus, und er ist Absicht.** `deleteInDomain` löscht die Zeile
nicht, es leert den Inhalt: sechzig Zeilen vorher, sechzig nachher, davon null
mit Inhalt. Der Eintrag muss noch sagen können, was aus einer Referenz wurde.
Mit `secure_delete` aus bleibt der alte Inhalt in der Seite stehen.

**Und es ist kein Einzelfall, sondern jeder Vergessensweg dieses Produkts.**
Sechs Stellen leeren eine Spalte an Ort und Stelle; vier davon leeren
Personeninhalt:

| Stelle | Was dort verschwinden soll |
|---|---|
| `memory-store.ts:547` | `deleteInDomain`: der Inhalt eines Eintrags — **gemessen** |
| `memory-store.ts:607` | derselbe Weg beim Durchsetzen eines Grabsteins |
| `model-job-queue.ts:488` | `forgetRecall`: `job_json`, `result_json`, `recall_context_json` |
| `model-job-queue.ts:524` | dasselbe für eine ganze Domäne |

Die letzten beiden wiegen am schwersten: `job_json` trägt den lebenden Zug —
die Worte einer Person an ein Modell — und `result_json` die Antwort darauf.
Die zwei übrigen Stellen leeren Kennungen, keinen Inhalt.

**Was ADR 0070 verspricht, ist enger als das.** Seine Kernregel sagt:
*„deletion is storage-removal only and **backups** may retain plaintext."* Sie
nennt Sicherungskopien. Sie sagt nicht, dass die lebende Datenbank den Klartext
behält, und wer „gelöscht" liest und daneben „Sicherungen können ihn noch
haben", schließt genau das aus.

**Getan: `secure_delete = ON` in beiden Stores.** Ein Pragma deckt alle vier
Stellen, weil es eine Eigenschaft der Verbindung ist und nicht einer
Anweisung. Im Relay **anders als bei den Fremdschlüsseln (B200) auch**: dort
hatte der Schalter keinen Gegenstand, hier hat er einen — das Relay kehrt
Postfächer, und seine eigene Zeile daneben sagt, warum das zählt: *„Was hier
liegt, ist versiegelt — die Adressen sind es nicht."*

**Die Kosten sind gemessen und es gibt keine.** Bei 200 und 800 Löschungen zu
je 3 kB, über sieben Läufe je Seite: nicht langsamer, sondern 5 bis 15 Prozent
schneller. Das ist keine Aussage über Geschwindigkeit, sondern die Form davon,
weniger Seiten herumzuschieben.

**Zwei Pflanzungen, und der Unterschied zu B200 ist die Pointe.**

- Die Zeile entfernt — **der Test fällt.** Bei B200 blieb bei derselben
  Pflanzung alles grün, weil die Voreinstellung dort *für* uns war. Hier war
  sie gegen uns, und deshalb hat das Netz einen Gegenstand.
- `FAST` statt `ON` — der Test besteht. Richtig so: er behauptet, dass die
  Bytes weg sind, nicht welcher Schalter das erledigt. Ein Netz über ein
  Verhalten nimmt jeden Weg an, der es erfüllt.

**Die Lehre, und sie ist B200 mit umgedrehtem Vorzeichen.** Zwei geerbte
Voreinstellungen im selben Konstruktor: eine hielt eine Zusicherung, die
niemand aussprach, eine brach eine. Beide waren aus demselben Grund unsichtbar
— eine Voreinstellung hat keinen Ort, an dem man sie liest. **Der Unterschied
ist nur, dass die eine wartete, bis jemand hinsieht, und die andere darauf,
dass jemand die Platte findet.**

**B202 — der Grenzstein beschreibt ein Haus, das es nicht mehr gibt
(2026-09-18).** B200 und B201 fanden zwei Zusicherungen, die an
Übersetzungsschaltern einer fremden Bibliothek hingen. Der nächste Schalter,
den niemand setzt, ist `secure_delete` — aus, also bleiben die Bytes gelöschter
Zeilen in der Datei stehen, bis etwas sie überschreibt. Für ein Produkt, dessen
ganze Geschichte Löschen ist, ist das die richtige Frage. **Wo steht, was
Löschen hier bedeutet?** In ADR 0070.

**Und dort steht ein Haus, das es nicht mehr gibt.** Der Abschnitt „The honest
current state, which this ADR exists to bound" nennt im Präsens drei
Abwesenheiten:

> `privacyDomain` scopes store access programmatically, but there is **no
> encryption, no access model and no membership** behind it.

Alle drei existieren, und zwar unter späteren ADRs als diesem:

| Behauptet fehlend | Gemessen vorhanden |
|---|---|
| Verschlüsselung | `apps/core/src/memory-content-crypto.ts`, `memory_key_envelope` |
| Zugriffsmodell | `pico_home_domain_read_grant` samt Lebenszyklus, 62 klassifizierte Routen |
| Mitgliedschaft | `pico_home_membership`, `_credential`, `_lifecycle` |

**Die Statusmatrix hat recht** und führt ADR 0070 als `partially implemented`.
Falsch ist allein die Prosa des ADR selbst — und zwar an der Stelle, die
jemand liest, der wissen will, was ein Schredder in diesem Haus überhaupt
leisten kann.

**Ein vierter Satz bleibt wahr und liest sich falscher, als er ist.** „Memory
content ist Klartext im Ruhezustand" gilt für ein Home, in dem niemand die
Verschlüsselung eingeschaltet hat — und das ist die Voreinstellung: ohne
Konfiguration liest der Start `holdsEncryptedMemoryContent()`, und das ist bei
einem frischen Haus `false`. Der Satz stimmt also über ein *unverändertes*
Home, nicht über den Store. Derselbe Unterschied trägt den Satz daneben:
`deleteInDomain` ist Speicherlöschen dort, wo nichts verschlüsselt ist, und in
einem Haus mit eingeschalteter Verschlüsselung nimmt ein Domänenschredder
Schlüsselmaterial mit. **Ein Satz ohne seine Bedingung ist in der Hälfte der
Häuser falsch.**

**Berichtigt, ohne die Geschichte zu nehmen:** eine datierte Statusnotiz sagt,
was sich bewegt hat und was die Aufzählung heute bedeutet; die Aufzählung
selbst bleibt als die Momentaufnahme stehen, die sie war, und ihre
Zwischenüberschrift sagt das jetzt.

**Kein Tor dazu, und das ist kein Versäumnis.** Die Regel in `docs:check`, die
Abwesenheitssätze prüft, braucht einen Namen in Backticks — *„there is no
encryption"* nennt keinen. Das ist genau die Grenze, die B197 schon gemessen
und aufgeschrieben hat, und ein breiteres Muster wäre die Abhilfe, die dort
verworfen wurde. Was diesen Fall gefunden hat, war kein Prüfer, sondern eine
Frage an das Produkt: *was bedeutet Löschen hier?* — der siebte verjährte Satz
dieser Runde, und der erste, den ich beim Gehen und nicht beim Messen fand.

**B201 — dieselbe Stille, einmal zugunsten und einmal zulasten (2026-09-18).**
B200 fand eine Zusicherung, die an einem Übersetzungsschalter einer
eingebetteten C-Bibliothek hing. Drei Zeilen weiter oben im selben Konstruktor
steht die zweite, und sie zeigt in die andere Richtung.

**Offene Entscheidung 10 (B186) sagt, `synchronous` stehe auf NORMAL und
niemand habe das entschieden.** Das stimmt, und bis heute war es eine
Schlussfolgerung aus einer Abwesenheit — niemand setzt den Pragma, *also* gilt
die Voreinstellung. Gemessen ist es jetzt, und der Mechanismus ist genauer, als
„die Voreinstellung" sagt:

| Zeitpunkt | `synchronous` | WAL-Datei |
|---|---|---|
| frisch geöffnet | 2 (FULL) | nein |
| nach `journal_mode = WAL` | 2 (FULL) | nein |
| **nach dem ersten Schreiben** | **1 (NORMAL)** | ja |

Die mitgelieferte SQLite 3.49.2 trägt zwei Schalter, die `PRAGMA
compile_options` nennt: `DEFAULT_SYNCHRONOUS=2` und
`DEFAULT_WAL_SYNCHRONOUS=1`. Der zweite greift nicht, wenn der Pragma gesetzt
wird, sondern **wenn die WAL-Datei entsteht** — also beim ersten Schreiben, und
das ist im Betrieb die erste Migration. Ein Home läuft daher praktisch immer
auf NORMAL, und die kurze Spanne auf FULL davor ist zu kurz, um irgendetwas zu
bedeuten.

**Das korrigiert die Entscheidung nicht, es schärft sie.** „Niemand hat das
entschieden" war zu freundlich formuliert: es hat jemand entschieden, nur nicht
hier — ein `-D`-Schalter im Bauskript einer Abhängigkeit hat die Haltbarkeit
dieses Hauses festgelegt. `synchronous = FULL` zu setzen heißt damit nicht,
eine Lücke zu füllen, sondern **eine fremde Entscheidung zu überstimmen**, und
das ist ein anderer Satz für dieselbe Zeile Code.

**Und die beiden zusammen sind die eigentliche Auskunft.** Derselbe
Konstruktor erbt zwei Übersetzungsschalter aus derselben Bibliothek: einer
schaltet Fremdschlüssel ein und **hält** eine Zusicherung, die dieses
Repository nirgends ausspricht (B200); einer senkt die Haltbarkeit und
**schwächt** eine, die dieses Repository nirgends ausspricht. Beide waren
unsichtbar, weil eine Voreinstellung keinen Ort hat, an dem man sie liest. Der
eine ist jetzt gesagt; der andere wartet auf eine Entscheidung.

**Eine Sonde, die ich verworfen habe, gehört dazu.** Meine erste Messung nahm
eine nachgebaute Verbindung statt des echten Stores und las 2 statt 1 — der
Unterschied war, dass sie nach dem WAL-Pragma nichts schrieb. Regel 11 in
Reinform: ein anderer Aufbau beantwortet eine andere Frage, und der Unterschied
war hier genau der Gegenstand.

**B200 — eine Zusicherung, die eine Voreinstellung trägt (2026-09-18).** B199
endete mit dem Satz *„was auseinanderliegt, fällt auseinander"*. Die schärfste
Form davon in einem SQLite-Schema ist ein Fremdschlüssel, den niemand
durchsetzt.

**Gemessen: 52 Tabellen, genau eine `REFERENCES`-Klausel**, und sie steht dort,
wo nichts lügen darf — `pico_audit_record.event_id REFERENCES pico_event
(event_id)`. Das Relay hat keine. Beide Stores setzen genau einen Pragma,
`journal_mode = WAL`, und `foreign_keys` setzt niemand.

**Meine Vermutung war, sie sei Zierat, und sie war falsch.** Statt sie
aufzuschreiben, habe ich sie gefahren: der Pragma steht auf 1, und ein
Auditeintrag ohne sein Ereignis wird abgelehnt. Nachgefragt, *warum* — und die
Antwort liegt tiefer, als ich zuerst geschrieben hatte: nicht `better-sqlite3`
setzt ihn, sondern die mitgelieferte SQLite ist mit `SQLITE_DEFAULT_FOREIGN_KEYS`
**übersetzt** (`PRAGMA compile_options`, Fassung 3.49.2). Die Zusicherung hing
an einem Übersetzungsschalter einer eingebetteten C-Bibliothek. **Zweites Negativ:** kein Produktcode löscht
je aus `pico_event`; nur Tests tun es, und der eine, der es tut, nimmt den
Auditeintrag zuerst weg. Ein `ON DELETE` fehlt also nicht, es wird nicht
gebraucht.

**Was übrig bleibt, ist der Fund.** Die einzige referenzielle Zusicherung
dieses Schemas hing an der Wahl einer Abhängigkeit, war nirgends gesagt und von
keinem Test gehalten — an der Auditkette, deren ganze Aufgabe ist, nicht zu
lügen. Ein Auditeintrag ohne Ereignis wäre eine Kette, die Deckung behauptet,
die sie nicht hat.

**Getan:** der Store sagt es selbst (`foreign_keys = ON`), mit dem Grund
daneben. Das Relay bewusst nicht — es erklärt keine `REFERENCES`, und ein
Pragma ohne Gegenstand ist ein Prüfer ohne Gegenstand (B166). Dazu ein Test,
der den Weg geht, und zwar **über die Verbindung des Stores selbst**: der
Pragma gilt je Verbindung, eine zweite beantwortete eine andere Frage
(Regel 11).

**Drei Pflanzungen, und die mittlere ist der Befund in einem Satz.**

- Pragma auf `OFF`: der Test fällt an der Pragma-Zusicherung.
- **Die Zeile ganz entfernt — alles bleibt grün.** Weil die Voreinstellung sie
  trägt, ändert ihr Fehlen heute nichts. Genau deshalb hat es niemand gemerkt,
  und genau deshalb ist die Zeile eine Versicherung und kein Zierat: sie hält
  den Tag, an dem jemand `better-sqlite3` gegen eine anders übersetzte SQLite
  tauscht. Ein Test kann einen *falschen* Wert fangen, nicht eine *fehlende*
  Zeile.
- Die `REFERENCES`-Klausel aus der Migration genommen: der Test fällt **und**
  `migration:check` meldet, dass eine ausgelieferte Migration ihren Körper
  geändert hat. Zwei Netze aus einer Pflanzung.

Die erste Fassung des Tests fiel mit der **falschen Meldung** — `NOT NULL
constraint failed: recorded_at` —, weil meinem `INSERT` eine Pflichtspalte
fehlte und die Bedingung sprach, bevor der Fremdschlüssel zu Wort kam. Regel 13
an der eigenen Arbeit.

**Die Lehre: eine Zusicherung, die eine Voreinstellung trägt, gehört dem, der
die Voreinstellung setzt** — und hier war das niemand im Repository, sondern
ein `-D`-Schalter im Bauskript einer Abhängigkeit. Der Zwilling steht drei
Zeilen weiter oben im selben Konstruktor: `synchronous`, offene Entscheidung
10. Dieselbe Stille, und B201 nebenan misst, was sie kostet.

**B199 — der vierte Gang, und er geht leer aus (2026-09-18).** B192 ging dem
Löschen nach und fand einen Raum, den man anlegen, aber nicht beenden kann.
B194 ging dem Lesen nach und fand Standortmessungen, die niemand ansieht. B197
ging dem Mitnehmen nach. Der vierte ist **Zurücknehmen**: *für jede Zustimmung,
die eine Person gibt — gibt es den Weg zurück?*

**Der Korpus aus dem Schema, nicht aus dem Kopf** (Regel 7): jede Tabelle, die
eine Zustimmung hält. Es sind zehn, und jede hat einen Rückweg.

| Zustimmung | Weg zurück |
|---|---|
| `pico_home_domain_read_grant` | eigene Lebenszyklustabelle, `POST /api/home/domain-read-grant-lifecycle` |
| `pico_reader_custody_reader_grant` | eigene Lebenszyklustabelle |
| `pico_reader_custody_writer_grant` | eigene Lebenszyklustabelle |
| `pico_model_provider_consent` | `home.model.provider.decision.revoke` und `DELETE /api/model/providers/:entryId/decision` |
| `pico_module_effect_consent` | gelöscht, sobald das Modul ausgeht |
| `pico_rule_decision` | `home.rule.forget`, ein eigener Vorgang |
| `pico_memory_encryption_decision` | eine Zeile, eine Route, beide Werte |

**Einer sah nach einer Lücke aus, und ist keine.**
`pico_module_effect_consent` hat keine `revoke`-Operation und keine
Lebenszyklustabelle — die beiden Formen, in denen dieser Baum sonst eine
Rücknahme schreibt. Nachgemessen: die Tabelle wird gelesen
(`app.ts:1918`) und **durchgesetzt** (`app.ts:4810` hält eine Wirkungsanfrage
gegen sie), und `setPicoModuleActivation` löscht ihre Zeilen, sobald eine
Änderung `active: false` trägt. Es gibt keine eigene Tür, weil das Abschalten
des Moduls die Rücknahme **ist** — eine Zustimmung, die nur besteht, solange
das besteht, wofür sie gilt.

**Das Ergebnis ist ein Negativbefund, und der erste dieser vier Gänge.** Drei
fanden eine Lücke; dieser findet keine. Aufgeschrieben, damit ihn niemand noch
einmal geht.

**Und der Grund, warum er leer ausgeht, ist der interessante Teil.** Jede
dieser sieben Zustimmungen steht **neben dem Ding, das sie erlaubt**, und beide
werden in derselben Transaktion geändert: die Wirkungszustimmung im selben
Aufruf wie die Aktivierung, der Lesezugang in derselben Lebenszeile wie sein
Widerruf, die Anbieterentscheidung unter derselben Kennung wie ihr `revoke`.
Man kann die Rücknahme nicht vergessen, weil es keinen Ort gibt, an dem man sie
getrennt hätte schreiben müssen.

Die drei Lücken der anderen Gänge liegen genau spiegelbildlich: ein Raum, dessen
Schlüssel im Vault liegt und dessen Tür im Home fehlt; eine Tabelle, deren
Schreiber im Home steht und deren Leser nirgends; sechs Oberflächen, die im
Manifest stehen und im Code nicht. **Was zusammen geschrieben wird, wird
zusammen zurückgenommen — und was auseinanderliegt, fällt auseinander.** Das
ist derselbe Satz, den dieser Baum über doppelte Wahrheiten schon hat, von der
anderen Seite gelesen.

**B198 — ein Name in einem Dokument ist eine Tür, die jemand sucht
(2026-09-18).** B197 berichtigte eine Spalte der Statusmatrix. Die Spalte
daneben nennt Dateien, und die sind längst gehalten: `docs:check` prüft jeden
Backtick-Pfad mit Wurzelverzeichnis und Endung gegen den Bestand — 1.269 Stück
— mit einer Begründung, die genau hierher gehört: *„a path in it is a pointer
somebody follows rather than a record of where something was."* Die Frage
schreibt sich von selbst: **was nennt ein Dokument sonst noch, dem jemand
folgt?**

**Und dann dieselbe Frage an die Nachbarspalte, mit einem unangenehmen
Ergebnis.** Die Belegspalte der Matrix nennt Dateien, und die sind gehalten:
`docs:check` prüft jeden Backtick-Pfad mit Wurzelverzeichnis und Endung gegen
den Bestand — 1.269 Stück — mit einer Begründung, die genau hierher gehört:
*„a path in it is a pointer somebody follows rather than a record of where
something was."*

**Ein Operationsname ist derselbe Zeiger eine Schicht tiefer, und ihn hielt
nichts.** Gemessen über alle verzeichneten Dokumente: **256 Nennungen von 57
verschiedenen Pico-Link-Operationen.** Drei fallen aus der geschlossenen Liste
des Protokolls.

Einer ist ein Fehlalarm der guten Sorte: *„Kein `home.rules.read` daneben"* —
der Satz nennt die Abwesenheit, und das ist der Grund, warum er den Namen
schreibt.

**Die anderen zwei stehen in `Roadmap.md`** — in diesem Dokument, das jeden
Befund über verjährte Sätze aufschreibt. *„Zwei Vorgänge
(`home.reader_key.freshness.submit`, `home.reader_custody.reader_grant.submit`),
ein Knopf im Fenster"*, im Präsens. Git sagt beides: die Türen kamen mit
`93f6ace3` und gingen mit `08bf8603` — *„drei Türen entfernt, die es schon
gab"* —, weil Befund **B30** maß, dass `home.authority.submit` die Ressourcen
`reader_key_freshness_checkpoint` und `reader_custody_reader_grant` längst
trug. Der Eintrag behält seine Geschichte und bekommt sein Verb zurück.

**Gebaut: die Geschwisterregel zur Pfadprüfung.** Korpus ist die geschlossene
Liste des Protokolls, nicht eine zweite hier; Gegenstand ist jeder
Operationsname in Backticks in einem verzeichneten Dokument. Drei Argumente,
und wieder in beide Richtungen geprüft: ein Argument für eine Nennung, die
verschwunden ist, fällt — *„one more sentence nobody reads"* —, und eines für
eine Operation, die **zurückkommt**, fällt auch. Drei Pflanzungen, drei
verschiedene Sätze.

**Und eine vierte Probe, die ich wieder nicht gepflanzt habe.** Der erste volle
Lauf fiel — an diesem Absatz. Mein eigener Text hatte die Gestalt einer
Operation mit Kleinbuchstaben ausgeschrieben, und die Regel las sie als Tür. Das ist kein Fehlalarm, sondern die
richtige Antwort auf eine falsche Schreibweise: eine Gestalt gehört in spitze
Klammern, wie `surfaces:check` es nebenan schon macht. Ein Tor über Prosa fängt
auch die Prosa, die es beschreibt — und das ist die billigste Art, zu erfahren,
dass es wirklich liest.

**Das Geschwister dazu habe ich gemessen und nicht gebaut.** Ereignistypen
haben dieselbe geschlossene Liste — 48 Namen —, und 448 Nennungen stehen in den
Dokumenten. Sechzehn fallen heraus, und **keine ist ein Fund**: sieben sind
Feldpfade in eine Nutzlast hinein (`device.registered.payload`), einer ist ein
Dateiname, `home.set_state` ist ein MCP-Werkzeug aus ADR 0144, `approval.*` ist
die Sprache des Haltekanals, und `action.completed` nennen ADR 0026 und 0141
ausdrücklich als *entfernte Doppelung*. Ein Tor dafür wäre lauter Sonderfälle
ohne Fang — Regel 17 an der eigenen Arbeit: erst messen, ob die Richtung
überhaupt etwas behauptet.

**Die Lehre ist B197s Abhilfe, auf sie selbst angewandt**: nicht ein breiteres
Muster, sondern ein anderer Gegenstand — die geschlossene Liste daneben. Und
die Nebenauskunft ist die unbequemere: **das Befunddokument ist von seinen
eigenen Befunden nicht ausgenommen.** Sechs verjährte Sätze hat diese Runde
berichtigt, und die letzten zwei standen in der Datei, in der die ersten vier
aufgeschrieben sind.

**B197 — ein Konzept, das elf Produktdateien zitieren (2026-09-18).** B192 ging
dem Löschen nach, B194 dem Lesen. Das dritte Grundrecht an eigenen Daten ist
**Mitnehmen**, und dieses Produkt verspricht es in einem Satz: ADR 0003,
*„**A person must be able to leave with their Pico.**"* Mit einem Ablauf in
drei Schritten und einer Liste, was das Bündel enthält — persönliches
Ereignisprotokoll, persönliches Gedächtnis, Geräteliste, Peer-Beziehungen,
portable Einstellungen — und mit dem Satz daneben, der Serverbetreiber dürfe
die Ausfuhr nicht blockieren.

**Gemessen: es gibt sie nicht.** Keine Route, keine Link-Operation, kein
Ereignistyp trägt das Wort. Die einzige Sicherung im Baum ist eine
Migrationssicherung — eine Kopie, bevor ein riskanter Schritt läuft.

**Und das ist kein Fund, denn der Baum weiß es.** ADR 0003 ist eine
Konzeptnotiz, die Statusmatrix führt sie als `concept-only`. B193s Muster zum
zweiten Mal: die ehrliche Aufzeichnung war schon da.

**Aber die Lückenspalte derselben Zeile ist eine Abwesenheitsbehauptung im
Präsens** — B196s dritte Klasse, die von nichts gehalten wird. Sie nannte
sechs Dinge, die fehlten: getrennte Pico-Identitäten, personeneigene
Schlüssel, Privatdomänen, verschlüsselte Ausfuhr, serverloser Betrieb,
Migrationswege. **Drei davon sind gebaut**, und zwar sichtbar: vier
`pico_identity_*`-Tabellen, neun Tabellen für Leser-Custody und Umschläge,
`privacy_domain` quer durchs Schema mit eigenem Muster und eigener
Schredderroute.

**Also dieselbe Frage an alle neunzehn `concept-only`-Zeilen.** Das Messgerät
ist die eigene Gewohnheit dieses Baums: eine Datei, die eine Entscheidung
umsetzt, sagt es in ihrem Doku-Kommentar — *„ADR 0142 PE3"*, *„ADR 0078 K6"*.
Wie viele Produktdateien zitieren also ein Konzept?

Vierzehn der neunzehn: **null**. Die Matrix hat recht. Fünf haben ein bis vier
Nennungen, und einzeln nachgesehen sind alle fünf echte Randbemerkungen — ein
geborgter Begriff (`model-context.ts` sagt ausdrücklich, ADR 0002s
Beziehungsstufen seien dort **nicht** modelliert), ein zitierter Stil (ADR
0037s Auditform in der Schredderprüfspur), eine referenzierte Gestalt.

**Und einer hat elf: ADR 0048**, „Model capability delegation and remote
inference boundary". Seine Zeile sagte:

- Statusspalte: **`concept-only`**
- Belegspalte: **„None; docs only."**
- Lückenspalte: *„Registry, job envelope schema, transport, provider
  authentication, retention enforcement and runtime execution are **still
  missing**."*

**Alle sechs existieren**, jedes mit einem benennbaren Gegenstand:
`model-provider-registry.ts` mit den drei Tabellen `pico_model_provider_entry`,
`_consent` und `_credential`; die Umschlagschemata in
`packages/protocol/src/model-job.ts` und `model-result.ts`; der Versand in
`model-runtime.ts`, der Kommentar dort zitiert ADR 0118 O2 beim Namen; die
Versiegelung in `model-provider-credential-crypto.ts` hinter
`home.model.provider.credential.submit`; der Kehrlauf in `model-job-queue.ts`
mit `POST /api/model/jobs/:jobId/keep`. Das ist kein Konzept, das ist ein
Teilsystem.

**Warum nichts es gefangen hat, und das ist die eigentliche Auskunft.**
`docs:check` hat für genau diese Krankheit **schon zwei Regeln**. Die eine
fängt eine Zeile, die sagt, *nichts* sei gebaut, und hält sie gegen ihre eigene
Statusspalte. Die andere fängt Sätze der Form „`X` has no caller" und prüft sie
gegen den Baum — sie wurde nach Befund B107 neu gebaut, weil sie an ihrem
ersten Tag eine hohle Null meldete, und sie liest inzwischen alle 247
verzeichneten Dokumente.

Ihr Muster ist `has|have no [wort] caller(s)`, und sie braucht einen Namen in
Backticks davor. *„are still missing"* trifft sie nicht. *„None; docs only"*
trifft sie nicht. Ein Satz über ein **Teilsystem in Prosa**, ohne Backticks,
ist für sie unsichtbar — nicht aus Nachlässigkeit, sondern weil ihre Kraft
gerade aus dem benannten Symbol kommt.

Das ist B195s Gestalt an der empfindlichsten Stelle: **das eine Tor, das Verben
prüft, kennt ein Verb.**

**Gebaut: eine dritte Regel in `docs:check`**, neben die beiden anderen, weil
sie dieselbe Frage von der dritten Seite stellt. Eine `concept-only`-Zeile,
deren ADR das Produkt zitiert, muss sagen, *was* die Zitate sind. Der Korpus
ist abgeleitet — die Zeilen der Matrix, die Zitate aus dem Baum —, die sechs
Randbemerkungen stehen als Argumente da, und geprüft wird in beide Richtungen:
ein Argument für ein ADR, das niemand mehr zitiert, fällt ebenfalls, weil es
dann eine Nennung beschreibt, die es nicht gibt.

Drei Pflanzungen, drei verschiedene Sätze: eine gebaute Zeile auf
`concept-only` zurückgestellt, ein Argument für ein ADR ohne Nennung, und die
Statusspalte tree-weit umbenannt, so dass die Regel über nichts lief — den Fall
fängt sie selbst ab, denn eine Null über keinem Korpus ist kein Befund (B166).

**Und eine vierte, die ich nicht gepflanzt habe.** Die Berichtigung von ADR
0048 auf `partially implemented` machte den Satz in der README falsch — *„Of
157 architecture decisions, 36 are implemented and 87 partially"* —, und die
Reifegradregel sagte es, bevor ich es merkte. Zwei Tore, die ineinandergreifen,
sind mehr als zwei Tore.

**Die Lehre**, und sie ist B196 eine Windung enger: ein Verb hat keinen Prüfer,
und wo doch einer steht, kennt er die Formulierung, an der er gebaut wurde.
**Wer ein Tor über Prosa baut, baut es über einen Satz, nicht über eine
Aussage.** Die Abhilfe ist nicht ein breiteres Muster — es gibt unendlich viele
Arten, „das gibt es nicht" zu sagen —, sondern ein *anderer Gegenstand*: nicht
der Satz, sondern die Spalte daneben und das, was der Baum dazu tut.

**Das Spiegelbild gemessen, und es trägt nicht.** Die naheliegende zweite Regel
wäre: eine Zeile, die `implemented` sagt, und kein Produktcode zitiert das ADR.
Gemessen: von 36 `implemented`-Zeilen haben **vier** keine Nennung — 0091,
0092, 0095, 0135. Einzeln nachgesehen ist keine davon ein Fund. Drei zeigen auf
`packages/sync`, und dieses Paket zitiert seine ADRs in den **Beschreibungen
seiner Tests** (`describe('bounded reader-custody sync runs (ADR 0091)')`),
nicht in den Produktkommentaren; beim vierten ist der Beleg ein
Design-System-Dokument, wo eine Codenennung falsch wäre.

**Also ist das Messgerät gerichtet, und das ist keine Schwäche, sondern seine
Gestalt.** Die Zitiergewohnheit ist stark genug, dass *„concept-only, und elf
Dateien zitieren es"* ein Widerspruch ist. Sie ist zu schwach, dass
*„implemented, und niemand zitiert es"* irgendetwas wäre. Ein Instrument, das
in eine Richtung einen Widerspruch beweist, beweist in der Gegenrichtung
nichts.

**Und dieselbe Frage an das eigene Muster gestellt**, weil ein Prüfer seinen
eigenen Gegenstand nicht raten darf: dieser Baum zitiert auch bloß, ohne
Präfix — `0142 PE3`, `0078 K6` —, und `ADR nnnn` fände das nicht. Nachgemessen
über alle achtzehn `concept-only`-Zeilen: **keine** wird nur in der bloßen Form
genannt. Heute ist die Lücke leer; dass sie existiert, steht hier, damit der
nächste sie nicht neu entdecken muss.

**B196 — ein verjährter Satz ist ein richtiger Name mit einem falschen Verb
(2026-09-18).** Diese Runde hat fünf Sätze berichtigt, die einmal wahr waren:
sechs Oberflächenversprechen in den Modulmanifesten (B194), die Statusnotiz von
ADR 0118, den `surfaces`-Kommentar in `module.ts`, ein „Gate C; unused" im
Zugriffsregister und einen Satz über eine „offene Hälfte", die längst
geschlossen war. Fünfmal stolpern ist kein Zufall. **Wie misst man das?**

Zwei Sonden, und die Antwort liegt im Unterschied zwischen ihnen.

**Die erste fragte nach Namen.** Jeder in Backticks genannte Bezeichner in
einem Kommentar, den der Baum als Quelltext nicht führt: 182 fehlen in ihrer
eigenen Datei, **19 gibt es im ganzen Baum nicht**. Einzeln gegangen: **null
verjährte Verweise.** Fremde Namen (`AbortError`, `getUserMedia`,
`StrongBoxUnavailableException`), Namen, von denen der Kommentar selbst sagt,
dass es sie nicht gibt (`setEnabled` in `ports.ts`), und vor allem
**absichtliche Vergangenheit** — `picoSupplierDomainPattern`,
`picoRulesDomainPattern` und `picoApprovalDomainPattern` *„**were** three
exported constants … They are one rule now"*. Dieser Baum schreibt seine
Geschichte in die Kommentare; eine Sonde, die das für Verfall hält, misst die
Tugend. Übrig blieb **ein abgeschnittener Name**: der Verweis auf den Prüfer
hieß `AuthenticatedPicoIdentityReaderKeyFreshness`, die Klasse heißt
`…FreshnessSource`. Ergänzt.

**Die zweite fragte nach Verben** — nach Sätzen, die eine *Abwesenheit*
behaupten (`unused`, `no caller`, `nothing calls`, `does not exist`, „keinen
Aufrufer"). **95 im Baum**, und sie zerfallen in drei Klassen:

- **Vergangenheit** (*„`attachPicoSupplier` had no caller"*) — ehrliche
  Geschichte, kann nicht verjähren.
- **Präsens über eine Fähigkeit** — gehalten von den begründeten Listen in
  `check-capability-reach.mjs` und `check-store-writers.mjs`, die ihre
  Argumente nachprüfen und laut fallen, sobald jemand baut. Genau die Bauart,
  die `surfaces:check` in B194 übernommen hat.
- **Präsens über etwas, das keine Fähigkeit ist** — gehalten von nichts.

**Die dritte Klasse ist die, in der beide Funde saßen.**

**`domain-content` trug „Gate C; unused" und hat zwei Routen.** Die Frage kam
aus B195: hat jede Zugriffsklasse eine Route? Alle neun haben eine — 62
Registrierungen, von `home-authority-relay` mit 22 bis `link-intake` mit einer.
Ehrliches Positiv. Aber `domain-content` sind die beiden Gedächtnis-Leserouten,
und Git nennt das Datum: der Satz stammt aus Gate A vom **2026-07-17**, die
Registrierungen kamen **am selben Tag** mit Gate C dazu, ohne ihn anzufassen.
Wer das Register liest, um die Klassen zu verstehen, hätte seither geschlossen,
die Leserschaftsprüfung sei nicht in Gebrauch — auf der Zeile über
`host-admin`.

**Und ein Satz, dessen Zwilling schon korrigiert war.** `event-store.ts`
schreibt über `setPicoSupplierCredential`: *„The secret does not pass through
here. Where it lives at rest is **the open half** of CO1."* Die begründete
Zeile in `store:check` sagt seit dem **2026-08-25** das Gegenteil — *„that was
settled long ago"* —, und sie sagt es, weil sie **damals selbst berichtigt
wurde**: ihre erste Fassung machte genau denselben Fehler. Die Korrektur ging
an ihrem Zwilling vorbei, weil nichts die beiden aneinanderhält. Berichtigt.

**Eine dritte Sonde, nach Zahlen, fand nichts** — und das ist eine gute
Nachricht. Nur zwei Torkommentare nennen überhaupt eine Zählung im Text
(`fifteen of 134`, `six of fourteen`), und **beide tragen ein Datum**. Dieser
Baum datiert seine Zahlen; eine datierte Zahl ist Geschichte und kann nicht
verjähren.

**Die Lehre.** Ein Name hat zwei Prüfer, den Übersetzer und das Auge. Eine Zahl
hat hier ein Datum. **Ein Verb hat nichts.** Deshalb ist die Bauart von
`surfaces:check` die richtige: sie fragt nicht, ob ein Satz einen Gegenstand
*nennt*, sondern ob sein Verb noch *stimmt* — indem ein Wort abwesend bleiben
muss. Wer in diesem Baum nach faulen Sätzen sucht, sucht nach `unused`,
`nothing calls`, `does not exist` — nicht nach Bezeichnern.

**B195 — ein Tor kann breit lesen und schmal fragen (2026-09-18).** B194 endete
mit dem Satz, ein Gegenstand ohne Prüfer sei ein Versprechen. Die nächste Frage
schreibt sich von selbst: **wo sonst behauptet dieser Baum etwas, das kein
Prüfer liest?** Ein Manifestfeld war es. Was noch?

**Das Messgerät: jede geschlossene Liste, über den Syntaxbaum.** Ein
`export const X = [...] as const` ist eine Behauptung darüber, welche Zustände
es gibt. Gemessen: **130 Listen, 608 Wörter.** Davon kommen **19 im ganzen Baum
sonst nirgends vor** — nicht im Produkt, nicht in einem Test. (Der erste
Anlauf war eine Regex und zerbrach an Apostrophen in Doku-Kommentaren, die sie
für Zeichenkettengrenzen hielt. B188s Lehre, zum zweiten Mal bezahlt: *eine
Regex ist kein Leser von Quelltext.*)

**Die 19 einzeln gegangen, und die Mehrheit ist gesund** — auf zwei
verschiedene Arten, die beide Regel 8 sind:

- `picoHomeEventTypes` nennt fünf Ereignisse, und drei erzeugt nichts. Das ist
  richtig so: die Liste ist eine **Sperrliste**. Die Foundation-API weist genau
  diese Namen ab, und ein Erzeuger wäre der Fehler, nicht sein Fehlen.
- Die Kleidungsfamilien, die Erzeuger-Status, die Linux-Schlüsselspeicher:
  gegen sie wird **geprüft**. Die Wörter kommen von außen — aus einer
  Registerdatei, von einer Plattformsonde — und brauchen nie ein Literal.

Übrig bleiben zwei, und beide stehen in einer Datei, die nichts liest.

**Der erste: ADR 0118 O2s Vokabular der Nichtverfügbarkeit.**
`packages/protocol/src/offline-floor.ts` erklärt `picoCapabilityOutcomes`,
`picoUnavailabilityReasons`, `picoProviderClasses` und die drei Typen daneben.
**Nennungen außerhalb der eigenen Datei: null.** `PicoCapabilityOutcome` — der
Typ, von dem der ADR sagt, er mache Nichtverfügbarkeit *zu einem getippten
Ergebnis statt zu einem leeren* — tippt nichts.

Der ADR ist dabei ehrlich: O2 sei „vocabulary and rules implemented;
enforcement still binds **the first model integration**". Das ist eine
Vertagung mit einer **benannten Bedingung** — und die Bedingung ist
eingetreten. `apps/core/src/model-runtime.ts` ist die Modellintegration, sie
zitiert O2 beim Namen (*„Slow is unavailable, not slow. ADR 0118 O2's rule,
given a number here for the first time"*), und sie spricht **eigene sieben
Wörter**: `PicoModelDispatchRefusal`, mit `provider_unreachable` und
`provider_did_not_answer_in_time` dort, wo O2 `no_network` und `timeout` sagt.
Eine dritte Datei übersetzt die wieder in eine dritte Menge
(`model-provider-state.ts`: `provider_unreachable: 'did_not_answer'`).

**Was fehlt, ist das gemeinsame Wort, nicht die Sicherheit.** Das ist die
wichtige Einschränkung: `PicoModelDispatchError` ist getippt, es entsteht
nirgends ein leeres Ergebnis, um das herum sich etwas schleichen könnte. Die
Gefahr, die O2 benennt, ist nicht da. Die Wörter, die O2 dagegen gebaut hat,
sind es auch nicht.

**Der zweite, und der ist schärfer: `staticTokenCeiling`.** In
`apps/core/src/access-classes.ts` steht

    /** Classes the principal-less static token may satisfy (ADR 0075: its ceiling). */
    export const staticTokenCeiling: readonly AccessClass[] = ['public', 'foundation-diagnostic'];

und dieser Name kommt **im ganzen Baum genau einmal vor**: hier. Kein Produkt,
kein Test, kein Tor liest ihn.

Durchgesetzt wird die Decke von der **Reihenfolge einer `if`-Kette** im
`onRequest`-Haken: `public` geht durch, `link-intake` geht durch,
`setup-bootstrap` entscheidet am Hostzustand, `foundation-diagnostic` lässt
`static-token` ausdrücklich zu — und ganz unten fängt ein Durchfallen alles
Übrige mit *„needs the operator role"*. Die Decke ist also eine
**Eigenschaft der Zweigfolge**. Daneben steht sie zweimal als Prosa: einmal am
Durchfallen (*„its ceiling is foundation-diagnostic (ADR 0075)"*), einmal bei
`domain-content` (*„the principal-less static token is capped at
foundation-diagnostic and cannot reach here"*).

**Drei Sätze und eine Konstante sagen dieselbe Grenze, und keiner davon zieht
sie.** Wer eine Zugriffsklasse hinzufügt oder einen Zweig verschiebt, kann die
Reichweite des Tokens ändern, ohne die Konstante anzufassen — und nichts würde
widersprechen, weil die Konstante keinen Leser hat. Es ist die Datei, die
selbst schreibt: *„The registry is the enforcement mechanism, not a
checklist."* Für die Klassen gilt das; für ihre Decke nicht.

**Warum kein Tor das gesehen hat, und warum das B190 nicht widerspricht.**
`check-capability-reach.mjs` trägt genau den richtigen Satz — *„A capability
that nothing calls is a capability nobody has"* — und fragt ihn an
`^export function` und `^export class`. **Ein Vokabular ist weder das eine noch
das andere.** B190 hat 53 Tore mit einem Haken an `readFileSync` vermessen und
gefunden, dass keines *weniger Dateien liest*, als sein Satz behauptet; dieses
liest den ganzen Baum. B190 sagt im letzten Absatz selbst, ein Tor über Tore
prüfte nur, was ein Prüfer *anfasst*. Hier ist die andere Achse: **ein Tor kann
breit lesen und schmal fragen**, und das sieht kein Haken.

**Zwei Gegenproben, damit niemand sie nachmisst.** Ob das Muster des Tors noch
auf anderen Achsen schmal ist: (1) Pfeilfunktionen — der Syntaxbaum findet in
`packages/*/src` **null** aufrufbare Ausfuhren, die `^export function` nicht
sieht; dieser Baum schreibt jede exportierte Funktion gleich. (2)
Unterverzeichnisse — der apps-Durchgang liest jede Wurzel nur auf oberster
Ebene, und genau eine Wurzel hat ein Unterverzeichnis
(`apps/companion-shell/src/renderer`), das keine einzige `.ts`-Datei hält. Die
Schmalheit ist also genau eine: **ein Wortschatz ist keine Funktion.**

**Und eine dritte Gegenprobe, die eine ganze Klasse falscher Funde killt.**
Die naheliegende Verallgemeinerung wäre: *welcher Protokoll-Wortschatz wird
außerhalb seines Pakets nie genannt?* Gemessen: **42 von 98** — und das ist
kein Befund, sondern die gesunde Form. Ein Protokoll-Wortschatz wird durch
seinen **eigenen Prüfer** verbraucht; `parsePicoModuleManifest` hält
`picoModuleKinds` fest, und danach reist der *Wert* getippt bis ins Dashboard,
während der *Name* im Paket bleibt. Was `offline-floor.ts` zum Fund macht, ist
nicht das Fehlen eines Namens, sondern **eine benannte Bedingung, die
eingetreten ist.**

**Eine vierte Gegenprobe, und sie fand die blinde Stelle ein zweites Mal.**
`check-capability-reach.mjs` hat zwei Durchgänge, und ihre Muster sind nicht
dasselbe: der Paketdurchgang sucht `^export function` **und**
`^export class`, der apps-Durchgang nur `^export function`. In den Wurzeln des
apps-Durchgangs stehen **57 exportierte Klassen**, die er nie ansieht.

Nachgemessen mit seiner *eigenen* Regel — eigene Datei als Aufrufer
übersprungen, dann „nur von sich selbst benutzt" als harmlos gezählt (Regel 11:
eine andere Regel misst eine andere Frage): drei sind harmlos, **eine hat
überhaupt keinen Aufrufer**: `SupplierCredentialCrypto`.

**Und sie ist gehalten — von einem anderen Tor.** `store:check` begründet den
Schreiber daneben, `setPicoSupplierCredential`, und der Eintrag ist besser als
meine Lesart: er wurde am **2026-08-25 korrigiert**, weil seine erste Fassung
genau meinen Fehler machte. Er sagt, wo die Berechtigung ruht, sei *längst
entschieden* — in der Domäne, in die ihr Lieferant sich gehängt hat, unter
deren KEK, so dass ein Domänenschredder sie mitnimmt. Was fehlt, ist jemand,
dem man eine Berechtigung übergeben könnte: der einzige Lieferant, den es gibt,
ist eine lokale Git-Arbeitskopie, deren eigener Kopf sagt, dass sie keine
braucht.

Also **kein Fund, sondern ein Zustandsbericht**: die blinde Stelle des apps-
Durchgangs ist echt und heute folgenlos, weil ihr einziger Kandidat vom
Nachbartor gehalten wird. Das gehört aufgeschrieben, damit es niemand
nachmisst.

**B194 — vierzehn Versprechen, und sechs davon gibt es nicht (2026-09-18).**
B193 endete mit dem Rat, den es selbst gefunden hatte: **geh eine Person durch
ihre Handlung, nicht eine Liste durch ihre Beschriftungen.** B192 ging dem
Löschen nach; das Spiegelbild ist das Lesen — *was kann eine Person von dem
zurücklesen, was ihr Zuhause über sie hält?* —, und der empfindlichste Fall ist
der Standort.

**Die Handlung, ganz gegangen.** Eine Person stimmt der Aufzeichnung für
`spatial-recall` zu; ohne diese Zustimmung antwortet der Home
`capture_not_consented`. Ihr Gerät misst und schickt: `home.observations.submit`.
Der Home schreibt nach `pico_observation`, kehrt nach Alter, löscht beim
Domänenschredder. **Und dann sieht sie niemand.** `picoObservationWindow` ist
der einzige Leser der Tabelle im ganzen Baum, und sein einziger Aufrufer ist
sein eigener Test.

Daneben liegt ein **zweiter Entwurf für dieselbe Sache**: ADR 0126 P3 lässt das
Gerät selbst ableiten und schickt nur das Ergebnis
(`home.observation.derived.keep`) — „und der Home sieht die Messungen nie",
sagt der Kommentar. Auch dieser Weg endet im Nichts:
`condensePicoCompanionObservations` und
`keepPicoCompanionDerivedObservation` rufen nur Tests,
`PicoSpatialCapturePorts` hat nirgends eine Implementierung, und
`picoParkingAnswer` — die Funktion, die aus der Ableitung den Satz macht, den
ein Mensch liest — hat überhaupt keinen Aufrufer. Zwei Entwürfe, beide
unfertig, und der eine schreibt dabei Standortdaten weg.

**Und dann die Liste, die das hätte sagen sollen.** Jedes Modul erklärt in
seinem Manifest, was eine Person erreichen kann. `spatial-recall` nennt drei
Sätze. Gemessen über alle vier ausgelieferten Module, vierzehn Sätze:

| Modul | Sätze | davon gebaut |
|---|---|---|
| calendar | 5 | 5 |
| depot | 5 | 3 |
| home-assistant | 1 | 0 |
| spatial-recall | 3 | 0 |

**Sechs von vierzehn nennen etwas, das es nicht gibt** — und zwei von vier
Modulen haben keinen einzigen wahren Satz. `depot` erscheint in keiner Quelle
von `apps/web/src`, obwohl es zwei Dashboard-Oberflächen verspricht.
`recordPicoConnectorObservations` ist die *einzige* Oberfläche von
`home-assistant`, und ihr einziger Aufrufer ist ihr Test: was ausgeliefert
wird, ist ein Transport ohne etwas dahinter. `parking` erscheint in keiner
Quelle des Homes.

**Warum das niemand gemerkt hat.** `parsePicoModuleManifest` prüft, dass
`surfaces` eine nichtleere Liste verschiedener Zeichenketten ist — die Form,
nie den Inhalt. Und `PicoModuleView`, was vom Modul zur Person reist, trägt
`surfaces` gar nicht: die Liste erreicht auch keinen Menschen, der
widersprechen könnte. Eine Behauptung, die weder ein Prüfer noch ein Leser je
sieht, ist eine Behauptung, die nur altern kann.

**Gebaut: `surfaces:check`**, der 56. Kettenschritt, hinter `module:check`,
weil er dieselben gebauten Manifeste liest, die das Produkt lädt. Das Präfix
eines Satzes sagt, wo zu suchen ist — vier Schichten, und ein unbekanntes
Präfix fällt, statt durchzugehen. `Pico Link: <operation>` braucht keinen
Eintrag: der Name steht im Satz, und der Prüfer sucht sein `case` im Home.
Alles andere nennt einen Anker oder ist als **unbuilt** begründet, und ein
unbuilt-Eintrag ist *geprüft, nicht geglaubt*: er nennt ein Wort, das in seiner
Schicht abwesend bleiben muss. Wer die Oberfläche baut, bringt das Argument zu
Fall, statt es zu überleben.

Fünf Pflanzungen, fünf verschiedene Sätze: ein umformulierter Satz (zweimal —
der Satz ohne Ort *und* der verwaiste Eintrag), ein `Android widget:`-Präfix,
eine Link-Operation, die der Home nicht beantwortet, ein umbenannter Anker, ein
aufgetauchter Aufrufer. Der erste Lauf fiel von selbst, und zu Recht: das
gesuchte Wort war eine Funktion, die **in ihrer eigenen Schicht definiert** ist
und sich darum selbst fand. Was einer unbuilt-Oberfläche fehlt, ist ein
*Aufrufer*, nicht ein Wort — `except` nennt die erklärende Datei, und eine
`except`, die ins Leere zeigt, ist selbst ein Fehlschlag, damit ein Umzug der
Erklärung die Frage neu stellt statt sie zu verstecken.

**Was der Prüfer nicht kann**, und es steht in seinem Kommentar: einen Satz
lesen. Ob eine Tabelle wirklich den Commit zeigt, weiß kein Skript. Ob das Wort
`depot` im Dashboard überhaupt vorkommt, weiß es — und das hat alle sechs
gefunden.

**Die Lehre**, und sie ist der Zwilling von B166 (*ein Prüfer ohne Gegenstand
ist kaputt und nicht sauber*): **ein Gegenstand ohne Prüfer ist ein Versprechen,
und Versprechen altern in die Unwahrheit.** Vierzehn Sätze standen da, seit die
Module geschrieben wurden; sechs waren nie wahr, und nichts im Baum hätte je
widersprochen.

**B193 — Ein Zitat ist kein Beweis, und sein Fehlen keine Lücke
(2026-09-18).** B192 fand eine entschiedene Eigenschaft ohne Tür: ADR 0078 K9
beschreibt die host-lokale Zerstörung einer Reader-Custody-Domäne, und es gibt
sie nicht. Gefunden habe ich sie, indem ich einem Schredder nachgegangen bin —
also durch Zufall. Dieselbe Frage systematisch: **welche beschriftete
ADR-Klausel zitiert der Code nirgends?**

Dieser Baum beschriftet seine Klauseln (K6, K9, RY4, Q5, M3) und zitiert sie in
Kommentaren. Gezählt: **429 Klauseln in 72 ADRs, 259 zitiert, 170 stumm.** Das
ist zu viel zum Lesen und beweist nichts — eine Klausel kann umgesetzt sein,
ohne dass ein Kommentar sie nennt. Die Gestalt von K9 war schärfer: **eine
einzelne stumme Klausel in einem sonst durchzitierten ADR.** Danach sortiert
blieben **22** Kandidaten, und die sieben mit genau einer stummen Klausel habe
ich gelesen.

**Vier sind zu Recht stumm, und sie sagen es selbst:** `0116 W6` beginnt mit
*„(open; binds the first free-text Link operation)"*, `0102 M6` mit *„Future:"*,
`0152 SE7` und `0107 D5` mit *„Done"* — Statusnotizen, keine Regeln. Wer eine
Notiz zitieren wollte, zitierte ein Datum.

**Drei sind wirkliche Regeln, und alle drei halten:**

- **0077 C3** — *„The authorization target is explicit in the route … never
  inferred from the body, a header or a default."* Drei Routen tragen
  `:privacyDomain`, und der einzige Rumpfbezug im ganzen `app.ts` ist
  `body.confirm !== privacyDomain`: der Rumpf **bestätigt** den Pfad, statt ihn
  zu ersetzen. Genau C3.
- **0121 J5** — *„audit records carry no content, and no unauthorized request
  produces one."* Alle sieben `auth.*`-Einträge gehören zu gelungenen
  Handlungen; einen fehlgeschlagenen Login schreibt nichts auf. Zwei Handler
  sahen verdächtig aus, weil ein Ereignis textlich neben einer 4xx-Antwort
  steht — in beiden kehrt die Antwort **vorher** zurück. Meine Nähe-Heuristik
  hatte sie zusammengebracht, nicht der Code.
- **0075 A6** — die Verbote über Anmeldedaten, die andere Tore ohnehin halten.

**Das Ergebnis ist ein Negativbefund mit einer brauchbaren Lehre.** Von 170
stummen Klauseln war die eine, die etwas fehlen ließ, schon gefunden — und zwar
nicht durch Zählen von Zitaten, sondern dadurch, dass ich eine Handlung bis zum
Ende gegangen bin. **Ein Zitat ist kein Beweis, und sein Fehlen keine Lücke:**
dieser Baum setzt mehr um, als er nennt. Wer die nächste K9 sucht, geht besser
eine Person durch ihre Handlung als eine Liste durch ihre Beschriftungen.

**B192 — Ein Raum, den man anlegen, aber nicht beenden kann (2026-09-18).**
Die Frage war die einfachste, die eine Person stellen kann: **was passiert,
wenn ich das hier loswerden will?** Sechzehn Tabellen tragen eine
Domänenspalte; der Schredder ist eine Kaskade mit drei Wegen, und ich bin sie
bis zum Ende gegangen.

**Für Host-Custody stimmt alles.** `cryptoShredDomain` löscht die
Schlüsseldateien der Domäne von der Platte, `memory_item` wird als unlesbar
markiert, ein Anschluss löscht die Beobachtungen und ein zweiter leert die
Worte in der Modelljob-Warteschlange. Der Produktaufruf reicht beide Anschlüsse
mit je einem Satz daneben, und die Reihenfolge ist begründet: erst die
Schlüssel, damit ein Fehlschlag dazwischen Lesungen ohne Schlüssel hinterlässt
und nicht Schlüssel ohne Lesungen.

**Für Reader-Custody gibt es nichts.** Der Schlüsselspeicher weist den
Schredder ausdrücklich ab — `assertHostCustodyRawKek` wirft mit ADR 0078 K6 im
Wortlaut, weil das Home für diese Klasse gar keine Schlüsseldatei halten darf.
Das ist richtig. Nur müsste dann die andere Tür existieren, und **ADR 0078 K9
sagt seit jeher, dass es sie gibt:**

> *Reader-custody: shred is host-local destruction and every surface offering
> it must present it as such, never reusing the host-custody wording.*

Nachgezählt: `apps/core` bedient **sieben** Reader-Custody-Routen — Domänen
anlegen, Leser- und Schreibererteilungen, deren Lebensläufe,
Schlüsselrotationen, Einträge. **Alle sieben sind `POST`. Keine löscht.** Und
jedes `DELETE FROM pico_reader_custody_*` im Produktcode steht in `reconcile`,
das aufräumt, wenn ein Satz seine Prüfung nicht mehr besteht — **Reparatur,
keine Wahl.**

**Damit kann eine Person einen Reader-Custody-Raum anlegen, hineinschreiben,
jemanden hereinlassen, dessen Zugang beenden und das Schloss wechseln — aber
nicht sagen: das soll weg.** `progress.md` zählt genau diese fünf Fähigkeiten
auf und nennt die sechste nicht, auch nicht unter den offenen Flächen. Die
Entscheidung ist getroffen und aufgeschrieben; sie ist nur aus den Listen
gefallen.

**Was dabei nicht fehlt, gehört dazu**, damit die Lücke ihre richtige Größe
behält: Rotation gibt es (das Schloss wechseln, vorwärts), Widerruf einer
Erteilung gibt es, und der Geheimtext liegt beim Home als Chiffre, die es nicht
lesen kann. Was fehlt, ist das Vergessen — und K9 sagt auch, wie es klingen
muss: **host-lokal**, ohne die Worte der Host-Custody zu borgen, weil die
Schlüssel bei den Lesern liegen und höchstens eine *Bitte* um Zerstörung reisen
kann.

**B191 — Zwei Flächen, und nur eine fasst ihre Ablehnungen in Sätze
(2026-09-18).** B190 endete mit dem Satz, dass dieser Baum zwei Paare hat, bei
denen ein Prüfer nur eines kennen könnte — zwei Speicher und zwei Flächen. Die
nächste Frage war die an das Produkt statt an die Prüfer: **sieht eine Person je
einen rohen Ablehnungsnamen?**

**Die Schale antwortet vorbildlich.** `contract.ts` hält eine Tabelle
gesprochener Sätze, und ihr Rückfall ist selbst ein Satz: wer eine unbekannte
`invalid_*`-Ablehnung auslöst, liest *„Pico refused what this window sent
(…). That is a defect in Pico and not something you did; nothing was
changed."* Der Name steht darin — aber **eingefasst**, mit der Auskunft, wessen
Fehler es ist. Ihr eigener Kommentar sagt warum: *„sonst läse eine Person
`not_a_reader` und wüsste nicht, ob sie etwas falsch gemacht hat oder ob Pico
etwas nicht darf."*

**`apps/web` hat dieselbe Frage anders beantwortet, und zwar an vier Stellen
richtig und sonst gar nicht.** Vier benannte Fehlerklassen fangen vier
Ablehnungen ab und machen Sätze daraus — `PicoModuleHasDependentsError` sagt
sogar, *welches* Modul das andere festhält. Alles daneben geht durch
`formatUnknownError`, und das ist `error.message` unverändert. Von dort führt
ein gerader Weg: `state.errorMessage` → `errorBanner.textContent`.

**Die Kette ist nachgegangen, nicht vermutet.** `POST /api/memory/encryption`
antwortet `400 { error: 'invalid_memory_encryption_decision' }`;
`describeFailure` nimmt `data.error` und gibt ihn wörtlich zurück; der Zeichner
schreibt ihn ins Banner. Eine Person sieht
**`invalid_memory_encryption_decision`** und weiß nicht, ob sie etwas falsch
gemacht hat.

Gezählt von der Seite der Fläche: `apps/web` ruft **18 Routen**, davon können
**vier** einen rohen Namen im `error`-Feld liefern, und es sind **acht
verschiedene** Namen. Eine davon fängt eine Klasse ab; **sieben erreichen das
Banner uneingefasst**:

| Route | roh |
| --- | --- |
| `POST /api/home/modules` | `invalid_authority_list_arguments`, `invalid_authority_submit_arguments`, `no_founding_record`, `unknown_authority_resource` |
| `POST /api/model/providers/:entryId/narrowing` | `pico_model_provider_entry_not_found` |
| `POST /api/link/relay-identity` | `invalid_pico_link_relay_identity` |
| `POST /api/memory/encryption` | `invalid_memory_encryption_decision` |

**Das Schärfste steht in einem einzigen Handler.** Beim Abschalten eines Moduls
wird `pico_module_has_active_dependents` zu *„… stays on: … depends on it.
Switch those off first."* — und die vier Geschwister derselben Route fallen
durch `formatUnknownError`. Im selben `catch`, drei Zeilen auseinander: eine
Ablehnung mit Stimme, vier ohne.

Das ist keine vergessene Fläche, sondern eine halb erledigte: wer die vier
Klassen geschrieben hat, hat die Frage gesehen und für vier Fälle beantwortet.
Wie die anderen klingen, ist eine Entscheidung über **Worte für eine Person**
und steht deshalb in `.agent-context.md` und nicht hier.

**B190 — Die Jagd nach dem schmalen Gegenstand, und sie ist zu Ende
(2026-09-17).** B187 und B189 fanden dreimal dieselbe Krankheit: ein Prüfer,
dessen **Gegenstand schmaler ist als seine Aussage**. Zweimal war es meins,
einmal ein Tor von vor Monaten. Dreimal durch Zufall ist ein Muster, und ein
Muster misst man, statt auf das vierte Mal zu warten.

**Das Messgerät: einen Haken an `readFileSync` und `readdirSync` legen und
zählen, welche Pfade ein Tor wirklich öffnet.** Ein Tor kann nicht behaupten,
breiter gelesen zu haben, als es Dateien angefasst hat. Über 53 Tore gefahren
(`vacuity:check` und `index:check` ausgelassen, weil das eine alle anderen
startet und das andere eine Datenbank baut).

**Zwei Fehlalarme meiner ersten, groben Runde** gehören dazu: ich hatte nach
den Zeichenketten `'apps'` und `'packages'` im Quelltext gesucht und daraufhin
`awaited-secrets` und `one-voice` für eng gehalten. Beide lesen 284 und 237
Pfade quer durch den Baum — sie bauen ihre Pfade nur anders. **Wonach ein Tor
aussieht, ist nicht, was es liest.**

**Das Ergebnis ist ein Negativbefund, und er schließt die Frage.** Kein
weiteres Tor liest weniger, als sein Satz behauptet. Die eigentliche Auskunft
steckt in der Verallgemeinerung: die Krankheit entsteht dort, wo **etwas
zweimal existiert** und ein Prüfer nur eines davon kennt. Dieser Baum hat zwei
solche Paare:

- **Zwei Speicher** — das Schema des Homes in `migrations.ts` und die vier
  Tabellen des Relays in seinem Store. Das war das Paar, das keiner sah; drei
  Tore sind jetzt geweitet (B187, B189).
- **Zwei Flächen** — der Zeichner der Companion-Schale und `apps/web`. Hier
  liest **jedes** der neun Flächentore beide, nachgemessen an den Pfaden:
  `form-labels` 13 gegen 50, `style-names` 14 gegen 51, `one-voice` 8 gegen 40.
  Wer diese Tore gebaut hat, hat an beide gedacht.

Wenn ein drittes Paar entsteht, entsteht die Krankheit mit ihm. Das ist kein
Tor wert — ein Tor über Tore prüfte, was ein Prüfer *anfasst*, und nicht, was
sein Satz behauptet; die Lücke dazwischen ist genau das, was ein Mensch lesen
muss. Aber der Satz gehört ins Runbook: **wer ein Tor baut, zählt zuerst, wie
viele es davon gibt, worüber es spricht.**

**B189 — Vier Tabellen, die nie jemand nach ihrem Wachstumsende gefragt hat
(2026-09-17).** B187 fand ein Tor, dessen Satz breiter war als sein Gegenstand.
Die nächste Frage war, ob das nur meins war. Es war nicht:
**`check-store-ceilings.mjs` liest seit seiner Einführung ebenfalls nur
`apps/core/src/migrations.ts`.** Seine Ausgabe sagt „48 tables" und meint die
des Homes; die **vier des Relays** hat es nie gesehen.

Angefangen hatte die Messung woanders — bei B165s Satz *„was niemand mehr
anfasst, wird nie wieder angefasst"*, verallgemeinert: **jede Spalte, die ein
Ablaufdatum trägt, wird sie auch gekehrt?** Zehn Tabellen tragen eine. Das
Ergebnis war ein sauberer Negativbefund: zwei werden nach ihrem Ablauf gekehrt,
sechs tragen ein `valid_until`, das ein *Gültigkeitsfenster* ist und keine
Verfallsfrist — die Zeile ist Geschichte und soll bleiben —, und die zwei, die
gar nicht gelöscht werden, stehen beide im Wachstumsende-Tor mit einer
Begründung, `pico_model_job_queue` sogar ausdrücklich als *„unbounded in rows,
and this entry says so rather than covering it up"*.

**Nur galt das alles für 48 von 52 Tabellen.**

**Und in den vier übrigen steckt ein echtes Loch.** `relay_mailbox` sagt in
seinem eigenen Kommentar, was es tut: *„A revoked mailbox stays, because ADR
0147 RY4 needs the revoked answer to be possible at all."* Das ist richtig und
gut begründet — ein widerrufenes Postfach zu vergessen machte aus einer
absichtlichen Beendigung einen Tippfehler, den der Absender sich selbst
zuschreibt. Nur: **die Kontenquote zählt ausschließlich die *offenen*.** Der
Prüfsatz beim Anlegen lautet
`COUNT(*) … WHERE account_digest = ? AND status = 'open'`, und es gibt im ganzen
Relay **kein einziges `DELETE FROM relay_mailbox`**.

Anlegen und Zurückziehen brauchen beide nur den Kontokopf — einen
Inhaberausweis, den der Betreiber außerhalb der Bahn ausgibt. Wer einen hat,
kann anlegen, zurückziehen, anlegen: die Quote bleibt eingehalten, die Tabelle
wächst. Gemessen an der echten Tabellenform und der eigenen Ratengrenze des
Relays (`picoRelayAccountRequestsPerMinute = 120`, also zwei Anfragen je neue
Zeile):

| | |
| --- | --- |
| je widerrufenem Postfach | **234 Byte** |
| am Tag, aus **einem** Konto | **19 MB** |
| im Jahr | **6,9 GB** |

Das ist keine Lücke in der Absicht, sondern in der Zählung. Und sie steht
ausgerechnet dort, wo die Haltung ausdrücklich aufgeschrieben ist: der
Widerrufsweg zitiert sie zwei Zeilen weiter oben selbst — *„auf einem Relay,
dessen ganze Haltung ist, so wenig zu halten wie möglich (ADR 0147)"*.

Wie es zugeht, ist eine Entscheidung und keine Aufräumarbeit: ein widerrufenes
Postfach einfach zu löschen ist genau das, was ADR 0147 RY4 verbietet. Sie
steht in `.agent-context.md`.

**B188 — Acht Suchwege, die kein Plan je wählt (2026-09-17).** Die letzte
ungestellte Frage an das Schema: **jeder Index kostet jeden Schreibvorgang.**
Wird jeder benutzt? Diesmal habe ich nicht gerechnet, sondern **SQLite selbst
gefragt**: das Schema in eine frische Datenbank gebaut, jede Anweisung des
Produktcodes durch `EXPLAIN QUERY PLAN` geschickt und eingesammelt, welche
Indizes ein Plan nennt.

**371 `.prepare(…)`-Aufrufe im Produktcode, 369 davon planbar** — und **neun
von 39 Indizes nennt kein einziger Plan.** Einer davon ist zu Recht dabei:
`idx_pico_identity_root_rotation_one_pending` ist ein `UNIQUE`-Teilindex, also
eine **Regel** („eine schwebende Rotation je Vorgänger") und kein Suchweg. Ein
Plan wählt ihn nie, weil er nicht dafür da ist.

Bleiben **acht Suchwege**, und sie zerfallen in drei Arten:

- **Zwei liegen auf `pico_event`**, dem Kernprotokoll: `(stream, lamport)` und
  `(device_id, lamport)`. Nichts im Produktcode filtert nach `stream` oder
  `device_id`. Das Protokoll ist als später replizierbar entworfen (ADR 0014),
  und beide sehen nach Vorarbeit dafür aus — nur zahlt sie jedes Ereignis
  **heute**. Gemessen: 50.000 Ereignisse einfügen kostet mit ihnen 295 ms, ohne
  sie 205 ms. **Ein Drittel der Schreibzeit für zwei Wege, die niemand geht.**
- **Einer ist Vorarbeit mit sichtbarem Ziel:** `idx_memory_item_place`, ein
  Teilindex auf `(latitude_deg, longitude_deg)` für aktive Einträge mit
  Koordinate. Die Frage, die ihn benutzen würde, gibt es noch nicht — Spatial
  Recall fehlt der Aufrufer der Ableitung, was `progress.md` seit langem sagt.
- **Einer ist benutzbar und verliert trotzdem:**
  `idx_pico_home_membership_identity` auf
  `(pico_identity_fingerprint_hex, status)`. Fragt man nur nach dem Fingerdruck,
  **wählt** ihn der Planer. Nur nennt jede wirkliche Abfrage auch `home_id`, und
  dann gewinnt `idx_pico_home_membership_home`. Kein toter Index, sondern ein
  überholter.
- **Vier bewachen Spalten, nach denen nichts fragt:**
  `memory_key_envelope (domain_id)`, `pico_share_envelope (home_id, …)`,
  `pico_home_device_lifecycle_transition (pico_identity_fingerprint_hex, …)` und
  `schema_migration_audit (finished_at)`.

**Das Tor dazu ist `index:check`, der 55. Kettenschritt** und der erste, der
eine Wegwerf-Datenbank baut, um seine Frage zu stellen. Die neun stehen als
begruendete Eintraege darin, und `constraint` wird nachgerechnet: der Index muss
wirklich `UNIQUE` sein. Vier Pflanzungen, vier eigene Saetze - ein neuer Index
ohne Plan, eine Regel, die keine ist, ein Eintrag fuer etwas, das es nicht gibt,
und ein Eintrag fuer etwas, das ein Plan doch waehlt. Es steht **hinter
`pnpm build`**, weil es `dist/migrations.js` faehrt; die erste Pflanzung biss
genau deshalb nicht.

**Und die eigentliche Lehre steckt im Weg dorthin: fünf Anläufe mit einer
Regex, fünf verschiedene Fehler.** Jeder hätte eine falsche Zahl
veröffentlicht:

1. `EXPLAIN QUERY PLAN` braucht Werte für die `?`-Platzhalter — ohne sie
   scheiterten 215 von 294 Anweisungen, und die Messung hätte 32 Indizes als
   ungenutzt gemeldet.
2. Das Relay-Schema fehlte in der Datenbank, also fielen seine Abfragen aus.
3. Die eine Anweisung, die `idx_pico_event_type` nutzt, steht in **doppelten**
   Anführungszeichen; mein Muster las nur Backticks und einfache.
4. **Backticks in Doku-Kommentaren** verschieben die Paarung der
   Vorlagen-Zeichenketten — und dieser Baum schreibt Bezeichner in Backticks in
   jeden zweiten Satz. Danach fehlte immer noch die Abfrage, die
   `idx_pico_home_domain_read_grant_reader` benutzt, und mit ihr stand ein
   **nachweislich falscher Eintrag** in der Liste.
5. Erst der **Syntaxbaum** — `.prepare(…)` als Aufrufausdruck, sein einziges
   Argument als Wortlaut — fand 371 statt 301 Anweisungen und 369 planbare
   statt 298. Der falsche Eintrag verschwand von selbst.

Das ist Sondenregel 4 („rate die Grenzen eines Rumpfes nicht, frag den
Übersetzer") in ihrer allgemeinen Form: **eine Regex ist kein Leser von
Quelltext.** Der Baum weiß das seit B163, wo `check-write-transactions.mjs`
aus demselben Grund zum Syntaxbaum wechselte; ich habe es hier fünfmal neu
gelernt.

**B187 — Ein Tor, dessen Satz breiter war als sein Gegenstand (2026-09-17).**
Die erste Frage nach B185 galt meinen eigenen Toren von gestern. `column:check`
sagt *„every column a Home stores is asked for somewhere"* — und liest
`apps/core/src/migrations.ts`. Das Relay hält **vier eigene Tabellen** in
`apps/relay/src/store.ts`, und beide neuen Tore haben sie nie angesehen. Das ist
B166s Satz noch einmal, von der dritten Seite: nicht *ein Prüfer ohne
Gegenstand*, sondern einer, dessen **Gegenstand schmaler ist als seine Aussage**.

**Was die Weitung gefunden hat.** Die 19 Relay-Spalten sind sauber — alle
abgefragt, kein einziger Fund. Die zwei Wortschätze des Relays aber zeigten
genau die Gestalt aus B185, und diesmal beide Spielarten:

- `relay_mailbox.status IN ('open', 'revoked')` **hat** ein benanntes
  Gegenstück, `PicoLinkMailboxStatus` im Protokoll — und der Relay-Store
  schreibt daneben trotzdem `'open' | 'revoked'` von Hand hin. Ein Name, der
  da ist und nicht benutzt wird.
- `relay_account.status IN ('active', 'revoked')` hatte **keinen**: viermal
  ausgeschrieben — im Relay-Store, in der Companion-Schale zweimal, im
  Protokoll selbst — und ein fünftes Mal in SQL. Heißt jetzt
  `picoRelayAccountStatuses`.

Nach beidem sehen die Tore **437 Spalten über 52 Tabellen** und **26
Wortschätze**, und jede Pflanzung ins Relay-Schema beißt.

**Die Benennung hat sich sofort selbst bewiesen.** Kaum hieß der Kontostatus,
meldete `copies:check` **zwei weitere Kopien** in `packages/sync` — die es
vorher nicht sehen konnte, weil es über exportierte Namen wacht und es keinen
gab. Genau das ist der Satz aus B185, jetzt als Ereignis statt als Behauptung.

Und die zwei waren **keine** Kopien: `readerStatus` sagt, ob eine
*Leseerteilung* noch gilt, nicht ob ein *Relay-Konto* benutzt werden darf.
Dieselben zwei Wörter, zwei Gegenstände. `copies:check` hat für genau diesen
Fall seit seiner Einführung eine Schublade — *„ein Vokabular mit denselben zwei
Wörtern kann zweimal etwas anderes heißen, das wäre ein Grund, und ein Grund
gehört aufgeschrieben"* — und sie stand leer. Sie ist es nicht mehr.

**Und ein Fund im eigenen Werkzeug.** `check-sql-vocabularies.mjs` trennte
Wortschatz-Wörter mit `U+001F` — geschrieben als Escape-Folge, auf der Platte
gelandet als **zwei echte Steuerzeichen**, die kein Leser sieht. Es
funktionierte; nur stand im Quelltext etwas, das niemand lesen konnte. Jetzt
trennt ein Zeilenumbruch, mit dem Satz daneben, warum das sicher ist: die
Wörter sind SQL-Zeichenkettenliterale aus einem `CHECK` und können keinen
enthalten.

**B186 — Eine Haltbarkeit, die durch Weglassen entschieden wurde
(2026-09-17).** B185 hat die Datenbank als letzten Wächter befragt. Eine Frage
weiter: **was überlebt einen Stromausfall?** Der Store setzt genau ein Pragma —
`journal_mode = WAL`, nackt, ohne Satz daneben, in `event-store.ts` wie im
Relay. Was WAL über die Haltbarkeit entscheidet, hängt an einem zweiten Pragma,
und das setzt niemand: `synchronous` bleibt auf **NORMAL**. Kein ADR im ganzen
Baum nennt WAL oder `synchronous`.

Gemessen an einer laufenden Datenbank: `journal_mode=wal`, `synchronous=1`,
`foreign_keys=1`, `busy_timeout=5000`. Zwei davon setzt der Code nicht —
better-sqlite3 schaltet sie selbst ein. (Das korrigiert meine erste Vermutung:
ich hielt die eine `REFERENCES`-Klausel des Schemas für wirkungslos, weil
SQLite Fremdschlüssel standardmäßig aus hat. Der Treiber schaltet sie ein, die
Klausel wirkt.)

**Was NORMAL unter WAL bedeutet:** ein Commit überlebt einen Absturz des
Prozesses, aber ein Stromausfall oder ein Absturz des Betriebssystems kann die
zuletzt bestätigten Transaktionen kosten. `FULL` fsyncet bei jedem Commit.

**Meine zweite Vermutung war ebenfalls falsch, und das ist der interessante
Teil.** Neben der Datenbank stehen elf Dateispeicher, die ausdrücklich fsyncen,
und zwei ADRs über Absturzsicherheit (0090, 0093). Es lag nahe, dass die
Architektur das ausgleicht: was einen Absturz überleben muss, liegt in einer
Datei. Nachgesehen — der Wiederherstellungsanker, das *einzige* Stück des Homes
außerhalb der Datenbank, liegt dort aus einem **anderen** Grund: ADR 0110 R6
hält ihn außerhalb jeder rücksicherbaren Momentaufnahme, damit eine Rücksicherung
eine verbrauchte Wiederherstellung nicht auf `pending` zurückdreht. Das ist
Rollback-Widerstand, nicht Stromausfall. **Nichts im Home gleicht NORMAL aus.**

Eine Richtung ist dabei gutartig: der Anker ist fsync-gesichert und läuft nur
vorwärts, also kann er nach einem Stromausfall „verbraucht" sagen, während die
Datenbank die Zeile dazu verloren hat — und die Wiederherstellung bleibt
gesperrt. Es fällt zu, nicht auf. Was verloren gehen kann, ist das, was eine
Person gerade gespeichert hat.

**Was FULL kostet, gemessen statt geschätzt** — auf der Platte dieser Maschine
(btrfs über LUKS), 2.000 Zeilen:

| Zeilen je Transaktion | NORMAL | FULL |
| --- | --- | --- |
| 1 | 59 ms | 2.827 ms |
| 10 | 10 ms | 289 ms |
| 100 | 4 ms | 33 ms |

**Der Preis hängt an der Zahl der Commits, nicht an der Zahl der Zeilen:**
rund **1,4 ms je Transaktion**, gleich wie groß sie ist. Und dieser Baum
bündelt seit B163/B164: `transaction:check` zählt 80 Schreibvorgänge in
Transaktionen, 41 davon in Schleifen. Eine Person, die etwas speichert, zahlt
also einmal 1,4 ms — nicht 1,4 ms je Zeile.

**Der erste Messlauf sagte, FULL koste nichts** (26 ms gegen 24 ms). Er lief in
`/tmp`, und `/tmp` ist auf dieser Maschine ein RAM-Dateisystem, wo `fsync` ein
Nichts ist. Eine Haltbarkeitsmessung gehört auf den Träger, um den es geht.

**B185 — Der letzte Wächter eines Homes ist die Datenbank, und niemand geht ihn
(2026-09-17).** B181 hat gefragt, ob die Ablehnungen im Code gegangen werden.
Dieselbe Frage an die Schicht darunter: ein `CHECK` ist die **letzte**
Ablehnung, die ein Home aussprechen kann — die, die greift, wenn der Code
danebenlag. Es sind **51**, und **kein einziger Test im ganzen Baum** nennt je
eine `CHECK constraint failed`.

Nach B182 heißt „nicht genannt" nicht „nicht gehalten", also die Sonde statt der
Zählung: alle 51 zu Tautologien gemacht (`CHECK (1)`), damit die Syntax stehen
bleibt. **Von 1201 Core-Tests fiel genau einer** — und der nennt nichts, er
schreibt `.toThrow()` ohne Wort. Die drei `CHECK`s auf `pico_home_claim_state`
verschont und die übrigen **48 entschärft: 1201 von 1201 grün.**

**Das ist kein Fund, sondern eine Einordnung.** Ein `CHECK` ist Tiefenstaffelung;
dass ihn niemand geht, ist vertretbar, solange der Code vorher ablehnt. Die
nützliche Frage ist eine andere: **stimmt er noch mit dem Code überein?** Denn
32 der 51 sind geschlossene Wortschätze (`col IN (…)`), und jeder steht ein
zweites Mal als TypeScript-Vereinigung. Eine Wahrheit, zweimal geschrieben.

**Abweichung hat zwei Gestalten, und beide sind leise.** Nimmt SQL weniger an
als TypeScript, wird ein Wert, den der Code erzeugen kann, ganz am Ende
abgelehnt — nachdem alles darüber ja gesagt hat. Nimmt SQL mehr an, speichert
jeder andere Weg in die Datenbank etwas, das der Code ablehnt: eine Migration,
eine Reparatur, ein künftiger Schreiber.

**Gemessen: 21 von 24 Wortschätzen waren deckungsgleich mit einer *benannten*
TypeScript-Liste.** Die drei übrigen waren nicht abgedriftet — zwei von ihnen
hatten **keinen Namen**:

- `'pending' | 'vetoed' | 'effective'`, der Zustand einer Wurzelrotation,
  **viermal ausgeschrieben in `event-store.ts`** und ein fünftes Mal in SQL.
- `'delegation' | 'key'`, der Gegenstand eines Widerrufs, dreimal in drei
  Dateien und ein viertes Mal in SQL.

**Und das ist die eigentliche Auskunft.** Dieser Baum hat seit B69 ein
`copies:check`, das über doppelt definierte **exportierte Namen** wacht. Ein
Wortschatz, der nie benannt wird, ist dafür unsichtbar — er kann sich beliebig
oft wiederholen, ohne je als Kopie zu gelten. **Anonymität ist die Lücke im
Kopientor.** Beide sind jetzt benannt, und danach standen 23 von 24.

Der letzte ist der Gründungssatz mit dem abgelösten `v2`-Namen aus ADR 0134 F2 —
derselbe, den `check-wire-labels.mjs` seit dem 2026-08-24 ausdrücklich begründet
und den B183 an anderer Stelle angefasst hat.

**Und ein Nachspiel, das das gestrige Tor geschaerft hat.** Die neuen Namen
tragen einen Doku-Satz, der die Spalte nennt, auf die sie sich beziehen — *the
database says the same three words in a CHECK constraint on
`pico_identity_revocation.subject_kind`*. Damit fiel `column:check` von B184:
es hatte den Namen im **Kommentar** als Abfrage gezaehlt. Prosa ueber eine
Spalte ist genau das, was wie eine Verwendung aussieht und keine ist; das Tor
maskiert Kommentare jetzt und beisst weiterhin.

**Das Tor dazu ist `vocabulary:check`, der 54. Kettenschritt.** Jeder
SQL-Wortschatz muss genau die Wörter einer exportierten TypeScript-Liste sagen
oder begründet sein, und der eine begründete wird **nachgerechnet**: der
überlebende Name muss im Satz stehen, und jedes zusätzliche Wort muss eines
sein, das kein TypeScript-Wortschatz mehr kennt. Vier Pflanzungen, vier
Ablehnungen: SQL ein Wort zu viel, TypeScript ein Wort zu viel, ein Wortschatz
verliert seinen Namen, und der begründete Eintrag verliert seinen überlebenden.

**B184 — Eine Spaltenliste ist eine Aussage darüber, was ein Speicher fragt
(2026-09-17).** B179 hat gezeigt, dass eine Importliste eine Aussage ist. Eine
Ebene tiefer gilt dasselbe: wer `content_ciphertext_hex` in einem Schema liest,
schließt, dass der Speicher nach Geheimtext fragt. **48 Tabellen, 418 Spalten** —
wie viele davon werden geschrieben und **nie** abgefragt?

**Erst ein Messfehler, und er ist lehrreich.** Mein erster Lauf schloss
`migrations.ts` ganz aus, um die Schemadefinition nicht als Verwendung zu
zählen — und fand genau eine Spalte, die nirgends vorkommt:
`schema_migration_audit.error_message`. Sie wird sehr wohl geschrieben, nur
eben *in derselben Datei*, ein paar hundert Zeilen unter ihrer `CREATE TABLE`.
Wer eine Datei ausschließt, schließt auch das aus, was sie sonst noch tut.
Korrigiert: nur die `CREATE TABLE`-Blöcke maskieren. Danach steht die grobe
Frage auf **null von 418** — jede Spalte kommt irgendwo außerhalb ihrer
Definition vor.

**Die schärfere Frage trennt Schreiben von Lesen: 28 Spalten werden
geschrieben und nie abgefragt.** Sie zerfallen in drei Gruppen, und nur die
letzte ist ein Loch:

- **26 stehen neben einer `*_json`-Spalte, die denselben Satz ganz hält.** Die
  Reader-Custody liest ausschließlich über `item_record_json`,
  `domain_record_json` und ihre Geschwister; die Einzelspalten daneben sind
  entnormalisierte Kopien, die kein `SELECT` je nennt. Darunter
  `content_ciphertext_hex` und `wrapped_dek_hex` — der Geheimtext und der
  verpackte Datenschlüssel, ein zweites Mal in derselben Zeile. **Kein Drift
  und kein Rest beim Schreddern:** diese Zeilen werden eingefügt und im Ganzen
  gelöscht, nie geändert. Was bleibt, ist die falsche Auskunft an einen Leser
  des Schemas.
- **Eine ist über einen Fremdschlüssel wiederherstellbar.**
  `pico_audit_record.recorded_at` liest niemand, aber die Zeile verweist auf
  `pico_event`, und dort steht `created_at`.
- **Und eine hat kein zweites Zuhause:**
  `pico_module_effect_consent.consented_at`.

**Diese eine ist der Fund.** Das Home schreibt auf, *wann* eine Person einer
Modulwirkung zugestimmt hat, und `picoModuleEffectConsent` holt
`effect_name`, `description`, `risk` — den Zeitpunkt nicht. Er ist da,
dauerhaft, und **niemand kann ihn je zurücklesen**: weder die Person, noch eine
Fläche, noch ein Prüfer. Direkt daneben steht ein Kommentar, der sich Mühe gibt,
genau diesen Satz zu bewahren — *"would lose the record of what was agreed while
it was off"*. Der Satz ist bewahrt; der Zeitpunkt ist es nicht, jedenfalls nicht
für irgendjemanden, der fragen könnte.

**Und das Tor dazu, weil eine Zahl ohne Gang zurückfällt.** `column:check` ist
der 53. Kettenschritt und stellt dieselbe Frage wie `store:check`, eine Ebene
tiefer: hat jede Spalte einen Frager? Die 28 stehen als begründete Einträge
darin, und `beside_json` wird **nachgerechnet** — die Tabelle muss wirklich eine
`*_json`-Spalte tragen, sonst fällt das Tor. Drei Pflanzungen, drei eigene
Sätze: eine neue Spalte ohne Frager, ein `beside_json` in einer Tabelle ohne
JSON, ein begründeter Eintrag für eine Spalte, die es nicht gibt.

**Der erste Lauf des Tors bestand über alles — und das war der Fehler.** Es
liest den ganzen Baum, `scripts/` eingeschlossen, und seine eigene
Begründungsliste nennt jede Spalte, die es entschuldigt. Ein Prüfer, der sich
selbst zum Gegenstand zählt, findet alles gefragt. Das ist B166s Satz *„ein
Prüfer ohne Gegenstand ist kaputt und nicht sauber"* in seiner heimtückischsten
Form: der Gegenstand war da, aber der Prüfer las seine eigene Ausrede als
Antwort.

Eine Spalte, die eine Person betrifft und die niemand lesen kann, ist entweder
eine fehlende Fläche oder Ballast. Beides ist eine Entscheidung und steht als
solche in `.agent-context.md`.

**B183 — Eine Weiche, die nicht mehr wählen kann (2026-09-17).** B181 und B182
haben `!== KONSTANTE` gemessen — Vergleiche, die **ablehnen**. Die Gegenfrage
kostete zehn Minuten: wo steht `=== Schemakonstante`, also ein Vergleich, der
etwas **zulässt**? Im ganzen Produktcode **zehn Stellen**, und zwei davon
lohnten den Blick.

Die erste ist vorbildlich: `app.ts` hält `picoHomeSealedClaimPayloadSchema`
(v1) nur noch, um ihn abzulehnen — *Pico Home v1 claim payload is no longer
accepted.* Eine alte Fassung, die beim Namen genannt und begründet
zurückgewiesen wird, mit einem Test daneben.

**Die zweite war eine Weiche ohne Wahl.** In `claimPicoHome` stand der ganze
Identitätsnachweis des ersten Geräts — Lebenslaufbeleg und Leserschlüssel —
innerhalb von `if (input.foundingRecord.schema === picoHomeFoundingRecordSchema)`.
Ein Rest der v1/v2-Weiche, die ADR 0134 F2 am 2026-08-10 zusammengelegt hat.
Und die Meldung darin sprach noch die alte Sprache: *Pico Home **v2** founding
requires identity verification* — ein v2, das es nicht mehr gibt. Von zwei
geworfenen Meldungen im ganzen Baum, die überhaupt eine Fassung nennen, nannte
genau diese eine, die es nicht gibt.

**Mein erster Schluss daraus war falsch, und der Weg dahin gehört
aufgeschrieben.** Die `CHECK`-Klausel der Tabelle lässt **beide** Namen zu —
`check-wire-labels.mjs` sagt das sogar ausdrücklich, weil eine Migration
beschreibt, was eine Datenbank schon hält. Also schien der Fall offen: ein Satz
unter dem alten Namen käme durch die Datenbank, würde Mitgliedschaft, und fiele
dann durch die Weiche — gegründet, ungeprüft. Ich habe den Test dafür
geschrieben, und er ist gefallen: mit einer **anderen** Meldung.
`assertPicoHomeFoundingRecord` lehnt jede andere Schreibweise vorher ab. Die
Weiche war unerreichbar, nicht gefährlich.

**Was bleibt, ist trotzdem beides wert:**

- Die Weiche ist weg. Ein `if`, das nicht falsch werden kann, behauptet eine
  Wahl, die es nicht gibt — und *diese* Wahl hätte ein Home ohne den Nachweis
  seines ersten Geräts gegründet. Dass sie unerreichbar war, ist ein Zustand,
  keine Eigenschaft: eine spätere Fassung, die neben `v1` wieder etwas anderes
  zuließe, hätte den stillen Übersprung zurückgebracht. An ihrer Stelle steht
  jetzt der Satz, warum hier nicht verzweigt wird.
- Die Ablehnung, die wirklich hält, **nannte kein Test**. Sie tut es jetzt, und
  zwar unter genau dem Namen, den die `CHECK`-Klausel noch durchlässt.
- Die Meldung nennt kein totes v2 mehr.

**Und die acht übrigen sind das Spiegelbild von B182.** Sie stehen alle in
Prädikaten — `record.schema === KONSTANTE && lifecycle.suite === … && …` —, die
`true` oder `false` zurückgeben, und der Aufrufer macht aus dem `false` eine
Ablehnung. Das ist dieselbe Gestalt wie die Oder-Ketten aus B182, eine Stufe
schlimmer: dort teilten sich die Glieder wenigstens **ein Wort**, hier haben sie
nicht einmal das. Ein Test kann so ein Glied *gehen*, aber nichts von außen kann
je sagen, welches gefallen ist. Kein Fund, sondern eine Grenze, die man kennen
sollte, bevor man ein Tor über solche Prädikate baut.

**Die Lehre ist die von B181, von der anderen Seite gelesen.** Dort ging es um
Wächter, die ein fremdes Dokument abweisen; hier um einen Vergleich, der ein
bekanntes *durchlässt*. Beide Male ist der interessante Fall derselbe: **unser
eigenes Dokument aus einer Fassung, die es nicht mehr gibt.** Ein `!==` fällt
dann sicher. Ein `===` überspringt still — und das ist die gefährlichere
Richtung.

**B182 — Die meisten „ungegangenen" Zweige sind keine Lücke (2026-09-16).**
B181 endete mit einer Entscheidung und einer Empfehlung, die ich nicht
beziffern konnte: *nur die Oder-Ketten aufteilen, deren Schemazweig
nachweislich niemand geht.* Eine Empfehlung ohne Zahl ist eine Meinung. Die
Zahl zu messen hat einen ganzen Tag gekostet, **drei falsche Zahlen erzeugt**
und am Ende etwas anderes ergeben als die Frage erwartete.

32 Ketten tragen **44 Zweige**, die eine Schemakonstante prüfen (mehrere Ketten
prüfen zwei). Gemessen wird nicht durch Lesen, sondern durch Ausbauen **genau
dieses Zweigs** — `!== KONSTANTE && false`, was den Rest der Kette, die
Verengung und `noUnusedLocals` unberührt lässt.

| Paket | Zweige | gemessen | am Ende |
| --- | --- | --- | --- |
| `packages/vault` | 23 | 5 | **11** |
| `packages/sync` | 10 | 0 | **10** |
| `apps/companion` | 3 | 3 | 3 |
| `apps/core` | 1 | 0 | **1** |
| `apps/vault-daemon` | 6 | 1 | **6** |
| `packages/identity` | 1 | 0 | **1** |
| **gesamt** | **44** | **9** | **32** |

**Vor dieser Arbeit war es genau einer.** Jedes Paket außer dem Vault steht am
Ende auf allen seinen Zweigen. Die dazugekommenen sind die Gänge aus B181 und
diesem Tag: Schlüsseldatei, Entsperrdatei, Recovery Card, die
sieben Reader-Custody-Sätze, der Anker im Core, das Archiv des Lesenden-Klienten
mit seinem Satz und seiner Quittung, sein Zustand, sein Pending-Eingang, die
Seite, die ein Relay ihm reicht, und das Schema in der Nutzlast eines
undurchsichtigen Satzes.

**Und dann die eigentliche Auskunft, die die Frage umdreht.** Die zwölf, die am
Ende nicht halten, liegen alle im Vault — und **keiner davon ist eine Lücke:**

- **Zehn vergleichen eine `suite`, die in den signierten Bytes steht.** Alle
  acht zuständigen Signatur-Bauer — Domäne, Leserecht, Schreiberrecht,
  Rotation, Eintrag, die zwei Lebensläufe und der Freigabeumschlag — nennen
  `suite` als Feld. Wer sie ändert, bricht die Unterschrift, und die wird *in
  derselben Kette* geprüft, unter *demselben Wort*. Der Zweig ist also nicht
  ungeprüft, sondern **redundant**: ihn auszubauen ändert nichts, was von außen
  zu sehen wäre. Ein Test dafür ist nicht zu schreiben, weil es nichts gibt,
  das ihn von seinem Nachbarn unterscheidet.
- **Einer liegt hinter der AEAD**: die Nutzlast einer Sync-Charge wird aus
  *entschlüsselten* Bytes gelesen, ein verfälschtes Byte fällt vorher an der
  Authentifizierung. (`invalid_share_wrap` ist derselbe Fall und gehört zu den
  zehn oben, weil es zugleich ein Suite-Vergleich ist.)
- **Einer wird sehr wohl gehalten — von einem Test des anderen Pakets.** Die
  Charge in `openPicoReaderCustodySyncBatch` liegt im Vault, ihr Gang steht in
  `@pico/sync`. Eine Messung je Paket sieht das nicht; von Hand nachgestellt,
  mit Bau dazwischen, beißt sie.

**Damit ist die Entscheidung aus B181 verschwunden.** „Alle Ketten aufteilen,
damit ein Tor sie nachrechnen kann" hieße, zehn Vergleiche mit eigenem Wort
auszustatten, die **gar nichts eigenes tun** — und alle übrigen sind gegangen,
also hätte ein Tor nichts mehr zu finden. Übrig bleibt eine kleinere Frage:
*sollen die zehn redundanten Suite-Vergleiche bleiben?* Sie kosten nichts und
sagen einem Leser, was gilt — aber sie sind genau die Sorte Satz, die nach
einer Prüfung aussieht und keine ist, und dieser Baum hat dafür schon einen
Befund (B163).

**Drei Messfehler auf dem Weg, alle in meinem eigenen Werkzeug**, und sie
gehören hierher, weil jeder eine veröffentlichte Zahl falsch gemacht hätte:

1. **Die Sonde zählte Pflanzungen, die nicht stattfanden.** Bei umbrochenen
   Bedingungen (`|| archive.schema\n  !== KONSTANTE`) steht der linke Operand
   auf der Vorzeile; die Ersetzung griff nicht, der Zähler stieg trotzdem.
   Sechs Zweige galten als ungegangen, die einen Halter hatten. Das ist
   Sondenregel 5 — eingebaut ins eigene Werkzeug.
2. **`(parsed as X).schema !== KONSTANTE` zerbrach die Klammer**, weil mein
   Muster den linken Operanden mitnahm. Das Ergebnis war ein Übersetzungsfehler
   und damit ein *Abbruch*, den die Auswertung als „nicht gehalten" las. Die
   Lösung war, den linken Operanden gar nicht zu berühren: `!== K && false`
   bindet ohnehin enger als `||`.
3. **Eine Sammelsonde beantwortet eine andere Frage.** Alle zehn Sync-Zweige
   gemeinsam auszubauen ließ einen Test fallen; einzeln ausgebaut fällt bei
   keinem einer. Der Fehlschlag war ein Zusammenspiel, kein Halter.

**B181 — Die Tests füttern ein kaputtes Dokument, nie ein fremdes
(2026-09-15).** B180 endete mit dem Satz, dass ein Fossil zwei Seiten hat.
Dieselbe Frage eine Ebene höher: **hat jeder Schemaname eine Erzeuger- *und*
eine Leserseite?** Der Weg dorthin ging über zwei ehrliche Fehlschläge und
endete an einer Zahl, die ich nicht erwartet hatte.

**Erster Fehlschlag, und er war ein sauberes Nein.** 84 Schemakonstanten, davon
**16 außerhalb von `packages/protocol/src`** — und `check-wire-labels.mjs`,
das Tor über einmal buchstabierte Etiketten, sucht nur dort. Ein blinder
Fleck also. Er ist **leer**: von den 16 wird genau *eine* anderswo
ausgeschrieben, und die steht in einem Feld vom Typ
`typeof picoCompanionProfileSchema` — der Übersetzer vergleicht die Kopie.
**Fünfzehn der sechzehn hängen an einer Typstellung, und jede hat genau einen
Vergleich**, also genau einen Leser, der ein falsches Schema ablehnt. Die
sechzehnte ist die beste Gestalt von allen: `picoVaultPrivateKeyPayloadLabel`
steht in Bauer und Leser derselben Datei, sechzehn Zeilen auseinander, beide
mit demselben Namen. Aufgeschrieben, damit es niemand ein zweites Mal misst.

**Zweiter Fehlschlag: meine Messung war das falsche Gerät.** Die
Regelmäßigkeit — „jede Konstante hat genau einen Vergleich" — führte zur
richtigen Frage: *wird dieser eine Vergleich gegangen?* Über den ganzen Baum
vergleichen **61 Stellen** ein Feld gegen eine Schemakonstante und werfen dann.
Ich habe gezählt, welche davon ein Test **in einem Matcher nennt**: 25 ja, 36
nein. Und die Nachbartabelle war eindeutig — bei **allen vierzehn** Lesern, die
überhaupt eine gegangene Ablehnung haben, fehlt der Schemawächter:
`parsePicoSupplierAnswer` geht drei von vier Wörtern, der
Postfach-Leser fünf von sieben, `parsePicoModelJob` sechs von fünfzehn, und
ausgelassen ist jedes Mal dasselbe.

**Der Grund dafür steht in der Reihenfolge, und er ist die eigentliche
Auskunft.** Gestalt- und Schlüsselprüfungen stehen *vor* dem Schemawächter.
Ein **fremdes** Dokument fällt also schon dort. Der Schemawächter sieht in
seinem Leben genau einen Fall: **unser eigenes Dokument aus einer Fassung, die
es nicht mehr gibt.** Das ist kein exotischer Zustand — das ist der erste Lauf
nach einem Aufstieg. ADR 0134 F2 hat so eine Umbenennung schon einmal gemacht,
und vierzehn Tage später verlangte der Kartencode immer noch den alten Namen.

**Und dann die Korrektur, die das Ganze erst wahr macht — in beide
Richtungen.** „Genannt" ist nicht „gehalten", und beide Abweichungen kamen vor:

- **Gehalten, ohne genannt zu sein.** Der `wrong_keyfile_label` des
  Schlüsseldatei-*Kopfes* fiel beim Pflanzen einem **Byte-Vektor-Test** auf,
  der die Meldung nirgends ausspricht. Meine Zählung hatte ihn als offen
  gemeldet.
- **Genannt, ohne gehalten zu sein — und das ist der lehrreichere Fall.**
  `unreadable_recovery_anchor` im Core wird von drei Tests behauptet, und der
  Wächter ist eine **Oder-Kette**: kein Objekt, kein Array, falsches Schema.
  Die drei Tests treffen die anderen Glieder. Gemessen am 2026-09-15, isoliert
  und ohne andere Pflanzung: **den Schemavergleich entfernt, und alle 1200
  Tests des Core bleiben grün.** Ein geteiltes Ablehnungswort lässt einen
  ungegangenen Wächter gegangen aussehen.

Das richtige Gerät ist also das Ausbauen, nicht das Zählen von Namen. Im
Protokoll, dessen Tests aus den Quellen fahren und deshalb sauber messbar sind:
**alle Schemawächter ausgebaut, und von 663 Tests fielen 8.** Nach dieser
Arbeit sind es 16 von 670.

**Und dann die Zählung noch einmal, mit dem Syntaxbaum statt mit einem
Zeilenfenster** — weil die erste Zahl Vergleiche zählte und die Frage nach
`if`-Gestalten verlangt. Beides gemessen, damit die Zahlen im selben Gerät
stehen:

| | |
| --- | --- |
| Schemakonstanten im Baum | **84** |
| `if`-Wächter, die eine prüfen und mit benanntem Wort werfen | **67** |
| davon mit **eigenem** `if` und eigenem Wort | 35 |
| davon heute in einem Matcher behauptet | **30** |
| davon in einer **Oder-Kette**, Wort mit Nachbarn geteilt | **32** |

Von den fünf allein stehenden, die nach dieser Arbeit noch offen waren, sind
zwei unerreichbar, zwei liegen hinter der AEAD — und der fünfte war ein
Messfehler meiner ersten, losen Suche: `invalid_response` im Vault-Daemon galt
als behauptet, weil `link_invalid_response_envelope` das Wort *enthält*. Er
liest den ersten Rahmen, der über den Vault-Socket zurückkommt, und geht jetzt.

**Was damit offen bleibt, ist kein Aufräumen, sondern eine Entscheidung.** Die
32 in Oder-Ketten lassen sich mit keinem Tor über Namen prüfen — genau das hat
`unreadable_recovery_anchor` gezeigt. Ein Tor braucht zuerst, dass jeder
Schemavergleich **sein eigenes Wort** hat. Das sind 32 neue Ablehnungswörter,
und ein Ablehnungswort ist nach außen sichtbar; das ist keine Umbenennung
nebenbei.

**Gegangen sind jetzt 21 davon**, jeder mit einer Pflanzung gegen den ganzen
Paketlauf, die zugleich misst, dass vorher niemand ihn hielt. Die
Zusammenstellung, weil sie zeigt, was für ein Ding ein Schemawächter ist:

- **Die Schlüsseldatei**, gleich dreifach — Umschlagfassung, Schemanummer und
  Formatetikett. Und das Format steht **zweimal**: einmal auf dem Umschlag,
  einmal im Kopf, wo es Teil der zugeordneten Daten der AEAD ist. Nur der erste
  Platz war gedeckt; der zweite fällt erst im AAD-Bauer, und an ihm hängt,
  wogegen die Entschlüsselung bindet.
- **Die Entsperrdatei der Companion**, Linux und Android — die Datei, die bei
  jedem Start zwischen einer Person und ihrem eigenen Vault steht.
- **Die Recovery Card**: sie trägt ihre Suite *in der Karte*, nicht aus einer
  Konstante des Lesers. Eine Karte aus einer anderen kryptographischen
  Generation erreicht den Wächter wirklich — gedruckt von einem Pico, das es
  vor dem Aufstieg gab.
- **Die Lebensläufe der Reader-Custody**, die reisen: der Eigentümer
  unterschreibt sie, eine Rotation liest sie zurück, um zu erfahren, welche
  Erteilungen sie ausgelöst haben. Eine Rotation, die einen unbekannten
  Lebenslauf still überginge, rotierte ohne die Ursache, die sie behauptet.

**Ein Wächter, den ich fast falsch abgelegt hätte.** Der Suite-Wächter in
`buildPicoHomeDeviceRecovery…SignatureInput` sieht aus wie eine Zusicherung an
sich selbst — ein Bauer, der sein eigenes Argument prüft. Ist er nicht:
`buildersByLabel` im Vault-Daemon **gießt die Felder, die über den Socket
kamen**, und reicht sie unverändert hinein. Die Ablehnung dort ist es, die den
Daemon davon abhält, Bytes zu rendern und danach eine Person um Zustimmung für
sie zu bitten.

**Zwei sind dagegen wirklich unerreichbar**, und das gehört genauso
aufgeschrieben: `assertGrant` und `assertAcceptance` in `device-enrolment.ts`.
**Jede** ihrer Aufrufstellen setzt `schema:` selbst aus der Konstante, und die
Transportform trägt das Feld überhaupt nicht. Über den Leseweg kann der
Vergleich nie falsch werden.

**Und was hinter einer AEAD liegt, ist nur mit einem alten Schreiber
erreichbar.** `invalid_share_wrap` und `invalid_private_key_payload` lesen
Etiketten aus *entschlüsselten* Bytes. Ein verfälschtes Byte fällt vorher an
der Authentifizierung; feuern können sie nur für ein Format, das ein anderer
Bau geschrieben hat. Sie zu gehen hieße, den Schreiber der Vorfassung im Test
nachzubauen. Das ist ein Preis, keine Nachlässigkeit — hier genannt, damit die
Entscheidung sichtbar bleibt.

**B180 — Ein Fossil stirbt auf beiden Seiten der Grenze (2026-09-15).** B179
endete mit einer verkleinerten Entscheidung: *soll `noUnusedLocals` auch für
Tests gelten?* Diese Frage ist nicht zu beantworten, solange ihr Preis
unbekannt ist. Also erst der Preis, dann die Frage — und der Preis war
**siebenundzwanzig mechanische Streichungen und zwei Urteile**.

Die 29 Meldungen in Testdateien waren keine 29 Importe. **Drei waren
Definitionen ohne Leser**, und eine davon ist die eigentliche Auskunft dieses
Befunds:

- `apps/vault-daemon/src/index.test.ts#canonicalElement` baute ein
  längenpräfigiertes Element aus einem Etikett. Das ist der **Zwilling** von
  `daemon.ts#firstCanonicalElementAscii`, der toten Daemon-Funktion aus B179 —
  dieselbe abgelöste Anordnung, einmal im Produkt, einmal im Test, und beide
  starben durch denselben Umbau.
- `approval.test.ts#exemptInputHex` und die zwei Importe, die nur sie trug.
- `reader-custody.test.ts` hielt in **einer von drei** Fabriken ein
  `const domain`, das ihr Rumpf nie las.

**Das ist die Lehre.** Ein Fossil hat zwei Seiten: die Funktion und das, was sie
prüfte. Wer nur eine entfernt, lässt die andere stehen — und die sieht dann
**lebendig aus**, weil sie sich selbst genügt. `canonicalElement` wäre als
Testhelfer nicht aufgefallen; erst die Flagge hat gesagt, dass sie niemand
aufruft. Beim Löschen einer Produktdefinition gehört deshalb die Frage dazu:
*wer hat sie geprüft, und lebt der noch?*

**Und ein Fehler im Messen, der beinahe drei Tests genommen hätte.** Ich habe
`const domain = records.domain.domain;` mit einer Ersetzung über die ganze
Datei entfernt — drei Treffer, aber nur **einer** war tot. Die anderen zwei
standen in Fabriken, die `domain` sechs Zeilen später lesen. Der Compiler hatte
**eine** Stelle genannt, nicht drei; die Ersetzung hat einen *Namen* gesucht,
wo eine *Stelle* gemeint war. Aufgefallen beim Lesen der Umgebung, nicht beim
Lauf. **Eine mechanische Ersetzung ist keine Messung** — sie beantwortet, wo
ein Text steht, nie, was er tut.

**Dann die Zählung selbst, und auch die war zu klein.** Ich zählte über neun
Pakete. Der Baum hat **siebzehn** tsconfigs, und alle siebzehn erben von
`tsconfig.base.json`: die vier `modules/*` und `packages/sync`, `gesture`,
`link-relay-client`, `identity` hatte ich nie befragt. Sie meldeten am Ende
null — das Ergebnis stimmte also, aber aus Glück und nicht aus Methode. Eine
Baum-weite Aussage wird über die Liste der Konfigurationen geführt, nicht über
eine Liste, die man im Kopf hat.

**Der Stand ist jetzt null über alle siebzehn Pakete, und die Flagge steht.**
`noUnusedLocals` ist in `tsconfig.base.json` gesetzt, und weil eine Eigenschaft
ohne Gang keine ist, geht sie durch `pnpm build`. Gepflanzt: ein toter Import in
`reader-custody.test.ts` — gemeldet. Die offene Entscheidung aus B178/B179 ist
damit **keine Entscheidung mehr**, sondern kostenlos beantwortet.

**Eine zweite Flagge kam gratis dazu.** `noUnusedParameters` kostete über alle
siebzehn Pakete **eine einzige Stelle**: in `canonical-transport.test.ts` hält
`label` die erste Position vor `options` — der Parameter *soll* ungelesen sein,
und genau dafür gibt es den Unterstrich. Auch sie steht jetzt, und auch sie
beißt: ein toter Parameter an `hasReachedStoreCeiling` wurde gemeldet. Zwei
Flaggen für einen Unterstrich ist ein guter Preis.

**Zweimal habe ich in diesem Lauf einen Abbruch beinahe als Ergebnis
genommen.** Zwei Pflanzungen meldeten „beißt nicht" — beide hatten *nie
gepflanzt*: einmal traf eine Regex keine Methode, einmal hieß die Methode
`public` statt `private`. Das Skript brach ab, und die Prüfung danach lief
gegen die **unveränderte** Datei und fand erwartungsgemäß nichts. Regel 1 des
Runbooks, zweimal an einem Nachmittag: *ein Lauf ohne lesbare Zahl ist ein
Abbruch, kein Ergebnis* — und eine Pflanzung, die nicht stattfand, ist die
teuerste Form davon, weil ihr Ausbleiben wie Entwarnung aussieht.

**B179 — Eine Importliste ist eine Aussage darüber, was eine Datei tut
(2026-09-15).** B178 hat aus der offenen `noUnusedLocals`-Entscheidung die
Teilmenge genommen, die keine Entscheidung ist. Hier die nächste Frage an
dieselbe Zahl: **wie verteilt sie sich?** Eine Zahl ohne Verteilung ist eine
schlechte Entscheidungsgrundlage.

Gemessen über alle elf Pakete: **75 Stellen, davon 29 in Testdateien** — und die
übrigen 46 liegen nicht verstreut, sondern in Häufungen. Zwei Dateien trugen
**28 davon**, und beide erzählen dieselbe Geschichte.

- `apps/companion/src/profile.ts` importierte **acht** Dateisystem-Bausteine und
  benutzte keinen: `openSync`, `writeFileSync`, `fsyncSync`, `renameSync`,
  `chmodSync`, `mkdirSync`, `closeSync`, `dirname`. Das ist *genau* die
  Redewendung für dauerhaftes Schreiben — und die Datei schreibt längst über
  `writePicoCompanionFileAtomically`. Die Importe sind das **Fossil der
  eingefalteten Fassung**.
- `apps/vault-daemon/src/cli.ts` trug **dreizehn** Protokoll-Bausteine, die es
  nicht mehr braucht: Anspruchs-, Gründungs-, Mitgliedschafts- und
  Kettenschemata. Auch hier fehlt nichts — die Arbeit ist in
  `device-recovery-ceremony.ts` und `device-lifecycle-ceremony.ts` umgezogen.

**Und das ist die eigentliche Auskunft für die offene Entscheidung:** die
Meldungen sind überwiegend **Rückstand gelungener Faltungen**, nicht verstecktes
Unheil. Ein Einschalten von `noUnusedLocals` löschte also vor allem die Spuren
von Umbauten, die dieser Baum schon gemacht hat.

Einer war trotzdem mehr: in `cli.ts` stand `isRecord` als **lokale Funktion ohne
Aufrufer** — kein Import, sondern dieselbe Gestalt wie der tote Wächter aus
B169, seit dem Commit, der den gepinnten Zeremonie-Transport brachte. Entfernt.

Die Häufungen sind aufgeräumt, weil eine Importliste eine **Aussage** ist: wer
oben `openSync/fsyncSync/renameSync` liest, schließt, dass die Datei selbst
schreibt. Diese Aussage war seit der Faltung falsch.

**Und dann ist es zu Ende gegangen: der Produktcode steht auf null.** Von 75
Stellen sind **29** übrig, und alle 29 liegen in Testdateien. Der Weg dorthin
zeigte dieselbe Gestalt noch dreimal, und die dritte Häufung war wieder ein
Fossil — `test-reader-custody-records.ts` hielt die Bausteine einer eigenen
Testdatenbank (`mkdtempSync`, `tmpdir`, `Database`), die diese Fabrik längst
nicht mehr anlegt, dazu drei Lebenslaufbauer, die in die Testdateien umgezogen
sind, die sie brauchen.

Drei waren **keine Importe**, sondern Definitionen ohne Leser:

- `daemon.ts#firstCanonicalElementAscii` — mit einem Kommentar, der eine Rolle
  beschreibt, **die sie nicht mehr hat**: *„used to classify a request for ADR
  0099 gating before the Vault is asked to sign anything"*. Sie las das Etikett
  einmal aus den signierten Bytes; heute **baut** der Daemon die Bytes aus dem
  Etikett, das der Aufrufer nennt — die stärkere Anordnung, weil die Signatur
  dann genau das deckt, was der Satz sagt. Der Kommentar hätte einen Leser
  glauben lassen, es sei umgekehrt.
- `spatial-recall.ts#isFiniteNumber` — ein Typwächter ohne Aufrufer.
- `renderer.ts#depotAttach` — eine **Existenzzusicherung ohne Gegenstand**:
  `requireElement('depot-attach')` wirft, wenn der Abschnitt fehlt, und der
  Zeichner fasst ihn sonst nie an. Seine sechs Geschwister werden alle benutzt.
  Ein Schutz für etwas, das der Code nicht braucht, ist keiner.

**Damit ist die offene Entscheidung anders geschnitten als vorher.** Sie lautet
nicht mehr „siebzig Stellen aufräumen", sondern: *`noUnusedLocals` ist im
Produktcode ab sofort erfüllt; die Frage ist nur noch, ob die 29 in Tests es
auch sein sollen.* Das bleibt beim Nutzer — aber es ist eine kleinere Frage
geworden.

**B178 — Zwei Klassen hoben auf, was niemand liest (2026-09-15).** B169 hat
gemessen, dass `noUnusedLocals` nicht gesetzt ist und ein Einschalten heute **70
Stellen** meldete — überwiegend ungenutzte Importe, und deshalb eine
Entscheidung für den Nutzer. Darin steckt aber eine schärfere Teilmenge, die
keine Aufräumarbeit ist: **`TS6138`, eine Eigenschaft, die gespeichert und nie
gelesen wird.**

Über alle elf Pakete gemessen: **genau zwei**, beide in `@pico/core` und beide
derselben Gestalt — der Konstruktor überführt seinen Parameter in abgeleitete
Felder, und das Original bleibt als `private readonly` daneben liegen:

- `PicoDepotWorkspace` hielt neben dem **aufgelösten** Wurzelpfad den
  ungelösten. Wer ihn später für die Wurzel gehalten hätte, hätte einen
  relativen bekommen — und ein relativer Pfad ist genau das, wogegen der
  Kommentar zwei Zeilen darüber argumentiert.
- `PicoModelRuntime` hielt neben `call`, `now` und `log` das **ganze
  Portbündel**, in dem `fetch` fehlen darf. Die drei Zeilen darunter sind der
  Punkt: jede nimmt entweder das Gereichte *oder* den Vorgabewert. Wer statt
  dessen `this.ports.fetch` benutzt, umgeht die Vorgabe daneben.

Das ist kein toter Code im üblichen Sinn, sondern **eine zweite Kopie einer
Wahrheit** — und zwar jedes Mal die Fassung, die nichts aktuell hält. Der Spruch
dieses Baums gilt auch innerhalb einer Klasse.

**Gehalten wird es von einer zweiten Frage in `capability:check`**, kein neuer
Kettenschritt: das Tor fragt bisher, ob ein *Export* jemanden erreicht; jetzt
auch, ob ein Konstruktorparameter, der zum Feld wird, je gelesen wird. Es
bewacht damit **62 Parameter** und nicht nur die zwei. `tsc --noUnusedLocals`
fände dasselbe, brächte aber siebzig andere Meldungen mit und nähme damit eine
Entscheidung vorweg, die dem Nutzer gehört — der Syntaxbaum beantwortet die eine
Frage sofort und ohne sie. Gepflanzt (ein `private readonly` zurück) nennt das
Tor die Stelle beim Namen.

**B177 — Vier Produktwege in `app.ts`, die kein Test betritt (2026-09-14).**
B169 hat sieben Wächter in `app.ts` gepflanzt. Die Datei hat aber **58
Funktionen**, und die schärfere Frage an sie ist nicht *„ist der Wächter
richtig"*, sondern **„erreicht sie überhaupt jemand?"**. Gemessen, indem jede
einzeln zu einer Ausnahme gemacht und der ganze Kernlauf beobachtet wurde:

**53 von 58 erreicht ein Test. Vier erreicht keiner. Einen kann man so nicht
messen.**

Die vier haben **Aufrufer in Produktrouten** — es sind keine Leichen wie
`isFoundationApiPath` aus B169, sondern Wege, die niemand geht:

| Funktion | Was ungegangen bleibt |
|---|---|
| `domainReadGrantFailureStatus` | welchen Status der Client bekommt, wenn das Erteilen eines Lesezugangs *scheitert* |
| `shareEnvelopeFailureStatus` | dasselbe für das Ausstellen eines Umschlags |
| `publicPicoShareEnvelope` | die **öffentliche Gestalt** eines Umschlags — also was das Home von ihm herausgibt |
| `parseSignedPicoIdentityRevocation` | Widerrufe, die eine Forderung mitbringt, werden nie gelesen |

Der dritte wiegt am schwersten: er entscheidet, **was einen Umschlag verlässt**,
und wird sowohl für einen einzelnen als auch für die Liste benutzt. Der vierte
liegt im Gründungs- und Forderungspfad.

**Der fünfte lässt sich nicht so messen, und das ist selbst eine Auskunft.**
Wirft `redactTicketQueryValue` — die Funktion, die eine Eintrittskarte aus einer
protokollierten Adresse schneidet —, dann **hängt der Lauf**, statt zu fallen.
Sie sitzt im Protokollpfad, und dort verträgt nichts einen Fehlschlag.

**Und die Sonde selbst musste dreimal berichtigt werden, im selben Lauf.** Ihr
erstes Ergebnis nannte **dreizehn** unerreichte Funktionen. Neun davon waren
Artefakte: ich habe die öffnende Klammer des Rumpfes *geraten*, indem ich
Klammern zählte — und traf bei jeder Funktion mit einem Objekttyp als Rückgabe
(`): { value: string } {`) die Klammer des **Typs** statt die des Rumpfes. Mit
der exakten Rumpfposition aus dem Syntaxbaum blieben vier.

Dazwischen lag noch eine eigene Fehlleistung: ich hatte eine
Übersetzungsschranke eingebaut, die fünf gültige Messungen als „Syntaxfehler"
verwarf. Es waren **TS18048** — der unbedingte `throw` nimmt TypeScript die
Verengung, und `body` gilt danach als möglicherweise undefiniert. Ein Typfehler,
kein Syntaxfehler; vitest übersetzt ohnehin nicht. Ohne die Schranke sind vier
der fünf sehr wohl erreicht.

Damit ist die Liste der Sondenregeln aus B175 um eine vierte länger, und sie
steht im Runbook: **rate die Grenzen eines Rumpfes nicht — frag den
Übersetzer.** Ein Zeichen zu früh eingesetzt, und der Fund ist keiner.

**Drei der vier sind am 2026-09-15 gegangen**, jeder fällt bei seiner Pflanzung:
die zwei Statusabbildungen über ihre beiden Zweige (401 gegen 400, 404 gegen
409 — *„du hast dich vertan"* und *„das kenne ich nicht"* sind verschiedene
Auskünfte), und der Widerrufsparser über einen missgebildeten Widerruf, der vor
jeder Kryptografie abgewiesen wird. Die Pflanzung dort beißt über die **Meldung**
und nicht über den Status: beides wäre 400, aber der Satz unterscheidet sie.

**Der vierte bleibt offen, und der Weg dorthin ist die eigentliche Ausbeute.**
Zwei Anläufe, beide verworfen, beide mit einem Grund, der ohne den Versuch nicht
zu haben war:

1. *Eine App auf die Datenbank der Speicher-Fixture zeigen lassen.* Scheitert:
   die Betreiberbindung verlangt **verifizierte Host-Schlüsselverwahrung**, die
   eine direkt beanspruchte Testdatenbank nicht hat — `home-authority-relay`
   antwortet 401.
2. *Die Zeremonie an den bestehenden Identitätssitzungstest anhängen.* Dort ist
   fast alles beisammen — beanspruchtes Home, Sitzung, Lesezuteilung,
   Frischebescheinigung, und mit `memoryEncryption` auch eine Schlüsselversion.
   Es scheitert an einer **Regel, die richtig ist**: die Kandidatensuche für
   Leserschlüssel verlangt eine *Mitgliedschaft* des Lesers, und das Home Host
   Pico kann keine haben — `home_host_membership_is_not_reissued`, weil die
   Gründungsaufzeichnung bereits seine Mitgliedschaftswurzel ist (ADR 0080). Die
   Zuteilung jenes Tests nennt genau dieses Pico als Leser und kann deshalb
   **niemals** einen Umschlag erzeugen.

Was ein Gang braucht, war damit klar: **einen zweiten Bewohner** — eigene
Identität, Mitgliedschaft, Delegation und Geräteschlüssel, eigene
Identitätssitzung (die seinen Leserschlüssel einträgt), eine
Frischebescheinigung auf ihn und eine Lesezuteilung, die *ihn* als Leser nennt.

**Am 2026-09-15 gebaut, und damit sind alle vier gegangen.** Der Test fährt die
Ausstellung zum ersten Mal über die Produktfläche: Home beanspruchen, Bewohner
aufnehmen, sein Gerät delegieren, Sitzung binden, etwas in die Domäne schreiben,
zuteilen, bescheinigen, prägen, entsiegeln, unterschreiben, abschließen,
auflisten.

Eine letzte Hürde war die lehrreichste: die Delegation trug `surface_session`
und der Leserschlüssel blieb trotzdem unzulässig. Ein Kandidat verlangt
`decrypt_domain` **und** `receive_key_envelope` — *anmelden dürfen* und
*entschlüsseln dürfen* sind in diesem Baum zwei verschiedene Vollmachten, und
der Umschlagpfad prüft die zweite. Eine Sitzung macht noch keinen Leser.

Geprüft wird am Ende genau das, was die ungegangene Funktion tut: die Liste
zeigt `issuanceId` und `record` — und **nicht**, welche Delegation den Umschlag
getragen hat. Der versiegelte Schlüssel gehört dem Leser und geht hinaus; das
Gerät, über das er kam, geht niemanden an, der die Liste liest.

**B176 — Das Gedächtnis dieses Projekts nennt nichts, was es nicht gibt
(2026-09-14, negatives Ergebnis).** Dieser Baum stellt an alles die Frage, ob
eine Begründung ihren Gegenstand überlebt hat. An seine eigenen Dokumente hatte
sie nie jemand gestellt.

Gemessen über alle Rückstrich-Bezeichner in camelCase, gegen **1.420 Dateien**
des ganzen Repositories einschließlich der Android-Quellen:

| Dokument | Bezeichner | nicht mehr im Baum |
|---|---|---|
| `Roadmap.md` | 254 | 9 |
| `.agent-context.md` | 7 | 2 |
| `progress.md` | 5 | 0 |
| `docs/development/agent-runbook.md` | 3 | 0 |
| `AGENTS.md` | 0 | 0 |

**Und alle elf sind mit Absicht dort.** In der Roadmap: fünf gefaltete Fassungen
(ein Befund über dreizehn Kopien *muss* die dreizehn nennen), ein ausdrücklich
gelöschter Export, zwei Feldnamen einer Messung — keine Symbole, sondern
JSON-Schlüssel —, und ein Name, den ich selbst zum Pflanzen erfunden habe. Im
Handoff: `isFoundationApiPath` im **Präteritum** als festgehaltene Entfernung
(B169) und `rotationBootstrap` als *vorgeschlagener* Name in einer Empfehlung
(B79).

**Der Grund dafür ist die Zeitform, und der ist tragfähiger als ein Tor.** Die
Roadmap hält Befunde — Aussagen über einen Moment, die nur dann veralten, wenn
man sie ins Präsens setzt. `progress.md` behauptet die Gegenwart und wird von
`progress:walk` und `docs:check` daran gehalten. Der Handoff mischt beides und
markiert, was welches ist. Ein Tor dafür müsste die Zeitform lesen, und es hätte
heute nichts zu fangen.

Aufgeschrieben, damit es niemand ein zweites Mal misst. Erstes Muster gemessen:
es meldete 22 Fehltreffer, weil mein Dateiscan die Android-Quellen und die
Plattformnamen nicht sah — dieselbe Lehre wie in B175, eine Stelle weiter.

**B175 — Zehn Erzeuger, deren Ablehnung nur ein Nachbar behauptet, und eine
Sonde, die einen Abbruch für einen Fund hielt (2026-09-14).** B171 stellte die
Frage: gilt eine Ablehnung als gegangen, weil ein *anderes Modul* dasselbe Wort
behauptet? Die Antwort steht jetzt vollständig — und die Zahl, die B171 nannte,
war falsch.

**Zuerst der Fehler, weil er die Lehre trägt.** Die erste Sonde lief, während
`/tmp` volllief (B172). Abgebrochene Testläufe geben keine lesbare Zählung aus,
und mein Skript las „keine Zählung" als „nichts ist gefallen". **Ein Abbruch sah
aus wie ein Fund** — und zwar so überzeugend, dass acht davon in einen
eingecheckten Befund gerieten. Von Hand nachgeprüft fiel ausgerechnet der erste
gemeldete Fall (`foreign_host_key` in `domain-read-grant.ts`) mit zwei Tests.

Die Lehre ist die zweite methodische aus diesem Ast, und sie ist unangenehmer
als die erste: **eine Sonde muss den Unterschied zwischen „nichts gefunden" und
„nicht gelaufen" kennen.** Ohne ihn meldet ausgerechnet ein kaputter Lauf die
meisten Funde. Die neue Sonde bricht laut ab, wenn ein Lauf keine Zählung
liefert; über 43 Paare gab es **null** Abbrüche.

**Die richtige Messung: 43 Paare aus Grund und Erzeuger, 33 behauptet, 10
gemeldet — davon 7 echt.** Drei Meldungen sind Artefakte, und sie stehen hier
einzeln, weil jede eine eigene Schwäche der Methode zeigt:

- **Zwei sind Typvereinigungen.** `reason: '…'` trifft auch `reason: 'a' | 'b'`,
  und eine Vereinigung umzubenennen ändert zur Laufzeit nichts. Das betraf
  `vault_locked` in `companion/first-run.ts` und
  `companion/recovery-controller.ts` — beide *deklarieren* den Grund, erzeugen
  ihn aber nicht.
- **Eine lief gegen das falsche Artefakt.** `vault_locked` in
  `vault-daemon/daemon.ts` ist sehr wohl behauptet — die Daemon-Tests starten
  den Daemon aus **`dist/`**, und meine Sonde hat den Quelltext geändert, ohne
  zu bauen. Mit Bau dazwischen fällt ein Test. Dieselbe Falle wie in B173 und
  B148, zum dritten Mal.

**Diese Zahl ist dreimal geschrumpft, und das gehört so aufgeschrieben.** Erst
acht Funde aus abgestürzten Läufen, dann zehn, dann sieben. Jede Korrektur kam
daher, dass ich einen gemeldeten Fall *einzeln nachgesehen* habe, statt der
Liste zu glauben — und jedes Mal war der Fehler in meiner Sonde, nie im Produkt.
Die drei Regeln für die nächste:

1. Ein Lauf ohne lesbare Zählung ist **kein Ergebnis**, sondern ein Abbruch.
2. Ein Treffer im Text ist **keine Erzeugung** — eine Typvereinigung sieht
   genauso aus.
3. Wessen Tests ein **gebautes Artefakt** fahren, braucht zwischen Pflanzung
   und Lauf einen Bau.

Die sieben echten, und was aus ihnen wurde:

| Grund | Erzeuger | |
|---|---|---|
| `invalid_issuer_key_role` | `core/home-membership.ts` | **gegangen** |
| `issuer_key_fingerprint_mismatch` | `core/home-membership.ts` | **gegangen** |
| `identity_is_not_active_member` | `core/reader-key.ts` | **gegangen** |
| `unknown_credential` | `core/event-store.ts` | **gegangen** |
| `unknown_grant` | `core/event-store.ts` | **gegangen** |
| `invalid_identity_lifecycle_evidence` | `core/event-store.ts` | **gegangen** |
| `conflicting_record` | `core/reader-custody.ts` | **gegangen** |

**Alle sieben sind gegangen**, jeder fällt bei seiner Pflanzung, und vier Paare
zeigen den Zuschnitt besonders deutlich:

- **Die Zwillinge aus B145.** `home-membership.ts` und `domain-read-grant.ts`
  sprechen dieselben zwei Ablehnungen aus — *ist der Aussteller wirklich der
  Schlüssel, den sein Fingerabdruck nennt, und in der Rolle, die für eine
  Identität unterschreiben darf?* — und nur einer hatte einen Test.
- **Zwei Türen, ein Wort.** `identity_is_not_active_member` war für das
  *Eintragen* eines Leserschlüssels behauptet, nicht für das **Auswählen** —
  und das Auswählen ist die Tür, die im Betrieb ständig aufgeht, weil jede
  Verwahrungshandlung hier nach einem Schlüssel fragt.
- **Ein Lebenslauf für etwas, das es nie gab.** `unknown_credential` und
  `unknown_grant` sind derselbe Satz an zwei Stellen: ein still angenommener
  Lebenslauf wäre eine Mitgliedschaft oder ein Lesezugang, der aus nichts
  entsteht.

- **Nochmal dasselbe gegen etwas anderes unter demselben Namen.**
  `conflicting_record` sah zuerst teuer aus: er braucht zwei *gültige*
  Datensätze mit derselben Kennung, denn Verändern genügt nicht — die
  Unterschriftsprüfung greift vorher. Die Testfabrik vergibt die Gebietskennung
  aber **fest** und das Besitzerschlüsselpaar **frisch**, also liefern zwei
  Aufrufe genau das. Der Unterschied, den diese Ablehnung trägt: ein
  Wiederholungsversuch muss durchgehen, ohne eine zweite Zeile anzulegen; eine
  Verwechslung unter demselben Namen muss beim Namen abgelehnt werden. Wer
  beides gleich behandelt, überschreibt entweder eine Domäne oder verweigert
  eine Wiederholung. Der Test geht beide Hälften.

Damit ist die Liste leer. **Von 43 Paaren behaupten jetzt 40 ihre eigene
Ablehnung; die drei übrigen waren nie welche.**

**B174 — Drei Tabellen, die gemeinsam entscheiden, und niemand hielt sie
gegeneinander (2026-09-14).** B173 hat gezeigt, *dass*
`unrenderable_signature_input` unerreichbar ist. Es blieb die unangenehme
Hälfte: unerreichbar **aus einem Zufall**, den nichts nachrechnet. Ob eine
Zeremonie durchgeht, entscheiden drei Tabellen zusammen —

1. wer welches Etikett unterschreiben darf (`signableLabelsByKeyRole`),
2. was davon die Zustimmung der Person braucht
   (`picoVaultDaemonSignatureNeedsApproval`),
3. wofür es Bytes und einen Satz gibt (`buildersByLabel`, `renderersByLabel`) —

und sie lagen in drei Paketen, ohne dass eine Prüfung sie je nebeneinander legte.
Wer ein Etikett in eine Rollenmenge aufnimmt und Bauer oder Zeichner vergisst,
erfährt es heute erst, **wenn eine Person vor einer Zeremonie steht, die sich
nicht erklären lässt.**

Der Test rechnet es jetzt nach, und weil die Rollentabelle nur über ein
Ja-Nein-Orakel lesbar war, gibt `picoVaultSignableLabels` sie ganz heraus. Kein
Tor, sondern ein Test: `label:check` läuft **vor** `build`, könnte die gebauten
Werte also gar nicht fragen — ein Test kann es.

**Und er fand sofort etwas, das kein Fehler ist und trotzdem hierher gehört:**
`pico.identity.rotation.v1` steht in **beiden** Rollenmengen, ist
bewilligungspflichtig und hat **weder Bauer noch Zeichner**. Das ist ADR 0114s
Wurzelrotation, deren Daemon-Seite Befund B79 ausdrücklich vertagt — der Daemon
antwortet `unknown_signature_input_label` auf ein Etikett, das seine eigene
Rollenmenge erlaubt. Eine Tür, die aufgeht und dahinter eine Wand hat.

Die Vertagung steht jetzt **im Test** statt nur daneben, mit ihrem Grund. Und sie
ist so eingetragen, dass sie an dem Tag fällt, an dem jemand die Rotation
nachholt: der Test besteht darauf, dass der vertagte Fall *noch* einer ist. Ein
Grund, der seinen Gegenstand überlebt, liest sich wie ein Urteil über heute.

Gepflanzt: ein erfundenes Etikett in die Rollenmenge der Identitätswurzel, ohne
Bauer und ohne Zeichner — beide Hälften des Tests fallen und nennen es.

**Und die Kette riss dabei an mir selbst.** Der erste Lauf brach im Bau ab:
`Map(['pico.identity.rotation.v1', …])` leitet seinen Schlüsseltyp als
*Literal* ab, und `has(label: string)` passt darauf nicht. Gefahren hatte ich
vorher nur vitest — und **vitest übersetzt nicht, nur `build` tut es.** Dieselbe
Falle steht seit dieser Sitzung im Runbook, und sie hat mich trotzdem erwischt:
sie greift genau dann, wenn eine Änderung nur noch „ein Wort" groß aussieht.

**B173 — Genannt ist nicht behauptet, und ein Rollentor stand in keinem Test
(2026-09-14).** B171 hat die teure Sonde gefahren — jeden Grund umbenennen und
den ganzen Lauf beobachten. Hier die billige, die dasselbe für einen Teil der
Fläche leistet: **steht das Wort im Argument eines Vergleichers oder nur
irgendwo?** Über den Syntaxbaum ist daran nichts zu raten, und der Kopf des Tors
nannte genau das als seinen offenen Vorbehalt — *„genannt gegen erwartet steht
noch"*.

Gemessen in Sekunden: von 146 erzeugten Gründen stehen **142 in einer echten
Behauptung**, zwei nur genannt, zwei in keinem Test. Und die billige Methode
findet einen der fünf, die die teure fand — das ist ihre Bestätigung.

Die vier einzeln:

- **`inactive_writer_grant`** — sein Wort steht in `refusal-line.test.ts`, in
  einer *Liste von Namen*, die prüft, ob jede Ablehnung einen Satz für eine
  Person hat. Eine andere Frage. Ein Gang ist nicht billig: beide Erzeugerstellen
  liegen **hinter** der Rotationsschuld, ein beendeter Schreiber bekommt also
  zuerst `rotation_required`. Er steht jetzt als Schuld **mit seinem Hindernis**
  im Tor.
- **`authority`** war ein Fehlalarm meines eigenen Musters: `let reason:
  'authority' | 'key'` ist eine Typannotation, kein erzeugter Grund.
- **`unrenderable_signature_input`** ist **unerreichbar**, und der Weg dorthin
  war lehrreich. Mein erster Vergleich der Bauer- und Zeichnertabellen sagte
  „51 zu 51, keine Lücke" — ein Regex, der Zeilen zählte statt Eigenschaften.
  Über den Syntaxbaum: **26 Bauer, 20 Zeichner.** Sechs Etiketten haben keinen
  Zeichner; fünf davon stehen auf der Freistellungsliste (sie brauchen keinen
  Satz), und das sechste — die Geräteaktivierung — steht im Rollentor **nur bei
  `device_signing`**, wo sie freigestellt ist, und ist für die Identitätswurzel
  gar nicht signierbar. Unerreichbar also nicht wegen der Tabellen, sondern
  wegen eines Dreiklangs aus Rollentor, Freistellung und Zeichnern.
- **`reader_access_key_role_mismatch`** ist der echte Fund. Er geht an den
  Aufrufer *und* ins Prüfprotokoll, steht in **keiner erklärten Vereinigung** —
  `refusal:check` sieht ihn also gar nicht — und in keinem Test. Er bewacht,
  womit ein Lesezugang geöffnet wird: **ein Vereinbarungsschlüssel, keine
  Unterschrift.**

Der Grund, aus dem er ungegangen war, ist konkret: der Daemon dieses Harness
kannte nur den Leserschlüssel, es gab also gar keinen Schlüssel mit der falschen
Rolle, den man ihm hätte anbieten können. Jetzt liegt ein zweiter im selben
Vault — wie in einem echten, in dem Identität, Unterschrift und Vereinbarung
nebeneinander liegen.

**Und die Pflanzung dazu fiel zuerst nicht.** Der Test fährt den *gebauten*
Daemon aus `dist/`; mein geänderter Quelltext erreichte ihn nicht. Dieselbe
Falle, die das Runbook seit B148 nennt, eine Ebene weiter. Mit Bau dazwischen
beißt sie: ohne die Rollenprüfung **öffnet** sich der Lesezugang für einen
Unterschriftsschlüssel.

`refusal:check` fragt seither nach der Behauptung statt nach der Nennung. Genau
ein erklärter Grund fiel dabei durch — die Regel ist scharf und nicht laut.
Gepflanzt (ein Wort aus allen drei Behauptungen in eine Konstante gehoben) nennt
sie den Unterschied beim Namen.

**B172 — 2.304 Verzeichnisse im Arbeitsspeicher, wegen einer Testdatei von 123
(2026-09-14).** Dieser Befund kam nicht aus dem Code, sondern aus der Maschine:
mitten in einer Messung meldete die Schale *„Der zugewiesene Plattenplatz
(Quota) ist überschritten"*. `/tmp` liegt hier **im RAM** einer 16-GB-Maschine
und war zu 80 % voll.

Gezählt: **2.367 liegengebliebene `pico-*`-Verzeichnisse**, davon 2.304 unter
einem Namen. Der Erzeuger ist `host-adapter.test.ts`, und er ist **die einzige
von 123 Testdateien, die ein Temp-Verzeichnis anlegt und keines entfernt** —
122 räumen weg. Gemessen statt geschätzt: ein einzelner Lauf dieser Datei ließ
**18** zurück, die 2.304 entsprechen also rund 128 Läufen. Das ist meine eigene
Spur: diese Sitzung hat die Kette sehr oft gefahren.

Aufgeräumt (1,7 GB frei, pnpm-Store und die Statusdateien der Parallelsitzung
unberührt), das Leck geschlossen, und die Regel steht jetzt in
`tests:check`: **wer ein Temp-Verzeichnis anlegt, räumt es weg.** Grob mit
Absicht — sie fragt, ob die Datei ein Entfernen überhaupt *nennt*, nicht ob es
jeden Pfad trifft; dieselbe Stärke wie ihre Nachbarn, und genau dieses Fehlen
war der Fall. Gepflanzt fällt sie.

Nebenbei gemessen und **nicht** behoben: 32 `pico-companion-*`-Verzeichnisse aus
dem Paketbau bleiben ebenfalls liegen. Das ist kein neuer Befund, sondern der
bekannte B114 — ein per Bus aktivierter Portaldienst überlebt den Begleiter und
schreibt in das Verzeichnis zurück, während es entfernt wird. Der Kommentar dort
sagt, warum nicht aufgezählt und beendet wird: welche Dienste ein Bus aktiviert,
entscheidet der Bus.

**B171 — Ein Grund gilt als gegangen, weil ein anderes Modul dasselbe Wort sagt
(2026-09-14).** `check-refusal-reasons.mjs` schreibt über sich selbst, es frage,
ob ein Grund im **Code** einer Testdatei *vorkommt* — nicht, ob ein Test ihn
*erwartet*: *„sie fängt das Fehlen, nicht die Schläfrigkeit"*. Diese Sitzung hat
gemessen, was dahinter liegt, mit einer Sonde, die das Tor nicht sein kann: den
erzeugten Grund umbenennen und sehen, ob ein Test fällt.

Drei Flächen, von außen nach innen:

- **`link-direct.ts`, die Fläche für fremde Anfragen: alle 14 Ablehnungen werden
  behauptet.**
- **`relay/store.ts`: alle 6.**
- **`reader-custody.ts`, die Tür zu den Erinnerungen: 10 von 15 — fünf nicht.**

Und der Grund dafür ist der Kern des Befunds: die fünf sind im Tor als gegangen
gezählt, weil **dieselben Wörter anderswo behauptet werden** —
`reader_key_revoked` und `freshness_stale` in `reader-key.test.ts`,
`reader_is_not_active_member` in `domain-read-grant.test.ts`,
`conflicting_record` in `share-envelope.test.ts`. Das sind **andere Erzeuger
derselben Worte**. Gemessen über den ganzen Baum: von 146 erzeugten Gründen
entstehen **19 in mehr als einer Datei**, und das sind 43 Paare aus Grund und
Erzeuger.

> **Berichtigung am 2026-09-14.** Hier stand zuerst, je Erzeuger gepflanzt
> fielen *acht* Paare durch, „darunter `vault_locked` an drei Stellen und
> `invalid_issuer_signature` an zweien". **Diese Zahl war falsch, und die Liste
> auch.** Die Sonde lief, während `/tmp` volllief (Befund B172): abgebrochene
> Testläufe erzeugen keine lesbare Zählung, und mein Skript las „keine Zählung"
> als „nichts ist gefallen". Ein Abbruch sah aus wie ein Fund.
>
> Nachgemessen mit einer Sonde, die einen Abbruch **meldet** statt ihn als
> Ergebnis auszugeben: **43 Paare, 0 Abbrüche, 10 nicht behauptet** — und die
> Liste ist eine andere. `foreign_host_key` und `invalid_issuer_signature` sind
> sehr wohl behauptet; von Hand nachgeprüft fällt `foreign_host_key` in
> `domain-read-grant.ts` mit zwei Tests. Die richtige Liste steht in B175.
>
> Die Lehre steht in B175 und ist die zweite methodische aus diesem Ast: **eine
> Sonde muss den Unterschied zwischen „nichts gefunden" und „nicht gelaufen"
> kennen.** Ohne ihn meldet ausgerechnet ein kaputter Lauf die meisten Funde.

Drei der fünf sind jetzt gegangen: ein Leser ohne aktive Mitgliedschaft, und die
zwei Ablehnungen, die aus der Leserregistrierung **durchgereicht** statt
eingeebnet werden — *„dein Nachweis ist alt"* und *„dein Schlüssel wurde
zurückgezogen"* sagen einer Person verschiedene Dinge, und der Sammelgrund
`reader_key_is_not_current` sagt keines davon. Alle drei fallen ohne ihre
Ablehnung.

**Und eine Fehlmessung gehört zum Befund.** Der erste Durchgang meldete
`quota_exceeded` als unbehauptet — ein Artefakt meiner Dateiauswahl: sein Test
steht in `link-intake-quota.test.ts` und prüft über die HTTP-Antwort. Die Lehre
ist methodisch und steht hier, damit sie niemand neu lernt: **eine Pflanzsonde
muss gegen den ganzen Lauf gehen, nicht gegen die Dateien, die man vermutet.**
Es war das dritte Mal an diesem Tag, dass Nachsehen vor dem Aufschreiben einen
Fehlbefund verhindert hat.

**B170 — Zwei Decken, die ihre eigene Ablage nicht beschränkten
(2026-09-14).** `ceiling:check` fragte bis dahin *strukturell*: sagt jede
Tabelle, wie sie aufhört zu wachsen? Das war nie die ganze Frage. Eine Decke,
die nur **zählt**, ist eine Zahl ohne Wirkung.

Gemessen über die acht ADR-0119-Q5-Ablagen: **fünf Tests stellen eine Decke
klein** (`event_log`, `observation`, `supplier_attachment`, `depot_attachment`,
`link_mailbox`), **drei nicht**. Die drei einzeln nachgesehen:

- `audit_record` **greift** — hergestellt mit `audit_record: 2` und echter
  Prüfkette: der dritte Anhang ist `refused_storage_pressure`. Prüfzeilen
  entstehen ausschließlich in `append`, also endet ihre Ablage mit ihm.
- `memory_item` **greift nicht.** Hergestellt mit `memory_item: 2`: nach dem
  dritten Anlegen stehen **drei Zeilen** da, während `append` bereits
  `refused_storage_pressure` sagt. Eine Zeile ohne ihren Eintrag im Protokoll,
  und eine Ablage, die weiter wächst.
- `share_envelope` **greift nicht**, aus demselben Grund und mit derselben
  Reihenfolge im Produktweg: `POST /api/home/share-envelopes` stellt den
  Umschlag aus und hängt `home.share_envelope_issued` *danach* an.

Beide sind jetzt eingefasst, in der Form, die die vier funktionierenden schon
hatten: vor dem Schreiben prüfen, benannt ablehnen
(`pico_memory_item_ceiling_reached`, `pico_share_envelope_ceiling_reached`),
**abgelehnt und nicht beschnitten** — was eine Person behalten wollte,
verschwindet nicht, weil Platz knapp wurde.

**Und beim Schreiben des Tests fiel eine Eigenschaft auf, die hingehört.** Ich
wollte zeigen, dass die Decke wieder aufgeht, wenn jemand aufräumt — sie tut es
nicht: Löschen ist in dieser Ablage ein `UPDATE` (der Grabstein muss eine
Wiederherstellung überleben), und der Domänen-Shred vernichtet **Schlüssel statt
Zeilen**. Eine `memory_item`-Zeile verschwindet nie. Die Decke ist also eine
**Einbahn**. Vertretbar ist sie trotzdem, und der Test sagt jetzt beides: sie ist
gegen einen *Amoklauf* gesetzt und nicht gegen normalen Gebrauch — eine Million
Erinnerungen erreicht niemand beim Leben, wohl aber eine Schleife, die sich
verlaufen hat. Bei den Umschlägen ist der Weg zurück offen, weil
`reconcilePicoShareEnvelopes` eine beendete Zuteilung wegräumt; deshalb steht der
Unterschied im Kommentar und nicht nur in meinem Kopf.

**Der Fix faltet nebenbei eine Wahrheit, die viermal geschrieben stand.** „Ist
diese Ablage an ihrer Decke" war an vier Stellen dieselbe Filterung über
`storageCondition().reasons`; mit zwei weiteren wären es sechs geworden.
`hasReachedStoreCeiling(store)` schreibt sie einmal — und macht damit die zweite
Frage des Tors überhaupt erst billig: **gibt es zu jeder Decke eine
Ablehnstelle?** Sechs antworten mit einem Aufruf, zwei sind als „durch `append`"
eingetragen, und ein Eintrag ohne Decke fällt ebenso wie eine Decke ohne
Ablehnung. Gepflanzt: die Erinnerungsablehnung wieder entfernt → das Tor nennt
sie beim Namen.

**B169 — Ein Name, der mehr verspricht als sein Körper geht; ein Wächter ohne
Aufrufer (2026-09-14).** `app.ts` ist **9.758 Zeilen**, davon `buildApp` allein
**7.845** — eine Funktion, die fast die ganze Datei ist. Unten liegen 59
Helfer, und **56 davon nennt kein Test beim Namen.** Das ist hier aber die
falsche Frage: private Helfer werden über HTTP erreicht, nicht genannt. Die
richtige Frage ist Pflanzen.

Sieben Helfer tragen echte Sicherheitszusagen; jeder einzeln geneutert, dann die
drei Testdateien, die sie erreichen:

| Pflanzung | Ergebnis |
|---|---|
| `isWebSocketOriginAllowed` → jede Herkunft erlaubt | fällt (2 Tests) |
| `isBearerTokenAuthorized` → jedes Zeichen genügt | fällt (7 Tests) |
| `secureTokenEquals` → alles ist gleich | fällt (2 Tests) |
| `hasRealtimeTicketElapsed` → nichts läuft ab | fällt (1 Test) |
| `consumeRealtimeTicket` → die Karte bleibt gültig | fällt (1 Test) |
| `purgeSessionRealtimeTickets` → überlebt die Sitzung | **niemand bemerkt es** |
| `isFoundationApiPath` → kein Pfad ist API | **niemand bemerkt es** |

**Der erste: ein Test, dessen Name eine Zusage macht, die sein Körper nicht
geht.** Er heißt *„mints realtime tickets under an operator session **and drops
them when the session ends**"* — und meldet sich nie ab. Der Körper prägt eine
Karte und prüft, dass ein anonymer Aufrufer keine bekommt. Die zweite Hälfte des
Namens stand nur im Namen, obwohl ADR 0076 direkt neben dem Code steht: *„A
ticket minted under a session dies with it."*

Eine Karte ist ein **zweiter Schlüssel zu derselben Sitzung**. Wer sich abmeldet,
weil er ein fremdes Gerät verlässt, muss auch den zweiten los sein — sonst hat
das Abmelden nur den Teil beendet, den die Person sehen konnte. Der Körper geht
das jetzt: abmelden, dann die Karte einlösen wollen. Mit der Pflanzung
**verbindet** sich der Socket danach, statt abgewiesen zu werden.

**Der zweite ist gar kein Wächter mehr.** `isFoundationApiPath` hat **im ganzen
Baum keinen Aufrufer**. Die Geschichte sagt genau, wann er ihn verlor: am
2026-07-17 hat der Commit *„operator credential, sessions and access classes
(ADR 0075 Gate A)"* die einzige Aufrufstelle ersetzt — `isFoundationApiRoute`
über das Routenmuster plus eine Zugangsklassen-Prüfung — und die alte Funktion
stehen lassen. Der Schutz wurde also ersetzt und verstärkt, nicht verloren; was
blieb, war ein Rückstand, der aussieht wie eine Regel. Er ist entfernt (wie die
zwei unerreichbaren Wachen aus B152 und B153).

**Dieselbe Technik auf das schärfste Tor des Baums angewandt — und es hält.**
`picoVaultDaemonSignatureNeedsApproval` entscheidet, ob eine Signatur die
Zustimmung der Person braucht: fünf freigestellte Familien, drei rollenabhängige
Ausnahmen, sonst fragen. Zwei Pflanzungen: *nichts braucht Zustimmung* → 13
Tests fallen; *die Identitätswurzel ist bei der Wiederherstellungs-Forderung
mitfreigestellt* (also: ein vollständiger Geräteaustausch ohne Rückfrage) → 1
Test fällt. Ich hatte vermutet, die dritte Ausnahme sei ungegangen, weil
`approval.test.ts` nur zwei davon prüft; sie steht in `sign-rendering.test.ts`,
in beide Richtungen. **Vor dem Aufschreiben nachgesehen — sonst stünde hier ein
Befund, den es nicht gibt.**

**Warum er zwei Monate stehen konnte, ist die systemische Hälfte:**
`noUnusedLocals` ist in `tsconfig.base.json` **nicht gesetzt**, also schweigt der
Übersetzer zu totem Code. Gemessen, was ein Einschalten heute meldete: **70
Stellen** — 42 im Produktcode, 28 in Tests, überwiegend ungenutzte Importe und
Typen. Das ist keine Aufräumarbeit für nebenbei und berührt Dateien, an denen
parallel gearbeitet wird. *Empfohlen:* einschalten, wenn ein ruhiger Tag da ist —
in genau diesem Rauschen hat sich ein Wächter versteckt. *Alternative:* so
lassen; die Zahl steht hier mit Datum und lässt sich jederzeit neu messen.

**B168 — Zehn leere Fänge, alle erklärt, einer nicht gegangen
(2026-09-14).** Ein `catch {}` ohne Rumpf verschluckt einen Fehlschlag. Gezählt
über den ganzen Baum: **341 Auffangblöcke** — 17 werfen mit `cause`, 47 nennen
den Fang im neuen Fehler, 24 werfen einen einzigen Ablehnungsnamen ohne Bezug
(oft richtig: ein Home, das drei Zustände mit *einer* Antwort beantwortet, darf
die Ursache nicht durchreichen), und **10 sind leer**.

**Alle zehn tragen einen Kommentar** — hier hat niemand stumm geschluckt. Und
die Gründe sind spezifisch, nicht beruhigend: `/proc` wird gelesen, während
Prozesse enden; ein Wanderungsprotokoll darf den ursprünglichen Fehler nicht
verdecken; eine Kettenlesung endet an ihrem bewiesenen Präfix; ein fälliger Lauf
wird nach ADR 0143 DP8 dem nächsten überlassen. Zwei Behauptungen habe ich
nachgeprüft statt geglaubt, und beide tragen: die Wanderungen **gehen** ihren
verschluckten Fehlschlag (`rolls back migration registry changes when audit
recording fails`), und `app.ts`' Satz *„Unreadable custody is the custody
guard's case to report"* stimmt — die Wache läuft zwei Zeilen später und meldet
mit `log.error`.

**Einer blieb übrig**, und er ist der folgenreichste. `OperatorStore.rehash`
wertet den Argon2id-Prüfer bei der Anmeldung auf stärkere Parameter auf. Der
Satz darüber: *„a failed upgrade must never turn a correct passphrase into a
failed login"*. Der **Gutfall** war gründlich gegangen — schwacher Prüfer, falsche
Passphrase wertet nicht auf, richtige wertet auf. Der **Satz** war es nicht.

Hergestellt: ein Auslöser bricht das `UPDATE` auf `foundation_operator` ab. Mit
dem Fang meldet sich die Person an, der alte arbeitende Prüfer bleibt stehen,
und der nächste Versuch holt die Aufwertung nach. Ohne ihn — gepflanzt — wirft
eine **richtige Passphrase** `SqliteError: planted_rehash_fails`: eine
Wartungsarbeit sperrt jemanden aus dem eigenen Home aus.

Nebenbei stand der Aufwertungstest strukturell schief: als frei stehendes `it`
zwischen zwei `describe`, eingerückt, als gehörte er in die Suite darüber. Er
lief, aber er hieß nicht, wo er wohnt. Jetzt steht er darin.

**Und eine eigene Fehlmessung gehört dazu.** Ich hatte zuerst gemeldet, *kein
einziger* Test nenne `rehash` — das war ein `grep` nach Kleinschreibung, das
`needsRehash` nicht findet. Es gab zwei Fundstellen. Die Zahl hätte einen Befund
getragen, den es so nicht gibt; gefunden habe ich das nur, weil ich vor dem
Aufschreiben noch einmal nachgesehen habe.

**Gehalten wird es von einer fünften Frage in `refusal:check`**, kein neues Tor:
*ein leerer Fang sagt, warum*. Sie hält nur, was schon gilt — zehn von zehn —,
und genau deshalb ist sie billig. Was sie **nicht** kann, steht in ihrem Kopf:
sie fragt nach dem Satz und nicht nach dem Gang, hätte also ausgerechnet diesen
Befund nicht gefunden. Was sie verhindert, ist der stumme Fang, den niemand
beschlossen hat; gepflanzt fällt sie darauf. Sie ist textuell und nicht über den
Syntaxbaum, aber nachgerechnet: dieselbe Messung über `typescript` fand genau
dieselben zehn.

**B166 — Was in einer Transaktion steht, das SQLite nicht zurückrollt — und
eine Berichtigung an mir selbst (2026-09-14).** Die Gegenrichtung zu B163 bis
B165: nicht *fehlt* eine Transaktion, sondern *steht etwas darin*, das ein
Rücklauf nicht mitnimmt — eine Datei, ein Netzabruf, ein Prozess.

Gemessen über alle **32 Transaktionen** des Baums: 53 verschiedene Aufrufe
stehen darin, die nicht SQLite sind. Fast alle sind interne Lesungen und
Prüfungen (`domainRecord`, `verifyReaderGrant`, `registerPicoIdentityReaderKey`
…). Nachgeprüft wurden die drei, bei denen es anders sein könnte:
`migration.up` fasst keine Datei an, `encryptForWrite` ist reine Kryptografie,
`keyAvailable` ist ein übergebenes Prädikat. **Es bleibt genau einer — und den
habe ich am Vortag selbst gebaut.**

B164 hat den Rumpf von `reconcilePicoHomeDeviceRecoveries` eingefasst, und darin
liegt `reconcilePicoHomeRecoveryAnchor`, das auf einem Zweig `anchor.seed()`
ruft — und das *schreibt eine Datei*. Mein Kommentar dort behauptete, die
Ankerdatei bleibe außen vor, weil die Ankermethode nach dem Säen zurückkehrt.
**Das ist falsch:** sie kehrt zurück, die *aufrufende* Methode läuft weiter, und
der Dateischreibvorgang liegt damit in der offenen Transaktion.

Der Schluss — harmlos — stimmt trotzdem, aber aus zwei anderen und
nachprüfbaren Gründen, und die stehen jetzt dort:

- Gesät wird nur, wenn der Anker leer ist **und** keine einzige
  Wiederherstellungszeile existiert. Auf diesem Zweig folgt danach kein
  Schreibvorgang, der scheitern könnte: das Verfallenlassen trifft null Zeilen,
  die Prüfschleife läuft über null Zeilen.
- Und selbst wenn das Festschreiben scheiterte, bliebe ein gesäter Anker ohne
  Einträge zurück, den der nächste Start als `live` liest. `'seeded'` wird im
  ganzen Baum **erzeugt und nirgends gelesen**, und `device-recovery.test.ts`
  geht genau diesen Übergang bereits — *„Seeded, so a normal installation
  notices nothing on the next boot."*

Kein neues Tor: eine Sonde, die einem Aufruf folgen muss, um den einen Fall zu
finden, braucht den Typprüfer, und die Fläche ist ein Fall groß. Was bleibt, ist
die Zahl — 32 Transaktionen, ein nicht rückrollbarer Effekt — und die Lehre, die
diesmal auf mich selbst zeigt: **ein Satz, der beruhigt, ist kein Beleg, auch
dann nicht, wenn er von gestern und von mir ist.**

**B167 — Die Hälfte, die unterdrückt, wurde nicht geprüft (2026-09-14).**
B165 kam daher, dass eine Begründung beim Hinschreiben nicht trug. Daraus die
allgemeine Frage: prüfen die Tore selbst, ob ihre begründeten Ausnahmen
überhaupt noch einen Gegenstand haben? Ein toter Eintrag verbirgt heute nichts —
aber käme der Name zurück, wäre die Ausnahme sofort wieder scharf, ohne dass
jemand sie beschlossen hätte.

Gemessen: **17 Tore führen begründete Einträge, 16 sind in Ordnung.** Und zwar
auf zwei Arten, die beide zählen: die meisten prüfen ihre Einträge ausdrücklich
(`check-refusal-reasons`, `check-constant-copies`, `check-signature-labels` …),
und einige **lesen ihre Listen aus dem Produktquelltext**, wo nichts veralten
kann — `check-signature-labels` zieht die Freistellungen mit einem Muster aus
`approval-policy.ts`, statt sie zu führen. Das ist die bessere Bauart.

Meine Sonde dafür war wieder ein Textmuster und hat wieder gelogen: sie meldete
fünf Verdächtige, vier davon zu Unrecht. Nur beim Einzelnachsehen blieb einer
übrig — `check-product-path.mjs`. Dort wird die Liste der produktnahen Dokumente
seit jeher auf Existenz geprüft, die **Ausnahmeliste nicht**, und das ist die
gefährlichere Hälfte. Gepflanzt: ein erfundenes `docs/geplantes-verzeichnis/`
ging unbemerkt durch. Jetzt fällt es.

**B165 — Eine Anweisung, die nur befolgt wird, wenn jemand vorbeikommt
(2026-09-13).** Dieser Befund fiel **beim Aufschreiben einer Begründung** an.
B164 trug `PicoRelayStore.pruneExpired` als begründete Schleife ins Tor ein, mit
dem Satz: *„was liegen bleibt, wird beim nächsten Anfassen desselben Postfachs
wieder gefunden"*. Beim Hinschreiben hielt der Satz nicht: **ein Postfach, das
niemand mehr anfasst, wird nie wieder angefasst.**

Gemessen: `pruneExpired` läuft ausschließlich aus `deliver` und `collect`, und
im ganzen Relay gibt es keinen Zeitgeber — der einzige `setTimeout` ist die
Abschaltfrist. Hergestellt: zwei Postfächer, in beiden ein Paket, eine Stunde
nach dem Ablauf **nur das erste** abgeholt — das zweite hält seines unverändert,
und nichts wird es je wegräumen.

ADR 0147 RY6 sagt, warum das falsch ist: *„An expired packet is one the sender
instructed the relay to stop holding, so pruning it is following an
instruction."* Und die Tabelle desselben ADR nennt den Zweck des Ablaufs in vier
Worten: *„expiry | Yes, to clear the queue"*. Eine Anweisung, die nur befolgt
wird, wenn zufällig jemand vorbeikommt, ist keine befolgte Anweisung — in der
Komponente, die ADR 0147 selbst *„the first component in this system that holds
a person's traffic"* nennt.

Der Fix ist **weniger** Code, nicht mehr: ein `DELETE FROM relay_packet WHERE
expires_at <= ?` über alle Postfächer ersetzt ein Lesen mit Schleife. Der
Vergleich trägt als Zeichenkette, weil jeder Ablauf ein auf das Raster
gerundeter ISO-Zeitpunkt ist — `pico_link_expiry_not_on_bucket` weist alles
andere ab, und `toISOString` schreibt für alle dieselbe Breite und Zeitzone.
Die Kosten ändern sich nicht: das Relay hat keinen Index, das Lesen je Postfach
war derselbe volle Durchlauf.

**Und das Tor aus B163/B164 hat sich selbst bewährt**, einen Tag nach seinem
Bau: der Fix nahm die Schleife weg, und `transaction:check` meldete sofort, dass
die Begründung dazu gegenstandslos geworden ist — *„ein Prüfer ohne Gegenstand
ist kaputt und nicht sauber"*, diesmal an einer echten Änderung statt an einer
Pflanzung.

**Gesucht, ob die Form sich wiederholt — sie tut es nicht.** Ein Ablauf, der
„hör auf, das zu halten" bedeutet, steht im ganzen Baum an genau **zwei**
Stellen: hier und in `pico_link_direct_seen_request`. Die zweite kehrt bei
*jeder* Anfrage und hält obendrein nur Anfragekennungen unter einer Decke von
1.024 — kein fremder Verkehr und nichts Unbegrenztes. Die fünf übrigen
Zeitspalten (`valid_until` an Mitgliedschaften, Delegationen, Lese- und
Schreibzuteilungen, `completion_expires_at` an Wiederherstellungen) sind
**Beweise und keine Vorräte**: sie laufen ab, aber die Zeile bleibt mit Absicht
stehen, aus demselben Grund wie der zurückgezogene Zustimmungsvermerk in B163 —
„abgelaufen" und „war nie da" sind verschiedene Tatsachen. Ein Kehrlauf über sie
wäre der Fehler, nicht sein Fehlen.

**B164 — Die Quarantäne überlebte, der Alarm nicht (2026-09-13).** B163 hatte
eine Frage ausdrücklich offen gelassen: ein Schreibsatz, der in einer *Schleife*
läuft, ist **ein** Schreibort und nicht zwei, also sieht ihn die erste Frage des
Tors nicht. Gemessen: **45 solche Stellen im Baum, 41 lagen längst in einer
Transaktion.** Von den vier übrigen waren drei richtig so — und eine war ein
Fehler.

`reconcilePicoHomeRecoveryAnchor` schiebt beim Start die zurückgerollten
Wiederherstellungszeilen **einzeln** auf ihren aufgelösten Stand. Erst *danach*,
in einer eigenen Transaktion, räumt der Aufrufer die Projektionen der
Betroffenen ab. Der Kommentar beim Einsammeln sagt selbst, dass beides
zusammengehört: *„Reporting an identity as quarantined while leaving its
delegations and reader keys projected would be the worst of both worlds."*

**Hergestellt statt geschlossen — und mein erster Schluss war falsch.** Ich hatte
erwartet, dass ein Abbruch dazwischen die Quarantäne *verliert*. Die Probe zeigte
etwas anderes: die Quarantäne fällt trotzdem, über einen zweiten Weg, nämlich die
Prüfung der Beweise. Was verloren geht, ist der **Alarm**:

| | Zeilenstand nach dem Abbruch | Nächster Start meldet |
|---|---|---|
| ohne Transaktion | `consumed` — der Rückroll ist getilgt | `live`, nichts zurückgeschoben |
| mit Transaktion | `pending` — der Rückroll steht noch da | `rollback_detected` |

Aus `app.log.error` — *„the Foundation data was rolled back"*, was ADR 0110 R6
eine **Angriffssignatur** nennt — wird ein `app.log.warn` über Beweise, die
nicht verifizieren. Und genau das verbietet der Satz eine Ebene höher:
*„Both anchor faults are loud … neither may be discovered by a person waiting
for recovery."* Der erste halbe Durchlauf tilgt die Spur, die den zweiten
auslösen würde — dieser Fall heilt sich, anders als die vier aus B163, **nicht**
von selbst.

Der Fix ist ein Umfassen und kein Umbau: der Rumpf von
`reconcilePicoHomeDeviceRecoveries` steht in einer Transaktion, die innere
bleibt als Sicherungspunkt darin. Die Ankerdatei bleibt außen vor — sie wird nur
auf dem Zweig beschrieben, der vor der ersten Zeilenschreibung zurückkehrt.

**`transaction:check` stellt jetzt zwei Fragen**, und die zweite hält den Fix:
`reconcilePicoHomeRecoveryAnchor` ist als `wrapped_by_caller` eingetragen, und
das Tor **rechnet nach**. Nimmt man die Einfassung weg, nennt es die Aufrufstelle
beim Namen (`event-store.ts:4632`) statt bloß zu schweigen. Die anderen drei
Schleifen sind begründet: der Kettenabgleich und `pruneExpired` sind Kehrläufe,
die sich bei jedem Start wiederholen, und `acknowledge` liefert nach ADR 0147
lieber zweimal aus als einmal zu wenig.

Zwei Pflanzungen: die Einfassung weg → die nachgerechnete Begründung fällt mit
Aufrufstelle; eine neue nackte Schleife eingesetzt → sofort gemeldet. Der Test
daneben geht den Weg selbst und fällt ohne die Transaktion mit
*„expected 'consumed' to be 'pending'"*.

**B163 — Ein Satz, der eine Gefahr nennt, ist kein Schutz vor ihr
(2026-09-13).** Gefragt: gibt es Methoden, in denen zwei Schreibvorgänge auf
*einem* Weg liegen und keine Transaktion sie zusammenhält? Ein Absturz
dazwischen lässt dann genau den Zustand zurück, den der Code daneben als
unmöglich beschreibt.

**Vier Fälle, und in dreien stand der Schaden bereits im Kommentar.**

- `presence-registry.ts#forget` löscht das Gerät und dann seine Schalter. Der
  Kommentar zwischen den beiden Zeilen nennt den Schaden wörtlich: *„a person
  who removed a phone and later paired a new one under the same id would
  silently inherit last year's answers"*. Bricht es dazwischen ab, ist die
  Präsenz fort und ihre Schalter bleiben — und die Zeile, die sie erklären
  würde, ist die gelöschte.
- `model-provider-registry.ts#revoke` zieht erst die Zustimmung zurück und
  löscht dann die Zugangsangabe. Die gefährliche Reihenfolge: hinterher hält
  dieses Home das Geheimnis von jemandem zu einer Entscheidung, die
  zurückgenommen wurde — neben einer Zeile, die bereits „zurückgezogen" sagt.
  Niemand würde dort danach suchen.
- `relay/store.ts#deregister` ist der schärfste: **dasselbe Schreibpaar steht
  ein zweites Mal in derselben Datei.** In `revokeAccount` liegt es seit jeher
  in einer Transaktion, und sein Kommentar zitiert `deregister` *namentlich*
  für die Begründung — während `deregister` sie nicht einhielt. Ein Nachbar
  hatte die Lehre, der andere nicht.
- `link-direct-seen-requests.ts#remember` fiel erst bei der Toranfertigung auf,
  und bei ihm sagt es der **Kopf der Datei selbst**: *„at capacity the insert
  evicts before it writes"*. Genau dieser Satz erklärt die zwei Schreibvorgänge
  zu einer Handlung. Bricht das Einfügen ab, ist die Kennung mit der kürzesten
  Restgültigkeit verdrängt und keine neue entstanden: zwei Anfragen sind
  wiederholbar statt einer, in der Tabelle, die Wiederholungen verhindert.

Alle vier sind eingefasst.

**Die Pflanzung zuerst, und sie fand nichts — das war der eigentliche Befund.**
Mit allen drei Transaktionen weggenommen liefen 120 Tests durch. Eine
Transaktion ist im Gutfall unsichtbar; sie lässt sich nur über ihren *Zweck*
gehen. Vier neue Tests tun das: ein Auslöser in SQLite lässt den **zweiten**
Schreibvorgang scheitern — ein Widerspruch der Datenbank und keine gestellte
Methode, denn eine gestellte Methode prüft die Einrichtung des Tests und nicht
das Verhalten des Codes. Jeder der vier fällt ohne seine Transaktion. Die
Technik gab es im Baum schon, in `device-recovery.test.ts` und
`identity-root-rotation.test.ts`; sie war nur nie auf die Methoden angewandt
worden, die keine Transaktion hatten.

**Das Tor: `transaction:check`, und zum ersten Mal über den Syntaxbaum.** Eine
Sonde aus Zeilenfenstern hat mich bei dieser Messung sechsmal in die Irre
geführt — sie hielt `if/else` für zwei Schreibvorgänge auf einem Weg, übersah
eine Transaktion zwei Zeilen weiter, schnitt Methoden an der falschen Klammer
ab. In dieser Sitzung sind fünf Fehlmessungen aus unscharfen Fenstern
entstanden; ein Tor darauf zu bauen wäre die sechste gewesen. `typescript` liegt
ohnehin im Baum, also fragt das Tor den Übersetzer: wo eine Methode aufhört, was
ein Schreibvorgang ist (auch wenn der Satz erst in einer Variablen liegt und in
einer Schleife läuft), und ob zwei Schreibvorgänge einander ausschließen — zwei
Zweige eines `if` sind zwei Wege, und ebenso ein Zweig, der mit `return` endet,
gegenüber allem danach.

Gemessen: **79 Schreibvorgänge stehen in einer Transaktion, 98 allein; von 85
Funktionen, die außerhalb einer schreiben, legen 3 zwei oder mehr auf einen
Weg, und alle 3 sind begründet.** Und die Erkennung ist nicht ungefähr,
sondern nachgezählt: über 249 Quelldateien stehen 170 Schreibsätze unmittelbar
in der Kette und 7 in einer Variablen, **0 blieben unerkannt und 0 `.run()`
hingen an einem nicht schreibenden Satz** — 170 + 7 = 177 = 79 + 98. Ein Tor,
das nur *fast* alles sieht, meldet Erfolg über dem, was es übersehen hat. Die Begründungen sind zwei Arten:
`wrapped_by_caller` wird **nachgerechnet** — das Tor zählt die Aufrufstellen und
besteht darauf, dass jede in einer Transaktion liegt; ein Name ist keine Regel
(B124). `argued` trägt einen Grund, den kein Skript nachrechnen kann, wie der
Abgleich beim Start, der ohnehin bei jedem Start vollständig neu läuft.

Drei Pflanzungen gegen das Tor, eine je Frage: Transaktion weg → gefunden;
begründete Methode umbenannt → *beides* gemeldet, der neue Name als unbegründet
und der alte Eintrag als gegenstandslos; dem eingefassten Aufrufer seine
Transaktion genommen → die nachgerechnete Begründung fällt und nennt die
Aufrufstelle.

**Und das Tor hat sofort meinen eigenen Eintrag verworfen.** Ich hatte
`PicoRelayStore.acknowledge` als begründet eingetragen — es löscht Pakete
einzeln in einer Schleife. Das Tor meldete: *„ein Prüfer ohne Gegenstand ist
kaputt und nicht sauber"*. Es hatte recht: eine Schleife ist **ein** Schreibort
und nicht zwei, also fragt dieses Tor den Fall gar nicht. Die Frage ist trotzdem
echt und steht im Skriptkopf gemessen: `deletePicoObservations` fasst seine
Schleife ein, `acknowledge` tut es nicht, und beides ist richtig — ADR 0147
liefert lieber zweimal aus als einmal zu wenig. Wer das fragen will, stellt eine
neue Frage; sie hier mitzuführen hieße, zwei Fragen als eine auszugeben.

**B162 — Der Satz stand schon da, dreimal, und einmal gedriftet
(2026-09-13).** Punkt 4 nannte die dreizehn Aufrufe des Webclients „die
mildeste Lage von allen — ein Reiter, der sich dreht". Beim Hinsehen war die
Lage eine andere: **zehn der dreizehn hatten gar keinen Auffangzweig.** Dort
drang `fetch failed` oder `NetworkError` nach außen — das, was die Plattform
gerade sagt, und genau das Symptom, für das ADR 0131 A7 einen Satz verlangt.

Und der Satz stand längst da: `loginOperator`, `sendJson` und `fetchJson`
schrieben ihn je selbst — **und einer war schon gedriftet**, bei ihm fehlte der
Artikel („Could not reach ${label} endpoint" statt „the ${label}"). Eine
Wahrheit, dreimal geschrieben, und die Drift hatte schon begonnen.

`reachFoundation` schreibt ihn jetzt einmal, und alle dreizehn Aufrufe gehen
hindurch. **Die Statusbehandlung bleibt bei den Aufrufern**: ein 401 heißt dort
etwas anderes als ein 409, und das gehört dorthin, wo der Unterschied etwas
bedeutet. Gefaltet ist nur, was überall dasselbe war.

**Und die offene Frist hat damit einen Ort.** Punkt 4 des Handoffs wartet noch
auf eine Zahl für den Browser; ein Signal an dieser *einen* Stelle deckt dann
alle dreizehn. Aus einer Entscheidung über dreizehn Aufrufe ist eine über eine
Zeile geworden.

Zwei Gänge über drei verschiedene Wege — die Faltung behauptet ja gerade, dass
es für alle derselbe Satz ist —, und die Pflanzung nimmt ihn weg: dann steht
das Symptom wieder draußen. Eine der beiden Erwartungen war dabei von mir
geraten und nicht nachgesehen: `listRetentionPolicies` heißt „retention
policies", nicht „policy". Der Test nennt jetzt die echte Benennung.

**B161 — Die Fristen sind gesetzt, und eine eigene Fehlmessung dabei
(2026-09-13, Entscheidung des Nutzers).** Auf B160 hin hat der Nutzer
entschieden: **30 Sekunden für die zwei Daemon-Wege, größer für die Messung.**

Gesetzt ist überall dieselbe **Form**, die `link-direct-client.ts` seit dem
2026-08-22 trägt: ein eigener `AbortController` statt `AbortSignal.timeout`,
weil der Wecker nach dem **Rumpf** gelöscht werden muss — nicht nach den
Kopfzeilen, denn ein Home, das Kopfzeilen schickt und dann verstummt, ist
dasselbe Schweigen einen Schritt später — und weil eine gestellte Uhr ihn
stellen können soll. Dazu je ein eigener Grund: `continuity_read_timed_out`,
`foundation_timed_out`, `pico_model_provider_probe_timed_out`, und daneben ein
`…_unreachable:<code>` für den Fall, dass niemand hinkommt. „Es hat zu lange
geschwiegen" ist eine andere Auskunft als „es hat abgelehnt", und beide sind
andere als „niemand hat nachgesehen".

**Die fünf Minuten der Messung sind begründet und nicht gegriffen.**
`/api/generate` erzeugt wirklich, und der erste Aufruf lädt dabei ein Modell von
mehreren Gigabyte. Ein Wirt, der dafür Minuten braucht, ist langsam und nicht
tot — genau diesen Unterschied misst das Modul, und eine Frist auf
Gesprächsmaß hätte jede ehrliche Messung eines langsamen Wirts in einen
Fehlschlag verwandelt. **Nicht** `picoModelJobDeadlineMs` genommen, das die
Laufzeit daneben ableitet: die braucht einen fertigen Eintrag, und dieses Modul
erzeugt ihn erst. Eine Frist aus Zahlen zu rechnen, die diese Messung gerade
misst, wäre ein Kreis.

Fünf Wege sind es am Ende geworden, nicht drei: die zwei Zugangs-Sonden der
Messung stehen bewusst außerhalb des Helfers, weil ein 401 dort die Auskunft
ist und kein Fehlschlag — nur das Schweigen wird ihnen abgenommen.

**Und eine eigene Fehlmessung gehört zum Befund.** Die Sonde aus B160 suchte
`fetch(` und `requestFetch(`; `model-runtime.ts` geht über eine injizierte
`this.call` und fiel ganz heraus. Die Laufzeit hat ihre Fristen längst, und
zwar die feinste von allen. Beim Nachzählen hat mich dann ein zu kleines
Zeilenfenster ein zweites Mal in dieselbe Richtung getäuscht — es meldete die
Laufzeit als unbefristet, weil `signal:` mehr als zwölf Zeilen hinter dem
Aufruf steht. **Zum dritten Mal in dieser Sitzung hat ein Fenster falsch
gemeldet** (B152, B158, hier); auf so etwas gehört kein Tor, und die Zahl in
B160 ist korrigiert statt stehen gelassen.

Drei Pflanzungen, jede über eine nie gestellte Uhr: alle drei Wege warten dann
wieder für immer, und alle drei Tests fallen.

**Und der volle Kettenlauf hat dabei etwas gefunden, das nichts damit zu tun
hat.** `supplier-host.test.ts` prüft, dass ein Zulieferer, der vier Gigabyte
*ankündigt*, die Verbindung sofort verliert statt erst bei der Anfragefrist —
und die vergangene Zeit ist das einzige, was die beiden trennt. Der Abstand
betrug **100 ms**: Frist 1.000, Schranke 900. Darin steckt der Start eines
Kindprozesses. Unter Volllast der Kette wurden daraus 1.037 ms, allein
hintereinander dreimal grün.

Ein Test, dessen Ergebnis von der Maschinenlast abhängt, meldet einen Fehler,
den niemand gemacht hat — dieselbe Lehre, die `reader-custody.test.ts` schon
für die Wanduhr aufgeschrieben hat. Die Schranke ist deshalb **nicht gelockert**
worden: die Frist dieses einen Prüfstands steht jetzt auf 30 Sekunden und die
Schranke auf einem Drittel davon. Der Abstand ist damit unmissverständlich, und
die Pflanzung — die Rahmengrenze entfernt — lässt den Test weiterhin fallen.

**B160 — Ein Weg hat die Lehre gelernt, vier nicht (2026-09-13).** Der offene
Punkt „Fristen für ausgehende Anfragen" (B77) stand seit Langem mit der
Bemerkung, die dreizehn Anfragen des Dashboards lägen in derselben Lage wie
`model-provider-measure.ts`. Nachgemessen über `apps|packages|modules/*/src`:
**sechzehn ausgehende HTTP-Aufrufe, genau einer hat eine Frist.**

**Korrektur am 2026-09-13, aus B161 heraus:** diese Sonde suchte `fetch(` und
`requestFetch(` und hat damit `apps/core/src/model-runtime.ts` ganz übersehen,
das über eine injizierte `this.call` geht. **Die Laufzeit hat ihre Fristen —
und die feinste von allen:** `picoModelJobDeadlineMs` rechnet sie aus
Kaltladezeit, Kontextgröße und erwarteten Antworttoken. Es waren also *zwei*
Wege mit der Lehre, nicht einer. Der Satz unten bleibt richtig für die drei
gefundenen Lücken; die Zahl davor war zu klein gezählt.

Der eine ist `link-direct-client.ts`, und er hat sie gründlich: ein eigener
`AbortController` statt `AbortSignal.timeout`, weil der Wecker nach der Antwort
**gelöscht** werden muss und eine gestellte Uhr ihn stellen können soll; die
Frist ist aus der Lebensdauer des Umschlags abgeleitet statt danebengeschrieben;
und das Schweigen bekommt einen eigenen Namen, `link_home_timed_out`, den ADR
0131 A7 verlangt. Sein Kommentar beschreibt dabei genau die Lage, um die es
geht: *„auf dem Telefon ein Vordergrunddienst, der nicht zurückkommt."*

**Und zwei der unbefristeten Aufrufe stehen in genau dieser Lage.**
`fetchPicoHomeContinuityChain` wird über `refreshPicoHomeHostPins` aus
`apps/companion/src/first-run.ts` gerufen — dem **ersten Lauf** eines
Companions —, und die Anspruchszeremonie aus `founding.ts`. Schweigt das Home,
wartet beides ohne Ende und ohne Satz. Das ist der Moment, in dem ein Mensch am
wenigsten Zusammenhang hat, um zu verstehen, was nicht geschieht.

Die dreizehn im Webclient sind die mildere Hälfte derselben Sache: ein Reiter,
der sich dreht. Browser brechen `fetch` von sich aus nicht ab.

**Die Zahl bleibt eine Wahl und steht deshalb hier und nicht im Code.** Die 30
Sekunden des einen befristeten Weges sind aus der Umschlag-Lebensdauer
abgeleitet; ein unversiegelter Kettenlesevorgang hat keinen Umschlag, also
überträgt sich die Ableitung nicht. Was sich überträgt, ist die **Form**: ein
eigener Controller, ein gelöschter Wecker, ein benannter Grund. Die Empfehlung
steht in `.agent-context.md` Punkt 4.

**B159 — Was B71 draußen ließ, und warum ein Teil davon hereingehört
(2026-09-13).** Nach zwölf gegangenen Auffang-Gründen in B156 bis B158 blieben
sieben, und sie sind der teure Schwanz: drei brauchen einen Dateisystemfehler,
den ein Test von innen nicht herstellen kann, zwei hängen an der
Electron-Fläche, zwei an einem Aufbau, der heute nur gültige Stapel baut.
Dafür brüchige Tests zu schreiben wäre schlechter als keine.

**Also wird die Klasse sichtbar statt erneut gemessen.** B71 hat gemessen, dass
ein Tor über *alle* geworfenen Meldungen nicht taugt — 907 Stück, 464 ohne
Test, und ein Wurf ist meist eine Zusicherung an sich selbst, die mit gültiger
Eingabe gar nicht erreichbar ist. Der Satz gilt weiter. Er gilt **nicht** für
die Würfe aus einem `catch`: das sind **50** statt 907, und sie sind die Naht,
an der ein Fehlschlag von außen — ein kaputter Rumpf, ein toter Prozess, eine
Bedingung der Datenbank — einen Namen bekommt, den ein Aufrufer lesen kann. Das
ist Produktverhalten und keine Selbstzusicherung.

Der Beleg dafür ist B150: den Helfer auf `false` gesetzt, und 1.153 Prüfungen
des Kerns blieben grün.

`check-refusal-reasons.mjs` trägt das jetzt als vierte Frage über demselben
Gegenstand: 43 der 50 gegangen, sieben mit ihrem Hindernis. Die Suche ist dabei
absichtlich **lockerer** als die der Union oben — ein geworfener Grund reist oft
zusammengesetzt (`unreadable_platform_unlock:invalid_platform_unlock_record`),
und ein Test, der die ganze Meldung erwartet, hat ihn sehr wohl gegangen. Genau
daran hat meine erste Zählung acht statt sieben gemeldet.

Drei Pflanzungen, alle drei Richtungen: ein neuer Auffang-Grund ohne Test
fällt, eine Schuld, die längst gegangen ist, fällt, und ein Eintrag, den der
Baum nicht mehr trägt, fällt ebenso.

**B158 — Zwei Nachbarn binden verschieden, und niemand sagt warum
(2026-09-13).** Drei weitere aus der Liste, und der dritte fiel nur auf, weil
**meine eigene Attrappe lief, obwohl sie nie laufen durfte**.

Gegangen sind: ein gespeicherter Entsperrsatz, der gar kein Datensatz ist — er
steht vor allen anderen Prüfungen dieser Datei, und ohne ihn liefe der Rest
gegen `null` oder ein Array —, sowie die zwei Argumentprüfungen von
`PicoReaderCustodySyncItemAccess.access`. Die stehen **vor** jedem Laden, und
genau das sagt der Test: seine Attrappen werden nie gerufen. Liefe eine, stünde
die Prüfung an der falschen Stelle.

**Und eine lief.** Ein Name aus 300 Zeichen ging durch.
`assertReaderSyncItemToken` nimmt die Vorgabe von `isAsciiToken` — **1.024
Bytes** —, während `assertAsciiReference` eine Zeile darüber ausdrücklich bei
**256** begrenzt. Zwei Nachbarn, zwei Grenzen, und nichts sagt warum.

Ich habe die Differenz **nicht** angefasst, und das ist eine Entscheidung:
gefunden habe ich keine Stelle, an der sie etwas entscheidet — der Name ist ein
Nachschlageschlüssel und kein Pfadbestandteil, und die Werte kommen aus einem
unterschriebenen Stapel, also nicht von einem Fremden. Eine Grenze enger zu
ziehen ist eine Produktentscheidung und keine Aufräumarbeit: sie könnte Daten
ablehnen, die eine bestehende Aufstellung schon hält. Der Test hält jetzt die
Grenze fest, die **wirklich** gilt, und der Satz daneben sagt, dass sie von
ihrer Nachbarin abweicht.

Drei Pflanzungen, drei rote Tests. Von 10 ungegangenen Auffang-Gründen sind
**7** übrig — darunter die drei `cleanup_failed`-Pfade, die einen
Dateisystemfehler brauchen.

**B157 — Drei Parserfälle, und ein Zweig, der nichts entscheidet
(2026-09-13).** Weiter durch die dreizehn aus B156, zuerst die billigen:

- **Eine Erreichbarkeit, die gar keine Adresse ist.** Die zwei feineren
  Unterscheidungen — kein Netztransport, trägt eine Zugangsangabe — waren
  geprüft, der Grundfall nicht. Ohne den Auffangzweig um `new URL` dränge ein
  `TypeError` der Plattform nach außen, statt dass die Regel eine Auskunft
  gibt.
- **Ein Relay, das ablehnt und keinen Grund nennt.** Eine Ablehnung ist eine
  *Antwort* — etwas, das der Aufrufer anders tun kann. Ohne Satz ist sie keine,
  und der Klient wirft. Dieser Unterschied hatte keinen Test.
- **Ein Betreiberrumpf, der kein JSON ist.** Der erste Grund, den jemand mit
  einem falsch gebauten Werkzeug trifft; wichtig ist, dass er 400 mit Namen
  wird und nicht 500.

**Und eine Pflanzung, die nicht feuerte — die interessanteste Zeile des
Befunds.** `assertReach` weist zuerst `''` ab und parst danach. Nimmt man den
Leerstring-Zweig weg, bleibt alles grün: `new URL('')` wirft ebenfalls, gemessen
statt vermutet. Der Zweig ist also **redundant** — aber er ist *kein* Fund wie
B152 und B153. Dort war ein Grund gar nicht erreichbar; hier wird er
gesprochen, nur von zwei Stellen. Er bleibt als ausgesprochene Absicht stehen,
und der Unterschied steht im Test daneben, damit ihn niemand später für
dieselbe Sache hält.

Drei Pflanzungen, drei rote Tests. Von 13 ungegangenen Auffang-Gründen sind
**10** übrig.

**B156 — Die Schwester derselben Frage: geworfene Auffang-Gründe
(2026-09-13).** B151 hat die `reason:`-Unionen geschlossen. Daneben steht eine
zweite Vokabelmenge, die das Tor bewusst nicht führt: Gründe, die aus einem
`catch` **geworfen** werden. B71 hatte das für *alle* Würfe gemessen und
abgelehnt — 907 Stück, 464 ohne Test —, weil ein Wurf meist eine Zusicherung an
sich selbst ist. Die Auffangstellen sind aber eine viel engere Menge: **50**,
und sie sind genau die Naht, an der ein Fehlschlag der Infrastruktur einen
Namen bekommt.

**Neunzehn davon nannte kein Test.** Der schärfste Haufen sind vier in
`link-direct-client.ts` — die Tür, an der ein *Gerät* entscheidet, ob die
Antwort seines Homes echt ist. Jede sagt etwas anderes: der Umschlag ist keiner,
er lässt sich nicht öffnen, der Inhalt hat die falsche Form, die Unterschrift
stimmt nicht. Wer sie zusammenwirft, kann einen Angriff nicht von einem
defekten Home unterscheiden. Alle vier sind gegangen, jede mit einer eigenen
Attrappe, und die Unterschriftsprüfung ist dabei sauber von der Bindungsprüfung
getrennt: dieselbe Antwort, nur von einem fremden Schlüssel unterschrieben.

Dazu zwei weitere: ein Handschlag, der die Version nennt und die **Schlitze**
nicht — ADR 0136 BR1 hält die Liste geschlossen, und ein Zulieferer, der
offenlässt, welche er füllt, könnte jeden beanspruchen —, und ein
Geltungsbereich, der leer ist. Der letzte ist die gefährlichste Form von allen:
ein unterschriebenes Recht, das nicht sagt, wozu, und jede spätere Prüfung
fragt `requiredScopes` gegen eine leere Menge. Er steht **zweimal** im
Protokollpaket, für Delegationen und für Mitgliedschaften; der Test deckt
beide.

Sechs Pflanzungen, sechs rote Tests. Von 19 ungegangenen Auffang-Gründen sind
**13** übrig, davon fünf in `packages/sync` um die Leserverwahrungs-Synchronisation
und der Rest einzeln verstreut.

**B155 — Der Anspruchsweg löste sich durch einen Umzug, nicht durch mehr
Aufbau (2026-09-13).** Die letzten dreizehn Schulden aus B151, und die elf
teuersten hingen an derselben Sache: `verifyPicoHomeFoundingEvidence` stand
**modulprivat in `app.ts`** und war nur über die Anspruchsfläche erreichbar —
tief in einem Startpfad, der ein Home aus einer Sicherung wiederherstellt. Ein
Gang dorthin hätte ein gebootetes Home mit verfälschter Gründung auf der Platte
gebraucht.

Die Funktion ist aber **rein**: ein Datensatz, ein Hostschlüssel, ein Urteil.
Modulprivat war sie nur, weil sie niemand sonst brauchte — und ihre zwei
Geschwister stehen längst anders: `verifyPicoHomeMembershipAuthority` in
`home-membership.ts` und `verifyPicoHomeDomainReadGrant` in
`domain-read-grant.ts`, exportierte reine Prüfer mit eigenen Tests. Der Umzug
in ein eigenes `founding-evidence.ts` ist also kein neuer Zuschnitt, sondern
derselbe, den die Nachbarn schon haben; `sodium` kommt als Parameter herein wie
dort auch. Nebenbei ist es ein kleiner Schritt von P8, das `app.ts` entlang
seiner Vertrauensgrenzen teilen will.

**Danach waren elf Serverstartfragen elf gewöhnliche Tests**, und alle elf
gingen beim ersten Lauf: fremdes Schema, falsche Schlüsselrolle, ein Antragsteller,
den die Gründung nicht nennt, beide Erstgeräteschlüssel, eine Delegation, die
die Gründung nicht nennt, eine ohne `surface_session`, eine nach der
Unterschrift bearbeitete Gründung, eine bearbeitete Anspruchsantwort, eine
Gegenzeichnung von fremdem Hostschlüssel, und etwas, das gar keine Unterschrift
ist.

Der Aufbau ist dabei eine **echte** Gründung — jede Unterschrift gerechnet, nicht
gesetzt. Mit erfundenen Unterschriften wäre jeder Fall auf denselben Namen
gefallen, und der Test hätte elfmal dasselbe bewiesen. Die Pflanzung über alle
elf Gründe trifft zehn Tests; der elfte ist der Gutfall und bleibt zu Recht
grün.

**Und die zwei letzten:** `pico_supplier_closed` und `pico_supplier_exited`
heißen beide „der Zulieferer ist nicht mehr da" und meinen Verschiedenes —
einmal hat *dieses* Home zugemacht, einmal ist der fremde Prozess gegangen. Wer
beides gleichsetzt, kann nicht mehr unterscheiden, ob ein Abbruch die eigene
Entscheidung war. Der zweite Test schreibt dafür einen Zulieferer, der auf eine
Anfrage nicht antwortet, sondern endet.

**Damit ist B151 geschlossen: 135 von 135 Gründen gegangen, keine Schuld
übrig** — von dreißig ungegangenen am 2026-09-12 auf null am 2026-09-13, in
fünf Befunden.

**B154 — Die Urkunden sind gegangen (2026-09-12).** Die dritte Schuldengruppe
aus B151, und die billigste: fünf Ablehnungen über Domänen-Lesezugang und
Mitgliedschaft, alle hinter exportierten Funktionen, die ihre Testdateien schon
fahren. Keine neue Erkenntnis über den Code — aber fünf Türen, die jetzt
jemand aufgestoßen hat.

Gegangen sind: ein Lebenszyklus mit fremdem Schema und einer, der eine andere
Zuteilung nennt; dieselben beiden für die Mitgliedschaft; und die
Gegenzeichnung eines fremden Hosts. Dazu die Auffangstelle
`malformed_domain_read_grant` an allen drei Orten, an denen sie steht — sie
fängt, was beim Bauen der Signatureingabe oder beim Prüfen des Schlüssels
überhaupt *wirft*, damit nichts davon ungefangen nach außen dringt. Der Test
gibt dafür etwas, das gar keine Unterschrift sein kann.

`invalid_host_activation_signature` ist die schärfste der fünf: ADR 0080 H6
sagt, das Home kann Mitgliedschaft **verweigern**, aber nie prägen. Ohne seine
Gegenzeichnung gilt keine — und eine Gegenzeichnung von einem fremden
Hostschlüssel muss hier fallen und nicht erst beim Einlesen.

Eine Pflanzung über alle fünf Namen, vier rote Tests. Von 25 Schulden sind
**13** übrig; das Tor zählt 135 Gründe, **122** gegangen.

Was bleibt, ist die teure Hälfte: elf Gründe des Anspruchswegs hinter einer
modulprivaten Funktion in `app.ts`, die nur über die Anspruchsfläche erreichbar
ist, und zwei, die einen Zuliefererprozess brauchen, der mitten in einer
Anfrage endet.

**B153 — Derselbe Selbstvergleich, diesmal außer Sichtweite (2026-09-12).**
Die zweite Schuldengruppe aus B151 — die Umschlagausgabe — brachte B152 ein
zweites Mal, und zwar in der Form, die mein Textsweep nicht finden konnte.

`share-envelope.ts` ruft die Leserschlüssel-Auswahl **mit**
`grant.grant.readerPicoIdentityFingerprintHex` und hält den zurückgegebenen
Kandidaten danach gegen genau diesen Wert. Die Abfrage dahinter filtert
`pico_identity_fingerprint_hex = ?` mit dem Parameter und gibt die Spalte
zurück — also `x !== x` über einen Funktionsaufruf und eine SQL-Runde hinweg.
**`reader_does_not_match_grant` konnte nie fallen.** Der Sweep aus B152 sucht
`const n = ausdruck` gefolgt von `ausdruck !== n`; hier liegt zwischen beiden
eine Methode und eine `WHERE`-Klausel. Die Klasse ist also breiter, als ein
Textvergleich sie sieht.

**Gehalten wird die Bindung trotzdem, unter einem anderen Namen** — und das ist
jetzt ausgeführt statt gelesen: wer eine Delegation nennt, die dem Leser der
Zuteilung nicht gehört, findet keine Zeile und bekommt
`reader_key_is_not_locally_eligible`. Ein Test hält das fest; die unerreichbare
Wache ist weg.

**Und die zwei erreichbaren Gründe dieser Tür sind gegangen.** Der schärfere
ist `authority_changed`: `prepare` liest die Zuteilung ein **zweites Mal**,
nachdem die Auswahl `await`-et hat, weil sie in dieser Lücke enden kann. Der
Test zieht sie genau dort zurück — im Frischeruf, der innerhalb der Auswahl
läuft. Ohne die zweite Lesung bekäme jemand einen Umschlag auf eine Vollmacht,
die es beim Ausstellen nicht mehr gab; die Pflanzung, die sie entfernt, fällt
jetzt auf.

Von 25 Schulden sind **18** übrig. Das Tor zählt 135 Gründe, 117 gegangen.

**B152 — Eine Wache, die einen Wert mit sich selbst verglich (2026-09-12).**
Beim Abarbeiten der ersten Schuld aus B151 — der Identitätssitzung — fiel in
`verifyIdentitySessionProof` eine Prüfung auf:

```
const identityFingerprint = delegation.issuerIdentityKeyFingerprintHex;
…
if (delegation.issuerIdentityKeyFingerprintHex !== identityFingerprint || …)
  return { ok: false, reason: 'delegation_subject_mismatch' };
```

Dreimal `x !== x`. Die drei Konstanten sind unmittelbar aus genau den drei
Feldern gelesen, gegen die sie gehalten werden; `delegation` ist `const` und
wird dazwischen nicht angefasst. **Diese Ablehnung konnte nie ausgesprochen
werden** — und dem Tor fiel sie nicht auf, weil sein erster Satz nur fragt, ob
der Grund *irgendwo* erzeugt wird, und das Literal steht ja da.

**Sie verdeckte nichts, und das ist nachgesehen.** Was sie zu sagen scheint,
sagen die drei Prüfungen darüber bereits: jeder Schlüsseldatensatz wird gegen
das Feld der Delegation gehalten, das ihn benennt. Die Unterschrift prüft der
Lebenszyklusindex, den Besitz der Besitznachweis. Eine zweite Quelle, gegen die
dieser Vergleich hätte laufen können, gibt es nicht — der Aufrufer *leitet* die
Identität aus dem Beweis ab, statt sie mit einer erwarteten zu vergleichen.
Wache und Grund sind weg, die Begründung steht an ihrer Stelle.

**Der Sweep danach ist ein sauberes Negativergebnis.** Über 261 Quelldateien
gesucht nach `const n = ausdruck` gefolgt von `ausdruck !== n`: zwei weitere
Treffer, **beide richtig**. In `relay-operator.ts` liegt ein `filter` zwischen
Zuweisung und Vergleich, in `web/main.ts` ein `await` — ein Vorher/Nachher ist
genau dann sinnvoll, wenn dazwischen etwas geschieht. Der Unterschied zum Fund
ist messbar und nicht Geschmack.

**Und die erste Gruppe der B151-Schulden ist gegangen:** ein fremder
Identitätsschlüssel, eine vertauschte Schlüsselrolle, ein fremder
Unterschriftsschlüssel und eine Delegation, deren Unterschrift nicht verifiziert
— die Bindung „dieser Datensatz ist der, den die Delegation benennt". Geprüft
war vorher nur der dritte Schlüssel und der Besitznachweis. Von 25 Schulden sind
21 übrig.

**B151 — Das Tor über alle Ablehnungen sah weniger als die Hälfte
(2026-09-12).** Erst eine Sonde, die nichts fand, und das ist auch ein
Ergebnis: **alle vierzehn einzelnen Wahrheiten des Protokolls sind gehalten** —
`isAsciiToken`, `isHexOfBytes`, `hasExactKeys`, die Instant-, Lebenszyklus- und
Domänenregeln —, jede einzeln entwaffnet, jede von einem Test bemerkt.

Die zweite Sonde traf. `check-refusal-reasons.mjs` erkennt einen erklärten
Ablehnungsgrund am Muster `reason: 'a' | 'b';` — mit dem Semikolon
**unmittelbar** dahinter. Genau diese Schreibweise benutzt dieses Repository am
seltensten. Verfehlt wurden: die Union in einem Inline-Objekttyp
(`| { ok: false; reason: 'a' | 'b' };`, weil eine Klammer dazwischensteht), die
über mehrere Zeilen gesetzte Union, und damit **jedes**
`return { ok: false, reason: '...' }`.

**Gemessen: das Tor sah 53 Gründe; mit `ok: false` ausgesprochen werden 113.**
Ein Tor, dessen erster Satz lautet *„Jede Ablehnung, die dieses Produkt
aussprechen kann, ist einmal gegangen worden"*, maß weniger als die Hälfte —
und seine Gründungsmessung (B71, *„alle 53 sind erzeugbar"*) stand über
derselben zu kleinen Menge. Nach der Weitung sieht es **137**.

**Dreißig Gründe nannte kein Test, alle im Kern**, und es sind die Türen, an
denen ein falsches Ja etwas öffnet: Heimanspruch, Identitätssitzung,
Leserverwahrung, Umschlagausgabe, Urkunden.

Fünf davon sind gegangen — die Leserverwahrung, wo ein Aufbau schon stand:
eine Domäne, die der Speicher nie gesehen hat; ein Schreiber, dessen
Mitgliedschaft endete; ein Lebenszyklus für einen Zugang, den es nicht gibt;
ein Leser, dessen Schlüssel nicht der ist, den die Registratur hält; und eine
Domäne, die schon unter anderer Verwahrung steht. Fünf Pflanzungen, fünf rote
Tests.

Die übrigen **25** stehen als Schuld mit ihrem Hindernis, und die Sätze sind je
Gruppe **einmal** geschrieben: es sind fünf Hindernisse, nicht
fünfundzwanzig. Fünfundzwanzig verschiedene Sätze zu erfinden wäre das
mechanische Füllen, vor dem B95 warnt — und der Leser läse fünfundzwanzigmal
dasselbe, ohne es zu merken.

**Die Weitung hat einen eigenen Fehler eingebaut, und das Tor hat ihn
gezeigt.** Es streicht die erkannten Stellen, bevor es zählt, was *erzeugt*
wird — mit dem weiten Muster strich es damit genau die
`return { ok: false, reason: '...' }` heraus, die es zählen soll, und meldete
jeden so ausgesprochenen Grund als unerzeugbar. Erklärung und Erzeugung sind
jetzt getrennt: `;` schließt eine Typzeile, `}` ein Objekt — es sei denn, die
Union trägt ein `|`, dann ist sie ein Inline-Objekttyp und wieder eine
Erklärung. Die Parameterform `function f(reason: 'a' | 'b')` fällt heraus, weil
dort eine runde Klammer folgt, und das ist richtig: ein Parameter ist kein
Versprechen an einen Aufrufer.

**B150 — Die Regel gegen das zweite Wecken war nur gegen ein Modell bewiesen
(2026-09-11).** Die Frage war eine ganz andere: schreibt oder liest irgendetwas
jede Spalte, die eine Migration anlegt? Antwort, und ein sauberes
Negativergebnis: **438 Spalten über 44 Tabellen, alle benannt.** Die einzige
scheinbare Ausnahme, `schema_migration_audit.error_message`, wird in der
Migrationsdatei selbst geschrieben, die meine Messung ausgeschlossen hatte.

Die Gegenfrage trug: **33 Stellen erkennen einen Fehler an seinem Meldungstext**,
und die meisten erkennen eigene Namen — hier die Ablehnungssprache, also in
Ordnung. Drei gehen auf SQLite. Eine davon, im Push-Hauptbuch, war eine zweite,
**schwächere** Schreibweise derselben Frage: `'UNIQUE'` statt
`'UNIQUE constraint failed'`, tausend Zeilen entfernt vom argumentierten Helfer
`isPicoUniqueConstraintViolation`, den drei andere Stellen benutzen.

**An echtem SQLite nachgemessen**, weil dieser Satz die Grundlage von vier
Stellen ist und ihn niemand ausgeführt hatte: ein doppelter Primärschlüssel
meldet `UNIQUE constraint failed` mit dem Code `SQLITE_CONSTRAINT_PRIMARYKEY`,
ein doppelter UNIQUE-Index dieselbe Meldung mit `SQLITE_CONSTRAINT_UNIQUE`; NOT
NULL, CHECK und eine fehlende Tabelle fallen nicht hinein. Beide Schreibweisen
urteilen über alle fünf Fälle gleich. Der Weg über `error.code` wäre präziser
und wird **begründet nicht genommen**: die Postfachstelle liest ohnehin die
*Spalte* aus der Meldung, und ein fehlendes `code` liesse eine Verletzung
ungefangen entkommen, während eine geänderte Meldung sofort einen roten Test
gäbe.

**Und dann fiel die Pflanzung ins Leere.** `isPicoUniqueConstraintViolation`
auf `false` gesetzt — **1.153 Prüfungen des Kerns blieben grün.** Vier Stellen
übersetzen eine Datenbankbedingung in eine benannte Ablehnung, und keine war
gegangen. Drei davon sind Rennfall-Auffangnetze hinter einer Vorabprüfung, also
schwer erreichbar. Die vierte hat **keine** Vorabprüfung: ihr eigener Kommentar
sagt, das Schema allein hält die Regel — und die Regel ist ADR 0150 PU5, die
verhindert, dass ein Home dasselbe Ereignis wieder und wieder auf das Gerät
einer Person schiebt. Der Batterieangriff, vom Home selbst ausgeführt. Drei
Tests halten sie jetzt auf dem laufenden Weg, samt Aufbewahrungsfrist, und die
Pflanzung trifft sie.

**Wobei ein Test von mir selbst zuerst etwas Falsches behauptete:**
`prunePicoLinkPushLedger` bekommt den *Stichtag*, nicht die Frist. Er ist jetzt
mit der Formel geschrieben, die `app.ts` benutzt, und prüft damit auch den
Ausdruck statt einen daneben.

**Der eigentliche Fund liegt eine Ebene höher.** Warum war das ungetestet? Weil
`recordPicoLinkPush` **zweimal** existierte: als Methode am Speicher, die das
Produkt ruft, und als reine Funktion über einem Array, die niemand ruft. Und
`check-capability-reach.mjs` sah das nicht, weil es nach `\bname\b` sucht —
ein `store.recordPicoLinkPush(...)` in `app.ts` liess die freie Funktion
erreicht aussehen. **Ein Name ist keine Regel (B124), eine Ebene über dem
Code.**

Der Prüfer wird dafür **nicht** verschärft, und das ist gemessen: von 455
exportierten Funktionen seines Geltungsbereichs ist dies der einzige Fall. Der
zweite Treffer war ein Fehlalarm meiner Sonde —
`platformKeystoreModule.createLinuxElectronPlatformSecretPort(...)` ist ein
echter Aufruf über einen Modul-Namensraum und sieht aus wie ein Methodenaufruf.
Eine Regel, die beide trennen soll, erzeugt Rauschen für einen Fund. Das tote
Hauptbuch ist stattdessen weg.

**B149 — Drei Ausnahmelisten sagten nicht, ob es ihren Gegenstand noch gibt
(2026-09-11).** Der Grundsatz steht seit Befund B115 im Baum: *eine Liste sagt,
was erlaubt ist — nie, ob es das noch gibt.* `check-capability-reach.mjs` hat
diese zweite Hälfte, und zwar erst, seit eine Pflanzung einen Namen aus dem
*Prüfer* statt aus dem Code entfernte und niemand es merkte. Am selben Tag hat
`check-vacuous-gates.mjs` mir dasselbe vorgeführt, als mein eigener neuer
Eintrag einen zusammengesetzten Schlüssel als Pfad ausgab.

Gemessen über die 63 Prüfer: **sechzehn** führen eine Ausnahmeliste, **zwölf**
halten sie gegen den Baum, **vier** nicht. Einer der vier war ein Fehlalarm
meiner Suche — `check-style-names.mjs` baut seine Menge, statt Ausnahmen zu
führen. Bleiben drei, und alle drei haben die Hälfte jetzt.

**Und einer fand auf seinem ersten Lauf sofort etwas** — dieselbe Art, in der
`check-fingerprint-display.mjs` seinerzeit seinen zweiten Eintrag fand.
`check-workflow-pinning.mjs` nahm `/.claude/settings.local.json` als begründete
Ausnahme, weil `.dockerignore` die Datei ohne führenden Schrägstrich führt. Nur
**normalisiert die Zeile zwei Stück darüber genau diesen Schrägstrich schon
weg**, greift also vorher — der Eintrag ist nie befragt worden. Er war von
Anfang an tot und las sich trotzdem wie ein Grund, den jemand geprüft hat. Das
Wissen darin stimmt und steht jetzt als Kommentar an der Zeile, die es
anwendet.

Die anderen beiden Listen decken noch etwas: die zwei ausgeschriebenen
Wire-Labels und die zwei Fingerabdruck-Ableitungen. Der Preis ist damit wieder
null, und drei Tore halten, was sie versprechen.

**B148 — Eine Regel namens Trennung trennte nur in eine Richtung
(2026-09-11).** Auf der Suche nach einem Schnitt für den blinden Fleck aus B145
fiel ein Paar auf, das zwei Ablehnungsnamen über eine Paketgrenze teilt, ohne
dass eine Datei die andere importiert: `apps/vault-daemon/src/daemon.ts` und
`packages/vault/src/index.ts`.

`assertVaultCustodyPathSeparation` prüft, ob der **Vault-Pfad in einer
Foundation-Ablage** liegt. Der Daemon ruft sie — und hängt danach eine eigene
Schleife an, die das Umgekehrte prüft: ob eine **Foundation-Ablage im
Vault-Verzeichnis** liegt. Der Titel seines Tests sagt die Regel dabei richtig:
*„refuses custody paths that overlap Foundation scopes **in either
direction**"*. Die Funktion, die den Namen „Trennung" trägt, kannte nur die
Hälfte.

**Erreichbar, und immer in dieselbe Richtung.** Drei Produktaufrufer: der
Daemon und **zweimal die CLI**. Nur der Daemon ergänzte die zweite Richtung.
Über sechs gemessene Aufstellungen urteilen die beiden **dreimal verschieden**,
und jedes Mal nimmt die CLI an, was der Daemon ablehnt. Ein Mensch konnte also
mit `keyfile create` eine Aufstellung anlegen, mit der der Daemon danach nicht
startet.

**Zwei Namen, weil es zwei Fälle sind.** Der Daemon warf für die Gegenrichtung
denselben Namen — und der sagt dort das Gegenteil dessen, was geschehen ist.
Sie heißt jetzt `foundation_path_inside_vault_scope`. Derselbe Grund, aus dem
`pico_supplier_identifier_is_not_an_address` neben `..._is_not_a_path` steht:
die Auskunft ist der Zweck des Namens. Gleichheit fällt unter den ersten Namen,
weil dann beide Richtungen wahr sind und eine Antwort es sein muss.

Der Helfer `isWithinOrEqual` im Daemon war danach tot und ist mitgegangen,
samt zweier Importe, die nur er brauchte.

**Der Schnitt, der es fand, und warum er taugt.** Nicht „Ablehnung in zwei
Dateien ohne Importbeziehung" — das sind 21 Paare und überwiegend geteiltes
Vokabular. Sondern: **zwei Dateien in verschiedenen Paketen teilen sich *zwei
oder mehr* Ablehnungen, und keine importiert das Modul der anderen.** Das sind
genau **drei** Paare. Zwei davon sind das Postfachbuch aus B145, das dritte war
dieser Befund. Eine Anzahl, kein Schwellenwert.

**Drei Schnitte davor haben nicht getaugt, und das steht hier, damit es
niemand ein zweites Mal versucht.** (1) „Modul, dessen Ausfuhren alle unerreicht
sind" — verfehlt das Postfachbuch, weil eine einzige Konstante erreicht ist;
meine eigene B145-Faltung hat es an diesem Rand sogar verschoben. (2) „Modul
überwiegend unerreicht" — der Anteil ist ein Schwellenwert, und ein
Schwellenwert ist Rauschen. (3) „Ein Typ, den das Produkt nicht nennt" — 247
von 494 Typen, und darunter `PicoSupplierManifest`, das `event-store.ts`
nachweislich benutzt, ohne den Namen je zu schreiben: **ein Typ wird
hergeleitet, nicht genannt.**

**Das Tor trägt den Schnitt jetzt, und damit ist der blinde Fleck aus B145
wenigstens benannt statt still.** `check-refusal-reasons.mjs` hat die
Querpaketfrage als dritte Regel über demselben Gegenstand; die Ausnahmeliste
hat **zwei** Einträge, und beide sind derselbe Befund aus zwei Richtungen: das
Postfachbuch gegen das Home und gegen den Companion. Sie sind keine Erlaubnis,
sondern halten die offene Entscheidung sichtbar — bleibt das Buch, oder geht
es? Die zweite Hälfte des Tores hält die Liste gegen den Baum: wird das Buch
eines Tages gefaltet oder gelöscht, sagt der Prüfer, dass die Einträge nichts
mehr beschreiben.

**Und zwei eigene Fehlmessungen auf dem Weg, beide aus demselben Grund.** Ein
Zeilenfenster von ±3 um einen Vergleich ließ mich zweimal fast einen Defekt
behaupten, den es nicht gab — die Untergrenze stand jeweils in der Zeile davor
oder hinter einem Rückgabeblock. Auf ein unscharfes Fenster gehört kein Tor.
Der Streifzug selbst ist ein sauberes Negativergebnis: über 31 Stellen, an
denen ein Zeitpunkt gegen ein Fensterende verglichen wird, fehlt **keine**
Untergrenze, wo eine hingehört.

**B147 — Prosa ist kein Gang, und drei Tore glaubten sie (2026-09-11).**
`check-refusal-reasons.mjs` trägt seinen eigenen Vorbehalt im Kopf: *„Sie
fragt, ob das Wort in irgendeiner `*.test.ts` vorkommt — nicht, ob ein Test es
**erwartet**. Ein Wort in einem Kommentar genügt ihr."* Nach zwei Befunden an
einem Tag, bei denen eine Regel keinen Test hatte (B145, B146), war das die
naheliegende nächste Frage.

**Die eine Hälfte des Vorbehalts ist geschlossen, die andere gemessen und
heute nicht ausgenutzt.** Von den 53 erklärten Ablehnungsgründen steht
**jeder** in einer echten Behauptung — keiner nur genannt, keiner nur in
Prosa. Die Verschärfung auf „steht in einer `expect`-Nähe" würde also nichts
fangen und wäre unscharf; sie bleibt ungeschrieben. Was geschlossen ist, ist
die Kommentarhälfte: der Prüfer las die Testdateien **mit** ihren Kommentaren,
ein *zitierter* Grund in Prosa galt also als gegangen.

**Und dieselbe Verwechslung stand bei den Geschwistern.**
`check-capability-reach.mjs` hat sie am 2026-08-24 an sich selbst gefunden —
sein eigener Kopfkommentar ließ eine Fähigkeit erreicht aussehen — und nennt in
demselben Kopf zwei Geschwister, die die Erreichbarkeitsfrage eine Ebene tiefer
stellen. **Keines von beiden hatte die Lehre:**

| Prüfer | Was er sucht | Warum Prosa das trifft |
|---|---|---|
| `check-store-writers.mjs` | `.name(` | Genau so schreibt ein Doc-Kommentar eine Methode |
| `check-link-reachability.mjs` | `'operation'` | Genau so zitieren die Kommentare dieses Baums eine Operation |
| `check-answer-reach.mjs` | `x.textContent =` | Dieselbe Klasse, unwahrscheinlichere Form |

Gemessen von 63 Prüfern lesen 55 fremden Text und suchen darin; **acht** zogen
Kommentare ab, 47 nicht. Die meisten der 47 fragen etwas, wo das gleichgültig
ist — ein verbotener Aufruf, eine Versionszahl. Gefährlich ist allein die
Erreichbarkeitsfrage, und die stellen genau diese drei.

**Der Preis ist null, gemessen statt vermutet.** Mit Kommentarabzug bleiben
alle 86 Schreibmethoden erreichbar, alle 55 Operationen und zwölf
Autoritätsressourcen benannt, alle 22 Antwortfelder geschrieben und alle 53
Gründe gegangen. Kein Fehlalarm, kein neuer Befund — die drei Tore halten
jetzt, was sie versprechen, statt mehr.

**Drei Pflanzungen, jede gegen beide Fassungen gefahren:** der einzige Aufruf
wird zu einem Satz *über* den Aufruf. Neue Fassung Ausgang 1, alte Fassung
Ausgang 0, zurückgesetzt Ausgang 0 — in allen drei Fällen.

Eine mißlungene Pflanzung ist auch eine Messung: die erste zielte bei
`check-link-reachability.mjs` auf `packages/protocol/src/index.ts`, und das
**deklariert** die Operationsliste, statt sie zu rufen. Beide Fassungen fielen,
mit einer anderen und richtigen Meldung — der Name war aus der Liste
verschwunden, und der Eintrag, der ihn ausnahm, sagte das sofort. Die zweite
Hälfte desselben Tores, die eine Bestandsliste gegen den Baum hält, hat dabei
ungeplant gebissen.

**B146 — Eine Regel, einmal geschrieben und nie gefahren (2026-09-11).** B145
hatte nebenbei gemessen, dass in `packages/*` genau **zwei** Ausfuhren nirgends
genannt werden. Eine davon war ein Befund.

`requireExactInteger` steht in `packages/appearance/src/validation-primitives.ts`,
nennt in seinem eigenen Typ die drei Codes, für die es die Funktion gibt —
`unsupported_profile_version`, `unsupported_envelope_version`,
`unsupported_compatibility_core_version` — und **nichts im ganzen Baum rief sie
auf**. Daneben stand dieselbe Prüfung **fünfmal von Hand**, in zwei Dateien,
die beide schon aus derselben Datei importieren; nur den Helfer, der genau
ihren Fall benennt, holten sie nicht.

Vier der fünf sind Zeile für Zeile der Helfer. Die fünfte lässt die
Ganzzahlprüfung weg: `1.5` bekommt dort `unsupported_profile_version` statt
`invalid_integer`. Die Annahme ist in allen fünf dieselbe — `!== 1` weist alles
ab, was nicht genau `1` ist —, verschieden war wieder nur der **Name**. Dieselbe
Lehre wie B145, ein Paket weiter.

**Keine der fünf hielt ein Test.** Die Pflanzung „jede Versionsnummer gilt"
ließ alle **122** Prüfungen des Pakets grün. Gehalten war nur der *Byteweg* im
Kodierer — der Weg, auf dem eine Zahl schon aus einem `Uint8Array` kommt —,
nicht der **Feldweg**, auf dem fremdes JSON hereinkommt. Also genau der Weg,
für den der Kommentar der Datei den strengen Stil begründet:
*„External appearance data is untrusted."* Drei Tests halten ihn jetzt, und
beide Pflanzungen treffen sie.

**Und daraus der Schnitt, der gemessen ist statt angenommen.**
`check-capability-reach.mjs` ließ `packages/*` seit dem 2026-08-24 mit dem
Argument aus, eine unerreichte Ausfuhr sei dort Modulhygiene — der dritte
ungemessene Geltungssatz derselben Datei, nachdem die ersten beiden am Tag
ihrer Messung falsch waren. Nachgemessen stimmt er **fast**: von 381
exportierten Funktionen haben 116 keinen Produktaufrufer, und für 115 stimmt
er. Ein Tor darüber verlangte 116 Argumente an einem Nachmittag — das
mechanische Füllen, vor dem B95 warnt. Der Prüfer hat deshalb einen zweiten,
engeren Durchgang bekommen: in `packages` fällt nur, was **gar nicht vorkommt**
— nicht im Produkt, nicht in einem Test, nicht in der eigenen Datei. Für so
etwas gibt es kein Argument, das eine Zeile lang wäre, also hat dieser
Durchgang auch keine Eintragsliste. Der Bestand ist leer, und leer ist hier die
richtige Zahl.

Die Gegenprobe ist der Beleg: nimmt man die Faltung zurück, nennt das Tor
`requireExactInteger` beim Namen.

**Was der Durchgang nicht fängt, steht benannt in seinem Kopf:** das
Postfachbuch aus B145 hat Tests, fällt hier also nicht auf. Wer den Fall sucht,
in dem ein Modul eine Regel *modelliert*, die das Produkt daneben selbst
durchsetzt, braucht eine andere Frage als „hat das einen Aufrufer".

**B145 — Eine geteilte Wahrheit schützt den Gang darüber nicht (2026-09-11).**
Die Namensliste war leer geworden, also habe ich die Frage gewechselt: nicht
„welcher Name steht zweimal", sondern **„welche Ablehnung steht zweimal"**.
Gemessen über `apps|packages|modules/*/src` ohne Tests: **1.002 verschiedene
Ablehnungsnamen, 39 davon in mehr als einer Datei.**

Der schärfste Haufen waren sieben Namen, die sich `supplier.ts` und
`depot-manifest.ts` teilten — im **selben Paket**. Die Wahrheiten waren längst
gefaltet: `depot-manifest.ts` holt Muster, Artenliste, Schlitzliste und
Obergrenze aus `supplier.ts`. Doppelt war der **Gang darüber**, acht Würfe in
derselben Reihenfolge.

**Ausgeführt urteilen beide Gänge gleich** — über jede Eingabe, die ich fand;
das Bezeichnermuster verbietet Punkt, Doppelpunkt und Schrägstrich ohnehin.
Verschieden war der **Name der Ablehnung**, und zwar genau in den zwei Fällen,
die `supplier.ts` eigens benannt hatte: eine Adresse und ein Pfad. Sein
Kommentar sagt, warum: *der Grund ist nicht „falsche Zeichen", sondern „das ist
keine Identität"*. Ein Depotmanifest schreibt ein **Dritter** — die Stelle mit
dem stärksten Grund, es zu sagen, war die, die es nicht sagte. Der bestehende
Test sagte den Befund selbst: sein Titel lautet *„refuses an unlisted slot and
an identifier that is an address"*, und er verlangte „ungültig".

**Fünf Faltungen, alle mit Pflanzung belegt:**

| Was | Wo es stand | Jetzt |
|---|---|---|
| Was ein Zulieferer über sich erklärt | `supplier.ts` + `depot-manifest.ts` | `assertPicoSupplierDeclaration` |
| Feldform einer Signatureingabe | `index.ts` + `recovery.ts` | `assertExactKeysWithoutFieldOrder` |
| Ein Gültigkeitsfenster geht vorwärts | `index.ts` + `recovery.ts` (zweimal) | `assertPicoValidityBounds` |
| Was ein Home anstoßen darf | `link-push-floor.ts` + `event-store.ts` | `assertPicoLinkPushOccasion` |
| Der Peer-Fingerabdruck | `link-mailbox.ts` + `link-mailbox-exchange.ts` | `assertPicoLinkPeerFingerprint` |

**Zwei Regeln hielt kein einziger Test, und beide Male stand es auf dem
gefährlicheren Weg.** Die eigens benannte Obergrenze
`pico_supplier_coverage_too_large` war nirgends geprüft. Und auf dem Weg, auf
dem eine Karte eine Wurzel zurückbringt, hielt weder das `fieldOrder`-Verbot
noch das Gültigkeitsfenster ein Test: beide Pflanzungen ließen 660 Prüfungen
grün und trafen nur das Barrel. Beide Wege haben jetzt ihren.

**Der Gültigkeitsvergleich ist B50 noch einmal.** Das Barrel verglich
Zeichenketten, `recovery.ts` `Date.parse` — über 55 kanonische Paare urteilen
beide gleich, aber *nur weil* ein kanonischer Instant feste Breite hat, in UTC
steht und drei Nachkommastellen trägt. Ein Satz, dessen Richtigkeit an einer
Form hängt, steht jetzt neben der Form.

**Das Tor, und warum es je Paket schneidet.** Der naheliegende Schnitt wäre
„zwei Dateien ohne Importbeziehung". Nachgemessen fängt der genau *nicht*: ein
doppelt geschriebener Gang **hat** die Importbeziehung, weil er die geteilte
Konstante holt und dann selbst darüber läuft — er hätte B145 durchgelassen. Von
34 mehrfach stehenden Namen liegen 10 in einer Paketgrenze; fünf waren eine
Regel mit zwei Gängen, vier sind als **zwei verschiedene Fragen unter einem
Wort** eingetragen und begründet. `check-refusal-reasons.mjs` trägt die Regel
als zweite Frage über denselben Gegenstand, mit der Gegenprobe: ein Eintrag,
den der Baum nicht mehr trägt, schlägt ebenso an.

**Was die Messung sonst noch ergab, damit es niemand ein zweites Mal misst.**
Von 252 Ausfuhren in `packages/*` ohne Aufrufer außerhalb ihrer Datei sind
**182 paketintern in Ordnung**, 68 fahren nur ihre eigenen Tests, und **zwei**
werden nirgends genannt (`requireExactInteger`, `picoModuleCaptureDefault`).
`packages/protocol/src/link-mailbox.ts` ist der Grenzfall: von zwölf Ausfuhren
erreicht **eine** das Produkt. Das Buch mit seinen drei Ablehnungen, die sein
Kommentar *„the security of this whole design"* nennt, hat keinen Aufrufer —
das Home setzt alle drei im SQLite-Schema durch, mit Primärschlüssel und zwei
`UNIQUE`, und bildet die Verletzungen auf **dieselben Fehlernamen** ab.
Nachgemessen: kein Widerspruch. Aber nichts hält sie in Schritt, und
`apps/companion/src/link-mailbox.ts` schickt den Leser ausdrücklich dorthin
(*„The Home's side is the book"*). Das bleibt als Beobachtung stehen und ist
keine Faltung: die SQLite-Fassung ist die stärkere, und sie durch eine
Speicherfassung zu ersetzen wäre ein Rückschritt.

Und `check-capability-reach.mjs` hat seinen dritten ungemessenen
Geltungssatz — *„`packages/*` stay out: there an unreached export is module
hygiene"*. Für die 68 stimmt er. Für das Postfachbuch nicht.

**B144 — Die durchgesetzte Regel wird die ausgesprochene (2026-09-11,
Entscheidung E12).** Auf B143 hin hat der Nutzer entschieden: **die
Zeichenmenge des Schlüsselspeichers ist die Regel.** Der Grund ist kein
Geschmack — ein Domänenname *wird* ein Schlüsseldateiname (ADR 0072), also ist
das Dateisystem, was ihn begrenzt, und diese Regel war die einzige, die das
Produkt je angewandt hat.

Was das weitet, steht namentlich: `my-domain`, `Domain`, `_leading` und `a__b`
sind jetzt gültige Namen. Was es verengt: ein Name über 128 Zeichen ist keiner,
und ein Punkt war beim Schlüsselspeicher nie erlaubt, obwohl
`model-context-ref.ts` einen zuliess — und **dieser Parser hat einen
Produktaufrufer**, anders als die drei, an denen B143 hing.

Vier Fundorte sind jetzt einer. Der vierte war der, den B143 noch nicht gesehen
hatte: der Schlüsselspeicher selbst, die Heimat dieser Zeichenmenge. Auch sein
Dateimuster `domain_….vN.key` ist aus der Regel zusammengesetzt statt sie ein
zweites Mal zu schreiben — und dabei kam die Grenze mit: es stand dort `+` und
beim Schreiben eine Grenze von 128, der Leser beschrieb also einen Namen, den
der Schreiber nie erzeugt hätte.

**Ein Rest ist benannt und nicht neu:** `Domain` und `domain` sind zwei
Domänen und auf einem Dateisystem ohne Groß-Klein-Unterscheidung eine Datei —
also zwei Domänen mit einem Schlüssel. Alles, was dieses Repository ausliefert,
läuft auf Linux; ein Port auf einen anderen Wirt muss das vorher klären, und
jetzt steht der Satz dafür im Baum.

Das fünfte Formtor hält die Zeichenmenge. Beim ersten Wurf meldete es die
beiden **Ablehnungssätze**, die einem Menschen erklären, welche Zeichen erlaubt
sind — ein Satz ist keine zweite Regel. Es verlangt jetzt, dass die Zeichenmenge
in einem Muster steht. Dasselbe Rauschen wie beim Tokenmuster einen Befund
zuvor, und dasselbe Mittel.

**B143 — Drei Namen für einen Begriff, und eine Regel, die niemand fährt
(2026-09-11).** Die Musterzählung zeigte `/^[a-z0-9]+(?:_[a-z0-9]+)*$/` in vier
Protokolldateien. Drei davon sind **exportierte Konstanten mit verschiedenen
Namen über demselben Begriff**: `picoSupplierDomainPattern`,
`picoRulesDomainPattern`, `picoApprovalDomainPattern` — und alle drei bewachen
dasselbe Feld, `privacyDomain`. Das ist die Umkehrung von B140: dort bewachte
eine Form vier Begriffe, hier tragen drei Namen einen.

**Und der Baum ist sich über diesen Begriff nicht einig.** Vier Regeln messen
dasselbe Feld, und über zwölf Namen gemessen beurteilen sie **sieben
verschieden**:

| Name | Protokoll | `model-context-ref` | Schlüsselspeicher |
|---|---|---|---|
| `household` | ja | ja | ja |
| `my.domain` | nein | ja | nein |
| `my-domain` | **nein** | ja | **ja** |
| `Domain` | **nein** | nein | **ja** |
| `1domain` | ja | **nein** | ja |

Die folgenreiche Richtung ist die letzte Spalte: der Schreibweg eines
verschlüsselten Items nimmt `my-domain` und `Domain` an, weil der Name dort ein
**Schlüsseldateiname** wird (ADR 0072), und die Protokollregel weist beide ab.
Eine Domäne, die ein Weg nicht benennen kann, ist Inhalt, über den dieser Weg
nicht sprechen kann.

**Was das heute vor einem Vorfall bewahrt, gemessen statt vermutet:** die
Parser, die diese Regel bewacht — `parsePicoRulesInput`,
`buildPicoApprovalStatement`, der Supplier-Parser — haben **keinen Aufrufer im
Produkt**. Nur ihre eigenen Tests fahren sie. Was das Produkt wirklich anwendet,
ist `typeof value === 'string'` mit nicht-leerem Trim auf den Link-Operationen,
plus die Zeichenmenge des Schlüsselspeichers dort, wo ein verschlüsseltes Item
geschrieben wird.

**Eine ausgesprochene Regel, die niemand durchsetzt, neben einer durchgesetzten,
die niemand ausspricht.** Und sie sitzt im blinden Fleck des Fähigkeitsprüfers:
`check-capability-reach.mjs` lässt `packages/*` ausdrücklich aus, mit dem
Argument, Bibliotheken würden von anderen Paketen gerufen. Für diese drei
stimmt das nicht.

Die drei Kopien sind jetzt eine, in `packages/protocol/src/privacy-domain.ts`,
und der Widerspruch steht im Kopf dieser Datei und als Test. **Welche der vier
Regeln *die* Regel ist, ist eine Produktentscheidung und keine
Aufräumarbeit** — sie zu treffen heisst entweder Domänennamen abzulehnen, die
jemand schon hat, oder zu weiten, wie eine Schlüsseldatei heissen darf. Sie
liegt als E12 im Brief.

**B142 — Eine Regel, drei Schreibweisen, und zwei echte Löcher darunter
(2026-09-11).** Nach B140 blieb `/^[0-9a-f]+$/` in fünf Dateien stehen, und
`canonicalHexPattern` ist genau das und **exportiert**. Nachgemessen war es
mehr: „nicht leer, gerade Länge, Kleinbuchstaben-Hex" stand siebenmal in drei
Schreibweisen — dreimal als `isCanonicalHex` mit ausgeschriebener
Längenbedingung, dreimal als `/^(?:[0-9a-f]{2})+$/`, einmal als blankes
Zeichenmuster mit einer Längenzahl daneben. Über zehn Eingaben ausgeführt sind
alle drei gleichwertig.

**Die gerade Länge ist die Hälfte, die man vergisst.** Null ist durch zwei
teilbar, also lässt eine Bedingung mit nur `% 2 === 0` die leere Zeichenkette
durch — und leere Bytes sind kein leerer Schlüssel. Zwei der drei schrieben
`length > 0` daneben, eine `length >= 2`.

**Zwei Löcher kamen dabei heraus, beide von der Zeichenmengenregel gefunden,
nicht von der Namensliste.**

Das erste: der Prüfer des Beanspruchungsumschlags las
`/^[0-9a-f]{1,16384}$/` — **ohne gerade Länge**. Ein Hexwert ungerader Länge
sind keine Bytes, und er kam bis zum Entsiegeln durch, wo er mit einer Meldung
über *Schlüsselmaterial* fiel statt über den Umschlag. Fail-closed, aber an der
falschen Stelle und mit der falschen Auskunft.

Das zweite: im Protokoll stand ein **neunter `hexToBytes` unter anderem
Namen** — `picoHexToBytes` im Transportcodec, den die Zählung von B138 nicht
sah. Er benutzt `[0-9a-f]*` statt `+`, nimmt also die leere Zeichenkette an und
gibt null Bytes zurück. Sein einziger Aufrufer kodiert Fingerabdrücke und
öffentliche Schlüssel in einen Anmeldecode; keines davon darf leer sein. Der
Code wäre mit einem leeren Fingerabdruck gebaut worden und erst bei der
Prüfung gefallen. Das `*` war ein `+`, das jemand nicht geschrieben hat.

Elf Stellen sind gefaltet. Was bleibt, steht benannt: `packages/appearance`
ohne Abhängigkeit, und eine Farbe `#rrggbb` im PDF-Schreiber — dieselben
Zeichen, ein anderer Begriff, denn dort ist Hex eine Schreibweise für drei
Kanäle und Großbuchstaben sind erlaubt. Das Git-Commit-Muster ist aus der einen
Form zusammengesetzt statt zweimal hingeschrieben; seine Aussage ist, dass
*beide Längen* gelten, nicht dass es Hex ist.

**Das Tor ist von einer Längenregel zu einer Zeichenmengenregel geworden.** Wer
`[0-9a-f]` in ein Muster schreibt, schreibt eine Hexregel, gleich in welcher
Gestalt — und genau die sieben Stellen, die die Längenregel nicht sah, kamen so
heraus.

**B141 — Eine Prüfung, die `undefined` bestand (2026-09-11).** Beim Falten der
Tokenmuster — 21 Stellen der kanonischen Zeichenmenge mit einer Längengrenze —
kam ein echter Fehler heraus, und er ist der ernsteste dieser Serie.

`isAsciiReference` stand dreimal im Baum in zwei Fassungen, und **zwei davon
prüften nicht, ob der Wert überhaupt eine Zeichenkette ist.** Sie riefen
`muster.test(wert)`, und `RegExp.test` wandelt sein Argument in eine
Zeichenkette um: aus `undefined` wird `"undefined"`, aus `null` `"null"`, aus
`42` `"42"` — alles Zeichen, die die Menge erlaubt. Gemessen, nicht gelesen:
**`undefined`, `null`, `42` und `true` bestehen die Prüfung.**

Wo das zählt: `isAsciiReference` prüft `sourceRef`, `homeId` und
`delegationId` eines Frischeprüfpunkts, und `sourceRef` kommt über die
Transportnaht aus ADR 0089 herein — *„HTTP, Pico Link or another sync
mechanism may implement this lookup"*. Der Parser davor prüft die äussere
Hülle und lässt das innere `checkpoint`-Objekt ungeprüft; diese Zeile war die
einzige Prüfung des Feldes. Die Nachbarn in derselben Bedingung —
`isHexOfBytes`, `isPicoLifecycleOrder`, `isPicoInstant` — prüfen alle `typeof`.

Was dabei herauskommt, ist kein Umgehen einer Vollmacht: der Prüfpunkt selbst
ist wurzelsigniert und wird verifiziert. Es ist ein Prüfpunkt, der mit einer
**unbrauchbaren Herkunftsangabe** angenommen und aufgezeichnet wird, und ein
Feld, das ein begrenztes ASCII-Token sein sollte und `undefined` ist.

**Und dieselben zwei liessen das `+` aus der Zeichenmenge weg.** Strenger als
die Regel, also schliesst es zu; aber es ist eine Uneinigkeit darüber, was ein
Token ist, und die hatte niemand gewählt.

21 Stellen sind gefaltet: elf mit der Grenze 1024, sieben mit 256, dazu die
drei Wrapper. `isAsciiToken(wert, maxBytes)` misst **Bytes**, so wie
`assertAsciiToken` daneben — beide Zahlen sind nur dieselbe, solange die Menge
ASCII bleibt, und das steht jetzt als Test. Die Zusicherung ruft das Prädikat
absichtlich *nicht*: sie unterscheidet drei Ablehnungen, weil ihre Vektoren das
tun.

**Zwei Namen sind dabei getrennt worden**, nicht zusammengelegt: der
Betreiberspeicher hatte ein eigenes `isAsciiToken` über der Menge *jedes
druckbaren ASCII-Zeichens* — eine andere Regel unter demselben Namen. Sie
heisst jetzt `isPrintableAsciiToken`.

Und das Tor, das die Form hält, war beim ersten Wurf zu weit: es meldete
`[A-Za-z0-9_.:-]` und `[A-Za-z0-9_-]` mit, zwei andere Zeichenmengen. Genau das
Rauschen, das Befund B112 an einer mechanischen Regel schon einmal gemessen
hat — verengt, bevor es stand.

**Eine Stelle darf die Regel behalten, und ein anderes Tor hat das durchgesetzt.**
`apps/companion-shell/src/contract.ts` erreicht den Browser, und dort löst ein
blanker Spezifizierer nicht auf; `browser:check` hat meinen Import sofort
gemeldet. Die Datei erklärt die Regel jetzt selbst — mit `typeof`, also ohne
die Lücke — und ein Test hält sie über neunzehn Eingaben gegen
`isAsciiToken`. Dieselbe Bindung, die dort schon die Bodenfamilienliste hält.
Nicht-ASCII steht ausdrücklich in der Testliste, weil die örtliche Fassung
Zeichen zählt und die im Protokoll Bytes.

**B140 — Dreiundfünfzig Stellen, eine Form, vier Begriffe (2026-09-11).** Die
Messung aus B139 hatte den Spitzenreiter genannt: `/^[0-9a-f]{64}$/` in 26
Dateien. Vollständig gezählt sind es **53 Stellen** über vier Bytelängen —
31 für zweiunddreissig Bytes, 16 für vierundsechzig, 5 für sechzehn, eine für
zwanzig. Der Namenszähler sah davon fast nichts, weil die meisten mitten in
einer Bedingung stehen und gar keinen Namen tragen.

**Gefaltet ist die Form, nicht der Begriff — und das ist die ganze Sorgfalt
dieses Befundes.** Dieselben vierundsechzig Zeichen bewachen im Baum
Schlüsselfingerabdrücke, öffentliche Schlüssel, Digests und einen Zweig der
Git-Commit-Form; in `apps/companion/src/founding.ts` standen
`fingerprintPattern` und `publicKeyPattern` byte-gleich untereinander.
Dieselben zweiunddreissig bewachen eine Postfachadresse, einen Pakettag, ein
Betreiberkreditiv und ein Relaiskonto — vier exportierte Konstanten, vier
Begriffe, die nicht austauschbar sein dürfen. Sie zusammenzuziehen wäre die
Umkehrung von B124: **eine Form ist kein Begriff.**

Jeder behält Namen, Typ und Export. Was er holt, ist `isHexOfBytes(wert,
bytes)` für die 36 Stellen, die ein Prädikat wollten, und
`hexOfBytesPattern(bytes)` für die zwölf, die ein `RegExp` exportieren oder
weiterreichen. Die zweite gibt es nur deshalb: ein exportiertes Muster zu einem
Prädikat zu machen hätte die Paketoberfläche geändert, und das ist eine andere
Entscheidung als diese.

Eine Stelle bleibt und steht benannt in der Ausnahmeliste:
`packages/appearance` hat als einziges Paket dieses Baums **überhaupt keine
Abhängigkeit**, und eine für ein Muster anzulegen wäre eine Änderung an der
Paketgrenze — dieselbe Begründung wie beim `hexToBytes` derselben Wurzel in
B138. Der Prüfer fällt, wenn diese Datei verschwindet: eine Ausnahme für etwas,
das es nicht mehr gibt, beschreibt einen Baum, den es nicht gibt.

Zwei Pflanzungen, beide rot. Und zwei eigene Fehler auf dem Weg, beide vom Bau
gefangen: mein Ersetzungsskript nahm bei zwei mehrzeiligen Aufrufen das
Schlusskomma mit, und ein Importschritt hängte `canonical-bytes.ts` einen
Import auf sich selbst an. Der dritte fiel erst später auf — ein Skript brach
vor dem Speichern ab, sodass der Regelblock nie geschrieben wurde und nur der
Schlusssatz auf ihn zeigte. Ein `ReferenceError` beim nächsten Lauf sagte es.

**B139 — Die Namensliste sieht die Hälfte nicht, und die andere Hälfte ist
gefährlicher (2026-09-11, Messung ohne Änderung).** Vier Befunde hintereinander
haben mehr Stellen gefunden, als der Namenszähler sah — zwanzig statt vier bei
der Lebenslaufordnung, acht statt vier bei `hexToBytes`. Der Grund ist immer
derselbe: eine Regel ohne Namen zählt er nicht. Also ist die Liste diesmal
zweimal gemessen worden.

**Die Namen:** 1.595 Funktionsnamen im Produktcode, 60 stehen mehr als einmal,
**46** über verschiedenen Rümpfen (48 vor B137 und B138). Die Spitze ist flach
geworden — `assertFingerprint` mit 4 Fassungen über 3 Rümpfen ist der grösste
verbliebene Posten, danach lauter Dreier.

**Und das, was der Namenszähler nicht sieht:** 60 verankerte Muster
(`/^…$/`) stehen im Produktcode, **20 davon in mehr als einer Datei**. Der
Spitzenreiter ist keine Randnotiz:

| Muster | Dateien | Was es meint |
|---|---|---|
| `/^[0-9a-f]{64}$/` | **26** | zweiunddreissig Bytes als Hex |
| `/^[A-Za-z0-9._:/+-]{1,1024}$/` | 9 | kanonisches Token mit Längengrenze |
| `/^[0-9a-f]{128}$/` | 7 | vierundsechzig Bytes als Hex |
| `/^[0-9a-f]+$/` | 5 | Hex überhaupt |
| `/^[A-Za-z0-9._:/+-]{1,256}$/` | 5 | dasselbe Token, andere Grenze |

**Zwei davon sind schlichte Kopien einer exportierten Konstante:**
`canonicalHexPattern` ist `/^[0-9a-f]+$/` und steht in `canonical-bytes.ts`,
und trotzdem steht dasselbe Muster in vier weiteren Dateien von Hand. Bei den
Tokenmustern ist es subtiler: die exportierte Konstante trägt **keine**
Längengrenze — die prüft `assertAsciiToken` daneben —, die neun inline
geschriebenen verschmelzen beides. Das ist keine Kopie, das ist eine zweite
Regel, die aussieht wie die erste.

**Aber die 26 sind eine Falle, und deshalb steht hier eine Warnung statt einer
Empfehlung zum Falten.** Dieselbe Form bewacht mindestens vier verschiedene
Begriffe: Schlüssel-*Fingerabdrücke*, *öffentliche Schlüssel* (in
`apps/companion/src/founding.ts` stehen `fingerprintPattern` und
`publicKeyPattern` direkt untereinander, byte-gleich), *Digests*
(`claimDigestHex`, `previousDigestHex`, `contentHashPattern`) und in
`library-pin.ts` einen Zweig der Git-Commit-Form. Nach Form zu falten hiesse,
vier Begriffe unter eine Regel zu ziehen — genau die Umkehrung von B124.
**Eine Form ist kein Begriff.**

Was stattdessen trägt: die *syntaktische* Tatsache „so viele Bytes als
Kleinbuchstaben-Hex" einmal schreiben, und jeder Begriff behält seinen Namen
und seine Ablehnung darauf — dieselbe Gestalt wie `assertPicoInstant(wert,
grund)`. Die Dekodierseite gibt es schon: `fixedHexBytes(wert, bytes, grund)`
in `canonical-bytes.ts`. Was fehlt, ist das Prädikat daneben.

Nichts davon ist in diesem Befund geändert worden; er ist eine Messung, damit
die nächste Sitzung sie nicht wiederholt.

**B138 — Eine Entscheidung von B125, nachgemessen und umgekehrt (2026-09-11).**
`hexToBytes` stand achtmal im Baum über sieben Rümpfen. Befund B125 hat sie
angesehen und **stehen gelassen**, mit dem Grund *„die sieben sind wirklich
verschieden, und zwar in der Prüfung"*. Ausgeführt über neun Eingaben stimmt
das nicht:

**Die drei prüfenden Fassungen urteilen über jede der neun Eingaben gleich** —
leer, ungerade Länge, Großbuchstaben, gemischt, Nicht-Hex, halber Müll,
Leerzeichen innen, `0x`-Präfix. Sie unterscheiden sich im *Namen* der
Ablehnung, und dafür gibt es einen Parameter. Das ist dieselbe Gestalt, die
B126 beim Zeitpunkt und B136 bei den Schlüsselmengen gefunden hat: verschieden
im Namen, gleich im Urteil.

**Die fünf ungeprüften unterscheiden sich dagegen wirklich — voneinander.**
`Buffer.from(h, 'hex')` schneidet still ab (`'abc'` gibt ein Byte), nimmt
Großbuchstaben an und gibt für `'zzzz'` nichts zurück. Die von Hand
geschriebene Paarschleife macht aus demselben `'zzzz'` **zwei Nullbytes**, aus
`'aa bb'` die Bytes 170 und 11, und aus `'0xaabb'` drei Bytes. Zwei Wege unter
einem Namen, die aus derselben kaputten Eingabe verschiedene Antworten bauen,
und keiner von beiden meldet etwas.

**Was B125 richtig hatte:** beide Kopien auf dem Recovery-Card-Weg sind vom
Aufrufer gedeckt. Nachgesehen, diesmal an *beiden* — B125 nannte nur eine:
`assertPicoRecoveryCard` prüft das Muster und vergleicht den Hexwert gegen die
Kanonisierung der Nutzlast, bevor er umgewandelt wird.

Gefaltet sind sieben der acht. Die achte bleibt mit Grund, und der Grund ist
ein anderer als bei B125: `packages/appearance` hat als einziges Paket dieses
Baums **überhaupt keine Abhängigkeit**, und eine für eine Testvorrichtung
anzulegen wäre eine Änderung an der Paketgrenze. Sie steht namentlich in der
Bestandsliste von `canonical:check`, das jetzt elf Regeln hält.

**Und das Tor hat meinen eigenen Griff gefangen.** `home-setup.ts` braucht
einen eigenen Ablehnungssatz, weil dort ein Betreiber die Meldung liest und
`invalid_hex` ihm nicht sagt, welches Material gemeint war. Ich habe die
örtliche Vorgabe zuerst wieder `hexToBytes` genannt, und `canonical:check` hat
das gemeldet. Sie heisst jetzt `hostKeyHexToBytes` — ein Name ist keine Regel
(B124), und wer denselben Namen ein zweites Mal vergibt, verdeckt genau die
Frage, die der Prüfer stellt.

**B137 — Ein Format, zwanzigmal geschrieben, und die Hälfte davon baut es
(2026-09-11).** Der Namenszähler meldete `assertLifecycleOrder` mit vier
Fassungen über vier Rümpfen. Nachgemessen ist es viel mehr: **was eine
Lebenslaufordnung ist, steht zwanzigmal im Baum.**

Zehnmal die Form, die eine *zulässt* — viermal als `lifecycleOrderPattern` in
drei Schreibweisen (mit Fanggruppe, ohne, mit `/u`), sechsmal als Literal. Und
zehnmal der Ausdruck, der eine *baut*: `seq:` mit einem `padStart(16, '0')`
daneben. Zwei Hälften eines Formats, an zwanzig Orten getrennt gehalten — und
die zweite ist die, die jemand vergisst. Genau wie `padStart(2, '0')` beim Hex
in B125, und mit derselben Folge: eine Ordnung ohne Auffüllung bleibt
`seq:`-präfigiert und wird nur kürzer, und **jeder Vergleich darauf ist ein
Zeichenkettenvergleich.** Eine kürzere sortiert unter alles, eine längere nach
ihrem ersten Zeichen.

Der Namenszähler konnte das nicht sehen: sechzehn der zwanzig Stellen heissen
anders oder gar nichts. Ein Name ist kein Gegenstand.

**Drei echte Unterschiede zwischen den Fassungen, jeder gemessen.**

Erstens: eine von drei `nextLifecycleOrder` las `match === null ? 1 : …` und
begann die Folge bei einem missgebildeten Vorgänger stillschweigend neu bei
eins — und eins ist der Wert, der unter jedem bereits geschriebenen Datensatz
sortiert. Nachgesehen, bevor daraus ein Alarm wurde: der Wert kommt aus einer
gespeicherten Kette, deren Einträge beim Hineinschreiben geprüft wurden, also
erreichte ihn nichts. Ein Rückfall, den niemand erreicht, ist trotzdem einer,
den später jemand erreicht, und dieser hatte keine Begründung neben sich.

Zweitens: dieselbe Fassung rechnete mit `Number.parseInt`. Sechzehn Ziffern
lassen 9.999.999.999.999.999 zu, `Number.MAX_SAFE_INTEGER` endet bei
9.007.199.254.740.991. Ausgeführt: `Number.parseInt('9999999999999999')`
kommt als `10000000000000000` zurück — andere Ziffern. Für jede Ordnung, die
dieser Baum heute schreibt, exakt; für das obere Ende des Formats still
falsch. Die Regel rechnet jetzt mit `bigint`.

Drittens: eine stellte `assertAsciiToken` davor, dieselbe Gestalt wie in B126.
Gemessen lehnt der Vorlauf nichts ab, was die Ordnung nicht selbst ablehnt; er
tauscht nur den spezifischen Namen gegen einen allgemeinen.

`packages/protocol/src/lifecycle-order.ts` trägt jetzt beide Hälften: das
Muster, das Prädikat, die Ablehnung, die Folge als `bigint` und den Bau mit
seiner Erschöpfungsgrenze. Eine siebzehnte Ziffer ist eine Ablehnung und keine
Rundung, denn sie sortiert gegen ihre sechzehnstelligen Nachbarn nach ihrem
ersten Zeichen.

Gehalten wird es von einer **Formregel** in `canonical:check` statt von einer
Namensliste — der Name war ja das, was die Zählung sah. Sie liest 259 Quellen
und meldet, wenn eine von ihnen das Muster oder den Bau von Hand hinschreibt;
und sie fällt, wenn die Heimatdatei verschwindet, weil null Fundstellen dann
etwas ganz anderes hiessen. Drei Pflanzungen, drei rot.

Und ein viertes Netz hat ungefragt gesprochen: die Regel aus Befund B119 —
jeder Pfad, den ein Prüfer nennt, ist eine verfolgte Datei — meldete die neue
Heimatdatei, weil ich sie noch nicht zu git hinzugefügt hatte. Genau dafür ist
sie da, und es ist das zweite Mal in dieser Sitzung, dass sie mich erwischt.

**B136 — Acht Fassungen, und die Regel stand eine Datei weiter schon
exportiert (2026-09-11).** `hasExactKeys` — „trägt dieser Datensatz genau diese
Felder" — stand achtmal im Baum über vier Rümpfen. Gemessen wurde nicht
gelesen: alle vier über dreizehn Eingaben ausgeführt, darunter die Ränder, die
ein Leser überspringt.

**Sieben der acht sind eine Regel in drei Schreibweisen.** Längenvergleich mit
`includes`, Sortieren und elementweise vergleichen, und dasselbe noch einmal mit
anderen Variablennamen — über alle dreizehn Eingaben identisch. Und die Regel
stand längst in `packages/protocol/src/canonical-bytes.ts`: `assertExactKeys`
ist genau dieser Rumpf mit einem Wurf statt einem `false`. Acht Kopien einer
Funktion, die eine Datei weiter exportiert war.

**Die achte war schwächer, und zwar unsichtbar.** Sie fragte „jeder erwartete
Schlüssel ist `in` dem Datensatz" statt „die Schlüsselmengen sind gleich". `in`
fragt die Prototypkette mit, also galt ein Feld als vorhanden, wenn sein Name
auf `Object.prototype` lebt: ein leerer Datensatz bestand die Prüfung gegen
`['toString']`, und `{ a: 1 }` bestand sie gegen `['a', 'constructor']`. Zwölf
solche Namen gibt es, darunter `valueOf`, `hasOwnProperty` und `__proto__`.

Gemessen statt vermutet, bevor daraus ein Alarm wurde: **keiner der
dreiundzwanzig Aufrufer** in dieser Datei nennt einen davon. Es war eine
schlummernde Schwäche und kein lebender Fehler — und die Namen, um die es geht,
sind genau die, die jemand in eine Nutzlast schreibt, der etwas versucht.
Dieselbe Fassung duldete außerdem eine Erwartungsliste, die einen Namen zweimal
nennt; die anderen sieben weisen sie ab.

**Die Faltung ist strukturell und nicht bloß nebeneinander:** `assertExactKeys`
ruft jetzt `hasExactKeys` und wirft, wenn es `false` sagt. Bis hierher stand die
Regel in beiden ausgeschrieben, also konnten sie auseinanderlaufen; jetzt nicht
mehr. `canonical:check` hält zehn Regeln statt neun.

Zwei Pflanzungen, beide punktgenau: die alte schwächere Regel zurück lässt drei
Tests fallen, eine lokale Fassung zurück lässt das Tor fallen. Damit stehen
noch **48** Namen über verschiedenen Rümpfen; der nächste Spitzenreiter ist
`hexToBytes` mit sieben Fassungen über sechs Regeln, und der ist in B125
nachgesehen und mit Grund geblieben — die Prüfungen unterscheiden sich
wirklich. Danach kommt `assertLifecycleOrder` mit vier über vier.

**B135 — Der Trust-Root lag ausserhalb des Baums (2026-09-10, Paket P2 des
externen Reviews).** Die Kette kann sich weigern, eine Version zweimal zu
veröffentlichen, ein angehängtes Artefakt zu ersetzen und einen Tag anzunehmen,
der der Version widerspricht — drei Prüfer tun genau das. **Nichts davon
übersteht einen direkten Push auf `main` oder einen verschobenen Tag**, denn ein
Workflow läuft danach, und ein Force-Push schreibt das Danach um. ADR 0122 Y4
sagt es über sich selbst: *„does not make a tag immutable — nothing here can."*

Der Nutzer hat es am 2026-09-10 auf der Forge gesetzt: `main` verlangt einen
Pull Request und die sieben Checks, die auf einem Pull Request überhaupt
laufen; Force-Push und Löschen sind verboten; Tags `v*` lassen sich weder
löschen noch verschieben.

**Eine Falle, die vorher benannt wurde statt hinterher:** `Publish the Pico
Client package` läuft nur auf einem Tag. Als Pflicht-Check gesetzt hätte er
jeden Pull Request auf einen Auftrag warten lassen, der nie startet — eine
Sperre, die aussieht wie Sorgfalt.

Aufgeschrieben ist es in `docs/release/upgrade-contract.md`, weil eine
Forge-Einstellung keine Spur in einem Commit hinterlässt: wer sie abschaltet,
tut das lautlos, und nur ein Satz im Baum sagt jemandem, dass sie da sein
sollte. Damit ist das letzte der neun Pakete vor dem Release geschlossen.

**B134 — Sieben Dokumente, gegen den Code gehalten (2026-09-10, Paket P5 des
externen Reviews).** Das breiteste Paket der Runde: jede geänderte Aussage
gegen die Zeile Code geprüft, gegen die sie steht.

**Zwei von drei Reifegradzahlen in der README waren falsch.** Sie sagte *„Of
155 architecture decisions, 36 are implemented and 86 partially"*; gezählt sind
es **157** Entscheidungen und **87** teilweise umgesetzte, und nur die 36
stimmten. Keine Abweichung ist groß, und genau das ist der Punkt: eine Zahl von
Hand driftet leise, und die README ist das Erste, was jemand liest. Sie kommt
jetzt aus der Statusmatrix, gehalten von `docs:check`, das die Matrix ohnehin
liest. Verschwindet der Satz, fällt der Lauf — ein Tor, das eine Angabe
bewacht, die niemand mehr macht, bewacht nichts und sagt es nicht.

**`ReadmeTech.md` beschrieb Gebautes als geplant.** Das Diagramm führte Pico
Rules und den Action Runner als *planned*, während ADR 0140 RL1-RL6 als
umgesetzt gilt, `packages/protocol/src/pico-rules.ts` die Entscheidung trifft
und `apps/core/src/action-path.ts` sie trennt in entscheiden und ausführen. Die
Action History stand als *planned* und ist der Ereignistyp
`pico_rules.decision_created`. Und Pico Link hiess *„the future
transport-neutral communication layer"*, während der direkte Eingang, das
Relay und 55 geschlossene Operationen im Baum stehen. Was wirklich noch fehlt,
steht jetzt dort: die Fassade und ein veröffentlichter Wire-Vertrag.

**`SECURITY.md` nannte eine Netzfläche, und es sind sechs.** Der Satz *„The
only surface designed for network publication is the Pico Link intake"* stimmte
vor dem Relay. Gemessen und als Tabelle aufgenommen: der Link-Eingang (nur
gebunden, wenn eine Bereitstellung Host und Port setzt), der Mailbox-Port des
Relays (der einzige, der von einem Router weitergeleitet werden darf), sein
Gesundheits- und sein Betreiberport (beide Loopback), die Foundation-Fläche
(lokal, nie weitergeleitet) und der Ingress von Home Assistant. Der Companion
öffnet gar keinen Listener. Dazu die Definition aus Entscheidung E3: released
ist ein grüner Tag, und ob das Release aus dem Draft heraus ist, ändert nichts
daran.

**`progress.md` war eine Momentaufnahme mit einem Journal darin.** Der Kopf
trug den 2026-08-31, der Inhalt reichte bis heute, und Zeile 23 war ein einziger
Absatz von **3.131 Wörtern** — die Geschichte jedes Tores, in einem Dokument,
das den Stand sagen soll. Der Absatz trägt jetzt, was ein Stand braucht: die
51 Schritte, die achtzehn gezählten Zahlen und die beiden Messungen daneben.
Alle achtzehn stimmen nach dem Kürzen weiter, denn `progress:walk` sucht die
Satzteile und nicht die Zeile. Der Kopf sagt jetzt ausserdem, was das Dokument
*ist*: eine Momentaufnahme, und ein Datum von gestern darin ist ein Fehler und
keine Historie.

**Das Konsistenzdokument zählte die Regel auf, statt sie zu sagen.** 80 Zeilen
der Form *„X language must remain consistent with ADR NNNN"*, endend bei
`0076` — etwa die Hälfte der Entscheidungen, lange nicht mehr fortgeschrieben.
Eine Liste, die die Regel *ist*, ist eine, die jemand aufhört fortzuschreiben,
und dann liest sie sich als Abdeckung statt als Ausschnitt. Übrig ist ein Satz,
der nicht veraltet, dazu was mechanisch gehalten wird und was ein Mensch noch
tun muss.

**Der Dockerfile-Kommentar sagte das Gegenteil der Entscheidung.** Er nannte
das Relay *„deliberately not a Home Assistant add-on (ADR 0153)"*, und ADR 0155
hat es am 2026-08-20 zu einem gemacht. Er sagt jetzt beides: das Bild ist
keines, der Einwand von ADR 0153 steht weiter, und `pico_relay/config.yaml`
trägt ihn dort, wo jemand ihn beim Installieren trifft.

**Und die Antwort auf E7 gehört in eine andere ADR als gedacht.** Der Brief
sagte ADR 0031; ADR 0134 heisst *„Formats Revise in Place Until the First Kept
Identity"* und ist genau die Erlaubnis, die mit der ersten behaltenen Identität
endet. Der Nutzer hat bestätigt, dass es eine gibt. Damit ist die Erlaubnis
abgelaufen, und der Satz, der sie ersetzt, stand von Anfang an in ihrem Titel:
Serialisierung und Kanonisierung der Identität sind ab jetzt eine versionierte
externe Schnittstelle.

**Offen gestellt statt entschieden:** „Pico Vault" trägt zwei Begriffe — ADR
0015 den Knotentyp, ADR 0097 den Verwahr-Daemon darin —, und beide Lesarten
stehen in `ReadmeTech.md`. Das Review hält die zweite für die saubere. Eine
ADR-Vokabel im Vorbeigehen umzubenennen wäre derselbe Fehler wie bei E10; sie
liegt als E11 im Brief.

**B133 — Eine Regel, die niemand hielt, und eine Datei, die sich selbst
widersprach (2026-09-10, Paket P6 des externen Reviews).** `AGENTS.md` sagt
seit Langem: *„`.agent-context.md`: nur aktueller Handoff, Zielgröße maximal
200 Zeilen."* Die Datei hatte **2.235**, überwiegend Augustverlauf. Ihr eigener
Kopf sagte seit dem 2026-08-20, dass sie nicht mehr stimmt, und trug im selben
Absatz zwei Zahlen von damals — 45 Schritte statt 51, 2.947 Tests. Ein Agent
liest so eine Datei als aktuellen Stand, und ein Stand von gestern steuert ihn
falsch; das Review hat denselben Punkt gemacht.

**Vor dem Streichen nachgesehen, nicht danach.** Von den 285 fett markierten
Aussagen der alten Datei stehen 279 nirgends wörtlich sonst — ein grobes Maß,
denn das meiste ist Prosa über Dinge, die in Git, im Code oder in einer ADR
stehen. Gezielt geprüft wurden die vier Sätze, die *Arbeitsanweisung* sind: der
Probe-Modus entscheidet über das PSS-Budget (steht im Runbook), Real-Process-
Tests laufen gegen `dist/` (steht im Runbook), `3200` wird weitergeleitet und
`3100` nie (steht in beiden Add-on-Konfigurationen und wird von
`check-addon-config.mjs` gelesen), und nie `git add -A` (in den neuen Einstieg
übernommen). Ein fünfter ist gewandert statt zu fallen: dass die
Relaisbereitstellung über einen Tunnel auf 443 läuft und der Operator-Name
dauerhaft ist, steht jetzt im Runbook — mitsamt dem Grund, warum ein späterer
Wechsel jede ausgegebene Adresse tötet.

Dabei fiel auf, dass der Satz einen toten Pfad nannte: er suchte
`link-relay-transport.ts` unter `packages/protocol/src`, und die Datei liegt in
`apps/core/src`. Das Tor aus Befund B115 hat es beim Verschieben sofort
gemeldet — genau die Sorte Zeiger, wegen der es geschrieben wurde. Und beim
Aufschreiben dieses Absatzes ein zweites Mal, weil ich den toten Pfad als
Beispiel hinschrieb: die Regel liest einen Pfad in Backticks als Zeiger,
gleichgültig ob der Satz ihn gerade für tot erklärt.

Übrig sind **124 Zeilen**: wo die Wahrheit steht, der Einstieg, was gerade
läuft, acht offene Entscheidungen und der Verifikationsstand.

**Und ein Tor hält die Zahl, das sie nicht wiederholt.** Es liest die Grenze
aus `AGENTS.md` statt sie ein zweites Mal hinzuschreiben; verschwindet der Satz
dort, fällt der Lauf. Eine Regel ohne Aussage ist keine, und ein Tor, das sie
trotzdem durchsetzte, setzte etwas durch, das niemand mehr sagt. Zwei
Pflanzungen, beide rot: 203 Zeilen, und die Regel aus `AGENTS.md` entfernt.

**B132 — Das Audit las den Graphen, das Paket trägt Chromium (2026-09-10,
Paket P3 des externen Reviews).** `pnpm audit --prod` liest den
Produktionsgraphen des Workspaces. Das Debian-Paket enthält die
Electron-Laufzeit samt Chromium und V8, und `electron` steht als
`devDependency` in `apps/companion-shell/package.json` — `--prod` sieht sie
also nie, während `package-linux.mjs` sie in jedes gebaute Paket kopiert. Was
ein Paket ist, entscheidet der Packer und nicht ein Feld in einem Manifest.

**Gemessen, und das Ergebnis stand quer zur Erwartung.** Über
`pico-companion_0.2.1_amd64.deb`: `pnpm audit --prod` meldet **null** Hinweise,
der volle Lauf **sieben** — und alle sieben betreffen Testwerkzeug (`vitest`,
`vite`, `esbuild`), das in keinem Paket landet. Die Lücke lag also nicht dort,
wo sie sichtbar war, sondern genau umgekehrt: das eine, was ausgeliefert wird
und `--prod` entgeht, ist Electron, und dafür stand an diesem Tag nichts an.
Ein Prüfer, der heute nichts findet, ist trotzdem der Unterschied dazu, es
morgen zu finden.

**Das Inventar kommt aus dem Artefakt.** Ein zweites Mal abzuleiten, was
ausgeliefert werden *sollte*, wäre dieselbe Behauptung noch einmal;
`dpkg-deb --contents` sagt, was drin ist. pnpm schreibt Name und Version in
den Verzeichnisnamen unter `.pnpm`, die Electron-Version steht als Datei
`version` neben der Binärdatei, und beides ist ohne Auspacken lesbar — auf
einer Maschine mit einem tmpfs von 7,5 GB ist das kein Nebenpunkt. Gemessen:
**39 npm-Pakete plus Electron 44.0.0**.

Verglichen wird Name **und** Version: ein Hinweis nennt in `findings[].version`
die installierte Fassung, gegen die er gilt. Ein Werkzeug, das im Baum in einer
verwundbaren und im Paket in einer sicheren Fassung liegt, meldet damit nicht
fälschlich — ein Prüfer, der Wolf ruft, ist einer, den jemand abschaltet.

**Und die eigene Pflanzung fand einen Fehler in ihm selbst.** Nimmt man die
Zeile heraus, die Electron ins Inventar setzt, lief der Prüfer grün durch und
sagte im Schlusssatz weiterhin *„including electron"*. Die Zahl fiel von 40 auf
39, und das sieht niemand. Ein Satz, der eine Eigenschaft behauptet, die der
Lauf nicht geprüft hat — genau das, wogegen dieser Prüfer geschrieben ist, nur
eine Ebene höher. Er fragt jetzt nach, und dieselbe Pflanzung spricht.

Er läuft **neben** der Kette, aus demselben Grund wie das Audit daneben: ein
bekannter Hinweis ist eine Tatsache über die Welt am Tag des Baus, und ihn in
ein Tor zu falten liesse eine fremde Veröffentlichung wie einen kaputten Baum
aussehen. Und er läuft *nach* `verify:gates`, weil das Artefakt erst dort
entsteht. Über einem leeren Baum endet er, bevor er das Netz anfasst — der
Vakuitätsprüfer fährt jetzt fünfzig Prüfer statt neunundvierzig.

Was offen bleibt und benannt gehört: eine SBOM neben dem Artefakt und ihre
Attestation. Beide hängen daran, dass das Repository öffentlich ist
(Entscheidung E1), und es ist es bewusst nicht.

**B131 — Ein Shred, der eine Klartextkopie stehen ließ — und eine Entscheidung,
die beim Umsetzen umfiel (2026-09-10, Paket P11 des externen Reviews).** ADR
0049 zählt seit dem 2026-08-24 fünf Dinge auf, die andere Speicher erreichen
und diesen nicht. Eines davon: *„A domain shred does not reach it.
`domain-shred.ts` never names the table."* Das Review hat danach gefragt.

**Warum dieses eine schwerer wiegt als seine vier Nachbarn.** Ein Shred ist der
Vorgang, der Inhalt *unlesbar* macht, indem er die Schlüssel einer Domäne
zerstört. Eine Zeile, die Frage, Antwort und gelesenen Kontext derselben Domäne
im Klartext hält, überlebt ihn unberührt — er tut dann, was er verspricht, an
allem außer an der Stelle, an der die Worte ohnehin offen lagen. Hier wählt
auch kein Mensch zwischen zwei Gütern; es gibt nur eines.

Der Weg dorthin ist ein **Port** in `domain-shred.ts`, wie beim
Beobachtungspuffer, und aus dem Grund, den die Datei selbst nennt: „shred a
domain" ist eine Handlung, und eine Kaskade mit zwei Eingängen ist eine, von
der jemand die Hälfte vergisst. Geleert wird, was `home.recall.forget` leert;
`kept_memory_item_id` bleibt stehen, weil die Handhabe alles ist, womit eine
Person ein behaltenes Item noch aufheben kann (ADR 0126). Eine noch laufende
Zeile bekommt `outcome = 'domain_shredded'` statt `taken_back` — ein Shred ist
keine Rücknahme durch die Person, und diese Liste ist ein Verlauf für Menschen.

**Die zweite Hälfte des Pakets ist beim Umsetzen umgefallen, und das ist der
eigentliche Befund.** Entscheidung E4 sah vor, dass `home.memory.forget`
zusätzlich die Worte des Austauschs leert, aus dem das Item stammte. Beim
Schreiben stand ein bestehender Test dagegen, mit ausgeschriebener Begründung
vom 2026-08-25: *„The answer stays and the memory goes. What was taken back is
the memory, not the record that an answer was once given — and the line then
offers to keep it again, which is the honest state: they have one and did not
keep it."*

Das ist nicht bloß ein Test, es ist die Gestalt, die der Nutzer damals gewählt
hat: die eine Operation hebt die Erinnerung auf, die andere nimmt den Austausch
zurück, und beide zusammen lassen die Person wählen. Wer den Austausch
mitnimmt, wenn jemand nur die Notiz aufheben wollte, entfernt einen Eintrag aus
dessen Verlauf, ohne dass er danach gefragt hat. **Als ich E4 vorlegte, kannte
ich diesen Test nicht** — ich hatte ADR 0049 gelesen und die Nachbarschaft
nicht. Die Hälfte ist zurückgenommen, der Grund steht an der Stelle im Code, in
ADR 0049 und hier; die Umkehr gehört dem Nutzer und nicht mir.

Drei Netze, drei Ebenen, weil die Lücke zwischen ihnen läge: sechs Tests halten
die Semantik der Warteschlange, zwei den Ruf des Ports im Shred, und einer die
**Verdrahtung** im Kern — ohne den dritten wären die ersten beiden wahr und der
Weg dazwischen trotzdem offen. Zwei Pflanzungen, beide punktgenau: ein
verstellter JSON-Pfad lässt vier Warteschlangentests fallen, ein abgehängter
Port genau den Verdrahtungstest.

Offen bleiben die drei übrigen Punkte aus ADR 0049: keine Q5-Obergrenze, kein
Sweep, keine Posture auf der Jobzeile. Die grosse Fassung gehört mit der
Obergrenzenfrage zusammen entschieden, weil beide davon abhängen, was ein
Verlauf ist, den eine Person behalten will.

**B130 — Ein Wiederholungsschutz, der im Prozess wohnte (2026-09-10, Paket P12
des externen Reviews).** ADR 0107 nannte den Rest seit seinem ersten Tag in der
eigenen Bedrohungstabelle: *„the seen set is in-memory; a restart inside a
request's remaining validity window can admit the same otherwise-valid request
again"*. Das Review fragte danach, und die Zeile stimmte.

**Gewogen, bevor er geschlossen wurde.** Was ein Angreifer braucht, ist eine
Anfrage, die mit gültigem Geräteschlüssel signiert war, und ein Neustart des
Homes innerhalb ihrer eigenen Restgültigkeit von höchstens sechzig Sekunden.
Was er erreicht, ist die zweite Ausführung derselben Operation. Bei den meisten
der 55 Operationen ist das folgenlos, weil sie idempotent sind oder an einen
Zustand gebunden, den die erste Ausführung verändert hat. Das Review wog ihn
schwerer als er ist; ihn zu schliessen war trotzdem billiger, als alle 55 auf
ihre zweite Ausführung durchzusehen.

Die Merkmenge ist jetzt `pico_link_direct_seen_request` (Wanderung 0026), und
der Eingang bekommt sie als **Pflichtargument** statt als Vorgabe. Eine Vorgabe
wäre derselbe Fehler mit einem Parameter davor: wer einen Eingang verdrahtet,
muss sagen, wo das Gedächtnis liegt, und es gibt genau einen Ort, der den
Prozess überlebt. Dieselbe Lehre wie in B117 — ein Schutz, der aus Versehen
gilt, gilt bis jemand anders installiert.

Beide Grenzen bleiben, wo sie waren: jede Zeile läuft ab und wird bei der
nächsten Anfrage gelöscht, der Deckel von 1.024 Zeilen verdrängt beim
Einfügen. **Wer verdrängt wird, hat sich geändert.** Die Map liess den zuerst
Eingefügten gehen; die Tabelle ordnet nach `(expires_at_ms, seq)`, verdrängt
also den, der ohnehin zuerst verfällt, und bei Gleichstand weiterhin den
ältesten. Die verbleibende Wiederholbarkeit, die dabei verschenkt wird, ist
damit immer die kürzeste, die zu vergeben ist — und der alte Test, in dem alle
Fristen gleich sind, geht unverändert durch.

Zwei Pflanzungen, beide punktgenau: der Prozessspeicher zurück lässt genau den
Neustart-Test fallen, und `ORDER BY seq` allein genau den zur
Verdrängungsordnung. Der Neustart ist gefahren statt behauptet — eine Datei auf
der Platte, ein Eingang, ein geschlossenes und neu geöffnetes Handle, ein
zweiter Eingang, dieselbe Anfrage: abgelehnt, und die Operation lief kein
zweites Mal. Sechs Tests halten den Speicher selbst, 25 den Eingang.

Damit fällt der Satz aus `progress.md`, der seit Wochen dort stand, und die
Zeile in ADR 0107 nennt jetzt einen anderen Rest: wer die Datenbank verliert,
verliert das Gedächtnis mit ihr, und das ist dasselbe Ereignis wie das Home
zu verlieren.

**Was eine Wanderung sonst noch kostet, gemessen statt vermutet.** Die
sechsundzwanzigste Wanderung liess acht Tests fallen, und keiner davon war ein
Fehler: `migrations.test.ts`, `app.test.ts` und `sqlite-backup.test.ts` führen
die angewandten Wanderungen einzeln auf, weil die *Reihenfolge* Teil des
Vertrags ist. Das ist die richtige Strenge — und beim Nachziehen hat mein
eigener Ersatz erst den 0025-Eintrag überschrieben statt ergänzt, was
dieselben Tests sofort gemeldet haben. Zwei Zahlen in `progress.md` sind
mitgewandert (48 Tabellen statt 47, elf Läden mit 85 Schreibmethoden statt
zehn mit 83), und die ausgeschriebene Zahl im Messer selbst dazu: `progress:walk`
trägt „zehn Stores" als Satzteil, den es in `progress.md` sucht, also wandert
sie an zwei Orten oder an keinem.

**B129 — Ein Satz, oben zurückgenommen und unten stehen geblieben (2026-09-10,
Paket P7 des externen Reviews).** Das Review meldete einen falschen Kommentar
in `action-path.ts`: er behauptete, eine aufgezeichnete Regel könne nur
verschärfen. Der Code tut das Gegenteil, und zwar mit Absicht —
`applyPicoRulesRecordedDecision` gibt `recorded ?? derived` zurück, und aus der
Frage, die `external_write` hergibt, wird damit eine Erlaubnis. Das ist der
Mechanismus, mit dem ADR 0143 DP8 einen unbeaufsichtigten Lauf überhaupt
handeln lässt; ohne stehende Regel muss jeder Pfad einen Menschen finden.

**Der Kommentar log doppelt.** Er sagte nicht nur das Falsche, er behauptete
auch, die Berichtigung sei schon eingebaut: *„seit dem 2026-08-25 auch im Code
und nicht nur im Titel der Testgruppe daneben"*. An dem Tag ist die Testgruppe
berichtigt worden und eine Statusnotiz an den Kopf von ADR 0140 gekommen — der
Kommentar nicht.

**Und das Review sah nur die Hälfte.** Nachgemessen steht der zurückgenommene
Satz auch in ADR 0140 selbst: die Statusnotiz oben zitiert *„a recorded rule
refines and never grants"* und nimmt ihn zurück, und derselbe Satz stand
dreihundert Zeilen darunter fett im Entscheidungstext, den ein Umsetzer liest.
Beide sind berichtigt; jede verbliebene Nennung im Baum steht jetzt in
Anführungszeichen innerhalb einer Rücknahme.

Der Kommentar an der Aufrufstelle wiederholt die Regel nicht mehr, er zeigt
auf die Funktion, die sie hält. Eine Wahrheit, an der Aufrufstelle noch einmal
hingeschrieben, driftet von der Funktion weg — das ist genau der Weg, den
dieser Satz genommen hat.

**Gemessen und verworfen: ein Tor dafür.** Die naheliegende Regel wäre „ein
Satz, der in einem Dokument zitiert wird, steht nicht unzitiert daneben". Über
247 Dokumente gezählt: 551 verschiedene Zitate ab fünf Wörtern, davon stehen
**40** auch unzitiert daneben — fast alle harmlos, weil ein Dokument seine
eigene frühere Formulierung zitiert. Ein Tor daraus wäre Rauschen. Eine engere
Regel müsste auf Rücknahmewörter keyen, und die gäbe es genau einmal: ein Tor,
das seinen eigenen Anlass prüft und nicht seine Klasse, ist der Fehler, den
`instant:check` in Befund B52 schon einmal gemacht hat.

Die Messung fand dabei einen echten Geschwister-Fall: ADR 0153 sagt *„Pico
Relay is deliberately not a Home Assistant add-on"*, und ADR 0155 hat das
überholt. Er steht als R12 schon in Paket P5.

**Und ein Nebenbefund aus dem Kettenlauf dazu, dieselbe Familie.** Die Kette
riss einmal am Paketprüfer, und die Meldung lautete `failed: null`. Nachgesehen
statt vermutet: `run()` in `verify-linux-package.mjs` gibt `result.status` aus
und lässt `result.signal` weg. `status` ist aber genau dann `null`, wenn ein
Signal den Prozess beendet hat — die eine Angabe, die die Ursache benennt, war
die weggelassene. Bei Dateideskriptor-Stdio gibt es auch kein `stderr`, auf das
man zurückfallen könnte. Der Wiederholungslauf war grün, und woran der erste
starb, ist deshalb nicht mehr feststellbar. Die Meldung sagt jetzt `signal
SIGKILL` oder `exit status 3`; beim nächsten Mal steht dort, ob es der
OOM-Killer war (diese Maschine hat 14 GiB und einen pnpm-Store im RAM) oder
eine Zeitgrenze. Ein Prüfer, der nicht sagen kann, was geschehen ist, ist auf
die Weise kaputt, auf die es zählt.

**B128 — Zwölf Siebzehntel, und die Liste sagte „jedes" (2026-09-10, Paket P4
des externen Reviews).** `check-version.mjs` hielt zwölf Manifeste gegen die
Produktversion. Der Workspace hat siebzehn Mitglieder — `pnpm list -r` zählt
sie mit, achtzehn samt Wurzel. `packages/gesture` und alle vier `modules/*`
standen nicht in der Liste, durften also eine eigene Version tragen, ohne dass
ein Tor etwas sagte. Heute tragen sie dieselbe, und genau das hat die Lücke
unsichtbar gehalten: ein grünes Tor beweist die Eigenschaft, die es misst, und
dieses maß zwölf Siebzehntel davon.

Die Mitglieder kommen jetzt aus den Globs in `pnpm-workspace.yaml`. Der Leser
expandiert `<verzeichnis>/*` und **weigert sich hörbar bei allem anderen** —
kein `**`, kein Ausschlussmuster, kein geratener Pfad. Ein Muster, das er
falsch läse, verkleinerte die bewachte Menge stillschweigend, und eine
kleinere Menge meldet keinen Fehler, sie meldet weniger. Ein Verzeichnis ohne
`package.json` ist kein Mitglied, weil pnpm es so hält; ein *Glob* ohne jedes
Mitglied ist einer, weil ein Wurzelverzeichnis, das aufhört zu antworten, ein
Umzug ist und kein sauberes Ergebnis.

**Dieselbe Frage traf zwei weitere Listen, und eine davon behauptete etwas.**
In `check-addon-config.mjs` standen zwei Konfigurationspfade unter der
Überschrift *„Every add-on in this repository, not the one this file was
written for"*. Der Satz stimmt, solange jemand ihn nachführt — eine Liste sagt,
was erlaubt ist, nie, ob es das noch gibt. Add-ons werden jetzt so entdeckt,
wie der Supervisor sie entdeckt: ein Verzeichnis oberster Ebene mit einer
`config.yaml`, die einen `slug` trägt. Das ist die Regel der Plattform und
keine erfundene Konvention, und der Unterschied zählt, weil eine erfundene
später genauso still bricht wie eine Liste. Damit fallen acht von Hand
geschriebene Zeilen in `check-version.mjs` weg: Konfiguration, README,
Changelog-Überschrift und Bildschild werden je Add-on abgeleitet, das Schild
aus dem `image:`, das die Konfiguration selbst nennt.

Die dritte Liste war die der Dockerfiles — und `check-workflow-pinning.mjs`
las dasselbe Verzeichnis daneben schon. Zwei Sätze über dieselbe Menge driften;
jetzt fragen beide `picoDockerfiles`.

Fünf Pflanzungen, fünf rot: `packages/gesture` auf 0.2.2, `modules/depot` auf
0.1.9 (beide vorher unsichtbar), ein `packages/**`, ein `!**/fixtures/**` und
ein Glob ohne Mitglieder. Elf Tests halten den Leser, darunter einer gegen
diesen Baum: siebzehn Manifeste, und die fünf, die die Handliste ausließ,
namentlich.

**Und die vierte Namenskollision dieser Sitzung.** Meine Schleifenvariable in
`check-workflow-pinning.mjs` hieß erst `relative`, ein Import aus `node:path`,
dann `dockerfile` — und weiter unten steht ein `const dockerfile` auf oberster
Ebene, also lag der Name beim Durchlauf in der toten Zone. Dieselbe Klasse wie
B114, B116 und B119: Skriptcode auf oberster Ebene läuft in Dateireihenfolge,
und ein Name, der weiter unten gebunden wird, ist oben nicht frei.

**Und eine Lehre über die eigene Prüfreihenfolge.** Die elf Tests waren grün,
und der Build fiel trotzdem: `@ts-expect-error` stand über einem mehrzeiligen
Import, TypeScript schreibt den Fehler aber der Modulzeile zu, nicht der
ersten. Vitest typprüft nicht, `pnpm build` schon — eine grüne Testmenge sagt
nichts darüber, ob der Baum übersetzt.

**B127 — Ein Asset wird einmal angehängt, nie ersetzt (2026-09-10, Paket P1
des externen Reviews).** Das Review vom 2026-09-09 ist gegen den Baum
gemessen und liegt als Brief unter `docs/development/briefs/`; neun
Entscheidungen, zwölf Pakete. Das erste mit Wirkung: der Client-Job hängte
sein Paket mit `--clobber` an das Release, und er wartet nur auf `verify` und
`suites`, während die Monotonieprüfung in den beiden Bild-Jobs läuft. Ein
Tag, den die Registry abgelehnt hatte, konnte sein `.deb` samt Prüfsumme also
trotzdem unter demselben Namen tauschen — zwei Artefakte einer Version aus
zwei Quellständen.

`scripts/check-release-asset-absent.mjs` fragt das Release, was schon
angehängt ist, und beendet den Job vor dem Upload, wenn ein Name kollidiert;
die Entscheidung ist rein und neben `decidePicoRelease` getestet, fünf Fälle,
darunter die halbe Kollision (nur die Prüfsumme liegt schon) und der Lauf
ohne Paket. Was die *Verdrahtung* hält, ist `split:check`, das ci.yml ohnehin
liest: kein `--clobber` ausserhalb eines Kommentars, jeder `gh release upload`
fragt im selben Schritt vorher, und ein Upload, den es nicht mehr gibt, ist
ein Fehler statt ein sauberer Lauf. Zweimal gepflanzt, zweimal rot — und beim
ersten sauberen Lauf war das Tor selbst rot, weil mein Kommentar am Schritt
das Wort `--clobber` erklärt: ein Wort in einem Kommentar überschreibt nichts,
und die Regel liest seitdem nur Zeilen, die keine Kommentare sind.

Das `--draft` bleibt, jetzt mit Grund an der Zeile (E2): ein Mensch sieht
Paket und Prüfsumme, bevor jemand sie laden kann.

**B126 — Die Regel stand einmal, der Mantel um sie neunzehnmal (2026-09-10).**
B125 hat `assertInstant` als nächsten Griff empfohlen: sechs Fassungen über
vier verschiedenen Rümpfen, und B112 hatte an genau diesem Begriff schon zwei
echte Fehler gefunden. Beim Nachsehen war die Zahl falsch — nach unten. (Die
Wiederholung dieser Zählung hat nebenbei den Fehler im Messskript aufgedeckt,
der oben in B125 korrigiert steht.)

Alle sechs fragten längst `isPicoInstant`; die *Regel* ist seit dem 2026-08-20
einmal geschrieben, und das Tor `instant:check` hält sie. Was daneben stand,
war der **Mantel**: `if (!isPicoInstant(x)) throw new Error('…')`. Gezählt statt
geschätzt, mit dem Tor über den Baum bei HEAD: **neunzehn**. Sechs trugen den
Namen `assertInstant`, dreizehn standen anonym mitten in einem Parser — und
zwei der dreizehn trugen eine Begründung im Rumpf und fielen meiner ersten
Messung durch, die nur `{ throw` direkt hinter der Klammer kannte. Wer nur
Namen zählt, findet sechs. Ein Name ist keine Regel, und eine Regel ist nicht
ihr Mantel.

**Die neunzehn waren nicht gleich, und der Unterschied war nie entschieden.**
Zwei stellten `assertAsciiToken` davor. Ausgeführt statt gelesen, über elf
Eingaben: der Vorlauf ändert **kein Urteil** — jeden Wert, den er ablehnt,
lehnt `isPicoInstant` auch ab, denn ein Zeitpunkt sind vierundzwanzig
ASCII-Zeichen aus Ziffern, `-`, `:`, `.`, `T` und `Z`, die das kanonische
Tokenmuster alle zulässt. Geändert hat er nur den **Namen** der Ablehnung: leer,
mit Leerzeichen, nicht-ASCII, zu lang, keine Zeichenkette — fünf von elf Fällen
— kamen als `empty_field`, `invalid_field_charset` oder `field_too_long` zurück
statt als `invalid_instant`. Der spezifische Name gegen den vagen eingetauscht,
in genau den Fällen, in denen jemand wissen muss, welches Feld gemeint war. Und
niemand hatte das verlangt: von den drei `invalid_field_charset`-Vektoren ist
keiner ein Zeitpunkt, sondern eine Domain, eine Item-Id und ein Umschlagsfeld.

Auch was herauskam, war nicht entschieden: von den sechs benannten gaben zwei
eine Zahl zurück, eine die Zeichenkette, drei nichts. `Date.parse` auf einer
ungeprüften Zeichenkette ist `NaN`, und `NaN` vor einer Frist ist in beide
Richtungen falsch — weder abgelaufen noch gültig, was jeder dieser Aufrufer als
"nicht abgelaufen" liest. Deshalb sind es jetzt zwei Namen und nicht einer:
`assertPicoInstant(wert, name)` ist die Ablehnung, `picoInstantToEpochMs` die
Umrechnung, die nur durch die Ablehnung hindurch erreichbar ist.

Neunzehn Mäntel bei HEAD, null jetzt. Die **dreiundzwanzig** echten
Mehrfachbedingungen (`typeof x !== 'string' || !isPicoInstant(y)`) bleiben
unberührt — sie tun etwas anderes, und beide Zahlen sind vorher und nachher
gemessen worden.

Zwei Netze gepflanzt, beide bissen: der Vorlauf zurück in `assertPicoInstant`
lässt zwei Tests fallen (`erwartet 'invalid_instant', bekam 'empty_field'`), ein
neuer handgeschriebener Mantel in `observation.ts` lässt `instant:check`
fallen. Das Tor kennt jetzt die Form statt des Namens: eine einzige Bedingung,
und der Rumpf wirft.

**B125 — Dieselbe Frage an alle Namen: fünfundvierzig stehen über
verschiedenen Regeln (2026-09-10).** B124 fand einen Namen über sechs Regeln.
Die Frage gehört an den ganzen Baum, nicht an einen Namen:

| | | |
|---|---|---|
| | gezählt am 2026-09-10 | **korrigiert** am selben Tag |
| Funktionsnamen | 1.524 | **1.592** |
| stehen mehr als einmal | 60 | **65** |
| davon über **verschiedenen** Rümpfen | 45 | **50** |

**Die erste Zählung war zu hoch, und der Fehler lag im Messskript** (bemerkt
beim Wiederholen für B126). Es las `braceSpan` als Objekt statt als Paar,
`span.end` war also `undefined`, und jeder Rumpf lief bis zum Dateiende und
verschluckte die nächste Funktion. So sahen 33 wortgleiche `isRecord` wie 29
verschiedene aus. Mit der richtigen Spanne stimmen die Kennzahlen wieder:
`hexToBytes` 7/6 und `hasExactKeys` 8/4 sind in beiden Läufen dieselben — was
sie damals plausibel machte und den Fehler daneben verdeckte.

Die Spitzenreiter sind alle im Signierweg: `hexToBytes` (7 Fassungen, 6
verschieden), `hasExactKeys` (8/4), `assertInstant` (6/4),
`assertLifecycleOrder` (4/4), `assertFingerprint` (4/3).

**Gefaltet: `bytesToHex`, dreizehn Fassungen in vier Schreibweisen** — acht im
Produkt, vier in Tests, eine unter dem Namen `bytesToHexString`. Ausgeführt
statt gelesen, und alle vier stimmen überein, auch an den Rändern:

```
[0,1,10,15,16,255] -> 00010a0f10ff (alle gleich)
[] -> (alle gleich)      [0,0,0] -> 000000 (alle gleich)
```

**Warum eine Zeile eine Regel ist.** `padStart(2, '0')` zu vergessen fällt
nicht auf: aus Byte `10` wird `'a'` statt `'0a'`, die Zeichenkette bleibt Hex
und wird nur kürzer, und jeder Fingerabdruck danach ist um ein Zeichen
verschoben. `canonicalHexPattern` daneben verlangt zusätzlich Kleinschreibung.
Dreizehn Gelegenheiten dafür sind zwölf zu viel.

**Nicht gefaltet: `hexToBytes`.** Die sieben sind wirklich verschieden, und
zwar in der Prüfung — eine wirft mit eigener Meldung, zwei werfen
`invalid_hex`, und die auf dem Recovery-Card-Weg prüft **gar nicht**. Die ist
trotzdem richtig: ihr Aufrufer hat den Hexwert zwei Zeilen vorher gegen das
Muster *und* gegen die Kanonisierung der Nutzlast geprüft, und die Datei sagt
das auch — *„not because the mapping checks for it afterwards, but because the
printed side and the scanned side are read from the same bytes."*

Nach B124 wäre die bequeme Lesart gewesen, auch diese sieben zusammenzulegen.
Sie sind nachgesehen worden, einzeln, und das Ergebnis ist ein Nein.

`canonical:check` hält jetzt neun Regeln statt sieben und sechs benannte Kopien
ausserhalb. Protokoll 621, Identität 34, Vault 19, Kern 1.112, Daemon 129 —
alle grün.

**Was offen bleibt, benannt statt stillschweigend:** dreiundvierzig weitere
Namen stehen über verschiedenen Rümpfen. Die meisten sind Zwillinge mit Absicht
(`assertLifecycleOrder` prüft in vier Paketen vier verschiedene Ordnungen);
`assertInstant` mit sechs Fassungen ist nach Befund B112 der nächste
Kandidat. Das steht in `.agent-context.md`, damit die nächste Sitzung die
Messung nicht wiederholt.

**B124 — Ein Name über sechs Regeln, und meine erste Zählung war falsch
(2026-09-10).** Der Prüfer für kanonische Bytes nennt seine Lücke selbst:
*„Eine Regel, die unter einem anderen Namen noch einmal geschrieben wird, ginge
an ihr vorbei."* Also nicht nach Namen gesucht, sondern nach **Gestalt** —
Funktionsrümpfe mit umbenannten Bezeichnern verglichen. Sechsundsiebzig Gruppen
gleicher Gestalt; die meisten Zwillinge mit Absicht (eine Delegation und eine
Widerrufung prüfen sich gleich).

**Der Fund war der Umkehrfall:** nicht eine Regel unter zwei Namen, sondern
**ein Name über sechs Regeln** — in dem Paket, dessen Kopf sagt *„Ein Name ist
keine Regel."*

| | |
|---|---|
| `assertExactKeys`-Definitionen im Baum | **20** |
| davon wirklich dieselbe Regel | **13** → eine geteilte Funktion |
| verschiedene Regeln unter demselben Namen | **6** |

**Und dann war meine erste Zählung falsch.** Ich hatte geschrieben, alle
dreizehn Rümpfe im Protokollpaket seien Zeichen für Zeichen dieselben — fünf
angesehen, acht angenommen. Nachgemessen waren es **sieben verschiedene
Rümpfe**. Das Zusammenlegen änderte damit Verhalten, und zwei Tests fingen es:

> `expected [Function] to throw error including 'unexpected_field'
> but got 'invalid_record'`

Drei Dateien zurückgenommen. **Von einer Stichprobe auf die Menge geschlossen**
— genau der Fehler, den dieses Wochenende an fremdem Code viermal gefunden hat,
und gefangen hat ihn nicht das Nachdenken, sondern der Testlauf.

**Die sechs heissen jetzt, was sie sind:**

- `index.ts` → `assertExactKeysWithoutFieldOrder` — verbietet zusätzlich einen
  Schlüssel `fieldOrder`, weil eine umsortierte Feldliste eine andere
  Signatureingabe ergäbe
- `model-context.ts` → `assertNoUnexpectedKeys` — verlangt fehlende nicht
- `recovery.ts` → `assertExactRecordShape` — vier Ablehnungen mit eigenen Namen
- `profile.ts` und `packages/vault` bleiben und stehen mit Grund in der
  Bestandsliste des Prüfers

**Warum es zählt.** Diese Funktion entscheidet, welche Felder ein Datensatz
haben darf, **bevor** daraus Signatureingaben gebaut werden. Eine Fassung, die
ein Feld mehr durchliesse, hiesse: eine Unterschrift über etwas, das der Bauer
nebenan abgelehnt hätte.

`canonical:check` hält jetzt acht Regeln statt sieben und fünf benannte Kopien
ausserhalb statt drei. Protokoll 621, Kern 1.112, Daemon 129, Begleiter 279 —
alle grün.

**Was daraus folgt.** Zwei Fragen sehen gleich aus und sind es nicht: *„Steht
diese Regel zweimal?"* und *„Steht unter diesem Namen zweimal dasselbe?"* Der
Prüfer stellte die erste; die zweite hatte niemand gestellt, und sie war die
mit den sechs Antworten.

**B123 — Hingesehen, und die eigene Reparatur sah kaputt aus (2026-09-10).**
Seit B103 stand in `.agent-context.md` ein offener Punkt: *„Das Fenster sieht
anders aus, und niemand hat hingesehen."* Also hingesehen — die Zeichner nehmen
`document` als Parameter, also im Browser, mit dem echten Stilblatt.

**Was hielt:** die Zeilen sind Karten mit Rahmen und Innenabstand, die
verschachtelte Angebotsliste hat keine Aufzählungspunkte, und *„Forget this
device and everything you decided about it"* ist sichtbar der leise Knopf.
B103 ist angekommen.

**Was kaputt aussah, war meine eigene Reparatur.** Die Aufschrift lief ohne
Abstand in ein kleines graues Kästchen:

> `Where its material belongs▭`

B102 hat das Feld *in* seine Beschriftung gezogen — für die Verbindung richtig,
und eine Verschachtelung kann nicht auseinandergehen. Nur trafen es die
Stilregeln danach nicht mehr: sie sprechen über `.form-card input`, und dieses
Feld steht in einer Listenzeile. Die Regel hat jetzt **zwei Träger statt zweier
Fassungen**, und der verschachtelte Fall bekommt sein `display: block`, weil
ein `<label>` sonst in einer Zeile bleibt.

**Kein Prüfer hätte das gefunden**, und keiner sollte es. `labels:check` fragt,
ob die Beschriftung auf ihr Feld zeigt — sie tut es, sogar durch Enthaltensein.
`style:check` fragt, ob jeder Name eine Regel hat — hat er. Was fehlte, war,
dass **niemand hingesehen** hatte. Die drei Prüfer decken die Syntax; das
Aussehen deckt ein Blick, und der ist billiger als jede Regel, die ihn ersetzen
wollte.

**Gesehen und nicht geändert:** drei primärblaue Knöpfe übereinander — *„Do not
use this"*, *„Allow this again"*, *„Do not use this device"*. Alle drei sind
Rücknahmen oder Wiederherstellungen und alle drei so laut wie ein Hauptknopf.
Ob das richtig ist, ist ein Urteil über die Fläche; es steht als Beobachtung in
`.agent-context.md` statt als stille Änderung im Baum.

**Was daraus folgt.** Zwischen B100 und B105 sind fünf Regeln über diese Fläche
entstanden, und alle fünf waren an dem Tag grün, an dem die Fläche schlecht
aussah. Eine Regel prüft, was sie prüft. Der Rest braucht Augen — und dieser
Punkt stand vier Tage offen, weil ich ihn für teurer hielt, als er war.

**B122 — „Abwesenheit ist eine Antwort" — siebenmal nachgesehen, einmal
etwas gefunden (2026-09-10).** B121 hat gezeigt, was passiert, wenn eine
abgeschnittene Datei als *„nichts da"* gelesen wird. Also die Klasse gesucht,
statt es beim Fall zu lassen.

**Wo ein Lesefehler zu einer Abwesenheit wird: sieben Stellen.**

| Stelle | Was die Abwesenheit bedeutet |
|---|---|
| `reader-custody-space.ts` | der Fall aus B121 — die Ursache ist seit gestern behoben |
| `app.ts` (Depot-Manifest) | *„A depot whose manifest does not parse is a depot Pico will not act on"* — begründet, und die sichere Richtung |
| `event-store.ts` ×2 | keine Kontinuität, kein Lebenslaufindex — beides heisst *weniger* dürfen |
| `model-job-queue.ts` | **schluckt gar nicht**: der Auftrag wird mit dem Fehler als Ergebnis abgeschlossen |
| Testhelfer, WebSocket-Nachricht | dort ist Abwesenheit wirklich Abwesenheit |

**Und die schärfere Gegenfrage: wo ist eine Abwesenheit ein *Ja*?** Acht
Stellen. Sechs sind Anfrageparameter (kein `limit` → Vorgabe), eine ist mit ADR
0114 T3 begründet. Die achte war die interessante.

```ts
function isWebSocketOriginAllowed(originHeader, hostHeader, allowedOrigins) {
  if (originHeader === undefined) {
    return true;
  }
```

**Die erste Zeile einer Sicherheitsentscheidung ist ein `return true`, und
darüber stand nichts.** Beim Prüfen greift man zum Alarm — zu Unrecht:

- Ein Browser sendet bei einem WebSocket-Handshake **immer** einen `Origin`
  (RFC 6455 verlangt es). Fehlt er, ist der Anrufer kein Browser, und der
  Angriff, gegen den diese Prüfung schützt, ist ein Angriff *über eine fremde
  Seite im Browser eines Menschen*.
- Einen Ursprung zu verlangen, den nur Browser schicken, sperrte den Begleiter
  und jedes Werkzeug aus und schützte niemanden.
- Und es ist **nicht die einzige Schicht**: der Aufrufer verlangt unmittelbar
  danach ein Kreditiv, sobald irgendetwas diesen Host beansprucht (ADR 0039).

Geändert hat sich also nichts am Verhalten — nur steht der Grund jetzt da. Der
Rest dieses Befunds ist ein Nein, und das ist der Punkt: sechs von sechs
Aufrufern des Lebenslaufindex scheitern **geschlossen**, nicht offen, und das
ist gemessen und nicht gehofft.

**Was daraus folgt.** Der Unterschied zwischen B110 und B122: dort behauptete
ein Kommentar eine Eigenschaft, die der Code nicht hielt; hier hielt der Code
eine Eigenschaft, die kein Kommentar behauptete. Die zweite Sorte kostet keinen
Schaden, sondern Zeit — jedes Mal, wenn jemand die Stelle prüft.

**B121 — Die Datei neben dem Profil, und der Modus war die kleinere Hälfte
(2026-09-10).** `profile.ts` legt seine Datei seit jeher sorgfältig ab:
Zwischendatei mit `0600`, `chmod`, `fsync`, umbenennen, Verzeichnis `fsync`.
Die Datei **daneben** — im selben Verzeichnis, von derselben Anwendung
geschrieben — machte nichts davon: `writeFileSync(pfad, json, 'utf8')`,
dreimal.

**Die grössere Hälfte ist nicht der Modus, sondern die Ganzheit.** Der Leser
des Verwahrraums fängt einen Parse-Fehler und antwortet `undefined`, mit einem
guten Grund im Kopf: *„Kein Raum ist eine Antwort und kein Fehler."* Das
stimmt, solange die Abwesenheit echt ist. Eine abgeschnittene Datei liest sich
damit als **„dieses Gerät hat keinen Verwahrraum"** — und die Fläche bietet an,
einen anzulegen, während der Ablehnungssatz daneben sagt, was das kostet:

> *„Making a second one would leave what is in the first unreachable from this
> device."*

Ein halb geschriebener Zustand, der als sauberer Anfangszustand gelesen wird,
ist die teuerste Sorte kaputt.

Beide Dateien benutzen jetzt denselben Schreiber — **eine Kopie weniger statt
einer mehr**, und `profile.ts` gibt seine zwei privaten `fsync`-Helfer dabei
ab.

**Und dann feuerte eine Pflanzung nicht.** Ich hatte in den Kopf geschrieben,
`chmod` stehe neben `mode`, weil *„`mode` durch die `umask` geht"*. Die
Pflanzung — `chmodSync` entfernt — blieb grün. Nachgemessen:

```
neu angelegt mit mode 0600 unter umask 022: 600
vorhandene 0644 mit mode 0600 ueberschrieben: 644
```

Eine Maske nimmt nur Bits weg, und `0600` hat keine, die `022` wegnähme. Meine
Begründung war schlicht falsch. Der **wirkliche** Grund steht in der zweiten
Zeile: `mode` gilt nur beim *Anlegen*. Nach einem Absturz liegt eine `.tmp` von
vorher da, `writeFileSync` lässt ihre Rechte, und das Umbenennen trägt sie auf
das Ziel. Der Test dafür steht jetzt daneben, und dieselbe Pflanzung fällt.

**Was daraus folgt.** Eine übernommene Begründung ist eine ungeprüfte
Behauptung, auch wenn sie aus der eigenen Datei nebenan stammt. Gefunden hat es
nicht das Nachdenken, sondern dass die Pflanzung schwieg — zum zweiten Mal an
diesem Wochenende (B105 war die erste).

**B120 — Dieselbe Frage auf der Maschine eines anderen (2026-09-10).** B117
hat die Datenbank des Homes verengt. Die naheliegende Nachbarfrage: **das
Relay ist die eine Komponente, die auf fremder Hardware läuft.** Ein echtes
Relay gestartet und hingesehen:

```
755 data
644 data/relay.sqlite
644 data/relay.sqlite-wal
644 data/relay.sqlite-shm
```

**Was darin steht, ist versiegelt — die Adressen sind es nicht.** ADR 0107
siegelt Ende zu Ende und ein Relay hält keinen Schlüssel. Aber
`check-link-seal.mjs` verbietet eine Mailboxadresse in einer *Protokollzeile*,
weil eine Mailbox eine Beziehung ist — und diese Datei hält **alle auf
einmal**, lesbar für jedes Konto auf dem Rechner des Betreibers. Genau dort
hört „ein weiteres Konto auf dieser Maschine" auf, hypothetisch zu sein.

Nach der Reparatur, gegen denselben laufenden Prozess: `600`, `600`, `600`.

**Eine zweite Kopie, und sie ist begründet.** ADR 0149 RS1 verbietet dem Relay,
`@pico/core` zu erreichen — zu Recht: ein Relay, das einen Store importieren
könnte, ist eines, dem man später beibringen kann, einen zu lesen. Der Zwilling
steht deshalb in `apps/relay/src/database-file-mode.ts` und nennt seinen
Bruder. Zwanzig Zeilen `chmod` sind keine Regel über Pico, und die Grenze ist
mehr wert als die zwanzig Zeilen.

**Und die drei Verzeichnisse daneben.** `depots`, das Arbeitsverzeichnis eines
Depots, und der Kratzplatz eines Lieferanten entstanden mit der Vorgabe. Der
Kratzplatz ist der interessante: der Kopf über ihm sagt, dort packe ein
Extraktor „ein 1,4-GB-Korpus" aus — also **Material der Person**, auf dem Weg
durch fremden Code. Alle drei sagen jetzt `0700`; gegangen ist das
Arbeitsverzeichnis, das gegen ein `755`-Elternverzeichnis `700` herauskommt.

Zwei Pflanzungen: die Verengung im Relaisspeicher entfernt, und ein
Datenverzeichnis, das schon `755` war.

**Was daraus folgt.** B117 war ein Fund, B120 ist seine Nachbarschaft — und die
Nachbarschaft war grösser als der Fund. Wer eine Datei repariert, sollte fragen,
welche anderen dieselbe Herkunft haben; hier waren es vier weitere, davon eine
auf einer Maschine, die dem Betreiber gehört und nicht der Person.

**B119 — Die vierte Ausnahmeliste, und die erste war meine (2026-09-10).**
B118 endete mit der Beobachtung, dass eine Ausnahmeliste eine Behauptung in
zwei Richtungen ist und niemand die zweite aufschreibt. Also nachgesehen, statt
es dabei zu lassen.

**Die vierte stand in meinem eigenen Modul.** `operated-surfaces.mjs` nennt
zwei HTML-Seiten, die niemand bedient — eine Demo und eine Werkzeugvorlage —,
und drei Prüfer lesen die Liste. Gepflanzt: eine der beiden Seiten gelöscht,
die Begründung stehen gelassen.

> **alle drei grün**, und alle drei melden weiter *„2 pages named as not
> operated"* — was dann nicht mehr stimmt.

Sie wirft jetzt, statt zu melden, wie der Ausblender in B109: was eine
Ableitung braucht, prüft sie selbst, und dann kann kein Leser es vergessen.
Dieselbe Pflanzung nennt danach die Seite, in allen drei Prüfern.

**Und dann die Klasse statt des Falls.** Ein Prüfer erklärt sich mit Pfaden —
die ausgenommene Datei, das Dokument, das die Regel trägt. Zieht so eine Datei
um, bleibt die Begründung stehen und liest sich weiter wie eine Tatsache.
Gemessen, bevor die Regel geschrieben war: **122 Pfade stehen in den Prüfern,
und alle 122 kennt das Repository.**

Es ist also kein Fund, sondern ein Netz — dieselbe Wahl wie in B113, wo die
Lücke auch leer war. `vacuity:check` stellt die Frage jetzt an alle Prüfer auf
einmal, statt vierunddreissig Listen einzeln nachzurüsten.

**Zum dritten Mal `const` vor seiner Zeile.** Der neue Block landete unter der
Schlussmeldung, weil ich ihn vor einen Kommentar gesetzt habe, der weiter unten
stand als der Bericht. B114 und B116 waren dieselbe Sache. Die Lehre von B116 —
*was eine Funktion braucht, holt sie sich selbst* — trägt hier nicht: das hier
ist ein Zähler, der in einer Schleife wächst. Für den gilt schlicht, dass
Code auf oberster Ebene in Dateireihenfolge läuft, und ein Bericht am Ende nur
lesen kann, was darüber lief.

**Was daraus folgt.** Vier Ausnahmelisten in zwei Tagen mit derselben
Asymmetrie, und die vierte war meine eigene — geschrieben an dem Tag, an dem
ich die erste gefunden hatte. Eine Regel zu kennen und sie beim Schreiben
anzuwenden sind zwei verschiedene Dinge, und nur das zweite hilft.

**B118 — Zweimal in zwei Tagen driftete eine Zahl, und gefunden hat es beide
Male nur eine Hand (2026-09-10).** `progress.md` trägt achtzehn nachrechenbare
Zahlen. Zweimal hintereinander war eine falsch:

| Tag | behauptet | gemessen | Ursache |
|---|---|---|---|
| 2026-09-09 | 437 | 438 | `picoRelayRefusalName` aus B110 |
| 2026-09-10 | 438 | 439 | `narrowToOwner` aus B117 |

Beide Male hat es **kein Tor** gefunden, sondern dass ich `progress:walk`
aufrief. Ein Werkzeug, das nur läuft, wenn jemand daran denkt, hat genau die
Zuverlässigkeit dessen, der daran denkt — und die war an zwei Tagen zweimal
nicht genug.

**Er wird trotzdem kein Kettenschritt.** Er fährt neun Tore selbst, die
derselbe Auftrag gerade gefahren hat; in die Kette gefaltet liefe die Hälfte
davon zweimal je Lauf. Er läuft jetzt **neben** ihr, im selben Auftrag, nach
`verify:gates`: **21 Sekunden auf 58 Minuten**, und er beantwortet eine andere
Frage als jedes Tor — nicht „stimmt der Baum", sondern *„sagt das
Statusdokument die Wahrheit über ihn"*.

**Und beim Pflanzen fiel die Gegenrichtung auf.** `check-verify-split.mjs`
führt eine Liste dessen, was der Läufer neben der Kette starten darf. Sie sagte
nur, was erlaubt *ist*:

- Schritt ohne Begründung → **fällt**
- Begründung ohne Schritt → **ging durch**

Eine Begründung für etwas, das niemand mehr startet, überlebt damit, was sie
erklärte, und liest sich beim nächsten Mal wie eine Tatsache. Dieselbe
Asymmetrie wie bei den etikettlosen `.sign(` in B106 — dort war sie schon
einmal die halbe Regel, und hier stand sie unbemerkt daneben.

Zwei Pflanzungen, beide sprechen jetzt.

**Was daraus folgt.** Eine Liste von Ausnahmen ist eine Behauptung in zwei
Richtungen, und die zweite schreibt niemand auf. Ich habe sie an diesem
Wochenende dreimal gebraucht: bei den Signierstellen, bei den Pfaden in den
Dokumenten und hier.

**B117 — Die Schlüssel waren sorgfältig, die Datenbank lag offen
(2026-09-10).** Ein echtes Home gestartet und danach hingesehen, statt den Code
zu lesen:

```
755 data
644 data/pico.sqlite
644 data/pico.sqlite-wal
644 data/pico.sqlite-shm
700 data/home-host-keys
600 data/home-host-keys/home_host_signing.key.json
```

Der Schlüsselspeicher setzt `0700` und `0600` ausdrücklich. Die Datenbank, für
die es diese Schlüssel gibt, bekam die Vorgabe von SQLite.

**Der Schutz, den sie hatte, war ein Versehen.** Gegen ein *neues* Verzeichnis
kam `700` heraus — aber nur, weil `mkdirSync(…, { mode: 0o700 })` für den
Schlüsselspeicher den Elternteil unterwegs mit anlegt. Gegen ein vorhandenes
Verzeichnis (Installationsskript, eingehängtes Volume, zurückgespielte
Sicherung) bleibt es `755`, und dann ist die Datei selbst die einzige Grenze —
und die war `644`.

**Es geht nicht nur um Metadaten.** Der Standardzustand für Inhalte ist
`plaintext_foundation`: der Inhalt liegt so, wie er gegeben wurde, solange
niemand einen Domänenschlüssel dafür gewählt hat.

**Die Begleitdateien zählen so viel wie die Datei.** SQLites `-wal` trägt die
Seiten der letzten Schreibvorgänge, `-shm` den Index darauf. Eine Datenbank mit
`600` neben einem Schreibprotokoll mit `644` schützt gestern und nicht heute
früh.

**Die Sicherungen waren die schärfere Hälfte:**

| | vorher | nachher |
|---|---|---|
| `data/pico.sqlite` | 644 | **600** |
| `-wal`, `-shm` | 644 | **600** |
| Sicherungsverzeichnis | 755 | **700** |
| Sicherungsdatei | 644 | **600** |

`db.backup()` legt die Zieldatei mit der Vorgabe an und nicht mit der Fassung
der Quelle: aus einer Quelle mit `600` entstand eine Kopie mit `644`. Wer die
laufende Datei in Ordnung bringt und die Sicherungen vergisst, hat die
Erinnerungen einer Person weiterhin offen liegen, nur unter einem anderen
Namen. Dasselbe beim Zurückspielen.

**Verengt, nie geweitet.** Liegt eine Datei schon bei `0600` oder enger, bleibt
sie — wer enger gestellt hat, hat es so gemeint. Weggenommen werden nur die
Bits, die jemand anders lesen lassen; das kann nichts kaputt machen, was schon
privat war.

**Gehalten von Tests, nicht von einem Tor.** Die Eigenschaft gehört diesen
Dateien und nicht dem Baum — dieselbe Wahl wie in B111. Vier Pflanzungen: die
Verengung im Speicher entfernt, die in der Sicherung entfernt, die
Nur-verengen-Regel umgedreht, und ein Verzeichnis, das schon `755` war.

**Was daraus folgt.** Der Unterschied zwischen „ist geschützt" und „ist
absichtlich geschützt" sieht man nur, wenn man die zweite Bedingung herstellt.
Ein frisches Verzeichnis hätte diesen Befund nie gezeigt; ein vorhandenes
zeigte ihn sofort.

**B116 — Den Läufer nachgestellt: 49 Prüfer, fünf Unterschiede, vier davon
harmlos (2026-09-09).** Nach B115 die Frage, die sich aufdrängt: **welches Tor
fragt sonst noch den Arbeitsplatz?** Nicht überlegt, sondern nachgestellt — ein
frischer Klon von `a2bcc1a` im Scratchpad, kein `dist`, kein `out`, kein
`node_modules`, und darin jeder Prüfer einzeln; danach dieselben hier.

| Prüfer | Unterschied | Urteil |
|---|---|---|
| `check-display-zones` | fällt ohne `node_modules` | er fährt Testmengen; gehört zu `verify:passes` |
| `check-migration-immutability` | „skipped" ohne Tag | mein Klon war flach; CI holt Tags |
| `check-modules`, `check-suppliers` | `ERR_MODULE_NOT_FOUND` | sie laufen in der Kette **nach** `pnpm build` |
| `check-vacuous-gates` | **453 gegen 444 Verzeichnisse** | **echt** |

Der fünfte spiegelt die Gestalt des Baums, damit jeder Prüfer über einer leeren
Kopie nichts findet — und er las dafür das *Arbeitsverzeichnis*. Darin steht,
was gerade offen ist: `.idea/shelf/Uncommitted_changes_before_Update_…`,
`.codex`, `.agents`, `__pycache__`, `.pico-stage`. Neun Verzeichnisse, die auf
einem Läufer fehlen.

**Folgen hatte es keine** — und das ist der Grund, es trotzdem zu ändern. Die
Zahl in der Schlussmeldung war nicht reproduzierbar, und der Gegenstand des
Audits hing daran, welcher Editor hier lief. *Ein Audit, das die eigene
Werkbank spiegelt, prüft die Werkbank mit.* `dist` und `out` standen längst in
der Überspringliste; das war die halbe Antwort. Die ganze ist `git ls-files`.

**Dass sich kein Urteil ändert, ist gemessen und nicht angenommen:** beide
Fassungen mit einer Zeile pro Prüfer instrumentiert und die Listen verglichen —
48 Zeilen, kein Unterschied. Ich hatte aus zwei abgeschnittenen Meldungen
zuerst gelesen, ein Prüfer sei umgekippt; er war es nicht.

**Und derselbe Fehler wie in B114, zwei Stunden später.** Die neue Konstante
stand neben ihrer Funktion, gerufen wird die von oberster Ebene weiter oben:
`ReferenceError: Cannot access 'trackedDirectories' before initialization`.
Zweimal an einem Tag heisst, dass „die Zeile weiter nach oben" die falsche
Absicherung ist. Sie wird jetzt **in** der Funktion geholt: was eine Funktion
braucht, besorgt sie sich selbst, und dann ist ihre Stellung egal.

**Was daraus folgt.** Vier der fünf Unterschiede waren Ordnung — ein Prüfer,
der nach dem Bauen läuft, darf Gebautes brauchen. Der Wert des Versuchs liegt
darin, dass diese vier jetzt *benannt* sind: die nächste Sitzung, die einen
Unterschied zwischen hier und dem Läufer sieht, muss nicht wieder von vorn
anfangen.

**B115 — Vierzehnmal grün aus einem Grund, der nicht im Baum steht
(2026-09-09).** CI hat gemeldet, was hier den ganzen Tag durchlief:

```
docs/development/agent-runbook.md:210: names
apps/companion-shell/out/tray-memory-linux-amd64.json, and there is no such file.
```

Die Datei liegt hier — geschrieben um 15:02 vom Freigabelauf. Sie ist
**`.gitignore` Zeile 14**. Also fragte `docs:check` „liegt hier etwas" und nicht
„gehört das dem Repository", und war auf dieser Maschine grün, weil ein
früherer Lauf etwas hinterlassen hatte.

**Der Kopf dieses Prüfers rühmt sich, keine Ausnahmeliste zu haben** — zu
Recht. Nur war die Regel dafür maschinenabhängig, und das ist die teurere
Schwäche: eine Ausnahmeliste steht im Baum und ist nachlesbar, ein
Bauartefakt nicht.

Gefragt wird jetzt `git ls-files`. Gemessen, was das kostet: von **1.253**
genannten Pfaden sind genau **zwei** dem Repository unbekannt — der Messbericht
oben und die lokale `settings.local.json`. Beide sind **umformuliert statt
ausgenommen**, denselben Weg, den derselbe Absatz schon für den Laufzeitpfad
gegangen ist: Verzeichnis und Datei getrennt genannt, damit die Zeile als das
gelesen wird, was sie ist — eine Ankündigung, keine Wegbeschreibung.

**Die CI-Bedingung lokal nachgestellt**, statt sie zu erschliessen: `out/`
beiseitegeschoben, alter Prüfer, alte Zeile — dieselbe Meldung, Wort für Wort.
(Die Anführungszeichen um den Pfad oben sind aus dem Zitat genommen: die neue
Regel liest jeden Pfad in Backticks, auch einen in einem Codeblock, und sie
hatte recht — dieser Eintrag hat sie beim ersten Kettenlauf selbst
ausgelöst.)
Danach neuer Prüfer, neue Zeile, immer noch kein Bauartefakt: grün.

Zwei weitere Pflanzungen: ein Pfad, den es nie gab, und einer, **der hier liegt
und dem Repository nicht gehört** — der zweite ist der eigentliche Griff, denn
genau den hat die alte Regel durchgelassen.

**Was daraus folgt.** Ein Tor, das den Arbeitsplatz fragt statt den Baum, ist
kein Tor, sondern ein Zufall. Die vierzehn grünen Läufe von heute waren nicht
falsch — sie haben nur eine andere Frage beantwortet als die, die sie zu
stellen glaubten. Und die einzige Stelle, an der das auffiel, war ein Läufer mit
leerem Arbeitsverzeichnis.

**B114 — Der letzte Kettenschritt riss, und die naheliegende Reparatur half
nicht (2026-09-09).** `verify:gates` fiel im **letzten** Schritt:

```
Error: ENOTEMPTY: directory not empty, rmdir '/tmp/pico-companion-nohost-…'
  at removeTemporaryRoot (verify-linux-package.mjs:777)
```

Die Ursache steht dreissig Zeilen über der Probe **in derselben Datei**: ein
privater Bus aktiviert `xdg-desktop-portal` bei Bedarf, und der aktivierte
Dienst *überlebt den Begleiter*. Sein `XDG_CACHE_HOME` zeigt in genau dieses
Verzeichnis — `rmSync` löscht die Kinder, der Dienst legt eines nach, `rmdir`
scheitert. Ein Rennen im letzten Schritt der Freigabekette.

**Erst gemessen, ob es sporadisch ist**, statt zu reparieren, was man einmal
gesehen hat: derselbe Schritt lief unmittelbar danach allein mit Ausgang 0
durch. Sporadisch heisst hier: es kippt eine Freigabe an dem Tag, an dem es
kippt.

**Und dann half die naheliegende Reparatur nicht.** Node bietet `maxRetries`
ausdrücklich für `ENOTEMPTY` an. Nachgestellt gegen einen fremden Prozess, der
weiterschreibt:

| | Schreiber 0,5 s | Schreiber 3 s |
|---|---|---|
| einmal (wie bisher) | `ENOTEMPTY` nach 0,12 s | `ENOTEMPTY` nach 0,12 s |
| `maxRetries: 6, retryDelay: 100` | `ENOTEMPTY` nach **2,2 s** | `ENOTEMPTY` nach 2,2 s |
| ganzer Gang wiederholt | **entfernt nach 0,72 s** | **entfernt nach 3,3 s** |

`maxRetries` wiederholt die *fehlgeschlagene Operation* — das `rmdir` auf einem
Verzeichnis, dessen neue Kinder der Gang nie wieder ansieht. Es half in **keinem**
Fall, und es hätte zwei Sekunden gekostet, um dann doch zu fallen. Nebenbei
gemessen: Nodes Rückzug ist linear, `maxRetries: 20` sind **21 Sekunden**, nicht
zwei — der erste Kommentar, den ich dazu geschrieben hatte, behauptete zwei.

Wiederholt wird jetzt der **ganze Gang**, bis er durchgeht oder zehn Sekunden um
sind. Danach fällt es weiter: ein Verzeichnis, in das nach zehn Sekunden noch
geschrieben wird, ist eine Auskunft und kein Aufräumproblem.

Die eingebaute Funktion selbst gegangen, nicht nur das Muster daneben:

| Schreiber | wie vorher | mit der Funktion aus dem Baum |
|---|---|---|
| 0,5 s | `ENOTEMPTY` nach 127 ms | **entfernt nach 795 ms** |
| 3 s | `ENOTEMPTY` nach 106 ms | **entfernt nach 3238 ms** |

**Und dann riss die Kette ein zweites Mal, an der Reparatur selbst.** Die
Frist stand als `const` neben ihrer Funktion, und `const` wird nicht
hochgezogen: der erste Aufruf kommt aus `verifyDebianLifecycle`, das in Zeile
106 läuft — lange bevor Zeile 810 ausgewertet wäre.

```
ReferenceError: Cannot access 'temporaryRootRemovalDeadlineMs' before initialization
```

Die herausgelöste Wanderung hat das nicht gesehen, weil ich die Konstante
**mit** der Funktion herausgelöst hatte: ein Ausschnitt, der seinen Kontext
mitbringt, prüft nicht den Kontext. Die Frist steht jetzt oben bei den anderen
Konstanten, mit dem Grund daneben.

**Was daraus folgt.** Zweierlei, und das zweite ist unangenehmer. Erstens: eine
Bibliotheksoption, die genau den Fehlernamen nennt, den man hat, ist die
überzeugendste falsche Fährte, die es gibt — sie stand in der Dokumentation,
sie nannte `ENOTEMPTY`, und sie tat nichts. Zweitens: **eine Wanderung an einem
herausgelösten Stück ist keine Wanderung am Baum.** Sie hat die Semantik
bewiesen und die Einbettung nicht, und die Einbettung war der zweite Fehler.

**B113 — Die zweite genannte Lücke, und diesmal war sie leer (2026-09-09).**
B112 kam aus einer Lücke, die der Zeitpunktprüfer selbst aufgeschrieben hatte.
Derselbe Kopf nennt eine **zweite**:

> *„Drei seiner fünf Regeln greifen über einen **Namen**: ein zeitförmiges Feld
> endet auf `At`, oder heisst `validUntil`, oder `validFrom`. Eine Frist, die
> `when`, `deadline` oder `expiry` heisst, ist allen dreien unsichtbar."*

Gemessen: **vierzehn** zeitklingende Zeichenkettenfelder stehen ausserhalb der
drei Namen, und **sechs davon sind wirklich Zeitpunkte** — `freshUntil`,
`sinceIso`, `wallTime`, `delegationValidUntil`, `delegationValidFrom`,
`firstDeviceDelegationValidUntil`. Die anderen acht sind Fehltreffer meiner
Suche (`derivedFromSupplier` ist ein Lieferant, `renewFromOtherDeviceLabel` ein
Satz).

**Und keiner der sechs wird roh gezeigt, auf einen UTC-Tag geschnitten oder mit
einer eigenen Regel beurteilt.** Die Lücke ist leer — anders als bei B112, wo
zwei darin lagen.

Ein leerer Befund, und trotzdem nicht nichts: die Lücke bleibt nicht von selbst
leer. `instantSlice` kannte `Until` bereits, die Interpolationsregel daneben
nicht — dieselbe Frage, zwei Regeln, eine davon enger. Jetzt beide, dazu `Iso`,
und `Until` nur am Wortende, damit `validUntilDisplay` (ein fertiger Satz,
kein Zeitpunkt) draussen bleibt.

Gemessen statt behauptet, dass die Weitung etwas ändert — dieselbe Pflanzung,
zwei Leser:

> **alter Prüfer:** `Instant rules check passed …` — Ausgang 0
> **neuer Prüfer:** `puts \`freshUntil\` into a string raw`

Zwei Pflanzungen, `freshUntil` und `sinceIso`, beide in einem Satz für eine
Person.

**Was daraus folgt.** Zwei Lücken an einem Tag, beide vom Prüfer selbst
benannt, eine voll und eine leer. Das Verhältnis ist die eigentliche Auskunft:
**eine aufgeschriebene Lücke ist eine Wette, und die Hälfte davon gewinnt.** Wer
sie aufschreibt, hat die Arbeit schon zur Hälfte getan — nachsehen ist der Rest,
und niemand hatte es getan.

**B112 — Der 30. Februar war ein gültiger Ablauf (2026-09-09).** Der
Zeitpunktprüfer hat seine eigene Lücke seit dem 2026-08-21 im Kopf stehen:

> *„Eine zehnte, als Breite plus `Date.parse` geschrieben, käme durch — und
> wäre auf dieselbe Weise falsch."*

**Genau zwei standen so im Baum.** Gegangen statt vermutet, gegen den gebauten
Paketleser:

```
2026-02-30T00:00:00.000Z: isPicoInstant=false  aufRaster=true
  ANGENOMMEN -> gespeichert als 2026-02-30T00:00:00.000Z
                | echter Zeitpunkt 2026-03-02T00:00:00.000Z
```

`parsePicoLinkPacket` nahm einen Tag an, **den es nicht gibt** — und speicherte
ihn als diese Zeichenkette, während sein wirklicher Zeitpunkt zwei Tage später
liegt. Die Ablaufvergleiche des Relays sind Zeichenkettenvergleiche, also sagt
der Speicher etwas anderes als die Uhr. Und ein unmöglicher Tag ist obendrein
genau der **einmalige Wert**, den das Raster aus ADR 0147 aus einem Ablauf
herausnimmt, damit ein Ablauf kein Fingerabdruck wird.

Dasselbe in `device-recovery-ceremony.ts` für `validFrom`/`validUntil` einer
Vollmacht.

**Warum der Prüfer sie nicht sah.** Seine Regel keyt auf `toISOString() === x`
— die *Rundlauf*-Form, aus der sie 2026-08-20 herausgelöst wurde. Die zweite
Gestalt ist ein Breitenmuster; das ist keine andere Schreibweise derselben
Sache, sondern die andere Hälfte. `instant.ts` sagt es selbst: *„The shape
check alone would still admit impossible dates."*

**Gefunden über einen Umweg, der sich gelohnt hat.** Erst gemessen, wie oft ein
regulärer Ausdruck in mehr als einer Datei steht: **13 von 46**. Die
mechanische Lesart — „gleiches Literal, also dieselbe Regel" — wäre falsch
gewesen: 48 Stellen schreiben ein exportiertes Muster von Hand, und **44 davon
sind Formgleichheit ohne Begriffsgleichheit** (`/^[0-9a-f]{64}$/` ist ein
Fingerabdruck, ein Schlüsselabdruck und ein Commit). Vier waren echte Kopien
derselben Aussage, drei davon der kanonische Zeitpunkt.

**Ein Literal ist keine Regel.** Deshalb prüft die neue Regel *einen* Begriff
und nicht die Form: wer die kanonische Breite hinschreibt, statt
`isPicoInstant` zu fragen, schreibt die Regel ein zweites Mal.

In `packages/identity` stand die Breite **neben** `isPicoInstant` — nicht
falsch, aber zwei Zeilen, die dasselbe sagen. Befund B52 hat sie dort
hinzugefügt, als die Rundlaufhälfte allein stand; jetzt trägt die eine Antwort
beide Hälften, und die Breite geht wieder heraus.

Drei Pflanzungen: die zweite Fassung im Paketleser wiederhergestellt, die
Ausnahme für `instant.ts` entfernt (dann fällt es selbst), und ein
Regressionstest für den 30. und 29. Februar 2026 — zwei Tage, die es nicht
gibt.

**B111 — Dieselbe Tür, dieselbe Stille (2026-09-09).** B110 hat die
Postfachtür des Relays repariert. Die Betreibertür daneben antwortet auf einen
inneren Fehler mit `500 {"error":"operator_request_failed"}` — nach aussen
richtig, ein Name und sonst nichts. **Nach innen sagt sie gar nichts.**

Die Postfachtür hat den Satz dazu in ihrem eigenen Kopf stehen:

> *Das Schweigen nach aussen ist Absicht, das nach innen war keine — der
> Betreiber hatte für jeden 500er nichts in der Hand, obwohl dieses Relay
> einen Protokollweg hat.*

Gemessen: **siebzehn Ereignisnamen** kennt das Relay, und keiner davon gilt
einer gescheiterten Anfrage an der Tür, **die der Betreiber selbst benutzt**.
`relay_request_failed` gibt es nur auf der Postfachseite.

Sie sagt jetzt `operator_request_failed` mit einem Grund, gefiltert durch
dasselbe Prädikat wie nebenan — eine freie Meldung trägt Pfade, auch in einem
Protokoll.

Gehalten von einem Test statt von einem Tor: die Eigenschaft gehört einer
Fläche und nicht dem Baum, und die Postfachtür wird von ihrem Zwilling in
`server.test.ts` genauso gehalten. Zwei Pflanzungen: die Protokollzeile
entfernt, und die freie Meldung statt des Namens durchgereicht.

**Was daraus folgt.** Ein Kopf, der eine Lehre aufschreibt, hält sie für *seine*
Datei. Die Datei daneben liest ihn nicht. Nach B110 ist das die zweite Stelle
an einem Tag, an der derselbe Satz an einer Tür stand und an der nächsten
fehlte — und beide Male war die zweite Tür die ungeprüfte.

**B110 — „Refusal names travel; nothing else does" — und der Anrufer bekam den
Pfad der Datenbank (2026-09-09).** Ein Satz stand als Kommentar über dem Code,
und der Code hielt ihn nicht. **Gegangen gegen einen laufenden Relaisserver**,
nicht gelesen und vermutet:

```
400 {"error":"ENOENT: no such file or directory, open /home/somebody/relay.sqlite"}
```

Der absolute Pfad der Relaisdatenbank, an **jeden, der anklopft** — die
Postfachtür braucht kein Konto. Drei Zeilen über dem Fang steht der Satz, der
das ausschliesst.

**Warum es niemand sah.** Der äussere Fang — der für alles, was *vor* dem
Antwortpfad bricht — filtert längst: `reason: /^[a-z0-9_]+$/.test(message) ?
message : 'unnamed_failure'`, und ein Test hält das fest. Der innere Fang
umschliesst `answer(...)`, also **jede Speicherberührung der Route**, und gab
weiter, was kam. Dieselbe Wahrheit, einmal geschrieben und einmal nicht — die
Naht, die diese Sitzung seit B96 verfolgt.

Der bestehende Test zielte auf `isActiveAccount`, und das steht **vor** dem
inneren Fang; deshalb sah er 500 und ein sauberes `relay_failed`. Eine Zeile
tiefer, `mailboxFor` innerhalb von `answer`, und die Antwort war eine andere.

**Ein Prädikat, an allen Türen.** `picoRelayRefusalName(error, fallback)` gibt
die Meldung nur weiter, wenn sie ein Name ist — `mailbox_unknown`,
`pico_link_packet_carries_no:body` — und sonst den Rückfallnamen. Der Zusatz
hinter dem Doppelpunkt nennt ein Feld der Anfrage des Anrufers, also eine
Tatsache, die er schon hat. Benutzt an sechs Stellen: die Postfachtür (Protokoll
**und** Antwort) und die vier der Betreibertür. Alle 85 Relaistests bleiben
grün, also lässt das Prädikat jede Ablehnung durch, die das Produkt wirklich
gibt.

**Das Home hatte dieselbe Stelle zweimal**, und dort ist die Antwort eine
andere: die acht Sätze in `operator-store.ts` sind *für eine Person
geschrieben* („Operator passphrase must be at least 12 characters."). Sie
heissen jetzt `OperatorRequestError`, und die zwei Routen geben nur diese
Klasse weiter. Was eine Bibliothek sagt, ein `TypeError`, ein SQLite-Fehler —
alles andere wird zu *„That was not accepted."* `/api/auth/operator` erreicht
man mit einem Bootstrap-Code und ohne Sitzung.

**Die Regel steht im Siegelprüfer**, weil es dieselbe Frage ist wie seine
beiden anderen: was verlässt diesen Prozess? Sieben Antworten geben etwas aus
einem Fehler weiter, jede davon begrenzt — durch einen benannten Filter oder
durch eine Fehlerklasse, die dieses Produkt selbst geschrieben hat.

**`instanceof Error` zählt nicht**, und das hat eine Pflanzung gelehrt: der
erste Anlauf der Regel nahm `error instanceof Error ? error.message : 'x'` an.
Jeder Fehler ist ein `Error`; das ist keine Aussage, sondern eine Formalität.

Vier Pflanzungen: der Filter am Relais entfernt (fällt jetzt), das `instanceof`
im Home entfernt, `instanceof Error` als Feigenblatt, und der Leerlaufwächter.
Dazu ein Regressionstest, der die Wanderung selbst ist — er fällt ohne den
Filter mit `expected { Object (error) } to deeply equal { error:
'invalid_request' }`.

**Was daraus folgt.** Ein Kommentar, der eine Eigenschaft behauptet, ist die
Stelle, an der man sie messen sollte — nicht der Beweis, dass sie gilt. B107 hat
das für Prosa über Code gezeigt; hier stand die Prosa **direkt darüber** und
war trotzdem falsch.

**B109 — Die Probe stand in einem Prüfer, und vier benutzten den Leser
(2026-09-09).** B108 hat einen Fehler im gemeinsamen Spannenleser gefunden und
die Klammerprobe als Regel dagegen gesetzt — **in `tests:check`**. Drei andere
Prüfer benutzen denselben Leser und hatten sie nicht. Eine Probe, die man
mitnehmen muss, ist eine, die jemand vergisst.

**Sie wohnt jetzt im Leser selbst.** `blankStringsAndComments(source, where)`
prüft nach dem Ausblenden die Klammern und wirft mit dem Dateinamen; `where`
ist Pflicht, damit die Meldung sagt, welche Datei nicht aufging. Gepflanzt —
den Ausblender wieder blind für reguläre Ausdrücke gemacht — sprechen jetzt
**zwei** Prüfer, jeder mit seiner Datei:

> `pico_source_span_unbalanced: apps/companion-shell/src/model-providers.test.ts
> does not balance after blanking (1 parentheses, -3 braces)`

**Und dann der zweite Leser.** `check-link-seal.mjs` zählte seine Klammern
selbst — auf einer Fassung, die **Kommentare stehen liess** und reguläre
Ausdrücke für Zeichenketten hielt. Dieselbe Klasse wie B108, nur an einer
zweiten Stelle. Gemessen: **3 von 1.874 Senkenzeilen standen in Prosa**, etwa

```
// reach the append-only log (ADR 0075 A9).
```

`log (` ist für das Muster ein Protokollaufruf. Harmlos, sagte ich — und habe
es dann **nachgestellt statt behauptet.** Ein Kommentar mit einer *offenen*
Klammer:

```
// Betreiber-log (ADR 0075 A9 und die Notiz darunter.
function plantedProse(passphrase: string): string {
```

> **alter Prüfer:** `a secret a person gave or a plaintext this product holds
> must not reach a logger handed in as a function`
> **neuer Prüfer:** grün

Ein Fehlalarm über ein Wort in einem Kommentar, drei Zeilen über einem
Parameternamen. Der Prüfer sagt in seinem eigenen Kopf, warum das zählt: *„a
check whose failures are mostly wrong teaches people to skip it."*

**Die Vierzig-Zeilen-Grenze fällt damit weg.** Eine Spanne, die an ihrer eigenen
Klammer endet, braucht keine Obergrenze — und die Obergrenze war die zweite
Fehlerrichtung, die B105 und B106 an anderen Stellen gefunden haben. Gelesen
wird weiter auf der Fassung **mit** den Interpolationen, denn `${inbound}` ist
genau das Leck, das hier gesucht wird: zwei Sichten, zwei Aufgaben, und das
bleibt begründet.

Der Prüfer nennt jetzt seinen Gegenstand: **3.476 Treffer eines Senkenmusters**,
jeder bis zu seiner eigenen schliessenden Klammer gelesen — und meldet einen
Fehler, wenn es keinen gäbe.

Kein neuer Kettenschritt; `link:check` kostet 570 ms, `tests:check` 790 ms.

**Was daraus folgt.** Ein Werkzeug, das mehrere Prüfer schärfer macht, ist ein
gemeinsamer Einzelpunkt: sein Fehler ist der Fehler aller. Die Probe gehört
deshalb nicht neben das Werkzeug, sondern **hinein** — und ein zweites Werkzeug
mit derselben Aufgabe gehört zusammengelegt, sobald man es findet.

**B108 — Zweitausendsiebenhundert Tests behaupten etwas, und mein eigener
Leser log über vier Dateien (2026-09-09).** B107 hat gefragt, welche *Regel*
einen Gegenstand hat. Dieselbe Frage an die Tests: **ein `it`, das seinen
Gegenstand aufruft und nichts behauptet, ist grün, solange nichts wirft** — und
grün ist genau das, was niemand nachliest.

Vier Eigenschaften gemessen, alle vier schon wahr:

| Frage | Befund |
|---|---|
| Behauptet jeder Test etwas? | **2.796 von 2.796** |
| Hat jede Behauptung einen Matcher? | **8.848 von 8.848** |
| Steht ein `.only`, `.skip` oder `.todo` im Baum? | **keines** |
| Gibt es eine Testdatei ohne Test? | **keine** |

Das dritte ist das schärfste: **ein einziges `it.only` schaltet alle übrigen
Tests derselben Datei ab**, und der Lauf meldet weiter grün — ein grüner Lauf,
der fast nichts gefahren hat.

**Zwei falsche Messungen davor, beide vor dem Schreiben gefunden.** Der erste
Anlauf meldete 57 stumme Tests: er kannte `expectAppearanceError(...)` nicht
und las bei `it.each(table)(name, fn)` nur den *ersten* Aufruf der Kette. Der
zweite meldete neun — alle neun waren `pattern.test(x)`, denn ein `\b` vor
`test` steht auch hinter einem Punkt. Die Helfer sind jetzt abgeleitet: eine
Funktion, in deren **eigenem** Rumpf `expect(` steht, Rumpf bis zur
schliessenden Klammer und nicht bis zu einer Zeilenzahl.

**Und dann log mein eigener Leser.** `source-spans.mjs`, gestern in B105
geschrieben und seither von B106 und B108 benutzt, kannte keine regulären
Ausdrücke:

```
/<section id="admin-section"[^>]*\shidden/
```

Zwei Anführungszeichen — für den Ausblender beginnt hier eine Zeichenkette, die
bis irgendwohin läuft. Gefunden mit einer Frage, die nichts kostet: **gehen
nach dem Ausblenden die Klammern noch auf?** Vier von 511 Dateien gingen nicht
auf. Nach der Reparatur alle 599.

Was das versteckt hatte, ist gemessen und nicht geschätzt:

| | vor der Reparatur | danach |
|---|---|---|
| Testfälle | 2.788 | **2.796** |
| Behauptungen | 8.822 | **8.848** |

Acht Testfälle und sechsundzwanzig Behauptungen waren für den Leser nicht da.
`labels:check` und `label:check` melden unverändert — dort lag keine dieser
vier Dateien.

**Die Frage ist jetzt eine Regel:** der Prüfer prüft zuerst sich selbst und
verlangt von jeder der 511 Quellen, dass ihre Klammern nach dem Ausblenden
aufgehen. Ein Ausblender, der etwas falsch liest, macht *jede* Spanne in dieser
Datei unzuverlässig — still, denn ein zu langer Rumpf enthält eher mehr
Behauptungen und nicht weniger.

`pnpm tests:check`, Kettenschritt 48, Kette jetzt **51**, 730 ms — das teuerste
der neuen Tore, und es liest 511 Dateien.

Sechs Pflanzungen: ein Test ohne Behauptung, ein `it.only`, ein `expect` ohne
Matcher, eine Testdatei ohne Test, der wieder kaputtgemachte Ausblender und der
Leerlaufwächter.

**Was daraus folgt.** Ein Werkzeug, das andere Prüfer schärfer macht, ist selbst
ein Prüfer und braucht dieselbe Behandlung. Die Klammerprobe hat drei Zeilen
gekostet und hätte den Fehler am Tag seiner Entstehung gefunden.

**B107 — Eine Regel, die seit ihrem ersten Tag nichts gelesen hat
(2026-09-09).** B105 und B106 haben Spannen repariert. Die Frage dahinter ist
grösser: **welche Regel hat überhaupt einen Gegenstand?** Der Leerlaufprüfer
beantwortet das je *Skript* — 47 Prüfer verweigern über einem leeren Baum. Er
sagt nichts über die einzelne **Regel** darin.

Also die Zahlen aus allen 47 Tormeldungen eines Laufs gesiebt. Fünf Nullen,
vier davon gut („0 unauflösbare Ausdrücke", „0 von Hand ausbuchstabierte
Vereinigungen"). Die fünfte:

> `0 present-tense absence claims and 0 nothing-is-built claims, each still true`

**Vier solche Behauptungen stehen im Baum**, und die Regel traf keine. Sie
liest seit ihrem ersten Tag nichts. Drei Gründe, jeder für sich genug:

| | |
|---|---|
| **Sie las nur die Matrix** | Drei der vier stehen in ADRs — und dort ist die Gefahr dieselbe |
| **„has no *product* caller" traf sie nicht** | Ein Wort dazwischen, und die Behauptung ist unsichtbar |
| **Sie nahm den falschen Namen** | Das Muster beginnt an der *frühesten* passenden Stelle, griff also das erste Backtick im Satz: aus „… ist in `shippedModuleManifests` registriert … und `recordPicoConnectorObservations` hat keinen Aufrufer" wurde eine Behauptung über `shippedModuleManifests` |

Gemessen statt behauptet — ein Produktaufrufer für
`startPicoCompanionLinkRelaySweep` gepflanzt, dessen ADR 0149 sagt, es gebe
keinen:

> **alter Prüfer:** `… 0 present-tense absence claims …` — Ausgang 0
> **neuer Prüfer:** `docs/architecture/0149-…: says
> \`startPicoCompanionLinkRelaySweep\` has no caller, and the tree calls it`

Die Regel liest jetzt **246 verfolgte Dokumente**, findet den Satz zuerst und
sucht den Namen **rückwärts**, und sie erlaubt ein Wort dazwischen. Vier
Behauptungen, alle vier noch wahr:
`recordPicoConnectorObservations` (zweimal), `SupplierCredentialCrypto`,
`startPicoCompanionLinkRelaySweep`.

**Die Schlussmeldung sagt jetzt den Korpus mit.** Eine Null über 246 Dokumenten
ist eine Aussage; eine Null über keinem ist keine — und genau so las sich die
alte Zeile, als wäre nichts zu finden gewesen.

**Was daraus folgt, und es ist der grössere Teil.** `vacuity:check` prüft
Prüfer, nicht Regeln. Eine Regel kann in einem Prüfer sitzen, der über einem
leeren Baum sauber verweigert, und trotzdem über dem *echten* Baum nichts
sehen. Die Zahlen der Tormeldungen sind der billigste Zugang dazu: **jede Null
in einer Erfolgsmeldung ist entweder ein Befund oder ein leerer Gegenstand,
und die beiden sehen gleich aus.** Vier waren Befunde, eine war leer.

Zwei Pflanzungen: der Aufrufer für eine wahre Behauptung (einmal gegen den
alten, einmal gegen den neuen Leser) und der Korpus selbst leergelaufen.

**B106 — Zehn Signierstellen sah niemand, und eine elfte hätte sich das
Etikett des Nachbarn geliehen (2026-09-09).** B105 hat eine Spanne repariert,
die zu lang war. Die nächste Frage lag auf der Hand: **wo noch?** Der
Signaturprüfer las über ein Fenster von achthundert Zeichen — und ADR 0106 ist
keine Kosmetik, das Etikett wählt den Bauer, der die Bytes macht.

**Erstens: das Fenster borgt.** Ein `.sign(` ohne eigenes `label:` nimmt das
des *nächsten* Aufrufs. Gemessen statt behauptet — ein etikettloser `.sign(`
direkt über einem etikettierten in `packages/vault/src/index.ts`, dann der
**alte** Prüfer über denselben Baum:

> `Signature-label check passed (23 signing calls name a protocol label
> constant …)` — Ausgang 0.

Dreiundzwanzig statt zweiundzwanzig, und die dreiundzwanzigste war ein Aufruf,
der überhaupt kein Etikett nennt. Der Kopf des Prüfers argumentierte die *eine*
Hälfte der Gefahr — ein Etikett zu weit weg fiele heraus — und schwieg zur
anderen. Die Spanne endet jetzt an ihrer eigenen Klammer.

**Zweitens: zehn Signierstellen standen nie zur Debatte.** Die beiden
Gerätezeremonien unterschreiben durch einen Weiterleiter:

```ts
async function signWithExactKey(client, input) {
  const signed = await client.sign(input);   // <- der Prüfer sieht nur das
```

Das Etikett nennen die **fünf Aufrufer je Datei**, und für die galt ADR 0106
bis heute ungehalten. Alle zehn nennen eine Konstante — aber ein Literal dort
wäre nie aufgefallen, und **das ist genau der Fehler, den B36 an anderer Stelle
gefunden hat**: `grantPicoCompanionDomainRead` gab als Familiennamen einen Satz
weiter, und der Daemon lehnte bei jedem Druck ab, seit es den Knopf gibt.
Gepflanzt: ein Literal an der Aktivierungsstelle — der Prüfer nennt es jetzt.

Die Ableitung ist mechanisch und nicht gelistet: `.sign(X)` mit einem blossen
Bezeichner als einzigem Argument macht die umschliessende Funktion zum
Weiterleiter, und ihre Aufrufer mit `label:` sind Signierstellen.

**Drittens: fünf `.sign(` tragen gar kein Etikett** und wurden schweigend
übersprungen. Schweigend heisst: nie angesehen. Jetzt stehen sie einzeln, mit
Grund und mit Anzahl:

| Stelle | Warum sie kein Etikett trägt |
|---|---|
| `apps/core/src/link-push-send.ts` | unterschreibt fertige Bytes aus `buildPicoLinkPushSignatureInput` — eine kanonische Form, keine Familie mit Feldern |
| `apps/vault-daemon/src/cli.ts` | der allgemeine `sign`-Befehl: das Etikett kommt aus einem Schalter, und der Daemon lehnt einen unbekannten Namen ab |
| `apps/vault-daemon/src/daemon.ts` | die Grundfunktion eine Ebene unter den Familien — die Bytes sind schon gebaut |
| `device-lifecycle-ceremony.ts` | der Weiterleiter selbst; seine fünf Aufrufer werden geprüft |
| `device-recovery-ceremony.ts` | derselbe Weiterleiter, fünf eigene Aufrufer |

Erscheint eine sechste, schlägt das fehl, statt still zu wachsen — und eine
Begründung für etwas, das verschwunden ist, ebenfalls.

**Die Zahl bewegt sich: 25 → 35 Signierstellen** (29 vollständig beurteilte,
sechs, deren Bewilligung an der Schlüsselrolle hängt). Kein neuer
Kettenschritt; `label:check` gab es schon.

Fünf Pflanzungen: ein Literal an einer Weiterleiter-Stelle, die Borgprobe
(einmal gegen den alten und einmal gegen den neuen Leser), eine entfernte
Begründung, eine Begründung für etwas, das es nicht gibt, und der
Leerlaufwächter der Weiterleiter.

**Was daraus folgt.** B105 war kein Einzelfall. Ein Prüfer, der über ein
Fenster fester Länge liest, hat **zwei** Fehlerrichtungen, und die laute wird
gern aufgeschrieben, während die stille — der Nachbar entlastet — dort steht,
wo niemand hinsieht. Von den sechs Fenstern im Baum sind jetzt zwei durch
Klammerzählung ersetzt; die übrigen vier sind angesehen und tragen.

**B105 — Drei Eigenschaften, dreimal schon wahr, und eine Pflanzung, die nicht
feuerte (2026-09-09).** Nach B104 drei Nachbarfragen an dieselben Flächen. Alle
drei waren beim Messen sauber:

| Frage | Befund |
|---|---|
| Sagt jeder Knopf, was ein Druck tut? | **81 von 81** tragen ein `type` |
| Fängt jedes Formular sein eigenes Absenden? | **10 von 10**, alle mit `preventDefault` |
| Ist ein Feld, dessen Name ein Geheimnis ansagt, ein Passwortfeld? | **5 von 5** |

Warum die drei zählen, je in einem Satz:

- Ein `<button>` ohne `type` ist `submit`. Steht er in einem Formular, sendet
  ein Druck auf „Vergessen" das Formular ab, **statt zu vergessen** — ein
  Fehler, den man nicht sieht, sondern erlebt. Und der Baum hat solche Knöpfe:
  `recall-grant` steht in `recall-form`.
- Ohne Absende-Zuhörer lädt die Eingabetaste in einem Textfeld die Seite neu.
  Im Begleiterfenster heisst das: **der Zeichner fängt von vorn an, mitten in
  einer Entscheidung.**
- Ein Geheimnisfeld ohne `type="password"` steht im Klartext auf dem Schirm und
  in dem, was der Browser wiederherstellt.

**Und dann feuerte eine Pflanzung nicht.** Dem `submit`-Zuhörer von
`shred-form` sein `preventDefault` genommen — der Prüfer meldete **grün**. Die
Regel las den Zuhörer über ein Fenster von 400 Zeichen, und darin lag das
`preventDefault` des *nächsten* Zuhörers.

Das ist die Klasse von B96 noch einmal: **eine Spanne, die nicht dort endet, wo
ihr Gegenstand endet, entlastet den Nachbarn.** Die Spanne endet jetzt an ihrer
eigenen Klammer, gezählt auf einer Fassung, in der Zeichenketten und Kommentare
in *einem* Durchgang ausgeblendet sind — getrennte Ersetzungen verrutschen an
genau zwei Stellen, einem Apostroph in einem Kommentar und einem `//` in einer
Zeichenkette. Dieselbe Pflanzung spricht danach mit Formular und Folge.

Wäre die Pflanzung nicht gesetzt worden, stünde hier eine Regel, die nie etwas
finden kann, und darüber die Zeile „10 von 10". **Eine Pflanzung, die man nicht
nachsieht, ist keine** — und eine, die schweigt, ist der einzige Grund, warum
diese Regel heute etwas hält.

`scripts/source-spans.mjs` ist neu und trägt beides mit Grund. **Warum
`check-link-seal.mjs` seinen eigenen Filter behält**, steht darin: der braucht
das Gegenteil — er *erhält* den Inhalt von `${...}`, weil er darin nach Namen
sucht. Zwei Anforderungen, nicht dieselbe Wahrheit zweimal.

Kein neuer Kettenschritt: die drei Regeln stehen in `labels:check`, weil es
dieselben Flächen, dieselben Bedienelemente und dieselbe Ableitung sind. Der
Prüfer kostet jetzt 240 ms statt 150.

Sechs Pflanzungen: ein Knopf ohne `type` im HTML, einer im Code, ein Formular
ohne Zuhörer, ein Zuhörer ohne `preventDefault` (der, der schwieg), ein
Geheimnisfeld im Klartext und der Leerlaufwächter.

**B104 — Das Fenster antwortet auf jeden Druck, und ein Screenreader hört
nichts davon (2026-09-09).** ADR 0118 O4 verlangt: *was eine Person drückt,
antwortet immer.* Das Fenster hält das — **sichtbar**. Elf seiner dreizehn
Antwortfächer standen ausserhalb jedes lebendigen Bereichs. Die Antwort wurde
also **hingeschrieben und nie gesagt**.

| Fläche | Antwortfächer | in einem lebendigen Bereich |
|---|---|---|
| Dashboard | 11 | **11** |
| Begleiterfenster | 13 | **2** |

**Es ist keine unbekannte Regel.** Dasselbe Produkt macht es auf der anderen
Fläche vollständig richtig: jedes Antwortfach des Dashboards trägt
`role="status" aria-live="polite"`. Dieselbe Wahrheit, an zwei Orten
geschrieben, ist an einem abgefallen — und nichts hat es bemerkt, weil ein
fehlender lebendiger Bereich **nichts kaputt macht. Er macht still.**

Was ein Mensch ohne Blick auf die Seite nicht hörte: *„Removed, and its files
are off this machine."*, *„That was not accepted."*, *„Measuring. That takes
several minutes …"* — sechzehn Sätze allein im Depot-Fach.

**Der Prüfer und die drei verworfenen Unterscheidungen.** Was ein Antwortfach
*ist*, musste abgeleitet werden statt geraten, und drei Anläufe sind vorher
gemessen und verworfen worden, weil jeder an einer der beiden Flächen falsch
lag:

| Unterscheidung | Woran sie scheiterte |
|---|---|
| die Kennung endet auf `-status` | das Dashboard hat drei davon, die einen Wert zeigen statt einer Antwort |
| Prosa statt Zahl geschrieben | blind, sobald eine Hilfsfunktion schreibt — das halbe Dashboard |
| steht in einem Druck-Zuhörer | blind gegen das Ansichtsobjekt des Dashboards, das den Druck nur weiterreicht |

Was trägt, sind **drei Merkmale zusammen**, die beide Flächen selbst tragen:
die Kennung endet auf `-status`, das Element ist in der HTML-Datei **leer** (es
hält keinen Inhalt, es wartet auf eine Nachricht), und ein Zeichner schreibt
Text hinein. Damit fallen die drei Wert-Anzeigen des Dashboards von selbst
heraus, ohne eine einzige begründete Ausnahme.

**Vererbung zählt mit.** `aria-live` erbt, also fragt der Prüfer die ganze
Vorfahrenkette; sonst meldete er die vier Fächer des obersten Statusblocks als
stumm, die in einem `aria-live="assertive"` sitzen. Dass das keine Zierde ist,
ist gegangen: dasselbe Element, selbst stumm, fällt durch — und besteht, sobald
sein `<section>` lebendig wird.

**Was nicht geprüft wird:** ob `polite` oder `assertive` richtig ist und ob der
Satz gut ist. Das sind Urteile. Hier steht, dass eine Antwort überhaupt eine
Chance hat, anzukommen.

`pnpm answer:check`, Kettenschritt 47, Kette jetzt **50**, 140 ms. Vier
Pflanzungen: ein Fach im Fenster wieder stumm, eines auf dem **Dashboard**, die
Vererbungsprobe und der Leerlaufwächter.

**`operated-surfaces.mjs` trägt jetzt drei Prüfer** — die Flächen, die zwei
unbedienten mit Grund, und seit heute auch die Ableitung, wer auf eine Fläche
zeichnet.

**B103 — Elf Namen versprachen ein Aussehen, und der leiseste war der lauteste
(2026-09-09).** B102 hat gefragt, wo die Bedienelemente herkommen. Dieselbe
Frage eine Drehung weiter: **die Namen, die sie tragen — hält die jemand?**

Gemessen: das Begleiterfenster trug **elf Klassennamen, die in keinem Stilblatt
vorkamen**; das Dashboard null von 43.

**Der schlimmste hiess `quiet`.** Er sass auf den Knöpfen, die eine
Zugangsberechtigung verwerfen (*„Forget this relay on this device"*), ein Gerät
vergessen und die Vollmacht eines Geräts beenden. Weil ihn keine Regel kannte,
bekamen genau diese Knöpfe das Aussehen eines `button` **ohne** Klasse — und
das ist hier gefüllt, fett und in der Primärfarbe. **Die leisen Knöpfe waren
die lautesten im Fenster.**

**Gegangen statt behauptet.** Beide Zustände gegen eine echte Maschine (die
gebauten Zeichner, das echte Stilblatt, ein echter Browser, `getComputedStyle`):

| | vorher | nachher |
|---|---|---|
| Geräte-Zeile: Rahmen | `0px`, `none` | `1px solid` |
| Innenabstand | `0px` | `12px` |
| Anordnung | `list-item` | `grid` |
| verschachtelte Liste | `circle`, 40 px eingerückt | `none`, `0px` |
| „Forget this device …": Hintergrund | `rgb(44, 207, 255)` | `rgb(17, 42, 62)` |
| ein Knopf ganz ohne Klasse | `rgb(44, 207, 255)` | `rgb(44, 207, 255)` |

Die dritte und die letzte Zeile sind dieselbe Farbe: der Knopf, der das
Vergessen auslöst, war **Byte für Byte** so laut wie der Knopf, der das
Gewöhnliche tut. Und die verschachtelten Listen zeigten Aufzählungspunkte —
Kreise, vierzig Pixel eingerückt, mitten in einer Karte, in einem Stilblatt,
das sie überall sonst abschaltet.

Derselbe Lauf ist auch die Wanderung zu **B102**: `inputIsInsideLabel` von
`false` auf `true`, und **`clickingLabelFocusesField` von `false` auf `true`**.
Die Verbindung, die B102 hergestellt hat, ist damit nicht argumentiert, sondern
in einer Maschine gedrückt worden.

**Warum das niemandem auffiel.** Ein Element mit einem unbekannten
Klassennamen verschwindet nicht und meldet nichts. **Es erscheint — als das,
was der Browser vorgibt.** Ein Tippfehler in einem Klassennamen ist deshalb der
stillste Fehler, den eine Fläche haben kann: alles ist da, nur anders, und wer
die Seite nicht neben der Absicht sieht, merkt es nie.

**Die Heilung war fast überall, die Vokabel zu benutzen, die es schon gibt.**
Das Stilblatt argumentiert bei `.views` selbst, warum: *ein Klassenname wäre
eine zweite Vokabel für dieselbe Sache.* Also `quiet` → `secondary` (das gibt
es, und es wird sechs Zeilen weiter benutzt), `supplier-line`/`relay-line`/
`device-line` → `provider-line`, `relay-accounts`/`device-offers` →
`provider-list`, `relay-account`/`device-offer` → `provider-line`. Die Art
steht ohnehin schon im `dataset`, wo sie hingehört. Zwei Namen blieben ohne
Vorbild und haben eine Regel bekommen (`device-authority` und seine
Gründe-Zeile), und einer ist umbenannt worden: `.device-code-text` heisst jetzt
`.machine-string`, weil ein Relais-Zugangsschlüssel dasselbe ist — eine lange
Maschinenzeichenkette, die eine Person liest und kopiert. Die **Kennung**
`device-code-text` bleibt, wo sie steht: die liest der Zeichner, und sie
benennt das Element, nicht sein Aussehen.

**Was hält es:** `pnpm style:check` (Kettenschritt 46, Kette jetzt **49**).
Jeder Name, den eine Fläche trägt, hat eine Regel. Alles abgeleitet: die
Flächen aus `operated-surfaces.mjs`, die Stilblätter aus der Seite selbst
(`<link>` und `<style>`), die Zeichner aus der Anwendungswurzel — der nächsten
Elternschaft mit einer `package.json`.

**Die Gegenrichtung prüft er nicht**, und das steht in seinem Kopf: eine Regel
ohne Träger ist toter Stil, ein anderer Mangel mit anderen Fehlalarmen
(Zustandsklassen, Medienabfragen, fremde Blätter). Hier steht die Richtung, in
der eine *Absicht* verloren geht.

**`operated-surfaces.mjs` ist neu**, und es ist die Lehre aus B96 einen Schritt
weiter: zwei Prüfer stellen jetzt Fragen über dieselben zwei Flächen und über
dieselben zwei, die niemand bedient. Zweimal geschrieben driftet die Menge —
der eine bekäme eine dritte Ausnahme, der andere nicht, und danach messen sie
Verschiedenes und melden beide grün. Einmal abgeleitet, zweimal gelesen.

Drei Pflanzungen: `quiet` zurückgesetzt, ein Tippfehler in einen Klassennamen
der **anderen** Fläche gesetzt, und den Begriff „Zeichner" leerlaufen lassen.
Alle drei sprechen — die ersten beiden mit Name, Träger und Folge.

**Was nicht geprüft ist:** ob das Ergebnis *gut* aussieht. Der Prüfer sagt, dass
jede Absicht ankommt, nicht dass sie richtig war. Das braucht Augen.

**B102 — Das sechzehnte Feld gab es schon, und es war das eine ohne Namen
(2026-09-09).** B100 hat gemessen, dass jedes Bedienelement der beiden Flächen
beschriftet ist, und in den Kopf des Prüfers geschrieben: *„ein sechzehntes
Feld ohne `<label>` fällt niemandem auf."* Der Satz war richtiger als gedacht.
Das sechzehnte Feld gab es an dem Tag schon — es stand nur nicht in der Datei,
die der Prüfer liest.

Gemessen, wo die Bedienelemente wirklich herkommen:

| Wo | Knöpfe | Freie Eingabefelder |
|---|---|---|
| In den HTML-Dateien, die B100/B101 lesen | 42 | 42 Bedienelemente, alle beschriftet |
| Zur Laufzeit im TypeScript daneben | **39** | **1** |

Fast die Hälfte aller Knöpfe des Produkts entsteht in drei Zeichnern, nicht in
einer Datei. Alle 39 bekommen ihren Text an Ort und Stelle. **Das eine freie
Eingabefeld nicht.**

**Der Fund.** In `renderPicoCompanionDeclaredSuppliers` — der Zeile, auf der
eine Person benennt, wohin das Material eines fremden Lieferanten gehört —
standen Beschriftung und Feld als **Geschwister** nebeneinander, ohne `for`,
ohne `id`, ohne `aria-label`:

```ts
const label = root.document.createElement('label');
label.textContent = line.domainLabel;

const domain = root.document.createElement('input');
…
item.append(headline, detail, label, domain, attach);
```

Der Text war **sichtbar** neben dem Kasten und mit ihm durch **nichts**
verbunden. Ein Klick auf ihn setzte den Fokus nicht, und ein Screenreader las
das einzige Eingabefeld dieser Zeile als namenlos — genau der Mangel, den
`check-form-labels.mjs` im HTML des Fensters verbietet, an dem einen
Bedienelement, das nicht im HTML des Fensters steht.

**Verschachtelt statt verbunden.** Das Feld sitzt jetzt *in* seiner
Beschriftung. Nicht über `id` und `for`, weil dies eine **Schleife** ist: eine
Kennung müsste je Zeile hergestellt und eindeutig gehalten werden, und zwei
Zeilen mit derselben hängten die Beschriftung ans falsche Feld — dieselbe
Klasse Fehler, die auf den statischen Flächen null Mal vorkommt und die man
sich nicht als erste eigene Quelle hereinholt. Enthalten sein kann nicht
auseinandergehen.

**Der Test sucht das Feld jetzt durch seine Beschriftung.** Vorher fand er es
flach auf der Zeile — und lief grün, während beide unverbunden nebeneinander
standen. Ein Test, der die Verbindung nicht sucht, hält sie auch nicht.

**Die Regel steht im selben Prüfer**, wie in B101: dieselbe Frage, anderer
Fundort. Sie liest jede verfolgte `.ts`, die ein Bedienelement erzeugt — auch
das ist abgeleitet und nicht gelistet, und es sind genau die drei Zeichner,
kein Test darunter, keine Ausnahme nötig. Benannt ist ein Element, das (a)
selbst einen Namen bekommt, (b) in eine Beschriftung mit Text gehängt wird
oder (c) eine Kennung bekommt, auf die ein `htmlFor` zeigt; drei gleichwertige
Arten, damit die Regel keine Vorschrift zur Bauweise wird.

**Wie weit der Prüfer schaut**, und es steht in seinem Kopf: höchstens 25
Zeilen ab der Erzeugung und nicht über die nächste Erzeugung desselben Namens
hinaus — sonst entlastete der Text des übernächsten Knopfes den vorigen. Wer
den Namen weiter weg setzt, bekommt einen Fehlalarm. Das ist die richtige
Richtung zu irren: laut statt still.

Drei Pflanzungen: die Verschachtelung wieder aufgehoben (der echte Mangel
kehrt zurück und wird mit Datei, Zeile und Folge benannt), einem Knopf im
zweiten Zeichner der Text genommen, und die Menge der Zeichner leerlaufen
lassen — der Wächter spricht.

**Was daraus folgt.** Eine Regel gilt dort, wo der Prüfer hinsieht, und die
Gegenstände wohnen nicht immer da. Vor jeder nächsten Flächenfrage gehört die
Frage davor: *wo entstehen die Dinger eigentlich?*

**B101 — Drei weitere Fragen derselben Art, dreimal schon beantwortet
(2026-09-09).** Nach B100 die naheliegenden Nachbarn: **sagen die Knöpfe, was
sie sind? Sagt die Seite ihre Sprache? Hat sie einen Titel?**

Gemessen: **42 Knöpfe, keiner namenlos**; beide Flächen mit `lang="en"` und
einem nicht leeren `<title>`. Wieder nichts zu beheben — und wieder hielt es
nichts.

Die drei Regeln sind in **denselben** Prüfer gegangen. Es ist dieselbe Frage
mit anderem Gegenstand, und eine zweite Datei hiesse eine zweite Maschinerie,
die dieselben zwei Flächen ableitet, dieselben zwei unbedienten begründet und
irgendwann anders driftet — die Lehre aus B96.

Warum die drei zählen, in einem Satz je:

- Ein Knopf, der nur ein Symbol trägt, **hat einen Namen für den, der ihn
  sieht, und keinen für den, der ihn nicht sieht.**
- Eine Seite ohne `lang` wird in irgendeiner Sprache vorgelesen, und die
  falsche ist nicht schwer zu verstehen, sondern **gar keine Sprache**.
- Der Titel ist das Erste, was über ein Fenster gesagt wird, und das Einzige,
  was ein Reiter zeigt.

Drei Pflanzungen, je eine: die Sprachauszeichnung entfernt, einen Knopf
ausgeleert, den Titel geleert. Alle drei werden mit Fläche und Folge benannt.

**B100 — Jedes Bedienelement sagt, was es ist, und nichts hielt das
(2026-09-09).** B99 riet, woanders anzufangen. Also eine Frage, die dieser Baum
noch nie mechanisch gestellt hat: **ist das, was eine Person vor sich hat,
ohne Maus und ohne Augen benutzbar?**

Der Befund ist wieder ein Ja — und diesmal ein ungewöhnlich sauberes. Das
Fenster führt 15 Bedienelemente und **15** verbundene Beschriftungen, das
Dashboard 27 und **27**. Kein einziges Feld ohne. Dazu drei `aria-live`-Bereiche
und zwei `role="status"`; alle 28 Knöpfe und 14 Eingaben sind von sich aus
tastaturerreichbar.

Gehalten hat es nichts. `check-companion-boundary.mjs` zählt, dass die 114
Elemente, die das Fenster verlangt, **da** sind — nicht, dass sie beschriftet
sind. Ein sechzehntes Feld fiele niemandem auf.

**Warum das kein Schönheitsfehler ist.** Ein Eingabefeld ohne verbundene
Beschriftung ist für einen Screenreader namenlos, und der Klick auf den Text
daneben setzt den Fokus nicht. Ein Produkt, dessen These „ein Begleiter für
eine Person" lautet, kann sich das an genau den zwei Stellen nicht leisten, an
denen die Person etwas entscheidet.

**Was der Prüfer nicht prüft**, und es steht in seinem Kopf: ob die Beschriftung
*gut* ist, ob die Reihenfolge stimmt, ob Kontrast und Fokusrahmen reichen. Das
sind Urteile. Dies ist die Syntax darunter — ein Element, eine Kennung, eine
Beschriftung, die auf sie zeigt, oder ein `aria-label`, wo keine sichtbare
hingehört.

Die Flächen sind abgeleitet: jede verfolgte HTML-Datei ausser den zwei, die
niemand bedient — eine Demo des importierten Designsystems und eine
Werkzeugvorlage, beide mit Grund benannt statt stillschweigend übersprungen.

Zwei Pflanzungen: einer Beschriftung ihr `for` genommen, und ein Feld ganz ohne
Kennung eingesetzt. Beide werden mit Fläche, Kennung und Folge benannt.

**B99 — Sechs Fragen, sechsmal Nein, und das ist das Ergebnis
(2026-09-08).** Nach B97 und B98 ist die Fundrate auf null gefallen, und das
gehört aufgeschrieben, sonst misst die nächste Sitzung dieselben Flächen noch
einmal.

| Frage | Antwort |
|---|---|
| Ist der Beanspruchungscode des Relays eng gefasst? | **Ja.** 32 Zufallsbytes, nur der Abdruck bleibt, einmalig verbraucht, zeitkonstant verglichen, nur im Speicher, je Prozess neu — und begründet, warum er kopiert statt importiert ist |
| Ist seine Einmaligkeit gegangen? | **Ja**, gegen einen echten Prozess: *„A code that still worked would be a second key to the relay sitting in a log file"* |
| Wird die Betreibertür begrenzt? | **Ja.** Zwei Eimer, vor allem anderen belastet, damit ein Hämmern an der Tür nicht das Budget des Betreibers verbraucht (ADR 0154 RO9) |
| Wie kurz lebt der Echtzeit-Ticket in der URL? | **30 Sekunden, einmalig** — und der Eintrag wird *vor* der Ablaufprüfung gelöscht, ein abgelaufener lässt sich also nicht nachspielen; höchstens 128 gleichzeitig, nur der Abdruck gespeichert |
| Legt das Dashboard etwas im Browser ab? | **Nein.** Kein `localStorage`, kein `sessionStorage`, kein Cookie, kein IndexedDB — die Sitzung lebt nur im Speicher |
| Werden die drei Zusagen des README gegen echte Prozesse gegangen? | **Ja, alle drei.** „was ein Modell sehen darf" → *misst eine Maschine, fragt sie und nimmt beides wieder zurück*; „welches Material hier sein darf" → *hängt ein Depot an, entscheidet sein Hinausgreifen und hängt es wieder ab*; „welches Gerät was darf" → `device-lifecycle-real-process` |

Sechs Nein hintereinander sind kein leerer Tag. Sie sind die Aussage, dass
diese Flächen reif sind — und sie sind teurer zu bekommen als ein Fund, weil
jede erst geprüft werden musste, ob sie nicht doch ein Ja ist.

**Was daraus folgt:** die Naht „ein guter Zustand ohne Netz", die B82, B90,
B92, B93, B96, B97 und B98 getragen hat, ist an diesen Flächen abgearbeitet.
Wer weitersucht, sollte woanders anfangen — die fünf offenen Entscheidungen
stehen in `.agent-context.md`.

**B98 — Die Reihenfolge zählt, und niemand hielt sie (2026-09-08).** B97 hat
die *Geschichte* der Wanderungsliste gesichert. Die Liste von **heute** hat zwei
weitere Eigenschaften, und `listPendingMigrations` zeigt, warum sie zählen: es
filtert die Liste **in ihrer Reihenfolge** und sortiert nicht nach Kennung.

- Eine Kennung, die zweimal vorkommt, steht zweimal in derselben Auswahl — die
  wird einmal berechnet und dann abgearbeitet —, also liefe sie **zweimal**,
  und aufgezeichnet würde sie **einmal**.
- Eine Nummer, die später steht als eine höhere, läuft später als sie. Die
  Nummerierung wäre dann eine Aussage über eine Ordnung, die es nicht gibt, und
  wer eine Wanderung auf das Schema der vorigen baut, baut auf eine, die noch
  nicht lief.

Gemessen, bevor die Regeln kamen: 25 Wanderungen, Kennungen eindeutig,
aufsteigend, ohne Lücke, jede mit `requiresBackup`. Wieder der gute Zustand ohne
Netz.

**Und meine erste Eindeutigkeitsregel konnte gar nicht auslösen.** Sie las die
Kennungen aus einer `Map` — und eine `Map` schluckt die Wiederholung, bevor
irgendeine Regel sie sieht. Die Pflanzung hat es gezeigt, nicht das Nachdenken:
doppelte Kennung eingesetzt, Prüfer grün. Die Reihenfolge wird jetzt getrennt
geführt, mit Wiederholungen, und dann fällt er zweimal — einmal für die
Doppelung, einmal, weil eine Nummer nicht nach ihrer Vorgängerin steht.

Zwei Pflanzungen: die letzte Wanderung vor die vorletzte geschoben, und eine
Kennung verdoppelt. Beide werden namentlich genannt.

**Das ist heute die dritte Pflanzung, die eine Regel als leer entlarvt hat.**
Eine Regel, die man nur liest, sieht immer richtig aus.

**B97 — Eine Wanderung, die ausgeliefert wurde, konnte sich unbemerkt ändern
(2026-09-08).** Eine Wanderung läuft **einmal je Installation**, und
`schema_migration` merkt sich nur ihre Kennung. Wer den Rumpf einer bereits
ausgelieferten Wanderung ändert, ändert damit an einer Installation, die sie
gefahren ist, **gar nichts** — die Kennung steht dort, also läuft sie nie
wieder. Der Code erwartet ab dann ein Schema, das dieses Home nie bekommen hat,
und niemand erfährt es, bis eine Abfrage über eine Spalte stolpert, die es nur
auf neuen Installationen gibt.

`schema_migration_audit` hält `migration_ids_json` — *welche* liefen, nicht
*was* sie taten. Im Produkt fängt das also nichts.

**Die Quelle ist abgeleitet und nicht gepflegt.** Kein Hash-Verzeichnis, das
jemand nachführen müsste: was ausgeliefert wurde, steht im letzten
Versionsschild. `git show v0.2.1:apps/core/src/migrations.ts` ist die Wahrheit
darüber; eine gepflegte Liste wäre die zweite Fassung davon, und die driftet
(B69). Heute: 24 ausgeliefert, 25 im Baum, jede der 24 Wort für Wort dieselbe.

Der Rumpf wird über **Klammern** abgegrenzt und nicht bis zur nächsten Kennung
— sonst meldete eine dazwischengeschobene Wanderung ihre Nachbarn als geändert,
also einen Fehlalarm über genau die Bewegung, die erlaubt ist. Dritte Pflanzung
prüft das: eine neu eingefügte wird **nicht** gemeldet.

**Und das Leerlauftor hat mein neues Tor sofort abgewiesen** — es überspringt
sich über einem leeren Baum, und *„a skip nobody looks past is not an audit"*.
Es hatte recht, und die Begründung wäre falsch gewesen, wenn ich sie nur
hingeschrieben hätte: **ein Auscheckvorgang bringt per Vorgabe keine Schilder
mit**, der Prüfer wäre also auf dem Läufer aus demselben Grund gesprungen — dort,
wo er am meisten zählt. Beide Auscheckschritte holen sie jetzt (`fetch-tags`),
und erst dann durfte der Übersprung in die begründete Liste.

Drei Pflanzungen: Rumpf geändert, Wanderung verschwunden, neue eingefügt. Die
ersten beiden werden benannt, die dritte richtig verschwiegen. Zwei davon
griffen im ersten Anlauf **nicht** — meine Anker trafen den Wortlaut nicht, und
der Prüfer meldete grün über einer unveränderten Datei. Dieselbe Falle wie in
B89: eine Pflanzung, die man nicht nachsieht, ist keine.

**B96 — Kein Geheimnis erreicht ein Protokoll, und nichts hielt das
(2026-09-08).** `check-link-seal.mjs` hält seit Wochen Mailboxadressen aus
Protokollen heraus. Für das, wofür dieses Produkt überhaupt gebaut ist — eine
Passphrase, ein Klartext, ein privater Schlüssel — gab es nichts.

Zuerst gemessen: **drei** Treffer, alle falsch. Ein *angehefteter* Depot-Stand
(`attachment.pin.remote` — „pin" heisst in diesem Baum auch „angeheftet") und
zwei Meldungen über Längengrenzen, die das Wort `passphrase` im Text tragen und
nicht den Wert. **Heute kein Leck.**

Die zweite Familie ist deshalb in **dieselbe** Datei gegangen und nicht in eine
neue. Das Teure hier ist die Maschinerie — Zeichenketten ausblenden, den ganzen
Aufruf statt der Zeile lesen, den Namen als Wort prüfen —, und zweimal
geschrieben würde sie zweimal driften. Ausgerechnet dieser Prüfer hat in B81
gelernt, was das kostet.

**Und beim ersten Lauf der neuen Familie fiel ein Fehlalarm an, der mein
eigener war.** Der Filter behält `${…}`-Inhalte, und sein Muster endet an der
**ersten** schliessenden Klammer — `write(\`${JSON.stringify({ a })}\`)`
verliert dadurch ein `)`. Die Klammerzählung ging nicht auf, die Spanne lief
vierzig Zeilen weiter und traf dort einen Namen, der mit dem Aufruf nichts zu
tun hatte.

Gezählt wird jetzt auf einer Fassung **ohne** Zeichenketteninhalt, gelesen auf
einer **mit** den Interpolationen. Zwei Sichten derselben Zeile, und kein
Luxus: die eine muss Klammern richtig zählen, die andere `${inbound}` sehen.

Der Fehler steckte seit B81 in der Spannenlesung und war mit der Adressfamilie
allein unsichtbar — eine breitere Frage hat ihn gezeigt. Die Geschwister sind
danach gefragt worden und haben die Form nicht: `check-instant-rules.mjs` und
`check-fingerprint-display.mjs` lesen den ganzen Dateiinhalt und suchen nach
*Ausdrücken* — einer Zerteilung, einer Interpolation —, nicht nach einem Wert
*in* einem Aufruf. Wer eine Senke mit einem Wert paart, ist unter den 43
Prüfern allein dieser. Beide Familien
gepflanzt: eine Passphrase in einer Home-Protokollzeile, eine Mailbox in einer
Relay-Zeile. Beide werden mit Datei, Zeile und Grund genannt.

**B95 — Vierundvierzig Entscheidungen gelten als umgesetzt und nennen keinen
Beweis (2026-09-08).** Die Roadmap stellt vier Fragen, und die vierte lautet:
*„Welche Tests beweisen das gewünschte Verhalten?"* Die Statusmatrix ist die
Stelle, an der sie beantwortet wird.

Gemessen: **123** Zeilen sind als umgesetzt oder teilweise umgesetzt markiert.
**79** nennen unter ihren Belegen einen Test oder einen Prüfer. **44** nennen
nur Quelldateien.

Darunter ADR 0083, dessen Belege `reader-key.ts` und `reader-key-freshness.ts`
aufführen — und `reader-key.test.ts` existiert, ich bin sie in B71 selbst
gegangen. Der Beweis ist da; die Zeile zeigt nicht auf ihn.

**Und die naheliegende Behebung wäre falsch.** 41 der 44 haben einen
gleichnamigen Geschwistertest im Baum, also liesse sich die Spalte mechanisch
füllen. Ein Geschwistertest beweist aber **die Datei, nicht die Entscheidung**:
`event-store.test.ts` neben ADR 0014 zu schreiben, hiesse behaupten, diese
Tests prüften *jene* Entscheidung. Die Matrix sähe danach bewiesen aus und wäre
es weniger als vorher — genau die leere Behauptung, gegen die dieser Baum sonst
antritt.

Zweite Quelle geprüft, damit es kein Raten sein muss: nennen die ADRs selbst
ihre Tests? **Null von 44.** Es gibt nichts abzuschreiben.

Damit ist es eine **Entscheidung und keine Aufgabe**, und sie gehört dem
Nutzer. Meine Empfehlung: nicht mechanisch füllen, sondern eine Zeile beim
nächsten Mal mitnehmen, wenn sie ohnehin angefasst wird — der einzige Weg, der
nie eine ungeprüfte Verbindung behauptet. Die Alternative wäre, es als
Konvention hinzuschreiben und die 44 in einem Zug zu beurteilen; das kostet
einen Nachmittag und bringt eine Matrix, in der die vierte Frage überall
beantwortet ist.

Die Liste steht hier, damit niemand sie zweimal misst:

> 0001 0005 0007 0009 0014 0024 0026 0027 0028 0029 0030 0031 0034 0038 0039
> 0067 0068 0069 0070 0072 0073 0074 0075 0076 0077 0078 0079 0080 0081 0082
> 0083 0084 0085 0086 0087 0105 0106 0121 0123 0125 0129 0133 0134 0141

**B94 — `no-store` hing an 126 Aufrufen statt an einer Vorgabe
(2026-09-08).** Die Foundation antwortet mit den Erinnerungen einer Person, und
dass keine davon in einem Zwischenspeicher landet, hing daran, dass **jeder**
Weg an jeder Stelle `sendNoStore` benutzt — 126 Aufrufe. Der globale Hook
setzte CSP und `nosniff`, aber kein `cache-control`.

Gemessen: **sechzehn** Antworten setzten ihn nicht. Alle sechzehn sind Fehler
oder ein 204 — also **heute kein Leck**. Aber die Eigenschaft galt durch
Aufmerksamkeit und nicht durch Bauart, und die siebzehnte wäre die mit Daten
gewesen.

Jetzt eine Vorgabe im Hook — **gesetzt und nicht überschrieben**: wer bewusst
einen anderen Wert angibt, behält ihn.

**Und diese Schutzbedingung wäre beinahe unbewiesen geblieben.** Die
bedingungslose Fassung liess alle 1.107 Kerntests grün: nichts im Baum setzt
heute einen abweichenden Wert. Also hat sie einen eigenen Gang bekommen — zwei
Routen im Test, eine mit `max-age=60` und eine ohne Meinung. Gepflanzt: ohne
die Vorgabe fehlt der Kopf, ohne die Bedingung wird `max-age=60` überschrieben.

**Ein roter Lauf, der keiner war.** Der erste volle Durchgang danach fiel mit
`timeout:core_start` in einer Prozessprobe. Allein gefahren: 7 von 7 grün, und
der nächste volle Lauf 2.948 Tests mit Ausgang 0. Die Last kam von mir —
podman-Bau und Testläufe nebeneinander. Die Wartezeit ist **nicht** verlängert
worden: ein Knopf gegen ein Problem, das nur diese Werkbank hatte, macht
künftige echte Hänger dreissig Sekunden später sichtbar.

**B93 — Kein Schlüsselmaterial im Baum, und nichts, das es hielt
(2026-09-08).** Der Befund ist zuerst ein sauberes Nein: keine verfolgte
Schlüsseldatei, kein PEM-Block, kein Token. Dann die Frage aus B82, B90 und
B92 — was hält das? Nichts.

Bei dieser Klasse wiegt das schwerer als bei den anderen: **ein Schlüssel, der
einmal in der Geschichte steht, ist auch nach dem Löschen dort.** Das ist der
eine Fehler, den ein Prüfer vor dem Commit fangen muss statt danach.

**Der Prüfer ist absichtlich eng, und die Zahlen sagen warum.** Ein Scanner
nach „sieht aus wie ein Geheimnis" fand in diesem Baum erst **329** Treffer,
alle falsch, und nach dem Schärfen **94**, wieder alle falsch — lange
camelCase-Bezeichner und die Testvektoren des Designsystems. Eine Prüfung,
deren Fehlschläge meistens falsch sind, bringt Leute dazu, Prüfungen zu
überspringen.

Also genau zwei Fragen, die keine Meinung brauchen: trägt eine verfolgte Datei
einen Namen, den nur Schlüsselmaterial trägt? Und steht in einer verfolgten
Textdatei ein PEM-Block mit privatem Schlüssel? 1.458 Pfade benannt, 1.390
gelesen.

Was es **nicht** fängt, steht im Kopf des Prüfers, damit niemand mehr
hineinliest: ein Zugangstoken als gewöhnliche Zeichenkette, ein Schlüssel in
einer Datei ohne verräterischen Namen — und alles Ungefolgte, denn dafür sind
`.gitignore` und `.dockerignore` zuständig (B91).

Zwei Pflanzungen, beide über `git add`, weil `git ls-files` nur Verfolgtes
sieht: ein PEM-Block in einer Notizdatei, und eine Datei namens `deploy.key`.

**B92 — Zwanzig Felder, mit denen ein Add-on aus seinem Container tritt, und
keines gehalten (2026-09-08).** Die beiden Home-Assistant-Add-ons zuerst
gelesen statt geprüft, und sie sind **vorbildlich**: kein `map`, kein
`privileged`, kein `host_network`, keine Supervisor-API. Das Home veröffentlicht
einen Port mit `null`-Vorgabe und läuft über Ingress; das Relay einen — *„the
only port that may be forwarded from a router"* — und einen zweiten, der
zusätzlich eine Option verlangt. Der Gesundheitsport steht bewusst in keiner
Liste.

Nur hält das nichts. `check-addon-config.mjs` sagt im eigenen Kopf, was es
prüft: den Vertrag zwischen `options` und `schema`, *„not the whole add-on
config"*. Die Felder, mit denen ein Add-on den Container verlässt, standen
ausserhalb — der gute Zustand ohne Netz, dieselbe Lage wie in B82 und B90.

Die Regel **verbietet sie nicht.** Sie verlangt, dass die Entscheidung in
derselben Datei steht: wer `map` braucht, schreibt hin wofür; wer `privileged`
schreibt, muss es begründen, und wer das liest, sieht sofort, worüber zu reden
ist. Ein Verbot wäre eine Politik, die ich nicht zu setzen habe; ein
geschriebener Grund ist das, was ein Prüfer leisten kann.

Zwanzig Felder werden beobachtet, null sind in Gebrauch. Zwei Pflanzungen:
`privileged` ohne ein Wort — abgelehnt und benannt; `map` mit einem Satz —
angenommen und mitgezählt, die Zahl steigt auf eins.

**B91 — 294 MB Bauzusammenhang, davon 268 MB, die in keinem Bild vorkommen
(2026-09-08).** Der erste Satz von `.dockerignore` sagt es selbst: *„Docker
does not read .gitignore."* Genau deshalb müssen die beiden Listen von Hand
übereinstimmen — und sie taten es nicht.

| | |
|---|---|
| **`apps/companion-shell/out`** | 268 MB gepacktes Electron, hochgeladen in **jedem der sechs Bauschritte**, in keinem der beiden Bilder vorkommend |
| **zwei Recovery-Card-PDFs** | im Wurzelverzeichnis, von `.gitignore` beim Namen gekannt — eine gedruckte Karte trägt Wurzelmaterial, also genau die Klasse, für die diese Datei geschrieben wurde |
| die lokale `settings.local.json` unter `.claude`, `.pico-stage`, Python-Artefakte, fremde Sperrdateien | kein Leck, aber nichts, was ein Bild braucht |

Der Kontext misst danach **26,6 MB** statt 294.

**Und das ist gebaut, nicht behauptet — beide Bilder.** `podman` ist auf dieser
Maschine: Home *und* Relay mit dem verkleinerten Kontext gebaut (je Ausgang 0),
gestartet, `/health` je mit **HTTP 200** beantwortet; das Relay schrieb dabei
seinen einmaligen Beanspruchungscode ins Log, wie ADR 0154 RO1 es vorsieht.
Zuerst hatte ich nur das Home geprüft und die Aussage auf ein Bild von zweien
gestützt — das zweite ist nachgeholt. Der erste Startversuch scheiterte, und
zwar richtig — das Home weigert sich, auf `0.0.0.0` zu binden, solange niemand
den Zugangsmodus entschieden hat. Das ist die Verweigerung und nicht mein
Kontext; mit `direct-token` lief es.

Die Regel vergleicht jetzt die beiden Listen: was `.gitignore` ausschliesst und
`.dockerignore` nicht, muss mit einem Grund dastehen. Drei stehen dort — eine
Ausnahme *von* einer Ausnahme, eine Glob-Klasse in eckigen Klammern, die
`.dockerignore` nicht kennt, und eine Datei, die nur anders geschrieben ist.
**Keine Mustersprache nachgebaut**, nur Namen verglichen: ein Name, der in
einer Datei steht und in der anderen fehlt, ist die Frage.

Zwei Pflanzungen: das gepackte Electron wieder hereingelassen, und `.gitignore`
einen neuen Ausschluss gegeben, den Docker nicht kennt. Beide werden namentlich
genannt.

**B90 — Zwei Bilder laufen als root, eines sagt warum (2026-09-08).** Weiter im
Ablauf: `node:22-bookworm-slim` setzt keinen Benutzer, also laufen beide
ausgelieferten Container als root. Bevor das ein Fund wird, die Frage aus B83:
ist es entschieden?

Beim **Home** ja, und ausführlich — ein Host mountet `/data` zur Laufzeit, Home
Assistant tut es, und als `node`-Benutzer wäre das Verzeichnis auf manchen
Installationen für SQLite nicht beschreibbar. Das Bild bleibt root-basiert
*„until startup can safely prepare /data ownership and drop privileges"*: eine
Vertagung mit einer Bedingung, an der man sie enden sieht.

Beim **Relay** nicht. Dieselbe Lage — `VOLUME ["/data"]`, dieselbe Datenbank
auf einem gemounteten Verzeichnis —, aber kein Wort dazu. Und das in einer
Datei, die sogar die **Abwesenheit** einer `HEALTHCHECK` über zwanzig Zeilen
begründet, samt zweier `podman inspect`-Ausgaben. Der Zustand war geerbt, nicht
entschieden.

Jetzt steht der Grund auch dort, und `check-workflow-pinning.mjs` — das die
beiden Dateien ohnehin liest — verlangt von jedem Bild eines von beidem: einen
`USER` oder einen Satz darüber. **Nicht, dass es einen `USER` gibt**: dass die
Entscheidung im Bild steht. Ein drittes Bild erbt sie dann nicht mehr aus
Versehen, und wer die Vertagung beendet, nimmt den Absatz heraus und setzt
`USER`.

**Meine erste Regel war zu wörtlich** und meldete das Home als schuldig: sie
suchte die Anweisung `USER`, und das Home schreibt „non-root node **user**"
klein. Nach der Sache gefragt statt nach dem Wort — ein Kommentar, der `root`
nennt, und eine Datei, die von Benutzer oder Privilegien spricht — passt sie zu
beiden. Zwei Pflanzungen: jeder Datei die Begründung genommen, beide werden
namentlich genannt.

**B89 — Abbrechen ist richtig, aber nicht überall (2026-09-08).** Nach B88
dieselbe Ecke: der Ablauf hatte **keine** Nebenläufigkeitsregel, also fahren
zwei Pushes hintereinander beide voll durch — auf einem Zweig mit vielen
kleinen Commits die teuerste Art, dieselbe Frage zweimal zu stellen.

Die bequeme Fassung wäre `cancel-in-progress: true` gewesen, und sie wäre
falsch. **Dieser Ablauf veröffentlicht.** Ein abgebrochener Lauf auf `main`
oder auf einem Tag hiesse: ein Commit wurde nie geprüft, und eine
Veröffentlichung endete auf halbem Weg. Beides ist schlimmer als verbrannte
Minuten. Bei einem Pull Request zählt nur der neueste Stand, und der ältere
Lauf beantwortet eine Frage, die niemand mehr stellt.

Also an das Ereignis gebunden statt an ein `true`.

Und die Regel schützt genau diese Unterscheidung: `split:check` verlangt, dass
`cancel-in-progress` **dasteht** und **nicht `true`** ist — wer es
vereinfacht, nimmt die Unterscheidung heraus, ohne dass etwas rot wird.

**Meine erste Pflanzung griff nicht, und ich habe es beinahe übersehen.** Die
Shell hatte `${{ … }}` zerlegt, die Datei blieb unverändert, und der Prüfer
meldete grün — was wie ein bestandener Test aussieht und keiner war. Erst der
Blick auf die Zeile zeigte es. Nochmal ohne Shell-Ersetzung gesetzt: dann fällt
er und nennt den Grund.

**B88 — Der Ablauf, der die Fristen ausführt, hatte selbst keine
(2026-09-08).** B77 hat dem Home eine Frist für ausgehende Anfragen gegeben,
B78 eine für hereinkommende. Dieselbe Frage an den Arbeitsablauf, der beides
ausführt: **kein einziger der fünf Aufträge trägt `timeout-minutes`.** Ohne die
Zeile gilt GitHubs Vorgabe von sechs Stunden — ein hängender Auftrag läuft
einen Nachmittag lang, und bemerkt wird er an der Rechnung.

Neunzig Minuten für jeden, und die Zahl ist eine **Decke, kein Ziel**: der
längste je gemessene Auftrag brauchte 58 Minuten (Befund B67), und eine Frist
muss weit genug darüber liegen, um nur einen Stillstand zu fangen und nie einen
langsamen Tag. Eine zu enge Frist macht die Kette launisch, und eine launische
Kette wird übersprungen — das wäre schlimmer als sechs Stunden.

Eine Decke statt fünf, weil sie dann **eine** Begründung braucht statt fünf.

Und die Regel, weil ein sechster Auftrag sonst morgen wieder unbegrenzt wäre:
`split:check` liest die Auftragsliste ohnehin und verlangt jetzt von jedem eine
Frist. Zwei Pflanzungen — einem bestehenden Auftrag die Zeile genommen, und
einen sechsten ohne sie hinzugefügt. Beide werden namentlich genannt.

**B87 — Das Audit-Tor prüft `--prod`, und was das auslässt, hatte niemand
gemessen (2026-09-08).** Der Audit läuft neben der Kette und ist grün: keine
bekannten Schwachstellen in den Produktionsabhängigkeiten. Eine Stufe weiter
gefragt — ohne `--prod` — waren es **vierzehn**: vier mittlere, neun hohe, eine
kritische. Alle im Werkzeug, mit dem gebaut und getestet wird.

ADR 0122 nennt den Umfang („failing on known-vulnerable **production**
dependencies"), **begründet ihn aber nicht**. Die eine ausdrückliche Ausnahme
des ADR — Installskripte bleiben an, weil native Module sie brauchen — steht
mit Grund im Text; diese nicht. Und der ADR handelt von der Maschine, die baut
und signiert. Das ist dieselbe Maschine.

**Neun sind weg, mit derselben Kur wie B63.** `brace-expansion`, `nanoid`,
`postcss` und `esbuild` innerhalb der Bereiche neu aufgelöst, die der Baum
ohnehin erklärt — kein Bereich geändert, kein Paket angehoben. 2.947 Tests
weiterhin grün.

**Die fünf, die bleiben, brauchen alle einen laufenden Entwicklungsserver** —
und das ist nachgesehen, nicht angenommen:

| Verbleibend | Erreichbar? |
|---|---|
| Vitest-UI liest beliebige Dateien (kritisch) | `@vitest/ui` ist **nicht installiert** |
| Vite `server.fs.deny` unter Windows (hoch) | Entwicklungsserver, Windows |
| esbuild nimmt Anfragen von Webseiten (mittel) | Entwicklungsserver |
| Vite Pfaddurchquerung in optimierten Deps (mittel) | Entwicklungsserver |
| launch-editor gibt NTLM preis (mittel) | Fehleroverlay des Servers |

Kein `vite dev`, kein `--ui`, nirgends im Baum. Gefahren wird `vitest run` und
`tsc`.

`vitest` steht bereits auf der höchsten stabilen Fassung, die `^2.0.0` zulässt
— die fünf wären nur über eine **Bereichsänderung** zu haben. Ob das Tor
Entwicklungsabhängigkeiten überhaupt umfassen soll, ist damit eine
Entscheidung und keine Aufgabe: heute fiele es, und es bräuchte entweder den
Sprung auf vitest 3 oder eine Ausnahmeliste.

Der Stand steht mit Datum in ADR 0122, neben der Zeile über `fast-uri@3.1.5` —
aus demselben Grund, den diese Zeile selbst nennt: **eine Fassung, die als
Behebung genannt wird, ist eine Tatsache über einen Tag.**

**B86 — Die Naht zu Ende gefragt, und die Frage war zuletzt an mich
(2026-09-08).** Nach fünf Funden (B81–B85) habe ich aufgehört zu raten und
alle **43** Prüfer mechanisch gefragt: wer trägt eine harte Liste von
Paketwurzeln, die schmaler ist als der Baum?

Die Messung meldete sieben. **Sie war falsch.** Sie las Pfade wie
`join(repoRoot, 'apps', 'core', 'src', 'migrations.ts')` als Wurzel, obwohl das
eine begründete Einzeldatei-Ausnahme ist. Nachgesehen statt geglaubt:

- `check-wire-labels.mjs` läuft über `['apps', 'modules', 'packages']` — den
  ganzen Baum. Ich hatte schon 13 Etikettenvorkommen „ausserhalb" gezählt und
  war einen Schritt davon entfernt, daraus einen Fund zu machen. Es gibt kein
  Ausserhalb.
- `check-authority-resources.mjs` und `check-store-ceilings.mjs` lesen
  **benannte Dateien**, nicht Wurzeln: die Tür des Homes, die Stores. Das ist
  ihr Gegenstand, kein Umfang.
- `check-companion-boundary.mjs` und `check-browser-modules.mjs` sind per
  Definition eng — eine Grenze und zwei Browsereinstiege.
- `check-fingerprint-display.mjs` hat diese Lektion **selbst schon gelernt**:
  am 2026-08-20 von zwei Wurzeln auf `apps`+`packages`+`modules`+`tools`
  geweitet, nachdem eine vierte Schreibweise im Vault-Daemon sass, den er nicht
  las. Derselbe Befund, zwei Wochen früher.

Bleiben genau zwei mit einer zu schmalen harten Liste — `check-link-seal.mjs`
und `check-time-authority.mjs` —, und beide sind in B81 und B83 geweitet
worden. **Die Naht ist zu.**

Der Wert dieses Eintrags ist der letzte Absatz: wer sie wieder aufmacht, findet
hier, dass sie gefragt wurde, womit, und dass die naive Messung zu viel meldet.

**B85 — Ein Prüfer rühmte sich, jede Auslassung sichtbar zu machen, und zwei
waren unsichtbar (2026-09-08).** Fünfter in der B81-Naht.
`check-product-path.mjs` hält zwölf produktnahe Dokumente daraufhin, dass sie
niemanden durch die CLI schicken (ADR 0105, ADR 0130 E6), und begründet seine
Bauart mit einem Satz, dem ich zustimme:

> *„Enumerated rather than globbed so every exemption is visible here instead of
> being an accident of a pattern."*

Er zählte die Auslassungen dann **in einem Kommentar** auf: Architektur-ADRs,
Entwicklungs- und Release-Verzeichnisse, das Protokoll, das Designsystem,
`AGENTS.md`, `.agent-context.md`, `TODO.md`, `progress.md`. Gründlich — und
zwei fehlten darin: `CONTRIBUTING.md` und `Roadmap.md`. Genau der Zufall, den
der Satz ausschliessen will.

Die Vollständigkeit ist jetzt eine **Regel** statt einer Sorgfalt: jedes
verfolgte Markdown steht in einer der beiden Listen, sonst fällt der Prüfer.
Die geprüfte Liste bleibt aufgezählt — geglobbt wird nichts.

Die Regel fand beim ersten Lauf fünf weitere: vier unter `tools/` (eine Sonde,
zwei Modellierhilfen — niemand benutzt Pico damit) und `bridges/README.md`. Das
letzte ist ein Grenzfall und deshalb in die **geprüfte** Liste gegangen: ein
Depot hängt eine Person an, also darf das Dokument sie nicht durch die CLI
schicken. Es nennt sie heute nullmal, kostet also nichts und spricht, falls
sich das ändert. 13 geprüfte Dokumente.

**Meine erste Pflanzung griff nicht**, und der Grund gehört dazu: ein neues
Dokument wird erst geprüft, wenn es verfolgt ist — `git ls-files` sieht nichts
anderes. Für einen Repositoriumsprüfer ist das richtig, und die Pflanzung
musste es abbilden statt es zu umgehen. Mit `git add` fällt er sofort und nennt
die Datei.

**B84 — Wer ohne ICU läuft, entscheidet das Telefon und nicht eine Liste
(2026-09-08).** Vierter Prüfer in der B81-Naht, und diesmal war die Liste
**richtig** — und trotzdem falsch aufgeschrieben.

`check-runtime-floor.mjs` führte sechs Pfade von Hand: Protokoll, Vault,
Identity, Sync, Companion, Vault-Daemon. Genau dieselben sechs stehen in
`tools/android-runtime-probe/run-suites-on-device.sh` als `run_suite`-Zeilen —
also in dem Skript, das bestimmt, welche Mengen **tatsächlich auf dem Gerät
gefahren werden**. Zwei Listen über eine Sache, und sie stimmten überein, weil
jemand aufgepasst hat.

Der Satz des Prüfers ist *„the shell-free core runs where there is no ICU"*.
Wer dem Telefon eine siebte Menge gibt, bekäme ab diesem Tag eine Aussage über
sechs Siebtel — ohne dass etwas rot wird. Genau die Klasse aus B69, nur
zwischen einem Prüfer und einem Shell-Skript statt zwischen zwei Quelldateien.

Gelesen wird jetzt das Skript. Es ist die **richtige** Quelle und nicht bloss
die bequeme: was dort steht, wird gestartet; was im Prüfer stünde, wäre eine
Meinung darüber.

Drei Pflanzungen, und die erste ist die eigentliche Probe: eine siebte Menge
ins Skript — der Prüfer liest daraufhin **7 Wurzeln und 127 Dateien** statt
6 und 109, also ein Paket, das er vorher übersehen hätte. Zweitens ein
ICU-abhängiger Decoder in einem eingebetteten Paket: Datei und Zeile. Drittens
ein Skript, das keine Menge mehr nennt — der Prüfer weigert sich, statt über
nichts „kein ICU" zu sagen.

**Vier Prüfer in dieser Naht, vier verschiedene Antworten.** B81: der Umfang
war falsch. B82: der Umfang war richtig und brauchte einen Auslöser für den
Tag, an dem er es nicht mehr ist. B83: der Umfang war begründet und die Liste
passte nicht zur Begründung. B84: die Liste passte und stand am falschen Ort.

**B83 — Der Umfang war begründet, die Liste passte nicht zur Begründung
(2026-09-08).** Dritter Prüfer in der B81-Naht. `check-time-authority.mjs`
sagt: ADR 0120 N4, *„time authority never comes from the network"*, und liest
sechs Wurzeln — mit einem **guten** Grund für die Auswahl, der im Kopf steht:
*„Something that merely informs belongs outside these directories."*

Also war die Frage nicht „liest er alles?", sondern **„stimmt die Liste mit
ihrer eigenen Definition?"**. Gemessen, wer draussen eine Zeit*entscheidung*
trifft:

| Ausserhalb | Zeitvergleiche | Urteil |
|---|---|---|
| `packages/sync` | **22** | zwei echte Entscheidungen — **fehlte** |
| `apps/relay` | 2 | verwirft abgelaufene Pakete |
| `apps/companion-shell` | 2 | Intervallrahmen, Rauchtestfrist |
| link-relay-client, appearance, gesture | 0 | — |

`packages/sync` lehnt ein zu langes Manifestfenster als `invalid_payload` ab
**und** wirft `reader_sync_access_session_clock_rollback`, wenn die Uhr
zurückspringt. Das zweite ist wörtlich das, wovon der ADR handelt — und der
Prüfer las die Datei nicht.

Relay und Schale bleiben draussen, und der ADR liefert das Wort dafür: eine
abgelaufene Nachricht zu **verwerfen** ist kein **Bevollmächtigen**, und
*„network time may be displayed or compared; it may never authorize."*

**Und wieder wäre die Ausweitung fast Dekoration geworden.** Meine erste
Pflanzung — eine Variable namens `ntpClient` — ging durch, und ich hielt das
kurz für dieselbe Blindstelle wie in B81. Sie war es nicht: dieser Prüfer sucht
Paketnamen und echte Zeitdienst-Adressen, nicht Bezeichner. Die Pflanzung war
falsch, nicht der Prüfer. Mit `worldtimeapi.org` fällt er sofort und nennt die
Datei.

182 Quellen über sieben Wurzeln.

**B82 — Eine eingetragene Vertagung, die nicht merkt, wann sie endet
(2026-09-08).** Die B81-Naht weiter: `check-push-boundary.mjs` sagt „a push
reaches no surface that reaches a person" — eine Aussage über Erreichbarkeit —
und liest **eine** von Hand eingetragene Datei.

Nachgemessen, ob der Weg wirklich eine Datei lang ist: `receivePicoCompanionPush`
hat ausserhalb seines eigenen Tests **keinen Aufrufer**, und der Sweep, der ihn
erreichen würde, nimmt sein `handlePush` als hereingereichte Funktion, die im
Produkt niemand liefert. **Ein ausgeliefertes Gerät verwirft heute jeden Push.**

Das ist **kein versteckter Fehler** — `check-capability-reach.mjs` trägt es
namentlich und begründet: *„downstream of a sweep that nothing starts."* Damit
ist auch der Ein-Datei-Umfang des Push-Prüfers heute richtig. Der Baum weiss,
was er nicht getan hat.

Was fehlte, ist der Tag danach. Wer `handlePush` das erste Mal im Produkt
liefert, verlängert den Push-Weg um seine Datei — und die Liste bliebe eine
Datei lang, während ihr Satz weiter über das ganze Produkt spräche. Genau die
Klasse, die B81 zutage gefördert hat, nur in der Zukunft statt in der
Vergangenheit.

Die Prüfung fällt jetzt an dem Tag und verlangt den neuen Namen. Der Auslöser
ist nicht geraten: es ist exakt die Stelle, die den Weg verlängert. Sie fragt
241 Quellen, ob eine davon ihn verlängert. Gepflanzt: eine Produktdatei liefert
`handlePush` — der Prüfer nennt sie mit Pfad und sagt, was zu tun ist.

**B81 — Ein Prüfer, der genau die zwei Prozesse nicht las, um die es geht
(2026-09-08).** Nach B80 dieselbe Frage an die Prüfer selbst: welcher stellt
seine Frage enger, als sie trägt? `check-link-seal.mjs` sagt „no mailbox
address reaches a log, an error or a URL" — eine Aussage über das Produkt — und
las **vier** Verzeichnisse: Kern, Companion, Schale, Protokoll. Nicht dabei:
**das Relay**, ausgerechnet die Stelle, an der Mailboxadressen zu Hause sind,
und der Vault-Daemon.

**Und das trifft mich selbst.** Am Vortag habe ich dem Relay eine
Protokollzeile eingebaut (B76) und geschrieben, `check-link-seal.mjs` bleibe
grün. Das war wahr und bedeutungslos: der Prüfer hat die Datei nie gelesen.

Drei Blindstellen, jede einzeln nachgestellt, weil die erste Behebung die
zweite sichtbar machte:

1. **Der Umfang.** Vier Verzeichnisse statt acht. Behoben — und inhaltlich
   sofort sauber, 213 Dateien.
2. **Die Form der Senke.** Das Muster kannte `log.info(`, die Form einer
   Fastify-Instanz. Das Relay schreibt `options.log?.({…})`, der Daemon
   `this.#audit({…})` — 46, 10, 7, 6 und 1 Vorkommen von fünf Formen, **keine
   davon eine Senke für diesen Prüfer.** Eine gepflanzte Mailbox im
   Relay-Protokoll ging weiterhin durch.
3. **Die Zeilenweise.** Auch mit dem neuen Muster ging sie durch. Der Prüfer
   las *eine Zeile*, und Relay wie Daemon schreiben jeden Protokollaufruf als
   mehrzeiliges Objektliteral. Dort war er kein Boden, sondern ein Zufall:
   dieselbe Mailbox *in derselben Zeile* wie der Aufruf fiel sofort. Gelesen
   wird jetzt von der Senke bis zu der Klammer, die sie schliesst.

**Der erste Lauf über den ganzen Aufruf meldete prompt einen Fehlalarm** —
`revoked.mailboxesEnded`, eine Zahl. Der Name wurde als Zeichenkette gesucht.
Jetzt als Wort, camelCase-bewusst: dem Namen darf kein *Kleinbuchstabe* folgen,
also bleiben `address.mailbox` und `mailboxAddress` Treffer und
`mailboxesEnded` wie `mailboxQuota` nicht. Keine Ausnahmeliste — die
Unterscheidung liegt im Namen selbst.

Beide ursprünglichen Pflanzungen beissen jetzt, in Relay und Daemon.

**B80 — Eine Regel stand für eine Datei und war die ganze Zeit die richtige
Frage an alle (2026-09-07).** `check-docs-structure.mjs` prüft seit Wochen, ob
die Statusmatrix Pfade nennt, die es gibt — mit einer Regel, die der Prüfer
selbst als billig und ausnahmefrei lobt: *„a token that begins with a directory
this repository actually has at its root, carries a file extension and no
glob."* 880 Pfade, und sie fand damals zwei.

Dieselbe Frage an die **246** verfolgten Markdown-Dateien gestellt: **neun tote
Zeiger.**

| Wo | Was |
|---|---|
| `Roadmap.md` ×2 | ein Modul unter `packages/` statt `modules/`; ein Prüfer, der `check-capability-reach.mjs` heisst |
| ADR 0149 | derselbe umbenannte Prüfer |
| ADR 0113, ADR 0130 | zwei Skripte, die im Paket liegen und nicht in `scripts/` |
| ADR 0131 | eine Datei, die in `Roadmap.md` aufgegangen ist |
| ADR 0110 | ein Vektor, den derselbe ADR fünfzehn Zeilen weiter oben **selbst als umgezogen beschreibt** — eine Entscheidung, zwei Antworten |
| `progress.md` | `check-push-lifetime.mjs` — **von dieser Sitzung am selben Tag entfernt** (B69), ADR und Statusdatei nachgezogen, `progress.md` vergessen |

Der letzte ist der, der die Regel verdient hat: ich habe an dem Tag drei
Stellen nachgezogen und eine übersehen, und nichts hätte es gemerkt.

**Nach dem Berichtigen: null — und weiterhin ohne Ausnahmeliste**, was der
Absatz über der Regel selbst als ihren Test benennt. Der einzige Kandidat für
eine Ausnahme war kein Repopfad, sondern ein *Laufzeit*pfad (die Datenbank, die
ein Home anlegt); er ist als Laufzeitpfad geschrieben worden statt ausgenommen.
1203 geprüfte Pfade statt 880.

Zwei Pflanzungen: ein Tippfehler in einem Zeiger, und der alte falsche Pfad im
ADR wieder eingesetzt. Beide werden mit Datei, Zeile und Namen genannt.

**B79 — Drei Messungen ohne Fund, und eine Sperre, die es nicht gibt
(2026-09-07).** Ein Eintrag ohne Fehlerbehebung, weil das Gemessene sonst
morgen wieder gemessen wird.

**Drei Fragen mit sauberem Nein.** Stapeln sich periodische Läufe? Nein — die
synchronen können sich nicht überholen, und der Planer führt für die
asynchronen eine `running`-Menge („already running is not started a second
time"). Steckt schwacher Zufall in einem Schlüssel- oder Kennungspfad? Nein —
`Math.random` steht in drei Testdateien, davon eine, die ausdrücklich erklärt,
warum sie ihn nicht nimmt; das Produkt hat 92 ordentliche Quellen. Fehlen der
Foundation die Trägerkanten-Grenzen (`maxHeadersCount`,
`maxRequestsPerSocket`)? Nein — die Begründung daneben sagt „keep the **carrier
edge** finite", und das ist die Kante zu Fremden, nicht die authentifizierte
Fläche. Es abzuschreiben wäre Abschreiben und kein Fund.

**Und eine Korrektur an mir selbst.** Ich hatte notiert, die Wurzelrotation sei
gesperrt, weil „eine Zeremonie zwei entsperrte Wurzeln braucht und ein Vault
eine hält". **Das ist falsch.** `#listKeyfiles` liest *jede* Datei im
Schlüsselverzeichnis, und `#handleUnlock` wählt nach Rolle **und
Fingerabdruck**; `#unlockedSessions` ist nach Fingerabdruck verschlüsselt. Ein
Vault kann zwei Wurzeln halten und einzeln entsperren.

Der wirkliche Stand, gemessen statt vermutet:

| Schicht | Rotation |
|---|---|
| Protokoll | kanonische Form ✓, Vetofenster ✓ (B68) |
| Home | Einreichung ✓, Veto ✓, Projektion ✓, Link-Tür ✓ |
| Vault-Daemon | **nichts** — kein Bauer, keine Darstellung, keine Zeremonienfamilie, kein Nachfolger-Bootstrap |
| Companion / Fenster | **nichts** |

Und der Daemon fällt dabei **zu**, nicht auf: `sign-rendering.ts` sagt es selbst
— *„a record nobody can render is a record nobody could have meaningfully
approved"* —, `rotation` hat weder Bauer noch Darstellung, also kann heute
niemand eine Rotation unterschreiben lassen. Das ist der richtige Zustand für
eine unfertige Zeremonie.

Die einzige echte Sperre ist eine Regel, kein Entwurf: `foundingBootstrap`
verweigert sich einem Vault, der schon Schlüssel hat („a half-written vault is
worse than none"). Der Zwilling dafür steht daneben — `deviceBootstrap` ist
dasselbe Bootstrap minus dem Wurzelschlüssel, aus einem benannten Grund. Ein
`rotationBootstrap`, das genau **eine** zusätzliche Wurzel anlegen darf, wäre
die dritte Zeile derselben Tabelle und nicht eine Aufweichung der Frischeregel.

**B78 — Der Rahmen hat eine Grenze abgeschaltet, die die Laufzeit mitbringt
(2026-09-07).** Der Spiegel zu B77: was **hereinkommt**. Dieser Baum hat drei
lauschende HTTP-Flächen, und zwei davon setzen genau dieselben drei Werte, mit
derselben Begründung im Kommentar — *„abuse guardrails, not authentication"*:

| Fläche | Empfangsfrist | Kopfzeilen | Keep-Alive |
|---|---|---|---|
| Link-Eingang | 10 s | 5 s | 5 s |
| Relay | 10 s | 5 s | 5 s |
| **Foundation, 61 Routen** | **keine** | 60 s (Node) | 72 s (Fastify) |

**Und es fehlte nicht, es war abgeschaltet.** Node begrenzt das Empfangen einer
Anfrage von sich aus auf fünf Minuten; Fastify setzt `requestTimeout` auf `0`.
Wer den Rahmen nimmt, verliert eine Grenze, die die Laufzeit mitbringt — und
merkt es nicht, weil nichts *fehlt*, sondern etwas *entfernt* wurde. Die
Pflanzung sagt es wörtlich: `expected +0 to be 10000`.

Ein Aufrufer, der eine Anfrage beginnt und den Rumpf beliebig langsam
nachschiebt, hielt eine Verbindung und einen Anfragekontext unbegrenzt fest.
Die Mengengrenze aus ADR 0119 Q4 hilft dagegen nicht: sie zählt *fertige*
Anfragen, und diese wird nie fertig.

`requestTimeout` begrenzt das **Empfangen**, nicht die Laufzeit eines
Behandlers — eine Route, die lange rechnet, wird davon nicht abgeschnitten.
Deshalb steht `connectionTimeout` bewusst **nicht** dabei: das misst Stille auf
dem Socket, und Stille ist genau das, was ein Behandler erzeugt, während er
arbeitet. Der Test hält auch das fest (`timeout` bleibt 0), damit die
Auslassung eine Entscheidung bleibt und kein Vergessen.

**Was der Test ist und was nicht,** und es steht in ihm: er liest die Werte am
*laufenden* Server, nicht im Quelltext — er fällt also, wenn die Option
verschwindet oder Fastify sie nicht mehr durchreicht. Er schickt keine halbe
Anfrage: ein echter Gang müsste zehn Sekunden warten, in jedem CI-Lauf, und was
er zusätzlich bewiese, ist Nodes Vertrag und nicht unserer.

Voller Lauf: 2.947 Tests, Ausgang 0.

**B77 — Das Home begrenzte die Antwort und nicht die Frage davor
(2026-09-07).** Gemessen: dreissig ausgehende HTTP-Anfragen im Produkt, drei
davon mit einer Frist. Und die drei sind genau **alles, was mit einem Relay
spricht** — der Link-Client, der Relay-Client, der Betreiber-Client. Sonst
nichts.

(Zwei Anläufe. Der erste zählte nur `fetch(` und übersah den Relay-Client, weil
der über eine eingespeiste Funktion ruft; der zweite zählte die *Anfrageform*
`method: '…'` und übersah `model-runtime.ts`, weil dessen `signal:` sechzehn
Zeilen entfernt steht. Beide Male habe ich die Dateien danach von Hand
angesehen, statt die Zahl zu nehmen.)

**Der Fund liegt im Modellpfad.** `PicoModelRuntime.dispatch` tut zwei Dinge
nacheinander:

1. `assertMeasuredModel` fragt den Anbieter nach seinen Gewichten — ADR 0142
   PE6, *„before anything leaves"*. **Ohne Frist.**
2. `send` erzeugt die Antwort. **Mit Frist**, aus dem Eintrag abgeleitet.

Ein Anbieter, der die Verbindung annimmt und dann schweigt, hielt damit einen
Auftrag fest, **bevor dessen Uhr überhaupt zu laufen begann**. Der Zustand
`provider_did_not_answer_in_time` war für die zweite Hälfte des Wegs erreichbar
und für die erste nicht — ein Wort für einen Fall, den man auf halbem Weg nicht
erreichen konnte.

Die Prüfung hat jetzt dieselbe Frist, **abgeleitet und nicht gewählt**, wie die
Formel es selbst verlangt (*„Built from the entry rather than chosen"*): mit
null erwarteten Token, denn eine Frage nach den Gewichten erzeugt keine. Übrig
bleibt die vom Eintrag erklärte Kaltladezeit und ihr Aufschlag — wer länger
braucht, um seine eigenen Etiketten aufzuzählen, antwortet nicht.

Gepflanzt: die Frist wieder heraus. Der Test läuft in die Zeitüberschreitung —
genau das Betriebsbild, das eine Zuteilung zeigt, die nie zurückkehrt.

**Was offen bleibt und eine Entscheidung ist, keine Lücke.**
`model-provider-measure.ts` hat **gar keine** Frist, vier Anfragen. Die Messung
läuft absichtlich unbeaufsichtigt (*„every outcome lands in the live view and in
the log"*), also bleibt ein Hängen dort für immer auf `state: 'running'` stehen.
Eine Frist dafür müsste **gewählt** werden und kann nicht abgeleitet sein — die
Messung ist ja das, was die Zahlen erzeugt, aus denen man ableiten würde. Die
dreizehn Anfragen des Dashboards stehen in derselben Lage, mit kleinerem
Einsatz. Beides bleibt ungeändert und steht hier, statt dass ich eine Zahl
erfinde.

Voller Lauf: 2.946 Tests, Ausgang 0.

**B76 — Nach aussen schweigen ist Absicht, nach innen schweigen war keine
(2026-09-07).** B74 und B75 hatten je einen Prozess. Diesmal habe ich die Frage
allen vieren gestellt, und die Antwort war dreimal dieselbe.

| Prozess | nach aussen | nach innen |
|---|---|---|
| Home (B74) | `operation_failed`, signiert, ohne Grund — **richtig** | nichts |
| Vault-Daemon (B75) | Verbindung brach ab | nichts, Prozess tot |
| **Relay** | `{"error":"relay_failed"}` — **richtig, mit Begründung im Code** | nichts |
| **Companion-Schale** | Electron lehnt den Aufruf ab — **richtig** | nichts |

Beim Relay steht der Grund für das äussere Schweigen seit jeher als Kommentar
am Fang: *„a relay that explained itself would be answering questions about
somebody else's mailbox."* Das ist richtig und bleibt. Das innere Schweigen ist
daneben mitgelaufen — und das Relay **besitzt** einen Protokollweg, den es zwei
Zeilen weiter oben schon benutzt. Ein Betreiber hatte für jeden 500er nichts in
der Hand.

Zwei Pflanzungen: die Meldung wieder ausbauen, und die freie Fehlermeldung
ungefiltert durchreichen. Die zweite ist die wichtigere — sie hätte
`ENOENT: … /home/somebody/relay.sqlite` ins Protokoll geschrieben. Nur
snake_case kommt durch, alles andere wird `unnamed_failure`.

**Die Schale ist der Fall, in dem ich weniger geliefert habe, und sage es.**
`assertRendererSender` — die Grenze aus ADR 0113 C2 — antwortete nur dem
Absender, im Ernstfall also dem, der sie umgehen wollte. Sie hinterlässt jetzt
eine Zeile, ohne Adresse. Aber `main.ts` wird von **keinem** Test ausgeführt,
und einen fremden Absender zu erzeugen bräuchte ein zweites Fenster in einem
echten Electron. Die Regel steht deshalb im Grenzprüfer, der die Datei ohnehin
liest, und hält fest, dass die Zeile **dasteht** — nicht, dass sie läuft. Das
ist weniger als ein Gang, und es steht so im Prüfer, damit es niemand für einen
hält. Zwei Pflanzungen dagegen: Zeile weg, und Adresse in der Zeile.

Voller Lauf: 2.945 Tests, Ausgang 0.

**B75 — Der Vault-Daemon hatte für jeden Grund eine Auditzeile und für das
Unerwartete nichts (2026-09-07).** B74 hat den Trichter im Home geschlossen;
die Frage dazu ist, ob die anderen Prozesse denselben haben. Der Daemon hat ihn
nicht — er hat das Gegenteil: **gar keinen Fang** um seinen Versand.

Ein Wurf aus einem Behandler verliess den Ereignisbehandler des Sockets, und
Node beendet dann den Prozess. Kein `uncaughtException`-Netz gibt es im ganzen
Baum (nachgesehen, nicht vermutet). Die Folge war dreiteilig, und nur der erste
Teil war richtig:

- Jede offene Sitzung starb mit — die **sichere** Richtung für einen Prozess,
  der Schlüsselmaterial hält.
- Das Audit, die einzige forensische Fläche dieses Prozesses, blieb **leer**.
  Wer nachsieht, warum eine Zeremonie abbrach, findet einen Stapelabzug auf
  stderr und sonst nichts.
- Der Aufrufer bekam **keine Antwort**, sondern eine Verbindung, die abbricht.

Das zeigt die Pflanzung wörtlich: ohne den Fang läuft der Test in die
Zeitüberschreitung („Test timed out in 5000ms") und der Fehler erscheint als
*Unhandled Error* — im Betrieb ist das der tote Daemon.

Jetzt wird es unter **eigenem Namen** auditiert (`unexpected_failure`, nicht
`protocol_error`): ein Fehler des Daemons ist keine Aussage über den Aufrufer.
Das ist derselbe Satz wie in B72, einen Prozess weiter. Der Aufrufer bekommt
eine Antwort, die Verbindung endet — der Daemon weiss ja nicht, in welchem
Zustand er ist — aber der Prozess lebt, und der Test weist das nach, indem er
danach eine zweite Verbindung bedienen lässt.

Der Grund im Audit geht durch `reasonOf`, das nur snake_case durchlässt: eine
freie Fehlermeldung mit Pfaden und Werten erreicht die Zeile nicht. Und der
Versand steht jetzt als eigene Methode da, damit der Fang **eine** Zeile ist
statt dreihundert verschobener.

Voller Lauf: 2.944 Tests, Ausgang 0.

**B74 — Alle 55 Operationen laufen durch einen Fang, und der vergass jede
Ursache (2026-09-07).** Nach B72 war ich verpflichtet nachzusehen, **wo der
Wurf landet**, den ich dort absichtlich erzeugt habe — sonst hätte ich eine
Lüge gegen einen Absturz getauscht.

Er landet richtig: `PicoLinkDirectIntake.handle` fängt, was `execute` wirft,
und antwortet dem Gerät mit `operation_failed` — nicht mit `conflicting_record`
und nicht mit einem toten Home. Ein Test hält seit jeher fest, dass **nach
aussen** nichts durchkommt: die Ablehnung ist signiert wie ein Ergebnis und
sagt nichts über den Grund.

**Nach innen kam aber auch nichts durch.** `} catch { execution = { outcome:
'operation_failed' } }` — der Fehler wurde verworfen. Das Gerät bekam die
richtige Antwort, und das Home vergass die Frage. Bei 55 Operationen ist das
ein Trichter, in dem jeder unerwartete Fehler des ganzen Link-Wegs spurlos
verschwindet — und seit B72 fällt genau dort hinein, dass die Datenbank nicht
schreiben kann.

Die Eingangsstelle meldet es jetzt an den Wirt (`reportOperationFailure`,
optional, weil es Betrieb ist und keine Autorität — eine Eingangsstelle ohne
Protokollierer bleibt gültig). Gemeldet wird die Operation und die **Meldung**,
nicht der Fehler: ein Stapelabzug trägt Pfade und Werte, und diese Zeile geht
in ein Protokoll. `check-link-seal.mjs` bleibt grün.

Der bestehende Test hat jetzt beide Seiten: nach aussen dringt nichts, nach
innen dringt genau eines. Gepflanzt: die Meldung wieder ausgebaut — **nur
dieser Test fällt, 1.104 andere bleiben grün.**

Voller Lauf: 2.943 Tests, Ausgang 0.

**B73 — „Der Anker ist da und schweigt" las sich wie „es gab nie einen"
(2026-09-07).** Dieselbe Frage wie B72, eine Schicht weiter: Fänge um einen
Dateisystemzugriff. Dreissig Stück, und das Ergebnis ist zunächst ein sauberes
**Nein** — keiner von ihnen gibt einen Datei-Fehler als Sachaussage an eine
Person aus. Die Klasse wiederholt sich dort nicht.

Einer fiel trotzdem auf, weil er im Wiederherstellungsanker steht — dem Stück,
auf dem ADR 0110 R6 ruht. `readAnchorDocument` liest die Datei; schlägt das
fehl, gibt es einen **leeren Anker** zurück. Zwei Blöcke tiefer, beim
Zerlegen des Inhalts, steht der Satz, den die Datei selbst über sich schreibt:

> „Unreadable" must never collapse into „nothing was ever consumed".

Genau das tat der Block darüber. Er konnte **ENOENT** („es gibt noch keinen
Anker", der richtige Fall eines frischen Homes) nicht von **EACCES**, **EIO**,
**EISDIR** oder **EMFILE** unterscheiden — von einem Anker also, der da ist und
nur gerade nicht antwortet.

**Die Folge ist nicht nur eine falsche Auskunft.** Ein leer gelesener Anker
gilt als leer, und einen leeren Anker darf `reseedPicoHomeRecoveryAnchor` neu
säen — das Säen schreibt die Datei, die eben nur vorübergehend unlesbar war.
Ein durchgehender Lesefehler hätte den echten Anker durch einen aus der
Datenbank abgeleiteten ersetzt.

Der bestehende Test dazu deckte **fehlerhaften Inhalt** ab, nicht ein
fehlgeschlagenes Lesen. Der neue nimmt ein Verzeichnis statt einer Datei
(EISDIR) statt `chmod 000` — denn ein Test, der als root leise grün wird,
prüft nichts. Gepflanzt: die Unterscheidung wieder ausgebaut. **Nur der neue
Test fällt, 1.104 andere bleiben grün.**

Voller Lauf: 2.943 Tests, Ausgang 0.

**B72 — Eine volle Platte sagte der Person „jemand war schneller"
(2026-09-07).** Die Messung fragte nach `catch`-Blöcken, die den Fehler
verwerfen: 337 `try`/`catch` im Produkt, 180 verwerfen ihn, 40 davon geben eine
feste Ablehnung zurück. (Der erste Anlauf zählte 2006-Zeilen-Blöcke — er lief an
`try { … } finally { … }` vorbei in den nächsten Fang. Korrigiert, bevor eine
Zahl dastand.)

Enger gefasst — Fänge um ein Datenbankschreiben — bleiben elf, und drei davon
antworten `conflicting_record`. Der Vergleich der drei ist der Befund:

| Stelle | was sie mit dem Fehler tut |
|---|---|
| Gerätelebenszyklus | sieht hinein, `conflicting_record` **nur** bei `UNIQUE constraint failed`, wirft alles andere weiter |
| Wiederherstellung (ADR 0110) | `} catch {` — **jeder** Fehler wird zum Konflikt |
| Wurzelrotation (ADR 0114) | `} catch {` — dasselbe |

`conflicting_record` heisst in ADR 0110s Sprache: *jemand war schneller, oder
dieselbe Kennung wurde zweimal benutzt.* Das ist eine Aussage über die **Lage
der Person**. Eine volle Platte, eine gesperrte Datenbank, ein E/A-Fehler, eine
Tabelle, die eine misslungene Wanderung nicht hinterlassen hat — das sind
Aussagen über das **Gerät**. Und die beiden Pfade, die es verwechselten, sind
genau die, die jemand betritt, der **kein Gerät mehr hat**: Er liest „warten",
wo „nachsehen" richtig wäre, und niemand alarmiert etwas, weil eine Ablehnung
eine ordentliche Antwort ist.

Kein neues Verhalten erfunden: der Lebenszyklus wirft heute schon. Die
Unterscheidung steht jetzt **einmal** als `isPicoUniqueConstraintViolation` und
wird von allen dreien gelesen — statt dreimal verschieden, wovon zwei sie
verloren hatten. (SQLite meldet auch eine verletzte Primärschlüssel-Bedingung
als „UNIQUE constraint failed", weshalb die eine Zeichenkette beide Fälle
deckt.)

**Mein erster Test war grün aus dem falschen Grund, und die Pflanzung hat es
gezeigt.** Ich hatte die Tabelle gelöscht — da wirft schon das *Lesen*, weit vor
dem Fang, und der alte Code bestand die Prüfung mühelos. Mit einem Auslöser auf
`INSERT` entsteht der Fehler genau in der Transaktion: dann fällt die Pflanzung
an beiden Stellen mit „expected [Function] to throw an error".

Voller Lauf: 2.942 Tests, Ausgang 0.

**B71 — Zwölf Ablehnungen, die ein laufendes Home aussprechen kann und die
niemand je gegangen war (2026-09-07).** Die Frage, mit der ich anfing, war eine
andere und ihre Antwort ist ein sauberes Nein: **kein einziger** der 53
erklärten Ablehnungsgründe ist unerreichbar. Die vier, die meine erste Messung
nannte, waren Fehlalarme ihres eigenen Musters — drei entstehen als
Vorlagenzeichenkette, einer über ein `return`. Ich habe jeden von Hand
nachverfolgt, bevor ich die Null behauptet habe, und geprüft, wer nur *durch*
die Heuristik durchrutscht: drei, und es sind genau die drei, die ich schon
kannte.

Die zweite Hälfte derselben Messung war die interessante. **Zwölf Gründe kann
ein laufendes Home zurückgeben, und kein Test nannte sie.** Drei davon in einer
einzigen Tür: `registerPicoIdentityReaderKey`, wo ein Schlüssel die Vollmacht
bekommt, Reader-Custody zu öffnen — nicht Mitglied dieses Homes, keine aktive
Delegation, und ein Schlüsselsatz, der nicht der ist, den die Delegation nennt.

**Die Probe, und sie ist das Ergebnis dieses Befunds.** Ich habe die Bindung
„der Leserschlüssel ist der, den die Delegation nennt" ausgebaut und die ganze
Kernmenge gefahren: **1.098 Tests blieben grün, und nur der neu geschriebene
fiel.** ADR 0083 existiert für genau diese Bindung. Sie war richtig
implementiert und vollständig ungeprüft — was von aussen gleich aussieht.

Dasselbe beim Veto der Wiederherstellung: nimmt man die Prüfung „ist sie
überhaupt noch offen" heraus, bleiben **19 von 20** Tests der Datei grün.

**Was das Gehen nebenbei zeigte, und ich habe es nicht stillschweigend
geändert.** Der Abschlusspfad fasst unbekannte Kennung, falsche Prüfsumme und
falsches Ziel zu *einer* Antwort zusammen und sagt warum: „no caller may turn a
learned recovery id into a status oracle." Der Vetopfad unterscheidet drei.
Die beiden sind nicht dieselbe Frage — der Abschluss antwortet einem
Vor-Autoritäts-Aufrufer, das Veto einem Principal, dessen Identität das Home
bereits bewiesen hat, und dessen eigener Fingerabdruck eingesetzt wird. ADR 0110
sagt dazu nichts. Der Test hält deshalb fest, **was das Home heute tut**, und
der Kommentar nennt den Unterschied als unentschieden statt als entschieden.

Gegangen: 8 von 12. `refusal:check` hält den Rest: jeder erklärte Grund ist
erzeugbar und von einem Test genannt — oder er steht in einer Liste, die sagt,
**woran ein Gang hängt**, nicht „später". Vier stehen dort.

Drei Pflanzungen: ein Grund verliert seinen Gang, ein neuer Grund wird erfunden,
und eine bezahlte Schuld bleibt in der Liste stehen (auch das ist ein Fehler —
eine Liste, die Bezahltes führt, glaubt niemand mehr). Die zweite zeigte die
Grenze der Heuristik und sie steht jetzt im Kopf des Prüfers: ein erfundenes
`rotation_impossible` teilt ein Vorlagenpräfix und fällt darum eine Regel
später auf, mit dem zweitbesten Satz statt dem besten.

**Die vier Schulden sind am selben Tag bezahlt worden, und drei von ihnen
hatten kein einziges Netz.** Die Liste im Prüfer ist leer — was ein Zustand ist
und kein Zufall, denn der Prüfer meldet es als Fehler, wenn sie eine bereits
bezahlte Schuld weiterführt. **53 von 53.**

| Gegangen | Was der Gang brauchte |
|---|---|
| `recovery_prepare_unavailable` | eine *gültig signierte* Vorbereitung einer fremden Wurzel — die Unterschrift ist die ganze Authentifizierung, der Lebenszyklus wird erst danach befragt |
| `inactive_sponsor` | einen Bürgen, dessen Identität Mitglied ist und dessen Delegation es nicht gibt — der Fall, den die Mitgliedschaftsprüfung eine Zeile darüber nicht sehen kann |
| `inactive_grant` | einen Umschlag gegen einen erloschenen Grant: „deine Vollmacht ist zu Ende" ist nicht „deine Bytes sind falsch" |
| `completion_failed` | einen Fehlschlag, den die geschlossene Liste der vier Sperrmeldungen nicht kennt — die Person soll nicht „entsperren" lesen, wenn Entsperren nichts hilft |

Vier Pflanzungen, jede in einer eigenen Datei: die Vorbereitung nimmt Fremde
an, der Bürge wird nicht mehr geprüft, der erloschene Grant liest sich wie eine
Fälschung, und jeder Fehlschlag heisst „Vault gesperrt". **Alle vier fallen,
und 34 andere Tests blieben grün** — jede der vier Ablehnungen hatte also
wirklich kein zweites Netz.

Voller Lauf: 2.940 Tests, Ausgang 0. Nur der Kern hat sich bewegt (1.100 →
1.102), die anderen sechzehn Paketzahlen unverändert — nachgesehen, nicht
gerechnet.

**B70 — Ein Vokabular, das dem Protokoll gehört, stand 29 Mal von Hand
ausbuchstabiert da (2026-09-07).** Der Weg dorthin ging über eine Fehlmessung.
Ich hatte gefragt, welche Ablehnungsgründe in einem Typ stehen und nirgends
erzeugt werden; vier kamen heraus, und **alle vier waren Fehlalarme meines
Musters** — drei entstehen als Vorlagenzeichenkette (`recovery_${row.status}`),
einer über ein `return`. Interessant war nicht die Antwort, sondern die Stelle,
die sie verbarg:

```ts
status: 'pending' | 'superseded' | 'vetoed' | 'lapsed' | 'consumed';
```

Das ist `picoHomeDeviceRecoveryPendingStatuses`, die geschlossene Liste des
Protokolls, ein zweites Mal geschrieben — und daneben ein `as`-Cast, der einen
sechsten Zustand lautlos durchgelassen hätte.

Die Klasse gemessen: **118 geschlossene Listen, 29 Stellen, die eine davon von
Hand wiederholen.** `picoRulesDecisions` zehnmal, davon fünfmal in derselben
Datei. Fünf Widerrufsgründe im Renderer-Vertrag. Sechs Ereignisarten im Kern.
Eine stand **im Protokoll selbst**, gegen die eigene Liste eine Datei weiter.
Keine einzige war ein Zufall: jede Zweiergruppe habe ich nachgesehen, und jede
war dieselbe Sprache.

**Alle 29 waren vermeidbar, und das ist der eigentliche Punkt.** Jede Liste
exportiert ihren Typ. Ein Typ wird beim Bauen gelöscht — also verbietet ihn
keine Grenze, auch nicht die zum Renderer, wo ein bloßer Spezifizierer nicht
auflöst. Der Vertrag sagt das über seine eine Wertkopie selbst: „the one copy
in this file that cannot be an import." Die Typkopien konnten es. Nachgesehen
statt geglaubt: der gebaute `contract.js` hält danach **keinen einzigen**
Laufzeitimport.

Das Tor aus B69 hat die zweite Regel dazubekommen, weil es dieselbe Sache ist —
eine Wahrheit, zweimal geschrieben; einmal als Wert, einmal als Typ. Es nennt
im Fehlerfall den Typ, der stattdessen dastehen soll. Drei Pflanzungen: die
fünf Zustände wieder ausbuchstabiert (der Prüfer nennt Datei, Zeile und
Ersatztyp), dasselbe im Renderer-Vertrag (der Grenzfall, er wird erreicht), und
eine Liste ohne exportierten Typ — da sagt er, dass zuerst der Typ fehlt.

**Der Cast war das eigentliche Loch, und beide Richtungen sind gemessen.**
Neben der ausbuchstabierten Liste stand:

```ts
reason: `recovery_${row.status}` as Exclude<…>['reason'],
```

Der Cast ist ersatzlos weg. `row.status` ist an der Stelle bereits auf die
vier nicht-`pending` Zustände verengt, und `recovery_${…}` ergibt daraus genau
die vier Gründe der Vereinigung — der Compiler hält die beiden Listen selbst
zusammen. Beides nachgestellt, mit einem sechsten Zustand `quarantined` in der
Protokollliste: **mit** Cast baut alles durch, 0 Fehler; **ohne** ihn fällt der
Bau mit der Zeile, die den überzähligen Grund nennt. Ein Prüfer, den der
Compiler übernimmt, ist besser als einer, den ein Skript nachträgt.

29 → 0. Voller Lauf grün: 2.935 Tests.

**B69 — Ein Einzelfall-Tor stellte seit Monaten die richtige Frage, und
niemand hatte sie je dem Baum gestellt (2026-09-07).** `check-push-lifetime.mjs`
hielt zwei von Hand eingetragene Pfade zusammen und schrieb seinen eigenen
Grundsatz in die Kopfzeile: „One number, two places, and a check rather than a
hope." Die Frage an den ganzen Baum gestellt: **zehn exportierte Namen werden
zweimal definiert.** Sechs hält ein Prüfer oder ein Test. Vier hielt nichts:

| Name | zweimal in | gehalten von |
|---|---|---|
| `MAX_PICO_IDENTITY_READER_KEY_FRESHNESS_MS` | Kern / Vault | — |
| `MAX_PICO_READER_CUSTODY_SYNC_MANIFEST_MS` | Sync / Vault | — |
| `PICO_READER_CUSTODY_SYNC_GENESIS_DIGEST_HEX` | Sync / Vault | — |
| `picoCompanionDeviceAuthorityWarningDays` | Companion / Schale | — |

Die Frischeschranke aus ADR 0085 F4 stand sogar **dreimal**: das dritte Mal im
CLI des Vault-Daemons unter kürzerem Namen, in einer Zeile, die sich selbst
„mirrored" nannte. Und der Kern schrieb `5 * 60 * 1000`, das Vault
`5 * 60 * 1_000` — dieselbe Zahl, zwei Schreibweisen. Das ist die Handschrift
einer Kopie, nicht die einer Entscheidung.

**Drei der vier mussten gar nicht doppelt sein.** Die Abhängigkeitskante für
einen Import bestand bereits: Kern und Vault sehen beide das Protokoll, Sync
sieht das Vault. Sie stehen jetzt einmal im Protokoll, neben den kanonischen
Formen, deren Schranken sie sind. Die vierte ist erzwungen und bleibt:
`contract.ts` ist rendererseitig und hält genau **einen** Import, und der ist
typ-only — ein Wertimport zöge den Modulgraphen des Companions in den Renderer.

**Das neue Tor ist die Bindung, nicht die Hoffnung auf eine.** `copies:check`
liest beide Stellen und rechnet nach; Zahlen werden ausgewertet, damit
`5 * 60 * 1000` und `5 * 60 * 1_000` nicht als Abweichung zählen — es geht um
den Wert, nicht um die Schreibweise. Jeder Eintrag nennt die Dateien, in denen
der Name stehen soll, damit auch das *Verschwinden* einer Kopie auffällt; das
konnte der Vorgänger, und ohne die Liste wäre es verloren gegangen. 565
Konstanten über 254 Dateien, sieben begründete Doppelungen.

**Der Vorgänger ist darin aufgegangen.** Eine Regel, die zweimal implementiert
dasteht, ist genau das, wogegen sie gerichtet ist; ADR 0150 und die Statusdatei
nennen jetzt den Nachfolger, mit Datum.

Drei Pflanzungen: eine Kopie driftet (die Schale warnt 45 Tage, der Companion
30), eine argumentierte Stelle verschwindet (`export` weggenommen), eine neue
unbegründete Kopie kommt dazu — die dritte ist genau die Form, die dieser
Befund gefunden hat.

**Was das Tor nicht kann, und es steht in seinem Kopf.** Es liest
`export const NAME = ...;`. Die dritte Frischeschranke im CLI war ohne `export`
und unter anderem Namen — die hat die *Messung* gefunden, nicht die Regel.

**B68 — Der ADR sagt „erbt statt zu verdoppeln", der Code verdoppelte
(2026-09-07).** ADR 0114 begründet das Vetofenster der Wurzelrotation nicht
selbst. Er schreibt, die Rotation *erbe* von ADR 0110 „its device asymmetry,
veto delay and loudness **rather than duplicating them**" — eine Bedrohung, eine
Antwort. Der Kern hatte sie trotzdem verdoppelt:
`PICO_IDENTITY_ROOT_ROTATION_VETO_WINDOW_MS = 48 * 60 * 60 * 1_000`, ein zweites
Mal geschrieben unter einem zweiten Namen, in einer Datei, die die Zeiten der
Wiederherstellung eine Zeile weiter oben korrekt aus dem Protokoll *bezieht*.

Heute stimmen die beiden Zahlen. Das ist kein Zustand, das ist ein Zufall mit
einem Datum darauf: Wer ADR 0110 auf 72 Stunden hebt, hebt das eine und lässt
das andere stehen — und der Satz „die Rotation erbt" wäre ab diesem Tag falsch,
ohne dass irgendetwas rot wird.

Die Rotation liest ihr Fenster jetzt aus dem Protokoll, wo es genau einmal
steht, und zwar dort, wo der geerbte Wert steht statt neben der kanonischen
Form der Rotation — weil er *dieser Wert ist* und kein zweiter, der zufällig
gleich lautet. Der Grund ist derselbe, den die Wiederherstellungszeiten schon
nennen: eine Zeremonie-Fläche auf der Personenseite muss dieselbe Schranke
zeigen, die das Home durchsetzt, also ist es Protokollpolitik und keine
Wirtseinstellung.

**Zwei Netze, weil ein Netz die falsche Seite gehalten hätte.** Der Test im
Protokoll hält die beiden Protokollwerte zusammen; er hätte einen Rückfall im
Kern nicht gesehen, denn der liegt jenseits des Imports. Der zweite Test steht
deshalb dort, wo der Fehler *war*. Beide gepflanzt: 72 Stunden im Kern
(`expected 259200000 to be 172800000`, und fünf weitere Tests fielen als
Folge — der neue nennt die Ursache), 24 Stunden im Protokoll
(`expected 86400000 to be 172800000`).

**Keine Zahl steht in einem der beiden Tests.** Ein Test, der 48 Stunden
wiederholt, wäre die dritte Kopie gewesen.

**B67 — Achtundfünfzig Minuten, und zwei meiner drei Vermutungen waren falsch
(2026-09-05).** Der Nutzer brachte die Zahl mit: „Verify release gates" 58 min,
Container-Rauchtest 19 min. Jeder Schritt der Kette einzeln mit der Wanduhr
daneben, lokal (der Läufer ist rund 2,5× langsamer, das passt):

| Block | s | Anteil |
|---|---|---|
| `display-zone:check` — 5 Pakete × **zwei Zonen** | **560** | 40 % |
| `clock:check` — 17 Pakete, verschobene Uhr | 370 | 26 % |
| `test` — 17 Pakete | 366 | 26 % |
| `build` | 32 | 2 % |
| `check` | 23 | 2 % |
| 40 schnelle Tore + Electron-Rauchtest | ~63 | 4 % |

**Der Kern in einem Satz:** `@pico/companion-shell` (141 s) und
`@pico/vault-daemon` (127 s) laufen in **vier** Durchgängen — normal,
verschobene Uhr, Kiritimati, Niue. 268 s × 4 = 1.072 s, **76 % der ganzen
Kette**. Die Rechnung geht auf: fünf Pakete × zwei Zonen = 556 s gegen 560
gemessene.

**Was ich vermutet hatte:**

- **Falsch:** `clock:check` sei der Hauptposten. Er ist der zweite. Das
  teuerste Tor ist `display-zone:check` — und ich hatte es für ein schnelles
  gehalten, weil es in der Kette zuletzt steht und ich es nie einzeln gestoppt
  hatte.
- **Falsch:** `--workspace-concurrency=1` sei der grosse Hebel. Nachgemessen:
  mit `=4` läuft dieselbe Menge in **342 statt 366 s**, alle 2.933 Tests grün,
  keine Kollision. Sieben Prozent. Vitest fährt die Dateien *innerhalb* eines
  Pakets längst parallel; die CPU ist satt, bevor das zweite Paket anfängt. Der
  Hebel ist keiner — und das wusste vorher niemand, weil an der Zeile kein
  Grund stand.
- **Richtig:** `check` verdoppelt `build`. In allen 17 Paketen dasselbe
  `tsc -p tsconfig.json` über dasselbe `include`, ohne `incremental`,
  Unterschied nur `--noEmit`.

**Gepflanzt, bevor das Tor fiel.** Ein Typfehler in `canonical-bytes.ts`, und
beide Tore antworteten wörtlich gleich —
`error TS2322: Type 'string' is not assignable to type 'number'`, `build` mit
Ausgang 2. Ein Tor herauszunehmen, ohne vorher zu zeigen, dass das andere
fängt, wäre geraten gewesen. `pnpm check` bleibt als Skript für die Hand; aus
der Kette ist es raus, und `build` fängt denselben Fehler **elf Schritte
früher**.

**Und dann die Aufteilung selbst.** Die drei Durchgänge wissen voneinander
nichts — sie wollen nur je eine andere Umgebung —, also stehen sie jetzt
nebeneinander auf eigenen Läufern statt hintereinander in einem Auftrag:
`test`, `clock:check`, Kiritimati, Niue. Die Wanduhr wird `max` statt `summe`;
lokal fällt die Kette damit von ~24 auf ~9 Minuten, und keine einzige Prüfung
geht verloren. Der ehrliche Preis: vier Mal Checkout, Install und Bau, also
mehr abgerechnete Minuten für weniger Wartezeit. `display-zone:check` nimmt
dafür eine Zone als Argument und sagt in seiner Schlusszeile selbst, wenn er
nur eine Hälfte gefahren ist — ein halber Lauf soll nicht wie ein ganzer
aussehen.

**Der Preis der Aufteilung ist eine zweite Stelle, an der die Kette steht**, und
den bezahlt kein Mensch, sondern ein Tor. `split:check` klopft `release:verify`
flach und hält jeden Blattschritt gegen das, was `ci.yml` startet: keiner darf
fehlen, keiner doppelt bezahlt werden, keiner im Läufer stehen, den die Kette
nicht kennt. Wer einen Schritt einhängt und den Läufer vergisst, hätte sonst
ein Tor, das lokal läuft und in CI nie — und beide Seiten sähen grün aus.

Drei Begriffe braucht das, jeder mit Grund statt als Ausnahme: was *neben* der
Kette stehen darf (der Install, der Audit-Schritt aus ADR 0122 Y1, der
Tag-Prüfer), was **geteilt** ist (`display-zone:check` in zwei Hälften), und
was **Voraussetzung** statt Tor ist (`pnpm build`, weil kein Läufer ohne `dist`
etwas importieren kann). Die ersten beiden Einträge hat das Tor selbst
gefunden: beim allerersten Lauf meldete es den Audit-Schritt und den
Tag-Prüfer, die längst dastanden.

**Vier Pflanzungen, alle gelesen:** ein Durchgang in `verify:passes`, den die
Matrix nicht kennt (*„passes on a desk and never on the runner, and both look
green"*); eine Zone, die aus dem Läufer fällt (*„shared in 2 parts, and one of
them is missing"*); ein Schritt, den CI zweimal startet; und derselbe Schritt
zweimal in der Kette. Die letzte kam aus einer Pflanzung, die etwas anderes
zeigen sollte — der Bericht nannte die Folge zweimal statt die Ursache einmal,
und das ist jetzt eine eigene Regel.

**Und `split:check` stand zuerst falsch — am Ende der Tore.** Der erste
Probelauf zeigte es: er lief nach `companion:release-check`, also nach allem
Teuren. Ein Tor, das nur zwei Konfigurationsdateien gegeneinander hält, kann
seinen Fehlschlag in einer Sekunde melden; ihn vierzig Minuten später zu melden
heisst, für eine vertippte Zeile den ganzen Auftrag zu bezahlen. Es steht jetzt
neben `supply:check`, dem anderen Leser von `ci.yml`.

**Und der Fehler, den die Teilung selbst erst gemacht hat.** Drei Aufträge —
Home-Bild, Relay-Bild, Client-Paket — standen auf `needs: verify`. Das hiess
bis zum 2026-09-05 *„alles ist grün"*, weil `verify` die ganze Kette fuhr;
seit der Teilung heisst es nur noch *„die Tore sind grün"*. **Ein Bild hätte
veröffentlicht werden können, während eine Testmenge daneben rot ist** — genau
das stand nach meinem eigenen Umbau eine Stunde lang in `ci.yml`, und keiner
der bisherigen Prüfer sah es, weil sie Schritte lesen und keine Abhängigkeiten.

`split:check` liest jetzt auch die Aufträge: wer auf eine Hälfte der Kette
wartet, muss auf beide warten. Die Regel hat den Fehler in allen drei
Aufträgen gefunden, bevor er den Läufer erreichte. Zwei weitere Pflanzungen
dazu gelesen — ein Auftrag, der wieder nur auf eine Hälfte wartet, und eine
Testmenge, die ganz aus der Matrix fällt.

**Eine Wahrheit, ein Zuhause:** das Flachklopfen der Kette steht in
`scripts/verify-chain.mjs` und wird von beiden Lesern geholt. Der zweite ist
`measure-progress-numbers.mjs`, der die Schrittzahl für `progress.md` zählt —
er hätte nach der Teilung **zwei** gezählt und die Zahl der Hälften für die der
Schritte gehalten.

**Und der zweite Auftrag, 19 Minuten — dort ist es nicht nur Zeit.** Die
Containeraufträge bauen jedes Bild **zweimal**: einmal geladen und
rauchgetestet (amd64, dann arm64 unter QEMU), einmal für die
Veröffentlichung — und einen Schichtenspeicher gab es nirgends. **Was
veröffentlicht wurde, hatte also niemand angefasst.**

Der Satz dagegen steht im selben Arbeitsablauf schon da, eine Fläche weiter,
für das Client-Paket (ADR 0153 PK6): *„the artifact a person downloads is the
one that was verified — not a second build made for publishing, which is one
build of one artifact too many."* Für die Bilder galt er nicht.

Alle sechs Bauschritte teilen jetzt einen Schichtenspeicher, je Bild ein
eigener `scope`. Der Release-Schritt setzt damit genau die Schichten zusammen,
die eben rauchgetestet worden sind. **Dass es schneller wird, ist die Folge und
nicht der Grund** — am meisten bei arm64, das hier emuliert läuft.

**Was hier nicht bewiesen ist, vor dem Ausliefern gesagt:** dass fünf Aufträge
auf dem Läufer schneller fertig sind als einer. Der Vorlauf je Auftrag —
Checkout, Install, Bau — ist von hier aus nicht messbar; die Rechnung geht auf,
solange er kleiner ist als die 22 Minuten, die die Reihe gekostet hat.

**Nicht angerührt:** `display-zone:check` und `clock:check` inhaltlich. Beide
haben einen aufgeschriebenen Anlass — drei Tests, die an einem Vormittag
umfielen, und drei, die den erwarteten Tag von Hand nachbauten. Sie sind teuer,
weil sie echte Prozesse viermal starten; das ist ihr Wert.

**B66 — Der Messer hielt acht gelungene Wiederherstellungen für Ablehnungen
(2026-09-04).** `pnpm link:walk` zählte eine Operation als angenommen, wenn das
Home `outcome === 'ok'` antwortete. Das Home antwortet aber auf **drei** Wegen
erfolgreich, und zwei heissen anders: `recovery_pending` und
`rotation_pending`. Beide *nehmen* an — sie legen einen anhängigen Vorgang an
und starten das Vetofenster. Im letzten Lauf standen **acht** solcher Zeilen in
der Spur, jede als Ablehnung gezählt.

**Die Kopfzahl hat es nicht verschoben**, und das ist der Grund, warum es so
lange stehen konnte: `home.device.recovery.submit` liefert in einer anderen
Stufe ein `ok`, also war der Name ohnehin grün. Ein Fehler, den das Ergebnis
zufällig deckt, ist trotzdem einer — und beim nächsten Mal hätte er gedeckt,
dass die Wurzelrotation nie ankommt.

**Und der dritte Sammelruf hatte keine Auflösungsstufe.**
`home.device.recovery.submit` verzweigt über `args.phase` in `prepare` (Kopf
lesen), `initiate` (Geräte-Satz ersetzen, Vetofenster starten) und `complete`.
Die Flächenliste nennt alle drei ausdrücklich; die Messung zählte den Namen.
Eine Stufe durchzubringen färbte die anderen grün — dieselbe Lücke wie bei den
zwölf Autoritätsressourcen (B58), nur eine Tür weiter.

**Was die Messung dann sagte, und es war nicht, was ich vermutet hatte:**

```
3 of 3 phases behind `home.device.recovery.submit` were accepted.
recovery_pending x8 - accepted (ADR 0110: … das Vetofenster läuft)
```

Alle drei Stufen sind begangen, auch die folgenreiche. Der Verdacht, hinter dem
Sammelruf liege eine nie gegangene Stufe, war **falsch** — und das ist jetzt
gemessen statt gehofft. Der Fehler lag im Messer, nicht im Haus.

**Damit sich das nächste Erfolgswort nicht verstecken kann**, druckt der Lauf
jetzt jedes gesehene Ergebnis mit seiner Zählung daneben — `recovery_vetoed`,
`recovery_not_effective` und `recovery_lapsed` stehen dort als Ablehnungen, wo
sie hingehören. Und die Spur nennt ihren Unterscheider beim Namen
(`resource:` / `phase:`) statt ihn an die Position zu hängen: dieselbe Zeile
hatte am 2026-09-02 schon einmal still die Bedeutung gewechselt, als ein
drittes Feld dazukam.

**Gepflanzt und gelesen:** heisst der Fall im Home anders, sagt der Leser „keine
Stufe lesbar" statt einer falschen Null.

**B65 — Eine Prüfung, die den Namen einer Sache entfernt, hat die Sache nicht
entfernt (2026-09-04).** Der dritte Lauf kam durch bis Chromium — die Behebung
aus B64 trug, `Downloading Electron binary...` stand da —, und diesmal sagte
das Protokoll alles:

```
Could not open the default X display
Gtk-ERROR: Can't create a GtkStyleContext without a display connection
exit status: none, signal: SIGTRAP, spawn error: none
apparmor_restrict_unprivileged_userns=0, unprivileged_userns_clone=1,
max_user_namespaces=31590
DISPLAY: unset
```

**Die Sandbox war nie eine Hürde.** Die Schalter standen offen. Der
`sysctl`-Schritt aus B62 war die Antwort auf eine Frage, die niemand gestellt
hatte — er bleibt stehen und sagt seit heute, *was er vorfand*, damit sich das
beim nächsten Mal von selbst klärt.

**Die Ursache ist die eine, die meine eigene Fehlerzeile ausdrücklich
ausschloss:** die fehlende Anzeige. `--headless` stand seit dem 2026-09-02 im
Aufruf und tut bei Electron 44 **nichts** — es wird angenommen und Ozone
startet trotzdem die X11-Fläche. Alle kopflosen Wege durchgemessen, keiner
trägt: `--ozone-platform=headless` endet im Speicherzugriffsfehler, auch mit
`--disable-gpu`, `--use-gl=swiftshader` oder `--in-process-gpu`;
`--headless=new` ebenso.

**Und mein Beweis vom Vortag war keiner.** Ich hatte `DISPLAY` und
`WAYLAND_DISPLAY` entfernt, der Lauf blieb grün, und daraus wurde die Zeile
*„a missing display is not a cause here"* — eine Behauptung, die im
Fehlertext des Prüfers stand und andere in die Irre geführt hätte. Entfernt
hatte ich die **Namen** der Anzeige, nicht die Anzeige: Ozone findet den
Wayland-Sockel auch als `wayland-0` unter `XDG_RUNTIME_DIR`. Mit dem dritten
Namen weg scheitert derselbe Lauf hier mit demselben `SIGTRAP` wie auf dem
Läufer. **Zwei Namen zu entfernen und Grün zu sehen heisst nicht, dass es ohne
die Sache geht** — es heisst, dass man den dritten Namen nicht kannte.

**Behoben, indem der Test sich seine Anzeige selbst besorgt:** ist keine
erreichbar, läuft er unter `xvfb-run --auto-servernum`. Das ist keine
Umgehung, sondern das, was ein Fenstertest braucht — im Unterschied zu
`--no-sandbox`, das die Lage änderte, die hier gemessen wird. Die Erkennung
fragt jetzt nach allen drei Namen.

**Zwei Zweige liefen sofort:** mit Anzeige grün; ohne Anzeige und ohne
`xvfb-run` eine Absage, die sagt, was fehlt. Der dritte — ohne Anzeige, mit
`xvfb-run` — ist der Weg des Läufers, und dieser Rechner hatte kein Xvfb. Für
ihn stand hier eine **Attrappe** auf dem Pfad, die die Flags verzehrte und den
Rest startete; sie belegte Erkennung, Umhüllung und Reihenfolge, und der Lauf
war grün. Was fehlte, stand ausdrücklich da, bevor es ausgeliefert wurde:
*dass Xvfb selbst das Fenster trägt, ist hier nicht bewiesen.*

**Der Nutzer hat Xvfb daraufhin installiert, und der erste echte Lauf war
rot.**

```
Failed to connect to Wayland display: Datei oder Verzeichnis nicht gefunden
Failed to initialize Wayland platform
The platform failed to initialize.  Exiting.       exit status: 133
```

`xvfb-run` setzt `DISPLAY`, und Ozone wählte trotzdem die **Wayland**-Fläche.
Es fehlte `--ozone-platform=x11`: wo dieser Lauf die Anzeige selbst stellt,
weiss er auch, welche Sorte sie ist, und sagt es jetzt.

**Und damit der eigentliche Befund dieses Eintrags.** Die Attrappe hatte
*genau diesen* Fehler verdeckt — sie gab statt einer virtuellen Anzeige die
**echte** zurück, und mit einer Wayland-Sitzung geht Ozones Wayland-Wahl ja
auf. Sie prüfte die Verdrahtung und log über die Welt. Das ist dieselbe Form
wie zwei Absätze weiter oben, wo zwei entfernte Namen für eine entfernte
Anzeige gehalten wurden: **ein Ersatz, der das Echte durchreicht, misst den
Ersatz.**

**Vier Gestalten, alle begangen**, mit echtem Xvfb und `pressReachedMain:
requestCheck` in jeder grünen: Anzeige da; keine Anzeige und kein `xvfb-run`
(Absage); keine Anzeige mit `xvfb-run` und ohne `XDG_RUNTIME_DIR`; und
`XDG_RUNTIME_DIR` gesetzt, aber ohne Wayland-Sockel — die beiden letzten sind
die zwei Gestalten, die der Läufer haben kann.

**B64 — Der Rauchtest kam nie bis zu Chromium, und meine Diagnose beschuldigte
die Sandbox (2026-09-04).** Der zweite CI-Lauf kam bis Schritt 38 und riss
dort. Die Ausgabe: meine Zeile `chromium sandbox: user_namespace`, danach meine
Diagnose — und **kein einziges Wort von Chromium**. Genau daran hätte ich es
merken müssen: ein blockierter Namensraum bricht *laut* ab.

**Die Ursache ist meine, und sie steht drei Zeilen über der Diagnose.** Die
Auflösung des Electron-Pfades startete ein Kind-Node, liess es
`require('electron')` ausführen und nahm dessen **ganzes stdout** als Pfad. Das
ging gut, solange die Binärdatei schon dalag — und nur dann. Electron 44
veröffentlicht nämlich *kein* Installationsskript mehr (die Registry sagt zu
`44.0.0`: `scripts: undefined`); die Binärdatei kommt beim **ersten `require`**,
und `index.js` meldet das vorher mit `console.log('Downloading Electron
binary...')`. Auf einem frischen Läufer stand darum das in `binary`:

```
"Downloading Electron binary...\n/pfad/zur/electron"
```

Nicht leer — also lief die einzige Prüfung, die es gab, ins Leere. Nachgestellt
statt vermutet: dieselbe Lage lokal hergestellt (das `dist`-Verzeichnis
beiseite), die **alte** Auflösung darauf losgelassen, und heraus kam
`{"status":null,"signal":null,"error":"ENOENT"}` **ohne eine Zeile Ausgabe** —
das Bild vom Läufer, Punkt für Punkt.

**Behoben, wo es entsteht:** der Pfad wird jetzt in diesem Prozess geholt statt
aus einer Ausgabe gelesen. Was der Download dabei meldet, ist eine Meldung an
den Menschen und nicht mehr die Antwort. In derselben nachgestellten Lage läuft
der Rauchtest damit **grün**, mit `Downloading Electron binary...` davor.

**Und die Diagnose selbst war der zweite Fehler.** Sie nannte zwei Ursachen,
die gleich aussehen, und liess die Zahlen weg, die dieser Prozess in der Hand
hielt: `status`, `signal`, `error` — `status ?? 1` warf sogar den Unterschied
zwischen *„mit 1 beendet"* und *„nie gestartet"* weg. Aus einer Ausgabe, die
zwei Ursachen zeigen sollte, folgten in Wahrheit **drei** Lagen, und die
richtige war nicht dabei. Jetzt steht da, was gemessen ist: Pfad und
Ausführbarkeit der Binärdatei, Status, Signal, Spawn-Fehler, die drei Schalter,
an denen die Namensraum-Sandbox hängt, und `DISPLAY`. Beide Gestalten gepflanzt
und gelesen — fehlende Binärdatei (`ENOENT`, nie gestartet) und fehlende App
(`status: 1`).

**Eine Ursache ist damit ausgeschlossen und steht nicht mehr als Vermutung da:**
eine fehlende Anzeige ist es nicht. Derselbe Lauf ist hier ohne `DISPLAY` und
ohne `WAYLAND_DISPLAY` grün, weil Electron 44 `--headless` annimmt — gemessen,
nachdem die alte Fassung es *behauptet* hatte.

**Was über den Läufer weiterhin offen ist, und diesmal ausdrücklich:** ob die
Namensraum-Sandbox dort überhaupt eine Hürde ist, weiss niemand — der Rauchtest
kam nie so weit. Der `sysctl`-Schritt aus B62 bleibt deshalb stehen; ihn jetzt
zu entfernen hiesse, in die andere Richtung zu raten. Er sagt jetzt, **was er
vorfand**, bevor er ihn setzt, denn sonst liest der Rauchtest daneben eine
Null, die dieser Schritt selbst geschrieben hat.

**B63 — Die Behebung von damals ist die Lücke von heute (2026-09-04).** Der
Prüfschritt neben `release:verify` riss den Auftrag: acht hohe Meldungen, sechs
davon gegen `fast-uri`, zwei mittlere gegen Fastify selbst. Lokal Zeile für
Zeile dieselbe Ausgabe — **das ist die Welt und nicht der Baum.** Genau dafür
steht dieser Schritt *neben* der Kette und nicht darin (ADR 0122 Y1): eine
veröffentlichte Meldung soll nicht aussehen wie ein kaputtes Haus. Diese
Entscheidung ist heute das erste Mal eingelöst worden.

**Und die Lücke trägt einen Namen, den dieses Haus aufgeschrieben hat.** In
ADR 0122 stand seit dem 2026-08-06 der Satz, drei Meldungen seien behoben
*„durch Neuauflösen auf `find-my-way@9.7.0` und `fast-uri@3.1.5`"*. Der
reparierte Bereich lautet inzwischen `>=3.1.6` — **die notierte Behebung ist
die verwundbare Fassung.** Eine Version, die als Antwort dasteht, ist eine
Aussage über einen Tag und keine Eigenschaft des Pakets; der Absatz steht jetzt
im Imperfekt, nennt sein Datum und sagt dazu, dass der Fänger für das nächste
Mal dieser Schritt ist und keine hier notierte Zahl.

**Behoben wurde wie beim ersten Mal, und das ist die eigentliche Zeile:** kein
`override`, kein Ignorieren, keine gesenkte Schwelle. Die Bereiche, die der
Baum längst deklariert — `^3.0.0` und `^4.0.0` —, lassen die reparierten
Fassungen zu; festgehalten hatte die alten allein die Sperrdatei. Neu aufgelöst
auf `fast-uri@3.1.7` und `4.1.4`, dazu Fastify von `5.11.2` auf `5.12.3` gegen
die beiden mittleren Meldungen unter `<5.12.1`. Danach: `No known
vulnerabilities found`, auch auf `moderate`.

**Keine der beiden mittleren findet hier eine Fläche**, gesucht statt
angenommen: `trustProxy` kommt im ganzen Baum kein einziges Mal vor, und von
67 Routen im Kern deklariert **keine** ein Fastify-Schema — die Argumente
werden selbst gelesen, nicht von der Bibliothek geprüft. Das steht hier, weil
es die Antwort *nicht* ändert. Eine Meldung, die heute keine Fläche findet, ist
keine Zusage für morgen, und die Fassung zu heben kostet weniger als das
Argument, warum man sie nicht heben müsste.

**Was daran begangen wurde.** Fastify ist die HTTP-Fläche des Homes, und eine
Nebenversion, deren Änderung *Schemaprüfung* heißt, ist keine Zahl, die man
ungesehen tauscht. Gelaufen sind `pnpm check`, **2.933 Tests**, dieselbe Menge
noch einmal unter verschobener Uhr — und `pnpm link:walk` gegen ein echtes
Home über echtes HTTP: **53 von 55, dazu 12 von 12 Autoritätsressourcen**, unverändert. Die Paketprüfung (Schritt 39)
blieb aus, weil sie `sudo chown root:root` braucht und dieser Rechner dafür ein
Passwort will; sie hängt an keiner der beiden Fassungen.

**B62 — Ich habe ein Tor in die Kette gehängt und nur auf meinem Rechner
geprüft (2026-09-04 gemeldet, für den Stand vom 2026-09-02).** Der Rauchtest am
echten Fenster kam am 2026-09-02 in `release:verify` — Befund B59, und die
Zeile darin lautete, ein Prüfer ohne Aufrufer sei kein Prüfer. Er bekam einen
Aufrufer und **riss CI beim ersten Lauf**:

```
The SUID sandbox helper binary was found, but is not configured
correctly. Rather than run without sandboxing I'm aborting now.
```

**Das ist B48, noch einmal, von der Hand, die B48 geschrieben hat.** Dort steht:
*„Die neuen Wege sind noch nie in CI gelaufen."* Ich habe lokal grün gesehen
und daraus geschlossen, dass die Kette grün ist. Ein Rechner ist keine Klasse
von Rechnern.

**Drei Unterschiede zwischen meinem Rechner und dem Läufer, und jeder allein
hätte gereicht:**

1. **Der setuid-Helfer.** In einem ausgepackten `node_modules` gehört
   `chrome-sandbox` nicht root. Die Antwort stand längst im Haus:
   `selectChromiumSandboxProbe` wählt ohne das Paket-Flag den
   **Namensraum**-Modus und gibt `--disable-setuid-sandbox` mit. Der Kern der
   Antwort ist, was sie *nicht* ist — `--no-sandbox`, das
   `check-companion-boundary` auf jeder Produktionsfläche verbietet. Die
   Sandbox bleibt an, nur nicht die setuid-Variante. Geholt statt
   abgeschrieben: eine zweite Fassung davon entschiede über eine Sandbox.
2. **Das CI-Flag.** `ci.yml` setzt `PICO_COMPANION_ROOT_OWNED_PACKAGE_PROBE=1`
   für den *ganzen* Schritt, weil die Paketprüfung den root-eigenen Helfer aus
   dem `.deb` verlangt. Mein Wähler hätte die Umgebung gelesen, den Paket-Zweig
   genommen und geworfen — **derselbe Fehlschlag noch einmal, nur mit einem
   anderen Satz.** Gefunden, indem die CI-Datei gelesen und der Lauf mit ihrem
   Flag nachgestellt wurde, statt ihn ein zweites Mal blind auszuliefern.
3. **Der Namensraum selbst.** Ubuntu 24.04 sperrt unprivilegierte
   User-Namespaces per AppArmor; mein Fedora-Rechner kennt den Schalter nicht
   einmal. Der Arbeitsablauf hebt die Sperre jetzt ausdrücklich auf, mit dem
   Grund daneben.

**Und weil ich den dritten Punkt von hier aus nicht prüfen kann**, erklärt sich
ein Fehlschlag jetzt selbst: der Läufer nennt beide Ursachen, die gleich
aussehen, und sagt dazu, dass `--no-sandbox` ihn zwar grün machen würde — und
damit ein anderes Programm messen als das ausgelieferte. Gepflanzt: ein
scheiternder Lauf, und die Diagnose steht da.

**Und die Zeile, die ich gegen den dritten Punkt schrieb, machte selbst eine
Umgebungsannahme.** `sudo sysctl -w` endet auf einem Kernel ohne diesen
Schalter mit **1** — nachgemessen, nicht vermutet — und hätte den Auftrag aus
einem *neuen* Grund gerissen: derselbe Fehler, nur eine Zeile weiter. Der
Schalter wird jetzt gesucht statt vorausgesetzt, und der Schritt sagt, in
welcher der beiden Welten er steht. Ein `|| true` daneben hätte auch ein
kaputtes `sudo` versteckt.

**Was ich daraus nicht behaupte:** dass es jetzt grün ist. Ich habe die Kette
lokal in CI-Gestalt und mit dem CI-Flag laufen lassen; der Läufer selbst
bleibt ungeprüft, bis er läuft. Das ist derselbe Satz wie beim ersten Mal, nur
diesmal vor dem Ausliefern gesagt.

**B61 — Phase 3 leitet auf einem echten Telefon ab, und der Weg dorthin drehte
eine Reihenfolge um (2026-09-04).** Der Nutzer hat ein A34 angesteckt. Was
dabei herauskam, in der Reihenfolge, in der es passierte:

**Der Beitritt war schon tot, bevor ich etwas anfasste.** Das Profil auf dem
Telefon ist auf die Host-Schlüssel eines Labor-Homes festgenagelt, dessen
Datenverzeichnis in `/tmp` lag — vom Reboot geleert. Es gibt kein Home mehr,
dem dieses Telefon vertrauen könnte. Das war die Antwort auf die Frage, ob
`build-and-run.sh` etwas Wertvolles zerstört: es zerstört nur, was der Reboot
schon unbrauchbar gemacht hatte. Gefragt wurde trotzdem vorher.

**Ein Modul fehlte auf dem Gerät, und das Skript hatte davor gewarnt.**
`run-capture-probe.sh` schiebt Companion und Protokoll nach, und sein
Kommentar sagt: *„Ein neues Modul ohne seinen Eintrag scheitert beim Import —
vor jedem `try`, also ohne ein Wort im Protokoll (am 2026-08-26 genau so
passiert)."* Seit Phase 3 hängt der Companion an
`@pico/module-spatial-recall`. Der Läufer schiebt es jetzt mit.

**Und dann die Reihenfolge, die das Gerät auffliegen liess.** `capture.mjs`
entsperrte erst den Vault und baute den Link auf, *dann* verdichtete es. Auf
einem Telefon ohne erreichbares Home endet das mit `ECONNREFUSED`, und
niemand erfährt, ob es überhaupt etwas zu sagen gab. Der Grund, es zu drehen,
ist aber nicht der Test: **einen Vault aufzuschliessen, um dann festzustellen,
dass man nichts zu sagen hatte, ist ein Preis für nichts** — und das Entsperren
ist eine sicherheitsrelevante Handlung, kein Vorbereitungsschritt. Verdichtet
wird jetzt zuerst, ohne Netz und ohne Schlüssel.

**Das Ergebnis, auf dem Gerät gemessen:**

```
{"step":"derived_locally","from":5}
{"step":"capture_failed","reason":"connect ECONNREFUSED …/daemon.sock"}
```

Fünf rohe Standortmessungen hinein, ein Parkplatz heraus — **auf dem Telefon,
ohne Klassifikator und ohne Netz.** Die erste Zeile war anfangs nicht da; „hat
es abgeleitet?" war ein Schluss aus dem Ausbleiben von `nothing_derived`, und
ein Schluss ist keine Messung. Sie trägt *dass* verdichtet wurde und nicht
*was*: ein Geräteprotokoll mit dem abgeleiteten Ort wäre genau die
Rohkenntnis, die Phase 3 dem Home gerade genommen hat, nur eine Datei weiter.

**Und dann ist der Nutzer den Beitritt mitgegangen, und die letzte Spanne
schloss sich am selben Tag.** Ein frisches Labor-Home, die Passphrase und der
eine CONTINUE von ihm, die drei Codes von `finish-join.sh` getragen — *„This
device is yours."* Danach der ganze Weg, auf echter Hardware:

```
{"step":"derived_locally","from":6}
{"step":"derived_kept","crossed":true,
 "memoryItemId":"mem_derived_22029af0…","from":6}
```

`from: 6`, weil der Erfassungsdienst einen **echten** Fix zu den gestellten
fünf dazugelegt hatte. Und die Gegenprobe am Home, die die ganze Phase trägt:

| | |
|---|---|
| `pico_observation` | **0 Zeilen** — keine einzige Rohmessung |
| Eintrag | `mem_derived_22029af0…` · `application/vnd.pico.parking-event` |
| Aufzeichnung | `kind: derived_observation, privacyDomain: private, sourceCount: 1` |

**Auch die Aufbewahrungsregel ist am Gerät bewiesen.** Von den Messungen blieb
genau die eine *nach* dem Übergang stehen; alles bis dahin war verbraucht und
weg. Das ist die Regel, die am Vortag noch als ungeprüfte Zeile im
Sondenskript stand.

**Und das Gerät hat einen Fehler gezeigt, den der Schreibtisch nicht hatte.**
Der Erfassungsdienst legte einen echten Fix sechs Minuten und zweihundert
Kilometer neben die gestellten. Nachgerechnet: ein Telefon, das acht Stunden
aus war und dann vierzig Kilometer weiter misst, ergab **`walking` mit hoher
Zuversicht**. Niemand ist gegangen — das Telefon hat nur nicht hingesehen, und
der Mittelwert über die Lücke ist keine Geschwindigkeit, sondern eine
Erfindung, damit etwas dasteht. Ein falsches „gehend" ist ausgerechnet das,
wonach die Parkplatzableitung sucht.

Die Regel hatte eine Mindestdauer und keine Höchstdauer. Sie hat jetzt beide:
über fünf Minuten trägt ein Paar nichts. **Am selben Tag gebaut, am selben Tag
vom Gerät widerlegt** — der Schreibtisch hätte diese Lücke nie erzeugt, weil
dort jede Probe eine gleichmässige Reihe ist.

**Was weiter nicht bewiesen ist, und dasteht statt zu fehlen.** Die Fixe waren
gestellt — eine Fahrt entsteht am Schreibtisch nicht. Der
`LocationManager`-Weg selbst ist am 2026-08-26 mit sieben echten Fixes
bewiesen worden, und einer davon hat hier mitgemessen; was fehlt, ist die
Kette an *einem* Stück: ein echter Parkvorgang mit echtem Sensor. Alle
gestellten Messungen sind nach dem Lauf vom Gerät gelöscht worden, damit
erfundene Werte nie einem Home als gemessen angeboten werden.

**B60 — Eine von Hand nachgerechnete Zahl ist einmal richtig (2026-09-04).**
Am 2026-09-02 wurden die sechzehn Zahlen, die `progress.md` über den Zustand
dieses Baums behauptet, gegen die Ausgaben der Tore gehalten: sechzehn
Treffer. Zwei Tage später, nach Phase 3, wich eine ab — **433 exportierte
Fähigkeiten gegen 436 gemessene**, weil drei neue Ausfuhren dazukamen und
niemand die Zeile mitzog.

Das ist die Klasse in Reinform: eine Zahl, die eine Aussage trägt, gepflegt
von Hand, und ein Nachrechnen, das nur einmal stimmte. `pnpm progress:walk`
rechnet sie jetzt nach — siebzehn Behauptungen, gegen neun schnelle Tore,
ohne Netz.

**Kein Tor, und der Name sagt es** (`measure-`, wie `link:walk` und
`route:walk`): es liest **Prosa** auf beiden Seiten, und ein Muster über Prosa
greift irgendwann daneben. Das ist keine Vermutung — beim ersten Lauf traf
mein eigenes Muster die Wire-Label-Zeile nicht, weil das Tor „129 protocol
labels spelled once" schreibt und ich „wire labels" gesucht hatte. Ein Tor,
das so danebengreift, meldet einen Fehlschlag, den niemand verursacht hat.

Dafür sagt es, was es **nicht** prüfen konnte, statt es als richtig zu zählen:
eine Zeile mit `?` ist eine Lücke und keine Bestätigung. Zwei Pflanzungen,
beide beissen — eine driftende Zahl (genau der heutige Fall) und ein Tor, das
seine Zeile umformuliert.

**Und das Werkzeug hatte beim ersten Lauf selbst ein Loch.** Es prüfte
siebzehn Zahlen aus *einem Absatz* — die Testzahlen und die Schrittzahl
daneben nicht. Nachgemessen: die Schrittzahl stand richtig (43, an dem Tag
zweimal von Hand mitgezogen — Glück, nicht Verfahren), und sie wird jetzt aus
`package.json` gezählt statt aus einer Torzeile gelesen: `release:verify` ist
eine `&&`-Kette, und ihre Glieder sind zählbar. **Die Testzahlen wichen an
drei Stellen ab** — Core 1.095 gegen 1.096, Companion-Core 264 gegen 273, Web
91 gegen 92, Summe 2.911 gegen 2.922 —, und alle drei kamen von Änderungen
desselben und des Vortags. Sie bleiben ungeprüft, weil sie einen vollen Lauf
von Minuten brauchen und ein Werkzeug, das Minuten braucht, nicht benutzt
wird; das steht als Grenze in seiner Ausgabe, mit dem Datum der letzten
Handzählung.

**Und derselbe Fehler war an dem Tag in meiner eigenen Berichterstattung.**
Ich habe dem Nutzer mehrfach „~79 ungepushte Commits" gesagt. Es waren
**sieben**: die Zahl stammte aus einer Zusammenfassung vor einer
Kontextverdichtung, und ich habe sie hochgezählt, ohne sie je gegen
`origin/main` zu halten. Eine geerbte Zahl, die eine Aussage trägt, die
niemand nachrechnet — dieselbe Krankheit, die dieser Abschnitt zwölfmal im
Baum beschreibt, einmal in dem, der ihn schreibt.

**B59 — Der einzige Beweis am echten Fenster lief seit Monaten nicht, und er
wäre gefallen (2026-09-02).** B58 liess eine Spanne offen: dass ein *Druck*
wirklich ankommt. Beim Suchen nach einem Harness dafür stellte sich heraus,
dass es eines gibt — `apps/companion-shell/src/electron-smoke.ts`, hinter
`pnpm test:electron`. Es fährt Preload, Dokument und Fensteroptionen des
Produkts und prüft die Isolationsnaht: kein `process`, kein `require`, und
genau die freigegebenen Namen.

**Es hat keinen Aufrufer.** Nicht in `release:verify`, nicht in `ci.yml`, in
keinem Skript, in keinem Dokument. Gesucht wurde im ganzen Baum.

**Und es wäre gefallen.** Der erwartete Satz von Brückenschlüsseln stand als
Liste von **neun** Namen; das Preload bietet **achtundsechzig**. Ausgeführt
statt vermutet: `electron_renderer_boundary_failed`, dazu zwölf Zeilen
`No handler registered for …`, weil das Fenster beim Laden mehr Kanäle ruft
als der Lauf hielt. Die Aussage dieses Baums, dass die Naht am echten Fenster
steht, war seit dem Wachsen der Brücke unbelegt.

**Repariert an der Ursache, nicht an der Zahl.** Die Erwartung wird jetzt aus
dem Kanalvertrag *abgeleitet*, der auch das Preload baut — eine Liste daneben
ist genau die zweite Fassung, die driftet (B50s Satz, hier zum vierten Mal).
Jeder Kanal bekommt einen Halter, ebenfalls abgeleitet. Und der Lauf steht in
`release:verify`, direkt vor der Paketprüfung; er braucht kein Display, das
wurde ohne `DISPLAY` nachgemessen.

**Die offene Spanne ist damit zu.** Der Lauf drückt den Prüf-Knopf des
Ruhezustands — im echten Dokument, über den echten Zuhörer, durch das echte
Preload — und der Hauptprozess sagt, ob es ankam: `pressReachedMain:
"requestCheck"`. Das ist die Kette vom Bedienelement bis zum Hauptprozess, und
sie ist zum ersten Mal begangen statt behauptet. Was weiter offen bleibt und
hier steht statt zu fehlen: ein Druck des *Fenstersystems*. Der stellt sich
bei der sicheren Eingabe, und dort beantwortet ihn ein echter Tastendruck.

Zweimal gepflanzt, beide beissen: eine Brücke verschwindet aus dem gebauten
Preload (`electron_renderer_boundary_failed`), und **der Knopf verliert seinen
Zuhörer** — er steht da und tut nichts, und der Lauf sagt
`electron_press_did_not_reach_main`. Für die zweite hatte dieser Baum bis
heute keinen Prüfer.

**Und weil ein Druck nicht alle Drücke sind** — genau der Satz, mit dem B36
anfing —, wurden am selben Tag einmalig *alle* gedrückt. Einunddreissig
Knöpfe trägt das Dokument; **zwanzig erreichen den Hauptprozess bei einem
blossen Druck**. Die anderen elf wurden einzeln nachgelesen, und alle elf sind
richtig: `home-rotate`, `device-add` und `device-renew-other` öffnen zuerst
eine Tafel, und `recall-grant`, `reader-custody-write`, `measure-submit`,
`depot-attach-submit`, `relay-claim-submit`, `first-run-restore`,
`first-run-join` und `recall-ask` weisen ein leeres Formular ab und sagen es —
bei einer steht der Grund sogar im Code: *„Ein leerer Satz ist kein Satz."*
**Kein toter Knopf.**

**Der Sammeldruck bleibt eine Messung und wird kein Werkzeug**, und der Grund
ist der Fund darin: gedrückt wird in Dokumentreihenfolge, und dabei *leckt
Zustand*. `device-add-camera` rief `renewOtherDevice`, weil zwei Drücke vorher
`device-renew-other` die Tafel auf „erneuern" gestellt hatte. Als stehende
Zahl gelesen wäre das ein Befund gewesen, den es nicht gibt. Wer diesen Weg
später baut, braucht pro Knopf einen gesetzten Zustand — und bis dahin ist
eine Zahl, die „braucht ein Formular" und „ist tot" in einen Topf wirft,
schlechter als keine.

**B58 — Ein Sammelruf bürgte für zwölf Flächen, und die Messung hatte
dieselbe zu enge Auswahl wie ihr Zwilling (2026-09-02).** `pnpm link:walk`
zählte Operationen, und zwei der 54 sind Sammelrufe: `home.authority.list` und
`home.authority.submit` verzweigen über ein `resource`-Feld. Wer eine von
ihnen einmal durchbrachte, färbte damit alle zwölf Ressourcen dahinter grün —
eine Auflösungsstufe, auf der genau die Frage wieder offen war, die diese
Messung beantworten soll.

Die Lücke war nicht neu: `check-link-reachability` hat sie eine Ebene darüber
schon einmal gefunden, als `reader_custody_domains` vom Home ausgeliefert und
von keinem Client je erfragt wurde. Dort ging es um *benannt*, hier um
*angenommen*.

Die Mitschrift trägt jetzt die Ressource mit. Das Ergebnis in zwei Schritten,
und der zweite ist der Befund:

- Mit der bisherigen Auswahl — nur die Companion-Shell-Testmenge — **11 von
  12**. Es fehlte `home_state`.
- Mit **jeder Testmenge, die ein echtes Home startet** — dieselbe Korrektur wie
  in B54, nur eine Messung tiefer — **12 von 12**: der Vault-Daemon fährt seine
  Link-Zeremonien und liest dabei den Zustand des Homes.

Die Operationszahl blieb bei 52 von 54. Auf der oberen Ebene trug die eine
Testmenge also alles; erst eine Auflösung tiefer fiel auf, dass die Auswahl zu
eng war. **Zwei Messungen, dieselbe Krankheit, im Abstand von Stunden
gefunden** — beide, weil jemand gefragt hat, wofür die Zahl eigentlich steht.

**Und beim Umbau wäre die Zahl fast still falsch geworden.** Der Leser erkannte
eine angenommene Operation an `endsWith(' ok')`. Das war richtig, solange zwei
Felder dastanden, und wurde mit dem dritten falsch: jede Autoritätsanfrage
hätte als abgelehnt gezählt. Aufgefallen ist es beim Schreiben, weil das Format
sich änderte — der Leser liest jetzt Felder und kann daran nicht mehr
zerbrechen.

**Nebenbei eine Grenze, die ihren Grund überlebt hatte.**
`check-link-reachability` sagte über sich, zwischen einer Laufzeitmethode und
ihrem Kanal und zwischen einer Brückenfunktion und einem Bedienelement prüfe
nichts, und begründete den Verzicht mit einer Messung von **44** Kanälen.
Nachgemessen: `check-companion-boundary` hält heute **68 Kanäle auf beiden
Seiten gleich benannt, 68 vom Hauptprozess beantwortet und 68 angebotene
Methoden je vom Fenster gerufen**, dazu 114 Elemente. Die Kette ist nicht nur
heil, sie wird gehalten. Was weiter niemand prüft, ist die letzte Spanne: dass
ein *Druck* wirklich bei einem laufenden Home ankommt — dieselbe Lücke wie B36,
und sie braucht ein echtes Fenster statt einer dritten Textprüfung.

**B57 — Ein Pfad, der dasteht und nie gegangen wird: der Prüfer sieht keinen
Transportschalter (2026-09-02).** Nach B56 blieben drei Routen mit Aufrufer und
ohne Durchlauf. Beim Nachsehen, was ihnen fehlt, kam etwas anderes heraus als
erwartet.

**Zwei davon werden im Produkt gar nicht über HTTP gerufen.** Die Zeremonien
des Vault-Daemons nennen einen Foundation-Pfad und stellen die Anfrage
*entweder* darüber *oder* über Link: `picoFoundationRequest` entscheidet das an
einem `linkClient`, und `picoLinkFoundationRequest` bildet denselben Pfad auf
eine Autoritätsressource ab. Gemessen: von sieben so abgebildeten Pfaden werden
zwei — `/api/home/membership-lifecycle` und
`/api/home/reader-custody/reader-grant-lifecycle` — ausschliesslich von
`apps/companion/src/home-authority.ts` gerufen, und die gibt **in beiden Fällen**
`livingDeviceLinkClient` mit. Der HTTP-Weg wird nie genommen, obwohl der Pfad
dasteht. Die anderen fünf stehen in `cli.ts`, wo der Standardtransport `local`
ist — also wirklich HTTP.

**Das ist der dritte Mechanismus nach B55**, und der einzige, den ein Textleser
nicht schliessen kann: ein Argument („diese Route hat keinen Aufrufer") würde
die Gegenprobe sofort widerlegen, weil der Abgleich den Pfad ja findet. Was
fehlt, ist keine Begründung, sondern eine Auflösung, die einen
Transportschalter liest. Der Prüfer sagt das jetzt über sich, mit Datum und
mit den beiden Namen.

**Die dritte Route wird getroffen und richtig abgelehnt.**
`POST /api/home/reader-custody/kek-rotations` ruft die CLI-Zeremonie
`rotate-domain` über den Standardtransport, und der Test fährt sie. Sie
antwortet `invalid_rotation_causes`, und das ist die richtige Antwort: eine
Drehung beantwortet einen Entzug (ADR 0088, Rotationsschuld), und eine Domäne
ohne Leser hat nichts zu drehen. Der Testkommentar sagt es seit jeher; was er
nicht sagte, ist die genaue fehlende Zutat, und die steht jetzt hier: ein
grüner Durchlauf braucht **erst einen Lesezugang, dann dessen Entzug als
Ursache** — und für den Entzug gibt es keine CLI-Zeremonie, sondern nur den
Companion-Weg über Link.

**Und eine Hypothese wurde beim Messen verworfen**, statt als Behauptung
stehenzubleiben: dass die Abbildungstabelle in `claim-home-ceremony.ts` allein
für diese Pfade bürge. Sie tut es nicht — jeder der sieben wird auch dort
genannt, wo die Anfrage wirklich gestellt wird. Zwei Minuten Messen statt einer
falschen Zeile in dieser Datei.

**B56 — Das Schreddern war noch nie gelungen, nur abgelehnt (2026-09-02).**
Nach B55 blieben fünf Routen mit Aufrufer und ohne Durchlauf. Zwei davon sind
jetzt gegangen, und beide haben beim Gehen etwas gesagt.

**`POST /api/memory/domains/:d/shred`** stand in der Messung als *erreicht und
nur abgelehnt*. Der bestehende Durchlauf geht die Ablehnung, und die ist
richtig: ohne Verschlüsselung gibt es keine Schlüssel zu zerstören, und ADR
0070 verlangt, das zu sagen statt zu lügen. Der Erfolgsweg — der, bei dem
wirklich etwas unwiederbringlich wird — war nie gegangen. Er braucht ein
*anderes* Home, weil die Entscheidung beim Start gilt und nicht beim Umlegen
(ADR 0104), und steht jetzt als zweiter Durchlauf mit
`PICO_MEMORY_ENCRYPTION` von Anfang an.

**Und er hat meine Erwartung widerlegt.** Erwartet war eine leere Liste. Was
zurückkommt, ist die genauere Aussage: **die Zeile bleibt, der Inhalt ist
fort** — `contentUnavailable: 'key_shredded'`, und der Eintrag steht weiter als
`active` da. Ein Haus, das die Zeile mitnähme, verlöre die Auskunft, *dass* es
etwas gab; ADR 0071 unterscheidet Vergessen von Verschwiegenheit, und dies ist
die Seite, auf der etwas verschwiegen wird. Gepflanzt: nimmt das Schreddern den
Nachbarraum mit, sagt es der Durchlauf.

**`POST /api/model/providers/:entryId/narrowing`** hatte einen Aufrufer
(`narrowModelProvider` auf der Betreiberfläche) und keinen Durchlauf, und der
Grund ist die Arbeitsteilung: der Eintrag entsteht auf dem Gerät der Person
über Link, verengt wird er auf der Fläche des Betreibers. **Keine Testmenge
hatte beide Hälften.** Jetzt stehen sie zusammen im Modell-Durchlauf. Auch hier
hat der erste Lauf etwas gesagt: **401**. Die Route steht in der Klasse
`host-admin`, und `loopback-dev` lässt sie nicht durch — wer die Maschine des
Hauses enger stellt, spricht als Betreiber und nicht als Gerät. Der Durchlauf
holt sich deshalb eine Betreibersitzung, und er geht auch die Ablehnung: mehr
als gemessen wurde, geht nicht, und die Antwort nennt die Zahl.

`pnpm route:walk` zählt danach **35 von 61**, und die Zeile „erreicht und nur
abgelehnt" ist leer.

**B55 — Der Aufrufer-Prüfer konnte nur fallen, wenn er zu streng war
(2026-09-02).** Aus B54 blieben sechs Routen übrig, die einen Aufrufer haben
und nie begangen wurden. Beim Nachsehen, wer sie ruft, stellte sich bei dreien
heraus: **niemand.**

- `GET /api/events`, der Blättern-Zwilling von `/api/events/tail`. Die Fläche
  liest den Schwanz und schreibt mit `POST`.
- `GET /api/memory/domains/:d/items/:id`, das Einzelstück neben seiner Liste.
- `GET /api/memory/retention-policies/:id`, dasselbe neben seiner.

**Drei Mechanismen, und jeder für sich reicht.**

*Der Stamm bürgte für die Route darunter.* Der Prüfer schnitt die Adresse am
ersten Parameter ab und schrieb daneben, der Stamm müsse „enden, wo die Route
endet". Die Vorschau `(?![A-Za-z0-9_-])` hielt das für ein angehängtes
*Zeichen* (`/api/auth/session` gegen `/api/auth/sessions`) und nicht für ein
angehängtes *Segment*: `/api/events` steht mitten in `/api/events/tail`. Jetzt
wird die ganze Route gebaut, Parameter als Platzhalter für genau ein Segment,
Ende an einer URL-Grenze. **Fünf von 61 Urteilen ändern sich, jedes von Hand
nachgesehen, kein Fehlalarm** — und damit fällt weg, was B44 für unauffindbar
erklärt hatte („ein Muster, das sie fände, meldete auch Richtiges als falsch").

*Prosa bürgte.* Für `GET /api/events` standen vier **Kommentare** im
Protokollpaket — „the current Foundation POST /api/events" und drei ähnliche.
Ein Kommentar enthält kein `'POST'` in Anführungszeichen, also sah die
Verbprüfung dort gar kein Verb und liess die Nennung für jedes Verb gelten.
`check-fingerprint-display` entfernt Kommentare seit dem 2026-08-21 und sagt
auch warum; dieser Prüfer tat es nicht.

*Und ein Präfix stellte sieben gerufene Routen still.* Das Argument für
`/api/home/reader-custody/` sagte, das Produkt trage diese Aufzeichnungen über
Link. Für sieben der zwölf Routen ist das falsch: die Zeremonien des
Vault-Daemons rufen `domains`, `reader-grants`, `reader-grant-lifecycle` und
`kek-rotations` genau dort, über HTTP, gegen ein echtes Home. Das Argument
trägt jetzt nur noch `items` und `writer-grant*`.

**Der eigentliche Befund ist aber die Form des Prüfers.** Er hatte genau eine
Art zu fallen — eine Route ohne Aufrufer und ohne Argument. **Zu grosszügig zu
sein war unsichtbar**, und daran sind B44 und B55 vorbeigekommen: die
Pflanzungen (alter Stamm-Abgleich, Kommentare wieder mitgelesen) liessen ihn
bestehen, nur mit anderen Zahlen.

Die Gegenprobe ist entscheidbar und steht jetzt darin: **was als *ohne
Aufrufer* begründet ist, darf der Abgleich nicht finden.** Wird es gefunden,
ist entweder ein Client gebaut worden und das Argument hat ihn überlebt, oder
der Abgleich ist zu weit geworden. Drei Pflanzungen, alle beissen — und die
erste Messung dieser Regel sagte „null Widersprüche", was ein Artefakt war:
die Prüfung stand *hinter* dem `continue` für gerufene Routen und lief genau
für die Fälle nie, um die es geht. Erst als sie an die richtige Stelle rutschte,
kamen die sieben heraus.

**Und eine Doppelung fiel dabei mit.** Die Route-Einträge trugen ihre Adresse
zweimal — einmal als `route`, einmal als `prefix` —, allein damit die
Schlussprüfung („ein Argument über eine Route, die es nicht gibt") sie nicht
meldete. Eine Wahrheit, zweimal geschrieben, und die zweite Fassung war nur
dafür da, eine Prüfung stillzustellen; damit prüfte sie die Route-Einträge
überhaupt nicht. Sie liest jetzt beide Gestalten, und bei einem Route-Eintrag
auch sein Verb.

Die Zeile des Prüfers sagt seither **37 mit Aufrufer und 24 begründet**, wo sie
vorher 40 und 21 sagte.

**Und die drei Geschwister wurden am selben Tag gemessen**, statt den Verdacht
stehen zu lassen. Drei Tore stellen dieselbe Frage („X hat einen Aufrufer"):

- `check-link-reachability` verlangt den Operationsnamen **in
  Anführungszeichen**, und genau das rettet es: von 54 Operationen wird keine
  einzige ausserhalb des Homes nur in einem Kommentar genannt. Die Gegenprobe
  hat es längst, nur anders formuliert — „an exemption that outlives its
  reason".
- `check-store-writers` sucht `.name(`, und dieser Baum schreibt
  `` `Registry.put()` `` in Kommentare — das Tor selbst tut es in seiner
  Kopfzeile. Nachgemessen mit entfernten Kommentaren: **dieselben 83**, keine
  lebende Instanz. Die Gegenprobe hat es ebenfalls.
- `check-capability-reach` entfernt Kommentare und hat die Gegenprobe.

Also: die Klasse ist echt, belegt war sie nur an einer Stelle, und zwei der
drei Geschwister trugen die Antwort schon. Das ist das zweite Mal an diesem
Tag, dass ein Verdacht sich beim Nachmessen auf einen einzigen Fall
zusammenzog — und beide Male war das Nachmessen billiger als der Umbau, den
der Verdacht nahegelegt hätte.

**B54 — Die Routenzahl war zu niedrig, weil die Messung sich ihre Zeugen
ausgesucht hatte (2026-09-02).** `pnpm route:walk` meldete 26 von 61, und zehn
der angeblich nie begangenen Routen waren die Reader-Custody-Familie. Der
Verdacht lag nahe, dass dort ein ganzes Merkmal ungegangen ist — es hat in
genau dieser Familie schon zweimal etwas gefunden (B34, B35).

**Der Verdacht war falsch, und das Nachsehen war die Arbeit.** Es gibt
`apps/companion-shell/src/reader-custody-real-process.test.ts`: sieben
Durchläufe, die den Raum anlegen, hineinschreiben, das zweite Gerät
hereinlassen, den Zugang zurücknehmen und das Schloss wechseln. Ein zweiter
Durchlauf wäre ein Duplikat gewesen; er ist geschrieben und wieder verworfen
worden, und das ist billiger als der Befund, den er nicht gefunden hätte.

**Der Grund lag in der Messung.** Sie fuhr zwei Testmengen — Web und
Companion-Shell —, und die Zahl las sich wie „so viele der bedienten Routen
sind je begangen worden". Sie hiess in Wahrheit „so viele hat *diese Auswahl*
begangen". Der Vault-Daemon fährt seine Zeremonien gegen ein echtes,
abgespaltetes Home und ruft dabei `/api/home/reader-custody/domains` und
`/reader-grants` über HTTP — eine dritte Testmenge, die niemand ausgewählt
hatte.

Die Auswahl ist jetzt die Eigenschaft, die sie meinte: **jede Testmenge, die
ein echtes Home startet.** Es sind genau drei, aus dem Baum gelesen statt
aufgezählt. Danach: **33 von 61** statt 26, ohne dass eine Zeile Produktcode
sich geändert hätte.

**Dieselbe Familie wie B52, eine Ebene höher.** Dort keyte ein Tor auf die
Gestalt seines Anlasses; hier fuhr eine Messung die Testmengen, die es zur
Zeit ihres Schreibens gab. Beide Male stand die Zahl da und stimmte — für eine
Frage, die enger war als die, die danebenstand.

**B53 — Das Haus hielt eine Antwort an einer Regel fest, die es nie gesagt
hatte — und das war die 52. Tür (2026-09-02).** `home.model.read.keep` war die
eine Link-Operation, die niemand je aufbekommen hat, und der geschriebene
Grund dafür war falsch: es hiess, das Test-Doppel könne die angesagte Form
einer Bibliotheksmessung nicht erzeugen. Das Doppel konnte sie nicht erzeugen,
aber der Grund lag im Produkt.

`picoModelAnswerSchema` sagte einem Modell für einen `token` nur
`{ type: 'string' }` an. Danach hielt `planner-reader` die Antwort gegen
`picoReaderTokenPattern` — höchstens 64 Zeichen, keine Leerzeichen — und warf
sie als `answer_was_not_the_declared_shape` weg. Der `topic` einer
Depot-Bibliotheksmessung ist genau so ein `token`: **ein Modell, das einen Satz
antwortet, hat getan, was ihm gesagt wurde.** Dasselbe für `text` (eine
Längengrenze von 8.000, nie gesagt), für `instant` (die kanonische Form, nie
gesagt) und für `reference`. Vier von sechs Wertetypen.

Der Kommentar über der Funktion sagte die ganze Zeit, worum es geht: *„a shape
declared, not hoped for … constraining the decoder is the difference between a
shape that is declared and a shape that is hoped for"*. Die Ansage war halb.
Und der Test, der das festhielt, hiess *„constrains the decoder rather than
asking politely"* — er hielt die halbe Fassung fest.

Repariert, indem das Muster und die Grenze aus `planner-reader` und
`@pico/protocol/instant` **abgeleitet** werden statt abgeschrieben. Das Doppel
befolgt jetzt, was ihm angesagt wird. Der Weg steht als Durchlauf: ein echtes
Depot wird geholt, der Zulieferer angehängt, ein gemessener Anbieter trägt die
breitere Erlaubnis, die Messung wird beantwortet, die Antwort behalten und
zurückgenommen. `pnpm link:walk` zählt danach **52 von 54**; es bleiben die
zwei aufgeschobenen Identitätsdrehungen (ADR 0114 T4). Gepflanzt: die halbe
Ansage wiederhergestellt, und der Durchlauf endet in `never_settled`.

**B52 — Neun Kopien der schwachen Zeitpunktregel, und das Tor dagegen sah nur
seine eigene Gestalt (2026-09-02).** ADR-Notiz und Torkommentar sagen seit dem
2026-08-20 dasselbe: „is this a canonical instant" existierte neunmal, jede
Kopie prüfte nur den `toISOString`-Rundlauf, die erweiterte Jahresform kommt
dadurch — `+275760-09-13T00:00:00.000Z` ist ein echtes `Date`, das sich selbst
zurückgibt, und `+` steht unter jeder Ziffer, also sortiert die fernste
Zukunft als Zeichenkette **vor jedem gewöhnlichen Jahr**. Die Regel zog nach
`@pico/protocol/instant`, und das Tor sollte „die zehnte Kopie" abweisen.

**Es gab neun, und es sah keine.** Der Sucher lautete
`toISOString\(\)\s*===\s*\w+` — genau die Gestalt, aus der die Regel
herausgelöst worden war: ein *Prädikat*, das wahr zurückgibt. Jede verbliebene
Kopie war eine *Wache*: `!==`, die wirft, und rechts oft ein Zugriff wie
`record.value` statt eines Bezeichners. Gemessen am 2026-09-02, neun Stellen —
und sie teilen sich:

- **Fünf trugen die Lücke selbst** (nur der Rundlauf, keine feste Breite):
  `@pico/identity`, das `dueAt` eines fälligen Eintrags im Home, die
  Zuliefererantwort im Protokoll, und zweimal `planner-reader` — der Wert, den
  ein *Modell* antwortet, und der Ablauf einer opaken Referenz. Nachgemessen
  statt behauptet: `planner-reader` nahm `+275760-…` an, `isPicoInstant` lehnt
  es ab.
- **Vier waren vollständig**, aber ein zweites Mal geschrieben:
  Companion-Erstlauf, Companion-Wiederherstellung, `recovery.ts` im Protokoll,
  `@pico/sync`.

Alle neun rufen jetzt `isPicoInstant`. Das Tor liest beide Vergleiche und
beide Seiten; gepflanzt mit genau der Wache, die dort stand — das alte Muster
findet null, das neue eines.

**Ein Tor, das nur die Gestalt kennt, aus der es entstanden ist, prüft seinen
eigenen Anlass und nicht seine Klasse.** Das ist die verallgemeinerbare Zeile
aus diesem Befund — und sie wurde am selben Tag gegen die anderen Tore
gehalten, statt als Verdacht stehen zu bleiben. Vier Detektoren wurden
nachgemessen, jeder mit der Gestalt, die er *nicht* sucht:

- `check-instant-rules`, Tagesarithmetik: sucht `24*60*60` und `86_400_000`,
  nicht die umgekehrte Reihenfolge `1000*60*60*24`. **Null lebende Fälle.**
- `check-store-writers`: sucht `  public name(`, und in TypeScript ist eine
  Methode ohne Modifikator öffentlich. Mit optionalem `public` nachgezählt:
  **dieselben 83.**
- `check-fingerprint-display`: sucht den Namen unmittelbar vor `.slice(`, also
  keinen Zwischenwert. 44 Stellen legen einen Fingerabdruck auf eine lokale
  Bindung; **keine davon kürzt ihn.**
- `check-wire-labels`: sucht `export const NAME = '…'` ohne Typannotation.
  **Keine versionierte Zeichenkette steht in der anderen Gestalt.**

Der Blindfleck besteht also jeweils, und er ist nirgends belegt. Und vier der
fünf sagen ihre Grenze bereits selbst — `check-fingerprint-display` nennt sogar
den Grund, warum es die weitere Gestalt *nicht* fangen will („eine Regel, die
bei jedem `.slice(0, N)` anschlüge, ist eine, die man umgeht"). Das
Zeitpunkt-Tor war der Ausreisser, und der Grund ist lehrreich: **die Reparatur
selbst hat die Gestalt entfernt, auf die das Tor dann keyte.** Aus Prädikaten
wurde eine gemeinsame Funktion, stehen blieben Wachen — und danach suchte es
nur noch nach dem, was es gerade beseitigt hatte.

**B51 — Vier weitere Fassungen derselben Signierregel, und eine Entscheidung
darunter (2026-09-01).** Das Tor aus B50 wurde absichtlich über den ganzen
Baum gelassen und nicht über das Protokollpaket allein. Es fand sieben weitere
Definitionen — und die Messung trennt sie in zwei Hälften, denn **ein Name ist
keine Regel**:

- **Vier sind dieselbe Regel, ein zweites Mal geschrieben**:
  `assertAsciiToken` und `fixedHexBytes` in `@pico/identity`,
  `assertAsciiToken` in `apps/companion/src/profile.ts`,
  `canonicalHexPattern` in `@pico/vault`. Alle drei Pakete hängen bereits am
  Protokoll und könnten die Regel von dort holen.
- **Drei sind derselbe Name über etwas anderem**: `assertAsciiToken` im
  Ereignisspeicher des Homes prüft mit einer Grenze von 256 statt 1024 und
  spricht in Sätzen zu einem Betreiber — sie prüft Konfiguration und nicht,
  was unterschrieben wird. `asciiBytes` im Vault und im Aussehen-Codec
  kodieren **ohne jede Prüfung**; sie zusammenzulegen gäbe dem Vault eine
  Prüfung, die er heute nicht hat, und das ist eine Änderung am Signierweg und
  keine Aufräumarbeit. Der Aussehen-Codec hat zudem mit Absicht *keine*
  Abhängigkeit, auch nicht auf das Protokoll.

**Entschieden am 2026-09-02: eine Regel, und der Aufrufer darf sein Feld
benennen.** Die Fassung im Identitätspaket nahm einen Grund als Parameter und
sagte `invalid_delegation_id` — sie nannte das **Feld**. Die des Protokolls
sagt `invalid_field_charset`, `empty_field`, `field_too_long` — sie nennt den
**Fehler**. Keine war die bessere: die eine sagt einer Person, *wo* etwas
falsch ist, die andere *was*.

**Und die Messung hat die Frage geschärft, nachdem der Nutzer sie zurückgab.**
Ich hatte zunächst geschrieben, kein Test halte diese Namen fest. Das stimmt
nur für `invalid_delegation_id` (eine Aufrufstelle, nirgends festgehalten);
die **drei Namen des Protokolls sind sehr wohl festgehalten** — in
`index.test.ts` an vier Stellen, in `memory-content-crypto.test.ts` und in
`link-direct.test.ts`. Damit fielen zwei der vier angebotenen Antworten aus,
und die empfohlene war eine fünfte, die ich vorher nicht gesehen hatte.

`assertAsciiToken(value, reason?)` wirft ohne Grund den Fehlernamen wie bisher
und mit Grund den Grund — und trägt den Fehler als `.fault` mit. **Kein
einziger Ablehnungsname ändert sich**, sieben Proben belegen es, und beide
Auskünfte existieren zum ersten Mal nebeneinander. Es ist die Gestalt, die
`PicoModelProviderNarrowingError` mit `refusal` und `measured` schon benutzt:
eine Ablehnung ohne ihre zweite Hälfte lässt raten.

Zwei Dinge fielen dabei mit ab. `value` ist jetzt `unknown` — die Fassung im
Companion-Profil hatte das, und sie hatte recht: ohne diese Zeile machte
`encode` aus einer Zahl klaglos ein Feld. Und die Regel bekommt zum ersten Mal
**einen eigenen Test**: 613 Prüfungen liefen grün über zwei verschiedene
Ablehnungen, weil keine eine festhielt, und ein Tor kann das nicht nachholen —
`check-canonical-bytes.mjs` zählt Definitionen, es führt keine aus. Gepflanzt:
die Meldung nennt wieder nur den Fehler (beisst), die Länge wieder in Zeichen
(beisst).

Der Bestand im Tor steht damit auf **null gleiche Regeln** und drei
Fundstellen, die nur den Namen teilen.

**B50 — Was unterschrieben wird, entschieden zwei Dateien, und in vier von
neunzehn Fällen verschieden (2026-09-01).** Beim Nachsehen, ob die letzte
Zyklus-Kante aus B49 lösbar ist, gefunden: die kanonischen Bytes-Regeln standen
zweimal im Protokollpaket — in `index.ts` für die Identitätsfamilien, in
`recovery.ts` für die sechs Familien des Wiederherstellungswegs — und das
Zeichenmuster ein drittes Mal in `model-context.ts`.

**Gemessen und nicht geschätzt**, neunzehn Proben über Zeichenketten, Hex und
Verkettung, beide Fassungen nebeneinander:

- **Die Bytes waren nie verschieden.** Keine Probe erzeugte zwei Ergebnisse.
- **Vier von neunzehn Ablehnungen waren verschieden.** `''` heisst in der
  einen Fassung `empty_field`, in der anderen `invalid_field_charset`; zu lang
  heisst dort `field_too_long` und hier wieder `invalid_field_charset`. Wer
  eine Ablehnung liest, bekommt je nach Datei eine andere Auskunft über
  dieselbe Sache.

**Und die Einigkeit über die Bytes hing an einer dritten Tatsache.** Die eine
Fassung misst die Länge in Bytes, die andere in Zeichen. Das fällt nur nicht
auf, weil das Zeichenmuster ASCII zulässt und dort beide Zahlen dieselbe sind.
Liesse eine der drei Kopien je ein mehrbytiges Zeichen zu, nähme die eine
Fassung ein Feld an, das die andere ablehnt — bei genau der Frage, was
unterschrieben werden darf. **Eine Einigkeit, die von einer Tatsache in einer
dritten Datei abhängt, ist keine Regel, sondern ein Zufall mit einer Frist.**

Kein Test sah es: 613 Prüfungen des Pakets liefen grün über beide Fassungen,
weil keine je die Ablehnung festhielt.

Repariert an der Ursache — die Regeln stehen in `canonical-bytes.ts`, einem
Blatt ohne eigene Importe, und alle drei Aufrufer holen sie von dort. Das Tor
`pnpm canonical:check` hält es, viermal gepflanzt: die Regel wieder zweimal im
Protokoll (beisst), eine neue Kopie ausserhalb ohne Eintrag im Bestand
(beisst), ein Bestandseintrag, der den Baum nicht mehr trifft (beisst), und
über einem leeren Baum (beisst).

**B49 — Ein Zyklus, der von der Reihenfolge lebte, ist umgefallen — an einer
Tür, die mit ihm nichts zu tun hatte (2026-09-01).** Beim Bauen von B37 kam
*ein* neuer Import hinzu: `pending-action.ts` holte `picoApprovalDataLayer`
aus `@pico/protocol/approval-statement`. Danach antwortete ein laufendes Home
auf `home.recall.keep` mit `lowestPicoOriginClass is not a function` —
Herkunftsklassen, an einer Tür, die eine Antwort behält. Kein Typfehler, kein
Testfehler an der Stelle des Imports, und im Baum steht kein Wort über
Erinnerungen und Signaturen, das die beiden verbände.

**Der Grund stand seit Langem im Code, als Kommentar.** `index.ts` gibt
`model-context.js` weiter aus, und `model-context.ts` holte
`picoEventOriginClasses` von dort zurück. Die Sammelausgabe beschrieb den
Zyklus selbst — *„a cycle that happens to work today only because the values
are read inside functions rather than at module evaluation"* — und liess ihn
stehen. Der neue Import kippte die Auswertungsreihenfolge, die Sternausgabe
kopierte aus einem halbfertigen Modul, und der Fehler kam als Ablehnung
irgendwo anders heraus. **Eine Ordnung, die von der Reihenfolge lebt, ist
keine Ordnung, sondern ein Zufall mit einem Datum darauf.**

**Repariert an der Ursache**: die Herkunftsklassen und die Familienliste des
Foundation-Protokolls stehen jetzt in eigenen Blättern (`origin-class.ts`,
`foundation-event-type.ts`), die nichts importieren und deshalb in keinem
Zyklus liegen können; die Sammelausgabe gibt beide weiter, damit kein Aufrufer
etwas umschreiben muss. Gemessen statt geschätzt: die Barriere gibt zehn
Module weiter, zwei davon holten Werte zurück, beide sind gelöst.

**Und die Klasse hat ein Tor.** `pnpm cycle:check` sagt: ein Modul, das die
Sammelausgabe weitergibt, darf keinen *Wert* aus ihr holen — Typen ja, die
werden gelöscht und legen keine Kante. Dreimal gepflanzt: die alte Kante
wieder gelegt (beisst), der genannte Ausnahmeeintrag still um einen Wert
gewachsen (beisst), über einem leeren Baum (beisst, und `vacuity:check` zählt
ihn seither mit).

**Eine Kante steht noch, benannt und datiert**: `recovery.ts` holt drei
Signatur-Bauer und `picoIdentitySuite` aus der Barriere. Die drei sitzen mitten
im Identitätsteil von `index.ts` und stützen sich auf ein Dutzend dortiger
Helfer; sie herauszulösen ist eine eigene Arbeit am Unterschreiben — der
heikelsten Stelle im Baum — und keine Zeile, die nebenbei mitgeht. Sie steht
im Tor mit Grund und Datum, damit die Zahl nicht so aussieht, als sei sie null.

**B48 — Die neuen Wege sind noch nie in CI gelaufen, also an zwei Kernen
nachgestellt (2026-09-01).** Die Kette riss in CI an einer Toraussage, bevor die
Testphase überhaupt begann — die elf Realprozess-Wege dieser Woche haben dort
also noch nichts bewiesen. Sie starten echte Prozesse (Home, Vault-Daemon,
Relay, Modell-Host), und der Runner hat zwei Kerne gegen sechzehn hier; genau
diese Sorte Test ist in diesem Baum schon einmal an Systemlast zerbrochen.

Nachgestellt mit `taskset -c 0,1`, der Form, mit der dieses Haus einen Runner
schon einmal approximiert hat: **316 von 316 grün** in der Companion-Shell, 317
Sekunden statt 97, und 91 von 91 im Web in fünf. Die Wege halten also auch,
wenn ihnen ein Achtel der Maschine bleibt.

Was das nicht sagt: ein Runner ist nicht nur langsamer, er hat auch weniger
Speicher und eine andere Platte. Die Aussage ist über die Kerne und über nichts
sonst — und sie ist billig genug, um sie vor dem nächsten Push zu wiederholen,
statt sie zu vermuten.

**B47 — Vier Wege ohne Pflanzung, nachgeholt (2026-08-31).** Beim Durchsehen
der eigenen Woche gezählt: von den elf Realprozess-Wegen, die zwischen dem
2026-08-27 und dem 2026-08-29 dazukamen, tragen sieben eine Pflanzung und vier
nicht — Depot anhängen, das echte Depot mit seinem Zulieferer, die Maschine
messen und der Postfachtausch. Ein Weg, der nie aus dem richtigen Grund
umgefallen ist, ist eine Behauptung und kein Beleg; dass er heute grün ist,
sagt nichts darüber, ob er es bliebe.

Alle vier sind nachgeholt, jede an der Stelle, an der der Weg wirklich hängt:
die ungefragte Erlaubnis, die nie mitreist; die Domäne der Person, durch eine
andere ersetzt; ein Modell, das der Host nicht bedient; und ein Gerät, das sich
zweimal dieselbe Eingangsadresse gibt, womit der zweite Tausch keine Rotation
mehr ist. Alle vier bissen, jede mit ihrem eigenen Satz, und die Sätze stehen
jetzt in den Wegen statt in einem Sitzungsprotokoll.

**B46 — „Abgelehnt" und „abgestürzt" standen in derselben Zahl (2026-08-31).**
Gemeldet wurde, `vacuity:check` weise nach, dass `check-release-tag.mjs` über
einem leeren Baum Erfolg melde. Nachgestellt: das tut es nicht. Ohne
Ref-Kontext überspringt es sich und sagt es; mit einem Tag-Kontext über einem
Baum ohne `package.json` warf es einen ungefangenen `ENOENT` und endete
ungleich null. Beide Wege sind richtig herum, und keiner ist ein Erfolg.

**Was die Meldung trotzdem trifft, ist die Zeile daneben.** Der Prüfer schrieb
„37 refused to call nothing clean" — und das weiss er nicht. Sein eigener
Kommentar sagt seit jeher, dass er einen Absturz nicht von einer Ablehnung
unterscheiden kann; seine Erfolgszeile behauptete das Gegenteil. Wer sie las,
las eine Aussage über gutes Verhalten, wo eine über Rückgabewerte stand.

Zwei Zeilen sind es jetzt statt einer: der Prüfer zählt getrennt und sagt
„ended non-zero - refused or crashed, which this audit cannot tell apart", und
`check-release-tag` fängt das fehlende `package.json` ab und sagt in einem Satz,
was fehlt, statt einen Stapelabzug zu drucken. Beide Wege - falscher Tag und
richtiger Tag - sind daneben nachgefahren.

**Und die eigentliche Lücke ist noch am selben Tag geschlossen worden.** Ein
Prüfer, der sich hier immer überspringt, wurde von diesem Audit nur in seinem
Sprungbein geprüft; was er im Tag-Bau über einem leeren Baum tut, sah nie
jemand. Wer sich überspringt, sagt jetzt daneben, *womit* er loslaufen würde,
und der Lauf mit dieser Umgebung muss dasselbe leisten wie jeder andere: über
einem Baum ohne Dateien nicht Erfolg melden. Wer keinen solchen Eintrag hat,
fällt auf — eine Liste von einem ist billiger als ein blinder Fleck, und der
nächste überspringende Prüfer muss sich erklären.

Nicht hineingehört eine Umgebung, die einen Prüfer ins Netz schickt:
`check-release-monotonic.mjs` fragt im Tag-Bau eine Registry, und ein Audit,
das das täte, prüfte die Registry. Es steht auch nicht drin, weil es sich hier
gar nicht überspringt — es scheitert am Netz und endet ungleich null, was diese
Prüfung ohnehin verlangt.

Drei Pflanzungen halten das fest: ein überspringender Prüfer ohne Eintrag, ein
Eintrag für einen Prüfer, den es nicht gibt, und ein Prüfer, der unter der
erzwungenen Umgebung doch Erfolg meldet. Alle drei bissen.

**Und die Regel selbst fiel am nächsten Tag um, in der einzigen Umgebung, in
der sie geprüft worden war: der falschen.** In CI meldete
`vacuity:check` den zweiten Release-Prüfer als übersprungen und ohne Erklärung.
Der Grund ist genau die Umgebungsabhängigkeit, über die dieser Befund
geschrieben wurde: `check-release-monotonic.mjs` überspringt sich, wenn
`GITHUB_REF_TYPE` gesetzt und kein Tag ist — auf einem Zweiglauf also immer —,
und hier ist die Variable gar nicht gesetzt, weshalb er nicht springt, sondern
am Netz scheitert. Die neue Regel sah ihn deshalb nie.

Ein Eintrag darf jetzt auch *begründen, dass er nicht erzwingbar ist*, und
dieser tut es: die Arbeit dieses Prüfers **ist** eine Registry-Abfrage, und ein
Audit, das ihn dazu brächte, prüfte eine Registry und hinge in jedem Lauf an
einem Netz. Beide Umgebungen sind jetzt nachgefahren — mit und ohne
`GITHUB_REF_TYPE` —, was beim ersten Mal zu tun gewesen wäre.

**B45 — Ein Argument ist ein Satz von damals, und drei waren abgelaufen
(2026-08-29).** Die Tore dieses Hauses lassen eine Lücke stehen, wenn jemand
sie *begründet* — rund vierzig solcher Sätze stehen verteilt in
`check-surface-classes`, `check-capability-reach`, `check-store-writers` und
`check-link-reachability`. Jeder war wahr, als er geschrieben wurde. Gelesen
wird keiner wieder, und ein Tor kann Prosa nicht prüfen.

Beim Nachlesen aller vierzig waren drei überholt, und alle drei am selben
Datum: dem 2026-08-26, als das Fenster den Schreibweg für Reader-Custody bekam
und die Sonde den Beobachtungspuffer zu füllen anfing.

- Die Reader-Custody-Routen waren damit begründet, „nothing in the product
  writes reader-custody content".
- `condensePicoObservations` damit, kein Gerät mit Sensor fülle den Puffer.
- `createPicoVaultDaemonReaderAccessUnlockPort` damit, nichts im Produkt
  erteile eine Leserberechtigung, was ADR 0130 E5 halb offen lasse.

**Alle drei Folgerungen hielten; keine der drei Begründungen tat es.** Das ist
der unangenehme Teil: eine Lücke, die aus dem falschen Grund offen steht, sieht
genauso aus wie eine, die aus dem richtigen offen steht — bis jemand den Grund
nachliest. Bemerkenswert daneben: ein *viertes* Argument über genau dieselbe
Tatsache, in `check-store-writers` über `deletePicoObservations`, war am
2026-08-26 mitgezogen worden. Dieselbe Wahrheit stand an zwei Stellen, eine
wurde nachgeführt und eine nicht.

**Kein Tor dafür.** Ein Datum je Argument zu verlangen und nach ein paar
Monaten zu warnen, erzeugte Lärm über Sätze, die noch stimmen. Was tatsächlich
geholfen hat, war billiger und steht schon in der Arbeitsweise: ein Durchlauf
durch eine Gegend macht ihre veralteten Sätze sichtbar. Alle drei fielen bei
Arbeiten auf, die zufällig daneben lagen — deshalb steht hier die Beobachtung
und keine Maschine.

**B44 — Vier bediente Routen, die niemand ruft, und der Prüfer nannte sie
erreicht (2026-08-29).** Die Folge aus B43, von Hand nachgezählt und dann
maschinell bestätigt. `check-surface-classes` sucht die *Adresse* eines
Aufrufers und schneidet sie am ersten Parameter ab. Zwei Löcher folgen daraus:
eine Adresse, die mehrere Verben bedient, wird von einem einzigen Aufrufer
verbürgt; und eine Sammeladresse bürgt für alles, was hinter ihrem Parameter
liegt.

Beides ist jetzt enger, und nur so weit, wie es sicher geht: bei Adressen mit
mehreren Verben wird in einem Fenster von zweihundert Zeichen um die Nennung
nach dem Verb gesehen - findet sich gar keines, gilt die Route weiter als
gerufen, denn ein Aufrufer, der seine Methode woanders herholt, beweist nichts
—, und wo eine Route hinter dem Parameter weitergeht, muss dieses letzte Stück
eigens genannt sein.

**Vier Routen standen daraufhin bedient und ungerufen da**, dieselben vier, die
die Handzählung gefunden hatte: `GET` und `DELETE /api/auth/session` - die
Fläche hält ihre Sitzung im Speicher und meldet alles auf einmal ab, statt
diesen einen Reiter - und `POST` und `DELETE /api/model/providers/:entryId/decision`,
die Foundation-Zwillinge zweier Link-Vorgänge, die das Fenster vom Gerät der
Person aus ruft. Alle vier sind jetzt begründet statt unbemerkt; die Zeile des
Prüfers sagt 40 mit Aufrufer und 21 begründet, wo sie vorher 44 und 17 sagte.

**Zwei bleiben unsichtbar, und das steht im Prüfer.** Eine Route, die nur aus
Sammeladresse und Parameter besteht - `GET /api/memory/retention-policies/:id`
neben ihrer Liste, `GET /api/memory/domains/:d/items/:id` neben ihrer -, hat
kein eigenes Stück, an dem ein Muster sie festhalten könnte. Beide sind gelesen
und beide haben keinen Aufrufer; sie stehen hier, weil ein Muster, das sie
fände, auch Richtiges als falsch meldete.

*Nachtrag 2026-09-02 (B55): das war zu früh aufgegeben.* Ein Abgleich über die
**ganze** Route statt über ihren Stamm findet beide, und er meldet nichts
Richtiges als falsch — fünf von 61 Urteilen ändern sich, jedes nachgesehen.
Beide sind jetzt begründet statt unsichtbar, und eine dritte kam dazu, die
niemand kannte.

**Und das Pflanzen fand den Fehler, den das Schreiben nicht fand.** Das erste
Argument für die Anbieter-Entscheidung war ein Präfix mit Verb - genau genug
aussehend - und stellte prompt `POST …/narrowing` mit stumm, eine Route, die
gerufen wird. Ein Argument, das eine einzelne Route meint, nennt sie jetzt
ganz.

**B43 — Sechsundzwanzig von einundsechzig Routen haben je einen echten Prozess
geantwortet, und ein Aufrufer bürgt für drei Verben (2026-08-29).** Dieselbe
Mitschrift wie bei den Link-Vorgängen, eine Fläche darüber: das gebaute Home
schreibt für die Dauer eines Laufs mit, welche Route mit welchem Status
antwortet, und gefahren wurden damals die Web- und die
Companion-Shell-Testmenge — eine Auswahl, die sich am 2026-09-02 als der Grund
für sieben fehlende Routen herausstellte (Befund B54). Seit
dem 2026-08-31 ist das ein Werkzeug statt eines Einzelfalls: `pnpm route:walk`,
der Zwilling von `pnpm link:walk`, dreimal von Hand gebaut und zweimal
weggeworfen, bevor es dafür eine Datei gab.

Von 61 bedienten Routen haben **26** einem getrennten Prozess mit einem Erfolg
geantwortet — die Zahl stand hier zuerst als 27, weil die Handzählung eine
Antwort mitzählte, die gar nicht aus `app.ts` kommt
(`GET /api/home/link/continuity` wird woanders registriert). Das Werkzeug zählt
den Schnitt und nennt solche Antworten daneben. Von den 34 übrigen sind **21**
in `check-surface-classes`
namentlich als aufruferlos begründet — meist, weil die Tür in Gebrauch der
Link-Zwilling ist. Bleiben **dreizehn, die einen Aufrufer haben und noch nie
angenommen wurden**, darunter das Abmelden, der Sitzungsblick, das Lesen einer
einzelnen Erinnerung, die Mitgliedschaftsrouten und die beiden
Anbieter-Entscheidungen der Betreiberfläche.

**Und beim Nachzählen fiel eine Schwäche des Prüfers auf, die er nicht
aussprach.** Er sucht die *Adresse* eines Aufrufers, nicht sein Verb. Fünfzehn
Adressen dieses Homes werden von mehr als einem Verb bedient —
dreiunddreissig Routen zusammen —, und für sie bürgt ein einziger Aufrufer für
alle: wer `POST /api/auth/session` ruft, lässt `GET` und `DELETE` darauf als
erreicht gelten. Enger gemacht wird es nicht, und das ist eine Entscheidung mit
Grund: ein Fenster um die Adresse herum nach `method:` abzusuchen meldete
Routen als unerreicht, die es nicht sind, und ein falsches Rot in einem Tor
kostet mehr als ein benanntes Loch. Die Grenze steht jetzt im Prüfer, mit der
Zahl daneben.

**Ein abgelaufenes Argument dabei gefunden und ersetzt.** Die
Reader-Custody-Routen waren damit begründet, „nothing in the product writes
reader-custody content" — was am 2026-08-26 aufhörte zu stimmen, als das
Fenster genau das bekam. Die Folgerung hielt, die Begründung nicht; sie heisst
jetzt, was wahr ist: es ist der Foundation-Transport für Aufzeichnungen, die
das Produkt über Link trägt.

**B42 — „Ein Mensch, der gefragt hat, verdient die Antwort jetzt" — und wartet
bis zu einer Minute (2026-08-29).** Beim Suchen nach einem Weg zur
Rückruffamilie gefunden, im Code und nicht geraten. Der Rückruf-Vorgang lehnt
*sofort* ab, wenn etwas nicht geht, und ADR 0116 W1 sagt warum: „The refusal
happens here, before anything is queued, rather than as a job that fails at
dispatch: a person who asked a question deserves the answer now." Kommt die
Frage aber durch, wird sie in die Modellwarteschlange gelegt, und die einzige
Stelle, die sie herausholt, ist ein Zeitgeber mit **sechzig Sekunden**
(`modelJobSweepIntervalMs ?? 60_000`). Es gibt keinen zweiten Auslöser: kein
Aufruf beim Einreihen, kein Wecken.

**Widerspruch ist es keiner, Spannung schon.** Die Fläche ist ausdrücklich
asynchron - `askRecall` gibt eine Vorgangsnummer zurück, und was fertig ist,
liest man daneben. Nur ist der Satz, der die sofortige Ablehnung begründet,
derselbe, der die Wartezeit fragwürdig macht: wer dasitzt und wartet, wartet im
schlechtesten Fall eine Minute, bevor die Frage überhaupt losgeschickt wird,
und im Leerlauf kostet ein Fegen nichts.

**Entschieden am 2026-09-01: beim Einreihen fegen, entprellt.** Eine
eingereihte Frage löst den Lauf selbst aus, mit einer Sperre von einer Sekunde
davor; der Zeitgeber bleibt als Netz für alles, was ohne Anwesende entsteht.
Die Sperre ist der Grund, warum er bleiben kann - er begrenzt, wie oft dieses
Home gegen einen Beschleuniger läuft, der beschäftigt sein kann, und ein Lauf
je Frage nähme diese Grenze weg. Ausgelöst wird erst nach dem tatsächlichen
Einreihen: eine abgewiesene Frage kostet keinen Lauf.

Die beiden anderen Antworten sind benannt und nicht gewählt: ein kurzer Takt
zahlte für immer Leerlauf, damit ein seltenes Ereignis schneller wird, und ein
„das dauert" in der Fläche liesse die Person weiter warten, während die
Maschine daneben nichts tut - als *Ergänzung* bleibt es sinnvoll, sobald ein
echter Anbieter langsam antwortet.

**Der Weg beweist es, statt es zu behaupten**: er stellt den Takt auf eine
Stunde. Käme die Antwort vom Zeitgeber, wäre er nach einer Stunde fertig statt
nach Sekunden; ohne den Auslöser fällt er nach einer Minute mit
`never_settled`, was daneben gepflanzt und gesehen wurde.

**Und der Takt ist seit dem 2026-08-31 stellbar**, was ihn von einer Vermutung
zu einer Zahl macht: `PICO_MODEL_JOB_SWEEP_INTERVAL_MS` steht jetzt neben den
beiden anderen Takten dieses Homes (ADR 0104s Betriebszeile). Er fehlte nicht
aus einem Grund, sondern als Auslassung — das Feld gab es, den Umgebungswert
nicht, und die Voreinstellung stand als `60_000` im Aufrufer.

**Der Weg, für den er gebraucht wurde, ging trotzdem nicht.** Über ein
behaltenes Korpusergebnis schien die Rückruffamilie erreichbar, ohne an ADR
0151 zu rühren; das war falsch, und warum, steht in B39. Übrig bleibt der
Umgebungswert, der für sich richtig ist, und eine Vermutung weniger.

**B41 — Die Foundation-Fläche ist zum ersten Mal gegen ein Home gefahren
worden, und sie hielt (2026-08-29).** `apps/web/src/api.ts` trägt die
Bedienoberfläche des Betreibers in zwanzig Funktionen, und `api.test.ts` prüft
sie zweiundzwanzigmal gegen ein ausgetauschtes `fetch` — es hält fest, *was*
geschickt wird, und das ist die Aussage, die auf der Companion-Seite dreimal
nicht gereicht hat (B31, B34, B36). Keine der zwanzig war je gegen einen
echten Prozess gefahren.

Neunzehn sind es jetzt, in der Ordnung, in der eine Person sie benutzt:
anmelden, nachsehen, Verschlüsselung entscheiden, ein Modul abschalten und die
Aufzeichnung einschalten, eine Aufbewahrungsregel anlegen, ändern und löschen,
einen Termin anlegen und im Raum wiederfinden, die Modellanbieter lesen, das
Relay-Konto entscheiden, ein Ticket ziehen, schreddern, das Kennwort wechseln
und alle Sitzungen beenden — auch die, die den Widerruf geschickt hat. Die
zwanzigste (`narrowModelProvider`) braucht einen gemessenen Anbieter und wartet
mit der Rückruffamilie auf B39.

**Kein Fehler. Das ist das Ergebnis**, und es ist eines: dieselbe Methode hat
auf der Companion-Seite vier gefunden. Was hier passierte, war dreimal ein
*Nein mit Grund*, und jedes davon hat den Weg besser gemacht statt ihn
aufzuhalten:

- Die Verschlüsselungsentscheidung ändert `enabled` nicht, sondern `decided` —
  der Schlüsselspeicher steht, bevor die Datenbank offen ist, also gilt sie
  beim nächsten Start. Der Weg hält jetzt genau das fest.
- Ein Home ohne Relay-Konto hat kein `decided: false`, sondern gar kein Feld.
  Abwesenheit ist Abwesenheit (ADR 0118 O4).
- Schreddern lehnt ab, solange der Inhalt im Klartext liegt: Schlüssel zu
  zerstören schützt nichts, wo nichts damit verschlossen ist — und das ist
  genau der Zustand einer Person, die die Verschlüsselung eben erst
  eingeschaltet hat.

**Die andere Hälfte der Fläche ist keine Frage-und-Antwort**, und sie stand
noch schlechter da: `websocket.test.ts` prüft den URL-Bau, und
`connectRealtime` hatte gar keinen Test — es hatte noch nie eine Verbindung
hergestellt. Auch das ist jetzt gegangen: ein Ticket ziehen, sich damit
verbinden, am Home ein Ereignis auslösen und warten, bis es ankommt. Damit ist
auch die *Form* geprüft, die der Leser erwartet — eine Nachricht, die er nicht
versteht, wirft er weg, und ohne diesen Durchlauf sähe das genauso aus wie ein
Home, das schweigt. Gepflanzt: lässt der Client das Ticket aus der Adresse,
kommt die Verbindung nie zustande.

Wo das Risiko wirklich sass, sagt der Vergleich damit deutlicher als jede
Vermutung: nicht in der Fläche, die über gewöhnliches HTTP mit einem Home
spricht, sondern dort, wo ein Client Aufzeichnungen *unterschreibt* und ein
Home sie Zeichen für Zeichen vergleicht.

**B40 — Einunddreißig von zweiundsechzig Fensterknöpfen sind nie ausgeführt
worden, und das ist eine Zahl zu einer Grenze, die schon dasteht
(2026-08-29).** `check-companion-boundary` sagt von sich selbst, was es nicht
kann: „between a runtime method and its channel, and between a bridge function
and a control, nothing checks". Gemessen: die Laufzeit des Fensters hat 62
Methoden, und 31 davon rief kein Realprozess-Weg je auf. Nach der
Relay-Familie unten sind es 26.

**Das ist für die meisten nicht dasselbe wie unbegangen.** Die Wege *unter*
ihnen laufen — Leserschaft beenden, ein zweites Pico aufnehmen, Host-Schlüssel
wechseln, einen Raum anlegen: alle in einem Realprozess-Test, nur über die
Client-Funktionen und nicht über das Objekt, das der Hauptprozess wirklich
ruft. Zwei Familien waren die Ausnahme und auf keiner Schicht begangen: die
Rückrufe (`keepRecall`, `forgetRecall`, `forgetMemory`, `keepAnsweredRead`),
weil Befund B39 sie versperrt, und die fünf Relay-Betreiber-Methoden.

**Die fünf sind noch am selben Tag gegangen worden**, weil sie das einzige
Stück waren, das auf *keiner* Ebene lief, und weil sie einen Prozess kosten und
nicht fünf: ein Relay beanspruchen, ein Konto ausstellen, es beenden, das Relay
vergessen. Nichts daran berührt das Home — ein Relay zu betreiben ist ein
anderer Hut als ein Pico zu haben, der Zugang liegt verschlüsselt neben dem
Profil statt im Vault, und Vergessen ist eine Sache dieses Geräts, von der das
Relay nichts erfährt. Der Schlüsselbund ist dabei ein Doppelgänger, und das
steht im Test: geprüft ist der Ablauf, nicht dass ein echter Keyring den Zugang
schützt.

Was zwischen Methode und Client-Funktion liegt, ist Klebstoff — aber nicht
immer dünner:
`endDomainRead` hat 35 Zeilen und sucht sich Domäne und Leser aus der Liste,
die es selbst vom Home liest, weil das Fenster den Host-Schlüssel nicht
behaupten können soll. `acceptOwnRenewal` hat 28, `admitHomeMember` 26.

**Trotzdem nicht durchgegangen**, und der Grund ist die Kosten-Nutzen-Rechnung,
nicht die Zeit: die beiden Fehler dieser Sitzung (B34, B36) sassen eine Schicht
tiefer, im Companion und im Vault, und die Wege dorthin sind jetzt gegangen.
Einunddreissig weitere Durchläufe mit echten Prozessen kosten Minuten pro Lauf
für eine Schicht, die überwiegend weiterreicht. Die Zahl steht hier, damit die
nächste Person sie nicht noch einmal ermitteln muss, und die drei grössten sind
benannt, falls jemand die Rechnung anders macht.

**B39 — Das eigene Modell auf der eigenen Maschine darf die eigenen Notizen
nicht sehen (2026-08-28).** Gemessen beim Gehen der Modellfamilie, und die
zweite Messung widerlegte die erste Erklärung. Drei Regeln greifen ineinander:

1. Was ein Rückruf tragen muss, liest das Home aus der **Herkunft** des
   eingeschlossenen Materials — `live_turn` reicht nur, wenn das Niedrigste
   `person_present` oder `own_pico` ist (ADR 0116 W1 mit ADR 0048).
2. Die weitere Erlaubnis gibt es nur zusammen mit einem **Zugang**: „not a lax
   entry - not an entry" (ADR 0151 PV4).
3. Ein Zugang über einfaches HTTP wird rundheraus abgewiesen, weil ein Bearer
   dort für jeden lesbar ist, der den Port ohnehin erreicht (PV5).

**Und kein Schreibweg erzeugt heute `person_present`.** Die Ortsseite sagt es
selbst: eine nachgewiesene Pico-Identität ist `home_member` und nicht die
Person im Raum, „because the higher class would require proving the writer is
the subject person of what they are writing" (ADR 0116 W2). Das ist eine
bewusste Zurückhaltung.

**Die Stelle, die darüber entscheidet, sagt aber das Gegenteil.**
`apps/core/src/recall.ts` schreibt in seinem eigenen Kopf: „a question over the
person's own notes - or over an answer Pico derived from them - needs only the
live turn, while one that pulls in a housemate's note or a supplier's document
needs a provider that proved who it is". Der zweite Halbsatz stimmt, der erste
nicht: eine selbst geschriebene Notiz *ist* eine fremde Notiz für diese Regel,
weil niemand beweisen kann, dass die Schreibende die ist, über die geschrieben
wird. W2 und dieser Absatz wurden gegen verschiedene Annahmen geschrieben, und
zwischen ihnen sitzt die Sackgasse.

Das verschiebt den Charakter des Befunds: es ist keine Regel mit einer
unbedachten Folge, sondern eine Aussage, die ihr eigenes Modul nicht halten
kann. Die Absicht steht also fest, und offen ist das Wie.

Gemessen wurde beides gegen ein laufendes Home: eine Notiz über die Ortsseite
(`unattributed`) wird abgewiesen, und eine unter einer identitätsgebundenen
Sitzung geschriebene (`home_member`) genauso. Die Herkunft ist also nicht das
fehlende Stück; die zweite Notiz steht im Test, damit niemand diesen Weg noch
einmal geht.

**Was das für eine Person heisst.** Sie stellt ein Modell auf ihre eigene
Maschine — der Fall, für den die Klasse `declared_own_host` überhaupt heisst,
wie sie heisst —, lässt es messen, entscheidet sich dafür, und bekommt auf jede
Frage an ihre **selbst geschriebenen** Notizen
`entry_may_not_carry_these_words`. Erweitern kann sie nicht, weil ihr Host auf
`127.0.0.1` kein TLS spricht und kein Geheimnis hat, das er beweisen müsste.

**Ein Satz an dieser Stelle war falsch und wird hier zurückgenommen** (geprüft
am 2026-08-31). Er sagte, über `own_pico` — eine verdichtete Beobachtung, der
Auszug eines verfolgten Korpus, eine behaltene Antwort — dürfe derselbe
Anbieter sehr wohl gefragt werden. Für den Korpus stimmt das nicht:
`library-read.ts` hängt an jede Lesung eine *Referenz* und schreibt
`carries: 'live_turn_and_retrieved_memory'` ausdrücklich hin. Ein Bezug ist
geholte Erinnerung, gleich welcher Herkunftsklasse der Auszug ist — und damit
gilt für ihn dieselbe Kette: weitere Erlaubnis, Zugang, TLS.

**Damit hat der Kreis keinen Eingang.** `own_pico` schreibt heute nur, wer eine
Modellantwort behält; eine Modellantwort gibt es nur, wenn ein Vorgang lief;
und jeder Vorgang, der etwas aus einem Speicher holt, verlangt die weitere
Erlaubnis. Ein Modell auf `127.0.0.1` ohne TLS kann also über *nichts*
Gespeichertes gefragt werden — weder über die Notizen seiner Person noch über
den Korpus, den Pico selbst geholt hat. Es trägt genau den lebenden Zug, und
das ist für ein Haus, dessen Zweck Erinnerung ist, keine Fähigkeit.

Gemessen wurde das beim Versuch, genau diesen Weg zu bauen: Depot anhängen,
Regel auf `allow`, holen, Zulieferer anhängen, noch einmal holen — das Home
reiht drei Lesungen ein („Queued library reads after fetch", `queued: 3`), und
keine davon wird je beantwortet. Der Weg ist wieder entfernt worden; was von
ihm bleibt, ist diese Zeile und ein Umgebungswert, den er unterwegs nötig
machte.

**Entschieden am 2026-09-01 und noch am selben Tag gebaut.** Drei Antworten
standen zur Wahl: Loopback als geschützten Transport anzuerkennen (hülfe nur
Hosts, die überhaupt ein Geheimnis haben — der gewöhnliche Fall hat keines);
ADR 0116 W2 eine Schreibklasse zu geben, die die anwesende Person nachweist
(träfe die Ursache, hülfe aber Korpuslesungen nicht, weil dort die Referenz
zwingt); oder PV4 für einen erklärten eigenen Host auszunehmen. Der Nutzer hat
die dritte gewählt, und ihr Grund ist PV4s eigener, zu Ende gelesen: ein Zugang
beantwortet, *wer* am anderen Ende ist, und `declared_own_host` hat kein anderes
Ende. Die Klassenschranke daneben bleibt — eine Maschine für seine eigene zu
erklären macht aus einem Cloud-Connector keine.

**Was danach ging.** Der Weg steht als Durchlauf: messen, entscheiden, sich den
Lesezugang erteilen, die eigene Erinnerung fragen, die Antwort behalten und
beides zurücknehmen — gegen ein laufendes Home, einen Vault-Daemon und einen
Modell-Host über einfaches HTTP. `pnpm link:walk` zählt danach **50 von 54**
statt 46; offen waren an jenem Tag die beiden vertagten Identitätsrotationen,
das Angebot ohne Erzeuger (B38) und `home.model.read.keep`. Die letzten beiden
sind seither zu — B38 am 2026-09-01, die Korpuslesung am 2026-09-02 (B53) —,
und diese Zeile steht im Imperfekt, damit sie nicht weiter behauptet, was
einmal galt.

**Und das letzte hat einen neuen Grund**, gemessen statt vermutet: eine
Korpuslesung ging jetzt bis zum Modell durch und wurde mit
`answer_was_not_the_declared_shape` beantwortet. Der Host-Doppelgänger dieses
Hauses ist für Messungen gebaut und kann die deklarierte Form einer Lesung
nicht liefern. Das ist eine Grenze des Doppelgängers und keine des Produkts —
und sie war vorher nicht sichtbar, weil die Kette schon eine Regel früher
endete.

**B38 — „Ein neuerer Commit ist ein Angebot", und niemand sieht je eines
(2026-08-28).** Beim Gehen der Zuliefererkette gemessen. ADR 0143 DP1 sagt, ein
neuerer Commit im Depot sei ein Angebot: nichts wird deswegen geholt, und eine
Person entscheidet. Gebaut ist dafür alles — die Spalte `offered_commit`, der
Zustand `offered`, `picoDepotOffer`, `acceptPicoDepotOffer`, das Feld im
Depot-Lesevorgang, die Link-Operation `home.depot.offer.accept` und das
Bedienelement im Fenster. **Nur schreibt niemand die Spalte.**
`recordPicoDepotFetchOutcome` ist ihre einzige Tür, und ihr einziger Aufrufer
im Produkt gibt das Feld nie mit. An einem echten Home ist `offeredCommit`
deshalb immer abwesend, und die Annahme antwortet immer `no_offer_standing`.

**Die ADR hat denselben Satz schon einmal über sich selbst geschrieben.** In
ihrer Notiz vom 2026-08-12 steht, `offered` sei „already declared, already read
by `picoDepotState`, and **produced by nothing**". Behoben wurde damals die
fehlende Hälfte des Datensatzes; die Spalte kam, die Tür kam — und der
Erzeuger kam eine Ebene tiefer wieder nicht. Dieselbe Krankheit, einen Schritt
weiter unten, und dieselbe Sorte Gate ging darüber hinweg:
`check-store-writers` sieht einen Aufrufer, `check-link-reachability` sieht
einen Client, und beide sind da — nur reicht keiner das Feld durch.

**Die Klasse wurde vermessen und bekommt trotzdem kein Tor** (2026-08-29).
Über den Compiler gezählt: 22 Store-Methoden nehmen optionale Felder, und zwölf
davon reicht kein Aufrufer im Produkt je durch. Elf der zwölf sind dieselbe
Sache — ein `*At`, das der Store selbst stempelt, wenn niemand etwas anderes
sagt —, und das ist kein Fehler, sondern die Vorgabe. Übrig bleibt genau
`offeredCommit`. Ein Prüfer daraus wäre eine Liste mit zwölf Einträgen, elf
davon mit demselben Satz begründet, und die Roadmap warnt vor genau dieser
Gestalt. Der Unterschied, auf den es ankäme - ein Feld, das eine *Tatsache*
trägt, gegen eines, das eine Vorgabe übersteuert - ist ein Urteil und keine
Syntax.

**Entschieden am 2026-09-01: wer *jetzt holen* drückt, fragt mit.** Zwei Sätze
grenzten die Antwort ein — der planmässige Lauf darf es nicht sein, weil die
ADR ihn ausdrücklich eine Instandsetzung und keine Abfrage nach Commits nennt,
und DP1s fehlendes `branch`-Feld verbietet einem Ref zu folgen für das, was
*läuft*, nicht für das, was angeboten wird. Der Nutzer hat den von einer Person
ausgelösten Abruf gewählt: er fragt das Remote zusätzlich, was es
veröffentlicht, und ein abweichender Commit wird aufgeschrieben und nie
ausgecheckt.

**Drei Zustände statt zwei**, weil es drei gibt: ein Commit ist ein Angebot,
`null` nimmt ein stehendes zurück, und Schweigen sagt nichts — wer nicht
antworten konnte, hat nicht gesagt, dass es nichts Neueres gibt, und ein
stehendes Angebot überlebt einen Versuch, der nicht durchkam.

**Der Preis ist benannt**: wer nie *jetzt holen* drückt, erfährt nie von einem
Angebot. Das passt zu diesem Baum, in dem ohne Frage nichts geschieht. Der Weg
steht als Durchlauf — der Autor legt einen neueren Commit hin, eine Person
drückt *jetzt holen*, das Angebot erscheint neben der Anheftung, und die
Annahme bewegt sie —, und `pnpm link:walk` zählt danach **51 von 54**.
Gepflanzt: fragt der Abruf nicht, erscheint kein Angebot.

**B37 — Zwei Depots stellen zwei Fragen, die nichts unterscheidet
(2026-08-28).** Beim Gehen von `home.depot.fetch.ask` gemessen und nicht
vermutet: eine wartende Frage trägt vier Felder — Ereignis-Id, Satz,
Risikoklasse und Ablauf. Der Satz kommt aus dem Manifest des Moduls (ADR 0139
AC4: was jemand zugesagt bekommt, schreibt die Seite auf, die es tut, und nicht
die, die davon profitiert), also nennt er den Effekt und nie das Depot. Wer
zwei Depots angehängt hat und *jetzt holen* drückt, bekommt zweimal dieselbe
Zeile und beantwortet sie, ohne zu wissen, welches Depot gemeint ist — bei dem
einen Effekt im Baum, der Code installiert.

Die Ereignis-Id unterscheidet die beiden, aber sie ist keine Auskunft: sie
steht in keiner anderen Fläche, die eine Person sieht.

**Entschieden am 2026-09-01: die Argumente stehen daneben, nie im Satz.** Die
Sorge war, einen Satz neben den zugesagten zu komponieren — genau die Gestalt,
die ADR 0139 AC4 für Effektzusagen und ADR 0106 R5 für Unterschriften
verbieten. Sie entfällt, weil die Antwort schon dastand, eine Ebene höher: ADR
0141 RN3 hatte für die Zustimmungsaussage längst entschieden, dass Picos
eigener Satz und die ausführenden Werte zwei Schichten sind (ADR 0116 W3), und
dass die Werte beschriftet danebenstehen und nie hineininterpoliert werden.

Dieselbe Schicht steht jetzt auf einer wartenden Frage. Der Satz bleibt Wort
für Wort der des Manifests; daneben die Argumente mit ihrer Herkunftsklasse
und `carriesExternalContent`. Die Regel, nach der ein Wert vor die Augen einer
Person kommt, steht dafür **einmal** — `picoApprovalDataLayer` baut sie hier
wie dort —, denn eine Wahrheit, zweimal geschrieben, driftet, und die zweite
Fassung wäre die nachlässigere.

**Gemessen, nicht behauptet.** Der Durchlauf hängt zwei Depots an, lässt beide
fragen und liest zwei Fragen mit demselben Satz und zwei verschiedenen
`remote`. Die Herkunftsklasse ist dabei `own_pico` und nicht `person_present`:
die Person hat gedrückt, aber die Werte kommen aus der Anheftungszeile, Picos
eigenem Aufschrieb einer früheren Entscheidung — erwartet war zuerst das
andere, und der Lauf hat es widerlegt. Gepflanzt: bleibt die Datenschicht weg,
tragen beide Fragen wieder vier Felder und der Durchlauf sagt es.

**Und der Weg dorthin hat einen zweiten Befund freigelegt**, weil der eine
neue Import die Auswertungsreihenfolge des Protokollpakets kippte — B49.

**B36 — Achtzehn von vierundfünfzig Türen waren je aufgegangen, und hinter
einer stand niemand (2026-08-28).** Gemessen statt geschätzt: das laufende Home
wurde für die Dauer eines Testlaufs gebeten, jede angenommene Link-Operation
mitzuschreiben, und der Lauf war die ganze Companion-Shell-Testmenge — die
einzige Stelle im Baum, an der echte Prozesse einander antworten. Von den
vierundfünfzig Operationen der geschlossenen Liste hatte ein *echter Client* an
einem *echten Home* achtzehn durchgebracht.

**Was die anderen sechsunddreißig hatten, ist ein Test, der den Namen
behauptet.** `check-link-reachability` sagt, dass jede Operation einen Aufrufer
außerhalb des Homes hat; die Fallunterscheidung des Homes ist über `never`
erschöpfend; ein Client-Test prüft, *welche Operation* geschickt wird. Keine der
drei Aussagen ist die vierte: dass jemand sie annimmt. Genau diese Lücke hat
B31 und B34 durchgelassen, und sie war nie vermessen.

**Sechzehn davon lagen hinter Bedienelementen, die das Fenster längst zeigt**,
alle in `@pico/companion/suppliers`. Der Weg dorthin ist jetzt gegangen — die
vier Listen des Fensters an einem frischen Home, einem Modul zustimmen, und
danach eine Regel über einen Effekt entscheiden, den erst die Zustimmung
entscheidbar macht. Dazu die andere Hälfte von ADR 0126 P6 (eine Fähigkeit
entziehen, ein Gerät abschalten, es vergessen), die beiden Vorgänge, die eine
Erinnerung braucht, die Messungen der Sonde mit der Aufzeichnungszustimmung
davor, ein Depot anhängen, sein Hinausgreifen entscheiden und es abhängen, und
um einen Abruf bitten, gefragt werden und nein sagen, ein echtes Depot mit
einem echten `git` holen und den Zulieferer anhängen, den es dabei erklärt,
eine Maschine messen, sich für sie entscheiden, ihr ein Geheimnis hinreichen
und beides zurücknehmen, und zuletzt Postfachadressen tauschen — mit drei
laufenden Prozessen, weil dazu ein echtes Relay gehört. **Sechsundvierzig von
vierundfünfzig**, nachgemessen mit `pnpm link:walk`.

**Und einer der neu gegangenen Wege ging nicht.** „Let this device read one
part of your memory" (ADR 0082) hat nie funktioniert. ADR 0106 hat die
Unterschrift am 2026-07-29 umgedreht — der Aufrufer schickt einen
Familiennamen und die Felder, der Daemon baut die Bytes und schreibt den Satz
der Person aus denselben Feldern —, und `grantPicoCompanionDomainRead` wurde
achtzehn Tage später in der alten Gestalt geschrieben: als Familienname stand
dort der Satz für die Person, dazu zwei der zehn Felder. Der Daemon antwortete
`unknown_signature_input_label`, bevor überhaupt jemand gefragt wurde. Die
Familie war außerdem in keiner der drei Tabellen eingetragen, die sie braucht
— unterschreibbar, baubar, darstellbar —, also war der Fehler nicht ein
falsches Wort, sondern eine nie angeschlossene Familie.

**Die Klasse ist jetzt geschlossen**, und das ist der Teil, der bleibt:
`check-signature-labels.mjs` hält jede Signierstelle des Produkts gegen die
Konstanten des Protokolls und diese gegen die Tabellen des Daemons. Ein
Literal an dieser Stelle ist entweder ein Tippfehler oder ein Satz, und beides
endet in derselben Ablehnung; eine Familie ohne Bauer hat keine Bytes; eine
bewilligungspflichtige ohne Renderer ist einer, dem niemand zustimmen konnte.
Fünfundzwanzig Stellen, keine unauflösbar. Was der Prüfer nicht kann, steht in
ihm: die Schlüsselrolle steht an der Aufrufstelle nicht, also bleiben drei
rollenabhängige Familien beim Bauer stehen.

**Acht Türen bleiben offen**, und jede hat einen geschriebenen Grund: zwei
sind eine ausgesprochene Vertagung (ADR 0114 T4), eine ist ein Angebot, das
kein Home je sieht (Befund B38), und fünf sind die Rückruffamilie.

**Die neunte war der Postfachtausch, und sie ist am 2026-08-29 gegangen
worden.** Ihr Grund war ein anderer als bei den übrigen: die Geräteseite des
Relay-Wegs hat keinen Produktaufrufer, und `check-capability-reach` lässt sie
namentlich begründet stehen — „nothing starts it because nothing starts the
sweep below it". Das ändert der Weg nicht; er beantwortet die andere Hälfte,
dass der Tausch *trägt*, wenn ihn jemand startet. Drei echte Prozesse sind
daran beteiligt, und registriert wird vor dem Aushändigen: ein Gerät mit einer
Adresse, die es beim Betreiber nicht gibt, schriebe ins Leere, und beide Seiten
hielten den Tausch für gelungen.

**Die fünf sind der interessante Rest**, und der Grund ist Befund B39: sie
hängen an drei Regeln, die zusammen eine Sackgasse bilden. Ein Doppelgänger mit
TLS würde sie öffnen; Material mit nachgewiesenem Urheber nicht - das wurde
gemessen und fiel anders aus als erwartet. Ein dritter Weg schien offen — über ein
behaltenes Korpusergebnis — und ist am 2026-08-31 als nicht vorhanden
nachgewiesen worden.

**Ein Satz über diesen Punkt war zuerst falsch und wird hier
zurückgenommen**, weil er einen Aufwand behauptete, den das Haus schon
bezahlt hat: es gibt einen Modell-Host-Doppelgänger, `test-model-provider-host.ts`,
und sein eigener Kommentar begründet ihn genau richtig — „a real server rather
than a stub `fetch`", weil die Messung eine *Reihenfolge* ist und eine nach URL
antwortende Funktion sie nicht falsch machen kann. Er läuft jetzt als eigener
Prozess, aus demselben `dist` gestartet wie das Home und ohne zweite Kopie, und
fünf der zehn sind damit gegangen: messen, entscheiden, das Geheimnis
hinreichen, die Entscheidung zurücknehmen, den Befund vergessen. Der Aufwand,
den der zurückgenommene Satz behauptete, war eine knappe Stunde.

Keine davon ist geschätzt worden; die Liste steht in `progress.md`.

**Und die Zahl ist seit dem 2026-08-29 nachrechenbar.** `pnpm link:walk`
(`scripts/measure-link-walk.mjs`) setzt die Mitschrift in das gebaute Home
ein, fährt die Companion-Shell-Testmenge, nimmt sie wieder heraus und nennt,
was angenommen wurde, was nur abgelehnt wurde und was gar nicht vorkam. Kein
Tor: es dauert anderthalb Minuten, es urteilt nicht, und `release:verify`
ruft es nicht. Eine genannte Zahl, die niemand nachrechnen kann, driftet -
und diese hier steht an drei Stellen.

**B35 — Das Schloss wechseln, und die drei Sackgassen dahinter (2026-08-27).**
B34 machte eine Sackgasse erreichbar, die vorher hinter einem Fehler lag: seit
das Beenden eines Lesezugangs wirklich geht, verschließt jedes Beenden die
Domäne. Jede beendete Leserberechtigung erzeugt eine Rotationsschuld (ADR
0101), und solange sie besteht, weist das Home neue Items mit
`rotation_required` ab. Das ist richtig - wer hinausgeworfen wurde, hält den
alten KEK, und ohne Wechsel liefe alles Neue weiter unter genau ihm. Falsch war
nur, dass kein Produktweg sie begleichen konnte: der Vault konnte rotieren, der
Daemon hatte `ceremonyRotateDomain`, das Home nahm `reader_custody_kek_rotation`
an - dazwischen fehlte der Companion. E5s viertes Bedienelement.

**Der Bau fand drei weitere Stufen derselben Sackgasse**, jede erst sichtbar,
als die davor behoben war. Keine davon war zu erraten; jede kam aus einem
Durchlauf gegen ein laufendes Home:

1. **Rotieren allein reicht nicht.** Danach gehört das Schreibrecht dieses
   Geräts zur alten Fassung, und `recordItem` verlangt, dass Item *und* Recht
   die geltende nennen - `inactive_writer_grant`, eine Stufe später. Das neue
   Recht gehört deshalb in dieselbe Handlung: „das Schloss wechseln" heißt für
   eine Person, danach wieder hineinschreiben zu können.
2. **Ein zweites Gerät steht genauso da**, wenn das erste rotiert hat: kein
   offener Anlass, aber ein Recht der alten Fassung. Ein Knopf, der dann
   „nichts zu tun" sagte, wäre für dieses Gerät eine Endlosschleife. Derselbe
   Knopf holt es jetzt nach.
3. **Die Raumdatei trug die Kette nicht mit.** Ohne die Rotationsaufzeichnungen
   dazwischen kann der Vault ein Recht der Fassung zwei nicht gegen eine Domäne
   der Fassung eins prüfen - `invalid_reader_custody_writer_grant`, für ein
   Recht, das gerade erst richtig erteilt wurde. `encryptPicoReaderCustodyItem`
   kannte die Kette seit jeher; nur die Daemon-Familie reichte sie nicht durch.
   Nachtragen ist Buchhaltung und keine Zeremonie, also fragt es niemanden.

Gebaut wurde dafür: `rotationBundleFor` im Home und die Link-Operation
`home.reader_custody.rotation.read` - eine eigene Tür statt des Lesebündels,
weil dessen Leser die verbleibenden Leser nicht aufgezählt bekommen dürfen,
während für die Besitzerin genau diese Aufzählung der Inhalt ist. Dazu
`rotatePicoCompanionReaderCustodyDomain`, `rotationRecords` durch die
Encrypt-Familie, und ein Knopf mit vier Sätzen statt einem: rotiert; nur das
eigene Recht erneuert; nur die Kette nachgetragen; oder es war nichts zu tun -
und das letzte ist eine Aussage und keine Ablehnung (ADR 0118 O4).

Der Realprozess-Test geht den Kreis jetzt ganz: zweites Gerät einziehen,
hereinlassen, hinauswerfen, `rotation_required` sehen, wechseln, wieder
schreiben, und ein zweites Drücken sagt „nichts zu tun". Damit trägt E5 alle
vier Bedienelemente.

**B34 — Einen Lesezugang zu beenden hat nie funktioniert (2026-08-27).**
Der Knopf steht seit dem 2026-08-24 neben der Leserschaft im Fenster: einen
vergebenen Lesezugang beenden, mit einem der fünf Gründe als Teil der
Handlung. Gegen ein laufendes Home antwortete das Home jedes Mal
`invalid_record`.

Der Grund ist ein Wort. Die Zeremonie hängt an die Lebenszyklus-Aussage den
Schlüsselnachweis der Besitzerin, und das Home vergleicht ihn Zeichen für
Zeichen mit dem in der Domäne. Die Domäne trägt `pico.suite.id.v1`; die
Zeremonie schrieb `picoMemoryContentSuite`. Die drei Geschwister-Zeremonien in
derselben Datei hatten es richtig.

**Warum es niemand sah.** Die Tests dafür prüfen gegen einen erfundenen
Link-Client, *welche Operation* geschickt wird - `home.authority.submit` mit
der Ressource `reader_custody_reader_grant_lifecycle` -, und das stimmte. Der
Unterschied zwischen „geschickt" und „angenommen" ist genau die Lücke, durch
die auch B31s fehlendes Wort ging. Und `invalid_record` liest sich wie die
Antwort auf eine gefälschte Aussage, also sieht niemand nach.

Zwei Dinge halten es jetzt. `check-key-record-suites.mjs` prüft mechanisch,
was hier schiefging: ein Schlüssel in einer Identitätsrolle gehört in die
Identitätssuite, weil `verifyPicoIdentityKeyRecordFingerprint` genau das
verlangt - 79 solche Stellen im Haus, 78 waren richtig. Und
`reader-custody-real-process.test.ts` zieht jetzt ein zweites Gerät wirklich
ein, lässt es lesen, beendet den Zugang und **liest die Leserschaft danach
noch einmal beim Home**, statt der eigenen Rückgabe zu glauben. Gefälscht am
2026-08-27 durch Zurückdrehen des einen Wortes: der Test fällt mit
`foundation_rejected:400:invalid_record`, das Gate nennt Datei, Zeile, Rolle
und Suite.

**Was der Fund freilegt.** Solange das Beenden scheiterte, war die Sackgasse
dahinter unerreichbar. Jetzt ist sie es nicht mehr: jede beendete
Leserberechtigung erzeugt eine Rotationsschuld (ADR 0101), und solange sie
besteht, weist das Home neue Items mit `rotation_required` ab. Das ist richtig
- wer hinausgeworfen wurde, hält den alten KEK. Falsch ist, dass kein
Produktweg sie begleichen kann: der Vault kann rotieren, der Daemon hat die
Zeremonie `ceremonyRotateDomain`, das Home nimmt `reader_custody_kek_rotation`
an - der Companion hat keine Funktion dafür. Ein Test hält den Preis fest,
statt ihn zu behaupten.

**B33 — Drei Tests bauten die Zeitregel nach, statt sie anzuwenden (2026-08-27).**
Nachdem der Kalender-Befund die Uhr als Frage sichtbar gemacht hatte, lag die
zweite auf der Hand: **wo** jemand steht. `when-display.ts` entscheidet seit
dem 2026-08-20, wie Pico einer Person *wann* sagt - der Kalendertag der
Leserin, aus ECMA-262-Kern, ohne ICU -, und der eigene Text dort warnt genau
davor, einen ISO-Zeitpunkt auf zehn Zeichen zu kürzen: das ist das UTC-Datum
ohne Etikett.

Gemessen: die Testmenge lief unter `TZ=Pacific/Kiritimati` (UTC+14) und
`TZ=Pacific/Niue` (UTC-11). Drei Tests fielen um - zwei in
`contract.test.ts`, die den erwarteten Satz von Hand hinschrieben
(`'It can act as you until 2027-01-01.'`), und einer, der an diesem Tag frisch
dazugekommen war und `VALID_UNTIL.slice(0, 10)` benutzte. Alle drei waren in
Wien grün. Ein Test, der eine Regel nachbaut, prüft seine eigene Nachbildung.

Die Produktseite war dabei schon gehalten: `check-runtime-floor.mjs` verbietet
`Intl` und `toLocaleDateString` in `@pico/protocol`, also gibt es keinen
zweiten Weg, einen Tag zu bauen. Was niemand hielt, war die Testseite.

Daraus wurde `scripts/check-display-zones.mjs`. Zwei Zonen, weil eine ein
einziger Versatz ist: ein Zeitpunkt um 00:00Z liegt in UTC+14 am selben
Kalendertag und in UTC-11 am Tag davor, um 10:00Z andersherum. Und nur dort,
wo überhaupt ein Tag gezeigt wird - die Paketliste wird abgeleitet und nicht
getippt: wer `when-display` nennt oder `Intl.DateTimeFormat` benutzt, wird
gefahren. Das sind fünf; `apps/core` ist keines davon, das Home zeigt niemandem
etwas. Gefälscht am 2026-08-27 durch Zurückschreiben eines Satzes von Hand:
`pnpm test` blieb grün, und die Prüfung nannte Paket, Zone und Grund.

**B32 — Hundertvierunddreißig Tests hingen am Kalender (2026-08-27).**
An diesem Vormittag um 10:00 UTC wurden drei Tests im Kern rot, ohne dass
jemand etwas geändert hatte. Der Grund war ein Datum: eine Vorrichtung gab dem
Schreibrecht ein `validUntil`, das als zweites Datum neben seinem Anker stand —
genau einen Monat später —, und `recordItem` nimmt ohne zweites Argument
`new Date()`. Der Fehlschlag las sich wie ein Fehler im Kern und war einer im
Kalender.

Eine Textsuche taugt für diese Sorte nicht: rund hundertfünfzig Fenster-Enden
stehen als Datum in Tests, und die Hälfte liegt mit Absicht in der
Vergangenheit — so prüft man Ablaufen. „Darf nicht vergangen sein" wäre
überwiegend Fehlalarm. Die ehrliche Frage ist eine andere: **ein gut gebauter
Test liest die Wanduhr gar nicht**, er gibt seine Zeit an. Für ihn ist ein
Vorstellen der Uhr folgenlos.

Also die Uhr vorgestellt. `scripts/shift-clock.mjs` verschiebt `Date` um ein
Jahr, `pnpm clock:check` läuft die ganze Testmenge darunter. Der erste Lauf:
**134 von 1095 Tests im Kern fielen um, in 19 Dateien.** Eine einzige
Vorrichtung stand hinter 115 davon — `test-claimed-home.ts` gab jeder
Bevollmächtigung ein Fenster von 2026-01-01 bis 2027-01-01, und am Neujahrstag
wäre der halbe Kern gemeinsam mit `pico_identity_session_refused:401`
umgefallen. Dasselbe Fenster stand in sechzehn Dateien abgeschrieben; eine
Wahrheit, die sechzehnmal geschrieben wird, driftet sechzehnmal, und diese
driftet sogar von allein, weil die Gegenwart weiterläuft und das Datum nicht.

Repariert wurde nach zwei Regeln, nicht nach einer:
- Wer seine Zeit **angibt**, behält sein festes Fenster (`share-envelope`,
  `identity-session`, `domain-read-grant`s Ablauf-Aussagen). Ein Fenster um die
  Wanduhr herum läge dort neben der Zeit, gegen die geprüft wird.
- Wer an der **Wanduhr** misst, bekommt `picoTestValidityWindow()` — ein Jahr in
  jede Richtung, an einer Stelle. Das betrifft alles, was durch
  `recordPicoHomeDomainReadGrant` geht: der Weg nimmt bewusst kein `at`
  entgegen, weil ADR 0115 das Home mit seinem eigenen Jetzt stempeln lässt.

Nebenbei fielen zwei Dinge auf. `share-envelope.test.ts` maß zwei Uhren
gegeneinander — jede Aufzeichnung mit `at: AT`, eine ohne —, und das ging nur
gut, solange der Abstand klein war. Und die `freshUntil` einer Frische stand
als festes Datum neben `checkedAt`, statt aus ihm zu folgen; als Datum galt sie
bis zu einem Vormittag im Juli 2026, für jeden Aufrufer mit Wanduhr also seither
gar nicht mehr.

Stand danach: **2884 Tests, beide Uhren grün.** `pnpm clock:check` hängt an
`release:verify`. Gefälscht am 2026-08-27, indem das feste Fenster in
`test-claimed-home.ts` zurückgestellt wurde: `pnpm test` blieb grün, und ein
Jahr voraus fielen 119 Tests.

**B31 — Ein Durchlauf fand, was vier Gates und tausend Tests nicht fanden
(2026-08-27).**
Der Reader-Custody-Ast wurde zum ersten Mal wirklich gegangen — gegen ein
laufendes Home und einen laufenden Vault-Daemon, nicht gegen Vorrichtungen:
Raum anlegen, hineinschreiben, das zweite Gerät hereinlassen, zurücklesen. Vier
Zustimmungen wurden dabei von einem echten Daemon gerendert und beantwortet.

Der Weg fand drei Dinge, die kein Test hatte:
- `ceremonyCreateDomain` bekam ein Feld zu viel und antwortete
  `invalid_request`. Ein `as never` am Aufruf hatte die Typprüfung stillgelegt.
- Der Domänenname war fest. Eine halb durchgekommene Anlage hinterließ eine
  Zeile, und `UNIQUE (home_id, privacy_domain)` machte daraus ein `conflicting_record`,
  aus dem eine Person nie wieder herauskam. Jetzt trägt der Name die Autorität
  in sich, und ein zweiter Druck **setzt fort**, statt abzulehnen.
- Die Home-Seite kannte `reader_custody_writer_grant` nicht. Der Grund ist
  unangenehm: ein Bearbeitungsschritt von mir war an seiner zweiten Hälfte
  gescheitert und hatte die erste nie geschrieben — der Zweig ging so ins
  Repository, und `release:verify` blieb grün, weil der Test des Clients den
  **Namen** behauptet und nicht, dass jemand ihn annimmt.

Daraus wurde `scripts/check-authority-resources.mjs`. Die erste Fassung suchte
`resource: '...'` im Quelltext der Clients — und sah die Stelle nicht, an der
die Wörter als Feldwerte in einem Array stehen; die Pflanzung biss nicht. Wer
nach einer Form sucht, findet die andere Form nicht. Jetzt hält es der Compiler:
`picoHomeAuthoritySubmitResources` ist eine geschlossene Liste im Protokoll, der
Client tippt dagegen, und das Gate hält die Liste gegen die Fallunterscheidung
des Homes. Gefälscht am 2026-08-27 durch Entfernen des Falls: die Prüfung nennt
das Wort und sagt, wann eine Person es merken würde.

Offen und benannt: eine **andere Person** hereinlassen verlangt, dass deren
Gerät binnen fünf Minuten wach ist (ADR 0085); und ein Telefon als Leser
braucht eine andere Form, weil ADR 0096 nicht verschränkt.

**Nachgetragen am 2026-08-27**: der Durchlauf ist ein Test geworden.
`apps/companion-shell/src/reader-custody-real-process.test.ts` geht denselben
Weg gegen dieselben echten Prozesse, mit denen E2 bis E5 daneben geprüft
werden - anlegen, hineinschreiben, zurücklesen -, und hält die drei Sätze fest,
die der Weg von Hand gelernt hat: dass ein zweites Drücken fortsetzt, dass
„du hast nur dieses eine Gerät" gesagt wird, und dass die Antwort vom Home kam.
Ein Weg, der nur von Hand gegangen wird, wird einmal gegangen. Gefälscht durch
Entfernen genau des Falls, der still ausgeliefert worden war: vier der fünf
Tests fallen mit `unknown_authority_resource`.

**B30 — Ich habe drei Türen gebaut, die es schon gab (2026-08-27).**
Beim Aufsetzen des Durchlaufs stand im Nutzungstext des Vault-CLI eine
Unterkommando-Liste, und darin `ceremony publish-checkpoint`. Nachgesehen: der
Tool-Weg baut einen Frische-Nachweis genau so, wie ich ihn tags zuvor im
Companion gebaut hatte — Sitzung suchen, Felder bauen, über die `sign`-Familie
mit demselben Etikett unterschreiben.

**Meine Aussage vom Vortag war falsch.** Ich hatte gesagt, nichts im Baum
signiere je einen Nachweis; beide Verwendungen des Byte-Bauers seien prüfende
Seiten. Der CLI nennt weder den Vault-Helfer noch den Byte-Bauer — er geht
durch den Daemon —, und meine Suche hat ihn deshalb verfehlt.

Schlimmer: `home.authority.submit` trägt seit langem Ressourcen, darunter
`reader_key_freshness_checkpoint`, `reader_custody_domain` und
`reader_custody_reader_grant`. Gemessen (nicht vermutet): die Tür geht vom
beanspruchenden Gerät aus auf, ohne Betreiber-Sitzung — `isCurrentHomeHostPico`
prüft die Identität, nicht das Gerät. **Drei meiner vier neuen Vorgänge waren
Doppelungen einer vorhandenen Tür**, in einer Liste, die ADR 0107 absichtlich
klein hält.

Sie sind entfernt. Das Schreibrecht fehlte dort wirklich und ist jetzt eine
Ressource mehr; ein Item ist Inhalt und keine Autorität und behält seinen
eigenen Vorgang. Die Link-Operationen sind damit von 57 auf 53 gefallen — vier
weniger als vor meiner Arbeit von gestern, und der Weg funktioniert unverändert.

**Warum die Messung versagt hat, und was das kostet.** Ich habe die
*Namensliste* der Vorgänge nach `reader_grant` und `fresh` durchsucht. Eine
generische Tür mit einer Ressourcenkarte trägt diese Wörter nicht in ihrem
Namen. Wer nach einem Namen sucht, findet keine Fähigkeit — er findet einen
Namen.

**B29 — Der Besitzer durfte seinen eigenen Raum nicht lesen (2026-08-27).**
Beim Aufbauen eines echten Durchlaufs gefunden, noch bevor er lief: das
Labor-Home kennt eine Identität mit zwei Geräten, und beim Durchdenken, was
der Sponsor dort sähe, fiel es auf. `readingBundleFor` verlangte ein
**Leserrecht** — und wer eine Domäne anlegt, hat nie eines. Er entschlüsselt
über seinen eigenen Umschlag im Domänen-Datensatz; `decryptPicoReaderCustodyItem`
wählt genau danach aus, ob es die Besitzer- oder die Leserfassung nimmt.

Die Folge war, dass die Person, die den Raum gemacht und beschrieben hat, auf
„Show me what is in there" gelesen hätte: *„This device may not read that
space. Someone has to let it in first."* Über ihren eigenen Raum.

Und meine Tests hielten den Fehler fest, statt ihn zu finden — sie behaupteten
`not_a_reader` für den Besitzer, weil der Code es tat. Sie sagen jetzt, was
gilt, und die C4-Prüfung braucht dafür eine fremde Domäne, die der Produktweg
nicht erzeugen kann: `recordDomain` verlangt einen Besitzer, der Mitglied ist,
und ein zweites Mitglied gibt es im Testaufbau nicht. Sie wird deshalb direkt
in die Tabelle gelegt, mit dem Satz daneben, warum.

**Und ein erfundener Datensatz weniger.** Das Leserrecht war überall Pflicht -
im Bündel, im Daemon-Aufruf, im Beweistyp des Vaults -, obwohl die
Entschlüsselung es beim Besitzer nie anfasst. Jeder Aufrufer hätte für diesen
Fall eines erfinden müssen, und ein Datensatz, den heute niemand prüft, ist
eine Lüge, die auf einen Prüfer wartet. Es ist jetzt durchgängig wahlfrei.

**B28 — Vier Fehler in Code, den nur Tests je berührt haben (2026-08-27).**
Die Reader-Custody-Senkrechte stand und war nie *durchlaufen* worden — nur
geprüft. Meine Tests decken die Home-Seite und die Reihenfolge ab; was sie
nicht erreichen, sind die Werte, die der Companion in eine Zeremonie schreibt.
Beim Durchsehen der eigenen drei Commits:

- **`?? ''`**: ein nicht entsperrter Signaturschlüssel wäre als *leerer*
  öffentlicher Schlüssel in ein Schreibrecht gewandert — eine Zeremonie mit
  einer Zustimmung, die eine unbrauchbare Urkunde erzeugt. Jetzt eine benannte
  Ablehnung.
- **`firstKekVersion: 1`**: aus der Domäne gelesen statt angenommen. Heute
  rotiert nichts, also stimmte die Annahme — und ADR 0101 hat die Rotation als
  Zeremonie gebaut, also stimmt sie beim ersten Mal nicht mehr.
- **`lifecycleOrder: 'seq:…0003'`**: fest verdrahtet. Ein zweites
  Hereinlassen trüge dieselbe Ordnung wie das erste, und eine Ordnung, die
  zweimal vorkommt, ordnet nichts. Jetzt aus der Uhr.
- **Zweimal „Raum anlegen"** überschrieb die Datei daneben stillschweigend, und
  was im ersten Raum stand, bliebe beim Home liegen — für dieses Gerät
  unerreichbar. Eine Person, die zweimal drückt, verlöre den Zugang zu ihren
  eigenen Sätzen, ohne dass etwas fehlschlüge.

Dazu acht Ablehnungen, die als Maschinenwort auf dem Bildschirm gestanden
hätten: `not_a_reader` sagt einer Person nicht, ob sie etwas falsch gemacht hat
oder ob Pico etwas nicht darf. Sie stehen jetzt in der Tabelle gesprochener
Ablehnungen, und ein Test zählt sie einzeln auf — eine Schleife über die
Tabelle selbst prüfte nur, dass die Tabelle die Tabelle ist.

**B27 — Der Raum war beschreibbar, erteilbar und unlesbar (2026-08-27).**
Nachdem das zweite Gerät hereingelassen werden konnte, war die nächste Frage,
ob es auch etwas sieht. Es sah nichts: die Leihe aus ADR 0098 verlangt vier
Aufzeichnungen — Domäne, Leserrecht, Schreibrecht, Item —, und ein lesendes
Gerät hat keine davon. Sie liegen beim Home, und die einzige Route dorthin war
Home-zu-Home und lieferte **Projektionen statt Aufzeichnungen**: Ansichten
ohne Unterschriften, die ein Daemon gar nicht prüfen könnte.

`home.reader_custody.read` liefert das Bündel ganz, mit Unterschriften, und
**nur an einen Leser** — nicht aus Vorsicht über den Geheimtext, sondern weil
die Umschläge daneben für genau einen Schlüssel bestimmt sind und eine Liste
davon eine Karte wäre, wer wo hineindarf. Ein unbekannter Raum und einer, den
dieser Absender nicht lesen darf, bekommen dasselbe Nein (ADR 0077 C4).

**Und eine Grenze, die der Grenzprüfer gezogen hat, nicht ich.** Das
Entschlüsseln wollte in den schalenfreien Kern; `check-companion-boundary`
verbot es: die Leihe braucht `node:worker_threads` — „the built-in least likely
to exist on a mobile JS runtime" — und `apps/companion` ist der Code, den eine
Android-Laufzeit trüge. Das Holen blieb im Kern, das Entschlüsseln zog in die
Schale, und die Folge steht jetzt im Kopf der Datei statt entdeckt zu werden:
**ein Telefon kann so einen Raum heute holen und nicht lesen.**

**B26 — Der Raum konnte niemanden hereinlassen, und der Grund lag drei
Schichten tiefer (2026-08-26).** Nachdem der Schreibweg stand, war die
naheliegende Frage „wie wird ein Leser benannt?". Sie war die falsche.

Gemessen: `recordReaderGrant` prüft Domäne, Mitgliedschaft — und dann die
**Frische** des Leserschlüssels. Der Auswähler verlangt einen von der
Identitätswurzel des Lesers signierten Nachweis, bei *jeder* Prüfung neu, und
im ganzen Baum gab es beide Verwendungen des Signatur-Bauers nur auf der
**prüfenden** Seite. Jeder Leser-Grant scheiterte mit `freshness_unavailable`.

**ADR 0085 sagt das selbst** in seinen Konsequenzen: *„Production still needs
deployment-specific owner-side checkpoint publication."* Es fehlten genau zwei
Dinge, und keines war Kryptographie: der Erzeuger stand seit jeher in
`@pico/vault` und hatte nur Tests als Aufrufer, und die Ablage aus ADR 0089
hatte für ein Gerät keine Tür.

**Wessen Wurzel unterschreibt, entscheidet, wer wach sein muss.** Das eigene
zweite Gerät braucht dieselbe Wurzel, die im eigenen Vault liegt — niemand
sonst muss antworten. Eine andere Person hereinzulassen verlangt, dass *ihr*
Gerät innerhalb derselben fünf Minuten antwortet. Vom Nutzer am 2026-08-26
entschieden: nur den ersten Fall bauen, den zweiten als benannte Lücke stehen
lassen.

Zwei Vorgänge (`home.reader_key.freshness.submit`,
`home.reader_custody.reader_grant.submit`) — beide gab es an diesem Tag und
**seit `08bf8603` nicht mehr**: B30 maß, dass `home.authority.submit` die
Ressourcen `reader_key_freshness_checkpoint` und
`reader_custody_reader_grant` längst trug, und entfernte drei Türen, die es
schon gab. Ein Knopf im Fenster, und der Zugang gilt **ab jetzt und nicht
rückwirkend** (ADR 0088s `from_version`) —
der Satz daneben sagt das, weil eine Person sonst später nach etwas suchte,
das dort nie stehen wird.

**Und eine Wahrheit, die zweimal geschrieben stand.**
`PicoHomeDeviceLifecycleDeviceView` war in `apps/core` und in
`apps/vault-daemon` erklärt — dieselbe Form, zwei Erklärungen —, und sie liefen
auseinander, sobald eine von beiden ein Feld bekam. Sie wohnt jetzt im
Protokoll; die äußere Ansicht darf sich weiter unterscheiden, weil der Home
Wartendes und Uhrabweichung darauf legt, ein Gerät aber auf beiden Seiten
dasselbe ist.

**B25 — Die Laborfläche fragte ein beigetretenes Telefon nach seiner
Passphrase (2026-08-26).** Auf dem Bildschirmfoto von Phase 6 stand *„Choose a
Vault passphrase for this device"* über einem Gerät, das seit Tagen beigetreten
war — direkt neben einem Termin, den dasselbe Gerät gerade aus seinem Home
gelesen hatte. Die Fläche startete den Beitrittsdienst bei jedem Öffnen, ohne
zu fragen, ob es schon einen Beitritt gibt.

Dieselbe Bedingung, die `watchConditions()` daneben längst stellt, steht jetzt
auch davor. Und die Einladung wird **ausgeblendet statt umgeschrieben**: was
dort sonst stünde, wäre ein zweiter Satz über einen Moment, den der Kern
besitzt, und `check-one-voice` zählt genau solche Sätze.

Beim Nachsehen fiel der zweite Satz auf: die Statuszeile sagte auf einem
beigetretenen Gerät für immer *„Starting Pico on this device…"* — einmal wahr,
nie zurückgenommen, dieselbe Klasse wie B23. Sie schweigt jetzt, wenn keine
Zeremonie läuft. Was bleibt, ist, was der Kern geschrieben hat.

**B24 — `ensureUnlocked` scheiterte daran, dass schon entsperrt war
(2026-08-26).** Zwei Sonden starteten zusammen, lasen beide einen leeren
Vault-Status und entsperrten beide; die zweite bekam `already_unlocked` und
meldete `read_failed` — von einer Methode, deren Zusage in diesem Moment
erfüllt war. Die Reihenfolge in `platform-unlock.ts` gilt innerhalb eines
Prozesses, und auf Android ist jede Sonde ein eigener.

`already_unlocked` nennt genau den Schlüssel, um den es geht; es ist damit
dieselbe Lage wie der Frühausstieg oben, nur im Wettlauf entstanden. Es wird
jetzt **nachgesehen statt angenommen**: der Status wird erneut gelesen, und nur
wenn der Schlüssel wirklich offen ist, gilt der Lauf als gelungen. Ein Erfolg,
der aus einer Fehlermeldung geschlossen wird, ohne den Zustand zu prüfen, ist
geraten — beide Richtungen haben einen Test.

### Aus der Prüfung entstanden

- ~~**Ein Schreibweg für Reader-Custody-Inhalt**~~ — **gebaut am 2026-08-26.**
  Gemessen fehlten drei Stücke statt fünfzehn: der erzeugende Teil stand längst
  in `@pico/vault`, das Home prüfte und speicherte seit langem, und die einzige
  Route dorthin war Home-zu-Home.

  Jetzt: eine vierte Daemon-Zeremonie erteilt das **Schreibrecht** (eine
  Zustimmung, eine Sitzung — sie trägt keinen KEK); eine gewöhnliche Familie
  **verschlüsselt im Daemon**, damit der KEK ihn nicht verlässt; drei
  Link-Operationen tragen Domäne, Schreibrecht und Item vom Gerät zum Home; und
  im Fenster steht ein Abschnitt, in dem eine Person einen solchen Raum anlegt
  und hineinschreibt. Die Leserschaft daneben zeigt seit dem 2026-08-24, wer
  lesen darf — jetzt gibt es etwas zu lesen.

  Zwei Dinge fielen dabei auf. Der Lebenszyklus-Lesevorgang warf die `homeId`
  weg, die das Home mitschickt und die eine Domäne in ihrer Unterschrift
  braucht; sie reist jetzt mit, statt ins Profil geschrieben zu werden — das
  wäre eine zweite Stelle, an der sie steht, und ein früher beigetretenes Gerät
  hätte sie dort nicht. Und die Aufzeichnungs-Fabrik des Kern-Tests wurde
  herausgehoben, weil der Link-Test sie gegen ein *echtes* Home braucht: eine
  zweite Fabrik wäre eine zweite Auffassung davon, wie ein gültiger Satz
  Aufzeichnungen aussieht.

  Damit ist ADR 0130 E5s andere Hälfte nicht mehr blockiert: Domänen anlegen
  und Leser berechtigen sind jetzt Bedienelemente, deren gewöhnliche Wirkung
  jemand beobachten kann.

### Außerhalb dieser Roadmap

Der sprechende Companion: die erste Requesting-Seite, ADR 0116 W4/W5, ADR 0117
X3–X5, die Modell-Delegation aus ADR 0048/0049 — und die Avatar-Assets über
ADR 0124, die ADR 0112 S4 entsperren.

**Der Satz „nichts davon ist heute prüfbar, weil kein Modell-Provider
existiert" stimmt seit dem 2026-08-28 nicht mehr.** Ein Anbieter lässt sich vom
Fenster aus messen, entscheiden und wieder vergessen, und der Weg steht als
Durchlauf gegen echte Prozesse; der Host dafür ist der Doppelgänger, den dieses
Haus für seine eigenen Messungen gebaut hat. Was fehlt, ist keine Fläche,
sondern eine Entscheidung (Befund B39) und ein echter Host in der Umgebung
dessen, der es benutzen will.

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

**Am 2026-08-22 nachgemessen, und der Befund wird dabei schärfer.** Geprüft
wurde nicht der Satz, sondern seine Grundlage: 231 Ausfuhren des Astes, jede
Route, und die gesamte Link-Fläche.

- **~~Der Ast hat gar keine Link-Operation.~~ Falsch, und am 2026-08-22 beim
  Bauen widerlegt.** Hier stand, Reader-Custody sei nur über *Operator*-Routen
  erreichbar. Tatsächlich leitet `home.authority.submit` seit Langem
  `reader_custody_domain`, `reader_custody_reader_grant` und
  `reader_custody_kek_rotation` weiter, und `home.authority.list` kannte
  `reader_custody_domains`. Die Messung, die zu diesem Satz führte, suchte
  nach *eigenen* Operationsnamen und übersah einen Sammelruf mit
  `resource`-Feld — dieselbe Auflösungsblindheit, die einen Tag später auch
  `check-link-reachability.mjs` hatte.

  **Was wirklich fehlte, war eine Asymmetrie**, und es war die, die ADR 0130
  E4/E5 für Mitgliedschaften bereits benannt hatten: vergeben ging vom Gerät
  aus, nachsehen und beenden nicht. Beides ist am 2026-08-22 gebaut — eine
  Person sieht jetzt, welche Domänen sie hält, wer sie liest, welche niemand
  liest, und kann einen Leser wieder ausschließen.
- **Drei Routen sind als Fläche versprochen**, als `experimental` markiert,
  und ihr einziger Test ist `unauthorized-writes.test.ts`. Das einzige, was
  über sie bewiesen ist, ist dass sie nein sagen.
- **Die ganze Link-Fläche wurde durchgezählt**: 47 servierte Operationen, und
  genau zwei ruft nichts — `home.identity.rotation.submit` und `.veto`. Beide
  sind in `check-link-reachability.mjs` namentlich mit Begründung
  ausgenommen und als ADR 0114 T4s offene Hälfte verbucht. Die unabhängige
  Messung hat die Antwort des Gates exakt reproduziert.

**Warum B5 einen Baum brauchte, lässt sich jetzt genau sagen: drei Gates
ließen den Ast durch, jedes aus einem eigenen Grund.**
`check-store-writers.mjs` nimmt ihn ausdrücklich aus (ein Produzent, der
absichtlich fehlt), `check-surface-classes.mjs` lässt ihn passieren
(dokumentiert *und* serviert) — und `check-link-reachability.mjs` sah seine
Ressourcen nicht, weil er Operations*namen* zählte und jede Ressource hinter
einem Sammelruf dessen Grün erbte.

**Der dritte Grund war doch eine Lücke, und sie ist am 2026-08-22
geschlossen.** Das fiel auf, als `reader_custody_domains` seinen ersten
Aufrufer bekam: die Ressource wurde vom Home ausgeliefert und von niemandem
erfragt, unsichtbar für genau den Prüfer, der gegen diese Krankheit
geschrieben wurde. Er prüft jetzt elf Ressourcen einzeln.

Die anderen beiden bleiben, wie sie sind: jeder prüft genau das, was er
behauptet. Und die Lehre daraus ist enger als „ein Baum zeigt, was Gates nicht
zeigen" — sie lautet: **ein Prüfer, der an Namen ansetzt, sieht nicht, was
hinter einem Namen verzweigt.** Das ist keine Eigenschaft von Bäumen, sondern
eine von Auflösung, und man kann sie erhöhen.

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

**B8 — Die Testsuite auf dieselbe Frage abgeklopft wie die Gates (2026-08-22,
später nachgetragen).** Was hier ist grün, ohne etwas zu halten?

- **2640 Testfälle, keiner ohne Prüfung.** Die neununddreißig, die zuerst wie
  Ausnahmen aussahen, prüfen über einen gemeinsamen Helfer, der Fehlertyp *und*
  Code festnagelt. Zwei eigene Messfehler unterwegs, beide durch Nachsehen
  gefunden statt durch Glauben.
- **3948 Gleichheitsprüfungen**, davon 36 mit demselben Aufruf auf beiden
  Seiten. Fast alle sind genau richtig: zwei *verschiedene* Eingaben durch
  dieselbe Funktion ist der Test für „diese beiden sind ununterscheidbar", und
  `genuine.slice(0,12) === forged.slice(0,12)` beweist absichtlich, dass ein
  Präfix nicht unterscheidet. **Eine war eine Tautologie** und ist ersetzt —
  siehe unten.
- **1032 `toThrow`-Prüfungen, 52 ohne genannten Grund** (fünf Prozent). Die
  Disziplin „eine Prüfung fällt aus dem genannten Grund" hält also breit.

**Der eine Fund und seine Grenze.** `expect(id(profile)).toBe(id(profile))`
stand unter einer Zeile, die den Wert exakt festnagelt — sie konnte nicht
fallen. Sie prüft jetzt, was der Kommentar daneben behauptet: zwei Profile, die
sich in allem außer dem Signaturschlüssel unterscheiden, ergeben dieselbe
Kennung. Gemessen, nicht behauptet: eine Implementierung, die die Delegation
anhängt, sobald eine da ist, lässt den gepinnten Wert unberührt und fällt nur
bei der neuen Zeile durch. Und sie ist kein Kunstgriff — eine Delegation
wechselt bei der Erneuerung, und dann sähe ein Gerät wie zwei aus.

**Was ausdrücklich nicht geändert wurde.** Die drei nackten `toThrow()` in
`supplier-credential-crypto.test.ts` tragen eine ADR-Zusage: ADR 0138 CO1 sagt
„three tests state the three refusals". Sie nennen keinen Grund, weil es keinen
gibt — die Ablehnung kommt aus libsodiums AEAD-Prüfung, und das ganze Haus
lässt die unbenannt durch, auch der Vault. Einen Namen zu vergeben wäre ein
neues Muster in sicherheitsrelevantem Code, kein Anwenden eines vorhandenen.
Getragen wird die Zusage stattdessen vom **ersten** Test derselben Datei: ein
voller Rundlauf, der laut fiele, wenn die Signatur bräche. Der Satz im ADR ist
damit für die drei Tests allein etwas stärker als sie — für die Datei stimmt
er.

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

**B9 — Ein Formatzusammenschluss lässt den zurückgezogenen Namen dort stehen,
wo er kein Zweig ist (2026-08-24).** ADR 0134 F2 legte am 2026-08-10 zwei
Formatpaare in ihren überlebenden `v1`-Namen zusammen. Vierzehn Tage später
*verlangte* der Kartentyp der Companion weiterhin `pico.recovery.card.v2` — ein
Name, den keine Karte je getragen hat. Niemand las das Feld, also brach nichts;
der Test baute eine Karte mit demselben falschen Namen und war als
`Record<string, unknown>` getippt, sodass kein Compiler die beiden verglich.
Code und Test stimmten miteinander überein statt mit dem Protokoll — deshalb
sagte keiner von beiden etwas. Ein dritter Ort maß das Transportpräfix an der
Länge von `'pico-recovery-card-v2:'`, richtig nur deshalb, weil die erfundene
Schreibweise genau so lang ist wie die echte; dieselbe Erfindung hatte einmal
jede gedruckte Karte stillschweigend abgewiesen.

**Warum es nichts fand.** `check-wire-labels.mjs` fängt *Kopien* von
Protokoll-Labels und sagt in der eigenen Kopfzeile, dass es Erfindungen nicht
fangen kann — eine zurückgezogene Version eines überlebenden Namens ist nach
dieser Definition eine Erfindung. Die breite Regel „Label ohne Konstante" war
vor dem Schreiben gemessen und bei 46 Fehlalarmen verworfen worden. Die enge
Regel wurde genauso gemessen und hat keinen: gleicher Stamm, Version, die das
Protokoll nicht exportiert. Drei Treffer im Produktcode, zwei davon der Defekt.
Neun Treffer in Tests, acht davon `.v0` — die Schreibweise für „das muss
abgelehnt werden"; deshalb bleiben Tests ausgenommen, und deshalb ist die
Ausnahme jetzt gemessen statt angenommen.

**Ein vierter Ort bleibt, begründet statt behoben.** Die abgeleitete
Baseline-Migration lässt `pico.home.founding-record.v2` in einer CHECK-Klausel
zu. Sie ist aus `sqlite_master` zurückgelesen, nicht getippt; eine ihrer
Anweisungen von Hand nachzuziehen gäbe die einzige Eigenschaft auf, die sie
prüfbar macht. Die Begründung steht neben der Ausnahme, die sie trägt.

**B10 — Vier Prüfungen sagten „sauber", wo sie „nicht hingesehen" meinten
(2026-08-24).** Jede Prüfung in `scripts/` wurde gegen einen Spiegel der
Verzeichnisform dieses Baums gefahren, der keine einzige Datei enthält. Vier
meldeten Erfolg — und es sind die vier, die die weitesten Sätze sprechen:
`check-link-seal` („0 files; no mailbox address reaches a log, an error or a
URL"), `check-fingerprint-display` („0 source files … one rule for showing a
key to a person"), `check-instant-rules` („0 source files … no instant
reaching a person raw") und `check-runtime-floor`, dessen Erfolgszeile die
Länge der eigenen handgeschriebenen Wurzelliste zählte statt irgendetwas
Gelesenes: „6 packages carry no ICU dependency", sechs Pakete, die es nie
geöffnet hatte. Jeder Satz gilt über das ganze Produkt und war wahr über
nichts.

**Warum das genau diese vier traf, ist der Teil, der über den Baum etwas
sagt.** Von den zweiunddreißig geprüften Prüfungen scheiterten siebenundzwanzig
geschlossen und eine übersprang bewusst — sie nennen eine Datei oder ein
Verzeichnis, dessen Vorhandensein sie *behaupten*, und sterben daran, ohne
einen Wächter zu brauchen. Die vier, die grün meldeten, sind genau die, die
nach Dateien suchen und nie behaupten, welche gefunden zu haben. Der breite
Anspruch und die Verwundbarkeit haben dieselbe Ursache.

Alle vier zählen jetzt **pro Wurzel** und lehnen eine Null ab, denn eine Summe
versteckt weiter den Fall, der wirklich vorkommt: eine Wurzel wandert, die
anderen bleiben voll. Die Klasse hält `scripts/check-vacuous-gates.mjs` — es
fährt jede andere Prüfung gegen denselben leeren Spiegel und weist eine
zurück, die nichts sauber nennt. Den vierten fand es beim ersten Lauf; mein
handgebauter Leerbaum davor hatte ihn übersehen, weil ihm die
Paketverzeichnisse fehlten. Deshalb ist der Spiegel abgeleitet und nicht
aufgeschrieben.

Was es nicht kann, steht in ihm: eine Prüfung, die an einer fehlenden Datei
abstürzt, scheitert geschlossen, und ein Absturz ist von einem Wächter nicht
zu unterscheiden. Der Anspruch ist deshalb genau der gedruckte — **keine
Prüfung meldet Erfolg über nichts** —, und ob eine Prüfung wacht statt
abzustürzen, beweist die Pflanzung neben ihr.

**B11 — Dieselbe Frage an die Tests gestellt: einer von 163 (2026-08-24).**
Nachdem vier Prüfungen „sauber" über nichts gesagt hatten (B10), lag dieselbe
Frage für die Testsuite nahe: eine Behauptung in einer Schleife, die keinmal
läuft, ist grün und leer. Gemessen: keine übersprungenen oder fokussierten
Tests in 250 Dateien, und 163 Schleifen, die behaupten. Davon laufen zehn über
Literale in derselben Datei und sieben über importierte `as const`-Listen —
beide können nicht leer werden, ohne dass jemand Zeilen löscht oder der
Compiler es anderswo bemerkt. Drei sind berechnet, zwei davon durch eine
Behauptung im selben Test gedeckt.

Bleibt einer: `leaves the rig at rest for the rest pose` behauptete über die
Rotationen, die zurückkamen — auch über keine. Ein Projektor, der gar nichts
mehr ausgibt, ließ ihn grün; umfallen tat nur der Nachbartest daneben. Ein
Test, dessen Grün an seinem Nachbarn hängt, beweist nicht, was sein Name sagt.

**Der Teil, den die Pflanzung fand, betrifft die Reparatur.** Der erste
Versuch hielt die Projektion gegen `gesturePoseV1MountNames()` — und diese
Funktion *ist* die Projektion der Ruhepose, eine Zeile darunter im selben
Modul. Die Härtung war eine Tautologie und beide Pflanzungen liefen weiter
durch. Die Rig steht jetzt einmal im Test ausgeschrieben und trägt beide
Behauptungen.

**Kein Gate dafür.** Von 163 Schleifen bräuchten 28 eine Ausnahmebegründung,
damit eine bissig würde. `check-link-seal.mjs` hat den Satz dafür schon
aufgeschrieben: eine Prüfung, deren Fehlschläge überwiegend falsch sind,
bringt Leuten bei, sie zu überspringen. Die Messung steht hier, die Ausnahme
nirgends.

**B12 — Die Statusmatrix nennt 880 Dateien, und niemand hat je nachgesehen,
ob es sie gibt (2026-08-24).** `implementation-status.md` ist das einzige
Dokument, dessen ganze Aufgabe es ist, *jetzt* wahr zu sein — die ADRs behalten
ihren Text (0128) und halten fest, was entschieden wurde, ein dort genannter
Pfad darf also Geschichte sein. In der Matrix ist ein Pfad dagegen ein Zeiger,
dem jemand folgen soll. Zwei zeigten ins Leere.

Einer davon ist der interessante: `modules/spatial-recall/src/ports.ts`
gibt es nicht, der Port liegt unter `modules/`. Das war der einzige Zeiger auf
**B4**s zurückgestellte Arbeit — ADR 0129s deklarierter und leerer SR5-Port,
der auf eine Sensor-Laufzeit wartet. Die Vertagung war begründet und datiert;
der Weg dorthin führte nirgendwohin.

**Die breite Fassung der Regel wurde gemessen und verworfen.** Über den ganzen
`docs`-Baum sehen 44 Pfade tot aus, und fast alle sind in Ordnung:
`07_Governance/QA_Checklist.md` liegt relativ zur Wurzel des Design-Systems,
`pico_core/config.yaml` ist der Name der Add-on-App vor ihrer Umbenennung und
gehört in das ADR, das sie entschied, `./helper.js` ist ein Beispiel im
Fließtext. Die enge Fassung — beginnt mit einem Verzeichnis, das dieser Baum
an der Wurzel wirklich hat, trägt eine Dateiendung und keinen Platzhalter —
prüft 880 Pfade und braucht **keine einzige Ausnahme**. Das ist der Test, ob
eine so billige Regel die richtige ist.

**B13 — Zwei Prüfungen zählten dieselbe Liste und kamen auf 45 und 46
(2026-08-24).** `check-surface-classes` und `check-link-reachability` lesen
beide `picoLinkDirectOperations`, jede mit einer eigenen Regex. Die zweite
buchstabierte ihre Zeichenklasse als `[a-z][a-z0-9_.]*` — **ohne Bindestrich**.
Genau eine Operation trägt einen: `home.domain.read-grant.submit`. Die
Prüfung, deren ganze Aufgabe es ist zu sagen, dass jede Operation von jemandem
außerhalb des Homes genannt wird, hat diese eine nie angesehen.

Dahinter war nichts kaputt — `apps/companion/src/domain-read-grant.ts` nennt
sie —, und das ist der Punkt: wäre dieser Aufrufer verschwunden, wäre die
Prüfung grün geblieben und hätte weiter bis 45 gezählt.

**Die Warnung stand seit jeher auf dem Bildschirm.** Beide Zahlen werden bei
jedem Lauf gedruckt, vier Zeilen auseinander, und niemand hat sie zusammen
gelesen — auch ich nicht, als ich dieses Gate gestern um elf
Autoritätsressourcen erweiterte und „45 Operationen" berichtete.
`progress.md` hat eine der beiden Zahlen abgeschrieben.

Behoben wurde nicht der fehlende Bindestrich, sondern dass die Liste zweimal
gelesen wird: `scripts/link-operations.mjs` liest sie einmal, beide Prüfungen
fragen dort. Zwei Leser einer Liste driften wieder.

**Und ein zweiter Fund aus derselben Messung:** `progress.md` behauptet für
den von ihm benannten Commit „72 einmalig geschriebene Wire-Labels". Der
Commit `7f9e76f`, der dieselbe Prüfung von 72 auf 119 hob, ist dessen Vorfahr,
und zwischen beiden hat kein Commit `packages/protocol/src` angefasst. Die
Zahl war dort schon falsch — und es ist ausgerechnet die, von der jene
Commit-Nachricht schreibt, sie habe gelesen, „als wäre sie alles". Berichtigt,
ohne das Standdatum anzufassen: das Dokument ist damit weiterhin veraltet,
aber nicht mehr falsch über den Stand, den es benennt.

**B14 — „Both loops run" gilt für den Home und für die Tests des Geräts
(2026-08-24).** Von 133 exportierten Fähigkeiten des Companion-Kerns nennt
nichts fünfzehn — und dreizehn davon sind **ein** Teilsystem: die geräteseitige
Relay-Abholung. Mailbox ausgeben, Adresse übergeben, abholen, einen Push
zulassen, eine Antwort zuordnen — vier Module mit Tests, in die kein
Produktpfad führt. Ein Gerät gibt keine Mailbox aus, übergibt keine Adresse,
holt nichts ab. Die Maschine ist gebaut, geprüft und wird nie gestartet.

ADR 0149s Status sagt „Both loops run". Der Satz stimmt für die Schleife des
Homes und für die Testsuite des Geräts; `progress.md` hat ihn übernommen — und
**ich habe ihn heute Morgen mitgeschleppt**, als ich `progress.md` neu
abgeleitet habe: die Zahlen nachgemessen, den Satz daneben stehen gelassen.
Eine Aktualisierung, die nur die Zahlen prüft, prüft die Hälfte.

**Diese Form findet der Baum zum sechsten Mal.** `attachPicoSupplier` ohne
Aufrufer ließ die Zuliefererliste auf jedem Home leer; `detachPicoSupplier`
ebenso; `setPicoSupplierReach` machte beide Vorgaben zum einzigen erreichbaren
Zustand, im ADR, dessen Titel ihre Existenz ist; `put()` ließ die
Präsenz-Registry auf jedem echten Home leer; `appendPicoObservations` ist eine
begründete Vertagung. Fünfmal durch Zufall oder durch `store:check`. Jetzt hält
`scripts/check-capability-reach.mjs` die Klasse: eine Fähigkeit, die nichts
nennt, oder eine Begründung an ihrer Stelle — und eine Begründung, die ihren
Gegenstand überlebt, fällt ebenfalls durch.

**Zwei blinde Flecken hatte der Prüfer selbst, und beide fand erst die
Pflanzung.** Ein Re-Export zählte als Aufrufer: `index.ts` trägt den halben
Kern als Fassreifen weiter, und damit sah jede weitergereichte Fähigkeit
erreicht aus, ob sie jemand importiert oder nicht — die Erreichbarkeitsmenge
sieht vollständig aus, während niemand sie abläuft. Danach zählte der
Kopfkommentar des Prüfers selbst als Aufrufer, weil er einen Namen nennt, um
sich zu erklären. Ein Prüfer ist kein Aufrufer, und Prosa auch nicht; ohne die
Pflanzung wäre beides grün geblieben.

Ein toter Export ist dabei gelöscht statt begründet worden:
`picoCompanionFirstRunStepOrder` war eine öffentliche Hülle um eine private
Funktion, ohne Aufrufer und ohne Test.

**B15 — Die Reichweitenregel hörte beim Companion auf, weil ich es behauptet
hatte (2026-08-24).** Der Prüfer aus B14 trug in seinem Kopf ein Argument von
mir: `apps/core` werde über einen Dispatcher erreicht und `packages/*` seien
Bibliotheken, dort ginge es also um Modulhygiene statt darum, was eine Person
tun kann. Das war nie gemessen. Nachgemessen: **neun** unerreichte Exporte in
`apps/core/src` und **drei** in `apps/vault-daemon/src`. Der
Companion-Shell mit 90 Exporten, der Relay und die Weboberfläche haben keinen.

Kein einziger davon ist ein Defekt — und das ist das Ergebnis. Jeder ist die
Codekante einer Abwesenheit, die dieser Baum längst in Prosa festhält: keine
reale Bridge, kein Home-Assistant-Transport, keine Sensor-Laufzeit, kein
Plattformanker, kein Schreiber für Reader-Custody, keine Betreiberfläche für
das Migrationsprotokoll. Neun aufgeschriebene Lücken, die niemand mit ihrem
Code verbunden hatte; sie stehen jetzt als Begründungen neben den Namen, und
eine Begründung, die ihren Gegenstand überlebt, fällt durch.

**Eine Sache war wirklich neu: eine Sicherung, die niemand zurückspielen
kann.** Vor einer Migration entsteht eine Datenbanksicherung. Der
Migrationslauf liegt in einer einzigen SQLite-Transaktion, rollt bei einem
Fehlschlag also selbst zurück; die Sicherung deckt, was eine Transaktion nicht
kann — ein Abschuss mitten im Commit, eine kaputte Datei. `restoreSqliteBackup`
hat sechs Tests und weder einen Aufrufer noch einen Befehl. Ob es einen geben
soll, entscheidet kein ADR.

**Und der Prüfer hatte eine dritte Lücke**, wieder nur von der Pflanzung
gefunden: er wies eine Modulbegründung zurück, die ihr Modul überlebt hatte,
aber keine Namensbegründung, die ihren Namen überlebt hat. Eine Begründung ist
ein Urteil über heute; sie muss altern können.

**B16 — Von 61 bedienten Routen fragt niemand nach siebzehn (2026-08-24).**
`check-surface-classes` hielt die Routenliste des Homes gegen
`public-surfaces.md`: eine Route muss aufgeschrieben sein, und eine
aufgeschriebene muss bedient werden. Beide Richtungen fragen nicht, ob jemand
sie **ruft**. Nachgemessen: 28 ruft das Dashboard, 16 der Companion oder der
Vault-Daemon über Foundation-HTTP, 17 ruft nichts außerhalb von `app.ts` und
seiner Tests.

**Es sind keine siebzehn Defekte, und die Begründungen sind der Ertrag.** Acht
davon sind die *zweite* Tür: das Produkt spricht Pico Link, also ist
`home.depot.attach` die benutzte Tür, während `POST /api/depot/attachments` auf
eine Foundation-Sitzung wartet, die kein Produkt öffnet. Acht weitere sind die
Schreiberhälfte der Reader-Custody samt Share-Envelopes — dieselbe Abwesenheit,
auf der ADR 0130 E5 offen steht, und für die es nicht einmal eine
Link-Operation gibt. Bleibt `GET /api/system/version`: die einzige Route ohne
Aufrufer *und* ohne Link-Zwilling.

**Der Prüfer hatte zwei eigene Fehler, beide von der Pflanzung gefunden.** Der
erste war meiner: eine Route galt als gerufen, wenn ihr Pfad irgendwo als
Teilstring vorkam — `/api/auth/session` sah erreicht aus, weil das Dashboard
vier Zeilen weiter `/api/auth/sessions` nennt. Eine Route stand für eine andere
ein, weil sie deren Präfix ist; genau die Verwechslung, gegen die diese
Richtung geschrieben ist. Der zweite war der Pflanzversuch selbst: zweimal habe
ich einen Namen in einen **längeren** umbenannt, der den alten enthält, und das
Ausbleiben des Risses zuerst dem Prüfer angelastet.

**B17 — Die Modelljob-Warteschlange behält die Worte der Person, im Klartext,
für immer (2026-08-24).** Die Frage, aus der das kam, war harmlos: warum haben
acht von 47 Tabellen eine Q5-Obergrenze und die übrigen nicht? Die meisten
antworten durch ihre Form — ein Schlüssel, der eine Zeile zulässt, eine Zeile
je Domäne, eine je Modul — und 32 werden irgendwo gelöscht. Übrig blieb eine:
`pico_model_job_queue`.

Sie hält je Modelljob eine Zeile. `job_json` trägt die Einheiten nach ADR 0116
W3, darunter den Satz, den die Person getippt hat; `result_json` die Antwort;
`recall_context_json` das erinnerte Material, das der Job bekam. Alle drei im
Klartext. **Fünf Dinge, die vergleichbare Speicher erreichen, erreichen diese
Tabelle nicht** — jedes nachgemessen, keines gefolgert: keine Q5-Obergrenze,
kein einziges `DELETE`, `home.memory.forget` leert nur den *Verweis* auf das
behaltene Item, `domain-shred.ts` nennt die Tabelle nie, und die
Verschlüsselungshaltung, die ein `memory_item` trägt, gibt es hier nicht.

**Was diese Tabelle ist, genau gesagt — die erste Fassung dieses Befunds sagte
es zu schwach.** Sie ist kein Protokoll neben dem Produkt, sie *ist* die
Recall-Historie, die der Person gezeigt wird: `recallsFor` gibt jede Zeile als
`question` zurück, aus der `person_present`-Einheit des Jobs zurückgelesen,
daneben die Werte der Antwort, und `home.recall.read` liefert das aus. Dass
Pico zeigt, was jemand gefragt und was es geantwortet hat, ist eine
Eigenschaft, kein Leck.

**Die Lücke ist damit eine fehlende Operation, keine mehrdeutige.** Die
geschlossene Liste hat `home.recall.ask`, `home.recall.read`,
`home.recall.keep` und `home.memory.forget`. Ein `home.recall.forget` gibt es
nicht. Eine Person kann die Erinnerung aufheben, die sie aus einer Antwort
behalten hat, und den Austausch, aus dem sie kam, nicht — Frage und Antwort
bleiben in der Liste, im Klartext, egal was sie über das Verschlüsseln ihrer
Erinnerungen entschieden hat.

Was diese Operation tun soll, ist die Entscheidung: eine Zeile, die noch ein
behaltenes Item nennt, ist tragend — ADR 0126s Notiz hält fest, dass ein
behaltenes Item *über seinen Job* gefunden wird —, also müsste ein Vergessen
entweder ablehnen, das Item mitnehmen oder nur die Worte leeren und die
Verbindung lassen.

`scripts/check-store-ceilings.mjs` fragt jetzt jede Tabelle, wie sie aufhört
zu wachsen. Diese antwortet, dass sie es nicht tut, in der Begründungsliste des
Prüfers selbst: eine Ausnahme, die vorgibt, wäre schlimmer als keine, und so
steht die Antwort bei jedem Lauf auf dem Bildschirm statt nirgends.

**Entschieden und gebaut (2026-08-25).** Der Nutzer hat die dritte Möglichkeit
gewählt: die Zeile bleibt, ihre Worte gehen. `home.recall.forget` ist die 47.
Link-Operation, Migration `0025_pico_model_job_forgotten` trägt die Spalte,
und im Fenster steht neben jedem abgeschlossenen Austausch ein zweiter Knopf:
*Take this exchange back*. Er darf neben *Forget this* stehen — Behalten und
Vergessen schließen einander aus, das Zurücknehmen des Austausches ist eine
Frage über etwas anderes. Genau dafür ist er da: die Notiz behalten und den
Chat loswerden.

Zwei Dinge, die erst beim Bauen sichtbar wurden, und beide sind der Grund,
warum es sich gelohnt hat, den Fall statt nur die Fläche zu bauen:

- **Ein laufender Job kommt zurück.** Die Fläche bietet das Zurücknehmen für
  eine wartende Zeile nicht an, der Vorgang kann es trotzdem. Der Anbieter
  antwortete danach und schrieb seine Antwort in `result_json` einer Zeile,
  deren Worte gerade gelöscht worden waren — die Historie hätte sie nicht
  gezeigt, die Platte hätte sie gehabt. `settle` schreibt jetzt nur, solange
  `forgotten_at` leer ist, und das Zurücknehmen schließt eine laufende Zeile
  als `taken_back` ab, damit nichts auf Arbeit wartet, die niemand mehr will.
- **Zwei Rückrufe mit derselben Form.** `takeBack` und `forget` sind beide
  `(id: string) => void`. Der neue Parameter stand zuerst *vor* dem alten,
  also hat jeder bestehende Aufrufer sein Vergessen stillschweigend als
  Zurücknehmen übergeben — getypt und falsch. Ein Test auf beide Knöpfe einer
  Zeile, jeder mit seinem eigenen Bezeichner, fand es; der neue Parameter steht
  jetzt am Ende. Im Fenster wäre das ein Knopf gewesen, der etwas anderes tut,
  als er sagt.

Die Begründung im Deckel-Prüfer ist entsprechend neu geschrieben und sagt
weiterhin *unbegrenzt*: Zeilen werden nach wie vor nicht gelöscht und tragen
keine Q5-Obergrenze. Was sich geändert hat, ist, dass die Worte in einer Zeile
jetzt der Person gehören. Was noch wächst, sind leere Zeilen, die sie gewählt
hat, und volle, die sie nicht gewählt hat.

**B22 — Der Schreiber-Prüfer sah 47 von 82 Methoden und sagte „jede"
(2026-08-25).** Beim Nachtragen der Zahlen für B17 fiel auf, dass
`check-store-writers.mjs` weiterhin 47 Schreibmethoden meldete, obwohl
`forgetRecall` eine neue ist und `UPDATE` ausführt. Der Grund steht in der
Signatur:

```ts
  public forgetRecall(input: {
    jobId: string;
  }): 'forgotten' | 'not_yours' {   // <- hier hörte der Prüfer auf zu lesen
```

Er las den Rumpf zeilenweise bis zur ersten `}` auf zwei Leerzeichen — und
genau so schließt ein mehrzeiliger Parametertyp. Jede Methode dieser Form hatte
für ihn einen leeren Rumpf, kein `UPDATE` darin und existierte nicht: **31 in
`event-store.ts` allein**, dazu `enqueue`, `markKept` und `forgetRecall` der
Warteschlange sowie vier weitere. Die bestandene Zeile sagte „47
Schreibmethoden, jede erreichbar" — wahr über die 47, die er sah, und gelesen
als Aussage über den Speicher. Ein toter Schreiber in dieser Form wäre nie
gemeldet worden.

Dieselbe Klasse wie die vier Zählungen vom 2026-08-24 (72 von 119 Wire-Labels,
22 Home-Umgebungswerte, „produktweit" ohne `modules/`, elf Stores samt des
Prüfers selbst): **eine gedruckte Zahl, die vollständig klingt und einen Teil
misst.** Der Prüfer zählt jetzt Klammern statt Zeilen — Parametertiefe, dann
Rumpftiefe —, was exakt und nicht länger ist als die Schätzung davor.
Falsifiziert im Vergleich: dieselbe gepflanzte Methode wird von der
Klammerzählung gemeldet und von der Zeilenlesung nicht gesehen.

**Und die Berichtigung fand sofort drei Merkmale, die niemand erreichen kann.**
Alle drei sind in ihrem ADR als halb umgesetzt verzeichnet, keines war
verschwiegen — nur ungeprüft:

- `setPicoSupplierCredential` (ADR 0138 CO1): **Ein Zugangswort für einen
  Lieferanten kann heute niemand hinterlegen.** Die erste Fassung dieses
  Befunds sagte, es warte darauf, wo das Geheimnis ruht — das war falsch und
  ist am selben Tag berichtigt: die Verwahrung ist entschieden (Domänen-KEK,
  ein Domänen-Shred nimmt es mit), `SupplierCredentialCrypto` ist gebaut und
  gegen seine drei Ablehnungen geprüft. Was fehlt, ist ein **Abnehmer**: der
  einzige existierende Lieferant ist eine lokale git-Arbeitskopie, deren
  eigener Kopf sagt, dass sie keines braucht, und die Übergabe bräuchte
  zusätzlich einen Platz im geschlossenen Lieferanten-Transport (ADR 0136
  BR2). Das ADR sagt das ausdrücklich als Entscheidung: jetzt zu bauen hieße,
  einen zweiten ungenutzten Mechanismus neben den zu stellen, den es schon
  meldet.
- `acceptPicoDepotOffer` (ADR 0143 DP1): **Gebaut, am selben Tag.** Der
  Befund war in Wahrheit drei Befunde, die auf *eine* fehlende Hälfte zeigten:
  ein Speicher-Schreiber ohne Aufrufer, eine als unerreicht begründete
  Fähigkeit (`picoDepotState` — „die Depotzeilen im Fenster zeigen es nicht")
  und eine Operationsliste ohne Annahme. Der Fetch schrieb das Angebot,
  niemand konnte es sehen, niemand es annehmen. `home.depot.offer.accept` ist
  jetzt die 48. Operation, der Lesevorgang trägt das Zustandswort des Moduls,
  und das Fenster stellt die Frage über den beiden Schaltern — ein Angebot ist
  eine gestellte Frage, die Schalter sind Einstellungen. Beide Begründungen in
  den Prüfern haben ihren Gegenstand verloren und sind entfernt; einer von
  beiden hat das selbst gemeldet.

  Ein Fehler wurde erst durch die Erreichbarkeit sichtbar: die Annahme löschte
  das Angebot nicht, also hätte die Fläche weiter „es gibt etwas Neues" über
  genau den Commit gesagt, den die Person gerade angenommen hatte.
- `setPicoRuleDecision` (ADR 0140 RL4): **Gebaut, am selben Tag** — und der
  Befund war größer als er aussah. Der Kommentar der Methode sagte, eine
  Regeländerung komme „über eine authentifizierte Fläche oder gar nicht", und
  es gab keine solche Fläche. Dazu passte, dass `picoRuleDecisions` den
  Kommentar „for a surface that shows them" trug und
  `home.rule_decision_changed` in beiden geschlossenen Ereignislisten stand,
  ohne dass irgendetwas es anhängte. Der eine Leser einer Regel im ganzen
  Produkt ist der Depot-Sweep — **der planmäßige Lauf tat seit seinem Bau
  nichts**, weil er ohne stehende Regel einen Menschen sucht und keinen findet.

  `home.rule.decide` und `home.rule.forget` schließen das, und im Fenster steht
  über den Depotzeilen ein Satz, der sagt, was ohne ihn geschieht: *Pico
  fetches only while you are here to be asked. A scheduled run has nobody to
  ask, so it does nothing.* Zurücknehmen ist ein eigener Vorgang, weil abwesend
  nicht `deny` ist. Kein `home.rules.read` daneben — die Lehre vom
  Lieferanten-Zugang desselben Tages: ein zweiter ungenutzter Mechanismus ist
  schlechter als eine benannte Lücke.

  **Und ein ADR-Satz war stärker als das, was gilt.** „A recorded rule refines
  and never grants" stand über einer Testgruppe, die zwei Dinge bewies und den
  Fall dazwischen nie prüfte — dort gewährt eine Regel sehr wohl, und das ist
  der Zweck. Dieselbe Klasse wie die gedruckten Zahlen: eine Aussage, die
  vollständig klingt, über eine Teilmenge bewiesen. Ich habe daraufhin zuerst
  das Falsche gebaut (nur verschärfen), weil ich die Frage auf zwei falschen
  Prämissen gestellt hatte — der unbeaufsichtigte Sweep ist gebaut und
  getestet, und er holt nur Commits, denen schon zugestimmt wurde. Beides
  berichtigt, bevor entschieden wurde.

Jede der drei steht jetzt mit diesem Satz in der Begründungsliste des Prüfers,
damit die Lücke bei jedem Lauf auf dem Bildschirm steht statt in einer Zahl zu
verschwinden. Ob eine davon gebaut wird, ist eine Entscheidung, keine
Aufräumarbeit.

**B18 — Der Code machte die Arbeit des Satzes, an zwei Stellen (2026-08-24).**
`picoCompanionPublicServiceErrorReason` verengt jeden Fehlschlag auf vier
öffentliche Gründe, und das ist richtig: eine Meldung aus einem Daemon ist kein
Satz und kann einen Pfad tragen. Beide Stellen, die das benutzten, setzten
danach den **Code** auf den Bildschirm — „The local companion service could not
start (companion_profile_invalid)" — und daneben eine Anweisung, die für alle
vier dieselbe war. Die Person bekam also ein Wort, das nichts erklärt, neben
einem Satz, der nicht unterscheidet.

Das Muster dagegen stand direkt daneben: achtzehn Beitritts-Ablehnungen haben
seit dem 2026-08-21 Titel und Satz, das Erstlauf-Vokabular ebenso. Vier Gründe,
vier Sätze, an einer Stelle — und ein unbekannter Grund bekommt den ehrlichen
Satz statt seines Wortlauts, weil eine Person, der man nicht sagen kann, was
passiert ist, mit einem Wort dafür nicht geholfen ist.

**Ein Test hielt dabei den Defekt fest.** „falls back to the reason it was
given rather than inventing one" verlangte, dass der Code im Text steht,
während sein eigener Kommentar „etwas Wahres und Spezifisches" verlangte. Die
Absicht war richtig, die Behauptung war das alte Verhalten.

**Und die erste Fassung der Regel war zu breit**, was der Prüfer selbst sofort
zeigte: sie suchte den Code überall und meldete `main.ts`, wo
`companion_service_unavailable` als *geworfener Fehler* über die IPC-Grenze
steht. Ein Fehlerbezeichner darf so heißen; niemand liest ihn. Geprüft wird
jetzt der `body:` einer Präsentation — 110 davon —, denn eine Prüfung, deren
Fehlschläge überwiegend falsch sind, bringt Leuten bei, sie zu überspringen.

**B19 — Zweimal an einem Tag war mein Umfang eine Behauptung (2026-08-24).**
Der Reichweitenprüfer aus B14/B15 ließ `modules/` aus, ohne dass jemand
nachgesehen hätte — genau der Fehler, den derselbe Prüfer mir am Vormittag
schon einmal nachgewiesen hatte. Ein Modul ist aber genau das, worum es dieser
Regel geht: ADR 0127 nennt es Vokabular, Komposition und Fläche, und der Core
importiert seine Funktionen beim Namen.

Sechs von dreizehn Modulexporten ruft nichts. Vier sind die Codekante einer
aufgeschriebenen Abwesenheit — der Home-Assistant-Transport und die
Spatial-Recall-Vertagung aus **B4**. Zwei sind etwas anderes: die Art, wie ein
Modul einer Person etwas sagt, wonach das Produkt nicht fragt.
`picoCalendarAgenda` ordnet zeitgebundene Einträge, Überfälliges zuerst und
darin das Älteste; `picoDepotState` gibt einem Depot ein Zustandswort mit der
einen Stelle, an der ein Grund eine Folge überholt. Keine Fläche zeigt
beides — und, nachgemessen, keine baut es woanders nach. Es ist also
Nichtfragen, nicht Drift.

**Und der Prüfer hatte eine vierte eigene Lücke, gefunden dadurch, dass er
sich selbst widersprach.** Er meldete eine meiner Begründungen als veraltet,
obwohl sie stimmte. Der Grund: er strippt seit heute Vormittag Kommentare auf
der *Aufruferseite* — Prosa ist kein Aufrufer —, zählte aber die Nennungen in
der *eigenen Datei* roh. `picoParkingAnswer` steht einmal im eigenen
Doc-Kommentar, und das genügte, um es in den harmlosen Topf „für die eigenen
Tests exportiert" zu schieben statt in die Meldung. Eine Regel, die auf einer
Seite gilt und auf der anderen nicht, versteckt genau das, wonach sie sucht.

**B20 — Die Einstellungsgrenze galt für das Home und nicht für den Relay
(2026-08-24).** `settings:check` liest `apps/core/src/config.ts` und hält
dessen zweiundzwanzig Einträge gegen ADR 0104 S5. Pico Relay liest zwölf
eigene, und der Prüfer hat sie nie angesehen. Seine Erfolgszeile sagte „22
environment entries, each classified" — wahr, und zu lesen, als wären es alle.
Dieselbe Form wie die zweiundsiebzig Wire-Labels neben hundertneunzehn
(**B13**), und wieder war die Zahl selbst die Warnung.

Der Weg dorthin war ein anderer: die Frage war, ob ein Deployment eine
Variable setzt, die der Code nicht liest. Das war sauber — alle vier
Deployment-Dateien setzen nur Gelesenes. Auffällig wurde stattdessen die
Zählung daneben.

**Kein einziger der zwölf ist eine Einstellung**, und das ist die
load-bearing Aussage: Datenbankpfad, drei Paare aus Host und Port,
Zeitgrenzen, Verbindungsobergrenze — und `PICO_RELAY_OPERATOR`, der Hostname,
den Absender auflösen, weshalb der Dienst ohne ihn gar nicht startet statt
einen zu raten. S2 macht eine Einstellung in der Umgebung zum Defekt, und
dass hier keine ist, hatte niemand aufgeschrieben. Es ist billig
aufzuschreiben, gerade weil der Relay so gebaut ist: er hält keine
Pico-Identität und entscheidet für niemanden, hat also keine Einstellung zu
verlegen. Aufgeschrieben wird die Leere damit prüfbar statt angenommen.

**Ein dritter Fall am selben Tag, und deshalb steht er hier statt als eigener
Befund:** `progress.md` nannte die Regeln für Fingerabdruck, Zeitpunkt und
Zeitspanne „je eine **produktweit** geprüfte Regel", während beide Prüfer
`modules/` nicht lasen. Ein Modul ist nach ADR 0127 eine Fläche, könnte also
einen Schlüssel fürs Auge kürzen oder einen Zeitpunkt roh zeigen. Die Wurzel
dazuzunehmen kostete nichts — beide bleiben grün —, und erst damit stimmt das
Wort. Dreimal an einem Tag dieselbe Form: eine Zahl oder ein Wort, das
vollständig klingt und eine Komponente auslässt.

**Und der Block war zuerst falsch geschnitten.** Er reichte bis zur nächsten
`##`-Überschrift und verschluckte die ältere Statusnotiz darunter, in der
`PICO_MEMORY_ENCRYPTION` vorkommt — ein Name aus einer anderen Geschichte
galt damit als Relay-Klassifikation und wurde sofort als veraltet gemeldet.
Der Prüfer hatte recht, der Schnitt war falsch; er endet jetzt an der nächsten
Notiz.

**B21 — Ein abgelehntes Home meldet sich, ein stummes hängt (2026-08-25).**
Gefunden beim Schließen von ADR 0131 A7 auf einem A34: ein per `SIGSTOP`
angehaltenes Home ließ die Erreichbarkeitsprüfung des Telefons zweieinhalb
Minuten warten und hätte es weiter getan. Weder `link-direct-client.ts` noch
die Companion setzen eine Zeitgrenze; `link_home_did_not_answer` deckt nur den
Fall ab, in dem `fetch` wirft.

**Die Folge trägt weiter als Android.** ADR 0112s Alarm-Carrier leitet
`reportHomeReachable(false)` aus einem geworfenen Lesevorgang ab — ein
stummes Home wirft nicht, also fällt die Meldung nie. Damit gibt es eine
dritte Möglichkeit neben „es wartet nichts" und „niemand hat nachgesehen":
**der Lauf hängt noch** — und von außen sieht das aus wie die erste. Genau
diese Verwechslung verbietet ADR 0118 O4.

Die Sonde setzt sich ihre Grenze selbst (20 Sekunden, `read_timed_out`), weil
sie sie heute brauchte. Wo sie hingehört, ist der Direct-Client, und wie lang
sie sein soll — eine Zahl fürs Heimnetz, eine andere über einen Relay — hat
ADR 0107 nicht entschieden. Das steht dort als datierte Notiz.

**Entschieden und gebaut, noch am selben Tag.** Die Grenze sitzt jetzt im
Direct-Client und gilt damit für jeden Aufrufer — den Alarm-Carrier
eingeschlossen. Die Voreinstellung ist keine neue Zahl, sondern die Lebensdauer
des Umschlags selbst (30 s): länger zu warten hieße, auf die Antwort zu einer
Anfrage zu warten, die das Home als abgelaufen zurückwiese — genau die Antwort,
die das angehaltene Home nach zweieinhalb Minuten gab. Eine benannte Ausnahme
steht daneben, mit ihrem Grund: `home.action.approval.resolve` führt bei einer
Depot-Freigabe `git` im Request aus, mit 120 s je Aufruf, und wird deshalb fünf
Minuten lang erwartet. Die Liste ist über `PicoLinkDirectOperation` typisiert,
also kann kein Name darin stehenbleiben, den es nicht mehr gibt.

Zwei Dinge fand erst das Pflanzen:

- **Der Wecker stand zu früh auf.** Er wurde gelöscht, sobald die Antwort
  *begann* — ein Home, das Kopfzeilen schickt und den Rumpf nie zu Ende, hing
  damit wieder für immer, während der Kommentar daneben behauptete, genau
  dieser Fall sei gedeckt. Jetzt fällt er erst, wenn der Rumpf gelesen ist.
- **`toThrow` prüft auf Teilzeichenkette.** Der Test, der festhält, dass eine
  zu große Antwort weiterhin `link_response_too_large` heißt, ließ die
  Umbenennung nach `link_home_did_not_answer:link_response_too_large` durch —
  gegen die er geschrieben war. Er verlangt den Namen jetzt genau.

**Und ein zweiter Fund aus demselben Lauf, über das Labor statt über das
Produkt:** das Home schrieb seine Worte nur in eine Variable des
Sponsorprozesses. Als der an einer Ausnahme starb, verschwand die einzige
Stelle, an der stand, warum es mit `500` geantwortet hatte — und der
Fehlschlag kostete einen ganzen Durchgang, nur um ihn noch einmal zu erzeugen.
Ein Absturz muss seine Erklärung hinterlassen.

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
