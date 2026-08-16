import {
  picoEventOriginClasses,
  type PicoEventOriginClass,
} from './index.js';
import {
  lowestPicoOriginClass,
  picoInstructionThresholdOriginClass,
  picoOwnDerivationOriginClass,
  type PicoModelContextUnit,
} from './model-context.js';
import {
  picoModelRoles,
  type PicoModelRole,
} from './planner-reader.js';
import type {
  PicoModelProviderAllowance,
  PicoModelProviderClass,
} from './model-provider.js';
import {
  parsePicoModelContextRef,
  picoModelContextRefBelongsTo,
  type PicoModelContextRef,
} from './model-context-ref.js';

/**
 * ADR 0117 X4 - the job a quarantined reader is given, and the two things it
 * cannot be given.
 *
 * ADR 0116 W3 contains hostile bytes by shaping the context; ADR 0117 removes
 * them from the acting model entirely, by giving the dangerous work to a
 * reader that holds no tools and answers in declared values. X1 and X2 built
 * the admission rule and the answer shape. **What was missing is the job**:
 * the thing that actually leaves this Pico, and therefore the place where both
 * of the split's guarantees have to be true at once or neither is.
 *
 * **A reader has no tools, and the field cannot say otherwise.** Not
 * `toolAccessAllowed: false` as a default somebody may flip - there is no
 * `true` to write. A reader that could call a tool is an acting model reading
 * a stranger's mail, which is the arrangement this whole ADR exists to
 * prevent, and a boolean is a poor place to keep that promise.
 *
 * **A planner never leaves the Pico trust boundary.** ADR 0048's provider list
 * has six entries and four of them are Picos; the fifth is somebody else's
 * service and the sixth is a bare inference host. A planner carries the
 * person's own instructions and decides what happens next, so it may run on
 * the four and never on the other two. A reader may run anywhere its content
 * is allowed to go - which is a different question, decided below.
 */

export const picoModelJobSchema = 'pico.model.job.v1' as const;

/**
 * ADR 0048's classes that are inside the Pico trust boundary.
 *
 * Listed rather than derived from a negation, so adding a class later is a
 * decision somebody makes on purpose. A class that is not here is not a Pico:
 * the hosted connector is somebody else's service, and the declared own host
 * runs no Pico at all, which is the property that made it a sixth class.
 */
export const picoTrustBoundaryProviderClasses = [
  'same_device',
  'pico_home',
  'pico_vault',
  'pico_endpoint',
] as const;

/**
 * ADR 0117 X4. Where a role may run.
 *
 * The reader is unrestricted *here* on purpose. What limits a reader is the
 * origin of what it reads, and that is ADR 0151's allowance rather than this
 * boundary - two orthogonal restrictions that would be wrong to merge, since
 * one is about who may decide and the other about whose words travel.
 */
export function picoModelRoleMayRunOn(
  role: PicoModelRole,
  providerClass: PicoModelProviderClass,
): boolean {
  if (role !== 'planner') {
    return true;
  }
  return (picoTrustBoundaryProviderClasses as readonly string[]).includes(providerClass);
}

/**
 * ADR 0151 PV3 with ADR 0048, and the question ADR 0151 left open.
 *
 * That ADR recorded a gap: "ADR 0117 X4's quarantined read is neither the live
 * turn nor retrieved memory", which left the nearest delegable job unable to
 * say which allowance it needs. **The gap closes by asking a different
 * question.** The allowance is not a property of the job *type* - it is a
 * property of whose words the job carries, and ADR 0116 W2 already labels
 * every unit with exactly that.
 *
 * So: a read over the person's own words needs the live turn and nothing more.
 * A read over anything else - a stranger's mail, a housemate's note, a synced
 * item - carries words their author never offered to a provider, which is the
 * thing ADR 0048's split protects and the reason the sixth class exists.
 *
 * **This is the conservative reading and it is one line.** The alternative -
 * that freshly arrived foreign content is not "retrieved memory" and so may
 * travel under the narrower allowance - is arguable from ADR 0048's wording
 * and not from its reasoning, which is about second parties learning what
 * people wrote. If it is ever taken, it is taken here, visibly, rather than by
 * a job quietly declaring what suits it.
 *
 * **The threshold moved on 2026-08-16, and one line is where it moved.**
 * `own_pico` used to force the wider allowance because it sits below ADR
 * 0116's instruction threshold - and that threshold answers a different
 * question. What may *instruct* and whose words are *disclosed* are not the
 * same test, and using one constant for both made a summary of somebody's own
 * notes into a thing they needed a proven provider to ask about.
 *
 * A derivation of the person's own words is still their words. The provider
 * that would receive it is, in the ordinary case, the one that wrote it. So
 * the disclosure question stops at `own_pico`, and the instruction question
 * does not move at all: ADR 0116 W3 still keeps Pico's own output out of the
 * instruction layer, which is the rule that breaks laundering.
 *
 * Below `own_pico` nothing changes. A housemate's note, a synced item and a
 * stranger's mail carry words their author never offered to a provider, which
 * is exactly what ADR 0048's split protects.
 */
export function picoModelJobAllowanceFor(
  units: readonly PicoModelContextUnit[],
  references: readonly PicoModelContextRef[] = [],
): PicoModelProviderAllowance {
  if (references.length > 0) {
    /**
     * ADR 0060. A reference *is* retrieved memory - a bounded packet prepared
     * from a store for this job - so a job carrying one carries the thing this
     * allowance is named after, whatever class the packet holds.
     *
     * This is why a library read stays wide: its excerpt is `own_pico` because
     * a tracked corpus is the person's own material, and it is still material
     * fetched out of a store rather than the words of the turn.
     */
    return 'live_turn_and_retrieved_memory';
  }
  const lowest = lowestPicoOriginClass(units.map((unit) => unit.originClass));
  return lowest === picoInstructionThresholdOriginClass
    || lowest === picoOwnDerivationOriginClass
    ? 'live_turn'
    : 'live_turn_and_retrieved_memory';
}

export interface PicoModelJob {
  schema: typeof picoModelJobSchema;
  jobId: string;
  role: PicoModelRole;
  /** The origin-labelled units this job reads, in ADR 0116 W3's shape. */
  units: readonly PicoModelContextUnit[];
  /**
   * ADR 0060. Bounded packets of memory prepared for this job, so a provider
   * is handed what it needs and never reads a source. Empty is ordinary: a
   * read over freshly arrived content needs none.
   */
  references: readonly PicoModelContextRef[];
  /** ADR 0117 X2. The names and shapes the answer must arrive in. */
  expects: readonly PicoModelJobExpectation[];
  /**
   * ADR 0151 PV3. Computed from the units rather than declared, so a job
   * cannot understate what it carries. Present because the allowance travels
   * with the job and is checked where it lands.
   */
  carries: PicoModelProviderAllowance;
}

export interface PicoModelJobExpectation {
  name: string;
  type: string;
}

const jobIdPattern = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;
const namePattern = /^[a-z][a-z0-9_]{0,63}$/u;
export const maxPicoModelJobExpectations = 64;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The fields a job has no place for, kept as data because an absent field
 * cannot document itself.
 *
 * `toolAccessAllowed` is the one that matters and the one somebody will write.
 * ADR 0117 X4 names it as a field set to false; **a field that is always false
 * is not a field**, it is a promise stored where a future edit can find it.
 * Refusing the name outright says the same thing in a way no edit reaches.
 */
export const picoModelJobSaysNothingAbout = Object.freeze({
  toolAccessAllowed:
    'ADR 0117 X4: a reader holds no tools, so there is no field to set. A job '
    + 'that could carry `true` is one edit away from an acting model reading a '
    + 'stranger\'s mail, which is the arrangement the planner-reader split '
    + 'exists to prevent.',
  tools:
    'ADR 0117 X4: same rule, said the way somebody would actually write it. '
    + 'The reader answers in declared values and causes nothing.',
  systemPrompt:
    'ADR 0116 W3: instructions come from the assembled context, where only '
    + 'the present person and Pico\'s own policy reach the instruction layer. '
    + 'A second prompt beside it would be an unlabelled instruction channel.',
  providerHint:
    'ADR 0049: a job does not choose its provider. Which entry runs it is '
    + 'decided from the role, the allowance and what is available - none of '
    + 'which a job is entitled to override.',
});

/**
 * ADR 0117 X4. Refuses rather than repairing, for X2's reason: a job that
 * half-parsed is one nobody asked for.
 */
export function parsePicoModelJob(value: unknown, nowMs: number): PicoModelJob {
  if (!isRecord(value)) {
    throw new Error('invalid_pico_model_job');
  }
  for (const [field, reason] of Object.entries(picoModelJobSaysNothingAbout)) {
    if (field in value) {
      throw new Error(`pico_model_job_says_nothing_about_${field}: ${reason}`);
    }
  }

  const keys = Object.keys(value).sort();
  const expected = ['carries', 'expects', 'jobId', 'references', 'role', 'schema', 'units'];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error('invalid_pico_model_job');
  }

  if (value.schema !== picoModelJobSchema) {
    throw new Error('invalid_pico_model_job_schema');
  }
  if (typeof value.jobId !== 'string' || !jobIdPattern.test(value.jobId)) {
    throw new Error('invalid_pico_model_job_id');
  }
  if (typeof value.role !== 'string'
    || !(picoModelRoles as readonly string[]).includes(value.role)) {
    throw new Error('invalid_pico_model_job_role');
  }
  const role = value.role as PicoModelRole;

  if (!Array.isArray(value.units) || value.units.length === 0) {
    // Absent is not empty. A job with nothing to read is not a read.
    throw new Error('invalid_pico_model_job_units');
  }
  const units: PicoModelContextUnit[] = [];
  for (const unit of value.units as unknown[]) {
    if (!isRecord(unit)
      || typeof unit.text !== 'string'
      || unit.text === ''
      || typeof unit.originClass !== 'string'
      || !(picoEventOriginClasses as readonly string[]).includes(unit.originClass)) {
      throw new Error('invalid_pico_model_job_unit');
    }
    units.push(Object.freeze({
      text: unit.text,
      originClass: unit.originClass as PicoEventOriginClass,
      ...(typeof unit.label === 'string' ? { label: unit.label } : {}),
    }) as PicoModelContextUnit);
  }

  if (!Array.isArray(value.references)) {
    throw new Error('invalid_pico_model_job_references');
  }
  const references: PicoModelContextRef[] = [];
  for (const reference of value.references as unknown[]) {
    const parsed = parsePicoModelContextRef(reference, nowMs);
    if (!picoModelContextRefBelongsTo(parsed, value.jobId)) {
      // Well-formed and misdelivered, which is a different fault from
      // malformed and deserves its own word. A packet prepared for another job
      // is another job's disclosure decision.
      throw new Error('pico_model_job_reference_belongs_to_another_job');
    }
    references.push(parsed);
  }

  if (!Array.isArray(value.expects) || value.expects.length === 0) {
    // ADR 0117 X2. A reader that was told nothing about the shape of its
    // answer is a reader answering in prose, which is the channel the split
    // closed.
    throw new Error('invalid_pico_model_job_expects');
  }
  if (value.expects.length > maxPicoModelJobExpectations) {
    throw new Error('pico_model_job_expects_too_many');
  }
  const expects: PicoModelJobExpectation[] = [];
  for (const expectation of value.expects as unknown[]) {
    if (!isRecord(expectation)
      || typeof expectation.name !== 'string'
      || !namePattern.test(expectation.name)
      || typeof expectation.type !== 'string') {
      throw new Error('invalid_pico_model_job_expectation');
    }
    expects.push(Object.freeze({ name: expectation.name, type: expectation.type }));
  }
  if (new Set(expects.map((expectation) => expectation.name)).size !== expects.length) {
    throw new Error('duplicate_pico_model_job_expectation');
  }

  if (role === 'planner'
    && [...units.map((unit) => unit.originClass),
      ...references.map((reference) => reference.originClass)]
      .some((originClass) => originClass !== picoInstructionThresholdOriginClass)) {
    // ADR 0117 X1's admission rule, at the job boundary. A planner job holding
    // below-threshold text is the split undone: the acting model would be
    // reading the bytes again, whatever the delimiters said.
    //
    // **Checked before the allowance, and the order is the message.** Both
    // faults are real, but one is fixable by editing a field and the other
    // says this job must not exist. Reporting the field first would send an
    // author off to correct `carries` and meet this wall afterwards, having
    // been told the problem was bookkeeping.
    throw new Error('pico_planner_job_carries_foreign_content');
  }

  // **Computed, then compared.** A job that declared a narrower allowance than
  // its units carry would be a job understating whose words it holds, and the
  // check has to be here rather than at the provider: by the time an entry
  // sees a job, the units are already inside it.
  const required = picoModelJobAllowanceFor(units, references);
  if (value.carries !== required) {
    throw new Error(
      value.carries === 'live_turn'
        ? 'pico_model_job_understates_what_it_carries'
        : 'invalid_pico_model_job_allowance',
    );
  }

  return Object.freeze({
    schema: picoModelJobSchema,
    jobId: value.jobId,
    role,
    units: Object.freeze(units),
    references: Object.freeze(references),
    expects: Object.freeze(expects),
    carries: required,
  });
}

/**
 * ADR 0117 X4 with ADR 0151 PV3. Whether this job may run on this entry.
 *
 * Two questions, deliberately answered separately: **may this role run there**
 * - a planner outside the Pico trust boundary is a stranger deciding what
 * happens next - and **may these words travel there**, which is the allowance.
 * A job can fail either and the caller should be able to say which.
 */
export function picoModelJobRefusal(
  job: PicoModelJob,
  entry: { providerClass: PicoModelProviderClass; carries: PicoModelProviderAllowance },
): 'role_outside_trust_boundary' | 'entry_may_not_carry_these_words' | null {
  if (!picoModelRoleMayRunOn(job.role, entry.providerClass)) {
    return 'role_outside_trust_boundary';
  }
  if (job.carries === 'live_turn_and_retrieved_memory'
    && entry.carries !== 'live_turn_and_retrieved_memory') {
    return 'entry_may_not_carry_these_words';
  }
  return null;
}
