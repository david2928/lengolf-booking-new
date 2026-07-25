# Bay Booking Flow: Slices 1 to 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add funnel telemetry to the bay-booking flow, give it a sticky summary bar with jump-to-error validation ported from course rental, and let customers book half-hour durations from 1 h to 3 h (plus 4 h and 5 h for package holders).

**Architecture:** Three independent slices, each its own commit and each shippable alone. Slice 1 is invisible (data layer events only). Slice 2 extracts the course-rental sticky bar into a shared component and replaces the disabled-submit dead end with scroll-to-first-invalid-field. Slice 3 replaces the integer duration loop in the Postgres availability function with a 30-minute step and an explicit allowed-duration ladder, then rebuilds the duration picker from that ladder.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase Postgres (RPC via `createServerClient`), next-intl v3, Jest + jsdom, Tailwind.

**Owner decisions this plan encodes (25 Jul 2026):**
- Duration ladder is `1, 1.5, 2, 2.5, 3` for everyone; `4, 5` only when `hasActivePackage` is true; `3.5` and `4.5` dropped; minimum stays 1 hour.
- Same-day lead time rounds to the next half hour instead of the next full hour.
- No behavioural change to promotions in these slices. Do **not** add a second `auto_apply` promotion here, because `lib/cost-calculator.ts:483` double-applies two `bogo` rows. That is a later slice.

---

## File Structure

**Slice 1, telemetry**
- Create `lib/booking-telemetry.ts` — the single place that knows bay-booking event names and payload shape. Keeps GTM string literals out of the components.
- Create `__tests__/booking-telemetry.test.ts`
- Modify `app/[locale]/(features)/bookings/hooks/useBookingFlow.ts` — fire a step event when `currentStep` changes.

**Slice 2, sticky bar + jump-to-error**
- Create `components/shared/BookingSummaryBar.tsx` — generalised from `components/course-rental/RentalPriceSummaryBar.tsx`. Owns no pricing logic; renders a total, a subline and one always-tappable CTA.
- Create `__tests__/booking-summary-bar.test.tsx`
- Modify `app/[locale]/(features)/bookings/components/booking/steps/BookingDetails.tsx` — add `firstInvalidField()` + `handlePrimaryCta()`, mount the bar, remove the disabled-submit branch.
- Modify `components/course-rental/RentalPriceSummaryBar.tsx` — becomes a thin wrapper over the shared bar so course rental keeps working and there is one implementation.
- Modify `messages/en.json`, `messages/th.json`, `messages/ko.json`, `messages/ja.json`, `messages/zh.json` — new keys under `bookings.detailsStep`.

**Slice 3, half-hour durations**
- Create `supabase/migrations/20260725120000_available_slots_v3_half_hour_durations.sql` — `get_available_slots_with_max_hours_v3`.
- Create `lib/booking-durations.ts` — the allowed-duration ladder, shared by the picker and any future caller. Single source of truth so the SQL ladder and the UI ladder cannot drift.
- Create `__tests__/booking-durations.test.ts`
- Modify `app/api/availability/route.ts` — call `_v3`.
- Modify `app/[locale]/(features)/bookings/hooks/useAvailability.ts` — `maxHours` becomes fractional.
- Modify `app/[locale]/(features)/bookings/components/booking/steps/BookingDetails.tsx:996-1016` — build the grid from the ladder.

---

## Slice 1: Funnel Telemetry

### Task 1: Booking telemetry module

**Files:**
- Create: `lib/booking-telemetry.ts`
- Test: `__tests__/booking-telemetry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/booking-telemetry.test.ts`:

```typescript
/**
 * Bay-booking funnel telemetry. Mirrors the course-rental events
 * (course_rental_step_viewed) so both flows can be compared in GA4.
 */
import { BAY_BOOKING_STEPS, pushBayBookingStepViewed } from '@/lib/booking-telemetry';

describe('BAY_BOOKING_STEPS', () => {
  test('is the three-step spine in order', () => {
    expect(BAY_BOOKING_STEPS).toEqual(['date', 'time', 'details']);
  });
});

describe('pushBayBookingStepViewed', () => {
  beforeEach(() => {
    window.dataLayer = [];
  });

  test('pushes step name, zero-based index and total', () => {
    pushBayBookingStepViewed(2);

    expect(window.dataLayer).toHaveLength(1);
    expect(window.dataLayer[0]).toEqual({
      event: 'bay_booking_step_viewed',
      step: 'time',
      step_index: 1,
      total_steps: 3,
    });
  });

  test('maps step 1 to date and step 3 to details', () => {
    pushBayBookingStepViewed(1);
    pushBayBookingStepViewed(3);

    expect(window.dataLayer[0].step).toBe('date');
    expect(window.dataLayer[0].step_index).toBe(0);
    expect(window.dataLayer[1].step).toBe('details');
    expect(window.dataLayer[1].step_index).toBe(2);
  });

  test('ignores an out-of-range step rather than pushing a bad event', () => {
    pushBayBookingStepViewed(0);
    pushBayBookingStepViewed(4);

    expect(window.dataLayer).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/booking-telemetry.test.ts`
Expected: FAIL, `Cannot find module '@/lib/booking-telemetry'`

- [ ] **Step 3: Write minimal implementation**

Create `lib/booking-telemetry.ts`:

```typescript
/**
 * Bay-booking funnel telemetry.
 *
 * Deliberately mirrors the course-rental event shape in
 * app/[locale]/course-rental/page.tsx (course_rental_step_viewed with
 * step / step_index / total_steps) so the two funnels are comparable in
 * GA4 without a second set of custom dimensions. The `step` and
 * `step_index` dimensions were registered on 2026-06-21.
 */
import { pushEventToGtm } from '@/utils/gtm';

/** The three-step spine, in order. `currentStep` in useBookingFlow is 1-based. */
export const BAY_BOOKING_STEPS = ['date', 'time', 'details'] as const;

export type BayBookingStep = (typeof BAY_BOOKING_STEPS)[number];

/**
 * Fire a step-viewed event. `currentStep` is the 1-based step number used by
 * useBookingFlow; out-of-range values are ignored so a bad state cannot emit a
 * junk event that pollutes the funnel.
 */
export function pushBayBookingStepViewed(currentStep: number): void {
  const index = currentStep - 1;
  const step = BAY_BOOKING_STEPS[index];
  if (!step) return;

  pushEventToGtm('bay_booking_step_viewed', {
    step,
    step_index: index,
    total_steps: BAY_BOOKING_STEPS.length,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/booking-telemetry.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add lib/booking-telemetry.ts __tests__/booking-telemetry.test.ts
git commit -m "feat(bookings): add bay-booking funnel telemetry module"
```

### Task 2: Fire the step event from the flow hook

**Files:**
- Modify: `app/[locale]/(features)/bookings/hooks/useBookingFlow.ts:1-8` (imports) and after line 71 (new effect)

- [ ] **Step 1: Add the import**

In `app/[locale]/(features)/bookings/hooks/useBookingFlow.ts`, add after the `useFlowPersistence` import on line 8:

```typescript
import { pushBayBookingStepViewed } from '@/lib/booking-telemetry';
```

- [ ] **Step 2: Add the effect**

Insert immediately after the `useFlowPersistence(...)` call that ends on line 71, before the `useEffect` that starts on line 73:

```typescript
  // Fire one funnel event per step entry. Keyed on currentStep alone so a
  // restore from persistence or a deep-link jump to step 2 also reports, which
  // is what makes the funnel counts match reality rather than only counting
  // people who walked the steps in order.
  useEffect(() => {
    pushBayBookingStepViewed(currentStep);
  }, [currentStep]);
```

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors. `next lint` may print pre-existing warnings from other files; there must be no new ones for `useBookingFlow.ts` or `lib/booking-telemetry.ts`.

- [ ] **Step 4: Verify in the browser**

Run `npm run dev`, open `http://localhost:3000/bookings`, open DevTools console and run:

```javascript
window.dataLayer.filter(e => e.event === 'bay_booking_step_viewed')
```

Expected: one entry with `step: 'date'`. Pick a date, re-run: a second entry with `step: 'time'`. Pick a time, re-run: a third with `step: 'details'`. Press the back arrow, re-run: a fourth with `step: 'time'` (re-entry is intentional and matches course rental).

- [ ] **Step 5: Commit**

```bash
git add "app/[locale]/(features)/bookings/hooks/useBookingFlow.ts"
git commit -m "feat(bookings): emit bay_booking_step_viewed on step entry"
```

---

## Slice 2: Sticky Summary Bar and Jump-to-Error

### Task 3: Shared BookingSummaryBar component

**Files:**
- Create: `components/shared/BookingSummaryBar.tsx`
- Test: `__tests__/booking-summary-bar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/booking-summary-bar.test.tsx`:

```tsx
/**
 * Shared sticky action bar. The contract that matters: the CTA is NEVER
 * disabled for validation reasons, because the caller validates on tap and
 * scrolls to the offending field. It is only disabled while a submit is in
 * flight. A greyed-out button with no explanation was the exact dead end this
 * component exists to remove.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { BookingSummaryBar } from '@/components/shared/BookingSummaryBar';

function renderBar(props: Partial<React.ComponentProps<typeof BookingSummaryBar>> = {}) {
  const onCta = jest.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{}}>
      <BookingSummaryBar
        total={925}
        totalLabel="Total"
        subline="1.5 h, 13:00 to 14:30"
        ctaLabel="Confirm booking"
        onCta={onCta}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { onCta };
}

describe('BookingSummaryBar', () => {
  test('renders the total formatted with a baht sign and thousands separator', () => {
    renderBar({ total: 1500 });
    expect(screen.getByText('฿1,500')).toBeInTheDocument();
  });

  test('renders the subline', () => {
    renderBar();
    expect(screen.getByText('1.5 h, 13:00 to 14:30')).toBeInTheDocument();
  });

  test('CTA is enabled even when the form is incomplete', async () => {
    const { onCta } = renderBar();
    const button = screen.getByRole('button', { name: 'Confirm booking' });

    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(onCta).toHaveBeenCalledTimes(1);
  });

  test('CTA is disabled only while loading, and does not fire', async () => {
    const { onCta } = renderBar({ ctaLoading: true });
    const button = screen.getByRole('button', { name: /Confirm booking/ });

    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onCta).not.toHaveBeenCalled();
  });

  test('shows the empty prompt instead of a zero total when total is 0', () => {
    renderBar({ total: 0, emptyPrompt: 'Choose a duration' });
    expect(screen.getByText('Choose a duration')).toBeInTheDocument();
    expect(screen.queryByText('฿0')).not.toBeInTheDocument();
  });

  test('shows a real ฿0 total when the price is genuinely zero', () => {
    renderBar({ total: 0, emptyPrompt: 'Choose a duration', isZeroValid: true });
    expect(screen.getByText('฿0')).toBeInTheDocument();
    expect(screen.queryByText('Choose a duration')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/booking-summary-bar.test.tsx`
Expected: FAIL, `Cannot find module '@/components/shared/BookingSummaryBar'`

- [ ] **Step 3: Write minimal implementation**

Create `components/shared/BookingSummaryBar.tsx`:

```tsx
'use client';

import { useFormatter } from 'next-intl';

interface BookingSummaryBarProps {
  /** Running total in THB. */
  total: number;
  /** Uppercase micro-label above the amount, e.g. "Total". */
  totalLabel: string;
  /** One-line detail under the amount, e.g. "1.5 h, 13:00 to 14:30". */
  subline?: string;
  /** Primary action label. */
  ctaLabel: string;
  /** Fires the step's primary action. Validation lives in the parent. */
  onCta: () => void;
  /** Spinner + disable, for a submit in flight. The ONLY reason to disable. */
  ctaLoading?: boolean;
  /** Shown instead of the amount when there is nothing priced yet. */
  emptyPrompt?: string;
  /**
   * Treat a total of 0 as a real price rather than "nothing chosen yet".
   * Needed because a fully-covered booking (package or free hours) legitimately
   * costs ฿0 and must not render as an empty prompt.
   */
  isZeroValid?: boolean;
}

/**
 * Persistent bottom action bar: running total left, primary action right.
 *
 * The button is ALWAYS tappable unless a submit is in flight. The parent
 * validates on tap and scrolls to the first incomplete field. Do not
 * reintroduce a disabled-for-validation state: a grey button that does not say
 * what is missing is the dead end this replaces.
 */
export function BookingSummaryBar({
  total,
  totalLabel,
  subline,
  ctaLabel,
  onCta,
  ctaLoading,
  emptyPrompt,
  isZeroValid,
}: BookingSummaryBarProps) {
  const format = useFormatter();
  const showTotal = isZeroValid || total > 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white shadow-[0_-2px_8px_rgba(0,0,0,0.08)]">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          {showTotal ? (
            <>
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                {totalLabel}
              </p>
              <p className="text-lg font-bold leading-tight text-green-700 tabular-nums">
                ฿{format.number(total)}
              </p>
              {subline && <p className="truncate text-[11px] text-gray-500">{subline}</p>}
            </>
          ) : (
            <p className="text-sm text-gray-400">{emptyPrompt}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onCta}
          disabled={ctaLoading}
          className="flex flex-shrink-0 items-center justify-center gap-2 rounded-xl bg-green-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-green-700 disabled:bg-green-400"
        >
          {ctaLoading && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          )}
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/booking-summary-bar.test.tsx`
Expected: PASS, 6 tests

If `@testing-library/react`, `@testing-library/jest-dom` or `@testing-library/user-event` are missing, install them first:

```bash
npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

Then confirm `jest.setup.js` contains `import '@testing-library/jest-dom'` (or the `require` form). Add it if absent.

- [ ] **Step 5: Commit**

```bash
git add components/shared/BookingSummaryBar.tsx __tests__/booking-summary-bar.test.tsx
git commit -m "feat(bookings): add shared BookingSummaryBar with always-tappable CTA"
```

### Task 4: Point course rental at the shared bar

**Files:**
- Modify: `components/course-rental/RentalPriceSummaryBar.tsx` (replace entire file body)

- [ ] **Step 1: Replace the file**

Replace the whole of `components/course-rental/RentalPriceSummaryBar.tsx` with:

```tsx
'use client';

import { useFormatter } from 'next-intl';
import { BookingSummaryBar } from '@/components/shared/BookingSummaryBar';

interface RentalPriceSummaryBarProps {
  rentalPrice: number;
  /** Savings vs paying all 1-day rates; 0 if no multi-day discount applies. */
  savings: number;
  /** Delivery fee in THB (0 if no delivery). Resolved by the parent. */
  deliveryFee: number;
  addOnsTotal: number;
  durationDays: number;
  /** 'set' | 'delivery' | 'contact' | 'review' */
  currentStep: string;
  ctaLabel: string;
  onCta: () => void;
  ctaLoading?: boolean;
  emptyPrompt?: string;
}

/**
 * Course-rental wrapper over the shared BookingSummaryBar. Keeps the
 * rental-specific subline (days, savings, delivery) here and the layout in one
 * shared place, so the bay flow and this flow cannot drift apart visually.
 */
export function RentalPriceSummaryBar({
  rentalPrice,
  savings,
  deliveryFee,
  addOnsTotal,
  durationDays,
  currentStep,
  ctaLabel,
  onCta,
  ctaLoading,
  emptyPrompt,
}: RentalPriceSummaryBarProps) {
  const format = useFormatter();

  const total = rentalPrice + deliveryFee + addOnsTotal;
  const isReview = currentStep === 'review';

  // Preserves the original behaviour exactly: the bar only shows a total once a
  // date range exists, so a priced-but-dateless state still shows the prompt.
  const hasTotal = total > 0 && durationDays > 0;

  const subline = isReview
    ? undefined
    : [
        `${durationDays}d`,
        savings > 0 ? `save ฿${format.number(savings)}` : null,
        deliveryFee > 0 ? `+฿${format.number(deliveryFee)} delivery` : null,
      ]
        .filter(Boolean)
        .join(' · ');

  return (
    <BookingSummaryBar
      total={hasTotal ? total : null}
      totalLabel="Total"
      subline={subline}
      ctaLabel={ctaLabel}
      onCta={onCta}
      ctaLoading={ctaLoading}
      emptyPrompt={emptyPrompt}
    />
  );
}
```

> **API note (added after code review of Task 3).** The component's contract changed
> during review: `isZeroValid?: boolean` was dropped in favour of
> `total: number | null`, where `null` means "nothing priced yet" and any number
> including `0` is a real price. This closed a silent-content bug where a
> package-covered ฿0 booking would have rendered the empty prompt. The component
> also exports `BOOKING_SUMMARY_BAR_SPACER` so both consumers use the same bottom
> padding.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors. The props interface is unchanged, so `app/[locale]/course-rental/page.tsx` needs no edit.

- [ ] **Step 3: Verify course rental still looks right**

Run `npm run dev`, open `http://localhost:3000/course-rental`, pick a date range and a set. Confirm the bottom bar shows a total, the `2d · save ฿…` style subline, and that the CTA advances the step. On the review step confirm the subline disappears.

- [ ] **Step 4: Commit**

```bash
git add components/course-rental/RentalPriceSummaryBar.tsx
git commit -m "refactor(course-rental): render summary bar via shared BookingSummaryBar"
```

### Task 5: Add the i18n keys

**Files:**
- Modify: `messages/en.json`, `messages/th.json`, `messages/ko.json`, `messages/ja.json`, `messages/zh.json`

- [ ] **Step 1: Find the namespace**

Run: `node -e "const m=require('./messages/en.json'); console.log(Object.keys(m.bookings))"`
Expected: a list including `detailsStep`. Add the keys below inside `bookings.detailsStep` in every locale file.

- [ ] **Step 2: Add to `messages/en.json`**

Inside `bookings.detailsStep`, add:

```json
"summaryTotalLabel": "Total",
"summaryEmptyPrompt": "Choose a duration to see your total",
"errorNeedName": "We need your name to hold the booking.",
"errorNeedPhone": "Please enter a valid phone number.",
"errorNeedEmail": "We need an email to send your confirmation."
```

- [ ] **Step 3: Add to `messages/th.json`**

```json
"summaryTotalLabel": "ยอดรวม",
"summaryEmptyPrompt": "เลือกระยะเวลาเพื่อดูยอดรวม",
"errorNeedName": "กรุณากรอกชื่อเพื่อยืนยันการจอง",
"errorNeedPhone": "กรุณากรอกเบอร์โทรศัพท์ที่ถูกต้อง",
"errorNeedEmail": "กรุณากรอกอีเมลเพื่อรับการยืนยันการจอง"
```

- [ ] **Step 4: Add to `messages/ja.json`**

```json
"summaryTotalLabel": "合計",
"summaryEmptyPrompt": "利用時間を選ぶと合計が表示されます",
"errorNeedName": "予約のためお名前をご入力ください。",
"errorNeedPhone": "有効な電話番号をご入力ください。",
"errorNeedEmail": "確認メールをお送りするためメールアドレスが必要です。"
```

- [ ] **Step 5: Add to `messages/ko.json`**

```json
"summaryTotalLabel": "합계",
"summaryEmptyPrompt": "이용 시간을 선택하면 합계가 표시됩니다",
"errorNeedName": "예약을 위해 이름을 입력해 주세요.",
"errorNeedPhone": "올바른 전화번호를 입력해 주세요.",
"errorNeedEmail": "예약 확인 메일을 보내려면 이메일이 필요합니다."
```

- [ ] **Step 6: Add to `messages/zh.json`**

```json
"summaryTotalLabel": "合计",
"summaryEmptyPrompt": "选择时长后显示合计",
"errorNeedName": "请填写姓名以保留预订。",
"errorNeedPhone": "请填写有效的电话号码。",
"errorNeedEmail": "需要邮箱地址以便发送确认邮件。"
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors. `types/messages.d.ts` types the catalog shape from `en.json`, so a key missing from another locale is a TS error. If one fails, the key is missing or misplaced in that file.

- [ ] **Step 8: Commit**

```bash
git add messages/
git commit -m "i18n(bookings): add summary-bar and field-error keys for 5 locales"
```

### Task 6: Wire the bar and jump-to-error into BookingDetails

**Files:**
- Modify: `app/[locale]/(features)/bookings/components/booking/steps/BookingDetails.tsx`

Reference: the pattern being ported is `firstInvalidField()` and `handlePrimaryCta()` at `app/[locale]/course-rental/page.tsx:519-550`.

- [ ] **Step 1: Add the import**

Add to the import block at the top of `BookingDetails.tsx`:

```typescript
import { BookingSummaryBar } from '@/components/shared/BookingSummaryBar';
```

- [ ] **Step 2: Add the error-field state**

Next to the existing `const [errors, setErrors] = useState(...)` declaration (around line 183), add:

```typescript
  // Which required field the sticky CTA flagged as incomplete. Drives the
  // scroll + highlight. Mirrors the course-rental pattern.
  const [errorField, setErrorField] = useState<string | null>(null);
```

- [ ] **Step 3: Add the validation and CTA handlers**

Insert immediately before the `return (` of the component body:

```typescript
  // Returns the id of the first incomplete required field, or null if valid.
  // Order matters: it is the order the customer reads the form in.
  const firstInvalidField = (): string | null => {
    if (!name.trim()) return 'bd-name';
    if (!phoneNumber || !isValidPhoneNumber(phoneNumber)) return 'bd-phone';
    if (!email.trim()) return 'bd-email';
    if (!selectedBayType && !selectedBay) return 'bd-bay';
    return null;
  };

  // Sticky-bar primary action: validate, then submit or scroll to + focus the
  // first incomplete field. Never a silently disabled button.
  const handlePrimaryCta = () => {
    const bad = firstInvalidField();
    if (bad) {
      setErrorField(bad);
      const el = document.getElementById(bad);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const input = el.querySelector('input, textarea, select') as HTMLElement | null;
        window.setTimeout(() => input?.focus({ preventScroll: true }), 350);
      }
      return;
    }
    setErrorField(null);
    void handleSubmit();
  };
```

- [ ] **Step 4: Make handleSubmit callable without an event**

`handleSubmit` is currently the form's `onSubmit` handler and takes a `FormEvent`. Change its signature so the sticky bar can call it directly. Find its declaration and change:

```typescript
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
```

to:

```typescript
  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
```

Leave the rest of the function untouched. The `<form onSubmit={handleSubmit}>` binding keeps working because the event is now optional.

- [ ] **Step 5: Add the anchor ids and error highlights**

In the contact section (around lines 1290-1370), wrap each field in an element carrying the id the validator returns, and surface the message. Replace the name field block with:

```tsx
            {/* Name field */}
            <div id="bd-name" className="scroll-mt-24">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('name')}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); if (errorField === 'bd-name') setErrorField(null); }}
                className={`w-full h-12 px-4 rounded-lg bg-gray-50 focus:outline-none border focus:border-green-500 focus:ring-1 focus:ring-green-500 ${
                  errorField === 'bd-name' ? 'border-amber-500 bg-amber-50' : !name ? 'border-red-100' : 'border-green-500'
                }`}
                placeholder={t('namePlaceholder')}
              />
              {errorField === 'bd-name' && (
                <p className="mt-1 text-sm font-medium text-amber-600">{t('errorNeedName')}</p>
              )}
            </div>
```

Add `id="bd-phone" className="scroll-mt-24"` to the wrapping `<div>` of the phone field and `id="bd-email" className="scroll-mt-24"` to the wrapping `<div>` of the email field, and add the matching message blocks:

```tsx
              {errorField === 'bd-phone' && (
                <p className="mt-1 text-sm font-medium text-amber-600">{t('errorNeedPhone')}</p>
              )}
```

```tsx
              {errorField === 'bd-email' && (
                <p className="mt-1 text-sm font-medium text-amber-600">{t('errorNeedEmail')}</p>
              )}
```

Add `id="bd-bay" className="scroll-mt-24"` to the wrapping element of the bay-type selector.

- [ ] **Step 6: Replace the submit-button block with the sticky bar**

Replace the `{/* Submit Button */}` block (lines 1400-1431, the `<div className="flex space-x-3 justify-end mt-6">` and both buttons) with a Back-only row:

```tsx
        {/* Back only. The primary action lives in the sticky bar so it is
            always reachable without scrolling past the whole form. */}
        <div className="flex justify-start mt-6">
          <button
            type="button"
            onClick={onBack}
            className="py-2 px-4 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            disabled={isSubmitting}
          >
            {t('back')}
          </button>
        </div>
```

Then, immediately after the closing `</form>` tag, add:

```tsx
      <BookingSummaryBar
        total={costBreakdown ? costBreakdown.estimatedTotal : null}
        totalLabel={t('summaryTotalLabel')}
        subline={`${duration} hr · ${selectedTime}`}
        ctaLabel={isSubmitting ? t('processing') : t('confirmBooking')}
        onCta={handlePrimaryCta}
        ctaLoading={isSubmitting}
        emptyPrompt={t('summaryEmptyPrompt')}
      />
```

- [ ] **Step 7: Add bottom padding so the bar cannot cover the form**

Import `BOOKING_SUMMARY_BAR_SPACER` from `@/components/shared/BookingSummaryBar` and add it to the className of the outermost wrapper element returned by `BookingDetails`. Use the exported constant rather than a literal `pb-28`, so this consumer and the course-rental one cannot drift apart. Without this the bar overlaps the last field on mobile.

Note the bar also lifts the chat FAB while mounted, via a `has-summary-bar` body class and a rule in `app/globals.css`. That matters here because the English bay flow renders at `/`, which is one of the paths where the chat widget shows itself. Verify the FAB clearance visually in step 9; the `6rem` offset was estimated from the bar's classes, not measured against a real consumer.

- [ ] **Step 8: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass. The build is required here, not optional: it catches Server Component and webpack errors that typecheck and lint miss.

If the build fails with `Module not found: ../node_modules/next/dist/...` or `supabaseUrl is required`, this worktree needs its `node_modules` junction and `.env.local`. Create the junction from the parent checkout and copy `.env.local` in, then re-run.

- [ ] **Step 9: Verify in the browser**

Run `npm run dev`, go to `http://localhost:3000/bookings`, pick a date and a time to reach step 3. Then check each of these:

1. The sticky bar is visible at the bottom without scrolling, showing a total.
2. With the name empty, tap the CTA. The page scrolls to the name field, the field turns amber, the message appears, and the input takes focus.
3. Type a name. The amber state clears as you type.
4. Fill everything. Tap the CTA. The booking submits.
5. Change the duration. The total in the bar updates.
6. Confirm the bar does not cover the notes field at the bottom of the form.

- [ ] **Step 10: Commit**

```bash
git add "app/[locale]/(features)/bookings/components/booking/steps/BookingDetails.tsx"
git commit -m "feat(bookings): sticky summary bar and jump-to-error on booking details"
```

---

## Slice 3: Half-Hour Durations

### Task 7: Allowed-duration ladder module

**Files:**
- Create: `lib/booking-durations.ts`
- Test: `__tests__/booking-durations.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/booking-durations.test.ts`:

```typescript
/**
 * The allowed-duration ladder. Owner-confirmed 25 Jul 2026:
 *   1, 1.5, 2, 2.5, 3 for everyone; 4 and 5 only with an active package.
 *   3.5 and 4.5 are deliberately absent: in the 180 days to 25 Jul 2026 they
 *   accounted for 3 paid bay-rate bookings between them, and roughly half of
 *   their volume was staff bay blocks created in the POS.
 * This module is the single source of truth so the SQL ladder and the UI
 * picker cannot drift apart.
 */
import {
  ALL_DURATIONS,
  BASE_DURATIONS,
  allowedDurations,
  formatDurationLabel,
} from '@/lib/booking-durations';

describe('the ladder constants', () => {
  test('base ladder is half-hour steps from 1 to 3', () => {
    expect(BASE_DURATIONS).toEqual([1, 1.5, 2, 2.5, 3]);
  });

  test('full ladder adds only whole 4 and 5, never 3.5 or 4.5', () => {
    expect(ALL_DURATIONS).toEqual([1, 1.5, 2, 2.5, 3, 4, 5]);
    expect(ALL_DURATIONS).not.toContain(3.5);
    expect(ALL_DURATIONS).not.toContain(4.5);
  });
});

describe('allowedDurations', () => {
  test('a bay-rate customer with plenty of headroom still stops at 3', () => {
    expect(allowedDurations({ maxHours: 5, hasActivePackage: false })).toEqual([1, 1.5, 2, 2.5, 3]);
  });

  test('a package holder with headroom gets 4 and 5', () => {
    expect(allowedDurations({ maxHours: 5, hasActivePackage: true })).toEqual([1, 1.5, 2, 2.5, 3, 4, 5]);
  });

  test('never offers more than the slot allows', () => {
    expect(allowedDurations({ maxHours: 2, hasActivePackage: true })).toEqual([1, 1.5, 2]);
    expect(allowedDurations({ maxHours: 1.5, hasActivePackage: false })).toEqual([1, 1.5]);
  });

  test('a package holder capped at 3.5 by the slot does not see 3.5', () => {
    expect(allowedDurations({ maxHours: 3.5, hasActivePackage: true })).toEqual([1, 1.5, 2, 2.5, 3]);
  });

  test('always offers at least 1 hour, which is the minimum booking', () => {
    expect(allowedDurations({ maxHours: 1, hasActivePackage: false })).toEqual([1]);
    expect(allowedDurations({ maxHours: 0, hasActivePackage: false })).toEqual([1]);
  });
});

describe('formatDurationLabel', () => {
  test('renders whole hours without a decimal and halves with one', () => {
    expect(formatDurationLabel(1)).toBe('1');
    expect(formatDurationLabel(1.5)).toBe('1.5');
    expect(formatDurationLabel(3)).toBe('3');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/booking-durations.test.ts`
Expected: FAIL, `Cannot find module '@/lib/booking-durations'`

- [ ] **Step 3: Write minimal implementation**

Create `lib/booking-durations.ts`:

```typescript
/**
 * Bookable session lengths, in hours.
 *
 * Owner-confirmed 25 Jul 2026. Half-hour steps run from the 1-hour minimum to
 * 3 hours for everyone. 4 and 5 hours are offered only to customers with an
 * active package, because in the 180 days to 25 Jul 2026 not one 4-hour-or-
 * longer booking was paid at the walk-up bay rate: all 46 were package holders
 * (Diamond+ Unlimited or Early Bird) coming through the customer flow.
 *
 * 3.5 and 4.5 are deliberately absent. Between them they accounted for three
 * paid bay-rate bookings in the same period, and roughly half their volume was
 * staff bay blocks created in the POS, which this ladder does not affect.
 *
 * Keep this in step with the ladder in
 * supabase/migrations/*_available_slots_v3_half_hour_durations.sql. The SQL
 * probes availability for these same values.
 */

/** Offered to every customer. */
export const BASE_DURATIONS = [1, 1.5, 2, 2.5, 3] as const;

/** Offered additionally to customers with an active package. */
export const PACKAGE_ONLY_DURATIONS = [4, 5] as const;

/** Every value the availability function probes. */
export const ALL_DURATIONS: number[] = [...BASE_DURATIONS, ...PACKAGE_ONLY_DURATIONS];

/** The minimum booking length. Enforced in SQL by the remaining_minutes < 60 skip. */
export const MIN_DURATION = 1;

interface AllowedDurationsInput {
  /** Longest bookable session at this slot, from the availability function. */
  maxHours: number;
  /** True when the customer has a non-coaching package with hours remaining. */
  hasActivePackage: boolean;
}

/**
 * The durations to render for this customer at this slot. Always returns at
 * least [1] so the picker is never empty; a slot that cannot fit an hour is
 * filtered out upstream and never reaches step 3.
 */
export function allowedDurations({ maxHours, hasActivePackage }: AllowedDurationsInput): number[] {
  const ladder = hasActivePackage ? ALL_DURATIONS : [...BASE_DURATIONS];
  const fits = ladder.filter((h) => h <= maxHours);
  return fits.length > 0 ? fits : [MIN_DURATION];
}

/** Tile label: "1", "1.5", "3". No unit; the group carries the unit. */
export function formatDurationLabel(hours: number): string {
  return String(hours);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/booking-durations.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add lib/booking-durations.ts __tests__/booking-durations.test.ts
git commit -m "feat(bookings): add allowed-duration ladder with package gating"
```

### Task 8: Availability function v3

**Files:**
- Create: `supabase/migrations/20260725120000_available_slots_v3_half_hour_durations.sql`

> **Do not apply this to production without review.** It creates a new function
> rather than replacing `_v2`, so `_v2` keeps serving until Task 9 switches the
> route. That is what makes this step reversible.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260725120000_available_slots_v3_half_hour_durations.sql`:

```sql
-- get_available_slots_with_max_hours_v3
--
-- Differences from _v2:
--   1. Duration probing steps by 30 minutes over an explicit ladder
--      (1, 1.5, 2, 2.5, 3, 4, 5) instead of the integer loop 1..5. 3.5 and 4.5
--      are deliberately absent; see lib/booking-durations.ts for the rationale.
--   2. max_hours is numeric, not integer, so a slot that fits 2.5 hours reports
--      2.5. bay_availability_by_duration keys become '1', '1.5', '2', ...
--      which (1.5).toString() in the client matches exactly.
--   3. Same-day lead time rounds up to the next HALF hour instead of the next
--      full hour, so at 14:10 the 14:30 slot is offered rather than discarded.
--
-- _v2 is left in place. app/api/availability/route.ts switches over separately
-- so this migration can land without changing behaviour.
CREATE OR REPLACE FUNCTION public.get_available_slots_with_max_hours_v3(
    p_date date,
    p_current_time_bangkok timestamp with time zone DEFAULT NULL::timestamp with time zone,
    p_start_hour integer DEFAULT 10,
    p_end_hour integer DEFAULT 23
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    -- The allowed-duration ladder. Keep in step with lib/booking-durations.ts.
    duration_ladder numeric[] := ARRAY[1, 1.5, 2, 2.5, 3, 4, 5];
    slot_time text;
    slot_total_minutes integer;
    slot_hour_part integer;
    slot_min_part integer;
    remaining_minutes integer;
    max_hours numeric;
    period text;
    slots jsonb := '[]';
    current_total_minutes integer;
    is_today boolean;
    start_minutes_adjusted integer;
    check_duration numeric;
    bay_available_count integer;
    social_bay_count integer;
    ai_lab_count integer;
    available_bays text[] := ARRAY[]::text[];
    optimal_social_bay_count integer;
    optimal_ai_lab_count integer;
    optimal_available_bays text[] := ARRAY[]::text[];
    duration_breakdown jsonb;
    end_total_minutes integer;
BEGIN
    -- Same-day lead time: round the current time UP to the next half hour,
    -- rather than to the next full hour as _v2 did.
    IF p_current_time_bangkok IS NOT NULL THEN
        current_total_minutes :=
            EXTRACT(hour FROM p_current_time_bangkok AT TIME ZONE 'Asia/Bangkok')::integer * 60
          + EXTRACT(minute FROM p_current_time_bangkok AT TIME ZONE 'Asia/Bangkok')::integer;
        is_today := DATE(p_current_time_bangkok AT TIME ZONE 'Asia/Bangkok') = p_date;
        start_minutes_adjusted := CASE
            WHEN is_today THEN GREATEST(p_start_hour * 60, ceil(current_total_minutes / 30.0)::integer * 30)
            ELSE p_start_hour * 60
        END;
    ELSE
        start_minutes_adjusted := p_start_hour * 60;
    END IF;

    slot_total_minutes := start_minutes_adjusted;

    WHILE slot_total_minutes < (p_end_hour * 60) LOOP
        slot_hour_part := slot_total_minutes / 60;
        slot_min_part := slot_total_minutes % 60;
        slot_time := lpad(slot_hour_part::text, 2, '0') || ':' || lpad(slot_min_part::text, 2, '0');

        remaining_minutes := (p_end_hour * 60) - slot_total_minutes;

        -- Minimum booking is 1 hour. This skip IS that rule.
        IF remaining_minutes < 60 THEN
            slot_total_minutes := slot_total_minutes + 30;
            CONTINUE;
        END IF;

        max_hours := 0;
        optimal_social_bay_count := 0;
        optimal_ai_lab_count := 0;
        optimal_available_bays := ARRAY[]::text[];
        duration_breakdown := '{}'::jsonb;

        FOREACH check_duration IN ARRAY duration_ladder LOOP
            -- Stop once the ladder exceeds what is left before closing.
            EXIT WHEN check_duration * 60 > remaining_minutes;

            bay_available_count := 0;
            social_bay_count := 0;
            ai_lab_count := 0;
            available_bays := ARRAY[]::text[];

            IF check_availability(p_date, 'Bay 1', slot_time, check_duration::real) THEN
                bay_available_count := bay_available_count + 1;
                social_bay_count := social_bay_count + 1;
                available_bays := array_append(available_bays, 'Bay 1');
            END IF;

            IF check_availability(p_date, 'Bay 2', slot_time, check_duration::real) THEN
                bay_available_count := bay_available_count + 1;
                social_bay_count := social_bay_count + 1;
                available_bays := array_append(available_bays, 'Bay 2');
            END IF;

            IF check_availability(p_date, 'Bay 3', slot_time, check_duration::real) THEN
                bay_available_count := bay_available_count + 1;
                social_bay_count := social_bay_count + 1;
                available_bays := array_append(available_bays, 'Bay 3');
            END IF;

            IF check_availability(p_date, 'Bay 4', slot_time, check_duration::real) THEN
                bay_available_count := bay_available_count + 1;
                ai_lab_count := ai_lab_count + 1;
                available_bays := array_append(available_bays, 'Bay 4');
            END IF;

            IF bay_available_count > 0 THEN
                max_hours := check_duration;

                -- Key format must match (1.5).toString() on the client, i.e.
                -- '1.5' not '1.50'. trim_scale strips the trailing zeros.
                duration_breakdown := duration_breakdown || jsonb_build_object(
                    trim_scale(check_duration)::text,
                    jsonb_build_object(
                        'social', social_bay_count,
                        'ai', ai_lab_count,
                        'total', bay_available_count,
                        'bays', available_bays
                    )
                );

                IF check_duration = 1 OR optimal_social_bay_count + optimal_ai_lab_count = 0 THEN
                    optimal_social_bay_count := social_bay_count;
                    optimal_ai_lab_count := ai_lab_count;
                    optimal_available_bays := available_bays;
                END IF;
            ELSE
                -- First unavailable rung ends the ladder for this slot.
                EXIT;
            END IF;
        END LOOP;

        IF max_hours > 0 THEN
            period := CASE
                WHEN slot_hour_part < 12 THEN 'morning'
                WHEN slot_hour_part < 17 THEN 'afternoon'
                ELSE 'evening'
            END;

            end_total_minutes := slot_total_minutes + (max_hours * 60)::integer;

            slots := slots || jsonb_build_object(
                'startTime', slot_time,
                'endTime', lpad((end_total_minutes / 60)::text, 2, '0') || ':' || lpad((end_total_minutes % 60)::text, 2, '0'),
                'maxHours', trim_scale(max_hours),
                'period', period,
                'availableBays', optimal_available_bays,
                'socialBayCount', optimal_social_bay_count,
                'aiLabCount', optimal_ai_lab_count,
                'totalBayCount', optimal_social_bay_count + optimal_ai_lab_count,
                'bayAvailabilityByDuration', duration_breakdown
            );
        END IF;

        slot_total_minutes := slot_total_minutes + 30;
    END LOOP;

    RETURN slots;
END;
$function$;
```

- [ ] **Step 2: Apply to a Supabase development branch, not production**

Create a branch, apply there, and verify before touching production. Ask the user to confirm before any production apply.

- [ ] **Step 3: Verify the shape against v2**

Run this against the branch and compare:

```sql
SELECT jsonb_pretty(public.get_available_slots_with_max_hours_v3(
  (current_date + 1)::date, now(), 9, 23
) -> 0);
```

Expected: `maxHours` is a bare number with no trailing zeros (`2.5`, not `2.50`), `bayAvailabilityByDuration` has keys drawn from `1, 1.5, 2, 2.5, 3, 4, 5` only, and `startTime` values step by 30 minutes.

Then confirm no key is ever `3.5` or `4.5`:

```sql
SELECT DISTINCT k
FROM jsonb_array_elements(
       public.get_available_slots_with_max_hours_v3((current_date + 1)::date, now(), 9, 23)
     ) AS s,
     jsonb_object_keys(s -> 'bayAvailabilityByDuration') AS k
ORDER BY k;
```

Expected: only `1, 1.5, 2, 2.5, 3, 4, 5`.

- [ ] **Step 4: Check the timing did not regress badly**

```sql
EXPLAIN (ANALYZE, TIMING OFF, SUMMARY ON)
SELECT public.get_available_slots_with_max_hours_v3((current_date + 1)::date, now(), 9, 23);
```

Expected: under 150 ms. The `_v2` baseline is 52 ms and the ladder probes 7 rungs instead of 5, so roughly 75 ms is the expectation. If it exceeds 150 ms, stop and reconsider before switching the route: the fallback is to compute each bay's contiguous free minutes once per slot rather than probing each rung.

- [ ] **Step 5: Verify the half-hour lead-time fix**

```sql
SELECT public.get_available_slots_with_max_hours_v3(
  current_date,
  (current_date + time '14:10') AT TIME ZONE 'Asia/Bangkok',
  9, 23
) -> 0 -> 'startTime';
```

Expected: `"14:30"`. Under `_v2` the same call returns `"15:00"`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260725120000_available_slots_v3_half_hour_durations.sql
git commit -m "feat(availability): add v3 slots function with half-hour duration ladder"
```

### Task 9: Point the availability route at v3

**Files:**
- Modify: `app/api/availability/route.ts:46`
- Modify: `app/[locale]/(features)/bookings/hooks/useAvailability.ts:18`

- [ ] **Step 1: Switch the RPC name**

In `app/api/availability/route.ts`, change line 46 from:

```typescript
    const { data: slots, error } = await supabase.rpc('get_available_slots_with_max_hours_v2', {
```

to:

```typescript
    const { data: slots, error } = await supabase.rpc('get_available_slots_with_max_hours_v3', {
```

And update the comment above it on line 43 from `(v2 adds half-hour start times)` to:

```typescript
    // 3. Use native database function to fetch availability. v3 adds half-hour
    //    DURATIONS (v2 already had half-hour start times) and rounds the
    //    same-day lead time to the next half hour.
```

- [ ] **Step 2: Widen the maxHours type**

In `app/[locale]/(features)/bookings/hooks/useAvailability.ts`, the `TimeSlot` interface on line 18 already declares `maxHours: number`, which accepts fractions. Add a clarifying comment so nobody narrows it later:

```typescript
  /** Longest bookable session at this slot, in hours. Fractional since v3 (e.g. 2.5). */
  maxHours: number;
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Verify the API response**

Run `npm run dev`. Log in, then in the browser console on `/bookings`:

```javascript
await (await fetch('/api/availability', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    date: new Date(Date.now() + 864e5).toISOString().slice(0, 10),
    currentTimeInBangkok: new Date().toISOString(),
  }),
})).json()
```

Expected: `slots` is a non-empty array, at least one entry has a fractional `maxHours`, and `bayAvailabilityByDuration` keys include `"1.5"`.

- [ ] **Step 5: Commit**

```bash
git add app/api/availability/route.ts "app/[locale]/(features)/bookings/hooks/useAvailability.ts"
git commit -m "feat(availability): serve v3 slots with fractional maxHours"
```

### Task 10: Rebuild the duration picker from the ladder

**Files:**
- Modify: `app/[locale]/(features)/bookings/components/booking/steps/BookingDetails.tsx:996-1016`

- [ ] **Step 1: Add the import**

Add to the import block:

```typescript
import { allowedDurations, formatDurationLabel } from '@/lib/booking-durations';
```

- [ ] **Step 2: Derive the ladder**

Next to the existing `const currentAvailability = getBayAvailabilityForDuration(duration);` (around line 284), add:

```typescript
  // The rungs this customer can pick at this slot. hasActivePackage unlocks the
  // 4 h and 5 h rungs; see lib/booking-durations.ts for why.
  const durationOptions = allowedDurations({ maxHours: maxDuration, hasActivePackage });
```

- [ ] **Step 3: Clamp the selected duration when the ladder shrinks**

Immediately after the line above, add:

```typescript
  // If the ladder no longer contains the selected duration (slot changed, or a
  // package expired mid-session), fall back to the longest rung that still
  // fits. Without this the form can hold a duration the server will reject.
  useEffect(() => {
    if (!durationOptions.includes(duration)) {
      setDuration(durationOptions[durationOptions.length - 1]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxDuration, hasActivePackage]);
```

- [ ] **Step 4: Replace the grid**

Replace lines 1001-1016 (the `<div className="grid grid-cols-5 gap-2">` block containing the `Array.from({ length: maxDuration }, (_, i) => i + 1)` map, up to and including the `errors.duration` paragraph) with:

```tsx
            <div className="grid grid-cols-5 gap-2">
              {durationOptions.map((hours) => (
                <button
                  key={hours}
                  type="button"
                  onClick={() => setDuration(hours)}
                  className={`flex h-12 items-center justify-center rounded-lg border relative tabular-nums ${
                    duration === hours
                      ? 'border-green-600 bg-green-50 text-green-600 font-medium'
                      : 'border-gray-300 text-gray-700 hover:border-green-600'
                  }`}
                >
                  {formatDurationLabel(hours)}
                </button>
              ))}
            </div>
            {errors.duration && (
              <p className="mt-1 text-sm text-red-600">{errors.duration}</p>
            )}
```

- [ ] **Step 5: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all pass. `__tests__/cost-calculator.test.ts` matters most here, because it locks in the proration this ladder now exercises with fractional durations.

- [ ] **Step 7: Verify in the browser**

Run `npm run dev` and check each of these on `/bookings`:

1. As a customer with no package, step 3 shows exactly `1, 1.5, 2, 2.5, 3` when the slot allows it, and never 3.5 or 4.5.
2. Pick 1.5. The cost breakdown shows a prorated bay rate, and for a 13:00 weekday start the total is ฿925 (1 h at ฿550 plus 0.5 h at ฿750).
3. The sticky bar total from slice 2 updates to match.
4. Pick a late slot where only 1 hour fits. The picker shows only `1`.
5. Submit a 1.5 hour booking. Confirm it succeeds and the confirmation shows 1.5 hours.
6. Check the booking row: `SELECT duration FROM bookings ORDER BY created_at DESC LIMIT 1;` returns `1.5`.

- [ ] **Step 8: Commit**

```bash
git add "app/[locale]/(features)/bookings/components/booking/steps/BookingDetails.tsx"
git commit -m "feat(bookings): half-hour duration picker with package-gated 4h and 5h"
```

### Task 11: Retire v2

**Files:**
- Create: `supabase/migrations/20260725130000_drop_available_slots_v2.sql`

Do this only after v3 has been live in production for long enough to trust, and only with the user's explicit go-ahead. It is listed here so the cleanup is not forgotten, not so it ships with the rest.

- [ ] **Step 1: Confirm nothing still calls v2**

Run: `grep -rn "get_available_slots_with_max_hours_v2" --include=*.ts --include=*.tsx --include=*.sql . | grep -v node_modules`
Expected: only the original migration file. Check the `lengolf-forms` repo too, since it shares this database.

- [ ] **Step 2: Write the migration**

```sql
-- v3 has superseded v2 (half-hour durations, half-hour same-day lead time).
-- Verified no caller remains in lengolf-booking-new or lengolf-forms.
DROP FUNCTION IF EXISTS public.get_available_slots_with_max_hours_v2(date, timestamp with time zone, integer, integer);
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260725130000_drop_available_slots_v2.sql
git commit -m "chore(availability): drop superseded v2 slots function"
```

---

## Out of Scope

Named explicitly so they are not drifted into:

- **Splitting step 3 into sub-steps** and the desktop summary rail. Slice 8 in the agreed plan.
- **Folding contact details to a read-only identity card.** Part of the step-3 split, and it carries a behaviour change (edits stop silently overwriting `profiles`) that deserves its own PR.
- **Any promotions change.** Adding a second `auto_apply` row before the best-single-offer fix causes two `bogo` promotions to both apply. See `lib/cost-calculator.ts:483`.
- **Food set cards**, package hours in the flow, time-step tabs, and the free-hours balance surface.

## Definition of Done

- [ ] `npm run typecheck`, `npm run lint`, `npm run build` and `npm test` all pass.
- [ ] `bay_booking_step_viewed` fires once per step entry with `step`, `step_index` and `total_steps`.
- [ ] On step 3 the total and the primary CTA are both visible without scrolling.
- [ ] Tapping the CTA with an incomplete form scrolls to, highlights and focuses the first bad field. No disabled-for-validation button remains.
- [ ] Course rental still renders its bar correctly through the shared component.
- [ ] A bay-rate customer sees `1, 1.5, 2, 2.5, 3`; a package holder also sees `4, 5`; nobody sees `3.5` or `4.5`.
- [ ] A 1.5 hour booking can be created end to end and stores `duration = 1.5`.
- [ ] At 14:10 the earliest same-day slot offered is 14:30.
- [ ] The v3 function runs in under 150 ms.
