# 0152 - Settings say the consequence, and the measurement stands one layer behind

## Status

Status note, 2026-08-13: **SE3 and SE4 are implemented, in the store rather
than in a surface.** A settings screen enforcing "an override may narrow,
never widen" would be one screen enforcing it, and the next surface would
have to remember. Written where the value is stored, every surface inherits
it without knowing it exists - and the schema says it too, since a
measurement and a narrowing are separate columns and widening has nowhere to
be written. SE1, SE2, SE5 and SE6 stay open and are surface work.

Status note, 2026-08-13, decided by the user: **a shared finding with
per-person decisions attached.** The measurement is one row, because a
deployment is one deployment. What hangs off it is what can differ between
two residents, and it turns out to be exactly three things - the declaration
that this machine is theirs (ADR 0048, a judgement about premises nobody can
measure), the standing consent, and what they let it carry (ADR 0151 PV1),
plus the credential that earns the wider allowance.

**Those are exactly the fields an entry carries beside its measurement**,
which is not a coincidence: an entry *is* what one person's decisions make of
one shared finding. So an entry is composed on read rather than stored, and
**a person with no decision has no entry** - not the Home's. ADR 0138's title
is the rule: reaching outside is off until somebody says so, and an absent
row is an absent decision rather than a quiet yes.

Revoking keeps the row with a date on it. "Withdrew on the 14th" and "was
never asked" are different facts, and a surface that showed them alike would
be inventing one of them.

**The question this ADR left open about which surface hosts it is already
answered elsewhere**, which is worth recording rather than re-deciding: ADR
0113 rejected a browser surface as the product form, and ADR 0112 calls the
Foundation HTTP surface diagnosis rather than product. So the settings
surface is the companion's, not the web dashboard's. The second open
question - whether a Home with several residents renders one shared entry
with per-person decisions attached or the reverse - is untouched.

Accepted 2026-08-13; concept-only. No settings surface exists, and nothing
it would configure exists either - the provider registry, job queue and
runtime are all unbuilt.

Decided because the model configuration needs a place, and "a config menu,
friendly, with optional technical depth" is a shape that collides with two
accepted rules unless it is written down carefully. It also fixes the home
of ADR 0104 S3, which has been waiting for a settings surface since
`memory_encryption` was named as debt.

## Context

ADR 0104 decided that anything a person decides is set in Pico, and named
two violations that stay until a settings surface exists. Nothing has been
built since, so the rule holds as a rule and not as a place.

The first thing that needs that place is the model provider. ADR 0142
decided what an entry contains, ADR 0048 which classes exist and what may
leave the device, and ADR 0151 what an entry carries when its provider
cannot prove who it is. All three describe facts and judgements a person
has to be able to see and set, and none of them says where.

**The obvious shape is wrong twice.** A settings menu with sensible
defaults and an "advanced" section is how this is normally built, and both
halves of that sentence fail here:

- *Defaults*: ADR 0142 PE2 says capacity fields carry observed values, not
  advertised ones. A default context length is an advertised number wearing
  a friendlier hat. The measured host declares 32768 and serves 8192.
- *Advanced*: ADR 0151 PV4 says the wider allowance is unwritable without
  the credential that earns it. An allowance that can be switched on in a
  technical section is a decision that has been moved away from the person
  it belongs to, not simplified for them.

So "friendly" cannot mean "we chose for you". It has to mean something
else, and that is what this decides.

## Scope

Covers: how a person-facing settings surface layers what it shows, which
values may be edited where, what an expert override may and may not do,
and what may never be moved out of the simple layer.

Does not cover:

- which surface hosts it first, which stays open below;
- what an entry contains (ADR 0142), which classes exist (ADR 0048) or
  what an unproven provider carries (ADR 0151);
- the registry, job envelope and runtime, none of which exist;
- the visual design language, which ADR 0013 owns;
- authentication for the surface itself.

## Decision

### Friendly means Pico does the work and speaks in consequences

The simple layer says what a setting *means*. The layer behind it says what
it *is*.

"It sees this conversation" is the consequence. "8192 characters of
context, one lane, 31 s cold load, digest `sha256:...`" is the fact. Both
are true, one is what a person decides with, and the second is not a reward
for expertise - it is one interaction away, always, for everyone.

The work Pico does instead of asking is **measuring**. A person supplies
what only they know - an address, a credential, a judgement about their own
premises - and Pico supplies everything that can be observed. That is what
makes the friendly layer short: not fewer decisions, fewer questions with
no answer the person could have.

### The simple layer is never a lossy summary of a decision

A sentence in the simple layer is either true on its own or it does not
belong there.

This is the failure mode the shape invites: a summary that reads well,
hides a condition, and is corrected in the advanced panel nobody opens. If
something cannot be said truthfully in one sentence, it goes behind the
disclosure **or** it blocks - it never becomes a shorter sentence that is
slightly wrong.

### Two things never move behind the disclosure

The **allowance** - this turn, or this turn and retrieved memory - and the
**declaration** that a machine is the person's own.

Both are judgements rather than parameters. ADR 0048 says outright that
Pico cannot tell from an address whether a machine stands in a person's
home, and ADR 0151 PV1 says the proof buys the memory rather than the
provider. A flow that arrives at either by not asking has not defaulted, it
has assumed - and the thing assumed is whose words leave the house.

### Three things are never editable in the simple layer

Measured capacity, the model digest, and the transport rule for a
credential.

Capacity because PE2 makes it a finding rather than a preference. The
digest because PE6 makes a mismatch a refusal, and a refusal a person can
edit away in two clicks is not one. The transport rule because PV5 refuses
an entry outright rather than narrowing it, and a refusal is not a setting.

They are all *visible* in the simple layer, in words. Visible and editable
are different, and this ADR relies on the difference.

### An override may narrow. It may never widen

This is the gate that keeps the advanced section from undoing the ADR it
sits under.

A person who sets a smaller context than was measured has stated a
preference, and Pico honours it. A person who sets a larger one has made a
claim about a deployment that was measured saying otherwise - which is
precisely the advertised-number problem PE2 exists to prevent, arriving
through the expert panel instead of the entry form.

Widening refuses and does not trim, the way ADR 0119 Q5's ceilings do: the
answer is "this host was measured at 8192", not a silently clamped 8192
that lets the person believe the larger number took effect.

The same rule reads correctly for every other measured field: fewer lanes
than measured is a preference, more is a claim; a shorter keep-alive is a
preference, a longer one is a claim about somebody else's memory.

### Bad news is simple, not advanced

ADR 0118 O2 rules that a provider answering slowly is unavailable rather
than slow, and ADR 0142 measured a host that is genuinely fast, genuinely
slow or genuinely absent depending on nothing the caller can see - 8 to 31
seconds of load after an idle period.

So the simple layer distinguishes **loading** from **gone**, in words. The
difference decides whether a person waits or goes looking, and a surface
that renders both as a grey dot has made the technical layer mandatory for
the one question everybody has.

A changed model digest is the same kind of news and gets the same
treatment: it appears as a sentence about what happened, with re-pinning as
a deliberate act rather than a dismissable warning.

### One settings surface, and the model is its first tenant

Not a model configuration window beside a settings window.

ADR 0104 S3 has been open for `memory_encryption` since it was named as
debt, and S5 wants the twelve `PICO_*` variables split into deployment
parameters and settings. Those are the same surface as this one. Building a
bespoke provider screen would produce two places where a person looks for
their own decisions, which is the shape ADR 0104 objected to in the first
place.

## Gates

**Status of SE1-SE6, audited against the code on 2026-08-14.** They were
written as concepts and four of them were built while nobody updated the list.
SE5 was the one that had not been, and the audit is what found it.

- **SE1, SE2, SE3: implemented.** `picoCompanionModelProviderLines` is the one
  place the person-facing words are chosen, and it leads with the consequence;
  the allowance and the declaration are the headline rather than a detail
  behind a disclosure; the measurement is shown and is not editable there -
  narrowing lives on the host surface, in the class ADR 0087 puts it in.
- **SE4: implemented.** `PicoModelProviderRegistry.narrow` refuses a widening
  and names the measurement it was measured against, the route answers `409`
  with that measurement, and the dashboard prints it. It refuses without
  trimming, in ADR 0119 Q5's posture.
- **SE5: implemented 2026-08-14, and it was the gap this audit was for.**
  Until then a provider that had been unreachable for a day looked exactly like
  one that was idle: the surface could say decided or not decided and nothing
  else. The state is now derived from the job queue - never remembered, because
  a second record of the same fact goes stale exactly when the thing it
  describes changes - and three of the five states carry a sentence:

  - **working** and **did not answer** are different absences, which is SE5's
    demand: one ends by itself and the other needs somebody, and a first answer
    after a quiet spell may legitimately take as long as ADR 0142 PE4's
    declared residency.
  - **a different model** is neither. It is a sentence about a deliberate
    re-pin, never a dismissable warning, because the numbers the decision was
    made on were measured against the old weights.
  - **answered** and **not used yet** say nothing extra, deliberately: a note
    on a machine that is doing its job is noise, and noise is what makes the
    other three stop being read.

  A job's own refusal is never rendered as the provider's state. A role that
  may not run on this class or an answer in the wrong shape is a fact about
  that job, and showing it as a broken machine would send somebody to restart
  something that is answering perfectly.

  This also gave ADR 0118 O4's `no_model` the source it had been waiting for
  since the vocabulary was written: only *decided* entries count, and a Home
  that has asked nothing reports not-knowable rather than absence.
- **SE6: implemented.** The person's decisions are on their own device, and
  the host half sits beside `memory_encryption` and the relay account in one
  Foundation surface. There is no second place for either.

Original gate text follows.

- **SE1 - Two layers, one truth (concept-only):** the simple layer states
  the consequence, the layer behind it states the measurement. Both are
  true; neither is a reward. A sentence that is only true with a condition
  attached does not appear in the simple layer in a shorter form - it goes
  behind the disclosure or it blocks.

- **SE2 - The allowance and the declaration stay in front (concept-only):**
  neither may be reached by not asking, and neither may live in an advanced
  section. ADR 0151 PV1/PV4 and ADR 0048's declaration are judgements about
  whose words leave the house.

- **SE3 - Measured capacity, digest and transport rule are visible and not
  editable in the simple layer (concept-only):** PE2 makes capacity a
  finding, PE6 makes a digest mismatch a refusal, PV5 makes an unprotected
  credential a refusal. Visible and editable are different.

- **SE4 - Overrides narrow, never widen (concept-only):** narrower than
  measured is a preference and is honoured; wider than measured is a
  measurement claim the person cannot make, and it **refuses without
  trimming**, in ADR 0119 Q5's posture. Applies to every measured field,
  not only context.

- **SE5 - Loading and gone are told apart in the simple layer
  (concept-only):** ADR 0118 O2's three states appear as words, not as one
  indicator. A changed digest appears as a sentence with a deliberate
  re-pin, never as a dismissable warning.

- **SE6 - One settings surface (concept-only):** the model provider is its
  first tenant, beside ADR 0104 S3's `memory_encryption` and S5's split of
  deployment parameters from settings. No second place for a person's own
  decisions.

- **SE7 - The host half has a surface: done 2026-08-14.** The two halves are
  in the two places their access classes name. A person's decision about their
  own words is on their own device, because ADR 0087 says host administration
  may not answer for a resident; **what computes here** is host administration
  and sits in the Foundation dashboard, beside the retention policies it shares
  a class with.

  What the list shows is what SE1 and SE3 ask for, and one addition that the
  rendering made obvious: **the measurement carries its date.** ADR 0142's
  posture is measured rather than advertised, and a figure with no date is an
  advertisement again - one taken while the machine was idle says nothing about
  the machine that has been busy since.

  **Measured and effective are shown as two numbers.** Collapsing them would
  hide which of the two a person is looking at, and only one of them is a
  decision somebody here made and can revisit. The SE4 refusal reaches the
  surface with the measurement it names, for the same reason it carries it at
  all.

### What "friendly" costs here, and where it is paid

A person who supplies no credential gets a Pico whose model sees the
current turn and never their memory. ADR 0151 recorded that as a negative
consequence and left it to be said somewhere. **This is the somewhere.** It
is a quiet outcome rather than a refusal, so the surface states it plainly
at the point the choice is made, and not only in a help page.

Measuring takes time - 31 s of cold load before any number is real - so the
friendly flow has a wait in it that no design removes. It is spent once per
entry rather than per job, and the alternative is an entry PE2 forbids.

## Questions this ADR does not decide

**Which surface hosts it first.** The candidates are the web dashboard
(ADR 0039's Foundation surface), a companion window reached from the tray
(ADR 0130), and Android as a full client (ADR 0131). This is a product
decision about where a person expects to find their own settings, and it is
the user's rather than an engineering consequence of anything decided here.

**Whether a Home with several residents shows one entry or several.** The
entry is a measured fact about one deployment and the consent is per
person, so the surface has to render a shared finding with per-person
decisions attached. Which of the two is the outer object is undecided.

## Non-goals

- A progressive-disclosure pattern for its own sake. SE1 is a constraint on
  truthfulness, not a layout preference.
- Hiding technical detail. It is one interaction away for everyone, and it
  is where the honest numbers live.
- Deciding the visual design, which is ADR 0013's.

## Consequences

Positive:

- ADR 0104 S3 gets a home, and the two named violations get a path;
- the advanced section cannot undo the ADRs it sits under, because SE4
  makes widening a refusal rather than an override;
- the one question everybody asks - is it there or is it thinking - is
  answerable without opening anything.

Negative and residual:

- SE4 means an expert who knows their host better than the measurement
  cannot say so, and re-measuring is the only way to move a ceiling up.
  That is the intended trade and it will feel wrong to somebody;
- SE1 forbids the short-but-slightly-wrong sentence, which is the sentence
  most settings screens are made of, so the copy is harder to write than
  usual;
- nothing here is enforceable by a check yet, because no surface exists.

## Relationship to other ADRs

- **ADR 0104** owns the rule this gives a place to, and S3/S5 are its
  waiting tenants.
- **ADR 0142** PE2 and PE6 are why capacity and digest are findings rather
  than fields.
- **ADR 0151** PV1/PV4/PV5 are why the allowance stays in front and why an
  unprotected credential refuses.
- **ADR 0048** owns the declaration this surface asks for.
- **ADR 0118 O2** is why loading and gone must be told apart.
- **ADR 0119 Q5** is the posture SE4 borrows: a durable ceiling refuses
  rather than trimming what it was handed.
- **ADR 0013** owns how this looks; this owns what it may say.

## References

- ADR 0013 - visual design language
- ADR 0039 - Foundation WebSocket ticket boundary
- ADR 0048 - model capability delegation and remote inference boundary
- ADR 0104 - settings belong to Pico, not to host configuration
- ADR 0118 - offline and model-free degradation contract
- ADR 0119 - resource exhaustion and denial-of-service posture
- ADR 0130 - every desktop operates through the companion
- ADR 0131 - Android is a full client, not a surface
- ADR 0142 - a provider entry states what one host was measured to do
- ADR 0151 - a provider proves who it is, or carries only the live turn
