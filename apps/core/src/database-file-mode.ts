import { chmodSync, existsSync, statSync } from 'node:fs';

/**
 * A Home's database is not for anyone else on the machine.
 *
 * **Walked, not assumed** (2026-09-10, finding B117). A Home started against a
 * data directory that already existed left this behind:
 *
 * ```
 * 755 data
 * 644 data/pico.sqlite
 * 644 data/pico.sqlite-wal
 * 644 data/pico.sqlite-shm
 * 700 data/home-host-keys
 * 600 data/home-host-keys/home_host_signing.key.json
 * ```
 *
 * The keys are careful; the database the keys exist for is world-readable.
 * When the directory did *not* exist it came out `700` - but only because
 * `mkdirSync(..., { mode: 0o700 })` for the key store happened to create the
 * parent on the way. A protection that holds by accident holds until somebody
 * installs the thing differently, mounts a volume, or restores a backup.
 *
 * And the default content posture is `plaintext_foundation`: memory content is
 * stored as it was given unless a domain key was chosen for it. So this is not
 * only metadata.
 *
 * **Narrowed, never widened.** If a mode is already at or below `0600`, it is
 * left alone - an operator who tightened further meant it. Only the bits that
 * let somebody else read are taken away, which cannot break a setup that was
 * already private.
 *
 * **The sidecars matter as much as the file.** SQLite's `-wal` holds the pages
 * of recent writes and `-shm` the index into them; a 0600 database beside a
 * 0644 write-ahead log protects yesterday and not this morning.
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
