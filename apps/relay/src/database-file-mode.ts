import { chmodSync, existsSync, statSync } from 'node:fs';

/**
 * A relay's database is not for the other accounts on that machine.
 *
 * **Walked, not assumed** (2026-09-10, finding B120). A relay started against
 * a data directory that already existed left this behind:
 *
 * ```
 * 755 data
 * 644 data/relay.sqlite
 * 644 data/relay.sqlite-wal
 * 644 data/relay.sqlite-shm
 * ```
 *
 * What is in it is sealed - ADR 0107 seals end to end and a relay never holds
 * a key. But the addresses are not. `check-link-seal.mjs` refuses a mailbox
 * address in a log line because a mailbox *is* a relationship, and this file
 * holds every one of them at once. A relay is the one component that runs on
 * somebody else's machine (ADR 0149 RS1), which is exactly where "another
 * account on this host" stops being hypothetical.
 *
 * **Why this is a second copy of the Home's rule.** ADR 0149 RS1 forbids the
 * relay to reach `@pico/core`, and it is right to: a relay that could import a
 * store is one somebody could teach to read one. The twin lives in
 * `apps/core/src/database-file-mode.ts` and says the same thing about the
 * Home's database; the duplication is twenty lines of `chmod` and not a rule
 * about Pico, and the boundary is worth more than the twenty lines.
 *
 * **Narrowed, never widened**, and the `-wal` counts as much as the file: it
 * carries the pages of recent writes.
 */
const ownerOnly = 0o600;
const sidecarSuffixes = ['-wal', '-shm'] as const;

/** Take away every bit that lets somebody other than the owner read or write. */
export function narrowToOwner(databasePath: string): void {
  for (const path of [databasePath, ...sidecarSuffixes.map((suffix) => `${databasePath}${suffix}`)]) {
    if (!existsSync(path)) {
      continue;
    }
    const mode = statSync(path).mode & 0o777;
    if ((mode & ~ownerOnly) === 0) {
      continue;
    }
    chmodSync(path, mode & ownerOnly);
  }
}
