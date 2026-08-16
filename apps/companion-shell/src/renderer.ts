import {
  parsePicoCompanionPresentation,
  picoCompanionFloorAssurance,
  picoCompanionRelayRevocationLine,
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
} from './model-provider-views.js';

declare global {
  interface Window {
    picoCompanion: Readonly<{
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
      getDevices(): Promise<unknown>;
      switchDevice(
        presenceId: string,
        affordance: string | undefined,
        enabled: boolean,
      ): Promise<void>;
      forgetDevice(presenceId: string): Promise<void>;
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
      beginFirstRun(source: 'camera' | 'typed'): Promise<void>;
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
const floorAssurance = requireElement('floor-assurance');
const check = requireButton('check');
const veto = requireButton('veto');
const recoveryCard = requireButton('recovery-card');
const recoveryCardForm = requireElement('recovery-card-form');
const submitRecoveryCard = requireButton('submit-recovery-card');
const approve = requireButton('approve');
const deny = requireButton('deny');
const firstRun = requireElement('first-run');
const scanCamera = requireButton('scan-camera');
const scanTyped = requireButton('scan-typed');
const close = requireButton('close');

function render(value: unknown): void {
  const state: PicoCompanionPresentation = parsePicoCompanionPresentation(value);
  status.dataset.severity = state.severity;
  symbol.textContent = state.symbol;
  title.textContent = state.title;
  body.textContent = state.body;
  renderConditions(state);
  scope.hidden = state.kind !== 'pending_recovery';
  veto.hidden = state.decision !== 'veto_recovery';
  recoveryCard.hidden = state.kind !== 'idle'
    && state.kind !== 'recovery_card_printed';
  recoveryCardForm.hidden = state.decision !== 'recovery_card_details';
  approve.hidden = state.decision !== 'approve_or_deny';
  deny.hidden = state.decision !== 'approve_or_deny';
  firstRun.hidden = state.decision !== 'begin_first_run';
  check.hidden = state.kind === 'recovery_card_setup'
    || state.kind === 'secure_input'
    || state.kind === 'approval'
    || state.kind === 'first_run'
    || state.kind === 'starting';
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
    label.textContent = conditionLabels[condition.kind];
    const remedy = document.createElement('span');
    remedy.className = 'condition-remedy';
    remedy.textContent = condition.remedy;
    row.append(label, remedy);
    conditions.append(row);
  }
  floorAssurance.textContent = picoCompanionFloorAssurance();
}

const conditionLabels: Record<PicoCompanionCondition['kind'], string> = {
  no_network: 'No network',
  no_model: 'No model',
  storage_reserved: 'Storage is running low',
  storage_exhausted: 'Storage is full',
};

async function beginFirstRun(source: 'camera' | 'typed'): Promise<void> {
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
const deviceSection = requireElement('devices');
const deviceList = requireElement('device-list');
const deviceStatus = requireElement('device-status');

/**
 * ADR 0126 P2/P6. The person's devices, and their word about each one.
 *
 * Fails quietly like its neighbours (ADR 0118 O4): not knowing which devices
 * you have is an absence, and an absence must not render a working thing as
 * broken. What a person pressed always answers.
 */
function refreshDevices(): void {
  void window.picoCompanion.getDevices()
    .then((devices) => {
      renderPicoCompanionDevices(
        { list: deviceList, section: deviceSection, document },
        devices,
        (action) => {
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
      );
    }, () => {
      deviceSection.hidden = true;
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

function refusalText(error: unknown, fallback: string): string {
  return error instanceof Error
    ? error.message.replace(/^Error: /u, '')
    : fallback;
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

function refreshModelViews(): void {
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
          void done.then(refreshModelViews, refreshModelViews);
        },
      );
    }, () => {
      providerSection.hidden = true;
    });
  void window.picoCompanion.getAnsweredReads()
    .then((reads) => {
      renderPicoCompanionAnsweredReads(
        { list: readList, section: readSection, document },
        reads,
        (jobId) => {
          // The keep is the write ADR 0116 W5 requires, and the list is asked
          // for again afterwards rather than edited in place: what is waiting
          // is the Home's answer, not this window's guess about it.
          void window.picoCompanion.keepAnsweredRead(jobId).then(refreshModelViews);
        },
      );
    }, () => {
      readSection.hidden = true;
    });
}

refreshModelViews();
refreshRecalls();
refreshDevices();
refreshRelays();

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
