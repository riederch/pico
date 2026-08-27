/**
 * Die Wanduhr um ein Jahr vorstellen - für einen Testlauf.
 *
 * **Der Anlass.** Am 2026-08-27 um 10:00 UTC wurden drei Tests rot, ohne dass
 * jemand etwas geändert hatte: eine Vorrichtung gab einem Schreibrecht ein
 * `validUntil`, das als zweites Datum neben seinem Anker stand, und an diesem
 * Vormittag lief es ab. Der Fehlschlag las sich wie ein Fehler im Kern und war
 * einer im Kalender.
 *
 * **Warum keine Textsuche.** Rund hundertfünfzig Fenster-Enden stehen als
 * Datum in Tests, und die Hälfte liegt mit Absicht in der Vergangenheit - so
 * prüft man Ablaufen. „Darf nicht vergangen sein" wäre also überwiegend
 * Fehlalarm, und eine Prüfung, die man wegsieht, prüft nichts.
 *
 * **Was stattdessen wahr ist.** Ein gut gebauter Test liest die Wanduhr gar
 * nicht: er gibt seine Zeit an. Für ihn ist das Vorstellen der Uhr folgenlos.
 * Wer beim vorgestellten Lauf umfällt, hat gegen den Kalender geprüft - und
 * genau die Menge will man sehen. Der Lauf ist damit kein Ersatz für den
 * echten, sondern derselbe unter einer anderen Frage.
 *
 * Ein Jahr, weil das die Spanne ist, in der die Fenster dieses Hauses liegen -
 * Mitgliedschaften, Schreib- und Leserechte laufen auf Jahresfrist.
 *
 * **Verwandt mit `apps/vault-daemon/src/test-fixed-clock.cjs`**, das die Uhr
 * eines Kindprozesses auf einen Wert festnagelt. Die beiden dürfen sich nicht
 * stapeln: erbt ein solcher Prozess `NODE_OPTIONS`, liefe seine festgenagelte
 * Zeit noch einmal um ein Jahr weiter, und der Elternprozess bekäme
 * `request_expired` von einem Kind, das er selbst verstellt hat. Deshalb tritt
 * dieses Modul zurück, wo schon jemand die Uhr hält.
 */
const shiftMs = Number(process.env.PICO_CLOCK_SHIFT_MS ?? 365 * 24 * 60 * 60 * 1_000);

const alreadyHeld = process.env.PICO_TEST_NOW_MS !== undefined
  || Object.hasOwn(globalThis.Date, 'picoClockPatched');

const RealDate = Date;
const shifted = class extends RealDate {
  constructor(...args) {
    if (args.length === 0) {
      super(RealDate.now() + shiftMs);
      return;
    }
    super(...args);
  }

  static now() {
    return RealDate.now() + shiftMs;
  }
};
if (!alreadyHeld) {
  Object.defineProperty(shifted, 'picoClockPatched', { value: true });
  globalThis.Date = shifted;
}
