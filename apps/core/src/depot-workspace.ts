import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * ADR 0143 DP8 - where a depot's working copy lives, and why that is a
 * convention rather than a decision.
 *
 * It looked like a new question and it is an old one answered four times
 * already: `keys`, `home-host-keys`, `backups` and `recovery-anchor` all sit
 * beside the database, each with a config field and an environment variable
 * over a default. `depots` is the fifth, and inventing a fifth *shape* would
 * have been the actual mistake.
 *
 * **It is not an ADR 0129 SR2 store**, and the recovery anchor is the
 * precedent: a durable core-owned file artefact that never went through the
 * five questions, because those questions are about a store the core keeps
 * records in. A working copy keeps no records. It is the materialisation of a
 * pin that is already recorded, reconstructible from that pin at any time, and
 * holds nothing of a person's - only third-party code at a commit they
 * accepted. What it needs instead is the anchor's other concern, and it has
 * it: ADR 0110's backup copies the database file into its own directory rather
 * than sweeping the one beside it, so a working copy does not travel in a
 * snapshot it would only bloat.
 *
 * **A remote never picks the directory.** ADR 0143 DP8 validates a supplier
 * identifier against ADR 0137 IN1's pattern for exactly this reason - "a
 * supplier whose identifier could contain a slash would be a supplier picking
 * a place on the disk". A remote is a URL, so it contains slashes by
 * definition and cannot be sanitised into a name without inventing an escaping
 * scheme whose bugs are directories in the wrong place. It is hashed instead:
 * the name is a function of the remote, collision-free in practice, and
 * structurally incapable of being a path.
 */
export class PicoDepotWorkspace {
  private readonly resolvedRoot: string;

  /*
   * Befund B178. `root` war bis zum 2026-09-15 ein Feld und wurde nie gelesen -
   * eine **zweite Kopie** neben `resolvedRoot`, und zwar die ungeloeste. Wer
   * sie spaeter fuer den Wurzelpfad gehalten haette, haette einen relativen
   * bekommen. Der Parameter reicht: gepruefft wird er hier, aufgehoben wird
   * nur, was aufgeloest ist.
   */
  public constructor(root: string) {
    if (typeof root !== 'string' || root.trim() === '') {
      throw new Error('invalid_pico_depot_workspace_root');
    }
    this.resolvedRoot = resolve(root);
  }

  /** The default beside the database, in the idiom the other four use. */
  public static defaultRoot(databasePath: string): string {
    return join(dirname(databasePath), 'depots');
  }

  /**
   * The directory name for a remote. Deterministic, and a name rather than a
   * path by construction - hex has no separator in it.
   */
  public static directoryName(remote: string): string {
    if (typeof remote !== 'string' || remote.trim() === '') {
      throw new Error('invalid_pico_depot_remote');
    }
    return createHash('sha256').update(remote, 'utf8').digest('hex');
  }

  public pathFor(remote: string): string {
    return join(this.resolvedRoot, PicoDepotWorkspace.directoryName(remote));
  }

  /** Creates the directory if it is missing, and returns it either way. */
  public ensure(remote: string): string {
    const path = this.pathFor(remote);
    // Befund B120: dieselbe Frage wie bei der Datenbank daneben - wer darf das
    // lesen. Bisher stand hier die Vorgabe, also 0755 unter der Maske.
    mkdirSync(path, { recursive: true, mode: 0o700 });
    return path;
  }

  /**
   * Removes the working copy and everything in it.
   *
   * Deletes rather than shreds, for ADR 0143 DP8's reason about the scratch
   * area and one more of its own: there is nothing here to shred. The contents
   * came from a public remote at a commit anyone can fetch, and claiming
   * unrecoverable erasure of code that is still on the internet would be a
   * guarantee about the wrong thing.
   */
  public detach(remote: string): void {
    rmSync(this.pathFor(remote), { recursive: true, force: true });
  }

  /**
   * ADR 0143 DP8. Brings the filesystem back to what the attachment rows say,
   * and returns the directory names it removed.
   *
   * The attachment record decides and the filesystem is brought to it - ADR
   * 0070's tombstone posture. A detach interrupted between the row and the
   * files would otherwise leave executable code on disk that no attachment
   * stands behind, which is worse here than a leftover scratch directory: this
   * is what a supplier process would be pointed at.
   *
   * A directory whose name is not a hash of an attached remote goes too.
   * Nothing this class creates can have such a name, so its presence means
   * something else wrote into the root.
   */
  public removeOrphans(attachedRemotes: readonly string[]): readonly string[] {
    if (!existsSync(this.resolvedRoot) || !statSync(this.resolvedRoot).isDirectory()) {
      return Object.freeze([]);
    }
    const keep = new Set(attachedRemotes.map(
      (remote) => PicoDepotWorkspace.directoryName(remote),
    ));
    const removed: string[] = [];
    for (const entry of readdirSync(this.resolvedRoot, { withFileTypes: true })) {
      if (keep.has(entry.name)) {
        continue;
      }
      rmSync(join(this.resolvedRoot, entry.name), { recursive: true, force: true });
      removed.push(entry.name);
    }
    return Object.freeze(removed.sort());
  }
}
