import {
  parsePicoCompanionPresentation,
  type PicoCompanionPresentation,
} from './contract.js';

declare global {
  interface Window {
    picoCompanion: Readonly<{
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
