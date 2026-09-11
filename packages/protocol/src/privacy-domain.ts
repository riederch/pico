/**
 * What a privacy domain may be called - and the disagreement this file exists
 * to make visible (finding B143).
 *
 * A privacy domain is not a label. It selects the KEK a memory item is sealed
 * under, it names what a crypto-shred destroys, and it becomes a per-domain key
 * file on disk. Two spellings of one domain are two domains, and a domain a
 * path cannot name is content that path cannot speak about.
 *
 * **The protocol said this three times and the product says something else.**
 * `picoSupplierDomainPattern`, `picoRulesDomainPattern` and
 * `picoApprovalDomainPattern` were three exported constants with one body,
 * each used only inside its own file. They are one rule now. But measured
 * against the other rules the tree applies to the same field, they disagree:
 *
 * | Name | this rule | `model-context-ref` | key store (`apps/core`) |
 * |---|---|---|---|
 * | `household` | yes | yes | yes |
 * | `my.domain` | no | yes | no |
 * | `my-domain` | **no** | yes | **yes** |
 * | `Domain` | **no** | no | **yes** |
 * | `1domain` | yes | **no** | yes |
 *
 * Seven of twelve measured names were judged differently by at least two of
 * them *before this was settled*; the table above is the state that made the
 * decision necessary, kept because it is the evidence. The consequential direction is the third column: the encrypted-memory
 * write path accepts `my-domain` and `Domain`, and this rule refuses them.
 *
 * **What keeps that from being an incident today, measured rather than
 * assumed:** the parsers this rule guards - `parsePicoRulesInput`,
 * `buildPicoApprovalStatement`, the supplier answer parser - have **no caller
 * in the product**. Only their own tests run them. What the product actually
 * applies to a privacy domain is `typeof value === 'string'` with a non-empty
 * trim on the Link operations, plus `[a-zA-Z0-9_-]{1,128}` where an encrypted
 * item is written, because there the name becomes a file name (ADR 0072).
 *
 * That was a stated rule nothing enforced, beside an enforced rule nothing
 * stated. **Settled on 2026-09-11 by the person this Home belongs to: the key
 * store's charset is the rule**, and it is spelled out below. It is the one
 * the product was applying, it is the one the file system forces, and taking
 * the other direction would have rejected domain names somebody may already
 * have.
 */

/**
 * Letters, digits, underscore and hyphen; at least one character and at most a
 * hundred and twenty-eight.
 *
 * **This is the key store's charset, taken as the rule on 2026-09-11** (the
 * decision the head of this file asked for). The reason it wins over the
 * stricter snake_case form is not taste: a privacy domain *becomes a
 * per-domain key file name* (ADR 0072), so the file system is what actually
 * constrains it, and this is the rule the product has been enforcing all
 * along. The other three said something narrower and nothing ran them.
 *
 * What that widens, named rather than glossed: `Domain`, `my-domain`,
 * `_leading` and `a__b` are legal names now. What it narrows: a name longer
 * than a hundred and twenty-eight characters is not, and a dot never was
 * admitted by the key store even though `model-context-ref.ts` used to admit
 * one.
 *
 * **A residual this rule carries and did not create:** `Domain` and `domain`
 * are two domains here and one file on a case-insensitive file system - which
 * would be two domains sharing one key. Everything this repository ships runs
 * on Linux, where they are two files; a port to a case-insensitive host has to
 * settle that before it ships, and this sentence is where it is written down.
 */
export const picoPrivacyDomainPattern = /^[a-zA-Z0-9_-]{1,128}$/u;

export function isPicoPrivacyDomain(value: unknown): value is string {
  return typeof value === 'string' && picoPrivacyDomainPattern.test(value);
}
