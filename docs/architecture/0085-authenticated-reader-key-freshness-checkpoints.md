# 0085 - Authenticated Reader-Key Freshness Checkpoints

## Status

Status note, 2026-08-26: **die besitzerseitige Veröffentlichung gibt es jetzt -
für den einen Fall, für den sie ohne Verabredung auskommt.** Die Konsequenz
unten sagte: *„Production still needs deployment-specific owner-side checkpoint
publication."* Gemessen fehlten dafür genau zwei Dinge, und keines davon war
Kryptographie: der Erzeuger `createPicoIdentityReaderKeyFreshnessCheckpoint`
stand seit jeher in `@pico/vault` und hatte **nur Tests als Aufrufer**, und die
Ablage aus ADR 0089 hatte für ein Gerät keine Tür - ihr einziger Eingang war
eine `home-authority-relay`-Route, also ein zweites Home oder eine
Betreiber-Sitzung.

`home.reader_key.freshness.submit` ist diese Tür. Der Prüfer ist unverändert:
exakte Wurzel, exakte Bindung, höchstens fünf Minuten, Rückroll-Böden, kein
Zwischenspeicher.

**Wessen Wurzel unterschreibt, entscheidet, wer wach sein muss** - und das war
die Erkenntnis, die den Zuschnitt bestimmt hat. Diese ADR lässt nur die Wurzel
des *Lesers* unterschreiben. Bei einem eigenen zweiten Gerät ist das dieselbe
Wurzel, sie liegt im eigenen Vault, und niemand sonst muss antworten. Bei einer
anderen Person muss *ihr* Gerät innerhalb derselben fünf Minuten antworten;
dafür gibt es keinen Weg, und das bleibt eine benannte Lücke statt einer
stillen.

Der Nachweis wird über die zustimmungsfreie `sign`-Familie erzeugt, und das ist
richtig: er schafft keine Autorität, er stellt fest, dass keine spätere Aussage
die Bindung ungültig macht, und er muss alle fünf Minuten wiederholbar sein.
Vier Minuten statt fünf beim Ausstellen, weil ein Nachweis am Deckel von jeder
Uhrabweichung zu einem wird, der abgelaufen ankommt.

Accepted and implemented for the ADR 0083
`PicoIdentityReaderKeyFreshnessSource` boundary. This ADR defines canonical
identity-root-signed checkpoint bytes and a fail-closed Registry/Sync adapter.
It does not define a public registry service, Pico Link transport, identity-key
recovery or durable global consensus.

## Context

ADR 0083 deliberately left production share-envelope issuance unavailable.
Core could validate a returned freshness result, but there was no concrete
adapter that authenticated where the result came from. An implementation could
therefore have treated TLS, an HTTP response field or a locally restored row as
proof that a reader delegation remained globally current.

ADR 0053 already fixes the authority boundary:

```text
A registry makes lifecycle status discoverable.
It does not become identity authority.
```

The owning Pico identity root issues delegation and revocation statements. The
Home Host, Foundation operator, Relay and Registry/Sync transport have no
authority to contradict those statements or mint equivalent reader authority.

## Decision

### Authority

Only the exact `pico_identity` root named by the reader delegation signs a
reader-key freshness checkpoint. Registry/Sync transports the complete signed
record. Its endpoint identity and the non-secret `sourceRef` may support
operations and diagnostics, but neither is authorization.

This choice has an operational cost: an owner-side component with approved
access to the identity-root Vault session must periodically publish short-lived
checkpoints. That is preferable to promoting a cloud registry, Relay, Home Host
or Foundation operator into identity authority. A future root-delegated
checkpoint signer would require its own canonical delegation family and ADR; it
is not inferred here.

The registry cannot make a locally unknown key usable. Core still requires the
complete, identity-signed delegation, both reader scopes, active Home
membership and the exact registered key-agreement public record. The checkpoint
adds only a short-lived assertion that the identity has observed no later
lifecycle state invalidating that exact binding.

### Canonical checkpoint

The record schema is:

```text
pico.identity.reader-key-freshness-checkpoint.v1
```

Its detached Ed25519 signature input starts with:

```text
pico.id.reader-key-freshness.v1
```

and uses the existing `pico.suite.id.v1` length-prefixed canonical element
encoding in this exact order:

1. signature-input label;
2. suite;
3. checkpoint id;
4. Home id;
5. issuer Pico identity key fingerprint;
6. device signing-key fingerprint;
7. device key-agreement fingerprint;
8. delegation id;
9. status (`current` or `revoked`);
10. observed-through lifecycle order;
11. check instant; and
12. freshness end instant.

The wrapper carries exactly the schema, checkpoint fields, issuer identity
public-key record and detached signature. It contains no private key, device
secret, KEK, envelope, content or bearer credential.

`sourceRef` is intentionally outside the signed record. It names the lookup
transport for diagnostics, not an authority. Conversely, every field that can
change the reader-key decision is inside the identity-root signature.

### Authoritative byte vectors

Current exact binding, 325 bytes:

```text
0000001f7069636f2e69642e7265616465722d6b65792d66726573686e6573732e7631000000107069636f2e73756974652e69642e76310000001766726573686e6573735f32303236303732375f3030303100000012686f6d655f32303236303731385f303030310000002011111111111111111111111111111111111111111111111111111111111111110000002022222222222222222222222222222222222222222222222222222222222222220000002033333333333333333333333333333333333333333333333333333333333333330000001264656c5f3031687a78386d397134727435760000000763757272656e74000000147365713a3030303030303030303030303030303200000018323032362d30372d32375431303a30303a30302e3030305a00000018323032362d30372d32375431303a30353a30302e3030305a
```

Later revoked binding, 325 bytes:

```text
0000001f7069636f2e69642e7265616465722d6b65792d66726573686e6573732e7631000000107069636f2e73756974652e69642e76310000001766726573686e6573735f32303236303732375f3030303200000012686f6d655f32303236303731385f303030310000002011111111111111111111111111111111111111111111111111111111111111110000002022222222222222222222222222222222222222222222222222222222222222220000002033333333333333333333333333333333333333333333333333333333333333330000001264656c5f3031687a78386d39713472743576000000077265766f6b6564000000147365713a3030303030303030303030303030303300000018323032362d30372d32375431303a30313a30302e3030305a00000018323032362d30372d32375431303a30363a30302e3030305a
```

The fixture suite also rejects cross-family label substitution, unknown status
words and inverted validity windows. Runtime tests separately cover wrong
issuer keys, signature tamper, all exact-binding swaps, replay/rollback, clock
skew, timeout, restore and signed revocation.

### Adapter verification

Core accepts only a transport implementing
`PicoIdentityReaderKeyFreshnessCheckpointSource`. The transport receives the
internally constructed ADR 0083 query and returns either the complete signed
checkpoint record or `unavailable`. It cannot return a bare `current`, `stale`
or `revoked` answer.

`AuthenticatedPicoIdentityReaderKeyFreshnessSource` then:

1. validates the query and strict versioned record shape;
2. rebuilds canonical checkpoint and issuer key-record bytes;
3. requires an exact `pico_identity` key whose fingerprint equals the queried
   identity;
4. verifies the detached signature;
5. compares Home, identity, both device keys and delegation byte-for-byte with
   the internal query;
6. requires a canonical lifecycle order at least as new as local signed
   evidence;
7. rejects future, inverted, expired or over-five-minute windows;
8. rejects rollback below the newest identity order or same-binding check
   instant observed in this process; and
9. maps only a fully verified `current` or `revoked` checkpoint into the ADR
   0083 result contract.

Core constructs this adapter itself around the configured transport. The
configuration surface no longer accepts an arbitrary already-decided
`PicoIdentityReaderKeyFreshnessSource`. No Foundation HTTP request body contains
checkpoint or freshness fields.

### Cache, errors and restore

Every preparation and finalization performs a transport lookup. Core applies a
five-second default lookup deadline and abort signal; a transport must honor
that signal for resource cleanup. There is no positive-result cache and no
stale-while-error path. Timeout, malformed data, unknown schema, wrong key,
invalid signature or source unavailability returns `unavailable`; expired or
signed-order rollback returns `stale`.

The adapter keeps at most 1,024 in-memory identity/binding anti-rollback floors.
They contain only signed checkpoint order/time metadata, are never positive
authority and disappear on restart. No unsigned freshness claim is persisted.

A restored Foundation therefore must contact the source again. It cannot reuse
a pre-backup successful result. A signed checkpoint remains usable only for the
unexpired remainder of its maximum five-minute window; this is the explicit
replay bound across process loss. Durable transparency, multi-registry
consistency and proof that no higher issuer statement exists are not claimed by
this slice.

Local lifecycle evidence remains a lower bound only. It may reject an older
checkpoint, but it never substitutes for a missing external lookup.

## Compatibility

The canonical label, checkpoint record and fixture suite are additive
`pico.suite.id.v1` surfaces. They do not modify existing key-record,
possession, delegation or revocation bytes.

Pico Vault allows the new label only for `pico_identity`. Device-signing and
device-key-agreement roles reject it. Existing clients and public Foundation
request shapes are unchanged because the lookup seam is internal.

ADR 0053 remains draft-only for its general Pico Link registry record. This ADR
loosens that fence only for the narrow reader-key freshness checkpoint and Core
adapter described here; it does not turn the draft registry fixtures into
runtime records or a compatibility claim.

## Consequences

- A registry response, local restore or operator cannot assert reader
  freshness without an exact identity-root signature.
- Swapping Home, identity, device signing key, key-agreement key or delegation
  invalidates the result.
- Registry outage stops new envelope issuance; availability is not exchanged
  for stale key distribution.
- A malicious transport can withhold or replay a still-valid checkpoint, but
  cannot extend its signed five-minute end, forge a later lifecycle order or
  create a different binding.
- Production still needs deployment-specific owner-side checkpoint publication
  and Registry/Sync transport configuration. The default remains unavailable.

## Gates

- **F1:** canonical, versioned checkpoint bytes and authoritative positive and
  negative vectors.
- **F2:** identity-root-only signing and verification with exact issuer-key
  fingerprint binding.
- **F3:** exact Home/identity/device/delegation binding, canonical time and
  lifecycle-order verification.
- **F4:** bounded in-memory anti-rollback floors, five-minute maximum, no
  stale-while-error and no persisted unsigned authority.
- **F5:** Core-owned adapter integration; no HTTP or arbitrary configured
  freshness result bypass.
- **F6:** wrong-key, tamper, replay, rollback, swap, skew, timeout, restore and
  revocation tests.

## Non-goals

This ADR does not define:

- public Registry/Sync HTTP endpoints or Pico Link packets;
- registry consensus, transparency proofs or durable cross-registry
  anti-rollback;
- delegated checkpoint signers;
- Pico identity root rotation, loss or recovery;
- reader-facing share-envelope discovery;
- reader-custody domain KEK creation or rotation; or
- L4 compatibility certification or commercial permission.

## References

- [ADR 0053](0053-pico-link-draft-revocation-registry-placeholder.md)
- [ADR 0078](0078-memory-domain-reader-membership-and-key-distribution-threat-model-and-direction.md)
- [ADR 0079](0079-pico-identity-and-device-key-threat-model-and-primitive-direction.md)
- [ADR 0081](0081-pico-vault-person-role-key-custody-threat-model-and-direction.md)
- [ADR 0083](0083-reader-key-registration-and-freshness-contract.md)
- [ADR 0084](0084-controller-signed-host-custody-share-envelope-issuance.md)
