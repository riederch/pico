/**
 * Ein Gültigkeitsfenster für Vorrichtungen, um die Uhr herum.
 *
 * **Der Anlass** (2026-08-27). An diesem Vormittag wurden drei Tests rot, ohne
 * dass jemand etwas geändert hatte: eine Vorrichtung gab einem Schreibrecht
 * ein `validUntil`, das als zweites Datum neben seinem Anker stand, und um
 * 10:00 UTC lief es ab. Die Suche danach fand die Sorte: sechzehn Stellen im
 * Haus schrieben dieselbe Bevollmächtigung von 2026-01-01 bis 2027-01-01 ab,
 * und alle sechzehn wären am Neujahrstag gemeinsam umgefallen.
 *
 * Eine Wahrheit, die sechzehnmal geschrieben wird, driftet sechzehnmal - hier
 * driftet sie sogar von allein, weil die Gegenwart weiterläuft und das Datum
 * nicht. Also steht sie einmal.
 *
 * **Wofür das nicht da ist.** Tests, die *über* Fenster etwas aussagen -
 * abgelaufen, noch nicht gültig, gerade eben abgelaufen - geben ihre Daten
 * selbst an. Diese Funktion ist für die vielen anderen, denen das Fenster
 * gleichgültig ist und die nur eines brauchen, das gerade offen steht.
 *
 * `pnpm clock:check` stellt die Uhr ein Jahr vor und findet, wer das hier
 * nicht benutzt hat.
 */
const aYearMs = 365 * 24 * 60 * 60 * 1_000;

export function picoTestValidityWindow(at: Date = new Date()): {
  validFrom: string;
  validUntil: string;
} {
  return {
    validFrom: new Date(at.getTime() - aYearMs).toISOString(),
    validUntil: new Date(at.getTime() + aYearMs).toISOString(),
  };
}
