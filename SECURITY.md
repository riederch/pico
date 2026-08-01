# Security Policy

## Project status

Pico is foundation-stage software. The decision-versus-implementation
state of every security-relevant ADR is tracked in
[docs/architecture/implementation-status.md](docs/architecture/implementation-status.md);
an accepted ADR is not an implementation claim, and reserved or
draft-only protocol surfaces carry no security, conformance or
compatibility claims. There is no production deployment posture yet:
the Foundation HTTP/WebSocket surface is local diagnostic
infrastructure, not a public API.

## Reporting a vulnerability

Please use GitHub private vulnerability reporting: open the
repository's **Security** tab and choose **Report a vulnerability**.
Please do not open public issues or pull requests for unresolved
security findings.

If private reporting is not available to you, contact the maintainer
through GitHub: <https://github.com/riederch>.

A useful report names the affected surface (file, route, protocol
operation or ADR), what an attacker gains, and how to reproduce it.
Findings against decided-but-unbuilt designs - ADR-level flaws - are
explicitly welcome: at foundation stage a design finding is cheaper to
fix than it will ever be again.

## Response expectation

Pico is maintained by a single maintainer. Reports are handled on a
best-effort basis: expect an acknowledgement within days, not hours,
and no fixed disclosure timeline. There is no bug bounty program;
reporters are credited in the fixing release's notes unless they prefer
otherwise.

## Supported versions

Only the latest released version receives security fixes. There are no
backports.

## Scope notes

- The Foundation HTTP/WebSocket surface is a local trust boundary
  (ADR 0030). Publishing it is unsupported, so reports that assume its
  public exposure are design input rather than vulnerabilities.
- The only surface designed for network publication is the Pico Link
  intake (ADR 0107); findings against its verification order are
  especially valuable.
- Cryptographic and containment claims are bounded by ADR 0016 and the
  threat-model ADRs (0031, 0071, 0075, 0079, 0080, 0081, 0116, 0117).
  The residuals named there are known and deliberate; a report showing
  a stated residual is wider than documented is still a finding.
