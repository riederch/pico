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
das Telefon trägt den Kern und ist am 2026-08-21 vollständig in ein echtes
Home eingezogen — drei Codes, zwei Geräte, die Sätze aus dem Kern —, aber die
Fläche ist ein Laborartefakt und keine ausgelieferte App.

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
`home.reader_custody.reader_grant.submit`), ein Knopf im Fenster, und der
Zugang gilt **ab jetzt und nicht rückwirkend** (ADR 0088s `from_version`) —
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

Einer davon ist der interessante: `packages/module-spatial-recall/src/ports.ts`
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
`scripts/check-companion-reach.mjs` die Klasse: eine Fähigkeit, die nichts
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
