import {
  parsePicoCompanionPresentation,
  picoCompanionFloorAssurance,
  picoCompanionModelProviderLines,
  parsePicoCompanionModelProviders,
  type PicoCompanionCondition,
  type PicoCompanionPresentation,
} from './contract.js';

declare global {
  interface Window {
    picoCompanion: Readonly<{
      getModelProviders(): Promise<unknown>;
      decideModelProvider(decision: {
        entryId: string;
        providerClass: string;
        carries: string;
      }): Promise<void>;
      revokeModelProvider(entryId: string): Promise<void>;
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

/**
 * ADR 0152 SE1/SE5 on the device.
 *
 * The renderer chooses no words. It prints what
 * `picoCompanionModelProviderLines` decided, with `textContent` throughout -
 * a model identifier arrives from a Home over a Link reply, which makes it
 * exactly the sort of string that must never become markup.
 */
export function renderPicoCompanionModelProviders(
  root: { list: HTMLElement; section: HTMLElement; document: Document },
  value: unknown,
): void {
  const providers = parsePicoCompanionModelProviders(value);
  root.section.hidden = providers.length === 0;
  root.list.replaceChildren();
  const lines = picoCompanionModelProviderLines(providers);
  for (const [index, line] of lines.entries()) {
    const item = root.document.createElement('li');
    item.className = 'provider-line';
    item.dataset.entryId = line.entryId;
    item.dataset.action = line.action;

    const headline = root.document.createElement('p');
    headline.className = 'headline';
    headline.textContent = line.headline;

    const detail = root.document.createElement('p');
    detail.className = 'detail';
    detail.textContent = line.detail;

    // SE3. The measurement is visible and not editable here, with the moment
    // it was taken - an entry measured months ago is a claim rather than a
    // finding, and only the date says which.
    const measured = root.document.createElement('p');
    measured.className = 'measured';
    measured.textContent = `${providers[index]!.contextTokens} tokens of context, `
      + `measured ${providers[index]!.measuredAt.slice(0, 10)}`;

    item.append(headline, detail, measured);
    root.list.append(item);
  }
}
