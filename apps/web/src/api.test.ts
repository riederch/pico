import { describe, expect, it } from 'vitest';
import { DEFAULT_PICO_HOME_URL, buildEndpointUrl, defaultPicoHomeUrl, normalizePicoHomeUrl } from './api.js';

describe('foundation URL helpers', () => {
  it('defaults to the same origin for a direct root dashboard', () => {
    expect(defaultPicoHomeUrl(browserLocation('http://localhost:3100/'))).toBe('http://localhost:3100');
  });

  it('preserves a Home Assistant ingress path prefix from the dashboard location', () => {
    expect(defaultPicoHomeUrl(browserLocation('https://ha.local/api/hassio_ingress/pico_core/')))
      .toBe('https://ha.local/api/hassio_ingress/pico_core');
  });

  it('preserves a non-file path prefix when the dashboard URL has no trailing slash', () => {
    expect(defaultPicoHomeUrl(browserLocation('https://ha.local/api/hassio_ingress/pico_core')))
      .toBe('https://ha.local/api/hassio_ingress/pico_core');
  });

  it('uses the parent path when the dashboard URL points to an html file', () => {
    expect(defaultPicoHomeUrl(browserLocation('https://ha.local/api/hassio_ingress/pico_core/index.html?cache=1#top')))
      .toBe('https://ha.local/api/hassio_ingress/pico_core');
  });

  it('falls back to the local development URL outside http(s)', () => {
    expect(defaultPicoHomeUrl(browserLocation('file:///tmp/pico/index.html'))).toBe(DEFAULT_PICO_HOME_URL);
  });

  it('normalizes manually entered base URLs with path prefixes', () => {
    expect(normalizePicoHomeUrl('https://ha.local/api/hassio_ingress/pico_core/'))
      .toBe('https://ha.local/api/hassio_ingress/pico_core');
  });

  it('builds endpoint URLs below the configured base path', () => {
    expect(buildEndpointUrl('https://ha.local/api/hassio_ingress/pico_core', '/api/system/status').toString())
      .toBe('https://ha.local/api/hassio_ingress/pico_core/api/system/status');
  });

  it('clears base URL query strings and fragments when building endpoints', () => {
    expect(buildEndpointUrl('https://ha.local/api/hassio_ingress/pico_core?old=1#section', '/health').toString())
      .toBe('https://ha.local/api/hassio_ingress/pico_core/health');
  });
});

function browserLocation(href: string): Pick<Location, 'href' | 'origin' | 'protocol'> {
  const url = new URL(href);

  return {
    href: url.href,
    origin: url.origin,
    protocol: url.protocol,
  };
}
