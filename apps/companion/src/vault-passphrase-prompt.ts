import { isPicoVaultPassphrase, maxPicoVaultPassphraseLength } from '@pico/vault';

/**
 * ADR 0131 A5 / ADR 0130 E3. Was ein Pico eine Person fragt, wenn es eine
 * Vault-Passphrase braucht.
 *
 * **Gemessen am 2026-08-21: sechs Schreibweisen dieses einen Moments** - fünf
 * im Electron-Hauptprozess, eine in der Android-Activity. Die fünf sagten
 * "Choose this device's Vault passphrase", "Choose a Vault passphrase",
 * "Choose a Vault passphrase for this device", "Enter this device's Vault
 * passphrase" und "Enter the Vault passphrase"; das Telefon sagte eine sechste
 * Fassung.
 *
 * Nicht alle Unterschiede waren Zufall - und das ist der Grund, warum hier
 * eine Absicht steht und nicht ein Satz. Wer gerade ein Home gründet, hat kein
 * anderes Gerät, dessen Passphrase unberührt bleibt; wer eine Recovery-Karte
 * in der Hand hält, muss wissen, dass dies nicht die Karten-PIN ist. Die
 * Varianten unten sind die, die eine Person auseinanderhalten *muss*. Der Rest
 * war Drift.
 *
 * **Und das Telefon widersprach sich selbst.** Der Beitritt zeigt auf
 * demselben Gerät elf Sätze aus dem Kern, die alle "device" sagen - "This
 * device is yours", "Show this to the device you already have" -, und
 * dazwischen einen einzigen Bildschirm, der "this phone" sagte. Nicht der Kern
 * ist hier zu allgemein; der eine Bildschirm war zu speziell.
 */
export type PicoCompanionVaultPassphrasePurpose =
  /** Ein Home wird gegründet: dieses Gerät ist das erste, es gibt kein zweites. */
  | 'found'
  /** Dieses Gerät tritt einem Home bei, das ein anderes Gerät schon kennt. */
  | 'join'
  /** Erste Einrichtung mit einer Recovery-Karte in der Hand. */
  | 'first_run'
  /** Eine Einrichtung, die pausiert hat, wird fortgesetzt. */
  | 'resume'
  /** Eine Recovery-Karte soll gedruckt werden. */
  | 'recovery_card';

export interface PicoCompanionVaultPassphrasePrompt {
  title: string;
  instruction: string;
  maximumLength: number;
  refusal: string;
  validate(value: string): boolean;
}

export function picoCompanionVaultPassphrasePrompt(
  purpose: PicoCompanionVaultPassphrasePurpose,
): PicoCompanionVaultPassphrasePrompt {
  return {
    ...words(purpose),
    maximumLength: maxPicoVaultPassphraseLength,
    /**
     * Die Grenze und die Regel kommen aus `@pico/vault`, wo eine Passphrase zu
     * einer Schlüsseldatei wird. Sechs Aufrufstellen prüften bis heute
     * `value.length > 0` in eigener Regie - dasselbe Ergebnis, solange die
     * Regel dasselbe sagt, und eine stille Abweichung an dem Tag, an dem sie
     * es nicht mehr tut.
     *
     * **Die Ablehnung nennt beide Enden**, und das ist keine Kleinigkeit: sie
     * sagte "cannot be empty", solange sie neben `value.length > 0` stand.
     * Neben `isPicoVaultPassphrase` wäre derselbe Satz falsch geworden - eine
     * zu lange Passphrase hätte gehört, sie sei leer. Im Fenster fällt das
     * nicht auf, weil `maximumLength` das Tippen deckelt; auf dem Telefon
     * deckelt nichts, und dort hätte eine Person den falschen Satz gelesen.
     */
    refusal: `A passphrase is 1 to ${maxPicoVaultPassphraseLength} characters.`,
    validate: isPicoVaultPassphrase,
  };
}

function words(purpose: PicoCompanionVaultPassphrasePurpose): {
  title: string;
  instruction: string;
} {
  switch (purpose) {
    case 'found':
      return {
        title: 'Choose a Vault passphrase',
        instruction: 'It protects the keys this device is about to make. Nothing can '
          + 'recover them without it, and Pico never sends it anywhere.',
      };
    case 'join':
      /**
       * Der Satz des Desktops hat gewonnen, und zwar wegen eines Halbsatzes,
       * den das Telefon nicht hatte: dass das andere Gerät seine eigene
       * Passphrase behält. Wer gerade ein zweites Gerät einrichtet, fragt sich
       * genau das. "Es verlässt dieses Telefon nie" ist ebenso wahr - aber es
       * steht schon in der Gründungsfassung, wo es der einzige Ort ist, an dem
       * jemand es zum ersten Mal liest.
       */
      return {
        title: 'Choose a Vault passphrase for this device',
        instruction: 'It protects the keys this device is about to make for itself. Your '
          + 'other device keeps its own; nothing can recover either without its passphrase.',
      };
    case 'first_run':
      return {
        title: 'Choose this device’s Vault passphrase',
        instruction: 'This passphrase protects the keys Pico is about to create on this '
          + 'device. It is not the Card PIN.',
      };
    case 'resume':
      return {
        title: 'Enter this device’s Vault passphrase',
        instruction: 'Type the Vault passphrase you chose when this device started its '
          + 'setup, then press Enter.',
      };
    case 'recovery_card':
    default:
      return {
        title: 'Enter the Vault passphrase',
        instruction: 'Type this device’s Vault passphrase, then press Enter. It is '
          + 'not the Recovery Phrase or Card PIN.',
      };
  }
}
