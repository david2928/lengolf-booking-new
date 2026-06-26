# Course Rental UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three UX improvements to the course-rental booking funnel: (1) Google Places autocomplete for delivery address, (2) sticky running price summary visible from step 2 onwards, (3) prominent delivery fee callout wired into the price bar.

**Architecture:** All changes live in a single page component (`app/[locale]/course-rental/page.tsx`) plus supporting utilities. The autocomplete is a new client component copied/adapted from `lengolf-forms`. The price bar is a new component extracted from page state. DB gets two nullable float columns for lat/lng. The reserve API route is extended to accept and store them.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Google Maps JS API (PlaceAutocompleteElement web component), Supabase PostgreSQL.

**Note:** Contact pre-fill from auth is **already implemented** in page.tsx (lines 148–206) — it fetches `/api/vip/profile` and populates name/email/phone. No work needed there.

---

### Task 1: DB migration — add delivery_lat / delivery_lng to club_rentals

**Files:**
- Create: `supabase/migrations/20260627000001_club_rentals_delivery_coords.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add optional lat/lng columns to store Google Places-pinned coordinates
-- for delivery addresses. Nullable because pickup orders never set them,
-- and delivery orders placed before this migration don't have them.
alter table public.club_rentals
  add column if not exists delivery_lat  double precision,
  add column if not exists delivery_lng  double precision;
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Use the `apply_migration` MCP tool with project `bisimqmtxjsptehhqpeg` and the SQL above.

- [ ] **Step 3: Verify the columns exist**

Run via `execute_sql`:
```sql
select column_name, data_type
from information_schema.columns
where table_name = 'club_rentals'
  and column_name in ('delivery_lat', 'delivery_lng');
```
Expected: two rows — `delivery_lat double precision`, `delivery_lng double precision`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260627000001_club_rentals_delivery_coords.sql
git commit -m "feat(db): add delivery_lat/lng to club_rentals for Places autocomplete"
```

---

### Task 2: Copy Google Maps loader from forms

**Files:**
- Create: `lib/google-maps-loader.ts`

- [ ] **Step 1: Create the loader file**

```typescript
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
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/google-maps-loader.ts
git commit -m "feat(lib): add Google Maps JS API loader (adapted from lengolf-forms)"
```

---

### Task 3: Create DeliveryAddressAutocomplete component

**Files:**
- Create: `components/course-rental/DeliveryAddressAutocomplete.tsx`

This component renders Google's `PlaceAutocompleteElement` web component. On selection it returns `{ address, lat, lng }`. If the API fails to load it calls `onLoadError` and the parent falls back to a plain textarea.

- [ ] **Step 1: Create the component**

```typescript
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

        element.addEventListener('gmp-select', handler);
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
        <p className="mt-1 text-xs text-green-700 flex items-center gap-1">
          <span aria-hidden>📍</span>
          <span>{pinned}</span>
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/course-rental/DeliveryAddressAutocomplete.tsx
git commit -m "feat(components): add DeliveryAddressAutocomplete with Places web-component API"
```

---

### Task 4: Update ClubReserveRequest type and reserve route

**Files:**
- Modify: `types/golf-club-rental.ts` (around line 235)
- Modify: `app/api/clubs/reserve/route.ts`

- [ ] **Step 1: Add lat/lng to ClubReserveRequest**

In `types/golf-club-rental.ts`, find the `ClubReserveRequest` interface and add two optional fields after `delivery_address`:

```typescript
  delivery_address?: string;
  delivery_lat?: number;   // Google Places lat — stored for dispatch
  delivery_lng?: number;   // Google Places lng — stored for dispatch
```

- [ ] **Step 2: Destructure lat/lng in reserve route**

In `app/api/clubs/reserve/route.ts`, find the destructuring block (around line 39) and add:

```typescript
      delivery_address,
      delivery_lat,
      delivery_lng,
```

- [ ] **Step 3: Store lat/lng in the insert**

In the same file, find the `.insert({...})` call (around line 270) and add after `delivery_address`:

```typescript
        delivery_address: delivery_address || null,
        delivery_lat: delivery_lat ?? null,
        delivery_lng: delivery_lng ?? null,
```

- [ ] **Step 4: Verify typecheck**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add types/golf-club-rental.ts app/api/clubs/reserve/route.ts
git commit -m "feat(api): accept and store delivery_lat/lng from Places autocomplete"
```

---

### Task 5: Create RentalPriceSummaryBar component

**Files:**
- Create: `components/course-rental/RentalPriceSummaryBar.tsx`

This sticky bar appears at the bottom of the viewport on steps 2–5. It shows the selected set name, duration, rental subtotal, delivery fee (if delivery is requested), add-ons total, and the running grand total. On the review step it collapses to just the total since the full breakdown is already on screen.

- [ ] **Step 1: Create the component**

```typescript
'use client';

import { useFormatter } from 'next-intl';
import type { RentalClubSetWithAvailability } from '@/types/golf-club-rental';
import { getCoursePriceBreakdown } from '@/types/golf-club-rental';

interface RentalPriceSummaryBarProps {
  selectedSet: RentalClubSetWithAvailability | null;
  durationDays: number;
  deliveryRequested: boolean;
  addOnsTotal: number;
  /** 'set' | 'delivery' | 'contact' | 'review' */
  currentStep: string;
}

export function RentalPriceSummaryBar({
  selectedSet,
  durationDays,
  deliveryRequested,
  addOnsTotal,
  currentStep,
}: RentalPriceSummaryBarProps) {
  const format = useFormatter();

  if (!selectedSet || durationDays <= 0) return null;

  const breakdown = getCoursePriceBreakdown(selectedSet, durationDays);
  const deliveryFee = deliveryRequested ? 500 : 0;
  const total = breakdown.total + deliveryFee + addOnsTotal;

  // On review step the full breakdown is visible — show only total to avoid repetition.
  const isReview = currentStep === 'review';

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-[0_-2px_8px_rgba(0,0,0,0.08)]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3">
        {isReview ? (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Total</span>
            <span className="text-lg font-bold text-green-700">฿{format.number(total)}</span>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-gray-500 truncate">
                {selectedSet.name} · {durationDays}d
                {breakdown.savings > 0 && (
                  <span className="ml-1 text-green-600">
                    (save ฿{format.number(breakdown.savings)})
                  </span>
                )}
              </p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-xs text-gray-400">฿{format.number(breakdown.total)} rental</span>
                {deliveryRequested && (
                  <span className="text-xs text-amber-600">+ ฿500 delivery</span>
                )}
                {addOnsTotal > 0 && (
                  <span className="text-xs text-gray-400">+ ฿{format.number(addOnsTotal)} add-ons</span>
                )}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Total</p>
              <p className="text-lg font-bold text-green-700">฿{format.number(total)}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/course-rental/RentalPriceSummaryBar.tsx
git commit -m "feat(components): add sticky RentalPriceSummaryBar for steps 2-5"
```

---

### Task 6: Wire everything into page.tsx

**Files:**
- Modify: `app/[locale]/course-rental/page.tsx`

This is the main wiring task. Changes:
1. Add `deliveryLat`, `deliveryLng` state and `addressFallback` state
2. Import and render `DeliveryAddressAutocomplete` (with textarea fallback)
3. Pass lat/lng in `handleSubmit`
4. Import and render `RentalPriceSummaryBar` on steps 2–5
5. Add bottom padding to the page so the sticky bar doesn't overlap content
6. Add `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` note to `.env.local`

- [ ] **Step 1: Add new state variables**

Near the existing state declarations (around line 84), add:

```typescript
  const [deliveryLat, setDeliveryLat] = useState<number | null>(null);
  const [deliveryLng, setDeliveryLng] = useState<number | null>(null);
  const [addressFallback, setAddressFallback] = useState(false);
```

- [ ] **Step 2: Add imports at the top of the file**

```typescript
import { DeliveryAddressAutocomplete } from '@/components/course-rental/DeliveryAddressAutocomplete';
import { RentalPriceSummaryBar } from '@/components/course-rental/RentalPriceSummaryBar';
```

- [ ] **Step 3: Replace delivery address textarea with autocomplete + fallback**

Find the `{deliveryRequested && (` block (around line 740). Replace the inner `<div>` that contains the `<textarea>`:

```tsx
{deliveryRequested && (
  <div className="space-y-4">
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {t('delivery.addressLabel')} <span className="text-red-500">*</span>
      </label>
      {addressFallback ? (
        <textarea
          value={deliveryAddress}
          onChange={e => setDeliveryAddress(e.target.value)}
          placeholder={t('delivery.addressPlaceholder')}
          rows={3}
          className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-green-500 focus:ring-1 focus:ring-green-500 text-gray-900 placeholder:text-gray-400"
        />
      ) : (
        <DeliveryAddressAutocomplete
          onSelect={({ address, lat, lng }) => {
            setDeliveryAddress(address);
            setDeliveryLat(lat);
            setDeliveryLng(lng);
          }}
          onLoadError={() => setAddressFallback(true)}
        />
      )}
    </div>
  </div>
)}
```

- [ ] **Step 4: Pass lat/lng in handleSubmit**

In `handleSubmit` (around line 237), find `delivery_address: deliveryRequested ? deliveryAddress : undefined` and add the two new fields directly after:

```typescript
          delivery_address: deliveryRequested ? deliveryAddress : undefined,
          delivery_lat: deliveryRequested && deliveryLat != null ? deliveryLat : undefined,
          delivery_lng: deliveryRequested && deliveryLng != null ? deliveryLng : undefined,
```

- [ ] **Step 5: Clear lat/lng when user switches back to pickup**

In the delivery card's `onClick` (around line 725, the `setDeliveryRequested(false)` button):

```typescript
onClick={() => {
  setDeliveryRequested(false);
  setDeliveryAddress('');
  setDeliveryLat(null);
  setDeliveryLng(null);
}}
```

- [ ] **Step 6: Add RentalPriceSummaryBar and bottom padding**

At the very bottom of the returned JSX, just before the closing `</Layout>` tag, add:

```tsx
      {/* Sticky price bar — only show from step 2 onwards */}
      {step !== 'dates' && step !== 'confirmation' && (
        <RentalPriceSummaryBar
          selectedSet={selectedSet}
          durationDays={durationDays}
          deliveryRequested={deliveryRequested}
          addOnsTotal={addOnsTotal}
          currentStep={step}
        />
      )}
```

Also wrap the outer `<div className="max-w-3xl mx-auto px-4 sm:px-6">` with an extra bottom padding class so the sticky bar doesn't overlap the Continue button:

Change:
```tsx
<div className="max-w-3xl mx-auto px-4 sm:px-6">
```
To:
```tsx
<div className="max-w-3xl mx-auto px-4 sm:px-6 pb-24">
```

- [ ] **Step 7: Verify typecheck and lint**

```bash
npm run typecheck && npm run lint
```
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add app/[locale]/course-rental/page.tsx
git commit -m "feat(course-rental): add Places autocomplete for delivery + sticky price bar"
```

---

### Task 7: Add env var and verify end-to-end

**Files:**
- Modify: `.env.local` (local only — never committed)
- Modify: `CLAUDE.md` (already lists required env vars — add new entry)

- [ ] **Step 1: Add the key to .env.local**

Append to `.env.local`:
```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=<value from Google Cloud Console — same key already used in lengolf-forms>
```

The key lives in the Google Cloud Console under the `lengolf-booking-system-436804` project, APIs & Services → Credentials. The existing key used in `lengolf-forms` works if its HTTP referrer restrictions include `booking.len.golf/*` and `localhost:3000/*`. Add those restrictions if not already present.

Also add to Vercel project env vars (Production + Preview + Development) via the Vercel dashboard — do NOT use `vercel env add` from PowerShell (pipe semantics corrupt the value, per CLAUDE.md).

- [ ] **Step 2: Update CLAUDE.md env var table**

In the project `CLAUDE.md`, add to the environment variables block:

```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=  # Browser-restricted Maps JS API key; enables Places autocomplete on delivery address
```

- [ ] **Step 3: Run dev server and manually test**

```bash
npm run dev
```

Open `http://localhost:3000/course-rental` (or `/en/course-rental`).

- Select dates and times → click Continue
- Select a club set → verify RentalPriceSummaryBar appears at bottom showing set name + price
- Toggle Delivery → verify bar updates to show +฿500
- Verify the address field shows the Google Places autocomplete (not a textarea)
- Search for a Bangkok address → verify it pins with the 📍 label
- Select add-ons → verify bar updates
- Proceed to contact → verify bar still visible
- Proceed to review → verify bar shows compact "Total ฿X,XXX" only
- Test fallback: temporarily break the API key → verify textarea appears instead

- [ ] **Step 4: Run full build**

```bash
npm run build
```
Expected: no TypeScript errors, no MISSING_MESSAGE warnings.

- [ ] **Step 5: Commit CLAUDE.md change**

```bash
git add CLAUDE.md
git commit -m "docs: add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to env var table"
```

---

## Completion checklist

- [ ] `supabase/migrations/20260627000001_club_rentals_delivery_coords.sql` applied and verified
- [ ] `lib/google-maps-loader.ts` created
- [ ] `components/course-rental/DeliveryAddressAutocomplete.tsx` created with fallback
- [ ] `components/course-rental/RentalPriceSummaryBar.tsx` created
- [ ] `types/golf-club-rental.ts` updated with `delivery_lat` / `delivery_lng`
- [ ] `app/api/clubs/reserve/route.ts` stores lat/lng
- [ ] `app/[locale]/course-rental/page.tsx` wired (autocomplete + price bar + lat/lng passthrough)
- [ ] `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` set in `.env.local` and Vercel (Production + Preview + Development)
- [ ] `npm run build` passes clean
- [ ] Manual smoke test: autocomplete pins an address, price bar tracks all steps, fallback textarea works
