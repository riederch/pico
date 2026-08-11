import { describe, expect, it } from 'vitest';
import {
  confirmPicoInstanceProposal,
  picoInstanceSelectors,
  picoInstanceToken,
  proposePicoInstance,
  selectPicoInstanceAsSoleCandidate,
  selectPicoInstanceByPerson,
  type PicoInstanceProposal,
  type PicoInstanceSelection,
} from './instance-selection.js';

describe('ADR 0137 IN5 - a derivation proposes and never selects', () => {
  it('keeps exactly two selectors, and a derived location is not one', () => {
    expect([...picoInstanceSelectors]).toEqual(['person', 'sole_candidate']);
  });

  it('builds a proposal that carries its confidence and cannot claim confirmation', () => {
    const proposal = proposePicoInstance({ instance: 'ferienhaus', confidence: 'high' });
    expect(proposal).toEqual({
      instance: 'ferienhaus',
      confidence: 'high',
      confirmedByPerson: false,
    });
    // No selector field at all: the highest thing a derivation builds is a
    // sentence to show someone.
    expect(Object.keys(proposal).sort()).toEqual([
      'confidence',
      'confirmedByPerson',
      'instance',
    ]);
  });

  it('refuses a proposal without a stated certainty', () => {
    // ADR 0136 BR4's idiom: not a cautious guess, one nobody measured.
    expect(() => proposePicoInstance({ instance: 'ferienhaus', confidence: undefined as never }))
      .toThrow('pico_instance_proposal_requires_confidence');
  });

  it('gives a high-confidence proposal no more standing than a low-confidence one', () => {
    // The whole point. `high` is still a guess, and the failure it produces is
    // a light going on in someone else's house.
    const high = proposePicoInstance({ instance: 'ferienhaus', confidence: 'high' });
    const low = proposePicoInstance({ instance: 'ferienhaus', confidence: 'low' });
    expect(high.confirmedByPerson).toBe(low.confirmedByPerson);
    expect('selectedBy' in high).toBe(false);
    expect('selectedBy' in low).toBe(false);
  });
});

describe('ADR 0137 IN5 - what may select', () => {
  it('lets a person name it', () => {
    expect(selectPicoInstanceByPerson('wohnmobil'))
      .toEqual({ instance: 'wohnmobil', selectedBy: 'person' });
  });

  it('lets the only covering instance select itself', () => {
    // Nothing to infer and nothing to get wrong, which keeps a one-house
    // household from being asked the same question forever.
    expect(selectPicoInstanceAsSoleCandidate(['zuhause']))
      .toEqual({ instance: 'zuhause', selectedBy: 'sole_candidate' });
  });

  it('refuses to invent a target when nothing covers the subject', () => {
    // An effect with no instance is not an effect with a default one.
    expect(() => selectPicoInstanceAsSoleCandidate([]))
      .toThrow('pico_instance_has_no_candidate');
  });

  it('refuses to pick when there is a choice, and says a person is needed', () => {
    // Named separately from the empty case: this is a question addressed to
    // someone, not a fault in the data.
    expect(() => selectPicoInstanceAsSoleCandidate(['zuhause', 'ferienhaus']))
      .toThrow('pico_instance_needs_a_person');
  });

  it('refuses an identifier that is a path or an address', () => {
    // ADR 0137 IN1 holds at this boundary too.
    expect(() => selectPicoInstanceByPerson('/srv/rchkb'))
      .toThrow('invalid_pico_instance_identifier');
    expect(() => selectPicoInstanceByPerson('http://10.0.0.4:8123'))
      .toThrow('invalid_pico_instance_identifier');
  });
});

describe('ADR 0137 IN5 - the one route from a guess to a target', () => {
  it('turns a confirmed proposal into a person selection', () => {
    const proposal = proposePicoInstance({ instance: 'ferienhaus', confidence: 'medium' });
    expect(confirmPicoInstanceProposal({ proposal, confirmedInstance: 'ferienhaus' }))
      .toEqual({ instance: 'ferienhaus', selectedBy: 'person' });
  });

  it('drops the confidence once a person has answered', () => {
    // Keeping it would invite a later caller to discount a person's answer
    // because the machine had been unsure.
    const proposal = proposePicoInstance({ instance: 'ferienhaus', confidence: 'low' });
    const selection = confirmPicoInstanceProposal({ proposal, confirmedInstance: 'ferienhaus' });
    expect(Object.keys(selection).sort()).toEqual(['instance', 'selectedBy']);
  });

  it('refuses when what was confirmed is not what was proposed', () => {
    // ADR 0141 RN3 from the other end: what is acted on is what was shown, and
    // comparing them is the only way to be sure of that.
    const proposal = proposePicoInstance({ instance: 'ferienhaus', confidence: 'high' });
    expect(() => confirmPicoInstanceProposal({ proposal, confirmedInstance: 'wohnmobil' }))
      .toThrow('pico_instance_confirmation_mismatch');
  });

  it('refuses a proposal that claims a person already confirmed it', () => {
    const forged = {
      instance: 'ferienhaus',
      confidence: 'high',
      confirmedByPerson: true,
    } as unknown as PicoInstanceProposal;
    expect(() => confirmPicoInstanceProposal({ proposal: forged, confirmedInstance: 'ferienhaus' }))
      .toThrow('pico_instance_proposal_cannot_claim_confirmation');
  });
});

describe('ADR 0137 IN5 - the token a rule reads', () => {
  it('hands out an identifier only through a selection', () => {
    expect(picoInstanceToken(selectPicoInstanceByPerson('zuhause'))).toBe('zuhause');
    expect(picoInstanceToken(selectPicoInstanceAsSoleCandidate(['zuhause']))).toBe('zuhause');
    expect(picoInstanceToken(null)).toBeNull();
  });

  it('refuses a proposal that reached it through a cast', () => {
    // The half a type cannot carry. A `PicoInstanceSelection` parameter
    // refuses a proposal at review time and refuses nothing in the built
    // product, because the type is erased before anything runs. A cast, a
    // JavaScript caller or a value read back from storage would walk past it.
    const proposal = proposePicoInstance({ instance: 'ferienhaus', confidence: 'high' });
    expect(() => picoInstanceToken(proposal as unknown as PicoInstanceSelection))
      .toThrow('pico_instance_proposal_is_not_a_selection');
  });

  it('refuses a hand-built object wearing a selector it never earned', () => {
    expect(() => picoInstanceToken(
      { instance: 'ferienhaus', selectedBy: 'derived_location' } as unknown as PicoInstanceSelection,
    )).toThrow('pico_instance_selector_not_listed');
  });

  it('refuses a bare identifier and a malformed selection', () => {
    expect(() => picoInstanceToken('ferienhaus' as unknown as PicoInstanceSelection))
      .toThrow('invalid_pico_instance_selection');
    expect(() => picoInstanceToken({ instance: 'ferienhaus' } as unknown as PicoInstanceSelection))
      .toThrow('invalid_pico_instance_selection');
  });
});
