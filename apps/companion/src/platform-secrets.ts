/**
 * ADR 0081 P3. What the desktop's own keystore is, and what counts as one.
 *
 * **Split out of `platform-unlock.ts` on 2026-08-16 for a boundary reason
 * rather than a tidiness one.** That module reaches the Vault daemon, which is
 * right for automatic unlock and wrong for everything else: ADR 0154's relay
 * credential needs the same keystore rules and has nothing to do with
 * unlocking a Vault, and importing them together pulled the daemon - with its
 * CLI and its PDF generator - into the tray's static closure. The boundary
 * check caught it, which is what it is for.
 *
 * Nothing here holds a secret. It says which backends are a keystore and
 * which are a file with a lock painted on it.
 */

/**
 * Backends that actually encrypt against the logged-in session.
 *
 * A closed list because the interesting value is the one that is missing:
 * Electron reports `basic_text` when it found no keyring, and that mode
 * "encrypts" with a hardcoded key - which is not encryption, and accepting it
 * would make every record below a plaintext file that looks protected.
 */
export const picoCompanionLinuxKeystoreBackends = [
  'gnome_libsecret',
  'kwallet',
  'kwallet5',
  'kwallet6',
] as const;

export type PicoCompanionLinuxKeystoreBackend =
  typeof picoCompanionLinuxKeystoreBackends[number];

export interface PicoCompanionPlatformSecretPort {
  platform: 'linux';
  selectedBackend(): string;
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Uint8Array;
  decryptString(encrypted: Uint8Array): string;
}

/**
 * The backend in use, or a refusal that says which of the two problems it is.
 *
 * `platform_keystore_plaintext_refused` and `platform_keystore_unavailable`
 * are told apart because they are different things to do next: one is "your
 * desktop has no keyring running", the other is "your desktop has one and
 * Electron did not find it".
 */
export function requirePicoCompanionKeystoreBackend(
  secrets: PicoCompanionPlatformSecretPort,
): PicoCompanionLinuxKeystoreBackend {
  if (secrets.platform !== 'linux' || !secrets.isEncryptionAvailable()) {
    throw new Error('platform_keystore_unavailable');
  }
  const backend = secrets.selectedBackend();
  if (!picoCompanionLinuxKeystoreBackends.includes(
    backend as PicoCompanionLinuxKeystoreBackend,
  )) {
    throw new Error(backend === 'basic_text'
      ? 'platform_keystore_plaintext_refused'
      : 'platform_keystore_unavailable');
  }
  return backend as PicoCompanionLinuxKeystoreBackend;
}

/**
 * ADR 0131 A3. Was auf Android als Keystore zählt - und warum das hier
 * anders funktioniert als eine Zeile weiter oben.
 *
 * Auf Linux nennt die Schale einen Backend-Namen und der Kern urteilt. Auf
 * Android geht das nicht: das Urteil hängt an einem `KeyInfo` und an einer
 * Zertifikatskette, und der schalenfreie Kern sieht weder das eine noch das
 * andere. Also urteilt der Plattformcode, und was herüberkommt, ist ein
 * **Verdikt mit seinen Belegen** statt eines Namens, den der Kern nachschlägt.
 *
 * Das klingt nach weniger Regel und ist mehr davon. Der Kern prüft nicht,
 * *ob* der Schlüssel im TEE liegt - das kann er nicht -, sondern ob die
 * Belege dafür **zusammenpassen**. Und die entscheidende Regel ist die, die
 * am 2026-08-19 auf einem Galaxy A55 gemessen wurde: auf einem Keystore, der
 * durchgehend Software ist, gelingt *jeder einzelne* Aufruf genauso. Nur zwei
 * Quellen zugleich lügen nicht so leicht wie eine. Ein Beleg mit einer Quelle
 * wird deshalb **abgelehnt**, nicht mit halber Sicherheit angenommen.
 */
export const picoCompanionAndroidKeystoreLevels = [
  'trusted_environment',
  'strongbox',
] as const;

export type PicoCompanionAndroidKeystoreLevel =
  typeof picoCompanionAndroidKeystoreLevels[number];

/**
 * Googles Attestierungswurzeln, beide.
 *
 * Es ist nicht eine. Die RSA-Wurzel (`SERIALNUMBER=f92009e853b6b045`, gültig
 * bis 2042) signierte jede Kette, bis Googles EC-Wurzel - `CN=Key Attestation
 * CA1`, P-384 - am 2026-02-01 zu signieren begann. Wer nur die ältere pinnt,
 * lehnt aktuelle Telefone ab; wer nur die neuere pinnt, lehnt jedes ab, das
 * noch nicht umgezogen ist.
 *
 * Hier stehen **Namen**, nicht Schlüssel. Die Bytes liegen im Plattformcode,
 * der die Kette prüft - der Kern kann eine Kette nicht prüfen und soll nicht
 * so tun. Was er kann: verlangen, dass der Plattformcode eine Wurzel nennt,
 * die es gibt, statt eine Kette gegen irgendetwas geprüft zu haben.
 */
export const picoCompanionAndroidAttestationRoots = [
  'google_rsa_f92009e853b6b045',
  'google_ec_key_attestation_ca1',
] as const;

export type PicoCompanionAndroidAttestationRoot =
  typeof picoCompanionAndroidAttestationRoots[number];

/**
 * Was der Plattformcode über einen Schlüssel behauptet, und woran er es
 * festmacht.
 *
 * `attestedKeyLevel` und `attestationLevel` sind nicht dasselbe und werden
 * hier getrennt gehalten: das erste sagt, wo der **Schlüssel** lebt, das
 * zweite, wo die **Attestierung** entstanden ist. Eine in Software erzeugte
 * Attestierung über einen angeblichen TEE-Schlüssel ist kein Beleg, sondern
 * eine Behauptung mit einer Unterschrift darunter.
 */
export interface PicoCompanionAndroidKeystoreEvidence {
  platform: 'android';
  /** `KeyInfo.getSecurityLevel()` - die Auskunft des Keystores über sich selbst. */
  keyInfoLevel: string;
  /** Aus der signierten Erweiterung: wo der Schlüssel lebt. */
  attestedKeyLevel: string;
  /** Aus der signierten Erweiterung: wo die Attestierung entstand. */
  attestationLevel: string;
  /** Welche gepinnte Wurzel die Kette verifiziert hat, oder `none`. */
  attestationRoot: string;
  /** Kam die Challenge unverändert zurück? */
  challengeMatches: boolean;
  /** Verified-Boot-Zustand, mitgeführt und **nicht** beurteilt - siehe unten. */
  verifiedBootState: string;
  /** Bootloader gesperrt, mitgeführt und **nicht** beurteilt. */
  deviceLocked: boolean;
  /** OS-Patchstand aus der Erweiterung, etwa `202607`. */
  osPatchLevel: string;
  /** Boot-Patchstand aus der Erweiterung, etwa `20260705`. */
  bootPatchLevel: string;
}

/**
 * Der Beleg kommt als JSON über eine Prozessgrenze, und ein fehlendes Feld
 * darf nicht als "in Ordnung" gelesen werden.
 *
 * Deshalb ist das hier streng statt tolerant: `undefined` ist kein `false`
 * und keine leere Zeichenkette. Ein Plattformcode, der ein Feld vergisst,
 * soll eine Ablehnung bekommen und keinen stillen Freibrief.
 */
export function parsePicoCompanionAndroidKeystoreEvidence(
  value: unknown,
): PicoCompanionAndroidKeystoreEvidence {
  if (typeof value !== 'object' || value === null) {
    throw new Error('platform_keystore_evidence_malformed');
  }
  const record = value as Record<string, unknown>;
  if (record.platform !== 'android') {
    throw new Error('platform_keystore_evidence_malformed');
  }
  const text = (field: string): string => {
    const found = record[field];
    if (typeof found !== 'string' || found.length === 0) {
      throw new Error('platform_keystore_evidence_malformed');
    }
    return found;
  };
  const flag = (field: string): boolean => {
    const found = record[field];
    if (typeof found !== 'boolean') {
      throw new Error('platform_keystore_evidence_malformed');
    }
    return found;
  };
  return {
    platform: 'android',
    keyInfoLevel: text('keyInfoLevel'),
    attestedKeyLevel: text('attestedKeyLevel'),
    attestationLevel: text('attestationLevel'),
    attestationRoot: text('attestationRoot'),
    challengeMatches: flag('challengeMatches'),
    verifiedBootState: text('verifiedBootState'),
    deviceLocked: flag('deviceLocked'),
    osPatchLevel: text('osPatchLevel'),
    bootPatchLevel: text('bootPatchLevel'),
  };
}

/**
 * Das Sicherheitsniveau, auf das die Belege sich einigen - oder eine
 * Ablehnung, die sagt, woran es lag.
 *
 * Die Reihenfolge der Prüfungen ist nicht Geschmack. Erst die Wurzel, dann
 * die Challenge, dann erst der Inhalt: eine Erweiterung, deren Kette gegen
 * nichts Bekanntes geprüft wurde, ist unsignierter Text, und ihre Aussage
 * über das Sicherheitsniveau zu lesen, bevor man weiß, wer sie unterschrieben
 * hat, hieße dem Text zu glauben, weil er das Richtige sagt.
 *
 * **Verified Boot und der Sperrzustand werden mitgeführt, aber nicht
 * beurteilt.** Ein entsperrter Bootloader macht die Attestierung nicht
 * unecht - sie sagt dann ehrlich `unverified` -, und ob pico auf solchen
 * Geräten laufen darf, ist eine Produktentscheidung mit Folgen, die sich
 * nicht nebenbei in einer Prüffunktion treffen lässt. Sie steht als offene
 * Frage in ADR 0131 A3, damit jemand sie trifft, statt sie hier zu erben.
 */
export function requirePicoCompanionAndroidKeystoreLevel(
  evidence: PicoCompanionAndroidKeystoreEvidence,
): PicoCompanionAndroidKeystoreLevel {
  if (!picoCompanionAndroidAttestationRoots.includes(
    evidence.attestationRoot as PicoCompanionAndroidAttestationRoot,
  )) {
    throw new Error('platform_keystore_attestation_unrooted');
  }
  if (!evidence.challengeMatches) {
    throw new Error('platform_keystore_attestation_challenge_mismatch');
  }
  const level = (claimed: string): PicoCompanionAndroidKeystoreLevel => {
    if (!picoCompanionAndroidKeystoreLevels.includes(
      claimed as PicoCompanionAndroidKeystoreLevel,
    )) {
      // `software` ist der Wert, der hier tatsächlich vorkommt, und er hat
      // einen eigenen Namen verdient - so wie `basic_text` eine Zeile weiter
      // oben. Alles andere ist ein Keystore, den diese Fassung nicht kennt,
      // und das ist ein anderes Problem als einer, den sie ablehnt.
      throw new Error(claimed === 'software'
        ? 'platform_keystore_software_refused'
        : 'platform_keystore_level_unknown');
    }
    return claimed as PicoCompanionAndroidKeystoreLevel;
  };
  level(evidence.attestationLevel);
  const attested = level(evidence.attestedKeyLevel);
  const reported = level(evidence.keyInfoLevel);
  if (attested !== reported) {
    // Zwei Quellen, die verschiedene Dinge sagen, sind kein Beleg, sondern
    // ein Widerspruch. Die schwächere zu nehmen wäre die naheliegende Geste
    // und die falsche: welche der beiden lügt, weiß niemand.
    throw new Error('platform_keystore_evidence_disagrees');
  }
  return attested;
}


/**
 * Der Android-Port: dieselbe Aufgabe wie oben, eine Tür weniger.
 *
 * Auf Linux fragt der Kern zweimal - `isEncryptionAvailable()` und dann
 * `selectedBackend()` -, weil Electron beide Auskünfte einzeln gibt. Auf
 * Android gibt es nur eine Frage, und ihre Antwort ist der Beleg: wer
 * `keystoreEvidence()` nicht beantworten kann, hat keinen Keystore, den
 * dieses Produkt benutzen würde. Zwei Türen, von denen die zweite alles
 * entscheidet, wären hier nur eine Stelle mehr, an der jemand nur die erste
 * abfragt.
 *
 * `unknown` als Rückgabetyp ist Absicht. Der Wert kommt aus Java über eine
 * Prozessgrenze, und `parsePicoCompanionAndroidKeystoreEvidence` ist die
 * Stelle, an der er eine Form bekommt - ein deklarierter Typ hier wäre ein
 * Versprechen, das der Kern nicht halten kann.
 */
export interface PicoCompanionAndroidSecretPort {
  platform: 'android';
  keystoreEvidence(): unknown;
  encryptString(plainText: string): Uint8Array;
  decryptString(encrypted: Uint8Array): string;
}

/**
 * Das Niveau, unter dem dieses Gerät ein Geheimnis versiegeln darf - oder
 * die Ablehnung des Belegs, die schon sagt, woran es lag.
 */
export function requirePicoCompanionAndroidKeystore(
  secrets: PicoCompanionAndroidSecretPort,
): PicoCompanionAndroidKeystoreLevel {
  return requirePicoCompanionAndroidKeystoreLevel(
    parsePicoCompanionAndroidKeystoreEvidence(secrets.keystoreEvidence()),
  );
}
