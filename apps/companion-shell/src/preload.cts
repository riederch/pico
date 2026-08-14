import { contextBridge, ipcRenderer } from 'electron';

const channels = Object.freeze({
  getPresentation: 'pico:presentation:get',
  presentationChanged: 'pico:presentation:changed',
  requestCheck: 'pico:lifecycle:check',
  vetoRecovery: 'pico:recovery:veto',
  openRecoveryCard: 'pico:recovery-card:open',
  submitRecoveryCard: 'pico:recovery-card:submit',
  decideApproval: 'pico:approval:decide',
  beginFirstRun: 'pico:first-run:begin',
  closeWindow: 'pico:window:close',
  getModelProviders: 'pico:model-providers:get',
  decideModelProvider: 'pico:model-provider:decide',
  revokeModelProvider: 'pico:model-provider:revoke',
  getAnsweredReads: 'pico:model-reads:get',
  keepAnsweredRead: 'pico:model-read:keep',
});

// No generic send/invoke and no raw ipcRenderer: this is the whole bridge.
contextBridge.exposeInMainWorld('picoCompanion', Object.freeze({
  getPresentation: async (): Promise<unknown> =>
    await ipcRenderer.invoke(channels.getPresentation),
  onPresentationChanged: (listener: (state: unknown) => void): (() => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, state: unknown): void => {
      listener(state);
    };
    ipcRenderer.on(channels.presentationChanged, wrapped);
    return () => ipcRenderer.removeListener(channels.presentationChanged, wrapped);
  },
  requestCheck: async (): Promise<void> => {
    await ipcRenderer.invoke(channels.requestCheck);
  },
  vetoRecovery: async (): Promise<void> => {
    await ipcRenderer.invoke(channels.vetoRecovery);
  },
  openRecoveryCard: async (): Promise<void> => {
    await ipcRenderer.invoke(channels.openRecoveryCard);
  },
  submitRecoveryCard: async (details: unknown): Promise<void> => {
    await ipcRenderer.invoke(channels.submitRecoveryCard, details);
  },
  decideApproval: async (approved: boolean): Promise<void> => {
    await ipcRenderer.invoke(channels.decideApproval, approved);
  },
  // Only the source travels. The card, its PIN and the passphrase are
  // collected in the main process and never cross this bridge.
  beginFirstRun: async (source: string): Promise<void> => {
    await ipcRenderer.invoke(channels.beginFirstRun, source);
  },
  // ADR 0152. Three narrow calls: a read, a decision and a withdrawal. No
  // credential crosses this bridge - a reference to one does, and the
  // credential itself stays under ADR 0138 CO1 custody where it was put.
  getModelProviders: async (): Promise<unknown> =>
    await ipcRenderer.invoke(channels.getModelProviders),
  decideModelProvider: async (decision: unknown): Promise<void> => {
    await ipcRenderer.invoke(channels.decideModelProvider, decision);
  },
  revokeModelProvider: async (entryId: string): Promise<void> => {
    await ipcRenderer.invoke(channels.revokeModelProvider, entryId);
  },
  getAnsweredReads: async (): Promise<unknown> =>
    await ipcRenderer.invoke(channels.getAnsweredReads),
  keepAnsweredRead: async (jobId: string): Promise<void> => {
    await ipcRenderer.invoke(channels.keepAnsweredRead, jobId);
  },
  closeWindow: (): void => {
    ipcRenderer.send(channels.closeWindow);
  },
}));
