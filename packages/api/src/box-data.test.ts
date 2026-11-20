import { describe, expect, it } from 'vitest';
import { MAX_LOCATION_LENGTH, parseBoxDataRequest } from './box-data.js';

function query(params: Record<string, string>): (name: string) => string | undefined {
  return (name) => params[name];
}

function keyOf(type: string, params: Record<string, string>): string {
  const result = parseBoxDataRequest(type, query(params));
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
  return result.request.key;
}

function errorOf(type: string, params: Record<string, string>): string {
  const result = parseBoxDataRequest(type, query(params));
  if (result.ok) throw new Error(`expected an error, got key ${result.request.key}`);
  return result.error;
}

describe('parseBoxDataRequest', () => {
  it('rejects an unknown box type', () => {
    expect(errorOf('stocks', { location: 'Portland' })).toBe('Unknown box type');
  });

  it('normalizes the location so equivalent requests share a cache key', () => {
    expect(keyOf('sun', { location: '  Portland,   OR ' })).toBe('sun:portland, or');
    expect(keyOf('sun', { location: 'PORTLAND, OR' })).toBe('sun:portland, or');
  });

  it('rejects an empty or over-long location', () => {
    expect(errorOf('aqi', {})).toBe('Invalid or missing location');
    expect(errorOf('aqi', { location: '   ' })).toBe('Invalid or missing location');
    expect(errorOf('aqi', { location: 'x'.repeat(MAX_LOCATION_LENGTH + 1) })).toBe(
      'Invalid or missing location',
    );
    expect(keyOf('aqi', { location: 'x'.repeat(MAX_LOCATION_LENGTH) })).toMatch(/^aqi:x+$/);
  });

  it('keys temperature boxes by unit, defaulting to Fahrenheit', () => {
    expect(keyOf('weather', { location: 'Oslo' })).toBe('weather:oslo:F');
    expect(keyOf('weather', { location: 'Oslo', unit: 'c' })).toBe('weather:oslo:C');
    expect(errorOf('weather', { location: 'Oslo', unit: 'K' })).toBe('Invalid unit');
  });

  it('bounds forecast hours and forecast3d days to the schema ranges', () => {
    expect(keyOf('forecast', { location: 'Oslo' })).toBe('forecast:oslo:F:3');
    expect(keyOf('forecast', { location: 'Oslo', hours: '24' })).toBe('forecast:oslo:F:24');
    expect(errorOf('forecast', { location: 'Oslo', hours: '25' })).toBe('Invalid hours');
    expect(errorOf('forecast', { location: 'Oslo', hours: '0' })).toBe('Invalid hours');
    expect(errorOf('forecast', { location: 'Oslo', hours: '1.5' })).toBe('Invalid hours');

    expect(keyOf('forecast3d', { location: 'Oslo', days: '20' })).toBe('forecast3d:oslo:F:20');
    expect(errorOf('forecast3d', { location: 'Oslo', days: '21' })).toBe('Invalid days');
  });

  it('requires a two-letter country code for holidays', () => {
    expect(keyOf('holidays', { country: ' gb ' })).toBe('holidays:GB');
    expect(errorOf('holidays', {})).toBe('Invalid or missing country');
    expect(errorOf('holidays', { country: 'GBR' })).toBe('Invalid or missing country');
    expect(errorOf('holidays', { country: '../' })).toBe('Invalid or missing country');
  });
});
