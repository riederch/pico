import type { PicoActionArgument, PicoActionRequest } from './action.js';
import { picoActionEffectNamePattern } from './action.js';
import { picoOriginTrustRank } from './model-context.js';
import { picoActionRiskClasses, type PicoActionRisk, type PicoModuleEffect } from './module.js';
// ADR 0137 IN1's shape. It lives with the rules input until instances have a
// module of their own; duplicating the pattern is how the two would drift.
import { picoRulesInstancePattern } from './pico-rules.js';

/**
 * ADR 0141 RN3 - the sentence a person is asked to approve.
 *
 * ADR 0106 already decided this inside the Vault: an approval statement is
 * rendered from the same validated fields the daemon builds the signed bytes
 * from, never from a description handed over beside them. This generalises it
 * to actions, and adds the two things actions brought with them.
 *
 * **The statement has the shape of a model context, and for the same reason.**
 * ADR 0116 W3 splits a context into an instruction layer and a delimited data
 * layer. A person reading an approval is in exactly that position: Pico's own
 * sentence is the part that says what will happen, and the argument values are
 * data that must be visible without ever becoming part of the sentence. The
 * whole attack on a confirmation dialogue is to make it *say* something
 * reassuring, so untrusted text is given no route into the saying.
 *
 * Concretely: `sentence` is composed from closed, Pico-side or person-chosen
 * fields only. `arguments` carry the values that will execute, each with the
 * ADR 0139 origin class it arrived with, and are never interpolated.
 *
 * **The description is the consented one, not the declared one.** Under
 * ADR 0139 AC4 a module's effect triple is pinned when a person agrees to it,
 * so the sentence they read now is the sentence they agreed to. Taking the
 * currently declared description instead would let an update rewrite what a
 * person is agreeing to without asking again.
 *
 * Note the deliberate asymmetry with ADR 0141 RN6: a statement *shows*
 * external content, because nobody can approve sending to an address they
 * cannot see, while history never records it verbatim. Showing once to the
 * person deciding and keeping forever in a store a model may later read are
 * different acts.
 */
export const picoApprovalStatementSchema = 'pico.approval.statement.v1' as const;

export const picoApprovalDomainPattern = /^[a-z0-9]+(?:_[a-z0-9]+)*$/u;

export interface PicoApprovalSentence {
  effectName: string;
  /** The consented description (ADR 0139 AC4). Pico's own text. */
  effectDescription: string;
  risk: PicoActionRisk;
  /** ADR 0137 IN5. Which house, not just which verb. */
  instance: string | null;
  privacyDomain: string;
}

export interface PicoApprovalStatement {
  schema: typeof picoApprovalStatementSchema;
  sentence: PicoApprovalSentence;
  /** What will execute, shown as labeled data and never interpolated. */
  arguments: readonly PicoActionArgument[];
  /**
   * True when any argument arrived from outside Pico. A person deciding needs
   * to know that, and it is derived here rather than left to a surface to
   * notice.
   */
  carriesExternalContent: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
  error: string,
): void {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])) {
    throw new Error(error);
  }
}

export interface PicoApprovalStatementInput {
  /** The canonical request the runner will execute (ADR 0141 RN1). */
  request: PicoActionRequest;
  /** The effect as consented to, not as currently declared (ADR 0139 AC4). */
  consentedEffect: PicoModuleEffect;
  instance: string | null;
  privacyDomain: string;
}

/**
 * ADR 0141 RN3. Composes the statement from the fields that will execute.
 *
 * There is no parameter for a prompt, a summary or a rationale. That absence
 * is the gate, in the construction ADR 0117 X1 uses: a caller holding reader
 * prose has nowhere to put it.
 */
export function buildPicoApprovalStatement(
  input: PicoApprovalStatementInput,
): PicoApprovalStatement {
  const record = isRecord(input) ? input : undefined;
  if (record === undefined) {
    throw new Error('invalid_pico_approval_statement_input');
  }
  assertExactKeys(
    record,
    ['request', 'consentedEffect', 'instance', 'privacyDomain'],
    'invalid_pico_approval_statement_input',
  );

  const request = isRecord(record.request) ? record.request : undefined;
  const consented = isRecord(record.consentedEffect) ? record.consentedEffect : undefined;
  if (request === undefined || consented === undefined) {
    throw new Error('invalid_pico_approval_statement_input');
  }

  if (typeof request.effectName !== 'string'
    || !picoActionEffectNamePattern.test(request.effectName)) {
    throw new Error('invalid_pico_approval_effect_name');
  }
  assertExactKeys(consented, ['name', 'description', 'risk'], 'invalid_pico_approval_consented_effect');
  if (consented.name !== request.effectName) {
    // The statement would describe one effect while the runner performed
    // another, which is the exact drift ADR 0106 exists to make impossible.
    throw new Error('pico_approval_effect_mismatch');
  }
  if (typeof consented.description !== 'string' || consented.description.trim() === '') {
    throw new Error('invalid_pico_approval_consented_effect');
  }
  if (typeof consented.risk !== 'string'
    || !(picoActionRiskClasses as readonly string[]).includes(consented.risk)) {
    throw new Error('invalid_pico_approval_risk');
  }
  if (typeof record.privacyDomain !== 'string'
    || !picoApprovalDomainPattern.test(record.privacyDomain)) {
    throw new Error('invalid_pico_approval_domain');
  }
  if (record.instance !== null
    && (typeof record.instance !== 'string'
      || !picoRulesInstancePattern.test(record.instance))) {
    // An instance identifier is a person-chosen token (ADR 0137 IN1). A value
    // that is not one would be prose arriving in the sentence.
    throw new Error('invalid_pico_approval_instance');
  }
  if (!Array.isArray(request.arguments)) {
    throw new Error('invalid_pico_approval_statement_input');
  }

  const args = (request.arguments as unknown[]).map((entry) => {
    const argument = isRecord(entry) ? entry : undefined;
    if (argument === undefined) {
      throw new Error('invalid_pico_approval_argument');
    }
    assertExactKeys(
      argument,
      ['name', 'value', 'originClass'],
      'invalid_pico_approval_argument',
    );
    if (typeof argument.name !== 'string') {
      throw new Error('invalid_pico_approval_argument');
    }
    if (typeof argument.value !== 'string'
      && typeof argument.value !== 'number'
      && typeof argument.value !== 'boolean') {
      throw new Error('invalid_pico_approval_argument');
    }
    if (typeof argument.originClass !== 'string') {
      throw new Error('invalid_pico_approval_argument');
    }
    // Through the shared rank check, so no unknown class reaches a person.
    const originClass = argument.originClass as PicoActionArgument['originClass'];
    picoOriginTrustRank(originClass);
    // Rebuilt field by field rather than spread: a passthrough would carry
    // whatever else happened to be on the object into what a person reads.
    return Object.freeze({
      name: argument.name,
      value: argument.value,
      originClass,
    }) satisfies PicoActionArgument;
  });

  return Object.freeze({
    schema: picoApprovalStatementSchema,
    sentence: Object.freeze({
      effectName: request.effectName,
      effectDescription: consented.description,
      risk: consented.risk as PicoActionRisk,
      instance: record.instance as string | null,
      privacyDomain: record.privacyDomain,
    }),
    arguments: Object.freeze(args),
    carriesExternalContent: args.some(
      (argument) => argument.originClass === 'external_content',
    ),
  });
}

/**
 * ADR 0141 RN3's counter-proof, as a function rather than as review.
 *
 * Returns the field names of `sentence` whose text is not Pico's own or the
 * person's own. It should always be empty, and a test that feeds prose through
 * every entry point proves it: the sentence carries an effect name, a
 * consented description, a closed risk class, a token instance and a token
 * domain, none of which a requester or a reader can author.
 */
export function picoApprovalSentenceForeignFields(
  statement: PicoApprovalStatement,
  consentedDescriptions: readonly string[],
): readonly string[] {
  const foreign: string[] = [];
  if (!picoActionEffectNamePattern.test(statement.sentence.effectName)) {
    foreign.push('effectName');
  }
  if (!consentedDescriptions.includes(statement.sentence.effectDescription)) {
    foreign.push('effectDescription');
  }
  if (!(picoActionRiskClasses as readonly string[]).includes(statement.sentence.risk)) {
    foreign.push('risk');
  }
  if (statement.sentence.instance !== null
    && !picoRulesInstancePattern.test(statement.sentence.instance)) {
    foreign.push('instance');
  }
  if (!picoApprovalDomainPattern.test(statement.sentence.privacyDomain)) {
    foreign.push('privacyDomain');
  }
  return Object.freeze(foreign);
}
