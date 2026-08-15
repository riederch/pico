import {
  picoCompanionModelProviderLines,
  parsePicoCompanionModelProviders,
  picoCompanionAnsweredReadLines,
  parsePicoCompanionAnsweredReads,
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
