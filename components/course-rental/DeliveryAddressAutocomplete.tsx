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
  const elementRef = useRef<HTMLElement | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onLoadErrorRef = useRef(onLoadError);
  onLoadErrorRef.current = onLoadError;

  const [pinned, setPinned] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadGoogleMaps()
      .then(async maps => {
        if (cancelled || !containerRef.current) return;
        const { PlaceAutocompleteElement } = await maps.importLibrary('places');
        if (cancelled || !containerRef.current) return;

        const element = new PlaceAutocompleteElement({ includedRegionCodes: ['th'] });
        element.style.width = '100%';
        elementRef.current = element;

        const handler = async (e: Event) => {
          // Google fires gmp-placeselect with place on the event directly,
          // but some versions put it under event.detail — handle both.
          const ev = e as PlaceSelectEvent;
          const detail = (e as CustomEvent).detail as PlaceSelectEvent | undefined;
          const rawPlace =
            ev.placePrediction?.toPlace() ??
            ev.place ??
            detail?.placePrediction?.toPlace() ??
            detail?.place;

          // Fallback: at minimum capture the text the user selected
          const inputText = (element as HTMLInputElement).value ?? '';

          if (!rawPlace) {
            // No place object — use visible text so button at least unblocks
            if (inputText) {
              setPinned(inputText);
              onSelectRef.current({ address: inputText, lat: 0, lng: 0 });
            }
            return;
          }

          try {
            await rawPlace.fetchFields({ fields: ['location', 'formattedAddress', 'displayName'] });
            const loc = rawPlace.location;
            const address = rawPlace.formattedAddress ?? rawPlace.displayName ?? inputText;
            setPinned(address);
            onSelectRef.current({ address, lat: loc ? loc.lat() : 0, lng: loc ? loc.lng() : 0 });
          } catch (err) {
            // fetchFields failed — still unblock the user with the visible text
            console.error('[DeliveryAddressAutocomplete] fetchFields failed', err);
            const address = inputText;
            if (address) {
              setPinned(address);
              onSelectRef.current({ address, lat: 0, lng: 0 });
            }
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
      const el = elementRef.current;
      if (el?.parentNode) el.parentNode.removeChild(el);
      elementRef.current = null;
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
