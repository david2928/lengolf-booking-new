'use client';

import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps, type PlaceSelectEvent } from '@/lib/google-maps-loader';

interface DeliveryAddressAutocompleteProps {
  onSelect: (value: { address: string; lat: number; lng: number }) => void;
  onLoadError?: (message: string) => void;
}

export function DeliveryAddressAutocomplete({
  onSelect,
  onLoadError,
}: DeliveryAddressAutocompleteProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onLoadErrorRef = useRef(onLoadError);
  onLoadErrorRef.current = onLoadError;

  const [pinned, setPinned] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let element: HTMLElement | null = null;

    loadGoogleMaps()
      .then(async maps => {
        if (cancelled || !containerRef.current) return;
        const { PlaceAutocompleteElement } = await maps.importLibrary('places');
        if (cancelled || !containerRef.current) return;

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
            const address = place.formattedAddress ?? place.displayName ?? '';
            setPinned(address);
            onSelectRef.current({ address, lat: loc.lat(), lng: loc.lng() });
          } catch (err) {
            console.debug('[DeliveryAddressAutocomplete] fetchFields failed', err);
          }
        };

        element.addEventListener('gmp-placeselect', handler);
        containerRef.current.appendChild(element);
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
    <div>
      <div ref={containerRef} className="gmp-autocomplete-host" />
      {pinned && (
        <p className="mt-1 text-xs text-green-700">
          {pinned}
        </p>
      )}
    </div>
  );
}
