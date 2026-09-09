import type { PicoCompanionFirstRunScanSource } from './contract.js';
import {
  parsePicoCompanionPresentation,
  picoCompanionFetchBlockedLine,
  picoCompanionFirstRunChoiceLines,
  picoCompanionOwnMachineDeclaration,
  picoCompanionProviderProvesItself,
  picoCompanionOwnMachineUndeclared,
  picoCompanionFloorAssurance,
  picoCompanionPresentationTakesTheWindow,
  picoCompanionRefusalLine,
  picoCompanionRelayRevocationLine,
  picoCompanionDeviceAuthorityEndedLine,
  picoCompanionDeviceAuthorityRenewedLine,
  parsePicoCompanionEnrolmentHints,
  picoCompanionDeviceAuthorityUnavailable,
  picoCompanionHomeMemberAdmittedLine,
  picoCompanionMembershipEndedLine,
  picoCompanionHostRotationReasonLines,
  picoCompanionHostRotationWarning,
  picoCompanionWindowViewLines,
  type PicoCompanionWindowView,
  type PicoCompanionCondition,
  type PicoCompanionPresentation,
} from './contract.js';
import {
  renderPicoCompanionAnsweredReads,
  renderPicoCompanionModelProviders,
  renderPicoCompanionRecalls,
  renderPicoCompanionRelays,
  renderPicoCompanionRelayAccountIssued,
  renderPicoCompanionDevices,
  renderPicoCompanionDomainReadership,
  renderPicoCompanionHomeMembers,
  renderPicoCompanionMeasurements,
  renderPicoCompanionSuppliers,
  renderPicoCompanionDeclaredSuppliers,
  renderPicoCompanionDepots,
  renderPicoCompanionModuleConsent,
  renderPicoCompanionPendingApprovals,
} from './model-provider-views.js';

declare global {
  interface Window {
    picoCompanion: Readonly<{
      getEnrolmentHints(): Promise<unknown>;
      getModelProviders(): Promise<unknown>;
      decideModelProvider(decision: {
        entryId: string;
        providerClass: string;
        carries: string;
      }): Promise<void>;
      widenModelProvider(widening: {
        entryId: string;
        providerClass: string;
      }): Promise<void>;
      revokeModelProvider(entryId: string): Promise<void>;
      getAnsweredReads(): Promise<unknown>;
      keepAnsweredRead(jobId: string): Promise<void>;
      askRecall(ask: { privacyDomain: string; question: string }): Promise<{
        included: number;
        omitted: number;
        carries: string;
      }>;
      getRecalls(): Promise<unknown>;
      grantDomainRead(privacyDomain: string): Promise<{ privacyDomain: string; status: string }>;
      keepRecall(jobId: string): Promise<void>;
      forgetRecall(jobId: string): Promise<void>;
      forgetMemory(memoryItemId: string): Promise<void>;
      askModelProviderMeasurement(
        reach: string,
        model: string,
        /**
         * ADR 0151 PV1. Whether the main process should ask for a credential
         * before measuring. Never the credential itself - it does not cross
         * this window, the way a widening's does not.
         */
        provesItself: boolean,
      ): Promise<{
        entryId: string;
        state: string;
      }>;
      getModelProviderMeasurements(): Promise<unknown>;
      getSuppliers(): Promise<unknown>;
      detachSupplier(identifier: string): Promise<void>;
      detachDepot(remote: string): Promise<void>;
      acceptDepotOffer(remote: string, acceptedCommit: string): Promise<void>;
      decideRule(
        effectName: string,
        privacyDomain: string,
        decision: string,
      ): Promise<void>;
      forgetRule(effectName: string, privacyDomain: string): Promise<void>;
      createReaderCustodySpace(): Promise<void>;
      writeReaderCustodyNote(text: string): Promise<unknown>;
      letOtherDeviceRead(): Promise<unknown>;
      rotateReaderCustodyDomain(): Promise<unknown>;
      readReaderCustodyNotes(): Promise<unknown>;
      forgetModelProvider(entryId: string): Promise<void>;
      attachSupplier(identifier: string, privacyDomain: string): Promise<unknown>;
      decideSupplierReach(
        identifier: string,
        mayReachOutside: boolean,
        mayReachUnasked: boolean,
      ): Promise<void>;
      getDepots(): Promise<unknown>;
      attachDepot(remote: string, commit: string): Promise<{ remote: string; commit: string }>;
      decideDepotReach(
        remote: string,
        mayFetch: boolean,
        mayFetchUnasked: boolean,
      ): Promise<void>;
      fetchDepotsNow(): Promise<{
        requested: number;
        blocked?: string;
        waiting: readonly unknown[];
      }>;
      getPendingActions(): Promise<unknown>;
      resolvePendingAction(
        requestedEventId: string,
        approved: boolean,
      ): Promise<{ outcome: string; ran: boolean; succeeded?: boolean }>;
      getModuleConsent(): Promise<unknown>;
      recordModuleConsent(identifier: string): Promise<void>;
      getDevices(): Promise<unknown>;
      switchDevice(
        presenceId: string,
        affordance: string | undefined,
        enabled: boolean,
      ): Promise<void>;
      forgetDevice(presenceId: string): Promise<void>;
      getDomainReadership(): Promise<unknown>;
      endDomainRead(request: {
        domainId: string;
        readerGrantId: string;
        reasonCategory: string;
      }): Promise<unknown>;
      getHomeMembers(): Promise<unknown>;
      admitHomeMember(): Promise<{
        credentialId: string;
        picoIdentityFingerprintHex: string;
        picoIdentityDisplay: string;
        validUntil: string;
        validUntilDisplay: string;
      }>;
      endHomeMembership(
        credentialId: string,
        picoIdentityFingerprintHex: string,
        ending: string,
      ): Promise<{ credentialId: string; status: string }>;
      rotateHostKeys(reason: string): Promise<unknown>;
      getDeviceAuthority(): Promise<unknown>;
      renewDeviceAuthority(): Promise<{
        delegationId: string;
        replacedDelegationId: string;
        validUntil: string;
        validUntilDisplay: string;
      }>;
      renewOtherDevice(source: string): Promise<void>;
      renewFromOtherDevice(source: string): Promise<void>;
      endDeviceAuthority(delegationId: string, reason: string): Promise<{
        delegationId: string;
        endedThisDevice: boolean;
        activeDevicesLeft: number | null;
      }>;
      getRelays(): Promise<unknown>;
      claimRelay(baseUrl: string, claimCode: string): Promise<{ operator: string }>;
      createRelayAccount(
        baseUrl: string,
        mailboxQuota: number,
        maxCapacity: number,
      ): Promise<{ credential: string; accountRef: string }>;
      revokeRelayAccount(baseUrl: string, accountRef: string): Promise<{
        mailboxesEnded: number;
        packetsDropped: number;
      }>;
      forgetRelay(baseUrl: string): Promise<void>;
      getPresentation(): Promise<unknown>;
      onPresentationChanged(listener: (state: unknown) => void): () => void;
      requestCheck(): Promise<void>;
      vetoRecovery(): Promise<void>;
      openRecoveryCard(): Promise<void>;
      submitRecoveryCard(details: {
        picoName: string;
        homeNameOrId: string;
        homeId: string;
        form: 'paper' | 'card_printer';
      }): Promise<void>;
      decideApproval(approved: boolean): Promise<void>;
      beginFirstRun(source: PicoCompanionFirstRunScanSource): Promise<void>;
      beginFounding(): Promise<void>;
      joinFromDevice(source: string): Promise<void>;
      beginEnrolment(source: string): Promise<void>;
      closeWindow(): void;
    }>;
  }
}

const status = requireElement('status');
const symbol = requireElement('symbol');
const title = requireElement('title');
const body = requireElement('body');
const scope = requireElement('scope');
const conditions = requireElement('conditions');
const firstRunJoin = requireElement('first-run-join');
const joinCamera = requireButton('join-camera');
const joinTyped = requireButton('join-typed');
const deviceCode = requireElement('device-code');
const deviceCodeText = requireElement('device-code-text');
const deviceCodeCanvas = requireCanvas('device-code-canvas');
const floorAssurance = requireElement('floor-assurance');
const check = requireButton('check');
const veto = requireButton('veto');
const recoveryCard = requireButton('recovery-card');
const recoveryCardForm = requireElement('recovery-card-form');
const submitRecoveryCard = requireButton('submit-recovery-card');
const approve = requireButton('approve');
const deny = requireButton('deny');
const firstRun = requireElement('first-run');
const firstRunChoices = requireElement('first-run-choices');
const firstRunRestore = requireElement('first-run-restore');
const scanCamera = requireButton('scan-camera');
const scanTyped = requireButton('scan-typed');
const close = requireButton('close');
const viewNav = requireElement('views');
const nowView = requireElement('view-now');
const settingsView = requireElement('view-settings');

/**
 * ADR 0113. Which view the window is in.
 *
 * Declared here rather than beside the navigation it belongs to, because
 * `render` reads it - and a `let` used before its declaration works only for
 * as long as every path to it stays asynchronous, which is not a property to
 * rest on.
 */
let currentView: PicoCompanionWindowView = 'now';

function render(value: unknown): void {
  const state: PicoCompanionPresentation = parsePicoCompanionPresentation(value);
  /**
   * ADR 0113. Something that wants an answer takes the window back.
   *
   * A person may be halfway through changing a setting when their Vault asks
   * them to approve something, and the approval is the reason this window
   * exists at all. Only a decision does this - a warning about storage is
   * worth showing and not worth interrupting somebody for - and the rule is
   * the contract's, so nothing here decides it a second way.
   */
  if (currentView !== 'now' && picoCompanionPresentationTakesTheWindow(state)) {
    showView('now');
  }
  status.dataset.severity = state.severity;
  symbol.textContent = state.symbol;
  title.textContent = state.title;
  body.textContent = state.body;
  renderConditions(state);
  renderDeviceCode(state);
  scope.hidden = state.kind !== 'pending_recovery';
  veto.hidden = state.decision !== 'veto_recovery';
  recoveryCard.hidden = state.kind !== 'idle'
    && state.kind !== 'recovery_card_printed';
  recoveryCardForm.hidden = state.decision !== 'recovery_card_details';
  approve.hidden = state.decision !== 'approve_or_deny';
  deny.hidden = state.decision !== 'approve_or_deny';
  firstRun.hidden = state.decision !== 'begin_first_run';
  if (firstRun.hidden) {
    // Back to the choice on the next first run, rather than to whichever half
    // of it somebody opened last time.
    firstRunRestore.hidden = true;
    firstRunJoin.hidden = true;
  }
  check.hidden = state.kind === 'recovery_card_setup'
    || state.kind === 'secure_input'
    || state.kind === 'approval'
    || state.kind === 'first_run'
    || state.kind === 'starting';
}

/**
 * ADR 0130 E3. The code this device is holding up for another one.
 *
 * Drawn from the matrix the main process sent, not encoded here: a second
 * encoder in the page is a second thing the camera has to agree with. The
 * text sits under it because a camera that will not focus is not a reason to
 * be stuck - a person can carry the line across by hand instead.
 */
function renderDeviceCode(state: PicoCompanionPresentation): void {
  const code = state.code;
  deviceCode.hidden = code === undefined;
  if (code === undefined) {
    deviceCodeText.textContent = '';
    return;
  }
  const context = deviceCodeCanvas.getContext('2d');
  const quiet = 4;
  const side = code.qr.size + quiet * 2;
  deviceCodeCanvas.width = side;
  deviceCodeCanvas.height = side;
  if (context !== null) {
    /**
     * Black on white, and deliberately not a design token: this is read by a
     * camera rather than by a person, and a QR drawn in the window's own
     * colours is a QR that stops scanning the moment somebody switches to a
     * dark theme.
     */
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, side, side);
    context.fillStyle = '#000000';
    for (const [index, module] of code.qr.modules.entries()) {
      if (module) {
        context.fillRect(quiet + (index % code.qr.size), quiet + Math.floor(index / code.qr.size), 1, 1);
      }
    }
  }
  deviceCodeText.textContent = code.text;
}

/**
 * ADR 0118 O4 and ADR 0119 Q5. Each condition gets its own row, because they
 * are independently true and different decisions follow from each: "I cannot
 * send this" is not "I cannot have this summarised" and neither is "I am
 * running out of room".
 *
 * The assurance line is not optional decoration. O4's load-bearing half is
 * that no absence renders a floor operation as blocked - an avatar reporting
 * itself broken while capture still works teaches the person that Pico is
 * unreliable offline, which is the opposite of what the contract buys. So
 * whenever a condition is shown, what still works is shown with it.
 *
 * `textContent` throughout: a remedy is text, and this is the surface where
 * untrusted content would otherwise become markup.
 */
function renderConditions(state: PicoCompanionPresentation): void {
  conditions.replaceChildren();
  const present = state.conditions.length > 0;
  conditions.hidden = !present;
  floorAssurance.hidden = !present;
  if (!present) {
    return;
  }
  for (const condition of state.conditions) {
    const row = document.createElement('li');
    row.dataset.condition = condition.kind;
    const label = document.createElement('span');
    label.className = 'condition-label';
    // ADR 0113 C2: the word arrives rendered. The window used to keep its own
    // table of these, which is the window deciding a rendering.
    label.textContent = condition.label;
    const remedy = document.createElement('span');
    remedy.className = 'condition-remedy';
    remedy.textContent = condition.remedy;
    row.append(label, remedy);
    conditions.append(row);
  }
  floorAssurance.textContent = picoCompanionFloorAssurance();
}


/**
 * ADR 0130 E2. The choice, rendered once from the contract's words.
 *
 * Built here rather than written into the page, because two closed lists over
 * one subject drift: the page would keep saying "Recovery Card" after the
 * contract stopped. Only "I have a Recovery Card" opens the scanner - founding
 * needs nothing from this page, so it goes straight to the main process, which
 * is where everything that authorises is collected (ADR 0113 C2).
 */
function renderFirstRunChoices(): void {
  for (const line of picoCompanionFirstRunChoiceLines()) {
    const card = document.createElement('div');
    card.className = 'provider-line';
    const headline = document.createElement('p');
    headline.className = 'headline';
    headline.textContent = line.headline;
    const detail = document.createElement('p');
    detail.className = 'detail';
    detail.textContent = line.detail;
    const actions = document.createElement('div');
    actions.className = 'actions';
    const button = document.createElement('button');
    button.type = 'button';
    button.id = `first-run-${line.choice}`;
    button.textContent = line.actionLabel;
    /**
     * A closed switch rather than an else: the third choice arrived in
     * ADR 0130 E3, and an `else` would have sent it to founding - which makes
     * a second identity, the one thing this page exists to keep apart.
     */
    if (line.choice === 'restore') {
      button.addEventListener('click', () => {
        firstRunRestore.hidden = false;
        firstRunJoin.hidden = true;
      });
    } else if (line.choice === 'join') {
      button.className = 'secondary';
      button.addEventListener('click', () => {
        firstRunJoin.hidden = false;
        firstRunRestore.hidden = true;
      });
    } else {
      button.className = 'secondary';
      button.addEventListener('click', () => {
        button.disabled = true;
        void window.picoCompanion.beginFounding().finally(() => {
          button.disabled = false;
        });
      });
    }
    actions.append(button);
    card.append(headline, detail, actions);
    firstRunChoices.append(card);
  }
}

renderFirstRunChoices();

async function beginFirstRun(source: PicoCompanionFirstRunScanSource): Promise<void> {
  scanCamera.disabled = true;
  scanTyped.disabled = true;
  try {
    await window.picoCompanion.beginFirstRun(source);
  } finally {
    scanCamera.disabled = false;
    scanTyped.disabled = false;
  }
}

check.addEventListener('click', async () => {
  check.disabled = true;
  try {
    await window.picoCompanion.requestCheck();
  } finally {
    check.disabled = false;
  }
});
recoveryCard.addEventListener('click', async () => {
  await window.picoCompanion.openRecoveryCard();
});
submitRecoveryCard.addEventListener('click', async () => {
  const picoName = requireInput('pico-name').value;
  const homeNameOrId = requireInput('home-name').value;
  const homeId = requireInput('home-id').value;
  const form = requireSelect('print-form').value;
  if (form !== 'paper' && form !== 'card_printer') {
    throw new Error('invalid_renderer_print_form');
  }
  submitRecoveryCard.disabled = true;
  try {
    await window.picoCompanion.submitRecoveryCard({
      picoName,
      homeNameOrId,
      homeId,
      form,
    });
  } finally {
    submitRecoveryCard.disabled = false;
  }
});
approve.addEventListener('click', async () => {
  await window.picoCompanion.decideApproval(true);
});
deny.addEventListener('click', async () => {
  await window.picoCompanion.decideApproval(false);
});
veto.addEventListener('click', async () => {
  veto.disabled = true;
  try {
    await window.picoCompanion.vetoRecovery();
  } finally {
    veto.disabled = false;
  }
});
scanCamera.addEventListener('click', () => void beginFirstRun('camera'));
scanTyped.addEventListener('click', () => void beginFirstRun('typed'));
/**
 * ADR 0130 E3. Both halves of adding a device leave this page immediately:
 * the codes carry an activation and the pins a Home is trusted by, and
 * ADR 0113 C2 keeps everything that authorises in the main process.
 */
for (const [button, source] of [
  [joinCamera, 'camera'],
  [joinTyped, 'typed'],
] as const) {
  button.addEventListener('click', () => {
    button.disabled = true;
    void window.picoCompanion.joinFromDevice(source).finally(() => {
      button.disabled = false;
    });
  });
}
close.addEventListener('click', () => window.picoCompanion.closeWindow());
const unsubscribe = window.picoCompanion.onPresentationChanged(render);
window.addEventListener('beforeunload', unsubscribe, { once: true });
void window.picoCompanion.getPresentation().then(render);

/**
 * ADR 0152 and ADR 0116 W5. The two lists this window can show, asked for
 * when it opens and after anything a person did that changes them.
 *
 * **Both fail quietly and that is ADR 0118 O4.** Not knowing what computes for
 * you, or what is waiting, is an absence - and no absence renders a working
 * thing as broken. The section stays hidden and the person can ask again by
 * reopening the window. What is *not* quiet is a keep that fails: the main
 * process throws there, because somebody pressed a button and asked.
 */
const recallSection = requireElement('recall');
const recallList = requireElement('recall-list');
const recallForm = requireElement('recall-form');
const recallDomain = requireInput('recall-domain');
const recallQuestion = requireInput('recall-question');
const recallStatus = requireElement('recall-status');
const recallGrant = requireButton('recall-grant');
const providerSection = requireElement('model-providers');
const providerList = requireElement('provider-list');
const readSection = requireElement('answered-reads');
const readList = requireElement('read-list');
/**
 * ADR 0142 PE2. A machine the person names, and the timing of it.
 *
 * The declaration is written by the contract rather than by this file, and it
 * is put into the label at load: a sentence a person has to agree with must
 * come from the one place every other word here comes from.
 */
const measurementSection = requireElement('measurements');
const measurementList = requireElement('measurement-list');
const measureReach = requireInput('measure-reach');
const measureModel = requireInput('measure-model');
const measureOwn = requireInput('measure-own');
const measureOwnLabel = requireElement('measure-own-label');
const measureProof = requireInput('measure-proof');
const measureProofLabel = requireElement('measure-proof-label');
const measureSubmit = requireButton('measure-submit');
const measureStatus = requireElement('measure-status');

measureOwnLabel.textContent = picoCompanionOwnMachineDeclaration;
measureProofLabel.textContent = picoCompanionProviderProvesItself;

function refreshMeasurements(): void {
  void window.picoCompanion.getModelProviderMeasurements()
    .then((measurements) => {
      renderPicoCompanionMeasurements(
        { list: measurementList, section: measurementSection, document },
        measurements,
      );
      /**
       * Asked again only while something is running, and once every five
       * seconds rather than as fast as it can.
       *
       * ADR 0119 Q4's stranger bucket is sixty requests a minute *shared*,
       * charged before the seal is opened - a window that polled hard would be
       * indistinguishable from a flood, and would spend the budget its own
       * Home needs for everything else.
       */
      const running = (measurements as Array<{ state?: string }>)
        .some((entry) => entry.state === 'running');
      if (running) {
        setTimeout(refreshMeasurements, 5_000);
      }
    }, () => {
      measurementSection.hidden = true;
    });
}

measureSubmit.addEventListener('click', () => {
  const reach = measureReach.value.trim();
  const model = measureModel.value.trim();
  if (reach === '' || model === '') {
    measureStatus.textContent = 'Name where it answers, and which model to run.';
    return;
  }
  if (!measureOwn.checked) {
    // Refused in words rather than by a disabled button: a greyed-out control
    // invites somebody to wonder what it would have done.
    measureStatus.textContent = picoCompanionOwnMachineUndeclared;
    return;
  }
  measureStatus.textContent = measureProof.checked
    // Said before the secure input appears, because a window that goes quiet
    // and then demands a secret reads as something having gone wrong.
    ? 'Asking you for the credential...'
    : 'Starting...';
  void window.picoCompanion.askModelProviderMeasurement(reach, model, measureProof.checked)
    .then(() => {
      // Said as what it will and will not do. The measurement produces a
      // finding; using it is the decision on the list below.
      measureStatus.textContent = 'Measuring. That takes several minutes, and '
        + 'nothing uses this machine until you decide it may.';
      refreshMeasurements();
      refreshModelProviders();
    }, (error: unknown) => {
      measureStatus.textContent = refusalText(error, 'That was not measured.');
    });
});

const supplierSection = requireElement('suppliers');
const supplierList = requireElement('supplier-list');
const supplierStatus = requireElement('supplier-status');
const declaredSupplierSection = requireElement('declared-suppliers');
const declaredSupplierList = requireElement('declared-supplier-list');
const declaredSupplierStatus = requireElement('declared-supplier-status');

/**
 * ADR 0138 CO3/CO4. What Pico may fetch, and what that costs.
 *
 * Fails quietly like its neighbours (ADR 0118 O4). What a person pressed
 * always answers - this one decides about their money, so a silent failure
 * would be the worst kind.
 */
function refreshSuppliers(): void {
  void window.picoCompanion.getSuppliers()
    .then((read) => {
      const both = read as { suppliers: unknown; declared: unknown };
      /**
       * ADR 0143 DP3. What a depot brought and nobody has accepted, above the
       * attached ones - a decision waiting on somebody reads before a list of
       * decisions already made.
       */
      renderPicoCompanionDeclaredSuppliers(
        { list: declaredSupplierList, section: declaredSupplierSection, document },
        both.declared,
        (attachment) => {
          if (attachment.privacyDomain === '') {
            declaredSupplierStatus.textContent =
              'Name the part of your memory this belongs to.';
            return;
          }
          void window.picoCompanion.attachSupplier(
            attachment.identifier,
            attachment.privacyDomain,
          ).then(() => {
            // Said as what it did and did not do, like the depot line above.
            declaredSupplierStatus.textContent =
              `${attachment.identifier} now belongs to ${attachment.privacyDomain}. `
              + 'Pico will not go out for it until you say so.';
            refreshSuppliers();
          }, (error: unknown) => {
            declaredSupplierStatus.textContent = refusalText(error, 'That was not attached.');
          });
        },
      );
      renderPicoCompanionSuppliers(
        { list: supplierList, section: supplierSection, document },
        both.suppliers,
        (decision) => {
          void window.picoCompanion.decideSupplierReach(
            decision.identifier,
            decision.mayReachOutside,
            decision.mayReachUnasked,
          ).then(() => {
            supplierStatus.textContent = decision.mayReachOutside
              ? (decision.mayReachUnasked
                ? 'It may now fetch on its own. You will not see those trips.'
                : 'It may fetch when you ask.')
              : 'Pico will not go out for this.';
            refreshSuppliers();
          }, (error: unknown) => {
            supplierStatus.textContent = refusalText(error, 'That was not changed.');
          });
        },
        (identifier) => {
          // Said as what stays, not only as what went: a person removing a
          // library is owed the fact that what Pico read out of it is theirs.
          void window.picoCompanion.detachSupplier(identifier).then(() => {
            supplierStatus.textContent = 'Removed. What Pico read out of it is '
              + 'still part of what you remember.';
            refreshSuppliers();
          }, (error: unknown) => {
            supplierStatus.textContent = refusalText(error, 'That was not removed.');
          });
        },
      );
    }, () => {
      supplierSection.hidden = true;
    });
}

const depotSection = requireElement('depots');
const depotList = requireElement('depot-list');
const depotAttach = requireElement('depot-attach');
const depotRemote = requireInput('depot-remote');
const depotCommit = requireInput('depot-commit');
const depotAttachSubmit = requireButton('depot-attach-submit');
const depotStatus = requireElement('depot-status');

/**
 * ADR 0086 mit ADR 0130 E5. Ein Raum, den nur diese Person und die Leute
 * lesen können, die sie wählt.
 *
 * **Der Ast bekommt sein Subjekt** (Befund B5): die Leserschaft nebenan zeigt
 * seit dem 2026-08-24, wer lesen darf, und es gab nichts zu lesen. Hier
 * entsteht das, worüber sie spricht.
 */
const readerCustodyDetail = requireElement('reader-custody-detail');
const readerCustodyCreate = requireButton('reader-custody-create');
const readerCustodyText = requireInput('reader-custody-text');
const readerCustodyWrite = requireButton('reader-custody-write');
const readerCustodyLetOther = requireButton('reader-custody-let-other');
const readerCustodyRead = requireButton('reader-custody-read');
const readerCustodyRotate = requireButton('reader-custody-rotate');
const readerCustodyList = requireElement('reader-custody-list');
const readerCustodyStatus = requireElement('reader-custody-status');

/**
 * Der Satz sagt, was die beiden Knöpfe kosten - eine Zustimmung je Zeremonie,
 * und keine fürs Schreiben. Wer das nicht weiß, klickt die erste weg.
 */
readerCustodyDetail.textContent =
  'Making the space asks you twice: once for the space itself, once for '
  + 'permission to write in it. Writing into it afterwards asks nothing.';

readerCustodyCreate.addEventListener('click', () => {
  readerCustodyStatus.textContent = 'Waiting for your two answers...';
  void window.picoCompanion.createReaderCustodySpace().then(() => {
    readerCustodyStatus.textContent =
      'The space is there. Who may read it is next door, and nobody may yet.';
  }, (error: unknown) => {
    readerCustodyStatus.textContent = refusalText(error, 'That space was not made.');
  });
});

readerCustodyRead.addEventListener('click', () => {
  /**
   * ADR 0094. Der Klartext entsteht im Vault, nicht im Home: was über die
   * Leitung kam, waren Aufzeichnungen mit Unterschriften, und der Daemon hat
   * sie selbst geprüft. Diese Zeilen zeigen an, was zurückkam.
   */
  void window.picoCompanion.readReaderCustodyNotes().then((notes) => {
    const read = notes as ReadonlyArray<{ memoryItemId: string; text: string }>;
    readerCustodyList.replaceChildren();
    for (const note of read) {
      const item = document.createElement('li');
      item.className = 'provider-line';
      const line = document.createElement('p');
      line.className = 'detail';
      line.textContent = note.text;
      item.append(line);
      readerCustodyList.append(item);
    }
    // Leer heisst leer: „nichts drin" ist eine Aussage, und eine erfundene
    // Beruhigung wäre eine zweite, die niemand entschieden hat.
    readerCustodyStatus.textContent = read.length === 0
      ? 'Nothing has been written there yet.'
      : `${read.length} of them.`;
  }, (error: unknown) => {
    readerCustodyStatus.textContent = refusalText(error, 'That could not be read.');
  });
});

readerCustodyRotate.addEventListener('click', () => {
  /**
   * ADR 0101 mit ADR 0130 E5. Das Schloss wechseln, nachdem jemand hinaus ist.
   *
   * **Der Satz sagt, was danach gilt.** Wer hinausgeworfen wurde, hält den
   * alten Schlüssel; ohne Wechsel liefe alles Neue weiter unter genau ihm.
   * Und was vorher drinsteht, bleibt lesbar für die, die geblieben sind - ein
   * Schlosswechsel nimmt niemandem etwas weg, den man nicht hinausgeworfen
   * hat.
   *
   * **Vier Antworten, nicht eine.** Rotiert; nur das eigene Recht erneuert
   * (so steht dieses Gerät da, wenn ein anderes rotiert hat); nur die Kette
   * nachgetragen; oder es war nichts zu tun. „Nichts zu tun" ist eine Aussage
   * und keine Ablehnung - ADR 0118 O4s Unterschied zwischen „nichts wartet"
   * und „niemand hat nachgesehen".
   */
  readerCustodyStatus.textContent = 'Asking your Home what has changed...';
  void window.picoCompanion.rotateReaderCustodyDomain().then((answer) => {
    const done = answer as {
      rotated: boolean;
      writerGrantRenewed: boolean;
      chainCaughtUp: boolean;
      remainingReaders: number;
    };
    if (done.rotated) {
      readerCustodyStatus.textContent =
        `The lock is changed. ${done.remainingReaders === 0
          ? 'Nobody but you can read what you write from now on'
          : `${done.remainingReaders} reader(s) kept their access`}, and this `
        + 'device can write here again.';
      return;
    }
    if (done.writerGrantRenewed) {
      readerCustodyStatus.textContent =
        'Somebody else changed the lock; this device can write here again.';
      return;
    }
    readerCustodyStatus.textContent = done.chainCaughtUp
      ? 'This device had fallen behind and has caught up. Nothing else needed changing.'
      : 'Nothing needed changing: nobody has been let out since the last change.';
  }, (error: unknown) => {
    readerCustodyStatus.textContent = refusalText(error, 'The lock was not changed.');
  });
});

readerCustodyLetOther.addEventListener('click', () => {
  /**
   * ADR 0085. Der einzige Fall, für den es heute reicht - und der Satz sagt,
   * was danach gilt und was nicht: von hier an, nicht rückwirkend. Was vor
   * dem Hereinlassen geschrieben wurde, bleibt dem zweiten Gerät verborgen
   * (ADR 0088s `from_version`), und eine Person, der man das verschwiege,
   * suchte später nach einem Satz, den sie dort nie finden wird.
   */
  readerCustodyStatus.textContent = 'Asking your Home about your devices...';
  void window.picoCompanion.letOtherDeviceRead().then(() => {
    readerCustodyStatus.textContent =
      'Your other device may read this space from now on. What you wrote '
      + 'before stays only here.';
  }, (error: unknown) => {
    readerCustodyStatus.textContent = refusalText(error, 'That device was not let in.');
  });
});

readerCustodyWrite.addEventListener('click', () => {
  const text = readerCustodyText.value.trim();
  if (text === '') {
    // Ein leerer Satz ist kein Satz, und die Fläche sagt das, statt ihn
    // wegzuschicken und eine Ablehnung zurückzubekommen.
    readerCustodyStatus.textContent = 'Write something first.';
    return;
  }
  void window.picoCompanion.writeReaderCustodyNote(text).then(() => {
    readerCustodyText.value = '';
    // Was jetzt gilt, nicht dass ein Vorgang gelang: die Person will wissen,
    // wo der Satz steht und wer ihn sehen kann.
    readerCustodyStatus.textContent =
      'Written. Only you can read it until you let somebody in.';
  }, (error: unknown) => {
    readerCustodyStatus.textContent = refusalText(error, 'That was not written.');
  });
});

/** ADR 0143 DP1 with ADR 0138 CO3/CO4. Material, and whether Pico may go for it. */
function refreshDepots(): void {
  void window.picoCompanion.getDepots()
    .then((depots) => {
      renderPicoCompanionDepots(
        { list: depotList, section: depotSection, document },
        depots,
        (decision) => {
          void window.picoCompanion.decideDepotReach(
            decision.remote,
            decision.mayFetch,
            decision.mayFetchUnasked,
          ).then(() => {
            depotStatus.textContent = decision.mayFetch
              ? (decision.mayFetchUnasked
                ? 'It may now fetch on its own. You will not see those trips.'
                : 'It may fetch when you ask.')
              : 'Pico will not go out for this.';
            refreshDepots();
          }, (error: unknown) => {
            depotStatus.textContent = refusalText(error, 'That was not changed.');
          });
        },
        (remote) => {
          void window.picoCompanion.detachDepot(remote).then(() => {
            // The files go with it, and saying so is the point: a person
            // removing a depot is removing code from their machine.
            depotStatus.textContent = 'Removed, and its files are off this machine.';
            refreshDepots();
            refreshSuppliers();
          }, (error: unknown) => {
            depotStatus.textContent = refusalText(error, 'That was not removed.');
          });
        },
        (accepted) => {
          /**
           * ADR 0143 DP1. Der Satz sagt, was jetzt läuft, und nicht, dass ein
           * Vorgang gelungen ist - was hier angenommen wurde, ist Code auf
           * dieser Maschine, und die Person will wissen, welcher.
           */
          void window.picoCompanion.acceptDepotOffer(
            accepted.remote,
            accepted.acceptedCommit,
          ).then(() => {
            depotStatus.textContent =
              `Now running ${accepted.acceptedCommit.slice(0, 12)}.`;
            refreshDepots();
          }, (error: unknown) => {
            depotStatus.textContent = refusalText(error, 'That was not accepted.');
          });
        },
        (rule) => {
          /**
           * ADR 0140 RL4. Der Satz sagt, was jetzt gilt - und beim Abschalten,
           * was an seine Stelle tritt: nicht „verboten", sondern wieder die
           * Frage, die die Risikoklasse ohnehin stellt.
           */
          const answered = rule.allowing
            ? window.picoCompanion.decideRule(rule.effectName, rule.privacyDomain, 'allow')
            : window.picoCompanion.forgetRule(rule.effectName, rule.privacyDomain);
          void answered.then(() => {
            depotStatus.textContent = rule.allowing
              ? 'Pico will keep these at the revision you accepted, on its own.'
              : 'Pico will ask you again before it fetches.';
            refreshDepots();
          }, (error: unknown) => {
            depotStatus.textContent = refusalText(error, 'That was not changed.');
          });
        },
      );
    }, () => {
      depotSection.hidden = true;
    });
}

depotAttachSubmit.addEventListener('click', () => {
  const remote = depotRemote.value.trim();
  const commit = depotCommit.value.trim();
  if (remote === '' || commit === '') {
    depotStatus.textContent = 'Name where it lives, and the exact revision.';
    return;
  }
  depotStatus.textContent = 'Recording that this may be here...';
  void window.picoCompanion.attachDepot(remote, commit)
    .then((attached) => {
      // Said as what it did and did not do. Attaching says this material may
      // be here; going out for it is the next answer, on the line above.
      depotStatus.textContent = `Recorded at ${attached.commit.slice(0, 12)}. `
        + 'Pico will not fetch it until you say so.';
      depotCommit.value = '';
      refreshDepots();
    }, (error: unknown) => {
      // Each refusal names something different: a revision that is not one, a
      // request to track something, an address this cannot use.
      depotStatus.textContent = refusalText(error, 'That was not recorded.');
    });
});

/**
 * ADR 0141 RN4. What the Home is holding for this window's session.
 *
 * Refreshed after every act rather than polled: the list changes when a person
 * asks for something or answers something, and both go through here.
 */
const pendingActionSection = requireElement('pending-actions');
const pendingActionList = requireElement('pending-action-list');
const pendingActionStatus = requireElement('pending-action-status');

function refreshPendingActions(): void {
  void window.picoCompanion.getPendingActions()
    .then((waiting) => {
      renderPicoCompanionPendingApprovals(
        { list: pendingActionList, section: pendingActionSection, document },
        waiting,
        (decision) => {
          pendingActionStatus.textContent = decision.approved
            ? 'Doing it...'
            : 'Leaving it.';
          void window.picoCompanion.resolvePendingAction(
            decision.requestedEventId,
            decision.approved,
          ).then((answer) => {
            // Said as what happened, which is not the same as what was
            // decided: a person approving something is owed the difference
            // between "it ran" and "it ran and failed".
            pendingActionStatus.textContent = !answer.ran
              ? 'Left alone.'
              : (answer.succeeded === false
                ? 'That was allowed, and it did not work.'
                : 'Done.');
            refreshPendingActions();
            refreshDepots();
          }, (error: unknown) => {
            pendingActionStatus.textContent = refusalText(error, 'That was not answered.');
            refreshPendingActions();
          });
        },
      );
    }, () => {
      pendingActionSection.hidden = true;
    });
}

/** ADR 0139 AC4. What the parts of Pico declare, and the person's agreement. */
const moduleConsentSection = requireElement('module-consent');
const moduleConsentList = requireElement('module-consent-list');
const moduleConsentStatus = requireElement('module-consent-status');

function refreshModuleConsent(): void {
  void window.picoCompanion.getModuleConsent()
    .then((awaiting) => {
      renderPicoCompanionModuleConsent(
        { list: moduleConsentList, section: moduleConsentSection, document },
        awaiting,
        (identifier) => {
          void window.picoCompanion.recordModuleConsent(identifier).then(() => {
            moduleConsentStatus.textContent = 'Recorded. Pico may do that now.';
            refreshModuleConsent();
          }, (error: unknown) => {
            moduleConsentStatus.textContent = refusalText(error, 'That was not recorded.');
          });
        },
      );
    }, () => {
      moduleConsentSection.hidden = true;
    });
}

/**
 * ADR 0143 DP8. *Fetch now* - and what came back to be answered.
 *
 * The question lands in the Now view, so this says where it went. A button
 * that produced a question somewhere the person is not looking would be a
 * press that appeared to do nothing.
 */
const depotFetchNow = requireButton('depot-fetch-now');

depotFetchNow.addEventListener('click', () => {
  depotStatus.textContent = 'Asking...';
  void window.picoCompanion.fetchDepotsNow()
    .then((asked) => {
      if (asked.blocked !== undefined) {
        depotStatus.textContent = picoCompanionFetchBlockedLine(asked.blocked);
        refreshModuleConsent();
        return;
      }
      depotStatus.textContent = asked.waiting.length > 0
        ? 'Pico is asking whether it may. Your answer is under Now.'
        : (asked.requested === 0
          ? 'Nothing to fetch.'
          : 'Fetched.');
      refreshPendingActions();
      refreshDepots();
    }, (error: unknown) => {
      depotStatus.textContent = refusalText(error, 'Nothing was fetched.');
    });
});

const readershipSection = requireElement('readership');
const readershipList = requireElement('readership-list');
const readershipSummary = requireElement('readership-summary');
const readershipStatus = requireElement('readership-status');

/**
 * ADR 0082 mit ADR 0130 E5. Wer welche deiner Domänen lesen darf.
 *
 * Wie beim Home wirft der Lesevorgang, statt leer zu antworten, und der
 * Abschnitt bleibt dann verborgen: „niemand liest mit" ist eine Aussage über
 * dein Gedächtnis, und ein Fenster, das sie nach einem fehlgeschlagenen
 * Lesevorgang sagt, sagt dir etwas Falsches über deine eigenen Sachen.
 */
function refreshDomainReadership(): void {
  void window.picoCompanion.getDomainReadership().then((domains) => {
    renderPicoCompanionDomainReadership(
      { list: readershipList, section: readershipSection, summary: readershipSummary, document },
      domains,
      (ending) => {
        readershipStatus.textContent = 'Ending that access...';
        void window.picoCompanion.endDomainRead(ending).then(() => {
          readershipStatus.textContent = 'That access has ended.';
          refreshDomainReadership();
        }, () => {
          readershipStatus.textContent = 'Pico could not end that access.';
        });
      },
    );
  }, () => {
    readershipSection.hidden = true;
  });
}

const homeSection = requireElement('home');
const homeMemberList = requireElement('home-member-list');
const homeMembersSummary = requireElement('home-members-summary');
const homeStatus = requireElement('home-status');
const homeAdmit = requireButton('home-admit');
const homeRotate = requireButton('home-rotate');
const homeRotateHow = requireElement('home-rotate-how');
const homeRotateWarning = requireElement('home-rotate-warning');
const homeRotateReasons = requireElement('home-rotate-reasons');

/**
 * ADR 0130 E4. Who lives in this Home, and the keys it is known by.
 *
 * The read throws rather than answering empty, and the section stays hidden
 * when it does: "nobody else lives here" is a sentence about a place, and a
 * window that said it because a read failed would be telling somebody
 * something false about their own Home.
 */
function refreshHomeMembers(): void {
  void window.picoCompanion.getHomeMembers().then((members) => {
    renderPicoCompanionHomeMembers(
      {
        list: homeMemberList,
        section: homeSection,
        summary: homeMembersSummary,
        document,
      },
      members,
      (ending) => {
        void window.picoCompanion.endHomeMembership(
          ending.credentialId,
          ending.picoIdentityFingerprintHex,
          ending.ending,
        ).then((ended) => {
          homeStatus.textContent = picoCompanionMembershipEndedLine(ended);
          refreshHomeMembers();
        }, (error: unknown) => {
          homeStatus.textContent = refusalText(error, 'That Pico still lives here.');
        });
      },
    );
  }, () => {
    homeSection.hidden = true;
  });
}

homeAdmit.addEventListener('click', () => {
  homeAdmit.disabled = true;
  void window.picoCompanion.admitHomeMember().then((admitted) => {
    homeStatus.textContent = picoCompanionHomeMemberAdmittedLine(admitted);
    refreshHomeMembers();
  }, (error: unknown) => {
    homeStatus.textContent = refusalText(error, 'Nobody was admitted.');
  }).finally(() => {
    homeAdmit.disabled = false;
  });
});

homeRotate.addEventListener('click', () => {
  homeRotateWarning.textContent = picoCompanionHostRotationWarning;
  homeRotateReasons.replaceChildren();
  for (const line of picoCompanionHostRotationReasonLines()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.reason = line.reason;
    button.textContent = line.label;
    button.addEventListener('click', () => {
      homeRotateHow.hidden = true;
      homeStatus.textContent = '';
      void window.picoCompanion.rotateHostKeys(line.reason).then(() => {
        // What happened is a presentation, not a line in this section: a Home
        // that changed its keys is a state of the whole window.
        refreshHomeMembers();
      }, (error: unknown) => {
        homeStatus.textContent = refusalText(error, 'Your Home still has the same keys.');
      });
    });
    homeRotateReasons.append(button);
  }
  homeRotateHow.hidden = false;
});

const deviceSection = requireElement('devices');
const deviceList = requireElement('device-list');
const deviceStatus = requireElement('device-status');
const deviceAuthoritySummary = requireElement('device-authority-summary');
const deviceAdd = requireButton('device-add');
const deviceAddHow = requireElement('device-add-how');
const deviceRenewOther = requireButton('device-renew-other');
const deviceAddHint = requireElement('device-add-hint');
const deviceAddCamera = requireButton('device-add-camera');
const deviceAddTyped = requireButton('device-add-typed');

/**
 * ADR 0126 P2/P6 with ADR 0130 E3. The person's devices, their word about
 * each one, and which of them their Home still answers to.
 *
 * Two reads, awaited together and failing apart. The presence read fails
 * quietly like its neighbours (ADR 0118 O4): not knowing which devices you
 * have is an absence, and an absence must not render a working thing as
 * broken. The authority read does not get that treatment - it says instead
 * that it could not ask, because "no authority" is a sentence about a device
 * that can still act as the person. What a person pressed always answers.
 */
function refreshDevices(): void {
  void Promise.all([
    window.picoCompanion.getDevices(),
    window.picoCompanion.getDeviceAuthority().then(
      (view) => view,
      // Kept apart from the presence read on purpose: one unanswered question
      // must not take the other's answer off the screen.
      (): undefined => undefined,
    ),
  ])
    .then(([devices, authority]) => {
      renderPicoCompanionDevices(
        {
          list: deviceList,
          section: deviceSection,
          document,
          summary: deviceAuthoritySummary,
        },
        devices,
        (action) => {
          if (action.action === 'end-authority') {
            void window.picoCompanion
              .endDeviceAuthority(action.delegationId, action.reason)
              .then((ended) => {
                deviceStatus.textContent = picoCompanionDeviceAuthorityEndedLine(ended);
                refreshDevices();
              }, (error: unknown) => {
                deviceStatus.textContent = refusalText(
                  error,
                  'That device can still act as you.',
                );
              });
            return;
          }
          if (action.action === 'forget') {
            void window.picoCompanion.forgetDevice(action.presenceId).then(() => {
              deviceStatus.textContent = 'Forgotten, with everything you had decided '
                + 'about it. The device itself is untouched, and announcing again '
                + 'brings it back as new.';
              refreshDevices();
            }, (error: unknown) => {
              deviceStatus.textContent = refusalText(error, 'That device is still here.');
            });
            return;
          }
          void window.picoCompanion
            .switchDevice(action.presenceId, action.affordance, action.enabled)
            .then(() => {
              deviceStatus.textContent = action.enabled
                ? 'Allowed again.'
                : 'Pico will not use that.';
              refreshDevices();
            }, (error: unknown) => {
              deviceStatus.textContent = refusalText(error, 'That was not changed.');
            });
        },
        authority,
        () => {
          void window.picoCompanion.renewDeviceAuthority().then((renewed) => {
            deviceStatus.textContent = picoCompanionDeviceAuthorityRenewedLine(renewed);
            refreshDevices();
          }, (error: unknown) => {
            deviceStatus.textContent = refusalText(
              error,
              'This device\u2019s authority is unchanged.',
            );
          });
        },
        () => openDeviceCodePanel('renew-mine'),
      );
      if (authority === undefined) {
        deviceAuthoritySummary.textContent = picoCompanionDeviceAuthorityUnavailable;
        deviceAuthoritySummary.hidden = false;
        // And the section stays open to say it. A device that has announced
        // nothing yet leaves the list empty, and hiding the whole thing then
        // would hide the fact that Pico could not ask.
        deviceSection.hidden = false;
      }
    }, () => {
      deviceSection.hidden = true;
    });
}

/**
 * ADR 0130 E3. One panel for the three walks that are the same three codes.
 *
 * The intent decides which one runs and which sentence the panel carries -
 * adding and renewing somebody else's device start with reading their code,
 * and renewing this one starts with showing ours. Three panels saying nearly
 * the same thing would be three places for that sentence to drift.
 */
type PicoCompanionDeviceCodeIntent = 'add' | 'renew-other' | 'renew-mine';
let deviceCodeIntent: PicoCompanionDeviceCodeIntent = 'add';

/**
 * ADR 0113 C2. Die zwei Sätze kommen fertig herüber; hier wird nur gewählt,
 * welcher zur geöffneten Absicht gehört.
 *
 * Das Fenster rief bis zum 2026-08-21 selbst `picoCompanionEnrolmentStepLine`
 * auf - eine Wortwahl an der Stelle, die unter C2 keine trifft, und zugleich
 * die Stelle, an der eine zweite Fläche eigene Sätze erfunden hätte.
 */
let enrolmentHints: { add: string; renewMine: string } | null = null;

function applyDeviceCodeHint(): void {
  if (enrolmentHints === null) {
    return;
  }
  deviceAddHint.textContent = deviceCodeIntent === 'renew-mine'
    ? enrolmentHints.renewMine
    : enrolmentHints.add;
}

void window.picoCompanion.getEnrolmentHints()
  .then((value) => {
    enrolmentHints = parsePicoCompanionEnrolmentHints(value);
    // Falls die Fläche schon offen ist, während die Antwort ankommt: ein Feld,
    // das leer bleibt, sagt "nichts anzugeben" und nicht "noch nicht geladen".
    if (!deviceAddHow.hidden) {
      applyDeviceCodeHint();
    }
  })
  .catch(() => {
    // Absichtlich still: der Hinweis ist eine Hilfe, kein Zustand. Eine
    // Fehlermeldung an dieser Stelle wäre eine Meldung über die Werkstatt.
  });

function openDeviceCodePanel(intent: PicoCompanionDeviceCodeIntent): void {
  deviceCodeIntent = intent;
  deviceAddHow.dataset.intent = intent;
  applyDeviceCodeHint();
  deviceAddHow.hidden = false;
}

deviceAdd.addEventListener('click', () => openDeviceCodePanel('add'));
deviceRenewOther.addEventListener('click', () => openDeviceCodePanel('renew-other'));
for (const [button, source] of [
  [deviceAddCamera, 'camera'],
  [deviceAddTyped, 'typed'],
] as const) {
  button.addEventListener('click', () => {
    button.disabled = true;
    deviceAddHow.hidden = true;
    const intent = deviceCodeIntent;
    const walked = intent === 'renew-mine'
      ? window.picoCompanion.renewFromOtherDevice(source)
      : intent === 'renew-other'
        ? window.picoCompanion.renewOtherDevice(source)
        : window.picoCompanion.beginEnrolment(source);
    void walked.then(() => {
      refreshDevices();
    }, (error: unknown) => {
      deviceStatus.textContent = refusalText(
        error,
        intent === 'add' ? 'No device was added.' : 'Nothing was renewed.',
      );
    }).finally(() => {
      button.disabled = false;
    });
  });
}

const relaySection = requireElement('relays');
const relayList = requireElement('relay-list');
const relayIssued = requireElement('relay-issued');
const relayStatus = requireElement('relay-status');
const relayUrl = requireInput('relay-url');
const relayCode = requireInput('relay-code');
const relayClaim = requireButton('relay-claim-submit');
const relayClaimStatus = requireElement('relay-claim-status');

/**
 * ADR 0154. The relays this device administers.
 *
 * Fails quietly like its neighbours (ADR 0118 O4): not knowing is an absence,
 * and an absence must not render a working machine as broken. What is *not*
 * quiet is anything a person pressed - those say what happened, by name.
 */
function refreshRelays(): void {
  void window.picoCompanion.getRelays()
    .then((relays) => {
      renderPicoCompanionRelays(
        { list: relayList, section: relaySection, document },
        relays,
        (action) => {
          if (action.action === 'create') {
            relayStatus.textContent = 'Asking the relay for a key...';
            void window.picoCompanion.createRelayAccount(action.baseUrl, 4, 64)
              .then((issued) => {
                relayStatus.textContent = '';
                // ADR 0154 RO3. Shown once, in its own block, because a
                // redraw of the list would take it away and nothing can
                // produce it again.
                renderPicoCompanionRelayAccountIssued(
                  { block: relayIssued, document },
                  issued.credential,
                );
                refreshRelays();
              }, (error: unknown) => {
                relayStatus.textContent = refusalText(error, 'The relay did not issue a key.');
              });
            return;
          }
          if (action.action === 'revoke') {
            void window.picoCompanion
              .revokeRelayAccount(action.baseUrl, action.accountRef)
              .then((ended) => {
                // What it cost, not just that it worked. Revoking is the one
                // destructive thing here, and the dropped mail has no other
                // reader left to notice it.
                relayStatus.textContent = picoCompanionRelayRevocationLine(ended);
                refreshRelays();
              }, (error: unknown) => {
                relayStatus.textContent = refusalText(error, 'That key was not withdrawn.');
              });
            return;
          }
          void window.picoCompanion.forgetRelay(action.baseUrl).then(() => {
            // Said as what it costs, not as a tidy-up.
            relayStatus.textContent = 'Forgotten here. The relay still considers '
              + 'itself taken over; getting back in needs the reset file on its disk.';
            refreshRelays();
          }, (error: unknown) => {
            relayStatus.textContent = refusalText(error, 'That relay is still here.');
          });
        },
      );
    }, () => {
      relaySection.hidden = true;
    });
}

relayClaim.addEventListener('click', () => {
  const baseUrl = relayUrl.value.trim();
  const claimCode = relayCode.value.trim();
  if (baseUrl === '' || claimCode === '') {
    relayClaimStatus.textContent = 'Name where it answers, and the code from its log.';
    return;
  }
  if (!/^[a-z]+:\/\//u.test(baseUrl)) {
    // Said here rather than as a refusal from three layers down, because this
    // one is a typo and the person is looking at the field.
    relayClaimStatus.textContent = 'Start the address with its scheme, and end it with the port.';
    return;
  }
  relayClaimStatus.textContent = 'Taking over...';
  void window.picoCompanion.claimRelay(baseUrl, claimCode)
    .then((claimed) => {
      relayClaimStatus.textContent = `You now run the relay at ${claimed.operator}.`;
      relayCode.value = '';
      refreshRelays();
    }, (error: unknown) => {
      // Each refusal names something different to do next: look at the log
      // again, restart the relay, or find out who already took it over.
      relayClaimStatus.textContent = refusalText(error, 'That relay was not taken over.');
    });
});

/**
 * ADR 0113 C2. The window's own word turned into the person's.
 *
 * This used to print `error.message` unchanged, which put refusals like
 * `companion_operation_in_progress` into a status line beside a button
 * somebody had just pressed. The contract owns the sentences now; here the
 * only job left is unwrapping the error.
 */
function refusalText(error: unknown, fallback: string): string {
  return picoCompanionRefusalLine(
    error instanceof Error ? error.message.replace(/^Error: /u, '') : '',
    fallback,
  );
}

/**
 * ADR 0116 W1. What the person asked, refreshed like everything else.
 *
 * The section is shown whenever the Home answered the read at all - asking is
 * something a person can do before any provider has answered anything, and
 * hiding the field until an answer exists would hide the only way to get one.
 */
function refreshRecalls(): void {
  void window.picoCompanion.getRecalls()
    .then((recalls) => {
      recallSection.hidden = false;
      renderPicoCompanionRecalls(
        { list: recallList, section: recallSection, document },
        recalls,
        (jobId) => {
          // The write ADR 0116 W5 requires, and the list is asked for again
          // rather than edited: what is kept is the Home's answer.
          void window.picoCompanion.keepRecall(jobId).then(() => {
            recallStatus.textContent = 'Kept. It is part of what you remember now.';
            refreshRecalls();
          }, (error: unknown) => {
            recallStatus.textContent = error instanceof Error
              ? error.message.replace(/^Error: /u, '')
              : 'That answer was not kept.';
          });
        },
        (memoryItemId) => {
          /**
           * ADR 0071. The press *is* the deletion, on the line that made the
           * memory. Said as what is now true rather than as what was done: a
           * person who forgets something wants to know it is gone, not that a
           * request succeeded.
           */
          void window.picoCompanion.forgetMemory(memoryItemId).then(() => {
            recallStatus.textContent =
              'Forgotten. That sentence is no longer part of what you remember.';
            refreshRecalls();
          }, (error: unknown) => {
            recallStatus.textContent = refusalText(error, 'That was not forgotten.');
          });
        },
        (jobId) => {
          /**
           * ADR 0049 mit ADR 0071. Der Austausch, nicht die Notiz daraus. Der
           * Satz sagt, was jetzt gilt, und nennt beim Namen, was *nicht* mit
           * weggeht - sonst liest ihn jemand als "meine Notiz ist auch weg".
           */
          void window.picoCompanion.forgetRecall(jobId).then(() => {
            recallStatus.textContent =
              'Taken back. The question and the answer are gone from here; '
              + 'anything you kept from it stays.';
            refreshRecalls();
          }, (error: unknown) => {
            recallStatus.textContent = refusalText(error, 'That was not taken back.');
          });
        },
      );
    }, () => {
      recallSection.hidden = true;
    });
}

recallForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const privacyDomain = recallDomain.value.trim();
  const question = recallQuestion.value.trim();
  if (privacyDomain === '' || question === '') {
    recallStatus.textContent = 'Name the part of your memory, and what you want to know.';
    return;
  }
  recallStatus.textContent = 'Asking...';
  void window.picoCompanion.askRecall({ privacyDomain, question })
    .then((asked) => {
      // ADR 0119 Q5. What the answer will be formed from, before it exists.
      recallStatus.textContent = asked.omitted === 0
        ? `Asked, over ${asked.included} of your memories.`
        : `Asked, over ${asked.included} of your memories. `
          + `${asked.omitted} did not fit and were left out.`;
      recallQuestion.value = '';
      refreshRecalls();
    }, (error: unknown) => {
      // The refusal as itself: each of them names something to do next.
      recallStatus.textContent = error instanceof Error
        ? error.message.replace(/^Error: /u, '')
        : 'That question did not reach your Home.';
    });
});

/**
 * ADR 0082. The grant a person issues for their own device.
 *
 * Beside the question rather than in a settings page, because the moment a
 * person learns they need one is the moment their question was refused - and
 * the refusal already says which domain it was about.
 */
recallGrant.addEventListener('click', () => {
  const privacyDomain = recallDomain.value.trim();
  if (privacyDomain === '') {
    recallStatus.textContent = 'Name the part of your memory first.';
    return;
  }
  recallStatus.textContent = 'Your Vault will ask you to approve this...';
  void window.picoCompanion.grantDomainRead(privacyDomain)
    .then((granted) => {
      recallStatus.textContent = `This device may now read ${granted.privacyDomain}.`;
    }, (error: unknown) => {
      recallStatus.textContent = error instanceof Error
        ? error.message.replace(/^Error: /u, '')
        : 'Your Home did not record that.';
    });
});

/**
 * ADR 0152. What computes for this person - a setting, so it lives in the
 * settings view and is asked for only when somebody is looking at it.
 *
 * Split from the answered reads on 2026-08-17: the two were fetched together
 * because they were rendered together, and they are not the same kind of
 * thing. One is a standing decision; the other is something waiting for an
 * answer now.
 */
function refreshModelProviders(): void {
  void window.picoCompanion.getModelProviders()
    .then((providers) => {
      renderPicoCompanionModelProviders(
        { list: providerList, section: providerSection, document },
        providers,
        (act) => {
          // Asked again afterwards rather than edited in place, for the reason
          // the keep is: what a Home decided is the Home's answer, and this
          // window's guess about it would be a second one.
          const done = act.action === 'decide'
            ? window.picoCompanion.decideModelProvider({
              entryId: act.entryId,
              providerClass: act.providerClass,
              // ADR 0151 PV1: the narrower allowance is what saying yes
              // yields. The wider one needs a credential and is its own act.
              carries: 'live_turn',
            })
            : act.action === 'widen'
              ? window.picoCompanion.widenModelProvider({
                entryId: act.entryId,
                providerClass: act.providerClass,
              })
              : window.picoCompanion.revokeModelProvider(act.entryId);
          void done.then(refreshModelProviders, refreshModelProviders);
        },
        (entryId) => {
          // The measurement goes with it, so the list is asked for again
          // rather than edited: what is there is the Home's answer.
          void window.picoCompanion.forgetModelProvider(entryId)
            .then(refreshModelProviders, refreshModelProviders);
        },
      );
    }, () => {
      providerSection.hidden = true;
    });
}

/** ADR 0116 W5. What a read produced and nobody has kept: something waiting. */
function refreshAnsweredReads(): void {
  void window.picoCompanion.getAnsweredReads()
    .then((reads) => {
      renderPicoCompanionAnsweredReads(
        { list: readList, section: readSection, document },
        reads,
        (jobId) => {
          // The keep is the write ADR 0116 W5 requires, and the list is asked
          // for again afterwards rather than edited in place: what is waiting
          // is the Home's answer, not this window's guess about it.
          void window.picoCompanion.keepAnsweredRead(jobId).then(refreshAnsweredReads);
        },
      );
    }, () => {
      readSection.hidden = true;
    });
}

/**
 * ADR 0113. Which view the window is in, and the two rules about it.
 *
 * **It never opens into settings.** An occasion came to the person; settings
 * are somewhere they go. So the initial view is `now`, always.
 *
 * **A presentation that wants an answer takes the window back.** Somebody may
 * be halfway through changing a setting when their Vault asks them to approve
 * something, and the approval is the reason this window exists at all. The
 * rule lives in the contract rather than here, so two places reacting to one
 * presentation cannot disagree about it.
 */
function showView(view: PicoCompanionWindowView): void {
  currentView = view;
  nowView.hidden = view !== 'now';
  settingsView.hidden = view !== 'settings';
  for (const button of viewNav.querySelectorAll('button')) {
    button.dataset.current = String(button.dataset.view === view);
  }
  // Only what is being looked at is asked for. The window used to send six
  // reads on every open, four of them for lists a person answering an
  // approval will never see.
  if (view === 'now') {
    refreshRecalls();
    refreshAnsweredReads();
    refreshPendingActions();
  } else {
    refreshModelProviders();
    refreshMeasurements();
    refreshSuppliers();
    refreshModuleConsent();
    refreshDepots();
    refreshDomainReadership();
    refreshHomeMembers();
    refreshDevices();
    refreshRelays();
  }
}

for (const line of picoCompanionWindowViewLines()) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.view = line.view;
  button.textContent = line.label;
  button.title = line.detail;
  button.addEventListener('click', () => showView(line.view));
  viewNav.append(button);
}

showView('now');

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`missing_renderer_element:${id}`);
  }
  return element;
}

function requireButton(id: string): HTMLButtonElement {
  const element = requireElement(id);
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error(`invalid_renderer_button:${id}`);
  }
  return element;
}

function requireCanvas(id: string): HTMLCanvasElement {
  const element = requireElement(id);
  if (!(element instanceof HTMLCanvasElement)) {
    throw new Error(`invalid_renderer_canvas:${id}`);
  }
  return element;
}

function requireInput(id: string): HTMLInputElement {
  const element = requireElement(id);
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`invalid_renderer_input:${id}`);
  }
  return element;
}

function requireSelect(id: string): HTMLSelectElement {
  const element = requireElement(id);
  if (!(element instanceof HTMLSelectElement)) {
    throw new Error(`invalid_renderer_select:${id}`);
  }
  return element;
}
