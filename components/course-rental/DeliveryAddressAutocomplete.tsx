'use client';

import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '@/lib/google-maps-loader';

interface DeliveryAddressAutocompleteProps {
  onSelect: (value: { address: string; lat: number; lng: number }) => void;
  onLoadError?: (message: string) => void;
  placeholder?: string;
}

export function DeliveryAddressAutocomplete({
  onSelect,
  onLoadError,
  placeholder = 'Hotel name, street address, district...',
}: DeliveryAddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onLoadErrorRef = useRef(onLoadError);
  onLoadErrorRef.current = onLoadError;

  const [confirmed, setConfirmed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadGoogleMaps()
      .then(maps => {
        if (cancelled || !inputRef.current) return;
        const autocomplete = new maps.places.Autocomplete(inputRef.current, {
          componentRestrictions: { country: 'th' },
          fields: ['geometry', 'formatted_address', 'name'],
        });
        autocomplete.addListener('place_changed', () => {
          if (cancelled) return;
          const place = autocomplete.getPlace();
          const address = place.formatted_address ?? place.name ?? inputRef.current?.value ?? '';
          const lat = place.geometry?.location?.lat() ?? 0;
          const lng = place.geometry?.location?.lng() ?? 0;
          setConfirmed(address);
          onSelectRef.current({ address, lat, lng });
        });
      })
      .catch(err => {
        if (!cancelled) onLoadErrorRef.current?.((err as Error).message);
      });

    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-green-500 focus:ring-1 focus:ring-green-500 text-gray-900 placeholder:text-gray-400 text-sm"
      />
      {confirmed && (
        <p className="mt-1 text-xs text-green-700">{confirmed}</p>
      )}
    </div>
  );
}
