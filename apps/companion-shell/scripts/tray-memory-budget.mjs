/**
 * ADR 0113 C3. Which memory numbers a run is entitled to assert.
 *
 * **This closes C3's own residual, in the words the ADR left it in:** *"a gate
 * that is expected to fail in the mode people run it in trains its reader to
 * explain failures away"*. The PSS budget was defined against the root-owned
 * setuid probe; a local `user_namespace` run measures about 17.5 MB above it
 * and therefore breaks the budget at unchanged HEAD. The runbook said so in
 * bold, the report carried the mode, the failure message appended it - and the
 * red was still read as a code finding twice, because a red that is usually
 * meaningless is a red nobody reads carefully.
 *
 * So the decision is made here rather than by prose elsewhere: in the mode the
 * budget was defined for the limit is strict and unchanged, and in any other
 * mode the number is reported and not asserted, because a limit measured
 * against a different baseline is not a limit.
 *
 * **Nothing is loosened.** Private dirty plus hugetlb is asserted in every
 * mode, and it is the class that answers what the PSS number was being asked:
 * it is the memory the application actually owns. ADR 0113 measured it moving
 * +0.4 MB across a window where PSS moved +25.7 MB on host page sharing alone.
 *
 * Extracted from `verify-linux-package.mjs` so both branches can be tested.
 * That file builds a `.deb` and spawns a packaged Electron at import, so the
 * root-owned branch would otherwise be reachable only on a machine with sudo,
 * which is to say never on the machine where it matters. Same reason
 * `workspace-closure.mjs` and `chromium-sandbox-probe.mjs` sit beside it.
 */

/** The probe the numbers in ADR 0113 were measured against. */
export const picoTrayMemoryBudgetMode = 'root_owned_packaged_setuid_helper';

export const picoTrayProportionalBudgetBytes = 225_000_000;
export const picoTrayPrivateDirtyAndHugetlbBudgetBytes = 110_000_000;

/**
 * Returns the lines the caller should print. Throws on a real overrun.
 *
 * Reporting by return value rather than by writing: a checker that printed
 * from inside would be untestable in the half that matters, which is the
 * mistake this extraction exists to avoid repeating.
 */
export function assertPicoTrayMemoryBudgets({
  report,
  mode,
  memoryContext,
  environmentVariable,
}) {
  if (report.proportionalBudgetBytes !== picoTrayProportionalBudgetBytes) {
    throw new Error('Tray memory probe carries a PSS budget this gate does not know: '
      + `${report.proportionalBudgetBytes}.`);
  }
  if (report.privateDirtyAndHugetlbBudgetBytes !== picoTrayPrivateDirtyAndHugetlbBudgetBytes) {
    throw new Error('Tray memory probe carries a private budget this gate does not know: '
      + `${report.privateDirtyAndHugetlbBudgetBytes}.`);
  }

  /**
   * Asserted first and in every mode, because it is the number that does not
   * move with how the host happens to share pages.
   */
  if (report.privateDirtyAndHugetlbBytes >= report.privateDirtyAndHugetlbBudgetBytes) {
    throw new Error(
      `Tray private dirty plus hugetlb memory ${report.privateDirtyAndHugetlbBytes} bytes `
      + 'exceeds the strict 110 MB budget '
      + `(summed RSS ${report.rssBytes}, PSS ${report.proportionalBytes}; ${memoryContext}).`,
    );
  }

  if (mode !== picoTrayMemoryBudgetMode) {
    return [
      `Tray PSS ${report.proportionalBytes} bytes measured but not asserted: the 225 MB `
      + `budget is defined against the ${picoTrayMemoryBudgetMode} probe and this run is `
      + `${mode}, which ADR 0113 records as about 17.5 MB above it. Set `
      + `${environmentVariable}=1 to assert it (${memoryContext}).`,
    ];
  }

  if (report.proportionalBytes >= report.proportionalBudgetBytes) {
    throw new Error(
      `Tray PSS ${report.proportionalBytes} bytes exceeds the strict 225 MB budget `
      + `(summed RSS ${report.rssBytes}, private ${report.privateBytes}; ${memoryContext}).`,
    );
  }
  /**
   * The probe's own verdict is the PSS budget again, so it is held to the same
   * rule rather than smuggling the strict limit back in through a boolean.
   */
  if (report.underBudget !== true) {
    throw new Error('Tray memory probe did not pass its own PSS/private budget gates.');
  }
  return [];
}
