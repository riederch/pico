/**
 * ADR 0130 E1. Which doors lead to a running companion, and whether that is
 * enough to ship.
 *
 * **The tray is one door among several, and on the desktop most people run it
 * is not there at all.** GNOME has shipped without a StatusNotifierItem host
 * since 3.26; KDE hosts one. A tray-only companion is therefore invisible on
 * the largest Linux desktop while looking perfectly healthy from inside the
 * process - it created its `Tray` object, nobody threw, and no icon exists.
 * That is the assumption this module refuses to let anyone hold: reachability
 * is a property of the session, so it is measured there rather than assumed
 * from the code that asks for it.
 *
 * Three doors, and they fail independently:
 *
 * - the **tray**, which needs a StatusNotifierItem host on the session bus;
 * - the **desktop entry**, which needs the installed `.desktop` to name the
 *   executable that holds the single-instance lock, so launching it a second
 *   time raises the first rather than starting a second companion;
 * - the **notification**, which needs a daemon owning
 *   `org.freedesktop.Notifications` and an action that opens the window.
 *
 * **Two must work, and the tray may not be one of only two.** A platform whose
 * second door is the tray ships something that vanishes on GNOME.
 *
 * Nothing here talks to a bus or a filesystem. The facts are passed in, so the
 * negative case - the one that matters - can be constructed rather than waited
 * for.
 */

export const picoCompanionDoorNames = Object.freeze([
  'tray',
  'desktop_entry',
  'notification',
]);

/**
 * Reads the doors from facts a probe measured.
 *
 * Every door carries why it is or is not available. A door reported absent
 * without a reason is the same as no report: the next person reads "false"
 * and guesses, which is how "the tray is missing" became "the tray is broken"
 * in every bug report GNOME users have ever filed about an Electron app.
 */
export function readPicoCompanionDoors(facts) {
  const doors = [];

  doors.push(facts.statusNotifierHost === true
    ? { door: 'tray', available: true, reason: 'a StatusNotifierItem host owns the name' }
    : {
      door: 'tray',
      available: false,
      reason: 'no StatusNotifierItem host on the session bus, so an icon would be '
        + 'created and hosted by nobody',
    });

  if (facts.desktopEntryInstalled !== true) {
    doors.push({
      door: 'desktop_entry',
      available: false,
      reason: 'the package installs no desktop entry',
    });
  } else if (facts.desktopEntryExecutable !== facts.singletonExecutable) {
    // The subtle failure: an entry that launches something else starts a
    // second companion instead of raising the first, and both then hold half
    // the state.
    doors.push({
      door: 'desktop_entry',
      available: false,
      reason: `the desktop entry runs ${String(facts.desktopEntryExecutable)}, which is `
        + `not the executable holding the single-instance lock `
        + `(${String(facts.singletonExecutable)})`,
    });
  } else if (facts.secondLaunchRaisedTheFirst !== true) {
    doors.push({
      door: 'desktop_entry',
      available: false,
      reason: 'launching it a second time did not raise the running companion',
    });
  } else {
    doors.push({
      door: 'desktop_entry',
      available: true,
      reason: 'launching it a second time raised the running companion',
    });
  }

  if (facts.notificationDaemon !== true) {
    doors.push({
      door: 'notification',
      available: false,
      reason: 'no daemon owns org.freedesktop.Notifications',
    });
  } else if (facts.notificationsSupported !== true) {
    doors.push({
      door: 'notification',
      available: false,
      reason: 'the runtime reports notifications as unsupported',
    });
  } else if (facts.notificationOpensTheWindow !== true) {
    // A notification a person cannot act on is an announcement, not a door.
    doors.push({
      door: 'notification',
      available: false,
      reason: 'the notification carries no action that opens the window',
    });
  } else {
    doors.push({
      door: 'notification',
      available: true,
      reason: 'a daemon owns the name and the notification opens the window',
    });
  }

  return Object.freeze(doors.map((entry) => Object.freeze(entry)));
}

/**
 * ADR 0130 E1's shipping rule, with the reasons in the refusal.
 *
 * ADR 0077 C4 - a refusal must not be an inventory - is why this names the
 * doors that failed and why, rather than reporting a count. "1 of 3" sends
 * somebody to read three implementations; "no StatusNotifierItem host on the
 * session bus" sends them to the right one.
 */
export function assertPicoCompanionReachability(doors) {
  const available = doors.filter((entry) => entry.available);
  const missing = doors.filter((entry) => !entry.available);
  const explain = () => (missing.length === 0
    ? ''
    : ` Closed: ${missing.map((entry) => `${entry.door} (${entry.reason})`).join('; ')}.`);

  if (available.length < 2) {
    throw new Error(
      `Pico is reachable through ${available.length} door(s); ADR 0130 E1 requires two `
      + `independent, always-available ones.${explain()}`,
    );
  }
  if (available.length === 2 && available.some((entry) => entry.door === 'tray')) {
    throw new Error(
      'Pico is reachable through exactly two doors and one of them is the tray. '
      + 'ADR 0130 E1 refuses that: the tray is absent on stock GNOME, which would '
      + `leave one door on the largest Linux desktop.${explain()}`,
    );
  }
  return Object.freeze(available.map((entry) => entry.door));
}

/**
 * The `Exec=` of a desktop entry, without its field codes.
 *
 * Parsed rather than matched, because the interesting comparison is against
 * the executable that holds the single-instance lock and a substring test
 * would call `/usr/local/bin/pico-companion` a match for
 * `/opt/pico-companion/pico-companion`.
 *
 * Only the `[Desktop Entry]` group counts: an action group further down the
 * file has its own `Exec=`, and reading that one would compare the wrong
 * command.
 */
export function picoDesktopEntryExec(contents) {
  let inEntryGroup = false;
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('[')) {
      inEntryGroup = line === '[Desktop Entry]';
      continue;
    }
    if (!inEntryGroup || !line.startsWith('Exec=')) {
      continue;
    }
    // Field codes (%u, %F, ...) are the launcher's, not part of the command.
    const command = line.slice('Exec='.length).trim();
    const [executable] = command.split(/\s+/u).filter((token) => !token.startsWith('%'));
    return executable ?? null;
  }
  return null;
}

/**
 * The binary a packaged launcher hands control to.
 *
 * The installed `Exec` is a shell script - ADR 0123 Z3 needs a place to drop
 * the core-dump limits before Electron starts - so the entry names the
 * launcher and the running process is something else. Comparing the entry to
 * the process directly would compare two names that are correctly different,
 * which is the sort of check that passes forever without looking at anything.
 */
export function picoLauncherExecTarget(contents) {
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('exec ')) {
      continue;
    }
    const [command] = line.slice('exec '.length).trim().split(/\s+/u);
    const unquoted = command.replace(/^"|"$/gu, '');
    const name = unquoted.split('/').at(-1);
    return name === undefined || name === '' ? null : name;
  }
  return null;
}
