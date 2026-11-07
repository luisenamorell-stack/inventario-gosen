import { StoreBranchLocation, StoreSettings } from '../types';

/**
 * Extracts latitude and longitude from a raw string or Google Maps URL if present.
 */
export function extractCoordinatesFromText(input?: string): { lat: number; lng: number } | null {
  if (!input) return null;
  const raw = input.trim();

  // 1. Direct "lat, lng" pattern
  const directMatch = raw.match(/^(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/);
  if (directMatch) {
    const lat = Number(directMatch[1]);
    const lng = Number(directMatch[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
  }

  // 2. Google Maps URL patterns: @lat,lng or ?q=lat,lng or ll=lat,lng or !3dlat!4dlng
  const atMatch = raw.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/);
  if (atMatch) {
    return { lat: Number(atMatch[1]), lng: Number(atMatch[2]) };
  }

  const qMatch = raw.match(/[?&](?:q|ll|query)=(-?\d{1,2}\.\d+)(?:,|%2C)(-?\d{1,3}\.\d+)/i);
  if (qMatch) {
    return { lat: Number(qMatch[1]), lng: Number(qMatch[2]) };
  }

  const bangMatch = raw.match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/);
  if (bangMatch) {
    return { lat: Number(bangMatch[1]), lng: Number(bangMatch[2]) };
  }

  return null;
}

/**
 * Builds an embeddable map iframe URL for a StoreBranchLocation.
 */
export function buildBranchEmbedMapUrl(branch: StoreBranchLocation, fallbackStoreName?: string): string {
  if (
    typeof branch.latitude === 'number' &&
    typeof branch.longitude === 'number' &&
    !isNaN(branch.latitude) &&
    !isNaN(branch.longitude)
  ) {
    const q = `${branch.latitude},${branch.longitude}`;
    return `https://maps.google.com/maps?q=${encodeURIComponent(q)}&t=&z=16&ie=UTF8&iwloc=&output=embed`;
  }

  const coordsFromUrl = extractCoordinatesFromText(branch.googleMapsUrl);
  if (coordsFromUrl) {
    const q = `${coordsFromUrl.lat},${coordsFromUrl.lng}`;
    return `https://maps.google.com/maps?q=${encodeURIComponent(q)}&t=&z=16&ie=UTF8&iwloc=&output=embed`;
  }

  // Check if googleMapsUrl has a ?q= or /place/ query
  if (branch.googleMapsUrl) {
    const placeMatch = branch.googleMapsUrl.match(/\/maps\/place\/([^/@?]+)/i);
    if (placeMatch && placeMatch[1]) {
      const decoded = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
      return `https://maps.google.com/maps?q=${encodeURIComponent(decoded)}&t=&z=16&ie=UTF8&iwloc=&output=embed`;
    }
  }

  const parts = [branch.address, branch.city, branch.name || fallbackStoreName, 'Honduras']
    .map((s) => (s || '').trim())
    .filter(Boolean);
  const query = parts.length > 0 ? parts.join(', ') : 'Honduras';
  return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&t=&z=15&ie=UTF8&iwloc=&output=embed`;
}

/**
 * Builds the external Google Maps navigation/directions link for a StoreBranchLocation.
 */
export function buildBranchExternalMapsUrl(branch: StoreBranchLocation, fallbackStoreName?: string): string {
  const trimmedUrl = (branch.googleMapsUrl || '').trim();
  if (trimmedUrl && (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://'))) {
    return trimmedUrl;
  }

  if (
    typeof branch.latitude === 'number' &&
    typeof branch.longitude === 'number' &&
    !isNaN(branch.latitude) &&
    !isNaN(branch.longitude)
  ) {
    return `https://www.google.com/maps/search/?api=1&query=${branch.latitude},${branch.longitude}`;
  }

  const coordsFromUrl = extractCoordinatesFromText(trimmedUrl);
  if (coordsFromUrl) {
    return `https://www.google.com/maps/search/?api=1&query=${coordsFromUrl.lat},${coordsFromUrl.lng}`;
  }

  const parts = [branch.name || fallbackStoreName, branch.address, branch.city]
    .map((s) => (s || '').trim())
    .filter(Boolean);
  const query = parts.length > 0 ? parts.join(', ') : 'Honduras';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/**
 * Returns the effective list of store locations/branches for a store.
 * If the store has explicit `storeLocations`, returns those; otherwise, if `address` is set,
 * synthesizes a primary location so single-location stores work automatically.
 */
export function getEffectiveStoreLocations(settings: StoreSettings): StoreBranchLocation[] {
  if (Array.isArray(settings.storeLocations) && settings.storeLocations.length > 0) {
    return settings.storeLocations.filter(
      (loc) => Boolean((loc.name || '').trim() || (loc.address || '').trim() || (loc.googleMapsUrl || '').trim())
    );
  }

  if ((settings.address || '').trim()) {
    return [
      {
        id: 'main-store',
        name: settings.storeName || 'Tienda Principal',
        address: settings.address!.trim(),
        phone: settings.phone || settings.whatsappOrderPhone || '',
        isMain: true,
      },
    ];
  }

  return [];
}
