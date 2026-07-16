import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

/**
 * File-based store for memory Domain Content Keys (KEKs) - ADR 0072.
 *
 * One file per KEK version (`domain_<domainId>.v<version>.key`). Keys are raw
 * random bytes stored at file mode 0600 in a directory at mode 0700. This
 * module manages key files only; it performs no encryption. It stays separate
 * from the database and its backup artifacts (R6 - see assertKeyStoreSeparation);
 * nothing populates it in production until the ADR 0071 gate is passed.
 */
const KEK_BYTES = 32;
const KEY_FILE_PATTERN = /^domain_(?<domainId>[a-zA-Z0-9_-]+)\.v(?<version>[1-9]\d*)\.key$/;

export interface KeyVersion {
  domainId: string;
  version: number;
}

export class KeyStore {
  public constructor(private readonly keyStorePath: string) {}

  public createKeyVersion(domainId: string): KeyVersion {
    assertDomainId(domainId);
    mkdirSync(this.keyStorePath, { recursive: true, mode: 0o700 });

    const version = this.nextVersion(domainId);
    writeFileSync(this.keyPath(domainId, version), randomBytes(KEK_BYTES), { mode: 0o600 });

    return { domainId, version };
  }

  public loadKeyVersion(domainId: string, version: number): Buffer {
    assertDomainId(domainId);
    const path = this.keyPath(domainId, version);

    if (!existsSync(path)) {
      throw new Error(`Key version not found: ${domainId} v${version}.`);
    }

    return readFileSync(path);
  }

  public listVersions(domainId: string): number[] {
    assertDomainId(domainId);

    if (!existsSync(this.keyStorePath)) {
      return [];
    }

    return readdirSync(this.keyStorePath)
      .map((name) => KEY_FILE_PATTERN.exec(name))
      .filter((match): match is RegExpExecArray => match !== null && match.groups?.domainId === domainId)
      .map((match) => Number(match.groups?.version))
      .sort((a, b) => a - b);
  }

  /**
   * Deletes every KEK version of a domain (crypto-shred, ADR 0072). Honest
   * limit: file deletion on SSD/copy-on-write storage is best-effort erasure of
   * the local medium; the dependable shred property comes from key/backup
   * separation (R6), not from this delete.
   */
  public shredDomain(domainId: string): { removed: number } {
    const versions = this.listVersions(domainId);

    for (const version of versions) {
      rmSync(this.keyPath(domainId, version), { force: true });
    }

    return { removed: versions.length };
  }

  private nextVersion(domainId: string): number {
    const versions = this.listVersions(domainId);
    return versions.length === 0 ? 1 : versions[versions.length - 1] + 1;
  }

  private keyPath(domainId: string, version: number): string {
    return join(this.keyStorePath, `domain_${domainId}.v${version}.key`);
  }
}

/**
 * Enforces R6 (ADR 0072): the key store must never live in the SQLite backup
 * directory (its files would land in database backup artifacts) and must not be
 * the database file's own directory. Misconfiguration fails loudly at startup
 * instead of silently violating key/backup separation.
 */
export function assertKeyStoreSeparation(params: {
  keyStorePath: string;
  databasePath: string;
  backupDirectory: string;
}): void {
  const keyStore = resolve(params.keyStorePath);
  const databaseDirectory = resolve(dirname(params.databasePath));
  const backupDirectory = resolve(params.backupDirectory);

  if (keyStore === backupDirectory || isWithin(keyStore, backupDirectory)) {
    throw new Error(
      'PICO_KEY_STORE_PATH must not be inside the SQLite backup directory: keys and data must never share a backup artifact (ADR 0072 R6).',
    );
  }

  if (keyStore === databaseDirectory) {
    throw new Error(
      'PICO_KEY_STORE_PATH must not be the database directory: keys must not sit alongside the database file (ADR 0072 R6).',
    );
  }
}

function assertDomainId(domainId: string): void {
  if (typeof domainId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(domainId)) {
    throw new Error('Key store domainId must match [a-zA-Z0-9_-]{1,128}.');
  }
}

function isWithin(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}
