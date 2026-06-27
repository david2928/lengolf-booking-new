'use client';

import { useEffect, useRef } from 'react';
import { loadGoogleMaps } from '@/lib/google-maps-loader';

interface DeliveryAddressAutocompleteProps {
  onSelect: (value: { address: string; lat: number; lng: number }) => void;
  onLoadError?: (message: string) => void;
  placeholder?: string;
  /** Pre-fills the input on mount (e.g. when restoring a saved flow). */
  initialValue?: string;
}

export function DeliveryAddressAutocomplete({
  onSelect,
  onLoadError,
  placeholder = 'Hotel name, street address, district...',
  initialValue = '',
}: DeliveryAddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onLoadErrorRef = useRef(onLoadError);
  onLoadErrorRef.current = onLoadError;

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
          const name = place.name?.trim();
          const formatted = place.formatted_address?.trim();
          // Combine the place name (hotel/building) with the full street address
          // so a delivery driver gets both — e.g. "The Lofts Asoke, 243 Sukhumvit
          // 21 Rd, ...". Skip the prefix if the formatted address already leads
          // with the name (avoids "243 Sukhumvit, 243 Sukhumvit ...").
          const address =
            name && formatted && !formatted.toLowerCase().startsWith(name.toLowerCase())
              ? `${name}, ${formatted}`
              : formatted ?? name ?? inputRef.current?.value ?? '';
          const lat = place.geometry?.location?.lat() ?? 0;
          const lng = place.geometry?.location?.lng() ?? 0;
          // Write the combined address back into the input so what the user sees
          // matches exactly what we store — no separate echo line.
          if (inputRef.current) inputRef.current.value = address;
          onSelectRef.current({ address, lat, lng });
        });
      })
      .catch(err => {
        if (!cancelled) onLoadErrorRef.current?.((err as Error).message);
      });

    return () => { cancelled = true; };
  }, []);

  return (
    <input
      ref={inputRef}
      type="text"
      defaultValue={initialValue}
      placeholder={placeholder}
      className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-green-500 focus:ring-1 focus:ring-green-500 text-gray-900 placeholder:text-gray-400 text-sm"
    />
  );
}
