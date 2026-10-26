import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

/**
 * Get current device GPS coordinates.
 * On Native (Android/iOS): requests/verifies native location permissions first.
 * On Web: uses Geolocation (or navigator.geolocation fallback).
 * Never guesses coordinates or looks at order history.
 */
export async function getDeviceCoordinates({
  enableHighAccuracy = true,
  timeout = 8000,
  maximumAge = 10000,
} = {}) {
  // 1. Try Capacitor Geolocation (handles native Android/iOS fused location)
  try {
    if (Capacitor.isNativePlatform()) {
      try {
        const perm = await Geolocation.checkPermissions();
        if (perm?.location !== 'granted') {
          const req = await Geolocation.requestPermissions({ permissions: ['location'] });
          if (req?.location !== 'granted') {
            console.warn('[deviceLocation] Location permission denied by user');
            return null;
          }
        }
      } catch (permErr) {
        console.warn('[deviceLocation] Permission check error:', permErr);
      }
    }

    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy,
      timeout,
      maximumAge,
    });

    if (pos?.coords && typeof pos.coords.latitude === 'number' && typeof pos.coords.longitude === 'number') {
      return {
        lat: Number(pos.coords.latitude),
        lng: Number(pos.coords.longitude),
        accuracy: pos.coords.accuracy || 0,
      };
    }
  } catch (err) {
    console.warn('[deviceLocation] Geolocation.getCurrentPosition failed:', err?.message || err);
  }

  // 2. Browser fallback if Capacitor Geolocation timed out or is unavailable
  if (typeof navigator !== 'undefined' && navigator.geolocation) {
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy,
          timeout,
          maximumAge,
        });
      });
      if (pos?.coords && typeof pos.coords.latitude === 'number' && typeof pos.coords.longitude === 'number') {
        return {
          lat: Number(pos.coords.latitude),
          lng: Number(pos.coords.longitude),
          accuracy: pos.coords.accuracy || 0,
        };
      }
    } catch (err) {
      console.warn('[deviceLocation] navigator.geolocation failed:', err?.message || err);
    }
  }

  return null;
}

/**
 * Reverse geocode latitude and longitude using Nominatim OpenStreetMap
 */
export async function reverseGeocodeNominatim(lat, lng, timeoutMs = 3500) {
  if (lat == null || lng == null) return 'Lokasi GPS Anda Saat Ini';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      {
        headers: { 'Accept-Language': 'id,en' },
        signal: controller.signal,
      }
    );
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (data?.display_name) {
        const parts = data.display_name.split(',');
        return parts.slice(0, 3).join(',').trim();
      }
    }
  } catch (_) {
    // ignore network or reverse geocode timeout
  }
  return 'Lokasi GPS Anda Saat Ini';
}

/**
 * Get factual device location with coordinates and address.
 * Returns { lat, lng, address, accuracy, isDeviceGps: true } or null if unavailable.
 * Never guesses or falls back to order history.
 */
export async function getDeviceLocationWithAddress({
  enableHighAccuracy = true,
  timeout = 8000,
} = {}) {
  const coords = await getDeviceCoordinates({ enableHighAccuracy, timeout });
  if (!coords) return null;
  const address = await reverseGeocodeNominatim(coords.lat, coords.lng);
  return {
    lat: coords.lat,
    lng: coords.lng,
    address,
    accuracy: coords.accuracy,
    isDeviceGps: true,
  };
}
