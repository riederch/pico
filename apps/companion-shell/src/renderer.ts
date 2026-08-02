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
const close = requireButton('close');

function render(value: unknown): void {
  const state: PicoCompanionPresentation = parsePicoCompanionPresentation(value);
  status.dataset.severity = state.severity;
  symbol.textContent = state.symbol;
  title.textContent = state.title;
  body.textContent = state.body;
  scope.hidden = state.kind !== 'pending_recovery';
}

check.addEventListener('click', async () => {
  check.disabled = true;
  try {
    await window.picoCompanion.requestCheck();
  } finally {
    check.disabled = false;
  }
});
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
