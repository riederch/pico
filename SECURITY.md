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

**What counts as released** (decided 2026-09-10, because the word carried four
possible meanings that had come apart): a tag `v*` whose CI run ended green and
whose images and client package were published under that tag. The GitHub
release for the client package is created as a draft on purpose - a person sees
the package and its checksum before anyone can download it - and whether it has
been published out of that draft does not change which version is supported.
Security fixes go to the highest such tag.

## Scope notes

- **Every network surface this repository builds, and how it is bound.**
  Until 2026-09-10 this section named one, and by then there were more.

  | Surface | Default binding | Meant to be published |
  |---|---|---|
  | Pico Link Direct intake, `POST /api/home/link` (ADR 0107 D4) | absent unless a deployment sets both host and port | **yes**, this is the one |
  | Relay mailbox port (ADR 0149), default `3200` | all interfaces | **yes**, and it is the only port that may be forwarded from a router |
  | Relay health port, default `3201` | loopback | no |
  | Relay operator API (ADR 0154), default `3202` | loopback, and a LAN binding needs an explicit option | no |
  | Foundation HTTP/WebSocket, default `3100` (ADR 0030) | local trust boundary; the add-on forwards no port for it | no |
  | Home Assistant ingress | the Supervisor's own authenticated proxy in front of `3100` | no, and it is the Supervisor's surface rather than this product's |

  The desktop companion opens no listener at all.

  Findings against the Pico Link intake's verification order are especially
  valuable, and so are findings against the relay's door: it speaks plain HTTP
  and leaves TLS to the deployment, which is a stated property rather than an
  oversight.
- Publishing the Foundation surface is unsupported, so reports that assume its
  public exposure are design input rather than vulnerabilities.
- Cryptographic and containment claims are bounded by ADR 0016 and the
  threat-model ADRs (0031, 0071, 0075, 0079, 0080, 0081, 0116, 0117).
  The residuals named there are known and deliberate; a report showing
  a stated residual is wider than documented is still a finding.
