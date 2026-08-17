import type { PicoLinkDirectClient } from '@pico/vault-daemon/link-direct-client';

/**
 * ADR 0138 CO3/CO4 on the device - the two decisions that stand between an
 * attached supplier and one reaching out.
 *
 * They were unreachable until 2026-08-17: the columns and the check existed
 * and nothing could set them, so *off* was not a default anybody could move
 * from. This is the half that lets a person move.
 *
 * The decision belongs here rather than in the Foundation dashboard because it
 * is about spending their money and telling somebody they asked, which ADR
 * 0087 keeps out of administration's hands and ADR 0113 puts on the device
 * they hold.
 */
export interface PicoCompanionSupplierView {
  identifier: string;
  kind: string;
  mayReachOutside: boolean;
  mayReachUnasked: boolean;
  attachedAt: string;
}

export async function readPicoCompanionSuppliers(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
}): Promise<readonly PicoCompanionSupplierView[]> {
  const read = await input.livingDeviceLinkClient.request('home.suppliers.read', {});
  if (read.outcome !== 'ok') {
    throw new Error(`suppliers_read_rejected:${read.outcome}`);
  }
  const suppliers = (read.result as { suppliers?: unknown }).suppliers;
  if (!Array.isArray(suppliers)) {
    throw new Error('invalid_pico_suppliers_read');
  }
  return Object.freeze(suppliers as PicoCompanionSupplierView[]);
}

/**
 * ADR 0138 CO3/CO4. Both answers in one call, because the second depends on
 * the first.
 *
 * **Turning reaching off takes the unasked permission with it.** The database
 * refuses the pair otherwise, and more to the point a person switching off
 * "may reach out" has plainly not meant "but keep doing it unprompted" - so
 * the caller does not get to send that combination by forgetting.
 */
export async function decidePicoCompanionSupplierReach(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
  identifier: string;
  mayReachOutside: boolean;
  mayReachUnasked: boolean;
}): Promise<void> {
  const mayReachUnasked = input.mayReachOutside && input.mayReachUnasked;
  const answer = await input.livingDeviceLinkClient.request('home.supplier.reach.decide', {
    identifier: input.identifier,
    mayReachOutside: input.mayReachOutside,
    mayReachUnasked,
  });
  if (answer.outcome !== 'ok') {
    const refusal = (answer.result as { refusal?: unknown }).refusal;
    throw new Error(typeof refusal === 'string' ? refusal : `supplier_reach_${answer.outcome}`);
  }
}
