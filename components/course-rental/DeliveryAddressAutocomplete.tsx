'use client';

import { useEffect, useRef, useState } from 'react';
import {
  loadGoogleMaps,
  type GoogleMap,
  type GoogleMarker,
  type GoogleMapsApi,
  type PlacesLibrary,
  type PlacePrediction,
} from '@/lib/google-maps-loader';

interface DeliveryAddressAutocompleteProps {
  onSelect: (value: { address: string; lat: number; lng: number }) => void;
  onLoadError?: (message: string) => void;
  placeholder?: string;
}

/**
 * Custom Google Places autocomplete built on the new Places Autocomplete Data
 * API (fetchAutocompleteSuggestions). We render the suggestion list ourselves
 * so it stays an inline dropdown on mobile — the PlaceAutocompleteElement web
 * component takes the whole screen on phones, which we don't want. On selection
 * it captures the formatted address + lat/lng and drops a read-only pin on a
 * confirmation map. If Google can't load, the parent falls back to a textarea.
 */
export function DeliveryAddressAutocomplete({
  onSelect,
  onLoadError,
  placeholder = 'Hotel name, street address, district...',
}: DeliveryAddressAutocompleteProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapElRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const markerRef = useRef<GoogleMarker | null>(null);

  const mapsApiRef = useRef<GoogleMapsApi | null>(null);
  const placesRef = useRef<PlacesLibrary | null>(null);
  const tokenRef = useRef<object | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onLoadErrorRef = useRef(onLoadError);
  onLoadErrorRef.current = onLoadError;

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlacePrediction[]>([]);
  const [open, setOpen] = useState(false);
  const [hasPin, setHasPin] = useState(false);

  // Load Maps + Places once.
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(async maps => {
        if (cancelled) return;
        mapsApiRef.current = maps;
        const places = await maps.importLibrary('places');
        if (cancelled) return;
        placesRef.current = places;
        tokenRef.current = new places.AutocompleteSessionToken();
      })
      .catch(err => {
        if (!cancelled) onLoadErrorRef.current?.((err as Error).message);
      });
    return () => { cancelled = true; };
  }, []);

  // Close the dropdown on outside click.
  useEffect(() => {
    function onDocPointer(e: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('touchstart', onDocPointer);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('touchstart', onDocPointer);
    };
  }, []);

  function handleInput(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const places = placesRef.current;
    if (!value.trim() || !places) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const { suggestions: results } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: value,
          sessionToken: tokenRef.current ?? undefined,
          includedRegionCodes: ['th'],
        });
        const preds = results
          .map(s => s.placePrediction)
          .filter((p): p is PlacePrediction => p != null);
        setSuggestions(preds);
        setOpen(preds.length > 0);
      } catch (err) {
        console.error('[DeliveryAddressAutocomplete] fetchAutocompleteSuggestions failed', err);
        setSuggestions([]);
        setOpen(false);
      }
    }, 250);
  }

  async function handlePick(pred: PlacePrediction) {
    setOpen(false);
    setSuggestions([]);
    try {
      const place = pred.toPlace();
      await place.fetchFields({ fields: ['location', 'formattedAddress', 'displayName'] });
      const loc = place.location;
      const name = place.displayName?.trim();
      const formatted = place.formattedAddress?.trim();
      // Combine place name (hotel/building) + full street address; skip the
      // prefix if the formatted address already leads with the name.
      const address =
        name && formatted && !formatted.toLowerCase().startsWith(name.toLowerCase())
          ? `${name}, ${formatted}`
          : formatted ?? name ?? pred.text.text;
      const lat = loc?.lat() ?? 0;
      const lng = loc?.lng() ?? 0;
      setQuery(address);
      onSelectRef.current({ address, lat, lng });
      // Start a fresh session token after a completed selection (billing best practice).
      if (placesRef.current) tokenRef.current = new placesRef.current.AutocompleteSessionToken();
      if (loc) await renderMap(lat, lng);
    } catch (err) {
      console.error('[DeliveryAddressAutocomplete] place details failed', err);
    }
  }

  async function renderMap(lat: number, lng: number) {
    const maps = mapsApiRef.current;
    if (!maps || !mapElRef.current) return;
    const [{ Map }, { Marker }] = await Promise.all([
      maps.importLibrary('maps'),
      maps.importLibrary('marker'),
    ]);
    if (!mapElRef.current) return;
    const center = { lat, lng };
    setHasPin(true);
    if (!mapRef.current) {
      mapRef.current = new Map(mapElRef.current, {
        center,
        zoom: 16,
        disableDefaultUI: true,
        zoomControl: true,
        clickableIcons: false,
        gestureHandling: 'cooperative',
      });
      // Read-only confirmation pin — shows where the selected address resolves.
      markerRef.current = new Marker({ position: center, map: mapRef.current });
    } else {
      mapRef.current.setCenter(center);
      markerRef.current?.setPosition(center);
    }
  }

  return (
    <div ref={containerRef} className="space-y-2">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={e => handleInput(e.target.value)}
          onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-green-500 focus:ring-1 focus:ring-green-500 text-gray-900 placeholder:text-gray-400 text-sm"
        />
        {open && suggestions.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full max-h-72 overflow-auto rounded-xl border border-gray-200 bg-white shadow-lg">
            {suggestions.map((s, i) => (
              <li key={s.placeId ?? i}>
                <button
                  type="button"
                  onClick={() => handlePick(s)}
                  className="flex w-full items-start gap-2 px-4 py-2.5 text-left hover:bg-gray-50"
                >
                  <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                  </svg>
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-gray-900">{s.mainText?.text ?? s.text.text}</span>
                    {s.secondaryText?.text && (
                      <span className="block truncate text-xs text-gray-500">{s.secondaryText.text}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div
        ref={mapElRef}
        className={`w-full h-48 rounded-xl overflow-hidden border border-gray-200 ${hasPin ? '' : 'hidden'}`}
      />
    </div>
  );
}
