import { picoGitCommitPattern } from './library-pin.js';

/**
 * ADR 0143 DP1 - a depot is attached at a commit, and a newer one is an offer.
 *
 * A Pico Depot is an attached repository that provides one or more suppliers.
 * This file is the part that decides **what it runs**, and the whole decision
 * fits in one sentence: a depot runs at a commit a person accepted, and a newer
 * commit on the same remote changes nothing until someone decides again.
 *
 * **The enforcement is the absence of a field.** There is nowhere in a depot
 * record to write a branch, a ref, a tag or a channel, so "track main" is not a
 * configuration this system has a way to express. That is stronger than a rule
 * against auto-updating, because a rule needs something to keep obeying it and
 * an absent field needs nothing - the construction ADR 0117 X1 uses for
 * `picoReaderCapabilities`, ADR 0136 BR3 for an origin class, ADR 0136 BR4 for
 * `confirmedByPerson`, ADR 0136 BR6 for a pin's content coverage and ADR 0137
 * IN5 for a derived instance.
 *
 * ADR 0122 is the reason it matters. That ADR refuses a build that reads
 * anything mutable, pinning actions to commit SHAs and the base image to a
 * digest, and every word of it is about Pico's own release. A depot is a second
 * update path into a running installation, and one that followed a branch would
 * be a remote party pushing code into a Pico between releases - the same
 * exposure, through a door ADR 0122 has no sentence about.
 *
 * **A depot is identified by its remote, and that is the opposite of an
 * instance.** ADR 0137 IN1 makes a supplier instance a person-chosen token and
 * never an address, because a working copy moves and a camper van's Home
 * Assistant changes IP at every campsite - the identity has to survive the
 * address. A depot is not a thing in a person's life; it is the place code
 * comes from. If the place changes, it is a different place, and pretending
 * otherwise would let a rename silently redirect what executes.
 */
export const picoDepotRemotePattern = /^(?:https:\/\/|ssh:\/\/|git@)[^\s]+$/u;

export const maxPicoDepotRemoteChars = 512;

/** What a depot is, and what it runs. There is no third field on purpose. */
export interface PicoDepotPin {
  /** The repository. Identity, not configuration. */
  remote: string;
  /** The commit a person accepted. Never a branch, because there is no branch. */
  commit: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Names the refusal rather than folding it into a shape error, because a caller
 * reaching for `branch` or `ref` is not making a typo - it is asking for the
 * thing this gate exists to prevent, and it should be told so.
 */
const followingFields = ['branch', 'ref', 'tag', 'channel', 'track', 'head'];

export function parsePicoDepotPin(value: unknown): PicoDepotPin {
  const record = isRecord(value) ? value : undefined;
  if (record === undefined) {
    throw new Error('invalid_pico_depot_pin');
  }
  for (const field of followingFields) {
    if (field in record) {
      throw new Error('pico_depot_cannot_follow_a_ref');
    }
  }
  const keys = Object.keys(record).sort();
  if (keys.length !== 2 || keys[0] !== 'commit' || keys[1] !== 'remote') {
    throw new Error('invalid_pico_depot_pin');
  }
  if (typeof record.remote !== 'string'
    || record.remote.length > maxPicoDepotRemoteChars
    || !picoDepotRemotePattern.test(record.remote)) {
    throw new Error('invalid_pico_depot_remote');
  }
  if (typeof record.commit !== 'string' || !picoGitCommitPattern.test(record.commit)) {
    // Its own error: a depot pinned to something that is not a commit is a
    // depot pinned to something that can change under it.
    throw new Error('invalid_pico_depot_commit');
  }
  return Object.freeze({ remote: record.remote, commit: record.commit });
}

/**
 * ADR 0143 DP1. What a newer commit is: an offer.
 *
 * Not an update, not a pending change and not a state the depot is in. It is a
 * sentence Pico may show - *there is a newer commit* - and it carries both ends
 * so a person can see what they would be moving from and to.
 *
 * There is no `apply`. The only way across is `acceptPicoDepotOffer`, and it
 * names the commit, so an offer that moved between the question and the answer
 * is caught by comparison rather than trusted by ordering. That is ADR 0137
 * IN5's shape, and the reason is the same one at higher stakes: what a person
 * accepted here is *code that will execute*.
 */
export interface PicoDepotOffer {
  remote: string;
  /** What is running now. */
  running: string;
  /** What was seen on the remote. */
  offered: string;
}

/**
 * Compares what is running against what a fetch saw. `null` when they are the
 * same, because a depot that is up to date has no offer to report - and
 * returning an empty offer would put a decision in front of a person that
 * nobody needs to make.
 */
export function picoDepotOffer(input: {
  pin: PicoDepotPin;
  seenCommit: string;
}): PicoDepotOffer | null {
  const pin = parsePicoDepotPin(input.pin);
  if (typeof input.seenCommit !== 'string' || !picoGitCommitPattern.test(input.seenCommit)) {
    throw new Error('invalid_pico_depot_commit');
  }
  if (pin.commit === input.seenCommit) {
    return null;
  }
  return Object.freeze({
    remote: pin.remote,
    running: pin.commit,
    offered: input.seenCommit,
  });
}

/**
 * ADR 0143 DP1. The one route from an offer to a running commit.
 *
 * The acceptance **names the commit**, so accepting is a decision about a
 * specific revision rather than about "the update". A fetch that landed between
 * the question and the answer produces a mismatch and is refused, which is the
 * difference between a person having agreed to run this code and a person
 * having agreed to run whatever was newest at the moment they clicked.
 *
 * What comes out is an ordinary pin with no memory of having been an offer -
 * the same deliberate forgetting ADR 0137 IN5 does, because a depot running at
 * an accepted commit is in exactly the state a freshly attached one is in.
 */
export function acceptPicoDepotOffer(input: {
  offer: PicoDepotOffer;
  acceptedCommit: string;
}): PicoDepotPin {
  const offer = isRecord(input.offer) ? input.offer : undefined;
  if (offer === undefined) {
    throw new Error('invalid_pico_depot_offer');
  }
  const keys = Object.keys(offer).sort();
  if (keys.length !== 3 || keys[0] !== 'offered' || keys[1] !== 'remote' || keys[2] !== 'running') {
    throw new Error('invalid_pico_depot_offer');
  }
  if (input.acceptedCommit !== offer.offered) {
    throw new Error('pico_depot_acceptance_mismatch');
  }
  return parsePicoDepotPin({
    remote: offer.remote,
    commit: input.acceptedCommit,
  });
}

/**
 * ADR 0143 DP8 - a task is an identifier, an interval and a request it makes.
 *
 * Fetching and preparing run as **scheduler tasks**, not as resident processes.
 * There is nothing to supervise, no restart behaviour to define, and the
 * ADR 0113 tray budget is untouched.
 *
 * The third field is the load-bearing one. A task does not *do* something; it
 * **asks**, which routes scheduled work through ADR 0139's request, ADR 0140's
 * decision and ADR 0141's history rather than beside them. A task that acted
 * directly would be a second privileged path running while nobody is looking -
 * exactly what ADR 0138 CO4 separates from answering a question.
 */
export interface PicoDepotTask {
  identifier: string;
  intervalMs: number;
  /** The effect it requests. Never a function it calls. */
  requestsEffect: string;
}

export const minPicoDepotTaskIntervalMs = 60_000;

export function parsePicoDepotTask(value: unknown): PicoDepotTask {
  const record = isRecord(value) ? value : undefined;
  if (record === undefined) {
    throw new Error('invalid_pico_depot_task');
  }
  const keys = Object.keys(record).sort();
  if (keys.length !== 3
    || keys[0] !== 'identifier' || keys[1] !== 'intervalMs' || keys[2] !== 'requestsEffect') {
    throw new Error('invalid_pico_depot_task');
  }
  if (typeof record.identifier !== 'string' || record.identifier === '') {
    throw new Error('invalid_pico_depot_task');
  }
  if (typeof record.intervalMs !== 'number'
    || !Number.isInteger(record.intervalMs)
    || record.intervalMs < minPicoDepotTaskIntervalMs) {
    // A floor rather than a free number: a task that can be scheduled every
    // second is a poller, and ADR 0138 CO4's distinction between answering and
    // sweeping stops meaning anything at that rate.
    throw new Error('invalid_pico_depot_task_interval');
  }
  if (typeof record.requestsEffect !== 'string' || record.requestsEffect === '') {
    throw new Error('invalid_pico_depot_task');
  }
  return Object.freeze({
    identifier: record.identifier,
    intervalMs: record.intervalMs,
    requestsEffect: record.requestsEffect,
  });
}

/**
 * ADR 0143 DP8. The default above which a transfer stops being routine.
 *
 * 500 MB, from the case that raised the question: cloning a knowledge base is
 * not something to do on a schedule without saying so. A deployment may lower
 * it; raising it past the point where a person would notice the disk is a
 * decision this constant makes visible rather than one buried in a caller.
 */
export const defaultPicoDepotApprovalThresholdBytes = 500 * 1024 * 1024;

/**
 * ADR 0143 DP8. Whether a transfer crosses into approval territory.
 *
 * An unknown size answers **true**, in ADR 0119 Q5's posture: the one case that
 * cannot be measured must not be the one case that is unprotected. A fetch
 * whose size nobody could estimate is precisely the one worth asking about.
 */
export function picoDepotTransferNeedsApproval(input: {
  estimatedBytes?: number;
  thresholdBytes?: number;
}): boolean {
  const threshold = input.thresholdBytes ?? defaultPicoDepotApprovalThresholdBytes;
  if (!Number.isFinite(threshold) || threshold <= 0) {
    throw new Error('invalid_pico_depot_transfer_threshold');
  }
  if (typeof input.estimatedBytes !== 'number'
    || !Number.isFinite(input.estimatedBytes)
    || input.estimatedBytes < 0) {
    return true;
  }
  return input.estimatedBytes >= threshold;
}
