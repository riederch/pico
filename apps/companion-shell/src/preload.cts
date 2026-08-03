import { contextBridge, ipcRenderer } from 'electron';

const channels = Object.freeze({
  getPresentation: 'pico:presentation:get',
  presentationChanged: 'pico:presentation:changed',
  requestCheck: 'pico:lifecycle:check',
  vetoRecovery: 'pico:recovery:veto',
  openRecoveryCard: 'pico:recovery-card:open',
  submitRecoveryCard: 'pico:recovery-card:submit',
  decideApproval: 'pico:approval:decide',
  closeWindow: 'pico:window:close',
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
  closeWindow: (): void => {
    ipcRenderer.send(channels.closeWindow);
  },
}));
