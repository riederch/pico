import {
  closeSync,
  constants as fsConstants,
  fsyncSync,
  linkSync,
  openSync,
  rmSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { dirname } from 'node:path';

/**
 * How the Home creates a file that holds a key: complete or not at all, and
 * on the disk before anybody is told it exists.
 *
 * **The occasion** (2026-09-25, finding B275). The Domain Content Keys, the
 * Home host key pair and the staged rotation pair were written with
 * `writeFileSync` and nothing after it. SQLite syncs its own commits, so the
 * order on the disk was the wrong way round: rows encrypted under a new key
 * reached the platter, and the key itself could still be in the page cache. A
 * power cut in between leaves a new file empty - the classic outcome on ext4
 * with delayed allocation - under rows that are durable, and a domain whose
 * key is empty is a domain nobody can read again. A torn host key file is
 * worse in a different way: `load` refuses it as invalid, and the Home does
 * not start.
 *
 * The companion learnt this in B121 (`atomic-file.ts`) and the recovery
 * anchor in B214; the keys, the one thing here that cannot be derived again,
 * were the files left out.
 *
 * **Created, never replaced.** Every caller wrote with `wx` or should have:
 * a key version that already exists must not be overwritten by a second one.
 * So the finished file is published with `link`, which fails on an existing
 * name atomically, rather than with `rename`, which would replace it.
 *
 * **The partial file has a fixed name** - the target plus `.partial` - and
 * that is a security property, not tidiness. A crash between writing and
 * publishing leaves a copy of the key under that name. A random name would be
 * one no owner could find, and `shredDomain` would destroy the key while its
 * copy survived beside it. With a fixed name, `removePicoHomeFileDurably`
 * takes both, and the next creation of the same file clears it first.
 */
export function createPicoHomeFileDurably(
  path: string,
  contents: string | Uint8Array,
): void {
  const partialPath = picoHomePartialPath(path);
  // Whatever lies here is unpublished by definition, or a second link to a
  // file that was published: removing it loses nothing either way.
  rmSync(partialPath, { force: true });
  const handle = openSync(
    partialPath,
    fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
    0o600,
  );
  try {
    const bytes = typeof contents === 'string' ? Buffer.from(contents, 'utf8') : contents;
    let written = 0;
    while (written < bytes.byteLength) {
      written += writeSync(handle, bytes, written, bytes.byteLength - written);
    }
    fsyncSync(handle);
  } catch (error) {
    closeSync(handle);
    rmSync(partialPath, { force: true });
    throw error;
  }
  closeSync(handle);
  try {
    linkSync(partialPath, path);
  } finally {
    unlinkSync(partialPath);
  }
  fsyncDirectory(dirname(path));
}

/**
 * Removes a file this module created, with any partial copy of it - the half
 * of the promise above that the shred and the discard of a staged rotation
 * depend on.
 */
export function removePicoHomeFileDurably(path: string): void {
  rmSync(path, { force: true });
  rmSync(picoHomePartialPath(path), { force: true });
}

export function picoHomePartialPath(path: string): string {
  return `${path}.partial`;
}

/**
 * Durability is the point, so a failed flush is the caller's failure rather
 * than something to swallow - the rule `recovery-anchor.ts` states for itself.
 */
function fsyncDirectory(path: string): void {
  const handle = openSync(path, 'r');
  try {
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
}
