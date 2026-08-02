import { contextBridge, ipcRenderer } from 'electron';

const channels = Object.freeze({
  getPresentation: 'pico:presentation:get',
  presentationChanged: 'pico:presentation:changed',
  requestCheck: 'pico:lifecycle:check',
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
  closeWindow: (): void => {
    ipcRenderer.send(channels.closeWindow);
  },
}));
