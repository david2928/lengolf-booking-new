/**
 * Loads the Google Maps JavaScript API once, on demand, in the browser.
 * Copied from lengolf-forms (src/lib/google-maps-loader.ts).
 * Deliberately avoids @types/google.maps — uses minimal shimmed interfaces.
 * Key: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (HTTP-referrer-restricted in Cloud Console).
 */

interface GoogleLatLng {
  lat(): number;
  lng(): number;
}

export interface GooglePlace {
  location?: GoogleLatLng | null;
  formattedAddress?: string | null;
  displayName?: string | null;
  fetchFields(req: { fields: string[] }): Promise<unknown>;
}

export interface PlacePrediction {
  toPlace(): GooglePlace;
}

export interface PlaceSelectEvent extends Event {
  placePrediction?: PlacePrediction;
  place?: GooglePlace;
}

export interface PlacesLibrary {
  PlaceAutocompleteElement: new (opts?: Record<string, unknown>) => HTMLElement;
}

interface GoogleMapsApi {
  importLibrary(name: 'places'): Promise<PlacesLibrary>;
}

declare global {
  interface Window {
    google?: { maps?: GoogleMapsApi };
  }
}

let loadPromise: Promise<GoogleMapsApi> | null = null;

export function loadGoogleMaps(): Promise<GoogleMapsApi> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps can only load in the browser'));
  }
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (loadPromise) return loadPromise;

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return Promise.reject(new Error('Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY'));

  loadPromise = new Promise<GoogleMapsApi>((resolve, reject) => {
    const CALLBACK = '__lengolfGmapsReady';
    const script = document.createElement('script');
    const fail = (err: Error) => {
      loadPromise = null;
      script.remove();
      reject(err);
    };
    (window as unknown as Record<string, unknown>)[CALLBACK] = () => {
      if (window.google?.maps) resolve(window.google.maps);
      else fail(new Error('Google Maps loaded but window.google.maps is missing'));
    };
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}` +
      `&v=weekly&loading=async&callback=${CALLBACK}`;
    script.async = true;
    script.onerror = () => fail(new Error('Failed to load the Google Maps script'));
    document.head.appendChild(script);
  });
  return loadPromise;
}
