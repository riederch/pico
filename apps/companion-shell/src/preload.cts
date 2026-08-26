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
  beginFounding: 'pico:founding:begin',
  closeWindow: 'pico:window:close',
  getModelProviders: 'pico:model-providers:get',
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
  forgetRecall: 'pico:recall:forget',
  forgetMemory: 'pico:memory:forget',
  getSuppliers: 'pico:suppliers:get',
  decideSupplierReach: 'pico:supplier-reach:decide',
  attachSupplier: 'pico:supplier:attach',
  detachSupplier: 'pico:supplier:detach',
  detachDepot: 'pico:depot:detach',
  forgetModelProvider: 'pico:model-provider:forget',
  getDepots: 'pico:depots:get',
  attachDepot: 'pico:depot:attach',
  decideDepotReach: 'pico:depot-reach:decide',
  fetchDepotsNow: 'pico:depot-fetch:ask',
  acceptDepotOffer: 'pico:depot-offer:accept',
  createReaderCustodySpace: 'pico:reader-custody:create',
  writeReaderCustodyNote: 'pico:reader-custody:write',
  decideRule: 'pico:rule:decide',
  forgetRule: 'pico:rule:forget',
  getPendingActions: 'pico:pending-actions:get',
  resolvePendingAction: 'pico:pending-action:resolve',
  getModuleConsent: 'pico:module-consent:get',
  recordModuleConsent: 'pico:module-consent:record',
  getDevices: 'pico:devices:get',
  switchDevice: 'pico:device:switch',
  forgetDevice: 'pico:device:forget',
  joinFromDevice: 'pico:enrolment:join',
  beginEnrolment: 'pico:enrolment:begin',
  getDomainReadership: 'pico:domain-readership:get',
  endDomainRead: 'pico:domain-read:end',
  getHomeMembers: 'pico:home-members:get',
  admitHomeMember: 'pico:home-member:admit',
  endHomeMembership: 'pico:home-member:end',
  rotateHostKeys: 'pico:home-host-keys:rotate',
  getEnrolmentHints: 'pico:enrolment-hints:get',
  getDeviceAuthority: 'pico:device-authority:get',
  renewDeviceAuthority: 'pico:device-authority:renew',
  renewOtherDevice: 'pico:device-authority:renew-other',
  renewFromOtherDevice: 'pico:device-authority:renew-mine',
  endDeviceAuthority: 'pico:device-authority:end',
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
  askModelProviderMeasurement: async (
    reach: string,
    model: string,
    provesItself: boolean,
  ): Promise<unknown> =>
    await ipcRenderer.invoke(
      channels.askModelProviderMeasurement,
      { reach, model, provesItself },
    ),
  getModelProviderMeasurements: async (): Promise<unknown> =>
    await ipcRenderer.invoke(channels.getModelProviderMeasurements),
  forgetMemory: async (memoryItemId: string): Promise<void> => {
    await ipcRenderer.invoke(channels.forgetMemory, memoryItemId);
  },
  beginFounding: async (): Promise<void> => {
    await ipcRenderer.invoke(channels.beginFounding);
  },
  getSuppliers: async (): Promise<unknown> => await ipcRenderer.invoke(channels.getSuppliers),
  decideSupplierReach: async (
    identifier: string,
    mayReachOutside: boolean,
    mayReachUnasked: boolean,
  ): Promise<void> => {
    await ipcRenderer.invoke(channels.decideSupplierReach, {
      identifier,
      mayReachOutside,
      mayReachUnasked,
    });
  },
  attachSupplier: async (identifier: string, privacyDomain: string): Promise<unknown> =>
    await ipcRenderer.invoke(channels.attachSupplier, { identifier, privacyDomain }),
  detachSupplier: async (identifier: string): Promise<void> => {
    await ipcRenderer.invoke(channels.detachSupplier, identifier);
  },
  detachDepot: async (remote: string): Promise<void> => {
    await ipcRenderer.invoke(channels.detachDepot, remote);
  },
  acceptDepotOffer: async (
    remote: string,
    acceptedCommit: string,
  ): Promise<void> => {
    await ipcRenderer.invoke(channels.acceptDepotOffer, remote, acceptedCommit);
  },
  decideRule: async (
    effectName: string,
    privacyDomain: string,
    decision: string,
  ): Promise<void> => {
    await ipcRenderer.invoke(channels.decideRule, effectName, privacyDomain, decision);
  },
  forgetRule: async (effectName: string, privacyDomain: string): Promise<void> => {
    await ipcRenderer.invoke(channels.forgetRule, effectName, privacyDomain);
  },
  createReaderCustodySpace: async (): Promise<void> => {
    await ipcRenderer.invoke(channels.createReaderCustodySpace);
  },
  writeReaderCustodyNote: async (text: string): Promise<unknown> =>
    await ipcRenderer.invoke(channels.writeReaderCustodyNote, text),
  forgetModelProvider: async (entryId: string): Promise<void> => {
    await ipcRenderer.invoke(channels.forgetModelProvider, entryId);
  },
  getDepots: async (): Promise<unknown> => await ipcRenderer.invoke(channels.getDepots),
  attachDepot: async (remote: string, commit: string): Promise<unknown> =>
    await ipcRenderer.invoke(channels.attachDepot, { remote, commit }),
  decideDepotReach: async (
    remote: string,
    mayFetch: boolean,
    mayFetchUnasked: boolean,
  ): Promise<void> => {
    await ipcRenderer.invoke(channels.decideDepotReach, { remote, mayFetch, mayFetchUnasked });
  },
  /**
   * ADR 0143 DP8. *Fetch now*. Takes nothing: which depots are due is the
   * Home's to decide, and the presence session is the shell's to assert.
   */
  fetchDepotsNow: async (): Promise<unknown> =>
    await ipcRenderer.invoke(channels.fetchDepotsNow),
  getPendingActions: async (): Promise<unknown> =>
    await ipcRenderer.invoke(channels.getPendingActions),
  resolvePendingAction: async (
    requestedEventId: string,
    approved: boolean,
  ): Promise<unknown> =>
    await ipcRenderer.invoke(channels.resolvePendingAction, { requestedEventId, approved }),
  getModuleConsent: async (): Promise<unknown> =>
    await ipcRenderer.invoke(channels.getModuleConsent),
  recordModuleConsent: async (identifier: string): Promise<void> => {
    await ipcRenderer.invoke(channels.recordModuleConsent, identifier);
  },
  getDevices: async (): Promise<unknown> => await ipcRenderer.invoke(channels.getDevices),
  switchDevice: async (
    presenceId: string,
    affordance: string | undefined,
    enabled: boolean,
  ): Promise<void> => {
    await ipcRenderer.invoke(channels.switchDevice, { presenceId, affordance, enabled });
  },
  forgetDevice: async (presenceId: string): Promise<void> => {
    await ipcRenderer.invoke(channels.forgetDevice, presenceId);
  },
  joinFromDevice: async (source: string): Promise<void> => {
    await ipcRenderer.invoke(channels.joinFromDevice, source);
  },
  beginEnrolment: async (source: string): Promise<void> => {
    await ipcRenderer.invoke(channels.beginEnrolment, source);
  },
  getDomainReadership: async (): Promise<unknown> =>
    await ipcRenderer.invoke(channels.getDomainReadership),
  endDomainRead: async (request: unknown): Promise<unknown> =>
    await ipcRenderer.invoke(channels.endDomainRead, request),
  getHomeMembers: async (): Promise<unknown> =>
    await ipcRenderer.invoke(channels.getHomeMembers),
  admitHomeMember: async (): Promise<unknown> =>
    await ipcRenderer.invoke(channels.admitHomeMember),
  endHomeMembership: async (
    credentialId: string,
    picoIdentityFingerprintHex: string,
    ending: string,
  ): Promise<unknown> => await ipcRenderer.invoke(
    channels.endHomeMembership,
    { credentialId, picoIdentityFingerprintHex, ending },
  ),
  rotateHostKeys: async (reason: string): Promise<unknown> =>
    await ipcRenderer.invoke(channels.rotateHostKeys, reason),
  getEnrolmentHints: async (): Promise<unknown> =>
    await ipcRenderer.invoke(channels.getEnrolmentHints),
  getDeviceAuthority: async (): Promise<unknown> =>
    await ipcRenderer.invoke(channels.getDeviceAuthority),
  renewDeviceAuthority: async (): Promise<unknown> =>
    await ipcRenderer.invoke(channels.renewDeviceAuthority),
  renewOtherDevice: async (source: string): Promise<void> => {
    await ipcRenderer.invoke(channels.renewOtherDevice, source);
  },
  renewFromOtherDevice: async (source: string): Promise<void> => {
    await ipcRenderer.invoke(channels.renewFromOtherDevice, source);
  },
  endDeviceAuthority: async (delegationId: string, reason: string): Promise<unknown> =>
    await ipcRenderer.invoke(channels.endDeviceAuthority, { delegationId, reason }),
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
  forgetRecall: async (jobId: string): Promise<void> => {
    await ipcRenderer.invoke(channels.forgetRecall, jobId);
  },
  keepRecall: async (jobId: string): Promise<void> => {
    await ipcRenderer.invoke(channels.keepRecall, jobId);
  },
  closeWindow: (): void => {
    ipcRenderer.send(channels.closeWindow);
  },
}));
