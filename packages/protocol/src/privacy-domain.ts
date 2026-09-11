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
 * Seven of twelve measured names are judged differently by at least two of
 * them. The consequential direction is the third column: the encrypted-memory
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
 * So this is a stated rule nothing enforces, beside an enforced rule nothing
 * states. Which of them is *the* rule is a product decision and not a
 * refactoring one; it is written up as an open decision rather than settled
 * here, because settling it either rejects domain names a person may already
 * have or widens what a key file may be called.
 */

/**
 * Lowercase words joined by single underscores. No dots, no hyphens, no
 * leading or trailing separator.
 */
export const picoPrivacyDomainPattern = /^[a-z0-9]+(?:_[a-z0-9]+)*$/u;

export function isPicoPrivacyDomain(value: unknown): value is string {
  return typeof value === 'string' && picoPrivacyDomainPattern.test(value);
}
