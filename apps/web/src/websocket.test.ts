import { describe, expect, it } from 'vitest';
import { buildWebSocketUrl } from './websocket.js';

describe('realtime WebSocket URL helper', () => {
  it('uses ws for direct http base URLs', () => {
    expect(buildWebSocketUrl('http://localhost:3100', undefined)).toBe('ws://localhost:3100/ws');
  });

  it('preserves Home Assistant ingress path prefixes', () => {
    expect(buildWebSocketUrl('https://ha.local/api/hassio_ingress/pico_core', undefined))
      .toBe('wss://ha.local/api/hassio_ingress/pico_core/ws');
  });

  it('adds short-lived realtime tickets under the prefixed WebSocket URL', () => {
    expect(buildWebSocketUrl('https://ha.local/api/hassio_ingress/pico_core', 'ticket with spaces'))
      .toBe('wss://ha.local/api/hassio_ingress/pico_core/ws?ticket=ticket+with+spaces');
  });
});
