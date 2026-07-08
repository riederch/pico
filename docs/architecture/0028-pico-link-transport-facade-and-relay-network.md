# 0028 - Pico Link Transport Facade and Relay Network

## Status

Accepted as a transport, relay and decentralisation concept.

## Context

Pico Home is intended to be local-first and should not become a public server that exposes inbound APIs to the internet. At the same time, Pico Vaults and other Picos must be able to communicate with a Pico Home when they are outside the home network.

Picos should also be able to communicate across different Pico Homes. A Pico may live in one Pico Home, but its contacts, conversations and shared spaces can cross home boundaries. Homes are hosting and delivery locations, not owners of all Pico relationships.

Pico should also remain transport-neutral. Internet relay, local LAN, VPN/direct links, and future low-bandwidth transports such as Meshtastic or other radio standards should all be possible without binding Pico Link semantics to one transport.

## Decision

Remote reachability for a Pico Home is provided through Pico Link transports, primarily Pico Relay, not through directly exposed public Pico Home APIs.

A Pico Home is a local endpoint in the Pico Relay network. It can maintain outbound transport sessions, receive encrypted Pico Link packets, queue them where appropriate, and deliver them to local Picos, Pico Vaults, services or host functions associated with that home.

A Pico Relay is a transport and delivery component. It may route, queue, deduplicate, retry, drop or forward encrypted Pico Link packets according to policy and capability. It must not decrypt payloads, authorize actions, own identities, alter signed content, impersonate Picos or become a trust anchor.

Pico Link remains transport-neutral. Concrete transports are implemented behind a Transport Facade.

## Core rule

```text
Pico speaks Pico Link. Transports carry Pico Link packets.
```

Pico Home is an endpoint in the transport network. Pico Relay is the postal network. Pico Vault holds identity, keys, knowledge and private state.

## Terms

| Term | Meaning |
|---|---|
| Pico Link | Transport-neutral encrypted communication between Picos, Homes and related Pico endpoints. |
| Pico Home Link | Pico-to-Home interface for claim, residency, sync, routing and host compatibility. |
| Pico Link Packet | Transport-neutral envelope that carries encrypted Pico payloads. |
| Transport Facade | Abstraction layer used by Pico Link to send and receive packets without binding to one transport. |
| Transport Adapter | Concrete implementation such as Relay, LAN, VPN/direct, Meshtastic or a future radio transport. |
| Pico Relay | Transport-only relay that forwards encrypted Pico Link packets. |
| Relay Network | One or more relay nodes that can route, queue and deliver encrypted packets. |
| Pico Home Endpoint | Pico Home acting as an addressable endpoint in the relay/transport network. |
| Low-Bandwidth Transport | Transport with small payload sizes, high or variable latency, and strict rate limits, such as Meshtastic. |

## Remote reachability model

Pico Homes do not expose public inbound APIs for remote access.

Remote access uses this shape:

```text
Pico Vault outside home
-> Pico Link Transport Facade
-> Pico Relay / Relay Network
-> Pico Home Endpoint
```

The Pico Home may maintain an outbound session to one or more relays:

```text
Pico Home -> Pico Relay
Pico Vault -> Pico Relay
Pico Relay delivers encrypted Pico Link packets between them
```

This avoids:

- router port forwarding
- direct public exposure of local Pico Home APIs
- assumptions that the user controls NAT or CGNAT
- turning Home Assistant or the home router into Pico's public trust boundary

## Direct access and VPN

Direct LAN or VPN access may still exist as a transport option for developers or advanced users.

However, product-level remote reachability should be modelled through Pico Link transports and relay delivery, not through public HTTP access to the Pico Home REST API.

A VPN/direct adapter can exist behind the same Transport Facade.

## Transport Facade

The Transport Facade should expose only transport concerns.

Conceptual shape:

```ts
interface PicoLinkTransport {
  readonly id: string;
  readonly capabilities: TransportCapabilities;

  send(packet: PicoLinkPacket): Promise<SendResult>;
  receive(handler: (packet: PicoLinkPacket) => Promise<void>): Promise<void>;
  status(): Promise<TransportStatus>;
}
```

Capability examples:

```ts
interface TransportCapabilities {
  maxPayloadBytes: number;
  supportsRealtime: boolean;
  supportsStoreAndForward: boolean;
  supportsBroadcast: boolean;
  supportsDirectAddressing: boolean;
  supportsMultiHop: boolean;
  metered: boolean;
  lowBandwidth: boolean;
  expectedLatency: 'low' | 'medium' | 'high' | 'variable';
}
```

These examples are conceptual and not yet a required TypeScript API.

## Transport adapters

Initial and future adapters may include:

- Relay transport
- LAN/direct transport
- VPN/direct transport
- WebSocket transport
- future QUIC/WebRTC-style transport
- Meshtastic transport
- future LoRa, BLE Mesh, Thread, Wi-Fi HaLow, Hamnet, APRS-like, MQTT-bridge or other low-bandwidth transports

Adapters may fragment, queue, route, retry or drop packets according to their capabilities.

Adapters must not:

- interpret Pico payload semantics
- decrypt Pico payloads
- authorize actions
- act as Pico Rules
- own Pico identities
- change signed content
- turn transport-specific identities into Pico identities

## Pico Link packet envelope

A future transport-neutral envelope may include fields such as:

```json
{
  "packetId": "pkt_...",
  "destinationHint": "...",
  "ttl": 3,
  "expiresAt": "2026-07-06T12:00:00Z",
  "priority": "normal",
  "contentType": "pico-link/encrypted",
  "payload": "base64..."
}
```

This is a conceptual envelope, not a committed wire format.

ADR `0032-pico-link-envelope-and-credential-schema-direction.md` refines this into conceptual schema families for packet envelopes, protected payload envelopes, signed history, key envelopes, membership credentials and compatibility advertisements. It still does not define a final wire format.

The envelope should be small enough to reason about low-bandwidth transports and rich enough to support:

- duplicate detection
- expiry
- loop prevention
- priority handling
- multi-hop relay decisions
- store-and-forward delivery
- transport capability selection

## Decentralisation requirements

Pico Relay must not imply a single mandatory cloud service.

The relay model should allow:

- user-operated relays
- friend-operated relays
- organisation-operated relays
- community relays
- commercial relays where explicitly chosen
- multiple relay paths
- relay replacement without changing Pico identity
- optional direct/VPN paths
- optional low-bandwidth/radio paths

No single relay provider should be a required authority for Pico identity, private data, relationships or actions.

## Pico Home as endpoint, not central authority

A Pico Home is a local endpoint, delivery location and home-context host.

It may:

- receive encrypted Pico Link packets for local delivery
- maintain outbound relay sessions
- queue packets for local clients where allowed
- deliver packets to local Pico Vaults or services
- provide local home context
- expose local Foundation diagnostics
- participate in sync and host functions
- help with policy-gated local actions after proper Pico Rules and Action Runner implementation

It must not automatically:

- own Pico identities
- decrypt resident private spaces
- read private external conversations
- impersonate resident Picos
- sign as another Pico
- control relationships outside the home
- act as a global account server
- expose public remote administration APIs

## Inter-Pico communication across Homes

Picos can communicate even when they live in different Pico Homes.

Example:

```text
Pico A lives in Pico Home A
Pico B lives in Pico Home B
Pico A and Pico B are contacts
Pico A <-> Pico B communicate through Pico Link
Homes and relays may transport packets, but the relationship belongs to the Picos
```

Home boundaries define hosting, delivery and household context. They do not define the limits of social, family, project, organisation or emergency relationships between Picos.

External conversations should use explicit shared spaces such as pair or group spaces, not implicit household access.

## Cryptographic boundary

Pico Link requires asymmetric cryptography at the identity and trust-boundary layer.

Public keys act as portable identity material for Picos, Homes and devices. Private keys must remain under control of Pico Vaults or other trusted key storage.

Pico Relay and transport adapters carry encrypted packets but must not gain authority to decrypt, impersonate, forge or authorize.

PGP is an acceptable mental model for public/private key identity and signed messages. It is not automatically the required wire protocol for Pico Link.

Future messaging should distinguish:

- long-term identity keys
- device keys
- home identity keys
- signatures for events or manifests
- ephemeral/session keys for message encryption
- modern chat properties such as replay protection and forward-secrecy where appropriate

Pico must not invent its own cryptographic primitives.

## Meshtastic and future radio transports

Meshtastic may be supported as an optional low-bandwidth, infrastructure-independent Pico Link transport.

It can carry encrypted Pico Link packets for:

- discovery hints
- presence or availability signals
- emergency signalling
- small text messages
- wake-up hints for higher-bandwidth transports
- short store-and-forward payloads

It should not be used for:

- large memory syncs
- files
- images
- audio
- large event-log replication
- LLM context transport
- high-frequency telemetry unless explicitly constrained

Meshtastic-specific logic belongs inside a Meshtastic Transport Adapter. The adapter may handle payload size, fragmentation, reassembly, node addressing, hop limits, channel constraints, rate limits and delivery best-effort behaviour.

Meshtastic channel keys or node identities must not become Pico identity keys.

The same facade should allow later replacement or addition of other low-bandwidth transports.

## Packet classes and transport selection

Future Pico Link should classify traffic so low-bandwidth transports are not abused accidentally.

Example classes:

| Class | Low-bandwidth transport suitability |
|---|---|
| presence | suitable |
| delivery receipt | suitable |
| emergency short message | suitable |
| wake-up hint | suitable |
| short chat message | possible with limits |
| normal event sync | constrained |
| memory sync | unsuitable |
| file/image/audio | unsuitable |
| LLM context | unsuitable |

Transport selection should use capabilities, priority, payload size, expiry and policy.

## Relay behaviour

Relays may:

- accept encrypted packets
- forward packets
- queue packets until expiry
- deduplicate packets
- enforce TTL or max hops
- enforce rate limits
- drop expired or abusive traffic
- provide delivery metadata where allowed

Relays must not:

- decrypt packets
- modify signed payloads
- create valid packets as another Pico
- authorize actions
- become Pico Rules
- read private spaces
- act as an identity provider without a separate explicit design

## Non-goals

This ADR does not implement:

- a Pico Relay server
- Transport Facade TypeScript interfaces
- Meshtastic adapter
- remote sync
- public claim endpoints
- production cryptographic protocol
- public remote Pico Home API
- multi-hop routing algorithm
- relay discovery protocol

It also does not require every Pico Home to forward third-party relay traffic. A Pico Home may later offer an explicit Relay Mode, but that must be opt-in and separately designed.

## Implementation implications

Before implementing relay-based remote access, define at least:

- Pico identity keys and home identity keys
- packet envelope and signature/encryption boundaries
- relay registration or routing hints
- endpoint addressing model
- replay and deduplication model
- queue expiry and storage limits
- rate limits and abuse handling
- relay capability advertisement
- transport capability selection
- audit surfaces for remote delivery and actions
- privacy treatment of metadata
- compatibility level and capability flags

Before implementing Meshtastic support, define at least:

- maximum payload strategy
- fragmentation and reassembly limits
- retry and TTL behaviour
- mapping between Pico packet IDs and Meshtastic packets
- channel and node configuration boundaries
- rate limits suitable for LoRa mesh etiquette
- explicit prohibition on unencrypted Pico payloads

## Consequences

Positive:

- solves remote reachability without public home ports
- keeps Pico Home local-first and endpoint-oriented
- preserves decentralisation
- allows multiple relay operators
- supports Picos communicating across Homes
- keeps Meshtastic and future radio options possible
- prevents transport-specific protocols from becoming Pico identity or authority

Negative:

- requires more protocol design before remote access can be implemented
- introduces metadata-privacy challenges
- requires abuse/rate-limit design for relays
- low-bandwidth transports need strict packet-class constraints
- relay availability becomes operationally important, even though it must not become identity authority

## Relationship to other ADRs

This ADR extends and constrains:

- `0015-full-clients-light-clients-and-relay.md`
- `0024-server-bootstrap-tenancy-and-eviction.md`
- `0026-product-terminology-and-naming.md`
- `0027-dedicated-pico-home-image-and-first-boot-setup.md`

The key continuity rule is:

```text
Transport provides reachability. Pico identity, keys, policy and authority remain above transport.
```
