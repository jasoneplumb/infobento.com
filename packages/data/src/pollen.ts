/**
 * Intent: Current pollen load for the worst-risk allergen at a location, from
 *         the Open-Meteo Air Quality API (CAMS), geocoding the location first.
 * Context: Same upstream endpoint as air-quality.ts / uv.ts, different fields.
 * Pattern: Pure `fetch`; returns null on any failure.
 *
 * Coverage: Open-Meteo documents pollen as available "in Europe during pollen
 * season" only. Outside that window the fields come back null and this returns
 * null, so the box renders its "No data" state rather than a misleading zero.
 */

import type { PollenData } from '@infobento/core';
import { geocode } from './geocode.js';

interface OpenMeteoPollen {
  current: Record<string, number | null | undefined>;
}

/**
 * European Aeroallergen Network risk bands, in grains/m³. Trees and
 * grasses/weeds get different scales because their allergenicity differs — 50
 * grains of ragweed is a Very High day, 50 grains of birch is only Moderate.
 * Each array is the inclusive upper bound of Low / Moderate / High; anything
 * above the last entry is Very High.
 */
const TREE_BANDS = [10, 100, 1000] as const;
const GRASS_WEED_BANDS = [5, 20, 50] as const;

const LEVELS = ['Low', 'Moderate', 'High', 'Very High'] as const;

interface Species {
  readonly field: string;
  readonly label: string;
  readonly bands: readonly [number, number, number];
}

const SPECIES: readonly Species[] = [
  { field: 'alder_pollen', label: 'Alder', bands: TREE_BANDS },
  { field: 'birch_pollen', label: 'Birch', bands: TREE_BANDS },
  { field: 'olive_pollen', label: 'Olive', bands: TREE_BANDS },
  { field: 'grass_pollen', label: 'Grass', bands: GRASS_WEED_BANDS },
  { field: 'mugwort_pollen', label: 'Mugwort', bands: GRASS_WEED_BANDS },
  { field: 'ragweed_pollen', label: 'Ragweed', bands: GRASS_WEED_BANDS },
];

/** Index into LEVELS for a count on a given species' band scale. */
function bandIndex(count: number, bands: readonly [number, number, number]): number {
  if (count <= bands[0]) return 0;
  if (count <= bands[1]) return 1;
  if (count <= bands[2]) return 2;
  return 3;
}

/** Human-readable risk level for a count on a given species' band scale. */
export function pollenLevel(count: number, bands: readonly [number, number, number]): string {
  return LEVELS[bandIndex(count, bands)] as string;
}

/**
 * intent: Pick the allergen a sufferer would actually notice today
 * method: Highest risk band wins. Raw counts are NOT comparable across species
 *   (see the band comment above), so ties inside a band are broken by each
 *   count's fraction of that species' top threshold — a within-band severity
 *   proxy on a common 0..1 scale.
 */
function dominantAllergen(current: OpenMeteoPollen['current']): PollenData | null {
  let best: { species: Species; count: number; band: number; ratio: number } | undefined;
  let sawReading = false;

  for (const species of SPECIES) {
    const count = current[species.field];
    if (count == null) continue;
    sawReading = true;

    const band = bandIndex(count, species.bands);
    const ratio = count / species.bands[2];
    if (!best || band > best.band || (band === best.band && ratio > best.ratio)) {
      best = { species, count, band, ratio };
    }
  }

  // No species reported at all — out of coverage, not a quiet pollen day.
  if (!sawReading || !best) return null;

  // In coverage but everything reads zero: say so plainly instead of naming an
  // arbitrary species at zero grains.
  if (best.count === 0) return { allergen: 'None', count: 0, level: 'Low' };

  return {
    allergen: best.species.label,
    count: Math.round(best.count),
    level: LEVELS[best.band] as string,
  };
}

/**
 * Geocode a location and fetch its current pollen load. Returns null if the
 * location cannot be found, the request fails, or the location is outside
 * Open-Meteo's pollen coverage.
 */
export async function fetchPollen(location: string): Promise<PollenData | null> {
  const place = await geocode(location);
  if (!place) return null;

  try {
    const fields = SPECIES.map((s) => s.field).join(',');
    const url =
      `https://air-quality-api.open-meteo.com/v1/air-quality` +
      `?latitude=${String(place.latitude)}` +
      `&longitude=${String(place.longitude)}` +
      `&current=${fields}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = (await res.json()) as OpenMeteoPollen;
    return dominantAllergen(data.current);
  } catch {
    return null;
  }
}
