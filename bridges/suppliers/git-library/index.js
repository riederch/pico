/**
 * ADR 0136 - the first Pico Library, and the first supplier of any kind.
 *
 * A git working copy on local disk: no network, no credential, no cost. That
 * is deliberate, because it is the only supplier kind that can be proved end
 * to end today - a bridge would need ADR 0138 CO1's credential and a paid
 * account, and neither exists.
 *
 * **It reports what it is; it does not hand over what it holds.** Reading a
 * library is only lawful through ADR 0117 X4's quarantined read job, which
 * needs a model delegation runtime that does not exist, so there is no `offer`
 * handler here and no content crosses the slot. What does cross is the state
 * (ADR 0138 CO2) and the pin (ADR 0136 BR6) - the two facts that are true
 * about a corpus without reading a byte of it.
 *
 * **The path arrives with the request.** Where a person keeps their material
 * is configuration under core custody (ADR 0104), not something a supplier
 * decides or remembers, so nothing here is hardcoded and nothing is kept
 * between calls.
 *
 * Note what this file does not import: nothing of Pico's. The contract is the
 * wire form, and the family strings below are copied from the specification
 * the way a third party would copy them (ADR 0134). That is the point of
 * making the supplier protocol a kept identity.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const HELLO = 'pico.supplier.hello.v1';
const CONDITION = 'pico.supplier.condition.v1';

/** The commit a working copy is on, read without running `git`. */
function headCommit(root) {
  const headPath = join(root, '.git', 'HEAD');
  if (!existsSync(headPath)) {
    return null;
  }
  const head = readFileSync(headPath, 'utf8').trim();
  if (/^[0-9a-f]{40}$|^[0-9a-f]{64}$/u.test(head)) {
    // A detached head already holds the commit.
    return head;
  }
  const match = /^ref:\s*(\S+)$/u.exec(head);
  if (match === null) {
    return null;
  }
  const refPath = join(root, '.git', match[1]);
  if (existsSync(refPath)) {
    const commit = readFileSync(refPath, 'utf8').trim();
    return /^[0-9a-f]{40}$|^[0-9a-f]{64}$/u.test(commit) ? commit : null;
  }
  const packed = join(root, '.git', 'packed-refs');
  if (!existsSync(packed)) {
    return null;
  }
  for (const line of readFileSync(packed, 'utf8').split('\n')) {
    const entry = /^([0-9a-f]{40}|[0-9a-f]{64})\s+(\S+)$/u.exec(line.trim());
    if (entry !== null && entry[2] === match[1]) {
      return entry[1];
    }
  }
  return null;
}

/**
 * The bytes of `.gitattributes`, handed back unread. Whether a commit covers
 * the content is the core's question (ADR 0136 BR6), and a supplier that
 * answered it would be asserting that its own material is verified.
 */
function gitAttributes(root) {
  const path = join(root, '.gitattributes');
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

export default async function handle(request) {
  if (request?.family === HELLO) {
    return { protocolVersion: 1, slots: ['memory_item'] };
  }

  if (request?.family === CONDITION) {
    const root = typeof request.workingCopy === 'string' ? request.workingCopy : '';
    if (root === '') {
      // ADR 0138 CO2. Nothing was attempted, so nothing was disclosed, and
      // this is a state of the system rather than a fault in it.
      return { condition: 'not_configured' };
    }
    if (!existsSync(root) || !statSync(root).isDirectory()) {
      return { condition: 'unreachable' };
    }
    const commit = headCommit(root);
    if (commit === null) {
      // Present but not a working copy Pico can pin. Not `ok`, because an
      // answer Pico could not trace back to a revision is one ADR 0133 has no
      // correction point for.
      return { condition: 'unreachable' };
    }
    return {
      condition: 'ok',
      detail: { pin: { kind: 'commit', value: commit }, gitAttributes: gitAttributes(root) },
    };
  }

  // ADR 0143 DP7's neighbour: a family this supplier does not implement is
  // refused rather than answered emptily, so a caller learns the difference
  // between "no" and "nothing".
  throw new Error('pico_supplier_request_family_not_listed');
}
