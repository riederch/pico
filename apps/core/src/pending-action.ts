import { picoApprovalDataLayer } from '@pico/protocol/approval-statement';
import type { PicoActionArgument } from '@pico/protocol/action';

import type { PicoActionDecision } from './action-path.js';

/**
 * ADR 0141 RN4 - questions that are waiting for the person who was asked.
 *
 * **In memory, and that is the correct lifetime rather than a shortcut.** A
 * pending approval is bound to the session presence was established in, and
 * only that session may answer it. A Home that restarted has no such session
 * any more: the device that was there is reconnecting, and a question parked
 * against a session that ended is a question nobody can answer in the place it
 * was asked. Persisting one would create exactly the standing grant RN4
 * refuses - a request outliving the moment somebody was present for it.
 *
 * So a restart loses pending questions, and losing them is the answer: an
 * unanswered approval is `unanswered`, which ADR 0141 keeps distinct from
 * refused because a person who was asleep did not refuse.
 */

/**
 * ADR 0141 RN4. How long a question stands.
 *
 * Two minutes: long enough for somebody to read what is being asked and short
 * enough that walking away answers it with `unanswered` rather than leaving a
 * grant lying about. Fixed here rather than taken from the caller, because a
 * window a caller names is a standing grant with a number attached.
 */
export const maxPicoActionApprovalWindowMs = 2 * 60 * 1_000;

/** ADR 0119 Q5. How many questions may stand at once. */
export const maxPicoPendingActions = 32;

export interface PicoPendingActionEntry {
  decided: PicoActionDecision;
  presenceSessionId: string;
  endsAtMs: number;
  /** What the person is being asked, in the words the module declared. */
  prompt: string;
  risk: string;
}

export type PicoPendingActionRefusal =
  /** ADR 0119 Q5: a ceiling refuses rather than forgetting an older question. */
  | 'too_many_questions_waiting'
  | 'not_found'
  | 'expired';

export class PicoPendingActions {
  private readonly waiting = new Map<string, PicoPendingActionEntry>();

  public constructor(private readonly now: () => number = () => Date.now()) {}

  /**
   * Records a question, or refuses because too many stand already.
   *
   * A ceiling that forgot the oldest would answer a person's earlier question
   * by dropping it, which is neither of ADR 0141's two answers.
   */
  public add(
    entry: PicoPendingActionEntry,
  ): { ok: true } | { ok: false; refusal: PicoPendingActionRefusal } {
    this.prune();
    if (this.waiting.size >= maxPicoPendingActions) {
      return { ok: false, refusal: 'too_many_questions_waiting' };
    }
    this.waiting.set(entry.decided.pending!.requestedEventId, entry);
    return { ok: true };
  }

  /**
   * What is still standing, newest last, for the device that asked.
   *
   * **Der Satz und die Daten daneben, und nie ineinander** (2026-09-01,
   * Befund B37, Entscheidung des Nutzers). Bis hierher trug eine wartende
   * Frage vier Felder, und `prompt` kommt aus dem Manifest des Moduls (ADR
   * 0139 AC4) - es nennt also den Effekt und nie den Gegenstand. Wer zwei
   * Depots angehaengt hatte und *jetzt holen* drueckte, bekam zweimal
   * dieselbe Zeile, ausgerechnet an dem einen Effekt im Baum, der Code
   * installiert.
   *
   * Repariert in der Gestalt, die ADR 0141 RN3 fuer die Zustimmungsaussage
   * schon entschieden hat, und nicht in einer neuen: der Satz bleibt
   * unveraendert das, was das Modul zugesagt hat, und die Argumente stehen
   * als beschriftete Daten daneben - nie hineininterpoliert, jedes mit seiner
   * Herkunftsklasse, und `carriesExternalContent`, wenn eines von aussen kam.
   * Der ganze Angriff auf eine Bestaetigung ist, sie etwas Beruhigendes
   * *sagen* zu lassen; deshalb bekommt kein Wert einen Weg in das Sagen.
   */
  public forSession(presenceSessionId: string): ReadonlyArray<{
    requestedEventId: string;
    prompt: string;
    risk: string;
    expiresAt: string;
    arguments: readonly PicoActionArgument[];
    carriesExternalContent: boolean;
  }> {
    this.prune();
    return Object.freeze([...this.waiting.values()]
      .filter((entry) => entry.presenceSessionId === presenceSessionId)
      .map((entry) => Object.freeze({
        requestedEventId: entry.decided.pending!.requestedEventId,
        prompt: entry.prompt,
        risk: entry.risk,
        expiresAt: new Date(entry.endsAtMs).toISOString(),
        // Durch dieselbe Funktion wie die Zustimmungsaussage: die Regel, nach
        // der ein Wert vor die Augen einer Person kommt, steht einmal.
        ...picoApprovalDataLayer(entry.decided.request.arguments),
      })));
  }

  /**
   * Takes a question so it can be answered, and removes it either way.
   *
   * Removed on the way out rather than after a successful answer: a question
   * answered twice would be an effect run twice, and the second answer arrives
   * from the same device that sent the first when a reply went missing.
   */
  public take(
    requestedEventId: string,
    presenceSessionId: string,
  ): { ok: true; entry: PicoPendingActionEntry } | { ok: false; refusal: PicoPendingActionRefusal } {
    this.prune();
    const entry = this.waiting.get(requestedEventId);
    if (entry === undefined || entry.presenceSessionId !== presenceSessionId) {
      // One answer for both, because telling a caller that somebody else's
      // question exists is telling them about somebody else's question.
      return { ok: false, refusal: 'not_found' };
    }
    this.waiting.delete(requestedEventId);
    return { ok: true, entry };
  }

  public size(): number {
    this.prune();
    return this.waiting.size;
  }

  /**
   * Drops what has run out of time.
   *
   * ADR 0141 checks expiry again when an answer arrives, on two clocks. This
   * only keeps the map from holding questions nobody can answer - it is
   * housekeeping, not the rule.
   */
  private prune(): void {
    const nowMs = this.now();
    for (const [requestedEventId, entry] of this.waiting) {
      if (entry.endsAtMs <= nowMs) {
        this.waiting.delete(requestedEventId);
      }
    }
  }
}
