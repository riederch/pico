/**
 * Welche Foundation-Routen kein Aufrufer im Produkt erreicht, und warum das
 * jeweils in Ordnung ist.
 *
 * **Eine eigene Datei seit dem 2026-09-20 (Befund B232).** Die Liste stand in
 * `check-surface-classes.mjs`, und `measure-route-walk.mjs` schloss mit dem
 * Satz, jener Pruefer sage, welche der ungegangenen Routen argumentiert sind.
 * Das stimmte nur ungefaehr: der Pruefer argumentiert Routen **ohne Aufrufer
 * im Produkt**, der Lauf zaehlt Routen, die **in seinem Szenario** niemand
 * erreicht hat. Zwei benachbarte Fragen, deren Antworten sich am 2026-09-20 um
 * fuenf Routen unterschieden.
 *
 * Der Lauf liest die Liste jetzt selbst und nennt den Unterschied. Sie liegt
 * hier, weil ein Import des Pruefers ihn mitlaufen liesse - er endet auf
 * `process.exit(1)`, und ein Messgeraet, das beim Lesen einer Liste das
 * Programm beendet, ist keines.
 */
export const arguedRoutes = [
  /**
   * Die drei Einzelstücke neben ihren Listen, gefunden am 2026-09-02 (B55).
   *
   * Sie stehen hier zusammen, weil sie dieselbe Gestalt haben und derselbe
   * Satz sie trägt: **eine Liste hat einen Aufrufer, ihr Einzelstück nicht.**
   * Das ist kein „die Tür in Gebrauch ist woanders" wie bei den Einträgen
   * darunter - hier fehlt ein Client, und das ist der Unterschied, den ein
   * Argument nicht verwischen darf.
   *
   * Zwei davon standen seit dem 2026-08-29 in Befund B44 als *unauffindbar*:
   * eine Route aus Sammeladresse und Parameter habe kein eigenes Stück, an dem
   * ein Muster sie festhalten könnte. Der Abgleich über die ganze Route findet
   * sie, und er meldet nichts Richtiges als falsch - fünf Urteile ändern sich,
   * jedes von Hand nachgesehen. Die dritte, `GET /api/events`, war bis dahin
   * gar nicht bekannt: für sie bürgten vier *Kommentare* im Protokollpaket.
   *
   * Was daraus wird - gelöscht oder bedient -, ist eine Entscheidung über die
   * Foundation-Fläche und keine Zeile in einem Prüfer.
   */
  {
    method: 'GET',
    route: '/api/events',
    why: 'ADR 0030. Der Blättern-Zwilling von `/api/events/tail`: die Fläche liest den '
      + 'Schwanz und schreibt mit `POST`, und niemand blättert. Kein Client, keine Tür '
      + 'woanders - gefunden am 2026-09-02, Befund B55',
  },
  {
    method: 'GET',
    route: '/api/memory/domains/:privacyDomain/items/:memoryItemId',
    why: 'ADR 0071. Das Einzelstück neben `/items`: die Fläche listet einen Raum und zeigt '
      + 'aus der Liste. Kein Client - gefunden am 2026-09-02, Befund B55',
  },
  {
    method: 'GET',
    route: '/api/memory/retention-policies/:retentionPolicyId',
    why: 'ADR 0074. Das Einzelstück neben der Liste: geändert und gelöscht wird über '
      + 'dieselbe Adresse, gelesen wird aus der Liste. Kein Client - gefunden am '
      + '2026-09-02, Befund B55',
  },
  {
    prefix: '/api/home/domain-read-grant',
    why: 'ADR 0082 with ADR 0130 E5. The door in use is the Link operation '
      + '`home.domain.read-grant.submit`, which the companion calls from the person\'s own '
      + 'device; this is the same signed evidence over a Foundation session, and no product '
      + 'opens one for it',
  },
  {
    prefix: '/api/home/share-envelope',
    why: 'ADR 0086/0089. No companion issues or receives a share envelope, and there is no '
      + 'Link operation either - this family has no door in use at all, which is the same '
      + 'absence ADR 0130 E5 stays open on',
  },
  /**
   * **Zwei Stuecke der Familie, und nicht mehr die ganze** (2026-09-02, B55).
   *
   * Hier stand `/api/home/reader-custody/` als Praefix, und das Argument sagte,
   * das Produkt trage diese Aufzeichnungen ueber Link. Fuer sieben der zwoelf
   * Routen war das falsch: die Zeremonien des Vault-Daemons rufen `domains`,
   * `reader-grants`, `reader-grant-lifecycle` und `kek-rotations` genau hier,
   * ueber HTTP, gegen ein echtes Home. Ein Praefix-Argument hatte sie
   * stillgestellt, und die Zeile des Pruefers zaehlte sie als *begruendet ohne
   * Aufrufer*, wo sie einen haben.
   *
   * Aufgefallen ist das erst, als die Widerspruchspruefung an die richtige
   * Stelle rutschte - davor nahm eine gerufene Route den ersten Ausgang. Das
   * Argument hatte schon einmal seine Wahrheit ueberlebt (Notiz vom
   * 2026-08-29), und ein Praefix ist die Gestalt, in der so etwas unbemerkt
   * bleibt.
   */
  {
    prefix: '/api/home/reader-custody/writer-grant',
    why: 'ADR 0086/0117 mit ADR 0130 E5. Schreibzugaenge fuer einen fremden Schreiber gibt '
      + 'es als Fläche und in keinem Produktweg - weder ueber Link noch hier. Diese '
      + 'Abwesenheit ist dieselbe, auf der ADR 0130 E5 offen steht (2026-09-02, B55)',
  },
  {
    prefix: '/api/home/reader-custody/items',
    why: 'ADR 0086/0117. Der Foundation-Transport der Aufzeichnungen selbst: das Fenster '
      + 'schreibt und liest sie ueber eine Autoritaetsressource, nicht ueber diese Routen '
      + '(2026-09-02, B55)',
  },
  {
    prefix: '/api/auth/bootstrap',
    why: 'ADR 0130. A Home is claimed from the Client over Link (`home.claim.submit`), and '
      + 'the Foundation bootstrap is what the tool used before that walk existed',
  },
  {
    prefix: '/api/depot/attachments',
    why: 'ADR 0143. `home.depot.attach` is the door in use',
  },
  {
    prefix: '/api/model/jobs/',
    why: 'ADR 0117/0151. `home.model.read.keep` is the door in use',
  },
  {
    prefix: '/api/model/providers/mine',
    why: 'ADR 0151. `home.model.providers.read` is the door in use',
  },
  {
    prefix: '/api/memory/time-bound-entries/',
    why: 'ADR 0118 O1. `home.time_bound_entry.acknowledge` is the door in use',
  },
  {
    route: '/api/auth/session',
    method: 'GET',
    why: 'ADR 0076. Die Betreiberfläche hält ihre Sitzung im Speicher, solange ihr Reiter '
      + 'offen ist, und fragt niemanden, ob sie noch gilt - ein Aufruf, der scheitert, sagt '
      + 'es ihr an der Stelle, an der es zählt. Gefunden am 2026-08-29, als der Aufrufertest '
      + 'anfing, das Verb zu lesen (Befund B44)',
  },
  {
    route: '/api/auth/session',
    method: 'DELETE',
    why: 'ADR 0076. Abgemeldet wird alles auf einmal - die Fläche ruft '
      + '`DELETE /api/auth/sessions` -, weil eine Person, die aufhört, nicht meint '
      + '„dieser Reiter" sondern „dieses Home". Die Einzelsitzungs-Hälfte hat keinen '
      + 'Aufrufer (Befund B44)',
  },
  {
    route: '/api/model/providers/:entryId/decision',
    prefix: '/api/model/providers/',
    method: 'POST',
    why: 'ADR 0152 SE6. Die Tür in Gebrauch ist `home.model.provider.decision.submit`, die '
      + 'das Fenster vom Gerät der Person aus ruft; das hier ist dieselbe Entscheidung über '
      + 'eine Foundation-Sitzung, und keine öffnet dafür eine. `/narrowing` liegt unter '
      + 'demselben Präfix und wird gerufen, deshalb steht das Verb daneben',
  },
  {
    route: '/api/model/providers/:entryId/decision',
    prefix: '/api/model/providers/',
    method: 'DELETE',
    why: 'ADR 0152 SE6, die Rücknahme derselben Entscheidung: '
      + '`home.model.provider.decision.revoke` ist die Tür in Gebrauch',
  },
  {
    prefix: '/api/system/version',
    why: 'ADR 0075. A diagnostic a person never asks for and no client polls; it exists so '
      + 'somebody with a terminal can tell what is running. The only route here with '
      + 'neither a caller nor a Link twin',
  },
];
