import { EventEmitter } from 'node:events';
import type { BrowserWindow, Event, Input } from 'electron';
import { describe, expect, it } from 'vitest';
import { collectPicoCompanionSecureInput } from './secure-input.js';

describe('main-process secure input', () => {
  it('prevents renderer delivery and exposes only counts while editing', async () => {
    const fixture = windowFixture();
    const counts: Array<[number, boolean]> = [];
    const result = collectPicoCompanionSecureInput({
      window: fixture.window,
      prompt: {
        title: 'Card PIN',
        instruction: 'Type the Card PIN.',
        maximumLength: 64,
        refusal: 'A Card PIN is 6-64 digits or lowercase letters.',
        validate: (value) => /^[0-9a-z]{6,64}$/u.test(value),
      },
      presentCount: (count, invalid) => { counts.push([count, invalid]); },
    });

    for (const key of ['s', '3', 'c', 'a', 'r', 'x', 'Backspace', 'd', 'Enter']) {
      fixture.key(key);
    }
    await expect(result).resolves.toBe('s3card');
    expect(fixture.prevented).toBe(9);
    expect(counts).toEqual([
      [0, false],
      [1, false], [2, false], [3, false], [4, false], [5, false],
      [6, false], [5, false], [6, false],
    ]);
    expect(JSON.stringify(counts)).not.toContain('s3card');
  });

  it('refuses modifier paste, reports invalid Enter and cancels on Escape', async () => {
    const fixture = windowFixture();
    const counts: Array<[number, boolean]> = [];
    const result = collectPicoCompanionSecureInput({
      window: fixture.window,
      prompt: {
        title: 'Vault passphrase',
        instruction: 'Type the Vault passphrase.',
        maximumLength: 10,
        refusal: 'A passphrase is at least two characters.',
        validate: (value) => value.length >= 2,
      },
      presentCount: (count, invalid) => { counts.push([count, invalid]); },
    });
    fixture.key('v', { control: true });
    fixture.key('x');
    fixture.key('Enter');
    fixture.key('Escape');
    await expect(result).rejects.toThrow('secure_input_cancelled');
    expect(counts).toContainEqual([1, true]);
  });
});

function windowFixture(): {
  window: BrowserWindow;
  key(value: string, flags?: Partial<Input>): void;
  prevented: number;
} {
  const contents = new EventEmitter();
  const window = new EventEmitter() as EventEmitter & { webContents: EventEmitter; focus(): void };
  window.webContents = contents;
  window.focus = () => undefined;
  const fixture = {
    window: window as unknown as BrowserWindow,
    prevented: 0,
    key(value: string, flags: Partial<Input> = {}) {
      const event = {
        preventDefault: () => { fixture.prevented += 1; },
      } as unknown as Event;
      contents.emit('before-input-event', event, {
        type: 'keyDown',
        key: value,
        control: false,
        meta: false,
        alt: false,
        shift: false,
        ...flags,
      } as Input);
    },
  };
  return fixture;
}
