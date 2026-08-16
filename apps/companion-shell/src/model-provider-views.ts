import {
  picoCompanionModelProviderLines,
  parsePicoCompanionModelProviders,
  picoCompanionAnsweredReadLines,
  parsePicoCompanionAnsweredReads,
  picoCompanionRecallLines,
  parsePicoCompanionRecalls,
  picoCompanionRelayLines,
  picoCompanionRelayAccountIssued,
  parsePicoCompanionRelays,
  picoCompanionDeviceLines,
  parsePicoCompanionDevices,
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
  root: { list: HTMLElement; section: HTMLElement; document: Document },
  value: unknown,
  act: (input:
    | { action: 'switch'; presenceId: string; affordance?: string; enabled: boolean }
    | { action: 'forget'; presenceId: string }) => void,
): void {
  const devices = parsePicoCompanionDevices(value);
  root.section.hidden = devices.length === 0;
  root.list.replaceChildren();

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
    root.list.append(item);
  }
}
