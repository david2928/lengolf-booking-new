'use client';

import { useEffect, useRef, useState } from 'react';
import {
  loadGoogleMaps,
  type PlaceSelectEvent,
  type GoogleMap,
  type GoogleMarker,
  type GoogleMapsApi,
} from '@/lib/google-maps-loader';

interface DeliveryAddressAutocompleteProps {
  onSelect: (value: { address: string; lat: number; lng: number }) => void;
  onLoadError?: (message: string) => void;
}

/**
 * Google Places autocomplete (new PlaceAutocompleteElement web component, same
 * as lengolf-forms) for a course-rental delivery address. On selection it
 * captures the formatted address + lat/lng and drops a draggable pin on a
 * confirmation map so the customer can fine-tune the exact drop point. If
 * Google can't load, the parent falls back to a plain textarea.
 */
export function DeliveryAddressAutocomplete({
  onSelect,
  onLoadError,
}: DeliveryAddressAutocompleteProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapElRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const markerRef = useRef<GoogleMarker | null>(null);

  // Keep latest callbacks + selected address in refs so the load effect runs
  // once and the marker-drag handler always sees current values.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onLoadErrorRef = useRef(onLoadError);
  onLoadErrorRef.current = onLoadError;
  const addressRef = useRef<string>('');

  const [pinned, setPinned] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let element: HTMLElement | null = null;

    async function renderMap(maps: GoogleMapsApi, lat: number, lng: number) {
      const [{ Map }, { Marker }] = await Promise.all([
        maps.importLibrary('maps'),
        maps.importLibrary('marker'),
      ]);
      if (cancelled || !mapElRef.current) return;
      const center = { lat, lng };
      if (!mapRef.current) {
        mapRef.current = new Map(mapElRef.current, {
          center,
          zoom: 16,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          gestureHandling: 'cooperative',
        });
        markerRef.current = new Marker({
          position: center,
          map: mapRef.current,
          draggable: true,
        });
        markerRef.current.addListener('dragend', () => {
          const pos = markerRef.current?.getPosition();
          if (pos) {
            onSelectRef.current({ address: addressRef.current, lat: pos.lat(), lng: pos.lng() });
          }
        });
      } else {
        mapRef.current.setCenter(center);
        markerRef.current?.setPosition(center);
      }
    }

    loadGoogleMaps()
      .then(async maps => {
        if (cancelled || !hostRef.current) return;
        const { PlaceAutocompleteElement } = await maps.importLibrary('places');
        if (cancelled || !hostRef.current) return;

        element = new PlaceAutocompleteElement({ includedRegionCodes: ['th'] });
        element.style.width = '100%';

        const handler = async (e: Event) => {
          const ev = e as PlaceSelectEvent;
          try {
            const place = ev.placePrediction ? ev.placePrediction.toPlace() : ev.place;
            if (!place) return;
            await place.fetchFields({ fields: ['location', 'formattedAddress', 'displayName'] });
            const loc = place.location;
            if (!loc) return;
            const name = place.displayName?.trim();
            const formatted = place.formattedAddress?.trim();
            // Combine place name (hotel/building) + full street address; skip the
            // prefix if the formatted address already leads with the name.
            const address =
              name && formatted && !formatted.toLowerCase().startsWith(name.toLowerCase())
                ? `${name}, ${formatted}`
                : formatted ?? name ?? '';
            const lat = loc.lat();
            const lng = loc.lng();
            addressRef.current = address;
            setPinned(address);
            onSelectRef.current({ address, lat, lng });
            await renderMap(maps, lat, lng);
          } catch (err) {
            console.error('[DeliveryAddressAutocomplete] fetchFields failed', err);
          }
        };

        // `gmp-select` is the current event; `gmp-placeselect` covers older builds.
        element.addEventListener('gmp-select', handler);
        element.addEventListener('gmp-placeselect', handler);
        hostRef.current.appendChild(element);
      })
      .catch(err => {
        if (!cancelled) onLoadErrorRef.current?.((err as Error).message);
      });

    return () => {
      cancelled = true;
      if (element?.parentNode) element.parentNode.removeChild(element);
    };
  }, []);

  return (
    <div className="space-y-2">
      <div ref={hostRef} className="gmp-autocomplete-host" />
      <div
        ref={mapElRef}
        className={`w-full h-48 rounded-xl overflow-hidden border border-gray-200 ${pinned ? '' : 'hidden'}`}
      />
      {pinned && (
        <p className="text-xs text-green-700 flex items-start gap-1">
          <span aria-hidden>📍</span>
          <span>{pinned}</span>
        </p>
      )}
      {pinned && (
        <p className="text-[11px] text-gray-400">Drag the pin to adjust the exact drop-off point.</p>
      )}
    </div>
  );
}
