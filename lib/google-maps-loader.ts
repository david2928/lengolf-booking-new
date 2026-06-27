/**
 * Loads the Google Maps JavaScript API (with Places library) once, on demand.
 * Uses the classic places library so we can attach Autocomplete to a regular
 * <input> — full style control + reliable place_changed event.
 * Key: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (HTTP-referrer-restricted in GCP Console).
 */

export interface GoogleLatLng {
  lat(): number;
  lng(): number;
}

export interface ClassicPlace {
  geometry?: { location?: GoogleLatLng } | null;
  formatted_address?: string;
  name?: string;
}

export interface ClassicAutocomplete {
  getPlace(): ClassicPlace;
  addListener(event: 'place_changed', handler: () => void): void;
}

export interface ClassicPlacesLib {
  Autocomplete: new (
    input: HTMLInputElement,
    opts?: {
      componentRestrictions?: { country: string | string[] };
      fields?: string[];
      types?: string[];
    }
  ) => ClassicAutocomplete;
}

interface MapsApi {
  places: ClassicPlacesLib;
}

declare global {
  interface Window {
    google?: { maps?: MapsApi };
  }
}

let loadPromise: Promise<MapsApi> | null = null;

export function loadGoogleMaps(): Promise<MapsApi> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps can only load in the browser'));
  }
  if (window.google?.maps?.places) return Promise.resolve(window.google.maps as MapsApi);
  if (loadPromise) return loadPromise;

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return Promise.reject(new Error('Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY'));

  loadPromise = new Promise<MapsApi>((resolve, reject) => {
    const CALLBACK = '__lengolfGmapsReady';
    const w = window as unknown as Record<string, unknown>;
    const cleanup = () => { delete w[CALLBACK]; };
    const fail = (err: Error) => {
      cleanup();
      loadPromise = null;
      reject(err);
    };
    w[CALLBACK] = () => {
      cleanup();
      if (window.google?.maps?.places) resolve(window.google.maps as MapsApi);
      else fail(new Error('Google Maps loaded but places library is missing'));
    };
    const script = document.createElement('script');
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}` +
      `&libraries=places&v=weekly&loading=async&callback=${CALLBACK}`;
    script.async = true;
    script.onerror = () => fail(new Error('Failed to load the Google Maps script'));
    document.head.appendChild(script);
  });
  return loadPromise;
}
