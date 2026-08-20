import type { PicoModelProviderState } from '@pico/protocol/model-provider-state';

/**
 * ADR 0113 C2/B3: the complete renderer-facing contract. It contains only
 * already-rendered presentation state. Key material, daemon paths, sockets,
 * signed records and generic IPC payloads have no representation here.
 */
export const picoCompanionIpcChannels = Object.freeze({
  getPresentation: 'pico:presentation:get',
  presentationChanged: 'pico:presentation:changed',
  requestCheck: 'pico:lifecycle:check',
  vetoRecovery: 'pico:recovery:veto',
  openRecoveryCard: 'pico:recovery-card:open',
  submitRecoveryCard: 'pico:recovery-card:submit',
  decideApproval: 'pico:approval:decide',
  beginFirstRun: 'pico:first-run:begin',
  /** ADR 0130 E2. The other first run: a Home that does not exist yet. */
  beginFounding: 'pico:founding:begin',
  /**
   * ADR 0130 E3. The third first run, and the settings-side half of it.
   *
   * Two channels because they are two devices: `joinFromDevice` runs on the
   * machine that has nothing yet, `beginEnrolment` on the one that already
   * holds the identity key. Neither carries a code - both walk the person
   * through the codes in the main process, where everything that authorises
   * is collected (ADR 0113 C2).
   */
  joinFromDevice: 'pico:enrolment:join',
  beginEnrolment: 'pico:enrolment:begin',
  closeWindow: 'pico:window:close',
  getModelProviders: 'pico:model-providers:get',
  /** ADR 0142 PE2. Point the Home at a host, and watch it be timed. */
  askModelProviderMeasurement: 'pico:model-provider-measurement:ask',
  getModelProviderMeasurements: 'pico:model-provider-measurements:get',
  decideModelProvider: 'pico:model-provider:decide',
  widenModelProvider: 'pico:model-provider:widen',
  revokeModelProvider: 'pico:model-provider:revoke',
  getAnsweredReads: 'pico:model-reads:get',
  keepAnsweredRead: 'pico:model-read:keep',
  askRecall: 'pico:recall:ask',
  getRecalls: 'pico:recalls:get',
  grantDomainRead: 'pico:domain-read-grant:issue',
  keepRecall: 'pico:recall:keep',
  /** ADR 0071. One memory item, unmade by the person who made it. */
  forgetMemory: 'pico:memory:forget',
  getSuppliers: 'pico:suppliers:get',
  decideSupplierReach: 'pico:supplier-reach:decide',
  /** ADR 0137 IN5. The one field a depot may not supply, from the person. */
  attachSupplier: 'pico:supplier:attach',
  detachSupplier: 'pico:supplier:detach',
  detachDepot: 'pico:depot:detach',
  forgetModelProvider: 'pico:model-provider:forget',
  getDepots: 'pico:depots:get',
  attachDepot: 'pico:depot:attach',
  decideDepotReach: 'pico:depot-reach:decide',
  fetchDepotsNow: 'pico:depot-fetch:ask',
  /**
   * ADR 0141 RN4, and deliberately not `decideApproval` above.
   *
   * That one answers the Vault about a signature this device is being asked to
   * make; this one answers the *Home* about an action it is holding against a
   * presence session. Sharing a channel would put two different questions with
   * two different clocks and two different answerers behind one name.
   */
  getPendingActions: 'pico:pending-actions:get',
  resolvePendingAction: 'pico:pending-action:resolve',
  /** ADR 0139 AC4. What the parts of Pico may do, agreed to one at a time. */
  getModuleConsent: 'pico:module-consent:get',
  recordModuleConsent: 'pico:module-consent:record',
  getDevices: 'pico:devices:get',
  switchDevice: 'pico:device:switch',
  forgetDevice: 'pico:device:forget',
  /**
   * ADR 0130 E3, and deliberately not `getDevices` above. That one asks the
   * Home which devices are here and what each offers; this one asks which of
   * them it still answers to. Same machines, two different questions, and a
   * window that merged them would have to invent an answer whenever only one
   * of the two reads came back.
   */
  getDeviceAuthority: 'pico:device-authority:get',
  endDeviceAuthority: 'pico:device-authority:end',
  /** ADR 0104. Another year for the device the person is holding. */
  renewDeviceAuthority: 'pico:device-authority:renew',
  /**
   * ADR 0130 E3. The two-device renewal, from whichever side. `renewOther`
   * runs on the device holding the identity key, `renewFromOtherDevice` on
   * the one asking to keep working.
   */
  renewOtherDevice: 'pico:device-authority:renew-other',
  renewFromOtherDevice: 'pico:device-authority:renew-mine',
  /**
   * ADR 0130 E4. The Home rather than a device: who else lives in it, and the
   * keys it is known by.
   */
  getHomeMembers: 'pico:home-members:get',
  admitHomeMember: 'pico:home-member:admit',
  endHomeMembership: 'pico:home-member:end',
  rotateHostKeys: 'pico:home-host-keys:rotate',
  getRelays: 'pico:relays:get',
  claimRelay: 'pico:relay:claim',
  createRelayAccount: 'pico:relay-account:create',
  revokeRelayAccount: 'pico:relay-account:revoke',
  forgetRelay: 'pico:relay:forget',
});

export type PicoCompanionPresentationKind =
  | 'starting'
  | 'first_run'
  | 'idle'
  | 'pending_recovery'
  | 'recovery_waiting'
  | 'recovery_completed'
  | 'recovery_completion_blocked'
  | 'recovery_card_setup'
  | 'secure_input'
  | 'approval'
  | 'recovery_card_printed'
  | 'host_keys_rotated'
  | 'host_continuity_unverified'
  | 'clock_divergence'
  /**
   * ADR 0118 O1. Something the person asked to be reminded of is due. A
   * `kind` rather than a condition: the conditions list says what is *absent*,
   * and a waiting appointment is the opposite - something present that needs
   * them.
   */
  | 'time_bound_entry_due'
  | 'service_error'
  | 'device_code';

export type PicoCompanionPresentationSeverity = 'active' | 'warning' | 'blocked';

/**
 * ADR 0118 O4 and ADR 0119 Q5. Stated conditions, carried beside `kind` rather
 * than folded into it.
 *
 * ADR 0009 offered one avatar state, "offline or degraded", for facts the
 * person needs to tell apart: "I cannot send this" is not "I cannot have this
 * summarised", and neither is "I am running out of room". Different decisions
 * follow from each, and any of them may hold while the others do not - so this
 * is a list, and a shape that cannot collapse them back into one.
 */
export const picoCompanionConditionKinds = [
  'no_network',
  'home_unreachable',
  'no_model',
  'storage_reserved',
  'storage_exhausted',
] as const;

export type PicoCompanionConditionKind = typeof picoCompanionConditionKinds[number];

/**
 * ADR 0113 C2. The protocol's provider states, declared here because this file
 * loads in the renderer, where a bare specifier does not resolve.
 *
 * A local copy of a closed list is exactly the drift this project keeps
 * hitting, so it is bound to the protocol by a test rather than by intent -
 * the same arrangement `browser:check` names as the remedy.
 */
/**
 * ADR 0151 PV4. What a device calls the credential it hands over.
 *
 * A person types a secret, not a name. The seal is keyed by entry and resident
 * already, so the reference carries no information a person could supply and
 * asking for one would be asking them to invent a label for a thing they
 * cannot see.
 */
export const picoCompanionModelProviderCredentialRef = 'provider_credential';

export const picoCompanionModelProviderStates = [
  'not_used_yet',
  'working',
  'answered',
  'did_not_answer',
  'different_model',
] as const;

export interface PicoCompanionCondition {
  kind: PicoCompanionConditionKind;
  /** What the person can do about it. Short, and never a mystery refusal. */
  remedy: string;
}

/**
 * ADR 0118's five floor families, declared here rather than imported.
 *
 * This file is renderer-reachable and the renderer loads plain ES modules with
 * no bundler, so a bare specifier like `@pico/protocol` would simply fail to
 * resolve at runtime. A test binds this list to the protocol's own, which is
 * what keeps a local copy from drifting into a second source of truth.
 */
export const picoCompanionFloorFamilies = [
  'capture',
  'time_bound_entry',
  'local_recall',
  'decide',
  'recovery_access',
  // ADR 0129. Remembering a place, and answering from it - the family whose
  // question is asked in exactly the place the network is not.
  'spatial_recall',
] as const;

/**
 * ADR 0118 O4, the load-bearing half: no condition renders a floor operation
 * as blocked. An avatar that reports itself broken while capture works teaches
 * the person that Pico is unreliable offline, which is the opposite of what the
 * contract buys - so whenever a condition is shown, what still works is shown
 * with it, derived from the list rather than written out by hand.
 */
export function picoCompanionFloorAssurance(): string {
  return `Still working: ${picoCompanionFloorFamilies.join(', ').replace(/_/gu, ' ')}.`;
}
export type PicoCompanionPresentationDecision =
  | 'none'
  | 'veto_recovery'
  | 'recovery_card_details'
  | 'approve_or_deny'
  | 'begin_first_run';

/**
 * How the Recovery Card reaches Electron Main. Both sources deliver into the
 * main process only - the camera through an external decoder, the scanner and
 * the typed fallback through main-process keystroke capture - so the renderer
 * chooses the source and never sees the result.
 */
/**
 * ADR 0130 E2 - the two situations a device with no Home can be in.
 *
 * **A choice, because they are not the same act and the wrong one is
 * expensive.** Restoring puts an existing identity on this device and asks a
 * Home to replace its devices, which runs an objection window. Founding makes
 * an identity that did not exist and takes an empty Home. A person who founds
 * when they meant to restore has a second identity and no way back to the
 * first; the surface has to ask before either happens, not after.
 *
 * The words say what each one *does*, not what it is called: "I have a
 * Recovery Card" and "This Home is new" are things a person knows about their
 * own situation, while "restore" and "found" are things this codebase knows.
 */
export interface PicoCompanionFirstRunChoiceLine {
  choice: 'restore' | 'found' | 'join';
  headline: string;
  detail: string;
  actionLabel: string;
}

export function picoCompanionFirstRunChoiceLines(): readonly PicoCompanionFirstRunChoiceLine[] {
  return Object.freeze([
    Object.freeze({
      choice: 'restore' as const,
      headline: 'You already have a Pico somewhere.',
      detail: 'Your Recovery Card puts your identity on this device and asks your Home to '
        + 'replace your devices with it. Your Home waits out an objection window first, so '
        + 'any device you still have can stop it.',
      actionLabel: 'I have a Recovery Card',
    }),
    Object.freeze({
      choice: 'found' as const,
      headline: 'You just set up a Pico Home and nobody lives in it.',
      detail: 'Pico makes you a new identity on this device and moves it in. You will need '
        + 'the address of that Home and the line it printed when it started - it contains '
        + 'the one-time code and the keys this device pins it to.',
      actionLabel: 'This Home is new',
    }),
    /**
     * ADR 0130 E3. The third thing that is true of a device with nothing on
     * it, and the most common one after the first: the person already has a
     * Pico, on a machine that is working, and wants this one too.
     *
     * Kept apart from the Recovery Card on purpose. Restoring *replaces* every
     * device with this one and runs an objection window; joining adds one and
     * leaves the others alone. A person who restored when they meant to join
     * would have cut off the device they are holding in their other hand.
     */
    Object.freeze({
      choice: 'join' as const,
      headline: 'You have a Pico on another device, and it still works.',
      detail: 'That device gives this one its own keys and tells your Home about it. '
        + 'Nothing else changes: every device you already have keeps working. You will '
        + 'hold the two screens up to each other three times.',
      actionLabel: 'Add this device from another one',
    }),
  ]);
}

/**
 * ADR 0130 E2. What the window says while the ceremony asks for approvals.
 *
 * The ceremony announces a moment and each caller writes the sentence; these
 * are this window's. The CLI's say "on the terminal holding the unlock", which
 * is true there and false here - and getting that wrong would send a person
 * looking for a terminal that does not exist.
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
 * ADR 0104. How long this device's first delegation is good for.
 *
 * A pinned product default rather than something a person is asked: a first
 * run that opened with "how many days?" would be asking somebody to decide a
 * thing they have no way to have an opinion about yet. A year, because a
 * delegation that outlives the person's memory of making it is a standing
 * grant, and one that expires during setup is a device that stops working
 * before it was used.
 */
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
 * ADR 0104, as ADR 0130 E2 pinned it for the first device: the same year for
 * every later one. A person adding a laptop is not in a position to have an
 * opinion about how long its authority should last, and two different answers
 * for the first and second device would be two rules to remember.
 */
export function picoCompanionEnrolmentValidUntil(now: Date): string {
  return picoCompanionFoundingDelegationValidUntil(now);
}

export const picoCompanionFoundingDelegationDays = 365;

export function picoCompanionFoundingDelegationValidUntil(now: Date): string {
  const until = new Date(now.getTime());
  until.setUTCDate(until.getUTCDate() + picoCompanionFoundingDelegationDays);
  return until.toISOString();
}

export const picoCompanionFirstRunScanSources = ['camera', 'typed'] as const;

export type PicoCompanionFirstRunScanSource =
  typeof picoCompanionFirstRunScanSources[number];

export interface PicoCompanionRecoveryCardSetupInput {
  picoName: string;
  homeNameOrId: string;
  homeId: string;
  form: 'paper' | 'card_printer';
}

export interface PicoCompanionPresentation {
  kind: PicoCompanionPresentationKind;
  severity: PicoCompanionPresentationSeverity;
  symbol: '●' | '!' | '×';
  decision: PicoCompanionPresentationDecision;
  title: string;
  body: string;
  /**
   * Independent of `kind`: several may hold at once, and none of them changes
   * what the floor can do.
   */
  conditions: readonly PicoCompanionCondition[];
  /**
   * ADR 0130 E3. Present only on `device_code`: what this device is holding
   * up for another one to read.
   *
   * The matrix travels rather than the drawing, because a QR encoder in the
   * page would be a second implementation of the thing a camera has to agree
   * with - and the text travels beside it, because a camera that will not
   * focus is not a reason to be stuck.
   */
  code?: PicoCompanionDeviceCode;
  observedAt: string;
}

export interface PicoCompanionDeviceCode {
  text: string;
  qr: {
    size: number;
    /** Row-major, one entry per module: dark is `true`. */
    modules: readonly boolean[];
  };
}

const kinds = new Set<PicoCompanionPresentationKind>([
  'starting',
  'first_run',
  'idle',
  'pending_recovery',
  'recovery_waiting',
  'recovery_completed',
  'recovery_completion_blocked',
  'recovery_card_setup',
  'secure_input',
  'approval',
  'recovery_card_printed',
  'host_keys_rotated',
  'host_continuity_unverified',
  'clock_divergence',
  'time_bound_entry_due',
  'service_error',
  /** ADR 0130 E3. A code this device is showing to another one. */
  'device_code',
]);
const severities = new Set<PicoCompanionPresentationSeverity>([
  'active',
  'warning',
  'blocked',
]);
const symbols = new Set<PicoCompanionPresentation['symbol']>(['●', '!', '×']);
const decisions = new Set<PicoCompanionPresentationDecision>([
  'none',
  'veto_recovery',
  'recovery_card_details',
  'approve_or_deny',
  'begin_first_run',
]);

/**
 * ADR 0118 O4 and ADR 0119 Q5. Turns the facts a host can observe into stated
 * conditions, so the wording of a remedy lives in one place instead of being
 * re-invented at each producer.
 *
 * `online` is `undefined` when nothing observed it, and that is deliberately
 * not the same as offline: claiming "no network" because nobody looked would
 * teach the person to distrust the indicator. Same for the storage state.
 *
 * The remedies are what the person can actually do, not restatements of the
 * problem. ADR 0119 Q5's `reserved` is the one that matters most - the person
 * is told while there is still room to act, which is what makes ADR 0118's
 * capture floor honest under exhaustion.
 */
/**
 * ADR 0130 E2. Why a first run stopped, in the words the person needs.
 *
 * Here rather than beside the window that shows it, for the reason this file
 * already gives about conditions: the wording of a failure lives in one place
 * instead of being re-invented at each producer - and here it can be tested,
 * which is how the two announcement failures below were found to be
 * unreachable rather than merely unwritten.
 *
 * `fallbackReason` is passed in rather than derived, because turning an
 * unknown error into a public reason is the shell's job and this file loads
 * in the renderer.
 */
/**
 * ADR 0112. What the window asks for when it asks for the Card PIN.
 *
 * The vault owns this rule (`picoRecoveryPinProtection`) and this file cannot
 * import it: it loads in the renderer, where a bare specifier does not
 * resolve. So the rule is stated a second time here and bound to the vault's
 * by a test - the arrangement `browser:check` names as the remedy for exactly
 * this shape.
 *
 * Worth more care than the usual copy. A PIN the vault would accept and this
 * refuses never reaches an error message: `collectPicoCompanionSecureInput`
 * answers a rejected value with a character count and nothing else, so the
 * person would be typing a valid PIN into a box that blinks at them. The
 * numbers are interpolated into the sentence for the same reason - prose that
 * disagrees with the rule is a third copy waiting to drift.
 */
/**
 * ADR 0113 C2. What the window says while a secret is being typed.
 *
 * The body used to end with "the value is not valid yet" for every prompt,
 * which says *that* something is wrong and never *what*. Four defects found on
 * 2026-08-19 were invisible because of it - a Recovery Card code that could
 * not be typed at all, a founding line from a Home's second boot, and two
 * rules copied out of the core - and in each of them the person did the right
 * thing and watched a counter blink at them.
 *
 * The refusal is the prompt's own sentence, fixed before anything is typed.
 * That is deliberate and it is the ADR 0113 boundary, not a shortcut: a
 * refusal computed from the value would be the obvious next step and would
 * carry a fact about the secret to a page that is not allowed to learn one.
 * The page still receives a count and nothing else.
 */
/**
 * ADR 0113 C2. A refusal, as a person can read it.
 *
 * The window used to put `error.message` into a status line unchanged, so
 * pressing a second button while the first was working produced
 * `companion_operation_in_progress` on screen. The comment above that code
 * said each refusal "names something to do next", which is true of the
 * vocabulary and not true of the sentence a person needs.
 *
 * Three shapes, because the refusals are three different kinds of event:
 *
 *  - an **operational** one is a state the person can wait out or act on,
 *    and gets a sentence;
 *  - **their own** mistake gets a sentence that says how to do it again,
 *    without the word "defect" anywhere near it;
 *  - an **`invalid_*`** refusal means this window sent the boundary
 *    something it disallows. That is a defect in Pico rather than anything
 *    a person did, and saying so is the difference between "you typed it
 *    wrong" and "report this" - so the word stays in the sentence, because
 *    a report needs it.
 *
 * Anything else keeps the caller's own sentence and carries the word after
 * it. Refusals travel from the Home too, in a vocabulary this file does not
 * own, and the call site is the thing that knows what was being attempted.
 */
export function picoCompanionRefusalLine(message: string, fallback: string): string {
  if (message === '') {
    return fallback;
  }
  const spoken: Record<string, string> = {
    companion_operation_in_progress:
      'Pico is already doing something for you. Wait for it to finish, then try again.',
    companion_approval_already_pending:
      'An approval is already waiting for you. Answer that one first.',
    companion_service_unavailable:
      'Pico is not running yet on this device. It starts with the window; give it a moment.',
    companion_window_unavailable:
      'This window closed before Pico could ask you. Open it and start again.',
    no_presence_session:
      'This device is not connected to your Home right now, so nothing was sent.',
    recovery_pin_mismatch:
      'The two PINs were not the same. Nothing was printed - choose the PIN again.',
    untrusted_companion_ipc_sender:
      'Pico refused a request that did not come from this window, and did nothing.',
  };
  if (spoken[message] !== undefined) {
    return spoken[message];
  }
  if (message.startsWith('invalid_')) {
    return `Pico refused what this window sent (${message}). That is a defect in Pico and `
      + 'not something you did; nothing was changed.';
  }
  return `${fallback} (${message})`;
}

export function picoCompanionSecureInputBody(
  prompt: { instruction: string; refusal: string },
  count: number,
  invalid: boolean,
): string {
  const typed = `${count} character${count === 1 ? '' : 's'} entered`;
  return `${prompt.instruction} ${typed}${invalid ? `. ${prompt.refusal}` : ''}. `
    + 'The page receives neither keystrokes nor value.';
}

export function picoCompanionCardPinPrompt(purpose: 'choose' | 'enter' = 'choose'): {
  title: string;
  instruction: string;
  maximumLength: number;
  refusal: string;
  validate(value: string): boolean;
} {
  const minLength = 6;
  const maxLength = 64;
  const pattern = new RegExp(`^[0-9a-z]{${minLength},${maxLength}}$`, 'u');
  return {
    title: purpose === 'choose' ? 'Choose the Card PIN' : 'Enter the Card PIN',
    /**
     * Both purposes, one rule. The PIN a person chooses when the card is
     * printed and the PIN they type when it is used are the same string, so
     * a window that validated them differently would refuse its own card -
     * and refuse it silently, since a rejected secure input answers with a
     * character count and nothing else.
     */
    instruction: purpose === 'choose'
      ? `Type ${minLength}\u2013${maxLength} digits or lowercase letters, then press Enter. `
        + 'Keep this PIN somewhere the card is not.'
      : 'Type the PIN you chose when this card was printed, then press Enter.',
    maximumLength: maxLength,
    refusal: `A Card PIN is ${minLength}\u2013${maxLength} digits or lowercase letters, `
      + 'and nothing else.',
    validate: (value: string) => pattern.test(value),
  };
}

/**
 * ADR 0112. Typing or scanning the code printed under the QR block.
 *
 * The prefix is a parameter rather than a literal, because this file loads in
 * the renderer and cannot import `picoRecoveryCardScanPrefix` - and because a
 * literal here is precisely what went wrong: the camera path read the
 * protocol's constant while the typed path beside it demanded
 * `pico-recovery-card-v2:`, a spelling no card has ever carried. The card's
 * *metadata* schema is v2; its scan transport is v1. A person restoring a
 * device without a camera typed a valid code into a box that only blinked.
 */
export function picoCompanionRecoveryCardEntryPrompt(prefix: string): {
  title: string;
  instruction: string;
  maximumLength: number;
  refusal: string;
  validate(value: string): boolean;
} {
  return {
    title: 'Scan or type the Recovery Card code',
    instruction: 'Use a USB scanner, or type the code printed under the QR block, then '
      + 'press Enter.',
    maximumLength: 8_192,
    refusal: `A Recovery Card code begins with ${prefix} - check that you copied the whole `
      + 'line under the QR block.',
    validate: (value: string) => value.startsWith(prefix) && value.length > prefix.length,
  };
}

export function picoCompanionFirstRunFailureBody(
  message: string,
  fallbackReason: string,
): string {
  if (message.startsWith('invalid_recovery_card_scan')
    || message.startsWith('noncanonical_recovery_card')) {
    return 'That code is not a Pico Recovery Card this device can use. A card printed '
      + 'before your Home pinned its acceptor cannot start a device on its own.';
  }
  if (message.startsWith('camera_scan_')) {
    return message === 'camera_scan_unavailable'
      ? 'Pico found no camera decoder on this system. Install zbar-tools, or use a USB '
        + 'scanner or typing instead.'
      : 'Pico did not read a card from the camera. Try again, or use a USB scanner or '
        + 'typing instead.';
  }
  if (message === 'secure_input_cancelled') {
    return 'Setup was cancelled. Nothing was sent to your Home.';
  }
  if (message.startsWith('first_run_home_unverified')) {
    return 'This device could not verify that the Home on the card is really your Home, '
      + 'so it did nothing. Check that you are on the right network and try again.';
  }
  /**
   * The two the core takes care to tell apart. A line with no move-in code is
   * a Home that has already been claimed - the person needs the *enrolment*
   * path, not this one - while an unparsable line is usually the wrong line
   * copied out of the wrong place.
   */
  if (message === 'pico_home_setup_announcement_has_no_move_in_code') {
    return 'That line has no move-in code, which means this Home has already been claimed. '
      + 'Add this device from the one that claimed it instead - it is the same three codes '
      + 'as any other device.';
  }
  if (message.startsWith('invalid_pico_home_setup_announcement')) {
    return 'Pico could not read that line as the one your Home printed when it started. '
      + 'Copy the whole line, including the braces at both ends.';
  }
  return `Pico could not set this device up (${fallbackReason}). Nothing was changed at `
    + 'your Home.';
}

export function picoCompanionConditionsFor(input: {
  online?: boolean;
  homeReachable?: boolean;
  modelReachable?: boolean;
  storage?: 'normal' | 'reserved' | 'exhausted';
}): readonly PicoCompanionCondition[] {
  const conditions: PicoCompanionCondition[] = [];
  if (input.online === false) {
    conditions.push({
      kind: 'no_network',
      remedy: 'Already approved sends wait for a route. Nothing else is affected.',
    });
  }
  /**
   * ADR 0131 A7. Only when the link itself is not the explanation: with no
   * network this is the same fact told twice, and a refusal must not be an
   * inventory (ADR 0077 C4).
   *
   * This is the condition a phone lives in. ADR 0107 carries envelopes to
   * the person's own Home directly, so away from the home network there is
   * no Home to reach - and the rule this ADR family keeps restating is that
   * an unreachable Home must never look like a quiet one.
   */
  if (input.homeReachable === false && input.online !== false) {
    conditions.push({
      kind: 'home_unreachable',
      remedy: 'Your Home is not answering, so this is not a report that nothing is waiting. '
        + 'Recall, entry and capture continue here.',
    });
  }
  if (input.modelReachable === false) {
    conditions.push({
      kind: 'no_model',
      remedy: 'Summaries and suggestions wait. Capture, entry, recall and decide do not.',
    });
  }
  if (input.storage === 'reserved') {
    conditions.push({
      kind: 'storage_reserved',
      remedy: 'Export, migrate or shred a domain to make room, or provision more space.',
    });
  } else if (input.storage === 'exhausted') {
    conditions.push({
      kind: 'storage_exhausted',
      remedy: 'Free space now. Removing data still works; adding it does not.',
    });
  }
  return Object.freeze(conditions);
}

/**
 * What a builder supplies. `conditions` is optional here and always present on
 * the parsed result, so a construction site that has none writes nothing and a
 * consumer never has to tell absent from empty.
 */
export type PicoCompanionPresentationInput =
  Omit<PicoCompanionPresentation, 'conditions'>
  & { conditions?: readonly PicoCompanionCondition[] };

export function parsePicoCompanionPresentation(value: unknown): PicoCompanionPresentation {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid_companion_presentation');
  }
  const record = value as Record<string, unknown>;
  const expected = new Set([
    'kind',
    'severity',
    'symbol',
    'decision',
    'title',
    'body',
    'observedAt',
  ]);
  // `conditions` is accepted but not required, so every existing construction
  // site stays valid and simply carries none. The parsed result always has the
  // array, so a consumer never has to distinguish absent from empty.
  if (Object.keys(record).some(
    (key) => key !== 'conditions' && key !== 'code' && !expected.has(key),
  )
    || [...expected].some((key) => !(key in record))) {
    throw new Error('invalid_companion_presentation_shape');
  }
  if (!kinds.has(record.kind as PicoCompanionPresentationKind)
    || !severities.has(record.severity as PicoCompanionPresentationSeverity)
    || !symbols.has(record.symbol as PicoCompanionPresentation['symbol'])
    || !decisions.has(record.decision as PicoCompanionPresentationDecision)) {
    throw new Error('invalid_companion_presentation_state');
  }
  assertDecisionKind(
    record.kind as PicoCompanionPresentationKind,
    record.decision as PicoCompanionPresentationDecision,
  );
  assertDisplayText(record.title, 160);
  assertDisplayText(record.body, 4_000);
  if (typeof record.observedAt !== 'string'
    || !Number.isFinite(Date.parse(record.observedAt))) {
    throw new Error('invalid_companion_presentation_time');
  }
  const conditions = parseConditions(record.conditions);
  const code = parseDeviceCode(record.code, record.kind as PicoCompanionPresentationKind);
  return Object.freeze({
    ...record,
    conditions,
    ...(code === undefined ? {} : { code }),
  }) as unknown as PicoCompanionPresentation;
}

/**
 * ADR 0130 E3. A code belongs to the one kind that is about showing a code.
 *
 * Tied to the kind rather than accepted anywhere, because a matrix riding
 * along on an alarm or an approval would be a second thing the window has to
 * decide how to draw, and nobody declared what that means.
 */
function parseDeviceCode(
  value: unknown,
  kind: PicoCompanionPresentationKind,
): PicoCompanionDeviceCode | undefined {
  if (value === undefined) {
    if (kind === 'device_code') {
      throw new Error('invalid_companion_presentation_code');
    }
    return undefined;
  }
  /**
   * Two kinds may carry one, and they are the two that are about a code:
   * showing it, and taking the answer while it is still on screen. A person
   * pasting the other device's answer must not have had the thing they are
   * answering taken off the display to make room for the prompt.
   */
  if ((kind !== 'device_code' && kind !== 'secure_input')
    || typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid_companion_presentation_code');
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== 2 || keys[0] !== 'qr' || keys[1] !== 'text') {
    throw new Error('invalid_companion_presentation_code');
  }
  if (typeof record.text !== 'string' || record.text.length === 0
    || record.text.length > 8_192) {
    throw new Error('invalid_companion_presentation_code');
  }
  const qr = record.qr as { size?: unknown; modules?: unknown } | null;
  if (typeof qr !== 'object' || qr === null
    || typeof qr.size !== 'number' || !Number.isInteger(qr.size)
    || qr.size < 21 || qr.size > 177
    || !Array.isArray(qr.modules)
    || qr.modules.length !== qr.size * qr.size
    || qr.modules.some((module) => typeof module !== 'boolean')) {
    throw new Error('invalid_companion_presentation_code');
  }
  return Object.freeze({
    text: record.text,
    qr: Object.freeze({
      size: qr.size,
      modules: Object.freeze([...qr.modules as boolean[]]),
    }),
  });
}

const conditionKinds = new Set<PicoCompanionConditionKind>(picoCompanionConditionKinds);

function parseConditions(value: unknown): readonly PicoCompanionCondition[] {
  if (value === undefined) {
    return Object.freeze([]);
  }
  if (!Array.isArray(value) || value.length > picoCompanionConditionKinds.length) {
    throw new Error('invalid_companion_presentation_conditions');
  }
  const seen = new Set<PicoCompanionConditionKind>();
  const parsed: PicoCompanionCondition[] = [];
  for (const entry of value as unknown[]) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error('invalid_companion_presentation_conditions');
    }
    const record = entry as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    if (keys.length !== 2 || keys[0] !== 'kind' || keys[1] !== 'remedy') {
      throw new Error('invalid_companion_presentation_conditions');
    }
    const kind = record.kind as PicoCompanionConditionKind;
    if (!conditionKinds.has(kind)) {
      throw new Error('invalid_companion_presentation_conditions');
    }
    if (seen.has(kind)) {
      // Two rows saying the same thing is a display nobody declared, and
      // "show them both" is a decision this contract did not make.
      throw new Error('duplicate_companion_presentation_condition');
    }
    seen.add(kind);
    assertDisplayText(record.remedy, 200);
    parsed.push(Object.freeze({ kind, remedy: record.remedy as string }));
  }
  if (seen.has('storage_reserved') && seen.has('storage_exhausted')) {
    // ADR 0119 Q5's states are a ladder, not a set. Showing both would leave
    // the person to work out which one is true.
    throw new Error('conflicting_companion_presentation_condition');
  }
  return Object.freeze(parsed);
}

function assertDecisionKind(
  kind: PicoCompanionPresentationKind,
  decision: PicoCompanionPresentationDecision,
): void {
  const expectedKind = decision === 'veto_recovery'
    ? 'pending_recovery'
    : decision === 'recovery_card_details'
      ? 'recovery_card_setup'
      : decision === 'approve_or_deny'
        ? 'approval'
        : decision === 'begin_first_run'
          ? 'first_run'
          : undefined;
  if (expectedKind !== undefined && kind !== expectedKind) {
    throw new Error('invalid_companion_presentation_decision_binding');
  }
}

export function picoCompanionIdlePresentation(now = new Date()): PicoCompanionPresentation {
  return parsePicoCompanionPresentation({
    kind: 'idle',
    severity: 'active',
    symbol: '●',
    decision: 'none',
    title: 'Pico is watching your Home',
    body: 'No pending device recovery was found on the last authenticated check.',
    observedAt: now.toISOString(),
  });
}

export function parsePicoCompanionRecoveryCardSetupInput(
  value: unknown,
): PicoCompanionRecoveryCardSetupInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid_recovery_card_setup');
  }
  const record = value as Record<string, unknown>;
  const expected = new Set(['picoName', 'homeNameOrId', 'homeId', 'form']);
  if (
    Object.keys(record).some((key) => !expected.has(key))
    || [...expected].some((key) => !(key in record))
  ) {
    throw new Error('invalid_recovery_card_setup_shape');
  }
  assertDisplayText(record.picoName, 256);
  assertDisplayText(record.homeNameOrId, 256);
  if (
    typeof record.homeId !== 'string'
    || !/^[A-Za-z0-9._:/+-]{1,1024}$/u.test(record.homeId)
  ) {
    throw new Error('invalid_recovery_card_home_id');
  }
  if (record.form !== 'paper' && record.form !== 'card_printer') {
    throw new Error('invalid_recovery_card_print_form');
  }
  return Object.freeze({ ...record }) as unknown as PicoCompanionRecoveryCardSetupInput;
}

export function parsePicoCompanionFirstRunScanSource(
  value: unknown,
): PicoCompanionFirstRunScanSource {
  if (typeof value !== 'string'
    || !picoCompanionFirstRunScanSources.includes(
      value as PicoCompanionFirstRunScanSource,
    )) {
    throw new Error('invalid_first_run_scan_source');
  }
  return value as PicoCompanionFirstRunScanSource;
}

function assertDisplayText(value: unknown, maximum: number): void {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum) {
    throw new Error('invalid_companion_presentation_text');
  }
}

/**
 * ADR 0152 on the person's own device.
 *
 * The shape is the ADR 0107 `home.model.providers.read` reply, which carries
 * no throughput figure and no digest: those are the layer behind, and the
 * layer behind lives where the measurement does. What arrives here is what a
 * person decides with.
 */
export interface PicoCompanionModelProvider {
  entryId: string;
  model: string;
  /**
   * ADR 0048 with ADR 0152 SE2. What the finding says this machine is.
   *
   * Carried because the decision restates it: a person confirming where their
   * words may go is confirming *this*, and a device that sent a class it made
   * up would be declaring on their behalf.
   */
  providerClass: string;
  contextTokens: number;
  measuredAt: string;
  decided: boolean;
  sees: string;
  needsCredentialToSeeMore: boolean;
  /**
   * ADR 0152 SE5. What it last did, derived by the Home from settled jobs.
   *
   * Optional because a Home built before this answered without it, and a
   * device that refused the whole list over a missing word would turn an older
   * Home into a broken one (ADR 0118 O4).
   */
  state?: PicoModelProviderState;
}

/**
 * ADR 0152 SE1, as the one place the words are chosen.
 *
 * **The sentences are computed here rather than in the DOM**, for the reason
 * SE1 exists: a summary that reads well and hides a condition is the failure
 * mode, and a rule about wording only holds if something can be held to it.
 * The renderer prints these strings with `textContent` and decides nothing.
 *
 * Three states and never two. A provider nobody decided about is not "off" -
 * off is a decision somebody made. Saying so is ADR 0138's posture in a
 * sentence: reaching outside is off until somebody says so, and the person
 * should be able to tell the difference between not yet asked and answered no.
 */
export interface PicoCompanionModelProviderLine {
  entryId: string;
  headline: string;
  detail: string;
  /** What the person can do next, which is never more than one thing. */
  action: 'decide' | 'widen' | 'revoke';
  /**
   * ADR 0142 PE1. A machine they no longer have, forgotten.
   *
   * **Beside `action` rather than inside it**, and the two rules do not
   * disagree: `action` is the decision axis - what this machine may see - and
   * offering two of those at once is what asks a person to work out which
   * applies. This is the other axis, and it ends the thing the decision is
   * about. `Forget` rather than `Remove` because there is nothing on disk to
   * remove; what goes is a measurement and every answer given about it.
   */
  forgetActionLabel: string;
  /**
   * ADR 0152 SE2. The words on the button, chosen here like every other word.
   *
   * A control labelled from the renderer would be the one sentence in this
   * surface that no test could hold to anything - and it is the sentence a
   * person actually acts on.
   */
  actionLabel: string;
  /**
   * ADR 0048. The declaration the person is confirming, carried so the device
   * never invents one.
   */
  providerClass: string;
}

/**
 * ADR 0152 SE5. What a state adds to the line a person is reading.
 *
 * **Working and gone are different absences and get different sentences**:
 * one ends by itself and the other needs somebody. A changed model is neither
 * - it is a sentence about a decision to re-pin, never a warning to wave away.
 *
 * `not_used_yet` and `answered` add nothing, and that is deliberate: a note on
 * a machine that is doing its job is noise, and noise is what makes the two
 * sentences above stop being read.
 */
function picoCompanionModelStateDetail(
  state: PicoModelProviderState | undefined,
): string | undefined {
  switch (state) {
    case 'working':
      return 'It is answering something now. The first answer after a quiet '
        + 'spell takes longer, because the model has to be loaded first.';
    case 'did_not_answer':
      return 'It did not answer the last thing Pico sent. Summaries and '
        + 'suggestions wait; everything you do yourself is unaffected.';
    case 'different_model':
      return 'It is serving a different model than the one that was measured. '
        + 'Pico sends nothing there until somebody measures it again - the '
        + 'numbers this decision was made on were measured against the old one.';
    default:
      return undefined;
  }
}

export function picoCompanionModelProviderLines(
  providers: readonly PicoCompanionModelProvider[],
): readonly PicoCompanionModelProviderLine[] {
  return Object.freeze(providers.map((provider) => {
    const stateDetail = picoCompanionModelStateDetail(provider.state);
    if (!provider.decided) {
      return Object.freeze({
        entryId: provider.entryId,
        headline: `${provider.model} is available and you have not decided about it`,
        // Not "it is off". Off is an answer, and nobody gave one.
        detail: 'Pico will not send anything here until you say so.',
        action: 'decide' as const,
        // The consequence, not the mechanism: what the person is agreeing to
        // is what this machine will see.
        actionLabel: 'Let it see this conversation',
        forgetActionLabel: 'Forget this machine',
        providerClass: provider.providerClass,
      });
    }
    if (provider.needsCredentialToSeeMore) {
      return Object.freeze({
        entryId: provider.entryId,
        headline: `${provider.model} sees this conversation`,
        // ADR 0151's quiet outcome, said where the choice is rather than in a
        // help page: a person who never adds a credential gets a Pico whose
        // model never sees their memory, and nothing else will tell them.
        detail: 'It does not see what Pico remembers. That needs a way for this '
          + 'machine to prove who it is.'
          + (stateDetail === undefined ? '' : ` ${stateDetail}`),
        action: 'widen' as const,
        actionLabel: 'Add a credential and let it see what Pico remembers',
        forgetActionLabel: 'Forget this machine',
        providerClass: provider.providerClass,
      });
    }
    return Object.freeze({
      entryId: provider.entryId,
      headline: `${provider.model} sees this conversation and what Pico remembers`,
      detail: `You can withdraw this at any time.${
        stateDetail === undefined ? '' : ` ${stateDetail}`
      }`,
      action: 'revoke' as const,
      actionLabel: 'Withdraw',
      forgetActionLabel: 'Forget this machine',
      providerClass: provider.providerClass,
    });
  }));
}

export function parsePicoCompanionModelProviders(
  value: unknown,
): readonly PicoCompanionModelProvider[] {
  if (!Array.isArray(value)) {
    throw new Error('invalid_pico_companion_model_providers');
  }
  return Object.freeze(value.map((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error('invalid_pico_companion_model_provider');
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.entryId !== 'string'
      || typeof record.model !== 'string'
      || typeof record.providerClass !== 'string'
      || typeof record.contextTokens !== 'number'
      || typeof record.measuredAt !== 'string'
      || typeof record.decided !== 'boolean'
      || typeof record.sees !== 'string'
      || typeof record.needsCredentialToSeeMore !== 'boolean') {
      throw new Error('invalid_pico_companion_model_provider');
    }
    // A word this device does not know is dropped rather than believed: it
    // would be rendered as a state, and an unknown state rendered is a
    // sentence nobody wrote.
    const state = (picoCompanionModelProviderStates as readonly string[])
      .includes(record.state as string)
      ? record.state as PicoModelProviderState
      : undefined;
    return Object.freeze({
      entryId: record.entryId,
      model: record.model,
      providerClass: record.providerClass,
      contextTokens: record.contextTokens,
      measuredAt: record.measuredAt,
      decided: record.decided,
      sees: record.sees,
      needsCredentialToSeeMore: record.needsCredentialToSeeMore,
      ...(state === undefined ? {} : { state }),
    });
  }));
}

/**
 * ADR 0116 W1 on the device. A question this person asked, and its state.
 *
 * Four states and never fewer: waiting, answered from something, answered from
 * nothing, and did not answer. The middle two are the pair a single "answered"
 * would collapse - and "I have nothing about that" is the more useful of the
 * two, because it is the one that tells a person to look somewhere else.
 */
export interface PicoCompanionRecall {
  jobId: string;
  question: string;
  askedAt: string;
  settledAt?: string;
  outcome?: string;
  answer?: string;
  foundInMemory?: boolean;
  keptAs?: { memoryItemId: string; privacyDomain: string };
}

export interface PicoCompanionRecallLine {
  jobId: string;
  question: string;
  /** What state this question is in, as a sentence. */
  state: string;
  /** ADR 0116 W5. Present only when there is an answer to keep. */
  keepable?: true;
  /**
   * ADR 0071. Present only when there is a memory to take back.
   *
   * **Never beside `keepable`**, and that is the whole shape: an answer is
   * either kept or not, so a line offers exactly one of the two. Two controls
   * on one line would ask a person to work out which of them applies to the
   * state they are looking at.
   */
  forgettable?: { memoryItemId: string; label: string };
  /**
   * ADR 0117 X5. The answer, and never without its label.
   *
   * A model's words about a person's material are not something Pico knows.
   * The label is produced by the same call that produces the answer, because
   * a labelling step somebody must remember is one somebody will forget - and
   * here forgetting it would let a sentence a model composed read as a fact
   * this Home holds.
   */
  answer?: { label: string; text: string };
}

export function picoCompanionRecallLines(
  recalls: readonly PicoCompanionRecall[],
): readonly PicoCompanionRecallLine[] {
  return Object.freeze(recalls.map((recall) => {
    if (recall.settledAt === undefined) {
      return Object.freeze({
        jobId: recall.jobId,
        question: recall.question,
        // Not "failed" and not "nothing found": nobody has looked yet.
        state: 'Waiting for the provider you decided on.',
      });
    }
    if (recall.outcome !== 'answered') {
      return Object.freeze({
        jobId: recall.jobId,
        question: recall.question,
        // ADR 0118 O4. What still works is part of what happened: this is one
        // question that did not get answered, not a Home that stopped.
        state: 'Your provider did not answer this one. Nothing else is affected, '
          + 'and asking again is free.',
      });
    }
    if (recall.foundInMemory === false) {
      return Object.freeze({
        jobId: recall.jobId,
        question: recall.question,
        // The honest empty answer, and the one worth having: it sends a person
        // to look elsewhere instead of reading a confident sentence about
        // nothing.
        state: 'Nothing in what it read answers that.',
      });
    }
    return Object.freeze({
      jobId: recall.jobId,
      question: recall.question,
      state: recall.keptAs === undefined
        ? 'Answered from what you remember.'
        // Said as what is true now rather than as what happened: the sentence
        // is in their memory, which is the thing the control below undoes.
        : 'Answered from what you remember, and kept.',
      ...(recall.answer === undefined || recall.keptAs !== undefined
        ? {}
        : { keepable: true as const }),
      ...(recall.keptAs === undefined ? {} : {
        forgettable: Object.freeze({
          memoryItemId: recall.keptAs.memoryItemId,
          // Never *delete*: what goes is one sentence out of their memory, and
          // the word for that is the one a person would use about a memory.
          label: 'Forget this',
        }),
      }),
      ...(recall.answer === undefined ? {} : {
        answer: Object.freeze({
          label: 'A model wrote this from your own notes. Pico did not check it.',
          text: recall.answer,
        }),
      }),
    });
  }));
}

export function parsePicoCompanionRecalls(value: unknown): readonly PicoCompanionRecall[] {
  if (!Array.isArray(value)) {
    throw new Error('invalid_pico_companion_recalls');
  }
  return Object.freeze(value.map((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error('invalid_pico_companion_recall');
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.jobId !== 'string'
      || typeof record.question !== 'string'
      || typeof record.askedAt !== 'string') {
      throw new Error('invalid_pico_companion_recall');
    }
    return Object.freeze({
      jobId: record.jobId,
      question: record.question,
      askedAt: record.askedAt,
      ...(typeof record.settledAt === 'string' ? { settledAt: record.settledAt } : {}),
      ...(typeof record.outcome === 'string' ? { outcome: record.outcome } : {}),
      ...(typeof record.answer === 'string' ? { answer: record.answer } : {}),
      ...(typeof record.foundInMemory === 'boolean'
        ? { foundInMemory: record.foundInMemory }
        : {}),
      ...(((): Record<string, unknown> => {
        const kept = record.keptAs as Record<string, unknown> | undefined;
        // Both halves or neither: a memory item without its domain is not
        // something this window can offer to take back.
        return typeof kept?.memoryItemId === 'string' && typeof kept.privacyDomain === 'string'
          ? {
            keptAs: Object.freeze({
              memoryItemId: kept.memoryItemId,
              privacyDomain: kept.privacyDomain,
            }),
          }
          : {};
      })()),
    });
  }));
}

/**
 * ADR 0116 W5 on the device. What a read produced, and nobody has kept.
 *
 * **No values travel to this window.** A list that carried the derived output
 * would be the auto-persist W5 forbids, moved out of a database and into a
 * screen - the answer arrives when the person keeps it, and not before. What
 * a device shows is that something is waiting, from which library, and at
 * which revision.
 */
export interface PicoCompanionAnsweredRead {
  jobId: string;
  supplier: string;
  revision: string;
  answeredAt: string;
}

/**
 * ADR 0152 SE1's rule applied to a second surface: the words are chosen here
 * so something can be held to them.
 *
 * **Nothing here says what was found.** A headline that summarised the answer
 * would be the answer, shown - and the whole point of the keep is that the
 * person decides before the derived output goes anywhere it stays.
 */
export function picoCompanionAnsweredReadLines(
  reads: readonly PicoCompanionAnsweredRead[],
): readonly { jobId: string; headline: string; detail: string }[] {
  return Object.freeze(reads.map((read) => Object.freeze({
    jobId: read.jobId,
    headline: `Pico read something from ${read.supplier}`,
    // The revision is the correction point (ADR 0133): if the answer turns out
    // wrong, this is what says which version of the material it was wrong
    // about.
    detail: `Read at ${read.revision}. Keep it to put it in your memory, `
      + 'or leave it and nothing is stored.',
  })));
}

export function parsePicoCompanionAnsweredReads(
  value: unknown,
): readonly PicoCompanionAnsweredRead[] {
  if (!Array.isArray(value)) {
    throw new Error('invalid_pico_companion_answered_reads');
  }
  return Object.freeze(value.map((entry) => {
    const record = entry as Record<string, unknown> | null;
    if (record === null
      || typeof record.jobId !== 'string'
      || typeof record.supplier !== 'string'
      || typeof record.revision !== 'string'
      || typeof record.answeredAt !== 'string') {
      throw new Error('invalid_pico_companion_answered_read');
    }
    // A value that arrived anyway is dropped rather than rendered: this window
    // has no place for one, and a field nobody declared is a field nobody
    // checked.
    return Object.freeze({
      jobId: record.jobId,
      supplier: record.supplier,
      revision: record.revision,
      answeredAt: record.answeredAt,
    });
  }));
}

/**
 * ADR 0154 - the words for a relay this person operates.
 *
 * **A different hat, and the surface says so.** Everywhere else in this window
 * the person is somebody with a Pico; here they are somebody who runs a
 * machine other people's Picos post through. Blurring the two would be the
 * naming failure ADR 0026 exists to prevent, one screen further in.
 */
export interface PicoCompanionRelay {
  baseUrl: string;
  operator: string;
  claimedAt: string;
  accounts?: readonly {
    accountRef: string;
    status: 'active' | 'revoked';
    mailboxQuota: number;
    maxCapacity: number;
    openMailboxes: number;
  }[];
}

export interface PicoCompanionRelayLine {
  baseUrl: string;
  headline: string;
  detail: string;
  actionLabel: string;
  accounts: readonly {
    accountRef: string;
    headline: string;
    detail: string;
    revokable: boolean;
  }[];
}

/**
 * What arrives over IPC is untrusted until it has a shape, exactly as
 * everything else on this channel is. A relay's hostname comes from the relay,
 * which makes it a stranger's string.
 */
export function parsePicoCompanionRelays(value: unknown): readonly PicoCompanionRelay[] {
  if (!Array.isArray(value)) {
    throw new Error('invalid_pico_companion_relays');
  }
  return Object.freeze(value.map((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error('invalid_pico_companion_relay');
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.baseUrl !== 'string'
      || typeof record.operator !== 'string'
      || typeof record.claimedAt !== 'string') {
      throw new Error('invalid_pico_companion_relay');
    }
    const accounts = Array.isArray(record.accounts)
      ? Object.freeze(record.accounts.map((account) => {
        const row = account as Record<string, unknown>;
        if (typeof row?.accountRef !== 'string'
          || (row.status !== 'active' && row.status !== 'revoked')
          || typeof row.mailboxQuota !== 'number'
          || typeof row.maxCapacity !== 'number'
          || typeof row.openMailboxes !== 'number') {
          throw new Error('invalid_pico_companion_relay_account');
        }
        return Object.freeze({
          accountRef: row.accountRef,
          status: row.status,
          mailboxQuota: row.mailboxQuota,
          maxCapacity: row.maxCapacity,
          openMailboxes: row.openMailboxes,
        });
      }))
      : undefined;
    return Object.freeze({
      baseUrl: record.baseUrl,
      operator: record.operator,
      claimedAt: record.claimedAt,
      // Absent and empty are different: a relay whose accounts could not be
      // read is not a relay with no accounts (ADR 0117 X1's construction).
      ...(accounts === undefined ? {} : { accounts }),
    });
  }));
}

export function picoCompanionRelayLines(
  relays: readonly PicoCompanionRelay[],
): readonly PicoCompanionRelayLine[] {
  return Object.freeze(relays.map((relay) => {
    const accounts = relay.accounts ?? [];
    const active = accounts.filter((account) => account.status === 'active').length;
    return Object.freeze({
      baseUrl: relay.baseUrl,
      headline: `You run the relay at ${relay.operator}`,
      detail: active === 0
        // Not "it is broken". An unprovisioned relay is running correctly and
        // refusing everybody, and those are different sentences.
        ? 'Nobody can post through it yet. Give somebody an access key to let '
          + 'their Pico use it.'
        : `${active === 1 ? 'One device can' : `${active} devices can`} post `
          + 'through it. It never sees what they send.',
      actionLabel: 'Give somebody access',
      accounts: Object.freeze(accounts.map((account) => Object.freeze({
        accountRef: account.accountRef,
        headline: account.status === 'active'
          ? `Access key ${account.accountRef}`
          : `Access key ${account.accountRef}, withdrawn`,
        detail: account.status === 'active'
          ? `${account.openMailboxes} of ${account.mailboxQuota} `
            + `${account.mailboxQuota === 1 ? 'address' : 'addresses'} in use, `
            + `up to ${account.maxCapacity} waiting messages each.`
          // ADR 0154 RO5. The row stays so this sentence can exist: "was
          // withdrawn" and "never existed" are different things to be told.
          : 'This key no longer works. Whoever held it needs a new one.',
        revokable: account.status === 'active',
      }))),
    });
  }));
}

/**
 * ADR 0154 RO5. What withdrawing a key cost, in the words a person reads.
 *
 * Revoking is the one destructive act on this surface, and the mail it drops
 * has no reader left to notice it - the account that could have collected is
 * the account that just stopped existing. So the numbers are said plainly
 * rather than folded into "done".
 */
export function picoCompanionRelayRevocationLine(ended: {
  mailboxesEnded: number;
  packetsDropped: number;
}): string {
  if (ended.mailboxesEnded === 0) {
    return 'That key no longer works. It held no addresses.';
  }
  const addresses = ended.mailboxesEnded === 1
    ? 'one address'
    : `${ended.mailboxesEnded} addresses`;
  if (ended.packetsDropped === 0) {
    return `That key no longer works, and ${addresses} ended with it. `
      + 'Nothing was waiting at them.';
  }
  const waiting = ended.packetsDropped === 1
    ? 'one waiting message was'
    : `${ended.packetsDropped} waiting messages were`;
  return `That key no longer works, and ${addresses} ended with it. `
    + `${waiting[0]!.toUpperCase()}${waiting.slice(1)} discarded - nobody could have `
    + 'collected them once the key stopped.';
}

/**
 * ADR 0154 RO3. The one moment an access key exists outside the relay.
 *
 * Written as its own presentation rather than a line in a list, because it is
 * the only thing in this surface a person has to act on *now* - nothing stores
 * it and no screen can show it again.
 */
export function picoCompanionRelayAccountIssued(credential: string): {
  headline: string;
  detail: string;
  credential: string;
} {
  return Object.freeze({
    headline: 'Give this key to the person whose Pico will use the relay',
    detail: 'It is shown once. Nothing keeps a copy - not this device and not '
      + 'the relay - so if it is lost, withdraw the key and make another.',
    credential,
  });
}

/**
 * ADR 0126 P2/P6 - the person's own devices, in words.
 *
 * **This is where a machine fact becomes a sentence.** The registry holds
 * `camera`, which is exactly right for a planner and useless to a person
 * deciding whether to allow it. What a person needs to know is what would
 * happen: *this device can read a Recovery Card with its camera*. The
 * translation lives here, in one place a test can hold, rather than in a
 * renderer where each label would be somebody's improvisation.
 */
export interface PicoCompanionDevice {
  presenceId: string;
  presenceType: string;
  affordances: readonly string[];
  withheld: readonly string[];
  enabled: boolean;
  connected: boolean;
  lastSeenAt: string;
}

export interface PicoCompanionDeviceLine {
  presenceId: string;
  headline: string;
  detail: string;
  offers: readonly {
    affordance: string;
    headline: string;
    /** What pressing the control does next, in the words of the consequence. */
    actionLabel: string;
    withheld: boolean;
  }[];
  /** The whole-device switch, which is a different statement from all of them. */
  deviceActionLabel: string;
  forgetLabel: string;
}

/**
 * What a device would do with each thing it declared.
 *
 * A closed map beside a closed vocabulary, which is the drift risk this tree
 * names out loud - so `contract.test.ts` asserts every affordance in
 * `@pico/protocol` has a sentence here, and an unknown key cannot be typed.
 */
const picoCompanionAffordanceSentences: Readonly<Record<string, string>> = Object.freeze({
  display: 'show you things in a window',
  notification: 'get your attention when you are not looking',
  secure_input: 'take a passphrase without the page ever seeing it',
  camera: 'read a Recovery Card with its camera',
  microphone: 'listen with its microphone',
  printer: 'print a Recovery Card',
  location: 'tell where it is',
  composite_tier: 'draw Pico in full rather than as a still picture',
});

export function picoCompanionDeviceLines(
  devices: readonly PicoCompanionDevice[],
): readonly PicoCompanionDeviceLine[] {
  return Object.freeze(devices.map((device) => Object.freeze({
    presenceId: device.presenceId,
    headline: picoCompanionDeviceName(device.presenceType),
    detail: picoCompanionDeviceDetail(device),
    offers: Object.freeze(device.affordances.map((affordance) => {
      const withheld = device.withheld.includes(affordance);
      const sentence = picoCompanionAffordanceSentences[affordance] ?? affordance;
      return Object.freeze({
        affordance,
        headline: withheld
          // The fact stays true and the sentence says so. ADR 0126 keeps the
          // affordance and the switch apart precisely so this can be said.
          ? `It can ${sentence}, and you have told Pico not to`
          : `It can ${sentence}`,
        actionLabel: withheld ? 'Allow this again' : 'Do not use this',
        withheld,
      });
    })),
    deviceActionLabel: device.enabled ? 'Do not use this device' : 'Use this device again',
    // Said as what it costs. The device is not touched; what goes is the row
    // and every answer the person gave about it.
    forgetLabel: 'Forget this device and everything you decided about it',
  })));
}

/**
 * ADR 0126. The label a person recognises their own device by.
 *
 * The one place a presence type is read, and it produces **a word and never a
 * decision** - `presence:check` allows this file for that reason and refuses
 * every other read. A person choosing between two rows needs to know which
 * machine each one is; nothing here plans anything.
 */
function picoCompanionDeviceName(presenceType: string): string {
  switch (presenceType) {
    case 'desktop_companion':
      return 'A computer';
    case 'mobile_companion':
      return 'A phone';
    case 'surface':
      return 'A surface';
    case 'embodiment':
      return 'Something with sensors';
    default:
      // A type this window does not know is still one of the person's devices.
      // Hiding it would hide a device from its owner.
      return 'A device';
  }
}

function picoCompanionDeviceDetail(device: PicoCompanionDevice): string {
  if (!device.enabled) {
    return 'You have switched this device off. Pico uses nothing on it, whatever it '
      + 'says it can do.';
  }
  if (device.connected) {
    return 'Here now.';
  }
  /**
   * ADR 0152 SE5. Quiet and gone are different absences and get different
   * sentences: one ends by itself and the other needs somebody. A device that
   * is asleep is not a device that is lost, and the list keeps it either way.
   */
  return `Not answering right now. It was last here on ${device.lastSeenAt.slice(0, 10)}.`;
}

export function parsePicoCompanionDevices(value: unknown): readonly PicoCompanionDevice[] {
  if (!Array.isArray(value)) {
    throw new Error('invalid_pico_companion_devices');
  }
  return Object.freeze(value.map((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error('invalid_pico_companion_device');
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.presenceId !== 'string'
      || typeof record.presenceType !== 'string'
      || typeof record.lastSeenAt !== 'string'
      || typeof record.enabled !== 'boolean'
      || typeof record.connected !== 'boolean'
      || !Array.isArray(record.affordances)
      || !Array.isArray(record.withheld)) {
      throw new Error('invalid_pico_companion_device');
    }
    return Object.freeze({
      presenceId: record.presenceId,
      presenceType: record.presenceType,
      affordances: Object.freeze(record.affordances.map(String)),
      withheld: Object.freeze(record.withheld.map(String)),
      enabled: record.enabled,
      connected: record.connected,
      lastSeenAt: record.lastSeenAt,
    });
  }));
}

/**
 * ADR 0130 E3 - which devices your Home answers to, in the words of what that
 * means.
 *
 * A delegation carries a delegation id, two key fingerprints, a lifecycle
 * order and an expiry. None of that is a sentence, and every one of those
 * fields is a thing a person cannot check. What they can decide is whether a
 * machine should still be able to act as them, so the row says that and shows
 * the identifier only as the label the control needs.
 *
 * The rows join ADR 0126's presences on `presenceId`, which both sides derive
 * from the same device signing key - one device with two facts rather than
 * two lists to reconcile.
 */
export interface PicoCompanionDeviceAuthority {
  delegationId: string;
  presenceId: string;
  deviceSigningKeyFingerprintHex: string;
  status: 'active' | 'not_yet_valid' | 'expired' | 'revoked';
  validUntil: string;
  isThisDevice: boolean;
}

export interface PicoCompanionDeviceAuthorityView {
  devices: readonly PicoCompanionDeviceAuthority[];
  mayEndAuthority: boolean;
}

export interface PicoCompanionDeviceAuthorityLine {
  delegationId: string;
  presenceId: string;
  /** What this device may do for the person, now. */
  headline: string;
  detail: string;
  /**
   * ADR 0104's year, said while something can still be done about it.
   *
   * Renewal needs the delegation to be active - the ceremony wants it and so
   * does the Link request that carries it - so a device that lets its
   * authority lapse cannot renew itself at all. The warning is the difference
   * between a minute and a ceremony, which is why it is a sentence of its own
   * and not a colour.
   */
  expiryWarning: string | null;
  /** Absent where renewal cannot be done from here. */
  renewLabel: string | null;
  /**
   * ADR 0130 E3. The other renewal: this device is not the one holding the
   * identity key, so it asks the device that added it - the same three codes
   * the enrolment used, in the same order.
   */
  renewFromOtherDeviceLabel: string | null;
  /** Absent when this row cannot be ended from here. */
  endLabel: string | null;
  /**
   * What ending it costs, when that is more than the row itself. Never a
   * generic caution: the two cases it fires on are the two that lock somebody
   * out, and a warning on every row would train the eye past both.
   */
  endWarning: string | null;
}

/**
 * ADR 0114's categories, as the three a person picks between.
 *
 * `key_rotated` and `membership_removed` are the machinery's: renewal writes
 * the first as part of its own transition, and the second is a membership
 * decision (ADR 0130 E4). They are named in `device-lifecycle.ts` rather than
 * filtered silently, and `contract.test.ts` fails if the protocol grows a
 * sixth category that neither list claims.
 */
export interface PicoCompanionDeviceRevocationReasonLine {
  reason: 'lost_device' | 'suspected_compromise' | 'device_retired';
  label: string;
}

export function picoCompanionDeviceRevocationReasonLines(
): readonly PicoCompanionDeviceRevocationReasonLine[] {
  return Object.freeze([
    Object.freeze({
      reason: 'lost_device' as const,
      label: 'I lost it, or somebody took it',
    }),
    Object.freeze({
      reason: 'suspected_compromise' as const,
      label: 'Somebody may have got into it',
    }),
    Object.freeze({
      reason: 'device_retired' as const,
      label: 'I do not use it any more',
    }),
  ]);
}

/**
 * The sentence the whole section leads with, or the one that says why it
 * offers nothing.
 *
 * A device that holds no identity key cannot sign a revocation, and ADR 0115
 * U4 makes that ordinary rather than exceptional - only the device that
 * founded the Home holds that key. Saying it once, at the top, is what keeps
 * every row below from carrying a disabled control with no explanation.
 */
export function picoCompanionDeviceAuthoritySummary(
  view: PicoCompanionDeviceAuthorityView,
): string {
  const active = view.devices.filter((device) => device.status === 'active').length;
  const counted = active === 1
    ? 'Your Home answers to one device.'
    : `Your Home answers to ${active} devices.`;
  if (view.mayEndAuthority) {
    return counted;
  }
  return `${counted} Ending one is signed with your identity key, and this device `
    + 'does not hold it. The device you founded your Home with does.';
}

export function picoCompanionDeviceAuthorityLines(
  view: PicoCompanionDeviceAuthorityView,
  now: Date = new Date(),
): readonly PicoCompanionDeviceAuthorityLine[] {
  const active = view.devices.filter((device) => device.status === 'active');
  return Object.freeze(view.devices.map((device) => {
    const endable = view.mayEndAuthority && device.status === 'active';
    return Object.freeze({
      delegationId: device.delegationId,
      presenceId: device.presenceId,
      headline: device.isThisDevice
        ? 'This device'
        : 'Another of your devices',
      detail: picoCompanionDeviceAuthorityDetail(device),
      expiryWarning: picoCompanionDeviceAuthorityExpiry(device, now),
      renewLabel: endable && device.isThisDevice
        ? 'Keep it working for another year'
        : null,
      renewFromOtherDeviceLabel: !view.mayEndAuthority
        && device.isThisDevice
        && device.status === 'active'
        ? 'Keep this device working, with your other one'
        : null,
      endLabel: endable ? "End this device's authority" : null,
      endWarning: !endable
        ? null
        : active.length === 1
          // The one a person cannot undo from here. It is said as what is
          // left rather than as a prohibition: it is their identity.
          ? 'This is the only device your Home still answers to. Ending it leaves '
            + 'your Recovery Card as the only way back in.'
          : device.isThisDevice
            ? 'This is the device you are using. Ending it here signs you out of '
              + 'your own Home on this machine.'
            : null,
    });
  }));
}

/** ADR 0104's year, counted in days a person still has. */
export const picoCompanionDeviceAuthorityWarningDays = 30;

function picoCompanionDeviceAuthorityExpiry(
  device: PicoCompanionDeviceAuthority,
  now: Date,
): string | null {
  if (device.status !== 'active') {
    return null;
  }
  const days = Math.floor(
    (Date.parse(device.validUntil) - now.getTime()) / (24 * 60 * 60 * 1_000),
  );
  if (days > picoCompanionDeviceAuthorityWarningDays) {
    return null;
  }
  const when = days <= 0
    ? 'today'
    : days === 1
      ? 'tomorrow'
      : `in ${days} days`;
  return device.isThisDevice
    ? `That is ${when}. Renew it before then - a device whose authority has run out `
      + 'cannot renew itself, and would have to be set up again from your Recovery Card.'
    // Said rather than left as a control that is not there. The ceremony
    // needs the other device's own key, and holding two screens up to each
    // other for a renewal is not built yet.
    // Both devices have to be in the same room for this, and that is the whole
    // instruction: the other one signs with its own key, which is what makes
    // it that device's authority rather than a claim about it.
    : `That is ${when}. Renewing it means holding the two screens up to each `
      + 'other again, the way it was added.';
}

function picoCompanionDeviceAuthorityDetail(device: PicoCompanionDeviceAuthority): string {
  switch (device.status) {
    case 'active':
      // The date is the fact a person acts on: an authority nobody renews
      // stops working on a day, and that day is worth seeing before it.
      return `It can act as you until ${device.validUntil.slice(0, 10)}.`;
    case 'not_yet_valid':
      return 'It cannot act as you yet. Its authority starts later.';
    case 'expired':
      return `It can no longer act as you. Its authority ran out on `
        + `${device.validUntil.slice(0, 10)}.`;
    case 'revoked':
    default:
      return 'It can no longer act as you. You ended its authority.';
  }
}

/**
 * The read that did not come back, said as itself.
 *
 * ADR 0118 O4 in the direction it is usually forgotten: an absence must not
 * render as a fact. A failed authority read leaves the offers on screen and
 * says which question went unanswered, rather than leaving rows that quietly
 * look like devices with nothing to their name.
 */
export const picoCompanionDeviceAuthorityUnavailable =
  'Pico could not ask your Home which of these devices it still answers to. What each '
  + 'device offers is here; what it may do as you is not.';

/**
 * What ending an authority did, in what is left of it.
 *
 * Counted from the Home's answer after the fact rather than from the request,
 * and said in devices rather than in records: nothing else can observe this,
 * and the number that matters is how many ways back in remain.
 */
export function picoCompanionDeviceAuthorityEndedLine(ended: {
  endedThisDevice: boolean;
  activeDevicesLeft: number | null;
}): string {
  if (ended.activeDevicesLeft === null) {
    // ADR 0118 O4. The count is missing, and the sentence says why rather
    // than reaching for a zero - which on this row would be the scariest
    // possible way to be wrong.
    return ended.endedThisDevice
      ? 'Ended, and it was this one. This machine can no longer act as you, which is '
        + 'also why it can no longer ask your Home what is left.'
      : 'Ended. Pico could not ask your Home afterwards what is left.';
  }
  const left = ended.activeDevicesLeft === 0
    ? 'Your Home now answers to no device, so your Recovery Card is the way back in.'
    : ended.activeDevicesLeft === 1
      ? 'Your Home answers to one device now.'
      : `Your Home answers to ${ended.activeDevicesLeft} devices now.`;
  return ended.endedThisDevice
    ? `Ended, and it was this one - this machine can no longer act as you. ${left}`
    : `Ended. ${left}`;
}

export function picoCompanionDeviceAuthorityRenewedLine(renewed: {
  validUntil: string;
}): string {
  return `Renewed. This device can act as you until ${renewed.validUntil.slice(0, 10)}, and `
    + 'the authority it had before is retired.';
}

export function parsePicoCompanionDeviceAuthority(
  value: unknown,
): PicoCompanionDeviceAuthorityView {
  if (typeof value !== 'object' || value === null) {
    throw new Error('invalid_pico_companion_device_authority');
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.devices) || typeof record.mayEndAuthority !== 'boolean') {
    throw new Error('invalid_pico_companion_device_authority');
  }
  return Object.freeze({
    mayEndAuthority: record.mayEndAuthority,
    devices: Object.freeze(record.devices.map((entry) => {
      if (typeof entry !== 'object' || entry === null) {
        throw new Error('invalid_pico_companion_device_authority_row');
      }
      const device = entry as Record<string, unknown>;
      if (typeof device.delegationId !== 'string'
        || typeof device.presenceId !== 'string'
        || typeof device.deviceSigningKeyFingerprintHex !== 'string'
        || typeof device.validUntil !== 'string'
        || typeof device.isThisDevice !== 'boolean'
        || (device.status !== 'active'
          && device.status !== 'not_yet_valid'
          && device.status !== 'expired'
          && device.status !== 'revoked')) {
        throw new Error('invalid_pico_companion_device_authority_row');
      }
      return Object.freeze({
        delegationId: device.delegationId,
        presenceId: device.presenceId,
        deviceSigningKeyFingerprintHex: device.deviceSigningKeyFingerprintHex,
        status: device.status,
        validUntil: device.validUntil,
        isThisDevice: device.isThisDevice,
      });
    })),
  });
}

/**
 * ADR 0130 E4 - the Home itself: which keys it is known by, and who else
 * lives in it.
 *
 * Two things a person decides about a place rather than about a device, and
 * both were reachable only through sixteen flags each. The words here are
 * about the place: "your Home" is what the person has, and the host key is a
 * fact about it they only ever meet through a consequence.
 */
export interface PicoCompanionHostRotationReasonLine {
  reason: 'host_key_rotated' | 'host_migrated' | 'host_restored';
  label: string;
}

export function picoCompanionHostRotationReasonLines(
): readonly PicoCompanionHostRotationReasonLine[] {
  return Object.freeze([
    Object.freeze({
      reason: 'host_key_rotated' as const,
      label: 'I want it to have new keys',
    }),
    Object.freeze({
      reason: 'host_migrated' as const,
      label: 'It moved to another machine',
    }),
    Object.freeze({
      reason: 'host_restored' as const,
      label: 'It was restored from a backup',
    }),
  ]);
}

/**
 * What changing a Home's keys costs, said before it happens.
 *
 * The Recovery Card is the one that matters: a card printed under the old
 * keys cannot put an identity back, because the pins it carries name a Home
 * that no longer answers under them. ADR 0106's approval statement says the
 * same thing from the signed bytes; this is the sentence that gets somebody
 * to the decision in the first place.
 */
export const picoCompanionHostRotationWarning =
  'Every Recovery Card you have printed stops working. Print a new one right '
  + 'after this - without one, nothing can put your identity on another device.';

/**
 * The new key arrives already shortened, because this file is renderer-
 * reachable and the one rule for shortening a fingerprint lives in the
 * shell-free core, where a second client inherits it (ADR 0131 A5). Slicing
 * it here was how this window came to spell a key twelve characters long
 * while the notification about the same rotation spelled it head-and-tail.
 */
export function picoCompanionHostRotationLine(rotated: {
  hostSigningKeyDisplay: string;
  retiredHostSigningKeyFingerprintHex: string;
  repinned: boolean;
}): { title: string; body: string } {
  return {
    title: 'Your Home has new keys',
    body: rotated.repinned
      ? `It answers as ${rotated.hostSigningKeyDisplay} now, and this `
        + `device followed it there. ${picoCompanionHostRotationWarning}`
      // The rotation happened either way - the Home decided that - and what
      // is missing is this device's proof of it, which is a different thing
      // to do next than a failed rotation.
      : 'Your Home rotated, and this device could not follow the chain from where '
        + 'it stands. Nothing here changed. Check that you are on the same '
        + `network and open this again. ${picoCompanionHostRotationWarning}`,
  };
}

export interface PicoCompanionHomeMember {
  membershipId: string;
  /** `null` on the founder's row, which comes from the founding record. */
  credentialId: string | null;
  /**
   * The full fingerprint, and it is here as a *name*, not as something to
   * read: ending a membership names its subject, and the window has to be
   * able to say which row it means. What a person reads is
   * `picoIdentityDisplay` beside it - shortened once, in the main process,
   * by the one rule this client has (ADR 0113 C2: the window receives
   * rendered state, and a truncation is a rendering).
   */
  picoIdentityFingerprintHex: string;
  picoIdentityDisplay: string;
  role: string;
  status: string;
  validUntil: string | null;
  isThisIdentity: boolean;
}

export interface PicoCompanionHomeMemberLine {
  membershipId: string;
  /** What a statement that ends this row has to name; `null` if none can. */
  credentialId: string | null;
  headline: string;
  detail: string;
  /**
   * Absent on the two rows nothing can end: the founder's own place, which is
   * the founding record, and a membership that has already ended.
   */
  endLabel: string | null;
}

/**
 * The two ways a membership ends, and they are not the same act.
 *
 * Removing somebody is a decision about who lives here. A security review is
 * a decision about a key that may be in the wrong hands, and the Home records
 * which one it was - a person reading the list later can tell "they moved
 * out" from "we had a problem".
 */
export interface PicoCompanionMembershipEndingLine {
  ending: 'removed' | 'security';
  label: string;
}

export function picoCompanionMembershipEndingLines(
): readonly PicoCompanionMembershipEndingLine[] {
  return Object.freeze([
    Object.freeze({
      ending: 'removed' as const,
      label: 'They should not live here any more',
    }),
    Object.freeze({
      ending: 'security' as const,
      label: 'Something is wrong with their Pico',
    }),
  ]);
}

export function picoCompanionMembershipEndedLine(ended: {
  status: string;
}): string {
  return ended.status === 'evicted'
    ? 'Ended as a security matter. That Pico cannot use this Home any more, and the '
      + 'Home keeps the record of why.'
    : 'Ended. That Pico cannot use this Home any more. Nothing was sent to them - '
      + 'they will find out when they next try.';
}

/**
 * One row per Pico that may live here, in what that means rather than in
 * credential fields.
 *
 * A fingerprint is the only name any of them has - a membership carries no
 * person, by design - so it is shown short, as the label somebody compares
 * against what the other person reads out.
 */
export function picoCompanionHomeMemberLines(
  members: readonly PicoCompanionHomeMember[],
): readonly PicoCompanionHomeMemberLine[] {
  return Object.freeze(members.map((member) => Object.freeze({
    membershipId: member.membershipId,
    credentialId: member.credentialId,
    headline: member.isThisIdentity
      ? 'You'
      : `Another Pico (${member.picoIdentityDisplay})`,
    detail: picoCompanionHomeMemberDetail(member),
    endLabel: member.credentialId !== null
      && member.status === 'active'
      && !member.isThisIdentity
      ? 'They should not live here'
      : null,
  })));
}

function picoCompanionHomeMemberDetail(member: PicoCompanionHomeMember): string {
  if (member.status !== 'active') {
    // Said as what is true now. The vocabulary has six statuses and five of
    // them mean the same thing to somebody looking at a list: not any more.
    return `No longer lives here (${member.status}).`;
  }
  if (member.validUntil === null) {
    return member.isThisIdentity
      ? 'This is your Home. Your place in it does not end.'
      : 'Lives here, with no end date.';
  }
  return `Lives here until ${member.validUntil.slice(0, 10)}.`;
}

export function picoCompanionHomeMembersSummary(
  members: readonly PicoCompanionHomeMember[],
): string {
  const others = members.filter(
    (member) => member.status === 'active' && !member.isThisIdentity,
  ).length;
  if (others === 0) {
    return 'Yours alone. No other Pico may use this Home.';
  }
  return others === 1
    ? 'One other Pico may use this Home.'
    : `${others} other Picos may use this Home.`;
}

/**
 * What a person is told after admitting somebody, and it is deliberately
 * about what the other side still has to do.
 *
 * A membership is given rather than claimed: the subject signs nothing and
 * learns nothing from this. Somebody who was not told that would wait for a
 * confirmation that is never coming.
 */
export function picoCompanionHomeMemberAdmittedLine(member: {
  picoIdentityDisplay: string;
  validUntil: string;
}): string {
  return `Admitted ${member.picoIdentityDisplay} until `
    + `${member.validUntil.slice(0, 10)}. Nothing was sent to them - a membership is `
    + 'given, not accepted, so tell them yourself that they can point their Pico here.';
}

export function parsePicoCompanionHomeMembers(
  value: unknown,
): readonly PicoCompanionHomeMember[] {
  if (!Array.isArray(value)) {
    throw new Error('invalid_pico_companion_home_members');
  }
  return Object.freeze(value.map((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error('invalid_pico_companion_home_member');
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.membershipId !== 'string'
      || (record.credentialId !== null && typeof record.credentialId !== 'string')
      || typeof record.picoIdentityFingerprintHex !== 'string'
      || typeof record.picoIdentityDisplay !== 'string'
      || typeof record.role !== 'string'
      || typeof record.status !== 'string'
      || typeof record.isThisIdentity !== 'boolean'
      || (record.validUntil !== null && typeof record.validUntil !== 'string')) {
      throw new Error('invalid_pico_companion_home_member');
    }
    return Object.freeze({
      membershipId: record.membershipId,
      credentialId: record.credentialId as string | null,
      picoIdentityFingerprintHex: record.picoIdentityFingerprintHex,
      picoIdentityDisplay: record.picoIdentityDisplay,
      role: record.role,
      status: record.status,
      validUntil: record.validUntil as string | null,
      isThisIdentity: record.isThisIdentity,
    });
  }));
}

/**
 * ADR 0113 with ADR 0152 SE1 - what the window is showing, and why it has to
 * be a question at all.
 *
 * **ADR 0113 says a window exists only during an interaction or an active
 * alarm.** It is an occasion, not a workplace. By 2026-08-17 it had eight
 * sections, six reads on open and no navigation, in the order they happened to
 * be built - so somebody opening it because Pico needed an answer scrolled
 * past relay administration to give one.
 *
 * Two views, and the split is the ADR's own: what needs you now, and what you
 * keep. The window never opens into the second. Settings are somewhere a
 * person goes; an occasion is something that came to them.
 */
/**
 * ADR 0142 PE2 with ADR 0152 - a measurement, said as work rather than a number.
 *
 * **What a person needs while it runs is that it is running and roughly how
 * long that is.** Measuring generates long answers at several context widths,
 * unloads the model to time a load, and runs two jobs at once - minutes on a
 * real card - and a surface that showed a spinner with no explanation would
 * make a person think their Home had hung.
 *
 * The measured numbers are deliberately not here. They are the entry's, ADR
 * 0152 SE1 says the entry states its consequence in words before any figure,
 * and a second rendering of a throughput on this line would be a second place
 * for it to drift.
 */
export interface PicoCompanionMeasurementLine {
  entryId: string;
  headline: string;
  detail: string;
}

export function picoCompanionMeasurementLines(
  measurements: ReadonlyArray<{
    entryId: string;
    reach: string;
    model: string;
    state: string;
    refusal?: string;
    notes?: readonly string[];
  }>,
): readonly PicoCompanionMeasurementLine[] {
  return Object.freeze(measurements.map((entry) => {
    if (entry.state === 'running') {
      return Object.freeze({
        entryId: entry.entryId,
        headline: `Measuring ${entry.model} at ${entry.reach}.`,
        detail: 'Pico is timing this machine: how fast it answers, how wide a '
          + 'question it holds, and how long it takes to wake up. That takes '
          + 'several minutes and you do not have to wait here.',
      });
    }
    if (entry.state === 'failed') {
      return Object.freeze({
        entryId: entry.entryId,
        headline: `${entry.model} at ${entry.reach} was not measured.`,
        // The measurement's own words. ADR 0118 O4: a host that could not be
        // measured is a fact about the host, and flattening every cause into
        // "failed" would tell somebody nothing they can act on.
        detail: entry.refusal ?? 'The measurement did not finish.',
      });
    }
    return Object.freeze({
      entryId: entry.entryId,
      headline: `${entry.model} at ${entry.reach} was measured.`,
      // What the measurement wanted said, then what is left to do. Notes carry
      // things only a measurement can know - ADR 0151 PV5's "this host checks
      // no credential" among them - and they are the reason this is not just a
      // green tick.
      detail: [
        ...(entry.notes ?? []),
        'It is in the list below, and nothing uses it until you decide.',
      ].join(' '),
    });
  }));
}

export function parsePicoCompanionMeasurements(value: unknown): ReadonlyArray<{
  entryId: string;
  reach: string;
  model: string;
  state: string;
  refusal?: string;
  notes?: readonly string[];
}> {
  if (!Array.isArray(value)) {
    throw new Error('invalid_pico_companion_measurements');
  }
  return Object.freeze(value.map((entry) => {
    const record = entry as Record<string, unknown> | null;
    if (typeof record?.entryId !== 'string'
      || typeof record.reach !== 'string'
      || typeof record.model !== 'string'
      || typeof record.state !== 'string') {
      throw new Error('invalid_pico_companion_measurement');
    }
    return Object.freeze({
      entryId: record.entryId,
      reach: record.reach,
      model: record.model,
      state: record.state,
      ...(typeof record.refusal === 'string' ? { refusal: record.refusal } : {}),
      ...(Array.isArray(record.notes)
        ? { notes: Object.freeze(record.notes.map(String)) }
        : {}),
    });
  }));
}

/**
 * ADR 0048 with ADR 0152 - the sentence a person has to agree with before Pico
 * measures a machine they named.
 *
 * Pico cannot tell from an address whether a machine stands in somebody's home,
 * and the five other provider classes all describe runtimes Pico mediates. So a
 * typed address is `declared_own_host` or it is nothing, and the declaration is
 * a precondition rather than a field with options. Refusing in words beats a
 * disabled button, which invites somebody to wonder what it would have done.
 */
export const picoCompanionOwnMachineDeclaration =
  'This machine is mine, and I am responsible for what it does with what I send it.';

export const picoCompanionOwnMachineUndeclared =
  'Pico only measures a machine you say is yours. There is no other kind it '
  + 'knows how to describe: every other sort of provider is one Pico runs '
  + 'itself, not one you reach by address.';

export const picoCompanionWindowViews = ['now', 'settings'] as const;

export type PicoCompanionWindowView = typeof picoCompanionWindowViews[number];

/**
 * What each view has to ask the Home for.
 *
 * The reason the split is worth building rather than just drawing: the window
 * asked for all of it on every open, including the four lists a person looking
 * at an approval will never read. A view that shows nothing asks nothing.
 */
export const picoCompanionViewReads: Readonly<
  Record<PicoCompanionWindowView, readonly string[]>
> = Object.freeze({
  // ADR 0141 RN4's questions are here rather than in settings: they expire in
  // minutes and they are why somebody is being interrupted.
  now: Object.freeze(['getRecalls', 'getAnsweredReads', 'getPendingActions']),
  settings: Object.freeze([
    'getModelProviders', 'getSuppliers', 'getDepots', 'getDevices', 'getRelays',
    // ADR 0139 AC4's agreement is a thing somebody came to change.
    'getModuleConsent',
  ]),
});

/**
 * ADR 0112/ADR 0113. Whether this presentation takes the window back.
 *
 * A person may be halfway through changing a setting when their Vault asks
 * them to approve something. The approval is the reason this window exists at
 * all, so it wins - and the rule is a property of the presentation rather than
 * a judgement in the renderer, so it cannot differ between two places that
 * both react to one.
 *
 * **Only a decision takes the window back, not merely a bad mood.** A warning
 * about storage or a clock is worth showing and is not worth interrupting
 * somebody for; something waiting for their answer is.
 */
export function picoCompanionPresentationTakesTheWindow(
  presentation: Pick<PicoCompanionPresentation, 'decision' | 'severity'>,
): boolean {
  return presentation.decision !== 'none' || presentation.severity === 'blocked';
}

export interface PicoCompanionWindowViewLine {
  view: PicoCompanionWindowView;
  label: string;
  /** What a person will find there, so the word is not the only clue. */
  detail: string;
}

export function picoCompanionWindowViewLines(): readonly PicoCompanionWindowViewLine[] {
  return Object.freeze([
    Object.freeze({
      view: 'now' as const,
      label: 'Now',
      detail: 'What Pico needs from you, and what you asked it.',
    }),
    Object.freeze({
      view: 'settings' as const,
      label: 'Settings',
      detail: 'What computes for you, your devices, and anything you run.',
    }),
  ]);
}

/**
 * ADR 0138 CO3/CO4 - what an attached supplier may do, in words about money
 * and about who learns you asked.
 *
 * **The ADR's own sentence is the one this surface has to carry**, because it
 * is the reason the two switches are two: *an answered question that cost
 * money is visible to the person who asked, and a background sweep is visible
 * to nobody.* A single "allow this supplier" control would hide exactly that
 * difference behind the word allow.
 */
export interface PicoCompanionSupplier {
  identifier: string;
  kind: string;
  mayReachOutside: boolean;
  mayReachUnasked: boolean;
}

export interface PicoCompanionSupplierLine {
  identifier: string;
  headline: string;
  detail: string;
  reachActionLabel: string;
  /**
   * Absent while reaching is off - not a disabled control, because CO4 cannot
   * be granted without CO3 and a greyed-out switch invites somebody to wonder
   * what it would have done.
   */
  unaskedActionLabel?: string;
  unaskedDetail?: string;
  /**
   * **Everything a person added, taken back.**
   *
   * Last on the line and never a switch: the two above are settings that go
   * on being decided, while this ends the thing they are about. The word is
   * `Remove` rather than `Delete` because what goes is the attachment, and
   * what Pico derived under it stays where it is (ADR 0136 with ADR 0129 SR6).
   */
  removeActionLabel: string;
}

export function picoCompanionSupplierLines(
  suppliers: readonly PicoCompanionSupplier[],
): readonly PicoCompanionSupplierLine[] {
  const removeActionLabel = 'Remove';
  return Object.freeze(suppliers.map((supplier) => {
    if (!supplier.mayReachOutside) {
      return Object.freeze({
        identifier: supplier.identifier,
        headline: `${supplier.identifier} is attached and reaches nothing`,
        // Not "it is off". Attached says this material may be here; it does
        // not say Pico may go and get it.
        detail: 'Pico does not go out for this. Nothing it holds costs you '
          + 'anything, and nobody learns you asked.',
        reachActionLabel: 'Let Pico fetch this when you ask',
        removeActionLabel,
      });
    }
    return Object.freeze({
      identifier: supplier.identifier,
      headline: supplier.mayReachUnasked
        ? `${supplier.identifier} may fetch, and may do so on its own`
        : `${supplier.identifier} may fetch when you ask`,
      detail: 'Going out may cost money, and whoever answers learns that '
        + 'somebody asked.',
      reachActionLabel: 'Stop fetching this',
      unaskedActionLabel: supplier.mayReachUnasked
        ? 'Only when I ask'
        : 'Let it fetch without being asked',
      // ADR 0138 CO4's reason for being a second decision rather than a wider
      // first one, said where the person decides it.
      unaskedDetail: supplier.mayReachUnasked
        ? 'It fetches in the background. You will not see those trips, which is '
          + 'what makes this a separate answer from the one above.'
        : 'A question you asked and that cost something is visible to you. A '
          + 'trip nobody asked for is visible to nobody.',
      removeActionLabel,
    });
  }));
}

/**
 * ADR 0143 DP3 - a supplier a depot brought, waiting for one answer.
 *
 * **The question is where its material belongs, and that is the whole line.**
 * A depot declares what a supplier is and what it fills; the one thing it may
 * not declare is the space its material lands in, because that decides who can
 * later read it and what a deletion reaches. So the line asks exactly that and
 * nothing else, and it says which depot it came from - a person agreeing to a
 * space for somebody else's code is owed the name of whose code it is.
 */
export interface PicoCompanionDeclaredSupplierLine {
  identifier: string;
  headline: string;
  detail: string;
  domainLabel: string;
  actionLabel: string;
}

export function picoCompanionDeclaredSupplierLines(
  declared: ReadonlyArray<{
    identifier: string;
    kind: string;
    remote: string;
    needs: readonly string[];
  }>,
): readonly PicoCompanionDeclaredSupplierLine[] {
  return Object.freeze(declared.map((entry) => Object.freeze({
    identifier: entry.identifier,
    headline: `${entry.identifier} came with ${entry.remote}.`,
    detail: entry.kind === 'library'
      // Said as what it will do with the space, not as what it is. "Library"
      // is Pico's word for a shape; the person is deciding about their memory.
      ? 'It reads material and puts what it finds into your memory. '
        + 'Name the part of your memory that should hold it.'
      : `It fills a ${entry.kind} slot. Name the part of your memory it belongs to.`,
    domainLabel: 'Where its material belongs',
    // Never *enable* or *allow*: attaching says where something goes, and ADR
    // 0138 CO3 keeps whether Pico may go out for it a separate answer.
    actionLabel: entry.needs.includes('privacyDomain')
      ? 'Put it here'
      : 'Attach',
  })));
}

export function parsePicoCompanionDeclaredSuppliers(value: unknown): ReadonlyArray<{
  identifier: string;
  kind: string;
  remote: string;
  needs: readonly string[];
}> {
  if (!Array.isArray(value)) {
    throw new Error('invalid_pico_companion_declared_suppliers');
  }
  return Object.freeze(value.map((entry) => {
    const record = entry as Record<string, unknown> | null;
    if (typeof record?.identifier !== 'string'
      || typeof record.kind !== 'string'
      || typeof record.remote !== 'string'
      || !Array.isArray(record.needs)) {
      throw new Error('invalid_pico_companion_declared_supplier');
    }
    return Object.freeze({
      identifier: record.identifier,
      kind: record.kind,
      remote: record.remote,
      needs: Object.freeze(record.needs.map(String)),
    });
  }));
}

export function parsePicoCompanionSuppliers(value: unknown): readonly PicoCompanionSupplier[] {
  if (!Array.isArray(value)) {
    throw new Error('invalid_pico_companion_suppliers');
  }
  return Object.freeze(value.map((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error('invalid_pico_companion_supplier');
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.identifier !== 'string'
      || typeof record.kind !== 'string'
      || typeof record.mayReachOutside !== 'boolean'
      || typeof record.mayReachUnasked !== 'boolean') {
      throw new Error('invalid_pico_companion_supplier');
    }
    return Object.freeze({
      identifier: record.identifier,
      kind: record.kind,
      mayReachOutside: record.mayReachOutside,
      mayReachUnasked: record.mayReachUnasked,
    });
  }));
}

/**
 * ADR 0143 DP1 with ADR 0138 CO3/CO4 - a depot, in the same two questions.
 *
 * **The same shape as a supplier line, deliberately.** ADR 0136's supplier
 * holds material and ADR 0143's depot holds what runs, which is a distinction
 * the tree needs and the money does not: a person is answering *may Pico go
 * and get this, and unasked?* about both. Two vocabularies for one question
 * would be two things to learn for no decision it changes.
 */
export interface PicoCompanionDepot {
  remote: string;
  commit: string;
  mayFetch: boolean;
  mayFetchUnasked: boolean;
}

export function picoCompanionDepotLines(
  depots: readonly PicoCompanionDepot[],
): readonly PicoCompanionSupplierLine[] {
  return picoCompanionSupplierLines(depots.map((depot) => ({
    // The revision, short: a person recognises a commit by its first
    // characters or not at all, and the whole thing crowds the line it is on.
    identifier: `${depot.remote} at ${depot.commit.slice(0, 12)}`,
    kind: 'depot',
    mayReachOutside: depot.mayFetch,
    mayReachUnasked: depot.mayFetchUnasked,
  }))).map((line, index) => Object.freeze({
    ...line,
    // The line's own identity is the remote, because that is what the
    // decision names. The revision is in the words a person reads.
    identifier: depots[index]!.remote,
  }));
}

/**
 * ADR 0139 AC4 - what a part of Pico says it will do, put to the person.
 *
 * **The sentences are the module's own, and they are not rewritten here.** A
 * module's effect description is the text somebody agrees to and the text the
 * Vault later quotes back when it asks; a second wording in this file would
 * make the question and the reminder two different questions.
 *
 * So this decides only the frame around them: what the list is called, and
 * what agreeing is called. `drift` is turned into that frame, because *this is
 * new* and *this changed under an agreement you already gave* are different
 * things to be told, and the second is the one ADR 0127 M4 says must never
 * pass silently.
 */
export interface PicoCompanionModuleConsentLine {
  identifier: string;
  headline: string;
  /** One line per declared effect, in the module's own words. */
  effectLines: readonly string[];
  actionLabel: string;
}

export function picoCompanionModuleConsentLines(
  awaiting: ReadonlyArray<{
    identifier: string;
    drift: { added: readonly string[]; removed: readonly string[]; changed: readonly string[] };
    declares: ReadonlyArray<{ name: string; description: string; risk: string }>;
  }>,
): readonly PicoCompanionModuleConsentLine[] {
  return Object.freeze(awaiting.map((entry) => {
    const changed = entry.drift.changed.length > 0;
    return Object.freeze({
      identifier: entry.identifier,
      headline: changed
        ? `${entry.identifier} now asks for something different from what you agreed to.`
        : `${entry.identifier} would like to do this.`,
      effectLines: Object.freeze(entry.declares.map((effect) => effect.description)),
      actionLabel: changed ? 'Agree to the change' : 'Agree',
    });
  }));
}

/**
 * ADR 0141 RN4 - a question the Home is holding, in front of the person.
 *
 * **In the Now view rather than in settings**, which is the split the window
 * already makes: this expires in minutes and is the reason somebody is being
 * interrupted, while agreeing that a module may act at all is a thing they
 * came to change. The two look similar and belong in different places.
 *
 * The prompt is the module's own effect description again, for the reason
 * above: this is the moment the earlier agreement is being drawn on, and it
 * has to be recognisable as the same sentence.
 */
export interface PicoCompanionApprovalLine {
  requestedEventId: string;
  headline: string;
  detail: string;
  approveLabel: string;
  denyLabel: string;
}

export function picoCompanionApprovalLines(
  waiting: ReadonlyArray<{ requestedEventId: string; prompt: string; risk: string }>,
): readonly PicoCompanionApprovalLine[] {
  return Object.freeze(waiting.map((entry) => Object.freeze({
    requestedEventId: entry.requestedEventId,
    headline: 'Pico is waiting for your answer.',
    detail: entry.prompt,
    approveLabel: 'Do it',
    // Never *cancel*: a person closing a question is answering it, and the
    // word for that is no. Leaving it unanswered is what closing the window
    // does, and that is a third thing nothing here offers as a button.
    denyLabel: 'No',
  })));
}

export function parsePicoCompanionModuleConsent(value: unknown): ReadonlyArray<{
  identifier: string;
  drift: { added: readonly string[]; removed: readonly string[]; changed: readonly string[] };
  declares: ReadonlyArray<{ name: string; description: string; risk: string }>;
}> {
  if (!Array.isArray(value)) {
    throw new Error('invalid_pico_companion_module_consent');
  }
  return Object.freeze(value.map((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error('invalid_pico_companion_module_consent_entry');
    }
    const record = entry as Record<string, unknown>;
    const drift = record.drift as Record<string, unknown> | undefined;
    if (typeof record.identifier !== 'string'
      || !Array.isArray(record.declares)
      || !Array.isArray(drift?.added)
      || !Array.isArray(drift.removed)
      || !Array.isArray(drift.changed)) {
      throw new Error('invalid_pico_companion_module_consent_entry');
    }
    return Object.freeze({
      identifier: record.identifier,
      drift: Object.freeze({
        added: Object.freeze(drift.added.map(String)),
        removed: Object.freeze(drift.removed.map(String)),
        changed: Object.freeze(drift.changed.map(String)),
      }),
      declares: Object.freeze(record.declares.map((effect) => {
        const shape = effect as Record<string, unknown> | null;
        if (typeof shape?.name !== 'string'
          || typeof shape.description !== 'string'
          || typeof shape.risk !== 'string') {
          throw new Error('invalid_pico_companion_module_effect');
        }
        return Object.freeze({
          name: shape.name,
          description: shape.description,
          risk: shape.risk,
        });
      })),
    });
  }));
}

export function parsePicoCompanionPendingApprovals(value: unknown): ReadonlyArray<{
  requestedEventId: string;
  prompt: string;
  risk: string;
  expiresAt: string;
}> {
  if (!Array.isArray(value)) {
    throw new Error('invalid_pico_companion_pending_approvals');
  }
  return Object.freeze(value.map((entry) => {
    const record = entry as Record<string, unknown> | null;
    if (typeof record?.requestedEventId !== 'string'
      || typeof record.prompt !== 'string'
      || typeof record.risk !== 'string'
      || typeof record.expiresAt !== 'string') {
      throw new Error('invalid_pico_companion_pending_approval');
    }
    return Object.freeze({
      requestedEventId: record.requestedEventId,
      prompt: record.prompt,
      risk: record.risk,
      expiresAt: record.expiresAt,
    });
  }));
}

/**
 * Why a *fetch now* did nothing, in words rather than a count of zero.
 *
 * One reason has a sentence because one reason is a thing a person can fix:
 * nobody has agreed that this part of Pico may act at all. Anything else the
 * sweep declined to do is already visible as the depot's own switches.
 */
export function picoCompanionFetchBlockedLine(blocked: string): string {
  return blocked === 'effects_not_consented'
    ? 'Nothing was fetched: you have not yet agreed that Pico may fetch depots. '
      + 'That agreement is in settings, under what the parts of Pico may do.'
    : 'Nothing was fetched.';
}

export function parsePicoCompanionDepots(value: unknown): readonly PicoCompanionDepot[] {
  if (!Array.isArray(value)) {
    throw new Error('invalid_pico_companion_depots');
  }
  return Object.freeze(value.map((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error('invalid_pico_companion_depot');
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.remote !== 'string'
      || typeof record.commit !== 'string'
      || typeof record.mayFetch !== 'boolean'
      || typeof record.mayFetchUnasked !== 'boolean') {
      throw new Error('invalid_pico_companion_depot');
    }
    return Object.freeze({
      remote: record.remote,
      commit: record.commit,
      mayFetch: record.mayFetch,
      mayFetchUnasked: record.mayFetchUnasked,
    });
  }));
}
