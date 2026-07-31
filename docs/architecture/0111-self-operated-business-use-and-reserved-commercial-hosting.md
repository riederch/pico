# 0111 - Self-Operated Business Use and Reserved Commercial Hosting

## Status

Accepted as a licensing and commercial-boundary decision. The permission is
live in `LICENSE`, `NOTICE` and `COMMERCIAL.md`. It has not been reviewed by a
lawyer, and this ADR does not claim that it has.

## Context

Until this decision, `business-internal use` sat in the list of uses that
require prior written permission. That wording made the ordinary case
impossible: a guesthouse, a workshop, a practice or a small company could not
run a Pico for itself without asking first, even when it hosted the Pico Home
entirely on its own infrastructure and shared nothing with anybody.

That is the opposite of what the project is for. Pico's whole premise is that a
person or a household runs their own companion on their own Home, with their
own keys. A small business running its own Home is the same shape. Blocking it
protected nothing, because the thing actually worth reserving is not business
use at all - it is the business of running Pico Homes for other people.

The reservation that matters is commercial Pico hosting. That is the part the
designated Pico rights holder keeps. Everything else was collateral damage from
a boundary drawn along the wrong axis: *who is using Pico* rather than *who is
operating the Home*.

The project already has precise vocabulary for the right axis. Host key
custody, who operates a Pico Home, and Home Membership are load-bearing runtime
concepts (ADR 0087, 0108, 0109). Drawing the licence along those concepts makes
the boundary describable in the same terms the software already enforces
internally, instead of in a separate vocabulary that can drift away from it.

## Scope

Covers: the axis along which the commercial boundary is drawn; what business
use is permitted without asking; what remains reserved to the designated Pico
rights holder; what a paid third-party service provider may do.

Does not cover: the base licence choice (PolyForm Noncommercial 1.0.0 stays);
trademark, naming and official-status policy (`TRADEMARK.md`); protocol
compatibility, which ADR 0025 keeps separate from commercial permission;
contributor terms (`CONTRIBUTING.md`); any runtime enforcement of the
boundary.

## Decision

### The axis is operation and key custody, not who benefits

A Pico Home is *self-operated* when the entity using it holds custody of that
Home's host keys, operates and controls the Home itself, and did not obtain
that Home from a third party as commercial hosting, a managed service or part
of a paid offering.

Self-operated business use is permitted without additional commercial
permission. An entity - business, organisation, association or other legal
entity - may run one or more Picos on its own Pico Home.

The test deliberately does not ask whether the user is a private person or a
business, whether the use is production or evaluation, or whether the entity
earns money. Those questions produced the old wrong boundary.

### Hardware ownership is not the test

Renting general-purpose infrastructure - a server, a virtual machine, storage,
connectivity - is not by itself commercial Pico hosting. An infrastructure
provider rents compute; it does not operate a Pico Home.

The test is whether the entity remains the only party that operates the Pico
Home and holds its host keys. This follows the same reasoning as ADR 0015 and
0024, where the host is infrastructure and holds no authority over residents.
A licence that keyed on hardware ownership would contradict a security model
that already keys on custody, and would exclude exactly the small entities this
permission exists for.

### Interaction is not provision

People outside the entity may interact with a Pico the entity operates, and
their own Picos and Homes may communicate with it. This holds even when the
interaction is part of what those people pay for. A guesthouse Pico answering a
paying guest is the entity's own Pico doing the entity's work.

Provision is the reserved act: another party receives a Pico or a Pico Home of
their own that the entity operates, or whose host keys the entity holds, so
that the entity runs a companion on that party's behalf. Enrolling people
outside the entity as members of a Pico Home the entity operates is provision.

Without this distinction the permission would cancel itself, because any
guest-facing use could be read as providing access to a Pico Home as part of a
paid offering.

### Working on a Home is permitted; being the Home is not

A third party may be paid to install, configure, migrate, maintain, update or
support a self-operated Pico Home on behalf of the entity that operates it.

That third party must not operate the Home as its own service, hold the host
keys as a service provider, or offer Pico Homes to its own customers.

Without this, the permission would be unusable for most of its intended
audience, since a guesthouse does not administer a Linux host. With it, paid
support remains available while the reserved business stays reserved.

### Commercial Pico hosting stays with the rights holder

Paid Pico hosting, managed Pico Home services, Home rental, multi-tenant
hosting for money, SaaS operation, operating a Pico or Home on behalf of
another party, selling Pico or Pico-based products, commercial product
integration, and redistribution or sublicensing for money continue to require
prior written permission.

## Gates

- **L1 - Licence surfaces carry the permission: Done.** `LICENSE`, `NOTICE`,
  `COMMERCIAL.md` and `LICENSE-FAQ.md` state self-operated business use, the
  interaction/provision split and the reserved hosting list.
- **L2 - Derived documents agree: Done.** `README.md`, `ReadmeTech.md`,
  `docs/protocol/public-surfaces.md` and ADR 0025's licence-boundary note no
  longer list `business-internal use` as requiring permission.
- **L3 - Legal review: Open.** No lawyer has read this wording. The definition
  of a self-operated Pico Home and the maintenance-versus-operation split are
  the two places where the drafting carries the most weight.
- **L4 - No enforcement claim: Standing.** Nothing in the runtime detects,
  restricts or reports whether a Home is self-operated. This boundary is a
  licence term, not a technical control, and no code may be described as
  enforcing it.
- **L5 - Vocabulary stays aligned: Standing.** If host key custody, Home
  operation or Home Membership change meaning in the runtime, this ADR and the
  licence texts are reviewed in the same milestone. The licence borrows these
  terms, so silent drift in the runtime would silently move a legal boundary.

## Non-goals

- replacing PolyForm Noncommercial 1.0.0 as the base licence;
- granting trademark, brand, endorsement or official-service rights;
- granting protocol compatibility status, which ADR 0025 keeps separate;
- any runtime check, telemetry, licence key or reporting mechanism;
- defining pricing or terms for the commercial permissions that remain
  reserved;
- changing what private, household or Pico WG use already permitted.

## Consequences

Positive:

- the realistic small-business case - a guesthouse running its own Picos on its
  own Home - works without asking permission, which is what the product shape
  already implied;
- the boundary is drawn along concepts the project already uses precisely,
  rather than along a separate commercial vocabulary;
- paid installation and maintenance become available, so the permission is
  usable by entities without in-house IT;
- the reserved surface is now stated as one thing, commercial Pico hosting,
  instead of a list that had grown to cover ordinary use.

Negative and residual:

- the wording is unreviewed by a lawyer, and L3 stays open;
- "operates the Home itself" is a judgement call at the edges, for example an
  administrator who holds keys for a client over a long period;
- outside parties who would benefit from their own Pico at a business - guests,
  patients, club members - cannot get one under this permission, and that case
  needs a separate decision if it ever becomes a product direction;
- the boundary is unenforceable by the software and depends entirely on the
  licence text being read and followed.

## Relationship to other ADRs

- Revises the licence-boundary note in ADR `0025`, which listed
  `business-internal use` as requiring permission; ADR 0025's compatibility
  constraint is unchanged, and compatibility still grants no commercial
  permission.
- Borrows the host-as-infrastructure reasoning of ADR `0015` and `0024` for the
  rented-infrastructure carve-out.
- Borrows host key custody and Home operation from ADR `0087`, and Home
  Membership and device enrolment from ADR `0108` and `0109`, as the terms the
  licence is drawn in.
- Independent of ADR `0110`; recovery custody is unaffected by who may use Pico
  commercially.

## References

- [ADR 0015](0015-full-clients-light-clients-and-relay.md)
- [ADR 0024](0024-server-bootstrap-tenancy-and-eviction.md)
- [ADR 0025](0025-inter-pico-communication-compatibility.md)
- [ADR 0087](0087-foundation-operator-home-host-authority-consolidation.md)
- [ADR 0109](0109-authenticated-device-lifecycle-over-pico-link.md)
- `LICENSE`, `NOTICE`, `COMMERCIAL.md`, `LICENSE-FAQ.md`, `TRADEMARK.md`
