import {
  picoCompanionModelProviderLines,
  parsePicoCompanionModelProviders,
  picoCompanionMeasurementLines,
  parsePicoCompanionMeasurements,
  picoCompanionAnsweredReadLines,
  parsePicoCompanionAnsweredReads,
  picoCompanionRecallLines,
  parsePicoCompanionRecalls,
  picoCompanionRelayLines,
  picoCompanionRelayAccountIssued,
  parsePicoCompanionRelays,
  picoCompanionDeviceLines,
  picoCompanionDomainReadershipLines,
  picoCompanionDomainReadershipSummary,
  picoCompanionHomeMemberLines,
  picoCompanionReaderRevocationReasonLines,
  type PicoCompanionReaderRevocationReasonLine,
  picoCompanionHomeMembersSummary,
  picoCompanionMembershipEndingLines,
  type PicoCompanionMembershipEndingLine,
  parsePicoCompanionDomainReadership,
  parsePicoCompanionHomeMembers,
  picoCompanionDeviceAuthorityLines,
  picoCompanionDeviceAuthoritySummary,
  picoCompanionDeviceRevocationReasonLines,
  parsePicoCompanionDeviceAuthority,
  type PicoCompanionDeviceAuthorityLine,
  type PicoCompanionDeviceRevocationReasonLine,
  parsePicoCompanionDevices,
  picoCompanionSupplierLines,
  parsePicoCompanionSuppliers,
  picoCompanionDeclaredSupplierLines,
  parsePicoCompanionDeclaredSuppliers,
  picoCompanionDepotLines,
  parsePicoCompanionDepots,
  parsePicoCompanionUnattendedFetching,
  picoCompanionUnattendedFetchingLine,
  picoCompanionModuleConsentLines,
  parsePicoCompanionModuleConsent,
  picoCompanionApprovalLines,
  parsePicoCompanionPendingApprovals,
} from './contract.js';

/**
 * ADR 0152 SE1/SE5 and ADR 0116 W5 - what a line looks like, apart from the
 * page it lives on.
 *
 * Split out of `renderer.ts` on 2026-08-15 for a reason a test found: that
 * file reaches for the real document as it loads, so nothing in it could be
 * rendered into a document a test provides. "The control exists" and "the
 * control is on the line" were two different claims and only the first could
 * be checked - which is how a decision surface that could not decide went
 * unnoticed.
 *
 * These take their document as an argument and hold no page state, so what
 * they put on a line is readable rather than inferred.
 */

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
  /**
   * ADR 0152 SE2. What the one control on each line does.
   *
   * Passed in rather than reached for, so this function stays the thing that
   * prints and the caller stays the thing that talks to a Home - and a test
   * can hold both apart.
   */
  act: (input: {
    action: 'decide' | 'widen' | 'revoke';
    entryId: string;
    providerClass: string;
  }) => void,
  /** ADR 0142 PE1. The other axis: a machine they no longer have. */
  forget?: (entryId: string) => void,
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
      + `measured ${providers[index]!.measuredDisplay}`;

    // ADR 0152 SE2. The decision is *here*, on the line that states its
    // consequence - not behind a menu, and never more than one thing to press.
    const button = root.document.createElement('button');
    button.type = 'button';
    button.textContent = line.actionLabel;
    button.addEventListener('click', () => {
      act({
        action: line.action,
        entryId: line.entryId,
        providerClass: line.providerClass,
      });
    });

    item.append(headline, detail, measured, button);

    /**
     * The other axis, last. ADR 0152 SE2's "never more than one thing to
     * press" is about the decision - what this machine may see - and offering
     * two of those at once is what asks a person to work out which applies.
     * Forgetting the machine ends what the decision is about.
     */
    if (forget !== undefined) {
      const forgetButton = root.document.createElement('button');
      forgetButton.type = 'button';
      forgetButton.textContent = line.forgetActionLabel;
      forgetButton.addEventListener('click', () => forget(line.entryId));
      item.append(forgetButton);
    }

    root.list.append(item);
  }
}

/**
 * ADR 0116 W5 on the device. A list of things waiting, and a button each.
 *
 * The button is the whole point: nothing here persists, and the person's press
 * is the write. Every string comes from `picoCompanionAnsweredReadLines`, so
 * what this window may say is decided somewhere a test can reach.
 */
export function renderPicoCompanionAnsweredReads(
  root: { list: HTMLElement; section: HTMLElement; document: Document },
  value: unknown,
  keep: (jobId: string) => void,
): void {
  const reads = parsePicoCompanionAnsweredReads(value);
  root.section.hidden = reads.length === 0;
  root.list.replaceChildren();
  for (const line of picoCompanionAnsweredReadLines(reads)) {
    const item = root.document.createElement('li');
    item.className = 'provider-line';
    item.dataset.jobId = line.jobId;

    const headline = root.document.createElement('p');
    headline.className = 'headline';
    headline.textContent = line.headline;

    const detail = root.document.createElement('p');
    detail.className = 'detail';
    detail.textContent = line.detail;

    const button = root.document.createElement('button');
    button.type = 'button';
    button.textContent = 'Keep this';
    button.addEventListener('click', () => {
      keep(line.jobId);
    });

    item.append(headline, detail, button);
    root.list.append(item);
  }
}

/**
 * ADR 0116 W1 with ADR 0117 X5. A question, its state, and a labelled answer.
 *
 * **The answer never appears without its label**, and the two are appended
 * together for the reason X5 gives: a labelling step somebody must remember is
 * one somebody will forget, and forgetting it here would let a sentence a
 * model composed read as a fact this Home holds.
 *
 * `textContent` throughout. The answer is a model's prose about a person's
 * notes, which makes it exactly the string that must never become markup.
 */
export function renderPicoCompanionRecalls(
  root: { list: HTMLElement; section: HTMLElement; document: Document },
  value: unknown,
  /** ADR 0116 W5. The press *is* the write; nothing persists without it. */
  keep: (jobId: string) => void,
  /** ADR 0071. The press *is* the deletion, on the line that made the memory. */
  forget?: (memoryItemId: string) => void,
  /**
   * ADR 0049 mit ADR 0071. Nimmt den Austausch zurück - Frage und Antwort -,
   * und lässt eine daraus behaltene Notiz stehen.
   *
   * **Zuletzt, und das ist keine Stilfrage.** Beide Rückrufe daneben haben die
   * Form `(id: string) => void`, also hätte ein neuer Platz vor `forget` jeden
   * bestehenden Aufrufer stillschweigend umgedeutet: sein Vergessen wäre zum
   * Zurücknehmen geworden, typgeprüft und falsch. Ein Test hat es hier
   * gefunden; im Fenster wäre es ein Knopf gewesen, der etwas anderes tut, als
   * er sagt.
   */
  takeBack?: (jobId: string) => void,
): void {
  const recalls = parsePicoCompanionRecalls(value);
  root.list.replaceChildren();
  for (const line of picoCompanionRecallLines(recalls)) {
    const item = root.document.createElement('li');
    item.className = 'provider-line';
    item.dataset.jobId = line.jobId;

    const question = root.document.createElement('p');
    question.className = 'headline';
    question.textContent = line.question;

    const state = root.document.createElement('p');
    state.className = 'detail';
    state.textContent = line.state;

    item.append(question, state);

    if (line.answer !== undefined) {
      const label = root.document.createElement('p');
      label.className = 'measured';
      label.textContent = line.answer.label;

      const answer = root.document.createElement('p');
      answer.className = 'detail';
      answer.textContent = line.answer.text;

      // The label first: a person who reads the answer and scrolls away has
      // already been told what it is.
      item.append(label, answer);
    }

    if (line.keepable === true) {
      const button = root.document.createElement('button');
      button.type = 'button';
      button.textContent = 'Keep this answer';
      button.addEventListener('click', () => {
        keep(line.jobId);
      });
      item.append(button);
    }

    /**
     * ADR 0049 mit ADR 0071, seit 2026-08-25. **Neben allem anderen erlaubt**,
     * anders als Behalten und Vergessen zueinander: den Austausch
     * zurückzunehmen ist eine dritte Sache, die eine Person auch zusätzlich
     * wollen kann - die Notiz behalten und den Chat loswerden ist genau der
     * Fall, für den es diesen Knopf gibt.
     *
     * Der Satz nennt das Zurückgenommene und nicht die Handlung: „diesen
     * Austausch zurücknehmen" sagt, was verschwindet, während „löschen" eine
     * Person fragen ließe, was alles.
     */
    if (line.takeBackable === true && takeBack !== undefined) {
      const button = root.document.createElement('button');
      button.type = 'button';
      button.className = 'secondary';
      button.textContent = 'Take this exchange back';
      button.addEventListener('click', () => {
        takeBack(line.jobId);
      });
      item.append(button);
    }

    /**
     * ADR 0071. Never beside the keep control - an answer is kept or it is
     * not, so exactly one of the two is on a line. Two would ask a person to
     * work out which applies to the state in front of them.
     */
    if (line.forgettable !== undefined && forget !== undefined) {
      const button = root.document.createElement('button');
      button.type = 'button';
      button.textContent = line.forgettable.label;
      const forgettable = line.forgettable;
      button.addEventListener('click', () => {
        forget(forgettable.memoryItemId);
      });
      item.append(button);
    }

    root.list.append(item);
  }
}

/**
 * ADR 0154 on the device - the relays this person operates.
 *
 * **The one control that shows a secret**, and it is written to be read once:
 * the access key an account creation returns exists nowhere else, so it goes
 * into an element the person can copy and is never fetched again. Everything
 * else here is a handle, a count and a state.
 */
export function renderPicoCompanionRelays(
  root: { list: HTMLElement; section: HTMLElement; document: Document },
  value: unknown,
  act: (input:
    | { action: 'create'; baseUrl: string }
    | { action: 'revoke'; baseUrl: string; accountRef: string }
    | { action: 'forget'; baseUrl: string }) => void,
): void {
  const relays = parsePicoCompanionRelays(value);
  root.section.hidden = relays.length === 0;
  root.list.replaceChildren();

  for (const line of picoCompanionRelayLines(relays)) {
    const item = root.document.createElement('li');
    item.className = 'relay-line';
    item.dataset.baseUrl = line.baseUrl;

    const headline = root.document.createElement('p');
    headline.className = 'headline';
    headline.textContent = line.headline;

    const detail = root.document.createElement('p');
    detail.className = 'detail';
    detail.textContent = line.detail;

    const create = root.document.createElement('button');
    create.type = 'button';
    create.textContent = line.actionLabel;
    create.addEventListener('click', () => act({ action: 'create', baseUrl: line.baseUrl }));

    const accounts = root.document.createElement('ul');
    accounts.className = 'relay-accounts';
    for (const account of line.accounts) {
      const accountItem = root.document.createElement('li');
      accountItem.className = 'relay-account';
      accountItem.dataset.accountRef = account.accountRef;

      const accountHeadline = root.document.createElement('p');
      accountHeadline.className = 'headline';
      accountHeadline.textContent = account.headline;

      const accountDetail = root.document.createElement('p');
      accountDetail.className = 'detail';
      accountDetail.textContent = account.detail;

      accountItem.append(accountHeadline, accountDetail);
      if (account.revokable) {
        const revoke = root.document.createElement('button');
        revoke.type = 'button';
        revoke.textContent = 'Withdraw this key';
        revoke.addEventListener('click', () => act({
          action: 'revoke',
          baseUrl: line.baseUrl,
          accountRef: account.accountRef,
        }));
        accountItem.append(revoke);
      }
      accounts.append(accountItem);
    }

    const forget = root.document.createElement('button');
    forget.type = 'button';
    forget.className = 'quiet';
    // Said as what it costs. ADR 0154 RO8: this drops the only copy of the
    // credential, and the way back in is a file on the relay's disk.
    forget.textContent = 'Forget this relay on this device';
    forget.addEventListener('click', () => act({ action: 'forget', baseUrl: line.baseUrl }));

    item.append(headline, detail, create, accounts, forget);
    root.list.append(item);
  }
}

/**
 * ADR 0154 RO3. The access key, shown once because it exists once.
 *
 * Rendered as its own block rather than into the list: nothing stores it, so
 * a redraw of the list would take it away, and a person who has not copied it
 * yet would have to withdraw the key and issue another.
 */
export function renderPicoCompanionRelayAccountIssued(
  root: { block: HTMLElement; document: Document },
  credential: string,
): void {
  const issued = picoCompanionRelayAccountIssued(credential);
  root.block.replaceChildren();
  root.block.hidden = false;

  const headline = root.document.createElement('p');
  headline.className = 'headline';
  headline.textContent = issued.headline;

  const detail = root.document.createElement('p');
  detail.className = 'detail';
  detail.textContent = issued.detail;

  const value = root.document.createElement('code');
  value.className = 'relay-access-key';
  value.textContent = issued.credential;

  root.block.append(headline, detail, value);
}

/**
 * ADR 0126 P2/P6 on the device - the person's own devices, and the switches.
 *
 * Every string comes from `picoCompanionDeviceLines`, including the button
 * labels. A control labelled in the renderer would be the one sentence in this
 * surface no test could hold to anything, and it is the sentence a person
 * actually acts on.
 */
export function renderPicoCompanionDevices(
  root: {
    list: HTMLElement;
    section: HTMLElement;
    document: Document;
    /** ADR 0130 E3. Where the one sentence about the whole set goes. */
    summary?: HTMLElement;
  },
  value: unknown,
  act: (input:
    | { action: 'switch'; presenceId: string; affordance?: string; enabled: boolean }
    | { action: 'forget'; presenceId: string }
    | {
      action: 'end-authority';
      presenceId: string;
      delegationId: string;
      reason: PicoCompanionDeviceRevocationReasonLine['reason'];
    }) => void,
  /**
   * ADR 0130 E3. What the Home still answers to, when that read came back.
   *
   * `undefined` is the read having failed, and the rows then say nothing
   * about authority at all. That is the whole reason it is a separate
   * argument: an empty view and a failed read would otherwise both render as
   * a device with no authority, and one of those is a lie about a device that
   * can still act as the person.
   */
  authority?: unknown,
  /** ADR 0104. Another year for this device; absent where it cannot be done. */
  renew?: () => void,
  /** ADR 0130 E3. The same year, asked of the device that added this one. */
  renewFromOther?: () => void,
): void {
  const devices = parsePicoCompanionDevices(value);
  const view = authority === undefined
    ? null
    : parsePicoCompanionDeviceAuthority(authority);
  const authorityLines = view === null ? [] : picoCompanionDeviceAuthorityLines(view);
  const unplaced = new Map(authorityLines.map((line) => [line.presenceId, line]));
  root.section.hidden = devices.length === 0 && authorityLines.length === 0;
  root.list.replaceChildren();
  if (root.summary !== undefined) {
    root.summary.textContent = view === null ? '' : picoCompanionDeviceAuthoritySummary(view);
    root.summary.hidden = view === null;
  }

  for (const line of picoCompanionDeviceLines(devices)) {
    const item = root.document.createElement('li');
    item.className = 'device-line';
    item.dataset.presenceId = line.presenceId;

    const headline = root.document.createElement('p');
    headline.className = 'headline';
    headline.textContent = line.headline;

    const detail = root.document.createElement('p');
    detail.className = 'detail';
    detail.textContent = line.detail;

    const offers = root.document.createElement('ul');
    offers.className = 'device-offers';
    for (const offer of line.offers) {
      const offerItem = root.document.createElement('li');
      offerItem.className = 'device-offer';
      offerItem.dataset.affordance = offer.affordance;
      offerItem.dataset.withheld = String(offer.withheld);

      const offerHeadline = root.document.createElement('p');
      offerHeadline.className = 'detail';
      offerHeadline.textContent = offer.headline;

      const toggle = root.document.createElement('button');
      toggle.type = 'button';
      toggle.textContent = offer.actionLabel;
      toggle.addEventListener('click', () => act({
        action: 'switch',
        presenceId: line.presenceId,
        affordance: offer.affordance,
        enabled: offer.withheld,
      }));

      offerItem.append(offerHeadline, toggle);
      offers.append(offerItem);
    }

    // The whole-device switch, beside the per-affordance ones rather than
    // among them: "not this device" is a different statement, and it keeps
    // meaning that after the device gains something new.
    const deviceToggle = root.document.createElement('button');
    deviceToggle.type = 'button';
    deviceToggle.textContent = line.deviceActionLabel;
    deviceToggle.addEventListener('click', () => act({
      action: 'switch',
      presenceId: line.presenceId,
      enabled: line.deviceActionLabel.startsWith('Use'),
    }));

    const forget = root.document.createElement('button');
    forget.type = 'button';
    forget.className = 'quiet';
    forget.textContent = line.forgetLabel;
    forget.addEventListener('click', () => act({ action: 'forget', presenceId: line.presenceId }));

    item.append(headline, detail, offers, deviceToggle, forget);
    const authorityLine = unplaced.get(line.presenceId);
    if (authorityLine !== undefined) {
      unplaced.delete(line.presenceId);
      item.append(deviceAuthorityBlock(root.document, authorityLine, act, renew, renewFromOther));
    }
    root.list.append(item);
  }

  /**
   * ADR 0130 E3. A device the Home answers to that has never announced itself
   * here - which is exactly the shape of the device somebody is looking for
   * when they open this: the one they lost.
   */
  for (const line of unplaced.values()) {
    const item = root.document.createElement('li');
    item.className = 'device-line';
    item.dataset.presenceId = line.presenceId;

    const headline = root.document.createElement('p');
    headline.className = 'headline';
    headline.textContent = line.headline;

    const detail = root.document.createElement('p');
    detail.className = 'detail';
    detail.textContent = 'It has not said what it can do here.';

    item.append(headline, detail, deviceAuthorityBlock(root.document, line, act, renew, renewFromOther));
    root.list.append(item);
  }
}

/**
 * The authority half of a device row: what it may do for the person, and the
 * control that ends it.
 *
 * The reasons are behind the control rather than beside it, and the warning
 * appears with them: a person pressing "end" is asked why in the same moment
 * they are told what it costs, which is the only moment either is useful.
 */
function deviceAuthorityBlock(
  document: Document,
  line: PicoCompanionDeviceAuthorityLine,
  act: (input: {
    action: 'end-authority';
    presenceId: string;
    delegationId: string;
    reason: PicoCompanionDeviceRevocationReasonLine['reason'];
  }) => void,
  renew?: () => void,
  renewFromOther?: () => void,
): HTMLElement {
  const block = document.createElement('div');
  block.className = 'device-authority';
  block.dataset.delegationId = line.delegationId;

  const detail = document.createElement('p');
  detail.className = 'detail';
  detail.textContent = line.detail;
  block.append(detail);

  /**
   * ADR 0104's year, while something can still be done about it. Its own
   * line rather than a colour: a device that lets its authority lapse cannot
   * renew itself, and that is a sentence rather than an emphasis.
   */
  if (line.expiryWarning !== null) {
    const warning = document.createElement('p');
    warning.className = 'detail';
    warning.dataset.warning = 'expiry';
    warning.textContent = line.expiryWarning;
    block.append(warning);
  }

  if (line.renewLabel !== null && renew !== undefined) {
    const renewButton = document.createElement('button');
    renewButton.type = 'button';
    renewButton.dataset.renewAuthority = line.delegationId;
    renewButton.textContent = line.renewLabel;
    renewButton.addEventListener('click', () => renew());
    block.append(renewButton);
  }

  /**
   * ADR 0130 E3. The other renewal, on the device that holds no identity key:
   * it asks the device that added it, over the same three codes. Measured
   * against a running Home, this is the only path that keeps such a device
   * working - one whose year ran out can never be enrolled again.
   */
  if (line.renewFromOtherDeviceLabel !== null && renewFromOther !== undefined) {
    const askButton = document.createElement('button');
    askButton.type = 'button';
    askButton.dataset.renewFromOther = line.delegationId;
    askButton.textContent = line.renewFromOtherDeviceLabel;
    askButton.addEventListener('click', () => renewFromOther());
    block.append(askButton);
  }

  if (line.endLabel === null) {
    return block;
  }

  const reasons = document.createElement('div');
  reasons.className = 'device-authority-reasons';
  reasons.hidden = true;

  if (line.endWarning !== null) {
    const warning = document.createElement('p');
    warning.className = 'detail';
    warning.dataset.warning = 'true';
    warning.textContent = line.endWarning;
    reasons.append(warning);
  }

  for (const reason of picoCompanionDeviceRevocationReasonLines()) {
    const choice = document.createElement('button');
    choice.type = 'button';
    choice.dataset.reason = reason.reason;
    choice.textContent = reason.label;
    choice.addEventListener('click', () => act({
      action: 'end-authority',
      presenceId: line.presenceId,
      delegationId: line.delegationId,
      reason: reason.reason,
    }));
    reasons.append(choice);
  }

  const end = document.createElement('button');
  end.type = 'button';
  end.className = 'quiet';
  end.dataset.endAuthority = line.delegationId;
  end.textContent = line.endLabel;
  end.addEventListener('click', () => {
    reasons.hidden = false;
    end.hidden = true;
  });

  block.append(end, reasons);
  return block;
}

/**
 * ADR 0130 E4. Who lives in this Home.
 *
 * A list with no controls on its rows, and that is the state of the gate
 * rather than a design: ADR 0130 E4 names issuing a membership, and ending
 * one has no ceremony anywhere yet - not in the tool either. A row with a
 * button that cannot work would be worse than a row without one.
 */
/**
 * ADR 0082 mit ADR 0130 E5. Wer welche deiner Domänen lesen darf.
 *
 * Eine Domäne, die niemand liest, steht mit in der Liste - das ist der Grund,
 * aus dem die Companion zwei Lesevorgänge macht statt eines. Eine Ansicht, die
 * nur Domänen mit Lesern zeigt, verschweigt genau das Beruhigende.
 */
export function renderPicoCompanionDomainReadership(
  root: { list: HTMLElement; section: HTMLElement; summary: HTMLElement; document: Document },
  value: unknown,
  end: (input: {
    domainId: string;
    readerGrantId: string;
    reasonCategory: PicoCompanionReaderRevocationReasonLine['reasonCategory'];
  }) => void,
): void {
  const domains = parsePicoCompanionDomainReadership(value);
  root.section.hidden = false;
  root.summary.textContent = picoCompanionDomainReadershipSummary(domains);
  root.list.replaceChildren();

  for (const line of picoCompanionDomainReadershipLines(domains)) {
    const item = root.document.createElement('li');
    item.className = 'provider-line';
    item.dataset.domainId = line.domainId;

    const headline = root.document.createElement('p');
    headline.className = 'headline';
    headline.textContent = line.headline;

    const detail = root.document.createElement('p');
    detail.className = 'detail';
    detail.textContent = line.detail;

    item.append(headline, detail);

    for (const reader of line.readers) {
      const readerLine = root.document.createElement('p');
      readerLine.className = 'detail';
      readerLine.textContent = `${reader.headline} ${reader.detail}`;
      item.append(readerLine);

      if (reader.endLabel === null) {
        continue;
      }
      /**
       * Der Grund wird mit der Handlung gefragt, nicht danach: „sie soll das
       * nicht mehr lesen" und „mit dem Schlüssel stimmt etwas nicht" sind zwei
       * verschiedene Aufzeichnungen, und das Home behält, welche es war.
       */
      for (const reason of picoCompanionReaderRevocationReasonLines()) {
        const button = root.document.createElement('button');
        button.type = 'button';
        button.className = 'secondary';
        button.dataset.readerGrantId = reader.readerGrantId;
        button.dataset.reasonCategory = reason.reasonCategory;
        button.textContent = `${reader.endLabel}: ${reason.label}`;
        button.addEventListener('click', () => {
          end({
            domainId: line.domainId,
            readerGrantId: reader.readerGrantId,
            reasonCategory: reason.reasonCategory,
          });
        });
        item.append(button);
      }
    }

    root.list.append(item);
  }
}

export function renderPicoCompanionHomeMembers(
  root: { list: HTMLElement; section: HTMLElement; summary: HTMLElement; document: Document },
  value: unknown,
  /**
   * ADR 0130 E5. Ends one, and the reason is asked with the control rather
   * than after it: "they moved out" and "something is wrong with their Pico"
   * are two different records, and the Home keeps which one it was.
   */
  end?: (input: {
    credentialId: string;
    picoIdentityFingerprintHex: string;
    ending: PicoCompanionMembershipEndingLine['ending'];
  }) => void,
): void {
  const members = parsePicoCompanionHomeMembers(value);
  root.section.hidden = false;
  root.summary.textContent = picoCompanionHomeMembersSummary(members);
  root.list.replaceChildren();

  for (const [index, line] of picoCompanionHomeMemberLines(members).entries()) {
    const item = root.document.createElement('li');
    item.className = 'provider-line';
    item.dataset.membershipId = line.membershipId;

    const headline = root.document.createElement('p');
    headline.className = 'headline';
    headline.textContent = line.headline;

    const detail = root.document.createElement('p');
    detail.className = 'detail';
    detail.textContent = line.detail;

    item.append(headline, detail);

    const member = members[index]!;
    if (line.endLabel !== null && line.credentialId !== null && end !== undefined) {
      const reasons = root.document.createElement('div');
      reasons.className = 'device-authority-reasons';
      reasons.hidden = true;
      for (const ending of picoCompanionMembershipEndingLines()) {
        const choice = root.document.createElement('button');
        choice.type = 'button';
        choice.dataset.ending = ending.ending;
        choice.textContent = ending.label;
        choice.addEventListener('click', () => end({
          credentialId: line.credentialId!,
          picoIdentityFingerprintHex: member.picoIdentityFingerprintHex,
          ending: ending.ending,
        }));
        reasons.append(choice);
      }

      const endButton = root.document.createElement('button');
      endButton.type = 'button';
      endButton.className = 'quiet';
      endButton.dataset.endMembership = line.credentialId;
      endButton.textContent = line.endLabel;
      endButton.addEventListener('click', () => {
        reasons.hidden = false;
        endButton.hidden = true;
      });
      item.append(endButton, reasons);
    }

    root.list.append(item);
  }
}

/**
 * ADR 0138 CO3/CO4 on the device - two switches, and never one.
 *
 * The unasked control is absent while reaching is off rather than disabled: a
 * greyed-out switch invites somebody to wonder what it would have done, and
 * CO4 cannot be granted without CO3 at all.
 */
export function renderPicoCompanionSuppliers(
  root: { list: HTMLElement; section: HTMLElement; document: Document },
  value: unknown,
  act: (input: {
    identifier: string;
    mayReachOutside: boolean;
    mayReachUnasked: boolean;
  }) => void,
  /** ADR 0136. Ends the attachment. Never a switch, and always last. */
  remove?: (identifier: string) => void,
): void {
  const suppliers = parsePicoCompanionSuppliers(value);
  root.section.hidden = suppliers.length === 0;
  root.list.replaceChildren();

  for (const [index, line] of picoCompanionSupplierLines(suppliers).entries()) {
    const supplier = suppliers[index]!;
    const item = root.document.createElement('li');
    item.className = 'supplier-line';
    item.dataset.identifier = line.identifier;

    const headline = root.document.createElement('p');
    headline.className = 'headline';
    headline.textContent = line.headline;

    const detail = root.document.createElement('p');
    detail.className = 'detail';
    detail.textContent = line.detail;

    const reach = root.document.createElement('button');
    reach.type = 'button';
    reach.textContent = line.reachActionLabel;
    reach.addEventListener('click', () => act({
      identifier: line.identifier,
      mayReachOutside: !supplier.mayReachOutside,
      // Turning reaching off takes the unasked permission with it: somebody
      // switching off "may fetch" has plainly not meant "but keep doing it
      // unprompted".
      mayReachUnasked: supplier.mayReachOutside ? false : supplier.mayReachUnasked,
    }));

    item.append(headline, detail, reach);

    if (line.unaskedActionLabel !== undefined) {
      const unaskedDetail = root.document.createElement('p');
      unaskedDetail.className = 'detail';
      unaskedDetail.textContent = line.unaskedDetail ?? '';

      const unasked = root.document.createElement('button');
      unasked.type = 'button';
      unasked.textContent = line.unaskedActionLabel;
      unasked.addEventListener('click', () => act({
        identifier: line.identifier,
        mayReachOutside: true,
        mayReachUnasked: !supplier.mayReachUnasked,
      }));
      item.append(unaskedDetail, unasked);
    }

    /**
     * Last, and after the reach controls rather than among them. Those are
     * settings that go on being decided; this ends the thing they are about,
     * and a control that ends something sitting between two that adjust it
     * would be pressed by somebody meaning to adjust.
     */
    if (remove !== undefined) {
      const button = root.document.createElement('button');
      button.type = 'button';
      button.textContent = line.removeActionLabel;
      button.addEventListener('click', () => remove(line.identifier));
      item.append(button);
    }

    root.list.append(item);
  }
}

/**
 * ADR 0143 DP1 with ADR 0138 CO3/CO4 - depots, in the supplier line's shape.
 *
 * The same renderer would have done, and does not, for one reason: a depot's
 * decision names a remote and a supplier's names an identifier, so folding
 * them would need a field meaning "whichever of the two this is" - the shape
 * that makes a caller ask which kind it is holding.
 */
export function renderPicoCompanionDepots(
  root: { list: HTMLElement; section: HTMLElement; document: Document },
  value: unknown,
  act: (input: { remote: string; mayFetch: boolean; mayFetchUnasked: boolean }) => void,
  /** ADR 0143 DP8. Ends the attachment, and the working copy with it. */
  remove?: (remote: string) => void,
  /**
   * ADR 0143 DP1. Nimmt ein Angebot an, indem sie seinen Commit nennt.
   *
   * **Zuletzt in der Liste, wie bei den Recalls und aus demselben Grund**: die
   * beiden Rückrufe davor haben andere Formen, aber ein neuer Platz vor einem
   * bestehenden deutet jeden Aufrufer stillschweigend um. Neue Parameter
   * hinten (am 2026-08-25 einmal falsch herum gebaut und von einem Test
   * gefunden).
   */
  acceptOffer?: (input: { remote: string; acceptedCommit: string }) => void,
  /**
   * ADR 0140 RL4. Schreibt die eine Regel, die dieser Home lesen kann - oder
   * nimmt sie zurück. Zuletzt, wie jeder neue Rückruf in dieser Datei.
   */
  decideUnattended?: (input: {
    effectName: string;
    privacyDomain: string;
    allowing: boolean;
  }) => void,
): void {
  const depots = parsePicoCompanionDepots(value);
  root.section.hidden = depots.length === 0;
  root.list.replaceChildren();

  /**
   * **Eine Zeile für alle, nicht eine je Depot**, weil die Regel für den
   * Effekt in einer Domäne gilt und nicht für ein Depot. Die beiden Schalter
   * an jeder Zeile bleiben, was sie sind: ob *dieses* Depot geholt werden
   * darf, und ob ungefragt. Beide müssen gelten, und diese hier sagt, ob
   * „ungefragt" überhaupt etwas bewirken kann.
   */
  if (decideUnattended !== undefined && depots.length > 0) {
    const standing = parsePicoCompanionUnattendedFetching(value);
    const line = picoCompanionUnattendedFetchingLine(standing);
    const item = root.document.createElement('li');
    item.className = 'supplier-line';

    const detail = root.document.createElement('p');
    detail.className = 'detail';
    detail.textContent = line.detail;

    const button = root.document.createElement('button');
    button.type = 'button';
    button.textContent = line.actionLabel;
    button.addEventListener('click', () => decideUnattended({
      effectName: standing.effectName,
      privacyDomain: standing.privacyDomain,
      allowing: !line.allowing,
    }));

    item.append(detail, button);
    root.list.append(item);
  }

  for (const [index, line] of picoCompanionDepotLines(depots).entries()) {
    const depot = depots[index]!;
    const item = root.document.createElement('li');
    item.className = 'supplier-line';
    item.dataset.remote = depot.remote;

    const headline = root.document.createElement('p');
    headline.className = 'headline';
    headline.textContent = line.headline;

    const detail = root.document.createElement('p');
    detail.className = 'detail';
    detail.textContent = line.detail;

    const fetch = root.document.createElement('button');
    fetch.type = 'button';
    fetch.textContent = line.reachActionLabel;
    fetch.addEventListener('click', () => act({
      remote: depot.remote,
      mayFetch: !depot.mayFetch,
      mayFetchUnasked: depot.mayFetch ? false : depot.mayFetchUnasked,
    }));

    item.append(headline, detail);

    /**
     * ADR 0143 DP1. **Vor den Schaltern**, weil das hier eine gestellte Frage
     * ist und die beiden darunter Einstellungen sind, die weiter entschieden
     * werden. Wer eine Frage unter zwei Schalter setzt, lässt sie übersehen.
     */
    if (line.offer !== undefined && acceptOffer !== undefined) {
      const offered = line.offer;
      const offerDetail = root.document.createElement('p');
      offerDetail.className = 'detail';
      offerDetail.textContent = offered.detail;

      const accept = root.document.createElement('button');
      accept.type = 'button';
      accept.textContent = offered.acceptActionLabel;
      accept.addEventListener('click', () => acceptOffer({
        remote: depot.remote,
        // Der Commit reist mit dem Knopf, nicht aus einer späteren Lesung:
        // was die Person gesehen hat, ist das, wozu sie zusagt.
        acceptedCommit: offered.acceptedCommit,
      }));
      item.append(offerDetail, accept);
    }

    item.append(fetch);

    if (line.unaskedActionLabel !== undefined) {
      const unaskedDetail = root.document.createElement('p');
      unaskedDetail.className = 'detail';
      unaskedDetail.textContent = line.unaskedDetail ?? '';

      const unasked = root.document.createElement('button');
      unasked.type = 'button';
      unasked.textContent = line.unaskedActionLabel;
      unasked.addEventListener('click', () => act({
        remote: depot.remote,
        mayFetch: true,
        mayFetchUnasked: !depot.mayFetchUnasked,
      }));
      item.append(unaskedDetail, unasked);
    }

    if (remove !== undefined) {
      const button = root.document.createElement('button');
      button.type = 'button';
      button.textContent = line.removeActionLabel;
      button.addEventListener('click', () => remove(depot.remote));
      item.append(button);
    }

    root.list.append(item);
  }
}

/**
 * ADR 0139 AC4 - what a part of Pico says it will do, waiting to be agreed to.
 *
 * **In settings rather than in the Now view**, which is the split the window
 * makes: this is a thing somebody came to change, not a thing that interrupted
 * them. The question it unblocks is next door in the Now view and expires in
 * two minutes; these two look similar and are not.
 */
export function renderPicoCompanionModuleConsent(
  root: { list: HTMLElement; section: HTMLElement; document: Document },
  value: unknown,
  act: (identifier: string) => void,
): void {
  const awaiting = parsePicoCompanionModuleConsent(value);
  // Nothing awaiting is nothing to show. A section reading "all agreed" would
  // be a permanent fixture reporting the ordinary case.
  root.section.hidden = awaiting.length === 0;
  root.list.replaceChildren();

  for (const line of picoCompanionModuleConsentLines(awaiting)) {
    const item = root.document.createElement('li');
    item.className = 'supplier-line';
    item.dataset.module = line.identifier;

    const headline = root.document.createElement('p');
    headline.className = 'headline';
    headline.textContent = line.headline;
    item.append(headline);

    // One line per effect, in the module's own words - the sentences somebody
    // is agreeing to, not a count of them.
    for (const effectLine of line.effectLines) {
      const detail = root.document.createElement('p');
      detail.className = 'detail';
      detail.textContent = effectLine;
      item.append(detail);
    }

    const agree = root.document.createElement('button');
    agree.type = 'button';
    agree.textContent = line.actionLabel;
    agree.addEventListener('click', () => act(line.identifier));
    item.append(agree);

    root.list.append(item);
  }
}

/**
 * ADR 0141 RN4 - a question the Home is holding for the session at this window.
 *
 * Two buttons and no third: yes and no are answers, and *unanswered* is what
 * happens when somebody closes the window or the clock runs out. Offering it
 * as a button would make walking away and declining the same act.
 */
export function renderPicoCompanionPendingApprovals(
  root: { list: HTMLElement; section: HTMLElement; document: Document },
  value: unknown,
  act: (input: { requestedEventId: string; approved: boolean }) => void,
): void {
  const waiting = parsePicoCompanionPendingApprovals(value);
  root.section.hidden = waiting.length === 0;
  root.list.replaceChildren();

  for (const line of picoCompanionApprovalLines(waiting)) {
    const item = root.document.createElement('li');
    item.className = 'supplier-line';
    item.dataset.requestedEventId = line.requestedEventId;

    const headline = root.document.createElement('p');
    headline.className = 'headline';
    headline.textContent = line.headline;

    const detail = root.document.createElement('p');
    detail.className = 'detail';
    detail.textContent = line.detail;

    const approve = root.document.createElement('button');
    approve.type = 'button';
    approve.textContent = line.approveLabel;
    approve.addEventListener('click', () => act({
      requestedEventId: line.requestedEventId,
      approved: true,
    }));

    const deny = root.document.createElement('button');
    deny.type = 'button';
    deny.textContent = line.denyLabel;
    deny.addEventListener('click', () => act({
      requestedEventId: line.requestedEventId,
      approved: false,
    }));

    item.append(headline, detail, approve, deny);
    root.list.append(item);
  }
}

/**
 * ADR 0143 DP3 - what a fetched depot brought, with the one answer it needs.
 *
 * A field and a button rather than a switch, because the answer is a name the
 * person chooses rather than a yes or a no. The field is read at the moment
 * the button is pressed, so a person who types and then changes their mind has
 * changed nothing.
 */
export function renderPicoCompanionDeclaredSuppliers(
  root: { list: HTMLElement; section: HTMLElement; document: Document },
  value: unknown,
  act: (input: { identifier: string; privacyDomain: string }) => void,
): void {
  const declared = parsePicoCompanionDeclaredSuppliers(value);
  // Nothing declared is nothing to answer. A section saying "no suppliers are
  // waiting" would be a permanent fixture reporting the ordinary case.
  root.section.hidden = declared.length === 0;
  root.list.replaceChildren();

  for (const line of picoCompanionDeclaredSupplierLines(declared)) {
    const item = root.document.createElement('li');
    item.className = 'supplier-line';
    item.dataset.identifier = line.identifier;

    const headline = root.document.createElement('p');
    headline.className = 'headline';
    headline.textContent = line.headline;

    const detail = root.document.createElement('p');
    detail.className = 'detail';
    detail.textContent = line.detail;

    const label = root.document.createElement('label');
    label.textContent = line.domainLabel;

    const domain = root.document.createElement('input');
    domain.type = 'text';
    domain.maxLength = 64;
    domain.autocomplete = 'off';

    const attach = root.document.createElement('button');
    attach.type = 'button';
    attach.textContent = line.actionLabel;
    attach.addEventListener('click', () => act({
      identifier: line.identifier,
      privacyDomain: domain.value.trim(),
    }));

    item.append(headline, detail, label, domain, attach);
    root.list.append(item);
  }
}

/**
 * ADR 0142 PE2 - a measurement in progress, and the ones just finished.
 *
 * **No control on the line.** Everything here is either work happening or a
 * fact about how it ended; the decision it leads to is on the provider line
 * below, which already exists. A cancel button is deliberately absent: the
 * measurement is minutes of somebody's own card doing work they asked for, and
 * a half-measured host would be an entry ADR 0142 would not let Pico write
 * anyway.
 */
export function renderPicoCompanionMeasurements(
  root: { list: HTMLElement; section: HTMLElement; document: Document },
  value: unknown,
): void {
  const measurements = parsePicoCompanionMeasurements(value);
  root.section.hidden = measurements.length === 0;
  root.list.replaceChildren();

  for (const line of picoCompanionMeasurementLines(measurements)) {
    const item = root.document.createElement('li');
    item.className = 'supplier-line';
    item.dataset.entryId = line.entryId;

    const headline = root.document.createElement('p');
    headline.className = 'headline';
    headline.textContent = line.headline;

    const detail = root.document.createElement('p');
    detail.className = 'detail';
    detail.textContent = line.detail;

    item.append(headline, detail);
    root.list.append(item);
  }
}
