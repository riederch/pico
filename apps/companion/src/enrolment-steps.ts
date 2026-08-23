import {
  picoDeviceEnrolmentAcceptancePrefix,
  picoDeviceEnrolmentGrantPrefix,
  picoDeviceEnrolmentOfferPrefix,
} from '@pico/protocol/device-enrolment';

/**
 * ADR 0130 E3 / ADR 0131 A5. The three-code exchange, stated once.
 *
 * The codes and their prefixes are the protocol's (ADR 0130 E3); what lives
 * here is the part a *client* has to get right: at which moment each code is
 * read rather than shown, and which prefix a read must accept. That pairing
 * was six string literals in the desktop shell's `main.ts`, which made every
 * further client - the Android one A5 asks for above all - a seventh copy of
 * a fact nothing checked.
 *
 * Getting it wrong does not fail loudly. A surface that reads an acceptance
 * while validating against the offer prefix refuses a code that is correct,
 * in front of two people who both did exactly what they were asked, and the
 * refusal reads as the *other* device's fault.
 *
 * The steps are split by device rather than by order, matching the words the
 * companion shell already shows: a sponsor never shows an offer and a joining
 * device never reads one, so no client should offer both halves.
 */
export type PicoCompanionEnrolmentCodeKind = 'offer' | 'grant' | 'acceptance';

export interface PicoCompanionEnrolmentCodeStep {
  kind: PicoCompanionEnrolmentCodeKind;
  direction: 'read' | 'show';
  /**
   * Present on a read and absent on a show, because the asymmetry is real:
   * what is shown is whatever the ceremony produced, and what is read has to
   * be checked before it is believed.
   */
  prefix?: string;
}

export const picoCompanionEnrolmentCodeSteps = {
  read_offer: { kind: 'offer', direction: 'read', prefix: picoDeviceEnrolmentOfferPrefix },
  read_grant: { kind: 'grant', direction: 'read', prefix: picoDeviceEnrolmentGrantPrefix },
  read_acceptance: {
    kind: 'acceptance',
    direction: 'read',
    prefix: picoDeviceEnrolmentAcceptancePrefix,
  },
  show_offer: { kind: 'offer', direction: 'show' },
  show_grant: { kind: 'grant', direction: 'show' },
  show_acceptance: { kind: 'acceptance', direction: 'show' },
} as const satisfies Record<string, PicoCompanionEnrolmentCodeStep>;

export type PicoCompanionEnrolmentCodeStepName =
  keyof typeof picoCompanionEnrolmentCodeSteps;

/** The prefix a read must accept, by the name the surface already uses. */
export function picoCompanionEnrolmentReadPrefix(
  step: 'read_offer' | 'read_grant' | 'read_acceptance',
): string {
  return picoCompanionEnrolmentCodeSteps[step].prefix;
}

/**
 * What a surface has to be able to do for the exchange to happen at all.
 *
 * Three verbs, because the ceremony needs exactly three things from a
 * platform: put a code in front of a person, take one back, and say where in
 * the walk they are. How each is done - a canvas and a camera on the desktop,
 * whatever Android does - is the platform's business and none of the
 * ceremony's.
 *
 * `showing` on a read is not decoration. On the camera path the other device
 * is reading that code at that moment, and on the typed path the person still
 * needs it in front of them; a surface that cleared the screen to ask for the
 * answer would break a working ceremony in a way no test of either half would
 * catch.
 */
export interface PicoCompanionEnrolmentSurface {
  showCode(
    step: 'show_offer' | 'show_grant' | 'show_acceptance',
    code: string,
  ): Promise<void>;
  readCode(
    step: 'read_offer' | 'read_grant' | 'read_acceptance',
    showing?: string,
  ): Promise<string>;
  announce(step: 'waiting' | 'joined' | 'kept'): Promise<void>;
}

/**
 * The sponsor's half of the exchange, as the callback the ceremony asks for.
 *
 * The ceremony already owns when this runs - it hands over a grant the
 * moment one exists and waits for the answer - so all that is stated here is
 * the pairing: the grant is shown, and the acceptance is read while it stays
 * shown.
 */
export function picoCompanionSponsorExchange(
  surface: PicoCompanionEnrolmentSurface,
): (grantCode: string) => Promise<string> {
  return async (grantCode: string) => {
    await surface.showCode('show_grant', grantCode);
    return await surface.readCode('read_acceptance', grantCode);
  };
}

/**
 * The asking device's half, which is a sequence rather than a callback.
 *
 * Both devices that ask walk it: one that has nothing and wants in, and one
 * whose year ran out and wants to keep working. What differs is what `offer`
 * and `accept` do - make new keys or show the ones already held - and the
 * sentence at the end, which is why those are arguments and the walk is not.
 *
 * **The acceptance is shown before `confirm` is awaited**, and that ordering
 * is the whole reason this is one function instead of two copies. The other
 * device cannot finish without reading the acceptance; a client that waited
 * first would leave two devices waiting for each other, each convinced it is
 * the one being kept waiting, with no error raised anywhere.
 *
 * The waiting line is started but not awaited before `confirm`, so a slow
 * surface delays nothing - and it is awaited afterwards, so a failing one is
 * still heard.
 */
export async function runPicoCompanionAskingDeviceExchange<
  Offered extends { offerCode: string },
  Accepted extends { acceptanceCode: string; confirm: () => Promise<unknown> },
>(input: {
  surface: PicoCompanionEnrolmentSurface;
  offer: () => Promise<Offered>;
  /**
   * Handed what the offer produced, because a joining device's acceptance
   * needs the keys its own offer just made. Passing them through the walk
   * keeps the caller from holding a mutable variable across three awaits to
   * say something the walk already knew.
   */
  accept: (grantCode: string, offered: Offered) => Promise<Accepted>;
  outcome: 'joined' | 'kept';
}): Promise<Accepted> {
  const offered = await input.offer();
  await input.surface.showCode('show_offer', offered.offerCode);
  const grantCode = await input.surface.readCode('read_grant', offered.offerCode);

  const accepted = await input.accept(grantCode, offered);
  await input.surface.showCode('show_acceptance', accepted.acceptanceCode);

  const waiting = input.surface.announce('waiting');
  try {
    await accepted.confirm();
  } finally {
    await waiting;
  }
  await input.surface.announce(input.outcome);
  return accepted;
}

/**
 * ADR 0130 E2. What the window says while the ceremony asks for approvals.
 *
 * The ceremony announces a moment and the surface writes the sentence. That
 * split is real where the surfaces differ: the CLI says "on the terminal
 * holding the unlock", which is true there and false in a window, and getting
 * it wrong would send a person looking for a terminal that does not exist.
 *
 * It is *not* real between two screens. These lived in
 * `apps/companion-shell/src/contract.ts` until 2026-08-21, which made them the
 * Electron window's words - so an Android surface implementing the same
 * `PicoCompanionEnrolmentSurface` would have received a step name and written
 * eleven sentences of its own. Two clients telling one person two different
 * things about the same moment is what ADR 0131 A5 exists to prevent.
 */
export function picoCompanionFoundingStepLine(
  step: 'device_delegation' | 'home_claim' | 'founding_acceptance',
): { title: string; body: string } {
  switch (step) {
    case 'device_delegation':
      return {
        title: 'Approve this device',
        body: 'Pico is asking your new identity to vouch for this device. Your Vault will '
          + 'ask you to confirm it.',
      };
    case 'home_claim':
      return {
        title: 'Approve moving in',
        body: 'Pico is asking your Home to let this identity move in, using the one-time '
          + 'code from the line you pasted.',
      };
    default:
      return {
        title: 'Approve founding',
        body: 'Your Home accepted the claim and is waiting for you to sign what it '
          + 'founded. This is the last approval.',
      };
  }
}

/**
 * ADR 0130 E3. What the window says at each of the six times two devices are
 * held up to each other, and the two that end it.
 *
 * **The words never name the ceremony.** A person is holding two screens: what
 * they need to know is which one to look at, what the thing they are showing
 * says about them, and whether anything has happened yet. "Delegation",
 * "activation" and "evidence" are true and would tell them nothing they can
 * act on - the codebase already has those words in the records.
 *
 * The steps are split by device rather than by order, because each device only
 * ever sees its own four: a sponsor never shows an offer and a joining device
 * never reads one.
 */
export type PicoCompanionEnrolmentStep =
  | 'read_offer'
  | 'show_grant'
  | 'read_acceptance'
  | 'added'
  | 'show_offer'
  | 'read_grant'
  | 'show_acceptance'
  | 'waiting'
  | 'joined'
  | 'renewed'
  | 'kept';

export function picoCompanionEnrolmentStepLine(
  step: PicoCompanionEnrolmentStep,
): { title: string; body: string } {
  switch (step) {
    case 'read_offer':
      return {
        title: 'Read the code the other device is showing',
        body: 'Hold it up to this device\u2019s camera, or type the code in. Nothing reaches '
          + 'your Home until you approve what it asks for.',
      };
    case 'show_grant':
      return {
        title: 'Hold this up to the device you are adding',
        body: 'It says which Home that device is joining and which keys it will be known '
          + 'by. It is good for four minutes, and it is no use to anybody else.',
      };
    case 'read_acceptance':
      return {
        title: 'Now read the code it shows back',
        body: 'The other device answered with its own key. This device carries that answer '
          + 'to your Home.',
      };
    case 'added':
      return {
        title: 'That device is yours now',
        body: 'Your Home answers to it as well. Nothing else changed - every device you '
          + 'already had keeps working.',
      };
    case 'show_offer':
      return {
        title: 'Show this to the device you already have',
        body: 'It says which keys this device just made for itself. That is all it says, '
          + 'and none of it is a secret.',
      };
    case 'read_grant':
      return {
        title: 'Read the code your other device shows',
        body: 'This device checks that the code is really about itself before it signs '
          + 'anything, and it will not sign one meant for a different machine.',
      };
    case 'show_acceptance':
      return {
        title: 'Show this back',
        body: 'This device signed with the key it just made. Your other device carries it '
          + 'to your Home.',
      };
    case 'waiting':
      return {
        title: 'Waiting for your Home',
        body: 'This device is not yours until your Home says so, so it is asking. If this '
          + 'stays here, the other device has not sent it yet.',
      };
    case 'renewed':
      return {
        title: 'That device keeps working',
        body: 'Its authority runs for another year, and the one it had before is '
          + 'retired. Nothing else changed.',
      };
    case 'kept':
      return {
        title: 'This device keeps working',
        body: 'Your Home answers to it for another year. It is the same device with '
          + 'the same keys; only the authority over them is new.',
      };
    case 'joined':
    default:
      return {
        title: 'This device is yours',
        body: 'Your Home answers to it now, and every device you already had keeps '
          + 'working.',
      };
  }
}

/**
 * ADR 0131 A5. Was ein Pico sagt, wenn ein Beitritt nicht zustande kommt.
 *
 * **Gemessen am 2026-08-22: die Zeremonie hat achtzehn Arten abzulehnen, und
 * das Produkt hatte für alle achtzehn ein Achselzucken - in zwei
 * Schreibweisen.** Der Desktop fiel auf "Pico could not set this device up
 * (`code`). Nothing was changed at your Home.", das Telefon auf "This phone
 * was not added / Nothing was changed at your Home." plus den rohen Code in
 * einer Statuszeile. Keiner der beiden hatte ein Wort für die Ablehnungen, die
 * der gemeinsame Kern tatsächlich erzeugt.
 *
 * Das ist eine andere Sorte Befund als die Passphrase: dort standen sechs
 * Sätze für einen Moment, hier steht ein Satz für achtzehn. Beides ist
 * dieselbe Frage - wem gehören die Worte - und beide Male ist die Antwort
 * derselbe Ort.
 *
 * **Worte bekommen die vier, an denen eine Person etwas ändern kann.** Die
 * übrigen vierzehn sind Zustände und Defekte: ein Profil, das sich nicht lesen
 * lässt, eine Signatur mit der falschen Rolle, ein fehlender Zustimmungspfad.
 * Für die ist die ehrliche Auskunft, dass nichts geschehen ist und wie der
 * Fehler heißt - jemandem zu erklären, was er anders machen soll, wenn er
 * nichts anders machen kann, ist keine Hilfe, sondern eine Vermutung.
 */
export function picoCompanionEnrolmentRefusalLine(
  refusal: string,
): { title: string; body: string } {
  // Der Grund reist an manchen Codes mit (`was_not_accepted:...`); für die
  // Auswahl zählt der Kopf, für die Ablehnung der ganze String.
  const code = refusal.split(':')[0] ?? '';
  switch (code) {
    case 'pico_companion_enrolment_offer_is_this_device':
      return {
        title: 'That code is this device’s own',
        body: 'You held this device up to itself. The code you need is the one on the '
          + 'device you already have.',
      };
    case 'pico_companion_enrolment_acceptance_is_for_another_activation':
      return {
        title: 'That code answers a different attempt',
        body: 'It was made for an earlier try. Start again on both devices, and carry '
          + 'the codes from this attempt only.',
      };
    case 'pico_companion_enrolment_vault_is_not_new':
      return {
        title: 'This device already has keys',
        body: 'Joining makes new ones, so it will not run on a device that is already '
          + 'part of a Home. Nothing was changed.',
      };
    case 'link_home_did_not_answer':
      /**
       * ADR 0131 A7. Der häufigste Fehlschlag eines Telefons, weil es das
       * Haus verlässt - und bis zum 2026-08-22 der einzige ohne Namen: er kam
       * als `fetch failed` durch und landete im Achselzucken.
       *
       * Die Worte sind **nicht** die der Bedingung `home_unreachable` aus
       * `@pico/companion/conditions`, obwohl es dieselbe Lage ist. Deren
       * Rumpf sagt "Recall, entry and capture continue here", was für einen
       * laufenden Client stimmt und hier falsch wäre: dieser Beitritt läuft
       * gerade nicht weiter. Denselben Satz zu nehmen, weil die Lage dieselbe
       * heißt, hätte einer Person etwas Unwahres gesagt.
       */
      return {
        title: 'Your Home did not answer',
        body: 'This device is not on the same network as your Home, or your Home is not '
          + 'running. Nothing was changed; try again where your Home can be reached.',
      };
    case 'pico_companion_enrolment_was_not_accepted':
      return {
        title: 'Your Home has not said yes',
        body: 'The other device may not have sent the answer yet, or somebody still has '
          + 'to approve it there. Nothing was changed at your Home.',
      };
    default:
      /**
       * Das eine Achselzucken. Der Code steht darin, weil er das Einzige ist,
       * was hier wirklich hilft - und weil eine Ablehnung, die nichts nennt,
       * niemandem erlaubt, danach zu fragen.
       */
      return {
        title: 'This device was not added',
        body: `Pico stopped before anything changed at your Home (${refusal}).`,
      };
  }
}
