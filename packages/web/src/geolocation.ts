/**
 * Browser geolocation for first-load location detection.
 * Reverse-geocodes via Nominatim to get a city name, then updates
 * default weather/forecast boxes with real local data.
 */

import { getBoxes, updateConfig } from './state';
import { fetchWeather, fetchForecast3D } from './api';
import type { WeatherConfig, Forecast3DConfig } from './state';

interface NominatimReverseResult {
  address?: {
    city?: string;
    town?: string;
    village?: string;
    state?: string;
  };
}

/**
 * Detect the user's location via browser geolocation API and populate
 * default weather/forecast boxes with real local data.
 * Only runs when the weather box's city is unset (fresh install).
 * Falls back silently on permission denial, timeout, or error.
 */
export async function detectLocation(): Promise<void> {
  // Only run if the weather city hasn't been set yet (empty = fresh install)
  const boxes = getBoxes();
  const weatherBox = boxes.find((b) => b.type === 'weather');
  if (!weatherBox) return;
  const weatherCfg = weatherBox.config as WeatherConfig;
  if (weatherCfg.city.trim() !== '') return;

  // Request browser geolocation
  let lat: number;
  let lon: number;
  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        timeout: 5000,
        maximumAge: 300000,
      });
    });
    lat = pos.coords.latitude;
    lon = pos.coords.longitude;
  } catch {
    return; // Permission denied or timeout — keep Portland default
  }

  // Reverse-geocode via Nominatim
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse` +
      `?lat=${String(lat)}&lon=${String(lon)}` +
      `&format=json&zoom=10`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (!res.ok) return;

    const data = (await res.json()) as NominatimReverseResult;
    const addr = data.address;
    if (!addr) return;

    const city = addr.city ?? addr.town ?? addr.village;
    if (!city) return;

    const locationStr = addr.state ? `${city}, ${addr.state}` : city;

    // Update all location-based boxes that still have an empty city
    for (const box of boxes) {
      if (
        box.type === 'weather' ||
        box.type === 'forecast' ||
        box.type === 'forecast3d' ||
        box.type === 'sun' ||
        box.type === 'aqi'
      ) {
        const cfg = box.config as { city: string };
        if (cfg.city.trim() === '') {
          updateConfig(box.id, 'city', locationStr);
        }
      }
    }

    // Fetch real data for weather and forecast boxes
    const updatedBoxes = getBoxes();
    for (const box of updatedBoxes) {
      if (box.type === 'weather') {
        const cfg = box.config as WeatherConfig;
        if (cfg.city === locationStr && !cfg.data) {
          const weatherData = await fetchWeather(locationStr);
          if (weatherData) {
            const { updateWeatherData } = await import('./state');
            updateWeatherData(box.id, weatherData);
          }
        }
      }
      if (box.type === 'forecast3d') {
        const cfg = box.config as Forecast3DConfig;
        if (cfg.city === locationStr) {
          const entries = await fetchForecast3D(locationStr);
          if (entries) {
            const { updateForecast3DEntries } = await import('./state');
            updateForecast3DEntries(box.id, entries);
          }
        }
      }
    }
  } catch {
    // Nominatim error — keep Portland default
  }
}
