/**
 * Loads the Google Maps JavaScript API once, on demand, in the browser.
 * Uses the modern importLibrary() bootstrap so we can pull the new Places
 * web component (`PlaceAutocompleteElement`) AND the maps/marker libraries
 * for the delivery confirmation map.
 * Mirrors lengolf-forms (src/lib/google-maps-loader.ts).
 * Key: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (HTTP-referrer-restricted in GCP Console).
 */

export interface GoogleLatLng {
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

/**
 * The current API fires `gmp-select` with `placePrediction`; older builds fired
 * `gmp-placeselect` with `place`. We read both defensively.
 */
export interface PlaceSelectEvent extends Event {
  placePrediction?: PlacePrediction;
  place?: GooglePlace;
}

export interface PlacesLibrary {
  PlaceAutocompleteElement: new (opts?: Record<string, unknown>) => HTMLElement;
}

// ─── Maps + marker (delivery confirmation map) ───────────────────────────────

export interface GoogleMap {
  setCenter(latLng: { lat: number; lng: number }): void;
  setZoom(zoom: number): void;
}

export interface GoogleMarker {
  setPosition(latLng: { lat: number; lng: number }): void;
  setMap(map: GoogleMap | null): void;
  getPosition(): GoogleLatLng | null;
  addListener(event: string, handler: () => void): void;
}

export interface MapsLibrary {
  Map: new (el: HTMLElement, opts?: Record<string, unknown>) => GoogleMap;
}

export interface MarkerLibrary {
  Marker: new (opts?: Record<string, unknown>) => GoogleMarker;
}

export interface GoogleMapsApi {
  importLibrary(name: 'places'): Promise<PlacesLibrary>;
  importLibrary(name: 'maps'): Promise<MapsLibrary>;
  importLibrary(name: 'marker'): Promise<MarkerLibrary>;
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
    const w = window as unknown as Record<string, unknown>;
    const cleanup = () => { delete w[CALLBACK]; };
    // Reset on ANY failure so a later call can retry, and drop the failed tag so
    // the retry isn't shadowed by a stale <script> bound to the same callback.
    const fail = (err: Error) => {
      cleanup();
      loadPromise = null;
      script.remove();
      reject(err);
    };
    w[CALLBACK] = () => {
      cleanup();
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
