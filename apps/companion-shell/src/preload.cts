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
  widenModelProvider: 'pico:model-provider:widen',
  revokeModelProvider: 'pico:model-provider:revoke',
  getAnsweredReads: 'pico:model-reads:get',
  keepAnsweredRead: 'pico:model-read:keep',
  askRecall: 'pico:recall:ask',
  getRecalls: 'pico:recalls:get',
  grantDomainRead: 'pico:domain-read-grant:issue',
  keepRecall: 'pico:recall:keep',
  getRelays: 'pico:relays:get',
  claimRelay: 'pico:relay:claim',
  createRelayAccount: 'pico:relay-account:create',
  revokeRelayAccount: 'pico:relay-account:revoke',
  forgetRelay: 'pico:relay:forget',
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
  // ADR 0152. Four narrow calls: a read, a decision, a widening and a
  // withdrawal. **No credential crosses this bridge**, and the widening is
  // what would have broken that: the secret is typed into the main process
  // through ADR 0113's keystroke capture, so what travels here is the entry
  // and the declaration being confirmed. The credential itself stays under
  // ADR 0138 CO1 custody where it was put.
  getModelProviders: async (): Promise<unknown> =>
    await ipcRenderer.invoke(channels.getModelProviders),
  decideModelProvider: async (decision: unknown): Promise<void> => {
    await ipcRenderer.invoke(channels.decideModelProvider, decision);
  },
  widenModelProvider: async (widening: unknown): Promise<void> => {
    await ipcRenderer.invoke(channels.widenModelProvider, widening);
  },
  revokeModelProvider: async (entryId: string): Promise<void> => {
    await ipcRenderer.invoke(channels.revokeModelProvider, entryId);
  },
  getAnsweredReads: async (): Promise<unknown> =>
    await ipcRenderer.invoke(channels.getAnsweredReads),
  keepAnsweredRead: async (jobId: string): Promise<void> => {
    await ipcRenderer.invoke(channels.keepAnsweredRead, jobId);
  },
  // ADR 0116 W1. A question and its answers. Content rather than a secret:
  // what a person types here is the thing they are asking about, and it goes
  // to their own Home over the sealed channel.
  askRecall: async (ask: unknown): Promise<unknown> =>
    await ipcRenderer.invoke(channels.askRecall, ask),
  getRecalls: async (): Promise<unknown> =>
    await ipcRenderer.invoke(channels.getRecalls),
  // ADR 0082. A domain name and nothing else: the signature is made in the
  // main process from the key the Vault holds, and the statement it signs is
  // built there too.
  grantDomainRead: async (privacyDomain: string): Promise<unknown> =>
    await ipcRenderer.invoke(channels.grantDomainRead, privacyDomain),
  getRelays: async (): Promise<unknown> => await ipcRenderer.invoke(channels.getRelays),
  claimRelay: async (baseUrl: string, claimCode: string): Promise<unknown> =>
    await ipcRenderer.invoke(channels.claimRelay, { baseUrl, claimCode }),
  createRelayAccount: async (
    baseUrl: string,
    mailboxQuota: number,
    maxCapacity: number,
  ): Promise<unknown> =>
    await ipcRenderer.invoke(channels.createRelayAccount, {
      baseUrl,
      mailboxQuota,
      maxCapacity,
    }),
  revokeRelayAccount: async (baseUrl: string, accountRef: string): Promise<unknown> =>
    await ipcRenderer.invoke(channels.revokeRelayAccount, { baseUrl, accountRef }),
  forgetRelay: async (baseUrl: string): Promise<void> => {
    await ipcRenderer.invoke(channels.forgetRelay, baseUrl);
  },
  keepRecall: async (jobId: string): Promise<void> => {
    await ipcRenderer.invoke(channels.keepRecall, jobId);
  },
  closeWindow: (): void => {
    ipcRenderer.send(channels.closeWindow);
  },
}));
