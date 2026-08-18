import { describe, expect, it } from 'vitest';
import {
  assertPicoCompanionReachability,
  picoCompanionDoorNames,
  picoDesktopEntryExec,
  picoLauncherExecTarget,
  readPicoCompanionDoors,
} from './reachability.mjs';

/**
 * ADR 0130 E1. The case that matters is the one nobody's machine is in.
 *
 * The KDE session this was written on hosts a StatusNotifierItem and a
 * notification daemon, so all three doors are open and every arrangement below
 * would pass by accident. Stock GNOME - the desktop most Linux users run - has
 * no tray host, and that is the shape these facts are built to describe.
 */
const everything = {
  statusNotifierHost: true,
  desktopEntryInstalled: true,
  desktopEntryExecutable: '/opt/pico-companion/pico-companion',
  singletonExecutable: '/opt/pico-companion/pico-companion',
  secondLaunchRaisedTheFirst: true,
  notificationDaemon: true,
  notificationsSupported: true,
  notificationOpensTheWindow: true,
};

const doors = (overrides = {}) => readPicoCompanionDoors({ ...everything, ...overrides });
const open = (overrides = {}) => assertPicoCompanionReachability(doors(overrides));

describe('the doors a session actually offers', () => {
  it('reports every door it knows, present or not', () => {
    // A door left out of the report is a door nobody notices closing.
    expect(doors().map((entry) => entry.door)).toEqual([...picoCompanionDoorNames]);
    expect(doors({ statusNotifierHost: false }).map((entry) => entry.door))
      .toEqual([...picoCompanionDoorNames]);
  });

  it('gives every closed door a reason, not a false', () => {
    for (const entry of doors({
      statusNotifierHost: false,
      notificationDaemon: false,
      desktopEntryInstalled: false,
    })) {
      expect(entry.reason.length).toBeGreaterThan(20);
    }
  });

  it('closes the tray when nothing hosts it, which is stock GNOME', () => {
    const [tray] = doors({ statusNotifierHost: false });
    expect(tray?.available).toBe(false);
    expect(tray?.reason).toContain('hosted by nobody');
  });

  it('closes the desktop entry when it launches something else', () => {
    /**
     * The failure that looks like success: a second companion starts, both
     * hold half the state, and the person sees a window - so nothing reads as
     * broken until two processes disagree about the vault.
     */
    const closed = doors({ desktopEntryExecutable: '/usr/bin/pico-companion' })
      .find((entry) => entry.door === 'desktop_entry');
    expect(closed?.available).toBe(false);
    expect(closed?.reason).toContain('single-instance lock');
  });

  it('closes the desktop entry when a second launch did not raise the first', () => {
    const closed = doors({ secondLaunchRaisedTheFirst: false })
      .find((entry) => entry.door === 'desktop_entry');
    expect(closed?.available).toBe(false);
    expect(closed?.reason).toContain('did not raise');
  });

  it('closes a notification that announces without opening anything', () => {
    // A person who cannot act on it has been told, not reached.
    const closed = doors({ notificationOpensTheWindow: false })
      .find((entry) => entry.door === 'notification');
    expect(closed?.available).toBe(false);
    expect(closed?.reason).toContain('no action that opens the window');
  });

  it('treats an unmeasured fact as a closed door', () => {
    // ADR 0117 X1. Absence is not a value: a probe that failed to measure
    // must not read as a door that works.
    for (const entry of readPicoCompanionDoors({})) {
      expect(entry.available).toBe(false);
    }
  });
});

describe('what ADR 0130 E1 lets ship', () => {
  it('passes a session with all three', () => {
    expect(open()).toEqual(['tray', 'desktop_entry', 'notification']);
  });

  it('passes stock GNOME on the two doors that are not the tray', () => {
    // The whole point: no tray host, and the platform still ships.
    expect(open({ statusNotifierHost: false })).toEqual(['desktop_entry', 'notification']);
  });

  it('refuses one door, and says which ones are shut and why', () => {
    expect(() => open({ statusNotifierHost: false, notificationDaemon: false }))
      .toThrow('reachable through 1 door(s)');
    // ADR 0077 C4. The refusal names the cause instead of counting.
    expect(() => open({ statusNotifierHost: false, notificationDaemon: false }))
      .toThrow('org.freedesktop.Notifications');
  });

  it('refuses two doors when one of them is the tray', () => {
    /**
     * The arrangement that would ship and then disappear: tray plus desktop
     * entry passes a count of two, and on stock GNOME it is one.
     */
    expect(() => open({ notificationDaemon: false }))
      .toThrow('one of them is the tray');
    expect(() => open({ secondLaunchRaisedTheFirst: false }))
      .toThrow('one of them is the tray');
  });

  it('accepts two doors when neither is the tray', () => {
    expect(open({ statusNotifierHost: false })).not.toContain('tray');
  });
});

describe('the command a desktop entry actually runs', () => {
  const entry = [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Pico Companion',
    'Exec=/opt/pico-companion/pico-companion',
    'Terminal=false',
    '',
  ].join('\n');

  it('reads the executable out of the entry group', () => {
    expect(picoDesktopEntryExec(entry)).toBe('/opt/pico-companion/pico-companion');
  });

  it('drops the launcher’s field codes', () => {
    expect(picoDesktopEntryExec('[Desktop Entry]\nExec=/opt/pico/pico %U\n'))
      .toBe('/opt/pico/pico');
  });

  it('ignores an Exec belonging to an action, not to the entry', () => {
    // Reading the last Exec in the file would compare the wrong command and
    // call a correct package broken - or a broken one correct.
    const withAction = `${entry}\n[Desktop Action Quit]\nExec=/usr/bin/pkill pico\n`;
    expect(picoDesktopEntryExec(withAction)).toBe('/opt/pico-companion/pico-companion');
  });

  it('returns nothing for an entry that launches nothing', () => {
    expect(picoDesktopEntryExec('[Desktop Entry]\nType=Application\n')).toBeNull();
    expect(picoDesktopEntryExec('')).toBeNull();
  });
});

describe('the binary the packaged launcher hands control to', () => {
  const launcher = [
    '#!/bin/sh',
    'set -eu',
    'ulimit -S -c 0',
    'ulimit -H -c 0',
    'pico_install_dir=${0%/*}',
    'exec "$pico_install_dir/pico-companion-bin" "$@"',
    '',
  ].join('\n');

  it('reads the target past the shell quoting and the install variable', () => {
    expect(picoLauncherExecTarget(launcher)).toBe('pico-companion-bin');
  });

  it('takes the first exec, which is the one that replaces the shell', () => {
    // Anything after it is unreachable, so reading a later line would name a
    // binary that never runs.
    expect(picoLauncherExecTarget(`${launcher}exec /usr/bin/false\n`))
      .toBe('pico-companion-bin');
  });

  it('returns nothing for a launcher that execs nothing', () => {
    expect(picoLauncherExecTarget('#!/bin/sh\nulimit -S -c 0\n')).toBeNull();
  });
});
